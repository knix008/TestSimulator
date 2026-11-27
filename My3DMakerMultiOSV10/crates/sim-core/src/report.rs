//! Mesh description for the user interface: node positions, the visible surface (per face), feature
//! edges, face signatures for picking, element quality.

use crate::mesh::NONE;
use crate::model::Model;
use crate::out::Out;
use serde_json::{json, Value};
use std::collections::HashMap;

pub fn mesh_info(model: &Model, out: &mut Out) {
    let mesh = &model.mesh;
    let nc = mesh.ncorner;
    let pos: Vec<f64> = mesh.nodes[..nc].iter().flat_map(|p| [p[0], p[1], p[2]]).collect();
    // Visible surface: triangles of bodies facing the outside or the air; interface triangles between
    // bodies only from the lower-numbered side (shown as one face, hidden when both bodies are shown).
    let mut tris: Vec<u32> = Vec::new();
    let mut tri_face: Vec<u32> = Vec::new();
    let mut wall_tris: Vec<u32> = Vec::new();
    for (ti, t) in mesh.tris.iter().enumerate() {
        let (r, o) = (mesh.tri_region[ti], mesh.tri_other[ti]);
        if model.is_body(r) {
            tris.extend_from_slice(t);
            tri_face.push(mesh.tri_face[ti]);
        } else if r == model.air && o == NONE {
            wall_tris.extend_from_slice(t);
        }
    }
    // Feature edges: where two faces of the same body side meet.
    let mut edge_face: HashMap<(u32, u32, u32), u32> = HashMap::new();
    let mut edges: Vec<u32> = Vec::new();
    for (ti, t) in mesh.tris.iter().enumerate() {
        let r = mesh.tri_region[ti];
        if !model.is_body(r) { continue; }
        let f = mesh.tri_face[ti];
        for (a, b) in [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
            let key = (a.min(b), a.max(b), r);
            match edge_face.get(&key) {
                Some(&g) if g != f => { edges.push(a); edges.push(b); }
                Some(_) => {}
                None => { edge_face.insert(key, f); }
            }
        }
    }
    let name_of = |r: u32| -> Value {
        if model.is_body(r) { json!(model.bodies[r as usize].id) } else if r == model.air && r != NONE { json!("air") } else { Value::Null }
    };
    let faces: Vec<Value> = mesh.faces.iter().enumerate().map(|(i, f)| json!({
        "id": i, "body": name_of(f.region), "other": name_of(f.other),
        "c": f.centroid, "n": f.normal, "a": f.area, "tris": f.tris.len(),
    })).collect();
    let q: Vec<f64> = (0..mesh.tets.len()).map(|e| mesh.quality(e)).collect();
    let ar: Vec<f64> = (0..mesh.tets.len()).map(|e| mesh.aspect(e)).collect();
    let mut hist = [0usize; 10];
    for v in &q { hist[((v * 10.0) as usize).min(9)] += 1; }
    let avg = q.iter().sum::<f64>() / q.len().max(1) as f64;
    let mut per_body = vec![0usize; mesh.nregions];
    for &r in &mesh.region { if (r as usize) < per_body.len() { per_body[r as usize] += 1; } }
    let positions = out.f32s(&pos);
    let tri_ref = out.u32s(&tris);
    let face_ref = out.u32s(&tri_face);
    let edge_ref = out.u32s(&edges);
    let wall_ref = out.u32s(&wall_tris);
    out.set("mesh", json!({
        "nodes": mesh.nnodes(), "corners": nc, "elements": mesh.tets.len(), "order": mesh.order(), "size": mesh.h,
        "positions": positions, "tris": tri_ref, "triFace": face_ref, "edges": edge_ref, "walls": wall_ref,
        "faces": faces,
        "bodies": model.bodies.iter().enumerate().map(|(i, b)| json!({ "id": b.id, "elements": per_body.get(i).copied().unwrap_or(0) })).collect::<Vec<_>>(),
        "airElements": if model.air != NONE { per_body.get(model.air as usize).copied().unwrap_or(0) } else { 0 },
        "quality": { "min": q.iter().cloned().fold(f64::INFINITY, f64::min), "avg": avg, "histogram": hist,
                     "aspectMax": ar.iter().cloned().fold(0.0, f64::max), "aspectAvg": ar.iter().sum::<f64>() / ar.len().max(1) as f64 },
        "contacts": mesh.contact_nodes.len(),
    }));
}
