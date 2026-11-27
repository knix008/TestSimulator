//! Tetrahedral meshing of bodies given as signed distance functions.
//!
//! 1. A rectilinear background grid covers the domain (the bodies, or the enclosure around them).
//!    Its lines go through every axis-aligned face plane of the bodies, so boxes and caps are
//!    captured exactly, and are spaced at most the element size (finer inside sizing regions).
//! 2. Each grid cell splits into six tetrahedra (Kuhn subdivision, conforming across cells); a
//!    tetrahedron belongs to the first body containing its centroid (or to the surrounding air).
//! 3. Boundary nodes move onto the body surfaces (projection along the SDF gradient), interior
//!    nodes are smoothed; every move keeps all touching elements valid.
//! 4. Boundary triangles are grouped into faces (feature angle), tiny faces merge into neighbours.
//! 5. Second order: a mid-side node per edge, boundary mid-side nodes projected onto the surface.

use crate::geom::{cross, dot, norm, normalize, sub, Solid, V3};
use std::collections::HashMap;

pub const NONE: u32 = u32::MAX;

pub struct BodyMesh<'a> {
    pub solid: &'a Solid,
    /// Grid planes from the body's axis-aligned primitives.
    pub planes: [Vec<f64>; 3],
    /// Local element size (sizing control), if any.
    pub size: Option<f64>,
}

pub struct MeshOptions {
    pub size: f64,
    pub order: u8,
    pub snap: bool,
    pub smooth: u32,
    pub feature_angle: f64,
    /// Air box (lo, hi) around the bodies, meshed as region `bodies.len()`.
    pub enclosure: Option<(V3, V3)>,
    /// Upper bound on nodes (protects the browser from a huge mesh).
    pub max_nodes: usize,
    /// Region pairs (a, b) whose interface gets separate nodes for contact (index = contact number).
    pub split: Vec<(u32, u32)>,
}

/// A node pair across a contact interface: `a` on the first body, `b` its copy on the second.
#[derive(Clone, Debug)]
pub struct ContactNode {
    pub a: u32,
    pub b: u32,
    pub pair: usize,
    /// From body a towards body b.
    pub normal: V3,
    /// Tributary area (model units²).
    pub area: f64,
}

#[derive(Clone, Debug)]
pub struct Face {
    pub region: u32,
    pub other: u32,
    pub area: f64,
    pub centroid: V3,
    pub normal: V3,
    pub tris: Vec<u32>,
}

pub struct Mesh {
    pub nodes: Vec<V3>,
    /// Corner nodes come first: 0..ncorner.
    pub ncorner: usize,
    pub tets: Vec<[u32; 4]>,
    /// Second order elements (corners, then mid-sides 01, 12, 02, 03, 13, 23).
    pub tet10: Vec<[u32; 10]>,
    pub region: Vec<u32>,
    pub nregions: usize,
    pub nbodies: usize,
    /// Boundary triangles, outward from `tri_region`.
    pub tris: Vec<[u32; 3]>,
    /// Mid-side nodes of each boundary triangle's edges (ab, bc, ca), second order only.
    pub tri_mid: Vec<[u32; 3]>,
    pub tri_region: Vec<u32>,
    pub tri_other: Vec<u32>,
    pub tri_face: Vec<u32>,
    pub faces: Vec<Face>,
    pub h: f64,
    pub contact_nodes: Vec<ContactNode>,
}

impl Mesh {
    pub fn order(&self) -> u8 { if self.tet10.is_empty() { 1 } else { 2 } }
    pub fn nnodes(&self) -> usize { self.nodes.len() }

    /// Element connectivity (4 or 10 nodes).
    pub fn element(&self, e: usize) -> Vec<u32> {
        if self.tet10.is_empty() { self.tets[e].to_vec() } else { self.tet10[e].to_vec() }
    }

    pub fn elements(&self) -> Box<dyn Iterator<Item = Vec<u32>> + '_> {
        if self.tet10.is_empty() { Box::new(self.tets.iter().map(|t| t.to_vec())) } else { Box::new(self.tet10.iter().map(|t| t.to_vec())) }
    }

    pub fn tet_volume(&self, e: usize) -> f64 {
        let t = self.tets[e];
        volume(self.nodes[t[0] as usize], self.nodes[t[1] as usize], self.nodes[t[2] as usize], self.nodes[t[3] as usize])
    }

    /// Nodes (corner and mid-side) of the given faces.
    pub fn face_nodes(&self, faces: &[usize]) -> Vec<u32> {
        let mut set = Vec::new();
        for &f in faces {
            for &ti in &self.faces[f].tris {
                set.extend_from_slice(&self.tris[ti as usize]);
                if !self.tri_mid.is_empty() { set.extend_from_slice(&self.tri_mid[ti as usize]); }
            }
        }
        set.sort_unstable();
        set.dedup();
        set
    }

    /// Nodes of the elements of a region.
    pub fn region_nodes(&self, region: u32) -> Vec<u32> {
        let mut set = Vec::new();
        for e in 0..self.tets.len() {
            if self.region[e] == region { set.extend(self.element(e)); }
        }
        set.sort_unstable();
        set.dedup();
        set
    }

    /// Element quality 0…1 (1 = regular): 12·(3V)^(2/3) / Σ edge².
    pub fn quality(&self, e: usize) -> f64 {
        let t = self.tets[e];
        let p: Vec<V3> = t.iter().map(|&i| self.nodes[i as usize]).collect();
        let v = volume(p[0], p[1], p[2], p[3]);
        let mut s = 0.0;
        for (a, b) in [(0, 1), (1, 2), (0, 2), (0, 3), (1, 3), (2, 3)] { let d = sub(p[a], p[b]); s += dot(d, d); }
        if v <= 0.0 || s <= 0.0 { 0.0 } else { 12.0 * (3.0 * v).powf(2.0 / 3.0) / s }
    }

    /// Aspect ratio (1 = regular): longest edge / (2√6 · inradius).
    pub fn aspect(&self, e: usize) -> f64 {
        let t = self.tets[e];
        let p: Vec<V3> = t.iter().map(|&i| self.nodes[i as usize]).collect();
        let v = volume(p[0], p[1], p[2], p[3]);
        let mut lmax: f64 = 0.0;
        for (a, b) in [(0, 1), (1, 2), (0, 2), (0, 3), (1, 3), (2, 3)] { lmax = lmax.max(norm(sub(p[a], p[b]))); }
        let area = |a: V3, b: V3, c: V3| 0.5 * norm(cross(sub(b, a), sub(c, a)));
        let s = area(p[0], p[1], p[2]) + area(p[0], p[1], p[3]) + area(p[0], p[2], p[3]) + area(p[1], p[2], p[3]);
        if v <= 0.0 { return 1e9; }
        let r = 3.0 * v / s;
        lmax / (2.0 * 6f64.sqrt() * r)
    }
}

