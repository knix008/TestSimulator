//! Parts and their mass properties (the SolidWorks way): a feature tree of
//! solids added, cut and intersected in order, with linear and circular
//! patterns and mirrors; or a triangle mesh (an imported STL).
//!
//! ```text
//! units: mm
//! material: steel                     # or density = 7850 (kg/m³)
//! base plate: box 0 0 0 120 80 10
//! add boss: cylinder z 60 40 10 25 18
//! cut bore: cylinder z 60 40 -1 40 8
//! cut holes: cylinder z 15 15 -1 12 4, repeat = 2, dx = 90, repeat2 = 2, dy2 = 50
//! cut ring: cylinder z 85 40 -1 12 3, around = 60 40, count = 6
//! add rib: box 20 38 10 40 42 25, mirror = x 60
//! ```
//!
//! Solids: box x0 y0 z0 x1 y1 z1 [angle = deg about z]; cylinder z cx cy z0 h r;
//! cylinder x x0 cy cz length r; cylinder y cx y0 cz length r; cone (same as
//! cylinder with r0 r1); sphere cx cy cz r; torus cx cy cz R r (axis z).
//! Mass properties come from exact integration along vertical rays through an
//! N × N grid (interval Booleans per ray), so curved sides converge as N grows.

use crate::data::{Column, Dataset, Grid, Table};
use crate::expr::Expr;
use crate::linalg::sym_eigen;
use crate::Ctx;
use std::f64::consts::PI;

#[derive(Debug, Clone)]
enum Prim {
    /// A box rotated by `ang` about z around its centre.
    Box { cx: f64, cy: f64, hx: f64, hy: f64, z0: f64, z1: f64, ang: f64 },
    /// A vertical cylinder or cone (radius r0 at z0, r1 at z1).
    VCyl { cx: f64, cy: f64, z0: f64, z1: f64, r0: f64, r1: f64 },
    /// A horizontal cylinder or cone from p along the direction `dir` (radians in the xy plane).
    HCyl { px: f64, py: f64, pz: f64, dir: f64, len: f64, r0: f64, r1: f64 },
    Sphere { cx: f64, cy: f64, cz: f64, r: f64 },
    Torus { cx: f64, cy: f64, cz: f64, big: f64, small: f64 },
}

type Iv = Vec<(f64, f64)>;

impl Prim {
    /// The z-intervals of the vertical line through (x, y) inside the solid.
    fn ray(&self, x: f64, y: f64) -> Iv {
        match *self {
            Prim::Box { cx, cy, hx, hy, z0, z1, ang } => {
                let (dx, dy) = (x - cx, y - cy);
                let (c, s) = (ang.cos(), ang.sin());
                let u = dx * c + dy * s;
                let v = -dx * s + dy * c;
                if u.abs() <= hx && v.abs() <= hy {
                    vec![(z0, z1)]
                } else {
                    vec![]
                }
            }
            Prim::VCyl { cx, cy, z0, z1, r0, r1 } => {
                let rho = (x - cx).hypot(y - cy);
                if (r1 - r0).abs() < 1e-15 {
                    return if rho <= r0 { vec![(z0, z1)] } else { vec![] };
                }
                let zs = z0 + (rho - r0) * (z1 - z0) / (r1 - r0);
                let (a, b) = if r1 > r0 { (zs.max(z0), z1) } else { (z0, zs.min(z1)) };
                if b > a {
                    vec![(a, b)]
                } else {
                    vec![]
                }
            }
            Prim::HCyl { px, py, pz, dir, len, r0, r1 } => {
                let (wx, wy) = (x - px, y - py);
                let (c, s) = (dir.cos(), dir.sin());
                let along = wx * c + wy * s;
                let lat = (wx * s - wy * c).abs();
                if along < 0.0 || along > len {
                    return vec![];
                }
                let r = r0 + (r1 - r0) * along / len;
                if lat > r {
                    return vec![];
                }
                let h = (r * r - lat * lat).sqrt();
                vec![(pz - h, pz + h)]
            }
            Prim::Sphere { cx, cy, cz, r } => {
                let d2 = (x - cx).powi(2) + (y - cy).powi(2);
                if d2 > r * r {
                    return vec![];
                }
                let h = (r * r - d2).sqrt();
                vec![(cz - h, cz + h)]
            }
            Prim::Torus { cx, cy, cz, big, small } => {
                let rho = (x - cx).hypot(y - cy);
                let t = small * small - (rho - big).powi(2);
                if t < 0.0 {
                    return vec![];
                }
                let h = t.sqrt();
                vec![(cz - h, cz + h)]
            }
        }
    }

