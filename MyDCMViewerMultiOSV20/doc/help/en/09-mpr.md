<!-- tour: mpr -->
# MPR · MIP · curved MPR

Stacks the slices of a sorted series or a multi-frame file into a volume and shows the **axial, coronal and sagittal** planes together. Open it with **Tools › MPR / MIP volume view** (`M`) or the toolbar button.

![MPR](images/help-mpr.jpg)

## How to use

1. Open a multi-frame file, or open a folder and choose **Cine › Sort folder as DICOM series**.
2. Press `M` to open the MPR window.
3. Move through each plane with its slider or the mouse wheel. Clicking or dragging in one plane moves the crosshair, and the other two planes follow.

| Item | Description |
| --- | --- |
| Mode | MPR (slice), **MIP** (maximum intensity projection), **MinIP** (minimum), **Average** |
| Slab | Projection thickness (mm) |
| W / L | Window for the whole volume |
| Crosshair | Show or hide |
| Export views (PNG) | Saves the three planes as PNG |

## Curved MPR

Turn on **Curved MPR** and click a path (dental arch, vessel, spine and so on) at least twice on the axial view; the image unrolled along that curve appears below. Use *Clear path* to draw it again.

> Pixel spacing and slice spacing (the median of the position differences) keep the true proportions. Greyscale images only.
