# leaflet-mass-markers

在 Leaflet 地图上渲染**数万个带文字标注的点位**，而不让地图变成幻灯片。

每个点都绘制在**同一个 `<canvas>`** 上，而不是各自变成一个 DOM `L.marker`。图标、文字标注、按缩放级别显隐、分组开关、点击 / 悬浮 / 弹窗——功能全部保留，性能全部在线。

- 零运行时依赖（Leaflet 为 peer dependency）
- 提供 UMD + ESM 构建产物，含 TypeScript 类型声明
- 适配任意 CRS —— 投影完全交给 Leaflet 自身
- MIT 协议

[English](./README.md)

---

## 为什么需要它

一个 DOM marker 就是一个绝对定位元素。平移和缩放动画期间，Leaflet 会**在每一帧给它们逐个写入 `transform`**，而每个 `<img>` 还会各自成为一个合成层。成本是每帧 O(n)：

| 点位数量 | DOM marker | 本图层 |
|---|---|---|
| DOM 节点 | 每个点 3+ 个 | **全局 1 个 canvas** |
| 拖拽时开销 | 每帧 O(n) 次样式写入 | **0**（GPU 平移画布） |
| 合成层 | 数百个 | 1 个 |
| 事件监听器 | 每个点约 5 个 | 地图上共 4 个 |
| Popup 对象 | 每个点 1 个 | 1 个复用，内容懒生成 |

几百个 DOM marker 就会卡顿，几千个直接不可用。本图层在 5 万个点的量级依然流畅。

## 安装

```bash
npm install leaflet-mass-markers
```

```js
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-mass-markers'
```

也可以直接用 CDN —— UMD 构建会自动把自己注册到 `L` 上：

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="leaflet-mass-markers.umd.cjs"></script>
```

## 快速开始

```js
const map = L.map('map').setView([43.9, 85.9], 8)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

const layer = L.massMarkers({
    // 点在哪？（默认已支持 [lat,lng]、L.LatLng、{lat,lng}）
    getLatLng: (d) => [d.lat, d.lng],
    // 长什么样？
    getIcon: (d) => ({url: `/icons/${d.type}.png`, width: 20, height: 20}),
    // 图标下方显示什么文字？
    getLabel: (d) => d.name,
    // 从哪个缩放级别开始可见？
    getMinZoom: (d) => d.minZoom,
    // 属于哪个开关分组？
    getGroup: (d) => d.type,
    // 弹窗内容，仅在真正命中该点时才生成
    popupContent: (d) => `<b>${d.name}</b><br>${d.type}`
}).addTo(map)

layer.setData(bigArrayOfItems)      // 5 万条也没问题

