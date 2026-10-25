//! Incompressible flow on a staggered (MAC) grid, 2D and 3D, and conjugate heat
//! transfer.
//!
//! * Velocities u on x-faces, v on y-faces, w on z-faces (3D), pressure in cells.
//!   One code path serves both dimensions: a 2D model is a single layer
//!   (nz = 1) without z-faces, z-derivatives or front/back flow boundaries.
//! * Incremental projection: the predictor uses the old pressure gradient,
//!   explicit hybrid (central/upwind by cell Péclet number) advection, explicit
//!   viscous terms and an implicit Darcy–Brinkman drag μ/K·u; a pressure
//!   correction δp from a Poisson equation (5-point in 2D, 7-point in 3D, PCG +
//!   MIC(0)) makes the field divergence free. The time step is limited by CFL
//!   and viscous stability.
//! * Faces between flowing cells and solids/void, and domain faces with no flow
//!   boundary, are no-slip walls (ghost velocity −u for the tangential part).
//! * Natural convection: Boussinesq force −β(T − Tref)·g per unit mass along
//!   the model's gravity vector (x, y and, in 3D, z).
//! * Energy: implicit upwind convection–diffusion over all simulated cells
//!   (conjugate), assembled by `conduction::Thermal::assemble` with `Adv` terms.

use crate::conduction::{Adv, AdvB, FlowOut, SolverCache, Solution, Thermal};
use crate::linalg::{Csr, Monitor, SolveStats, Stencil5, Stencil7, Tol};
use crate::mesh::Across;
use crate::model::{BType, Layer};
use crate::{mesh, Ctx, Error};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum FBc {
    Wall,
    Slip,
    Inlet(f64, f64), // velocity into the domain, Tin
    Outlet,
    Open,
}

/// Coarse edge classification used by the turbulence model.
pub(crate) enum FBcKind {
    Wall,
    Slip,
    Inlet,
    Outflow,
}

impl FBc {
    /// Zero shear for the tangential velocity.
    pub(crate) fn free(self) -> bool {
        matches!(self, FBc::Slip | FBc::Outlet | FBc::Open)
    }
}

/// Pseudo-time step of the implicit steady march, in units of the explicit
/// stability limit (CFL 0.5 / viscous limit).
const IMPLICIT_CFL: f64 = 20.0;
/// Pseudo heat capacity of the steady natural-convection march, as a fraction
/// of the fluid ρcp (faster thermal settling; the steady result is unaffected).
const PSEUDO_CAP: f64 = 0.3;

/// Result of one flow step.
#[derive(Clone, Copy, Debug, Default)]
pub struct StepInfo {
    /// Largest velocity change and largest velocity (m/s).
    pub dmax: f64,
    pub umax: f64,
    /// RMS divergence of the predicted velocity (1/s) before the projection.
    pub continuity: f64,
    /// RMS velocity change rates (m/s²) of u, v and w (w = 0 in 2D).
    pub u_res: f64,
    pub v_res: f64,
    pub w_res: f64,
}

pub(crate) const FIXED: u8 = 0;
pub(crate) const ACTIVE: u8 = 1;
pub(crate) const OUTLET: u8 = 2;

/// Pressure-correction preconditioned operator (structured).
pub(crate) enum PStencil {
    S5(Stencil5),
    S7(Stencil7),
}

impl PStencil {
    fn pcg(&self, b: &[f64], x: &mut [f64], tol: Tol, monitor: &mut Monitor) -> Result<SolveStats, Error> {
        match self {
            PStencil::S5(s) => s.pcg(b, x, tol, monitor),
            PStencil::S7(s) => s.pcg(b, x, tol, monitor),
        }
    }
}

/// Fan inside the domain: a pressure jump across a plane of faces of one
/// velocity component, following the fan curve at the measured flow.
#[derive(Clone, Debug)]
pub(crate) struct IFan {
    /// Model boundary index.
    pub bi: usize,
    /// Axis of the pushed flow and its sign (+1 / −1).
    pub axis: usize,
    pub sign: f64,
    /// Faces (indices into the component's face array) of the fan plane.
    pub faces: Vec<usize>,
    /// Plane area (m²; 2D: times the depth).
    pub area: f64,
    /// Current flow through the plane (m³/s, + along the fan direction) and
    /// pressure jump (Pa).
    pub q: f64,
    pub dp: f64,
}

/// Δp of a (non-increasing) fan curve at flow q, linear and clamped.
fn curve_dp(curve: &[(f64, f64)], q: f64) -> f64 {
    if q <= curve[0].0 {
        return curve[0].1;
    }
    for w in curve.windows(2) {
        let ((q0, p0), (q1, p1)) = (w[0], w[1]);
        if q <= q1 {
            return if q1 > q0 { p0 + (p1 - p0) * (q - q0) / (q1 - q0) } else { p1 };
        }
    }
    curve[curve.len() - 1].1
}

/// Tangential neighbourhood of a velocity face along one axis b.
struct Tang {
    /// Neighbour face on the + / − side exists (both cells flowing).
    pin: bool,
    min: bool,
    /// On the domain edge with a zero-shear condition on both cells.
    pfree: bool,
    mfree: bool,
    /// Transverse velocity (component b) averaged over the + / − side faces.
    vp: f64,
    vm: f64,
}

pub struct FlowSolver<'a> {
    pub(crate) th: &'a Thermal<'a>,
    pub(crate) nx: usize,
    pub(crate) ny: usize,
    pub(crate) nz: usize,
    /// 3D model (z-faces, w velocity, front/back boundaries).
    pub(crate) d3: bool,
    pub(crate) n3: [usize; 3],
    /// Cell sizes (m); in 2D h[2] is the out-of-plane depth.
    pub(crate) h: [f64; 3],
    /// Cell index strides along x, y, z.
    pub(crate) cs: [usize; 3],
    /// Face-array dimensions and strides of each velocity component.
    pub(crate) fdim: [[usize; 3]; 3],
    pub(crate) fstr: [[usize; 3]; 3],
    pub(crate) fluid: Vec<bool>,
    pub(crate) rho: Vec<f64>,
    pub(crate) nu: Vec<f64>,
    pub(crate) drag: Vec<f64>, // μ/K (Pa·s/m²)
    pub(crate) beta: Vec<f64>,
    pub(crate) rcp: Vec<f64>, // fluid ρcp
    /// Face velocities u, v, w.
    pub(crate) vel: [Vec<f64>; 3],
    pub(crate) p: Vec<f64>,
    pub(crate) kind: [Vec<u8>; 3],
    /// Flow conditions on the domain faces (sides −x, +x, −y, +y, −z, +z), per
    /// edge cell, with the boundary index that set them. Index of the edge cell
    /// within a side: x sides j + ny·k, y sides i + nx·k, z sides i + nx·j.
    pub(crate) ebc: [Vec<(FBc, i64)>; 6],
    pub(crate) pidx: Vec<u32>,
    pub(crate) np: usize,
    pub(crate) pmat: Option<Csr>,
    pub(crate) pic: Option<PStencil>,
    pub(crate) last_dp: Vec<f64>,
    pub(crate) pinned: Vec<bool>,
    pub(crate) comp: Vec<u32>,
    pub(crate) comp_dirichlet: Vec<bool>,
    pub(crate) built_dt: f64,
    pub(crate) has_porous: bool,
    pub(crate) wgt: [Vec<f64>; 3],
    pub(crate) grav: [f64; 3],
    pub(crate) tref: f64,
    pub(crate) natural: bool,
    pub(crate) u_inlet: f64,
    pub(crate) nu_max: f64,
    pub(crate) iters: usize,
    /// Implicit momentum predictor (steady pseudo-time marching).
    pub(crate) implicit: bool,
    /// Effective kinematic viscosity ν + νt per cell (ν when laminar).
    pub(crate) nue: Vec<f64>,
    /// Kinematic viscosity used for the wall shear of wall-adjacent cells
    /// (ν, or the wall-function value when turbulent with large y+).
    pub(crate) nuw: Vec<f64>,
    /// Largest ν + νt (explicit viscous step limit).
    pub(crate) nue_max: f64,
    pub(crate) turb: Option<crate::turbulence::Turb>,
    /// Fan boundaries: (boundary index, face area m², current flow Q m³/s, last Δp Pa).
    pub(crate) fans: Vec<(usize, f64, f64, f64)>,
    /// Internal fans (pressure jumps inside the domain).
    pub(crate) ifans: Vec<IFan>,
}

