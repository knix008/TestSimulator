//! Incompressible flow with heat transfer on a uniform Cartesian (MAC) grid around or inside the
//! bodies: projection method (semi-Lagrangian advection, explicit diffusion, pressure Poisson by
//! PCG), laminar or eddy-viscosity (Smagorinsky) turbulence, Boussinesq buoyancy, conjugate heat
//! transfer through the solid bodies, steady (pseudo-time) or transient. Results on the grid,
//! forces and coefficients on the bodies, flow rates, streamlines, surface pressure.

use crate::geom::{self, Solid, V3};
use crate::model::{enabled, kind, num, vec3, Model};
use crate::out::Out;
use crate::sparse::{pcg, Csr};
use crate::Ctx;
use serde_json::{json, Value};

const OPEN: u8 = 0;
const FIXED: u8 = 1;
const OUT: u8 = 2;

struct Grid {
    n: [usize; 3],
    lo: V3,
    h: f64,
    /// Cell owner: 0 fluid, b + 1 for body b, u32::MAX outside the fluid (internal flow).
    cell: Vec<u32>,
}

impl Grid {
    fn c(&self, i: usize, j: usize, k: usize) -> usize { (k * self.n[1] + j) * self.n[0] + i }
    fn fluid(&self, i: isize, j: isize, k: isize) -> Option<bool> {
        if i < 0 || j < 0 || k < 0 || i as usize >= self.n[0] || j as usize >= self.n[1] || k as usize >= self.n[2] { return None; }
        Some(self.cell[self.c(i as usize, j as usize, k as usize)] == 0)
    }
    /// Index of a face of direction d at (i, j, k) (i along d runs to n[d]).
    fn fdims(&self, d: usize) -> [usize; 3] { let mut m = self.n; m[d] += 1; m }
    fn f(&self, d: usize, i: usize, j: usize, k: usize) -> usize { let m = self.fdims(d); (k * m[1] + j) * m[0] + i }
    fn centre(&self, i: usize, j: usize, k: usize) -> V3 { [self.lo[0] + (i as f64 + 0.5) * self.h, self.lo[1] + (j as f64 + 0.5) * self.h, self.lo[2] + (k as f64 + 0.5) * self.h] }
    fn face_pos(&self, d: usize, i: usize, j: usize, k: usize) -> V3 {
        let mut p = [self.lo[0] + (i as f64 + 0.5) * self.h, self.lo[1] + (j as f64 + 0.5) * self.h, self.lo[2] + (k as f64 + 0.5) * self.h];
        p[d] -= 0.5 * self.h;
        p
    }
}

/// Domain side boundary condition.
#[derive(Clone)]
struct Side { kind: String, vel: V3, temp: f64 }

/// Trilinear sample of a staggered component at a point (grid units handled inside).
fn sample_face(g: &Grid, d: usize, f: &[f64], p: V3) -> f64 {
    let m = g.fdims(d);
    // Face d positions: along d at lo + i h; across at lo + (j + ½) h.
    let mut idx = [0.0; 3];
    for a in 0..3 {
        let off = if a == d { 0.0 } else { 0.5 };
        idx[a] = ((p[a] - g.lo[a]) / g.h - off).clamp(0.0, (m[a] - 1) as f64);
    }
    let i0 = [idx[0].floor() as usize, idx[1].floor() as usize, idx[2].floor() as usize];
    let i1 = [(i0[0] + 1).min(m[0] - 1), (i0[1] + 1).min(m[1] - 1), (i0[2] + 1).min(m[2] - 1)];
    let t = [idx[0] - i0[0] as f64, idx[1] - i0[1] as f64, idx[2] - i0[2] as f64];
    let at = |i: usize, j: usize, k: usize| f[(k * m[1] + j) * m[0] + i];
    let mut v = 0.0;
    for (ci, wi) in [(i0[0], 1.0 - t[0]), (i1[0], t[0])] { for (cj, wj) in [(i0[1], 1.0 - t[1]), (i1[1], t[1])] { for (ck, wk) in [(i0[2], 1.0 - t[2]), (i1[2], t[2])] {
        v += wi * wj * wk * at(ci, cj, ck);
    } } }
    v
}

fn sample_cell(g: &Grid, f: &[f64], p: V3, mask_fluid: bool) -> f64 {
    let mut idx = [0.0; 3];
    for a in 0..3 { idx[a] = ((p[a] - g.lo[a]) / g.h - 0.5).clamp(0.0, (g.n[a] - 1) as f64); }
    let i0 = [idx[0].floor() as usize, idx[1].floor() as usize, idx[2].floor() as usize];
    let i1 = [(i0[0] + 1).min(g.n[0] - 1), (i0[1] + 1).min(g.n[1] - 1), (i0[2] + 1).min(g.n[2] - 1)];
    let t = [idx[0] - i0[0] as f64, idx[1] - i0[1] as f64, idx[2] - i0[2] as f64];
    let (mut v, mut wsum) = (0.0, 0.0);
    for (ci, wi) in [(i0[0], 1.0 - t[0]), (i1[0], t[0])] { for (cj, wj) in [(i0[1], 1.0 - t[1]), (i1[1], t[1])] { for (ck, wk) in [(i0[2], 1.0 - t[2]), (i1[2], t[2])] {
        let c = g.c(ci, cj, ck);
        if mask_fluid && g.cell[c] != 0 { continue; }
        let w = wi * wj * wk;
        v += w * f[c];
        wsum += w;
    } } }
    if wsum > 1e-12 { v / wsum } else { f[g.c(i0[0], i0[1], i0[2])] }
}

