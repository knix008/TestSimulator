//! Rigid body dynamics: every body is rigid (six degrees of freedom: its centre of gravity and its
//! orientation), connected by joints (fixed, revolute, spherical — to the ground or to another body) and
//! springs with dampers, loaded by gravity, forces and moments on faces, started with a velocity or a
//! spin. Each step solves Newton–Euler with the joints as constraints (Lagrange multipliers, Baumgarte
//! stabilisation), then projects the velocities back onto the joints so they do not drift.
//!
//! Masses, centres of gravity and inertia tensors come from each body's mesh (exact tetrahedron
//! integrals). The result: the motion of every body over time, the joint forces, an animation of the
//! mesh moving rigidly, and the final displacement and velocity of every node.

use crate::dense;
use crate::geom::{self, V3};
use crate::model::{enabled, kind, num, vec3, Model};
use crate::out::Out;
use crate::Ctx;
use serde_json::{json, Value};

type M3 = [[f64; 3]; 3];

fn mat_vec(m: &M3, v: V3) -> V3 { [0, 1, 2].map(|i| m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) }
fn mat_mul(a: &M3, b: &M3) -> M3 { let mut c = [[0.0; 3]; 3]; for i in 0..3 { for j in 0..3 { c[i][j] = (0..3).map(|k| a[i][k] * b[k][j]).sum(); } } c }
fn transpose(a: &M3) -> M3 { let mut c = [[0.0; 3]; 3]; for i in 0..3 { for j in 0..3 { c[i][j] = a[j][i]; } } c }

/// Rotation matrix of a unit quaternion [w, x, y, z].
fn quat_mat(q: [f64; 4]) -> M3 {
    let [w, x, y, z] = q;
    [[1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y - w * z), 2.0 * (x * z + w * y)],
     [2.0 * (x * y + w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z - w * x)],
     [2.0 * (x * z - w * y), 2.0 * (y * z + w * x), 1.0 - 2.0 * (x * x + y * y)]]
}

/// q ← q + ½ h (0, ω) q, normalised (ω in world coordinates).
fn quat_step(q: [f64; 4], w: V3, h: f64) -> [f64; 4] {
    let [qw, qx, qy, qz] = q;
    let d = [-w[0] * qx - w[1] * qy - w[2] * qz, w[0] * qw + w[1] * qz - w[2] * qy, -w[0] * qz + w[1] * qw + w[2] * qx, w[0] * qy - w[1] * qx + w[2] * qw];
    let n = [qw + 0.5 * h * d[0], qx + 0.5 * h * d[1], qy + 0.5 * h * d[2], qz + 0.5 * h * d[3]];
    let l = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] + n[3] * n[3]).sqrt();
    n.map(|v| v / l)
}

/// Rotation vector (axis × angle) of a rotation matrix.
fn rot_vector(r: &M3) -> V3 {
    let c = ((r[0][0] + r[1][1] + r[2][2] - 1.0) / 2.0).clamp(-1.0, 1.0);
    let a = c.acos();
    let v = [r[2][1] - r[1][2], r[0][2] - r[2][0], r[1][0] - r[0][1]];
    if a < 1e-9 { return geom::scale(v, 0.5); }
    geom::scale(v, a / (2.0 * a.sin()))
}

#[derive(Clone)]
struct Body { mass: f64, cg0: V3, inertia0: M3, x: V3, q: [f64; 4], v: V3, w: V3 }

impl Body {
    fn rot(&self) -> M3 { quat_mat(self.q) }
    fn inertia(&self) -> M3 { let r = self.rot(); mat_mul(&mat_mul(&r, &self.inertia0), &transpose(&r)) }
}

/// A joint between body a and body b (None: the ground). Offsets and directions are in each body's
/// own frame (its orientation at the start), or in world coordinates for the ground.
struct Joint { id: Value, kind: String, a: usize, b: Option<usize>, ra: V3, rb: V3, axis_a: V3, frame_b: [V3; 3] }

struct Spring { a: usize, b: Option<usize>, ra: V3, rb: V3, k: f64, c: f64, length: f64 }

