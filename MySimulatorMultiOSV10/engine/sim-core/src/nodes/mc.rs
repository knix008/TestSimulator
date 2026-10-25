//! Monte Carlo: propagate uncertain inputs (distributions) through formulas,
//! with statistics, probabilities, sensitivities and convergence; and
//! stochastic processes (random walk, geometric Brownian motion,
//! Ornstein–Uhlenbeck).

use super::stats::spearman;
use crate::data::{mean, quantile_sorted, sorted_finite, std_dev, Column, Dataset, Table};
use crate::expr::{constants, statements, valid_name, Expr};
use crate::rng::Dist;
use crate::Ctx;

enum Def {
    /// name ~ dist(args)
    Random(String, Dist),
    /// name = expression
    Derived(String, Expr),
}

/// "L ~ normal(100, 0.5)" / "A = L * W".
fn parse_defs(text: &str, consts: &[(String, f64)]) -> Result<Vec<Def>, String> {
    let mut names: Vec<String> = consts.iter().map(|(n, _)| n.clone()).collect();
    let cvals: Vec<f64> = consts.iter().map(|(_, v)| *v).collect();
    let mut defs = Vec::new();
    for stmt in statements(text) {
        if let Some((name, rhs)) = stmt.split_once('~') {
            let name = name.trim().to_string();
            if !valid_name(&name) {
                return Err(format!("\"{name}\" cannot be a variable name"));
            }
            let rhs = rhs.trim();
            let open = rhs.find('(').ok_or_else(|| format!("\"{rhs}\": write a distribution like normal(10, 1)"))?;
            if !rhs.ends_with(')') {
                return Err(format!("\"{rhs}\": missing ')'"));
            }
            let dist_name = rhs[..open].trim();
            let args: Vec<f64> = split_args(&rhs[open + 1..rhs.len() - 1])
                .iter()
                .map(|a| Expr::with_names(a, &consts.iter().map(|(n, _)| n.clone()).collect::<Vec<_>>()).map(|e| e.value(&cvals)))
                .collect::<Result<_, _>>()?;
            defs.push(Def::Random(name.clone(), Dist::parse(dist_name, &args)?));
            names.push(name);
        } else if let Some((name, rhs)) = stmt.split_once('=') {
            let name = name.trim().to_string();
            if !valid_name(&name) {
                return Err(format!("\"{name}\" cannot be a variable name"));
            }
            defs.push(Def::Derived(name.clone(), Expr::with_names(rhs, &names)?));
            names.push(name);
        } else {
            return Err(format!("\"{stmt}\": write name ~ distribution(…) or name = expression"));
        }
    }
    Ok(defs)
}

