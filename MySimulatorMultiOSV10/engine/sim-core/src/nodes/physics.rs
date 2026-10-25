//! 3D rigid-body physics (the engine behind Gazebo, Webots or a game engine):
//! spheres, boxes and capsules under gravity, contacts with friction and
//! restitution, ball, hinge (with a motor) and distance joints, springs and
//! forces. Semi-implicit Euler with a sequential-impulse (projected Gauss–Seidel)
//! solver and Baumgarte position correction; z is up.
//!
//! ```text
//! gravity: 0 0 -9.81
//! ground: friction = 0.6, restitution = 0.3
//! body ball: sphere r = 0.1, mass = 1, pos = 0 0 2, vel = 1 0 0, restitution = 0.8
//! body crate: box size = 0.4 0.3 0.2, mass = 2, pos = 1 0 0.1, rot = 0 0 30
//! body rod: capsule r = 0.05, length = 0.6, mass = 0.5, pos = 0 1 1
//! static wall: box size = 0.1 4 1, pos = 3 0 0.5
//! joint j1: ball a = rod, b = world, at = 0 1 1.3
//! joint h1: hinge a = wheel, b = world, at = 0 0 1, axis = 0 1 0, motor = 2*pi, torque = 5
//! joint r1: distance a = ball, b = crate, length = 1
//! spring s1: a = crate, b = world, at = 1 0 0.2, to = 1 0 2, k = 50, c = 1, rest = 1
//! force f1: body = crate, f = 0 0 if(t < 1, 30, 0)
//! ```

use crate::data::{Column, Dataset, Table};
use crate::expr::Expr;
use crate::Ctx;
use std::f64::consts::PI;

// ───────────────────────── small vector algebra

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V3(pub f64, pub f64, pub f64);

impl V3 {
    fn dot(self, o: V3) -> f64 {
        self.0 * o.0 + self.1 * o.1 + self.2 * o.2
    }
    fn cross(self, o: V3) -> V3 {
        V3(self.1 * o.2 - self.2 * o.1, self.2 * o.0 - self.0 * o.2, self.0 * o.1 - self.1 * o.0)
    }
    fn len(self) -> f64 {
        self.dot(self).sqrt()
    }
    fn norm(self) -> V3 {
        let l = self.len();
        if l > 1e-15 {
            self * (1.0 / l)
        } else {
            V3(0.0, 0.0, 1.0)
        }
    }
    fn get(self, i: usize) -> f64 {
        [self.0, self.1, self.2][i]
    }
    /// Two unit vectors perpendicular to this (unit) vector and to each other.
    fn basis(self) -> (V3, V3) {
        let t = if self.0.abs() < 0.57 { V3(1.0, 0.0, 0.0) } else { V3(0.0, 1.0, 0.0) };
        let a = self.cross(t).norm();
        (a, self.cross(a))
    }
}

impl std::ops::Add for V3 {
    type Output = V3;
    fn add(self, o: V3) -> V3 {
        V3(self.0 + o.0, self.1 + o.1, self.2 + o.2)
    }
}
impl std::ops::Sub for V3 {
    type Output = V3;
    fn sub(self, o: V3) -> V3 {
        V3(self.0 - o.0, self.1 - o.1, self.2 - o.2)
    }
}
impl std::ops::Mul<f64> for V3 {
    type Output = V3;
    fn mul(self, k: f64) -> V3 {
        V3(self.0 * k, self.1 * k, self.2 * k)
    }
}
impl std::ops::Neg for V3 {
    type Output = V3;
    fn neg(self) -> V3 {
        V3(-self.0, -self.1, -self.2)
    }
}

/// A 3 × 3 matrix by rows.
#[derive(Clone, Copy, Debug)]
struct M3([[f64; 3]; 3]);

impl M3 {
    fn zero() -> M3 {
        M3([[0.0; 3]; 3])
    }
    fn diag(v: V3) -> M3 {
        M3([[v.0, 0.0, 0.0], [0.0, v.1, 0.0], [0.0, 0.0, v.2]])
    }
    fn mul(&self, v: V3) -> V3 {
        let m = &self.0;
        V3(m[0][0] * v.0 + m[0][1] * v.1 + m[0][2] * v.2, m[1][0] * v.0 + m[1][1] * v.1 + m[1][2] * v.2, m[2][0] * v.0 + m[2][1] * v.1 + m[2][2] * v.2)
    }
    fn mm(&self, o: &M3) -> M3 {
        let mut r = [[0.0; 3]; 3];
        for (i, row) in r.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell = (0..3).map(|k| self.0[i][k] * o.0[k][j]).sum();
            }
        }
        M3(r)
    }
    fn t(&self) -> M3 {
        let m = &self.0;
        M3([[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]])
    }
    fn add(&self, o: &M3) -> M3 {
        let mut r = self.0;
        for i in 0..3 {
            for j in 0..3 {
                r[i][j] += o.0[i][j];
            }
        }
        M3(r)
    }
    /// [v]× (so [v]× w = v × w).
    fn skew(v: V3) -> M3 {
        M3([[0.0, -v.2, v.1], [v.2, 0.0, -v.0], [-v.1, v.0, 0.0]])
    }
    fn inverse(&self) -> Option<M3> {
        let m = &self.0;
        let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        if det.abs() < 1e-300 {
            return None;
        }
        let c = |a: usize, b: usize, c: usize, d: usize| m[a][b] * m[c][d] - m[a][d] * m[c][b];
        let inv = [
            [c(1, 1, 2, 2), -c(0, 1, 2, 2), c(0, 1, 1, 2)],
            [-c(1, 0, 2, 2), c(0, 0, 2, 2), -c(0, 0, 1, 2)],
            [c(1, 0, 2, 1), -c(0, 0, 2, 1), c(0, 0, 1, 1)],
        ];
        Some(M3(inv.map(|r| r.map(|v| v / det))))
    }
}

#[derive(Clone, Copy, Debug)]
struct Quat(f64, f64, f64, f64); // w, x, y, z

impl Quat {
    fn from_euler_deg(rx: f64, ry: f64, rz: f64) -> Quat {
        // Rotations about x, then y, then z (fixed axes): q = qz · qy · qx.
        let (hx, hy, hz) = (rx.to_radians() / 2.0, ry.to_radians() / 2.0, rz.to_radians() / 2.0);
        let qx = Quat(hx.cos(), hx.sin(), 0.0, 0.0);
        let qy = Quat(hy.cos(), 0.0, hy.sin(), 0.0);
        let qz = Quat(hz.cos(), 0.0, 0.0, hz.sin());
        qz.mul(qy).mul(qx)
    }
    fn mul(self, o: Quat) -> Quat {
        let (a, b) = (self, o);
        Quat(
            a.0 * b.0 - a.1 * b.1 - a.2 * b.2 - a.3 * b.3,
            a.0 * b.1 + a.1 * b.0 + a.2 * b.3 - a.3 * b.2,
            a.0 * b.2 - a.1 * b.3 + a.2 * b.0 + a.3 * b.1,
            a.0 * b.3 + a.1 * b.2 - a.2 * b.1 + a.3 * b.0,
        )
    }
    fn norm(self) -> Quat {
        let l = (self.0 * self.0 + self.1 * self.1 + self.2 * self.2 + self.3 * self.3).sqrt();
        Quat(self.0 / l, self.1 / l, self.2 / l, self.3 / l)
    }
    fn mat(self) -> M3 {
        let Quat(w, x, y, z) = self;
        M3([
            [1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y - w * z), 2.0 * (x * z + w * y)],
            [2.0 * (x * y + w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z - w * x)],
            [2.0 * (x * z - w * y), 2.0 * (y * z + w * x), 1.0 - 2.0 * (x * x + y * y)],
        ])
    }
    /// q advanced by angular velocity w over dt.
    fn integrate(self, w: V3, dt: f64) -> Quat {
        let dq = Quat(0.0, w.0, w.1, w.2).mul(self);
        Quat(self.0 + 0.5 * dt * dq.0, self.1 + 0.5 * dt * dq.1, self.2 + 0.5 * dt * dq.2, self.3 + 0.5 * dt * dq.3).norm()
    }
}