layer.on('click', (e) => console.log(e.item, e.latlng))
layer.on('mouseover', (e) => console.log('hover', e.item))
```

不配置图标时，点位会绘制为圆形色点：

```js
L.massMarkers({
    getLatLng: (d) => d.position,
    pointRadius: 5,
    pointStyle: {fill: '#e63946', stroke: '#fff', lineWidth: 1.5}
}).setData(items).addTo(map)
```

## 分组开关

这是最常见的「点击图例项来叠加/关闭某一类点位」场景。它不会移除其他分组，也完全不触碰 DOM：

```js
legendButton.addEventListener('click', async () => {
    if (layer.isGroupVisible('river')) {
        layer.setGroupVisible('river', false)
    } else {
        // 按需加载后再显示
        layer.setGroupData('river', await fetch('/api/river-stations'))
        layer.setGroupVisible('river', true)
    }
})
```

## API

### `L.massMarkers(options)` → `MassMarkers`

也可以用 `new L.MassMarkers(options)`。

#### 数据访问器

| 配置项 | 类型 | 说明 |
|---|---|---|
| `getLatLng` | `(item) => [lat,lng] \| L.LatLng \| {lat,lng}` | 位置。默认实现已支持 `[lat,lng]`、`L.LatLng`、`{lat,lng}` 与 `{latitude,longitude}`。 |
| `getIcon` | `(item) => string \| HTMLImageElement \| {url,width,height,anchorX,anchorY}` | 图标。`width`/`height` 缺省时取图片固有尺寸，锚点缺省为图标中心。不配置则画圆点。 |
| `getLabel` | `(item) => string` | 图标下方的文字。 |
| `getMinZoom` | `(item) => number` | 当 `map.getZoom() >= 该值` 时可见，默认 `0`。 |
| `getGroup` | `(item) => string \| number` | 分组键，供分组 API 使用。 |
| `popupContent` | `(item) => string \| HTMLElement \| null` | 弹窗内容，懒生成。返回 `null` 表示该点不弹窗；不配置则完全禁用弹窗。 |

#### 渲染

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `padding` | `0.25` | 画布相对容器的外扩比例，保证拖拽过程中边缘不出现空白。 |
| `drawMargin` | `30` | 允许越界绘制的像素数，避免边缘图标被生硬裁掉。 |
| `hitTolerance` | `2` | 命中判定的额外容差像素。 |
| `cursor` | `'pointer'` | 命中时设置到地图容器上的光标。 |
| `pane` | `'overlayPane'` | 画布挂载的 pane。 |
| `pointRadius` | `6` | 内置圆点半径。 |
| `pointStyle` | `{fill:'#2d57f7', stroke:'#ffffff', lineWidth:2}` | 内置圆点样式。 |
| `label` | 见下 | 文字标注的字体与去重叠配置。 |

`label` 默认值：

```js
{
    font: '11px "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    fill: '#ffffff',
    stroke: 'rgba(0, 0, 0, 0.65)',
    lineWidth: 3,     // 0 = 不描边
    offsetX: 0,
    offsetY: 12,
    align: 'center',
    maxChars: 0,      // 0 = 不截断
    ellipsis: '…',
    minZoom: 0,       // 低于该缩放级别时隐藏全部文字
    cellSize: 28      // 文字去重叠的网格边长，0 = 关闭剔除
}
```

#### 交互

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `hoverDelay` | `200` | 悬浮多少毫秒后打开弹窗。 |
| `leaveDelay` | `300` | 鼠标离开多少毫秒后关闭弹窗。 |
| `popupOptions` | `{maxWidth:350, minWidth:200, offset:[0,-10], autoPan:true}` | 传给复用的 `L.popup()`。 |

### 方法

| 方法 | 返回值 | 说明 |
|---|---|---|
| `setData(items)` | `this` | 全量替换数据（按 `getGroup` 自动分桶）。 |
| `addData(items)` | `this` | 追加数据到各自分组。 |
| `setGroupData(group, items)` | `this` | 替换单个分组的数据；传空数组即移除该分组。 |
| `removeGroup(group)` | `this` | 移除分组。 |
| `clear()` | `this` | 清空全部数据。 |
| `setGroupVisible(group, visible?)` | `this` | 显示 / 隐藏分组。 |
| `toggleGroup(group)` | `boolean` | 切换分组，返回切换后的可见性。 |
| `isGroupVisible(group)` | `boolean` | |
| `getGroups()` | `string[]` | 所有持有数据的分组。 |
| `getVisibleGroups()` | `string[]` | 当前可见的分组。 |
| `getCount()` | `number` | 已加载的点位总数。 |
| `getBounds()` | `L.LatLngBounds \| null` | 数据地理范围，可用于 `fitBounds`。 |
| `redraw()` | `this` | 请求重绘（按帧合并）。 |
| `refresh()` | `this` | 重新投影全部点位后重绘。 |

### 事件

通过 Leaflet 的 `Evented` 派发，`layer.on(...)` / `layer.off(...)` 照常用。

| 事件 | 载荷 |
|---|---|
| `click` | `{item, group, index, latlng, containerPoint, originalEvent}` |
| `mouseover` | 同上 |
| `mouseout` | 同上 |
| `popupopen` | `{popup, item, group, index}` |
| `popupclose` | `{popup}` |

## 性能是怎么做到的

1. **单画布**：整个数据集在 overlay pane 中只有 1 个 DOM 节点。
2. **拖拽零成本**：画布随 mapPane 由 GPU 平移，`moveend` 之前不重投影、不重绘。
3. **缩放动画同步**：用与 Leaflet 官方 canvas renderer 相同的数学做 CSS transform 跟随，`zoomend` 后再重绘一次。
4. **投影交给 Leaflet**：坐标来自 `latLngToContainerPoint()`，因此任意 CRS 都正确；只在视图稳定时批量重算一次，写入 `Float32Array`。
5. **绘制与命中读同一份数组**：看到的位置就是能点到的位置，不存在第二套坐标会漂移。
6. **绘制循环零分配**：坐标、最小缩放、图标索引都用定长数组；可见点缓存数组复用；投影循环复用一个 `L.LatLng`。
7. **视口裁剪**：屏幕外的点只花一次数值比较。
8. **文字去重叠**：网格剔除会碰撞的标注，既保证可读性，也限制 `fillText` 的调用次数。
9. **图标缓存共享**：同一 URL 全页面只有一个 `Image`，只解码一次；加载完成自动补一次重绘。
10. **弹窗复用**：全局一个 `L.Popup`，内容只为真正命中的那个点生成。
11. **`pointer-events: none`**：鼠标事件从地图上旁听，绝不阻断拖拽、滚轮缩放和其他图层的点击；落在 DOM marker、弹窗或地图控件上的点击会被忽略。
12. **适配 `devicePixelRatio`**，并额外监听 `window.resize`，兜住「浏览器缩放改变了 DPR 但容器 CSS 尺寸没变」的情况。

## 已知取舍

- 缩放动画那约 250ms 内画布是被 CSS 拉伸的位图，所以点位会短暂发虚、随后重绘变清晰。这是所有 canvas 覆盖层方案的固有行为，Leaflet 官方 canvas renderer 也是如此。
- 命中测试是线性扫描 + 每帧一次的节流。5 万个点时仍远低于 1 毫秒，因此没有内置空间索引。若你确实压测出需要，可以在不改公开 API 的前提下补一个 r-tree。
- 文字标注做了去重叠，密集视图下不会每个标注都画；图标则始终全画。可通过 `label.cellSize`（调小 = 更密）或 `label.minZoom` 调整。

## 示例

用浏览器打开 [`demo/index.html`](./demo/index.html)，里面渲染了 30000 个随机点，分成 4 个可切换的分组。

## 构建

```bash
npm install
npm run build     # 输出 dist/leaflet-mass-markers.js (ESM) 与 .umd.cjs (UMD)
```

## 兼容性

Leaflet `>= 1.7`，无其他运行时依赖。

## 协议

[MIT](./LICENSE)
