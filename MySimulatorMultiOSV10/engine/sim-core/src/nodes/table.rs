//! Table operations: computed columns, row filters, column selection and
//! sorting, merging two tables, resampling and calculus.

use super::{column_list, input_table};
use crate::data::{interp, mean, std_dev, Column, Dataset, Table};
use crate::expr::{constants, sanitize_name, statements, valid_name, Expr};
use crate::Ctx;

/// Expression variables of a table: every column (sanitised name), i, n,
/// <col>_mean, _std, _min, _max, and the constants.
struct RowVars {
    names: Vec<String>,
    base: Vec<f64>,
    cols: Vec<usize>,
}

fn row_vars(table: &Table, consts: &[(String, f64)]) -> RowVars {
    let mut names = vec!["i".to_string(), "n".to_string()];
    let mut base = vec![0.0, table.rows() as f64];
    let mut cols = Vec::new();
    for (k, c) in table.columns.iter().enumerate() {
        if c.is_text() {
            continue;
        }
        let name = sanitize_name(&c.name);
        names.push(name.clone());
        base.push(0.0);
        cols.push(k);
        let finite: Vec<f64> = c.values.iter().copied().filter(|v| v.is_finite()).collect();
        for (suffix, v) in [
            ("mean", mean(&finite)),
            ("std", std_dev(&finite)),
            ("min", finite.iter().cloned().fold(f64::INFINITY, f64::min)),
            ("max", finite.iter().cloned().fold(f64::NEG_INFINITY, f64::max)),
        ] {
            names.push(format!("{name}_{suffix}"));
            base.push(v);
        }
    }
    for (n, v) in consts {
        names.push(n.clone());
        base.push(*v);
    }
    RowVars { names, base, cols }
}

impl RowVars {
    /// Fills the per-row slots of `vals` for row r.
    fn fill(&self, table: &Table, r: usize, vals: &mut [f64]) {
        vals[0] = r as f64;
        let mut slot = 2;
        for &k in &self.cols {
            vals[slot] = table.columns[k].values.get(r).copied().unwrap_or(f64::NAN);
            slot += 5;
        }
    }
}

pub fn expression(ctx: &mut Ctx) -> Result<Dataset, String> {
    let input = input_table(ctx, "in")?;
    let consts = constants(&ctx.str("constants", ""))?;
    let text = ctx.str("expressions", "");
    let mut out = input.clone();
    let mut vars = row_vars(&out, &consts);
    let stmts = statements(&text);
    if stmts.is_empty() {
        return Err("write at least one line: name = expression".into());
    }
    for stmt in stmts {
        let (name, src) = stmt.split_once('=').ok_or_else(|| format!("\"{stmt}\" is not name = expression"))?;
        let name = name.trim();
        if !valid_name(name) {
            return Err(format!("\"{name}\" cannot be a column name"));
        }
        let e = Expr::with_names(src, &vars.names)?;
        let rows = out.rows();
        let mut vals = vars.base.clone();
        let mut stack = e.stack();
        let mut values = Vec::with_capacity(rows);
        for r in 0..rows {
            vars.fill(&out, r, &mut vals);
            values.push(e.eval(&vals, &mut stack));
        }
        match out.find(name) {
            Some(k) => {
                out.columns[k].values = values;
                out.columns[k].labels = None;
            }
            None => {
                out.push(Column::new(name, "", values));
            }
        }
        // Later lines see the new column (and its statistics).
        vars = row_vars(&out, &consts);
    }
    Ok(Dataset::table(out))
}

pub fn filter_rows(ctx: &mut Ctx) -> Result<Dataset, String> {
    let input = input_table(ctx, "in")?;
    let consts = constants(&ctx.str("constants", ""))?;
    let cond = ctx.str("condition", "");
    if cond.trim().is_empty() {
        return Err("write a condition, e.g. y > 0 && t < 5".into());
    }
    let vars = row_vars(input, &consts);
    let e = Expr::with_names(&cond, &vars.names)?;
    let mut keep = Vec::new();
    let mut vals = vars.base.clone();
    let mut stack = e.stack();
    for r in 0..input.rows() {
        vars.fill(input, r, &mut vals);
        let v = e.eval(&vals, &mut stack);
        if v != 0.0 && !v.is_nan() {
            keep.push(r);
        }
    }
    let out = take_rows(input, &keep);
    let mut d = Dataset::table(out);
    d.scalar("rows kept", keep.len() as f64, "").scalar("rows removed", (input.rows() - keep.len()) as f64, "");
    Ok(d)
}

pub fn take_rows(table: &Table, rows: &[usize]) -> Table {
    let mut out = Table { name: table.name.clone(), columns: Vec::new(), x: table.x };
    for c in &table.columns {
        let values = rows.iter().map(|&r| c.values.get(r).copied().unwrap_or(f64::NAN)).collect();
        let labels = c.labels.as_ref().map(|l| rows.iter().map(|&r| l.get(r).cloned().unwrap_or_default()).collect());
        out.columns.push(Column { name: c.name.clone(), unit: c.unit.clone(), values, labels });
    }
    out
}

