# MyHeatManager Tutorial

This tutorial walks through MyHeatManager on the real screen, from the start page to drawing a model, solving it and reading the results. The same steps run inside the program: **Help › Tutorial** (or **Start the tutorial** on the start page) moves the window for you, with previous / next, auto play and a chapter list on a card at the bottom right.

## Contents

1. Start page
2. Finding your way
3. Drawing a model
4. Materials
5. Heat sources and boundaries
6. Solving
7. Results
8. Advanced studies
9. SimScale-style studies
10. Reliability · U-factor · heat maps
11. Files and output
12. Customizing

## 1. Start page

### 1. Welcome

![Welcome](docs/images/tutorial/en/01-welcome.jpg)

MyHeatManager simulates heat in devices. This tutorial moves the real screen to show the features one by one. Press [Next] on the card at the bottom right, ▶ to play it by itself, or jump to a chapter from the list.

### 2. New model

![New model](docs/images/tutorial/en/02-startNew.jpg)

Start from one of 22 starting points grouped by field — basic (empty 2D / 3D), electronics and power, flow and CHT, energy and materials, structure, building and daily life, space and other. Open, the sample gallery and node-data import are here too.

### 3. Recent files and help

![Recent files and help](docs/images/tutorial/en/03-startRecent.jpg)

Open a model you used recently (✕ removes it from the list). Below are the tutorial, the tutorial document, the user's guide, shortcuts and the batch-run guide.

### 4. Samples and background

![Samples and background](docs/images/tutorial/en/04-startBackground.jpg)

The moving background is one of 20 — heat plume, isotherms, convection cells, infrared camera, vortex street, boiling and more — with shuffle, speed and transparency (also in Settings › Start page). Untick the box below to skip this page at start (🏠 Home brings it back any time).

### 5. Moving and sizing the cards

![Moving and sizing the cards](docs/images/tutorial/en/05-startLayout.jpg)

Drag ⠿ in a card heading to move it and the bottom-right corner to resize it (1–3 columns wide, any height). The arrangement is saved for the next start (Settings › Start page resets it).

### 6. The samples section

![The samples section](docs/images/tutorial/en/06-startSamples.jpg)

All 30 samples sit in their own section with a preview, name, tags and description; click one to open it in a new tab.

## 2. Finding your way

### 7. The tutorial sample

![The tutorial sample](docs/images/tutorial/en/07-openSample.jpg)

The tutorial opens its own sample (a power module) in a new tab — your models are not touched, and at the end the tab closes and the settings it changed go back. Two MOSFETs (6 W each) on a PCB pass their heat through a thermal pad into an aluminium heat sink.

### 8. Menu bar

![Menu bar](docs/images/tutorial/en/08-menubar.jpg)

The top row of the window — instead of a system title bar: the icon, name and version and the 🏠 start-page button on the left, then the File, Edit, View, Model, Simulate, Results, Tools and Help menus, and minimize, maximize and close at the right end. Drag its empty part to move the window; double-click to maximize.

### 9. Workbenches

![Workbenches](docs/images/tutorial/en/09-workbench.jpg)

The workbench at the right end of the menu bar (Geometry · Materials · Loads & BCs · Study · Results · Reliability · Heat map) switches the tool panel on the left to the tools for that job.

### 10. Toolbar

![Toolbar](docs/images/tutorial/en/10-toolbar.jpg)

The everyday commands: new, open, save, undo, drawing tools, fit, 2D/3D, grid, mesh and rulers, ▶ run, result fields and display, panel switches. At the right end: language, theme, settings and about. Drag the size grip in the bottom right corner to resize the window.

### 11. Reset view

![Reset view](docs/images/tutorial/en/11-zoomReset.jpg)

The reset-view button next to zoom (⌖, Ctrl+0) puts the model in the middle of the view at its original scale (100 %). In the 3D view it goes back to the starting view.

### 12. Model tree

![Model tree](docs/images/tutorial/en/12-tree.jpg)

The study, domain, materials, bodies, boundary conditions, probes and results at a glance. Click an item to select it; ◉ next to a body hides it (hidden bodies are left out of the study). « on the panel title bar folds it to a narrow strip with its icon and title.

