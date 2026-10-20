// Tauri shell for My BrainMap.
//
// The window and dialogs live here. File and session
// work stays in the Node service this process starts
// (host/desktop.js), the same core the web version serves.
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;

struct Host {
    port: u16,
    token: String,
    child: Mutex<Option<Child>>,
    pending: Mutex<Vec<String>>,
    ready: Mutex<bool>,
}

#[derive(Serialize)]
struct HostInfo {
    port: u16,
    token: String,
    platform: String,
}

fn platform_name() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn default_config_dir() -> PathBuf {
    if let Some(over) = std::env::var_os("MTM_USER_DATA") {
        return PathBuf::from(over);
    }
    if cfg!(windows) {
        let base = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData").join("Roaming"));
        base.join("My BrainMap")
    } else if cfg!(target_os = "macos") {
        home_dir().join("Library").join("Application Support").join("My BrainMap")
    } else {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join(".config"));
        base.join("My BrainMap")
    }
}

fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    // Windows verbatim paths (\\?\C:\…, \\?\UNC\server\…) become plain ones: Node cannot start a
    // script given as \\?\C:\… (it fails with EISDIR on lstat 'C:'), and resource_dir() returns them.
    let text = out.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
}

fn paths_eq(a: &Path, b: &Path) -> bool {
    let left = normalize(a);
    let right = normalize(b);
    if cfg!(windows) {
        left.to_string_lossy().eq_ignore_ascii_case(&right.to_string_lossy())
    } else {
        left == right
    }
}

fn files_from_args(args: &[String], cwd: &Path) -> Vec<String> {
    let exe = std::env::current_exe().ok();
    let mut out = Vec::new();
    for arg in args {
        if arg.is_empty() || arg.starts_with('-') || arg == "." {
            continue;
        }
        let path = PathBuf::from(arg);
        let path = if path.is_absolute() { path } else { cwd.join(&path) };
        if !path.is_file() {
            continue;
        }
        if exe.as_ref().is_some_and(|e| paths_eq(e, &path)) {
            continue;
        }
        let abs = normalize(&path);
        let text = abs.to_string_lossy().to_string();
        if !out.iter().any(|p| p == &text) {
            out.push(text);
        }
    }
    out
}

fn node_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let names: &[&str] = if cfg!(windows) { &["node.exe", "node.cmd"] } else { &["node"] };
    for dir in std::env::split_paths(&path) {
        for name in names {
            let candidate = dir.join(name);
            if candidate.is_file() && !name.ends_with(".cmd") {
                return Some(candidate);
            }
            if cfg!(windows) && name.ends_with(".cmd") && candidate.is_file() {
                // A .cmd shim is not a runtime we can spawn the same way. Keep looking for node.exe.
                continue;
            }
        }
    }
    None
}

fn node_binary(root: &Path) -> Result<PathBuf, String> {
    let bundled = if cfg!(windows) { root.join("node.exe") } else { root.join("node") };
    if bundled.is_file() {
        return Ok(bundled);
    }
    node_on_path().ok_or_else(|| "Node.js was not found. Install Node.js, or build My BrainMap so the runtime is bundled.".into())
}

fn project_root(app: &tauri::App) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(normalize(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")));
    }
    app.path()
        .resource_dir()
        .map(|dir| normalize(&dir.join("app")))
        .map_err(|err| err.to_string())
}

fn start_service(root: &Path, node: &Path, config: &Path) -> Result<(Child, u16, String), String> {
    let script = root.join("host").join("desktop.js");
    if !script.is_file() {
        return Err(format!("BrainMap service is missing ({})", script.display()));
    }
    let mut cmd = Command::new(node);
    cmd.arg(&script)
        .arg("--config")
        .arg(config)
        .current_dir(root)
        .env("MTM_HOST", "tauri")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn().map_err(|err| format!("Could not start Node.js: {err}"))?;
    // the last lines Node wrote to stderr: shown in the error dialog if it stops before it is ready
    let tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    if let Some(stderr) = child.stderr.take() {
        let tail = Arc::clone(&tail);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                eprint!("[brainmap] {line}");
                if let Ok(mut t) = tail.lock() {
                    let text = line.trim_end();
                    if !text.trim().is_empty() {
                        t.push(text.to_string());
                        if t.len() > 12 {
                            t.remove(0);
                        }
                    }
                }
                line.clear();
            }
        });
    }
    let stdout = child.stdout.take().ok_or("The BrainMap service has no stdout")?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    let _ = tx.send(Err("The BrainMap service stopped before it was ready".to_string()));
                    break;
                }
                Ok(_) => {
                    if let Some(rest) = line.trim().strip_prefix("MTM_READY ") {
                        let _ = tx.send(Ok(rest.to_string()));
                        break;
                    }
                }
                Err(err) => {
                    let _ = tx.send(Err(err.to_string()));
                    break;
                }
            }
        }
    });
    let ready = rx.recv_timeout(Duration::from_secs(30)).map_err(|_| {
        let _ = child.kill();
        "The BrainMap service did not start in time".to_string()
    })?;
    let ready = ready.map_err(|err| {
        // give stderr a moment to arrive, then add what Node said
        std::thread::sleep(Duration::from_millis(300));
        let said = tail.lock().map(|t| t.join("\n")).unwrap_or_default();
        if said.is_empty() {
            err
        } else {
            format!("{err}\n\nNode.js: {}\nScript: {}", said, script.display())
        }
    })?;
    let value: Value = serde_json::from_str(&ready).map_err(|err| format!("Bad ready message: {err}"))?;
    let port = value.get("port").and_then(|v| v.as_u64()).ok_or("The BrainMap service did not report a port")? as u16;
    let token = value.get("token").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if token.is_empty() {
        let _ = child.kill();
        return Err("The BrainMap service did not report a token".into());
    }
    Ok((child, port, token))
}