    /// Bounding box (x0, y0, z0, x1, y1, z1).
    fn bounds(&self) -> [f64; 6] {
        match *self {
            Prim::Box { cx, cy, hx, hy, z0, z1, ang } => {
                let (c, s) = (ang.cos().abs(), ang.sin().abs());
                let (ex, ey) = (hx * c + hy * s, hx * s + hy * c);
                [cx - ex, cy - ey, z0, cx + ex, cy + ey, z1]
            }
            Prim::VCyl { cx, cy, z0, z1, r0, r1 } => {
                let r = r0.max(r1);
                [cx - r, cy - r, z0, cx + r, cy + r, z1]
            }
            Prim::HCyl { px, py, pz, dir, len, r0, r1 } => {
                let r = r0.max(r1);
                let (qx, qy) = (px + len * dir.cos(), py + len * dir.sin());
                [px.min(qx) - r, py.min(qy) - r, pz - r, px.max(qx) + r, py.max(qy) + r, pz + r]
            }
            Prim::Sphere { cx, cy, cz, r } => [cx - r, cy - r, cz - r, cx + r, cy + r, cz + r],
            Prim::Torus { cx, cy, cz, big, small } => {
                let r = big + small;
                [cx - r, cy - r, cz - small, cx + r, cy + r, cz + small]
            }
        }
    }

    fn rotated(&self, ax: f64, ay: f64, a: f64) -> Prim {
        let rot = |x: f64, y: f64| {
            let (dx, dy) = (x - ax, y - ay);
            (ax + dx * a.cos() - dy * a.sin(), ay + dx * a.sin() + dy * a.cos())
        };
        let mut p = self.clone();
        match &mut p {
            Prim::Box { cx, cy, ang, .. } => {
                (*cx, *cy) = rot(*cx, *cy);
                *ang += a;
            }
            Prim::VCyl { cx, cy, .. } | Prim::Sphere { cx, cy, .. } | Prim::Torus { cx, cy, .. } => (*cx, *cy) = rot(*cx, *cy),
            Prim::HCyl { px, py, dir, .. } => {
                (*px, *py) = rot(*px, *py);
                *dir += a;
            }
        }
        p
    }

    fn moved(&self, dx: f64, dy: f64, dz: f64) -> Prim {
        let mut p = self.clone();
        match &mut p {
            Prim::Box { cx, cy, z0, z1, .. } => {
                *cx += dx;
                *cy += dy;
                *z0 += dz;
                *z1 += dz;
            }
            Prim::VCyl { cx, cy, z0, z1, .. } => {
                *cx += dx;
                *cy += dy;
                *z0 += dz;
                *z1 += dz;
            }
            Prim::HCyl { px, py, pz, .. } => {
                *px += dx;
                *py += dy;
                *pz += dz;
            }
            Prim::Sphere { cx, cy, cz, .. } | Prim::Torus { cx, cy, cz, .. } => {
                *cx += dx;
                *cy += dy;
                *cz += dz;
            }
        }
        p
    }

    /// The mirror image in the plane axis = c.
    fn mirrored(&self, axis: char, c: f64) -> Prim {
        let m = |v: f64| 2.0 * c - v;
        let mut p = self.clone();
        match (&mut p, axis) {
            (Prim::Box { cx, ang, .. }, 'x') => {
                *cx = m(*cx);
                *ang = -*ang;
            }
            (Prim::Box { cy, ang, .. }, 'y') => {
                *cy = m(*cy);
                *ang = -*ang;
            }
            (Prim::Box { z0, z1, .. }, _) => (*z0, *z1) = (m(*z1), m(*z0)),
            (Prim::VCyl { cx, .. }, 'x') => *cx = m(*cx),
            (Prim::VCyl { cy, .. }, 'y') => *cy = m(*cy),
            (Prim::VCyl { z0, z1, r0, r1, .. }, _) => {
                (*z0, *z1) = (m(*z1), m(*z0));
                std::mem::swap(r0, r1);
            }
            (Prim::HCyl { px, dir, .. }, 'x') => {
                *px = m(*px);
                *dir = PI - *dir;
            }
            (Prim::HCyl { py, dir, .. }, 'y') => {
                *py = m(*py);
                *dir = -*dir;
            }
            (Prim::HCyl { pz, .. }, _) => *pz = m(*pz),
            (Prim::Sphere { cx, .. } | Prim::Torus { cx, .. }, 'x') => *cx = m(*cx),
            (Prim::Sphere { cy, .. } | Prim::Torus { cy, .. }, 'y') => *cy = m(*cy),
            (Prim::Sphere { cz, .. } | Prim::Torus { cz, .. }, _) => *cz = m(*cz),
        }
        p
    }
}

// ───────────────────────── interval Booleans

fn union(a: &Iv, b: &Iv) -> Iv {
    let mut all: Iv = a.iter().chain(b).copied().collect();
    all.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap());
    let mut out: Iv = Vec::new();
    for (s, e) in all {
        match out.last_mut() {
            Some(last) if s <= last.1 => last.1 = last.1.max(e),
            _ => out.push((s, e)),
        }
    }
    out
}

fn subtract(a: &Iv, b: &Iv) -> Iv {
    let mut out = Vec::new();
    for &(s, e) in a {
        let mut pieces = vec![(s, e)];
        for &(bs, be) in b {
            let mut next = Vec::new();
            for (ps, pe) in pieces {
                if be <= ps || bs >= pe {
                    next.push((ps, pe));
                } else {
                    if bs > ps {
                        next.push((ps, bs));
                    }
                    if be < pe {
                        next.push((be, pe));
                    }
                }
            }
            pieces = next;
        }
        out.extend(pieces);
    }
    out
}