pub fn run_fluid(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let unit = model.unit();
    let s = &model.job.settings;
    let internal = s.get("flowType").and_then(|v| v.as_str()) == Some("internal");
    let solids: Vec<Solid> = model.bodies.iter().map(|b| Solid::new(&b.shape)).collect::<Result<_, _>>()?;
    let fluid_mat = crate::model::material_of(&model.job, s.get("fluid").and_then(|v| v.as_str()).unwrap_or("air"));
    let rho = if fluid_mat.density > 0.0 { fluid_mat.density } else { 1.225 };
    let mu = if fluid_mat.viscosity > 0.0 { fluid_mat.viscosity } else { 1.81e-5 };
    let nu = mu / rho;
    let cp = if fluid_mat.specific_heat > 0.0 { fluid_mat.specific_heat } else { 1006.0 };
    let kf = if fluid_mat.conductivity > 0.0 { fluid_mat.conductivity } else { 0.0262 };
    let beta = if fluid_mat.expansion > 0.0 { fluid_mat.expansion } else { 3.4e-3 };
    let thermal = model.setting_b("thermal", false);
    let buoyancy = thermal && model.setting_b("buoyancy", true);
    let turbulent = model.setting_s("turbulence", "laminar") == "turbulent";
    let steady = model.setting_b("steady", true);
    // The fluid body for internal flow: the one named, or the first with a fluid material.
    let fluid_body = if internal {
        let named = s.get("fluidBody").and_then(|v| v.as_str()).and_then(|id| model.body_index(id));
        Some(named.unwrap_or_else(|| model.mats.iter().position(|m| m.viscosity > 0.0).unwrap_or(0) as u32) as usize)
    } else { None };
    // Domain (model units).
    let mut lo = [f64::INFINITY; 3];
    let mut hi = [f64::NEG_INFINITY; 3];
    for (bi, sd) in solids.iter().enumerate() {
        if let Some(fb) = fluid_body { if bi != fb { continue; } }
        for k in 0..3 { lo[k] = lo[k].min(sd.bbox.0[k]); hi[k] = hi[k].max(sd.bbox.1[k]); }
    }
    let size = (0..3).map(|k| hi[k] - lo[k]).fold(0.0, f64::max);
    if !internal {
        let p = model.job.enclosure.padding;
        let dflt = [size, 2.0 * size, 0.75 * size, 0.75 * size, 0.75 * size, 0.75 * size];
        for k in 0..3 { lo[k] -= if p[2 * k] > 0.0 { p[2 * k] } else { dflt[2 * k] }; hi[k] += if p[2 * k + 1] > 0.0 { p[2 * k + 1] } else { dflt[2 * k + 1] }; }
    }
    let max_cells = model.setting_u("maxCells", 60_000) as f64;
    let mut h = s.get("cellSize").and_then(|v| v.as_f64()).unwrap_or(size / 12.0).max(1e-9);
    if internal { for k in 0..3 { lo[k] -= 0.5 * h; hi[k] += 0.5 * h; } }
    while (0..3).map(|k| ((hi[k] - lo[k]) / h).ceil()).product::<f64>() > max_cells { h *= 1.08; }
    let n = [((hi[0] - lo[0]) / h).ceil() as usize, ((hi[1] - lo[1]) / h).ceil() as usize, ((hi[2] - lo[2]) / h).ceil() as usize];
    let ncell = n[0] * n[1] * n[2];
    let mut g = Grid { n, lo, h, cell: vec![0; ncell] };
    for k in 0..n[2] { for j in 0..n[1] { for i in 0..n[0] {
        let p = g.centre(i, j, k);
        let c = g.c(i, j, k);
        if let Some(fb) = fluid_body {
            g.cell[c] = if solids[fb].inside(p) { 0 } else { u32::MAX };
            for (bi, sd) in solids.iter().enumerate() { if bi != fb && sd.inside(p) { g.cell[c] = bi as u32 + 1; } }
        } else {
            for (bi, sd) in solids.iter().enumerate() { if sd.inside(p) { g.cell[c] = bi as u32 + 1; break; } }
        }
    } } }
    if !g.cell.iter().any(|c| *c == 0) { return Err("fluid.noFluidCells".into()); }
    ctx.step(0.05, "progress.fluidGrid")?;
    // Domain sides: −x, +x, −y, +y, −z, +z.
    let names = ["xmin", "xmax", "ymin", "ymax", "zmin", "zmax"];
    let inlet_v = vec3(s, "inletVelocity").unwrap_or([5.0, 0.0, 0.0]);
    let t_in = model.setting_f("inletTemperature", 22.0);
    let mut sides: Vec<Side> = (0..6).map(|q| {
        let dflt = if internal { "wall" } else if q == 0 { "inlet" } else if q == 1 { "outlet" } else { "slip" };
        Side { kind: dflt.into(), vel: if q == 0 { inlet_v } else { [0.0; 3] }, temp: t_in }
    }).collect();
    if let Some(b) = s.get("boundaries").and_then(|v| v.as_object()) {
        for (q, name) in names.iter().enumerate() {
            if let Some(v) = b.get(*name) {
                sides[q].kind = v.get("type").and_then(|x| x.as_str()).unwrap_or(&sides[q].kind).to_string();
                if let Some(vel) = vec3(v, "velocity") { sides[q].vel = vel; }
                sides[q].temp = num(v, "temperature", t_in);
            }
        }
    }
    // Internal inlets / outlets on picked faces of the fluid body: cell faces next to them.
    let mut patch_inlet: Vec<(Vec<[V3; 3]>, f64, Option<V3>, f64)> = Vec::new(); // tris, speed, vector, temperature
    let mut patch_outlet: Vec<Vec<[V3; 3]>> = Vec::new();
    for bc in &model.job.bcs {
        if !enabled(bc) || !matches!(kind(bc), "inlet" | "outlet" | "opening") { continue; }
        let faces = model.faces_of(bc);
        let tris: Vec<[V3; 3]> = faces.iter().flat_map(|&f| model.mesh.faces[f].tris.iter().map(|&t| { let tt = model.mesh.tris[t as usize]; [model.mesh.nodes[tt[0] as usize], model.mesh.nodes[tt[1] as usize], model.mesh.nodes[tt[2] as usize]] })).collect();
        if kind(bc) == "inlet" { patch_inlet.push((tris, num(bc, "speed", 1.0), vec3(bc, "vector"), num(bc, "temperature", t_in))); } else { patch_outlet.push(tris); }
    }
    let near = |tris: &[[V3; 3]], p: V3| tris.iter().any(|t| point_tri(p, t) < 0.9 * h);
    // Face kinds and fixed values per direction.
    let mut fk: Vec<Vec<u8>> = Vec::with_capacity(3);
    let mut fv: Vec<Vec<f64>> = Vec::with_capacity(3);
    let mut face_temp: Vec<Vec<f64>> = Vec::with_capacity(3);
    for d in 0..3 {
        let m = g.fdims(d);
        let mut kk = vec![FIXED; m[0] * m[1] * m[2]];
        let mut vv = vec![0.0; m[0] * m[1] * m[2]];
        let mut tt = vec![f64::NAN; m[0] * m[1] * m[2]];
        for k in 0..m[2] { for j in 0..m[1] { for i in 0..m[0] {
            let id = g.f(d, i, j, k);
            let mut a = [i as isize, j as isize, k as isize];
            let b = a;
            a[d] -= 1;
            let fa = g.fluid(a[0], a[1], a[2]);
            let fb = g.fluid(b[0], b[1], b[2]);
            match (fa, fb) {
                (Some(true), Some(true)) => kk[id] = OPEN,
                (None, Some(true)) | (Some(true), None) => {
                    let q = 2 * d + if fa.is_none() { 0 } else { 1 };
                    let side = &sides[q];
                    match side.kind.as_str() {
                        "inlet" => { kk[id] = FIXED; vv[id] = side.vel[d]; tt[id] = side.temp; }
                        "outlet" | "opening" => kk[id] = OUT,
                        _ => kk[id] = FIXED,
                    }
                }
                (Some(x), Some(y)) if x != y => {
                    // Fluid next to a solid (or outside): a wall unless a picked inlet / outlet lies here.
                    let p = geom::scale(g.face_pos(d, i, j, k), 1.0);
                    for (tris, speed, vector, temp) in &patch_inlet {
                        if near(tris, p) {
                            let into = if x { -1.0 } else { 1.0 };
                            vv[id] = match vector { Some(v) => v[d], None => into * speed };
                            tt[id] = *temp;
                        }
                    }
                    for tris in &patch_outlet { if near(tris, p) { kk[id] = OUT; } }
                }
                _ => {}
            }
        } } }
        fk.push(kk);
        fv.push(vv);
        face_temp.push(tt);
    }
    if !fk.iter().any(|k| k.iter().any(|x| *x == OUT)) && !patch_outlet.is_empty() {
        return Err("fluid.outletNotFound".into());
    }
    let mut vel: Vec<Vec<f64>> = (0..3).map(|d| {
        // Start from the inlet velocity (external) or rest.
        (0..fk[d].len()).map(|id| if fk[d][id] == FIXED { fv[d][id] } else if !internal { inlet_v[d] } else { 0.0 }).collect()
    }).collect();
    ctx.step(0.08, "progress.fluidGrid")?;
    // Pressure Poisson matrix on fluid cells (−∇²φ, Dirichlet at outlets).
    let fluid_ids: Vec<usize> = (0..ncell).filter(|&c| g.cell[c] == 0).collect();
    let mut pidx = vec![u32::MAX; ncell];
    for (q, &c) in fluid_ids.iter().enumerate() { pidx[c] = q as u32; }
    let np = fluid_ids.len();
    let cell_ijk = |c: usize| (c % n[0], (c / n[0]) % n[1], c / (n[0] * n[1]));
    let mut rows: Vec<Vec<u32>> = Vec::with_capacity(np);
    let mut has_dirichlet = false;
    for &c in &fluid_ids {
        let (i, j, k) = cell_ijk(c);
        let mut r = vec![pidx[c]];
        for d in 0..3 {
            for (side, step) in [(0usize, -1isize), (1, 1)] {
                let mut q = [i as isize, j as isize, k as isize];
                q[d] += step;
                let mut fi = [i, j, k];
                if side == 1 { fi[d] += 1; }
                let kind_ = fk[d][g.f(d, fi[0], fi[1], fi[2])];
                if kind_ == OPEN { let nb = g.c(q[0] as usize, q[1] as usize, q[2] as usize); r.push(pidx[nb]); }
                if kind_ == OUT { has_dirichlet = true; }
            }
        }
        r.sort_unstable();
        rows.push(r);
    }
    let mut pm = Csr::from_rows(rows);
    for (q, &c) in fluid_ids.iter().enumerate() {
        let (i, j, k) = cell_ijk(c);
        for d in 0..3 {
            for (side, step) in [(0usize, -1isize), (1, 1)] {
                let mut nb = [i as isize, j as isize, k as isize];
                nb[d] += step;
                let mut fi = [i, j, k];
                if side == 1 { fi[d] += 1; }
                match fk[d][g.f(d, fi[0], fi[1], fi[2])] {
                    OPEN => { pm.add(q, q, 1.0); pm.add(q, pidx[g.c(nb[0] as usize, nb[1] as usize, nb[2] as usize)] as usize, -1.0); }
                    OUT => pm.add(q, q, 2.0),
                    _ => {}
                }
            }
        }
    }
    if !has_dirichlet { pm.add(0, 0, 1.0); }
    let pcoords: Vec<[f64; 3]> = fluid_ids.iter().map(|&c| { let (i, j, k) = cell_ijk(c); g.centre(i, j, k) }).collect();
    let ppre = crate::sparse::precond(&pm, &pcoords, 1);
    // Time step.
    let u_ref = {
        let mut u: f64 = 0.0;
        for d in 0..3 { for id in 0..fk[d].len() { if fk[d][id] == FIXED { u = u.max(fv[d][id].abs()); } } }
        let gmag = geom::norm(vec3(s, "gravity").unwrap_or([0.0, 0.0, -9.80665]));
        if buoyancy { u = u.max((gmag * beta * 30.0 * size * unit).sqrt() * 0.3); }
        u.max(1e-3)
    };
    let hm = h * unit;
    let cfl = model.setting_f("cfl", 1.5);
    let mut dt = cfl * hm / u_ref;
    if !steady { dt = dt.min(model.setting_f("endTime", 1.0) / 20.0); }
    dt = dt.min(0.15 * hm * hm / nu);
    let max_steps = if steady { model.setting_u("maxSteps", 1500) } else { ((model.setting_f("endTime", 1.0) / dt).ceil() as usize).max(1) };
    if max_steps > 200_000 { return Err("fluid.tooManySteps".into()); }
    let gvec = vec3(s, "gravity").unwrap_or([0.0, 0.0, -9.80665]);
    // Temperature system: all cells (fluid with ρc/dt, solids by conduction, heat sources).
    let t0 = model.setting_f("initialTemperature", t_in);
    let mut temp = vec![t0; ncell];
    let mut tsys: Option<(Csr, Box<dyn crate::sparse::Precond>, Vec<f64>, Vec<bool>, Vec<f64>)> = None;
    if thermal {
        let kcell: Vec<f64> = (0..ncell).map(|c| match g.cell[c] { 0 => kf, u32::MAX => 0.0, b => model.mats[(b - 1) as usize].conductivity.max(1e-6) }).collect();
        let rc: Vec<f64> = (0..ncell).map(|c| match g.cell[c] { 0 => rho * cp, u32::MAX => 0.0, b => { let m = &model.mats[(b - 1) as usize]; if steady { 0.0 } else { m.density * m.specific_heat } } }).collect();
        let mut src = vec![0.0; ncell];
        let mut tfix = vec![false; ncell];
        let mut tval = vec![0.0; ncell];
        for c in 0..ncell { if g.cell[c] == u32::MAX { tfix[c] = true; tval[c] = t0; } }
        for bc in &model.job.bcs {
            if !enabled(bc) { continue; }
            let bodies = model.bodies_of(bc);
            match kind(bc) {
                "heatPower" | "heatGeneration" => {
                    for &b in &bodies {
                        let cells: Vec<usize> = (0..ncell).filter(|&c| g.cell[c] == b + 1).collect();
                        let vol = cells.len() as f64 * hm.powi(3);
                        let q = if kind(bc) == "heatPower" { num(bc, "value", 0.0) / vol.max(1e-300) } else { num(bc, "value", 0.0) };
                        for c in cells { src[c] += q; }
                    }
                }
                "bodyTemperature" => for &b in &bodies { for c in 0..ncell { if g.cell[c] == b + 1 { tfix[c] = true; tval[c] = num(bc, "value", 22.0); } } },
                _ => {}
            }
        }
        // Rows: neighbours with a conductance (harmonic mean), Dirichlet at inlet faces (ghost).
        let mut rows: Vec<Vec<u32>> = Vec::with_capacity(ncell);
        for c in 0..ncell {
            let (i, j, k) = cell_ijk(c);
            let mut r = vec![c as u32];
            for d in 0..3 { for step in [-1isize, 1] {
                let mut q = [i as isize, j as isize, k as isize];
                q[d] += step;
                if q[d] >= 0 && (q[d] as usize) < n[d] { r.push(g.c(q[0] as usize, q[1] as usize, q[2] as usize) as u32); }
            } }
            r.sort_unstable();
            rows.push(r);
        }
        let mut a = Csr::from_rows(rows);
        let mut bnd = vec![0.0; ncell];
        for c in 0..ncell {
            let (i, j, k) = cell_ijk(c);
            a.add(c, c, rc[c] / dt * hm * hm);
            for d in 0..3 { for (side, step) in [(0usize, -1isize), (1, 1)] {
                let mut q = [i as isize, j as isize, k as isize];
                q[d] += step;
                if q[d] >= 0 && (q[d] as usize) < n[d] {
                    let nb = g.c(q[0] as usize, q[1] as usize, q[2] as usize);
                    let (k1, k2) = (kcell[c], kcell[nb]);
                    let kk = if k1 + k2 > 0.0 { 2.0 * k1 * k2 / (k1 + k2) } else { 0.0 };
                    a.add(c, c, kk);
                    a.add(c, nb, -kk);
                } else {
                    let mut fi = [i, j, k];
                    if side == 1 { fi[d] += 1; }
                    let ft = face_temp[d][g.f(d, fi[0], fi[1], fi[2])];
                    if g.cell[c] == 0 && ft.is_finite() { a.add(c, c, 2.0 * kcell[c]); bnd[c] += 2.0 * kcell[c] * ft; }
                }
            } }
            src[c] = src[c] * hm * hm + bnd[c];
        }
        let mut ac = a.clone();
        let mut dummy = vec![0.0; ncell];
        ac.constrain(&tfix, &tval, &mut dummy);
        let coords: Vec<[f64; 3]> = (0..ncell).map(|c| { let (i, j, k) = cell_ijk(c); g.centre(i, j, k) }).collect();
        let pre = crate::sparse::precond(&ac, &coords, 1);
        for c in 0..ncell { if tfix[c] { temp[c] = tval[c]; } }
        tsys = Some((a, pre, src, tfix, tval));
        let _ = rc;
    }
    let t_ref = t_in;
    let mut phi = vec![0.0; np];
    let mut history = Vec::new();
    let mut quiet = 0;
    let mut steps_done = 0;
    for step in 0..max_steps {
        steps_done = step + 1;
        let old = vel.clone();
        // Eddy viscosity per cell.
        let nu_cell: Vec<f64> = if turbulent {
            let cs = 0.17 * hm;
            (0..ncell).map(|c| {
                if g.cell[c] != 0 { return nu; }
                let (i, j, k) = cell_ijk(c);
                let mut grad = [[0.0; 3]; 3];
                for d in 0..3 {
                    // ∂u_d/∂x_d from the faces; cross derivatives from neighbour cell centres.
                    grad[d][d] = (old[d][g.f(d, i + (d == 0) as usize, j + (d == 1) as usize, k + (d == 2) as usize)] - old[d][g.f(d, i, j, k)]) / hm;
                }
                let s2 = 2.0 * (grad[0][0].powi(2) + grad[1][1].powi(2) + grad[2][2].powi(2));
                (nu + cs * cs * s2.sqrt()).min(0.15 * hm * hm / dt)
            }).collect()
        } else { vec![nu; ncell] };
        // Advection (semi-Lagrangian), diffusion (explicit), buoyancy.
        for d in 0..3 {
            let m = g.fdims(d);
            let mut next = old[d].clone();
            for k in 0..m[2] { for j in 0..m[1] { for i in 0..m[0] {
                let id = g.f(d, i, j, k);
                if fk[d][id] != OPEN { continue; }
                let p = g.face_pos(d, i, j, k);
                let vp = [sample_face(&g, 0, &old[0], p), sample_face(&g, 1, &old[1], p), sample_face(&g, 2, &old[2], p)];
                // Back-trace (midpoint).
                let pm1 = [p[0] - 0.5 * dt * vp[0] / unit, p[1] - 0.5 * dt * vp[1] / unit, p[2] - 0.5 * dt * vp[2] / unit];
                let vm = [sample_face(&g, 0, &old[0], pm1), sample_face(&g, 1, &old[1], pm1), sample_face(&g, 2, &old[2], pm1)];
                let back = [p[0] - dt * vm[0] / unit, p[1] - dt * vm[1] / unit, p[2] - dt * vm[2] / unit];
                let adv = sample_face(&g, d, &old[d], back);
                // Diffusion with the neighbours along each axis.
                let mut lap = 0.0;
                for a in 0..3 { for step2 in [-1isize, 1] {
                    let mut q = [i as isize, j as isize, k as isize];
                    q[a] += step2;
                    let v = if q[a] < 0 || q[a] as usize >= m[a] { old[d][id] } else {
                        let qid = g.f(d, q[0] as usize, q[1] as usize, q[2] as usize);
                        if fk[d][qid] == OUT { old[d][id] } else { old[d][qid] }
                    };
                    lap += v - old[d][id];
                } }
                let mut c1 = [i, j, k];
                if c1[d] > 0 { c1[d] -= 1; }
                let nuf = 0.5 * (nu_cell[g.c(c1[0], c1[1], c1[2])] + nu_cell[g.c(i.min(n[0] - 1), j.min(n[1] - 1), k.min(n[2] - 1))]);
                let mut val = adv + dt * nuf * lap / (hm * hm);
                if buoyancy {
                    let tf = 0.5 * (temp[g.c(c1[0], c1[1], c1[2])] + temp[g.c(i.min(n[0] - 1), j.min(n[1] - 1), k.min(n[2] - 1))]);
                    val -= dt * gvec[d] * beta * (tf - t_ref);
                }
                next[id] = val;
            } } }
            // Outlet faces: zero gradient from the inside face.
            for k in 0..m[2] { for j in 0..m[1] { for i in 0..m[0] {
                let id = g.f(d, i, j, k);
                if fk[d][id] != OUT { continue; }
                let mut q = [i as isize, j as isize, k as isize];
                q[d] += if i == 0 && d == 0 || j == 0 && d == 1 || k == 0 && d == 2 { 1 } else { -1 };
                if q[d] >= 0 && (q[d] as usize) < m[d] { next[id] = next[g.f(d, q[0] as usize, q[1] as usize, q[2] as usize)]; }
            } } }
            vel[d] = next;
        }
        // Projection: −∇²φ = −div u* h² (φ in m²/s · s … scaled), then u −= ∇φ.
        let mut rhs = vec![0.0; np];
        let mut div_max: f64 = 0.0;
        for (q, &c) in fluid_ids.iter().enumerate() {
            let (i, j, k) = cell_ijk(c);
            let div = (vel[0][g.f(0, i + 1, j, k)] - vel[0][g.f(0, i, j, k)]) + (vel[1][g.f(1, i, j + 1, k)] - vel[1][g.f(1, i, j, k)]) + (vel[2][g.f(2, i, j, k + 1)] - vel[2][g.f(2, i, j, k)]);
            rhs[q] = -div * hm;
            div_max = div_max.max(div.abs());
        }
        if !has_dirichlet { rhs[0] = 0.0; }
        let info = pcg(&pm, &rhs, &mut phi, ppre.as_ref(), 1e-6, 4000, None)?;
        let _ = info;
        for d in 0..3 {
            let m = g.fdims(d);
            for k in 0..m[2] { for j in 0..m[1] { for i in 0..m[0] {
                let id = g.f(d, i, j, k);
                if fk[d][id] == FIXED { continue; }
                let mut a = [i as isize, j as isize, k as isize];
                let b = a;
                a[d] -= 1;
                let pa = if g.fluid(a[0], a[1], a[2]) == Some(true) { phi[pidx[g.c(a[0] as usize, a[1] as usize, a[2] as usize)] as usize] } else { 0.0 };
                let pb = if g.fluid(b[0], b[1], b[2]) == Some(true) { phi[pidx[g.c(b[0] as usize, b[1] as usize, b[2] as usize)] as usize] } else { 0.0 };
                // Outlet faces: φ = 0 at the face (ghost = −inside).
                let grad = if fk[d][id] == OUT {
                    if g.fluid(a[0], a[1], a[2]) == Some(true) { (0.0 - pa) * 2.0 } else { (pb - 0.0) * 2.0 }
                } else { pb - pa };
                vel[d][id] -= grad / hm;
            } } }
        }
        // Temperature.
        if let Some((a, pre, src, tfix, tval)) = tsys.as_ref() {
            let mut b = vec![0.0; ncell];
            for c in 0..ncell {
                let (i, j, k) = cell_ijk(c);
                let tadv = if g.cell[c] == 0 {
                    let p = g.centre(i, j, k);
                    let vp = [sample_face(&g, 0, &vel[0], p), sample_face(&g, 1, &vel[1], p), sample_face(&g, 2, &vel[2], p)];
                    let back = [p[0] - dt * vp[0] / unit, p[1] - dt * vp[1] / unit, p[2] - dt * vp[2] / unit];
                    sample_cell(&g, &temp, back, false)
                } else { temp[c] };
                let rc = if g.cell[c] == 0 { rho * cp } else if g.cell[c] == u32::MAX || steady { 0.0 } else { let m = &model.mats[(g.cell[c] - 1) as usize]; m.density * m.specific_heat };
                b[c] = rc / dt * hm * hm * tadv + src[c];
            }
            let mut am = a.clone();
            am.constrain(tfix, tval, &mut b);
            let mut tn = temp.clone();
            pcg(&am, &b, &mut tn, pre.as_ref(), 1e-8, 4000, None)?;
            temp = tn;
        }
        // Convergence: the largest velocity change per step relative to the reference speed.
        let mut change: f64 = 0.0;
        for d in 0..3 { for id in 0..vel[d].len() { change = change.max((vel[d][id] - old[d][id]).abs()); } }
        let res = change / u_ref;
        if step % 10 == 0 || step + 1 == max_steps { history.push(json!({ "step": step + 1, "time": (step + 1) as f64 * dt, "residual": res, "divergence": div_max })); }
        if step % 5 == 0 { ctx.step(0.1 + 0.78 * (step + 1) as f64 / max_steps as f64, "progress.fluid")?; }
        if vel.iter().any(|v| v.iter().any(|x| !x.is_finite())) { return Err("fluid.diverged".into()); }
        if steady { if res < model.setting_f("residualTarget", 1e-4) { quiet += 1; if quiet > 20 { break; } } else { quiet = 0; } }
    }
    // Cell-centred results.
    let mut ux = vec![0.0; ncell];
    let mut uy = vec![0.0; ncell];
    let mut uz = vec![0.0; ncell];
    let mut pr = vec![0.0; ncell];
    for k in 0..n[2] { for j in 0..n[1] { for i in 0..n[0] {
        let c = g.c(i, j, k);
        if g.cell[c] != 0 { continue; }
        ux[c] = 0.5 * (vel[0][g.f(0, i, j, k)] + vel[0][g.f(0, i + 1, j, k)]);
        uy[c] = 0.5 * (vel[1][g.f(1, i, j, k)] + vel[1][g.f(1, i, j + 1, k)]);
        uz[c] = 0.5 * (vel[2][g.f(2, i, j, k)] + vel[2][g.f(2, i, j, k + 1)]);
        // φ = Δt p / ρ (per unit h scaling above: φ_solver = φ / h).
        pr[c] = phi[pidx[c] as usize] * hm * rho / dt / hm;
    } } }
    // Pressure relative to the outlet level; the pressure field is the projection's φ·ρ/Δt.
    let speed: Vec<f64> = (0..ncell).map(|c| (ux[c] * ux[c] + uy[c] * uy[c] + uz[c] * uz[c]).sqrt()).collect();
    let vort: Vec<f64> = (0..ncell).map(|c| {
        if g.cell[c] != 0 { return 0.0; }
        let (i, j, k) = cell_ijk(c);
        let d = |f: &[f64], a: usize| -> f64 {
            let mut p = [i as isize, j as isize, k as isize];
            let mut q = p;
            p[a] -= 1;
            q[a] += 1;
            let get = |x: [isize; 3]| if g.fluid(x[0], x[1], x[2]).is_some() { f[g.c(x[0] as usize, x[1] as usize, x[2] as usize)] } else { f[c] };
            (get(q) - get(p)) / (2.0 * hm)
        };
        let wx = d(&uz, 1) - d(&uy, 2);
        let wy = d(&ux, 2) - d(&uz, 0);
        let wz = d(&uy, 0) - d(&ux, 1);
        (wx * wx + wy * wy + wz * wz).sqrt()
    }).collect();
    // Forces on bodies: pressure and wall shear over the fluid–solid cell faces.
    let mut forces = vec![[0.0; 3]; model.bodies.len()];
    let mut heat = vec![0.0; model.bodies.len()];
    for c in 0..ncell {
        let b = g.cell[c];
        if b == 0 || b == u32::MAX { continue; }
        let (i, j, k) = cell_ijk(c);
        for d in 0..3 { for step in [-1isize, 1] {
            let mut q = [i as isize, j as isize, k as isize];
            q[d] += step;
            if g.fluid(q[0], q[1], q[2]) != Some(true) { continue; }
            let nb = g.c(q[0] as usize, q[1] as usize, q[2] as usize);
            let area = hm * hm;
            // Outward normal of the body face: towards the fluid cell.
            let mut nrm = [0.0; 3];
            nrm[d] = step as f64;
            for a in 0..3 { forces[(b - 1) as usize][a] -= pr[nb] * nrm[a] * area; }
            // Shear: μ u_tangential / (h/2), acting along the flow.
            let ut = [ux[nb], uy[nb], uz[nb]];
            for a in 0..3 { if a != d { forces[(b - 1) as usize][a] += mu * ut[a] / (0.5 * hm) * area; } }
            if thermal { let kb = model.mats[(b - 1) as usize].conductivity.max(1e-6); let kk = 2.0 * kb * kf / (kb + kf); heat[(b - 1) as usize] += kk * (temp[c] - temp[nb]) / hm * area; }
        } }
    }
    let flow_dir = geom::normalize(if geom::norm(inlet_v) > 0.0 { inlet_v } else { [1.0, 0.0, 0.0] });
    let a_ref = s.get("referenceArea").and_then(|v| v.as_f64()).map(|a| a * unit * unit);
    let qdyn = 0.5 * rho * u_ref * u_ref;
    let body_forces: Vec<Value> = model.bodies.iter().enumerate().filter(|(bi, _)| Some(*bi) != fluid_body).map(|(bi, b)| {
        let f = forces[bi];
        // Frontal area: the body's projection across the flow (from its cells).
        let mut proj = std::collections::HashSet::new();
        let dmain = (0..3).max_by(|&a, &c| flow_dir[a].abs().partial_cmp(&flow_dir[c].abs()).unwrap()).unwrap();
        for c in 0..ncell { if g.cell[c] == bi as u32 + 1 { let (i, j, k) = cell_ijk(c); let mut key = [i, j, k]; key[dmain] = 0; proj.insert(key); } }
        let area = a_ref.unwrap_or(proj.len() as f64 * hm * hm);
        let drag = geom::dot(f, flow_dir);
        let lift_v = geom::sub(f, geom::scale(flow_dir, drag));
        json!({ "body": b.id, "force": f, "drag": drag, "lift": geom::norm(lift_v), "cd": if area > 0.0 { drag / (qdyn * area) } else { 0.0 }, "cl": if area > 0.0 { geom::norm(lift_v) / (qdyn * area) } else { 0.0 }, "area": area, "heat": heat[bi] })
    }).collect();
    // Flow through the outlet and inlet faces.
    let (mut q_in, mut q_out) = (0.0, 0.0);
    // Signed: positive when leaving the fluid through the face.
    for d in 0..3 { let m = g.fdims(d); for k in 0..m[2] { for j in 0..m[1] { for i in 0..m[0] {
        let id = g.f(d, i, j, k);
        if !(fk[d][id] == OUT || (fk[d][id] == FIXED && fv[d][id] != 0.0)) { continue; }
        let mut a = [i as isize, j as isize, k as isize];
        a[d] -= 1;
        let lower_fluid = g.fluid(a[0], a[1], a[2]) == Some(true);
        let outward = if lower_fluid { vel[d][id] } else { -vel[d][id] } * hm * hm;
        if fk[d][id] == OUT { q_out += outward; } else { q_in -= outward; }
    } } } }
    let p_in = {
        let mut acc = (0.0, 0.0);
        for d in 0..3 { let m = g.fdims(d); for k in 0..m[2] { for j in 0..m[1] { for i in 0..m[0] {
            let id = g.f(d, i, j, k);
            if fk[d][id] == FIXED && fv[d][id] != 0.0 {
                let mut a = [i as isize, j as isize, k as isize];
                let b = a;
                a[d] -= 1;
                for x in [a, b] { if g.fluid(x[0], x[1], x[2]) == Some(true) { acc.0 += pr[g.c(x[0] as usize, x[1] as usize, x[2] as usize)]; acc.1 += 1.0; } }
            }
        } } } }
        if acc.1 > 0.0 { acc.0 / acc.1 } else { 0.0 }
    };
    // Streamlines from the inlet (or through the domain centre plane).
    let lines = streamlines(&g, &vel, &fk, &fv, unit, model.setting_u("streamlines", 12).clamp(2, 40));
    // Surface values on the body mesh (pressure, temperature) by sampling the nearest fluid cells.
    let nc = model.mesh.ncorner;
    let psurf: Vec<f64> = (0..nc).map(|i| sample_cell(&g, &pr, model.mesh.nodes[i], true)).collect();
    let tsurf: Vec<f64> = (0..nc).map(|i| sample_cell(&g, &temp, model.mesh.nodes[i], false)).collect();
    let cells_u32: Vec<u32> = g.cell.iter().map(|c| if *c == u32::MAX { 0xFFFF } else { *c }).collect();
    let mut fields = serde_json::Map::new();
    fields.insert("speed".into(), out.f32s(&speed));
    fields.insert("ux".into(), out.f32s(&ux));
    fields.insert("uy".into(), out.f32s(&uy));
    fields.insert("uz".into(), out.f32s(&uz));
    fields.insert("pressure".into(), out.f32s(&pr));
    fields.insert("vorticity".into(), out.f32s(&vort));
    if thermal { fields.insert("temperature".into(), out.f32s(&temp)); }
    let cells_ref = out.u32s(&cells_u32);
    let ps = out.f32s(&psurf);
    let ts = out.f32s(&tsurf);
    let line_pts = out.f32s(&lines.0);
    let line_speed = out.f32s(&lines.1);
    let line_off = out.u32s(&lines.2);
    let fluid_speed_max = speed.iter().cloned().fold(0.0, f64::max);
    out.set("fluid", json!({
        "dims": n, "origin": lo, "cellSize": h, "cells": cells_ref, "fields": Value::Object(fields),
        "steps": steps_done, "timeStep": dt, "history": history, "forces": body_forces,
        "inflow": q_in * rho, "outflow": q_out * rho, "inletPressure": p_in, "pressureDrop": p_in,
        "reference": { "speed": u_ref, "density": rho, "viscosity": mu, "reynolds": rho * u_ref * size * unit / mu },
        "streamlines": { "points": line_pts, "speed": line_speed, "offsets": line_off },
        "max": { "speed": fluid_speed_max, "temperature": temp.iter().cloned().fold(f64::NEG_INFINITY, f64::max), "pressure": pr.iter().cloned().fold(f64::NEG_INFINITY, f64::max) },
        "min": { "pressure": pr.iter().cloned().fold(f64::INFINITY, f64::min), "temperature": temp.iter().cloned().fold(f64::INFINITY, f64::min) },
        "turbulent": turbulent, "thermal": thermal,
    }));
    out.set("result", json!({ "fields": { "pressure": ps, "temperature": ts }, "max": { "pressure": psurf.iter().cloned().fold(f64::NEG_INFINITY, f64::max) } }));
    Ok(())
}

