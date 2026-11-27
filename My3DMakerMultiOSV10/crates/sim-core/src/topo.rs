//! Topology optimisation: minimum compliance for a volume fraction, SIMP penalisation on a voxel
//! grid of the design body, sensitivity filtering and optimality-criteria updates. Supports and
//! loads come from the body's faces (mapped onto the voxel nodes); a layer of voxels at loaded and
//! supported faces stays solid. The result is the density field and its iso-surface.

use crate::geom::{self, V3};
use crate::model::{enabled, kind, num, vec3, Model};
use crate::out::Out;
use crate::sparse::{pcg, Csr};
use crate::Ctx;
use serde_json::json;
use std::collections::HashMap;

/// Stiffness of a cube (edge h) of unit modulus, 24×24, by 2×2×2 Gauss integration.
fn hex_stiffness(h: f64, nu: f64) -> Vec<f64> {
    let d = crate::fem::d_iso(1.0, nu);
    let g = 1.0 / 3f64.sqrt();
    let corners: [[f64; 3]; 8] = [[-1., -1., -1.], [1., -1., -1.], [1., 1., -1.], [-1., 1., -1.], [-1., -1., 1.], [1., -1., 1.], [1., 1., 1.], [-1., 1., 1.]];
    let mut k = vec![0.0; 576];
    for &a in &[-g, g] { for &b in &[-g, g] { for &c in &[-g, g] {
        // dN/dx = dN/dξ · 2/h; weight = (h/2)³
        let dn: Vec<V3> = corners.iter().map(|q| [
            q[0] * (1.0 + q[1] * b) * (1.0 + q[2] * c) / 8.0 * 2.0 / h,
            q[1] * (1.0 + q[0] * a) * (1.0 + q[2] * c) / 8.0 * 2.0 / h,
            q[2] * (1.0 + q[0] * a) * (1.0 + q[1] * b) / 8.0 * 2.0 / h,
        ]).collect();
        let gp = crate::fem::Gp { w: (h / 2.0).powi(3), n: vec![0.125; 8], dn };
        let ke = crate::fem::stiffness(&[gp], &d);
        for i in 0..576 { k[i] += ke[i]; }
    } } }
    k
}

