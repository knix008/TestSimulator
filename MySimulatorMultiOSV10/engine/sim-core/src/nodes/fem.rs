//! 2D finite elements (the Ansys / COMSOL way of solving fields): heat
//! conduction (steady and transient), electrostatics and plane-stress
//! elasticity on a rectangle with regions of other materials, holes, sources
//! and boundary conditions. Quadratic six-node triangles (T6) on a structured
//! mesh, conjugate gradients with a Jacobi preconditioner.
//!
//! ```text
//! domain: width = 1, height = 0.4, nx = 40, ny = 16
//! material: k = 45, rho = 7850, c = 460, E = 210e9, nu = 0.3
//! region insert: rect 0.2 0.1 0.4 0.3, k = 200, E = 70e9
//! hole bore: circle 0.7 0.2 0.08
//! source coil: rect 0.05 0.15 0.15 0.25, q = 2e5
//! left: T = 100
//! right: convection h = 25, Tinf = 20
//! bore: flux = -500
//! probe centre: 0.5, 0.2
//! ```
//!
//! Boundaries are left, right, top, bottom and the names of holes. Heat:
//! T = value, flux = q (into the body, W/m²), convection h = , Tinf = ,
//! insulated. Electrostatics: V = value, charge density in regions (rho_q).
//! Elasticity: fixed, ux = value, uy = value, traction tx = , ty = (Pa),
//! pressure p = (Pa, pushing in), free; gravity by gx, gy with rho.

use crate::data::{Column, Dataset, Grid, Table};
use crate::expr::Expr;
use crate::Ctx;
use std::collections::HashMap;

#[derive(Debug, Clone)]
enum Shape {
    Rect(f64, f64, f64, f64),
    Circle(f64, f64, f64),
    Poly(Vec<(f64, f64)>),
}

impl Shape {
    fn contains(&self, x: f64, y: f64) -> bool {
        match self {
            Shape::Rect(x0, y0, x1, y1) => x >= x0.min(*x1) && x <= x0.max(*x1) && y >= y0.min(*y1) && y <= y0.max(*y1),
            Shape::Circle(cx, cy, r) => (x - cx).hypot(y - cy) <= *r,
            Shape::Poly(p) => {
                let mut inside = false;
                let n = p.len();
                for i in 0..n {
                    let (xi, yi) = p[i];
                    let (xj, yj) = p[(i + n - 1) % n];
                    if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi {
                        inside = !inside;
                    }
                }
                inside
            }
        }
    }

