//! Hypothesis tests (MATLAB's ttest, ttest2, anova1, anova2, chi2 tests,
//! ranksum, signrank, jbtest, vartest2): the statistic, degrees of freedom,
//! p-value, decision at the chosen α and a confidence interval where it applies.

use super::input_table;
use crate::data::{Column, Dataset, Table};
use crate::special::{chi2_sf, f_sf, t_cdf, t_inv};
use crate::rng::normal_cdf;
use crate::Ctx;

fn values(table: &Table, name: &str) -> Result<Vec<f64>, String> {
    Ok(table.pick(name)?.values.iter().copied().filter(|v| v.is_finite()).collect())
}

fn mean(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len() as f64
}

fn var(v: &[f64]) -> f64 {
    let m = mean(v);
    v.iter().map(|x| (x - m).powi(2)).sum::<f64>() / (v.len() as f64 - 1.0)
}

/// Two-sided, left or right p-value of a t statistic.
fn t_p(t: f64, df: f64, tail: &str) -> f64 {
    match tail {
        "right" => 1.0 - t_cdf(t, df),
        "left" => t_cdf(t, df),
        _ => 2.0 * (1.0 - t_cdf(t.abs(), df)),
    }
}

fn z_p(z: f64, tail: &str) -> f64 {
    match tail {
        "right" => 1.0 - normal_cdf(z),
        "left" => normal_cdf(z),
        _ => 2.0 * (1.0 - normal_cdf(z.abs())),
    }
}

/// Mid-ranks of the values (ties share the average rank); also Σ(t³ − t) of the ties.
fn ranks(v: &[f64]) -> (Vec<f64>, f64) {
    let mut idx: Vec<usize> = (0..v.len()).collect();
    idx.sort_by(|&a, &b| v[a].partial_cmp(&v[b]).unwrap_or(std::cmp::Ordering::Equal));
    let mut r = vec![0.0; v.len()];
    let mut ties = 0.0;
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
        let t = (j - i + 1) as f64;
        ties += t * t * t - t;
        i = j + 1;
    }
    (r, ties)
}