fn intersect(a: &Iv, b: &Iv) -> Iv {
    let mut out = Vec::new();
    for &(s, e) in a {
        for &(bs, be) in b {
            let (lo, hi) = (s.max(bs), e.min(be));
            if hi > lo {
                out.push((lo, hi));
            }
        }
    }
    out.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap());
    out
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Op {
    Add,
    Cut,
    Intersect,
}

struct Feature {
    name: String,
    op: Op,
    prims: Vec<Prim>,
}

fn materials(name: &str) -> Option<f64> {
    Some(match name.to_ascii_lowercase().as_str() {
        "steel" => 7850.0,
        "stainless" | "stainless steel" => 8000.0,
        "aluminium" | "aluminum" | "al" => 2700.0,
        "titanium" | "ti" => 4430.0,
        "copper" | "cu" => 8960.0,
        "brass" => 8500.0,
        "cast iron" | "iron" => 7200.0,
        "abs" => 1040.0,
        "pla" => 1240.0,
        "nylon" | "pa" => 1140.0,
        "pom" | "acetal" => 1410.0,
        "wood" => 600.0,
        "water" => 1000.0,
        "concrete" => 2400.0,
        "glass" => 2500.0,
        _ => return None,
    })
}

fn nums(text: &str) -> Result<Vec<f64>, String> {
    text.split_whitespace().map(|w| Expr::with_names(w, &[]).map(|e| e.value(&[])).map_err(|e| format!("\"{w}\": {e}"))).collect()
}

fn solid(text: &str) -> Result<Prim, String> {
    let mut words = text.split_whitespace();
    let kind = words.next().unwrap_or("").to_ascii_lowercase();
    let rest: Vec<&str> = words.collect();
    let axis = rest.first().map(|s| s.to_ascii_lowercase());
    let need = |v: &Vec<f64>, n: usize, form: &str| if v.len() == n { Ok(()) } else { Err(format!("{kind}: {form}")) };
    match kind.as_str() {
        "box" => {
            let v = nums(&rest.join(" "))?;
            need(&v, 6, "box x0 y0 z0 x1 y1 z1")?;
            let (x0, x1) = (v[0].min(v[3]), v[0].max(v[3]));
            let (y0, y1) = (v[1].min(v[4]), v[1].max(v[4]));
            Ok(Prim::Box { cx: (x0 + x1) / 2.0, cy: (y0 + y1) / 2.0, hx: (x1 - x0) / 2.0, hy: (y1 - y0) / 2.0, z0: v[2].min(v[5]), z1: v[2].max(v[5]), ang: 0.0 })
        }
        "cylinder" | "cone" => {
            let v = nums(&rest[1.min(rest.len())..].join(" "))?;
            let cone = kind == "cone";
            let n = if cone { 6 } else { 5 };
            let form = if cone { "cone z|x|y c1 c2 start length r0 r1" } else { "cylinder z|x|y c1 c2 start length r" };
            need(&v, n, form)?;
            let (r0, r1) = if cone { (v[4], v[5]) } else { (v[4], v[4]) };
            if r0 < 0.0 || r1 < 0.0 || r0.max(r1) <= 0.0 || v[3] == 0.0 {
                return Err(format!("{kind}: radius and length must be positive"));
            }
            // A negative length runs the other way.
            let (start, len, r0, r1) = if v[3] < 0.0 { (v[2] + v[3], -v[3], r1, r0) } else { (v[2], v[3], r0, r1) };
            match axis.as_deref() {
                Some("z") => Ok(Prim::VCyl { cx: v[0], cy: v[1], z0: start, z1: start + len, r0, r1 }),
                Some("x") => Ok(Prim::HCyl { px: start, py: v[0], pz: v[1], dir: 0.0, len, r0, r1 }),
                Some("y") => Ok(Prim::HCyl { px: v[0], py: start, pz: v[1], dir: PI / 2.0, len, r0, r1 }),
                _ => Err(format!("{kind}: the axis is z, x or y ({form})")),
            }
        }
        "sphere" => {
            let v = nums(&rest.join(" "))?;
            need(&v, 4, "sphere cx cy cz r")?;
            Ok(Prim::Sphere { cx: v[0], cy: v[1], cz: v[2], r: v[3] })
        }
        "torus" => {
            let v = nums(&rest.join(" "))?;
            need(&v, 5, "torus cx cy cz R r")?;
            if v[4] > v[3] {
                return Err("torus: r must not exceed R".into());
            }
            Ok(Prim::Torus { cx: v[0], cy: v[1], cz: v[2], big: v[3], small: v[4] })
        }
        _ => Err(format!("unknown solid \"{kind}\" (box, cylinder, cone, sphere, torus)")),
    }
}

