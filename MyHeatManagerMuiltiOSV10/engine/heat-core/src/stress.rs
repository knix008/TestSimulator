//! Linear thermoelastic stress (FEM) on the structural cells.
//!
//! Nodes sit at cell corners; every solid/pcm/porous cell is a bilinear quad
//! (2D, plane stress or plane strain) or a trilinear hexahedron (3D). The grid
//! is uniform, so the element stiffness and thermal load vector are computed
//! once per material. The system K·u = f_th is solved matrix-free (gather over
//! nodes, parallel when the `parallel` feature is on) with Jacobi-PCG.

use crate::conduction::Thermal;
use crate::linalg::{self, Csr, Ic0, Jacobi, Tol};
use crate::mesh::{Across, Mesh};
use crate::model::{BType, Layer, Model};
use crate::{mesh, Ctx, Error};

pub struct StressOut {
    pub dim: usize,
    pub disp: [Vec<f32>; 3],
    pub sxx: Vec<f32>,
    pub syy: Vec<f32>,
    pub szz: Option<Vec<f32>>,
    pub sxy: Vec<f32>,
    pub von_mises: Vec<f32>,
    pub max_vm: f64,
    pub areas: Vec<f64>,
}

/// Natural coordinates of the element nodes.
const Q4: [(f64, f64); 4] = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)];
const H8: [(f64, f64, f64); 8] = [
    (-1.0, -1.0, -1.0),
    (1.0, -1.0, -1.0),
    (1.0, 1.0, -1.0),
    (-1.0, 1.0, -1.0),
    (-1.0, -1.0, 1.0),
    (1.0, -1.0, 1.0),
    (1.0, 1.0, 1.0),
    (-1.0, 1.0, 1.0),
];

/// Per-material element data.
struct ElemData {
    ke: Vec<f64>, // ndof_e × ndof_e row-major
    g: Vec<f64>,  // thermal load per unit (α_eff·ΔT)
    d: Vec<f64>,  // constitutive matrix (3×3 or 6×6)
    alpha_eff: f64,
    e: f64,
    nu: f64,
    alpha: f64,
}

fn dmat(dim: usize, e: f64, nu: f64, plane_strain: bool) -> Vec<f64> {
    if dim == 2 {
        if plane_strain {
            let c = e / ((1.0 + nu) * (1.0 - 2.0 * nu));
            vec![c * (1.0 - nu), c * nu, 0.0, c * nu, c * (1.0 - nu), 0.0, 0.0, 0.0, c * (1.0 - 2.0 * nu) / 2.0]
        } else {
            let c = e / (1.0 - nu * nu);
            vec![c, c * nu, 0.0, c * nu, c, 0.0, 0.0, 0.0, c * (1.0 - nu) / 2.0]
        }
    } else {
        let lam = e * nu / ((1.0 + nu) * (1.0 - 2.0 * nu));
        let mu = e / (2.0 * (1.0 + nu));
        let mut d = vec![0.0; 36];
        for i in 0..3 {
            for j in 0..3 {
                d[i * 6 + j] = lam;
            }
            d[i * 6 + i] = lam + 2.0 * mu;
            d[(i + 3) * 6 + i + 3] = mu;
        }
        d
    }
}

/// Strain–displacement matrix B at a natural point (rows = strain comps).
fn bmat(dim: usize, h: [f64; 3], xi: [f64; 3]) -> Vec<f64> {
    if dim == 2 {
        let mut b = vec![0.0; 3 * 8];
        for (a, &(xa, ya)) in Q4.iter().enumerate() {
            let dndx = xa * (1.0 + ya * xi[1]) / 4.0 * 2.0 / h[0];
            let dndy = ya * (1.0 + xa * xi[0]) / 4.0 * 2.0 / h[1];
            b[2 * a] = dndx;
            b[8 + 2 * a + 1] = dndy;
            b[16 + 2 * a] = dndy;
            b[16 + 2 * a + 1] = dndx;
        }
        b
    } else {
        let mut b = vec![0.0; 6 * 24];
        for (a, &(xa, ya, za)) in H8.iter().enumerate() {
            let dx = xa * (1.0 + ya * xi[1]) * (1.0 + za * xi[2]) / 8.0 * 2.0 / h[0];
            let dy = ya * (1.0 + xa * xi[0]) * (1.0 + za * xi[2]) / 8.0 * 2.0 / h[1];
            let dz = za * (1.0 + xa * xi[0]) * (1.0 + ya * xi[1]) / 8.0 * 2.0 / h[2];
            let c = 3 * a;
            b[c] = dx;
            b[24 + c + 1] = dy;
            b[48 + c + 2] = dz;
            b[72 + c] = dy;
            b[72 + c + 1] = dx;
            b[96 + c + 1] = dz;
            b[96 + c + 2] = dy;
            b[120 + c] = dz;
            b[120 + c + 2] = dx;
        }
        b
    }
}

