//! Small dense linear algebra: LU solve, least squares (Householder QR),
//! symmetric eigenproblems (Jacobi), polynomial roots and the eigenvalues of
//! a small general matrix.

use crate::fft::C64;

pub type Mat = Vec<Vec<f64>>;

pub fn zeros(rows: usize, cols: usize) -> Mat {
    vec![vec![0.0; cols]; rows]
}

pub fn identity(n: usize) -> Mat {
    let mut m = zeros(n, n);
    for (i, row) in m.iter_mut().enumerate() {
        row[i] = 1.0;
    }
    m
}

pub fn matmul(a: &Mat, b: &Mat) -> Mat {
    let n = a.len();
    let k = b.len();
    let m = b.first().map_or(0, |r| r.len());
    let mut c = zeros(n, m);
    for i in 0..n {
        for p in 0..k {
            let aip = a[i][p];
            if aip == 0.0 {
                continue;
            }
            for j in 0..m {
                c[i][j] += aip * b[p][j];
            }
        }
    }
    c
}

pub fn matvec(a: &Mat, x: &[f64]) -> Vec<f64> {
    a.iter().map(|row| row.iter().zip(x).map(|(p, q)| p * q).sum()).collect()
}

pub fn transpose(a: &Mat) -> Mat {
    let rows = a.len();
    let cols = a.first().map_or(0, |r| r.len());
    let mut t = zeros(cols, rows);
    for i in 0..rows {
        for j in 0..cols {
            t[j][i] = a[i][j];
        }
    }
    t
}

/// Solves A x = b by LU with partial pivoting.
pub fn solve(a: &Mat, b: &[f64]) -> Result<Vec<f64>, String> {
    let n = a.len();
    let mut m: Mat = a.clone();
    let mut x = b.to_vec();
    for col in 0..n {
        let pivot = (col..n).max_by(|&i, &j| m[i][col].abs().partial_cmp(&m[j][col].abs()).unwrap()).unwrap();
        if m[pivot][col].abs() < 1e-300 {
            return Err("the matrix is singular".into());
        }
        m.swap(col, pivot);
        x.swap(col, pivot);
        for row in col + 1..n {
            let f = m[row][col] / m[col][col];
            if f == 0.0 {
                continue;
            }
            for k in col..n {
                m[row][k] -= f * m[col][k];
            }
            x[row] -= f * x[col];
        }
    }
    for col in (0..n).rev() {
        let mut s = x[col];
        for k in col + 1..n {
            s -= m[col][k] * x[k];
        }
        x[col] = s / m[col][col];
    }
    Ok(x)
}

pub fn inverse(a: &Mat) -> Result<Mat, String> {
    let n = a.len();
    let mut inv = zeros(n, n);
    for j in 0..n {
        let mut e = vec![0.0; n];
        e[j] = 1.0;
        let col = solve(a, &e)?;
        for i in 0..n {
            inv[i][j] = col[i];
        }
    }
    Ok(inv)
}

