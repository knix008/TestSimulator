// The window loads its page from the core's own loopback server, which Tauri treats
// as a remote origin: app commands reach it only through permissions, so each one
// gets an `allow-…` permission here and capabilities/default.json grants them.
const COMMANDS: &[&str] = &[
    "app_info",
    "app_quit",
    "window_title",
    "window_min_size",
    "window_background",
    "window_minimize",
    "window_resize_to",
    "window_toggle_maximize",
    "window_is_maximized",
    "window_native_theme",
    "window_reset_zoom",
    "window_start_drag",
    "pick_file",
    "pick_directory",
    "pick_save",
    "clipboard_write",
    "clipboard_read",
    "shell_open",
    "shell_reveal",
    "merge_saved",
    "print_window",
    "settings_broadcast",
    "menu_open",
    "menu_close",
    "menu_payload",
    "menu_size",
    "menu_choose",
    "dialog_open",
    "dialog_payload",
    "dialog_result",
    "dialog_close",
    "dialog_close_all",
    "dialog_size",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run the Tauri build script");
}
