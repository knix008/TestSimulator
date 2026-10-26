//! Dynamics and control: ODE systems written as equations, transfer
//! functions (step/impulse response, Bode/Nyquist with stability margins),
//! a PID loop around a plant and state-space models.

use crate::data::{interp, Column, Dataset, Table};
use crate::expr::{constants, number_list, statements, valid_name, Expr};
use crate::fft::C64;
use crate::linalg::{self, matvec, Mat};
use crate::ode::{integrate, Method, Options};
use crate::Ctx;
use std::f64::consts::PI;

/// An input signal u(t) from a connected table (linear interpolation; 0 when none).
fn input_signal(ctx: &Ctx, port: &str, column_key: &str) -> Result<Option<(Vec<f64>, Vec<f64>)>, String> {
    match ctx.input(port) {
        None => Ok(None),
        Some(d) => {
            let t = d.pick_table("")?;
            let x = t.pick_x("");
            let y = t.pick(&ctx.str(column_key, ""))?;
            Ok(Some((x.values.clone(), y.values.clone())))
        }
    }
}

fn options(ctx: &Ctx, default_end: f64, default_dt: f64) -> Result<Options, String> {
    let method = Method::parse(&ctx.str("method", "rk45"))?;
    let rtol = ctx.positive("tolerance", 1e-6)?;
    Ok(Options {
        method,
        t0: ctx.num("tStart", 0.0)?,
        t_end: ctx.num("tEnd", default_end)?,
        dt: ctx.positive("dt", default_dt)?,
        substeps: ctx.count("substeps", 10, 1, 100_000)?,
        rtol,
        atol: rtol * 1e-3,
    })
}

/// Replaces every `delay(x, τ)` (or `lag(x, τ)`) in an equation by a slot name
/// `__lagK`; `found` collects the (state name, τ expression) pairs.
fn extract_delays(text: &str, found: &mut Vec<(String, String)>) -> Result<String, String> {
    let mut out = String::new();
    let mut rest = text;
    loop {
        let pos = ["delay(", "lag("]
            .iter()
            .filter_map(|k| {
                let mut from = 0;
                while let Some(p) = rest[from..].find(k) {
                    let at = from + p;
                    let before = rest[..at].chars().last();
                    if before.is_none_or(|c| !(c.is_alphanumeric() || c == '_')) {
                        return Some((at, k.len()));
                    }
                    from = at + 1;
                }
                None
            })
            .min();
        let Some((at, klen)) = pos else {
            out.push_str(rest);
            return Ok(out);
        };
        out.push_str(&rest[..at]);
        let body_start = at + klen;
        let mut depth = 1;
        let mut end = None;
        for (i, c) in rest[body_start..].char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(body_start + i);
                        break;
                    }
                }
                _ => {}
            }
        }
        let end = end.ok_or_else(|| "a delay( … ) is not closed".to_string())?;
        let body = &rest[body_start..end];
        let (state, tau) = body.split_once(',').ok_or_else(|| format!("delay({body}) needs a state and a delay: delay(x, 1)"))?;
        let key = (state.trim().to_string(), tau.trim().to_string());
        let k = match found.iter().position(|f| *f == key) {
            Some(k) => k,
            None => {
                found.push(key);
                found.len() - 1
            }
        };
        out.push_str(&format!("__lag{k}"));
        rest = &rest[end + 1..];
    }
}

/// One event line: "expression[, falling|rising|both][, stop | x = …, v = …]".
struct EventLine {
    expr: Expr,
    direction: i32,
    terminal: bool,
    resets: Vec<(usize, Expr)>,
    text: String,
}

