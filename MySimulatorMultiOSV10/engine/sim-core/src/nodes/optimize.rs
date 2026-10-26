//! Optimisation: minimise an objective (Nelder–Mead, differential evolution,
//! BFGS, genetic algorithm, particle swarm, simulated annealing, pattern search) with bounds and constraints, fit a model formula to data
//! (Levenberg–Marquardt) and sweep the parameters of other nodes.

use super::input_table;
use crate::data::{aggregate, Column, Dataset, Grid, Table};
use crate::expr::{constants, statements, valid_name, Expr};
use crate::{execute, Ctx, Model, Progress};
use serde_json::Value;
use std::collections::HashSet;

struct Var {
    name: String,
    lo: f64,
    hi: f64,
    start: f64,
}

/// "x: -5 .. 5 = 1" (range and start optional).
fn parse_vars(text: &str, consts: &[(String, f64)]) -> Result<Vec<Var>, String> {
    let cnames: Vec<String> = consts.iter().map(|(n, _)| n.clone()).collect();
    let cvals: Vec<f64> = consts.iter().map(|(_, v)| *v).collect();
    let num = |s: &str| -> Result<f64, String> { Ok(Expr::with_names(s, &cnames)?.value(&cvals)) };
    let mut vars = Vec::new();
    for stmt in statements(text) {
        let (name, rest) = match stmt.split_once(':') {
            Some((n, r)) => (n.trim().to_string(), r.trim().to_string()),
            None => match stmt.split_once('=') {
                Some((n, r)) => (n.trim().to_string(), format!("= {}", r.trim())),
                None => (stmt.trim().to_string(), String::new()),
            },
        };
        if !valid_name(&name) {
            return Err(format!("\"{name}\" cannot be a variable name"));
        }
        let (range, start) = match rest.split_once('=') {
            Some((r, s)) => (r.trim().to_string(), Some(num(s.trim())?)),
            None => (rest.clone(), None),
        };
        let (lo, hi) = if range.is_empty() {
            (f64::NEG_INFINITY, f64::INFINITY)
        } else {
            let (a, b) = range.split_once("..").ok_or_else(|| format!("\"{stmt}\": write the range as low .. high"))?;
            (num(a.trim())?, num(b.trim())?)
        };
        if lo > hi {
            return Err(format!("{name}: the lower bound is above the upper one"));
        }
        let start = start.unwrap_or(if lo.is_finite() && hi.is_finite() { (lo + hi) / 2.0 } else if lo.is_finite() { lo } else if hi.is_finite() { hi } else { 0.0 });
        vars.push(Var { name, lo, hi, start: start.clamp(lo, hi) });
    }
    if vars.is_empty() {
        return Err("list the variables, e.g. x: -5 .. 5 = 1".into());
    }
    Ok(vars)
}

struct Constraint {
    lhs: Expr,
    rhs: Expr,
    kind: i8, // −1: ≤, 0: =, 1: ≥
}

fn parse_constraints(text: &str, names: &[String]) -> Result<Vec<Constraint>, String> {
    let mut out = Vec::new();
    for stmt in statements(text) {
        let (op, kind) = if stmt.contains("<=") { ("<=", -1) } else if stmt.contains(">=") { (">=", 1) } else if stmt.contains("==") { ("==", 0) } else if stmt.contains('<') { ("<", -1) } else if stmt.contains('>') { (">", 1) } else if stmt.contains('=') { ("=", 0) } else {
            return Err(format!("\"{stmt}\" is not a constraint (use <=, >= or =)"));
        };
        let (l, r) = stmt.split_once(op).unwrap();
        out.push(Constraint { lhs: Expr::with_names(l, names)?, rhs: Expr::with_names(r, names)?, kind });
    }
    Ok(out)
}

struct Problem {
    objective: Expr,
    constraints: Vec<Constraint>,
    base: Vec<f64>,
    nvars: usize,
    lo: Vec<f64>,
    hi: Vec<f64>,
    penalty: f64,
    evals: std::cell::Cell<usize>,
}

impl Problem {
    fn violation(&self, vals: &[f64], stack: &mut Vec<f64>) -> f64 {
        let mut v = 0.0;
        for c in &self.constraints {
            let d = c.lhs.eval(vals, stack) - c.rhs.eval(vals, stack);
            v += match c.kind {
                -1 => d.max(0.0).powi(2),
                1 => (-d).max(0.0).powi(2),
                _ => d * d,
            };
        }
        v
    }

    fn fill(&self, x: &[f64]) -> Vec<f64> {
        let mut vals = self.base.clone();
        vals[..self.nvars].copy_from_slice(x);
        vals
    }

    /// Penalised objective; outside the bounds it grows with the distance.
    fn f(&self, x: &[f64]) -> f64 {
        self.evals.set(self.evals.get() + 1);
        let mut stack = Vec::new();
        let mut out = 0.0;
        let clamped: Vec<f64> = x.iter().enumerate().map(|(i, v)| {
            let c = v.clamp(self.lo[i], self.hi[i]);
            out += (v - c).powi(2) * 1e6;
            c
        }).collect();
        let vals = self.fill(&clamped);
        let obj = self.objective.eval(&vals, &mut stack);
        if !obj.is_finite() {
            return f64::INFINITY;
        }
        obj + out + self.penalty * self.violation(&vals, &mut stack)
    }
}

struct Trace {
    iter: Vec<f64>,
    best: Vec<f64>,
    xs: Vec<Vec<f64>>,
}

impl Trace {
    fn push(&mut self, i: usize, f: f64, x: &[f64]) {
        self.iter.push(i as f64);
        self.best.push(f);
        self.xs.push(x.to_vec());
    }
}

