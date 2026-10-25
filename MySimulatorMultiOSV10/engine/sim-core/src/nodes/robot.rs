//! Robot simulation (the Gazebo / Webots way): a mobile robot with sensors and
//! a controller in a 2D world, and the multibody dynamics of a planar arm.
//!
//! Mobile robot world, one line each:
//! ```text
//! arena: width = 10, height = 8
//! box: 4 3 5 5
//! circle: 7 2 0.6
//! wall: 2 6 6 6
//! waypoints: 9 7, 1 7
//! robot: x = 1, y = 1, heading = 0, radius = 0.2, vmax = 1, wmax = 3
//! lidar: rays = 9, fov = 180, range = 4, noise = 0.01
//! ```
//! The controller assigns v (m/s) and w (rad/s) each step from the sensors:
//! t, dt, x, y, th, v, w, goal_dist, goal_angle, gx, gy, d0 … d(n−1) (lidar,
//! right to left), front, left, right, bump, nearest, nearest_angle and
//! gap_angle (the open direction nearest the goal, rays widened by the robot's
//! size). Any other name it assigns keeps its value to the next step.
//!
//! The arm: links (uniform rods) and a payload at the tip, joint angles from
//! the +x axis, gravity along −y; free motion, joint targets with PID or a
//! Cartesian path by inverse kinematics.

use crate::data::{Column, Dataset, Table};
use crate::expr::{statements, valid_name, Expr};
use crate::linalg::{solve, Mat};
use crate::rng::Rng;
use crate::Ctx;
use std::collections::HashMap;
use std::f64::consts::PI;

fn eval(text: &str) -> Result<f64, String> {
    Expr::with_names(text.trim(), &[]).map(|e| e.value(&[])).map_err(|e| format!("\"{}\": {e}", text.trim()))
}

fn keyvals(text: &str) -> Result<HashMap<String, f64>, String> {
    let mut m = HashMap::new();
    for item in text.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let (k, v) = item.split_once('=').ok_or_else(|| format!("\"{item}\" is not key = value"))?;
        m.insert(k.trim().to_ascii_lowercase(), eval(v)?);
    }
    Ok(m)
}

fn numbers(text: &str) -> Result<Vec<f64>, String> {
    text.split(|c: char| c.is_whitespace() || c == ',').filter(|s| !s.is_empty()).map(eval).collect()
}

/// A program of "name = expression" lines over input names; assigned names persist.
struct Program {
    names: Vec<String>,
    code: Vec<(usize, Expr)>,
}

impl Program {
    fn compile(text: &str, inputs: &[&str]) -> Result<Program, String> {
        let mut names: Vec<String> = inputs.iter().map(|s| s.to_string()).collect();
        let stmts = statements(text);
        let mut targets = Vec::new();
        for s in &stmts {
            let (name, _) = s.split_once('=').ok_or_else(|| format!("\"{s}\" is not name = expression"))?;
            let name = name.trim().to_string();
            if !valid_name(&name) {
                return Err(format!("\"{name}\" cannot be a name"));
            }
            if !names.contains(&name) {
                names.push(name.clone());
            }
            targets.push(name);
        }
        let mut code = Vec::new();
        for (s, name) in stmts.iter().zip(&targets) {
            let rhs = s.split_once('=').unwrap().1;
            let e = Expr::with_names(rhs, &names).map_err(|e| format!("{name}: {e}"))?;
            code.push((names.iter().position(|n| n == name).unwrap(), e));
        }
        Ok(Program { names, code })
    }

    fn slot(&self, name: &str) -> Option<usize> {
        self.names.iter().position(|n| n == name)
    }

    fn run(&self, vars: &mut [f64], stack: &mut Vec<f64>) {
        for (slot, e) in &self.code {
            vars[*slot] = e.eval(vars, stack);
        }
    }
}

// ───────────────────────── mobile robot

#[derive(Clone, Copy)]
enum Obstacle {
    Seg(f64, f64, f64, f64),
    Circle(f64, f64, f64),
}

/// Distance along the ray (ox, oy) + s (dx, dy) to the first hit, if any.
fn ray(o: &Obstacle, ox: f64, oy: f64, dx: f64, dy: f64) -> Option<f64> {
    match *o {
        Obstacle::Seg(x1, y1, x2, y2) => {
            let (ex, ey) = (x2 - x1, y2 - y1);
            let den = dx * ey - dy * ex;
            if den.abs() < 1e-15 {
                return None;
            }
            let s = ((x1 - ox) * ey - (y1 - oy) * ex) / den;
            let u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
            if s >= 0.0 && (0.0..=1.0).contains(&u) {
                Some(s)
            } else {
                None
            }
        }
        Obstacle::Circle(cx, cy, r) => {
            let (fx, fy) = (ox - cx, oy - cy);
            let b = fx * dx + fy * dy;
            let c = fx * fx + fy * fy - r * r;
            let disc = b * b - c;
            if disc < 0.0 {
                return None;
            }
            let s = -b - disc.sqrt();
            if s >= 0.0 {
                Some(s)
            } else if c < 0.0 {
                Some(0.0)
            } else {
                None
            }
        }
    }
}

