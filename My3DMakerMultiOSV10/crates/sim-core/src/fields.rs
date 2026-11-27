//! Scalar field analyses on the tetrahedral mesh: steady and transient heat transfer (conduction,
//! convection, radiation, heat flux and generation), electrostatics (with the surrounding air),
//! DC current conduction with Joule heating, and acoustics (cavity modes and harmonic response).

use crate::fem;
use crate::geom::{self, V3};
use crate::model::{enabled, kind, num, Model};
use crate::out::Out;
use crate::slice;
use crate::sparse::{cocg, pcg, Csr, C64};
use crate::Ctx;
use serde_json::{json, Value};

pub const SIGMA_SB: f64 = 5.670_374_419e-8;
pub const EPS0: f64 = 8.854_187_8128e-12;
pub const KELVIN: f64 = 273.15;

/// A scalar system on the elements whose region `coef` accepts: (diffusion, capacity) per region.
pub struct Scalar {
    pub k: Csr,
    pub c: Csr,
    pub f: Vec<f64>,
    pub fixed: Vec<bool>,
    pub values: Vec<f64>,
    pub used: Vec<bool>,
    pub elems: Vec<usize>,
}

fn nel(model: &Model) -> usize { if model.mesh.order() == 2 { 10 } else { 4 } }

pub fn scalar_system(model: &Model, coef: &dyn Fn(u32) -> Option<(f64, f64)>, ctx: &mut Ctx) -> Result<Scalar, String> {
    let mesh = &model.mesh;
    let nn = mesh.nnodes();
    let elems: Vec<usize> = (0..mesh.tets.len()).filter(|&e| coef(mesh.region[e]).is_some()).collect();
    if elems.is_empty() { return Err("model.noElements".into()); }
    let mut k = Csr::pattern(nn, 1, &mut elems.iter().map(|&e| mesh.element(e)));
    let mut c = k.same_pattern();
    let mut used = vec![false; nn];
    let n = nel(model);
    for (i, &e) in elems.iter().enumerate() {
        let (kc, cc) = coef(mesh.region[e]).unwrap();
        let conn = mesh.element(e);
        let x: Vec<V3> = conn.iter().map(|&q| model.x[q as usize]).collect();
        let dofs: Vec<usize> = conn.iter().map(|&q| q as usize).collect();
        for &d in &dofs { used[d] = true; }
        let gk = fem::points(&x, fem::stiffness_degree(n))?;
        k.add_element(&dofs, &fem::scalar_stiffness(&gk, kc));
        if cc != 0.0 {
            let gm = fem::points(&x, fem::mass_degree(n))?;
            c.add_element(&dofs, &fem::scalar_mass(&gm, cc));
        }
        if i % 4000 == 0 { ctx.step(0.25 * i as f64 / elems.len() as f64, "progress.assemble")?; }
    }
    let mut fixed = vec![false; nn];
    for i in 0..nn { if !used[i] { fixed[i] = true; } }
    Ok(Scalar { k, c, f: vec![0.0; nn], fixed, values: vec![0.0; nn], used, elems })
}

/// Boundary triangles of faces with their node lists (3 or 6) and coordinates.
fn face_tris(model: &Model, faces: &[usize]) -> Vec<(Vec<usize>, Vec<V3>)> {
    let mesh = &model.mesh;
    let mut out = Vec::new();
    for &f in faces {
        for &ti in &mesh.faces[f].tris {
            let t = mesh.tris[ti as usize];
            let mut nodes: Vec<usize> = t.iter().map(|&q| q as usize).collect();
            if mesh.order() == 2 { nodes.extend(mesh.tri_mid[ti as usize].iter().map(|&q| q as usize)); }
            let x = nodes.iter().map(|&q| model.x[q]).collect();
            out.push((nodes, x));
        }
    }
    out
}

/// Adds ∫ h N Nᵀ (matrix) and ∫ g N (vector) over faces.
fn robin(model: &Model, sys: &mut Scalar, faces: &[usize], h: f64, g: f64) {
    for (nodes, x) in face_tris(model, faces) {
        let m = nodes.len();
        let mut ke = vec![0.0; m * m];
        for (w, nv) in fem::tri_points(&x) {
            for a in 0..m {
                sys.f[nodes[a]] += w * g * nv[a];
                for b in 0..m { ke[a * m + b] += w * h * nv[a] * nv[b]; }
            }
        }
        if h != 0.0 { sys.k.add_element(&nodes, &ke); }
    }
}

fn add_flux(model: &Model, sys: &mut Scalar, faces: &[usize], q: f64) { robin(model, sys, faces, 0.0, q); }

fn fix_faces(model: &Model, sys: &mut Scalar, faces: &[usize], v: f64) {
    for n in model.mesh.face_nodes(faces) { sys.fixed[n as usize] = true; sys.values[n as usize] = v; }
}