/// Least squares min |A x − b| (A is m × n, m ≥ n) by Householder QR.
/// Returns x and (RᵀR)⁻¹ = (AᵀA)⁻¹ for parameter standard errors.
pub fn lstsq(a: &Mat, b: &[f64]) -> Result<(Vec<f64>, Mat), String> {
    let m = a.len();
    let n = a.first().map_or(0, |r| r.len());
    if m < n {
        return Err(format!("{m} data points are too few for {n} parameters"));
    }
    let mut r = a.clone();
    let mut qtb = b.to_vec();
    for k in 0..n {
        let norm = (k..m).map(|i| r[i][k] * r[i][k]).sum::<f64>().sqrt();
        if norm < 1e-300 {
            return Err("the fit is singular (a parameter has no effect on the data)".into());
        }
        let alpha = if r[k][k] > 0.0 { -norm } else { norm };
        let mut v: Vec<f64> = (k..m).map(|i| r[i][k]).collect();
        v[0] -= alpha;
        let vnorm2: f64 = v.iter().map(|x| x * x).sum();
        if vnorm2 < 1e-300 {
            continue;
        }
        for j in k..n {
            let s: f64 = (k..m).map(|i| v[i - k] * r[i][j]).sum::<f64>() * 2.0 / vnorm2;
            for i in k..m {
                r[i][j] -= s * v[i - k];
            }
        }
        let s: f64 = (k..m).map(|i| v[i - k] * qtb[i]).sum::<f64>() * 2.0 / vnorm2;
        for i in k..m {
            qtb[i] -= s * v[i - k];
        }
    }
    let max_diag = (0..n).map(|k| r[k][k].abs()).fold(0.0, f64::max);
    if (0..n).any(|k| r[k][k].abs() < 1e-12 * max_diag.max(1e-300)) {
        return Err("the fit is singular (parameters depend on each other)".into());
    }
    let mut x = vec![0.0; n];
    for k in (0..n).rev() {
        let mut s = qtb[k];
        for j in k + 1..n {
            s -= r[k][j] * x[j];
        }
        x[k] = s / r[k][k];
    }
    // R⁻¹ (upper triangular), then (AᵀA)⁻¹ = R⁻¹ R⁻ᵀ.
    let mut rinv = zeros(n, n);
    for j in 0..n {
        rinv[j][j] = 1.0 / r[j][j];
        for i in (0..j).rev() {
            let s: f64 = (i + 1..=j).map(|k| r[i][k] * rinv[k][j]).sum();
            rinv[i][j] = -s / r[i][i];
        }
    }
    let cov = matmul(&rinv, &transpose(&rinv));
    Ok((x, cov))
}

/// Rank by Gaussian elimination with a relative tolerance.
pub fn rank(a: &Mat) -> usize {
    let mut m = a.clone();
    let rows = m.len();
    let cols = m.first().map_or(0, |r| r.len());
    let scale = m.iter().flatten().fold(0.0f64, |acc, v| acc.max(v.abs())).max(1e-300);
    let tol = 1e-10 * scale * rows.max(cols) as f64;
    let mut rank = 0;
    for col in 0..cols {
        if rank == rows {
            break;
        }
        let pivot = (rank..rows).max_by(|&i, &j| m[i][col].abs().partial_cmp(&m[j][col].abs()).unwrap()).unwrap();
        if m[pivot][col].abs() <= tol {
            continue;
        }
        m.swap(rank, pivot);
        for row in rank + 1..rows {
            let f = m[row][col] / m[rank][col];
            for k in col..cols {
                m[row][k] -= f * m[rank][k];
            }
        }
        rank += 1;
    }
    rank
}