/// x' = f(t, x, u): "x' = v", "v' = -k/m*x - c/m*v + u/m"; lines without ' are helper values (also output).
/// delay(x, τ) reads a state τ seconds earlier (delay equations, as dde23); event lines
/// locate zero crossings and stop the run or reset states (a bouncing ball).
pub fn ode(ctx: &mut Ctx) -> Result<Dataset, String> {
    let consts = constants(&ctx.str("constants", ""))?;
    let mut lags_found: Vec<(String, String)> = Vec::new();
    let text = extract_delays(&ctx.str("equations", ""), &mut lags_found)?;
    let mut states: Vec<(String, String)> = Vec::new();
    let mut aux: Vec<(String, String)> = Vec::new();
    for stmt in statements(&text) {
        let (lhs, rhs) = stmt.split_once('=').ok_or_else(|| format!("\"{stmt}\" is not an equation (x' = …)"))?;
        let lhs = lhs.trim();
        let state = lhs
            .strip_suffix('\'')
            .or_else(|| lhs.strip_prefix("d").and_then(|r| r.strip_suffix("/dt")))
            .or_else(|| lhs.strip_prefix("der(").and_then(|r| r.strip_suffix(')')));
        match state {
            Some(name) => {
                let name = name.trim().to_string();
                if !valid_name(&name) {
                    return Err(format!("\"{name}\" cannot be a state name"));
                }
                states.push((name, rhs.trim().to_string()));
            }
            None => {
                if !valid_name(lhs) {
                    return Err(format!("\"{lhs}\" cannot be a name"));
                }
                aux.push((lhs.to_string(), rhs.trim().to_string()));
            }
        }
    }
    if states.is_empty() {
        return Err("write at least one equation like x' = -x".into());
    }
    let init = constants(&ctx.str("initial", ""))?;
    for (name, _) in &init {
        if !states.iter().any(|(s, _)| s == name) {
            ctx.warn(format!("the initial value of \"{name}\" belongs to no state"));
        }
    }
    let x0: Vec<f64> = states.iter().map(|(s, _)| init.iter().find(|(n, _)| n == s).map(|(_, v)| *v).unwrap_or(0.0)).collect();
    // The delays: which state and how long (an expression of the constants).
    let cnames: Vec<String> = consts.iter().map(|(n, _)| n.clone()).collect();
    let cvals: Vec<f64> = consts.iter().map(|(_, v)| *v).collect();
    let mut lags = Vec::new();
    for (state, tau) in &lags_found {
        let s = states.iter().position(|(n, _)| n == state).ok_or_else(|| format!("delay({state}, …): \"{state}\" is not a state"))?;
        let lag = Expr::with_names(tau, &cnames).map_err(|e| format!("delay({state}, {tau}): {e}"))?.value(&cvals);
        lags.push(crate::ode::Lag { state: s, lag });
    }
    // Slots: t, u, constants, states, delayed values, helper values.
    let mut names = vec!["t".to_string(), "u".to_string()];
    names.extend(cnames.iter().cloned());
    let s0 = names.len();
    names.extend(states.iter().map(|(n, _)| n.clone()));
    let l0 = names.len();
    names.extend((0..lags.len()).map(|k| format!("__lag{k}")));
    let a0 = names.len();
    names.extend(aux.iter().map(|(n, _)| n.clone()));
    let aux_e: Vec<Expr> = aux.iter().map(|(_, src)| Expr::with_names(src, &names)).collect::<Result<_, _>>()?;
    let der_e: Vec<Expr> = states.iter().map(|(_, src)| Expr::with_names(src, &names)).collect::<Result<_, _>>()?;
    let mut event_lines: Vec<EventLine> = Vec::new();
    for line in ctx.str("events", "").lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
        let parts: Vec<&str> = line.split(',').map(str::trim).collect();
        let expr = Expr::with_names(parts[0], &names).map_err(|e| format!("event \"{line}\": {e}"))?;
        let mut ev = EventLine { expr, direction: 0, terminal: false, resets: Vec::new(), text: parts[0].to_string() };
        for part in &parts[1..] {
            match part.to_ascii_lowercase().as_str() {
                "falling" | "down" | "-1" => ev.direction = -1,
                "rising" | "up" | "+1" | "1" => ev.direction = 1,
                "both" | "0" => ev.direction = 0,
                "stop" | "terminal" => ev.terminal = true,
                _ => {
                    let (lhs, rhs) = part.split_once('=').ok_or_else(|| format!("event \"{line}\": \"{part}\" is not falling, rising, stop or state = value"))?;
                    let s = states.iter().position(|(n, _)| n == lhs.trim()).ok_or_else(|| format!("event \"{line}\": \"{}\" is not a state", lhs.trim()))?;
                    ev.resets.push((s, Expr::with_names(rhs, &names).map_err(|e| format!("event \"{line}\": {e}"))?));
                }
            }
        }
        event_lines.push(ev);
    }
    if !lags.is_empty() && !event_lines.is_empty() {
        return Err("events and delays cannot be used together".into());
    }
    let u = input_signal(ctx, "u", "uColumn")?;
    let mut opt = options(ctx, 10.0, 0.01)?;
    let mut base = vec![0.0; names.len()];
    for (i, (_, v)) in consts.iter().enumerate() {
        base[2 + i] = *v;
    }
    let n = states.len();
    let nl = lags.len();
    let eval_into = |t: f64, x: &[f64], z: &[f64], vals: &mut Vec<f64>, stack: &mut Vec<f64>| {
        vals[0] = t;
        vals[1] = match &u {
            Some((ut, uy)) => interp(ut, uy, t),
            None => 0.0,
        };
        vals[s0..s0 + n].copy_from_slice(x);
        vals[l0..l0 + nl].copy_from_slice(&z[..nl]);
        for (k, e) in aux_e.iter().enumerate() {
            let v = e.eval(vals, stack);
            vals[a0 + k] = v;
        }
    };
    let cancel = ctx.cancel;
    let mut hits: Vec<(usize, f64, Vec<f64>)> = Vec::new();
    let mut warning = None;
    let (mut steps, mut rejected) = (0usize, 0usize);
    let (mut ts, mut xs): (Vec<f64>, Vec<Vec<f64>>) = (Vec::new(), vec![Vec::new(); n]);
    let mut zs: Vec<Vec<f64>> = Vec::new();
    if !lags.is_empty() {
        if opt.method.adaptive() {
            ctx.warn("delay equations are integrated with RK4 over the stored history (the adaptive method is not used)");
        }
        let mut vals = base.clone();
        let mut stack = Vec::with_capacity(32);
        let mut f = |t: f64, x: &[f64], z: &[f64], dx: &mut [f64]| {
            eval_into(t, x, z, &mut vals, &mut stack);
            for (k, e) in der_e.iter().enumerate() {
                dx[k] = e.eval(&vals, &mut stack);
            }
        };
        let sol = crate::ode::integrate_dde(&mut f, &x0, &lags, &opt, &|| cancel())?;
        // The delayed values on the output grid, for the helper columns.
        for &t in &sol.t {
            zs.push(lags.iter().map(|l| if t - l.lag <= sol.t[0] { x0[l.state] } else { interp(&sol.t, &sol.x[l.state], t - l.lag) }).collect());
        }
        warning = sol.warning;
        steps = sol.steps;
        ts = sol.t;
        xs = sol.x;
    } else {
        // An event with resets restarts the integration there; a stop ends it.
        let mut x = x0.clone();
        let t_end = opt.t_end;
        let mut restarts = 0;
        loop {
            let mut vals = base.clone();
            let mut stack = Vec::with_capacity(32);
            let mut f = |t: f64, x: &[f64], dx: &mut [f64]| {
                eval_into(t, x, &[], &mut vals, &mut stack);
                for (k, e) in der_e.iter().enumerate() {
                    dx[k] = e.eval(&vals, &mut stack);
                }
            };
            let vals_cell = std::cell::RefCell::new(base.clone());
            let eval_ref = &eval_into;
            let mut evs: Vec<crate::ode::Event> = event_lines
                .iter()
                .map(|ev| {
                    let vals_cell = &vals_cell;
                    crate::ode::Event {
                        g: Box::new(move |t: f64, x: &[f64]| {
                            let mut vals = vals_cell.borrow_mut();
                            let mut stack = Vec::new();
                            eval_ref(t, x, &[], &mut vals, &mut stack);
                            ev.expr.eval(&vals, &mut stack)
                        }),
                        direction: ev.direction,
                        terminal: ev.terminal || !ev.resets.is_empty(),
                    }
                })
                .collect();
            let sol = crate::ode::integrate_events(&mut f, &x, &opt, &mut evs, &|| cancel(), &mut |_| {})?;
            drop(evs);
            steps += sol.steps;
            rejected += sol.rejected;
            if sol.warning.is_some() {
                warning = sol.warning.clone();
            }
            let skip = if ts.is_empty() { 0 } else { 1 };
            ts.extend(&sol.t[skip..]);
            for k in 0..n {
                xs[k].extend(&sol.x[k][skip..]);
            }
            for h in &sol.events {
                hits.push((h.index, h.t, h.x.clone()));
            }
            let Some(last) = sol.events.last() else { break };
            let ev = &event_lines[last.index];
            if ev.terminal || ev.resets.is_empty() || last.t >= t_end - 1e-9 * opt.dt {
                break;
            }
            restarts += 1;
            if restarts > 10_000 {
                ctx.warn("more than 10 000 event resets: stopped (the events pile up)");
                break;
            }
            x = last.x.clone();
            let mut vals = base.clone();
            let mut stack = Vec::new();
            eval_into(last.t, &x, &[], &mut vals, &mut stack);
            for (s, e) in &ev.resets {
                x[*s] = e.eval(&vals, &mut stack);
            }
            // The recorded event point becomes the state after the reset.
            for k in 0..n {
                *xs[k].last_mut().unwrap() = x[k];
            }
            opt.t0 = last.t;
            opt.dt = opt.dt.min(t_end - opt.t0);
        }
    }
    if let Some(w) = &warning {
        ctx.warn(w.clone());
    }
    let mut table = Table::new("solution").with_x(Column::new("t", &ctx.str("timeUnit", "s"), ts.clone()));
    for (k, (name, _)) in states.iter().enumerate() {
        table.push(Column::new(name, "", xs[k].clone()));
    }
    if !aux.is_empty() {
        let mut vals = base.clone();
        let mut stack = Vec::new();
        let mut cols: Vec<Vec<f64>> = vec![Vec::with_capacity(ts.len()); aux.len()];
        let mut x = vec![0.0; n];
        let zero = vec![0.0; nl];
        for (i, &t) in ts.iter().enumerate() {
            for k in 0..n {
                x[k] = xs[k][i];
            }
            eval_into(t, &x, zs.get(i).unwrap_or(&zero), &mut vals, &mut stack);
            for k in 0..aux.len() {
                cols[k].push(vals[a0 + k]);
            }
        }
        for ((name, _), values) in aux.iter().zip(cols) {
            table.push(Column::new(name, "", values));
        }
    }
    let mut out = Dataset::table(table);
    if !event_lines.is_empty() {
        let mut et = Table::new("events");
        et.push(Column::text("event", hits.iter().map(|h| event_lines[h.0].text.clone()).collect()));
        et.push(Column::new("t", "s", hits.iter().map(|h| h.1).collect()));
        for (k, (name, _)) in states.iter().enumerate() {
            et.push(Column::new(name, "", hits.iter().map(|h| h.2[k]).collect()));
        }
        out.tables.push(et);
        out.scalar("events", hits.len() as f64, "");
        if let Some(h) = hits.first() {
            out.scalar("first event time", h.1, "s");
        }
    }
    for (k, (name, _)) in states.iter().enumerate() {
        out.scalar(&format!("{name} (end)"), *xs[k].last().unwrap_or(&f64::NAN), "");
    }
    out.scalar("steps", steps as f64, "").scalar("rejected steps", rejected as f64, "");
    Ok(out)
}