#[inline]
pub fn volume(a: V3, b: V3, c: V3, d: V3) -> f64 {
    dot(cross(sub(b, a), sub(c, a)), sub(d, a)) / 6.0
}

/// Outward faces of a positively oriented tetrahedron (local corner indices).
pub const TET_FACES: [[usize; 3]; 4] = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]];
/// Mid-side slots of a TET10 for each corner pair.
pub const TET10_EDGES: [(usize, usize); 6] = [(0, 1), (1, 2), (0, 2), (0, 3), (1, 3), (2, 3)];

fn axis_lines(lo: f64, hi: f64, planes: &[f64], h: f64, sizing: &[(f64, f64, f64)]) -> Vec<f64> {
    let len = hi - lo;
    let tol = len * 1e-9 + 1e-12;
    let mut br: Vec<f64> = vec![lo, hi];
    for &p in planes { if p > lo + tol && p < hi - tol { br.push(p); } }
    for &(a, b, _) in sizing {
        for p in [a, b] { if p > lo + tol && p < hi - tol { br.push(p); } }
    }
    br.sort_by(|a, b| a.partial_cmp(b).unwrap());
    // Breakpoints closer than a twentieth of an element merge (a sliver layer is worse than a tiny shift).
    let mut merged: Vec<f64> = Vec::new();
    for p in br {
        if let Some(&last) = merged.last() { if p - last < 0.05 * h { continue; } }
        merged.push(p);
    }
    if let Some(last) = merged.last_mut() { *last = hi; }
    let mut lines = vec![merged[0]];
    for w in merged.windows(2) {
        let (a, b) = (w[0], w[1]);
        let mid = 0.5 * (a + b);
        let mut hl = h;
        for &(s0, s1, hs) in sizing { if mid >= s0 - tol && mid <= s1 + tol { hl = hl.min(hs); } }
        let n = ((b - a) / hl - 1e-6).ceil().max(1.0) as usize;
        for i in 1..=n { lines.push(a + (b - a) * i as f64 / n as f64); }
    }
    lines
}