pub fn run_topology(model: &Model, out: &mut Out, ctx: &mut Ctx) -> Result<(), String> {
    let s = &model.job.settings;
    let body = s.get("body").and_then(|v| v.as_str()).and_then(|id| model.body_index(id)).unwrap_or(0) as usize;
    let solid = crate::geom::Solid::new(&model.bodies[body].shape)?;
    let (lo, hi) = solid.bbox;
    let ext = geom::sub(hi, lo);
    let res = model.setting_u("resolution", 40).clamp(8, 120) as f64;
    let mut hv = ext[0].max(ext[1]).max(ext[2]) / res;
    let max_cells = model.setting_u("maxCells", 40_000);
    while (ext[0] / hv).ceil() * (ext[1] / hv).ceil() * (ext[2] / hv).ceil() > max_cells as f64 { hv *= 1.1; }
    let dims = [(ext[0] / hv).ceil().max(1.0) as usize, (ext[1] / hv).ceil().max(1.0) as usize, (ext[2] / hv).ceil().max(1.0) as usize];
    let cell_id = |i: usize, j: usize, k: usize| (k * dims[1] + j) * dims[0] + i;
    let ncell = dims[0] * dims[1] * dims[2];
    let mut active = vec![false; ncell];
    for k in 0..dims[2] { for j in 0..dims[1] { for i in 0..dims[0] {
        let c = [lo[0] + (i as f64 + 0.5) * hv, lo[1] + (j as f64 + 0.5) * hv, lo[2] + (k as f64 + 0.5) * hv];
        active[cell_id(i, j, k)] = solid.inside(c);
    } } }
    let nd = [dims[0] + 1, dims[1] + 1, dims[2] + 1];
    let gnode = |i: usize, j: usize, k: usize| (k * nd[1] + j) * nd[0] + i;
    let cell_nodes = |i: usize, j: usize, k: usize| -> [usize; 8] {
        [gnode(i, j, k), gnode(i + 1, j, k), gnode(i + 1, j + 1, k), gnode(i, j + 1, k), gnode(i, j, k + 1), gnode(i + 1, j, k + 1), gnode(i + 1, j + 1, k + 1), gnode(i, j + 1, k + 1)]
    };
    let mut node_map: HashMap<usize, usize> = HashMap::new();
    let mut cells: Vec<(usize, [usize; 8])> = Vec::new();
    for k in 0..dims[2] { for j in 0..dims[1] { for i in 0..dims[0] {
        if !active[cell_id(i, j, k)] { continue; }
        let g = cell_nodes(i, j, k);
        let mut loc = [0usize; 8];
        for (q, &gn) in g.iter().enumerate() { let next = node_map.len(); loc[q] = *node_map.entry(gn).or_insert(next); }
        cells.push((cell_id(i, j, k), loc));
    } } }
    if cells.len() < 8 { return Err("topology.tooFewCells".into()); }
    let nn = node_map.len();
    let mut xyz = vec![[0.0; 3]; nn];
    for (&g, &l) in &node_map {
        let (i, j, k) = (g % nd[0], (g / nd[0]) % nd[1], g / (nd[0] * nd[1]));
        xyz[l] = [lo[0] + i as f64 * hv, lo[1] + j as f64 * hv, lo[2] + k as f64 * hv];
    }
    // Face nodes of the tetrahedral mesh → nearest used voxel nodes.
    let to_voxel = |p: V3| -> Option<usize> {
        let idx = [((p[0] - lo[0]) / hv).round() as isize, ((p[1] - lo[1]) / hv).round() as isize, ((p[2] - lo[2]) / hv).round() as isize];
        let mut best: Option<(f64, usize)> = None;
        for dz in -1..=1 { for dy in -1..=1 { for dx in -1..=1 {
            let (i, j, k) = (idx[0] + dx, idx[1] + dy, idx[2] + dz);
            if i < 0 || j < 0 || k < 0 || i as usize >= nd[0] || j as usize >= nd[1] || k as usize >= nd[2] { continue; }
            if let Some(&l) = node_map.get(&gnode(i as usize, j as usize, k as usize)) {
                let d = geom::norm(geom::sub(xyz[l], p));
                if best.map_or(true, |b| d < b.0) { best = Some((d, l)); }
            }
        } } }
        best.map(|b| b.1)
    };
    let mut fixed = vec![false; 3 * nn];
    let mut f = vec![0.0; 3 * nn];
    let mut touched = vec![false; nn];
    let unit = model.unit();
    for bc in &model.job.bcs {
        if !enabled(bc) { continue; }
        let faces = model.faces_of(bc);
        let mut nodes: Vec<usize> = model.mesh.face_nodes(&faces).iter().filter(|&&n| (n as usize) < model.mesh.ncorner).filter_map(|&n| to_voxel(model.mesh.nodes[n as usize])).collect();
        nodes.sort_unstable();
        nodes.dedup();
        if nodes.is_empty() { continue; }
        for &n in &nodes { touched[n] = true; }
        match kind(bc) {
            "fixed" | "displacement" => for &n in &nodes { for c in 0..3 { fixed[3 * n + c] = true; } },
            "force" | "pressure" | "bearing" => {
                let total = if kind(bc) == "pressure" {
                    let area = model.faces_area(&faces);
                    let nrm = faces.iter().fold([0.0; 3], |acc, &fi| geom::add(acc, geom::scale(model.mesh.faces[fi].normal, model.mesh.faces[fi].area)));
                    geom::scale(geom::normalize(nrm), -num(bc, "value", 0.0) * area)
                } else { vec3(bc, "vector").unwrap_or([0.0; 3]) };
                for &n in &nodes { for c in 0..3 { f[3 * n + c] += total[c] / nodes.len() as f64; } }
            }
            _ => {}
        }
    }
    if !fixed.iter().any(|x| *x) { return Err("topology.noSupport".into()); }
    if f.iter().all(|x| *x == 0.0) { return Err("topology.noLoad".into()); }
    let mat = &model.mats[body];
    let e0 = mat.young.max(1.0);
    let ke = hex_stiffness(hv * unit, mat.poisson);
    let ne = cells.len();
    // Non-design: cells with a loaded or supported node.
    let frozen: Vec<bool> = cells.iter().map(|(_, l)| l.iter().any(|&q| touched[q])).collect();
    let vf = model.setting_f("volumeFraction", 0.4).clamp(0.05, 0.95);
    let penal = model.setting_f("penalty", 3.0);
    let rmin = model.setting_f("filterRadius", 1.5).max(1.0);
    let max_iter = model.setting_u("iterations", 40).clamp(1, 300);
    let move_lim = 0.2;
    let emin = 1e-6;
    let mut rho: Vec<f64> = (0..ne).map(|i| if frozen[i] { 1.0 } else { vf }).collect();
    // Filter neighbours (cell centres within rmin cells).
    let centre = |cid: usize| -> [f64; 3] { [(cid % dims[0]) as f64, ((cid / dims[0]) % dims[1]) as f64, (cid / (dims[0] * dims[1])) as f64] };
    let cidx: HashMap<usize, usize> = cells.iter().enumerate().map(|(i, c)| (c.0, i)).collect();
    let r = rmin.ceil() as isize;
    let neighbours: Vec<Vec<(usize, f64)>> = cells.iter().map(|(cid, _)| {
        let c = centre(*cid);
        let mut v = Vec::new();
        for dz in -r..=r { for dy in -r..=r { for dx in -r..=r {
            let (i, j, k) = (c[0] as isize + dx, c[1] as isize + dy, c[2] as isize + dz);
            if i < 0 || j < 0 || k < 0 || i as usize >= dims[0] || j as usize >= dims[1] || k as usize >= dims[2] { continue; }
            let d = ((dx * dx + dy * dy + dz * dz) as f64).sqrt();
            if d >= rmin { continue; }
            if let Some(&q) = cidx.get(&cell_id(i as usize, j as usize, k as usize)) { v.push((q, rmin - d)); }
        } } }
        v
    }).collect();
    let mut k = Csr::pattern(nn, 3, &mut cells.iter().map(|(_, l)| l.iter().map(|&q| q as u32).collect()));
    let mut u = vec![0.0; 3 * nn];
    let mut history = Vec::new();
    let n_design = frozen.iter().filter(|x| !**x).count().max(1) as f64;
    for it in 0..max_iter {
        for v in k.val.iter_mut() { *v = 0.0; }
        for (i, (_, l)) in cells.iter().enumerate() {
            let s = e0 * (emin + rho[i].powf(penal) * (1.0 - emin));
            let dofs: Vec<usize> = l.iter().flat_map(|&q| [3 * q, 3 * q + 1, 3 * q + 2]).collect();
            let kes: Vec<f64> = ke.iter().map(|v| v * s).collect();
            k.add_element(&dofs, &kes);
        }
        let mut kc = k.clone();
        let mut rhs = f.clone();
        let zero = vec![0.0; 3 * nn];
        kc.constrain(&fixed, &zero, &mut rhs);
        let pre = crate::sparse::precond(&kc, &xyz.iter().map(|p| geom::scale(*p, unit)).collect::<Vec<_>>(), 3);
        let info = pcg(&kc, &rhs, &mut u, pre.as_ref(), 1e-7, 20000, None)?;
        if !info.converged { return Err("solver.noConvergence".into()); }
        let compliance: f64 = f.iter().zip(u.iter()).map(|(a, b)| a * b).sum();
        // Sensitivities.
        let mut dc = vec![0.0; ne];
        for (i, (_, l)) in cells.iter().enumerate() {
            let ue: Vec<f64> = l.iter().flat_map(|&q| [u[3 * q], u[3 * q + 1], u[3 * q + 2]]).collect();
            let mut e = 0.0;
            for a in 0..24 { let mut s = 0.0; for b in 0..24 { s += ke[a * 24 + b] * ue[b]; } e += ue[a] * s; }
            dc[i] = -penal * rho[i].powf(penal - 1.0) * (1.0 - emin) * e0 * e;
        }
        let dcf: Vec<f64> = (0..ne).map(|i| {
            let (mut num_, mut den) = (0.0, 0.0);
            for &(q, w) in &neighbours[i] { num_ += w * rho[q] * dc[q]; den += w; }
            num_ / (rho[i].max(1e-3) * den.max(1e-300))
        }).collect();
        // Optimality criteria with bisection on the volume multiplier.
        let (mut l1, mut l2) = (1e-12f64, 1e12f64);
        let mut new = rho.clone();
        while (l2 - l1) / (l1 + l2) > 1e-4 {
            let lm = (l1 * l2).sqrt();
            let mut vol = 0.0;
            for i in 0..ne {
                if frozen[i] { new[i] = 1.0; continue; }
                let b = (-dcf[i] / lm).max(0.0).sqrt();
                new[i] = (rho[i] * b).clamp((rho[i] - move_lim).max(1e-3), (rho[i] + move_lim).min(1.0));
                vol += new[i];
            }
            if vol > vf * n_design { l1 = lm; } else { l2 = lm; }
        }
        let change = new.iter().zip(rho.iter()).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
        rho = new;
        let volume = rho.iter().zip(frozen.iter()).filter(|(_, fz)| !**fz).map(|(r, _)| r).sum::<f64>() / n_design;
        history.push(json!({ "iteration": it + 1, "compliance": compliance, "volume": volume, "change": change }));
        ctx.step(0.2 + 0.75 * (it + 1) as f64 / max_iter as f64, "progress.topology")?;
        if change < 0.01 && it > 5 { break; }
    }
    // Densities on the whole grid (−1: outside the body), the iso-surface by marching tetrahedra.
    let mut grid = vec![-1.0; ncell];
    for (i, (cid, _)) in cells.iter().enumerate() { grid[*cid] = rho[i]; }
    let threshold = model.setting_f("threshold", 0.5);
    let mut nodal = vec![0.0; nd[0] * nd[1] * nd[2]];
    let mut cnt = vec![0.0; nodal.len()];
    for k2 in 0..dims[2] { for j in 0..dims[1] { for i in 0..dims[0] {
        let v = grid[cell_id(i, j, k2)].max(0.0);
        for g in cell_nodes(i, j, k2) { nodal[g] += v; cnt[g] += 1.0; }
    } } }
    // Outside the bounding grid counts as void (the surface closes).
    for g in 0..nodal.len() { nodal[g] /= 8.0f64.max(cnt[g]).max(8.0); }
    let tris = iso_surface(&nodal, nd, lo, hv, threshold);
    let kept_mass = rho.iter().filter(|r| **r >= threshold).count() as f64 / ne as f64;
    let gv = out.f32s(&grid);
    let tv = out.f32s(&tris);
    out.set("topology", json!({
        "dims": dims, "origin": lo, "spacing": hv, "density": gv, "surface": tv, "threshold": threshold,
        "history": history, "cells": ne, "volumeFraction": vf, "keptFraction": kept_mass, "body": model.bodies[body].id,
    }));
    Ok(())
}