// ───────────────────────── bodies, contacts, joints

#[derive(Clone, Debug)]
enum Shape {
    Sphere(f64),
    /// Half extents.
    Box(V3),
    /// Radius and half length along the body's z axis.
    Capsule(f64, f64),
}

#[derive(Clone, Debug)]
struct Body {
    name: String,
    shape: Shape,
    color: String,
    x: V3,
    q: Quat,
    v: V3,
    w: V3,
    inv_m: f64,
    m: f64,
    /// Inertia in the body frame (diagonal) and its inverse.
    i_body: V3,
    inv_i_body: V3,
    friction: f64,
    restitution: f64,
    damping: f64,
    // Per step: world inverse inertia, accumulated force and torque.
    inv_i: M3,
    f: V3,
    tau: V3,
}

impl Body {
    fn update_inertia(&mut self) {
        let r = self.q.mat();
        self.inv_i = if self.inv_m == 0.0 { M3::zero() } else { r.mm(&M3::diag(self.inv_i_body)).mm(&r.t()) };
    }
    fn vel_at(&self, p: V3) -> V3 {
        self.v + self.w.cross(p - self.x)
    }
    fn to_world(&self, local: V3) -> V3 {
        self.x + self.q.mat().mul(local)
    }
    fn to_local(&self, p: V3) -> V3 {
        self.q.mat().t().mul(p - self.x)
    }
}

/// Body index, or None for the world (static, immovable).
type Id = Option<usize>;

#[derive(Clone, Debug)]
struct Contact {
    a: usize,
    b: Id,
    p: V3,
    /// From b towards a (pushes a).
    n: V3,
    depth: f64,
    friction: f64,
    restitution: f64,
    // Solver state.
    ln: f64,
    lt: [f64; 2],
    bounce: f64,
}

#[derive(Clone, Debug)]
enum JointKind {
    Ball,
    /// Axis in each body's frame, a perpendicular reference in each (for the angle), motor speed (rad/s) and torque limit.
    Hinge { axis_a: V3, axis_b: V3, ref_a: V3, ref_b: V3, motor: Option<Expr>, torque: f64 },
    Distance { length: f64 },
}

#[derive(Clone, Debug)]
struct Joint {
    name: String,
    a: usize,
    b: Id,
    /// Anchors in each body's frame (world coordinates when b is the world).
    la: V3,
    lb: V3,
    kind: JointKind,
    // Accumulated impulse of the motor row (for the torque output).
    motor_impulse: f64,
}

#[derive(Clone, Debug)]
struct Spring {
    a: usize,
    b: Id,
    la: V3,
    lb: V3,
    k: f64,
    c: f64,
    rest: f64,
}

struct Force {
    body: usize,
    f: [Expr; 3],
    /// Point of application in the body frame (centre when zero).
    at: V3,
}

struct World {
    bodies: Vec<Body>,
    ground: Option<(f64, f64, f64)>, // height, friction, restitution
    gravity: V3,
    joints: Vec<Joint>,
    springs: Vec<Spring>,
    forces: Vec<Force>,
}

// ───────────────────────── parsing

fn eval(text: &str) -> Result<f64, String> {
    Expr::with_names(text.trim(), &[]).map(|e| e.value(&[])).map_err(|e| format!("\"{}\": {e}", text.trim()))
}

fn vec3(text: &str) -> Result<V3, String> {
    let v: Vec<f64> = text.split_whitespace().map(eval).collect::<Result<_, _>>()?;
    match v.len() {
        3 => Ok(V3(v[0], v[1], v[2])),
        _ => Err(format!("\"{text}\": three numbers (x y z)")),
    }
}

/// "kind words, key = value, …" → (first words, pairs).
fn fields(text: &str) -> Result<(Vec<String>, Vec<(String, String)>), String> {
    let mut words = Vec::new();
    let mut pairs = Vec::new();
    // Commas inside brackets belong to an expression: min(t, 1).
    let mut items = Vec::new();
    let mut depth = 0i32;
    let mut cur = String::new();
    for c in text.chars() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                items.push(std::mem::take(&mut cur));
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    items.push(cur);
    for item in items.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if let Some((k, v)) = item.split_once('=') {
            let k = k.trim();
            // "sphere r = 0.1": leading words before the key.
            let mut parts: Vec<&str> = k.split_whitespace().collect();
            let key = parts.pop().unwrap_or("").to_ascii_lowercase();
            words.extend(parts.iter().map(|s| s.to_ascii_lowercase()));
            pairs.push((key, v.trim().to_string()));
        } else {
            words.extend(item.split_whitespace().map(|s| s.to_ascii_lowercase()));
        }
    }
    Ok((words, pairs))
}

fn colour(name: &str, k: usize) -> String {
    const PALETTE: [&str; 8] = ["#539bf5", "#e5534b", "#57ab5a", "#c69026", "#986ee2", "#39c5cf", "#e275ad", "#d4a72c"];
    let named = match name {
        "red" => "#e5534b",
        "green" => "#57ab5a",
        "blue" => "#539bf5",
        "yellow" => "#d4a72c",
        "orange" => "#e0823d",
        "purple" => "#986ee2",
        "grey" | "gray" => "#8b949e",
        "white" => "#e6edf3",
        "black" => "#2d333b",
        _ => "",
    };
    if !named.is_empty() {
        named.to_string()
    } else if name.starts_with('#') {
        name.to_string()
    } else {
        PALETTE[k % PALETTE.len()].to_string()
    }
}

