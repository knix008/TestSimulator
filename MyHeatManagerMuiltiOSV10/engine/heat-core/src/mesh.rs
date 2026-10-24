//! Uniform grid, body rasterisation and boundary-face resolution.
//!
//! Bodies are painted onto the grid by testing cell centres; later bodies
//! override earlier ones. Cells not covered take the background material or
//! are void (not simulated).

use crate::model::{Layer, Model, Shape, Target};

pub const VOID: u8 = 255;
pub const NO_BODY: u32 = u32::MAX;

#[derive(Clone, Debug)]
pub struct Grid {
    pub dim: usize,
    pub nx: usize,
    pub ny: usize,
    pub nz: usize,
    /// Cell sizes in metres (2D: dz = out-of-plane thickness).
    pub dx: f64,
    pub dy: f64,
    pub dz: f64,
}

impl Grid {
    #[inline]
    pub fn n(&self) -> usize {
        self.nx * self.ny * self.nz
    }
    #[inline]
    pub fn idx(&self, i: usize, j: usize, k: usize) -> usize {
        i + self.nx * (j + self.ny * k)
    }
    #[inline]
    pub fn ijk(&self, c: usize) -> (usize, usize, usize) {
        let i = c % self.nx;
        let r = c / self.nx;
        (i, r % self.ny, r / self.ny)
    }
    /// Cell centre (m).
    pub fn centre(&self, c: usize) -> (f64, f64, f64) {
        let (i, j, k) = self.ijk(c);
        (
            (i as f64 + 0.5) * self.dx,
            (j as f64 + 0.5) * self.dy,
            (k as f64 + 0.5) * self.dz,
        )
    }
    pub fn volume(&self) -> f64 {
        self.dx * self.dy * self.dz
    }
    /// Neighbour across direction d (0..6 = -x,+x,-y,+y,-z,+z); None = outside.
    #[inline]
    pub fn neighbour(&self, c: usize, d: usize) -> Option<usize> {
        let (i, j, k) = self.ijk(c);
        match d {
            0 => (i > 0).then(|| c - 1),
            1 => (i + 1 < self.nx).then(|| c + 1),
            2 => (j > 0).then(|| c - self.nx),
            3 => (j + 1 < self.ny).then(|| c + self.nx),
            4 => (self.dim == 3 && k > 0).then(|| c - self.nx * self.ny),
            5 => (self.dim == 3 && k + 1 < self.nz).then(|| c + self.nx * self.ny),
            _ => None,
        }
    }
    /// Face area normal to direction d.
    pub fn face_area(&self, d: usize) -> f64 {
        match d / 2 {
            0 => self.dy * self.dz,
            1 => self.dx * self.dz,
            _ => self.dx * self.dy,
        }
    }
    /// Cell size along the axis of direction d.
    pub fn h(&self, d: usize) -> f64 {
        match d / 2 {
            0 => self.dx,
            1 => self.dy,
            _ => self.dz,
        }
    }
    /// Find the cell containing a point (m); None outside.
    pub fn locate(&self, x: f64, y: f64, z: f64) -> Option<usize> {
        let w = self.dx * self.nx as f64;
        let h = self.dy * self.ny as f64;
        let d = self.dz * self.nz as f64;
        if !(x >= 0.0 && x <= w && y >= 0.0 && y <= h) {
            return None;
        }
        if self.dim == 3 && !(z >= 0.0 && z <= d) {
            return None;
        }
        let i = ((x / self.dx) as usize).min(self.nx - 1);
        let j = ((y / self.dy) as usize).min(self.ny - 1);
        let k = if self.dim == 3 { ((z / self.dz) as usize).min(self.nz - 1) } else { 0 };
        Some(self.idx(i, j, k))
    }
}

pub struct Mesh {
    pub grid: Grid,
    /// Material index per cell (VOID = not simulated).
    pub mat: Vec<u8>,
    /// Body that owns each cell (last painter), NO_BODY for background/void.
    pub owner: Vec<u32>,
    /// Cells owned by each body.
    pub body_cells: Vec<Vec<u32>>,
}

impl Mesh {
    #[inline]
    pub fn simulated(&self, c: usize) -> bool {
        self.mat[c] != VOID
    }
}

