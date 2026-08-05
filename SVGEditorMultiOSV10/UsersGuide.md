# User's Guide

SVG Editor V1.0 lets you draw vector shapes, open and edit existing images, and export to many formats. This guide walks through the interface and each tool.

## Layout

- **Top toolbar** — file actions (New, Open, Add, Save, Export + format), Undo/Redo, zoom and grid, language/theme/about, and window controls.
- **Left panel** — the tool box: Select and Eraser on top, then collapsible groups (Basic, Advanced, Lines / connectors).
- **Canvas** — the drawing surface. Scroll to pan, mouse-wheel to zoom, right-click for a context menu.
- **Right panel** — the live SVG source and the properties of the selected shape.
- **Status bar** — canvas size, zoom, shape/image counts, grid state, and current selection.

## Files

- **New file** — starts an empty document (prompts to save unsaved changes first).
- **Open** — replaces the document with the chosen file. Supports `.svg`, `.png`, `.jpg`, `.gif`, `.tif/.tiff`, `.webp`, `.avif`.
- **Add** — imports a file *into* the current document instead of replacing it.
- **Save** — downloads the artwork as `.svg`.
- **Export** — opens options to export `PNG / JPG / WebP / AVIF / GIF / TIFF / SVG`. Enable **Remove background and trim bounds** to export only the tight bounding box of the artwork.

### Opening complex SVGs

Imported `<path>` artwork keeps its exact geometry: curves render smoothly and shapes with holes (compound paths) keep their fill rule. Each imported element becomes a selectable, editable shape.

## Selecting and editing

- **Select tool** — click a shape to select it; drag to move. Drag a corner handle to resize. Drag on empty canvas to marquee-select multiple shapes.
- **Eraser tool** — click a shape to delete it.
- **Right-click menu** — Duplicate, Bring forward, Send backward, Delete.
- **Keyboard** — `Delete` removes the selection, `Ctrl/Cmd+Z` undoes, `Ctrl+Shift+Z` or `Ctrl+Y` redoes, `Esc` cancels the current action and returns to Select.

When one shape is selected, the right panel shows its properties: name, X/Y/W/H, fill (with a **No fill** toggle for transparent), border color/width, opacity, a 3D shadow effect, and — for text — font, size, weight, style, and alignment. Connectors add line-style and end-marker options.

## Drawing tools

### Basic

Rectangle, Square, Rounded rectangle, Ellipse, Circle, Text, Freehand pen, and the Bezier pen. For most of these, drag on the canvas to define the shape. Text drops an editable text box; edit its content in the right panel.

### Advanced

Polygon and curve shapes: Triangle, Diamond, Pentagon, Hexagon, Octagon, Star, Trapezoid, Parallelogram, Chevron, Cross, and Curve. Drag to size them.

### Lines / connectors

- **Line** — drag to draw a straight line.
- **Connector** — click one shape, then another, to draw a link between them that follows the shapes when they move. Choose the line style (straight / elbow / curve) and start/end markers in the properties panel.

### Bezier pen (curved paths)

The Bezier pen creates a true vector path with smooth curves:

1. Pick the **Pen (curves)** tool in the Basic group.
2. **Click** to place a corner anchor, or **click-and-drag** to place an anchor with curve handles (drag length/direction shapes the curve).
3. Keep adding anchors. A live preview shows the path, anchors, and handles.
4. **Finish** by:
   - clicking the **first anchor** to close the shape, or
   - **double-clicking** / pressing **Enter** to finish an open path, or
   - simply switching tools (finishes the open path).
5. Press **Esc** to cancel the path in progress.

New pen paths start with no fill (outline only); add a fill from the properties panel if you want a filled shape.

## View

- **Zoom** — toolbar +/- buttons, the percentage button (reset to 100%), or the mouse wheel. **Reset** re-centers the artwork.
- **Grid** — toggle the alignment grid.
- **Panels** — drag the separators to resize the left and right panels.

## Preferences

Language (Korean/English), theme (dark/light), zoom, grid, panel widths, export format, and tool-group expansion are remembered between sessions.
