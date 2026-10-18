// Tauri shell. The file manager itself stays in core/ and is reached over HTTP:
// this process spawns `node server/server.js` (the same host the browser uses)
// and the page talks to it. Dialogs and extra windows are Tauri's.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Emitter;
use tauri::Manager;

#[derive(Clone, serde::Serialize)]
struct HostConfig {
    origin: String,
    token: String,
    error: String,
}

struct CoreState {
    child: Mutex<Option<Child>>,
    config: HostConfig,
}

#[tauri::command]
fn host_config(state: tauri::State<CoreState>) -> HostConfig {
    state.config.clone()
}

// Relay between the main window and tool windows. BroadcastChannel is not
// reliable across Tauri webviews, so the page posts here and every window listens.
#[tauri::command]
fn bus_post(app: tauri::AppHandle, msg: serde_json::Value) -> Result<(), String> {
    app.emit("cc-bus", msg).map_err(|e| e.to_string())
}

fn project_root() -> PathBuf {
    if let Ok(start) = std::env::current_dir() {
        let mut dir = start;
        for _ in 0..8 {
            if dir.join("server").join("server.js").is_file() {
                return dir;
            }
            if !dir.pop() {
                break;
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn config_dir() -> PathBuf {
    if let Ok(p) = std::env::var("CC_CONFIG_DIR") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    if cfg!(windows) {
        return PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into())).join("Command Center");
    }
    if cfg!(target_os = "macos") {
        return PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into()))
            .join("Library")
            .join("Application Support")
            .join("Command Center");
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let base = std::env::var("XDG_CONFIG_HOME").unwrap_or_else(|_| format!("{home}/.config"));
    PathBuf::from(base).join("Command Center")
}

fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    Ok(port)
}

fn token() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}-{:x}", std::process::id())
}

fn node_program() -> String {
    std::env::var("CC_NODE").unwrap_or_else(|_| "node".into())
}

/// POST /api/app.info until the core accepts a connection, or the process dies.
fn wait_until_ready(origin: &str, token: &str, child: &mut Child) -> Result<(), String> {
    let start = Instant::now();
    let mut last = String::from("core did not start");
    while start.elapsed() < Duration::from_secs(30) {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!("core exited before it was ready ({status})"));
        }
        match probe(origin, token) {
            Ok(()) => return Ok(()),
            Err(err) => last = err,
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    Err(last)
}

fn probe(origin: &str, token: &str) -> Result<(), String> {
    let hostport = origin.trim_start_matches("http://").trim_end_matches('/');
    let (host, port) = hostport.split_once(':').ok_or_else(|| format!("bad origin {origin}"))?;
    let port: u16 = port.parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let mut stream = TcpStream::connect_timeout(
        &format!("{host}:{port}").parse().map_err(|e: std::net::AddrParseError| e.to_string())?,
        Duration::from_millis(400),
    )
    .map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
    let body = "{}";
    let req = format!(
        "POST /api/app.info HTTP/1.1\r\nHost: {hostport}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 64];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let head = String::from_utf8_lossy(&buf[..n]);
    if head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200") {
        Ok(())
    } else {
        Err(format!("core replied {head}"))
    }
}

fn post_shutdown(origin: &str, token: &str) {
    let _ = probe_path(origin, token, "app.shutdown");
}

