// ── The local engine (engine/mysf3d), started with the app ─────
//
// The same steps as scripts/engine.mjs, which the web build uses:
//   1. uv (one binary) is downloaded into <engine>/bin once;
//   2. `uv venv` makes <engine>/venv with uv's own Python 3.11;
//   3. `python -m mysf3d --port <free port> --parent-pid <ours>` runs the engine.
//      It installs PyTorch, the models and their weights by itself on the
//      first run and serves its state and log over HTTP; the page polls it.
//
// What happens before the engine answers (downloading uv, creating the
// environment) and anything the interpreter writes to stderr goes to the
// page as `engine-log` events; `engine-state` says starting / running (with
// the URL) / failed / stopped. Exit code 75 means "restart me" (after
// /api/reinstall). The engine watches our process and exits with it, so it
// never outlives the app, even when the app is killed.
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub const UV_VERSION: &str = "0.13.1";
pub const PYTHON_VERSION: &str = "3.11";
const RESTART_EXIT_CODE: i32 = 75;
const LISTENING: &str = "MYSF3D_LISTENING ";

#[derive(Default)]
pub struct EngineState {
  inner: Mutex<Inner>,
  generation: AtomicU64,
}

#[derive(Default)]
struct Inner {
  child: Option<Child>,
  url: String,
  state: String,
  message: String,
}

fn engine(app: &AppHandle) -> tauri::State<'_, EngineState> {
  app.state::<EngineState>()
}

/// The engine folder, shared with `npm run engine` (scripts/engine.mjs).
/// MYSF3D_ENGINE_HOME points tests elsewhere.
pub fn engine_home() -> PathBuf {
  if let Some(dir) = std::env::var_os("MYSF3D_ENGINE_HOME").filter(|d| !d.is_empty()) {
    return PathBuf::from(dir);
  }
  let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).unwrap_or_default();
  let base = if cfg!(windows) {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Local"))
  } else if cfg!(target_os = "macos") {
    home.join("Library").join("Application Support")
  } else {
    std::env::var_os("XDG_DATA_HOME").filter(|d| !d.is_empty()).map(PathBuf::from).unwrap_or_else(|| home.join(".local").join("share"))
  };
  base.join("MyStableFast3D").join("engine")
}

/// The uv release asset for this machine and the binary inside it.
pub fn uv_asset(os: &str, arch: &str) -> (String, &'static str) {
  let cpu = if arch == "aarch64" { "aarch64" } else { "x86_64" };
  match os {
    "windows" => (format!("uv-{cpu}-pc-windows-msvc.zip"), "uv.exe"),
    "macos" => (format!("uv-{cpu}-apple-darwin.tar.gz"), "uv"),
    _ => (format!("uv-{cpu}-unknown-linux-gnu.tar.gz"), "uv"),
  }
}

pub fn venv_python(venv: &Path) -> PathBuf {
  if cfg!(windows) {
    venv.join("Scripts").join("python.exe")
  } else {
    venv.join("bin").join("python")
  }
}

/// The engine's Python package: bundled as a resource in an installed app,
/// next to src-tauri in a development build.
fn engine_source(app: &AppHandle) -> PathBuf {
  if let Ok(res) = app.path().resource_dir() {
    let dir = res.join("engine");
    if dir.join("mysf3d").join("__init__.py").is_file() {
      return dir;
    }
  }
  PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("engine")
}

fn log(app: &AppHandle, level: &str, msg: impl Into<String>) {
  let _ = app.emit("engine-log", json!({ "level": level, "msg": msg.into() }));
}

fn set_state(app: &AppHandle, state: &str, url: &str, message: &str) {
  {
    let st = engine(app);
    let mut inner = st.inner.lock().unwrap();
    inner.state = state.to_string();
    inner.url = url.to_string();
    inner.message = message.to_string();
  }
  let _ = app.emit("engine-state", json!({ "state": state, "url": url, "message": message }));
}

