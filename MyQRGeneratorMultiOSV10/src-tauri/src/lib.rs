//! The desktop shell: one window, plus the commands the page calls through
//! `window.__TAURI__.core.invoke` (see src/js/encoder.js and src/js/platform.js).
//!
//! Environment variables for tests:
//! - `QRGEN_CONFIG_DIR`: settings folder instead of the per-user app config folder.
//! - `QRGEN_SAVE_DIR`: save exports there without showing the save dialog.
//! - `QRGEN_DEBUG_PORT`: WebView2 DevTools protocol port (Windows).
//! - `QRGEN_WEBVIEW_DIR`: separate WebView2 profile, so a test instance can run beside the
//!   user's copy (WebView2 refuses a second process with other options on the same profile).

mod menu;
mod placement;

use base64::{engine::general_purpose::STANDARD, Engine};
use placement::{Placement, Rect};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;

/// One renderer process and no GPU process keep the memory use small.
#[cfg(windows)]
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --process-per-site --renderer-process-limit=1 --disable-gpu";

const SETTINGS_FILE: &str = "settings.json";
const WINDOW_FILE: &str = "window.json";

/// The folder of the last export, offered again by the next save dialog.
#[derive(Default)]
struct LastDir(Mutex<Option<PathBuf>>);

#[tauri::command]
fn qr_encode(text: String, ecc: u32, min_version: u32, max_version: u32, mask: i32, flags: u32) -> String {
  qrcore::encode_json(&text, ecc, min_version, max_version, mask, flags)
}

/// Keeps a suggested file name to one plain component with the right extension.
fn safe_file_name(name: &str, ext: &str) -> String {
  // Not Path::file_stem: on Windows "a:b" would be read as a drive prefix.
  let base = name.rsplit(['/', '\\']).next().unwrap_or_default();
  let base = base.rsplit_once('.').map_or(base, |(stem, _)| stem);
  let stem: String = base
    .chars()
    .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
    .collect();
  let stem = stem.trim().trim_matches('.');
  format!("{}.{ext}", if stem.is_empty() { "qrcode" } else { stem })
}

/// Extensions the page may save (raster ones arrive through `export_image` instead).
const VECTOR_EXTENSIONS: [&str; 3] = ["svg", "pdf", "eps"];

/// Asks where to save (or uses QRGEN_SAVE_DIR) and writes the bytes. None = cancelled.
fn save_bytes(window: &WebviewWindow, last_dir: &LastDir, ext: &str, name: &str, bytes: &[u8]) -> Result<Option<String>, String> {
  let name = safe_file_name(name, ext);
  let path = match std::env::var_os("QRGEN_SAVE_DIR") {
    Some(dir) => PathBuf::from(dir).join(&name),
    None => {
      let mut dialog = window.dialog().file().set_parent(window).set_file_name(&name).add_filter(ext.to_uppercase(), &[ext]);
      if let Some(dir) = last_dir.0.lock().unwrap().clone() {
        dialog = dialog.set_directory(dir);
      }
      match dialog.blocking_save_file() {
        Some(picked) => picked.into_path().map_err(|e| e.to_string())?,
        None => return Ok(None),
      }
    }
  };
  std::fs::write(&path, bytes).map_err(|e| format!("{}: {e}", path.display()))?;
  if let Some(parent) = path.parent() {
    *last_dir.0.lock().unwrap() = Some(parent.to_path_buf());
  }
  Ok(Some(path.display().to_string()))
}

/// SVG, PDF and EPS, written by the page.
#[tauri::command]
async fn save_export(window: WebviewWindow, last_dir: State<'_, LastDir>, kind: String, name: String, data: String) -> Result<Option<String>, String> {
  let ext = VECTOR_EXTENSIONS.iter().find(|&&e| e == kind).ok_or_else(|| format!("unknown export kind: {kind}"))?;
  let bytes = STANDARD.decode(data.as_bytes()).map_err(|e| e.to_string())?;
  save_bytes(&window, &last_dir, ext, &name, &bytes)
}

