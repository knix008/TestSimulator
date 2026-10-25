//! Model JSON parsing and validation.
//!
//! The model is read leniently from a `serde_json::Value` (numbers may be numbers,
//! numeric strings or null → default) and converted to SI units (mm → m).
//! Problems are collected as human-readable English messages.

use serde_json::Value;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Solid,
    Fluid,
    Pcm,
    Porous,
}

impl Kind {
    /// Cells that carry stress elements.
    pub fn is_structural(self) -> bool {
        matches!(self, Kind::Solid | Kind::Pcm | Kind::Porous)
    }
    /// Cells in which the 2D flow is solved.
    pub fn is_flowing(self) -> bool {
        matches!(self, Kind::Fluid | Kind::Porous)
    }
}

#[derive(Clone, Debug)]
pub struct Material {
    pub id: String,
    pub kind: Kind,
    pub k: f64,
    pub kx: f64,
    pub ky: f64,
    pub kz: f64,
    /// Piecewise linear k(T) table (°C, W/mK); scales kx/ky/kz by k(T)/k.
    pub kt: Option<Vec<(f64, f64)>>,
    pub rho: f64,
    pub cp: f64,
    /// Piecewise linear cp(T) table (°C, J/kgK), clamped at both ends; None = constant `cp`.
    pub cpt: Option<Vec<(f64, f64)>>,
    /// Cumulative sensible enthalpy ∫cp dT (J/kg) at the cpT nodes, relative to the first node.
    pub hcum: Vec<f64>,
    pub emissivity: f64,
    /// Solar absorptivity of the surface (study.solar), 0.6 by default.
    pub absorptivity: f64,
    pub e: f64,
    pub nu: f64,
    pub alpha: f64,
    pub mu: f64,
    pub beta: f64,
    pub tmelt: f64,
    pub melt_range: f64,
    pub latent: f64,
    pub k_liquid: f64,
    pub porosity: f64,
    pub permeability: f64,
    /// Pore fluid (porous) as a material index.
    pub fluid: Option<usize>,
    /// Electrical conductivity (S/m) at 20 °C; 0 = insulator.
    pub sigma: f64,
    /// Temperature coefficient of resistance (1/K): σ = σ0 / (1 + αR (T − 20)).
    pub alpha_r: f64,
    /// Pennes bioheat: blood perfusion rate (1/s), metabolic heat (W/m³),
    /// blood density, specific heat and arterial temperature.
    pub perfusion: f64,
    pub metabolic: f64,
    pub blood_rho: f64,
    pub blood_cp: f64,
    pub blood_t: f64,
}

impl Material {
    /// Specific heat (J/kgK) at temperature t (°C).
    pub fn cp_at(&self, t: f64) -> f64 {
        match &self.cpt {
            Some(tab) => interp(tab, t),
            None => self.cp,
        }
    }

    /// Sensible enthalpy h(t) = ∫cp dT (J/kg), relative to the first cpT node
    /// (exact integral of the piecewise linear, end-clamped cp table); `cp·t`
    /// without a table.
    pub fn enthalpy(&self, t: f64) -> f64 {
        let tab = match &self.cpt {
            Some(tab) if !tab.is_empty() => tab,
            _ => return self.cp * t,
        };
        let (t0, c0) = tab[0];
        if t <= t0 {
            return c0 * (t - t0);
        }
        for (i, w) in tab.windows(2).enumerate() {
            let (ta, ca) = w[0];
            let (tb, cb) = w[1];
            if t <= tb {
                let span = tb - ta;
                if span <= 0.0 {
                    return self.hcum[i + 1];
                }
                let s = t - ta;
                let c = ca + (cb - ca) * s / span;
                return self.hcum[i] + 0.5 * (ca + c) * s;
            }
        }
        let (tn, cn) = tab[tab.len() - 1];
        self.hcum[tab.len() - 1] + cn * (t - tn)
    }

    /// Electrical conductivity at temperature t (°C).
    pub fn sigma_at(&self, t: f64) -> f64 {
        if self.alpha_r == 0.0 {
            return self.sigma;
        }
        self.sigma / (1.0 + self.alpha_r * (t - 20.0)).max(0.05)
    }
}

#[derive(Clone, Debug)]
pub enum Shape {
    Rect { x: f64, y: f64, w: f64, h: f64 },
    Circle { cx: f64, cy: f64, r: f64 },
    Polygon(Vec<(f64, f64)>),
}

#[derive(Clone, Debug)]
pub struct Body {
    pub id: String,
    pub shape: Shape,
    pub z0: f64,
    pub z1: f64,
    pub material: usize,
    pub power: f64,
    pub power_profile: Option<Vec<(f64, f64)>>,
    pub current: Option<Vec<(f64, f64)>>,
    pub resistance: Option<f64>,
}