fn probe_path(origin: &str, token: &str, method: &str) -> Result<(), String> {
    let hostport = origin.trim_start_matches("http://").trim_end_matches('/');
    let (host, port) = match hostport.split_once(':') {
        Some(pair) => pair,
        None => return Err("bad origin".into()),
    };
    let port: u16 = port.parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let mut stream = TcpStream::connect_timeout(
        &format!("{host}:{port}").parse().map_err(|e: std::net::AddrParseError| e.to_string())?,
        Duration::from_secs(2),
    )
    .map_err(|e| e.to_string())?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let body = "{}";
    let req = format!(
        "POST /api/{method} HTTP/1.1\r\nHost: {hostport}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 32];
    let _ = stream.read(&mut buf);
    Ok(())
}

fn start_core() -> (Option<Child>, HostConfig) {
    match start_core_inner() {
        Ok((child, cfg)) => (Some(child), cfg),
        Err(error) => (
            None,
            HostConfig { origin: String::new(), token: String::new(), error },
        ),
    }
}

fn start_core_inner() -> Result<(Child, HostConfig), String> {
    let root = project_root();
    let server = root.join("server").join("server.js");
    if !server.is_file() {
        return Err(format!("server.js not found at {}", server.display()));
    }
    let port = free_port()?;
    let token = token();
    let origin = format!("http://127.0.0.1:{port}");
    let config = config_dir();
    let mut cmd = Command::new(node_program());
    cmd.arg(&server)
        .arg("--port")
        .arg(port.to_string())
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--token")
        .arg(&token)
        .arg("--no-open")
        .current_dir(&root)
        .env("CC_HOST_NAME", "tauri")
        .env("CC_CONFIG_DIR", &config)
        .env("CC_NO_OPEN", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No extra console for the core. Its output still reaches this process when one exists.
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn().map_err(|e| format!("cannot start node ({e}). Install Node.js and leave it on PATH, or set CC_NODE."))?;
    wait_until_ready(&origin, &token, &mut child)?;
    eprintln!("[tauri] core {origin}");
    Ok((
        child,
        HostConfig { origin, token, error: String::new() },
    ))
}

// Tool windows and the theme list are separate windows. Closing the main
// window closes them too, so a viewer or the settings window is not left
// behind after the application is gone.
fn close_popups(window: &tauri::Window) {
    if window.label() != "main" {
        return;
    }
    let app = window.app_handle();
    for (label, popup) in app.webview_windows() {
        if label != "main" {
            let _ = popup.close();
        }
    }
}

// A second process cannot share the first process's WebView2 profile.
// Each launch gets its own folder, named by process id, so several
// Command Center windows can run at the same time.
static WINDOW_SHIFT: AtomicI32 = AtomicI32::new(0);

fn prepare_webview_data_dir() {
    #[cfg(windows)]
    {
        if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some() {
            return;
        }
        let root = std::env::temp_dir().join("CommandCenter-webview");
        let _ = std::fs::create_dir_all(&root);
        let mine = std::process::id();
        let mut others = false;
        if let Ok(entries) = std::fs::read_dir(&root) {
            for entry in entries.flatten() {
                let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else {
                    continue;
                };
                if pid != mine && process_alive(pid) {
                    others = true;
                } else if pid != mine {
                    let _ = std::fs::remove_dir_all(entry.path());
                }
            }
        }
        let dir = root.join(mine.to_string());
        let _ = std::fs::create_dir_all(&dir);
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &dir);
        if others {
            WINDOW_SHIFT.store(32 + ((mine % 5) as i32) * 28, Ordering::Relaxed);
        }
    }
}

#[cfg(windows)]
fn process_alive(pid: u32) -> bool {
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
        fn GetExitCodeProcess(handle: *mut std::ffi::c_void, code: *mut u32) -> i32;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }
    const QUERY: u32 = 0x1000;
    const STILL_ACTIVE: u32 = 259;
    unsafe {
        let handle = OpenProcess(QUERY, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);
        ok != 0 && code == STILL_ACTIVE
    }
}

fn main() {
    prepare_webview_data_dir();
    let (child, config) = start_core();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CoreState { child: Mutex::new(child), config })
        .invoke_handler(tauri::generate_handler![host_config, bus_post])
        .setup(|app| {
            let shift = WINDOW_SHIFT.load(Ordering::Relaxed);
            if shift != 0 {
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(pos) = window.outer_position() {
                        let _ = window.set_position(tauri::PhysicalPosition::new(pos.x + shift, pos.y + shift));
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                close_popups(window);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Command Center")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<CoreState>() {
                    if state.config.error.is_empty() {
                        post_shutdown(&state.config.origin, &state.config.token);
                    }
                    if let Ok(mut slot) = state.child.lock() {
                        if let Some(mut child) = slot.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
