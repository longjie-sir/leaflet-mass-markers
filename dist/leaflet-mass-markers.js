import _ from "leaflet";
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
const B = "1.0.0", I = "*", W = Math.PI * 2, m = {
  // Extra canvas size beyond the map container, as a ratio of container size.
  // Keeps the edges covered while dragging, before `moveend` re-aligns.
  padding: 0.25,
  // Items drawn slightly outside the canvas are still processed, so that
  // icons overlapping the border are not cut off abruptly.
  drawMargin: 30,
  // Extra pixels around an icon that still count as a hit.
  hitTolerance: 2,
  // Cursor applied to the map container while hovering an item.
  cursor: "pointer",
  // Delay before the hover popup opens / after the pointer leaves before it
  // closes. Matches the usual DOM-marker behaviour.
  hoverDelay: 200,
  leaveDelay: 300,
  // Pane the canvas is appended to.
  pane: "overlayPane",
  // Fallback appearance for items without an icon.
  pointRadius: 6,
  pointStyle: {
    fill: "#2d57f7",
    stroke: "#ffffff",
    lineWidth: 2
  },
  // Label appearance and de-overlap behaviour.
  label: {
    font: '11px "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    fill: "#ffffff",
    stroke: "rgba(0, 0, 0, 0.65)",
    lineWidth: 3,
    offsetX: 0,
    offsetY: 12,
    align: "center",
    // 0 disables truncation.
    maxChars: 0,
    ellipsis: "…",
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
    autoPan: !0,
    className: "leaflet-mass-markers-popup"
  }
}, k = /* @__PURE__ */ new Map(), R = [], D = /* @__PURE__ */ new Map(), w = /* @__PURE__ */ new Set();
function Y() {
  w.forEach((t) => {
    try {
      t();
    } catch (e) {
      console.error("[leaflet-mass-markers] icon-ready listener failed:", e);
    }
  });
}
function H(t) {
  if (!t || typeof t != "string") return null;
  let e = k.get(t);
  if (e) return e;
  const i = new Image();
  return e = { img: i, loaded: !1 }, k.set(t, e), i.addEventListener("load", () => {
    e.loaded = !0, R.forEach((s) => {
      s.url === t && Z(s);
    }), Y();
  }), i.addEventListener("error", () => {
    e.loaded = !1;
  }), i.src = t, e;
}
function Z(t) {
  const e = t.entry && t.entry.img;
  !e || !t.entry.loaded || (t.width || (t.width = e.naturalWidth || e.width || 20), t.height || (t.height = e.naturalHeight || e.height || 20), (t.anchorX === null || t.anchorX === void 0) && (t.anchorX = t.width / 2), (t.anchorY === null || t.anchorY === void 0) && (t.anchorY = t.height / 2), t.ready = !0);
}
function X(t) {
  if (!t) return -1;
  let e = null, i = 0, s = 0, o, n, r = null;
  if (typeof t == "string" ? e = t : typeof HTMLImageElement != "undefined" && t instanceof HTMLImageElement ? (r = t, e = t.src || null, i = t.naturalWidth || t.width || 0, s = t.naturalHeight || t.height || 0) : typeof t == "object" && (e = t.url || t.src || null, i = t.width || (t.size ? t.size[0] : 0) || 0, s = t.height || (t.size ? t.size[1] : 0) || 0, o = t.anchorX !== void 0 ? t.anchorX : t.anchor ? t.anchor[0] : void 0, n = t.anchorY !== void 0 ? t.anchorY : t.anchor ? t.anchor[1] : void 0, !e && t.img && (r = t.img, e = t.img.src || null)), !e) return -1;
  const l = e + "|" + i + "|" + s + "|" + (o === void 0 ? "c" : o) + "|" + (n === void 0 ? "c" : n), u = D.get(l);
  if (u !== void 0) return u;
  const a = r ? { img: r, loaded: r.complete && r.naturalWidth > 0 } : H(e), h = {
    url: e,
    entry: a,
    width: i,
    height: s,
    anchorX: o === void 0 ? null : o,
    anchorY: n === void 0 ? null : n,
    ready: !1
  };
  a && a.loaded && Z(h);
  const p = R.length;
  return R.push(h), D.set(l, p), p;
}
function F(t) {
  const e = t || {};
  return {
    padding: x(e.padding, m.padding),
    drawMargin: x(e.drawMargin, m.drawMargin),
    hitTolerance: x(e.hitTolerance, m.hitTolerance),
    cursor: x(e.cursor, m.cursor),
    hoverDelay: x(e.hoverDelay, m.hoverDelay),
    leaveDelay: x(e.leaveDelay, m.leaveDelay),
    pane: x(e.pane, m.pane),
    pointRadius: x(e.pointRadius, m.pointRadius),
    pointStyle: Object.assign({}, m.pointStyle, e.pointStyle),
    label: Object.assign({}, m.label, e.label),
    popupOptions: Object.assign({}, m.popupOptions, e.popupOptions)
  };
}
function x(t, e) {
  return t == null ? e : t;
}
function j(t) {
  return t;
}
function V(t) {
  return t ? Array.isArray(t) ? E(t[0], t[1]) : t.lat !== void 0 || t.lng !== void 0 ? E(t.lat, t.lng) : t.latitude !== void 0 || t.longitude !== void 0 ? E(t.latitude, t.longitude) : null : null;
}
function E(t, e) {
  const i = Number(t), s = Number(e);
  return !isFinite(i) || !isFinite(s) ? null : { lat: i, lng: s };
}
const A = _.Layer.extend({
  initialize(t) {
    _.Util.setOptions(this, t);
    const e = F(t);
    this._o = e, this._getLatLng = typeof t.getLatLng == "function" ? t.getLatLng : j, this._getIcon = typeof t.getIcon == "function" ? t.getIcon : null, this._getLabel = typeof t.getLabel == "function" ? t.getLabel : null, this._getMinZoom = typeof t.getMinZoom == "function" ? t.getMinZoom : null, this._getGroup = typeof t.getGroup == "function" ? t.getGroup : null, this._popupContent = typeof t.popupContent == "function" ? t.popupContent : null, this._groups = /* @__PURE__ */ new Map(), this._hiddenGroups = /* @__PURE__ */ new Set(), this._labelGrid = /* @__PURE__ */ new Set(), this._tmpLatLng = _.latLng(0, 0), this._visGroup = [], this._visIdx = [], this._visX = [], this._visY = [], this._popup = null, this._popupEl = null, this._hoverGroup = null, this._hoverIndex = -1, this._hoverTimer = null, this._leaveTimer = null, this._hitRaf = 0, this._drawRaf = 0, this._pendingPoint = null, this._isDragging = !1, this._isZooming = !1, this._offIconReady = null, this._canvas = null, this._ctx = null, this._dpr = 1, this._pad = { x: 0, y: 0 }, this._cssSize = { x: 0, y: 0 }, this._zoom = 0, this._bounds = null, this._onWindowResize = () => this._reset();
  },
  // ==================== Lifecycle ====================
  onAdd(t) {
    this._map = t, this._zoom = t.getZoom();
    const e = _.DomUtil.create("canvas", "leaflet-layer leaflet-zoom-animated leaflet-mass-markers");
    e.style.position = "absolute", e.style.left = "0", e.style.top = "0", e.style.pointerEvents = "none", this._canvas = e, this._ctx = e.getContext("2d"), (t.getPane(this._o.pane) || t.getPanes().overlayPane).appendChild(e), t.on("moveend", this._onViewChange, this), t.on("zoomend", this._onZoomEnd, this), t.on("zoomstart", this._onZoomStart, this), t.on("resize", this._onViewChange, this), t.on("viewreset", this._onViewChange, this), t.on("mousemove", this._onMouseMove, this), t.on("mouseout", this._onMapMouseOut, this), t.on("click", this._onMapClick, this), t.on("dragstart", this._onDragStart, this), t.on("dragend", this._onDragEnd, this), t.options.zoomAnimation && _.Browser.any3d && t.on("zoomanim", this._animateZoom, this), window.addEventListener("resize", this._onWindowResize);
    const s = () => this.redraw();
    w.add(s), this._offIconReady = () => w.delete(s), this._reset();
  },
  onRemove(t) {
    const e = t || this._map;
    this._map = e, e && (e.off("moveend", this._onViewChange, this), e.off("zoomend", this._onZoomEnd, this), e.off("zoomstart", this._onZoomStart, this), e.off("resize", this._onViewChange, this), e.off("viewreset", this._onViewChange, this), e.off("mousemove", this._onMouseMove, this), e.off("mouseout", this._onMapMouseOut, this), e.off("click", this._onMapClick, this), e.off("dragstart", this._onDragStart, this), e.off("dragend", this._onDragEnd, this), e.off("zoomanim", this._animateZoom, this)), window.removeEventListener("resize", this._onWindowResize), this._offIconReady && (this._offIconReady(), this._offIconReady = null), this._clearTimers(), this._closePopup(), this._resetCursor(), this._hitRaf && (cancelAnimationFrame(this._hitRaf), this._hitRaf = 0), this._drawRaf && (cancelAnimationFrame(this._drawRaf), this._drawRaf = 0), this._canvas && this._canvas.parentNode && this._canvas.parentNode.removeChild(this._canvas), this._canvas = null, this._ctx = null, this._popup = null, this._groups.clear(), this._hiddenGroups.clear(), this._map = null;
  },
  // ==================== Data API ====================
  /**
   * Replace the whole dataset. Items are bucketed by `getGroup`.
   * @param {Array} items
   * @returns {this}
   */
  setData(t) {
    return this._groups.clear(), this._hiddenGroups.clear(), this.addData(t);
  },
  /**
   * Append items, bucketed by `getGroup`. Existing groups are extended.
   * @param {Array} items
   * @returns {this}
   */
  addData(t) {
    const e = Array.isArray(t) ? t : [];
    if (e.length === 0) return this;
    const i = /* @__PURE__ */ new Map();
    for (let s = 0; s < e.length; s++) {
      const o = e[s], n = this._getGroup ? String(this._getGroup(o)) : I, r = n == null || n === "undefined" || n === "null" ? I : n;
      let l = i.get(r);
      l || (l = [], i.set(r, l)), l.push(o);
    }
    return i.forEach((s, o) => {
      const n = this._groups.get(o), r = n ? n.items.concat(s) : s;
      this._groups.set(o, this._buildRecord(r));
    }), this._projectAll(), this._clearHover(), this.redraw(), this;
  },
  /**
   * Replace the data of a single group. Handy for "toggle a category on"
   * without touching the other groups.
   * @param {string|number} group
   * @param {Array} items
   * @returns {this}
   */
  setGroupData(t, e) {
    const i = String(t), s = Array.isArray(e) ? e : [];
    return s.length === 0 ? this.removeGroup(i) : (this._groups.set(i, this._buildRecord(s)), this._projectAll(), this._clearHover(), this.redraw(), this);
  },
  /**
   * Drop a group's data entirely.
   * @param {string|number} group
   * @returns {this}
   */
  removeGroup(t) {
    const e = String(t);
    return this._groups.has(e) ? (this._groups.delete(e), this._hiddenGroups.delete(e), this._clearHover(), this._scheduleClosePopup(), this.redraw(), this) : this;
  },
  /**
   * Remove everything.
   * @returns {this}
   */
  clear() {
    return this._groups.size === 0 ? this : (this._groups.clear(), this._hiddenGroups.clear(), this._clearHover(), this._closePopup(), this.redraw(), this);
  },
  /**
   * Show or hide a group. Pure data toggle, no DOM work.
   * @param {string|number} group
   * @param {boolean} [visible]
   * @returns {this}
   */
  setGroupVisible(t, e) {
    const i = String(t), s = e === void 0 ? !0 : !!e;
    return s ? this._hiddenGroups.delete(i) : this._hiddenGroups.add(i), !s && this._hoverGroup === i && (this._clearHover(), this._scheduleClosePopup()), this.redraw(), this;
  },
  /**
   * Toggle a group and report its new visibility.
   * @param {string|number} group
   * @returns {boolean} visible after the toggle
   */
  toggleGroup(t) {
    const e = !this.isGroupVisible(t);
    return this.setGroupVisible(t, e), e;
  },
  /**
   * @param {string|number} group
   * @returns {boolean}
   */
  isGroupVisible(t) {
    return !this._hiddenGroups.has(String(t));
  },
  /**
   * @returns {Array<string>} every group that currently holds data
   */
  getGroups() {
    return Array.from(this._groups.keys());
  },
  /**
   * @returns {Array<string>} groups that hold data and are not hidden
   */
  getVisibleGroups() {
    return this.getGroups().filter((t) => !this._hiddenGroups.has(t));
  },
  /**
   * Number of items currently held, across all groups.
   * @returns {number}
   */
  getCount() {
    let t = 0;
    return this._groups.forEach((e) => {
      t += e.count;
    }), t;
  },
  /**
   * Geographic bounds of the loaded data, useful for `map.fitBounds`.
   * @returns {L.LatLngBounds|null}
   */
  getBounds() {
    let t = null;
    return this._groups.forEach((e) => {
      for (let i = 0; i < e.count; i++) {
        const s = _.latLng(e.lats[i], e.lngs[i]);
        t = t ? t.extend(s) : _.latLngBounds(s, s);
      }
    }), t;
  },
  /**
   * Request a repaint. Coalesced into one frame.
   * @returns {this}
   */
  redraw() {
    return this._drawRaf || !this._canvas ? this : (this._drawRaf = requestAnimationFrame(() => {
      this._drawRaf = 0, this._draw();
    }), this);
  },
  /**
   * Re-project every item against the current view and repaint. Call this
   * after mutating item coordinates in place.
   * @returns {this}
   */
  refresh() {
    return this._map && (this._zoom = this._map.getZoom()), this._projectAll(), this.redraw();
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
  _buildRecord(t) {
    const e = t.length, i = new Float64Array(e), s = new Float64Array(e), o = new Float32Array(e), n = new Float32Array(e), r = new Float32Array(e), l = new Int16Array(e), u = new Array(e), a = [];
    let h = 0;
    for (let p = 0; p < e; p++) {
      const c = t[p], g = V(this._getLatLng(c));
      if (!g) continue;
      i[h] = g.lat, s[h] = g.lng, r[h] = this._getMinZoom && Number(this._getMinZoom(c)) || 0, l[h] = this._getIcon ? X(this._getIcon(c)) : -1;
      let f = this._getLabel ? this._getLabel(c) : null;
      u[h] = f == null ? null : String(f), a.push(c), h++;
    }
    return {
      items: a,
      lats: i.subarray(0, h),
      lngs: s.subarray(0, h),
      sx: o.subarray(0, h),
      sy: n.subarray(0, h),
      minZooms: r.subarray(0, h),
      icons: l.subarray(0, h),
      labels: u,
      count: h
    };
  },
  // ==================== View sync ====================
  /**
   * Re-align the canvas with the current view, re-project, repaint.
   * @private
   */
  _reset() {
    const t = this._map;
    if (!t || !this._canvas) return;
    const e = t.getSize();
    if (e.x <= 0 || e.y <= 0) return;
    const i = Math.round(e.x * this._o.padding), s = Math.round(e.y * this._o.padding), o = e.x + i * 2, n = e.y + s * 2;
    _.DomUtil.setPosition(this._canvas, t.containerPointToLayerPoint([-i, -s])), this._canvas.style.width = o + "px", this._canvas.style.height = n + "px";
    const r = window.devicePixelRatio || 1, l = Math.round(o * r), u = Math.round(n * r);
    (this._canvas.width !== l || this._canvas.height !== u) && (this._canvas.width = l, this._canvas.height = u), this._dpr = r, this._pad.x = i, this._pad.y = s, this._cssSize.x = o, this._cssSize.y = n, this._zoom = t.getZoom();
    const a = t.containerPointToLatLng([-i, -s]), h = t.containerPointToLatLng([e.x + i, e.y + s]);
    this._bounds = _.latLngBounds(a, h), this._projectAll(), this.redraw();
  },
  /**
   * Re-project every group into canvas space.
   * @private
   */
  _projectAll() {
    this._groups.forEach((t) => this._projectRecord(t));
  },
  /**
   * Project one group using Leaflet's own API, so the result is correct for
   * any CRS. Drawing and hit testing both read these arrays.
   * @param {Object} record
   * @private
   */
  _projectRecord(t) {
    const e = this._map;
    if (!e || !t || t.count === 0) return;
    const i = this._pad.x, s = this._pad.y, o = t.lats, n = t.lngs, r = t.sx, l = t.sy, u = this._tmpLatLng;
    for (let a = 0; a < t.count; a++) {
      u.lat = o[a], u.lng = n[a];
      const h = e.latLngToContainerPoint(u);
      r[a] = h.x + i, l[a] = h.y + s;
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
  _animateZoom(t) {
    if (this._isZooming = !0, !this._bounds || !this._canvas || !this._map) return;
    const e = this._map, i = e.getZoomScale(t.zoom, this._zoom), s = e.getSize(), o = _.DomUtil.getPosition(e._mapPane) || new _.Point(0, 0), n = e.project(t.center, t.zoom).subtract([s.x / 2, s.y / 2]).add(o), r = e.project(this._bounds.getNorthWest(), t.zoom).subtract(n);
    _.DomUtil.setTransform(this._canvas, r, i);
  },
  _onViewChange() {
    this._reset();
  },
  _onZoomStart() {
    this._isZooming = !0;
  },
  _onZoomEnd() {
    this._isZooming = !1, this._reset();
  },
  // ==================== Drawing ====================
  /**
   * Paint everything: group filter, minZoom filter, viewport cull, icons,
   * then labels on top.
   * @private
   */
  _draw() {
    const t = this._ctx, e = this._map;
    if (!t || !e || !this._canvas) return;
    const i = this._o, s = this._cssSize.x, o = this._cssSize.y;
    if (t.setTransform(this._dpr, 0, 0, this._dpr, 0, 0), t.clearRect(0, 0, s, o), this._groups.size === 0) return;
    const n = this._zoom, r = i.drawMargin, l = -r, u = -r, a = s + r, h = o + r, p = this._hiddenGroups, c = this._visGroup, g = this._visIdx, f = this._visX, y = this._visY;
    c.length = 0, g.length = 0, f.length = 0, y.length = 0;
    const v = i.pointStyle;
    t.lineWidth = v.lineWidth, t.strokeStyle = v.stroke, t.fillStyle = v.fill, this._groups.forEach((d, L) => {
      if (d.count === 0 || p.has(L)) return;
      const M = d.sx, z = d.sy, P = d.minZooms, O = d.icons;
      for (let b = 0; b < d.count; b++) {
        if (n < P[b]) continue;
        const C = M[b], G = z[b];
        if (C < l || C > a || G < u || G > h) continue;
        const S = O[b];
        if (S < 0)
          t.beginPath(), t.arc(C, G, i.pointRadius, 0, W), t.fill(), v.lineWidth > 0 && t.stroke();
        else {
          const T = R[S];
          T && T.ready && t.drawImage(T.entry.img, C - T.anchorX, G - T.anchorY, T.width, T.height);
        }
        c.push(L), g.push(b), f.push(C), y.push(G);
      }
    }), f.length > 0 && this._getLabel && n >= i.label.minZoom && this._drawLabels(t, c, g, f, y);
  },
  /**
   * Draw labels, dropping the ones that would overlap an already drawn label.
   * @private
   */
  _drawLabels(t, e, i, s, o) {
    const n = this._o.label, r = this._labelGrid;
    r.clear();
    const l = n.cellSize, u = n.offsetX, a = n.offsetY, h = n.maxChars, p = n.ellipsis;
    t.font = n.font, t.textAlign = n.align, t.textBaseline = "top", t.lineJoin = "round", t.lineWidth = n.lineWidth, t.strokeStyle = n.stroke, t.fillStyle = n.fill;
    for (let c = 0; c < s.length; c++) {
      const g = this._groups.get(e[c]);
      if (!g) continue;
      let f = g.labels[i[c]];
      if (!f) continue;
      h > 0 && f.length > h && (f = f.slice(0, h) + p);
      const y = s[c] + u, v = o[c] + a;
      if (l > 0) {
        const d = Math.floor(y / l) * 1e5 + Math.floor(v / l);
        if (r.has(d)) continue;
        r.add(d);
      }
      n.lineWidth > 0 && t.strokeText(f, y, v), t.fillText(f, y, v);
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
  _pick(t) {
    if (!this._map || !this._canvas || this._groups.size === 0) return null;
    const i = t.x + this._pad.x, s = t.y + this._pad.y, o = this._o.hitTolerance, n = this._zoom, r = this._o.pointRadius, l = this._hiddenGroups;
    let u = null, a = -1;
    if (this._groups.forEach((p, c) => {
      if (p.count === 0 || l.has(c)) return;
      const g = p.sx, f = p.sy, y = p.minZooms, v = p.icons;
      for (let d = 0; d < p.count; d++) {
        if (n < y[d]) continue;
        const L = v[d];
        let M, z;
        if (L < 0)
          M = r, z = r;
        else {
          const P = R[L];
          if (!P || !P.ready) continue;
          M = P.width / 2, z = P.height / 2;
        }
        Math.abs(i - g[d]) <= M + o && Math.abs(s - f[d]) <= z + o && (u = c, a = d);
      }
    }), u === null || a < 0) return null;
    const h = this._groups.get(u);
    return { group: u, index: a, item: h.items[a] };
  },
  _onMouseMove(t) {
    this._isDragging || this._isZooming || !t || !t.containerPoint || (this._pendingPoint = t.containerPoint, !this._hitRaf && (this._hitRaf = requestAnimationFrame(() => {
      this._hitRaf = 0;
      const e = this._pendingPoint;
      this._pendingPoint = null, e && this._handleHover(e, t);
    })));
  },
  /**
   * Only reacts when the hovered item actually changes; never repaints.
   * @private
   */
  _handleHover(t, e) {
    const i = this._pick(t);
    if (i) {
      const s = this._hoverGroup === i.group && this._hoverIndex === i.index;
      this._hoverGroup = i.group, this._hoverIndex = i.index, this._setCursor(!0), this._leaveTimer && (clearTimeout(this._leaveTimer), this._leaveTimer = null), s || this.fire("mouseover", this._eventPayload(i, t, e)), !this._isPopupOpen() && this._popupContent && (this._hoverTimer && clearTimeout(this._hoverTimer), this._hoverTimer = setTimeout(() => {
        this._hoverTimer = null, this._openPopup(i.group, i.index);
      }, this._o.hoverDelay));
    } else if (this._hoverGroup !== null) {
      const s = { group: this._hoverGroup, index: this._hoverIndex }, o = this._groups.get(s.group);
      this._hoverGroup = null, this._hoverIndex = -1, this._setCursor(!1), this._hoverTimer && (clearTimeout(this._hoverTimer), this._hoverTimer = null), this.fire("mouseout", this._eventPayload(
        { group: s.group, index: s.index, item: o ? o.items[s.index] : null },
        t,
        e
      )), this._scheduleClosePopup();
    }
  },
  _onMapClick(t) {
    if (!t || !t.containerPoint) return;
    const e = t.originalEvent && t.originalEvent.target;
    if (e && e.closest && e.closest(".leaflet-marker-icon, .leaflet-popup, .leaflet-control"))
      return;
    const i = this._pick(t.containerPoint);
    i && (this._popupContent && this._openPopup(i.group, i.index), this.fire("click", this._eventPayload(i, t.containerPoint, t)));
  },
  _onMapMouseOut() {
    this._hoverTimer && (clearTimeout(this._hoverTimer), this._hoverTimer = null), this._hoverGroup = null, this._hoverIndex = -1, this._setCursor(!1), this._scheduleClosePopup();
  },
  _onDragStart() {
    this._isDragging = !0, this._hoverTimer && (clearTimeout(this._hoverTimer), this._hoverTimer = null), this._hoverGroup = null, this._hoverIndex = -1;
  },
  _onDragEnd() {
    this._isDragging = !1, this._resetCursor();
  },
  /**
   * @private
   */
  _eventPayload(t, e, i) {
    const s = this._groups.get(t.group), o = s ? _.latLng(s.lats[t.index], s.lngs[t.index]) : null;
    return {
      item: t.item,
      group: t.group,
      index: t.index,
      latlng: o,
      containerPoint: e,
      originalEvent: i && i.originalEvent ? i.originalEvent : i
    };
  },
  // ==================== Popup ====================
  /**
   * One popup instance is shared by every item.
   * @private
   */
  _getPopup() {
    return this._popup || (this._popup = _.popup(this._o.popupOptions)), this._popup;
  },
  /**
   * Content is produced on demand, never for the whole dataset up front.
   * @private
   */
  _openPopup(t, e) {
    if (!this._map || !this._popupContent) return;
    const i = this._groups.get(t);
    if (!i || e < 0 || e >= i.count) return;
    const s = i.items[e], o = this._popupContent(s);
    if (o == null || o === !1) return;
    const n = this._getPopup();
    n.setLatLng(_.latLng(i.lats[e], i.lngs[e])), n.setContent(o), n.openOn(this._map), this.fire("popupopen", { popup: n, item: s, group: t, index: e }), this._bindPopupElement(n.getElement());
  },
  _isPopupOpen() {
    return !!(this._popup && this._map && this._map.hasLayer(this._popup));
  },
  /**
   * Close after `leaveDelay`, unless the pointer moved onto the popup itself.
   * @private
   */
  _scheduleClosePopup() {
    this._isPopupOpen() && (this._leaveTimer && clearTimeout(this._leaveTimer), this._leaveTimer = setTimeout(() => {
      this._leaveTimer = null;
      const t = this._popup && this._popup.getElement();
      t && t.matches && t.matches(":hover") || this._closePopup();
    }, this._o.leaveDelay));
  },
  _closePopup() {
    this._unbindPopupElement(), this._popup && this._map && this._map.hasLayer(this._popup) && (this._map.closePopup(this._popup), this.fire("popupclose", { popup: this._popup }));
  },
  _bindPopupElement(t) {
    !t || this._popupEl === t || (this._unbindPopupElement(), this._popupEl = t, _.DomEvent.on(t, "mouseleave", this._onPopupMouseLeave, this));
  },
  _unbindPopupElement() {
    this._popupEl && (_.DomEvent.off(this._popupEl, "mouseleave", this._onPopupMouseLeave, this), this._popupEl = null);
  },
  _onPopupMouseLeave() {
    this._scheduleClosePopup();
  },
  // ==================== Utilities ====================
  /**
   * The canvas is `pointer-events: none`, so the cursor has to be set on the
   * map container.
   * @private
   */
  _setCursor(t) {
    if (!this._map) return;
    const e = this._map.getContainer();
    e && (t ? this._o.cursor && e.style.cursor !== this._o.cursor && (e.style.cursor = this._o.cursor) : this._resetCursor());
  },
  /**
   * Hand the cursor back to Leaflet's grab / dragging styles.
   * @private
   */
  _resetCursor() {
    if (!this._map) return;
    const t = this._map.getContainer();
    t && this._o.cursor && t.style.cursor === this._o.cursor && (t.style.cursor = "");
  },
  /**
   * @private
   */
  _clearHover() {
    this._clearTimers(), this._hoverGroup = null, this._hoverIndex = -1, this._setCursor(!1);
  },
  _clearTimers() {
    this._hoverTimer && (clearTimeout(this._hoverTimer), this._hoverTimer = null), this._leaveTimer && (clearTimeout(this._leaveTimer), this._leaveTimer = null);
  }
});
function N(t) {
  return new A(t);
}
_.MassMarkers = A;
_.massMarkers = N;
export {
  A as MassMarkers,
  B as VERSION,
  N as default,
  N as massMarkers
};
//# sourceMappingURL=leaflet-mass-markers.js.map
