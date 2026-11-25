// Super-resolution (AI upscaling) engines: Real-ESRGAN, Real-CUGAN and waifu2x, the
// official portable ncnn-vulkan builds (no Python, no CUDA: Vulkan GPU, or the CPU for
// Real-CUGAN / waifu2x).
//
// Each engine is one release zip from its author's GitHub page, pinned by version and
// SHA-256. A missing engine is downloaded here (progress in 'sr-progress', a Stop button
// cancels), checked, unpacked into userData/superres/<key>/ and only then replaces what
// was there, so a failed reinstall keeps the old copy. The page builds nothing on the
// command line: it sends the algorithm id and its parameters, and every value is checked
// against the lists below before it reaches the engine.

use super::rembg::{download_cancel, run_cmd_cancel};
use super::{data_url_bytes, emit, error, user_data_dir};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

// SwinIR · EDSR · AuraSR · ESPCN: the app's own PyTorch environment (superres_py.rs)
#[path = "superres_py.rs"]
mod py;

const RUN_LIMIT: Duration = Duration::from_secs(30 * 60);

pub(super) static CANCEL: AtomicBool = AtomicBool::new(false);
static BUSY: AtomicBool = AtomicBool::new(false);

struct Asset {
    file: &'static str,
    sha256: &'static str,
    mb: u32,
}

struct Engine {
    key: &'static str,
    label: &'static str,
    version: &'static str,
    exe: &'static str,
    base_url: &'static str,
    windows: Asset,
    macos: Asset,
    linux: Asset,
}

const ENGINES: &[Engine] = &[
    Engine {
        key: "realesrgan",
        label: "Real-ESRGAN",
        version: "20220424",
        exe: "realesrgan-ncnn-vulkan",
        base_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0",
        windows: Asset { file: "realesrgan-ncnn-vulkan-20220424-windows.zip", sha256: "abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d", mb: 44 },
        macos: Asset { file: "realesrgan-ncnn-vulkan-20220424-macos.zip", sha256: "e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a", mb: 50 },
        linux: Asset { file: "realesrgan-ncnn-vulkan-20220424-ubuntu.zip", sha256: "e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96", mb: 45 },
    },
    Engine {
        key: "realcugan",
        label: "Real-CUGAN",
        version: "20220728",
        exe: "realcugan-ncnn-vulkan",
        base_url: "https://github.com/nihui/realcugan-ncnn-vulkan/releases/download/20220728",
        windows: Asset { file: "realcugan-ncnn-vulkan-20220728-windows.zip", sha256: "c6e08d46c11704b1e3a1ada9ddd591cb5005f52f132136c8633ba25def400e01", mb: 44 },
        macos: Asset { file: "realcugan-ncnn-vulkan-20220728-macos.zip", sha256: "0df908cbb98b480f85897221b96d37b0bdb70f82d81b2c7037fe950dd5c0fa33", mb: 50 },
        linux: Asset { file: "realcugan-ncnn-vulkan-20220728-ubuntu.zip", sha256: "d745174bd04c0232c89d935b74799311008fda06bea4195f61be5f0f3cc087cb", mb: 45 },
    },
    Engine {
        key: "waifu2x",
        label: "waifu2x",
        version: "20250915",
        exe: "waifu2x-ncnn-vulkan",
        base_url: "https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20250915",
        windows: Asset { file: "waifu2x-ncnn-vulkan-20250915-windows.zip", sha256: "7425be94b94e4c8f37a1e433ac0e0100c43790e2c37418f4b65d8235adfbdc87", mb: 34 },
        macos: Asset { file: "waifu2x-ncnn-vulkan-20250915-macos.zip", sha256: "a5b58b239eb3aa030db5464f6759637fe412d8c07891a4346ea57f708b514d42", mb: 40 },
        linux: Asset { file: "waifu2x-ncnn-vulkan-20250915-linux.zip", sha256: "848e0fba55657d34da90b775b8139e9806dc754798b029f95e106ba8850a731f", mb: 35 },
    },
];

fn asset(e: &Engine) -> &Asset {
    if cfg!(windows) {
        &e.windows
    } else if cfg!(target_os = "macos") {
        &e.macos
    } else {
        &e.linux
    }
}

fn engine(key: &str) -> Option<&'static Engine> {
    ENGINES.iter().find(|e| e.key == key)
}

