//! Block diagrams (the Simulink way of modelling): signals joined by blocks,
//! feedback loops allowed, solved together step by step.
//!
//! One statement per line: `name = expression` (an algebraic block: gains,
//! sums, products, any formula of other signals and t) or `name = block(input,
//! key = value, …)`. Loops are fine when they pass through a block whose output
//! does not depend on its input at the same instant (integrator, transfer
//! function without direct term, delay, unit delay …); a loop without one is an
//! algebraic loop and is reported.

use crate::data::{interp, Column, Dataset, Table};
use crate::expr::{constants, statements, valid_name, Expr};
use crate::linalg::Mat;
use crate::Ctx;
use std::collections::HashMap;

#[derive(Debug, Clone)]
enum Kind {
    Expr,
    Integrator { x0: f64, lo: f64, hi: f64 },
    Tf { a: Mat, b: Vec<f64>, c: Vec<f64>, d: f64 },
    Pid { kp: f64, ki: f64, kd: f64, n: f64, umin: f64, umax: f64 },
    Delay { t: f64, init: f64 },
    UnitDelay { ts: f64, x0: f64 },
    Zoh { ts: f64 },
    Derivative,
    RateLimit { rise: f64, fall: f64 },
    Relay { on: f64, off: f64, high: f64, low: f64 },
    Saturation { lo: f64, hi: f64 },
    DeadZone { lo: f64, hi: f64 },
    Lookup { xs: Vec<f64>, ys: Vec<f64> },
    Step { t0: f64, a: f64, before: f64 },
    Sine { f: f64, a: f64, phase: f64, offset: f64 },
    Square { f: f64, a: f64, duty: f64, offset: f64 },
    Pulse { period: f64, width: f64, a: f64, delay: f64 },
    Ramp { slope: f64, t0: f64 },
    Noise { std: f64, mean: f64, ts: f64 },
    Input { xs: Vec<f64>, ys: Vec<f64> },
}

const BLOCKS: &[&str] = &[
    "integrator", "tf", "pid", "delay", "unitdelay", "zoh", "derivative", "ratelimit", "relay", "saturation", "deadzone", "lookup", "step", "sine", "square",
    "pulse", "ramp", "noise", "input",
];

struct Stmt {
    name: String,
    kind: Kind,
    /// The input expression (blocks) or the formula (algebraic).
    input: Option<Expr>,
    /// First continuous state and their count.
    s0: usize,
    ns: usize,
    feedthrough: bool,
}

/// Splits "a, b(c, d), x = [1, 2]" at the commas outside brackets.
fn split_top(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut cur = String::new();
    for ch in text.chars() {
        match ch {
            '(' | '[' => {
                depth += 1;
                cur.push(ch);
            }
            ')' | ']' => {
                depth -= 1;
                cur.push(ch);
            }
            ',' if depth == 0 => out.push(std::mem::take(&mut cur)),
            _ => cur.push(ch),
        }
    }
    if !cur.trim().is_empty() {
        out.push(cur);
    }
    out.into_iter().map(|s| s.trim().to_string()).collect()
}

/// "name(args)" covering the whole text → (name, args).
fn call(text: &str) -> Option<(String, String)> {
    let t = text.trim();
    let open = t.find('(')?;
    let name = t[..open].trim();
    if !t.ends_with(')') || !BLOCKS.contains(&name.to_ascii_lowercase().as_str()) {
        return None;
    }
    // The opening bracket must close at the very end.
    let mut depth = 0;
    for (i, ch) in t.char_indices().skip(open) {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 && i != t.len() - 1 {
                    return None;
                }
            }
            _ => {}
        }
    }
    Some((name.to_ascii_lowercase(), t[open + 1..t.len() - 1].to_string()))
}

struct Args {
    positional: Vec<String>,
    named: HashMap<String, String>,
    consts: Vec<(String, f64)>,
    block: String,
}

