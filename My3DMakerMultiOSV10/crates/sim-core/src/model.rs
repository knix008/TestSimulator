//! The analysis job as the user interface sends it: bodies, materials, mesh settings, boundary
//! conditions (on faces identified by their signature), and the analysis settings.
//!
//! Lengths come in model units (mm by default, `unit` metres per model unit); everything inside
//! the solvers is SI (m, kg, s, Pa, K-differences in °C, W, V, A, T).

use crate::geom::{self, Node, Solid, V3};
use crate::mesh::{self, BodyMesh, Mesh, MeshOptions, NONE};
use crate::Ctx;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Body {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub shape: Node,
    #[serde(default)]
    pub material: String,
    #[serde(default)]
    pub suppressed: bool,
    /// Local element size (model units).
    #[serde(default)]
    pub mesh_size: Option<f64>,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Material {
    pub name: String,
    pub density: f64,
    pub young: f64,
    pub poisson: f64,
    pub cte: f64,
    pub conductivity: f64,
    pub specific_heat: f64,
    #[serde(rename = "yield")]
    pub yield_strength: f64,
    pub ultimate: f64,
    /// Plastic tangent modulus (bilinear isotropic hardening).
    pub tangent: f64,
    /// Basquin S–N curve: S = sf · (2N)^b (Pa).
    pub fatigue_sf: f64,
    pub fatigue_b: f64,
    pub endurance: f64,
    pub resistivity: f64,
    pub permittivity: f64,
    pub permeability: f64,
    /// Fluids and acoustics.
    pub viscosity: f64,
    pub sound_speed: f64,
    pub expansion: f64,
    pub emissivity: f64,
    /// Hyperelastic (Mooney–Rivlin; neo-Hookean when c01 = 0): W = c10 (Ī₁ − 3) + c01 (Ī₂ − 3) + (J − 1)² / d1 (Pa, 1/Pa).
    pub c10: f64,
    pub c01: f64,
    pub d1: f64,
    /// Norton creep, time hardening: ε̇_cr = A σᵛᵐⁿ tᵐ (σ in Pa, t in s).
    pub creep_a: f64,
    pub creep_n: f64,
    pub creep_m: f64,
    /// Strain-life (Coffin–Manson): ductility coefficient ε_f' and exponent c.
    pub fatigue_ef: f64,
    pub fatigue_c: f64,
}

impl Material {
    pub fn lame(&self) -> (f64, f64) {
        let (e, nu) = (self.young, self.poisson);
        (e * nu / ((1.0 + nu) * (1.0 - 2.0 * nu)), e / (2.0 * (1.0 + nu)))
    }
    pub fn is_hyper(&self) -> bool { self.c10 > 0.0 || self.c01 > 0.0 }
    pub fn creeps(&self) -> bool { self.creep_a > 0.0 && self.creep_n > 0.0 }
    pub fn check_structural(&self) -> Result<(), String> {
        if !(self.young > 0.0) || !(self.poisson > -1.0 && self.poisson < 0.5) { return Err(format!("material.badElastic:{}", self.name)); }
        Ok(())
    }
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MeshSpec {
    pub size: f64,
    pub order: u8,
    pub snap: Option<bool>,
    pub smooth: Option<u32>,
    pub feature_angle: Option<f64>,
    pub max_nodes: Option<usize>,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Enclosure {
    pub enabled: bool,
    /// Padding around the bodies: −x, +x, −y, +y, −z, +z (model units).
    pub padding: [f64; 6],
}

/// A face as the user picked it.
#[derive(Deserialize, Clone, Debug)]
pub struct FaceSig {
    pub body: String,
    #[serde(default)]
    pub other: Option<String>,
    pub c: V3,
    pub n: V3,
    pub a: f64,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub a: String,
    pub b: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub friction: f64,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub analysis: String,
    pub bodies: Vec<Body>,
    #[serde(default)]
    pub materials: HashMap<String, Material>,
    #[serde(default)]
    pub mesh: MeshSpec,
    #[serde(default)]
    pub enclosure: Enclosure,
    /// Metres per model unit (0.001 for mm).
    #[serde(default = "default_unit")]
    pub unit: f64,
    #[serde(default)]
    pub bcs: Vec<Value>,
    #[serde(default)]
    pub contacts: Vec<Contact>,
    #[serde(default)]
    pub settings: Value,
    /// Probe points (model units) whose histories are reported.
    #[serde(default)]
    pub probes: Vec<V3>,
}

fn default_unit() -> f64 { 0.001 }

/// The meshed model ready for a solver.
pub struct Model {
    pub job: Job,
    /// Active (not suppressed) bodies in job order; mesh regions index this.
    pub bodies: Vec<Body>,
    pub mats: Vec<Material>,
    pub mesh: Mesh,
    /// Node coordinates in metres.
    pub x: Vec<V3>,
    pub air: u32,
    pub size: f64,
    /// Job contact index of each split interface (mesh contact pair number → job.contacts).
    pub contact_ids: Vec<usize>,
}

pub fn material_of(job: &Job, id: &str) -> Material {
    job.materials.get(id).cloned().unwrap_or_else(|| crate::materials::library(id).unwrap_or_else(crate::materials::structural_steel))
}

impl Model {
    pub fn build(job: Job, ctx: &mut Ctx) -> Result<Model, String> {
        let bodies: Vec<Body> = job.bodies.iter().filter(|b| !b.suppressed).cloned().collect();
        if bodies.is_empty() { return Err("model.noBodies".into()); }
        let solids: Vec<Solid> = bodies.iter().map(|b| Solid::new(&b.shape)).collect::<Result<_, _>>()?;
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        for s in &solids { for k in 0..3 { lo[k] = lo[k].min(s.bbox.0[k]); hi[k] = hi[k].max(s.bbox.1[k]); } }
        let size = geom::norm(geom::sub(hi, lo));
        let h = if job.mesh.size > 0.0 { job.mesh.size } else { size / 25.0 };
        let enclosure = if job.enclosure.enabled || needs_air(&job.analysis) {
            let p = job.enclosure.padding;
            let pad = |i: usize| if p[i] > 0.0 { p[i] } else { 0.5 * size };
            Some(([lo[0] - pad(0), lo[1] - pad(2), lo[2] - pad(4)], [hi[0] + pad(1), hi[1] + pad(3), hi[2] + pad(5)]))
        } else { None };
        let bm: Vec<BodyMesh> = bodies.iter().zip(solids.iter()).map(|(b, s)| {
            let mut planes = [Vec::new(), Vec::new(), Vec::new()];
            if geom::axis_aligned(&b.shape) { geom::grid_planes(&b.shape, &mut planes); }
            BodyMesh { solid: s, planes, size: b.mesh_size.filter(|v| *v > 0.0) }
        }).collect();
        // Contacts other than bonded: (job contact index, body a, body b).
        let split: Vec<(usize, u32, u32)> = job.contacts.iter().enumerate().filter_map(|(i, c)| {
            if c.kind == "bonded" { return None; }
            let a = bodies.iter().position(|b| b.id == c.a)? as u32;
            let b = bodies.iter().position(|b| b.id == c.b)? as u32;
            if a == b { return None; }
            Some((i, a, b))
        }).collect();
        let opt = MeshOptions {
            size: h,
            order: if job.mesh.order == 2 { 2 } else { 1 },
            snap: job.mesh.snap.unwrap_or(true),
            smooth: job.mesh.smooth.unwrap_or(2),
            feature_angle: job.mesh.feature_angle.unwrap_or(35.0),
            enclosure,
            max_nodes: job.mesh.max_nodes.unwrap_or(600_000),
            split: split.iter().map(|s| (s.1, s.2)).collect(),
        };
        let mesh = mesh::generate(&bm, &opt, ctx)?;
        let unit = if job.unit > 0.0 { job.unit } else { 0.001 };
        let x = mesh.nodes.iter().map(|p| [p[0] * unit, p[1] * unit, p[2] * unit]).collect();
        let mats = bodies.iter().map(|b| { let mut m = material_of(&job, &b.material); if m.name.is_empty() { m.name = b.material.clone(); } m }).collect();
        let air = if enclosure.is_some() { bodies.len() as u32 } else { NONE };
        let contact_ids = split.iter().map(|s| s.0).collect();
        Ok(Model { job, bodies, mats, mesh, x, air, size, contact_ids })
    }

    pub fn unit(&self) -> f64 { if self.job.unit > 0.0 { self.job.unit } else { 0.001 } }

    pub fn body_index(&self, id: &str) -> Option<u32> { self.bodies.iter().position(|b| b.id == id).map(|i| i as u32) }

    /// Region of an "other" id: a body, the air, or none.
    fn other_index(&self, other: &Option<String>) -> u32 {
        match other.as_deref() {
            None | Some("") => NONE,
            Some("air") => self.air,
            Some(id) => self.body_index(id).unwrap_or(NONE),
        }
    }

    /// The mesh face that best matches a picked face.
    pub fn find_face(&self, sig: &FaceSig) -> Option<usize> {
        let body = self.body_index(&sig.body)?;
        let other = self.other_index(&sig.other);
        let n = geom::normalize(sig.n);
        let mut best = (f64::INFINITY, None);
        for (i, f) in self.mesh.faces.iter().enumerate() {
            if f.region != body { continue; }
            // The picked side: outside (none / air) matches outside, a neighbour body matches only it.
            let outside = |r: u32| r == NONE || r == self.air;
            if !(f.other == other || (outside(f.other) && outside(other))) { continue; }
            let dc = geom::norm(geom::sub(f.centroid, sig.c)) / self.size.max(1e-300);
            let dn = 1.0 - geom::dot(f.normal, n);
            let da = (f.area - sig.a).abs() / f.area.max(sig.a).max(1e-300);
            let score = dc + 0.5 * dn + 0.3 * da;
            if score < best.0 { best = (score, Some(i)); }
        }
        best.1
    }

    /// The faces named by a boundary condition's "faces" list.
    pub fn faces_of(&self, bc: &Value) -> Vec<usize> {
        let mut out = Vec::new();
        if let Some(list) = bc.get("faces").and_then(|v| v.as_array()) {
            for f in list {
                if let Ok(sig) = serde_json::from_value::<FaceSig>(f.clone()) {
                    if let Some(i) = self.find_face(&sig) { if !out.contains(&i) { out.push(i); } }
                }
            }
        }
        out
    }

    /// Regions named by a boundary condition's "bodies" list.
    pub fn bodies_of(&self, bc: &Value) -> Vec<u32> {
        bc.get("bodies").and_then(|v| v.as_array()).map(|list| list.iter().filter_map(|b| b.as_str().and_then(|id| self.body_index(id))).collect()).unwrap_or_default()
    }

    /// Whether a region is a solid body (not the surrounding air).
    pub fn is_body(&self, r: u32) -> bool { (r as usize) < self.bodies.len() }

    /// Area-weighted nodal weights of faces (consistent for linear and quadratic triangles, in m²):
    /// node → weight, plus the area-weighted unit normal per node.
    pub fn face_weights(&self, faces: &[usize]) -> Vec<(u32, f64, V3)> {
        let u = self.unit();
        let mut acc: HashMap<u32, (f64, V3)> = HashMap::new();
        let quad = self.mesh.order() == 2;
        for &f in faces {
            for &ti in &self.mesh.faces[f].tris {
                let t = self.mesh.tris[ti as usize];
                let (a, b, c) = (self.x[t[0] as usize], self.x[t[1] as usize], self.x[t[2] as usize]);
                let nrm = geom::cross(geom::sub(b, a), geom::sub(c, a));
                let area = 0.5 * geom::norm(nrm);
                let n = geom::normalize(nrm);
                let _ = u;
                let mut push = |node: u32, w: f64| { let e = acc.entry(node).or_insert((0.0, [0.0; 3])); e.0 += w; for k in 0..3 { e.1[k] += n[k] * w; } };
                if quad {
                    // Quadratic triangle: corner weights 0, mid-sides 1/3 of the area each.
                    let m = self.mesh.tri_mid[ti as usize];
                    for &mn in &m { push(mn, area / 3.0); }
                    for &cn in &t { push(cn, 0.0); }
                } else {
                    for &cn in &t { push(cn, area / 3.0); }
                }
            }
        }
        let mut out: Vec<(u32, f64, V3)> = acc.into_iter().map(|(n, (w, v))| (n, w, geom::normalize(v))).collect();
        out.sort_by_key(|e| e.0);
        out
    }

    /// Total area of faces (m²).
    pub fn faces_area(&self, faces: &[usize]) -> f64 {
        let u = self.unit();
        faces.iter().map(|&f| self.mesh.faces[f].area).sum::<f64>() * u * u
    }

    /// Element connectivity, region and its material.
    pub fn elem(&self, e: usize) -> (Vec<u32>, u32) { (self.mesh.element(e), self.mesh.region[e]) }

    /// Elements of solid bodies (not the air).
    pub fn solid_elements(&self) -> Vec<usize> { (0..self.mesh.tets.len()).filter(|&e| self.is_body(self.mesh.region[e])).collect() }

    pub fn setting_f(&self, key: &str, default: f64) -> f64 { self.job.settings.get(key).and_then(|v| v.as_f64()).unwrap_or(default) }
    pub fn setting_u(&self, key: &str, default: usize) -> usize { self.job.settings.get(key).and_then(|v| v.as_u64()).map(|v| v as usize).unwrap_or(default) }
    pub fn setting_b(&self, key: &str, default: bool) -> bool { self.job.settings.get(key).and_then(|v| v.as_bool()).unwrap_or(default) }
    pub fn setting_s(&self, key: &str, default: &str) -> String { self.job.settings.get(key).and_then(|v| v.as_str()).unwrap_or(default).to_string() }

    /// Nodes of the job's probe points (nearest corner node of each); `default` when none are given.
    pub fn probe_nodes(&self, default: impl FnOnce() -> usize) -> Vec<usize> {
        let list: Vec<usize> = self.job.probes.iter().filter_map(|p| self.nearest_node(*p)).collect();
        if list.is_empty() { vec![default()] } else { list }
    }

    /// The nearest node (of solid bodies) to a point in model units.
    pub fn nearest_node(&self, p: V3) -> Option<usize> {
        let mut best = (f64::INFINITY, None);
        for (i, q) in self.mesh.nodes.iter().enumerate().take(self.mesh.ncorner) {
            let d = geom::norm(geom::sub(*q, p));
            if d < best.0 { best = (d, Some(i)); }
        }
        best.1
    }
}

pub fn needs_air(analysis: &str) -> bool {
    matches!(analysis, "electrostatic" | "magnetostatic")
}

/// Reads a number from a JSON value.
pub fn num(v: &Value, key: &str, default: f64) -> f64 { v.get(key).and_then(|x| x.as_f64()).unwrap_or(default) }
pub fn vec3(v: &Value, key: &str) -> Option<V3> {
    let a = v.get(key)?.as_array()?;
    if a.len() != 3 { return None; }
    Some([a[0].as_f64().unwrap_or(0.0), a[1].as_f64().unwrap_or(0.0), a[2].as_f64().unwrap_or(0.0)])
}
pub fn kind(v: &Value) -> &str { v.get("type").and_then(|x| x.as_str()).unwrap_or("") }
pub fn enabled(v: &Value) -> bool { !v.get("suppressed").and_then(|x| x.as_bool()).unwrap_or(false) }