// ───────────────────────── transfer functions

pub struct Tf {
    pub num: Vec<f64>,
    pub den: Vec<f64>,
}

impl Tf {
    pub fn parse(num: &str, den: &str) -> Result<Tf, String> {
        let mut num = number_list(num)?;
        let mut den = number_list(den)?;
        while num.len() > 1 && num[0] == 0.0 {
            num.remove(0);
        }
        while den.len() > 1 && den[0] == 0.0 {
            den.remove(0);
        }
        if num.is_empty() || den.is_empty() || den.iter().all(|v| *v == 0.0) {
            return Err("give the numerator and denominator coefficients (highest power first)".into());
        }
        if num.len() > den.len() {
            return Err("the transfer function is improper (numerator degree above the denominator's)".into());
        }
        Ok(Tf { num, den })
    }

    pub fn at(&self, s: C64) -> C64 {
        linalg::poly_eval(&self.num, s) / linalg::poly_eval(&self.den, s)
    }

    /// Controllable canonical state space (A, B, C, D).
    pub fn to_ss(&self) -> (Mat, Vec<f64>, Vec<f64>, f64) {
        let lead = self.den[0];
        let den: Vec<f64> = self.den.iter().map(|v| v / lead).collect();
        let n = den.len() - 1;
        let mut num: Vec<f64> = vec![0.0; den.len() - self.num.len()];
        num.extend(self.num.iter().map(|v| v / lead));
        let d = num[0];
        let mut a = linalg::zeros(n, n);
        for j in 0..n {
            a[0][j] = -den[j + 1];
        }
        for i in 1..n {
            a[i][i - 1] = 1.0;
        }
        let mut b = vec![0.0; n];
        if n > 0 {
            b[0] = 1.0;
        }
        let c: Vec<f64> = (0..n).map(|i| num[i + 1] - d * den[i + 1]).collect();
        (a, b, c, d)
    }

