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
}
