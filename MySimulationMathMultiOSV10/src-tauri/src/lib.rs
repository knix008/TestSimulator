// Tauri shell: one frameless main window, the file-system API the engine
// uses (host.rs, 127.0.0.1 + token), the window position / size kept
// between runs, and the optional per-user .m file association (Windows).
mod host;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const DEFAULT_W: f64 = 1440.0;
const DEFAULT_H: f64 = 900.0;
// The title bar / ribbon must fit without clipping (measured with English labels).
const MIN_W: f64 = 1024.0;
const MIN_H: f64 = 640.0;
const OPEN_EXTS: [&str; 5] = [".m", ".msim", ".smdl", ".mat", ".mlx"];

struct HostState {
    port: u16,
    token: String,
    start: String,
}

#[derive(Serialize)]
struct HostInfo {
    port: u16,
    token: String,
    platform: String,
    start: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Default)]
struct WinState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

struct WinMemory {
    file: PathBuf,
    state: Mutex<Option<WinState>>,
}

fn config_dir() -> PathBuf {
    if let Some(over) = std::env::var_os("MSM_USER_DATA") {
        return PathBuf::from(over);
    }
    let home = host::home_dir();
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Roaming"))
    } else if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support")
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".config"))
    };
    base.join("MySimulationMath")
}

#[tauri::command]
fn host_info(state: tauri::State<'_, HostState>) -> HostInfo {
    HostInfo { port: state.port, token: state.token.clone(), platform: host::platform_name().to_string(), start: state.start.clone() }
}

#[tauri::command]
fn renderer_ready(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

// ── .m association (Windows, current user) ─────────────────
#[cfg(windows)]
fn reg(args: &[&str]) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("reg").args(args).creation_flags(0x08000000).output().ok()?;
    if out.status.success() { Some(String::from_utf8_lossy(&out.stdout).into_owned()) } else { None }
}

#[tauri::command]
fn m_association() -> bool {
    #[cfg(windows)]
    {
        return reg(&["query", r"HKCU\Software\Classes\.m", "/ve"]).map(|t| t.contains("MySimulationMath.MFile")).unwrap_or(false);
    }
    #[allow(unreachable_code)]
    false
}

#[tauri::command]
fn set_m_association(app: tauri::AppHandle, on: bool) -> bool {
    #[cfg(windows)]
    {
        let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        if on {
            let icon = app.path().resource_dir().map(|d| d.join("m.ico").to_string_lossy().into_owned()).unwrap_or_else(|_| format!("{exe},0"));
            let command = format!("\"{exe}\" \"%1\"");
            let ok = reg(&["add", r"HKCU\Software\Classes\MySimulationMath.MFile", "/ve", "/d", "M language file", "/f"]).is_some()
                && reg(&["add", r"HKCU\Software\Classes\MySimulationMath.MFile\DefaultIcon", "/ve", "/d", &icon, "/f"]).is_some()
                && reg(&["add", r"HKCU\Software\Classes\MySimulationMath.MFile\shell\open\command", "/ve", "/d", &command, "/f"]).is_some()
                && reg(&["add", r"HKCU\Software\Classes\.m", "/ve", "/d", "MySimulationMath.MFile", "/f"]).is_some();
            return ok;
        }
        if m_association() {
            let _ = reg(&["delete", r"HKCU\Software\Classes\.m", "/ve", "/f"]);
        }
        let _ = reg(&["delete", r"HKCU\Software\Classes\MySimulationMath.MFile", "/f"]);
        return true;
    }
    #[allow(unreachable_code)]
    {
        let _ = (app, on);
        false
    }
}

// ── Files given on the command line ────────────────────────
fn open_file_args<I: Iterator<Item = String>>(args: I) -> Vec<String> {
    args.map(|a| a.trim_matches('"').to_string())
        .filter(|a| {
            let low = a.to_lowercase();
            OPEN_EXTS.iter().any(|e| low.ends_with(e)) && Path::new(a).is_file()
        })
        .map(|a| host::slash(&fs::canonicalize(&a).unwrap_or_else(|_| PathBuf::from(&a))))
        .collect()
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn open_in_page(app: &tauri::AppHandle, file: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let path = serde_json::to_string(file).unwrap_or_else(|_| "null".into());
        let _ = win.eval(&format!("window.dispatchEvent(new CustomEvent('msm-open-file',{{detail:{path}}}));"));
        let _ = win.show();
        let _ = win.set_focus();
    }
}

// ── Window position / size ─────────────────────────────────
fn load_win_state(file: &Path) -> Option<WinState> {
    let s: WinState = serde_json::from_str(&fs::read_to_string(file).ok()?).ok()?;
    if s.width < 200 || s.height < 150 { None } else { Some(s) }
}

