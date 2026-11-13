// TTS Multi OS — the Tauri program. It owns the window (frameless: the page's menu bar row
// is the title bar), the file dialogs, the clipboard and native message boxes; everything
// else goes to the Node host (src/host/host.mjs), which runs the TTS engine unchanged from
// the Electron build (onnxruntime-node, sherpa-onnx-node). The page talks to both through one
// command, `tts`, named by the old Electron IPC channel (src/web/tauri-bridge.js).
//
// If a native addon kills the host, a new one is started and the page is told; the new host
// reports what was running (appLog's crash marker) and offers to download the model again.

mod host;

use host::Host;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const MAIN: &str = "main";
const GUIDE: &str = "guide";
const DATA_FOLDER: &str = "TTSMultiOSV10";
/// The toolbar must never be cut off: its measured width plus a margin (see styles.css #app).
pub const MIN_WIDTH: f64 = 1180.0;
pub const MIN_HEIGHT: f64 = 720.0;
const BRIDGE: &str = include_str!("../../src/web/tauri-bridge.js");

struct AppState {
    host: Mutex<Option<Arc<Host>>>,
    quitting: AtomicBool,
    restarts: AtomicU32,
    shown: AtomicBool,
}

fn state(app: &AppHandle) -> &AppState {
    app.state::<AppState>().inner()
}

fn host(app: &AppHandle) -> Result<Arc<Host>, String> {
    state(app).host.lock().unwrap().clone().ok_or_else(|| "음성 엔진(Node 호스트)이 아직 준비되지 않았습니다.".to_string())
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ── Folders ──────────────────────────────────────────────────
/// TTS_CONFIG_DIR points tests at a scratch folder: the host then keeps its models, logs
/// and settings in <dir>/TTSMultiOSV10 and the webview its storage in <dir>/webview.
fn test_config_dir() -> Option<PathBuf> {
    std::env::var_os("TTS_CONFIG_DIR").filter(|v| !v.is_empty()).map(PathBuf::from)
}

/// \\?\C:\… → C:\… (Node cannot start a script given as a verbatim path).
fn plain_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
}

fn node_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    std::env::split_paths(&path).map(|d| d.join(name)).find(|c| c.is_file())
}

/// Release builds run the bundled runtime and host (resources/sidecar, with its own
/// node_modules); debug builds the project's src/host with the Node on PATH.
fn host_launch(app: &AppHandle) -> Result<host::Launch, String> {
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let resource_dir = app.path().resource_dir().map(|d| plain_path(&d)).unwrap_or_default();
    let sidecar = resource_dir.join("sidecar");
    let bundled = sidecar.join("src").join("host").join("host.mjs");
    let (bundled_node, script) = if cfg!(debug_assertions) || !bundled.is_file() {
        let root = plain_path(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
        (None, root.join("src").join("host").join("host.mjs"))
    } else {
        (Some(sidecar.join(node_name)).filter(|p| p.is_file()), bundled)
    };
    let node = std::env::var_os("TTS_NODE")
        .map(PathBuf::from)
        .or(bundled_node)
        .or_else(node_on_path)
        .ok_or("Node.js 를 찾지 못했습니다. Node.js 를 설치하거나, 설치 프로그램으로 설치한 TTS Multi OS 를 실행하세요 (Node 가 함께 들어 있습니다).")?;
    let mut env = vec![
        ("TTS_VERSION".to_string(), app.package_info().version.to_string()),
        ("TTS_TAURI".to_string(), tauri::VERSION.to_string()),
    ];
    // The host's data folder is %APPDATA%\TTSMultiOSV10 (src/core/appLog.js, modelStore.js).
    if let Some(dir) = test_config_dir() {
        env.push(("APPDATA".into(), dir.to_string_lossy().to_string()));
        env.push(("HOME".into(), dir.to_string_lossy().to_string()));
    }
    Ok(host::Launch { node, script, env })
}

// ── Host lifetime ────────────────────────────────────────────
/// Starts the host; resolves once it is ready. A host that dies is replaced.
async fn start_host(app: &AppHandle) -> Result<(), String> {
    let launch = host_launch(app)?;
    let msg_app = app.clone();
    let exit_app = app.clone();
    let (h, ready) = Host::start(
        launch,
        Arc::new(move |msg| on_host_message(&msg_app, msg)),
        Box::new(move || on_host_exit(&exit_app)),
    )?;
    *state(app).host.lock().unwrap() = Some(h);
    match tokio::time::timeout(Duration::from_secs(30), ready).await {
        Ok(Ok(())) => Ok(()),
        _ => Err("음성 엔진(Node 호스트)이 시작되지 않았습니다.".into()),
    }
}

fn on_host_exit(app: &AppHandle) {
    let st = state(app);
    st.host.lock().unwrap().take();
    if st.quitting.load(Ordering::SeqCst) {
        return;
    }
    let n = st.restarts.fetch_add(1, Ordering::SeqCst) + 1;
    emit(
        app,
        "app:error",
        json!({
            "title": "음성 엔진이 비정상 종료되었습니다.",
            "detail": format!("TTS 엔진을 실행하던 Node 프로세스가 끝났습니다 (네이티브 모델 코드의 오류일 수 있습니다).\n음성 엔진을 다시 시작합니다 ({n}번째).\n\n방금 쓰던 모델이 손상되었으면 다시 시작한 엔진이 모델 삭제 후 다시 받기를 제안합니다."),
        }),
    );
    if n > 5 {
        return; // something is badly wrong: do not loop forever
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        match start_host(&app).await {
            Ok(()) => emit(&app, "app:hostRestarted", Value::Null),
            Err(e) => emit(&app, "app:error", json!({ "title": "음성 엔진을 다시 시작하지 못했습니다.", "detail": e })),
        }
    });
}

