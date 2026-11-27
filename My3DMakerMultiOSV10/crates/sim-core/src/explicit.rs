//! Explicit dynamics (impacts, drop tests): central differences on linear tetrahedra with lumped
//! mass, corotational small-strain kinematics (large rotations), J2 plasticity, element erosion
//! by plastic strain, a rigid wall (penalty), gravity, initial velocity and fixed supports.

use crate::dense::{inv3, polar};
use crate::fem;
use crate::geom::{self, V3};
use crate::model::{enabled, kind, num, vec3, Model};
use crate::nonlinear::{j2, State};
use crate::out::Out;
use crate::Ctx;
use serde_json::json;

struct Tet { n: [usize; 4], dm_inv: [[f64; 3]; 3], v0: f64, region: usize }

pub fn run_explicit(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let mesh = &model.mesh;
    let nn = mesh.ncorner;
    let t_end = model.setting_f("endTime", 2e-3).max(1e-9);
    let erosion = model.setting_f("erosionStrain", 0.0);
    let plastic = model.setting_b("plasticity", true);
    let mut tets = Vec::new();
    let mut mass = vec![0.0; nn];
    let mut dt = f64::INFINITY;
    for e in model.solid_elements() {
        let t = mesh.tets[e];
        let n = [t[0] as usize, t[1] as usize, t[2] as usize, t[3] as usize];
        let x: Vec<V3> = n.iter().map(|&i| model.x[i]).collect();
        let dm = [[x[1][0] - x[0][0], x[2][0] - x[0][0], x[3][0] - x[0][0]], [x[1][1] - x[0][1], x[2][1] - x[0][1], x[3][1] - x[0][1]], [x[1][2] - x[0][2], x[2][2] - x[0][2], x[3][2] - x[0][2]]];
        let (dm_inv, det) = inv3(&dm).ok_or("mesh.degenerate")?;
        let v0 = det / 6.0;
        if v0 <= 0.0 { return Err("mesh.inverted".into()); }
        let r = mesh.region[e] as usize;
        let mat = &model.mats[r];
        mat.check_structural()?;
        for &i in &n { mass[i] += mat.density * v0 / 4.0; }
        // Stable step: smallest altitude / dilatational wave speed.
        let c = (mat.young * (1.0 - mat.poisson) / ((1.0 + mat.poisson) * (1.0 - 2.0 * mat.poisson) * mat.density)).sqrt();
        let area = |a: V3, b: V3, cc: V3| 0.5 * geom::norm(geom::cross(geom::sub(b, a), geom::sub(cc, a)));
        let amax = area(x[0], x[1], x[2]).max(area(x[0], x[1], x[3])).max(area(x[0], x[2], x[3])).max(area(x[1], x[2], x[3]));
        dt = dt.min(3.0 * v0 / amax / c);
        tets.push(Tet { n, dm_inv, v0, region: r });
    }
    let safety = model.setting_f("timeStepFactor", 0.6).clamp(0.05, 0.9);
    let mut dt = dt * safety;
    // Mass scaling to a requested step (adds mass to the smallest elements only through the global factor).
    if let Some(target) = model.job.settings.get("targetTimeStep").and_then(|v| v.as_f64()) {
        if target > dt { let f = (target / dt).powi(2); for m in mass.iter_mut() { *m *= f; } dt = target; }
    }
    let steps = ((t_end / dt).ceil() as usize).max(1);
    if steps > 2_000_000 { return Err("explicit.tooManySteps".into()); }
    // Supports, gravity, initial velocity, the rigid wall.
    let mut fixed = vec![false; 3 * nn];
    let mut v = vec![0.0; 3 * nn];
    let mut gravity = [0.0; 3];
    let mut wall: Option<(V3, V3, f64)> = None;
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        match kind(bc) {
            "fixed" => for node in mesh.face_nodes(&model.faces_of(bc)) { if (node as usize) < nn { for c in 0..3 { fixed[3 * node as usize + c] = true; } } },
            "gravity" => gravity = vec3(bc, "vector").unwrap_or([0.0, 0.0, -9.80665]),
            "velocity" => {
                let vel = vec3(bc, "vector").unwrap_or([0.0; 3]);
                let bodies = model.bodies_of(bc);
                for e in model.solid_elements() {
                    if !bodies.is_empty() && !bodies.contains(&mesh.region[e]) { continue; }
                    for &n in &mesh.tets[e] { for c in 0..3 { v[3 * n as usize + c] = vel[c]; } }
                }
            }
            "wall" => {
                let p = geom::scale(vec3(bc, "point").unwrap_or([0.0; 3]), model.unit());
                let n = geom::normalize(vec3(bc, "normal").unwrap_or([0.0, 0.0, 1.0]));
                wall = Some((p, n, num(bc, "friction", 0.0)));
            }
            _ => {}
        }
    }
    for i in 0..3 * nn { if fixed[i] { v[i] = 0.0; } }
    let mut x: Vec<f64> = (0..nn).flat_map(|i| model.x[i]).collect();
    let x0 = x.clone();
    let mut state = vec![State::default(); tets.len()];
    let mut alive = vec![true; tets.len()];
    let mut vm_el = vec![0.0; tets.len()];
    let frames_wanted = model.setting_u("frames", 40).clamp(2, 200);
    let every = (steps / frames_wanted).max(1);
    let mut frames = Vec::new();
    let mut energy = Vec::new();
    let mut f = vec![0.0; 3 * nn];
    let mut contact_force_hist = Vec::new();
    let mut eroded = 0usize;
    // Kinetic energy at the start; internal energy by the work of the internal forces.
    let mut internal = 0.0;
    let mut half_v = v.clone();
    for step in 0..=steps {
        // Internal forces (corotational).
        for q in f.iter_mut() { *q = 0.0; }
        for (ti, t) in tets.iter().enumerate() {
            if !alive[ti] { continue; }
            let mat = &model.mats[t.region];
            let p: Vec<V3> = t.n.iter().map(|&i| [x[3 * i], x[3 * i + 1], x[3 * i + 2]]).collect();
            let ds = [[p[1][0] - p[0][0], p[2][0] - p[0][0], p[3][0] - p[0][0]], [p[1][1] - p[0][1], p[2][1] - p[0][1], p[3][1] - p[0][1]], [p[1][2] - p[0][2], p[2][2] - p[0][2], p[3][2] - p[0][2]]];
            let mut fm = [[0.0; 3]; 3];
            for i in 0..3 { for j in 0..3 { fm[i][j] = (0..3).map(|k| ds[i][k] * t.dm_inv[k][j]).sum(); } }
            let r = polar(fm);
            // Rᵀ F − I, symmetrised.
            let mut s = [[0.0; 3]; 3];
            for i in 0..3 { for j in 0..3 { s[i][j] = (0..3).map(|k| r[k][i] * fm[k][j]).sum(); } }
            let eps = [s[0][0] - 1.0, s[1][1] - 1.0, s[2][2] - 1.0, s[0][1] + s[1][0], s[1][2] + s[2][1], s[2][0] + s[0][2]];
            let d = fem::d_iso(mat.young, mat.poisson);
            let (sig, _, ns) = j2(&d, mat.young, mat.poisson, mat.yield_strength, mat.tangent, &eps, &state[ti], plastic);
            state[ti] = ns;
            vm_el[ti] = fem::von_mises(&sig);
            if erosion > 0.0 && ns.alpha > erosion { alive[ti] = false; eroded += 1; continue; }
            // P = R σ (small strain in the rotated frame), H = −V0 P Dm⁻ᵀ.
            let st = [[sig[0], sig[3], sig[5]], [sig[3], sig[1], sig[4]], [sig[5], sig[4], sig[2]]];
            let mut pm = [[0.0; 3]; 3];
            for i in 0..3 { for j in 0..3 { pm[i][j] = (0..3).map(|k| r[i][k] * st[k][j]).sum(); } }
            let mut h = [[0.0; 3]; 3];
            for i in 0..3 { for j in 0..3 { h[i][j] = -t.v0 * (0..3).map(|k| pm[i][k] * t.dm_inv[j][k]).sum::<f64>(); } }
            for c in 0..3 {
                for i in 0..3 { f[3 * t.n[c + 1] + i] += h[i][c]; }
                for i in 0..3 { f[3 * t.n[0] + i] -= h[i][c]; }
            }
        }
        // Gravity and the wall.
        let mut wall_force = 0.0;
        for i in 0..nn {
            for c in 0..3 { f[3 * i + c] += mass[i] * gravity[c]; }
            if let Some((p, n, mu)) = wall {
                let pos = [x[3 * i], x[3 * i + 1], x[3 * i + 2]];
                let d = geom::dot(geom::sub(pos, p), n);
                if d < 0.0 && mass[i] > 0.0 {
                    let k = 0.5 * mass[i] / (dt * dt);
                    let fn_ = -k * d;
                    wall_force += fn_;
                    for c in 0..3 { f[3 * i + c] += fn_ * n[c]; }
                    if mu > 0.0 {
                        let vel = [v[3 * i], v[3 * i + 1], v[3 * i + 2]];
                        let vt = geom::sub(vel, geom::scale(n, geom::dot(vel, n)));
                        let vtn = geom::norm(vt);
                        if vtn > 1e-12 {
                            let ft = (mu * fn_).min(mass[i] * vtn / dt);
                            for c in 0..3 { f[3 * i + c] -= ft * vt[c] / vtn; }
                        }
                    }
                }
            }
        }
        if step % every == 0 || step == steps {
            let disp: Vec<f64> = (0..3 * nn).map(|i| x[i] - x0[i]).collect();
            let mut vmn = vec![0.0; nn];
            let mut cnt = vec![0.0; nn];
            for (ti, t) in tets.iter().enumerate() { if alive[ti] { for &i in &t.n { vmn[i] += vm_el[ti]; cnt[i] += 1.0; } } }
            for i in 0..nn { if cnt[i] > 0.0 { vmn[i] /= cnt[i]; } }
            let mut pe = vec![0.0; nn];
            let mut pc = vec![0.0; nn];
            for (ti, t) in tets.iter().enumerate() { for &i in &t.n { pe[i] += state[ti].alpha; pc[i] += 1.0; } }
            for i in 0..nn { if pc[i] > 0.0 { pe[i] /= pc[i]; } }
            let dv = out.f32s(&disp);
            let vv = out.f32s(&vmn);
            let pv = out.f32s(&pe);
            frames.push(json!({ "time": step as f64 * dt, "vector": dv, "vonMises": vv, "plasticStrain": pv }));
            let kinetic: f64 = (0..nn).map(|i| 0.5 * mass[i] * (v[3 * i].powi(2) + v[3 * i + 1].powi(2) + v[3 * i + 2].powi(2))).sum();
            energy.push(json!({ "time": step as f64 * dt, "kinetic": kinetic, "internal": internal }));
            contact_force_hist.push(json!({ "time": step as f64 * dt, "force": wall_force }));
            ctx.step(0.2 + 0.75 * step as f64 / steps as f64, "progress.explicit")?;
        }
        if step == steps { break; }
        // Central differences: v(n+½) = v(n−½) + dt a(n); x(n+1) = x(n) + dt v(n+½).
        for i in 0..nn {
            if mass[i] <= 0.0 { continue; }
            for c in 0..3 {
                let k = 3 * i + c;
                if fixed[k] { v[k] = 0.0; half_v[k] = 0.0; continue; }
                let a = f[k] / mass[i];
                half_v[k] = if step == 0 { v[k] + 0.5 * dt * a } else { half_v[k] + dt * a };
                let dx = dt * half_v[k];
                // Work of the internal (and wall) forces less gravity: a running estimate of the stored energy.
                internal -= (f[k] - mass[i] * gravity[c]) * dx;
                x[k] += dx;
                v[k] = half_v[k];
            }
        }
        if x.iter().any(|q| !q.is_finite()) { return Err("explicit.unstable".into()); }
    }
    let u: Vec<f64> = (0..3 * nn).map(|i| x[i] - x0[i]).collect();
    // Full-size vectors for the field writer (mid-side nodes, if any, stay at zero).
    let mut ufull = vec![0.0; 3 * mesh.nnodes()];
    ufull[..3 * nn].copy_from_slice(&u);
    let mut s = vec![[0.0; 6]; mesh.nnodes()];
    let mut cnt = vec![0.0; mesh.nnodes()];
    for (ti, t) in tets.iter().enumerate() { if alive[ti] { for &i in &t.n { s[i][0] += vm_el[ti]; cnt[i] += 1.0; } } }
    // The final von Mises as a uniaxial state (the field writer computes von Mises from it).
    for i in 0..s.len() { if cnt[i] > 0.0 { s[i][0] /= cnt[i]; } }
    let st = crate::structural::Stress { s, e: vec![[0.0; 6]; mesh.nnodes()], gp: Vec::new() };
    let res = crate::structural::put_fields(model, out, &ufull, &st, "");
    out.set("result", res);
    out.set("explicit", json!({ "timeStep": dt, "steps": steps, "frames": frames, "energy": energy, "wallForce": contact_force_hist, "eroded": eroded }));
    crate::structural::summary(model, out)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::out::decode;
    use crate::run_job_json;

    #[test]
    fn falling_block_bounces_off_the_wall() {
        let job = r#"{ "analysis": "explicit", "unit": 0.001,
          "bodies": [{ "id": "b1", "material": "aluminum", "shape": { "type": "box", "size": [20, 20, 20], "placement": { "position": [0, 0, 11] } } }],
          "mesh": { "size": 5, "order": 1 },
          "bcs": [ { "type": "velocity", "vector": [0, 0, -5] }, { "type": "wall", "point": [0, 0, 0], "normal": [0, 0, 1] } ],
          "settings": { "endTime": 0.0006, "plasticity": false } }"#;
        let (v, _) = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        let e = v["explicit"]["energy"].as_array().unwrap();
        let k0 = e[0]["kinetic"].as_f64().unwrap();
        // Mass = 2770 · 8e-6 = 0.02216 kg → ½ m v² = 0.277 J.
        assert!((k0 - 0.277).abs() < 0.01, "k0 {k0}");
        let peak = v["explicit"]["wallForce"].as_array().unwrap().iter().map(|w| w["force"].as_f64().unwrap()).fold(0.0, f64::max);
        assert!(peak > 0.0, "no contact");
    }
}
