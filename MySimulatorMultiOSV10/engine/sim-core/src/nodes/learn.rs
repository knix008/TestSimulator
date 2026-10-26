//! Supervised learning (MATLAB's fitcsvm / fitcecoc and fitctree / fitrtree):
//! support vector machines (linear, RBF and polynomial kernels, SMO, one
//! class against the rest) and CART decision trees for classification and
//! regression, with a train/test split, a confusion matrix and the decision
//! map over two features.

use super::{column_list, input_table};
use crate::data::{format_number, Column, Dataset, Grid, Table};
use crate::Ctx;

/// Features (standardised), labels and the class names of a table.
struct Data {
    x: Vec<Vec<f64>>,
    /// Class index (classification) or the target value (regression).
    y: Vec<f64>,
    classes: Vec<String>,
    names: Vec<String>,
    mean: Vec<f64>,
    sd: Vec<f64>,
}

fn load(ctx: &Ctx, classify: bool, standardize: bool) -> Result<Data, String> {
    let table = input_table(ctx, "in")?;
    let target = table.pick(&ctx.str("target", ""))?.clone();
    // Empty = every numeric column but the target (the x column included: features are not a time axis).
    let chosen = ctx.str("features", "");
    let candidates: Vec<usize> = if chosen.trim().is_empty() { (0..table.columns.len()).collect() } else { column_list(table, &chosen)? };
    let feats: Vec<usize> = candidates.into_iter().filter(|&k| table.columns[k].name != target.name && !table.columns[k].is_text()).collect();
    if feats.is_empty() {
        return Err("choose at least one numeric feature column".into());
    }
    let names: Vec<String> = feats.iter().map(|&k| table.columns[k].name.clone()).collect();
    let mut classes: Vec<String> = Vec::new();
    let (mut x, mut y) = (Vec::new(), Vec::new());
    for i in 0..table.rows() {
        let row: Vec<f64> = feats.iter().map(|&k| table.columns[k].values[i]).collect();
        if row.iter().any(|v| !v.is_finite()) {
            continue;
        }
        let label = if classify {
            let key = match &target.labels {
                Some(l) => l[i].clone(),
                None => {
                    if !target.values[i].is_finite() {
                        continue;
                    }
                    format_number(target.values[i])
                }
            };
            if key.is_empty() {
                continue;
            }
            let k = match classes.iter().position(|c| *c == key) {
                Some(k) => k,
                None => {
                    classes.push(key);
                    classes.len() - 1
                }
            };
            k as f64
        } else {
            if !target.values[i].is_finite() {
                continue;
            }
            target.values[i]
        };
        x.push(row);
        y.push(label);
    }
    if x.len() < 4 {
        return Err("too few complete rows to train".into());
    }
    if classify && classes.len() < 2 {
        return Err("the target has only one class".into());
    }
    let d = names.len();
    let (mut mean, mut sd) = (vec![0.0; d], vec![1.0; d]);
    if standardize {
        for j in 0..d {
            let m = x.iter().map(|r| r[j]).sum::<f64>() / x.len() as f64;
            let s = (x.iter().map(|r| (r[j] - m).powi(2)).sum::<f64>() / x.len() as f64).sqrt();
            mean[j] = m;
            sd[j] = if s > 0.0 { s } else { 1.0 };
        }
        for r in x.iter_mut() {
            for j in 0..d {
                r[j] = (r[j] - mean[j]) / sd[j];
            }
        }
    }
    Ok(Data { x, y, classes, names, mean, sd })
}

/// Train/test indices (shuffled with the seed).
fn split(n: usize, fraction: f64, rng: &mut crate::rng::Rng) -> (Vec<usize>, Vec<usize>) {
    let mut idx: Vec<usize> = (0..n).collect();
    rng.shuffle(&mut idx);
    let n_test = ((n as f64) * fraction).round() as usize;
    let n_test = n_test.min(n.saturating_sub(2));
    let test = idx[..n_test].to_vec();
    let train = idx[n_test..].to_vec();
    (train, test)
}