/// Clearance from a point to an obstacle.
fn clearance(o: &Obstacle, x: f64, y: f64) -> f64 {
    match *o {
        Obstacle::Seg(x1, y1, x2, y2) => {
            let (ex, ey) = (x2 - x1, y2 - y1);
            let l2 = ex * ex + ey * ey;
            let t = if l2 > 0.0 { (((x - x1) * ex + (y - y1) * ey) / l2).clamp(0.0, 1.0) } else { 0.0 };
            (x - x1 - t * ex).hypot(y - y1 - t * ey)
        }
        Obstacle::Circle(cx, cy, r) => (x - cx).hypot(y - cy) - r,
    }
}

fn wrap(a: f64) -> f64 {
    (a + PI).rem_euclid(2.0 * PI) - PI
}

pub fn mobile(ctx: &mut Ctx) -> Result<Dataset, String> {
    let mut obstacles: Vec<Obstacle> = Vec::new();
    let mut goals: Vec<(f64, f64)> = Vec::new();
    let mut robot = HashMap::new();
    let mut lidar = HashMap::new();
    let mut goal_r = 0.25;
    let mut odo_noise = 0.0;
    for (no, raw) in ctx.str("world", "").lines().enumerate() {
        let line = raw.split('#').next().unwrap().trim();
        if line.is_empty() {
            continue;
        }
        let err = |e: String| format!("world line {}: {e}", no + 1);
        let (head, rest) = line.split_once(':').ok_or_else(|| err("expected \"kind: …\"".into()))?;
        match head.trim().to_ascii_lowercase().as_str() {
            "arena" => {
                let kv = keyvals(rest).map_err(err)?;
                let (w, h) = (*kv.get("width").unwrap_or(&10.0), *kv.get("height").unwrap_or(&10.0));
                obstacles.extend([Obstacle::Seg(0.0, 0.0, w, 0.0), Obstacle::Seg(w, 0.0, w, h), Obstacle::Seg(w, h, 0.0, h), Obstacle::Seg(0.0, h, 0.0, 0.0)]);
            }
            "wall" => {
                let v = numbers(rest).map_err(err)?;
                if v.len() < 4 || v.len() % 2 != 0 {
                    return Err(err("wall: x1 y1 x2 y2 [x3 y3 …]".into()));
                }
                for k in (0..v.len() - 2).step_by(2) {
                    obstacles.push(Obstacle::Seg(v[k], v[k + 1], v[k + 2], v[k + 3]));
                }
            }
            "box" => {
                let v = numbers(rest).map_err(err)?;
                if v.len() != 4 {
                    return Err(err("box: x0 y0 x1 y1".into()));
                }
                let (a, b, c, d) = (v[0], v[1], v[2], v[3]);
                obstacles.extend([Obstacle::Seg(a, b, c, b), Obstacle::Seg(c, b, c, d), Obstacle::Seg(c, d, a, d), Obstacle::Seg(a, d, a, b)]);
            }
            "circle" => {
                let v = numbers(rest).map_err(err)?;
                if v.len() != 3 || v[2] <= 0.0 {
                    return Err(err("circle: cx cy r".into()));
                }
                obstacles.push(Obstacle::Circle(v[0], v[1], v[2]));
            }
            "goal" | "waypoints" => {
                let (pts, opts) = match rest.split_once(';') {
                    Some((p, o)) => (p, o),
                    None => (rest, ""),
                };
                for pair in pts.split(',') {
                    let v = numbers(pair).map_err(err)?;
                    if v.len() != 2 {
                        return Err(err("goal: x y (waypoints: x1 y1, x2 y2, …)".into()));
                    }
                    goals.push((v[0], v[1]));
                }
                if let Some(r) = keyvals(opts).map_err(err)?.get("radius") {
                    goal_r = *r;
                }
            }
            "robot" => robot = keyvals(rest).map_err(err)?,
            "lidar" => lidar = keyvals(rest).map_err(err)?,
            "odometry" => odo_noise = *keyvals(rest).map_err(err)?.get("noise").unwrap_or(&0.0),
            other => return Err(err(format!("unknown \"{other}\" (arena, wall, box, circle, goal, waypoints, robot, lidar, odometry)"))),
        }
    }
    let g = |m: &HashMap<String, f64>, k: &str, d: f64| *m.get(k).unwrap_or(&d);
    let radius = g(&robot, "radius", 0.2);
    let vmax = g(&robot, "vmax", 1.0);
    let wmax = g(&robot, "wmax", 3.0);
    let amax = g(&robot, "accel", 2.0);
    let alpha_max = g(&robot, "alpha", 10.0);
    let (mut x, mut y, mut th) = (g(&robot, "x", 1.0), g(&robot, "y", 1.0), g(&robot, "heading", 0.0).to_radians());
    let rays = g(&lidar, "rays", 9.0).round().clamp(1.0, 360.0) as usize;
    let fov = g(&lidar, "fov", 180.0).to_radians();
    let range = g(&lidar, "range", 4.0);
    let lnoise = g(&lidar, "noise", 0.0);
    let clear_d = g(&lidar, "clear", 1.0);
    let angles: Vec<f64> = (0..rays).map(|k| if rays == 1 { 0.0 } else { -fov / 2.0 + fov * k as f64 / (rays - 1) as f64 }).collect();
    for o in &obstacles {
        if clearance(o, x, y) < radius {
            return Err("the robot starts inside an obstacle".into());
        }
    }

    let mut inputs: Vec<String> = ["t", "dt", "x", "y", "th", "v", "w", "goal_dist", "goal_angle", "gx", "gy", "front", "left", "right", "bump", "range", "vmax", "wmax", "nearest", "nearest_angle", "gap_angle"].iter().map(|s| s.to_string()).collect();
    const FIXED: usize = 21;
    for k in 0..rays {
        inputs.push(format!("d{k}"));
    }
    let refs: Vec<&str> = inputs.iter().map(|s| s.as_str()).collect();
    let prog = Program::compile(&ctx.str("controller", ""), &refs)?;
    let (sv, sw) = (prog.slot("v").unwrap(), prog.slot("w").unwrap());
    if !prog.code.iter().any(|(s, _)| *s == sv) || !prog.code.iter().any(|(s, _)| *s == sw) {
        return Err("the controller must set v and w".into());
    }
    let user: Vec<usize> = (inputs.len()..prog.names.len()).collect();
    let consts = crate::expr::constants(&ctx.str("constants", ""))?;
    let mut vars = vec![0.0; prog.names.len()];
    // Constants are given as initial values of user names.
    for (name, v) in &consts {
        if let Some(s) = prog.slot(name) {
            vars[s] = *v;
        }
    }

    let t_end = ctx.positive("tEnd", 30.0)?;
    let dt = ctx.positive("dt", 0.05)?;
    let steps = ((t_end / dt).round() as usize).min(2_000_000);
    let stop = ctx.str("stopAtGoal", "true") != "false";
    let mut rng = Rng::new(ctx.int("seed", 1)? as u64);
    let (mut v, mut w) = (0.0, 0.0);
    let (mut ox, mut oy, mut oth) = (x, y, th);
    let mut goal_i = 0;
    let mut reached_at = f64::NAN;
    let mut collisions = 0;
    let mut bump = 0.0;
    let mut path_len = 0.0;
    let mut min_clear = f64::INFINITY;
    let mut stack = Vec::new();
    let mut cols: Vec<Vec<f64>> = vec![Vec::new(); 13 + user.len()];
    let mut last_scan = vec![range; rays];
    let mut reached_points = 0;
    for step in 0..=steps {
        let t = step as f64 * dt;
        // Sensors.
        let mut scan = vec![range; rays];
        for (k, a) in angles.iter().enumerate() {
            let (dx, dy) = ((th + a).cos(), (th + a).sin());
            let mut best = range;
            for o in &obstacles {
                if let Some(s) = ray(o, x, y, dx, dy) {
                    best = best.min(s);
                }
            }
            scan[k] = (best + if lnoise > 0.0 { lnoise * rng.normal() } else { 0.0 }).clamp(0.0, range);
        }
        let sector = |lo: f64, hi: f64| angles.iter().zip(&scan).filter(|(a, _)| **a >= lo && **a <= hi).map(|(_, d)| *d).fold(range, f64::min);
        let front = sector(-30f64.to_radians(), 30f64.to_radians());
        let left = sector(30f64.to_radians(), 120f64.to_radians());
        let right = sector(-120f64.to_radians(), -30f64.to_radians());
        let (gx, gy) = goals.get(goal_i).copied().unwrap_or((x, y));
        let goal_dist = if goals.is_empty() { 0.0 } else { (gx - x).hypot(gy - y) };
        let goal_angle = if goals.is_empty() { 0.0 } else { wrap((gy - y).atan2(gx - x) - th) };
        let clear = obstacles.iter().map(|o| clearance(o, x, y) - radius).fold(f64::INFINITY, f64::min);
        min_clear = min_clear.min(clear);
        // Record.
        for (k, val) in [t, x, y, th.to_degrees(), v, w, goal_dist, front, left, right, bump, ox, oy].into_iter().enumerate() {
            cols[k].push(val);
        }
        for (k, &s) in user.iter().enumerate() {
            cols[13 + k].push(vars[s]);
        }
        last_scan = scan.clone();
        if !goals.is_empty() && goal_dist < goal_r {
            reached_points = reached_points.max(goal_i + 1);
            if goal_i + 1 < goals.len() {
                goal_i += 1;
            } else if reached_at.is_nan() {
                reached_at = t;
                if stop {
                    break;
                }
            }
        }
        if step == steps {
            break;
        }
        // Controller.
        // The nearest return, and the open direction closest to the goal: a direction is open when no
        // lidar hit lies in the strip the robot would sweep along it (up to `clear`, or to the goal).
        let (mut nearest, mut nearest_angle) = (range, 0.0);
        for (a, d) in angles.iter().zip(&scan) {
            if *d < nearest {
                nearest = *d;
                nearest_angle = *a;
            }
        }
        let need = clear_d.min(goal_dist.max(radius * 2.0));
        let mut gap_angle = f64::NAN;
        let mut best = f64::INFINITY;
        for k in 0..rays {
            let open = (0..rays).all(|j| {
                if scan[j] >= range {
                    return true;
                }
                let da = angles[j] - angles[k];
                let along = scan[j] * da.cos();
                let lateral = (scan[j] * da.sin()).abs();
                !(along > -radius && along < need + radius && lateral < radius * 1.6)
            });
            if open {
                let off = (angles[k] - goal_angle).abs();
                if off < best {
                    best = off;
                    gap_angle = angles[k];
                }
            }
        }
        if gap_angle.is_nan() {
            // Nothing open: the farthest-seeing ray.
            gap_angle = angles.iter().zip(&scan).fold((0.0, -1.0), |acc, (a, d)| if *d > acc.1 { (*a, *d) } else { acc }).0;
        }
        let ins = [t, dt, ox, oy, oth, v, w, goal_dist, goal_angle, gx, gy, front, left, right, bump, range, vmax, wmax, nearest, nearest_angle, gap_angle];
        vars[..FIXED].copy_from_slice(&ins);
        vars[FIXED..FIXED + rays].copy_from_slice(&scan);
        prog.run(&mut vars, &mut stack);
        let (vc, wc) = (vars[sv], vars[sw]);
        if !vc.is_finite() || !wc.is_finite() {
            return Err(format!("the controller gave v = {vc}, w = {wc} at t = {t:.3}"));
        }
        // Actuators: speed and acceleration limits.
        v += (vc.clamp(-vmax, vmax) - v).clamp(-amax * dt, amax * dt);
        w += (wc.clamp(-wmax, wmax) - w).clamp(-alpha_max * dt, alpha_max * dt);
        // Motion in substeps; a collision stops the robot where it touched.
        let sub = 4;
        let h = dt / sub as f64;
        bump = 0.0;
        for _ in 0..sub {
            let nth = th + w * h;
            let nx = x + v * h * ((th + nth) / 2.0).cos();
            let ny = y + v * h * ((th + nth) / 2.0).sin();
            if obstacles.iter().any(|o| clearance(o, nx, ny) < radius) {
                // Move up to the contact point (bisection), so pushing on stays one contact.
                let (mut lo, mut hi) = (0.0, 1.0);
                for _ in 0..30 {
                    let f = (lo + hi) / 2.0;
                    let (cx, cy) = (x + f * (nx - x), y + f * (ny - y));
                    if obstacles.iter().any(|o| clearance(o, cx, cy) < radius) {
                        hi = f;
                    } else {
                        lo = f;
                    }
                }
                let (cx, cy) = (x + lo * (nx - x), y + lo * (ny - y));
                path_len += (cx - x).hypot(cy - y);
                x = cx;
                y = cy;
                bump = 1.0;
                th = nth;
                v = 0.0;
                break;
            }
            path_len += (nx - x).hypot(ny - y);
            x = nx;
            y = ny;
            th = nth;
        }
        if bump > 0.0 && cols[10].last() == Some(&0.0) {
            collisions += 1;
        }
        // Odometry (dead reckoning with noise).
        let n = if odo_noise > 0.0 { 1.0 + odo_noise * rng.normal() } else { 1.0 };
        let dth = w * dt * if odo_noise > 0.0 { 1.0 + odo_noise * rng.normal() } else { 1.0 };
        ox += v * dt * n * (oth + dth / 2.0).cos();
        oy += v * dt * n * (oth + dth / 2.0).sin();
        oth += dth;
        if step % 2000 == 0 {
            ctx.check()?;
        }
    }
    th = wrap(th);
    let mut d = Dataset::default();
    let mut traj = Table::new("trajectory").with_x(Column::new("t", "s", std::mem::take(&mut cols[0])));
    for (k, (name, unit)) in [("x", "m"), ("y", "m"), ("heading", "°"), ("v", "m/s"), ("w", "rad/s"), ("goal distance", "m"), ("front", "m"), ("left", "m"), ("right", "m"), ("bump", ""), ("x odometry", "m"), ("y odometry", "m")].into_iter().enumerate() {
        traj.push(Column::new(name, unit, std::mem::take(&mut cols[k + 1])));
    }
    for (k, &s) in user.iter().enumerate() {
        traj.push(Column::new(&prog.names[s], "", std::mem::take(&mut cols[13 + k])));
    }
    // The map: walls, obstacles, goals and the path in one x–y table (NaN breaks the lines).
    let (mut mx, mut walls, mut path, mut marks) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut put = |px: f64, w: f64, p: f64, m: f64| {
        mx.push(px);
        walls.push(w);
        path.push(p);
        marks.push(m);
    };
    let nan = f64::NAN;
    for o in &obstacles {
        match *o {
            Obstacle::Seg(x1, y1, x2, y2) => {
                put(x1, y1, nan, nan);
                put(x2, y2, nan, nan);
            }
            Obstacle::Circle(cx, cy, r) => {
                for k in 0..=36 {
                    let a = 2.0 * PI * k as f64 / 36.0;
                    put(cx + r * a.cos(), cy + r * a.sin(), nan, nan);
                }
            }
        }
        put(nan, nan, nan, nan);
    }
    let px = traj.column("x").unwrap().values.clone();
    let py = traj.column("y").unwrap().values.clone();
    for (a, b) in px.iter().zip(&py) {
        put(*a, nan, *b, nan);
    }
    put(nan, nan, nan, nan);
    // Goals as rings of the goal radius, the start as a small cross.
    for (gx, gy) in &goals {
        for k in 0..=24 {
            let a = 2.0 * PI * k as f64 / 24.0;
            put(gx + goal_r * a.cos(), nan, nan, gy + goal_r * a.sin());
        }
        put(nan, nan, nan, nan);
    }
    let c = radius.max(0.1);
    put(px[0] - c, nan, nan, py[0] - c);
    put(px[0] + c, nan, nan, py[0] + c);
    put(nan, nan, nan, nan);
    put(px[0] - c, nan, nan, py[0] + c);
    put(px[0] + c, nan, nan, py[0] - c);
    let mut map = Table::new("map").with_x(Column::new("x", "m", mx));
    map.push(Column::new("walls", "m", walls));
    map.push(Column::new("path", "m", path));
    map.push(Column::new("goals", "m", marks));
    let mut scan_t = Table::new("lidar").with_x(Column::new("angle", "°", angles.iter().map(|a| a.to_degrees()).collect()));
    scan_t.push(Column::new("distance", "m", last_scan.clone()));
    scan_t.push(Column::new("hit x", "m", angles.iter().zip(&last_scan).map(|(a, r)| x + r * (th + a).cos()).collect()));
    scan_t.push(Column::new("hit y", "m", angles.iter().zip(&last_scan).map(|(a, r)| y + r * (th + a).sin()).collect()));
    let end = traj.x_column().unwrap().values.last().copied().unwrap_or(0.0);
    d.scalar("reached", if reached_at.is_nan() { 0.0 } else { 1.0 }, "");
    d.scalar("time to goal", reached_at, "s");
    d.scalar("waypoints reached", reached_points as f64, "");
    d.scalar("path length", path_len, "m");
    d.scalar("collisions", collisions as f64, "");
    d.scalar("min clearance", min_clear, "m");
    d.scalar("mean speed", if end > 0.0 { path_len / end } else { 0.0 }, "m/s");
    if let Some((gx, gy)) = goals.last() {
        d.scalar("final goal distance", (gx - x).hypot(gy - y), "m");
    }
    d.scalar("odometry error", (ox - x).hypot(oy - y), "m");
    if !goals.is_empty() && reached_at.is_nan() {
        ctx.warn("the robot did not reach the goal in time");
    }
    d.tables.push(map);
    d.tables.push(traj);
    d.tables.push(scan_t);
    Ok(d)
}