### 13. Property panel

![Property panel](docs/images/tutorial/en/13-properties.jpg)

Edit the selected item in the right panel. Number fields take − / + buttons, the arrow keys and expressions (e.g. 2*3). With nothing selected, the model name and the study settings show.

### 14. Status bar

![Status bar](docs/images/tutorial/en/14-statusbar.jpg)

The state, cell count, selection, cursor position (mm) and the value under it, the engine (native Rust on the desktop, WebAssembly on the web) and whether the model is saved.

### 15. Folding panels

![Folding panels](docs/images/tutorial/en/15-panelsFold.jpg)

« / » on a side panel's title bar folds it to a narrow strip with its icon and title; click the strip to unfold it.

### 16. Grid, mesh and rulers

![Grid, mesh and rulers](docs/images/tutorial/en/16-viewButtons.jpg)

▦ Grid (G) is the millimetre drawing grid, # Mesh (M) the computational cells, 📏 Rulers the ticks along the whole x and y axes with the cursor. Switch each on and off from the toolbar.

### 17. Right-click menus

![Right-click menus](docs/images/tutorial/en/17-contextMenu.jpg)

Right-click the viewport, a tree item, a tab, the chart or a text field for the commands that fit that place, each with its icon.

### 18. Tabs and < >

![Tabs and < >](docs/images/tutorial/en/18-tabs.jpg)

Every open model has a tab; < > at the right of the tab row step through them, and the wheel scrolls too.

## 3. Drawing a model

### 19. Domain and grid

![Domain and grid](docs/images/tutorial/en/19-domain.jpg)

2D (a section with a thickness) or 3D, the size (mm), the cell counts and the background where there is no body (none = not simulated). Keep cells thinner than the thinnest layer, or the layer drops out of the grid.

### 20. Drawing a rectangle

![Drawing a rectangle](docs/images/tutorial/en/20-drawRect.jpg)

Drag with the rectangle tool (R) to make a body; in 3D it is a box whose height is the z range in the property panel. Here a capacitor was drawn on the right.

### 21. Circles and polygons

![Circles and polygons](docs/images/tutorial/en/21-drawShapes.jpg)

Drag a circle (C) from its centre; click the points of a polygon (P) and double-click or press Enter to close it. Where bodies overlap, the later one's material wins.

### 22. Move, resize, order

![Move, resize, order](docs/images/tutorial/en/22-moveResize.jpg)

Drag bodies with the select tool (V) and resize them with the handles. Bring to front / send to back change the overlap order; undo (Ctrl+Z) and redo (Ctrl+Y) take changes back.

## 4. Materials

### 23. Material library

![Material library](docs/images/tutorial/en/23-library.jpg)

50 materials: metals, electronics, ceramics, building materials, polymers, batteries, fluids, phase change and porous media. Adding one copies it into the model, so the file opens on its own.

### 24. Assigning a material

![Assigning a material](docs/images/tutorial/en/24-assign.jpg)

Select a body and pick from the material list in the property panel. Here the heat sink became copper.

### 25. Material properties and per-axis k

![Material properties and per-axis k](docs/images/tutorial/en/25-anisotropic.jpg)

Pick a material in the model tree to edit its conductivity, density, specific heat, emissivity, modulus and expansion. Directional materials like a PCB get separate kx, ky, kz (this PCB: 25 in-plane, 0.4 through the thickness).

## 5. Heat sources and boundaries

### 26. Heat sources

![Heat sources](docs/images/tutorial/en/26-heatSource.jpg)

Enter a body's heat (W). In a transient study a power schedule (time, W) or a current schedule with a resistance (I²R) varies it over time.

### 27. Boundary conditions

![Boundary conditions](docs/images/tutorial/en/27-convection.jpg)

Fixed temperature, heat flux, convection, radiation, adiabatic, plus flow and structural ones. The fan air here is convection (h = 40 W/m²K, 30 °C). Select a body and pick a condition to put it on that body's outer faces.

### 28. Targets and regions

