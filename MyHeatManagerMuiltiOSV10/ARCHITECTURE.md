# MyHeatManager — architecture

MyHeatManager is a thermal simulation workbench (conduction, convection, radiation,
phase change, conjugate heat transfer, porous media, thermal stress, reliability and
heat-map processing) for Web, Windows, macOS and Linux.

```
┌──────────────── frontend (JavaScript, Vite, MyCAD-style GUI) ────────────────┐
│ src/core     model, materials, samples, themes, i18n, settings, heat map      │
│ src/ui       menu bar, toolbar, panels, 2D editor/result canvas, 3D view,     │
│              dialogs, charts                                                  │
│ src/platform native.js  — Tauri invoke / browser fallbacks                    │
│              solver.js  — runs a study: Tauri command (desktop) or the WASM   │
│                           worker (web); both return the same binary result    │
└───────────────────────────────────────────────────────────────────────────────┘
          │ model JSON                                   ▲ result bytes (below)
          ▼                                              │
┌──── engine/heat-core (Rust library, no platform code)  ─────────────────────┐
│ model.rs  parse/validate the model JSON                                       │
│ mesh.rs   rasterise bodies onto a uniform grid (2D or 3D)                     │
│ linalg.rs CSR matrices, PCG + IC(0), BiCGSTAB + ILU(0)                        │
│ conduction.rs  steady / transient FV conduction, convection, radiation,       │
│                temperature-dependent k and cp, phase change, thin layers,     │
│                time-dependent boundary conditions                             │
│ convection.rs  h correlations (natural / forced) with air properties          │
│ s2s.rs    surface-to-surface radiation: patches, view factors, radiosity      │
│ flow.rs   2D incompressible flow (MAC grid, projection), forced and natural   │
│           (Boussinesq) convection, Darcy–Brinkman porous media, CHT energy    │
│ stress.rs thermal stress (2D plane stress quads / 3D hexahedra, matrix-free)  │
│ result.rs statistics, boundary heat flows, energy balance, binary encoding    │
│ lib.rs    run(model, progress, cancel) -> Result bytes                        │
└───────────────────────────────────────────────────────────────────────────────┘
   used by  src-tauri (desktop command `run_study`, CLI `--batch`)
   and by   engine/heat-wasm (cdylib for wasm32-unknown-unknown → public/heat.wasm)
```

Nothing needs Node.js at run time: the desktop app embeds the built page and
runs the solver natively; the web build loads `heat.wasm`.

## Units

Lengths in the model are **millimetres**, temperatures **°C**, powers **W**,
heat fluxes **W/m²**, heat transfer coefficients **W/(m²·K)**, conductivity
**W/(m·K)**, density **kg/m³**, specific heat **J/(kg·K)**, latent heat **J/kg**,
viscosity **Pa·s**, permeability **m²**, Young's modulus **Pa**, CTE **1/K**,
velocities **m/s**, times **s**. The engine converts mm → m internally.

## Model JSON (`.myheat`)