fn quiet(cmd: &mut Command) -> &mut Command {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
  }
  cmd
}

fn uv_env(cmd: &mut Command, home: &Path) {
  cmd
    .env("UV_PYTHON_INSTALL_DIR", home.join("python"))
    .env("UV_CACHE_DIR", home.join("uv-cache"))
    .env("UV_PYTHON_PREFERENCE", "only-managed")
    .env("UV_NO_PROGRESS", "1")
    .env("PYTHONUTF8", "1")
    .env("PYTHONIOENCODING", "utf-8");
}

// ── uv ────────────────────────────────────────────────────
fn ensure_uv(app: &AppHandle, home: &Path) -> Result<PathBuf, String> {
  let (asset, exe) = uv_asset(std::env::consts::OS, std::env::consts::ARCH);
  let bin = home.join("bin").join(exe);
  if bin.is_file() {
    return Ok(bin);
  }
  let url = format!("https://github.com/astral-sh/uv/releases/download/{UV_VERSION}/{asset}");
  log(app, "info", format!("Downloading uv {UV_VERSION} — {url}"));
  let resp = ureq::get(&url).call().map_err(|e| format!("uv download failed: {e}"))?;
  let mut data = Vec::new();
  resp.into_reader().read_to_end(&mut data).map_err(|e| format!("uv download failed: {e}"))?;
  log(app, "info", format!("Unpacking uv ({} KB)", data.len() / 1024));
  let binary = if asset.ends_with(".zip") { unzip_file(&data, exe)? } else { untar_file(&data, exe)? };
  std::fs::create_dir_all(bin.parent().unwrap()).map_err(|e| e.to_string())?;
  let tmp = bin.with_extension("part");
  std::fs::write(&tmp, &binary).map_err(|e| e.to_string())?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755));
  }
  std::fs::rename(&tmp, &bin).map_err(|e| e.to_string())?;
  Ok(bin)
}

/// One file out of a zip archive, by its base name.
pub fn unzip_file(data: &[u8], name: &str) -> Result<Vec<u8>, String> {
  let mut zip = zip::ZipArchive::new(std::io::Cursor::new(data)).map_err(|e| e.to_string())?;
  for i in 0..zip.len() {
    let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
    let base = f.name().rsplit('/').next().unwrap_or("").to_string();
    if base == name && f.is_file() {
      let mut out = Vec::new();
      f.read_to_end(&mut out).map_err(|e| e.to_string())?;
      return Ok(out);
    }
  }
  Err(format!("{name} is not in the archive"))
}

/// One file out of a .tar.gz archive, by its base name.
pub fn untar_file(data: &[u8], name: &str) -> Result<Vec<u8>, String> {
  let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(data));
  for entry in archive.entries().map_err(|e| e.to_string())? {
    let mut entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path().map_err(|e| e.to_string())?.to_path_buf();
    if path.file_name().and_then(|n| n.to_str()) == Some(name) && entry.header().entry_type().is_file() {
      let mut out = Vec::new();
      entry.read_to_end(&mut out).map_err(|e| e.to_string())?;
      return Ok(out);
    }
  }
  Err(format!("{name} is not in the archive"))
}

// ── The environment ───────────────────────────────────────
fn ensure_venv(app: &AppHandle, home: &Path, uv: &Path) -> Result<PathBuf, String> {
  let venv = home.join("venv");
  let py = venv_python(&venv);
  if py.is_file() {
    return Ok(py);
  }
  log(app, "info", format!("Creating the Python {PYTHON_VERSION} environment in {} (uv downloads Python itself) …", venv.display()));
  let mut cmd = Command::new(uv);
  cmd.arg("venv").arg("--python").arg(PYTHON_VERSION).arg(&venv);
  uv_env(&mut cmd, home);
  quiet(&mut cmd).stdout(Stdio::piped()).stderr(Stdio::piped()).stdin(Stdio::null());
  let out = cmd.output().map_err(|e| format!("uv venv: {e}"))?;
  for line in String::from_utf8_lossy(&out.stdout).lines().chain(String::from_utf8_lossy(&out.stderr).lines()) {
    if !line.trim().is_empty() {
      log(app, "info", line.to_string());
    }
  }
  if !out.status.success() || !py.is_file() {
    return Err(format!("uv venv failed ({})", out.status));
  }
  Ok(py)
}