fn split_args(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0;
    let mut cur = String::new();
    for ch in text.chars() {
        match ch {
            '(' => {
                depth += 1;
                cur.push(ch);
            }
            ')' => {
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

pub fn simulate(ctx: &mut Ctx) -> Result<Dataset, String> {
    let consts = constants(&ctx.str("constants", ""))?;
    let defs = parse_defs(&ctx.str("model", ""), &consts)?;
    if defs.is_empty() {
        return Err("write the model: inputs like x ~ normal(0, 1) and outputs like y = x^2".into());
    }
    let n = ctx.count("samples", 10000, 10, 20_000_000)?;
    let lhs = ctx.str("sampling", "random") == "lhs";
    let mut rng = ctx.rng();
    let nc = consts.len();
    let nv = defs.len();
    // Latin hypercube: a shuffled stratum per random input.
    let mut strata: Vec<Vec<usize>> = Vec::new();
    if lhs {
        for d in &defs {
            if let Def::Random(_, dist) = d {
                if dist.inverse(0.5).is_none() {
                    ctx.warn("Latin hypercube needs an inverse CDF; gamma, beta, bernoulli and poisson inputs are sampled at random");
                }
                let mut s: Vec<usize> = (0..n).collect();
                rng.shuffle(&mut s);
                strata.push(s);
            }
        }
    }
    let mut cols: Vec<Vec<f64>> = vec![Vec::with_capacity(n); nv];
    let mut vals = vec![0.0; nc + nv];
    for (i, (_, v)) in consts.iter().enumerate() {
        vals[i] = *v;
    }
    let mut stack = Vec::with_capacity(32);
    for s in 0..n {
        let mut r = 0;
        for (k, d) in defs.iter().enumerate() {
            let v = match d {
                Def::Random(_, dist) => {
                    let v = if lhs {
                        let u = (strata[r][s] as f64 + rng.uniform()) / n as f64;
                        dist.inverse(u).unwrap_or_else(|| dist.sample(&mut rng))
                    } else {
                        dist.sample(&mut rng)
                    };
                    r += 1;
                    v
                }
                Def::Derived(_, e) => e.eval(&vals, &mut stack),
            };
            vals[nc + k] = v;
            cols[k].push(v);
        }
        if s % 50_000 == 0 && s > 0 {
            ctx.check()?;
            ctx.report(s as f64 / n as f64, "");
        }
    }
    let names: Vec<String> = defs.iter().map(|d| match d { Def::Random(n, _) | Def::Derived(n, _) => n.clone() }).collect();
    let inputs: Vec<usize> = (0..nv).filter(|&k| matches!(defs[k], Def::Random(..))).collect();
    let outputs: Vec<usize> = (0..nv).filter(|&k| matches!(defs[k], Def::Derived(..))).collect();
    let keep = n.min(ctx.count("keepRows", 20000, 100, 20_000_000)?);
    let mut samples = Table::new("samples").with_x(Column::new("sample", "", (1..=keep).map(|i| i as f64).collect()));
    for (k, name) in names.iter().enumerate() {
        samples.push(Column::new(name, "", cols[k][..keep].to_vec()));
    }
    // Statistics of every variable.
    let mut st = Table::new("statistics");
    st.push(Column::text("variable", names.clone()));
    let mut columns: Vec<(&str, Vec<f64>)> = ["mean", "std", "min", "p5", "p50", "p95", "max"].iter().map(|s| (*s, Vec::new())).collect();
    for col in &cols {
        let s = sorted_finite(col);
        let v = [mean(&s), std_dev(&s), s.first().copied().unwrap_or(f64::NAN), quantile_sorted(&s, 0.05), quantile_sorted(&s, 0.5), quantile_sorted(&s, 0.95), s.last().copied().unwrap_or(f64::NAN)];
        for (c, x) in columns.iter_mut().zip(v) {
            c.1.push(x);
        }
    }
    for (name, values) in columns {
        st.push(Column::new(name, "", values));
    }
    let mut d = Dataset { tables: vec![samples, st], ..Default::default() };
    let first_out = outputs.first().copied().or(inputs.first().copied()).unwrap();
    let y = &cols[first_out];
    // Sensitivity of the first output to every input: Spearman rank correlation and its share of r².
    if !outputs.is_empty() && !inputs.is_empty() {
        let m = n.min(50_000);
        let r: Vec<f64> = inputs.iter().map(|&k| spearman(&cols[k][..m], &y[..m])).collect();
        let total: f64 = r.iter().map(|v| if v.is_finite() { v * v } else { 0.0 }).sum();
        let mut sens = Table::new("sensitivity");
        sens.push(Column::text("input", inputs.iter().map(|&k| names[k].clone()).collect()));
        sens.push(Column::new("rank correlation", "", r.clone()));
        sens.push(Column::new("share of variance", "%", r.iter().map(|v| if total > 0.0 { v * v / total * 100.0 } else { f64::NAN }).collect()));
        d.tables.push(sens);
    }
    // Convergence of the mean of the first output with its 95 % interval.
    let mut conv = Table::new("convergence");
    let mut ns = Vec::new();
    let mut means = Vec::new();
    let mut lo = Vec::new();
    let mut hi = Vec::new();
    let (mut sum, mut sum2, mut count) = (0.0, 0.0, 0usize);
    let mut next = 10usize;
    for (i, v) in y.iter().enumerate() {
        if v.is_finite() {
            sum += v;
            sum2 += v * v;
            count += 1;
        }
        if i + 1 == next || i + 1 == n {
            let m = sum / count.max(1) as f64;
            let var = (sum2 / count.max(1) as f64 - m * m).max(0.0) * count as f64 / (count.max(2) - 1) as f64;
            let half = 1.96 * (var / count.max(1) as f64).sqrt();
            ns.push((i + 1) as f64);
            means.push(m);
            lo.push(m - half);
            hi.push(m + half);
            next = ((next as f64) * 1.25).ceil() as usize;
        }
    }
    conv = conv.with_x(Column::new("samples", "", ns));
    conv.push(Column::new(&format!("mean {}", names[first_out]), "", means));
    conv.push(Column::new("95% low", "", lo));
    conv.push(Column::new("95% high", "", hi));
    d.tables.push(conv);
    let s = sorted_finite(y);
    d.scalar(&format!("mean {}", names[first_out]), mean(&s), "")
        .scalar(&format!("std {}", names[first_out]), std_dev(&s), "")
        .scalar(&format!("p5 {}", names[first_out]), quantile_sorted(&s, 0.05), "")
        .scalar(&format!("p95 {}", names[first_out]), quantile_sorted(&s, 0.95), "");
    // Probability of a condition (e.g. a failure criterion), with a Wilson 95 % interval.
    let cond = ctx.str("condition", "");
    if !cond.trim().is_empty() {
        let mut all_names: Vec<String> = consts.iter().map(|(n, _)| n.clone()).collect();
        all_names.extend(names.iter().cloned());
        let e = Expr::with_names(&cond, &all_names)?;
        let mut hits = 0usize;
        let mut v = vec![0.0; nc + nv];
        for (i, (_, c)) in consts.iter().enumerate() {
            v[i] = *c;
        }
        for s in 0..n {
            for k in 0..nv {
                v[nc + k] = cols[k][s];
            }
            let r = e.eval(&v, &mut stack);
            if r != 0.0 && !r.is_nan() {
                hits += 1;
            }
        }
        let p = hits as f64 / n as f64;
        let z = 1.96;
        let denom = 1.0 + z * z / n as f64;
        let centre = (p + z * z / (2.0 * n as f64)) / denom;
        let half = z * (p * (1.0 - p) / n as f64 + z * z / (4.0 * (n * n) as f64)).sqrt() / denom;
        d.scalar("P(condition)", p * 100.0, "%").scalar("P 95% low", (centre - half).max(0.0) * 100.0, "%").scalar("P 95% high", (centre + half).min(1.0) * 100.0, "%");
        d.text = format!("P({}) = {:.4}% ({hits} of {n})", cond.trim(), p * 100.0);
    }
    d.scalar("samples", n as f64, "");
    Ok(d)
}

pub fn process(ctx: &mut Ctx) -> Result<Dataset, String> {
    let kind = ctx.str("process", "gbm");
    let paths = ctx.count("paths", 500, 1, 1_000_000)?;
    let steps = ctx.count("steps", 250, 1, 1_000_000)?;
    if paths.saturating_mul(steps) > 50_000_000 {
        return Err("paths × steps is too large (at most 50 million)".into());
    }
    let horizon = ctx.positive("horizon", 1.0)?;
    let x0 = ctx.num("x0", 100.0)?;
    let mu = ctx.num("mu", 0.05)?;
    let sigma = ctx.num("sigma", 0.2)?.abs();
    let theta = ctx.num("theta", 1.0)?;
    let lambda = ctx.num("jumpRate", 0.0)?.max(0.0);
    let jump = ctx.num("jumpSize", 0.0)?;
    let shown = ctx.count("showPaths", 10, 0, 100)?.min(paths);
    let dt = horizon / steps as f64;
    let mut rng = ctx.rng();
    let t: Vec<f64> = (0..=steps).map(|i| i as f64 * dt).collect();
    let mut grid: Vec<Vec<f64>> = vec![Vec::with_capacity(paths); steps + 1];
    let mut kept: Vec<Vec<f64>> = vec![Vec::with_capacity(steps + 1); shown];
    let mut finals = Vec::with_capacity(paths);
    let mut max_dd = Vec::with_capacity(paths);
    for p in 0..paths {
        let mut x = x0;
        let mut peak = x0;
        let mut dd = 0.0f64;
        grid[0].push(x);
        if p < shown {
            kept[p].push(x);
        }
        for s in 1..=steps {
            let z = rng.normal();
            x = match kind.as_str() {
                "gbm" => x * ((mu - 0.5 * sigma * sigma) * dt + sigma * dt.sqrt() * z).exp(),
                "walk" => x + mu * dt + sigma * dt.sqrt() * z,
                "ou" => {
                    // Exact discretisation of dX = θ(μ − X)dt + σ dW.
                    let e = (-theta * dt).exp();
                    let sd = if theta > 0.0 { sigma * ((1.0 - e * e) / (2.0 * theta)).sqrt() } else { sigma * dt.sqrt() };
                    mu + (x - mu) * e + sd * z
                }
                other => return Err(format!("unknown process \"{other}\" (gbm, walk, ou)")),
            };
            if lambda > 0.0 {
                let jumps = rng.poisson(lambda * dt);
                if jumps > 0.0 {
                    x += jump * jumps;
                }
            }
            peak = peak.max(x);
            if peak > 0.0 {
                dd = dd.max((peak - x) / peak);
            }
            grid[s].push(x);
            if p < shown {
                kept[p].push(x);
            }
        }
        finals.push(x);
        max_dd.push(dd * 100.0);
        if p % 1000 == 0 {
            ctx.check()?;
        }
    }
    let band = |q: f64| -> Vec<f64> { grid.iter().map(|v| quantile_sorted(&sorted_finite(v), q)).collect() };
    let mut table = Table::new("paths").with_x(Column::new("t", "", t));
    table.push(Column::new("mean", "", grid.iter().map(|v| mean(v)).collect()));
    table.push(Column::new("p5", "", band(0.05)));
    table.push(Column::new("p50", "", band(0.5)));
    table.push(Column::new("p95", "", band(0.95)));
    for (i, path) in kept.into_iter().enumerate() {
        table.push(Column::new(&format!("path {}", i + 1), "", path));
    }
    let mut fin = Table::new("final values").with_x(Column::new("path", "", (1..=paths).map(|i| i as f64).collect()));
    fin.push(Column::new("final", "", finals.clone()));
    fin.push(Column::new("max drawdown", "%", max_dd.clone()));
    let s = sorted_finite(&finals);
    let mut d = Dataset { tables: vec![table, fin], ..Default::default() };
    d.scalar("mean final", mean(&s), "")
        .scalar("std final", std_dev(&s), "")
        .scalar("p5 final", quantile_sorted(&s, 0.05), "")
        .scalar("p95 final", quantile_sorted(&s, 0.95), "")
        .scalar("P(final < x0)", s.iter().filter(|v| **v < x0).count() as f64 / s.len() as f64 * 100.0, "%")
        .scalar("mean max drawdown", mean(&max_dd), "%");
    if kind == "gbm" {
        d.scalar("theory mean final", x0 * (mu * horizon).exp(), "");
        // 95 % value at risk of the final value relative to x0.
        d.scalar("VaR 95%", x0 - quantile_sorted(&s, 0.05), "");
    }
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_model_text() {
        let defs = parse_defs("a ~ normal(10, 2*k)\nb ~ uniform(0, 1)\nc = a + b", &[("k".into(), 0.5)]).unwrap();
        assert_eq!(defs.len(), 3);
        match &defs[0] {
            Def::Random(n, Dist::Normal(m, s)) => assert_eq!((n.as_str(), *m, *s), ("a", 10.0, 1.0)),
            _ => panic!(),
        }
        assert!(parse_defs("a ~ nope(1)", &[]).is_err());
    }
}
