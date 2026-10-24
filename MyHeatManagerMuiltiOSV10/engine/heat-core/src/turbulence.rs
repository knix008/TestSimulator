//! k-ω SST turbulence model (Menter 2003) for the 2D MAC flow solver.
//!
//! * k and ω are cell-centred in pure fluid cells (porous cells stay laminar,
//!   νt = 0, and act as zero-gradient neighbours).
//! * Transport is implicit (backward Euler with the flow step, first-order
//!   upwind convection with the MAC face velocities, harmonic-free mean face
//!   diffusivities); production is explicit, destruction implicit, the
//!   cross-diffusion term explicit when positive and implicit otherwise. The
//!   5-point systems are relaxed with symmetric Gauss–Seidel sweeps.
//! * Near walls an automatic treatment fixes ω in the wall-adjacent cell to
//!   √(ω_vis² + ω_log²) with ω_vis = 6ν/(β1 y²) and ω_log = √k/(Cμ^¼ κ y)
//!   (y = half cell); the momentum wall shear switches to the log-law wall
//!   function (effective wall viscosity u_τ κ y / ln(E y+)) when y+ > 11.06,
//!   and the energy equation then uses ρcp·ν_w/Prt as wall conductivity.
//! * νt = a1 k / max(a1 ω, S F2).

use crate::flow::FlowSolver;

pub const PRT: f64 = 0.85;
const A1: f64 = 0.31;
const BETA_STAR: f64 = 0.09;
const SIGMA_K1: f64 = 0.85;
const SIGMA_W1: f64 = 0.5;
const BETA1: f64 = 0.075;
const ALPHA1: f64 = 5.0 / 9.0;
const SIGMA_K2: f64 = 1.0;
const SIGMA_W2: f64 = 0.856;
const BETA2: f64 = 0.0828;
const ALPHA2: f64 = 0.44;
const KAPPA: f64 = 0.41;
const E_WALL: f64 = 9.8;
const CMU25: f64 = 0.5477225575051661; // 0.09^0.25
const YPLUS_LAM: f64 = 11.06;

pub struct Turb {
    pub k: Vec<f64>,
    pub w: Vec<f64>,
    pub nut: Vec<f64>,
    /// Cells in which k-ω is solved (pure fluid).
    pub act: Vec<bool>,
    /// Distance to the nearest wall (m).
    pub dwall: Vec<f64>,
    /// Half-cell distance to an adjacent wall face (0 = not wall-adjacent).
    pub wall_y: Vec<f64>,
    /// Inlet (k, ω) per model boundary.
    pub inlet: Vec<Option<(f64, f64)>>,
    pub k_amb: f64,
    pub w_amb: f64,
    pub yplus_max: f64,
    pub res_k: f64,
    pub res_w: f64,
}

/// What lies across one face of an active cell (for the k-ω equations).
#[derive(Clone, Copy, PartialEq)]
enum Side {
    Cell(usize),
    /// Flowing but not active (porous): zero gradient, outflow only.
    Porous,
    Wall,
    Free,
    Inlet(i64),
    Outflow,
}

impl<'a> FlowSolver<'a> {
    /// Classify the face of cell (i, j) in direction d (0 W, 1 E, 2 S, 3 N).
    fn turb_side(&self, tb: &Turb, i: usize, j: usize, d: usize) -> Side {
        let (nx, ny) = (self.nx, self.ny);
        let nb = match d {
            0 => (i > 0).then(|| j * nx + i - 1),
            1 => (i + 1 < nx).then(|| j * nx + i + 1),
            2 => (j > 0).then(|| (j - 1) * nx + i),
            _ => (j + 1 < ny).then(|| (j + 1) * nx + i),
        };
        match nb {
            Some(c) => {
                if tb.act[c] {
                    Side::Cell(c)
                } else if self.fluid[c] {
                    Side::Porous
                } else {
                    Side::Wall
                }
            }
            None => {
                let e = match d {
                    0 => self.left[j],
                    1 => self.right[j],
                    2 => self.bottom[i],
                    _ => self.top[i],
                };
                use crate::flow::FBcKind;
                match self.fbc_kind(e.0) {
                    FBcKind::Wall => Side::Wall,
                    FBcKind::Slip => Side::Free,
                    FBcKind::Inlet => Side::Inlet(e.1),
                    FBcKind::Outflow => Side::Outflow,
                }
            }
        }
    }