/// A feature line: "<op> [name]: <solid>, options".
fn feature(head: &str, body: &str) -> Result<Feature, String> {
    let mut hw = head.split_whitespace();
    let op_word = hw.next().unwrap_or("").to_ascii_lowercase();
    let op = match op_word.as_str() {
        "base" | "add" | "boss" | "extrude" => Op::Add,
        "cut" | "hole" | "pocket" => Op::Cut,
        "intersect" | "common" => Op::Intersect,
        _ => return Err(format!("unknown feature \"{op_word}\" (base, add, cut, intersect)")),
    };
    let name = hw.collect::<Vec<_>>().join(" ");
    let mut parts = body.split(',');
    let mut prim = solid(parts.next().unwrap_or("").trim())?;
    let mut opts: Vec<(String, String)> = Vec::new();
    for item in parts.flat_map(|p| p.split(';')) {
        let item = item.trim();
        if item.is_empty() {
            continue;
        }
        let (k, v) = item.split_once('=').ok_or_else(|| format!("\"{item}\" is not key = value"))?;
        opts.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
    }
    let get = |k: &str| opts.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone());
    let num = |k: &str, d: f64| -> Result<f64, String> {
        match get(k) {
            Some(v) => nums(&v).and_then(|n| n.first().copied().ok_or_else(|| format!("{k}: no value"))),
            None => Ok(d),
        }
    };
    if let Some(a) = get("angle") {
        let a = nums(&a)?[0].to_radians();
        let b = prim.bounds();
        prim = prim.rotated((b[0] + b[3]) / 2.0, (b[1] + b[4]) / 2.0, a);
    }
    let mut prims = vec![prim];
    // Linear patterns (two directions), circular pattern about a z axis, mirror.
    for (rk, xk, yk, zk) in [("repeat", "dx", "dy", "dz"), ("repeat2", "dx2", "dy2", "dz2")] {
        let n = num(rk, 1.0)?.round() as usize;
        if n > 1 {
            let (dx, dy, dz) = (num(xk, 0.0)?, num(yk, 0.0)?, num(zk, 0.0)?);
            let base = prims.clone();
            for k in 1..n.min(500) {
                prims.extend(base.iter().map(|p| p.moved(dx * k as f64, dy * k as f64, dz * k as f64)));
            }
        }
    }
    if let Some(around) = get("around") {
        let c = nums(&around)?;
        if c.len() != 2 {
            return Err("around = cx cy (a z axis)".into());
        }
        let n = num("count", 6.0)?.round().max(1.0) as usize;
        let total = num("sweep", 360.0)?.to_radians();
        let step = if (total - 2.0 * PI).abs() < 1e-9 { total / n as f64 } else { total / (n.max(2) - 1) as f64 };
        let base = prims.clone();
        for k in 1..n.min(500) {
            prims.extend(base.iter().map(|p| p.rotated(c[0], c[1], step * k as f64)));
        }
    }
    if let Some(m) = get("mirror") {
        let mut w = m.split_whitespace();
        let axis = w.next().unwrap_or("").chars().next().unwrap_or(' ').to_ascii_lowercase();
        let c = nums(&w.collect::<Vec<_>>().join(" "))?;
        if !"xyz".contains(axis) || c.len() != 1 {
            return Err("mirror = x|y|z position".into());
        }
        let base = prims.clone();
        prims.extend(base.iter().map(|p| p.mirrored(axis, c[0])));
    }
    let known = ["angle", "repeat", "dx", "dy", "dz", "repeat2", "dx2", "dy2", "dz2", "around", "count", "sweep", "mirror"];
    if let Some((k, _)) = opts.iter().find(|(k, _)| !known.contains(&k.as_str())) {
        return Err(format!("unknown option \"{k}\""));
    }
    Ok(Feature { name, op, prims })
}

/// Mass properties accumulated from columns of material.
#[derive(Default, Clone, Copy)]
struct Moments {
    v: f64,
    mx: f64,
    my: f64,
    mz: f64,
    xx: f64,
    yy: f64,
    zz: f64,
    xy: f64,
    xz: f64,
    yz: f64,
}

impl Moments {
    /// A column of material over a cell hx × hy centred at (x, y) (the cell's own x², y² spread included).
    fn add_column(&mut self, x: f64, y: f64, hx: f64, hy: f64, iv: &Iv) {
        let da = hx * hy;
        for &(a, b) in iv {
            let l = b - a;
            let z1 = (b * b - a * a) / 2.0;
            let z2 = (b * b * b - a * a * a) / 3.0;
            self.v += l * da;
            self.mx += x * l * da;
            self.my += y * l * da;
            self.mz += z1 * da;
            self.xx += (x * x + hx * hx / 12.0) * l * da;
            self.yy += (y * y + hy * hy / 12.0) * l * da;
            self.zz += z2 * da;
            self.xy += x * y * l * da;
            self.xz += x * z1 * da;
            self.yz += y * z1 * da;
        }
    }