// ───────────────────────── planar arm

struct Arm {
    len: Vec<f64>,
    mass: Vec<f64>,
    payload: f64,
    g: f64,
    damping: f64,
}

impl Arm {
    fn n(&self) -> usize {
        self.len.len()
    }

    /// Absolute link angles.
    fn phi(&self, q: &[f64]) -> Vec<f64> {
        let mut s = 0.0;
        q.iter().map(|a| {
            s += a;
            s
        }).collect()
    }

    /// Joint positions (base, joint 2, …, tip).
    fn points(&self, q: &[f64]) -> Vec<(f64, f64)> {
        let phi = self.phi(q);
        let mut p = vec![(0.0, 0.0)];
        let (mut x, mut y) = (0.0, 0.0);
        for i in 0..self.n() {
            x += self.len[i] * phi[i].cos();
            y += self.len[i] * phi[i].sin();
            p.push((x, y));
        }
        p
    }

    /// Jacobian of a point at distance `r` along link i: (∂x/∂q, ∂y/∂q).
    fn jac(&self, phi: &[f64], i: usize, r: f64) -> (Vec<f64>, Vec<f64>) {
        let n = self.n();
        let (mut jx, mut jy) = (vec![0.0; n], vec![0.0; n]);
        for j in 0..=i {
            for k in j..=i {
                let l = if k == i { r } else { self.len[k] };
                jx[j] -= l * phi[k].sin();
                jy[j] += l * phi[k].cos();
            }
        }
        (jx, jy)
    }