/// webContents.send: one event for the page, `tts:event` with { ch, p }.
fn emit(app: &AppHandle, channel: &str, payload: Value) {
    let _ = app.emit_to(MAIN, "tts:event", json!({ "ch": channel, "p": payload }));
}

fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn on_host_message(app: &AppHandle, msg: Value) {
    match msg.get("t").and_then(Value::as_str) {
        Some("emit") => emit(app, &text(&msg, "ch"), msg.get("p").cloned().unwrap_or(Value::Null)),
        Some("call") => {
            let id = msg.get("id").and_then(Value::as_u64).unwrap_or(0);
            let method = text(&msg, "m");
            let a = msg.get("a").cloned().unwrap_or(Value::Null);
            let app = app.clone();
            // Message boxes block: never on the reader thread.
            std::thread::spawn(move || {
                let result = host_call(&app, &method, &a);
                if let Ok(h) = host(&app) {
                    h.reply(id, result);
                }
            });
        }
        _ => {}
    }
}

/// What the host may ask of the program: native message boxes (crash recovery at start).
fn host_call(app: &AppHandle, method: &str, a: &Value) -> Result<Value, String> {
    let window = app.get_webview_window(MAIN);
    match method {
        "dialog.message" => {
            let mut d = app.dialog().message(text(a, "message")).title(text(a, "title"));
            d = d.kind(if text(a, "kind") == "error" { MessageDialogKind::Error } else { MessageDialogKind::Info });
            if let Some(w) = &window {
                d = d.parent(w);
            }
            d.blocking_show();
            Ok(Value::Null)
        }
        "dialog.ask" => {
            let mut d = app
                .dialog()
                .message(text(a, "message"))
                .title(text(a, "title"))
                .kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCancelCustom(text(a, "ok"), text(a, "cancel")));
            if let Some(w) = &window {
                d = d.parent(w);
            }
            Ok(json!(d.blocking_show()))
        }
        _ => Err(format!("unknown call: {method}")),
    }
}

// ── File helpers (dialogs run off the async runtime: they block) ───────
fn sanitize_base_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || (c as u32) < 0x20 { '_' } else { c })
        .collect();
    let joined = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if joined.is_empty() { "tts-output".into() } else { joined }
}

fn audio_format(value: &str) -> &'static str {
    if value.eq_ignore_ascii_case("mp3") { "mp3" } else { "wav" }
}