fn parse(text: &str) -> Result<World, String> {
    let mut w = World { bodies: Vec::new(), ground: None, gravity: V3(0.0, 0.0, -9.81), joints: Vec::new(), springs: Vec::new(), forces: Vec::new() };
    let mut pending: Vec<(usize, String, String, String)> = Vec::new(); // (line, kind, name, body)
    for (no, raw) in text.lines().enumerate() {
        let line = raw.split('#').next().unwrap().trim();
        if line.is_empty() {
            continue;
        }
        let err = |e: String| format!("line {}: {e}", no + 1);
        let (head, body) = line.split_once(':').ok_or_else(|| err("expected \"kind name: …\"".into()))?;
        let mut hw = head.split_whitespace();
        let kind = hw.next().unwrap_or("").to_ascii_lowercase();
        let name = hw.next().unwrap_or("").to_string();
        match kind.as_str() {
            "gravity" => w.gravity = vec3(body).map_err(err)?,
            "ground" => {
                let (_, p) = fields(body).map_err(err)?;
                let get = |k: &str, d: f64| p.iter().find(|(key, _)| key == k).map(|(_, v)| eval(v)).transpose().map(|v| v.unwrap_or(d));
                w.ground = Some((get("z", 0.0).map_err(err)?, get("friction", 0.5).map_err(err)?, get("restitution", 0.2).map_err(err)?));
            }
            "body" | "static" => {
                if name.is_empty() {
                    return Err(err("a body needs a name".into()));
                }
                let (words, p) = fields(body).map_err(err)?;
                let get = |k: &str| p.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone());
                let num = |k: &str, d: f64| get(k).map(|v| eval(&v)).transpose().map(|v| v.unwrap_or(d));
                let shape_word = words.first().cloned().unwrap_or_default();
                let shape = match shape_word.as_str() {
                    "sphere" | "ball" => Shape::Sphere(num("r", 0.1).map_err(err)?),
                    "box" | "cube" => {
                        let s = match get("size") {
                            Some(v) => vec3(&v).map_err(err)?,
                            None => {
                                let a = num("a", 0.2).map_err(err)?;
                                V3(a, a, a)
                            }
                        };
                        Shape::Box(s * 0.5)
                    }
                    "capsule" | "rod" => Shape::Capsule(num("r", 0.05).map_err(err)?, num("length", 0.5).map_err(err)? / 2.0),
                    _ => return Err(err("the shape is sphere, box or capsule".into())),
                };
                let fixed = kind == "static";
                let mass = if fixed { 0.0 } else { num("mass", 1.0).map_err(err)? };
                if !fixed && !(mass > 0.0) {
                    return Err(err("mass must be positive (use static for fixed bodies)".into()));
                }
                // Principal moments of inertia.
                let i_body = match shape {
                    Shape::Sphere(r) => V3(1.0, 1.0, 1.0) * (0.4 * mass * r * r),
                    Shape::Box(h) => {
                        let (a, b, c) = (2.0 * h.0, 2.0 * h.1, 2.0 * h.2);
                        V3(b * b + c * c, a * a + c * c, a * a + b * b) * (mass / 12.0)
                    }
                    Shape::Capsule(r, h) => {
                        // A cylinder (length 2h) and two hemispheres, sharing the mass by volume.
                        let (vc, vs) = (PI * r * r * 2.0 * h, 4.0 / 3.0 * PI * r * r * r);
                        let (mc, ms) = (mass * vc / (vc + vs), mass * vs / (vc + vs));
                        let axial = mc * r * r / 2.0 + ms * 0.4 * r * r;
                        let perp = mc * (r * r / 4.0 + (2.0 * h).powi(2) / 12.0) + ms * (0.4 * r * r + h * h + 0.75 * h * r);
                        V3(perp, perp, axial)
                    }
                };
                let inv = |v: f64| if v > 0.0 { 1.0 / v } else { 0.0 };
                let rot = get("rot").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or_default();
                let k = w.bodies.len();
                w.bodies.push(Body {
                    name: name.clone(),
                    shape,
                    color: colour(&get("color").unwrap_or_default().to_ascii_lowercase(), k),
                    x: get("pos").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or_default(),
                    q: Quat::from_euler_deg(rot.0, rot.1, rot.2),
                    v: if fixed { V3::default() } else { get("vel").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or_default() },
                    w: if fixed { V3::default() } else { get("angvel").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or_default() },
                    inv_m: inv(mass),
                    m: mass,
                    i_body,
                    inv_i_body: if fixed { V3::default() } else { V3(inv(i_body.0), inv(i_body.1), inv(i_body.2)) },
                    friction: num("friction", 0.5).map_err(err)?,
                    restitution: num("restitution", 0.2).map_err(err)?,
                    damping: num("damping", 0.0).map_err(err)?,
                    inv_i: M3::zero(),
                    f: V3::default(),
                    tau: V3::default(),
                });
            }
            "joint" | "spring" | "force" => pending.push((no, kind.clone(), name, body.to_string())),
            other => return Err(err(format!("unknown \"{other}\" (gravity, ground, body, static, joint, spring, force)"))),
        }
    }
    let find = |n: &str, w: &World| -> Result<Id, String> {
        if n.eq_ignore_ascii_case("world") || n.eq_ignore_ascii_case("ground") {
            return Ok(None);
        }
        let k = w.bodies.iter().position(|b| b.name == n).ok_or_else(|| format!("no body \"{n}\""))?;
        // A static body works like the world for joints.
        Ok(if w.bodies[k].inv_m == 0.0 { None } else { Some(k) })
    };
    for (no, kind, name, body) in pending {
        let err = |e: String| format!("line {}: {e}", no + 1);
        let (words, p) = fields(&body).map_err(err)?;
        let get = |k: &str| p.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone());
        let num = |k: &str, d: f64| get(k).map(|v| eval(&v)).transpose().map(|v| v.unwrap_or(d));
        match kind.as_str() {
            "joint" => {
                let a = find(&get("a").ok_or_else(|| err("a joint needs a = body".into()))?, &w).map_err(err)?.ok_or_else(|| err("a must be a moving body".into()))?;
                let b = find(&get("b").unwrap_or_else(|| "world".into()), &w).map_err(err)?;
                let at = get("at").map(|v| vec3(&v)).transpose().map_err(err)?;
                let to_b = |pt: V3, w: &World| match b {
                    Some(k) => w.bodies[k].to_local(pt),
                    None => pt,
                };
                let kind_word = words.first().cloned().unwrap_or_default();
                let (la, lb, jk) = match kind_word.as_str() {
                    "ball" => {
                        let at = at.unwrap_or(w.bodies[a].x);
                        (w.bodies[a].to_local(at), to_b(at, &w), JointKind::Ball)
                    }
                    "hinge" | "revolute" => {
                        let at = at.unwrap_or(w.bodies[a].x);
                        let axis = get("axis").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or(V3(0.0, 1.0, 0.0)).norm();
                        let (r, _) = axis.basis();
                        let axis_b = match b {
                            Some(k) => w.bodies[k].q.mat().t().mul(axis),
                            None => axis,
                        };
                        let ref_b = match b {
                            Some(k) => w.bodies[k].q.mat().t().mul(r),
                            None => r,
                        };
                        let ra = w.bodies[a].q.mat().t();
                        let motor = get("motor").map(|m| Expr::with_names(&m, &["t".to_string()])).transpose().map_err(|e| err(format!("motor: {e}")))?;
                        (w.bodies[a].to_local(at), to_b(at, &w), JointKind::Hinge { axis_a: ra.mul(axis), axis_b, ref_a: ra.mul(r), ref_b, motor, torque: num("torque", f64::INFINITY).map_err(err)? })
                    }
                    "distance" | "rod" | "rope" => {
                        let pa = get("at").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or(w.bodies[a].x);
                        let pb = get("to").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or(match b {
                            Some(k) => w.bodies[k].x,
                            None => pa + V3(0.0, 0.0, 1.0),
                        });
                        let length = num("length", (pa - pb).len()).map_err(err)?;
                        (w.bodies[a].to_local(pa), to_b(pb, &w), JointKind::Distance { length })
                    }
                    _ => return Err(err("joint: ball, hinge or distance".into())),
                };
                w.joints.push(Joint { name, a, b, la, lb, kind: jk, motor_impulse: 0.0 });
            }
            "spring" => {
                let a = find(&get("a").ok_or_else(|| err("a spring needs a = body".into()))?, &w).map_err(err)?.ok_or_else(|| err("a must be a moving body".into()))?;
                let b = find(&get("b").unwrap_or_else(|| "world".into()), &w).map_err(err)?;
                let pa = get("at").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or(w.bodies[a].x);
                let pb = get("to").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or(match b {
                    Some(k) => w.bodies[k].x,
                    None => pa,
                });
                let lb = match b {
                    Some(k) => w.bodies[k].to_local(pb),
                    None => pb,
                };
                w.springs.push(Spring { a, b, la: w.bodies[a].to_local(pa), lb, k: num("k", 100.0).map_err(err)?, c: num("c", 0.0).map_err(err)?, rest: num("rest", (pa - pb).len()).map_err(err)? });
            }
            _ => {
                let body = get("body").ok_or_else(|| err("force: body = name".into()))?;
                let k = w.bodies.iter().position(|b| b.name == body).ok_or_else(|| err(format!("no body \"{body}\"")))?;
                let f = get("f").ok_or_else(|| err("force: f = fx fy fz (functions of t)".into()))?;
                let parts: Vec<&str> = f.split_whitespace().collect();
                if parts.len() != 3 {
                    return Err(err("force: f = fx fy fz (three expressions without spaces inside)".into()));
                }
                let names = ["t".to_string()];
                let e = |s: &str| Expr::with_names(s, &names).map_err(|e| err(e));
                let at = get("at").map(|v| vec3(&v)).transpose().map_err(err)?.unwrap_or_default();
                w.forces.push(Force { body: k, f: [e(parts[0])?, e(parts[1])?, e(parts[2])?], at });
            }
        }
    }
    if w.bodies.iter().all(|b| b.inv_m == 0.0) {
        return Err("no moving body (body name: sphere r = 0.1, mass = 1, pos = 0 0 1)".into());
    }
    Ok(w)
}