fn confusion(classes: &[String], truth: &[usize], pred: &[usize]) -> Table {
    let k = classes.len();
    let mut m = vec![vec![0.0; k]; k];
    for (t, p) in truth.iter().zip(pred) {
        m[*t][*p] += 1.0;
    }
    let mut table = Table::new("confusion matrix");
    table.push(Column::text("true \\ predicted", classes.to_vec()));
    for j in 0..k {
        table.push(Column::new(&classes[j], "", m.iter().map(|r| r[j]).collect()));
    }
    table
}

// ───────────────────────── support vector machine

#[derive(Clone, Copy)]
enum Kernel {
    Linear,
    Rbf(f64),
    Poly(f64, f64),
}

impl Kernel {
    fn k(&self, a: &[f64], b: &[f64]) -> f64 {
        match *self {
            Kernel::Linear => a.iter().zip(b).map(|(p, q)| p * q).sum(),
            Kernel::Rbf(gamma) => (-gamma * a.iter().zip(b).map(|(p, q)| (p - q).powi(2)).sum::<f64>()).exp(),
            Kernel::Poly(deg, c) => (a.iter().zip(b).map(|(p, q)| p * q).sum::<f64>() + c).powf(deg),
        }
    }
}

/// A binary SVM: f(x) = Σ αᵢ yᵢ K(xᵢ, x) + b.
struct Svm {
    sv: Vec<Vec<f64>>,
    coef: Vec<f64>,
    b: f64,
    kernel: Kernel,
}

impl Svm {
    fn decision(&self, x: &[f64]) -> f64 {
        self.sv.iter().zip(&self.coef).map(|(s, c)| c * self.kernel.k(s, x)).sum::<f64>() + self.b
    }
}

/// Sequential minimal optimisation (Platt, with the second-choice heuristic of Keerthi's simplified variant).
fn smo(x: &[Vec<f64>], y: &[f64], c: f64, kernel: Kernel, tol: f64, max_passes: usize, rng: &mut crate::rng::Rng) -> Svm {
    let n = x.len();
    let kmat: Vec<Vec<f64>> = (0..n).map(|i| (0..n).map(|j| kernel.k(&x[i], &x[j])).collect()).collect();
    let mut alpha = vec![0.0; n];
    let mut b = 0.0;
    let f = |alpha: &[f64], b: f64, i: usize| -> f64 { (0..n).map(|j| alpha[j] * y[j] * kmat[j][i]).sum::<f64>() + b };
    let mut passes = 0;
    let mut iter = 0;
    while passes < max_passes && iter < 20_000 {
        iter += 1;
        let mut changed = 0;
        for i in 0..n {
            let ei = f(&alpha, b, i) - y[i];
            if (y[i] * ei < -tol && alpha[i] < c) || (y[i] * ei > tol && alpha[i] > 0.0) {
                // The partner with the largest |Ei − Ej|, else a random one.
                let mut j = (0..n).filter(|&j| j != i).max_by(|&p, &q| {
                    let ep = (f(&alpha, b, p) - y[p] - ei).abs();
                    let eq = (f(&alpha, b, q) - y[q] - ei).abs();
                    ep.partial_cmp(&eq).unwrap_or(std::cmp::Ordering::Equal)
                }).unwrap_or(0);
                if iter % 3 == 0 {
                    j = (i + 1 + rng.below(n - 1)) % n;
                }
                let ej = f(&alpha, b, j) - y[j];
                let (ai, aj) = (alpha[i], alpha[j]);
                let (lo, hi) = if y[i] != y[j] { ((aj - ai).max(0.0), (c + aj - ai).min(c)) } else { ((ai + aj - c).max(0.0), (ai + aj).min(c)) };
                if lo >= hi {
                    continue;
                }
                let eta = 2.0 * kmat[i][j] - kmat[i][i] - kmat[j][j];
                if eta >= 0.0 {
                    continue;
                }
                let mut nj = aj - y[j] * (ei - ej) / eta;
                nj = nj.clamp(lo, hi);
                if (nj - aj).abs() < 1e-7 {
                    continue;
                }
                let ni = ai + y[i] * y[j] * (aj - nj);
                let b1 = b - ei - y[i] * (ni - ai) * kmat[i][i] - y[j] * (nj - aj) * kmat[i][j];
                let b2 = b - ej - y[i] * (ni - ai) * kmat[i][j] - y[j] * (nj - aj) * kmat[j][j];
                b = if ni > 0.0 && ni < c { b1 } else if nj > 0.0 && nj < c { b2 } else { (b1 + b2) / 2.0 };
                alpha[i] = ni;
                alpha[j] = nj;
                changed += 1;
            }
        }
        passes = if changed == 0 { passes + 1 } else { 0 };
    }
    let mut sv = Vec::new();
    let mut coef = Vec::new();
    for i in 0..n {
        if alpha[i] > 1e-8 {
            sv.push(x[i].clone());
            coef.push(alpha[i] * y[i]);
        }
    }
    Svm { sv, coef, b, kernel }
}