fn free_port() -> u16 {
  std::net::TcpListener::bind(("127.0.0.1", 0)).ok().and_then(|l| l.local_addr().ok()).map(|a| a.port()).unwrap_or(57650)
}

fn pump<R: Read + Send + 'static>(app: AppHandle, stream: R, level: &'static str, gen: u64, on_listen: Option<std::sync::mpsc::Sender<u16>>) {
  std::thread::spawn(move || {
    let mut reader = BufReader::new(stream);
    let mut buf = Vec::new();
    let mut listening = false;
    loop {
      buf.clear();
      match reader.read_until(b'\n', &mut buf) {
        Ok(0) | Err(_) => break,
        Ok(_) => {}
      }
      let line = String::from_utf8_lossy(&buf).trim_end().to_string();
      if line.is_empty() || engine(&app).generation.load(Ordering::SeqCst) != gen {
        continue;
      }
      if let Some(rest) = line.strip_prefix(LISTENING) {
        listening = true;
        if let (Some(tx), Ok(port)) = (&on_listen, rest.trim().parse::<u16>()) {
          let _ = tx.send(port);
        }
        continue;
      }
      // Once it answers, the engine's own log comes over HTTP; its stdout
      // only repeats it. stderr is always passed on (interpreter errors).
      if level == "info" && listening {
        continue;
      }
      log(&app, level, line);
    }
  });
}

fn run(app: AppHandle, gen: u64) {
  let current = |app: &AppHandle| engine(app).generation.load(Ordering::SeqCst) == gen;
  let home = engine_home();
  set_state(&app, "starting", "", "");
  log(&app, "info", format!("Engine folder: {}", home.display()));
  let prepared = std::fs::create_dir_all(&home)
    .map_err(|e| format!("{e}: {}", home.display()))
    .and_then(|_| ensure_uv(&app, &home))
    .and_then(|uv| ensure_venv(&app, &home, &uv).map(|py| (uv, py)));
  let (uv, py) = match prepared {
    Ok(v) => v,
    Err(e) => {
      log(&app, "error", format!("The engine could not be prepared: {e}"));
      set_state(&app, "failed", "", &e);
      return;
    }
  };
  let src = engine_source(&app);
  loop {
    if !current(&app) {
      return;
    }
    let port = free_port();
    let mut cmd = Command::new(&py);
    cmd
      .arg("-u")
      .arg("-m")
      .arg("mysf3d")
      .arg("--home")
      .arg(&home)
      .arg("--port")
      .arg(port.to_string())
      .arg("--uv")
      .arg(&uv)
      .arg("--parent-pid")
      .arg(std::process::id().to_string())
      .env("PYTHONPATH", &src)
      .env("PYTHONUNBUFFERED", "1");
    uv_env(&mut cmd, &home);
    quiet(&mut cmd).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = match cmd.spawn() {
      Ok(c) => c,
      Err(e) => {
        log(&app, "error", format!("The engine could not start: {e}"));
        set_state(&app, "failed", "", &e.to_string());
        return;
      }
    };
    log(&app, "info", format!("Engine process {} on port {port}", child.id()));
    let (tx, rx) = std::sync::mpsc::channel();
    if let Some(out) = child.stdout.take() {
      pump(app.clone(), out, "info", gen, Some(tx));
    }
    if let Some(err) = child.stderr.take() {
      pump(app.clone(), err, "warn", gen, None);
    }
    engine(&app).inner.lock().unwrap().child = Some(child);

    // Running once it says where it listens.
    let waiter = app.clone();
    std::thread::spawn(move || {
      if let Ok(p) = rx.recv_timeout(Duration::from_secs(120)) {
        if engine(&waiter).generation.load(Ordering::SeqCst) == gen {
          set_state(&waiter, "running", &format!("http://127.0.0.1:{p}"), "");
        }
      }
    });

    // Wait for it to end, without holding the lock (restart/stop take it).
    let code = loop {
      std::thread::sleep(Duration::from_millis(300));
      let st = engine(&app);
      let mut inner = st.inner.lock().unwrap();
      let Some(child) = inner.child.as_mut() else { break None };
      match child.try_wait() {
        Ok(Some(status)) => {
          inner.child = None;
          break Some(status.code().unwrap_or(-1));
        }
        Ok(None) => {}
        Err(_) => {
          inner.child = None;
          break Some(-1);
        }
      }
    };
    if !current(&app) {
      return;
    }
    match code {
      Some(RESTART_EXIT_CODE) => {
        log(&app, "info", "Restarting the engine …");
        set_state(&app, "starting", "", "");
        continue;
      }
      Some(c) => {
        let msg = format!("The engine stopped (exit code {c}).");
        log(&app, "error", msg.clone());
        set_state(&app, "failed", "", &msg);
        return;
      }
      None => {
        set_state(&app, "stopped", "", "");
        return;
      }
    }
  }
}

