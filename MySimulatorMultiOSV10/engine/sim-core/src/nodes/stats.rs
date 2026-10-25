//! Statistics: descriptive statistics, histograms with a normal fit,
//! regression (polynomial, exponential, power, logarithmic, multiple linear)
//! and correlation matrices.

use super::{column_list, input_table};
use crate::data::{g, mean, quantile_sorted, sorted_finite, std_dev, Column, Dataset, Grid, Table};
use crate::linalg::lstsq;
use crate::rng::normal_cdf;
use crate::Ctx;
use std::f64::consts::PI;

pub fn describe(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let cols = column_list(table, &ctx.str("columns", ""))?;
    let stats = ["n", "mean", "std", "min", "q1", "median", "q3", "max", "skewness", "kurtosis", "missing"];
    let mut out = Table::new("statistics");
    out.push(Column::text("column", cols.iter().map(|&k| table.columns[k].name.clone()).collect()));
    let mut rows: Vec<Vec<f64>> = vec![Vec::new(); stats.len()];
    for &k in &cols {
        let v = &table.columns[k].values;
        let s = sorted_finite(v);
        let n = s.len() as f64;
        let m = mean(&s);
        let sd = std_dev(&s);
        let m2 = s.iter().map(|x| (x - m).powi(2)).sum::<f64>() / n;
        let m3 = s.iter().map(|x| (x - m).powi(3)).sum::<f64>() / n;
        let m4 = s.iter().map(|x| (x - m).powi(4)).sum::<f64>() / n;
        let values = [
            n,
            m,
            sd,
            s.first().copied().unwrap_or(f64::NAN),
            quantile_sorted(&s, 0.25),
            quantile_sorted(&s, 0.5),
            quantile_sorted(&s, 0.75),
            s.last().copied().unwrap_or(f64::NAN),
            if m2 > 0.0 { m3 / m2.powf(1.5) } else { f64::NAN },
            if m2 > 0.0 { m4 / (m2 * m2) - 3.0 } else { f64::NAN },
            (v.len() - s.len()) as f64,
        ];
        for (i, val) in values.iter().enumerate() {
            rows[i].push(*val);
        }
    }
    for (name, values) in stats.iter().zip(rows) {
        out.push(Column::new(name, "", values));
    }
    let mut d = Dataset::table(out);
    if let Some(&k) = cols.first() {
        let v = &table.columns[k].values;
        d.scalar(&format!("mean {}", table.columns[k].name), mean(v), &table.columns[k].unit)
            .scalar(&format!("std {}", table.columns[k].name), std_dev(v), &table.columns[k].unit);
    }
    Ok(d)
}

pub fn histogram(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let col = table.pick(&ctx.str("column", ""))?;
    let s = sorted_finite(&col.values);
    if s.len() < 2 {
        return Err("at least two values are needed".into());
    }
    let n = s.len();
    let lo_given = ctx.num("from", f64::NAN)?;
    let hi_given = ctx.num("to", f64::NAN)?;
    let lo = if lo_given.is_finite() { lo_given } else { s[0] };
    let hi = if hi_given.is_finite() { hi_given } else { s[n - 1] };
    if !(hi > lo) {
        return Err("all values are equal: no histogram".into());
    }
    let mut bins = ctx.int("bins", 0)?;
    if bins <= 0 {
        // Freedman–Diaconis, at least 5 and at most 200 bins.
        let iqr = quantile_sorted(&s, 0.75) - quantile_sorted(&s, 0.25);
        let width = 2.0 * iqr / (n as f64).cbrt();
        bins = if width > 0.0 { ((hi - lo) / width).ceil() as i64 } else { (n as f64).sqrt() as i64 };
        bins = bins.clamp(5, 200);
    }
    let bins = (bins as usize).min(10_000);
    let width = (hi - lo) / bins as f64;
    let mut counts = vec![0.0; bins];
    for v in &s {
        if *v < lo || *v > hi {
            continue;
        }
        let k = (((v - lo) / width) as usize).min(bins - 1);
        counts[k] += 1.0;
    }
    let m = mean(&s);
    let sd = std_dev(&s);
    let centers: Vec<f64> = (0..bins).map(|k| lo + (k as f64 + 0.5) * width).collect();
    let density: Vec<f64> = counts.iter().map(|c| c / (n as f64 * width)).collect();
    let normal: Vec<f64> = centers.iter().map(|x| (-(x - m).powi(2) / (2.0 * sd * sd)).exp() / (sd * (2.0 * PI).sqrt())).collect();
    let mut cumulative = Vec::with_capacity(bins);
    let mut acc = 0.0;
    for c in &counts {
        acc += c;
        cumulative.push(acc / n as f64);
    }
    let mut out = Table::new("histogram").with_x(Column::new(&col.name, &col.unit, centers.clone()));
    out.push(Column::new("count", "", counts));
    out.push(Column::new("density", "", density));
    out.push(Column::new("normal fit", "", normal));
    out.push(Column::new("cumulative", "", cumulative));
    // Normality check: the largest gap between the empirical and the normal CDF (Kolmogorov–Smirnov D).
    let ks = s.iter().enumerate().map(|(i, x)| {
        let f = normal_cdf((x - m) / sd);
        ((i + 1) as f64 / n as f64 - f).abs().max((f - i as f64 / n as f64).abs())
    }).fold(0.0f64, f64::max);
    let mut d = Dataset::table(out);
    d.scalar("mean", m, &col.unit)
        .scalar("std", sd, &col.unit)
        .scalar("bins", bins as f64, "")
        .scalar("bin width", width, &col.unit)
        .scalar("KS distance to normal", ks, "")
        .scalar("KS 5% critical value", 1.36 / (n as f64).sqrt(), "");
    Ok(d)
}

