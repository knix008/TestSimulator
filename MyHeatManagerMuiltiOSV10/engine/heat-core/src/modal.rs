//! Modal (natural frequency) analysis: K φ = ω² M φ.
//!
//! Stiffness from the stress elements (same supports), lumped mass. The lowest
//! modes are found by Lanczos iteration on the shift-inverted operator
//! (K + εM)⁻¹M with full M-reorthogonalisation, each application being a
//! matrix-free PCG solve; the tridiagonal projection is solved with the cyclic
//! Jacobi method. Structures without supports have
//! rigid-body modes (≈ 0 Hz); they are computed with a small positive shift
//! and filtered out, so `modes` lists elastic modes only.

use crate::linalg::{self, Jacobi, Tol};
use crate::mesh::Mesh;
use crate::model::Model;
use crate::stress::Structure;
use crate::{Ctx, Error};

pub struct ModeInfo {
    pub frequency: f64,
    /// Effective modal mass fraction per direction (x, y[, z]).
    pub participation: Vec<f64>,
    /// Signed participation factor Γ/m per direction for the shape as output (cell-centred, max |φ| = 1):
    /// a base acceleration a along c moves a point by φ(p)·factor[c]·a / (ω² − Ω² + 2iζωΩ).
    pub factor: Vec<f64>,
}

pub struct ModalOut {
    pub dim: usize,
    pub modes: Vec<ModeInfo>,
    /// Cell-centred mode shapes [x, y, z], normalised to max |φ| = 1.
    pub shapes: Vec<[Vec<f32>; 3]>,
}

