//! Field values on section planes (for fields that live in the air as well as in the bodies):
//! the three mid-planes of the meshed domain, sampled on a regular grid (NaN outside the mesh).

use crate::geom::V3;
use crate::model::Model;
use crate::out::Out;
use serde_json::{json, Value};

pub struct Locator {
    lo: V3,
    cell: f64,
    dims: [usize; 3],
    buckets: Vec<Vec<u32>>,
}

impl Locator {
    pub fn new(model: &Model) -> Locator {
        let mesh = &model.mesh;
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        for p in &mesh.nodes[..mesh.ncorner] { for k in 0..3 { lo[k] = lo[k].min(p[k]); hi[k] = hi[k].max(p[k]); } }
        let n = mesh.tets.len().max(1) as f64;
        let vol = (0..3).map(|k| (hi[k] - lo[k]).max(1e-12)).product::<f64>();
        let cell = (vol / n * 8.0).cbrt().max(1e-12);
        let dims = [((hi[0] - lo[0]) / cell) as usize + 1, ((hi[1] - lo[1]) / cell) as usize + 1, ((hi[2] - lo[2]) / cell) as usize + 1];
        let mut buckets = vec![Vec::new(); dims[0] * dims[1] * dims[2]];
        for (e, t) in mesh.tets.iter().enumerate() {
            let mut a = [f64::INFINITY; 3];
            let mut b = [f64::NEG_INFINITY; 3];
            for &i in t { let p = mesh.nodes[i as usize]; for k in 0..3 { a[k] = a[k].min(p[k]); b[k] = b[k].max(p[k]); } }
            let i0: Vec<usize> = (0..3).map(|k| ((a[k] - lo[k]) / cell) as usize).collect();
            let i1: Vec<usize> = (0..3).map(|k| (((b[k] - lo[k]) / cell) as usize).min(dims[k] - 1)).collect();
            for x in i0[0]..=i1[0] { for y in i0[1]..=i1[1] { for z in i0[2]..=i1[2] { buckets[(z * dims[1] + y) * dims[0] + x].push(e as u32); } } }
        }
        Locator { lo, cell, dims, buckets }
    }

    /// The element containing p and its barycentric coordinates.
    pub fn locate(&self, model: &Model, p: V3) -> Option<(usize, [f64; 4])> {
        let idx: Vec<isize> = (0..3).map(|k| ((p[k] - self.lo[k]) / self.cell).floor() as isize).collect();
        if (0..3).any(|k| idx[k] < 0 || idx[k] as usize >= self.dims[k]) { return None; }
        let b = &self.buckets[(idx[2] as usize * self.dims[1] + idx[1] as usize) * self.dims[0] + idx[0] as usize];
        for &e in b {
            let t = model.mesh.tets[e as usize];
            let q: Vec<V3> = t.iter().map(|&i| model.mesh.nodes[i as usize]).collect();
            let v = crate::mesh::volume(q[0], q[1], q[2], q[3]);
            if v <= 0.0 { continue; }
            let l1 = crate::mesh::volume(q[0], p, q[2], q[3]) / v;
            let l2 = crate::mesh::volume(q[0], q[1], p, q[3]) / v;
            let l3 = crate::mesh::volume(q[0], q[1], q[2], p) / v;
            let l0 = 1.0 - l1 - l2 - l3;
            let tol = -1e-9;
            if l0 >= tol && l1 >= tol && l2 >= tol && l3 >= tol { return Some((e as usize, [l0, l1, l2, l3])); }
        }
        None
    }
}

/// Samples nodal fields (corner-linear) on the three mid-planes.
pub fn mid_slices(model: &Model, out: &mut Out, fields: &[(&str, &[f64])]) -> Value {
    let loc = Locator::new(model);
    let mesh = &model.mesh;
    let mut lo = [f64::INFINITY; 3];
    let mut hi = [f64::NEG_INFINITY; 3];
    for p in &mesh.nodes[..mesh.ncorner] { for k in 0..3 { lo[k] = lo[k].min(p[k]); hi[k] = hi[k].max(p[k]); } }
    let res = 72usize;
    let mut planes = Vec::new();
    for axis in 0..3 {
        let (u, v) = match axis { 0 => (1, 2), 1 => (0, 2), _ => (0, 1) };
        let at = 0.5 * (lo[axis] + hi[axis]);
        let (nu, nv) = (res, ((res as f64) * (hi[v] - lo[v]) / (hi[u] - lo[u]).max(1e-12)).round().clamp(8.0, 160.0) as usize);
        let mut samples: Vec<Option<(usize, [f64; 4])>> = Vec::with_capacity(nu * nv);
        for j in 0..nv {
            for i in 0..nu {
                let mut p = [0.0; 3];
                p[axis] = at;
                p[u] = lo[u] + (hi[u] - lo[u]) * (i as f64 + 0.5) / nu as f64;
                p[v] = lo[v] + (hi[v] - lo[v]) * (j as f64 + 0.5) / nv as f64;
                samples.push(loc.locate(model, p));
            }
        }
        let mut obj = serde_json::Map::new();
        for (name, f) in fields {
            let vals: Vec<f64> = samples.iter().map(|s| match s {
                Some((e, l)) => { let t = mesh.tets[*e]; (0..4).map(|k| l[k] * f[t[k] as usize]).sum() }
                None => f64::NAN,
            }).collect();
            obj.insert((*name).into(), out.f32s(&vals));
        }
        planes.push(json!({ "axis": axis, "at": at, "u": u, "v": v, "uRange": [lo[u], hi[u]], "vRange": [lo[v], hi[v]], "size": [nu, nv], "fields": Value::Object(obj) }));
    }
    Value::Array(planes)
}
