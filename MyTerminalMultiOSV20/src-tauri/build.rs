fn main() {
    // About › build date.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    println!("cargo:rustc-env=MYTERMINAL_BUILD_EPOCH={now}");
    tauri_build::build()
}
