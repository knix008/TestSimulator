// MyMind - Tauri shell.
//
//   * the main window: frameless (the title row is the title bar), shown once the page has applied
//     its theme, at the saved position and size, which it saves on close
//   * settings and diagram files
//   * popout.rs: dialogs as windows of their own
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod popout;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use base64::Engine as _;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN: &str = "main";
/// A page that can answer is listening. Before that, or without it, closing just closes.
static CLOSE_GUARD: AtomicBool = AtomicBool::new(false);
static CLOSE_ALLOWED: AtomicBool = AtomicBool::new(false);
/// A file macOS asked to open (it does not use the command line for that).
static OPENED_FILE: Mutex<Option<String>> = Mutex::new(None);
const SETTINGS_FOLDER: &str = "com.shkwon.mymind";
const MIN_WIDTH: f64 = 900.0;
const MIN_HEIGHT: f64 = 560.0;
const DEFAULT_WIDTH: f64 = 1440.0;
const DEFAULT_HEIGHT: f64 = 900.0;

/// Where settings live; MYMIND_SETTINGS_DIR moves it (the GUI tests).
pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MYMIND_SETTINGS_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    let home = || std::env::var("HOME").unwrap_or_else(|_| ".".into());
    if cfg!(windows) {
        return PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into())).join(SETTINGS_FOLDER);
    }
    if cfg!(target_os = "macos") {
        return PathBuf::from(home()).join("Library").join("Application Support").join(SETTINGS_FOLDER);
    }
    let base = std::env::var("XDG_CONFIG_HOME").unwrap_or_else(|_| format!("{}/.config", home()));
    PathBuf::from(base).join(SETTINGS_FOLDER)
}

fn read_settings_value() -> Value {
    std::fs::read_to_string(data_dir().join("settings.json"))
        .ok()
        .and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_settings_value(settings: &Value) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("settings.json"), text).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_settings() -> Value {
    let mut settings = read_settings_value();
    with_installer_language(&mut settings, installer_language());
    settings
}

/// The language chosen in the installer, which leaves its Windows language id next to the program.
fn installer_language() -> Option<&'static str> {
    let file = std::env::current_exe().ok()?.parent()?.join("install-language.txt");
    language_of_id(&std::fs::read_to_string(file).ok()?)
}

fn language_of_id(id: &str) -> Option<&'static str> {
    match id.trim() {
        "1042" => Some("ko"),
        "1033" => Some("en"),
        _ => None,
    }
}

/// Only until a language has been chosen in the program: that choice stays, also after a reinstall.
fn with_installer_language(settings: &mut Value, language: Option<&str>) {
    if let (Some(object), Some(language)) = (settings.as_object_mut(), language) {
        object.entry("language").or_insert_with(|| Value::from(language));
    }
}

/// Merges `patch` into settings.json, so the page never overwrites the saved window bounds.
#[tauri::command]
fn save_settings(patch: Value) -> Result<(), String> {
    let mut settings = read_settings_value();
    if !settings.is_object() {
        settings = json!({});
    }
    if let (Some(target), Some(source)) = (settings.as_object_mut(), patch.as_object()) {
        for (key, value) in source {
            target.insert(key.clone(), value.clone());
        }
    }
    write_settings_value(&settings)
}

/// The diagram among command line arguments (a double-click in the file manager).
fn diagram_argument(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|arg| {
            let lower = arg.to_lowercase();
            !arg.starts_with('-') && (lower.ends_with(".mmap") || lower.ends_with(".mymind"))
        })
        .cloned()
}

#[tauri::command]
fn startup_file() -> Option<String> {
    diagram_argument(&std::env::args().collect::<Vec<_>>()).or_else(|| OPENED_FILE.lock().ok()?.take())
}

#[tauri::command(async)]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn write_text(path: String, text: String) -> Result<(), String> {
    std::fs::write(path, text).map_err(|e| e.to_string())
}

/// An exported image, which comes from the page as base64.
#[tauri::command(async)]
fn write_base64(path: String, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

/// The type of a picture the WebView shows by itself.
fn browser_image_type(extension: &str) -> Option<&'static str> {
    Some(match extension {
        "png" | "apng" => "image/png",
        "jpg" | "jpeg" | "jpe" | "jfif" | "pjpeg" | "pjp" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" | "dib" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "ico" | "cur" => "image/x-icon",
        _ => return None,
    })
}

