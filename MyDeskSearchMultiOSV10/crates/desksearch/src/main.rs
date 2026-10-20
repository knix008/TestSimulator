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
            settings.window_width.unwrap_or(480.0).clamp(280.0, 720.0) as f32,
            56.0,
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