/// Starts (or restarts) the engine in the background.
pub fn start(app: &AppHandle) {
  stop(app);
  let gen = engine(app).generation.fetch_add(1, Ordering::SeqCst) + 1;
  let handle = app.clone();
  std::thread::spawn(move || run(handle, gen));
}

/// Stops the engine.
pub fn stop(app: &AppHandle) {
  engine(app).generation.fetch_add(1, Ordering::SeqCst);
  let child = engine(app).inner.lock().unwrap().child.take();
  if let Some(mut child) = child {
    let _ = child.kill();
    let _ = child.wait();
  }
}

#[tauri::command]
pub fn engine_status(app: AppHandle) -> Value {
  let st = engine(&app);
  let inner = st.inner.lock().unwrap();
  json!({ "state": inner.state, "url": inner.url, "message": inner.message, "home": engine_home().to_string_lossy() })
}

#[tauri::command]
pub fn engine_url(app: AppHandle) -> String {
  engine(&app).inner.lock().unwrap().url.clone()
}

#[tauri::command]
pub async fn engine_restart(app: AppHandle) -> bool {
  log(&app, "info", "Restarting the engine at the user's request …");
  tauri::async_runtime::spawn_blocking(move || start(&app)).await.is_ok()
}

#[tauri::command]
pub async fn engine_stop(app: AppHandle) -> bool {
  tauri::async_runtime::spawn_blocking(move || {
    stop(&app);
    set_state(&app, "stopped", "", "");
  })
  .await
  .is_ok()
}

#[tauri::command]
pub fn engine_folder() -> String {
  let home = engine_home();
  let _ = std::fs::create_dir_all(&home);
  home.to_string_lossy().to_string()
}

// ── Stability AI's paid API (only when the user chose it) ─
pub const STABILITY_ENDPOINT: &str = "https://api.stability.ai/v2beta/3d/stable-fast-3d";

/// A multipart/form-data body: the image and the text fields.
pub fn multipart(boundary: &str, file_name: &str, image: &[u8], fields: &[(String, String)]) -> Vec<u8> {
  let mut body = Vec::with_capacity(image.len() + 1024);
  for (k, v) in fields {
    let _ = write!(body, "--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n");
  }
  let safe: String = file_name.chars().filter(|c| *c != '"' && *c != '\r' && *c != '\n').collect();
  let _ = write!(body, "--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{safe}\"\r\nContent-Type: application/octet-stream\r\n\r\n");
  body.extend_from_slice(image);
  let _ = write!(body, "\r\n--{boundary}--\r\n");
  body
}

