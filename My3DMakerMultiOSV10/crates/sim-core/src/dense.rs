//! Small dense linear algebra: symmetric eigenvalues (cyclic Jacobi), Cholesky, LU solves,
//! least squares — for element matrices, Rayleigh–Ritz steps and response-surface fits.

/// Row-major n×n symmetric matrix → (eigenvalues ascending, eigenvectors as columns, row-major).
pub fn sym_eigen(a: &[f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    let mut m = a.to_vec();
    let mut v = vec![0.0; n * n];
    for i in 0..n { v[i * n + i] = 1.0; }
    let scale: f64 = m.iter().map(|x| x * x).sum::<f64>().sqrt().max(1e-300);
    for _sweep in 0..100 {
        let mut off = 0.0;
        for i in 0..n { for j in i + 1..n { off += m[i * n + j] * m[i * n + j]; } }
        if off.sqrt() < 1e-15 * scale { break; }
        for p in 0..n {
            for q in p + 1..n {
                let apq = m[p * n + q];
                if apq.abs() < 1e-300 { continue; }
                let app = m[p * n + p];
                let aqq = m[q * n + q];
                let theta = (aqq - app) / (2.0 * apq);
                let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
                let t = if theta == 0.0 { 1.0 } else { t };
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..n {
                    let mkp = m[k * n + p];
                    let mkq = m[k * n + q];
                    m[k * n + p] = c * mkp - s * mkq;
                    m[k * n + q] = s * mkp + c * mkq;
                }
                for k in 0..n {
                    let mpk = m[p * n + k];
                    let mqk = m[q * n + k];
                    m[p * n + k] = c * mpk - s * mqk;
                    m[q * n + k] = s * mpk + c * mqk;
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
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| m[a * n + a].partial_cmp(&m[b * n + b]).unwrap_or(std::cmp::Ordering::Equal));
    let vals: Vec<f64> = order.iter().map(|&i| m[i * n + i]).collect();
    let mut vecs = vec![0.0; n * n];
    for (c, &i) in order.iter().enumerate() {
        for r in 0..n { vecs[r * n + c] = v[r * n + i]; }
    }
    (vals, vecs)
}

/// Solves a·x = b (n×n, row-major) by Gaussian elimination with partial pivoting.
pub fn solve(a: &[f64], b: &[f64], n: usize) -> Option<Vec<f64>> {
    let mut m = a.to_vec();
    let mut x = b.to_vec();
    for c in 0..n {
        let mut p = c;
        for r in c + 1..n { if m[r * n + c].abs() > m[p * n + c].abs() { p = r; } }
        if m[p * n + c].abs() < 1e-300 { return None; }
        if p != c {
            for k in 0..n { m.swap(c * n + k, p * n + k); }
            x.swap(c, p);
        }
        for r in c + 1..n {
            let f = m[r * n + c] / m[c * n + c];
            if f == 0.0 { continue; }
            for k in c..n { m[r * n + k] -= f * m[c * n + k]; }
            x[r] -= f * x[c];
        }
    }
    for c in (0..n).rev() {
        let mut s = x[c];
        for k in c + 1..n { s -= m[c * n + k] * x[k]; }
        x[c] = s / m[c * n + c];
    }
    Some(x)
}

pub fn inv3(m: &[[f64; 3]; 3]) -> Option<([[f64; 3]; 3], f64)> {
    let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    if det.abs() < 1e-300 { return None; }
    let d = 1.0 / det;
    Some(([
        [(m[1][1] * m[2][2] - m[1][2] * m[2][1]) * d, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * d, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * d],
        [(m[1][2] * m[2][0] - m[1][0] * m[2][2]) * d, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * d, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * d],
        [(m[1][0] * m[2][1] - m[1][1] * m[2][0]) * d, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * d, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * d],
    ], det))
}

/// Least squares: rows of `x` (m×p) against `y` → coefficients (p), with a tiny ridge for safety.
pub fn lstsq(x: &[Vec<f64>], y: &[f64]) -> Option<Vec<f64>> {
    let p = x.first()?.len();
    let mut a = vec![0.0; p * p];
    let mut b = vec![0.0; p];
    for (row, &yv) in x.iter().zip(y.iter()) {
        for i in 0..p {
            b[i] += row[i] * yv;
            for j in 0..p { a[i * p + j] += row[i] * row[j]; }
        }
    }
    let tr: f64 = (0..p).map(|i| a[i * p + i]).sum::<f64>() / p as f64;
    for i in 0..p { a[i * p + i] += 1e-10 * tr.max(1e-300); }
    solve(&a, &b, p)
}

/// Eigenvalues of a symmetric 3×3 (stress tensor): descending.
pub fn principal3(s: [f64; 6]) -> [f64; 3] {
    // s = [xx, yy, zz, xy, yz, zx]
    let a = [s[0], s[3], s[5], s[3], s[1], s[4], s[5], s[4], s[2]];
    let (v, _) = sym_eigen(&a, 3);
    [v[2], v[1], v[0]]
}

/// Polar decomposition F = R U (Higham's iteration).
pub fn polar(f: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let mut r = f;
    for _ in 0..30 {
        let Some((inv, _)) = inv3(&r) else { return identity3() };
        let mut next = [[0.0; 3]; 3];
        let mut diff = 0.0;
        for i in 0..3 {
            for j in 0..3 {
                next[i][j] = 0.5 * (r[i][j] + inv[j][i]);
                diff += (next[i][j] - r[i][j]).abs();
            }
        }
        r = next;
        if diff < 1e-12 { break; }
    }
    r
}

pub fn identity3() -> [[f64; 3]; 3] { [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jacobi_eigen_of_known_matrix() {
        let a = [2.0, 1.0, 0.0, 1.0, 2.0, 0.0, 0.0, 0.0, 5.0];
        let (v, _) = sym_eigen(&a, 3);
        assert!((v[0] - 1.0).abs() < 1e-12 && (v[1] - 3.0).abs() < 1e-12 && (v[2] - 5.0).abs() < 1e-12);
    }

    #[test]
    fn solve_and_lstsq() {
        let a = [4.0, 1.0, 1.0, 3.0];
        let x = solve(&a, &[1.0, 2.0], 2).unwrap();
        assert!((4.0 * x[0] + x[1] - 1.0).abs() < 1e-12);
        let rows: Vec<Vec<f64>> = (0..10).map(|i| vec![1.0, i as f64]).collect();
        let y: Vec<f64> = (0..10).map(|i| 3.0 + 2.0 * i as f64).collect();
        let c = lstsq(&rows, &y).unwrap();
        assert!((c[0] - 3.0).abs() < 1e-6 && (c[1] - 2.0).abs() < 1e-6);
    }

    #[test]
    fn polar_recovers_rotation() {
        let (c, s) = (0.6f64, 0.8f64);
        let r = [[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]];
        let u = [[1.2, 0.1, 0.0], [0.1, 0.9, 0.0], [0.0, 0.0, 1.1]];
        let mut f = [[0.0; 3]; 3];
        for i in 0..3 { for j in 0..3 { f[i][j] = (0..3).map(|k| r[i][k] * u[k][j]).sum(); } }
        let rr = polar(f);
        for i in 0..3 { for j in 0..3 { assert!((rr[i][j] - r[i][j]).abs() < 1e-9); } }
    }
}
