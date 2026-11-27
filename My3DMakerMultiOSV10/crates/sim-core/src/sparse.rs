//! Sparse matrices (CSR with a fixed pattern built from element connectivity), iterative solvers
//! (preconditioned conjugate gradients with Jacobi or incomplete Cholesky, COCG for complex
//! symmetric systems) and constraint handling.

use crate::Ctx;

#[derive(Clone)]
pub struct Csr {
    pub n: usize,
    pub rowptr: Vec<usize>,
    pub col: Vec<u32>,
    pub val: Vec<f64>,
}

impl Csr {
    /// The pattern of a matrix with `ndof` unknowns per node, coupling every pair of nodes that
    /// share an element.
    pub fn pattern(nnodes: usize, ndof: usize, elems: &mut dyn Iterator<Item = Vec<u32>>) -> Csr {
        let mut adj: Vec<Vec<u32>> = vec![Vec::new(); nnodes];
        for e in elems {
            for &a in &e {
                for &b in &e {
                    adj[a as usize].push(b);
                }
            }
        }
        for a in adj.iter_mut() {
            a.sort_unstable();
            a.dedup();
        }
        let n = nnodes * ndof;
        let mut rowptr = Vec::with_capacity(n + 1);
        rowptr.push(0);
        let mut total = 0usize;
        for node in 0..nnodes {
            for _ in 0..ndof {
                total += adj[node].len() * ndof;
                rowptr.push(total);
            }
        }
        let mut col = Vec::with_capacity(total);
        for node in 0..nnodes {
            for _ in 0..ndof {
                for &b in &adj[node] {
                    for d in 0..ndof {
                        col.push(b * ndof as u32 + d as u32);
                    }
                }
            }
        }
        Csr { n, rowptr, col, val: vec![0.0; total] }
    }

    /// A pattern given row by row (sorted, unique columns).
    pub fn from_rows(rows: Vec<Vec<u32>>) -> Csr {
        let n = rows.len();
        let mut rowptr = Vec::with_capacity(n + 1);
        rowptr.push(0);
        let mut col = Vec::new();
        for r in rows {
            col.extend_from_slice(&r);
            rowptr.push(col.len());
        }
        let nnz = col.len();
        Csr { n, rowptr, col, val: vec![0.0; nnz] }
    }

    pub fn same_pattern(&self) -> Csr { Csr { n: self.n, rowptr: self.rowptr.clone(), col: self.col.clone(), val: vec![0.0; self.val.len()] } }

    #[inline]
    pub fn find(&self, i: usize, j: usize) -> Option<usize> {
        let (a, b) = (self.rowptr[i], self.rowptr[i + 1]);
        self.col[a..b].binary_search(&(j as u32)).ok().map(|k| a + k)
    }

    #[inline]
    pub fn add(&mut self, i: usize, j: usize, v: f64) {
        if let Some(k) = self.find(i, j) {
            self.val[k] += v;
        }
    }

    /// Adds a dense element matrix (`dofs` global indices, row-major `ke`).
    pub fn add_element(&mut self, dofs: &[usize], ke: &[f64]) {
        let m = dofs.len();
        for (a, &i) in dofs.iter().enumerate() {
            let (s, e) = (self.rowptr[i], self.rowptr[i + 1]);
            let row = &self.col[s..e];
            for (b, &j) in dofs.iter().enumerate() {
                let v = ke[a * m + b];
                if v != 0.0 {
                    if let Ok(k) = row.binary_search(&(j as u32)) {
                        self.val[s + k] += v;
                    }
                }
            }
        }
    }

    pub fn diag(&self) -> Vec<f64> {
        (0..self.n).map(|i| self.find(i, i).map(|k| self.val[k]).unwrap_or(0.0)).collect()
    }

    pub fn matvec(&self, x: &[f64], y: &mut [f64]) {
        for i in 0..self.n {
            let mut s = 0.0;
            for k in self.rowptr[i]..self.rowptr[i + 1] {
                s += self.val[k] * x[self.col[k] as usize];
            }
            y[i] = s;
        }
    }

    pub fn mul(&self, x: &[f64]) -> Vec<f64> {
        let mut y = vec![0.0; self.n];
        self.matvec(x, &mut y);
        y
    }

