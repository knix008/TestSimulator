// AI background removal via Python rembg (rembg1/u2net, rembg2/bria-rmbg, rembg3/isnet).
//
// Policy: use whatever Python the machine already has and install only the missing
// `rembg` / `onnxruntime` packages into it (progress goes to the page). An existing Python
// is never downgraded or replaced; downloading Python is the LAST RESORT, only when no
// working interpreter exists at all — and then a current version, per user, into our own
// folder. Models present on the computer are used; a missing one is downloaded here
// (progress, timeouts, checksum) before the worker starts, so the worker never downloads
// (or hangs) by itself.

use super::{data_url_bytes, emit, error, hex, hidden_command, user_data_dir};
use serde_json::{json, Value};
use std::io::{BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc;
use std::time::{Duration, Instant};

const PY_VERSION: &str = "3.14.0";
const WORKER_LIMIT: Duration = Duration::from_secs(10 * 60);

struct Model {
    key: &'static str,
    label: &'static str,
    file: &'static str,
    alias: &'static [&'static str],
    url_file: &'static str,
    hash_algo: &'static str,
    hash_hex: &'static str,
    mb: u64,
}

const MODELS: &[Model] = &[
    Model { key: "rembg1", label: "U2Net", file: "u2net.onnx", alias: &["u2net.onnx"], url_file: "u2net.onnx",
        hash_algo: "md5", hash_hex: "60024c5c889badc19c04ad937298a77b", mb: 168 },
    Model { key: "rembg2", label: "RMBG-2.0", file: "bria-rmbg.onnx", alias: &["rembg2.onnx", "bria-rmbg.onnx", "bria-rmbg-2.0.onnx"],
        url_file: "bria-rmbg-2.0.onnx", hash_algo: "sha256", hash_hex: "5b486f08200f513f460da46dd701db5fbb47d79b4be4b708a19444bcd4e79958", mb: 977 },
    Model { key: "rembg3", label: "ISNet", file: "isnet-general-use.onnx", alias: &["isnet-general-use.onnx", "isnet.onnx"],
        url_file: "isnet-general-use.onnx", hash_algo: "md5", hash_hex: "fc16ebd8b0c10d971d3513d564d01e29", mb: 170 },
];

/// (MYIMAGEVIEWER_MODEL_URL_BASE: tests point it at a dead / silent server)
fn model_url(m: &Model) -> String {
    let base = std::env::var("MYIMAGEVIEWER_MODEL_URL_BASE")
        .unwrap_or_else(|_| "https://github.com/danielgatis/rembg/releases/download/v0.0.0".into());
    format!("{base}/{}", m.url_file)
}

/// Progress that never moves backwards across phases (provision → model → inference),
/// which would look like a stall or a reset.
struct Progress {
    last: u32,
}

impl Progress {
    fn emit(&mut self, percent: f64, message: &str) {
        self.last = self.last.max(percent.clamp(0.0, 100.0) as u32);
        emit("rembg-progress", json!({ "percent": self.last, "message": message }));
    }
}

struct CmdResult {
    code: i32,
    out: String,
    err: String,
    timed_out: bool,
}

/// Run a command; `timeout` kills it (and reports timed_out) instead of waiting forever.
/// on_line sees every stdout / stderr line as it comes.
fn run_cmd(cmd: &Path, args: &[&str], timeout: Duration, envs: &[(&str, String)], mut on_line: impl FnMut(&str, bool)) -> CmdResult {
    let mut command = hidden_command(cmd);
    command.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    for (k, v) in envs {
        command.env(k, v);
    }
    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => return CmdResult { code: -1, out: String::new(), err: e.to_string(), timed_out: false },
    };
    let (tx, rx) = mpsc::channel::<(bool, String)>();
    for (is_err, stream) in [(false, child.stdout.take().map(|s| Box::new(s) as Box<dyn Read + Send>)), (true, child.stderr.take().map(|s| Box::new(s) as Box<dyn Read + Send>))] {
        if let Some(stream) = stream {
            let tx = tx.clone();
            std::thread::spawn(move || {
                for line in std::io::BufReader::new(stream).split(b'\n').map_while(Result::ok) {
                    let _ = tx.send((is_err, String::from_utf8_lossy(&line).trim_end_matches('\r').to_string()));
                }
            });
        }
    }
    drop(tx);
    let deadline = Instant::now() + timeout;
    let (mut out, mut err, mut timed_out) = (String::new(), String::new(), false);
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(left) {
            Ok((is_err, line)) => {
                on_line(&line, is_err);
                let target = if is_err { &mut err } else { &mut out };
                target.push_str(&line);
                target.push('\n');
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                timed_out = true;
                let _ = child.kill();
                break;
            }
        }
    }
    let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
    CmdResult { code, out, err, timed_out }
}