    pub fn dc_gain(&self) -> f64 {
        let n0 = *self.num.last().unwrap();
        let d0 = *self.den.last().unwrap();
        if d0 == 0.0 {
            f64::INFINITY
        } else {
            n0 / d0
        }
    }
}

/// Simulates x' = Ax + Bu, y = Cx + Du with u = input(t); returns (t, y, states).
fn simulate(a: &Mat, b: &[f64], c: &[f64], d: f64, x0: &[f64], input: &dyn Fn(f64) -> f64, opt: &Options, cancel: &dyn Fn() -> bool) -> Result<(Vec<f64>, Vec<f64>, Vec<Vec<f64>>), String> {
    let n = x0.len();
    let mut f = |t: f64, x: &[f64], dx: &mut [f64]| {
        let u = input(t);
        for i in 0..n {
            let mut s = b[i] * u;
            for j in 0..n {
                s += a[i][j] * x[j];
            }
            dx[i] = s;
        }
    };
    if n == 0 {
        let count = ((opt.t_end - opt.t0) / opt.dt).round() as usize + 1;
        let t: Vec<f64> = (0..count).map(|i| opt.t0 + i as f64 * opt.dt).collect();
        let y = t.iter().map(|&ti| d * input(ti)).collect();
        return Ok((t, y, Vec::new()));
    }
    let sol = integrate(&mut f, x0, opt, cancel, &mut |_| {})?;
    let y = (0..sol.t.len()).map(|i| (0..n).map(|k| c[k] * sol.x[k][i]).sum::<f64>() + d * input(sol.t[i])).collect();
    Ok((sol.t, y, sol.x))
}

pub struct StepInfo {
    pub rise: f64,
    pub overshoot: f64,
    pub peak: f64,
    pub peak_time: f64,
    pub settling: f64,
    pub final_value: f64,
}

/// Rise time (10–90 %), overshoot, peak and 2 % settling time of a response from y0 towards `target`.
pub fn step_info(t: &[f64], y: &[f64], y0: f64, target: f64, start: f64) -> StepInfo {
    let span = target - y0;
    let mut info = StepInfo { rise: f64::NAN, overshoot: f64::NAN, peak: f64::NAN, peak_time: f64::NAN, settling: f64::NAN, final_value: target };
    if span == 0.0 || !span.is_finite() || t.is_empty() {
        return info;
    }
    let norm: Vec<f64> = y.iter().map(|v| (v - y0) / span).collect();
    let cross = |level: f64| -> Option<f64> {
        for i in 1..norm.len() {
            if t[i] < start {
                continue;
            }
            if norm[i - 1] < level && norm[i] >= level {
                let f = (level - norm[i - 1]) / (norm[i] - norm[i - 1]);
                return Some(t[i - 1] + f * (t[i] - t[i - 1]));
            }
        }
        None
    };
    if let (Some(a), Some(b)) = (cross(0.1), cross(0.9)) {
        info.rise = b - a;
    }
    let (imax, nmax) = norm.iter().enumerate().filter(|(i, _)| t[*i] >= start).fold((0, f64::NEG_INFINITY), |acc, (i, v)| if *v > acc.1 { (i, *v) } else { acc });
    info.peak = y[imax];
    info.peak_time = t[imax] - start;
    info.overshoot = ((nmax - 1.0) * 100.0).max(0.0);
    let last_out = (0..norm.len()).rev().find(|&i| (norm[i] - 1.0).abs() > 0.02);
    info.settling = match last_out {
        None => 0.0,
        Some(i) if i + 1 < norm.len() => t[i + 1] - start,
        Some(_) => f64::NAN,
    };
    info
}

fn add_step_scalars(out: &mut Dataset, info: &StepInfo) {
    out.scalar("rise time", info.rise, "s")
        .scalar("overshoot", info.overshoot, "%")
        .scalar("peak", info.peak, "")
        .scalar("peak time", info.peak_time, "s")
        .scalar("settling time (2%)", info.settling, "s")
        .scalar("final value", info.final_value, "");
}

