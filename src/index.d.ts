import * as L from 'leaflet'

export declare const VERSION: string

/** Anything `getIcon` may return. */
export type IconInput =
    | string
    | HTMLImageElement
    | {
        url?: string
        src?: string
        img?: HTMLImageElement
        width?: number
        height?: number
        size?: [number, number]
        anchorX?: number
        anchorY?: number
        anchor?: [number, number]
    }
    | null
    | undefined

/** Anything the default `getLatLng` understands. */
export type LatLngInput =
    | [number, number]
    | L.LatLng
    | {lat: number, lng: number}
    | {latitude: number, longitude: number}
    | null
    | undefined

export interface PointStyle {
    /** Fill colour of the built-in circular point. */
    fill?: string
    /** Stroke colour of the built-in circular point. */
    stroke?: string
    /** Stroke width. `0` disables the outline. */
    lineWidth?: number
}

export interface LabelStyle {
    font?: string
    fill?: string
    stroke?: string
    /** `0` disables the outline. */
    lineWidth?: number
    offsetX?: number
    offsetY?: number
    align?: CanvasTextAlign
    /** `0` disables truncation. */
    maxChars?: number
    ellipsis?: string
    /** Hide every label below this zoom. */
    minZoom?: number
    /** Grid cell used to drop overlapping labels. `0` disables the cull. */
    cellSize?: number
}

export interface MassMarkersOptions<T = any> {
    // ---------- Data accessors ----------

    /** Position of an item. Defaults to `[lat, lng]` / `L.LatLng` / `{lat, lng}`. */
    getLatLng?: (item: T) => LatLngInput
    /** Icon of an item. Omit to draw the built-in circular point. */
    getIcon?: (item: T) => IconInput
    /** Text drawn under the icon. Omit to draw no labels. */
    getLabel?: (item: T) => string | null | undefined
    /** Minimum zoom at which the item becomes visible. Defaults to `0`. */
    getMinZoom?: (item: T) => number | null | undefined
    /** Bucket key used by the group visibility API. Defaults to a single group. */
    getGroup?: (item: T) => string | number | null | undefined
    /** Lazy popup body. Returning `null` skips the popup for that item. */
    popupContent?: (item: T) => string | HTMLElement | null | undefined

    // ---------- Rendering ----------

    /** Canvas overscan beyond the container, as a ratio of container size. */
    padding?: number
    /** Items within this many pixels outside the canvas are still drawn. */
    drawMargin?: number
    /** Extra pixels around an icon that still count as a hit. */
    hitTolerance?: number
    /** Cursor set on the map container while hovering an item. `''` disables. */
    cursor?: string
    /** Pane the canvas is appended to. */
    pane?: string
    /** Radius of the built-in circular point. */
    pointRadius?: number
    pointStyle?: PointStyle
    label?: LabelStyle

    // ---------- Interaction ----------

    /** Delay before the hover popup opens, in ms. */
    hoverDelay?: number
    /** Delay before the popup closes after the pointer leaves, in ms. */
    leaveDelay?: number
    /** Options for the single shared popup instance. */
    popupOptions?: L.PopupOptions
}

export interface MassMarkersEvent<T = any> {
    item: T
    group: string
    index: number
    latlng: L.LatLng | null
    containerPoint: L.Point
    originalEvent?: Event
}

export interface MassMarkersPopupEvent<T = any> {
    popup: L.Popup
    item?: T
    group?: string
    index?: number
}

export declare class MassMarkers<T = any> extends L.Layer {
    constructor(options?: MassMarkersOptions<T>)

    /** Replace the whole dataset, bucketed by `getGroup`. */
    setData(items: T[]): this

    /** Append items, bucketed by `getGroup`. */
    addData(items: T[]): this

    /** Replace the data of a single group. An empty array removes the group. */
    setGroupData(group: string | number, items: T[]): this

    /** Drop a group's data entirely. */
    removeGroup(group: string | number): this

    /** Remove everything. */
    clear(): this

    /** Show or hide a group. Pure data toggle, no DOM work. */
    setGroupVisible(group: string | number, visible?: boolean): this

    /** Toggle a group, returning its new visibility. */
    toggleGroup(group: string | number): boolean

    isGroupVisible(group: string | number): boolean

    /** Every group that currently holds data. */
    getGroups(): string[]

    /** Groups that hold data and are not hidden. */
    getVisibleGroups(): string[]

    /** Number of loaded items across all groups. */
    getCount(): number

    /** Geographic bounds of the loaded data, for `map.fitBounds`. */
    getBounds(): L.LatLngBounds | null

    /** Request a repaint (coalesced into one frame). */
    redraw(): this

    /** Re-project every item against the current view, then repaint. */
    refresh(): this

    on(type: 'click' | 'mouseover' | 'mouseout', fn: (e: MassMarkersEvent<T>) => void, context?: any): this
    on(type: 'popupopen' | 'popupclose', fn: (e: MassMarkersPopupEvent<T>) => void, context?: any): this
    on(type: string, fn: (e: any) => void, context?: any): this
}

export interface MassMarkersConstructor {
    new <T = any>(options?: MassMarkersOptions<T>): MassMarkers<T>
    extend(props: any, statics?: any): any
}

/** Factory mirroring Leaflet's `L.tileLayer()` style. */
export declare function massMarkers<T = any>(options?: MassMarkersOptions<T>): MassMarkers<T>

export default massMarkers

// The UMD build also registers these on the Leaflet namespace.
declare module 'leaflet' {
    const MassMarkers: MassMarkersConstructor
    function massMarkers<T = any>(options?: MassMarkersOptions<T>): MassMarkers<T>
}
