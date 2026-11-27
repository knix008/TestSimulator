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
    let nn = mesh.nnodes();
    let n = 3 * nn;
    let solid = model.solid_elements();
    // Contact pairs couple nodes that share no element: they join the pattern as two-node elements.
    let mut k = Csr::pattern(nn, 3, &mut solid.iter().map(|&e| mesh.element(e)).chain(mesh.contact_nodes.iter().map(|c| vec![c.a, c.b])));
    let mut m = if with_mass { Some(k.same_pattern()) } else { None };
    let mut f = vec![0.0; n];
    let mut used = vec![false; nn];
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
    for node in 0..nn { if !used[node] { for c in 0..3 { fixed[3 * node + c] = true; unused[3 * node + c] = true; } } }
    let mut asm = Assembly { k, m, f, fixed, values, n, unused };
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
                    _ => {
                        // Moment: f_i = w_i (I⁻¹M) × d_i with I = Σ w (|d|² 1 − d dᵀ).
                        let mv = vec3(bc, "vector").unwrap_or([0.0; 3]);
                        let mut c = [0.0; 3];
                        for (node, w, _) in &wts { for q in 0..3 { c[q] += model.x[*node as usize][q] * w / total; } }
                        let mut im = [[0.0; 3]; 3];
                        for (node, w, _) in &wts {
                            let d = geom::sub(model.x[*node as usize], c);
                            let dd = geom::dot(d, d);
                            for i in 0..3 { for j in 0..3 { im[i][j] += w * (if i == j { dd } else { 0.0 } - d[i] * d[j]); } }
                        }
                        if let Some((inv, _)) = crate::dense::inv3(&im) {
                            let v = [inv[0][0] * mv[0] + inv[0][1] * mv[1] + inv[0][2] * mv[2], inv[1][0] * mv[0] + inv[1][1] * mv[1] + inv[1][2] * mv[2], inv[2][0] * mv[0] + inv[2][1] * mv[1] + inv[2][2] * mv[2]];
                            for (node, w, _) in &wts {
                                let d = geom::sub(model.x[*node as usize], c);
                                let fv = geom::cross(v, d);
                                for q in 0..3 { asm.f[3 * *node as usize + q] += scale * w * fv[q]; }
                            }
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
        let dirs: Vec<V3> = match ct.kind.as_str() {
            "rough" | "bonded" => vec![[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
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
pub fn solve_static(model: &Model, asm: &Assembly, ctx: &mut Ctx) -> Result<Vec<f64>, String> {
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
    let u = crate::sparse::solve_mesh(&k, &f, &model.x, 3, ctx, 0.35, 0.85)?;
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
    let mut list = Vec::new();
    for bc in &model.job.bcs {
        if !enabled(bc) || !matches!(kind(bc), "fixed" | "displacement" | "frictionless" | "elastic") { continue; }
        let faces = model.faces_of(bc);
        let nodes = model.mesh.face_nodes(&faces);
        let mut r = [0.0; 3];
        let mut mo = [0.0; 3];
        for &nd in &nodes {
            let nd = nd as usize;
            let f = [ku[3 * nd] - asm.f[3 * nd], ku[3 * nd + 1] - asm.f[3 * nd + 1], ku[3 * nd + 2] - asm.f[3 * nd + 2]];
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

pub fn run_static(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let uniform = uniform_temperature(model);
    let th = Thermal { nodal: None, uniform, reference: model.setting_f("referenceTemperature", 22.0) };
    let asm = assemble(model, false, if uniform.is_some() { Some(&th) } else { None }, ctx)?;
    let u = solve_static(model, &asm, ctx)?;
    ctx.step(0.9, "progress.results")?;
    let st = stresses(model, &u, if uniform.is_some() { Some(&th) } else { None })?;
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    out.set("reactions", reactions(model, &asm, &u));
    let energy = 0.5 * u.iter().zip(asm.f.iter()).map(|(a, b)| a * b).sum::<f64>();
    out.set("strainEnergy", json!(energy));
    summary(model, out)?;
    if model.setting_b("fatigue", false) { fatigue(model, out, &st)?; }
    Ok(())
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
pub fn modes(model: &Model, asm: &Assembly, nev: usize, ctx: &mut Ctx) -> Result<(Vec<f64>, Vec<Vec<f64>>), String> {
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
    let pre = crate::sparse::precond(&ks, &model.x, 3);
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
    let pre = crate::sparse::precond(&k, &model.x, 3);
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
    let probe = model.job.probes.first().and_then(|p| model.nearest_node(*p)).unwrap_or_else(|| {
        // Default probe: the node that moves most in the first mode.
        let p = &md.phi[0];
        (0..model.mesh.ncorner).max_by(|&a, &b| {
            let ma = p[3 * a].powi(2) + p[3 * a + 1].powi(2) + p[3 * a + 2].powi(2);
            let mb = p[3 * b].powi(2) + p[3 * b + 1].powi(2) + p[3 * b + 2].powi(2);
            ma.partial_cmp(&mb).unwrap()
        }).unwrap_or(0)
    });
    let mut freqs = Vec::with_capacity(npts);
    let mut amp = [Vec::new(), Vec::new(), Vec::new()];
    let mut phase = [Vec::new(), Vec::new(), Vec::new()];
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
    let pre = crate::sparse::precond(&keff, &model.x, 3);
    let mut u = vec![0.0; n];
    let mut v = vec![0.0; n];
    // Initial acceleration: the load at t = 0 against the mass (lumped approximation).
    let md = m.diag();
    let f_at = |t: f64| -> f64 { if history.is_empty() { 1.0 } else { table(&history, t) } };
    let mut acc: Vec<f64> = (0..n).map(|i| if asm.fixed[i] || md[i] <= 0.0 { 0.0 } else { asm.f[i] * f_at(0.0) / md[i] }).collect();
    let probe = model.job.probes.first().and_then(|p| model.nearest_node(*p)).unwrap_or_else(|| {
        // The loaded node farthest from the supports: the node with the largest static response guess (|f|).
        let mut best = (0.0, 0);
        for i in 0..model.mesh.ncorner { let s = asm.f[3 * i].abs() + asm.f[3 * i + 1].abs() + asm.f[3 * i + 2].abs(); if s > best.0 { best = (s, i); } }
        best.1
    });
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
    out.set("transient", json!({ "times": times, "probe": probe, "probePoint": model.mesh.nodes[probe], "history": hist, "frames": frames, "maxVonMises": mv }));
    summary(model, out)?;
    Ok(())
}

pub fn run_spectrum(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let nev = model.setting_u("modes", 12).clamp(1, 60);
    let spec = read_table(&model.job.settings, "spectrum");
    let dir = geom::normalize(vec3(&model.job.settings, "direction").unwrap_or([0.0, 0.0, 1.0]));
    let asm = assemble(model, true, None, ctx)?;
    let md = ctx.sub(0.0, 0.85, |c| modal_basis(model, &asm, nev, c))?;
    let nn = model.mesh.nnodes();
    let mut u2 = vec![0.0; asm.n];
    let mut s2 = vec![[0.0; 6]; nn];
    let mut table_rows = Vec::new();
    for (i, w) in md.w.iter().enumerate() {
        if *w <= 1e-9 { continue; }
        let f = w / (2.0 * std::f64::consts::PI);
        let sa = if spec.is_empty() { 9.80665 } else { table(&spec, f) };
        let g = geom::dot(md.gamma[i], dir);
        let scale = g * sa / (w * w);
        let ui: Vec<f64> = md.phi[i].iter().map(|p| p * scale).collect();
        let si = stress_of_vector(model, &ui)?;
        for k in 0..asm.n { u2[k] += ui[k] * ui[k]; }
        for k in 0..nn { for c in 0..6 { s2[k][c] += si[k][c] * si[k][c]; } }
        table_rows.push(json!({ "mode": i + 1, "frequency": f, "acceleration": sa, "participation": g }));
    }
    let u: Vec<f64> = u2.iter().map(|v| v.sqrt()).collect();
    let s: Vec<[f64; 6]> = s2.iter().map(|v| { let mut o = [0.0; 6]; for c in 0..6 { o[c] = v[c].sqrt(); } o }).collect();
    let st = Stress { s, e: vec![[0.0; 6]; nn], gp: Vec::new() };
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    out.set("spectrum", json!({ "modes": table_rows, "combination": "SRSS" }));
    summary(model, out)?;
    Ok(())
}

pub fn run_random(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let nev = model.setting_u("modes", 12).clamp(1, 60);
    let psd = read_table(&model.job.settings, "psd");
    let zeta = model.setting_f("damping", 0.02);
    let dir = geom::normalize(vec3(&model.job.settings, "direction").unwrap_or([0.0, 0.0, 1.0]));
    let asm = assemble(model, true, None, ctx)?;
    let md = ctx.sub(0.0, 0.85, |c| modal_basis(model, &asm, nev, c))?;
    let (fa, fb) = if psd.len() >= 2 { (psd[0].0.max(0.1), psd.last().unwrap().0) } else { (20.0, 2000.0) };
    let g2 = 9.80665f64.powi(2);
    let nn = model.mesh.nnodes();
    let mut u2 = vec![0.0; asm.n];
    let mut s2 = vec![[0.0; 6]; nn];
    for (i, w) in md.w.iter().enumerate() {
        if *w <= 1e-9 { continue; }
        // ∫ |H|² S df on a log grid (S in g²/Hz → (m/s²)²/Hz).
        let steps = 400;
        let mut integral = 0.0;
        let (la, lb) = (fa.ln(), fb.ln());
        for s in 0..steps {
            let f = (la + (lb - la) * (s as f64 + 0.5) / steps as f64).exp();
            let df = f * (lb - la) / steps as f64;
            let om = 2.0 * std::f64::consts::PI * f;
            let h2 = 1.0 / ((w * w - om * om).powi(2) + (2.0 * zeta * w * om).powi(2));
            let sv = if psd.is_empty() { 0.01 } else { table(&psd, f) };
            integral += h2 * sv * g2 * df;
        }
        let g = geom::dot(md.gamma[i], dir);
        let scale = g * integral.sqrt();
        let ui: Vec<f64> = md.phi[i].iter().map(|p| p * scale).collect();
        let si = stress_of_vector(model, &ui)?;
        for k in 0..asm.n { u2[k] += ui[k] * ui[k]; }
        for k in 0..nn { for c in 0..6 { s2[k][c] += si[k][c] * si[k][c]; } }
    }
    let u: Vec<f64> = u2.iter().map(|v| v.sqrt()).collect();
    let s: Vec<[f64; 6]> = s2.iter().map(|v| { let mut o = [0.0; 6]; for c in 0..6 { o[c] = v[c].sqrt(); } o }).collect();
    let st = Stress { s, e: vec![[0.0; 6]; nn], gp: Vec::new() };
    let res = put_fields(model, out, &u, &st, "");
    out.set("result", res);
    out.set("random", json!({ "sigma": 1, "frequencies": md.w.iter().map(|w| w / (2.0 * std::f64::consts::PI)).collect::<Vec<_>>() }));
    summary(model, out)?;
    Ok(())
}

/// Stress-life fatigue from the static stresses (constant amplitude).
pub fn fatigue(model: &Model, out: &mut Out, st: &Stress) -> Result<(), String> {
    let s = &model.job.settings;
    let loading = s.get("loading").and_then(|v| v.as_str()).unwrap_or("fullyReversed");
    let ratio = num(s, "ratio", -1.0);
    let theory = s.get("meanTheory").and_then(|v| v.as_str()).unwrap_or("goodman");
    let measure = s.get("stressMeasure").and_then(|v| v.as_str()).unwrap_or("vonMises");
    let factor = num(s, "loadScale", 1.0);
    let design = num(s, "designLife", 1e6).max(1.0);
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
        let (sa, sm) = match loading {
            "zeroBased" => (eq.abs() / 2.0, eq / 2.0),
            "ratio" => ((1.0 - ratio) / 2.0 * eq.abs(), (1.0 + ratio) / 2.0 * eq),
            _ => (eq.abs(), 0.0),
        };
        let (su, sy) = (m.ultimate.max(1.0), m.yield_strength.max(1.0));
        let sar = match theory {
            "soderberg" => sa / (1.0 - sm / sy).max(1e-6),
            "gerber" => sa / (1.0 - (sm / su).powi(2)).max(1e-6),
            "none" => sa,
            _ => if sm > 0.0 { sa / (1.0 - sm / su).max(1e-6) } else { sa },
        };
        let (sfp, b) = (if m.fatigue_sf > 0.0 { m.fatigue_sf } else { 1.5 * su }, if m.fatigue_b < 0.0 { m.fatigue_b } else { -0.1 });
        let n = if sar <= 0.0 || (m.endurance > 0.0 && sar < m.endurance) { 1e9 } else { (0.5 * (sar / sfp).powf(1.0 / b)).min(1e9) };
        life[i] = n;
        damage[i] = design / n.max(1e-300);
        let s_design = sfp * (2.0 * design).powf(b);
        sf[i] = if sar > 0.0 { (s_design / sar).min(15.0) } else { 15.0 };
    }
    let imin = argmin(&life);
    let lv = out.f32s(&life);
    let dv = out.f32s(&damage);
    let sv = out.f32s(&sf);
    out.set("fatigue", json!({ "fields": { "life": lv, "damage": dv, "safety": sv }, "minLife": life[imin], "minLifeNode": imin, "maxDamage": damage[imin], "minSafety": sf.iter().cloned().fold(f64::INFINITY, f64::min), "designLife": design }));
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
}
