// The PyTorch family of super-resolution models: SwinIR, EDSR, AuraSR (PyTorch) and ESPCN
// (OpenCV dnn_superres), run by scripts/sr_worker.py.
//
// Packages: the app makes its OWN virtual environment, userData/superres/pytorch/venv, from
// whatever Python the machine has (rembg::resolve_python; an official one is installed per
// user only when there is none). The system Python is never changed, and "Remove" is one
// folder. The PyTorch build follows the hardware: an NVIDIA driver (nvidia-smi "CUDA
// Version") gets the CUDA build it supports (cu130 / cu128 / cu126), a Mac the standard
// build (Apple GPU through MPS), anything else the CPU build. The worker then uses the GPU
// when PyTorch sees one and the CPU otherwise (device "auto"), or what the page asks for.
// A rebuild goes into venv.new and replaces the working copy only when it is complete.
//
// Models: the authors' release files, pinned by SHA-256, downloaded when first needed (or all
// of an engine from Settings) into userData/superres/pytorch/models/<engine>/.

use super::super::rembg::{download_cancel, resolve_python, run_cmd_cancel, Progress};
use super::{emit_progress, num, nearest, root, tmp_dir, CANCEL};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const RUN_LIMIT: Duration = Duration::from_secs(60 * 60);
const PIP_LIMIT: Duration = Duration::from_secs(60 * 60);

pub(super) struct Model {
    engine: &'static str,
    /// Path under models/<engine>/
    file: &'static str,
    url: &'static str,
    sha256: &'static str,
    mb: u32,
}

const SWINIR: &str = "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0";
const EDSR: &str = "https://cv.snu.ac.kr/research/EDSR/models";
const ESPCN: &str = "https://github.com/fannymonori/TF-ESPCN/raw/master/export";
const AURA: &str = "https://huggingface.co/fal/AuraSR-v2/resolve/main";

macro_rules! m {
    ($e:expr, $f:expr, $base:expr, $sha:expr, $mb:expr) => {
        Model { engine: $e, file: $f, url: concat!($base, "/", $f), sha256: $sha, mb: $mb }
    };
}