fn fix_bodies(model: &Model, sys: &mut Scalar, bodies: &[u32], v: f64) {
    for &b in bodies { for n in model.mesh.region_nodes(b) { sys.fixed[n as usize] = true; sys.values[n as usize] = v; } }
}

/// ∫ s N over the elements of the given regions (volume source s, per m³).
fn volume_source(model: &Model, sys: &mut Scalar, regions: &[u32], s: &dyn Fn(usize) -> f64) -> Result<(), String> {
    let n = nel(model);
    for &e in &sys.elems.clone() {
        if !regions.contains(&model.mesh.region[e]) { continue; }
        let conn = model.mesh.element(e);
        let x: Vec<V3> = conn.iter().map(|&q| model.x[q as usize]).collect();
        let val = s(e);
        for gp in fem::points(&x, fem::mass_degree(n))? {
            for (a, &q) in conn.iter().enumerate() { sys.f[q as usize] += gp.w * gp.n[a] * val; }
        }
    }
    Ok(())
}

fn region_volume(model: &Model, r: u32) -> f64 {
    (0..model.mesh.tets.len()).filter(|&e| model.mesh.region[e] == r).map(|e| {
        let t = model.mesh.tets[e];
        crate::mesh::volume(model.x[t[0] as usize], model.x[t[1] as usize], model.x[t[2] as usize], model.x[t[3] as usize])
    }).sum()
}

fn solve_scalar(model: &Model, sys: &Scalar, extra: Option<(&Csr, f64)>, rhs: &[f64], ctx: &mut Ctx, f0: f64, f1: f64) -> Result<Vec<f64>, String> {
    let mut k = match extra { Some((c, a)) => sys.k.axpy(a, c), None => sys.k.clone() };
    let mut f = rhs.to_vec();
    if !sys.fixed.iter().zip(sys.used.iter()).any(|(f, u)| *f && *u) && extra.is_none() {
        // A floating field (no prescribed value anywhere): pin the level softly.
        let d = k.diag();
        let avg = d.iter().sum::<f64>() / d.len().max(1) as f64;
        for i in 0..k.n { if sys.used[i] { k.add(i, i, 1e-9 * avg); } }
    }
    k.constrain(&sys.fixed, &sys.values, &mut f);
    crate::sparse::solve_mesh(&k, &f, &model.x, 1, ctx, f0, f1)
}

/// Gradient of a nodal field, averaged at the nodes (over the accepted elements).
pub fn gradient(model: &Model, elems: &[usize], u: &[f64], scale: &dyn Fn(u32) -> f64) -> Result<Vec<V3>, String> {
    let mesh = &model.mesh;
    let nn = mesh.nnodes();
    let mut g = vec![[0.0; 3]; nn];
    let mut cnt = vec![0.0; nn];
    let n = nel(model);
    let corners = fem::node_coords(n);
    for &e in elems {
        let conn = mesh.element(e);
        let x: Vec<V3> = conn.iter().map(|&q| model.x[q as usize]).collect();
        let s = scale(mesh.region[e]);
        for (a, l) in corners.iter().enumerate() {
            let gp = fem::point(&x, l, 1.0)?;
            let mut v = [0.0; 3];
            for (b, &q) in conn.iter().enumerate() { for k in 0..3 { v[k] += gp.dn[b][k] * u[q as usize]; } }
            let node = conn[a] as usize;
            for k in 0..3 { g[node][k] += s * v[k]; }
            cnt[node] += 1.0;
        }
    }
    for i in 0..nn { if cnt[i] > 0.0 { for k in 0..3 { g[i][k] /= cnt[i]; } } }
    Ok(g)
}

fn corner_f32(model: &Model, out: &mut Out, v: &[f64]) -> Value { out.f32s(&v[..model.mesh.ncorner]) }
fn vec_f32(model: &Model, out: &mut Out, v: &[V3]) -> Value { out.f32s(&v[..model.mesh.ncorner].iter().flat_map(|p| [p[0], p[1], p[2]]).collect::<Vec<_>>()) }
fn mag(v: &[V3]) -> Vec<f64> { v.iter().map(|p| geom::norm(*p)).collect() }

fn minmax(v: &[f64], used: &[bool]) -> (f64, f64) {
    let mut lo = f64::INFINITY;
    let mut hi = f64::NEG_INFINITY;
    for (x, u) in v.iter().zip(used.iter()) { if *u { lo = lo.min(*x); hi = hi.max(*x); } }
    (lo, hi)
}

// ───────────────────────── heat transfer

