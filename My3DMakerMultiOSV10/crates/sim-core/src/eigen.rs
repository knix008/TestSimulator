//! Smallest eigenpairs of A x = λ B x (A symmetric, B symmetric positive definite) by the locally
//! optimal block preconditioned conjugate gradient method (LOBPCG) with SVQB orthonormalisation.
//! Constrained unknowns are kept at zero (mask).

use crate::dense::sym_eigen;
use crate::Ctx;

pub type Op<'a> = &'a dyn Fn(&[f64], &mut [f64]);

pub struct Eig {
    pub values: Vec<f64>,
    pub vectors: Vec<Vec<f64>>,
    pub iterations: usize,
    pub converged: bool,
}

fn dotv(a: &[f64], b: &[f64]) -> f64 { a.iter().zip(b.iter()).map(|(x, y)| x * y).sum() }

/// Gram matrix SᵀT (k×k, row-major).
fn gram(s: &[Vec<f64>], t: &[Vec<f64>]) -> Vec<f64> {
    let k = s.len();
    let mut g = vec![0.0; k * k];
    for i in 0..k {
        g[i * k + i] = dotv(&s[i], &t[i]);
        for j in i + 1..k {
            // Symmetrised (S and T = A·S need not be exactly symmetric in rounding).
            let v = 0.5 * (dotv(&s[i], &t[j]) + dotv(&s[j], &t[i]));
            g[i * k + j] = v;
            g[j * k + i] = v;
        }
    }
    g
}

/// Σ_j S_j · C[j, c] for each column c of C (k×r).
fn combine(s: &[Vec<f64>], c: &[f64], k: usize, r: usize, cols: std::ops::Range<usize>) -> Vec<Vec<f64>> {
    let n = s[0].len();
    cols.map(|col| {
        let mut v = vec![0.0; n];
        for j in 0..k {
            let f = c[j * r + col];
            if f != 0.0 { for (vi, si) in v.iter_mut().zip(s[j].iter()) { *vi += f * si; } }
        }
        v
    }).collect()
}

/// Rayleigh–Ritz on the span of S: (θ ascending, C k×r).
fn rayleigh_ritz(s: &[Vec<f64>], as_: &[Vec<f64>], bs: &[Vec<f64>]) -> Option<(Vec<f64>, Vec<f64>, usize)> {
    let k = s.len();
    let gb = gram(s, bs);
    // SVQB: scale, eigen-decompose, drop the (near) dependent directions.
    let dscale: Vec<f64> = (0..k).map(|i| 1.0 / gb[i * k + i].abs().sqrt().max(1e-300)).collect();
    let mut gs = gb.clone();
    for i in 0..k { for j in 0..k { gs[i * k + j] *= dscale[i] * dscale[j]; } }
    let (lam, v) = sym_eigen(&gs, k);
    let lmax = lam.iter().cloned().fold(0.0, f64::max);
    let keep: Vec<usize> = (0..k).filter(|&i| lam[i] > 1e-9 * lmax).collect();
    let r = keep.len();
    if r == 0 { return None; }
    // Q = D V_keep Λ^{-1/2}
    let mut q = vec![0.0; k * r];
    for (c, &i) in keep.iter().enumerate() { for row in 0..k { q[row * r + c] = dscale[row] * v[row * k + i] / lam[i].sqrt(); } }
    let ga = gram(s, as_);
    // H = Qᵀ GA Q
    let mut tmp = vec![0.0; k * r];
    for i in 0..k { for c in 0..r { let mut acc = 0.0; for j in 0..k { acc += ga[i * k + j] * q[j * r + c]; } tmp[i * r + c] = acc; } }
    let mut h = vec![0.0; r * r];
    for a in 0..r { for b in 0..r { let mut acc = 0.0; for i in 0..k { acc += q[i * r + a] * tmp[i * r + b]; } h[a * r + b] = acc; } }
    for a in 0..r { for b in a + 1..r { let m = 0.5 * (h[a * r + b] + h[b * r + a]); h[a * r + b] = m; h[b * r + a] = m; } }
    let (theta, u) = sym_eigen(&h, r);
    // C = Q U
    let mut c = vec![0.0; k * r];
    for i in 0..k { for col in 0..r { let mut acc = 0.0; for j in 0..r { acc += q[i * r + j] * u[j * r + col]; } c[i * r + col] = acc; } }
    Some((theta, c, r))
}

