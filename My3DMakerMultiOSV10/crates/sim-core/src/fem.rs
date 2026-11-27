//! Finite element building blocks for 4- and 10-node tetrahedra: shape functions, quadrature,
//! elasticity (stiffness, mass, thermal and body loads, stress recovery, geometric stiffness)
//! and scalar fields (conduction, capacity).

use crate::dense::inv3;
use crate::geom::V3;

/// Quadrature point in barycentric coordinates with its weight (reference volume 1/6).
pub struct Qp {
    pub l: [f64; 4],
    pub w: f64,
}

pub fn rule(degree: u8) -> Vec<Qp> {
    match degree {
        0 | 1 => vec![Qp { l: [0.25; 4], w: 1.0 / 6.0 }],
        2 => {
            let (a, b) = (0.585_410_196_624_968_5, 0.138_196_601_125_010_5);
            (0..4).map(|i| { let mut l = [b; 4]; l[i] = a; Qp { l, w: 1.0 / 24.0 } }).collect()
        }
        _ => {
            // Keast, 11 points, degree 4.
            let mut q = vec![Qp { l: [0.25; 4], w: -74.0 / 5625.0 }];
            let (a, b) = (0.785_714_285_714_285_7, 0.071_428_571_428_571_43);
            for i in 0..4 { let mut l = [b; 4]; l[i] = a; q.push(Qp { l, w: 343.0 / 45000.0 }); }
            let (c, d) = (0.399_403_576_166_799_2, 0.100_596_423_833_200_8);
            for (i, j) in [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)] {
                let mut l = [d; 4];
                l[i] = c;
                l[j] = c;
                q.push(Qp { l, w: 56.0 / 2250.0 });
            }
            q
        }
    }
}

/// Shape functions and derivatives with respect to the barycentric coordinates.
fn shape(n: usize, l: &[f64; 4]) -> (Vec<f64>, Vec<[f64; 4]>) {
    if n == 4 {
        let mut d = vec![[0.0; 4]; 4];
        for i in 0..4 { d[i][i] = 1.0; }
        return (l.to_vec(), d);
    }
    let mut nv = vec![0.0; 10];
    let mut d = vec![[0.0; 4]; 10];
    for i in 0..4 {
        nv[i] = l[i] * (2.0 * l[i] - 1.0);
        d[i][i] = 4.0 * l[i] - 1.0;
    }
    for (s, &(i, j)) in crate::mesh::TET10_EDGES.iter().enumerate() {
        nv[4 + s] = 4.0 * l[i] * l[j];
        d[4 + s][i] = 4.0 * l[j];
        d[4 + s][j] = 4.0 * l[i];
    }
    (nv, d)
}

/// One integration point of an element in physical space.
pub struct Gp {
    /// weight × |J|
    pub w: f64,
    pub n: Vec<f64>,
    pub dn: Vec<V3>,
}

/// Integration points of an element (`x`: its node coordinates).
pub fn points(x: &[V3], degree: u8) -> Result<Vec<Gp>, String> {
    rule(degree).iter().map(|q| point(x, &q.l, q.w)).collect()
}

pub fn point(x: &[V3], l: &[f64; 4], w: f64) -> Result<Gp, String> {
    let nn = x.len();
    let (nv, dl) = shape(nn, l);
    // d/dξ_r = d/dL_{r+1} − d/dL_0
    let dxi: Vec<[f64; 3]> = dl.iter().map(|d| [d[1] - d[0], d[2] - d[0], d[3] - d[0]]).collect();
    let mut j = [[0.0; 3]; 3];
    for a in 0..nn { for r in 0..3 { for c in 0..3 { j[r][c] += dxi[a][r] * x[a][c]; } } }
    let (ji, det) = inv3(&j).ok_or_else(|| "mesh.degenerate".to_string())?;
    if det <= 0.0 { return Err("mesh.inverted".into()); }
    let dn = dxi.iter().map(|g| [ji[0][0] * g[0] + ji[0][1] * g[1] + ji[0][2] * g[2], ji[1][0] * g[0] + ji[1][1] * g[1] + ji[1][2] * g[2], ji[2][0] * g[0] + ji[2][1] * g[1] + ji[2][2] * g[2]]).collect();
    Ok(Gp { w: w * det, n: nv, dn })
}