fn thermal_system(model: &Model, ctx: &mut Ctx) -> Result<Scalar, String> {
    let mats = &model.mats;
    let nb = model.bodies.len() as u32;
    let mut sys = scalar_system(model, &|r| if r < nb { let m = &mats[r as usize]; Some((m.conductivity.max(1e-9), m.density * m.specific_heat)) } else { None }, ctx)?;
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        let faces = model.faces_of(bc);
        match kind(bc) {
            "temperature" => fix_faces(model, &mut sys, &faces, num(bc, "value", 22.0)),
            "convection" => { let h = num(bc, "h", 10.0); let ta = num(bc, "ambient", 22.0); robin(model, &mut sys, &faces, h, h * ta); }
            "heatFlux" => add_flux(model, &mut sys, &faces, num(bc, "value", 0.0)),
            "heatFlow" => { let a = model.faces_area(&faces); if a > 0.0 { add_flux(model, &mut sys, &faces, num(bc, "value", 0.0) / a); } }
            "heatGeneration" | "heatPower" => {
                let bodies = model.bodies_of(bc);
                for &b in &bodies {
                    let q = if kind(bc) == "heatPower" { num(bc, "value", 0.0) / region_volume(model, b).max(1e-300) } else { num(bc, "value", 0.0) };
                    volume_source(model, &mut sys, &[b], &|_| q)?;
                }
            }
            "bodyTemperature" => fix_bodies(model, &mut sys, &model.bodies_of(bc), num(bc, "value", 22.0)),
            _ => {}
        }
    }
    Ok(sys)
}

/// Radiation faces: (faces, emissivity, ambient °C).
fn radiation_faces(model: &Model) -> Vec<(Vec<usize>, f64, f64)> {
    model.job.bcs.iter().filter(|b| enabled(b) && kind(b) == "radiation").map(|b| (model.faces_of(b), num(b, "emissivity", 0.8), num(b, "ambient", 22.0))).collect()
}

/// Steady temperatures (°C), with extra volume heat `joule` (W/m³ per element) when coupled.
pub fn steady_temperature(model: &Model, joule: Option<&[f64]>, ctx: &mut Ctx) -> Result<(Vec<f64>, Scalar, usize), String> {
    let mut sys = thermal_system(model, ctx)?;
    if let Some(q) = joule {
        let regions: Vec<u32> = (0..model.bodies.len() as u32).collect();
        volume_source(model, &mut sys, &regions, &|e| q[e])?;
    }
    let rad = radiation_faces(model);
    let mut t = solve_scalar(model, &sys, None, &sys.f.clone(), ctx, 0.3, if rad.is_empty() { 0.85 } else { 0.5 })?;
    let mut iterations = 1;
    if !rad.is_empty() {
        // Picard on the linearised radiation: h_r = εσ(T² + T∞²)(T + T∞) in kelvin, per face (its mean temperature).
        for it in 0..40 {
            let mut s2 = Scalar { k: sys.k.clone(), c: sys.c.same_pattern(), f: sys.f.clone(), fixed: sys.fixed.clone(), values: sys.values.clone(), used: sys.used.clone(), elems: sys.elems.clone() };
            for (faces, eps, ta) in &rad {
                for &f in faces {
                    let nodes = model.mesh.face_nodes(&[f]);
                    let tm = nodes.iter().map(|&n| t[n as usize]).sum::<f64>() / nodes.len().max(1) as f64 + KELVIN;
                    let tak = ta + KELVIN;
                    let hr = eps * SIGMA_SB * (tm * tm + tak * tak) * (tm + tak);
                    robin(model, &mut s2, &[f], hr, hr * ta);
                }
            }
            let t2 = solve_scalar(model, &s2, None, &s2.f.clone(), ctx, 0.5, 0.85)?;
            let change = t2.iter().zip(t.iter()).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
            t = t2;
            iterations = it + 2;
            if change < 1e-4 { break; }
        }
    }
    Ok((t, sys, iterations))
}

fn heat_balance(model: &Model, t: &[f64]) -> Value {
    let mut list = Vec::new();
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        let faces = model.faces_of(bc);
        let q = match kind(bc) {
            "convection" => {
                let (h, ta) = (num(bc, "h", 10.0), num(bc, "ambient", 22.0));
                face_tris(model, &faces).iter().map(|(nodes, x)| fem::tri_points(x).iter().map(|(w, nv)| { let tt: f64 = nodes.iter().zip(nv.iter()).map(|(&n, &v)| v * t[n]).sum(); w * h * (tt - ta) }).sum::<f64>()).sum::<f64>()
            }
            "radiation" => {
                let (e, ta) = (num(bc, "emissivity", 0.8), num(bc, "ambient", 22.0) + KELVIN);
                face_tris(model, &faces).iter().map(|(nodes, x)| fem::tri_points(x).iter().map(|(w, nv)| { let tt: f64 = nodes.iter().zip(nv.iter()).map(|(&n, &v)| v * t[n]).sum::<f64>() + KELVIN; w * e * SIGMA_SB * (tt.powi(4) - ta.powi(4)) }).sum::<f64>()).sum::<f64>()
            }
            _ => continue,
        };
        list.push(json!({ "id": bc.get("id").cloned().unwrap_or(Value::Null), "type": kind(bc), "heatOut": q }));
    }
    Value::Array(list)
}