    fn mass_matrix(&self, q: &[f64]) -> Mat {
        let n = self.n();
        let phi = self.phi(q);
        let mut m = vec![vec![0.0; n]; n];
        for i in 0..n {
            let (jx, jy) = self.jac(&phi, i, self.len[i] / 2.0);
            let inertia = self.mass[i] * self.len[i] * self.len[i] / 12.0;
            for a in 0..n {
                for b in 0..n {
                    let w = if a <= i && b <= i { inertia } else { 0.0 };
                    m[a][b] += self.mass[i] * (jx[a] * jx[b] + jy[a] * jy[b]) + w;
                }
            }
        }
        if self.payload > 0.0 {
            let (jx, jy) = self.jac(&phi, n - 1, self.len[n - 1]);
            for a in 0..n {
                for b in 0..n {
                    m[a][b] += self.payload * (jx[a] * jx[b] + jy[a] * jy[b]);
                }
            }
        }
        m
    }

    fn gravity(&self, q: &[f64]) -> Vec<f64> {
        let n = self.n();
        let phi = self.phi(q);
        let mut gv = vec![0.0; n];
        for i in 0..n {
            let (_, jy) = self.jac(&phi, i, self.len[i] / 2.0);
            for a in 0..n {
                gv[a] += self.mass[i] * self.g * jy[a];
            }
        }
        if self.payload > 0.0 {
            let (_, jy) = self.jac(&phi, n - 1, self.len[n - 1]);
            for a in 0..n {
                gv[a] += self.payload * self.g * jy[a];
            }
        }
        gv
    }