/// Marching tetrahedra (six Kuhn tetrahedra per cell) on nodal values: triangles (x y z × 3 each).
pub fn iso_surface(val: &[f64], nd: [usize; 3], lo: V3, h: f64, iso: f64) -> Vec<f64> {
    const PATHS: [[usize; 3]; 6] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let gid = |i: usize, j: usize, k: usize| (k * nd[1] + j) * nd[0] + i;
    let mut out = Vec::new();
    for k in 0..nd[2] - 1 { for j in 0..nd[1] - 1 { for i in 0..nd[0] - 1 {
        for path in PATHS {
            let mut c = [0usize; 3];
            let mut ids = [gid(i, j, k); 4];
            let mut pos = [[lo[0] + i as f64 * h, lo[1] + j as f64 * h, lo[2] + k as f64 * h]; 4];
            for (s, &axis) in path.iter().enumerate() {
                c[axis] = 1;
                ids[s + 1] = gid(i + c[0], j + c[1], k + c[2]);
                pos[s + 1] = [lo[0] + (i + c[0]) as f64 * h, lo[1] + (j + c[1]) as f64 * h, lo[2] + (k + c[2]) as f64 * h];
            }
            let v: Vec<f64> = ids.iter().map(|&q| val[q]).collect();
            let inside: Vec<usize> = (0..4).filter(|&q| v[q] >= iso).collect();
            let outside: Vec<usize> = (0..4).filter(|&q| v[q] < iso).collect();
            if inside.is_empty() || outside.is_empty() { continue; }
            let cut = |a: usize, b: usize| -> V3 { let t = (iso - v[a]) / (v[b] - v[a]); [pos[a][0] + t * (pos[b][0] - pos[a][0]), pos[a][1] + t * (pos[b][1] - pos[a][1]), pos[a][2] + t * (pos[b][2] - pos[a][2])] };
            let mut tri_list: Vec<[V3; 3]> = Vec::new();
            if inside.len() == 1 || outside.len() == 1 {
                let (lone, rest) = if inside.len() == 1 { (inside[0], &outside) } else { (outside[0], &inside) };
                tri_list.push([cut(lone, rest[0]), cut(lone, rest[1]), cut(lone, rest[2])]);
            } else {
                let (a, b) = (inside[0], inside[1]);
                let (cc, d) = (outside[0], outside[1]);
                let (p1, p2, p3, p4) = (cut(a, cc), cut(a, d), cut(b, d), cut(b, cc));
                tri_list.push([p1, p2, p3]);
                tri_list.push([p1, p3, p4]);
            }
            // Outward: from the solid (high values) towards the void.
            let cin = inside.iter().fold([0.0; 3], |s, &q| geom::add(s, pos[q]));
            let cout = outside.iter().fold([0.0; 3], |s, &q| geom::add(s, pos[q]));
            let dir = geom::sub(geom::scale(cout, 1.0 / outside.len() as f64), geom::scale(cin, 1.0 / inside.len() as f64));
            for mut t in tri_list {
                let n = geom::cross(geom::sub(t[1], t[0]), geom::sub(t[2], t[0]));
                if geom::dot(n, dir) < 0.0 { t.swap(1, 2); }
                for p in t { out.extend_from_slice(&p); }
            }
        }
    } } }
    out
}