pub fn run_rigid(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let mesh = &model.mesh;
    let nb = model.bodies.len();
    // Mass, centre of gravity and inertia of each body from its elements.
    let mut mass = vec![0.0; nb];
    let mut first = vec![[0.0; 3]; nb];
    let mut second = vec![[[0.0; 3]; 3]; nb];
    for e in model.solid_elements() {
        let r = mesh.region[e] as usize;
        let rho = model.mats[r].density;
        let t = mesh.tets[e];
        let p: Vec<V3> = t.iter().map(|&i| model.x[i as usize]).collect();
        let vol = crate::mesh::volume(p[0], p[1], p[2], p[3]).abs();
        let s = [0, 1, 2].map(|k| p.iter().map(|q| q[k]).sum::<f64>());
        mass[r] += rho * vol;
        for k in 0..3 { first[r][k] += rho * vol * s[k] / 4.0; }
        // ∫ x xᵀ dV over a tetrahedron = V/20 (Σ xₐ xₐᵀ + s sᵀ).
        for i in 0..3 { for j in 0..3 { second[r][i][j] += rho * vol / 20.0 * (p.iter().map(|q| q[i] * q[j]).sum::<f64>() + s[i] * s[j]); } }
    }
    let mut bodies: Vec<Body> = (0..nb).map(|r| {
        let m = mass[r].max(1e-30);
        let cg = geom::scale(first[r], 1.0 / m);
        // Inertia about the centre: I = tr(S) 1 − S with S the second moment about it.
        let mut sc = second[r];
        for i in 0..3 { for j in 0..3 { sc[i][j] -= m * cg[i] * cg[j]; } }
        let tr = sc[0][0] + sc[1][1] + sc[2][2];
        let mut inertia = [[0.0; 3]; 3];
        for i in 0..3 { for j in 0..3 { inertia[i][j] = if i == j { tr } else { 0.0 } - sc[i][j]; } }
        Body { mass: m, cg0: cg, inertia0: inertia, x: cg, q: [1.0, 0.0, 0.0, 0.0], v: [0.0; 3], w: [0.0; 3] }
    }).collect();
    if mass.iter().any(|m| *m <= 0.0) { return Err("rigid.noMass".into()); }
    let unit = model.unit();
    let point_of = |bc: &Value, key: &str| vec3(bc, key).map(|p| geom::scale(p, unit));
    let mut gravity = [0.0; 3];
    let mut joints = Vec::new();
    let mut springs = Vec::new();
    let mut loads: Vec<(usize, V3, V3, V3)> = Vec::new(); // body, force, moment, point (world)
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        let bl: Vec<usize> = model.bodies_of(bc).into_iter().map(|r| r as usize).collect();
        match kind(bc) {
            "gravity" => gravity = vec3(bc, "vector").unwrap_or([0.0, 0.0, -9.80665]),
            "velocity" => { let v = vec3(bc, "vector").unwrap_or([0.0; 3]); for &b in &bl { bodies[b].v = v; } }
            "angularVelocity" => { let w = vec3(bc, "vector").unwrap_or([0.0; 3]); for &b in &bl { bodies[b].w = w; } }
            "joint" => {
                let Some(&a) = bl.first() else { continue };
                let b = bl.get(1).copied();
                let p = point_of(bc, "point").unwrap_or(bodies[a].cg0);
                let axis = geom::normalize(vec3(bc, "axis").unwrap_or([0.0, 0.0, 1.0]));
                let (e1, e2) = perpendiculars(axis);
                let jk = bc.get("joint").and_then(|v| v.as_str()).unwrap_or("revolute").to_string();
                joints.push(Joint {
                    id: bc.get("id").cloned().unwrap_or(Value::Null), kind: jk, a, b,
                    ra: geom::sub(p, bodies[a].cg0), rb: b.map(|b| geom::sub(p, bodies[b].cg0)).unwrap_or(p),
                    axis_a: axis, frame_b: [axis, e1, e2],
                });
            }
            "spring" => {
                let Some(&a) = bl.first() else { continue };
                let b = bl.get(1).copied();
                let pa = point_of(bc, "pointA").unwrap_or(bodies[a].cg0);
                let pb = point_of(bc, "pointB").unwrap_or_else(|| b.map(|b| bodies[b].cg0).unwrap_or([0.0; 3]));
                let length = num(bc, "length", -1.0);
                springs.push(Spring {
                    a, b, ra: geom::sub(pa, bodies[a].cg0), rb: b.map(|b| geom::sub(pb, bodies[b].cg0)).unwrap_or(pb),
                    k: num(bc, "stiffness", 1e4), c: num(bc, "damping", 0.0), length: if length >= 0.0 { length * unit } else { geom::norm(geom::sub(pb, pa)) },
                });
            }
            "force" | "moment" => {
                // Faces' total force (or moment) acting on their body, at the faces' area centroid.
                let faces = model.faces_of(bc);
                let Some(&f0) = faces.first() else { continue };
                let body = model.mesh.faces[f0].region as usize;
                if body >= nb { continue; }
                let wts = model.face_weights(&faces);
                let total: f64 = wts.iter().map(|w| w.1).sum();
                let mut c = [0.0; 3];
                for (n, w, _) in &wts { for k in 0..3 { c[k] += model.x[*n as usize][k] * w / total.max(1e-300); } }
                let v = vec3(bc, "vector").unwrap_or([0.0; 3]);
                if kind(bc) == "force" { loads.push((body, v, [0.0; 3], c)); } else { loads.push((body, [0.0; 3], v, c)); }
            }
            _ => {}
        }
    }
    let t_end = model.setting_f("endTime", 1.0).max(1e-9);
    let frames_wanted = model.setting_u("frames", 60).clamp(2, 400);
    let mut h = model.setting_f("timeStep", 0.0);
    if !(h > 0.0) { h = (t_end / 2000.0).min(1e-3); }
    let steps = ((t_end / h).ceil() as usize).clamp(1, 2_000_000);
    let h = t_end / steps as f64;
    let every = (steps / frames_wanted).max(1);
    // Corner nodes of each body (for the animation and the fields).
    let nc = mesh.ncorner;
    let mut node_body = vec![usize::MAX; nc];
    for e in model.solid_elements() { for &n in &mesh.tets[e] { if node_body[n as usize] == usize::MAX { node_body[n as usize] = mesh.region[e] as usize; } } }
    // Default probe: the node farthest from the first joint (or from the first body's centre).
    let probes = model.probe_nodes(|| {
        let origin = joints.first().map(|j| geom::add(bodies[j.a].cg0, j.ra)).unwrap_or(bodies[0].cg0);
        (0..nc).filter(|&i| node_body[i] != usize::MAX).max_by(|&a, &b| geom::norm(geom::sub(model.x[a], origin)).partial_cmp(&geom::norm(geom::sub(model.x[b], origin))).unwrap()).unwrap_or(0)
    });
    let mut frames = Vec::new();
    let mut history: Vec<Value> = Vec::new();
    let mut joint_hist: Vec<Vec<f64>> = joints.iter().map(|_| Vec::new()).collect();
    let mut times = Vec::new();
    let mut probe_hist: Vec<[Vec<f64>; 3]> = probes.iter().map(|_| [Vec::new(), Vec::new(), Vec::new()]).collect();
    let n6 = 6 * nb;

    for step in 0..=steps {
        let t = step as f64 * h;
        // Forces and torques (world) on each body's centre.
        let mut f = vec![0.0; n6];
        for (i, b) in bodies.iter().enumerate() {
            for k in 0..3 { f[6 * i + k] += b.mass * gravity[k]; }
            let iw = mat_vec(&b.inertia(), b.w);
            let gyro = geom::cross(b.w, iw);
            for k in 0..3 { f[6 * i + 3 + k] -= gyro[k]; }
        }
        for &(bi, fv, mv, p0) in &loads {
            let b = &bodies[bi];
            // The point moves with the body.
            let p = geom::add(b.x, mat_vec(&b.rot(), geom::sub(p0, b.cg0)));
            let tq = geom::add(mv, geom::cross(geom::sub(p, b.x), fv));
            for k in 0..3 { f[6 * bi + k] += fv[k]; f[6 * bi + 3 + k] += tq[k]; }
        }
        for s in &springs {
            let (pa, va) = point_state(&bodies[s.a], s.ra);
            let (pb, vb) = match s.b { Some(b) => point_state(&bodies[b], s.rb), None => (s.rb, [0.0; 3]) };
            let d = geom::sub(pb, pa);
            let l = geom::norm(d);
            if l < 1e-12 { continue; }
            let n = geom::scale(d, 1.0 / l);
            let fs = s.k * (l - s.length) + s.c * geom::dot(geom::sub(vb, va), n);
            let fa = geom::scale(n, fs);
            apply_point_force(&mut f, &bodies, s.a, pa, fa);
            if let Some(b) = s.b { apply_point_force(&mut f, &bodies, b, pb, geom::scale(fa, -1.0)); }
        }
        // Constraints: J (rows × 6n), C (position error), Jdot·v.
        let (jac, cerr) = constraints(&bodies, &joints);
        let m = cerr.len();
        let jv: Vec<f64> = (0..m).map(|r| (0..n6).map(|c| jac[r * n6 + c] * vel(&bodies, c)).sum()).collect();
        // Jdot·v by differencing J along the motion.
        let eps = 1e-6;
        let moved: Vec<Body> = bodies.iter().map(|b| Body { x: geom::add(b.x, geom::scale(b.v, eps)), q: quat_step(b.q, b.w, eps), ..b.clone() }).collect();
        let (jac2, _) = constraints(&moved, &joints);
        let jdv: Vec<f64> = (0..m).map(|r| (0..n6).map(|c| (jac2[r * n6 + c] - jac[r * n6 + c]) / eps * vel(&bodies, c)).sum()).collect();
        // KKT: [M −Jᵀ; J ε] [a; λ] = [f; −J̇v − 2ζω₀ Jv − ω₀² C].
        let w0 = 0.2 / h;
        let size = n6 + m;
        let mut a = vec![0.0; size * size];
        let mut rhs = vec![0.0; size];
        for (i, b) in bodies.iter().enumerate() {
            for k in 0..3 { a[(6 * i + k) * size + 6 * i + k] = b.mass; }
            let iw = b.inertia();
            for p in 0..3 { for q in 0..3 { a[(6 * i + 3 + p) * size + 6 * i + 3 + q] = iw[p][q]; } }
        }
        for r in 0..m {
            for c in 0..n6 {
                a[c * size + n6 + r] = -jac[r * n6 + c];
                a[(n6 + r) * size + c] = jac[r * n6 + c];
            }
            a[(n6 + r) * size + n6 + r] = 1e-12;
            rhs[n6 + r] = -jdv[r] - 2.0 * w0 * jv[r] - w0 * w0 * cerr[r];
        }
        rhs[..n6].copy_from_slice(&f);
        let sol = dense::solve(&a, &rhs, size).ok_or("rigid.singular")?;
        let lambda = &sol[n6..];
        // Output (before the step).
        if step % every == 0 || step == steps {
            times.push(t);
            let disp = node_displacements(model, &bodies, &node_body);
            for (pi, &pn) in probes.iter().enumerate() { for k in 0..3 { probe_hist[pi][k].push(disp[3 * pn + k]); } }
            let dv = out.f32s(&disp);
            frames.push(json!({ "time": t, "vector": dv }));
            let kinetic: f64 = bodies.iter().map(|b| 0.5 * b.mass * geom::dot(b.v, b.v) + 0.5 * geom::dot(b.w, mat_vec(&b.inertia(), b.w))).sum();
            let potential: f64 = bodies.iter().map(|b| -b.mass * geom::dot(gravity, b.x)).sum::<f64>()
                + springs.iter().map(|s| { let pa = point_state(&bodies[s.a], s.ra).0; let pb = match s.b { Some(b) => point_state(&bodies[b], s.rb).0, None => s.rb }; 0.5 * s.k * (geom::norm(geom::sub(pb, pa)) - s.length).powi(2) }).sum::<f64>();
            history.push(json!({ "time": t, "kinetic": kinetic, "potential": potential,
                "bodies": bodies.iter().map(|b| json!({ "position": b.x, "velocity": b.v, "angle": geom::norm(rot_vector(&b.rot())), "omega": b.w })).collect::<Vec<_>>() }));
            let mut row = 0;
            for (ji, j) in joints.iter().enumerate() {
                let rows = joint_rows(j);
                let force = (row..row + 3).map(|r| lambda[r] * lambda[r]).sum::<f64>().sqrt();
                joint_hist[ji].push(force);
                row += rows;
            }
            ctx.step(0.1 + 0.85 * t / t_end, "progress.rigid")?;
        }
        if step == steps { break; }
        // Semi-implicit Euler, then the velocities projected back onto the joints.
        for (i, b) in bodies.iter_mut().enumerate() {
            for k in 0..3 { b.v[k] += h * sol[6 * i + k]; b.w[k] += h * sol[6 * i + 3 + k]; }
        }
        project_velocities(&mut bodies, &joints);
        for b in bodies.iter_mut() {
            b.x = geom::add(b.x, geom::scale(b.v, h));
            b.q = quat_step(b.q, b.w, h);
        }
        if bodies.iter().any(|b| !b.x.iter().all(|v| v.is_finite())) { return Err("rigid.unstable".into()); }
    }
    // Fields at the end: displacement and speed of every node.
    let disp = node_displacements(model, &bodies, &node_body);
    let speed: Vec<f64> = (0..nc).map(|n| {
        let b = node_body[n];
        if b == usize::MAX { return 0.0; }
        let rho = mat_vec(&bodies[b].rot(), geom::sub(model.x[n], bodies[b].cg0));
        geom::norm(geom::add(bodies[b].v, geom::cross(bodies[b].w, rho)))
    }).collect();
    let total: Vec<f64> = (0..nc).map(|i| (disp[3 * i].powi(2) + disp[3 * i + 1].powi(2) + disp[3 * i + 2].powi(2)).sqrt()).collect();
    let dmax = total.iter().cloned().fold(0.0, f64::max);
    let fields = json!({ "displacement": out.f32s(&total), "vector": out.f32s(&disp), "rigidSpeed": out.f32s(&speed) });
    out.set("result", json!({ "fields": fields, "max": { "displacement": dmax, "rigidSpeed": speed.iter().cloned().fold(0.0, f64::max) } }));
    out.set("rigid", json!({
        "times": times, "frames": frames, "history": history, "timeStep": h, "steps": steps,
        "bodies": bodies.iter().enumerate().map(|(i, b)| json!({ "id": model.bodies[i].id, "mass": b.mass, "cg": geom::scale(b.cg0, 1.0 / unit), "inertia": b.inertia0 })).collect::<Vec<_>>(),
        "joints": joints.iter().zip(joint_hist.iter()).map(|(j, h)| json!({ "id": j.id, "kind": j.kind, "force": h })).collect::<Vec<_>>(),
        "probes": probes.iter().zip(probe_hist.iter()).map(|(&pn, h)| json!({ "node": pn, "point": mesh.nodes[pn], "history": h })).collect::<Vec<_>>(),
    }));
    crate::structural::summary(model, out)?;
    Ok(())
}