pub fn svm(ctx: &mut Ctx) -> Result<Dataset, String> {
    let data = load(ctx, true, ctx.flag("standardize", true))?;
    let d = data.names.len();
    let kernel = match ctx.str("kernel", "rbf").as_str() {
        "linear" => Kernel::Linear,
        "rbf" | "gaussian" => Kernel::Rbf(match ctx.num("gamma", 0.0)? { g if g > 0.0 => g, _ => 1.0 / d as f64 }),
        "poly" | "polynomial" => Kernel::Poly(ctx.num("degree", 3.0)?, 1.0),
        other => return Err(format!("unknown kernel \"{other}\" (linear, rbf, poly)")),
    };
    let c = ctx.positive("C", 1.0)?;
    if data.x.len() > 3000 {
        return Err(format!("{} rows are too many for this SVM (at most 3000)", data.x.len()));
    }
    let mut rng = ctx.rng();
    let (train, test) = split(data.x.len(), ctx.num("testFraction", 0.25)?.clamp(0.0, 0.9), &mut rng);
    let k = data.classes.len();
    let xt: Vec<Vec<f64>> = train.iter().map(|&i| data.x[i].clone()).collect();
    // One machine (two classes) or one per class against the rest.
    let machines: Vec<Svm> = if k == 2 {
        let yt: Vec<f64> = train.iter().map(|&i| if data.y[i] == 1.0 { 1.0 } else { -1.0 }).collect();
        vec![smo(&xt, &yt, c, kernel, 1e-3, 5, &mut rng)]
    } else {
        (0..k)
            .map(|cls| {
                let yt: Vec<f64> = train.iter().map(|&i| if data.y[i] as usize == cls { 1.0 } else { -1.0 }).collect();
                smo(&xt, &yt, c, kernel, 1e-3, 5, &mut rng)
            })
            .collect()
    };
    ctx.check()?;
    let predict = |x: &[f64]| -> (usize, f64) {
        if k == 2 {
            let s = machines[0].decision(x);
            (if s >= 0.0 { 1 } else { 0 }, s)
        } else {
            let scores: Vec<f64> = machines.iter().map(|m| m.decision(x)).collect();
            let best = (0..k).max_by(|&a, &b| scores[a].partial_cmp(&scores[b]).unwrap_or(std::cmp::Ordering::Equal)).unwrap();
            (best, scores[best])
        }
    };
    finish_classifier(ctx, &data, &train, &test, &|x| predict(x), "SVM", |out| {
        out.scalar("support vectors", machines.iter().map(|m| m.sv.len()).sum::<usize>() as f64, "");
        if let (Kernel::Linear, 2) = (kernel, k) {
            // The separating hyperplane in standardised units: w·x + b = 0.
            let w: Vec<f64> = (0..d).map(|j| machines[0].sv.iter().zip(&machines[0].coef).map(|(s, c)| c * s[j]).sum()).collect();
            let mut t = Table::new("hyperplane (standardised)");
            t.push(Column::text("term", data.names.iter().cloned().chain(std::iter::once("bias".to_string())).collect()));
            t.push(Column::new("weight", "", w.into_iter().chain(std::iter::once(machines[0].b)).collect()));
            out.tables.push(t);
        }
    })
}