/// The chosen path with an extension, and the format that extension names.
fn audio_target(path: &Path, preferred: &str) -> (PathBuf, &'static str) {
    match path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("mp3") => (path.to_path_buf(), "mp3"),
        Some("wav") => (path.to_path_buf(), "wav"),
        Some(_) => (path.to_path_buf(), audio_format(preferred)),
        None => {
            let format = audio_format(preferred);
            (path.with_extension(format), format)
        }
    }
}

fn is_text_file(path: &Path) -> bool {
    matches!(path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref(), None | Some("txt") | Some("md") | Some("text"))
}

/// Windows lets one program open the clipboard at a time; another program holding it makes
/// a single attempt fail. Try for about half a second before giving up.
fn with_clipboard_retry<T, E: std::fmt::Display>(mut f: impl FnMut() -> Result<T, E>) -> Result<T, String> {
    let mut last = String::new();
    for attempt in 0..10 {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) => last = e.to_string(),
        }
        std::thread::sleep(Duration::from_millis(20 + attempt * 10));
    }
    Err(format!("클립보드를 사용할 수 없습니다: {last}"))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(err)
}

fn save_dialog(window: &WebviewWindow, file_name: &str, filters: &[(&str, &[&str])]) -> Option<PathBuf> {
    let mut d = window.dialog().file().set_parent(window).set_file_name(file_name);
    for (name, ext) in filters {
        d = d.add_filter(*name, ext);
    }
    d.blocking_save_file().and_then(|p| p.into_path().ok())
}