// ───────────────────────── collision detection

fn box_verts(b: &Body, h: V3) -> Vec<V3> {
    let mut out = Vec::with_capacity(20);
    for sx in [-1.0, 1.0] {
        for sy in [-1.0, 1.0] {
            for sz in [-1.0, 1.0] {
                out.push(b.to_world(V3(sx * h.0, sy * h.1, sz * h.2)));
            }
        }
    }
    // Edge midpoints (edge–edge and edge–face contacts).
    for (i, j, k) in [(0, 1, 2), (1, 2, 0), (2, 0, 1)] {
        for s1 in [-1.0, 1.0] {
            for s2 in [-1.0, 1.0] {
                let mut p = [0.0; 3];
                p[j] = s1 * h.get(j);
                p[k] = s2 * h.get(k);
                let _ = i;
                out.push(b.to_world(V3(p[0], p[1], p[2])));
            }
        }
    }
    out
}

/// Closest point of a box to p (world), the outward normal and the signed distance (negative inside).
fn box_closest(b: &Body, h: V3, p: V3) -> (V3, V3, f64) {
    let l = b.to_local(p);
    let c = V3(l.0.clamp(-h.0, h.0), l.1.clamp(-h.1, h.1), l.2.clamp(-h.2, h.2));
    let r = b.q.mat();
    if c != l {
        let d = l - c;
        let dist = d.len();
        return (b.to_world(c), r.mul(d * (1.0 / dist)), dist);
    }
    // Inside: the nearest face.
    let gaps = [h.0 - l.0.abs(), h.1 - l.1.abs(), h.2 - l.2.abs()];
    let i = (0..3).min_by(|&a, &b| gaps[a].partial_cmp(&gaps[b]).unwrap()).unwrap();
    let mut n = [0.0; 3];
    n[i] = if l.get(i) >= 0.0 { 1.0 } else { -1.0 };
    let mut face = [l.0, l.1, l.2];
    face[i] = n[i] * h.get(i);
    (b.to_world(V3(face[0], face[1], face[2])), r.mul(V3(n[0], n[1], n[2])), -gaps[i])
}

/// The capsule's segment ends.
fn capsule_ends(b: &Body, h: f64) -> (V3, V3) {
    (b.to_world(V3(0.0, 0.0, -h)), b.to_world(V3(0.0, 0.0, h)))
}

fn closest_on_segment(a: V3, b: V3, p: V3) -> V3 {
    let ab = b - a;
    let t = ((p - a).dot(ab) / ab.dot(ab).max(1e-30)).clamp(0.0, 1.0);
    a + ab * t
}

/// Closest points of two segments.
fn segments(p1: V3, q1: V3, p2: V3, q2: V3) -> (V3, V3) {
    let (d1, d2, r) = (q1 - p1, q2 - p2, p1 - p2);
    let (a, e, f) = (d1.dot(d1), d2.dot(d2), d2.dot(r));
    let (s, t);
    if a <= 1e-15 && e <= 1e-15 {
        return (p1, p2);
    }
    if a <= 1e-15 {
        s = 0.0;
        t = (f / e).clamp(0.0, 1.0);
    } else {
        let c = d1.dot(r);
        if e <= 1e-15 {
            t = 0.0;
            s = (-c / a).clamp(0.0, 1.0);
        } else {
            let b = d1.dot(d2);
            let denom = a * e - b * b;
            let mut ss = if denom > 1e-15 { ((b * f - c * e) / denom).clamp(0.0, 1.0) } else { 0.0 };
            let mut tt = (b * ss + f) / e;
            if tt < 0.0 {
                tt = 0.0;
                ss = (-c / a).clamp(0.0, 1.0);
            } else if tt > 1.0 {
                tt = 1.0;
                ss = ((b - c) / a).clamp(0.0, 1.0);
            }
            s = ss;
            t = tt;
        }
    }
    (p1 + d1 * s, p2 + d2 * t)
}