fn python_works(py: &Path) -> bool {
    let r = run_cmd(py, &["--version"], Duration::from_secs(15), &[], |_, _| {});
    r.code == 0 && format!("{}{}", r.out, r.err).contains("Python 3.")
}

fn managed_python() -> PathBuf {
    user_data_dir().join("python").join(if cfg!(windows) { "python.exe" } else { "bin/python3" })
}

/// Download `url` to `dest` — never waits forever, never leaves half a file: it goes to
/// dest.part first and only a complete (and, with a hash, verified) file is renamed into
/// place; no response for 20 s or no byte for 30 s fails; a short body or a checksum
/// mismatch fails (and deletes the part).
fn download(url: &str, dest: &Path, hash: Option<(&str, &str)>, mut on_progress: impl FnMut(f64, u64, u64)) -> Result<(), String> {
    use md5::Digest;
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let part = PathBuf::from(format!("{}.part", dest.to_string_lossy()));
    let _ = std::fs::remove_file(&part);
    let result = (|| -> Result<(), String> {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(20))
            .timeout_read(Duration::from_secs(30))
            .redirects(5)
            .user_agent("MyImageViewer")
            .build();
        let res = agent.get(url).call().map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("HTTP {code}"),
            other => other.to_string(),
        })?;
        let total: u64 = res.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
        let mut reader = res.into_reader();
        let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
        let mut md5 = md5::Md5::new();
        let mut sha = sha2::Sha256::new();
        let mut got = 0u64;
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            let n = reader.read(&mut buf).map_err(|e| if e.kind() == std::io::ErrorKind::TimedOut { "no data for 30 s".to_string() } else { e.to_string() })?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            match hash.map(|h| h.0) {
                Some("md5") => md5.update(&buf[..n]),
                Some("sha256") => sha.update(&buf[..n]),
                _ => {}
            }
            got += n as u64;
            on_progress(if total > 0 { got as f64 / total as f64 } else { 0.0 }, got, total);
        }
        file.flush().map_err(|e| e.to_string())?;
        drop(file);
        if total > 0 && got != total {
            return Err(format!("incomplete download ({got} of {total} bytes)"));
        }
        if let Some((algo, want)) = hash {
            let have = if algo == "md5" { hex(&md5.finalize()) } else { hex(&sha.finalize()) };
            if !have.eq_ignore_ascii_case(want) {
                return Err("checksum mismatch (damaged download)".into());
            }
        }
        std::fs::rename(&part, dest).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&part);
    }
    result
}

fn model_dirs() -> Vec<PathBuf> {
    if let Some(d) = std::env::var_os("MYIMAGEVIEWER_MODEL_DIR") {
        return vec![PathBuf::from(d)];
    }
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let mut dirs = vec![std::env::var_os("U2NET_HOME").map(PathBuf::from).unwrap_or_else(|| super::home_dir().join(".u2net"))];
    if let Some(l) = &local {
        dirs.push(l.join("ImageRembgWinV10").join("models"));
    }
    if cfg!(debug_assertions) {
        dirs.push(super::project_root().join("models"));
    }
    if let Some(l) = &local {
        dirs.push(l.join("Programs").join("Image Rembg").join("Assets").join("Models"));
    }
    dirs
}

fn find_model(m: &Model) -> Option<PathBuf> {
    model_dirs().into_iter().flat_map(|d| m.alias.iter().map(move |n| d.join(n))).find(|p| std::fs::metadata(p).map(|s| s.len() > 1_000_000).unwrap_or(false))
}

/// The model file, downloading it first if it is not on this computer.
fn ensure_model(m: &Model, p: &mut Progress, from: f64, to: f64) -> Result<PathBuf, String> {
    if let Some(found) = find_model(m) {
        return Ok(found);
    }
    let dest = model_dirs()[0].join(m.file);
    p.emit(from, "downloading_model");
    let mut last_mb = u64::MAX;
    download(&model_url(m), &dest, Some((m.hash_algo, m.hash_hex)), |frac, got, total| {
        // One event per MB, not per network chunk
        let mb = got / 1_048_576;
        if mb == last_mb {
            return;
        }
        last_mb = mb;
        let total_mb = if total > 0 { total / 1_048_576 } else { m.mb };
        p.emit(from + (frac * (to - from)).round(), &format!("downloading_model|{mb}|{total_mb}"));
    })
    .map_err(|e| format!("model download failed: {} ({}, about {} MB) — {e}", m.label, m.file, m.mb))?;
    Ok(dest)
}

