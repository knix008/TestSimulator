//! Electric conduction and Joule heating.
//!
//! ∇·(σ∇V) = 0 over the cells whose material has σ > 0, finite volumes on the
//! thermal cell grid (harmonic face conductances, PCG + MIC(0)). Boundaries:
//! `voltage` (V), `ground` (V = 0) — Dirichlet at the face — and `currentIn`
//! (total current I spread over its faces by area). The Joule heat of every
//! face, G·ΔV², is split between the two adjacent cells, so the total heat
//! equals Σ I·V exactly. σ(T) = σ0 / (1 + αR (T − 20)).

use crate::conduction::Thermal;
use crate::linalg::{self, Csr, Ilu0, Tol};
use crate::mesh::{self, Across};
use crate::model::{BType, Layer};
use crate::{Ctx, Error};

struct EFace {
    a: u32,
    b: u32,
    area: f64,
    half: f64,
}

struct EBFace {
    e: u32,
    area: f64,
    dist: f64,
    bc: u32,
    axis: u8,
    plus: bool,
}

pub struct Electric {
    pub n: usize,
    /// thermal unknown → electric unknown (u32::MAX = not conducting)
    eidx: Vec<u32>,
    /// electric unknown → thermal unknown
    tu: Vec<u32>,
    faces: Vec<EFace>,
    face_axis: Vec<u8>,
    bfaces: Vec<EBFace>,
    pattern: Csr,
    face_pos: Vec<[usize; 4]>,
    /// Electric unknowns in components without a voltage reference.
    floating: Vec<bool>,
    /// Total face area of each currentIn boundary.
    cur_area: Vec<f64>,
    pub temperature_dependent: bool,
}

/// Electric solution.
pub struct ESol {
    /// Potential per thermal unknown (NaN where not conducting).
    pub v: Vec<f64>,
    /// Joule heat per thermal unknown (W).
    pub q: Vec<f64>,
    /// Current density magnitude per thermal unknown (A/m²).
    pub j: Vec<f64>,
    /// Current into the domain per model boundary (A) for electric boundaries.
    pub bc_current: Vec<Option<f64>>,
    pub power: f64,
    pub iterations: usize,
}