```jsonc
{
  "format": "myheat", "version": 1,
  "name": "CPU heat sink",
  "description": "…",
  "domain": {
    "dim": 2,                     // 2 or 3
    "width": 100, "height": 60,   // x, y extent (mm), origin at bottom-left
    "depth": 10,                  // z extent (3D) or out-of-plane thickness (2D), mm
    "nx": 100, "ny": 60, "nz": 1, // cells (nz ignored in 2D)
    "background": "air"           // material id of cells not covered by a body, or null = void (not simulated)
  },
  "ambient": 25,                  // °C, default reference/initial temperature
  "gravity": [0, -9.81],          // m/s² (x, y) for natural convection
  "materials": [{
    "id": "al6061", "name": "Aluminium 6061",
    "kind": "solid",              // solid | fluid | pcm | porous
    "k": 167, "kx": null, "ky": null, "kz": null,   // isotropic k, or per-axis overrides (anisotropic)
    "kT": null,                   // optional [[T°C, k], …] temperature-dependent k (piecewise linear)
    "rho": 2700, "cp": 896,
    "cpT": null,                  // optional [[T°C, cp J/kgK], …] temperature-dependent cp (piecewise linear, clamped)
    "emissivity": 0.1,            // also the surface emissivity for surface-to-surface radiation
    "E": 68.9e9, "nu": 0.33, "alpha": 23.6e-6,      // thermal stress
    "mu": null, "beta": null,     // fluid: dynamic viscosity, thermal expansion (Boussinesq)
    "Tmelt": null, "meltRange": 2, "latent": null,  // pcm: melting temperature, mushy range (K), latent heat
    "kLiquid": null, "porosity": null, "permeability": null,  // pcm liquid k; porous ε, K (m²) with fluid "fluid" id
    "fluid": null,                // porous: id of the fluid material filling the pores
    "color": "#b0b8c0"
  }],
  "bodies": [{
    "id": "b1", "name": "Base",
    "shape": "rect",              // rect | circle | polygon
    "x": 10, "y": 0, "w": 80, "h": 6,   // rect: bottom-left corner + size
    "cx": 0, "cy": 0, "r": 0,           // circle
    "points": [[0,0],[10,0],[5,8]],     // polygon (mm)
    "z0": 0, "z1": 10,            // 3D: z range (mm); ignored in 2D
    "material": "al6061",
    "power": 0,                   // W, total heat generated in the body (uniform per volume)
    "powerProfile": null,         // optional [[t, W], …] transient power (overrides power)
    "current": null, "resistance": null,  // optional Joule heating: current profile [[t, A], …] and R (Ω) → I²R W
    "hidden": false
  }],
  // Later bodies paint over earlier ones.
  "boundaries": [{
    "id": "bc1", "name": "Fan",
    "target": "top",              // left | right | bottom | top | front | back (3D z-min/z-max)
                                  // | exterior (every face between a simulated cell and void or the domain edge)
                                  // | body:<id> (faces of that body's cells that touch void, the edge, or another material)
    "range": null,                // optional [from, to] mm along the edge (left/right: y; bottom/top: x)
    "region": null,               // optional [x0, y0, x1, y1] mm: only faces whose face-centre (x, y)
                                  // lies inside this rectangle (inclusive); works with every target
    "type": "convection",         // temperature | flux | convection | radiation | adiabatic
                                  // | inlet | outlet | wall | slip | open | fan   (flow, 2D edges)
                                  // | fixed | rollerX | rollerY | pressure | force (structural)
                                  // | contact (body:<id> only) | voltage | ground | currentIn (electric)
                                  // | thinLayer (body:<id> or a domain edge)
    "T": 25, "q": 0, "h": 10, "Tinf": 25, "emissivity": 0, "Tamb": 25,
                                  // convection may also carry emissivity (radiation in parallel)
    "Tt": null, "qt": null, "ht": null, "Tinft": null, "Tambt": null,
                                  // optional [[t s, value], …] tables overriding T, q, h, Tinf, Tamb over time
    "hMode": "fixed",             // convection: fixed (use h) | naturalVertical | naturalHorizontalUp
                                  // | naturalHorizontalDown | forcedPlate (h from a correlation)
    "length": 100,                // hMode: characteristic length (mm); forcedPlate uses "velocity" (m/s)
    "thickness": 0.1, "k": 1, "mode": "resistive",   // thinLayer: mm, W/(m·K), resistive | conductive
    "velocity": 1, "Tin": 25,     // inlet: normal speed into the domain, inlet temperature
    "turbulenceIntensity": 0.05, "mixingLength": null,   // inlet/fan turbulence (mm; null = 0.07·Dh)
    "curve": [[0, 60], [0.002, 0]],   // fan: [[Q m³/s through the face of the depth slice, Δp Pa], …]
    "resistance": 1e-4,           // contact: thermal contact resistance (m²K/W)
    "V": 1, "I": 1,               // voltage: potential (V); currentIn: total current (A, + into the domain)
    "p": 1e5, "fx": 0, "fy": -10, "fz": 0   // pressure: Pa (+ pushes into the body); force: total N
  }],
  "probes": [{ "id": "p1", "name": "Junction", "x": 50, "y": 8, "z": 5 }],
  "study": {
    "type": "steady",             // steady | transient
    "flow": false,                // solve 2D flow in fluid/porous cells (CHT)
    "natural": false,             // buoyancy (Boussinesq) in the flow
    "stress": false,              // thermal stress after the thermal solution
    "planeStrain": false,         // 2D stress: plane strain instead of plane stress
    "Tref": 25,                   // stress-free temperature
    "initialT": 25,
    "endTime": 600, "dt": 1, "frames": 40,   // transient: end time, step, number of stored frames
    "tolerance": 1e-6, "maxIter": 20000,
    "flowSteps": 3000,            // steady flow: pseudo-time steps (upper limit)
    "turbulence": "laminar",      // laminar | kOmegaSST   (2D flow)
    "electric": false,            // Joule heating from voltage/ground/currentIn boundaries
    "structural": false,          // run the stress solve (mechanical; thermal strain off by default)
    "thermalStrain": true,        // include α(T − Tref) (default true, false when structural)
    "gravityLoad": false,         // body force ρ·g (model.gravity) in the stress solve
    "modal": { "enabled": false, "modes": 6 },  // natural frequencies and mode shapes
    "s2s": false,                 // gray diffuse surface-to-surface radiation
    "s2sMedium": "void"           // void (void cells are transparent) | fluids (fluid cells too)
  },
  "reliability": {                // post-processing in the frontend (Arrhenius / Coffin-Manson)
    "components": [{ "body": "b2", "Ea": 0.7, "Tref": 55, "mttfRef": 1000000, "cycles": 3650, "dTcycle": null, "cm": { "C": 1e6, "n": 2.0 } }]
  },
  "view": { … frontend only … }
}
```

