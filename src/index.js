/**
 * leaflet-mass-markers
 *
 * Render a very large number of labeled markers on a single <canvas> instead of
 * creating one DOM `L.marker` per item.
 *
 * Why: every `L.marker` is an absolutely positioned DOM element. During pan and
 * zoom animations Leaflet writes a `transform` to each of them, which is O(n)
 * per frame, and every `<img>` becomes its own compositing layer. A few hundred
 * DOM markers already stutter; a few thousand are unusable.
 *
 * How this layer works:
 *  1. All items are painted onto one canvas, so the whole dataset is a single
 *     DOM node.
 *  2. The canvas lives in the overlay pane. Dragging moves it with the map pane
 *     on the GPU: no re-projection, no repaint.
 *  3. During the zoom animation the canvas follows with a CSS transform using
 *     the same maths as Leaflet's own canvas renderer.
 *  4. Coordinates are produced by Leaflet's own `latLngToContainerPoint()`, so
 *     the layer is CRS-agnostic. They are recomputed in batch only when the view
 *     settles (`moveend` / `zoomend` / `resize`) and stored in typed arrays.
 *     Drawing and hit testing read that very same array, therefore what you see
 *     is always what you can click.
 *  5. Only items inside the viewport are drawn; labels are de-overlapped with a
 *     grid cull.
 *  6. Per-item `minZoom` and per-group visibility are plain data checks, so
 *     filtering never touches the DOM.
 *  7. The canvas is `pointer-events: none`; mouse events are listened to on the
 *     map, so dragging, scrolling and clicks on other layers keep working.
 *
 * @license MIT
 */

import L from 'leaflet'

export const VERSION = '1.0.0'

// Single group key used when `getGroup` is not configured.
const DEFAULT_GROUP = '*'

const TAU = Math.PI * 2

// Default options. Everything can be overridden per instance.
const DEFAULTS = {
    // Extra canvas size beyond the map container, as a ratio of container size.
    // Keeps the edges covered while dragging, before `moveend` re-aligns.
    padding: 0.25,
    // Items drawn slightly outside the canvas are still processed, so that
    // icons overlapping the border are not cut off abruptly.
    drawMargin: 30,
    // Extra pixels around an icon that still count as a hit.
    hitTolerance: 2,
    // Cursor applied to the map container while hovering an item.
    cursor: 'pointer',
    // Delay before the hover popup opens / after the pointer leaves before it
    // closes. Matches the usual DOM-marker behaviour.
    hoverDelay: 200,
    leaveDelay: 300,
    // Pane the canvas is appended to.
    pane: 'overlayPane',

    // Fallback appearance for items without an icon.
    pointRadius: 6,
    pointStyle: {
        fill: '#2d57f7',
        stroke: '#ffffff',
        lineWidth: 2
    },

    // Label appearance and de-overlap behaviour.
    label: {
        font: '11px "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
        fill: '#ffffff',
        stroke: 'rgba(0, 0, 0, 0.65)',
        lineWidth: 3,
        offsetX: 0,
        offsetY: 12,
        align: 'center',
        // 0 disables truncation.
        maxChars: 0,
        ellipsis: '\u2026',
        // Hide labels below this zoom. 0 means always show.
        minZoom: 0,
        // Grid cell used to drop overlapping labels. 0 disables the cull.
        cellSize: 28
    },

    // Options for the single shared popup instance.
    popupOptions: {
        maxWidth: 350,
        minWidth: 200,
        offset: [0, -10],
        autoPan: true,
        className: 'leaflet-mass-markers-popup'
    }
}

// ==================== Module-level icon cache ====================
// Shared by every layer instance: one URL is decoded exactly once.

const imageCache = new Map()     // url -> {img, loaded}
const iconTable = []             // resolved icon descriptors
const iconIndexByKey = new Map() // descriptor key -> index in iconTable
const iconReadyListeners = new Set()

function notifyIconReady() {
    iconReadyListeners.forEach((fn) => {
        try {
            fn()
        } catch (err) {
            // A broken listener must not stop the others.
            console.error('[leaflet-mass-markers] icon-ready listener failed:', err)
        }
    })
}

/**
 * Get (or create) the cached Image for a URL.
 * @param {string} url
 * @returns {{img: HTMLImageElement, loaded: boolean}|null}
 */
function getCachedImage(url) {
    if (!url || typeof url !== 'string') return null

    let entry = imageCache.get(url)
    if (entry) return entry

    const img = new Image()
    entry = {img, loaded: false}
    imageCache.set(url, entry)

    img.addEventListener('load', () => {
        entry.loaded = true
        // Resolve intrinsic size for descriptors that did not specify one.
        iconTable.forEach((descriptor) => {
            if (descriptor.url === url) finalizeIconDescriptor(descriptor)
        })
        notifyIconReady()
    })
    img.addEventListener('error', () => {
        entry.loaded = false
    })
    img.src = url

    return entry
}

