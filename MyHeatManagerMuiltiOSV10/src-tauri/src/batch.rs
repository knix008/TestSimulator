//! Batch mode: `MyHeatManager --batch <model.myheat>… [--out <dir>] [--field T] [--frame last]`
//!
//! Runs every model without a window (the same engine as the app) and writes, next to the
//! model or into `--out`:
//!   <name>.summary.json   the result header (statistics, probes, bodies, boundaries, balance)
//!   <name>.<field>.csv    x, y, z (mm, cell centres) and the field value
//!   <name>.<field>.png    a heat map of the field (2D: the plane; 3D: the top layer)
//! Exit code 0 when every study succeeded, 2 when one failed, 1 for bad arguments.
//! This is the scripting interface (the counterpart of a heat-analysis-manager API): a
//! script or a CI job can run studies and collect the heat maps without the GUI.
use std::path::{Path, PathBuf};

const HELP: &str = "MyHeatManager batch mode

Usage:
  MyHeatManager --batch <model.myheat> [more models…] [options]

Options:
  --out <dir>       write the outputs into this folder (default: next to each model)
  --field <name>    field for the CSV and the heat map (default T; also vonMises, u, v, liquid …)
  --frame <n|last>  stored frame of a transient study (default last)
  --quiet           print only errors
";

pub fn main(args: Vec<String>) -> i32 {
    attach_console();
    if args.first().is_some_and(|arg| arg == "--help" || arg == "-h") {
        print(HELP);
        return 0;
    }
    let mut models = Vec::new();
    let mut out: Option<PathBuf> = None;
    let mut field = "T".to_string();
    let mut frame: Option<usize> = None;
    let mut quiet = false;
    let mut iter = args.into_iter().skip(1);
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--out" => out = iter.next().map(PathBuf::from),
            "--field" => field = iter.next().unwrap_or_else(|| "T".into()),
            "--frame" => frame = iter.next().and_then(|value| value.parse().ok()),
            "--quiet" => quiet = true,
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
        match run_one(model, out.as_deref(), &field, frame, quiet) {
            Ok(()) => {}
            Err(error) => {
                print(&format!("{}: {error}", model.display()));
                failed = true;
            }
        }
    }
    if failed { 2 } else { 0 }
}

fn run_one(model: &Path, out: Option<&Path>, field: &str, frame: Option<usize>, quiet: bool) -> Result<(), String> {
    let text = std::fs::read_to_string(model).map_err(|error| format!("cannot read: {error}"))?;
    let text = text.trim_start_matches('\u{feff}');
    let stem = model.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "model".into());
    let dir = out.map(Path::to_path_buf).unwrap_or_else(|| model.parent().map(Path::to_path_buf).unwrap_or_default());
    std::fs::create_dir_all(&dir).map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    if !quiet {
        print(&format!("{}: running…", model.display()));
    }
    let mut last = -1i32;
    let mut progress = |p: &heat_core::Progress| {
        let percent = (p.fraction * 100.0) as i32;
        if !quiet && percent / 10 != last / 10 {
            last = percent;
            print(&format!("  {:>3}% {} {}", percent, p.phase, p.message));
        }
    };
    let bytes = heat_core::run(text, &mut progress, &|| false);
    let (header, data) = split(&bytes)?;
    std::fs::write(dir.join(format!("{stem}.summary.json")), serde_json::to_string_pretty(&header).unwrap_or_default()).map_err(|error| error.to_string())?;
    if header["ok"].as_bool() != Some(true) {
        return Err(header["error"].as_str().unwrap_or("the study failed").to_string());
    }
    let info = &header["fields"][field];
    if info.is_null() {
        return Err(format!("the result has no field {field}"));
    }
    let frames = info["frames"].as_u64().unwrap_or(1) as usize;
    let chosen = frame.unwrap_or(frames.saturating_sub(1)).min(frames.saturating_sub(1));
    std::fs::write(dir.join(format!("{stem}.{field}.csv")), heat_core::field_csv(&bytes, field, chosen)).map_err(|error| error.to_string())?;
    let grid = &header["grid"];
    let (nx, ny, nz) = (grid["nx"].as_u64().unwrap_or(1) as usize, grid["ny"].as_u64().unwrap_or(1) as usize, grid["nz"].as_u64().unwrap_or(1) as usize);
    let length = info["length"].as_u64().unwrap_or(0) as usize;
    let offset = info["offset"].as_u64().unwrap_or(0) as usize + chosen * length;
    let mat = &header["fields"]["mat"];
    let mat_offset = mat["offset"].as_u64().unwrap_or(0) as usize;
    let layer = if grid["dim"].as_u64() == Some(3) { nz.saturating_sub(1) } else { 0 };
    let value = |i: usize, j: usize| -> Option<f32> {
        let index = i + nx * (j + ny * layer);
        let void = data.get(mat_offset + index).is_none_or(|m| *m >= 255.0);
        if void { None } else { data.get(offset + index).copied().filter(|v| v.is_finite()) }
    };
    let png = heat_map_png(nx, ny, &value);
    std::fs::write(dir.join(format!("{stem}.{field}.png")), png).map_err(|error| error.to_string())?;
    if !quiet {
        let stats = &header["stats"];
        print(&format!(
            "  done: Tmin {:.2} °C, Tmax {:.2} °C → {}",
            stats["Tmin"].as_f64().unwrap_or(f64::NAN),
            stats["Tmax"].as_f64().unwrap_or(f64::NAN),
            dir.display()
        ));
    }
    Ok(())
}

/// The header JSON and the f32 data block of the result bytes.
fn split(bytes: &[u8]) -> Result<(serde_json::Value, Vec<f32>), String> {
    if bytes.len() < 8 || u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) != 0x5448_4D48 {
        return Err("the engine returned no result".into());
    }
    let length = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    let end = 8 + length;
    let header: serde_json::Value = serde_json::from_slice(bytes.get(8..end).ok_or("truncated result")?).map_err(|error| error.to_string())?;
    let data = bytes[end..].chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    Ok((header, data))
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
    fn colour_ends_are_blue_and_red() {
        assert!(colour(0.0)[2] > colour(0.0)[0]);
        assert!(colour(1.0)[0] > colour(1.0)[2]);
    }
}
