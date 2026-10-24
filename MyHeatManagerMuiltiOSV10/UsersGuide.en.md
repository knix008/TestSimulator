# MyHeatManager User's Guide

MyHeatManager **simulates heat in devices** — electronics, batteries, building envelopes, spacecraft hardware. Draw a 2D section or a layered 3D model, give it materials, heat sources and boundary conditions, and solve: temperature, heat flux, flow and stress fields, life estimates and heat maps.

The **Rust engine** does the computing: natively in the desktop program (Windows · macOS · Linux) and, compiled to WebAssembly, inside the browser in the web version. The installed program needs nothing else — no Node.js.

## What it does

| Feature | Description | Tools known for it |
|---|---|---|
| Steady and transient conduction | 2D and 3D, anisotropic and temperature-dependent conductivity | Ansys Workbench, SOLIDWORKS Simulation |
| Convection and radiation boundaries | Coefficient h, emissivity with surroundings (deep space 3 K too) | all of them, THERM |
| Phase change | Apparent heat capacity, melting range and latent heat, liquid fraction | COMSOL Heat Transfer Module |
| Flow + conjugate heat transfer | 2D incompressible flow, forced and natural (Boussinesq) convection, solids and fluids solved together | SimScale, STAR-CCM+, SOLIDWORKS Flow |
| Turbulence | k-ω SST, convergence plot, flow rates and pressure drop | SimScale, Fluent |
| Fan curve | The operating point where the pressure–flow curve meets the enclosure's resistance | Icepak |
| Porous media | Darcy–Brinkman drag, effective conductivity | COMSOL |
| Microfluidics | Flow and heat transfer in µm-scale channels | COMSOL |
| Joule heating · contact resistance | Electric potential (voltage, ground and current-in boundaries), temperature-dependent resistance, joint resistance | SimScale, COMSOL |
| Bioheat | Pennes equation (blood perfusion, metabolic heat, blood temperature) | COMSOL |
| Thermal stress · static structural · modal | Plane stress / strain, 3D, pressure and force loads, self weight, natural frequencies | Ansys, Simcenter 3D |
| Batteries | Joule heating I²R from a current schedule, drive-cycle transients | Simcenter |
| Thermal comfort | ISO 7730 PMV and PPD | SimScale |
| Parameter study | Solve again and again with one value varied and compare | SimScale |
| Thermal analysis | DSC enthalpy and melting point, TGA decomposition temperatures, a phase-change material from a DSC peak | instrument software |
| Reliability | Arrhenius life and FIT, Coffin–Manson solder fatigue, series system life | Ansys Sherlock |
| Envelope U-factor | Thermal transmittance of window and wall sections, L2D, condensation and mould risk (fRsi, dew point) | THERM |
| Heat maps and batch API | Node temperature CSV → heat map and statistics; command-line batch runs (JSON, CSV, PNG) | NASA Heat Analysis Manager |
| Interchange | CalculiX `.inp` export, DXF import, CSV · PNG · VTK export | FreeCAD · Gmsh · ParaView |

## The window

The layout is the MyCAD one.

### Title row and menu bar

There is no system title bar. One top row holds, in order:

- The program icon · **MyHeatManager** · the version, then after a fixed gap **the name of the open model** (in a fixed-width slot, shortened with … when too long).
- The **🏠 Home** button (opens / closes the start page) — just left of the File menu.
- The File · Edit · View · Model · Simulate · Results · Tools · Help menus. With one menu open, hovering another switches to it.
- The **workbench selector** (Geometry · Materials · Loads & BCs · Study · Results · Reliability · Heat map (HAM)) — changes the content of the left tool panel.
- The minimize · maximize · close buttons at the right end (desktop).

Drag the empty part to move the window (snapping to screen edges included); double-click to maximize. Resize by the window border or the **size grip** at the bottom right of the status bar. The window never gets narrower than **the width that shows every toolbar button** (re-measured when the font size or the language changes).

### Toolbar

From the left, these groups are separated by dividers. Hover a button for its name, description and shortcut.

| Group | Buttons |
|---|---|
| File | **New model** (document icon) · Open · Save · **Print** (right of Save) |
| Edit | Undo · Redo |
| Drawing | Select · Rectangle · Circle · Polygon · Probe |
| View | Fit view · 2D view · **3D view** (shaded cube icon) · Grid · Mesh · Axes · Rulers |
| Solve | **▶ Run study** (blue; shown pressed while running) · **■ Stop** (red; enabled only while a study runs) |
| Results | Temperature · Heat flux · Velocity · Von Mises stress · Isotherms · Vectors · Streamlines · Animate |
| Study | 📊 Parameter study |
| Panels | Tool panel (left) · Property panel (right) · Chart panel (bottom) — drawn icons |
| Zoom | − · zoom value · + · **⌖ Reset view** (Ctrl+0) |

