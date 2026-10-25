//! Finite-volume heat conduction (steady and transient), boundary conditions,
//! temperature-dependent conductivity, radiation and phase change.
//!
//! Unknowns are the simulated (non-void) cells. Face conductances use the
//! harmonic mean of the two half cells; every boundary face contributes a
//! linear relation "heat out of the cell = α·T_cell − β" whose coefficients are
//! refreshed by Picard iteration when they depend on temperature (radiation,
//! k(T), phase change).

use crate::linalg::{self, Csr, Ilu0, Precond, SolveStats, Tol};
use crate::mesh::{self, Across, Mesh};
use crate::model::{interp, BType, HMode, Kind, Layer, Material, Model, Target};
use std::collections::HashMap;
use crate::{Ctx, Error};

pub const SIGMA: f64 = 5.670374e-8;
pub const KELVIN: f64 = 273.15;
const PICARD_TOL: f64 = 1e-4;
/// Conduction preconditioner: modified incomplete Cholesky MIC(0) (the
/// symmetric MILU(0) of the SPD conduction matrix; dropped fill is lumped onto
/// the diagonal with this weight), about half the PCG iterations of plain IC(0).
const MIC_OMEGA: f64 = 0.95;

/// Conductive face between two unknowns; `b` lies in the +axis direction of `a`.
#[derive(Clone, Debug)]
pub struct IFace {
    pub a: u32,
    pub b: u32,
    pub axis: u8,
    pub area: f64,
    /// Thermal contact resistance in series (m²K/W); 0 = perfect contact.
    pub rc: f64,
    /// Contact boundary index (−1 = none) and whether `a` is the body side.
    pub contact: i32,
    pub a_is_body: bool,
    /// Thin layer boundaries on the `a` side and on the `b` side of this face (−1 = none).
    pub layer_a: i32,
    pub layer_b: i32,
    /// In-plane conductance (W/K) of conductive thin layers along this face, in parallel.
    pub gpar: f64,
}

impl IFace {
    /// Face conductance (W/K) for directional conductivities ka, kb.
    #[inline]
    pub fn conductance(&self, h: f64, ka: f64, kb: f64) -> f64 {
        self.area / (0.5 * h / ka + 0.5 * h / kb + self.rc) + self.gpar
    }
}

/// Boundary face of one unknown carrying boundary condition `bc`.
#[derive(Clone, Debug)]
pub struct BFace {
    pub u: u32,
    /// Direction 0..6 (-x,+x,-y,+y,-z,+z) of the outward normal.
    pub d: u8,
    pub area: f64,
    /// Distance from the cell centre to the face.
    pub dist: f64,
    pub bc: u32,
    /// False for the second side of a two-sided internal face (area counted once).
    pub count_area: bool,
    /// Thin layer resistance in series with the half cell (m²K/W) and its boundary (−1 = none).
    pub rs: f64,
    pub layer: i32,
    /// The face radiates through surface-to-surface radiation: the boundary's own
    /// emissivity is ignored there.
    pub s2s: bool,
}

/// Advection terms for the energy equation (CHT, 2D and 3D).
#[derive(Clone, Debug, Default)]
pub struct Adv {
    /// ρcp·u·A (W/K) through each internal face, positive from a to b.
    pub face_f: Vec<f64>,
    pub bnd: Vec<AdvB>,
}

/// Advective edge face: `f_out` (W/K) positive = outflow; inflow carries `t_in`
/// (NaN = zero-gradient outlet, no inflow heat).
#[derive(Clone, Debug)]
pub struct AdvB {
    pub u: u32,
    pub f_out: f64,
    pub t_in: f64,
    pub bc: i64,
}

pub struct Thermal<'m> {
    pub model: &'m Model,
    pub mesh: &'m Mesh,
    pub n: usize,
    /// unknown → cell
    pub cell_of: Vec<u32>,
    /// cell → unknown (u32::MAX for void)
    pub unk: Vec<u32>,
    pub mat_of: Vec<u8>,
    pub faces: Vec<IFace>,
    pub bfaces: Vec<BFace>,
    pub vol: f64,
    /// Unknowns owned by each body and the body volume (m³).
    pub body_unknowns: Vec<Vec<u32>>,
    pub has_pcm: bool,
    pub has_contact: bool,
    /// Some cell has Pennes perfusion or metabolic heat.
    pub has_bio: bool,
    /// Turbulent conductivity ρcp·νt/Prt per unknown (empty = laminar).
    pub turb_k: std::cell::RefCell<Vec<f64>>,
    /// Added conductivity of a flowing cell across faces towards walls
    /// (solids, void, domain edges): 0 in the viscous sublayer, the wall-function
    /// value otherwise (empty = laminar).
    pub turb_k_wall: std::cell::RefCell<Vec<f64>>,
    /// Unknown lies in a flowing (fluid/porous) cell.
    pub flowing: Vec<bool>,
    /// Extra heat source per unknown (W), e.g. Joule heating (empty = none).
    pub extra_q: std::cell::RefCell<Vec<f64>>,
    /// Absorbed sunlight per unknown (W), fixed (study.solar); None when off.
    pub solar: Option<crate::solar::SolarLoad>,
    /// Electric conduction problem (study.electric).
    pub electric: std::cell::RefCell<Option<crate::electric::Electric>>,
    /// k depends on T (kT tables, pcm) or radiation present.
    pub nonlinear: bool,
    /// Per material: cp(T) table on the material or its pore fluid.
    pub mat_cpt: Vec<bool>,
    /// Some face carries a thin layer.
    pub has_layer: bool,
    /// Surface-to-surface radiation (study.s2s).
    pub s2s: Option<crate::s2s::S2s>,
    /// Boundary faces whose emissivity was replaced by S2S radiation.
    pub s2s_overridden: usize,
    pattern: Csr,
    face_pos: Vec<[usize; 4]>,
}

/// Liquid fraction of a pcm material at T.
pub fn liquid_fraction(m: &Material, t: f64) -> f64 {
    let r = m.melt_range.max(1e-3);
    ((t - (m.tmelt - 0.5 * r)) / r).clamp(0.0, 1.0)
}

