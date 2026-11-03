// The windows load their page from the core's own loopback server, which Tauri treats
// as a remote origin: app commands reach it only through permissions, so each one
// gets an `allow-…` permission here and capabilities/default.json grants them.
const COMMANDS: &[&str] = &[
    "window_minimize",
    "window_toggle_maximize",
    "window_is_maximized",
    "window_close",
    "window_ready",
    "window_start_drag",
    "pick_directory",
    "pick_program",
    "tool_open",
    "window_background",
    "settings_broadcast",
    "window_min_size",
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
    "dialog_update",
    "guide_open",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run the Tauri build script");
}
