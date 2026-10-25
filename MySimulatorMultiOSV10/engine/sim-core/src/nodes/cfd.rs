//! 2D incompressible flow (the Fluent / COMSOL CFD way): the Navier–Stokes
//! equations on a staggered (MAC) grid by Chorin's projection, with heat
//! transport and buoyancy (Boussinesq) for natural convection.
//!
//! ```text
//! domain: width = 1, height = 1, nx = 64, ny = 64
//! fluid: rho = 1, mu = 0.01            # or nu = …; k, cp for heat; beta, Tref for buoyancy
//! gravity: 0 -9.81
//! top: wall, u = 1                     # a moving lid
//! left: inlet, u = 1, profile = parabolic, T = 20
//! right: outlet                        # p = 0, zero gradient
//! bottom: wall, T = 60                 # wall | slip | inlet | outlet; T = value or insulated
//! obstacle cyl: circle 2 0.5 0.1, T = 80
//! obstacle box: rect 3 0 3.2 0.3
//! ```
//!
//! Steps march in time (a stable explicit step) to `tEnd` or until the flow is
//! steady. Results: speed, pressure, vorticity, stream function and temperature
//! maps, centre lines, arrows, forces on obstacles (drag, lift), flow rates and the
//! heat through each wall (Nusselt number).

use super::fem::Csr;
use crate::data::{Column, Dataset, Grid, Table};
use crate::expr::Expr;
use crate::Ctx;

#[derive(Clone, Copy, Debug, PartialEq)]
enum Side {
    Wall,
    Slip,
    Inlet,
    Outlet,
}

#[derive(Clone, Debug)]
struct Bc {
    side: Side,
    /// Wall speed along the wall (walls), or the inflow speed (inlets).
    speed: f64,
    parabolic: bool,
    temp: Option<f64>,
}

#[derive(Clone, Debug)]
enum Shape {
    Rect(f64, f64, f64, f64),
    Circle(f64, f64, f64),
}

struct Obstacle {
    name: String,
    shape: Shape,
    temp: Option<f64>,
}

fn eval(text: &str) -> Result<f64, String> {
    Expr::with_names(text.trim(), &[]).map(|e| e.value(&[])).map_err(|e| format!("\"{}\": {e}", text.trim()))
}

fn kv(text: &str) -> Result<(Vec<String>, Vec<(String, String)>), String> {
    let mut words = Vec::new();
    let mut pairs = Vec::new();
    for item in text.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if let Some((k, v)) = item.split_once('=') {
            pairs.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
        } else {
            words.extend(item.split_whitespace().map(|s| s.to_ascii_lowercase()));
        }
    }
    Ok((words, pairs))
}

