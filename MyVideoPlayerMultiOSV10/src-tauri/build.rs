fn main() {
  // Pages come from the app's own http://127.0.0.1 server, a "remote" origin to Tauri, so the
  // `vp` command needs a permission (allow-vp, granted in capabilities/default.json).
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["vp"])))
    .expect("failed to run tauri-build");
}