    /// self + a·other (same pattern).
    pub fn axpy(&self, a: f64, other: &Csr) -> Csr {
        let mut m = self.clone();
        for (v, o) in m.val.iter_mut().zip(other.val.iter()) {
            *v += a * o;
        }
        m
    }

    pub fn scaled(&self, a: f64) -> Csr {
        let mut m = self.clone();
        for v in m.val.iter_mut() { *v *= a; }
        m
    }

    /// Fixes the dofs marked in `fixed` to `values`: the right-hand side takes the columns, the rows
    /// and columns become those of the identity. Keeps the matrix symmetric.
    pub fn constrain(&mut self, fixed: &[bool], values: &[f64], rhs: &mut [f64]) {
        for i in 0..self.n {
            for k in self.rowptr[i]..self.rowptr[i + 1] {
                let j = self.col[k] as usize;
                if fixed[i] {
                    self.val[k] = if i == j { 1.0 } else { 0.0 };
                } else if fixed[j] {
                    rhs[i] -= self.val[k] * values[j];
                    self.val[k] = 0.0;
                }
            }
        }
        for i in 0..self.n {
            if fixed[i] {
                rhs[i] = values[i];
            }
        }
    }

    /// Rows and columns of fixed dofs zeroed, no diagonal (for mass and geometric matrices in eigen
    /// problems, so the constrained modes go to infinity).
    pub fn zero_fixed(&mut self, fixed: &[bool], diag: f64) {
        for i in 0..self.n {
            for k in self.rowptr[i]..self.rowptr[i + 1] {
                let j = self.col[k] as usize;
                if fixed[i] || fixed[j] {
                    self.val[k] = if i == j && fixed[i] { diag } else { 0.0 };
                }
            }
        }
    }
}

pub trait Precond {
    fn apply(&self, r: &[f64], z: &mut [f64]);
}

pub struct Jacobi(pub Vec<f64>);

impl Jacobi {
    pub fn new(a: &Csr) -> Jacobi {
        Jacobi(a.diag().iter().map(|d| if d.abs() > 1e-300 { 1.0 / d } else { 1.0 }).collect())
    }
}

impl Precond for Jacobi {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        for i in 0..r.len() { z[i] = r[i] * self.0[i]; }
    }
}

/// Incomplete Cholesky with zero fill-in, A ≈ L Lᵀ (L stored by rows, the diagonal last in each).
pub struct Ic0 {
    n: usize,
    rowptr: Vec<usize>,
    col: Vec<u32>,
    val: Vec<f64>,
}

impl Ic0 {
    pub fn new(a: &Csr) -> Option<Ic0> {
        let d = a.diag();
        for shift in [0.0, 1e-4, 1e-3, 1e-2, 5e-2, 0.2] {
            if let Some(f) = Ic0::try_factor(a, &d, shift) {
                if std::env::var_os("SIM_EIG_DEBUG").is_some() { eprintln!("ic0 n {} shift {shift}", a.n); }
                return Some(f);
            }
        }
        if std::env::var_os("SIM_EIG_DEBUG").is_some() { eprintln!("ic0 failed n {}", a.n); }
        None
    }

    fn try_factor(a: &Csr, d: &[f64], shift: f64) -> Option<Ic0> {
        let n = a.n;
        let mut rowptr = Vec::with_capacity(n + 1);
        rowptr.push(0);
        let mut col: Vec<u32> = Vec::new();
        let mut val: Vec<f64> = Vec::new();
        for i in 0..n {
            for k in a.rowptr[i]..a.rowptr[i + 1] {
                let j = a.col[k] as usize;
                if j < i && a.val[k] != 0.0 {
                    col.push(j as u32);
                    val.push(a.val[k]);
                }
            }
            col.push(i as u32);
            val.push(d[i] * (1.0 + shift));
            rowptr.push(col.len());
        }
        // Row-wise IC(0): L[i,k] = (A[i,k] − Σ_{j<k} L[i,j] L[k,j]) / L[k,k].
        for i in 0..n {
            let (s, e) = (rowptr[i], rowptr[i + 1]);
            for p in s..e - 1 {
                let k = col[p] as usize;
                let (ks, ke) = (rowptr[k], rowptr[k + 1]);
                // Sparse dot of row i (before p) and row k (before its diagonal).
                let mut sum = 0.0;
                let (mut a1, mut b1) = (s, ks);
                while a1 < p && b1 < ke - 1 {
                    let (ca, cb) = (col[a1], col[b1]);
                    if ca == cb { sum += val[a1] * val[b1]; a1 += 1; b1 += 1; } else if ca < cb { a1 += 1; } else { b1 += 1; }
                }
                val[p] = (val[p] - sum) / val[ke - 1];
            }
            let mut diag = val[e - 1];
            for p in s..e - 1 { diag -= val[p] * val[p]; }
            if !(diag > 1e-14 * d[i].abs().max(1e-300)) || !diag.is_finite() {
                return None;
            }
            val[e - 1] = diag.sqrt();
        }
        Some(Ic0 { n, rowptr, col, val })
    }
}

