use std::fs;
use std::path::PathBuf;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

struct TrayState {
    show: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    about: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

fn normalize_language(raw: &str) -> Option<&'static str> {
    let value = raw.trim().trim_start_matches('\u{feff}').to_lowercase();
    if value.starts_with("ko") || value.contains("korean") || value.contains("한글") {
        Some("ko")
    } else if value.starts_with("en") || value.contains("english") {
        Some("en")
    } else {
        None
    }
}

fn language_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(PathBuf::from);
        for _ in 0..3 {
            let Some(current) = dir else { break };
            paths.push(current.join("install-language.txt"));
            dir = current.parent().map(PathBuf::from);
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let home = PathBuf::from(home);
        paths.push(home.join("AppData/Roaming/com.mycalendar.multios/install-language.txt"));
        paths.push(home.join(".config/my-calendar/install-language.txt"));
        paths.push(home.join("Library/Application Support/com.mycalendar.multios/install-language.txt"));
    }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        paths.push(PathBuf::from(xdg).join("my-calendar/install-language.txt"));
    }
    paths
}

fn read_install_language_value() -> Option<String> {
    for path in language_paths() {
        let Ok(text) = fs::read_to_string(&path) else { continue };
        if let Some(language) = normalize_language(&text) {
            return Some(language.to_string());
        }
    }
    None
}

fn labels(language: &str) -> (&'static str, &'static str, &'static str, &'static str, &'static str) {
    if language == "ko" {
        ("캘린더 표시/숨기기", "설정", "프로그램 정보", "종료", "마이 캘린더")
    } else {
        ("Show / Hide calendar", "Settings", "About", "Quit", "My Calendar")
    }
}

fn toggle_main(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn open_aux(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    if label != "settings" && label != "about" {
        return Err("unknown window".into());
    }
    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let (width, height, resizable) = if label == "settings" {
        (520.0, 720.0, true)
    } else {
        (440.0, 560.0, false)
    };
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(label)
        .inner_size(width, height)
        .min_inner_size(380.0, 420.0)
        .resizable(resizable)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .center()
        .visible(true)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn install_language() -> Option<String> {
    read_install_language_value()
}

#[tauri::command]
fn update_tray_labels(
    app: tauri::AppHandle,
    show: String,
    settings: String,
    about: String,
    quit: String,
    tooltip: String,
) -> Result<(), String> {
    let state = app.state::<TrayState>();
    state.show.set_text(show).map_err(|error| error.to_string())?;
    state.settings.set_text(settings).map_err(|error| error.to_string())?;
    state.about.set_text(about).map_err(|error| error.to_string())?;
    state.quit.set_text(quit).map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_tooltip(Some(tooltip)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_main_always_on_top(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("missing main window")?
        .set_always_on_top(on)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_main(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("missing main window")?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_aux_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    open_aux(&app, &label)
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if url != "https://date.nager.at" && url != "https://date.nager.at/" {
        return Err("url not allowed".into());
    }
    open::that(url).map_err(|error| error.to_string())?;
    Ok(())
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let language = read_install_language_value().unwrap_or_else(|| "en".to_string());
    let (show_label, settings_label, about_label, quit_label, tooltip) = labels(&language);
    let show = MenuItem::with_id(app, "toggle", show_label, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", settings_label, true, None::<&str>)?;
    let about = MenuItem::with_id(app, "about", about_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &settings, &about, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_main(app),
            "settings" => {
                let _ = open_aux(app, "settings");
            }
            "about" => {
                let _ = open_aux(app, "about");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    app.manage(TrayState { show, settings, about, quit });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            toggle_main(app);
        }))
        .plugin(tauri_plugin_autostart::Builder::new().app_name("My Calendar").build())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            install_language,
            update_tray_labels,
            set_main_always_on_top,
            hide_main,
            open_aux_window,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running My Calendar");
}
