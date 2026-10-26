//! Integration: files on disk, Python scripts and command-line tools. The
//! engine hands the work to the host (the desktop app); the web build's host
//! refuses it with a clear message.

use crate::data::{parse_csv, table_csv, table_csv_with, Column, Dataset, Table};
use crate::{Ctx, ExternalCall};

fn input_csv(ctx: &Ctx) -> Result<String, String> {
    match ctx.input("in") {
        None => Ok(String::new()),
        // Bare column names: a script indexes data['t'], not data['t (s)'].
        Some(d) => Ok(table_csv_with(d.pick_table(&ctx.str("table", ""))?, false)),
    }
}

fn finish(ctx: &mut Ctx, out: crate::ExternalOutput, passthrough: bool) -> Result<Dataset, String> {
    let mut d = if out.csv.trim().is_empty() {
        if passthrough {
            ctx.input("in").cloned().unwrap_or_default()
        } else {
            Dataset::default()
        }
    } else {
        Dataset::table(parse_csv(&out.csv, &ctx.str("tableName", "output"))?)
    };
    // Lines "name = value" printed as "@result name = value" become result values.
    for line in out.stdout.lines() {
        if let Some(rest) = line.trim().strip_prefix("@result") {
            if let Some((name, value)) = rest.split_once('=') {
                if let Ok(v) = value.trim().parse::<f64>() {
                    d.scalar(name.trim(), v, "");
                }
            }
        }
    }
    let shown: Vec<&str> = out.stdout.lines().filter(|l| !l.trim().starts_with("@result")).collect();
    let mut text = shown.join("\n");
    if !out.stderr.trim().is_empty() {
        if !text.is_empty() {
            text.push_str("\n");
        }
        text.push_str(out.stderr.trim());
    }
    if text.len() > 20_000 {
        text.truncate(20_000);
        text.push_str("\n…");
    }
    d.text = text;
    Ok(d)
}

/// Runs Python code: `data` holds the input columns (dict of lists), the code fills `out`.
pub fn python(ctx: &mut Ctx) -> Result<Dataset, String> {
    let code = ctx.str("code", "");
    if code.trim().is_empty() {
        return Err("write the Python code".into());
    }
    let call = ExternalCall {
        kind: "python".into(),
        program: ctx.str("interpreter", ""),
        args: Vec::new(),
        code,
        input_csv: input_csv(ctx)?,
        timeout_s: ctx.positive("timeout", 60.0)?,
    };
    let out = ctx.host.external(&call, ctx.cancel)?;
    finish(ctx, out, false)
}

/// Runs a program: {in} and {out} in the arguments become the data file paths.
pub fn command(ctx: &mut Ctx) -> Result<Dataset, String> {
    let program = ctx.str("program", "");
    if program.trim().is_empty() {
        return Err("give the program to run".into());
    }
    let args = split_args(&ctx.str("arguments", ""));
    let call = ExternalCall { kind: "command".into(), program, args, code: String::new(), input_csv: input_csv(ctx)?, timeout_s: ctx.positive("timeout", 60.0)? };
    let out = ctx.host.external(&call, ctx.cancel)?;
    finish(ctx, out, ctx.flag("passThrough", false))
}

/// Shell-like splitting: spaces separate, "double quotes" group.
pub fn split_args(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    let mut any = false;
    for ch in text.chars() {
        match ch {
            '"' => {
                quoted = !quoted;
                any = true;
            }
            c if c.is_whitespace() && !quoted => {
                if any || !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                    any = false;
                }
            }
            c => cur.push(c),
        }
    }
    if any || !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// A MyHeatManager study (.myheat) solved by MyHeatManager's own engine (heat-core, built in):
/// the field as a table and a heat map, the summary (statistics, probes, energy balance, bodies,
/// boundaries) as values and tables. The model is kept in the node, or read from a path (desktop).
pub fn myheat(ctx: &mut Ctx) -> Result<Dataset, String> {
    let content = ctx.str("content", "");
    let text = if !content.trim().is_empty() {
        String::from_utf8(crate::formats::base64_decode(&content)?).map_err(|_| "the model is not text (a .myheat file is JSON)".to_string())?
    } else {
        let path = ctx.str("model", "");
        if path.trim().is_empty() {
            return Err("choose a MyHeatManager model (.myheat)".into());
        }
        String::from_utf8_lossy(&ctx.host.read_bytes(path.trim())?).to_string()
    };
    let field = ctx.str("field", "T");
    let field = field.trim();
    let bytes = {
        let cancel = ctx.cancel;
        let progress = &mut *ctx.progress;
        heat_core::run(text.trim_start_matches('\u{feff}'), &mut |p: &heat_core::Progress| progress(p.fraction, &format!("{} {}", p.phase, p.message)), cancel)
    };
    // Result bytes: magic, header length, header JSON, f32 data.
    if bytes.len() < 8 || u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) != 0x5448_4D48 {
        return Err("the heat engine returned no result".into());
    }
    let len = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    let header = std::str::from_utf8(bytes.get(8..8 + len).ok_or("the heat result is cut short")?).map_err(|e| e.to_string())?.to_string();
    let h: serde_json::Value = serde_json::from_str(&header).map_err(|e| e.to_string())?;
    if h["ok"].as_bool() != Some(true) {
        return Err(format!("MyHeatManager: {}", h["error"].as_str().unwrap_or("the study failed")));
    }
    let info = &h["fields"][field];
    if info.is_null() {
        let have: Vec<String> = h["fields"].as_object().map(|o| o.keys().filter(|k| *k != "mat").cloned().collect()).unwrap_or_default();
        return Err(format!("the result has no field {field} (fields: {})", have.join(", ")));
    }
    let frames = info["frames"].as_u64().unwrap_or(1).max(1) as usize;
    let frame = ctx.str("frame", "");
    let chosen = if frame.trim().is_empty() { frames - 1 } else { frame.trim().parse::<usize>().map_err(|_| "frame: a number".to_string())?.min(frames - 1) };
    let csv = heat_core::field_csv(&bytes, field, chosen);
    let mut d = myheat_result(ctx, &header, &csv, field)?;
    d.scalar("frame", chosen as f64, "");
    Ok(d)
}