fn nelder_mead(p: &Problem, x0: &[f64], max_iter: usize, tol: f64, trace: &mut Trace, cancel: &dyn Fn() -> bool) -> Result<(Vec<f64>, f64, usize, bool), String> {
    let n = x0.len();
    let mut simplex: Vec<Vec<f64>> = vec![x0.to_vec()];
    for i in 0..n {
        let mut v = x0.to_vec();
        let span = if p.lo[i].is_finite() && p.hi[i].is_finite() { (p.hi[i] - p.lo[i]) * 0.1 } else { 0.1 * x0[i].abs().max(1.0) };
        v[i] += if v[i] + span <= p.hi[i] { span } else { -span };
        simplex.push(v);
    }
    let mut fv: Vec<f64> = simplex.iter().map(|v| p.f(v)).collect();
    let mut it = 0;
    let mut converged = false;
    while it < max_iter {
        it += 1;
        let mut order: Vec<usize> = (0..=n).collect();
        order.sort_by(|&a, &b| fv[a].partial_cmp(&fv[b]).unwrap_or(std::cmp::Ordering::Equal));
        simplex = order.iter().map(|&i| simplex[i].clone()).collect();
        fv = order.iter().map(|&i| fv[i]).collect();
        trace.push(it, fv[0], &simplex[0]);
        let spread = (fv[n] - fv[0]).abs();
        let size = (1..=n).map(|i| simplex[i].iter().zip(&simplex[0]).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max)).fold(0.0, f64::max);
        if spread <= tol * (fv[0].abs() + tol) && size <= tol.sqrt() * (1.0 + simplex[0].iter().map(|v| v.abs()).fold(0.0, f64::max)) {
            converged = true;
            break;
        }
        if it % 200 == 0 && cancel() {
            return Err("cancelled".into());
        }
        let centroid: Vec<f64> = (0..n).map(|j| simplex[..n].iter().map(|v| v[j]).sum::<f64>() / n as f64).collect();
        let along = |t: f64| -> Vec<f64> { (0..n).map(|j| centroid[j] + t * (simplex[n][j] - centroid[j])).collect() };
        let xr = along(-1.0);
        let fr = p.f(&xr);
        if fr < fv[0] {
            let xe = along(-2.0);
            let fe = p.f(&xe);
            if fe < fr {
                simplex[n] = xe;
                fv[n] = fe;
            } else {
                simplex[n] = xr;
                fv[n] = fr;
            }
        } else if fr < fv[n - 1] {
            simplex[n] = xr;
            fv[n] = fr;
        } else {
            let (xc, fc) = if fr < fv[n] { let x = along(-0.5); let f = p.f(&x); (x, f) } else { let x = along(0.5); let f = p.f(&x); (x, f) };
            if fc < fv[n].min(fr) {
                simplex[n] = xc;
                fv[n] = fc;
            } else {
                for i in 1..=n {
                    simplex[i] = (0..n).map(|j| simplex[0][j] + 0.5 * (simplex[i][j] - simplex[0][j])).collect();
                    fv[i] = p.f(&simplex[i]);
                }
            }
        }
    }
    let best = (0..=n).min_by(|&a, &b| fv[a].partial_cmp(&fv[b]).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
    Ok((simplex[best].clone(), fv[best], it, converged))
}