/// Copies the window's current rectangle into memory (normal state only).
fn remember_win_state(app: &tauri::AppHandle) {
    let (Some(mem), Some(win)) = (app.try_state::<WinMemory>(), app.get_webview_window("main")) else { return };
    let Ok(mut slot) = mem.state.lock() else { return };
    let mut s = slot.unwrap_or_default();
    s.maximized = win.is_maximized().unwrap_or(false);
    if !s.maximized && !win.is_minimized().unwrap_or(false) {
        if let (Ok(p), Ok(z)) = (win.outer_position(), win.inner_size()) {
            if z.width > 0 && z.height > 0 {
                s.x = p.x;
                s.y = p.y;
                s.width = z.width;
                s.height = z.height;
            }
        }
    }
    *slot = Some(s);
}

/// Writes the remembered rectangle (the window may already be gone).
fn save_win_state(app: &tauri::AppHandle) {
    let Some(mem) = app.try_state::<WinMemory>() else { return };
    let Some(s) = mem.state.lock().ok().and_then(|slot| *slot) else { return };
    if s.width == 0 || s.height == 0 {
        return;
    }
    if let Some(parent) = mem.file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&mem.file, serde_json::to_string(&s).unwrap_or_default());
}

/// True when the saved rectangle still overlaps a monitor (screens change).
fn on_some_monitor(win: &tauri::WebviewWindow, s: &WinState) -> bool {
    let Ok(monitors) = win.available_monitors() else { return false };
    monitors.iter().any(|m| {
        let p = m.position();
        let z = m.size();
        let (x0, y0, x1, y1) = (p.x, p.y, p.x + z.width as i32, p.y + z.height as i32);
        s.x + 80 < x1 && s.x + s.width as i32 - 80 > x0 && s.y >= y0 - 20 && s.y + 40 < y1
    })
}

fn boot(app: &mut tauri::App) -> Result<(), String> {
    let config = config_dir();
    let _ = fs::create_dir_all(&config);
    let version = app.package_info().version.to_string();
    let server = host::start(config.clone(), &version)?;
    let mut script = format!(
        "window.__MSM_HOST__={{port:{},token:\"{}\",platform:\"{}\",start:{}}};",
        server.port,
        server.token,
        host::platform_name(),
        serde_json::to_string(&server.start).unwrap_or_else(|_| "\"\"".into())
    );
    let files = open_file_args(std::env::args().skip(1));
    if !files.is_empty() {
        script.push_str(&format!("window.__MSM_OPEN__={};", serde_json::to_string(&files).unwrap_or_else(|_| "[]".into())));
    }
    app.manage(HostState { port: server.port, token: server.token.clone(), start: server.start.clone() });
    let state_file = config.join("window-state.json");
    let saved = load_win_state(&state_file);
    app.manage(WinMemory { file: state_file, state: Mutex::new(saved) });

    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()));
    // `npm start` gets its own WebView2 profile: sharing the installed app's
    // profile fails with 0x800700AA (resource in use) while that app is open.
    if cfg!(debug_assertions) {
        if let Ok(dir) = app.path().app_local_data_dir() {
            builder = builder.data_directory(dir.join("EBWebView-dev"));
        }
    }
    let win = builder
        .title("MySimulationMath")
        .inner_size(DEFAULT_W, DEFAULT_H)
        .min_inner_size(MIN_W, MIN_H)
        .decorations(false)
        .resizable(true)
        .visible(false)
        .center()
        .initialization_script(&script)
        .build()
        .map_err(|err| err.to_string())?;
    if let Some(s) = saved {
        if on_some_monitor(&win, &s) {
            let _ = win.set_size(PhysicalSize::new(s.width, s.height));
            let _ = win.set_position(PhysicalPosition::new(s.x, s.y));
        }
        if s.maximized {
            let _ = win.maximize();
        }
    }
    let handle = app.handle().clone();
    remember_win_state(app.handle());
    win.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => remember_win_state(&handle),
        WindowEvent::CloseRequested { .. } => { remember_win_state(&handle); save_win_state(&handle); }
        WindowEvent::Destroyed => save_win_state(&handle),
        _ => {}
    });
    // Shown by renderer_ready after the first paint; this is the safety net.
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(6));
        if let Some(w) = handle.get_webview_window("main") {
            let _ = w.show();
        }
    });
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![host_info, renderer_ready, m_association, set_m_association])
        .setup(|app| {
            if let Err(err) = boot(app) {
                eprintln!("{err}");
                return Err(Box::new(std::io::Error::other(err)));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MySimulationMath")
        .run(|app, event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let RunEvent::Opened { urls } = &event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let text = host::slash(&path);
                        let low = text.to_lowercase();
                        if OPEN_EXTS.iter().any(|e| low.ends_with(e)) { open_in_page(app, &text); }
                    }
                }
            }
            if matches!(event, RunEvent::Exit) {
                save_win_state(app);
            }
        });
}