pub fn stability_convert(key: &str, name: &str, fields: &[(String, String)], image: &[u8]) -> Result<Vec<u8>, String> {
  if key.trim().is_empty() {
    return Err("No Stability AI API key".into());
  }
  let boundary = format!("----mysf3d{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
  let body = multipart(&boundary, name, image, fields);
  let resp = ureq::post(STABILITY_ENDPOINT)
    .timeout(Duration::from_secs(300))
    .set("Authorization", &format!("Bearer {}", key.trim()))
    .set("Content-Type", &format!("multipart/form-data; boundary={boundary}"))
    .send_bytes(&body);
  match resp {
    Ok(r) => {
      let mut out = Vec::new();
      r.into_reader().read_to_end(&mut out).map_err(|e| e.to_string())?;
      Ok(out)
    }
    Err(ureq::Error::Status(code, r)) => Err(format!("Stability AI API: HTTP {code} {}", r.into_string().unwrap_or_default())),
    Err(e) => Err(format!("Stability AI API: {e}")),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn uv_assets_per_platform() {
    assert_eq!(uv_asset("windows", "x86_64"), ("uv-x86_64-pc-windows-msvc.zip".into(), "uv.exe"));
    assert_eq!(uv_asset("macos", "aarch64"), ("uv-aarch64-apple-darwin.tar.gz".into(), "uv"));
    assert_eq!(uv_asset("linux", "x86_64"), ("uv-x86_64-unknown-linux-gnu.tar.gz".into(), "uv"));
  }

  #[test]
  fn engine_home_can_be_overridden() {
    std::env::set_var("MYSF3D_ENGINE_HOME", "/tmp/sf3d-test-home");
    assert_eq!(engine_home(), PathBuf::from("/tmp/sf3d-test-home"));
    std::env::remove_var("MYSF3D_ENGINE_HOME");
    assert!(engine_home().ends_with(Path::new("MyStableFast3D").join("engine")));
  }

  #[test]
  fn archives_yield_the_named_file() {
    // zip
    let mut buf = std::io::Cursor::new(Vec::new());
    {
      let mut w = zip::ZipWriter::new(&mut buf);
      w.start_file("uv-x/uv.exe", zip::write::SimpleFileOptions::default()).unwrap();
      w.write_all(b"MZ-binary").unwrap();
      w.finish().unwrap();
    }
    assert_eq!(unzip_file(buf.get_ref(), "uv.exe").unwrap(), b"MZ-binary");
    assert!(unzip_file(buf.get_ref(), "uvx.exe").is_err());
    // tar.gz
    let mut tar_bytes = Vec::new();
    {
      let gz = flate2::write::GzEncoder::new(&mut tar_bytes, flate2::Compression::fast());
      let mut t = tar::Builder::new(gz);
      let data = b"ELF-binary";
      let mut h = tar::Header::new_gnu();
      h.set_size(data.len() as u64);
      h.set_mode(0o755);
      h.set_cksum();
      t.append_data(&mut h, "uv-x86_64-unknown-linux-gnu/uv", &data[..]).unwrap();
      t.into_inner().unwrap().finish().unwrap();
    }
    assert_eq!(untar_file(&tar_bytes, "uv").unwrap(), b"ELF-binary");
  }

  #[test]
  fn multipart_body_has_fields_and_file() {
    let body = multipart("XYZ", "chair.png", b"PNGDATA", &[("remesh".into(), "none".into())]);
    let text = String::from_utf8_lossy(&body);
    assert!(text.contains("name=\"remesh\"\r\n\r\nnone\r\n"));
    assert!(text.contains("name=\"image\"; filename=\"chair.png\""));
    assert!(text.contains("PNGDATA"));
    assert!(text.ends_with("--XYZ--\r\n"));
  }
}
