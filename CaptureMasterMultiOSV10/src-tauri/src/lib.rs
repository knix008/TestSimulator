mod capture;
mod commands;
mod dialogs;
mod gif_rec;
mod media;
mod popup;
mod printing;
mod single_instance;
mod state;
mod window_rec;

use state::AppState;
use tauri::{Emitter, Manager, WindowEvent};

/// WebView2 would show its own screen-share picker and a microphone prompt on
/// top of the app's source picker. The app only loads its own pages, so media
/// requests are granted without that UI: a screen request gets the whole
/// desktop (with system sound when asked for) and the app crops it to the
/// monitor the user chose. Set before the first webview is created; every
/// webview of the process must share the same arguments. The variable replaces
/// the arguments Tauri passes, so those are repeated here.
#[cfg(windows)]
fn media_permissions() {
    const KEY: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
    let existing = std::env::var(KEY).unwrap_or_default();
    let mut args = vec![
        "--use-fake-ui-for-media-stream".to_string(),
        // Mixing system sound with the microphone needs a running AudioContext, which
        // may otherwise wait for a click that came too long before the recording started.
        "--autoplay-policy=no-user-gesture-required".to_string(),
        existing.trim().to_string(),
    ];
    if !existing.contains("--disable-features") {
        args.push("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection".into());
    }
    std::env::set_var(KEY, args.iter().filter(|a| !a.is_empty()).cloned().collect::<Vec<_>>().join(" "));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if !single_instance::ensure() {
        std::process::exit(0);
    }
    #[cfg(windows)]
    media_permissions();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_info,
            commands::take_pending_open,
            commands::take_install_check,
            commands::resolve_install_check,
            commands::quit,
            commands::load_settings,
            commands::save_settings,
            commands::fs_exists,
            commands::fs_ensure_dir,
            commands::fs_stat,
            commands::fs_read_binary,
            commands::fs_read_text,
            commands::fs_write_binary,
            commands::fs_write_text,
            commands::fs_copy_file,
            commands::fs_temp_path,
            commands::fs_remove,
            commands::pick_open_file,
            commands::pick_directory,
            commands::pick_save_path,
            commands::net_download,
            commands::clipboard_write_text,
            commands::clipboard_read_text,
            commands::clipboard_write_image,
            commands::clipboard_read_image,
            commands::print_list_printers,
            commands::print_page,
            commands::shell_open_external,
            commands::shell_show_item,
            commands::shell_open_path,
            commands::capture_list_sources,
            commands::capture_grab_screen,
            commands::capture_grab_window,
            commands::capture_displays,
            commands::capture_cursor_display,
            commands::capture_hide_app,
            commands::capture_show_app,
            commands::capture_minimize_app,
            commands::capture_restore_app,
            commands::rec_open,
            commands::rec_append,
            commands::rec_close,
            commands::rec_discard,
            commands::rec_window_start,
            commands::rec_window_frame,
            commands::rec_window_stop,
            commands::rec_gif_start,
            commands::rec_gif_pause,
            commands::rec_gif_gone,
            commands::rec_gif_stop,
            commands::image_export,
            commands::image_read_png,
            commands::list_system_fonts,
            commands::dialog_open_window,
            commands::dialog_get_payload,
            commands::dialog_update,
            commands::dialog_submit,
            commands::dialog_close_window,
            commands::dialog_close_self,
            commands::dialog_ready,
            commands::dialog_is_open,
            commands::dialog_broadcast_appearance,
            commands::dialog_set_size,
            popup::popup_show,
            popup::popup_get_payload,
            popup::popup_place,
            popup::popup_update,
            popup::popup_choose,
            popup::popup_hide,
            commands::win_minimize,
            commands::win_toggle_maximize,
            commands::win_close,
            commands::win_is_maximized,
            commands::win_set_title,
            commands::win_set_min_width,
            commands::win_set_min_height,
            commands::win_get_size,
            commands::win_set_size,
        ])
        .setup(|app| {
            let state = app.state::<AppState>();
            if let Ok(mut pending) = state.pending_open.lock() {
                *pending = commands::pending_file_from_args();
            }
            commands::check_reinstall(app.handle(), &state);
            commands::restore_window_state(app.handle());
            if let Some(win) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
                        commands::save_window_state(&handle);
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to start CaptureMaster");

    result.run(|app, event| {
        if let tauri::RunEvent::WindowEvent { label, event, .. } = event {
            match event {
                WindowEvent::CloseRequested { api, .. } if label == "main" => {
                    let state = app.state::<AppState>();
                    if !state.quitting.load(std::sync::atomic::Ordering::SeqCst) {
                        api.prevent_close();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.emit("app:closeRequested", ());
                        }
                    }
                }
                WindowEvent::CloseRequested { .. } if label.starts_with("dlg-") => {
                    dialogs::finish_dialog(app, &label);
                }
                WindowEvent::CloseRequested { api, .. } if label == popup::LABEL => {
                    let state = app.state::<AppState>();
                    if !state.quitting.load(std::sync::atomic::Ordering::SeqCst) {
                        api.prevent_close();
                        popup::hide(app);
                    }
                }
                WindowEvent::Focused(false) if label == popup::LABEL => {
                    popup::on_focus_lost(app);
                }
                WindowEvent::Moved(_) if label == "main" => {
                    popup::hide(app);
                }
                WindowEvent::Resized(_) if label == "main" => {
                    popup::hide(app);
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.emit("win:maximized", win.is_maximized().unwrap_or(false));
                    }
                }
                _ => {}
            }
        }
    });
}
