//! Machine learning: k-means clustering, principal component analysis and a
//! small multilayer perceptron (regression or classification) trained with
//! Adam.

use super::{column_list, input_table};
use crate::data::{mean, std_dev, Column, Dataset, Grid, Table};
use crate::linalg::sym_eigen;
use crate::rng::Rng;
use crate::Ctx;

/// Rows with every chosen column finite, as a row-major matrix, plus the row indices.
fn matrix(table: &Table, cols: &[usize]) -> (Vec<Vec<f64>>, Vec<usize>) {
    let mut rows = Vec::new();
    let mut idx = Vec::new();
    for r in 0..table.rows() {
        let row: Vec<f64> = cols.iter().map(|&k| table.columns[k].values.get(r).copied().unwrap_or(f64::NAN)).collect();
        if row.iter().all(|v| v.is_finite()) {
            rows.push(row);
            idx.push(r);
        }
    }
    (rows, idx)
}

fn standardize(rows: &mut [Vec<f64>]) -> (Vec<f64>, Vec<f64>) {
    let d = rows.first().map_or(0, |r| r.len());
    let means: Vec<f64> = (0..d).map(|j| mean(&rows.iter().map(|r| r[j]).collect::<Vec<_>>())).collect();
    let sds: Vec<f64> = (0..d).map(|j| { let s = std_dev(&rows.iter().map(|r| r[j]).collect::<Vec<_>>()); if s > 0.0 { s } else { 1.0 } }).collect();
    for r in rows.iter_mut() {
        for j in 0..d {
            r[j] = (r[j] - means[j]) / sds[j];
        }
    }
    (means, sds)
}

fn dist2(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(p, q)| (p - q) * (p - q)).sum()
}

pub fn kmeans(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let cols = column_list(table, &ctx.str("columns", ""))?;
    let k = ctx.count("k", 3, 1, 100)?;
    let iterations = ctx.count("iterations", 100, 1, 10_000)?;
    let scale = ctx.flag("standardize", true);
    let restarts = ctx.count("restarts", 5, 1, 100)?;
    let (mut rows, idx) = matrix(table, &cols);
    if rows.len() < k {
        return Err(format!("{} complete rows are fewer than k = {k}", rows.len()));
    }
    let (means, sds) = if scale { standardize(&mut rows) } else { (vec![0.0; cols.len()], vec![1.0; cols.len()]) };
    let mut rng = ctx.rng();
    let n = rows.len();
    let mut best: Option<(f64, Vec<usize>, Vec<Vec<f64>>, usize)> = None;
    for _ in 0..restarts {
        // k-means++ seeding.
        let mut centers = vec![rows[rng.below(n)].clone()];
        let mut d2: Vec<f64> = rows.iter().map(|r| dist2(r, &centers[0])).collect();
        while centers.len() < k {
            let total: f64 = d2.iter().sum();
            let mut pick = rng.uniform() * total;
            let mut chosen = n - 1;
            for (i, v) in d2.iter().enumerate() {
                pick -= v;
                if pick <= 0.0 {
                    chosen = i;
                    break;
                }
            }
            centers.push(rows[chosen].clone());
            for (i, r) in rows.iter().enumerate() {
                d2[i] = d2[i].min(dist2(r, centers.last().unwrap()));
            }
        }
        let mut labels = vec![0usize; n];
        let mut iters = 0;
        for it in 0..iterations {
            iters = it + 1;
            let mut changed = false;
            for (i, r) in rows.iter().enumerate() {
                let (c, _) = centers.iter().enumerate().map(|(c, ctr)| (c, dist2(r, ctr))).fold((0, f64::INFINITY), |acc, x| if x.1 < acc.1 { x } else { acc });
                if labels[i] != c || it == 0 {
                    changed |= labels[i] != c;
                    labels[i] = c;
                }
            }
            let d = cols.len();
            let mut sums = vec![vec![0.0; d]; k];
            let mut counts = vec![0usize; k];
            for (i, r) in rows.iter().enumerate() {
                counts[labels[i]] += 1;
                for j in 0..d {
                    sums[labels[i]][j] += r[j];
                }
            }
            for c in 0..k {
                if counts[c] > 0 {
                    centers[c] = sums[c].iter().map(|s| s / counts[c] as f64).collect();
                } else {
                    // An empty cluster restarts at a random point.
                    centers[c] = rows[rng.below(n)].clone();
                }
            }
            if !changed && it > 0 {
                break;
            }
        }
        let inertia: f64 = rows.iter().enumerate().map(|(i, r)| dist2(r, &centers[labels[i]])).sum();
        if best.as_ref().is_none_or(|b| inertia < b.0) {
            best = Some((inertia, labels, centers, iters));
        }
        ctx.check()?;
    }
    let (inertia, labels, centers, iters) = best.unwrap();
    let mut out = table.clone();
    let mut cluster = vec![f64::NAN; table.rows()];
    for (i, &r) in idx.iter().enumerate() {
        cluster[r] = (labels[i] + 1) as f64;
    }
    out.push(Column::new("cluster", "", cluster));
    let mut ct = Table::new("centroids");
    ct.push(Column::text("cluster", (1..=k).map(|c| format!("{c}")).collect()));
    for (j, &col) in cols.iter().enumerate() {
        ct.push(Column::new(&table.columns[col].name, &table.columns[col].unit, centers.iter().map(|c| c[j] * sds[j] + means[j]).collect()));
    }
    let sizes: Vec<f64> = (0..k).map(|c| labels.iter().filter(|l| **l == c).count() as f64).collect();
    ct.push(Column::new("size", "", sizes));
    let mut d = Dataset { tables: vec![out, ct], ..Default::default() };
    d.scalar("inertia", inertia, "").scalar("iterations", iters as f64, "").scalar("clusters", k as f64, "");
    // Mean silhouette on at most 1500 points.
    let m = n.min(1500);
    let mut sil = 0.0;
    for i in 0..m {
        let mut sums = vec![0.0; k];
        let mut counts = vec![0usize; k];
        for j in 0..m {
            if i != j {
                sums[labels[j]] += dist2(&rows[i], &rows[j]).sqrt();
                counts[labels[j]] += 1;
            }
        }
        let own = labels[i];
        let a = if counts[own] > 0 { sums[own] / counts[own] as f64 } else { 0.0 };
        let b = (0..k).filter(|&c| c != own && counts[c] > 0).map(|c| sums[c] / counts[c] as f64).fold(f64::INFINITY, f64::min);
        if b.is_finite() && a.max(b) > 0.0 {
            sil += (b - a) / a.max(b);
        }
    }
    d.scalar("silhouette", if k > 1 { sil / m as f64 } else { f64::NAN }, "");
    Ok(d)
}