    /// (volume, centroid, inertia tensor about the centroid per unit density).
    fn about_centroid(&self) -> (f64, [f64; 3], [[f64; 3]; 3]) {
        let v = self.v;
        let c = [self.mx / v, self.my / v, self.mz / v];
        // Second moments about the centroid.
        let sxx = self.xx - v * c[0] * c[0];
        let syy = self.yy - v * c[1] * c[1];
        let szz = self.zz - v * c[2] * c[2];
        let sxy = self.xy - v * c[0] * c[1];
        let sxz = self.xz - v * c[0] * c[2];
        let syz = self.yz - v * c[1] * c[2];
        let i = [[syy + szz, -sxy, -sxz], [-sxy, sxx + szz, -syz], [-sxz, -syz, sxx + syy]];
        (v, c, i)
    }
}

/// Stiffness and conductivity of the named materials: (E Pa, ν, k W/m·K).
fn elastic(name: &str) -> Option<(f64, f64, f64)> {
    Some(match name.to_ascii_lowercase().as_str() {
        "steel" => (200e9, 0.3, 45.0),
        "stainless" | "stainless steel" => (193e9, 0.29, 16.0),
        "aluminium" | "aluminum" | "al" => (69e9, 0.33, 205.0),
        "titanium" | "ti" => (114e9, 0.34, 7.0),
        "copper" | "cu" => (117e9, 0.34, 400.0),
        "brass" => (100e9, 0.34, 110.0),
        "cast iron" | "iron" => (110e9, 0.26, 50.0),
        "abs" => (2.2e9, 0.35, 0.17),
        "pla" => (3.5e9, 0.36, 0.13),
        "nylon" | "pa" => (2.7e9, 0.4, 0.25),
        "pom" | "acetal" => (3.1e9, 0.35, 0.31),
        "wood" => (11e9, 0.3, 0.12),
        "concrete" => (30e9, 0.2, 1.7),
        "glass" => (70e9, 0.22, 1.0),
        "water" => (0.0, 0.5, 0.6),
        _ => return None,
    })
}

/// A part: its features, material and units (shared by the CAD node and 3D finite elements).
pub struct Geometry {
    pub density: f64,
    /// Young's modulus, Poisson's ratio and thermal conductivity of the material.
    pub e: f64,
    pub nu: f64,
    pub k: f64,
    /// Metres per geometry unit.
    pub scale: f64,
    pub unit: String,
    feats: Vec<Feature>,
}

impl Geometry {
    /// Reads units, material and feature lines; `extra` sees every other "key: body" line first
    /// (it returns true when it took the line).
    pub fn parse(text: &str, extra: &mut dyn FnMut(&str, &str) -> Result<bool, String>) -> Result<Geometry, String> {
        let mut g = Geometry { density: 7850.0, e: 200e9, nu: 0.3, k: 45.0, scale: 1e-3, unit: "mm".into(), feats: Vec::new() };
        for (no, raw) in text.lines().enumerate() {
            let line = raw.split('#').next().unwrap().trim();
            if line.is_empty() {
                continue;
            }
            let err = |e: String| format!("line {}: {e}", no + 1);
            let (head, body) = line.split_once(':').ok_or_else(|| err("expected \"feature name: solid\"".into()))?;
            let key = head.trim().to_ascii_lowercase();
            match key.as_str() {
                "units" | "unit" => {
                    g.unit = body.trim().to_ascii_lowercase();
                    g.scale = match g.unit.as_str() {
                        "mm" => 1e-3,
                        "cm" => 1e-2,
                        "m" => 1.0,
                        "in" | "inch" => 0.0254,
                        _ => return Err(err("units are mm, cm, m or in".into())),
                    };
                }
                "material" => {
                    let b = body.trim();
                    if b.contains('=') {
                        // material: density = 2700, E = 69e9, nu = 0.33, k = 205
                        for item in b.split(',') {
                            let (k, v) = item.split_once('=').ok_or_else(|| err(format!("\"{item}\" is not key = value")))?;
                            let v = nums(v.trim()).map_err(err)?[0];
                            match k.trim().to_ascii_lowercase().as_str() {
                                "density" | "rho" => g.density = v,
                                "e" => g.e = v,
                                "nu" => g.nu = v,
                                "k" => g.k = v,
                                other => return Err(err(format!("unknown material property \"{other}\" (density, E, nu, k)"))),
                            }
                        }
                    } else {
                        g.density = materials(b).ok_or_else(|| err(format!("unknown material \"{b}\" (or density = kg/m³, E = Pa, nu = , k = W/m·K)")))?;
                        if let Some((e, nu, k)) = elastic(b) {
                            g.e = e;
                            g.nu = nu;
                            g.k = k;
                        }
                    }
                }
                _ => {
                    if !extra(&key, body).map_err(err)? {
                        g.feats.push(feature(head, body).map_err(err)?);
                    }
                }
            }
        }
        Ok(g)
    }

    pub fn is_empty(&self) -> bool {
        self.feats.is_empty()
    }

