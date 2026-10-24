//! Sparse linear algebra: CSR matrices, PCG with IC(0), BiCGSTAB with ILU(0).

use crate::Error;

/// Square CSR matrix with sorted column indices and cached diagonal positions.
#[derive(Clone, Debug)]
pub struct Csr {
    pub n: usize,
    pub row_ptr: Vec<usize>,
    pub col: Vec<u32>,
    pub val: Vec<f64>,
    pub diag: Vec<usize>,
}

impl Csr {
    /// Build the sparsity pattern from per-row neighbour lists (diagonal added).
    pub fn from_neighbours(n: usize, nb: &[Vec<u32>]) -> Csr {
        let mut row_ptr = Vec::with_capacity(n + 1);
        let mut col = Vec::new();
        let mut diag = vec![0; n];
        row_ptr.push(0);
        let mut tmp: Vec<u32> = Vec::new();
        for i in 0..n {
            tmp.clear();
            tmp.push(i as u32);
            tmp.extend_from_slice(&nb[i]);
            tmp.sort_unstable();
            tmp.dedup();
            for &c in &tmp {
                if c as usize == i {
                    diag[i] = col.len();
                }
                col.push(c);
            }
            row_ptr.push(col.len());
        }
        let nnz = col.len();
        Csr { n, row_ptr, col, val: vec![0.0; nnz], diag }
    }

    /// Position of entry (r, c); panics if absent.
    #[inline]
    pub fn pos(&self, r: usize, c: usize) -> usize {
        let s = self.row_ptr[r];
        let e = self.row_ptr[r + 1];
        match self.col[s..e].binary_search(&(c as u32)) {
            Ok(p) => s + p,
            Err(_) => panic!("CSR entry ({r},{c}) not in pattern"),
        }
    }

    pub fn clear(&mut self) {
        self.val.iter_mut().for_each(|v| *v = 0.0);
    }

    pub fn matvec(&self, x: &[f64], y: &mut [f64]) {
        #[cfg(feature = "parallel")]
        {
            if self.n > 20_000 {
                use rayon::prelude::*;
                y.par_chunks_mut(4096).enumerate().for_each(|(ci, chunk)| {
                    let base = ci * 4096;
                    for (o, yi) in chunk.iter_mut().enumerate() {
                        let i = base + o;
                        let mut s = 0.0;
                        for p in self.row_ptr[i]..self.row_ptr[i + 1] {
                            s += self.val[p] * x[self.col[p] as usize];
                        }
                        *yi = s;
                    }
                });
                return;
            }
        }
        for i in 0..self.n {
            let mut s = 0.0;
            for p in self.row_ptr[i]..self.row_ptr[i + 1] {
                s += self.val[p] * x[self.col[p] as usize];
            }
            y[i] = s;
        }
    }

    pub fn is_symmetric_pattern_values(&self, tol: f64) -> bool {
        for i in 0..self.n {
            for p in self.row_ptr[i]..self.row_ptr[i + 1] {
                let j = self.col[p] as usize;
                let q = self.pos(j, i);
                if (self.val[p] - self.val[q]).abs() > tol * (self.val[p].abs() + self.val[q].abs() + 1e-300) {
                    return false;
                }
            }
        }
        true
    }
}

pub trait Precond {
    fn apply(&self, r: &[f64], z: &mut [f64]);
}

/// Jacobi preconditioner.
pub struct Jacobi {
    pub inv: Vec<f64>,
}

impl Precond for Jacobi {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        for i in 0..r.len() {
            z[i] = r[i] * self.inv[i];
        }
    }
}

/// Incomplete Cholesky IC(0): A ≈ L Lᵀ with L on the lower pattern of A.
pub struct Ic0 {
    n: usize,
    // Strictly lower part of L, pre-scaled so that each triangular sweep has a
    // single multiply-add on its loop-carried dependency chain:
    // fwd = L_ij / L_ii (row scaling), bwd = L_ij / L_jj (column scaling).
    row_ptr: Vec<usize>,
    col: Vec<u32>,
    fwd: Vec<f64>,
    bwd: Vec<f64>,
    inv: Vec<f64>,
    /// Pivots that had to be replaced (non-M-matrices, e.g. elasticity).
    pub breakdowns: usize,
}