![Targets and regions](docs/images/tutorial/en/28-boundaryTarget.jpg)

A condition targets an edge, all outer faces or a body, narrowed by a span (part of an edge) or a region (an x0, y0, x1, y1 rectangle). This model splits its outer faces at 4.5 mm height into fan air and the air round the board.

### 29. Probes

![Probes](docs/images/tutorial/en/29-probe.jpg)

A probe (T) records the temperature at a point. Its value shows on the result, and a transient study plots it over time in the chart below.

## 6. Solving

### 30. Study settings

![Study settings](docs/images/tutorial/en/30-studySettings.jpg)

Steady or transient, flow (CHT), natural convection and thermal stress, the time step and end time, the tolerance.

### 31. Checking the model

![Checking the model](docs/images/tutorial/en/31-validate.jpg)

Before solving, finds bodies without a material, no way for heat to leave, bodies thinner than a cell and so on. A model with errors is not solved.

### 32. Running the study

![Running the study](docs/images/tutorial/en/32-run.jpg)

Press ▶ (F5) to solve. A progress bar appears over the viewport and ■ stops it. This model finishes in a moment.

## 7. Results

### 33. Temperature field

![Temperature field](docs/images/tutorial/en/33-temperature.jpg)

Colours and the colour bar show the temperature; hover for the value in the status bar. The MOSFETs are hottest, cooling towards the fin tips.

### 34. Heat flux and vectors

![Heat flux and vectors](docs/images/tutorial/en/34-flux.jpg)

The heat flux field |q| and the vectors show where the heat goes — from the chips through the pad into the sink.

### 35. Isotherms

![Isotherms](docs/images/tutorial/en/35-isotherms.jpg)

Isotherms join points of equal temperature. Where they crowd, the temperature drop (the thermal resistance) is concentrated — here the thermal pad.

### 36. Line cut

![Line cut](docs/images/tutorial/en/36-lineCut.jpg)

Click two points with the line-cut tool to plot the values along the line in the chart below. Here: vertically from a chip to a fin tip.

### 37. 3D view

![3D view](docs/images/tutorial/en/37-view3d.jpg)

In the 3D view (3) a 2D result becomes a carpet plot (value as height and colour); 3D models are coloured on the outer faces of the cells. Drag to rotate, wheel to zoom.

### 38. 3D grid and axes

![3D grid and axes](docs/images/tutorial/en/38-guides3d.jpg)

The 3D view has an endless floor grid and the x, y and z axes. The tick numbers carry the length unit and re-space as you zoom. The grid and the axes always sit behind the bodies, and the numbers are never hidden by the grid. Switch them with the grid and axes buttons; the length unit (mm, cm, m, in) and the temperature unit are set in Settings.

### 39. Bottom chart panel

![Bottom chart panel](docs/images/tutorial/en/39-bottomPanel.jpg)

On the right of the bottom chart panel's title row, ▾ folds it (only the title row stays) and ✕ hides it; the chart-panel button on the toolbar brings it back. Drag the edge above it to change its height.

### 40. Study report

![Study report](docs/images/tutorial/en/40-report.jpg)

Minimum, mean and maximum temperature per body, heat per boundary, the energy balance (generated = removed) and the solver log on one page — save as HTML or print.

## 8. Advanced studies

### 41. Transients and animation

![Transients and animation](docs/images/tutorial/en/41-transient.jpg)

The phase-change heat sink: paraffin melts while it absorbs a 10-minute heat pulse. The frame slider and the animation (Space) show the change over time and the chart the probes — note the flat stretch while it melts.

### 42. Flow and conjugate heat transfer (CHT)

![Flow and conjugate heat transfer (CHT)](docs/images/tutorial/en/42-cht.jpg)

The microchannel sample: water flowing in a channel inside a silicon chip, solved together with the chip's conduction. The velocity field and vectors show the flow.

### 43. Thermal stress

![Thermal stress](docs/images/tutorial/en/43-stress.jpg)

The LED module: von Mises stress from mismatched thermal expansion, and the exaggerated deformed shape.

## 9. SimScale-style studies

