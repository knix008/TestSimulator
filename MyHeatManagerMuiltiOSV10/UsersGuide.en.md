# MyHeatManager User's Guide

MyHeatManager **simulates heat in devices** — electronics, batteries, building envelopes, spacecraft hardware. Draw a 2D section or a layered 3D model, give it materials, heat sources and boundary conditions, and solve: temperature, heat flux, flow and stress fields, life estimates and heat maps.

The **Rust engine** does the computing: natively in the desktop program (Windows · macOS · Linux) and, compiled to WebAssembly, inside the browser in the web version. The installed program needs nothing else — no Node.js.

## What it does

| Feature | Description | Tools known for it |
|---|---|---|
| Steady and transient conduction | 2D and 3D, anisotropic conductivity, temperature-dependent k(T) and cp(T) tables | Ansys Workbench, SOLIDWORKS Simulation |
| Convection and radiation boundaries | Coefficient h (typed in, or from natural / forced convection correlations), emissivity with surroundings (deep space 3 K too) | all of them, THERM |
| Time-dependent boundaries | T, q, h, fluid temperature and surroundings following time tables in transient studies | Ansys, Simcenter |
| Solar load | Direct sunlight on exposed surfaces from the irradiance, sun elevation and azimuth and the materials' solar absorptivity, with shadows (2D and 3D) | Icepak, SOLIDWORKS Flow |
| Surface-to-surface radiation (S2S) | Grey diffuse radiation exchanged between body surfaces through view factors and radiosity (2D and 3D) | COMSOL, Icepak, Simcenter |
| Thin layers | Layers thinner than a cell (coatings, TIM) without meshing them — resistive or also conducting along the layer | COMSOL |
| Phase change | Apparent heat capacity, melting range and latent heat, liquid fraction | COMSOL Heat Transfer Module |
| Flow + conjugate heat transfer | 2D and 3D incompressible flow, forced and natural (Boussinesq) convection, solids and fluids solved together | SimScale, STAR-CCM+, SOLIDWORKS Flow |
| Turbulence | k-ω SST, convergence plot, flow rates and pressure drop | SimScale, Fluent |
| Fan curve · internal fan | The operating point where the pressure–flow curve meets the enclosure's resistance — fans on the domain edges and internal fans inside the flow (2D and 3D) | Icepak |
| Porous media | Darcy–Brinkman drag, effective conductivity | COMSOL |
| Microfluidics | Flow and heat transfer in µm-scale channels | COMSOL |
| Joule heating · contact resistance | Electric potential (voltage, ground and current-in boundaries), temperature-dependent resistance, joint resistance | SimScale, COMSOL |
| Bioheat | Pennes equation (blood perfusion, metabolic heat, blood temperature) | COMSOL |
| Thermal stress · static structural · modal | Plane stress / strain, 3D, pressure and force loads, self weight, natural frequencies | Ansys, Simcenter 3D |
| Batteries | Joule heating I²R from a current schedule, drive-cycle transients | Simcenter |
| Thermal comfort | ISO 7730 PMV and PPD (metabolic rate, clothing, humidity and mean radiant temperature as inputs) | SimScale |
| Parameter study | Solve again and again with one value varied and compare | SimScale |
| 3D post-processing | Slices, isosurfaces, 3D line cuts, probes placed by clicking the 3D view, probe and line-cut values as CSV, integrals per body (volume, ∫T dV), calculator (field expressions) and histogram | ParaView |
| Thermal analysis | DSC enthalpy, melting point, Tg, several peaks, conversion; kinetics (Kissinger, OFW, Friedman, model-free Ea(α)); TGA steps; cp(T) by the sapphire method | instrument software |
| Electronics cooling helpers | JEDEC two-resistor package, heat sink generator, PCB stack-up calculator, power map import | Icepak, FloTHERM |
| Reliability | Arrhenius life and FIT; rainflow, Miner, Engelmaier and Norris–Landzberg solder fatigue; Weibull; Steinberg vibration (PSD table integrated); half-sine shock; harmonic response (transmissibility at a probe) | Ansys Sherlock |
| Envelope U-factor | Thermal transmittance of window and wall sections, L2D, U-factor per tag, frame cavity equivalent conductivity (applied to a cavity material), condensation and mould risk (fRsi, dew point) | THERM |
| Heat maps and batch API | Node temperature CSV → heat map, statistics and comparison (delta, envelope), 3D nodes (z range, 3D point view); command-line batch runs (JSON, CSV, PNG) | NASA Heat Analysis Manager |
| Interchange | THERM, Gmsh, DXF, Nastran, Ansys, CalculiX, COMSOL and IDF (ECAD) import; CalculiX, Nastran, Ansys, COMSOL, Gmsh, THERM, STL, DXF, VTU, VTK and CSV export ([Supported file formats](#supported-file-formats)) | FreeCAD, Gmsh, ParaView and others |

What each product can and cannot do here is summed up in the [Product feature map](#product-feature-map).

## The window

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
- **Bottom chart panel**: its title bar has an icon and the *Chart* title, the tabs (Probes · Line cut · Body maximum · Residuals (convergence)), and on the right **fold** (▾ / ▴) and **hide** (✕). Folded, only the title bar stays; a hidden panel comes back with the chart-panel button on the toolbar. Drag the bar above it to resize. Right-click the chart for *Save chart image…*, *Save probe values as CSV…*, *Save line-cut values as CSV…* and *3D line cut…*.
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
- **Samples**: a section of its own with the 43 samples, each with a preview, its name, tags and description. Click one to open it in a new tab.
- Untick *Show the start page at start* at the bottom to go straight to the editor.

### Moving and resizing the cards

The start page's cards (New · Recent files · Moving background · Samples) can be arranged freely.

- Drag the **⠿** in a card's heading: a translucent silhouette of the card follows the pointer, a dashed placeholder shows where it will land and the other cards slide aside to make room.
- Drag the **size grip** at a card's bottom right to change its width (1–3 columns) and height. **Double-click** it for the automatic height.
- The arrangement is saved for next time. Settings › Start page › *Start page layout* › **Reset** goes back to the original arrangement.

## Tutorial

**Start the tutorial** (start page) or **Help › Tutorial** moves the real screen step by step: the start page, finding your way, drawing, materials, heat sources and boundaries, solving, results, advanced studies, SimScale-style studies, reliability / U-factor / heat maps, files and output, customizing — **12 chapters, 85 steps**. 3D slices and isosurfaces, the calculator and histogram, 3D flow and CHT, internal fans, surface-to-surface radiation (S2S), the solar load, DSC kinetics / Tg / cp, 3D node heat maps, the electronics cooling helpers, solder fatigue and life, the vibration PSD table and shock, other products' file formats, and importing solver decks and IDF boards each get a step of their own.

- The card at the bottom right: the step, ⏮ previous · ▶ auto play · next ⏭, the chapter list and ✕ to end. Drag its header to move it.
- The part of the window the step is about is outlined in yellow.
- The tutorial works on **samples of its own** (Tutorial: power module and others) in new tabs; at the end it closes them and puts back the settings it changed (theme, panels, workbench). Your models are not touched.
- **Help › Tutorial document** shows the same steps with screenshots in one document.

## User's guide and tutorial document windows

**Help › User's guide** (F1) and the **tutorial document** open in **a separate window**. The document window takes the program's theme colours and follows when you change the theme while it is open. The language switch at the top shows the other language's flag — the Union Jack on the Korean page, the Taegukgi on the English page. A table of contents of the headings is on the left.

## Quick start

1. Open **File › New from sample…** or pick from the **Samples** section of the start page (43 of them, see [Samples](#samples)).
2. Click a card: the model opens in a new tab.
3. Press **▶ Run study** (F5). A progress bar appears over the viewport; ■ stops it.
4. The temperature field and its colour bar appear. Use the field selector (top left of the viewport), isotherms and vectors on the toolbar, and the **3D view** (3).
5. **Results › Study report…** lists body temperatures, boundary heat flows and the energy balance; save it as HTML, or print with **Print…** (Ctrl+P).

## Samples

There are 43 samples. Open them from **File › New from sample…**, the Samples section of the start page or the New starting points. The installer also carries them as `samples/*.myheat` files. Samples of other products' file formats are in `samples/formats/` (see [Supported file formats](#supported-file-formats)).

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
| Vacuum oven, surface-to-surface radiation (S2S) | 2D steady | A heater in a vacuum box warms the walls and the sample by radiation alone — view factors and radiosity; the top window opens to the outside |
| Outer wall over a day (time-dependent boundaries) | 2D transient | Outdoor temperature and film coefficient (Tinf(t), h(t)) and an indoor heating schedule (T(t)) follow tables — temperatures inside the wall and the indoor surface heat flow over two days (48 h) |
| Coated turbine blade wall (thin layer) | 2D steady | A 0.3 mm ceramic coating (TBC) on a nickel-alloy wall in combustion gas, as a thin-layer boundary — how much cooler the metal runs |
| Heat sink in a duct (3D CHT) | 3D steady | Duct air at 1.5 m/s flows between the plate fins on a chip — 3D flow and solid conduction together: the speed between the fins, the chip temperature, the pressure drop |
| Outdoor cabinet in the sun (solar load, 3D) | 3D steady | Summer-noon sun (900 W/m², 65° elevation) and 40 W of equipment heat — the shadow of a sunshade on the roof, equipment and roof temperatures |
| Chassis with an internal fan (3D) | 3D steady | An internal fan pushes air along its curve over a CPU heat sink and a voltage regulator (k-ω SST) — the fan's operating point and the part temperatures |
| Natural-convection heat sink (h correlations) | 2D steady | h on every face of an upright heat sink from correlations (vertical Churchill–Chu, horizontal facing up / down) — the evaluated mean h and the LED temperature |

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
- **File › Import DXF…** brings the closed polylines and circles of a DXF drawing into the current model as bodies (the domain grows to fit the drawing if it is too small). To open a drawing, a THERM section, a Gmsh mesh, a solver deck (Nastran, Ansys, CalculiX, COMSOL) or an IDF board as a **new model**, use **File › Import (THERM, Gmsh, decks, IDF)…** or **Open…** (see [Supported file formats](#supported-file-formats)).
- **Tools › JEDEC two-resistor package… · Heat sink generator… · Import power map…** build bodies from a few values (see [Electronics cooling helpers](#electronics-cooling-helpers-icepak-style)).
- The snap step is in Settings › Editor.

### Materials

The **material library** (🧱) has metals, electronics materials (silicon, FR-4, effective PCB, solder, TIM, graphite), ceramics and glass, building materials, polymers and composites, battery cells, fluids (air, water, glycol, oil, dielectric coolant), phase-change materials (paraffin, ice, salt hydrate) and porous media (metal foams, packed beds). **Add to model** copies a material into the model, so files open without the library.

- Leave **per-axis k** (kx, ky, kz) empty to use k. A PCB section has a large kx (in-plane) and a small ky (through the thickness).
- **Kind**: solid · fluid (needs viscosity μ and expansion β) · phase change (melting point, range, latent heat, liquid k) · porous (porosity ε, permeability K, pore fluid).
- Structural: Young's modulus E, Poisson's ratio ν, expansion coefficient α. Electric: **electrical conductivity σ** (MS/m) and the **temperature coefficient of resistance** (σ = σ₀ / (1 + αR(T − 20))).
- The bioheat properties **blood perfusion** (1/s), **metabolic heat** (W/m³) and **blood temperature** (°C, 37 by default) are set in the fields at the bottom of the material editor (see the *Tumour RF ablation* sample). With zero perfusion there is no Pennes term.
- **k(T)** and **cp(T)**: conductivity and specific heat that change with temperature, typed as `°C:value, °C:value` (e.g. `20:150, 200:140` W/mK, `20:900, 300:1050` J/kgK). Values between the points are interpolated linearly; outside the table the end values hold. Leave them empty to use the constant k and cp above. cp(T) is used only in transient studies (solved on the enthalpy, so energy is conserved exactly); steady studies do not use cp. Advection in flow (CHT) uses a constant ρcp.
- **Solar absorptivity** (0.6 by default) is the share of sunlight the material's surfaces absorb under the [solar load](#solar-load). It is not the emissivity (white paint: absorptivity ≈ 0.2, emissivity ≈ 0.9).
- **Emissivity** is used by radiation boundaries and, for that material's surfaces, by [surface-to-surface radiation](#surface-to-surface-radiation-s2s).
- **Tools › Thermal analysis (DSC/TGA)…** can make a phase-change material from a DSC melting peak, or a cp(T) material by the sapphire method, and add it to the model (see [Thermal analysis](#thermal-analysis-dsc--tga)). **Tools › PCB stack-up calculator…** adds the effective conductivity of a stack-up as a material.
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
| Convection | h, fluid temperature, (emissivity), **how h is found** | an emissivity adds radiation; h can also come from a correlation (below) |
| Radiation | emissivity, surroundings | alone in vacuum (space) |
| Adiabatic | — | symmetry planes, cuts |
| Contact resistance | R (m²K/W) | between a body and its neighbours |
| Thin layer | layer thickness (mm), conductivity k, layer model | Model › Thin layer; on a body or a domain edge only (below) |
| Inlet / outlet / opening | velocity, inlet temperature (turbulence intensity and mixing length with turbulence) | flow (CHT), on the domain edges (front and back faces too in 3D); the property panel also offers wall and slip |
| Fan (fan curve) | inlet temperature, fan curve `m³/s:Pa, …` | flow, on the domain edges (front and back faces too in 3D). Pick *Fan (fan curve)* as the **type** in the property panel and edit the curve. On a 3D face the curve's flow is the flow through the whole face. After a study the **operating point** (L/s, Pa) is shown |
| Internal fan | blowing direction (+x … −z), fan curve `m³/s:Pa, …`, region | Model › Internal fan. The target is *Inside a region* (region: 2D x0, y0, x1, y1 / 3D x0, y0, z0, x1, y1, z1, mm) or a body (its fluid cells). It adds the curve's pressure rise across one plane in the middle of the region; after a study the **operating point** and the flow are shown. A fan that does not cover the whole cross-section can let air circulate around it |
| Voltage / ground / current in | V / 0 V / I (A) | Joule heating |
| Fixed support / rollers | — | thermal stress and structural supports (rollers from the type in the property panel) |
| Pressure load / force load | p (kPa) / Fx · Fy (· Fz) (N) | static structural |

- **Target**: left, right, bottom or top edge (front/back in 3D too), *all outer faces*, or one body.
- **Span**: part of an edge only (e.g. a flux on 2–8 mm of the bottom edge).
- **Region** `x0, y0, x1, y1`: only faces inside that rectangle. This splits *all outer faces* into an outdoor side (x < 32) and an indoor side, as in the window frame.
- When several conditions reach one face: body target > edge target > all outer faces, and the later one in the list wins within a class. Faces without a condition are adiabatic.
- **U-factor tag** (convection and radiation boundaries): tag a boundary Frame, Edge, COG, Divider, SHGC Exterior, Interior or Exterior to get a U-factor per tag in the U-factor window (see [U-factor and condensation](#u-factor-and-condensation-therm-style)).

### Boundary values that change with time

In a **transient** study the boundary's property panel has extra time-table fields. The format is `time:value, time:value` (seconds); left empty, the constant value above is used.

| Boundary | Time-table fields | Units |
|---|---|---|
| Fixed temperature | Temperature (t) | s:°C |
| Heat flux | Heat flux (t) | s:W/m² |
| Convection | Film coefficient h (t), fluid temperature (t) | s:W/m²K, s:°C |
| Radiation | Surroundings (t) | s:°C |

- Values are interpolated linearly between the points; before the first and after the last the end values hold. Each time step uses the value at its end, and the boundary heat flows and the energy balance count the same value.
- Steady studies use only the value at t = 0 (the model check says so). h values must not be negative, and when *how h is found* is not *typed in*, the correlation wins over the h table.
- Example: the *Outer wall over a day* sample drives the outdoor temperature, h and the indoor temperature by tables. Heat sources that change with time use the body's **power schedule**.

### Convection correlations (how h is found)

Instead of typing h, a convection boundary can compute it from a correlation (**how h is found**).

| How h is found | Correlation | Extra inputs |
|---|---|---|
| Typed in | — | h |
| Natural convection, vertical (Churchill–Chu) | full-range Churchill–Chu | characteristic length |
| Natural convection, horizontal facing up (Lloyd–Moran) | 0.54 Ra^¼ (Ra ≤ 10⁷), 0.15 Ra^⅓ | characteristic length |
| Natural convection, horizontal facing down | 0.27 Ra^¼ | characteristic length |
| Forced flow over a plate | laminar 0.664 Re^½ Pr^⅓; for Re > 5·10⁵ (0.037 Re^0.8 − 871) Pr^⅓ | characteristic length, velocity |

- The properties are those of **air** (a 200–1000 K table) at the film temperature; they do not fit water, oil or other fluids.
- When the surface is colder than the fluid, the facing-up and facing-down formulas swap. h is iterated with the surface temperature, and after a study the property panel shows the **evaluated mean h**.
- Example: the *Natural-convection heat sink (h correlations)* sample.

### Thin layers

**Model › Thin layer** adds a layer thinner than a cell — a coating, a thermal interface material, paint — without meshing it. Set the **layer thickness** (mm), the **conductivity k** and the **layer model**.

- **Resistive (through the layer only)**: adds R = d/k in series on the face. Between bodies it acts like a contact resistance; on an outer face it sits between the half cell and that face's boundary condition (temperature, convection, radiation).
- **Conductive (also along the layer)**: adds, besides the resistance, the heat flowing along the layer (k·d) between neighbouring cells. A layer that turns a corner does not conduct around it.
- The target is a body (the faces between it and everything else) or a domain edge. *All outer faces* cannot be used; spans and regions can. The layer's temperature is not solved separately — it is taken as that of the cells it touches.
- Example: the *Coated turbine blade wall (thin layer)* sample.

### Probes

The **probe** tool (T) records the temperature at a point: over time in the chart panel for transient studies, and as a label on the result.

## Studies

Set in **Simulate › Study settings…** or in the property panel (nothing selected):

- **Steady state**: the equilibrium. Radiation, temperature-dependent k, convection correlations and surface-to-surface radiation are iterated (Picard).
- **Transient**: end time, time step, stored frames, initial temperature; backward Euler (unconditionally stable). A large step is fast but misses quick changes. With cp(T) or phase-change materials every time step runs Newton iterations on the enthalpy.
- **Flow (CHT)**: solves the flow in fluid and porous regions too (2D and 3D). 3D flow can take a while, depending on the cell count; above a million fluid cells the engine warns. Forced convection needs an inlet (or a fan or internal fan) and an outlet; **natural convection** uses gravity and the reference temperature. **Turbulence (k-ω SST)** replaces laminar flow with the turbulence model. If the *flow iterations* run out, the status bar warns.
- **Joule heating (electric)**: solves the electric potential and adds the heat of the current to the thermal study.
- **Thermal stress**: computed from the final temperature. Without supports only rigid-body motion is removed (free expansion). 2D uses plane stress (or *plane strain*). Untick *Include thermal expansion* and give only loads and *self weight (gravity)* for a static structural study.
- **Natural frequencies**: as many natural frequencies and mode shapes as the number of modes.
- **Solar load**: a tick box in the study settings with the irradiance, sun elevation and azimuth; see [Solar load](#solar-load) below.
- **Surface-to-surface radiation (S2S)**: a tick box in the study settings; see [Surface-to-surface radiation](#surface-to-surface-radiation-s2s) below.
- **Comfort** inputs (with flow on): **metabolic rate** (met, 1.2 by default), **clothing** (clo, 0.5), **relative humidity** (%, 50) and **mean radiant temperature** (off = same as the air). They feed Results › Thermal comfort (PMV) and Dissatisfied (PPD).
- **Check model** (✔) reports bodies without material, no way for heat to leave, flow without fluid, too many cells, an invalid fan curve, a correlation without a characteristic length, a thin layer without thickness or k, time tables in a steady study, a negative cp(T), S2S with no cells for the radiation to cross and so on. A model with errors is not solved.
- **Run again after edits** (Settings) re-solves after every change.

Editing the model after a study shows *model changed — run again* on the viewport.

### Surface-to-surface radiation (S2S)

Tick **Study settings › Surface-to-surface radiation (S2S)** and body surfaces exchange heat by radiation (grey, diffuse). It matters in vacuum equipment, cavities and inside enclosures, where convection is weak.

- **Radiation passes through**: *empty space* (cells with background *None*, the default) or *empty space and fluids*. Radiating faces are the faces between opaque cells (every other solved cell) and transparent ones; the emissivity is that of the **material** on the opaque side.
- Transparent cells' faces on the domain edge are **openings** (black). If that edge has a radiation boundary (or a convection boundary with an emissivity), its surroundings temperature is used; otherwise the model's ambient.
- View factors: in 2D by Hottel's crossed-strings method (with an obstruction check; a 2D model is taken as infinitely long in z), in 3D by Monte Carlo with 256 rays per patch. Faces are grouped into patches (bigger patches keep the count under 3000), and the radiosities are solved again in every iteration.
- The result holds the net radiative flux field **qrad** (also in the VTK and VTU exports). Radiation exchanged with the outside is added to the boundary heat flows of the energy balance.
- Limits: grey, diffuse surfaces only (no spectral or specular behaviour), no participating media (smoke, gases) and no solar ray tracing. The half-cell temperature difference to the face is neglected. On faces that radiate through S2S, that face's boundary emissivity is not used and only convection remains (a warning says so). A closed cavity alone does not fix the temperature level, so an opening or another boundary is needed.
- Example: the *Vacuum oven, surface-to-surface radiation (S2S)* sample.

### Solar load

Tick **Study settings › Solar load** and the sun heats the exposed surfaces (the solar load of Icepak and SOLIDWORKS Flow).

- Inputs: the **irradiance** G (W/m² on a surface facing the sun), the **sun elevation** (above the x-z plane, +y is up) and the **sun azimuth** (from +x towards +z). Each material has a **solar absorptivity** α.
- Exposed faces — faces of opaque cells looking into a void or fluid cell or out of the domain — that face the sun (outward normal n, n·s > 0) receive α · G · (n·s) · area. A face is in shadow when the ray from its centre towards the sun meets another opaque cell (2D models are sections infinitely long in z; their shadows are traced in the x-y plane).
- The absorbed heat is a source of the cell behind the face, so it works together with convection or radiation boundaries on the same face. It counts as generated heat in the energy balance, and the result summary shows the **absorbed sunlight** (W).
- A sun at or below the horizon (elevation ≤ 0) adds nothing. Diffuse sky light, reflections and transmission through glass are not modelled.
- Example: the *Outdoor cabinet in the sun (solar load, 3D)* sample.

## Results

- **Fields**: temperature · heat flux |q| · velocity · pressure · turbulent viscosity · von Mises stress (MPa) · displacement (µm) · mode shape · liquid fraction · electric potential · current density · thermal comfort (PMV) · dissatisfied (PPD). Fields the result does not have are greyed out.
- **Isotherms**, **vectors** (heat flux; velocity on flow fields), **streamlines**, **deformed shape** (exaggerated displacement).
- **Animate** (Space) and the frame slider play transient results; the temperature colour range stays the same over all frames.
- **Line cut**: click two points; the values along the line appear in the chart panel.
- **3D view**: see [3D view](#3d-view). For a 3D model in the 2D view, the **layer (z)** selector at the top left picks the section.
- The status bar shows the value under the cursor. The temperature unit is in Settings › General; the colour map, colour steps and number of isotherms in Settings › Result display.
- Saving values: right-click in the chart panel › **Save probe values as CSV…** (each probe over time, when there are probes) · **Save line-cut values as CSV…** (the values along the last line cut).
- The **study report** has, besides the body temperatures, an **Integrals per body (volume, mean, ∫T dV)** table — each body's volume (cm³), minimum, mean and maximum temperature and ∫T dV (°C·cm³). Transient results use the last frame.
- Export (File menu): **CSV** (per-cell values), **PNG** (viewport), **VTK** and **VTU** (every field, for ParaView and others), solver input decks and mesh / geometry files, **study report** (HTML), **print**. Each format is described in [Supported file formats](#supported-file-formats).

### 3D post-processing (slices, isosurfaces, 3D line cuts)

Seen in the **3D view**, the result of a 3D model has more chips in the row above the viewport (ParaView's Slice, Contour and Plot Over Line):

- **Slice**: pick x, y or z (or *off*) to cut the result with a plane normal to that axis and colour it cell by cell. The number beside it (1 … cell count) is the **cell index** the plane passes through.
- **◍ Isosurface**: draws the surface of one value (at first the middle of the colour range) and turns the outer faces see-through so the inside shows. Change the value in the field beside it (temperatures in the unit of the settings).
- **Results › 3D line cut…**: type the x, y, z (mm) of points A and B to plot the values along the line between them through the volume in the chart panel. Enabled for 3D results only.
- **Clicking the 3D view**: with a result in the 3D view, a click on the model (without dragging) shows the point and its value in the status bar. On a 3D model with the **probe** tool chosen, the click places a probe there and the 3D view stays.

### Calculator and histogram

**Results › Calculator · histogram…** (ParaView's Calculator and Histogram) computes an expression of the result fields in every cell.

- Expressions: `+ − * / ^ ( )`, comparisons `< <= > >= == !=` (1 when true, 0 when false), functions `sqrt abs exp log log10 sin cos tan min max pow hypot floor ceil round sign`, constants `pi e`. For example `T + 273.15`, `sqrt(qx^2 + qy^2)`, `max(T - Tamb, 0)`, `T > 80`.
- Names: the result's fields (`T`, `qx` `qy` `qz`, `u` `v`, `p`, `vonMises`, `dispX` …, `liquid`, `nut`, `V`, `J` …), the magnitudes `q`, `U`, `disp`, the cell centre `x` `y` `z` (mm), the model's ambient `Tamb` and the frame time `t`. The window lists the names the current result offers.
- It shows the minimum, mean and maximum, the cell count and the cells that could not be computed (e.g. the log of a negative number), and a histogram of the volume fraction (%) per value bin. The grid is uniform, so the share of cells is the share of volume.
- **Show in the viewport** paints the values as the *Calculated field* (field selector, Results menu). Solving again removes it. **Save field CSV** and **Save histogram CSV** export the values.
- Expressions are read by the program's own small parser, so they never run code.

## SimScale-style studies

Switch them on from the Simulate menu and the Study workbench. Result fields are active only when the result has them.

| Feature | Where | Input | Result |
|---|---|---|---|
| Turbulent flow (k-ω SST) | 🌀 Turbulence · Study settings › Turbulence | Inlet turbulence intensity and mixing length | Eddy viscosity νt, maximum y+, wall heat transfer |
| Convergence | automatic | — | Chart panel › Residuals (continuity, u, v, T, k, ω, log₁₀) |
| Flow boundary figures | automatic | — | Mass flow, volume flow, mean pressure and temperature of inlets/outlets, pressure drop |
| Fan curve · internal fan | Boundary type *Fan (fan curve)* (property panel), Model › Internal fan | Pressure–flow curve `m³/s:Pa, …`, inlet temperature | The flow and pressure at the operating point where the curve meets the enclosure's resistance (property panel), and the temperatures with it |
| Contact resistance | ⫴ Contact resistance | Body target, R (m²K/W) | The temperature step across the joint |
| Joule heating (electric) | ⚡ Joule heating | Material conductivity σ and resistance temperature coefficient; ⚡ voltage, ⏚ ground, ⇢ current-in boundaries | Potential V, current density |J|, current / power / resistance per boundary |
| Bioheat (Pennes) | Blood perfusion, metabolic heat and blood temperature in the material editor | — | Tissue temperature with perfusion cooling and metabolic heat |
| Static structural | ⚖ Thermal stress + Study settings › untick thermal expansion | ⚓ fixed, ⤓ pressure, ➘ force loads, self weight | Displacement, von Mises stress, deformed shape |
| Natural frequencies (modal) | 〜 Natural frequencies | Number of modes, fixed supports | Frequency per mode (Hz), mode shapes (pick the mode above the viewport) |
| Thermal comfort (PMV · PPD) | Results › Thermal comfort (PMV) · Dissatisfied (PPD) | A flow result with air; the comfort metabolic rate, clothing, relative humidity and mean radiant temperature in the study settings (1.2 met · 0.5 clo · 50 % · the air temperature by default) | ISO 7730 PMV (−3 … +3) and PPD (%) fields |
| Surface-to-surface radiation (S2S) | Study settings › Surface-to-surface radiation (S2S) | Material emissivity, what the radiation passes through | Temperatures with radiation, qrad (exports) |
| Time-dependent BCs · h correlations · thin layers | Boundary property panel · Model › Thin layer | See [Boundary conditions](#boundary-conditions) | Boundary heat flows that change with time, the evaluated mean h, the heat through the layer |
| Streamlines | ➰ Streamlines | A flow result | Lines along the velocity with direction arrows |
| Parameter study | 📊 Parameter study | The value to vary (body power, boundary values, inlet speed, material conductivity, mesh scale, ambient), range and steps | A table and chart of a result (max temperature, body, probe, boundary heat, pressure drop, stress), [Apply] |
| Auto mesh | ⊞ Auto mesh | — | Cell counts so the thinnest body spans two cells |

The **parameter study** solves copies; the open model is not changed until you press **Apply** on a row of the table.

Flow, CHT and turbulence are solved in 2D and 3D. Compressible flow, multiphase (VOF), lattice-Boltzmann wind comfort and electromagnetics are not supported (see [Not supported](#not-supported)).

## Thermal analysis (DSC / TGA)

**Tools › Thermal analysis (DSC/TGA)…** (also on the Materials workbench) reads the curve CSV a thermal analysis instrument exports. Sample data lets you try it at once.

- **DSC**: temperature and heat flow (mW). Set the sample mass, the heating rate and the integration range; the peak is integrated over a baseline for the **enthalpy**, the **onset · peak · endset temperatures** and the **apparent cp**. **Add as phase-change material** puts a phase-change material made from the result into the model.
  - **Baseline**: linear or **sigmoid** (the tangents before and after the peak blended by the area fraction — for a cp that differs before and after the peak).
  - **Several peaks**: add ranges with **+ Add peak** for one row of enthalpy and temperatures per peak.
  - The **derivative** (dHF/dT, Savitzky–Golay) and **conversion α** views show where a peak starts and ends.
  - **Glass transition (Tg)**: from a step, the baselines before and after it and the tangent at the inflection give the onset, midpoint and endset temperatures and Δcp (ASTM E1356 / ISO 11357-2).
  - **Calibration (standard)**: corrects temperature and enthalpy from measurements of indium, tin, zinc or water. Switched to *Multi-point (T)*, several standards give a temperature correction line with R².
- **Kinetics**: several DSC curves at different heating rates give the activation energy Ea (kJ/mol) by **Kissinger** from the shift of the peak temperature, and by **Ozawa–Flynn–Wall** (integral) and **Friedman** (differential, ln(β·dα/dT) against 1/T) from the temperature at one conversion α. The **Ea(α) (model-free)** view plots and lists the OFW and Friedman Ea for α = 0.1 … 0.9 — a nearly flat profile means a single reaction step. Switch between the curves, the Kissinger plot and Ea(α).
- **TGA**: from temperature and mass (%): the 5, 10 and 50 % mass-loss temperatures, the DTG peak, the residue and the **mass-loss steps** (temperature range, loss and DTG peak of each). The **DTG** curve can be drawn too.
- **cp (sapphire)**: blank, sapphire and sample curves give cp(T) by the ASTM E1269 ratio method. **Use as material cp(T)** adds a material with that table as its [cp(T)](#materials) to the model (a copy of the selected body's material when a body is selected).

Each tab's *Sample* button loads example data at once, and the installer's `samples/formats/` holds `dsc-indium.csv` and `tga-polymer.csv`.

## Reliability (Sherlock-style)

**Results › Reliability…** — for each component (body): activation energy Ea, rated temperature and rated MTTF, thermal cycles per year and the cycle ΔT.

- **Arrhenius**: AF = exp[Ea/k·(1/T_rated − 1/T_use)], MTTF = MTTF_rated / AF, FIT = 10⁹/MTTF, with T_use the body's maximum simulated temperature.
- **Coffin–Manson**: N_f = C·ΔT^−n. With ΔT empty, the transient swing of the body's maximum is used, or for a steady study its rise over ambient (one power on/off cycle).
- A component's life is the shorter of the two; the system is a series system (FIT add), with the 5-year survival probability.

### Solder fatigue and life

**Tools › Solder fatigue and life…** estimates solder-joint life from the simulated temperatures, physics-of-failure style. It has five tabs.

- **Thermal cycles · Miner**: the temperature history of the *history source* (a body maximum or a probe) is counted by **rainflow** (ASTM E1049) into a table of cycles with ΔT, mean, count, Nf and damage, and the **Miner** sum gives the damage D of one history and the life (repeats, years). The life model is **Coffin–Manson** (C, n) or **Engelmaier** (distance to the neutral point LD, Δα — *from materials* takes the component's and board's expansion coefficients — solder height h, dwell time). *History repeats/day* says how often the history repeats in a day. A steady result counts ambient → maximum as one power cycle.
- **Norris–Landzberg**: ΔT, frequency and maximum temperature of the accelerated test and of the field, exponents n and m, Ea and the test life give the acceleration factor AF and the field life (= AF × test life).
- **Weibull**: the shape β and the MTTF (from the reliability study when the component is there, otherwise typed in) give the scale η, the B10 and B1 lives, the reliability at the mission time and the R(t) curve.
- **Vibration (Steinberg)**: the natural frequency fn (the first mode when there is a modal result), the input, board edge B, component length L, board thickness h, position factor r and component constant c give the allowable displacement Z_allow, the response Z (3σ), their ratio and the life (hours). The input is one of three — **G rms**; **PSD** (the value at fn and a bandwidth, Miles' equation with Q = √fn); a **PSD table** (`Hz:g²/Hz, …` breakpoints, log–log interpolation; presets: the MIL-STD-810 minimum-integrity shape, an IEC 60068-2-64 flat band, a flat 0.04 g²/Hz). A PSD table is integrated over its whole band with the single-degree-of-freedom |H|² for the response G rms (shown with the input G rms and the Miles value), and the input and response PSDs are plotted on log axes.
- **Shock (half-sine)**: peak acceleration (g), pulse duration (ms), amplification Q and fn drive a single-degree-of-freedom board mode whose equation of motion is integrated in time (RK4): the peak relative displacement, the peak acceleration of the mass, the shock response (aMax / input, the shock response spectrum value) and whether the peak comes after the pulse (residual). The margin against the Steinberg allowable displacement of the vibration tab (Z_allow / peak displacement) is shown; above 1 leaves margin (a conservative criterion).

### Harmonic response

**Tools › Harmonic response…** draws a sine-sweep response by modal superposition from a natural-frequency result (each mode's frequency and effective mass fractions). Set the lowest and highest frequency, the damping ratio, the axis (auto = the one with the most effective mass) and the kind (*modal superposition (relative amplitude)* or *base reaction / rigid*) for the amplitude and phase curves and a table of response peaks. *Modal superposition* uses the square root of the effective mass fraction for the participation factor, without the mode shapes, so its amplitude is relative. When the model has probes, the kind list also offers **Transmissibility at probe … (mode shapes)** — the mode shapes at the probe and the engine's signed participation factors give the ratio of the absolute to the base acceleration (transmissibility) and the relative displacement (mm/g). For a single mode it equals the classic single-degree-of-freedom transmissibility. Without a modal result it asks you to switch on the modal study and solve first.

## Electronics cooling helpers (Icepak-style)

The four windows in the **Tools** menu (the *Electronics* group of the Reliability workbench) build bodies and materials in the model from a few values. What they make are ordinary bodies and materials, free to edit afterwards.

| Window | Input | What appears in the model |
|---|---|---|
| **JEDEC two-resistor package…** | Name, position x · y, width (in 3D also depth z and start z), thickness, Rjc (junction–case), Rjb (junction–board), power | Three bodies — top (case side), junction and bottom (board side) — with conductivities from the 1D resistances of JESD15-3, and a junction temperature probe. A 2D section uses the domain depth |
| **Heat sink generator…** | Base x · y · width · thickness, fin count · thickness · height, (3D) start and end z, material | A base and evenly spaced plate fins (the outer fins flush with the base edges). The preview shows the fin gap and pitch, and it tells you when the fins do not fit on the base |
| **PCB stack-up calculator…** | Per layer: type (copper · dielectric FR-4), thickness, copper coverage; presets (2-layer, 4-layer 1.6 mm) | In-plane k (thickness-weighted mean) and through-plane k (series sum), total thickness, copper fraction. **Add as material** adds an anisotropic material with k = through-plane (y of a 2D section) and kx = kz = in-plane. Copper 390, FR-4 0.3 W/mK |
| **Import power map…** | CSV `x, y, W` (mm, mm, W — comma, semicolon or tab; a header is skipped) or *Sample*, source size, material | A square heat-source body with that power at each point. It shows the source count and total power, and how many points lie outside the domain. In 3D the map is in the x-y plane |

## U-factor and condensation (THERM-style)

For window and wall sections open **Results › U-factor (envelope)…**, pick the indoor and outdoor convection boundaries, and read U = |Q| / (A·ΔT), R = 1/U, the coupling coefficient L2D (W/mK) and the heat flow.

Tag boundary conditions with a **U-factor tag** (Frame, Edge, COG, Divider, SHGC Exterior, Interior, Exterior) and the **U-factor by tag (THERM / NFRC)** table gives a U-factor per tag on the total and the projected length.

The **Frame cavity equivalent conductivity (ISO 10077-2)** box takes the cavity width (along the heat flow) and height, ΔT and mean temperature, the emissivities of both faces and the heat-flow direction, and gives the equivalent conductivity k_eq of an air cavity with the convective and radiative coefficients h_a and h_r. Pick the **cavity material** and press **Apply to the material**: its conductivity becomes k_eq — solve again to see the effect.

In the **Condensation and mould risk (ISO 13788)** box below, enter the **indoor relative humidity** for the coldest indoor surface, the **dew point**, the temperature factor **fRsi** = (T_surface − T_out) / (T_in − T_out) and a verdict (condensation · mould risk (fRsi < 0.75) · safe). The *window frame*, *steel-stud wall* and *balcony slab thermal bridge* samples are set up this way.

## Heat maps and batch runs (HAM-style)

### Node-data heat map

Open a CSV with **Tools › Import node data…** (or drop the file on the window).

- Columns: `node` (or id, name), `x`, `y`, `[z]`, `T` (or temp, temperature), `[time]`; comma, semicolon or tab separated; `(K)` in the column name means kelvin.
- The nodes are interpolated by inverse-distance weighting; min, max, mean, standard deviation, P5/P50/P95, the hottest nodes and the nodes over a **limit** are listed. With a time column, pick the time.
- Save the heat map as PNG and the interpolated grid as CSV. *Load sample data* shows a satellite panel's node data right away.
- **Tools › Compare heat maps (delta, envelope)…** loads two or more node CSVs (or the *sample pair*) and shows, node number by node number, the **B − A difference** or the **envelope (maximum)** of all of them as a heat map with statistics, and exports it as CSV. With a time column, pick the time.
- When the nodes have several **z** values (3D node data), a **View** choice (Plan map (IDW) / 3D points) and a **z range** appear. The plan map and the statistics use only the nodes in the z range, so the data can be looked at layer by layer; the 3D point view draws the nodes as dots in temperature colours and turns when dragged. *3D sample (battery module)* shows thermocouple data on three layers right away.

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
- Import: **THERM, Gmsh, DXF, Nastran, Ansys, CalculiX, COMSOL and IDF** (as a new model, File menu), **DXF** (bodies into the current model), **node CSV** (Tools menu), **power map CSV** (Tools menu), **DSC/TGA CSV** (thermal analysis window). Export: the formats under [Supported file formats](#supported-file-formats) below, study report (HTML), chart image (PNG), probe and line-cut values (CSV), heat map (PNG · CSV).

## Supported file formats

**File › Supported file formats…** shows the same table. The installer's `samples/formats/` folder has a sample file for each format (a 2D heat sink, a 3D PCB, a window-frame section, an IDF controller board and others).

| Product | Format | Open | Save | Contents |
|---|---|:-:|:-:|---|
| MyHeatManager | `.myheat` | ✓ | ✓ | The model (JSON) |
| CalculiX | `.inp` | ✓ | ✓ | Input deck (CalculiX, Abaqus): grid, materials, boundary conditions. Opening reads element and node sets, *MATERIAL, *SOLID SECTION, *BOUNDARY, *FILM, *RADIATE and *DFLUX |
| Nastran / Simcenter | `.bdf` | ✓ | ✓ | Steady heat transfer (SOL 153) bulk data: 2D CQUAD4 + PSHELL (thickness = domain depth), 3D CHEXA, MAT4 (MAT5 when anisotropic), SPC · CONV · QBDY1 · QVOL. Opening reads GRID, CQUAD4, CTRIA3, CHEXA, CTETRA, CPENTA, PSHELL, PSOLID, MAT4/5, CHBDY, CONV, QBDY1, QVOL and SPC (free, small and large field) |
| Ansys | `.cdb` | ✓ | ✓ | MAPDL input (/INPUT or Workbench External Model): PLANE55 / SOLID70, D TEMP · SFE CONV · SFE HFLUX · BFE HGEN, steady thermal solve. Opening reads NBLOCK, EBLOCK, MP, MPDATA, R, D TEMP, SFE and BFE (CDWRITE layout too) |
| COMSOL | `.mphtxt` | ✓ | ✓ | Text mesh (version 4, metres): a domain per material, a boundary per boundary condition. Opened, each domain becomes a material and each boundary entity a convection condition (no properties or boundary values) |
| Gmsh | `.msh` | ✓ | ✓ | MSH 2.2 ASCII: a physical group per material and boundary condition. Opening traces each group's outline into bodies; a trailing `[type]` in the name sets the boundary type (convection otherwise) |
| THERM | `.thmx` | ✓ | ✓ | THERM 7 section (2D): materials, boundary conditions, polygons. Opened, it becomes a model with no background and a 1000 mm depth; ρ and cp come from the library material with a matching name |
| ParaView | `.vtk` · `.vtu` | — | ✓ | Results: every field per cell (last frame); heat flux, velocity and displacement as vectors |
| STL | `.stl` | — | ✓ | The visible bodies as closed solids (2D extruded through the depth, circles as 48-sided prisms) |
| DXF (CAD) | `.dxf` | ✓ | ✓ | R12 drawing (mm): a layer per body, closed polylines and circles |
| CSV | `.csv` | ✓ | ✓ | Saves per-cell field values / reads measured nodes, power maps, DSC and TGA |
| PNG | `.png` | — | ✓ | Viewport, chart and heat-map pictures |
| ECAD (IDF 3.0) | `.emn` + `.emp` | ✓ | — | Board outline, thickness and component placements (.emn), component outlines, heights and `POWER_OPR` (.emp) → a 3D board, component bodies and a convection boundary. The desktop reads the .emp of the same name too; the web version asks for the library file (cancel for the board alone) |

- Solver decks (Nastran, Ansys, CalculiX) are written in SI units (m, °C); meshes and drawings (Gmsh, VTU, STL, DXF, THERM) in mm.
- Mesh formats carry exactly the Cartesian grid the study solves — one quad (2D) or hexahedron (3D) element per cell that has material.
- In solver decks radiation is approximated by an equivalent film coefficient, and flow, structural, electric and fan conditions are not written.
- Opening a solver deck reads the nodes, cells, materials, thermal boundaries and heat only; the geometry is traced per material into bodies, as for a Gmsh import. Files written by this program carry a domain note, so the domain and the grid come back exactly; for files from other programs the unit (m / mm) is guessed from the size (the status bar says so). Tetrahedral or curved meshes come in with stair-stepped outlines or as bounding boxes.

**Not supported** — undocumented binary formats, or formats that need a B-rep geometry kernel. The Supported file formats window says what to use instead for each one.

| Format | Product | Instead |
|---|---|---|
| `.mph` | COMSOL | Export the mesh from COMSOL as `.mphtxt`, or bring this program's `.mphtxt` into COMSOL |
| `.sldprt` · `.sldasm` | SOLIDWORKS | Save from SOLIDWORKS as DXF (section) or STL |
| `.wbpj` · `.wbpz` · `.db` | Ansys | Write a `.cdb` with CDWRITE in MAPDL, or bring this program's `.cdb` in through External Model |
| `.cas` · `.dat` | Ansys Fluent | Export flow results from Fluent as VTK or CSV |
| `.sim` · `.fem` | Nastran / Simcenter | Export a Nastran `.bdf` from Simcenter, or import this program's `.bdf` |
| `.x_t` | Parasolid | DXF (section) or STL |
| `.step` · `.stp` · `.iges` · `.igs` | STEP · IGES | Save from your CAD program as DXF (section) or STL |

## Product feature map

MyHeatManager gathers the core features of the products below into one light workbench. It does not have everything each of them has, so here is what works and what does not.

| Product | Works in MyHeatManager | Does not |
|---|---|---|
| Ansys Mechanical (Workbench) | Steady and transient conduction, time-dependent boundaries, thermal stress, static structural, modal, `.cdb` import and export | Unstructured and adaptive meshes, nonlinear structures (plasticity, creep, contact), opening Workbench projects |
| Ansys Icepak · Simcenter FloTHERM | JEDEC two-resistor package, heat sink, PCB stack-up and power map helpers, fan curves and internal fans, S2S radiation, solar load (direct, with shadows), 2D and 3D CHT, IDF 3.0 board import | part libraries, ODB++ and Gerber import, diffuse sky radiation |
| Ansys Fluent · STAR-CCM+ | 2D and 3D incompressible flow, natural and forced convection, k-ω SST, convergence plot, flow rates and pressure drop | compressible and multiphase (VOF) flow, other turbulence models, opening case files |
| Ansys Sherlock | Arrhenius and FIT; rainflow, Miner, Coffin–Manson, Engelmaier, Norris–Landzberg; Weibull; Steinberg vibration (PSD table integrated); half-sine shock; harmonic response (transmissibility at a probe) | Part and package databases, ODB++ import, finite-element stress analysis of the solder joints themselves |
| COMSOL Heat Transfer | Phase change, porous media, microfluidics, Joule heating, Pennes bioheat, thin layers, k(T) and cp(T), S2S radiation, reading and writing `.mphtxt` meshes | Arbitrary PDEs, electromagnetics (induction, microwave heating), spectral and participating-media radiation, opening `.mph` |
| Simcenter 3D (Nastran) | Steady and transient heat transfer, time-dependent boundaries, structural and modal, `.bdf` (SOL 153) import and export | Orbital thermal analysis and spacecraft radiation (Space Systems Thermal), opening `.sim` and `.fem` |
| SimScale | 2D and 3D CHT and turbulence, fan curves, PMV and PPD thermal comfort, parameter studies, contact resistance, Joule heating | lattice-Boltzmann wind comfort, parallel cloud computing |
| SOLIDWORKS Simulation · Flow | 2D and 3D conduction, thermal stress, 2D and 3D flow, DXF and STL exchange | Opening CAD parts and assemblies directly |
| LBNL THERM | Window and wall section U-factor, L2D, U-factor per tag, frame cavity equivalent conductivity (ISO 10077-2), condensation and fRsi, opening and saving `.thmx` | Linking to the WINDOW glazing-system library, ISO 15099 cavity radiation models, automatic finite-element meshing with error estimates |
| NASA Heat Analysis Manager | Node CSV heat maps, statistics and comparison (delta, envelope), nodes over a limit, command-line batch runs | The nodal network solve itself (SINDA / Thermal Desktop style) — it reads that solve's result CSV |
| ParaView · CalculiX · FreeCAD · Gmsh | VTK and VTU results, slices, isosurfaces, 3D line cuts, calculator and histogram, integrals per body, reading and writing CalculiX and Gmsh files | General pipelines such as Python filters and volume rendering, solving on unstructured meshes |
| Thermal analysis instrument software | DSC enthalpy, Tg, several peaks, conversion and calibration; Kissinger, OFW and Friedman; model-free Ea(α); TGA steps and DTG; cp(T) by the sapphire method | Reading the instruments' own files (export CSV), fitting reaction models (Šesták–Berggren and others) |

## Not supported

- **Flow grids** — flow is solved on the same uniform Cartesian grid, so narrow gaps (between fins, for example) need three or more cells across. The wall function overpredicts turbulent friction on coarse grids (keep the first cell near y+ ≈ 11 or below). Natural-convection chimneys open at the top can run unphysically fast.
- **Compressible flow, multiphase flow (VOF), lattice-Boltzmann wind comfort**, other turbulence models (k-ε, LES).
- **Electromagnetics** — induction or microwave heating and the like. Only DC Joule heating.
- **Radiation**: spectral (non-grey) and specular behaviour, participating media (smoke, gases), diffuse sky light, reflections and transmission through glass. S2S handles grey, diffuse surfaces only; the solar load handles direct sunlight and shadows only.
- **Mesh**: a uniform Cartesian grid only. Curved surfaces become stair-steps, and there is no local refinement, adaptive meshing or unstructured-mesh solving (Gmsh meshes are opened by tracing their outlines into bodies).
- **Structures**: linear elasticity and small deformations only. No plasticity, creep, contact nonlinearity, large deformation or buckling. The harmonic response is a relative amplitude computed without mode shapes.
- **Files**: STEP, IGES, Parasolid and native CAD files (SOLIDWORKS and others), COMSOL `.mph`, Ansys Workbench projects, ODB++ and Gerber cannot be opened. Solver decks are read for their thermal cards only (structural, flow and electric cards are not read).

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
- Phase change: an apparent heat capacity from the enthalpy difference between the old and new temperature, iterated, so no step can jump over the melting range. cp(T) materials use the same enthalpy form, so energy is conserved.
- Surface-to-surface radiation: view factors (crossed strings in 2D, Monte Carlo rays in 3D) and the radiosity equations are solved again in every outer iteration and enter as face heat sources. Correlation h values and time-table boundary values are re-evaluated every iteration and time step as well.
- The solar load marches a grid ray from every exposed face towards the sun to find the shadows and adds the absorbed heat as a fixed source.
- Thin layers add R = d/k in series to the face conductance and, when conductive, k·d along the layer between neighbouring cells.
- Flow: **projection method** on a staggered (MAC) grid (one code for 2D and 3D, a 7-point pressure equation in 3D), pressure Poisson by IC(0)-CG; Darcy–Brinkman drag in porous regions; Boussinesq buoyancy. Turbulence is **k-ω SST** (automatic wall treatment); a fan moves, every flow step, towards the flow at which its curve equals the measured pressure rise. An internal fan is a pressure jump across the middle plane of its region that follows the curve at the measured flow every step.
- Joule heating solves the electric potential with temperature-dependent conductivity and adds σ|∇V|² as a heat source. Bioheat adds the Pennes term ω_b ρ_b c_b (T_a − T) + q_m in every cell.
- Thermal stress and static structural: bilinear (2D) / trilinear (3D) finite elements on the cell corners, matrix-free element-by-element products with Jacobi-preconditioned CG. Modal analysis finds the eigenvalues with the same stiffness.

Accuracy depends on the grid: solve again with twice the cells; if the result hardly changes, the grid is fine enough.

---

© SHKWON (knix008@naver.com)