/// Contacts of body a (moving) with body b (index) — normal from b to a.
fn collide(bodies: &[Body], ia: usize, ib: usize, out: &mut Vec<Contact>) {
    let (a, b) = (&bodies[ia], &bodies[ib]);
    // Pairs handled the other way round.
    if matches!((&a.shape, &b.shape), (Shape::Box(_), Shape::Sphere(_)) | (Shape::Capsule(..), Shape::Sphere(_)) | (Shape::Box(_), Shape::Capsule(..))) {
        return collide(bodies, ib, ia, out);
    }
    let mut push = |a_id: usize, b_id: usize, p: V3, n: V3, depth: f64| {
        let (x, y) = (&bodies[a_id], &bodies[b_id]);
        // Body b_id as world when it is static.
        let b_ref = if y.inv_m == 0.0 { None } else { Some(b_id) };
        if x.inv_m == 0.0 {
            // a is static: swap so the moving one is first.
            out.push(Contact { a: b_id, b: None, p, n: -n, depth, friction: (x.friction * y.friction).sqrt(), restitution: x.restitution.max(y.restitution), ln: 0.0, lt: [0.0; 2], bounce: 0.0 });
        } else {
            out.push(Contact { a: a_id, b: b_ref, p, n, depth, friction: (x.friction * y.friction).sqrt(), restitution: x.restitution.max(y.restitution), ln: 0.0, lt: [0.0; 2], bounce: 0.0 });
        }
    };
    let sphere_sphere = |ca: V3, ra: f64, cb: V3, rb: f64| -> Option<(V3, V3, f64)> {
        let d = ca - cb;
        let dist = d.len();
        if dist >= ra + rb {
            return None;
        }
        let n = if dist > 1e-12 { d * (1.0 / dist) } else { V3(0.0, 0.0, 1.0) };
        Some((cb + n * rb, n, ra + rb - dist))
    };
    let sphere_box = |c: V3, r: f64, bx: &Body, h: V3| -> Option<(V3, V3, f64)> {
        let (q, n, dist) = box_closest(bx, h, c);
        if dist >= r {
            return None;
        }
        Some((q, n, r - dist))
    };
    match (&a.shape, &b.shape) {
        (Shape::Sphere(ra), Shape::Sphere(rb)) => {
            if let Some((p, n, d)) = sphere_sphere(a.x, *ra, b.x, *rb) {
                push(ia, ib, p, n, d);
            }
        }
        (Shape::Sphere(r), Shape::Box(h)) => {
            if let Some((p, n, d)) = sphere_box(a.x, *r, b, *h) {
                push(ia, ib, p, n, d);
            }
        }
        (Shape::Box(_), Shape::Sphere(_)) | (Shape::Capsule(..), Shape::Sphere(_)) | (Shape::Box(_), Shape::Capsule(..)) => {}
        (Shape::Sphere(r), Shape::Capsule(rc, hc)) => {
            let (e1, e2) = capsule_ends(b, *hc);
            let q = closest_on_segment(e1, e2, a.x);
            if let Some((p, n, d)) = sphere_sphere(a.x, *r, q, *rc) {
                push(ia, ib, p, n, d);
            }
        }
        (Shape::Capsule(ra, ha), Shape::Capsule(rb, hb)) => {
            let (a1, a2) = capsule_ends(a, *ha);
            let (b1, b2) = capsule_ends(b, *hb);
            let (pa, pb) = segments(a1, a2, b1, b2);
            if let Some((p, n, d)) = sphere_sphere(pa, *ra, pb, *rb) {
                push(ia, ib, p, n, d);
            }
        }
        (Shape::Capsule(r, hc), Shape::Box(h)) => {
            let (e1, e2) = capsule_ends(a, *hc);
            for t in [0.0, 0.25, 0.5, 0.75, 1.0] {
                if let Some((p, n, d)) = sphere_box(e1 + (e2 - e1) * t, *r, b, *h) {
                    push(ia, ib, p, n, d);
                }
            }
        }
        (Shape::Box(ha), Shape::Box(hb)) => {
            if let Some(found) = box_box(a, *ha, b, *hb) {
                for (p, n, d) in found {
                    push(ia, ib, p, n, d);
                }
            }
        }
    }
}

/// Box–box by the separating-axis test: the axis of least overlap (3 + 3 face normals, 9 edge
/// crossings) gives the normal (from b to a); the corners of each box that reach past the other's
/// face plane within its face make the contacts, or one point between the nearest edges.
fn box_box(a: &Body, ha: V3, b: &Body, hb: V3) -> Option<Vec<(V3, V3, f64)>> {
    let (ra, rb) = (a.q.mat(), b.q.mat());
    let ax = |m: &M3, i: usize| V3(m.0[0][i], m.0[1][i], m.0[2][i]);
    let aa = [ax(&ra, 0), ax(&ra, 1), ax(&ra, 2)];
    let bb = [ax(&rb, 0), ax(&rb, 1), ax(&rb, 2)];
    let extent = |axes: &[V3; 3], h: V3, n: V3| (0..3).map(|i| h.get(i) * axes[i].dot(n).abs()).sum::<f64>();
    let d = a.x - b.x;
    let mut best: Option<(f64, V3, bool)> = None; // overlap, normal (b → a), face axis?
    let mut consider = |n: V3, face: bool| {
        let l = n.len();
        if l < 1e-9 {
            return true;
        }
        let n = n * (1.0 / l);
        let overlap = extent(&aa, ha, n) + extent(&bb, hb, n) - d.dot(n).abs();
        if overlap < 0.0 {
            return false;
        }
        let n = if d.dot(n) < 0.0 { -n } else { n };
        // Prefer face axes: an edge axis must be clearly better.
        let better = match best {
            None => true,
            Some((o, _, f)) => if face == f { overlap < o } else if face { overlap < o * 1.05 } else { overlap < o * 0.95 },
        };
        if better {
            best = Some((overlap, n, face));
        }
        true
    };
    for n in aa.iter().chain(bb.iter()) {
        if !consider(*n, true) {
            return None;
        }
    }
    for x in &aa {
        for y in &bb {
            if !consider(x.cross(*y), false) {
                return None;
            }
        }
    }
    let (overlap, n, face) = best?;
    let corners = |body: &Body, h: V3| -> Vec<V3> { box_verts(body, h).into_iter().take(8).collect() };
    if !face {
        // Edge–edge: the edge of a deepest towards b, the edge of b deepest towards a.
        let support_edge = |body: &Body, axes: &[V3; 3], h: V3, dir: V3| -> (V3, V3) {
            // The axis most parallel to the edge is the one most perpendicular to dir.
            let i = (0..3).min_by(|&p, &q| axes[p].dot(dir).abs().partial_cmp(&axes[q].dot(dir).abs()).unwrap()).unwrap();
            let mut c = body.x;
            for k in 0..3 {
                if k != i {
                    let s = if axes[k].dot(dir) > 0.0 { 1.0 } else { -1.0 };
                    c = c + axes[k] * (s * h.get(k));
                }
            }
            (c - axes[i] * h.get(i), c + axes[i] * h.get(i))
        };
        let (a1, a2) = support_edge(a, &aa, ha, -n);
        let (b1, b2) = support_edge(b, &bb, hb, n);
        let (pa, pb) = segments(a1, a2, b1, b2);
        return Some(vec![((pa + pb) * 0.5, n, overlap)]);
    }
    // Inside a box's face across n (with a small tolerance on the sides).
    let within = |body: &Body, axes: &[V3; 3], h: V3, p: V3| -> bool {
        let l = p - body.x;
        (0..3).all(|i| axes[i].dot(n).abs() > 0.9 || l.dot(axes[i]).abs() <= h.get(i) * 1.02 + 1e-6)
    };
    let top_b = b.x.dot(n) + extent(&bb, hb, n);
    let bottom_a = a.x.dot(n) - extent(&aa, ha, n);
    let mut out = Vec::new();
    for v in corners(a, ha) {
        let depth = top_b - v.dot(n);
        if depth > 0.0 && within(b, &bb, hb, v) {
            out.push((v + n * (depth * 0.5), n, depth.min(overlap)));
        }
    }
    for u in corners(b, hb) {
        let depth = u.dot(n) - bottom_a;
        if depth > 0.0 && within(a, &aa, ha, u) {
            out.push((u - n * (depth * 0.5), n, depth.min(overlap)));
        }
    }
    if out.is_empty() {
        // Faces cross without a corner inside: one point at the middle of the overlap.
        out.push(((a.x + b.x) * 0.5, n, overlap));
    }
    Some(out)
}

fn collide_ground(b: &Body, k: usize, z0: f64, fr: f64, re: f64, out: &mut Vec<Contact>) {
    let mut push = |p: V3, depth: f64| out.push(Contact { a: k, b: None, p, n: V3(0.0, 0.0, 1.0), depth, friction: (b.friction * fr).sqrt(), restitution: b.restitution.max(re), ln: 0.0, lt: [0.0; 2], bounce: 0.0 });
    match b.shape {
        Shape::Sphere(r) => {
            if b.x.2 - r < z0 {
                push(V3(b.x.0, b.x.1, z0), z0 - (b.x.2 - r));
            }
        }
        Shape::Capsule(r, h) => {
            let (e1, e2) = capsule_ends(b, h);
            for e in [e1, e2] {
                if e.2 - r < z0 {
                    push(V3(e.0, e.1, z0), z0 - (e.2 - r));
                }
            }
        }
        Shape::Box(h) => {
            for v in box_verts(b, h).into_iter().take(8) {
                if v.2 < z0 {
                    push(V3(v.0, v.1, z0), z0 - v.2);
                }
            }
        }
    }
}