/// (MYIMAGEVIEWER_SR_URL_BASE: the tests serve the zips from a local server)
fn asset_url(e: &Engine) -> String {
    let base = std::env::var("MYIMAGEVIEWER_SR_URL_BASE").unwrap_or_else(|_| e.base_url.to_string());
    format!("{}/{}", base.trim_end_matches('/'), asset(e).file)
}

/// (MYIMAGEVIEWER_SR_DIR: the tests install into a scratch folder)
/// Windows: %LOCALAPPDATA%\MyImageViewer\superres. Gigabytes of engines, PyTorch and models do
/// not belong in the roaming profile, and the short path keeps PyTorch's deepest files under
/// the 260-character limit. Elsewhere: beside the settings.
pub(super) fn root() -> PathBuf {
    if let Some(d) = std::env::var_os("MYIMAGEVIEWER_SR_DIR") {
        return PathBuf::from(d);
    }
    match std::env::var_os("LOCALAPPDATA").filter(|_| cfg!(windows)) {
        Some(local) => PathBuf::from(local).join("MyImageViewer").join("superres"),
        None => user_data_dir().join("superres"),
    }
}

fn exe_name(e: &Engine) -> String {
    if cfg!(windows) {
        format!("{}.exe", e.exe)
    } else {
        e.exe.to_string()
    }
}

fn engine_dir(e: &Engine) -> PathBuf {
    root().join(e.key)
}

fn installed_exe(e: &Engine) -> Option<PathBuf> {
    let p = engine_dir(e).join(exe_name(e));
    p.is_file().then_some(p)
}

pub(super) fn dir_size(p: &Path) -> u64 {
    std::fs::read_dir(p)
        .map(|rd| {
            rd.flatten()
                .map(|d| match d.file_type() {
                    Ok(t) if t.is_dir() => dir_size(&d.path()),
                    _ => d.metadata().map(|m| m.len()).unwrap_or(0),
                })
                .sum()
        })
        .unwrap_or(0)
}

fn installed_version(e: &Engine) -> Option<String> {
    let text = std::fs::read_to_string(engine_dir(e).join("installed.json")).ok()?;
    let v: Value = serde_json::from_str(&text).ok()?;
    v.get("version").and_then(Value::as_str).map(str::to_string)
}

fn engine_status(e: &Engine) -> Value {
    let exe = installed_exe(e);
    let dir = engine_dir(e);
    json!({
        "key": e.key,
        "label": e.label,
        "version": e.version,
        "installed": exe.is_some(),
        "installedVersion": installed_version(e),
        "path": dir.to_string_lossy(),
        "downloadMB": asset(e).mb,
        "diskBytes": if exe.is_some() { dir_size(&dir) } else { 0 },
        "url": asset_url(e),
    })
}

/// { engines: [{ key, label, version, installed, path, downloadMB, diskBytes, … }], root }
pub fn status() -> Value {
    let (env, py_rows) = py::status_rows();
    let mut engines: Vec<Value> = ENGINES.iter().map(engine_status).collect();
    engines.extend(py_rows);
    json!({
        "engines": engines,
        "env": env,
        "torchVariant": py::torch_variant(),
        "root": root().to_string_lossy(),
        "busy": BUSY.load(Ordering::SeqCst),
    })
}

pub fn cancel() -> Value {
    CANCEL.store(true, Ordering::SeqCst);
    json!({ "success": true })
}

pub(super) fn emit_progress(percent: f64, message: &str, key: &str) {
    progress(percent, message, key);
}

fn progress(percent: f64, message: &str, key: &str) {
    emit("sr-progress", json!({ "percent": percent.clamp(0.0, 100.0).round() as u32, "message": message, "engine": key }));
}