/// A picture in another format, as a PNG.
fn convert_to_png(extension: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let picture = if extension == "psd" {
        let document = psd::Psd::from_bytes(bytes).map_err(|e| e.to_string())?;
        let pixels = image::RgbaImage::from_raw(document.width(), document.height(), document.rgba()).ok_or("bad PSD size")?;
        image::DynamicImage::ImageRgba8(pixels)
    } else {
        // By its extension first: TGA, for one, has no signature to be recognised by.
        let by_extension = image::ImageFormat::from_extension(extension).and_then(|format| image::load_from_memory_with_format(bytes, format).ok());
        match by_extension {
            Some(picture) => picture,
            None => image::load_from_memory(bytes).map_err(|e| e.to_string())?,
        }
    };
    let mut out = std::io::Cursor::new(Vec::new());
    picture.to_rgba8().write_to(&mut out, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}

fn read_image_file(path: &std::path::Path) -> Result<Value, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let extension = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let encoder = base64::engine::general_purpose::STANDARD;
    if let Some(mime) = browser_image_type(&extension) {
        return Ok(json!({ "mime": mime, "data": encoder.encode(bytes) }));
    }
    Ok(json!({ "mime": "image/png", "data": encoder.encode(convert_to_png(&extension, &bytes)?) }))
}

#[tauri::command(async)]
fn read_image(path: String) -> Result<Value, String> {
    read_image_file(std::path::Path::new(&path))
}

/// The encoder for an export format the page cannot write by itself.
fn export_format(name: &str) -> Option<image::ImageFormat> {
    use image::ImageFormat::*;
    Some(match name {
        "gif" => Gif,
        "avif" => Avif,
        "bmp" => Bmp,
        "tiff" => Tiff,
        "tga" => Tga,
        "ico" => Ico,
        "ppm" => Pnm,
        "qoi" => Qoi,
        "ff" => Farbfeld,
        "exr" => OpenExr,
        "hdr" => Hdr,
        _ => return None,
    })
}

/// A PNG in another format. Each encoder takes what it can hold: no alpha, or an icon's largest size.
fn convert_png(png: &[u8], name: &str) -> Result<Vec<u8>, String> {
    let format = export_format(name).ok_or_else(|| format!("unknown format: {name}"))?;
    let picture = image::load_from_memory_with_format(png, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    let picture = match name {
        "ico" if picture.width() > 256 || picture.height() > 256 => picture.thumbnail(256, 256).to_rgba8().into(),
        "bmp" | "ppm" => picture.to_rgb8().into(),
        "ff" => picture.to_rgba16().into(),
        "exr" => picture.to_rgba32f().into(),
        "hdr" => picture.to_rgb32f().into(),
        _ => picture.to_rgba8().into(),
    };
    let picture: image::DynamicImage = picture;
    let mut out = std::io::Cursor::new(Vec::new());
    if name == "ppm" {
        // By itself the encoder writes PAM ("P7"), which programs reading .ppm do not open.
        let subtype = image::codecs::pnm::PnmSubtype::Pixmap(image::codecs::pnm::SampleEncoding::Binary);
        picture.write_with_encoder(image::codecs::pnm::PnmEncoder::new(&mut out).with_subtype(subtype)).map_err(|e| e.to_string())?;
    } else {
        picture.write_to(&mut out, format).map_err(|e| e.to_string())?;
    }
    Ok(out.into_inner())
}

#[tauri::command(async)]
fn write_converted(path: String, data: String, format: String) -> Result<(), String> {
    let png = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    std::fs::write(path, convert_png(&png, &format)?).map_err(|e| e.to_string())
}

/// The folder of the sample diagrams shipped with the app.
fn samples_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    // Windows gives a "\\\\?\\" path here, which is fine for Rust but not for joining by hand.
    let text = resources.to_string_lossy().to_string();
    Ok(PathBuf::from(text.strip_prefix("\\\\?\\").unwrap_or(&text)).join("template"))
}

/// The samples and the folder they are in.
#[tauri::command(async)]
fn samples_list(app: AppHandle) -> Result<Value, String> {
    let dir = samples_dir(&app)?;
    let list = std::fs::read_to_string(dir.join("index.json")).map_err(|e| e.to_string())?;
    let items: Value = serde_json::from_str(list.trim_start_matches('\u{feff}')).map_err(|e| e.to_string())?;
    Ok(json!({ "dir": dir.to_string_lossy(), "items": items }))
}

