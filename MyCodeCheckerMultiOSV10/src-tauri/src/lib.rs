// Tauri shell. The window lives here. Analysis and the workspace stay in the
// Node service (host/desktop.js), the same core the web version serves.
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct Host {
    port: u16,
    token: String,
    child: Mutex<Option<Child>>,
}

#[derive(Serialize)]
struct HostInfo {
    port: u16,
    token: String,
    platform: String,
}

fn platform_name() -> &'static str {
    if cfg!(windows) { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" }
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

fn default_config_dir() -> PathBuf {
    if let Some(over) = std::env::var_os("MCC_USER_DATA") {
        return PathBuf::from(over);
    }
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home_dir().join("AppData").join("Roaming"))
    } else if cfg!(target_os = "macos") {
        home_dir().join("Library").join("Application Support")
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home_dir().join(".config"))
    };
    base.join("MyCodeChecker")
}

fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => { out.pop(); }
            other => out.push(other.as_os_str()),
        }
    }
    let text = out.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
}

fn node_binary(root: &Path) -> Result<PathBuf, String> {
    let bundled = if cfg!(windows) { root.join("node.exe") } else { root.join("node") };
    if bundled.is_file() { return Ok(bundled); }
    let path = std::env::var_os("PATH").ok_or("Node.js was not found")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(if cfg!(windows) { "node.exe" } else { "node" });
        if candidate.is_file() { return Ok(candidate); }
    }
    Err("Node.js was not found. Install Node.js and start MyCodeChecker again.".into())
}

fn project_root(app: &tauri::App) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(normalize(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")));
    }
    app.path().resource_dir().map(|dir| normalize(&dir.join("app"))).map_err(|err| err.to_string())
}

fn start_service(root: &Path, node: &Path, config: &Path) -> Result<(Child, u16, String), String> {
    let script = root.join("host").join("desktop.js");
    if !script.is_file() {
        return Err(format!("CodeChecker service is missing ({})", script.display()));
    }
    let mut cmd = Command::new(node);
    cmd.arg(&script).arg("--config").arg(config).current_dir(root).env("MCC_HOST", "tauri")
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn().map_err(|err| format!("Could not start Node.js: {err}"))?;
    let tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    if let Some(stderr) = child.stderr.take() {
        let tail = Arc::clone(&tail);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                eprint!("[codechecker] {line}");
                if let Ok(mut t) = tail.lock() {
                    let text = line.trim_end().to_string();
                    if !text.trim().is_empty() {
                        t.push(text);
                        if t.len() > 12 { t.remove(0); }
                    }
                }
                line.clear();
            }
        });
    }
    let stdout = child.stdout.take().ok_or("The CodeChecker service has no stdout")?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => { let _ = tx.send(Err("The CodeChecker service stopped before it was ready".to_string())); break; }
                Ok(_) => { if let Some(rest) = line.trim().strip_prefix("MCC_READY ") { let _ = tx.send(Ok(rest.to_string())); break; } }
                Err(err) => { let _ = tx.send(Err(err.to_string())); break; }
            }
        }
    });
    let ready = rx.recv_timeout(Duration::from_secs(30)).map_err(|_| {
        let _ = child.kill();
        "The CodeChecker service did not start in time".to_string()
    })??;
    let value: Value = serde_json::from_str(&ready).map_err(|err| format!("Bad ready message: {err}"))?;
    let port = value.get("port").and_then(|v| v.as_u64()).ok_or("The service did not report a port")? as u16;
    let token = value.get("token").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if token.is_empty() {
        let _ = child.kill();
        return Err("The CodeChecker service did not report a token".into());
    }
    Ok((child, port, token))
}

#[tauri::command]
fn host_info(host: tauri::State<'_, Host>) -> HostInfo {
    HostInfo { port: host.port, token: host.token.clone(), platform: platform_name().to_string() }
}

#[tauri::command]
fn renderer_ready(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn boot(app: &mut tauri::App) -> Result<(), String> {
    let root = project_root(app)?;
    let node = node_binary(&root)?;
    let config = default_config_dir();
    let _ = fs::create_dir_all(&config);
    let (child, port, token) = start_service(&root, &node, &config)?;
    let script = format!("window.__MCC_HOST__={{port:{port},token:\"{token}\",platform:\"{}\"}};", platform_name());
    app.manage(Host { port, token, child: Mutex::new(Some(child)) });
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()));
    // `npm start` gets its own WebView2 profile: sharing the installed app's
    // profile fails with 0x800700AA (resource in use) while that app is open.
    if cfg!(debug_assertions) {
        if let Ok(dir) = app.path().app_local_data_dir() {
            builder = builder.data_directory(dir.join("EBWebView-dev"));
        }
    }
    let win = builder
        .title("MyCodeChecker")
        .inner_size(1280.0, 840.0)
        .min_inner_size(960.0, 640.0)
        .decorations(false)
        .resizable(true)
        .visible(false)
        .center()
        .initialization_script(&script)
        .build()
        .map_err(|err| err.to_string())?;
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        if let Some(w) = handle.get_webview_window("main") {
            let _ = w.show();
        }
    });
    let _ = win;
    Ok(())
}

fn kill_host(app: &tauri::AppHandle) {
    let Some(host) = app.try_state::<Host>() else { return };
    if let Some(mut child) = host.child.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = child.kill();
        let _ = child.wait();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![host_info, renderer_ready])
        .setup(|app| {
            if let Err(err) = boot(app) {
                eprintln!("{err}");
                return Err(Box::new(std::io::Error::other(err)));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MyCodeChecker")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) { kill_host(app); }
        });
}