/// Raster export: the body is the raw RGBA pixels (binary IPC, no base64); the headers say
/// x-format, x-width, x-height, x-quality, x-background (RRGGBB) and x-name.
#[tauri::command]
async fn export_image(window: WebviewWindow, last_dir: State<'_, LastDir>, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
  let tauri::ipc::InvokeBody::Raw(rgba) = request.body() else {
    return Err("expected raw RGBA pixels".into());
  };
  let header = |key: &str| request.headers().get(key).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
  let number = |key: &str| header(key).parse::<u32>().map_err(|_| format!("bad {key}"));
  let format = qrimage::Format::from_name(&header("x-format")).ok_or_else(|| format!("unknown format {}", header("x-format")))?;
  let background = u32::from_str_radix(&header("x-background"), 16).unwrap_or(0xffffff);
  let bytes = qrimage::encode(
    rgba,
    number("x-width")?,
    number("x-height")?,
    format,
    number("x-quality").unwrap_or(92).min(100) as u8,
    [(background >> 16) as u8, (background >> 8) as u8, background as u8],
  )?;
  save_bytes(&window, &last_dir, format.extension(), &header("x-name"), &bytes)
}

#[tauri::command]
async fn copy_image(width: usize, height: usize, rgba: String) -> Result<(), String> {
  let bytes = STANDARD.decode(rgba.as_bytes()).map_err(|e| e.to_string())?;
  if bytes.len() != width * height * 4 {
    return Err(format!("expected {}×{} RGBA pixels, got {} bytes", width, height, bytes.len()));
  }
  let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
  clipboard.set_image(arboard::ImageData { width, height, bytes: bytes.into() }).map_err(|e| e.to_string())
}

#[tauri::command]
async fn copy_text(text: String) -> Result<(), String> {
  let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
  clipboard.set_text(text).map_err(|e| e.to_string())
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
  match std::env::var_os("QRGEN_CONFIG_DIR") {
    Some(dir) => Ok(PathBuf::from(dir)),
    None => app.path().app_config_dir().map_err(|e| e.to_string()),
  }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(config_dir(app)?.join(SETTINGS_FILE))
}

/// The last normal (not maximised or minimised) bounds, written to window.json on close.
#[derive(Default)]
struct WindowBounds(Mutex<Option<Placement>>);

fn work_areas(window: &WebviewWindow) -> Vec<Rect> {
  window
    .available_monitors()
    .unwrap_or_default()
    .iter()
    .map(|m| {
      let a = m.work_area();
      Rect { x: a.position.x, y: a.position.y, width: a.size.width, height: a.size.height }
    })
    .collect()
}

/// Puts the (still hidden) main window where it was last closed, or centres the default size.
fn place_main_window(app: &AppHandle, window: &WebviewWindow) {
  let scale = window.scale_factor().unwrap_or(1.0);
  let min = ((placement::MIN_SIZE.0 * scale) as u32, (placement::MIN_SIZE.1 * scale) as u32);
  let saved = config_dir(app).ok().and_then(|dir| placement::load(&dir.join(WINDOW_FILE)));
  let restored = saved.and_then(|p| placement::restore(p, &work_areas(window), min));
  let target = restored.or_else(|| {
    let area = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten())?.work_area().clone();
    let size = ((placement::DEFAULT_SIZE.0 * scale) as u32, (placement::DEFAULT_SIZE.1 * scale) as u32);
    Some(placement::centered(size, Rect { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height }))
  });
  if let Some(p) = target {
    let _ = window.set_size(PhysicalSize::new(p.width, p.height));
    let _ = window.set_position(PhysicalPosition::new(p.x, p.y));
    *app.state::<WindowBounds>().0.lock().unwrap() = Some(Placement { maximized: false, ..p });
    if p.maximized {
      let _ = window.maximize();
    }
  }
}