/**
 * Fill in width / height / anchor from the decoded image when not specified.
 * @param {Object} descriptor
 */
function finalizeIconDescriptor(descriptor) {
    const img = descriptor.entry && descriptor.entry.img
    if (!img || !descriptor.entry.loaded) return

    if (!descriptor.width) descriptor.width = img.naturalWidth || img.width || 20
    if (!descriptor.height) descriptor.height = img.naturalHeight || img.height || 20
    if (descriptor.anchorX === null || descriptor.anchorX === undefined) {
        descriptor.anchorX = descriptor.width / 2
    }
    if (descriptor.anchorY === null || descriptor.anchorY === undefined) {
        descriptor.anchorY = descriptor.height / 2
    }
    descriptor.ready = true
}

/**
 * Register an icon descriptor and return its index in the shared table.
 * Accepts a URL string, an HTMLImageElement, or a descriptor object.
 * @param {string|HTMLImageElement|Object} raw
 * @returns {number} index in iconTable, or -1 when unusable
 */
function registerIcon(raw) {
    if (!raw) return -1

    let url = null
    let width = 0
    let height = 0
    let anchorX
    let anchorY
    let externalImage = null

    if (typeof raw === 'string') {
        url = raw
    } else if (typeof HTMLImageElement !== 'undefined' && raw instanceof HTMLImageElement) {
        externalImage = raw
        url = raw.src || null
        width = raw.naturalWidth || raw.width || 0
        height = raw.naturalHeight || raw.height || 0
    } else if (typeof raw === 'object') {
        url = raw.url || raw.src || null
        width = raw.width || (raw.size ? raw.size[0] : 0) || 0
        height = raw.height || (raw.size ? raw.size[1] : 0) || 0
        anchorX = raw.anchorX !== undefined ? raw.anchorX : (raw.anchor ? raw.anchor[0] : undefined)
        anchorY = raw.anchorY !== undefined ? raw.anchorY : (raw.anchor ? raw.anchor[1] : undefined)
        if (!url && raw.img) {
            externalImage = raw.img
            url = raw.img.src || null
        }
    }

    if (!url) return -1

    const key = url + '|' + width + '|' + height + '|' +
        (anchorX === undefined ? 'c' : anchorX) + '|' + (anchorY === undefined ? 'c' : anchorY)

    const existing = iconIndexByKey.get(key)
    if (existing !== undefined) return existing

    const entry = externalImage
        ? {img: externalImage, loaded: externalImage.complete && externalImage.naturalWidth > 0}
        : getCachedImage(url)

    const descriptor = {
        url,
        entry,
        width,
        height,
        anchorX: anchorX === undefined ? null : anchorX,
        anchorY: anchorY === undefined ? null : anchorY,
        ready: false
    }

    if (entry && entry.loaded) finalizeIconDescriptor(descriptor)

    const index = iconTable.length
    iconTable.push(descriptor)
    iconIndexByKey.set(key, index)
    return index
}

// ==================== Helpers ====================

function mergeOptions(options) {
    const opts = options || {}
    return {
        padding: pick(opts.padding, DEFAULTS.padding),
        drawMargin: pick(opts.drawMargin, DEFAULTS.drawMargin),
        hitTolerance: pick(opts.hitTolerance, DEFAULTS.hitTolerance),
        cursor: pick(opts.cursor, DEFAULTS.cursor),
        hoverDelay: pick(opts.hoverDelay, DEFAULTS.hoverDelay),
        leaveDelay: pick(opts.leaveDelay, DEFAULTS.leaveDelay),
        pane: pick(opts.pane, DEFAULTS.pane),
        pointRadius: pick(opts.pointRadius, DEFAULTS.pointRadius),
        pointStyle: Object.assign({}, DEFAULTS.pointStyle, opts.pointStyle),
        label: Object.assign({}, DEFAULTS.label, opts.label),
        popupOptions: Object.assign({}, DEFAULTS.popupOptions, opts.popupOptions)
    }
}

function pick(value, fallback) {
    return value === undefined || value === null ? fallback : value
}

function identity(value) {
    return value
}

/**
 * Normalize whatever a `getLatLng` accessor returned into `{lat, lng}`.
 * Accepts `[lat, lng]`, an `L.LatLng`, `{lat, lng}` and `{latitude, longitude}`.
 * @param {*} raw
 * @returns {{lat: number, lng: number}|null}
 */
function normalizeLatLng(raw) {
    if (!raw) return null

    if (Array.isArray(raw)) {
        return finiteLatLng(raw[0], raw[1])
    }
    if (raw.lat !== undefined || raw.lng !== undefined) {
        return finiteLatLng(raw.lat, raw.lng)
    }
    if (raw.latitude !== undefined || raw.longitude !== undefined) {
        return finiteLatLng(raw.latitude, raw.longitude)
    }
    return null
}

