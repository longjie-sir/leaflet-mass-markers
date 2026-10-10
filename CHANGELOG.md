# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-10

### Added

- Single-canvas rendering layer for Leaflet (`L.MassMarkers` / `L.massMarkers()`).
  Replaces one DOM `L.marker` per item with one `<canvas>` for the whole dataset.
- Image icons via `getIcon(item)`, with a module-level `Image` cache so the same
  URL is decoded once no matter how many items use it.
- Built-in circular point fallback when no icon is supplied (`pointStyle`).
- Text labels via `getLabel(item)`, drawn with stroke + fill and de-overlapped
  through a grid-based collision cull (`label.cellSize`).
- Zoom-level visibility via `getMinZoom(item)`: each item carries its own
  minimum visible zoom, filtered during draw with no DOM churn.
- Group toggling via `getGroup(item)`: `setGroupVisible()`, `toggleGroup()`,
  `isGroupVisible()`, `getVisibleGroups()`, `setGroupData()`, `removeGroup()`.
- Interaction preserved from the DOM-marker workflow:
  - click / mouseover / mouseout events fired through Leaflet's `Evented`
  - shared single `L.Popup` instance with lazy content (`popupContent(item)`)
  - hover-to-open delay and leave-to-close delay (`hoverDelay`, `leaveDelay`)
  - popup stays open while the pointer is inside it
  - container cursor switches to `pointer` on hit
- Hit testing by linear scan over the same coordinate array used for drawing,
  throttled with `requestAnimationFrame`. The canvas is `pointer-events: none`,
  so map dragging, zooming and clicks on other layers are never blocked.
- Coordinate pre-projection using Leaflet's own `latLngToContainerPoint()` on
  view-stable events only (`moveend` / `zoomend` / `resize`), stored in
  `Float32Array`. Drawing and hit testing read the very same array, so what you
  see is always what you can click.
- Zero-allocation draw loop: typed arrays for coordinates, min-zoom, icon index
  and group index; reusable arrays for the visible-item pass.
- Zoom-animation sync via CSS transform, matching Leaflet's own canvas renderer
  maths (`project(NW, targetZoom) - newPixelOrigin`).
- `devicePixelRatio` aware backing store, re-allocated only when the size really
  changes; `window.resize` listener as a fallback for browser zoom that changes
  DPR without changing the container CSS size.
- Viewport culling so off-screen items cost nothing per frame.
- TypeScript declarations (`src/index.d.ts`).
- UMD + ESM builds, runnable browser demo, English and Chinese documentation.

[1.0.0]: https://github.com/your-name/leaflet-mass-markers/releases/tag/v1.0.0