pub fn generate(bodies: &[BodyMesh], opt: &MeshOptions, ctx: &mut crate::Ctx) -> Result<Mesh, String> {
    if bodies.is_empty() { return Err("mesh.noBodies".into()); }
    let h = opt.size;
    if !(h > 0.0) { return Err("mesh.badSize".into()); }
    let nb = bodies.len();
    let air = if opt.enclosure.is_some() { nb as u32 } else { NONE };
    let (mut lo, mut hi) = ([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]);
    for b in bodies { for k in 0..3 { lo[k] = lo[k].min(b.solid.bbox.0[k]); hi[k] = hi[k].max(b.solid.bbox.1[k]); } }
    if let Some((a, b)) = opt.enclosure {
        for k in 0..3 { lo[k] = lo[k].min(a[k]); hi[k] = hi[k].max(b[k]); }
    }
    let mut lines: Vec<Vec<f64>> = Vec::with_capacity(3);
    for k in 0..3 {
        let mut planes = Vec::new();
        for b in bodies { planes.extend_from_slice(&b.planes[k]); }
        let sizing: Vec<(f64, f64, f64)> = bodies.iter().filter_map(|b| b.size.map(|s| (b.solid.bbox.0[k], b.solid.bbox.1[k], s))).collect();
        lines.push(axis_lines(lo[k], hi[k], &planes, h, &sizing));
    }
    let (nx, ny, nz) = (lines[0].len(), lines[1].len(), lines[2].len());
    if nx * ny * nz > opt.max_nodes.saturating_mul(3) {
        return Err("mesh.tooLarge".into());
    }
    let gid = |i: usize, j: usize, k: usize| (k * ny + j) * nx + i;
    let sp = |l: &Vec<f64>, a: usize| { let mut s = f64::INFINITY; if a > 0 { s = s.min(l[a] - l[a - 1]); } if a + 1 < l.len() { s = s.min(l[a + 1] - l[a]); } s };
    let ghloc = |id: usize| { let (i, j, k) = (id % nx, (id / nx) % ny, id / (nx * ny)); sp(&lines[0], i).min(sp(&lines[1], j)).min(sp(&lines[2], k)) };
    let gbase = |id: usize| -> V3 { [lines[0][id % nx], lines[1][(id / nx) % ny], lines[2][id / (nx * ny)]] };
    ctx.step(0.03, "progress.mesh")?;
    // Stage 1: grid nodes very close to a surface move onto it (a fifth of the local spacing at most:
    // no Kuhn tetrahedron can turn over), so few elements are cut near their corners.
    let mut moved: HashMap<u32, V3> = HashMap::new();
    if opt.snap {
        for b in bodies.iter() {
            let (a, c) = b.solid.bbox;
            let range = |k: usize| -> (usize, usize) {
                let l = &lines[k];
                (l.partition_point(|&x| x < a[k] - h), l.partition_point(|&x| x <= c[k] + h))
            };
            let ((i0, i1), (j0, j1), (k0, k1)) = (range(0), range(1), range(2));
            for k in k0..k1 {
                for j in j0..j1 {
                    for i in i0..i1 {
                        let id = gid(i, j, k);
                        // An earlier body owning this node wins; nodes on the outer box stay on it.
                        if moved.contains_key(&(id as u32)) { continue; }
                        if opt.enclosure.is_some() && (i == 0 || j == 0 || k == 0 || i + 1 == nx || j + 1 == ny || k + 1 == nz) { continue; }
                        let p = gbase(id);
                        let d = b.solid.sdf(p);
                        let hl = ghloc(id);
                        if d.abs() < 1e-12 * hl || d.abs() >= 0.2 * hl { continue; }
                        let q = b.solid.project(p, hl * 1e-3);
                        if norm(sub(q, p)) < 0.25 * hl { moved.insert(id as u32, q); }
                    }
                }
            }
        }
    }
    let gpos = |id: usize| -> V3 { moved.get(&(id as u32)).copied().unwrap_or_else(|| gbase(id)) };
    ctx.step(0.06, "progress.mesh")?;
    // Kuhn subdivision: the six paths from corner 000 to 111.
    const PATHS: [[usize; 3]; 6] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let mut tets: Vec<[u32; 4]> = Vec::new();
    let mut region: Vec<u32> = Vec::new();
    let total_cells = (nx - 1) * (ny - 1) * (nz - 1);
    let mut done = 0usize;
    for k in 0..nz - 1 {
        for j in 0..ny - 1 {
            for i in 0..nx - 1 {
                done += 1;
                let cmid = [0.5 * (lines[0][i] + lines[0][i + 1]), 0.5 * (lines[1][j] + lines[1][j + 1]), 0.5 * (lines[2][k] + lines[2][k + 1])];
                let csize = (lines[0][i + 1] - lines[0][i]).max(lines[1][j + 1] - lines[1][j]).max(lines[2][k + 1] - lines[2][k]);
                // Cells far from every body: one test for all six tets.
                let mut candidates: Vec<usize> = Vec::new();
                for (bi, b) in bodies.iter().enumerate() {
                    let (a, c) = b.solid.bbox;
                    if (0..3).all(|q| cmid[q] >= a[q] - csize && cmid[q] <= c[q] + csize) { candidates.push(bi); }
                }
                if candidates.is_empty() && air == NONE { continue; }
                for path in PATHS {
                    let mut c = [0usize; 3];
                    let mut ids = [0u32; 4];
                    ids[0] = gid(i, j, k) as u32;
                    for (s, &axis) in path.iter().enumerate() {
                        c[axis] = 1;
                        ids[s + 1] = gid(i + c[0], j + c[1], k + c[2]) as u32;
                    }
                    let p: Vec<V3> = ids.iter().map(|&id| gpos(id as usize)).collect();
                    let cen = [(p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4.0, (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4.0, (p[0][2] + p[1][2] + p[2][2] + p[3][2]) / 4.0];
                    let mut r = air;
                    // A tetrahedron belongs to a body when its centre lies inside it or just outside (within
                    // 0.15 of a cell): near curved surfaces most of such an element is inside, and leaving it
                    // out would leave a notch the snapping cannot close. Spikes this adds are snapped or removed.
                    for &bi in &candidates { if bodies[bi].solid.sdf(cen) < 0.15 * csize { r = bi as u32; break; } }
                    if r == NONE { continue; }
                    let v = volume(p[0], p[1], p[2], p[3]);
                    if v.abs() < 1e-12 * csize * csize * csize { continue; }
                    if v < 0.0 { ids.swap(1, 2); }
                    tets.push(ids);
                    region.push(r);
                }
            }
        }
        if k % 4 == 0 { ctx.step(0.06 + 0.24 * done as f64 / total_cells.max(1) as f64, "progress.mesh")?; }
    }
    if tets.is_empty() { return Err("mesh.empty".into()); }
    // Renumber the used grid nodes.
    let mut map: HashMap<u32, u32> = HashMap::new();
    let mut nodes: Vec<V3> = Vec::new();
    let mut hloc: Vec<f64> = Vec::new();
    for t in tets.iter_mut() {
        for id in t.iter_mut() {
            let next = nodes.len() as u32;
            let e = *map.entry(*id).or_insert_with(|| {
                nodes.push(gpos(*id as usize));
                hloc.push(ghloc(*id as usize));
                next
            });
            *id = e;
        }
    }
    if nodes.len() > opt.max_nodes { return Err("mesh.tooLarge".into()); }
    ctx.step(0.32, "progress.mesh")?;

    let (tris, tri_region, tri_other) = boundary(&tets, &region);
    let mut mesh = Mesh {
        nodes, ncorner: 0, tets, tet10: Vec::new(), region, nregions: if air == NONE { nb } else { nb + 1 }, nbodies: nb,
        tris, tri_mid: Vec::new(), tri_region, tri_other, tri_face: Vec::new(), faces: Vec::new(), h, contact_nodes: Vec::new(),
    };
    ctx.step(0.4, "progress.mesh")?;
    if opt.snap {
        // Stage 2: the remaining boundary nodes onto the surfaces (each move keeps its elements valid);
        // elements flattened against a surface are dropped and the boundary found again.
        for round in 0..5 {
            let incident = node_tets(&mesh);
            snap(&mut mesh, bodies, &hloc, &incident, air);
            // Spikes: elements near a surface with a corner still well outside their body (a node the
            // snapping could not move) go, so the surface is found again without them.
            let spikes = drop_spikes(&mut mesh, bodies, &hloc, air);
            let dropped = drop_slivers(&mut mesh, air) || spikes;
            if dropped {
                let (tris, tri_region, tri_other) = boundary(&mesh.tets, &mesh.region);
                mesh.tris = tris;
                mesh.tri_region = tri_region;
                mesh.tri_other = tri_other;
            } else if round > 0 {
                break;
            }
        }
        // The faces that the last round's removals brought to the surface snap too.
        let incident = node_tets(&mesh);
        snap(&mut mesh, bodies, &hloc, &incident, air);
        compact_nodes(&mut mesh, &mut hloc);
    }
    if !opt.split.is_empty() { split_interfaces(&mut mesh, &opt.split, &mut hloc); }
    mesh.ncorner = mesh.nodes.len();
    ctx.step(0.55, "progress.mesh")?;
    if opt.smooth > 0 { let incident = node_tets(&mesh); smooth(&mut mesh, &incident, opt.smooth); }
    ctx.step(0.65, "progress.mesh")?;
    group_faces(&mut mesh, bodies, air, opt.feature_angle);
    ctx.step(0.75, "progress.mesh")?;
    if opt.order == 2 { make_quadratic(&mut mesh, bodies, air); }
    if !opt.split.is_empty() { pair_contact_nodes(&mut mesh, &opt.split); }
    if mesh.nodes.len() > opt.max_nodes * 2 { return Err("mesh.tooLarge".into()); }
    ctx.step(0.85, "progress.mesh")?;
    Ok(mesh)
}

/// Gives the second body of each pair its own nodes along the interface.
fn split_interfaces(mesh: &mut Mesh, pairs: &[(u32, u32)], hloc: &mut Vec<f64>) {
    for &(ra, rb) in pairs {
        let mut copy: HashMap<u32, u32> = HashMap::new();
        for (ti, t) in mesh.tris.iter().enumerate() {
            if mesh.tri_region[ti] == rb && mesh.tri_other[ti] == ra {
                for &n in t {
                    if !copy.contains_key(&n) {
                        let id = mesh.nodes.len() as u32;
                        mesh.nodes.push(mesh.nodes[n as usize]);
                        hloc.push(hloc[n as usize]);
                        copy.insert(n, id);
                    }
                }
            }
        }
        if copy.is_empty() { continue; }
        for (e, t) in mesh.tets.iter_mut().enumerate() {
            if mesh.region[e] == rb { for n in t.iter_mut() { if let Some(&c) = copy.get(n) { *n = c; } } }
        }
        for (ti, t) in mesh.tris.iter_mut().enumerate() {
            if mesh.tri_region[ti] == rb { for n in t.iter_mut() { if let Some(&c) = copy.get(n) { *n = c; } } }
        }
    }
}

/// Matches the coincident nodes of each split interface (corners and mid-sides) by position.
fn pair_contact_nodes(mesh: &mut Mesh, pairs: &[(u32, u32)]) {
    let key = |p: V3, h: f64| { let q = h * 1e-4; ((p[0] / q).round() as i64, (p[1] / q).round() as i64, (p[2] / q).round() as i64) };
    let mut out = Vec::new();
    for (pi, &(ra, rb)) in pairs.iter().enumerate() {
        // Side a: node → (area, normal) from its triangles.
        let mut side_a: HashMap<u32, (f64, V3)> = HashMap::new();
        let mut side_b: Vec<u32> = Vec::new();
        for (ti, t) in mesh.tris.iter().enumerate() {
            let (r, o) = (mesh.tri_region[ti], mesh.tri_other[ti]);
            let mut nodes: Vec<u32> = t.to_vec();
            if !mesh.tri_mid.is_empty() { nodes.extend_from_slice(&mesh.tri_mid[ti]); }
            if r == ra && o == rb {
                let (n, area, _) = tri_normal_area(mesh, t);
                let share = area / nodes.len() as f64;
                for nd in nodes { let e = side_a.entry(nd).or_insert((0.0, [0.0; 3])); e.0 += share; for k in 0..3 { e.1[k] += n[k] * share; } }
            } else if r == rb && o == ra {
                side_b.extend(nodes);
            }
        }
        side_b.sort_unstable();
        side_b.dedup();
        let lookup: HashMap<(i64, i64, i64), u32> = side_a.keys().map(|&n| (key(mesh.nodes[n as usize], mesh.h), n)).collect();
        for b in side_b {
            if let Some(&a) = lookup.get(&key(mesh.nodes[b as usize], mesh.h)) {
                if a == b { continue; }
                let (area, n) = side_a[&a];
                out.push(ContactNode { a, b, pair: pi, normal: normalize(n), area });
            }
        }
    }
    mesh.contact_nodes = out;
}

/// Removes elements whose four corners all lie on the boundary and that have become flat
/// (quality below 2 %). Returns whether any went.
fn drop_slivers(mesh: &mut Mesh, air: u32) -> bool {
    let mut on_boundary = vec![false; mesh.nodes.len()];
    for t in &mesh.tris { for &n in t { on_boundary[n as usize] = true; } }
    let keep: Vec<bool> = (0..mesh.tets.len()).map(|e| {
        let t = mesh.tets[e];
        !(t.iter().all(|&n| on_boundary[n as usize]) && mesh.quality(e) < 0.02)
    }).collect();
    if keep.iter().all(|k| *k) { return false; }
    // Flat elements go (even inside an enclosure: their volume is negligible, and a flat element cannot
    // be integrated).
    let _ = air;
    let mut tets = Vec::with_capacity(mesh.tets.len());
    let mut region = Vec::with_capacity(mesh.tets.len());
    for e in 0..mesh.tets.len() { if keep[e] { tets.push(mesh.tets[e]); region.push(mesh.region[e]); } }
    mesh.tets = tets;
    mesh.region = region;
    true
}

/// Removes body elements that stick out of their body: every element of a body that has a corner more
/// than a third of the local size outside it (a node the snapping could not move onto the surface).
/// The faces behind come to the surface and snap in the next round. Returns whether any went.
fn drop_spikes(mesh: &mut Mesh, bodies: &[BodyMesh], hloc: &[f64], air: u32) -> bool {
    let keep: Vec<bool> = (0..mesh.tets.len()).map(|e| {
        let r = mesh.region[e];
        if r == air || r as usize >= bodies.len() { return true; }
        let solid = bodies[r as usize].solid;
        mesh.tets[e].iter().all(|&n| solid.sdf(mesh.nodes[n as usize]) <= 0.33 * hloc[n as usize])
    }).collect();
    // Never empty a body: a body thinner than a cell keeps its elements.
    let mut left = vec![0usize; bodies.len()];
    for e in 0..mesh.tets.len() { let r = mesh.region[e] as usize; if r < bodies.len() && keep[e] { left[r] += 1; } }
    let keep: Vec<bool> = (0..mesh.tets.len()).map(|e| { let r = mesh.region[e] as usize; keep[e] || (r < bodies.len() && left[r] == 0) }).collect();
    if keep.iter().all(|k| *k) { return false; }
    // Inside an enclosure the element joins the surrounding air (the air volume stays whole).
    if air != NONE {
        for e in 0..mesh.tets.len() { if !keep[e] { mesh.region[e] = air; } }
        return true;
    }
    let mut tets = Vec::with_capacity(mesh.tets.len());
    let mut region = Vec::with_capacity(mesh.tets.len());
    for e in 0..mesh.tets.len() { if keep[e] { tets.push(mesh.tets[e]); region.push(mesh.region[e]); } }
    mesh.tets = tets;
    mesh.region = region;
    true
}

/// Drops nodes no element uses any more.
fn compact_nodes(mesh: &mut Mesh, hloc: &mut Vec<f64>) {
    let mut used = vec![u32::MAX; mesh.nodes.len()];
    let mut nodes = Vec::new();
    let mut hl = Vec::new();
    for t in mesh.tets.iter_mut() {
        for n in t.iter_mut() {
            let i = *n as usize;
            if used[i] == u32::MAX { used[i] = nodes.len() as u32; nodes.push(mesh.nodes[i]); hl.push(hloc[i]); }
            *n = used[i];
        }
    }
    for t in mesh.tris.iter_mut() { for n in t.iter_mut() { *n = used[*n as usize]; } }
    mesh.nodes = nodes;
    *hloc = hl;
}

fn boundary(tets: &[[u32; 4]], region: &[u32]) -> (Vec<[u32; 3]>, Vec<u32>, Vec<u32>) {
    let mut faces: HashMap<[u32; 3], (u32, u8)> = HashMap::with_capacity(tets.len() * 2);
    let mut pairs: Vec<(u32, u8, u32, u8)> = Vec::new();
    for (e, t) in tets.iter().enumerate() {
        for (f, lf) in TET_FACES.iter().enumerate() {
            let mut key = [t[lf[0]], t[lf[1]], t[lf[2]]];
            key.sort_unstable();
            if let Some((e2, f2)) = faces.remove(&key) {
                pairs.push((e2, f2, e as u32, f as u8));
            } else {
                faces.insert(key, (e as u32, f as u8));
            }
        }
    }
    let mut tris = Vec::new();
    let mut tr = Vec::new();
    let mut to = Vec::new();
    let tri_of = |e: u32, f: u8| { let t = tets[e as usize]; let lf = TET_FACES[f as usize]; [t[lf[0]], t[lf[1]], t[lf[2]]] };
    // Outer boundary (one side only).
    let mut singles: Vec<(u32, u8)> = faces.into_values().collect();
    singles.sort_unstable();
    for (e, f) in singles {
        tris.push(tri_of(e, f));
        tr.push(region[e as usize]);
        to.push(NONE);
    }
    pairs.sort_unstable();
    for (e1, f1, e2, f2) in pairs {
        let (r1, r2) = (region[e1 as usize], region[e2 as usize]);
        if r1 == r2 { continue; }
        tris.push(tri_of(e1, f1));
        tr.push(r1);
        to.push(r2);
        tris.push(tri_of(e2, f2));
        tr.push(r2);
        to.push(r1);
    }
    (tris, tr, to)
}

fn node_tets(mesh: &Mesh) -> Vec<Vec<u32>> {
    let mut inc = vec![Vec::new(); mesh.nodes.len()];
    for (e, t) in mesh.tets.iter().enumerate() { for &n in t { inc[n as usize].push(e as u32); } }
    inc
}

/// Whether moving `node` to `p` keeps its elements valid. Elements whose four corners all lie on the
/// boundary may flatten (they lie along the surface and are dropped afterwards, drop_slivers).
fn valid_after(mesh: &Mesh, incident: &[u32], node: usize, p: V3, min_ratio: f64, orig: &[f64], on_boundary: &[bool]) -> bool {
    for &e in incident {
        let t = mesh.tets[e as usize];
        let q: Vec<V3> = t.iter().map(|&i| if i as usize == node { p } else { mesh.nodes[i as usize] }).collect();
        let v = volume(q[0], q[1], q[2], q[3]);
        if v >= min_ratio * orig[e as usize] { continue; }
        if t.iter().all(|&i| on_boundary[i as usize]) && v > -0.02 * orig[e as usize].abs() { continue; }
        return false;
    }
    true
}

fn snap(mesh: &mut Mesh, bodies: &[BodyMesh], hloc: &[f64], incident: &[Vec<u32>], air: u32) {
    let orig: Vec<f64> = (0..mesh.tets.len()).map(|e| mesh.tet_volume(e)).collect();
    let mut on_boundary = vec![false; mesh.nodes.len()];
    for t in &mesh.tris { for &n in t { on_boundary[n as usize] = true; } }
    // The body each boundary node lies on (the lowest body index among its solid sides).
    let mut target = vec![NONE; mesh.nodes.len()];
    for (ti, t) in mesh.tris.iter().enumerate() {
        let (r, o) = (mesh.tri_region[ti], mesh.tri_other[ti]);
        if r == air && o == NONE { continue; }
        // A solid side of this triangle.
        let body = if r != air && r != NONE { if o != air && o != NONE { r.min(o) } else { r } } else { o };
        if body == NONE || body == air { continue; }
        for &n in t { let cur = &mut target[n as usize]; if *cur == NONE || body < *cur { *cur = body; } }
    }
    // Nodes on the enclosure's outer walls stay.
    for (ti, t) in mesh.tris.iter().enumerate() {
        if mesh.tri_other[ti] == NONE && mesh.tri_region[ti] == air { for &n in t { target[n as usize] = NONE; } }
    }
    for pass in 0..3 {
        for n in 0..mesh.nodes.len() {
            let b = target[n];
            if b == NONE { continue; }
            let solid = bodies[b as usize].solid;
            let p = mesh.nodes[n];
            let d = solid.sdf(p);
            let hl = hloc[n];
            // How far a node may travel: a little more than a cell (never less than half the mesh size:
            // next to a body's own grid planes the local spacing can be tiny).
            let reach = 1.2 * hl.max(0.5 * mesh.h);
            if d.abs() < 1e-9 * hl || d.abs() > reach { continue; }
            let q = solid.project(p, hl * 1e-3);
            if norm(sub(q, p)) > reach { continue; }
            let ratio = [0.15, 0.05, 0.01][pass];
            for f in [1.0, 0.75, 0.5, 0.25] {
                let c = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
                if valid_after(mesh, &incident[n], n, c, ratio, &orig, &on_boundary) { mesh.nodes[n] = c; break; }
            }
        }
    }
}

fn smooth(mesh: &mut Mesh, incident: &[Vec<u32>], passes: u32) {
    let mut on_boundary = vec![false; mesh.nodes.len()];
    for t in &mesh.tris { for &n in t { on_boundary[n as usize] = true; } }
    let mut nbrs: Vec<Vec<u32>> = vec![Vec::new(); mesh.nodes.len()];
    for t in &mesh.tets { for &a in t { for &b in t { if a != b { nbrs[a as usize].push(b); } } } }
    for v in nbrs.iter_mut() { v.sort_unstable(); v.dedup(); }
    for _ in 0..passes {
        let cur: Vec<f64> = (0..mesh.tets.len()).map(|e| mesh.tet_volume(e)).collect();
        for n in 0..mesh.nodes.len() {
            if on_boundary[n] || nbrs[n].is_empty() { continue; }
            let mut c = [0.0; 3];
            for &m in &nbrs[n] { for k in 0..3 { c[k] += mesh.nodes[m as usize][k]; } }
            for k in 0..3 { c[k] /= nbrs[n].len() as f64; }
            let p = mesh.nodes[n];
            let q = [p[0] + 0.5 * (c[0] - p[0]), p[1] + 0.5 * (c[1] - p[1]), p[2] + 0.5 * (c[2] - p[2])];
            // Accept only if the worst touching element gets better.
            let worst = |pos: V3| -> f64 {
                let mut w = f64::INFINITY;
                for &e in &incident[n] {
                    let t = mesh.tets[e as usize];
                    let pts: Vec<V3> = t.iter().map(|&i| if i as usize == n { pos } else { mesh.nodes[i as usize] }).collect();
                    let v = volume(pts[0], pts[1], pts[2], pts[3]);
                    let mut s = 0.0;
                    for (a, b) in [(0, 1), (1, 2), (0, 2), (0, 3), (1, 3), (2, 3)] { let d = sub(pts[a], pts[b]); s += dot(d, d); }
                    w = w.min(if v <= 0.0 { -1.0 } else { 12.0 * (3.0 * v).powf(2.0 / 3.0) / s });
                }
                w
            };
            let _ = &cur;
            if worst(q) > worst(p) { mesh.nodes[n] = q; }
        }
    }
}

fn tri_normal_area(mesh: &Mesh, t: &[u32; 3]) -> (V3, f64, V3) {
    let (a, b, c) = (mesh.nodes[t[0] as usize], mesh.nodes[t[1] as usize], mesh.nodes[t[2] as usize]);
    let n = cross(sub(b, a), sub(c, a));
    let area = 0.5 * norm(n);
    (normalize(n), area, [(a[0] + b[0] + c[0]) / 3.0, (a[1] + b[1] + c[1]) / 3.0, (a[2] + b[2] + c[2]) / 3.0])
}

fn group_faces(mesh: &mut Mesh, bodies: &[BodyMesh], air: u32, feature_angle: f64) {
    let nt = mesh.tris.len();
    let info: Vec<(V3, f64, V3)> = mesh.tris.iter().map(|t| tri_normal_area(mesh, t)).collect();
    // The geometric patch each triangle lies on (from the body's primitives); NO_PATCH: by normals.
    let patch: Vec<u32> = (0..nt).map(|ti| {
        let (r, o) = (mesh.tri_region[ti], mesh.tri_other[ti]);
        let body = if r != air && r != NONE { r } else { o };
        if body == NONE || body == air { crate::geom::NO_PATCH } else { bodies[body as usize].solid.patch(info[ti].2) }
    }).collect();
    // Edge → triangles on the same side (region, other).
    let mut edges: HashMap<(u32, u32, u32, u32), Vec<u32>> = HashMap::with_capacity(nt * 2);
    for (ti, t) in mesh.tris.iter().enumerate() {
        for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
            edges.entry((a.min(b), a.max(b), mesh.tri_region[ti], mesh.tri_other[ti])).or_default().push(ti as u32);
        }
    }
    let cos_limit = feature_angle.to_radians().cos();
    let mut face_of = vec![NONE; nt];
    let mut faces: Vec<Vec<u32>> = Vec::new();
    for seed in 0..nt {
        if face_of[seed] != NONE { continue; }
        let id = faces.len() as u32;
        let mut list = vec![seed as u32];
        face_of[seed] = id;
        let mut i = 0;
        while i < list.len() {
            let ti = list[i] as usize;
            i += 1;
            let t = mesh.tris[ti];
            for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
                if let Some(nbr) = edges.get(&(a.min(b), a.max(b), mesh.tri_region[ti], mesh.tri_other[ti])) {
                    for &tj in nbr {
                        let tj = tj as usize;
                        if face_of[tj] != NONE { continue; }
                        let same = if patch[ti] != crate::geom::NO_PATCH || patch[tj] != crate::geom::NO_PATCH { patch[ti] == patch[tj] } else { dot(info[ti].0, info[tj].0) >= cos_limit };
                        if same {
                            face_of[tj] = id;
                            list.push(tj as u32);
                        }
                    }
                }
            }
        }
        faces.push(list);
    }
    // Small faces (snapping leftovers along curved edges) merge into the neighbour they share most edge with.
    let mut side_area: HashMap<(u32, u32), f64> = HashMap::new();
    for ti in 0..nt { *side_area.entry((mesh.tri_region[ti], mesh.tri_other[ti])).or_default() += info[ti].1; }
    for _ in 0..3 {
        let areas: Vec<f64> = faces.iter().map(|f| f.iter().map(|&t| info[t as usize].1).sum()).collect();
        let mut changed = false;
        for fi in 0..faces.len() {
            if faces[fi].is_empty() { continue; }
            let t0 = faces[fi][0] as usize;
            let side = (mesh.tri_region[t0], mesh.tri_other[t0]);
            let total = side_area[&side];
            let small = areas[fi] <= 0.004 * total || faces[fi].len() <= 6;
            let mut shared: HashMap<u32, f64> = HashMap::new();
            let mut perimeter = 0.0;
            for &ti in &faces[fi] {
                let t = mesh.tris[ti as usize];
                for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
                    if let Some(nbr) = edges.get(&(a.min(b), a.max(b), side.0, side.1)) {
                        for &tj in nbr {
                            let g = face_of[tj as usize];
                            if g != fi as u32 && g != NONE {
                                let len = norm(sub(mesh.nodes[a as usize], mesh.nodes[b as usize]));
                                *shared.entry(g).or_default() += len;
                                perimeter += len;
                            }
                        }
                    }
                }
            }
            // A strip narrower than about a third of an element is a snapping leftover, not a face.
            let narrow = perimeter > 0.0 && 2.0 * areas[fi] / perimeter < 0.35 * mesh.h;
            if !small && !narrow { continue; }
            if let Some((&g, _)) = shared.iter().max_by(|a, b| a.1.partial_cmp(b.1).unwrap()) {
                let moved = std::mem::take(&mut faces[fi]);
                for &t in &moved { face_of[t as usize] = g; }
                faces[g as usize].extend(moved);
                changed = true;
            }
        }
        if !changed { break; }
    }
    // Compact and describe.
    let mut out: Vec<Face> = Vec::new();
    let mut tri_face = vec![NONE; nt];
    // Order: by region, then other, then size (largest first) — stable ids for the same geometry.
    let mut order: Vec<usize> = (0..faces.len()).filter(|&f| !faces[f].is_empty()).collect();
    order.sort_by(|&a, &b| {
        let (ta, tb) = (faces[a][0] as usize, faces[b][0] as usize);
        (mesh.tri_region[ta], mesh.tri_other[ta]).cmp(&(mesh.tri_region[tb], mesh.tri_other[tb])).then(faces[b].len().cmp(&faces[a].len()))
    });
    for fi in order {
        let list = &faces[fi];
        let mut area = 0.0;
        let mut c = [0.0; 3];
        let mut nrm = [0.0; 3];
        for &t in list {
            let (n, a, cc) = info[t as usize];
            area += a;
            for k in 0..3 { c[k] += cc[k] * a; nrm[k] += n[k] * a; }
        }
        for k in 0..3 { c[k] /= area.max(1e-300); }
        let id = out.len() as u32;
        for &t in list { tri_face[t as usize] = id; }
        let t0 = list[0] as usize;
        out.push(Face { region: mesh.tri_region[t0], other: mesh.tri_other[t0], area, centroid: c, normal: normalize(nrm), tris: list.clone() });
    }
    mesh.faces = out;
    mesh.tri_face = tri_face;
}