impl Precond for Ic0 {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        let n = self.n;
        // L y = r
        for i in 0..n {
            let (s, e) = (self.rowptr[i], self.rowptr[i + 1]);
            let mut sum = r[i];
            for p in s..e - 1 { sum -= self.val[p] * z[self.col[p] as usize]; }
            z[i] = sum / self.val[e - 1];
        }
        // Lᵀ x = y
        for i in (0..n).rev() {
            let (s, e) = (self.rowptr[i], self.rowptr[i + 1]);
            z[i] /= self.val[e - 1];
            let zi = z[i];
            for p in s..e - 1 { z[self.col[p] as usize] -= self.val[p] * zi; }
        }
    }
}

/// The best available preconditioner for an SPD matrix.
pub enum Pre {
    Ic(Ic0),
    Jac(Jacobi),
}

impl Pre {
    pub fn new(a: &Csr) -> Pre {
        match Ic0::new(a) {
            Some(f) => Pre::Ic(f),
            None => Pre::Jac(Jacobi::new(a)),
        }
    }
}

impl Precond for Pre {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        match self {
            Pre::Ic(f) => f.apply(r, z),
            Pre::Jac(j) => j.apply(r, z),
        }
    }
}

pub struct CgInfo {
    pub iterations: usize,
    pub residual: f64,
    pub converged: bool,
}

/// Preconditioned conjugate gradients for an SPD matrix; `x` holds the start and the result.
pub fn pcg(a: &Csr, b: &[f64], x: &mut [f64], m: &dyn Precond, tol: f64, max_iter: usize, ctx: Option<(&mut Ctx, f64, f64)>) -> Result<CgInfo, String> {
    let n = a.n;
    let bnorm = b.iter().map(|v| v * v).sum::<f64>().sqrt();
    if bnorm == 0.0 {
        x.iter_mut().for_each(|v| *v = 0.0);
        return Ok(CgInfo { iterations: 0, residual: 0.0, converged: true });
    }
    let mut r = vec![0.0; n];
    a.matvec(x, &mut r);
    for i in 0..n { r[i] = b[i] - r[i]; }
    let mut z = vec![0.0; n];
    m.apply(&r, &mut z);
    let mut p = z.clone();
    let mut rz: f64 = r.iter().zip(z.iter()).map(|(a, b)| a * b).sum();
    let mut ap = vec![0.0; n];
    let mut ctx = ctx;
    let mut res = r.iter().map(|v| v * v).sum::<f64>().sqrt() / bnorm;
    for it in 0..max_iter {
        if res <= tol {
            return Ok(CgInfo { iterations: it, residual: res, converged: true });
        }
        a.matvec(&p, &mut ap);
        let pap: f64 = p.iter().zip(ap.iter()).map(|(a, b)| a * b).sum();
        if pap <= 0.0 || !pap.is_finite() {
            return Err("solver.notPositive".into());
        }
        let alpha = rz / pap;
        for i in 0..n {
            x[i] += alpha * p[i];
            r[i] -= alpha * ap[i];
        }
        res = r.iter().map(|v| v * v).sum::<f64>().sqrt() / bnorm;
        m.apply(&r, &mut z);
        let rz2: f64 = r.iter().zip(z.iter()).map(|(a, b)| a * b).sum();
        let beta = rz2 / rz;
        rz = rz2;
        for i in 0..n { p[i] = z[i] + beta * p[i]; }
        if it % 25 == 0 {
            if let Some((c, f0, f1)) = ctx.as_mut() {
                // Progress follows log(residual) from 1 down to the tolerance.
                let frac = ((-res.max(1e-300).log10()) / (-tol.log10())).clamp(0.0, 1.0);
                c.step(*f0 + (*f1 - *f0) * frac, "progress.solve")?;
            }
        }
    }
    Ok(CgInfo { iterations: max_iter, residual: res, converged: res <= tol * 10.0 })
}