impl Electric {
    pub fn new(th: &Thermal, ctx: &mut Ctx) -> Result<Option<Electric>, Error> {
        let model = th.model;
        let mesh = th.mesh;
        let g = &mesh.grid;
        let mut eidx = vec![u32::MAX; th.n];
        let mut tu = Vec::new();
        for u in 0..th.n {
            if th.material(u).sigma > 0.0 {
                eidx[u] = tu.len() as u32;
                tu.push(u as u32);
            }
        }
        let n = tu.len();
        if n == 0 {
            ctx.warn("Electric study: no material has an electrical conductivity sigma > 0");
            return Ok(None);
        }
        let conducting = |c: usize| -> bool { th.unk[c] != u32::MAX && eidx[th.unk[c] as usize] != u32::MAX };
        let mut faces = Vec::new();
        let mut face_axis = Vec::new();
        let mut bfaces = Vec::new();
        let ndir = if g.dim == 3 { 6 } else { 4 };
        for e in 0..n {
            let u = tu[e] as usize;
            let c = th.cell_of[u] as usize;
            for d in 0..ndir {
                let area = g.face_area(d);
                let half = 0.5 * g.h(d);
                match g.neighbour(c, d) {
                    Some(nc) if conducting(nc) => {
                        if d % 2 == 0 {
                            continue;
                        }
                        let ne = eidx[th.unk[nc] as usize];
                        if mesh.mat[nc] != mesh.mat[c] {
                            let ra = mesh::resolve(model, mesh, Layer::Electric, c, d, Across::Other);
                            let rb = mesh::resolve(model, mesh, Layer::Electric, nc, d ^ 1, Across::Other);
                            let pick = match (ra, rb) {
                                (Some(a), Some(b)) => Some(if b > a { (b, false) } else { (a, true) }),
                                (Some(a), None) => Some((a, true)),
                                (None, Some(b)) => Some((b, false)),
                                _ => None,
                            };
                            if let Some((bc, side_a)) = pick {
                                let both = model.boundaries[bc].btype != BType::CurrentIn;
                                let (own, own_d, other, other_d) = if side_a { (e as u32, d, ne, d ^ 1) } else { (ne, d ^ 1, e as u32, d) };
                                bfaces.push(EBFace { e: own, area, dist: half, bc: bc as u32, axis: (d / 2) as u8, plus: own_d % 2 == 1 });
                                if both {
                                    bfaces.push(EBFace { e: other, area, dist: half, bc: bc as u32, axis: (d / 2) as u8, plus: other_d % 2 == 1 });
                                }
                                continue;
                            }
                        }
                        faces.push(EFace { a: e as u32, b: ne, area, half });
                        face_axis.push((d / 2) as u8);
                    }
                    other => {
                        let across = if other.is_none() { Across::Outside } else { Across::Void };
                        if let Some(bc) = mesh::resolve(model, mesh, Layer::Electric, c, d, across) {
                            bfaces.push(EBFace { e: e as u32, area, dist: half, bc: bc as u32, axis: (d / 2) as u8, plus: d % 2 == 1 });
                        }
                    }
                }
            }
        }
        let mut cur_area = vec![0.0; model.boundaries.len()];
        for bf in &bfaces {
            if model.boundaries[bf.bc as usize].btype == BType::CurrentIn {
                cur_area[bf.bc as usize] += bf.area;
            }
        }
        // Components and references.
        let mut parent: Vec<usize> = (0..n).collect();
        fn find(p: &mut Vec<usize>, x: usize) -> usize {
            let mut r = x;
            while p[r] != r {
                r = p[r];
            }
            let mut y = x;
            while p[y] != r {
                let nx = p[y];
                p[y] = r;
                y = nx;
            }
            r
        }
        for f in &faces {
            let (ra, rb) = (find(&mut parent, f.a as usize), find(&mut parent, f.b as usize));
            if ra != rb {
                parent[ra] = rb;
            }
        }
        let mut has_ref = vec![false; n];
        let mut has_cur = vec![false; n];
        for bf in &bfaces {
            let r = find(&mut parent, bf.e as usize);
            match model.boundaries[bf.bc as usize].btype {
                BType::Voltage | BType::Ground => has_ref[r] = true,
                BType::CurrentIn => has_cur[r] = true,
                _ => {}
            }
        }
        let mut floating = vec![false; n];
        for e in 0..n {
            let r = find(&mut parent, e);
            if !has_ref[r] {
                if has_cur[r] {
                    return Err(Error::Msg(
                        "Electric study: a conductor with a currentIn boundary has no voltage or ground boundary".into(),
                    ));
                }
                floating[e] = true;
            }
        }
        if floating.iter().all(|&f| f) {
            ctx.warn("Electric study: no voltage or ground boundary touches a conductor; no current flows");
        }
        let mut nb = vec![Vec::new(); n];
        for f in &faces {
            nb[f.a as usize].push(f.b);
            nb[f.b as usize].push(f.a);
        }
        let pattern = Csr::from_neighbours(n, &nb);
        let face_pos = faces
            .iter()
            .map(|f| {
                let (a, b) = (f.a as usize, f.b as usize);
                [pattern.diag[a], pattern.diag[b], pattern.pos(a, b), pattern.pos(b, a)]
            })
            .collect();
        let temperature_dependent = tu.iter().any(|&u| th.material(u as usize).alpha_r != 0.0);
        Ok(Some(Electric { n, eidx, tu, faces, face_axis, bfaces, pattern, face_pos, floating, cur_area, temperature_dependent }))
    }

    fn sigma(&self, th: &Thermal, e: usize, t: &[f64]) -> f64 {
        let u = self.tu[e] as usize;
        th.material(u).sigma_at(t[u]).max(1e-30)
    }

