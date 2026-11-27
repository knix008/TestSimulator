//! Linear structural analyses on 4/10-node tetrahedra: static (with thermal strain), modal,
//! linear buckling, harmonic response (mode superposition), transient (Newmark), response
//! spectrum, random vibration, and stress-life fatigue.

use crate::eigen::lobpcg;
use crate::fem::{self, Gp};
use crate::geom::{self, V3};
use crate::model::{enabled, kind, num, vec3, Model};
use crate::out::Out;
use crate::sparse::{pcg, Csr};
use crate::Ctx;
use serde_json::{json, Value};

pub struct Assembly {
    pub k: Csr,
    pub m: Option<Csr>,
    pub f: Vec<f64>,
    pub fixed: Vec<bool>,
    pub values: Vec<f64>,
    pub n: usize,
    /// Dofs of nodes that belong to no solid element (kept at zero).
    pub unused: Vec<bool>,
    /// Coordinates of every node of the system (mesh nodes, then the pilot nodes of remote points).
    pub xs: Vec<V3>,
    /// Remote points tied rigidly to faces (pilot translation and rotation nodes).
    pub pilots: Vec<Pilot>,
}

/// A remote point: two pilot nodes (translations U, rotations θ) at `point`, tied to face nodes by
/// penalty springs that keep u_i = U + θ × (x_i − point).
pub struct Pilot {
    /// Index of the job's boundary condition.
    pub bc: usize,
    /// The translation node; the rotation node follows it.
    pub node: usize,
    pub point: V3,
    /// Face node and its spring stiffness.
    pub links: Vec<(u32, f64)>,
}

impl Pilot {
    /// Dofs of a link (node, U, θ) and its 3×9 constraint matrix B (g = B · [u_i, U, θ]).
    fn link(&self, model: &Model, node: u32) -> ([usize; 9], [[f64; 9]; 3]) {
        let r = geom::sub(model.x[node as usize], self.point);
        let (a, b, c) = (3 * node as usize, 3 * self.node, 3 * (self.node + 1));
        let dofs = [a, a + 1, a + 2, b, b + 1, b + 2, c, c + 1, c + 2];
        // u_i − U − θ × r = u_i − U + S(r) θ,  S(r) θ = r × θ.
        let srm = [[0.0, -r[2], r[1]], [r[2], 0.0, -r[0]], [-r[1], r[0], 0.0]];
        let mut bm = [[0.0; 9]; 3];
        for i in 0..3 { bm[i][i] = 1.0; bm[i][3 + i] = -1.0; for j in 0..3 { bm[i][6 + j] = srm[i][j]; } }
        (dofs, bm)
    }
}

/// Adds the pilot couplings: K += k Bᵀ B and, with displacements, the internal force k Bᵀ B u.
pub fn add_pilots(model: &Model, pilots: &[Pilot], k: &mut Csr, fint: Option<(&mut [f64], &[f64])>) {
    let mut fint = fint;
    for p in pilots {
        for &(node, kk) in &p.links {
            let (dofs, bm) = p.link(model, node);
            let mut ke = vec![0.0; 81];
            for i in 0..9 { for j in 0..9 { ke[i * 9 + j] = kk * (0..3).map(|q| bm[q][i] * bm[q][j]).sum::<f64>(); } }
            k.add_element(&dofs, &ke);
            if let Some((f, u)) = fint.as_mut() {
                for i in 0..9 { f[dofs[i]] += (0..9).map(|j| ke[i * 9 + j] * u[dofs[j]]).sum::<f64>(); }
            }
        }
    }
}

/// The remote points of a job (remote displacements, and remote forces with rigid behaviour).
fn plan_pilots(model: &Model, nn: usize) -> Vec<Pilot> {
    let e_ref = model.mats.iter().map(|m| m.young).fold(0.0, f64::max);
    let h = model.mesh.h * model.unit();
    let mut out = Vec::new();
    for (i, bc) in model.job.bcs.iter().enumerate() {
        if !enabled(bc) { continue; }
        let rigid = kind(bc) == "remoteDisplacement" || (kind(bc) == "remoteForce" && bc.get("behavior").and_then(|v| v.as_str()) == Some("rigid"));
        if !rigid { continue; }
        let faces = model.faces_of(bc);
        if faces.is_empty() { continue; }
        let point = geom::scale(vec3(bc, "point").unwrap_or_else(|| centroid_of(model, &faces)), model.unit());
        let links = model.face_weights(&faces).into_iter().map(|(n, w, _)| (n, 100.0 * e_ref * w.max(0.05 * h * h) / h)).collect();
        out.push(Pilot { bc: i, node: nn + 2 * out.len(), point, links });
    }
    out
}

/// Area centroid of faces (model units).
fn centroid_of(model: &Model, faces: &[usize]) -> V3 {
    let mut c = [0.0; 3];
    let mut a = 0.0;
    for &f in faces { let fc = &model.mesh.faces[f]; for k in 0..3 { c[k] += fc.centroid[k] * fc.area; } a += fc.area; }
    if a > 0.0 { geom::scale(c, 1.0 / a) } else { c }
}

pub fn element_points(model: &Model, e: usize, degree: u8) -> Result<(Vec<u32>, Vec<Gp>), String> {
    let conn = model.mesh.element(e);
    let x: Vec<V3> = conn.iter().map(|&i| model.x[i as usize]).collect();
    let gps = fem::points(&x, degree)?;
    Ok((conn, gps))
}

fn dofs3(conn: &[u32]) -> Vec<usize> { conn.iter().flat_map(|&n| [3 * n as usize, 3 * n as usize + 1, 3 * n as usize + 2]).collect() }

/// Temperatures at the nodes (°C) from a thermal result or a uniform body temperature.
pub struct Thermal<'a> {
    pub nodal: Option<&'a [f64]>,
    pub uniform: Option<f64>,
    pub reference: f64,
}

/// Stiffness (and mass), loads and supports.
pub fn assemble(model: &Model, with_mass: bool, thermal: Option<&Thermal>, ctx: &mut Ctx) -> Result<Assembly, String> {
    let mesh = &model.mesh;
    let nmesh = mesh.nnodes();
    let pilots = plan_pilots(model, nmesh);
    let nn = nmesh + 2 * pilots.len();
    let n = 3 * nn;
    let solid = model.solid_elements();
    // Contact pairs couple nodes that share no element: they join the pattern as two-node elements;
    // remote points as (face node, pilot U, pilot θ) triples.
    let links: Vec<Vec<u32>> = pilots.iter().flat_map(|p| p.links.iter().map(move |&(nd, _)| vec![nd, p.node as u32, p.node as u32 + 1])).collect();
    let mut k = Csr::pattern(nn, 3, &mut solid.iter().map(|&e| mesh.element(e)).chain(mesh.contact_nodes.iter().map(|c| vec![c.a, c.b])).chain(links.into_iter()));
    let mut m = if with_mass { Some(k.same_pattern()) } else { None };
    let mut f = vec![0.0; n];
    let mut used = vec![false; nn];
    let nn = nmesh;
    for (i, &e) in solid.iter().enumerate() {
        let r = mesh.region[e] as usize;
        let mat = &model.mats[r];
        mat.check_structural()?;
        let nel = if mesh.order() == 2 { 10 } else { 4 };
        let (conn, gps) = element_points(model, e, fem::stiffness_degree(nel))?;
        for &c in &conn { used[c as usize] = true; }
        let d = fem::d_iso(mat.young, mat.poisson);
        let ke = fem::stiffness(&gps, &d);
        let dofs = dofs3(&conn);
        k.add_element(&dofs, &ke);
        if let Some(mm) = m.as_mut() {
            let (_, gm) = element_points(model, e, fem::mass_degree(nel))?;
            let me = fem::expand3(&fem::scalar_mass(&gm, mat.density), nel);
            mm.add_element(&dofs, &me);
        }
        // Thermal strain: f = ∫ Bᵀ D ε_th.
        if let Some(th) = thermal {
            if mat.cte != 0.0 {
                let mut fe = vec![0.0; 3 * nel];
                for gp in &gps {
                    let t = match (th.nodal, th.uniform) {
                        (Some(tn), _) => conn.iter().zip(gp.n.iter()).map(|(&c, &nv)| nv * tn[c as usize]).sum::<f64>(),
                        (None, Some(u)) => u,
                        _ => th.reference,
                    };
                    let eth = mat.cte * (t - th.reference);
                    if eth == 0.0 { continue; }
                    let s = fem::mat6_vec(&d, &[eth, eth, eth, 0.0, 0.0, 0.0]);
                    fem::bt_s(&gp.dn, &s, gp.w, &mut fe);
                }
                for (a, &dof) in dofs.iter().enumerate() { f[dof] += fe[a]; }
            }
        }
        if i % 2000 == 0 { ctx.step(0.3 * i as f64 / solid.len().max(1) as f64, "progress.assemble")?; }
    }
    let mut fixed = vec![false; n];
    let values = vec![0.0; n];
    let mut unused = vec![false; n];
    for p in &pilots { used[p.node] = true; used[p.node + 1] = true; }
    for node in 0..nn { if !used[node] { for c in 0..3 { fixed[3 * node + c] = true; unused[3 * node + c] = true; } } }
    add_pilots(model, &pilots, &mut k, None);
    if let Some(mm) = m.as_mut() {
        // Pilot nodes get a small mass (and rotary inertia) so the mass matrix stays definite.
        let avg = mm.diag().iter().take(3 * nmesh).sum::<f64>() / (3 * nmesh).max(1) as f64;
        for p in &pilots { for d in 0..6 { mm.add(3 * p.node + d, 3 * p.node + d, 1e-6 * avg); } }
    }
    let mut xs = model.x.clone();
    for p in &pilots { xs.push(p.point); xs.push(p.point); }
    let mut asm = Assembly { k, m, f, fixed, values, n, unused, xs, pilots };
    apply_bcs(model, &mut asm, 1.0, ctx)?;
    contact_springs(model, &mut asm);
    Ok(asm)
}

fn add_diag_block(k: &mut Csr, node: usize, n: V3, s: f64) {
    for i in 0..3 { for j in 0..3 { k.add(3 * node + i, 3 * node + j, s * n[i] * n[j]); } }
}