/// A rough bounding radius (broad phase).
fn radius(b: &Body) -> f64 {
    match b.shape {
        Shape::Sphere(r) => r,
        Shape::Box(h) => h.len(),
        Shape::Capsule(r, h) => r + h,
    }
}

// ───────────────────────── the solver

fn apply(bodies: &mut [Body], a: usize, b: Id, pa: V3, pb: V3, impulse: V3) {
    let ba = &mut bodies[a];
    ba.v = ba.v + impulse * ba.inv_m;
    ba.w = ba.w + ba.inv_i.mul((pa - ba.x).cross(impulse));
    if let Some(b) = b {
        let bb = &mut bodies[b];
        bb.v = bb.v - impulse * bb.inv_m;
        bb.w = bb.w - bb.inv_i.mul((pb - bb.x).cross(impulse));
    }
}

/// Effective mass along a direction n for points pa (on a) and pb (on b).
fn k_along(bodies: &[Body], a: usize, b: Id, pa: V3, pb: V3, n: V3) -> f64 {
    let ba = &bodies[a];
    let ra = pa - ba.x;
    let mut k = ba.inv_m + ba.inv_i.mul(ra.cross(n)).cross(ra).dot(n);
    if let Some(b) = b {
        let bb = &bodies[b];
        let rb = pb - bb.x;
        k += bb.inv_m + bb.inv_i.mul(rb.cross(n)).cross(rb).dot(n);
    }
    k
}

fn rel_vel(bodies: &[Body], a: usize, b: Id, pa: V3, pb: V3) -> V3 {
    bodies[a].vel_at(pa) - b.map(|b| bodies[b].vel_at(pb)).unwrap_or_default()
}

fn joint_points(bodies: &[Body], j: &Joint) -> (V3, V3) {
    let pa = bodies[j.a].to_world(j.la);
    let pb = match j.b {
        Some(k) => bodies[k].to_world(j.lb),
        None => j.lb,
    };
    (pa, pb)
}

/// Hinge angle (rad): the reference of a against the reference of b, about the axis.
fn hinge_angle(bodies: &[Body], j: &Joint) -> f64 {
    if let JointKind::Hinge { axis_b, ref_a, ref_b, .. } = &j.kind {
        let world = |id: Id, v: V3| match id {
            Some(k) => bodies[k].q.mat().mul(v),
            None => v,
        };
        let axis = world(j.b, *axis_b);
        let ra = bodies[j.a].q.mat().mul(*ref_a);
        let rb = world(j.b, *ref_b);
        let y = axis.cross(rb);
        ra.dot(y).atan2(ra.dot(rb))
    } else {
        0.0
    }
}

struct Settings {
    dt: f64,
    iterations: usize,
    beta: f64,
    slop: f64,
}