fn point_in_polygon(pts: &[(f64, f64)], x: f64, y: f64) -> bool {
    // Even–odd ray casting.
    let mut inside = false;
    let n = pts.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = pts[i];
        let (xj, yj) = pts[j];
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Rasterise the bodies onto the grid.
pub fn build(model: &Model) -> Mesh {
    let nz = if model.dim == 3 { model.nz } else { 1 };
    let grid = Grid {
        dim: model.dim,
        nx: model.nx,
        ny: model.ny,
        nz,
        dx: model.width / model.nx as f64,
        dy: model.height / model.ny as f64,
        dz: model.depth / nz as f64,
    };
    let n = grid.n();
    let bg = model.background.map(|b| b as u8).unwrap_or(VOID);
    let mut mat = vec![bg; n];
    let mut owner = vec![NO_BODY; n];
    for (bi, body) in model.bodies.iter().enumerate() {
        // Bounding box in cell indices to limit the work.
        let (x0, y0, x1, y1) = match &body.shape {
            Shape::Rect { x, y, w, h } => (*x, *y, x + w, y + h),
            Shape::Circle { cx, cy, r } => (cx - r, cy - r, cx + r, cy + r),
            Shape::Polygon(p) if !p.is_empty() => {
                let mut b = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
                for &(x, y) in p {
                    b = (b.0.min(x), b.1.min(y), b.2.max(x), b.3.max(y));
                }
                b
            }
            _ => continue,
        };
        let clampi = |v: f64, h: f64, n: usize| -> usize { ((v / h).floor().max(0.0) as usize).min(n) };
        let i0 = clampi(x0, grid.dx, grid.nx);
        let i1 = (clampi(x1, grid.dx, grid.nx) + 1).min(grid.nx);
        let j0 = clampi(y0, grid.dy, grid.ny);
        let j1 = (clampi(y1, grid.dy, grid.ny) + 1).min(grid.ny);
        let (k0, k1) = if grid.dim == 3 {
            (clampi(body.z0, grid.dz, nz), (clampi(body.z1, grid.dz, nz) + 1).min(nz))
        } else {
            (0, 1)
        };
        let eps = 1e-12;
        for k in k0..k1 {
            let zc = (k as f64 + 0.5) * grid.dz;
            if grid.dim == 3 && !(zc >= body.z0 - eps && zc <= body.z1 + eps) {
                continue;
            }
            for j in j0..j1 {
                let yc = (j as f64 + 0.5) * grid.dy;
                for i in i0..i1 {
                    let xc = (i as f64 + 0.5) * grid.dx;
                    let inside = match &body.shape {
                        Shape::Rect { x, y, w, h } => {
                            xc >= x - eps && xc <= x + w + eps && yc >= y - eps && yc <= y + h + eps
                        }
                        Shape::Circle { cx, cy, r } => {
                            (xc - cx) * (xc - cx) + (yc - cy) * (yc - cy) <= r * r * (1.0 + 1e-12)
                        }
                        Shape::Polygon(p) => p.len() >= 3 && point_in_polygon(p, xc, yc),
                    };
                    if inside {
                        let c = grid.idx(i, j, k);
                        mat[c] = body.material as u8;
                        owner[c] = bi as u32;
                    }
                }
            }
        }
    }
    let mut body_cells = vec![Vec::new(); model.bodies.len()];
    for c in 0..n {
        if owner[c] != NO_BODY {
            body_cells[owner[c] as usize].push(c as u32);
        }
    }
    Mesh { grid, mat, owner, body_cells }
}

/// What lies across a face.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Across {
    /// Domain edge.
    Outside,
    /// Void (or a cell that does not take part in the current layer).
    Void,
    /// A cell of another material.
    Other,
    /// A cell of the same material (never a boundary).
    Same,
}

/// Resolve which boundary condition (index into model.boundaries) applies to the
/// face of `cell` in direction `d`, for one layer. Priority body > edge > exterior;
/// equal priority → the later boundary in the list wins.
///
/// `z_faces_2d`: in 2D the ±z directions are the out-of-plane faces; only explicit
/// front/back edge targets apply to them.
pub fn resolve(model: &Model, mesh: &Mesh, layer: Layer, cell: usize, d: usize, across: Across) -> Option<usize> {
    if across == Across::Same {
        return None;
    }
    let g = &mesh.grid;
    let out_of_plane = g.dim == 2 && d >= 4;
    let owner = mesh.owner[cell];
    // Face centre (m) for `region` tests.
    let (mut fx, mut fy, _) = g.centre(cell);
    match d {
        0 => fx -= 0.5 * g.dx,
        1 => fx += 0.5 * g.dx,
        2 => fy -= 0.5 * g.dy,
        3 => fy += 0.5 * g.dy,
        _ => {}
    }
    let mut best: Option<(u8, usize)> = None;
    for (bi, bc) in model.boundaries.iter().enumerate() {
        if !bc.btype.in_layer(layer) {
            continue;
        }
        if let Some((x0, y0, x1, y1)) = bc.region {
            let e = 1e-9;
            if !(fx >= x0 - e && fx <= x1 + e && fy >= y0 - e && fy <= y1 + e) {
                continue;
            }
        }
        let prio = match &bc.target {
            Target::Body(b) => {
                if out_of_plane || owner != *b as u32 {
                    continue;
                }
                3
            }
            Target::Edge(e) => {
                if across != Across::Outside || e.dir() != d {
                    continue;
                }
                if let Some((r0, r1)) = bc.range {
                    let (cx, cy, _) = g.centre(cell);
                    let s = match d {
                        0 | 1 => cy,
                        2 | 3 => cx,
                        _ => f64::NAN,
                    };
                    if s.is_finite() && !(s >= r0 - 1e-12 && s <= r1 + 1e-12) {
                        continue;
                    }
                }
                2
            }
            Target::Exterior => {
                if out_of_plane || across == Across::Other {
                    continue;
                }
                1
            }
        };
        if best.map_or(true, |(p, _)| prio >= p) {
            best = Some((prio, bi));
        }
    }
    best.map(|b| b.1)
}