pub fn pca(ctx: &mut Ctx) -> Result<Dataset, String> {
    let table = input_table(ctx, "in")?;
    let cols = column_list(table, &ctx.str("columns", ""))?;
    if cols.len() < 2 {
        return Err("PCA needs at least two columns".into());
    }
    let scale = ctx.flag("standardize", true);
    let (mut rows, idx) = matrix(table, &cols);
    if rows.len() < 3 {
        return Err("too few complete rows".into());
    }
    let d = cols.len();
    let n = rows.len();
    let means: Vec<f64> = (0..d).map(|j| mean(&rows.iter().map(|r| r[j]).collect::<Vec<_>>())).collect();
    for r in rows.iter_mut() {
        for j in 0..d {
            r[j] -= means[j];
        }
    }
    if scale {
        for j in 0..d {
            let s = (rows.iter().map(|r| r[j] * r[j]).sum::<f64>() / (n - 1) as f64).sqrt();
            if s > 0.0 {
                for r in rows.iter_mut() {
                    r[j] /= s;
                }
            }
        }
    }
    let mut cov = vec![vec![0.0; d]; d];
    for r in &rows {
        for i in 0..d {
            for j in i..d {
                cov[i][j] += r[i] * r[j];
            }
        }
    }
    for i in 0..d {
        for j in i..d {
            cov[i][j] /= (n - 1) as f64;
            cov[j][i] = cov[i][j];
        }
    }
    let (values, vectors) = sym_eigen(&cov);
    let keep = ctx.count("components", 2, 1, d as i64)?;
    let total: f64 = values.iter().map(|v| v.max(0.0)).sum();
    let mut scores = Table::new("scores");
    for c in 0..keep {
        let mut s = vec![f64::NAN; table.rows()];
        for (k, &r) in idx.iter().enumerate() {
            s[r] = (0..d).map(|j| rows[k][j] * vectors[j][c]).sum();
        }
        scores.push(Column::new(&format!("PC{}", c + 1), "", s));
    }
    // Text columns (labels) and a "cluster" or class column ride along for colouring.
    for c in &table.columns {
        if c.is_text() {
            scores.push(c.clone());
        }
    }
    let mut loadings = Table::new("loadings");
    loadings.push(Column::text("variable", cols.iter().map(|&k| table.columns[k].name.clone()).collect()));
    for c in 0..keep {
        loadings.push(Column::new(&format!("PC{}", c + 1), "", (0..d).map(|j| vectors[j][c]).collect()));
    }
    let mut var = Table::new("explained variance").with_x(Column::new("component", "", (1..=d).map(|i| i as f64).collect()));
    var.push(Column::new("eigenvalue", "", values.clone()));
    var.push(Column::new("ratio", "%", values.iter().map(|v| v.max(0.0) / total * 100.0).collect()));
    let mut acc = 0.0;
    var.push(Column::new("cumulative", "%", values.iter().map(|v| { acc += v.max(0.0) / total * 100.0; acc }).collect()));
    let mut out = Dataset { tables: vec![scores, loadings, var], ..Default::default() };
    out.scalar("PC1 explains", values[0].max(0.0) / total * 100.0, "%");
    if d > 1 {
        out.scalar("PC1+PC2 explain", (values[0].max(0.0) + values[1].max(0.0)) / total * 100.0, "%");
    }
    Ok(out)
}