impl Ic0 {
    pub fn new(a: &Csr) -> Ic0 {
        Self::with_shift(a, 0.0)
    }

    /// IC(0) of A + shift·diag(A) (Manteuffel shift for non-M-matrices).
    pub fn with_shift(a: &Csr, shift: f64) -> Ic0 {
        let n = a.n;
        let mut breakdowns = 0usize;
        let mut row_ptr = Vec::with_capacity(n + 1);
        let mut col = Vec::new();
        let mut val = Vec::new();
        row_ptr.push(0);
        for i in 0..n {
            for p in a.row_ptr[i]..=a.diag[i] {
                col.push(a.col[p]);
                val.push(if p == a.diag[i] { a.val[p] * (1.0 + shift) } else { a.val[p] });
            }
            row_ptr.push(col.len());
        }
        // Row-oriented factorisation; rows of L are short (stencil), so the
        // inner products are done by merging sorted column lists.
        for i in 0..n {
            let (ri0, ri1) = (row_ptr[i], row_ptr[i + 1]);
            for p in ri0..ri1 - 1 {
                let j = col[p] as usize;
                let (rj0, rj1) = (row_ptr[j], row_ptr[j + 1]);
                let mut s = val[p];
                let (mut a1, mut b1) = (ri0, rj0);
                while a1 < p && b1 < rj1 - 1 {
                    let ca = col[a1];
                    let cb = col[b1];
                    if ca == cb {
                        s -= val[a1] * val[b1];
                        a1 += 1;
                        b1 += 1;
                    } else if ca < cb {
                        a1 += 1;
                    } else {
                        b1 += 1;
                    }
                }
                val[p] = s / val[rj1 - 1];
            }
            let mut d = val[ri1 - 1];
            for p in ri0..ri1 - 1 {
                d -= val[p] * val[p];
            }
            // Breakdown guard (not expected for M-matrices): fall back to the
            // original diagonal.
            if !(d > 1e-14 * a.val[a.diag[i]].abs()) {
                d = a.val[a.diag[i]].abs().max(1e-300);
                breakdowns += 1;
            }
            val[ri1 - 1] = d.sqrt();
        }
        let mut srow = Vec::with_capacity(n + 1);
        let mut scol = Vec::with_capacity(col.len());
        let mut fwd = Vec::with_capacity(col.len());
        let mut bwd = Vec::with_capacity(col.len());
        let mut inv = vec![0.0; n];
        for i in 0..n {
            inv[i] = 1.0 / val[row_ptr[i + 1] - 1];
        }
        srow.push(0);
        for i in 0..n {
            for p in row_ptr[i]..row_ptr[i + 1] - 1 {
                let j = col[p] as usize;
                scol.push(col[p]);
                fwd.push(val[p] * inv[i]);
                bwd.push(val[p] * inv[j]);
            }
            srow.push(scol.len());
        }
        Ic0 { n, row_ptr: srow, col: scol, fwd, bwd, inv, breakdowns }
    }
}

impl Precond for Ic0 {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        let n = self.n;
        // L y = r
        for i in 0..n {
            let mut s = r[i] * self.inv[i];
            for p in self.row_ptr[i]..self.row_ptr[i + 1] {
                s -= self.fwd[p] * z[self.col[p] as usize];
            }
            z[i] = s;
        }
        // Lᵀ x = y: w = y / diag, then column sweep with column-scaled entries.
        for i in 0..n {
            z[i] *= self.inv[i];
        }
        for i in (0..n).rev() {
            let xi = z[i];
            for p in self.row_ptr[i]..self.row_ptr[i + 1] {
                z[self.col[p] as usize] -= self.bwd[p] * xi;
            }
        }
    }
}

/// Incomplete LU ILU(0) on the pattern of A (unit lower L, U with diagonal).
pub struct Ilu0 {
    lu: Csr,
    /// 1/U_ii and the strictly upper entries of row i scaled by 1/U_ii, so the
    /// backward sweep has a single multiply-add on its dependency chain.
    uinv: Vec<f64>,
    us: Vec<f64>,
}

