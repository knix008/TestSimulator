//! Structural frames and trusses (the SAP2000 / Ansys beam way): 3D Euler–Bernoulli
//! beam and truss members, supports, point and distributed loads, self-weight;
//! displacements, member forces, reactions, stresses and the linear buckling
//! load factor (with the geometric stiffness of the axial forces).
//!
//! ```text
//! units: m
//! material: steel                      # or E = 200e9, nu = 0.3, density = 7850, yield = 250e6
//! section col: rect b = 0.2, h = 0.3   # rect b h | pipe d t | box b h t | custom A Iy Iz J
//! section brace: pipe d = 0.06, t = 0.004
//! node a: 0 0 0
//! node b: 0 0 3
//! beam c1: a b, section = col          # frame member (axial, bending, torsion)
//! truss d1: a c, section = brace       # axial only (pinned ends)
//! support a: fixed                     # fixed | pinned | roller z | free; or dofs = ux uy uz rx ry rz
//! load b: 10000 0 0                    # fx fy fz [mx my mz] (N, N·m)
//! udl c1: 0 0 -2000                    # N/m along the member (global directions)
//! gravity: 0 0 -9.81
//! ```

use crate::data::{Column, Dataset, Table};
use crate::expr::Expr;
use crate::linalg::{solve, sym_eigen, Mat};
use crate::Ctx;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug)]
struct Section {
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    /// Distance to the outer fibre for the bending stress (y and z).
    cy: f64,
    cz: f64,
}

#[derive(Clone, Debug)]
struct Member {
    name: String,
    a: usize,
    b: usize,
    sec: Section,
    truss: bool,
    udl: [f64; 3],
}

fn eval(t: &str) -> Result<f64, String> {
    Expr::with_names(t.trim(), &[]).map(|e| e.value(&[])).map_err(|e| format!("\"{}\": {e}", t.trim()))
}

fn pairs(text: &str) -> Result<(Vec<String>, HashMap<String, String>), String> {
    let mut words = Vec::new();
    let mut kv = HashMap::new();
    for item in text.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        // "rect b = 0.2": words before the first key.
        if let Some((k, v)) = item.split_once('=') {
            let mut ks: Vec<&str> = k.split_whitespace().collect();
            let key = ks.pop().unwrap_or("").to_ascii_lowercase();
            words.extend(ks.iter().map(|s| s.to_ascii_lowercase()));
            kv.insert(key, v.trim().to_string());
        } else {
            words.extend(item.split_whitespace().map(|s| s.to_string()));
        }
    }
    Ok((words, kv))
}

fn material(name: &str) -> Option<(f64, f64, f64, f64)> {
    // E, ν, density, yield
    Some(match name.to_ascii_lowercase().as_str() {
        "steel" => (200e9, 0.3, 7850.0, 250e6),
        "stainless" => (193e9, 0.29, 8000.0, 210e6),
        "aluminium" | "aluminum" => (69e9, 0.33, 2700.0, 240e6),
        "titanium" => (114e9, 0.34, 4430.0, 880e6),
        "wood" | "timber" => (11e9, 0.3, 500.0, 30e6),
        "concrete" => (30e9, 0.2, 2400.0, 30e6),
        _ => return None,
    })
}

/// The 12 × 12 local stiffness of a 3D beam (u, v, w, θx, θy, θz at each end).
fn k_local(e: f64, g: f64, s: &Section, l: f64, truss: bool) -> [[f64; 12]; 12] {
    let mut k = [[0.0; 12]; 12];
    let ea = e * s.a / l;
    k[0][0] = ea;
    k[0][6] = -ea;
    k[6][0] = -ea;
    k[6][6] = ea;
    if truss {
        return k;
    }
    let gj = g * s.j / l;
    k[3][3] = gj;
    k[3][9] = -gj;
    k[9][3] = -gj;
    k[9][9] = gj;
    // Bending in the local x–y plane (v, θz) with Iz, and in x–z (w, θy) with Iy.
    let mut plane = |iv: usize, it: usize, i: f64, sign: f64| {
        let (a, b, c, d) = (12.0 * e * i / l.powi(3), 6.0 * e * i / (l * l), 4.0 * e * i / l, 2.0 * e * i / l);
        let idx = [iv, it, iv + 6, it + 6];
        let m = [[a, sign * b, -a, sign * b], [sign * b, c, -sign * b, d], [-a, -sign * b, a, -sign * b], [sign * b, d, -sign * b, c]];
        for r in 0..4 {
            for cc in 0..4 {
                k[idx[r]][idx[cc]] += m[r][cc];
            }
        }
    };
    plane(1, 5, s.iz, 1.0);
    plane(2, 4, s.iy, -1.0);
    k
}

