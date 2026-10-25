//! k-ω SST turbulence model (Menter 2003) for the MAC flow solver (2D and 3D).
//!
//! * k and ω are cell-centred in pure fluid cells (porous cells stay laminar,
//!   νt = 0, and act as zero-gradient neighbours).
//! * Transport is implicit (backward Euler with the flow step, first-order
//!   upwind convection with the MAC face velocities, harmonic-free mean face
//!   diffusivities); production is explicit, destruction implicit, the
//!   cross-diffusion term explicit when positive and implicit otherwise. The
//!   5-point (2D) / 7-point (3D) systems are relaxed with symmetric
//!   Gauss–Seidel sweeps.
//! * Near walls an automatic treatment fixes ω in the wall-adjacent cell to
//!   √(ω_vis² + ω_log²) with ω_vis = 6ν/(β1 y²) and ω_log = √k/(Cμ^¼ κ y)
//!   (y = half cell); the momentum wall shear switches to the log-law wall
//!   function (effective wall viscosity u_τ κ y / ln(E y+)) when y+ > 11.06,
//!   and the energy equation then uses ρcp·ν_w/Prt as wall conductivity.
//! * νt = a1 k / max(a1 ω, S F2), S² = 2 Sij Sij (full 3D tensor in 3D).
//! * Wall distance: nearest wall-face point propagated by raster sweeps over
//!   the 8 (2D) / 26 (3D) neighbours.

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
    Porous(usize),
    Wall,
    Free,
    Inlet(i64),
    Outflow,
}

impl<'a> FlowSolver<'a> {
    /// Neighbour cell of c (coordinates q) across direction d (0..6 =
    /// −x, +x, −y, +y, −z, +z), None on the domain edge.
    #[inline]
    fn nbr(&self, c: usize, q: [usize; 3], d: usize) -> Option<usize> {
        let a = d / 2;
        if d % 2 == 0 {
            (q[a] > 0).then(|| c - self.cs[a])
        } else {
            (q[a] + 1 < self.n3[a]).then(|| c + self.cs[a])
        }
    }

