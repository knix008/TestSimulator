//! Batch mode: `MySimulator --batch <pipeline.mysim>… [--out <dir>] [--set node.param=value]…`
//!
//! Runs every pipeline without a window (the same engine and the same Python / tool
//! integration as the app) and writes, next to the pipeline or into `--out`:
//!   <name>.summary.json             every node: ok/error, warnings, result values, tables
//!   <name>.<node>.<table>.csv       every table of every node
//!   <name>.<node>.<grid>.png        every grid (spectrogram, map) as a colour picture
//! Exit code 0 when every node succeeded, 2 when one failed, 1 for bad arguments.
//! This is the automation interface: a script or a CI job runs the pipeline end to
//! end ("data in → preprocessing → simulation → report") with changed parameters.
use crate::host::DesktopHost;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const HELP: &str = "MySimulator batch mode

Usage:
  MySimulator --batch <pipeline.mysim> [more pipelines…] [options]

Options:
  --out <dir>                 write the outputs into this folder (default: next to each pipeline)
  --set <node>.<param>=<v>    change a node parameter before the run (node id or name; repeatable)
  --only <node>[,<node>…]     write the outputs of these nodes only
  --quiet                     print only errors
";

struct Options {
    out: Option<PathBuf>,
    sets: Vec<(String, String, String)>,
    only: Vec<String>,
    quiet: bool,
}

pub fn main(args: Vec<String>) -> i32 {
    attach_console();
    if args.first().is_some_and(|arg| arg == "--help" || arg == "-h") {
        print(HELP);
        return 0;
    }
    let mut models = Vec::new();
    let mut opt = Options { out: None, sets: Vec::new(), only: Vec::new(), quiet: false };
    let mut iter = args.into_iter().skip(1);
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--out" => opt.out = iter.next().map(PathBuf::from),
            "--set" => {
                let Some(spec) = iter.next() else {
                    print("--set needs node.param=value");
                    return 1;
                };
                match parse_set(&spec) {
                    Some(set) => opt.sets.push(set),
                    None => {
                        print(&format!("--set {spec}: write node.param=value"));
                        return 1;
                    }
                }
            }
            "--only" => opt.only = iter.next().unwrap_or_default().split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
            "--quiet" => opt.quiet = true,
            other if other.starts_with("--") => {
                print(&format!("unknown option {other}\n\n{HELP}"));
                return 1;
            }
            _ => models.push(PathBuf::from(arg)),
        }
    }
    if models.is_empty() {
        print(HELP);
        return 1;
    }
    let mut failed = false;
    for model in &models {
        match run_one(model, &opt) {
            Ok(all_ok) => failed |= !all_ok,
            Err(error) => {
                print(&format!("{}: {error}", model.display()));
                failed = true;
            }
        }
    }
    if failed { 2 } else { 0 }
}

fn parse_set(spec: &str) -> Option<(String, String, String)> {
    let (target, value) = spec.split_once('=')?;
    let (node, param) = target.rsplit_once('.')?;
    Some((node.trim().to_string(), param.trim().to_string(), value.trim().to_string()))
}

/// Applies --set: numbers stay numbers, true/false booleans, anything else text.
pub fn apply_sets(model: &mut Value, sets: &[(String, String, String)]) -> Result<(), String> {
    for (node, param, value) in sets {
        let nodes = model["nodes"].as_array_mut().ok_or("the pipeline has no nodes")?;
        let target = nodes
            .iter_mut()
            .find(|n| n["id"].as_str() == Some(node.as_str()) || n["name"].as_str() == Some(node.as_str()))
            .ok_or_else(|| format!("--set: no node \"{node}\""))?;
        let v = if let Ok(n) = value.parse::<f64>() {
            json!(n)
        } else if value == "true" || value == "false" {
            json!(value == "true")
        } else {
            json!(value)
        };
        if !target["params"].is_object() {
            target["params"] = json!({});
        }
        target["params"][param.as_str()] = v;
    }
    Ok(())
}

fn safe(name: &str) -> String {
    let s: String = name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    let s = s.trim_matches('_').to_string();
    if s.is_empty() { "data".into() } else { s }
}