impl<'m> Thermal<'m> {
    pub fn new(model: &'m Model, mesh: &'m Mesh) -> Thermal<'m> {
        let g = &mesh.grid;
        let nc = g.n();
        let mut unk = vec![u32::MAX; nc];
        let mut cell_of = Vec::new();
        for c in 0..nc {
            if mesh.simulated(c) {
                unk[c] = cell_of.len() as u32;
                cell_of.push(c as u32);
            }
        }
        let n = cell_of.len();
        let mat_of: Vec<u8> = cell_of.iter().map(|&c| mesh.mat[c as usize]).collect();
        let mut faces = Vec::new();
        let mut bfaces = Vec::new();
        // Thin layers: (cell, direction) → layer boundary (last matching wins).
        let layer_of = layer_map(model, mesh);
        let lay = |c: usize, d: usize| -> Option<usize> {
            if layer_of.is_empty() {
                None
            } else {
                layer_of.get(&((c as u64) * 8 + d as u64)).copied()
            }
        };
        let lres = |l: Option<usize>| l.map_or(0.0, |b| model.boundaries[b].layer_resistance());
        let ndir = 6; // 2D: ±z are the out-of-plane faces (front/back targets only)
        for (u, &c) in cell_of.iter().enumerate() {
            let c = c as usize;
            for d in 0..ndir {
                let nb = g.neighbour(c, d);
                match nb {
                    Some(nc_) if mesh.simulated(nc_) => {
                        if d % 2 == 0 {
                            continue; // handled from the other side (+ direction)
                        }
                        let area = g.face_area(d);
                        if mesh.mat[nc_] != mesh.mat[c] {
                            // Interface between materials: a body:<id> condition may claim it.
                            let ra = mesh::resolve(model, mesh, Layer::Thermal, c, d, Across::Other);
                            let rb = mesh::resolve(model, mesh, Layer::Thermal, nc_, d ^ 1, Across::Other);
                            let pick = match (ra, rb) {
                                (Some(a), Some(b)) => Some(if b > a { (b, false) } else { (a, true) }),
                                (Some(a), None) => Some((a, true)),
                                (None, Some(b)) => Some((b, false)),
                                _ => None,
                            };
                            if let Some((bc, side_a)) = pick {
                                let bt = model.boundaries[bc].btype;
                                let (own, own_d, other, other_d) =
                                    if side_a { (c, d, nc_, d ^ 1) } else { (nc_, d ^ 1, c, d) };
                                let lo = lay(own, own_d);
                                bfaces.push(BFace {
                                    u: unk[own],
                                    d: own_d as u8,
                                    area,
                                    dist: 0.5 * g.h(d),
                                    bc: bc as u32,
                                    count_area: true,
                                    rs: lres(lo),
                                    layer: lo.map_or(-1, |x| x as i32),
                                    s2s: false,
                                });
                                if bt == BType::Temperature {
                                    // A fixed interface temperature acts on both sides.
                                    let lt = lay(other, other_d);
                                    bfaces.push(BFace {
                                        u: unk[other],
                                        d: other_d as u8,
                                        area,
                                        dist: 0.5 * g.h(d),
                                        bc: bc as u32,
                                        count_area: false,
                                        rs: lres(lt),
                                        layer: lt.map_or(-1, |x| x as i32),
                                        s2s: false,
                                    });
                                }
                                continue;
                            }
                        }
                        // Thermal contact resistance on interfaces of a body.
                        let mut rc = 0.0;
                        let mut contact = -1i32;
                        let mut a_is_body = true;
                        if mesh.mat[nc_] != mesh.mat[c] {
                            let (mut fx, mut fy, mut fz) = g.centre(c);
                            if d == 1 {
                                fx += 0.5 * g.dx;
                            } else if d == 3 {
                                fy += 0.5 * g.dy;
                            } else if d == 5 {
                                fz += 0.5 * g.dz;
                            }
                            let fz = (g.dim == 3).then_some(fz);
                            for (bi, b) in model.boundaries.iter().enumerate() {
                                if b.btype != BType::Contact {
                                    continue;
                                }
                                if !b.in_region(fx, fy, fz) {
                                    continue;
                                }
                                if let crate::model::Target::Body(t) = b.target {
                                    if mesh.owner[c] == t as u32 {
                                        rc = b.resistance;
                                        contact = bi as i32;
                                        a_is_body = true;
                                    } else if mesh.owner[nc_] == t as u32 {
                                        rc = b.resistance;
                                        contact = bi as i32;
                                        a_is_body = false;
                                    }
                                }
                            }
                        }
                        // Thin layers on either side add their resistance d/k in series.
                        let (la, lb) = (lay(c, d), lay(nc_, d ^ 1));
                        rc += lres(la) + lres(lb);
                        faces.push(IFace {
                            a: u as u32,
                            b: unk[nc_],
                            axis: (d / 2) as u8,
                            area,
                            rc,
                            contact,
                            a_is_body,
                            layer_a: la.map_or(-1, |x| x as i32),
                            layer_b: lb.map_or(-1, |x| x as i32),
                            gpar: 0.0,
                        });
                    }
                    other => {
                        let across = if other.is_none() { Across::Outside } else { Across::Void };
                        if let Some(bc) = mesh::resolve(model, mesh, Layer::Thermal, c, d, across) {
                            let l = lay(c, d);
                            bfaces.push(BFace {
                                u: u as u32,
                                d: d as u8,
                                area: g.face_area(d),
                                dist: 0.5 * g.h(d),
                                bc: bc as u32,
                                count_area: true,
                                rs: lres(l),
                                layer: l.map_or(-1, |x| x as i32),
                                s2s: false,
                            });
                        }
                    }
                }
            }
        }

        // Conductive thin layers: in-plane conductance k·d·W/spacing between
        // neighbouring cells that carry the same layer on faces of the same direction.
        if !layer_of.is_empty() {
            let hs = [g.dx, g.dy, g.dz];
            for f in faces.iter_mut() {
                let (ca, cb) = (cell_of[f.a as usize] as usize, cell_of[f.b as usize] as usize);
                let ax = f.axis as usize;
                for dn in 0..6 {
                    if dn / 2 == ax {
                        continue;
                    }
                    if let (Some(l1), Some(l2)) = (lay(ca, dn), lay(cb, dn)) {
                        let b = &model.boundaries[l1];
                        if l1 == l2 && b.conductive {
                            let third = 3 - ax - dn / 2;
                            f.gpar += b.k_layer * b.thickness * hs[third] / hs[ax];
                        }
                    }
                }
            }
        }
        let has_layer = !layer_of.is_empty();
        // Surface-to-surface radiation.
        let s2s = if model.study.s2s { crate::s2s::S2s::new(model, mesh, &unk) } else { None };
        let solar = crate::solar::solar_load(model, mesh, &unk, n);
        let mut s2s_overridden = 0;
        if let Some(r) = &s2s {
            let set: std::collections::HashSet<(u32, u8)> = r.faces.iter().map(|f| (f.u, f.d)).collect();
            for bf in bfaces.iter_mut() {
                let b = &model.boundaries[bf.bc as usize];
                if matches!(b.btype, BType::Radiation | BType::Convection) && b.emissivity > 0.0 && set.contains(&(bf.u, bf.d)) {
                    bf.s2s = true;
                    s2s_overridden += 1;
                }
            }
        }