fn installer_name() -> String {
    match std::env::consts::ARCH {
        "aarch64" => format!("python-{PY_VERSION}-arm64.exe"),
        "x86" => format!("python-{PY_VERSION}.exe"),
        _ => format!("python-{PY_VERSION}-amd64.exe"),
    }
}

/// Download and silently install a per-user Python into userData/python.
fn install_managed_python(p: &mut Progress) -> Result<PathBuf, String> {
    if !cfg!(windows) {
        return Err("Automatic Python installation is only supported on Windows. Please install Python 3 from https://www.python.org/downloads/".into());
    }
    let target = user_data_dir().join("python");
    let installer = std::env::temp_dir().join("imageviewer-rembg").join(installer_name());
    p.emit(4.0, "downloading_python");
    let url = format!("https://www.python.org/ftp/python/{PY_VERSION}/{}", installer_name());
    download(&url, &installer, None, |frac, _, _| p.emit(4.0 + (frac * 26.0).round(), "downloading_python"))?;
    // ≥35 so the page's creep animates the bar during the silent install
    p.emit(36.0, "installing_python");
    let target_arg = format!("TargetDir={}", target.to_string_lossy());
    let r = run_cmd(
        &installer,
        &["/quiet", "InstallAllUsers=0", "PrependPath=0", "Include_launcher=0", "Include_test=0", "Include_pip=1", "AssociateFiles=0", "Shortcuts=0", &target_arg],
        Duration::from_secs(10 * 60),
        &[],
        |_, _| {},
    );
    if r.timed_out {
        return Err("Installing Python took longer than 10 minutes and was stopped.".into());
    }
    let exe = managed_python();
    if !exe.is_file() {
        return Err(format!("Python installation failed (exit {}). {}", r.code, r.err.trim()).trim().to_string());
    }
    let _ = std::fs::remove_file(&installer);
    p.emit(42.0, "installing_python");
    Ok(exe)
}

/// A working Python, preferring what the machine already has:
/// explicit override → system python → previously app-installed → install.
fn resolve_python(p: &mut Progress) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(py) = std::env::var_os("IMAGEVIEWER_PYTHON") {
        candidates.push(PathBuf::from(py));
    }
    candidates.push(PathBuf::from(if cfg!(windows) { "python" } else { "python3" }));
    candidates.push(PathBuf::from("py"));
    candidates.push(managed_python());
    if let Some(py) = candidates.into_iter().find(|py| python_works(py)) {
        return Ok(py);
    }
    install_managed_python(p)
}

/// rembg + onnxruntime importable by `py`; pip-installed if not.
fn ensure_packages(py: &Path, p: &mut Progress) -> Result<(), String> {
    let check = || run_cmd(py, &["-c", "import rembg, onnxruntime"], Duration::from_secs(60), &[], |_, _| {});
    if check().code == 0 {
        return Ok(());
    }
    p.emit(44.0, "installing_deps");
    run_cmd(py, &["-m", "pip", "install", "--upgrade", "--no-warn-script-location", "--timeout", "30", "pip"], Duration::from_secs(5 * 60), &[], |_, _| {});
    let mut creep = 46.0;
    let r = run_cmd(
        py,
        &["-m", "pip", "install", "--upgrade", "--no-warn-script-location", "--timeout", "30", "rembg", "onnxruntime"],
        Duration::from_secs(15 * 60),
        &[],
        |line, _| {
            if ["Collecting", "Downloading", "Building", "Preparing", "Installing"].iter().any(|w| line.contains(w)) {
                creep = f64::min(88.0, creep + 1.0);
                p.emit(creep, "installing_deps");
            }
        },
    );
    if r.timed_out {
        return Err("Installing rembg / onnxruntime took longer than 15 minutes — check the network and try again.".into());
    }
    let verify = check();
    if verify.code != 0 {
        let src = [&r.err, &r.out, &verify.err].into_iter().find(|s| !s.trim().is_empty()).cloned().unwrap_or_default();
        let lines: Vec<&str> = src.lines().filter(|l| !l.trim().is_empty()).collect();
        let tail = lines[lines.len().saturating_sub(4)..].join(" ");
        return Err(format!("Failed to install rembg/onnxruntime: {}", if tail.is_empty() { format!("pip exit {}", r.code) } else { tail }));
    }
    p.emit(90.0, "installing_deps");
    Ok(())
}