/// One job at a time (install or run): the flag is cleared when the guard goes.
struct Busy;
impl Busy {
    fn take() -> Option<Busy> {
        BUSY.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).ok().map(|_| {
            CANCEL.store(false, Ordering::SeqCst);
            Busy
        })
    }
}
impl Drop for Busy {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

/// Unpack `zip` into `dest` (made empty first). The releases either hold everything at the
/// top or in one folder: that one folder is dropped, so the program is always dest/<exe>.
fn unzip(zip_path: &Path, dest: &Path, exe: &str, mut on_progress: impl FnMut(f64)) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("damaged archive: {e}"))?;
    let names: Vec<PathBuf> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().and_then(|f| f.enclosed_name()))
        .collect();
    // The common top folder, when every entry sits in the same one
    let first = names.iter().find_map(|n| n.components().next().map(|c| c.as_os_str().to_owned()));
    let strip = match first {
        // ("pkg/" itself is an entry too, so only the first component is compared)
        Some(top)
            if names.iter().all(|n| n.components().next().map(|c| c.as_os_str() == top).unwrap_or(false))
                && names.iter().any(|n| n.components().count() > 1) =>
        {
            Some(PathBuf::from(top))
        }
        _ => None,
    };
    let _ = std::fs::remove_dir_all(dest);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let total = archive.len().max(1);
    for i in 0..archive.len() {
        if CANCEL.load(Ordering::SeqCst) {
            return Err("cancelled".into());
        }
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(name) = entry.enclosed_name() else { continue };
        let rel = match &strip {
            Some(top) => match name.strip_prefix(top) {
                Ok(r) if !r.as_os_str().is_empty() => r.to_path_buf(),
                _ => continue,
            },
            None => name,
        };
        let out = dest.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut w = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut w).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = entry.unix_mode().unwrap_or(0o644) | if rel.file_name().map(|f| f == exe).unwrap_or(false) { 0o755 } else { 0 };
            let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(mode));
        }
        on_progress((i + 1) as f64 / total as f64);
    }
    if !dest.join(exe).is_file() {
        return Err(format!("{exe} is not in the archive"));
    }
    Ok(())
}

/// Download (always, when `force`), check and unpack one engine; 'sr-progress' throughout.
/// { success, status } or { error, code: 'CANCELLED' | 'DOWNLOAD_FAILED' | 'BUSY', retry }.
pub fn install(opts: &Value) -> Value {
    let key = opts.get("engine").and_then(Value::as_str).unwrap_or("");
    let force = opts.get("force").and_then(Value::as_bool).unwrap_or(false);
    if py::is_engine(key) {
        let Some(_busy) = Busy::take() else {
            return json!({ "error": "another super-resolution job is running", "code": "BUSY" });
        };
        return py::install(key, force);
    }
    let Some(e) = engine(key) else {
        return error(format!("unknown engine: {key}"));
    };
    let Some(_busy) = Busy::take() else {
        return json!({ "error": "another super-resolution job is running", "code": "BUSY" });
    };
    install_engine(e, force, 0.0, 100.0)
}

fn install_engine(e: &Engine, force: bool, from: f64, to: f64) -> Value {
    if !force && installed_exe(e).is_some() {
        progress(to, "installed", e.key);
        return json!({ "success": true, "status": engine_status(e) });
    }
    let a = asset(e);
    let r = root();
    let zip_path = r.join(format!("{}.zip", e.key));
    let span = to - from;
    progress(from, &format!("downloading|0|{}", a.mb), e.key);
    let mut last_mb = u64::MAX;
    let dl = download_cancel(&asset_url(e), &zip_path, Some(("sha256", a.sha256)), Some(&CANCEL), |frac, got, total| {
        let mb = got / 1_048_576;
        if mb == last_mb {
            return;
        }
        last_mb = mb;
        let total_mb = if total > 0 { total / 1_048_576 } else { u64::from(a.mb) };
        progress(from + frac * span * 0.85, &format!("downloading|{mb}|{total_mb}"), e.key);
    });
    if let Err(err) = dl {
        let _ = std::fs::remove_file(&zip_path);
        if err == "cancelled" {
            return json!({ "error": "cancelled", "code": "CANCELLED" });
        }
        return json!({
            "error": format!("{} {} download failed ({}, about {} MB) — {err}", e.label, e.version, a.file, a.mb),
            "code": "DOWNLOAD_FAILED",
            "retry": true,
        });
    }
    progress(from + span * 0.86, "extracting", e.key);
    let staging = r.join(format!("{}.new", e.key));
    let unpacked = unzip(&zip_path, &staging, &exe_name(e), |frac| progress(from + span * (0.86 + frac * 0.12), "extracting", e.key));
    let _ = std::fs::remove_file(&zip_path);
    if let Err(err) = unpacked {
        let _ = std::fs::remove_dir_all(&staging);
        if err == "cancelled" {
            return json!({ "error": "cancelled", "code": "CANCELLED" });
        }
        return error(format!("{}: {err}", e.label));
    }
    let _ = std::fs::write(
        staging.join("installed.json"),
        json!({ "engine": e.key, "version": e.version, "file": a.file, "sha256": a.sha256, "installedAt": super::iso_utc(std::time::SystemTime::now()) }).to_string(),
    );
    // Only now does the new copy replace the old one
    let dir = engine_dir(e);
    let _ = std::fs::remove_dir_all(&dir);
    if let Err(err) = std::fs::rename(&staging, &dir) {
        let _ = std::fs::remove_dir_all(&staging);
        return error(format!("{}: {err}", e.label));
    }
    progress(to, "installed", e.key);
    json!({ "success": true, "status": engine_status(e) })
}

