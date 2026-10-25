//! Solar load (`study.solar`): direct sunlight on the exposed surfaces, with shadows.
//!
//! The sun is a direction s (unit vector towards the sun; y is up, see
//! `model::Solar`) and an irradiance G (W/m² on a surface facing the sun).
//! Exposed faces are the faces of opaque cells (simulated and not fluid) that
//! look into a transparent cell (void or fluid) or out of the domain. A face
//! with outward normal n receives α·G·(n·s)·A when n·s > 0 and the ray from
//! the face centre towards the sun leaves the domain without crossing an opaque
//! cell (α = the material's solar absorptivity). The absorbed heat is a fixed
//! source of the cell behind the face; it does not depend on temperature, so it
//! adds nothing to the nonlinear iteration. In 2D the section is infinitely long
//! in z: shadows are traced in the x-y plane, while n·s uses the full 3D s.
//! A sun at or below the horizon (s_y ≤ 0) lights nothing. Diffuse sky light and
//! reflections are not modelled.

use crate::mesh::Mesh;
use crate::model::{Kind, Model};

pub struct SolarLoad {
    /// Absorbed heat per thermal unknown (W).
    pub q: Vec<f64>,
    /// Total absorbed heat (W).
    pub absorbed: f64,
    /// Faces facing the sun that are lit / in shadow.
    pub lit: usize,
    pub shaded: usize,
}

/// The solar source of every unknown, or None when `study.solar` is off.
pub fn solar_load(model: &Model, mesh: &Mesh, unk: &[u32], n: usize) -> Option<SolarLoad> {
    let sun = model.study.solar.as_ref()?;
    let g = &mesh.grid;
    let nc = g.n();
    let n_unknowns = n;
    // The sun below the horizon (y is up) lights nothing.
    if sun.dir[1] <= 0.0 || sun.irradiance <= 0.0 {
        return Some(SolarLoad { q: vec![0.0; n_unknowns], absorbed: 0.0, lit: 0, shaded: 0 });
    }
    let dim3 = g.dim == 3;
    let transparent: Vec<bool> = (0..nc)
        .map(|c| !mesh.simulated(c) || model.materials[mesh.mat[c] as usize].kind == Kind::Fluid)
        .collect();
    let h = [g.dx, g.dy, g.dz];
    let ext = [g.nx as f64 * g.dx, g.ny as f64 * g.dy, if dim3 { g.nz as f64 * g.dz } else { g.dz }];
    let s = sun.dir;
    // Shadow rays march in the plane of a 2D model; normalise that direction for the step length.
    let ray = if dim3 { s } else { [s[0], s[1], 0.0] };
    let rlen = (ray[0] * ray[0] + ray[1] * ray[1] + ray[2] * ray[2]).sqrt();
    let step = 0.25 * if dim3 { g.dx.min(g.dy).min(g.dz) } else { g.dx.min(g.dy) };
    let cell_at = |p: [f64; 3]| -> Option<usize> {
        let mut ijk = [0usize; 3];
        for a in 0..if dim3 { 3 } else { 2 } {
            if p[a] < 0.0 || p[a] >= ext[a] {
                return None;
            }
            ijk[a] = ((p[a] / h[a]) as usize).min([g.nx, g.ny, g.nz][a] - 1);
        }
        Some(g.idx(ijk[0], ijk[1], ijk[2]))
    };
    let mut q = vec![0.0; n];
    let (mut absorbed, mut lit, mut shaded) = (0.0, 0usize, 0usize);
    let ndir = if dim3 { 6 } else { 4 };
    for c in 0..nc {
        if transparent[c] {
            continue;
        }
        let alpha = model.materials[mesh.mat[c] as usize].absorptivity.clamp(0.0, 1.0);
        if alpha == 0.0 {
            continue;
        }
        let (i, j, k) = g.ijk(c);
        for d in 0..ndir {
            let a = d / 2;
            let sign = if d % 2 == 1 { 1.0 } else { -1.0 };
            let cos = sign * s[a];
            if cos <= 1e-12 {
                continue;
            }
            if let Some(nb) = g.neighbour(c, d) {
                if !transparent[nb] {
                    continue;
                }
            }
            // Face centre, then march towards the sun until the ray leaves the domain or meets an opaque cell.
            let mut p = [(i as f64 + 0.5) * h[0], (j as f64 + 0.5) * h[1], if dim3 { (k as f64 + 0.5) * h[2] } else { 0.5 * h[2] }];
            p[a] += sign * 0.5 * h[a];
            let mut t = 1e-6 * step;
            let mut blocked = false;
            if rlen > 1e-12 {
                loop {
                    t += step;
                    let pt = [p[0] + ray[0] / rlen * t, p[1] + ray[1] / rlen * t, p[2] + ray[2] / rlen * t];
                    match cell_at(pt) {
                        None => break,
                        // A grazing ray can start inside its own cell: that does not shade the face.
                        Some(cell) if cell == c || transparent[cell] => {}
                        Some(_) => {
                            blocked = true;
                            break;
                        }
                    }
                }
            }
            if blocked {
                shaded += 1;
                continue;
            }
            lit += 1;
            let w = alpha * sun.irradiance * cos * g.face_area(d);
            q[unk[c] as usize] += w;
            absorbed += w;
        }
    }
    Some(SolarLoad { q, absorbed, lit, shaded })
}