    /// The nearest point of the outline to (x, y).
    fn project(&self, x: f64, y: f64) -> (f64, f64) {
        let seg = |ax: f64, ay: f64, bx: f64, by: f64| {
            let (dx, dy) = (bx - ax, by - ay);
            let l2 = dx * dx + dy * dy;
            let t = if l2 > 0.0 { (((x - ax) * dx + (y - ay) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
            (ax + t * dx, ay + t * dy)
        };
        let corners: Vec<(f64, f64)> = match self {
            Shape::Circle(cx, cy, r) => {
                let d = (x - cx).hypot(y - cy);
                return if d > 0.0 { (cx + r * (x - cx) / d, cy + r * (y - cy) / d) } else { (cx + r, *cy) };
            }
            Shape::Rect(x0, y0, x1, y1) => vec![(*x0, *y0), (*x1, *y0), (*x1, *y1), (*x0, *y1)],
            Shape::Poly(p) => p.clone(),
        };
        (0..corners.len())
            .map(|i| {
                let a = corners[i];
                let b = corners[(i + 1) % corners.len()];
                seg(a.0, a.1, b.0, b.1)
            })
            .min_by(|p, q| (p.0 - x).hypot(p.1 - y).partial_cmp(&(q.0 - x).hypot(q.1 - y)).unwrap())
            .unwrap_or((x, y))
    }

    /// Distance from (x, y) to the outline.
    fn distance(&self, x: f64, y: f64) -> f64 {
        let seg = |ax: f64, ay: f64, bx: f64, by: f64| {
            let (dx, dy) = (bx - ax, by - ay);
            let l2 = dx * dx + dy * dy;
            let t = if l2 > 0.0 { (((x - ax) * dx + (y - ay) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
            (x - ax - t * dx).hypot(y - ay - t * dy)
        };
        match self {
            Shape::Rect(x0, y0, x1, y1) => [seg(*x0, *y0, *x1, *y0), seg(*x1, *y0, *x1, *y1), seg(*x1, *y1, *x0, *y1), seg(*x0, *y1, *x0, *y0)].into_iter().fold(f64::INFINITY, f64::min),
            Shape::Circle(cx, cy, r) => ((x - cx).hypot(y - cy) - r).abs(),
            Shape::Poly(p) => (0..p.len()).map(|i| {
                let a = p[i];
                let b = p[(i + 1) % p.len()];
                seg(a.0, a.1, b.0, b.1)
            }).fold(f64::INFINITY, f64::min),
        }
    }
}

fn eval(text: &str, consts: &[(String, f64)]) -> Result<f64, String> {
    let names: Vec<String> = consts.iter().map(|c| c.0.clone()).collect();
    let e = Expr::with_names(text.trim(), &names).map_err(|e| format!("\"{}\": {e}", text.trim()))?;
    let vals: Vec<f64> = consts.iter().map(|c| c.1).collect();
    Ok(e.value(&vals))
}

fn parse_shape(text: &str, consts: &[(String, f64)]) -> Result<Shape, String> {
    let mut words = text.split_whitespace();
    let kind = words.next().unwrap_or("").to_ascii_lowercase();
    let nums: Vec<f64> = words.map(|w| eval(w, consts)).collect::<Result<_, _>>()?;
    match kind.as_str() {
        "rect" if nums.len() == 4 => Ok(Shape::Rect(nums[0], nums[1], nums[2], nums[3])),
        "circle" if nums.len() == 3 && nums[2] > 0.0 => Ok(Shape::Circle(nums[0], nums[1], nums[2])),
        "polygon" | "poly" if nums.len() >= 6 && nums.len() % 2 == 0 => Ok(Shape::Poly(nums.chunks(2).map(|c| (c[0], c[1])).collect())),
        _ => Err(format!("\"{text}\": a shape is rect x0 y0 x1 y1, circle cx cy r or polygon x1 y1 x2 y2 …")),
    }
}

#[derive(Debug, Clone, Default)]
struct Bc {
    value: Option<f64>,
    flux: Option<f64>,
    conv: Option<(f64, f64)>,
    ux: Option<f64>,
    uy: Option<f64>,
    traction: Option<(f64, f64)>,
    pressure: Option<f64>,
}

struct Model {
    w: f64,
    h: f64,
    nx: usize,
    ny: usize,
    base: HashMap<String, f64>,
    regions: Vec<(String, Shape, HashMap<String, f64>)>,
    holes: Vec<(String, Shape)>,
    bcs: Vec<(String, Bc)>,
    probes: Vec<(String, f64, f64)>,
}

/// "keyword a = 1, b = 2" items → (keywords, key → value).
fn items(text: &str, consts: &[(String, f64)]) -> Result<(Vec<String>, HashMap<String, f64>), String> {
    let mut words = Vec::new();
    let mut kv = HashMap::new();
    for item in text.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if let Some((k, v)) = item.split_once('=') {
            let mut k = k.trim().to_string();
            // "convection h = 10": a keyword before the first key.
            if let Some((word, key)) = k.clone().rsplit_once(' ') {
                words.push(word.trim().to_ascii_lowercase());
                k = key.trim().to_string();
            }
            kv.insert(k.to_ascii_lowercase(), eval(v, consts)?);
        } else {
            words.push(item.to_ascii_lowercase());
        }
    }
    Ok((words, kv))
}

fn parse(text: &str, consts: &[(String, f64)]) -> Result<Model, String> {
    let mut m = Model { w: 1.0, h: 1.0, nx: 20, ny: 20, base: HashMap::new(), regions: Vec::new(), holes: Vec::new(), bcs: Vec::new(), probes: Vec::new() };
    for (no, raw) in text.lines().enumerate() {
        let line = raw.split('#').next().unwrap().trim();
        if line.is_empty() {
            continue;
        }
        let err = |e: String| format!("line {}: {e}", no + 1);
        let (head, rest) = line.split_once(':').ok_or_else(|| err("expected \"name: …\"".into()))?;
        let head = head.trim();
        let mut hw = head.split_whitespace();
        let first = hw.next().unwrap_or("").to_ascii_lowercase();
        let name = hw.next().map(|s| s.to_string());
        match first.as_str() {
            "domain" => {
                let (_, kv) = items(rest, consts).map_err(err)?;
                m.w = *kv.get("width").unwrap_or(&m.w);
                m.h = *kv.get("height").unwrap_or(&m.h);
                m.nx = kv.get("nx").map(|v| v.round() as usize).unwrap_or(m.nx);
                m.ny = kv.get("ny").map(|v| v.round() as usize).unwrap_or(m.ny);
                if !(m.w > 0.0 && m.h > 0.0) {
                    return Err(err("width and height must be positive".into()));
                }
                if !(1..=400).contains(&m.nx) || !(1..=400).contains(&m.ny) || m.nx * m.ny > 40_000 {
                    return Err(err("nx and ny are 1 … 400 (nx·ny ≤ 40000)".into()));
                }
            }
            "material" => {
                let (_, kv) = items(rest, consts).map_err(err)?;
                m.base.extend(kv);
            }
            "region" | "source" | "hole" => {
                let mut parts = rest.splitn(2, ',');
                let shape = parse_shape(parts.next().unwrap().trim(), consts).map_err(err)?;
                let nm = name.unwrap_or_else(|| format!("{first}{}", no + 1));
                if first == "hole" {
                    m.holes.push((nm, shape));
                } else {
                    let (_, kv) = items(parts.next().unwrap_or(""), consts).map_err(err)?;
                    m.regions.push((nm, shape, kv));
                }
            }
            "probe" => {
                let v: Vec<f64> = rest.split(',').map(|s| eval(s, consts)).collect::<Result<_, _>>().map_err(err)?;
                if v.len() != 2 {
                    return Err(err("probe name: x, y".into()));
                }
                m.probes.push((name.unwrap_or_else(|| format!("p{}", m.probes.len() + 1)), v[0], v[1]));
            }
            _ => {
                // A boundary condition on left/right/top/bottom or a hole.
                let (words, kv) = items(rest, consts).map_err(err)?;
                let mut bc = Bc::default();
                let get = |k: &str| kv.get(k).copied();
                if let Some(v) = get("t").or(get("v")).or(get("value")) {
                    bc.value = Some(v);
                }
                if let Some(q) = get("flux").or(get("q")) {
                    bc.flux = Some(q);
                }
                if words.iter().any(|w| w == "convection") || get("h").is_some() {
                    bc.conv = Some((get("h").ok_or_else(|| err("convection needs h =".into()))?, get("tinf").unwrap_or(0.0)));
                }
                if words.iter().any(|w| w == "fixed") {
                    bc.ux = Some(0.0);
                    bc.uy = Some(0.0);
                }
                if let Some(v) = get("ux") {
                    bc.ux = Some(v);
                }
                if let Some(v) = get("uy") {
                    bc.uy = Some(v);
                }
                if words.iter().any(|w| w == "traction") || get("tx").is_some() || get("ty").is_some() {
                    bc.traction = Some((get("tx").unwrap_or(0.0), get("ty").unwrap_or(0.0)));
                }
                if let Some(p) = get("p").or(get("pressure")) {
                    bc.pressure = Some(p);
                }
                let known = ["convection", "fixed", "traction", "pressure", "insulated", "free"];
                if let Some(w) = words.iter().find(|w| !known.contains(&w.as_str())) {
                    return Err(err(format!("unknown condition \"{w}\"")));
                }
                m.bcs.push((first.clone(), bc));
            }
        }
    }
    for (b, _) in &m.bcs {
        if !["left", "right", "top", "bottom"].contains(&b.as_str()) && !m.holes.iter().any(|(h, _)| h.eq_ignore_ascii_case(b)) {
            return Err(format!("no boundary \"{b}\" (left, right, top, bottom or a hole name)"));
        }
    }
    Ok(m)
}

// ───────────────────────── mesh

struct Mesh {
    /// Node grid (2nx + 1) × (2ny + 1).
    gx: usize,
    gy: usize,
    xy: Vec<(f64, f64)>,
    /// Six nodes per element: corners 0 1 2, mid-sides 01 12 20.
    el: Vec<[usize; 6]>,
    /// Properties per element.
    props: Vec<HashMap<String, f64>>,
    used: Vec<bool>,
    /// Boundary edges: (end, middle, end, opposite corner, boundary name).
    edges: Vec<([usize; 3], usize, String)>,
}

fn mesh(m: &Model) -> Result<Mesh, String> {
    let gx = 2 * m.nx + 1;
    let gy = 2 * m.ny + 1;
    let id = |i: usize, j: usize| j * gx + i;
    let mut xy: Vec<(f64, f64)> = Vec::with_capacity(gx * gy);
    for j in 0..gy {
        for i in 0..gx {
            xy.push((m.w * i as f64 / (gx - 1) as f64, m.h * j as f64 / (gy - 1) as f64));
        }
    }
    let mut el = Vec::new();
    let mut props = Vec::new();
    for cj in 0..m.ny {
        for ci in 0..m.nx {
            let (i, j) = (2 * ci, 2 * cj);
            // Alternate diagonals so the mesh has no preferred direction.
            let tris: [[usize; 6]; 2] = if (ci + cj) % 2 == 0 {
                [
                    [id(i, j), id(i + 2, j), id(i + 2, j + 2), id(i + 1, j), id(i + 2, j + 1), id(i + 1, j + 1)],
                    [id(i, j), id(i + 2, j + 2), id(i, j + 2), id(i + 1, j + 1), id(i + 1, j + 2), id(i, j + 1)],
                ]
            } else {
                [
                    [id(i, j), id(i + 2, j), id(i, j + 2), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)],
                    [id(i + 2, j), id(i + 2, j + 2), id(i, j + 2), id(i + 2, j + 1), id(i + 1, j + 2), id(i + 1, j + 1)],
                ]
            };
            for t in tris {
                let cx = (xy[t[0]].0 + xy[t[1]].0 + xy[t[2]].0) / 3.0;
                let cy = (xy[t[0]].1 + xy[t[1]].1 + xy[t[2]].1) / 3.0;
                if m.holes.iter().any(|(_, s)| s.contains(cx, cy)) {
                    continue;
                }
                let mut p = m.base.clone();
                for (_, s, kv) in &m.regions {
                    if s.contains(cx, cy) {
                        p.extend(kv.iter().map(|(k, v)| (k.clone(), *v)));
                    }
                }
                el.push(t);
                props.push(p);
            }
        }
    }
    if el.is_empty() {
        return Err("the holes cover the whole domain".into());
    }
    let mut used = vec![false; xy.len()];
    for e in &el {
        for &n in e {
            used[n] = true;
        }
    }
    // Boundary edges: edges of one element only.
    let mut count: HashMap<(usize, usize), usize> = HashMap::new();
    for e in &el {
        for (a, b) in [(e[0], e[1]), (e[1], e[2]), (e[2], e[0])] {
            *count.entry((a.min(b), a.max(b))).or_insert(0) += 1;
        }
    }
    let mut edges = Vec::new();
    let tol = 1e-9 * m.w.max(m.h);
    for e in &el {
        for (k, (a, b, mid, opp)) in [(e[0], e[1], e[3], e[2]), (e[1], e[2], e[4], e[0]), (e[2], e[0], e[5], e[1])].into_iter().enumerate() {
            let _ = k;
            if count[&(a.min(b), a.max(b))] != 1 {
                continue;
            }
            let (mx, my) = xy[mid];
            let (ax, ay) = xy[a];
            let (bx, by) = xy[b];
            let name = if ax.abs() < tol && bx.abs() < tol {
                "left".to_string()
            } else if (ax - m.w).abs() < tol && (bx - m.w).abs() < tol {
                "right".to_string()
            } else if ay.abs() < tol && by.abs() < tol {
                "bottom".to_string()
            } else if (ay - m.h).abs() < tol && (by - m.h).abs() < tol {
                "top".to_string()
            } else {
                m.holes.iter().map(|(n, s)| (n, s.distance(mx, my))).min_by(|a, b| a.1.partial_cmp(&b.1).unwrap()).map(|(n, _)| n.to_ascii_lowercase()).unwrap_or_default()
            };
            edges.push(([a, mid, b], opp, name));
        }
    }
    // Fit the cut (staircase) edges of holes onto the true outline: move each corner node on a hole
    // edge to the nearest point of the outline, unless that would turn an element inside out.
    let cell = (m.w / m.nx as f64).min(m.h / m.ny as f64);
    let area2 = |xy: &[(f64, f64)], e: &[usize; 6]| (xy[e[1]].0 - xy[e[0]].0) * (xy[e[2]].1 - xy[e[0]].1) - (xy[e[2]].0 - xy[e[0]].0) * (xy[e[1]].1 - xy[e[0]].1);
    let mut around: Vec<Vec<usize>> = vec![Vec::new(); xy.len()];
    for (k, e) in el.iter().enumerate() {
        for &c in &e[..3] {
            around[c].push(k);
        }
    }
    let on_outer = |p: (f64, f64)| p.0.abs() < tol || (p.0 - m.w).abs() < tol || p.1.abs() < tol || (p.1 - m.h).abs() < tol;
    let mut moved = vec![false; xy.len()];
    for (e, _, name) in &edges {
        let Some((_, shape)) = m.holes.iter().find(|(n, _)| n.eq_ignore_ascii_case(name)) else { continue };
        for &c in &[e[0], e[2]] {
            if moved[c] || on_outer(xy[c]) {
                continue;
            }
            moved[c] = true;
            let old = xy[c];
            let to = shape.project(old.0, old.1);
            if (to.0 - old.0).hypot(to.1 - old.1) > 0.75 * cell || on_outer(to) {
                continue;
            }
            xy[c] = to;
            // Keep it only if every element around keeps a healthy area (≥ 10 % of a regular one, 2A = cell²).
            let ok = around[c].iter().all(|&k| area2(&xy, &el[k]) > 0.1 * cell * cell);
            if !ok {
                xy[c] = old;
            }
        }
    }
    // Mid-side nodes back to the middle of their (possibly moved) edges.
    for e in &el {
        for (mid, a, b) in [(e[3], e[0], e[1]), (e[4], e[1], e[2]), (e[5], e[2], e[0])] {
            xy[mid] = ((xy[a].0 + xy[b].0) / 2.0, (xy[a].1 + xy[b].1) / 2.0);
        }
    }
    Ok(Mesh { gx, gy, xy, el, props, used, edges })
}

/// Gradients of the six shape functions at area coordinates (l0, l1, l2), the element area.
fn t6_grad(xy: &[(f64, f64)], e: &[usize; 6], l: [f64; 3]) -> ([f64; 6], [f64; 6], f64) {
    let p = [xy[e[0]], xy[e[1]], xy[e[2]]];
    let area2 = (p[1].0 - p[0].0) * (p[2].1 - p[0].1) - (p[2].0 - p[0].0) * (p[1].1 - p[0].1);
    // dL_k/dx = b_k / 2A, dL_k/dy = c_k / 2A
    let b = [(p[1].1 - p[2].1) / area2, (p[2].1 - p[0].1) / area2, (p[0].1 - p[1].1) / area2];
    let c = [(p[2].0 - p[1].0) / area2, (p[0].0 - p[2].0) / area2, (p[1].0 - p[0].0) / area2];
    // dN/dL: corners N_k = L_k(2L_k − 1); mid-sides N = 4 L_a L_b.
    let mut dx = [0.0; 6];
    let mut dy = [0.0; 6];
    for k in 0..3 {
        let d = 4.0 * l[k] - 1.0;
        dx[k] = d * b[k];
        dy[k] = d * c[k];
    }
    for (m, (a, bb)) in [(0usize, 1usize), (1, 2), (2, 0)].into_iter().enumerate() {
        dx[3 + m] = 4.0 * (l[a] * b[bb] + l[bb] * b[a]);
        dy[3 + m] = 4.0 * (l[a] * c[bb] + l[bb] * c[a]);
    }
    (dx, dy, area2.abs() / 2.0)
}

const GAUSS: [[f64; 3]; 3] = [[2.0 / 3.0, 1.0 / 6.0, 1.0 / 6.0], [1.0 / 6.0, 2.0 / 3.0, 1.0 / 6.0], [1.0 / 6.0, 1.0 / 6.0, 2.0 / 3.0]];
/// Area coordinates of the six nodes.
const NODES: [[f64; 3]; 6] = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [0.5, 0.5, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5]];
/// ∫ N_i N_j over a T6 element, in units of A / 180.
const MASS: [[f64; 6]; 6] = [
    [6.0, -1.0, -1.0, 0.0, -4.0, 0.0],
    [-1.0, 6.0, -1.0, 0.0, 0.0, -4.0],
    [-1.0, -1.0, 6.0, -4.0, 0.0, 0.0],
    [0.0, 0.0, -4.0, 32.0, 16.0, 16.0],
    [-4.0, 0.0, 0.0, 16.0, 32.0, 16.0],
    [0.0, -4.0, 0.0, 16.0, 16.0, 32.0],
];
/// ∫ N_i over a T6 element / A: corners 0, mid-sides 1/3.
const LOAD: [f64; 6] = [0.0, 0.0, 0.0, 1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0];

// ───────────────────────── sparse system

struct Sys {
    trip: Vec<(usize, usize, f64)>,
    rhs: Vec<f64>,
}

pub(crate) struct Csr {
    n: usize,
    ptr: Vec<usize>,
    col: Vec<usize>,
    val: Vec<f64>,
}

impl Csr {
    pub(crate) fn from(n: usize, mut trip: Vec<(usize, usize, f64)>) -> Csr {
        trip.sort_unstable_by(|a, b| (a.0, a.1).cmp(&(b.0, b.1)));
        let mut ptr = vec![0; n + 1];
        let mut col = Vec::new();
        let mut val: Vec<f64> = Vec::new();
        let mut last = (usize::MAX, usize::MAX);
        for (i, j, v) in trip {
            if (i, j) == last {
                *val.last_mut().unwrap() += v;
            } else {
                col.push(j);
                val.push(v);
                ptr[i + 1] += 1;
                last = (i, j);
            }
        }
        for i in 0..n {
            ptr[i + 1] += ptr[i];
        }
        Csr { n, ptr, col, val }
    }

    fn mul(&self, x: &[f64], y: &mut [f64]) {
        for i in 0..self.n {
            let mut s = 0.0;
            for k in self.ptr[i]..self.ptr[i + 1] {
                s += self.val[k] * x[self.col[k]];
            }
            y[i] = s;
        }
    }

    fn diag(&self) -> Vec<f64> {
        (0..self.n).map(|i| (self.ptr[i]..self.ptr[i + 1]).find(|&k| self.col[k] == i).map(|k| self.val[k]).unwrap_or(1.0)).collect()
    }

    /// Preconditioned conjugate gradients; returns the iterations used.
    pub(crate) fn solve(&self, b: &[f64], x: &mut [f64], ctx: &Ctx) -> Result<usize, String> {
        let n = self.n;
        if n == 0 {
            return Ok(0);
        }
        let d = self.diag();
        let inv: Vec<f64> = d.iter().map(|v| if v.abs() > 0.0 { 1.0 / v } else { 1.0 }).collect();
        let mut r = vec![0.0; n];
        self.mul(x, &mut r);
        for i in 0..n {
            r[i] = b[i] - r[i];
        }
        let bnorm = b.iter().map(|v| v * v).sum::<f64>().sqrt().max(1e-300);
        let mut z: Vec<f64> = (0..n).map(|i| r[i] * inv[i]).collect();
        let mut p = z.clone();
        let mut rz: f64 = (0..n).map(|i| r[i] * z[i]).sum();
        let mut ap = vec![0.0; n];
        let max = 20 * n + 1000;
        for it in 0..max {
            let rn = r.iter().map(|v| v * v).sum::<f64>().sqrt();
            if rn <= 1e-11 * bnorm {
                return Ok(it);
            }
            if it % 200 == 0 {
                ctx.check()?;
            }
            self.mul(&p, &mut ap);
            let pap: f64 = (0..n).map(|i| p[i] * ap[i]).sum();
            if pap <= 0.0 {
                return Err("the system is singular (is the body held? a field needs at least one fixed value)".into());
            }
            let a = rz / pap;
            for i in 0..n {
                x[i] += a * p[i];
                r[i] -= a * ap[i];
                z[i] = r[i] * inv[i];
            }
            let rz2: f64 = (0..n).map(|i| r[i] * z[i]).sum();
            let beta = rz2 / rz;
            rz = rz2;
            for i in 0..n {
                p[i] = z[i] + beta * p[i];
            }
        }
        Err("the solver did not converge".into())
    }
}

/// Unknown numbering: dof → equation (None when prescribed).
struct Dofs {
    eq: Vec<Option<usize>>,
    fixed: Vec<f64>,
}

impl Sys {
    fn add(&mut self, dofs: &Dofs, i: usize, j: usize, v: f64) {
        if let Some(a) = dofs.eq[i] {
            match dofs.eq[j] {
                Some(b) => self.trip.push((a, b, v)),
                None => self.rhs[a] -= v * dofs.fixed[j],
            }
        }
    }

    fn load(&mut self, dofs: &Dofs, i: usize, v: f64) {
        if let Some(a) = dofs.eq[i] {
            self.rhs[a] += v;
        }
    }
}

fn prop(p: &HashMap<String, f64>, keys: &[&str], default: f64) -> f64 {
    keys.iter().find_map(|k| p.get(*k).copied()).unwrap_or(default)
}

fn edge_length(xy: &[(f64, f64)], e: &[usize; 3]) -> f64 {
    (xy[e[2]].0 - xy[e[0]].0).hypot(xy[e[2]].1 - xy[e[0]].1)
}

/// Edge (end, mid, end) integrals: ∫N_i N_j = L/30 [4 2 −1; 2 16 2; −1 2 4], ∫N_i = L [1/6 4/6 1/6].
const EDGE_MASS: [[f64; 3]; 3] = [[4.0, 2.0, -1.0], [2.0, 16.0, 2.0], [-1.0, 2.0, 4.0]];
const EDGE_LOAD: [f64; 3] = [1.0 / 6.0, 4.0 / 6.0, 1.0 / 6.0];

fn grid_of(mesh: &Mesh, name: &str, values: &[f64], label: &str) -> Grid {
    let x: Vec<f64> = (0..mesh.gx).map(|i| mesh.xy[i].0).collect();
    let y: Vec<f64> = (0..mesh.gy).map(|j| mesh.xy[j * mesh.gx].1).collect();
    let z: Vec<f64> = (0..values.len()).map(|k| if mesh.used[k] { values[k] } else { f64::NAN }).collect();
    Grid { name: name.into(), x, y, z, x_label: "x (m)".into(), y_label: "y (m)".into(), z_label: label.into(), x_names: None, y_names: None }
}

fn nearest(mesh: &Mesh, x: f64, y: f64) -> usize {
    (0..mesh.xy.len()).filter(|&k| mesh.used[k]).min_by(|&a, &b| {
        let da = (mesh.xy[a].0 - x).hypot(mesh.xy[a].1 - y);
        let db = (mesh.xy[b].0 - x).hypot(mesh.xy[b].1 - y);
        da.partial_cmp(&db).unwrap()
    }).unwrap_or(0)
}

/// The middle row of the mesh as a table (a line plot through the body).
fn line_table(mesh: &Mesh, cols: &[(&str, &str, &[f64])]) -> Table {
    let j = mesh.gy / 2;
    let ks: Vec<usize> = (0..mesh.gx).map(|i| j * mesh.gx + i).collect();
    let mut t = Table::new("middle line").with_x(Column::new("x", "m", ks.iter().map(|&k| mesh.xy[k].0).collect()));
    for (name, unit, v) in cols {
        t.push(Column::new(name, unit, ks.iter().map(|&k| if mesh.used[k] { v[k] } else { f64::NAN }).collect()));
    }
    t
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let consts = crate::expr::constants(&ctx.str("constants", ""))?;
    let model = parse(&ctx.str("model", ""), &consts)?;
    let physics = ctx.str("physics", "heat");
    let mesh = mesh(&model)?;
    ctx.report(0.1, "mesh");
    let mut d = match physics.as_str() {
        "heat" | "electrostatics" | "transient" => scalar_field(ctx, &model, &mesh, &physics)?,
        "elasticity" => elasticity(ctx, &model, &mesh)?,
        other => return Err(format!("unknown physics \"{other}\"")),
    };
    d.scalar("nodes", mesh.used.iter().filter(|u| **u).count() as f64, "");
    d.scalar("elements", mesh.el.len() as f64, "");
    Ok(d)
}

fn scalar_field(ctx: &mut Ctx, model: &Model, mesh: &Mesh, physics: &str) -> Result<Dataset, String> {
    let electro = physics == "electrostatics";
    let transient = physics == "transient";
    let eps0 = 8.8541878128e-12;
    let n = mesh.xy.len();
    // Coefficient and source per element.
    let coef = |p: &HashMap<String, f64>| if electro { eps0 * prop(p, &["epsr", "eps"], 1.0) } else { prop(p, &["k"], 1.0) };
    let source = |p: &HashMap<String, f64>| if electro { prop(p, &["rho_q", "charge"], 0.0) } else { prop(p, &["q"], 0.0) };
    // Prescribed values (later lines win).
    let mut fixed: Vec<Option<f64>> = vec![None; n];
    let mut group: Vec<Option<usize>> = vec![None; n];
    for (bi, (name, bc)) in model.bcs.iter().enumerate() {
        if let Some(v) = bc.value {
            for (e, _, nm) in &mesh.edges {
                if nm == name {
                    for &k in e {
                        fixed[k] = Some(v);
                        group[k] = Some(bi);
                    }
                }
            }
        }
    }
    let mut eq = vec![None; n];
    let mut neq = 0;
    for k in 0..n {
        if mesh.used[k] && fixed[k].is_none() {
            eq[k] = Some(neq);
            neq += 1;
        }
    }
    if fixed.iter().all(|f| f.is_none()) && !transient && !model.bcs.iter().any(|(_, b)| b.conv.is_some()) {
        return Err(format!("set a {} on some boundary (e.g. left: {} = 0) or a convection", if electro { "potential" } else { "temperature" }, if electro { "V" } else { "T" }));
    }
    let dofs = Dofs { eq, fixed: fixed.iter().map(|f| f.unwrap_or(0.0)).collect() };
    // Element matrices (kept for the flux and the reactions).
    let mut ke_all = Vec::with_capacity(mesh.el.len());
    let mut sys = Sys { trip: Vec::new(), rhs: vec![0.0; neq] };
    let mut fvec = vec![0.0; n];
    let mut mass_trip = Vec::new();
    for (e, p) in mesh.el.iter().zip(&mesh.props) {
        let a = coef(p);
        let mut ke = [[0.0; 6]; 6];
        let mut area = 0.0;
        for g in GAUSS {
            let (dx, dy, ar) = t6_grad(&mesh.xy, e, g);
            area = ar;
            for i in 0..6 {
                for j in 0..6 {
                    ke[i][j] += a * ar / 3.0 * (dx[i] * dx[j] + dy[i] * dy[j]);
                }
            }
        }
        let f = source(p);
        for i in 0..6 {
            for j in 0..6 {
                sys.add(&dofs, e[i], e[j], ke[i][j]);
            }
            fvec[e[i]] += f * area * LOAD[i];
            sys.load(&dofs, e[i], f * area * LOAD[i]);
        }
        if transient {
            let rc = prop(p, &["rho"], 1.0) * prop(p, &["c", "cp"], 1.0);
            for i in 0..6 {
                for j in 0..6 {
                    mass_trip.push((e[i], e[j], rc * area / 180.0 * MASS[i][j]));
                }
            }
        }
        ke_all.push(ke);
    }
    // Flux and convection on boundary edges.
    let mut conv_edges = Vec::new();
    for (name, bc) in &model.bcs {
        for (e, _, nm) in &mesh.edges {
            if nm != name {
                continue;
            }
            let l = edge_length(&mesh.xy, e);
            if let Some(q) = bc.flux {
                for i in 0..3 {
                    fvec[e[i]] += q * l * EDGE_LOAD[i];
                    sys.load(&dofs, e[i], q * l * EDGE_LOAD[i]);
                }
            }
            if let Some((h, tinf)) = bc.conv {
                for i in 0..3 {
                    for j in 0..3 {
                        sys.add(&dofs, e[i], e[j], h * l / 30.0 * EDGE_MASS[i][j]);
                    }
                    sys.load(&dofs, e[i], h * tinf * l * EDGE_LOAD[i]);
                }
                conv_edges.push((name.clone(), *e, h, tinf, l));
            }
        }
    }
    let mut u: Vec<f64> = (0..n).map(|k| fixed[k].unwrap_or(0.0)).collect();
    let unit = if electro { "V" } else { "°C" };
    let field = if electro { "V" } else { "T" };
    let mut d = Dataset::default();
    let mut iterations = 0;
    if !transient {
        let k = Csr::from(neq, std::mem::take(&mut sys.trip));
        let mut x = vec![0.0; neq];
        iterations = k.solve(&sys.rhs, &mut x, ctx)?;
        for k in 0..n {
            if let Some(i) = dofs.eq[k] {
                u[k] = x[i];
            }
        }
    } else {
        let t0 = ctx.num("T0", prop(&model.base, &["t0"], 0.0))?;
        let t_end = ctx.positive("tEnd", 100.0)?;
        let steps = ctx.count("steps", 100, 1, 100_000)?;
        let dt = t_end / steps as f64;
        for k in 0..n {
            if fixed[k].is_none() {
                u[k] = t0;
            }
        }
        // (M/dt + K) u⁺ = M/dt u + F
        let mut a = std::mem::take(&mut sys.trip);
        let mut mrows: Vec<Vec<(usize, f64)>> = vec![Vec::new(); n];
        for &(i, j, v) in &mass_trip {
            mrows[i].push((j, v));
            if let Some(ai) = dofs.eq[i] {
                match dofs.eq[j] {
                    Some(bj) => a.push((ai, bj, v / dt)),
                    None => {}
                }
            }
        }
        let mat = Csr::from(neq, a);
        let mut hist_t = vec![0.0];
        let probe_ids: Vec<usize> = model.probes.iter().map(|p| nearest(mesh, p.1, p.2)).collect();
        let mut hist_p: Vec<Vec<f64>> = probe_ids.iter().map(|&k| vec![u[k]]).collect();
        let used: Vec<usize> = (0..n).filter(|&k| mesh.used[k]).collect();
        let stat = |u: &[f64]| used.iter().map(|&k| u[k]).fold(f64::NEG_INFINITY, f64::max);
        let mut hist_max = vec![stat(&u)];
        let mut x: Vec<f64> = (0..n).filter_map(|k| dofs.eq[k].map(|_| u[k])).collect();
        for s in 0..steps {
            let mut b = sys.rhs.clone();
            for i in 0..n {
                if let Some(ai) = dofs.eq[i] {
                    // M/dt u (fixed columns of M contribute too, both sides: (M/dt)(u⁺ − u) with u⁺ = u there)
                    b[ai] += mrows[i].iter().map(|(j, v)| v / dt * if dofs.eq[*j].is_some() { u[*j] } else { 0.0 }).sum::<f64>();
                }
            }
            iterations += mat.solve(&b, &mut x, ctx)?;
            for k in 0..n {
                if let Some(i) = dofs.eq[k] {
                    u[k] = x[i];
                }
            }
            hist_t.push((s + 1) as f64 * dt);
            for (h, &k) in hist_p.iter_mut().zip(&probe_ids) {
                h.push(u[k]);
            }
            hist_max.push(stat(&u));
            ctx.report(0.1 + 0.85 * (s + 1) as f64 / steps as f64, "time steps");
        }
        let mut t = Table::new("history").with_x(Column::new("t", "s", hist_t));
        for ((name, _, _), h) in model.probes.iter().zip(hist_p) {
            t.push(Column::new(&format!("T({name})"), unit, h));
        }
        t.push(Column::new("T max", unit, hist_max));
        d.tables.push(t);
    }
    // Gradient magnitude (flux or field strength) per node: average over the elements.
    let mut gsum = vec![0.0; n];
    let mut gcnt = vec![0.0; n];
    for (e, p) in mesh.el.iter().zip(&mesh.props) {
        let a = coef(p);
        for (li, l) in NODES.iter().enumerate() {
            let (dx, dy, _) = t6_grad(&mesh.xy, e, *l);
            let gx: f64 = (0..6).map(|i| dx[i] * u[e[i]]).sum();
            let gy: f64 = (0..6).map(|i| dy[i] * u[e[i]]).sum();
            let mag = if electro { gx.hypot(gy) } else { a * gx.hypot(gy) };
            gsum[e[li]] += mag;
            gcnt[e[li]] += 1.0;
        }
    }
    let gmag: Vec<f64> = (0..n).map(|k| if gcnt[k] > 0.0 { gsum[k] / gcnt[k] } else { f64::NAN }).collect();
    // Flow through each boundary: reactions at prescribed values, and convection.
    let mut react = vec![0.0; n];
    for (e, ke) in mesh.el.iter().zip(&ke_all) {
        for i in 0..6 {
            if fixed[e[i]].is_some() {
                react[e[i]] += (0..6).map(|j| ke[i][j] * u[e[j]]).sum::<f64>();
            }
        }
    }
    let mut seen = vec![false; n];
    let mut flows: Vec<(String, f64)> = Vec::new();
    for (bi, (name, bc)) in model.bcs.iter().enumerate() {
        if bc.value.is_some() {
            let mut s = 0.0;
            for k in 0..n {
                if group[k] == Some(bi) && !seen[k] {
                    seen[k] = true;
                    s += react[k] - fvec[k];
                }
            }
            flows.push((name.clone(), s));
        }
    }
    for (name, e, h, tinf, l) in &conv_edges {
        let tm: f64 = (0..3).map(|i| EDGE_LOAD[i] * u[e[i]]).sum::<f64>() * l;
        let q = h * (tinf * l - tm);
        if let Some(f) = flows.iter_mut().find(|f| &f.0 == name) {
            f.1 += q;
        } else {
            flows.push((name.clone(), q));
        }
    }
    for (name, bc) in &model.bcs {
        if let Some(q) = bc.flux {
            let l: f64 = mesh.edges.iter().filter(|(_, _, nm)| nm == name).map(|(e, _, _)| edge_length(&mesh.xy, e)).sum();
            flows.push((name.clone(), q * l));
        }
    }
    let used: Vec<usize> = (0..n).filter(|&k| mesh.used[k]).collect();
    let max = used.iter().map(|&k| u[k]).fold(f64::NEG_INFINITY, f64::max);
    let min = used.iter().map(|&k| u[k]).fold(f64::INFINITY, f64::min);
    // Area-weighted mean.
    let mut area = 0.0;
    let mut integral = 0.0;
    for e in &mesh.el {
        let (_, _, a) = t6_grad(&mesh.xy, e, GAUSS[0]);
        area += a;
        integral += a * (0..6).map(|i| LOAD[i] * u[e[i]]).sum::<f64>();
    }
    d.scalar(&format!("{field} max"), max, unit);
    d.scalar(&format!("{field} min"), min, unit);
    d.scalar(&format!("{field} mean"), integral / area, unit);
    let gname = if electro { "|E|" } else { "heat flux" };
    let gunit = if electro { "V/m" } else { "W/m²" };
    d.scalar(&format!("{gname} max"), used.iter().map(|&k| gmag[k]).fold(0.0, f64::max), gunit);
    for (name, q) in &flows {
        if electro {
            d.scalar(&format!("charge ({name})"), *q, "C/m");
        } else {
            d.scalar(&format!("heat in ({name})"), *q, "W/m");
        }
    }
    if electro {
        // Two electrodes at different potentials: capacitance per unit depth.
        let electrodes: Vec<(f64, f64)> = model.bcs.iter().filter_map(|(nm, b)| b.value.map(|v| (v, flows.iter().find(|f| &f.0 == nm).map(|f| f.1).unwrap_or(0.0)))).collect();
        if electrodes.len() == 2 && (electrodes[0].0 - electrodes[1].0).abs() > 0.0 {
            d.scalar("capacitance", electrodes[0].1.abs() / (electrodes[0].0 - electrodes[1].0).abs(), "F/m");
        }
    }
    for (name, x, y) in &model.probes {
        d.scalar(&format!("{field}({name})"), u[nearest(mesh, *x, *y)], unit);
    }
    d.scalar("iterations", iterations as f64, "");
    d.grids.push(grid_of(mesh, field, &u, &format!("{field} ({unit})")));
    d.grids.push(grid_of(mesh, gname, &gmag, &format!("{gname} ({gunit})")));
    d.tables.push(line_table(mesh, &[(field, unit, &u), (gname, gunit, &gmag)]));
    let mut nodes = Table::new("nodes");
    nodes.push(Column::new("x", "m", used.iter().map(|&k| mesh.xy[k].0).collect()));
    nodes.push(Column::new("y", "m", used.iter().map(|&k| mesh.xy[k].1).collect()));
    nodes.push(Column::new(field, unit, used.iter().map(|&k| u[k]).collect()));
    nodes.push(Column::new(gname, gunit, used.iter().map(|&k| gmag[k]).collect()));
    d.tables.push(nodes);
    Ok(d)
}

fn elasticity(ctx: &mut Ctx, model: &Model, mesh: &Mesh) -> Result<Dataset, String> {
    let n = mesh.xy.len();
    let nd = 2 * n;
    let mut fixed: Vec<Option<f64>> = vec![None; nd];
    // The boundary that holds each displacement component (a corner can be held by two).
    let mut group: Vec<Option<usize>> = vec![None; nd];
    for (bi, (name, bc)) in model.bcs.iter().enumerate() {
        if bc.ux.is_none() && bc.uy.is_none() {
            continue;
        }
        for (e, _, nm) in &mesh.edges {
            if nm == name {
                for &k in e {
                    if let Some(v) = bc.ux {
                        fixed[2 * k] = Some(v);
                        group[2 * k] = Some(bi);
                    }
                    if let Some(v) = bc.uy {
                        fixed[2 * k + 1] = Some(v);
                        group[2 * k + 1] = Some(bi);
                    }
                }
            }
        }
    }
    if !fixed.iter().any(|f| f.is_some()) {
        return Err("hold the body somewhere (e.g. left: fixed)".into());
    }
    let mut eq = vec![None; nd];
    let mut neq = 0;
    for k in 0..nd {
        if mesh.used[k / 2] && fixed[k].is_none() {
            eq[k] = Some(neq);
            neq += 1;
        }
    }
    let dofs = Dofs { eq, fixed: fixed.iter().map(|f| f.unwrap_or(0.0)).collect() };
    let dmat = |p: &HashMap<String, f64>| {
        let e = prop(p, &["e"], 1.0);
        let nu = prop(p, &["nu"], 0.3);
        let c = e / (1.0 - nu * nu);
        [[c, c * nu, 0.0], [c * nu, c, 0.0], [0.0, 0.0, c * (1.0 - nu) / 2.0]]
    };
    let bmat = |dx: &[f64; 6], dy: &[f64; 6]| {
        let mut b = [[0.0; 12]; 3];
        for i in 0..6 {
            b[0][2 * i] = dx[i];
            b[1][2 * i + 1] = dy[i];
            b[2][2 * i] = dy[i];
            b[2][2 * i + 1] = dx[i];
        }
        b
    };
    let mut sys = Sys { trip: Vec::new(), rhs: vec![0.0; neq] };
    let mut ke_all = Vec::with_capacity(mesh.el.len());
    let mut fvec = vec![0.0; nd];
    for (e, p) in mesh.el.iter().zip(&mesh.props) {
        let dm = dmat(p);
        let t = prop(p, &["t", "thickness"], 1.0);
        let mut ke = [[0.0; 12]; 12];
        let mut area = 0.0;
        for g in GAUSS {
            let (dx, dy, ar) = t6_grad(&mesh.xy, e, g);
            area = ar;
            let b = bmat(&dx, &dy);
            // DB
            let mut db = [[0.0; 12]; 3];
            for r in 0..3 {
                for c in 0..12 {
                    db[r][c] = (0..3).map(|k| dm[r][k] * b[k][c]).sum();
                }
            }
            for i in 0..12 {
                for j in 0..12 {
                    ke[i][j] += t * ar / 3.0 * (0..3).map(|k| b[k][i] * db[k][j]).sum::<f64>();
                }
            }
        }
        let dof = |i: usize| 2 * e[i / 2] + i % 2;
        for i in 0..12 {
            for j in 0..12 {
                sys.add(&dofs, dof(i), dof(j), ke[i][j]);
            }
        }
        // Body force ρ g.
        let rho = prop(p, &["rho"], 0.0);
        let (gx, gy) = (prop(p, &["gx"], 0.0), prop(p, &["gy"], 0.0));
        if rho != 0.0 && (gx != 0.0 || gy != 0.0) {
            for i in 0..6 {
                for (c, g) in [(0, gx), (1, gy)] {
                    let f = rho * g * t * area * LOAD[i];
                    fvec[2 * e[i] + c] += f;
                    sys.load(&dofs, 2 * e[i] + c, f);
                }
            }
        }
        ke_all.push(ke);
    }
    // Tractions and pressures on edges.
    let t0 = prop(&model.base, &["t", "thickness"], 1.0);
    for (name, bc) in &model.bcs {
        if bc.traction.is_none() && bc.pressure.is_none() {
            continue;
        }
        for (e, opp, nm) in &mesh.edges {
            if nm != name {
                continue;
            }
            let (ax, ay) = mesh.xy[e[0]];
            let (bx, by) = mesh.xy[e[2]];
            let l = edge_length(&mesh.xy, e);
            // Outward normal: away from the opposite corner.
            let (mut nx, mut ny) = ((by - ay) / l, -(bx - ax) / l);
            let (ox, oy) = mesh.xy[*opp];
            if (ox - ax) * nx + (oy - ay) * ny > 0.0 {
                nx = -nx;
                ny = -ny;
            }
            let (mut tx, mut ty) = bc.traction.unwrap_or((0.0, 0.0));
            if let Some(pr) = bc.pressure {
                tx -= pr * nx;
                ty -= pr * ny;
            }
            for i in 0..3 {
                for (c, tv) in [(0, tx), (1, ty)] {
                    let f = tv * t0 * l * EDGE_LOAD[i];
                    fvec[2 * e[i] + c] += f;
                    sys.load(&dofs, 2 * e[i] + c, f);
                }
            }
        }
    }
    ctx.report(0.3, "solving");
    let k = Csr::from(neq, std::mem::take(&mut sys.trip));
    let mut x = vec![0.0; neq];
    let iterations = k.solve(&sys.rhs, &mut x, ctx)?;
    let mut u: Vec<f64> = (0..nd).map(|k| fixed[k].unwrap_or(0.0)).collect();
    for k in 0..nd {
        if let Some(i) = dofs.eq[k] {
            u[k] = x[i];
        }
    }
    // Stresses at the element nodes, averaged.
    let mut sum = vec![[0.0f64; 4]; n];
    let mut cnt = vec![0.0; n];
    for (e, p) in mesh.el.iter().zip(&mesh.props) {
        let dm = dmat(p);
        for (li, l) in NODES.iter().enumerate() {
            let (dx, dy, _) = t6_grad(&mesh.xy, e, *l);
            let b = bmat(&dx, &dy);
            let ue: Vec<f64> = (0..12).map(|i| u[2 * e[i / 2] + i % 2]).collect();
            let eps: Vec<f64> = (0..3).map(|r| (0..12).map(|c| b[r][c] * ue[c]).sum()).collect();
            let s: Vec<f64> = (0..3).map(|r| (0..3).map(|c| dm[r][c] * eps[c]).sum()).collect();
            let vm = (s[0] * s[0] - s[0] * s[1] + s[1] * s[1] + 3.0 * s[2] * s[2]).sqrt();
            let k = e[li];
            sum[k][0] += s[0];
            sum[k][1] += s[1];
            sum[k][2] += s[2];
            sum[k][3] += vm;
            cnt[k] += 1.0;
        }
    }
    let avg = |c: usize| -> Vec<f64> { (0..n).map(|k| if cnt[k] > 0.0 { sum[k][c] / cnt[k] } else { f64::NAN }).collect() };
    let (sx, sy, txy, vm) = (avg(0), avg(1), avg(2), avg(3));
    let ux: Vec<f64> = (0..n).map(|k| u[2 * k]).collect();
    let uy: Vec<f64> = (0..n).map(|k| u[2 * k + 1]).collect();
    let um: Vec<f64> = (0..n).map(|k| ux[k].hypot(uy[k])).collect();
    // Reactions per held boundary.
    let mut react = vec![0.0; nd];
    for (e, ke) in mesh.el.iter().zip(&ke_all) {
        for i in 0..12 {
            let di = 2 * e[i / 2] + i % 2;
            if fixed[di].is_some() {
                react[di] += (0..12).map(|j| ke[i][j] * u[2 * e[j / 2] + j % 2]).sum::<f64>();
            }
        }
    }
    let mut d = Dataset::default();
    let used: Vec<usize> = (0..n).filter(|&k| mesh.used[k]).collect();
    let max_of = |v: &[f64]| used.iter().map(|&k| v[k]).filter(|v| v.is_finite()).fold(0.0, f64::max);
    d.scalar("|u| max", max_of(&um), "m");
    d.scalar("von Mises max", max_of(&vm), "Pa");
    d.scalar("uy min", used.iter().map(|&k| uy[k]).fold(f64::INFINITY, f64::min), "m");
    d.scalar("ux max", used.iter().map(|&k| ux[k]).fold(f64::NEG_INFINITY, f64::max), "m");
    if let Some(sy) = ctx.num("yield", 0.0).ok().filter(|v| *v > 0.0) {
        d.scalar("safety factor", sy / max_of(&vm).max(1e-300), "");
    }
    for (bi, (name, bc)) in model.bcs.iter().enumerate() {
        if bc.ux.is_none() && bc.uy.is_none() {
            continue;
        }
        let (mut fx, mut fy) = (0.0, 0.0);
        for k in 0..n {
            if group[2 * k] == Some(bi) {
                fx += react[2 * k] - fvec[2 * k];
            }
            if group[2 * k + 1] == Some(bi) {
                fy += react[2 * k + 1] - fvec[2 * k + 1];
            }
        }
        d.scalar(&format!("reaction x ({name})"), fx, "N");
        d.scalar(&format!("reaction y ({name})"), fy, "N");
    }
    let energy: f64 = 0.5 * (0..nd).filter(|&k| dofs.eq[k].is_some()).map(|k| fvec[k] * u[k]).sum::<f64>();
    d.scalar("strain energy", energy, "J");
    for (name, x, y) in &model.probes {
        let k = nearest(mesh, *x, *y);
        d.scalar(&format!("uy({name})"), uy[k], "m");
        d.scalar(&format!("von Mises({name})"), vm[k], "Pa");
    }
    d.scalar("iterations", iterations as f64, "");
    d.grids.push(grid_of(mesh, "von Mises", &vm, "von Mises (Pa)"));
    d.grids.push(grid_of(mesh, "|u|", &um, "|u| (m)"));
    d.grids.push(grid_of(mesh, "ux", &ux, "ux (m)"));
    d.grids.push(grid_of(mesh, "uy", &uy, "uy (m)"));
    d.grids.push(grid_of(mesh, "σx", &sx, "σx (Pa)"));
    d.grids.push(grid_of(mesh, "σy", &sy, "σy (Pa)"));
    d.grids.push(grid_of(mesh, "τxy", &txy, "τxy (Pa)"));
    d.tables.push(line_table(mesh, &[("uy", "m", &uy), ("ux", "m", &ux), ("von Mises", "Pa", &vm)]));
    // The deformed shape, exaggerated so the largest displacement is 10 % of the body.
    let umax = max_of(&um);
    let scale = if umax > 0.0 { 0.1 * model.w.max(model.h) / umax } else { 0.0 };
    let mut nodes = Table::new("nodes");
    nodes.push(Column::new("x", "m", used.iter().map(|&k| mesh.xy[k].0).collect()));
    nodes.push(Column::new("y", "m", used.iter().map(|&k| mesh.xy[k].1).collect()));
    nodes.push(Column::new("x deformed", "m", used.iter().map(|&k| mesh.xy[k].0 + scale * ux[k]).collect()));
    nodes.push(Column::new("y deformed", "m", used.iter().map(|&k| mesh.xy[k].1 + scale * uy[k]).collect()));
    nodes.push(Column::new("ux", "m", used.iter().map(|&k| ux[k]).collect()));
    nodes.push(Column::new("uy", "m", used.iter().map(|&k| uy[k]).collect()));
    nodes.push(Column::new("von Mises", "Pa", used.iter().map(|&k| vm[k]).collect()));
    d.tables.push(nodes);
    d.scalar("deformation scale", scale, "");
    Ok(d)
}