fn make_quadratic(mesh: &mut Mesh, bodies: &[BodyMesh], air: u32) {
    let mut mid: HashMap<(u32, u32), u32> = HashMap::with_capacity(mesh.tets.len() * 2);
    let mut tet10 = Vec::with_capacity(mesh.tets.len());
    for t in &mesh.tets {
        let mut e10 = [0u32; 10];
        e10[..4].copy_from_slice(t);
        for (s, &(a, b)) in TET10_EDGES.iter().enumerate() {
            let (x, y) = (t[a].min(t[b]), t[a].max(t[b]));
            let next = mesh.nodes.len() as u32;
            let id = *mid.entry((x, y)).or_insert_with(|| {
                let (p, q) = (mesh.nodes[x as usize], mesh.nodes[y as usize]);
                mesh.nodes.push([(p[0] + q[0]) / 2.0, (p[1] + q[1]) / 2.0, (p[2] + q[2]) / 2.0]);
                next
            });
            e10[4 + s] = id;
        }
        tet10.push(e10);
    }
    let mut tri_mid = Vec::with_capacity(mesh.tris.len());
    for (ti, t) in mesh.tris.iter().enumerate() {
        let mut m = [0u32; 3];
        for (s, (a, b)) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])].into_iter().enumerate() {
            let id = mid[&(a.min(b), a.max(b))];
            m[s] = id;
            // Curved surfaces: the mid-side node goes onto the body surface (a small move only).
            let (r, o) = (mesh.tri_region[ti], mesh.tri_other[ti]);
            let body = if r != air && r != NONE { r } else { o };
            if body != NONE && body != air && !(r == air && o == NONE) {
                let solid = bodies[body as usize].solid;
                let p = mesh.nodes[id as usize];
                let len = norm(sub(mesh.nodes[a as usize], mesh.nodes[b as usize]));
                let d = solid.sdf(p);
                if d.abs() > 1e-9 * len && d.abs() < 0.15 * len {
                    let q = solid.project(p, len * 1e-3);
                    if norm(sub(q, p)) < 0.15 * len { mesh.nodes[id as usize] = q; }
                }
            }
        }
        tri_mid.push(m);
    }
    // Curved edges must not turn an element inside out: where the Jacobian goes negative (at the
    // corners or the integration points), its mid-side nodes go back to the straight edge.
    let straight = |mesh: &Mesh, e: &[u32; 10], s: usize| -> V3 {
        let (a, b) = TET10_EDGES[s];
        let (p, q) = (mesh.nodes[e[a] as usize], mesh.nodes[e[b] as usize]);
        [(p[0] + q[0]) / 2.0, (p[1] + q[1]) / 2.0, (p[2] + q[2]) / 2.0]
    };
    for _ in 0..4 {
        let mut fixed_any = false;
        for e in &tet10 {
            let x: Vec<V3> = e.iter().map(|&n| mesh.nodes[n as usize]).collect();
            let ok = crate::fem::node_coords(10).iter().chain(crate::fem::rule(2).iter().map(|q| &q.l).collect::<Vec<_>>().into_iter())
                .map(|l| crate::fem::point(&x, l, 1.0).map(|g| g.w).unwrap_or(-1.0))
                .fold((f64::INFINITY, 0.0f64), |(lo, hi), d| (lo.min(d), hi.max(d)));
            // Invalid, or so distorted that the strains at its corners would be meaningless.
            let ok = ok.0 > 0.25 * ok.1;
            if !ok {
                for s in 0..6 { let m = straight(mesh, e, s); mesh.nodes[e[4 + s] as usize] = m; }
                fixed_any = true;
            }
        }
        if !fixed_any { break; }
    }
    mesh.tet10 = tet10;
    mesh.tri_mid = tri_mid;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geom::Node;

    fn solid(json: &str) -> Solid { Solid::new(&serde_json::from_str::<Node>(json).unwrap()).unwrap() }

    fn opts(size: f64) -> MeshOptions {
        MeshOptions { size, order: 1, snap: true, smooth: 2, feature_angle: 35.0, enclosure: None, max_nodes: 2_000_000, split: vec![] }
    }

    #[test]
    fn box_mesh_has_exact_volume_and_six_faces() {
        let s = solid(r#"{"type":"box","size":[10,4,2]}"#);
        let n: Node = serde_json::from_str(r#"{"type":"box","size":[10,4,2]}"#).unwrap();
        let mut planes = [vec![], vec![], vec![]];
        crate::geom::grid_planes(&n, &mut planes);
        let b = BodyMesh { solid: &s, planes, size: None };
        let mut ctx = crate::Ctx::silent();
        let m = generate(&[b], &opts(1.0), &mut ctx).unwrap();
        let v: f64 = (0..m.tets.len()).map(|e| m.tet_volume(e)).sum();
        assert!((v - 80.0).abs() < 1e-6, "volume {v}");
        assert_eq!(m.faces.len(), 6);
        assert!(m.tets.iter().enumerate().all(|(e, _)| m.tet_volume(e) > 0.0));
    }

    #[test]
    fn cylinder_mesh_is_close_and_valid() {
        let s = solid(r#"{"type":"cylinder","radius":5,"height":10}"#);
        let n: Node = serde_json::from_str(r#"{"type":"cylinder","radius":5,"height":10}"#).unwrap();
        let mut planes = [vec![], vec![], vec![]];
        crate::geom::grid_planes(&n, &mut planes);
        let b = BodyMesh { solid: &s, planes, size: None };
        let mut ctx = crate::Ctx::silent();
        let mut o = opts(0.8);
        o.order = 2;
        let m = generate(&[b], &o, &mut ctx).unwrap();
        let v: f64 = (0..m.tets.len()).map(|e| m.tet_volume(e)).sum();
        let exact = std::f64::consts::PI * 25.0 * 10.0;
        assert!((v - exact).abs() / exact < 0.03, "volume {v} vs {exact}");
        assert!(m.tets.iter().enumerate().all(|(e, _)| m.tet_volume(e) > 0.0));
        // Side, top and bottom.
        assert_eq!(m.faces.len(), 3, "faces {:?}", m.faces.iter().map(|f| (f.area, f.normal)).collect::<Vec<_>>());
        assert!(!m.tet10.is_empty());
    }

    #[test]
    fn curved_surfaces_have_no_spikes() {
        // Every surface node of a sphere and a torus lies on the surface (within a third of a cell):
        // no element corner is left sticking out.
        for (shape, size) in [(r#"{"type":"sphere","radius":25}"#, 2.2), (r#"{"type":"sphere","radius":25}"#, 3.7), (r#"{"type":"torus","major":40,"minor":10}"#, 2.5)] {
            let s = solid(shape);
            let b = BodyMesh { solid: &s, planes: [vec![], vec![], vec![]], size: None };
            let m = generate(&[b], &opts(size), &mut crate::Ctx::silent()).unwrap();
            let worst = m.tris.iter().flat_map(|t| t.iter()).map(|&n| s.sdf(m.nodes[n as usize]).abs()).fold(0.0, f64::max);
            assert!(worst < size / 3.0, "{shape} h {size}: a surface node {worst} off the surface");
            assert!(m.tets.iter().enumerate().all(|(e, _)| m.tet_volume(e) > 0.0));
        }
    }

    #[test]
    fn stepped_shaft_surface_is_whole() {
        // A shaft of three turned cylinders (along X): its own grid planes sit close to the grid lines,
        // which once left a row of nodes unsnapped (a groove along the largest step).
        let job = r#"{ "analysis": "mesh", "unit": 0.001, "mesh": { "size": 5.71, "order": 1 },
          "bodies": [{ "id": "s", "material": "steel", "shape": { "type": "union", "children": [
            { "type": "cylinder", "radius": 20, "height": 80, "placement": { "position": [-90, 0, 0], "rotation": [0, 90, 0] } },
            { "type": "cylinder", "radius": 15, "height": 120, "placement": { "position": [10, 0, 0], "rotation": [0, 90, 0] } },
            { "type": "cylinder", "radius": 12.5, "height": 60, "placement": { "position": [100, 0, 0], "rotation": [0, 90, 0] } } ] } }] }"#;
        let job: crate::model::Job = serde_json::from_str(job).unwrap();
        let solid = crate::geom::Solid::new(&job.bodies[0].shape).unwrap();
        let model = crate::model::Model::build(job, &mut crate::Ctx::silent()).unwrap();
        let m = &model.mesh;
        let worst = m.tris.iter().flat_map(|t| t.iter()).map(|&n| solid.sdf(m.nodes[n as usize]).abs()).fold(0.0, f64::max);
        assert!(worst < 5.71 / 3.0, "a surface node {worst} mm off the surface");
    }

    #[test]
    fn enclosure_adds_air_region() {
        let s = solid(r#"{"type":"sphere","radius":2}"#);
        let b = BodyMesh { solid: &s, planes: [vec![], vec![], vec![]], size: None };
        let mut ctx = crate::Ctx::silent();
        let mut o = opts(0.8);
        o.enclosure = Some(([-5.0; 3], [5.0; 3]));
        let m = generate(&[b], &o, &mut ctx).unwrap();
        assert_eq!(m.nregions, 2);
        let v: f64 = (0..m.tets.len()).map(|e| m.tet_volume(e)).sum();
        // The enclosure stays whole (flat slivers removed at the surface are negligible).
        assert!((v - 1000.0).abs() < 1.0, "volume {v}");
        assert!(m.faces.iter().any(|f| f.region == 1 && f.other == NONE));
        assert!(m.faces.iter().any(|f| f.region == 0 && f.other == 1));
    }
}

#[cfg(test)]
mod debug_tests {
    use super::*;
    use crate::geom::Node;
    #[test]
    #[ignore]
    fn dump_cylinder_faces() {
        let n: Node = serde_json::from_str(r#"{"type":"cylinder","radius":5,"height":10}"#).unwrap();
        let s = Solid::new(&n).unwrap();
        let mut planes = [vec![], vec![], vec![]];
        crate::geom::grid_planes(&n, &mut planes);
        let b = BodyMesh { solid: &s, planes, size: None };
        let mut ctx = crate::Ctx::silent();
        let o = MeshOptions { size: 0.8, order: 1, snap: true, smooth: 2, feature_angle: 35.0, enclosure: None, max_nodes: 2_000_000, split: vec![] };
        let m = generate(&[b], &o, &mut ctx).unwrap();
        for f in &m.faces {
            let mut lo = [f64::INFINITY; 3]; let mut hi = [f64::NEG_INFINITY; 3];
            for &t in &f.tris { for &nn in &m.tris[t as usize] { let p = m.nodes[nn as usize]; for k in 0..3 { lo[k] = lo[k].min(p[k]); hi[k] = hi[k].max(p[k]); } } }
            let maxd = f.tris.iter().flat_map(|&t| m.tris[t as usize]).map(|nn| s.sdf(m.nodes[nn as usize]).abs()).fold(0.0, f64::max);
            if f.tris.len() == 20 && f.normal[0] > 0.5 { for &t in f.tris.iter().take(6) { let tt = m.tris[t as usize]; println!("  tri {:?}", tt.map(|nn| m.nodes[nn as usize].map(|v| (v * 100.0).round() / 100.0))); } }
            println!("ntri {} area {:.2} n {:?} lo {:?} hi {:?} maxsdf {:.3}", f.tris.len(), f.area, f.normal.map(|v| (v * 100.0).round() / 100.0), lo.map(|v| (v * 100.0).round() / 100.0), hi.map(|v| (v * 100.0).round() / 100.0), maxd);
        }
    }
}