impl<'a> FlowSolver<'a> {
    pub fn new(th: &'a Thermal<'a>) -> FlowSolver<'a> {
        let model = th.model;
        let mesh = th.mesh;
        let g = &mesh.grid;
        let d3 = g.dim == 3;
        let (nx, ny, nz) = (g.nx, g.ny, if d3 { g.nz } else { 1 });
        let n = nx * ny * nz;
        let mut fluid = vec![false; n];
        let mut rho = vec![1.0; n];
        let mut nu = vec![0.0; n];
        let mut drag = vec![0.0; n];
        let mut beta = vec![0.0; n];
        let mut rcp = vec![0.0; n];
        let mut has_porous = false;
        let mut nu_max: f64 = 0.0;
        for c in 0..n {
            if !mesh.simulated(c) {
                continue;
            }
            let m = &model.materials[mesh.mat[c] as usize];
            let fm = match m.kind {
                crate::model::Kind::Fluid => m,
                crate::model::Kind::Porous => {
                    has_porous = true;
                    drag[c] = match m.fluid {
                        Some(f) => model.materials[f].mu / m.permeability,
                        None => 0.0,
                    };
                    match m.fluid {
                        Some(f) => &model.materials[f],
                        None => continue,
                    }
                }
                _ => continue,
            };
            fluid[c] = true;
            rho[c] = fm.rho;
            nu[c] = fm.mu / fm.rho;
            beta[c] = fm.beta;
            rcp[c] = fm.rho * fm.cp;
            nu_max = nu_max.max(nu[c]);
        }
        let n3 = [nx, ny, nz];
        let cs = [1, nx, nx * ny];
        let mut fdim = [[0usize; 3]; 3];
        let mut fstr = [[0usize; 3]; 3];
        for a in 0..3 {
            let mut d = n3;
            d[a] += 1;
            fdim[a] = d;
            fstr[a] = [1, d[0], d[0] * d[1]];
        }
        let cidx = |q: [usize; 3]| q[0] + nx * (q[1] + ny * q[2]);
        let fidx = |a: usize, q: [usize; 3]| q[0] + fdim[a][0] * (q[1] + fdim[a][1] * q[2]);
        let edge_bc = |c: usize, d: usize| -> (FBc, i64) {
            if !fluid[c] {
                return (FBc::Wall, -1);
            }
            match mesh::resolve(model, mesh, Layer::Flow, c, d, Across::Outside) {
                Some(bi) => {
                    let b = &model.boundaries[bi];
                    let f = match b.btype {
                        BType::Inlet => FBc::Inlet(b.velocity, b.tin),
                        BType::Fan => FBc::Inlet(0.0, b.tin),
                        BType::Outlet => FBc::Outlet,
                        BType::Open => FBc::Open,
                        BType::Slip => FBc::Slip,
                        _ => FBc::Wall,
                    };
                    (f, bi as i64)
                }
                None => (FBc::Wall, -1),
            }
        };
        // Edge conditions per side (z sides only in 3D).
        let ndir = if d3 { 6 } else { 4 };
        let mut ebc: [Vec<(FBc, i64)>; 6] = Default::default();
        for d in 0..ndir {
            let a = d / 2;
            let hi = d % 2 == 1;
            let (t1, t2) = match a {
                0 => (1, 2),
                1 => (0, 2),
                _ => (0, 1),
            };
            let mut list = Vec::with_capacity(n3[t1] * n3[t2]);
            for s2 in 0..n3[t2] {
                for s1 in 0..n3[t1] {
                    let mut q = [0usize; 3];
                    q[t1] = s1;
                    q[t2] = s2;
                    q[a] = if hi { n3[a] - 1 } else { 0 };
                    list.push(edge_bc(cidx(q), d));
                }
            }
            ebc[d] = list;
        }