/// Supports and loads. `scale` multiplies the loads (load steps, history factors).
pub fn apply_bcs(model: &Model, asm: &mut Assembly, scale: f64, _ctx: &mut Ctx) -> Result<(), String> {
    let mesh = &model.mesh;
    let solid = model.solid_elements();
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        let faces = model.faces_of(bc);
        match kind(bc) {
            "fixed" => {
                for node in mesh.face_nodes(&faces) { for c in 0..3 { asm.fixed[3 * node as usize + c] = true; } }
            }
            "displacement" => {
                let comps = ["x", "y", "z"];
                for node in mesh.face_nodes(&faces) {
                    for (c, key) in comps.iter().enumerate() {
                        if let Some(v) = bc.get(*key).and_then(|v| v.as_f64()) {
                            asm.fixed[3 * node as usize + c] = true;
                            asm.values[3 * node as usize + c] = v * scale;
                        }
                    }
                }
            }
            "frictionless" | "elastic" => {
                // A stiff (or the given) spring normal to the face; elastic: all directions scaled by area.
                let e_ref = model.mats.iter().map(|m| m.young).fold(0.0, f64::max);
                let h = mesh.h * model.unit();
                for (node, w, nrm) in model.face_weights(&faces) {
                    if kind(bc) == "frictionless" {
                        let s = 1e3 * e_ref * w.max(h * h * 0.05) / h;
                        add_diag_block(&mut asm.k, node as usize, nrm, s);
                    } else {
                        let s = num(bc, "stiffness", 1e9) * w;
                        add_diag_block(&mut asm.k, node as usize, nrm, s);
                    }
                }
            }
            "force" | "pressure" | "moment" | "bearing" => {
                let wts = model.face_weights(&faces);
                let total: f64 = wts.iter().map(|w| w.1).sum();
                if total <= 0.0 { continue; }
                match kind(bc) {
                    "force" => {
                        let v = vec3(bc, "vector").unwrap_or([0.0; 3]);
                        for (node, w, _) in &wts { for c in 0..3 { asm.f[3 * *node as usize + c] += scale * v[c] * w / total; } }
                    }
                    "pressure" => {
                        let p = num(bc, "value", 0.0);
                        for (node, w, nrm) in &wts { for c in 0..3 { asm.f[3 * *node as usize + c] -= scale * p * w * nrm[c]; } }
                    }
                    "bearing" => {
                        let v = vec3(bc, "vector").unwrap_or([0.0; 3]);
                        let dir = geom::normalize(v);
                        let wsum: f64 = wts.iter().map(|(_, w, nrm)| w * (-geom::dot(*nrm, dir)).max(0.0)).sum();
                        if wsum > 0.0 {
                            for (node, w, nrm) in &wts {
                                let s = w * (-geom::dot(*nrm, dir)).max(0.0) / wsum;
                                for c in 0..3 { asm.f[3 * *node as usize + c] += scale * v[c] * s; }
                            }
                        }
                    }
                    _ => distribute_moment(model, &wts, vec3(bc, "vector").unwrap_or([0.0; 3]), scale, &mut asm.f),
                }
            }
            "remoteForce" => {
                let fv = vec3(bc, "vector").unwrap_or([0.0; 3]);
                let mv = vec3(bc, "moment").unwrap_or([0.0; 3]);
                if let Some(p) = asm.pilots.iter().find(|p| std::ptr::eq(&model.job.bcs[p.bc], bc)) {
                    // Rigid: the force and moment act on the pilot node at the remote point.
                    for q in 0..3 { asm.f[3 * p.node + q] += scale * fv[q]; asm.f[3 * (p.node + 1) + q] += scale * mv[q]; }
                } else {
                    // Deformable: the force spread by area, plus the moment of the offset (P − c) × F and M.
                    let wts = model.face_weights(&faces);
                    let total: f64 = wts.iter().map(|w| w.1).sum();
                    if total <= 0.0 { continue; }
                    let mut c = [0.0; 3];
                    for (node, w, _) in &wts { for q in 0..3 { c[q] += model.x[*node as usize][q] * w / total; } }
                    let point = geom::scale(vec3(bc, "point").unwrap_or_else(|| geom::scale(c, 1.0 / model.unit())), model.unit());
                    for (node, w, _) in &wts { for q in 0..3 { asm.f[3 * *node as usize + q] += scale * fv[q] * w / total; } }
                    let m_c = geom::add(mv, geom::cross(geom::sub(point, c), fv));
                    distribute_moment(model, &wts, m_c, scale, &mut asm.f);
                }
            }
            "remoteDisplacement" => {
                if let Some(p) = asm.pilots.iter().find(|p| std::ptr::eq(&model.job.bcs[p.bc], bc)) {
                    for (c, key) in ["x", "y", "z", "rx", "ry", "rz"].iter().enumerate() {
                        if let Some(v) = bc.get(*key).and_then(|v| v.as_f64()) {
                            let dof = 3 * p.node + c;
                            asm.fixed[dof] = true;
                            // Rotations come in degrees.
                            asm.values[dof] = scale * if c >= 3 { v.to_radians() } else { v };
                        }
                    }
                }
            }
            "gravity" | "acceleration" | "rotation" => {
                let nel = if mesh.order() == 2 { 10 } else { 4 };
                let g = vec3(bc, "vector").unwrap_or([0.0, 0.0, -9.80665]);
                // Acceleration of the support: inertial load opposite to it.
                let sign = if kind(bc) == "acceleration" { -1.0 } else { 1.0 };
                let axis = geom::normalize(vec3(bc, "axis").unwrap_or([0.0, 0.0, 1.0]));
                let origin = vec3(bc, "origin").unwrap_or([0.0; 3]);
                let omega = num(bc, "omega", 0.0);
                let targets = model.bodies_of(bc);
                for &e in &solid {
                    let r = mesh.region[e];
                    if !targets.is_empty() && !targets.contains(&r) { continue; }
                    let rho = model.mats[r as usize].density;
                    let (conn, gps) = element_points(model, e, fem::mass_degree(nel))?;
                    for gp in &gps {
                        let b = if kind(bc) == "rotation" {
                            let p: V3 = (0..3).map(|q| conn.iter().zip(gp.n.iter()).map(|(&cn, &nv)| nv * model.x[cn as usize][q]).sum::<f64>()).collect::<Vec<_>>().try_into().unwrap();
                            let d = geom::sub(p, origin);
                            let along = geom::scale(axis, geom::dot(d, axis));
                            geom::scale(geom::sub(d, along), rho * omega * omega)
                        } else { geom::scale(g, sign * rho) };
                        for (a, &cn) in conn.iter().enumerate() { for q in 0..3 { asm.f[3 * cn as usize + q] += scale * gp.w * gp.n[a] * b[q]; } }
                    }
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// A moment on faces: f_i = w_i (I⁻¹M) × d_i about the area centroid, I = Σ w (|d|² 1 − d dᵀ).
fn distribute_moment(model: &Model, wts: &[(u32, f64, V3)], mv: V3, scale: f64, f: &mut [f64]) {
    let total: f64 = wts.iter().map(|w| w.1).sum();
    if total <= 0.0 { return; }
    let mut c = [0.0; 3];
    for (node, w, _) in wts { for q in 0..3 { c[q] += model.x[*node as usize][q] * w / total; } }
    let mut im = [[0.0; 3]; 3];
    for (node, w, _) in wts {
        let d = geom::sub(model.x[*node as usize], c);
        let dd = geom::dot(d, d);
        for i in 0..3 { for j in 0..3 { im[i][j] += w * (if i == j { dd } else { 0.0 } - d[i] * d[j]); } }
    }
    if let Some((inv, _)) = crate::dense::inv3(&im) {
        let v = [inv[0][0] * mv[0] + inv[0][1] * mv[1] + inv[0][2] * mv[2], inv[1][0] * mv[0] + inv[1][1] * mv[1] + inv[1][2] * mv[2], inv[2][0] * mv[0] + inv[2][1] * mv[1] + inv[2][2] * mv[2]];
        for (node, w, _) in wts {
            let d = geom::sub(model.x[*node as usize], c);
            let fv = geom::cross(v, d);
            for q in 0..3 { f[3 * *node as usize + q] += scale * w * fv[q]; }
        }
    }
}

/// Contact pairs other than bonded: penalty springs on the duplicated interface nodes.
fn contact_springs(model: &Model, asm: &mut Assembly) {
    let mesh = &model.mesh;
    if mesh.contact_nodes.is_empty() { return; }
    let e_ref = model.mats.iter().map(|m| m.young).fold(0.0, f64::max);
    let h = mesh.h * model.unit();
    for cn in &mesh.contact_nodes {
        let ct = &model.job.contacts[model.contact_ids[cn.pair]];
        let area = cn.area * model.unit() * model.unit();
        let s = 100.0 * e_ref * area.max(0.05 * h * h) / h;
        let (a, b) = (cn.a as usize, cn.b as usize);
        // Tied in the normal direction (no separation); rough and bonded also tangentially.
        // Linear analyses: frictional contact with friction sticks (tied in every direction), frictionless
        // and no separation stay tied normal to the interface and free to slide (the notes say so).
        let dirs: Vec<V3> = match ct.kind.as_str() {
            "rough" | "bonded" => vec![[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            "frictional" if ct.friction > 0.0 => vec![[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            _ => vec![cn.normal],
        };
        for d in dirs {
            for i in 0..3 {
                for j in 0..3 {
                    let v = s * d[i] * d[j];
                    asm.k.add(3 * a + i, 3 * a + j, v);
                    asm.k.add(3 * b + i, 3 * b + j, v);
                    asm.k.add(3 * a + i, 3 * b + j, -v);
                    asm.k.add(3 * b + i, 3 * a + j, -v);
                }
            }
        }
    }
}

/// Solves K u = f with the supports.
pub fn solve_static(_model: &Model, asm: &Assembly, ctx: &mut Ctx) -> Result<Vec<f64>, String> {
    let mut k = asm.k.clone();
    let mut f = asm.f.clone();
    if !asm.fixed.iter().zip(asm.unused.iter()).any(|(fx, un)| *fx && !un) && asm.f.iter().any(|v| *v != 0.0) {
        // Without supports the problem has rigid motions; a tiny spring at every node keeps it solvable
        // (inertia relief would be the exact way — the user is told).
        let d = k.diag();
        let avg = d.iter().sum::<f64>() / d.len().max(1) as f64;
        for i in 0..asm.n { if !asm.fixed[i] { k.add(i, i, 1e-8 * avg); } }
    }
    k.constrain(&asm.fixed, &asm.values, &mut f);
    let u = crate::sparse::solve_mesh(&k, &f, &asm.xs, 3, ctx, 0.35, 0.85)?;
    Ok(u)
}

/// Nodal stress (Voigt, averaged over the elements around each node) and strain, from displacements.
pub struct Stress {
    pub s: Vec<[f64; 6]>,
    pub e: Vec<[f64; 6]>,
    /// Per element at its integration points (for geometric stiffness and fatigue).
    pub gp: Vec<Vec<[f64; 6]>>,
}

pub fn stresses(model: &Model, u: &[f64], thermal: Option<&Thermal>) -> Result<Stress, String> {
    stresses_eigen(model, u, thermal, &[])
}

/// Stresses with initial (eigen) strains per region: σ = D (ε − ε_th − ε₀) (bolt pretension).
pub fn stresses_eigen(model: &Model, u: &[f64], thermal: Option<&Thermal>, eigen: &[(u32, [f64; 6])]) -> Result<Stress, String> {
    let mesh = &model.mesh;
    let nn = mesh.nnodes();
    let mut s = vec![[0.0; 6]; nn];
    let mut e = vec![[0.0; 6]; nn];
    let mut cnt = vec![0.0; nn];
    let mut gp_s = vec![Vec::new(); mesh.tets.len()];
    let nel = if mesh.order() == 2 { 10 } else { 4 };
    let corners = fem::node_coords(nel);
    for el in model.solid_elements() {
        let r = mesh.region[el] as usize;
        let mat = &model.mats[r];
        let d = fem::d_iso(mat.young, mat.poisson);
        let e0 = eigen.iter().find(|(reg, _)| *reg as usize == r).map(|e| e.1);
        let conn = mesh.element(el);
        let x: Vec<V3> = conn.iter().map(|&i| model.x[i as usize]).collect();
        let ue: Vec<f64> = conn.iter().flat_map(|&n| [u[3 * n as usize], u[3 * n as usize + 1], u[3 * n as usize + 2]]).collect();
        let temp_at = |nv: &[f64]| -> f64 {
            match thermal {
                Some(th) => match (th.nodal, th.uniform) {
                    (Some(tn), _) => conn.iter().zip(nv.iter()).map(|(&c, &w)| w * tn[c as usize]).sum::<f64>() - th.reference,
                    (None, Some(t)) => t - th.reference,
                    _ => 0.0,
                },
                None => 0.0,
            }
        };
        let stress_at = |gp: &Gp| -> ([f64; 6], [f64; 6]) {
            let mut eps = fem::strain(&gp.dn, &ue);
            let dt = temp_at(&gp.n);
            let eth = mat.cte * dt;
            let total = eps;
            for c in 0..3 { eps[c] -= eth; }
            if let Some(e0) = e0 { for c in 0..6 { eps[c] -= e0[c]; } }
            (fem::mat6_vec(&d, &eps), total)
        };
        for gp in fem::points(&x, fem::stiffness_degree(nel))? { gp_s[el].push(stress_at(&gp).0); }
        for (a, l) in corners.iter().enumerate() {
            let gp = fem::point(&x, l, 1.0)?;
            let (sv, ev) = stress_at(&gp);
            let node = conn[a] as usize;
            for c in 0..6 { s[node][c] += sv[c]; e[node][c] += ev[c]; }
            cnt[node] += 1.0;
        }
    }
    for i in 0..nn { if cnt[i] > 0.0 { for c in 0..6 { s[i][c] /= cnt[i]; e[i][c] /= cnt[i]; } } }
    Ok(Stress { s, e, gp: gp_s })
}

fn argmax(v: &[f64]) -> usize { v.iter().enumerate().fold((0, f64::NEG_INFINITY), |b, (i, &x)| if x > b.1 { (i, x) } else { b }).0 }
fn argmin(v: &[f64]) -> usize { v.iter().enumerate().fold((0, f64::INFINITY), |b, (i, &x)| if x < b.1 { (i, x) } else { b }).0 }

/// The fields every structural result has (corner nodes only).
pub fn put_fields(model: &Model, out: &mut Out, u: &[f64], st: &Stress, prefix: &str) -> Value {
    let nc = model.mesh.ncorner;
    let disp: Vec<f64> = (0..nc).flat_map(|i| [u[3 * i], u[3 * i + 1], u[3 * i + 2]]).collect();
    let total: Vec<f64> = (0..nc).map(|i| (u[3 * i].powi(2) + u[3 * i + 1].powi(2) + u[3 * i + 2].powi(2)).sqrt()).collect();
    let vm: Vec<f64> = (0..nc).map(|i| fem::von_mises(&st.s[i])).collect();
    let pr: Vec<[f64; 3]> = (0..nc).map(|i| crate::dense::principal3(st.s[i])).collect();
    let nu_of = |i: usize| -> f64 { model.mats.first().map(|m| m.poisson).unwrap_or(0.3) + 0.0 * i as f64 };
    let eq: Vec<f64> = (0..nc).map(|i| fem::equivalent_strain(&st.e[i], nu_of(i))).collect();
    let comp = |c: usize| -> Vec<f64> { (0..nc).map(|i| st.s[i][c]).collect() };
    let max_shear: Vec<f64> = pr.iter().map(|p| 0.5 * (p[0] - p[2])).collect();
    let mut fields = serde_json::Map::new();
    fields.insert("displacement".into(), out.f32s(&total));
    fields.insert("vector".into(), out.f32s(&disp));
    fields.insert("ux".into(), out.f32s(&(0..nc).map(|i| u[3 * i]).collect::<Vec<_>>()));
    fields.insert("uy".into(), out.f32s(&(0..nc).map(|i| u[3 * i + 1]).collect::<Vec<_>>()));
    fields.insert("uz".into(), out.f32s(&(0..nc).map(|i| u[3 * i + 2]).collect::<Vec<_>>()));
    fields.insert("vonMises".into(), out.f32s(&vm));
    fields.insert("principal1".into(), out.f32s(&pr.iter().map(|p| p[0]).collect::<Vec<_>>()));
    fields.insert("principal2".into(), out.f32s(&pr.iter().map(|p| p[1]).collect::<Vec<_>>()));
    fields.insert("principal3".into(), out.f32s(&pr.iter().map(|p| p[2]).collect::<Vec<_>>()));
    fields.insert("maxShear".into(), out.f32s(&max_shear));
    fields.insert("intensity".into(), out.f32s(&pr.iter().map(|p| p[0] - p[2]).collect::<Vec<_>>()));
    for (c, key) in ["sx", "sy", "sz", "sxy", "syz", "szx"].iter().enumerate() { fields.insert((*key).into(), out.f32s(&comp(c))); }
    fields.insert("strain".into(), out.f32s(&eq));
    // Safety factor against yield, per node with the material of an element around it (capped at 15).
    let mut yield_at = vec![f64::INFINITY; nc];
    for el in model.solid_elements() {
        let y = model.mats[model.mesh.region[el] as usize].yield_strength;
        for &c in &model.mesh.tets[el] { if y > 0.0 { yield_at[c as usize] = yield_at[c as usize].min(y); } }
    }
    let sf: Vec<f64> = (0..nc).map(|i| if vm[i] > 0.0 && yield_at[i].is_finite() { (yield_at[i] / vm[i]).min(15.0) } else { 15.0 }).collect();
    fields.insert("safety".into(), out.f32s(&sf));
    let imax = argmax(&vm);
    let dmax = argmax(&total);
    let smin = argmin(&sf);
    let _ = prefix;
    json!({
        "fields": Value::Object(fields),
        "max": { "displacement": total[dmax], "displacementNode": dmax, "vonMises": vm[imax], "vonMisesNode": imax, "safety": sf[smin], "safetyNode": smin,
                 "principal1": pr.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max), "principal3": pr.iter().map(|p| p[2]).fold(f64::INFINITY, f64::min) },
    })
}

/// Reaction forces of every support (fixed, displacement, frictionless, elastic).
fn reactions(model: &Model, asm: &Assembly, u: &[f64]) -> Value {
    let ku = asm.k.mul(u);
    let r: Vec<f64> = ku.iter().zip(asm.f.iter()).map(|(a, b)| a - b).collect();
    reactions_with_pilots(model, &asm.pilots, &r)
}

/// Reactions from an out-of-balance vector, with the remote displacements' pilot nodes.
pub fn reactions_with_pilots(model: &Model, pilots: &[Pilot], r: &[f64]) -> Value {
    let mut list = reactions_from(model, r);
    // Remote displacements: the reaction is at the pilot node (force, and moment about the origin).
    if let Value::Array(items) = &mut list {
        for p in pilots {
            let bc = &model.job.bcs[p.bc];
            if kind(bc) != "remoteDisplacement" { continue; }
            let f = [r[3 * p.node], r[3 * p.node + 1], r[3 * p.node + 2]];
            let m = geom::add([r[3 * p.node + 3], r[3 * p.node + 4], r[3 * p.node + 5]], geom::cross(p.point, f));
            items.push(json!({ "id": bc.get("id").cloned().unwrap_or(Value::Null), "force": f, "moment": m }));
        }
    }
    list
}

/// Reactions from the nodal out-of-balance force (internal − external) of a solution.
pub fn reactions_from(model: &Model, residual: &[f64]) -> Value {
    let mut list = Vec::new();
    for bc in &model.job.bcs {
        if !enabled(bc) || !matches!(kind(bc), "fixed" | "displacement" | "frictionless" | "elastic") { continue; }
        let faces = model.faces_of(bc);
        let nodes = model.mesh.face_nodes(&faces);
        let mut r = [0.0; 3];
        let mut mo = [0.0; 3];
        for &nd in &nodes {
            let nd = nd as usize;
            let f = [residual[3 * nd], residual[3 * nd + 1], residual[3 * nd + 2]];
            for c in 0..3 { r[c] += f[c]; }
            let m = geom::cross(model.x[nd], f);
            for c in 0..3 { mo[c] += m[c]; }
        }
        list.push(json!({ "id": bc.get("id").cloned().unwrap_or(Value::Null), "force": r, "moment": mo }));
    }
    Value::Array(list)
}

fn mass_volume(model: &Model) -> Result<(f64, f64, V3), String> {
    let mut mass = 0.0;
    let mut vol = 0.0;
    let mut cg = [0.0; 3];
    for el in model.solid_elements() {
        let t = model.mesh.tets[el];
        let p: Vec<V3> = t.iter().map(|&i| model.x[i as usize]).collect();
        let v = crate::mesh::volume(p[0], p[1], p[2], p[3]);
        let rho = model.mats[model.mesh.region[el] as usize].density;
        vol += v;
        mass += rho * v;
        for c in 0..3 { cg[c] += rho * v * (p[0][c] + p[1][c] + p[2][c] + p[3][c]) / 4.0; }
    }
    for c in 0..3 { cg[c] /= mass.max(1e-300); }
    Ok((mass, vol, cg))
}

pub fn summary(model: &Model, out: &mut Out) -> Result<(), String> {
    let (mass, vol, cg) = mass_volume(model)?;
    out.set("mass", json!(mass));
    out.set("volume", json!(vol));
    out.set("centroid", json!(cg));
    Ok(())
}

// ───────────────────────── analyses

/// One-way fluid–structure interaction: the flow first, then the bodies under the flow's pressure on
/// their outer surfaces (with the supports and any other structural loads). The flow results stay.
pub fn run_fsi(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let psurf = ctx.sub(0.0, 0.7, |c| crate::cfd::run_fluid_with(model, out, c))?;
    if let Some(r) = out.json.remove("result") { out.set("fluidResult", r); }
    let scale = model.setting_f("pressureScale", 1.0);
    let mut asm = ctx.sub(0.7, 0.8, |c| assemble(model, false, None, c))?;
    // Pressure on the outer faces of the bodies: f = −p n A / 3 at each corner (linear triangles) — on
    // TET10 meshes the corner share goes to the mid-side nodes, as for a pressure condition.
    let mesh = &model.mesh;
    let quad = mesh.order() == 2;
    let mut total = [0.0; 3];
    for (ti, t) in mesh.tris.iter().enumerate() {
        let (r, o) = (mesh.tri_region[ti], mesh.tri_other[ti]);
        if !model.is_body(r) || !(o == crate::mesh::NONE || o == model.air) { continue; }
        let (a, b, c) = (model.x[t[0] as usize], model.x[t[1] as usize], model.x[t[2] as usize]);
        let nrm = geom::cross(geom::sub(b, a), geom::sub(c, a));
        let area = 0.5 * geom::norm(nrm);
        if area <= 0.0 { continue; }
        let n = geom::normalize(nrm);
        let p = scale * (psurf[t[0] as usize] + psurf[t[1] as usize] + psurf[t[2] as usize]) / 3.0;
        let fv = geom::scale(n, -p * area);
        for k in 0..3 { total[k] += fv[k]; }
        if quad {
            for &m in &mesh.tri_mid[ti] { for k in 0..3 { asm.f[3 * m as usize + k] += fv[k] / 3.0; } }
        } else {
            for &c in t { for k in 0..3 { asm.f[3 * c as usize + k] += fv[k] / 3.0; } }
        }
    }
    let u = ctx.sub(0.8, 0.95, |c| solve_static(model, &asm, c))?;
    let st = stresses(model, &u, None)?;
    let mut res = put_fields(model, out, &u, &st, "");
    let pv = out.f32s(&psurf);
    res["fields"]["fluidPressure"] = pv;
    out.set("result", res);
    out.set("reactions", reactions(model, &asm, &u));
    out.set("fsi", json!({ "fluidForce": total, "pressureScale": scale }));
    summary(model, out)?;
    Ok(())
}

/// Whether the job has contact that only a nonlinear solution handles exactly (it can open or slide).
pub fn has_nonlinear_contact(model: &Model) -> bool {
    !model.mesh.contact_nodes.is_empty() && model.contact_ids.iter().any(|&i| matches!(model.job.contacts[i].kind.as_str(), "frictionless" | "frictional"))
}

/// Notes for linear analyses that linearise contact which could open or slide.
pub fn contact_notes(model: &Model, out: &mut Out) {
    for &i in &model.contact_ids {
        match model.job.contacts[i].kind.as_str() {
            "frictionless" => out.note("contact.linearFrictionless"),
            "frictional" => out.note("contact.linearFrictional"),
            _ => {}
        }
    }
}

pub fn run_static(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    if has_nonlinear_contact(model) && uniform_temperature(model).is_none() {
        // Contact that can open or slide: an elastic nonlinear (Newton) solution with the same supports and loads.
        out.note("contact.nonlinearPath");
        let st = crate::nonlinear::solve(model, out, ctx, false, false, model.setting_u("steps", 4).clamp(1, 200))?;
        if model.setting_b("fatigue", false) { fatigue(model, out, &st)?; }
        return Ok(());
    }
    let uniform = uniform_temperature(model);
    let th = Thermal { nodal: None, uniform, reference: model.setting_f("referenceTemperature", 22.0) };
    let asm = assemble(model, false, if uniform.is_some() { Some(&th) } else { None }, ctx)?;
    let mut u = solve_static(model, &asm, ctx)?;
    // Bolt pretension: unit shortening solutions superposed so each bolt carries its force.
    let bolts = bolts_of(model);
    let mut eigen = Vec::new();
    if !bolts.is_empty() {
        let (scales, units) = bolt_scales(model, &asm, &bolts, &u, ctx)?;
        for (j, b) in bolts.iter().enumerate() {
            for i in 0..u.len() { u[i] += scales[j] * units[j][i]; }
            eigen.push((b.region, b.unit.map(|v| v * scales[j])));
        }
        let rows: Vec<Value> = bolts.iter().enumerate().map(|(j, b)| json!({ "id": b.id, "force": bolt_force(model, b, &u, &eigen), "adjustment": scales[j] * b.length, "length": b.length })).collect();
        out.set("bolts", Value::Array(rows));
    }
    ctx.step(0.9, "progress.results")?;
    let st = stresses_eigen(model, &u, if uniform.is_some() { Some(&th) } else { None }, &eigen)?;
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    out.set("reactions", reactions(model, &asm, &u));
    let energy = 0.5 * u.iter().zip(asm.f.iter()).map(|(a, b)| a * b).sum::<f64>();
    out.set("strainEnergy", json!(energy));
    summary(model, out)?;
    if model.setting_b("fatigue", false) { fatigue(model, out, &st)?; }
    Ok(())
}

/// A pretensioned bolt: a body shortened along its axis (an initial strain) until it carries the
/// given force, or by a given length.
pub struct Bolt {
    pub id: Value,
    pub region: u32,
    pub axis: V3,
    /// Length along the axis (m).
    pub length: f64,
    /// Unit shortening strain −a⊗a (Voigt, engineering shears).
    pub unit: [f64; 6],
    /// Force (N) when `adjust` is None, else the shortening (m).
    pub force: f64,
    pub adjust: Option<f64>,
}

pub fn bolts_of(model: &Model) -> Vec<Bolt> {
    let mut out = Vec::new();
    for bc in &model.job.bcs {
        if !enabled(bc) || kind(bc) != "boltPretension" { continue; }
        let Some(&region) = model.bodies_of(bc).first() else { continue };
        let a = geom::normalize(vec3(bc, "axis").unwrap_or([0.0, 0.0, 1.0]));
        let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
        for e in model.solid_elements() {
            if model.mesh.region[e] != region { continue; }
            for &nd in &model.mesh.tets[e] { let d = geom::dot(model.x[nd as usize], a); lo = lo.min(d); hi = hi.max(d); }
        }
        if !(hi > lo) { continue; }
        let unit = [-a[0] * a[0], -a[1] * a[1], -a[2] * a[2], -2.0 * a[0] * a[1], -2.0 * a[1] * a[2], -2.0 * a[2] * a[0]];
        let adjust = if bc.get("mode").and_then(|v| v.as_str()) == Some("adjustment") { Some(num(bc, "adjustment", 1e-4)) } else { None };
        out.push(Bolt { id: bc.get("id").cloned().unwrap_or(Value::Null), region, axis: a, length: hi - lo, unit, force: num(bc, "force", 10000.0), adjust });
    }
    out
}

/// Load vector of an initial strain in a region: f = ∫ Bᵀ D ε₀ dV.
fn eigen_load(model: &Model, region: u32, e0: &[f64; 6], n: usize) -> Result<Vec<f64>, String> {
    let mut f = vec![0.0; n];
    let nel = if model.mesh.order() == 2 { 10 } else { 4 };
    for e in model.solid_elements() {
        if model.mesh.region[e] != region { continue; }
        let mat = &model.mats[region as usize];
        let d = fem::d_iso(mat.young, mat.poisson);
        let (conn, gps) = element_points(model, e, fem::stiffness_degree(nel))?;
        let s = fem::mat6_vec(&d, e0);
        let mut fe = vec![0.0; 3 * nel];
        for gp in &gps { fem::bt_s(&gp.dn, &s, gp.w, &mut fe); }
        for (a, dof) in dofs3(&conn).into_iter().enumerate() { f[dof] += fe[a]; }
    }
    Ok(f)
}

/// Axial force of a bolt: (1/L) ∫ a·σ·a dV over its body.
pub fn bolt_force(model: &Model, b: &Bolt, u: &[f64], eigen: &[(u32, [f64; 6])]) -> f64 {
    let nel = if model.mesh.order() == 2 { 10 } else { 4 };
    let e0 = eigen.iter().find(|e| e.0 == b.region).map(|e| e.1).unwrap_or([0.0; 6]);
    let a = b.axis;
    let mut sum = 0.0;
    for e in model.solid_elements() {
        if model.mesh.region[e] != b.region { continue; }
        let mat = &model.mats[b.region as usize];
        let d = fem::d_iso(mat.young, mat.poisson);
        let Ok((conn, gps)) = element_points(model, e, fem::stiffness_degree(nel)) else { continue };
        let ue: Vec<f64> = conn.iter().flat_map(|&nd| [u[3 * nd as usize], u[3 * nd as usize + 1], u[3 * nd as usize + 2]]).collect();
        for gp in &gps {
            let mut eps = fem::strain(&gp.dn, &ue);
            for c in 0..6 { eps[c] -= e0[c]; }
            let s = fem::mat6_vec(&d, &eps);
            let saa = s[0] * a[0] * a[0] + s[1] * a[1] * a[1] + s[2] * a[2] * a[2] + 2.0 * (s[3] * a[0] * a[1] + s[4] * a[1] * a[2] + s[5] * a[2] * a[0]);
            sum += gp.w * saa;
        }
    }
    sum / b.length.max(1e-300)
}

/// Scales of the bolts' unit shortenings (and the unit solutions) so that each bolt carries its force
/// together with the external loads (u_ext), or is shortened by its adjustment.
pub fn bolt_scales(model: &Model, asm: &Assembly, bolts: &[Bolt], u_ext: &[f64], ctx: &mut Ctx) -> Result<(Vec<f64>, Vec<Vec<f64>>), String> {
    let mut units = Vec::new();
    for b in bolts {
        // The unit case: no external loads, supports held at zero.
        let mut k = asm.k.clone();
        let mut f = eigen_load(model, b.region, &b.unit, asm.n)?;
        k.constrain(&asm.fixed, &vec![0.0; asm.n], &mut f);
        units.push(crate::sparse::solve_mesh(&k, &f, &asm.xs, 3, ctx, 0.85, 0.9)?);
    }
    let m = bolts.len();
    // A s = r: row i is bolt i's force (or its fixed adjustment).
    let mut a = vec![vec![0.0; m]; m];
    let mut r = vec![0.0; m];
    for (i, bi) in bolts.iter().enumerate() {
        if let Some(adj) = bi.adjust { a[i][i] = 1.0; r[i] = adj / bi.length.max(1e-300); continue; }
        r[i] = bi.force - bolt_force(model, bi, u_ext, &[]);
        for (j, bj) in bolts.iter().enumerate() {
            let e: Vec<(u32, [f64; 6])> = if i == j { vec![(bj.region, bj.unit)] } else { vec![] };
            a[i][j] = bolt_force(model, bi, &units[j], &e);
        }
    }
    let flat: Vec<f64> = a.iter().flatten().copied().collect();
    let s = crate::dense::solve(&flat, &r, m).ok_or("bolt.singular")?;
    Ok((s, units))
}

pub fn uniform_temperature(model: &Model) -> Option<f64> {
    model.job.bcs.iter().find(|b| enabled(b) && kind(b) == "thermal").map(|b| num(b, "value", 22.0))
}

/// Thermal-stress: temperatures from a thermal solution drive the strains.
pub fn run_thermal_stress(model: &Model, temps: &[f64], out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let th = Thermal { nodal: Some(temps), uniform: None, reference: model.setting_f("referenceTemperature", 22.0) };
    let asm = assemble(model, false, Some(&th), ctx)?;
    let u = solve_static(model, &asm, ctx)?;
    let st = stresses(model, &u, Some(&th))?;
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    out.set("reactions", reactions(model, &asm, &u));
    summary(model, out)?;
    Ok(())
}

/// Lowest modes of the supported structure. Returns (ω², B-normalised shapes, mass matrix).
pub fn modes(_model: &Model, asm: &Assembly, nev: usize, ctx: &mut Ctx) -> Result<(Vec<f64>, Vec<Vec<f64>>), String> {
    let m = asm.m.as_ref().ok_or("modal.noMass")?;
    let mut k = asm.k.clone();
    let mut mm = m.clone();
    let mut dummy = vec![0.0; asm.n];
    let zero = vec![0.0; asm.n];
    k.constrain(&asm.fixed, &zero, &mut dummy);
    mm.zero_fixed(&asm.fixed, 0.0);
    let supported = asm.fixed.iter().zip(asm.unused.iter()).any(|(f, u)| *f && !u);
    // Free structures: a small shift makes K + σM definite (the rigid modes come out near 0 Hz).
    let sigma = if supported { 0.0 } else {
        let dk: f64 = k.diag().iter().sum();
        let dm: f64 = mm.diag().iter().sum();
        1e-6 * dk / dm.max(1e-300)
    };
    let ks = if sigma > 0.0 { k.axpy(sigma, &mm) } else { k.clone() };
    let pre = crate::sparse::precond(&ks, &asm.xs, 3);
    let mask: Vec<bool> = asm.fixed.iter().map(|f| !f).collect();
    let a = |x: &[f64], y: &mut [f64]| ks.matvec(x, y);
    let b = |x: &[f64], y: &mut [f64]| mm.matvec(x, y);
    let t = |x: &[f64], y: &mut [f64]| pre.apply(x, y);
    let e = lobpcg(&a, &b, &t, asm.n, nev, &mask, 1e-6, 600, ctx, 0.35, 0.85)?;
    if !e.converged && e.values.is_empty() { return Err("eigen.noConvergence".into()); }
    Ok((e.values.iter().map(|v| (v - sigma).max(0.0)).collect(), e.vectors))
}

fn rigid_vector(n: usize, dir: V3) -> Vec<f64> { (0..n).map(|i| dir[i % 3]).collect() }

pub fn run_modal(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let nev = model.setting_u("modes", 6).clamp(1, 40);
    let asm = assemble(model, true, None, ctx)?;
    let (w2, shapes) = modes(model, &asm, nev, ctx)?;
    ctx.step(0.9, "progress.results")?;
    let m = asm.m.as_ref().unwrap();
    let (mass, _, _) = mass_volume(model)?;
    let mut list = Vec::new();
    let mut cum = [0.0; 3];
    for (i, (l, phi)) in w2.iter().zip(shapes.iter()).enumerate() {
        let f = l.sqrt() / (2.0 * std::f64::consts::PI);
        let mphi = m.mul(phi);
        let mut part = [0.0; 3];
        let mut eff = [0.0; 3];
        for (c, dir) in [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]].iter().enumerate() {
            let r = rigid_vector(asm.n, *dir);
            part[c] = mphi.iter().zip(r.iter()).filter(|_| true).map(|(a, b)| a * b).sum::<f64>();
            eff[c] = part[c] * part[c];
            cum[c] += eff[c];
        }
        let shape = shape_field(model, phi);
        let field = out.f32s(&shape.0);
        let vec = out.f32s(&shape.1);
        list.push(json!({ "mode": i + 1, "frequency": f, "participation": part, "effectiveMass": eff, "cumulative": [cum[0] / mass, cum[1] / mass, cum[2] / mass], "field": field, "vector": vec }));
    }
    out.set("modes", Value::Array(list));
    summary(model, out)?;
    Ok(())
}

/// A mode shape scaled to a maximum displacement of 1: (magnitude per corner node, xyz per corner node).
fn shape_field(model: &Model, phi: &[f64]) -> (Vec<f64>, Vec<f64>) {
    let nc = model.mesh.ncorner;
    let mag: Vec<f64> = (0..nc).map(|i| (phi[3 * i].powi(2) + phi[3 * i + 1].powi(2) + phi[3 * i + 2].powi(2)).sqrt()).collect();
    let mx = mag.iter().cloned().fold(0.0, f64::max).max(1e-300);
    (mag.iter().map(|v| v / mx).collect(), (0..3 * nc).map(|i| phi[i] / mx).collect())
}

pub fn run_buckling(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let nev = model.setting_u("modes", 4).clamp(1, 20);
    let asm = ctx.sub(0.0, 0.3, |c| assemble(model, false, None, c))?;
    let u = ctx.sub(0.0, 0.3, |c| solve_static(model, &asm, c))?;
    let st = stresses(model, &u, None)?;
    // Geometric stiffness from the prestress.
    let mesh = &model.mesh;
    let mut kg = asm.k.same_pattern();
    let nel = if mesh.order() == 2 { 10 } else { 4 };
    for el in model.solid_elements() {
        let (conn, gps) = element_points(model, el, fem::stiffness_degree(nel))?;
        let ke = fem::geometric(&gps, &st.gp[el]);
        kg.add_element(&dofs3(&conn), &ke);
    }
    let mut k = asm.k.clone();
    let mut dummy = vec![0.0; asm.n];
    let zero = vec![0.0; asm.n];
    k.constrain(&asm.fixed, &zero, &mut dummy);
    kg.zero_fixed(&asm.fixed, 0.0);
    let pre = crate::sparse::precond(&k, &asm.xs, 3);
    let mask: Vec<bool> = asm.fixed.iter().map(|f| !f).collect();
    // Kg φ = μ K φ; the most negative μ give the load factors λ = −1/μ.
    let a = |x: &[f64], y: &mut [f64]| kg.matvec(x, y);
    let b = |x: &[f64], y: &mut [f64]| k.matvec(x, y);
    let t = |x: &[f64], y: &mut [f64]| pre.apply(x, y);
    let e = lobpcg(&a, &b, &t, asm.n, nev, &mask, 1e-6, 800, ctx, 0.35, 0.9)?;
    let mut list = Vec::new();
    for (i, (mu, phi)) in e.values.iter().zip(e.vectors.iter()).enumerate() {
        let factor = if *mu < 0.0 { -1.0 / mu } else { f64::INFINITY };
        let shape = shape_field(model, phi);
        let field = out.f32s(&shape.0);
        let vec = out.f32s(&shape.1);
        list.push(json!({ "mode": i + 1, "factor": if factor.is_finite() { json!(factor) } else { Value::Null }, "field": field, "vector": vec }));
    }
    out.set("modes", Value::Array(list));
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    summary(model, out)?;
    Ok(())
}

/// Mode superposition data shared by harmonic, spectrum and random vibration.
struct Modal { w: Vec<f64>, phi: Vec<Vec<f64>>, gamma: Vec<V3> }

fn modal_basis(model: &Model, asm: &Assembly, nev: usize, ctx: &mut Ctx) -> Result<Modal, String> {
    let (w2, phi) = modes(model, asm, nev, ctx)?;
    let m = asm.m.as_ref().unwrap();
    let gamma = phi.iter().map(|p| {
        let mp = m.mul(p);
        let g = |c: usize| (0..asm.n).filter(|i| i % 3 == c).map(|i| mp[i]).sum::<f64>();
        [g(0), g(1), g(2)]
    }).collect();
    Ok(Modal { w: w2.iter().map(|v| v.sqrt()).collect(), phi, gamma })
}

fn stress_of_vector(model: &Model, u: &[f64]) -> Result<Vec<[f64; 6]>, String> { Ok(stresses(model, u, None)?.s) }

pub fn run_harmonic(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let f0 = model.setting_f("fmin", 0.0).max(0.0);
    let f1 = model.setting_f("fmax", 500.0).max(f0 + 1e-6);
    let npts = model.setting_u("points", 100).clamp(5, 2000);
    let zeta = model.setting_f("damping", 0.02);
    let nev = model.setting_u("modes", 12).clamp(1, 60);
    let asm = assemble(model, true, None, ctx)?;
    let md = ctx.sub(0.0, 0.8, |c| modal_basis(model, &asm, nev, c))?;
    // Modal forces from the applied loads (with the supports' prescribed values ignored).
    let q: Vec<f64> = md.phi.iter().map(|p| p.iter().zip(asm.f.iter()).map(|(a, b)| a * b).sum()).collect();
    let probes = model.probe_nodes(|| {
        // Default probe: the node that moves most in the first mode.
        let p = &md.phi[0];
        (0..model.mesh.ncorner).max_by(|&a, &b| {
            let ma = p[3 * a].powi(2) + p[3 * a + 1].powi(2) + p[3 * a + 2].powi(2);
            let mb = p[3 * b].powi(2) + p[3 * b + 1].powi(2) + p[3 * b + 2].powi(2);
            ma.partial_cmp(&mb).unwrap()
        }).unwrap_or(0)
    });
    let probe = probes[0];
    let mut freqs = Vec::with_capacity(npts);
    let mut amp = [Vec::new(), Vec::new(), Vec::new()];
    let mut phase = [Vec::new(), Vec::new(), Vec::new()];
    // Every probe: amplitude per component.
    let mut pamp: Vec<[Vec<f64>; 3]> = probes.iter().map(|_| [Vec::new(), Vec::new(), Vec::new()]).collect();
    let mut best = (0.0, f0);
    let coef = |w: f64| -> Vec<(f64, f64)> {
        md.w.iter().zip(q.iter()).map(|(wi, qi)| {
            let (re, im) = (wi * wi - w * w, 2.0 * zeta * wi * w);
            let d = re * re + im * im;
            (qi * re / d, -qi * im / d)
        }).collect()
    };
    for s in 0..npts {
        let f = f0 + (f1 - f0) * s as f64 / (npts - 1) as f64;
        let w = 2.0 * std::f64::consts::PI * f;
        let c = coef(w);
        let mut mag2 = 0.0;
        for comp in 0..3 {
            let (mut re, mut im) = (0.0, 0.0);
            for (i, (a, b)) in c.iter().enumerate() { re += a * md.phi[i][3 * probe + comp]; im += b * md.phi[i][3 * probe + comp]; }
            amp[comp].push((re * re + im * im).sqrt());
            phase[comp].push(im.atan2(re).to_degrees());
            mag2 += re * re + im * im;
        }
        for (pi, &pn) in probes.iter().enumerate() {
            for comp in 0..3 {
                let (mut re, mut im) = (0.0, 0.0);
                for (i, (a, b)) in c.iter().enumerate() { re += a * md.phi[i][3 * pn + comp]; im += b * md.phi[i][3 * pn + comp]; }
                pamp[pi][comp].push((re * re + im * im).sqrt());
            }
        }
        if mag2.sqrt() > best.0 { best = (mag2.sqrt(), f); }
        freqs.push(f);
    }
    let fsel = model.setting_f("frequency", best.1);
    let wsel = 2.0 * std::f64::consts::PI * fsel;
    let c = coef(wsel);
    let mut ure = vec![0.0; asm.n];
    let mut uim = vec![0.0; asm.n];
    for (i, (a, b)) in c.iter().enumerate() { for k in 0..asm.n { ure[k] += a * md.phi[i][k]; uim[k] += b * md.phi[i][k]; } }
    let sre = stress_of_vector(model, &ure)?;
    let sim = stress_of_vector(model, &uim)?;
    let nc = model.mesh.ncorner;
    let ampl: Vec<f64> = (0..asm.n).map(|k| (ure[k].powi(2) + uim[k].powi(2)).sqrt()).collect();
    // Stress amplitude: von Mises of the component amplitudes (a common conservative measure).
    let samp: Vec<[f64; 6]> = (0..model.mesh.nnodes()).map(|i| { let mut s = [0.0; 6]; for c in 0..6 { s[c] = (sre[i][c].powi(2) + sim[i][c].powi(2)).sqrt(); } s }).collect();
    let st = Stress { s: samp, e: vec![[0.0; 6]; model.mesh.nnodes()], gp: Vec::new() };
    let res = put_fields(model, out, &ampl, &st, "");
    let total: Vec<f64> = (0..nc).map(|i| (0..3).map(|c| ure[3 * i + c].powi(2) + uim[3 * i + c].powi(2)).sum::<f64>().sqrt()).collect();
    out.set("result", res);
    let re_v = out.f32s(&(0..3 * nc).map(|i| ure[i]).collect::<Vec<_>>());
    let im_v = out.f32s(&(0..3 * nc).map(|i| uim[i]).collect::<Vec<_>>());
    let tot_v = out.f32s(&total);
    out.set("harmonic", json!({
        "frequencies": freqs, "amplitude": amp, "phase": phase, "probe": probe, "probePoint": model.mesh.nodes[probe],
        "frequency": fsel, "re": re_v, "im": im_v, "total": tot_v,
        "probes": probes.iter().zip(pamp.iter()).map(|(&pn, a)| json!({ "node": pn, "point": model.mesh.nodes[pn], "amplitude": a })).collect::<Vec<_>>(),
        "naturalFrequencies": md.w.iter().map(|w| w / (2.0 * std::f64::consts::PI)).collect::<Vec<_>>(),
    }));
    summary(model, out)?;
    Ok(())
}

/// Piecewise linear table lookup ([[x, y], …], clamped).
pub fn table(tab: &[(f64, f64)], x: f64) -> f64 {
    if tab.is_empty() { return 1.0; }
    if x <= tab[0].0 { return tab[0].1; }
    for w in tab.windows(2) {
        if x <= w[1].0 { let t = (x - w[0].0) / (w[1].0 - w[0].0).max(1e-300); return w[0].1 + t * (w[1].1 - w[0].1); }
    }
    tab.last().unwrap().1
}

pub fn read_table(v: &Value, key: &str) -> Vec<(f64, f64)> {
    let mut t: Vec<(f64, f64)> = v.get(key).and_then(|a| a.as_array()).map(|a| a.iter().filter_map(|p| { let p = p.as_array()?; Some((p.first()?.as_f64()?, p.get(1)?.as_f64()?)) }).collect()).unwrap_or_default();
    t.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    t
}

pub fn run_transient(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let t_end = model.setting_f("endTime", 0.1).max(1e-9);
    let steps = model.setting_u("steps", 100).clamp(2, 5000);
    let dt = t_end / steps as f64;
    let alpha_r = model.setting_f("alpha", 0.0);
    let beta_r = model.setting_f("beta", 0.0);
    let history = read_table(&model.job.settings, "history");
    let asm = assemble(model, true, None, ctx)?;
    let m = asm.m.as_ref().unwrap();
    let n = asm.n;
    // Newmark, average acceleration (γ = 1/2, β = 1/4).
    let (g, b) = (0.5, 0.25);
    let a0 = 1.0 / (b * dt * dt);
    let a1 = g / (b * dt);
    let mut c = m.scaled(alpha_r);
    if beta_r != 0.0 { c = c.axpy(beta_r, &asm.k); }
    let mut keff = asm.k.axpy(a0, m).axpy(a1, &c);
    let mut dummy = vec![0.0; n];
    let zero = vec![0.0; n];
    keff.constrain(&asm.fixed, &zero, &mut dummy);
    let pre = crate::sparse::precond(&keff, &asm.xs, 3);
    let mut u = vec![0.0; n];
    let mut v = vec![0.0; n];
    // Initial acceleration: the load at t = 0 against the mass (lumped approximation).
    let md = m.diag();
    let f_at = |t: f64| -> f64 { if history.is_empty() { 1.0 } else { table(&history, t) } };
    let mut acc: Vec<f64> = (0..n).map(|i| if asm.fixed[i] || md[i] <= 0.0 { 0.0 } else { asm.f[i] * f_at(0.0) / md[i] }).collect();
    let probes = model.probe_nodes(|| {
        // The loaded node farthest from the supports: the node with the largest static response guess (|f|).
        let mut best = (0.0, 0);
        for i in 0..model.mesh.ncorner { let s = asm.f[3 * i].abs() + asm.f[3 * i + 1].abs() + asm.f[3 * i + 2].abs(); if s > best.0 { best = (s, i); } }
        best.1
    });
    let probe = probes[0];
    let mut phist: Vec<[Vec<f64>; 3]> = probes.iter().map(|_| [vec![0.0], vec![0.0], vec![0.0]]).collect();
    let frames_wanted = model.setting_u("frames", 30).clamp(2, 120);
    let every = (steps / frames_wanted).max(1);
    let nc = model.mesh.ncorner;
    let mut times = vec![0.0];
    let mut hist = [vec![0.0], vec![0.0], vec![0.0]];
    let mut frames: Vec<Value> = Vec::new();
    let mut frame_times = Vec::new();
    let mut max_vm = vec![0.0f64; nc];
    let mut rhs = vec![0.0; n];
    for s in 1..=steps {
        let t = s as f64 * dt;
        // f_eff = f(t) + M(a0 u + a2 v + a3 a) + C(a1 u + a4 v + a5 a)
        let (a2, a3, a4, a5) = (1.0 / (b * dt), 1.0 / (2.0 * b) - 1.0, g / b - 1.0, dt * (g / (2.0 * b) - 1.0));
        let mu: Vec<f64> = (0..n).map(|i| a0 * u[i] + a2 * v[i] + a3 * acc[i]).collect();
        let cu: Vec<f64> = (0..n).map(|i| a1 * u[i] + a4 * v[i] + a5 * acc[i]).collect();
        let mm = m.mul(&mu);
        let cc = c.mul(&cu);
        let ft = f_at(t);
        for i in 0..n { rhs[i] = if asm.fixed[i] { 0.0 } else { asm.f[i] * ft + mm[i] + cc[i] }; }
        let mut un = u.clone();
        let info = pcg(&keff, &rhs, &mut un, pre.as_ref(), 1e-9, 20000, None)?;
        if !info.converged { return Err("solver.noConvergence".into()); }
        let an: Vec<f64> = (0..n).map(|i| a0 * (un[i] - u[i]) - a2 * v[i] - a3 * acc[i]).collect();
        let vn: Vec<f64> = (0..n).map(|i| v[i] + dt * ((1.0 - g) * acc[i] + g * an[i])).collect();
        u = un;
        v = vn;
        acc = an;
        times.push(t);
        for c3 in 0..3 { hist[c3].push(u[3 * probe + c3]); }
        for (pi, &pn) in probes.iter().enumerate() { for c3 in 0..3 { phist[pi][c3].push(u[3 * pn + c3]); } }
        if s % every == 0 || s == steps {
            let st = stress_of_vector(model, &u)?;
            let vm: Vec<f64> = (0..nc).map(|i| fem::von_mises(&st[i])).collect();
            for i in 0..nc { max_vm[i] = max_vm[i].max(vm[i]); }
            let disp: Vec<f64> = (0..3 * nc).map(|i| u[i]).collect();
            let dv = out.f32s(&disp);
            let vv = out.f32s(&vm);
            frames.push(json!({ "time": t, "vector": dv, "vonMises": vv }));
            frame_times.push(t);
        }
        if s % 5 == 0 { ctx.step(0.35 + 0.6 * s as f64 / steps as f64, "progress.transient")?; }
    }
    let st = stresses(model, &u, None)?;
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    let mv = out.f32s(&max_vm);
    out.set("transient", json!({ "times": times, "probe": probe, "probePoint": model.mesh.nodes[probe], "history": hist, "frames": frames, "maxVonMises": mv,
        "probes": probes.iter().zip(phist.iter()).map(|(&pn, h)| json!({ "node": pn, "point": model.mesh.nodes[pn], "history": h })).collect::<Vec<_>>() }));
    summary(model, out)?;
    Ok(())
}

/// Double-sum combination of modal responses: r = √(Σᵢ Σⱼ ρᵢⱼ rᵢ rⱼ) for every displacement dof and
/// stress component (ρ = identity gives SRSS). Negative sums (round-off) are clamped to zero.
fn combine(model: &Model, ui: &[Vec<f64>], si: &[Vec<[f64; 6]>], rho: &[Vec<f64>]) -> (Vec<f64>, Vec<[f64; 6]>) {
    let n = ui.first().map(|v| v.len()).unwrap_or(0);
    let nn = model.mesh.nnodes();
    let m = ui.len();
    let mut u = vec![0.0; n];
    for k in 0..n {
        let mut acc = 0.0;
        for i in 0..m { for j in 0..m { let r = rho[i][j]; if r != 0.0 { acc += r * ui[i][k] * ui[j][k]; } } }
        u[k] = acc.max(0.0).sqrt();
    }
    let mut st = vec![[0.0; 6]; nn];
    for k in 0..nn {
        for c in 0..6 {
            let mut acc = 0.0;
            for i in 0..m { for j in 0..m { let r = rho[i][j]; if r != 0.0 { acc += r * si[i][k][c] * si[j][k][c]; } } }
            st[k][c] = acc.max(0.0).sqrt();
        }
    }
    (u, st)
}

/// CQC correlation coefficient of two modes (equal damping ζ): Der Kiureghian.
pub fn cqc_rho(wi: f64, wj: f64, zeta: f64) -> f64 {
    let r = wj / wi;
    let z2 = zeta * zeta;
    8.0 * z2 * (1.0 + r) * r.powf(1.5) / ((1.0 - r * r).powi(2) + 4.0 * z2 * r * (1.0 + r).powi(2))
}

pub fn run_spectrum(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let nev = model.setting_u("modes", 12).clamp(1, 60);
    let spec = read_table(&model.job.settings, "spectrum");
    let dir = geom::normalize(vec3(&model.job.settings, "direction").unwrap_or([0.0, 0.0, 1.0]));
    let method = model.setting_s("combination", "srss");
    let zeta = model.setting_f("damping", 0.05);
    let asm = assemble(model, true, None, ctx)?;
    let md = ctx.sub(0.0, 0.85, |c| modal_basis(model, &asm, nev, c))?;
    let mut ui_all = Vec::new();
    let mut si_all = Vec::new();
    let mut ws = Vec::new();
    let mut table_rows = Vec::new();
    for (i, w) in md.w.iter().enumerate() {
        if *w <= 1e-9 { continue; }
        let f = w / (2.0 * std::f64::consts::PI);
        let sa = if spec.is_empty() { 9.80665 } else { table(&spec, f) };
        let g = geom::dot(md.gamma[i], dir);
        let scale = g * sa / (w * w);
        let ui: Vec<f64> = md.phi[i].iter().map(|p| p * scale).collect();
        si_all.push(stress_of_vector(model, &ui)?);
        ui_all.push(ui);
        ws.push(*w);
        table_rows.push(json!({ "mode": i + 1, "frequency": f, "acceleration": sa, "participation": g }));
    }
    let m = ws.len();
    let cqc = method == "cqc";
    let rho: Vec<Vec<f64>> = (0..m).map(|i| (0..m).map(|j| if i == j { 1.0 } else if cqc { cqc_rho(ws[i], ws[j], zeta) } else { 0.0 }).collect()).collect();
    let (u, s) = combine(model, &ui_all, &si_all, &rho);
    let nn = model.mesh.nnodes();
    let st = Stress { s, e: vec![[0.0; 6]; nn], gp: Vec::new() };
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    out.set("spectrum", json!({ "modes": table_rows, "combination": if cqc { "CQC" } else { "SRSS" }, "damping": zeta }));
    summary(model, out)?;
    Ok(())
}

pub fn run_random(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let nev = model.setting_u("modes", 12).clamp(1, 60);
    let psd = read_table(&model.job.settings, "psd");
    let zeta = model.setting_f("damping", 0.02);
    let dir = geom::normalize(vec3(&model.job.settings, "direction").unwrap_or([0.0, 0.0, 1.0]));
    let cross = model.setting_b("crossTerms", true);
    let asm = assemble(model, true, None, ctx)?;
    let md = ctx.sub(0.0, 0.85, |c| modal_basis(model, &asm, nev, c))?;
    let (fa, fb) = if psd.len() >= 2 { (psd[0].0.max(0.1), psd.last().unwrap().0) } else { (20.0, 2000.0) };
    let g2 = 9.80665f64.powi(2);
    // Modes with frequency, unit-participation responses aᵢ = Γᵢ φᵢ.
    let mut ws = Vec::new();
    let mut ui_all = Vec::new();
    let mut si_all = Vec::new();
    for (i, w) in md.w.iter().enumerate() {
        if *w <= 1e-9 { continue; }
        let g = geom::dot(md.gamma[i], dir);
        let ui: Vec<f64> = md.phi[i].iter().map(|p| p * g).collect();
        si_all.push(stress_of_vector(model, &ui)?);
        ui_all.push(ui);
        ws.push(*w);
    }
    // Cᵢⱼ = ∫ Re(Hᵢ Hⱼ*) S df on a log grid (S in g²/Hz → (m/s²)²/Hz), Hᵢ = 1 / (ωᵢ² − ω² + 2iζωᵢω).
    let m = ws.len();
    let steps = 800;
    let (la, lb) = (fa.ln(), fb.ln());
    let mut cmat = vec![vec![0.0; m]; m];
    let mut freqs = Vec::with_capacity(steps);
    for s in 0..steps {
        let f = (la + (lb - la) * (s as f64 + 0.5) / steps as f64).exp();
        let df = f * (lb - la) / steps as f64;
        let om = 2.0 * std::f64::consts::PI * f;
        let sv = if psd.is_empty() { 0.01 } else { table(&psd, f) } * g2;
        let h: Vec<(f64, f64)> = ws.iter().map(|w| { let (re, im) = (w * w - om * om, 2.0 * zeta * w * om); let d = re * re + im * im; (re / d, -im / d) }).collect();
        for i in 0..m {
            for j in 0..m {
                if !cross && i != j { continue; }
                cmat[i][j] += (h[i].0 * h[j].0 + h[i].1 * h[j].1) * sv * df;
            }
        }
        freqs.push(f);
    }
    let (u, s) = combine(model, &ui_all, &si_all, &cmat);
    let nn = model.mesh.nnodes();
    let st = Stress { s, e: vec![[0.0; 6]; nn], gp: Vec::new() };
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    // Response PSD of the most responsive node's displacement along the excitation (m²/Hz).
    let nc = model.mesh.ncorner;
    let node = (0..nc).max_by(|&a, &b| u[3 * a..3 * a + 3].iter().map(|v| v * v).sum::<f64>().partial_cmp(&u[3 * b..3 * b + 3].iter().map(|v| v * v).sum::<f64>()).unwrap()).unwrap_or(0);
    let mut rpsd = Vec::with_capacity(steps);
    for &f in &freqs {
        let om = 2.0 * std::f64::consts::PI * f;
        let sv = if psd.is_empty() { 0.01 } else { table(&psd, f) } * g2;
        let (mut re, mut im) = (0.0, 0.0);
        for (i, w) in ws.iter().enumerate() {
            let (hr, hi) = (w * w - om * om, 2.0 * zeta * w * om);
            let d = hr * hr + hi * hi;
            let a = geom::dot([ui_all[i][3 * node], ui_all[i][3 * node + 1], ui_all[i][3 * node + 2]], dir);
            re += a * hr / d;
            im -= a * hi / d;
        }
        rpsd.push((re * re + im * im) * sv);
    }
    let every = (steps / 200).max(1);
    out.set("random", json!({ "sigma": 1, "crossTerms": cross,
        "frequencies": ws.iter().map(|w| w / (2.0 * std::f64::consts::PI)).collect::<Vec<_>>(),
        "psdNode": node, "psdPoint": model.mesh.nodes[node],
        "responsePsd": { "frequencies": freqs.iter().step_by(every).collect::<Vec<_>>(), "values": rpsd.iter().step_by(every).collect::<Vec<_>>() } }));
    summary(model, out)?;
    Ok(())
}

/// Rainflow counting (ASTM E1049, the four-point method) of a load history: cycles as (range, mean,
/// count), with the half cycles of the residue counted as 0.5.
pub fn rainflow(history: &[f64]) -> Vec<(f64, f64, f64)> {
    // Turning points only.
    let mut tp: Vec<f64> = Vec::new();
    for &v in history {
        if let Some(&last) = tp.last() { if v == last { continue; } }
        if tp.len() >= 2 {
            let (a, b) = (tp[tp.len() - 2], tp[tp.len() - 1]);
            if (b - a) * (v - b) > 0.0 { tp.pop(); }
        }
        tp.push(v);
    }
    let mut out = Vec::new();
    let mut stack: Vec<f64> = Vec::new();
    for &p in &tp {
        stack.push(p);
        while stack.len() >= 3 {
            let n = stack.len();
            let x = (stack[n - 1] - stack[n - 2]).abs();
            let y = (stack[n - 2] - stack[n - 3]).abs();
            if x < y { break; }
            if n == 3 {
                out.push((y, 0.5 * (stack[0] + stack[1]), 0.5));
                stack.remove(0);
            } else {
                out.push((y, 0.5 * (stack[n - 2] + stack[n - 3]), 1.0));
                stack.remove(n - 2);
                stack.remove(n - 3);
            }
        }
    }
    for w in stack.windows(2) { out.push(((w[1] - w[0]).abs(), 0.5 * (w[0] + w[1]), 0.5)); }
    out.retain(|c| c.0 > 0.0);
    out
}

/// Cycles to failure (reversals 2N found by bisection) of the strain-life curve with Morrow's mean
/// stress correction: εa = (σf' − σm)/E (2N)^b + εf' (2N)^c.
fn strain_life_cycles(eps_a: f64, sm: f64, e: f64, sf: f64, b: f64, ef: f64, c: f64) -> f64 {
    let f = |rev: f64| (sf - sm).max(1.0) / e * rev.powf(b) + ef * rev.powf(c);
    if eps_a <= f(2e9) { return 1e9; }
    if eps_a >= f(1.0) { return 0.5; }
    let (mut lo, mut hi) = (0.0f64, 9.3f64); // log10 of reversals
    for _ in 0..80 {
        let mid = 0.5 * (lo + hi);
        if f(10f64.powf(mid)) > eps_a { lo = mid; } else { hi = mid; }
    }
    0.5 * 10f64.powf(0.5 * (lo + hi))
}

/// Neuber's rule on the cyclic stress–strain curve ε = σ/E + (σ/K')^(1/n'): the local elastic-plastic
/// stress and strain amplitudes from an elastic stress amplitude.
fn neuber(se: f64, e: f64, kp: f64, np: f64) -> (f64, f64) {
    if se <= 0.0 { return (0.0, 0.0); }
    let target = se * se / e;
    let mut s = se;
    for _ in 0..60 {
        let eps = s / e + (s / kp).powf(1.0 / np);
        let g = s * eps - target;
        let dg = eps + s * (1.0 / e + (1.0 / np) * (s / kp).powf(1.0 / np - 1.0) / kp);
        let next = (s - g / dg).max(1e-9 * se);
        if (next - s).abs() < 1e-10 * se { s = next; break; }
        s = next;
    }
    (s, s / e + (s / kp).powf(1.0 / np))
}

/// Fatigue from the static stresses: stress-life (Basquin with a mean-stress theory) or strain-life
/// (Coffin–Manson with Morrow, local strains by Neuber), for a constant amplitude or a load history
/// (rainflow counted, damage summed with Miner's rule). Life is in cycles, or in repeats of the history.
pub fn fatigue(model: &Model, out: &mut Out, st: &Stress) -> Result<(), String> {
    let s = &model.job.settings;
    let loading = s.get("loading").and_then(|v| v.as_str()).unwrap_or("fullyReversed");
    let method = s.get("method").and_then(|v| v.as_str()).unwrap_or("stressLife");
    let ratio = num(s, "ratio", -1.0);
    let theory = s.get("meanTheory").and_then(|v| v.as_str()).unwrap_or("goodman");
    let measure = s.get("stressMeasure").and_then(|v| v.as_str()).unwrap_or("vonMises");
    let factor = num(s, "loadScale", 1.0);
    let design = num(s, "designLife", 1e6).max(1.0);
    // The loading as cycles of the load factor (range, mean, count) per block.
    let cycles: Vec<(f64, f64, f64)> = match loading {
        "history" => {
            let h = read_table(s, "loadHistory");
            if h.len() < 2 { return Err("fatigue.noHistory".into()); }
            rainflow(&h.iter().map(|p| p.1).collect::<Vec<_>>())
        }
        "zeroBased" => vec![(1.0, 0.5, 1.0)],
        "ratio" => vec![(1.0 - ratio, 0.5 * (1.0 + ratio), 1.0)],
        _ => vec![(2.0, 0.0, 1.0)],
    };
    let nc = model.mesh.ncorner;
    let mut mat_of = vec![0usize; nc];
    for el in model.solid_elements() { for &c in &model.mesh.tets[el] { mat_of[c as usize] = model.mesh.region[el] as usize; } }
    let mut life = vec![0.0; nc];
    let mut damage = vec![0.0; nc];
    let mut sf = vec![0.0; nc];
    for i in 0..nc {
        let m = &model.mats[mat_of[i]];
        let p = crate::dense::principal3(st.s[i]);
        let signed = if p[0].abs() >= p[2].abs() { 1.0 } else { -1.0 };
        let eq = factor * match measure { "maxPrincipal" => p[0], _ => signed * fem::von_mises(&st.s[i]) };
        let (su, sy) = (m.ultimate.max(1.0), m.yield_strength.max(1.0));
        let (sfp, b) = (if m.fatigue_sf > 0.0 { m.fatigue_sf } else { 1.5 * su }, if m.fatigue_b < 0.0 { m.fatigue_b } else { -0.1 });
        let (efp, c) = (if m.fatigue_ef > 0.0 { m.fatigue_ef } else { 0.6 }, if m.fatigue_c < 0.0 { m.fatigue_c } else { -0.6 });
        let e = m.young.max(1.0);
        // Cyclic curve compatible with Basquin and Coffin–Manson: n' = b/c, K' = σf' / εf'^n'.
        let np = (b / c).clamp(0.05, 0.5);
        let kp = sfp / efp.powf(np);
        let cycles_to_failure = |sa: f64, sm: f64| -> f64 {
            if sa <= 0.0 { return 1e9; }
            if method == "strainLife" {
                let (_, eps_a) = neuber(sa, e, kp, np);
                strain_life_cycles(eps_a, sm, e, sfp, b, efp, c)
            } else {
                let sar = match theory {
                    "soderberg" => sa / (1.0 - sm / sy).max(1e-6),
                    "gerber" => sa / (1.0 - (sm / su).powi(2)).max(1e-6),
                    "none" => sa,
                    _ => if sm > 0.0 { sa / (1.0 - sm / su).max(1e-6) } else { sa },
                };
                if m.endurance > 0.0 && sar < m.endurance { 1e9 } else { (0.5 * (sar / sfp).powf(1.0 / b)).min(1e9) }
            }
        };
        // Damage of one block (Miner); for a single cycle per block that is 1/N.
        let block: f64 = cycles.iter().map(|&(r, mean, count)| count / cycles_to_failure(0.5 * r * eq.abs(), mean * eq).max(1e-300)).sum();
        let n = if block > 0.0 { (1.0 / block).min(1e9) } else { 1e9 };
        life[i] = n;
        damage[i] = design / n.max(1e-300);
        // Safety factor: the load scale that brings the life to the design life (bisection on the scale).
        let life_at = |k: f64| -> f64 {
            let d: f64 = cycles.iter().map(|&(r, mean, count)| count / cycles_to_failure(0.5 * r * k * eq.abs(), mean * k * eq).max(1e-300)).sum();
            if d > 0.0 { 1.0 / d } else { 1e12 }
        };
        sf[i] = if eq == 0.0 || life_at(15.0) >= design { 15.0 } else {
            let (mut lo, mut hi) = (0.0f64, 15.0f64);
            for _ in 0..50 { let mid = 0.5 * (lo + hi); if life_at(mid) >= design { lo = mid; } else { hi = mid; } }
            0.5 * (lo + hi)
        };
    }
    let imin = argmin(&life);
    let lv = out.f32s(&life);
    let dv = out.f32s(&damage);
    let sv = out.f32s(&sf);
    let counted: Vec<Value> = cycles.iter().map(|c| json!({ "range": c.0, "mean": c.1, "count": c.2 })).collect();
    out.set("fatigue", json!({ "fields": { "life": lv, "damage": dv, "safety": sv }, "minLife": life[imin], "minLifeNode": imin, "maxDamage": damage[imin],
        "minSafety": sf.iter().cloned().fold(f64::INFINITY, f64::min), "designLife": design, "method": method, "loading": loading, "cycles": counted, "perBlock": loading == "history" }));
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::run_job_json;
    use crate::out::{decode, read_f32};

    fn cantilever(analysis: &str, extra: &str, order: u8) -> serde_json::Value {
        let job = format!(r#"{{
          "analysis": "{analysis}", "unit": 0.001,
          "bodies": [{{ "id": "b1", "name": "Beam", "material": "steel", "shape": {{ "type": "box", "size": [100, 10, 10], "placement": {{ "position": [50, 0, 0] }} }} }}],
          "mesh": {{ "size": 2.5, "order": {order} }},
          "bcs": [
            {{ "id": "s1", "type": "fixed", "faces": [{{ "body": "b1", "c": [0, 0, 0], "n": [-1, 0, 0], "a": 100 }}] }},
            {{ "id": "l1", "type": "force", "vector": [0, 0, -1000], "faces": [{{ "body": "b1", "c": [100, 0, 0], "n": [1, 0, 0], "a": 100 }}] }}
          ],
          "settings": {{ {extra} }}
        }}"#);
        let bytes = run_job_json(&job, &mut |_, _| true).unwrap();
        let (v, blobs) = decode(&bytes).unwrap();
        let _ = read_f32(&blobs, &serde_json::json!({}));
        v
    }

    #[test]
    fn cantilever_deflection_matches_beam_theory() {
        // δ = F L³ / (3 E I), I = b h³ / 12 (shear adds a little for L/h = 10).
        let i = 0.01 * 0.01f64.powi(3) / 12.0;
        let exact = 1000.0 * 0.1f64.powi(3) / (3.0 * 200e9 * i);
        let v = cantilever("static", "", 2);
        let d = v["result"]["max"]["displacement"].as_f64().unwrap();
        assert!((d - exact).abs() / exact < 0.05, "tet10 {d} vs {exact}");
        // σ = M c / I at the root.
        let s = v["result"]["max"]["vonMises"].as_f64().unwrap();
        let sigma = 1000.0 * 0.1 * 0.005 / i;
        assert!(s > 0.7 * sigma && s < 1.6 * sigma, "stress {s} vs {sigma}");
        let r = &v["reactions"][0]["force"];
        assert!((r[2].as_f64().unwrap() - 1000.0).abs() < 1.0, "reaction {r}");
    }

    #[test]
    fn cantilever_first_frequency() {
        // f1 = (1.875²/2π) sqrt(EI / (ρ A L⁴))
        let i = 0.01 * 0.01f64.powi(3) / 12.0;
        let exact = 1.875f64.powi(2) / (2.0 * std::f64::consts::PI) * (200e9 * i / (7850.0 * 1e-4 * 0.1f64.powi(4))).sqrt();
        let v = cantilever("modal", r#""modes": 4"#, 2);
        let f = v["modes"][0]["frequency"].as_f64().unwrap();
        assert!((f - exact).abs() / exact < 0.05, "f1 {f} vs {exact}");
        let f2 = v["modes"][1]["frequency"].as_f64().unwrap();
        assert!((f2 - exact).abs() / exact < 0.05, "f2 {f2} (square section: a pair)");
    }

    #[test]
    fn cantilever_buckling_under_compression() {
        let job = r#"{
          "analysis": "buckling", "unit": 0.001,
          "bodies": [{ "id": "b1", "material": "steel", "shape": { "type": "box", "size": [200, 10, 10], "placement": { "position": [100, 0, 0] } } }],
          "mesh": { "size": 3.0, "order": 2 },
          "bcs": [
            { "type": "fixed", "faces": [{ "body": "b1", "c": [0, 0, 0], "n": [-1, 0, 0], "a": 100 }] },
            { "type": "force", "vector": [-1000, 0, 0], "faces": [{ "body": "b1", "c": [200, 0, 0], "n": [1, 0, 0], "a": 100 }] }
          ],
          "settings": { "modes": 2 }
        }"#;
        let bytes = crate::run_job_json(job, &mut |_, _| true).unwrap();
        let (v, _) = crate::out::decode(&bytes).unwrap();
        let i = 0.01f64.powi(4) / 12.0;
        let pcr = std::f64::consts::PI.powi(2) * 200e9 * i / (4.0 * 0.2f64.powi(2));
        let factor = v["modes"][0]["factor"].as_f64().unwrap();
        assert!((factor * 1000.0 - pcr).abs() / pcr < 0.06, "Pcr {} vs {pcr}", factor * 1000.0);
    }

    #[test]
    fn cqc_correlation() {
        use super::cqc_rho;
        assert!((cqc_rho(10.0, 10.0, 0.05) - 1.0).abs() < 1e-12);
        assert!(cqc_rho(10.0, 30.0, 0.05) < 0.01);
        assert!(cqc_rho(10.0, 10.5, 0.05) > 0.5);
    }

    #[test]
    fn spectrum_cqc_and_srss_agree_for_separated_modes() {
        let srss = cantilever("spectrum", r#""modes": 4, "combination": "srss""#, 1);
        let cqc = cantilever("spectrum", r#""modes": 4, "combination": "cqc", "damping": 0.05"#, 1);
        assert_eq!(cqc["spectrum"]["combination"], "CQC");
        let a = srss["result"]["max"]["displacement"].as_f64().unwrap();
        let b = cqc["result"]["max"]["displacement"].as_f64().unwrap();
        // The square section has close mode pairs, but they bend in different planes (orthogonal shapes):
        // the cross terms are small and the two combinations stay within a few percent.
        assert!(a > 0.0 && (a - b).abs() / a < 0.1, "srss {a} cqc {b}");
    }

    #[test]
    fn random_vibration_cross_terms() {
        let with = cantilever("random", r#""modes": 4, "psd": [[20, 0.01], [2000, 0.01]], "crossTerms": true"#, 1);
        let without = cantilever("random", r#""modes": 4, "psd": [[20, 0.01], [2000, 0.01]], "crossTerms": false"#, 1);
        let a = with["result"]["max"]["displacement"].as_f64().unwrap();
        let b = without["result"]["max"]["displacement"].as_f64().unwrap();
        assert!(a > 0.0 && b > 0.0 && (a - b).abs() / b < 0.2, "{a} vs {b}");
        assert!(with["random"]["responsePsd"]["values"].as_array().unwrap().len() > 50);
    }

    #[test]
    fn harmonic_reports_every_probe() {
        let job = r#"{ "analysis": "harmonic", "unit": 0.001,
          "bodies": [{ "id": "b1", "material": "steel", "shape": { "type": "box", "size": [100, 10, 10], "placement": { "position": [50, 0, 0] } } }],
          "mesh": { "size": 5, "order": 1 },
          "bcs": [
            { "type": "fixed", "faces": [{ "body": "b1", "c": [0, 0, 0], "n": [-1, 0, 0], "a": 100 }] },
            { "type": "force", "vector": [0, 0, -10], "faces": [{ "body": "b1", "c": [100, 0, 0], "n": [1, 0, 0], "a": 100 }] }
          ],
          "probes": [[100, 0, 5], [50, 0, 5]],
          "settings": { "fmax": 2000, "points": 20, "modes": 4 } }"#;
        let (v, _) = crate::out::decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        let p = v["harmonic"]["probes"].as_array().unwrap();
        assert_eq!(p.len(), 2);
        let tip = p[0]["amplitude"][2][0].as_f64().unwrap();
        let mid = p[1]["amplitude"][2][0].as_f64().unwrap();
        assert!(tip > mid && mid > 0.0, "tip {tip} mid {mid}");
    }

    fn stacked(kind: &str, analysis: &str) -> serde_json::Value {
        // Two blocks, the lower one fixed at its base, the upper one pressed down onto it.
        let job = format!(r#"{{ "analysis": "{analysis}", "unit": 0.001,
          "bodies": [
            {{ "id": "lo", "material": "steel", "shape": {{ "type": "box", "size": [20, 20, 10], "placement": {{ "position": [0, 0, 5] }} }} }},
            {{ "id": "up", "material": "steel", "shape": {{ "type": "box", "size": [20, 20, 10], "placement": {{ "position": [0, 0, 15] }} }} }}
          ],
          "mesh": {{ "size": 2.5, "order": 1 }},
          "contacts": [{{ "a": "lo", "b": "up", "type": "{kind}", "friction": 0.3 }}],
          "bcs": [
            {{ "id": "s", "type": "fixed", "faces": [{{ "body": "lo", "c": [0, 0, 0], "n": [0, 0, -1], "a": 400 }}] }},
            {{ "type": "pressure", "value": 1e6, "faces": [{{ "body": "up", "c": [0, 0, 20], "n": [0, 0, 1], "a": 400 }}] }},
            {{ "type": "frictionless", "faces": [{{ "body": "up", "c": [-10, 0, 15], "n": [-1, 0, 0], "a": 200 }}] }},
            {{ "type": "frictionless", "faces": [{{ "body": "up", "c": [0, -10, 15], "n": [0, -1, 0], "a": 200 }}] }}
          ], "settings": {{ "modes": 2 }} }}"#);
        crate::out::decode(&run_job_json(&job, &mut |_, _| true).unwrap()).unwrap().0
    }

    #[test]
    fn static_contact_takes_the_nonlinear_path() {
        let v = stacked("frictionless", "static");
        assert!(v["notes"].as_array().unwrap().iter().any(|n| n == "contact.nonlinearPath"), "{}", v["notes"]);
        // 1 MPa on 400 mm² = 400 N through the contact into the fixed base.
        let rz = v["reactions"][0]["force"][2].as_f64().unwrap();
        assert!((rz - 400.0).abs() < 20.0, "reaction {rz}");
        let m = stacked("frictional", "modal");
        assert!(m["notes"].as_array().unwrap().iter().any(|n| n == "contact.linearFrictional"));
    }

    fn beam_with(bc: &str, settings: &str) -> serde_json::Value {
        let job = format!(r#"{{ "analysis": "static", "unit": 0.001,
          "bodies": [{{ "id": "b1", "material": "steel", "shape": {{ "type": "box", "size": [100, 10, 10], "placement": {{ "position": [50, 0, 0] }} }} }}],
          "mesh": {{ "size": 2.5, "order": 2 }},
          "bcs": [ {{ "id": "s1", "type": "fixed", "faces": [{{ "body": "b1", "c": [0, 0, 0], "n": [-1, 0, 0], "a": 100 }}] }}, {bc} ],
          "settings": {{ {settings} }} }}"#);
        crate::out::decode(&run_job_json(&job, &mut |_, _| true).unwrap()).unwrap().0
    }
    const TIP: &str = r#""faces": [{ "body": "b1", "c": [100, 0, 0], "n": [1, 0, 0], "a": 100 }]"#;

    #[test]
    fn remote_force_at_the_face_matches_a_force() {
        let plain = beam_with(&format!(r#"{{ "type": "force", "vector": [0, 0, -1000], {TIP} }}"#), "");
        let d0 = plain["result"]["max"]["displacement"].as_f64().unwrap();
        for behavior in ["deformable", "rigid"] {
            let v = beam_with(&format!(r#"{{ "type": "remoteForce", "behavior": "{behavior}", "point": [100, 0, 0], "vector": [0, 0, -1000], {TIP} }}"#), "");
            let d = v["result"]["max"]["displacement"].as_f64().unwrap();
            assert!((d - d0).abs() / d0 < 0.03, "{behavior}: {d} vs {d0}");
            assert!((v["reactions"][0]["force"][2].as_f64().unwrap() - 1000.0).abs() < 2.0);
        }
    }

    #[test]
    fn remote_force_offset_adds_its_moment() {
        // 1000 N along +X at 50 mm above the axis: the root sees M = 50 N·m about −Y (bending down… or up).
        let v = beam_with(&format!(r#"{{ "type": "remoteForce", "behavior": "deformable", "point": [100, 0, 50], "vector": [1000, 0, 0], {TIP} }}"#), "");
        let my = v["reactions"][0]["moment"][1].as_f64().unwrap();
        let fx = v["reactions"][0]["force"][0].as_f64().unwrap();
        // Reaction moment about the origin: the applied one is r × F = (100, 0, 50) mm × (1000, 0, 0) → My = 50 N·m.
        assert!((fx + 1000.0).abs() < 2.0, "fx {fx}");
        assert!((my + 50.0).abs() < 1.5, "my {my}");
    }

    #[test]
    fn remote_displacement_moves_the_face_rigidly() {
        // The tip pushed 0.1 mm down at its centre, rotation free: the beam bends like a propped tip.
        let v = beam_with(&format!(r#"{{ "id": "r1", "type": "remoteDisplacement", "point": [100, 0, 0], "z": -1e-4, {TIP} }}"#), "");
        let uz = v["result"]["max"]["displacement"].as_f64().unwrap();
        assert!((uz - 1e-4).abs() < 1.5e-5, "tip {uz}");
        // Its reaction is the force that bends a cantilever 0.1 mm: P = 3 E I δ / L³ ≈ 50 N.
        let r = v["reactions"].as_array().unwrap().iter().find(|r| r["id"] == "r1").unwrap()["force"][2].as_f64().unwrap();
        let i = 0.01f64.powi(4) / 12.0;
        let p = 3.0 * 200e9 * i * 1e-4 / 0.1f64.powi(3);
        assert!((r.abs() - p).abs() / p < 0.1, "reaction {r} vs {p}");
    }

    #[test]
    fn bolt_carries_its_pretension() {
        // A bar held at both ends, pretensioned to 5 kN, then also pulled at its middle: still 5 kN in it.
        let job = r#"{ "analysis": "static", "unit": 0.001,
          "bodies": [{ "id": "bolt", "material": "steel", "shape": { "type": "cylinder", "radius": 5, "height": 60 } }],
          "mesh": { "size": 2, "order": 2 },
          "bcs": [
            { "type": "fixed", "faces": [{ "body": "bolt", "c": [0, 0, -30], "n": [0, 0, -1], "a": 78.5 }] },
            { "type": "fixed", "faces": [{ "body": "bolt", "c": [0, 0, 30], "n": [0, 0, 1], "a": 78.5 }] },
            { "id": "p", "type": "boltPretension", "bodies": ["bolt"], "axis": [0, 0, 1], "force": 5000 }
          ] }"#;
        let (v, _) = crate::out::decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        let f = v["bolts"][0]["force"].as_f64().unwrap();
        assert!((f - 5000.0).abs() < 5.0, "bolt force {f}");
        // Axial stress ≈ F / A in the shank.
        let a = std::f64::consts::PI * 25e-6;
        let s = v["result"]["max"]["vonMises"].as_f64().unwrap();
        assert!(s > 0.8 * 5000.0 / a, "stress {s}");
        let adj = v["bolts"][0]["adjustment"].as_f64().unwrap();
        assert!(adj > 0.0);
    }

    #[test]
    fn rainflow_counts_cycles() {
        use super::rainflow;
        // ASTM E1049 example: −2 1 −3 5 −1 3 −4 4 −2 → ranges 3 (0.5), 4 (1.5), 6 (0.5), 8 (1.0), 9 (0.5).
        let c = rainflow(&[-2.0, 1.0, -3.0, 5.0, -1.0, 3.0, -4.0, 4.0, -2.0]);
        let total = |r: f64| c.iter().filter(|x| (x.0 - r).abs() < 1e-9).map(|x| x.2).sum::<f64>();
        assert_eq!((total(3.0), total(4.0), total(6.0), total(8.0), total(9.0)), (0.5, 1.5, 0.5, 1.0, 0.5), "{c:?}");
    }

    #[test]
    fn strain_life_and_history_fatigue() {
        let base = |extra: &str| cantilever("static", &format!(r#""fatigue": true, "designLife": 1e5{extra}"#), 1);
        let sl = base("");
        let en = base(r#", "method": "strainLife""#);
        let l1 = sl["fatigue"]["minLife"].as_f64().unwrap();
        let l2 = en["fatigue"]["minLife"].as_f64().unwrap();
        assert!(l1 > 10.0 && l2 > 10.0, "{l1} {l2}");
        // 0 → 1 → −1 → 1 → −1 → 0 counts as 1½ full reversals and two small half cycles: a little less than
        // l1 / 1.5 blocks.
        let h = base(r#", "loading": "history", "loadHistory": [[0, 0], [1, 1], [2, -1], [3, 1], [4, -1], [5, 0]]"#);
        let lh = h["fatigue"]["minLife"].as_f64().unwrap();
        assert!(lh < l1 / 1.5 && lh > l1 / 2.0, "history {lh} vs {l1}");
        assert!(h["fatigue"]["cycles"].as_array().unwrap().len() >= 2);
    }

    #[test]
    fn fsi_flap_bends_downstream() {
        // A flap fixed at its base in a 20 m/s air stream: pushed (and bent) downstream.
        let job = r#"{ "analysis": "fsi", "unit": 0.001,
          "bodies": [{ "id": "f", "material": "aluminum", "shape": { "type": "box", "size": [4, 40, 60], "placement": { "position": [0, 0, 30] } } }],
          "mesh": { "size": 3, "order": 1 },
          "materials": { "air": { "name": "Air", "density": 1.225, "viscosity": 1.81e-5, "conductivity": 0.0262, "specificHeat": 1006 } },
          "bcs": [ { "type": "fixed", "faces": [{ "body": "f", "c": [0, 0, 0], "n": [0, 0, -1], "a": 160 }] } ],
          "settings": { "fluid": "air", "inletVelocity": [20, 0, 0], "maxSteps": 200, "cellSize": 6,
            "boundaries": { "xmin": { "type": "inlet", "velocity": [20, 0, 0] }, "xmax": { "type": "outlet" }, "zmin": { "type": "wall" } } } }"#;
        let (v, _) = crate::out::decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        let fx = v["fsi"]["fluidForce"][0].as_f64().unwrap();
        assert!(fx > 0.05, "fluid force {fx}");
        // The support takes the fluid's push.
        let rx = v["reactions"][0]["force"][0].as_f64().unwrap();
        assert!((rx + fx).abs() < 0.05 * fx.abs() + 1e-3, "reaction {rx} vs {fx}");
        assert!(v["result"]["max"]["displacement"].as_f64().unwrap() > 0.0);
        assert!(v["fluid"]["forces"].is_array());
    }
}
