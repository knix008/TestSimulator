//! Magnetostatics with first-order edge (Whitney/Nédélec) elements on the corner tetrahedra:
//! ∇ × (ν ∇ × A) = J + ∇ × (ν Br), A × n = 0 on the enclosure (flux parallel), a small mass term
//! as gauge. Coils (loop or straight) give J, permanent magnets their remanence. Results: B, H,
//! energy, inductance, and the force on each body (Maxwell stress on the air layer around it).

use crate::geom::{self, cross, dot, V3};
use crate::model::{enabled, kind, num, vec3, Model};
use crate::mesh::NONE;
use crate::out::Out;
use crate::sparse::{pcg, Csr, Pre};
use crate::Ctx;
use serde_json::{json, Value};
use std::collections::HashMap;

pub const MU0: f64 = 4.0e-7 * std::f64::consts::PI;
const EDGES: [(usize, usize); 6] = crate::mesh::TET10_EDGES;

struct Source { j: Vec<V3>, br: Vec<V3>, coil_current: f64 }

fn grads(x: &[V3; 4]) -> Option<([V3; 4], f64)> {
    let gp = crate::fem::point(x, &[0.25; 4], 1.0).ok()?;
    let v = gp.w / 1.0 * (1.0 / 6.0) * 6.0 / 6.0;
    let _ = v;
    let vol = crate::mesh::volume(x[0], x[1], x[2], x[3]);
    Some(([gp.dn[0], gp.dn[1], gp.dn[2], gp.dn[3]], vol))
}

fn sources(model: &Model) -> Source {
    let mesh = &model.mesh;
    let ne = mesh.tets.len();
    let mut j = vec![[0.0; 3]; ne];
    let mut br = vec![[0.0; 3]; ne];
    let mut coil_current: f64 = 0.0;
    let centroid = |e: usize| -> V3 { let t = mesh.tets[e]; let mut c = [0.0; 3]; for &n in &t { for k in 0..3 { c[k] += model.x[n as usize][k] / 4.0; } } c };
    let vol = |e: usize| -> f64 { let t = mesh.tets[e]; crate::mesh::volume(model.x[t[0] as usize], model.x[t[1] as usize], model.x[t[2] as usize], model.x[t[3] as usize]) };
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        let bodies = model.bodies_of(bc);
        let elems: Vec<usize> = (0..ne).filter(|&e| bodies.contains(&mesh.region[e])).collect();
        if elems.is_empty() { continue; }
        match kind(bc) {
            "coil" => {
                let current = num(bc, "current", 1.0);
                let turns = num(bc, "turns", 1.0);
                coil_current = coil_current.max(current.abs());
                let v_tot: f64 = elems.iter().map(|&e| vol(e)).sum();
                let mut c = [0.0; 3];
                for &e in &elems { let p = centroid(e); let w = vol(e); for k in 0..3 { c[k] += p[k] * w / v_tot; } }
                if let Some(cc) = vec3(bc, "center") { c = geom::scale(cc, model.unit()); }
                if bc.get("kind").and_then(|v| v.as_str()) == Some("straight") {
                    let d = geom::normalize(vec3(bc, "direction").unwrap_or([0.0, 0.0, 1.0]));
                    let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
                    for &e in &elems { for &n in &mesh.tets[e] { let s = dot(model.x[n as usize], d); lo = lo.min(s); hi = hi.max(s); } }
                    let area = v_tot / (hi - lo).max(1e-12);
                    for &e in &elems { j[e] = geom::scale(d, turns * current / area); }
                } else {
                    let axis = geom::normalize(vec3(bc, "axis").unwrap_or([0.0, 0.0, 1.0]));
                    // Mean radius (volume weighted) → cross-section A = V / (2π r̄).
                    let radius = |p: V3| { let d = geom::sub(p, c); geom::norm(geom::sub(d, geom::scale(axis, dot(d, axis)))) };
                    let rbar: f64 = elems.iter().map(|&e| radius(centroid(e)) * vol(e)).sum::<f64>() / v_tot;
                    let area = v_tot / (2.0 * std::f64::consts::PI * rbar.max(1e-12));
                    let jm = turns * current / area;
                    for &e in &elems {
                        let d = geom::sub(centroid(e), c);
                        let t = geom::normalize(cross(axis, d));
                        j[e] = geom::scale(t, jm);
                    }
                }
            }
            "magnet" => {
                let b = num(bc, "remanence", 1.2);
                let d = geom::normalize(vec3(bc, "direction").unwrap_or([0.0, 0.0, 1.0]));
                for &e in &elems { br[e] = geom::scale(d, b); }
            }
            _ => {}
        }
    }
    Source { j, br, coil_current }
}