pub fn put_thermal(model: &Model, out: &mut Out, t: &[f64], sys: &Scalar) -> Result<Value, String> {
    let mats = &model.mats;
    let nb = model.bodies.len() as u32;
    let g = gradient(model, &sys.elems, t, &|r| if r < nb { -mats[r as usize].conductivity } else { 0.0 })?;
    let (tmin, tmax) = minmax(t, &sys.used);
    let flux_mag = mag(&g);
    let tf = corner_f32(model, out, t);
    let fv = vec_f32(model, out, &g);
    let fm = corner_f32(model, out, &flux_mag);
    let qmax = flux_mag.iter().cloned().fold(0.0, f64::max);
    Ok(json!({ "fields": { "temperature": tf, "fluxVector": fv, "flux": fm }, "min": { "temperature": tmin }, "max": { "temperature": tmax, "flux": qmax } }))
}

/// The temperature field alone (for coupled results: thermal stress shows it beside the stresses).
pub fn put_thermal_only(model: &Model, out: &mut Out, t: &[f64]) -> Result<Value, String> {
    let all: Vec<bool> = (0..t.len()).map(|i| i < model.mesh.nnodes()).collect();
    let (lo, hi) = minmax(t, &all);
    let tf = corner_f32(model, out, t);
    Ok(json!({ "fields": { "temperature": tf }, "min": { "temperature": lo }, "max": { "temperature": hi } }))
}

