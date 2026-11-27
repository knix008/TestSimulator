//! Nonlinear static analysis: Newton–Raphson with load steps (bisected when a step fails),
//! J2 plasticity with bilinear isotropic hardening, large deflection (total Lagrangian), and contact
//! on split interfaces (frictionless, frictional with Coulomb slip, no separation, rough, bonded).

use crate::fem::{self, Gp};
use crate::geom::{self, V3};
use crate::model::{enabled, kind, Model};
use crate::out::Out;
use crate::sparse::Csr;
use crate::structural::{self, Stress};
use crate::Ctx;
use serde_json::json;

#[derive(Clone, Copy, Default)]
pub struct State {
    pub ep: [f64; 6],
    pub alpha: f64,
}

/// J2 return mapping (small-strain form; also used on Green strains). Returns (stress, tangent, state).
pub fn j2(d: &[[f64; 6]; 6], e: f64, nu: f64, sy: f64, et: f64, eps: &[f64; 6], st: &State, plastic: bool) -> ([f64; 6], [[f64; 6]; 6], State) {
    let mut ee = *eps;
    for c in 0..6 { ee[c] -= st.ep[c]; }
    let s_tr = fem::mat6_vec(d, &ee);
    if !plastic || sy <= 0.0 { return (s_tr, *d, *st); }
    let g = e / (2.0 * (1.0 + nu));
    let h = if et > 0.0 && et < e { e * et / (e - et) } else { 0.0 };
    let p = (s_tr[0] + s_tr[1] + s_tr[2]) / 3.0;
    let dev = [s_tr[0] - p, s_tr[1] - p, s_tr[2] - p, s_tr[3], s_tr[4], s_tr[5]];
    let ss = dev[0] * dev[0] + dev[1] * dev[1] + dev[2] * dev[2] + 2.0 * (dev[3] * dev[3] + dev[4] * dev[4] + dev[5] * dev[5]);
    let q = (1.5 * ss).sqrt();
    let f = q - (sy + h * st.alpha);
    if f <= 0.0 { return (s_tr, *d, *st); }
    let dalpha = f / (3.0 * g + h);
    let beta = 1.0 - 3.0 * g * dalpha / q;
    let mut s = [0.0; 6];
    for c in 0..3 { s[c] = beta * dev[c] + p; }
    for c in 3..6 { s[c] = beta * dev[c]; }
    let mut ns = *st;
    // Plastic strain increment: Δα · 3/2 · s/q (engineering shear: doubled).
    for c in 0..3 { ns.ep[c] += dalpha * 1.5 * dev[c] / q; }
    for c in 3..6 { ns.ep[c] += dalpha * 3.0 * dev[c] / q; }
    ns.alpha += dalpha;
    // Continuum elastoplastic tangent: D − 9G²/(q²(3G + H)) · dev ⊗ dev.
    let c = 9.0 * g * g / (q * q * (3.0 * g + h));
    let mut dt = *d;
    for i in 0..6 { for j in 0..6 { dt[i][j] -= c * dev[i] * dev[j]; } }
    (s, dt, ns)
}

struct Elem { conn: Vec<u32>, dofs: Vec<usize>, gps: Vec<Gp>, region: usize }

fn nl_b(dn: &[V3], f: &[[f64; 3]; 3]) -> Vec<[[f64; 3]; 6]> {
    dn.iter().map(|d| {
        let mut b = [[0.0; 3]; 6];
        for i in 0..3 {
            b[0][i] = f[i][0] * d[0];
            b[1][i] = f[i][1] * d[1];
            b[2][i] = f[i][2] * d[2];
            b[3][i] = f[i][0] * d[1] + f[i][1] * d[0];
            b[4][i] = f[i][1] * d[2] + f[i][2] * d[1];
            b[5][i] = f[i][2] * d[0] + f[i][0] * d[2];
        }
        b
    }).collect()
}

struct Pair { a: usize, b: usize, n: V3, k: f64, kind: String, mu: f64 }

