//! Geometry: solid bodies as signed distance functions (negative inside).
//!
//! A body is a tree of primitives (box, cylinder, tube, sphere, cone, torus, extruded and revolved
//! polygons, imported triangle meshes) combined with union / subtract / intersect, each node with its
//! own placement (position + rotation in degrees, applied X, then Y, then Z). The mesher samples the
//! sign to find where a body is and the gradient to pull boundary nodes onto the surface.

use serde::Deserialize;

pub type V3 = [f64; 3];

#[inline]
pub fn sub(a: V3, b: V3) -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
#[inline]
pub fn add(a: V3, b: V3) -> V3 { [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
#[inline]
pub fn scale(a: V3, s: f64) -> V3 { [a[0] * s, a[1] * s, a[2] * s] }
#[inline]
pub fn dot(a: V3, b: V3) -> f64 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
#[inline]
pub fn cross(a: V3, b: V3) -> V3 { [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
#[inline]
pub fn norm(a: V3) -> f64 { dot(a, a).sqrt() }
pub fn normalize(a: V3) -> V3 { let n = norm(a); if n > 0.0 { scale(a, 1.0 / n) } else { [0.0, 0.0, 0.0] } }

#[derive(Clone, Debug, Deserialize, Default)]
#[serde(default)]
pub struct Placement {
    pub position: V3,
    /// Degrees about X, Y, Z (applied in that order).
    pub rotation: V3,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Shape {
    /// Centred box.
    Box { size: V3 },
    /// Axis Z, centred.
    Cylinder { radius: f64, height: f64 },
    Tube { outer: f64, inner: f64, height: f64 },
    Sphere { radius: f64 },
    /// Radius r1 at z = −h/2, r2 at z = +h/2.
    Cone { r1: f64, r2: f64, height: f64 },
    /// In the XY plane, around Z.
    Torus { major: f64, minor: f64 },
    /// A polygon in XY extruded along Z (centred).
    Extrude { points: Vec<[f64; 2]>, height: f64 },
    /// A polygon in (r, z) revolved around Z.
    Revolve { points: Vec<[f64; 2]> },
    /// A closed triangle mesh (STL), flat x y z per vertex, three vertices per triangle.
    Mesh { positions: Vec<f64> },
    Union { children: Vec<Node> },
    /// The first child minus all the others.
    Subtract { children: Vec<Node> },
    Intersect { children: Vec<Node> },
}

#[derive(Clone, Debug, Deserialize)]
pub struct Node {
    #[serde(flatten)]
    pub shape: Shape,
    #[serde(default)]
    pub placement: Placement,
}

/// A body prepared for fast evaluation.
pub struct Solid {
    root: Compiled,
    pub bbox: (V3, V3),
}

enum Prim {
    Box(V3),
    Cylinder(f64, f64),
    Tube(f64, f64, f64),
    Sphere(f64),
    Cone(f64, f64, f64),
    Torus(f64, f64),
    Extrude(Vec<[f64; 2]>, f64),
    Revolve(Vec<[f64; 2]>),
    Mesh(Box<TriMesh>),
    Union(Vec<Compiled>),
    Subtract(Vec<Compiled>),
    Intersect(Vec<Compiled>),
}

struct Compiled {
    prim: Prim,
    /// Index of this primitive among the body's leaves (for surface patches).
    leaf: u32,
    /// Extrude / revolve: the smooth run each profile edge belongs to.
    edge_patch: Vec<u32>,
    /// World → local: local = R^T (p − t).
    r: [[f64; 3]; 3],
    t: V3,
    identity: bool,
}

fn rotation(deg: V3) -> [[f64; 3]; 3] {
    let (a, b, c) = (deg[0].to_radians(), deg[1].to_radians(), deg[2].to_radians());
    let rx = [[1.0, 0.0, 0.0], [0.0, a.cos(), -a.sin()], [0.0, a.sin(), a.cos()]];
    let ry = [[b.cos(), 0.0, b.sin()], [0.0, 1.0, 0.0], [-b.sin(), 0.0, b.cos()]];
    let rz = [[c.cos(), -c.sin(), 0.0], [c.sin(), c.cos(), 0.0], [0.0, 0.0, 1.0]];
    matmul(rz, matmul(ry, rx))
}

fn matmul(a: [[f64; 3]; 3], b: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let mut m = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            m[i][j] = (0..3).map(|k| a[i][k] * b[k][j]).sum();
        }
    }
    m
}

fn rot_apply(r: &[[f64; 3]; 3], v: V3) -> V3 {
    [dot(r[0], v), dot(r[1], v), dot(r[2], v)]
}
fn rot_apply_t(r: &[[f64; 3]; 3], v: V3) -> V3 {
    [r[0][0] * v[0] + r[1][0] * v[1] + r[2][0] * v[2], r[0][1] * v[0] + r[1][1] * v[1] + r[2][1] * v[2], r[0][2] * v[0] + r[1][2] * v[1] + r[2][2] * v[2]]
}

impl Solid {
    pub fn new(node: &Node) -> Result<Solid, String> {
        let mut leaves = 0u32;
        let root = compile(node, &mut leaves)?;
        let bbox = bbox_of(&root);
        if !(bbox.0.iter().zip(bbox.1.iter()).all(|(a, b)| a.is_finite() && b.is_finite() && b > a)) {
            return Err("geometry.empty".into());
        }
        Ok(Solid { root, bbox })
    }

    /// Signed distance (approximate for booleans): negative inside.
    #[inline]
    pub fn sdf(&self, p: V3) -> f64 { eval(&self.root, p) }

    pub fn inside(&self, p: V3) -> bool { self.sdf(p) < 0.0 }

    /// The surface patch nearest to p: primitive index · 64 + its face (a box side, a cylinder's
    /// mantle or cap, a run of smoothly joined profile edges…). NO_PATCH for triangle meshes.
    pub fn patch(&self, p: V3) -> u32 { patch_of(&self.root, p).1 }

    pub fn gradient(&self, p: V3, eps: f64) -> V3 {
        let mut g = [0.0; 3];
        for k in 0..3 {
            let mut a = p;
            let mut b = p;
            a[k] += eps;
            b[k] -= eps;
            g[k] = (self.sdf(a) - self.sdf(b)) / (2.0 * eps);
        }
        g
    }

    /// Moves p onto the surface (a few Newton steps along the gradient).
    pub fn project(&self, p: V3, eps: f64) -> V3 {
        let mut q = p;
        for _ in 0..4 {
            let d = self.sdf(q);
            if d.abs() < eps * 1e-3 {
                break;
            }
            let g = self.gradient(q, eps);
            let gg = dot(g, g);
            if gg < 1e-12 {
                break;
            }
            q = sub(q, scale(g, d / gg));
        }
        q
    }
}

fn compile(node: &Node, leaves: &mut u32) -> Result<Compiled, String> {
    let prim = match &node.shape {
        Shape::Box { size } => {
            if size.iter().any(|v| !(*v > 0.0)) { return Err("geometry.badSize".into()); }
            Prim::Box([size[0] / 2.0, size[1] / 2.0, size[2] / 2.0])
        }
        Shape::Cylinder { radius, height } => {
            if !(*radius > 0.0 && *height > 0.0) { return Err("geometry.badSize".into()); }
            Prim::Cylinder(*radius, height / 2.0)
        }
        Shape::Tube { outer, inner, height } => {
            if !(*outer > *inner && *inner >= 0.0 && *height > 0.0) { return Err("geometry.badSize".into()); }
            Prim::Tube(*outer, *inner, height / 2.0)
        }
        Shape::Sphere { radius } => {
            if !(*radius > 0.0) { return Err("geometry.badSize".into()); }
            Prim::Sphere(*radius)
        }
        Shape::Cone { r1, r2, height } => {
            if !(*r1 >= 0.0 && *r2 >= 0.0 && (r1 + r2) > 0.0 && *height > 0.0) { return Err("geometry.badSize".into()); }
            Prim::Cone(*r1, *r2, height / 2.0)
        }
        Shape::Torus { major, minor } => {
            if !(*major > *minor && *minor > 0.0) { return Err("geometry.badSize".into()); }
            Prim::Torus(*major, *minor)
        }
        Shape::Extrude { points, height } => {
            if points.len() < 3 || !(*height > 0.0) { return Err("geometry.badProfile".into()); }
            Prim::Extrude(points.clone(), height / 2.0)
        }
        Shape::Revolve { points } => {
            if points.len() < 3 || points.iter().any(|p| p[0] < -1e-9) { return Err("geometry.badProfile".into()); }
            Prim::Revolve(points.clone())
        }
        Shape::Mesh { positions } => {
            if positions.len() < 36 || positions.len() % 9 != 0 { return Err("geometry.badMesh".into()); }
            Prim::Mesh(Box::new(TriMesh::new(positions)))
        }
        Shape::Union { children } => Prim::Union(children.iter().map(|c| compile(c, leaves)).collect::<Result<_, _>>()?),
        Shape::Subtract { children } => {
            if children.is_empty() { return Err("geometry.empty".into()); }
            Prim::Subtract(children.iter().map(|c| compile(c, leaves)).collect::<Result<_, _>>()?)
        }
        Shape::Intersect { children } => {
            if children.is_empty() { return Err("geometry.empty".into()); }
            Prim::Intersect(children.iter().map(|c| compile(c, leaves)).collect::<Result<_, _>>()?)
        }
    };
    let pl = &node.placement;
    let identity = pl.position == [0.0; 3] && pl.rotation == [0.0; 3];
    let is_leaf = !matches!(prim, Prim::Union(_) | Prim::Subtract(_) | Prim::Intersect(_));
    let leaf = if is_leaf { *leaves += 1; *leaves - 1 } else { u32::MAX };
    let edge_patch = match &prim {
        Prim::Extrude(poly, _) | Prim::Revolve(poly) => smooth_runs(poly, 30.0),
        _ => Vec::new(),
    };
    Ok(Compiled { prim, leaf, edge_patch, r: rotation(pl.rotation), t: pl.position, identity })
}

pub const NO_PATCH: u32 = u32::MAX;

/// Patch numbers along a closed polygon: a new patch where consecutive edges turn by more than `angle`.
fn smooth_runs(poly: &[[f64; 2]], angle: f64) -> Vec<u32> {
    let n = poly.len();
    let dir = |i: usize| { let a = poly[i]; let b = poly[(i + 1) % n]; let d = [b[0] - a[0], b[1] - a[1]]; let l = (d[0] * d[0] + d[1] * d[1]).sqrt().max(1e-300); [d[0] / l, d[1] / l] };
    let limit = angle.to_radians().cos();
    let sharp: Vec<bool> = (0..n).map(|i| { let a = dir((i + n - 1) % n); let b = dir(i); a[0] * b[0] + a[1] * b[1] < limit }).collect();
    // Start counting at a sharp corner so a run does not wrap around the start.
    let start = sharp.iter().position(|s| *s).unwrap_or(0);
    let mut out = vec![0u32; n];
    let mut id = 0u32;
    for k in 0..n {
        let i = (start + k) % n;
        if k > 0 && sharp[i] { id += 1; }
        out[i] = id;
    }
    out
}

/// Nearest polygon edge to p.
fn nearest_edge(v: &[[f64; 2]], p: [f64; 2]) -> usize {
    let n = v.len();
    let mut best = (f64::INFINITY, 0);
    for i in 0..n {
        let a = v[i];
        let b = v[(i + 1) % n];
        let e = [b[0] - a[0], b[1] - a[1]];
        let w = [p[0] - a[0], p[1] - a[1]];
        let ee = e[0] * e[0] + e[1] * e[1];
        let t = if ee > 0.0 { ((w[0] * e[0] + w[1] * e[1]) / ee).clamp(0.0, 1.0) } else { 0.0 };
        let d = (w[0] - e[0] * t).powi(2) + (w[1] - e[1] * t).powi(2);
        if d < best.0 { best = (d, i); }
    }
    best.1
}

/// (signed distance, patch) — the patch of the primitive whose surface gives the distance.
fn patch_of(c: &Compiled, p: V3) -> (f64, u32) {
    let q = if c.identity { p } else { rot_apply_t(&c.r, sub(p, c.t)) };
    let leaf = |local: u32| c.leaf.saturating_mul(64).saturating_add(local);
    let d = eval(c, p);
    match &c.prim {
        Prim::Box(h) => {
            let a = [q[0].abs() - h[0], q[1].abs() - h[1], q[2].abs() - h[2]];
            let k = if a[0] >= a[1] && a[0] >= a[2] { 0 } else if a[1] >= a[2] { 1 } else { 2 };
            (d, leaf(2 * k as u32 + u32::from(q[k] > 0.0)))
        }
        Prim::Cylinder(r, h) => {
            let dr = (q[0] * q[0] + q[1] * q[1]).sqrt() - r;
            let dz = q[2].abs() - h;
            (d, leaf(if dr > dz { 0 } else { 1 + u32::from(q[2] > 0.0) }))
        }
        Prim::Tube(ro, ri, h) => {
            let rr = (q[0] * q[0] + q[1] * q[1]).sqrt();
            let (a, b, z) = (rr - ro, ri - rr, q[2].abs() - h);
            (d, leaf(if a >= b && a >= z { 0 } else if b >= z { 1 } else { 2 + u32::from(q[2] > 0.0) }))
        }
        Prim::Sphere(_) | Prim::Torus(_, _) => (d, leaf(0)),
        Prim::Cone(r1, r2, h) => {
            let rr = (q[0] * q[0] + q[1] * q[1]).sqrt();
            // Distance to the slanted side line in the (r, z) half plane.
            let (a, b) = ([*r1, -h], [*r2, *h]);
            let e = [b[0] - a[0], b[1] - a[1]];
            let l = (e[0] * e[0] + e[1] * e[1]).sqrt();
            let side = ((rr - a[0]) * e[1] - (q[2] - a[1]) * e[0]) / l;
            let dz = q[2].abs() - h;
            (d, leaf(if side > dz { 0 } else { 1 + u32::from(q[2] > 0.0) }))
        }
        Prim::Extrude(poly, h) => {
            let d2 = sd_polygon(poly, [q[0], q[1]]);
            let dz = q[2].abs() - h;
            if dz > d2 { (d, leaf(u32::from(q[2] > 0.0))) } else { (d, leaf(2 + c.edge_patch[nearest_edge(poly, [q[0], q[1]])])) }
        }
        Prim::Revolve(poly) => {
            let rr = (q[0] * q[0] + q[1] * q[1]).sqrt();
            (d, leaf(c.edge_patch[nearest_edge(poly, [rr, q[2]])]))
        }
        Prim::Mesh(_) => (d, NO_PATCH),
        Prim::Union(ch) => ch.iter().map(|x| patch_of(x, q)).min_by(|a, b| a.0.partial_cmp(&b.0).unwrap()).unwrap_or((d, NO_PATCH)),
        Prim::Subtract(ch) => {
            let mut best = patch_of(&ch[0], q);
            for x in &ch[1..] {
                let (dx, px) = patch_of(x, q);
                if -dx > best.0 { best = (-dx, px); }
            }
            best
        }
        Prim::Intersect(ch) => ch.iter().map(|x| patch_of(x, q)).max_by(|a, b| a.0.partial_cmp(&b.0).unwrap()).unwrap_or((d, NO_PATCH)),
    }
}

fn eval(c: &Compiled, p: V3) -> f64 {
    let q = if c.identity { p } else { rot_apply_t(&c.r, sub(p, c.t)) };
    match &c.prim {
        Prim::Box(h) => sd_box(q, *h),
        Prim::Cylinder(r, h) => sd_cyl(q, *r, *h),
        Prim::Tube(ro, ri, h) => {
            let rr = (q[0] * q[0] + q[1] * q[1]).sqrt();
            let dr = (rr - ro).max(ri - rr);
            let dz = q[2].abs() - h;
            sd2(dr, dz)
        }
        Prim::Sphere(r) => norm(q) - r,
        Prim::Cone(r1, r2, h) => sd_cone(q, *r1, *r2, *h),
        Prim::Torus(rm, rn) => {
            let a = (q[0] * q[0] + q[1] * q[1]).sqrt() - rm;
            (a * a + q[2] * q[2]).sqrt() - rn
        }
        Prim::Extrude(poly, h) => {
            let d = sd_polygon(poly, [q[0], q[1]]);
            sd2(d, q[2].abs() - h)
        }
        Prim::Revolve(poly) => {
            let rr = (q[0] * q[0] + q[1] * q[1]).sqrt();
            sd_polygon(poly, [rr, q[2]])
        }
        Prim::Mesh(m) => m.sdf(q),
        Prim::Union(ch) => ch.iter().map(|x| eval(x, q)).fold(f64::INFINITY, f64::min),
        Prim::Subtract(ch) => {
            let mut d = eval(&ch[0], q);
            for x in &ch[1..] {
                d = d.max(-eval(x, q));
            }
            d
        }
        Prim::Intersect(ch) => ch.iter().map(|x| eval(x, q)).fold(f64::NEG_INFINITY, f64::max),
    }
}

/// Distance of a 2D "box corner" from two signed distances (exact for orthogonal pairs).
#[inline]
fn sd2(a: f64, b: f64) -> f64 {
    let outside = (a.max(0.0).powi(2) + b.max(0.0).powi(2)).sqrt();
    outside + a.max(b).min(0.0)
}

fn sd_box(p: V3, h: V3) -> f64 {
    let q = [p[0].abs() - h[0], p[1].abs() - h[1], p[2].abs() - h[2]];
    let outside = (q[0].max(0.0).powi(2) + q[1].max(0.0).powi(2) + q[2].max(0.0).powi(2)).sqrt();
    outside + q[0].max(q[1]).max(q[2]).min(0.0)
}

fn sd_cyl(p: V3, r: f64, h: f64) -> f64 {
    let dr = (p[0] * p[0] + p[1] * p[1]).sqrt() - r;
    sd2(dr, p[2].abs() - h)
}

fn sd_cone(p: V3, r1: f64, r2: f64, h: f64) -> f64 {
    // Exact capped cone (radii r1 at −h, r2 at +h).
    let q = [(p[0] * p[0] + p[1] * p[1]).sqrt(), p[2]];
    let k1 = [r2, h];
    let k2 = [r2 - r1, 2.0 * h];
    let ca = [q[0] - q[0].min(if q[1] < 0.0 { r1 } else { r2 }), q[1].abs() - h];
    let t = (((k1[0] - q[0]) * k2[0] + (k1[1] - q[1]) * k2[1]) / (k2[0] * k2[0] + k2[1] * k2[1])).clamp(0.0, 1.0);
    let cb = [q[0] - k1[0] + k2[0] * t, q[1] - k1[1] + k2[1] * t];
    let s = if cb[0] < 0.0 && ca[1] < 0.0 { -1.0 } else { 1.0 };
    s * (ca[0] * ca[0] + ca[1] * ca[1]).min(cb[0] * cb[0] + cb[1] * cb[1]).sqrt()
}

/// Signed distance to a simple polygon (negative inside), any winding.
pub fn sd_polygon(v: &[[f64; 2]], p: [f64; 2]) -> f64 {
    let n = v.len();
    let mut d = f64::INFINITY;
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let e = [v[j][0] - v[i][0], v[j][1] - v[i][1]];
        let w = [p[0] - v[i][0], p[1] - v[i][1]];
        let ee = e[0] * e[0] + e[1] * e[1];
        let t = if ee > 0.0 { ((w[0] * e[0] + w[1] * e[1]) / ee).clamp(0.0, 1.0) } else { 0.0 };
        let b = [w[0] - e[0] * t, w[1] - e[1] * t];
        d = d.min(b[0] * b[0] + b[1] * b[1]);
        if (v[i][1] > p[1]) != (v[j][1] > p[1]) {
            let x = v[i][0] + (p[1] - v[i][1]) * (v[j][0] - v[i][0]) / (v[j][1] - v[i][1]);
            if p[0] < x {
                inside = !inside;
            }
        }
        j = i;
    }
    let d = d.sqrt();
    if inside { -d } else { d }
}

fn bbox_of(c: &Compiled) -> (V3, V3) {
    let (lo, hi) = match &c.prim {
        Prim::Box(h) => ([-h[0], -h[1], -h[2]], *h),
        Prim::Cylinder(r, h) => ([-r, -r, -h], [*r, *r, *h]),
        Prim::Tube(ro, _, h) => ([-ro, -ro, -h], [*ro, *ro, *h]),
        Prim::Sphere(r) => ([-r, -r, -r], [*r, *r, *r]),
        Prim::Cone(r1, r2, h) => { let r = r1.max(*r2); ([-r, -r, -h], [r, r, *h]) }
        Prim::Torus(a, b) => ([-(a + b), -(a + b), -b], [a + b, a + b, *b]),
        Prim::Extrude(poly, h) => {
            let (mut lo, mut hi) = ([f64::INFINITY; 3], [f64::NEG_INFINITY; 3]);
            for q in poly { lo[0] = lo[0].min(q[0]); lo[1] = lo[1].min(q[1]); hi[0] = hi[0].max(q[0]); hi[1] = hi[1].max(q[1]); }
            lo[2] = -h; hi[2] = *h;
            (lo, hi)
        }
        Prim::Revolve(poly) => {
            let r = poly.iter().map(|q| q[0]).fold(0.0, f64::max);
            let z0 = poly.iter().map(|q| q[1]).fold(f64::INFINITY, f64::min);
            let z1 = poly.iter().map(|q| q[1]).fold(f64::NEG_INFINITY, f64::max);
            ([-r, -r, z0], [r, r, z1])
        }
        Prim::Mesh(m) => (m.lo, m.hi),
        Prim::Union(ch) => {
            let mut lo = [f64::INFINITY; 3];
            let mut hi = [f64::NEG_INFINITY; 3];
            for x in ch { let (a, b) = bbox_of(x); for k in 0..3 { lo[k] = lo[k].min(a[k]); hi[k] = hi[k].max(b[k]); } }
            (lo, hi)
        }
        Prim::Subtract(ch) => bbox_of(&ch[0]),
        Prim::Intersect(ch) => {
            let mut lo = [f64::NEG_INFINITY; 3];
            let mut hi = [f64::INFINITY; 3];
            for x in ch { let (a, b) = bbox_of(x); for k in 0..3 { lo[k] = lo[k].max(a[k]); hi[k] = hi[k].min(b[k]); } }
            (lo, hi)
        }
    };
    if c.identity {
        return (lo, hi);
    }
    let mut a = [f64::INFINITY; 3];
    let mut b = [f64::NEG_INFINITY; 3];
    for i in 0..8 {
        let corner = [if i & 1 == 0 { lo[0] } else { hi[0] }, if i & 2 == 0 { lo[1] } else { hi[1] }, if i & 4 == 0 { lo[2] } else { hi[2] }];
        let w = add(rot_apply(&c.r, corner), c.t);
        for k in 0..3 { a[k] = a[k].min(w[k]); b[k] = b[k].max(w[k]); }
    }
    (a, b)
}

/// Whether a node's placement keeps the body's faces on the grid axes (no rotation, or quarter turns).
pub fn axis_aligned(node: &Node) -> bool {
    let quarter = |d: f64| ((d / 90.0) - (d / 90.0).round()).abs() < 1e-9;
    if !node.placement.rotation.iter().all(|d| quarter(*d)) {
        return false;
    }
    match &node.shape {
        Shape::Union { children } | Shape::Subtract { children } | Shape::Intersect { children } => children.iter().all(axis_aligned),
        _ => true,
    }
}

/// Planes worth putting grid lines on: the bounding planes of each primitive (in world coordinates,
/// only for axis-aligned placements), so boxes and flat caps fall on element faces exactly.
pub fn grid_planes(node: &Node, out: &mut [Vec<f64>; 3]) {
    fn walk(node: &Node, parent: Option<(&[[f64; 3]; 3], V3)>, out: &mut [Vec<f64>; 3]) {
        let r = rotation(node.placement.rotation);
        let (rr, tt) = match parent {
            Some((pr, pt)) => (matmul(*pr, r), add(rot_apply(pr, node.placement.position), pt)),
            None => (r, node.placement.position),
        };
        match &node.shape {
            Shape::Union { children } | Shape::Subtract { children } | Shape::Intersect { children } => {
                for ch in children { walk(ch, Some((&rr, tt)), out); }
            }
            _ => {
                let c = compile(&Node { shape: node.shape.clone(), placement: Placement::default() }, &mut 0);
                if let Ok(c) = c {
                    let (lo, hi) = bbox_of(&c);
                    for corner in [lo, hi] {
                        let w = add(rot_apply(&rr, corner), tt);
                        for k in 0..3 { out[k].push(w[k]); }
                    }
                    // A tube's bore, a cylinder's axis: no planes (curved), the caps come from the box.
                }
            }
        }
    }
    walk(node, None, out);
}

// ───────────────────────── triangle meshes (STL)

pub struct TriMesh {
    tris: Vec<[V3; 3]>,
    lo: V3,
    hi: V3,
    /// Triangles binned by their XY extent (for the inside test: a vertical ray's crossings).
    bins: Vec<Vec<u32>>,
    nb: usize,
    /// Triangles binned in 3D (for the distance near the surface).
    cells: std::collections::HashMap<(i32, i32, i32), Vec<u32>>,
    cell: f64,
}

impl TriMesh {
    fn new(p: &[f64]) -> TriMesh {
        let n = p.len() / 9;
        let mut tris = Vec::with_capacity(n);
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        for i in 0..n {
            let t = [
                [p[9 * i], p[9 * i + 1], p[9 * i + 2]],
                [p[9 * i + 3], p[9 * i + 4], p[9 * i + 5]],
                [p[9 * i + 6], p[9 * i + 7], p[9 * i + 8]],
            ];
            for v in &t { for k in 0..3 { lo[k] = lo[k].min(v[k]); hi[k] = hi[k].max(v[k]); } }
            tris.push(t);
        }
        let nb = ((n as f64).sqrt().ceil() as usize).clamp(4, 256);
        let mut bins = vec![Vec::new(); nb * nb];
        let size = sub(hi, lo);
        let bx = |x: f64| (((x - lo[0]) / size[0].max(1e-12) * nb as f64) as isize).clamp(0, nb as isize - 1) as usize;
        let by = |y: f64| (((y - lo[1]) / size[1].max(1e-12) * nb as f64) as isize).clamp(0, nb as isize - 1) as usize;
        for (i, t) in tris.iter().enumerate() {
            let (x0, x1) = (t[0][0].min(t[1][0]).min(t[2][0]), t[0][0].max(t[1][0]).max(t[2][0]));
            let (y0, y1) = (t[0][1].min(t[1][1]).min(t[2][1]), t[0][1].max(t[1][1]).max(t[2][1]));
            for ix in bx(x0)..=bx(x1) { for iy in by(y0)..=by(y1) { bins[iy * nb + ix].push(i as u32); } }
        }
        let diag = norm(size);
        let cell = (diag / (n as f64).cbrt().max(1.0) / 2.0).max(diag * 1e-3);
        let mut cells: std::collections::HashMap<(i32, i32, i32), Vec<u32>> = std::collections::HashMap::new();
        for (i, t) in tris.iter().enumerate() {
            let mut a = [f64::INFINITY; 3];
            let mut b = [f64::NEG_INFINITY; 3];
            for v in t { for k in 0..3 { a[k] = a[k].min(v[k]); b[k] = b[k].max(v[k]); } }
            let c0 = [(a[0] / cell).floor() as i32, (a[1] / cell).floor() as i32, (a[2] / cell).floor() as i32];
            let c1 = [(b[0] / cell).floor() as i32, (b[1] / cell).floor() as i32, (b[2] / cell).floor() as i32];
            for x in c0[0]..=c1[0] { for y in c0[1]..=c1[1] { for z in c0[2]..=c1[2] { cells.entry((x, y, z)).or_default().push(i as u32); } } }
        }
        TriMesh { tris, lo, hi, bins, nb, cells, cell }
    }

    fn inside(&self, p: V3) -> bool {
        if (0..3).any(|k| p[k] < self.lo[k] || p[k] > self.hi[k]) { return false; }
        let size = sub(self.hi, self.lo);
        let ix = (((p[0] - self.lo[0]) / size[0].max(1e-12) * self.nb as f64) as isize).clamp(0, self.nb as isize - 1) as usize;
        let iy = (((p[1] - self.lo[1]) / size[1].max(1e-12) * self.nb as f64) as isize).clamp(0, self.nb as isize - 1) as usize;
        // Slightly perturbed ray origin so it does not pass exactly through shared edges.
        let (px, py) = (p[0] + 1.234567e-7 * size[0], p[1] + 2.345678e-7 * size[1]);
        let mut count = 0;
        for &ti in &self.bins[iy * self.nb + ix] {
            let t = &self.tris[ti as usize];
            // Barycentric of (px, py) in the triangle's XY projection.
            let (x0, y0, x1, y1, x2, y2) = (t[0][0], t[0][1], t[1][0], t[1][1], t[2][0], t[2][1]);
            let det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
            if det.abs() < 1e-30 { continue; }
            let l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / det;
            let l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / det;
            let l2 = 1.0 - l0 - l1;
            if l0 < 0.0 || l1 < 0.0 || l2 < 0.0 { continue; }
            let z = l0 * t[0][2] + l1 * t[1][2] + l2 * t[2][2];
            if z > p[2] { count += 1; }
        }
        count % 2 == 1
    }

    fn distance(&self, p: V3) -> f64 {
        let c = [(p[0] / self.cell).floor() as i32, (p[1] / self.cell).floor() as i32, (p[2] / self.cell).floor() as i32];
        let mut best = f64::INFINITY;
        for ring in 0..3 {
            for x in c[0] - ring..=c[0] + ring {
                for y in c[1] - ring..=c[1] + ring {
                    for z in c[2] - ring..=c[2] + ring {
                        if (x - c[0]).abs() < ring && (y - c[1]).abs() < ring && (z - c[2]).abs() < ring { continue; }
                        if let Some(list) = self.cells.get(&(x, y, z)) {
                            for &ti in list { best = best.min(point_triangle(p, &self.tris[ti as usize])); }
                        }
                    }
                }
            }
            if best <= ring as f64 * self.cell { break; }
        }
        if best.is_finite() { best } else {
            // Far away: the distance to the box is enough (only its sign is used there).
            let mut d = 0.0f64;
            for k in 0..3 { d = d.max(self.lo[k] - p[k]).max(p[k] - self.hi[k]); }
            d.max(3.0 * self.cell)
        }
    }

    fn sdf(&self, p: V3) -> f64 {
        let d = self.distance(p);
        if self.inside(p) { -d } else { d }
    }
}

fn point_triangle(p: V3, t: &[V3; 3]) -> f64 {
    // Ericson, closest point on triangle.
    let (a, b, c) = (t[0], t[1], t[2]);
    let ab = sub(b, a);
    let ac = sub(c, a);
    let ap = sub(p, a);
    let d1 = dot(ab, ap);
    let d2 = dot(ac, ap);
    if d1 <= 0.0 && d2 <= 0.0 { return norm(ap); }
    let bp = sub(p, b);
    let d3 = dot(ab, bp);
    let d4 = dot(ac, bp);
    if d3 >= 0.0 && d4 <= d3 { return norm(bp); }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        let v = d1 / (d1 - d3);
        return norm(sub(p, add(a, scale(ab, v))));
    }
    let cp = sub(p, c);
    let d5 = dot(ab, cp);
    let d6 = dot(ac, cp);
    if d6 >= 0.0 && d5 <= d6 { return norm(cp); }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        let w = d2 / (d2 - d6);
        return norm(sub(p, add(a, scale(ac, w))));
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return norm(sub(p, add(b, scale(sub(c, b), w))));
    }
    let denom = 1.0 / (va + vb + vc);
    let v = vb * denom;
    let w = vc * denom;
    norm(sub(p, add(a, add(scale(ab, v), scale(ac, w)))))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(json: &str) -> Node { serde_json::from_str(json).unwrap() }

    #[test]
    fn box_and_cylinder_signs() {
        let b = Solid::new(&node(r#"{"type":"box","size":[2,4,6]}"#)).unwrap();
        assert!(b.inside([0.9, 1.9, 2.9]));
        assert!(!b.inside([1.1, 0.0, 0.0]));
        assert!((b.sdf([2.0, 0.0, 0.0]) - 1.0).abs() < 1e-12);
        let c = Solid::new(&node(r#"{"type":"cylinder","radius":1,"height":2,"placement":{"position":[5,0,0],"rotation":[90,0,0]}}"#)).unwrap();
        assert!(c.inside([5.0, 0.9, 0.0]));
        assert!(!c.inside([5.0, 0.0, 1.1]));
        assert!((c.bbox.0[1] + 1.0).abs() < 1e-9);
    }

    #[test]
    fn subtract_makes_a_hole() {
        let s = Solid::new(&node(r#"{"type":"subtract","children":[{"type":"box","size":[10,10,2]},{"type":"cylinder","radius":2,"height":4}]}"#)).unwrap();
        assert!(!s.inside([0.0, 0.0, 0.0]));
        assert!(s.inside([3.0, 0.0, 0.0]));
    }

    #[test]
    fn mesh_inside_test_matches_box() {
        // A unit cube as 12 triangles.
        let v = [[0., 0., 0.], [1., 0., 0.], [1., 1., 0.], [0., 1., 0.], [0., 0., 1.], [1., 0., 1.], [1., 1., 1.], [0., 1., 1.]];
        let f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
        let mut pos = Vec::new();
        for t in f { for i in t { pos.extend_from_slice(&v[i]); } }
        let m = TriMesh::new(&pos);
        assert!(m.inside([0.5, 0.5, 0.5]));
        assert!(!m.inside([1.5, 0.5, 0.5]));
        assert!((m.sdf([0.5, 0.5, 0.25]) + 0.25).abs() < 1e-9);
    }

    #[test]
    fn polygon_distance() {
        let sq = [[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]];
        assert!((sd_polygon(&sq, [1.0, 1.0]) + 1.0).abs() < 1e-12);
        assert!((sd_polygon(&sq, [3.0, 1.0]) - 1.0).abs() < 1e-12);
    }
}
