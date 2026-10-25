//! 3D finite elements on a part (the SolidWorks Simulation / Ansys way): the
//! geometry is the CAD node's feature tree, meshed with equal box-shaped
//! eight-node hexahedra; linear elasticity (with Wilson–Taylor incompatible
//! modes, so beams bend without locking) or steady heat conduction.
//!
//! ```text
//! units: mm
//! material: aluminium                  # or E = 70e9, nu = 0.33, density = 2700, k = 205
//! base beam: box 0 0 0 200 20 20
//! cut hole: cylinder y 100 -1 10 22 5
//! mesh: n = 40                         # cells along the longest side
//! fix: x-                              # a face of the bounding box: x- x+ y- y+ z- z+,
//! fix: box 0 0 0 0 20 0, dir = z       # or the nodes in a box; dir = x, y, z, xy … (default all)
//! load: x+, f = 0 0 -500               # total force (N) over the face or box
//! gravity: 0 0 -9.81
//! temperature: x-, T = 100             # heat: fixed temperature
//! convection: all, h = 15, Tinf = 20   # heat: on the outer surface in a face, box or all
//! flux: z+, q = 2000                   # heat: W/m² into the part
//! source: box 90 0 0 110 20 20, q = 5e6  # heat: W/m³ in the cells of a box (or power = W in all)
//! probe tip: 200 10 10
//! ```

use super::cad::Geometry;
use super::fem::Csr;
use crate::data::{Column, Dataset, Grid, Table};
use crate::linalg::inverse;
use crate::Ctx;

#[derive(Clone, Debug)]
enum Sel {
    Face(usize, bool), // axis, max side
    Box([f64; 6]),
    All,
}

fn parse_sel(text: &str) -> Result<Sel, String> {
    let t = text.trim().to_ascii_lowercase();
    let face = |a: usize, hi: bool| Ok(Sel::Face(a, hi));
    match t.as_str() {
        "x-" => face(0, false),
        "x+" => face(0, true),
        "y-" => face(1, false),
        "y+" => face(1, true),
        "z-" => face(2, false),
        "z+" => face(2, true),
        "all" => Ok(Sel::All),
        _ => {
            let rest = t.strip_prefix("box").ok_or_else(|| format!("\"{text}\": x-, x+, y-, y+, z-, z+, all or box x0 y0 z0 x1 y1 z1"))?;
            let v: Vec<f64> = rest.split_whitespace().map(|w| w.parse::<f64>().map_err(|_| format!("\"{w}\" is not a number"))).collect::<Result<_, _>>()?;
            if v.len() != 6 {
                return Err("box x0 y0 z0 x1 y1 z1".into());
            }
            Ok(Sel::Box([v[0].min(v[3]), v[1].min(v[4]), v[2].min(v[5]), v[0].max(v[3]), v[1].max(v[4]), v[2].max(v[5])]))
        }
    }
}

/// "selection, key = value, …"
fn sel_and_values(body: &str) -> Result<(Sel, Vec<(String, String)>), String> {
    let mut parts = body.split(',');
    let sel = parse_sel(parts.next().unwrap_or(""))?;
    let mut kv = Vec::new();
    for item in parts {
        let (k, v) = item.split_once('=').ok_or_else(|| format!("\"{}\" is not key = value", item.trim()))?;
        kv.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
    }
    Ok((sel, kv))
}

fn num(kv: &[(String, String)], k: &str) -> Result<Option<f64>, String> {
    kv.iter().find(|(key, _)| key == k).map(|(_, v)| crate::expr::Expr::with_names(v, &[]).map(|e| e.value(&[])).map_err(|e| format!("{k}: {e}"))).transpose()
}

fn vec3(kv: &[(String, String)], k: &str) -> Result<Option<[f64; 3]>, String> {
    match kv.iter().find(|(key, _)| key == k) {
        None => Ok(None),
        Some((_, v)) => {
            let n: Vec<f64> = v.split_whitespace().map(|w| crate::expr::Expr::with_names(w, &[]).map(|e| e.value(&[])).map_err(|e| format!("{k}: {e}"))).collect::<Result<_, _>>()?;
            if n.len() != 3 {
                return Err(format!("{k} = x y z"));
            }
            Ok(Some([n[0], n[1], n[2]]))
        }
    }
}