fn run_one(model: &Path, opt: &Options) -> Result<bool, String> {
    let text = std::fs::read_to_string(model).map_err(|error| format!("cannot read: {error}"))?;
    let text = text.trim_start_matches('\u{feff}');
    let mut value: Value = serde_json::from_str(text).map_err(|e| format!("not a pipeline: {e}"))?;
    apply_sets(&mut value, &opt.sets)?;
    let stem = model.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "pipeline".into());
    let dir = opt.out.clone().unwrap_or_else(|| model.parent().map(Path::to_path_buf).unwrap_or_default());
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    if !opt.quiet {
        print(&format!("{}: running…", model.display()));
    }
    let mut last = String::new();
    let quiet = opt.quiet;
    let mut progress = |p: &sim_core::Progress| {
        if !quiet && p.phase == "node" && p.message != last && !p.message.contains(" · ") {
            last = p.message.clone();
            print(&format!("  {:>3.0}% {}", p.fraction * 100.0, p.message));
        }
    };
    let host = DesktopHost { base: model.parent().map(Path::to_path_buf) };
    let result = sim_core::run_model(&value.to_string(), &mut progress, &|| false, &host);
    if let Some(error) = &result.error {
        return Err(error.clone());
    }
    let names: std::collections::HashMap<String, String> = value["nodes"]
        .as_array()
        .map(|nodes| nodes.iter().map(|n| (n["id"].as_str().unwrap_or("").to_string(), n["name"].as_str().unwrap_or("").to_string())).collect())
        .unwrap_or_default();
    let wanted = |id: &str| opt.only.is_empty() || opt.only.iter().any(|o| o == id || names.get(id).is_some_and(|n| n == o));
    let mut summary = Vec::new();
    let mut all_ok = true;
    let mut files = 0;
    for n in &result.nodes {
        all_ok &= n.ok;
        let mut entry = json!({ "id": n.id, "name": names.get(&n.id), "ok": n.ok, "error": n.error, "warnings": n.warnings, "elapsedMs": n.elapsed_ms });
        if let Some(d) = &n.data {
            entry["results"] = Value::Object(d.scalars.iter().map(|s| (s.name.clone(), if s.value.is_finite() { json!(s.value) } else { Value::Null })).collect());
            entry["tables"] = Value::Array(d.tables.iter().map(|t| json!({ "name": t.name, "rows": t.rows(), "columns": t.columns.iter().map(|c| c.name.clone()).collect::<Vec<_>>() })).collect());
            if !d.text.is_empty() {
                entry["text"] = json!(d.text);
            }
            if wanted(&n.id) {
                for t in &d.tables {
                    std::fs::write(dir.join(format!("{stem}.{}.{}.csv", safe(&n.id), safe(&t.name))), sim_core::data::table_csv(t)).map_err(|e| e.to_string())?;
                    files += 1;
                }
                for g in &d.grids {
                    let (nx, ny) = (g.x.len(), g.y.len());
                    let png = heat_map_png(nx, ny, &|i, j| g.z.get(j * nx + i).map(|v| *v as f32).filter(|v| v.is_finite()));
                    std::fs::write(dir.join(format!("{stem}.{}.{}.png", safe(&n.id), safe(&g.name))), png).map_err(|e| e.to_string())?;
                    files += 1;
                }
            }
        }
        let label = names.get(&n.id).filter(|s| !s.is_empty()).cloned().unwrap_or_else(|| n.id.clone());
        match &n.error {
            None => {
                if !opt.quiet {
                    let shown: Vec<String> = n.data.as_ref().map(|d| d.scalars.iter().take(3).map(|s| format!("{} = {}", s.name, sim_core::data::g(s.value, 6))).collect()).unwrap_or_default();
                    print(&format!("  ✓ {label}{}", if shown.is_empty() { String::new() } else { format!(": {}", shown.join(", ")) }));
                }
            }
            Some(e) => print(&format!("  ✗ {label}: {e}")),
        }
        summary.push(entry);
    }
    let doc = json!({ "pipeline": result.name, "ok": all_ok, "elapsedMs": result.elapsed_ms, "nodes": summary });
    std::fs::write(dir.join(format!("{stem}.summary.json")), serde_json::to_string_pretty(&doc).unwrap_or_default()).map_err(|error| error.to_string())?;
    if !opt.quiet {
        print(&format!("  done: {} nodes, {files} files → {}", result.nodes.len(), dir.display()));
    }
    Ok(all_ok)
}