fn point_tri(p: V3, t: &[V3; 3]) -> f64 {
    // Distance to the triangle's plane within its bounding box (enough to tell faces apart).
    let n = geom::normalize(geom::cross(geom::sub(t[1], t[0]), geom::sub(t[2], t[0])));
    let d = geom::dot(geom::sub(p, t[0]), n).abs();
    let q = geom::sub(p, geom::scale(n, geom::dot(geom::sub(p, t[0]), n)));
    let inside = (0..3).all(|i| { let a = t[i]; let b = t[(i + 1) % 3]; geom::dot(geom::cross(geom::sub(b, a), geom::sub(q, a)), n) >= -1e-9 * geom::norm(geom::sub(b, a)).powi(2) });
    if inside { d } else { f64::INFINITY }
}

/// RK2 streamlines seeded on the inlet faces (or the upstream plane): (points xyz, speed, offsets).
fn streamlines(g: &Grid, vel: &[Vec<f64>], fk: &[Vec<u8>], fv: &[Vec<f64>], unit: f64, seeds: usize) -> (Vec<f64>, Vec<f64>, Vec<u32>) {
    let mut starts: Vec<V3> = Vec::new();
    for d in 0..3 {
        let m = g.fdims(d);
        for k in 0..m[2] { for j in 0..m[1] { for i in 0..m[0] {
            let id = g.f(d, i, j, k);
            if fk[d][id] == FIXED && fv[d][id] != 0.0 { starts.push(g.face_pos(d, i, j, k)); }
        } } }
    }
    let target = seeds * seeds;
    let stride = (starts.len() / target.max(1)).max(1);
    let starts: Vec<V3> = starts.into_iter().step_by(stride).take(target).collect();
    let (mut pts, mut sp, mut off) = (Vec::new(), Vec::new(), vec![0u32]);
    let hi = [g.lo[0] + g.n[0] as f64 * g.h, g.lo[1] + g.n[1] as f64 * g.h, g.lo[2] + g.n[2] as f64 * g.h];
    let vat = |p: V3| [sample_face(g, 0, &vel[0], p), sample_face(g, 1, &vel[1], p), sample_face(g, 2, &vel[2], p)];
    for s0 in starts {
        let mut p = s0;
        // Step half a cell inwards.
        let v0 = vat(p);
        let vm = geom::norm(v0).max(1e-12);
        p = geom::add(p, geom::scale(v0, 0.5 * g.h / vm));
        for _ in 0..4000 {
            if (0..3).any(|k| p[k] < g.lo[k] || p[k] > hi[k]) { break; }
            let ci = [((p[0] - g.lo[0]) / g.h) as isize, ((p[1] - g.lo[1]) / g.h) as isize, ((p[2] - g.lo[2]) / g.h) as isize];
            if g.fluid(ci[0], ci[1], ci[2]) != Some(true) { break; }
            let v = vat(p);
            let speed = geom::norm(v);
            if speed < 1e-6 { break; }
            pts.extend_from_slice(&p);
            sp.push(speed);
            let dt = 0.5 * g.h / speed;
            let mid = geom::add(p, geom::scale(v, 0.5 * dt));
            let v2 = vat(mid);
            p = geom::add(p, geom::scale(v2, dt));
        }
        let _ = unit;
        off.push((sp.len()) as u32);
    }
    (pts, sp, off)
}