fn step(w: &mut World, t: f64, s: &Settings, contacts_out: &mut usize, max_depth: &mut f64) {
    let dt = s.dt;
    let n = w.bodies.len();
    for b in w.bodies.iter_mut() {
        b.update_inertia();
        b.f = V3::default();
        b.tau = V3::default();
    }
    // External forces: gravity, user forces, springs.
    for b in w.bodies.iter_mut() {
        if b.inv_m > 0.0 {
            b.f = b.f + w.gravity * b.m;
        }
    }
    for f in &w.forces {
        let v = V3(f.f[0].value(&[t]), f.f[1].value(&[t]), f.f[2].value(&[t]));
        let b = &mut w.bodies[f.body];
        let p = b.to_world(f.at);
        b.f = b.f + v;
        b.tau = b.tau + (p - b.x).cross(v);
    }
    for sp in &w.springs {
        let pa = w.bodies[sp.a].to_world(sp.la);
        let pb = match sp.b {
            Some(k) => w.bodies[k].to_world(sp.lb),
            None => sp.lb,
        };
        let d = pa - pb;
        let len = d.len();
        let u = if len > 1e-12 { d * (1.0 / len) } else { V3(0.0, 0.0, 1.0) };
        let vrel = rel_vel(&w.bodies, sp.a, sp.b, pa, pb).dot(u);
        let force = u * (-(sp.k * (len - sp.rest) + sp.c * vrel));
        let ba = &mut w.bodies[sp.a];
        ba.f = ba.f + force;
        ba.tau = ba.tau + (pa - ba.x).cross(force);
        if let Some(k) = sp.b {
            let bb = &mut w.bodies[k];
            bb.f = bb.f - force;
            bb.tau = bb.tau - (pb - bb.x).cross(force);
        }
    }
    // Velocities from forces (semi-implicit Euler), with damping and the gyroscopic term left out.
    for b in w.bodies.iter_mut() {
        if b.inv_m == 0.0 {
            continue;
        }
        b.v = b.v + b.f * (b.inv_m * dt);
        b.w = b.w + b.inv_i.mul(b.tau) * dt;
        if b.damping > 0.0 {
            let k = (1.0 - b.damping * dt).max(0.0);
            b.v = b.v * k;
            b.w = b.w * k;
        }
    }
    // Contacts.
    let mut contacts: Vec<Contact> = Vec::new();
    for i in 0..n {
        if w.bodies[i].inv_m == 0.0 {
            continue;
        }
        if let Some((z0, fr, re)) = w.ground {
            collide_ground(&w.bodies[i], i, z0, fr, re, &mut contacts);
        }
    }
    for i in 0..n {
        for j in i + 1..n {
            let (a, b) = (&w.bodies[i], &w.bodies[j]);
            if a.inv_m == 0.0 && b.inv_m == 0.0 {
                continue;
            }
            // Bodies joined by a joint do not collide.
            if w.joints.iter().any(|jt| (jt.a == i && jt.b == Some(j)) || (jt.a == j && jt.b == Some(i))) {
                continue;
            }
            if (a.x - b.x).len() > radius(a) + radius(b) {
                continue;
            }
            collide(&w.bodies, i, j, &mut contacts);
        }
    }
    *contacts_out = contacts.len();
    for c in contacts.iter_mut() {
        *max_depth = max_depth.max(c.depth);
        let vn = rel_vel(&w.bodies, c.a, c.b, c.p, c.p).dot(c.n);
        c.bounce = if vn < -0.5 { -c.restitution * vn } else { 0.0 };
    }
    // Joint preparation: the motor row's target.
    let motor_speeds: Vec<Option<f64>> = w.joints.iter().map(|j| if let JointKind::Hinge { motor: Some(e), .. } = &j.kind { Some(e.value(&[t])) } else { None }).collect();
    for j in w.joints.iter_mut() {
        j.motor_impulse = 0.0;
    }
    // Sequential impulses.
    for _ in 0..s.iterations {
        for (ji, j) in w.joints.iter_mut().enumerate() {
            let (pa, pb) = joint_points(&w.bodies, j);
            let kind = j.kind.clone();
            match &kind {
                JointKind::Ball | JointKind::Hinge { .. } => {
                    // Point-to-point: a 3 × 3 block.
                    let ba = &w.bodies[j.a];
                    let ra = pa - ba.x;
                    let sa = M3::skew(ra);
                    let mut k = M3::diag(V3(1.0, 1.0, 1.0) * ba.inv_m).add(&sa.mm(&ba.inv_i).mm(&sa.t()));
                    if let Some(b) = j.b {
                        let bb = &w.bodies[b];
                        let sb = M3::skew(pb - bb.x);
                        k = k.add(&M3::diag(V3(1.0, 1.0, 1.0) * bb.inv_m)).add(&sb.mm(&bb.inv_i).mm(&sb.t()));
                    }
                    if let Some(kinv) = k.inverse() {
                        let c = pa - pb;
                        let vrel = rel_vel(&w.bodies, j.a, j.b, pa, pb);
                        let imp = kinv.mul(-(vrel + c * (s.beta / dt)));
                        apply(&mut w.bodies, j.a, j.b, pa, pb, imp);
                    }
                    if let JointKind::Hinge { axis_a, axis_b, torque, .. } = &kind {
                        let world = |id: Id, v: V3, bodies: &[Body]| match id {
                            Some(k) => bodies[k].q.mat().mul(v),
                            None => v,
                        };
                        let aa = world(Some(j.a), *axis_a, &w.bodies);
                        let ab = world(j.b, *axis_b, &w.bodies);
                        let (p1, p2) = ab.basis();
                        let err = aa.cross(ab);
                        let inv_sum = |dir: V3, bodies: &[Body]| {
                            let mut k = bodies[j.a].inv_i.mul(dir).dot(dir);
                            if let Some(b) = j.b {
                                k += bodies[b].inv_i.mul(dir).dot(dir);
                            }
                            k
                        };
                        let rel_w = |bodies: &[Body]| bodies[j.a].w - j.b.map(|b| bodies[b].w).unwrap_or_default();
                        let ang = |bodies: &mut [Body], dir: V3, lambda: f64| {
                            let ba = &mut bodies[j.a];
                            ba.w = ba.w + ba.inv_i.mul(dir * lambda);
                            if let Some(b) = j.b {
                                let bb = &mut bodies[b];
                                bb.w = bb.w - bb.inv_i.mul(dir * lambda);
                            }
                        };
                        // Keep the axes aligned: no relative rotation across the axis.
                        for p in [p1, p2] {
                            let k = inv_sum(p, &w.bodies);
                            if k > 0.0 {
                                let lambda = -(rel_w(&w.bodies).dot(p) - err.dot(p) * (s.beta / dt)) / k;
                                ang(&mut w.bodies, p, lambda);
                            }
                        }
                        // The motor: drive the relative speed about the axis, within the torque limit.
                        if let Some(target) = motor_speeds[ji] {
                            let k = inv_sum(ab, &w.bodies);
                            if k > 0.0 {
                                let lambda = (target - rel_w(&w.bodies).dot(ab)) / k;
                                let limit = torque * dt;
                                let total = (j.motor_impulse + lambda).clamp(-limit, limit);
                                let applied = total - j.motor_impulse;
                                j.motor_impulse = total;
                                ang(&mut w.bodies, ab, applied);
                            }
                        }
                    }
                }
                JointKind::Distance { length } => {
                    let d = pa - pb;
                    let len = d.len();
                    let u = if len > 1e-12 { d * (1.0 / len) } else { V3(0.0, 0.0, 1.0) };
                    let k = k_along(&w.bodies, j.a, j.b, pa, pb, u);
                    if k > 0.0 {
                        let vn = rel_vel(&w.bodies, j.a, j.b, pa, pb).dot(u);
                        let lambda = -(vn + (len - length) * (s.beta / dt)) / k;
                        apply(&mut w.bodies, j.a, j.b, pa, pb, u * lambda);
                    }
                }
            }
        }
        for c in contacts.iter_mut() {
            let k = k_along(&w.bodies, c.a, c.b, c.p, c.p, c.n);
            if k <= 0.0 {
                continue;
            }
            let vn = rel_vel(&w.bodies, c.a, c.b, c.p, c.p).dot(c.n);
            let bias = (s.beta / dt) * (c.depth - s.slop).max(0.0);
            let target = c.bounce.max(bias);
            let lambda = (target - vn) / k;
            let total = (c.ln + lambda).max(0.0);
            let applied = total - c.ln;
            c.ln = total;
            apply(&mut w.bodies, c.a, c.b, c.p, c.p, c.n * applied);
            // Friction in two directions, limited by μ·normal impulse.
            let (t1, t2) = c.n.basis();
            for (ti, t) in [t1, t2].into_iter().enumerate() {
                let kt = k_along(&w.bodies, c.a, c.b, c.p, c.p, t);
                if kt <= 0.0 {
                    continue;
                }
                let vt = rel_vel(&w.bodies, c.a, c.b, c.p, c.p).dot(t);
                let lambda = -vt / kt;
                let limit = c.friction * c.ln;
                let total = (c.lt[ti] + lambda).clamp(-limit, limit);
                let applied = total - c.lt[ti];
                c.lt[ti] = total;
                apply(&mut w.bodies, c.a, c.b, c.p, c.p, t * applied);
            }
        }
    }
    // Positions.
    for b in w.bodies.iter_mut() {
        if b.inv_m == 0.0 {
            continue;
        }
        b.x = b.x + b.v * dt;
        b.q = b.q.integrate(b.w, dt);
    }
}