/// The installed font families, sorted, each once.
#[tauri::command(async)]
fn system_fonts() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    let mut families: Vec<String> = database.faces().filter_map(|face| face.families.first().map(|(name, _)| name.clone())).collect();
    families.sort_by_key(|name| name.to_lowercase());
    families.dedup();
    families
}

/// What the About window shows that the page cannot know by itself.
#[tauri::command]
fn app_info(app: AppHandle) -> Value {
    let built = std::env::current_exe().ok().and_then(|exe| std::fs::metadata(exe).ok()?.modified().ok());
    let built_ms = built.and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok()).map(|age| age.as_millis() as u64);
    json!({
        "version": app.package_info().version.to_string(),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "tauri": tauri::VERSION,
        "webview": tauri::webview_version().unwrap_or_default(),
        "executableTime": built_ms,
    })
}

fn allowed_external(url: &str) -> bool {
    url.starts_with("mailto:") || url.starts_with("https://")
}

/// A mail address or web page, in the program the system uses for it.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !allowed_external(&url) {
        return Err(format!("not an address: {url}"));
    }
    let mut command = if cfg!(windows) {
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", &url]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = std::process::Command::new("open");
        c.arg(&url);
        c
    } else {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&url);
        c
    };
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// The system's print dialog for the page; its print style leaves only the prepared sheets.
#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    system_print(&window)
}

/// WebView2's default is its own preview inside the window. This is the system's, a window of its own.
#[cfg(windows)]
fn system_print(window: &tauri::WebviewWindow) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM};
    use windows::core::Interface;
    window
        .with_webview(|webview| unsafe {
            if let Ok(core) = webview.controller().CoreWebView2() {
                if let Ok(printer) = core.cast::<ICoreWebView2_16>() {
                    let _ = printer.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM);
                }
            }
        })
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn system_print(window: &tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

/// The page can ask about unsaved work from now on.
#[tauri::command]
fn close_guard_ready() {
    CLOSE_GUARD.store(true, Ordering::SeqCst);
}

/// The page has dealt with unsaved work: the main window may really close now.
#[tauri::command]
fn main_close(app: AppHandle) {
    CLOSE_ALLOWED.store(true, Ordering::SeqCst);
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.close();
    }
}

/// The page has applied its theme: its window can appear without a flash of the wrong colour.
#[tauri::command]
fn window_ready(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

/// The smallest size the page measured for its title row and toolbar, logical pixels.
struct MinSize(Mutex<(f64, f64)>);

/// Windows applies a window's minimum only to sizing with the mouse. A size set any other way
/// (another program, a saved size, a DPI change) can still be smaller and clip the toolbar.
fn enforce_min_size(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let Some(state) = window.try_state::<MinSize>() else { return };
    let (width, height) = *state.0.lock().unwrap_or_else(|e| e.into_inner());
    let (Ok(scale), Ok(size)) = (window.scale_factor(), window.inner_size()) else { return };
    let size = size.to_logical::<f64>(scale);
    if size.width + 0.5 < width || size.height + 0.5 < height {
        let _ = window.set_size(tauri::LogicalSize::new(size.width.max(width), size.height.max(height)));
    }
}

#[tauri::command]
fn window_min_size(window: tauri::Window, state: tauri::State<MinSize>, width: f64, height: f64) {
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = (width, height);
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(width, height)));
    enforce_min_size(&window);
}

/// Whatever happens in the page, a window does not stay invisible.
fn show_later(window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
    });
}

fn remember_window(window: &tauri::Window) {
    // Full screen says nothing about the size the window should open with.
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    let mut settings = read_settings_value();
    if !settings.is_object() {
        settings = json!({});
    }
    let mut entry = settings["window"].clone();
    if !entry.is_object() {
        entry = json!({});
    }
    entry["maximized"] = json!(maximized);
    if !maximized {
        if let (Ok(scale), Ok(pos), Ok(size)) = (window.scale_factor(), window.outer_position(), window.inner_size()) {
            let pos = pos.to_logical::<f64>(scale);
            let size = size.to_logical::<f64>(scale);
            entry["x"] = json!(pos.x.round());
            entry["y"] = json!(pos.y.round());
            entry["width"] = json!(size.width.round());
            entry["height"] = json!(size.height.round());
        }
    }
    settings["window"] = entry;
    let _ = write_settings_value(&settings);
}