impl Ilu0 {
    pub fn new(a: &Csr) -> Ilu0 {
        Self::modified(a, 0.0)
    }

    /// MILU(0): fill-in dropped by ILU(0) is lumped onto the diagonal with
    /// weight `omega` (0 = plain ILU(0)). For a symmetric M-matrix the factors
    /// form a symmetric preconditioner (U = D·Lᵀ) usable in PCG, and for
    /// Poisson problems the iteration count drops from O(1/h) to O(1/√h).
    pub fn modified(a: &Csr, omega: f64) -> Ilu0 {
        let mut lu = a.clone();
        let n = lu.n;
        let mut marker = vec![usize::MAX; n];
        for i in 0..n {
            let (s, e) = (lu.row_ptr[i], lu.row_ptr[i + 1]);
            for p in s..e {
                marker[lu.col[p] as usize] = p;
            }
            for p in s..lu.diag[i] {
                let k = lu.col[p] as usize;
                let dkk = lu.val[lu.diag[k]];
                let lik = lu.val[p] / dkk;
                lu.val[p] = lik;
                for q in lu.diag[k] + 1..lu.row_ptr[k + 1] {
                    let j = lu.col[q] as usize;
                    let m = marker[j];
                    if m != usize::MAX {
                        lu.val[m] -= lik * lu.val[q];
                    } else if omega != 0.0 {
                        let d = lu.diag[i];
                        lu.val[d] -= omega * lik * lu.val[q];
                    }
                }
            }
            if lu.val[lu.diag[i]].abs() < 1e-300 {
                lu.val[lu.diag[i]] = 1e-300;
            }
            for p in s..e {
                marker[lu.col[p] as usize] = usize::MAX;
            }
        }
        let n = lu.n;
        let uinv: Vec<f64> = (0..n).map(|i| 1.0 / lu.val[lu.diag[i]]).collect();
        let mut us = vec![0.0; lu.val.len()];
        for i in 0..n {
            for p in lu.diag[i] + 1..lu.row_ptr[i + 1] {
                us[p] = lu.val[p] * uinv[i];
            }
        }
        Ilu0 { lu, uinv, us }
    }
}