// ───────────────────────── multilayer perceptron

#[derive(Clone, Copy, PartialEq)]
enum Act {
    Tanh,
    Relu,
    Sigmoid,
    Linear,
}

fn act(a: Act, x: f64) -> f64 {
    match a {
        Act::Tanh => x.tanh(),
        Act::Relu => x.max(0.0),
        Act::Sigmoid => 1.0 / (1.0 + (-x).exp()),
        Act::Linear => x,
    }
}

/// Derivative from the activated value y.
fn dact(a: Act, y: f64) -> f64 {
    match a {
        Act::Tanh => 1.0 - y * y,
        Act::Relu => {
            if y > 0.0 {
                1.0
            } else {
                0.0
            }
        }
        Act::Sigmoid => y * (1.0 - y),
        Act::Linear => 1.0,
    }
}

struct Layer {
    w: Vec<f64>, // out × in
    b: Vec<f64>,
    n_in: usize,
    n_out: usize,
    act: Act,
    mw: Vec<f64>,
    vw: Vec<f64>,
    mb: Vec<f64>,
    vb: Vec<f64>,
}

struct Net {
    layers: Vec<Layer>,
}

impl Net {
    fn new(sizes: &[usize], hidden: Act, rng: &mut Rng) -> Net {
        let mut layers = Vec::new();
        for i in 0..sizes.len() - 1 {
            let (n_in, n_out) = (sizes[i], sizes[i + 1]);
            let last = i == sizes.len() - 2;
            let scale = if hidden == Act::Relu && !last { (2.0 / n_in as f64).sqrt() } else { (1.0 / n_in as f64).sqrt() };
            layers.push(Layer {
                w: (0..n_in * n_out).map(|_| rng.normal() * scale).collect(),
                b: vec![0.0; n_out],
                n_in,
                n_out,
                act: if last { Act::Linear } else { hidden },
                mw: vec![0.0; n_in * n_out],
                vw: vec![0.0; n_in * n_out],
                mb: vec![0.0; n_out],
                vb: vec![0.0; n_out],
            });
        }
        Net { layers }
    }

    fn params(&self) -> usize {
        self.layers.iter().map(|l| l.w.len() + l.b.len()).sum()
    }

    /// Activations of every layer (first = input).
    fn forward(&self, x: &[f64]) -> Vec<Vec<f64>> {
        let mut acts = vec![x.to_vec()];
        for l in &self.layers {
            let input = acts.last().unwrap();
            let out: Vec<f64> = (0..l.n_out).map(|o| act(l.act, l.b[o] + (0..l.n_in).map(|i| l.w[o * l.n_in + i] * input[i]).sum::<f64>())).collect();
            acts.push(out);
        }
        acts
    }
}

fn softmax(z: &[f64]) -> Vec<f64> {
    let m = z.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let e: Vec<f64> = z.iter().map(|v| (v - m).exp()).collect();
    let s: f64 = e.iter().sum();
    e.iter().map(|v| v / s).collect()
}