pub(super) const MODELS: &[Model] = &[
    m!("swinir", "001_classicalSR_DF2K_s64w8_SwinIR-M_x2.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "2032ebf8f401dd3ce2fae5f3852117cb72101ec6ed8358faa64c2a3fa09ed4ac", 64),
    m!("swinir", "001_classicalSR_DF2K_s64w8_SwinIR-M_x3.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "6eca3aee41f53322cd2f5a13650e212b80be8f3c0439d6fe19aef13ab1f509c7", 65),
    m!("swinir", "001_classicalSR_DF2K_s64w8_SwinIR-M_x4.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "4e78e33f22c1aa8a773db0cf4a7381bae97c2362c717f155439ebc690cbd9215", 65),
    m!("swinir", "001_classicalSR_DF2K_s64w8_SwinIR-M_x8.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "6b522c1ea5c21006ce3398797eb20b131ca0024cc6e7b8f3d5d29fad1310a49c", 65),
    m!("swinir", "002_lightweightSR_DIV2K_s64w8_SwinIR-S_x2.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "193b229909ca89cd8b55de9c9e7fce146ae759d59dfcd78d8feb9dd1d6fa0fd7", 16),
    m!("swinir", "002_lightweightSR_DIV2K_s64w8_SwinIR-S_x3.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "53af0cf0b15876752c1c2646a71444f739523b3d562e126d200521a817ab5d2c", 16),
    m!("swinir", "002_lightweightSR_DIV2K_s64w8_SwinIR-S_x4.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "09fad24e32ae62722e1a055efde9921328f4137981bab0a42a4a3a806306c58e", 16),
    m!("swinir", "003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x2_GAN.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "f397408977a3e07eb06afb7238d453a12ef35ebab7328a54241f307860dbe342", 64),
    m!("swinir", "003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "b9afb61e65e04eb7f8aba5095d070bbe9af28df76acd0c9405aeb33b814bcfc6", 64),
    m!("swinir", "003_realSR_BSRGAN_DFOWMFC_s64w8_SwinIR-L_x4_GAN.pth", "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0", "99adfa91350a84c99e946c1eb3d8fce34bc28f57d807b09dc8fe40a316328c0a", 136),
    m!("edsr", "edsr_x2-0edfb8a3.pt", "https://cv.snu.ac.kr/research/EDSR/models", "0edfb8a3772c94485c939f81a8aeefe02cccdfbf45243c6d22b39c29eb7d46de", 156),
    m!("edsr", "edsr_x3-ea3ef2c6.pt", "https://cv.snu.ac.kr/research/EDSR/models", "ea3ef2c6449845ac3bda7290480af76a53e5006beff60bf89c84ca62f986eeca", 167),
    m!("edsr", "edsr_x4-4f62e9ef.pt", "https://cv.snu.ac.kr/research/EDSR/models", "4f62e9ef1a4ec6a7d3da4ed837116cec641e4e1566f98187151d813e83a0c1c8", 165),
    m!("aurasr", "config.json", "https://huggingface.co/fal/AuraSR-v2/resolve/main", "5009aca786759dc78369abc666878ec7dd99167beaada28bf473fbaf1a68ac9a", 1),
    m!("aurasr", "model.safetensors", "https://huggingface.co/fal/AuraSR-v2/resolve/main", "8a80b4546f3f49b9095733cb9699030409339e2f4eb0ae9c1ada14c7d21d4dde", 2356),
    m!("espcn", "ESPCN_x2.pb", "https://github.com/fannymonori/TF-ESPCN/raw/master/export", "59f77351e1d7c0057bf6fe088b4a8a07e42c468c8c8aebb674a6b4ea1823221d", 1),
    m!("espcn", "ESPCN_x3.pb", "https://github.com/fannymonori/TF-ESPCN/raw/master/export", "0e667db7a431d14c32568ed79bf21701a64df8b1d162e48ca1f8800affe2c2b3", 1),
    m!("espcn", "ESPCN_x4.pb", "https://github.com/fannymonori/TF-ESPCN/raw/master/export", "e403f06309229cf36009cd8fb0da032ba7643fae9f15cf94fe562e8edf8fef47", 1),
];

// (kept for the tests: every URL starts with one of the release locations)
#[allow(dead_code)]
const SOURCES: [&str; 4] = [SWINIR, EDSR, ESPCN, AURA];

pub(super) struct PyEngine {
    pub key: &'static str,
    pub label: &'static str,
    pub version: &'static str,
}

pub(super) const ENGINES: &[PyEngine] = &[
    PyEngine { key: "swinir", label: "SwinIR", version: "v0.0" },
    PyEngine { key: "edsr", label: "EDSR", version: "PyTorch" },
    PyEngine { key: "aurasr", label: "AuraSR", version: "v2" },
    PyEngine { key: "espcn", label: "ESPCN", version: "OpenCV" },
];
pub(super) const ENV_KEY: &str = "pytorch";

pub(super) fn is_engine(key: &str) -> bool {
    key == ENV_KEY || ENGINES.iter().any(|e| e.key == key)
}

pub(super) fn is_algo(algo: &str) -> bool {
    ["swinir-", "edsr", "aurasr", "espcn"].iter().any(|p| algo.starts_with(p))
}

fn base() -> PathBuf {
    root().join(ENV_KEY)
}
fn venv_dir() -> PathBuf {
    base().join("venv")
}
fn venv_python(dir: &Path) -> PathBuf {
    dir.join(if cfg!(windows) { "Scripts/python.exe" } else { "bin/python" })
}
fn marker(dir: &Path) -> PathBuf {
    dir.join("myimageviewer.json")
}
fn model_path(m: &Model) -> PathBuf {
    base().join("models").join(m.engine).join(m.file)
}
fn model_url(m: &Model) -> String {
    // (MYIMAGEVIEWER_SR_URL_BASE: the tests serve the files from a local server)
    match std::env::var("MYIMAGEVIEWER_SR_URL_BASE") {
        Ok(b) => format!("{}/{}", b.trim_end_matches('/'), m.file),
        Err(_) => m.url.to_string(),
    }
}
fn have_model(m: &Model) -> bool {
    std::fs::metadata(model_path(m)).map(|s| s.is_file() && s.len() > 0).unwrap_or(false)
}

fn worker() -> PathBuf {
    super::super::runtime_dir()
        .map(|d| d.join("sr_worker.py"))
        .unwrap_or_else(|| super::super::project_root().join("scripts").join("sr_worker.py"))
}

// ── which PyTorch build ──

/// "cu130" / "cu128" / "cu126" for an NVIDIA driver that supports it, "default" on a Mac,
/// "cpu" otherwise (MYIMAGEVIEWER_TORCH_VARIANT overrides it).
pub(super) fn torch_variant() -> String {
    static V: OnceLock<String> = OnceLock::new();
    V.get_or_init(|| {
        if let Ok(v) = std::env::var("MYIMAGEVIEWER_TORCH_VARIANT") {
            return v;
        }
        if cfg!(target_os = "macos") {
            return "default".into();
        }
        let smi = |args: &[&str]| {
            super::super::hidden_command("nvidia-smi")
                .args(args)
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
                .unwrap_or_default()
        };
        let header = smi(&[]);
        match variant_for(&header) {
            // A driver whose header has no CUDA version: from the driver version itself
            "cpu" if !header.is_empty() => variant_for_driver(&smi(&["--query-gpu=driver_version", "--format=csv,noheader"])),
            v => v,
        }
        .into()
    })
    .clone()
}

/// The CUDA build for the CUDA version in nvidia-smi's header: "CUDA Version: X.Y" (older
/// drivers) or "CUDA UMD Version: X.Y" (newer ones).
pub(super) fn variant_for(nvidia_smi: &str) -> &'static str {
    let Some(rest) = nvidia_smi.lines().find_map(|l| {
        let at = l.find("CUDA")?;
        let tail = &l[at..];
        let v = tail.find("Version:")?;
        Some(tail[v + "Version:".len()..].to_string())
    }) else {
        return "cpu";
    };
    let ver: String = rest.trim_start().chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let mut it = ver.split('.').map(|p| p.parse::<u32>().unwrap_or(0));
    let (major, minor) = (it.next().unwrap_or(0), it.next().unwrap_or(0));
    match (major, minor) {
        (m, _) if m >= 13 => "cu130",
        (12, n) if n >= 8 => "cu128",
        (12, n) if n >= 6 => "cu126",
        _ => "cpu",
    }
}

/// From the driver version (R580+ runs CUDA 13, R570+ CUDA 12.8, R560+ CUDA 12.6).
pub(super) fn variant_for_driver(version: &str) -> &'static str {
    match version.trim().split('.').next().and_then(|m| m.trim().parse::<u32>().ok()) {
        Some(m) if m >= 580 => "cu130",
        Some(m) if m >= 570 => "cu128",
        Some(m) if m >= 560 => "cu126",
        _ => "cpu",
    }
}

/// Roughly what the environment downloads (MB), for the page.
fn env_download_mb(variant: &str) -> u32 {
    match variant {
        v if v.starts_with("cu") => 3300,
        "default" => 450,
        _ => 450,
    }
}

fn env_info() -> Option<Value> {
    let dir = venv_dir();
    if !venv_python(&dir).is_file() {
        return None;
    }
    let text = std::fs::read_to_string(marker(&dir)).ok()?;
    serde_json::from_str(&text).ok()
}

fn models_of(engine: &str) -> impl Iterator<Item = &'static Model> + '_ {
    MODELS.iter().filter(move |m| m.engine == engine)
}

/// The rows of Settings › Super-resolution for this family: the environment, then each engine.
pub(super) fn status_rows() -> (Value, Vec<Value>) {
    let info = env_info();
    let variant = torch_variant();
    let env_ok = info.is_some();
    let env = json!({
        "key": ENV_KEY,
        "label": "PyTorch",
        "installed": env_ok,
        "variant": info.as_ref().and_then(|i| i.get("variant").cloned()).unwrap_or_else(|| json!(variant)),
        "torch": info.as_ref().and_then(|i| i.get("torch").cloned()),
        "device": info.as_ref().and_then(|i| i.get("device").cloned()),
        "deviceName": info.as_ref().and_then(|i| i.get("deviceName").cloned()),
        "path": venv_dir().to_string_lossy(),
        "diskBytes": info.as_ref().and_then(|i| i.get("diskBytes").cloned()).unwrap_or(json!(0)),
        "downloadMB": env_download_mb(&variant),
    });
    let rows = ENGINES
        .iter()
        .map(|e| {
            let all: Vec<&Model> = models_of(e.key).collect();
            let have = all.iter().filter(|m| have_model(m)).count();
            let missing_mb: u32 = all.iter().filter(|m| !have_model(m)).map(|m| m.mb).sum();
            let disk: u64 = all.iter().filter_map(|m| std::fs::metadata(model_path(m)).ok()).map(|s| s.len()).sum();
            json!({
                "key": e.key,
                "label": e.label,
                "version": e.version,
                "kind": "python",
                "installed": env_ok && have == all.len(),
                "envInstalled": env_ok,
                "models": all.len(),
                "modelsInstalled": have,
                "path": base().join("models").join(e.key).to_string_lossy(),
                "diskBytes": disk,
                "downloadMB": missing_mb + if env_ok { 0 } else { env_download_mb(&variant) },
                "modelsMB": all.iter().map(|m| m.mb).sum::<u32>(),
                "device": env.get("device").cloned(),
                "deviceName": env.get("deviceName").cloned(),
            })
        })
        .collect();
    (env, rows)
}

// ── the environment ──

fn probe(py: &Path) -> Result<Value, String> {
    let w = worker();
    let r = run_cmd_cancel(py, &[&w.to_string_lossy(), "--probe"], Duration::from_secs(180), &[], Some(&CANCEL), |_, _| {});
    if r.cancelled {
        return Err("cancelled".into());
    }
    let line = r.out.lines().rev().find(|l| l.trim_start().starts_with('{')).unwrap_or("");
    let v: Value = serde_json::from_str(line).map_err(|_| format!("PyTorch check failed: {}", tail(&r.err, &r.out)))?;
    if v.get("torch").is_none() || v.get("aura_sr") != Some(&json!(true)) || v.get("superres") != Some(&json!(true)) {
        return Err(format!("PyTorch environment incomplete: {v}"));
    }
    Ok(v)
}

/// The lines that say what went wrong: pip's "ERROR:" lines (and what follows them) when there
/// are any, otherwise the last few.
fn tail(err: &str, out: &str) -> String {
    let text = format!("{err}\n{out}");
    let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with("Progress ")).collect();
    if let Some(i) = lines.iter().position(|l| l.starts_with("ERROR") || l.contains("Error:") || l.contains("failed:")) {
        let msg = lines[i..lines.len().min(i + 4)].join(" ");
        if msg.contains("long path") || msg.contains("No such file or directory") {
            return format!("{msg} — Windows path too long: turn on long paths (LongPathsEnabled) or use a shorter user folder.");
        }
        return msg;
    }
    lines[lines.len().saturating_sub(4)..].join(" ")
}

/// pip with "--progress-bar raw": "Progress <got> of <total>" lines for each download.
fn pip(py: &Path, args: &[&str], p: &mut Progress, from: f64, to: f64, label: &str) -> Result<(), String> {
    let mut all: Vec<&str> = vec!["-m", "pip", "install", "--progress-bar", "raw", "--no-warn-script-location", "--disable-pip-version-check", "--timeout", "60"];
    all.extend_from_slice(args);
    let mut biggest = 0u64;
    let r = run_cmd_cancel(py, &all, PIP_LIMIT, &[], Some(&CANCEL), |line, _| {
        let Some(rest) = line.trim().strip_prefix("Progress ") else {
            if line.contains("Installing collected packages") {
                p.emit(to - 2.0, &format!("installing_packages|{label}"));
            }
            return;
        };
        let mut it = rest.split(" of ").map(|s| s.trim().parse::<u64>().unwrap_or(0));
        let (got, total) = (it.next().unwrap_or(0), it.next().unwrap_or(0));
        if total == 0 {
            return;
        }
        // The bar follows the biggest download (PyTorch itself); the small ones only show
        if total >= biggest {
            biggest = total;
            let frac = got as f64 / total as f64;
            p.emit(from + frac * (to - from - 3.0), &format!("downloading_packages|{}|{}|{label}", got / 1_048_576, total / 1_048_576));
        }
    });
    if r.cancelled {
        return Err("cancelled".into());
    }
    if r.timed_out {
        return Err("Installing the packages took longer than an hour and was stopped.".into());
    }
    if r.code != 0 {
        return Err(format!("pip failed (exit {}): {}", r.code, tail(&r.err, &r.out)));
    }
    Ok(())
}

/// Build the environment in venv.new, check it, then put it in place of the old one.
fn install_env(p: &mut Progress, from: f64, to: f64) -> Result<Value, String> {
    let span = to - from;
    let at = |f: f64| from + span * f;
    p.emit(at(0.01), "preparing");
    let py = resolve_python(p)?;
    let staging = base().join("venv.new");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(base()).map_err(|e| e.to_string())?;
    p.emit(at(0.04), "creating_env");
    let r = run_cmd_cancel(&py, &["-m", "venv", &staging.to_string_lossy()], Duration::from_secs(300), &[], Some(&CANCEL), |_, _| {});
    if r.cancelled {
        return Err("cancelled".into());
    }
    let vpy = venv_python(&staging);
    if r.code != 0 || !vpy.is_file() {
        return Err(format!("Could not create the Python environment: {}", tail(&r.err, &r.out)));
    }
    let _ = run_cmd_cancel(&vpy, &["-m", "pip", "install", "--upgrade", "--disable-pip-version-check", "pip"], Duration::from_secs(300), &[], Some(&CANCEL), |_, _| {});
    let variant = torch_variant();
    // 1) PyTorch (+ torchvision) from the PyTorch index of this build only, so a newer
    //    PyPI release can never swap in the CPU build
    let index = format!("https://download.pytorch.org/whl/{variant}");
    let mut torch_args = vec!["torch", "torchvision"];
    if variant != "default" {
        torch_args.extend(["--index-url", index.as_str()]);
    }
    pip(&vpy, &torch_args, p, at(0.08), at(0.75), "PyTorch")?;
    // 2) The rest from PyPI (aura-sr is satisfied by the torch above, nothing is replaced)
    // OpenCV 4.x: from 5.0 its dnn_superres reads ESPCN's TensorFlow .pb files as ONNX and fails
    pip(&vpy, &["numpy", "pillow", "einops", "safetensors", "aura-sr", "opencv-contrib-python-headless<5"], p, at(0.75), at(0.9), "AuraSR · OpenCV")?;
    p.emit(at(0.92), "checking_env");
    let mut info = probe(&vpy)?;
    // Only now does the new environment replace the old one
    let dir = venv_dir();
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::rename(&staging, &dir).map_err(|e| e.to_string())?;
    info["variant"] = json!(variant);
    info["diskBytes"] = json!(super::dir_size(&dir));
    info["installedAt"] = json!(super::super::iso_utc(std::time::SystemTime::now()));
    let _ = std::fs::write(marker(&dir), info.to_string());
    p.emit(to, "installed");
    Ok(info)
}

/// Download `models` (all of them with `force`, else the missing ones), checked by SHA-256.
fn ensure_models(models: &[&Model], force: bool, p: &mut Progress, from: f64, to: f64) -> Result<(), String> {
    let todo: Vec<&&Model> = models.iter().filter(|m| force || !have_model(m)).collect();
    let total: u64 = todo.iter().map(|m| u64::from(m.mb) * 1_048_576).sum::<u64>().max(1);
    let mut done = 0u64;
    for m in todo {
        let dest = model_path(m);
        let label = format!("{} {}", m.engine, m.file);
        let mut last_mb = u64::MAX;
        let before = done;
        let res = download_cancel(&model_url(m), &dest, Some(("sha256", m.sha256)), Some(&CANCEL), |_, got, _| {
            let mb = got / 1_048_576;
            if mb == last_mb {
                return;
            }
            last_mb = mb;
            let all = (before + got) as f64 / total as f64;
            p.emit(from + all.min(1.0) * (to - from), &format!("downloading|{}|{}|{label}", (before + got) / 1_048_576, total / 1_048_576));
        });
        if let Err(e) = res {
            if e == "cancelled" {
                return Err(e);
            }
            return Err(format!("DOWNLOAD|{} download failed ({}, about {} MB) — {e}", m.engine, m.file, m.mb));
        }
        done += u64::from(m.mb) * 1_048_576;
    }
    p.emit(to, "installed");
    Ok(())
}

fn fail(e: String) -> Value {
    if e == "cancelled" {
        return json!({ "error": "cancelled", "code": "CANCELLED" });
    }
    if let Some(msg) = e.strip_prefix("DOWNLOAD|") {
        return json!({ "error": msg, "code": "DOWNLOAD_FAILED", "retry": true });
    }
    json!({ "error": e, "code": "ENV_FAILED", "retry": true })
}

/// Settings: the environment (force = rebuild it) or one engine (environment if missing,
/// then its models; force = download them again).
pub(super) fn install(key: &str, force: bool) -> Value {
    let mut p = Progress { last: 0, channel: "sr-progress" };
    if key == ENV_KEY {
        if !force && env_info().is_some() {
            p.emit(100.0, "installed");
            return json!({ "success": true });
        }
        return match install_env(&mut p, 0.0, 100.0) {
            Ok(_) => json!({ "success": true }),
            Err(e) => fail(e),
        };
    }
    let models: Vec<&Model> = models_of(key).collect();
    let need_env = env_info().is_none();
    let split = if need_env { 75.0 } else { 0.0 };
    if need_env {
        if let Err(e) = install_env(&mut p, 0.0, split) {
            return fail(e);
        }
    }
    match ensure_models(&models, force, &mut p, split, 100.0) {
        Ok(()) => json!({ "success": true }),
        Err(e) => fail(e),
    }
}

pub(super) fn uninstall(key: &str) -> Value {
    let dir = if key == ENV_KEY { base().join("venv") } else { base().join("models").join(key) };
    let _ = std::fs::remove_dir_all(base().join("venv.new"));
    if dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&dir) {
            return super::super::error(e);
        }
    }
    json!({ "success": true })
}

// ── algorithms → worker arguments ──

pub(super) struct PyPlan {
    pub engine: &'static str,
    pub models: Vec<&'static Model>,
    /// The model file the worker loads
    pub main: &'static Model,
    pub args: Vec<String>,
    pub scale: i64,
}

fn model(engine: &str, file_part: &str) -> &'static Model {
    MODELS.iter().find(|m| m.engine == engine && m.file.contains(file_part)).expect("pinned model")
}

pub(super) fn plan(algo: &str, params: &Value) -> Result<PyPlan, String> {
    let device = match params.get("device").and_then(Value::as_str) {
        Some("gpu") => "gpu",
        Some("cpu") => "cpu",
        _ => "auto",
    };
    let tile = num(params, "tile").map(|t| if t <= 0 { 0 } else { t.clamp(64, 1024) / 8 * 8 }).unwrap_or(0);
    let overlap = num(params, "overlap").map(|v| nearest(v, &[8, 16, 32, 48, 64])).unwrap_or(32);
    let precision = if params.get("precision").and_then(Value::as_str) == Some("fp16") { "fp16" } else { "fp32" };
    let batch = num(params, "batch").map(|v| nearest(v, &[0, 1, 2, 4, 8, 16])).unwrap_or(0);
    let seams = if params.get("seams").and_then(Value::as_str) == Some("single") { "single" } else { "overlap" };
    let pick = |allowed: &[i64], def: i64| num(params, "scale").map(|v| nearest(v, allowed)).unwrap_or(def);
    let (engine, family, task, size, scale, main) = match algo {
        "swinir-classical" => {
            let s = pick(&[2, 3, 4, 8], 4);
            ("swinir", "swinir", "classical", "M", s, model("swinir", &format!("classicalSR_DF2K_s64w8_SwinIR-M_x{s}.")))
        }
        "swinir-light" => {
            let s = pick(&[2, 3, 4], 4);
            ("swinir", "swinir", "lightweight", "S", s, model("swinir", &format!("SwinIR-S_x{s}.")))
        }
        "swinir-real" => {
            let s = pick(&[2, 4], 4);
            ("swinir", "swinir", "real", "M", s, model("swinir", &format!("SwinIR-M_x{s}_GAN")))
        }
        "swinir-real-large" => ("swinir", "swinir", "real", "L", 4, model("swinir", "SwinIR-L_x4_GAN")),
        "edsr" => {
            let s = pick(&[2, 3, 4], 4);
            ("edsr", "edsr", "classical", "M", s, model("edsr", &format!("edsr_x{s}-")))
        }
        "aurasr" => ("aurasr", "aurasr", "classical", "M", 4, model("aurasr", "model.safetensors")),
        "espcn" => {
            let s = pick(&[2, 3, 4], 4);
            ("espcn", "espcn", "classical", "M", s, model("espcn", &format!("ESPCN_x{s}.")))
        }
        _ => return Err(format!("unknown algorithm: {algo}")),
    };
    let mut models = vec![main];
    if engine == "aurasr" {
        models.insert(0, model("aurasr", "config.json"));
    }
    let args = vec![
        "--family".into(), family.into(), "--task".into(), task.into(), "--size".into(), size.into(),
        "--scale".into(), scale.to_string(), "--tile".into(), tile.to_string(), "--device".into(), device.into(),
        "--overlap".into(), overlap.to_string(), "--precision".into(), precision.into(),
        "--batch".into(), batch.to_string(), "--seams".into(), seams.into(),
    ];
    Ok(PyPlan { engine, models, main, args, scale })
}

/// Installs what is missing (environment 1–35 %, the model 35–45 %), then runs the worker.
pub(super) fn run(algo: &str, params: &Value, bytes: Vec<u8>) -> Value {
    let plan = match plan(algo, params) {
        Ok(p) => p,
        Err(e) => return super::super::error(e),
    };
    let mut p = Progress { last: 0, channel: "sr-progress" };
    let mut base_pct = 2.0;
    if env_info().is_none() {
        if let Err(e) = install_env(&mut p, 1.0, 35.0) {
            return fail(e);
        }
        base_pct = 35.0;
    }
    if plan.models.iter().any(|m| !have_model(m)) {
        if let Err(e) = ensure_models(&plan.models, false, &mut p, base_pct, base_pct.max(35.0) + 10.0) {
            return fail(e);
        }
        base_pct = base_pct.max(35.0) + 10.0;
    }
    let vpy = venv_python(&venv_dir());
    let tmp = tmp_dir();
    let _ = std::fs::remove_dir_all(&tmp);
    if let Err(e) = std::fs::create_dir_all(&tmp) {
        return super::super::error(e);
    }
    let id = format!("{}-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0), std::process::id());
    let in_path = tmp.join(format!("{id}-in.png"));
    let out_path = tmp.join(format!("{id}-out.png"));
    if let Err(e) = std::fs::write(&in_path, bytes) {
        return super::super::error(e);
    }
    let (w, i, o, mp) = (worker().to_string_lossy().into_owned(), in_path.to_string_lossy().into_owned(), out_path.to_string_lossy().into_owned(), model_path(plan.main).to_string_lossy().into_owned());
    let mut args: Vec<&str> = vec![&w];
    args.extend(plan.args.iter().map(String::as_str));
    args.extend(["--model", &mp, &i, &o]);
    emit_progress(base_pct, "running|0", plan.engine);
    let span = 98.0 - base_pct;
    let started = Instant::now();
    let mut device = String::new();
    let r = run_cmd_cancel(&vpy, &args, RUN_LIMIT, &[("PYTHONIOENCODING", "utf-8".into())], Some(&CANCEL), |line, _| {
        if let Some(d) = line.strip_prefix("DEVICE ") {
            device = d.splitn(2, ' ').nth(1).unwrap_or(d).to_string();
            emit_progress(base_pct, &format!("device|{device}"), plan.engine);
        } else if let Some(v) = line.strip_prefix("PROGRESS ").and_then(|v| v.trim().parse::<f64>().ok()) {
            emit_progress(base_pct + span * v.clamp(0.0, 100.0) / 100.0, &format!("running|{}|{device}", v.round()), plan.engine);
        }
    });
    let _ = std::fs::remove_file(&in_path);
    if r.cancelled {
        let _ = std::fs::remove_file(&out_path);
        return json!({ "error": "cancelled", "code": "CANCELLED" });
    }
    if r.timed_out {
        let _ = std::fs::remove_file(&out_path);
        return super::super::error(format!("{} did not finish within {} minutes and was stopped.", plan.engine, RUN_LIMIT.as_secs() / 60));
    }
    if r.code == 0 && out_path.is_file() {
        emit_progress(98.0, "reading", plan.engine);
        return json!({ "outPath": o, "scale": plan.scale, "engine": plan.engine, "device": device, "seconds": started.elapsed().as_secs_f64() });
    }
    let _ = std::fs::remove_file(&out_path);
    let text = tail(&r.err, &r.out);
    json!({ "error": if text.is_empty() { format!("{} failed (exit {})", plan.engine, r.code) } else { text.clone() }, "code": if text.contains("NO_GPU") { "NO_GPU" } else { "ENGINE_FAILED" } })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuda_build_follows_the_driver() {
        assert_eq!(variant_for("| NVIDIA-SMI 621.24   Driver Version: 621.24   CUDA Version: 13.1 |"), "cu130");
        assert_eq!(variant_for("CUDA Version: 12.8"), "cu128");
        assert_eq!(variant_for("CUDA Version: 12.6 "), "cu126");
        assert_eq!(variant_for("CUDA Version: 12.4"), "cpu", "older drivers: the CPU build");
        assert_eq!(variant_for(""), "cpu", "no NVIDIA driver");
        assert_eq!(variant_for("| NVIDIA-SMI 621.24   KMD Version: 621.24   CUDA UMD Version: 13.5 |"), "cu130", "newer header");
        assert_eq!(variant_for_driver("621.24"), "cu130");
        assert_eq!(variant_for_driver("572.16"), "cu128");
        assert_eq!(variant_for_driver("537.13"), "cpu");
    }

    #[test]
    fn every_algorithm_picks_a_pinned_model() {
        let p = plan("swinir-classical", &json!({ "scale": 8, "device": "gpu", "tile": 300 })).unwrap();
        assert!(p.main.file.contains("SwinIR-M_x8"));
        assert!(p.args.windows(2).any(|w| w == ["--device", "gpu"]) && p.args.windows(2).any(|w| w == ["--tile", "296"]));
        assert!(plan("swinir-light", &json!({ "scale": 8 })).unwrap().main.file.contains("SwinIR-S_x4"), "S has no x8: nearest");
        assert!(plan("swinir-real", &json!({ "scale": 3 })).unwrap().main.file.contains("M_x4_GAN"), "3 → 4 (tie goes up)");
        assert!(plan("swinir-real-large", &json!({})).unwrap().main.file.contains("SwinIR-L_x4"));
        assert!(plan("edsr", &json!({ "scale": 3 })).unwrap().main.file.starts_with("edsr_x3-"));
        let a = plan("aurasr", &json!({ "device": "x; rm" })).unwrap();
        assert_eq!(a.models.len(), 2, "AuraSR needs its config too");
        assert!(a.args.windows(2).any(|w| w == ["--device", "auto"]), "unknown device → auto");
        assert!(plan("espcn", &json!({ "scale": 2 })).unwrap().main.file == "ESPCN_x2.pb");
        assert!(plan("nope", &json!({})).is_err());
        let t = plan("edsr", &json!({ "overlap": 40, "precision": "fp16", "batch": 99, "seams": "x" })).unwrap();
        for pair in [["--overlap", "48"], ["--precision", "fp16"], ["--batch", "16"], ["--seams", "overlap"]] {
            assert!(t.args.windows(2).any(|w| w == pair), "{pair:?} in {:?}", t.args);
        }
        let d = plan("aurasr", &json!({ "precision": "fp64", "seams": "single" })).unwrap();
        assert!(d.args.windows(2).any(|w| w == ["--precision", "fp32"]) && d.args.windows(2).any(|w| w == ["--seams", "single"]));
    }

    #[test]
    fn models_are_pinned_official_files() {
        for m in MODELS {
            assert_eq!(m.sha256.len(), 64, "{}", m.file);
            assert!(SOURCES.iter().any(|s| m.url.starts_with(s)), "{}", m.url);
            assert!(m.url.ends_with(m.file));
        }
        for e in ENGINES {
            assert!(MODELS.iter().any(|m| m.engine == e.key), "{}", e.key);
        }
    }
}