/// Eigenvalues (descending) and eigenvectors (columns) of a symmetric matrix by cyclic Jacobi.
pub fn sym_eigen(a: &Mat) -> (Vec<f64>, Mat) {
    let n = a.len();
    let mut m = a.clone();
    let mut v = identity(n);
    for _sweep in 0..100 {
        let off: f64 = (0..n).flat_map(|i| (0..n).filter(move |&j| j != i).map(move |j| (i, j))).map(|(i, j)| m[i][j] * m[i][j]).sum();
        if off < 1e-22 {
            break;
        }
        for p in 0..n {
            for q in p + 1..n {
                if m[p][q].abs() < 1e-300 {
                    continue;
                }
                let theta = (m[q][q] - m[p][p]) / (2.0 * m[p][q]);
                let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
                let t = if theta == 0.0 { 1.0 } else { t };
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..n {
                    let mkp = m[k][p];
                    let mkq = m[k][q];
                    m[k][p] = c * mkp - s * mkq;
                    m[k][q] = s * mkp + c * mkq;
                }
                for k in 0..n {
                    let mpk = m[p][k];
                    let mqk = m[q][k];
                    m[p][k] = c * mpk - s * mqk;
                    m[q][k] = s * mpk + c * mqk;
                }
                for k in 0..n {
                    let vkp = v[k][p];
                    let vkq = v[k][q];
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&i, &j| m[j][j].partial_cmp(&m[i][i]).unwrap_or(std::cmp::Ordering::Equal));
    let values = order.iter().map(|&i| m[i][i]).collect();
    let mut vectors = zeros(n, n);
    for (new, &old) in order.iter().enumerate() {
        // Sign convention: the largest component positive.
        let big = (0..n).max_by(|&a, &b| v[a][old].abs().partial_cmp(&v[b][old].abs()).unwrap()).unwrap_or(0);
        let sign = if v[big][old] < 0.0 { -1.0 } else { 1.0 };
        for k in 0..n {
            vectors[k][new] = v[k][old] * sign;
        }
    }
    (values, vectors)
}

/// Roots of a polynomial given by coefficients in descending powers (Aberth–Ehrlich).
pub fn poly_roots(coeffs: &[f64]) -> Vec<C64> {
    // Strip leading zeros.
    let start = coeffs.iter().position(|c| *c != 0.0).unwrap_or(coeffs.len());
    let c = &coeffs[start..];
    if c.len() <= 1 {
        return Vec::new();
    }
    // Zero roots (trailing zeros) are exact.
    let trailing = c.iter().rev().take_while(|v| **v == 0.0).count();
    let c = &c[..c.len() - trailing];
    let mut roots = vec![C64::ZERO; trailing];
    let n = c.len() - 1;
    if n == 0 {
        return roots;
    }
    let lead = c[0];
    let a: Vec<f64> = c.iter().map(|v| v / lead).collect();
    if n == 1 {
        roots.push(C64::new(-a[1], 0.0));
        return roots;
    }
    if n == 2 {
        let disc = C64::new(a[1] * a[1] - 4.0 * a[2], 0.0).sqrt();
        roots.push((C64::new(-a[1], 0.0) + disc).scale(0.5));
        roots.push((C64::new(-a[1], 0.0) - disc).scale(0.5));
        roots.sort_by(|p, q| p.re.partial_cmp(&q.re).unwrap_or(std::cmp::Ordering::Equal).then(p.im.partial_cmp(&q.im).unwrap_or(std::cmp::Ordering::Equal)));
        return roots;
    }
    // Initial guesses on a circle of the Cauchy bound radius.
    let radius = 1.0 + a.iter().skip(1).fold(0.0f64, |m, v| m.max(v.abs()));
    let r0 = radius.min(1e6).powf(1.0) * 0.5 + 0.5;
    let mut z: Vec<C64> = (0..n).map(|k| C64::polar(r0, 2.0 * std::f64::consts::PI * k as f64 / n as f64 + 0.4)).collect();
    let eval = |x: C64| -> (C64, C64) {
        let mut p = C64::new(a[0], 0.0);
        let mut dp = C64::ZERO;
        for coef in a.iter().skip(1) {
            dp = dp * x + p;
            p = p * x + C64::new(*coef, 0.0);
        }
        (p, dp)
    };
    for _ in 0..500 {
        let mut moved = 0.0f64;
        for i in 0..n {
            let (p, dp) = eval(z[i]);
            if p.abs() == 0.0 {
                continue;
            }
            let ratio = p / dp;
            let mut sum = C64::ZERO;
            for j in 0..n {
                if j != i {
                    let d = z[i] - z[j];
                    if d.abs() > 1e-300 {
                        sum = sum + d.inv();
                    }
                }
            }
            let w = ratio / (C64::ONE - ratio * sum);
            z[i] = z[i] - w;
            moved = moved.max(w.abs() / z[i].abs().max(1.0));
        }
        if moved < 1e-15 {
            break;
        }
    }
    // Snap tiny imaginary parts (real roots).
    for r in z.iter_mut() {
        if r.im.abs() < 1e-9 * r.re.abs().max(1.0) {
            r.im = 0.0;
        }
    }
    roots.extend(z);
    roots.sort_by(|p, q| p.re.partial_cmp(&q.re).unwrap_or(std::cmp::Ordering::Equal).then(p.im.partial_cmp(&q.im).unwrap_or(std::cmp::Ordering::Equal)));
    roots
}

/// Characteristic polynomial det(sI − A), descending powers (Faddeev–LeVerrier).
pub fn char_poly(a: &Mat) -> Vec<f64> {
    let n = a.len();
    let mut coeffs = vec![1.0];
    let mut m = zeros(n, n);
    for k in 1..=n {
        // M_k = A M_{k-1} + c_{k-1} I
        let am = matmul(a, &m);
        let c_prev = *coeffs.last().unwrap();
        let mut mk = am;
        for (i, row) in mk.iter_mut().enumerate() {
            row[i] += c_prev;
        }
        let amk = matmul(a, &mk);
        let trace: f64 = (0..n).map(|i| amk[i][i]).sum();
        coeffs.push(-trace / k as f64);
        m = mk;
    }
    coeffs
}

pub fn eigenvalues(a: &Mat) -> Vec<C64> {
    poly_roots(&char_poly(a))
}

/// Evaluates a real polynomial (descending powers) at a complex point.
pub fn poly_eval(coeffs: &[f64], x: C64) -> C64 {
    coeffs.iter().fold(C64::ZERO, |acc, c| acc * x + C64::new(*c, 0.0))
}

/// Determinant by LU with partial pivoting.
pub fn det(a: &Mat) -> f64 {
    let n = a.len();
    let mut m = a.clone();
    let mut d = 1.0;
    for c in 0..n {
        let p = (c..n).max_by(|&i, &j| m[i][c].abs().partial_cmp(&m[j][c].abs()).unwrap_or(std::cmp::Ordering::Equal)).unwrap_or(c);
        if m[p][c] == 0.0 {
            return 0.0;
        }
        if p != c {
            m.swap(c, p);
            d = -d;
        }
        d *= m[c][c];
        for r in c + 1..n {
            let f = m[r][c] / m[c][c];
            for k in c..n {
                m[r][k] -= f * m[c][k];
            }
        }
    }
    d
}

pub fn add(a: &Mat, b: &Mat, kb: f64) -> Mat {
    a.iter().zip(b).map(|(ra, rb)| ra.iter().zip(rb).map(|(x, y)| x + kb * y).collect()).collect()
}

pub fn scale(a: &Mat, k: f64) -> Mat {
    a.iter().map(|r| r.iter().map(|v| v * k).collect()).collect()
}

fn norm1(a: &Mat) -> f64 {
    let cols = a.first().map_or(0, |r| r.len());
    (0..cols).map(|j| a.iter().map(|r| r[j].abs()).sum::<f64>()).fold(0.0, f64::max)
}

/// The eigenvalues of a general real matrix: reduction to Hessenberg form
/// and the shifted QR algorithm (Numerical Recipes' elmhes + hqr).
pub fn eig_general(a: &Mat) -> Vec<C64> {
    let n = a.len();
    if n == 0 {
        return Vec::new();
    }
    let mut h = a.clone();
    // Balance (rows and columns to similar norms).
    let radix = 2.0f64;
    let mut done = false;
    while !done {
        done = true;
        for i in 0..n {
            let (mut r, mut c) = (0.0, 0.0);
            for j in 0..n {
                if j != i {
                    c += h[j][i].abs();
                    r += h[i][j].abs();
                }
            }
            if c != 0.0 && r != 0.0 {
                let (mut g, mut f, s) = (r / radix, 1.0, c + r);
                let mut cc = c;
                while cc < g {
                    f *= radix;
                    cc *= radix * radix;
                }
                g = r * radix;
                while cc > g {
                    f /= radix;
                    cc /= radix * radix;
                }
                if (cc + r / f) / f < 0.95 * s {
                    done = false;
                    for j in 0..n {
                        h[i][j] /= f;
                    }
                    for j in 0..n {
                        h[j][i] *= f;
                    }
                }
            }
        }
    }
    // Hessenberg by elimination with pivoting.
    for m in 1..n.saturating_sub(1) {
        let mut x = 0.0f64;
        let mut i = m;
        for j in m..n {
            if h[j][m - 1].abs() > x.abs() {
                x = h[j][m - 1];
                i = j;
            }
        }
        if i != m {
            h.swap(i, m);
            for row in h.iter_mut() {
                row.swap(i, m);
            }
        }
        if x != 0.0 {
            for i in m + 1..n {
                let mut y = h[i][m - 1];
                if y != 0.0 {
                    y /= x;
                    h[i][m - 1] = y;
                    for j in m..n {
                        h[i][j] -= y * h[m][j];
                    }
                    for row in h.iter_mut() {
                        row[m] += y * row[i];
                    }
                }
            }
        }
    }
    for i in 2..n {
        for j in 0..i - 1 {
            h[i][j] = 0.0;
        }
    }
    // hqr
    let mut wr = vec![0.0; n];
    let mut wi = vec![0.0; n];
    let anorm: f64 = (0..n).map(|i| (i.saturating_sub(1)..n).map(|j| h[i][j].abs()).sum::<f64>()).sum();
    let mut nn = n as isize - 1;
    let mut t = 0.0;
    let (mut p, mut q, mut r) = (0.0f64, 0.0f64, 0.0f64);
    while nn >= 0 {
        let mut its = 0;
        loop {
            let mut l = nn;
            while l >= 1 {
                let s = h[l as usize - 1][l as usize - 1].abs() + h[l as usize][l as usize].abs();
                let s = if s == 0.0 { anorm } else { s };
                if h[l as usize][l as usize - 1].abs() + s == s {
                    h[l as usize][l as usize - 1] = 0.0;
                    break;
                }
                l -= 1;
            }
            let nu = nn as usize;
            let x = h[nu][nu];
            if l == nn {
                wr[nu] = x + t;
                wi[nu] = 0.0;
                nn -= 1;
                break;
            }
            let y = h[nu - 1][nu - 1];
            let w = h[nu][nu - 1] * h[nu - 1][nu];
            if l == nn - 1 {
                p = 0.5 * (y - x);
                q = p * p + w;
                let z = q.abs().sqrt();
                let xx = x + t;
                if q >= 0.0 {
                    let z = p + if p >= 0.0 { z } else { -z };
                    wr[nu - 1] = xx + z;
                    wr[nu] = if z != 0.0 { xx - w / z } else { xx + z };
                    wi[nu - 1] = 0.0;
                    wi[nu] = 0.0;
                } else {
                    wr[nu - 1] = xx + p;
                    wr[nu] = xx + p;
                    wi[nu - 1] = -z;
                    wi[nu] = z;
                }
                nn -= 2;
                break;
            }
            if its == 60 {
                // No convergence: fall back to the characteristic polynomial.
                return poly_roots(&char_poly(a));
            }
            let (mut x, mut y, mut w) = (x, y, w);
            if its == 10 || its == 20 {
                t += x;
                for i in 0..=nu {
                    h[i][i] -= x;
                }
                let s = h[nu][nu - 1].abs() + h[nu - 1][nu - 2].abs();
                x = 0.75 * s;
                y = x;
                w = -0.4375 * s * s;
            }
            its += 1;
            let mut m = nn - 2;
            while m >= l {
                let mu = m as usize;
                let z = h[mu][mu];
                r = x - z;
                let s = y - z;
                p = (r * s - w) / h[mu + 1][mu] + h[mu][mu + 1];
                q = h[mu + 1][mu + 1] - z - r - s;
                r = h[mu + 2][mu + 1];
                let s = p.abs() + q.abs() + r.abs();
                p /= s;
                q /= s;
                r /= s;
                if m == l {
                    break;
                }
                let u = h[mu][mu - 1].abs() * (q.abs() + r.abs());
                let v = p.abs() * (h[mu - 1][mu - 1].abs() + z.abs() + h[mu + 1][mu + 1].abs());
                if u + v == v {
                    break;
                }
                m -= 1;
            }
            let mu = m as usize;
            for i in mu + 2..=nu {
                h[i][i - 2] = 0.0;
                if i != mu + 2 {
                    h[i][i - 3] = 0.0;
                }
            }
            let mut k = mu;
            while k + 1 <= nu {
                if k != mu {
                    p = h[k][k - 1];
                    q = h[k + 1][k - 1];
                    r = if k + 1 != nu { h[k + 2][k - 1] } else { 0.0 };
                    x = p.abs() + q.abs() + r.abs();
                    if x != 0.0 {
                        p /= x;
                        q /= x;
                        r /= x;
                    }
                }
                let s = (p * p + q * q + r * r).sqrt() * if p >= 0.0 { 1.0 } else { -1.0 };
                if s != 0.0 {
                    if k == mu {
                        if l != m {
                            h[k][k - 1] = -h[k][k - 1];
                        }
                    } else {
                        h[k][k - 1] = -s * x;
                    }
                    p += s;
                    x = p / s;
                    y = q / s;
                    let z = r / s;
                    q /= p;
                    r /= p;
                    for j in k..=nu {
                        let mut pp = h[k][j] + q * h[k + 1][j];
                        if k + 1 != nu {
                            pp += r * h[k + 2][j];
                            h[k + 2][j] -= pp * z;
                        }
                        h[k + 1][j] -= pp * y;
                        h[k][j] -= pp * x;
                    }
                    let mmin = if nu < k + 3 { nu } else { k + 3 };
                    for i in (l as usize)..=mmin {
                        let mut pp = x * h[i][k] + y * h[i][k + 1];
                        if k + 1 != nu {
                            pp += z * h[i][k + 2];
                            h[i][k + 2] -= pp * r;
                        }
                        h[i][k + 1] -= pp * q;
                        h[i][k] -= pp;
                    }
                }
                k += 1;
            }
            if l >= nn - 1 {
                continue;
            }
        }
    }
    let mut out: Vec<C64> = wr.iter().zip(&wi).map(|(&re, &im)| C64::new(re, if im.abs() < 1e-12 * re.abs().max(1e-300) { 0.0 } else { im })).collect();
    out.sort_by(|p, q| p.re.partial_cmp(&q.re).unwrap_or(std::cmp::Ordering::Equal).then(p.im.partial_cmp(&q.im).unwrap_or(std::cmp::Ordering::Equal)));
    out
}

/// The matrix exponential e^A (scaling and squaring with a degree-6 Padé approximant).
pub fn expm(a: &Mat) -> Mat {
    let n = a.len();
    let nrm = norm1(a);
    let s = if nrm > 0.5 { (nrm / 0.5).log2().ceil() as i32 } else { 0 };
    let a = scale(a, 0.5f64.powi(s));
    let c = [1.0, 0.5, 5.0 / 44.0, 1.0 / 66.0, 1.0 / 792.0, 1.0 / 15840.0, 1.0 / 665280.0];
    let mut x = identity(n);
    let mut nmat = identity(n);
    let mut dmat = identity(n);
    for (k, ck) in c.iter().enumerate().skip(1) {
        x = matmul(&a, &x);
        nmat = add(&nmat, &x, *ck);
        dmat = add(&dmat, &x, if k % 2 == 0 { *ck } else { -*ck });
    }
    let mut e = match inverse(&dmat) {
        Ok(inv) => matmul(&inv, &nmat),
        Err(_) => nmat,
    };
    for _ in 0..s {
        e = matmul(&e, &e);
    }
    e
}

/// The stabilising solution X of the continuous algebraic Riccati equation
/// AᵀX + XA − XBR⁻¹BᵀX + Q = 0, by the matrix sign function of the Hamiltonian.
pub fn care(a: &Mat, b: &Mat, q: &Mat, r: &Mat) -> Result<Mat, String> {
    let n = a.len();
    let rinv = inverse(r).map_err(|_| "R must be invertible".to_string())?;
    let g = matmul(&matmul(b, &rinv), &transpose(b));
    // H = [A, −G; −Q, −Aᵀ]
    let mut z = zeros(2 * n, 2 * n);
    let at = transpose(a);
    for i in 0..n {
        for j in 0..n {
            z[i][j] = a[i][j];
            z[i][j + n] = -g[i][j];
            z[i + n][j] = -q[i][j];
            z[i + n][j + n] = -at[i][j];
        }
    }
    for _ in 0..100 {
        let zi = inverse(&z).map_err(|_| "the Riccati equation has no stabilising solution (the Hamiltonian has eigenvalues on the imaginary axis: check controllability and Q)".to_string())?;
        let d = det(&z).abs().powf(1.0 / (2 * n) as f64);
        let c = if d.is_finite() && d > 0.0 { d } else { 1.0 };
        let next = add(&scale(&z, 0.5 / c), &zi, 0.5 * c);
        let diff = norm1(&add(&next, &z, -1.0));
        z = next;
        if diff <= 1e-13 * norm1(&z) {
            break;
        }
    }
    // [W12; W22 + I] X = −[W11 + I; W21]  (W = sign(H))
    let mut lhs = zeros(2 * n, n);
    let mut rhs = zeros(2 * n, n);
    for i in 0..n {
        for j in 0..n {
            lhs[i][j] = z[i][j + n];
            lhs[i + n][j] = z[i + n][j + n] + if i == j { 1.0 } else { 0.0 };
            rhs[i][j] = -(z[i][j] + if i == j { 1.0 } else { 0.0 });
            rhs[i + n][j] = -z[i + n][j];
        }
    }
    let mut x = zeros(n, n);
    for j in 0..n {
        let col: Vec<f64> = rhs.iter().map(|r| r[j]).collect();
        let (sol, _) = lstsq(&lhs, &col)?;
        for i in 0..n {
            x[i][j] = sol[i];
        }
    }
    // Symmetrise.
    for i in 0..n {
        for j in i + 1..n {
            let m = 0.5 * (x[i][j] + x[j][i]);
            x[i][j] = m;
            x[j][i] = m;
        }
    }
    Ok(x)
}

/// The stabilising solution of the discrete algebraic Riccati equation
/// X = AᵀXA − AᵀXB(R + BᵀXB)⁻¹BᵀXA + Q, by the structure-preserving doubling algorithm.
pub fn dare(a: &Mat, b: &Mat, q: &Mat, r: &Mat) -> Result<Mat, String> {
    let n = a.len();
    let rinv = inverse(r).map_err(|_| "R must be invertible".to_string())?;
    let mut ak = a.clone();
    let mut gk = matmul(&matmul(b, &rinv), &transpose(b));
    let mut hk = q.clone();
    let i = identity(n);
    for _ in 0..200 {
        let w = inverse(&add(&i, &matmul(&gk, &hk), 1.0)).map_err(|_| "the discrete Riccati equation has no stabilising solution".to_string())?;
        let akw = matmul(&ak, &w);
        let a_next = matmul(&akw, &ak);
        let g_next = add(&gk, &matmul(&matmul(&akw, &gk), &transpose(&ak)), 1.0);
        let h_next = add(&hk, &matmul(&matmul(&transpose(&ak), &hk), &matmul(&w, &ak)), 1.0);
        let diff = norm1(&add(&h_next, &hk, -1.0));
        ak = a_next;
        gk = g_next;
        hk = h_next;
        if diff <= 1e-13 * norm1(&hk).max(1e-300) {
            return Ok(hk);
        }
    }
    Err("the discrete Riccati iteration did not converge".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solves_and_fits() {
        let a = vec![vec![2.0, 1.0], vec![1.0, 3.0]];
        let x = solve(&a, &[3.0, 5.0]).unwrap();
        assert!((x[0] - 0.8).abs() < 1e-12 && (x[1] - 1.4).abs() < 1e-12);
        // y = 1 + 2x exactly.
        let rows: Mat = (0..10).map(|i| vec![1.0, i as f64]).collect();
        let b: Vec<f64> = (0..10).map(|i| 1.0 + 2.0 * i as f64).collect();
        let (p, _) = lstsq(&rows, &b).unwrap();
        assert!((p[0] - 1.0).abs() < 1e-10 && (p[1] - 2.0).abs() < 1e-10);
        assert_eq!(rank(&vec![vec![1.0, 2.0], vec![2.0, 4.0]]), 1);
    }

    #[test]
    fn eigen() {
        let (vals, vecs) = sym_eigen(&vec![vec![2.0, 1.0], vec![1.0, 2.0]]);
        assert!((vals[0] - 3.0).abs() < 1e-10 && (vals[1] - 1.0).abs() < 1e-10);
        assert!((vecs[0][0] - vecs[1][0]).abs() < 1e-10);
        let roots = poly_roots(&[1.0, -6.0, 11.0, -6.0]);
        let re: Vec<f64> = roots.iter().map(|r| r.re).collect();
        assert!((re[0] - 1.0).abs() < 1e-9 && (re[1] - 2.0).abs() < 1e-9 && (re[2] - 3.0).abs() < 1e-9, "{re:?}");
        let ev = eigenvalues(&vec![vec![0.0, 1.0], vec![-2.0, -3.0]]);
        assert!((ev[0].re + 2.0).abs() < 1e-9 && (ev[1].re + 1.0).abs() < 1e-9);
        let cplx = poly_roots(&[1.0, 0.0, 1.0]);
        assert!((cplx[0].im.abs() - 1.0).abs() < 1e-12);
    }

    #[test]
    fn general_eigen_expm_riccati() {
        let a = vec![vec![1.0, 2.0, 3.0], vec![4.0, 5.0, 6.0], vec![7.0, 8.0, 10.0]];
        let ev = eig_general(&a);
        let tr: f64 = ev.iter().map(|e| e.re).sum();
        assert!((tr - 16.0).abs() < 1e-9, "{ev:?}");
        let prod = ev.iter().fold(C64::ONE, |p, e| p * *e);
        assert!((prod.re - det(&a)).abs() < 1e-8 && (det(&a) + 3.0).abs() < 1e-9);
        let rot = eig_general(&vec![vec![0.0, -2.0], vec![2.0, 0.0]]);
        assert!(rot[0].re.abs() < 1e-12 && (rot[0].im.abs() - 2.0).abs() < 1e-12);
        let e = expm(&vec![vec![0.0, 1.0], vec![-1.0, 0.0]]);
        assert!((e[0][0] - 1f64.cos()).abs() < 1e-12 && (e[0][1] - 1f64.sin()).abs() < 1e-12);
        // Double integrator, Q = I, R = 1: K = [1, √3].
        let x = care(&vec![vec![0.0, 1.0], vec![0.0, 0.0]], &vec![vec![0.0], vec![1.0]], &identity(2), &vec![vec![1.0]]).unwrap();
        assert!((x[0][1] - 1.0).abs() < 1e-9 && (x[1][1] - 3f64.sqrt()).abs() < 1e-9, "{x:?}");
        // Scalar DARE x = a²x − a²x²/(r + x) + q with a = 2, q = r = 1: x = 2 + √5... (x² − 4x − 1 = 0).
        let xd = dare(&vec![vec![2.0]], &vec![vec![1.0]], &vec![vec![1.0]], &vec![vec![1.0]]).unwrap();
        assert!((xd[0][0] - (2.0 + 5f64.sqrt())).abs() < 1e-9, "{xd:?}");
    }
}