Defaults: missing numbers take the values shown above; missing `kx/ky/kz` use `k`;
a face with no boundary condition is adiabatic (thermal) / wall (flow) / free (stress).
Boundary priority on a face: `body:<id>` > edge target > `exterior`; among boundaries
of the same priority class that match a face, the **last** one in the array wins.
Between two cells of different simulated materials the faces are conductive (perfect contact).

Engine details of the contract (heat-core):

- Unknown JSON fields are ignored everywhere (`name`, `color`, `category`, `hidden`,
  `view`, `reliability`, `description`, …). Numbers may also be numeric strings;
  `null` means "use the default". `kind` absent → `"solid"`. `"symmetry"` is an alias of `"slip"`.
- Temperature defaults follow `ambient`: boundary `T`, `Tinf`, `Tamb`, `Tin` and
  `study.Tref`, `study.initialT` default to `ambient` (25 when that is missing too).
  Body `z1` defaults to the domain depth. `domain.background` missing → `"air"`
  (must exist), `null` → void.
- Fluids in a flow study must give `mu` (and `beta` with `natural`); pcm needs `Tmelt`
  and `latent`; porous needs `porosity`, `permeability` and a fluid `fluid`. `validate`
  reports these. `kLiquid` defaults to `k`.
- `kT` scales all axes: `kx(T) = kx · kT(T)/k`. pcm: k blends linearly to `kLiquid`
  with the liquid fraction fl = clamp((T − Tmelt + meltRange/2)/meltRange, 0, 1); the
  latent heat enters as enthalpy ρ·latent·fl (chord capacity ΔH/ΔT per time step).
  Porous cells use ε·k_fluid + (1−ε)·k_solid and ε·(ρcp)_fluid + (1−ε)·(ρcp)_solid.
- `power`, `powerProfile` and `current` accept a number or `[[t, value], …]`
  (linear, clamped). `powerProfile` replaces `power`; Joule I²R is added. Steady
  studies evaluate them at t = 0. Power is spread over the cells the body still owns
  after later bodies painted over it (`hidden` bodies are simulated).
- Boundary types act in three independent layers, each resolved with the priority
  rule above: thermal (`temperature flux convection radiation adiabatic inlet outlet open`),
  flow (`inlet outlet wall slip open`) and stress (`fixed rollerX rollerY`). So e.g. a
  `fixed` support and a `convection` film can sit on the same edge. Without flow,
  `inlet/outlet/open` are thermally adiabatic (warning).
- 2D: `front`/`back` target the out-of-plane faces of every simulated cell (area
  dx·dy, half-thickness depth/2 to the surface) — e.g. a plate cooled on its face.
  `exterior` and `body:<id>` do not include these faces in 2D (they do in 3D).
- A `body:<id>` condition that claims a face between two different materials
  **replaces** the contact on that face: the body side gets the condition, the other
  side is adiabatic (a `temperature` condition fixes the interface temperature for
  both sides).
- Radiation uses Kelvin internally; the radiative coefficient is evaluated at the
  surface temperature of the half-cell/film network, iterated with Picard
  (steady: until max ΔT < 1e-4 K, at most 100 iterations, adaptive relaxation).
- A steady study without any temperature/convection/radiation (or inlet) boundary
  returns `initialT` with a warning, or fails when heat is generated or injected.
- Natural convection body force per unit mass is −β(T − Tref)·g with Tref =
  `study.Tref` (defaults to `ambient`); the hydrostatic part is in the pressure,
  so `p` is the dynamic pressure (Pa) relative to outlet/open boundaries (p = 0).
  Closed cavities have p fixed to 0 in one cell.
- Outlet/open faces: zero-gradient velocity, p = 0; inflow through `open` (and
  backflow through `outlet`) enters at `ambient`.

## Result bytes

Both back ends return one `ArrayBuffer`:

```
u32  magic   0x54484D48 ("HMHT" little-endian)
u32  headerLength (bytes of UTF-8 JSON, including the space padding)
...  header JSON, padded with spaces to a multiple of 4 bytes
...  f32 little-endian data block (starts at byte 8 + headerLength)
```

heat-core always pads, so `headerLength % 4 == 0`; readers that round up to a
multiple of 4 get the same offset.

Header:

