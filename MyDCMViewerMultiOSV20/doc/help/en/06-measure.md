<!-- tour: length -->
# Measuring tools

Pick a tool from the toolbar or the **Tools** menu, or with the number keys. Measurement points can be dragged to a new position with any tool.

![Measurements](images/help-measure.jpg)

| Tool | Key | What it does |
| --- | --- | --- |
| Pan | 1 | Drag to move; double-click to fit to the window |
| Window / Level | 2 | Drag to change W/L |
| Zoom | 3 | Drag up or down |
| Scroll frames / slices | 4 | Step through frames or series files with the wheel or by dragging |
| Pixel probe | 5 | Coordinates, value (HU) and raw value under the mouse |
| Length | 6 | Distance between two points — in mm / cm when pixel spacing is available |
| Angle | 7 | Three points (the second is the vertex) |
| Cobb angle | Shift+7 | The angle between two lines (vertebral endplates) |
| Rectangle ROI · Ellipse ROI | 8 · 9 | Area, pixel count, mean, standard deviation, minimum, maximum |
| Polygon ROI | Shift+8 | Click to add vertices; double-click or press `Enter` to close — area · perimeter · statistics |
| Freehand ROI | Shift+9 | Drag to draw the outline — the same statistics as the polygon |
| Point | Shift+5 | The value at that spot |
| Arrow annotation | Shift+0 | An arrow with a label |
| Text annotation | 0 | A text box |
| Magnifier | Q | Shows that spot at 3× while you hold the button |

## Deleting · undoing

- **Delete last measurement** (`Backspace`), **Clear measurements** (`Del`), **Undo** (`Ctrl+Z`).

## Calibration

Pictures without pixel spacing (Pixel Spacing) show lengths in pixels. Draw a length line over something of known length, then enter the real length (for example `5 cm`) in **Tools › Calibrate this length…**; that ratio is then used for later measurements, the rulers and the grid. **Clear calibration** undoes it.

## Export

- **File › Export Image › Measurements (CSV)**: the type, value, unit and statistics of every measurement.
- When **View › Include annotations in export** is on, measurements are drawn into exported pictures.
- Change the measurement colour in **Settings › Viewer**.
