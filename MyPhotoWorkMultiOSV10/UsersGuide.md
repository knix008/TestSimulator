# Users Guide — My Photo Work V1.0

## Start

- Desktop: `npm start`
- Browser: `npm run dev` then open http://127.0.0.1:5173

The first document is a 1280×720 transparent canvas. Use **파일 → 새로 만들기** to pick another size or background.

## Tools

| Shortcut | Tool | What it does |
| --- | --- | --- |
| V | Move | Drag the active layer |
| M / Shift+M | Marquee | Rectangular or elliptical selection |
| L | Lasso | Freehand selection |
| W | Magic wand | Select similar colors (tolerance in the options bar) |
| C | Crop | Drag a box, Enter to apply, Esc to cancel |
| B / E | Brush / Eraser | Paint or erase. `[` `]` change size |
| G / Shift+G | Bucket / Gradient | Fill similar pixels, or drag a linear gradient |
| T | Text | Click the canvas, type, then OK |
| I | Eyedropper | Sample a color from the image |
| H / Space | Hand | Pan the view |
| Z | Zoom | Click to zoom in, Alt-click to zoom out |
| X | Swap | Exchange foreground and background colors |

Ctrl/Cmd+wheel zooms. Wheel or Space-drag pans.

## Layers

The right panel lists layers from top to bottom.

- Eye / lock toggles visibility and editing
- Opacity and blend mode apply while compositing
- New, delete, duplicate, merge down, flatten, and reorder buttons match the **레이어** menu

## Adjustments and filters

**이미지** menu: brightness/contrast, hue/saturation, invert, grayscale, image size, canvas size.

**필터** menu: Gaussian blur, sharpen.

If a selection is active, these change only the selected pixels of the active layer.

## Files

- **열기** replaces the document (images or `.mpw` projects)
- **이미지 가져오기** adds a file as a new layer
- **저장 / 다른 이름으로 저장** writes a layered `.mpw` project
- **내보내기** flattens to PNG, JPG, WebP, AVIF, GIF, or TIFF

Unsaved changes are confirmed before New, Open, Close, or quitting the desktop app.

## View and UI

Zoom in/out, fit on screen, actual pixels, and grid live under **보기**. The status bar shows document size, tool, zoom, selection size, and save state. Use the toolbar to switch Korean/English and dark/light themes.