    /// Set up k-ω: active cells, wall distance, inlet values, initial field.
    pub(crate) fn init_turbulence(&mut self) {
        let (nx, ny, dx, dy) = (self.nx, self.ny, self.dx, self.dy);
        let n = nx * ny;
        let model = self.th.model;
        let act: Vec<bool> = (0..n).map(|c| self.fluid[c] && self.drag[c] == 0.0).collect();
        // Inlet turbulence per boundary: opening length → hydraulic diameter 2·L.
        let nb = model.boundaries.len();
        let mut open_len = vec![0.0; nb];
        let mut uin = vec![0.0f64; nb];
        for (list, h) in [(&self.left, dy), (&self.right, dy), (&self.bottom, dx), (&self.top, dx)] {
            for &(bc, bi) in list.iter() {
                if bi >= 0 {
                    if let crate::flow::FBcKind::Inlet = self.fbc_kind(bc) {
                        open_len[bi as usize] += h;
                        uin[bi as usize] = match bc {
                            crate::flow::FBc::Inlet(v, _) => v.abs(),
                            _ => model.boundaries[bi as usize].velocity.abs(),
                        };
                    }
                }
            }
        }
        let mut inlet = vec![None; nb];
        let mut uref: f64 = 0.0;
        for bi in 0..nb {
            if open_len[bi] > 0.0 {
                let b = &model.boundaries[bi];
                let k = 1.5 * (b.turb_intensity * uin[bi]).powi(2);
                let l = b.mixing_length.unwrap_or(0.07 * 2.0 * open_len[bi]);
                let w = k.sqrt() / (CMU25 * l);
                inlet[bi] = Some((k.max(1e-12), w.max(1e-6)));
                uref = uref.max(uin[bi]);
            }
        }
        if uref == 0.0 {
            uref = 0.1;
        }
        let lchar = (dx * nx as f64).min(dy * ny as f64);
        let k_amb = 1.5 * (0.05 * uref).powi(2);
        let w_amb = k_amb.sqrt() / (CMU25 * 0.07 * lchar);
        // Wall faces and wall distance (nearest-wall-point propagation).
        let mut tb = Turb {
            k: vec![0.0; n],
            w: vec![0.0; n],
            nut: vec![0.0; n],
            act,
            dwall: vec![f64::INFINITY; n],
            wall_y: vec![0.0; n],
            inlet,
            k_amb,
            w_amb,
            yplus_max: 0.0,
            res_k: 0.0,
            res_w: 0.0,
        };
        let mut near: Vec<Option<(f64, f64)>> = vec![None; n];
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                if !tb.act[c] {
                    continue;
                }
                let (xc, yc) = ((i as f64 + 0.5) * dx, (j as f64 + 0.5) * dy);
                let mut y = f64::INFINITY;
                for d in 0..4 {
                    if self.turb_side(&tb, i, j, d) == Side::Wall {
                        let (px, py, hh) = match d {
                            0 => (xc - 0.5 * dx, yc, 0.5 * dx),
                            1 => (xc + 0.5 * dx, yc, 0.5 * dx),
                            2 => (xc, yc - 0.5 * dy, 0.5 * dy),
                            _ => (xc, yc + 0.5 * dy, 0.5 * dy),
                        };
                        if hh < y {
                            y = hh;
                            near[c] = Some((px, py));
                        }
                    }
                }
                if y.is_finite() {
                    tb.wall_y[c] = y;
                    tb.dwall[c] = y;
                }
            }
        }
        // Raster sweeps propagating the nearest wall point (Danielsson-style).
        for _pass in 0..(4 + 2 * (nx + ny).min(200)) {
            let mut changed = false;
            for dir in 0..2 {
                for jj in 0..ny {
                    for ii in 0..nx {
                        let (i, j) = if dir == 0 { (ii, jj) } else { (nx - 1 - ii, ny - 1 - jj) };
                        let c = j * nx + i;
                        if !tb.act[c] {
                            continue;
                        }
                        let (xc, yc) = ((i as f64 + 0.5) * dx, (j as f64 + 0.5) * dy);
                        for (di, dj) in [(-1i64, 0i64), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)] {
                            let (ni, nj) = (i as i64 + di, j as i64 + dj);
                            if ni < 0 || nj < 0 || ni >= nx as i64 || nj >= ny as i64 {
                                continue;
                            }
                            let nc = nj as usize * nx + ni as usize;
                            if let Some((px, py)) = near[nc] {
                                let d = ((xc - px).powi(2) + (yc - py).powi(2)).sqrt();
                                if d < tb.dwall[c] - 1e-15 {
                                    tb.dwall[c] = d;
                                    near[c] = Some((px, py));
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
            if !changed {
                break;
            }
        }
        let big = 1e3 * (dx * nx as f64).max(dy * ny as f64);
        for c in 0..n {
            if !tb.dwall[c].is_finite() {
                tb.dwall[c] = big;
            }
            if tb.act[c] {
                tb.k[c] = k_amb;
                tb.w[c] = w_amb;
            }
        }
        self.turb = Some(tb);
        self.update_eddy_viscosity();
    }

    /// νt, wall viscosities and the energy-equation turbulent conductivity.
    fn update_eddy_viscosity(&mut self) {
        let tb = self.turb.take().unwrap();
        let (nx, ny) = (self.nx, self.ny);
        let s2 = self.strain2(&tb);
        let mut nut = vec![0.0; nx * ny];
        let mut nue_max: f64 = 0.0;
        for c in 0..nx * ny {
            self.nue[c] = self.nu[c];
            self.nuw[c] = self.nu[c];
            if !tb.act[c] {
                continue;
            }
            let (k, w, d, nu) = (tb.k[c], tb.w[c], tb.dwall[c], self.nu[c]);
            let arg2 = (2.0 * k.sqrt() / (BETA_STAR * w * d)).max(500.0 * nu / (d * d * w));
            let f2 = (arg2 * arg2).tanh();
            let v = (A1 * k / (A1 * w).max(s2[c].sqrt() * f2)).min(1e5 * nu).max(0.0);
            nut[c] = v;
            self.nue[c] = nu + v;
            nue_max = nue_max.max(nu + v);
        }
        self.nue_max = nue_max;
        // Wall treatment and y+.
        let mut yplus_max: f64 = 0.0;
        let th = self.th;
        let mut turb_k = vec![0.0; th.n];
        let mut turb_kw = vec![0.0; th.n];
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                if !tb.act[c] {
                    continue;
                }
                let u = th.unk[c];
                if u != u32::MAX {
                    turb_k[u as usize] = self.rcp[c] * nut[c] / PRT;
                }
                let y = tb.wall_y[c];
                if y <= 0.0 {
                    continue;
                }
                let nu = self.nu[c];
                let uc = 0.5 * (self.u[self.ui(i, j)] + self.u[self.ui(i + 1, j)]);
                let vc = 0.5 * (self.v[self.vi(i, j)] + self.v[self.vi(i, j + 1)]);
                let speed = (uc * uc + vc * vc).sqrt();
                let ut_k = CMU25 * tb.k[c].sqrt();
                let yp_k = y * ut_k / nu;
                let nuw = if yp_k > YPLUS_LAM { (ut_k * KAPPA * y / (E_WALL * yp_k).ln()).max(nu) } else { nu };
                self.nuw[c] = nuw;
                let utau = (nuw * speed / y).sqrt();
                yplus_max = yplus_max.max(y * utau / nu);
                if yp_k > YPLUS_LAM && u != u32::MAX {
                    // log-law wall conductivity (Reynolds analogy, P-function neglected)
                    let kf = th.conductivity_laminar(u as usize);
                    turb_kw[u as usize] = (self.rcp[c] * nuw / PRT - kf).max(0.0);
                }
            }
        }
        // Faces of non-wall cells never face a wall: keep wall = interior there.
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                let u = th.unk[c];
                if u != u32::MAX && tb.wall_y[c] <= 0.0 {
                    turb_kw[u as usize] = turb_k[u as usize];
                }
            }
        }
        *th.turb_k.borrow_mut() = turb_k;
        *th.turb_k_wall.borrow_mut() = turb_kw;
        let mut tb = tb;
        tb.nut = nut;
        tb.yplus_max = yplus_max;
        self.turb = Some(tb);
    }

    /// Cell-centred strain-rate magnitude squared S² = 2 Sij Sij.
    fn strain2(&self, tb: &Turb) -> Vec<f64> {
        let (nx, ny, dx, dy) = (self.nx, self.ny, self.dx, self.dy);
        let n = nx * ny;
        let mut uc = vec![0.0; n];
        let mut vc = vec![0.0; n];
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                uc[c] = 0.5 * (self.u[self.ui(i, j)] + self.u[self.ui(i + 1, j)]);
                vc[c] = 0.5 * (self.v[self.vi(i, j)] + self.v[self.vi(i, j + 1)]);
            }
        }
        let mut s2 = vec![0.0; n];
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                if !tb.act[c] {
                    continue;
                }
                let dudx = (self.u[self.ui(i + 1, j)] - self.u[self.ui(i, j)]) / dx;
                let dvdy = (self.v[self.vi(i, j + 1)] - self.v[self.vi(i, j)]) / dy;
                // tangential gradients with wall (0 at the face) / free (zero-gradient) sides
                let val = |d: usize, comp: &[f64], h: f64| -> (f64, f64) {
                    match self.turb_side(tb, i, j, d) {
                        Side::Cell(nc) => (comp[nc], h),
                        Side::Porous => {
                            let nc = match d {
                                0 => c - 1,
                                1 => c + 1,
                                2 => c - nx,
                                _ => c + nx,
                            };
                            (comp[nc], h)
                        }
                        Side::Wall | Side::Inlet(_) => (0.0, 0.5 * h),
                        Side::Free | Side::Outflow => (comp[c], 0.5 * h),
                    }
                };
                let (un, dn) = val(3, &uc, dy);
                let (us, ds) = val(2, &uc, dy);
                let (ve, de) = val(1, &vc, dx);
                let (vw, dw) = val(0, &vc, dx);
                let dudy = (un - us) / (dn + ds);
                let dvdx = (ve - vw) / (de + dw);
                s2[c] = 2.0 * (dudx * dudx + dvdy * dvdy) + (dudy + dvdx).powi(2);
            }
        }
        s2
    }

    /// Advance k and ω by one (pseudo-)time step dt with the current velocities.
    pub(crate) fn turb_step(&mut self, dt: f64) {
        let mut tb = self.turb.take().unwrap();
        let (nx, ny, dx, dy) = (self.nx, self.ny, self.dx, self.dy);
        let n = nx * ny;
        let s2 = self.strain2(&tb);
        let (k0, w0) = (tb.k.clone(), tb.w.clone());
        // Blending functions and cross diffusion.
        let mut f1 = vec![0.0; n];
        let mut cd = vec![0.0; n];
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                if !tb.act[c] {
                    continue;
                }
                let g = |f: &[f64], d0: usize, d1: usize, h: f64| -> f64 {
                    let a = match self.turb_side(&tb, i, j, d0) {
                        Side::Cell(nc) => f[nc],
                        _ => f[c],
                    };
                    let b = match self.turb_side(&tb, i, j, d1) {
                        Side::Cell(nc) => f[nc],
                        _ => f[c],
                    };
                    (b - a) / (2.0 * h)
                };
                let dkdx = g(&k0, 0, 1, dx);
                let dkdy = g(&k0, 2, 3, dy);
                let dwdx = g(&w0, 0, 1, dx);
                let dwdy = g(&w0, 2, 3, dy);
                let (k, w, d, nu) = (k0[c], w0[c], tb.dwall[c], self.nu[c]);
                let cdkw = (2.0 * SIGMA_W2 / w * (dkdx * dwdx + dkdy * dwdy)).max(1e-20);
                let arg1 = ((k.sqrt() / (BETA_STAR * w * d)).max(500.0 * nu / (d * d * w))).min(4.0 * SIGMA_W2 * k / (cdkw * d * d));
                f1[c] = (arg1.powi(4)).tanh();
                cd[c] = 2.0 * (1.0 - f1[c]) * SIGMA_W2 / w * (dkdx * dwdx + dkdy * dwdy);
            }
        }
        let blend = |f: f64, a: f64, b: f64| f * a + (1.0 - f) * b;
        let inv_dt = 1.0 / dt;
        // Assemble and relax both equations.
        for eq in 0..2 {
            let mut ap = vec![0.0; n];
            let mut anb = vec![[0.0f64; 4]; n];
            let mut bb = vec![0.0; n];
            let phi_old = if eq == 0 { &k0 } else { &w0 };
            let amb = if eq == 0 { tb.k_amb } else { tb.w_amb };
            for j in 0..ny {
                for i in 0..nx {
                    let c = j * nx + i;
                    if !tb.act[c] {
                        continue;
                    }
                    let (k, w, nu) = (k0[c], w0[c], self.nu[c]);
                    if eq == 1 && tb.wall_y[c] > 0.0 {
                        // automatic near-wall ω
                        let y = tb.wall_y[c];
                        let wv = 6.0 * nu / (BETA1 * y * y);
                        let wl = k.sqrt() / (CMU25 * KAPPA * y);
                        ap[c] = 1.0;
                        bb[c] = (wv * wv + wl * wl).sqrt();
                        continue;
                    }
                    let sig = |cc: usize| -> f64 {
                        if eq == 0 {
                            blend(f1[cc], SIGMA_K1, SIGMA_K2)
                        } else {
                            blend(f1[cc], SIGMA_W1, SIGMA_W2)
                        }
                    };
                    let gam_c = nu + sig(c) * tb.nut[c];
                    let mut a_p = inv_dt;
                    let mut b = phi_old[c] * inv_dt;
                    // outward flux rates (1/s) for W, E, S, N
                    let fo = [
                        -self.u[self.ui(i, j)] / dx,
                        self.u[self.ui(i + 1, j)] / dx,
                        -self.v[self.vi(i, j)] / dy,
                        self.v[self.vi(i, j + 1)] / dy,
                    ];
                    for d in 0..4 {
                        let h = if d < 2 { dx } else { dy };
                        let f = fo[d];
                        match self.turb_side(&tb, i, j, d) {
                            Side::Cell(nc) => {
                                let gam = 0.5 * (gam_c + self.nu[nc] + sig(nc) * tb.nut[nc]);
                                let dif = gam / (h * h);
                                anb[c][d] = dif + (-f).max(0.0);
                                a_p += dif + f.max(0.0);
                            }
                            Side::Porous | Side::Free => a_p += f.max(0.0),
                            Side::Wall => {
                                if eq == 0 {
                                    a_p += 2.0 * gam_c / (h * h); // k = 0 at the wall
                                }
                            }
                            Side::Inlet(bi) => {
                                let val = if bi >= 0 {
                                    tb.inlet[bi as usize].map(|kw| if eq == 0 { kw.0 } else { kw.1 }).unwrap_or(amb)
                                } else {
                                    amb
                                };
                                let dif = 2.0 * gam_c / (h * h);
                                a_p += dif + f.max(0.0);
                                b += dif * val + (-f).max(0.0) * val;
                            }
                            Side::Outflow => {
                                a_p += f.max(0.0);
                                b += (-f).max(0.0) * amb;
                            }
                        }
                    }
                    // sources
                    let pk = tb.nut[c] * s2[c];
                    let pk_lim = pk.min(10.0 * BETA_STAR * k * w);
                    if eq == 0 {
                        b += pk_lim;
                        a_p += BETA_STAR * w;
                    } else {
                        let alpha = blend(f1[c], ALPHA1, ALPHA2);
                        let beta = blend(f1[c], BETA1, BETA2);
                        let pw = if pk <= 10.0 * BETA_STAR * k * w || tb.nut[c] <= 0.0 {
                            alpha * s2[c]
                        } else {
                            alpha * pk_lim / tb.nut[c]
                        };
                        b += pw;
                        a_p += beta * w;
                        if cd[c] > 0.0 {
                            b += cd[c];
                        } else {
                            a_p += -cd[c] / w;
                        }
                    }
                    ap[c] = a_p;
                    bb[c] = b;
                }
            }
            // Symmetric Gauss–Seidel.
            let x = if eq == 0 { &mut tb.k } else { &mut tb.w };
            let offs = [usize::MAX, 1, usize::MAX, nx]; // placeholder (W/S computed below)
            let _ = offs;
            for sweep in 0..6 {
                for idx in 0..n {
                    let c = if sweep % 2 == 0 { idx } else { n - 1 - idx };
                    if ap[c] == 0.0 {
                        continue;
                    }
                    let a = &anb[c];
                    let mut s = bb[c];
                    if a[0] != 0.0 {
                        s += a[0] * x[c - 1];
                    }
                    if a[1] != 0.0 {
                        s += a[1] * x[c + 1];
                    }
                    if a[2] != 0.0 {
                        s += a[2] * x[c - nx];
                    }
                    if a[3] != 0.0 {
                        s += a[3] * x[c + nx];
                    }
                    x[c] = s / ap[c];
                }
            }
            let floor = if eq == 0 { 1e-10 * tb.k_amb.max(1e-12) } else { 1e-6 * tb.w_amb.max(1e-6) };
            for c in 0..n {
                if tb.act[c] && !(x[c] >= floor) {
                    x[c] = floor; // also catches NaN
                }
            }
        }
        let rms = |a: &[f64], b: &[f64]| -> f64 {
            let (mut s, mut m) = (0.0, 0usize);
            for c in 0..n {
                if tb.act[c] {
                    s += (a[c] - b[c]).powi(2);
                    m += 1;
                }
            }
            (s / m.max(1) as f64).sqrt() / dt
        };
        tb.res_k = rms(&tb.k, &k0);
        tb.res_w = rms(&tb.w, &w0);
        self.turb = Some(tb);
        self.update_eddy_viscosity();
    }
}