impl Body {
    /// Heat generated at time t (W).
    pub fn power_at(&self, t: f64) -> f64 {
        let mut p = match &self.power_profile {
            Some(tab) if !tab.is_empty() => interp(tab, t),
            _ => self.power,
        };
        if let (Some(cur), Some(r)) = (&self.current, self.resistance) {
            if !cur.is_empty() {
                let i = interp(cur, t);
                p += i * i * r;
            }
        }
        p
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Edge {
    Left,
    Right,
    Bottom,
    Top,
    Front,
    Back,
}

impl Edge {
    /// Direction index 0..6 = -x,+x,-y,+y,-z,+z.
    pub fn dir(self) -> usize {
        match self {
            Edge::Left => 0,
            Edge::Right => 1,
            Edge::Bottom => 2,
            Edge::Top => 3,
            Edge::Front => 4,
            Edge::Back => 5,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Target {
    Edge(Edge),
    Exterior,
    Body(usize),
    /// Cells inside `region` (internal fans only).
    Interior,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BType {
    Temperature,
    Flux,
    Convection,
    Radiation,
    Adiabatic,
    Inlet,
    Outlet,
    Wall,
    Slip,
    Open,
    Fixed,
    RollerX,
    RollerY,
    /// Thermal contact resistance on a body's interfaces (handled outside the layers).
    Contact,
    Voltage,
    Ground,
    CurrentIn,
    /// Structural pressure load (+ pushes into the body).
    Pressure,
    /// Structural force (total N spread over the faces).
    Force,
    /// Fan with a pressure–flow curve (flow edge / 3D domain face, acts as an inlet).
    Fan,
    /// Fan inside the domain: a pressure jump with a pressure–flow curve across
    /// a plane of the fluid cells of `body:<id>` or of an `interior` region.
    InternalFan,
    /// Thin layer (thermal resistance d/k, optionally in-plane conduction) on a
    /// body's surface or a domain edge (handled outside the layers, like Contact).
    ThinLayer,
}

/// Which resolution layer a boundary type takes part in.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Layer {
    Thermal,
    Flow,
    Stress,
    Electric,
}

impl BType {
    pub fn in_layer(self, layer: Layer) -> bool {
        use BType::*;
        match layer {
            Layer::Thermal => matches!(
                self,
                Temperature | Flux | Convection | Radiation | Adiabatic | Inlet | Outlet | Open | Fan
            ),
            Layer::Flow => matches!(self, Inlet | Outlet | Wall | Slip | Open | Fan),
            Layer::Stress => matches!(self, Fixed | RollerX | RollerY | Pressure | Force),
            Layer::Electric => matches!(self, Voltage | Ground | CurrentIn),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Boundary {
    pub id: String,
    pub target: Target,
    /// [from, to] along the edge, metres (sorted).
    pub range: Option<(f64, f64)>,
    /// Optional [x0, y0, x1, y1] rectangle (m, sorted): only faces whose centre lies inside.
    pub region: Option<(f64, f64, f64, f64)>,
    /// z range of a 6-number region [x0, y0, z0, x1, y1, z1] (m, sorted; 3D only).
    pub region_z: Option<(f64, f64)>,
    /// Internal fan: direction 0..6 (−x, +x, −y, +y, −z, +z) of the pushed flow.
    pub fan_dir: usize,
    pub btype: BType,
    pub t: f64,
    pub q: f64,
    pub h: f64,
    pub tinf: f64,
    pub emissivity: f64,
    pub tamb: f64,
    pub velocity: f64,
    pub tin: f64,
    /// Contact resistance (m²K/W).
    pub resistance: f64,
    /// Voltage (V) for "voltage"; total current (A, + into the domain) for "currentIn".
    pub voltage: f64,
    pub current: f64,
    /// Structural loads: pressure (Pa) and total force components (N).
    pub p_load: f64,
    pub force: [f64; 3],
    /// Inlet turbulence: intensity (–) and mixing length (m; None = 0.07·hydraulic diameter).
    pub turb_intensity: f64,
    pub mixing_length: Option<f64>,
    /// Fan curve [(Q m³/s through the face of the depth slice, Δp Pa)], sorted by Q.
    pub curve: Vec<(f64, f64)>,
    /// Optional time tables [(t s, value)] overriding T, q, h, Tinf, Tamb in
    /// transient studies (linear, clamped; steady studies use t = 0).
    pub tt: Option<Vec<(f64, f64)>>,
    pub qt: Option<Vec<(f64, f64)>>,
    pub ht: Option<Vec<(f64, f64)>>,
    pub tinft: Option<Vec<(f64, f64)>>,
    pub tambt: Option<Vec<(f64, f64)>>,
    /// Convection coefficient from a correlation (fixed = use `h`).
    pub h_mode: HMode,
    /// Characteristic length for the correlations (m).
    pub length: f64,
    /// Thin layer: thickness (m), conductivity (W/mK), in-plane conduction.
    pub thickness: f64,
    pub k_layer: f64,
    pub conductive: bool,
}

/// How a convection boundary gets its heat transfer coefficient.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HMode {
    Fixed,
    NaturalVertical,
    NaturalHorizontalUp,
    NaturalHorizontalDown,
    ForcedPlate,
}

fn at(tab: &Option<Vec<(f64, f64)>>, c: f64, time: f64) -> f64 {
    match tab {
        Some(t) if !t.is_empty() => interp(t, time),
        _ => c,
    }
}

impl Boundary {
    /// Face/cell centre (m) inside `region` (z tested only when given and the
    /// region has a z range).
    #[inline]
    pub fn in_region(&self, x: f64, y: f64, z: Option<f64>) -> bool {
        let e = 1e-9;
        if let Some((x0, y0, x1, y1)) = self.region {
            if !(x >= x0 - e && x <= x1 + e && y >= y0 - e && y <= y1 + e) {
                return false;
            }
        }
        if let (Some((z0, z1)), Some(z)) = (self.region_z, z) {
            if !(z >= z0 - e && z <= z1 + e) {
                return false;
            }
        }
        true
    }

    /// Temperature (°C) at time `time` (s).
    #[inline]
    pub fn t_at(&self, time: f64) -> f64 {
        at(&self.tt, self.t, time)
    }
    /// Heat flux (W/m², + into the domain) at time `time`.
    #[inline]
    pub fn q_at(&self, time: f64) -> f64 {
        at(&self.qt, self.q, time)
    }
    /// Fixed heat transfer coefficient (W/m²K) at time `time`.
    #[inline]
    pub fn h_at(&self, time: f64) -> f64 {
        at(&self.ht, self.h, time)
    }
    /// Fluid temperature (°C) at time `time`.
    #[inline]
    pub fn tinf_at(&self, time: f64) -> f64 {
        at(&self.tinft, self.tinf, time)
    }
    /// Radiation ambient temperature (°C) at time `time`.
    #[inline]
    pub fn tamb_at(&self, time: f64) -> f64 {
        at(&self.tambt, self.tamb, time)
    }
    /// Thin layer resistance d/k (m²K/W).
    #[inline]
    pub fn layer_resistance(&self) -> f64 {
        self.thickness / self.k_layer
    }
}

#[derive(Clone, Debug)]
pub struct Probe {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Debug)]
pub struct Study {
    pub transient: bool,
    pub flow: bool,
    pub natural: bool,
    pub stress: bool,
    pub plane_strain: bool,
    pub tref: f64,
    pub initial_t: f64,
    pub end_time: f64,
    pub dt: f64,
    pub frames: usize,
    pub tolerance: f64,
    pub max_iter: usize,
    pub flow_steps: usize,
    /// k-ω SST turbulence in the 2D flow (false = laminar).
    pub turbulence: bool,
    /// Electric conduction (Joule heating from voltage boundaries).
    pub electric: bool,
    /// Mechanical-only structural run (stress without thermal strain by default).
    pub structural: bool,
    /// Include the thermal strain α(T − Tref) in the stress solve.
    pub thermal_strain: bool,
    /// Body force ρ·g in the stress solve.
    pub gravity_load: bool,
    /// Modal analysis: number of modes (0 = off).
    pub modal_modes: usize,
    /// Gray diffuse surface-to-surface radiation between opaque cells across transparent cells.
    pub s2s: bool,
    /// S2S: fluid cells are transparent too (otherwise only void cells).
    pub s2s_fluids: bool,
    /// Direct sunlight on the exposed surfaces (solar.rs).
    pub solar: Option<Solar>,
}

/// The sun of `study.solar`: irradiance G (W/m²) and the unit vector towards the sun,
/// s = (cos el·cos az, sin el, cos el·sin az) from the elevation el above the x-z plane
/// (y is up) and the azimuth az measured from +x towards +z (degrees).
#[derive(Clone, Debug)]
pub struct Solar {
    pub irradiance: f64,
    pub dir: [f64; 3],
}

impl Study {
    pub fn run_stress(&self) -> bool {
        self.stress || self.structural
    }
}

#[derive(Clone, Debug)]
pub struct Model {
    pub name: String,
    pub dim: usize,
    /// Domain extent in metres.
    pub width: f64,
    pub height: f64,
    pub depth: f64,
    pub nx: usize,
    pub ny: usize,
    pub nz: usize,
    pub background: Option<usize>,
    pub ambient: f64,
    pub gravity: [f64; 3],
    pub materials: Vec<Material>,
    pub bodies: Vec<Body>,
    pub boundaries: Vec<Boundary>,
    pub probes: Vec<Probe>,
    pub study: Study,
}

impl Model {
    pub fn cells(&self) -> usize {
        self.nx * self.ny * if self.dim == 3 { self.nz } else { 1 }
    }
}

/// Maximum number of cells accepted.
pub const MAX_CELLS: usize = 20_000_000;

/// Linear interpolation in a [(t, v)] table, clamped at both ends.
pub fn interp(tab: &[(f64, f64)], t: f64) -> f64 {
    if tab.is_empty() {
        return 0.0;
    }
    if t <= tab[0].0 {
        return tab[0].1;
    }
    for w in tab.windows(2) {
        let (t0, v0) = w[0];
        let (t1, v1) = w[1];
        if t <= t1 {
            if t1 - t0 <= 0.0 {
                return v1;
            }
            return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
        }
    }
    tab[tab.len() - 1].1
}

// ---------------------------------------------------------------- helpers

fn num(o: &Value, key: &str) -> Option<f64> {
    match o.get(key) {
        Some(Value::Number(n)) => n.as_f64().filter(|v| v.is_finite()),
        Some(Value::String(s)) => s.trim().parse::<f64>().ok().filter(|v| v.is_finite()),
        _ => None,
    }
}

fn numd(o: &Value, key: &str, d: f64) -> f64 {
    num(o, key).unwrap_or(d)
}

fn text(o: &Value, key: &str) -> Option<String> {
    match o.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

fn boolean(o: &Value, key: &str, d: bool) -> bool {
    match o.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|v| v != 0.0).unwrap_or(d),
        Some(Value::String(s)) => s == "true" || s == "1",
        _ => d,
    }
}

fn value_num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64().filter(|v| v.is_finite()),
        Value::String(s) => s.trim().parse::<f64>().ok().filter(|v| v.is_finite()),
        _ => None,
    }
}

/// `[[t, v], …]` (sorted by t) or a plain number (constant). `Err` = malformed.
fn table(o: &Value, key: &str) -> Result<Option<Vec<(f64, f64)>>, String> {
    match o.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) if value_num(v).is_some() => Ok(Some(vec![(0.0, value_num(v).unwrap())])),
        Some(Value::Array(rows)) => {
            let mut out = Vec::with_capacity(rows.len());
            for r in rows {
                match r {
                    Value::Array(p) if p.len() >= 2 => match (value_num(&p[0]), value_num(&p[1])) {
                        (Some(a), Some(b)) => out.push((a, b)),
                        _ => return Err(format!("\"{key}\" has a non-numeric row")),
                    },
                    _ => return Err(format!("\"{key}\" rows must be [x, value] pairs")),
                }
            }
            out.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
            if out.is_empty() {
                Ok(None)
            } else {
                Ok(Some(out))
            }
        }
        Some(_) => Err(format!("\"{key}\" must be a number or a list of [x, value] pairs")),
    }
}

fn arr<'a>(o: &'a Value, key: &str) -> &'a [Value] {
    match o.get(key) {
        Some(Value::Array(a)) => a.as_slice(),
        _ => &[],
    }
}

