//! Explicit dynamics (impacts, drop tests): central differences on linear tetrahedra with lumped
//! mass, corotational small-strain kinematics (large rotations), J2 plasticity, element erosion
//! by plastic strain, a rigid wall (penalty), body-to-body contact (node-to-surface penalty with
//! Coulomb friction, found through a spatial hash each step), gravity, initial velocity and fixed supports.

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
    let safety = model.setting_f("timeStepFactor", 0.6).clamp(0.05, 0.9);
    let target = model.job.settings.get("targetTimeStep").and_then(|v| v.as_f64()).filter(|v| *v > 0.0);
    let mut added = 0.0;
    let mut physical = 0.0;
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
        // Stable step: smallest altitude / dilatational wave speed.
        let c = (mat.young * (1.0 - mat.poisson) / ((1.0 + mat.poisson) * (1.0 - 2.0 * mat.poisson) * mat.density)).sqrt();
        let area = |a: V3, b: V3, cc: V3| 0.5 * geom::norm(geom::cross(geom::sub(b, a), geom::sub(cc, a)));
        let amax = area(x[0], x[1], x[2]).max(area(x[0], x[1], x[3])).max(area(x[0], x[2], x[3])).max(area(x[1], x[2], x[3]));
        let dt_e = safety * 3.0 * v0 / amax / c;
        // Selective mass scaling: only elements faster than the requested step get extra mass
        // (their step grows as √mass), so the rest of the model keeps its true inertia.
        let m_e = mat.density * v0;
        let scale = match target { Some(t) if t > dt_e => (t / dt_e).powi(2), _ => 1.0 };
        physical += m_e;
        added += m_e * (scale - 1.0);
        for &i in &n { mass[i] += scale * m_e / 4.0; }
        dt = dt.min(dt_e * scale.sqrt());
        tets.push(Tet { n, dm_inv, v0, region: r });
    }
    let added_fraction = added / physical.max(1e-300);
    if added_fraction > 0.05 { out.note(&format!("explicit.addedMass:{:.1}", 100.0 * added_fraction)); }
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
    let contact = BodyContact::new(model, model.setting_b("bodyContact", true));
    let probes = model.probe_nodes(|| {
        // The node that starts fastest (the impactor), else node 0.
        (0..nn).max_by(|&a, &b| { let va = v[3 * a].powi(2) + v[3 * a + 1].powi(2) + v[3 * a + 2].powi(2); let vb = v[3 * b].powi(2) + v[3 * b + 1].powi(2) + v[3 * b + 2].powi(2); va.partial_cmp(&vb).unwrap() }).unwrap_or(0)
    });
    let mut probe_hist: Vec<Vec<[f64; 3]>> = probes.iter().map(|_| Vec::new()).collect();
    let mut probe_times = Vec::new();
    let mut body_force_hist = Vec::new();
    let mut body_peak = 0.0f64;
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
    let mut distorted = 0usize;
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
            // An element squeezed to a tenth of its volume (or turned inside out) cannot carry load any
            // more: it is removed like an eroded one, which keeps the explicit solution stable.
            let jdet = fm[0][0] * (fm[1][1] * fm[2][2] - fm[1][2] * fm[2][1]) - fm[0][1] * (fm[1][0] * fm[2][2] - fm[1][2] * fm[2][0]) + fm[0][2] * (fm[1][0] * fm[2][1] - fm[1][1] * fm[2][0]);
            if !(jdet > 0.1) { alive[ti] = false; eroded += 1; distorted += 1; continue; }
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
        body_peak = body_peak.max(contact.apply(&x, &v, &mass, dt, &mut f));
        if step % every == 0 || step == steps {
            probe_times.push(step as f64 * dt);
            for (pi, &pn) in probes.iter().enumerate() { probe_hist[pi].push([x[3 * pn] - x0[3 * pn], x[3 * pn + 1] - x0[3 * pn + 1], x[3 * pn + 2] - x0[3 * pn + 2]]); }
            // The largest contact force since the previous frame (impacts are shorter than a frame).
            body_force_hist.push(json!({ "time": step as f64 * dt, "force": body_peak }));
            body_peak = 0.0;
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
    if distorted > 0 { out.note(&format!("explicit.distorted:{distorted}")); }
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
    out.set("explicit", json!({ "timeStep": dt, "steps": steps, "frames": frames, "energy": energy, "wallForce": contact_force_hist, "eroded": eroded, "addedMass": added_fraction,
        "bodyContact": contact.active(), "contactForce": body_force_hist, "probeTimes": probe_times,
        "probes": probes.iter().zip(probe_hist.iter()).map(|(&pn, h)| json!({ "node": pn, "point": mesh.nodes[pn], "history": [h.iter().map(|d| d[0]).collect::<Vec<_>>(), h.iter().map(|d| d[1]).collect::<Vec<_>>(), h.iter().map(|d| d[2]).collect::<Vec<_>>()] })).collect::<Vec<_>>() }));
    crate::structural::summary(model, out)?;
    Ok(())
}