fn get(p: &[(String, String)], k: &str) -> Option<String> {
    p.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone())
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    // ── the model
    let (mut w, mut h, mut nx, mut ny) = (1.0, 1.0, 40usize, 40usize);
    let (mut rho, mut mu, mut kf, mut cp, mut beta, mut tref) = (1.0, 0.01, 0.0, 1.0, 0.0, 0.0);
    let mut g = (0.0, 0.0);
    let wall = Bc { side: Side::Wall, speed: 0.0, parabolic: false, temp: None };
    let mut bcs = [wall.clone(), wall.clone(), wall.clone(), wall]; // left right bottom top
    let mut obstacles: Vec<Obstacle> = Vec::new();
    let mut nu_given = None;
    for (no, raw) in ctx.str("model", "").lines().enumerate() {
        let line = raw.split('#').next().unwrap().trim();
        if line.is_empty() {
            continue;
        }
        let err = |e: String| format!("line {}: {e}", no + 1);
        let (head, body) = line.split_once(':').ok_or_else(|| err("expected \"key: …\"".into()))?;
        let mut hw = head.split_whitespace();
        let key = hw.next().unwrap_or("").to_ascii_lowercase();
        let name = hw.next().unwrap_or("").to_string();
        let (words, p) = kv(body).map_err(err)?;
        let num = |k: &str, d: f64| -> Result<f64, String> { get(&p, k).map(|v| eval(&v)).transpose().map(|v| v.unwrap_or(d)).map_err(err) };
        match key.as_str() {
            "domain" => {
                w = num("width", w)?;
                h = num("height", h)?;
                nx = num("nx", nx as f64)?.round() as usize;
                ny = num("ny", ny as f64)?.round() as usize;
                if !(w > 0.0 && h > 0.0) || !(4..=400).contains(&nx) || !(4..=400).contains(&ny) || nx * ny > 60_000 {
                    return Err(err("width, height > 0; nx, ny 4 … 400 (nx·ny ≤ 60000)".into()));
                }
            }
            "fluid" => {
                rho = num("rho", rho)?;
                mu = num("mu", mu)?;
                nu_given = get(&p, "nu").map(|v| eval(&v)).transpose().map_err(err)?;
                kf = num("k", kf)?;
                cp = num("cp", cp)?;
                beta = num("beta", beta)?;
                tref = num("tref", tref)?;
                if let Some(a) = get(&p, "alpha").map(|v| eval(&v)).transpose().map_err(err)? {
                    // thermal diffusivity given directly: k = α ρ cp
                    kf = a * rho * cp;
                }
            }
            "gravity" => {
                let v: Vec<f64> = body.split_whitespace().map(eval).collect::<Result<_, _>>().map_err(err)?;
                if v.len() != 2 {
                    return Err(err("gravity: gx gy".into()));
                }
                g = (v[0], v[1]);
            }
            "left" | "right" | "bottom" | "top" => {
                let k = ["left", "right", "bottom", "top"].iter().position(|s| *s == key).unwrap();
                let side = match words.first().map(|s| s.as_str()) {
                    Some("wall") | None => Side::Wall,
                    Some("slip") | Some("symmetry") => Side::Slip,
                    Some("inlet") | Some("inflow") => Side::Inlet,
                    Some("outlet") | Some("outflow") => Side::Outlet,
                    Some(o) => return Err(err(format!("\"{o}\": wall, slip, inlet or outlet"))),
                };
                let temp = match get(&p, "t") {
                    Some(v) => Some(eval(&v).map_err(err)?),
                    None => None,
                };
                bcs[k] = Bc { side, speed: num("u", num("v", 0.0)?)?, parabolic: get(&p, "profile").is_some_and(|v| v.starts_with("parab")), temp };
            }
            "obstacle" => {
                let shape_text = words.join(" ");
                let mut it = shape_text.split_whitespace();
                let kind = it.next().unwrap_or("");
                let v: Vec<f64> = it.map(eval).collect::<Result<_, _>>().map_err(err)?;
                let shape = match (kind, v.len()) {
                    ("rect", 4) => Shape::Rect(v[0].min(v[2]), v[1].min(v[3]), v[0].max(v[2]), v[1].max(v[3])),
                    ("circle", 3) => Shape::Circle(v[0], v[1], v[2]),
                    _ => return Err(err("obstacle name: rect x0 y0 x1 y1 | circle cx cy r".into())),
                };
                let temp = match get(&p, "t") {
                    Some(v) => Some(eval(&v).map_err(err)?),
                    None => None,
                };
                obstacles.push(Obstacle { name: if name.is_empty() { format!("obstacle {}", obstacles.len() + 1) } else { name }, shape, temp });
            }
            other => return Err(err(format!("unknown \"{other}\" (domain, fluid, gravity, left, right, bottom, top, obstacle)"))),
        }
    }
    let nu = nu_given.unwrap_or(mu / rho);
    if !(nu > 0.0) {
        return Err("the viscosity must be positive".into());
    }
    let mu = nu * rho;
    let thermal = kf > 0.0 || bcs.iter().any(|b| b.temp.is_some()) || obstacles.iter().any(|o| o.temp.is_some());
    let alpha = if kf > 0.0 { kf / (rho * cp) } else { nu / 0.71 };
    let (dx, dy) = (w / nx as f64, h / ny as f64);
    // Solid cells.
    let mut solid = vec![false; nx * ny];
    let mut owner = vec![usize::MAX; nx * ny];
    for j in 0..ny {
        for i in 0..nx {
            let (x, y) = ((i as f64 + 0.5) * dx, (j as f64 + 0.5) * dy);
            for (k, o) in obstacles.iter().enumerate() {
                let inside = match o.shape {
                    Shape::Rect(x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1,
                    Shape::Circle(cx, cy, r) => (x - cx).hypot(y - cy) <= r,
                };
                if inside {
                    solid[j * nx + i] = true;
                    owner[j * nx + i] = k;
                }
            }
        }
    }
    let fluid = |i: i64, j: i64| i >= 0 && j >= 0 && (i as usize) < nx && (j as usize) < ny && !solid[j as usize * nx + i as usize];
    // u[i][j]: x = i·dx, y = (j + ½)dy, i = 0 … nx; v[i][j]: x = (i + ½)dx, y = j·dy, j = 0 … ny.
    let ui = |i: usize, j: usize| j * (nx + 1) + i;
    let vi = |i: usize, j: usize| j * nx + i;
    let mut u = vec![0.0; (nx + 1) * ny];
    let mut v = vec![0.0; nx * (ny + 1)];
    let mut tt = vec![tref; nx * ny];
    if let Ok(t0) = ctx.num("T0", f64::NAN) {
        if t0.is_finite() {
            tt.iter_mut().for_each(|x| *x = t0);
        }
    }
    // Inflow profile along a side: uniform or parabolic (mean = speed).
    let inflow = |b: &Bc, s: f64| if b.parabolic { 6.0 * b.speed * s * (1.0 - s) } else { b.speed };
    let set_bc = |u: &mut Vec<f64>, v: &mut Vec<f64>| {
        for j in 0..ny {
            let s = (j as f64 + 0.5) / ny as f64;
            // left face i = 0, right face i = nx
            u[ui(0, j)] = match bcs[0].side {
                Side::Inlet => inflow(&bcs[0], s),
                Side::Outlet => u[ui(1, j)],
                _ => 0.0,
            };
            u[ui(nx, j)] = match bcs[1].side {
                Side::Inlet => -inflow(&bcs[1], s),
                Side::Outlet => u[ui(nx - 1, j)],
                _ => 0.0,
            };
        }
        for i in 0..nx {
            let s = (i as f64 + 0.5) / nx as f64;
            v[vi(i, 0)] = match bcs[2].side {
                Side::Inlet => inflow(&bcs[2], s),
                Side::Outlet => v[vi(i, 1)],
                _ => 0.0,
            };
            v[vi(i, ny)] = match bcs[3].side {
                Side::Inlet => -inflow(&bcs[3], s),
                Side::Outlet => v[vi(i, ny - 1)],
                _ => 0.0,
            };
        }
        // Faces touching a solid cell are walls.
        for j in 0..ny {
            for i in 1..nx {
                if !fluid(i as i64 - 1, j as i64) || !fluid(i as i64, j as i64) {
                    u[ui(i, j)] = 0.0;
                }
            }
        }
        for j in 1..ny {
            for i in 0..nx {
                if !fluid(i as i64, j as i64 - 1) || !fluid(i as i64, j as i64) {
                    v[vi(i, j)] = 0.0;
                }
            }
        }
    };
    // Neighbour of a u-face across y (j ± 1): a ghost by the wall condition when it is not fluid.
    let u_nb = |u: &[f64], i: usize, j: usize, dj: i64| -> f64 {
        let jn = j as i64 + dj;
        let c = u[ui(i, j)];
        if jn < 0 || jn >= ny as i64 {
            let b = if jn < 0 { &bcs[2] } else { &bcs[3] };
            return match b.side {
                Side::Wall => 2.0 * b.speed - c,
                Side::Slip | Side::Outlet => c,
                Side::Inlet => -c,
            };
        }
        let jn = jn as usize;
        let open = (i == 0 || fluid(i as i64 - 1, jn as i64)) && (i == nx || fluid(i as i64, jn as i64));
        if open {
            u[ui(i, jn)]
        } else {
            -c
        }
    };
    let v_nb = |v: &[f64], i: usize, j: usize, di: i64| -> f64 {
        let inn = i as i64 + di;
        let c = v[vi(i, j)];
        if inn < 0 || inn >= nx as i64 {
            let b = if inn < 0 { &bcs[0] } else { &bcs[1] };
            return match b.side {
                Side::Wall => 2.0 * b.speed - c,
                Side::Slip | Side::Outlet => c,
                Side::Inlet => -c,
            };
        }
        let inn = inn as usize;
        let open = (j == 0 || fluid(inn as i64, j as i64 - 1)) && (j == ny || fluid(inn as i64, j as i64));
        if open {
            v[vi(inn, j)]
        } else {
            -c
        }
    };
    // ── the pressure Poisson matrix (fixed): unknowns are the fluid cells.
    let mut eq = vec![usize::MAX; nx * ny];
    let mut n_eq = 0;
    for c in 0..nx * ny {
        if !solid[c] {
            eq[c] = n_eq;
            n_eq += 1;
        }
    }
    let has_outlet = bcs.iter().any(|b| b.side == Side::Outlet);
    let mut trip = Vec::new();
    for j in 0..ny {
        for i in 0..nx {
            let c = j * nx + i;
            if solid[c] {
                continue;
            }
            let r = eq[c];
            let mut diag = 0.0;
            for (di, dj, hh, side) in [(-1i64, 0i64, dx, 0usize), (1, 0, dx, 1), (0, -1, dy, 2), (0, 1, dy, 3)] {
                let (a, b) = (i as i64 + di, j as i64 + dj);
                let inside = a >= 0 && b >= 0 && (a as usize) < nx && (b as usize) < ny;
                if inside {
                    if fluid(a, b) {
                        let k = 1.0 / (hh * hh);
                        diag += k;
                        trip.push((r, eq[b as usize * nx + a as usize], -k));
                    }
                } else if bcs[side].side == Side::Outlet {
                    // p = 0 on the outlet face.
                    diag += 2.0 / (hh * hh);
                }
            }
            trip.push((r, r, diag));
        }
    }
    if !has_outlet {
        // A closed box: the pressure is fixed in the first fluid cell (its level is free).
        trip.push((0, 0, 1.0 / (dx * dy)));
    }
    let pmat = Csr::from(n_eq, trip);
    let mut p = vec![0.0; n_eq];
    // ── time stepping
    let t_end = ctx.positive("tEnd", 10.0)?;
    let tau = ctx.num("cfl", 0.5)?.clamp(0.05, 0.9);
    let steady_tol = ctx.num("steady", 1e-5)?;
    let gamma = 0.5; // donor-cell blending
    let max_steps = ctx.count("maxSteps", 200_000, 1, 10_000_000)?;
    let ubound = {
        let mut m: f64 = 1e-9;
        for b in &bcs {
            m = m.max(b.speed.abs() * if b.parabolic { 1.5 } else { 1.0 });
        }
        m
    };
    set_bc(&mut u, &mut v);
    let mut t = 0.0;
    let mut steps = 0usize;
    let mut hist: Vec<[f64; 3]> = Vec::new();
    let mut steady = false;
    let mut f = vec![0.0; u.len()];
    let mut gg = vec![0.0; v.len()];
    let mut rhs = vec![0.0; n_eq];
    while t < t_end - 1e-12 && steps < max_steps {
        let umax = u.iter().fold(ubound, |m, x| m.max(x.abs()));
        let vmax = v.iter().fold(ubound, |m, x| m.max(x.abs()));
        let diff = nu.max(if thermal { alpha } else { 0.0 });
        let mut dt = tau * (0.5 / diff / (1.0 / (dx * dx) + 1.0 / (dy * dy))).min(dx / umax).min(dy / vmax);
        dt = dt.min(t_end - t);
        // F and G: tentative velocities.
        f.copy_from_slice(&u);
        gg.copy_from_slice(&v);
        for j in 0..ny {
            for i in 1..nx {
                if !fluid(i as i64 - 1, j as i64) || !fluid(i as i64, j as i64) {
                    continue;
                }
                let c = u[ui(i, j)];
                let (ue, uw) = (u[ui(i + 1, j)], u[ui(i - 1, j)]);
                let (un, us) = (u_nb(&u, i, j, 1), u_nb(&u, i, j, -1));
                let lap = (ue - 2.0 * c + uw) / (dx * dx) + (un - 2.0 * c + us) / (dy * dy);
                let (a_e, a_w) = ((c + ue) / 2.0, (uw + c) / 2.0);
                let du2 = (a_e * a_e - a_w * a_w) / dx + gamma / dx * (a_e.abs() * (c - ue) / 2.0 - a_w.abs() * (uw - c) / 2.0);
                let (vt, vb) = ((v[vi(i - 1, j + 1)] + v[vi(i, j + 1)]) / 2.0, (v[vi(i - 1, j)] + v[vi(i, j)]) / 2.0);
                let duv = (vt * (c + un) / 2.0 - vb * (us + c) / 2.0) / dy + gamma / dy * (vt.abs() * (c - un) / 2.0 - vb.abs() * (us - c) / 2.0);
                let mut fx = g.0;
                if thermal && beta != 0.0 {
                    let tf = (tt[j * nx + i - 1] + tt[j * nx + i]) / 2.0;
                    fx = -beta * (tf - tref) * g.0;
                }
                f[ui(i, j)] = c + dt * (nu * lap - du2 - duv + if beta != 0.0 { fx } else { 0.0 });
            }
        }
        for j in 1..ny {
            for i in 0..nx {
                if !fluid(i as i64, j as i64 - 1) || !fluid(i as i64, j as i64) {
                    continue;
                }
                let c = v[vi(i, j)];
                let (vn, vs) = (v[vi(i, j + 1)], v[vi(i, j - 1)]);
                let (ve, vw) = (v_nb(&v, i, j, 1), v_nb(&v, i, j, -1));
                let lap = (ve - 2.0 * c + vw) / (dx * dx) + (vn - 2.0 * c + vs) / (dy * dy);
                let (a_n, a_s) = ((c + vn) / 2.0, (vs + c) / 2.0);
                let dv2 = (a_n * a_n - a_s * a_s) / dy + gamma / dy * (a_n.abs() * (c - vn) / 2.0 - a_s.abs() * (vs - c) / 2.0);
                let (ur, ul) = ((u[ui(i + 1, j - 1)] + u[ui(i + 1, j)]) / 2.0, (u[ui(i, j - 1)] + u[ui(i, j)]) / 2.0);
                let duv = (ur * (c + ve) / 2.0 - ul * (vw + c) / 2.0) / dx + gamma / dx * (ur.abs() * (c - ve) / 2.0 - ul.abs() * (vw - c) / 2.0);
                // Buoyancy (Boussinesq): −β (T − Tref) g; with no buoyancy, gravity goes into the pressure.
                let fy = if thermal && beta != 0.0 {
                    let tf = (tt[(j - 1) * nx + i] + tt[j * nx + i]) / 2.0;
                    -beta * (tf - tref) * g.1
                } else {
                    0.0
                };
                gg[vi(i, j)] = c + dt * (nu * lap - dv2 - duv + fy);
            }
        }
        // Pressure: ∇²p = ∇·(F, G) / dt (Neumann at walls and inlets, p = 0 at outlets).
        for j in 0..ny {
            for i in 0..nx {
                let c = j * nx + i;
                if solid[c] {
                    continue;
                }
                rhs[eq[c]] = -((f[ui(i + 1, j)] - f[ui(i, j)]) / dx + (gg[vi(i, j + 1)] - gg[vi(i, j)]) / dy) / dt;
            }
        }
        if !has_outlet {
            rhs[0] = 0.0;
        }
        pmat.solve_to(&rhs, &mut p, ctx, 1e-7)?;
        let pc = |i: i64, j: i64| -> Option<f64> {
            if i < 0 || j < 0 || i >= nx as i64 || j >= ny as i64 {
                return None;
            }
            let c = j as usize * nx + i as usize;
            if solid[c] {
                None
            } else {
                Some(p[eq[c]])
            }
        };
        let mut change = 0.0f64;
        for j in 0..ny {
            for i in 1..nx {
                if let (Some(a), Some(b)) = (pc(i as i64 - 1, j as i64), pc(i as i64, j as i64)) {
                    let nu_ = f[ui(i, j)] - dt * (b - a) / dx;
                    change = change.max((nu_ - u[ui(i, j)]).abs());
                    u[ui(i, j)] = nu_;
                }
            }
        }
        for j in 1..ny {
            for i in 0..nx {
                if let (Some(a), Some(b)) = (pc(i as i64, j as i64 - 1), pc(i as i64, j as i64)) {
                    let nv = gg[vi(i, j)] - dt * (b - a) / dy;
                    change = change.max((nv - v[vi(i, j)]).abs());
                    v[vi(i, j)] = nv;
                }
            }
        }
        set_bc(&mut u, &mut v);
        // Heat: upwind advection, central diffusion (ghost cells from the wall conditions).
        if thermal {
            let old = tt.clone();
            let tg = |i: i64, j: i64, ci: usize, cj: usize| -> f64 {
                let c = old[cj * nx + ci];
                if i < 0 || j < 0 || i >= nx as i64 || j >= ny as i64 {
                    let b = if i < 0 { &bcs[0] } else if i >= nx as i64 { &bcs[1] } else if j < 0 { &bcs[2] } else { &bcs[3] };
                    return match (b.side, b.temp) {
                        (_, Some(tw)) => 2.0 * tw - c,
                        _ => c,
                    };
                }
                let k = j as usize * nx + i as usize;
                if solid[k] {
                    return match obstacles[owner[k]].temp {
                        Some(tw) => 2.0 * tw - c,
                        None => c,
                    };
                }
                old[k]
            };
            for j in 0..ny {
                for i in 0..nx {
                    let c = j * nx + i;
                    if solid[c] {
                        continue;
                    }
                    let (ii, jj) = (i as i64, j as i64);
                    let (te, tw_, tn, ts) = (tg(ii + 1, jj, i, j), tg(ii - 1, jj, i, j), tg(ii, jj + 1, i, j), tg(ii, jj - 1, i, j));
                    let tc = old[c];
                    let lap = (te - 2.0 * tc + tw_) / (dx * dx) + (tn - 2.0 * tc + ts) / (dy * dy);
                    let (ue, uw) = (u[ui(i + 1, j)], u[ui(i, j)]);
                    let (vn, vs) = (v[vi(i, j + 1)], v[vi(i, j)]);
                    // Upwind fluxes through the four faces.
                    let fe = ue * if ue > 0.0 { tc } else { te };
                    let fw = uw * if uw > 0.0 { tw_ } else { tc };
                    let fnn = vn * if vn > 0.0 { tc } else { tn };
                    let fs = vs * if vs > 0.0 { ts } else { tc };
                    tt[c] = tc + dt * (alpha * lap - (fe - fw) / dx - (fnn - fs) / dy);
                }
            }
        }
        t += dt;
        steps += 1;
        if steps % 10 == 0 || t >= t_end - 1e-12 {
            let ke: f64 = 0.5 * rho * (u.iter().map(|x| x * x).sum::<f64>() * dx * dy + v.iter().map(|x| x * x).sum::<f64>() * dx * dy);
            hist.push([t, ke, change / dt]);
        }
        if steps % 50 == 0 {
            ctx.check()?;
            ctx.report(t / t_end, "flow");
        }
        if steady_tol > 0.0 && steps > 50 && change / dt < steady_tol * ubound.max(1e-9) {
            steady = true;
            break;
        }
    }
    // ── results at the cell centres
    let mut d = Dataset::default();
    let cu = |i: usize, j: usize| (u[ui(i, j)] + u[ui(i + 1, j)]) / 2.0;
    let cv = |i: usize, j: usize| (v[vi(i, j)] + v[vi(i, j + 1)]) / 2.0;
    let nan_if = |c: usize, x: f64| if solid[c] { f64::NAN } else { x };
    let mut speed = vec![0.0; nx * ny];
    let mut ux = vec![0.0; nx * ny];
    let mut vy = vec![0.0; nx * ny];
    let mut pres = vec![0.0; nx * ny];
    let mut vort = vec![0.0; nx * ny];
    for j in 0..ny {
        for i in 0..nx {
            let c = j * nx + i;
            ux[c] = nan_if(c, cu(i, j));
            vy[c] = nan_if(c, cv(i, j));
            speed[c] = nan_if(c, cu(i, j).hypot(cv(i, j)));
            pres[c] = if solid[c] { f64::NAN } else { p[eq[c]] * rho };
            // ω = ∂v/∂x − ∂u/∂y (central, from the cell-centred velocities)
            let dvdx = if i > 0 && i + 1 < nx { (cv(i + 1, j) - cv(i - 1, j)) / (2.0 * dx) } else { 0.0 };
            let dudy = if j > 0 && j + 1 < ny { (cu(i, j + 1) - cu(i, j - 1)) / (2.0 * dy) } else { 0.0 };
            vort[c] = nan_if(c, dvdx - dudy);
        }
    }
    // Stream function at the corners by integrating u up each column: ψ(x, y) = ∫ u dy.
    let mut psi = vec![0.0; (nx + 1) * (ny + 1)];
    for i in 0..=nx {
        for j in 0..ny {
            psi[(j + 1) * (nx + 1) + i] = psi[j * (nx + 1) + i] + u[ui(i, j)] * dy;
        }
        if i < nx {
            // keep the columns consistent: ψ(i+1, 0) = ψ(i, 0) − v(i, 0) dx
            psi[i + 1] = psi[i] - v[vi(i, 0)] * dx;
        }
    }
    let xs: Vec<f64> = (0..nx).map(|i| (i as f64 + 0.5) * dx).collect();
    let ys: Vec<f64> = (0..ny).map(|j| (j as f64 + 0.5) * dy).collect();
    let grid = |name: &str, z: Vec<f64>, unit: &str| Grid { name: name.into(), x: xs.clone(), y: ys.clone(), z, x_label: "x (m)".into(), y_label: "y (m)".into(), z_label: format!("{name} ({unit})"), x_names: None, y_names: None };
    d.grids.push(grid("speed", speed.clone(), "m/s"));
    d.grids.push(grid("pressure", pres, "Pa"));
    d.grids.push(grid("vorticity", vort, "1/s"));
    d.grids.push(Grid {
        name: "stream function".into(),
        x: (0..=nx).map(|i| i as f64 * dx).collect(),
        y: (0..=ny).map(|j| j as f64 * dy).collect(),
        z: psi,
        x_label: "x (m)".into(),
        y_label: "y (m)".into(),
        z_label: "ψ (m²/s)".into(),
        x_names: None,
        y_names: None,
    });
    if thermal {
        d.grids.push(grid("temperature", (0..nx * ny).map(|c| nan_if(c, tt[c])).collect(), "°C"));
    }
    d.grids.push(grid("u", ux.clone(), "m/s"));
    d.grids.push(grid("v", vy.clone(), "m/s"));
    // Centre lines (the classic comparison with the cavity benchmark).
    let ic = nx / 2;
    let jc = ny / 2;
    let at_x = |vals: &dyn Fn(usize, usize) -> f64, j: usize| if nx % 2 == 0 { (vals(ic - 1, j) + vals(ic, j)) / 2.0 } else { vals(ic, j) };
    let at_y = |vals: &dyn Fn(usize, usize) -> f64, i: usize| if ny % 2 == 0 { (vals(i, jc - 1) + vals(i, jc)) / 2.0 } else { vals(i, jc) };
    let mut vline = Table::new("vertical centre line").with_x(Column::new("y", "m", ys.clone()));
    vline.push(Column::new("u", "m/s", (0..ny).map(|j| at_x(&cu, j)).collect()));
    if thermal {
        let tc = |i: usize, j: usize| tt[j * nx + i];
        vline.push(Column::new("T", "°C", (0..ny).map(|j| at_x(&tc, j)).collect()));
    }
    let mut hline = Table::new("horizontal centre line").with_x(Column::new("x", "m", xs.clone()));
    hline.push(Column::new("v", "m/s", (0..nx).map(|i| at_y(&cv, i)).collect()));
    hline.push(Column::new("u", "m/s", (0..nx).map(|i| at_y(&cu, i)).collect()));
    {
        let pp = |i: usize, j: usize| if solid[j * nx + i] { f64::NAN } else { p[eq[j * nx + i]] * rho };
        hline.push(Column::new("p", "Pa", (0..nx).map(|i| at_y(&pp, i)).collect()));
    }
    // Arrows: short segments from sampled cell centres (NaN breaks), for an x–y chart.
    let stride = ((nx.max(ny)) / 24).max(1);
    let vmax_c = speed.iter().cloned().filter(|s| s.is_finite()).fold(1e-12, f64::max);
    let len = 0.9 * stride as f64 * dx.min(dy) / vmax_c;
    let (mut ax, mut ay) = (Vec::new(), Vec::new());
    for j in (stride / 2..ny).step_by(stride) {
        for i in (stride / 2..nx).step_by(stride) {
            let c = j * nx + i;
            if solid[c] {
                continue;
            }
            let (x0, y0) = (xs[i], ys[j]);
            let (x1, y1) = (x0 + ux[c] * len, y0 + vy[c] * len);
            // shaft and a small head
            let (hx, hy) = ((x1 - x0) * 0.3, (y1 - y0) * 0.3);
            ax.extend([x0, x1, f64::NAN, x1 - hx - hy * 0.5, x1, x1 - hx + hy * 0.5, f64::NAN]);
            ay.extend([y0, y1, f64::NAN, y1 - hy + hx * 0.5, y1, y1 - hy - hx * 0.5, f64::NAN]);
        }
    }
    // Obstacle outlines in the same table.
    let mut ob_x = Vec::new();
    let mut ob_y = Vec::new();
    for o in &obstacles {
        match o.shape {
            Shape::Rect(x0, y0, x1, y1) => {
                ob_x.extend([x0, x1, x1, x0, x0, f64::NAN]);
                ob_y.extend([y0, y0, y1, y1, y0, f64::NAN]);
            }
            Shape::Circle(cx, cy, r) => {
                for k in 0..=40 {
                    let a = 2.0 * std::f64::consts::PI * k as f64 / 40.0;
                    ob_x.push(cx + r * a.cos());
                    ob_y.push(cy + r * a.sin());
                }
                ob_x.push(f64::NAN);
                ob_y.push(f64::NAN);
            }
        }
    }
    let na = ax.len();
    let mut arrows = Table::new("arrows").with_x(Column::new("x", "m", ax.into_iter().chain(ob_x.iter().cloned()).collect()));
    arrows.push(Column::new("velocity", "m", ay.into_iter().chain(std::iter::repeat_n(f64::NAN, ob_x.len())).collect()));
    arrows.push(Column::new("obstacles", "m", std::iter::repeat_n(f64::NAN, na).chain(ob_y).collect()));
    let mut ht = Table::new("history").with_x(Column::new("t", "s", hist.iter().map(|r| r[0]).collect()));
    ht.push(Column::new("kinetic energy", "J/m", hist.iter().map(|r| r[1]).collect()));
    ht.push(Column::new("residual", "1/s", hist.iter().map(|r| r[2]).collect()));
    // Forces on obstacles: pressure on the faces of their cells plus wall shear (per metre of depth).
    let pcell = |i: usize, j: usize| if solid[j * nx + i] { None } else { Some(p[eq[j * nx + i]] * rho) };
    let mut ob_rows: Vec<(String, f64, f64, f64)> = Vec::new();
    for (k, o) in obstacles.iter().enumerate() {
        let (mut fx, mut fy) = (0.0, 0.0);
        let mut heat = 0.0;
        for j in 0..ny {
            for i in 0..nx {
                if owner[j * nx + i] != k {
                    continue;
                }
                // Each fluid neighbour pushes on this solid cell.
                if i > 0 {
                    if let Some(pp) = pcell(i - 1, j) {
                        fx += pp * dy;
                        fy += mu * cv(i - 1, j) / (dx / 2.0) * dy;
                        if thermal {
                            if let Some(tw) = o.temp {
                                heat += kf * (tw - tt[j * nx + i - 1]) / (dx / 2.0) * dy;
                            }
                        }
                    }
                }
                if i + 1 < nx {
                    if let Some(pp) = pcell(i + 1, j) {
                        fx -= pp * dy;
                        fy += mu * cv(i + 1, j) / (dx / 2.0) * dy;
                        if thermal {
                            if let Some(tw) = o.temp {
                                heat += kf * (tw - tt[j * nx + i + 1]) / (dx / 2.0) * dy;
                            }
                        }
                    }
                }
                if j > 0 {
                    if let Some(pp) = pcell(i, j - 1) {
                        fy += pp * dx;
                        fx += mu * cu(i, j - 1) / (dy / 2.0) * dx;
                        if thermal {
                            if let Some(tw) = o.temp {
                                heat += kf * (tw - tt[(j - 1) * nx + i]) / (dy / 2.0) * dx;
                            }
                        }
                    }
                }
                if j + 1 < ny {
                    if let Some(pp) = pcell(i, j + 1) {
                        fy -= pp * dx;
                        fx += mu * cu(i, j + 1) / (dy / 2.0) * dx;
                        if thermal {
                            if let Some(tw) = o.temp {
                                heat += kf * (tw - tt[(j + 1) * nx + i]) / (dy / 2.0) * dx;
                            }
                        }
                    }
                }
            }
        }
        ob_rows.push((o.name.clone(), fx, fy, heat));
    }
    // A reference speed and length: the fastest boundary speed, the domain height.
    let uref = ubound;
    let lref = h;
    d.scalar("Reynolds number", uref * lref / nu, "");
    d.scalar("max speed", speed.iter().cloned().filter(|s| s.is_finite()).fold(0.0, f64::max), "m/s");
    d.scalar("time", t, "s");
    d.scalar("steps", steps as f64, "");
    d.scalar("steady", if steady { 1.0 } else { 0.0 }, "");
    for (name, fx, fy, heat) in &ob_rows {
        d.scalar(&format!("drag ({name})"), *fx, "N/m");
        d.scalar(&format!("lift ({name})"), *fy, "N/m");
        if let Some(Shape::Circle(_, _, r)) = obstacles.iter().find(|o| &o.name == name).map(|o| o.shape.clone()) {
            d.scalar(&format!("Cd ({name})"), fx / (0.5 * rho * uref * uref * 2.0 * r), "");
        }
        if thermal {
            d.scalar(&format!("heat out ({name})"), *heat, "W/m");
        }
    }
    // Flow through the sides and heat through the walls (Nusselt number for walls held at a temperature).
    for (k, side) in ["left", "right", "bottom", "top"].iter().enumerate() {
        let q: f64 = if k < 2 {
            let i = if k == 0 { 0 } else { nx };
            (0..ny).map(|j| u[ui(i, j)] * dy).sum::<f64>() * if k == 0 { 1.0 } else { -1.0 }
        } else {
            let j = if k == 2 { 0 } else { ny };
            (0..nx).map(|i| v[vi(i, j)] * dx).sum::<f64>() * if k == 2 { 1.0 } else { -1.0 }
        };
        if matches!(bcs[k].side, Side::Inlet | Side::Outlet) {
            d.scalar(&format!("flow in ({side})"), q, "m²/s");
        }
        if thermal {
            if let Some(tw) = bcs[k].temp {
                let flux: f64 = if k < 2 {
                    let i = if k == 0 { 0 } else { nx - 1 };
                    (0..ny).filter(|&j| !solid[j * nx + i]).map(|j| kf * (tw - tt[j * nx + i]) / (dx / 2.0) * dy).sum()
                } else {
                    let j = if k == 2 { 0 } else { ny - 1 };
                    (0..nx).filter(|&i| !solid[j * nx + i]).map(|i| kf * (tw - tt[j * nx + i]) / (dy / 2.0) * dx).sum()
                };
                d.scalar(&format!("heat in ({side})"), flux, "W/m");
                // Nusselt number against the other wall held at a temperature (a heated cavity).
                if let Some(other) = (0..4).filter(|&o| o != k).find_map(|o| bcs[o].temp) {
                    if (tw - other).abs() > 0.0 && kf > 0.0 {
                        let span = if k < 2 { h } else { w };
                        let gap = if k < 2 { w } else { h };
                        d.scalar(&format!("Nusselt ({side})"), flux.abs() * gap / (kf * (tw - other).abs() * span), "");
                    }
                }
            }
        }
    }
    if thermal && beta != 0.0 {
        let tvals: Vec<f64> = bcs.iter().filter_map(|b| b.temp).chain(obstacles.iter().filter_map(|o| o.temp)).collect();
        if tvals.len() >= 2 {
            let dt_ = tvals.iter().cloned().fold(f64::NEG_INFINITY, f64::max) - tvals.iter().cloned().fold(f64::INFINITY, f64::min);
            let gmag = g.0.hypot(g.1);
            d.scalar("Rayleigh number", gmag * beta * dt_ * lref.powi(3) / (nu * alpha), "");
            d.scalar("Prandtl number", nu / alpha, "");
        }
    }
    if !steady && steady_tol > 0.0 {
        ctx.warn(format!("not steady by t = {t:.3} s (a longer run, or the flow is unsteady)"));
    }
    let mut ot = Table::new("obstacles");
    if !ob_rows.is_empty() {
        ot.push(Column::text("obstacle", ob_rows.iter().map(|r| r.0.clone()).collect()));
        ot.push(Column::new("drag", "N/m", ob_rows.iter().map(|r| r.1).collect()));
        ot.push(Column::new("lift", "N/m", ob_rows.iter().map(|r| r.2).collect()));
    }
    d.tables.push(vline);
    d.tables.push(hline);
    d.tables.push(arrows);
    d.tables.push(ht);
    if !ob_rows.is_empty() {
        d.tables.push(ot);
    }
    Ok(d)
}
