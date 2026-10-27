# Graphics scene protocol (engine ↔ GUI)

The graphics engine (`core/graphics/`, runs in the Web Worker) keeps the handle
graphics object tree in `ctx.state.graphics`. The GUI (`src/graphics/`) only
draws what the engine sends and reports user interaction back. All messages
are plain structured-cloneable objects (`postMessage`); numbers stay numbers
(NaN and ±Inf survive structured cloning — they mean "gap" in data).

## 1. When the engine sends

- `__graphics_flush__` (builtin, no arguments): the app / language calls
  `ctx.call('__graphics_flush__', [], 0)` after every top-level evaluation.
- The engine also flushes by itself on `drawnow`, `pause`, `figure`
  creation, `getframe`, `print`/`saveas`/`exportgraphics`, `waitbar`, dialogs
  and after handling every GUI → engine message.
- A flush sends nothing when nothing changed.

## 2. Engine → GUI messages (`ctx.host.post`)

```js
{ type: 'graphics.scene',  figures: [FigureNode...], current: figId|null }   // full snapshot (first flush, 'graphics.sync')
{ type: 'graphics.update', figures: [FigureNode...], current: figId|null }   // only the figures that changed (full trees)
{ type: 'graphics.close',  id: figId }                                       // figure deleted (close, delete, clf reset...)
{ type: 'graphics.mode',   figure: figId, mode: 'zoom'|'pan'|'rotate'|'datacursor'|'none' }  // zoom on / rotate3d on ...
{ type: 'graphics.dialog', id, kind: 'msgbox'|'errordlg'|'warndlg'|'helpdlg', title, message, icon }  // non-blocking
```

## 3. Engine → GUI requests (`ctx.host.request`, blocking; `null` without GUI)

```js
{ type: 'graphics.export', figure: figId, format: 'png'|'svg'|'pdf'|'jpg', width, height, scale, background: 'theme'|'white'|'none' }
   → { data: base64 }                                  // file bytes
{ type: 'graphics.getframe', figure: figId, axes: axesId|null }
   → { width, height, rgba: base64 }                   // raw RGBA, row-major, top row first
{ type: 'graphics.dialog', kind: 'questdlg'|'inputdlg'|'listdlg'|'uigetfile'|'uiputfile', ...options }
   → questdlg: { answer: string|'' }   inputdlg: { values: string[] } | { cancelled: true }
     listdlg: { indices: number[] (1-based) } | { cancelled: true }
     uigetfile/uiputfile: { file, path } | { cancelled: true }
{ type: 'graphics.ginput', figure: figId, n }            → { points: [[x, y, button], ...] }
```

## 4. GUI → engine messages (`engine.post`, routed by `ctx.onMessage('graphics.', fn)`)

```js
{ type: 'graphics.sync' }                                   // send a full 'graphics.scene' again
{ type: 'graphics.current', id: figId }                     // the user picked a figure tab / axes
{ type: 'graphics.currentAxes', id: axesId }
{ type: 'graphics.set', handle, props: { Name: value } }    // GUI changed properties (view, limits, light...) —
                                                            // applied without echo (no update is sent back)
{ type: 'graphics.callback', handle, event: 'ButtonPushed'|'ValueChanged'|'Callback'|'ButtonDown'|'KeyPress'|'CloseRequest'|'SizeChanged',
  props?: { Value: ... } , data?: { ... } }                  // props are applied first, then the callback runs
{ type: 'graphics.close', id: figId }                       // the user closed a figure tab (runs CloseRequestFcn)
{ type: 'graphics.resize', id: figId, width, height }       // figure area size in px (updates Position)
```

Values in `props` are JSON: numbers, number arrays, strings, `[r,g,b]`.

## 5. Nodes

```js
Node = { id: number, type: string, props: { ... }, children: Node[], auto: string[] }
```

- `id` is the handle number. Figures have positive integer ids (`figure(3)` → 3);
  every other object has a non-integer id.