```jsonc
{
  "ok": true, "error": null, "warnings": ["…"],
  "elapsedMs": 812,
  "grid": { "dim": 2, "nx": 100, "ny": 60, "nz": 1, "dx": 1.0, "dy": 1.0, "dz": 10.0 },  // mm
  "materials": ["air", "al6061"],          // index → id; cell material map is field "mat" (255 = void)
  "times": [0, 15, 30],                    // stored frame times (steady: [0])
  "fields": {                              // name → { offset (f32 index into the data block), length, frames }
    "mat":   { "offset": 0,    "length": 6000, "frames": 1 },
    "T":     { "offset": 6000, "length": 6000, "frames": 3 },   // frame f at offset + f·length
    "qx": …, "qy": …, "qz": …,             // heat flux W/m² (last frame), cell centred
    "qrad": …,                             // S2S: net radiative flux into the cell (W/m², last frame)
    "liquid": …,                           // pcm liquid fraction (frames)
    "u": …, "v": …, "p": …,                // flow, cell centred (last frame)
    "k": …, "omega": …, "nut": …,         // k-ω SST (last frame)
    "V": …, "J": …,                        // electric potential (V), |current density| (A/m²)
    "dispX": …, "dispY": …, "dispZ": …,    // stress: displacement (m), cell centred
    "sxx": …, "syy": …, "szz": …, "sxy": …, "vonMises": …,  // Pa
    "modeX_1": …, "modeY_1": …, "modeZ_1": …   // modal shapes, k = 1…n (max |φ| = 1)
  },
  "probes": [{ "id": "p1", "values": [25.0, 31.2, …] }],    // one value per stored time
  "bodies": [{ "id": "b1", "min": 25, "max": 61.3, "avg": 44.0, "maxHistory": […] }],
  "boundaries": [{ "id": "bc1", "heat": -12.4, "area": 0.0008, "history": […] }],  // W into the domain (+) / out (−), m²
                 // + flow edges: massFlow, volumeFlow, pressureAvg, temperatureAvg; fans: operatingPoint {flow, pressure};
                 // + electric boundaries: current (A); hMode convection: hMean (W/m²K)
  "balance": { "generated": 12.5, "boundaries": -12.4, "stored": 0.0, "error": 0.008 },
  "log": [{ "phase": "conduction", "iterations": 412, "residual": 8e-7 }],
  "stats": { "Tmin": 25, "Tmax": 61.3, "vmax": 0.0, "vonMisesMax": 0.0, "yPlusMax": 0.0 },
  "residuals": { "iterations": [1, 2, …], "series": { "continuity": [1, …], "u": […], "v": […], "T": […], "k": […], "omega": […] } },
  "flow": { "pressureDrop": 12.3 },                         // flow studies
  "electric": { "current": 400, "power": 12.5, "resistance": 7.8e-5, "boundaries": [{ "id": "plus", "current": 400, "voltage": null }] },
  "modes": [{ "frequency": 818.2, "participation": [0.0, 0.61] }],  // modal studies
  "s2s": { "patches": 120, "openings": 8, "faces": 470, "heat": -3.2 }  // study.s2s
}
```

Cell index: `i + nx·(j + ny·k)` with `i` along x (left → right), `j` along y
(bottom → top), `k` along z.

Result details (heat-core):

- Fields present: `mat`, `T` (frames), `qx`, `qy` (+ `qz` in 3D); `liquid` (frames)
  only when pcm cells exist; `qrad` only when S2S radiation found radiating faces; `u`, `v`, `p` only for flow studies; stress fields only
  when the stress solve ran: `dispX`, `dispY`, `sxx`, `syy`, `sxy`, `vonMises`, plus
  `dispZ` and `szz` in 3D, and `szz` in 2D plane strain (plane stress: szz = 0, omitted).
- Void cells: `T`, `liquid` and `qrad` are **NaN**; all other fields are 0. `qrad` is the
  net S2S heat into the cell over its radiating faces divided by their area (0 for
  simulated cells without a radiating face). Non-pcm cells
  have `liquid` = 0; flow fields are 0 outside fluid/porous cells; stress fields 0
  outside solid/pcm/porous cells. `u`/`v` in porous cells are superficial velocities.
  `q*` is the conductive flux (mean of the two face fluxes per axis).
- `times`: steady `[0]`; transient `f·endTime/frames`, f = 0…frames (frame 0 =
  `initialT`). The step is shrunk so frames fall on steps (≤ `dt`).
- Probes: the cell containing the point (2D ignores z); outside the domain or in a
  void cell → `null` values. Bodies with no cells → `min/max/avg` `null`.
- Boundary `heat` (W into the domain) is the final-time value; `history` per frame.
  For inlet/outlet/open it also includes the advected enthalpy ρcp·u·A·(T − ambient).
  `area` sums the faces won in any layer (thermal, flow-only wall/slip, stress supports).