    /// Classify the face of cell c in direction d.
    fn turb_side(&self, tb: &Turb, c: usize, q: [usize; 3], d: usize) -> Side {
        match self.nbr(c, q, d) {
            Some(nc) => {
                if tb.act[nc] {
                    Side::Cell(nc)
                } else if self.fluid[nc] {
                    Side::Porous(nc)
                } else {
                    Side::Wall
                }
            }
            None => {
                let e = self.edge(d, q);
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

    /// Outward flux rate (1/s) through face d of cell q: ±velocity / h.
    #[inline]
    fn out_rate(&self, q: [usize; 3], d: usize) -> f64 {
        let a = d / 2;
        let mut qf = q;
        if d % 2 == 1 {
            qf[a] += 1;
        }
        let v = self.vel[a][self.fidx(a, qf)];
        if d % 2 == 0 {
            -v / self.h[a]
        } else {
            v / self.h[a]
        }
    }

    /// Set up k-ω: active cells, wall distance, inlet values, initial field.
    pub(crate) fn init_turbulence(&mut self) {
        let (nx, ny, nz) = (self.nx, self.ny, self.nz);
        let h = self.h;
        let n = nx * ny * nz;
        let ndir = self.ndir();
        let model = self.th.model;
        let act: Vec<bool> = (0..n).map(|c| self.fluid[c] && self.drag[c] == 0.0).collect();
        // Inlet turbulence per boundary. Hydraulic diameter of the opening:
        // 2D: parallel plates, 2 × the opening length; 3D: 2A/(a + b) with the
        // opening area A and the extents a, b of its bounding box (a square
        // duct face gives its side, a wide slot twice its height).
        let nb = model.boundaries.len();
        let mut open_len = vec![0.0; nb];
        let mut area = vec![0.0; nb];
        let mut bbox = vec![[f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY]; nb];
        let mut uin = vec![0.0f64; nb];
        for d in 0..ndir {
            let a = d / 2;
            let (t1, t2) = match a {
                0 => (1, 2),
                1 => (0, 2),
                _ => (0, 1),
            };
            let n1 = self.n3[t1];
            for (l, &(bc, bi)) in self.ebc[d].iter().enumerate() {
                if bi < 0 {
                    continue;
                }
                if let crate::flow::FBcKind::Inlet = self.fbc_kind(bc) {
                    let b = bi as usize;
                    open_len[b] += h[t1];
                    area[b] += self.face_area(a);
                    let (s1, s2) = ((l % n1) as f64, (l / n1) as f64);
                    let bx = &mut bbox[b];
                    bx[0] = bx[0].min(s1 * h[t1]);
                    bx[1] = bx[1].max((s1 + 1.0) * h[t1]);
                    bx[2] = bx[2].min(s2 * h[t2]);
                    bx[3] = bx[3].max((s2 + 1.0) * h[t2]);
                    uin[b] = match bc {
                        crate::flow::FBc::Inlet(v, _) => v.abs(),
                        _ => model.boundaries[b].velocity.abs(),
                    };
                }
            }
        }
        let mut inlet = vec![None; nb];
        let mut uref: f64 = 0.0;
        for bi in 0..nb {
            if open_len[bi] > 0.0 {
                let b = &model.boundaries[bi];
                let k = 1.5 * (b.turb_intensity * uin[bi]).powi(2);
                let l0 = if self.d3 {
                    let bx = bbox[bi];
                    0.07 * (2.0 * area[bi] / ((bx[1] - bx[0]) + (bx[3] - bx[2])))
                } else {
                    0.07 * 2.0 * open_len[bi]
                };
                let l = b.mixing_length.unwrap_or(l0);
                let w = k.sqrt() / (CMU25 * l);
                inlet[bi] = Some((k.max(1e-12), w.max(1e-6)));
                uref = uref.max(uin[bi]);
            }
        }
        if uref == 0.0 {
            uref = 0.1;
        }
        let mut lchar = (h[0] * nx as f64).min(h[1] * ny as f64);
        if self.d3 {
            lchar = lchar.min(h[2] * nz as f64);
        }
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
        let mut near: Vec<Option<[f64; 3]>> = vec![None; n];
        for c in 0..n {
            if !tb.act[c] {
                continue;
            }
            let q = self.cq(c);
            let xc = [(q[0] as f64 + 0.5) * h[0], (q[1] as f64 + 0.5) * h[1], (q[2] as f64 + 0.5) * h[2]];
            let mut y = f64::INFINITY;
            for d in 0..ndir {
                if self.turb_side(&tb, c, q, d) == Side::Wall {
                    let a = d / 2;
                    let hh = 0.5 * h[a];
                    let mut pt = xc;
                    pt[a] += if d % 2 == 0 { -hh } else { hh };
                    if hh < y {
                        y = hh;
                        near[c] = Some(pt);
                    }
                }
            }
            if y.is_finite() {
                tb.wall_y[c] = y;
                tb.dwall[c] = y;
            }
        }
        // Raster sweeps propagating the nearest wall point (Danielsson-style).
        // In-plane neighbours first (in the order of the 2D solver), then the
        // layers below and above (3D).
        let plane = [(-1i64, 0i64), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)];
        let mut offs: Vec<[i64; 3]> = plane.iter().map(|&(di, dj)| [di, dj, 0]).collect();
        if self.d3 {
            for dk in [-1i64, 1] {
                offs.push([0, 0, dk]);
                offs.extend(plane.iter().map(|&(di, dj)| [di, dj, dk]));
            }
        }
        let span = (nx + ny + if self.d3 { nz } else { 0 }).min(200);
        for _pass in 0..(4 + 2 * span) {
            let mut changed = false;
            for dir in 0..2 {
                for idx in 0..n {
                    let c = if dir == 0 { idx } else { n - 1 - idx };
                    if !tb.act[c] {
                        continue;
                    }
                    let q = self.cq(c);
                    let xc = [(q[0] as f64 + 0.5) * h[0], (q[1] as f64 + 0.5) * h[1], (q[2] as f64 + 0.5) * h[2]];
                    for o in &offs {
                        let (ni, nj, nk) = (q[0] as i64 + o[0], q[1] as i64 + o[1], q[2] as i64 + o[2]);
                        if ni < 0 || nj < 0 || nk < 0 || ni >= nx as i64 || nj >= ny as i64 || nk >= nz as i64 {
                            continue;
                        }
                        let nc = self.cidx([ni as usize, nj as usize, nk as usize]);
                        if let Some(pt) = near[nc] {
                            let d = ((xc[0] - pt[0]).powi(2) + (xc[1] - pt[1]).powi(2) + (xc[2] - pt[2]).powi(2)).sqrt();
                            if d < tb.dwall[c] - 1e-15 {
                                tb.dwall[c] = d;
                                near[c] = Some(pt);
                                changed = true;
                            }
                        }
                    }
                }
            }
            if !changed {
                break;
            }
        }
        let mut big = (h[0] * nx as f64).max(h[1] * ny as f64);
        if self.d3 {
            big = big.max(h[2] * nz as f64);
        }
        let big = 1e3 * big;
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
        let n = self.nx * self.ny * self.nz;
        let s2 = self.strain2(&tb);
        let mut nut = vec![0.0; n];
        let mut nue_max: f64 = 0.0;
        for c in 0..n {
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
        for c in 0..n {
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
            let [uc, vc, wc] = self.cell_velocity(c);
            let speed = if self.d3 { (uc * uc + vc * vc + wc * wc).sqrt() } else { (uc * uc + vc * vc).sqrt() };
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
        // Faces of non-wall cells never face a wall: keep wall = interior there.
        for c in 0..n {
            let u = th.unk[c];
            if u != u32::MAX && tb.wall_y[c] <= 0.0 {
                turb_kw[u as usize] = turb_k[u as usize];
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
        let n = self.nx * self.ny * self.nz;
        let nc = self.ncomp();
        let mut vc: [Vec<f64>; 3] = [vec![0.0; n], vec![0.0; n], vec![0.0; if self.d3 { n } else { 0 }]];
        for c in 0..n {
            let v = self.cell_velocity(c);
            for a in 0..nc {
                vc[a][c] = v[a];
            }
        }
        let mut s2 = vec![0.0; n];
        for c in 0..n {
            if !tb.act[c] {
                continue;
            }
            let q = self.cq(c);
            // normal gradients from the face velocities
            let mut gn = [0.0f64; 3];
            for a in 0..nc {
                let f = self.fidx(a, q);
                gn[a] = (self.vel[a][f + self.fstr[a][a]] - self.vel[a][f]) / self.h[a];
            }
            // tangential gradient d(comp)/d(axis b) with wall (0 at the face) /
            // free (zero-gradient) sides
            let grad = |comp: usize, b: usize| -> f64 {
                let h = self.h[b];
                let val = |d: usize| -> (f64, f64) {
                    match self.turb_side(tb, c, q, d) {
                        Side::Cell(o) | Side::Porous(o) => (vc[comp][o], h),
                        Side::Wall | Side::Inlet(_) => (0.0, 0.5 * h),
                        Side::Free | Side::Outflow => (vc[comp][c], 0.5 * h),
                    }
                };
                let (vp, dp) = val(2 * b + 1);
                let (vm, dm) = val(2 * b);
                (vp - vm) / (dp + dm)
            };
            let dudy = grad(0, 1);
            let dvdx = grad(1, 0);
            s2[c] = 2.0 * (gn[0] * gn[0] + gn[1] * gn[1]) + (dudy + dvdx).powi(2);
            if self.d3 {
                let (dudz, dwdx, dvdz, dwdy) = (grad(0, 2), grad(2, 0), grad(1, 2), grad(2, 1));
                s2[c] += 2.0 * gn[2] * gn[2] + (dudz + dwdx).powi(2) + (dvdz + dwdy).powi(2);
            }
        }
        s2
    }

    /// Advance k and ω by one (pseudo-)time step dt with the current velocities.
    pub(crate) fn turb_step(&mut self, dt: f64) {
        let mut tb = self.turb.take().unwrap();
        let n = self.nx * self.ny * self.nz;
        let ndir = self.ndir();
        let nc = self.ncomp();
        let s2 = self.strain2(&tb);
        let (k0, w0) = (tb.k.clone(), tb.w.clone());
        // Blending functions and cross diffusion.
        let mut f1 = vec![0.0; n];
        let mut cd = vec![0.0; n];
        for c in 0..n {
            if !tb.act[c] {
                continue;
            }
            let q = self.cq(c);
            let g = |f: &[f64], b: usize| -> f64 {
                let a = match self.turb_side(&tb, c, q, 2 * b) {
                    Side::Cell(o) => f[o],
                    _ => f[c],
                };
                let bb = match self.turb_side(&tb, c, q, 2 * b + 1) {
                    Side::Cell(o) => f[o],
                    _ => f[c],
                };
                (bb - a) / (2.0 * self.h[b])
            };
            let mut kw = 0.0;
            for b in 0..nc {
                let t = g(&k0, b) * g(&w0, b);
                kw = if b == 0 { t } else { kw + t };
            }
            let (k, w, d, nu) = (k0[c], w0[c], tb.dwall[c], self.nu[c]);
            let cdkw = (2.0 * SIGMA_W2 / w * kw).max(1e-20);
            let arg1 = ((k.sqrt() / (BETA_STAR * w * d)).max(500.0 * nu / (d * d * w))).min(4.0 * SIGMA_W2 * k / (cdkw * d * d));
            f1[c] = (arg1.powi(4)).tanh();
            cd[c] = 2.0 * (1.0 - f1[c]) * SIGMA_W2 / w * kw;
        }
        let blend = |f: f64, a: f64, b: f64| f * a + (1.0 - f) * b;
        let inv_dt = 1.0 / dt;
        // Neighbour offsets per direction (SGS).
        let mut offs = [0usize; 6];
        for d in 0..6 {
            offs[d] = self.cs[d / 2];
        }
        // Assemble and relax both equations.
        for eq in 0..2 {
            let mut ap = vec![0.0; n];
            let mut anb = vec![[0.0f64; 6]; n];
            let mut bb = vec![0.0; n];
            let phi_old = if eq == 0 { &k0 } else { &w0 };
            let amb = if eq == 0 { tb.k_amb } else { tb.w_amb };
            for c in 0..n {
                if !tb.act[c] {
                    continue;
                }
                let q = self.cq(c);
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
                for d in 0..ndir {
                    let h = self.h[d / 2];
                    let f = self.out_rate(q, d);
                    match self.turb_side(&tb, c, q, d) {
                        Side::Cell(o) => {
                            let gam = 0.5 * (gam_c + self.nu[o] + sig(o) * tb.nut[o]);
                            let dif = gam / (h * h);
                            anb[c][d] = dif + (-f).max(0.0);
                            a_p += dif + f.max(0.0);
                        }
                        Side::Porous(_) | Side::Free => a_p += f.max(0.0),
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
            // Symmetric Gauss–Seidel.
            let x = if eq == 0 { &mut tb.k } else { &mut tb.w };
            for sweep in 0..6 {
                for idx in 0..n {
                    let c = if sweep % 2 == 0 { idx } else { n - 1 - idx };
                    if ap[c] == 0.0 {
                        continue;
                    }
                    let a = &anb[c];
                    let mut s = bb[c];
                    for d in 0..ndir {
                        if a[d] != 0.0 {
                            let o = if d % 2 == 0 { c - offs[d] } else { c + offs[d] };
                            s += a[d] * x[o];
                        }
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