/// Solves with a fresh preconditioner and reports non-convergence as an error.
pub fn solve_spd(a: &Csr, b: &[f64], ctx: &mut Ctx, f0: f64, f1: f64) -> Result<(Vec<f64>, CgInfo), String> {
    let pre = Pre::new(a);
    let mut x = vec![0.0; a.n];
    let info = pcg(a, b, &mut x, &pre, 1e-9, 20000.max(a.n / 2), Some((ctx, f0, f1)))?;
    if std::env::var_os("SIM_EIG_DEBUG").is_some() { eprintln!("pcg n {} iterations {} ic {}", a.n, info.iterations, matches!(pre, Pre::Ic(_))); }
    if !info.converged {
        return Err("solver.noConvergence".into());
    }
    Ok((x, info))
}

// ───────────────────────── complex symmetric systems (harmonic acoustics)

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct C64 {
    pub re: f64,
    pub im: f64,
}

impl C64 {
    pub fn new(re: f64, im: f64) -> C64 { C64 { re, im } }
    pub fn abs(self) -> f64 { self.re.hypot(self.im) }
    pub fn arg(self) -> f64 { self.im.atan2(self.re) }
}
impl std::ops::Add for C64 { type Output = C64; fn add(self, o: C64) -> C64 { C64::new(self.re + o.re, self.im + o.im) } }
impl std::ops::Sub for C64 { type Output = C64; fn sub(self, o: C64) -> C64 { C64::new(self.re - o.re, self.im - o.im) } }
impl std::ops::Mul for C64 { type Output = C64; fn mul(self, o: C64) -> C64 { C64::new(self.re * o.re - self.im * o.im, self.re * o.im + self.im * o.re) } }
impl std::ops::Div for C64 {
    type Output = C64;
    fn div(self, o: C64) -> C64 { let d = o.re * o.re + o.im * o.im; C64::new((self.re * o.re + self.im * o.im) / d, (self.im * o.re - self.re * o.im) / d) }
}
impl std::ops::Mul<f64> for C64 { type Output = C64; fn mul(self, o: f64) -> C64 { C64::new(self.re * o, self.im * o) } }