- `balance`: `generated` = Σ body power at the final time, `boundaries` = Σ heat
  (contact and thinLayer heat are internal and excluded; S2S adds `s2s.heat`, the net
  radiative heat into the solids = exchange with the ambient),
  `stored` = rate of change of stored energy over the **last time step** (W; 0 for
  steady), `error` = |generated + boundaries − stored| / max(|generated|, Σ|heat_i|, |stored|).
- `log` phases: `conduction`, `picard` (outer/Newton iterations, also summed over a
  transient run), `transient` (summed linear iterations), `flow` (steps; for steady
  studies `residual` is the final steadiness measure, see below), `pressure` (summed
  iterations), `energy`, `stress`.
- Steady flow studies: converged when the RMS velocity change over a window of 25
  pseudo-steps, expressed per flow-through time (max(width, height)/U) relative to
  the velocity scale U, stays below 1e-3 for two windows (natural convection: the
  temperature drift, relative to the temperature spread, as well). Physically
  unsteady flows (vortex shedding) are detected when that measure stops improving;
  the result then uses the flow averaged over the following 600 pseudo-steps and a
  warning says so. `flowSteps` is an upper limit.
- `elapsedMs` is 0 in the wasm build (no clock on wasm32-unknown-unknown).
- Errors: `{"ok": false, "error": "…"}` with an empty data block; a cancelled run
  has `error: "cancelled"`. Warnings (non-converged iterations, empty bodies,
  ignored settings, diverging flow that was clamped, …) are in `warnings`.

Progress (desktop event `study-progress`, worker message `progress`):
`{ "phase": "setup|electric|conduction|transient|flow|stress|modal|results", "fraction": 0..1, "message": "…" }`
(turbulence runs inside `flow`).

## Extended physics (phase 3)

Material fields (all optional): `sigma` (S/m, electrical conductivity at 20 °C, 0 =
insulator), `alphaR` (1/K, σ = σ0/(1 + αR(T − 20))), `perfusion` (1/s, blood perfusion
ω_b), `metabolic` (W/m³), `bloodRho` (1060), `bloodCp` (3770), `bloodT` (°C, 37).

