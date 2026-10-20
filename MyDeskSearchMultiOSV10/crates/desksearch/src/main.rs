#![cfg_attr(windows, windows_subsystem = "windows")]

mod app;
mod app_icon;
mod tray;
mod worker;

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use app::DeskApp;
use desksearch_core::instance::{notify_existing, InstanceLock};
use desksearch_core::paths::{config_dir, settings_file};
use desksearch_core::platform::set_run_at_startup;
use desksearch_core::settings::{load_settings_file, save_settings_file};
use desksearch_core::volume::ready_volumes;
use eframe::egui;

fn main() -> eframe::Result<()> {
    let data_dir = config_dir();
    let _ = std::fs::create_dir_all(&data_dir);
    let lock = match InstanceLock::acquire(&data_dir) {
        Ok(lock) => lock,
        Err(desksearch_core::instance::AcquireError::AlreadyRunning) => {
            let _ = notify_existing(&data_dir);
            std::process::exit(0);
        }
        Err(desksearch_core::instance::AcquireError::Io(error)) => {
            eprintln!("MyDeskSearch could not take the single-instance lock: {error}");
            std::process::exit(1);
        }
    };

    let settings_path = settings_file(&data_dir);
    let first_launch = !settings_path.exists();
    let loaded = load_settings_file(&settings_path, &ready_volumes());
    if first_launch {
        let _ = save_settings_file(&settings_path, &loaded.settings);
    }
    if loaded.settings.run_at_startup {
        if let Ok(exe) = std::env::current_exe() {
            let _ = set_run_at_startup(true, &exe);
        }
    }

    let settings = loaded.settings;
    let mut viewport = egui::ViewportBuilder::default()
        .with_title(format!("MyDeskSearch {}", desksearch_core::VERSION))
        .with_inner_size([
            settings.window_width.unwrap_or(340.0).clamp(280.0, 720.0) as f32,
            48.0,
        ])
        .with_min_inner_size([280.0, 48.0])
        .with_resizable(true)
        .with_decorations(false)
        .with_transparent(true)
        .with_always_on_top()
        .with_taskbar(false)
        .with_app_id("MyDeskSearch")
        .with_icon(std::sync::Arc::new(egui::IconData {
            rgba: app_icon::render(256),
            width: 256,
            height: 256,
        }));
    if let (Some(left), Some(top)) = (settings.window_left, settings.window_top) {
        viewport = viewport.with_position([left as f32, top as f32]);
    }

    let options = eframe::NativeOptions {
        viewport,
        persist_window: false,
        ..Default::default()
    };
    let warn_settings = settings_path.exists() && loaded.used_defaults && !first_launch;
    eframe::run_native(
        "MyDeskSearch",
        options,
        Box::new(move |cc| {
            install_ui_font(&cc.egui_ctx);
            install_icon_font(&cc.egui_ctx);
            cc.egui_ctx.request_repaint();
            Ok(Box::new(DeskApp::new(
                cc,
                data_dir,
                settings,
                warn_settings,
                lock,
                Arc::new(AtomicBool::new(false)),
            )))
        }),
    )
}

fn install_ui_font(ctx: &egui::Context) {
    let Some(bytes) = load_ui_font() else {
        return;
    };
    ctx.add_font(egui::epaint::text::FontInsert::new(
        "MyDeskSearchUI",
        egui::FontData::from_owned(bytes),
        vec![
            egui::epaint::text::InsertFontFamily {
                family: egui::FontFamily::Proportional,
                priority: egui::epaint::text::FontPriority::Highest,
            },
            egui::epaint::text::InsertFontFamily {
                family: egui::FontFamily::Monospace,
                priority: egui::epaint::text::FontPriority::Highest,
            },
        ],
    ));
}

fn load_ui_font() -> Option<Vec<u8>> {
    for path in ui_font_candidates() {
        if let Ok(bytes) = std::fs::read(&path) {
            if bytes.len() > 1024 {
                return Some(bytes);
            }
        }
    }
    None
}

fn install_icon_font(ctx: &egui::Context) {
    let Some(bytes) = load_icon_font() else {
        return;
    };
    ctx.add_font(egui::epaint::text::FontInsert::new(
        "mdl2",
        egui::FontData::from_owned(bytes),
        vec![egui::epaint::text::InsertFontFamily {
            family: egui::FontFamily::Name("mdl2".into()),
            priority: egui::epaint::text::FontPriority::Highest,
        }],
    ));
}

fn load_icon_font() -> Option<Vec<u8>> {
    let mut paths = Vec::new();
    if let Ok(windir) = std::env::var("WINDIR") {
        paths.push(std::path::PathBuf::from(windir).join("Fonts").join("segmdl2.ttf"));
    }
    paths.push(std::path::PathBuf::from(r"C:\Windows\Fonts\segmdl2.ttf"));
    for path in paths {
        if let Ok(bytes) = std::fs::read(&path) {
            if bytes.len() > 1024 {
                return Some(bytes);
            }
        }
    }
    None
}

fn ui_font_candidates() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Ok(windir) = std::env::var("WINDIR") {
        let fonts = std::path::PathBuf::from(windir).join("Fonts");
        paths.push(fonts.join("malgun.ttf"));
        paths.push(fonts.join("malgunsl.ttf"));
    }
    paths.push(std::path::PathBuf::from(r"C:\Windows\Fonts\malgun.ttf"));
    paths.extend([
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ].into_iter().map(std::path::PathBuf::from));
    paths
}

pub fn copy_text(ctx: &egui::Context, text: impl Into<String>) {
    ctx.copy_text(text.into());
}

pub fn reveal_or_open(path: &Path, reveal: bool) {
    let result = if reveal {
        desksearch_core::platform::reveal_path(path)
    } else {
        desksearch_core::platform::open_path(path)
    };
    if let Err(error) = result {
        eprintln!("open {}: {error}", path.display());
    }
}