        let mut body_unknowns = vec![Vec::new(); model.bodies.len()];
        for (bi, cells) in mesh.body_cells.iter().enumerate() {
            body_unknowns[bi] = cells.iter().map(|&c| unk[c as usize]).filter(|&u| u != u32::MAX).collect();
        }
        let used: Vec<bool> = {
            let mut v = vec![false; model.materials.len()];
            for &m in &mat_of {
                v[m as usize] = true;
            }
            v
        };
        let has_pcm = model.materials.iter().enumerate().any(|(i, m)| used[i] && m.kind == Kind::Pcm);
        let has_kt = model.materials.iter().enumerate().any(|(i, m)| {
            used[i] && (m.kt.is_some() || (m.kind == Kind::Porous && m.fluid.map_or(false, |f| model.materials[f].kt.is_some())))
        });
        let has_rad = bfaces.iter().any(|bf| {
            let b = &model.boundaries[bf.bc as usize];
            (b.btype == BType::Radiation || b.btype == BType::Convection) && b.emissivity > 0.0
        });
        // Convection correlations make h depend on the surface temperature.
        let has_hmode = bfaces.iter().any(|bf| {
            let b = &model.boundaries[bf.bc as usize];
            b.btype == BType::Convection && b.h_mode != HMode::Fixed
        });
        let mat_cpt: Vec<bool> = model
            .materials
            .iter()
            .map(|m| m.cpt.is_some() || (m.kind == Kind::Porous && m.fluid.map_or(false, |f| model.materials[f].cpt.is_some())))
            .collect();
        let has_cpt = model.study.transient && (0..model.materials.len()).any(|i| used[i] && mat_cpt[i]);
        // Sparsity pattern.
        let mut nb = vec![Vec::new(); n];
        for f in &faces {
            nb[f.a as usize].push(f.b);
            nb[f.b as usize].push(f.a);
        }
        let has_contact = faces.iter().any(|f| f.contact >= 0);
        let has_bio = mat_of.iter().any(|&m| {
            let mm = &model.materials[m as usize];
            mm.perfusion > 0.0 || mm.metabolic != 0.0
        });
        let flowing: Vec<bool> = mat_of.iter().map(|&m| model.materials[m as usize].kind.is_flowing()).collect();
        let pattern = Csr::from_neighbours(n, &nb);
        let face_pos = faces
            .iter()
            .map(|f| {
                let (a, b) = (f.a as usize, f.b as usize);
                [pattern.diag[a], pattern.diag[b], pattern.pos(a, b), pattern.pos(b, a)]
            })
            .collect();
        Thermal {
            model,
            mesh,
            n,
            cell_of,
            unk,
            mat_of,
            faces,
            bfaces,
            vol: g.volume(),
            body_unknowns,
            has_pcm,
            has_contact,
            has_bio,
            turb_k: std::cell::RefCell::new(Vec::new()),
            turb_k_wall: std::cell::RefCell::new(Vec::new()),
            flowing,
            extra_q: std::cell::RefCell::new(Vec::new()),
            solar,
            electric: std::cell::RefCell::new(None),
            nonlinear: has_pcm || has_kt || has_rad || has_hmode || has_cpt || s2s.is_some(),
            mat_cpt,
            has_layer,
            s2s,
            s2s_overridden,
            pattern,
            face_pos,
        }
    }

    #[inline]
    pub fn material(&self, u: usize) -> &Material {
        &self.model.materials[self.mat_of[u] as usize]
    }

    /// Conductivity tensor diagonal (kx, ky, kz) of unknown u at temperature t.
    pub fn conductivity(&self, u: usize, t: f64) -> [f64; 3] {
        let m = self.material(u);
        let scale = |mm: &Material| -> f64 {
            match &mm.kt {
                Some(tab) => interp(tab, t) / mm.k,
                None => 1.0,
            }
        };
        let s = scale(m);
        let mut k = [m.kx * s, m.ky * s, m.kz * s];
        match m.kind {
            Kind::Pcm => {
                let fl = liquid_fraction(m, t);
                if fl > 0.0 {
                    let kl = m.k_liquid * s;
                    for v in k.iter_mut() {
                        *v = (1.0 - fl) * *v + fl * kl;
                    }
                }
            }
            Kind::Porous => {
                let eps = m.porosity;
                let kf = m.fluid.map(|f| {
                    let fm = &self.model.materials[f];
                    fm.k * scale(fm)
                });
                let kf = kf.unwrap_or(0.0);
                for v in k.iter_mut() {
                    *v = eps * kf + (1.0 - eps) * *v;
                }
            }
            _ => {}
        }
        let tk = self.turb_k.borrow();
        if !tk.is_empty() && tk[u] != 0.0 {
            for v in k.iter_mut() {
                *v += tk[u];
            }
        }
        k
    }

    /// Correction to add to `conductivity` for a face of unknown u that faces a
    /// wall (see `turb_k_wall`); 0 when laminar.
    #[inline]
    pub fn wall_adjust(&self, u: usize) -> f64 {
        let tw = self.turb_k_wall.borrow();
        if tw.is_empty() {
            return 0.0;
        }
        let tk = self.turb_k.borrow();
        tw[u] - tk[u]
    }

    /// Recompute the Joule heat from the electric field at temperatures `t`
    /// (always when `force`, otherwise only if σ depends on T).
    pub fn update_joule(&self, t: &[f64], ctx: &mut Ctx, force: bool) -> Result<(), Error> {
        let e = self.electric.borrow();
        if let Some(e) = e.as_ref() {
            if force || e.temperature_dependent {
                let s = e.solve(self, t, ctx)?;
                *self.extra_q.borrow_mut() = s.q;
            }
        }
        Ok(())
    }

    /// True when the Joule heat depends on temperature (σ(T)).
    pub fn joule_coupled(&self) -> bool {
        self.electric.borrow().as_ref().map_or(false, |e| e.temperature_dependent)
    }

    /// Molecular (laminar) conductivity of unknown u (x direction, no k(T)).
    pub fn conductivity_laminar(&self, u: usize) -> f64 {
        self.material(u).kx
    }

    /// Sensible volumetric heat capacity ρcp (J/m³K); porous = blend with the pore fluid.
    pub fn rho_cp(&self, u: usize) -> f64 {
        let m = self.material(u);
        if m.kind == Kind::Porous {
            if let Some(f) = m.fluid {
                let fm = &self.model.materials[f];
                return m.porosity * fm.rho * fm.cp + (1.0 - m.porosity) * m.rho * m.cp;
            }
        }
        m.rho * m.cp
    }

    /// Effective heat capacity (J/K) of unknown u over the step told → tnew.
    /// For pcm this is the chord ΔH/ΔT of the enthalpy, so latent heat cannot be
    /// skipped by a large step and the converged step conserves energy exactly.
    pub fn capacity(&self, u: usize, told: f64, tnew: f64) -> f64 {
        let m = self.material(u);
        if self.mat_cpt[self.mat_of[u] as usize] {
            return self.capacity_cpt(u, told, tnew);
        }
        let base = self.rho_cp(u) * self.vol;
        if m.kind != Kind::Pcm || m.latent <= 0.0 {
            return base;
        }
        let dt = tnew - told;
        let lat = m.rho * m.latent * self.vol;
        if dt.abs() > 1e-9 {
            base + lat * (liquid_fraction(m, tnew) - liquid_fraction(m, told)) / dt
        } else {
            let r = m.melt_range.max(1e-3);
            let inside = (told - m.tmelt).abs() < 0.5 * r;
            base + if inside { lat / r } else { 0.0 }
        }
    }

    /// PCM cells: (Jacobian dH/dT in J/K, enthalpy change H(t) − H(told) in J).
    /// The Jacobian is the slope of the enthalpy averaged over ±range/4 around t
    /// (smooths the kinks of the linear liquid-fraction ramp so Newton does
    /// not cycle across the solidus/liquidus). None for other cells.
    pub fn pcm_newton(&self, u: usize, told: f64, t: f64) -> Option<(f64, f64)> {
        let m = self.material(u);
        if self.mat_cpt[self.mat_of[u] as usize] {
            // cp(T): Newton on the enthalpy H(T) = ∫ρcp dT (+ latent heat).
            let mut jac = self.rho_cp_at(u, t) * self.vol;
            let mut dh = (self.sensible_enthalpy(u, t) - self.sensible_enthalpy(u, told)) * self.vol;
            if m.kind == Kind::Pcm && m.latent > 0.0 {
                let lat = m.rho * m.latent * self.vol;
                let r = m.melt_range.max(1e-3);
                let ts = m.tmelt - 0.5 * r;
                jac += if t >= ts && t <= ts + r { lat / r } else { 0.0 };
                dh += lat * (liquid_fraction(m, t) - liquid_fraction(m, told));
            }
            return Some((jac, dh));
        }
        if m.kind != Kind::Pcm || m.latent <= 0.0 {
            return None;
        }
        let base = self.rho_cp(u) * self.vol;
        let lat = m.rho * m.latent * self.vol;
        let r = m.melt_range.max(1e-3);
        let ts = m.tmelt - 0.5 * r;
        let slope = if t >= ts && t <= ts + r { 1.0 / r } else { 0.0 };
        let jac = base + lat * slope;
        let dh = base * (t - told) + lat * (liquid_fraction(m, t) - liquid_fraction(m, told));
        Some((jac, dh))
    }

    /// Sensible volumetric enthalpy ∫ρcp dT (J/m³) of unknown u at t (cp(T) tables).
    pub fn sensible_enthalpy(&self, u: usize, t: f64) -> f64 {
        let m = self.material(u);
        if m.kind == Kind::Porous {
            if let Some(f) = m.fluid {
                let fm = &self.model.materials[f];
                return m.porosity * fm.rho * fm.enthalpy(t) + (1.0 - m.porosity) * m.rho * m.enthalpy(t);
            }
        }
        m.rho * m.enthalpy(t)
    }

    /// Volumetric heat capacity ρcp(T) (J/m³K) of unknown u.
    pub fn rho_cp_at(&self, u: usize, t: f64) -> f64 {
        let m = self.material(u);
        if m.kind == Kind::Porous {
            if let Some(f) = m.fluid {
                let fm = &self.model.materials[f];
                return m.porosity * fm.rho * fm.cp_at(t) + (1.0 - m.porosity) * m.rho * m.cp_at(t);
            }
        }
        m.rho * m.cp_at(t)
    }

    /// Chord capacity ΔH/ΔT (J/K) for cp(T) materials (pcm latent heat included).
    fn capacity_cpt(&self, u: usize, told: f64, tnew: f64) -> f64 {
        let m = self.material(u);
        let dt = tnew - told;
        let mut c = if dt.abs() > 1e-9 {
            (self.sensible_enthalpy(u, tnew) - self.sensible_enthalpy(u, told)) / dt
        } else {
            self.rho_cp_at(u, told)
        } * self.vol;
        if m.kind == Kind::Pcm && m.latent > 0.0 {
            let lat = m.rho * m.latent * self.vol;
            if dt.abs() > 1e-9 {
                c += lat * (liquid_fraction(m, tnew) - liquid_fraction(m, told)) / dt;
            } else {
                let r = m.melt_range.max(1e-3);
                if (told - m.tmelt).abs() < 0.5 * r {
                    c += lat / r;
                }
            }
        }
        c
    }

    /// Heat generated per unknown at time t (W).
    pub fn sources(&self, time: f64) -> Vec<f64> {
        let mut q = vec![0.0; self.n];
        {
            let ex = self.extra_q.borrow();
            if !ex.is_empty() {
                q.copy_from_slice(&ex);
            }
        }
        if let Some(sl) = &self.solar {
            for (qi, si) in q.iter_mut().zip(&sl.q) {
                *qi += si;
            }
        }
        for (bi, us) in self.body_unknowns.iter().enumerate() {
            if us.is_empty() {
                continue;
            }
            let p = self.model.bodies[bi].power_at(time);
            if p == 0.0 {
                continue;
            }
            let per = p / us.len() as f64; // uniform cells → uniform per volume
            for &u in us {
                q[u as usize] += per;
            }
        }
        q
    }

    pub fn generated(&self, time: f64) -> f64 {
        let extra: f64 = self.extra_q.borrow().iter().sum::<f64>() + self.solar.as_ref().map_or(0.0, |s| s.absorbed);
        extra + self.body_unknowns
            .iter()
            .enumerate()
            .filter(|(_, us)| !us.is_empty())
            .map(|(bi, _)| self.model.bodies[bi].power_at(time))
            .sum::<f64>()
    }

    /// Boundary face coefficients: heat out of the cell = α·T_cell − β (W), at time `time`.
    pub fn bcoef(&self, bf: &BFace, tc: f64, kdir: f64, flow_on: bool, time: f64) -> (f64, f64) {
        let (al, be, _) = self.bcoef_h(bf, tc, kdir, flow_on, time);
        (al, be)
    }

    /// `bcoef` plus the convective coefficient h (W/m²K) used on the face.
    pub fn bcoef_h(&self, bf: &BFace, tc: f64, kdir: f64, flow_on: bool, time: f64) -> (f64, f64, f64) {
        let b = &self.model.boundaries[bf.bc as usize];
        let a = bf.area;
        // A thin layer adds its resistance d/k in series with the half cell.
        let gc = if bf.rs > 0.0 { a / (bf.dist / kdir + bf.rs) } else { kdir * a / bf.dist };
        match b.btype {
            BType::Temperature => (gc, gc * b.t_at(time), 0.0),
            BType::Flux => (0.0, b.q_at(time) * a, 0.0),
            BType::Convection | BType::Radiation => {
                let conv = b.btype == BType::Convection;
                let mut h = if conv { b.h_at(time).max(0.0) } else { 0.0 };
                let tinf = b.tinf_at(time);
                let tamb = b.tamb_at(time);
                let eps = if bf.s2s { 0.0 } else { b.emissivity };
                let corr = conv && b.h_mode != HMode::Fixed;
                let mut hr = 0.0;
                if eps > 0.0 || corr {
                    // Surface temperature from the series network, iterated locally
                    // so the linearised radiation coefficient (and a correlation h)
                    // is evaluated at the surface (Kelvin), not at the cell centre.
                    let ta = tamb + KELVIN;
                    let mut ts = tc + KELVIN;
                    for _ in 0..if corr { 60 } else { 30 } {
                        let tsc = ts.max(1.0);
                        if corr {
                            h = crate::convection::h_correlation(b.h_mode, tsc - KELVIN, tinf, b.length, b.velocity);
                        }
                        if eps > 0.0 {
                            hr = eps * SIGMA * (tsc * tsc + ta * ta) * (tsc + ta);
                        }
                        let nts = (gc * (tc + KELVIN) + h * a * (tinf + KELVIN) + hr * a * ta) / (gc + (h + hr) * a);
                        if (nts - ts).abs() < 1e-10 * nts.abs() {
                            break;
                        }
                        ts = nts;
                    }
                }
                let s = gc + (h + hr) * a;
                if s <= 0.0 {
                    return (0.0, 0.0, h);
                }
                (gc * (h + hr) * a / s, gc * (h * a * tinf + hr * a * tamb) / s, h)
            }
            BType::Inlet | BType::Fan => {
                let flowing = self.material(bf.u as usize).kind.is_flowing();
                if flow_on && flowing {
                    (gc, gc * b.tin, 0.0)
                } else {
                    (0.0, 0.0, 0.0)
                }
            }
            _ => (0.0, 0.0, 0.0),
        }
    }

    /// Area-weighted mean convective coefficient (W/m²K) of each convection
    /// boundary with a correlation (`hMode`), at temperatures t and time `time`.
    pub fn bc_hmean(&self, t: &[f64], time: f64) -> Vec<Option<f64>> {
        let nb = self.model.boundaries.len();
        let mut acc = vec![(0.0, 0.0); nb];
        let fo = self.flow_on();
        for bf in &self.bfaces {
            let b = &self.model.boundaries[bf.bc as usize];
            if b.btype != BType::Convection || b.h_mode == HMode::Fixed {
                continue;
            }
            let u = bf.u as usize;
            let k = self.conductivity(u, t[u])[(bf.d / 2) as usize];
            let (_, _, h) = self.bcoef_h(bf, t[u], k, fo, time);
            acc[bf.bc as usize].0 += h * bf.area;
            acc[bf.bc as usize].1 += bf.area;
        }
        acc.iter().map(|&(s, a)| if a > 0.0 { Some(s / a) } else { None }).collect()
    }

    /// Net S2S radiative heat (W) into each unknown at temperatures t (empty without S2S).
    pub fn s2s_heat(&self, t: &[f64], time: f64) -> Vec<f64> {
        let Some(r) = &self.s2s else { return Vec::new() };
        let mut q = vec![0.0; self.n];
        for (u, qf, _) in r.face_terms(self.model, t, time) {
            q[u as usize] += qf;
        }
        q
    }

    /// Bioheat power (W) at temperatures t: metabolic heat plus perfusion
    /// exchange with blood (+ = into the tissue).
    pub fn bioheat_power(&self, t: &[f64]) -> f64 {
        if !self.has_bio {
            return 0.0;
        }
        (0..self.n)
            .map(|u| {
                let m = self.material(u);
                (m.perfusion * m.blood_rho * m.blood_cp * (m.blood_t - t[u]) + m.metabolic) * self.vol
            })
            .sum()
    }

    /// True when some boundary ties the temperature level (steady problem is non-singular).
    pub fn has_reference(&self) -> bool {
        // Blood perfusion ties tissue to the arterial temperature.
        if self.has_bio && (0..self.n).any(|u| self.material(u).perfusion > 0.0) {
            return true;
        }
        if self.s2s_has_ambient() {
            return true;
        }
        let fo = self.flow_on();
        self.bfaces.iter().any(|bf| {
            let b = &self.model.boundaries[bf.bc as usize];
            match b.btype {
                BType::Temperature => true,
                BType::Convection => {
                    b.h > 0.0
                        || b.emissivity > 0.0
                        || b.h_mode != HMode::Fixed
                        || b.ht.as_ref().map_or(false, |t| t.iter().any(|p| p.1 > 0.0))
                }
                BType::Radiation => b.emissivity > 0.0,
                BType::Inlet | BType::Fan => fo && self.material(bf.u as usize).kind.is_flowing(),
                _ => false,
            }
        })
    }

    /// S2S radiation exchanges heat with the ambient (openings or unclosed rows).
    pub fn s2s_has_ambient(&self) -> bool {
        self.s2s.as_ref().map_or(false, |r| {
            (0..r.patches()).any(|i| r.eps[i] > 0.0 && (r.f_amb[i] > 1e-9 || !r.orows[i].is_empty()))
        })
    }

    fn flow_on(&self) -> bool {
        self.model.study.flow
    }

    /// Assemble the energy system at temperature `t`.
    /// `step`: Some((t_old, dt)) for an implicit Euler step.
    pub fn assemble(
        &self,
        a: &mut Csr,
        rhs: &mut [f64],
        t: &[f64],
        step: Option<(&[f64], f64)>,
        time: f64,
        adv: Option<&Adv>,
        pseudo_rcp: Option<f64>,
    ) {
        a.clear();
        let g = &self.mesh.grid;
        let kc: Vec<[f64; 3]> = (0..self.n).map(|u| self.conductivity(u, t[u])).collect();
        let hs = [g.dx, g.dy, g.dz];
        let turb = !self.turb_k_wall.borrow().is_empty();
        for (fi, f) in self.faces.iter().enumerate() {
            let ax = f.axis as usize;
            let (mut ka, mut kb) = (kc[f.a as usize][ax], kc[f.b as usize][ax]);
            if turb {
                let (fa, fb) = (self.flowing[f.a as usize], self.flowing[f.b as usize]);
                if fa && !fb {
                    ka += self.wall_adjust(f.a as usize);
                } else if fb && !fa {
                    kb += self.wall_adjust(f.b as usize);
                }
            }
            let gcd = f.conductance(hs[ax], ka, kb);
            let p = self.face_pos[fi];
            a.val[p[0]] += gcd;
            a.val[p[1]] += gcd;
            a.val[p[2]] -= gcd;
            a.val[p[3]] -= gcd;
        }
        let q = self.sources(time);
        rhs.copy_from_slice(&q);
        if self.has_bio {
            // Pennes: ω_b ρ_b c_b (T_a − T) + q_m, perfusion implicit in T.
            for u in 0..self.n {
                let m = self.material(u);
                if m.perfusion > 0.0 || m.metabolic != 0.0 {
                    let w = m.perfusion * m.blood_rho * m.blood_cp * self.vol;
                    a.val[a.diag[u]] += w;
                    rhs[u] += w * m.blood_t + m.metabolic * self.vol;
                }
            }
        }
        let fo = self.flow_on();
        for bf in &self.bfaces {
            let u = bf.u as usize;
            let kw = kc[u][(bf.d / 2) as usize] + if turb && self.flowing[u] { self.wall_adjust(u) } else { 0.0 };
            let (al, be) = self.bcoef(bf, t[u], kw, fo, time);
            a.val[a.diag[u]] += al;
            rhs[u] += be;
        }
        if let Some(r) = &self.s2s {
            // S2S radiation linearised about the current iterate:
            // Q(T) ≈ Q(T^k) + α (T^k − T), α = 4εσT³A.
            for (u, q, al) in r.face_terms(self.model, t, time) {
                let u = u as usize;
                a.val[a.diag[u]] += al;
                rhs[u] += q + al * t[u];
            }
        }
        if let Some((told, dt)) = step {
            for u in 0..self.n {
                if pseudo_rcp.is_none() {
                    if let Some((jac, dh)) = self.pcm_newton(u, told[u], t[u]) {
                        // Newton form of the latent capacity term:
                        // [ΔH(T^k) + J·(T^{k+1} − T^k)]/dt — exactly ΔH/dt at convergence.
                        a.val[a.diag[u]] += jac / dt;
                        rhs[u] += (jac * t[u] - dh) / dt;
                        continue;
                    }
                }
                let c = match pseudo_rcp {
                    Some(rc) => rc * self.vol,
                    None => self.capacity(u, told[u], t[u]),
                } / dt;
                a.val[a.diag[u]] += c;
                rhs[u] += c * told[u];
            }
        }
        if let Some(adv) = adv {
            for (fi, _f) in self.faces.iter().enumerate() {
                let fl = adv.face_f[fi];
                if fl == 0.0 {
                    continue;
                }
                let p = self.face_pos[fi];
                if fl > 0.0 {
                    // upwind = a
                    a.val[p[0]] += fl;
                    a.val[p[3]] -= fl;
                } else {
                    a.val[p[1]] -= fl;
                    a.val[p[2]] += fl;
                }
            }
            for ab in &adv.bnd {
                let u = ab.u as usize;
                if ab.f_out > 0.0 {
                    a.val[a.diag[u]] += ab.f_out;
                } else if ab.t_in.is_finite() {
                    rhs[u] += -ab.f_out * ab.t_in;
                }
            }
        }
    }

    /// Solve the (possibly nonlinear) energy equation in place.
    /// Steady when `step` is None. Returns (linear stats of the last solve, Picard iterations).
    pub fn solve(
        &self,
        t: &mut [f64],
        step: Option<(&[f64], f64)>,
        time: f64,
        adv: Option<&Adv>,
        cache: &mut SolverCache,
        ctx: &mut Ctx,
    ) -> Result<(SolveStats, usize, bool), Error> {
        let n = self.n;
        let nonlinear = self.nonlinear;
        let max_outer = if nonlinear { 100 } else { 1 };
        let study = &self.model.study;
        let tf = if cache.tol_factor > 0.0 { cache.tol_factor } else { 1.0 };
        let tol = Tol { rel: (study.tolerance * tf).max(1e-14), abs: 0.0, max_iter: study.max_iter };
        let mut a = self.pattern.clone();
        let mut rhs = vec![0.0; n];
        let mut x = vec![0.0; n];
        let mut omega: f64 = 1.0;
        let mut prev_dx: Vec<f64> = Vec::new();
        let mut stats = SolveStats::default();
        let mut converged = !nonlinear;
        let mut outer = 0;
        let mut total_iters = 0usize;
        while outer < max_outer {
            outer += 1;
            self.assemble(&mut a, &mut rhs, t, step, time, adv, cache.pseudo_rcp);
            // Preconditioner reuse: exact for linear problems with the same dt;
            // for nonlinear conduction (Picard) an IC(0) of a recent matrix is
            // still an excellent preconditioner, so it is refreshed only every
            // REFRESH solves (or when dt changes). Advection changes the matrix
            // structure of the operator a lot, so ILU(0) is always rebuilt.
            const REFRESH: usize = 1;
            let same_dt = cache.key == step.map(|s| s.1) && cache.pre.is_some() && !cache.pre_is_ilu;
            let reuse = adv.is_none() && same_dt && (!nonlinear || cache.age < REFRESH);
            if !reuse {
                cache.pre = Some(if adv.is_some() { Box::new(Ilu0::new(&a)) as Box<dyn Precond> } else { Box::new(Ilu0::modified(&a, MIC_OMEGA)) });
                cache.key = step.map(|s| s.1);
                cache.age = 0;
                cache.pre_is_ilu = adv.is_some();
            }
            cache.age += 1;
            x.copy_from_slice(t);
            let pre = cache.pre.as_ref().unwrap().as_ref();
            let mut mon = |it: usize, res: f64| ctx.tick(&|| format!("iteration {it}, residual {res:.2e}"));
            let rel0 = if nonlinear { linalg::PICARD_REDUCTION } else { 0.0 };
            let st = if adv.is_some() {
                linalg::bicgstab_r0(&a, &rhs, &mut x, pre, tol, rel0, &mut mon)?
            } else {
                linalg::pcg_r0(&a, &rhs, &mut x, pre, tol, rel0, &mut mon)?
            };
            total_iters += st.iterations;
            stats = st;
            if x.iter().any(|v| !v.is_finite()) {
                return Err(Error::Msg("the temperature solution diverged (non-finite values)".into()));
            }
            let mut change: f64 = 0.0;
            for u in 0..n {
                change = change.max((x[u] - t[u]).abs());
            }
            if cache.record {
                ctx.residuals.push(&[("T", if nonlinear { change } else { stats.residual.max(1e-300) })]);
            }
            if !nonlinear {
                t.copy_from_slice(&x);
                break;
            }
            if change < PICARD_TOL {
                t.copy_from_slice(&x);
                converged = true;
                break;
            }
            // Adaptive under-relaxation: when successive Picard updates point in
            // opposite directions the fixed point oscillates (pcm chord capacity
            // across the mushy range, strong radiation) → damp; otherwise let
            // the step grow back towards a plain Picard update.
            let dx: Vec<f64> = (0..n).map(|u| x[u] - t[u]).collect();
            if prev_dx.len() == n {
                // Damp only on a clear reversal of a significant update; sign
                // flips at the solver-noise level must not stall convergence.
                let s = linalg::dot(&dx, &prev_dx);
                let norm = (linalg::dot(&dx, &dx) * linalg::dot(&prev_dx, &prev_dx)).sqrt();
                if s < -0.2 * norm && change > 10.0 * PICARD_TOL {
                    omega = (omega * 0.5).max(0.002);
                } else {
                    omega = (omega * 1.5).min(1.0);
                }
            }
            for u in 0..n {
                t[u] += omega * dx[u];
            }
            prev_dx = dx;
        }
        // Report the linear work of all Picard iterations.
        stats.iterations = total_iters;
        Ok((stats, outer, converged))
    }

    /// Heat (W) into the domain per model boundary, and advective inlet/outlet
    /// heat relative to the ambient temperature.
    pub fn bc_heats(&self, t: &[f64], adv: Option<&Adv>, time: f64) -> Vec<f64> {
        let mut h = vec![0.0; self.model.boundaries.len()];
        let fo = self.flow_on();
        for bf in &self.bfaces {
            let u = bf.u as usize;
            let mut k = self.conductivity(u, t[u])[(bf.d / 2) as usize];
            if self.flowing[u] {
                k += self.wall_adjust(u);
            }
            let (al, be) = self.bcoef(bf, t[u], k, fo, time);
            h[bf.bc as usize] += be - al * t[u];
            if bf.layer >= 0 {
                // Heat through a thin layer on a boundary face (already counted by the face's condition).
                h[bf.layer as usize] += be - al * t[u];
            }
        }
        // Thin layers on internal faces: heat crossing into the layer's side (W).
        if self.has_layer {
            let g = &self.mesh.grid;
            let hs = [g.dx, g.dy, g.dz];
            for f in &self.faces {
                if f.layer_a < 0 && f.layer_b < 0 {
                    continue;
                }
                let (a, b) = (f.a as usize, f.b as usize);
                let ax = f.axis as usize;
                let gc = f.area / (0.5 * hs[ax] / self.conductivity(a, t[a])[ax] + 0.5 * hs[ax] / self.conductivity(b, t[b])[ax] + f.rc);
                let q = gc * (t[b] - t[a]); // into a, through the layer(s)
                if f.layer_a >= 0 {
                    h[f.layer_a as usize] += q;
                }
                if f.layer_b >= 0 {
                    h[f.layer_b as usize] -= q;
                }
            }
        }
        // Contact faces: heat crossing into the body (W).
        if self.has_contact {
            let g = &self.mesh.grid;
            let hs = [g.dx, g.dy, g.dz];
            for f in &self.faces {
                if f.contact < 0 {
                    continue;
                }
                let (a, b) = (f.a as usize, f.b as usize);
                let ax = f.axis as usize;
                let gc = f.conductance(hs[ax], self.conductivity(a, t[a])[ax], self.conductivity(b, t[b])[ax]);
                let q = gc * (t[b] - t[a]); // into a
                h[f.contact as usize] += if f.a_is_body { q } else { -q };
            }
        }
        if let Some(adv) = adv {
            let ta = self.model.ambient;
            for ab in &adv.bnd {
                if ab.bc < 0 {
                    continue;
                }
                let u = ab.u as usize;
                let q = if ab.f_out > 0.0 {
                    -ab.f_out * (t[u] - ta)
                } else if ab.t_in.is_finite() {
                    -ab.f_out * (ab.t_in - ta)
                } else {
                    0.0
                };
                h[ab.bc as usize] += q;
            }
        }
        h
    }

    /// Boundary face area (m²) per model boundary in the thermal layer.
    pub fn bc_areas(&self) -> Vec<f64> {
        let mut a = vec![0.0; self.model.boundaries.len()];
        for bf in &self.bfaces {
            if bf.count_area {
                a[bf.bc as usize] += bf.area;
                if bf.layer >= 0 {
                    a[bf.layer as usize] += bf.area;
                }
            }
        }
        for f in &self.faces {
            if f.contact >= 0 {
                a[f.contact as usize] += f.area;
            }
            if f.layer_a >= 0 {
                a[f.layer_a as usize] += f.area;
            }
            if f.layer_b >= 0 && f.layer_b != f.layer_a {
                a[f.layer_b as usize] += f.area;
            }
        }
        a
    }

    /// Cell-centred conductive heat flux (W/m²) per unknown: mean of the two
    /// face fluxes along each axis (adiabatic faces count as zero).
    pub fn heat_flux(&self, t: &[f64], time: f64) -> Vec<[f64; 3]> {
        let g = &self.mesh.grid;
        let hs = [g.dx, g.dy, g.dz];
        let kc: Vec<[f64; 3]> = (0..self.n).map(|u| self.conductivity(u, t[u])).collect();
        let mut q = vec![[0.0; 3]; self.n];
        for f in &self.faces {
            let ax = f.axis as usize;
            let (a, b) = (f.a as usize, f.b as usize);
            let gcd = f.conductance(hs[ax], kc[a][ax], kc[b][ax]) / f.area;
            let flux = gcd * (t[a] - t[b]);
            q[a][ax] += 0.5 * flux;
            q[b][ax] += 0.5 * flux;
        }
        let fo = self.flow_on();
        for bf in &self.bfaces {
            let u = bf.u as usize;
            let ax = (bf.d / 2) as usize;
            if g.dim == 2 && ax == 2 {
                continue;
            }
            let (al, be) = self.bcoef(bf, t[u], kc[u][ax], fo, time);
            let out = (al * t[u] - be) / bf.area;
            q[u][ax] += 0.5 * if bf.d % 2 == 1 { out } else { -out };
        }
        if let Some(r) = &self.s2s {
            for (fi, (u, qf, _)) in r.face_terms(self.model, t, time).into_iter().enumerate() {
                let f = &r.faces[fi];
                let ax = (f.d / 2) as usize;
                let out = -qf / f.area;
                q[u as usize][ax] += 0.5 * if f.d % 2 == 1 { out } else { -out };
            }
        }
        q
    }

    /// Net S2S radiative flux (W/m²) into each cell over its radiating faces
    /// (grid-sized; 0 for other simulated cells, NaN for void). None without S2S.
    pub fn qrad_field(&self, t: &[f64], time: f64) -> Option<Vec<f32>> {
        let r = self.s2s.as_ref()?;
        let n = self.mesh.grid.n();
        let mut q = vec![0.0f64; n];
        let mut a = vec![0.0f64; n];
        for (fi, (_, qf, _)) in r.face_terms(self.model, t, time).into_iter().enumerate() {
            let c = r.faces[fi].cell as usize;
            q[c] += qf;
            a[c] += r.faces[fi].area;
        }
        Some(
            (0..n)
                .map(|c| {
                    if !self.mesh.simulated(c) {
                        f32::NAN
                    } else if a[c] > 0.0 {
                        (q[c] / a[c]) as f32
                    } else {
                        0.0
                    }
                })
                .collect(),
        )
    }

    /// Rate of change of stored energy (W) for a step told → t of size dt.
    pub fn stored_rate(&self, t: &[f64], told: &[f64], dt: f64) -> f64 {
        (0..self.n).map(|u| self.capacity(u, told[u], t[u]) * (t[u] - told[u]) / dt).sum()
    }
}