impl Precond for Ilu0 {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        let a = &self.lu;
        for i in 0..a.n {
            let mut s = r[i];
            for p in a.row_ptr[i]..a.diag[i] {
                s -= a.val[p] * z[a.col[p] as usize];
            }
            z[i] = s;
        }
        for i in (0..a.n).rev() {
            let mut s = z[i] * self.uinv[i];
            for p in a.diag[i] + 1..a.row_ptr[i + 1] {
                s -= self.us[p] * z[a.col[p] as usize];
            }
            z[i] = s;
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SolveStats {
    pub iterations: usize,
    /// Final relative residual ‖r‖/‖b‖.
    pub residual: f64,
    pub converged: bool,
}

#[inline]
pub fn dot(a: &[f64], b: &[f64]) -> f64 {
    let mut s = 0.0;
    for i in 0..a.len() {
        s += a[i] * b[i];
    }
    s
}

pub type Monitor<'a> = dyn FnMut(usize, f64) -> Result<(), Error> + 'a;

/// Stopping rule: ‖r‖ ≤ max(rel·‖b‖, abs).
#[derive(Clone, Copy, Debug)]
pub struct Tol {
    pub rel: f64,
    pub abs: f64,
    pub max_iter: usize,
}

impl Tol {
    /// Stopping target for ‖r‖. `rel0 > 0` additionally requires a reduction
    /// of the initial residual by that factor (Picard iterations: a warm
    /// start already satisfies rel·‖b‖, which would leave the update unsolved).
    pub fn target(&self, bn: f64, r0n: f64, rel0: f64) -> f64 {
        let t = (self.rel * bn).max(self.abs);
        if rel0 > 0.0 {
            t.min(rel0 * r0n).max(1e-14 * bn)
        } else {
            t
        }
    }
}

/// Initial-residual reduction used by `pcg_r0` / `bicgstab_r0`.
pub const PICARD_REDUCTION: f64 = 1e-1;

/// Generic preconditioned conjugate gradients on an operator.
pub fn pcg_op(
    n: usize,
    apply: &mut dyn FnMut(&[f64], &mut [f64]),
    b: &[f64],
    x: &mut [f64],
    m: &dyn Precond,
    tol: Tol,
    monitor: &mut Monitor,
) -> Result<SolveStats, Error> {
    pcg_op_r0(n, apply, b, x, m, tol, 0.0, monitor)
}

/// PCG that also requires the initial residual to drop by `rel0` (0 = off).
#[allow(clippy::too_many_arguments)]
pub fn pcg_op_r0(
    n: usize,
    apply: &mut dyn FnMut(&[f64], &mut [f64]),
    b: &[f64],
    x: &mut [f64],
    m: &dyn Precond,
    tol: Tol,
    rel0: f64,
    monitor: &mut Monitor,
) -> Result<SolveStats, Error> {
    let bn = dot(b, b).sqrt();
    if bn == 0.0 {
        x.iter_mut().for_each(|v| *v = 0.0);
        return Ok(SolveStats { iterations: 0, residual: 0.0, converged: true });
    }
    let mut r = vec![0.0; n];
    apply(x, &mut r);
    for i in 0..n {
        r[i] = b[i] - r[i];
    }
    let mut rn = dot(&r, &r).sqrt();
    let target = tol.target(bn, rn, rel0);
    if rn <= target {
        return Ok(SolveStats { iterations: 0, residual: rn / bn, converged: true });
    }
    let mut z = vec![0.0; n];
    m.apply(&r, &mut z);
    let mut p = z.clone();
    let mut q = vec![0.0; n];
    let mut rz = dot(&r, &z);
    let mut it = 0;
    while it < tol.max_iter {
        it += 1;
        apply(&p, &mut q);
        let pq = dot(&p, &q);
        if !(pq.abs() > 0.0) || !pq.is_finite() {
            break;
        }
        let alpha = rz / pq;
        for i in 0..n {
            x[i] += alpha * p[i];
            r[i] -= alpha * q[i];
        }
        rn = dot(&r, &r).sqrt();
        monitor(it, rn / bn)?;
        if rn <= target || !rn.is_finite() {
            break;
        }
        m.apply(&r, &mut z);
        let rz2 = dot(&r, &z);
        let beta = rz2 / rz;
        rz = rz2;
        for i in 0..n {
            p[i] = z[i] + beta * p[i];
        }
    }
    Ok(SolveStats { iterations: it, residual: rn / bn, converged: rn <= target })
}

pub fn pcg(a: &Csr, b: &[f64], x: &mut [f64], m: &dyn Precond, tol: Tol, monitor: &mut Monitor) -> Result<SolveStats, Error> {
    pcg_r0(a, b, x, m, tol, 0.0, monitor)
}

pub fn pcg_r0(a: &Csr, b: &[f64], x: &mut [f64], m: &dyn Precond, tol: Tol, rel0: f64, monitor: &mut Monitor) -> Result<SolveStats, Error> {
    let mut op = |v: &[f64], out: &mut [f64]| a.matvec(v, out);
    pcg_op_r0(a.n, &mut op, b, x, m, tol, rel0, monitor)
}

/// Right-preconditioned BiCGSTAB.
pub fn bicgstab(a: &Csr, b: &[f64], x: &mut [f64], m: &dyn Precond, tol: Tol, monitor: &mut Monitor) -> Result<SolveStats, Error> {
    bicgstab_r0(a, b, x, m, tol, 0.0, monitor)
}

/// BiCGSTAB that also requires the initial residual to drop by `rel0` (0 = off).
pub fn bicgstab_r0(a: &Csr, b: &[f64], x: &mut [f64], m: &dyn Precond, tol: Tol, rel0: f64, monitor: &mut Monitor) -> Result<SolveStats, Error> {
    let n = a.n;
    let bn = dot(b, b).sqrt();
    if bn == 0.0 {
        x.iter_mut().for_each(|v| *v = 0.0);
        return Ok(SolveStats { iterations: 0, residual: 0.0, converged: true });
    }
    let mut r = vec![0.0; n];
    a.matvec(x, &mut r);
    for i in 0..n {
        r[i] = b[i] - r[i];
    }
    let mut rn = dot(&r, &r).sqrt();
    let target = tol.target(bn, rn, rel0);
    if rn <= target {
        return Ok(SolveStats { iterations: 0, residual: rn / bn, converged: true });
    }
    let mut r0 = r.clone();
    let mut p = vec![0.0; n];
    let mut v = vec![0.0; n];
    let mut ph = vec![0.0; n];
    let mut s = vec![0.0; n];
    let mut sh = vec![0.0; n];
    let mut t = vec![0.0; n];
    let (mut rho, mut alpha, mut omega) = (1.0f64, 1.0f64, 1.0f64);
    let mut it = 0;
    let mut restarts = 0;
    while it < tol.max_iter {
        it += 1;
        let rho1 = dot(&r0, &r);
        if rho1.abs() < 1e-300 || !rho1.is_finite() {
            // Breakdown: restart with the current residual as shadow vector.
            if restarts > 5 {
                break;
            }
            restarts += 1;
            r0.copy_from_slice(&r);
            p.iter_mut().for_each(|v| *v = 0.0);
            v.iter_mut().for_each(|v| *v = 0.0);
            rho = 1.0;
            alpha = 1.0;
            omega = 1.0;
            continue;
        }
        let beta = (rho1 / rho) * (alpha / omega);
        rho = rho1;
        for i in 0..n {
            p[i] = r[i] + beta * (p[i] - omega * v[i]);
        }
        m.apply(&p, &mut ph);
        a.matvec(&ph, &mut v);
        let rv = dot(&r0, &v);
        if rv.abs() < 1e-300 || !rv.is_finite() {
            break;
        }
        alpha = rho / rv;
        for i in 0..n {
            s[i] = r[i] - alpha * v[i];
        }
        let sn = dot(&s, &s).sqrt();
        if sn <= target {
            for i in 0..n {
                x[i] += alpha * ph[i];
            }
            rn = sn;
            monitor(it, rn / bn)?;
            break;
        }
        m.apply(&s, &mut sh);
        a.matvec(&sh, &mut t);
        let tt = dot(&t, &t);
        omega = if tt > 0.0 { dot(&t, &s) / tt } else { 0.0 };
        for i in 0..n {
            x[i] += alpha * ph[i] + omega * sh[i];
            r[i] = s[i] - omega * t[i];
        }
        rn = dot(&r, &r).sqrt();
        monitor(it, rn / bn)?;
        if rn <= target || !rn.is_finite() {
            break;
        }
        if omega == 0.0 {
            break;
        }
    }
    Ok(SolveStats { iterations: it, residual: rn / bn, converged: rn <= target })
}


/// Symmetric 5-point stencil on a structured nx × ny grid (row-major, i + nx·j):
/// y_i = c_i x_i − e_i x_{i+1} − e_{i−1} x_{i−1} − s_i x_{i+nx} − s_{i−nx} x_{i−nx}.
/// `e` must be zero at the end of every row and `s` on the last row. Solved by
/// PCG with a modified incomplete Cholesky MIC(0) preconditioner; the loops are
/// fused and index-free, several times faster than the CSR path for the
/// pressure Poisson equation that is solved every flow step.
pub struct Stencil5 {
    nx: usize,
    n: usize,
    c: Vec<f64>,
    e: Vec<f64>,
    s: Vec<f64>,
    /// w[i] = e[i−1], so[i] = s[i−nx] (lower couplings, branch-free loops)
    w: Vec<f64>,
    so: Vec<f64>,
    inv: Vec<f64>,
    // Couplings pre-scaled by 1/d so each triangular sweep has a single
    // multiply-add on its loop-carried dependency chain.
    wi: Vec<f64>,
    soi: Vec<f64>,
    ei: Vec<f64>,
    si: Vec<f64>,
}

impl Stencil5 {
    pub fn new(nx: usize, c: Vec<f64>, e: Vec<f64>, s: Vec<f64>, omega: f64) -> Stencil5 {
        let n = c.len();
        let mut w = vec![0.0; n];
        let mut so = vec![0.0; n];
        for i in 1..n {
            w[i] = e[i - 1];
        }
        for i in nx..n {
            so[i] = s[i - nx];
        }
        let mut inv = vec![0.0; n];
        for i in 0..n {
            let mut d = c[i];
            if w[i] != 0.0 {
                d -= (w[i] * w[i] + omega * w[i] * s[i - 1]) * inv[i - 1];
            }
            if so[i] != 0.0 {
                d -= (so[i] * so[i] + omega * so[i] * e[i - nx]) * inv[i - nx];
            }
            if !(d > 1e-12 * c[i]) {
                d = c[i];
            }
            inv[i] = 1.0 / d;
        }
        let wi: Vec<f64> = (0..n).map(|i| w[i] * inv[i]).collect();
        let soi: Vec<f64> = (0..n).map(|i| so[i] * inv[i]).collect();
        let ei: Vec<f64> = (0..n).map(|i| e[i] * inv[i]).collect();
        let si: Vec<f64> = (0..n).map(|i| s[i] * inv[i]).collect();
        Stencil5 { nx, n, c, e, s, w, so, inv, wi, soi, ei, si }
    }

    /// y = A·x where `xp` is x padded with nx zeros on both sides. Returns x·y.
    #[inline]
    fn matvec_padded(&self, xp: &[f64], y: &mut [f64]) -> f64 {
        let (nx, n) = (self.nx, self.n);
        let xc = &xp[nx..nx + n];
        let xe = &xp[nx + 1..nx + 1 + n];
        let xw = &xp[nx - 1..nx - 1 + n];
        let xn = &xp[2 * nx..2 * nx + n];
        let xs = &xp[0..n];
        let (c, e, w, s, so) = (&self.c[..n], &self.e[..n], &self.w[..n], &self.s[..n], &self.so[..n]);
        let y = &mut y[..n];
        // Four partial sums break the floating-point add dependency chain.
        let mut acc = [0.0f64; 4];
        for i in 0..n {
            let v = c[i] * xc[i] - e[i] * xe[i] - w[i] * xw[i] - s[i] * xn[i] - so[i] * xs[i];
            y[i] = v;
            acc[i & 3] += v * xc[i];
        }
        (acc[0] + acc[1]) + (acc[2] + acc[3])
    }

    /// z = M⁻¹ r (z padded by nx on both sides); returns r·z.
    #[inline]
    fn precond(&self, r: &[f64], zp: &mut [f64]) -> f64 {
        let (nx, n) = (self.nx, self.n);
        let (wi, soi, ei, si, inv) = (&self.wi[..n], &self.soi[..n], &self.ei[..n], &self.si[..n], &self.inv[..n]);
        let r = &r[..n];
        // forward: padding zeros make the i−1 / i−nx reads safe at the start
        let mut prev = 0.0;
        for i in 0..n {
            let k = i + nx;
            let t = r[i] * inv[i] + soi[i] * zp[k - nx];
            prev = t + wi[i] * prev;
            zp[k] = prev;
        }
        let mut rz = 0.0;
        let mut next = 0.0;
        for i in (0..n).rev() {
            let k = i + nx;
            let t = zp[k] + si[i] * zp[k + nx];
            next = t + ei[i] * next;
            zp[k] = next;
            rz += r[i] * next;
        }
        rz
    }

    pub fn pcg(&self, b: &[f64], x: &mut [f64], tol: Tol, monitor: &mut Monitor) -> Result<SolveStats, Error> {
        let (n, nx) = (self.n, self.nx);
        let bn = dot(b, b).sqrt();
        if bn == 0.0 {
            x.iter_mut().for_each(|v| *v = 0.0);
            return Ok(SolveStats { iterations: 0, residual: 0.0, converged: true });
        }
        let target = (tol.rel * bn).max(tol.abs);
        let mut pp = vec![0.0; n + 2 * nx];
        pp[nx..nx + n].copy_from_slice(x);
        let mut r = vec![0.0; n];
        self.matvec_padded(&pp, &mut r);
        let mut rn2 = 0.0;
        for i in 0..n {
            r[i] = b[i] - r[i];
            rn2 += r[i] * r[i];
        }
        if rn2.sqrt() <= target {
            return Ok(SolveStats { iterations: 0, residual: rn2.sqrt() / bn, converged: true });
        }
        let mut zp = vec![0.0; n + 2 * nx];
        let mut rz = self.precond(&r, &mut zp);
        pp.copy_from_slice(&zp);
        let mut q = vec![0.0; n];
        let mut it = 0;
        let mut rn = rn2.sqrt();
        while it < tol.max_iter {
            it += 1;
            let pq = self.matvec_padded(&pp, &mut q);
            if !(pq.abs() > 0.0) || !pq.is_finite() {
                break;
            }
            let alpha = rz / pq;
            let mut acc = [0.0f64; 4];
            {
                let pc = &pp[nx..nx + n];
                let (x, r, q) = (&mut x[..n], &mut r[..n], &q[..n]);
                for i in 0..n {
                    x[i] += alpha * pc[i];
                    let ri = r[i] - alpha * q[i];
                    r[i] = ri;
                    acc[i & 3] += ri * ri;
                }
            }
            let rr = (acc[0] + acc[1]) + (acc[2] + acc[3]);
            rn = rr.sqrt();
            monitor(it, rn / bn)?;
            if rn <= target || !rn.is_finite() {
                break;
            }
            let rz2 = self.precond(&r, &mut zp);
            let beta = rz2 / rz;
            rz = rz2;
            {
                let zc = &zp[nx..nx + n];
                let pc = &mut pp[nx..nx + n];
                for i in 0..n {
                    pc[i] = zc[i] + beta * pc[i];
                }
            }
        }
        Ok(SolveStats { iterations: it, residual: rn / bn, converged: rn <= target })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lap1d(n: usize) -> Csr {
        let mut nb = vec![Vec::new(); n];
        for i in 0..n {
            if i > 0 {
                nb[i].push(i as u32 - 1);
            }
            if i + 1 < n {
                nb[i].push(i as u32 + 1);
            }
        }
        let mut a = Csr::from_neighbours(n, &nb);
        for i in 0..n {
            let d = a.diag[i];
            a.val[d] = 2.0;
            if i > 0 {
                let p = a.pos(i, i - 1);
                a.val[p] = -1.0;
            }
            if i + 1 < n {
                let p = a.pos(i, i + 1);
                a.val[p] = -1.0;
            }
        }
        a
    }

    #[test]
    fn pcg_ic0_tridiagonal_exact() {
        // IC(0) of a tridiagonal matrix is the exact Cholesky factor.
        let a = lap1d(50);
        let b: Vec<f64> = (0..50).map(|i| (i as f64).sin()).collect();
        let mut x = vec![0.0; 50];
        let m = Ic0::new(&a);
        let st = pcg(&a, &b, &mut x, &m, Tol { rel: 1e-12, abs: 0.0, max_iter: 100 }, &mut |_, _| Ok(())).unwrap();
        assert!(st.converged && st.iterations <= 2, "{st:?}");
    }

    #[test]
    fn bicgstab_ilu_nonsymmetric() {
        let n = 40;
        let mut a = lap1d(n);
        for i in 1..n {
            let p = a.pos(i, i - 1);
            a.val[p] -= 0.5; // upwind-like asymmetry
            let d = a.diag[i];
            a.val[d] += 0.5;
        }
        let xs: Vec<f64> = (0..n).map(|i| i as f64 * 0.1).collect();
        let mut b = vec![0.0; n];
        a.matvec(&xs, &mut b);
        let mut x = vec![0.0; n];
        let m = Ilu0::new(&a);
        let st = bicgstab(&a, &b, &mut x, &m, Tol { rel: 1e-12, abs: 0.0, max_iter: 200 }, &mut |_, _| Ok(())).unwrap();
        assert!(st.converged);
        for i in 0..n {
            assert!((x[i] - xs[i]).abs() < 1e-8);
        }
    }
}