**Turbulence** (`study.turbulence: "kOmegaSST"`, 2D flow, steady and transient):
k-ω SST (Menter 2003) in pure fluid cells (porous cells stay laminar, νt = 0).
Implicit k/ω transport with the flow step (first-order upwind, SGS sweeps), production
limiter 10β*kω, νt = a1k/max(a1ω, S·F2). Momentum uses ν + νt (∇·(ν_eff∇u) form);
energy uses k + ρcp·νt/Prt (Prt = 0.85). Wall treatment is automatic: ω in the
wall-adjacent cell = √(ω_vis² + ω_log²), ω_vis = 6ν/(β1 y²) (the analytic near-wall
solution at the cell centre, equivalent to Menter's 60ν/(β1 Δy²) wall value), ω_log =
√k/(Cμ^¼ κ y), y = half cell. When y+ (from k) > 11.06 the wall shear switches to the
log-law wall function (effective wall viscosity u_τκy/ln(Ey+), E = 9.8) and the
wall heat conductance to ρcp·ν_w/Prt (Reynolds analogy, P-function neglected, so
heat transfer is best for Pr ≈ 1 or y+ < 5). Inlet: k = 1.5(I·U)², ω = √k/(Cμ^¼ l),
I = `turbulenceIntensity` (0.05), l = `mixingLength` (mm) or 0.07·Dh with Dh = 2 × the
inlet opening (parallel plates). Fields `k` (m²/s²), `omega` (1/s), `nut` (m²/s);
`stats.yPlusMax`. Benchmarks (tests): channel at Re_Dh = 20 000, Cf within 15 % of
Dean, Nu within 25 % of Dittus–Boelter.

**Residual history**: header `residuals: { iterations: [n…], series: { name: [v…] } }`,
≤ 400 rows (evenly down-sampled; `iterations` are the original row numbers), every
series divided by its first non-zero value (so it starts at 1; `null` where a series
was not recorded). Rows: steady flow = one per pseudo-step (`continuity` = RMS
divergence of the predicted velocity, `u`/`v` = RMS velocity change rate, `k`/`omega`
= RMS change rate, `T` = max temperature change rate when natural convection marches
the energy equation); steady nonlinear conduction = one per Picard iteration (`T` =
max ΔT); transient = one per time step (`T` = max ΔT per step, plus flow series in CHT).

**Flow boundary metrics**: `boundaries[]` entries of flow edges (inlet / outlet / open /
fan) carry `massFlow` (kg/s through the depth slice, + into the domain), `volumeFlow`
(m³/s), `pressureAvg` (Pa, area-weighted: inlet/fan = adjacent cell pressure,
outlet/open = 0) and `temperatureAvg` (mass-flow weighted; inflow uses Tin/ambient;
area-weighted cell T without flow). Header `flow: { pressureDrop }` = area-averaged
inlet+fan pressure − area-averaged outlet/open pressure (null without both).

**Fan** (`type: "fan"`, 2D edge): an inlet whose normal speed is Q/A, with Q relaxed
each flow step towards the operating point where the curve Δp(Q) (linear between the
points, clamped) equals the measured pressure rise (area-averaged pressure of the
cells at the fan face; outlets at 0). The curve Δp must not increase with Q.
`boundaries[]` gets `operatingPoint: { flow (m³/s), pressure (Pa) }`.

**Contact resistance** (`type: "contact"`, `target: "body:<id>"`, `resistance` m²K/W):
on faces between that body's cells and simulated cells of another material the face
conductance becomes A/(h/2k₁ + h/2k₂ + R); exterior faces of the body are unaffected
and other boundary types still work there. A `body:` thermal condition on the same
face takes precedence. `heat` = heat crossing into the body (W), `area` = contact area;
contact heat is internal and excluded from `balance.boundaries`.

**Electric conduction / Joule heating** (`study.electric`): ∇·(σ∇V) = 0 on cells with
σ > 0 (FV, harmonic face conductances, PCG + MIC(0)). `voltage` (V) and `ground` (0 V)
are Dirichlet at the face; `currentIn` spreads `I` over its faces by area. Body targets
on interfaces between two conducting materials fix the potential on both sides
(like `temperature`). Joule heat G·ΔV² per face is split between its cells (total =
Σ I·V exactly) and added to the energy equation (counted in `balance.generated`).
With αR ≠ 0: steady = electric/thermal alternation until max ΔT < 1e-3 K (≤ 30),
transient = electric solve at the start of every step. Conductors without a
voltage/ground boundary carry no current (error if they have a currentIn). Fields
`V` (V; NaN outside conductors) and `J` (|current density|, A/m²); `boundaries[]`
of electric boundaries get `current` (A, + into the domain); header
`electric: { current (A, Σ positive inflows), power (W), resistance (Ω, (V_max − V_min)
of the voltage/ground boundaries carrying current / current; null otherwise),
boundaries: [{ id, current, voltage }] }`.

**Bioheat (Pennes)**: per cell source ω_b ρ_b c_b (T_a − T) + q_m, perfusion implicit;
steady and transient; reported in `balance.generated` (perfusion exchange + metabolic).

**Structural loads**: the stress solve runs when `study.stress` or `study.structural`.
`thermalStrain` (default true; default false when `structural` is true) switches the
thermal strain. Loads: `pressure` (`p`, Pa, normal, + pushes into the body), `force`
(`fx/fy/fz`, total N spread over the faces by area), `gravityLoad` (ρ·g with
`model.gravity`, gz = third component). 2D is solved per unit thickness (forces divided
by the depth). Elements use selective reduced integration of the shear terms (no
shear locking in bending). Solver: PCG with IC(0) (Manteuffel shift on breakdown) on
the assembled matrix when it has ≤ 25 M nonzeros, otherwise matrix-free Jacobi-PCG.

**Modal analysis** (`study.modal: { enabled, modes }`): K φ = ω² M φ with lumped mass and
the same supports; shift-invert Lanczos with full M-reorthogonalisation (inner solves:
PCG + IC(0) of K + εM). Unsupported structures use a small shift ε and their rigid-body
modes (≈ 0 Hz) are omitted with a warning. Header `modes: [{ frequency (Hz),
participation: [x, y(, z)] effective modal mass fractions }]`; fields `modeX_k`,
`modeY_k` (+ `modeZ_k` in 3D), k = 1…n, cell-centred and normalised to max |φ| = 1.

## Phase 4: time-dependent boundaries, cp(T), S2S radiation, thin layers, correlations

**Time-dependent boundary conditions**: boundary tables `Tt` (°C), `qt` (W/m²), `ht`
(W/m²K), `Tinft` (°C) and `Tambt` (°C), each `[[t s, value], …]` (or a number), linear
and clamped at both ends, replace `T`, `q`, `h`, `Tinf`, `Tamb` at the time of each
implicit step (end of the step) and in the heat bookkeeping (`heat`, `history`,
balance). Steady studies (and the pseudo-time march of steady natural convection)
evaluate them at t = 0. `ht` values must be ≥ 0; `hMode` takes precedence over `ht`.
S2S openings use `Tambt` of their edge boundary.

**Temperature-dependent specific heat** (material `cpT: [[T°C, cp], …]`, piecewise
linear, clamped): enthalpy formulation H(T) = ρ ∫cp dT (exact integral of the table;
porous cells blend ε·ρf·hf + (1−ε)·ρs·hs, so a pore fluid's `cpT` counts). Transient
steps solve Newton on the enthalpy (residual ρ·ΔH/Δt, Jacobian ρcp(T), pcm latent heat
added on top), so the converged step conserves energy exactly; `stored` uses the
chord ΔH/ΔT. A transient study with any `cpT` is nonlinear; steady studies ignore cp.
The CHT flow solver keeps its own constant ρcp for advection.

**Surface-to-surface radiation** (`study.s2s`, gray and diffuse): transparent cells are
void cells (`s2sMedium: "void"`, default) or void and fluid cells (`"fluids"`).
Radiating faces lie between an opaque cell (any other simulated cell) and a
transparent cell, with the opaque material's `emissivity`. Faces of transparent cells
on the domain edge are openings (black, at the `Tamb`/`Tambt` of a radiation or
convection-with-emissivity boundary resolved on that edge face, else `ambient`). Faces
are grouped into patches: same direction, plane and material, grid-aligned blocks of
4 faces (2D, split into contiguous runs) or 4×4 faces (3D); the block size doubles
until there are ≤ 3000 surface patches. View factors: 2D — Hottel's crossed strings
between the patch segments, each clipped to the other's front half-plane, times the
unobstructed fraction of up to 3×3 sample lines tested by an Amanatides–Woo grid walk
through opaque cells (the 2D model is treated as infinitely long in z; the out-of-plane
faces do not radiate). 3D — 256 cosine-weighted Monte-Carlo rays per patch (fixed
seed per patch) traced by a 3D grid walk; A·F is averaged with its transpose. Rows
are then balanced towards ΣF = 1 by a symmetric (Sinkhorn) scaling that keeps
A_iF_ij = A_jF_ji; any remainder goes to `ambient`. Radiosity
J_i = ε_iĒb_i + (1 − ε_i)G_i (G = Σ F·J + openings + ambient) is solved by
Gauss–Seidel (warm started) in every nonlinear iteration; each face gets
Q = ε(G_i − σT⁴)A (T = temperature of its opaque cell, Kelvin; the half-cell drop to
the surface is neglected), linearised as Q + α(T^k − T), α = 4εσT³A, in the energy
equation. Radiation boundaries keep working alongside, but on a face that radiates
through S2S the boundary's own emissivity is ignored (convection kept; a warning
counts such faces). Header `s2s: { patches, openings, faces, heat }` (`heat` = Σ Q into
the solids, W; internal exchange cancels, so this is the exchange with the ambient) is
added to `balance.boundaries`; field `qrad`. A closed cavity alone does not tie the
temperature level; openings or ambient remainders do.

**Thin layer** (`type: "thinLayer"`, `thickness` mm, `k` W/mK, `mode`): claims the
faces of a `body:<id>` target towards anything that is not that body (other bodies or
materials, void, the domain edge; not the 2D out-of-plane faces), or the faces on a
domain edge target; `range`/`region` filter as usual (`exterior` is not allowed). It is
not a thermal-layer condition: it adds R = d/k in series — on internal faces like a
contact resistance (A/(h/2k₁ + h/2k₂ + R_contact + Σ R_layers)), on boundary faces
between the half cell and the face's own condition (temperature, convection,
radiation). `mode: "conductive"` adds in-plane conduction along the layer: between two
neighbouring cells that carry the same conductive layer on faces of the same
direction, a parallel conductance k·d·W/Δ (W = face width across the step, 2D: depth;
Δ = cell spacing) is added to their shared face. The layer temperature is represented
by the claimed cells (no separate layer unknowns) and layer segments that turn round a
corner are not connected in-plane. `heat` = heat through the layer into the claimed
side (W; internal, excluded from the balance), `area` = layer area. A `body:` thermal
condition that claims a material interface still turns it into a boundary face (see
above); the layer then sits between the claiming side and that condition.