pub fn roots_table(name: &str, label: &str, roots: &[C64]) -> Table {
    let mut t = Table::new(name);
    t.push(Column::text(label, (1..=roots.len()).map(|i| format!("{label} {i}")).collect()));
    t.push(Column::new("real", "", roots.iter().map(|r| r.re).collect()));
    t.push(Column::new("imag", "", roots.iter().map(|r| r.im).collect()));
    t.push(Column::new("|p|", "", roots.iter().map(|r| r.abs()).collect()));
    t.push(Column::new("damping", "", roots.iter().map(|r| if r.abs() > 0.0 { -r.re / r.abs() } else { 1.0 }).collect()));
    t
}

/// Step, impulse or ramp response of num(s)/den(s).
pub fn step(ctx: &mut Ctx) -> Result<Dataset, String> {
    let tf = Tf::parse(&ctx.str("num", "1"), &ctx.str("den", "1, 0.6, 1"))?;
    let kind = ctx.str("input", "step");
    let amplitude = ctx.num("amplitude", 1.0)?;
    let mut opt = options(ctx, 20.0, 0.01)?;
    opt.rtol = opt.rtol.min(1e-8);
    opt.atol = opt.rtol * 1e-3;
    let (a, b, c, d) = tf.to_ss();
    let n = b.len();
    let (x0, input): (Vec<f64>, Box<dyn Fn(f64) -> f64>) = match kind.as_str() {
        "step" => (vec![0.0; n], Box::new(move |_| amplitude)),
        "ramp" => (vec![0.0; n], Box::new(move |t| amplitude * t)),
        "impulse" => {
            if d != 0.0 {
                ctx.warn("the impulse response leaves out the direct term (a Dirac at t = 0)");
            }
            (b.iter().map(|v| v * amplitude).collect(), Box::new(|_| 0.0))
        }
        other => return Err(format!("unknown input \"{other}\" (step, impulse, ramp)")),
    };
    let (t, y, _) = simulate(&a, &b, &c, if kind == "impulse" { 0.0 } else { d }, &x0, &*input, &opt, ctx.cancel)?;
    let poles = linalg::poly_roots(&tf.den);
    let zeros = linalg::poly_roots(&tf.num);
    let mut table = Table::new("response").with_x(Column::new("t", "s", t.clone()));
    table.push(Column::new("y", "", y.clone()));
    if kind != "impulse" {
        table.push(Column::new("u", "", t.iter().map(|&ti| input(ti)).collect()));
    }
    let mut out = Dataset::table(table);
    out.tables.push(roots_table("poles", "pole", &poles));
    if !zeros.is_empty() {
        out.tables.push(roots_table("zeros", "zero", &zeros));
    }
    let stable = poles.iter().all(|p| p.re < -1e-12);
    if kind == "step" {
        let target = if stable { tf.dc_gain() * amplitude } else { *y.last().unwrap_or(&0.0) };
        let info = step_info(&t, &y, 0.0, target, 0.0);
        add_step_scalars(&mut out, &info);
    }
    out.scalar("DC gain", tf.dc_gain(), "").scalar("stable", if stable { 1.0 } else { 0.0 }, "");
    if !stable {
        ctx.warn("the system is not asymptotically stable (a pole has Re ≥ 0)");
    }
    Ok(out)
}

