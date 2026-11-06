const COMMANDS: &[&str] = &[
    "take_open_file",
    "save_kprj",
    "save_report",
    "open_kprj_dialog",
    "open_sqlite_dialog",
    "open_attachment",
    "start_resize",
    "is_maximized",
];

fn main() {
    // The page comes from the app's own http://127.0.0.1 server, a "remote" origin to Tauri,
    // so each command needs a permission (granted in capabilities/default.json).
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