impl Args {
    fn parse(block: &str, text: &str, consts: &[(String, f64)]) -> Result<Args, String> {
        let mut positional = Vec::new();
        let mut named = HashMap::new();
        for part in split_top(text) {
            // key = value (but not a comparison ==, <=, >=, !=).
            let eq = part.char_indices().find(|&(i, c)| {
                c == '=' && !matches!(part[..i].chars().last(), Some('<' | '>' | '!' | '=')) && part[i + 1..].chars().next() != Some('=')
            });
            match eq {
                Some((i, _)) if valid_name(part[..i].trim()) => {
                    named.insert(part[..i].trim().to_ascii_lowercase(), part[i + 1..].trim().to_string());
                }
                _ => positional.push(part),
            }
        }
        Ok(Args { positional, named, consts: consts.to_vec(), block: block.to_string() })
    }

    fn num(&self, key: &str, default: f64) -> Result<f64, String> {
        match self.named.get(key) {
            None => Ok(default),
            Some(v) => {
                let names: Vec<String> = self.consts.iter().map(|(n, _)| n.clone()).collect();
                let vals: Vec<f64> = self.consts.iter().map(|(_, v)| *v).collect();
                Ok(Expr::with_names(v, &names).map_err(|e| format!("{}(): {key}: {e}", self.block))?.value(&vals))
            }
        }
    }

    fn list(&self, key: &str) -> Result<Vec<f64>, String> {
        let v = self.named.get(key).ok_or_else(|| format!("{}(): give {key} = [ … ]", self.block))?;
        crate::expr::number_list(v.trim().trim_start_matches('[').trim_end_matches(']')).map_err(|e| format!("{}(): {key}: {e}", self.block))
    }

    fn text(&self, key: &str) -> Option<String> {
        self.named.get(key).map(|s| s.trim().trim_matches('"').to_string())
    }