/// Barycentric coordinates of the element's nodes (corners, then mid-sides).
pub fn node_coords(n: usize) -> Vec<[f64; 4]> {
    let mut v = vec![[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]];
    if n == 10 {
        for &(i, j) in crate::mesh::TET10_EDGES.iter() { let mut l = [0.0; 4]; l[i] = 0.5; l[j] = 0.5; v.push(l); }
    }
    v
}

pub fn stiffness_degree(n: usize) -> u8 { if n == 4 { 1 } else { 2 } }
pub fn mass_degree(n: usize) -> u8 { if n == 4 { 2 } else { 4 } }

// ───────────────────────── elasticity

/// Isotropic elasticity matrix (Voigt: xx, yy, zz, xy, yz, zx; engineering shear).
pub fn d_iso(e: f64, nu: f64) -> [[f64; 6]; 6] {
    let c = e / ((1.0 + nu) * (1.0 - 2.0 * nu));
    let mut d = [[0.0; 6]; 6];
    for i in 0..3 { for j in 0..3 { d[i][j] = c * if i == j { 1.0 - nu } else { nu }; } }
    for i in 3..6 { d[i][i] = c * (1.0 - 2.0 * nu) / 2.0; }
    d
}

/// Strain (Voigt) from nodal displacements at a point.
pub fn strain(gp_dn: &[V3], u: &[f64]) -> [f64; 6] {
    let mut g = [[0.0; 3]; 3];
    for (a, d) in gp_dn.iter().enumerate() { for i in 0..3 { for j in 0..3 { g[i][j] += u[3 * a + i] * d[j]; } } }
    [g[0][0], g[1][1], g[2][2], g[0][1] + g[1][0], g[1][2] + g[2][1], g[2][0] + g[0][2]]
}

/// Bᵀ·s for a Voigt stress s: the internal force contribution per node (3 per node).
pub fn bt_s(dn: &[V3], s: &[f64; 6], w: f64, out: &mut [f64]) {
    for (a, d) in dn.iter().enumerate() {
        out[3 * a] += w * (d[0] * s[0] + d[1] * s[3] + d[2] * s[5]);
        out[3 * a + 1] += w * (d[1] * s[1] + d[0] * s[3] + d[2] * s[4]);
        out[3 * a + 2] += w * (d[2] * s[2] + d[1] * s[4] + d[0] * s[5]);
    }
}

pub fn mat6_vec(d: &[[f64; 6]; 6], e: &[f64; 6]) -> [f64; 6] {
    let mut s = [0.0; 6];
    for i in 0..6 { for j in 0..6 { s[i] += d[i][j] * e[j]; } }
    s
}

/// Element stiffness (3n × 3n, row-major) for an elasticity matrix `d`.
pub fn stiffness(gps: &[Gp], d: &[[f64; 6]; 6]) -> Vec<f64> {
    let n = gps[0].dn.len();
    let m = 3 * n;
    let mut k = vec![0.0; m * m];
    for gp in gps {
        // B columns per node a: rows of Voigt.
        let b = |a: usize| -> [[f64; 3]; 6] {
            let d = gp.dn[a];
            [[d[0], 0.0, 0.0], [0.0, d[1], 0.0], [0.0, 0.0, d[2]], [d[1], d[0], 0.0], [0.0, d[2], d[1]], [d[2], 0.0, d[0]]]
        };
        let bs: Vec<[[f64; 3]; 6]> = (0..n).map(b).collect();
        // DB per node
        let db: Vec<[[f64; 3]; 6]> = bs.iter().map(|bb| {
            let mut r = [[0.0; 3]; 6];
            for i in 0..6 { for c in 0..3 { for j in 0..6 { r[i][c] += d[i][j] * bb[j][c]; } } }
            r
        }).collect();
        for a in 0..n {
            for bn in 0..n {
                for i in 0..3 {
                    for j in 0..3 {
                        let mut s = 0.0;
                        for v in 0..6 { s += bs[a][v][i] * db[bn][v][j]; }
                        k[(3 * a + i) * m + 3 * bn + j] += gp.w * s;
                    }
                }
            }
        }
    }
    k
}