/// The dataset of a MyHeatManager summary JSON and field CSV.
pub fn myheat_result(ctx: &mut Ctx, summary: &str, csv: &str, field: &str) -> Result<Dataset, String> {
    let s: serde_json::Value = serde_json::from_str(summary).map_err(|e| format!("MyHeatManager wrote no readable summary: {e}"))?;
    if s["ok"].as_bool() != Some(true) {
        return Err(format!("MyHeatManager: {}", s["error"].as_str().unwrap_or("the study failed")));
    }
    let mut d = Dataset::default();
    for w in s["warnings"].as_array().into_iter().flatten() {
        if let Some(w) = w.as_str() {
            ctx.warn(format!("MyHeatManager: {w}"));
        }
    }
    let unit = |k: &str| if k.starts_with('T') { "°C" } else if k.starts_with("vonMises") { "Pa" } else if k.starts_with('v') { "m/s" } else { "" };
    if let Some(stats) = s["stats"].as_object() {
        for (k, v) in stats {
            if let Some(v) = v.as_f64() {
                d.scalar(k, v, unit(k));
            }
        }
    }
    for p in s["probes"].as_array().into_iter().flatten() {
        if let (Some(id), Some(v)) = (p["id"].as_str(), p["values"].as_array().and_then(|a| a.last()).and_then(|v| v.as_f64())) {
            d.scalar(&format!("probe {id}"), v, "");
        }
    }
    if let Some(b) = s["balance"].as_object() {
        for (k, name) in [("generated", "heat generated"), ("boundaries", "heat through boundaries"), ("stored", "heat stored"), ("error", "balance error")] {
            if let Some(v) = b.get(k).and_then(|v| v.as_f64()) {
                d.scalar(name, v, if k == "error" { "" } else { "W" });
            }
        }
    }
    if let Some(ms) = s["elapsedMs"].as_f64() {
        d.scalar("MyHeatManager time", ms / 1000.0, "s");
    }
    // The field: a table, and a heat map of the plane (2D) or the top layer (3D).
    let mut table = parse_csv(csv, field)?;
    table.name = "field".into();
    let g = &s["grid"];
    let (nx, ny) = (g["nx"].as_u64().unwrap_or(0) as usize, g["ny"].as_u64().unwrap_or(0) as usize);
    let (dx, dy) = (g["dx"].as_f64().unwrap_or(1.0), g["dy"].as_f64().unwrap_or(1.0));
    if nx > 0 && ny > 0 && nx * ny <= 4_000_000 && table.columns.len() >= 4 {
        let (xs, ys, zs, vs) = (&table.columns[0].values, &table.columns[1].values, &table.columns[2].values, &table.columns[3].values);
        let top = zs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let mut z = vec![f64::NAN; nx * ny];
        for k in 0..vs.len() {
            if (zs[k] - top).abs() > 1e-9 {
                continue;
            }
            let i = (xs[k] / dx - 0.5).round();
            let j = (ys[k] / dy - 0.5).round();
            if i >= 0.0 && j >= 0.0 && (i as usize) < nx && (j as usize) < ny {
                z[j as usize * nx + i as usize] = vs[k];
            }
        }
        d.grids.push(crate::data::Grid {
            name: field.to_string(),
            x: (0..nx).map(|i| (i as f64 + 0.5) * dx).collect(),
            y: (0..ny).map(|j| (j as f64 + 0.5) * dy).collect(),
            z,
            x_label: "x (mm)".into(),
            y_label: "y (mm)".into(),
            z_label: format!("{field} ({})", unit(field)),
            x_names: None,
            y_names: None,
        });
    }
    d.tables.push(table);
    // Bodies and boundaries as tables of their numbers.
    for (key, name) in [("bodies", "bodies"), ("boundaries", "boundaries")] {
        let Some(list) = s[key].as_array() else { continue };
        if list.is_empty() {
            continue;
        }
        let mut t = Table::new(name);
        t.push(Column::text("id", list.iter().map(|o| o["id"].as_str().unwrap_or("").to_string()).collect()));
        let mut keys: Vec<String> = Vec::new();
        for o in list {
            for (k, v) in o.as_object().into_iter().flatten() {
                if v.is_f64() || v.is_i64() || v.is_u64() {
                    if !keys.contains(k) {
                        keys.push(k.clone());
                    }
                }
            }
        }
        for k in keys {
            t.push(Column::new(&k, "", list.iter().map(|o| o[&k].as_f64().unwrap_or(f64::NAN)).collect()));
        }
        d.tables.push(t);
    }
    Ok(d)
}