pub fn uninstall(opts: &Value) -> Value {
    let key = opts.get("engine").and_then(Value::as_str).unwrap_or("");
    if py::is_engine(key) {
        let Some(_busy) = Busy::take() else {
            return json!({ "error": "another super-resolution job is running", "code": "BUSY" });
        };
        return py::uninstall(key);
    }
    let Some(e) = engine(key) else {
        return error(format!("unknown engine: {key}"));
    };
    let Some(_busy) = Busy::take() else {
        return json!({ "error": "another super-resolution job is running", "code": "BUSY" });
    };
    let dir = engine_dir(e);
    if dir.exists() {
        if let Err(err) = std::fs::remove_dir_all(&dir) {
            return error(err);
        }
    }
    json!({ "success": true, "status": engine_status(e) })
}

// ── algorithms → engine command lines ──

pub(super) fn num(params: &Value, key: &str) -> Option<i64> {
    params.get(key).and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f.round() as i64)).or_else(|| v.as_str().and_then(|s| s.trim().parse().ok())))
}

fn pick(params: &Value, key: &str, allowed: &[i64], default: i64) -> i64 {
    num(params, key).map(|v| nearest(v, allowed)).unwrap_or(default)
}

/// The nearest allowed value (a scale or noise level the model has no file for); a tie
/// goes to the larger one. superRes.js normalize() does the same.
pub(super) fn nearest(v: i64, allowed: &[i64]) -> i64 {
    *allowed.iter().min_by_key(|a| ((**a - v).abs(), -**a)).unwrap_or(&v)
}

pub(crate) struct Plan {
    pub engine: &'static str,
    pub args: Vec<String>,
    /// What the engine itself scales by (the page resizes to the wanted scale after it)
    pub scale: i64,
    /// Engine passes (waifu2x ×4 = two ×2 passes, each reporting 0–100 %)
    pub passes: u32,
}

/// The engine and its arguments (without -i / -o) for `algo` and the page's parameters.
pub(crate) fn plan(algo: &str, params: &Value) -> Result<Plan, String> {
    let tile = num(params, "tile").map(|t| if t <= 0 { 0 } else { t.clamp(32, 4096) }).unwrap_or(0);
    let tta = params.get("tta").and_then(Value::as_bool).unwrap_or(false);
    // "auto" (engine's choice), "cpu" (-1, Real-CUGAN / waifu2x only) or a GPU number
    let gpu = params.get("gpu").map(|g| g.as_str().map(str::to_string).unwrap_or_else(|| g.to_string())).unwrap_or_else(|| "auto".into());
    let mut args: Vec<String> = Vec::new();
    let (engine, scale, passes) = match algo {
        "esrgan-x4plus" | "esrgan-x4plus-anime" | "esrgan-animevideov3" => {
            let (name, scale) = match algo {
                "esrgan-x4plus" => ("realesrgan-x4plus", 4),
                "esrgan-x4plus-anime" => ("realesrgan-x4plus-anime", 4),
                _ => ("realesr-animevideov3", pick(params, "scale", &[2, 3, 4], 4)),
            };
            args.extend(["-n".into(), name.into(), "-s".into(), scale.to_string()]);
            ("realesrgan", scale, 1)
        }
        "cugan-se" | "cugan-pro" => {
            let pro = algo == "cugan-pro";
            let scale = if pro { pick(params, "scale", &[2, 3], 2) } else { pick(params, "scale", &[2, 3, 4], 2) };
            let noises: &[i64] = if !pro && scale == 2 { &[-1, 0, 1, 2, 3] } else { &[-1, 0, 3] };
            let noise = nearest(num(params, "noise").unwrap_or(-1).clamp(-1, 3), noises);
            let sync = pick(params, "syncgap", &[0, 1, 2, 3], 3);
            args.extend([
                "-m".into(), if pro { "models-pro" } else { "models-se" }.into(),
                "-s".into(), scale.to_string(), "-n".into(), noise.to_string(), "-c".into(), sync.to_string(),
            ]);
            ("realcugan", scale, 1)
        }
        "waifu2x-cunet" | "waifu2x-photo" | "waifu2x-anime" => {
            let model = match algo {
                "waifu2x-cunet" => "models-cunet",
                "waifu2x-photo" => "models-upconv_7_photo",
                _ => "models-upconv_7_anime_style_art_rgb",
            };
            let scales: &[i64] = if algo == "waifu2x-cunet" { &[1, 2, 4, 8, 16, 32] } else { &[2, 4, 8, 16, 32] };
            let scale = pick(params, "scale", scales, 2);
            let mut noise = num(params, "noise").unwrap_or(0).clamp(-1, 3);
            if scale == 1 && noise < 0 {
                noise = 0; // ×1 is denoise only
            }
            args.extend(["-m".into(), model.into(), "-s".into(), scale.to_string(), "-n".into(), noise.to_string()]);
            let passes = if scale <= 2 { 1 } else { (scale as f64).log2().round() as u32 };
            ("waifu2x", scale, passes)
        }
        _ => return Err(format!("unknown algorithm: {algo}")),
    };
    args.extend(["-t".into(), tile.to_string()]);
    match gpu.as_str() {
        "auto" | "" => {}
        "cpu" | "-1" if engine != "realesrgan" => args.extend(["-g".into(), "-1".into()]),
        g if g.parse::<u8>().map(|n| n < 8).unwrap_or(false) => args.extend(["-g".into(), g.into()]),
        _ => {}
    }
    if tta {
        args.push("-x".into());
    }
    args.extend(["-f".into(), "png".into()]);
    Ok(Plan { engine, args, scale, passes })
}