fn worker_script() -> PathBuf {
    super::runtime_dir()
        .map(|d| d.join("rembg_worker.py"))
        .unwrap_or_else(|| super::project_root().join("scripts").join("rembg_worker.py"))
}

/// Input: { dataUrl: 'data:image/png;base64,…', model: 'rembg1' | 'rembg2' | 'rembg3' }.
/// Sends 'rembg-progress' { percent, message } while it works.
pub fn remove(opts: &Value) -> Value {
    let data_url = opts.get("dataUrl").and_then(Value::as_str).unwrap_or("");
    let model_key = opts.get("model").and_then(Value::as_str).unwrap_or("rembg1");
    let tmp = std::env::temp_dir().join("imageviewer-rembg");
    let id = format!("{}-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0), std::process::id());
    let in_path = tmp.join(format!("{id}-in.png"));
    let out_path = tmp.join(format!("{id}-out.png"));
    let result = run(data_url, model_key, &tmp, &in_path, &out_path);
    let _ = std::fs::remove_file(&in_path);
    let _ = std::fs::remove_file(&out_path);
    result
}

fn run(data_url: &str, model_key: &str, tmp: &Path, in_path: &Path, out_path: &Path) -> Value {
    let mut p = Progress { last: 0 };
    if !data_url.starts_with("data:") {
        return error("Invalid image data");
    }
    let Some(bytes) = data_url_bytes(data_url) else {
        return error("Invalid image data");
    };
    p.emit(2.0, "preparing");
    if let Err(e) = std::fs::create_dir_all(tmp).and_then(|_| std::fs::write(in_path, bytes)) {
        return error(e);
    }
    p.emit(3.0, "preparing");
    let worker = worker_script();
    if !worker.is_file() {
        return error(format!("rembg worker missing: {}", worker.to_string_lossy()));
    }
    // 1) The machine's own Python (installing one only if there is none)
    let py = match resolve_python(&mut p) {
        Ok(py) => py,
        Err(e) => return error(e),
    };
    // 2) rembg / onnxruntime into that Python if missing (fast when already importable)
    if let Err(e) = ensure_packages(&py, &mut p) {
        return error(e);
    }
    // 3) The model: found on this computer, or downloaded now; a failure is reported and a
    //    retry downloads from the start
    let model = MODELS.iter().find(|m| m.key == model_key).unwrap_or(&MODELS[0]);
    let from = f64::from(p.last.max(44));
    let model_path = match ensure_model(model, &mut p, from, 88.0) {
        Ok(path) => path,
        Err(e) => return json!({ "error": e, "code": "MODEL_DOWNLOAD_FAILED", "retry": true }),
    };
    // 4) The removal itself; the worker's own 0–100 is mapped into [base..100]
    let base = f64::from(p.last.max(8));
    let remap = |v: f64| base + (100.0 - base) * v.clamp(0.0, 100.0) / 100.0;
    let (worker_s, in_s, out_s) = (worker.to_string_lossy().into_owned(), in_path.to_string_lossy().into_owned(), out_path.to_string_lossy().into_owned());
    let r = run_cmd(
        &py,
        &[&worker_s, model_key, &in_s, &out_s],
        WORKER_LIMIT,
        &[("MYIMAGEVIEWER_MODEL_PATH", model_path.to_string_lossy().into_owned())],
        |line, is_err| {
            if let Some(rest) = line.strip_prefix("PROGRESS").filter(|_| is_err) {
                let rest = rest.trim_start();
                let num: String = rest.chars().take_while(char::is_ascii_digit).collect();
                if let Ok(v) = num.parse::<f64>() {
                    p.emit(remap(v), rest[num.len()..].trim());
                }
            }
        },
    );
    if r.timed_out {
        return error(format!("AI background removal did not finish within {} minutes and was stopped.", WORKER_LIMIT.as_secs() / 60));
    }
    if r.code == 0 && out_path.is_file() {
        p.emit(96.0, "applying");
        return match std::fs::read(out_path) {
            Ok(png) => {
                p.emit(100.0, "done");
                json!({ "dataUrl": format!("data:image/png;base64,{}", super::b64(&png)) })
            }
            Err(e) => error(e),
        };
    }
    let msg = r.err.trim();
    json!({
        "error": if msg.is_empty() { format!("rembg failed (exit {})", r.code) } else { msg.to_string() },
        "hint": "models: rembg1=u2net, rembg2=bria-rmbg, rembg3=isnet-general-use",
    })
}