    /// Coriolis and centrifugal terms from the derivatives of M (central differences).
    fn bias(&self, q: &[f64], qd: &[f64]) -> Vec<f64> {
        let n = self.n();
        let eps = 1e-6;
        let dm: Vec<Mat> = (0..n).map(|k| {
            let mut a = q.to_vec();
            let mut b = q.to_vec();
            a[k] += eps;
            b[k] -= eps;
            let (ma, mb) = (self.mass_matrix(&a), self.mass_matrix(&b));
            (0..n).map(|i| (0..n).map(|j| (ma[i][j] - mb[i][j]) / (2.0 * eps)).collect()).collect()
        }).collect();
        (0..n).map(|i| {
            let mut s = 0.0;
            for k in 0..n {
                for j in 0..n {
                    s += dm[k][i][j] * qd[k] * qd[j] - 0.5 * dm[i][j][k] * qd[j] * qd[k];
                }
            }
            s
        }).collect()
    }

    fn accel(&self, q: &[f64], qd: &[f64], tau: &[f64]) -> Result<Vec<f64>, String> {
        if !q.iter().chain(qd).chain(tau).all(|v| v.is_finite()) {
            return Err("the simulation blew up (stiff gains for light links? use a smaller dt or lower Kd)".into());
        }
        let m = self.mass_matrix(q);
        let c = self.bias(q, qd);
        let gv = self.gravity(q);
        let rhs: Vec<f64> = (0..self.n()).map(|i| tau[i] - c[i] - gv[i] - self.damping * qd[i]).collect();
        solve(&m, &rhs)
    }