    /// Solve for the potential at temperatures `t` (per thermal unknown).
    pub fn solve(&self, th: &Thermal, t: &[f64], ctx: &mut Ctx) -> Result<ESol, Error> {
        let model = th.model;
        let n = self.n;
        let sig: Vec<f64> = (0..n).map(|e| self.sigma(th, e, t)).collect();
        let mut a = self.pattern.clone();
        let mut rhs = vec![0.0; n];
        let mut gf = Vec::with_capacity(self.faces.len());
        for (fi, f) in self.faces.iter().enumerate() {
            let g = f.area / (f.half / sig[f.a as usize] + f.half / sig[f.b as usize]);
            gf.push(g);
            let p = self.face_pos[fi];
            a.val[p[0]] += g;
            a.val[p[1]] += g;
            a.val[p[2]] -= g;
            a.val[p[3]] -= g;
        }
        let mut gb = Vec::with_capacity(self.bfaces.len());
        for bf in &self.bfaces {
            let b = &model.boundaries[bf.bc as usize];
            let e = bf.e as usize;
            match b.btype {
                BType::Voltage | BType::Ground => {
                    let vb = if b.btype == BType::Voltage { b.voltage } else { 0.0 };
                    let g = sig[e] * bf.area / bf.dist;
                    a.val[a.diag[e]] += g;
                    rhs[e] += g * vb;
                    gb.push(g);
                }
                BType::CurrentIn => {
                    let ar = self.cur_area[bf.bc as usize].max(1e-300);
                    rhs[e] += b.current * bf.area / ar;
                    gb.push(0.0);
                }
                _ => gb.push(0.0),
            }
        }
        // Floating conductors: a tiny leak to 0 V keeps the system regular.
        let dmean = (0..n).map(|e| a.val[a.diag[e]]).sum::<f64>() / n as f64;
        for e in 0..n {
            if self.floating[e] {
                a.val[a.diag[e]] += 1e-9 * dmean.max(1e-300);
            }
        }
        let pre = Ilu0::modified(&a, 0.95);
        let mut x = vec![0.0; n];
        let tol = Tol { rel: 1e-10, abs: 0.0, max_iter: model.study.max_iter.max(1000) };
        let st = {
            let mut mon = |it: usize, res: f64| ctx.tick(&|| format!("electric iteration {it}, residual {res:.2e}"));
            linalg::pcg(&a, &rhs, &mut x, &pre, tol, &mut mon)?
        };
        if !st.converged {
            ctx.warn(format!("Electric solver stopped at relative residual {:.2e}", st.residual));
        }
        // Joule heat, boundary currents, current density.
        let g = &th.mesh.grid;
        let mut q = vec![0.0; th.n];
        let mut jax = vec![[0.0f64; 3]; n];
        let mut power = 0.0;
        for (fi, f) in self.faces.iter().enumerate() {
            let (ea, eb) = (f.a as usize, f.b as usize);
            let dv = x[ea] - x[eb];
            let pw = gf[fi] * dv * dv;
            power += pw;
            q[self.tu[ea] as usize] += 0.5 * pw;
            q[self.tu[eb] as usize] += 0.5 * pw;
            let jd = gf[fi] * dv / f.area; // + along the axis (a → b)
            let ax = self.face_axis[fi] as usize;
            jax[ea][ax] += 0.5 * jd;
            jax[eb][ax] += 0.5 * jd;
        }
        let mut bc_current = vec![None; model.boundaries.len()];
        for (k, bf) in self.bfaces.iter().enumerate() {
            let b = &model.boundaries[bf.bc as usize];
            let e = bf.e as usize;
            let i_in = match b.btype {
                BType::Voltage | BType::Ground => {
                    let vb = if b.btype == BType::Voltage { b.voltage } else { 0.0 };
                    let i = gb[k] * (vb - x[e]);
                    let pw = gb[k] * (vb - x[e]).powi(2);
                    power += pw;
                    q[self.tu[e] as usize] += pw;
                    i
                }
                BType::CurrentIn => b.current * bf.area / self.cur_area[bf.bc as usize].max(1e-300),
                _ => 0.0,
            };
            *bc_current[bf.bc as usize].get_or_insert(0.0) += i_in;
            // current density component (+ axis direction): inflow through a + face points −axis
            let jd = i_in / bf.area;
            jax[e][bf.axis as usize] += 0.5 * if bf.plus { -jd } else { jd };
        }
        for (bi, b) in model.boundaries.iter().enumerate() {
            if b.btype.in_layer(Layer::Electric) && bc_current[bi].is_none() {
                bc_current[bi] = Some(0.0);
            }
        }
        let mut v = vec![f64::NAN; th.n];
        let mut j = vec![0.0; th.n];
        for e in 0..n {
            let u = self.tu[e] as usize;
            v[u] = x[e];
            j[u] = (jax[e][0].powi(2) + jax[e][1].powi(2) + if g.dim == 3 { jax[e][2].powi(2) } else { 0.0 }).sqrt();
        }
        let _ = &self.eidx;
        Ok(ESol { v, q, j, bc_current, power, iterations: st.iterations })
    }
}