/// "12.50%" → 12.5 (the engines print one such line per tile on stderr)
fn percent_of(line: &str) -> Option<f64> {
    line.trim().strip_suffix('%')?.trim().replace(',', ".").parse::<f64>().ok().filter(|v| (0.0..=100.0).contains(v))
}

pub(super) fn tmp_dir() -> PathBuf {
    std::env::temp_dir().join("imageviewer-superres")
}

/// Input { dataUrl, algo, params }. Installs the engine if it is missing (0–30 %), then runs
/// it (30–98 %). Answers { outPath, scale } — the page reads the PNG and discards it — or
/// { error, code? }.
pub fn run(opts: &Value) -> Value {
    let algo = opts.get("algo").and_then(Value::as_str).unwrap_or("");
    let params = opts.get("params").cloned().unwrap_or(Value::Null);
    if py::is_algo(algo) {
        let Some(bytes) = opts.get("dataUrl").and_then(Value::as_str).and_then(data_url_bytes) else {
            return error("Invalid image data");
        };
        let Some(_busy) = Busy::take() else {
            return json!({ "error": "another super-resolution job is running", "code": "BUSY" });
        };
        return py::run(algo, &params, bytes);
    }
    let plan = match plan(algo, &params) {
        Ok(p) => p,
        Err(e) => return error(e),
    };
    let Some(e) = engine(plan.engine) else {
        return error("unknown engine");
    };
    let Some(bytes) = opts.get("dataUrl").and_then(Value::as_str).and_then(data_url_bytes) else {
        return error("Invalid image data");
    };
    let Some(_busy) = Busy::take() else {
        return json!({ "error": "another super-resolution job is running", "code": "BUSY" });
    };
    let mut base = 2.0;
    if installed_exe(e).is_none() {
        let r = install_engine(e, false, 1.0, 30.0);
        if r.get("error").is_some() {
            return r;
        }
        base = 30.0;
    }
    let Some(exe) = installed_exe(e) else {
        return error(format!("{} is not installed", e.label));
    };
    let tmp = tmp_dir();
    // Leftovers of an earlier run the page did not discard
    let _ = std::fs::remove_dir_all(&tmp);
    if let Err(err) = std::fs::create_dir_all(&tmp) {
        return error(err);
    }
    let id = format!("{}-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0), std::process::id());
    let in_path = tmp.join(format!("{id}-in.png"));
    let out_path = tmp.join(format!("{id}-out.png"));
    if let Err(err) = std::fs::write(&in_path, bytes) {
        return error(err);
    }
    progress(base, "running|0", e.key);
    let (in_s, out_s) = (in_path.to_string_lossy().into_owned(), out_path.to_string_lossy().into_owned());
    let mut args: Vec<&str> = vec!["-i", &in_s, "-o", &out_s];
    args.extend(plan.args.iter().map(String::as_str));
    let span = 98.0 - base;
    let passes = f64::from(plan.passes.max(1));
    let (mut pass, mut last, mut shown) = (0.0f64, 0.0f64, base);
    let started = Instant::now();
    let r = run_cmd_cancel(&exe, &args, RUN_LIMIT, &[], Some(&CANCEL), |line, _| {
        let Some(v) = percent_of(line) else { return };
        // A later pass starts again from 0 %
        if v + 20.0 < last && pass + 1.0 < passes {
            pass += 1.0;
        }
        last = v;
        let overall = base + span * ((pass + v / 100.0) / passes).min(1.0);
        if overall >= shown + 0.5 {
            shown = overall;
            progress(overall, &format!("running|{}", ((pass + v / 100.0) / passes * 100.0).round()), e.key);
        }
    });
    let _ = std::fs::remove_file(&in_path);
    if r.cancelled {
        let _ = std::fs::remove_file(&out_path);
        return json!({ "error": "cancelled", "code": "CANCELLED" });
    }
    if r.timed_out {
        let _ = std::fs::remove_file(&out_path);
        return error(format!("{} did not finish within {} minutes and was stopped.", e.label, RUN_LIMIT.as_secs() / 60));
    }
    if r.code == 0 && out_path.is_file() {
        progress(98.0, "reading", e.key);
        return json!({ "outPath": out_s, "scale": plan.scale, "engine": e.key, "seconds": started.elapsed().as_secs_f64() });
    }
    let _ = std::fs::remove_file(&out_path);
    let text = format!("{}\n{}", r.err, r.out);
    let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty() && percent_of(l).is_none()).collect();
    let tail = lines[lines.len().saturating_sub(4)..].join(" ");
    let gpu = text.to_ascii_lowercase();
    let code = if gpu.contains("vkcreateinstance") || gpu.contains("invalid gpu") || gpu.contains("vulkan") { "GPU" } else { "ENGINE_FAILED" };
    json!({
        "error": if tail.is_empty() { format!("{} failed (exit {})", e.label, r.code) } else { tail },
        "code": code,
    })
}

