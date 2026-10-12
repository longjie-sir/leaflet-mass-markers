# leaflet-mass-markers

Render **tens of thousands of labeled markers** on a Leaflet map without the map
turning into a slideshow.

Every item is painted onto **one single `<canvas>`** instead of becoming one DOM
`L.marker`. Icons, text labels, per-item zoom-level visibility, group toggling,
click / hover / popup — all kept, all fast.

- Zero runtime dependencies (Leaflet is a peer dependency)
- UMD + ESM builds, TypeScript declarations included
- Works with any CRS — projection is delegated to Leaflet itself
- MIT licensed

[中文文档](./README.zh-CN.md)

---

## Why

A DOM marker is an absolutely positioned element. Leaflet writes a `transform`
to **each of them on every animation frame** while you pan or zoom, and every
`<img>` becomes its own compositing layer. The cost is O(n) per frame:

| Items | DOM markers | This layer |
|---|---|---|
| DOM nodes | 3+ per item | **1 canvas total** |
| Cost while dragging | O(n) style writes per frame | **0** (GPU moves the canvas) |
| Compositing layers | hundreds | 1 |
| Event listeners | ~5 per item | 4 on the map |
| Popup objects | 1 per item | 1 shared, content built lazily |

A few hundred DOM markers already stutter. A few thousand are unusable. This
layer stays smooth well past 50k items.

## Install

```bash
npm install leaflet-mass-markers
```

```js
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-mass-markers'
```

Or straight from a CDN — the UMD build registers itself on `L`:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="leaflet-mass-markers.umd.cjs"></script>
```

## Quick start

```js
const map = L.map('map').setView([43.9, 85.9], 8)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

const layer = L.massMarkers({
    // Where is the item? (default handles [lat,lng], L.LatLng and {lat,lng})
    getLatLng: (d) => [d.lat, d.lng],
    // What does it look like?
    getIcon: (d) => ({url: `/icons/${d.type}.png`, width: 20, height: 20}),
    // What text goes under the icon?
    getLabel: (d) => d.name,
    // From which zoom on is it visible?
    getMinZoom: (d) => d.minZoom,
    // Which toggle group does it belong to?
    getGroup: (d) => d.type,
    // Popup body, built only when the item is actually hit
    popupContent: (d) => `<b>${d.name}</b><br>${d.type}`
}).addTo(map)

layer.setData(bigArrayOfItems)      // 50k items is fine