        let mut vel: [Vec<f64>; 3] = Default::default();
        let mut kind: [Vec<u8>; 3] = Default::default();
        let mut u_inlet: f64 = 0.0;
        for a in 0..3 {
            let nf = fdim[a][0] * fdim[a][1] * fdim[a][2];
            vel[a] = vec![0.0; nf];
            kind[a] = vec![FIXED; nf];
        }
        for a in 0..if d3 { 3 } else { 2 } {
            let fd = fdim[a];
            for k in 0..fd[2] {
                for j in 0..fd[1] {
                    for i in 0..fd[0] {
                        let q = [i, j, k];
                        if q[a] == 0 || q[a] == n3[a] {
                            continue;
                        }
                        let r = cidx(q);
                        if fluid[r - cs[a]] && fluid[r] {
                            kind[a][fidx(a, q)] = ACTIVE;
                        }
                    }
                }
            }
        }
        // Boundary faces: inlet velocities and outlet faces, side by side in the
        // order lo/hi per edge cell.
        for a in 0..if d3 { 3 } else { 2 } {
            let nl = ebc[2 * a].len();
            for l in 0..nl {
                for (d, sign) in [(2 * a, 1.0), (2 * a + 1, -1.0)] {
                    let (_, f) = side_face(n3, &fdim, d, l);
                    match ebc[d][l].0 {
                        FBc::Inlet(v, _) => {
                            vel[a][f] = sign * v;
                            u_inlet = u_inlet.max(v.abs());
                        }
                        FBc::Outlet | FBc::Open => kind[a][f] = OUTLET,
                        _ => {}
                    }
                }
            }
        }
        let mut pidx = vec![u32::MAX; n];
        let mut np = 0;
        for c in 0..n {
            if fluid[c] {
                pidx[c] = np as u32;
                np += 1;
            }
        }
        let study = &model.study;
        let tref = study.tref;
        let wgt = [vec![0.0; vel[0].len()], vec![0.0; vel[1].len()], vec![0.0; vel[2].len()]];
        let mut fs = FlowSolver {
            th,
            nx,
            ny,
            nz,
            d3,
            n3,
            h: [g.dx, g.dy, g.dz],
            cs,
            fdim,
            fstr,
            fluid,
            rho,
            nu,
            drag,
            beta,
            rcp,
            vel,
            p: vec![0.0; n],
            kind,
            ebc,
            pidx,
            np,
            pmat: None,
            pic: None,
            last_dp: vec![0.0; n],
            pinned: vec![false; np],
            comp: vec![0; np],
            comp_dirichlet: Vec::new(),
            built_dt: -1.0,
            has_porous,
            wgt,
            grav: [model.gravity[0], model.gravity[1], if d3 { model.gravity[2] } else { 0.0 }],
            tref,
            natural: study.natural,
            u_inlet,
            nu_max,
            iters: 0,
            implicit: false,
            nue: Vec::new(),
            nuw: Vec::new(),
            nue_max: nu_max,
            turb: None,
            fans: Vec::new(),
            ifans: Vec::new(),
        };
        fs.nue = fs.nu.clone();
        fs.nuw = fs.nu.clone();
        // Fans: total face area per fan; start at half the curve's largest flow.
        {
            let nbc = model.boundaries.len();
            let mut area = vec![0.0; nbc];
            for d in 0..fs.ndir() {
                let a = fs.face_area(d / 2);
                for &(_, bi) in fs.ebc[d].iter() {
                    if bi >= 0 && model.boundaries[bi as usize].btype == BType::Fan {
                        area[bi as usize] += a;
                    }
                }
            }
            for bi in 0..nbc {
                if area[bi] > 0.0 {
                    let qmax = model.boundaries[bi].curve.last().map_or(0.0, |c| c.0);
                    fs.fans.push((bi, area[bi], 0.5 * qmax, 0.0));
                }
            }
            let fans = fs.fans.clone();
            for (bi, a, q, _) in fans {
                fs.set_fan_velocity(bi, q / a);
            }
        }
        fs.init_internal_fans();
        if model.study.turbulence {
            fs.init_turbulence();
        }
        fs
    }

    /// Internal fans: the fan cells are the flowing cells of the body (or inside
    /// the region box), the fan plane is the plane of faces normal to the fan
    /// axis at the middle of their extent along that axis, limited to faces
    /// between two flowing cells.
    fn init_internal_fans(&mut self) {
        let model = self.th.model;
        let mesh = self.th.mesh;
        let g = &mesh.grid;
        for (bi, b) in model.boundaries.iter().enumerate() {
            if b.btype != BType::InternalFan {
                continue;
            }
            let axis = b.fan_dir / 2;
            let sign = if b.fan_dir % 2 == 1 { 1.0 } else { -1.0 };
            let mut fan = IFan { bi, axis, sign, faces: Vec::new(), area: 0.0, q: 0.0, dp: 0.5 * b.curve.first().map_or(0.0, |c| c.1) };
            if axis >= self.ncomp() || self.n3[axis] < 2 {
                self.ifans.push(fan);
                continue;
            }
            let n = self.fluid.len();
            let cells: Vec<usize> = (0..n)
                .filter(|&c| {
                    if !self.fluid[c] {
                        return false;
                    }
                    let (x, y, z) = g.centre(c);
                    let inside = match b.target {
                        crate::model::Target::Body(t) => mesh.owner[c] == t as u32,
                        crate::model::Target::Interior => true,
                        _ => false,
                    };
                    inside && b.in_region(x, y, self.d3.then_some(z))
                })
                .collect();
            if !cells.is_empty() {
                let (mut pmin, mut pmax) = (usize::MAX, 0usize);
                for &c in &cells {
                    let p = self.cq(c)[axis];
                    pmin = pmin.min(p);
                    pmax = pmax.max(p);
                }
                let pf = ((pmin + pmax + 1) / 2).clamp(1, self.n3[axis] - 1);
                let mut mark = vec![false; self.vel[axis].len()];
                for &c in &cells {
                    let mut q = self.cq(c);
                    q[axis] = pf;
                    let f = self.fidx(axis, q);
                    if !mark[f] && self.kind[axis][f] == ACTIVE {
                        mark[f] = true;
                        fan.faces.push(f);
                    }
                }
                fan.faces.sort_unstable();
                fan.area = fan.faces.len() as f64 * self.face_area(axis);
            }
            self.ifans.push(fan);
        }
    }

    /// Flow through each internal fan and the relaxed pressure jump towards
    /// the curve's Δp at that flow.
    fn update_internal_fans(&mut self) {
        let model = self.th.model;
        for k in 0..self.ifans.len() {
            let (axis, sign) = (self.ifans[k].axis, self.ifans[k].sign);
            if self.ifans[k].faces.is_empty() {
                continue;
            }
            let fa = self.face_area(axis);
            let q: f64 = self.ifans[k].faces.iter().map(|&f| sign * self.vel[axis][f] * fa).sum();
            let curve = &model.boundaries[self.ifans[k].bi].curve;
            let target = curve_dp(curve, q);
            let pscale = curve.iter().fold(0.0f64, |m, c| m.max(c.1.abs())).max(1e-300);
            let dp = self.ifans[k].dp;
            let step = (0.05 * (target - dp)).clamp(-0.02 * pscale, 0.02 * pscale);
            self.ifans[k].q = q;
            self.ifans[k].dp = dp + step;
        }
    }

    /// Momentum source (m/s², per unit mass) of the internal fans on the faces
    /// of component a: Δp/(ρ·h) along the fan direction; None without fans.
    fn fan_source(&self, a: usize) -> Option<Vec<f64>> {
        if !self.ifans.iter().any(|f| f.axis == a && !f.faces.is_empty()) {
            return None;
        }
        let mut s = vec![0.0; self.vel[a].len()];
        let fd = self.fdim[a];
        for fan in self.ifans.iter().filter(|f| f.axis == a) {
            for &f in &fan.faces {
                let q = [f % fd[0], (f / fd[0]) % fd[1], f / (fd[0] * fd[1])];
                let r = self.cidx(q);
                let rho = 0.5 * (self.rho[r - self.cs[a]] + self.rho[r]);
                s[f] += fan.sign * fan.dp / (rho * self.h[a]);
            }
        }
        Some(s)
    }

    /// Number of domain sides that carry flow conditions (4 in 2D, 6 in 3D).
    #[inline]
    pub(crate) fn ndir(&self) -> usize {
        if self.d3 {
            6
        } else {
            4
        }
    }
    /// Number of velocity components (2 or 3).
    #[inline]
    pub(crate) fn ncomp(&self) -> usize {
        if self.d3 {
            3
        } else {
            2
        }
    }
    /// Area of a face normal to axis a (m²; 2D: times the depth).
    #[inline]
    pub(crate) fn face_area(&self, a: usize) -> f64 {
        match a {
            0 => self.h[1] * self.h[2],
            1 => self.h[0] * self.h[2],
            _ => self.h[0] * self.h[1],
        }
    }
    #[inline]
    pub(crate) fn cidx(&self, q: [usize; 3]) -> usize {
        q[0] + self.nx * (q[1] + self.ny * q[2])
    }
    #[inline]
    pub(crate) fn cq(&self, c: usize) -> [usize; 3] {
        [c % self.nx, (c / self.nx) % self.ny, c / (self.nx * self.ny)]
    }
    #[inline]
    pub(crate) fn fidx(&self, a: usize, q: [usize; 3]) -> usize {
        let d = &self.fdim[a];
        q[0] + d[0] * (q[1] + d[1] * q[2])
    }
    /// Index of the edge cell with coordinates q within side d.
    #[inline]
    pub(crate) fn eidx(&self, d: usize, q: [usize; 3]) -> usize {
        match d / 2 {
            0 => q[1] + self.ny * q[2],
            1 => q[0] + self.nx * q[2],
            _ => q[0] + self.nx * q[1],
        }
    }
    /// Flow condition on side d of the edge cell with coordinates q.
    #[inline]
    pub(crate) fn edge(&self, d: usize, q: [usize; 3]) -> (FBc, i64) {
        self.ebc[d][self.eidx(d, q)]
    }
    /// (edge cell, boundary face index of component d/2) of entry l of side d.
    #[inline]
    pub(crate) fn side(&self, d: usize, l: usize) -> (usize, usize) {
        side_face(self.n3, &self.fdim, d, l)
    }
    /// Tangential axes of component a (the z axis only in 3D).
    #[inline]
    fn tang(&self, a: usize) -> ([usize; 2], usize) {
        let ax = match a {
            0 => [1, 2],
            1 => [0, 2],
            _ => [0, 1],
        };
        let cnt = if self.d3 || a == 2 { 2 } else { 1 };
        (ax, cnt)
    }

    /// Mean effective viscosity on the cell edge shared by the four cells
    /// lo, lo + cs[a], lo + cs[b], lo + cs[a] + cs[b] (summed in index order);
    /// only called where all four are flowing.
    #[inline]
    fn nu_corner(&self, lo: usize, a: usize, b: usize) -> f64 {
        let (s1, s2) = if self.cs[a] < self.cs[b] { (self.cs[a], self.cs[b]) } else { (self.cs[b], self.cs[a]) };
        0.25 * (self.nue[lo] + self.nue[lo + s1] + self.nue[lo + s2] + self.nue[lo + s1 + s2])
    }

    /// Tangential neighbourhood of face q (component a; cells L = R − cs[a] and
    /// R = cell q) along axis b, with the transverse velocities `vb`.
    #[inline]
    fn tangent(&self, a: usize, b: usize, q: [usize; 3], l: usize, r: usize, vb: &[f64]) -> Tang {
        let mut ql = q;
        ql[a] -= 1;
        let mut qlp = ql;
        qlp[b] += 1;
        let mut qp = q;
        qp[b] += 1;
        let vp = 0.5 * (vb[self.fidx(b, qlp)] + vb[self.fidx(b, qp)]);
        let vm = 0.5 * (vb[self.fidx(b, ql)] + vb[self.fidx(b, q)]);
        let sb = self.cs[b];
        let nb = self.n3[b];
        let (pin, pfree) = if q[b] + 1 < nb {
            (self.fluid[l + sb] && self.fluid[r + sb], false)
        } else {
            (false, self.edge(2 * b + 1, ql).0.free() && self.edge(2 * b + 1, q).0.free())
        };
        let (min, mfree) = if q[b] > 0 {
            (self.fluid[l - sb] && self.fluid[r - sb], false)
        } else {
            (false, self.edge(2 * b, ql).0.free() && self.edge(2 * b, q).0.free())
        };
        Tang { pin, min, pfree, mfree, vp, vm }
    }

    /// Impose the normal inflow speed v on every face of fan boundary `bi`.
    fn set_fan_velocity(&mut self, bi: usize, v: f64) {
        for d in 0..self.ndir() {
            let a = d / 2;
            let sign = if d % 2 == 0 { 1.0 } else { -1.0 };
            for l in 0..self.ebc[d].len() {
                if self.ebc[d][l].1 == bi as i64 {
                    if let FBc::Inlet(_, t) = self.ebc[d][l].0 {
                        self.ebc[d][l].0 = FBc::Inlet(v, t);
                        let (_, f) = self.side(d, l);
                        self.vel[a][f] = sign * v;
                    }
                }
            }
        }
        self.u_inlet = self.u_inlet.max(v.abs());
    }

    /// Move each fan towards its operating point: the flow at which the fan
    /// curve Δp(Q) equals the static pressure rise across the domain (area
    /// average of the pressure in the cells at the fan face, outlets at 0).
    fn update_fans(&mut self) {
        let model = self.th.model;
        let fans = self.fans.clone();
        for (idx, (bi, area, q, _)) in fans.into_iter().enumerate() {
            // Mean over the fan's faces (= area average: a fan sits on one side).
            let (mut ps, mut n) = (0.0, 0usize);
            for a in 0..self.ncomp() {
                for l in 0..self.ebc[2 * a].len() {
                    for d in [2 * a, 2 * a + 1] {
                        if self.ebc[d][l].1 == bi as i64 {
                            ps += self.p[self.side(d, l).0];
                            n += 1;
                        }
                    }
                }
            }
            let dp = ps / n.max(1) as f64;
            let curve = &model.boundaries[bi].curve;
            // invert the (non-increasing) curve
            let qt = if dp >= curve[0].1 {
                curve[0].0
            } else if dp <= curve[curve.len() - 1].1 {
                curve[curve.len() - 1].0
            } else {
                let mut r = curve[curve.len() - 1].0;
                for w in curve.windows(2) {
                    let ((q0, p0), (q1, p1)) = (w[0], w[1]);
                    if dp <= p0 && dp >= p1 {
                        r = if p0 > p1 { q0 + (q1 - q0) * (p0 - dp) / (p0 - p1) } else { q0 };
                        break;
                    }
                }
                r
            };
            let qmax = curve.iter().fold(0.0f64, |m, c| m.max(c.0)).max(1e-300);
            let step = (0.05 * (qt - q)).clamp(-0.02 * qmax, 0.02 * qmax);
            let qn = (q + step).max(0.0);
            self.fans[idx] = (bi, area, qn, dp);
            self.set_fan_velocity(bi, qn / area);
        }
    }

    pub(crate) fn fbc_kind(&self, f: FBc) -> FBcKind {
        match f {
            FBc::Wall => FBcKind::Wall,
            FBc::Slip => FBcKind::Slip,
            FBc::Inlet(..) => FBcKind::Inlet,
            FBc::Outlet | FBc::Open => FBcKind::Outflow,
        }
    }

    pub fn has_outflow(&self) -> bool {
        self.kind.iter().any(|k| k.iter().any(|&x| x == OUTLET))
    }

    fn vmax_comp(&self, a: usize) -> f64 {
        self.vel[a].iter().fold(0.0f64, |m, x| m.max(x.abs())).max(self.u_inlet)
    }

    /// Stable explicit time step for the current velocities.
    pub fn pick_dt(&self) -> f64 {
        let nuv = if self.implicit { self.nu_max } else { self.nue_max.max(self.nu_max) };
        let (dx, dy, dz) = (self.h[0], self.h[1], self.h[2]);
        let mut ih2 = 1.0 / (dx * dx) + 1.0 / (dy * dy);
        if self.d3 {
            ih2 += 1.0 / (dz * dz);
        }
        let dt_diff = if nuv > 0.0 { 0.8 / (2.0 * nuv * ih2) } else { f64::INFINITY };
        let mut rate = self.vmax_comp(0) / dx + self.vmax_comp(1) / dy;
        if self.d3 {
            rate += self.vmax_comp(2) / dz;
        }
        let dt_cfl = if rate > 0.0 { 0.5 / rate } else { f64::INFINITY };
        let dt = dt_diff.min(dt_cfl);
        if dt.is_finite() {
            dt
        } else {
            1e-3
        }
    }

    pub fn vel_scale(&self, t_cells: Option<&[f64]>) -> f64 {
        let mut umax: f64 = 0.0;
        for a in 0..self.ncomp() {
            umax = self.vel[a].iter().fold(umax, |m, x| m.max(x.abs()));
        }
        let mut s = umax.max(self.u_inlet);
        if self.natural {
            if let Some(t) = t_cells {
                let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
                for &x in t.iter().filter(|x| x.is_finite()) {
                    lo = lo.min(x);
                    hi = hi.max(x);
                }
                let dtmp = (hi - lo).max(0.0);
                let bmax = self.beta.iter().fold(0.0f64, |m, x| m.max(*x));
                let g = &self.grav;
                let gmag = (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]).sqrt();
                let mut l = (self.h[0] * self.nx as f64).min(self.h[1] * self.ny as f64);
                if self.d3 {
                    l = l.min(self.h[2] * self.nz as f64);
                }
                s = s.max((gmag * bmax * dtmp * l).sqrt());
            }
        }
        s.max(1e-6)
    }

    fn face_w(&self, l: usize, r: Option<usize>, dt: f64) -> f64 {
        let (rho, drag) = match r {
            Some(r) => (0.5 * (self.rho[l] + self.rho[r]), 0.5 * (self.drag[l] + self.drag[r])),
            None => (self.rho[l], self.drag[l]),
        };
        1.0 / (rho * (1.0 + dt * drag / rho))
    }

    /// Cell next to boundary face q (component a) on the domain side.
    #[inline]
    fn edge_cell(&self, a: usize, q: [usize; 3]) -> usize {
        let mut qc = q;
        if qc[a] == self.n3[a] {
            qc[a] -= 1;
        }
        self.cidx(qc)
    }

    /// (Re)build the pressure-correction matrix −∇·(w∇) for time step dt.
    fn build_pressure(&mut self, dt: f64) {
        let (nx, ny, nz) = (self.nx, self.ny, self.nz);
        let ncomp = self.ncomp();
        // face weights
        for a in 0..ncomp {
            let fd = self.fdim[a];
            let mut wv = std::mem::take(&mut self.wgt[a]);
            for k in 0..fd[2] {
                for j in 0..fd[1] {
                    for i in 0..fd[0] {
                        let q = [i, j, k];
                        let f = self.fidx(a, q);
                        wv[f] = match self.kind[a][f] {
                            ACTIVE => {
                                let r = self.cidx(q);
                                self.face_w(r - self.cs[a], Some(r), dt)
                            }
                            OUTLET => self.face_w(self.edge_cell(a, q), None, dt),
                            _ => 0.0,
                        };
                    }
                }
            }
            self.wgt[a] = wv;
        }
        // Face index of the + side face of cell q along axis a.
        let up = |s: &Self, a: usize, q: [usize; 3]| -> usize {
            let mut qq = q;
            qq[a] += 1;
            s.fidx(a, qq)
        };
        if self.pmat.is_none() {
            // Pattern + connected components (once).
            let mut nb = vec![Vec::new(); self.np];
            for k in 0..nz {
                for j in 0..ny {
                    for i in 0..nx {
                        let q = [i, j, k];
                        let c = self.cidx(q);
                        if !self.fluid[c] {
                            continue;
                        }
                        let r = self.pidx[c] as usize;
                        for a in 0..ncomp {
                            if q[a] + 1 < self.n3[a] && self.kind[a][up(self, a, q)] == ACTIVE {
                                let o = self.pidx[c + self.cs[a]];
                                nb[r].push(o);
                                nb[o as usize].push(r as u32);
                            }
                        }
                    }
                }
            }
            let mut comp = vec![u32::MAX; self.np];
            let mut ncmp = 0u32;
            let mut stack = Vec::new();
            for s in 0..self.np {
                if comp[s] != u32::MAX {
                    continue;
                }
                comp[s] = ncmp;
                stack.push(s);
                while let Some(x) = stack.pop() {
                    for &y in &nb[x] {
                        if comp[y as usize] == u32::MAX {
                            comp[y as usize] = ncmp;
                            stack.push(y as usize);
                        }
                    }
                }
                ncmp += 1;
            }
            let mut dir = vec![false; ncmp as usize];
            for k in 0..nz {
                for j in 0..ny {
                    for i in 0..nx {
                        let q = [i, j, k];
                        let c = self.cidx(q);
                        if !self.fluid[c] {
                            continue;
                        }
                        let mut out = false;
                        for a in 0..ncomp {
                            out = out || self.kind[a][self.fidx(a, q)] == OUTLET || self.kind[a][up(self, a, q)] == OUTLET;
                        }
                        if out {
                            dir[comp[self.pidx[c] as usize] as usize] = true;
                        }
                    }
                }
            }
            // Pin the first cell of every closed component (pure Neumann problem).
            let mut pinned = vec![false; self.np];
            let mut seen = vec![false; ncmp as usize];
            for r in 0..self.np {
                let k = comp[r] as usize;
                if !dir[k] && !seen[k] {
                    seen[k] = true;
                    pinned[r] = true;
                }
            }
            self.pinned = pinned;
            self.comp = comp;
            self.comp_dirichlet = dir;
            self.pmat = Some(Csr::from_neighbours(self.np, &nb));
        }
        let mut am = self.pmat.take().unwrap();
        am.clear();
        let ih2 = [1.0 / (self.h[0] * self.h[0]), 1.0 / (self.h[1] * self.h[1]), 1.0 / (self.h[2] * self.h[2])];
        for k in 0..nz {
            for j in 0..ny {
                for i in 0..nx {
                    let q = [i, j, k];
                    let c = self.cidx(q);
                    if !self.fluid[c] {
                        continue;
                    }
                    let r = self.pidx[c] as usize;
                    // faces in the order −x, +x, −y, +y, −z, +z
                    for d in 0..2 * ncomp {
                        let a = d / 2;
                        let (f, nbr) = if d % 2 == 0 {
                            (self.fidx(a, q), (q[a] > 0).then(|| c - self.cs[a]))
                        } else {
                            (up(self, a, q), (q[a] + 1 < self.n3[a]).then(|| c + self.cs[a]))
                        };
                        let w = self.wgt[a][f];
                        match self.kind[a][f] {
                            ACTIVE => {
                                let s = self.pidx[nbr.unwrap()] as usize;
                                let coef = w * ih2[a];
                                am.val[am.diag[r]] += coef;
                                if !self.pinned[r] && !self.pinned[s] {
                                    let pp = am.pos(r, s);
                                    am.val[pp] -= coef;
                                }
                            }
                            OUTLET => am.val[am.diag[r]] += 2.0 * w * ih2[a],
                            _ => {}
                        }
                    }
                    if self.pinned[r] {
                        let dg = am.diag[r];
                        if am.val[dg] <= 0.0 {
                            am.val[dg] = 1.0;
                        }
                    }
                }
            }
        }
        // Isolated cells with only walls: identity rows.
        for r in 0..self.np {
            let dg = am.diag[r];
            if am.val[dg] <= 0.0 {
                am.val[dg] = 1.0;
                self.pinned[r] = true;
            }
        }
        // Structured copy of the matrix for the fast stencil solver
        // (non-fluid cells become identity rows).
        let n = nx * ny * nz;
        let mut cc = vec![1.0; n];
        let mut cpl = [vec![0.0; n], vec![0.0; n], vec![0.0; if self.d3 { n } else { 0 }]];
        for cell in 0..n {
            if !self.fluid[cell] {
                continue;
            }
            let r = self.pidx[cell] as usize;
            cc[cell] = am.val[am.diag[r]];
            let q = self.cq(cell);
            for a in 0..ncomp {
                let o = cell + self.cs[a];
                if q[a] + 1 < self.n3[a] && self.fluid[o] && self.kind[a][up(self, a, q)] == ACTIVE {
                    cpl[a][cell] = -am.val[am.pos(r, self.pidx[o] as usize)];
                }
            }
        }
        let [e, s, t] = cpl;
        self.pic = Some(if self.d3 { PStencil::S7(Stencil7::new(nx, ny, cc, e, s, t, 0.97)) } else { PStencil::S5(Stencil5::new(nx, cc, e, s, 0.97)) });
        self.pmat = Some(am);
        self.built_dt = dt;
    }

    /// Implicit (backward Euler) momentum predictor of component a for steady
    /// pseudo-time marching: hybrid upwind convection with lagged fluxes,
    /// implicit viscous terms and drag, old pressure gradient and buoyancy on
    /// the right-hand side. The diagonally dominant system is relaxed with
    /// symmetric Gauss–Seidel sweeps; an exact solve is unnecessary because a
    /// converged pseudo-time state is a fixed point of the sweeps. This removes
    /// the viscous step limit and allows CFL numbers well above one.
    fn predict_implicit(&self, a: usize, dt: f64, t_cells: Option<&[f64]>) -> Vec<f64> {
        let buoy = self.natural && t_cells.is_some();
        let tc = t_cells.unwrap_or(&[]);
        // Patankar hybrid neighbour coefficients; f = outward flux rate (1/s).
        let a_down = |f: f64, d: f64| -> f64 { (-f).max(d - 0.5 * f).max(0.0) };
        let a_up = |f: f64, d: f64| -> f64 { f.max(d + 0.5 * f).max(0.0) };
        let inv_dt = 1.0 / dt;
        let vel = &self.vel[a];
        let kinds = &self.kind[a];
        let nf = vel.len();
        let fd = self.fdim[a];
        let fsa = self.fstr[a];
        let ha = self.h[a];
        let iha2 = 1.0 / (ha * ha);
        let (tax, tcnt) = self.tang(a);
        let ga = self.grav[a];
        let src = self.fan_source(a);
        let mut ap = vec![0.0; nf];
        // Couplings: normal +, normal −, then (+, −) per tangential axis.
        let mut nb = vec![[0.0f64; 6]; nf];
        let mut bb = vec![0.0; nf];
        for k in 0..fd[2] {
            for j in 0..fd[1] {
                for i in 0..fd[0] {
                    let q = [i, j, k];
                    let f = self.fidx(a, q);
                    if kinds[f] != ACTIVE {
                        continue;
                    }
                    let r = self.cidx(q);
                    let l = r - self.cs[a];
                    let rho = 0.5 * (self.rho[l] + self.rho[r]);
                    let c = 0.5 * (self.drag[l] + self.drag[r]) / rho;
                    let nu_wall = 0.5 * (self.nuw[l] + self.nuw[r]);
                    let (kp, km) = (f + fsa[a], f - fsa[a]);
                    let fp = 0.5 * (vel[f] + vel[kp]) / ha;
                    let fm = 0.5 * (vel[km] + vel[f]) / ha;
                    let mut b = vel[f] * inv_dt;
                    let mut sum_nb = 0.0;
                    let mut extra = 0.0;
                    let mut dflux = 0.0;
                    // normal direction: neighbours are faces of the same component
                    let ae = a_down(fp, self.nue[r] * iha2);
                    sum_nb += ae;
                    dflux += fp;
                    if kinds[kp] == ACTIVE {
                        nb[f][0] = ae;
                    } else {
                        b += ae * vel[kp];
                    }
                    let aw = a_up(fm, self.nue[l] * iha2);
                    sum_nb += aw;
                    dflux -= fm;
                    if kinds[km] == ACTIVE {
                        nb[f][1] = aw;
                    } else {
                        b += aw * vel[km];
                    }
                    // tangential directions: neighbour face or wall ghost
                    for (slot, &bx) in tax[..tcnt].iter().enumerate() {
                        let ihb2 = 1.0 / (self.h[bx] * self.h[bx]);
                        let tg = self.tangent(a, bx, q, l, r, &self.vel[bx]);
                        let (fnn, fs) = (tg.vp / self.h[bx], tg.vm / self.h[bx]);
                        if tg.pin {
                            let an = a_down(fnn, self.nu_corner(l, a, bx) * ihb2);
                            nb[f][2 + 2 * slot] = an;
                            sum_nb += an;
                            dflux += fnn;
                        } else {
                            if !tg.pfree {
                                extra += 2.0 * nu_wall * ihb2;
                            }
                            extra += fnn.max(0.0);
                        }
                        if tg.min {
                            let as_ = a_up(fs, self.nu_corner(l - self.cs[bx], a, bx) * ihb2);
                            nb[f][3 + 2 * slot] = as_;
                            sum_nb += as_;
                            dflux -= fs;
                        } else {
                            if !tg.mfree {
                                extra += 2.0 * nu_wall * ihb2;
                            }
                            extra += (-fs).max(0.0);
                        }
                    }
                    if buoy {
                        let tf = 0.5 * (tc[l] + tc[r]);
                        b += -0.5 * (self.beta[l] + self.beta[r]) * (tf - self.tref) * ga;
                    }
                    b -= (self.p[r] - self.p[l]) / (rho * ha);
                    if let Some(s) = &src {
                        b += s[f];
                    }
                    let base = inv_dt + c + sum_nb + extra;
                    ap[f] = (base + dflux).max(base);
                    bb[f] = b;
                }
            }
        }
        // Symmetric Gauss–Seidel on a zero-padded copy: every coupling is a
        // branch-free multiply-add (inactive couplings are 0).
        let o0 = fsa[a];
        let o1 = fsa[tax[0]];
        let o2 = if tcnt == 2 { fsa[tax[1]] } else { 0 };
        let pad = o0.max(o1).max(o2);
        let mut xp = vec![0.0; nf + 2 * pad];
        xp[pad..pad + nf].copy_from_slice(vel);
        for _ in 0..2 {
            for pass in 0..2 {
                for kk in 0..nf {
                    let k = if pass == 0 { kk } else { nf - 1 - kk };
                    if ap[k] == 0.0 {
                        continue;
                    }
                    let cf = &nb[k];
                    let x = k + pad;
                    let mut s = bb[k];
                    s += cf[0] * xp[x + o0];
                    s += cf[1] * xp[x - o0];
                    s += cf[2] * xp[x + o1];
                    s += cf[3] * xp[x - o1];
                    if tcnt == 2 {
                        s += cf[4] * xp[x + o2];
                        s += cf[5] * xp[x - o2];
                    }
                    xp[x] = s / ap[k];
                }
            }
        }
        xp.drain(..pad);
        xp.truncate(nf);
        xp
    }

    /// Explicit predictor of component a (transient studies).
    fn predict_explicit(&self, a: usize, dt: f64, t_cells: Option<&[f64]>) -> Vec<f64> {
        let hyb = |vel: f64, x: f64, y: f64, h: f64, nu: f64| -> f64 {
            // Hybrid scheme: central when the cell Péclet number < 2, else upwind.
            if vel.abs() * h < 2.0 * nu {
                0.5 * (x + y)
            } else if vel > 0.0 {
                x
            } else {
                y
            }
        };
        let buoy = self.natural && t_cells.is_some();
        let tc = t_cells.unwrap_or(&[]);
        let vel = &self.vel[a];
        let kinds = &self.kind[a];
        let fd = self.fdim[a];
        let fsa = self.fstr[a];
        let ha = self.h[a];
        let (tax, tcnt) = self.tang(a);
        let ga = self.grav[a];
        let src = self.fan_source(a);
        let mut us = vel.clone();
        for k in 0..fd[2] {
            for j in 0..fd[1] {
                for i in 0..fd[0] {
                    let q = [i, j, k];
                    let f = self.fidx(a, q);
                    if kinds[f] != ACTIVE {
                        continue;
                    }
                    let r = self.cidx(q);
                    let l = r - self.cs[a];
                    let rho = 0.5 * (self.rho[l] + self.rho[r]);
                    let nu = 0.5 * (self.nue[l] + self.nue[r]);
                    let c = 0.5 * (self.drag[l] + self.drag[r]) / rho;
                    let uc = vel[f];
                    let nu_wall = 0.5 * (self.nuw[l] + self.nuw[r]);
                    let ue_n = vel[f + fsa[a]];
                    let uw_n = vel[f - fsa[a]];
                    let ue = 0.5 * (uc + ue_n);
                    let uw = 0.5 * (uw_n + uc);
                    // advection: normal direction first, then the tangential ones
                    let mut adv = (ue * hyb(ue, uc, ue_n, ha, nu) - uw * hyb(uw, uw_n, uc, ha, nu)) / ha;
                    // viscous terms per axis, summed in axis order x, y, z
                    let mut vt = [0.0f64; 3];
                    vt[a] = (self.nue[r] * (ue_n - uc) - self.nue[l] * (uc - uw_n)) / (ha * ha);
                    for &bx in &tax[..tcnt] {
                        let hb = self.h[bx];
                        let tg = self.tangent(a, bx, q, l, r, &self.vel[bx]);
                        let un = if tg.pin {
                            vel[f + fsa[bx]]
                        } else if tg.pfree {
                            uc
                        } else {
                            -uc
                        };
                        let usn = if tg.min {
                            vel[f - fsa[bx]]
                        } else if tg.mfree {
                            uc
                        } else {
                            -uc
                        };
                        let nu_n = if tg.pin { self.nu_corner(l, a, bx) } else { nu_wall };
                        let nu_s = if tg.min { self.nu_corner(l - self.cs[bx], a, bx) } else { nu_wall };
                        let (vn, vsf) = (tg.vp, tg.vm);
                        adv += (vn * hyb(vn, uc, un, hb, nu) - vsf * hyb(vsf, usn, uc, hb, nu)) / hb;
                        vt[bx] = (nu_n * (un - uc) - nu_s * (uc - usn)) / (hb * hb);
                    }
                    let visc = if self.d3 { vt[0] + vt[1] + vt[2] } else { vt[0] + vt[1] };
                    let mut force = 0.0;
                    if buoy {
                        let tf = 0.5 * (tc[l] + tc[r]);
                        force = -0.5 * (self.beta[l] + self.beta[r]) * (tf - self.tref) * ga;
                    }
                    if let Some(s) = &src {
                        force += s[f];
                    }
                    let gp = (self.p[r] - self.p[l]) / (rho * ha);
                    us[f] = (uc + dt * (-adv + visc + force - gp)) / (1.0 + dt * c);
                }
            }
        }
        us
    }

    /// One projection step. `t_cells`: temperature per cell (for buoyancy).
    /// Returns the relative velocity change, or Err(()) if the step blew up
    /// (state restored).
    pub fn step(&mut self, dt: f64, t_cells: Option<&[f64]>, ctx: &mut Ctx) -> Result<Result<StepInfo, ()>, Error> {
        let (nx, ny, nz) = (self.nx, self.ny, self.nz);
        let ncomp = self.ncomp();
        if !self.fans.is_empty() {
            self.update_fans();
        }
        if !self.ifans.is_empty() {
            self.update_internal_fans();
        }
        if self.pmat.is_none() || (self.has_porous && ((dt - self.built_dt).abs() > 0.2 * self.built_dt)) {
            self.build_pressure(dt);
        }
        // The component predictors are independent (old velocities only).
        let pred = |a: usize| -> Vec<f64> {
            if a >= ncomp {
                self.vel[a].clone()
            } else if self.implicit {
                self.predict_implicit(a, dt, t_cells)
            } else {
                self.predict_explicit(a, dt, t_cells)
            }
        };
        #[cfg(feature = "parallel")]
        let mut vs: [Vec<f64>; 3] = {
            /// SAFETY: the predictors only read plain fields of the solver
            /// (velocities, pressure, properties, flags); they never touch
            /// `th` and its RefCells, so sharing `&FlowSolver` across the
            /// three read-only tasks is sound.
            struct Shared<'s, F: Fn(usize) -> Vec<f64>>(&'s F);
            unsafe impl<'s, F: Fn(usize) -> Vec<f64>> Sync for Shared<'s, F> {}
            unsafe impl<'s, F: Fn(usize) -> Vec<f64>> Send for Shared<'s, F> {}
            let sh = Shared(&pred);
            let shr = &sh;
            let (x, (y, z)) = rayon::join(move || (shr.0)(0), move || rayon::join(move || (shr.0)(1), move || (shr.0)(2)));
            [x, y, z]
        };
        #[cfg(not(feature = "parallel"))]
        let mut vs: [Vec<f64>; 3] = [pred(0), pred(1), pred(2)];
        // ---- outlet faces: zero-gradient extrapolation of the predictor
        for a in 0..ncomp {
            let st = self.fstr[a][a];
            for l in 0..self.ebc[2 * a].len() {
                let (_, f0) = self.side(2 * a, l);
                if self.kind[a][f0] == OUTLET {
                    let f1 = f0 + st;
                    vs[a][f0] = if self.n3[a] > 1 && self.kind[a][f1] == ACTIVE { vs[a][f1] } else { self.vel[a][f0] };
                }
                let (_, fnn) = self.side(2 * a + 1, l);
                if self.kind[a][fnn] == OUTLET {
                    let fm = fnn - st;
                    vs[a][fnn] = if self.n3[a] > 1 && self.kind[a][fm] == ACTIVE { vs[a][fm] } else { self.vel[a][fnn] };
                }
            }
        }
        // ---- pressure correction
        let np = self.np;
        let mut b = vec![0.0; np];
        let mut div2 = 0.0;
        for k in 0..nz {
            for j in 0..ny {
                for i in 0..nx {
                    let q = [i, j, k];
                    let c = self.cidx(q);
                    if !self.fluid[c] {
                        continue;
                    }
                    let mut div = 0.0;
                    for a in 0..ncomp {
                        let f = self.fidx(a, q);
                        let term = (vs[a][f + self.fstr[a][a]] - vs[a][f]) / self.h[a];
                        div = if a == 0 { term } else { div + term };
                    }
                    b[self.pidx[c] as usize] = -div / dt;
                    div2 += div * div;
                }
            }
        }
        // Closed components: make the Neumann problem compatible.
        let ncmp = self.comp_dirichlet.len();
        let mut sum = vec![0.0; ncmp];
        let mut cnt = vec![0usize; ncmp];
        for r in 0..np {
            let k = self.comp[r] as usize;
            if !self.comp_dirichlet[k] {
                sum[k] += b[r];
                cnt[k] += 1;
            }
        }
        for r in 0..np {
            let k = self.comp[r] as usize;
            if !self.comp_dirichlet[k] {
                b[r] -= sum[k] / cnt[k] as f64;
            }
            if self.pinned[r] {
                b[r] = 0.0;
            }
        }
        let uref = self.vel_scale(t_cells);
        let mut hmin = self.h[0].min(self.h[1]);
        if self.d3 {
            hmin = hmin.min(self.h[2]);
        }
        let tol = Tol { rel: 1e-12, abs: 1e-6 * uref / (hmin * dt) * (np as f64).sqrt(), max_iter: 3000 };
        // Warm start from the previous correction (smooth in time).
        let ncell = nx * ny * nz;
        let mut bf = vec![0.0; ncell];
        let mut xf = self.last_dp.clone();
        for c in 0..ncell {
            if self.fluid[c] {
                let r = self.pidx[c] as usize;
                bf[c] = b[r];
                if self.pinned[r] {
                    xf[c] = 0.0;
                }
            } else {
                xf[c] = 0.0;
            }
        }
        let st = {
            let m = self.pic.as_ref().unwrap();
            let mut mon = |it: usize, res: f64| ctx.tick(&|| format!("pressure iteration {it}, residual {res:.2e}"));
            m.pcg(&bf, &mut xf, tol, &mut mon)?
        };
        self.iters += st.iterations;
        self.last_dp.copy_from_slice(&xf);
        // ---- correct velocities and pressure (xf = δp per cell)
        for a in 0..ncomp {
            let fd = self.fdim[a];
            let ha = self.h[a];
            let na = self.n3[a];
            let csa = self.cs[a];
            let (kinds, wv) = (&self.kind[a], &self.wgt[a]);
            let va = &mut vs[a];
            for k in 0..fd[2] {
                for j in 0..fd[1] {
                    for i in 0..fd[0] {
                        let q = [i, j, k];
                        let f = q[0] + fd[0] * (q[1] + fd[1] * q[2]);
                        match kinds[f] {
                            ACTIVE => {
                                let r = q[0] + nx * (q[1] + ny * q[2]);
                                va[f] -= dt * wv[f] * (xf[r] - xf[r - csa]) / ha;
                            }
                            OUTLET => {
                                if q[a] == 0 {
                                    let r = q[0] + nx * (q[1] + ny * q[2]);
                                    va[f] -= dt * wv[f] * (xf[r] - 0.0) / (0.5 * ha);
                                } else {
                                    let mut qc = q;
                                    qc[a] = na - 1;
                                    let r = qc[0] + nx * (qc[1] + ny * qc[2]);
                                    va[f] -= dt * wv[f] * (0.0 - xf[r]) / (0.5 * ha);
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
        let mut newp = self.p.clone();
        for c in 0..ncell {
            if self.fluid[c] {
                newp[c] += xf[c];
            }
        }
        // ---- sanity / divergence guard
        let mut umax: f64 = 0.0;
        let mut dmax: f64 = 0.0;
        let mut finite = true;
        'outer: for a in 0..ncomp {
            for k in 0..vs[a].len() {
                if !vs[a][k].is_finite() {
                    finite = false;
                    break 'outer;
                }
                umax = umax.max(vs[a][k].abs());
                dmax = dmax.max((vs[a][k] - self.vel[a][k]).abs());
            }
        }
        let limit = 1e3 * uref.max(1e-2);
        if !finite || umax > limit || newp.iter().any(|x| !x.is_finite()) {
            return Ok(Err(()));
        }
        let rms = |x: &[f64], y: &[f64], kinds: &[u8]| -> f64 {
            let (mut s2, mut n) = (0.0, 0usize);
            for k in 0..x.len() {
                if kinds[k] != FIXED {
                    s2 += (x[k] - y[k]) * (x[k] - y[k]);
                    n += 1;
                }
            }
            (s2 / n.max(1) as f64).sqrt() / dt
        };
        let info = StepInfo {
            dmax,
            umax,
            continuity: (div2 / np.max(1) as f64).sqrt(),
            u_res: rms(&vs[0], &self.vel[0], &self.kind[0]),
            v_res: rms(&vs[1], &self.vel[1], &self.kind[1]),
            w_res: if self.d3 { rms(&vs[2], &self.vel[2], &self.kind[2]) } else { 0.0 },
        };
        self.vel = vs;
        self.p = newp;
        if self.turb.is_some() {
            self.turb_step(dt);
        }
        Ok(Ok(info))
    }

    /// Advection terms for the energy equation from the current velocities.
    pub fn adv(&self) -> Adv {
        let th = self.th;
        let mut face_f = vec![0.0; th.faces.len()];
        for (fi, f) in th.faces.iter().enumerate() {
            let ax = f.axis as usize;
            if ax >= self.ncomp() {
                continue;
            }
            let (ca, cb) = (th.cell_of[f.a as usize] as usize, th.cell_of[f.b as usize] as usize);
            if !(self.fluid[ca] && self.fluid[cb]) {
                continue;
            }
            let mut q = self.cq(ca);
            q[ax] += 1;
            let vel = self.vel[ax][self.fidx(ax, q)];
            face_f[fi] = 0.5 * (self.rcp[ca] + self.rcp[cb]) * vel * f.area;
        }
        let mut bnd = Vec::new();
        let amb = th.model.ambient;
        let mut push = |c: usize, out_vel: f64, area: f64, bc: (FBc, i64)| {
            if out_vel == 0.0 || !self.fluid[c] {
                return;
            }
            // Inflow temperature: inlet Tin; open boundaries and backflow
            // through an outlet bring fluid at the ambient temperature.
            let t_in = match bc.0 {
                FBc::Inlet(_, tin) => tin,
                _ => amb,
            };
            bnd.push(AdvB { u: th.unk[c], f_out: self.rcp[c] * out_vel * area, t_in, bc: bc.1 });
        };
        for a in 0..self.ncomp() {
            let area = self.face_area(a);
            for l in 0..self.ebc[2 * a].len() {
                let (c0, f0) = self.side(2 * a, l);
                push(c0, -self.vel[a][f0], area, self.ebc[2 * a][l]);
                let (c1, f1) = self.side(2 * a + 1, l);
                push(c1, self.vel[a][f1], area, self.ebc[2 * a + 1][l]);
            }
        }
        Adv { face_f, bnd }
    }

    /// Cell-centred velocity components.
    pub(crate) fn cell_velocity(&self, c: usize) -> [f64; 3] {
        let q = self.cq(c);
        let mut out = [0.0; 3];
        for a in 0..self.ncomp() {
            let f = self.fidx(a, q);
            out[a] = 0.5 * (self.vel[a][f] + self.vel[a][f + self.fstr[a][a]]);
        }
        out
    }

    /// Cell-centred output, boundary flow metrics and turbulence fields.
    /// `t`: temperature per thermal unknown.
    pub fn output(&self, t: &[f64]) -> FlowOut {
        let n = self.nx * self.ny * self.nz;
        let mut u = vec![0.0f32; n];
        let mut v = vec![0.0f32; n];
        let mut w = vec![0.0f32; if self.d3 { n } else { 0 }];
        let mut speed = vec![0.0f32; n];
        let mut p = vec![0.0f32; n];
        let mut vmax: f64 = 0.0;
        for c in 0..n {
            if !self.fluid[c] {
                continue;
            }
            let [uc, vc, wc] = self.cell_velocity(c);
            u[c] = uc as f32;
            v[c] = vc as f32;
            if self.d3 {
                w[c] = wc as f32;
            }
            p[c] = self.p[c] as f32;
            let s = if self.d3 { (uc * uc + vc * vc + wc * wc).sqrt() } else { (uc * uc + vc * vc).sqrt() };
            speed[c] = s as f32;
            vmax = vmax.max(s);
        }
        let model = self.th.model;
        let nb = model.boundaries.len();
        // Areas of flow-only boundaries (wall / slip) for the report.
        let mut areas = vec![0.0; nb];
        // Flow metrics accumulators: mass, volume, Σp·A, ΣA, Σ|ṁ|T, Σ|ṁ|, ΣT·A
        let mut acc = vec![[0.0f64; 7]; nb];
        let mut seen = vec![false; nb];
        let tcell = |c: usize| -> f64 {
            let un = self.th.unk[c];
            if un == u32::MAX {
                model.ambient
            } else {
                t[un as usize]
            }
        };
        let mut edge = |c: usize, bcx: (FBc, i64), area: f64, vin: f64| {
            let bi = bcx.1;
            if bi < 0 {
                return;
            }
            let bi = bi as usize;
            match bcx.0 {
                FBc::Wall | FBc::Slip => {
                    let bt = model.boundaries[bi].btype;
                    if matches!(bt, BType::Wall | BType::Slip) {
                        areas[bi] += area;
                    }
                }
                _ => {
                    if !self.fluid[c] {
                        return;
                    }
                    seen[bi] = true;
                    let rho = self.rho[c];
                    let pf = match bcx.0 {
                        FBc::Inlet(..) => self.p[c],
                        _ => 0.0,
                    };
                    let tf = if vin > 0.0 {
                        match bcx.0 {
                            FBc::Inlet(_, tin) => tin,
                            _ => model.ambient,
                        }
                    } else {
                        tcell(c)
                    };
                    let m = rho * vin * area;
                    let a = &mut acc[bi];
                    a[0] += m;
                    a[1] += vin * area;
                    a[2] += pf * area;
                    a[3] += area;
                    a[4] += m.abs() * tf;
                    a[5] += m.abs();
                    a[6] += tcell(c) * area;
                }
            }
        };
        for a in 0..self.ncomp() {
            let area = self.face_area(a);
            for l in 0..self.ebc[2 * a].len() {
                let (c0, f0) = self.side(2 * a, l);
                edge(c0, self.ebc[2 * a][l], area, self.vel[a][f0]);
                let (c1, f1) = self.side(2 * a + 1, l);
                edge(c1, self.ebc[2 * a + 1][l], area, -self.vel[a][f1]);
            }
        }
        let mut metrics = vec![None; nb];
        let (mut pin, mut ain, mut pout, mut aout) = (0.0, 0.0, 0.0, 0.0);
        for bi in 0..nb {
            if !seen[bi] {
                continue;
            }
            let a = acc[bi];
            let tavg = if a[5] > 1e-300 { a[4] / a[5] } else { a[6] / a[3].max(1e-300) };
            metrics[bi] = Some([a[0], a[1], a[2] / a[3].max(1e-300), tavg]);
            if matches!(model.boundaries[bi].btype, BType::Inlet | BType::Fan) {
                pin += a[2];
                ain += a[3];
            } else {
                pout += a[2];
                aout += a[3];
            }
        }
        let pressure_drop = (ain > 0.0 && aout > 0.0).then(|| pin / ain - pout / aout);
        let (k, omega, nut, yplus_max) = match &self.turb {
            Some(tb) => {
                let f = |x: &[f64]| -> Vec<f32> { (0..n).map(|c| if tb.act[c] { x[c] as f32 } else { 0.0 }).collect() };
                (Some(f(&tb.k)), Some(f(&tb.w)), Some(f(&tb.nut)), tb.yplus_max)
            }
            None => (None, None, None, 0.0),
        };
        let mut fan_points = vec![None; nb];
        for &(bi, _, q, dp) in &self.fans {
            fan_points[bi] = Some((q, dp));
        }
        let mut fan_flow = vec![None; nb];
        for fan in &self.ifans {
            let fa = self.face_area(fan.axis);
            let (mut m, mut vq) = (0.0, 0.0);
            let fd = self.fdim[fan.axis];
            for &f in &fan.faces {
                let q = [f % fd[0], (f / fd[0]) % fd[1], f / (fd[0] * fd[1])];
                let r = self.cidx(q);
                let rho = 0.5 * (self.rho[r - self.cs[fan.axis]] + self.rho[r]);
                let vf = fan.sign * self.vel[fan.axis][f] * fa;
                m += rho * vf;
                vq += vf;
            }
            fan_points[fan.bi] = Some((vq, fan.dp));
            fan_flow[fan.bi] = Some((m, vq));
            areas[fan.bi] += fan.area;
        }
        FlowOut {
            u,
            v,
            w: if self.d3 { Some(w) } else { None },
            speed,
            p,
            vmax,
            areas,
            metrics,
            pressure_drop,
            k,
            omega,
            nut,
            yplus_max,
            fan_points,
            fan_flow,
        }
    }
}

/// (edge cell, boundary face of component d/2) of entry l of side d.
fn side_face(n3: [usize; 3], fdim: &[[usize; 3]; 3], d: usize, l: usize) -> (usize, usize) {
    let a = d / 2;
    let hi = d % 2 == 1;
    let (t1, t2) = match a {
        0 => (1, 2),
        1 => (0, 2),
        _ => (0, 1),
    };
    let mut q = [0usize; 3];
    q[t1] = l % n3[t1];
    q[t2] = l / n3[t1];
    q[a] = if hi { n3[a] - 1 } else { 0 };
    let c = q[0] + n3[0] * (q[1] + n3[1] * q[2]);
    if hi {
        q[a] = n3[a];
    }
    let f = q[0] + fdim[a][0] * (q[1] + fdim[a][1] * q[2]);
    (c, f)
}

fn cells_t(th: &Thermal, t: &[f64]) -> Vec<f64> {
    let mut tc = vec![f64::NAN; th.mesh.grid.n()];
    for u in 0..th.n {
        tc[th.cell_of[u] as usize] = t[u];
    }
    tc
}

/// Conjugate heat transfer study (2D or 3D).
pub fn run_cht(th: &Thermal, ctx: &mut Ctx) -> Result<Solution, Error> {
    let study = &th.model.study;
    let mut flow = FlowSolver::new(th);
    if flow.u_inlet > 0.0 && !flow.has_outflow() {
        ctx.warn("An inlet is defined but there is no outlet/open boundary: mass cannot leave the domain");
    }
    for fan in &flow.ifans {
        if fan.faces.is_empty() {
            ctx.warn(format!(
                "Internal fan \"{}\" has no face between two fluid cells across its direction; it is ignored",
                th.model.boundaries[fan.bi].id
            ));
        }
    }
    let d3 = flow.d3;
    let mut t = vec![study.initial_t; th.n];
    let mut cache = SolverCache::default();
    let mut rec = th.new_record();
    let natural = study.natural;
    let mut dt_scale = 1.0f64;
    let mut failures = 0usize;
    let mut energy_iters = 0usize;
    let mut energy_res = 0.0f64;

    // Advance the flow by `span` seconds (transient) or one step (span None).
    // Returns the last relative change.
    macro_rules! flow_step {
        ($dt:expr, $tc:expr) => {{
            let dtv: f64 = $dt;
            match flow.step(dtv, $tc, ctx)? {
                Ok(ch) => {
                    if dt_scale < 1.0 {
                        dt_scale = (dt_scale * 1.1).min(1.0);
                    }
                    Some(ch)
                }
                Err(()) => {
                    failures += 1;
                    dt_scale *= 0.5;
                    None
                }
            }
        }};
    }
    // Residual row of a flow step (w only in 3D).
    let flow_row = |row: &mut Vec<(&'static str, f64)>, info: &StepInfo| {
        row.push(("continuity", info.continuity));
        row.push(("u", info.u_res));
        row.push(("v", info.v_res));
        if d3 {
            row.push(("w", info.w_res));
        }
    };

    if !study.transient {
        ctx.phase("flow");
        ctx.report(0.0, "Steady conjugate heat transfer")?;
        if natural {
            // Start from the conduction solution (only when it is defined:
            // all-open enclosures have no temperature reference without flow).
            if th.has_reference() {
                let (st, _, _) = th.solve(&mut t, None, 0.0, None, &mut cache, ctx)?;
                energy_iters += st.iterations;
            }
        }
        let steps = study.flow_steps;
        let mut tcells = cells_t(th, &t);
        let mut done_steps = 0;
        let mut converged = false;
        let mut s = 0usize;
        // Steady studies march in pseudo-time with the implicit predictor.
        flow.implicit = true;
        // Steadiness test (independent of the step size): RMS velocity change
        // over a window of WINDOW steps, as a rate per flow-through time
        // relative to the velocity scale. Per-step changes are dominated by the
        // pressure-solver noise floor when steps are small, so they are not used.
        const WINDOW: usize = 25;
        const STEADY_RATE: f64 = 1e-3;
        let mut lflow = th.model.width.max(th.model.height);
        if d3 {
            lflow = lflow.max(th.model.depth);
        }
        let ncomp = flow.ncomp();
        let mut snap = flow.vel.clone();
        let mut snap_t = 0.0f64;
        let mut ptime = 0.0f64;
        let mut quiet_windows = 0usize;
        let mut wrate = f64::INFINITY;
        let mut wrate_hist: Vec<f64> = Vec::new();
        // Flows that are physically unsteady (vortex shedding) never settle:
        // once the windowed rate stops improving, average the flow over
        // AVG_WINDOWS more windows and use that mean flow.
        const PATIENCE: usize = 16;
        const AVG_WINDOWS: usize = 16;
        let mut best_m = f64::INFINITY;
        let mut best_at = 0usize;
        let mut averaging = false;
        let mut avg_start = 0usize;
        let mut unsteady = false;
        let mut sum_vel: [Vec<f64>; 3] = [vec![0.0; flow.vel[0].len()], vec![0.0; flow.vel[1].len()], vec![0.0; flow.vel[2].len()]];
        let mut sum_p = vec![0.0; flow.p.len()];
        let mut n_avg = 0usize;
        let couple_every = 2usize;
        let pseudo_rcp = PSEUDO_CAP * flow.rcp.iter().cloned().fold(0.0f64, f64::max).max(1.0);
        let mut t_marched = 0.0f64;
        let mut t_snap = t.clone();
        while s < steps {
            let dt = flow.pick_dt() * IMPLICIT_CFL * dt_scale;
            let r = flow_step!(dt, if natural { Some(&tcells[..]) } else { None });
            if dt_scale < 1e-4 {
                ctx.warn("The flow solution diverged; velocities were reset to the last stable state");
                break;
            }
            let info = match r {
                Some(i) => i,
                None => continue,
            };
            s += 1;
            done_steps = s;
            ptime += dt;
            let mut t_res = f64::NAN;
            if averaging {
                for a in 0..ncomp {
                    for (x, y) in sum_vel[a].iter_mut().zip(flow.vel[a].iter()) {
                        *x += y;
                    }
                }
                for (x, y) in sum_p.iter_mut().zip(flow.p.iter()) {
                    *x += y;
                }
                n_avg += 1;
            }
            if natural && s % couple_every == 0 {
                // Energy marched in the same pseudo-time (uniform fluid capacity),
                // so the buoyancy coupling stays time-consistent.
                let adv = flow.adv();
                let told = t.clone();
                cache.pseudo_rcp = Some(pseudo_rcp);
                let dte = ptime - t_marched;
                let (st, _, _) = th.solve(&mut t, Some((&told, dte)), 0.0, Some(&adv), &mut cache, ctx)?;
                cache.pseudo_rcp = None;
                t_marched = ptime;
                t_res = (0..th.n).map(|u| (t[u] - told[u]).abs()).fold(0.0, f64::max) / dte;
                energy_iters += st.iterations;
                energy_res = st.residual;
                tcells = cells_t(th, &t);
            }
            {
                let mut row: Vec<(&'static str, f64)> = Vec::new();
                flow_row(&mut row, &info);
                if let Some(tb) = &flow.turb {
                    row.push(("k", tb.res_k));
                    row.push(("omega", tb.res_w));
                }
                if t_res.is_finite() {
                    row.push(("T", t_res));
                }
                ctx.residuals.push(&row);
            }
            if s % WINDOW == 0 {
                let uref = flow.vel_scale(Some(&tcells[..]));
                let mut ss = 0.0;
                let mut nn = 0usize;
                for a in 0..ncomp {
                    for (x, y) in flow.vel[a].iter().zip(snap[a].iter()) {
                        if *x != 0.0 || *y != 0.0 {
                            ss += (x - y) * (x - y);
                            nn += 1;
                        }
                    }
                }
                let rms = (ss / nn.max(1) as f64).sqrt();
                wrate = rms / (ptime - snap_t).max(1e-300) * lflow / (uref * uref);
                let snap_t_prev = snap_t;
                wrate_hist.push(wrate);
                for a in 0..ncomp {
                    snap[a].copy_from_slice(&flow.vel[a]);
                }
                snap_t = ptime;
                // Temperature settled too (natural convection): relative to the spread.
                let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
                for &x in &t {
                    lo = lo.min(x);
                    hi = hi.max(x);
                }
                let mut tchange: f64 = 0.0;
                for u in 0..th.n {
                    tchange = tchange.max((t[u] - t_snap[u]).abs());
                }
                t_snap.copy_from_slice(&t);
                // Temperature drift over the window, per flow-through time,
                // relative to the temperature spread.
                let t_rate = tchange / (ptime - snap_t_prev).max(1e-300) * lflow / uref / (hi - lo).max(1e-3);
                let t_ok = !natural || t_rate < STEADY_RATE;
                if wrate < STEADY_RATE && t_ok {
                    quiet_windows += 1;
                } else {
                    quiet_windows = 0;
                }
                if quiet_windows >= 2 {
                    converged = true;
                    break;
                }
                let k = wrate_hist.len();
                if k >= 8 {
                    let m = wrate_hist[k - 8..].iter().cloned().fold(0.0, f64::max);
                    if m < 0.7 * best_m {
                        best_m = m;
                        best_at = k;
                    }
                    if !averaging && k >= 24 && k - best_at >= PATIENCE {
                        averaging = true;
                        avg_start = s;
                    }
                }
                if averaging && s - avg_start >= AVG_WINDOWS * WINDOW {
                    unsteady = true;
                    break;
                }
                ctx.report(s as f64 / steps as f64, &format!("flow step {s}/{steps}, steadiness {wrate:.2e}"))?;
            }
        }
        ctx.log("flow", done_steps, if wrate.is_finite() { wrate } else { 0.0 });
        ctx.log("pressure", flow.iters, 0.0);
        if !converged {
            let plateau = unsteady || averaging;
            if plateau && n_avg > 0 {
                let inv = 1.0 / n_avg as f64;
                for a in 0..ncomp {
                    flow.vel[a] = sum_vel[a].iter().map(|x| x * inv).collect();
                }
                flow.p = sum_p.iter().map(|x| x * inv).collect();
                ctx.warn(format!(
                    "The flow is unsteady (periodic, e.g. vortex shedding) and has no steady state; velocities, pressure and temperatures use the flow averaged over the last {n_avg} pseudo-time steps. A transient study resolves the fluctuations."
                ));
            } else {
                ctx.warn(format!(
                    "Steady flow did not fully converge in {done_steps} pseudo-time steps (steadiness {wrate:.1e}; increase study.flowSteps)"
                ));
            }
        }
        ctx.phase("conduction");
        ctx.report(0.0, "Energy equation")?;
        let adv = flow.adv();
        cache.tol_factor = 1e-3;
        let (mut st, mut outer, mut conv) = th.solve(&mut t, None, 0.0, Some(&adv), &mut cache, ctx)?;
        if th.joule_coupled() {
            for _ in 0..30 {
                let tprev = t.clone();
                th.update_joule(&t, ctx, true)?;
                let r = th.solve(&mut t, None, 0.0, Some(&adv), &mut cache, ctx)?;
                st = r.0;
                outer += r.1;
                conv = r.2;
                if (0..th.n).map(|u| (t[u] - tprev[u]).abs()).fold(0.0, f64::max) < 1e-3 {
                    break;
                }
            }
        }
        energy_iters += st.iterations;
        energy_res = energy_res.max(st.residual);
        if !conv {
            ctx.warn("Nonlinear energy iteration did not converge to 1e-4 K");
        }
        ctx.log("energy", energy_iters, energy_res);
        if outer > 1 {
            ctx.log("picard", outer, 0.0);
        }
        if failures > 0 {
            ctx.warn(format!("The flow time step was reduced {failures} times to keep the solution stable"));
        }
        th.record(&mut rec, &t, 0.0, Some(&adv));
        let fo = flow.output(&t);
        return Ok(Solution { t, rec, time_end: 0.0, stored: 0.0, adv: Some(adv), flow: Some(fo) });
    }

    // ---- transient CHT
    ctx.phase("transient");
    ctx.report(0.0, "Transient conjugate heat transfer")?;
    let frames = study.frames.max(1);
    let interval = study.end_time / frames as f64;
    let sub = ((interval / study.dt) - 1e-9).ceil().max(1.0) as usize;
    let dt = interval / sub as f64;
    let adv0 = flow.adv();
    th.record(&mut rec, &t, 0.0, Some(&adv0));
    let total = frames * sub;
    let mut told = t.clone();
    let mut time = 0.0;
    let mut stepno = 0usize;
    let mut flow_steps = 0usize;
    let mut adv = adv0;
    let mut diverged = false;
    let mut last_info = StepInfo::default();
    for f in 1..=frames {
        for s in 0..sub {
            told.copy_from_slice(&t);
            time = (f - 1) as f64 * interval + (s + 1) as f64 * dt;
            // Flow substeps covering dt.
            if !diverged {
                let tcells = cells_t(th, &t);
                let mut remaining = dt;
                let mut guard = 0usize;
                while remaining > 1e-15 * dt {
                    let lim = flow.pick_dt() * dt_scale;
                    let m = (remaining / lim).ceil().max(1.0);
                    let h = remaining / m;
                    let r = flow_step!(h, if natural { Some(&tcells[..]) } else { None });
                    if dt_scale < 1e-4 {
                        ctx.warn("The flow solution diverged; the flow was frozen at the last stable state");
                        diverged = true;
                        break;
                    }
                    if let Some(i) = r {
                        last_info = i;
                        remaining -= h;
                        flow_steps += 1;
                    }
                    guard += 1;
                    if guard % 50 == 0 {
                        ctx.tick(&|| format!("t = {time:.4} s, flow step {flow_steps}"))?;
                    }
                }
            }
            adv = flow.adv();
            if th.joule_coupled() {
                th.update_joule(&told, ctx, true)?;
            }
            let (st, _, _) = th.solve(&mut t, Some((&told, dt)), time, Some(&adv), &mut cache, ctx)?;
            energy_iters += st.iterations;
            energy_res = energy_res.max(st.residual);
            stepno += 1;
            {
                let tr = (0..th.n).map(|u| (t[u] - told[u]).abs()).fold(0.0, f64::max) / dt;
                let mut row: Vec<(&'static str, f64)> = vec![("T", tr)];
                if flow_steps > 0 {
                    flow_row(&mut row, &last_info);
                    if let Some(tb) = &flow.turb {
                        row.push(("k", tb.res_k));
                        row.push(("omega", tb.res_w));
                    }
                }
                ctx.residuals.push(&row);
            }
            ctx.report(stepno as f64 / total as f64, &format!("t = {time:.4} s"))?;
        }
        th.record(&mut rec, &t, f as f64 * interval, Some(&adv));
    }
    ctx.log("flow", flow_steps, 0.0);
    ctx.log("pressure", flow.iters, 0.0);
    ctx.log("energy", energy_iters, energy_res);
    if failures > 0 {
        ctx.warn(format!("The flow time step was reduced {failures} times to keep the solution stable"));
    }
    let stored = th.stored_rate(&t, &told, dt);
    let fo = flow.output(&t);
    Ok(Solution { t, rec, time_end: time, stored, adv: Some(adv), flow: Some(fo) })
}
