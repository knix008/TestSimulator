fn main() {
    // App commands are denied on the Vite dev origin unless they are listed here
    // and allowed in capabilities/default.json.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["host_info", "renderer_ready"]),
        ),
    )
    .expect("failed to run tauri-build");
}
