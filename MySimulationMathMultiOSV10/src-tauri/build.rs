fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["host_info", "renderer_ready", "child_window", "set_m_association", "m_association", "print_info", "print_pdf", "print_html"]),
        ),
    )
    .expect("failed to run tauri-build");
}