    /// The bounding box of everything added (geometry units).
    pub fn bounds(&self) -> Result<[f64; 6], String> {
        if self.feats.is_empty() {
            return Err("the part has no features (base plate: box 0 0 0 100 60 10)".into());
        }
        if self.feats[0].op != Op::Add {
            return Err("the first feature must add material (base …)".into());
        }
        let mut b = [f64::INFINITY, f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
        for f in self.feats.iter().filter(|f| f.op == Op::Add) {
            for p in &f.prims {
                let q = p.bounds();
                for k in 0..3 {
                    b[k] = b[k].min(q[k]);
                    b[k + 3] = b[k + 3].max(q[k + 3]);
                }
            }
        }
        Ok(b)
    }

    /// The z-intervals of material on the vertical line through (x, y).
    pub fn column(&self, x: f64, y: f64) -> Vec<(f64, f64)> {
        let mut cur: Iv = Vec::new();
        for f in &self.feats {
            let mut sol: Iv = Vec::new();
            for p in &f.prims {
                let r = p.ray(x, y);
                if !r.is_empty() {
                    sol = union(&sol, &r);
                }
            }
            cur = match f.op {
                Op::Add => union(&cur, &sol),
                Op::Cut => subtract(&cur, &sol),
                Op::Intersect => intersect(&cur, &sol),
            };
        }
        cur
    }
}

pub fn part(ctx: &mut Ctx) -> Result<Dataset, String> {
    let g = Geometry::parse(&ctx.str("part", ""), &mut |_, _| Ok(false))?;
    let (density, scale, unit, feats) = (g.density, g.scale, g.unit.clone(), g.feats);
    let mut d = Dataset::default();
    // An imported mesh on the input: exact mass properties by the divergence theorem.
    if let Some(input) = ctx.input("in") {
        let table = input.pick_table(&ctx.str("table", ""))?.clone();
        return mesh_properties(ctx, &table, density, scale, &unit, d);
    }
    if feats.is_empty() {
        return Err("the part has no features (base plate: box 0 0 0 100 60 10)".into());
    }
    if feats[0].op != Op::Add {
        return Err("the first feature must add material (base …)".into());
    }
    // The region to sample: everything added.
    let mut b = [f64::INFINITY, f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    for f in feats.iter().filter(|f| f.op == Op::Add) {
        for p in &f.prims {
            let q = p.bounds();
            for k in 0..3 {
                b[k] = b[k].min(q[k]);
                b[k + 3] = b[k + 3].max(q[k + 3]);
            }
        }
    }
    let n = ctx.count("resolution", 300, 20, 2000)?;
    let (w, h) = (b[3] - b[0], b[4] - b[1]);
    let (nx, ny) = if w >= h { (n, ((n as f64 * h / w).ceil() as usize).max(4)) } else { (((n as f64 * w / h).ceil() as usize).max(4), n) };
    let (hx, hy) = (w / nx as f64, h / ny as f64);
    let da = hx * hy;
    let mut total = Moments::default();
    let mut per_feature = vec![Moments::default(); feats.len()];
    let mut thick = vec![f64::NAN; nx * ny];
    let mut top = vec![f64::NAN; nx * ny];
    let mut columns: Vec<Iv> = vec![Vec::new(); nx * ny];
    for j in 0..ny {
        let y = b[1] + (j as f64 + 0.5) * hy;
        for i in 0..nx {
            let x = b[0] + (i as f64 + 0.5) * hx;
            let mut cur: Iv = Vec::new();
            for (k, f) in feats.iter().enumerate() {
                let mut sol: Iv = Vec::new();
                for p in &f.prims {
                    let r = p.ray(x, y);
                    if !r.is_empty() {
                        sol = union(&sol, &r);
                    }
                }
                cur = match f.op {
                    Op::Add => union(&cur, &sol),
                    Op::Cut => subtract(&cur, &sol),
                    Op::Intersect => intersect(&cur, &sol),
                };
                per_feature[k].add_column(x, y, hx, hy, &cur);
            }
            total.add_column(x, y, hx, hy, &cur);
            if !cur.is_empty() {
                thick[j * nx + i] = cur.iter().map(|(a, b)| b - a).sum();
                top[j * nx + i] = cur.last().unwrap().1;
            }
            columns[j * nx + i] = cur;
        }
        if j % 50 == 0 {
            ctx.check()?;
            ctx.report(j as f64 / ny as f64, "integrating");
        }
    }
    if total.v <= 0.0 {
        return Err("the part has no material left".into());
    }
    report(&mut d, total, density, scale, &unit, b);
    let projected = thick.iter().filter(|v| v.is_finite()).count() as f64 * da;
    d.scalar("projected area (top)", projected * scale * scale * 1e4, "cm²");
    // The feature tree with the volume after each step.
    let mut ft = Table::new("features");
    ft.push(Column::text("feature", feats.iter().enumerate().map(|(k, f)| if f.name.is_empty() { format!("{} {}", op_name(f.op), k + 1) } else { f.name.clone() }).collect()));
    ft.push(Column::text("operation", feats.iter().map(|f| op_name(f.op).to_string()).collect()));
    ft.push(Column::new("solids", "", feats.iter().map(|f| f.prims.len() as f64).collect()));
    let vol_unit = format!("{unit}³");
    let after: Vec<f64> = per_feature.iter().map(|m| m.v).collect();
    ft.push(Column::new("volume after", &vol_unit, after.clone()));
    ft.push(Column::new("change", &vol_unit, after.iter().enumerate().map(|(k, v)| if k == 0 { *v } else { v - after[k - 1] }).collect()));
    ft.push(Column::new("mass after", "kg", after.iter().map(|v| v * scale.powi(3) * density).collect()));
    d.tables.push(ft);
    // Surface points for the 3D view: voxels with material next to empty ones.
    let target = ctx.count("points", 30000, 1000, 500_000)?;
    let zn = 120usize;
    let hz = (b[5] - b[2]) / zn as f64;
    let inside = |i: isize, j: isize, k: isize| -> bool {
        if i < 0 || j < 0 || k < 0 || i >= nx as isize || j >= ny as isize || k >= zn as isize {
            return false;
        }
        let z = b[2] + (k as f64 + 0.5) * hz;
        columns[j as usize * nx + i as usize].iter().any(|(a, c)| z >= *a && z <= *c)
    };
    let mut pts: Vec<[f64; 3]> = Vec::new();
    let stride = ((nx * ny) as f64 / 40000.0).sqrt().ceil().max(1.0) as isize;
    let mut j = 0isize;
    while j < ny as isize {
        let mut i = 0isize;
        while i < nx as isize {
            for k in 0..zn as isize {
                if inside(i, j, k) && [(stride, 0, 0), (-stride, 0, 0), (0, stride, 0), (0, -stride, 0), (0, 0, 1), (0, 0, -1)].iter().any(|(a, bb, c)| !inside(i + a, j + bb, k + c)) {
                    pts.push([b[0] + (i as f64 + 0.5) * hx, b[1] + (j as f64 + 0.5) * hy, b[2] + (k as f64 + 0.5) * hz]);
                }
            }
            i += stride;
        }
        j += stride;
    }
    let keep = (pts.len() as f64 / target as f64).ceil().max(1.0) as usize;
    let pts: Vec<[f64; 3]> = pts.into_iter().step_by(keep).collect();
    let mut cloud = Table::new("surface points");
    for (k, name) in ["x", "y", "z"].iter().enumerate() {
        cloud.push(Column::new(name, &unit, pts.iter().map(|p| p[k]).collect()));
    }
    // The cloud first: the 3D view shows a node's first table.
    d.tables.insert(0, cloud);
    let xs: Vec<f64> = (0..nx).map(|i| b[0] + (i as f64 + 0.5) * hx).collect();
    let ys: Vec<f64> = (0..ny).map(|j| b[1] + (j as f64 + 0.5) * hy).collect();
    d.grids.push(Grid { name: "thickness".into(), x: xs.clone(), y: ys.clone(), z: thick, x_label: format!("x ({unit})"), y_label: format!("y ({unit})"), z_label: format!("thickness ({unit})"), x_names: None, y_names: None });
    d.grids.push(Grid { name: "top height".into(), x: xs, y: ys, z: top, x_label: format!("x ({unit})"), y_label: format!("y ({unit})"), z_label: format!("z ({unit})"), x_names: None, y_names: None });
    Ok(d)
}

fn op_name(op: Op) -> &'static str {
    match op {
        Op::Add => "add",
        Op::Cut => "cut",
        Op::Intersect => "intersect",
    }
}

/// Volume, mass, centre of gravity, inertia about it and principal moments as results.
fn report(d: &mut Dataset, m: Moments, density: f64, scale: f64, unit: &str, b: [f64; 6]) {
    let (v, c, i) = m.about_centroid();
    let mass = v * scale.powi(3) * density;
    let k = density * scale.powi(5); // per unit density, length⁵ → kg·m²
    d.scalar("volume", v, &format!("{unit}³"));
    d.scalar("volume (cm³)", v * scale.powi(3) * 1e6, "cm³");
    d.scalar("mass", mass, "kg");
    d.scalar("density", density, "kg/m³");
    for (n, val) in ["x", "y", "z"].iter().zip(c) {
        d.scalar(&format!("centre of gravity {n}"), val, unit);
    }
    let names = [["Ixx", "Ixy", "Ixz"], ["Ixy", "Iyy", "Iyz"], ["Ixz", "Iyz", "Izz"]];
    for (r, cidx) in [(0, 0), (1, 1), (2, 2), (0, 1), (0, 2), (1, 2)] {
        d.scalar(names[r][cidx], i[r][cidx] * k, "kg·m²");
    }
    let (ev, _) = sym_eigen(&i.iter().map(|r| r.to_vec()).collect());
    let mut ev: Vec<f64> = ev.iter().map(|e| e * k).collect();
    ev.sort_by(|a, b| a.partial_cmp(b).unwrap());
    for (n, e) in ["I1", "I2", "I3"].iter().zip(&ev) {
        d.scalar(&format!("principal {n}"), *e, "kg·m²");
    }
    for (n, k) in [("size x", 0), ("size y", 1), ("size z", 2)] {
        if b[k].is_finite() {
            d.scalar(n, b[k + 3] - b[k], unit);
        }
    }
    let mut t = Table::new("inertia tensor");
    t.push(Column::text("axis", vec!["x".into(), "y".into(), "z".into()]));
    for (cidx, n) in ["x", "y", "z"].iter().enumerate() {
        t.push(Column::new(n, "kg·m²", (0..3).map(|r| i[r][cidx] * k).collect()));
    }
    d.tables.push(t);
}

/// Exact mass properties of a closed triangle mesh (Eberly's polyhedral integrals).
fn mesh_properties(ctx: &mut Ctx, table: &Table, density: f64, scale: f64, unit: &str, mut d: Dataset) -> Result<Dataset, String> {
    let names = ["x1", "y1", "z1", "x2", "y2", "z2", "x3", "y3", "z3"];
    let cols: Vec<&Vec<f64>> = names.iter().map(|n| table.column(n).map(|c| &c.values)).collect::<Result<_, _>>().map_err(|_| "the input is not a triangle table (x1 y1 z1 x2 … z3; read an STL file)".to_string())?;
    let nt = cols[0].len();
    let sub = |w0: f64, w1: f64, w2: f64| {
        let t0 = w0 + w1;
        let f1 = t0 + w2;
        let t1 = w0 * w0;
        let t2 = t1 + w1 * t0;
        let f2 = t2 + w2 * f1;
        let f3 = w0 * t1 + w1 * t2 + w2 * f2;
        (f1, f2, f3, f2 + w0 * (f1 + w0), f2 + w1 * (f1 + w1), f2 + w2 * (f1 + w2))
    };
    let mut s = [0.0f64; 10];
    let mut area = 0.0;
    let mut b = [f64::INFINITY, f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    for t in 0..nt {
        let p: Vec<f64> = (0..9).map(|k| cols[k][t]).collect();
        let (x0, y0, z0, x1, y1, z1, x2, y2, z2) = (p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]);
        for (k, v) in [x0, y0, z0, x1, y1, z1, x2, y2, z2].iter().enumerate() {
            b[k % 3] = b[k % 3].min(*v);
            b[k % 3 + 3] = b[k % 3 + 3].max(*v);
        }
        let (a1, b1, c1) = (x1 - x0, y1 - y0, z1 - z0);
        let (a2, b2, c2) = (x2 - x0, y2 - y0, z2 - z0);
        let (d0, d1, d2) = (b1 * c2 - b2 * c1, a2 * c1 - a1 * c2, a1 * b2 - a2 * b1);
        area += 0.5 * (d0 * d0 + d1 * d1 + d2 * d2).sqrt();
        let (f1x, f2x, f3x, g0x, g1x, g2x) = sub(x0, x1, x2);
        let (_, f2y, f3y, g0y, g1y, g2y) = sub(y0, y1, y2);
        let (_, f2z, f3z, g0z, g1z, g2z) = sub(z0, z1, z2);
        s[0] += d0 * f1x;
        s[1] += d0 * f2x;
        s[2] += d1 * f2y;
        s[3] += d2 * f2z;
        s[4] += d0 * f3x;
        s[5] += d1 * f3y;
        s[6] += d2 * f3z;
        s[7] += d0 * (y0 * g0x + y1 * g1x + y2 * g2x);
        s[8] += d1 * (z0 * g0y + z1 * g1y + z2 * g2y);
        s[9] += d2 * (x0 * g0z + x1 * g1z + x2 * g2z);
        if t % 50_000 == 0 {
            ctx.check()?;
        }
    }
    let mult = [1.0 / 6.0, 1.0 / 24.0, 1.0 / 24.0, 1.0 / 24.0, 1.0 / 60.0, 1.0 / 60.0, 1.0 / 60.0, 1.0 / 120.0, 1.0 / 120.0, 1.0 / 120.0];
    for k in 0..10 {
        s[k] *= mult[k];
    }
    let mut v = s[0];
    if v.abs() < 1e-300 {
        return Err("the mesh encloses no volume (is it closed?)".into());
    }
    if v < 0.0 {
        // Inward-facing normals: flip every integral.
        for x in s.iter_mut() {
            *x = -*x;
        }
        v = -v;
        ctx.warn("the mesh normals point inwards; the signs were flipped");
    }
    // In the Moments form: first moments, ∫x², ∫y², ∫z², ∫xy, ∫yz, ∫zx.
    let m = Moments { v, mx: s[1], my: s[2], mz: s[3], xx: s[4], yy: s[5], zz: s[6], xy: s[7], xz: s[9], yz: s[8] };
    report(&mut d, m, density, scale, unit, b);
    d.scalar("surface area", area * scale * scale * 1e4, "cm²");
    d.scalar("triangles", nt as f64, "");
    Ok(d)
}
