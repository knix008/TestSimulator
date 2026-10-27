<!-- tour: menubar -->
# Screen layout

![Screen layout](images/help-screen.jpg)

| Area | Description |
| --- | --- |
| Title bar | The window has no separate title bar. The left end of the menu bar shows the **icon · program name · version**, and the right end has the **Minimise · Maximise (Restore) · Close** buttons. Drag an empty part of the menu bar or the name to move the window; double-click to maximise or restore it. Drag the window's edges or corners to resize it |
| Menu bar | **Start · File · View · Tools · Window · Cine · Help**. Every menu item has an icon. On the right are the W / L input, Theme, Settings, Language (flag) and About MyDCMViewer |
| Toolbar | Icon buttons: show the left panel · the properties panel on the right, Open · Folder, Undo · Redo, mouse tools, zoom · zoom level, rulers · scale bar · grid, rotate · flip, Invert (negative), viewport layout, MPR · 3D, DICOM tools, Preset · colour map, Export, Batch. Hover over a button to see what it does |
| Folder tree | The files in the opened folder. The buttons at the top go to the parent folder or refresh; the drive button picks a drive |
| Info panel | **Info · Tags · Histogram · Series** tabs |
| Properties panel (right) | File · View · Window / level · Cine · Display · Measurements — see and change values on the spot |
| File tabs | One tab per open file. Each file remembers its own frame, window, zoom, measurements and undo history |
| Viewer | The image, corner information (patient · study · W/L · zoom), orientation markers (R/L/A/P/H/F) and measurements |
| Frame bar | Only for multi-frame images and videos: play · pause · stop, frame navigation, fps, loop |
| Series bar | Previous · next file when the folder holds several files |
| Status bar | File path, patient summary, size, W/L, the value under the mouse, zoom — drag the **resize grip** at the bottom right to resize the window |

## Right-click menus (context menus)

Every item in every right-click menu has an icon.

![Context menu](images/help-contextmenu.jpg)

- **On the image**: Open file, Fit to window, Actual size, Reset view, Copy image, Export Image, Delete last measurement, Clear measurements, calibration
- **Folder tree**: Open, Show in file manager, Copy · Cut · Paste · Delete, Copy path, Choose folder…, Refresh
- **File tabs**: Close tab, Close other tabs, Close all tabs, Copy path, Show in file manager
- **Input fields · selected text**: Cut, Copy, Paste, Select all

## Resizing

- Drag the dividers to change the sidebar width and the height of the tree / info panel.
- Fold the left panel with the **«** button at the right end of the folder header, and unfold it with the **»** button on the narrow strip left in its place. The **show panel** button at the right end of the toolbar and `F9` do the same. Folding or unfolding the panel re-centres a fitted image.
- The left panel's header (Folder) and tabs (Info · Tags · Histogram · Series) carry icons. When the panel is folded, the strip on the left keeps the same icons with vertical titles; click one to unfold the panel with that part open.
- The **properties panel on the right** shows the information and properties of the current image and lets you change whatever can be changed right there: File, View (zoom · rotation · flip · interpolation), Window / level (W · L · preset · colour map · VOI function · invert), Cine (frame · speed · loop), Display (rulers · scale bar · grid · corner information · orientation · measurements · overlays · units · measurement colour) and the measurement list. Click a section header to fold it, and the **»** in the panel header folds the whole panel. The folded strip keeps each section's icon and vertical title; click one to unfold to that section. The toolbar's **Properties panel** button, the View menu and `F8` also turn it on and off.
- Number fields change one step at a time with the **−** / **+** buttons on either side (hold to repeat), with the value shown in the middle. Sliders also have **−** / **+** buttons on either side, and the current value appears to the right of the **+** button.
- An opened image is always placed in the exact centre of the viewing area. With the rulers on, it is the centre of the area left after the ruler strips.
- Resize the window by dragging its border or the dotted grip at the bottom right of the status bar. Resizable dialogs (MPR · 3D · PACS · tag editing · Help) have the same grip.