fn r_squared(y: &[f64], fit: &[f64]) -> (f64, f64) {
    let pairs: Vec<(f64, f64)> = y.iter().zip(fit).filter(|(a, b)| a.is_finite() && b.is_finite()).map(|(a, b)| (*a, *b)).collect();
    let m = pairs.iter().map(|p| p.0).sum::<f64>() / pairs.len().max(1) as f64;
    let ss_res: f64 = pairs.iter().map(|(a, b)| (a - b).powi(2)).sum();
    let ss_tot: f64 = pairs.iter().map(|(a, _)| (a - m).powi(2)).sum();
    let r2 = if ss_tot > 0.0 { 1.0 - ss_res / ss_tot } else { f64::NAN };
    (r2, (ss_res / pairs.len().max(1) as f64).sqrt())
}

pub fn regression(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let model = ctx.str("model", "polynomial");
    let ycol = table.pick(&ctx.str("y", ""))?.clone();
    let xs_names = ctx.str("x", "");
    let xcol = if model == "multiple" { None } else { Some(table.pick_x(&xs_names)) };
    let mut d = Dataset::default();
    let mut fit_rows: Vec<f64> = vec![f64::NAN; ycol.values.len()];
    let mut coef_names: Vec<String> = Vec::new();
    let mut coefs: Vec<f64> = Vec::new();
    let mut ses: Vec<f64> = Vec::new();
    let formula: String;
    let curve: Option<(Vec<f64>, Vec<f64>)>;
    let p_count: usize;
    match model.as_str() {
        "polynomial" | "linear" => {
            let degree = if model == "linear" { 1 } else { ctx.count("degree", 1, 0, 12)? };
            let x = &xcol.as_ref().unwrap().values;
            let rows: Vec<usize> = (0..x.len().min(ycol.values.len())).filter(|&i| x[i].is_finite() && ycol.values[i].is_finite()).collect();
            if rows.len() <= degree {
                return Err(format!("{} points are too few for degree {degree}", rows.len()));
            }
            // Fit in a scaled variable z = (x − m)/s for conditioning, then expand back.
            let xm = rows.iter().map(|&i| x[i]).sum::<f64>() / rows.len() as f64;
            let xs = (rows.iter().map(|&i| (x[i] - xm).powi(2)).sum::<f64>() / rows.len() as f64).sqrt().max(1e-300);
            let a: Vec<Vec<f64>> = rows.iter().map(|&i| (0..=degree).map(|k| ((x[i] - xm) / xs).powi(k as i32)).collect()).collect();
            let b: Vec<f64> = rows.iter().map(|&i| ycol.values[i]).collect();
            let (cz, _) = lstsq(&a, &b)?;
            // Standard errors need the covariance in x itself: the unscaled design (NaN when it is too ill-conditioned).
            let a_orig: Vec<Vec<f64>> = rows.iter().map(|&i| (0..=degree).map(|k| x[i].powi(k as i32)).collect()).collect();
            let cov = lstsq(&a_orig, &b).map(|r| r.1).unwrap_or_else(|_| vec![vec![f64::NAN; degree + 1]; degree + 1]);
            // p(x) = Σ cz_k ((x − m)/s)^k → Σ c_j x^j
            let mut c = vec![0.0; degree + 1];
            for (k, ck) in cz.iter().enumerate() {
                for j in 0..=k {
                    c[j] += ck * binom(k, j) * (-xm).powi((k - j) as i32) / xs.powi(k as i32);
                }
            }
            let eval = |xv: f64| c.iter().rev().fold(0.0, |acc, v| acc * xv + v);
            for (i, f) in fit_rows.iter_mut().enumerate() {
                if i < x.len() {
                    *f = eval(x[i]);
                }
            }
            // Standard errors in z, carried to x for the linear case only (exact there).
            let resid: f64 = rows.iter().map(|&i| (ycol.values[i] - eval(x[i])).powi(2)).sum();
            let dof = (rows.len() - degree - 1).max(1) as f64;
            let s2 = resid / dof;
            for j in 0..=degree {
                coef_names.push(if j == 0 { "c0".into() } else { format!("c{j} (x^{j})") });
                coefs.push(c[j]);
                ses.push((s2 * cov[j][j]).sqrt());
            }
            formula = format!("y = {}", (0..=degree).rev().map(|j| match j { 0 => g(c[0], 6), 1 => format!("{}·x", g(c[1], 6)), _ => format!("{}·x^{j}", g(c[j], 6)) }).collect::<Vec<_>>().join(" + ").replace("+ -", "− "));
            let lo = rows.iter().map(|&i| x[i]).fold(f64::INFINITY, f64::min);
            let hi = rows.iter().map(|&i| x[i]).fold(f64::NEG_INFINITY, f64::max);
            let gx: Vec<f64> = (0..300).map(|k| lo + (hi - lo) * k as f64 / 299.0).collect();
            curve = Some((gx.clone(), gx.iter().map(|&v| eval(v)).collect()));
            p_count = degree + 1;
        }
        "exponential" | "power" | "logarithmic" => {
            let x = &xcol.as_ref().unwrap().values;
            let (tx, ty): (fn(f64) -> f64, fn(f64) -> f64) = match model.as_str() {
                "exponential" => (|v| v, |v| v.ln()),
                "power" => (|v| v.ln(), |v| v.ln()),
                _ => (|v| v.ln(), |v| v),
            };
            let rows: Vec<usize> = (0..x.len().min(ycol.values.len())).filter(|&i| tx(x[i]).is_finite() && ty(ycol.values[i]).is_finite()).collect();
            if rows.len() < 3 {
                return Err(format!("the {model} model needs at least 3 points with valid values (positive where logarithms are taken)"));
            }
            let skipped = x.len().min(ycol.values.len()) - rows.len();
            if skipped > 0 {
                ctx.warn(format!("{skipped} points were left out (not positive)"));
            }
            let a: Vec<Vec<f64>> = rows.iter().map(|&i| vec![1.0, tx(x[i])]).collect();
            let b: Vec<f64> = rows.iter().map(|&i| ty(ycol.values[i])).collect();
            let (p, _) = lstsq(&a, &b)?;
            let (ca, cb) = match model.as_str() {
                "exponential" | "power" => (p[0].exp(), p[1]),
                _ => (p[0], p[1]),
            };
            let eval = |v: f64| match model.as_str() {
                "exponential" => ca * (cb * v).exp(),
                "power" => ca * v.powf(cb),
                _ => ca + cb * v.ln(),
            };
            for (i, f) in fit_rows.iter_mut().enumerate() {
                if i < x.len() {
                    *f = eval(x[i]);
                }
            }
            coef_names = vec!["a".into(), "b".into()];
            coefs = vec![ca, cb];
            ses = vec![f64::NAN, f64::NAN];
            formula = match model.as_str() {
                "exponential" => format!("y = {}·exp({}·x)", g(ca, 6), g(cb, 6)),
                "power" => format!("y = {}·x^{}", g(ca, 6), g(cb, 6)),
                _ => format!("y = {} + {}·ln(x)", g(ca, 6), g(cb, 6)),
            };
            let lo = rows.iter().map(|&i| x[i]).fold(f64::INFINITY, f64::min);
            let hi = rows.iter().map(|&i| x[i]).fold(f64::NEG_INFINITY, f64::max);
            let gx: Vec<f64> = (0..300).map(|k| lo + (hi - lo) * k as f64 / 299.0).collect();
            curve = Some((gx.clone(), gx.iter().map(|&v| eval(v)).collect()));
            p_count = 2;
        }
        "multiple" => {
            let cols = column_list(table, &xs_names)?.into_iter().filter(|&k| table.columns[k].name != ycol.name).collect::<Vec<_>>();
            if cols.is_empty() {
                return Err("list the x columns for multiple regression".into());
            }
            let rows: Vec<usize> = (0..ycol.values.len()).filter(|&i| ycol.values[i].is_finite() && cols.iter().all(|&k| table.columns[k].values.get(i).is_some_and(|v| v.is_finite()))).collect();
            let a: Vec<Vec<f64>> = rows.iter().map(|&i| std::iter::once(1.0).chain(cols.iter().map(|&k| table.columns[k].values[i])).collect()).collect();
            let b: Vec<f64> = rows.iter().map(|&i| ycol.values[i]).collect();
            let (p, cov) = lstsq(&a, &b)?;
            let eval_row = |i: usize| p[0] + cols.iter().enumerate().map(|(j, &k)| p[j + 1] * table.columns[k].values.get(i).copied().unwrap_or(f64::NAN)).sum::<f64>();
            for (i, f) in fit_rows.iter_mut().enumerate() {
                *f = eval_row(i);
            }
            let resid: f64 = rows.iter().map(|&i| (ycol.values[i] - eval_row(i)).powi(2)).sum();
            let s2 = resid / (rows.len().saturating_sub(p.len())).max(1) as f64;
            coef_names = std::iter::once("intercept".to_string()).chain(cols.iter().map(|&k| table.columns[k].name.clone())).collect();
            coefs = p.clone();
            ses = (0..p.len()).map(|j| (s2 * cov[j][j]).sqrt()).collect();
            formula = format!("{} = {}{}", ycol.name, g(p[0], 6), cols.iter().enumerate().map(|(j, &k)| format!(" + {}·{}", g(p[j + 1], 6), table.columns[k].name)).collect::<String>()).replace("+ -", "− ");
            curve = None;
            p_count = p.len();
        }
        other => return Err(format!("unknown model \"{other}\" (linear, polynomial, exponential, power, logarithmic, multiple)")),
    }
    let (r2, rmse) = r_squared(&ycol.values, &fit_rows);
    let nvalid = ycol.values.iter().zip(&fit_rows).filter(|(a, b)| a.is_finite() && b.is_finite()).count();
    let adj = 1.0 - (1.0 - r2) * (nvalid as f64 - 1.0) / ((nvalid as f64 - p_count as f64).max(1.0));
    let mut fitted = Table::new("fit");
    if let Some(xc) = &xcol {
        fitted = fitted.with_x(Column::new(&xc.name, &xc.unit, xc.values.clone()));
    }
    fitted.push(Column::new(&ycol.name, &ycol.unit, ycol.values.clone()));
    fitted.push(Column::new("fit", &ycol.unit, fit_rows.clone()));
    fitted.push(Column::new("residual", &ycol.unit, ycol.values.iter().zip(&fit_rows).map(|(a, b)| a - b).collect()));
    d.tables.push(fitted);
    if let Some((gx, gy)) = curve {
        let mut c = Table::new("curve").with_x(Column::new(&xcol.as_ref().unwrap().name, &xcol.as_ref().unwrap().unit, gx));
        c.push(Column::new("fit", &ycol.unit, gy));
        d.tables.push(c);
    }
    let mut ct = Table::new("coefficients");
    ct.push(Column::text("term", coef_names));
    ct.push(Column::new("value", "", coefs.clone()));
    ct.push(Column::new("std error", "", ses.clone()));
    ct.push(Column::new("t", "", coefs.iter().zip(&ses).map(|(c, s)| c / s).collect()));
    d.tables.push(ct);
    d.scalar("R²", r2, "").scalar("adjusted R²", adj, "").scalar("RMSE", rmse, &ycol.unit).scalar("points", nvalid as f64, "");
    for (i, c) in coefs.iter().enumerate().take(6) {
        d.scalar(&format!("coef {i}"), *c, "");
    }
    d.text = formula;
    Ok(d)
}