/// The "turbo"-like rainbow the app uses for temperatures (blue → cyan → green → yellow → red).
fn colour(t: f32) -> [u8; 3] {
    const STOPS: [[f32; 3]; 6] = [[48., 18., 59.], [65., 125., 245.], [27., 208., 213.], [122., 254., 72.], [250., 186., 57.], [180., 22., 4.]];
    let x = t.clamp(0.0, 1.0) * (STOPS.len() - 1) as f32;
    let i = (x.floor() as usize).min(STOPS.len() - 2);
    let f = x - i as f32;
    let mix = |c: usize| (STOPS[i][c] + (STOPS[i + 1][c] - STOPS[i][c]) * f).round() as u8;
    [mix(0), mix(1), mix(2)]
}

/// A PNG of the field, at least 400 px on the long side, top row = largest y, void cells grey.
fn heat_map_png(nx: usize, ny: usize, value: &dyn Fn(usize, usize) -> Option<f32>) -> Vec<u8> {
    let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
    for j in 0..ny {
        for i in 0..nx {
            if let Some(v) = value(i, j) {
                lo = lo.min(v);
                hi = hi.max(v);
            }
        }
    }
    let span = if hi > lo { hi - lo } else { 1.0 };
    let scale = (400 / nx.max(ny).max(1)).max(1);
    let (w, h) = (nx * scale, ny * scale);
    let mut raw = Vec::with_capacity((w * 3 + 1) * h);
    for row in 0..h {
        raw.push(0); // filter: none
        let j = ny - 1 - row / scale;
        for col in 0..w {
            let rgb = value(col / scale, j).map(|v| colour((v - lo) / span)).unwrap_or([128, 128, 128]);
            raw.extend_from_slice(&rgb);
        }
    }
    encode_png(w as u32, h as u32, &raw)
}

/// A minimal PNG writer: 8-bit RGB, zlib "stored" blocks (no compression library needed).
fn encode_png(width: u32, height: u32, raw: &[u8]) -> Vec<u8> {
    fn crc32(data: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for &byte in data {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
            }
        }
        !crc
    }
    fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let mut body = kind.to_vec();
        body.extend_from_slice(data);
        out.extend_from_slice(&body);
        out.extend_from_slice(&crc32(&body).to_be_bytes());
    }
    let mut zlib = vec![0x78, 0x01];
    let blocks: Vec<&[u8]> = raw.chunks(65_535).collect();
    for (index, block) in blocks.iter().enumerate() {
        zlib.push(u8::from(index + 1 == blocks.len()));
        let len = block.len() as u16;
        zlib.extend_from_slice(&len.to_le_bytes());
        zlib.extend_from_slice(&(!len).to_le_bytes());
        zlib.extend_from_slice(block);
    }
    let (mut a, mut b) = (1u32, 0u32);
    for &byte in raw {
        a = (a + u32::from(byte)) % 65_521;
        b = (b + a) % 65_521;
    }
    zlib.extend_from_slice(&((b << 16) | a).to_be_bytes());
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &zlib);
    chunk(&mut out, b"IEND", &[]);
    out
}

/// A release build has no console of its own (windows_subsystem = "windows"): print into the
/// terminal that started it.
fn attach_console() {
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn AttachConsole(process: u32) -> i32;
        }
        unsafe {
            AttachConsole(u32::MAX);
        }
    }
}

fn print(text: &str) {
    use std::io::Write;
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{text}");
    let _ = out.flush();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_has_signature_and_valid_size() {
        let png = heat_map_png(4, 3, &|i, j| if i == 0 && j == 0 { None } else { Some((i + j) as f32) });
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        // 400 / 4 = 100 px per cell
        assert_eq!(u32::from_be_bytes([png[16], png[17], png[18], png[19]]), 400);
        assert_eq!(u32::from_be_bytes([png[20], png[21], png[22], png[23]]), 300);
    }

    #[test]
    fn set_changes_a_parameter() {
        let mut v = json!({ "nodes": [{ "id": "a", "name": "Source", "params": { "frequency": 5 } }] });
        apply_sets(&mut v, &[("Source".into(), "frequency".into(), "12.5".into()), ("a".into(), "waveform".into(), "square".into())]).unwrap();
        assert_eq!(v["nodes"][0]["params"]["frequency"], json!(12.5));
        assert_eq!(v["nodes"][0]["params"]["waveform"], json!("square"));
        assert!(apply_sets(&mut v, &[("nope".into(), "x".into(), "1".into())]).is_err());
        assert_eq!(parse_set("sig.frequency=3"), Some(("sig".into(), "frequency".into(), "3".into())));
    }

    #[test]
    fn colour_ends_are_blue_and_red() {
        assert!(colour(0.0)[2] > colour(0.0)[0]);
        assert!(colour(1.0)[0] > colour(1.0)[2]);
    }
}