    fn check(&self, allowed: &[&str]) -> Result<(), String> {
        for k in self.named.keys() {
            if !allowed.contains(&k.as_str()) {
                return Err(format!("{}(): unknown setting \"{k}\" (settings: {})", self.block, allowed.join(", ")));
            }
        }
        Ok(())
    }
}

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let consts = constants(&ctx.str("constants", ""))?;
    let text = ctx.str("diagram", "");
    let t_end = ctx.positive("tEnd", 10.0)?;
    let dt = ctx.positive("dt", 0.01)?;
    let sub = ctx.count("substeps", 10, 1, 10_000)?;
    let h = dt / sub as f64;
    let outputs = (t_end / dt).round() as usize;
    if outputs > 2_000_000 {
        return Err("too many output points: raise dt or shorten tEnd".into());
    }
    let input_table = match ctx.input("u") {
        Some(d) => Some(d.pick_table("")?.clone()),
        None => None,
    };
    // Names first (so any statement may refer to any other), then the statements.
    let stmts_text = statements(&text);
    if stmts_text.is_empty() {
        return Err("write the diagram: one signal per line, e.g. y = integrator(u - y)".into());
    }
    let mut names = Vec::new();
    for s in &stmts_text {
        let (name, _) = s.split_once('=').ok_or_else(|| format!("\"{s}\" is not name = block(…) or name = expression"))?;
        let name = name.trim().to_string();
        if !valid_name(&name) || name == "t" {
            return Err(format!("\"{name}\" cannot be a signal name"));
        }
        if names.contains(&name) {
            return Err(format!("the signal \"{name}\" is defined twice"));
        }
        names.push(name);
    }
    // Expression slots: t, constants, signals.
    let mut slots = vec!["t".to_string()];
    slots.extend(consts.iter().map(|(n, _)| n.clone()));
    let sig0 = slots.len();
    slots.extend(names.iter().cloned());
    let compile = |src: &str| Expr::with_names(src, &slots);
    let mut stmts: Vec<Stmt> = Vec::new();
    let mut nstates = 0usize;
    let mut rng = ctx.rng();
    for (i, s) in stmts_text.iter().enumerate() {
        let rhs = s.split_once('=').unwrap().1.trim();
        let name = names[i].clone();
        let (kind, input, ns, feed) = match call(rhs) {
            None => (Kind::Expr, Some(compile(rhs).map_err(|e| format!("{name}: {e}"))?), 0, true),
            Some((block, args_text)) => {
                let a = Args::parse(&block, &args_text, &consts)?;
                let input = |a: &Args| -> Result<Expr, String> {
                    let src = a.positional.first().ok_or_else(|| format!("{name}: {block}() needs its input signal as the first argument"))?;
                    compile(src).map_err(|e| format!("{name}: {e}"))
                };
                match block.as_str() {
                    "integrator" => {
                        a.check(&["x0", "lo", "hi"])?;
                        (Kind::Integrator { x0: a.num("x0", 0.0)?, lo: a.num("lo", f64::NEG_INFINITY)?, hi: a.num("hi", f64::INFINITY)? }, Some(input(&a)?), 1, false)
                    }
                    "tf" => {
                        a.check(&["num", "den"])?;
                        let num = a.list("num")?;
                        let den = a.list("den")?;
                        let tf = super::dynamics::Tf::parse(&num.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(","), &den.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(","))
                            .map_err(|e| format!("{name}: {e}"))?;
                        let (am, b, c, d) = tf.to_ss();
                        let n = b.len();
                        (Kind::Tf { a: am, b, c, d }, Some(input(&a)?), n, d != 0.0)
                    }
                    "pid" => {
                        a.check(&["kp", "ki", "kd", "n", "umin", "umax"])?;
                        (Kind::Pid { kp: a.num("kp", 1.0)?, ki: a.num("ki", 0.0)?, kd: a.num("kd", 0.0)?, n: a.num("n", 100.0)?, umin: a.num("umin", f64::NEG_INFINITY)?, umax: a.num("umax", f64::INFINITY)? }, Some(input(&a)?), 2, true)
                    }
                    "delay" => {
                        a.check(&["t", "init"])?;
                        let td = a.num("t", 1.0)?;
                        if td < h {
                            return Err(format!("{name}: the delay must be at least one internal step ({h})"));
                        }
                        (Kind::Delay { t: td, init: a.num("init", 0.0)? }, Some(input(&a)?), 0, false)
                    }
                    "unitdelay" => {
                        a.check(&["ts", "x0"])?;
                        (Kind::UnitDelay { ts: a.num("ts", dt)?.max(h), x0: a.num("x0", 0.0)? }, Some(input(&a)?), 0, false)
                    }
                    "zoh" => {
                        a.check(&["ts"])?;
                        (Kind::Zoh { ts: a.num("ts", dt)?.max(h) }, Some(input(&a)?), 0, false)
                    }
                    "derivative" => {
                        a.check(&[])?;
                        (Kind::Derivative, Some(input(&a)?), 0, false)
                    }
                    "ratelimit" => {
                        a.check(&["rise", "fall"])?;
                        let rise = a.num("rise", 1.0)?.abs();
                        (Kind::RateLimit { rise, fall: a.num("fall", rise)?.abs() }, Some(input(&a)?), 0, false)
                    }
                    "relay" => {
                        a.check(&["on", "off", "high", "low"])?;
                        (Kind::Relay { on: a.num("on", 0.0)?, off: a.num("off", 0.0)?, high: a.num("high", 1.0)?, low: a.num("low", 0.0)? }, Some(input(&a)?), 0, true)
                    }
                    "saturation" => {
                        a.check(&["lo", "hi"])?;
                        (Kind::Saturation { lo: a.num("lo", -1.0)?, hi: a.num("hi", 1.0)? }, Some(input(&a)?), 0, true)
                    }
                    "deadzone" => {
                        a.check(&["lo", "hi"])?;
                        (Kind::DeadZone { lo: a.num("lo", -0.5)?, hi: a.num("hi", 0.5)? }, Some(input(&a)?), 0, true)
                    }
                    "lookup" => {
                        a.check(&["x", "y"])?;
                        let xs = a.list("x")?;
                        let ys = a.list("y")?;
                        if xs.len() != ys.len() || xs.len() < 2 {
                            return Err(format!("{name}: lookup() needs x and y lists of the same length (2 or more)"));
                        }
                        (Kind::Lookup { xs, ys }, Some(input(&a)?), 0, true)
                    }
                    "step" => {
                        a.check(&["t0", "a", "before"])?;
                        (Kind::Step { t0: a.num("t0", 0.0)?, a: a.num("a", 1.0)?, before: a.num("before", 0.0)? }, None, 0, false)
                    }
                    "sine" => {
                        a.check(&["f", "a", "phase", "offset"])?;
                        (Kind::Sine { f: a.num("f", 1.0)?, a: a.num("a", 1.0)?, phase: a.num("phase", 0.0)?.to_radians(), offset: a.num("offset", 0.0)? }, None, 0, false)
                    }
                    "square" => {
                        a.check(&["f", "a", "duty", "offset"])?;
                        (Kind::Square { f: a.num("f", 1.0)?, a: a.num("a", 1.0)?, duty: a.num("duty", 0.5)?, offset: a.num("offset", 0.0)? }, None, 0, false)
                    }
                    "pulse" => {
                        a.check(&["period", "width", "a", "delay"])?;
                        (Kind::Pulse { period: a.num("period", 1.0)?, width: a.num("width", 0.5)?, a: a.num("a", 1.0)?, delay: a.num("delay", 0.0)? }, None, 0, false)
                    }
                    "ramp" => {
                        a.check(&["slope", "t0"])?;
                        (Kind::Ramp { slope: a.num("slope", 1.0)?, t0: a.num("t0", 0.0)? }, None, 0, false)
                    }
                    "noise" => {
                        a.check(&["std", "mean", "ts"])?;
                        (Kind::Noise { std: a.num("std", 1.0)?, mean: a.num("mean", 0.0)?, ts: a.num("ts", dt)?.max(h) }, None, 0, false)
                    }
                    "input" => {
                        a.check(&["column"])?;
                        let table = input_table.as_ref().ok_or_else(|| format!("{name}: input() reads the table connected to the input u — connect one"))?;
                        let col = table.pick(&a.text("column").unwrap_or_default())?;
                        let xs = table.pick_x("").values.clone();
                        (Kind::Input { xs, ys: col.values.clone() }, None, 0, false)
                    }
                    _ => unreachable!(),
                }
            }
        };
        stmts.push(Stmt { name, kind, input, s0: nstates, ns, feedthrough: feed });
        nstates += ns;
    }
    // Evaluation order: a statement waits for the signals its input reads only when it is feedthrough.
    let n = stmts.len();
    let deps: Vec<Vec<usize>> = stmts
        .iter()
        .map(|s| match (&s.input, s.feedthrough) {
            (Some(e), true) => e.vars().into_iter().filter(|&v| v >= sig0).map(|v| v - sig0).collect(),
            _ => Vec::new(),
        })
        .collect();
    let mut indeg = vec![0usize; n];
    let mut next: Vec<Vec<usize>> = vec![Vec::new(); n];
    for (i, d) in deps.iter().enumerate() {
        for &j in d {
            indeg[i] += 1;
            next[j].push(i);
        }
    }
    let mut order = Vec::new();
    let mut ready: Vec<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();
    while let Some(i) = ready.pop() {
        order.push(i);
        for &k in &next[i] {
            indeg[k] -= 1;
            if indeg[k] == 0 {
                ready.push(k);
            }
        }
    }
    if order.len() < n {
        let stuck: Vec<String> = (0..n).filter(|&i| indeg[i] > 0).map(|i| stmts[i].name.clone()).collect();
        return Err(format!("algebraic loop through {} — put an integrator, a transfer function without direct term or a delay in the loop", stuck.join(", ")));
    }
    // State.
    let mut x = vec![0.0; nstates];
    let mut held = vec![0.0; n]; // the output of discrete blocks
    let mut aux = vec![0.0; n]; // stored sample (unit delay), last input (derivative), relay state, next sample time
    let mut next_sample = vec![0.0f64; n];
    let mut history: Vec<Vec<(f64, f64)>> = vec![Vec::new(); n];
    for (i, s) in stmts.iter().enumerate() {
        match &s.kind {
            Kind::Integrator { x0, .. } => x[s.s0] = *x0,
            Kind::UnitDelay { x0, .. } => {
                held[i] = *x0;
                aux[i] = *x0;
            }
            Kind::Relay { low, .. } => aux[i] = *low,
            Kind::Noise { std, mean, .. } => held[i] = mean + std * rng.normal(),
            Kind::Delay { init, .. } => held[i] = *init,
            _ => {}
        }
    }
    let mut vals = vec![0.0; slots.len()];
    for (k, (_, v)) in consts.iter().enumerate() {
        vals[1 + k] = *v;
    }
    let mut stack = Vec::with_capacity(32);
    // Every signal at time t for states x (discrete outputs held).
    let eval = |t: f64, x: &[f64], held: &[f64], aux: &[f64], history: &[Vec<(f64, f64)>], vals: &mut Vec<f64>, stack: &mut Vec<f64>| {
        vals[0] = t;
        let get_in = |s: &Stmt, vals: &Vec<f64>, stack: &mut Vec<f64>| s.input.as_ref().map(|e| e.eval(vals, stack)).unwrap_or(0.0);
        for &i in &order {
            let s = &stmts[i];
            let y = match &s.kind {
                Kind::Expr => get_in(s, vals, stack),
                Kind::Integrator { .. } => x[s.s0],
                Kind::Tf { c, d, .. } => {
                    let mut y = (0..s.ns).map(|k| c[k] * x[s.s0 + k]).sum::<f64>();
                    if *d != 0.0 {
                        y += d * get_in(s, vals, stack);
                    }
                    y
                }
                Kind::Pid { kp, ki, kd, n, umin, umax } => {
                    let e = get_in(s, vals, stack);
                    (kp * e + ki * x[s.s0] + kd * n * (e - x[s.s0 + 1])).clamp(*umin, *umax)
                }
                Kind::Delay { t: td, init } => {
                    let hist = &history[i];
                    if hist.is_empty() || t - td < hist[0].0 {
                        *init
                    } else {
                        let xs: Vec<f64> = hist.iter().map(|p| p.0).collect();
                        let ys: Vec<f64> = hist.iter().map(|p| p.1).collect();
                        interp(&xs, &ys, t - td)
                    }
                }
                Kind::UnitDelay { .. } | Kind::Zoh { .. } | Kind::Derivative | Kind::RateLimit { .. } | Kind::Noise { .. } => held[i],
                Kind::Relay { on, off, high, low } => {
                    let u = get_in(s, vals, stack);
                    if u >= *on {
                        *high
                    } else if u <= *off {
                        *low
                    } else {
                        aux[i]
                    }
                }
                Kind::Saturation { lo, hi } => get_in(s, vals, stack).clamp(*lo, *hi),
                Kind::DeadZone { lo, hi } => {
                    let u = get_in(s, vals, stack);
                    if u > *hi {
                        u - hi
                    } else if u < *lo {
                        u - lo
                    } else {
                        0.0
                    }
                }
                Kind::Lookup { xs, ys } => interp(xs, ys, get_in(s, vals, stack)),
                Kind::Step { t0, a, before } => {
                    if t >= *t0 {
                        *a
                    } else {
                        *before
                    }
                }
                Kind::Sine { f, a, phase, offset } => offset + a * (2.0 * std::f64::consts::PI * f * t + phase).sin(),
                Kind::Square { f, a, duty, offset } => offset + if (f * t).rem_euclid(1.0) < *duty { *a } else { -a },
                Kind::Pulse { period, width, a, delay } => {
                    if t >= *delay && (t - delay).rem_euclid(*period) < *width {
                        *a
                    } else {
                        0.0
                    }
                }
                Kind::Ramp { slope, t0 } => slope * (t - t0).max(0.0),
                Kind::Input { xs, ys } => interp(xs, ys, t),
            };
            vals[sig0 + i] = y;
        }
    };
    // The state derivatives (needs the signals of `vals`, filled by eval).
    let deriv = |vals: &Vec<f64>, x: &[f64], dx: &mut [f64], stack: &mut Vec<f64>| {
        for s in &stmts {
            match &s.kind {
                Kind::Integrator { lo, hi, .. } => {
                    let u = s.input.as_ref().unwrap().eval(vals, stack);
                    let v = x[s.s0];
                    dx[s.s0] = if (v >= *hi && u > 0.0) || (v <= *lo && u < 0.0) { 0.0 } else { u };
                }
                Kind::Tf { a, b, .. } => {
                    let u = s.input.as_ref().unwrap().eval(vals, stack);
                    for r in 0..s.ns {
                        let mut acc = b[r] * u;
                        for c in 0..s.ns {
                            acc += a[r][c] * x[s.s0 + c];
                        }
                        dx[s.s0 + r] = acc;
                    }
                }
                Kind::Pid { kp, ki, kd, n, umin, umax } => {
                    let e = s.input.as_ref().unwrap().eval(vals, stack);
                    let raw = kp * e + ki * x[s.s0] + kd * n * (e - x[s.s0 + 1]);
                    // Anti-windup: the integral stops while the output is saturated and the error pushes further.
                    let wind = (raw > *umax && e > 0.0) || (raw < *umin && e < 0.0);
                    dx[s.s0] = if wind { 0.0 } else { e };
                    dx[s.s0 + 1] = n * (e - x[s.s0 + 1]);
                }
                _ => {}
            }
        }
    };
    let mut t = 0.0;
    let mut out_t = Vec::with_capacity(outputs + 1);
    let mut out: Vec<Vec<f64>> = vec![Vec::with_capacity(outputs + 1); n];
    eval(t, &x, &held, &aux, &history, &mut vals, &mut stack);
    // Discrete blocks see their input at t = 0 before the first step.
    for (i, s) in stmts.iter().enumerate() {
        if let Kind::Zoh { .. } = s.kind {
            held[i] = s.input.as_ref().unwrap().eval(&vals, &mut stack);
        }
        if let Kind::Derivative = s.kind {
            aux[i] = s.input.as_ref().unwrap().eval(&vals, &mut stack);
        }
        if let Kind::RateLimit { .. } = s.kind {
            held[i] = s.input.as_ref().unwrap().eval(&vals, &mut stack);
        }
        next_sample[i] = 0.0;
        if let Kind::Delay { .. } = s.kind {
            history[i].push((0.0, s.input.as_ref().unwrap().eval(&vals, &mut stack)));
        }
    }
    eval(t, &x, &held, &aux, &history, &mut vals, &mut stack);
    out_t.push(t);
    for i in 0..n {
        out[i].push(vals[sig0 + i]);
    }
    let (mut k1, mut k2, mut k3, mut k4, mut tmp) = (vec![0.0; nstates], vec![0.0; nstates], vec![0.0; nstates], vec![0.0; nstates], vec![0.0; nstates]);
    let mut blew = None;
    'outer: for step in 1..=outputs {
        for _ in 0..sub {
            // RK4 for the continuous states, discrete outputs held over the step.
            eval(t, &x, &held, &aux, &history, &mut vals, &mut stack);
            deriv(&vals, &x, &mut k1, &mut stack);
            for i in 0..nstates {
                tmp[i] = x[i] + 0.5 * h * k1[i];
            }
            eval(t + 0.5 * h, &tmp, &held, &aux, &history, &mut vals, &mut stack);
            deriv(&vals, &tmp, &mut k2, &mut stack);
            for i in 0..nstates {
                tmp[i] = x[i] + 0.5 * h * k2[i];
            }
            eval(t + 0.5 * h, &tmp, &held, &aux, &history, &mut vals, &mut stack);
            deriv(&vals, &tmp, &mut k3, &mut stack);
            for i in 0..nstates {
                tmp[i] = x[i] + h * k3[i];
            }
            eval(t + h, &tmp, &held, &aux, &history, &mut vals, &mut stack);
            deriv(&vals, &tmp, &mut k4, &mut stack);
            for i in 0..nstates {
                x[i] += h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
            }
            t += h;
            for s in &stmts {
                if let Kind::Integrator { lo, hi, .. } = s.kind {
                    x[s.s0] = x[s.s0].clamp(lo, hi);
                }
            }
            if x.iter().any(|v| !v.is_finite()) {
                blew = Some(t);
                break 'outer;
            }
            // Discrete updates with the signals at the end of the step.
            eval(t, &x, &held, &aux, &history, &mut vals, &mut stack);
            for (i, s) in stmts.iter().enumerate() {
                let u = || s.input.as_ref().map(|e| e.value(&vals)).unwrap_or(0.0);
                match &s.kind {
                    Kind::UnitDelay { ts, .. } => {
                        if t + 1e-12 >= next_sample[i] + ts {
                            next_sample[i] += ts;
                            held[i] = aux[i];
                            aux[i] = u();
                        }
                    }
                    Kind::Zoh { ts } => {
                        if t + 1e-12 >= next_sample[i] + ts {
                            next_sample[i] += ts;
                            held[i] = u();
                        }
                    }
                    Kind::Derivative => {
                        let v = u();
                        held[i] = (v - aux[i]) / h;
                        aux[i] = v;
                    }
                    Kind::RateLimit { rise, fall } => {
                        let v = u();
                        held[i] = v.clamp(held[i] - fall * h, held[i] + rise * h);
                    }
                    Kind::Relay { .. } => aux[i] = vals[sig0 + i],
                    Kind::Noise { std, mean, ts } => {
                        if t + 1e-12 >= next_sample[i] + ts {
                            next_sample[i] += ts;
                            held[i] = mean + std * rng.normal();
                        }
                    }
                    Kind::Delay { t: td, .. } => {
                        history[i].push((t, u()));
                        // Keep only what the delay can still reach.
                        let keep_from = t - td - 2.0 * h;
                        let cut = history[i].iter().position(|p| p.0 >= keep_from).unwrap_or(0).saturating_sub(1);
                        if cut > 1024 {
                            history[i].drain(..cut);
                        }
                    }
                    _ => {}
                }
            }
        }
        eval(t, &x, &held, &aux, &history, &mut vals, &mut stack);
        out_t.push(t);
        for i in 0..n {
            out[i].push(vals[sig0 + i]);
        }
        if step % 2048 == 0 {
            ctx.check()?;
            ctx.report(step as f64 / outputs as f64, "");
        }
    }
    if let Some(at) = blew {
        ctx.warn(format!("the simulation became unstable at t = {at:.5} (a state is not finite)"));
    }
    let mut table = Table::new("signals").with_x(Column::new("t", "s", out_t));
    for (i, s) in stmts.iter().enumerate() {
        if !s.name.starts_with('_') {
            table.push(Column::new(&s.name, "", std::mem::take(&mut out[i])));
        }
    }
    let mut d = Dataset::table(table);
    for c in d.tables[0].columns.iter().skip(1).take(12) {
        let last = *c.values.last().unwrap_or(&f64::NAN);
        d.scalars.push(crate::data::Scalar { name: format!("{} (end)", c.name), value: last, unit: String::new() });
    }
    d.scalar("blocks", n as f64, "").scalar("states", nstates as f64, "");
    // Step metrics of a chosen signal against its final value.
    let metric = ctx.str("measure", "");
    if !metric.trim().is_empty() {
        let tab = &d.tables[0];
        let y = tab.column(&metric)?.values.clone();
        let ts = tab.columns[0].values.clone();
        let target = *y.last().unwrap_or(&0.0);
        let info = super::dynamics::step_info(&ts, &y, y[0], target, 0.0);
        d.scalar("rise time", info.rise, "s").scalar("overshoot", info.overshoot, "%").scalar("settling time (2%)", info.settling, "s").scalar("peak", info.peak, "");
    }
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calls_and_args() {
        assert_eq!(call("tf(u, num=[1], den=[1, 2])").unwrap().0, "tf");
        assert!(call("sin(t)").is_none());
        assert!(call("step(t0=1) + 1").is_none());
        let a = Args::parse("pid", "r - y, kp = 2, ki=k*2", &[("k".into(), 0.5)]).unwrap();
        assert_eq!(a.positional, vec!["r - y"]);
        assert_eq!(a.num("ki", 0.0).unwrap(), 1.0);
        assert_eq!(split_top("a, b(1, 2), x = [1, 2]"), vec!["a", "b(1, 2)", "x = [1, 2]"]);
        let b = Args::parse("relay", "e >= 1, on = 2", &[]).unwrap();
        assert_eq!(b.positional, vec!["e >= 1"]);
    }
}