pub fn select(ctx: &mut Ctx) -> Result<Dataset, String> {
    let input = input_table(ctx, "in")?;
    let list = ctx.str("columns", "");
    let mut table = if list.trim().is_empty() {
        input.clone()
    } else {
        let idx = column_list(input, &list)?;
        let x_name = input.x_column().map(|c| c.name.clone());
        let mut t = Table::new(&input.name);
        for &k in &idx {
            t.columns.push(input.columns[k].clone());
        }
        t.x = x_name.and_then(|n| t.find(&n));
        t
    };
    let sort = ctx.str("sortBy", "");
    if !sort.trim().is_empty() {
        let key = table.column(&sort)?.values.clone();
        let mut order: Vec<usize> = (0..table.rows()).collect();
        let desc = ctx.flag("descending", false);
        order.sort_by(|&a, &b| {
            let (p, q) = (key[a], key[b]);
            let o = p.partial_cmp(&q).unwrap_or_else(|| p.is_nan().cmp(&q.is_nan()));
            if desc {
                o.reverse()
            } else {
                o
            }
        });
        table = take_rows(&table, &order);
        // A sorted table's first column is no longer a monotonic axis unless it is the key.
        if table.x.is_some_and(|x| table.columns[x].name != table.column(&sort).map(|c| c.name.clone()).unwrap_or_default()) {
            table.x = None;
        }
    }
    let skip = ctx.count("skip", 0, 0, i64::MAX)?;
    let limit = ctx.int("limit", 0)?;
    if skip > 0 || limit > 0 {
        let end = if limit > 0 { (skip + limit as usize).min(table.rows()) } else { table.rows() };
        let rows: Vec<usize> = (skip.min(end)..end).collect();
        table = take_rows(&table, &rows);
    }
    let x = ctx.str("x", "");
    if !x.trim().is_empty() {
        table.x = Some(table.find(&x).ok_or_else(|| format!("no column \"{x}\" for the x axis"))?);
    }
    Ok(Dataset::table(table))
}

/// a and b side by side (columns) or one after the other (rows; columns matched by name).
pub fn merge(ctx: &mut Ctx) -> Result<Dataset, String> {
    let a = ctx.need("a")?.pick_table("")?.clone();
    let b = ctx.need("b")?.pick_table("")?.clone();
    let mode = ctx.str("mode", "columns");
    let out = match mode.as_str() {
        "rows" => {
            let mut t = a.clone();
            let n_a = a.rows();
            let n_b = b.rows();
            for c in &mut t.columns {
                match b.find(&c.name) {
                    Some(k) => {
                        let src = &b.columns[k];
                        c.values.extend(src.values.iter().copied());
                        if let Some(l) = &mut c.labels {
                            l.extend(src.labels.clone().unwrap_or_else(|| src.values.iter().map(|v| crate::data::format_number(*v)).collect()));
                        }
                    }
                    None => {
                        c.values.extend(std::iter::repeat(f64::NAN).take(n_b));
                        if let Some(l) = &mut c.labels {
                            l.extend(std::iter::repeat(String::new()).take(n_b));
                        }
                    }
                }
            }
            for c in &b.columns {
                if t.find(&c.name).is_none() {
                    let mut values = vec![f64::NAN; n_a];
                    values.extend(c.values.iter().copied());
                    t.columns.push(Column { name: c.name.clone(), unit: c.unit.clone(), values, labels: None });
                }
            }
            t
        }
        "interpolate" => {
            // b's columns interpolated onto a's x axis.
            let ax = a.x_column().ok_or("the table a has no x axis to interpolate onto")?.values.clone();
            let bx = b.x_column().ok_or("the table b has no x axis")?.values.clone();
            let mut t = a.clone();
            for k in b.value_columns() {
                let c = &b.columns[k];
                let mut name = c.name.clone();
                if t.find(&name).is_some() {
                    name = format!("{name}_b");
                }
                t.columns.push(Column::new(&name, &c.unit, ax.iter().map(|&x| interp(&bx, &c.values, x)).collect()));
            }
            t
        }
        _ => {
            let mut t = a.clone();
            for c in &b.columns {
                if Some(c.name.as_str()) == b.x_column().map(|x| x.name.as_str()) && t.find(&c.name).is_some() {
                    continue;
                }
                let mut c = c.clone();
                if t.find(&c.name).is_some() {
                    c.name = format!("{}_b", c.name);
                }
                t.columns.push(c);
            }
            if a.rows() != b.rows() {
                ctx.warn(format!("the tables have {} and {} rows; the shorter one is padded with empty cells", a.rows(), b.rows()));
            }
            t
        }
    };
    Ok(Dataset::table(out))
}