### 44. Turbulent flow (k-ω SST)

![Turbulent flow (k-ω SST)](docs/images/tutorial/en/44-turbulence.jpg)

The heated duct: water at Re ≈ 20 000 with the k-ω SST model. The turbulence choice in the study settings and the inlet turbulence intensity are the inputs; the velocity and eddy-viscosity fields and streamlines show the flow.

### 45. Convergence

![Convergence](docs/images/tutorial/en/45-residuals.jpg)

The Residuals tab of the chart panel plots the continuity, u, v, T, k and ω residuals on a log scale; when they have dropped and flattened, the study has converged.

### 46. Flow rates and pressure drop

![Flow rates and pressure drop](docs/images/tutorial/en/46-flowMetrics.jpg)

Select an inlet or outlet: the property panel shows its mass flow, volume flow, mean pressure and temperature; the report gives the pressure drop.

### 47. Joule heating (electric)

![Joule heating (electric)](docs/images/tutorial/en/47-joule.jpg)

The busbar: a 400 A current-in and a ground boundary with the materials' conductivity give the potential, the current density and the Joule heat; the joint, where the current crowds, is hottest.

### 48. Contact resistance

![Contact resistance](docs/images/tutorial/en/48-contact.jpg)

A thermal contact resistance (m²K/W) on the faces where two bodies touch, such as the busbar's bolted joint, adds the temperature step of an imperfect contact.

### 49. Static structural

![Static structural](docs/images/tutorial/en/49-structural.jpg)

The cantilever: a fixed end, a 500 N tip load and its own weight give the displacement and stress (thermal expansion off). The deformed shape exaggerates the deflection.

### 50. Natural frequencies (modal)

![Natural frequencies (modal)](docs/images/tutorial/en/50-modal.jpg)

The L-bracket: the first six natural frequencies and mode shapes; pick a mode above the viewport to see its shape.

### 51. Thermal comfort (PMV)

![Thermal comfort (PMV)](docs/images/tutorial/en/51-comfort.jpg)

The office: ISO 7730 PMV from the temperature and speed of the air moved by natural convection. Near 0 is comfortable; blue zones such as by the window feel cold.

### 52. Bioheat (Pennes)

![Bioheat (Pennes)](docs/images/tutorial/en/52-bioheat.jpg)

The tumour-ablation sample: with blood perfusion, metabolic heat and blood temperature on the materials, the Pennes bioheat equation is solved. Watch the probe chart to see whether the tumour edge passes 50 °C while the electrode heats for ten minutes.

### 53. Fan curve

![Fan curve](docs/images/tutorial/en/53-fanCurve.jpg)

In the fan-enclosure sample the fan boundary uses a fan curve (flow against pressure) instead of a fixed speed. The solver finds the operating point where the curve meets the enclosure's resistance and cools the parts with that flow.

### 54. Parameter study

![Parameter study](docs/images/tutorial/en/54-parametric.jpg)

Solve again and again with one value varied over a range (power, coefficient, inlet speed, conductivity, mesh scale …) and compare a result in a table and chart — here the MOSFET temperature against the fan coefficient.

### 55. Auto mesh

![Auto mesh](docs/images/tutorial/en/55-autoMesh.jpg)

Auto mesh picks cell counts so the thinnest body spans at least two cells. Then solve again with twice the cells: if the result hardly changes, the mesh is fine enough.

## 10. Reliability · U-factor · heat maps

### 56. Reliability (life)

![Reliability (life)](docs/images/tutorial/en/56-reliability.jpg)

From the simulated part temperatures: Arrhenius MTTF and FIT, and Coffin–Manson solder fatigue life, with the system life and the 5-year survival.

### 57. U-factor (envelope)

![U-factor (envelope)](docs/images/tutorial/en/57-uFactor.jpg)

The window frame sample's thermal transmittance U, R-value and coupling coefficient L2D, from the indoor and outdoor convection boundaries (THERM-style).

### 58. Node-data heat maps

![Node-data heat maps](docs/images/tutorial/en/58-heatmap.jpg)

Import node temperatures (Thermal Desktop, SINDA, thermocouple readings) as CSV for a heat map, statistics and the nodes over a limit.