pub fn run_thermal(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<Vec<f64>, String> {
    let (t, sys, it) = steady_temperature(model, None, ctx)?;
    let res = put_thermal(model, out, &t, &sys)?;
    out.set("result", res);
    out.set("heatBalance", heat_balance(model, &t));
    out.set("iterations", json!(it));
    Ok(t)
}

pub fn run_thermal_transient(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let t_end = model.setting_f("endTime", 60.0).max(1e-9);
    let steps = model.setting_u("steps", 60).clamp(1, 5000);
    let dt = t_end / steps as f64;
    let t0 = model.setting_f("initialTemperature", 22.0);
    let sys = thermal_system(model, ctx)?;
    let rad = radiation_faces(model);
    let nn = model.mesh.nnodes();
    let mut t: Vec<f64> = (0..nn).map(|i| if sys.fixed[i] && sys.used[i] { sys.values[i] } else { t0 }).collect();
    // (C/dt + K) T⁺ = C/dt T + F (backward Euler); radiation lagged one step.
    let mut a = sys.k.axpy(1.0 / dt, &sys.c);
    let mut dummy = vec![0.0; nn];
    let zero = vec![0.0; nn];
    let mut a_for_pre = a.clone();
    a_for_pre.constrain(&sys.fixed, &zero, &mut dummy);
    let pre = crate::sparse::precond(&a_for_pre, &model.x, 1);
    let probe = model.job.probes.first().and_then(|p| model.nearest_node(*p)).unwrap_or_else(|| {
        let mut best = 0;
        let mut far = -1.0;
        for i in 0..model.mesh.ncorner { if sys.used[i] && !sys.fixed[i] { let d = sys.f[i].abs(); if d > far { far = d; best = i; } } }
        best
    });
    let frames_wanted = model.setting_u("frames", 30).clamp(2, 120);
    let every = (steps / frames_wanted).max(1);
    let mut times = vec![0.0];
    let mut hist = vec![t[probe]];
    let mut tmax_hist = vec![minmax(&t, &sys.used).1];
    let mut frames = Vec::new();
    for s in 1..=steps {
        let mut rhs = sys.c.mul(&t);
        for i in 0..nn { rhs[i] = rhs[i] / dt + sys.f[i]; }
        let mut s2 = Scalar { k: Csr { n: 0, rowptr: vec![0], col: vec![], val: vec![] }, c: Csr { n: 0, rowptr: vec![0], col: vec![], val: vec![] }, f: rhs, fixed: sys.fixed.clone(), values: sys.values.clone(), used: sys.used.clone(), elems: vec![] };
        let mut mat = a.clone();
        if !rad.is_empty() {
            std::mem::swap(&mut s2.k, &mut mat);
            for (faces, eps, ta) in &rad {
                for &f in faces {
                    let nodes = model.mesh.face_nodes(&[f]);
                    let tm = nodes.iter().map(|&n| t[n as usize]).sum::<f64>() / nodes.len().max(1) as f64 + KELVIN;
                    let tak = ta + KELVIN;
                    let hr = eps * SIGMA_SB * (tm * tm + tak * tak) * (tm + tak);
                    robin(model, &mut s2, &[f], hr, hr * ta);
                }
            }
            std::mem::swap(&mut s2.k, &mut mat);
        }
        let mut f = s2.f.clone();
        mat.constrain(&sys.fixed, &sys.values, &mut f);
        let mut tn = t.clone();
        let info = pcg(&mat, &f, &mut tn, pre.as_ref(), 1e-9, 20000, None)?;
        if !info.converged { return Err("solver.noConvergence".into()); }
        t = tn;
        times.push(s as f64 * dt);
        hist.push(t[probe]);
        tmax_hist.push(minmax(&t, &sys.used).1);
        if s % every == 0 || s == steps {
            let v = corner_f32(model, out, &t);
            frames.push(json!({ "time": s as f64 * dt, "temperature": v }));
        }
        if s % 3 == 0 { ctx.step(0.3 + 0.6 * s as f64 / steps as f64, "progress.transient")?; }
    }
    a = sys.k.clone();
    let _ = a;
    let res = put_thermal(model, out, &t, &sys)?;
    out.set("result", res);
    out.set("transient", json!({ "times": times, "probe": probe, "probePoint": model.mesh.nodes[probe], "history": hist, "maxHistory": tmax_hist, "frames": frames }));
    out.set("heatBalance", heat_balance(model, &t));
    Ok(())
}

// ───────────────────────── electrostatics

pub fn run_electrostatic(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let mats = &model.mats;
    let nb = model.bodies.len() as u32;
    let eps_air = model.setting_f("airPermittivity", 1.0);
    let coef = |r: u32| -> Option<(f64, f64)> { Some((EPS0 * if r < nb { mats[r as usize].permittivity.max(1.0) } else { eps_air }, 0.0)) };
    let mut sys = scalar_system(model, &coef, ctx)?;
    let mut levels: Vec<(f64, Value)> = Vec::new();
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        match kind(bc) {
            "voltage" => {
                let v = num(bc, "value", 0.0);
                let faces = model.faces_of(bc);
                fix_faces(model, &mut sys, &faces, v);
                fix_bodies(model, &mut sys, &model.bodies_of(bc), v);
                levels.push((v, bc.get("id").cloned().unwrap_or(Value::Null)));
            }
            "charge" => {
                let rho = num(bc, "value", 0.0);
                volume_source(model, &mut sys, &model.bodies_of(bc), &|_| rho)?;
            }
            "surfaceCharge" => add_flux(model, &mut sys, &model.faces_of(bc), num(bc, "value", 0.0)),
            _ => {}
        }
    }
    let v = solve_scalar(model, &sys, None, &sys.f.clone(), ctx, 0.3, 0.85)?;
    let e = gradient(model, &sys.elems, &v, &|_| -1.0)?;
    // Energy ½ ∫ ε |E|² by elements (gradient at their centres).
    let mut energy = 0.0;
    for &el in &sys.elems {
        let conn = model.mesh.element(el);
        let x: Vec<V3> = conn.iter().map(|&q| model.x[q as usize]).collect();
        let eps = coef(model.mesh.region[el]).unwrap().0;
        for gp in fem::points(&x, fem::stiffness_degree(conn.len()))? {
            let mut g = [0.0; 3];
            for (b, &q) in conn.iter().enumerate() { for k in 0..3 { g[k] += gp.dn[b][k] * v[q as usize]; } }
            energy += 0.5 * eps * geom::dot(g, g) * gp.w;
        }
    }
    let dv = if levels.len() >= 2 { levels.iter().map(|l| l.0).fold(f64::NEG_INFINITY, f64::max) - levels.iter().map(|l| l.0).fold(f64::INFINITY, f64::min) } else { levels.first().map(|l| l.0.abs()).unwrap_or(0.0) };
    let capacitance = if dv > 0.0 { 2.0 * energy / (dv * dv) } else { 0.0 };
    let em = mag(&e);
    let all = vec![true; v.len()];
    let (vmin, vmax) = minmax(&v, &all);
    let vf = corner_f32(model, out, &v);
    let ef = corner_f32(model, out, &em);
    let ev = vec_f32(model, out, &e);
    let slices = slice::mid_slices(model, out, &[("potential", &v), ("field", &em)]);
    out.set("result", json!({ "fields": { "potential": vf, "field": ef, "fieldVector": ev }, "min": { "potential": vmin }, "max": { "potential": vmax, "field": em.iter().cloned().fold(0.0, f64::max) } }));
    out.set("electric", json!({ "energy": energy, "capacitance": capacitance, "voltageSpan": dv, "slices": slices }));
    Ok(())
}

// ───────────────────────── DC conduction (+ Joule heating)

