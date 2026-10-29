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
    // The main window's extra WebView2 arguments (a debug build's CDP port),
    // which child windows must repeat.
    browser_args: Option<String>,
}

#[derive(Serialize)]
struct HostInfo {
    port: u16,
    token: String,
    platform: String,
    #[serde(rename = "browserArgs", skip_serializing_if = "Option::is_none")]
    browser_args: Option<String>,
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

// The service holds whole analyses, which outgrow V8's default heap (about
// 4 GB) on large projects. Allow three quarters of the physical memory (as
// core/memory.js does for the analysis worker); Node reports the amount.
fn heap_limit_mb(node: &Path) -> Option<u64> {
    let mut cmd = Command::new(node);
    cmd.arg("-p").arg("Math.max(8192, Math.floor(require('os').totalmem() / 1048576 * 0.75))")
        .stdin(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let out = cmd.output().ok()?;
    String::from_utf8_lossy(&out.stdout).trim().parse::<u64>().ok()
}

fn start_service(root: &Path, node: &Path, config: &Path) -> Result<(Child, u16, String), String> {
    let script = root.join("host").join("desktop.js");
    if !script.is_file() {
        return Err(format!("CodeChecker service is missing ({})", script.display()));
    }
    let mut cmd = Command::new(node);
    if let Some(mb) = heap_limit_mb(node) {
        cmd.arg(format!("--max-old-space-size={mb}"));
    }
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
    HostInfo { port: host.port, token: host.token.clone(), platform: platform_name().to_string(), browser_args: host.browser_args.clone() }
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
    let mut script = format!("window.__MCC_HOST__={{port:{port},token:\"{token}\",platform:\"{}\"}};", platform_name());
    // Launched by double-clicking a project file: the page opens it after boot.
    if let Some(file) = project_file_arg(std::env::args().skip(1)) {
        script.push_str(&format!("window.__MCC_OPEN__={};", serde_json::to_string(&file).unwrap_or_else(|_| "null".into())));
    }
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()));
    // `npm start` gets its own WebView2 profile: sharing the installed app's
    // profile fails with 0x800700AA (resource in use) while that app is open.
    // It is set for the whole process (WEBVIEW2_USER_DATA_FOLDER), not as the
    // main window's data_directory: popups and dialogs are windows of their
    // own, and WebView2 refuses (0x8007139F) a window whose profile differs
    // from the main window's. An end-to-end check may set its own folder.
    if cfg!(debug_assertions) && std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        if let Ok(dir) = app.path().app_local_data_dir() {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", dir.join("EBWebView-dev"));
        }
    }
    // MCC_CDP_PORT (debug builds): a CDP port for end-to-end checks, with
    // WebView2's default arguments kept.
    let mut browser_args = None;
    if cfg!(debug_assertions) {
        if let Some(cdp) = std::env::var("MCC_CDP_PORT").ok().filter(|p| p.chars().all(|c| c.is_ascii_digit()) && !p.is_empty()) {
            let args = format!("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={cdp}");
            builder = builder.additional_browser_args(&args);
            browser_args = Some(args);
        }
    }
    app.manage(Host { port, token, child: Mutex::new(Some(child)), browser_args });
    let win = builder
        .title("MyCodeChecker")
        // The toolbar needs ~1290 px with English labels while an analysis runs
        // (the "Analyzing…" spinner); narrower, it clips the panel buttons.
        .inner_size(1360.0, 840.0)
        .min_inner_size(1320.0, 640.0)
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

/// The first existing *.mccp path among the command-line arguments.
fn project_file_arg<I: Iterator<Item = String>>(args: I) -> Option<String> {
    args.map(|a| a.trim_matches('"').to_string())
        .find(|a| a.to_lowercase().ends_with(".mccp") && Path::new(a).is_file())
        .map(|a| normalize(&std::fs::canonicalize(&a).unwrap_or_else(|_| PathBuf::from(&a))).to_string_lossy().into_owned())
}

/// Hand a project file to the running page (macOS "open with", files opened later).
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn open_in_page(app: &tauri::AppHandle, file: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let path = serde_json::to_string(file).unwrap_or_else(|_| "null".into());
        let _ = win.eval(&format!("window.__MCC_OPEN__={path};window.dispatchEvent(new CustomEvent('mcc-open-project',{{detail:{path}}}));"));
        let _ = win.show();
        let _ = win.set_focus();
    }
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
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let RunEvent::Opened { urls } = &event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let text = path.to_string_lossy().into_owned();
                        if text.to_lowercase().ends_with(".mccp") { open_in_page(app, &text); }
                    }
                }
            }
            if matches!(event, RunEvent::Exit) { kill_host(app); }
        });
}