fn perpendiculars(a: V3) -> (V3, V3) {
    let t = if a[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
    let e1 = geom::normalize(geom::cross(a, t));
    (e1, geom::cross(a, e1))
}

fn vel(bodies: &[Body], c: usize) -> f64 { let b = &bodies[c / 6]; let k = c % 6; if k < 3 { b.v[k] } else { b.w[k - 3] } }

/// Position and velocity of a point fixed to a body (offset r in the body's frame).
fn point_state(b: &Body, r: V3) -> (V3, V3) {
    let rho = mat_vec(&b.rot(), r);
    (geom::add(b.x, rho), geom::add(b.v, geom::cross(b.w, rho)))
}

fn apply_point_force(f: &mut [f64], bodies: &[Body], i: usize, p: V3, force: V3) {
    let tq = geom::cross(geom::sub(p, bodies[i].x), force);
    for k in 0..3 { f[6 * i + k] += force[k]; f[6 * i + 3 + k] += tq[k]; }
}

fn joint_rows(j: &Joint) -> usize { match j.kind.as_str() { "fixed" => 6, "spherical" => 3, _ => 5 } }

/// The joints' Jacobian (rows × 6n, row-major) and position errors.
fn constraints(bodies: &[Body], joints: &[Joint]) -> (Vec<f64>, Vec<f64>) {
    let n6 = 6 * bodies.len();
    let rows: usize = joints.iter().map(joint_rows).sum();
    let mut jac = vec![0.0; rows * n6];
    let mut err = vec![0.0; rows];
    let mut r = 0;
    for j in joints {
        let ba = &bodies[j.a];
        let ra = ba.rot();
        let rho_a = mat_vec(&ra, j.ra);
        let pa = geom::add(ba.x, rho_a);
        let (pb, rho_b, rb_mat) = match j.b {
            Some(b) => { let bb = &bodies[b]; let rm = bb.rot(); let rho = mat_vec(&rm, j.rb); (geom::add(bb.x, rho), rho, rm) }
            None => (j.rb, [0.0; 3], [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]),
        };
        // Point: x_a + ρ_a − x_b − ρ_b = 0;  J_a = [1, −[ρ_a]×], J_b = [−1, [ρ_b]×].
        for k in 0..3 {
            let row = (r + k) * n6;
            jac[row + 6 * j.a + k] = 1.0;
            // −[ρ]× column-wise: (ω × ρ)_k = (ρ × eₘ)… written out: d(ω×ρ)/dω = −[ρ]×.
            let skew = [[0.0, rho_a[2], -rho_a[1]], [-rho_a[2], 0.0, rho_a[0]], [rho_a[1], -rho_a[0], 0.0]];
            for m in 0..3 { jac[row + 6 * j.a + 3 + m] = skew[k][m]; }
            if let Some(b) = j.b {
                jac[row + 6 * b + k] = -1.0;
                let skb = [[0.0, rho_b[2], -rho_b[1]], [-rho_b[2], 0.0, rho_b[0]], [rho_b[1], -rho_b[0], 0.0]];
                for m in 0..3 { jac[row + 6 * b + 3 + m] = -skb[k][m]; }
            }
            err[r + k] = pa[k] - pb[k];
        }
        r += 3;
        let frame_b: [V3; 3] = [mat_vec(&rb_mat, j.frame_b[0]), mat_vec(&rb_mat, j.frame_b[1]), mat_vec(&rb_mat, j.frame_b[2])];
        match j.kind.as_str() {
            "spherical" => {}
            "fixed" => {
                // Relative rotation zero: (ω_a − ω_b) = 0, error the rotation vector of R_a R_bᵀ.
                let rel = rot_vector(&mat_mul(&ra, &transpose(&rb_mat)));
                for k in 0..3 {
                    let row = (r + k) * n6;
                    jac[row + 6 * j.a + 3 + k] = 1.0;
                    if let Some(b) = j.b { jac[row + 6 * b + 3 + k] = -1.0; }
                    err[r + k] = rel[k];
                }
                r += 3;
            }
            _ => {
                // Revolute: the axis of a stays along the axis of b: a_a · e₁ = a_a · e₂ = 0.
                let aa = mat_vec(&ra, j.axis_a);
                for (k, e) in [frame_b[1], frame_b[2]].iter().enumerate() {
                    let row = (r + k) * n6;
                    let g = geom::cross(aa, *e);
                    for m in 0..3 { jac[row + 6 * j.a + 3 + m] = g[m]; }
                    if let Some(b) = j.b { for m in 0..3 { jac[row + 6 * b + 3 + m] = -g[m]; } }
                    err[r + k] = geom::dot(aa, *e);
                }
                r += 2;
            }
        }
    }
    (jac, err)
}

/// Removes the velocity components the joints forbid: v ← v − M⁻¹Jᵀ (J M⁻¹ Jᵀ)⁻¹ J v.
fn project_velocities(bodies: &mut [Body], joints: &[Joint]) {
    if joints.is_empty() { return; }
    let n6 = 6 * bodies.len();
    let (jac, _) = constraints(bodies, joints);
    let m = jac.len() / n6;
    // M⁻¹ per body (mass, world inertia inverse).
    let inv: Vec<(f64, M3)> = bodies.iter().map(|b| (1.0 / b.mass, dense::inv3(&b.inertia()).map(|x| x.0).unwrap_or([[0.0; 3]; 3]))).collect();
    let minv_col = |col: &[f64]| -> Vec<f64> {
        // M⁻¹ times a column of Jᵀ (length 6n).
        let mut o = vec![0.0; n6];
        for (i, (im, ii)) in inv.iter().enumerate() {
            for k in 0..3 { o[6 * i + k] = im * col[6 * i + k]; }
            for p in 0..3 { o[6 * i + 3 + p] = (0..3).map(|q| ii[p][q] * col[6 * i + 3 + q]).sum(); }
        }
        o
    };
    let rows: Vec<Vec<f64>> = (0..m).map(|r| jac[r * n6..(r + 1) * n6].to_vec()).collect();
    let mj: Vec<Vec<f64>> = rows.iter().map(|row| minv_col(row)).collect();
    let mut a = vec![0.0; m * m];
    for i in 0..m { for k in 0..m { a[i * m + k] = (0..n6).map(|c| rows[i][c] * mj[k][c]).sum::<f64>(); } a[i * m + i] += 1e-12; }
    let jv: Vec<f64> = rows.iter().map(|row| (0..n6).map(|c| row[c] * vel(bodies, c)).sum()).collect();
    let Some(mu) = dense::solve(&a, &jv, m) else { return };
    for c in 0..n6 {
        let dv: f64 = (0..m).map(|r| mj[r][c] * mu[r]).sum();
        let b = &mut bodies[c / 6];
        let k = c % 6;
        if k < 3 { b.v[k] -= dv; } else { b.w[k - 3] -= dv; }
    }
}

/// Displacement of every corner node: x + R (X − cg₀) − X.
fn node_displacements(model: &Model, bodies: &[Body], node_body: &[usize]) -> Vec<f64> {
    let nc = model.mesh.ncorner;
    let mut d = vec![0.0; 3 * nc];
    for n in 0..nc {
        let b = node_body[n];
        if b == usize::MAX { continue; }
        let body = &bodies[b];
        let p = geom::add(body.x, mat_vec(&body.rot(), geom::sub(model.x[n], body.cg0)));
        for k in 0..3 { d[3 * n + k] = p[k] - model.x[n][k]; }
    }
    d
}

#[cfg(test)]
mod tests {
    use crate::out::decode;
    use crate::run_job_json;

    #[test]
    fn pendulum_swings_with_its_period() {
        // A slender bar 200 mm long hinged at its top end about Y, released 10° off vertical:
        // T = 2π √(I_pivot / (m g d)) with I_pivot = m L²/3, d = L/2.
        let job = r#"{ "analysis": "rigid", "unit": 0.001,
          "bodies": [{ "id": "bar", "material": "steel", "shape": { "type": "box", "size": [10, 10, 200], "placement": { "position": [17.36, 0, -98.48], "rotation": [0, -10, 0] } } }],
          "mesh": { "size": 5, "order": 1 },
          "bcs": [ { "id": "j1", "type": "joint", "joint": "revolute", "bodies": ["bar"], "point": [0, 0, 0], "axis": [0, 1, 0] }, { "type": "gravity", "vector": [0, 0, -9.80665] } ],
          "settings": { "endTime": 2.0, "frames": 400 } }"#;
        let (v, _) = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        let h = v["rigid"]["history"].as_array().unwrap();
        let x: Vec<f64> = h.iter().map(|p| p["bodies"][0]["position"][0].as_f64().unwrap()).collect();
        let t: Vec<f64> = h.iter().map(|p| p["time"].as_f64().unwrap()).collect();
        // Times the centre crosses x = 0 going down (from + to −).
        let mut cross = Vec::new();
        for i in 1..x.len() { if x[i - 1] > 0.0 && x[i] <= 0.0 { cross.push(t[i - 1] + (t[i] - t[i - 1]) * x[i - 1] / (x[i - 1] - x[i])); } }
        assert!(cross.len() >= 2, "crossings {cross:?}");
        let period = cross[1] - cross[0];
        let l = 0.2f64;
        let exact = 2.0 * std::f64::consts::PI * ((l * l / 3.0 + 0.01f64.powi(2) / 12.0) / (9.80665 * l / 2.0)).sqrt();
        assert!((period - exact).abs() / exact < 0.03, "period {period} vs {exact}");
        // The hinge holds: the top end stays at the origin; energy is kept.
        let e0 = h[0]["kinetic"].as_f64().unwrap() + h[0]["potential"].as_f64().unwrap();
        let e1 = h.last().unwrap()["kinetic"].as_f64().unwrap() + h.last().unwrap()["potential"].as_f64().unwrap();
        let m = v["rigid"]["bodies"][0]["mass"].as_f64().unwrap();
        assert!((e1 - e0).abs() < 0.02 * m * 9.81 * 0.1, "energy drift {e0} → {e1}");
        assert!(v["rigid"]["joints"][0]["force"].as_array().unwrap()[0].as_f64().unwrap() > 0.0);
    }
}
