fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["renderer_ready", "set_min_size", "set_tray", "quit_app"]),
        ),
    )
    .expect("failed to run tauri-build");
}