const MM: f64 = 1e-3;

/// Parse a model. Returns the model and a list of problems; the model is only
/// usable when the problem list is empty.
pub fn parse(json: &str) -> (Option<Model>, Vec<String>) {
    let mut errs: Vec<String> = Vec::new();
    let root: Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(e) => return (None, vec![format!("Model is not valid JSON: {e}")]),
    };
    if !root.is_object() {
        return (None, vec!["Model must be a JSON object".into()]);
    }
    if let Some(f) = text(&root, "format") {
        if f != "myheat" {
            errs.push(format!("Unknown format \"{f}\" (expected \"myheat\")"));
        }
    }

    let null = Value::Null;
    let dom = root.get("domain").unwrap_or(&null);
    if !dom.is_object() {
        errs.push("Missing \"domain\" object".into());
    }
    let dim = numd(dom, "dim", 2.0).round() as i64;
    if dim != 2 && dim != 3 {
        errs.push(format!("domain.dim must be 2 or 3 (got {dim})"));
    }
    let dim = if dim == 3 { 3 } else { 2 };
    let width = numd(dom, "width", 100.0);
    let height = numd(dom, "height", 60.0);
    let depth = numd(dom, "depth", 10.0);
    for (n, v) in [("width", width), ("height", height), ("depth", depth)] {
        if v <= 0.0 {
            errs.push(format!("domain.{n} must be positive (got {v})"));
        }
    }
    let mut count = |key: &str, d: f64| -> usize {
        let v = numd(dom, key, d).round();
        if v < 1.0 {
            errs.push(format!("domain.{key} must be at least 1 (got {v})"));
            1
        } else {
            v as usize
        }
    };
    let nx = count("nx", 100.0);
    let ny = count("ny", 60.0);
    let nz = if dim == 3 { count("nz", 1.0) } else { 1 };
    let cells = nx.saturating_mul(ny).saturating_mul(nz);
    if cells > MAX_CELLS {
        errs.push(format!(
            "Grid has {cells} cells; the limit is {MAX_CELLS}. Reduce nx/ny/nz."
        ));
    }
    let ambient = numd(&root, "ambient", 25.0);

    let mut gravity = [0.0, -9.81, 0.0];
    if let Some(Value::Array(g)) = root.get("gravity") {
        for (i, gv) in g.iter().take(3).enumerate() {
            gravity[i] = value_num(gv).unwrap_or(0.0);
        }
    }

    // ---- materials (two passes: ids first so porous `fluid` can refer forward)
    let mats_v = arr(&root, "materials");
    if mats_v.len() > 255 {
        errs.push(format!("At most 255 materials are supported (got {})", mats_v.len()));
    }
    let mut ids: Vec<String> = Vec::new();
    for (i, m) in mats_v.iter().enumerate() {
        let id = text(m, "id").unwrap_or_else(|| format!("material{}", i + 1));
        if ids.contains(&id) {
            errs.push(format!("Duplicate material id \"{id}\""));
        }
        ids.push(id);
    }
    let find_mat = |id: &str| ids.iter().position(|x| x == id);
    let study_v = root.get("study").unwrap_or(&null);
    let study_flow = boolean(study_v, "flow", false);
    let study_natural = boolean(study_v, "natural", false);
    let mut materials = Vec::new();
    for (i, m) in mats_v.iter().enumerate() {
        let id = ids[i].clone();
        let kind = match text(m, "kind").as_deref().unwrap_or("solid") {
            "solid" => Kind::Solid,
            "fluid" => Kind::Fluid,
            "pcm" => Kind::Pcm,
            "porous" => Kind::Porous,
            other => {
                errs.push(format!("Material \"{id}\": unknown kind \"{other}\""));
                Kind::Solid
            }
        };
        let k = numd(m, "k", 167.0);
        let kx = num(m, "kx").unwrap_or(k);
        let ky = num(m, "ky").unwrap_or(k);
        let kz = num(m, "kz").unwrap_or(k);
        for (n, v) in [("k", k), ("kx", kx), ("ky", ky), ("kz", kz)] {
            if v <= 0.0 {
                errs.push(format!("Material \"{id}\": {n} must be positive (got {v})"));
            }
        }
        let kt = match table(m, "kT") {
            Ok(t) => t,
            Err(e) => {
                errs.push(format!("Material \"{id}\": {e}"));
                None
            }
        };
        if let Some(t) = &kt {
            if t.iter().any(|p| p.1 <= 0.0) {
                errs.push(format!("Material \"{id}\": kT conductivities must be positive"));
            }
        }
        let rho = numd(m, "rho", 2700.0);
        let cp = numd(m, "cp", 896.0);
        if rho <= 0.0 || cp <= 0.0 {
            errs.push(format!("Material \"{id}\": rho and cp must be positive"));
        }
        let cpt = match table(m, "cpT") {
            Ok(t) => t,
            Err(e) => {
                errs.push(format!("Material \"{id}\": {e}"));
                None
            }
        };
        if let Some(t) = &cpt {
            if t.iter().any(|p| p.1 <= 0.0) {
                errs.push(format!("Material \"{id}\": cpT specific heats must be positive"));
            }
        }
        let mut hcum = Vec::new();
        if let Some(t) = &cpt {
            hcum.push(0.0);
            for w in t.windows(2) {
                let last = *hcum.last().unwrap();
                hcum.push(last + 0.5 * (w[0].1 + w[1].1) * (w[1].0 - w[0].0));
            }
        }
        let e = numd(m, "E", 68.9e9);
        let nu = numd(m, "nu", 0.33);
        if e <= 0.0 {
            errs.push(format!("Material \"{id}\": E must be positive"));
        }
        if !(-0.99..0.499).contains(&nu) {
            errs.push(format!("Material \"{id}\": nu must be in (-1, 0.5) (got {nu})"));
        }
        let mu_opt = num(m, "mu");
        let beta_opt = num(m, "beta");
        if kind == Kind::Fluid {
            if study_flow && mu_opt.is_none() {
                errs.push(format!("Fluid \"{id}\" needs a viscosity mu (Pa·s) for flow studies"));
            }
            if study_flow && study_natural && beta_opt.is_none() {
                errs.push(format!(
                    "Fluid \"{id}\" needs a thermal expansion coefficient beta (1/K) for natural convection"
                ));
            }
            if let Some(mu) = mu_opt {
                if mu <= 0.0 {
                    errs.push(format!("Fluid \"{id}\": mu must be positive"));
                }
            }
        }
        let tmelt = num(m, "Tmelt");
        let latent = num(m, "latent");
        if kind == Kind::Pcm {
            if tmelt.is_none() {
                errs.push(format!("PCM \"{id}\" needs a melting temperature Tmelt"));
            }
            if latent.is_none() {
                errs.push(format!("PCM \"{id}\" needs a latent heat"));
            } else if latent.unwrap() < 0.0 {
                errs.push(format!("PCM \"{id}\": latent heat must not be negative"));
            }
        }
        let porosity = num(m, "porosity");
        let permeability = num(m, "permeability");
        let mut fluid = None;
        if kind == Kind::Porous {
            match porosity {
                Some(p) if p > 0.0 && p <= 1.0 => {}
                Some(p) => errs.push(format!("Porous \"{id}\": porosity must be in (0, 1] (got {p})")),
                None => errs.push(format!("Porous \"{id}\" needs a porosity")),
            }
            match permeability {
                Some(p) if p > 0.0 => {}
                Some(_) => errs.push(format!("Porous \"{id}\": permeability must be positive")),
                None => errs.push(format!("Porous \"{id}\" needs a permeability (m²)")),
            }
            match text(m, "fluid") {
                Some(fid) => match find_mat(&fid) {
                    Some(fi) => {
                        let fk = text(&mats_v[fi], "kind").unwrap_or_else(|| "solid".into());
                        if fk != "fluid" {
                            errs.push(format!("Porous \"{id}\": pore material \"{fid}\" is not a fluid"));
                        } else {
                            fluid = Some(fi);
                        }
                    }
                    None => errs.push(format!("Porous \"{id}\": unknown pore fluid \"{fid}\"")),
                },
                None => errs.push(format!("Porous \"{id}\" needs a pore \"fluid\" material id")),
            }
        }
        let melt_range = numd(m, "meltRange", 2.0).max(0.0);
        materials.push(Material {
            id,
            kind,
            k,
            kx,
            ky,
            kz,
            kt,
            rho,
            cp,
            cpt,
            hcum,
            emissivity: numd(m, "emissivity", 0.1),
            absorptivity: numd(m, "absorptivity", 0.6),
            e,
            nu,
            alpha: numd(m, "alpha", 23.6e-6),
            mu: mu_opt.unwrap_or(1.8e-5),
            beta: beta_opt.unwrap_or(3.4e-3),
            tmelt: tmelt.unwrap_or(0.0),
            melt_range,
            latent: latent.unwrap_or(0.0),
            k_liquid: num(m, "kLiquid").unwrap_or(k),
            porosity: porosity.unwrap_or(0.5),
            permeability: permeability.unwrap_or(1e-9),
            fluid,
            sigma: num(m, "sigma").unwrap_or(0.0).max(0.0),
            alpha_r: num(m, "alphaR").unwrap_or(0.0),
            perfusion: num(m, "perfusion").unwrap_or(0.0).max(0.0),
            metabolic: num(m, "metabolic").unwrap_or(0.0),
            blood_rho: num(m, "bloodRho").unwrap_or(1060.0),
            blood_cp: num(m, "bloodCp").unwrap_or(3770.0),
            blood_t: num(m, "bloodT").unwrap_or(37.0),
        });
    }

    let background = match dom.get("background") {
        None => Some("air".to_string()),
        Some(Value::Null) => None,
        Some(v) => match v {
            Value::String(s) if s.is_empty() => None,
            Value::String(s) => Some(s.clone()),
            other => Some(other.to_string()),
        },
    };
    let background = match background {
        None => None,
        Some(id) => match find_mat(&id) {
            Some(i) => Some(i),
            None => {
                errs.push(format!(
                    "domain.background refers to unknown material \"{id}\" (use null for void)"
                ));
                None
            }
        },
    };

    // ---- bodies
    let mut bodies = Vec::new();
    let mut body_ids: Vec<String> = Vec::new();
    for (i, b) in arr(&root, "bodies").iter().enumerate() {
        let id = text(b, "id").unwrap_or_else(|| format!("body{}", i + 1));
        if body_ids.contains(&id) {
            errs.push(format!("Duplicate body id \"{id}\""));
        }
        body_ids.push(id.clone());
        let shape = match text(b, "shape").as_deref().unwrap_or("rect") {
            "rect" => {
                let w = numd(b, "w", 0.0);
                let h = numd(b, "h", 0.0);
                if w <= 0.0 || h <= 0.0 {
                    errs.push(format!("Body \"{id}\": rectangle w and h must be positive"));
                }
                Shape::Rect {
                    x: numd(b, "x", 0.0) * MM,
                    y: numd(b, "y", 0.0) * MM,
                    w: w * MM,
                    h: h * MM,
                }
            }
            "circle" => {
                let r = numd(b, "r", 0.0);
                if r <= 0.0 {
                    errs.push(format!("Body \"{id}\": circle radius must be positive"));
                }
                Shape::Circle { cx: numd(b, "cx", 0.0) * MM, cy: numd(b, "cy", 0.0) * MM, r: r * MM }
            }
            "polygon" => {
                let mut pts = Vec::new();
                for p in arr(b, "points") {
                    if let Value::Array(xy) = p {
                        if xy.len() >= 2 {
                            if let (Some(x), Some(y)) = (value_num(&xy[0]), value_num(&xy[1])) {
                                pts.push((x * MM, y * MM));
                                continue;
                            }
                        }
                    }
                    errs.push(format!("Body \"{id}\": polygon points must be [x, y] pairs"));
                    break;
                }
                if pts.len() < 3 {
                    errs.push(format!("Body \"{id}\": a polygon needs at least 3 points"));
                }
                Shape::Polygon(pts)
            }
            other => {
                errs.push(format!("Body \"{id}\": unknown shape \"{other}\""));
                Shape::Rect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }
            }
        };
        let material = match text(b, "material") {
            Some(mid) => match find_mat(&mid) {
                Some(m) => m,
                None => {
                    errs.push(format!("Body \"{id}\": unknown material \"{mid}\""));
                    0
                }
            },
            None => {
                errs.push(format!("Body \"{id}\" has no material"));
                0
            }
        };
        let z0 = numd(b, "z0", 0.0) * MM;
        let z1 = numd(b, "z1", depth) * MM;
        if dim == 3 && z1 <= z0 {
            errs.push(format!("Body \"{id}\": z1 must be greater than z0"));
        }
        let power_profile = table(b, "powerProfile").unwrap_or_else(|e| {
            errs.push(format!("Body \"{id}\": {e}"));
            None
        });
        let current = table(b, "current").unwrap_or_else(|e| {
            errs.push(format!("Body \"{id}\": {e}"));
            None
        });
        let resistance = num(b, "resistance");
        if current.is_some() && resistance.is_none() {
            errs.push(format!("Body \"{id}\": Joule heating needs a resistance (Ω) with the current"));
        }
        bodies.push(Body {
            id,
            shape,
            z0,
            z1,
            material,
            power: numd(b, "power", 0.0),
            power_profile,
            current,
            resistance,
        });
    }

    // ---- boundaries
    let mut boundaries = Vec::new();
    let mut bc_ids: Vec<String> = Vec::new();
    for (i, b) in arr(&root, "boundaries").iter().enumerate() {
        let id = text(b, "id").unwrap_or_else(|| format!("bc{}", i + 1));
        if bc_ids.contains(&id) {
            errs.push(format!("Duplicate boundary id \"{id}\""));
        }
        bc_ids.push(id.clone());
        let tstr = text(b, "target").unwrap_or_default();
        let target = match tstr.as_str() {
            "left" => Target::Edge(Edge::Left),
            "right" => Target::Edge(Edge::Right),
            "bottom" => Target::Edge(Edge::Bottom),
            "top" => Target::Edge(Edge::Top),
            "front" => Target::Edge(Edge::Front),
            "back" => Target::Edge(Edge::Back),
            "exterior" => Target::Exterior,
            "interior" => Target::Interior,
            s if s.starts_with("body:") => {
                let bid = &s[5..];
                match body_ids.iter().position(|x| x == bid) {
                    Some(bi) => Target::Body(bi),
                    None => {
                        errs.push(format!("Boundary \"{id}\": unknown body \"{bid}\""));
                        Target::Exterior
                    }
                }
            }
            "" => {
                errs.push(format!("Boundary \"{id}\" has no target"));
                Target::Exterior
            }
            other => {
                errs.push(format!("Boundary \"{id}\": unknown target \"{other}\""));
                Target::Exterior
            }
        };
        let btype = match text(b, "type").as_deref().unwrap_or("adiabatic") {
            "temperature" => BType::Temperature,
            "flux" => BType::Flux,
            "convection" => BType::Convection,
            "radiation" => BType::Radiation,
            "adiabatic" => BType::Adiabatic,
            "inlet" => BType::Inlet,
            "outlet" => BType::Outlet,
            "wall" => BType::Wall,
            "slip" | "symmetry" => BType::Slip,
            "open" => BType::Open,
            "fixed" => BType::Fixed,
            "rollerX" => BType::RollerX,
            "rollerY" => BType::RollerY,
            "contact" => BType::Contact,
            "voltage" => BType::Voltage,
            "ground" => BType::Ground,
            "currentIn" => BType::CurrentIn,
            "pressure" => BType::Pressure,
            "force" => BType::Force,
            "fan" => BType::Fan,
            "internalFan" => BType::InternalFan,
            "thinLayer" => BType::ThinLayer,
            other => {
                errs.push(format!("Boundary \"{id}\": unknown type \"{other}\""));
                BType::Adiabatic
            }
        };
        let range = match b.get("range") {
            Some(Value::Array(r)) if r.len() >= 2 => match (value_num(&r[0]), value_num(&r[1])) {
                (Some(a), Some(c)) => Some((a.min(c) * MM, a.max(c) * MM)),
                _ => {
                    errs.push(format!("Boundary \"{id}\": range must be [from, to]"));
                    None
                }
            },
            None | Some(Value::Null) => None,
            Some(_) => {
                errs.push(format!("Boundary \"{id}\": range must be [from, to]"));
                None
            }
        };
        let mut region_z = None;
        let region = match b.get("region") {
            Some(Value::Array(r)) if r.len() >= 6 => {
                // 3D box [x0, y0, z0, x1, y1, z1]
                let v: Vec<Option<f64>> = r.iter().take(6).map(value_num).collect();
                if v.iter().all(|x| x.is_some()) {
                    let v: Vec<f64> = v.into_iter().map(|x| x.unwrap()).collect();
                    region_z = Some((v[2].min(v[5]) * MM, v[2].max(v[5]) * MM));
                    Some((v[0].min(v[3]) * MM, v[1].min(v[4]) * MM, v[0].max(v[3]) * MM, v[1].max(v[4]) * MM))
                } else {
                    errs.push(format!("Boundary \"{id}\": region must be [x0, y0, x1, y1] or [x0, y0, z0, x1, y1, z1]"));
                    None
                }
            }
            Some(Value::Array(r)) if r.len() >= 4 => {
                let v: Vec<Option<f64>> = r.iter().take(4).map(value_num).collect();
                if v.iter().all(|x| x.is_some()) {
                    let (x0, y0, x1, y1) = (v[0].unwrap(), v[1].unwrap(), v[2].unwrap(), v[3].unwrap());
                    Some((x0.min(x1) * MM, y0.min(y1) * MM, x0.max(x1) * MM, y0.max(y1) * MM))
                } else {
                    errs.push(format!("Boundary \"{id}\": region must be [x0, y0, x1, y1]"));
                    None
                }
            }
            None | Some(Value::Null) => None,
            Some(_) => {
                errs.push(format!("Boundary \"{id}\": region must be [x0, y0, x1, y1]"));
                None
            }
        };
        let h = numd(b, "h", 10.0);
        let eps = numd(b, "emissivity", 0.0);
        if btype == BType::Convection && h < 0.0 {
            errs.push(format!("Boundary \"{id}\": h must not be negative"));
        }
        if !(0.0..=1.0).contains(&eps) {
            errs.push(format!("Boundary \"{id}\": emissivity must be in [0, 1]"));
        }
        if matches!(btype, BType::Inlet | BType::Outlet | BType::Open) {
            // 2D: the four edges; 3D: the six domain faces (front/back = z-min/z-max).
            let ok = match target {
                Target::Exterior => true,
                Target::Edge(Edge::Front | Edge::Back) => dim == 3,
                Target::Edge(_) => true,
                Target::Body(_) | Target::Interior => false,
            };
            if !ok {
                errs.push(format!("Boundary \"{id}\": flow boundaries must target a domain edge"));
            }
        }
        if btype == BType::Contact {
            if !matches!(target, Target::Body(_)) {
                errs.push(format!("Boundary \"{id}\": a contact resistance must target body:<id>"));
            }
            if num(b, "resistance").map_or(true, |r| r < 0.0) {
                errs.push(format!("Boundary \"{id}\": contact needs a non-negative resistance (m²K/W)"));
            }
        }
        let curve = match table(b, "curve") {
            Ok(Some(c)) => c,
            Ok(None) => Vec::new(),
            Err(e) => {
                errs.push(format!("Boundary \"{id}\": {e}"));
                Vec::new()
            }
        };
        let fan_dir = match text(b, "direction").as_deref().unwrap_or("+x") {
            "-x" => 0,
            "+x" | "x" => 1,
            "-y" => 2,
            "+y" | "y" => 3,
            "-z" => 4,
            "+z" | "z" => 5,
            other => {
                if btype == BType::InternalFan {
                    errs.push(format!("Boundary \"{id}\": direction must be +x, -x, +y, -y, +z or -z (got \"{other}\")"));
                }
                1
            }
        };
        if btype == BType::InternalFan {
            if curve.len() < 2 {
                errs.push(format!("Boundary \"{id}\": a fan needs a curve with at least two [Q, dp] points"));
            } else if curve.windows(2).any(|w| w[1].1 > w[0].1) {
                errs.push(format!("Boundary \"{id}\": the fan curve pressure must not increase with the flow"));
            }
            if dim == 2 && fan_dir >= 4 {
                errs.push(format!("Boundary \"{id}\": a 2D internal fan blows along x or y"));
            }
            match target {
                Target::Body(_) => {}
                Target::Interior if region.is_some() => {}
                _ => errs.push(format!("Boundary \"{id}\": an internal fan must target body:<id> or interior with a region")),
            }
        } else if matches!(target, Target::Interior) {
            errs.push(format!("Boundary \"{id}\": target \"interior\" is only for internal fans"));
        }
        if btype == BType::Fan {
            if curve.len() < 2 {
                errs.push(format!("Boundary \"{id}\": a fan needs a curve with at least two [Q, dp] points"));
            } else if curve.windows(2).any(|w| w[1].1 > w[0].1) {
                errs.push(format!("Boundary \"{id}\": the fan curve pressure must not increase with the flow"));
            }
            let ok = match target {
                Target::Edge(Edge::Front | Edge::Back) => dim == 3,
                Target::Edge(_) => true,
                _ => false,
            };
            if !ok {
                errs.push(format!("Boundary \"{id}\": a fan must target a domain edge"));
            }
        }
        let mut tabs: Vec<Option<Vec<(f64, f64)>>> = Vec::new();
        for key in ["Tt", "qt", "ht", "Tinft", "Tambt"] {
            tabs.push(table(b, key).unwrap_or_else(|e| {
                errs.push(format!("Boundary \"{id}\": {e}"));
                None
            }));
        }
        if tabs[2].as_ref().map_or(false, |t| t.iter().any(|p| p.1 < 0.0)) {
            errs.push(format!("Boundary \"{id}\": ht values must not be negative"));
        }
        let h_mode = match text(b, "hMode").as_deref().unwrap_or("fixed") {
            "fixed" | "" => HMode::Fixed,
            "naturalVertical" => HMode::NaturalVertical,
            "naturalHorizontalUp" => HMode::NaturalHorizontalUp,
            "naturalHorizontalDown" => HMode::NaturalHorizontalDown,
            "forcedPlate" => HMode::ForcedPlate,
            other => {
                errs.push(format!("Boundary \"{id}\": unknown hMode \"{other}\""));
                HMode::Fixed
            }
        };
        let length = numd(b, "length", 100.0);
        if h_mode != HMode::Fixed && length <= 0.0 {
            errs.push(format!("Boundary \"{id}\": the characteristic length must be positive"));
        }
        if h_mode == HMode::ForcedPlate && numd(b, "velocity", 1.0) < 0.0 {
            errs.push(format!("Boundary \"{id}\": the forced-convection velocity must not be negative"));
        }
        let thickness = numd(b, "thickness", 0.1);
        let k_layer = numd(b, "k", 1.0);
        let conductive = match text(b, "mode").as_deref().unwrap_or("resistive") {
            "resistive" | "" => false,
            "conductive" => true,
            other => {
                if btype == BType::ThinLayer {
                    errs.push(format!(
                        "Boundary \"{id}\": thin layer mode must be \"resistive\" or \"conductive\" (got \"{other}\")"
                    ));
                }
                false
            }
        };
        if btype == BType::ThinLayer {
            if thickness <= 0.0 || k_layer <= 0.0 {
                errs.push(format!("Boundary \"{id}\": a thin layer needs a positive thickness and k"));
            }
            if matches!(target, Target::Exterior) {
                errs.push(format!("Boundary \"{id}\": a thin layer must target body:<id> or a domain edge"));
            }
        }
        let ti = numd(b, "turbulenceIntensity", 0.05);
        if !(0.0..=1.0).contains(&ti) {
            errs.push(format!("Boundary \"{id}\": turbulenceIntensity must be in [0, 1]"));
        }
        let ml = num(b, "mixingLength");
        if ml.map_or(false, |l| l <= 0.0) {
            errs.push(format!("Boundary \"{id}\": mixingLength must be positive"));
        }
        boundaries.push(Boundary {
            id,
            target,
            range,
            region,
            region_z,
            fan_dir,
            btype,
            t: numd(b, "T", ambient),
            q: numd(b, "q", 0.0),
            h,
            tinf: numd(b, "Tinf", ambient),
            emissivity: eps,
            tamb: numd(b, "Tamb", ambient),
            velocity: numd(b, "velocity", 1.0),
            tin: numd(b, "Tin", ambient),
            resistance: numd(b, "resistance", 0.0).max(0.0),
            voltage: numd(b, "V", 0.0),
            current: numd(b, "I", 0.0),
            p_load: numd(b, "p", 0.0),
            force: [numd(b, "fx", 0.0), numd(b, "fy", 0.0), numd(b, "fz", 0.0)],
            turb_intensity: ti,
            mixing_length: ml.map(|l| l * MM),
            curve,
            tambt: tabs.pop().unwrap(),
            tinft: tabs.pop().unwrap(),
            ht: tabs.pop().unwrap(),
            qt: tabs.pop().unwrap(),
            tt: tabs.pop().unwrap(),
            h_mode,
            length: length * MM,
            thickness: thickness.max(1e-12) * MM,
            k_layer: k_layer.max(1e-12),
            conductive,
        });
    }

    // ---- probes
    let mut probes = Vec::new();
    for (i, p) in arr(&root, "probes").iter().enumerate() {
        probes.push(Probe {
            id: text(p, "id").unwrap_or_else(|| format!("probe{}", i + 1)),
            x: numd(p, "x", 0.0) * MM,
            y: numd(p, "y", 0.0) * MM,
            z: numd(p, "z", depth / 2.0) * MM,
        });
    }

    // ---- study
    let s = study_v;
    let transient = match text(s, "type").as_deref().unwrap_or("steady") {
        "steady" => false,
        "transient" => true,
        other => {
            errs.push(format!("study.type must be \"steady\" or \"transient\" (got \"{other}\")"));
            false
        }
    };
    let end_time = numd(s, "endTime", 600.0);
    let dt = numd(s, "dt", 1.0);
    let frames = numd(s, "frames", 40.0).round().max(1.0) as usize;
    if transient {
        if end_time <= 0.0 {
            errs.push("study.endTime must be positive".into());
        }
        if dt <= 0.0 {
            errs.push("study.dt must be positive".into());
        } else if end_time / dt > 5.0e6 {
            errs.push("study.endTime / study.dt exceeds 5 000 000 steps".into());
        }
        if frames > 10_000 {
            errs.push("study.frames must be at most 10000".into());
        }
    }
    let tolerance = numd(s, "tolerance", 1e-6);
    if !(tolerance > 0.0 && tolerance < 1.0) {
        errs.push("study.tolerance must be in (0, 1)".into());
    }
    let turbulence = match text(s, "turbulence").as_deref().unwrap_or("laminar") {
        "laminar" | "" => false,
        "kOmegaSST" | "komegasst" | "kOmegaSst" | "sst" => true,
        other => {
            errs.push(format!("study.turbulence must be \"laminar\" or \"kOmegaSST\" (got \"{other}\")"));
            false
        }
    };
    let structural = boolean(s, "structural", false);
    let s2s_fluids = match text(s, "s2sMedium").as_deref().unwrap_or("void") {
        "void" | "" => false,
        "fluids" => true,
        other => {
            errs.push(format!("study.s2sMedium must be \"void\" or \"fluids\" (got \"{other}\")"));
            false
        }
    };
    let solar = match s.get("solar") {
        Some(o @ Value::Object(_)) if boolean(o, "enabled", true) => {
            let g = numd(o, "irradiance", 1000.0);
            let el = numd(o, "elevation", 60.0);
            let az = numd(o, "azimuth", 0.0);
            if !(g >= 0.0 && g <= 5000.0) {
                errs.push("study.solar.irradiance must be between 0 and 5000 W/m²".into());
            }
            if !(-90.0..=90.0).contains(&el) {
                errs.push("study.solar.elevation must be between -90 and 90 degrees".into());
            }
            let (el, az) = (el.to_radians(), az.to_radians());
            Some(Solar { irradiance: g.clamp(0.0, 5000.0), dir: [el.cos() * az.cos(), el.sin(), el.cos() * az.sin()] })
        }
        _ => None,
    };
    let modal_modes = match s.get("modal") {
        Some(m @ Value::Object(_)) => {
            if boolean(m, "enabled", true) {
                let n = numd(m, "modes", 6.0).round();
                if !(1.0..=50.0).contains(&n) {
                    errs.push("study.modal.modes must be between 1 and 50".into());
                }
                n.clamp(1.0, 50.0) as usize
            } else {
                0
            }
        }
        Some(Value::Bool(true)) => 6,
        _ => 0,
    };
    let study = Study {
        transient,
        flow: study_flow,
        natural: study_natural,
        stress: boolean(s, "stress", false),
        plane_strain: boolean(s, "planeStrain", false),
        tref: numd(s, "Tref", ambient),
        initial_t: numd(s, "initialT", ambient),
        end_time,
        dt,
        frames: frames.min(10_000),
        tolerance: tolerance.clamp(1e-14, 0.5),
        max_iter: numd(s, "maxIter", 20000.0).max(10.0) as usize,
        flow_steps: numd(s, "flowSteps", 3000.0).max(1.0) as usize,
        turbulence,
        electric: boolean(s, "electric", false),
        structural,
        thermal_strain: boolean(s, "thermalStrain", !structural),
        gravity_load: boolean(s, "gravityLoad", false),
        modal_modes,
        s2s: boolean(s, "s2s", false),
        s2s_fluids,
        solar,
    };

    if materials.is_empty() {
        errs.push("The model has no materials".into());
    }
    if background.is_none() && bodies.is_empty() {
        errs.push("Nothing to simulate: no bodies and the background is void".into());
    }

    let model = Model {
        name: text(&root, "name").unwrap_or_default(),
        dim,
        width: width * MM,
        height: height * MM,
        depth: depth * MM,
        nx,
        ny,
        nz,
        background,
        ambient,
        gravity,
        materials,
        bodies,
        boundaries,
        probes,
        study,
    };
    (Some(model), errs)
}
