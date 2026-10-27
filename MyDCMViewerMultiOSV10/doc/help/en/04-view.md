<!-- tour: zoom -->
# Viewing images

![Viewing images](images/help-view.jpg)

## Zoom · pan

| Action | How |
| --- | --- |
| Zoom In / Zoom Out | Mouse wheel, `+` / `-`, the magnifying-glass buttons on the toolbar, the zoom number |
| Pan | Left-drag with the Pan tool (1), or middle-drag with any tool |
| Fit to Window | `Ctrl+0`, or double-click with the Pan tool |
| Actual Size (100%) | `Ctrl+1`, or click the zoom number on the toolbar |

## Rotate · flip

- **View › Rotate Left / Rotate Right** (`Ctrl+←` / `Ctrl+→`), **Flip Horizontal** (`H`), **Flip Vertical** (`V`), **Reset View** (`R`).
- **Invert** (`I`) reverses the brightness.
- Every view change can be undone with **Undo** (`Ctrl+Z`) and redone with **Redo** (`Ctrl+Y`).

## On-screen information

| View menu | Description |
| --- | --- |
| Corner information | Patient · study · institution · W/L · zoom · size · slice position |
| Orientation markers | R/L/A/P/H/F at the edges of the screen (when Image Orientation is present) |
| DICOM overlay planes | 60xx overlay graphics and text |
| Show measurements | Hides or shows the measurements |
| Scale bar (`B`) | Draws a bar on the image that shows a real length (for example 5 cm). The length adjusts as you zoom in and out. Drag the bar with the mouse to wherever you want it; the position is remembered for the next session. Turn it on and off with the scale button on the toolbar, the View menu or `B` |
| Rulers (`K`) · Grid (`G`) | Rulers in real units (mm / cm), and a faint grid across the whole view — the bold lines match the rulers' major ticks and the space between them is split into 5 × 5 cells. Zooming in or out re-divides the grid to match the tick spacing |
| Smooth interpolation | Smooths the pixels when zoomed in |

## Info · Tags · Histogram · Series panels

![Tags panel](images/help-tags.jpg)

- **Info**: file, size, patient, study, equipment, transfer syntax, pixel spacing and more
- **Tags**: every DICOM element. Search by name, number or value in the box at the top
- **Histogram**: the distribution of values in the current frame and the current window range
- **Series**: the list of sorted series with previews
