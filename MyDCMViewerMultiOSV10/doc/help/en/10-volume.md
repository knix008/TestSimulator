<!-- tour: volume -->
# 3D volume rendering

Draws a series or multi-frame image in 3D on the graphics card (WebGL2). Open it with **Tools › 3D volume rendering** (`Shift+M`) or the cube button on the toolbar.

![3D volume rendering](images/help-volume.jpg)

## Modes

| Mode | Description |
| --- | --- |
| Volume rendering | Draws with a transfer function that gives each value a colour and transparency. Presets: CT bone, CT soft tissue, CT lung, CT angio, MR, Grey ramp. Adjust with *Shift · Opacity · Shading* |
| MIP · MinIP · Average | Maximum, minimum or average value along the line of sight. W / L, *Auto* |
| Isosurface | Surfaces above the threshold, with light and shadow |

## Controls

| Action | How |
| --- | --- |
| Rotate | Left-drag |
| Pan | Right- or middle-drag, `Shift` + drag |
| Zoom | Mouse wheel |
| Reset | Double-click, *Reset view* |
| Preset directions | Anterior · Posterior · Left · Right · Superior · Inferior |
| Clipping | Cut into the volume with the min / max sliders for Columns (X) · Rows (Y) · Slices (Z) to see inside |
| Quality | Fast · Normal · Best |
| Export PNG | Saves the current picture |

> Large volumes are reduced automatically to fit the graphics card's limits, and this is shown next to the title. Uneven slice spacing is shown there too.