/// Predictions, accuracy, the confusion matrix and (two features) the decision map.
fn finish_classifier(ctx: &Ctx, data: &Data, train: &[usize], test: &[usize], predict: &dyn Fn(&[f64]) -> (usize, f64), what: &str, extra: impl FnOnce(&mut Dataset)) -> Result<Dataset, String> {
    let n = data.x.len();
    let preds: Vec<(usize, f64)> = data.x.iter().map(|x| predict(x)).collect();
    let acc = |idx: &[usize]| if idx.is_empty() { f64::NAN } else { idx.iter().filter(|&&i| preds[i].0 == data.y[i] as usize).count() as f64 / idx.len() as f64 * 100.0 };
    let mut is_test = vec![false; n];
    for &i in test {
        is_test[i] = true;
    }
    let mut table = Table::new("predictions");
    for (j, name) in data.names.iter().enumerate() {
        table.push(Column::new(name, "", data.x.iter().map(|r| r[j] * data.sd[j] + data.mean[j]).collect()));
    }
    table.push(Column::text("class", data.y.iter().map(|v| data.classes[*v as usize].clone()).collect()));
    table.push(Column::text("predicted", preds.iter().map(|p| data.classes[p.0].clone()).collect()));
    table.push(Column::new("predicted index", "", preds.iter().map(|p| p.0 as f64).collect()));
    table.push(Column::new("score", "", preds.iter().map(|p| p.1).collect()));
    table.push(Column::text("set", is_test.iter().map(|t| if *t { "test".into() } else { "train".into() }).collect()));
    let mut out = Dataset::table(table);
    let eval_idx: Vec<usize> = if test.is_empty() { train.to_vec() } else { test.to_vec() };
    let truth: Vec<usize> = eval_idx.iter().map(|&i| data.y[i] as usize).collect();
    let pred: Vec<usize> = eval_idx.iter().map(|&i| preds[i].0).collect();
    out.tables.push(confusion(&data.classes, &truth, &pred));
    out.scalar("train accuracy", acc(train), "%");
    if !test.is_empty() {
        out.scalar("test accuracy", acc(test), "%");
    }
    out.scalar("classes", data.classes.len() as f64, "").scalar("rows", n as f64, "");
    // The decision regions over the first two features.
    if data.names.len() == 2 && ctx.flag("map", true) {
        let res = 60;
        let (mut lo, mut hi) = ([f64::INFINITY; 2], [f64::NEG_INFINITY; 2]);
        for r in &data.x {
            for j in 0..2 {
                lo[j] = lo[j].min(r[j]);
                hi[j] = hi[j].max(r[j]);
            }
        }
        let pad = |j: usize| 0.1 * (hi[j] - lo[j]).max(1e-9);
        let gx: Vec<f64> = (0..res).map(|i| lo[0] - pad(0) + (hi[0] - lo[0] + 2.0 * pad(0)) * i as f64 / (res - 1) as f64).collect();
        let gy: Vec<f64> = (0..res).map(|i| lo[1] - pad(1) + (hi[1] - lo[1] + 2.0 * pad(1)) * i as f64 / (res - 1) as f64).collect();
        let mut z = vec![0.0; res * res];
        for (j, yv) in gy.iter().enumerate() {
            for (i, xv) in gx.iter().enumerate() {
                z[j * res + i] = predict(&[*xv, *yv]).0 as f64;
            }
        }
        out.grids.push(Grid {
            name: "decision regions".into(),
            x: gx.iter().map(|v| v * data.sd[0] + data.mean[0]).collect(),
            y: gy.iter().map(|v| v * data.sd[1] + data.mean[1]).collect(),
            z,
            x_label: data.names[0].clone(),
            y_label: data.names[1].clone(),
            z_label: "class".into(),
            x_names: None,
            y_names: None,
        });
    }
    extra(&mut out);
    out.text = format!("{what}: {} classes ({}), test accuracy {}", data.classes.len(), data.classes.join(", "), format_number(acc(if test.is_empty() { train } else { test })));
    Ok(out)
}

// ───────────────────────── decision tree

enum TreeNode {
    Leaf { value: f64, n: usize },
    Split { feature: usize, threshold: f64, left: Box<TreeNode>, right: Box<TreeNode> },
}