    fn energy(&self, q: &[f64], qd: &[f64]) -> f64 {
        let m = self.mass_matrix(q);
        let n = self.n();
        let ke: f64 = 0.5 * (0..n).map(|i| (0..n).map(|j| qd[i] * m[i][j] * qd[j]).sum::<f64>()).sum::<f64>();
        let phi = self.phi(q);
        let mut pe = 0.0;
        let mut y = 0.0;
        for i in 0..n {
            pe += self.mass[i] * self.g * (y + self.len[i] / 2.0 * phi[i].sin());
            y += self.len[i] * phi[i].sin();
        }
        pe + self.payload * self.g * y + ke
    }

    /// Damped least-squares inverse kinematics from `q` towards the tip target.
    fn ik(&self, q: &[f64], tx: f64, ty: f64) -> Vec<f64> {
        let n = self.n();
        let mut q = q.to_vec();
        for _ in 0..30 {
            let p = *self.points(&q).last().unwrap();
            let (ex, ey) = (tx - p.0, ty - p.1);
            if ex.hypot(ey) < 1e-9 {
                break;
            }
            let phi = self.phi(&q);
            let (jx, jy) = self.jac(&phi, n - 1, self.len[n - 1]);
            // dq = Jᵀ (J Jᵀ + λ² I)⁻¹ e
            let lam = 1e-3;
            let a = jx.iter().map(|v| v * v).sum::<f64>() + lam;
            let b = jx.iter().zip(&jy).map(|(p, q)| p * q).sum::<f64>();
            let c = jy.iter().map(|v| v * v).sum::<f64>() + lam;
            let det = a * c - b * b;
            if det.abs() < 1e-18 {
                break;
            }
            let (fx, fy) = ((c * ex - b * ey) / det, (a * ey - b * ex) / det);
            for k in 0..n {
                q[k] += jx[k] * fx + jy[k] * fy;
            }
        }
        q
    }
}