pub fn mlp(ctx: &mut Ctx) -> Result<Dataset, String> {
    let owned = input_table(ctx, "in")?.clone();
    let table = &owned;
    let target_name = ctx.str("target", "");
    let target_col = table.pick(&target_name)?.clone();
    let features: Vec<usize> = column_list(table, &ctx.str("features", ""))?.into_iter().filter(|&k| table.columns[k].name != target_col.name).collect();
    if features.is_empty() {
        return Err("choose at least one feature column".into());
    }
    let task = ctx.str("task", "regression");
    let classify = task == "classification";
    let hidden: Vec<usize> = ctx.str("hidden", "16, 16").split(|c| c == ',' || c == ' ').filter(|s| !s.trim().is_empty()).map(|s| s.trim().parse::<usize>().map_err(|_| format!("hidden: \"{s}\" is not a layer size"))).collect::<Result<_, _>>()?;
    if hidden.iter().any(|&h| h == 0 || h > 1024) || hidden.len() > 8 {
        return Err("hidden: up to 8 layers of 1 … 1024 neurons".into());
    }
    let activation = match ctx.str("activation", "tanh").as_str() {
        "relu" => Act::Relu,
        "sigmoid" => Act::Sigmoid,
        _ => Act::Tanh,
    };
    let epochs = ctx.count("epochs", 300, 1, 100_000)?;
    let lr = ctx.positive("learningRate", 0.01)?;
    let batch = ctx.count("batch", 32, 1, 1_000_000)?;
    let test_fraction = ctx.num("testFraction", 0.2)?.clamp(0.0, 0.9);
    let l2 = ctx.num("l2", 0.0)?.max(0.0);
    let mut rng = ctx.rng();
    // Rows with finite features and target.
    let mut all_cols = features.clone();
    let tk = table.find(&target_col.name).unwrap();
    all_cols.push(tk);
    let (rows, idx) = matrix(table, &all_cols);
    let nf = features.len();
    if rows.len() < 4 {
        return Err("too few complete rows to train".into());
    }
    let mut x: Vec<Vec<f64>> = rows.iter().map(|r| r[..nf].to_vec()).collect();
    let (xm, xs) = standardize(&mut x);
    let y_raw: Vec<f64> = rows.iter().map(|r| r[nf]).collect();
    // Classes: the distinct target values (rounded), in ascending order.
    let classes: Vec<f64> = if classify {
        let mut c: Vec<f64> = y_raw.iter().map(|v| v.round()).collect();
        c.sort_by(|a, b| a.partial_cmp(b).unwrap());
        c.dedup();
        if c.len() < 2 || c.len() > 100 {
            return Err(format!("classification needs 2 … 100 classes in the target, found {}", c.len()));
        }
        c
    } else {
        Vec::new()
    };
    let ym = if classify { 0.0 } else { mean(&y_raw) };
    let ys = if classify { 1.0 } else { std_dev(&y_raw).max(1e-12) };
    let n_out = if classify { classes.len() } else { 1 };
    let mut sizes = vec![nf];
    sizes.extend(&hidden);
    sizes.push(n_out);
    let mut net = Net::new(&sizes, activation, &mut rng);
    // Train / test split.
    let mut order: Vec<usize> = (0..rows.len()).collect();
    rng.shuffle(&mut order);
    let n_test = ((rows.len() as f64) * test_fraction).round() as usize;
    let n_test = n_test.min(rows.len() - 2);
    let test: Vec<usize> = order[..n_test].to_vec();
    let mut train: Vec<usize> = order[n_test..].to_vec();
    let target_of = |i: usize| -> Vec<f64> {
        if classify {
            let c = classes.iter().position(|v| *v == y_raw[i].round()).unwrap_or(0);
            (0..n_out).map(|k| if k == c { 1.0 } else { 0.0 }).collect()
        } else {
            vec![(y_raw[i] - ym) / ys]
        }
    };
    let loss_of = |net: &Net, set: &[usize]| -> f64 {
        if set.is_empty() {
            return f64::NAN;
        }
        set.iter().map(|&i| {
            let out = net.forward(&x[i]).pop().unwrap();
            let t = target_of(i);
            if classify {
                let p = softmax(&out);
                -(0..n_out).map(|k| t[k] * p[k].max(1e-12).ln()).sum::<f64>()
            } else {
                (out[0] - t[0]).powi(2)
            }
        }).sum::<f64>() / set.len() as f64
    };
    let (b1, b2, eps): (f64, f64, f64) = (0.9, 0.999, 1e-8);
    let mut step = 0i32;
    let mut history = (Vec::new(), Vec::new(), Vec::new());
    let record_every = (epochs / 400).max(1);
    for epoch in 0..epochs {
        rng.shuffle(&mut train);
        for chunk in train.chunks(batch) {
            // Gradients accumulated over the batch.
            let mut gw: Vec<Vec<f64>> = net.layers.iter().map(|l| vec![0.0; l.w.len()]).collect();
            let mut gb: Vec<Vec<f64>> = net.layers.iter().map(|l| vec![0.0; l.b.len()]).collect();
            for &i in chunk {
                let acts = net.forward(&x[i]);
                let t = target_of(i);
                let out = acts.last().unwrap();
                let mut delta: Vec<f64> = if classify {
                    let p = softmax(out);
                    (0..n_out).map(|k| p[k] - t[k]).collect()
                } else {
                    vec![2.0 * (out[0] - t[0])]
                };
                for li in (0..net.layers.len()).rev() {
                    let l = &net.layers[li];
                    let input = &acts[li];
                    let d: Vec<f64> = if li == net.layers.len() - 1 { delta.clone() } else { delta.iter().zip(&acts[li + 1]).map(|(dv, y)| dv * dact(l.act, *y)).collect() };
                    for o in 0..l.n_out {
                        gb[li][o] += d[o];
                        for k in 0..l.n_in {
                            gw[li][o * l.n_in + k] += d[o] * input[k];
                        }
                    }
                    if li > 0 {
                        delta = (0..l.n_in).map(|k| (0..l.n_out).map(|o| l.w[o * l.n_in + k] * d[o]).sum()).collect();
                    }
                }
            }
            step += 1;
            let scale = 1.0 / chunk.len() as f64;
            let c1 = 1.0 - b1.powi(step);
            let c2 = 1.0 - b2.powi(step);
            for (li, l) in net.layers.iter_mut().enumerate() {
                for j in 0..l.w.len() {
                    let g = gw[li][j] * scale + l2 * l.w[j];
                    l.mw[j] = b1 * l.mw[j] + (1.0 - b1) * g;
                    l.vw[j] = b2 * l.vw[j] + (1.0 - b2) * g * g;
                    l.w[j] -= lr * (l.mw[j] / c1) / ((l.vw[j] / c2).sqrt() + eps);
                }
                for j in 0..l.b.len() {
                    let g = gb[li][j] * scale;
                    l.mb[j] = b1 * l.mb[j] + (1.0 - b1) * g;
                    l.vb[j] = b2 * l.vb[j] + (1.0 - b2) * g * g;
                    l.b[j] -= lr * (l.mb[j] / c1) / ((l.vb[j] / c2).sqrt() + eps);
                }
            }
        }
        if epoch % record_every == 0 || epoch == epochs - 1 {
            let tr = loss_of(&net, &train);
            if !tr.is_finite() {
                return Err(format!("training diverged at epoch {} (lower the learning rate)", epoch + 1));
            }
            history.0.push((epoch + 1) as f64);
            history.1.push(tr);
            history.2.push(loss_of(&net, &test));
        }
        if epoch % 10 == 0 {
            ctx.check()?;
            ctx.report(epoch as f64 / epochs as f64, &format!("epoch {}", epoch + 1));
        }
    }
    // Predictions for every complete row.
    let predict = |xr: &[f64]| -> (f64, Vec<f64>) {
        let out = net.forward(xr).pop().unwrap();
        if classify {
            let p = softmax(&out);
            let k = (0..n_out).max_by(|&a, &b| p[a].partial_cmp(&p[b]).unwrap()).unwrap();
            (classes[k], p)
        } else {
            (out[0] * ys + ym, Vec::new())
        }
    };
    let mut pred = vec![f64::NAN; table.rows()];
    let mut set = vec![f64::NAN; table.rows()];
    let test_set: std::collections::HashSet<usize> = test.iter().copied().collect();
    let mut correct = (0usize, 0usize, 0usize, 0usize);
    for (k, &r) in idx.iter().enumerate() {
        let (p, _) = predict(&x[k]);
        pred[r] = p;
        let is_test = test_set.contains(&k);
        set[r] = if is_test { 1.0 } else { 0.0 };
        if classify {
            let ok = p == y_raw[k].round();
            if is_test {
                correct.2 += 1;
                correct.3 += ok as usize;
            } else {
                correct.0 += 1;
                correct.1 += ok as usize;
            }
        }
    }
    let mut out = table.clone();
    out.push(Column::new("prediction", &target_col.unit, pred.clone()));
    out.push(Column::new("test", "", set));
    let mut loss = Table::new("loss").with_x(Column::new("epoch", "", history.0));
    loss.push(Column::new("train", "", history.1));
    loss.push(Column::new("test", "", history.2));
    let mut d = Dataset { tables: vec![out, loss], ..Default::default() };
    d.scalar("parameters", net.params() as f64, "");
    if classify {
        d.scalar("train accuracy", correct.1 as f64 / correct.0.max(1) as f64 * 100.0, "%");
        if correct.2 > 0 {
            d.scalar("test accuracy", correct.3 as f64 / correct.2 as f64 * 100.0, "%");
        }
        // Confusion matrix as a grid.
        let nc = classes.len();
        let mut z = vec![0.0; nc * nc];
        for (k, _) in idx.iter().enumerate() {
            let truth = classes.iter().position(|c| *c == y_raw[k].round()).unwrap_or(0);
            let guess = classes.iter().position(|c| *c == predict(&x[k]).0).unwrap_or(0);
            z[truth * nc + guess] += 1.0;
        }
        let names: Vec<String> = classes.iter().map(|c| crate::data::format_number(*c)).collect();
        let axis: Vec<f64> = (0..nc).map(|i| i as f64).collect();
        d.grids.push(Grid { name: "confusion".into(), x: axis.clone(), y: axis, z, x_label: "predicted".into(), y_label: "true".into(), z_label: "count".into(), x_names: Some(names.clone()), y_names: Some(names) });
    } else {
        let r2 = |set: &dyn Fn(usize) -> bool| -> f64 {
            let pairs: Vec<(f64, f64)> = idx.iter().enumerate().filter(|(k, _)| set(*k)).map(|(k, &r)| (y_raw[k], pred[r])).collect();
            let m = pairs.iter().map(|p| p.0).sum::<f64>() / pairs.len().max(1) as f64;
            let res: f64 = pairs.iter().map(|(a, b)| (a - b).powi(2)).sum();
            let tot: f64 = pairs.iter().map(|(a, _)| (a - m).powi(2)).sum();
            if tot > 0.0 { 1.0 - res / tot } else { f64::NAN }
        };
        d.scalar("train R²", r2(&|k| !test_set.contains(&k)), "");
        if !test.is_empty() {
            d.scalar("test R²", r2(&|k| test_set.contains(&k)), "");
        }
        let rmse = (idx.iter().enumerate().map(|(k, &r)| (y_raw[k] - pred[r]).powi(2)).sum::<f64>() / idx.len() as f64).sqrt();
        d.scalar("RMSE", rmse, &target_col.unit);
    }
    // One feature: a smooth prediction curve; two features: a prediction map.
    if nf == 1 {
        let lo = rows.iter().map(|r| r[0]).fold(f64::INFINITY, f64::min);
        let hi = rows.iter().map(|r| r[0]).fold(f64::NEG_INFINITY, f64::max);
        let gx: Vec<f64> = (0..300).map(|k| lo + (hi - lo) * k as f64 / 299.0).collect();
        let gy: Vec<f64> = gx.iter().map(|v| predict(&[(v - xm[0]) / xs[0]]).0).collect();
        let mut c = Table::new("curve").with_x(Column::new(&table.columns[features[0]].name, &table.columns[features[0]].unit, gx));
        c.push(Column::new("prediction", &target_col.unit, gy));
        d.tables.push(c);
    } else if nf == 2 {
        let range = |j: usize| (rows.iter().map(|r| r[j]).fold(f64::INFINITY, f64::min), rows.iter().map(|r| r[j]).fold(f64::NEG_INFINITY, f64::max));
        let ((x0, x1), (y0, y1)) = (range(0), range(1));
        let m = 60;
        let gx: Vec<f64> = (0..m).map(|k| x0 + (x1 - x0) * k as f64 / (m - 1) as f64).collect();
        let gy: Vec<f64> = (0..m).map(|k| y0 + (y1 - y0) * k as f64 / (m - 1) as f64).collect();
        let mut z = Vec::with_capacity(m * m);
        for &yv in &gy {
            for &xv in &gx {
                z.push(predict(&[(xv - xm[0]) / xs[0], (yv - xm[1]) / xs[1]]).0);
            }
        }
        d.grids.push(Grid { name: "prediction map".into(), x: gx, y: gy, z, x_label: table.columns[features[0]].name.clone(), y_label: table.columns[features[1]].name.clone(), z_label: target_col.name.clone(), x_names: None, y_names: None });
    }
    Ok(d)
}