// ── The one command ──────────────────────────────────────────
#[tauri::command]
async fn tts(app: AppHandle, window: WebviewWindow, ch: String, a: Value) -> Result<Value, String> {
    match ch.as_str() {
        // The page has drawn its first frame: show the window (it was created hidden, no white flash).
        "app:ready" => {
            reveal(&window);
            Ok(Value::Null)
        }
        "win:control" => {
            match a.as_str().unwrap_or_default() {
                "minimize" => window.minimize().map_err(err)?,
                "toggleMaximize" => {
                    if window.is_maximized().unwrap_or(false) { window.unmaximize().map_err(err)? } else { window.maximize().map_err(err)? }
                }
                // The bottom-right grip: the system's own sizing loop (min size and snapping apply).
                "startResize" => {
                    if !window.is_maximized().unwrap_or(false) {
                        window.as_ref().window().start_resize_dragging(tauri_runtime::ResizeDirection::SouthEast).map_err(err)?;
                    }
                }
                "close" => {
                    state(&app).quitting.store(true, Ordering::SeqCst);
                    window.close().map_err(err)?
                }
                other => return Err(format!("unknown window action: {other}")),
            }
            Ok(json!({ "maximized": window.is_maximized().unwrap_or(false) }))
        }
        "win:state" => Ok(json!({ "maximized": window.is_maximized().unwrap_or(false) })),
        // macOS / Linux title-bar drags (Windows moves by the CSS app-region itself).
        "win:startDragging" => {
            window.start_dragging().map_err(err)?;
            Ok(Value::Null)
        }
        "win:devtools" => {
            if window.is_devtools_open() { window.close_devtools() } else { window.open_devtools() }
            Ok(Value::Null)
        }
        "app:copyText" => {
            let value = a.as_str().map(str::to_string).unwrap_or_else(|| a.to_string());
            let length = value.chars().count();
            let app2 = app.clone();
            blocking(move || with_clipboard_retry(|| app2.clipboard().write_text(value.clone()))).await??;
            Ok(json!({ "ok": true, "length": length }))
        }
        "app:readClipboard" => {
            let app2 = app.clone();
            // Empty or non-text clipboard: "" (paste does nothing).
            Ok(json!(blocking(move || with_clipboard_retry(|| app2.clipboard().read_text())).await?.unwrap_or_default()))
        }
        // The user guide / tutorial: its own window (guide.html), reused when already open.
        "app:openGuide" => {
            let doc = if text(&a, "doc") == "tutorial" { "tutorial" } else { "guide" };
            let lang = if text(&a, "lang") == "en" { "en" } else { "ko" };
            if let Some(w) = app.get_webview_window(GUIDE) {
                let _ = w.eval(&format!("window.__openGuide && window.__openGuide({{ doc: '{doc}', lang: '{lang}' }})"));
                if w.is_minimized().unwrap_or(false) {
                    let _ = w.unminimize();
                }
                let _ = w.show();
                let _ = w.set_focus();
                return Ok(Value::Null);
            }
            let mut b = WebviewWindowBuilder::new(&app, GUIDE, WebviewUrl::App(format!("guide.html?doc={doc}&lang={lang}").into()))
                .title(if lang == "en" { "TTS Multi OS — User's Guide" } else { "TTS Multi OS — 사용 설명서" })
                .inner_size(1180.0, 840.0)
                .min_inner_size(720.0, 480.0)
                .center();
            if let Some(dir) = test_config_dir() {
                b = b.data_directory(dir.join("webview")); // every window of one profile shares its folder
            }
            b.build().map_err(err)?;
            Ok(Value::Null)
        }
        "app:selectAudioPath" => {
            let preferred = audio_format(&text(&a, "format")).to_string();
            let base = sanitize_base_name(&text(&a, "baseName"));
            let w = window.clone();
            let name = format!("{base}.{preferred}");
            let chosen = blocking(move || save_dialog(&w, &name, &[("Audio Files", &["wav", "mp3"]), ("WAV Audio", &["wav"]), ("MP3 Audio", &["mp3"])])).await?;
            Ok(match chosen {
                Some(path) => {
                    let (path, format) = audio_target(&path, &preferred);
                    json!({ "filePath": path.to_string_lossy(), "format": format })
                }
                None => Value::Null,
            })
        }
        "app:selectWavPath" | "app:selectMp3Path" => {
            let ext = if ch == "app:selectMp3Path" { "mp3" } else { "wav" };
            let w = window.clone();
            let chosen = blocking(move || save_dialog(&w, &format!("tts-output.{ext}"), &[(if ext == "mp3" { "MP3 Audio" } else { "WAV Audio" }, &[ext])])).await?;
            Ok(chosen.map(|p| json!(p.to_string_lossy())).unwrap_or(Value::Null))
        }
        "app:openTextFile" => {
            let w = window.clone();
            let chosen = blocking(move || {
                w.dialog()
                    .file()
                    .set_parent(&w)
                    .set_title("텍스트 파일 열기")
                    .add_filter("Text Files", &["txt", "md"])
                    .add_filter("All Files", &["*"])
                    .blocking_pick_file()
                    .and_then(|p| p.into_path().ok())
            })
            .await?;
            let Some(path) = chosen else { return Ok(Value::Null) };
            let content = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            Ok(json!({ "content": content, "filePath": path.to_string_lossy() }))
        }
        // Reopening a file from the recent list: only text files the user opened before.
        "app:readTextFile" => {
            let path = PathBuf::from(a.as_str().unwrap_or_default());
            if path.as_os_str().is_empty() || !is_text_file(&path) {
                return Err("텍스트 파일만 열 수 있습니다.".into());
            }
            let content = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            Ok(json!({ "content": content, "filePath": path.to_string_lossy() }))
        }
        _ => host(&app)?.request(&ch, a).await,
    }
}

// ── The window ───────────────────────────────────────────────
fn reveal(window: &WebviewWindow) {
    if state(window.app_handle()).shown.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = window.show();
    let _ = window.set_focus();
}