fn open_main_window(app: &AppHandle) -> Result<(), String> {
    let settings = read_settings_value();
    let saved = &settings["window"];
    let num = |key: &str| saved[key].as_f64();
    let dialogs = app.clone();
    // The first start: as large as the toolbar likes, but never larger than the screen.
    let (fit_w, fit_h) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let factor = monitor.scale_factor();
            let area = monitor.work_area().size;
            (f64::from(area.width) / factor - 40.0, f64::from(area.height) / factor - 40.0)
        })
        .unwrap_or((DEFAULT_WIDTH, DEFAULT_HEIGHT));
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        // Every dialog opens as a window of its own.
        .on_new_window(move |url, features| {
            if url.scheme() == "about" {
                if let Some(main) = dialogs.get_webview_window(MAIN) {
                    return popout::new_window(&dialogs, &main, &url, features);
                }
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .title("MyMind")
        .inner_size(num("width").unwrap_or(DEFAULT_WIDTH.min(fit_w)).max(MIN_WIDTH), num("height").unwrap_or(DEFAULT_HEIGHT.min(fit_h)).max(MIN_HEIGHT))
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .decorations(false)
        .shadow(true)
        .visible(false)
        .maximized(saved["maximized"].as_bool().unwrap_or(false));
    if let (Some(x), Some(y)) = (num("x"), num("y")) {
        builder = builder.position(x, y);
    }
    show_later(builder.build().map_err(|e| e.to_string())?);
    Ok(())
}

fn main() {
    let mut builder = tauri::Builder::default();
    // A run with its own data folder (the GUI tests) is a separate instance, not a second start.
    if std::env::var_os("MYMIND_SETTINGS_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(file) = diagram_argument(&args) {
                let _ = app.emit("open-file", file);
            }
        }));
    }
    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .manage(MinSize(Mutex::new((MIN_WIDTH, MIN_HEIGHT))))
        .setup(|app| open_main_window(app.handle()).map_err(|e| e.into()))
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } if window.label() == MAIN => {
                // The page decides first: it may have unsaved work to ask about.
                if CLOSE_GUARD.load(Ordering::SeqCst) && !CLOSE_ALLOWED.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.app_handle().emit_to(MAIN, "close-requested", ());
                    return;
                }
                remember_window(window);
                popout::close_all(window.app_handle());
            }
            tauri::WindowEvent::Resized(_) if window.label() == MAIN => enforce_min_size(window),
            tauri::WindowEvent::Destroyed if popout::is_dialog(window.label()) => {
                popout::closed(window.app_handle(), window.label());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            startup_file,
            read_text,
            write_text,
            write_base64,
            samples_list,
            system_fonts,
            app_info,
            open_external,
            print_window,
            read_image,
            write_converted,
            window_ready,
            close_guard_ready,
            main_close,
            window_min_size,
            popout::popout_show,
            popout::popout_drag,
            popout::popout_minimize,
            popout::popout_focus,
            popout::popout_close,
            popout::popout_reset,
            popout::popout_inline,
        ])
        .build(tauri::generate_context!())
        .expect("the application failed to start");
    app.run(|_app, _event| {
        // macOS hands a double-clicked file to the running program as an event.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &_event {
            if let Some(file) = urls.iter().find_map(|url| url.to_file_path().ok()) {
                let file = file.to_string_lossy().to_string();
                if let Ok(mut pending) = OPENED_FILE.lock() {
                    *pending = Some(file.clone());
                }
                let _ = _app.emit("open-file", file);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installer_language_is_only_a_first_default() {
        assert_eq!(language_of_id("1042"), Some("ko"));
        assert_eq!(language_of_id(" 1033\r\n"), Some("en"));
        assert_eq!(language_of_id("1041"), None);
        let mut empty = serde_json::json!({});
        with_installer_language(&mut empty, Some("en"));
        assert_eq!(empty["language"], "en");
        let mut chosen = serde_json::json!({ "language": "ko" });
        with_installer_language(&mut chosen, Some("en"));
        assert_eq!(chosen["language"], "ko");
    }

    #[test]
    fn finds_the_diagram_among_the_arguments() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(diagram_argument(&args(&["mymind", "--flag", "C:\\a\\Trip.MMAP"])).as_deref(), Some("C:\\a\\Trip.MMAP"));
        assert_eq!(diagram_argument(&args(&["mymind", "old.mymind"])).as_deref(), Some("old.mymind"));
        assert_eq!(diagram_argument(&args(&["x.mmap"])), None);
        assert_eq!(diagram_argument(&args(&["mymind", "notes.txt"])), None);
    }

    #[test]
    fn converts_pictures_the_webview_cannot_show() {
        let dir = std::env::temp_dir().join(format!("mymind-images-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let picture = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(3, 2, image::Rgb([200, 30, 60])));
        for (extension, format) in [
            ("tga", image::ImageFormat::Tga),
            ("tiff", image::ImageFormat::Tiff),
            ("tif", image::ImageFormat::Tiff),
            ("ppm", image::ImageFormat::Pnm),
            ("qoi", image::ImageFormat::Qoi),
        ] {
            let file = dir.join(format!("picture.{extension}"));
            picture.save_with_format(&file, format).unwrap();
            let read = read_image_file(&file).unwrap();
            assert_eq!(read["mime"], "image/png", "{extension}");
            let bytes = base64::engine::general_purpose::STANDARD.decode(read["data"].as_str().unwrap()).unwrap();
            let back = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png).unwrap();
            assert_eq!((back.width(), back.height()), (3, 2), "{extension}");
            assert_eq!(back.to_rgb8().get_pixel(0, 0).0, [200, 30, 60], "{extension}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn writes_every_export_format() {
        let picture = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(600, 300, image::Rgba([10, 120, 200, 255])));
        let mut png = std::io::Cursor::new(Vec::new());
        picture.write_to(&mut png, image::ImageFormat::Png).unwrap();
        let png = png.into_inner();
        for name in ["gif", "bmp", "tiff", "tga", "ico", "ppm", "qoi", "ff", "exr", "hdr"] {
            let bytes = convert_png(&png, name).unwrap_or_else(|e| panic!("{name}: {e}"));
            let back = image::load_from_memory_with_format(&bytes, export_format(name).unwrap()).unwrap_or_else(|e| panic!("{name}: {e}"));
            let expected = if name == "ico" { (256, 128) } else { (600, 300) };
            assert_eq!((back.width(), back.height()), expected, "{name}");
        }
        assert!(convert_png(&png, "ppm").unwrap().starts_with(b"P6"), "a .ppm must be a real PPM, not PAM");
        // There is no AVIF decoder in the program: its boxes say what it is and how large
        // (the GUI tests have the WebView decode one). "ispe" holds the width and height.
        let avif = convert_png(&png, "avif").unwrap();
        assert_eq!(&avif[4..12], b"ftypavif");
        let at = avif.windows(4).position(|w| w == b"ispe").expect("no size box");
        let number = |from: usize| u32::from_be_bytes(avif[from..from + 4].try_into().unwrap());
        assert_eq!((number(at + 8), number(at + 12)), (600, 300));
        // An alpha plane is written as a second image.
        let holes = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(64, 64, image::Rgba([10, 120, 200, 0])));
        let mut clear = std::io::Cursor::new(Vec::new());
        holes.write_to(&mut clear, image::ImageFormat::Png).unwrap();
        let with_alpha = convert_png(&clear.into_inner(), "avif").unwrap();
        assert!(with_alpha.windows(4).filter(|w| *w == b"ispe").count() >= 2 || with_alpha.windows(5).any(|w| w == b"auxC\0"));
        assert!(convert_png(&png, "nonsense").is_err());
    }

    #[test]
    fn hands_the_webview_its_own_formats_untouched() {
        assert_eq!(browser_image_type("jfif"), Some("image/jpeg"));
        assert_eq!(browser_image_type("svg"), Some("image/svg+xml"));
        assert_eq!(browser_image_type("tga"), None);
        assert!(convert_to_png("tga", b"not a picture").is_err());
    }

    #[test]
    fn opens_only_mail_and_web_addresses() {
        assert!(allowed_external("mailto:a@b.c") && allowed_external("https://x.y"));
        assert!(!allowed_external("file:///c:/windows/system32/calc.exe") && !allowed_external("calc.exe"));
    }
}