/// Node-to-surface penalty contact between different bodies (and across split contact interfaces).
struct BodyContact {
    /// Surface triangles (corner nodes) with their body.
    tris: Vec<([usize; 3], u32)>,
    /// Surface nodes with their body.
    nodes: Vec<(usize, u32)>,
    /// Friction coefficient of a body pair (row-major by region).
    mu: Vec<f64>,
    nb: usize,
    /// Search cell and the deepest penetration still treated as contact (m).
    cell: f64,
    depth: f64,
    /// Penalty factor: k = factor · m_eff / dt² (stable well below 4; several nodes can press on one).
    factor: f64,
}

impl BodyContact {
    fn new(model: &Model, enabled: bool) -> BodyContact {
        let mesh = &model.mesh;
        let nb = model.bodies.len();
        let mut tris = Vec::new();
        let mut nodes = Vec::new();
        let default_mu = model.setting_f("contactFriction", 0.0);
        let mut mu = vec![default_mu; nb * nb];
        // Pairs that were meshed apart (non-bonded contacts): their interface triangles take part.
        let mut split = std::collections::HashSet::new();
        for (i, c) in model.job.contacts.iter().enumerate() {
            if let (Some(a), Some(b)) = (model.body_index(&c.a), model.body_index(&c.b)) {
                if model.contact_ids.contains(&i) { split.insert((a, b)); split.insert((b, a)); }
                mu[a as usize * nb + b as usize] = c.friction;
                mu[b as usize * nb + a as usize] = c.friction;
            }
        }
        if enabled && nb > 1 {
            let mut seen = std::collections::HashSet::new();
            for (ti, t) in mesh.tris.iter().enumerate() {
                let (r, o) = (mesh.tri_region[ti], mesh.tri_other[ti]);
                if !model.is_body(r) { continue; }
                let outside = o == crate::mesh::NONE || o == model.air;
                if !outside && !split.contains(&(r, o)) { continue; }
                let c = [t[0] as usize, t[1] as usize, t[2] as usize];
                if c.iter().any(|&q| q >= mesh.ncorner) { continue; }
                tris.push((c, r));
                for &q in &c { if seen.insert(q) { nodes.push((q, r)); } }
            }
        }
        let h = mesh.h * model.unit();
        BodyContact { tris, nodes, mu, nb, cell: 2.0 * h, depth: 0.75 * h, factor: model.setting_f("contactStiffness", 0.1).clamp(0.01, 1.0) }
    }

    fn active(&self) -> bool { !self.tris.is_empty() }

