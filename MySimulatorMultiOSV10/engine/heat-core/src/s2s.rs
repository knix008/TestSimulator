//! Gray, diffuse surface-to-surface (S2S) radiation (`study.s2s`).
//!
//! Radiating faces are the faces between an opaque cell (simulated and not
//! transparent) and a transparent cell (void; with `s2sMedium: "fluids"` also
//! fluid cells). Faces of transparent cells on the domain edge are *openings*:
//! black surfaces at the ambient temperature (the `Tamb` of a radiation /
//! convection-with-emissivity boundary on that edge face, else `model.ambient`).
//! Faces are grouped into patches (runs of up to `run` faces in 2D, `run`×`run`
//! blocks in 3D, `run` = 4 doubled until there are ≤ `MAX_PATCHES` patches).
//!
//! View factors: 2D — Hottel's crossed strings between the patch segments
//! (clipped to each other's front half-plane), times the visible fraction of up
//! to 3×3 sample lines tested by a grid DDA (Amanatides–Woo) through opaque
//! cells; the 2D model is treated as infinitely long in z. 3D — Monte-Carlo with
//! `RAYS` cosine-weighted rays per patch (deterministic seed) traced by a 3D
//! DDA. A·F is symmetrised (reciprocity) and the rows are balanced towards
//! ΣF = 1 with a symmetric (Sinkhorn) scaling; what is still missing goes to
//! the model ambient.
//!
//! Radiosity: J_i = ε_i Ēb_i + (1 − ε_i) G_i, G_i = Σ_j F_ij J_j (+ openings,
//! ambient), solved by Gauss–Seidel (warm started). Each face receives
//! Q_f = ε_i (G_i − σT_f⁴) A_f (W into its opaque cell, T_f = cell temperature)
//! linearised as Q_f + α_f (T_old − T) with α_f = 4 ε σ T_f³ A_f; the outer
//! Picard loop of the conduction solver converges the coupling.

use std::cell::RefCell;
use std::collections::HashMap;

use crate::mesh::{self, Across, Mesh};
use crate::model::{BType, Kind, Layer, Model};

pub const SIGMA: f64 = 5.670374e-8;
const KELVIN: f64 = 273.15;
pub const MAX_PATCHES: usize = 3000;
pub const RAYS: usize = 256;

/// One radiating face (belongs to a surface patch).
#[derive(Clone, Debug)]
pub struct RFace {
    /// Thermal unknown of the opaque cell.
    pub u: u32,
    pub cell: u32,
    pub d: u8,
    pub area: f64,
    pub patch: u32,
}

pub struct S2s {
    pub faces: Vec<RFace>,
    /// Surface patches: area (m²) and emissivity.
    pub area: Vec<f64>,
    pub eps: Vec<f64>,
    /// F_ij between surface patches (sparse rows).
    pub rows: Vec<Vec<(u32, f64)>>,
    /// F_io from surface patches to openings.
    pub orows: Vec<Vec<(u32, f64)>>,
    /// Remaining fraction of each row, sent to the model ambient.
    pub f_amb: Vec<f64>,
    /// Openings: the boundary giving their temperature (None = model ambient) and area.
    pub open_bc: Vec<Option<usize>>,
    pub open_area: Vec<f64>,
    /// Radiosity of the last solve (warm start).
    jrad: RefCell<Vec<f64>>,
    pub ambient: f64,
}

/// Patch geometry used while computing view factors.
struct Patch {
    /// Direction 0..6 the patch faces (into the transparent region).
    fd: usize,
    /// Plane coordinate (m) along axis fd/2.
    plane: f64,
    /// Member faces (cell, direction of the face from that cell).
    faces: Vec<(usize, usize)>,
    area: f64,
    /// 2D: segment along the tangential axis [t0, t1] (m).
    t0: f64,
    t1: f64,
}

struct Geo<'a> {
    g: &'a mesh::Grid,
    transparent: Vec<bool>,
    hs: [f64; 3],
}

fn splitmix(state: &mut u64) -> f64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^= z >> 31;
    (z >> 11) as f64 / (1u64 << 53) as f64
}