pub fn run_nonlinear(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let mesh = &model.mesh;
    let large = model.setting_b("largeDeflection", false);
    let plastic = model.setting_b("plasticity", true);
    let nsteps = model.setting_u("steps", 10).clamp(1, 200);
    let max_it = model.setting_u("maxIterations", 25).clamp(3, 100);
    let tol = model.setting_f("tolerance", 5e-3);
    // Linear assembly for the supports and the full external load (and the pattern).
    let base = structural::assemble(model, false, None, ctx)?;
    let n = base.n;
    let nel = if mesh.order() == 2 { 10 } else { 4 };
    let elems: Vec<Elem> = model.solid_elements().into_iter().map(|e| {
        let conn = mesh.element(e);
        let x: Vec<V3> = conn.iter().map(|&i| model.x[i as usize]).collect();
        let gps = fem::points(&x, fem::stiffness_degree(nel)).unwrap_or_default();
        let dofs = conn.iter().flat_map(|&c| [3 * c as usize, 3 * c as usize + 1, 3 * c as usize + 2]).collect();
        Elem { conn, dofs, gps, region: mesh.region[e] as usize }
    }).collect();
    if elems.iter().any(|e| e.gps.is_empty()) { return Err("mesh.degenerate".into()); }
    let ngp = elems[0].gps.len();
    let mut state = vec![State::default(); elems.len() * ngp];
    // Contact pairs (penalty).
    let e_ref = model.mats.iter().map(|m| m.young).fold(0.0, f64::max);
    let h = mesh.h * model.unit();
    let pairs: Vec<Pair> = mesh.contact_nodes.iter().map(|cn| {
        let ct = &model.job.contacts[model.contact_ids[cn.pair]];
        let area = cn.area * model.unit() * model.unit();
        Pair { a: cn.a as usize, b: cn.b as usize, n: cn.normal, k: 100.0 * e_ref * area.max(0.05 * h * h) / h, kind: ct.kind.clone(), mu: ct.friction }
    }).collect();
    let mut slip = vec![[0.0; 3]; pairs.len()];
    let mut u = vec![0.0; n];
    let fext = base.f.clone();
    let targets = base.values.clone();
    let probe = model.job.probes.first().and_then(|p| model.nearest_node(*p)).unwrap_or_else(|| {
        let mut best = (0.0, 0);
        for i in 0..mesh.ncorner { let s = fext[3 * i].abs() + fext[3 * i + 1].abs() + fext[3 * i + 2].abs() + targets[3 * i].abs() + targets[3 * i + 1].abs() + targets[3 * i + 2].abs(); if s > best.0 { best = (s, i); } }
        best.1
    });
    let mut curve = vec![json!({ "load": 0.0, "displacement": 0.0, "reaction": 0.0 })];
    let mut history = Vec::new();
    let mut lam = 0.0;
    let mut dl = 1.0 / nsteps as f64;
    let mut bisections = 0;
    let fixed_free: Vec<bool> = base.fixed.iter().zip(base.unused.iter()).map(|(f, u)| *f && !*u).collect();
    while lam < 1.0 - 1e-12 {
        let target = (lam + dl).min(1.0);
        let mut trial_u = u.clone();
        let mut trial_state = state.clone();
        let mut trial_slip = slip.clone();
        let mut converged = false;
        let mut iters = 0;
        let mut last_res = f64::INFINITY;
        for it in 0..max_it {
            iters = it + 1;
            // Tangent and internal forces.
            let mut kt = base.k.same_pattern();
            let mut fint = vec![0.0; n];
            let mut new_state = state.clone();
            for (ei, el) in elems.iter().enumerate() {
                let mat = &model.mats[el.region];
                let d = fem::d_iso(mat.young, mat.poisson);
                let ue: Vec<f64> = el.dofs.iter().map(|&q| trial_u[q]).collect();
                let m = el.dofs.len();
                let mut ke = vec![0.0; m * m];
                let mut fe = vec![0.0; m];
                for (g, gp) in el.gps.iter().enumerate() {
                    let mut hg = [[0.0; 3]; 3];
                    for (a, dna) in gp.dn.iter().enumerate() { for i in 0..3 { for j in 0..3 { hg[i][j] += ue[3 * a + i] * dna[j]; } } }
                    let mut f = crate::dense::identity3();
                    let eps = if large {
                        for i in 0..3 { for j in 0..3 { f[i][j] += hg[i][j]; } }
                        let mut c = [[0.0; 3]; 3];
                        for i in 0..3 { for j in 0..3 { c[i][j] = 0.5 * (hg[i][j] + hg[j][i] + (0..3).map(|k| hg[k][i] * hg[k][j]).sum::<f64>()); } }
                        [c[0][0], c[1][1], c[2][2], 2.0 * c[0][1], 2.0 * c[1][2], 2.0 * c[2][0]]
                    } else {
                        [hg[0][0], hg[1][1], hg[2][2], hg[0][1] + hg[1][0], hg[1][2] + hg[2][1], hg[2][0] + hg[0][2]]
                    };
                    let (s, dt, ns) = j2(&d, mat.young, mat.poisson, mat.yield_strength, mat.tangent, &eps, &state[ei * ngp + g], plastic);
                    new_state[ei * ngp + g] = ns;
                    let b = nl_b(&gp.dn, &f);
                    let nn = gp.dn.len();
                    for a in 0..nn {
                        for i in 0..3 {
                            let mut v = 0.0;
                            for r in 0..6 { v += b[a][r][i] * s[r]; }
                            fe[3 * a + i] += gp.w * v;
                        }
                    }
                    // Material tangent Bᵀ Dt B.
                    let db: Vec<[[f64; 3]; 6]> = b.iter().map(|bb| { let mut r = [[0.0; 3]; 6]; for i in 0..6 { for c in 0..3 { for j in 0..6 { r[i][c] += dt[i][j] * bb[j][c]; } } } r }).collect();
                    for a in 0..nn {
                        for bn in 0..nn {
                            for i in 0..3 {
                                for j in 0..3 {
                                    let mut v = 0.0;
                                    for r in 0..6 { v += b[a][r][i] * db[bn][r][j]; }
                                    ke[(3 * a + i) * m + 3 * bn + j] += gp.w * v;
                                }
                            }
                        }
                    }
                    if large {
                        let st = [[s[0], s[3], s[5]], [s[3], s[1], s[4]], [s[5], s[4], s[2]]];
                        for a in 0..nn {
                            for bn in 0..nn {
                                let mut gv = 0.0;
                                for i in 0..3 { for j in 0..3 { gv += gp.dn[a][i] * st[i][j] * gp.dn[bn][j]; } }
                                for i in 0..3 { ke[(3 * a + i) * m + 3 * bn + i] += gp.w * gv; }
                            }
                        }
                    }
                }
                kt.add_element(&el.dofs, &ke);
                for (a, &q) in el.dofs.iter().enumerate() { fint[q] += fe[a]; }
            }
            // Supports given as springs in the linear assembly (frictionless, elastic): their K − K_elements part.
            add_support_springs(model, &mut kt, &mut fint, &trial_u)?;
            // Contact.
            for (pi, p) in pairs.iter().enumerate() {
                let rel: V3 = [trial_u[3 * p.b] - trial_u[3 * p.a], trial_u[3 * p.b + 1] - trial_u[3 * p.a + 1], trial_u[3 * p.b + 2] - trial_u[3 * p.a + 2]];
                let gn = geom::dot(rel, p.n);
                let mut springs: Vec<(V3, f64, f64)> = Vec::new(); // (direction, stiffness, force along direction on b)
                // Touching counts as closed (the bodies start in contact).
                let closed = gn <= 1e-9 * h;
                match p.kind.as_str() {
                    "frictionless" | "frictional" => {
                        if closed { springs.push((p.n, p.k, p.k * gn.min(0.0))); }
                        if p.kind == "frictional" && closed {
                            let tan = geom::sub(rel, geom::scale(p.n, gn));
                            let trial = geom::sub(tan, slip[pi]);
                            let ft = p.k * geom::norm(trial);
                            let limit = p.mu * p.k * (-gn);
                            if ft <= limit || ft == 0.0 {
                                for dir in [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] {
                                    let dd = geom::sub(dir, geom::scale(p.n, geom::dot(dir, p.n)));
                                    springs.push((dir, 0.0, 0.0));
                                    let _ = dd;
                                }
                                // Stick: a tangential spring on the trial direction.
                                let t = geom::normalize(trial);
                                if geom::norm(t) > 0.0 { springs.push((t, p.k, p.k * geom::norm(trial))); }
                                trial_slip[pi] = slip[pi];
                            } else {
                                let t = geom::normalize(trial);
                                // Slip: the force is the friction limit, no tangential stiffness.
                                springs.push((t, 0.0, limit));
                                trial_slip[pi] = geom::sub(tan, geom::scale(t, limit / p.k));
                            }
                        }
                    }
                    _ => {
                        if p.kind == "rough" || p.kind == "bonded" {
                            for dir in [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] { springs.push((dir, p.k, p.k * geom::dot(rel, dir))); }
                        } else {
                            springs.push((p.n, p.k, p.k * gn));
                        }
                    }
                }
                for (dir, k, force) in springs {
                    for i in 0..3 {
                        fint[3 * p.b + i] += force * dir[i];
                        fint[3 * p.a + i] -= force * dir[i];
                        for j in 0..3 {
                            let v = k * dir[i] * dir[j];
                            if v == 0.0 { continue; }
                            kt.add(3 * p.a + i, 3 * p.a + j, v);
                            kt.add(3 * p.b + i, 3 * p.b + j, v);
                            kt.add(3 * p.a + i, 3 * p.b + j, -v);
                            kt.add(3 * p.b + i, 3 * p.a + j, -v);
                        }
                    }
                }
            }
            let mut r: Vec<f64> = (0..n).map(|i| target * fext[i] - fint[i]).collect();
            let fnorm = (0..n).filter(|&i| !base.fixed[i]).map(|i| (target * fext[i]).powi(2)).sum::<f64>().sqrt().max(fint.iter().map(|v| v * v).sum::<f64>().sqrt() * 1e-3).max(1e-9 * e_ref * h * h);
            let rnorm = (0..n).filter(|&i| !base.fixed[i]).map(|i| r[i] * r[i]).sum::<f64>().sqrt();
            let du_target: Vec<f64> = (0..n).map(|i| if base.fixed[i] { target * targets[i] - trial_u[i] } else { 0.0 }).collect();
            let disp_done = du_target.iter().all(|v| v.abs() < 1e-14);
            last_res = rnorm / fnorm;
            if std::env::var_os("SIM_NL_DEBUG").is_some() { eprintln!("step {target:.3} it {it} res {last_res:.3e} disp_done {disp_done}"); }
            if it > 0 && last_res < tol && disp_done {
                converged = true;
                trial_state = new_state;
                break;
            }
            kt.constrain(&base.fixed, &du_target, &mut r);
            let du = crate::sparse::solve_mesh(&kt, &r, &model.x, 3, &mut Ctx::silent(), 0.0, 1.0).map_err(|e| if e == "solver.notPositive" { "nonlinear.unstable".to_string() } else { e })?;
            for i in 0..n { trial_u[i] += du[i]; }
            trial_state = new_state;
            if trial_u.iter().any(|v| !v.is_finite()) { break; }
        }
        if converged {
            u = trial_u;
            state = trial_state;
            slip = trial_slip;
            lam = target;
            let pd = (u[3 * probe].powi(2) + u[3 * probe + 1].powi(2) + u[3 * probe + 2].powi(2)).sqrt();
            let reaction = reaction_sum(model, &base, &u, &fixed_free);
            curve.push(json!({ "load": lam, "displacement": pd, "reaction": reaction }));
            history.push(json!({ "load": lam, "iterations": iters, "residual": last_res }));
            ctx.step(0.3 + 0.65 * lam, "progress.nonlinear")?;
            if bisections > 0 && dl < 1.0 / nsteps as f64 { dl = (dl * 1.5).min(1.0 / nsteps as f64); }
        } else {
            bisections += 1;
            dl *= 0.5;
            history.push(json!({ "load": target, "iterations": iters, "residual": last_res, "bisected": true }));
            if bisections > 8 || dl < 1e-4 { return Err("nonlinear.noConvergence".into()); }
        }
    }
    // Results: nodal averages of the element stresses (Cauchy for large deflection).
    let nn = mesh.nnodes();
    let mut s = vec![[0.0; 6]; nn];
    let mut e6 = vec![[0.0; 6]; nn];
    let mut pe = vec![0.0; nn];
    let mut cnt = vec![0.0; nn];
    for (ei, el) in elems.iter().enumerate() {
        let mat = &model.mats[el.region];
        let d = fem::d_iso(mat.young, mat.poisson);
        let ue: Vec<f64> = el.dofs.iter().map(|&q| u[q]).collect();
        let mut sa = [0.0; 6];
        let mut ea = [0.0; 6];
        let mut aa = 0.0;
        for (g, gp) in el.gps.iter().enumerate() {
            let eps = fem::strain(&gp.dn, &ue);
            let st = &state[ei * ngp + g];
            let (sv, _, _) = j2(&d, mat.young, mat.poisson, mat.yield_strength, mat.tangent, &eps, st, false);
            for c in 0..6 { sa[c] += sv[c] / ngp as f64; ea[c] += eps[c] / ngp as f64; }
            aa += st.alpha / ngp as f64;
        }
        for &c in &el.conn { let c = c as usize; for q in 0..6 { s[c][q] += sa[q]; e6[c][q] += ea[q]; } pe[c] += aa; cnt[c] += 1.0; }
    }
    for i in 0..nn { if cnt[i] > 0.0 { for q in 0..6 { s[i][q] /= cnt[i]; e6[i][q] /= cnt[i]; } pe[i] /= cnt[i]; } }
    let st = Stress { s, e: e6, gp: Vec::new() };
    let mut res = structural::put_fields(model, out, &u, &st, "");
    let pf = out.f32s(&pe[..mesh.ncorner]);
    res["fields"]["plasticStrain"] = pf;
    res["max"]["plasticStrain"] = json!(pe.iter().cloned().fold(0.0, f64::max));
    out.set("result", res);
    out.set("nonlinear", json!({ "curve": curve, "history": history, "probe": probe, "probePoint": mesh.nodes[probe], "largeDeflection": large, "plasticity": plastic, "contactPairs": pairs.len() }));
    structural::summary(model, out)?;
    Ok(())
}