/// Linear (or cubic) interpolation onto an even grid of `points` (or a new sample rate).
pub fn resample(ctx: &mut Ctx) -> Result<Dataset, String> {
    let input = input_table(ctx, "in")?;
    let xcol = input.pick_x(&ctx.str("x", ""));
    let xs = &xcol.values;
    if xs.len() < 2 {
        return Err("at least two rows are needed".into());
    }
    if !xs.windows(2).all(|w| w[1] >= w[0]) {
        return Err(format!("the x column \"{}\" must increase", xcol.name));
    }
    let x0 = xs[0];
    let x1 = xs[xs.len() - 1];
    let rate = ctx.num("rate", 0.0)?;
    let n = if rate > 0.0 { ((x1 - x0) * rate).floor() as usize + 1 } else { ctx.count("points", 200, 2, 20_000_000)? };
    if n > 20_000_000 {
        return Err("too many points".into());
    }
    let cubic = ctx.str("method", "linear") == "cubic";
    let step = if rate > 0.0 { 1.0 / rate } else { (x1 - x0) / (n - 1) as f64 };
    let grid: Vec<f64> = (0..n).map(|i| x0 + step * i as f64).collect();
    let mut out = Table::new(&input.name).with_x(Column::new(&xcol.name, &xcol.unit, grid.clone()));
    for k in input.value_columns() {
        let c = &input.columns[k];
        if c.name == xcol.name {
            continue;
        }
        let values = grid.iter().map(|&x| if cubic { cubic_at(xs, &c.values, x) } else { interp(xs, &c.values, x) }).collect();
        out.push(Column::new(&c.name, &c.unit, values));
    }
    Ok(Dataset::table(out))
}

/// Catmull–Rom (cubic Hermite with finite-difference slopes).
fn cubic_at(xs: &[f64], ys: &[f64], x: f64) -> f64 {
    let n = xs.len();
    if x <= xs[0] {
        return ys[0];
    }
    if x >= xs[n - 1] {
        return ys[n - 1];
    }
    let mut i = match xs.binary_search_by(|v| v.partial_cmp(&x).unwrap()) {
        Ok(i) => return ys[i],
        Err(i) => i - 1,
    };
    i = i.min(n - 2);
    let h = xs[i + 1] - xs[i];
    if h <= 0.0 {
        return ys[i];
    }
    let slope = |k: usize| -> f64 {
        if k == 0 {
            (ys[1] - ys[0]) / (xs[1] - xs[0])
        } else if k == n - 1 {
            (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2])
        } else {
            (ys[k + 1] - ys[k - 1]) / (xs[k + 1] - xs[k - 1])
        }
    };
    let t = (x - xs[i]) / h;
    let (t2, t3) = (t * t, t * t * t);
    (2.0 * t3 - 3.0 * t2 + 1.0) * ys[i] + (t3 - 2.0 * t2 + t) * h * slope(i) + (-2.0 * t3 + 3.0 * t2) * ys[i + 1] + (t3 - t2) * h * slope(i + 1)
}

/// Derivative (central differences) or running integral (trapezoid) of columns against x.
pub fn calculus(ctx: &mut Ctx) -> Result<Dataset, String> {
    let input = input_table(ctx, "in")?;
    let xcol = input.pick_x(&ctx.str("x", ""));
    let xs = xcol.values.clone();
    let op = ctx.str("operation", "derivative");
    let cols = column_list(input, &ctx.str("columns", ""))?;
    let mut out = input.clone();
    let mut d = Dataset::default();
    for k in cols {
        let c = &input.columns[k];
        if c.name == xcol.name {
            continue;
        }
        let y = &c.values;
        let n = y.len().min(xs.len());
        let values: Vec<f64> = match op.as_str() {
            "integral" => {
                let mut acc = 0.0;
                let mut v = Vec::with_capacity(n);
                for i in 0..n {
                    if i > 0 {
                        let seg = 0.5 * (y[i] + y[i - 1]) * (xs[i] - xs[i - 1]);
                        if seg.is_finite() {
                            acc += seg;
                        }
                    }
                    v.push(acc);
                }
                d.scalar(&format!("∫{}", c.name), acc, "");
                v
            }
            "derivative" => (0..n)
                .map(|i| {
                    if n < 2 {
                        return f64::NAN;
                    }
                    let (a, b) = if i == 0 { (0, 1) } else if i == n - 1 { (n - 2, n - 1) } else { (i - 1, i + 1) };
                    (y[b] - y[a]) / (xs[b] - xs[a])
                })
                .collect(),
            other => return Err(format!("unknown operation \"{other}\" (derivative, integral)")),
        };
        let name = if op == "integral" { format!("int_{}", c.name) } else { format!("d_{}", c.name) };
        out.push(Column::new(&name, "", values));
    }
    d.tables.push(out);
    Ok(d)
}
