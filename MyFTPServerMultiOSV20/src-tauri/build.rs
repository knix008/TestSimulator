fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["renderer_ready", "set_min_size", "set_tray", "quit_app", "manual_open", "broadcast_appearance", "theme_menu_open", "theme_menu_size", "theme_menu_pick", "theme_menu_close", "dialog_open", "dialog_ready", "dialog_size", "dialog_preview", "dialog_submit"]),
        ),
    )
    .expect("failed to run tauri-build");
}