layer.on('click', (e) => console.log(e.item, e.latlng))
layer.on('mouseover', (e) => console.log('hover', e.item))
```

No icon configured? Items are drawn as coloured circles:

```js
L.massMarkers({
    getLatLng: (d) => d.position,
    pointRadius: 5,
    pointStyle: {fill: '#e63946', stroke: '#fff', lineWidth: 1.5}
}).setData(items).addTo(map)
```

## Toggling groups

This is the usual "click a legend entry to add/remove a category" pattern. It
never removes other groups, and it never touches the DOM:

```js
legendButton.addEventListener('click', () => {
    if (layer.isGroupVisible('river')) {
        layer.setGroupVisible('river', false)
    } else {
        // Load on demand, then show
        layer.setGroupData('river', await fetch('/api/river-stations'))
        layer.setGroupVisible('river', true)
    }
})
```

## API

### `L.massMarkers(options)` → `MassMarkers`

Also available as `new L.MassMarkers(options)`.

#### Data accessors

| Option | Type | Description |
|---|---|---|
| `getLatLng` | `(item) => [lat,lng] \| L.LatLng \| {lat,lng}` | Position. Default understands `[lat,lng]`, `L.LatLng`, `{lat,lng}` and `{latitude,longitude}`. |
| `getIcon` | `(item) => string \| HTMLImageElement \| {url,width,height,anchorX,anchorY}` | Icon. `width`/`height` default to the intrinsic image size, the anchor defaults to the icon centre. Omit to draw a circle. |
| `getLabel` | `(item) => string` | Text drawn under the icon. |
| `getMinZoom` | `(item) => number` | Item is visible when `map.getZoom() >= value`. Default `0`. |
| `getGroup` | `(item) => string \| number` | Bucket used by the group API. |
| `popupContent` | `(item) => string \| HTMLElement \| null` | Lazy popup body. Omit to disable popups entirely. |

#### Rendering

| Option | Default | Description |
|---|---|---|
| `padding` | `0.25` | Canvas overscan beyond the container, as a ratio. Keeps the edges covered while dragging. |
| `drawMargin` | `30` | Items this many pixels outside the canvas are still drawn, so border icons are not cut off. |
| `hitTolerance` | `2` | Extra pixels around an icon that still count as a hit. |
| `cursor` | `'pointer'` | Cursor set on the map container while hovering. |
| `pane` | `'overlayPane'` | Pane the canvas is appended to. |
| `pointRadius` | `6` | Radius of the built-in circular point. |
| `pointStyle` | `{fill:'#2d57f7', stroke:'#ffffff', lineWidth:2}` | Appearance of the built-in point. |
| `label` | see below | Label typography and de-overlap settings. |

`label` defaults:

```js
{
    font: '11px "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    fill: '#ffffff',
    stroke: 'rgba(0, 0, 0, 0.65)',
    lineWidth: 3,     // 0 disables the outline
    offsetX: 0,
    offsetY: 12,
    align: 'center',
    maxChars: 0,      // 0 disables truncation
    ellipsis: '…',
    minZoom: 0,       // hide every label below this zoom
    cellSize: 28      // grid used to drop overlapping labels, 0 disables the cull
}
```

#### Interaction

| Option | Default | Description |
|---|---|---|
| `hoverDelay` | `200` | ms before the hover popup opens. |
| `leaveDelay` | `300` | ms before the popup closes after the pointer leaves. |
| `popupOptions` | `{maxWidth:350, minWidth:200, offset:[0,-10], autoPan:true}` | Passed to the shared `L.popup()`. |

### Methods

| Method | Returns | Description |
|---|---|---|
| `setData(items)` | `this` | Replace the whole dataset (bucketed by `getGroup`). |
| `addData(items)` | `this` | Append items to their groups. |
| `setGroupData(group, items)` | `this` | Replace one group's data. An empty array removes the group. |
| `removeGroup(group)` | `this` | Drop a group. |
| `clear()` | `this` | Remove everything. |
| `setGroupVisible(group, visible?)` | `this` | Show/hide a group. |
| `toggleGroup(group)` | `boolean` | Toggle, returning the new visibility. |
| `isGroupVisible(group)` | `boolean` | |
| `getGroups()` | `string[]` | All groups holding data. |
| `getVisibleGroups()` | `string[]` | Visible groups. |
| `getCount()` | `number` | Loaded item count. |
| `getBounds()` | `L.LatLngBounds \| null` | Data bounds, for `fitBounds`. |
| `redraw()` | `this` | Request a repaint (frame-coalesced). |
| `refresh()` | `this` | Re-project every item, then repaint. |

### Events

Fired through Leaflet's `Evented`, so `layer.on(...)` / `layer.off(...)` work as
usual.

| Event | Payload |
|---|---|
| `click` | `{item, group, index, latlng, containerPoint, originalEvent}` |
| `mouseover` | same |
| `mouseout` | same |
| `popupopen` | `{popup, item, group, index}` |
| `popupclose` | `{popup}` |

## How it stays fast

1. **One canvas.** The entire dataset is a single DOM node in the overlay pane.
2. **Dragging costs nothing.** The canvas rides along with the map pane on the
   GPU. No re-projection, no repaint until `moveend`.
3. **Zoom animation is synced** with a CSS transform using the same maths as
   Leaflet's own canvas renderer, then repainted once on `zoomend`.
4. **Projection is Leaflet's.** Coordinates come from `latLngToContainerPoint()`,
   so the layer is correct on any CRS. They are recomputed in batch only when
   the view settles, into `Float32Array`s.
5. **Drawing and hit testing read the same array.** What you see is always what
   you can click — there is no second coordinate path to drift out of sync.
6. **Allocation-free draw loop.** Typed arrays for coordinates, min-zoom and
   icon index; the visible-item pass reuses its arrays; the projection loop
   reuses one `L.LatLng`.
7. **Viewport culling.** Off-screen items cost a comparison and nothing else.
8. **Label de-overlap.** A grid cull drops labels that would collide, which both
   keeps the map readable and bounds the number of `fillText` calls.
9. **Shared icon cache.** One `Image` per URL for the whole page, decoded once;
   a repaint is triggered when it finishes loading.
10. **Shared popup.** A single `L.Popup` instance, with content produced only
    for the item actually hit.
11. **`pointer-events: none`.** Mouse events are read off the map, so dragging,
    scroll-zoom and clicks on other layers are never blocked. Clicks that land
    on a DOM marker, popup or control are ignored.
12. **`devicePixelRatio` aware**, and a `window.resize` listener catches browser
    zoom that changes the DPR without changing the container's CSS size.

## Notes and trade-offs

- During the ~250 ms zoom animation the canvas is scaled by CSS, so items look
  briefly soft and then repaint sharp. This is inherent to canvas overlays and
  is exactly what Leaflet's own canvas renderer does.
- Hit testing is a linear scan throttled to one per animation frame. At 50k
  items this is still far below a millisecond, which is why no spatial index is
  bundled. If you profile a real need for one, an r-tree can be added without
  changing the public API.
- Labels are de-overlapped, so in dense views not every label is drawn. Icons
  always are. Tune `label.cellSize` (smaller = denser) or `label.minZoom`.

## Demo

Open [`demo/index.html`](./demo/index.html) in a browser — it renders 30,000
generated points across four toggleable groups.

## Build

```bash
npm install
npm run build     # dist/leaflet-mass-markers.js (ESM) + .umd.cjs (UMD)
```

## Compatibility

Leaflet `>= 1.7`. No other runtime dependency.

## License

[MIT](./LICENSE)