fn binom(n: usize, k: usize) -> f64 {
    (0..k).fold(1.0, |acc, i| acc * (n - i) as f64 / (i + 1) as f64)
}

fn ranks(v: &[f64]) -> Vec<f64> {
    let mut idx: Vec<usize> = (0..v.len()).collect();
    idx.sort_by(|&a, &b| v[a].partial_cmp(&v[b]).unwrap_or(std::cmp::Ordering::Equal));
    let mut r = vec![0.0; v.len()];
    let mut i = 0;
    while i < idx.len() {
        let mut j = i;
        while j + 1 < idx.len() && v[idx[j + 1]] == v[idx[i]] {
            j += 1;
        }
        let avg = (i + j) as f64 / 2.0 + 1.0;
        for k in i..=j {
            r[idx[k]] = avg;
        }
        i = j + 1;
    }
    r
}

pub fn pearson(a: &[f64], b: &[f64]) -> f64 {
    let pairs: Vec<(f64, f64)> = a.iter().zip(b).filter(|(p, q)| p.is_finite() && q.is_finite()).map(|(p, q)| (*p, *q)).collect();
    let n = pairs.len() as f64;
    if n < 2.0 {
        return f64::NAN;
    }
    let ma = pairs.iter().map(|p| p.0).sum::<f64>() / n;
    let mb = pairs.iter().map(|p| p.1).sum::<f64>() / n;
    let cov: f64 = pairs.iter().map(|(p, q)| (p - ma) * (q - mb)).sum();
    let va: f64 = pairs.iter().map(|(p, _)| (p - ma).powi(2)).sum();
    let vb: f64 = pairs.iter().map(|(_, q)| (q - mb).powi(2)).sum();
    cov / (va * vb).sqrt()
}