/// The geometric stiffness of an axial force N (tension positive).
fn kg_local(n: f64, l: f64, truss: bool) -> [[f64; 12]; 12] {
    let mut k = [[0.0; 12]; 12];
    if truss {
        for (a, b) in [(1usize, 7usize), (2, 8)] {
            k[a][a] += n / l;
            k[b][b] += n / l;
            k[a][b] -= n / l;
            k[b][a] -= n / l;
        }
        return k;
    }
    let mut plane = |iv: usize, it: usize, sign: f64| {
        let f = n / (30.0 * l);
        let m = [
            [36.0, sign * 3.0 * l, -36.0, sign * 3.0 * l],
            [sign * 3.0 * l, 4.0 * l * l, -sign * 3.0 * l, -l * l],
            [-36.0, -sign * 3.0 * l, 36.0, -sign * 3.0 * l],
            [sign * 3.0 * l, -l * l, -sign * 3.0 * l, 4.0 * l * l],
        ];
        let idx = [iv, it, iv + 6, it + 6];
        for r in 0..4 {
            for c in 0..4 {
                k[idx[r]][idx[c]] += f * m[r][c];
            }
        }
    };
    plane(1, 5, 1.0);
    plane(2, 4, -1.0);
    k
}

/// Rows of the local axes (x along the member; y horizontal unless the member is vertical).
fn axes(p: [f64; 3], q: [f64; 3]) -> ([f64; 3], [f64; 3], [f64; 3], f64) {
    let d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
    let x = [d[0] / l, d[1] / l, d[2] / l];
    let up = if x[2].abs() > 0.999 { [1.0, 0.0, 0.0] } else { [0.0, 0.0, 1.0] };
    let cross = |a: [f64; 3], b: [f64; 3]| [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    let norm = |a: [f64; 3]| {
        let n = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
        [a[0] / n, a[1] / n, a[2] / n]
    };
    let y = norm(cross(up, x));
    let z = cross(x, y);
    (x, y, z, l)
}

/// T K Tᵀ style rotation: global = Rᵀ local R for the 12 dofs (blocks of 3).
fn to_global(k: &[[f64; 12]; 12], r: &[[f64; 3]; 3]) -> Vec<Vec<f64>> {
    let mut t = vec![vec![0.0; 12]; 12];
    for b in 0..4 {
        for i in 0..3 {
            for j in 0..3 {
                t[3 * b + i][3 * b + j] = r[i][j];
            }
        }
    }
    // Kg = Tᵀ K T
    let mut kt = vec![vec![0.0; 12]; 12];
    for i in 0..12 {
        for j in 0..12 {
            kt[i][j] = (0..12).map(|m| k[i][m] * t[m][j]).sum();
        }
    }
    let mut out = vec![vec![0.0; 12]; 12];
    for i in 0..12 {
        for j in 0..12 {
            out[i][j] = (0..12).map(|m| t[m][i] * kt[m][j]).sum();
        }
    }
    out
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let (mut e, mut nu, mut rho, mut fy) = (200e9, 0.3, 7850.0, 250e6);
    let mut nodes: Vec<(String, [f64; 3])> = Vec::new();
    let mut sections: HashMap<String, Section> = HashMap::new();
    let mut members: Vec<Member> = Vec::new();
    let mut supports: Vec<(usize, [bool; 6])> = Vec::new();
    let mut loads: Vec<(usize, [f64; 6])> = Vec::new();
    let mut udls: Vec<(String, [f64; 3])> = Vec::new();
    let mut gravity = [0.0; 3];
    let mut pending: Vec<(usize, String, String, String)> = Vec::new();
    for (no, raw) in ctx.str("frame", "").lines().enumerate() {
        let line = raw.split('#').next().unwrap().trim();
        if line.is_empty() {
            continue;
        }
        let err = |m: String| format!("line {}: {m}", no + 1);
        let (head, body) = line.split_once(':').ok_or_else(|| err("expected \"kind name: …\"".into()))?;
        let mut hw = head.split_whitespace();
        let kind = hw.next().unwrap_or("").to_ascii_lowercase();
        let name = hw.next().unwrap_or("").to_string();
        match kind.as_str() {
            "units" => {}
            "material" => {
                let b = body.trim();
                if b.contains('=') {
                    let (_, kv) = pairs(b).map_err(err)?;
                    let get = |k: &str, d: f64| kv.get(k).map(|v| eval(v)).transpose().map(|v| v.unwrap_or(d));
                    e = get("e", e).map_err(err)?;
                    nu = get("nu", nu).map_err(err)?;
                    rho = get("density", rho).map_err(err)?;
                    fy = get("yield", fy).map_err(err)?;
                } else {
                    let m = material(b).ok_or_else(|| err(format!("unknown material \"{b}\" (or E = , nu = , density = , yield = )")))?;
                    (e, nu, rho, fy) = m;
                }
            }
            "node" => {
                let v: Vec<f64> = body.split(|c: char| c.is_whitespace() || c == ',').filter(|s| !s.is_empty()).map(eval).collect::<Result<_, _>>().map_err(err)?;
                if v.len() != 3 || name.is_empty() {
                    return Err(err("node name: x y z".into()));
                }
                nodes.push((name, [v[0], v[1], v[2]]));
            }
            "section" => {
                let (words, kv) = pairs(body).map_err(err)?;
                let get = |k: &str| kv.get(k).map(|v| eval(v)).transpose();
                let need = |k: &str| get(k).map_err(err)?.ok_or_else(|| err(format!("section needs {k} =")));
                let pi = std::f64::consts::PI;
                let s = match words.first().map(|w| w.as_str()).unwrap_or("custom") {
                    "rect" => {
                        let (b, h) = (need("b")?, need("h")?);
                        let (a, bb) = (b.max(h), b.min(h));
                        Section { a: b * h, iy: b * h.powi(3) / 12.0, iz: h * b.powi(3) / 12.0, j: a * bb.powi(3) * (1.0 / 3.0 - 0.21 * bb / a * (1.0 - bb.powi(4) / (12.0 * a.powi(4)))), cy: b / 2.0, cz: h / 2.0 }
                    }
                    "pipe" | "tube" => {
                        let (d, t) = (need("d")?, need("t")?);
                        let di = d - 2.0 * t;
                        let i = pi / 64.0 * (d.powi(4) - di.powi(4));
                        Section { a: pi / 4.0 * (d * d - di * di), iy: i, iz: i, j: 2.0 * i, cy: d / 2.0, cz: d / 2.0 }
                    }
                    "box" => {
                        let (b, h, t) = (need("b")?, need("h")?, need("t")?);
                        let (bi, hi) = (b - 2.0 * t, h - 2.0 * t);
                        Section { a: b * h - bi * hi, iy: (b * h.powi(3) - bi * hi.powi(3)) / 12.0, iz: (h * b.powi(3) - hi * bi.powi(3)) / 12.0, j: 2.0 * t * (b - t).powi(2) * (h - t).powi(2) / (b + h - 2.0 * t), cy: b / 2.0, cz: h / 2.0 }
                    }
                    _ => {
                        let a = need("a")?;
                        let iy = need("iy")?;
                        let iz = get("iz").map_err(err)?.unwrap_or(iy);
                        Section { a, iy, iz, j: get("j").map_err(err)?.unwrap_or(iy + iz), cy: get("cy").map_err(err)?.unwrap_or((12.0 * iz / a).sqrt() / 2.0), cz: get("cz").map_err(err)?.unwrap_or((12.0 * iy / a).sqrt() / 2.0) }
                    }
                };
                sections.insert(name.to_ascii_lowercase(), s);
            }
            "gravity" => {
                let v: Vec<f64> = body.split_whitespace().map(eval).collect::<Result<_, _>>().map_err(err)?;
                if v.len() != 3 {
                    return Err(err("gravity: gx gy gz".into()));
                }
                gravity = [v[0], v[1], v[2]];
            }
            "beam" | "frame" | "truss" | "bar" | "support" | "load" | "udl" => pending.push((no, kind, name, body.to_string())),
            other => return Err(err(format!("unknown \"{other}\" (material, section, node, beam, truss, support, load, udl, gravity)"))),
        }
    }
    let node_id = |n: &str| nodes.iter().position(|(x, _)| x == n).ok_or_else(|| format!("no node \"{n}\""));
    for (no, kind, name, body) in pending {
        let err = |m: String| format!("line {}: {m}", no + 1);
        match kind.as_str() {
            "beam" | "frame" | "truss" | "bar" => {
                let (words, kv) = pairs(&body).map_err(err)?;
                if words.len() < 2 {
                    return Err(err(format!("{kind} name: node1 node2, section = …")));
                }
                let (a, b) = (node_id(&words[0]).map_err(err)?, node_id(&words[1]).map_err(err)?);
                if a == b {
                    return Err(err("a member needs two different nodes".into()));
                }
                let sec_name = kv.get("section").map(|s| s.to_ascii_lowercase()).or_else(|| sections.keys().next().cloned()).ok_or_else(|| err("define a section first".into()))?;
                let sec = *sections.get(&sec_name).ok_or_else(|| err(format!("no section \"{sec_name}\"")))?;
                members.push(Member { name: if name.is_empty() { format!("m{}", members.len() + 1) } else { name }, a, b, sec, truss: kind == "truss" || kind == "bar", udl: [0.0; 3] });
            }
            "support" => {
                let n = node_id(&name).map_err(err)?;
                let b = body.trim().to_ascii_lowercase();
                let fix = if let Some(d) = b.strip_prefix("dofs") {
                    let d = d.trim_start_matches(|c: char| c == '=' || c.is_whitespace());
                    let names = ["ux", "uy", "uz", "rx", "ry", "rz"];
                    let mut f = [false; 6];
                    for w in d.split(|c: char| c.is_whitespace() || c == ',').filter(|s| !s.is_empty()) {
                        let k = names.iter().position(|x| *x == w).ok_or_else(|| err(format!("\"{w}\": ux uy uz rx ry rz")))?;
                        f[k] = true;
                    }
                    f
                } else if b.starts_with("fixed") {
                    [true; 6]
                } else if b.starts_with("pinned") || b.starts_with("pin") {
                    [true, true, true, false, false, false]
                } else if let Some(axis) = b.strip_prefix("roller") {
                    let mut f = [false; 6];
                    match axis.trim() {
                        "x" => f[0] = true,
                        "y" => f[1] = true,
                        _ => f[2] = true,
                    }
                    f
                } else if b.starts_with("free") {
                    [false; 6]
                } else {
                    return Err(err("support: fixed | pinned | roller x|y|z | free | dofs = ux uy …".into()));
                };
                supports.push((n, fix));
            }
            "load" => {
                let n = node_id(&name).map_err(err)?;
                let v: Vec<f64> = body.split(|c: char| c.is_whitespace() || c == ',').filter(|s| !s.is_empty()).map(eval).collect::<Result<_, _>>().map_err(err)?;
                if v.len() != 3 && v.len() != 6 {
                    return Err(err("load node: fx fy fz [mx my mz]".into()));
                }
                let mut f = [0.0; 6];
                f[..v.len()].copy_from_slice(&v);
                loads.push((n, f));
            }
            _ => {
                let v: Vec<f64> = body.split(|c: char| c.is_whitespace() || c == ',').filter(|s| !s.is_empty()).map(eval).collect::<Result<_, _>>().map_err(err)?;
                if v.len() != 3 {
                    return Err(err("udl member: qx qy qz (N/m)".into()));
                }
                udls.push((name, [v[0], v[1], v[2]]));
            }
        }
    }
    for (name, q) in udls {
        let m = members.iter_mut().find(|m| m.name == name).ok_or_else(|| format!("udl: no member \"{name}\""))?;
        for k in 0..3 {
            m.udl[k] += q[k];
        }
    }
    if members.is_empty() {
        return Err("the frame has no members (beam name: node1 node2, section = …)".into());
    }
    if supports.is_empty() {
        return Err("support the frame somewhere (support node: fixed)".into());
    }
    let g_mod = e / (2.0 * (1.0 + nu));
    // Each beam is split into segments for accurate buckling and deflected shapes.
    let segs = ctx.count("segments", 8, 1, 50)?;
    let mut pts: Vec<[f64; 3]> = nodes.iter().map(|n| n.1).collect();
    struct Elem {
        m: usize,
        p: usize,
        q: usize,
    }
    let mut elems: Vec<Elem> = Vec::new();
    for (mi, m) in members.iter().enumerate() {
        let n = if m.truss { 1 } else { segs };
        let (pa, pb) = (pts[m.a], pts[m.b]);
        let mut prev = m.a;
        for s in 1..=n {
            let next = if s == n {
                m.b
            } else {
                let t = s as f64 / n as f64;
                pts.push([pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1]), pa[2] + t * (pb[2] - pa[2])]);
                pts.len() - 1
            };
            elems.push(Elem { m: mi, p: prev, q: next });
            prev = next;
        }
    }
    let nn = pts.len();
    let ndof = 6 * nn;
    // Rotations of nodes that only trusses touch are held (they carry no rotation stiffness).
    let mut has_beam = vec![false; nn];
    for el in &elems {
        if !members[el.m].truss {
            has_beam[el.p] = true;
            has_beam[el.q] = true;
        }
    }
    let mut fixed = vec![false; ndof];
    for (n, f) in &supports {
        for k in 0..6 {
            fixed[6 * n + k] |= f[k];
        }
    }
    for n in 0..nn {
        if !has_beam[n] {
            for k in 3..6 {
                fixed[6 * n + k] = true;
            }
        }
    }
    let mut eqn = vec![usize::MAX; ndof];
    let mut neq = 0;
    for d in 0..ndof {
        if !fixed[d] {
            eqn[d] = neq;
            neq += 1;
        }
    }
    if neq > 3000 {
        return Err("the frame is too large (fewer members or segments)".into());
    }
    // Assembly (dense: frames are small).
    let mut kmat: Mat = vec![vec![0.0; neq]; neq];
    let mut f = vec![0.0; ndof];
    let mut el_k: Vec<(Vec<Vec<f64>>, [[f64; 3]; 3], f64)> = Vec::new();
    for el in &elems {
        let m = &members[el.m];
        let (x, y, z, l) = axes(pts[el.p], pts[el.q]);
        if l <= 0.0 {
            return Err(format!("member {} has zero length", m.name));
        }
        let r = [x, y, z];
        let kg = to_global(&k_local(e, g_mod, &m.sec, l, m.truss), &r);
        let dofs: Vec<usize> = (0..6).map(|k| 6 * el.p + k).chain((0..6).map(|k| 6 * el.q + k)).collect();
        for i in 0..12 {
            if eqn[dofs[i]] == usize::MAX {
                continue;
            }
            for j in 0..12 {
                if eqn[dofs[j]] != usize::MAX {
                    kmat[eqn[dofs[i]]][eqn[dofs[j]]] += kg[i][j];
                }
            }
        }
        // Distributed load and self-weight: consistent end forces and moments.
        let q = [m.udl[0] + rho * m.sec.a * gravity[0], m.udl[1] + rho * m.sec.a * gravity[1], m.udl[2] + rho * m.sec.a * gravity[2]];
        if q.iter().any(|v| *v != 0.0) {
            // Local components of q.
            let ql = [x[0] * q[0] + x[1] * q[1] + x[2] * q[2], y[0] * q[0] + y[1] * q[1] + y[2] * q[2], z[0] * q[0] + z[1] * q[1] + z[2] * q[2]];
            let mut fl = [0.0; 12];
            fl[0] = ql[0] * l / 2.0;
            fl[6] = ql[0] * l / 2.0;
            fl[1] = ql[1] * l / 2.0;
            fl[7] = ql[1] * l / 2.0;
            fl[2] = ql[2] * l / 2.0;
            fl[8] = ql[2] * l / 2.0;
            if !m.truss {
                fl[5] = ql[1] * l * l / 12.0;
                fl[11] = -ql[1] * l * l / 12.0;
                fl[4] = -ql[2] * l * l / 12.0;
                fl[10] = ql[2] * l * l / 12.0;
            }
            for b in 0..4 {
                for i in 0..3 {
                    let gval: f64 = (0..3).map(|j| r[j][i] * fl[3 * b + j]).sum();
                    f[dofs[3 * b + i]] += gval;
                }
            }
        }
        el_k.push((kg, r, l));
    }
    for (n, fv) in &loads {
        for k in 0..6 {
            f[6 * n + k] += fv[k];
        }
    }
    let rhs: Vec<f64> = (0..ndof).filter(|&d| eqn[d] != usize::MAX).map(|d| f[d]).collect();
    let x = solve(&kmat, &rhs).map_err(|_| "the frame is a mechanism (add supports, or beams instead of trusses)".to_string())?;
    let mut u = vec![0.0; ndof];
    for d in 0..ndof {
        if eqn[d] != usize::MAX {
            u[d] = x[eqn[d]];
        }
    }
    // Member end forces (local): k_local · T u − fixed-end forces; axial force for buckling.
    let mut react = vec![0.0; ndof];
    let mut rows: Vec<(String, f64, f64, f64, f64, f64, f64)> = Vec::new(); // member, N, Vy, Vz, T, My, Mz (max over its elements)
    let mut axial: Vec<f64> = Vec::new();
    let mut max_stress: f64 = 0.0;
    let mut per_member: HashMap<usize, (f64, f64, f64, f64, f64, f64)> = HashMap::new();
    for (ei, el) in elems.iter().enumerate() {
        let m = &members[el.m];
        let (kg, r, l) = &el_k[ei];
        let dofs: Vec<usize> = (0..6).map(|k| 6 * el.p + k).chain((0..6).map(|k| 6 * el.q + k)).collect();
        for i in 0..12 {
            if fixed[dofs[i]] {
                react[dofs[i]] += (0..12).map(|j| kg[i][j] * u[dofs[j]]).sum::<f64>();
            }
        }
        let ug: Vec<f64> = dofs.iter().map(|&d| u[d]).collect();
        let mut ul = [0.0; 12];
        for b in 0..4 {
            for i in 0..3 {
                ul[3 * b + i] = (0..3).map(|j| r[i][j] * ug[3 * b + j]).sum();
            }
        }
        let kl = k_local(e, g_mod, &m.sec, *l, m.truss);
        let fl: Vec<f64> = (0..12).map(|i| (0..12).map(|j| kl[i][j] * ul[j]).sum()).collect();
        // Axial force: tension positive (the end force at the far end along x).
        let n = fl[6];
        axial.push(n);
        let (my, mz) = (fl[4].abs().max(fl[10].abs()), fl[5].abs().max(fl[11].abs()));
        let stress = n.abs() / m.sec.a + if m.truss { 0.0 } else { my * m.sec.cz / m.sec.iy + mz * m.sec.cy / m.sec.iz };
        max_stress = max_stress.max(stress);
        let entry = per_member.entry(el.m).or_insert((0.0, 0.0, 0.0, 0.0, 0.0, 0.0));
        entry.0 = if entry.0.abs() >= n.abs() { entry.0 } else { n };
        entry.1 = entry.1.max(fl[1].abs().max(fl[7].abs()));
        entry.2 = entry.2.max(fl[2].abs().max(fl[8].abs()));
        entry.3 = entry.3.max(fl[3].abs());
        entry.4 = entry.4.max(my);
        entry.5 = entry.5.max(mz);
    }
    for (mi, m) in members.iter().enumerate() {
        let v = per_member[&mi];
        rows.push((m.name.clone(), v.0, v.1, v.2, v.3, v.4, v.5));
    }
    let mut d = Dataset::default();
    // Buckling: K φ = λ (−K_G) φ, the smallest positive λ; via C = L⁻¹ (−K_G) L⁻ᵀ, λ = 1 / μ_max.
    if ctx.str("buckling", "true") != "false" && axial.iter().any(|n| *n < 0.0) {
        let mut global: Option<f64> = None;
        let mut kgm: Mat = vec![vec![0.0; neq]; neq];
        for (ei, el) in elems.iter().enumerate() {
            let m = &members[el.m];
            let (_, r, l) = &el_k[ei];
            let g = to_global(&kg_local(axial[ei], *l, m.truss), r);
            let dofs: Vec<usize> = (0..6).map(|k| 6 * el.p + k).chain((0..6).map(|k| 6 * el.q + k)).collect();
            for i in 0..12 {
                if eqn[dofs[i]] == usize::MAX {
                    continue;
                }
                for j in 0..12 {
                    if eqn[dofs[j]] != usize::MAX {
                        kgm[eqn[dofs[i]]][eqn[dofs[j]]] += g[i][j];
                    }
                }
            }
        }
        if neq <= 700 {
            // Cholesky of K.
            let n = neq;
            let mut l = vec![vec![0.0; n]; n];
            let mut ok = true;
            'outer: for i in 0..n {
                for j in 0..=i {
                    let s: f64 = kmat[i][j] - (0..j).map(|k| l[i][k] * l[j][k]).sum::<f64>();
                    if i == j {
                        if s <= 0.0 {
                            ok = false;
                            break 'outer;
                        }
                        l[i][i] = s.sqrt();
                    } else {
                        l[i][j] = s / l[j][j];
                    }
                }
            }
            if ok {
                let fwd = |b: &[f64]| -> Vec<f64> {
                    let mut z = vec![0.0; n];
                    for i in 0..n {
                        z[i] = (b[i] - (0..i).map(|k| l[i][k] * z[k]).sum::<f64>()) / l[i][i];
                    }
                    z
                };
                // W = L⁻¹ (−K_G), C = L⁻¹ Wᵀ
                let w: Vec<Vec<f64>> = (0..n).map(|c| fwd(&(0..n).map(|r| -kgm[r][c]).collect::<Vec<_>>())).collect();
                let cc: Vec<Vec<f64>> = (0..n).map(|c| fwd(&(0..n).map(|r| w[r][c]).collect::<Vec<_>>())).collect();
                let c: Mat = (0..n).map(|i| (0..n).map(|j| 0.5 * (cc[i][j] + cc[j][i])).collect()).collect();
                let (vals, _) = sym_eigen(&c);
                global = vals.iter().cloned().filter(|v| *v > 1e-12).fold(None, |m: Option<f64>, v| Some(m.map_or(v, |x| x.max(v)))).map(|mu| 1.0 / mu);
            }
        } else {
            ctx.warn("the frame is too large for the overall buckling analysis (fewer segments); only bars are checked");
        }
        // A truss bar is one element, so the overall analysis cannot bend it: each compressed bar
        // is checked on its own (Euler, pinned ends: π² E I / L²).
        let mut bar: Option<(f64, String)> = None;
        for (ei, el) in elems.iter().enumerate() {
            let m = &members[el.m];
            if m.truss && axial[ei] < 0.0 {
                let l = el_k[ei].2;
                let lf = std::f64::consts::PI.powi(2) * e * m.sec.iy.min(m.sec.iz) / (l * l * -axial[ei]);
                if bar.as_ref().map_or(true, |b| lf < b.0) {
                    bar = Some((lf, m.name.clone()));
                }
            }
        }
        let overall = global.unwrap_or(f64::INFINITY);
        match bar {
            Some((lf, name)) if lf < overall => {
                d.scalar("buckling load factor", lf, "");
                d.text = format!("the bar {name} buckles first (Euler, pinned ends)");
            }
            _ if global.is_some() => {
                d.scalar("buckling load factor", overall, "");
                d.text = "overall (frame) buckling comes first".into();
            }
            _ => {}
        }
    }
    // Node results (the user's nodes).
    let mut nt = Table::new("node displacements");
    nt.push(Column::text("node", nodes.iter().map(|n| n.0.clone()).collect()));
    for (k, name) in ["ux", "uy", "uz"].iter().enumerate() {
        nt.push(Column::new(name, "m", (0..nodes.len()).map(|n| u[6 * n + k]).collect()));
    }
    for (k, name) in ["rx", "ry", "rz"].iter().enumerate() {
        nt.push(Column::new(name, "rad", (0..nodes.len()).map(|n| u[6 * n + 3 + k]).collect()));
    }
    let mut mt = Table::new("member forces");
    mt.push(Column::text("member", rows.iter().map(|r| r.0.clone()).collect()));
    mt.push(Column::new("N", "N", rows.iter().map(|r| r.1).collect()));
    mt.push(Column::new("Vy", "N", rows.iter().map(|r| r.2).collect()));
    mt.push(Column::new("Vz", "N", rows.iter().map(|r| r.3).collect()));
    mt.push(Column::new("T", "N·m", rows.iter().map(|r| r.4).collect()));
    mt.push(Column::new("My", "N·m", rows.iter().map(|r| r.5).collect()));
    mt.push(Column::new("Mz", "N·m", rows.iter().map(|r| r.6).collect()));
    let mut rt = Table::new("reactions");
    rt.push(Column::text("node", supports.iter().map(|(n, _)| nodes[*n].0.clone()).collect()));
    for (k, name) in ["Fx", "Fy", "Fz", "Mx", "My", "Mz"].iter().enumerate() {
        rt.push(Column::new(name, if k < 3 { "N" } else { "N·m" }, supports.iter().map(|(n, _)| react[6 * n + k] - f[6 * n + k]).collect()));
    }
    // The shape: undeformed and deformed (exaggerated) lines, NaN between members, for the 3D view.
    let umax = (0..nn).map(|n| (u[6 * n].powi(2) + u[6 * n + 1].powi(2) + u[6 * n + 2].powi(2)).sqrt()).fold(0.0, f64::max);
    let span = {
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        for p in &pts {
            for k in 0..3 {
                lo[k] = lo[k].min(p[k]);
                hi[k] = hi[k].max(p[k]);
            }
        }
        (0..3).map(|k| hi[k] - lo[k]).fold(0.0, f64::max)
    };
    let scale = if umax > 0.0 { ctx.num("deform", 1.0)? * 0.08 * span / umax } else { 0.0 };
    let (mut sx, mut sy, mut sz, mut which) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for (mi, _) in members.iter().enumerate() {
        for (shape, sc) in [(0.0, 0.0), (1.0, scale)] {
            let chain: Vec<usize> = {
                let mut c = Vec::new();
                for el in elems.iter().filter(|el| el.m == mi) {
                    if c.is_empty() {
                        c.push(el.p);
                    }
                    c.push(el.q);
                }
                c
            };
            for n in chain {
                sx.push(pts[n][0] + sc * u[6 * n]);
                sy.push(pts[n][1] + sc * u[6 * n + 1]);
                sz.push(pts[n][2] + sc * u[6 * n + 2]);
                which.push(shape);
            }
            sx.push(f64::NAN);
            sy.push(f64::NAN);
            sz.push(f64::NAN);
            which.push(f64::NAN);
        }
    }
    let mut shape = Table::new("shape lines");
    shape.push(Column::new("x", "m", sx));
    shape.push(Column::new("y", "m", sy));
    shape.push(Column::new("z", "m", sz));
    shape.push(Column::new("deformed", "", which));
    d.scalar("displacement max", umax, "m");
    d.scalar("stress max", max_stress, "Pa");
    if fy > 0.0 && max_stress > 0.0 {
        d.scalar("safety factor", fy / max_stress, "");
    }
    let mass: f64 = members.iter().map(|m| m.sec.a * rho * {
        let (a, b) = (nodes[m.a].1, nodes[m.b].1);
        ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
    }).sum();
    d.scalar("mass", mass, "kg");
    for (n, (name, _)) in nodes.iter().enumerate() {
        if loads.iter().any(|(k, _)| *k == n) {
            for (k, axis) in ["ux", "uy", "uz"].iter().enumerate() {
                d.scalar(&format!("{axis}({name})"), u[6 * n + k], "m");
            }
        }
    }
    d.scalar("members", members.len() as f64, "");
    d.scalar("nodes", nodes.len() as f64, "");
    d.tables.push(shape);
    d.tables.push(mt);
    d.tables.push(nt);
    d.tables.push(rt);
    Ok(d)
}