pub fn read_file(ctx: &mut Ctx) -> Result<Dataset, String> {
    let path = ctx.str("path", "");
    if path.trim().is_empty() {
        return Err("choose the file to read".into());
    }
    let bytes = ctx.host.read_bytes(path.trim())?;
    let mut d = crate::formats::decode(path.trim(), &bytes, &ctx.str("sheet", ""))?;
    super::source::set_x(&mut d, &ctx.str("x", ""))?;
    Ok(d)
}

/// A JSON file: an object of arrays ({"t": [...], "y": [...]}) or an array of row objects.
pub fn json_table(text: &str, name: &str) -> Result<Dataset, String> {
    let v: serde_json::Value = serde_json::from_str(text).map_err(|e| format!("the JSON is not valid: {e}"))?;
    let mut table = crate::data::Table::new(name);
    let num = |v: &serde_json::Value| v.as_f64().unwrap_or(f64::NAN);
    match &v {
        serde_json::Value::Object(map) => {
            for (k, arr) in map {
                if let Some(a) = arr.as_array() {
                    if a.iter().all(|x| x.is_string()) {
                        table.push(crate::data::Column::text(k, a.iter().map(|x| x.as_str().unwrap_or("").to_string()).collect()));
                    } else {
                        table.push(crate::data::Column::new(k, "", a.iter().map(num).collect()));
                    }
                }
            }
        }
        serde_json::Value::Array(rows) => {
            let mut keys: Vec<String> = Vec::new();
            for r in rows {
                if let Some(o) = r.as_object() {
                    for k in o.keys() {
                        if !keys.contains(k) {
                            keys.push(k.clone());
                        }
                    }
                }
            }
            for k in &keys {
                table.push(crate::data::Column::new(k, "", rows.iter().map(|r| r.get(k).map(num).unwrap_or(f64::NAN)).collect()));
            }
        }
        _ => return Err("the JSON must be an object of arrays or an array of objects".into()),
    }
    if table.columns.is_empty() {
        return Err("no columns found in the JSON".into());
    }
    Ok(Dataset::table(table))
}

pub fn write_file(ctx: &mut Ctx) -> Result<Dataset, String> {
    let data = ctx.need("in")?.clone();
    let path = ctx.str("path", "");
    if path.trim().is_empty() {
        return Err("choose where to write the file".into());
    }
    let table = data.pick_table(&ctx.str("table", ""))?;
    if path.to_ascii_lowercase().ends_with(".mat") {
        // A MAT-file (level 5): each column a variable, the result values as scalars.
        let mut vars = crate::matfile::from_table(table);
        for s in &data.scalars {
            vars.push((crate::expr::sanitize_name(&s.name), crate::matfile::MatValue::scalar(s.value)));
        }
        ctx.host.write_bytes(path.trim(), &crate::matfile::write_v5(&vars))?;
        let mut d = data.clone();
        d.text = format!("{} variables → {}", vars.len(), path.trim());
        return Ok(d);
    }
    let text = if path.to_ascii_lowercase().ends_with(".json") {
        let mut map = serde_json::Map::new();
        for c in &table.columns {
            let v = match &c.labels {
                Some(l) => serde_json::json!(l),
                None => serde_json::Value::Array(c.values.iter().map(|v| serde_json::Number::from_f64(*v).map(serde_json::Value::Number).unwrap_or(serde_json::Value::Null)).collect()),
            };
            map.insert(c.name.clone(), v);
        }
        serde_json::to_string_pretty(&serde_json::Value::Object(map)).unwrap_or_default()
    } else {
        table_csv(table)
    };
    ctx.host.write_file(path.trim(), &text)?;
    let mut d = data.clone();
    d.text = format!("{} rows → {}", table.rows(), path.trim());
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn args() {
        assert_eq!(split_args(r#"run.py {in} "my out.csv" -v"#), vec!["run.py", "{in}", "my out.csv", "-v"]);
        assert_eq!(split_args(r#"a "" b"#), vec!["a", "", "b"]);
    }

    #[test]
    fn json() {
        let d = json_table(r#"{"t":[0,1,2],"y":[1,2,3],"tag":["a","b","c"]}"#, "j").unwrap();
        assert_eq!(d.tables[0].columns.len(), 3);
        let d = json_table(r#"[{"a":1,"b":2},{"a":3}]"#, "j").unwrap();
        assert!(d.tables[0].columns[1].values[1].is_nan());
    }
}