pub fn spearman(a: &[f64], b: &[f64]) -> f64 {
    pearson(&ranks(a), &ranks(b))
}

pub fn correlation(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let cols = column_list(table, &ctx.str("columns", ""))?;
    let method = ctx.str("method", "pearson");
    let n = cols.len();
    let names: Vec<String> = cols.iter().map(|&k| table.columns[k].name.clone()).collect();
    let mut z = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            let (a, b) = (&table.columns[cols[i]].values, &table.columns[cols[j]].values);
            z[j * n + i] = if i == j { 1.0 } else if method == "spearman" { spearman(a, b) } else { pearson(a, b) };
        }
    }
    let mut t = Table::new("correlation");
    t.push(Column::text("column", names.clone()));
    for (i, name) in names.iter().enumerate() {
        t.push(Column::new(name, "", (0..n).map(|j| z[j * n + i]).collect()));
    }
    let idx: Vec<f64> = (0..n).map(|i| i as f64).collect();
    let grid = Grid { name: "correlation".into(), x: idx.clone(), y: idx, z: z.clone(), x_label: String::new(), y_label: String::new(), z_label: "r".into(), x_names: Some(names.clone()), y_names: Some(names.clone()) };
    let mut d = Dataset { tables: vec![t], grids: vec![grid], ..Default::default() };
    // The strongest pair.
    let mut best = (f64::NAN, 0, 0);
    for i in 0..n {
        for j in i + 1..n {
            let r = z[j * n + i];
            if best.0.is_nan() || r.abs() > best.0.abs() {
                best = (r, i, j);
            }
        }
    }
    if best.0.is_finite() {
        d.scalar("strongest |r|", best.0, "");
        d.text = format!("{} ↔ {}: r = {:.4}", names[best.1], names[best.2], best.0);
    }
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correlations() {
        let a: Vec<f64> = (0..20).map(|i| i as f64).collect();
        let b: Vec<f64> = a.iter().map(|x| x * x).collect();
        assert!((spearman(&a, &b) - 1.0).abs() < 1e-12);
        assert!(pearson(&a, &b) < 0.99);
        assert_eq!(ranks(&[3.0, 1.0, 1.0]), vec![3.0, 1.5, 1.5]);
    }
}