**Reset view** puts the model in the centre of the viewport at its original scale (100 %); in the 3D view it returns to the starting view. **Fit view** (F) scales the model to fill the viewport.

At the right end: **language** (switches to the other language — the Union Jack on the Korean screen, the Taegukgi on the English one), **theme** (click for the next theme of the same brightness) and the **▾ theme list**, **⚙ settings** and **about**.

### Theme list

▾ opens the theme list.

- **Dark themes** and **light themes** in two columns, each running down (20 each).
- Each theme is a two-line tile — a colour strip on top (background, panel, button, accent, text), its name below. The current theme is highlighted.
- At the bottom, the **Custom theme** row holds your theme's tile and **Custom theme settings…** and **Theme settings…**, which open the settings window on the *Custom theme* and *Theme* tabs.

### Panels

- **Left panel (tools · model tree)**: the workbench's tool groups above the **model tree** (study · domain · materials · bodies · boundaries · probes · results). Group headings fold. The ◉ next to a body hides it (hidden bodies are left out of the study).
- **Right panel (properties)**: properties of the selected body, boundary, probe or material; with nothing selected, the model name, the study settings and the result summary.
- Each side panel's title bar has an icon, its title and a **fold button** (« / »). Folded, a narrow strip with the icon and the title written downwards is left; click it to unfold.
- **Bottom chart panel**: its title bar has an icon and the *Chart* title, the tabs (Probes · Line cut · Body maximum · Residuals (convergence)), and on the right **fold** (▾ / ▴) and **hide** (✕). Folded, only the title bar stays; a hidden panel comes back with the chart-panel button on the toolbar. Drag the bar above it to resize. Right-click the chart for *Save chart image…*.
- The three panel buttons on the toolbar hide or show a panel altogether.

### Tabs and viewport

- Each model gets a tab. The **< >** buttons are always at the right end of the tab row and scroll overflowing tabs back and forth (greyed out when there is nothing further that way); **+** beside them is a new model. Right-click a tab for *Close other tabs*.
- The viewport has rulers, a colour bar and the frame slider.
- **View buttons**: ▦ **Grid** (G) — the millimetre drawing grid (finer as you zoom in, the x and y axes through the origin in the accent colour), # **Mesh** (M) — the computational cell boundaries, ⊹ **Axes** — the x, y, z axes and ticks of the 3D view, 📏 **Rulers** — major and minor ticks along the visible x (bottom) and y (left) with the cursor position, 🏷 **Labels** (View menu) — body and probe names.
- **Status bar**: state, cells, selection, cursor position (in the length unit of the settings) and the value under it, engine (native / WebAssembly), saved state and the file path.

## 3D view

The **3D view** (3) shows the bodies as solids before a study and the result afterwards (3D models: the outer faces of the solved cells in colour; 2D models: a carpet plot with the value as colour and height). Rotate with the left button, pan with the right, zoom with the wheel.

- **Infinite grid**: an endless grid on the z = 0 plane. Its spacing follows the zoom and it fades towards the horizon.
- **Axes**: the x, y, z axes with ticks. The length unit is on the tick numbers (e.g. `20 mm`); beside the axis ends are just the axis names **X · Y · Z**. Zooming re-ticks the axes in steps of 1, 2 or 5.
- The grid and the axes are drawn **behind the bodies**, so they never cover them, and the tick numbers are never covered by the grid.
- Grid (G) and axes switch on and off from the toolbar and the View menu. The **length unit** (mm · cm · m · in) and the **temperature unit** (°C · K · °F) are set in Settings › General; the length unit is used by the rulers, the axis ticks and the cursor position alike.
- **Reset view** (Ctrl+0) returns to the starting view; **Fit view** (F) shows the whole model.

## Dialogs and menu windows

