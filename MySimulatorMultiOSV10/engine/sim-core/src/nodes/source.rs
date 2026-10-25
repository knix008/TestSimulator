//! Sources: generated signals, typed or imported tables, random samples and
//! sampled functions.

use crate::data::{parse_csv, Column, Dataset, Table};
use crate::expr::{constants, Expr};
use crate::rng::Dist;
use crate::Ctx;
use std::f64::consts::PI;

/// A waveform: sine, square, triangle, sawtooth, chirp, pulse, step, impulse, noise, dc;
/// extra sine components ("f:a, f:a"), white noise added on top.
pub fn signal(ctx: &mut Ctx) -> Result<Dataset, String> {
    let kind = ctx.str("waveform", "sine").to_ascii_lowercase();
    let fs = ctx.positive("fs", 1000.0)?;
    let duration = ctx.positive("duration", 1.0)?;
    let f = ctx.num("frequency", 5.0)?;
    let a = ctx.num("amplitude", 1.0)?;
    let offset = ctx.num("offset", 0.0)?;
    let phase = ctx.num("phase", 0.0)?.to_radians();
    let duty = ctx.num("duty", 0.5)?.clamp(0.0, 1.0);
    let f2 = ctx.num("frequency2", 50.0)?;
    let delay = ctx.num("delay", 0.0)?;
    let noise = ctx.num("noise", 0.0)?.abs();
    let n = (duration * fs).round() as usize + 1;
    if n > 20_000_001 {
        return Err(format!("{n} samples are too many (at most 20 million)"));
    }
    if n < 2 {
        return Err("the signal needs at least two samples".into());
    }
    let mut extra = Vec::new();
    for part in ctx.str("components", "").split(|c| c == ',' || c == ';' || c == '\n') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let (fq, amp) = part.split_once(':').ok_or_else(|| format!("components: \"{part}\" is not frequency:amplitude"))?;
        let fq: f64 = fq.trim().parse().map_err(|_| format!("components: bad frequency \"{fq}\""))?;
        let amp: f64 = amp.trim().parse().map_err(|_| format!("components: bad amplitude \"{amp}\""))?;
        extra.push((fq, amp));
    }
    let mut rng = ctx.rng();
    let mut t = Vec::with_capacity(n);
    let mut y = Vec::with_capacity(n);
    for i in 0..n {
        let ti = i as f64 / fs;
        let tt = ti - delay;
        let cycle = |freq: f64| (freq * tt + phase / (2.0 * PI)).rem_euclid(1.0);
        let base = match kind.as_str() {
            "sine" | "sin" => (2.0 * PI * f * tt + phase).sin(),
            "cosine" | "cos" => (2.0 * PI * f * tt + phase).cos(),
            "square" => {
                if cycle(f) < duty {
                    1.0
                } else {
                    -1.0
                }
            }
            "triangle" => {
                let c = cycle(f);
                if c < 0.5 {
                    4.0 * c - 1.0
                } else {
                    3.0 - 4.0 * c
                }
            }
            "sawtooth" | "saw" => 2.0 * cycle(f) - 1.0,
            "chirp" => {
                // Linear sweep from f to f2 over the duration.
                let k = (f2 - f) / duration;
                (2.0 * PI * (f * ti + 0.5 * k * ti * ti) + phase).sin()
            }
            "pulse" => {
                if tt >= 0.0 && cycle(f) < duty {
                    1.0
                } else {
                    0.0
                }
            }
            "step" => {
                if tt >= 0.0 {
                    1.0
                } else {
                    0.0
                }
            }
            "impulse" => {
                if (tt * fs).round() == 0.0 {
                    fs
                } else {
                    0.0
                }
            }
            "noise" => rng.normal(),
            "dc" | "constant" => 1.0,
            other => return Err(format!("unknown waveform \"{other}\"")),
        };
        let mut v = offset + a * base;
        for (fq, amp) in &extra {
            v += amp * (2.0 * PI * fq * tt).sin();
        }
        if noise > 0.0 && kind != "noise" {
            v += noise * rng.normal();
        }
        t.push(ti);
        y.push(v);
    }
    let name = ctx.str("column", "y");
    let unit = ctx.str("unit", "");
    let mut table = Table::new("signal").with_x(Column::new("t", "s", t));
    table.push(Column::new(&name, &unit, y));
    let mut out = Dataset::table(table);
    out.scalar("fs", fs, "Hz").scalar("samples", n as f64, "");
    Ok(out)
}

/// A table typed or pasted as CSV text (param "data").
pub fn table(ctx: &mut Ctx) -> Result<Dataset, String> {
    let text = ctx.str("data", "");
    if text.trim().is_empty() {
        return Err("the table is empty: type, paste or import CSV data".into());
    }
    let name = ctx.str("tableName", "data");
    let mut table = parse_csv(&text, &name)?;
    let x = ctx.str("x", "");
    if !x.trim().is_empty() {
        table.x = Some(table.find(&x).ok_or_else(|| format!("no column \"{x}\" for the x axis"))?);
    }
    let rows = table.rows();
    let mut out = Dataset::table(table);
    out.scalar("rows", rows as f64, "");
    Ok(out)
}