pub fn run_conduction(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let mats = &model.mats;
    let nb = model.bodies.len() as u32;
    let sigma = |r: u32| -> Option<(f64, f64)> { if r < nb { let rho = mats[r as usize].resistivity; if rho > 0.0 && rho < 1e6 { Some((1.0 / rho, 0.0)) } else { None } } else { None } };
    let mut sys = ctx.sub(0.0, 0.4, |c| scalar_system(model, &sigma, c))?;
    let mut voltage_faces: Vec<(Vec<usize>, f64, Value)> = Vec::new();
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        let faces = model.faces_of(bc);
        match kind(bc) {
            "voltage" => { let v = num(bc, "value", 0.0); fix_faces(model, &mut sys, &faces, v); voltage_faces.push((faces, v, bc.get("id").cloned().unwrap_or(Value::Null))); }
            "current" => { let a = model.faces_area(&faces); if a > 0.0 { add_flux(model, &mut sys, &faces, num(bc, "value", 0.0) / a); } }
            _ => {}
        }
    }
    let v = ctx.sub(0.0, 0.4, |c| solve_scalar(model, &sys, None, &sys.f.clone(), c, 0.3, 0.9))?;
    let j = gradient(model, &sys.elems, &v, &|r| -sigma(r).map(|s| s.0).unwrap_or(0.0))?;
    // Joule heat per element (W/m³) at its centre, and the total power.
    let mut joule = vec![0.0; model.mesh.tets.len()];
    let mut power = 0.0;
    for &el in &sys.elems {
        let conn = model.mesh.element(el);
        let x: Vec<V3> = conn.iter().map(|&q| model.x[q as usize]).collect();
        let s = sigma(model.mesh.region[el]).unwrap().0;
        let mut q = 0.0;
        let mut vol = 0.0;
        for gp in fem::points(&x, fem::stiffness_degree(conn.len()))? {
            let mut g = [0.0; 3];
            for (b, &n) in conn.iter().enumerate() { for k in 0..3 { g[k] += gp.dn[b][k] * v[n as usize]; } }
            q += s * geom::dot(g, g) * gp.w;
            vol += gp.w;
        }
        joule[el] = q / vol.max(1e-300);
        power += q;
    }
    // Current through each voltage face: the reaction of the conduction matrix.
    let kv = sys.k.mul(&v);
    let currents: Vec<Value> = voltage_faces.iter().map(|(faces, volt, id)| {
        let i: f64 = model.mesh.face_nodes(faces).iter().map(|&n| kv[n as usize] - sys.f[n as usize]).sum();
        json!({ "id": id, "voltage": volt, "current": i })
    }).collect();
    let current = currents.iter().filter_map(|c| c["current"].as_f64()).filter(|c| *c > 0.0).sum::<f64>();
    let span = if voltage_faces.len() >= 2 { voltage_faces.iter().map(|f| f.1).fold(f64::NEG_INFINITY, f64::max) - voltage_faces.iter().map(|f| f.1).fold(f64::INFINITY, f64::min) } else { 0.0 };
    let resistance = if current > 0.0 { span / current } else { 0.0 };
    let jm = mag(&j);
    // Joule heat at the nodes (average of the elements around).
    let mut qn = vec![0.0; model.mesh.nnodes()];
    let mut cnt = vec![0.0; model.mesh.nnodes()];
    for &el in &sys.elems { for &n in &model.mesh.tets[el] { qn[n as usize] += joule[el]; cnt[n as usize] += 1.0; } }
    for i in 0..qn.len() { if cnt[i] > 0.0 { qn[i] /= cnt[i]; } }
    let (vmin, vmax) = minmax(&v, &sys.used);
    let vf = corner_f32(model, out, &v);
    let jf = corner_f32(model, out, &jm);
    let jv = vec_f32(model, out, &j);
    let qf = corner_f32(model, out, &qn);
    let mut result = json!({ "fields": { "potential": vf, "currentDensity": jf, "currentVector": jv, "joule": qf }, "min": { "potential": vmin }, "max": { "potential": vmax, "currentDensity": jm.iter().cloned().fold(0.0, f64::max) } });
    if model.setting_b("coupleThermal", false) {
        let (t, tsys, _) = ctx.sub(0.4, 0.95, |c| steady_temperature(model, Some(&joule), c))?;
        let th = put_thermal(model, out, &t, &tsys)?;
        for (k, val) in th["fields"].as_object().unwrap() { result["fields"][k] = val.clone(); }
        result["max"]["temperature"] = th["max"]["temperature"].clone();
        result["min"]["temperature"] = th["min"]["temperature"].clone();
        out.set("heatBalance", heat_balance(model, &t));
    }
    out.set("result", result);
    out.set("electric", json!({ "power": power, "current": current, "resistance": resistance, "terminals": currents }));
    Ok(())
}

// ───────────────────────── acoustics

fn acoustic_system(model: &Model, ctx: &mut Ctx) -> Result<(Scalar, Vec<u32>), String> {
    let mats = &model.mats;
    let nb = model.bodies.len() as u32;
    // The acoustic domain: bodies whose material has a sound speed (air, water…), or all bodies.
    let mut regions: Vec<u32> = (0..nb).filter(|&r| mats[r as usize].sound_speed > 0.0).collect();
    if regions.is_empty() { regions = (0..nb).collect(); }
    let regs = regions.clone();
    let coef = move |r: u32| -> Option<(f64, f64)> {
        if !regs.contains(&r) { return None; }
        let m = &mats[r as usize];
        let rho = if m.density > 0.0 { m.density } else { 1.225 };
        let c = if m.sound_speed > 0.0 { m.sound_speed } else { 343.0 };
        Some((1.0 / rho, 1.0 / (rho * c * c)))
    };
    let sys = scalar_system(model, &coef, ctx)?;
    Ok((sys, regions))
}