/// Eigen-decomposition of a symmetric matrix (row-major n×n) by cyclic Jacobi.
fn jacobi_eigen(a: &mut [f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    let mut v = vec![0.0; n * n];
    for i in 0..n {
        v[i * n + i] = 1.0;
    }
    for _sweep in 0..100 {
        let mut off = 0.0;
        let mut tot = 0.0;
        for i in 0..n {
            for j in 0..n {
                let x = a[i * n + j] * a[i * n + j];
                tot += x;
                if i != j {
                    off += x;
                }
            }
        }
        if off <= 1e-28 * tot.max(1e-300) {
            break;
        }
        for p in 0..n {
            for q in p + 1..n {
                let apq = a[p * n + q];
                if apq.abs() < 1e-300 {
                    continue;
                }
                let theta = (a[q * n + q] - a[p * n + p]) / (2.0 * apq);
                let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
                let t = if theta == 0.0 { 1.0 } else { t };
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..n {
                    let akp = a[k * n + p];
                    let akq = a[k * n + q];
                    a[k * n + p] = c * akp - s * akq;
                    a[k * n + q] = s * akp + c * akq;
                }
                for k in 0..n {
                    let apk = a[p * n + k];
                    let aqk = a[q * n + k];
                    a[p * n + k] = c * apk - s * aqk;
                    a[q * n + k] = s * apk + c * aqk;
                }
                for k in 0..n {
                    let vkp = v[k * n + p];
                    let vkq = v[k * n + q];
                    v[k * n + p] = c * vkp - s * vkq;
                    v[k * n + q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let w = (0..n).map(|i| a[i * n + i]).collect();
    (w, v)
}

pub fn solve(model: &Model, mesh: &Mesh, ctx: &mut Ctx) -> Result<Option<ModalOut>, Error> {
    let nreq = model.study.modal_modes;
    let Some(s) = Structure::new(model, mesh, ctx)? else { return Ok(None) };
    let (nd, ndof) = (s.nd, s.ndof);
    let mass = s.mass();
    let kdiag = s.diag();
    let free: Vec<bool> = (0..ndof).map(|i| !s.fixed[i] && mass[i] > 0.0).collect();
    let nfree = free.iter().filter(|&&f| f).count();
    if nfree == 0 {
        ctx.warn("Modal analysis skipped: every degree of freedom is fixed");
        return Ok(None);
    }
    let fully = s.constrained[..nd].iter().all(|&c| c);
    let nrigid = if fully { 0 } else if nd == 2 { 3 } else { 6 };
    let q = (nreq + nrigid).min(nfree);
    // Shift: 0 for supported structures, ~λ-scale for free ones.
    let mut ratio = 0.0;
    let mut cnt = 0usize;
    for i in 0..ndof {
        if free[i] && kdiag[i] > 0.0 {
            ratio += kdiag[i] / mass[i];
            cnt += 1;
        }
    }
    let ratio = ratio / cnt.max(1) as f64;
    let eps = if fully { 0.0 } else { 1e-6 * ratio };
    let inv: Vec<f64> = (0..ndof).map(|i| if free[i] && kdiag[i] + eps * mass[i] > 0.0 { 1.0 / (kdiag[i] + eps * mass[i]) } else { 0.0 }).collect();
    let pre_j = Jacobi { inv };
    // Assembled K + εM with IC(0) when it fits (much fewer PCG iterations).
    let assembled = if s.use_assembled() {
        let a = s.assemble(Some((&mass, eps)));
        let ic = Structure::factor(&a);
        Some((a, ic))
    } else {
        None
    };
    let pre: &dyn linalg::Precond = match &assembled {
        Some((_, ic)) => ic,
        None => &pre_j,
    };
    let apply_shift = |x: &[f64], y: &mut [f64]| {
        match &assembled {
            Some((a, _)) => a.matvec(x, y),
            None => s.apply(x, y),
        }
        for i in 0..ndof {
            y[i] = if free[i] {
                if assembled.is_some() { y[i] } else { y[i] + eps * mass[i] * x[i] }
            } else {
                0.0
            };
        }
    };
    let mdot = |a: &[f64], b: &[f64]| -> f64 { (0..ndof).filter(|&i| free[i]).map(|i| a[i] * mass[i] * b[i]).sum() };
    // Shift-invert Lanczos with full M-reorthogonalisation on
    // Op = (K + εM)⁻¹ M (self-adjoint in the M inner product). The largest Ritz
    // values θ of Op give the smallest λ = 1/θ − ε.
    ctx.phase("modal");
    let m_max = nfree.min((6 * q + 30).max(40));
    let m_first = nfree.min(2 * q + 20);
    let mut v: Vec<Vec<f64>> = Vec::new();
    let mut alpha: Vec<f64> = Vec::new();
    let mut beta: Vec<f64> = Vec::new();
    let mut total_iters = 0usize;
    // start vector: smooth deterministic pattern with all components
    let mut v0 = vec![0.0; ndof];
    for n in 0..s.nnode {
        let (px, py, pz) = s.node_xyz(n);
        for c in 0..nd {
            let i = n * nd + c;
            if free[i] {
                v0[i] = 1.0 + 0.3 * (c as f64 + 1.0) + (7.1 * px + 5.3 * py + 3.7 * pz + c as f64).sin() * 0.5
                    + 0.05 * ((i * 7919) % 1000) as f64 / 1000.0;
            }
        }
    }
    let n0 = mdot(&v0, &v0).sqrt().max(1e-300);
    v0.iter_mut().for_each(|x| *x /= n0);
    v.push(v0);
    let mut ritz: Option<(Vec<f64>, Vec<f64>, usize)> = None; // (θ, S column-major m×m, m)
    let mut converged = false;
    for j in 0..m_max {
        let rhs: Vec<f64> = (0..ndof).map(|i| if free[i] { mass[i] * v[j][i] } else { 0.0 }).collect();
        let mut w = vec![0.0; ndof];
        let tol = Tol { rel: 1e-10, abs: 0.0, max_iter: (model.study.max_iter * 4).max(4000) };
        {
            let mut op = |a: &[f64], b: &mut [f64]| apply_shift(a, b);
            let mut mon = |it: usize, res: f64| ctx.tick(&|| format!("modal Lanczos step {j}: {it} ({res:.1e})"));
            let st = linalg::pcg_op(ndof, &mut op, &rhs, &mut w, pre, tol, &mut mon)?;
            total_iters += st.iterations;
        }
        if j > 0 {
            let b = beta[j - 1];
            for i in 0..ndof {
                w[i] -= b * v[j - 1][i];
            }
        }
        let a = mdot(&w, &v[j]);
        alpha.push(a);
        for i in 0..ndof {
            w[i] -= a * v[j][i];
        }
        for _ in 0..2 {
            for vk in &v {
                let c = mdot(&w, vk);
                if c != 0.0 {
                    for i in 0..ndof {
                        w[i] -= c * vk[i];
                    }
                }
            }
        }
        let b = mdot(&w, &w).sqrt();
        beta.push(b);
        let m = j + 1;
        let check = m >= m_first && (m % 5 == 0 || m == m_max) || b < 1e-12 * a.abs().max(1e-300);
        if check || m == m_max {
            let mut t = vec![0.0; m * m];
            for k in 0..m {
                t[k * m + k] = alpha[k];
                if k + 1 < m {
                    t[k * m + k + 1] = beta[k];
                    t[(k + 1) * m + k] = beta[k];
                }
            }
            let (th, sv) = jacobi_eigen(&mut t, m);
            let mut order: Vec<usize> = (0..m).collect();
            order.sort_by(|&x1, &x2| th[x2].partial_cmp(&th[x1]).unwrap_or(std::cmp::Ordering::Equal));
            let thetas: Vec<f64> = order.iter().map(|&o| th[o]).collect();
            let mut scol = vec![0.0; m * m];
            for (r, &o) in order.iter().enumerate() {
                for k in 0..m {
                    scol[r * m + k] = sv[k * m + o];
                }
            }
            // residual estimate |β_m s_{m,i}| relative to θ_i for the wanted pairs
            let want = q.min(m);
            let ok = (0..want).all(|r| (b * scol[r * m + m - 1]).abs() <= 1e-9 * thetas[r].abs().max(1e-300));
            ctx.report(m as f64 / m_max as f64, &format!("modal Lanczos {m} vectors"))?;
            ritz = Some((thetas, scol, m));
            if ok && m >= q {
                converged = true;
                break;
            }
        }
        if b < 1e-12 * a.abs().max(1e-300) {
            break; // invariant subspace
        }
        v.push(w.iter().map(|x| x / b).collect());
    }
    ctx.log("modal", total_iters, 0.0);
    if !converged {
        ctx.warn("Modal analysis: Lanczos iteration did not fully converge");
    }
    let (thetas, scol, m) = ritz.expect("at least one Ritz evaluation");
    let p = m;
    let mut lam = vec![0.0; p];
    let mut x: Vec<Vec<f64>> = Vec::with_capacity(p);
    for r in 0..p {
        lam[r] = if thetas[r] > 0.0 { 1.0 / thetas[r] - eps } else { f64::INFINITY };
        let mut xv = vec![0.0; ndof];
        for k in 0..m {
            let c = scol[r * m + k];
            if c != 0.0 {
                for i in 0..ndof {
                    xv[i] += c * v[k][i];
                }
            }
        }
        x.push(xv);
    }
    // Filter rigid-body modes (free structures) and keep the requested count.
    let rigid_cut = if fully { -f64::INFINITY } else { 1e-3 * eps };
    let total_mass: Vec<f64> = (0..nd)
        .map(|c| (0..s.nnode).filter(|&n| s.active[n]).map(|n| mass[n * nd + c]).sum::<f64>())
        .collect();
    let g = &mesh.grid;
    let ncell = g.n();
    let mut modes = Vec::new();
    let mut shapes = Vec::new();
    let mut dropped = 0usize;
    for r in 0..p {
        if modes.len() >= nreq {
            break;
        }
        if lam[r] < rigid_cut {
            dropped += 1;
            continue;
        }
        let phi = &x[r];
        let mm = mdot(phi, phi).max(1e-300);
        let gammas: Vec<f64> = (0..nd)
            .map(|c| (0..s.nnode).map(|n| n * nd + c).filter(|&i| free[i]).map(|i| mass[i] * phi[i]).sum())
            .collect();
        let participation: Vec<f64> = (0..nd).map(|c| gammas[c] * gammas[c] / mm / total_mass[c].max(1e-300)).collect();
        let freq = lam[r].max(0.0).sqrt() / (2.0 * std::f64::consts::PI);
        // Cell-centred shape, normalised to max |φ| = 1.
        let mut sh = [vec![0.0f32; ncell], vec![0.0f32; ncell], vec![0.0f32; ncell]];
        let mut amax: f64 = 0.0;
        let mut cellv = vec![[0.0f64; 3]; ncell];
        for c in 0..ncell {
            if s.elem[c] == crate::mesh::VOID {
                continue;
            }
            let nodes = s.elem_nodes(c);
            for comp in 0..nd {
                let v: f64 = nodes[..s.nen].iter().map(|&n| phi[n * nd + comp]).sum::<f64>() / s.nen as f64;
                cellv[c][comp] = v;
                amax = amax.max(v.abs());
            }
        }
        let inv = if amax > 0.0 { 1.0 / amax } else { 0.0 };
        for c in 0..ncell {
            for comp in 0..nd {
                sh[comp][c] = (cellv[c][comp] * inv) as f32;
            }
        }
        // For φ̂ = inv·φ: Γ̂/m̂ = inv·γ / (inv²·mm) = γ / (inv·mm).
        let factor: Vec<f64> = (0..nd).map(|c| if inv > 0.0 { gammas[c] / (inv * mm) } else { 0.0 }).collect();
        modes.push(ModeInfo { frequency: freq, participation, factor });
        shapes.push(sh);
    }
    if !fully && dropped > 0 {
        ctx.warn(format!(
            "Modal analysis: the structure is not fully supported; {dropped} rigid-body mode(s) (≈ 0 Hz) were omitted"
        ));
    }
    if modes.len() < nreq {
        ctx.warn(format!("Modal analysis: only {} of {} modes could be computed", modes.len(), nreq));
    }
    Ok(Some(ModalOut { dim: s.dim, modes, shapes }))
}