function finiteLatLng(lat, lng) {
    const la = Number(lat)
    const ln = Number(lng)
    if (!isFinite(la) || !isFinite(ln)) return null
    return {lat: la, lng: ln}
}

/**
 * The canvas layer.
 */
export const MassMarkers = L.Layer.extend({

    initialize(options) {
        L.Util.setOptions(this, options)

        const opts = mergeOptions(options)
        this._o = opts

        // Accessors. Users normally pass these as options; they are read here so
        // that the draw loop never has to resolve them dynamically.
        // Whatever `getLatLng` returns is normalized afterwards, so an accessor
        // may hand back [lat,lng], an L.LatLng or a {lat,lng} object.
        this._getLatLng = typeof options.getLatLng === 'function' ? options.getLatLng : identity
        this._getIcon = typeof options.getIcon === 'function' ? options.getIcon : null
        this._getLabel = typeof options.getLabel === 'function' ? options.getLabel : null
        this._getMinZoom = typeof options.getMinZoom === 'function' ? options.getMinZoom : null
        this._getGroup = typeof options.getGroup === 'function' ? options.getGroup : null
        this._popupContent = typeof options.popupContent === 'function' ? options.popupContent : null

        // group key -> record
        this._groups = new Map()
        // group keys that are currently hidden (empty set = everything visible)
        this._hiddenGroups = new Set()

        this._labelGrid = new Set()
        this._tmpLatLng = L.latLng(0, 0)

        // Reused arrays for the visible-item pass, to avoid per-frame garbage.
        this._visGroup = []
        this._visIdx = []
        this._visX = []
        this._visY = []

        this._popup = null
        this._popupEl = null
        this._hoverGroup = null
        this._hoverIndex = -1
        this._hoverTimer = null
        this._leaveTimer = null
        this._hitRaf = 0
        this._drawRaf = 0
        this._pendingPoint = null
        this._isDragging = false
        this._isZooming = false
        this._offIconReady = null

        this._canvas = null
        this._ctx = null
        this._dpr = 1
        this._pad = {x: 0, y: 0}
        this._cssSize = {x: 0, y: 0}
        this._zoom = 0
        this._bounds = null

        // Browser zoom changes devicePixelRatio. When the container CSS size
        // stays the same Leaflet fires no `resize`, so listen on window as well.
        this._onWindowResize = () => this._reset()
    },

    // ==================== Lifecycle ====================

    onAdd(map) {
        this._map = map
        this._zoom = map.getZoom()

        const canvas = L.DomUtil.create('canvas', 'leaflet-layer leaflet-zoom-animated leaflet-mass-markers')
        canvas.style.position = 'absolute'
        canvas.style.left = '0'
        canvas.style.top = '0'
        // Never block map dragging, scrolling, or clicks on other layers.
        canvas.style.pointerEvents = 'none'
        this._canvas = canvas
        this._ctx = canvas.getContext('2d')

        const pane = map.getPane(this._o.pane) || map.getPanes().overlayPane
        pane.appendChild(canvas)

        map.on('moveend', this._onViewChange, this)
        map.on('zoomend', this._onZoomEnd, this)
        map.on('zoomstart', this._onZoomStart, this)
        map.on('resize', this._onViewChange, this)
        map.on('viewreset', this._onViewChange, this)
        map.on('mousemove', this._onMouseMove, this)
        map.on('mouseout', this._onMapMouseOut, this)
        map.on('click', this._onMapClick, this)
        map.on('dragstart', this._onDragStart, this)
        map.on('dragend', this._onDragEnd, this)
        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', this._animateZoom, this)
        }
        window.addEventListener('resize', this._onWindowResize)

        // Icons decode asynchronously; repaint once they arrive.
        const onReady = () => this.redraw()
        iconReadyListeners.add(onReady)
        this._offIconReady = () => iconReadyListeners.delete(onReady)

        this._reset()
    },

    onRemove(map) {
        // Leaflet nulls `this._map` before calling onRemove, so use the argument
        // and restore it temporarily to reuse the cleanup helpers.
        const target = map || this._map
        this._map = target

        if (target) {
            target.off('moveend', this._onViewChange, this)
            target.off('zoomend', this._onZoomEnd, this)
            target.off('zoomstart', this._onZoomStart, this)
            target.off('resize', this._onViewChange, this)
            target.off('viewreset', this._onViewChange, this)
            target.off('mousemove', this._onMouseMove, this)
            target.off('mouseout', this._onMapMouseOut, this)
            target.off('click', this._onMapClick, this)
            target.off('dragstart', this._onDragStart, this)
            target.off('dragend', this._onDragEnd, this)
            target.off('zoomanim', this._animateZoom, this)
        }
        window.removeEventListener('resize', this._onWindowResize)

        if (this._offIconReady) {
            this._offIconReady()
            this._offIconReady = null
        }

        this._clearTimers()
        this._closePopup()
        this._resetCursor()

        if (this._hitRaf) {
            cancelAnimationFrame(this._hitRaf)
            this._hitRaf = 0
        }
        if (this._drawRaf) {
            cancelAnimationFrame(this._drawRaf)
            this._drawRaf = 0
        }
        if (this._canvas && this._canvas.parentNode) {
            this._canvas.parentNode.removeChild(this._canvas)
        }
        this._canvas = null
        this._ctx = null
        this._popup = null
        this._groups.clear()
        this._hiddenGroups.clear()
        this._map = null
    },

    // ==================== Data API ====================

    /**
     * Replace the whole dataset. Items are bucketed by `getGroup`.
     * @param {Array} items
     * @returns {this}
     */
    setData(items) {
        this._groups.clear()
        this._hiddenGroups.clear()
        return this.addData(items)
    },

    /**
     * Append items, bucketed by `getGroup`. Existing groups are extended.
     * @param {Array} items
     * @returns {this}
     */
    addData(items) {
        const list = Array.isArray(items) ? items : []
        if (list.length === 0) return this

        const buckets = new Map()
        for (let i = 0; i < list.length; i++) {
            const item = list[i]
            const group = this._getGroup ? String(this._getGroup(item)) : DEFAULT_GROUP
            const key = group === undefined || group === null || group === 'undefined' || group === 'null'
                ? DEFAULT_GROUP
                : group
            let bucket = buckets.get(key)
            if (!bucket) {
                bucket = []
                buckets.set(key, bucket)
            }
            bucket.push(item)
        }

        buckets.forEach((bucketItems, group) => {
            const existing = this._groups.get(group)
            const merged = existing ? existing.items.concat(bucketItems) : bucketItems
            this._groups.set(group, this._buildRecord(merged))
        })

        this._projectAll()
        this._clearHover()
        this.redraw()
        return this
    },

    /**
     * Replace the data of a single group. Handy for "toggle a category on"
     * without touching the other groups.
     * @param {string|number} group
     * @param {Array} items
     * @returns {this}
     */
    setGroupData(group, items) {
        const key = String(group)
        const list = Array.isArray(items) ? items : []
        if (list.length === 0) {
            return this.removeGroup(key)
        }
        this._groups.set(key, this._buildRecord(list))
        this._projectAll()
        this._clearHover()
        this.redraw()
        return this
    },

    /**
     * Drop a group's data entirely.
     * @param {string|number} group
     * @returns {this}
     */
    removeGroup(group) {
        const key = String(group)
        if (!this._groups.has(key)) return this
        this._groups.delete(key)
        this._hiddenGroups.delete(key)
        this._clearHover()
        this._scheduleClosePopup()
        this.redraw()
        return this
    },

    /**
     * Remove everything.
     * @returns {this}
     */
    clear() {
        if (this._groups.size === 0) return this
        this._groups.clear()
        this._hiddenGroups.clear()
        this._clearHover()
        this._closePopup()
        this.redraw()
        return this
    },

    /**
     * Show or hide a group. Pure data toggle, no DOM work.
     * @param {string|number} group
     * @param {boolean} [visible]
     * @returns {this}
     */
    setGroupVisible(group, visible) {
        const key = String(group)
        const show = visible === undefined ? true : !!visible
        if (show) this._hiddenGroups.delete(key)
        else this._hiddenGroups.add(key)

        if (!show && this._hoverGroup === key) {
            this._clearHover()
            this._scheduleClosePopup()
        }
        this.redraw()
        return this
    },

    /**
     * Toggle a group and report its new visibility.
     * @param {string|number} group
     * @returns {boolean} visible after the toggle
     */
    toggleGroup(group) {
        const visible = !this.isGroupVisible(group)
        this.setGroupVisible(group, visible)
        return visible
    },

    /**
     * @param {string|number} group
     * @returns {boolean}
     */
    isGroupVisible(group) {
        return !this._hiddenGroups.has(String(group))
    },

    /**
     * @returns {Array<string>} every group that currently holds data
     */
    getGroups() {
        return Array.from(this._groups.keys())
    },

    /**
     * @returns {Array<string>} groups that hold data and are not hidden
     */
    getVisibleGroups() {
        return this.getGroups().filter((group) => !this._hiddenGroups.has(group))
    },

    /**
     * Number of items currently held, across all groups.
     * @returns {number}
     */
    getCount() {
        let total = 0
        this._groups.forEach((record) => {
            total += record.count
        })
        return total
    },

    /**
     * Geographic bounds of the loaded data, useful for `map.fitBounds`.
     * @returns {L.LatLngBounds|null}
     */
    getBounds() {
        let bounds = null
        this._groups.forEach((record) => {
            for (let i = 0; i < record.count; i++) {
                const latlng = L.latLng(record.lats[i], record.lngs[i])
                bounds = bounds ? bounds.extend(latlng) : L.latLngBounds(latlng, latlng)
            }
        })
        return bounds
    },

    /**
     * Request a repaint. Coalesced into one frame.
     * @returns {this}
     */
    redraw() {
        if (this._drawRaf || !this._canvas) return this
        this._drawRaf = requestAnimationFrame(() => {
            this._drawRaf = 0
            this._draw()
        })
        return this
    },

    /**
     * Re-project every item against the current view and repaint. Call this
     * after mutating item coordinates in place.
     * @returns {this}
     */
    refresh() {
        if (this._map) this._zoom = this._map.getZoom()
        this._projectAll()
        return this.redraw()
    },

    // ==================== Record building ====================

    /**
     * Convert a plain array of items into compact typed arrays.
     * Lat/lng use Float64Array for precision; screen positions use Float32Array
     * because pixel precision is enough.
     * @param {Array} items
     * @returns {Object}
     * @private
     */
    _buildRecord(items) {
        const total = items.length
        const lats = new Float64Array(total)
        const lngs = new Float64Array(total)
        const sx = new Float32Array(total)
        const sy = new Float32Array(total)
        const minZooms = new Float32Array(total)
        const icons = new Int16Array(total)
        const labels = new Array(total)
        const valid = []
        let count = 0

        for (let i = 0; i < total; i++) {
            const item = items[i]
            const latlng = normalizeLatLng(this._getLatLng(item))
            if (!latlng) continue

            lats[count] = latlng.lat
            lngs[count] = latlng.lng

            minZooms[count] = this._getMinZoom ? (Number(this._getMinZoom(item)) || 0) : 0
            icons[count] = this._getIcon ? registerIcon(this._getIcon(item)) : -1

            let label = this._getLabel ? this._getLabel(item) : null
            labels[count] = label === undefined || label === null ? null : String(label)

            valid.push(item)
            count++
        }

        return {
            items: valid,
            lats: lats.subarray(0, count),
            lngs: lngs.subarray(0, count),
            sx: sx.subarray(0, count),
            sy: sy.subarray(0, count),
            minZooms: minZooms.subarray(0, count),
            icons: icons.subarray(0, count),
            labels,
            count
        }
    },

    // ==================== View sync ====================

    /**
     * Re-align the canvas with the current view, re-project, repaint.
     * @private
     */
    _reset() {
        const map = this._map
        if (!map || !this._canvas) return

        const size = map.getSize()
        // The map may not be laid out yet; `resize` / `viewreset` will retry.
        if (size.x <= 0 || size.y <= 0) return

        const padX = Math.round(size.x * this._o.padding)
        const padY = Math.round(size.y * this._o.padding)
        const cssW = size.x + padX * 2
        const cssH = size.y + padY * 2

        L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([-padX, -padY]))
        this._canvas.style.width = cssW + 'px'
        this._canvas.style.height = cssH + 'px'

        const dpr = window.devicePixelRatio || 1
        const bw = Math.round(cssW * dpr)
        const bh = Math.round(cssH * dpr)
        // Only touch the backing store when it really changed, to avoid
        // needless GPU reallocation.
        if (this._canvas.width !== bw || this._canvas.height !== bh) {
            this._canvas.width = bw
            this._canvas.height = bh
        }

        this._dpr = dpr
        this._pad.x = padX
        this._pad.y = padY
        this._cssSize.x = cssW
        this._cssSize.y = cssH
        this._zoom = map.getZoom()

        const nw = map.containerPointToLatLng([-padX, -padY])
        const se = map.containerPointToLatLng([size.x + padX, size.y + padY])
        this._bounds = L.latLngBounds(nw, se)

        this._projectAll()
        this.redraw()
    },

    /**
     * Re-project every group into canvas space.
     * @private
     */
    _projectAll() {
        this._groups.forEach((record) => this._projectRecord(record))
    },

    /**
     * Project one group using Leaflet's own API, so the result is correct for
     * any CRS. Drawing and hit testing both read these arrays.
     * @param {Object} record
     * @private
     */
    _projectRecord(record) {
        const map = this._map
        if (!map || !record || record.count === 0) return

        const padX = this._pad.x
        const padY = this._pad.y
        const lats = record.lats
        const lngs = record.lngs
        const sx = record.sx
        const sy = record.sy
        // One reusable LatLng keeps a 10k-item projection allocation-free.
        const ll = this._tmpLatLng

        for (let i = 0; i < record.count; i++) {
            ll.lat = lats[i]
            ll.lng = lngs[i]
            const p = map.latLngToContainerPoint(ll)
            // The canvas top-left sits at container point (-padX, -padY).
            sx[i] = p.x + padX
            sy[i] = p.y + padY
        }
    },

    /**
     * Follow the zoom animation with a CSS transform so items stay glued to the
     * basemap instead of snapping at the end.
     *
     * The offset is the layer point the canvas top-left will occupy once the
     * animation completes:
     *   layerPoint(ll)     = project(ll, targetZoom) - newPixelOrigin
     *   newPixelOrigin     = project(targetCenter, targetZoom) - size/2 + mapPanePos
     *
     * `mapPanePos` must be ADDED (matching Leaflet's `Map._getNewPixelOrigin`).
     * Getting that sign wrong shows up as a temporary offset of twice the drag
     * distance during the animation, which then snaps back on `zoomend`.
     *
     * @param {Object} e zoomanim event
     * @private
     */
    _animateZoom(e) {
        this._isZooming = true
        if (!this._bounds || !this._canvas || !this._map) return

        const map = this._map
        const scale = map.getZoomScale(e.zoom, this._zoom)
        const size = map.getSize()
        const panePos = L.DomUtil.getPosition(map._mapPane) || new L.Point(0, 0)

        const newPixelOrigin = map.project(e.center, e.zoom)
            .subtract([size.x / 2, size.y / 2])
            .add(panePos)
        const offset = map.project(this._bounds.getNorthWest(), e.zoom).subtract(newPixelOrigin)

        L.DomUtil.setTransform(this._canvas, offset, scale)
    },

    _onViewChange() {
        this._reset()
    },

    _onZoomStart() {
        this._isZooming = true
    },

    _onZoomEnd() {
        this._isZooming = false
        this._reset()
    },

    // ==================== Drawing ====================

    /**
     * Paint everything: group filter, minZoom filter, viewport cull, icons,
     * then labels on top.
     * @private
     */
    _draw() {
        const ctx = this._ctx
        const map = this._map
        if (!ctx || !map || !this._canvas) return

        const o = this._o
        const W = this._cssSize.x
        const H = this._cssSize.y
        ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0)
        ctx.clearRect(0, 0, W, H)

        if (this._groups.size === 0) return

        const zoom = this._zoom
        const margin = o.drawMargin
        const minX = -margin
        const minY = -margin
        const maxX = W + margin
        const maxY = H + margin
        const hidden = this._hiddenGroups

        const visGroup = this._visGroup
        const visIdx = this._visIdx
        const visX = this._visX
        const visY = this._visY
        visGroup.length = 0
        visIdx.length = 0
        visX.length = 0
        visY.length = 0

        // Pass 1: icons. Visible items are collected for the label pass.
        const pointStyle = o.pointStyle
        ctx.lineWidth = pointStyle.lineWidth
        ctx.strokeStyle = pointStyle.stroke
        ctx.fillStyle = pointStyle.fill

        this._groups.forEach((record, group) => {
            if (record.count === 0 || hidden.has(group)) return

            const sx = record.sx
            const sy = record.sy
            const minZooms = record.minZooms
            const icons = record.icons

            for (let i = 0; i < record.count; i++) {
                if (zoom < minZooms[i]) continue

                const x = sx[i]
                const y = sy[i]
                if (x < minX || x > maxX || y < minY || y > maxY) continue

                const iconId = icons[i]
                if (iconId < 0) {
                    // Built-in circular point.
                    ctx.beginPath()
                    ctx.arc(x, y, o.pointRadius, 0, TAU)
                    ctx.fill()
                    if (pointStyle.lineWidth > 0) ctx.stroke()
                } else {
                    const icon = iconTable[iconId]
                    if (icon && icon.ready) {
                        ctx.drawImage(icon.entry.img, x - icon.anchorX, y - icon.anchorY, icon.width, icon.height)
                    }
                }

                visGroup.push(group)
                visIdx.push(i)
                visX.push(x)
                visY.push(y)
            }
        })

        // Pass 2: labels, drawn after every icon so they are never covered.
        if (visX.length > 0 && this._getLabel && zoom >= o.label.minZoom) {
            this._drawLabels(ctx, visGroup, visIdx, visX, visY)
        }
    },

    /**
     * Draw labels, dropping the ones that would overlap an already drawn label.
     * @private
     */
    _drawLabels(ctx, visGroup, visIdx, visX, visY) {
        const label = this._o.label
        const grid = this._labelGrid
        grid.clear()

        const cell = label.cellSize
        const offsetX = label.offsetX
        const offsetY = label.offsetY
        const maxChars = label.maxChars
        const ellipsis = label.ellipsis

        ctx.font = label.font
        ctx.textAlign = label.align
        ctx.textBaseline = 'top'
        ctx.lineJoin = 'round'
        ctx.lineWidth = label.lineWidth
        ctx.strokeStyle = label.stroke
        ctx.fillStyle = label.fill

        for (let n = 0; n < visX.length; n++) {
            const record = this._groups.get(visGroup[n])
            if (!record) continue

            let text = record.labels[visIdx[n]]
            if (!text) continue
            if (maxChars > 0 && text.length > maxChars) text = text.slice(0, maxChars) + ellipsis

            const x = visX[n] + offsetX
            const y = visY[n] + offsetY

            if (cell > 0) {
                // Numeric key avoids string concatenation. gy stays far below
                // 1e5 for any realistic canvas height, so keys never collide.
                const key = Math.floor(x / cell) * 100000 + Math.floor(y / cell)
                if (grid.has(key)) continue
                grid.add(key)
            }

            if (label.lineWidth > 0) ctx.strokeText(text, x, y)
            ctx.fillText(text, x, y)
        }
    },

    // ==================== Hit testing & events ====================

    /**
     * Find the topmost item under a container point. Reads exactly the arrays
     * used for drawing, so the hit box always matches the painted pixels.
     * @param {L.Point} containerPoint
     * @returns {{group: string, index: number, item: *}|null}
     * @private
     */
    _pick(containerPoint) {
        const map = this._map
        if (!map || !this._canvas || this._groups.size === 0) return null

        const cx = containerPoint.x + this._pad.x
        const cy = containerPoint.y + this._pad.y
        const tol = this._o.hitTolerance
        const zoom = this._zoom
        const radius = this._o.pointRadius
        const hidden = this._hiddenGroups

        let hitGroup = null
        let hitIndex = -1

        this._groups.forEach((record, group) => {
            if (record.count === 0 || hidden.has(group)) return

            const sx = record.sx
            const sy = record.sy
            const minZooms = record.minZooms
            const icons = record.icons

            for (let i = 0; i < record.count; i++) {
                if (zoom < minZooms[i]) continue

                const iconId = icons[i]
                let halfW
                let halfH
                if (iconId < 0) {
                    halfW = radius
                    halfH = radius
                } else {
                    const icon = iconTable[iconId]
                    if (!icon || !icon.ready) continue
                    halfW = icon.width / 2
                    halfH = icon.height / 2
                }

                if (Math.abs(cx - sx[i]) <= halfW + tol && Math.abs(cy - sy[i]) <= halfH + tol) {
                    hitGroup = group
                    hitIndex = i
                }
            }
        })

        if (hitGroup === null || hitIndex < 0) return null

        const record = this._groups.get(hitGroup)
        return {group: hitGroup, index: hitIndex, item: record.items[hitIndex]}
    },

    _onMouseMove(e) {
        if (this._isDragging || this._isZooming) return
        if (!e || !e.containerPoint) return

        this._pendingPoint = e.containerPoint
        if (this._hitRaf) return
        this._hitRaf = requestAnimationFrame(() => {
            this._hitRaf = 0
            const point = this._pendingPoint
            this._pendingPoint = null
            if (point) this._handleHover(point, e)
        })
    },

    /**
     * Only reacts when the hovered item actually changes; never repaints.
     * @private
     */
    _handleHover(containerPoint, sourceEvent) {
        const hit = this._pick(containerPoint)

        if (hit) {
            const same = this._hoverGroup === hit.group && this._hoverIndex === hit.index
            this._hoverGroup = hit.group
            this._hoverIndex = hit.index
            this._setCursor(true)

            if (this._leaveTimer) {
                clearTimeout(this._leaveTimer)
                this._leaveTimer = null
            }
            if (!same) {
                this.fire('mouseover', this._eventPayload(hit, containerPoint, sourceEvent))
            }
            if (!this._isPopupOpen() && this._popupContent) {
                if (this._hoverTimer) clearTimeout(this._hoverTimer)
                this._hoverTimer = setTimeout(() => {
                    this._hoverTimer = null
                    this._openPopup(hit.group, hit.index)
                }, this._o.hoverDelay)
            }
        } else if (this._hoverGroup !== null) {
            const previous = {group: this._hoverGroup, index: this._hoverIndex}
            const record = this._groups.get(previous.group)
            this._hoverGroup = null
            this._hoverIndex = -1
            this._setCursor(false)
            if (this._hoverTimer) {
                clearTimeout(this._hoverTimer)
                this._hoverTimer = null
            }
            this.fire('mouseout', this._eventPayload(
                {group: previous.group, index: previous.index, item: record ? record.items[previous.index] : null},
                containerPoint,
                sourceEvent
            ))
            this._scheduleClosePopup()
        }
    },

    _onMapClick(e) {
        if (!e || !e.containerPoint) return

        // Ignore clicks that landed on a DOM marker, popup or control, so
        // search results and other layers keep their own behaviour.
        const target = e.originalEvent && e.originalEvent.target
        if (target && target.closest &&
            target.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-control')) {
            return
        }

        const hit = this._pick(e.containerPoint)
        if (!hit) return

        if (this._popupContent) this._openPopup(hit.group, hit.index)
        this.fire('click', this._eventPayload(hit, e.containerPoint, e))
    },

    _onMapMouseOut() {
        if (this._hoverTimer) {
            clearTimeout(this._hoverTimer)
            this._hoverTimer = null
        }
        this._hoverGroup = null
        this._hoverIndex = -1
        this._setCursor(false)
        this._scheduleClosePopup()
    },

    _onDragStart() {
        this._isDragging = true
        if (this._hoverTimer) {
            clearTimeout(this._hoverTimer)
            this._hoverTimer = null
        }
        this._hoverGroup = null
        this._hoverIndex = -1
    },

    _onDragEnd() {
        this._isDragging = false
        this._resetCursor()
    },

    /**
     * @private
     */
    _eventPayload(hit, containerPoint, sourceEvent) {
        const record = this._groups.get(hit.group)
        const latlng = record
            ? L.latLng(record.lats[hit.index], record.lngs[hit.index])
            : null
        return {
            item: hit.item,
            group: hit.group,
            index: hit.index,
            latlng,
            containerPoint,
            originalEvent: sourceEvent && sourceEvent.originalEvent ? sourceEvent.originalEvent : sourceEvent
        }
    },

    // ==================== Popup ====================

    /**
     * One popup instance is shared by every item.
     * @private
     */
    _getPopup() {
        if (!this._popup) {
            this._popup = L.popup(this._o.popupOptions)
        }
        return this._popup
    },

    /**
     * Content is produced on demand, never for the whole dataset up front.
     * @private
     */
    _openPopup(group, index) {
        if (!this._map || !this._popupContent) return

        const record = this._groups.get(group)
        if (!record || index < 0 || index >= record.count) return

        const item = record.items[index]
        const content = this._popupContent(item)
        if (content === null || content === undefined || content === false) return

        const popup = this._getPopup()
        popup.setLatLng(L.latLng(record.lats[index], record.lngs[index]))
        popup.setContent(content)
        popup.openOn(this._map)

        this.fire('popupopen', {popup, item, group, index})
        this._bindPopupElement(popup.getElement())
    },

    _isPopupOpen() {
        return !!(this._popup && this._map && this._map.hasLayer(this._popup))
    },

    /**
     * Close after `leaveDelay`, unless the pointer moved onto the popup itself.
     * @private
     */
    _scheduleClosePopup() {
        if (!this._isPopupOpen()) return
        if (this._leaveTimer) clearTimeout(this._leaveTimer)
        this._leaveTimer = setTimeout(() => {
            this._leaveTimer = null
            const el = this._popup && this._popup.getElement()
            if (el && el.matches && el.matches(':hover')) return
            this._closePopup()
        }, this._o.leaveDelay)
    },

    _closePopup() {
        this._unbindPopupElement()
        if (this._popup && this._map && this._map.hasLayer(this._popup)) {
            this._map.closePopup(this._popup)
            this.fire('popupclose', {popup: this._popup})
        }
    },

    _bindPopupElement(el) {
        if (!el || this._popupEl === el) return
        this._unbindPopupElement()
        this._popupEl = el
        L.DomEvent.on(el, 'mouseleave', this._onPopupMouseLeave, this)
    },

    _unbindPopupElement() {
        if (this._popupEl) {
            L.DomEvent.off(this._popupEl, 'mouseleave', this._onPopupMouseLeave, this)
            this._popupEl = null
        }
    },

    _onPopupMouseLeave() {
        this._scheduleClosePopup()
    },

    // ==================== Utilities ====================

    /**
     * The canvas is `pointer-events: none`, so the cursor has to be set on the
     * map container.
     * @private
     */
    _setCursor(active) {
        if (!this._map) return
        const container = this._map.getContainer()
        if (!container) return
        if (active) {
            if (this._o.cursor && container.style.cursor !== this._o.cursor) {
                container.style.cursor = this._o.cursor
            }
        } else {
            this._resetCursor()
        }
    },

    /**
     * Hand the cursor back to Leaflet's grab / dragging styles.
     * @private
     */
    _resetCursor() {
        if (!this._map) return
        const container = this._map.getContainer()
        if (container && this._o.cursor && container.style.cursor === this._o.cursor) {
            container.style.cursor = ''
        }
    },

    /**
     * @private
     */
    _clearHover() {
        this._clearTimers()
        this._hoverGroup = null
        this._hoverIndex = -1
        this._setCursor(false)
    },

    _clearTimers() {
        if (this._hoverTimer) {
            clearTimeout(this._hoverTimer)
            this._hoverTimer = null
        }
        if (this._leaveTimer) {
            clearTimeout(this._leaveTimer)
            this._leaveTimer = null
        }
    }
})

/**
 * Factory, mirroring Leaflet's `L.tileLayer()` style.
 * @param {Object} [options]
 * @returns {MassMarkers}
 */
export function massMarkers(options) {
    return new MassMarkers(options)
}

// Register on the Leaflet namespace so the UMD build works from a <script> tag.
L.MassMarkers = MassMarkers
L.massMarkers = massMarkers

export default massMarkers