fn create_main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let mut b = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("TTS Multi OS")
        // MyUMLMaker look: no system title bar; the menu bar row is the title bar.
        .decorations(false)
        .inner_size(1520.0, 910.0)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .resizable(true)
        .maximizable(true)
        .center()
        .visible(false)
        .initialization_script(BRIDGE);
    if let Some(dir) = test_config_dir() {
        b = b.data_directory(dir.join("webview"));
    }
    let window = b.build().map_err(err)?;
    let w = window.clone();
    window.on_window_event(move |event| {
        // The main window gone means the program ends, also when the guide window is still open.
        if let tauri::WindowEvent::Destroyed = event {
            state(w.app_handle()).quitting.store(true, Ordering::SeqCst);
            w.app_handle().exit(0);
            return;
        }
        if let tauri::WindowEvent::Resized(_) = event {
            let maximized = w.is_maximized().unwrap_or(false);
            emit(w.app_handle(), "win:stateChanged", json!({ "maximized": maximized }));
            // Aero Snap and other programs can size a window below its minimum; the toolbar would wrap.
            if !maximized && !w.is_minimized().unwrap_or(false) {
                if let (Ok(size), Ok(scale)) = (w.inner_size(), w.scale_factor()) {
                    let logical = size.to_logical::<f64>(scale);
                    if logical.width + 0.5 < MIN_WIDTH || logical.height + 0.5 < MIN_HEIGHT {
                        let _ = w.set_size(LogicalSize::new(logical.width.max(MIN_WIDTH), logical.height.max(MIN_HEIGHT)));
                    }
                }
            }
        }
    });
    // A page that never says it is ready (script error) still gets a window.
    let late = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(4)).await;
        reveal(&late);
    });
    Ok(window)
}

fn fatal(app: &AppHandle, message: String) {
    app.dialog().message(message).title("TTS Multi OS").kind(MessageDialogKind::Error).blocking_show();
    app.exit(1);
}

// ── Start ────────────────────────────────────────────────────
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState { host: Mutex::new(None), quitting: AtomicBool::new(false), restarts: AtomicU32::new(0), shown: AtomicBool::new(false) })
        .invoke_handler(tauri::generate_handler![tts])
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(dir) = test_config_dir() {
                let _ = std::fs::create_dir_all(dir.join(DATA_FOLDER));
            }
            // Windows are created off the setup hook and off sync commands: WebView2 needs the
            // event loop running (creating one in a blocking context leaves about:blank).
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_host(&handle).await {
                    let h = handle.clone();
                    std::thread::spawn(move || fatal(&h, e));
                    return;
                }
                if let Err(e) = create_main_window(&handle) {
                    let h = handle.clone();
                    std::thread::spawn(move || fatal(&h, format!("창을 열지 못했습니다: {e}")));
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building TTS Multi OS")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                state(app).quitting.store(true, Ordering::SeqCst);
                if let Some(h) = state(app).host.lock().unwrap().take() {
                    h.stop();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_targets_get_an_extension_and_a_format() {
        assert_eq!(audio_target(Path::new("C:/a/b"), "mp3"), (PathBuf::from("C:/a/b.mp3"), "mp3"));
        assert_eq!(audio_target(Path::new("C:/a/b.WAV"), "mp3"), (PathBuf::from("C:/a/b.WAV"), "wav"));
        assert_eq!(audio_target(Path::new("C:/a/b.mp3"), "wav"), (PathBuf::from("C:/a/b.mp3"), "mp3"));
        assert_eq!(audio_target(Path::new("C:/a/b.ogg"), "x"), (PathBuf::from("C:/a/b.ogg"), "wav"));
    }

    #[test]
    fn base_names_are_safe() {
        assert_eq!(sanitize_base_name("a/b:c  d"), "a_b_c d");
        assert_eq!(sanitize_base_name("   "), "tts-output");
        assert_eq!(sanitize_base_name("음성 2026"), "음성 2026");
    }

    #[test]
    fn clipboard_retries_while_another_program_holds_it() {
        let mut calls = 0;
        let r = with_clipboard_retry(|| { calls += 1; if calls < 3 { Err("occupied") } else { Ok(calls) } });
        assert_eq!(r, Ok(3));
        let never: Result<(), String> = with_clipboard_retry(|| Err::<(), _>("occupied"));
        assert!(never.unwrap_err().contains("occupied"));
    }

    #[test]
    fn only_text_files_reopen() {
        assert!(is_text_file(Path::new("x.txt")) && is_text_file(Path::new("x.MD")) && is_text_file(Path::new("README")));
        assert!(!is_text_file(Path::new("x.exe")) && !is_text_file(Path::new("x.wav")));
        assert_eq!(plain_path(Path::new(r"\\?\C:\x\y")), PathBuf::from(r"C:\x\y"));
    }
}