/// Cached preconditioner for repeated linear solves with the same matrix.
#[derive(Default)]
pub struct SolverCache {
    pub key: Option<f64>,
    pub pre: Option<Box<dyn Precond>>,
    /// Uniform pseudo heat capacity (J/m³K) replacing the physical one in
    /// time steps: pseudo-time marching towards a steady state, whose result
    /// does not depend on the capacity.
    pub pseudo_rcp: Option<f64>,
    /// Number of solves since the preconditioner was built.
    pub age: usize,
    /// Record each Picard iteration in the residual history (steady conduction).
    pub record: bool,
    /// Extra factor on the relative linear tolerance (0 = 1): used for the
    /// final steady CHT energy solve, whose right-hand side is dominated by
    /// large Dirichlet conductances.
    pub tol_factor: f64,
    /// The cached preconditioner is an ILU(0) of an advection matrix.
    pub pre_is_ilu: bool,
}

/// Per-frame histories.
#[derive(Default, Clone)]
pub struct Record {
    pub times: Vec<f64>,
    /// Temperature per cell per frame (NaN for void).
    pub t_frames: Vec<Vec<f32>>,
    /// Liquid fraction per cell per frame (only when pcm cells exist).
    pub liquid_frames: Vec<Vec<f32>>,
    pub probes: Vec<Vec<Option<f64>>>,
    pub body_max: Vec<Vec<Option<f64>>>,
    pub bc_hist: Vec<Vec<f64>>,
}