pub fn run_acoustic_modal(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let nev = model.setting_u("modes", 8).clamp(1, 40);
    let (mut sys, _) = acoustic_system(model, ctx)?;
    for bc in &model.job.bcs { if enabled(bc) && kind(bc) == "pressure" { let f = model.faces_of(bc); fix_faces(model, &mut sys, &f, 0.0); } }
    let n = sys.k.n;
    let mut k = sys.k.clone();
    let mut m = sys.c.clone();
    let mut dummy = vec![0.0; n];
    let zero = vec![0.0; n];
    k.constrain(&sys.fixed, &zero, &mut dummy);
    m.zero_fixed(&sys.fixed, 0.0);
    let dk: f64 = k.diag().iter().sum();
    let dm: f64 = m.diag().iter().sum();
    let sigma = 1e-6 * dk / dm.max(1e-300);
    let ks = k.axpy(sigma, &m);
    let pre = crate::sparse::precond(&ks, &model.x, 1);
    let mask: Vec<bool> = sys.fixed.iter().map(|f| !f).collect();
    let a = |x: &[f64], y: &mut [f64]| ks.matvec(x, y);
    let b = |x: &[f64], y: &mut [f64]| m.matvec(x, y);
    let t = |x: &[f64], y: &mut [f64]| pre.apply(x, y);
    let e = crate::eigen::lobpcg(&a, &b, &t, n, nev, &mask, 1e-6, 600, ctx, 0.3, 0.9)?;
    let mut list = Vec::new();
    for (i, (l, phi)) in e.values.iter().zip(e.vectors.iter()).enumerate() {
        let w2 = (l - sigma).max(0.0);
        let mx = phi.iter().map(|v| v.abs()).fold(0.0, f64::max).max(1e-300);
        let shape: Vec<f64> = phi.iter().map(|v| v / mx).collect();
        let field = corner_f32(model, out, &shape);
        list.push(json!({ "mode": i + 1, "frequency": w2.sqrt() / (2.0 * std::f64::consts::PI), "field": field }));
    }
    out.set("modes", Value::Array(list));
    Ok(())
}