fn elem_data(dim: usize, h: [f64; 3], e: f64, nu: f64, alpha: f64, plane_strain: bool) -> ElemData {
    let ns = if dim == 2 { 3 } else { 6 };
    let nd = if dim == 2 { 8 } else { 24 };
    let d = dmat(dim, e, nu, plane_strain);
    let m: Vec<f64> = if dim == 2 { vec![1.0, 1.0, 0.0] } else { vec![1.0, 1.0, 1.0, 0.0, 0.0, 0.0] };
    let gp = 1.0 / 3.0f64.sqrt();
    let det = if dim == 2 { h[0] * h[1] / 4.0 } else { h[0] * h[1] * h[2] / 8.0 };
    let mut ke = vec![0.0; nd * nd];
    let mut g = vec![0.0; nd];
    let pts: Vec<[f64; 3]> = if dim == 2 {
        vec![[-gp, -gp, 0.0], [gp, -gp, 0.0], [gp, gp, 0.0], [-gp, gp, 0.0]]
    } else {
        let mut v = Vec::new();
        for &z in &[-gp, gp] {
            for &y in &[-gp, gp] {
                for &x in &[-gp, gp] {
                    v.push([x, y, z]);
                }
            }
        }
        v
    };
    let dm: Vec<f64> = (0..ns).map(|i| (0..ns).map(|j| d[i * ns + j] * m[j]).sum()).collect();
    // Selective reduced integration: normal terms with the full Gauss rule,
    // shear terms with one point at the centre (removes shear locking in
    // bending; constant-strain states are unaffected).
    let nshear0 = if dim == 2 { 2 } else { 3 };
    let mut dn = d.clone();
    let mut dsh = vec![0.0; ns * ns];
    for i in nshear0..ns {
        dsh[i * ns + i] = d[i * ns + i];
        dn[i * ns + i] = 0.0;
    }
    let npts = pts.len() as f64;
    let mut rules: Vec<([f64; 3], f64, bool)> = pts.iter().map(|&p| (p, 1.0, false)).collect();
    rules.push(([0.0; 3], npts, true));
    for (xi, wgt, shear) in rules {
        let d = if shear { &dsh } else { &dn };
        let b = bmat(dim, h, xi);
        // DB
        let mut db = vec![0.0; ns * nd];
        for i in 0..ns {
            for k in 0..ns {
                let dik = d[i * ns + k];
                if dik == 0.0 {
                    continue;
                }
                for j in 0..nd {
                    db[i * nd + j] += dik * b[k * nd + j];
                }
            }
        }
        for i in 0..nd {
            for j in 0..nd {
                let mut s = 0.0;
                for k in 0..ns {
                    s += b[k * nd + i] * db[k * nd + j];
                }
                ke[i * nd + j] += s * det * wgt;
            }
            if !shear {
                let mut s = 0.0;
                for k in 0..ns {
                    s += b[k * nd + i] * dm[k];
                }
                g[i] += s * det;
            }
        }
    }
    let alpha_eff = if dim == 2 && plane_strain { (1.0 + nu) * alpha } else { alpha };
    ElemData { ke, g, d, alpha_eff, e, nu, alpha }
}

/// Assembled-on-the-fly structural model shared by the static stress solve and
/// the modal analysis.
pub struct Structure<'a> {
    pub model: &'a Model,
    pub mesh: &'a Mesh,
    pub dim: usize,
    pub nd: usize,
    pub nen: usize,
    pub mx: usize,
    pub my: usize,
    pub mz: usize,
    pub nnode: usize,
    pub ndof: usize,
    /// Material index per cell or VOID when the cell carries no element.
    pub elem: Vec<u8>,
    pub nelem: usize,
    pub active: Vec<bool>,
    edata: Vec<Option<ElemData>>,
    pub fixed: Vec<bool>,
    pub areas: Vec<f64>,
    /// Stress-layer faces with a load: (cell, direction, boundary).
    load_faces: Vec<(usize, usize, usize)>,
    /// A support constrains each displacement component somewhere.
    pub constrained: [bool; 3],
    pub h: [f64; 3],
    pub plane_strain: bool,
}