pub fn run_magnetostatic(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let mesh = &model.mesh;
    let ne = mesh.tets.len();
    let nb = model.bodies.len() as u32;
    let nu_of = |r: u32| -> f64 { if r < nb { 1.0 / (MU0 * model.mats[r as usize].permeability.max(1e-3)) } else { 1.0 / MU0 } };
    // Global edges, oriented from the lower node number.
    let mut edge_id: HashMap<(u32, u32), u32> = HashMap::new();
    let mut elem_edges: Vec<[(u32, f64); 6]> = Vec::with_capacity(ne);
    for t in &mesh.tets {
        let mut ee = [(0u32, 1.0); 6];
        for (s, &(a, b)) in EDGES.iter().enumerate() {
            let (na, nb2) = (t[a], t[b]);
            let key = (na.min(nb2), na.max(nb2));
            let next = edge_id.len() as u32;
            let id = *edge_id.entry(key).or_insert(next);
            ee[s] = (id, if na < nb2 { 1.0 } else { -1.0 });
        }
        elem_edges.push(ee);
    }
    let nedge = edge_id.len();
    let src = sources(model);
    // Pattern: edges sharing an element.
    let mut rows: Vec<Vec<u32>> = vec![Vec::new(); nedge];
    for ee in &elem_edges { for a in ee { for b in ee { rows[a.0 as usize].push(b.0); } } }
    for r in rows.iter_mut() { r.sort_unstable(); r.dedup(); }
    let mut k = Csr::from_rows(rows);
    let mut m = k.same_pattern();
    let mut f = vec![0.0; nedge];
    for e in 0..ne {
        let t = mesh.tets[e];
        let x = [model.x[t[0] as usize], model.x[t[1] as usize], model.x[t[2] as usize], model.x[t[3] as usize]];
        let (g, vol) = grads(&x).ok_or("mesh.degenerate")?;
        let nu = nu_of(mesh.region[e]);
        let curl: Vec<V3> = EDGES.iter().map(|&(i, j)| geom::scale(cross(g[i], g[j]), 2.0)).collect();
        let lam = |p: usize, q: usize| vol / 20.0 * if p == q { 2.0 } else { 1.0 };
        let ee = elem_edges[e];
        let dofs: Vec<usize> = ee.iter().map(|x| x.0 as usize).collect();
        let mut ke = vec![0.0; 36];
        let mut me = vec![0.0; 36];
        for (a, &(i, j)) in EDGES.iter().enumerate() {
            for (b, &(p, q)) in EDGES.iter().enumerate() {
                let s = ee[a].1 * ee[b].1;
                ke[a * 6 + b] = s * nu * vol * dot(curl[a], curl[b]);
                me[a * 6 + b] = s * (lam(i, p) * dot(g[j], g[q]) - lam(i, q) * dot(g[j], g[p]) - lam(j, p) * dot(g[i], g[q]) + lam(j, q) * dot(g[i], g[p]));
            }
            // ∫ w·J = (V/4) J·(∇λj − ∇λi); ∫ ν Br·curl w = ν V Br·curl w.
            let jv = src.j[e];
            let mut fa = 0.0;
            if jv != [0.0; 3] { fa += vol / 4.0 * dot(jv, geom::sub(g[j], g[i])); }
            if src.br[e] != [0.0; 3] { fa += nu * vol * dot(src.br[e], curl[a]); }
            f[dofs[a]] += ee[a].1 * fa;
        }
        k.add_element(&dofs, &ke);
        m.add_element(&dofs, &me);
        if e % 5000 == 0 { ctx.step(0.3 * e as f64 / ne as f64, "progress.assemble")?; }
    }
    // Flux parallel on the outer walls.
    let mut fixed = vec![false; nedge];
    for (ti, tri) in mesh.tris.iter().enumerate() {
        if mesh.tri_other[ti] == NONE && mesh.tri_region[ti] == model.air {
            for (a, b) in [(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])] {
                if let Some(&id) = edge_id.get(&(a.min(b), a.max(b))) { fixed[id as usize] = true; }
            }
        }
    }
    let dk: f64 = k.diag().iter().sum::<f64>() / nedge as f64;
    let dm: f64 = m.diag().iter().sum::<f64>() / nedge as f64;
    let mut a = k.axpy(1e-6 * dk / dm.max(1e-300), &m);
    let zero = vec![0.0; nedge];
    a.constrain(&fixed, &zero, &mut f);
    let pre = Pre::new(&a);
    let mut sol = vec![0.0; nedge];
    // The gradient (gauge) part converges slowly but does not change B = ∇ × A: a moderate tolerance.
    let info = pcg(&a, &f, &mut sol, &pre, 1e-6, 40000, Some((ctx, 0.35, 0.85)))?;
    if std::env::var_os("SIM_EIG_DEBUG").is_some() { eprintln!("magnetic edges {nedge} iterations {}", info.iterations); }
    if !info.converged && info.residual > 1e-4 { return Err("solver.noConvergence".into()); }
    // B per element, energy.
    let mut be = vec![[0.0; 3]; ne];
    let mut energy = 0.0;
    for e in 0..ne {
        let t = mesh.tets[e];
        let x = [model.x[t[0] as usize], model.x[t[1] as usize], model.x[t[2] as usize], model.x[t[3] as usize]];
        let (g, vol) = grads(&x).ok_or("mesh.degenerate")?;
        let mut b = [0.0; 3];
        for (a2, &(i, j)) in EDGES.iter().enumerate() {
            let (id, s) = elem_edges[e][a2];
            let c = geom::scale(cross(g[i], g[j]), 2.0 * s * sol[id as usize]);
            for q in 0..3 { b[q] += c[q]; }
        }
        be[e] = b;
        let h = geom::scale(geom::sub(b, src.br[e]), nu_of(mesh.region[e]));
        energy += 0.5 * dot(b, h) * vol;
    }
    // Nodal averages (volume weighted) for display.
    let nn = mesh.nnodes();
    let mut bn = vec![[0.0; 3]; nn];
    let mut wn = vec![0.0; nn];
    for e in 0..ne {
        let t = mesh.tets[e];
        let vol = crate::mesh::volume(model.x[t[0] as usize], model.x[t[1] as usize], model.x[t[2] as usize], model.x[t[3] as usize]);
        // Per body: a node on an interface takes the values of the body (not the air) side.
        let w = if model.is_body(mesh.region[e]) { vol * 1e3 } else { vol };
        for &n in &t { for q in 0..3 { bn[n as usize][q] += be[e][q] * w; } wn[n as usize] += w; }
    }
    for i in 0..nn { if wn[i] > 0.0 { for q in 0..3 { bn[i][q] /= wn[i]; } } }
    let bmag: Vec<f64> = bn.iter().map(|v| geom::norm(*v)).collect();
    let hmag: Vec<f64> = (0..nn).map(|i| bmag[i] / MU0).collect();
    // Forces: −∫ T ∇g over the air elements touching each body.
    let mut forces = Vec::new();
    for body in 0..nb {
        let mut on = vec![false; nn];
        for e in 0..ne { if mesh.region[e] == body { for &n in &mesh.tets[e] { on[n as usize] = true; } } }
        let mut fv = [0.0; 3];
        for e in 0..ne {
            if model.is_body(mesh.region[e]) { continue; }
            let t = mesh.tets[e];
            if !t.iter().any(|&n| on[n as usize]) { continue; }
            let x = [model.x[t[0] as usize], model.x[t[1] as usize], model.x[t[2] as usize], model.x[t[3] as usize]];
            let (g, vol) = grads(&x).ok_or("mesh.degenerate")?;
            let mut gg = [0.0; 3];
            for c in 0..4 { if on[t[c] as usize] { for q in 0..3 { gg[q] += g[c][q]; } } }
            let b = be[e];
            let b2 = dot(b, b);
            for i in 0..3 {
                let mut s = 0.0;
                for jx in 0..3 { s += (b[i] * b[jx] - if i == jx { 0.5 * b2 } else { 0.0 }) / MU0 * gg[jx]; }
                fv[i] -= s * vol;
            }
        }
        forces.push(json!({ "body": model.bodies[body as usize].id, "force": fv }));
    }
    let inductance = if src.coil_current > 0.0 && src.br.iter().all(|b| *b == [0.0; 3]) { 2.0 * energy / src.coil_current.powi(2) } else { 0.0 };
    let nc = mesh.ncorner;
    let bf = out.f32s(&bmag[..nc]);
    let hf = out.f32s(&hmag[..nc]);
    let bv = out.f32s(&bn[..nc].iter().flat_map(|v| [v[0], v[1], v[2]]).collect::<Vec<_>>());
    let jn: Vec<f64> = {
        let mut jv = vec![0.0; nn];
        let mut c = vec![0.0; nn];
        for e in 0..ne { let m = geom::norm(src.j[e]); if m > 0.0 { for &n in &mesh.tets[e] { jv[n as usize] += m; c[n as usize] += 1.0; } } }
        (0..nn).map(|i| if c[i] > 0.0 { jv[i] / c[i] } else { 0.0 }).collect()
    };
    let jf = out.f32s(&jn[..nc]);
    let slices = crate::slice::mid_slices(model, out, &[("flux", &bmag)]);
    out.set("result", json!({ "fields": { "flux": bf, "fieldStrength": hf, "fluxVector": bv, "currentDensity": jf }, "max": { "flux": bmag.iter().cloned().fold(0.0, f64::max) } }));
    out.set("magnetic", json!({ "energy": energy, "inductance": inductance, "forces": forces, "edges": nedge, "iterations": info.iterations, "slices": slices }));
    let _: Value = Value::Null;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::out::decode;
    use crate::run_job_json;

    #[test]
    fn long_solenoid_field_is_mu0_n_i() {
        // A coil of 200 turns, 1 A, length 100 mm: B ≈ μ0 N I / L = 2.51 mT inside (finite length: a bit less).
        let job = r#"{ "analysis": "magnetostatic", "unit": 0.001,
          "bodies": [
            { "id": "coil", "material": "copper", "shape": { "type": "tube", "outer": 22, "inner": 18, "height": 100 } }
          ],
          "enclosure": { "enabled": true, "padding": [45, 45, 45, 45, 60, 60] },
          "mesh": { "size": 7, "order": 1 },
          "bcs": [ { "type": "coil", "bodies": ["coil"], "current": 1, "turns": 200, "axis": [0, 0, 1] } ] }"#;
        let bytes = run_job_json(job, &mut |_, _| true).unwrap();
        let (v, _) = decode(&bytes).unwrap();
        let bmax = v["result"]["max"]["flux"].as_f64().unwrap();
        let ideal = 4e-7 * std::f64::consts::PI * 200.0 / 0.1;
        assert!(bmax > 0.6 * ideal && bmax < 1.5 * ideal, "B {bmax} vs {ideal}");
        assert!(v["magnetic"]["inductance"].as_f64().unwrap() > 0.0);
    }
}
