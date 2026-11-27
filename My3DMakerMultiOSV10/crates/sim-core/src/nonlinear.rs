//! Nonlinear static analysis: Newton–Raphson with load steps (bisected when a step fails),
//! J2 plasticity with bilinear isotropic hardening, large deflection (total Lagrangian), and contact
//! on split interfaces (frictionless, frictional with Coulomb slip, no separation, rough, bonded).

use crate::fem::{self, Gp};
use crate::geom::{self, V3};
use crate::model::{enabled, kind, Material, Model};
use crate::out::Out;
use crate::sparse::Csr;
use crate::structural::{self, Stress};
use crate::Ctx;
use serde_json::{json, Value};

#[derive(Clone, Copy, Default)]
pub struct State {
    /// Inelastic strain (plastic and creep).
    pub ep: [f64; 6],
    /// Equivalent plastic strain.
    pub alpha: f64,
    /// Equivalent creep strain.
    pub creep: f64,
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

/// Second Piola–Kirchhoff stress of the compressible Mooney–Rivlin solid at the Green strain E (Voigt,
/// engineering shears): S = 2 ∂W/∂C, W = c10 (Ī₁ − 3) + c01 (Ī₂ − 3) + (J − 1)² / d1.
/// None when the element is turned inside out.
pub fn hyper_stress(mat: &Material, e: &[f64; 6]) -> Option<[f64; 6]> {
    let c = [[1.0 + 2.0 * e[0], e[3], e[5]], [e[3], 1.0 + 2.0 * e[1], e[4]], [e[5], e[4], 1.0 + 2.0 * e[2]]];
    let (ci, det) = crate::dense::inv3(&c)?;
    if !(det > 1e-12) { return None; }
    let j = det.sqrt();
    let i1 = c[0][0] + c[1][1] + c[2][2];
    let cc: f64 = (0..3).map(|a| (0..3).map(|b| c[a][b] * c[b][a]).sum::<f64>()).sum();
    let i2 = 0.5 * (i1 * i1 - cc);
    let j23 = j.powf(-2.0 / 3.0);
    let j43 = j23 * j23;
    let vol = if mat.d1 > 0.0 { 2.0 / mat.d1 * (j - 1.0) * j } else { 0.0 };
    let mut s = [[0.0; 3]; 3];
    for a in 0..3 {
        for b in 0..3 {
            let id = if a == b { 1.0 } else { 0.0 };
            let d1 = j23 * (id - i1 / 3.0 * ci[a][b]);
            let d2 = j43 * (i1 * id - c[a][b] - 2.0 / 3.0 * i2 * ci[a][b]);
            s[a][b] = 2.0 * (mat.c10 * d1 + mat.c01 * d2) + vol * ci[a][b];
        }
    }
    Some([s[0][0], s[1][1], s[2][2], s[0][1], s[1][2], s[2][0]])
}

/// Stress and tangent (∂S/∂E, by central differences) of the hyperelastic solid.
pub fn hyperelastic(mat: &Material, e: &[f64; 6]) -> Option<([f64; 6], [[f64; 6]; 6])> {
    let s0 = hyper_stress(mat, e)?;
    let mut d = [[0.0; 6]; 6];
    let h = 1e-7;
    for j in 0..6 {
        let mut ep = *e;
        let mut em = *e;
        ep[j] += h;
        em[j] -= h;
        let (sp, sm) = (hyper_stress(mat, &ep)?, hyper_stress(mat, &em)?);
        for i in 0..6 { d[i][j] = (sp[i] - sm[i]) / (2.0 * h); }
    }
    // Symmetric by construction of W; average away round-off.
    for i in 0..6 { for j in 0..i { let v = 0.5 * (d[i][j] + d[j][i]); d[i][j] = v; d[j][i] = v; } }
    Some((s0, d))
}

/// Cauchy stress (σ = F S Fᵀ / J) and Green strain of a hyperelastic point from its displacements.
fn cauchy_hyper(mat: &Material, dn: &[V3], ue: &[f64]) -> Option<([f64; 6], [f64; 6])> {
    let mut f = crate::dense::identity3();
    for (a, d) in dn.iter().enumerate() { for i in 0..3 { for j in 0..3 { f[i][j] += ue[3 * a + i] * d[j]; } } }
    let mut c = [[0.0; 3]; 3];
    for i in 0..3 { for j in 0..3 { c[i][j] = (0..3).map(|k| f[k][i] * f[k][j]).sum(); } }
    let e = [0.5 * (c[0][0] - 1.0), 0.5 * (c[1][1] - 1.0), 0.5 * (c[2][2] - 1.0), c[0][1], c[1][2], c[2][0]];
    let s = hyper_stress(mat, &e)?;
    let sm = [[s[0], s[3], s[5]], [s[3], s[1], s[4]], [s[5], s[4], s[2]]];
    let j = f[0][0] * (f[1][1] * f[2][2] - f[1][2] * f[2][1]) - f[0][1] * (f[1][0] * f[2][2] - f[1][2] * f[2][0]) + f[0][2] * (f[1][0] * f[2][1] - f[1][1] * f[2][0]);
    let mut sig = [[0.0; 3]; 3];
    for i in 0..3 { for k in 0..3 { sig[i][k] = (0..3).map(|a| (0..3).map(|b| f[i][a] * sm[a][b] * f[k][b]).sum::<f64>()).sum::<f64>() / j; } }
    Some(([sig[0][0], sig[1][1], sig[2][2], sig[0][1], sig[1][2], sig[2][0]], e))
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
    let large = model.setting_b("largeDeflection", false);
    let plastic = model.setting_b("plasticity", true);
    let nsteps = model.setting_u("steps", 10).clamp(1, 200);
    solve(model, out, ctx, large, plastic, nsteps)?;
    Ok(())
}

/// The Newton solution; writes the result, reactions and the load curve, returns the nodal stresses.
pub fn solve(model: &Model, out: &mut Out, ctx: &mut Ctx, large: bool, plastic: bool, nsteps: usize) -> Result<Stress, String> {
    let mesh = &model.mesh;
    // Friction (stick / slip switching) converges more slowly: more iterations by default.
    let frictional = model.contact_ids.iter().any(|&i| model.job.contacts[i].kind == "frictional");
    let max_it = model.setting_u("maxIterations", if frictional { 50 } else { 25 }).clamp(3, 200);

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
    // Normal gap of each pair at the last converged step.
    let mut gn_conv = vec![0.0f64; pairs.len()];
    let mut u = vec![0.0; n];
    let fext = base.f.clone();
    // Bolt pretension: the bolts' shortening (from the linear superposition) ramps in with the load.
    let bolt_list = structural::bolts_of(model);
    let mut eigen: Vec<(u32, [f64; 6])> = Vec::new();
    if !bolt_list.is_empty() {
        let u_lin = structural::solve_static(model, &base, &mut Ctx::silent())?;
        let (scales, _) = structural::bolt_scales(model, &base, &bolt_list, &u_lin, &mut Ctx::silent())?;
        eigen = bolt_list.iter().zip(scales.iter()).map(|(b, sc)| (b.region, b.unit.map(|v| v * sc))).collect();
    }
    let targets = base.values.clone();
    let probes = model.probe_nodes(|| {
        let mut best = (0.0, 0);
        for i in 0..mesh.ncorner { let s = fext[3 * i].abs() + fext[3 * i + 1].abs() + fext[3 * i + 2].abs() + targets[3 * i].abs() + targets[3 * i + 1].abs() + targets[3 * i + 2].abs(); if s > best.0 { best = (s, i); } }
        best.1
    });
    let probe = probes[0];
    let mut pcurve: Vec<Vec<f64>> = probes.iter().map(|_| vec![0.0]).collect();
    let mut curve = vec![json!({ "load": 0.0, "displacement": 0.0, "reaction": 0.0 })];
    let mut history = Vec::new();
    // With pretensioned bolts the load runs in two phases: the bolts tighten over the first half of
    // the load steps, the other loads follow over the second half (as a bolted joint is assembled).
    let two_phase = !eigen.is_empty();
    let bolt_at = |t: f64| if two_phase { (2.0 * t).min(1.0) } else { t };
    let load_at = |t: f64| if two_phase { (2.0 * t - 1.0).max(0.0) } else { t };
    let nsteps = if two_phase { nsteps.max(2) } else { nsteps };
    let mut lam = 0.0;
    let mut dl = 1.0 / nsteps as f64;
    let mut bisections = 0;
    let mut last_fint = vec![0.0; n];
    let mut last_fint_el = vec![0.0; n];
    // Creep after the load is on: time steps (adaptive) to the creep time.
    let creep_on = model.setting_b("creep", false) && model.mats.iter().any(|m| m.creeps());
    let t_creep = model.setting_f("creepTime", 3.6e6).max(0.0);
    let mut tc = 0.0f64;
    let mut dtc = t_creep / model.setting_u("creepSteps", 20).clamp(1, 1000) as f64;
    let mut creep_bisect = 0;
    let mut creep_hist: Vec<Value> = vec![json!({ "time": 0.0, "displacement": probes.iter().map(|_| 0.0).collect::<Vec<_>>(), "creepStrain": 0.0 })];
    // Stresses at the integration points of the last converged state (for the creep rate).
    let mut last_s: Vec<[f64; 6]> = vec![[0.0; 6]; elems.len() * ngp];
    let fixed_free: Vec<bool> = base.fixed.iter().zip(base.unused.iter()).map(|(f, u)| *f && !*u).collect();
    while lam < 1.0 - 1e-12 || (creep_on && tc < t_creep * (1.0 - 1e-9)) {
        let creeping = lam >= 1.0 - 1e-12;
        let target = if creeping { 1.0 } else { (lam + dl).min(1.0) };
        // The starting state of the step: in the creep phase with the creep of this time step added
        // (explicit, Norton time hardening; the step shrinks until no point creeps more than half its
        // elastic strain).
        let mut step_state = state.clone();
        let mut dt_used = 0.0;
        if creeping {
            loop {
                let dt = dtc.min(t_creep - tc);
                let mut ok = true;
                for (ei, el) in elems.iter().enumerate() {
                    let mat = &model.mats[el.region];
                    if !mat.creeps() || mat.is_hyper() { continue; }
                    for g in 0..ngp {
                        let sg = last_s[ei * ngp + g];
                        let q = fem::von_mises(&sg);
                        if q <= 0.0 { continue; }
                        let m1 = mat.creep_m + 1.0;
                        let de = mat.creep_a * q.powf(mat.creep_n) * ((tc + dt).powf(m1) - tc.powf(m1)) / m1;
                        if de > 0.5 * q / mat.young { ok = false; break; }
                        let pm = (sg[0] + sg[1] + sg[2]) / 3.0;
                        let st = &mut step_state[ei * ngp + g];
                        // Flow along the deviatoric stress (engineering shears doubled).
                        for c in 0..3 { st.ep[c] += 1.5 * de * (sg[c] - pm) / q; }
                        for c in 3..6 { st.ep[c] += 3.0 * de * sg[c] / q; }
                        st.creep += de;
                    }
                    if !ok { break; }
                }
                if ok { dt_used = dt; break; }
                dtc *= 0.5;
                step_state = state.clone();
                if dtc < 1e-9 * t_creep.max(1.0) { return Err("nonlinear.creepTooFast".into()); }
            }
        }
        let mut new_s: Vec<[f64; 6]> = vec![[0.0; 6]; elems.len() * ngp];
        let mut bad = false;
        let mut trial_u = u.clone();
        let mut trial_state = state.clone();
        let mut trial_slip = slip.clone();
        let mut converged = false;
        // Slip direction of each pair at the previous iteration (this step).
        let mut slip_dir = vec![[0.0f64; 3]; pairs.len()];
        let mut iters = 0;
        let mut last_res = f64::INFINITY;
        for it in 0..max_it {
            iters = it + 1;
            // Tangent and internal forces.
            let mut kt = base.k.same_pattern();
            let mut fint = vec![0.0; n];
            // Size of the element forces (not assembled: self-balanced states such as a bolt preload
            // have small assembled forces but large element ones) — the scale of the residual.
            let mut elem_norm2 = 0.0f64;
            let mut new_state = step_state.clone();
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
                    let hyper = mat.is_hyper();
                    let lg = large || hyper;
                    let eps = if lg {
                        for i in 0..3 { for j in 0..3 { f[i][j] += hg[i][j]; } }
                        let mut c = [[0.0; 3]; 3];
                        for i in 0..3 { for j in 0..3 { c[i][j] = 0.5 * (hg[i][j] + hg[j][i] + (0..3).map(|k| hg[k][i] * hg[k][j]).sum::<f64>()); } }
                        [c[0][0], c[1][1], c[2][2], 2.0 * c[0][1], 2.0 * c[1][2], 2.0 * c[2][0]]
                    } else {
                        [hg[0][0], hg[1][1], hg[2][2], hg[0][1] + hg[1][0], hg[1][2] + hg[2][1], hg[2][0] + hg[0][2]]
                    };
                    let mut eps = eps;
                    if let Some(e0) = eigen.iter().find(|e| e.0 as usize == el.region) { for c in 0..6 { eps[c] -= bolt_at(target) * e0.1[c]; } }
                    let (s, dt, ns) = if hyper {
                        match hyperelastic(mat, &eps) {
                            Some((s, dt)) => (s, dt, step_state[ei * ngp + g]),
                            None => { bad = true; ([0.0; 6], d, step_state[ei * ngp + g]) }
                        }
                    } else { j2(&d, mat.young, mat.poisson, mat.yield_strength, mat.tangent, &eps, &step_state[ei * ngp + g], plastic) };
                    new_state[ei * ngp + g] = ns;
                    new_s[ei * ngp + g] = s;
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
                    if lg {
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
                elem_norm2 += fe.iter().map(|v| v * v).sum::<f64>();
            }
            // An element turned inside out (hyperelastic J ≤ 0): the step is too large.
            if bad { break; }
            // Element forces only (reactions of spring supports are their springs' forces).
            let fint_el = fint.clone();
            // Supports given as springs in the linear assembly (frictionless, elastic): their K − K_elements part.
            add_support_springs(model, &mut kt, &mut fint, &trial_u)?;
            structural::add_pilots(model, &base.pilots, &mut kt, Some((&mut fint, &trial_u)));
            // Contact.
            let dbg = std::env::var_os("SIM_NL_DEBUG").is_some();
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
                            // Regularised Coulomb friction: an elastic stick (tangential penalty kt, a tenth of
                            // the normal one) up to μ·N, then slip at μ·N. Slip uses the secant stiffness
                            // (force / slip trial) in the contact plane: always positive, so the Newton
                            // iteration settles monotonically.
                            let kt = 0.1 * p.k;
                            let tan = geom::sub(rel, geom::scale(p.n, gn));
                            let trial = geom::sub(tan, slip[pi]);
                            let ft = kt * geom::norm(trial);
                            // The friction limit from the normal force of the last converged step (lagged),
                            // except in the first step.
                            let gref = if lam > 0.0 { gn_conv[pi].min(gn) } else { gn };
                            let limit = p.mu * p.k * (-gref).max(0.0);
                            let a = if p.n[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
                            let t1 = geom::normalize(geom::cross(p.n, a));
                            let t2 = geom::cross(p.n, t1);
                            if ft <= limit {
                                for t in [t1, t2] { springs.push((t, kt, kt * geom::dot(trial, t))); }
                                trial_slip[pi] = slip[pi];
                            } else {
                                let t = geom::normalize(trial);
                                if it >= 2 && geom::dot(t, slip_dir[pi]) > 0.98 {
                                    // Steady slip direction: the exact tangent of the slip (none along it,
                                    // limit / |trial| across it) converges much faster than the secant.
                                    springs.push((t, 0.0, limit));
                                    springs.push((geom::cross(p.n, t), limit / geom::norm(trial).max(1e-300), 0.0));
                                } else {
                                    let ks = kt * limit / ft.max(1e-300);
                                    for t in [t1, t2] { springs.push((t, ks, ks * geom::dot(trial, t))); }
                                }
                                slip_dir[pi] = t;
                                trial_slip[pi] = geom::sub(tan, geom::scale(t, limit / kt));
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
                if dbg { for (dir, k, f) in &springs { if !k.is_finite() || !f.is_finite() || *k < 0.0 || !dir.iter().all(|v| v.is_finite()) { eprintln!("bad spring pair {pi} gn {gn:e} k {k:e} f {f:e} dir {dir:?}"); } } }
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
            let lf = load_at(target);
            let mut r: Vec<f64> = (0..n).map(|i| lf * fext[i] - fint[i]).collect();
            let fnorm = (0..n).filter(|&i| !base.fixed[i]).map(|i| (lf * fext[i]).powi(2)).sum::<f64>().sqrt().max(elem_norm2.sqrt() * 1e-3).max(1e-9 * e_ref * h * h);
            let rnorm = (0..n).filter(|&i| !base.fixed[i]).map(|i| r[i] * r[i]).sum::<f64>().sqrt();
            let du_target: Vec<f64> = (0..n).map(|i| if base.fixed[i] { lf * targets[i] - trial_u[i] } else { 0.0 }).collect();
            let disp_done = du_target.iter().all(|v| v.abs() < 1e-14);
            last_res = rnorm / fnorm;
            if std::env::var_os("SIM_NL_DEBUG").is_some() { eprintln!("step {target:.3} it {it} res {last_res:.3e} disp_done {disp_done}"); }
            if it > 0 && last_res < tol && disp_done {
                converged = true;
                last_fint = fint.clone();
                last_fint_el = fint_el;
                trial_state = new_state;
                last_s = new_s.clone();
                break;
            }
            kt.constrain(&base.fixed, &du_target, &mut r);
            let du = crate::sparse::solve_mesh(&kt, &r, &base.xs, 3, &mut Ctx::silent(), 0.0, 1.0).map_err(|e| if e == "solver.notPositive" { "nonlinear.unstable".to_string() } else { e })?;
            for i in 0..n { trial_u[i] += du[i]; }
            trial_state = new_state;
            if trial_u.iter().any(|v| !v.is_finite()) { break; }
        }
        if converged && creeping {
            u = trial_u;
            state = trial_state;
            slip = trial_slip;
            tc += dt_used;
            let maxc = state.iter().map(|s| s.creep).fold(0.0, f64::max);
            creep_hist.push(json!({ "time": tc, "displacement": probes.iter().map(|&pn| (u[3 * pn].powi(2) + u[3 * pn + 1].powi(2) + u[3 * pn + 2].powi(2)).sqrt()).collect::<Vec<_>>(), "creepStrain": maxc }));
            ctx.step(0.6 + 0.35 * tc / t_creep.max(1e-300), "progress.creep")?;
            dtc *= 1.5;
            continue;
        }
        if creeping {
            creep_bisect += 1;
            dtc *= 0.5;
            if creep_bisect > 40 { return Err("nonlinear.noConvergence".into()); }
            continue;
        }
        if converged {
            u = trial_u;
            state = trial_state;
            slip = trial_slip;
            if creep_on && target >= 1.0 - 1e-12 {
                let first = probes.iter().map(|&pn| (u[3 * pn].powi(2) + u[3 * pn + 1].powi(2) + u[3 * pn + 2].powi(2)).sqrt()).collect::<Vec<_>>();
                creep_hist[0] = json!({ "time": 0.0, "displacement": first, "creepStrain": 0.0 });
            }
            for (pi, p) in pairs.iter().enumerate() { gn_conv[pi] = (0..3).map(|c| (u[3 * p.b + c] - u[3 * p.a + c]) * p.n[c]).sum(); }
            lam = target;
            let pd = (u[3 * probe].powi(2) + u[3 * probe + 1].powi(2) + u[3 * probe + 2].powi(2)).sqrt();
            let reaction = reaction_sum(model, &base, &u, &fixed_free);
            for (pi, &pn) in probes.iter().enumerate() { pcurve[pi].push((u[3 * pn].powi(2) + u[3 * pn + 1].powi(2) + u[3 * pn + 2].powi(2)).sqrt()); }
            curve.push(json!({ "load": lam, "displacement": pd, "reaction": reaction }));
            history.push(json!({ "load": lam, "iterations": iters, "residual": last_res }));
            ctx.step(0.3 + if creep_on { 0.3 } else { 0.65 } * lam, "progress.nonlinear")?;
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
    let mut ce = vec![0.0; nn];
    let mut cnt = vec![0.0; nn];
    for (ei, el) in elems.iter().enumerate() {
        let mat = &model.mats[el.region];
        let d = fem::d_iso(mat.young, mat.poisson);
        let ue: Vec<f64> = el.dofs.iter().map(|&q| u[q]).collect();
        let mut sa = [0.0; 6];
        let mut ea = [0.0; 6];
        let mut aa = 0.0;
        let mut ca = 0.0;
        for (g, gp) in el.gps.iter().enumerate() {
            let st = &state[ei * ngp + g];
            let (sv, eps) = if mat.is_hyper() {
                // Cauchy stress σ = F S Fᵀ / J and the Green strain.
                cauchy_hyper(mat, &gp.dn, &ue).unwrap_or(([0.0; 6], [0.0; 6]))
            } else {
                let mut eps = fem::strain(&gp.dn, &ue);
                if let Some(e0) = eigen.iter().find(|e| e.0 as usize == el.region) { for c in 0..6 { eps[c] -= e0.1[c]; } }
                (j2(&d, mat.young, mat.poisson, mat.yield_strength, mat.tangent, &eps, st, false).0, eps)
            };
            for c in 0..6 { sa[c] += sv[c] / ngp as f64; ea[c] += eps[c] / ngp as f64; }
            aa += st.alpha / ngp as f64;
            ca += st.creep / ngp as f64;
        }
        for &c in &el.conn { let c = c as usize; for q in 0..6 { s[c][q] += sa[q]; e6[c][q] += ea[q]; } pe[c] += aa; ce[c] += ca; cnt[c] += 1.0; }
    }
    for i in 0..nn { if cnt[i] > 0.0 { for q in 0..6 { s[i][q] /= cnt[i]; e6[i][q] /= cnt[i]; } pe[i] /= cnt[i]; ce[i] /= cnt[i]; } }
    let st = Stress { s, e: e6, gp: Vec::new() };
    // Mesh nodes: element forces less the loads; pilot nodes: their coupling forces less the loads.
    let nmesh3 = 3 * mesh.nnodes();
    let residual: Vec<f64> = (0..n).map(|i| if i < nmesh3 { last_fint_el[i] } else { last_fint[i] } - fext[i]).collect();
    out.set("reactions", structural::reactions_with_pilots(model, &base.pilots, &residual));
    if !bolt_list.is_empty() {
        out.set("bolts", serde_json::Value::Array(bolt_list.iter().map(|b| json!({ "id": b.id, "force": structural::bolt_force(model, b, &u, &eigen), "length": b.length })).collect()));
    }
    out.set("strainEnergy", json!(0.5 * u.iter().zip(fext.iter()).map(|(a, b)| a * b).sum::<f64>()));
    let mut res = structural::put_fields(model, out, &u, &st, "");
    let pf = out.f32s(&pe[..mesh.ncorner]);
    res["fields"]["plasticStrain"] = pf;
    res["max"]["plasticStrain"] = json!(pe.iter().cloned().fold(0.0, f64::max));
    if creep_on {
        let cf = out.f32s(&ce[..mesh.ncorner]);
        res["fields"]["creepStrain"] = cf;
        res["max"]["creepStrain"] = json!(ce.iter().cloned().fold(0.0, f64::max));
        out.set("creep", json!({ "time": t_creep, "history": creep_hist, "probes": probes.iter().map(|&pn| json!({ "node": pn, "point": mesh.nodes[pn] })).collect::<Vec<_>>() }));
    }
    out.set("result", res);
    out.set("nonlinear", json!({ "curve": curve, "history": history, "probe": probe, "probePoint": mesh.nodes[probe], "largeDeflection": large, "plasticity": plastic, "contactPairs": pairs.len(),
        "probes": probes.iter().zip(pcurve.iter()).map(|(&pn, h)| json!({ "node": pn, "point": mesh.nodes[pn], "displacement": h })).collect::<Vec<_>>() }));
    structural::summary(model, out)?;
    Ok(st)
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

    #[test]
    fn frictional_contact_sticks_below_its_limit() {
        // 400 N pressing, μ = 0.3: a 60 N push stays stuck and goes through the friction into the base.
        let job = r#"{ "analysis": "static", "unit": 0.001,
  "bodies": [
    { "id": "lo", "material": "steel", "shape": { "type": "box", "size": [20, 20, 10], "placement": { "position": [0, 0, 5] } } },
    { "id": "up", "material": "steel", "shape": { "type": "box", "size": [20, 20, 10], "placement": { "position": [0, 0, 15] } } }
  ],
  "mesh": { "size": 2.5, "order": 1 },
  "contacts": [{ "a": "lo", "b": "up", "type": "frictional", "friction": 0.3 }],
  "bcs": [
    { "id": "s", "type": "fixed", "faces": [{ "body": "lo", "c": [0, 0, 0], "n": [0, 0, -1], "a": 400 }] },
    { "type": "pressure", "value": 1e6, "faces": [{ "body": "up", "c": [0, 0, 20], "n": [0, 0, 1], "a": 400 }] },
    { "type": "force", "vector": [60, 0, 0], "faces": [{ "body": "up", "c": [-10, 0, 15], "n": [-1, 0, 0], "a": 200 }] },
    { "type": "frictionless", "faces": [{ "body": "up", "c": [0, -10, 15], "n": [0, -1, 0], "a": 200 }] }
  ], "settings": {} }"#;
        let v = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap().0;
        let r = &v["reactions"][0]["force"];
        assert!((r[0].as_f64().unwrap() + 60.0).abs() < 3.0, "shear reaction {r}");
        assert!((r[2].as_f64().unwrap() - 400.0).abs() < 10.0, "normal reaction {r}");
    }

    #[test]
    fn rubber_uniaxial_stretch_matches_mooney_rivlin() {
        // λ = 1.5 under symmetry supports: P = 2 (c10 + c01/λ)(λ − 1/λ²) = 1.196 MPa → 119.6 N on 100 mm².
        let job = r#"{ "analysis": "nonlinear", "unit": 0.001,
          "bodies": [{ "id": "r", "material": "rubber", "shape": { "type": "box", "size": [20, 10, 10], "placement": { "position": [10, 5, 5] } } }],
          "mesh": { "size": 2.5, "order": 2 },
          "bcs": [
            { "id": "sx", "type": "frictionless", "faces": [{ "body": "r", "c": [0, 5, 5], "n": [-1, 0, 0], "a": 100 }] },
            { "type": "frictionless", "faces": [{ "body": "r", "c": [10, 0, 5], "n": [0, -1, 0], "a": 200 }] },
            { "type": "frictionless", "faces": [{ "body": "r", "c": [10, 5, 0], "n": [0, 0, -1], "a": 200 }] },
            { "type": "displacement", "x": 0.01, "faces": [{ "body": "r", "c": [20, 5, 5], "n": [1, 0, 0], "a": 100 }] }
          ], "settings": { "plasticity": false, "steps": 6 } }"#;
        let v = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap().0;
        let f = v["reactions"][0]["force"][0].as_f64().unwrap().abs();
        assert!((f - 119.6).abs() / 119.6 < 0.06, "force {f}");
    }

    #[test]
    fn creep_strain_follows_norton() {
        // 100 MPa for 1e6 s: ε_cr = A σⁿ t = 2e-49 · 1e40 · 1e6 = 2e-3.
        let job = r#"{ "analysis": "nonlinear", "unit": 0.001,
          "bodies": [{ "id": "b", "material": "creepSteel", "shape": { "type": "box", "size": [50, 10, 10], "placement": { "position": [25, 5, 5] } } }],
          "mesh": { "size": 5, "order": 1 },
          "bcs": [
            { "type": "frictionless", "faces": [{ "body": "b", "c": [0, 5, 5], "n": [-1, 0, 0], "a": 100 }] },
            { "type": "frictionless", "faces": [{ "body": "b", "c": [25, 0, 5], "n": [0, -1, 0], "a": 500 }] },
            { "type": "frictionless", "faces": [{ "body": "b", "c": [25, 5, 0], "n": [0, 0, -1], "a": 500 }] },
            { "type": "force", "vector": [10000, 0, 0], "faces": [{ "body": "b", "c": [50, 5, 5], "n": [1, 0, 0], "a": 100 }] }
          ],
          "probes": [[50, 5, 5]],
          "settings": { "plasticity": false, "steps": 2, "creep": true, "creepTime": 1e6, "creepSteps": 10 } }"#;
        let v = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap().0;
        let c = v["result"]["max"]["creepStrain"].as_f64().unwrap();
        assert!((c - 2e-3).abs() / 2e-3 < 0.08, "creep strain {c}");
        let h = v["creep"]["history"].as_array().unwrap();
        let d0 = h[0]["displacement"][0].as_f64().unwrap();
        let d1 = h.last().unwrap()["displacement"][0].as_f64().unwrap();
        // The end moves by the creep strain over 50 mm on top of the elastic stretch.
        assert!(((d1 - d0) - 2e-3 * 0.05).abs() < 0.15 * 2e-3 * 0.05, "creep extension {}", d1 - d0);
    }
}