/// Consistent scalar matrix Σ c·N Nᵀ (n × n).
pub fn scalar_mass(gps: &[Gp], c: f64) -> Vec<f64> {
    let n = gps[0].n.len();
    let mut m = vec![0.0; n * n];
    for gp in gps { for a in 0..n { for b in 0..n { m[a * n + b] += c * gp.w * gp.n[a] * gp.n[b]; } } }
    m
}

/// Scalar diffusion matrix Σ k·∇N·∇Nᵀ (n × n).
pub fn scalar_stiffness(gps: &[Gp], k: f64) -> Vec<f64> {
    let n = gps[0].n.len();
    let mut m = vec![0.0; n * n];
    for gp in gps {
        for a in 0..n {
            for b in 0..n {
                let d = gp.dn[a][0] * gp.dn[b][0] + gp.dn[a][1] * gp.dn[b][1] + gp.dn[a][2] * gp.dn[b][2];
                m[a * n + b] += k * gp.w * d;
            }
        }
    }
    m
}

/// Expands a scalar n×n matrix to 3n×3n (same block on each component).
pub fn expand3(s: &[f64], n: usize) -> Vec<f64> {
    let m = 3 * n;
    let mut k = vec![0.0; m * m];
    for a in 0..n { for b in 0..n { for i in 0..3 { k[(3 * a + i) * m + 3 * b + i] = s[a * n + b]; } } }
    k
}

/// Lumped (HRZ) diagonal of a consistent scalar mass matrix.
pub fn lump(m: &[f64], n: usize) -> Vec<f64> {
    let total: f64 = m.iter().sum();
    let diag: f64 = (0..n).map(|i| m[i * n + i]).sum();
    (0..n).map(|i| m[i * n + i] * total / diag.max(1e-300)).collect()
}

/// Geometric (stress) stiffness for the stress state `sigma` per point (3n × 3n).
pub fn geometric(gps: &[Gp], sigma: &[[f64; 6]]) -> Vec<f64> {
    let n = gps[0].dn.len();
    let m = 3 * n;
    let mut k = vec![0.0; m * m];
    for (gp, s) in gps.iter().zip(sigma.iter()) {
        let t = [[s[0], s[3], s[5]], [s[3], s[1], s[4]], [s[5], s[4], s[2]]];
        for a in 0..n {
            for b in 0..n {
                let mut g = 0.0;
                for i in 0..3 { for j in 0..3 { g += gp.dn[a][i] * t[i][j] * gp.dn[b][j]; } }
                for i in 0..3 { k[(3 * a + i) * m + 3 * b + i] += gp.w * g; }
            }
        }
    }
    k
}

/// von Mises equivalent of a Voigt stress.
pub fn von_mises(s: &[f64; 6]) -> f64 {
    (0.5 * ((s[0] - s[1]).powi(2) + (s[1] - s[2]).powi(2) + (s[2] - s[0]).powi(2)) + 3.0 * (s[3] * s[3] + s[4] * s[4] + s[5] * s[5])).sqrt()
}