/// Conjugate orthogonal conjugate gradients for A = Ar + i·Ai (complex symmetric, same pattern),
/// Jacobi preconditioned.
pub fn cocg(ar: &Csr, ai: &Csr, b: &[C64], tol: f64, max_iter: usize) -> (Vec<C64>, bool) {
    let n = ar.n;
    let mv = |x: &[C64], y: &mut [C64]| {
        for i in 0..n {
            let mut s = C64::default();
            for k in ar.rowptr[i]..ar.rowptr[i + 1] {
                let a = C64::new(ar.val[k], ai.val[k]);
                s = s + a * x[ar.col[k] as usize];
            }
            y[i] = s;
        }
    };
    let dinv: Vec<C64> = (0..n).map(|i| {
        let k = ar.find(i, i).unwrap();
        let d = C64::new(ar.val[k], ai.val[k]);
        if d.abs() > 1e-300 { C64::new(1.0, 0.0) / d } else { C64::new(1.0, 0.0) }
    }).collect();
    let bdot = |a: &[C64], b: &[C64]| a.iter().zip(b.iter()).fold(C64::default(), |s, (x, y)| s + *x * *y);
    let bnorm = b.iter().map(|v| v.abs().powi(2)).sum::<f64>().sqrt().max(1e-300);
    let mut x = vec![C64::default(); n];
    let mut r = b.to_vec();
    let mut z: Vec<C64> = (0..n).map(|i| dinv[i] * r[i]).collect();
    let mut p = z.clone();
    let mut rz = bdot(&r, &z);
    let mut ap = vec![C64::default(); n];
    for _ in 0..max_iter {
        let res = r.iter().map(|v| v.abs().powi(2)).sum::<f64>().sqrt() / bnorm;
        if res < tol { return (x, true); }
        mv(&p, &mut ap);
        let pap = bdot(&p, &ap);
        if pap.abs() < 1e-300 { break; }
        let alpha = rz / pap;
        for i in 0..n { x[i] = x[i] + alpha * p[i]; r[i] = r[i] - alpha * ap[i]; }
        for i in 0..n { z[i] = dinv[i] * r[i]; }
        let rz2 = bdot(&r, &z);
        let beta = rz2 / rz;
        rz = rz2;
        for i in 0..n { p[i] = z[i] + beta * p[i]; }
    }
    let res = r.iter().map(|v| v.abs().powi(2)).sum::<f64>().sqrt() / bnorm;
    (x, res < tol * 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn laplace1d(n: usize) -> Csr {
        let rows: Vec<Vec<u32>> = (0..n).map(|i| {
            let mut r = vec![];
            if i > 0 { r.push(i as u32 - 1); }
            r.push(i as u32);
            if i + 1 < n { r.push(i as u32 + 1); }
            r
        }).collect();
        let mut a = Csr::from_rows(rows);
        for i in 0..n {
            a.add(i, i, 2.0);
            if i > 0 { a.add(i, i - 1, -1.0); }
            if i + 1 < n { a.add(i, i + 1, -1.0); }
        }
        a
    }

    #[test]
    fn pcg_solves_laplace() {
        let a = laplace1d(200);
        let b = vec![1.0; 200];
        let mut ctx = Ctx::silent();
        let (x, info) = solve_spd(&a, &b, &mut ctx, 0.0, 1.0).unwrap();
        assert!(info.converged);
        let r = a.mul(&x);
        assert!(r.iter().zip(b.iter()).all(|(a, b)| (a - b).abs() < 1e-6));
    }

    #[test]
    fn ic0_is_exact_for_tridiagonal() {
        let a = laplace1d(50);
        let f = Ic0::new(&a).unwrap();
        let b: Vec<f64> = (0..50).map(|i| (i as f64).sin()).collect();
        let mut x = vec![0.0; 50];
        f.apply(&b, &mut x);
        let r = a.mul(&x);
        assert!(r.iter().zip(b.iter()).all(|(a, b)| (a - b).abs() < 1e-9));
    }

    #[test]
    fn constrain_keeps_solution() {
        let mut a = laplace1d(10);
        let mut b = vec![0.0; 10];
        let mut fixed = vec![false; 10];
        let mut vals = vec![0.0; 10];
        fixed[0] = true; fixed[9] = true; vals[9] = 9.0;
        a.constrain(&fixed, &vals, &mut b);
        let mut ctx = Ctx::silent();
        let (x, _) = solve_spd(&a, &b, &mut ctx, 0.0, 1.0).unwrap();
        for i in 0..10 { assert!((x[i] - i as f64).abs() < 1e-6); }
    }

    #[test]
    fn cocg_matches_real_solution() {
        let a = laplace1d(30);
        let ai = a.same_pattern();
        let b: Vec<C64> = (0..30).map(|_| C64::new(1.0, 0.5)).collect();
        let (x, ok) = cocg(&a, &ai, &b, 1e-10, 500);
        assert!(ok);
        let mut ctx = Ctx::silent();
        let (xr, _) = solve_spd(&a, &vec![1.0; 30], &mut ctx, 0.0, 1.0).unwrap();
        for i in 0..30 { assert!((x[i].re - xr[i]).abs() < 1e-6 && (x[i].im - 0.5 * xr[i]).abs() < 1e-6); }
    }
}

// ───────────────────────── two-level preconditioner (aggregation with rigid-body coarse space)

/// IC(0) smoothing around a coarse correction on node aggregates. The coarse space holds the rigid
/// motions of each aggregate (3 translations + 3 rotations for elasticity, a constant for scalar
/// fields), so the smooth, long-wave error that IC(0) barely touches (bending of slender parts)
/// is removed directly.
pub struct TwoLevel {
    a: Csr,
    smoother: Pre,
    ndof: usize,
    /// Aggregate of each node.
    agg: Vec<u32>,
    /// Node position relative to its aggregate centre, scaled.
    rel: Vec<[f64; 3]>,
    ncoarse: usize,
    /// Dense Cholesky factor of the coarse matrix (row-major lower).
    chol: Vec<f64>,
}

fn coarse_cols(ndof: usize) -> usize { if ndof == 3 { 6 } else { 1 } }

impl TwoLevel {
    pub fn new(a: &Csr, x: &[[f64; 3]], ndof: usize, target: usize) -> Option<TwoLevel> {
        let nn = a.n / ndof;
        if nn == 0 || x.len() < nn { return None; }
        let x = &x[..nn];
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        for p in x { for k in 0..3 { lo[k] = lo[k].min(p[k]); hi[k] = hi[k].max(p[k]); } }
        let ext = (0..3).map(|k| (hi[k] - lo[k]).max(1e-12_f64)).fold(0.0_f64, f64::max);
        // Cube size giving about `target` occupied aggregates.
        let count = |s: f64| -> usize {
            let mut set = std::collections::HashSet::new();
            for p in x { set.insert((((p[0] - lo[0]) / s) as i64, ((p[1] - lo[1]) / s) as i64, ((p[2] - lo[2]) / s) as i64)); }
            set.len()
        };
        let (mut s0, mut s1) = (ext / 400.0, ext * 1.01);
        for _ in 0..30 {
            let s = (s0 * s1).sqrt();
            if count(s) > target { s0 = s; } else { s1 = s; }
        }
        let s = s1;
        let mut ids: std::collections::HashMap<(i64, i64, i64), u32> = std::collections::HashMap::new();
        let mut agg = vec![0u32; nn];
        for (i, p) in x.iter().enumerate() {
            let key = (((p[0] - lo[0]) / s) as i64, ((p[1] - lo[1]) / s) as i64, ((p[2] - lo[2]) / s) as i64);
            let next = ids.len() as u32;
            agg[i] = *ids.entry(key).or_insert(next);
        }
        let na = ids.len();
        let mut cen = vec![[0.0f64; 3]; na];
        let mut cnt = vec![0.0f64; na];
        for (i, p) in x.iter().enumerate() { let g = agg[i] as usize; for k in 0..3 { cen[g][k] += p[k]; } cnt[g] += 1.0; }
        for g in 0..na { for k in 0..3 { cen[g][k] /= cnt[g].max(1.0); } }
        let rel: Vec<[f64; 3]> = x.iter().enumerate().map(|(i, p)| { let c = cen[agg[i] as usize]; [(p[0] - c[0]) / s, (p[1] - c[1]) / s, (p[2] - c[2]) / s] }).collect();
        let nc = coarse_cols(ndof);
        let ncoarse = na * nc;
        if ncoarse > 4000 { return None; }
        let mut tl = TwoLevel { a: a.clone(), smoother: Pre::new(a), ndof, agg, rel, ncoarse, chol: Vec::new() };
        // Coarse matrix P^T A P.
        let mut ac = vec![0.0; ncoarse * ncoarse];
        for i in 0..a.n {
            let (ni, ci) = (i / ndof, i % ndof);
            let gi = tl.agg[ni] as usize;
            let pi = tl.prow(ni, ci);
            for k in a.rowptr[i]..a.rowptr[i + 1] {
                let v = a.val[k];
                if v == 0.0 { continue; }
                let j = a.col[k] as usize;
                let (nj, cj) = (j / ndof, j % ndof);
                let gj = tl.agg[nj] as usize;
                let pj = tl.prow(nj, cj);
                for p in 0..nc {
                    if pi[p] == 0.0 { continue; }
                    for q in 0..nc { if pj[q] != 0.0 { ac[(gi * nc + p) * ncoarse + gj * nc + q] += pi[p] * v * pj[q]; } }
                }
            }
        }
        // Dense Cholesky (a small regularisation keeps it definite where a rotation is barely resolved).
        let n = ncoarse;
        let dmax = (0..n).map(|i| ac[i * n + i]).fold(0.0, f64::max).max(1e-300);
        for i in 0..n { ac[i * n + i] += 1e-10 * dmax; }
        for j in 0..n {
            let mut d = ac[j * n + j];
            for k in 0..j { d -= ac[j * n + k] * ac[j * n + k]; }
            if !(d > 1e-14 * dmax) { d = 1e-8 * dmax; }
            let d = d.sqrt();
            ac[j * n + j] = d;
            for i in j + 1..n {
                let mut v = ac[i * n + j];
                for k in 0..j { v -= ac[i * n + k] * ac[j * n + k]; }
                ac[i * n + j] = v / d;
            }
        }
        tl.chol = ac;
        Some(tl)
    }

    /// The row of P for (node, component).
    #[inline]
    fn prow(&self, node: usize, comp: usize) -> [f64; 6] {
        if self.ndof != 3 { return [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]; }
        let r = self.rel[node];
        let mut p = [0.0; 6];
        p[comp] = 1.0;
        // Rotations about x, y, z (omega x r).
        match comp {
            0 => { p[4] = r[2]; p[5] = -r[1]; }
            1 => { p[3] = -r[2]; p[5] = r[0]; }
            _ => { p[3] = r[1]; p[4] = -r[0]; }
        }
        p
    }

    fn coarse_solve(&self, b: &mut [f64]) {
        let n = self.ncoarse;
        let l = &self.chol;
        for i in 0..n { let mut v = b[i]; for k in 0..i { v -= l[i * n + k] * b[k]; } b[i] = v / l[i * n + i]; }
        for i in (0..n).rev() { let mut v = b[i]; for k in i + 1..n { v -= l[k * n + i] * b[k]; } b[i] = v / l[i * n + i]; }
    }
}

impl Precond for TwoLevel {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        let n = self.a.n;
        let nc = coarse_cols(self.ndof);
        self.smoother.apply(r, z);
        let mut res = vec![0.0; n];
        self.a.matvec(z, &mut res);
        for i in 0..n { res[i] = r[i] - res[i]; }
        let mut rc = vec![0.0; self.ncoarse];
        for i in 0..n {
            let (nd, c) = (i / self.ndof, i % self.ndof);
            let g = self.agg[nd] as usize;
            let p = self.prow(nd, c);
            for q in 0..nc { rc[g * nc + q] += p[q] * res[i]; }
        }
        self.coarse_solve(&mut rc);
        for i in 0..n {
            let (nd, c) = (i / self.ndof, i % self.ndof);
            let g = self.agg[nd] as usize;
            let p = self.prow(nd, c);
            let mut v = 0.0;
            for q in 0..nc { v += p[q] * rc[g * nc + q]; }
            z[i] += v;
        }
        self.a.matvec(z, &mut res);
        for i in 0..n { res[i] = r[i] - res[i]; }
        let mut dz = vec![0.0; n];
        self.smoother.apply(&res, &mut dz);
        for i in 0..n { z[i] += dz[i]; }
    }
}