impl<'a> Geo<'a> {
    fn ijk_of(&self, p: [f64; 3]) -> [i64; 3] {
        let n = [self.g.nx, self.g.ny, self.g.nz];
        let mut r = [0i64; 3];
        for a in 0..3 {
            let v = (p[a] / self.hs[a]).floor() as i64;
            r[a] = v.clamp(0, n[a] as i64 - 1);
        }
        if self.g.dim == 2 {
            r[2] = 0;
        }
        r
    }

    fn cell(&self, ijk: [i64; 3]) -> usize {
        self.g.idx(ijk[0] as usize, ijk[1] as usize, ijk[2] as usize)
    }

    /// Plane coordinate of the face of cell c in direction d.
    fn plane(&self, c: usize, d: usize) -> f64 {
        let (i, j, k) = self.g.ijk(c);
        let idx = [i, j, k][d / 2];
        (idx + d % 2) as f64 * self.hs[d / 2]
    }

    /// 2D: is the segment p → q free of opaque cells (both points in transparent cells)?
    fn clear2(&self, p: [f64; 3], q: [f64; 3]) -> bool {
        let a = self.ijk_of(p);
        let b = self.ijk_of(q);
        let (mut i, mut j) = (a[0], a[1]);
        let dir = [q[0] - p[0], q[1] - p[1]];
        let step = [if dir[0] > 0.0 { 1 } else { -1 }, if dir[1] > 0.0 { 1 } else { -1 }];
        let mut tmax = [f64::INFINITY; 2];
        let mut tdel = [f64::INFINITY; 2];
        for ax in 0..2 {
            if dir[ax] != 0.0 {
                let idx = if ax == 0 { i } else { j };
                let edge = (idx + if step[ax] > 0 { 1 } else { 0 }) as f64 * self.hs[ax];
                tmax[ax] = (edge - p[ax]) / dir[ax];
                tdel[ax] = self.hs[ax] / dir[ax].abs();
            }
        }
        // Exactly |Δi| + |Δj| steps reach the end cell; near a grid corner the
        // axis whose index already matches the end is never stepped again.
        let nsteps = (b[0] - a[0]).abs() + (b[1] - a[1]).abs();
        if !self.transparent[self.cell([i, j, 0])] {
            return false;
        }
        for _ in 0..nsteps {
            let xstep = if i == b[0] {
                false
            } else if j == b[1] {
                true
            } else {
                tmax[0] < tmax[1]
            };
            if xstep {
                i += step[0];
                tmax[0] += tdel[0];
            } else {
                j += step[1];
                tmax[1] += tdel[1];
            }
            if !self.transparent[self.cell([i, j, 0])] {
                return false;
            }
        }
        true
    }

    /// 3D ray from o (inside a transparent cell) along dir: Ok((opaque cell, its face
    /// direction)) on a surface hit, Err((last transparent cell, exit direction)) when
    /// the ray leaves the domain.
    fn trace3(&self, o: [f64; 3], dir: [f64; 3]) -> Result<(usize, usize), (usize, usize)> {
        let n = [self.g.nx as i64, self.g.ny as i64, self.g.nz as i64];
        let mut c = self.ijk_of(o);
        let mut step = [0i64; 3];
        let mut tmax = [f64::INFINITY; 3];
        let mut tdel = [f64::INFINITY; 3];
        for ax in 0..3 {
            step[ax] = if dir[ax] > 0.0 { 1 } else { -1 };
            if dir[ax] != 0.0 {
                let edge = (c[ax] + if step[ax] > 0 { 1 } else { 0 }) as f64 * self.hs[ax];
                tmax[ax] = (edge - o[ax]) / dir[ax];
                tdel[ax] = self.hs[ax] / dir[ax].abs();
            }
        }
        let guard = (n[0] + n[1] + n[2] + 8) as usize;
        for _ in 0..guard {
            let ax = if tmax[0] <= tmax[1] && tmax[0] <= tmax[2] {
                0
            } else if tmax[1] <= tmax[2] {
                1
            } else {
                2
            };
            let mut nxt = c;
            nxt[ax] += step[ax];
            let cur = self.cell(c);
            if nxt[ax] < 0 || nxt[ax] >= n[ax] {
                return Err((cur, 2 * ax + usize::from(step[ax] > 0)));
            }
            let nc = self.cell(nxt);
            if !self.transparent[nc] {
                return Ok((nc, 2 * ax + usize::from(step[ax] < 0)));
            }
            c = nxt;
            tmax[ax] += tdel[ax];
        }
        Err((self.cell(c), 0))
    }
}