pub fn test(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?.clone();
    let kind = ctx.str("test", "ttest");
    let alpha = ctx.num("alpha", 0.05)?;
    if !(alpha > 0.0 && alpha < 1.0) {
        return Err("α must be between 0 and 1".into());
    }
    let tail = ctx.str("tail", "both");
    let a_name = ctx.str("a", "");
    let b_name = ctx.str("b", "");
    let mut out = Dataset::default();
    let mut rows: Vec<(String, f64)> = Vec::new();
    let (stat_name, stat, p, mut ci): (&str, f64, f64, Option<(f64, f64)>) = match kind.as_str() {
        "ttest" => {
            let x = values(&table, &a_name)?;
            let mu = ctx.num("mu", 0.0)?;
            let n = x.len() as f64;
            if n < 2.0 {
                return Err("the t-test needs at least 2 values".into());
            }
            let se = (var(&x) / n).sqrt();
            let t = (mean(&x) - mu) / se;
            let df = n - 1.0;
            let q = t_inv(1.0 - alpha / 2.0, df);
            rows.push(("mean".into(), mean(&x)));
            rows.push(("df".into(), df));
            rows.push(("sd".into(), var(&x).sqrt()));
            ("t", t, t_p(t, df, &tail), Some((mean(&x) - q * se, mean(&x) + q * se)))
        }
        "ttest2" | "paired" => {
            let x = values(&table, &a_name)?;
            let y = values(&table, if b_name.is_empty() { "" } else { &b_name })?;
            let y = if b_name.is_empty() {
                // The second numeric column.
                let cols = table.value_columns();
                let k = *cols.get(1).ok_or("choose the second column b")?;
                table.columns[k].values.iter().copied().filter(|v| v.is_finite()).collect()
            } else {
                y
            };
            if kind == "paired" {
                if x.len() != y.len() {
                    return Err("a paired test needs columns of the same length".into());
                }
                let d: Vec<f64> = x.iter().zip(&y).map(|(p, q)| p - q).collect();
                let n = d.len() as f64;
                let se = (var(&d) / n).sqrt();
                let t = mean(&d) / se;
                let df = n - 1.0;
                let q = t_inv(1.0 - alpha / 2.0, df);
                rows.push(("mean difference".into(), mean(&d)));
                rows.push(("df".into(), df));
                ("t", t, t_p(t, df, &tail), Some((mean(&d) - q * se, mean(&d) + q * se)))
            } else {
                let (n1, n2) = (x.len() as f64, y.len() as f64);
                if n1 < 2.0 || n2 < 2.0 {
                    return Err("each group needs at least 2 values".into());
                }
                let (v1, v2) = (var(&x), var(&y));
                let equal = ctx.str("variance", "equal") == "equal";
                let (se, df) = if equal {
                    let sp = ((n1 - 1.0) * v1 + (n2 - 1.0) * v2) / (n1 + n2 - 2.0);
                    ((sp * (1.0 / n1 + 1.0 / n2)).sqrt(), n1 + n2 - 2.0)
                } else {
                    let a = v1 / n1;
                    let b = v2 / n2;
                    ((a + b).sqrt(), (a + b).powi(2) / (a * a / (n1 - 1.0) + b * b / (n2 - 1.0)))
                };
                let diff = mean(&x) - mean(&y);
                let t = diff / se;
                let q = t_inv(1.0 - alpha / 2.0, df);
                rows.push(("mean a".into(), mean(&x)));
                rows.push(("mean b".into(), mean(&y)));
                rows.push(("df".into(), df));
                ("t", t, t_p(t, df, &tail), Some((diff - q * se, diff + q * se)))
            }
        }
        "vartest2" => {
            let x = values(&table, &a_name)?;
            let y = values(&table, &b_name)?;
            let f = var(&x) / var(&y);
            let (d1, d2) = (x.len() as f64 - 1.0, y.len() as f64 - 1.0);
            let up = f_sf(f, d1, d2);
            let p = match tail.as_str() {
                "right" => up,
                "left" => 1.0 - up,
                _ => 2.0 * up.min(1.0 - up),
            };
            rows.push(("df1".into(), d1));
            rows.push(("df2".into(), d2));
            ("F", f, p, None)
        }
        "anova1" => {
            // Groups: the chosen columns, or a value column and a group column.
            let groups: Vec<(String, Vec<f64>)> = match (ctx.str("value", "").as_str(), ctx.str("group", "").as_str()) {
                (v, g) if !v.is_empty() && !g.is_empty() => {
                    let vals = &table.pick(v)?.values;
                    let gcol = table.pick(g)?;
                    let keys: Vec<String> = (0..vals.len()).map(|i| gcol.labels.as_ref().map(|l| l[i].clone()).unwrap_or_else(|| crate::data::format_number(gcol.values[i]))).collect();
                    let mut names: Vec<String> = Vec::new();
                    for k in &keys {
                        if !names.contains(k) {
                            names.push(k.clone());
                        }
                    }
                    names.iter().map(|n| (n.clone(), (0..vals.len()).filter(|&i| &keys[i] == n && vals[i].is_finite()).map(|i| vals[i]).collect())).collect()
                }
                _ => {
                    let cols = super::column_list(&table, &ctx.str("columns", ""))?;
                    cols.iter().filter(|&&c| table.x != Some(c) || cols.len() <= 2).map(|&c| (table.columns[c].name.clone(), table.columns[c].values.iter().copied().filter(|v| v.is_finite()).collect())).collect()
                }
            };
            if groups.len() < 2 || groups.iter().any(|g| g.1.is_empty()) {
                return Err("one-way ANOVA needs at least two non-empty groups".into());
            }
            let all: Vec<f64> = groups.iter().flat_map(|g| g.1.iter().copied()).collect();
            let grand = mean(&all);
            let ssb: f64 = groups.iter().map(|g| g.1.len() as f64 * (mean(&g.1) - grand).powi(2)).sum();
            let ssw: f64 = groups.iter().map(|g| { let m = mean(&g.1); g.1.iter().map(|v| (v - m).powi(2)).sum::<f64>() }).sum();
            let (dfb, dfw) = ((groups.len() - 1) as f64, (all.len() - groups.len()) as f64);
            let f = (ssb / dfb) / (ssw / dfw);
            let p = f_sf(f, dfb, dfw);
            let mut at = Table::new("ANOVA table");
            at.push(Column::text("source", vec!["groups".into(), "error".into(), "total".into()]));
            at.push(Column::new("SS", "", vec![ssb, ssw, ssb + ssw]));
            at.push(Column::new("df", "", vec![dfb, dfw, dfb + dfw]));
            at.push(Column::new("MS", "", vec![ssb / dfb, ssw / dfw, f64::NAN]));
            at.push(Column::new("F", "", vec![f, f64::NAN, f64::NAN]));
            at.push(Column::new("p", "", vec![p, f64::NAN, f64::NAN]));
            out.tables.push(at);
            let mut gt = Table::new("group means");
            gt.push(Column::text("group", groups.iter().map(|g| g.0.clone()).collect()));
            gt.push(Column::new("n", "", groups.iter().map(|g| g.1.len() as f64).collect()));
            gt.push(Column::new("mean", "", groups.iter().map(|g| mean(&g.1)).collect()));
            gt.push(Column::new("sd", "", groups.iter().map(|g| if g.1.len() > 1 { var(&g.1).sqrt() } else { f64::NAN }).collect()));
            out.tables.push(gt);
            rows.push(("df groups".into(), dfb));
            rows.push(("df error".into(), dfw));
            ("F", f, p, None)
        }
        "anova2" => {
            // Two-way ANOVA without replication: rows are one factor's levels, the chosen columns the other's.
            let cols = super::column_list(&table, &ctx.str("columns", ""))?;
            let cols: Vec<usize> = cols.into_iter().filter(|&c| table.x != Some(c)).collect();
            let r = table.rows();
            let c = cols.len();
            if r < 2 || c < 2 {
                return Err("two-way ANOVA needs at least 2 rows and 2 columns".into());
            }
            let m: Vec<Vec<f64>> = (0..r).map(|i| cols.iter().map(|&k| table.columns[k].values[i]).collect()).collect();
            if m.iter().flatten().any(|v| !v.is_finite()) {
                return Err("two-way ANOVA needs a complete table (no empty cells)".into());
            }
            let grand = m.iter().flatten().sum::<f64>() / (r * c) as f64;
            let row_m: Vec<f64> = m.iter().map(|row| mean(row)).collect();
            let col_m: Vec<f64> = (0..c).map(|j| m.iter().map(|row| row[j]).sum::<f64>() / r as f64).collect();
            let ssr = c as f64 * row_m.iter().map(|v| (v - grand).powi(2)).sum::<f64>();
            let ssc = r as f64 * col_m.iter().map(|v| (v - grand).powi(2)).sum::<f64>();
            let sst: f64 = m.iter().flatten().map(|v| (v - grand).powi(2)).sum();
            let sse = sst - ssr - ssc;
            let (dfr, dfc, dfe) = ((r - 1) as f64, (c - 1) as f64, ((r - 1) * (c - 1)) as f64);
            let (fr, fc) = ((ssr / dfr) / (sse / dfe), (ssc / dfc) / (sse / dfe));
            let (pr, pc) = (f_sf(fr, dfr, dfe), f_sf(fc, dfc, dfe));
            let mut at = Table::new("ANOVA table");
            at.push(Column::text("source", vec!["columns".into(), "rows".into(), "error".into(), "total".into()]));
            at.push(Column::new("SS", "", vec![ssc, ssr, sse, sst]));
            at.push(Column::new("df", "", vec![dfc, dfr, dfe, dfc + dfr + dfe]));
            at.push(Column::new("MS", "", vec![ssc / dfc, ssr / dfr, sse / dfe, f64::NAN]));
            at.push(Column::new("F", "", vec![fc, fr, f64::NAN, f64::NAN]));
            at.push(Column::new("p", "", vec![pc, pr, f64::NAN, f64::NAN]));
            out.tables.push(at);
            out.scalar("F rows", fr, "").scalar("p rows", pr, "");
            ("F", fc, pc, None)
        }
        "chi2" => {
            // Independence in a contingency table: the chosen columns are the categories, rows the other factor.
            let cols = super::column_list(&table, &ctx.str("columns", ""))?;
            let cols: Vec<usize> = cols.into_iter().filter(|&c| table.x != Some(c)).collect();
            let r = table.rows();
            let c = cols.len();
            if r < 2 || c < 2 {
                return Err("the χ² test needs a table of at least 2 × 2 counts".into());
            }
            let m: Vec<Vec<f64>> = (0..r).map(|i| cols.iter().map(|&k| table.columns[k].values[i]).collect()).collect();
            let total: f64 = m.iter().flatten().sum();
            let rs: Vec<f64> = m.iter().map(|row| row.iter().sum()).collect();
            let cs: Vec<f64> = (0..c).map(|j| m.iter().map(|row| row[j]).sum()).collect();
            let mut chi = 0.0;
            for i in 0..r {
                for j in 0..c {
                    let e = rs[i] * cs[j] / total;
                    if e > 0.0 {
                        chi += (m[i][j] - e).powi(2) / e;
                    }
                }
            }
            let df = ((r - 1) * (c - 1)) as f64;
            rows.push(("df".into(), df));
            rows.push(("Cramér's V".into(), (chi / (total * (r.min(c) - 1) as f64)).sqrt()));
            ("χ²", chi, chi2_sf(chi, df), None)
        }
        "chi2gof" => {
            // Goodness of fit to the normal distribution (MATLAB's default) with equal-probability bins.
            let x = values(&table, &a_name)?;
            let n = x.len();
            let bins = ctx.count("bins", 10, 3, 100)?.min(n / 5).max(3);
            let (m, s) = (mean(&x), var(&x).sqrt());
            let mut counts = vec![0.0; bins];
            for v in &x {
                let u = normal_cdf((v - m) / s);
                counts[((u * bins as f64) as usize).min(bins - 1)] += 1.0;
            }
            let e = n as f64 / bins as f64;
            let chi: f64 = counts.iter().map(|o| (o - e).powi(2) / e).sum();
            let df = (bins - 3) as f64;
            rows.push(("df".into(), df));
            ("χ²", chi, chi2_sf(chi, df), None)
        }
        "jbtest" => {
            // Jarque–Bera normality: skewness and kurtosis.
            let x = values(&table, &a_name)?;
            let n = x.len() as f64;
            let m = mean(&x);
            let m2 = x.iter().map(|v| (v - m).powi(2)).sum::<f64>() / n;
            let s = x.iter().map(|v| (v - m).powi(3)).sum::<f64>() / n / m2.powf(1.5);
            let k = x.iter().map(|v| (v - m).powi(4)).sum::<f64>() / n / (m2 * m2);
            let jb = n / 6.0 * (s * s + (k - 3.0).powi(2) / 4.0);
            rows.push(("skewness".into(), s));
            rows.push(("kurtosis".into(), k));
            ("JB", jb, chi2_sf(jb, 2.0), None)
        }
        "ranksum" => {
            // Wilcoxon rank sum (Mann–Whitney), normal approximation with tie correction.
            let x = values(&table, &a_name)?;
            let y = values(&table, &b_name)?;
            let (n1, n2) = (x.len() as f64, y.len() as f64);
            let all: Vec<f64> = x.iter().chain(&y).copied().collect();
            let (r, ties) = ranks(&all);
            let w: f64 = r[..x.len()].iter().sum();
            let mu = n1 * (n1 + n2 + 1.0) / 2.0;
            let n = n1 + n2;
            let sd = (n1 * n2 / 12.0 * ((n + 1.0) - ties / (n * (n - 1.0)))).sqrt();
            let z = (w - mu - 0.5 * (w - mu).signum()) / sd;
            rows.push(("rank sum".into(), w));
            rows.push(("U".into(), w - n1 * (n1 + 1.0) / 2.0));
            ("z", z, z_p(z, &tail), None)
        }
        "signrank" => {
            // Wilcoxon signed rank of a − b (or a − μ), normal approximation.
            let x = values(&table, &a_name)?;
            let d: Vec<f64> = if b_name.is_empty() {
                let mu = ctx.num("mu", 0.0)?;
                x.iter().map(|v| v - mu).collect()
            } else {
                let y = values(&table, &b_name)?;
                x.iter().zip(&y).map(|(p, q)| p - q).collect()
            };
            let d: Vec<f64> = d.into_iter().filter(|v| *v != 0.0).collect();
            let n = d.len() as f64;
            let (r, ties) = ranks(&d.iter().map(|v| v.abs()).collect::<Vec<_>>());
            let wplus: f64 = r.iter().zip(&d).filter(|(_, v)| **v > 0.0).map(|(r, _)| r).sum();
            let mu = n * (n + 1.0) / 4.0;
            let sd = (n * (n + 1.0) * (2.0 * n + 1.0) / 24.0 - ties / 48.0).sqrt();
            let z = (wplus - mu - 0.5 * (wplus - mu).signum()) / sd;
            rows.push(("W+".into(), wplus));
            ("z", z, z_p(z, &tail), None)
        }
        other => return Err(format!("unknown test \"{other}\" (ttest, ttest2, paired, vartest2, anova1, anova2, chi2, chi2gof, jbtest, ranksum, signrank)")),
    };
    if tail != "both" {
        ci = None;
    }
    let reject = p < alpha;
    let mut summary = Table::new("test result");
    let mut names = vec![stat_name.to_string(), "p".into(), "h (reject H0)".into()];
    let mut vals = vec![stat, p, if reject { 1.0 } else { 0.0 }];
    for (n, v) in &rows {
        names.push(n.clone());
        vals.push(*v);
    }
    if let Some((lo, hi)) = ci {
        names.push(format!("CI low ({}%)", (1.0 - alpha) * 100.0));
        names.push(format!("CI high ({}%)", (1.0 - alpha) * 100.0));
        vals.push(lo);
        vals.push(hi);
    }
    summary.push(Column::text("quantity", names));
    summary.push(Column::new("value", "", vals));
    out.tables.insert(0, summary);
    out.scalar(stat_name, stat, "").scalar("p", p, "").scalar("h", if reject { 1.0 } else { 0.0 }, "");
    for (n, v) in rows {
        out.scalar(&n, v, "");
    }
    if let Some((lo, hi)) = ci {
        out.scalar("CI low", lo, "").scalar("CI high", hi, "");
    }
    out.text = format!("{kind}: {stat_name} = {}, p = {} → {} H0 at α = {alpha}", crate::data::format_number(stat), crate::data::format_number(p), if reject { "reject" } else { "do not reject" });
    Ok(out)
}