/// A file kept in the pipeline (base64): CSV, JSON, STL, WAV, XLSX, MAT or PNG.
pub fn file(ctx: &mut Ctx) -> Result<Dataset, String> {
    let content = ctx.str("content", "");
    if content.trim().is_empty() {
        return Err("choose a file to import".into());
    }
    let name = ctx.str("fileName", "data.csv");
    let bytes = crate::formats::base64_decode(&content)?;
    let mut d = crate::formats::decode(&name, &bytes, &ctx.str("sheet", ""))?;
    set_x(&mut d, &ctx.str("x", ""))?;
    Ok(d)
}

/// Makes column `x` the x axis of the first table (empty: leave as read).
pub fn set_x(d: &mut Dataset, x: &str) -> Result<(), String> {
    if x.trim().is_empty() {
        return Ok(());
    }
    let t = d.tables.first_mut().ok_or("the file has no table for an x axis")?;
    t.x = Some(t.find(x).ok_or_else(|| format!("no column \"{x}\" for the x axis"))?);
    Ok(())
}

/// Random samples: one or more columns from a distribution.
pub fn random(ctx: &mut Ctx) -> Result<Dataset, String> {
    let n = ctx.count("count", 1000, 1, 10_000_000)?;
    let columns = ctx.count("columns", 1, 1, 64)?;
    let kind = ctx.str("distribution", "normal");
    let p1 = ctx.num("p1", 0.0)?;
    let p2 = ctx.num("p2", 1.0)?;
    let p3 = ctx.num("p3", 1.0)?;
    let args: Vec<f64> = match kind.to_ascii_lowercase().as_str() {
        "exponential" | "exp" | "bernoulli" | "poisson" => vec![p1],
        "triangular" | "tri" => vec![p1, p2, p3],
        _ => vec![p1, p2],
    };
    let dist = Dist::parse(&kind, &args)?;
    let mut rng = ctx.rng();
    let mut table = Table::new("samples").with_x(Column::new("i", "", (0..n).map(|i| i as f64).collect()));
    let prefix = ctx.str("prefix", "x");
    for c in 0..columns {
        let name = if columns == 1 { prefix.clone() } else { format!("{prefix}{}", c + 1) };
        table.push(Column::new(&name, "", (0..n).map(|_| dist.sample(&mut rng)).collect()));
    }
    let mut out = Dataset::table(table);
    out.scalar("mean (theory)", dist.mean(), "");
    Ok(out)
}

/// y = f(x) sampled on [from, to]; several "name = expr" lines give several columns.
pub fn function(ctx: &mut Ctx) -> Result<Dataset, String> {
    let from = ctx.num("from", 0.0)?;
    let to = ctx.num("to", 10.0)?;
    let n = ctx.count("points", 201, 2, 10_000_000)?;
    let var = ctx.str("variable", "x");
    let consts = constants(&ctx.str("constants", ""))?;
    let text = ctx.str("expression", "sin(x)");
    let mut defs: Vec<(String, String)> = Vec::new();
    for stmt in crate::expr::statements(&text) {
        match stmt.split_once('=') {
            Some((l, r)) if !l.contains(['<', '>', '!']) && !r.starts_with('=') => defs.push((l.trim().to_string(), r.trim().to_string())),
            _ => defs.push((format!("y{}", if defs.is_empty() { String::new() } else { (defs.len() + 1).to_string() }), stmt.clone())),
        }
    }
    let mut names: Vec<String> = vec![var.clone()];
    names.extend(consts.iter().map(|(n, _)| n.clone()));
    let mut compiled = Vec::new();
    for (name, src) in &defs {
        compiled.push(Expr::with_names(src, &names)?);
        names.push(name.clone());
    }
    let mut vals: Vec<f64> = vec![0.0; names.len()];
    for (i, (_, v)) in consts.iter().enumerate() {
        vals[1 + i] = *v;
    }
    let base = 1 + consts.len();
    let mut xs = Vec::with_capacity(n);
    let mut cols: Vec<Vec<f64>> = vec![Vec::with_capacity(n); defs.len()];
    let mut stack = Vec::new();
    for i in 0..n {
        let x = from + (to - from) * i as f64 / (n - 1) as f64;
        vals[0] = x;
        for (k, e) in compiled.iter().enumerate() {
            let v = e.eval(&vals, &mut stack);
            vals[base + k] = v;
            cols[k].push(v);
        }
        xs.push(x);
    }
    let mut table = Table::new("function").with_x(Column::new(&var, &ctx.str("xUnit", ""), xs));
    for ((name, _), values) in defs.iter().zip(cols) {
        table.push(Column::new(name, "", values));
    }
    Ok(Dataset::table(table))
}