impl<'a> Structure<'a> {
    /// Build elements and supports. Returns None (with a warning) when there is
    /// nothing to solve or the problem is too large.
    pub fn new(model: &'a Model, mesh: &'a Mesh, ctx: &mut Ctx) -> Result<Option<Structure<'a>>, Error> {
        let g = &mesh.grid;
        let dim = g.dim;
        let plane_strain = model.study.plane_strain && dim == 2;
        let (nx, ny, nz) = (g.nx, g.ny, g.nz);
        let (mx, my, mz) = (nx + 1, ny + 1, if dim == 3 { nz + 1 } else { 1 });
        let nnode = mx * my * mz;
        let nd = dim;
        let nen = if dim == 2 { 4 } else { 8 };
        let ncell = g.n();
        let elem: Vec<u8> = (0..ncell)
            .map(|c| {
                let m = mesh.mat[c];
                if m != mesh::VOID && model.materials[m as usize].kind.is_structural() {
                    m
                } else {
                    mesh::VOID
                }
            })
            .collect();
        let nelem = elem.iter().filter(|&&m| m != mesh::VOID).count();
        if nelem == 0 {
            ctx.warn("Structural analysis skipped: no solid cells");
            return Ok(None);
        }
        let h = [g.dx, g.dy, g.dz];
        let mut s = Structure {
            model,
            mesh,
            dim,
            nd,
            nen,
            mx,
            my,
            mz,
            nnode,
            ndof: nnode * nd,
            elem,
            nelem,
            active: vec![false; nnode],
            edata: (0..model.materials.len()).map(|_| None).collect(),
            fixed: vec![false; nnode * nd],
            areas: vec![0.0; model.boundaries.len()],
            load_faces: Vec::new(),
            constrained: [false; 3],
            h,
            plane_strain,
        };
        for c in 0..ncell {
            if s.elem[c] != mesh::VOID {
                for &n in &s.elem_nodes(c)[..nen] {
                    s.active[n] = true;
                }
            }
        }
        let nact = s.active.iter().filter(|&&a| a).count();
        if nact * nd > 3_000_000 {
            ctx.warn(format!("Structural analysis skipped: {} degrees of freedom exceed the limit of 3 000 000", nact * nd));
            return Ok(None);
        }
        for c in 0..ncell {
            let m = s.elem[c];
            if m != mesh::VOID && s.edata[m as usize].is_none() {
                let mm = &model.materials[m as usize];
                s.edata[m as usize] = Some(elem_data(dim, h, mm.e, mm.nu, mm.alpha, plane_strain));
            }
        }
        for n in 0..nnode {
            if !s.active[n] {
                for comp in 0..nd {
                    s.fixed[n * nd + comp] = true;
                }
            }
        }
        // Supports and loads (stress layer).
        if model.boundaries.iter().any(|b| b.btype.in_layer(Layer::Stress)) {
            let ndir = if dim == 2 { 4 } else { 6 };
            for c in 0..ncell {
                if s.elem[c] == mesh::VOID {
                    continue;
                }
                for d in 0..ndir {
                    let across = match g.neighbour(c, d) {
                        None => Across::Outside,
                        Some(n2) if s.elem[n2] == mesh::VOID => Across::Void,
                        Some(n2) if s.elem[n2] != s.elem[c] => Across::Other,
                        _ => continue,
                    };
                    let Some(bi) = mesh::resolve(model, mesh, Layer::Stress, c, d, across) else { continue };
                    s.areas[bi] += g.face_area(d);
                    let comps: &[usize] = match model.boundaries[bi].btype {
                        BType::Fixed => {
                            if dim == 2 {
                                &[0, 1]
                            } else {
                                &[0, 1, 2]
                            }
                        }
                        BType::RollerX => &[0],
                        BType::RollerY => &[1],
                        BType::Pressure | BType::Force => {
                            s.load_faces.push((c, d, bi));
                            &[]
                        }
                        _ => &[],
                    };
                    for n in s.face_nodes(c, d) {
                        for &comp in comps {
                            if comp < nd {
                                s.fixed[n * nd + comp] = true;
                                s.constrained[comp] = true;
                            }
                        }
                    }
                }
            }
        }
        Ok(Some(s))
    }

    pub fn node_xyz(&self, n: usize) -> (f64, f64, f64) {
        let i = n % self.mx;
        let j = (n / self.mx) % self.my;
        let k = n / (self.mx * self.my);
        (i as f64 * self.h[0], j as f64 * self.h[1], if self.dim == 3 { k as f64 * self.h[2] } else { 0.0 })
    }

    pub fn elem_nodes(&self, c: usize) -> [usize; 8] {
        let g = &self.mesh.grid;
        let (i, j, k) = g.ijk(c);
        let node_of = |i: usize, j: usize, k: usize| -> usize { i + self.mx * (j + self.my * k) };
        let mut out = [0usize; 8];
        if self.dim == 2 {
            out[0] = node_of(i, j, 0);
            out[1] = node_of(i + 1, j, 0);
            out[2] = node_of(i + 1, j + 1, 0);
            out[3] = node_of(i, j + 1, 0);
        } else {
            for (a, &(xa, ya, za)) in H8.iter().enumerate() {
                out[a] = node_of(i + (xa > 0.0) as usize, j + (ya > 0.0) as usize, k + (za > 0.0) as usize);
            }
        }
        out
    }

    /// Nodes of the face of cell c in direction d.
    fn face_nodes(&self, c: usize, d: usize) -> Vec<usize> {
        let nodes = self.elem_nodes(c);
        let axis = d / 2;
        let side = if d % 2 == 1 { 1.0 } else { -1.0 };
        let mut out = Vec::new();
        for a in 0..self.nen {
            let coord = if self.dim == 2 {
                let (xa, ya) = Q4[a];
                [xa, ya, 0.0][axis]
            } else {
                let (xa, ya, za) = H8[a];
                [xa, ya, za][axis]
            };
            if coord == side {
                out.push(nodes[a]);
            }
        }
        out
    }

    /// Fix the node nearest the solid centroid in every unconstrained direction;
    /// with no supports at all also stop the rotations (static solve only).
    pub fn pin_rigid(&mut self) {
        let nd = self.nd;
        if !self.constrained[..nd].iter().any(|&x| !x) {
            return;
        }
        let any_constrained = self.constrained[..nd].iter().any(|&x| x);
        let g = &self.mesh.grid;
        let (mut sx, mut sy, mut sz) = (0.0, 0.0, 0.0);
        for c in 0..g.n() {
            if self.elem[c] != mesh::VOID {
                let (x, y, z) = g.centre(c);
                sx += x;
                sy += y;
                sz += z;
            }
        }
        let ne = self.nelem as f64;
        let (cx, cy, cz) = (sx / ne, sy / ne, sz / ne);
        let mut best = usize::MAX;
        let mut bd = f64::INFINITY;
        for n in 0..self.nnode {
            if !self.active[n] {
                continue;
            }
            let (x, y, z) = self.node_xyz(n);
            let dz = if self.dim == 3 { z - cz } else { 0.0 };
            let d2 = (x - cx).powi(2) + (y - cy).powi(2) + dz * dz;
            if d2 < bd {
                bd = d2;
                best = n;
            }
        }
        let p = best;
        for comp in 0..nd {
            if !self.constrained[comp] {
                self.fixed[p * nd + comp] = true;
            }
        }
        if !any_constrained {
            let (px, py, pz) = self.node_xyz(p);
            let far = |axis: usize| -> Option<usize> {
                let mut bestn = None;
                let mut bdist = 0.0;
                for n in 0..self.nnode {
                    if !self.active[n] || n == p {
                        continue;
                    }
                    let (x, y, z) = self.node_xyz(n);
                    let (along, off) = match axis {
                        0 => ((x - px).abs(), (y - py).abs() + (z - pz).abs()),
                        _ => ((y - py).abs(), (x - px).abs() + (z - pz).abs()),
                    };
                    if off < 1e-12 && along > bdist {
                        bdist = along;
                        bestn = Some(n);
                    }
                }
                bestn
            };
            let (f0, f1) = (far(0), far(1));
            if let Some(q) = f0 {
                self.fixed[q * nd + 1] = true;
                if self.dim == 3 {
                    self.fixed[q * nd + 2] = true;
                }
            } else if let Some(q) = f1 {
                self.fixed[q * nd] = true;
            }
            if self.dim == 3 {
                if let Some(r) = f1 {
                    self.fixed[r * nd + 2] = true;
                }
            }
        }
    }

    /// Matrix-free y = K·x (fixed dofs give 0).
    pub fn apply(&self, x: &[f64], y: &mut [f64]) {
        let nd = self.nd;
        #[cfg(feature = "parallel")]
        {
            use rayon::prelude::*;
            y.par_chunks_mut(nd).enumerate().for_each(|(n, out)| self.apply_node(n, x, out));
        }
        #[cfg(not(feature = "parallel"))]
        {
            for (n, out) in y.chunks_mut(nd).enumerate() {
                self.apply_node(n, x, out);
            }
        }
        for i in 0..self.ndof {
            if self.fixed[i] {
                y[i] = 0.0;
            }
        }
    }

    fn apply_node(&self, n: usize, x: &[f64], out: &mut [f64]) {
        for v in out.iter_mut() {
            *v = 0.0;
        }
        if !self.active[n] {
            return;
        }
        let g = &self.mesh.grid;
        let (nx, ny, nz) = (g.nx, g.ny, g.nz);
        let (nd, nen) = (self.nd, self.nen);
        let ned = nen * nd;
        let i = n % self.mx;
        let j = (n / self.mx) % self.my;
        let k = n / (self.mx * self.my);
        let krange: &[usize] = if self.dim == 2 { &[0] } else { &[0, 1] };
        for &dk in krange {
            if self.dim == 3 && (k < dk || k - dk >= nz) {
                continue;
            }
            for dj in 0..2 {
                if j < dj || j - dj >= ny {
                    continue;
                }
                for di in 0..2 {
                    if i < di || i - di >= nx {
                        continue;
                    }
                    let c = g.idx(i - di, j - dj, if self.dim == 3 { k - dk } else { 0 });
                    let m = self.elem[c];
                    if m == mesh::VOID {
                        continue;
                    }
                    let ke = &self.edata[m as usize].as_ref().unwrap().ke;
                    let nodes = self.elem_nodes(c);
                    let a = nodes[..nen].iter().position(|&x| x == n).unwrap();
                    for comp in 0..nd {
                        let row = &ke[(a * nd + comp) * ned..(a * nd + comp + 1) * ned];
                        let mut s = 0.0;
                        for b in 0..nen {
                            let base = nodes[b] * nd;
                            for c2 in 0..nd {
                                s += row[b * nd + c2] * x[base + c2];
                            }
                        }
                        out[comp] += s;
                    }
                }
            }
        }
    }

    /// Diagonal of K (0 on fixed dofs).
    pub fn diag(&self) -> Vec<f64> {
        let (nd, nen) = (self.nd, self.nen);
        let ned = nen * nd;
        let mut diag = vec![0.0; self.ndof];
        for c in 0..self.mesh.grid.n() {
            let m = self.elem[c];
            if m == mesh::VOID {
                continue;
            }
            let ed = self.edata[m as usize].as_ref().unwrap();
            let nodes = self.elem_nodes(c);
            for a in 0..nen {
                for comp in 0..nd {
                    let li = a * nd + comp;
                    diag[nodes[a] * nd + comp] += ed.ke[li * ned + li];
                }
            }
        }
        for i in 0..self.ndof {
            if self.fixed[i] {
                diag[i] = 0.0;
            }
        }
        diag
    }

    /// Lumped mass per dof (kg per unit thickness in 2D).
    pub fn mass(&self) -> Vec<f64> {
        let g = &self.mesh.grid;
        let vol = if self.dim == 2 { g.dx * g.dy } else { g.dx * g.dy * g.dz };
        let mut m = vec![0.0; self.ndof];
        for c in 0..g.n() {
            let e = self.elem[c];
            if e == mesh::VOID {
                continue;
            }
            let share = self.model.materials[e as usize].rho * vol / self.nen as f64;
            for &n in &self.elem_nodes(c)[..self.nen] {
                for comp in 0..self.nd {
                    m[n * self.nd + comp] += share;
                }
            }
        }
        m
    }

    /// Load vector: thermal strain (optional), gravity (optional), pressure and
    /// force boundaries. 2D loads are per unit thickness (the model is solved
    /// for a unit-thickness slice; forces are divided by the depth).
    pub fn loads(&self, th: &Thermal, t: &[f64], thermal: bool, gravity: bool) -> Vec<f64> {
        let model = self.model;
        let g = &self.mesh.grid;
        let (nd, nen) = (self.nd, self.nen);
        let study = &model.study;
        let mut f = vec![0.0; self.ndof];
        let vol = if self.dim == 2 { g.dx * g.dy } else { g.dx * g.dy * g.dz };
        for c in 0..g.n() {
            let m = self.elem[c];
            if m == mesh::VOID {
                continue;
            }
            let ed = self.edata[m as usize].as_ref().unwrap();
            let nodes = self.elem_nodes(c);
            if thermal {
                let u = th.unk[c];
                let tc = if u == u32::MAX { study.tref } else { t[u as usize] };
                let s = ed.alpha_eff * (tc - study.tref);
                for a in 0..nen {
                    for comp in 0..nd {
                        f[nodes[a] * nd + comp] += ed.g[a * nd + comp] * s;
                    }
                }
            }
            if gravity {
                let w = model.materials[m as usize].rho * vol / nen as f64;
                for a in 0..nen {
                    for comp in 0..nd {
                        f[nodes[a] * nd + comp] += w * model.gravity[comp];
                    }
                }
            }
        }
        // Boundary loads.
        let thick = if self.dim == 2 { g.dz } else { 1.0 };
        let mut force_area = vec![0.0; model.boundaries.len()];
        for &(_, d, bi) in &self.load_faces {
            force_area[bi] += g.face_area(d);
        }
        for &(c, d, bi) in &self.load_faces {
            let b = &model.boundaries[bi];
            let area = g.face_area(d);
            let mut fv = [0.0f64; 3];
            match b.btype {
                BType::Pressure => {
                    // + pushes into the body: force along −(outward normal)
                    let sign = if d % 2 == 1 { 1.0 } else { -1.0 };
                    fv[d / 2] = -sign * b.p_load * area;
                }
                BType::Force => {
                    let share = area / force_area[bi].max(1e-300);
                    for comp in 0..3 {
                        fv[comp] = b.force[comp] * share;
                    }
                }
                _ => {}
            }
            let nodes = self.face_nodes(c, d);
            let k = nodes.len() as f64;
            for n in nodes {
                for comp in 0..nd {
                    f[n * nd + comp] += fv[comp] / thick / k;
                }
            }
        }
        for i in 0..self.ndof {
            if self.fixed[i] {
                f[i] = 0.0;
            }
        }
        f
    }

    /// Estimated nonzeros of the assembled matrix.
    fn nnz_estimate(&self) -> usize {
        let per_row = if self.dim == 2 { 18 } else { 81 };
        self.ndof * per_row
    }

    /// Assemble K (+ shift·M on the diagonal) in CSR; fixed dofs become identity
    /// rows/columns. Only used when the matrix is small enough.
    pub fn assemble(&self, mass_shift: Option<(&[f64], f64)>) -> Csr {
        let g = &self.mesh.grid;
        let (nd, nen) = (self.nd, self.nen);
        let ned = nen * nd;
        // node adjacency through elements
        let mut nbn: Vec<Vec<u32>> = vec![Vec::new(); self.nnode];
        for c in 0..g.n() {
            if self.elem[c] == mesh::VOID {
                continue;
            }
            let nodes = self.elem_nodes(c);
            for a in 0..nen {
                for b in 0..nen {
                    nbn[nodes[a]].push(nodes[b] as u32);
                }
            }
        }
        let mut nb: Vec<Vec<u32>> = vec![Vec::new(); self.ndof];
        for n in 0..self.nnode {
            let l = &mut nbn[n];
            l.sort_unstable();
            l.dedup();
            for comp in 0..nd {
                let r = n * nd + comp;
                if self.fixed[r] {
                    continue;
                }
                let row = &mut nb[r];
                for &m in l.iter() {
                    for c2 in 0..nd {
                        let cidx = m as usize * nd + c2;
                        if !self.fixed[cidx] {
                            row.push(cidx as u32);
                        }
                    }
                }
            }
        }
        let mut a = Csr::from_neighbours(self.ndof, &nb);
        drop(nb);
        for c in 0..g.n() {
            let m = self.elem[c];
            if m == mesh::VOID {
                continue;
            }
            let ke = &self.edata[m as usize].as_ref().unwrap().ke;
            let nodes = self.elem_nodes(c);
            for la in 0..nen {
                for ca in 0..nd {
                    let r = nodes[la] * nd + ca;
                    if self.fixed[r] {
                        continue;
                    }
                    let s0 = a.row_ptr[r];
                    let s1 = a.row_ptr[r + 1];
                    for lb in 0..nen {
                        for cb in 0..nd {
                            let cidx = nodes[lb] * nd + cb;
                            if self.fixed[cidx] {
                                continue;
                            }
                            let p = s0 + a.col[s0..s1].binary_search(&(cidx as u32)).unwrap();
                            a.val[p] += ke[(la * nd + ca) * ned + lb * nd + cb];
                        }
                    }
                }
            }
        }
        for r in 0..self.ndof {
            let d = a.diag[r];
            if self.fixed[r] {
                a.val[d] = 1.0;
            } else if let Some((mass, eps)) = mass_shift {
                a.val[d] += eps * mass[r];
            }
        }
        a
    }

    /// IC(0) of the assembled matrix, with growing diagonal shifts until no
    /// pivot breaks down.
    pub fn factor(a: &Csr) -> Ic0 {
        let mut shift = 0.0;
        loop {
            let ic = Ic0::with_shift(a, shift);
            if ic.breakdowns == 0 || shift > 0.5 {
                return ic;
            }
            shift = if shift == 0.0 { 1e-3 } else { shift * 4.0 };
        }
    }

    /// Whether the assembled IC(0) path is used (memory limit).
    pub fn use_assembled(&self) -> bool {
        self.nnz_estimate() <= 25_000_000
    }

    /// Solve K x = f: PCG with IC(0) on the assembled matrix when it fits,
    /// otherwise matrix-free Jacobi-PCG.
    pub fn solve_static(&self, f: &[f64], x: &mut [f64], rel: f64, ctx: &mut Ctx, label: &str) -> Result<linalg::SolveStats, Error> {
        if self.use_assembled() {
            let a = self.assemble(None);
            let ic = Self::factor(&a);
            let tol = Tol { rel, abs: 0.0, max_iter: self.model.study.max_iter.max(2000) * 4 };
            let est = (self.nnode as f64).powf(0.33) * 10.0;
            let mut mon = |it: usize, res: f64| {
                ctx.fraction = (it as f64 / est).min(0.99);
                ctx.tick(&|| format!("{label} iteration {it}, residual {res:.2e}"))
            };
            return linalg::pcg(&a, f, x, &ic, tol, &mut mon);
        }
        let diag = self.diag();
        let inv: Vec<f64> = diag.iter().map(|&d| if d > 0.0 { 1.0 / d } else { 0.0 }).collect();
        let pre = Jacobi { inv };
        let tol = Tol { rel, abs: 0.0, max_iter: self.model.study.max_iter.max(2000) * 4 };
        let mut apply = |v: &[f64], y: &mut [f64]| self.apply(v, y);
        let est = (self.nnode as f64).sqrt() * 4.0;
        let big = self.ndof > 200_000;
        let mut mon = |it: usize, res: f64| {
            ctx.fraction = (it as f64 / est).min(0.99);
            if big {
                let fr = ctx.fraction;
                ctx.report(fr, &format!("{label} iteration {it}, residual {res:.2e}"))
            } else {
                ctx.tick(&|| format!("{label} iteration {it}, residual {res:.2e}"))
            }
        };
        linalg::pcg_op(self.ndof, &mut apply, f, x, &pre, tol, &mut mon)
    }
}