/// Frictionless and elastic supports are springs: their contribution to K and to the internal force.
fn add_support_springs(model: &Model, kt: &mut Csr, fint: &mut [f64], u: &[f64]) -> Result<(), String> {
    let e_ref = model.mats.iter().map(|m| m.young).fold(0.0, f64::max);
    let h = model.mesh.h * model.unit();
    for bc in &model.job.bcs {
        if !enabled(bc) || !matches!(kind(bc), "frictionless" | "elastic") { continue; }
        let faces = model.faces_of(bc);
        for (node, w, nrm) in model.face_weights(&faces) {
            let s = if kind(bc) == "frictionless" { 1e3 * e_ref * w.max(h * h * 0.05) / h } else { crate::model::num(bc, "stiffness", 1e9) * w };
            let nd = node as usize;
            let un = u[3 * nd] * nrm[0] + u[3 * nd + 1] * nrm[1] + u[3 * nd + 2] * nrm[2];
            for i in 0..3 {
                fint[3 * nd + i] += s * un * nrm[i];
                for j in 0..3 { kt.add(3 * nd + i, 3 * nd + j, s * nrm[i] * nrm[j]); }
            }
        }
    }
    Ok(())
}

fn reaction_sum(model: &Model, base: &structural::Assembly, u: &[f64], fixed: &[bool]) -> f64 {
    // Magnitude of the total reaction at the fixed dofs (linear estimate K u − f on those dofs).
    let ku = base.k.mul(u);
    let mut r = [0.0; 3];
    for i in 0..base.n { if fixed[i] { r[i % 3] += ku[i]; } }
    let _ = model;
    (r[0] * r[0] + r[1] * r[1] + r[2] * r[2]).sqrt()
}