/// Visible-region clip of the 2D segment [a, b] to {p : (p − c)·n > 0}.
fn clip(a: [f64; 2], b: [f64; 2], c: [f64; 2], n: [f64; 2], tol: f64) -> Option<([f64; 2], [f64; 2])> {
    let sa = (a[0] - c[0]) * n[0] + (a[1] - c[1]) * n[1];
    let sb = (b[0] - c[0]) * n[0] + (b[1] - c[1]) * n[1];
    if sa <= tol && sb <= tol {
        return None;
    }
    if sa > tol && sb > tol {
        return Some((a, b));
    }
    let f = sa / (sa - sb);
    let m = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    if sa > tol {
        Some((a, m))
    } else {
        Some((m, b))
    }
}

fn dist(a: [f64; 2], b: [f64; 2]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

/// Hottel crossed strings: A1·F12 per unit depth for two mutually visible segments.
pub fn crossed_strings(a1: [f64; 2], b1: [f64; 2], a2: [f64; 2], b2: [f64; 2]) -> f64 {
    0.5 * ((dist(a1, b2) + dist(b1, a2)) - (dist(a1, a2) + dist(b1, b2))).abs()
}

impl S2s {
    /// Build the radiating faces, patches and view factors. None when there is no
    /// radiating face.
    pub fn new(model: &Model, mesh: &Mesh, unk: &[u32]) -> Option<S2s> {
        let g = &mesh.grid;
        let nc = g.n();
        let fluids = model.study.s2s_fluids;
        let transparent: Vec<bool> = (0..nc)
            .map(|c| {
                !mesh.simulated(c) || (fluids && model.materials[mesh.mat[c] as usize].kind == Kind::Fluid)
            })
            .collect();
        let ndir = if g.dim == 3 { 6 } else { 4 };
        // Radiating faces (opaque side) and opening faces (transparent side on the edge).
        let mut sf: Vec<(usize, usize)> = Vec::new();
        let mut of: Vec<(usize, usize, Option<usize>)> = Vec::new();
        for c in 0..nc {
            for d in 0..ndir {
                match g.neighbour(c, d) {
                    Some(nb) => {
                        if !transparent[c] && transparent[nb] {
                            sf.push((c, d));
                        }
                    }
                    None => {
                        if transparent[c] {
                            let bc = mesh::resolve(model, mesh, Layer::Thermal, c, d, Across::Outside).filter(|&b| {
                                let bb = &model.boundaries[b];
                                matches!(bb.btype, BType::Radiation | BType::Convection) && bb.emissivity > 0.0
                            });
                            of.push((c, d, bc));
                        }
                    }
                }
            }
        }
        if sf.is_empty() {
            return None;
        }
        let geo = Geo { g, transparent, hs: [g.dx, g.dy, g.dz] };
        let hmin = if g.dim == 3 { g.dx.min(g.dy).min(g.dz) } else { g.dx.min(g.dy) };

        // ---- patches
        let mut run = 4usize;
        let mut sp;
        loop {
            sp = group(&geo, &sf.iter().map(|&(c, d)| (c, d, d, mesh.mat[c] as usize)).collect::<Vec<_>>(), run);
            if sp.len() <= MAX_PATCHES || run > 4096 {
                break;
            }
            run *= 2;
        }
        // Openings: transparent cell faces on the edge, facing into the domain.
        let okey = |b: Option<usize>| b.map_or(0, |x| x + 1);
        let op = group(&geo, &of.iter().map(|&(c, d, b)| (c, d, d ^ 1, okey(b))).collect::<Vec<_>>(), run);
        let open_bc: Vec<Option<usize>> = op
            .iter()
            .map(|p| {
                let (c, d) = p.faces[0];
                of.iter().find(|x| x.0 == c && x.1 == d).and_then(|x| x.2)
            })
            .collect();
        let ns = sp.len();
        let no = op.len();
        let area: Vec<f64> = sp.iter().map(|p| p.area).collect();
        let eps: Vec<f64> = sp
            .iter()
            .map(|p| model.materials[mesh.mat[p.faces[0].0] as usize].emissivity.clamp(0.0, 1.0))
            .collect();
        let mut faces = Vec::with_capacity(sf.len());
        for (pi, p) in sp.iter().enumerate() {
            for &(c, d) in &p.faces {
                faces.push(RFace { u: unk[c], cell: c as u32, d: d as u8, area: g.face_area(d), patch: pi as u32 });
            }
        }

        // ---- view factors: symmetric A·F edges
        let mut ss: Vec<(u32, u32, f64)> = Vec::new();
        let mut so: Vec<(u32, u32, f64)> = Vec::new();
        if g.dim == 2 {
            let seg = |p: &Patch| -> ([f64; 2], [f64; 2], [f64; 2]) {
                let a = p.fd / 2;
                let s = if p.fd % 2 == 1 { 1.0 } else { -1.0 };
                if a == 0 {
                    ([p.plane, p.t0], [p.plane, p.t1], [s, 0.0])
                } else {
                    ([p.t0, p.plane], [p.t1, p.plane], [0.0, s])
                }
            };
            let tol = 1e-9 * hmin;
            let off = 1e-6 * hmin;
            let pair = |pi: &Patch, pj: &Patch| -> f64 {
                let (a1, b1, n1) = seg(pi);
                let (a2, b2, n2) = seg(pj);
                let Some((c2a, c2b)) = clip(a2, b2, a1, n1, tol) else { return 0.0 };
                let Some((c1a, c1b)) = clip(a1, b1, a2, n2, tol) else { return 0.0 };
                let af = crossed_strings(c1a, c1b, c2a, c2b);
                if af <= 0.0 {
                    return 0.0;
                }
                let samples = |a: [f64; 2], b: [f64; 2], n: [f64; 2]| -> Vec<[f64; 3]> {
                    let m = ((dist(a, b) / hmin).ceil() as usize).clamp(1, 3);
                    (0..m)
                        .map(|k| {
                            let f = (k as f64 + 0.5) / m as f64;
                            [a[0] + (b[0] - a[0]) * f + n[0] * off, a[1] + (b[1] - a[1]) * f + n[1] * off, 0.0]
                        })
                        .collect()
                };
                let s1 = samples(c1a, c1b, n1);
                let s2 = samples(c2a, c2b, n2);
                let mut vis = 0usize;
                for p in &s1 {
                    for q in &s2 {
                        if geo.clear2(*p, *q) {
                            vis += 1;
                        }
                    }
                }
                af * g.dz * vis as f64 / (s1.len() * s2.len()) as f64
            };
            let row = |i: usize| -> (Vec<(u32, u32, f64)>, Vec<(u32, u32, f64)>) {
                let mut a = Vec::new();
                let mut b = Vec::new();
                for j in i + 1..ns {
                    let v = pair(&sp[i], &sp[j]);
                    if v > 0.0 {
                        a.push((i as u32, j as u32, v));
                    }
                }
                for o in 0..no {
                    let v = pair(&sp[i], &op[o]);
                    if v > 0.0 {
                        b.push((i as u32, o as u32, v));
                    }
                }
                (a, b)
            };
            let rows: Vec<(Vec<(u32, u32, f64)>, Vec<(u32, u32, f64)>)> = par_map(ns, &row);
            for (a, b) in rows {
                ss.extend(a);
                so.extend(b);
            }
        } else {
            let mut smap: HashMap<u64, u32> = HashMap::new();
            for (pi, p) in sp.iter().enumerate() {
                for &(c, d) in &p.faces {
                    smap.insert((c as u64) * 8 + d as u64, pi as u32);
                }
            }
            let mut omap: HashMap<u64, u32> = HashMap::new();
            for (oi, p) in op.iter().enumerate() {
                for &(c, d) in &p.faces {
                    omap.insert((c as u64) * 8 + d as u64, oi as u32);
                }
            }
            let off = 1e-6 * hmin;
            let row = |i: usize| -> (Vec<(u32, u32, f64)>, Vec<(u32, u32, f64)>) {
                let p = &sp[i];
                let mut hits: HashMap<u32, usize> = HashMap::new();
                let mut ohits: HashMap<u32, usize> = HashMap::new();
                let mut rng = 0x5EED_0000_0000_0000u64 ^ (i as u64).wrapping_mul(0x9E3779B97F4A7C15);
                let a = p.fd / 2;
                let s = if p.fd % 2 == 1 { 1.0 } else { -1.0 };
                let (t1, t2) = match a {
                    0 => (1, 2),
                    1 => (0, 2),
                    _ => (0, 1),
                };
                for r in 0..RAYS {
                    let (c, d) = p.faces[r % p.faces.len()];
                    let (i0, j0, k0) = g.ijk(c);
                    let lo = [i0 as f64 * g.dx, j0 as f64 * g.dy, k0 as f64 * g.dz];
                    let mut o = [0.0; 3];
                    o[a] = geo.plane(c, d) + s * off;
                    o[t1] = lo[t1] + splitmix(&mut rng) * geo.hs[t1];
                    o[t2] = lo[t2] + splitmix(&mut rng) * geo.hs[t2];
                    let phi = 2.0 * std::f64::consts::PI * splitmix(&mut rng);
                    let r2 = splitmix(&mut rng);
                    let st = r2.sqrt();
                    let ct = (1.0 - r2).max(0.0).sqrt();
                    let mut dir = [0.0; 3];
                    dir[a] = s * ct;
                    dir[t1] = st * phi.cos();
                    dir[t2] = st * phi.sin();
                    match geo.trace3(o, dir) {
                        Ok((hc, hd)) => {
                            if let Some(&j) = smap.get(&((hc as u64) * 8 + hd as u64)) {
                                if j as usize != i {
                                    *hits.entry(j).or_insert(0) += 1;
                                }
                            }
                        }
                        Err((ec, ed)) => {
                            if let Some(&oi) = omap.get(&((ec as u64) * 8 + ed as u64)) {
                                *ohits.entry(oi).or_insert(0) += 1;
                            }
                        }
                    }
                }
                let w = p.area / RAYS as f64;
                let mut a1: Vec<(u32, u32, f64)> = hits.into_iter().map(|(j, n)| (i as u32, j, w * n as f64)).collect();
                let mut b1: Vec<(u32, u32, f64)> = ohits.into_iter().map(|(o, n)| (i as u32, o, w * n as f64)).collect();
                a1.sort_by_key(|x| x.1);
                b1.sort_by_key(|x| x.1);
                (a1, b1)
            };
            let rows = par_map(ns, &row);
            // Reciprocity: A_i F_ij and A_j F_ji averaged.
            let mut sym: HashMap<u64, f64> = HashMap::new();
            for (a, b) in rows {
                for (i, j, v) in a {
                    let (lo, hi) = if i < j { (i, j) } else { (j, i) };
                    *sym.entry(((lo as u64) << 32) | hi as u64).or_insert(0.0) += 0.5 * v;
                }
                so.extend(b);
            }
            let mut keys: Vec<(u64, f64)> = sym.into_iter().collect();
            keys.sort_by_key(|x| x.0);
            for (k, v) in keys {
                ss.push(((k >> 32) as u32, (k & 0xffff_ffff) as u32, v));
            }
        }

        // ---- row balancing (symmetric scaling keeps reciprocity)
        let mut sums = vec![0.0; ns];
        for _ in 0..60 {
            sums.iter_mut().for_each(|x| *x = 0.0);
            for &(i, j, v) in &ss {
                sums[i as usize] += v;
                sums[j as usize] += v;
            }
            for &(i, _, v) in &so {
                sums[i as usize] += v;
            }
            let r: Vec<f64> =
                (0..ns).map(|i| if sums[i] > 0.0 { (sums[i] / area[i]).clamp(0.25, 4.0) } else { 1.0 }).collect();
            let dev = r.iter().map(|x| (x - 1.0).abs()).fold(0.0, f64::max);
            if dev < 1e-9 {
                break;
            }
            for e in ss.iter_mut() {
                e.2 /= (r[e.0 as usize] * r[e.1 as usize]).sqrt();
            }
            for e in so.iter_mut() {
                e.2 /= r[e.0 as usize];
            }
        }
        let mut rows = vec![Vec::new(); ns];
        let mut orows = vec![Vec::new(); ns];
        for &(i, j, v) in &ss {
            rows[i as usize].push((j, v / area[i as usize]));
            rows[j as usize].push((i, v / area[j as usize]));
        }
        for &(i, o, v) in &so {
            orows[i as usize].push((o, v / area[i as usize]));
        }
        let mut f_amb = vec![0.0; ns];
        for i in 0..ns {
            let s: f64 = rows[i].iter().map(|x| x.1).sum::<f64>() + orows[i].iter().map(|x| x.1).sum::<f64>();
            if s > 1.0 {
                for x in rows[i].iter_mut().chain(orows[i].iter_mut()) {
                    x.1 /= s;
                }
            } else {
                f_amb[i] = 1.0 - s;
            }
        }
        let open_area = op.iter().map(|p| p.area).collect();
        Some(S2s {
            faces,
            area,
            eps,
            rows,
            orows,
            f_amb,
            open_bc,
            open_area,
            jrad: RefCell::new(Vec::new()),
            ambient: model.ambient,
        })
    }

    pub fn patches(&self) -> usize {
        self.area.len()
    }

    /// Radiosity solve at cell temperatures `t` (°C, per unknown); returns the
    /// irradiation G (W/m²) of each surface patch.
    pub fn irradiation(&self, model: &Model, t: &[f64], time: f64) -> Vec<f64> {
        let ns = self.area.len();
        let mut eb = vec![0.0; ns];
        for f in &self.faces {
            let tk = (t[f.u as usize] + KELVIN).max(0.0);
            eb[f.patch as usize] += SIGMA * tk.powi(4) * f.area;
        }
        for i in 0..ns {
            eb[i] /= self.area[i];
        }
        let topen: Vec<f64> = self
            .open_bc
            .iter()
            .map(|b| {
                let tc = match b {
                    Some(bi) => model.boundaries[*bi].tamb_at(time),
                    None => self.ambient,
                };
                SIGMA * (tc + KELVIN).max(0.0).powi(4)
            })
            .collect();
        let eamb = SIGMA * (self.ambient + KELVIN).max(0.0).powi(4);
        let cst: Vec<f64> = (0..ns)
            .map(|i| self.orows[i].iter().map(|&(o, f)| f * topen[o as usize]).sum::<f64>() + self.f_amb[i] * eamb)
            .collect();
        let mut j = self.jrad.borrow_mut();
        if j.len() != ns {
            *j = eb.clone();
        }
        let scale = eb.iter().chain(topen.iter()).cloned().fold(eamb, f64::max).max(1e-30);
        for _sweep in 0..5000 {
            let mut change: f64 = 0.0;
            for i in 0..ns {
                let gi = cst[i] + self.rows[i].iter().map(|&(k, f)| f * j[k as usize]).sum::<f64>();
                let nj = self.eps[i] * eb[i] + (1.0 - self.eps[i]) * gi;
                change = change.max((nj - j[i]).abs());
                j[i] = nj;
            }
            if change < 1e-12 * scale {
                break;
            }
        }
        (0..ns).map(|i| cst[i] + self.rows[i].iter().map(|&(k, f)| f * j[k as usize]).sum::<f64>()).collect()
    }

    /// Per radiating face: (unknown, net heat into the opaque cell Q (W), α (W/K)).
    pub fn face_terms(&self, model: &Model, t: &[f64], time: f64) -> Vec<(u32, f64, f64)> {
        let gi = self.irradiation(model, t, time);
        self.faces
            .iter()
            .map(|f| {
                let e = self.eps[f.patch as usize];
                let tk = (t[f.u as usize] + KELVIN).max(1.0);
                let q = e * (gi[f.patch as usize] - SIGMA * tk.powi(4)) * f.area;
                (f.u, q, 4.0 * e * SIGMA * tk.powi(3) * f.area)
            })
            .collect()
    }

    /// Row sums Σ_j F_ij + F_open + F_amb (1 for every patch; diagnostics/tests).
    pub fn row_sum(&self, i: usize) -> f64 {
        self.rows[i].iter().map(|x| x.1).sum::<f64>() + self.orows[i].iter().map(|x| x.1).sum::<f64>() + self.f_amb[i]
    }

    /// F_ij between two surface patches.
    pub fn f(&self, i: usize, j: usize) -> f64 {
        self.rows[i].iter().find(|x| x.0 as usize == j).map_or(0.0, |x| x.1)
    }
}

/// Group faces (cell, direction, facing direction, key) into patches.
fn group(geo: &Geo, faces: &[(usize, usize, usize, usize)], run: usize) -> Vec<Patch> {
    let g = geo.g;
    // (fd, d, plane index, key, block1, block2, t index) per face.
    let mut keyed: Vec<([usize; 7], usize)> = faces
        .iter()
        .enumerate()
        .map(|(n, &(c, d, fd, key))| {
            let (i, j, k) = g.ijk(c);
            let ijk = [i, j, k];
            let a = d / 2;
            let plane = ijk[a] + d % 2;
            let (t1, t2) = match a {
                0 => (1, 2),
                1 => (0, 2),
                _ => (0, 1),
            };
            let (b1, b2, ti) = if g.dim == 2 { (ijk[t1] / run, 0, ijk[t1]) } else { (ijk[t1] / run, ijk[t2] / run, 0) };
            ([fd, d, plane, key, b1, b2, ti], n)
        })
        .collect();
    keyed.sort();
    let mut out: Vec<Patch> = Vec::new();
    let mut s = 0;
    while s < keyed.len() {
        let mut e = s + 1;
        while e < keyed.len() && keyed[e].0[..6] == keyed[s].0[..6] && (g.dim == 3 || keyed[e].0[6] == keyed[e - 1].0[6] + 1) {
            e += 1;
        }
        let (c0, d0, fd, _) = faces[keyed[s].1];
        let mut p = Patch { fd, plane: geo.plane(c0, d0), faces: Vec::with_capacity(e - s), area: 0.0, t0: f64::INFINITY, t1: f64::NEG_INFINITY };
        for &(_, n) in &keyed[s..e] {
            let (c, d, _, _) = faces[n];
            p.faces.push((c, d));
            p.area += g.face_area(d);
            if g.dim == 2 {
                let (i, j, _) = g.ijk(c);
                let (idx, h) = if d / 2 == 0 { (j, g.dy) } else { (i, g.dx) };
                p.t0 = p.t0.min(idx as f64 * h);
                p.t1 = p.t1.max((idx + 1) as f64 * h);
            }
        }
        out.push(p);
        s = e;
    }
    out
}

#[cfg(feature = "parallel")]
fn par_map<T: Send>(n: usize, f: &(dyn Fn(usize) -> T + Sync)) -> Vec<T> {
    use rayon::prelude::*;
    (0..n).into_par_iter().map(f).collect()
}

#[cfg(not(feature = "parallel"))]
fn par_map<T>(n: usize, f: &dyn Fn(usize) -> T) -> Vec<T> {
    (0..n).map(f).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crossed_strings_known_values() {
        // Parallel plates of width 1 at distance 1: F = √2 − 1.
        let f = crossed_strings([0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]);
        assert!((f - (2f64.sqrt() - 1.0)).abs() < 1e-12);
        // Perpendicular plates sharing an edge: F = 1 − √2/2.
        let f = crossed_strings([0.0, 0.0], [1.0, 0.0], [1.0, 0.0], [1.0, 1.0]);
        assert!((f - (1.0 - 0.5 * 2f64.sqrt())).abs() < 1e-12);
    }
}