struct Spec {
    n: usize,
    fixes: Vec<(Sel, [bool; 3])>,
    loads: Vec<(Sel, [f64; 3])>,
    gravity: [f64; 3],
    temps: Vec<(Sel, f64)>,
    convs: Vec<(Sel, f64, f64)>,
    fluxes: Vec<(Sel, f64)>,
    /// W/m³, or a total power (W) spread over the cells in the box.
    sources: Vec<(Sel, f64, bool)>,
    probes: Vec<(String, [f64; 3])>,
}

/// Natural coordinates of the eight corners (x fastest).
const CORNERS: [[f64; 3]; 8] = [[-1., -1., -1.], [1., -1., -1.], [-1., 1., -1.], [1., 1., -1.], [-1., -1., 1.], [1., -1., 1.], [-1., 1., 1.], [1., 1., 1.]];

/// Derivatives of the shape functions by x, y, z at (ξ, η, ζ) for a box of sizes h.
fn grads(p: [f64; 3], h: [f64; 3]) -> [[f64; 3]; 8] {
    let mut g = [[0.0; 3]; 8];
    for (i, c) in CORNERS.iter().enumerate() {
        let f = |k: usize| 1.0 + c[k] * p[k];
        g[i][0] = c[0] * f(1) * f(2) / 8.0 * 2.0 / h[0];
        g[i][1] = c[1] * f(0) * f(2) / 8.0 * 2.0 / h[1];
        g[i][2] = c[2] * f(0) * f(1) / 8.0 * 2.0 / h[2];
    }
    g
}

fn gauss() -> Vec<[f64; 3]> {
    let a = 1.0 / 3f64.sqrt();
    let mut v = Vec::new();
    for x in [-a, a] {
        for y in [-a, a] {
            for z in [-a, a] {
                v.push([x, y, z]);
            }
        }
    }
    v
}

/// The 6 × 6 isotropic elasticity matrix (Voigt: xx yy zz xy yz zx, engineering shear).
fn dmat(e: f64, nu: f64) -> [[f64; 6]; 6] {
    let l = e * nu / ((1.0 + nu) * (1.0 - 2.0 * nu));
    let m = e / (2.0 * (1.0 + nu));
    let mut d = [[0.0; 6]; 6];
    for i in 0..3 {
        for j in 0..3 {
            d[i][j] = l;
        }
        d[i][i] = l + 2.0 * m;
        d[i + 3][i + 3] = m;
    }
    d
}

/// Strain–displacement rows for gradient vectors g (one per displacement field).
fn bmat(g: &[[f64; 3]]) -> Vec<[f64; 6]> {
    // Columns: 3 per field (ux, uy, uz).
    let mut cols = Vec::with_capacity(3 * g.len());
    for d in g {
        cols.push([d[0], 0.0, 0.0, d[1], 0.0, d[2]]);
        cols.push([0.0, d[1], 0.0, d[0], d[2], 0.0]);
        cols.push([0.0, 0.0, d[2], 0.0, d[1], d[0]]);
    }
    cols
}