/// Equivalent strain of a Voigt strain (engineering shear), with ν' = 0 (as for elastic strain).
pub fn equivalent_strain(e: &[f64; 6], nu: f64) -> f64 {
    let a = (e[0] - e[1]).powi(2) + (e[1] - e[2]).powi(2) + (e[2] - e[0]).powi(2);
    let b = 1.5 * (e[3] * e[3] + e[4] * e[4] + e[5] * e[5]);
    (0.5 * (a + b)).sqrt() / (1.0 + nu)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_tet() -> Vec<V3> { vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] }

    fn tet10(x: &[V3]) -> Vec<V3> {
        let mut v = x.to_vec();
        for &(i, j) in crate::mesh::TET10_EDGES.iter() { v.push([(x[i][0] + x[j][0]) / 2.0, (x[i][1] + x[j][1]) / 2.0, (x[i][2] + x[j][2]) / 2.0]); }
        v
    }

    #[test]
    fn rules_integrate_volume() {
        for d in [1, 2, 4] { let s: f64 = rule(d).iter().map(|q| q.w).sum(); assert!((s - 1.0 / 6.0).abs() < 1e-12); }
        let gps = points(&unit_tet(), 1).unwrap();
        assert!((gps[0].w - 1.0 / 6.0).abs() < 1e-12);
    }

    #[test]
    fn mass_sums_to_volume() {
        let x = tet10(&unit_tet());
        let gps = points(&x, 4).unwrap();
        let m = scalar_mass(&gps, 1.0);
        assert!((m.iter().sum::<f64>() - 1.0 / 6.0).abs() < 1e-12);
        // Corner–corner diagonal of a quadratic tet: 6/2520 · 6V … = V/70 for V = 1/6.
        assert!((m[0] - (1.0 / 6.0) / 70.0).abs() < 1e-12);
    }

    #[test]
    fn rigid_motion_has_no_strain_energy() {
        for nn in [4, 10] {
            let x = if nn == 4 { unit_tet() } else { tet10(&unit_tet()) };
            let gps = points(&x, stiffness_degree(nn)).unwrap();
            let k = stiffness(&gps, &d_iso(1.0, 0.3));
            let m = 3 * nn;
            // A small rotation about z: u = (−y, x, 0).
            let u: Vec<f64> = x.iter().flat_map(|p| [-p[1], p[0], 0.0]).collect();
            let f: Vec<f64> = (0..m).map(|i| (0..m).map(|j| k[i * m + j] * u[j]).sum()).collect();
            assert!(f.iter().all(|v| v.abs() < 1e-12), "{nn}: {f:?}");
        }
    }

    #[test]
    fn patch_strain_is_exact_for_quadratic() {
        let x = tet10(&unit_tet());
        let gp = point(&x, &[0.1, 0.2, 0.3, 0.4], 1.0).unwrap();
        // u = (x², 0, 0) → εxx = 2x
        let u: Vec<f64> = x.iter().flat_map(|p| [p[0] * p[0], 0.0, 0.0]).collect();
        let e = strain(&gp.dn, &u);
        let px: f64 = (0..10).map(|a| gp.n[a] * x[a][0]).sum();
        assert!((e[0] - 2.0 * px).abs() < 1e-12);
    }
}

// ───────────────────────── boundary triangles (3 or 6 nodes)

/// Integration points of a boundary triangle: (weight × area, shape values). Corners a, b, c, then
/// mid-sides ab, bc, ca for a quadratic triangle (degree 4 rule).
pub fn tri_points(x: &[V3]) -> Vec<(f64, Vec<f64>)> {
    let (a, b, c) = (x[0], x[1], x[2]);
    let n = crate::geom::cross(crate::geom::sub(b, a), crate::geom::sub(c, a));
    let area = 0.5 * crate::geom::norm(n);
    let pts: [([f64; 3], f64); 6] = [
        ([0.445_948_490_915_965, 0.445_948_490_915_965, 0.108_103_018_168_070], 0.223_381_589_678_011),
        ([0.445_948_490_915_965, 0.108_103_018_168_070, 0.445_948_490_915_965], 0.223_381_589_678_011),
        ([0.108_103_018_168_070, 0.445_948_490_915_965, 0.445_948_490_915_965], 0.223_381_589_678_011),
        ([0.091_576_213_509_771, 0.091_576_213_509_771, 0.816_847_572_980_459], 0.109_951_743_655_322),
        ([0.091_576_213_509_771, 0.816_847_572_980_459, 0.091_576_213_509_771], 0.109_951_743_655_322),
        ([0.816_847_572_980_459, 0.091_576_213_509_771, 0.091_576_213_509_771], 0.109_951_743_655_322),
    ];
    pts.iter().map(|(l, w)| {
        let nv = if x.len() == 3 { l.to_vec() } else {
            vec![l[0] * (2.0 * l[0] - 1.0), l[1] * (2.0 * l[1] - 1.0), l[2] * (2.0 * l[2] - 1.0), 4.0 * l[0] * l[1], 4.0 * l[1] * l[2], 4.0 * l[2] * l[0]]
        };
        (w * area, nv)
    }).collect()
}