#[allow(clippy::too_many_arguments)]
pub fn lobpcg(a: Op, b: Op, t: Op, n: usize, nev: usize, mask: &[bool], tol: f64, max_iter: usize, ctx: &mut Ctx, f0: f64, f1: f64) -> Result<Eig, String> {
    let free = mask.iter().filter(|m| **m).count();
    let nev = nev.min(free.saturating_sub(1)).max(1);
    let m = (nev + (nev / 2).max(3)).min(free.max(1));
    let apply = |op: Op, x: &[f64]| { let mut y = vec![0.0; n]; op(x, &mut y); for i in 0..n { if !mask[i] { y[i] = 0.0; } } y };
    // Deterministic start.
    let mut seed: u64 = 0x2545_F491_4F6C_DD1D;
    let mut rnd = || { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; (seed >> 11) as f64 / (1u64 << 53) as f64 - 0.5 };
    let mut x: Vec<Vec<f64>> = (0..m).map(|_| (0..n).map(|i| if mask[i] { rnd() } else { 0.0 }).collect()).collect();
    let mut ax: Vec<Vec<f64>> = x.iter().map(|v| apply(a, v)).collect();
    let mut bx: Vec<Vec<f64>> = x.iter().map(|v| apply(b, v)).collect();
    let (mut theta, c, r) = rayleigh_ritz(&x, &ax, &bx).ok_or("eigen.start")?;
    let take = r.min(m);
    x = combine(&x, &c, m, r, 0..take);
    ax = combine(&ax, &c, m, r, 0..take);
    bx = combine(&bx, &c, m, r, 0..take);
    theta.truncate(take);
    let mut p: Vec<Vec<f64>> = Vec::new();
    let mut ap: Vec<Vec<f64>> = Vec::new();
    let mut bp: Vec<Vec<f64>> = Vec::new();
    let mut converged = false;
    let mut it = 0;
    let mut history: Vec<Vec<f64>> = Vec::new();
    while it < max_iter {
        it += 1;
        let mb = x.len();
        // Residuals.
        let mut worst: f64 = 0.0;
        let mut w: Vec<Vec<f64>> = Vec::new();
        for i in 0..mb {
            let ri: Vec<f64> = (0..n).map(|k| ax[i][k] - theta[i] * bx[i][k]).collect();
            let rn = dotv(&ri, &ri).sqrt();
            let scale = dotv(&ax[i], &ax[i]).sqrt() + theta[i].abs() * dotv(&bx[i], &bx[i]).sqrt();
            let rel = rn / scale.max(1e-300);
            if i < nev { worst = worst.max(rel); }
            if std::env::var_os("SIM_EIG_DEBUG2").is_some() && it % 100 == 0 { eprintln!("  vec {i} theta {:.4e} rel {rel:.3e} |ax| {:.3e} |bx| {:.3e}", theta[i], dotv(&ax[i], &ax[i]).sqrt(), dotv(&bx[i], &bx[i]).sqrt()); }
            // Converged vectors still take part (no locking) but do not need a search direction.
            if rel > tol * 0.1 { w.push(apply(t, &ri)); }
        }
        if std::env::var_os("SIM_EIG_DEBUG").is_some() { eprintln!("it {it} worst {worst:.3e} theta {:?}", &theta[..nev.min(theta.len())]); }
        if worst < tol { converged = true; break; }
        // The eigenvalues settle long before the residuals when a tiny high-frequency part lingers in
        // the vectors (its amplitude ~ θ / λmax, invisible in the shapes): stop once they stand still.
        history.push(theta[..nev.min(theta.len())].to_vec());
        if it > 12 && history.len() > 5 {
            let old = &history[history.len() - 6];
            let still = old.iter().zip(theta.iter()).all(|(a, b)| (a - b).abs() <= 2e-6 * b.abs().max(1e-300));
            if still { converged = true; break; }
        }
        if it % 3 == 0 {
            let frac = ((-worst.max(1e-300).log10()) / (-tol.log10())).clamp(0.0, 1.0);
            ctx.step(f0 + (f1 - f0) * frac.max(it as f64 / max_iter as f64), "progress.eigen")?;
        }
        let aw: Vec<Vec<f64>> = w.iter().map(|v| apply(a, v)).collect();
        let bw: Vec<Vec<f64>> = w.iter().map(|v| apply(b, v)).collect();
        let mut s = x.clone(); s.extend(w.iter().cloned()); s.extend(p.iter().cloned());
        let mut as_ = ax.clone(); as_.extend(aw); as_.extend(ap.iter().cloned());
        let mut bs = bx.clone(); bs.extend(bw); bs.extend(bp.iter().cloned());
        let k = s.len();
        let Some((th, c, r)) = rayleigh_ritz(&s, &as_, &bs) else { break };
        let take = mb.min(r);
        let xn = combine(&s, &c, k, r, 0..take);
        let axn = combine(&as_, &c, k, r, 0..take);
        let bxn = combine(&bs, &c, k, r, 0..take);
        // P: the new block's part outside the old one.
        let mut y = vec![0.0; mb * take];
        for i in 0..mb { for j in 0..take { y[i * take + j] = dotv(&bx[i], &xn[j]); } }
        let sub = |new: &[Vec<f64>], old: &[Vec<f64>]| -> Vec<Vec<f64>> {
            (0..take).map(|j| { let mut v = new[j].clone(); for i in 0..mb { let f = y[i * take + j]; if f != 0.0 { for (vk, ok) in v.iter_mut().zip(old[i].iter()) { *vk -= f * ok; } } } v }).collect()
        };
        p = sub(&xn, &x);
        let _ = (&axn, &bxn);
        // The products are formed anew (not carried along as combinations): rounding in the
        // carried products is what makes the method drift once the residuals are small.
        ap = p.iter().map(|v| apply(a, v)).collect();
        bp = p.iter().map(|v| apply(b, v)).collect();
        x = xn;
        ax = x.iter().map(|v| apply(a, v)).collect();
        bx = x.iter().map(|v| apply(b, v)).collect();
        theta = th[..take].to_vec();
    }
    let k = nev.min(x.len());
    // B-normalise the returned vectors.
    let mut vectors = Vec::with_capacity(k);
    for i in 0..k {
        let nb = dotv(&x[i], &bx[i]).abs().sqrt().max(1e-300);
        vectors.push(x[i].iter().map(|v| v / nb).collect());
    }
    Ok(Eig { values: theta[..k].to_vec(), vectors, iterations: it, converged })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sparse::{Csr, Pre, Precond};

    #[test]
    fn lobpcg_finds_laplace_eigenvalues() {
        let n = 200;
        let rows: Vec<Vec<u32>> = (0..n).map(|i| { let mut r = vec![]; if i > 0 { r.push(i as u32 - 1); } r.push(i as u32); if i + 1 < n { r.push(i as u32 + 1); } r }).collect();
        let mut k = Csr::from_rows(rows);
        for i in 0..n { k.add(i, i, 2.0); if i > 0 { k.add(i, i - 1, -1.0); } if i + 1 < n { k.add(i, i + 1, -1.0); } }
        let pre = Pre::new(&k);
        let a = |x: &[f64], y: &mut [f64]| k.matvec(x, y);
        let b = |x: &[f64], y: &mut [f64]| y.copy_from_slice(x);
        let t = |x: &[f64], y: &mut [f64]| pre.apply(x, y);
        let mask = vec![true; n];
        let mut ctx = Ctx::silent();
        let e = lobpcg(&a, &b, &t, n, 4, &mask, 1e-8, 500, &mut ctx, 0.0, 1.0).unwrap();
        assert!(e.converged);
        for (j, v) in e.values.iter().enumerate() {
            let exact = 2.0 - 2.0 * (std::f64::consts::PI * (j + 1) as f64 / (n + 1) as f64).cos();
            assert!((v - exact).abs() < 1e-7 * exact.max(1e-3) + 1e-10, "{j}: {v} vs {exact}");
        }
    }
}