#[cfg(test)]
mod tests {
    use crate::out::decode;
    use crate::run_job_json;

    #[test]
    fn flow_around_a_cube_has_drag() {
        let job = r#"{ "analysis": "fluid", "unit": 0.001,
          "bodies": [{ "id": "cube", "material": "steel", "shape": { "type": "box", "size": [40, 40, 40] } }],
          "mesh": { "size": 10 },
          "settings": { "inletVelocity": [2, 0, 0], "cellSize": 8, "maxSteps": 300, "turbulence": "turbulent" } }"#;
        let (v, _) = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        let f = &v["fluid"]["forces"][0];
        let cd = f["cd"].as_f64().unwrap();
        assert!(cd > 0.3 && cd < 3.0, "cd {cd}");
        let qin = v["fluid"]["inflow"].as_f64().unwrap();
        let qout = v["fluid"]["outflow"].as_f64().unwrap();
        assert!((qin - qout).abs() / qin < 0.02, "mass {qin} {qout}");
    }

    #[test]
    fn heated_block_warms_the_air() {
        let job = r#"{ "analysis": "fluid", "unit": 0.001,
          "bodies": [{ "id": "chip", "material": "aluminum", "shape": { "type": "box", "size": [30, 30, 10] } }],
          "mesh": { "size": 10 },
          "bcs": [ { "type": "heatPower", "bodies": ["chip"], "value": 5 } ],
          "settings": { "inletVelocity": [1, 0, 0], "cellSize": 6, "maxSteps": 250, "thermal": true, "buoyancy": false } }"#;
        let (v, _) = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        let tmax = v["fluid"]["max"]["temperature"].as_f64().unwrap();
        assert!(tmax > 23.0, "tmax {tmax}");
    }
}