/// Frequency response: magnitude, phase, Nyquist curve and stability margins of the open loop.
pub fn bode(ctx: &mut Ctx) -> Result<Dataset, String> {
    let tf = Tf::parse(&ctx.str("num", "1"), &ctx.str("den", "1, 3, 3, 1"))?;
    let hz = ctx.str("units", "rad/s") == "Hz";
    let from = ctx.positive("from", 0.01)?;
    let to = ctx.positive("to", 100.0)?;
    if to <= from {
        return Err("the end frequency must be above the start".into());
    }
    let n = ctx.count("points", 500, 10, 200_000)?;
    let delay = ctx.num("delay", 0.0)?.max(0.0);
    let gain_k = ctx.num("gain", 1.0)?;
    let wscale = if hz { 2.0 * PI } else { 1.0 };
    let unit = if hz { "Hz" } else { "rad/s" };
    let mut freqs = Vec::with_capacity(n);
    let mut mag = Vec::with_capacity(n);
    let mut db = Vec::with_capacity(n);
    let mut phase = Vec::with_capacity(n);
    let mut re = Vec::with_capacity(n);
    let mut im = Vec::with_capacity(n);
    let mut prev = f64::NAN;
    let mut offset = 0.0;
    for i in 0..n {
        let f = from * (to / from).powf(i as f64 / (n - 1) as f64);
        let w = f * wscale;
        let h = tf.at(C64::new(0.0, w)).scale(gain_k) * C64::polar(1.0, -w * delay);
        let mut p = h.arg().to_degrees();
        if prev.is_finite() {
            while p + offset - prev > 180.0 {
                offset -= 360.0;
            }
            while p + offset - prev < -180.0 {
                offset += 360.0;
            }
        }
        p += offset;
        prev = p;
        freqs.push(f);
        mag.push(h.abs());
        db.push(20.0 * h.abs().max(1e-300).log10());
        phase.push(p);
        re.push(h.re);
        im.push(h.im);
    }
    // Margins by linear interpolation of the crossings.
    let mut gm = f64::INFINITY;
    let mut wpc = f64::NAN;
    let mut pm = f64::INFINITY;
    let mut wgc = f64::NAN;
    for i in 1..n {
        // Phase crossover: phase passes −180 (mod 360).
        let k0 = ((phase[i - 1] + 180.0) / 360.0).floor();
        let k1 = ((phase[i] + 180.0) / 360.0).floor();
        if k0 != k1 && wpc.is_nan() {
            let level = -180.0 + 360.0 * k0.max(k1);
            let fr = (level - phase[i - 1]) / (phase[i] - phase[i - 1]);
            let g = db[i - 1] + fr * (db[i] - db[i - 1]);
            gm = -g;
            wpc = freqs[i - 1] * (freqs[i] / freqs[i - 1]).powf(fr);
        }
        if (db[i - 1] > 0.0) != (db[i] > 0.0) && wgc.is_nan() {
            let fr = (0.0 - db[i - 1]) / (db[i] - db[i - 1]);
            let p = phase[i - 1] + fr * (phase[i] - phase[i - 1]);
            pm = (180.0 + p).rem_euclid(360.0);
            if pm > 180.0 {
                pm -= 360.0;
            }
            wgc = freqs[i - 1] * (freqs[i] / freqs[i - 1]).powf(fr);
        }
    }
    let dc = 20.0 * (tf.dc_gain() * gain_k).abs().max(1e-300).log10();
    let bw = (1..n).find(|&i| db[i] < dc - 3.0).map(|i| freqs[i]).unwrap_or(f64::NAN);
    let mut table = Table::new("bode").with_x(Column::new("ω", unit, freqs.clone()));
    table.push(Column::new("magnitude", "", mag));
    table.push(Column::new("dB", "dB", db));
    table.push(Column::new("phase", "°", phase));
    let mut nyq = Table::new("nyquist").with_x(Column::new("Re", "", re.clone()));
    nyq.push(Column::new("Im", "", im.clone()));
    nyq.push(Column::new("Im (mirror)", "", im.iter().map(|v| -v).collect()));
    // Closed loop with unity feedback: den + K·num.
    let mut cl = tf.den.clone();
    let off = cl.len() - tf.num.len();
    for (i, v) in tf.num.iter().enumerate() {
        cl[off + i] += gain_k * v;
    }
    let cl_poles = linalg::poly_roots(&cl);
    let mut out = Dataset { tables: vec![table, nyq, roots_table("closed-loop poles", "pole", &cl_poles)], ..Default::default() };
    out.scalar("gain margin", gm, "dB")
        .scalar("phase crossover", wpc, unit)
        .scalar("phase margin", pm, "°")
        .scalar("gain crossover", wgc, unit)
        .scalar("DC gain", dc, "dB")
        .scalar("bandwidth (−3 dB)", bw, unit)
        .scalar("closed loop stable", if delay == 0.0 { if cl_poles.iter().all(|p| p.re < -1e-12) { 1.0 } else { 0.0 } } else { f64::NAN }, "");
    // Ziegler–Nichols from the ultimate gain and period.
    if wpc.is_finite() && gm.is_finite() {
        let ku = gain_k * 10f64.powf(gm / 20.0);
        let w_u = wpc * wscale;
        let pu = 2.0 * PI / w_u;
        out.scalar("ultimate gain Ku", ku, "").scalar("ultimate period Pu", pu, "s");
        out.scalar("Z-N Kp", 0.6 * ku, "").scalar("Z-N Ki", 1.2 * ku / pu, "").scalar("Z-N Kd", 0.075 * ku * pu, "");
    }
    Ok(out)
}