**Convection correlations** (`hMode` on `convection`): `naturalVertical` (Churchill–Chu,
whole range), `naturalHorizontalUp` (0.54 Ra^¼ up to Ra = 10⁷, 0.15 Ra^⅓ above),
`naturalHorizontalDown` (0.27 Ra^¼), the two horizontal cases swapping when the
surface is colder than the fluid, and `forcedPlate` (average over `length`, 0.664 Re^½
Pr^⅓ laminar, (0.037 Re^0.8 − 871) Pr^⅓ above Re = 5·10⁵, with `velocity`). Air
properties (k, ν, Pr; Incropera Table A.4, 200–1000 K, linear, clamped) at the film
temperature, β = 1/T_film, g = 9.81 m/s², L = `length`; Ra uses |Ts − T∞| ≥ 0.1 K.
h is evaluated at the face surface temperature of the half-cell/film network (local
fixed point together with radiation) and the outer Picard loop converges it.
`boundaries[]` entries get `hMean` (area-weighted mean h at the final state, W/m²K).

## Engine crates

`engine/heat-core` (library `heat_core`, deps serde + serde_json, optional rayon via the
default feature `parallel`; build with `default-features = false` for wasm):

```rust
pub struct Progress { pub phase: String, pub fraction: f64, pub message: String }
pub fn run(model_json: &str, progress: &mut dyn FnMut(&Progress), cancel: &dyn Fn() -> bool) -> Vec<u8>;
pub fn validate(model_json: &str) -> Vec<String>;            // empty = OK
pub fn decode(result: &[u8]) -> Result<Decoded, String>;     // Decoded { header: serde_json::Value, data: Vec<f32> }
                                                             //   .field(name, frame) -> Option<&[f32]>
pub fn field_csv(result: &[u8], field: &str, frame: usize) -> String;   // "x,y,z,<field>" (mm, cell centres)
```