pub fn arm(ctx: &mut Ctx) -> Result<Dataset, String> {
    let mut len = Vec::new();
    let mut mass = Vec::new();
    let mut payload = 0.0;
    let mut kv_all = HashMap::new();
    for (no, raw) in ctx.str("arm", "").lines().enumerate() {
        let line = raw.split('#').next().unwrap().trim();
        if line.is_empty() {
            continue;
        }
        let err = |e: String| format!("arm line {}: {e}", no + 1);
        let (head, rest) = line.split_once(':').ok_or_else(|| err("expected \"link: length = …, mass = …\"".into()))?;
        let kv = keyvals(rest).map_err(err)?;
        match head.trim().to_ascii_lowercase().as_str() {
            "link" => {
                let l = *kv.get("length").ok_or_else(|| err("link needs length =".into()))?;
                if !(l > 0.0) {
                    return Err(err("length must be positive".into()));
                }
                len.push(l);
                mass.push(*kv.get("mass").unwrap_or(&1.0));
            }
            "payload" => payload = *kv.get("mass").unwrap_or(&0.0),
            _ => kv_all.extend(kv),
        }
    }
    if len.is_empty() || len.len() > 8 {
        return Err("the arm needs 1 … 8 links (link: length = 0.5, mass = 2)".into());
    }
    let n = len.len();
    let arm = Arm { len, mass, payload, g: ctx.num("gravity", 9.81)?, damping: ctx.num("damping", 0.0)? };
    let parse_list = |key: &str, d: f64| -> Result<Vec<f64>, String> {
        let s = ctx.str(key, "");
        let v: Vec<f64> = numbers(&s)?;
        Ok((0..n).map(|i| *v.get(i).or(v.last()).unwrap_or(&d)).collect())
    };
    let mut q: Vec<f64> = parse_list("q0", 0.0)?.iter().map(|a| a.to_radians()).collect();
    let mut qd = vec![0.0; n];
    let mode = ctx.str("mode", "free");
    let kp = parse_list("kp", 100.0)?;
    let kd = parse_list("kd", 20.0)?;
    let ki = parse_list("ki", 0.0)?;
    let tmax = parse_list("tmax", f64::INFINITY)?;
    let gcomp = ctx.str("gravityComp", "true") != "false";
    // Targets: q1 … qn (degrees) or x, y of the tip, as functions of t.
    let tnames = ["t".to_string()];
    let targets_text = ctx.str("targets", "");
    let mut texprs: HashMap<String, Expr> = HashMap::new();
    for s in statements(&targets_text) {
        let (k, v) = s.split_once('=').ok_or_else(|| format!("target \"{s}\" is not name = expression"))?;
        texprs.insert(k.trim().to_string(), Expr::with_names(v, &tnames).map_err(|e| format!("{}: {e}", k.trim()))?);
    }
    let cart = mode == "cartesian";
    if cart && !(texprs.contains_key("x") && texprs.contains_key("y")) {
        return Err("Cartesian mode needs targets x = … and y = …".into());
    }
    if mode == "joint" {
        for i in 1..=n {
            if !texprs.contains_key(&format!("q{i}")) {
                return Err(format!("joint mode needs a target q{i} = … (degrees)"));
            }
        }
    }
    let t_end = ctx.positive("tEnd", 5.0)?;
    let dt = ctx.positive("dt", 0.001)?;
    let steps = ((t_end / dt).round() as usize).min(5_000_000);
    let every = (steps / 4000).max(1);
    let mut integ = vec![0.0; n];
    let mut q_ref_prev: Option<Vec<f64>> = None;
    let target_q = |t: f64, q: &[f64]| -> Vec<f64> {
        if cart {
            let tx = texprs["x"].value(&[t]);
            let ty = texprs["y"].value(&[t]);
            arm.ik(q, tx, ty)
        } else {
            (1..=n).map(|i| texprs.get(&format!("q{i}")).map(|e| e.value(&[t]).to_radians()).unwrap_or(0.0)).collect()
        }
    };
    let e0 = arm.energy(&q, &qd);
    let mut rows: Vec<Vec<f64>> = Vec::new();
    let mut tip_rows: Vec<[f64; 5]> = Vec::new();
    let mut max_tau = vec![0.0f64; n];
    let mut err_sq = 0.0;
    let mut err_n = 0.0;
    let mut snapshots: Vec<Vec<(f64, f64)>> = Vec::new();
    let snap_every = (steps / 12).max(1);
    let mut q_ik = q.clone();
    for step in 0..=steps {
        let t = step as f64 * dt;
        let (q_ref, qd_ref) = if mode == "free" {
            (q.clone(), vec![0.0; n])
        } else {
            let r = target_q(t, &q_ik);
            q_ik = r.clone();
            let rd = match &q_ref_prev {
                Some(p) => (0..n).map(|i| (r[i] - p[i]) / dt).collect(),
                None => vec![0.0; n],
            };
            q_ref_prev = Some(r.clone());
            (r, rd)
        };
        let mut tau = vec![0.0; n];
        if mode != "free" {
            let gv = arm.gravity(&q);
            for i in 0..n {
                let e = q_ref[i] - q[i];
                integ[i] += e * dt;
                tau[i] = (kp[i] * e + kd[i] * (qd_ref[i] - qd[i]) + ki[i] * integ[i] + if gcomp { gv[i] } else { 0.0 }).clamp(-tmax[i], tmax[i]);
                max_tau[i] = max_tau[i].max(tau[i].abs());
            }
        }
        let tip = *arm.points(&q).last().unwrap();
        let tip_ref = if mode == "free" { (f64::NAN, f64::NAN) } else { *arm.points(&q_ref).last().unwrap() };
        if mode != "free" && t >= t_end * 0.2 {
            let e = if cart { (tip.0 - tip_ref.0).hypot(tip.1 - tip_ref.1) } else { (0..n).map(|i| (q_ref[i] - q[i]).to_degrees().powi(2)).sum::<f64>().sqrt() };
            err_sq += e * e;
            err_n += 1.0;
        }
        if step % every == 0 || step == steps {
            let mut r = vec![t];
            r.extend(q.iter().map(|a| a.to_degrees()));
            r.extend(qd.iter().map(|a| a.to_degrees()));
            r.extend(tau.iter());
            r.extend(q_ref.iter().map(|a| a.to_degrees()));
            r.push(arm.energy(&q, &qd));
            rows.push(r);
            tip_rows.push([t, tip.0, tip.1, tip_ref.0, tip_ref.1]);
        }
        if step % snap_every == 0 || step == steps {
            snapshots.push(arm.points(&q));
        }
        if step == steps {
            break;
        }
        // RK4 with the torque held over the step.
        let f = |q: &[f64], qd: &[f64]| -> Result<(Vec<f64>, Vec<f64>), String> { Ok((qd.to_vec(), arm.accel(q, qd, &tau)?)) };
        let add = |a: &[f64], b: &[f64], h: f64| -> Vec<f64> { a.iter().zip(b).map(|(x, y)| x + h * y).collect() };
        let (k1q, k1v) = f(&q, &qd)?;
        let (k2q, k2v) = f(&add(&q, &k1q, dt / 2.0), &add(&qd, &k1v, dt / 2.0))?;
        let (k3q, k3v) = f(&add(&q, &k2q, dt / 2.0), &add(&qd, &k2v, dt / 2.0))?;
        let (k4q, k4v) = f(&add(&q, &k3q, dt), &add(&qd, &k3v, dt))?;
        for i in 0..n {
            q[i] += dt / 6.0 * (k1q[i] + 2.0 * k2q[i] + 2.0 * k3q[i] + k4q[i]);
            qd[i] += dt / 6.0 * (k1v[i] + 2.0 * k2v[i] + 2.0 * k3v[i] + k4v[i]);
        }
        if !q.iter().chain(&qd).all(|v| v.is_finite()) {
            return Err(format!("the simulation blew up at t = {t:.4} s (smaller dt?)"));
        }
        if step % 1000 == 0 {
            ctx.check()?;
            ctx.report(step as f64 / steps as f64, "arm");
        }
    }
    let mut d = Dataset::default();
    let col = |k: usize| rows.iter().map(|r| r[k]).collect::<Vec<f64>>();
    let mut joints = Table::new("joints").with_x(Column::new("t", "s", col(0)));
    for i in 0..n {
        joints.push(Column::new(&format!("q{}", i + 1), "°", col(1 + i)));
    }
    for i in 0..n {
        joints.push(Column::new(&format!("dq{}", i + 1), "°/s", col(1 + n + i)));
    }
    if mode != "free" {
        for i in 0..n {
            joints.push(Column::new(&format!("tau{}", i + 1), "N·m", col(1 + 2 * n + i)));
        }
        for i in 0..n {
            joints.push(Column::new(&format!("q{} target", i + 1), "°", col(1 + 3 * n + i)));
        }
    }
    joints.push(Column::new("energy", "J", col(1 + 4 * n)));
    let mut tip = Table::new("tip").with_x(Column::new("t", "s", tip_rows.iter().map(|r| r[0]).collect()));
    tip.push(Column::new("x", "m", tip_rows.iter().map(|r| r[1]).collect()));
    tip.push(Column::new("y", "m", tip_rows.iter().map(|r| r[2]).collect()));
    if mode != "free" {
        tip.push(Column::new("x target", "m", tip_rows.iter().map(|r| r[3]).collect()));
        tip.push(Column::new("y target", "m", tip_rows.iter().map(|r| r[4]).collect()));
    }
    // Poses: the arm at a dozen moments and the tip's path, as one x–y table.
    let (mut px, mut arm_y, mut path_y) = (Vec::new(), Vec::new(), Vec::new());
    for s in &snapshots {
        for p in s {
            px.push(p.0);
            arm_y.push(p.1);
            path_y.push(f64::NAN);
        }
        px.push(f64::NAN);
        arm_y.push(f64::NAN);
        path_y.push(f64::NAN);
    }
    for r in &tip_rows {
        px.push(r[1]);
        arm_y.push(f64::NAN);
        path_y.push(r[2]);
    }
    let mut poses = Table::new("poses").with_x(Column::new("x", "m", px));
    poses.push(Column::new("arm", "m", arm_y));
    poses.push(Column::new("tip path", "m", path_y));
    let e1 = arm.energy(&q, &qd);
    d.scalar("energy drift", if e0.abs() > 1e-12 { (e1 - e0) / e0.abs() * 100.0 } else { e1 - e0 }, "%");
    for i in 0..n {
        d.scalar(&format!("q{} (end)", i + 1), q[i].to_degrees(), "°");
        if mode != "free" {
            d.scalar(&format!("tau{} max", i + 1), max_tau[i], "N·m");
        }
    }
    let tp = *arm.points(&q).last().unwrap();
    d.scalar("tip x (end)", tp.0, "m");
    d.scalar("tip y (end)", tp.1, "m");
    if mode != "free" && err_n > 0.0 {
        d.scalar(if cart { "rms tip error" } else { "rms joint error" }, (err_sq / err_n).sqrt(), if cart { "m" } else { "°" });
    }
    d.scalar("reach", arm.len.iter().sum(), "m");
    d.tables.push(poses);
    d.tables.push(joints);
    d.tables.push(tip);
    Ok(d)
}