#[cfg(test)]
mod tests {
    use crate::out::decode;
    use crate::run_job_json;

    #[test]
    fn cantilever_plate_reduces_compliance_per_volume() {
        let job = r#"{ "analysis": "topology", "unit": 0.001,
          "bodies": [{ "id": "b1", "material": "steel", "shape": { "type": "box", "size": [60, 30, 6], "placement": { "position": [30, 0, 0] } } }],
          "mesh": { "size": 5 },
          "bcs": [
            { "type": "fixed", "faces": [{ "body": "b1", "c": [0, 0, 0], "n": [-1, 0, 0], "a": 180 }] },
            { "type": "force", "vector": [0, -1000, 0], "faces": [{ "body": "b1", "c": [60, 0, 0], "n": [1, 0, 0], "a": 180 }] }
          ], "settings": { "resolution": 30, "iterations": 15, "volumeFraction": 0.4 } }"#;
        let (v, _) = decode(&run_job_json(job, &mut |_, _| true).unwrap()).unwrap();
        let h = v["topology"]["history"].as_array().unwrap();
        let c0 = h[0]["compliance"].as_f64().unwrap();
        let c1 = h.last().unwrap()["compliance"].as_f64().unwrap();
        let vol = h.last().unwrap()["volume"].as_f64().unwrap();
        assert!((vol - 0.4).abs() < 0.02, "volume {vol}");
        assert!(c1 < c0, "compliance {c0} → {c1}");
        assert!(v["topology"]["surface"]["n"].as_u64().unwrap() > 0);
    }
}