/// Keeps the normal bounds up to date and saves them when the window closes.
fn track_main_window(app: &AppHandle, window: &WebviewWindow) {
  let handle = app.clone();
  let win = window.clone();
  window.on_window_event(move |event| match event {
    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
      if win.is_maximized().unwrap_or(false) || win.is_minimized().unwrap_or(false) {
        return;
      }
      if let (Ok(pos), Ok(size)) = (win.outer_position(), win.inner_size()) {
        if size.width > 0 && size.height > 0 {
          *handle.state::<WindowBounds>().0.lock().unwrap() = Some(Placement { x: pos.x, y: pos.y, width: size.width, height: size.height, maximized: false });
        }
      }
    }
    WindowEvent::CloseRequested { .. } => {
      let bounds = *handle.state::<WindowBounds>().0.lock().unwrap();
      if let (Some(bounds), Ok(dir)) = (bounds, config_dir(&handle)) {
        let maximized = win.is_maximized().unwrap_or(false);
        let _ = placement::save(&dir.join(WINDOW_FILE), &Placement { maximized, ..bounds });
      }
      // The popup list would otherwise keep the app running.
      if let Some(menu) = handle.get_webview_window(menu::LABEL) {
        let _ = menu.destroy();
      }
    }
    _ => {}
  });
}

/// The saved settings JSON, or an empty string on first run.
#[tauri::command]
async fn load_settings(app: AppHandle) -> Result<String, String> {
  let path = settings_path(&app)?;
  match std::fs::read_to_string(&path) {
    Ok(text) => Ok(text),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
    Err(e) => Err(e.to_string()),
  }
}

/// Writes through a temporary file so a crash never leaves half a settings file.
#[tauri::command]
async fn save_settings(app: AppHandle, json: String) -> Result<(), String> {
  let path = settings_path(&app)?;
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  let tmp = path.with_extension("json.tmp");
  std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
  std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// The page has drawn its first frame; show the window (it starts hidden to avoid a white flash).
#[tauri::command]
fn app_ready(window: WebviewWindow) {
  if !window.is_visible().unwrap_or(true) {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

pub(crate) fn webview_dir() -> Option<PathBuf> {
  std::env::var_os("QRGEN_WEBVIEW_DIR").map(PathBuf::from)
}

#[cfg(windows)]
fn browser_args() -> String {
  match std::env::var("QRGEN_DEBUG_PORT").ok().and_then(|p| p.trim().parse::<u16>().ok()) {
    Some(port) => format!("{BROWSER_ARGS} --remote-debugging-port={port}"),
    None => BROWSER_ARGS.to_string(),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(LastDir::default())
    .manage(WindowBounds::default())
    .manage(menu::MenuState::default())
    .invoke_handler(tauri::generate_handler![
      qr_encode,
      save_export,
      export_image,
      copy_image,
      copy_text,
      load_settings,
      save_settings,
      app_ready,
      menu::menu_open,
      menu::menu_ready,
      menu::menu_pick,
      menu::menu_close
    ])
    .setup(|app| {
      let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("MyQRGenerator")
        .inner_size(placement::DEFAULT_SIZE.0, placement::DEFAULT_SIZE.1)
        .min_inner_size(placement::MIN_SIZE.0, placement::MIN_SIZE.1)
        .decorations(false)
        .shadow(true)
        .visible(false);
      #[cfg(windows)]
      let builder = builder.additional_browser_args(&browser_args());
      let builder = match webview_dir() {
        Some(dir) => builder.data_directory(dir),
        None => builder,
      };
      let window = builder.build()?;
      let _ = window.set_min_size(Some(LogicalSize::new(placement::MIN_SIZE.0, placement::MIN_SIZE.1)));
      place_main_window(app.handle(), &window);
      track_main_window(app.handle(), &window);
      #[cfg(windows)]
      menu::create(app.handle(), Some(&browser_args()))?;
      #[cfg(not(windows))]
      menu::create(app.handle(), None)?;

      // If the page never reports ready (a script error), show the window anyway.
      std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(8));
        if !window.is_visible().unwrap_or(true) {
          let _ = window.show();
        }
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running MyQRGenerator");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn file_names_stay_in_the_chosen_folder() {
    assert_eq!(safe_file_name("qrcode-url-20261020.png", "png"), "qrcode-url-20261020.png");
    assert_eq!(safe_file_name("../../evil", "svg"), "evil.svg");
    assert_eq!(safe_file_name("a:b*c", "png"), "a_b_c.png");
    assert_eq!(safe_file_name("", "png"), "qrcode.png");
  }

  #[test]
  fn the_command_returns_the_encoder_json() {
    let json = qr_encode("hello".into(), 1, 1, 40, -1, 1);
    assert!(json.starts_with("{\"version\":1,"), "{json}");
  }
}