impl<'m> Thermal<'m> {
    pub fn new_record(&self) -> Record {
        Record {
            probes: vec![Vec::new(); self.model.probes.len()],
            body_max: vec![Vec::new(); self.model.bodies.len()],
            bc_hist: vec![Vec::new(); self.model.boundaries.len()],
            ..Default::default()
        }
    }

    pub fn record(&self, rec: &mut Record, t: &[f64], time: f64, adv: Option<&Adv>) {
        let g = &self.mesh.grid;
        rec.times.push(time);
        let mut tf = vec![f32::NAN; g.n()];
        for u in 0..self.n {
            tf[self.cell_of[u] as usize] = t[u] as f32;
        }
        rec.t_frames.push(tf);
        if self.has_pcm {
            let mut lf = vec![f32::NAN; g.n()];
            for u in 0..self.n {
                let m = self.material(u);
                lf[self.cell_of[u] as usize] = if m.kind == Kind::Pcm { liquid_fraction(m, t[u]) as f32 } else { 0.0 };
            }
            rec.liquid_frames.push(lf);
        }
        for (pi, p) in self.model.probes.iter().enumerate() {
            let v = g.locate(p.x, p.y, p.z).and_then(|c| {
                let u = self.unk[c];
                (u != u32::MAX).then(|| t[u as usize])
            });
            rec.probes[pi].push(v);
        }
        for (bi, us) in self.body_unknowns.iter().enumerate() {
            let m = us.iter().map(|&u| t[u as usize]).fold(f64::NEG_INFINITY, f64::max);
            rec.body_max[bi].push(if us.is_empty() { None } else { Some(m) });
        }
        let h = self.bc_heats(t, adv, time);
        for (i, v) in h.into_iter().enumerate() {
            rec.bc_hist[i].push(v);
        }
    }
}