pub fn solve(model: &Model, mesh: &Mesh, th: &Thermal, t: &[f64], ctx: &mut Ctx) -> Result<Option<StressOut>, Error> {
    let study = &model.study;
    let Some(mut s) = Structure::new(model, mesh, ctx)? else { return Ok(None) };
    s.pin_rigid();
    let g = &mesh.grid;
    let (dim, nd, nen) = (s.dim, s.nd, s.nen);
    let ned = nen * nd;
    let ncell = g.n();
    let thermal = study.thermal_strain;
    let f = s.loads(th, t, thermal, study.gravity_load);
    let mut ufield = vec![0.0; s.ndof];
    if f.iter().all(|&v| v == 0.0) {
        if study.modal_modes == 0 {
            ctx.warn("Structural analysis: no load (thermal strain off or uniform Tref, no pressure/force/gravity)");
        }
    } else {
        let stats = s.solve_static(&f, &mut ufield, study.tolerance.min(1e-8), ctx, "stress")?;
        ctx.log("stress", stats.iterations, stats.residual);
        if !stats.converged {
            ctx.warn(format!("Stress solver stopped at relative residual {:.2e}", stats.residual));
        }
    }
    let tcell = |c: usize| -> f64 {
        let u = th.unk[c];
        if u == u32::MAX {
            study.tref
        } else {
            t[u as usize]
        }
    };
    // Post-processing at element centres.
    let mut disp = [vec![0.0f32; ncell], vec![0.0f32; ncell], vec![0.0f32; ncell]];
    let mut sxx = vec![0.0f32; ncell];
    let mut syy = vec![0.0f32; ncell];
    let mut szz = vec![0.0f32; ncell];
    let mut sxy = vec![0.0f32; ncell];
    let mut vm = vec![0.0f32; ncell];
    let mut max_vm: f64 = 0.0;
    let b0 = bmat(dim, s.h, [0.0; 3]);
    let ns = if dim == 2 { 3 } else { 6 };
    let plane_strain = s.plane_strain;
    for c in 0..ncell {
        let m = s.elem[c];
        if m == mesh::VOID {
            continue;
        }
        let ed = s.edata[m as usize].as_ref().unwrap();
        let nodes = s.elem_nodes(c);
        let mut ue = [0.0; 24];
        for a in 0..nen {
            for comp in 0..nd {
                ue[a * nd + comp] = ufield[nodes[a] * nd + comp];
                disp[comp][c] += (ufield[nodes[a] * nd + comp] / nen as f64) as f32;
            }
        }
        let dtemp = if thermal { tcell(c) - study.tref } else { 0.0 };
        let mut eps = [0.0; 6];
        for k in 0..ns {
            let mut v = 0.0;
            for j in 0..ned {
                v += b0[k * ned + j] * ue[j];
            }
            eps[k] = v;
        }
        let th_strain = ed.alpha_eff * dtemp;
        for k in 0..dim {
            eps[k] -= th_strain;
        }
        if dim == 2 {
            let mut sig = [0.0; 3];
            for i in 0..3 {
                for j in 0..3 {
                    sig[i] += ed.d[i * 3 + j] * eps[j];
                }
            }
            let sz = if plane_strain { ed.nu * (sig[0] + sig[1]) - ed.e * ed.alpha * dtemp } else { 0.0 };
            let v = (0.5 * ((sig[0] - sig[1]).powi(2) + (sig[1] - sz).powi(2) + (sz - sig[0]).powi(2)) + 3.0 * sig[2] * sig[2]).sqrt();
            sxx[c] = sig[0] as f32;
            syy[c] = sig[1] as f32;
            szz[c] = sz as f32;
            sxy[c] = sig[2] as f32;
            vm[c] = v as f32;
            max_vm = max_vm.max(v);
        } else {
            let mut sig = [0.0; 6];
            for i in 0..6 {
                for j in 0..6 {
                    sig[i] += ed.d[i * 6 + j] * eps[j];
                }
            }
            let v = (0.5 * ((sig[0] - sig[1]).powi(2) + (sig[1] - sig[2]).powi(2) + (sig[2] - sig[0]).powi(2))
                + 3.0 * (sig[3] * sig[3] + sig[4] * sig[4] + sig[5] * sig[5]))
                .sqrt();
            sxx[c] = sig[0] as f32;
            syy[c] = sig[1] as f32;
            szz[c] = sig[2] as f32;
            sxy[c] = sig[3] as f32;
            vm[c] = v as f32;
            max_vm = max_vm.max(v);
        }
    }
    let szz = if dim == 3 || plane_strain { Some(szz) } else { None };
    let areas = s.areas.clone();
    Ok(Some(StressOut { dim, disp, sxx, syy, szz, sxy, von_mises: vm, max_vm, areas }))
}