struct TreeParams {
    classify: bool,
    classes: usize,
    max_depth: usize,
    min_leaf: usize,
}

/// Impurity of a set: Gini (classification) or the sum of squared deviations (regression).
fn impurity(y: &[f64], idx: &[usize], p: &TreeParams) -> f64 {
    if p.classify {
        let mut counts = vec![0.0; p.classes];
        for &i in idx {
            counts[y[i] as usize] += 1.0;
        }
        let n = idx.len() as f64;
        n * (1.0 - counts.iter().map(|c| (c / n).powi(2)).sum::<f64>())
    } else {
        let m = idx.iter().map(|&i| y[i]).sum::<f64>() / idx.len() as f64;
        idx.iter().map(|&i| (y[i] - m).powi(2)).sum()
    }
}

fn leaf_value(y: &[f64], idx: &[usize], p: &TreeParams) -> f64 {
    if p.classify {
        let mut counts = vec![0usize; p.classes];
        for &i in idx {
            counts[y[i] as usize] += 1;
        }
        (0..p.classes).max_by_key(|&c| counts[c]).unwrap_or(0) as f64
    } else {
        idx.iter().map(|&i| y[i]).sum::<f64>() / idx.len().max(1) as f64
    }
}

fn grow(x: &[Vec<f64>], y: &[f64], idx: Vec<usize>, depth: usize, p: &TreeParams, importance: &mut [f64]) -> TreeNode {
    let n = idx.len();
    let here = impurity(y, &idx, p);
    if depth >= p.max_depth || n < 2 * p.min_leaf || here <= 1e-12 {
        return TreeNode::Leaf { value: leaf_value(y, &idx, p), n };
    }
    let d = x[0].len();
    let mut best: Option<(f64, usize, f64)> = None;
    for f in 0..d {
        let mut order = idx.clone();
        order.sort_by(|&a, &b| x[a][f].partial_cmp(&x[b][f]).unwrap_or(std::cmp::Ordering::Equal));
        // Running statistics for a fast scan.
        let mut left_counts = vec![0.0; p.classes.max(1)];
        let mut right_counts = vec![0.0; p.classes.max(1)];
        let (mut ls, mut lss, mut rs, mut rss) = (0.0, 0.0, 0.0, 0.0);
        for &i in &order {
            if p.classify {
                right_counts[y[i] as usize] += 1.0;
            } else {
                rs += y[i];
                rss += y[i] * y[i];
            }
        }
        for k in 0..n - 1 {
            let i = order[k];
            if p.classify {
                left_counts[y[i] as usize] += 1.0;
                right_counts[y[i] as usize] -= 1.0;
            } else {
                ls += y[i];
                lss += y[i] * y[i];
                rs -= y[i];
                rss -= y[i] * y[i];
            }
            let (nl, nr) = ((k + 1) as f64, (n - k - 1) as f64);
            if (k + 1) < p.min_leaf || (n - k - 1) < p.min_leaf || x[order[k]][f] == x[order[k + 1]][f] {
                continue;
            }
            let cost = if p.classify {
                nl * (1.0 - left_counts.iter().map(|c| (c / nl).powi(2)).sum::<f64>()) + nr * (1.0 - right_counts.iter().map(|c| (c / nr).powi(2)).sum::<f64>())
            } else {
                (lss - ls * ls / nl) + (rss - rs * rs / nr)
            };
            if best.is_none_or(|b| cost < b.0 - 1e-12) {
                best = Some((cost, f, 0.5 * (x[order[k]][f] + x[order[k + 1]][f])));
            }
        }
    }
    match best {
        Some((cost, f, thr)) if cost < here - 1e-12 => {
            importance[f] += here - cost;
            let (l, r): (Vec<usize>, Vec<usize>) = idx.iter().partition(|&&i| x[i][f] <= thr);
            TreeNode::Split { feature: f, threshold: thr, left: Box::new(grow(x, y, l, depth + 1, p, importance)), right: Box::new(grow(x, y, r, depth + 1, p, importance)) }
        }
        _ => TreeNode::Leaf { value: leaf_value(y, &idx, p), n },
    }
}