/// Velocity output of a CHT run (cell centred).
pub struct FlowOut {
    pub u: Vec<f32>,
    pub v: Vec<f32>,
    /// z-velocity (3D only).
    pub w: Option<Vec<f32>>,
    /// Velocity magnitude |U| (m/s).
    pub speed: Vec<f32>,
    pub p: Vec<f32>,
    pub vmax: f64,
    /// Face area (m²) of flow-only boundaries (wall / slip) per model boundary.
    pub areas: Vec<f64>,
    /// Per model boundary (flow edges only): mass flow (kg/s, + into the
    /// domain), volume flow (m³/s), area-weighted pressure (Pa), mass-flow
    /// weighted temperature (°C).
    pub metrics: Vec<Option<[f64; 4]>>,
    /// Area-averaged inlet pressure − area-averaged outlet/open pressure (Pa).
    pub pressure_drop: Option<f64>,
    /// Turbulence fields (cell centred) and the largest wall y+.
    pub k: Option<Vec<f32>>,
    pub omega: Option<Vec<f32>>,
    pub nut: Option<Vec<f32>>,
    pub yplus_max: f64,
    /// Fan operating point (Q m³/s, Δp Pa) per model boundary.
    pub fan_points: Vec<Option<(f64, f64)>>,
    /// Internal fans: (mass flow kg/s, volume flow m³/s) along the fan direction.
    pub fan_flow: Vec<Option<(f64, f64)>>,
}