### 59. Thermal analysis (DSC / TGA)

![Thermal analysis (DSC / TGA)](docs/images/tutorial/en/59-thermal.jpg)

Integrate a DSC peak over a baseline for the enthalpy and onset / peak / endset, calibrate against a standard such as indium, and add the result as a phase-change material. TGA gives the mass-loss temperatures and residue.

### 60. CalculiX and DXF

![CalculiX and DXF](docs/images/tutorial/en/60-interop.jpg)

File › Export CalculiX writes the grid, materials and boundaries as a CalculiX input deck (.inp) for the FreeCAD / Gmsh / ParaView workflow; Import DXF brings in a drawing's closed polylines and circles as bodies.

### 61. Batch runs (API)

![Batch runs (API)](docs/images/tutorial/en/61-batch.jpg)

The installed program solves models without a window with --batch, writing a summary JSON, CSV and a heat-map PNG — for comparing design variants from scripts or CI.

## 11. Files and output

### 62. Saving

![Saving](docs/images/tutorial/en/62-save.jpg)

Models are .myheat (JSON) files: save (Ctrl+S), save as (Ctrl+Shift+S). The web version saves as a download.

### 63. Export

![Export](docs/images/tutorial/en/63-export.jpg)

From the File menu export results as CSV (cell values), PNG (the view) or VTK (ParaView), and save or print the report.

### 64. Printing

![Printing](docs/images/tutorial/en/64-print.jpg)

The Print button on the toolbar (right of Save, Ctrl+P) opens the print window. On the left choose the paper size, orientation, margins, what to print (title, viewport picture, colour legend, chart, model tables, result summary, solver log), header and footer, colour or greyscale and the font size; the preview on the right shows every page at once. Print then opens the system print dialog for the printer and the number of copies.

### 65. Sample gallery

![Sample gallery](docs/images/tutorial/en/65-gallery.jpg)

36 samples covering every kind of study and field — choose from the previews and descriptions.

## 12. Customizing

### 66. Themes

![Themes](docs/images/tutorial/en/66-theme.jpg)

The theme button moves to the next theme; ▾ opens all 20 dark and 20 light themes, each in two lines: a strip of its colours (background, panel, button, accent, text) and its name.

### 67. Theme list

![Theme list](docs/images/tutorial/en/67-themeMenu.jpg)

▾ drops the dark and the light themes in two columns, each theme in two lines — its colour strip and its name. At the bottom are your custom theme and "Custom theme settings…" and "Theme settings…", which open those tabs of Settings.

### 68. Settings

![Settings](docs/images/tutorial/en/68-settings.jpg)

Every preference, in tabs: general, theme, custom theme, font, start page, result display, editor, panels, files. Changes show at once; Apply keeps them, Cancel goes back to how it was, Reset to the defaults. The flag switches 한국어 ↔ English — the names on the canvas follow.

### 69. Custom theme

![Custom theme](docs/images/tutorial/en/69-customTheme.jpg)

Settings › Custom theme: start from a theme and change its 13 colours (background, panel, accent …) to make your own; every change shows at once.

### 70. Document windows

![Document windows](docs/images/tutorial/en/70-docWindow.jpg)

Help › User's guide and Tutorial document open in a window of their own that follows the app's theme, also when you change it.

### 71. Windows and menus past the main window

![Windows and menus past the main window](docs/images/tutorial/en/71-popouts.jpg)

In the desktop program dialogs and drop-down menus (menu bar, right-click, theme list) open in windows of their own and may reach past the main window. While a dialog is open the main window is dimmed; clicking it brings the dialog forward. Drag a dialog by its title row. The web version and the tutorial draw them inside the window.

### 72. Done

![Done](docs/images/tutorial/en/72-finish.jpg)

That's the tutorial! The settings go back and the tutorial tabs close. Run it again any time from the 🏠 start page or the Help menu; the tutorial document and the user's guide go into more detail.

---

See the [user's guide](UsersGuide.en.md) for every feature in detail.

© SHKWON (knix008@naver.com)
