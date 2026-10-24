//! 2D incompressible flow on a staggered (MAC) grid and conjugate heat transfer.
//!
//! * Velocities u on vertical faces, v on horizontal faces, pressure in cells.
//! * Incremental projection: the predictor uses the old pressure gradient,
//!   explicit hybrid (central/upwind by cell Péclet number) advection, explicit
//!   viscous terms and an implicit Darcy–Brinkman drag μ/K·u; a pressure
//!   correction δp from a Poisson equation (PCG + IC(0)) makes the field
//!   divergence free. The time step is limited by CFL and viscous stability.
//! * Faces between flowing cells and solids/void, and domain edges with no flow
//!   boundary, are no-slip walls (ghost velocity −u for the tangential part).
//! * Natural convection: Boussinesq force −β(T − Tref)·g per unit mass.
//! * Energy: implicit upwind convection–diffusion over all simulated cells
//!   (conjugate), assembled by `conduction::Thermal::assemble` with `Adv` terms.

use crate::conduction::{Adv, AdvB, FlowOut, SolverCache, Solution, Thermal};
use crate::linalg::{Csr, Stencil5, Tol};
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
    fn free(self) -> bool {
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
    /// RMS velocity change rates (m/s²).
    pub u_res: f64,
    pub v_res: f64,
}

const FIXED: u8 = 0;
const ACTIVE: u8 = 1;
const OUTLET: u8 = 2;

pub struct FlowSolver<'a> {
    pub(crate) th: &'a Thermal<'a>,
    pub(crate) nx: usize,
    pub(crate) ny: usize,
    pub(crate) dx: f64,
    pub(crate) dy: f64,
    pub(crate) depth: f64,
    pub(crate) fluid: Vec<bool>,
    pub(crate) rho: Vec<f64>,
    pub(crate) nu: Vec<f64>,
    pub(crate) drag: Vec<f64>, // μ/K (Pa·s/m²)
    pub(crate) beta: Vec<f64>,
    pub(crate) rcp: Vec<f64>, // fluid ρcp
    pub(crate) u: Vec<f64>,
    pub(crate) v: Vec<f64>,
    pub(crate) p: Vec<f64>,
    pub(crate) uk: Vec<u8>,
    pub(crate) vk: Vec<u8>,
    // Edge flow conditions (per edge cell) and the boundary index that set them.
    pub(crate) left: Vec<(FBc, i64)>,
    pub(crate) right: Vec<(FBc, i64)>,
    pub(crate) bottom: Vec<(FBc, i64)>,
    pub(crate) top: Vec<(FBc, i64)>,
    pub(crate) pidx: Vec<u32>,
    pub(crate) np: usize,
    pub(crate) pmat: Option<Csr>,
    pub(crate) pic: Option<Stencil5>,
    pub(crate) last_dp: Vec<f64>,
    pub(crate) pinned: Vec<bool>,
    pub(crate) comp: Vec<u32>,
    pub(crate) comp_dirichlet: Vec<bool>,
    pub(crate) built_dt: f64,
    pub(crate) has_porous: bool,
    pub(crate) wu: Vec<f64>,
    pub(crate) wv: Vec<f64>,
    pub(crate) gx: f64,
    pub(crate) gy: f64,
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
}

impl<'a> FlowSolver<'a> {
    pub fn new(th: &'a Thermal<'a>) -> FlowSolver<'a> {
        let model = th.model;
        let mesh = th.mesh;
        let g = &mesh.grid;
        let (nx, ny) = (g.nx, g.ny);
        let n = nx * ny;
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
        let left: Vec<_> = (0..ny).map(|j| edge_bc(j * nx, 0)).collect();
        let right: Vec<_> = (0..ny).map(|j| edge_bc(j * nx + nx - 1, 1)).collect();
        let bottom: Vec<_> = (0..nx).map(|i| edge_bc(i, 2)).collect();
        let top: Vec<_> = (0..nx).map(|i| edge_bc((ny - 1) * nx + i, 3)).collect();