fn read_session(config: &Path) -> Value {
    fs::read_to_string(config.join("session.json"))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or(Value::Null)
}

fn theme_color(session: &Value) -> (u8, u8, u8) {
    let hex = session.get("themeBg").and_then(|v| v.as_str()).unwrap_or("#12161c");
    let hex = hex.trim().trim_start_matches('#');
    u32::from_str_radix(hex, 16)
        .ok()
        .filter(|_| hex.len() == 6)
        .map(|n| (((n >> 16) & 0xff) as u8, ((n >> 8) & 0xff) as u8, (n & 0xff) as u8))
        .unwrap_or((0x12, 0x16, 0x1c))
}

fn kill_host(app: &tauri::AppHandle) {
    let Some(host) = app.try_state::<Host>() else { return };
    let child = host.child.lock().ok().and_then(|mut slot| slot.take());
    drop(host);
    if let Some(mut child) = child {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
fn host_info(host: tauri::State<'_, Host>) -> HostInfo {
    HostInfo {
        port: host.port,
        token: host.token.clone(),
        platform: platform_name().to_string(),
    }
}

#[tauri::command]
fn renderer_ready(app: tauri::AppHandle, host: tauri::State<'_, Host>) {
    if let Ok(mut ready) = host.ready.lock() {
        *ready = true;
    }
    let files: Vec<String> = host.pending.lock().map(|mut g| g.drain(..).collect()).unwrap_or_default();
    if !files.is_empty() {
        let _ = app.emit_to("main", "files:open", &files);
    }
}

fn boot(app: &mut tauri::App) -> Result<(), String> {
    let root = project_root(app)?;
    let node = node_binary(&root)?;
    let config = default_config_dir();
    let _ = fs::create_dir_all(&config);
    let cwd = std::env::current_dir().unwrap_or_else(|_| root.clone());
    let pending = files_from_args(&std::env::args().collect::<Vec<_>>(), &cwd);
    let (child, port, token) = start_service(&root, &node, &config)?;
    if cfg!(debug_assertions) {
        eprintln!("[mybrainmap] service http://127.0.0.1:{port}");
    }
    let script = format!(
        "window.__MTM_HOST__={{port:{port},token:\"{token}\",platform:\"{platform}\"}};",
        platform = platform_name()
    );
    app.manage(Host {
        port,
        token,
        child: Mutex::new(Some(child)),
        pending: Mutex::new(pending),
        ready: Mutex::new(false),
    });

    let session = read_session(&config);
    let (r, g, b) = theme_color(&session);
    let bounds = session.get("windowBounds").cloned().unwrap_or(Value::Null);
    let width = bounds.get("width").and_then(|v| v.as_f64()).unwrap_or(1320.0).max(640.0);
    let height = bounds.get("height").and_then(|v| v.as_f64()).unwrap_or(840.0).max(600.0);
    let maximized = bounds.get("maximized").and_then(|v| v.as_bool()).unwrap_or(false);
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("My BrainMap")
        .inner_size(width, height)
        .min_inner_size(640.0, 600.0)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .visible(false)
        .initialization_script(&script)
        .background_color(tauri::window::Color(r, g, b, 255));
    if let (Some(x), Some(y)) = (bounds.get("x").and_then(|v| v.as_f64()), bounds.get("y").and_then(|v| v.as_f64())) {
        builder = builder.position(x, y);
    } else {
        builder = builder.center();
    }
    let win = builder.build().map_err(|err| err.to_string())?;
    // The window icon is the exe resource from bundle.icon (icons/icon.ico).
    // Shortcuts and the NSIS installer use that same file, so this does not
    // load a second copy from the source tree.
    if let Some(icon) = app.default_window_icon() {
        let _ = win.set_icon(icon.clone());
    }
    if maximized {
        let _ = win.maximize();
    }
    let _ = win.show();
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![host_info, renderer_ready])
        .setup(|app| {
            if let Err(err) = boot(app) {
                let _ = app.dialog().message(&err).title("My BrainMap").blocking_show();
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, err)));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building My BrainMap")
        .run(|app, event| match event {
            RunEvent::Exit => kill_host(app),
            RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. } if label == "main" => {
                // Every popup (settings, about, help, print…) goes with the main window.
                for (name, win) in app.webview_windows() {
                    if name != "main" {
                        let _ = win.destroy();
                    }
                }
                kill_host(app);
                app.exit(0);
            }
            _ => {}
        });
}