pub fn run_acoustic_harmonic(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let f0 = model.setting_f("fmin", 20.0).max(1.0);
    let f1 = model.setting_f("fmax", 1000.0).max(f0 + 1.0);
    let npts = model.setting_u("points", 60).clamp(2, 400);
    let loss = model.setting_f("damping", 0.01);
    let (mut sys, _) = acoustic_system(model, ctx)?;
    let n = sys.k.n;
    // Absorbing faces: ∫ (1/Z) N Nᵀ (Z = ρc, or given); velocity sources: ∫ v N.
    let mut damp = Scalar { k: sys.k.same_pattern(), c: sys.c.same_pattern(), f: vec![0.0; n], fixed: sys.fixed.clone(), values: vec![0.0; n], used: sys.used.clone(), elems: vec![] };
    let mut vel = Scalar { k: sys.k.same_pattern(), c: sys.c.same_pattern(), f: vec![0.0; n], fixed: sys.fixed.clone(), values: vec![0.0; n], used: sys.used.clone(), elems: vec![] };
    let mut pressure_fixed: Vec<(Vec<usize>, f64)> = Vec::new();
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        let faces = model.faces_of(bc);
        match kind(bc) {
            "absorbing" | "radiation" => { let z = num(bc, "impedance", 1.225 * 343.0); robin(model, &mut damp, &faces, 1.0 / z, 0.0); }
            "velocity" => add_flux(model, &mut vel, &faces, num(bc, "value", 1e-3)),
            "pressure" => pressure_fixed.push((faces, num(bc, "value", 0.0))),
            _ => {}
        }
    }
    for (faces, v) in &pressure_fixed { fix_faces(model, &mut sys, faces, *v); }
    let probe = model.job.probes.first().and_then(|p| model.nearest_node(*p)).unwrap_or_else(|| (0..model.mesh.ncorner).find(|&i| sys.used[i] && !sys.fixed[i]).unwrap_or(0));
    let mut freqs = Vec::new();
    let mut spl = Vec::new();
    let mut best = (f64::NEG_INFINITY, f0);
    let fsel_given = model.job.settings.get("frequency").and_then(|v| v.as_f64());
    let mut keep: Option<Vec<C64>> = None;
    let solve_at = |f: f64| -> Result<Vec<C64>, String> {
        let w = 2.0 * std::f64::consts::PI * f;
        // (K − ω²(1 − iη)M + iωC) p = iω F_v  (η: a small loss factor)
        let mut ar = sys.k.axpy(-w * w, &sys.c);
        let mut ai = sys.c.scaled(w * w * loss).axpy(w, &damp.k);
        let mut b: Vec<C64> = (0..n).map(|i| C64::new(0.0, w * vel.f[i])).collect();
        // Prescribed pressures: rows become identity.
        for i in 0..n {
            for k in ar.rowptr[i]..ar.rowptr[i + 1] {
                let j = ar.col[k] as usize;
                if sys.fixed[i] { ar.val[k] = if i == j { 1.0 } else { 0.0 }; ai.val[k] = 0.0; }
                else if sys.fixed[j] { b[i] = b[i] - C64::new(ar.val[k], ai.val[k]) * C64::new(sys.values[j], 0.0); ar.val[k] = 0.0; ai.val[k] = 0.0; }
            }
            if sys.fixed[i] { b[i] = C64::new(sys.values[i], 0.0); }
        }
        let (p, ok) = cocg(&ar, &ai, &b, 1e-8, 20000);
        if !ok { return Err("solver.noConvergence".into()); }
        Ok(p)
    };
    let db = |p: C64| 20.0 * ((p.abs() / std::f64::consts::SQRT_2).max(1e-12) / 2e-5).log10();
    for s in 0..npts {
        let f = if npts > 1 { f0 * (f1 / f0).powf(s as f64 / (npts - 1) as f64) } else { f0 };
        let p = solve_at(f)?;
        let level = db(p[probe]);
        if level > best.0 { best = (level, f); }
        freqs.push(f);
        spl.push(level);
        ctx.step(0.3 + 0.6 * (s + 1) as f64 / npts as f64, "progress.harmonic")?;
        if fsel_given.is_none() { keep = None; }
    }
    let fsel = fsel_given.unwrap_or(best.1);
    let p = match keep { Some(p) => p, None => solve_at(fsel)? };
    let amp: Vec<f64> = p.iter().map(|v| v.abs()).collect();
    let lvl: Vec<f64> = p.iter().map(|v| db(*v)).collect();
    let re: Vec<f64> = p.iter().map(|v| v.re).collect();
    let af = corner_f32(model, out, &amp);
    let lf = corner_f32(model, out, &lvl);
    let rf = corner_f32(model, out, &re);
    out.set("result", json!({ "fields": { "pressure": af, "spl": lf, "pressureRe": rf }, "max": { "pressure": amp.iter().cloned().fold(0.0, f64::max), "spl": lvl.iter().cloned().fold(f64::NEG_INFINITY, f64::max) } }));
    out.set("harmonic", json!({ "frequencies": freqs, "spl": spl, "probe": probe, "probePoint": model.mesh.nodes[probe], "frequency": fsel }));
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::out::decode;
    use crate::run_job_json;

    fn bar(analysis: &str, material: &str, bcs: &str, settings: &str) -> serde_json::Value {
        let job = format!(r#"{{ "analysis": "{analysis}", "unit": 0.001,
          "bodies": [{{ "id": "b1", "material": "{material}", "shape": {{ "type": "box", "size": [100, 20, 20], "placement": {{ "position": [50, 0, 0] }} }} }}],
          "mesh": {{ "size": 5, "order": 2 }}, "bcs": [{bcs}], "settings": {{ {settings} }} }}"#);
        let bytes = run_job_json(&job, &mut |_, _| true).unwrap();
        decode(&bytes).unwrap().0
    }
    const LEFT: &str = r#"{ "body": "b1", "c": [0, 0, 0], "n": [-1, 0, 0], "a": 400 }"#;
    const RIGHT: &str = r#"{ "body": "b1", "c": [100, 0, 0], "n": [1, 0, 0], "a": 400 }"#;

    #[test]
    fn conduction_through_a_bar() {
        // 100 W through k = 60.5 W/mK, A = 4e-4 m², L = 0.1 m: ΔT = Q L / (k A).
        let bcs = format!(r#"{{ "type": "temperature", "value": 20, "faces": [{LEFT}] }}, {{ "type": "heatFlow", "value": 100, "faces": [{RIGHT}] }}"#);
        let v = bar("thermal", "steel", &bcs, "");
        let tmax = v["result"]["max"]["temperature"].as_f64().unwrap();
        let exact = 20.0 + 100.0 * 0.1 / (60.5 * 4e-4);
        assert!((tmax - exact).abs() / (exact - 20.0) < 0.01, "{tmax} vs {exact}");
    }

    #[test]
    fn resistance_of_a_copper_bar() {
        let bcs = format!(r#"{{ "type": "voltage", "value": 0, "faces": [{LEFT}] }}, {{ "type": "voltage", "value": 0.01, "faces": [{RIGHT}] }}"#);
        let v = bar("conduction", "copper", &bcs, "");
        let r = v["electric"]["resistance"].as_f64().unwrap();
        let exact = 1.72e-8 * 0.1 / 4e-4;
        assert!((r - exact).abs() / exact < 0.01, "{r} vs {exact}");
    }

    #[test]
    fn closed_tube_acoustic_modes() {
        // Rigid walls: f = n c / 2L → 1715 Hz for L = 0.1 m in air (after the constant mode).
        let v = bar("acousticModal", "air", "", r#""modes": 3"#);
        let f1 = v["modes"][1]["frequency"].as_f64().unwrap();
        assert!((f1 - 1715.0).abs() / 1715.0 < 0.01, "{f1}");
    }
}