Numerics: FV conduction (harmonic face conductance) solved with PCG + MIC(0)
(modified incomplete Cholesky, ω = 0.95); backward Euler in time; nonlinear terms by
Picard iteration, phase change by Newton on the enthalpy (residual ρ·ΔH/Δt with the
piecewise dH/dT Jacobian, energy-exact at convergence; inner solves reduce the
residual ≥ 10×), preconditioner refreshed per solve, extrapolated start per step;
2D flow on a MAC grid with incremental projection (pressure Poisson: PCG + MIC(0) on
the structured stencil), implicit Darcy–Brinkman drag. Transient studies: explicit
hybrid advection/viscous terms with CFL/viscous-limited sub-steps. Steady studies:
pseudo-time march with an implicit hybrid-upwind momentum predictor (lagged fluxes,
symmetric Gauss–Seidel sweeps) at 20× the explicit step limit; with natural
convection the energy equation is marched in the same pseudo-time with a uniform
pseudo heat capacity (0.3 × fluid ρcp; the steady result does not depend on it); CHT energy with implicit
upwind advection (BiCGSTAB + ILU(0)); thermal stress with Q4/H8 elements (selective
reduced integration of shear), PCG + IC(0) on the assembled stiffness (matrix-free
Jacobi-PCG for very large models), rigid modes pinned at the solid centroid when
supports are missing (skipped above 3 million dofs). See "Extended physics" for
turbulence, electric, bioheat, fans, contact, structural loads and modal analysis, and
"Phase 4" for time tables, cp(T), S2S radiation, thin layers and h correlations. `cargo test` in `engine/heat-core` runs the analytic
validations; `cargo test --release -- --ignored --nocapture` prints timings.

## WASM ABI (`public/heat.wasm`)

Built by `node engine/build-wasm.mjs` from `engine/heat-wasm` (cdylib,
wasm32-unknown-unknown, no wasm-bindgen, no threads). `node engine/wasm-smoke.mjs`
checks it.

Exports (pointers/lengths are byte offsets into `memory`, all i32):

| export | meaning |
| --- | --- |
| `memory` | linear memory (re-read `memory.buffer` after every call: it may grow) |
| `hm_alloc(len) → ptr` | allocate an input buffer |
| `hm_free(ptr, len)` | free a buffer from `hm_alloc` (same `len`) |
| `hm_run(ptr, len) → out` | run the model JSON (UTF-8) at `ptr`; `out` → `[u32 LE n][n result bytes]` |
| `hm_validate(ptr, len) → out` | same framing; payload = UTF-8 JSON array of problem strings |
| `hm_result_free(out)` | free a buffer returned by `hm_run` / `hm_validate` |

Imports (module `"env"`):

| import | meaning |
| --- | --- |
| `hm_progress(phasePtr, phaseLen, fraction: f64, msgPtr, msgLen)` | progress (UTF-8 strings in `memory`) |
| `hm_cancelled() → i32` | non-zero cancels the run (checked every few solver iterations) |

```js
const enc = new TextEncoder(), bytes = enc.encode(JSON.stringify(model));
const ptr = ex.hm_alloc(bytes.length);
new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
const out = ex.hm_run(ptr, bytes.length); ex.hm_free(ptr, bytes.length);
const n = new DataView(ex.memory.buffer).getUint32(out, true);
const result = new Uint8Array(ex.memory.buffer, out + 4, n).slice().buffer;  // copy, then
ex.hm_result_free(out);                                                    // free
```

`hm_run` is synchronous (run it in a worker); `hm_cancelled` must read shared
state (e.g. an `Int32Array` on a `SharedArrayBuffer`) to take effect during a run.