In the desktop program, **dialogs** and **drop-down menus** (the menu bar's menus, right-click menus, the theme list) open in **windows of their own**, so they can reach past the main window even when it is small.

- While a dialog is open the main window is dimmed; clicking the dimmed main window brings the dialog forward.
- A menu window closes when you click elsewhere (it loses focus) or press Esc.
- In the **web version** dialogs and menus open inside the page. **During the tutorial** they stay in the page too, so the tutorial can point at them.
- Lists in dialogs, such as the material library, **keep their scroll position** when you pick an item.

## Settings

Open **Tools › Settings…** or ⚙ on the toolbar. Pick a tab on the left; its settings appear on the right, and changes **show at once** (live preview).

| Tab | Settings |
|---|---|
| General | Language, temperature unit (°C · K · °F), length unit (mm · cm · m · in), workbench, run again after edits, ask to save when closing |
| Theme | Dark themes · light themes · the custom theme swatch |
| Custom theme | Start from a theme, brightness (dark/light), a colour picker per colour token, use this theme |
| Font | Font (installed fonts), font size (10–20 px), preview |
| Start page | Show the start page at start, moving background (20), background transparency, speed, a different background at every start, start page layout reset |
| Result display | Colour map (Turbo · Inferno · Viridis · Cool–warm · Ironbow (IR) · Grey) with a preview, colour steps (smooth · 8–20), number of isotherms |
| Editor | Snap step (off · 0.05–10 mm), grid · mesh · rulers · labels |
| Panels | Show the tool, property and chart panels, fold the side panels, panel width, chart height |
| Files | The recent file list (✕ removes one), clear recent list |

The buttons below: **↺ Reset** (every setting back to its default; recent files stay) · **Cancel** (back to the settings the window opened with, and close) · **Apply** (keep the current settings and close).

## Start page

The program opens on the **start page** (**🏠 Home** on the menu bar, or Help › Start page, brings it back any time).

- At the top: the program name and tagline, **User's guide** and **Tutorial document** buttons and **Start the tutorial**. Until you have finished the tutorial, a banner invites you to it.
- **New**: starting points grouped by field — *Basic* (empty 2D, empty 3D model), *Electronics · power* (electronics cooling, PCB components, power module (DBC), liquid cold plate), *Flow · CHT* (turbulent flow, data centre, natural convection, microfluidics), *Energy · materials* (battery pack, phase-change storage, Joule heating, solar module), *Structure* (static structural, natural frequencies, thermal stress), *Building · daily life* (building envelope, thermal comfort, floor heating), *Space · other* (spacecraft, cooling mug). Below: Open, New from sample and Import node data.
- **Recent files** (✕ removes one; *Clear recent list*) and **Help**: the tutorial, the tutorial document, the user's guide, shortcuts and the batch-run guide.
- **Moving background**: 20 of them — heat plume, isotherms, convection cells, embers, heat map, streamlines, waves, aurora, particles, circuit board, infrared camera, heat diffusion, flames, steam, sun rays (radiation), vortex street, boiling, melting crystals, heat pipe, thermometer bars. **Shuffle**, **speed** (0–300 %), **background transparency** (0–95 %; higher fades the background) and *a different background at every start*. The colours follow the theme; the same settings are in Settings › Start page.
- **Samples**: a section of its own with the 36 samples, each with a preview, its name, tags and description. Click one to open it in a new tab.
- Untick *Show the start page at start* at the bottom to go straight to the editor.

### Moving and resizing the cards

The start page's cards (New · Recent files · Moving background · Samples) can be arranged freely.

- Drag the **⠿** in a card's heading: a translucent silhouette of the card follows the pointer, a dashed placeholder shows where it will land and the other cards slide aside to make room.
- Drag the **size grip** at a card's bottom right to change its width (1–3 columns) and height. **Double-click** it for the automatic height.
- The arrangement is saved for next time. Settings › Start page › *Start page layout* › **Reset** goes back to the original arrangement.

## Tutorial

**Start the tutorial** (start page) or **Help › Tutorial** moves the real screen step by step: the start page, finding your way, drawing, materials, heat sources and boundaries, solving, results, advanced studies, SimScale-style studies, reliability / U-factor / heat maps, files and output, customizing — **12 chapters, 72 steps**.

- The card at the bottom right: the step, ⏮ previous · ▶ auto play · next ⏭, the chapter list and ✕ to end. Drag its header to move it.
- The part of the window the step is about is outlined in yellow.
- The tutorial works on **samples of its own** (Tutorial: power module and others) in new tabs; at the end it closes them and puts back the settings it changed (theme, panels, workbench). Your models are not touched.
- **Help › Tutorial document** shows the same steps with screenshots in one document.

## User's guide and tutorial document windows

**Help › User's guide** (F1) and the **tutorial document** open in **a separate window**. The document window takes the program's theme colours and follows when you change the theme while it is open. The language switch at the top shows the other language's flag — the Union Jack on the Korean page, the Taegukgi on the English page. A table of contents of the headings is on the left.

## Quick start

1. Open **File › New from sample…** or pick from the **Samples** section of the start page (36 of them, see [Samples](#samples)).
2. Click a card: the model opens in a new tab.
3. Press **▶ Run study** (F5). A progress bar appears over the viewport; ■ stops it.
4. The temperature field and its colour bar appear. Use the field selector (top left of the viewport), isotherms and vectors on the toolbar, and the **3D view** (3).
5. **Results › Study report…** lists body temperatures, boundary heat flows and the energy balance; save it as HTML, or print with **Print…** (Ctrl+P).

## Samples

There are 36 samples. Open them from **File › New from sample…**, the Samples section of the start page or the New starting points. The installer also carries them as `samples/*.myheat` files.

| Sample | Dimension · study | What it shows |
|---|---|---|
| Tutorial: power module | 2D steady | Two MOSFETs and a gate driver pass their heat through a thermal pad into a heat sink cooled by fan air (convection) |
| CPU heat sink (forced-air CHT) | 2D steady | Duct air cools a CPU heat sink and parts — conjugate heat transfer |
| PCB component layout (3D) | 3D steady | Components on a 4-layer PCB cooled by natural convection and radiation; reliability (life) estimate |
| IC package warpage (3D thermal stress) | 3D steady | Stress and warpage from mismatched expansion of die, mould, substrate and copper lid |
| Battery pack drive cycle (transient) | 2D transient | I²R heat of five pouch cells, cooled through fins into a liquid cold plate |
| Window frame section U-factor (THERM-style) | 2D steady | U-factor of an aluminium frame with a thermal break and argon double glazing |
| Steel-stud wall thermal bridge (THERM-style) | 2D steady | U-factor of a steel-stud bridge and the coldest indoor surface (condensation risk) |
| Phase-change heat sink (transient) | 2D transient | Paraffin (RT35) melts while absorbing a 10-minute heat pulse, then solidifies |
| Microchannel cooler (microfluidics) | 2D steady | A 300 µm water channel in a silicon chip removes 50 W/cm² |
| Porous metal-foam heat exchanger | 2D steady | A copper foam (Darcy–Brinkman) in a water channel carries heat into the water |
| Natural convection in an enclosure | 2D steady | Buoyant air carries heat from a hot part to the cool walls |
| Brake disc, repeated stops (transient) | 2D transient | Friction heat from a stop every 30 s builds up in a cast-iron disc and is shed |
| LED module thermal stress | 2D steady | LED temperature on a metal-core PCB and solder / package stress (plane stress) |
| Satellite radiator panel (radiation) | 3D steady | In vacuum, heat spread by a heat pipe radiates to deep space (3 K); heat map |
| Heated duct, turbulent (k-ω SST) | 2D steady | Turbulent water at Re ≈ 20 000 and wall heat transfer; pressure drop, outlet temperature |
| Data centre hot / cold aisle | 2D steady | Raised-floor cold air → server racks (porous + heat) → hot aisle; recirculation |
| Office thermal comfort (PMV) | 2D steady | A **60 °C hot-water radiator** under a cold window; PMV/PPD at a seated occupant (**skin 34 °C**) |
| Busbar joint Joule heating | 2D steady | **200 A** through a bolted copper–aluminium joint — current density, Joule heat, contact resistance |
| Fuse element (Joule heating, transient) | 2D transient | Current crowds in the narrow neck, which heats first; temperature-dependent resistance |
| L-bracket natural frequencies (modal) | 2D steady | The first six natural frequencies and mode shapes of a wall-mounted L-bracket |
| Cantilever static structural | 2D steady | 500 N at the tip plus self weight; deflection and bending stress against beam theory |
| LED street lamp, natural convection | 2D steady | The buoyant plume and temperatures between the fins of a 60 W LED housing |
| Tube-bank heat exchanger (turbulent cross-flow) | 2D steady | Air past staggered 80 °C copper tubes: wakes, heat per tube, pressure drop |
| Electric motor stator section | 2D steady | Steady temperature of a silicon-steel stator with 12 coils (6 W copper loss each) |
| Solar module over a day (transient) | 2D transient | The daily cell temperature of a glass / EVA / cell / backsheet section (sky radiation included) |
| IGBT liquid cold plate | 2D steady | Three IGBTs (150 W each) on a water-cooled plate — hotter downstream |
| Heat loss of an insulated steam pipe | 2D steady | Heat loss per metre and jacket temperature of a 150 °C steam pipe (try a parameter study) |
| Balcony slab thermal bridge (THERM-style) | 2D steady | Heat flow of a concrete slab through an insulated wall, the coldest indoor corner, fRsi |
| Thawing ice (phase change) | 2D transient | −10 °C ice and its tray in a 25 °C room — melted fraction, time spent at 0 °C |
| Mass concrete heat of hydration (transient) | 2D transient | Three days of hydration heat in a 2 m foundation; core-to-surface difference (crack risk) |
| Induction pan heating water (transient) | 2D transient | 2 kW into the pan bottom; heat lost into the hob, the bottom and water warming up |
| Tumour RF ablation (bioheat) | 2D transient | An electrode heats a liver tumour for 10 minutes; does it reach 50 °C (cell death) with the Pennes equation |
| Fan-cooled enclosure with a fan curve (Icepak-style) | 2D steady | The operating point where the fan curve meets the enclosure's (and filter's) resistance; part temperatures |
| Power module on a DBC substrate (3D thermal stress) | 3D steady | 3D temperature of four IGBT dies (60 W each) on a DBC substrate; solder and ceramic stress |
| Hydronic floor heating section | 2D steady | How even the floor is over 40 °C pipes 150 mm apart, and the heat lost downwards |
| Cooling coffee mug (transient) | 2D transient | 80 °C coffee cools by natural convection and radiation over 30 minutes |

## Building a model

### Domain and grid

Set in **Model › Domain & mesh…** (or *Domain* in the model tree):

- **Dimension**: 2D (a section; *depth* is the thickness perpendicular to it) or 3D (*depth* is the z extent).
- **Width, height, depth** (mm) and the **cell counts**; cell size = size / count. A layer thinner than one cell (solder, TIM) can be missed — refine the grid (the model check warns you). **⊞ Auto mesh** chooses cell counts so the thinnest body spans at least two cells.
- **Background**: the material where there is no body (e.g. air). *None* leaves those cells out — for solid-only models whose outer faces get convection or radiation.

### Drawing bodies

- **Rectangle** (R): drag. In 3D it becomes a box; set its *z range* in the property panel.
- **Circle** (C): drag from the centre. A cylinder in 3D.
- **Polygon** (P): click the points; double-click, Enter or a click on the first point closes it. Esc cancels.
- **Select** (V): drag a body to move it, drag the handles to resize, Shift/Ctrl+click for several. Drag empty space or with the middle/right button to pan; the wheel zooms.
- Where bodies overlap, **the later (upper) body's material wins**; *Bring to front / Send to back* change the order. Draw PCM pockets over an aluminium case and only the pockets become PCM.
- **File › Import DXF…** brings in the closed polylines and circles of a DXF drawing as bodies (the domain grows to fit the drawing if it is too small).
- The snap step is in Settings › Editor.

### Materials

The **material library** (🧱) has metals, electronics materials (silicon, FR-4, effective PCB, solder, TIM, graphite), ceramics and glass, building materials, polymers and composites, battery cells, fluids (air, water, glycol, oil, dielectric coolant), phase-change materials (paraffin, ice, salt hydrate) and porous media (metal foams, packed beds). **Add to model** copies a material into the model, so files open without the library.

- Leave **per-axis k** (kx, ky, kz) empty to use k. A PCB section has a large kx (in-plane) and a small ky (through the thickness).
- **Kind**: solid · fluid (needs viscosity μ and expansion β) · phase change (melting point, range, latent heat, liquid k) · porous (porosity ε, permeability K, pore fluid).
- Structural: Young's modulus E, Poisson's ratio ν, expansion coefficient α. Electric: **electrical conductivity σ** (MS/m) and the **temperature coefficient of resistance** (σ = σ₀ / (1 + αR(T − 20))).
- The bioheat properties **blood perfusion** (1/s), **metabolic heat** (W/m³) and **blood temperature** (°C, 37 by default) have no fields in the material editor; as in the *Tumour RF ablation* sample, the values in the model file (`perfusion`, `metabolic`, `bloodT`) are used.
- **Tools › Thermal analysis (DSC/TGA)…** can make a phase-change material from a DSC melting peak and add it to the model (see [Thermal analysis](#thermal-analysis-dsc--tga)).
- Select bodies and pick the *material* in the property panel, or press **Assign material** in the library.

### Heat sources

Select a body and enter its **heat** (W). It is spread evenly over the body's cells; in 2D it is the heat of a slice as thick as the depth.

- **Power schedule**: one `time (s), W` per line, interpolated in transient studies (pulses, duty cycles, hydration heat that fades with time).
- **Current schedule** + **resistance** (Ω): one `time (s), A` per line; heat = I²R (battery drive cycles).

### Boundary conditions

Pick them from the Loads & BCs workbench or the Model menu. With bodies selected the condition goes on their outer faces; otherwise on the default target (all outer faces / the matching edge). Edit the **type**, the **target** and the values in the property panel.

| Type | Values | Notes |
|---|---|---|
| Fixed temperature | T | |
| Heat flux | q (W/m², + = into the model) | |
| Convection | h, fluid temperature, (emissivity) | an emissivity adds radiation |
| Radiation | emissivity, surroundings | alone in vacuum (space) |
| Adiabatic | — | symmetry planes, cuts |
| Contact resistance | R (m²K/W) | between a body and its neighbours |
| Inlet / outlet / opening | velocity, inlet temperature (turbulence intensity and mixing length with turbulence) | flow (CHT), 2D edges only; the property panel also offers wall and slip |
| Fan | fan curve `[[Q, Δp], …]`, inlet temperature | flow, 2D edge; for now set only in the model file (*fan-cooled enclosure* sample) |
| Voltage / ground / current in | V / 0 V / I (A) | Joule heating |
| Fixed support / rollers | — | thermal stress and structural supports (rollers from the type in the property panel) |
| Pressure load / force load | p (kPa) / Fx · Fy (· Fz) (N) | static structural |

- **Target**: left, right, bottom or top edge (front/back in 3D too), *all outer faces*, or one body.
- **Span**: part of an edge only (e.g. a flux on 2–8 mm of the bottom edge).
- **Region** `x0, y0, x1, y1`: only faces inside that rectangle. This splits *all outer faces* into an outdoor side (x < 32) and an indoor side, as in the window frame.
- When several conditions reach one face: body target > edge target > all outer faces, and the later one in the list wins within a class. Faces without a condition are adiabatic.

### Probes

The **probe** tool (T) records the temperature at a point: over time in the chart panel for transient studies, and as a label on the result.

## Studies

Set in **Simulate › Study settings…** or in the property panel (nothing selected):

- **Steady state**: the equilibrium. Radiation and temperature-dependent k are iterated (Picard).
- **Transient**: end time, time step, stored frames, initial temperature; backward Euler (unconditionally stable). A large step is fast but misses quick changes.
- **Flow (CHT)**: solves the flow in fluid and porous regions too (2D). Forced convection needs an inlet (or a fan) and an outlet; **natural convection** uses gravity and the reference temperature. **Turbulence (k-ω SST)** replaces laminar flow with the turbulence model. If the *flow iterations* run out, the status bar warns.
- **Joule heating (electric)**: solves the electric potential and adds the heat of the current to the thermal study.
- **Thermal stress**: computed from the final temperature. Without supports only rigid-body motion is removed (free expansion). 2D uses plane stress (or *plane strain*). Untick *Include thermal expansion* and give only loads and *self weight (gravity)* for a static structural study.
- **Natural frequencies**: as many natural frequencies and mode shapes as the number of modes.
- **Check model** (✔) reports bodies without material, no way for heat to leave, flow without fluid, too many cells, an invalid fan curve and so on. A model with errors is not solved.
- **Run again after edits** (Settings) re-solves after every change.

Editing the model after a study shows *model changed — run again* on the viewport.

## Results

- **Fields**: temperature · heat flux |q| · velocity · pressure · turbulent viscosity · von Mises stress (MPa) · displacement (µm) · mode shape · liquid fraction · electric potential · current density · thermal comfort (PMV). Fields the result does not have are greyed out.
- **Isotherms**, **vectors** (heat flux; velocity on flow fields), **streamlines**, **deformed shape** (exaggerated displacement).
- **Animate** (Space) and the frame slider play transient results; the temperature colour range stays the same over all frames.
- **Line cut**: click two points; the values along the line appear in the chart panel.
- **3D view**: see [3D view](#3d-view). For a 3D model in the 2D view, the **layer (z)** selector at the top left picks the section.
- The status bar shows the value under the cursor. The temperature unit is in Settings › General; the colour map, colour steps and number of isotherms in Settings › Result display.
- Export (File menu): **CSV** (per-cell values), **PNG** (viewport), **VTK** (every field, for ParaView and others), **CalculiX (.inp)** (grid, materials and boundaries as a CalculiX input deck — the FreeCAD / Gmsh / ParaView workflow), **study report** (HTML), **print**.

## SimScale-style studies

Switch them on from the Simulate menu and the Study workbench. Result fields are active only when the result has them.

| Feature | Where | Input | Result |
|---|---|---|---|
| Turbulent flow (k-ω SST) | 🌀 Turbulence · Study settings › Turbulence | Inlet turbulence intensity and mixing length | Eddy viscosity νt, maximum y+, wall heat transfer |
| Convergence | automatic | — | Chart panel › Residuals (continuity, u, v, T, k, ω, log₁₀) |
| Flow boundary figures | automatic | — | Mass flow, volume flow, mean pressure and temperature of inlets/outlets, pressure drop |
| Fan curve | Fan boundary (model file) | Pressure–flow curve | The flow at the operating point where the curve meets the enclosure's resistance, and the temperatures with it |
| Contact resistance | ⫴ Contact resistance | Body target, R (m²K/W) | The temperature step across the joint |
| Joule heating (electric) | ⚡ Joule heating | Material conductivity σ and resistance temperature coefficient; ⚡ voltage, ⏚ ground, ⇢ current-in boundaries | Potential V, current density |J|, current / power / resistance per boundary |
| Bioheat (Pennes) | Material perfusion, metabolic heat, blood temperature (model file) | — | Tissue temperature with perfusion cooling and metabolic heat |
| Static structural | ⚖ Thermal stress + Study settings › untick thermal expansion | ⚓ fixed, ⤓ pressure, ➘ force loads, self weight | Displacement, von Mises stress, deformed shape |
| Natural frequencies (modal) | 〜 Natural frequencies | Number of modes, fixed supports | Frequency per mode (Hz), mode shapes (pick the mode above the viewport) |
| Thermal comfort (PMV) | Results › Thermal comfort (PMV) | A flow result with air | ISO 7730 PMV (−3 … +3), PPD — computed for 1.2 met, 0.5 clo and 50 % relative humidity |
| Streamlines | ➰ Streamlines | A flow result | Lines along the velocity with direction arrows |
| Parameter study | 📊 Parameter study | The value to vary (body power, boundary values, inlet speed, material conductivity, mesh scale, ambient), range and steps | A table and chart of a result (max temperature, body, probe, boundary heat, pressure drop, stress), [Apply] |
| Auto mesh | ⊞ Auto mesh | — | Cell counts so the thinnest body spans two cells |

The **parameter study** solves copies; the open model is not changed until you press **Apply** on a row of the table.

Compressible flow, multiphase (VOF), lattice-Boltzmann wind comfort and electromagnetics are not supported.

## Thermal analysis (DSC / TGA)

**Tools › Thermal analysis (DSC/TGA)…** (also on the Materials workbench) reads the curve CSV a thermal analysis instrument exports. Sample data lets you try it at once.

- **DSC**: temperature and heat flow (mW). Set the sample mass, the heating rate and the integration range; the peak is integrated over a baseline for the **enthalpy**, the **onset · peak · endset temperatures** and the **apparent cp**. **Calibration (standard)** corrects temperature and enthalpy from measurements of indium, tin, zinc or water. **Add as phase-change material** puts a phase-change material made from the result into the model.
- **TGA**: from temperature and mass (%): the 5, 10 and 50 % mass-loss temperatures, the DTG peak, the residue and the number of steps.

## Reliability (Sherlock-style)

**Results › Reliability…** — for each component (body): activation energy Ea, rated temperature and rated MTTF, thermal cycles per year and the cycle ΔT.

- **Arrhenius**: AF = exp[Ea/k·(1/T_rated − 1/T_use)], MTTF = MTTF_rated / AF, FIT = 10⁹/MTTF, with T_use the body's maximum simulated temperature.
- **Coffin–Manson**: N_f = C·ΔT^−n. With ΔT empty, the transient swing of the body's maximum is used, or for a steady study its rise over ambient (one power on/off cycle).
- A component's life is the shorter of the two; the system is a series system (FIT add), with the 5-year survival probability.

## U-factor and condensation (THERM-style)

For window and wall sections open **Results › U-factor (envelope)…**, pick the indoor and outdoor convection boundaries, and read U = |Q| / (A·ΔT), R = 1/U, the coupling coefficient L2D (W/mK) and the heat flow.

In the **Condensation and mould risk (ISO 13788)** box below, enter the **indoor relative humidity** for the coldest indoor surface, the **dew point**, the temperature factor **fRsi** = (T_surface − T_out) / (T_in − T_out) and a verdict (condensation · mould risk (fRsi < 0.75) · safe). The *window frame*, *steel-stud wall* and *balcony slab thermal bridge* samples are set up this way.

## Heat maps and batch runs (HAM-style)

### Node-data heat map

Open a CSV with **Tools › Import node data…** (or drop the file on the window).

- Columns: `node` (or id, name), `x`, `y`, `[z]`, `T` (or temp, temperature), `[time]`; comma, semicolon or tab separated; `(K)` in the column name means kelvin.
- The nodes are interpolated by inverse-distance weighting; min, max, mean, standard deviation, P5/P50/P95, the hottest nodes and the nodes over a **limit** are listed. With a time column, pick the time.
- Save the heat map as PNG and the interpolated grid as CSV. *Load sample data* shows a satellite panel's node data right away.

### Command-line batch runs

The installed program runs models without a window (**Tools › Batch run (API)…** explains how):

```
MyHeatManager --batch model.myheat
MyHeatManager --batch a.myheat b.myheat --out results --field T
MyHeatManager --batch pcb.myheat --field vonMises --frame last --quiet
```

For each model it writes `name.summary.json` (statistics, probes, bodies, boundaries, energy balance), `name.field.csv` (cell values) and `name.field.png` (heat map); the exit code is 2 when a model failed. Use it to run design variants from scripts or CI.

## Printing

**File › Print…** (Ctrl+P) or the print button on the toolbar opens the **print window**: page settings on the left, and on the right a **multi-page preview** (with the page count) redrawn whenever a setting changes.

- **Paper**: paper size A3 · A4 · A5 · B4 · B5 · Letter · Legal · Tabloid, orientation (portrait · landscape).
- **Margins**: none · narrow · normal · wide, or custom (top, bottom, left, right separately).
- **What to print**: title and description, viewport picture (picture width %), colour legend, chart, model (bodies, boundaries), result summary and probes, solver log.
- **Header and footer**: header text (the model name at first), date in the footer, page numbers.
- **Appearance**: colour (colour · greyscale), font size.

**Print** opens the system print dialog, where the printer and the number of copies are chosen. Your choices are remembered until the program closes.

## Files

- Models are `.myheat` (JSON) files; the installer registers the type (with its own icon) so a double-click opens them. Several files open side by side in tabs.
- Several copies of the desktop program can run at once. Only the first restores the previous session; later ones open their window slightly offset.
- In the web version files open through the file picker and save as downloads.
- Recent files are at the bottom of the File menu, on the start page and in Settings › Files.
- Import: **DXF** (File menu), **node CSV** (Tools menu), **DSC/TGA CSV** (thermal analysis window). Export: CSV · PNG · VTK · CalculiX · study report (HTML) · chart image (PNG) · heat map (PNG · CSV).

## Installing and building

### Installing (Windows)

- The installer first asks for its language: **한국어 / English**.
- MyHeatManager is installed only once. When an earlier installation exists (any version) you are asked first; **Yes** closes running windows, **removes the old installation completely** and installs again. **No** stops without changing anything.
- When there is an earlier installation or data from earlier use, you are asked **whether to delete the user data** — Yes: settings, recent files and window place are deleted; No: the data is kept and only the preferences go back to defaults at the next start (recent files stay); Cancel: the installation stops. `.myheat` files saved elsewhere are never touched.
- A *Shortcuts* page lets you choose a desktop and a Start menu shortcut; the Start menu folder also gets a shortcut to the user's guide.

### Build commands

| Command | Builds |
|---|---|
| `npm run build:win` | Windows installer `MyHeatManager-Setup-<version>.exe` (NSIS) |
| `npm run build:mac` | macOS `.dmg` |
| `npm run build:linux` | Linux `.deb` · `.rpm` · `.AppImage` |
| `npm run build:all` | everything the current OS can build |

The installers are collected in `release/` and **copied to the project root**. Tauri does not cross-compile, so each OS's installer is built on that OS.

### Tutorial document and video

- `npm run tutorial:capture` — screenshots every tutorial step in the real (web) app and regenerates the tutorial documents (`Tutorial.md` · `Tutorial.en.md`), their pictures and `docs/Tutorial*.html`.
- `npm run tutorial:video` — records the whole tutorial on auto play as **`MyHeatManager-Tutorial.mp4`** in the project root (needs ffmpeg; `TUTORIAL_LANG=en` records the English tour).

## Keyboard shortcuts

| Action | Keys | Action | Keys |
|---|---|---|---|
| New model | Ctrl+N | Undo / redo | Ctrl+Z / Ctrl+Y |
| Open | Ctrl+O | Copy / paste / duplicate | Ctrl+C / Ctrl+V / Ctrl+D |
| Save / save as | Ctrl+S / Ctrl+Shift+S | Delete | Delete |
| Print | Ctrl+P | Select all | Ctrl+A |
| Close tab | Ctrl+W | Select · rectangle · circle · polygon · probe | V · R · C · P · T |
| Run / stop | F5 / Shift+F5 | Fit / zoom in / out | F / + / − |
| Reset view (100 %) | Ctrl+0 | 2D / 3D view | 2 / 3 |
| Animate | Space | Grid / mesh | G / M |
| Full screen | F11 | User's guide | F1 |
| Cancel drawing · close a menu or dialog | Esc | | |

The full list is in **Help › Keyboard shortcuts**.

## How it computes (summary)

- **Finite volumes** on a uniform Cartesian grid; harmonic-mean face conductances, boundaries through a half-cell resistance in series.
- Linear systems: **IC(0)-preconditioned conjugate gradients** (symmetric), **ILU(0) BiCGSTAB** for the energy equation with advection.
- Radiation linearised as h_rad = εσ(T² + T∞²)(T + T∞) and iterated (absolute temperatures).
- Phase change: an apparent heat capacity from the enthalpy difference between the old and new temperature, iterated, so no step can jump over the melting range.
- Flow: **projection method** on a staggered (MAC) grid, pressure Poisson by IC(0)-CG; Darcy–Brinkman drag in porous regions; Boussinesq buoyancy. Turbulence is **k-ω SST** (automatic wall treatment); a fan moves, every flow step, towards the flow at which its curve equals the measured pressure rise.
- Joule heating solves the electric potential with temperature-dependent conductivity and adds σ|∇V|² as a heat source. Bioheat adds the Pennes term ω_b ρ_b c_b (T_a − T) + q_m in every cell.
- Thermal stress and static structural: bilinear (2D) / trilinear (3D) finite elements on the cell corners, matrix-free element-by-element products with Jacobi-preconditioned CG. Modal analysis finds the eigenvalues with the same stiffness.

Accuracy depends on the grid: solve again with twice the cells; if the result hardly changes, the grid is fine enough.

---

© SHKWON (knix008@naver.com)
