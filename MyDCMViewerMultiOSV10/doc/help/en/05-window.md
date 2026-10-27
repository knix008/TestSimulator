<!-- tour: window -->
# Window / level and colour maps

The window (width, W) and level (centre, L) set the contrast and brightness of the image. From a wide range of values, such as HU in CT, they spread just the part you want to see across the screen's brightness range.

![Window / level](images/help-window.jpg)

## Ways to change it

| Method | Description |
| --- | --- |
| Right-drag | Works with any tool. Left–right = width (W), up–down = centre (L) |
| Window / Level tool (2) | Change it with a left-drag |
| W / L input fields | In the menu bar, just to the right of the Help menu. Type a number or nudge it with − / + |
| Presets | The list on the toolbar · Window › Presets: Brain, Lung, Bone, Abdomen, Spine, Angio … |
| Auto (`A`) | Minimum – maximum of the current frame |
| From file (`W`) | The window stored in the file |
| Reset window (`Shift+W`) | Back to the initial state |

## VOI LUT and VOI function

If the file contains a VOI LUT, pick it under **Window › VOI LUT**. The **VOI function** can be LINEAR, LINEAR_EXACT or SIGMOID.

## Colour map · invert

Use **Window › Colour map** or the colour map list on the toolbar to view the image in Hot iron, PET, Jet, Rainbow and others instead of grey. Invert (`I`) reverses the brightness, as with MONOCHROME1 images.

> Window and colour maps do not apply to colour or palette images, only to greyscale ones.