fn differential_evolution(p: &Problem, x0: &[f64], max_iter: usize, tol: f64, rng: &mut crate::rng::Rng, trace: &mut Trace, cancel: &dyn Fn() -> bool) -> Result<(Vec<f64>, f64, usize, bool), String> {
    let n = x0.len();
    if p.lo.iter().chain(&p.hi).any(|v| !v.is_finite()) {
        return Err("differential evolution needs finite bounds for every variable (x: low .. high)".into());
    }
    let np = (10 * n).clamp(15, 200);
    let mut pop: Vec<Vec<f64>> = (0..np).map(|k| if k == 0 { x0.to_vec() } else { (0..n).map(|j| rng.range(p.lo[j], p.hi[j])).collect() }).collect();
    let mut fit: Vec<f64> = pop.iter().map(|v| p.f(v)).collect();
    let (f_w, cr) = (0.7, 0.9);
    let mut it = 0;
    let mut converged = false;
    while it < max_iter {
        it += 1;
        for i in 0..np {
            let pick = |rng: &mut crate::rng::Rng, not: &[usize]| loop {
                let k = rng.below(np);
                if !not.contains(&k) {
                    break k;
                }
            };
            let a = pick(rng, &[i]);
            let b = pick(rng, &[i, a]);
            let c = pick(rng, &[i, a, b]);
            let jr = rng.below(n);
            let trial: Vec<f64> = (0..n).map(|j| {
                if j == jr || rng.uniform() < cr {
                    (pop[a][j] + f_w * (pop[b][j] - pop[c][j])).clamp(p.lo[j], p.hi[j])
                } else {
                    pop[i][j]
                }
            }).collect();
            let ft = p.f(&trial);
            if ft <= fit[i] {
                pop[i] = trial;
                fit[i] = ft;
            }
        }
        let best = (0..np).min_by(|&a, &b| fit[a].partial_cmp(&fit[b]).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
        trace.push(it, fit[best], &pop[best]);
        let worst = fit.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        if (worst - fit[best]).abs() <= tol * (fit[best].abs() + tol) {
            converged = true;
            break;
        }
        if it % 20 == 0 && cancel() {
            return Err("cancelled".into());
        }
    }
    let best = (0..np).min_by(|&a, &b| fit[a].partial_cmp(&fit[b]).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
    Ok((pop[best].clone(), fit[best], it, converged))
}

fn need_bounds(p: &Problem, what: &str) -> Result<(), String> {
    if p.lo.iter().chain(&p.hi).any(|v| !v.is_finite()) {
        return Err(format!("{what} needs finite bounds for every variable (x: low .. high)"));
    }
    Ok(())
}

fn best_of(fit: &[f64]) -> usize {
    (0..fit.len()).min_by(|&a, &b| fit[a].partial_cmp(&fit[b]).unwrap_or(std::cmp::Ordering::Equal)).unwrap_or(0)
}

/// A real-coded genetic algorithm (MATLAB's ga): tournament selection, blend
/// crossover, Gaussian mutation shrinking over the generations, two elites.
fn genetic(p: &Problem, x0: &[f64], max_iter: usize, tol: f64, rng: &mut crate::rng::Rng, trace: &mut Trace, cancel: &dyn Fn() -> bool) -> Result<(Vec<f64>, f64, usize, bool), String> {
    need_bounds(p, "the genetic algorithm")?;
    let n = x0.len();
    let np = (15 * n).clamp(30, 300);
    let mut pop: Vec<Vec<f64>> = (0..np).map(|k| if k == 0 { x0.to_vec() } else { (0..n).map(|j| rng.range(p.lo[j], p.hi[j])).collect() }).collect();
    let mut fit: Vec<f64> = pop.iter().map(|v| p.f(v)).collect();
    let generations = max_iter.min(5000);
    let mut stall = 0;
    let mut last_best = f64::INFINITY;
    let mut it = 0;
    let mut converged = false;
    while it < generations {
        it += 1;
        let mut order: Vec<usize> = (0..np).collect();
        order.sort_by(|&a, &b| fit[a].partial_cmp(&fit[b]).unwrap_or(std::cmp::Ordering::Equal));
        let mut next: Vec<Vec<f64>> = order.iter().take(2).map(|&i| pop[i].clone()).collect();
        let tournament = |rng: &mut crate::rng::Rng| {
            let (a, b, c) = (rng.below(np), rng.below(np), rng.below(np));
            [a, b, c].into_iter().min_by(|&x, &y| fit[x].partial_cmp(&fit[y]).unwrap_or(std::cmp::Ordering::Equal)).unwrap()
        };
        let scale = 0.1 * (1.0 - it as f64 / generations as f64).max(0.05);
        while next.len() < np {
            let (pa, pb) = (tournament(rng), tournament(rng));
            let child: Vec<f64> = (0..n)
                .map(|j| {
                    // BLX-0.5 crossover then mutation.
                    let (a, b) = (pop[pa][j], pop[pb][j]);
                    let (lo, hi) = (a.min(b), a.max(b));
                    let d = hi - lo;
                    let mut v = rng.range(lo - 0.5 * d, hi + 0.5 * d);
                    if rng.uniform() < 0.2 {
                        v += rng.normal() * scale * (p.hi[j] - p.lo[j]);
                    }
                    v.clamp(p.lo[j], p.hi[j])
                })
                .collect();
            next.push(child);
        }
        pop = next;
        fit = pop.iter().map(|v| p.f(v)).collect();
        let b = best_of(&fit);
        trace.push(it, fit[b], &pop[b]);
        if last_best - fit[b] <= tol * (fit[b].abs() + tol) {
            stall += 1;
        } else {
            stall = 0;
        }
        last_best = last_best.min(fit[b]);
        if stall >= 50 {
            converged = true;
            break;
        }
        if it % 10 == 0 && cancel() {
            return Err("cancelled".into());
        }
    }
    let b = best_of(&fit);
    Ok((pop[b].clone(), fit[b], it, converged))
}

/// Particle swarm optimisation (MATLAB's particleswarm): inertia 0.73, c1 = c2 = 1.5.
fn particle_swarm(p: &Problem, x0: &[f64], max_iter: usize, tol: f64, rng: &mut crate::rng::Rng, trace: &mut Trace, cancel: &dyn Fn() -> bool) -> Result<(Vec<f64>, f64, usize, bool), String> {
    need_bounds(p, "the particle swarm")?;
    let n = x0.len();
    let np = (10 * n).clamp(20, 200);
    let mut x: Vec<Vec<f64>> = (0..np).map(|k| if k == 0 { x0.to_vec() } else { (0..n).map(|j| rng.range(p.lo[j], p.hi[j])).collect() }).collect();
    let mut v: Vec<Vec<f64>> = (0..np).map(|_| (0..n).map(|j| rng.range(-1.0, 1.0) * 0.1 * (p.hi[j] - p.lo[j])).collect()).collect();
    let mut pbest = x.clone();
    let mut pfit: Vec<f64> = x.iter().map(|q| p.f(q)).collect();
    let mut g = best_of(&pfit);
    let (w, c1, c2) = (0.729, 1.49445, 1.49445);
    let mut it = 0;
    let mut stall = 0;
    let mut converged = false;
    while it < max_iter.min(10_000) {
        it += 1;
        let before = pfit[g];
        for i in 0..np {
            for j in 0..n {
                v[i][j] = w * v[i][j] + c1 * rng.uniform() * (pbest[i][j] - x[i][j]) + c2 * rng.uniform() * (pbest[g][j] - x[i][j]);
                x[i][j] = (x[i][j] + v[i][j]).clamp(p.lo[j], p.hi[j]);
            }
            let f = p.f(&x[i]);
            if f < pfit[i] {
                pfit[i] = f;
                pbest[i] = x[i].clone();
            }
        }
        g = best_of(&pfit);
        trace.push(it, pfit[g], &pbest[g]);
        if before - pfit[g] <= tol * (pfit[g].abs() + tol) {
            stall += 1;
        } else {
            stall = 0;
        }
        if stall >= 40 {
            converged = true;
            break;
        }
        if it % 10 == 0 && cancel() {
            return Err("cancelled".into());
        }
    }
    Ok((pbest[g].clone(), pfit[g], it, converged))
}

/// Simulated annealing (MATLAB's simulannealbnd): Gaussian steps scaled by the temperature, exponential cooling.
fn annealing(p: &Problem, x0: &[f64], max_iter: usize, _tol: f64, rng: &mut crate::rng::Rng, trace: &mut Trace, cancel: &dyn Fn() -> bool) -> Result<(Vec<f64>, f64, usize, bool), String> {
    need_bounds(p, "simulated annealing")?;
    let n = x0.len();
    let mut x = x0.to_vec();
    let mut fx = p.f(&x);
    let (mut best, mut fbest) = (x.clone(), fx);
    let iters = (max_iter * 20).clamp(1000, 200_000);
    let mut temp = 1.0f64;
    let cool = (1e-4f64).powf(1.0 / iters as f64);
    for it in 1..=iters {
        let cand: Vec<f64> = (0..n).map(|j| (x[j] + rng.normal() * temp.sqrt() * 0.2 * (p.hi[j] - p.lo[j])).clamp(p.lo[j], p.hi[j])).collect();
        let fc = p.f(&cand);
        let scale = fbest.abs().max(1e-12);
        if fc <= fx || rng.uniform() < (-(fc - fx) / (temp * scale)).exp() {
            x = cand;
            fx = fc;
            if fx < fbest {
                fbest = fx;
                best = x.clone();
            }
        }
        temp *= cool;
        if it % 100 == 0 {
            trace.push(it / 100, fbest, &best);
            if cancel() {
                return Err("cancelled".into());
            }
        }
        // Reanneal from the best point now and then.
        if it % (iters / 10).max(1) == 0 {
            x = best.clone();
            fx = fbest;
        }
    }
    Ok((best, fbest, iters, true))
}

/// Generalised pattern search (MATLAB's patternsearch): poll ±each coordinate, expand on success, contract on failure.
fn pattern_search(p: &Problem, x0: &[f64], max_iter: usize, tol: f64, _rng: &mut crate::rng::Rng, trace: &mut Trace, cancel: &dyn Fn() -> bool) -> Result<(Vec<f64>, f64, usize, bool), String> {
    let n = x0.len();
    let mut x = x0.to_vec();
    let mut fx = p.f(&x);
    let mut mesh: Vec<f64> = (0..n).map(|j| if p.lo[j].is_finite() && p.hi[j].is_finite() { 0.25 * (p.hi[j] - p.lo[j]) } else { x[j].abs().max(1.0) }).collect();
    let mut it = 0;
    let mut converged = false;
    while it < max_iter {
        it += 1;
        let mut improved = false;
        'poll: for j in 0..n {
            for s in [1.0, -1.0] {
                let mut y = x.clone();
                y[j] = (y[j] + s * mesh[j]).clamp(p.lo[j], p.hi[j]);
                let fy = p.f(&y);
                if fy < fx {
                    x = y;
                    fx = fy;
                    improved = true;
                    break 'poll;
                }
            }
        }
        for m in mesh.iter_mut() {
            *m *= if improved { 2.0 } else { 0.5 };
        }
        trace.push(it, fx, &x);
        if mesh.iter().zip(&x).all(|(m, v)| *m <= tol.sqrt() * v.abs().max(1.0)) {
            converged = true;
            break;
        }
        if it % 50 == 0 && cancel() {
            return Err("cancelled".into());
        }
    }
    Ok((x, fx, it, converged))
}

fn gradient(p: &Problem, x: &[f64]) -> Vec<f64> {
    (0..x.len()).map(|i| {
        let h = 1e-6 * x[i].abs().max(1e-3);
        let mut a = x.to_vec();
        let mut b = x.to_vec();
        a[i] += h;
        b[i] -= h;
        (p.f(&a) - p.f(&b)) / (2.0 * h)
    }).collect()
}

fn bfgs(p: &Problem, x0: &[f64], max_iter: usize, tol: f64, trace: &mut Trace, cancel: &dyn Fn() -> bool) -> Result<(Vec<f64>, f64, usize, bool), String> {
    let n = x0.len();
    let mut x = x0.to_vec();
    let mut fx = p.f(&x);
    let mut g = gradient(p, &x);
    let mut hinv = crate::linalg::identity(n);
    let mut it = 0;
    let mut converged = false;
    while it < max_iter {
        it += 1;
        trace.push(it, fx, &x);
        let gnorm = g.iter().map(|v| v * v).sum::<f64>().sqrt();
        if gnorm < tol.sqrt() {
            converged = true;
            break;
        }
        let d: Vec<f64> = crate::linalg::matvec(&hinv, &g).iter().map(|v| -v).collect();
        let slope: f64 = d.iter().zip(&g).map(|(a, b)| a * b).sum();
        let (d, slope) = if slope >= 0.0 { hinv = crate::linalg::identity(n); (g.iter().map(|v| -v).collect::<Vec<_>>(), -gnorm * gnorm) } else { (d, slope) };
        // Backtracking line search (Armijo).
        let mut step = 1.0;
        let mut xn;
        let mut fxn;
        loop {
            xn = x.iter().zip(&d).map(|(a, b)| a + step * b).collect::<Vec<_>>();
            fxn = p.f(&xn);
            if fxn <= fx + 1e-4 * step * slope || step < 1e-12 {
                break;
            }
            step *= 0.5;
        }
        if step < 1e-12 {
            converged = (fx - fxn).abs() < tol;
            break;
        }
        let gn = gradient(p, &xn);
        let s: Vec<f64> = xn.iter().zip(&x).map(|(a, b)| a - b).collect();
        let y: Vec<f64> = gn.iter().zip(&g).map(|(a, b)| a - b).collect();
        let sy: f64 = s.iter().zip(&y).map(|(a, b)| a * b).sum();
        if sy > 1e-12 {
            let hy = crate::linalg::matvec(&hinv, &y);
            let yhy: f64 = y.iter().zip(&hy).map(|(a, b)| a * b).sum();
            for i in 0..n {
                for j in 0..n {
                    hinv[i][j] += (sy + yhy) * s[i] * s[j] / (sy * sy) - (hy[i] * s[j] + s[i] * hy[j]) / sy;
                }
            }
        }
        let df = (fx - fxn).abs();
        x = xn;
        fx = fxn;
        g = gn;
        if df <= tol * (fx.abs() + tol) && it > 2 {
            converged = true;
            trace.push(it + 1, fx, &x);
            break;
        }
        if it % 50 == 0 && cancel() {
            return Err("cancelled".into());
        }
    }
    Ok((x, fx, it, converged))
}

pub fn minimize(ctx: &mut Ctx) -> Result<Dataset, String> {
    let consts = constants(&ctx.str("constants", ""))?;
    let vars = parse_vars(&ctx.str("variables", "x: -5 .. 5 = 1\ny: -5 .. 5 = 1"), &consts)?;
    let mut names: Vec<String> = vars.iter().map(|v| v.name.clone()).collect();
    names.extend(consts.iter().map(|(n, _)| n.clone()));
    let objective = Expr::with_names(&ctx.str("objective", "(1 - x)^2 + 100*(y - x^2)^2"), &names)?;
    let constraints = parse_constraints(&ctx.str("constraints", ""), &names)?;
    let maximize = ctx.str("goal", "minimize") == "maximize";
    let objective = if maximize { Expr::with_names(&format!("-({})", objective.source), &names)? } else { objective };
    let mut base = vec![0.0; names.len()];
    for (i, (_, v)) in consts.iter().enumerate() {
        base[vars.len() + i] = *v;
    }
    let problem = Problem {
        objective,
        constraints,
        base,
        nvars: vars.len(),
        lo: vars.iter().map(|v| v.lo).collect(),
        hi: vars.iter().map(|v| v.hi).collect(),
        penalty: ctx.positive("penalty", 1e6)?,
        evals: std::cell::Cell::new(0),
    };
    let x0: Vec<f64> = vars.iter().map(|v| v.start).collect();
    let max_iter = ctx.count("maxIterations", 2000, 1, 10_000_000)?;
    let tol = ctx.positive("tolerance", 1e-10)?;
    let method = ctx.str("method", "nelderMead");
    let mut trace = Trace { iter: Vec::new(), best: Vec::new(), xs: Vec::new() };
    let mut rng = ctx.rng();
    let (x, _, iters, converged) = match method.as_str() {
        "nelderMead" => nelder_mead(&problem, &x0, max_iter, tol, &mut trace, ctx.cancel)?,
        "de" => differential_evolution(&problem, &x0, max_iter, tol, &mut rng, &mut trace, ctx.cancel)?,
        "bfgs" => bfgs(&problem, &x0, max_iter, tol, &mut trace, ctx.cancel)?,
        "ga" => genetic(&problem, &x0, max_iter, tol, &mut rng, &mut trace, ctx.cancel)?,
        "pso" => particle_swarm(&problem, &x0, max_iter, tol, &mut rng, &mut trace, ctx.cancel)?,
        "sa" => annealing(&problem, &x0, max_iter, tol, &mut rng, &mut trace, ctx.cancel)?,
        "patternsearch" => pattern_search(&problem, &x0, max_iter, tol, &mut rng, &mut trace, ctx.cancel)?,
        other => return Err(format!("unknown method \"{other}\" (nelderMead, de, bfgs, ga, pso, sa, patternsearch)")),
    };
    let x: Vec<f64> = x.iter().enumerate().map(|(i, v)| v.clamp(problem.lo[i], problem.hi[i])).collect();
    let vals = problem.fill(&x);
    let mut stack = Vec::new();
    let raw = problem.objective.eval(&vals, &mut stack);
    let f_value = if maximize { -raw } else { raw };
    let violation = problem.violation(&vals, &mut stack).sqrt();
    if !converged {
        ctx.warn(format!("not converged in {iters} iterations"));
    }
    if violation > 1e-6 {
        ctx.warn(format!("the constraints are violated by {violation:.3e}"));
    }
    let mut hist = Table::new("history").with_x(Column::new("iteration", "", trace.iter.clone()));
    hist.push(Column::new("objective", "", trace.best.iter().map(|v| if maximize { -v } else { *v }).collect()));
    for (j, v) in vars.iter().enumerate() {
        hist.push(Column::new(&v.name, "", trace.xs.iter().map(|x| x[j]).collect()));
    }
    let mut res = Table::new("optimum");
    res.push(Column::text("variable", vars.iter().map(|v| v.name.clone()).collect()));
    res.push(Column::new("value", "", x.clone()));
    res.push(Column::new("start", "", x0.clone()));
    res.push(Column::new("low", "", problem.lo.clone()));
    res.push(Column::new("high", "", problem.hi.clone()));
    let mut d = Dataset { tables: vec![hist, res], ..Default::default() };
    // Two finite-bounded variables: the objective as a map for the picture.
    if vars.len() == 2 && problem.lo.iter().chain(&problem.hi).all(|v| v.is_finite()) {
        let m = 80;
        let gx: Vec<f64> = (0..m).map(|k| problem.lo[0] + (problem.hi[0] - problem.lo[0]) * k as f64 / (m - 1) as f64).collect();
        let gy: Vec<f64> = (0..m).map(|k| problem.lo[1] + (problem.hi[1] - problem.lo[1]) * k as f64 / (m - 1) as f64).collect();
        let mut z = Vec::with_capacity(m * m);
        let mut vals = problem.base.clone();
        let log = ctx.flag("logMap", true);
        for &yv in &gy {
            for &xv in &gx {
                vals[0] = xv;
                vals[1] = yv;
                let v = problem.objective.eval(&vals, &mut stack);
                let v = if maximize { -v } else { v };
                z.push(if log && !maximize { (v - f_value).max(0.0).ln_1p() } else { v });
            }
        }
        d.grids.push(Grid { name: "objective".into(), x: gx, y: gy, z, x_label: vars[0].name.clone(), y_label: vars[1].name.clone(), z_label: if log && !maximize { "ln(1 + f − f*)".into() } else { "f".into() }, x_names: None, y_names: None });
    }
    d.scalar("optimum", f_value, "").scalar("iterations", iters as f64, "").scalar("evaluations", problem.evals.get() as f64, "").scalar("converged", if converged { 1.0 } else { 0.0 }, "");
    for (v, value) in vars.iter().zip(&x) {
        d.scalar(&v.name, *value, "");
    }
    d.text = format!("{} = {} at {}", if maximize { "max" } else { "min" }, crate::data::g(f_value, 8), vars.iter().zip(&x).map(|(v, value)| format!("{} = {}", v.name, crate::data::g(*value, 8))).collect::<Vec<_>>().join(", "));
    Ok(d)
}

/// Least-squares fit of y = f(x; parameters) by Levenberg–Marquardt.
pub fn fit(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let xcol = table.pick_x(&ctx.str("x", ""));
    let ycol = table.pick(&ctx.str("y", ""))?.clone();
    let start = constants(&ctx.str("parameters", "a = 1, b = 1"))?;
    if start.is_empty() {
        return Err("list the parameters with start values, e.g. a = 1, b = 0.5".into());
    }
    let xname = ctx.str("variable", "x");
    let mut names: Vec<String> = vec![xname.clone()];
    names.extend(start.iter().map(|(n, _)| n.clone()));
    let model = Expr::with_names(&ctx.str("model", "a*exp(-b*x)"), &names)?;
    let rows: Vec<usize> = (0..xcol.values.len().min(ycol.values.len())).filter(|&i| xcol.values[i].is_finite() && ycol.values[i].is_finite()).collect();
    let np = start.len();
    if rows.len() <= np {
        return Err(format!("{} points are too few for {np} parameters", rows.len()));
    }
    let xs: Vec<f64> = rows.iter().map(|&i| xcol.values[i]).collect();
    let ys: Vec<f64> = rows.iter().map(|&i| ycol.values[i]).collect();
    let mut p: Vec<f64> = start.iter().map(|(_, v)| *v).collect();
    let mut stack = Vec::new();
    let mut vals = vec![0.0; np + 1];
    let mut eval = |p: &[f64], x: f64, stack: &mut Vec<f64>| -> f64 {
        vals[0] = x;
        vals[1..].copy_from_slice(p);
        model.eval(&vals, stack)
    };
    let sse = |p: &[f64], stack: &mut Vec<f64>, eval: &mut dyn FnMut(&[f64], f64, &mut Vec<f64>) -> f64| -> f64 { xs.iter().zip(&ys).map(|(x, y)| (y - eval(p, *x, stack)).powi(2)).sum() };
    let mut cost = sse(&p, &mut stack, &mut eval);
    if !cost.is_finite() {
        return Err("the model is not finite at the start values: choose other start values".into());
    }
    let mut lambda = 1e-3;
    let max_iter = ctx.count("maxIterations", 200, 1, 100_000)?;
    let mut it = 0;
    let mut converged = false;
    let mut jtj = vec![vec![0.0; np]; np];
    while it < max_iter {
        it += 1;
        // Jacobian by forward differences.
        let base: Vec<f64> = xs.iter().map(|x| eval(&p, *x, &mut stack)).collect();
        let mut jac = vec![vec![0.0; np]; xs.len()];
        for k in 0..np {
            let h = 1e-7 * p[k].abs().max(1e-6);
            let mut q = p.clone();
            q[k] += h;
            for (i, x) in xs.iter().enumerate() {
                jac[i][k] = (eval(&q, *x, &mut stack) - base[i]) / h;
            }
        }
        let r: Vec<f64> = ys.iter().zip(&base).map(|(y, f)| y - f).collect();
        jtj = vec![vec![0.0; np]; np];
        let mut jtr = vec![0.0; np];
        for i in 0..xs.len() {
            for a in 0..np {
                jtr[a] += jac[i][a] * r[i];
                for b in 0..np {
                    jtj[a][b] += jac[i][a] * jac[i][b];
                }
            }
        }
        let mut improved = false;
        for _ in 0..30 {
            let mut m = jtj.clone();
            for a in 0..np {
                m[a][a] += lambda * jtj[a][a].max(1e-12);
            }
            let step = match crate::linalg::solve(&m, &jtr) {
                Ok(s) => s,
                Err(_) => {
                    lambda *= 10.0;
                    continue;
                }
            };
            let q: Vec<f64> = p.iter().zip(&step).map(|(a, b)| a + b).collect();
            let c = sse(&q, &mut stack, &mut eval);
            if c.is_finite() && c < cost {
                let rel = (cost - c) / cost.max(1e-300);
                p = q;
                cost = c;
                lambda = (lambda / 3.0).max(1e-12);
                improved = true;
                if rel < 1e-12 || step.iter().zip(&p).all(|(s, v)| s.abs() <= 1e-10 * (v.abs() + 1e-10)) {
                    converged = true;
                }
                break;
            }
            lambda *= 4.0;
        }
        if !improved {
            converged = true;
            break;
        }
        if converged {
            break;
        }
    }
    let dof = (xs.len() - np).max(1) as f64;
    let s2 = cost / dof;
    let cov = crate::linalg::inverse(&jtj).ok();
    let se: Vec<f64> = (0..np).map(|k| cov.as_ref().map_or(f64::NAN, |c| (s2 * c[k][k]).sqrt())).collect();
    let fitted: Vec<f64> = (0..table.rows()).map(|i| xcol.values.get(i).map_or(f64::NAN, |x| eval(&p, *x, &mut stack))).collect();
    let ym = ys.iter().sum::<f64>() / ys.len() as f64;
    let sst: f64 = ys.iter().map(|y| (y - ym).powi(2)).sum();
    let mut out = Table::new("fit").with_x(Column::new(&xcol.name, &xcol.unit, xcol.values.clone()));
    out.push(Column::new(&ycol.name, &ycol.unit, ycol.values.clone()));
    out.push(Column::new("fit", &ycol.unit, fitted.clone()));
    out.push(Column::new("residual", &ycol.unit, ycol.values.iter().zip(&fitted).map(|(a, b)| a - b).collect()));
    let lo = xs.iter().cloned().fold(f64::INFINITY, f64::min);
    let hi = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let gx: Vec<f64> = (0..300).map(|k| lo + (hi - lo) * k as f64 / 299.0).collect();
    let mut curve = Table::new("curve").with_x(Column::new(&xcol.name, &xcol.unit, gx.clone()));
    curve.push(Column::new("fit", &ycol.unit, gx.iter().map(|x| eval(&p, *x, &mut stack)).collect()));
    let mut pt = Table::new("parameters");
    pt.push(Column::text("parameter", start.iter().map(|(n, _)| n.clone()).collect()));
    pt.push(Column::new("value", "", p.clone()));
    pt.push(Column::new("std error", "", se.clone()));
    pt.push(Column::new("95% low", "", p.iter().zip(&se).map(|(v, s)| v - 1.96 * s).collect()));
    pt.push(Column::new("95% high", "", p.iter().zip(&se).map(|(v, s)| v + 1.96 * s).collect()));
    pt.push(Column::new("start", "", start.iter().map(|(_, v)| *v).collect()));
    let mut d = Dataset { tables: vec![out, curve, pt], ..Default::default() };
    d.scalar("R²", if sst > 0.0 { 1.0 - cost / sst } else { f64::NAN }, "").scalar("RMSE", (cost / xs.len() as f64).sqrt(), &ycol.unit).scalar("iterations", it as f64, "").scalar("converged", if converged { 1.0 } else { 0.0 }, "");
    for ((n, _), v) in start.iter().zip(&p) {
        d.scalar(n, *v, "");
    }
    let mut formula = model.source.clone();
    for ((n, _), v) in start.iter().zip(&p) {
        formula = replace_word(&formula, n, &crate::data::g(*v, 6));
    }
    d.text = format!("{} = {formula}", ycol.name);
    Ok(d)
}

fn replace_word(text: &str, word: &str, by: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let w: Vec<char> = word.chars().collect();
    let mut i = 0;
    let is_id = |c: char| c.is_alphanumeric() || c == '_';
    while i < chars.len() {
        if chars[i..].starts_with(&w) && (i == 0 || !is_id(chars[i - 1])) && chars.get(i + w.len()).is_none_or(|c| !is_id(*c)) {
            out.push_str(by);
            i += w.len();
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// Values of a sweep axis: from..to in steps, or an explicit list.
fn sweep_values(ctx: &Ctx, prefix: &str) -> Result<Vec<f64>, String> {
    let list = ctx.str(&format!("{prefix}values"), "");
    if !list.trim().is_empty() {
        return crate::expr::number_list(&list);
    }
    let from = ctx.num(&format!("{prefix}from"), 0.0)?;
    let to = ctx.num(&format!("{prefix}to"), 1.0)?;
    let steps = ctx.count(&format!("{prefix}steps"), 11, 1, 100_000)?;
    let log = ctx.flag(&format!("{prefix}log"), false);
    if log && (from <= 0.0 || to <= 0.0) {
        return Err("a logarithmic sweep needs positive limits".into());
    }
    Ok((0..steps)
        .map(|k| {
            let f = if steps == 1 { 0.0 } else { k as f64 / (steps - 1) as f64 };
            if log { from * (to / from).powf(f) } else { from + (to - from) * f }
        })
        .collect())
}

/// Reruns part of the pipeline with a node parameter set to each value; collects a metric.
pub fn sweep(ctx: &mut Ctx) -> Result<Dataset, String> {
    if ctx.depth > 0 {
        return Err("a sweep cannot run inside another sweep".into());
    }
    let model: &Model = ctx.model;
    let find = |id: &str| -> Result<&crate::Node, String> {
        model.nodes.iter().find(|n| n.id == id.trim() || n.name == id.trim()).ok_or_else(|| format!("no node \"{id}\" in the pipeline"))
    };
    let target = find(&ctx.str("node", ""))?;
    let param = ctx.str("param", "");
    if param.trim().is_empty() {
        return Err("choose the parameter to sweep".into());
    }
    let values = sweep_values(ctx, "")?;
    let node2 = ctx.str("node2", "");
    let second = if node2.trim().is_empty() { None } else { Some((find(&node2)?, ctx.str("param2", ""), sweep_values(ctx, "2")?)) };
    let metric_node = find(&ctx.str("metricNode", ""))?;
    let metric = ctx.str("metric", "");
    let how = ctx.str("aggregate", "max");
    if metric.trim().is_empty() {
        return Err("choose the metric: a result value of the metric node, or a column with an aggregate".into());
    }
    if metric_node.kind == "opt.sweep" || target.kind == "opt.sweep" {
        return Err("a sweep cannot target another sweep".into());
    }
    let targets: HashSet<String> = std::iter::once(metric_node.id.clone()).collect();
    let combos: Vec<(f64, Option<f64>)> = match &second {
        None => values.iter().map(|v| (*v, None)).collect(),
        Some((_, _, v2)) => v2.iter().flat_map(|b| values.iter().map(move |a| (*a, Some(*b)))).collect(),
    };
    let total = combos.len();
    let mut metrics = Vec::with_capacity(total);
    let mut failures = 0;
    for (k, (a, b)) in combos.iter().enumerate() {
        ctx.check()?;
        ctx.report(k as f64 / total as f64, &format!("{} / {total}", k + 1));
        let mut m = model.clone();
        set_param(&mut m, &target.id, &param, *a);
        if let (Some((n2, p2, _)), Some(b)) = (&second, b) {
            set_param(&mut m, &n2.id, p2, *b);
        }
        let outcomes = execute(&m, Some(&targets), ctx.host, ctx.cancel, &mut |_: &Progress| {}, ctx.depth + 1)?;
        let out = outcomes.iter().find(|o| o.id == metric_node.id);
        let value = match out.and_then(|o| o.data.as_ref()) {
            None => {
                failures += 1;
                if failures == 1 {
                    let why = out.and_then(|o| o.error.clone()).unwrap_or_default();
                    ctx.warn(format!("{} = {a}: the metric node failed ({why})", param));
                }
                f64::NAN
            }
            Some(data) => match data.get_scalar(&metric) {
                Some(v) => v,
                None => {
                    let col = data.tables.iter().find_map(|t| t.find(&metric).map(|i| t.columns[i].values.clone()));
                    match col {
                        Some(values) => aggregate(&values, &how)?,
                        None => return Err(format!("the metric node has no result value or column \"{metric}\"")),
                    }
                }
            },
        };
        metrics.push(value);
    }
    let label = format!("{} · {metric}", metric_node.name);
    let mut d = Dataset::default();
    match &second {
        None => {
            let mut t = Table::new("sweep").with_x(Column::new(&param, "", values.clone()));
            t.push(Column::new(&label, "", metrics.clone()));
            d.tables.push(t);
            let best = (0..metrics.len()).filter(|&i| metrics[i].is_finite()).min_by(|&a, &b| metrics[a].partial_cmp(&metrics[b]).unwrap());
            let worst = (0..metrics.len()).filter(|&i| metrics[i].is_finite()).max_by(|&a, &b| metrics[a].partial_cmp(&metrics[b]).unwrap());
            if let (Some(lo), Some(hi)) = (best, worst) {
                d.scalar("min metric", metrics[lo], "").scalar(&format!("{param} at min"), values[lo], "").scalar("max metric", metrics[hi], "").scalar(&format!("{param} at max"), values[hi], "");
            }
        }
        Some((_, p2, v2)) => {
            let mut t = Table::new("sweep");
            t.push(Column::new(&param, "", combos.iter().map(|c| c.0).collect()));
            t.push(Column::new(p2, "", combos.iter().map(|c| c.1.unwrap()).collect()));
            t.push(Column::new(&label, "", metrics.clone()));
            d.tables.push(t);
            d.grids.push(Grid { name: "sweep".into(), x: values.clone(), y: v2.clone(), z: metrics.clone(), x_label: param.clone(), y_label: p2.clone(), z_label: label.clone(), x_names: None, y_names: None });
        }
    }
    d.scalar("runs", total as f64, "").scalar("failed runs", failures as f64, "");
    Ok(d)
}

fn set_param(model: &mut Model, node: &str, key: &str, value: f64) {
    if let Some(n) = model.nodes.iter_mut().find(|n| n.id == node) {
        n.params.insert(key.to_string(), serde_json::Number::from_f64(value).map(Value::Number).unwrap_or(Value::Null));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn problem(obj: &str, lo: f64, hi: f64) -> Problem {
        let names = vec!["x".to_string(), "y".to_string()];
        Problem { objective: Expr::with_names(obj, &names).unwrap(), constraints: Vec::new(), base: vec![0.0, 0.0], nvars: 2, lo: vec![lo, lo], hi: vec![hi, hi], penalty: 1e6, evals: std::cell::Cell::new(0) }
    }

    #[test]
    fn rosenbrock() {
        let p = problem("(1 - x)^2 + 100*(y - x^2)^2", -5.0, 5.0);
        let mut trace = Trace { iter: Vec::new(), best: Vec::new(), xs: Vec::new() };
        let (x, f, _, _) = nelder_mead(&p, &[-1.0, 2.0], 5000, 1e-14, &mut trace, &|| false).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-4 && (x[1] - 1.0).abs() < 1e-4 && f < 1e-8, "{x:?} {f}");
        let (x, _, _, _) = bfgs(&p, &[-1.0, 2.0], 5000, 1e-14, &mut trace, &|| false).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-3, "{x:?}");
        let mut rng = crate::rng::Rng::new(3);
        let p2 = problem("(x - 2)^2 + (y + 1)^2", -5.0, 5.0);
        let (x, _, _, _) = differential_evolution(&p2, &[0.0, 0.0], 2000, 1e-12, &mut rng, &mut trace, &|| false).unwrap();
        assert!((x[0] - 2.0).abs() < 1e-3 && (x[1] + 1.0).abs() < 1e-3, "{x:?}");
    }

    #[test]
    fn variables_text() {
        let v = parse_vars("x: -1 .. 3 = 2\ny = 5\nz: 0 .. 10", &[]).unwrap();
        assert_eq!((v[0].lo, v[0].hi, v[0].start), (-1.0, 3.0, 2.0));
        assert_eq!(v[1].start, 5.0);
        assert_eq!(v[2].start, 5.0);
        assert_eq!(replace_word("a*exp(-ab*x)+a", "a", "2"), "2*exp(-ab*x)+2");
    }
}