    /// Adds the contact forces; returns the total normal force.
    fn apply(&self, x: &[f64], v: &[f64], mass: &[f64], dt: f64, f: &mut [f64]) -> f64 {
        if self.tris.is_empty() { return 0.0; }
        let p = |i: usize| -> V3 { [x[3 * i], x[3 * i + 1], x[3 * i + 2]] };
        let key = |q: V3| -> (i64, i64, i64) { ((q[0] / self.cell).floor() as i64, (q[1] / self.cell).floor() as i64, (q[2] / self.cell).floor() as i64) };
        // Triangles into every cell their (padded) box touches.
        let mut grid: std::collections::HashMap<(i64, i64, i64), Vec<u32>> = std::collections::HashMap::new();
        for (ti, (t, _)) in self.tris.iter().enumerate() {
            let (a, b, c) = (p(t[0]), p(t[1]), p(t[2]));
            let lo = key([a[0].min(b[0]).min(c[0]) - self.depth, a[1].min(b[1]).min(c[1]) - self.depth, a[2].min(b[2]).min(c[2]) - self.depth]);
            let hi = key([a[0].max(b[0]).max(c[0]) + self.depth, a[1].max(b[1]).max(c[1]) + self.depth, a[2].max(b[2]).max(c[2]) + self.depth]);
            // A triangle stretched over many cells means the solution is blowing up: leave it out.
            if hi.0 - lo.0 > 16 || hi.1 - lo.1 > 16 || hi.2 - lo.2 > 16 { continue; }
            for i in lo.0..=hi.0 { for j in lo.1..=hi.1 { for k in lo.2..=hi.2 { grid.entry((i, j, k)).or_default().push(ti as u32); } } }
        }
        let mut total = 0.0;
        for &(nd, body) in &self.nodes {
            if mass[nd] <= 0.0 { continue; }
            let q = p(nd);
            let Some(list) = grid.get(&key(q)) else { continue };
            // The deepest penetration over the candidate triangles of other bodies.
            let mut best: Option<(f64, V3, [f64; 3], usize)> = None;
            for &ti in list {
                let (t, r) = &self.tris[ti as usize];
                if *r == body || t.contains(&nd) { continue; }
                let (a, b, c) = (p(t[0]), p(t[1]), p(t[2]));
                let nrm = geom::cross(geom::sub(b, a), geom::sub(c, a));
                let len = geom::norm(nrm);
                if len <= 0.0 { continue; }
                let n = geom::scale(nrm, 1.0 / len);
                let d = geom::dot(geom::sub(q, a), n);
                if d >= 0.0 || d < -self.depth { continue; }
                // Barycentric coordinates of the projection; it must fall on the triangle.
                let pr = geom::sub(q, geom::scale(n, d));
                let (v0, v1, v2) = (geom::sub(b, a), geom::sub(c, a), geom::sub(pr, a));
                let (d00, d01, d11, d20, d21) = (geom::dot(v0, v0), geom::dot(v0, v1), geom::dot(v1, v1), geom::dot(v2, v0), geom::dot(v2, v1));
                let den = d00 * d11 - d01 * d01;
                if den <= 0.0 { continue; }
                let wb = (d11 * d20 - d01 * d21) / den;
                let wc = (d00 * d21 - d01 * d20) / den;
                let wa = 1.0 - wb - wc;
                let tol = -0.02;
                if wa < tol || wb < tol || wc < tol { continue; }
                if best.map(|b| d < b.0).unwrap_or(true) { best = Some((d, n, [wa, wb, wc], ti as usize)); }
            }
            let Some((d, n, w, ti)) = best else { continue };
            let (t, r) = &self.tris[ti];
            let mt: f64 = (0..3).map(|k| w[k] * mass[t[k]]).sum();
            let meff = mass[nd] * mt / (mass[nd] + mt).max(1e-300);
            let k = self.factor * meff / (dt * dt);
            let vs: V3 = [0, 1, 2].map(|c| v[3 * nd + c] - (0..3).map(|k| w[k] * v[3 * t[k] + c]).sum::<f64>());
            // Normal force: the penalty plus damping of the approach (half critical), never pulling.
            let vn = geom::dot(vs, n);
            let fn_ = (-k * d - (k * meff).sqrt() * vn).max(0.0);
            total += fn_;
            let mut force = geom::scale(n, fn_);
            let mu = self.mu[body as usize * self.nb + *r as usize];
            if mu > 0.0 {
                let vt = geom::sub(vs, geom::scale(n, geom::dot(vs, n)));
                let vtn = geom::norm(vt);
                if vtn > 1e-12 {
                    let ft = (mu * fn_).min(meff * vtn / dt);
                    force = geom::sub(force, geom::scale(vt, ft / vtn));
                }
            }
            for c in 0..3 {
                f[3 * nd + c] += force[c];
                for k2 in 0..3 { f[3 * t[k2] + c] -= w[k2] * force[c]; }
            }
        }
        total
    }
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

    #[test]
    fn block_hits_a_plate_body() {
        // A block falls onto a supported plate (a second body): body-to-body contact stops it.
        let job = r#"{ "analysis": "explicit", "unit": 0.001,
          "bodies": [
            { "id": "plate", "material": "steel", "shape": { "type": "box", "size": [40, 40, 6], "placement": { "position": [0, 0, -3] } } },
            { "id": "blk", "material": "aluminum", "shape": { "type": "box", "size": [12, 12, 12], "placement": { "position": [0, 0, 12] } } }
          ],
          "mesh": { "size": 3, "order": 1 },
          "bcs": [ { "type": "fixed", "faces": [{ "body": "plate", "c": [0, 0, -6], "n": [0, 0, -1], "a": 1600 }] },
                   { "type": "velocity", "vector": [0, 0, -10], "bodies": ["blk"] } ],
          "probes": [[0, 0, 18]],
          "settings": { "endTime": 0.001, "plasticity": false } }"#;
        let (v, _) = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        assert_eq!(v["explicit"]["bodyContact"], true);
        let peak = v["explicit"]["contactForce"].as_array().unwrap().iter().map(|w| w["force"].as_f64().unwrap()).fold(0.0, f64::max);
        assert!(peak > 10.0, "contact force {peak}");
        // Without contact the block would move 10 mm down in 1 ms (6 mm gap); with it far less.
        let h = &v["explicit"]["probes"][0]["history"][2];
        let last = h.as_array().unwrap().last().unwrap().as_f64().unwrap();
        assert!(last > -7.5e-3, "block passed through the plate: {last}");
    }
}