/// Delete a finished run's output once the page has read it (only our temp folder).
pub fn discard(path: &str) -> Value {
    let p = PathBuf::from(path);
    if p.starts_with(tmp_dir()) {
        let _ = std::fs::remove_file(&p);
    }
    json!({ "success": true })
}

/// RGBA picture (a PNG / JPEG / … data URL) → AVIF data URL; WebView2 cannot write AVIF.
pub fn encode_avif(opts: &Value) -> Value {
    let Some(bytes) = opts.get("dataUrl").and_then(Value::as_str).and_then(data_url_bytes) else {
        return error("Invalid image data");
    };
    let quality = opts.get("quality").and_then(Value::as_f64).unwrap_or(80.0).clamp(1.0, 100.0) as f32;
    let speed = opts.get("speed").and_then(Value::as_u64).unwrap_or(6).clamp(1, 10) as u8;
    let img = match image::load_from_memory(&bytes) {
        Ok(i) => i.to_rgba8(),
        Err(e) => return error(e),
    };
    let (w, h) = (img.width() as usize, img.height() as usize);
    let pixels: Vec<ravif::RGBA8> = img.as_raw().chunks_exact(4).map(|p| ravif::RGBA8::new(p[0], p[1], p[2], p[3])).collect();
    match ravif::Encoder::new()
        .with_quality(quality)
        .with_alpha_quality(quality)
        .with_speed(speed)
        .encode_rgba(ravif::Img::new(&pixels[..], w, h))
    {
        Ok(out) => json!({ "dataUrl": format!("data:image/avif;base64,{}", super::b64(&out.avif_file)) }),
        Err(e) => error(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(algo: &str, p: Value) -> Vec<String> {
        plan(algo, &p).unwrap().args
    }

    #[test]
    fn real_esrgan_models() {
        let a = args("esrgan-x4plus", json!({ "scale": 2, "tile": 200, "tta": true }));
        assert_eq!(a, ["-n", "realesrgan-x4plus", "-s", "4", "-t", "200", "-x", "-f", "png"]);
        let a = args("esrgan-animevideov3", json!({ "scale": 3, "gpu": "cpu" }));
        assert_eq!(a, ["-n", "realesr-animevideov3", "-s", "3", "-t", "0", "-f", "png"], "no CPU mode for Real-ESRGAN");
        assert_eq!(plan("esrgan-x4plus-anime", &json!({})).unwrap().scale, 4);
    }

    #[test]
    fn real_cugan_noise_follows_the_models() {
        let a = args("cugan-se", json!({ "scale": 4, "noise": 2, "syncgap": 1, "gpu": "cpu" }));
        assert_eq!(a, ["-m", "models-se", "-s", "4", "-n", "3", "-c", "1", "-t", "0", "-g", "-1", "-f", "png"]);
        let a = args("cugan-se", json!({ "scale": 2, "noise": 2 }));
        assert!(a.windows(2).any(|w| w == ["-n", "2"]));
        let a = args("cugan-pro", json!({ "scale": 4, "noise": 1 }));
        assert!(a.windows(2).any(|w| w == ["-s", "3"]), "pro has ×2 / ×3 only: ×4 → ×3");
        assert!(a.windows(2).any(|w| w == ["-n", "0"]), "1 → nearest (0)");
    }

    #[test]
    fn waifu2x_models_and_passes() {
        let p = plan("waifu2x-cunet", &json!({ "scale": 1, "noise": -1, "gpu": "1" })).unwrap();
        assert_eq!(p.args, ["-m", "models-cunet", "-s", "1", "-n", "0", "-t", "0", "-g", "1", "-f", "png"]);
        let p = plan("waifu2x-photo", &json!({ "scale": 8, "noise": 3, "tile": 10 })).unwrap();
        assert_eq!((p.scale, p.passes), (8, 3));
        assert!(p.args.windows(2).any(|w| w == ["-t", "32"]), "tile floor");
        assert_eq!(plan("waifu2x-anime", &json!({ "scale": 1 })).unwrap().scale, 2, "upconv has no ×1");
    }

    #[test]
    fn untrusted_values_never_reach_the_command_line() {
        let a = args("cugan-se", json!({ "scale": "2 -o C:/x", "gpu": "0; del", "tile": "-5" }));
        assert!(a.iter().all(|s| !s.contains(' ') && !s.contains(';')));
        assert!(plan("rm -rf", &json!({})).is_err());
    }

    #[test]
    fn engine_progress_lines() {
        assert_eq!(percent_of("12.50%"), Some(12.5));
        assert_eq!(percent_of(" 100.00% "), Some(100.0));
        assert_eq!(percent_of("[0 NVIDIA] queueC=2[8]"), None);
    }

    fn make_zip(path: &Path, entries: &[&str]) {
        use std::io::Write;
        let mut w = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for name in entries {
            if name.ends_with('/') {
                w.add_directory(*name, o).unwrap();
            } else {
                w.start_file(*name, o).unwrap();
                w.write_all(name.as_bytes()).unwrap();
            }
        }
        w.finish().unwrap();
    }

    #[test]
    fn unpacking_drops_a_single_top_folder() {
        let dir = std::env::temp_dir().join(format!("sr-unzip-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let (a, b) = (dir.join("a.zip"), dir.join("b.zip"));
        make_zip(&a, &["pkg-1/", "pkg-1/tool.exe", "pkg-1/models-x/", "pkg-1/models-x/m.bin"]);
        make_zip(&b, &["tool.exe", "models/", "models/m.bin", "input.jpg"]);
        unzip(&a, &dir.join("out-a"), "tool.exe", |_| {}).unwrap();
        assert!(dir.join("out-a/tool.exe").is_file() && dir.join("out-a/models-x/m.bin").is_file());
        unzip(&b, &dir.join("out-b"), "tool.exe", |_| {}).unwrap();
        assert!(dir.join("out-b/tool.exe").is_file() && dir.join("out-b/models/m.bin").is_file());
        assert!(unzip(&b, &dir.join("out-c"), "other.exe", |_| {}).is_err(), "the program must be there");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn every_engine_has_a_pinned_download() {
        for e in ENGINES {
            for a in [&e.windows, &e.macos, &e.linux] {
                assert_eq!(a.sha256.len(), 64, "{}", a.file);
                assert!(a.file.contains(e.version) && a.file.ends_with(".zip"));
            }
        }
    }
}