/// Result of the thermal (and flow) solution.
pub struct Solution {
    /// Final temperature per unknown.
    pub t: Vec<f64>,
    pub rec: Record,
    pub time_end: f64,
    /// Stored-energy rate over the last step (W); 0 for steady.
    pub stored: f64,
    pub adv: Option<Adv>,
    pub flow: Option<FlowOut>,
}

/// Pure conduction study (steady or transient).
pub fn run(th: &Thermal, ctx: &mut Ctx) -> Result<Solution, Error> {
    let study = &th.model.study;
    let mut t = vec![study.initial_t; th.n];
    let mut rec = th.new_record();
    let mut cache = SolverCache::default();
    if !study.transient {
        ctx.phase("conduction");
        ctx.report(0.0, "Steady conduction")?;
        if !th.has_reference() {
            // Pure Neumann problem: no unique steady temperature.
            if th.generated(0.0).abs() > 0.0 || th.bfaces.iter().any(|b| th.model.boundaries[b.bc as usize].btype == BType::Flux) {
                return Err(Error::Msg(
                    "Steady study has no temperature, convection or radiation boundary: heat cannot leave the domain".into(),
                ));
            }
            let st = &th.model.study;
            let no_thermal_bcs = !th.model.boundaries.iter().any(|b| b.btype.in_layer(Layer::Thermal));
            let mechanical = (st.structural || st.modal_modes > 0) && no_thermal_bcs;
            if !mechanical {
                ctx.warn("Steady study has no temperature, convection or radiation boundary; the temperature is the initial temperature");
            }
            th.record(&mut rec, &t, 0.0, None);
            return Ok(Solution { t, rec, time_end: 0.0, stored: 0.0, adv: None, flow: None });
        }
        cache.record = true;
        let (mut st, mut outer, mut conv) = th.solve(&mut t, None, 0.0, None, &mut cache, ctx)?;
        if th.joule_coupled() {
            // σ(T): alternate electric and thermal solves until T settles.
            let mut ok = false;
            for _ in 0..30 {
                let tprev = t.clone();
                th.update_joule(&t, ctx, true)?;
                let r = th.solve(&mut t, None, 0.0, None, &mut cache, ctx)?;
                st = r.0;
                outer += r.1;
                conv = r.2;
                let d = (0..th.n).map(|u| (t[u] - tprev[u]).abs()).fold(0.0, f64::max);
                if d < 1e-3 {
                    ok = true;
                    break;
                }
            }
            if !ok {
                ctx.warn("Electro-thermal coupling (σ(T)) did not converge to 1e-3 K in 30 iterations");
            }
        }
        cache.record = false;
        ctx.log("conduction", st.iterations, st.residual);
        if outer > 1 {
            ctx.log("picard", outer, 0.0);
        }
        if !conv {
            ctx.warn("Nonlinear (radiation / k(T)) iteration did not converge to 1e-4 K in 100 iterations");
        }
        if !st.converged {
            ctx.warn(format!("Linear solver stopped at relative residual {:.2e}", st.residual));
        }
        th.record(&mut rec, &t, 0.0, None);
        ctx.report(1.0, "Steady conduction done")?;
        return Ok(Solution { t, rec, time_end: 0.0, stored: 0.0, adv: None, flow: None });
    }
    ctx.phase("transient");
    ctx.report(0.0, "Transient conduction")?;
    let frames = study.frames.max(1);
    let interval = study.end_time / frames as f64;
    let sub = ((interval / study.dt) - 1e-9).ceil().max(1.0) as usize;
    let dt = interval / sub as f64;
    th.record(&mut rec, &t, 0.0, None);
    let total = frames * sub;
    let mut told = t.clone();
    let mut iters = 0usize;
    let mut worst = 0.0f64;
    let mut unconv = 0usize;
    let mut outer_total = 0usize;
    let mut time = 0.0;
    let mut stepno = 0usize;
    let mut tprev = t.clone();
    let mut have_prev = false;
    for f in 1..=frames {
        for s in 0..sub {
            told.copy_from_slice(&t);
            time = (f - 1) as f64 * interval + (s + 1) as f64 * dt;
            if th.nonlinear && have_prev {
                // Linear extrapolation as the Picard starting point.
                for u in 0..th.n {
                    t[u] += t[u] - tprev[u];
                }
            }
            tprev.copy_from_slice(&told);
            have_prev = true;
            if th.joule_coupled() {
                th.update_joule(&told, ctx, true)?;
            }
            let (st, outer, conv) = th.solve(&mut t, Some((&told, dt)), time, None, &mut cache, ctx)?;
            outer_total += outer;
            let dtmax = (0..th.n).map(|u| (t[u] - told[u]).abs()).fold(0.0, f64::max);
            ctx.residuals.push(&[("T", dtmax)]);
            iters += st.iterations;
            worst = worst.max(st.residual);
            if !conv {
                unconv += 1;
            }
            stepno += 1;
            if stepno % 8 == 0 || stepno == total {
                ctx.report(stepno as f64 / total as f64, &format!("t = {time:.4} s"))?;
            }
        }
        th.record(&mut rec, &t, f as f64 * interval, None);
    }
    ctx.log("transient", iters, worst);
    if th.nonlinear {
        ctx.log("picard", outer_total, 0.0);
    }
    if unconv > 0 {
        ctx.warn(format!("Nonlinear iteration did not fully converge in {unconv} time steps"));
    }
    let stored = th.stored_rate(&t, &told, dt);
    Ok(Solution { t, rec, time_end: time, stored, adv: None, flow: None })
}