/// The preconditioner for an SPD system on a mesh: two-level when it is large enough to need it.
pub fn precond(a: &Csr, x: &[[f64; 3]], ndof: usize) -> Box<dyn Precond> {
    if a.n > 3000 && std::env::var_os("SIM_ONE_LEVEL").is_none() {
        let target = (a.n / ndof / 40).clamp(40, if ndof == 3 { 350 } else { 1500 });
        if let Some(t) = TwoLevel::new(a, x, ndof, target) { return Box::new(t); }
    }
    Box::new(Pre::new(a))
}

/// Solves an SPD mesh system with the best preconditioner.
pub fn solve_mesh(a: &Csr, b: &[f64], x: &[[f64; 3]], ndof: usize, ctx: &mut Ctx, f0: f64, f1: f64) -> Result<Vec<f64>, String> {
    let pre = precond(a, x, ndof);
    let mut u = vec![0.0; a.n];
    let info = pcg(a, b, &mut u, pre.as_ref(), 1e-9, 20000.max(a.n / 2), Some((ctx, f0, f1)))?;
    if std::env::var_os("SIM_EIG_DEBUG").is_some() { eprintln!("pcg2 n {} iterations {}", a.n, info.iterations); }
    if !info.converged { return Err("solver.noConvergence".into()); }
    Ok(u)
}