/// The condensed 24 × 24 stiffness of a box element with incompatible modes (Wilson–Taylor).
fn hex11(h: [f64; 3], e: f64, nu: f64) -> Result<Vec<Vec<f64>>, String> {
    let d = dmat(e, nu);
    let det = h[0] * h[1] * h[2] / 8.0;
    let mut kuu = vec![vec![0.0; 24]; 24];
    let mut kua = vec![vec![0.0; 9]; 24];
    let mut kaa = vec![vec![0.0; 9]; 9];
    let dot = |a: &[f64; 6], b: &[f64; 6]| -> f64 { (0..6).map(|i| (0..6).map(|j| a[i] * d[i][j] * b[j]).sum::<f64>()).sum() };
    for p in gauss() {
        let bu = bmat(&grads(p, h));
        // Bubble modes 1 − ξ², 1 − η², 1 − ζ²: each has one non-zero derivative.
        let ga: Vec<[f64; 3]> = (0..3).map(|k| {
            let mut v = [0.0; 3];
            v[k] = -2.0 * p[k] * 2.0 / h[k];
            v
        }).collect();
        let ba = bmat(&ga);
        for i in 0..24 {
            for j in 0..24 {
                kuu[i][j] += dot(&bu[i], &bu[j]) * det;
            }
            for j in 0..9 {
                kua[i][j] += dot(&bu[i], &ba[j]) * det;
            }
        }
        for i in 0..9 {
            for j in 0..9 {
                kaa[i][j] += dot(&ba[i], &ba[j]) * det;
            }
        }
    }
    let inv = inverse(&kaa)?;
    for i in 0..24 {
        for j in 0..24 {
            let mut s = 0.0;
            for a in 0..9 {
                for b in 0..9 {
                    s += kua[i][a] * inv[a][b] * kua[j][b];
                }
            }
            kuu[i][j] -= s;
        }
    }
    Ok(kuu)
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let mut spec = Spec { n: 30, fixes: Vec::new(), loads: Vec::new(), gravity: [0.0; 3], temps: Vec::new(), convs: Vec::new(), fluxes: Vec::new(), sources: Vec::new(), probes: Vec::new() };
    let geo = {
        let spec = &mut spec;
        Geometry::parse(&ctx.str("part", ""), &mut |key: &str, body: &str| -> Result<bool, String> {
            // The first word decides ("probe tip", "fix base" …).
            match key.split_whitespace().next().unwrap_or("") {
                "mesh" => {
                    let (_, kv) = sel_and_values(&format!("all, {body}"))?;
                    spec.n = num(&kv, "n")?.unwrap_or(30.0).round().clamp(2.0, 200.0) as usize;
                }
                "fix" | "support" => {
                    let (sel, kv) = sel_and_values(body)?;
                    let dir = kv.iter().find(|(k, _)| k == "dir").map(|(_, v)| v.to_ascii_lowercase()).unwrap_or_else(|| "xyz".into());
                    spec.fixes.push((sel, [dir.contains('x'), dir.contains('y'), dir.contains('z')]));
                }
                "load" | "force" => {
                    let (sel, kv) = sel_and_values(body)?;
                    spec.loads.push((sel, vec3(&kv, "f")?.ok_or("load: f = fx fy fz (N)")?));
                }
                "gravity" => {
                    let v: Vec<f64> = body.split_whitespace().map(|w| w.parse::<f64>().map_err(|_| format!("\"{w}\" is not a number"))).collect::<Result<_, _>>()?;
                    if v.len() != 3 {
                        return Err("gravity: gx gy gz".into());
                    }
                    spec.gravity = [v[0], v[1], v[2]];
                }
                "temperature" => {
                    let (sel, kv) = sel_and_values(body)?;
                    spec.temps.push((sel, num(&kv, "t")?.ok_or("temperature: selection, T = value")?));
                }
                "convection" => {
                    let (sel, kv) = sel_and_values(body)?;
                    spec.convs.push((sel, num(&kv, "h")?.ok_or("convection: selection, h = , Tinf =")?, num(&kv, "tinf")?.unwrap_or(20.0)));
                }
                "flux" => {
                    let (sel, kv) = sel_and_values(body)?;
                    spec.fluxes.push((sel, num(&kv, "q")?.ok_or("flux: selection, q = W/m²")?));
                }
                "source" => {
                    let (sel, kv) = sel_and_values(body)?;
                    match (num(&kv, "q")?, num(&kv, "power")?) {
                        (_, Some(p)) => spec.sources.push((sel, p, true)),
                        (Some(q), None) => spec.sources.push((sel, q, false)),
                        _ => return Err("source: box …, q = W/m³ or power = W".into()),
                    }
                }
                "probe" => {
                    let v: Vec<f64> = body.split(|c: char| c == ',' || c.is_whitespace()).filter(|s| !s.is_empty()).map(|w| w.parse::<f64>().map_err(|_| format!("\"{w}\" is not a number"))).collect::<Result<_, _>>()?;
                    if v.len() != 3 {
                        return Err("probe name: x y z".into());
                    }
                    spec.probes.push((String::new(), [v[0], v[1], v[2]]));
                }
                _ => return Ok(false),
            }
            Ok(true)
        })?
    };
    // Probe names come from the line heads ("probe tip: …").
    let mut pk = 0;
    for raw in ctx.str("part", "").lines() {
        let line = raw.split('#').next().unwrap().trim();
        if let Some((head, _)) = line.split_once(':') {
            let mut w = head.split_whitespace();
            if w.next().map(|s| s.eq_ignore_ascii_case("probe")).unwrap_or(false) {
                if let Some(p) = spec.probes.get_mut(pk) {
                    p.0 = w.next().map(|s| s.to_string()).unwrap_or_else(|| format!("p{}", pk + 1));
                }
                pk += 1;
            }
        }
    }
    let heat = ctx.str("physics", "elasticity") == "heat";
    let b = geo.bounds()?;
    let size = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    let longest = size.iter().cloned().fold(0.0, f64::max);
    let n = spec.n;
    let nc = [0, 1, 2].map(|k| ((n as f64 * size[k] / longest).round() as usize).max(1));
    let h = [0, 1, 2].map(|k| size[k] / nc[k] as f64);
    let (nx, ny, nz) = (nc[0], nc[1], nc[2]);
    if nx * ny * nz > 400_000 {
        return Err("the mesh is too fine (fewer cells: mesh: n = …)".into());
    }
    // Cells inside the part (by the centre).
    let mut active = vec![false; nx * ny * nz];
    for j in 0..ny {
        for i in 0..nx {
            let (x, y) = (b[0] + (i as f64 + 0.5) * h[0], b[1] + (j as f64 + 0.5) * h[1]);
            let col = geo.column(x, y);
            for k in 0..nz {
                let z = b[2] + (k as f64 + 0.5) * h[2];
                active[(k * ny + j) * nx + i] = col.iter().any(|(a, c)| z >= *a && z <= *c);
            }
        }
    }
    let cells: Vec<usize> = (0..active.len()).filter(|&c| active[c]).collect();
    if cells.is_empty() {
        return Err("no cell lies inside the part (a finer mesh?)".into());
    }
    let (gx, gy) = (nx + 1, ny + 1);
    let nid = |i: usize, j: usize, k: usize| (k * gy + j) * gx + i;
    let nn = gx * gy * (nz + 1);
    let cell_nodes = |c: usize| -> [usize; 8] {
        let (i, j, k) = (c % nx, (c / nx) % ny, c / (nx * ny));
        let mut out = [0; 8];
        for (q, cr) in CORNERS.iter().enumerate() {
            out[q] = nid(i + (cr[0] > 0.0) as usize, j + (cr[1] > 0.0) as usize, k + (cr[2] > 0.0) as usize);
        }
        out
    };
    let mut used = vec![false; nn];
    for &c in &cells {
        for v in cell_nodes(c) {
            used[v] = true;
        }
    }
    let pos = |v: usize| -> [f64; 3] {
        let (i, j, k) = (v % gx, (v / gx) % gy, v / (gx * gy));
        [b[0] + i as f64 * h[0], b[1] + j as f64 * h[1], b[2] + k as f64 * h[2]]
    };
    let tol = 1e-6 * longest;
    // The mesh follows the part only to a cell, so a box reaches half a cell further.
    let half = [h[0] * 0.51, h[1] * 0.51, h[2] * 0.51];
    let in_sel = |s: &Sel, p: [f64; 3]| -> bool {
        match s {
            Sel::All => true,
            Sel::Face(a, hi) => (p[*a] - if *hi { b[a + 3] } else { b[*a] }).abs() < tol + 1e-9,
            Sel::Box(bx) => (0..3).all(|k| p[k] >= bx[k] - half[k] && p[k] <= bx[k + 3] + half[k]),
        }
    };
    // Outer faces of the active cells: (four nodes, area in m², outward axis and side).
    let mut faces: Vec<([usize; 4], f64, usize, bool)> = Vec::new();
    for &c in &cells {
        let (i, j, k) = (c % nx, (c / nx) % ny, c / (nx * ny));
        let idx = [i, j, k];
        for a in 0..3 {
            for hi in [false, true] {
                let mut nb = idx;
                let outside = if hi { idx[a] + 1 >= nc[a] } else { idx[a] == 0 };
                let exposed = outside || {
                    if hi {
                        nb[a] += 1
                    } else {
                        nb[a] -= 1
                    }
                    !active[(nb[2] * ny + nb[1]) * nx + nb[0]]
                };
                if exposed {
                    let ns = cell_nodes(c);
                    let side: Vec<usize> = (0..8).filter(|&q| (CORNERS[q][a] > 0.0) == hi).map(|q| ns[q]).collect();
                    let (u, v) = ((a + 1) % 3, (a + 2) % 3);
                    faces.push(([side[0], side[1], side[2], side[3]], h[u] * h[v] * geo.scale * geo.scale, a, hi));
                }
            }
        }
    }
    let face_in = |f: &([usize; 4], f64, usize, bool), s: &Sel| -> bool {
        match s {
            // A face selection takes outer faces on that side of the bounding box.
            Sel::Face(a, hi) => f.2 == *a && f.3 == *hi && f.0.iter().all(|&v| in_sel(s, pos(v))),
            _ => f.0.iter().all(|&v| in_sel(s, pos(v))),
        }
    };
    let sm = geo.scale;
    let hm = [h[0] * sm, h[1] * sm, h[2] * sm];
    let vol_cell = hm[0] * hm[1] * hm[2];
    let mut d = Dataset::default();
    ctx.report(0.1, "mesh");
    let dofs_per = if heat { 1 } else { 3 };
    let ndof = nn * dofs_per;
    let mut fixed: Vec<Option<f64>> = vec![None; ndof];
    let mut f = vec![0.0; ndof];
    let mut fix_groups: Vec<Vec<usize>> = Vec::new();
    if heat {
        for (s, t) in &spec.temps {
            let mut g = Vec::new();
            for v in 0..nn {
                if used[v] && in_sel(s, pos(v)) {
                    fixed[v] = Some(*t);
                    g.push(v);
                }
            }
            if g.is_empty() {
                return Err("a temperature selection holds no node of the part".into());
            }
            fix_groups.push(g);
        }
        if fixed.iter().all(|x| x.is_none()) && spec.convs.is_empty() {
            return Err("give a temperature or a convection (e.g. temperature: x-, T = 100)".into());
        }
        for (s, q) in &spec.fluxes {
            for fc in faces.iter().filter(|fc| face_in(fc, s)) {
                for &v in &fc.0 {
                    f[v] += q * fc.1 / 4.0;
                }
            }
        }
        for (s, q, total) in &spec.sources {
            let centre = |c: usize| {
                let p = pos(cell_nodes(c)[0]);
                [p[0] + h[0] / 2.0, p[1] + h[1] / 2.0, p[2] + h[2] / 2.0]
            };
            let inside: Vec<usize> = cells.iter().cloned().filter(|&c| in_sel(s, centre(c))).collect();
            if inside.is_empty() {
                return Err("a source box holds no cell of the part".into());
            }
            let per_cell = if *total { q / inside.len() as f64 } else { q * vol_cell };
            for c in inside {
                for v in cell_nodes(c) {
                    f[v] += per_cell / 8.0;
                }
            }
        }
    } else {
        for (s, dirs) in &spec.fixes {
            let mut g = Vec::new();
            for v in 0..nn {
                if used[v] && in_sel(s, pos(v)) {
                    for k in 0..3 {
                        if dirs[k] {
                            fixed[3 * v + k] = Some(0.0);
                        }
                    }
                    g.push(v);
                }
            }
            if g.is_empty() {
                return Err("a fix selection holds no node of the part".into());
            }
            fix_groups.push(g);
        }
        if fixed.iter().all(|x| x.is_none()) {
            return Err("hold the part somewhere (e.g. fix: x-)".into());
        }
        for (s, fv) in &spec.loads {
            // Spread over the outer faces in the selection by area (or over its nodes).
            let sel_faces: Vec<&([usize; 4], f64, usize, bool)> = faces.iter().filter(|fc| face_in(fc, s)).collect();
            let area: f64 = sel_faces.iter().map(|fc| fc.1).sum();
            if area > 0.0 {
                for fc in sel_faces {
                    for &v in &fc.0 {
                        for k in 0..3 {
                            f[3 * v + k] += fv[k] * fc.1 / area / 4.0;
                        }
                    }
                }
            } else {
                let ns: Vec<usize> = (0..nn).filter(|&v| used[v] && in_sel(s, pos(v))).collect();
                if ns.is_empty() {
                    return Err("a load selection holds no node of the part".into());
                }
                for v in &ns {
                    for k in 0..3 {
                        f[3 * v + k] += fv[k] / ns.len() as f64;
                    }
                }
            }
        }
        if spec.gravity.iter().any(|g| *g != 0.0) {
            for &c in &cells {
                for v in cell_nodes(c) {
                    for k in 0..3 {
                        f[3 * v + k] += geo.density * spec.gravity[k] * vol_cell / 8.0;
                    }
                }
            }
        }
    }
    // Equation numbers.
    let mut eq = vec![usize::MAX; ndof];
    let mut neq = 0;
    for dof in 0..ndof {
        if used[dof / dofs_per] && fixed[dof].is_none() {
            eq[dof] = neq;
            neq += 1;
        }
    }
    // The element matrix (the same for every cell of the structured mesh).
    let ke: Vec<Vec<f64>> = if heat {
        let mut k = vec![vec![0.0; 8]; 8];
        for p in gauss() {
            let g = grads(p, hm);
            for i in 0..8 {
                for j in 0..8 {
                    k[i][j] += geo.k * (g[i][0] * g[j][0] + g[i][1] * g[j][1] + g[i][2] * g[j][2]) * vol_cell / 8.0;
                }
            }
        }
        k
    } else {
        if !(geo.e > 0.0) || !(geo.nu > -1.0 && geo.nu < 0.5) {
            return Err("the material needs E > 0 and −1 < ν < 0.5".into());
        }
        hex11(hm, geo.e, geo.nu)?
    };
    let edof = |c: usize| -> Vec<usize> { cell_nodes(c).iter().flat_map(|&v| (0..dofs_per).map(move |k| v * dofs_per + k)).collect() };
    let mut trip = Vec::with_capacity(cells.len() * ke.len() * ke.len());
    let mut rhs = vec![0.0; neq];
    for dof in 0..ndof {
        if eq[dof] != usize::MAX {
            rhs[eq[dof]] += f[dof];
        }
    }
    for &c in &cells {
        let ed = edof(c);
        for (a, &da) in ed.iter().enumerate() {
            if eq[da] == usize::MAX {
                continue;
            }
            for (bq, &db) in ed.iter().enumerate() {
                match (eq[db], fixed[db]) {
                    (e, _) if e != usize::MAX => trip.push((eq[da], e, ke[a][bq])),
                    (_, Some(val)) => rhs[eq[da]] -= ke[a][bq] * val,
                    _ => {}
                }
            }
        }
    }
    // Convection (lumped on the face nodes).
    let mut conv_faces = Vec::new();
    if heat {
        for (s, hc, tinf) in &spec.convs {
            for fc in faces.iter().filter(|fc| face_in(fc, s)) {
                for &v in &fc.0 {
                    if eq[v] != usize::MAX {
                        trip.push((eq[v], eq[v], hc * fc.1 / 4.0));
                        rhs[eq[v]] += hc * tinf * fc.1 / 4.0;
                    }
                }
                conv_faces.push((fc.0, fc.1, *hc, *tinf));
            }
        }
    }
    ctx.report(0.3, "solving");
    let k = Csr::from(neq, trip);
    let mut x = vec![0.0; neq];
    let iterations = k.solve(&rhs, &mut x, ctx)?;
    let mut u = vec![0.0; ndof];
    for dof in 0..ndof {
        u[dof] = if eq[dof] != usize::MAX { x[eq[dof]] } else { fixed[dof].unwrap_or(0.0) };
    }
    // Reactions (or heat in) at the fixed dofs: K u − f.
    let mut react = vec![0.0; ndof];
    for &c in &cells {
        let ed = edof(c);
        for (a, &da) in ed.iter().enumerate() {
            if fixed[da].is_some() {
                react[da] += ed.iter().enumerate().map(|(bq, &db)| ke[a][bq] * u[db]).sum::<f64>();
            }
        }
    }
    // Convection at nodes held at a temperature leaves through them too.
    for (ns, a, hc, tinf) in &conv_faces {
        for &v in ns {
            if heat && fixed[v].is_some() {
                react[v] += hc * a / 4.0 * (u[v] - tinf);
            }
        }
    }
    // Per-cell value at the centre: von Mises stress or the heat flux magnitude.
    let g0 = grads([0.0; 3], hm);
    let dm = dmat(geo.e, geo.nu);
    let mut cell_val = vec![f64::NAN; active.len()];
    for &c in &cells {
        let ns = cell_nodes(c);
        if heat {
            let mut gr = [0.0; 3];
            for (q, &v) in ns.iter().enumerate() {
                for k in 0..3 {
                    gr[k] += g0[q][k] * u[v];
                }
            }
            cell_val[c] = geo.k * (gr[0] * gr[0] + gr[1] * gr[1] + gr[2] * gr[2]).sqrt();
        } else {
            let bu = bmat(&g0);
            let mut eps = [0.0; 6];
            for (q, &v) in ns.iter().enumerate() {
                for k in 0..3 {
                    for r in 0..6 {
                        eps[r] += bu[3 * q + k][r] * u[3 * v + k];
                    }
                }
            }
            let sg: Vec<f64> = (0..6).map(|r| (0..6).map(|cc| dm[r][cc] * eps[cc]).sum()).collect();
            cell_val[c] = (0.5 * ((sg[0] - sg[1]).powi(2) + (sg[1] - sg[2]).powi(2) + (sg[2] - sg[0]).powi(2)) + 3.0 * (sg[3] * sg[3] + sg[4] * sg[4] + sg[5] * sg[5])).sqrt();
        }
    }
    // Node values: averages of the cells around (stress), or the solution (temperature).
    let mut nsum = vec![0.0; nn];
    let mut ncnt = vec![0.0; nn];
    for &c in &cells {
        for v in cell_nodes(c) {
            nsum[v] += cell_val[c];
            ncnt[v] += 1.0;
        }
    }
    let node_val: Vec<f64> = (0..nn).map(|v| if heat { u[v] } else if ncnt[v] > 0.0 { nsum[v] / ncnt[v] } else { f64::NAN }).collect();
    let (field, unit) = if heat { ("T", "°C") } else { ("von Mises", "Pa") };
    let used_nodes: Vec<usize> = (0..nn).filter(|&v| used[v]).collect();
    let umag = |v: usize| if heat { 0.0 } else { (u[3 * v].powi(2) + u[3 * v + 1].powi(2) + u[3 * v + 2].powi(2)).sqrt() };
    let umax = used_nodes.iter().map(|&v| umag(v)).fold(0.0, f64::max);
    // The surface (outer face nodes), drawn deformed for elasticity.
    let mut on_surface = vec![false; nn];
    for fc in &faces {
        for &v in &fc.0 {
            on_surface[v] = true;
        }
    }
    let exaggerate = ctx.num("deform", 1.0)?;
    let scale = if heat || umax == 0.0 { 0.0 } else { exaggerate * 0.08 * longest * sm / umax };
    let surf: Vec<usize> = used_nodes.iter().cloned().filter(|&v| on_surface[v]).collect();
    let mut pts = Table::new("field points");
    for k in 0..3 {
        pts.push(Column::new(["x", "y", "z"][k], &geo.unit, surf.iter().map(|&v| pos(v)[k] + if heat { 0.0 } else { scale * u[3 * v + k] / sm }).collect()));
    }
    pts.push(Column::new(field, unit, surf.iter().map(|&v| node_val[v]).collect()));
    if !heat {
        for (k, name) in ["ux", "uy", "uz"].iter().enumerate() {
            pts.push(Column::new(name, "m", surf.iter().map(|&v| u[3 * v + k]).collect()));
        }
    }
    d.tables.push(pts);
    // A slice through the middle (the x–z plane, viewed from the side).
    let jm = ny / 2;
    let slice: Vec<f64> = (0..nz).flat_map(|k| (0..nx).map(move |i| (k, i))).map(|(k, i)| {
        let c = (k * ny + jm) * nx + i;
        if heat {
            if active[c] {
                let ns = cell_nodes(c);
                ns.iter().map(|&v| u[v]).sum::<f64>() / 8.0
            } else {
                f64::NAN
            }
        } else {
            cell_val[c]
        }
    }).collect();
    d.grids.push(Grid {
        name: format!("{field} (middle slice)"),
        x: (0..nx).map(|i| b[0] + (i as f64 + 0.5) * h[0]).collect(),
        y: (0..nz).map(|k| b[2] + (k as f64 + 0.5) * h[2]).collect(),
        z: slice,
        x_label: format!("x ({})", geo.unit),
        y_label: format!("z ({})", geo.unit),
        z_label: format!("{field} ({unit})"),
        x_names: None,
        y_names: None,
    });
    // Results.
    let finite = |vals: &mut dyn Iterator<Item = f64>| vals.filter(|v| v.is_finite()).fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| (lo.min(v), hi.max(v)));
    let volume = cells.len() as f64 * vol_cell;
    d.scalar("volume", volume, "m³");
    d.scalar("mass", volume * geo.density, "kg");
    if heat {
        let (lo, hi) = finite(&mut used_nodes.iter().map(|&v| u[v]));
        d.scalar("T max", hi, "°C");
        d.scalar("T min", lo, "°C");
        for (gi, g) in fix_groups.iter().enumerate() {
            let q: f64 = g.iter().map(|&v| react[v] - f[v]).sum();
            d.scalar(&format!("heat in (temperature {})", gi + 1), q, "W");
        }
        let qc: f64 = conv_faces.iter().map(|(ns, a, hc, tinf)| hc * a * (tinf - ns.iter().map(|&v| u[v]).sum::<f64>() / 4.0)).sum();
        if !conv_faces.is_empty() {
            d.scalar("heat in (convection)", qc, "W");
        }
    } else {
        d.scalar("displacement max", umax, "m");
        let (_, hi) = finite(&mut cells.iter().map(|&c| cell_val[c]));
        d.scalar("von Mises max", hi, "Pa");
        if let Some(y) = ctx.num("yield", 0.0).ok().filter(|v| *v > 0.0) {
            d.scalar("safety factor", y / hi, "");
        }
        for (gi, g) in fix_groups.iter().enumerate() {
            for (k, axis) in ["x", "y", "z"].iter().enumerate() {
                let r: f64 = g.iter().filter(|&&v| fixed[3 * v + k].is_some()).map(|&v| react[3 * v + k] - f[3 * v + k]).sum();
                d.scalar(&format!("reaction {axis} (fix {})", gi + 1), r, "N");
            }
        }
        d.scalar("deformation scale", scale, "");
    }
    for (name, p) in &spec.probes {
        let v = used_nodes.iter().cloned().min_by(|&a, &c| {
            let (pa, pc) = (pos(a), pos(c));
            let da: f64 = (0..3).map(|k| (pa[k] - p[k]).powi(2)).sum();
            let dc: f64 = (0..3).map(|k| (pc[k] - p[k]).powi(2)).sum();
            da.partial_cmp(&dc).unwrap()
        });
        if let Some(v) = v {
            if heat {
                d.scalar(&format!("T({name})"), u[v], "°C");
            } else {
                for (k, axis) in ["ux", "uy", "uz"].iter().enumerate() {
                    d.scalar(&format!("{axis}({name})"), u[3 * v + k], "m");
                }
                d.scalar(&format!("von Mises({name})"), node_val[v], "Pa");
            }
        }
    }
    d.scalar("cells", cells.len() as f64, "");
    d.scalar("nodes", used_nodes.len() as f64, "");
    d.scalar("iterations", iterations as f64, "");
    Ok(d)
}