/// A digital PID controller (sample time dt) in a loop with a plant num/den.
pub fn pid(ctx: &mut Ctx) -> Result<Dataset, String> {
    let tf = Tf::parse(&ctx.str("num", "1"), &ctx.str("den", "1, 2, 1"))?;
    let kp = ctx.num("kp", 2.0)?;
    let ki = ctx.num("ki", 1.0)?;
    let kd = ctx.num("kd", 0.5)?;
    let tf_d = ctx.num("tf", 0.0)?.max(0.0);
    let setpoint = ctx.num("setpoint", 1.0)?;
    let step_time = ctx.num("stepTime", 0.0)?;
    let dist = ctx.num("disturbance", 0.0)?;
    let dist_time = ctx.num("disturbanceTime", 10.0)?;
    let noise = ctx.num("noise", 0.0)?.abs();
    let umin = ctx.num("uMin", f64::NEG_INFINITY)?;
    let umax = ctx.num("uMax", f64::INFINITY)?;
    let on_measurement = ctx.flag("derivativeOnMeasurement", true);
    let t_end = ctx.positive("tEnd", 20.0)?;
    let h = ctx.positive("dt", 0.01)?;
    let sub = ctx.count("substeps", 8, 1, 1000)?;
    let steps = (t_end / h).round() as usize;
    if steps > 5_000_000 {
        return Err("too many steps: raise dt or shorten tEnd".into());
    }
    let reference = input_signal(ctx, "r", "rColumn")?;
    let (a, b, c, d) = tf.to_ss();
    let n = b.len();
    let mut rng = ctx.rng();
    let mut x = vec![0.0; n];
    let mut integral = 0.0;
    let mut dterm = 0.0;
    let mut prev_e = f64::NAN;
    let mut prev_y = f64::NAN;
    let mut u_prev = 0.0;
    let (mut ts, mut rs, mut ys, mut us, mut es) = (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let (mut iae, mut ise, mut itae) = (0.0, 0.0, 0.0);
    let mut k1 = vec![0.0; n];
    let mut k2 = vec![0.0; n];
    let mut k3 = vec![0.0; n];
    let mut k4 = vec![0.0; n];
    let mut tmp = vec![0.0; n];
    let deriv = |x: &[f64], u: f64, dx: &mut [f64]| {
        for i in 0..n {
            let mut s = b[i] * u;
            for j in 0..n {
                s += a[i][j] * x[j];
            }
            dx[i] = s;
        }
    };
    for k in 0..=steps {
        let t = k as f64 * h;
        let r = match &reference {
            Some((rt, ry)) => interp(rt, ry, t),
            None => {
                if t >= step_time {
                    setpoint
                } else {
                    0.0
                }
            }
        };
        let disturbance = if t >= dist_time { dist } else { 0.0 };
        // The output uses the input held over the last step (no algebraic loop through D).
        let y_true = c.iter().zip(&x).map(|(p, q)| p * q).sum::<f64>() + d * (u_prev + disturbance);
        let y_meas = y_true + if noise > 0.0 { noise * rng.normal() } else { 0.0 };
        let e = r - y_meas;
        // Derivative with a first-order filter (time constant tf), on the measurement by default (no kick).
        let signal = if on_measurement { -y_meas } else { e };
        let prev = if on_measurement { -prev_y } else { prev_e };
        if prev.is_finite() {
            let raw = kd * (signal - prev);
            dterm = if tf_d > 0.0 { (tf_d * dterm + raw) / (tf_d + h) } else { raw / h };
        }
        let u_unsat = kp * e + integral + dterm;
        let u = u_unsat.clamp(umin, umax);
        // Anti-windup: integrate only while not saturated (or when it unwinds).
        if u == u_unsat || (u_unsat > umax && e < 0.0) || (u_unsat < umin && e > 0.0) {
            integral += ki * e * h;
        }
        ts.push(t);
        rs.push(r);
        ys.push(y_true);
        us.push(u);
        es.push(r - y_true);
        iae += (r - y_true).abs() * h;
        ise += (r - y_true).powi(2) * h;
        itae += t * (r - y_true).abs() * h;
        prev_e = e;
        prev_y = y_meas;
        u_prev = u;
        if k == steps {
            break;
        }
        // Plant over one sample with RK4 sub-steps, u held (zero-order hold) plus the input disturbance.
        let uin = u + disturbance;
        let hs = h / sub as f64;
        for _ in 0..sub {
            deriv(&x, uin, &mut k1);
            for i in 0..n {
                tmp[i] = x[i] + 0.5 * hs * k1[i];
            }
            deriv(&tmp, uin, &mut k2);
            for i in 0..n {
                tmp[i] = x[i] + 0.5 * hs * k2[i];
            }
            deriv(&tmp, uin, &mut k3);
            for i in 0..n {
                tmp[i] = x[i] + hs * k3[i];
            }
            deriv(&tmp, uin, &mut k4);
            for i in 0..n {
                x[i] += hs / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
            }
        }
        if x.iter().any(|v| !v.is_finite()) {
            ctx.warn(format!("the loop is unstable: the output left all bounds at t = {t:.4} s"));
            break;
        }
        if k % 4096 == 0 {
            ctx.check()?;
        }
    }
    // The step metrics describe the setpoint response: they stop where the disturbance starts.
    let cut = if dist != 0.0 { ts.iter().position(|t| *t >= dist_time).unwrap_or(ts.len()).max(2) } else { ts.len() };
    let info = step_info(&ts[..cut], &ys[..cut], 0.0, if reference.is_some() { *rs.last().unwrap_or(&setpoint) } else { setpoint }, step_time);
    let sse = es.last().copied().unwrap_or(f64::NAN);
    let umax_seen = us.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    let mut table = Table::new("loop").with_x(Column::new("t", "s", ts));
    table.push(Column::new("r", "", rs));
    table.push(Column::new("y", "", ys));
    table.push(Column::new("u", "", us));
    table.push(Column::new("e", "", es));
    let mut out = Dataset::table(table);
    add_step_scalars(&mut out, &info);
    out.scalar("steady-state error", sse, "").scalar("IAE", iae, "").scalar("ISE", ise, "").scalar("ITAE", itae, "").scalar("max |u|", umax_seen, "");
    Ok(out)
}

/// x' = Ax + Bu, y = Cx + Du from matrices typed as text.
pub fn state_space(ctx: &mut Ctx) -> Result<Dataset, String> {
    let a = crate::expr::matrix(&ctx.str("A", "0 1; -2 -3"))?;
    let n = a.len();
    if n == 0 || a.iter().any(|r| r.len() != n) {
        return Err("A must be square".into());
    }
    let b = crate::expr::matrix(&ctx.str("B", "0; 1"))?;
    let m = b.first().map_or(0, |r| r.len());
    if b.len() != n || m == 0 {
        return Err(format!("B must have {n} rows"));
    }
    let c = crate::expr::matrix(&ctx.str("C", "1 0"))?;
    if c.first().map_or(0, |r| r.len()) != n {
        return Err(format!("C must have {n} columns"));
    }
    let p = c.len();
    let dtext = ctx.str("D", "");
    let dm = if dtext.trim().is_empty() { linalg::zeros(p, m) } else { crate::expr::matrix(&dtext)? };
    if dm.len() != p || dm.first().map_or(0, |r| r.len()) != m {
        return Err(format!("D must be {p} × {m}"));
    }
    let channel = ctx.count("channel", 1, 1, m as i64)? - 1;
    let kind = ctx.str("input", "step");
    let amplitude = ctx.num("amplitude", 1.0)?;
    let freq = ctx.num("frequency", 1.0)?;
    let mut x0 = number_list(&ctx.str("x0", ""))?;
    x0.resize(n, 0.0);
    let ext = input_signal(ctx, "u", "uColumn")?;
    let input: Box<dyn Fn(f64) -> f64> = match (&ext, kind.as_str()) {
        (Some((ut, uy)), _) => {
            let (ut, uy) = (ut.clone(), uy.clone());
            Box::new(move |t| interp(&ut, &uy, t))
        }
        (None, "step") => Box::new(move |_| amplitude),
        (None, "sine") => Box::new(move |t| amplitude * (2.0 * PI * freq * t).sin()),
        (None, "zero") | (None, "free") => Box::new(|_| 0.0),
        (None, "impulse") => {
            for i in 0..n {
                x0[i] += b[i][channel] * amplitude;
            }
            Box::new(|_| 0.0)
        }
        (None, other) => return Err(format!("unknown input \"{other}\" (step, impulse, sine, zero)")),
    };
    let bcol: Vec<f64> = (0..n).map(|i| b[i][channel]).collect();
    let opt = options(ctx, 10.0, 0.01)?;
    let mut f = |t: f64, x: &[f64], dx: &mut [f64]| {
        let u = input(t);
        let ax = matvec(&a, x);
        for i in 0..n {
            dx[i] = ax[i] + bcol[i] * u;
        }
    };
    let sol = integrate(&mut f, &x0, &opt, ctx.cancel, &mut |_| {})?;
    let mut table = Table::new("response").with_x(Column::new("t", "s", sol.t.clone()));
    for row in 0..p {
        let y: Vec<f64> = (0..sol.t.len()).map(|i| (0..n).map(|k| c[row][k] * sol.x[k][i]).sum::<f64>() + dm[row][channel] * input(sol.t[i])).collect();
        table.push(Column::new(&format!("y{}", row + 1), "", y));
    }
    for k in 0..n {
        table.push(Column::new(&format!("x{}", k + 1), "", sol.x[k].clone()));
    }
    let eig = linalg::eigenvalues(&a);
    // Controllability [B AB … A^{n-1}B] and observability [C; CA; …].
    let mut ctrb = linalg::zeros(n, n * m);
    let mut blk = b.clone();
    for k in 0..n {
        for i in 0..n {
            for j in 0..m {
                ctrb[i][k * m + j] = blk[i][j];
            }
        }
        blk = linalg::matmul(&a, &blk);
    }
    let mut obsv = Vec::new();
    let mut cblk = c.clone();
    for _ in 0..n {
        obsv.extend(cblk.iter().cloned());
        cblk = linalg::matmul(&cblk, &a);
    }
    let mut out = Dataset::table(table);
    out.tables.push(roots_table("eigenvalues", "λ", &eig));
    let stable = eig.iter().all(|e| e.re < -1e-12);
    out.scalar("stable", if stable { 1.0 } else { 0.0 }, "")
        .scalar("controllability rank", linalg::rank(&ctrb) as f64, &format!("of {n}"))
        .scalar("observability rank", linalg::rank(&obsv) as f64, &format!("of {n}"));
    if let Ok(ainv) = linalg::inverse(&a) {
        // DC gain y1/u = −C A⁻¹ B + D.
        let v = matvec(&ainv, &bcol);
        let g = -(0..n).map(|k| c[0][k] * v[k]).sum::<f64>() + dm[0][channel];
        out.scalar("DC gain (y1)", g, "");
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_order_step_metrics() {
        // ωn = 1, ζ = 0.3 → overshoot = exp(−πζ/√(1−ζ²)) = 37.23 %.
        let tf = Tf::parse("1", "1, 0.6, 1").unwrap();
        let (a, b, c, d) = tf.to_ss();
        let opt = Options { method: Method::Rk45, t0: 0.0, t_end: 40.0, dt: 0.001, substeps: 1, rtol: 1e-9, atol: 1e-12 };
        let (t, y, _) = simulate(&a, &b, &c, d, &[0.0, 0.0], &|_| 1.0, &opt, &|| false).unwrap();
        let info = step_info(&t, &y, 0.0, 1.0, 0.0);
        let expected = (-PI * 0.3 / (1.0f64 - 0.09).sqrt()).exp() * 100.0;
        assert!((info.overshoot - expected).abs() < 0.05, "{} vs {expected}", info.overshoot);
        assert!((info.peak_time - PI / (1.0f64 - 0.09).sqrt()).abs() < 0.01);
    }

    #[test]
    fn tf_with_feedthrough() {
        // (s + 2)/(s + 1): D = 1, C = 1, A = −1.
        let (a, b, c, d) = Tf::parse("1, 2", "1, 1").unwrap().to_ss();
        assert_eq!((a[0][0], b[0], c[0], d), (-1.0, 1.0, 1.0, 1.0));
    }
}