- `auto` lists colour properties that still have their default value; the GUI
  may draw them with theme colours (dark themes) instead of the stored value.
- Colours are `[r, g, b]` (0..1) or a keyword (`'none'`, `'flat'`, `'interp'`, `'auto'`).
- Matrix data (`XData`, `YData`, `ZData`, `CData`, `UData`, `VData`, `WData`,
  `Vertices`, `Faces`, `FaceVertexCData`, `AlphaData`, `ColorData`, `Colormap`)
  is `Mat = { dims: [m, n, (p)], data: number[] }`, column-major (element
  (i,j) is `data[i + j*m]`; RGB images are m×n×3).
- On/off properties are booleans (`Visible: true`).
- Callbacks are sent as `true` when set (`ButtonDownFcn: true`), never as code.
- Handle-valued properties are ids, except the inline ones below.

### Types and the properties the renderer reads

| type | main props |
|---|---|
| `figure` | Number, Name, NumberTitle, Color, Position `[l b w h]` px, Colormap Mat, IsUIFigure, Visible; `props.SgTitle` = inline text node or null |
| `axes` | Kind `'cartesian'`/`'polar'`, Position / OuterPosition (normalized), PositionConstraint, XLim YLim ZLim CLim (always resolved numbers), XTick YTick ZTick, XTickLabel YTickLabel ZTickLabel (string[]), XTickExponent…, XScale YScale ZScale, XDir YDir ZDir, XGrid YGrid ZGrid, XMinorGrid…, GridColor, GridAlpha, MinorGridAlpha, GridLineStyle, Box, Color, XColor YColor ZColor, LineWidth, FontSize, FontName, View `[az el]`, Is3D, DataAspectRatio, DataAspectRatioMode, PlotBoxAspectRatio, PlotBoxAspectRatioMode, Projection, Colormap Mat (resolved), XAxisType YAxisType (`'numeric'`/`'datetime'`/`'categorical'`), XAxisLocation, YAxisLocation, TickDir, Layer, Visible, NextPlot; inline `Title Subtitle XLabel YLabel ZLabel` text nodes, `Legend` legend node or null, `Colorbar` colorbar node or null. Polar: ThetaLim RLim ThetaDir ThetaZeroLocation RTick ThetaTick RTickLabel ThetaTickLabel |
| `line` / `animatedline` | XData YData ZData, Color, LineStyle `'-' '--' ':' '-.' 'none'`, LineWidth, Marker, MarkerSize, MarkerEdgeColor, MarkerFaceColor, MarkerIndices, DisplayName |
| `scatter` | XData YData ZData SizeData CData (Mat; rgb rows or values), Marker, MarkerEdgeColor (`'flat'`), MarkerFaceColor (`'none'`/`'flat'`), MarkerFaceAlpha, MarkerEdgeAlpha, LineWidth |
| `surface` | XData YData ZData CData (Mat), FaceColor, EdgeColor, FaceAlpha, EdgeAlpha, LineStyle, LineWidth, FaceLighting, EdgeLighting, AmbientStrength, DiffuseStrength, SpecularStrength, SpecularExponent, MeshStyle, Marker, CDataMapping |
| `patch` | Vertices (n×2 or n×3), Faces (m×k, 1-based, NaN pads), FaceVertexCData, FaceColor, EdgeColor, FaceAlpha, EdgeAlpha, LineWidth, LineStyle, Marker, FaceLighting, CDataMapping |
| `text` | String (string or string[]), Position `[x y z]`, Units, Color, FontSize, FontWeight, FontAngle, FontName, HorizontalAlignment, VerticalAlignment, Rotation, Interpreter `'tex'|'none'|'latex'`, BackgroundColor, EdgeColor, Margin |
| `image` | CData Mat (m×n or m×n×3), XData `[x1 x2]`, YData, CDataMapping `'direct'|'scaled'`, AlphaData |
| `rectangle` | Position `[x y w h]`, Curvature `[cx cy]`, FaceColor, EdgeColor, LineWidth, LineStyle |
| `light` | Position `[x y z]`, Style `'infinite'|'local'`, Color, Visible, Headlight (camlight headlight: follows the camera) |
| `quiver` | XData YData ZData UData VData WData, Color, LineWidth, LineStyle, AutoScale, AutoScaleFactor, MaxHeadSize, ShowArrowHead, Marker. `Segments`: precomputed `[x1,y1,z1,x2,y2,z2,...]` shafts and `Heads` the same for head strokes |
| `contour` | XData YData ZData, LevelList, Fill, LineColor, LineWidth, LineStyle, ShowText, `Lines: [{level, points:[x,y,...]}]`, `Bands: [{lo, hi, polys: [[x,y,...], ...]}]`, Is3D (contour3: lines at z = level) |
| `bar` | XData YData, BarWidth, FaceColor, EdgeColor, FaceAlpha, LineWidth, Horizontal, BaseValue, `Rects: [[x0,y0,x1,y1], ...]` (data coords, already laid out for grouped/stacked) |
| `histogram` | BinEdges, Values, FaceColor, EdgeColor, FaceAlpha, DisplayStyle, Orientation, `Rects` |
| `area` | XData, `Lower`, `Upper` (stacked), FaceColor, EdgeColor, FaceAlpha, LineWidth |
| `stair` | XData YData (original) + `Path: [x,y,...]` (step path), Color, LineStyle, LineWidth, Marker |
| `stem` | XData YData ZData, BaseValue, Color, LineStyle, LineWidth, Marker, MarkerFaceColor, ShowBaseLine |
| `errorbar` | XData YData, YNegativeDelta YPositiveDelta XNegativeDelta XPositiveDelta, Color, LineStyle, LineWidth, Marker, CapSize |
| `legend` | Entries `[{target: id, label}]`, Location, Orientation, NumColumns, Box, FontSize, TextColor, Color, EdgeColor, Visible, Title |
| `colorbar` | Location, Limits, Ticks, TickLabels, Label (inline text node), Direction, FontSize, Color, Visible |
| `tiledlayout` | GridSize `[r c]`, TileSpacing, Padding; inline `Title`; children are axes (their Position is already computed) |
| `heatmap` | Position, ColorData Mat, XDisplayLabels YDisplayLabels, Title XLabel YLabel, Colormap Mat, ColorLimits, ColorbarVisible, CellLabelFormat, MissingDataColor, FontSize |
| `annotation` | Shape `'line'|'arrow'|'doublearrow'|'textarrow'|'rectangle'|'ellipse'|'textbox'`, X `[x1 x2]`, Y, Position `[x y w h]` (normalized figure units), Color, LineWidth, LineStyle, FaceColor, String, FontSize, HeadStyle |
| `uicontrol` | Style, String, Value, Min, Max, Position `[l b w h]` px from the bottom left, Enable, BackgroundColor, ForegroundColor, FontSize, Callback (bool) |
| `uibutton` `uislider` `uieditfield` `uilabel` `uidropdown` `uicheckbox` `uipanel` | Position px, Text, Value, Limits, Items, Enable, FontSize, ValueChangedFcn / ButtonPushedFcn (bool), EditStyle `'text'|'numeric'` |
| `waitbar` | Value (0..1), Message |

`hggroup` nodes only group children (`pie`, `boxplot`); draw their children.

## 6. Coordinates

- Figure `Position` is in pixels `[left bottom width height]`; the GUI fits the
  figure to its tab and reports the size back with `graphics.resize`.
- Axes `Position` / `OuterPosition` are normalized to the figure (0..1, origin
  bottom left). With `PositionConstraint: 'outerposition'` the renderer fits
  the plot box inside `OuterPosition` leaving room for labels; with
  `'innerposition'` the plot box is exactly `Position`.
- Data → 3D: the plot box is the data box scaled by `DataAspectRatio`; the
  camera looks at the box centre from azimuth `View[0]` and elevation
  `View[1]` (az = 0, el = 0 looks along +y; z is up).