#[cfg(test)]
mod tests {
    use crate::out::decode;
    use crate::run_job_json;

    fn bar(settings: &str, force: f64) -> serde_json::Value {
        let job = format!(r#"{{ "analysis": "nonlinear", "unit": 0.001,
          "bodies": [{{ "id": "b1", "material": "steel", "shape": {{ "type": "box", "size": [50, 10, 10], "placement": {{ "position": [25, 0, 0] }} }} }}],
          "mesh": {{ "size": 5, "order": 1 }},
          "bcs": [
            {{ "type": "fixed", "faces": [{{ "body": "b1", "c": [0, 0, 0], "n": [-1, 0, 0], "a": 100 }}] }},
            {{ "type": "force", "vector": [{force}, 0, 0], "faces": [{{ "body": "b1", "c": [50, 0, 0], "n": [1, 0, 0], "a": 100 }}] }}
          ], "settings": {{ {settings} }} }}"#);
        decode(&run_job_json(&job, &mut |_, _| true).unwrap()).unwrap().0
    }

    #[test]
    fn elastic_matches_linear() {
        let v = bar(r#""plasticity": false, "steps": 2"#, 10000.0);
        let d = v["result"]["max"]["displacement"].as_f64().unwrap();
        // δ = F L / (E A) with lateral clamping at the root (a little stiffer).
        let exact = 10000.0 * 0.05 / (200e9 * 1e-4);
        assert!((d - exact).abs() / exact < 0.08, "{d} vs {exact}");
    }

    #[test]
    fn plastic_bar_yields() {
        // 35 kN on 100 mm² = 350 MPa > 250 MPa yield: plastic strain appears, displacement well above elastic.
        let v = bar(r#""plasticity": true, "steps": 8"#, 35000.0);
        let pe = v["result"]["max"]["plasticStrain"].as_f64().unwrap();
        assert!(pe > 1e-3, "plastic strain {pe}");
        let d = v["result"]["max"]["displacement"].as_f64().unwrap();
        let elastic = 35000.0 * 0.05 / (200e9 * 1e-4);
        assert!(d > 2.0 * elastic, "{d} vs elastic {elastic}");
    }
}