        let mut u = vec![0.0; (nx + 1) * ny];
        let mut v = vec![0.0; nx * (ny + 1)];
        let mut uk = vec![FIXED; (nx + 1) * ny];
        let mut vk = vec![FIXED; nx * (ny + 1)];
        let mut u_inlet: f64 = 0.0;
        for j in 0..ny {
            for i in 1..nx {
                if fluid[j * nx + i - 1] && fluid[j * nx + i] {
                    uk[j * (nx + 1) + i] = ACTIVE;
                }
            }
            for (i, bc, sign) in [(0usize, left[j].0, 1.0), (nx, right[j].0, -1.0)] {
                match bc {
                    FBc::Inlet(vel, _) => {
                        u[j * (nx + 1) + i] = sign * vel;
                        u_inlet = u_inlet.max(vel.abs());
                    }
                    FBc::Outlet | FBc::Open => uk[j * (nx + 1) + i] = OUTLET,
                    _ => {}
                }
            }
        }
        for i in 0..nx {
            for j in 1..ny {
                if fluid[(j - 1) * nx + i] && fluid[j * nx + i] {
                    vk[j * nx + i] = ACTIVE;
                }
            }
            for (j, bc, sign) in [(0usize, bottom[i].0, 1.0), (ny, top[i].0, -1.0)] {
                match bc {
                    FBc::Inlet(vel, _) => {
                        v[j * nx + i] = sign * vel;
                        u_inlet = u_inlet.max(vel.abs());
                    }
                    FBc::Outlet | FBc::Open => vk[j * nx + i] = OUTLET,
                    _ => {}
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
        let mut fs = FlowSolver {
            th,
            nx,
            ny,
            dx: g.dx,
            dy: g.dy,
            depth: g.dz,
            fluid,
            rho,
            nu,
            drag,
            beta,
            rcp,
            u,
            v,
            p: vec![0.0; n],
            uk,
            vk,
            left,
            right,
            bottom,
            top,
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
            wu: vec![0.0; (nx + 1) * ny],
            wv: vec![0.0; nx * (ny + 1)],
            gx: model.gravity[0],
            gy: model.gravity[1],
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
        };
        fs.nue = fs.nu.clone();
        fs.nuw = fs.nu.clone();
        // Fans: total face area per fan; start at half the curve's largest flow.
        {
            let nbc = model.boundaries.len();
            let mut area = vec![0.0; nbc];
            for (list, a) in [(&fs.left, fs.dy * fs.depth), (&fs.right, fs.dy * fs.depth), (&fs.bottom, fs.dx * fs.depth), (&fs.top, fs.dx * fs.depth)] {
                for &(_, bi) in list.iter() {
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
        if model.study.turbulence {
            fs.init_turbulence();
        }
        fs
    }

    #[inline]
    pub(crate) fn ui(&self, i: usize, j: usize) -> usize {
        j * (self.nx + 1) + i
    }
    #[inline]
    pub(crate) fn vi(&self, i: usize, j: usize) -> usize {
        j * self.nx + i
    }
    #[inline]
    pub(crate) fn fl(&self, i: usize, j: usize) -> bool {
        self.fluid[j * self.nx + i]
    }

    /// Mean effective viscosity at the cell corner (x = i·dx, y = j·dy); only
    /// called where all four surrounding cells are flowing.
    #[inline]
    fn nu_corner(&self, i: usize, j: usize) -> f64 {
        let nx = self.nx;
        0.25 * (self.nue[(j - 1) * nx + i - 1] + self.nue[(j - 1) * nx + i] + self.nue[j * nx + i - 1] + self.nue[j * nx + i])
    }

    /// Impose the normal inflow speed v on every face of fan boundary `bi`.
    fn set_fan_velocity(&mut self, bi: usize, v: f64) {
        let (nx, ny) = (self.nx, self.ny);
        for j in 0..ny {
            if self.left[j].1 == bi as i64 {
                if let FBc::Inlet(_, t) = self.left[j].0 {
                    self.left[j].0 = FBc::Inlet(v, t);
                    let k = self.ui(0, j);
                    self.u[k] = v;
                }
            }
            if self.right[j].1 == bi as i64 {
                if let FBc::Inlet(_, t) = self.right[j].0 {
                    self.right[j].0 = FBc::Inlet(v, t);
                    let k = self.ui(nx, j);
                    self.u[k] = -v;
                }
            }
        }
        for i in 0..nx {
            if self.bottom[i].1 == bi as i64 {
                if let FBc::Inlet(_, t) = self.bottom[i].0 {
                    self.bottom[i].0 = FBc::Inlet(v, t);
                    let k = self.vi(i, 0);
                    self.v[k] = v;
                }
            }
            if self.top[i].1 == bi as i64 {
                if let FBc::Inlet(_, t) = self.top[i].0 {
                    self.top[i].0 = FBc::Inlet(v, t);
                    let k = self.vi(i, ny);
                    self.v[k] = -v;
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
        let (nx, ny) = (self.nx, self.ny);
        let fans = self.fans.clone();
        for (idx, (bi, area, q, _)) in fans.into_iter().enumerate() {
            let (mut ps, mut n) = (0.0, 0usize);
            for j in 0..ny {
                if self.left[j].1 == bi as i64 {
                    ps += self.p[j * nx];
                    n += 1;
                }
                if self.right[j].1 == bi as i64 {
                    ps += self.p[j * nx + nx - 1];
                    n += 1;
                }
            }
            for i in 0..nx {
                if self.bottom[i].1 == bi as i64 {
                    ps += self.p[i];
                    n += 1;
                }
                if self.top[i].1 == bi as i64 {
                    ps += self.p[(ny - 1) * nx + i];
                    n += 1;
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
        self.uk.iter().chain(self.vk.iter()).any(|&k| k == OUTLET)
    }

    /// Stable explicit time step for the current velocities.
    pub fn pick_dt(&self) -> f64 {
        let umax = self.u.iter().fold(0.0f64, |m, x| m.max(x.abs())).max(self.u_inlet);
        let vmax = self.v.iter().fold(0.0f64, |m, x| m.max(x.abs())).max(self.u_inlet);
        let nuv = if self.implicit { self.nu_max } else { self.nue_max.max(self.nu_max) };
        let dt_diff = if nuv > 0.0 {
            0.8 / (2.0 * nuv * (1.0 / (self.dx * self.dx) + 1.0 / (self.dy * self.dy)))
        } else {
            f64::INFINITY
        };
        let rate = umax / self.dx + vmax / self.dy;
        let dt_cfl = if rate > 0.0 { 0.5 / rate } else { f64::INFINITY };
        let dt = dt_diff.min(dt_cfl);
        if dt.is_finite() {
            dt
        } else {
            1e-3
        }
    }

    pub fn vel_scale(&self, t_cells: Option<&[f64]>) -> f64 {
        let umax = self.u.iter().chain(self.v.iter()).fold(0.0f64, |m, x| m.max(x.abs()));
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
                let gmag = (self.gx * self.gx + self.gy * self.gy).sqrt();
                let l = (self.dx * self.nx as f64).min(self.dy * self.ny as f64);
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

    /// (Re)build the pressure-correction matrix −∇·(w∇) for time step dt.
    fn build_pressure(&mut self, dt: f64) {
        let (nx, ny) = (self.nx, self.ny);
        let (dx, dy) = (self.dx, self.dy);
        // face weights
        for j in 0..ny {
            for i in 0..=nx {
                let k = self.ui(i, j);
                self.wu[k] = match self.uk[k] {
                    ACTIVE => self.face_w(j * nx + i - 1, Some(j * nx + i), dt),
                    OUTLET => self.face_w(j * nx + if i == 0 { 0 } else { nx - 1 }, None, dt),
                    _ => 0.0,
                };
            }
        }
        for j in 0..=ny {
            for i in 0..nx {
                let k = self.vi(i, j);
                self.wv[k] = match self.vk[k] {
                    ACTIVE => self.face_w((j - 1) * nx + i, Some(j * nx + i), dt),
                    OUTLET => self.face_w(if j == 0 { i } else { (ny - 1) * nx + i }, None, dt),
                    _ => 0.0,
                };
            }
        }
        if self.pmat.is_none() {
            // Pattern + connected components (once).
            let mut nb = vec![Vec::new(); self.np];
            for j in 0..ny {
                for i in 0..nx {
                    let c = j * nx + i;
                    if !self.fluid[c] {
                        continue;
                    }
                    let r = self.pidx[c] as usize;
                    if i + 1 < nx && self.uk[self.ui(i + 1, j)] == ACTIVE {
                        nb[r].push(self.pidx[c + 1]);
                        nb[self.pidx[c + 1] as usize].push(r as u32);
                    }
                    if j + 1 < ny && self.vk[self.vi(i, j + 1)] == ACTIVE {
                        nb[r].push(self.pidx[c + nx]);
                        nb[self.pidx[c + nx] as usize].push(r as u32);
                    }
                }
            }
            let mut comp = vec![u32::MAX; self.np];
            let mut ncomp = 0u32;
            let mut stack = Vec::new();
            for s in 0..self.np {
                if comp[s] != u32::MAX {
                    continue;
                }
                comp[s] = ncomp;
                stack.push(s);
                while let Some(x) = stack.pop() {
                    for &y in &nb[x] {
                        if comp[y as usize] == u32::MAX {
                            comp[y as usize] = ncomp;
                            stack.push(y as usize);
                        }
                    }
                }
                ncomp += 1;
            }
            let mut dir = vec![false; ncomp as usize];
            for j in 0..ny {
                for i in 0..nx {
                    let c = j * nx + i;
                    if !self.fluid[c] {
                        continue;
                    }
                    let out = self.uk[self.ui(i, j)] == OUTLET
                        || self.uk[self.ui(i + 1, j)] == OUTLET
                        || self.vk[self.vi(i, j)] == OUTLET
                        || self.vk[self.vi(i, j + 1)] == OUTLET;
                    if out {
                        dir[comp[self.pidx[c] as usize] as usize] = true;
                    }
                }
            }
            // Pin the first cell of every closed component (pure Neumann problem).
            let mut pinned = vec![false; self.np];
            let mut seen = vec![false; ncomp as usize];
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
        let mut a = self.pmat.take().unwrap();
        a.clear();
        let (ix2, iy2) = (1.0 / (dx * dx), 1.0 / (dy * dy));
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                if !self.fluid[c] {
                    continue;
                }
                let r = self.pidx[c] as usize;
                let faces = [
                    (self.uk[self.ui(i, j)], self.wu[self.ui(i, j)], ix2, (i > 0).then(|| c - 1)),
                    (self.uk[self.ui(i + 1, j)], self.wu[self.ui(i + 1, j)], ix2, (i + 1 < nx).then(|| c + 1)),
                    (self.vk[self.vi(i, j)], self.wv[self.vi(i, j)], iy2, (j > 0).then(|| c - nx)),
                    (self.vk[self.vi(i, j + 1)], self.wv[self.vi(i, j + 1)], iy2, (j + 1 < ny).then(|| c + nx)),
                ];
                for (kind, w, ih2, nbr) in faces {
                    match kind {
                        ACTIVE => {
                            let s = self.pidx[nbr.unwrap()] as usize;
                            let coef = w * ih2;
                            a.val[a.diag[r]] += coef;
                            if !self.pinned[r] && !self.pinned[s] {
                                let p = a.pos(r, s);
                                a.val[p] -= coef;
                            }
                        }
                        OUTLET => a.val[a.diag[r]] += 2.0 * w * ih2,
                        _ => {}
                    }
                }
                if self.pinned[r] {
                    let d = a.diag[r];
                    if a.val[d] <= 0.0 {
                        a.val[d] = 1.0;
                    }
                }
            }
        }
        // Isolated cells with only walls: identity rows.
        for r in 0..self.np {
            let d = a.diag[r];
            if a.val[d] <= 0.0 {
                a.val[d] = 1.0;
                self.pinned[r] = true;
            }
        }
        // Structured copy of the matrix for the fast stencil solver
        // (non-fluid cells become identity rows).
        let n = nx * ny;
        let mut c = vec![1.0; n];
        let mut e = vec![0.0; n];
        let mut s = vec![0.0; n];
        for cell in 0..n {
            if !self.fluid[cell] {
                continue;
            }
            let r = self.pidx[cell] as usize;
            c[cell] = a.val[a.diag[r]];
            let (i, j) = (cell % nx, cell / nx);
            if i + 1 < nx && self.fluid[cell + 1] && self.uk[self.ui(i + 1, j)] == ACTIVE {
                e[cell] = -a.val[a.pos(r, self.pidx[cell + 1] as usize)];
            }
            if j + 1 < ny && self.fluid[cell + nx] && self.vk[self.vi(i, j + 1)] == ACTIVE {
                s[cell] = -a.val[a.pos(r, self.pidx[cell + nx] as usize)];
            }
        }
        self.pic = Some(Stencil5::new(nx, c, e, s, 0.97));
        self.pmat = Some(a);
        self.built_dt = dt;
    }

    /// Tangential ghost/neighbour value for a u-face (i,j): north (dir=+1) or south (−1).
    #[inline]
    fn u_ns(&self, i: usize, j: usize, north: bool) -> f64 {
        let uc = self.u[self.ui(i, j)];
        if north {
            if j + 1 < self.ny {
                if self.fl(i - 1, j + 1) && self.fl(i, j + 1) {
                    self.u[self.ui(i, j + 1)]
                } else {
                    -uc
                }
            } else if self.top[i - 1].0.free() && self.top[i].0.free() {
                uc
            } else {
                -uc
            }
        } else if j > 0 {
            if self.fl(i - 1, j - 1) && self.fl(i, j - 1) {
                self.u[self.ui(i, j - 1)]
            } else {
                -uc
            }
        } else if self.bottom[i - 1].0.free() && self.bottom[i].0.free() {
            uc
        } else {
            -uc
        }
    }

    #[inline]
    fn v_ew(&self, i: usize, j: usize, east: bool) -> f64 {
        let vc = self.v[self.vi(i, j)];
        if east {
            if i + 1 < self.nx {
                if self.fl(i + 1, j - 1) && self.fl(i + 1, j) {
                    self.v[self.vi(i + 1, j)]
                } else {
                    -vc
                }
            } else if self.right[j - 1].0.free() && self.right[j].0.free() {
                vc
            } else {
                -vc
            }
        } else if i > 0 {
            if self.fl(i - 1, j - 1) && self.fl(i - 1, j) {
                self.v[self.vi(i - 1, j)]
            } else {
                -vc
            }
        } else if self.left[j - 1].0.free() && self.left[j].0.free() {
            vc
        } else {
            -vc
        }
    }


    /// Implicit (backward Euler) momentum predictor for steady pseudo-time
    /// marching: hybrid upwind convection with lagged fluxes, implicit viscous
    /// terms and drag, old pressure gradient and buoyancy on the right-hand side.
    /// The diagonally dominant systems are relaxed with symmetric Gauss–Seidel
    /// sweeps; an exact solve is unnecessary because a converged pseudo-time
    /// state is a fixed point of the sweeps. This removes the viscous step limit
    /// and allows CFL numbers well above one.
    fn predict_implicit(&self, dt: f64, t_cells: Option<&[f64]>) -> (Vec<f64>, Vec<f64>) {
        let (nx, ny, dx, dy) = (self.nx, self.ny, self.dx, self.dy);
        let buoy = self.natural && t_cells.is_some();
        let tc = t_cells.unwrap_or(&[]);
        // Patankar hybrid neighbour coefficients; f = outward flux rate (1/s).
        let a_down = |f: f64, d: f64| -> f64 { (-f).max(d - 0.5 * f).max(0.0) };
        let a_up = |f: f64, d: f64| -> f64 { f.max(d + 0.5 * f).max(0.0) };
        let inv_dt = 1.0 / dt;

        // ---------------- u
        let nu_f = (nx + 1) * ny;
        let mut ap = vec![0.0; nu_f];
        let mut nb = vec![[0.0f64; 4]; nu_f]; // E, W, N, S couplings to active faces
        let mut bb = vec![0.0; nu_f];
        let u = &self.u;
        let v = &self.v;
        for j in 0..ny {
            for i in 1..nx {
                let k = self.ui(i, j);
                if self.uk[k] != ACTIVE {
                    continue;
                }
                let (l, r) = (j * nx + i - 1, j * nx + i);
                let rho = 0.5 * (self.rho[l] + self.rho[r]);
                let c = 0.5 * (self.drag[l] + self.drag[r]) / rho;
                let nu_wall = 0.5 * (self.nuw[l] + self.nuw[r]);
                let (ke, kw) = (self.ui(i + 1, j), self.ui(i - 1, j));
                let fe = 0.5 * (u[k] + u[ke]) / dx;
                let fw = 0.5 * (u[kw] + u[k]) / dx;
                let fnn = 0.5 * (v[self.vi(i - 1, j + 1)] + v[self.vi(i, j + 1)]) / dy;
                let fs = 0.5 * (v[self.vi(i - 1, j)] + v[self.vi(i, j)]) / dy;
                let (ix2, iy2) = (1.0 / (dx * dx), 1.0 / (dy * dy));
                let mut b = u[k] * inv_dt;
                let mut sum_nb = 0.0;
                let mut extra = 0.0;
                let mut dflux = 0.0;
                // east / west (normal direction): neighbours are u faces
                let ae = a_down(fe, self.nue[r] * ix2);
                sum_nb += ae;
                dflux += fe;
                if self.uk[ke] == ACTIVE {
                    nb[k][0] = ae;
                } else {
                    b += ae * u[ke];
                }
                let aw = a_up(fw, self.nue[l] * ix2);
                sum_nb += aw;
                dflux -= fw;
                if self.uk[kw] == ACTIVE {
                    nb[k][1] = aw;
                } else {
                    b += aw * u[kw];
                }
                // north / south (tangential): neighbour face or wall ghost
                if j + 1 < ny && self.fl(i - 1, j + 1) && self.fl(i, j + 1) {
                    let an = a_down(fnn, self.nu_corner(i, j + 1) * iy2);
                    nb[k][2] = an;
                    sum_nb += an;
                    dflux += fnn;
                } else {
                    let free = j + 1 == ny && self.top[i - 1].0.free() && self.top[i].0.free();
                    if !free {
                        extra += 2.0 * nu_wall * iy2;
                    }
                    extra += fnn.max(0.0);
                }
                if j > 0 && self.fl(i - 1, j - 1) && self.fl(i, j - 1) {
                    let as_ = a_up(fs, self.nu_corner(i, j) * iy2);
                    nb[k][3] = as_;
                    sum_nb += as_;
                    dflux -= fs;
                } else {
                    let free = j == 0 && self.bottom[i - 1].0.free() && self.bottom[i].0.free();
                    if !free {
                        extra += 2.0 * nu_wall * iy2;
                    }
                    extra += (-fs).max(0.0);
                }
                if buoy {
                    let tf = 0.5 * (tc[l] + tc[r]);
                    b += -0.5 * (self.beta[l] + self.beta[r]) * (tf - self.tref) * self.gx;
                }
                b -= (self.p[r] - self.p[l]) / (rho * dx);
                let base = inv_dt + c + sum_nb + extra;
                ap[k] = (base + dflux).max(base);
                bb[k] = b;
            }
        }
        let mut us = self.u.clone();
        let nbu = |k: usize| -> [usize; 4] {
            let nxp = nx + 1;
            [k + 1, k.wrapping_sub(1), k + nxp, k.wrapping_sub(nxp)]
        };
        for _ in 0..2 {
            for pass in 0..2 {
                for kk in 0..nu_f {
                    let k = if pass == 0 { kk } else { nu_f - 1 - kk };
                    if ap[k] == 0.0 {
                        continue;
                    }
                    let n4 = nbu(k);
                    let c = &nb[k];
                    let mut s = bb[k];
                    for q in 0..4 {
                        if c[q] != 0.0 {
                            s += c[q] * us[n4[q]];
                        }
                    }
                    us[k] = s / ap[k];
                }
            }
        }

        // ---------------- v
        let nv_f = nx * (ny + 1);
        let mut ap = vec![0.0; nv_f];
        let mut nb = vec![[0.0f64; 4]; nv_f]; // N, S, E, W
        let mut bb = vec![0.0; nv_f];
        for j in 1..ny {
            for i in 0..nx {
                let k = self.vi(i, j);
                if self.vk[k] != ACTIVE {
                    continue;
                }
                let (bc, tcl) = ((j - 1) * nx + i, j * nx + i);
                let rho = 0.5 * (self.rho[bc] + self.rho[tcl]);
                let c = 0.5 * (self.drag[bc] + self.drag[tcl]) / rho;
                let nu_wall = 0.5 * (self.nuw[bc] + self.nuw[tcl]);
                let (kn, ks) = (self.vi(i, j + 1), self.vi(i, j - 1));
                let fnn = 0.5 * (v[k] + v[kn]) / dy;
                let fs = 0.5 * (v[ks] + v[k]) / dy;
                let fe = 0.5 * (u[self.ui(i + 1, j - 1)] + u[self.ui(i + 1, j)]) / dx;
                let fw = 0.5 * (u[self.ui(i, j - 1)] + u[self.ui(i, j)]) / dx;
                let (ix2, iy2) = (1.0 / (dx * dx), 1.0 / (dy * dy));
                let mut b = v[k] * inv_dt;
                let mut sum_nb = 0.0;
                let mut extra = 0.0;
                let mut dflux = 0.0;
                let an = a_down(fnn, self.nue[tcl] * iy2);
                sum_nb += an;
                dflux += fnn;
                if self.vk[kn] == ACTIVE {
                    nb[k][0] = an;
                } else {
                    b += an * v[kn];
                }
                let as_ = a_up(fs, self.nue[bc] * iy2);
                sum_nb += as_;
                dflux -= fs;
                if self.vk[ks] == ACTIVE {
                    nb[k][1] = as_;
                } else {
                    b += as_ * v[ks];
                }
                if i + 1 < nx && self.fl(i + 1, j - 1) && self.fl(i + 1, j) {
                    let ae = a_down(fe, self.nu_corner(i + 1, j) * ix2);
                    nb[k][2] = ae;
                    sum_nb += ae;
                    dflux += fe;
                } else {
                    let free = i + 1 == nx && self.right[j - 1].0.free() && self.right[j].0.free();
                    if !free {
                        extra += 2.0 * nu_wall * ix2;
                    }
                    extra += fe.max(0.0);
                }
                if i > 0 && self.fl(i - 1, j - 1) && self.fl(i - 1, j) {
                    let aw = a_up(fw, self.nu_corner(i, j) * ix2);
                    nb[k][3] = aw;
                    sum_nb += aw;
                    dflux -= fw;
                } else {
                    let free = i == 0 && self.left[j - 1].0.free() && self.left[j].0.free();
                    if !free {
                        extra += 2.0 * nu_wall * ix2;
                    }
                    extra += (-fw).max(0.0);
                }
                if buoy {
                    let tf = 0.5 * (tc[bc] + tc[tcl]);
                    b += -0.5 * (self.beta[bc] + self.beta[tcl]) * (tf - self.tref) * self.gy;
                }
                b -= (self.p[tcl] - self.p[bc]) / (rho * dy);
                let base = inv_dt + c + sum_nb + extra;
                ap[k] = (base + dflux).max(base);
                bb[k] = b;
            }
        }
        let mut vs = self.v.clone();
        let nbv = |k: usize| -> [usize; 4] { [k + nx, k.wrapping_sub(nx), k + 1, k.wrapping_sub(1)] };
        for _ in 0..2 {
            for pass in 0..2 {
                for kk in 0..nv_f {
                    let k = if pass == 0 { kk } else { nv_f - 1 - kk };
                    if ap[k] == 0.0 {
                        continue;
                    }
                    let n4 = nbv(k);
                    let c = &nb[k];
                    let mut s = bb[k];
                    for q in 0..4 {
                        if c[q] != 0.0 {
                            s += c[q] * vs[n4[q]];
                        }
                    }
                    vs[k] = s / ap[k];
                }
            }
        }
        (us, vs)
    }

    /// One projection step. `t_cells`: temperature per cell (for buoyancy).
    /// Returns the relative velocity change, or Err(()) if the step blew up
    /// (state restored).
    pub fn step(&mut self, dt: f64, t_cells: Option<&[f64]>, ctx: &mut Ctx) -> Result<Result<StepInfo, ()>, Error> {
        let (nx, ny, dx, dy) = (self.nx, self.ny, self.dx, self.dy);
        if !self.fans.is_empty() {
            self.update_fans();
        }
        if self.pmat.is_none() || (self.has_porous && ((dt - self.built_dt).abs() > 0.2 * self.built_dt)) {
            self.build_pressure(dt);
        }
        let hyb = |vel: f64, a: f64, b: f64, h: f64, nu: f64| -> f64 {
            // Hybrid scheme: central when the cell Péclet number < 2, else upwind.
            if vel.abs() * h < 2.0 * nu {
                0.5 * (a + b)
            } else if vel > 0.0 {
                a
            } else {
                b
            }
        };
        let buoy = self.natural && t_cells.is_some();
        let tc = t_cells.unwrap_or(&[]);
        let mut us = self.u.clone();
        let mut vs = self.v.clone();
        if self.implicit {
            let (a, b) = self.predict_implicit(dt, t_cells);
            us = a;
            vs = b;
        } else {
        // ---- u predictor
        for j in 0..ny {
            for i in 1..nx {
                let k = self.ui(i, j);
                if self.uk[k] != ACTIVE {
                    continue;
                }
                let (l, r) = (j * nx + i - 1, j * nx + i);
                let rho = 0.5 * (self.rho[l] + self.rho[r]);
                let nu = 0.5 * (self.nue[l] + self.nue[r]);
                let c = 0.5 * (self.drag[l] + self.drag[r]) / rho;
                let uc = self.u[k];
                let nu_wall = 0.5 * (self.nuw[l] + self.nuw[r]);
                let nu_n = if j + 1 < ny && self.fl(i - 1, j + 1) && self.fl(i, j + 1) { self.nu_corner(i, j + 1) } else { nu_wall };
                let nu_s = if j > 0 && self.fl(i - 1, j - 1) && self.fl(i, j - 1) { self.nu_corner(i, j) } else { nu_wall };
                let ue_n = self.u[self.ui(i + 1, j)];
                let uw_n = self.u[self.ui(i - 1, j)];
                let un = self.u_ns(i, j, true);
                let usn = self.u_ns(i, j, false);
                let ue = 0.5 * (uc + ue_n);
                let uw = 0.5 * (uw_n + uc);
                let vn = 0.5 * (self.v[self.vi(i - 1, j + 1)] + self.v[self.vi(i, j + 1)]);
                let vsf = 0.5 * (self.v[self.vi(i - 1, j)] + self.v[self.vi(i, j)]);
                let adv = (ue * hyb(ue, uc, ue_n, dx, nu) - uw * hyb(uw, uw_n, uc, dx, nu)) / dx
                    + (vn * hyb(vn, uc, un, dy, nu) - vsf * hyb(vsf, usn, uc, dy, nu)) / dy;
                let visc = (self.nue[r] * (ue_n - uc) - self.nue[l] * (uc - uw_n)) / (dx * dx)
                    + (nu_n * (un - uc) - nu_s * (uc - usn)) / (dy * dy);
                let mut force = 0.0;
                if buoy {
                    let tf = 0.5 * (tc[l] + tc[r]);
                    force = -0.5 * (self.beta[l] + self.beta[r]) * (tf - self.tref) * self.gx;
                }
                let gp = (self.p[r] - self.p[l]) / (rho * dx);
                us[k] = (uc + dt * (-adv + visc + force - gp)) / (1.0 + dt * c);
            }
        }
        // ---- v predictor
        for j in 1..ny {
            for i in 0..nx {
                let k = self.vi(i, j);
                if self.vk[k] != ACTIVE {
                    continue;
                }
                let (bc, tcl) = ((j - 1) * nx + i, j * nx + i);
                let rho = 0.5 * (self.rho[bc] + self.rho[tcl]);
                let nu = 0.5 * (self.nue[bc] + self.nue[tcl]);
                let c = 0.5 * (self.drag[bc] + self.drag[tcl]) / rho;
                let vc = self.v[k];
                let nu_wall = 0.5 * (self.nuw[bc] + self.nuw[tcl]);
                let nu_e = if i + 1 < nx && self.fl(i + 1, j - 1) && self.fl(i + 1, j) { self.nu_corner(i + 1, j) } else { nu_wall };
                let nu_w = if i > 0 && self.fl(i - 1, j - 1) && self.fl(i - 1, j) { self.nu_corner(i, j) } else { nu_wall };
                let vn_n = self.v[self.vi(i, j + 1)];
                let vs_n = self.v[self.vi(i, j - 1)];
                let ve = self.v_ew(i, j, true);
                let vw = self.v_ew(i, j, false);
                let vn = 0.5 * (vc + vn_n);
                let vsf = 0.5 * (vs_n + vc);
                let ue = 0.5 * (self.u[self.ui(i + 1, j - 1)] + self.u[self.ui(i + 1, j)]);
                let uw = 0.5 * (self.u[self.ui(i, j - 1)] + self.u[self.ui(i, j)]);
                let adv = (vn * hyb(vn, vc, vn_n, dy, nu) - vsf * hyb(vsf, vs_n, vc, dy, nu)) / dy
                    + (ue * hyb(ue, vc, ve, dx, nu) - uw * hyb(uw, vw, vc, dx, nu)) / dx;
                let visc = (nu_e * (ve - vc) - nu_w * (vc - vw)) / (dx * dx)
                    + (self.nue[tcl] * (vn_n - vc) - self.nue[bc] * (vc - vs_n)) / (dy * dy);
                let mut force = 0.0;
                if buoy {
                    let tf = 0.5 * (tc[bc] + tc[tcl]);
                    force = -0.5 * (self.beta[bc] + self.beta[tcl]) * (tf - self.tref) * self.gy;
                }
                let gp = (self.p[tcl] - self.p[bc]) / (rho * dy);
                vs[k] = (vc + dt * (-adv + visc + force - gp)) / (1.0 + dt * c);
            }
        }
        }
        // ---- outlet faces: zero-gradient extrapolation of the predictor
        for j in 0..ny {
            let k0 = self.ui(0, j);
            if self.uk[k0] == OUTLET {
                let k1 = self.ui(1, j);
                us[k0] = if nx > 1 && self.uk[k1] == ACTIVE { us[k1] } else { self.u[k0] };
            }
            let kn = self.ui(nx, j);
            if self.uk[kn] == OUTLET {
                let km = self.ui(nx - 1, j);
                us[kn] = if nx > 1 && self.uk[km] == ACTIVE { us[km] } else { self.u[kn] };
            }
        }
        for i in 0..nx {
            let k0 = self.vi(i, 0);
            if self.vk[k0] == OUTLET {
                let k1 = self.vi(i, 1);
                vs[k0] = if ny > 1 && self.vk[k1] == ACTIVE { vs[k1] } else { self.v[k0] };
            }
            let kn = self.vi(i, ny);
            if self.vk[kn] == OUTLET {
                let km = self.vi(i, ny - 1);
                vs[kn] = if ny > 1 && self.vk[km] == ACTIVE { vs[km] } else { self.v[kn] };
            }
        }
        // ---- pressure correction
        let np = self.np;
        let mut b = vec![0.0; np];
        let mut div2 = 0.0;
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                if !self.fluid[c] {
                    continue;
                }
                let div = (us[self.ui(i + 1, j)] - us[self.ui(i, j)]) / dx + (vs[self.vi(i, j + 1)] - vs[self.vi(i, j)]) / dy;
                b[self.pidx[c] as usize] = -div / dt;
                div2 += div * div;
            }
        }
        // Closed components: make the Neumann problem compatible.
        let ncomp = self.comp_dirichlet.len();
        let mut sum = vec![0.0; ncomp];
        let mut cnt = vec![0usize; ncomp];
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
        let hmin = dx.min(dy);
        let tol = Tol { rel: 1e-12, abs: 1e-6 * uref / (hmin * dt) * (np as f64).sqrt(), max_iter: 3000 };
        // Warm start from the previous correction (smooth in time).
        let ncell = nx * ny;
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
        let mut dp = vec![0.0; np];
        for c in 0..ncell {
            if self.fluid[c] {
                dp[self.pidx[c] as usize] = xf[c];
            }
        }
        // ---- correct velocities and pressure
        let (u_old, v_old, p_old) = (self.u.clone(), self.v.clone(), self.p.clone());
        let pd = |c: usize| -> f64 { dp[self.pidx[c] as usize] };
        for j in 0..ny {
            for i in 0..=nx {
                let k = self.ui(i, j);
                match self.uk[k] {
                    ACTIVE => us[k] -= dt * self.wu[k] * (pd(j * nx + i) - pd(j * nx + i - 1)) / dx,
                    OUTLET => {
                        if i == 0 {
                            us[k] -= dt * self.wu[k] * (pd(j * nx) - 0.0) / (0.5 * dx);
                        } else {
                            us[k] -= dt * self.wu[k] * (0.0 - pd(j * nx + nx - 1)) / (0.5 * dx);
                        }
                    }
                    _ => {}
                }
            }
        }
        for j in 0..=ny {
            for i in 0..nx {
                let k = self.vi(i, j);
                match self.vk[k] {
                    ACTIVE => vs[k] -= dt * self.wv[k] * (pd(j * nx + i) - pd((j - 1) * nx + i)) / dy,
                    OUTLET => {
                        if j == 0 {
                            vs[k] -= dt * self.wv[k] * (pd(i) - 0.0) / (0.5 * dy);
                        } else {
                            vs[k] -= dt * self.wv[k] * (0.0 - pd((ny - 1) * nx + i)) / (0.5 * dy);
                        }
                    }
                    _ => {}
                }
            }
        }
        let mut newp = self.p.clone();
        for c in 0..nx * ny {
            if self.fluid[c] {
                newp[c] += pd(c);
            }
        }
        // ---- sanity / divergence guard
        let mut umax: f64 = 0.0;
        let mut dmax: f64 = 0.0;
        let mut finite = true;
        for k in 0..us.len() {
            if !us[k].is_finite() {
                finite = false;
                break;
            }
            umax = umax.max(us[k].abs());
            dmax = dmax.max((us[k] - u_old[k]).abs());
        }
        for k in 0..vs.len() {
            if !vs[k].is_finite() {
                finite = false;
                break;
            }
            umax = umax.max(vs[k].abs());
            dmax = dmax.max((vs[k] - v_old[k]).abs());
        }
        let limit = 1e3 * uref.max(1e-2);
        if !finite || umax > limit || newp.iter().any(|x| !x.is_finite()) {
            self.u = u_old;
            self.v = v_old;
            self.p = p_old;
            return Ok(Err(()));
        }
        let rms = |a: &[f64], b: &[f64], kinds: &[u8]| -> f64 {
            let (mut s2, mut n) = (0.0, 0usize);
            for k in 0..a.len() {
                if kinds[k] != FIXED {
                    s2 += (a[k] - b[k]) * (a[k] - b[k]);
                    n += 1;
                }
            }
            (s2 / n.max(1) as f64).sqrt() / dt
        };
        let info = StepInfo {
            dmax,
            umax,
            continuity: (div2 / np.max(1) as f64).sqrt(),
            u_res: rms(&us, &u_old, &self.uk),
            v_res: rms(&vs, &v_old, &self.vk),
        };
        self.u = us;
        self.v = vs;
        self.p = newp;
        if self.turb.is_some() {
            self.turb_step(dt);
        }
        Ok(Ok(info))
    }

    /// Advection terms for the energy equation from the current velocities.
    pub fn adv(&self) -> Adv {
        let th = self.th;
        let g = &th.mesh.grid;
        let nx = self.nx;
        let mut face_f = vec![0.0; th.faces.len()];
        for (fi, f) in th.faces.iter().enumerate() {
            if f.axis > 1 {
                continue;
            }
            let (ca, cb) = (th.cell_of[f.a as usize] as usize, th.cell_of[f.b as usize] as usize);
            if !(self.fluid[ca] && self.fluid[cb]) {
                continue;
            }
            let (i, j, _) = g.ijk(ca);
            let vel = if f.axis == 0 { self.u[self.ui(i + 1, j)] } else { self.v[self.vi(i, j + 1)] };
            face_f[fi] = 0.5 * (self.rcp[ca] + self.rcp[cb]) * vel * f.area;
        }
        let mut bnd = Vec::new();
        let amb = th.model.ambient;
        let ax = self.dy * self.depth;
        let ay = self.dx * self.depth;
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
        for j in 0..self.ny {
            if self.uk[self.ui(0, j)] != ACTIVE {
                push(j * nx, -self.u[self.ui(0, j)], ax, self.left[j]);
            }
            push(j * nx + nx - 1, self.u[self.ui(nx, j)], ax, self.right[j]);
        }
        for i in 0..nx {
            push(i, -self.v[self.vi(i, 0)], ay, self.bottom[i]);
            push((self.ny - 1) * nx + i, self.v[self.vi(i, self.ny)], ay, self.top[i]);
        }
        Adv { face_f, bnd }
    }

    /// Cell-centred output, boundary flow metrics and turbulence fields.
    /// `t`: temperature per thermal unknown.
    pub fn output(&self, t: &[f64]) -> FlowOut {
        let n = self.nx * self.ny;
        let mut u = vec![0.0f32; n];
        let mut v = vec![0.0f32; n];
        let mut p = vec![0.0f32; n];
        let mut vmax: f64 = 0.0;
        for j in 0..self.ny {
            for i in 0..self.nx {
                let c = j * self.nx + i;
                if !self.fluid[c] {
                    continue;
                }
                let uc = 0.5 * (self.u[self.ui(i, j)] + self.u[self.ui(i + 1, j)]);
                let vc = 0.5 * (self.v[self.vi(i, j)] + self.v[self.vi(i, j + 1)]);
                u[c] = uc as f32;
                v[c] = vc as f32;
                p[c] = self.p[c] as f32;
                vmax = vmax.max((uc * uc + vc * vc).sqrt());
            }
        }
        let model = self.th.model;
        let nb = model.boundaries.len();
        // Areas of flow-only boundaries (wall / slip) for the report.
        let mut areas = vec![0.0; nb];
        let ax = self.dy * self.depth;
        let ay = self.dx * self.depth;
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
        let nx = self.nx;
        let ny = self.ny;
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
        for j in 0..ny {
            edge(j * nx, self.left[j], ax, self.u[self.ui(0, j)]);
            edge(j * nx + nx - 1, self.right[j], ax, -self.u[self.ui(nx, j)]);
        }
        for i in 0..nx {
            edge(i, self.bottom[i], ay, self.v[self.vi(i, 0)]);
            edge((ny - 1) * nx + i, self.top[i], ay, -self.v[self.vi(i, ny)]);
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
        FlowOut { u, v, p, vmax, areas, metrics, pressure_drop, k, omega, nut, yplus_max, fan_points }
    }
}

fn cells_t(th: &Thermal, t: &[f64]) -> Vec<f64> {
    let mut tc = vec![f64::NAN; th.mesh.grid.n()];
    for u in 0..th.n {
        tc[th.cell_of[u] as usize] = t[u];
    }
    tc
}

/// Conjugate heat transfer study (2D).
pub fn run_cht(th: &Thermal, ctx: &mut Ctx) -> Result<Solution, Error> {
    let study = &th.model.study;
    let mut flow = FlowSolver::new(th);
    if flow.u_inlet > 0.0 && !flow.has_outflow() {
        ctx.warn("An inlet is defined but there is no outlet/open boundary: mass cannot leave the domain");
    }
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
        let lflow = th.model.width.max(th.model.height);
        let mut snap_u = flow.u.clone();
        let mut snap_v = flow.v.clone();
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
        let mut sum_u = vec![0.0; flow.u.len()];
        let mut sum_v = vec![0.0; flow.v.len()];
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
                for (a, b) in sum_u.iter_mut().zip(flow.u.iter()) {
                    *a += b;
                }
                for (a, b) in sum_v.iter_mut().zip(flow.v.iter()) {
                    *a += b;
                }
                for (a, b) in sum_p.iter_mut().zip(flow.p.iter()) {
                    *a += b;
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
                let mut row: Vec<(&str, f64)> = vec![("continuity", info.continuity), ("u", info.u_res), ("v", info.v_res)];
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
                for (a, b) in flow.u.iter().zip(snap_u.iter()).chain(flow.v.iter().zip(snap_v.iter())) {
                    if *a != 0.0 || *b != 0.0 {
                        ss += (a - b) * (a - b);
                        nn += 1;
                    }
                }
                let rms = (ss / nn.max(1) as f64).sqrt();
                wrate = rms / (ptime - snap_t).max(1e-300) * lflow / (uref * uref);
                let snap_t_prev = snap_t;
                wrate_hist.push(wrate);
                snap_u.copy_from_slice(&flow.u);
                snap_v.copy_from_slice(&flow.v);
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
                let _ = steps;
                flow.u = sum_u.iter().map(|x| x * inv).collect();
                flow.v = sum_v.iter().map(|x| x * inv).collect();
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
                let mut row: Vec<(&str, f64)> = vec![("T", tr)];
                if flow_steps > 0 {
                    row.push(("continuity", last_info.continuity));
                    row.push(("u", last_info.u_res));
                    row.push(("v", last_info.v_res));
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