fn energy(w: &World) -> (f64, f64) {
    let mut ke = 0.0;
    let mut pe = 0.0;
    for b in &w.bodies {
        if b.inv_m == 0.0 {
            continue;
        }
        let r = b.q.mat();
        let wb = r.t().mul(b.w);
        ke += 0.5 * b.m * b.v.dot(b.v) + 0.5 * (b.i_body.0 * wb.0 * wb.0 + b.i_body.1 * wb.1 * wb.1 + b.i_body.2 * wb.2 * wb.2);
        pe -= b.m * w.gravity.dot(b.x);
    }
    for sp in &w.springs {
        let pa = w.bodies[sp.a].to_world(sp.la);
        let pb = match sp.b {
            Some(k) => w.bodies[k].to_world(sp.lb),
            None => sp.lb,
        };
        pe += 0.5 * sp.k * ((pa - pb).len() - sp.rest).powi(2);
    }
    (ke, pe)
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let mut w = parse(&ctx.str("world", ""))?;
    let t_end = ctx.positive("tEnd", 5.0)?;
    let dt = ctx.positive("dt", 1.0 / 240.0)?;
    let fps = ctx.positive("fps", 60.0)?;
    let s = Settings { dt, iterations: ctx.count("iterations", 20, 1, 500)?, beta: ctx.num("baumgarte", 0.2)?, slop: ctx.num("slop", 0.002)? };
    let steps = ((t_end / dt).round() as usize).min(20_000_000);
    let every = ((1.0 / fps / dt).round() as usize).max(1);
    let nb = w.bodies.len();
    let moving: Vec<usize> = (0..nb).filter(|&k| w.bodies[k].inv_m > 0.0).collect();
    // Frames: t, then per body x y z qw qx qy qz.
    let mut frames: Vec<Vec<f64>> = vec![Vec::new(); 1 + 7 * nb];
    let mut en: Vec<[f64; 4]> = Vec::new();
    let mut hinge_cols: Vec<Vec<f64>> = vec![Vec::new(); w.joints.len() * 2];
    let mut contact_count = 0usize;
    let mut max_depth = 0.0f64;
    let mut max_speed = vec![0.0f64; nb];
    let mut max_height = vec![f64::NEG_INFINITY; nb];
    let mut contacts_col = Vec::new();
    let record = |w: &World, t: f64, frames: &mut Vec<Vec<f64>>| {
        frames[0].push(t);
        for (k, b) in w.bodies.iter().enumerate() {
            for (c, v) in [b.x.0, b.x.1, b.x.2, b.q.0, b.q.1, b.q.2, b.q.3].into_iter().enumerate() {
                frames[1 + 7 * k + c].push(v);
            }
        }
    };
    record(&w, 0.0, &mut frames);
    let e0 = energy(&w);
    en.push([0.0, e0.0, e0.1, e0.0 + e0.1]);
    contacts_col.push(0.0);
    for (ji, j) in w.joints.iter().enumerate() {
        hinge_cols[2 * ji].push(hinge_angle(&w.bodies, j).to_degrees());
        hinge_cols[2 * ji + 1].push(0.0);
    }
    for k in 1..=steps {
        let t = k as f64 * dt;
        step(&mut w, t - dt, &s, &mut contact_count, &mut max_depth);
        for &b in &moving {
            let body = &w.bodies[b];
            if !(body.x.len().is_finite() && body.v.len().is_finite()) {
                return Err(format!("the simulation blew up at t = {t:.3} s (a smaller dt, more iterations, or lighter springs)"));
            }
            max_speed[b] = max_speed[b].max(body.v.len());
            max_height[b] = max_height[b].max(body.x.2);
        }
        if k % every == 0 || k == steps {
            record(&w, t, &mut frames);
            let e = energy(&w);
            en.push([t, e.0, e.1, e.0 + e.1]);
            contacts_col.push(contact_count as f64);
            for (ji, j) in w.joints.iter().enumerate() {
                hinge_cols[2 * ji].push(hinge_angle(&w.bodies, j).to_degrees());
                hinge_cols[2 * ji + 1].push(j.motor_impulse / dt);
            }
        }
        if k % 4000 == 0 {
            ctx.check()?;
            ctx.report(k as f64 / steps as f64, "physics");
        }
    }
    let mut d = Dataset::default();
    // Trajectories of the moving bodies (the first table: the 3D view's fallback shows paths).
    let times = frames[0].clone();
    let mut traj = Table::new("trajectories").with_x(Column::new("t", "s", times.clone()));
    for &k in &moving {
        let name = &w.bodies[k].name;
        for (c, axis) in ["x", "y", "z"].iter().enumerate() {
            traj.push(Column::new(&format!("{name}.{axis}"), "m", frames[1 + 7 * k + c].clone()));
        }
    }
    let mut ft = Table::new("frames").with_x(Column::new("t", "s", times.clone()));
    for (k, b) in w.bodies.iter().enumerate() {
        for (c, part) in ["x", "y", "z", "qw", "qx", "qy", "qz"].iter().enumerate() {
            ft.push(Column::new(&format!("{}.{part}", b.name), "", std::mem::take(&mut frames[1 + 7 * k + c])));
        }
    }
    let mut et = Table::new("energy").with_x(Column::new("t", "s", en.iter().map(|e| e[0]).collect()));
    et.push(Column::new("kinetic", "J", en.iter().map(|e| e[1]).collect()));
    et.push(Column::new("potential", "J", en.iter().map(|e| e[2]).collect()));
    et.push(Column::new("total", "J", en.iter().map(|e| e[3]).collect()));
    et.push(Column::new("contacts", "", contacts_col));
    let mut jt = Table::new("joints").with_x(Column::new("t", "s", times));
    for (ji, j) in w.joints.iter().enumerate() {
        if matches!(j.kind, JointKind::Hinge { .. }) {
            jt.push(Column::new(&format!("{} angle", j.name), "°", std::mem::take(&mut hinge_cols[2 * ji])));
            jt.push(Column::new(&format!("{} torque", j.name), "N·m", std::mem::take(&mut hinge_cols[2 * ji + 1])));
        }
    }
    let mut bt = Table::new("bodies");
    bt.push(Column::text("body", moving.iter().map(|&k| w.bodies[k].name.clone()).collect()));
    for (name, f) in [("x", 0), ("y", 1), ("z", 2)] {
        bt.push(Column::new(&format!("{name} (end)"), "m", moving.iter().map(|&k| w.bodies[k].x.get(f)).collect()));
    }
    bt.push(Column::new("speed (end)", "m/s", moving.iter().map(|&k| w.bodies[k].v.len()).collect()));
    bt.push(Column::new("max speed", "m/s", moving.iter().map(|&k| max_speed[k]).collect()));
    bt.push(Column::new("max height", "m", moving.iter().map(|&k| max_height[k]).collect()));
    for &k in &moving {
        let b = &w.bodies[k];
        d.scalar(&format!("{}.x (end)", b.name), b.x.0, "m");
        d.scalar(&format!("{}.y (end)", b.name), b.x.1, "m");
        d.scalar(&format!("{}.z (end)", b.name), b.x.2, "m");
        d.scalar(&format!("{} speed (end)", b.name), b.v.len(), "m/s");
        d.scalar(&format!("{} max height", b.name), max_height[k], "m");
    }
    for j in &w.joints {
        if matches!(j.kind, JointKind::Hinge { .. }) {
            d.scalar(&format!("{} angle (end)", j.name), hinge_angle(&w.bodies, j).to_degrees(), "°");
        }
    }
    let e1 = energy(&w);
    d.scalar("energy (start)", e0.0 + e0.1, "J");
    d.scalar("energy (end)", e1.0 + e1.1, "J");
    d.scalar("contacts (end)", contact_count as f64, "");
    d.scalar("max penetration", max_depth, "m");
    d.scalar("bodies", moving.len() as f64, "");
    // The scene for the 3D playback: shapes, colours, the ground.
    let shapes: Vec<serde_json::Value> = w
        .bodies
        .iter()
        .map(|b| {
            let (kind, size) = match b.shape {
                Shape::Sphere(r) => ("sphere", vec![r]),
                Shape::Box(h) => ("box", vec![2.0 * h.0, 2.0 * h.1, 2.0 * h.2]),
                Shape::Capsule(r, h) => ("capsule", vec![r, 2.0 * h]),
            };
            serde_json::json!({ "name": b.name, "shape": kind, "size": size, "color": b.color, "static": b.inv_m == 0.0 })
        })
        .collect();
    let joints: Vec<serde_json::Value> = w.joints.iter().map(|j| serde_json::json!({ "name": j.name, "a": w.bodies[j.a].name, "b": j.b.map(|k| w.bodies[k].name.clone()), "la": [j.la.0, j.la.1, j.la.2], "lb": [j.lb.0, j.lb.1, j.lb.2] })).collect();
    d.text = serde_json::json!({ "scene": { "bodies": shapes, "ground": w.ground.map(|g| g.0), "joints": joints, "frames": "frames" } }).to_string();
    d.tables.push(traj);
    d.tables.push(ft);
    d.tables.push(et);
    if !jt.columns.is_empty() {
        d.tables.push(jt);
    }
    d.tables.push(bt);
    Ok(d)
}