fn tree_predict(t: &TreeNode, x: &[f64]) -> f64 {
    match t {
        TreeNode::Leaf { value, .. } => *value,
        TreeNode::Split { feature, threshold, left, right } => {
            if x[*feature] <= *threshold {
                tree_predict(left, x)
            } else {
                tree_predict(right, x)
            }
        }
    }
}

fn tree_rules(t: &TreeNode, names: &[String], classes: &[String], depth: usize, out: &mut Vec<String>, count: &mut (usize, usize)) {
    let pad = "  ".repeat(depth);
    match t {
        TreeNode::Leaf { value, n } => {
            count.0 += 1;
            let v = if classes.is_empty() { format_number(*value) } else { classes[*value as usize].clone() };
            out.push(format!("{pad}→ {v}  (n = {n})"));
        }
        TreeNode::Split { feature, threshold, left, right } => {
            count.1 = count.1.max(depth + 1);
            out.push(format!("{pad}if {} <= {}", names[*feature], format_number(*threshold)));
            tree_rules(left, names, classes, depth + 1, out, count);
            out.push(format!("{pad}else"));
            tree_rules(right, names, classes, depth + 1, out, count);
        }
    }
}

pub fn tree(ctx: &mut Ctx) -> Result<Dataset, String> {
    let classify = ctx.str("task", "classification") == "classification";
    let data = load(ctx, classify, false)?;
    let p = TreeParams { classify, classes: data.classes.len(), max_depth: ctx.count("maxDepth", 5, 1, 30)?, min_leaf: ctx.count("minLeaf", 2, 1, 10_000)? };
    let mut rng = ctx.rng();
    let (train, test) = split(data.x.len(), ctx.num("testFraction", 0.25)?.clamp(0.0, 0.9), &mut rng);
    let mut importance = vec![0.0; data.names.len()];
    let root = grow(&data.x, &data.y, train.clone(), 0, &p, &mut importance);
    let mut rules = Vec::new();
    let mut count = (0, 0);
    tree_rules(&root, &data.names, if classify { &data.classes } else { &[] }, 0, &mut rules, &mut count);
    let total: f64 = importance.iter().sum::<f64>().max(1e-300);
    let mut imp = Table::new("feature importance");
    imp.push(Column::text("feature", data.names.clone()));
    imp.push(Column::new("importance", "%", importance.iter().map(|v| v / total * 100.0).collect()));
    let mut out = if classify {
        let predict = |x: &[f64]| (tree_predict(&root, x) as usize, 0.0);
        finish_classifier(ctx, &data, &train, &test, &predict, "Decision tree", |_| {})?
    } else {
        let preds: Vec<f64> = data.x.iter().map(|x| tree_predict(&root, x)).collect();
        let r2 = |idx: &[usize]| {
            let m = idx.iter().map(|&i| data.y[i]).sum::<f64>() / idx.len() as f64;
            let ss_tot: f64 = idx.iter().map(|&i| (data.y[i] - m).powi(2)).sum();
            let ss_res: f64 = idx.iter().map(|&i| (data.y[i] - preds[i]).powi(2)).sum();
            1.0 - ss_res / ss_tot.max(1e-300)
        };
        let mut t = Table::new("predictions");
        for (j, name) in data.names.iter().enumerate() {
            t.push(Column::new(name, "", data.x.iter().map(|r| r[j]).collect()));
        }
        t.push(Column::new("target", "", data.y.clone()));
        t.push(Column::new("predicted", "", preds.clone()));
        let mut out = Dataset::table(t);
        out.scalar("train R²", r2(&train), "");
        if !test.is_empty() {
            out.scalar("test R²", r2(&test), "");
            let rmse = (test.iter().map(|&i| (data.y[i] - preds[i]).powi(2)).sum::<f64>() / test.len() as f64).sqrt();
            out.scalar("test RMSE", rmse, "");
        }
        out
    };
    out.tables.push(imp);
    out.scalar("leaves", count.0 as f64, "").scalar("depth", count.1 as f64, "");
    out.text = rules.join("\n");
    Ok(out)
}