/// Faces claimed by thin layers: key cell·8 + direction → boundary index.
/// Body targets: faces of the body's cells towards anything that is not the
/// same body (another body or material, void, the domain edge; not the 2D
/// out-of-plane faces). Edge targets: the faces on that domain edge. `range`
/// and `region` filter like for other boundaries.
fn layer_map(model: &Model, mesh: &Mesh) -> HashMap<u64, usize> {
    let mut m = HashMap::new();
    if !model.boundaries.iter().any(|b| b.btype == BType::ThinLayer) {
        return m;
    }
    let g = &mesh.grid;
    for (bi, b) in model.boundaries.iter().enumerate() {
        if b.btype != BType::ThinLayer {
            continue;
        }
        let mut claim = |c: usize, d: usize| {
            if !mesh.simulated(c) {
                return;
            }
            let (mut fx, mut fy, mut fz) = g.centre(c);
            match d {
                0 => fx -= 0.5 * g.dx,
                1 => fx += 0.5 * g.dx,
                2 => fy -= 0.5 * g.dy,
                3 => fy += 0.5 * g.dy,
                4 => fz -= 0.5 * g.dz,
                _ => fz += 0.5 * g.dz,
            }
            if !b.in_region(fx, fy, (g.dim == 3).then_some(fz)) {
                return;
            }
            m.insert((c as u64) * 8 + d as u64, bi);
        };
        match b.target {
            Target::Body(t) => {
                for &c in &mesh.body_cells[t] {
                    let c = c as usize;
                    for d in 0..6 {
                        if g.dim == 2 && d >= 4 {
                            continue;
                        }
                        let other = match g.neighbour(c, d) {
                            Some(nb) => mesh.owner[nb] != t as u32,
                            None => true,
                        };
                        if other {
                            claim(c, d);
                        }
                    }
                }
            }
            Target::Edge(e) => {
                let d = e.dir();
                for c in 0..g.n() {
                    if g.neighbour(c, d).is_some() {
                        continue;
                    }
                    if g.dim == 2 && d >= 4 {
                        // 2D front/back: every cell's out-of-plane face.
                    }
                    if let Some((r0, r1)) = b.range {
                        let (cx, cy, _) = g.centre(c);
                        let sv = match d {
                            0 | 1 => cy,
                            2 | 3 => cx,
                            _ if g.dim == 3 => cx,
                            _ => f64::NAN,
                        };
                        if sv.is_finite() && !(sv >= r0 - 1e-12 && sv <= r1 + 1e-12) {
                            continue;
                        }
                    }
                    claim(c, d);
                }
            }
            Target::Exterior | Target::Interior => {}
        }
    }
    m
}
