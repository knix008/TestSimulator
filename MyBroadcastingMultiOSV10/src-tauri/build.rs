// Build information shown in the About window (name, version, build date,
// commit, target, profile and compiler).
use std::process::Command;

fn output(program: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(program).args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn main() {
    let commit = output("git", &["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "unknown".into());
    let rustc = output(&std::env::var("RUSTC").unwrap_or_else(|_| "rustc".into()), &["--version"]).unwrap_or_default();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    println!("cargo:rustc-env=BUILD_COMMIT={commit}");
    println!("cargo:rustc-env=BUILD_RUSTC={rustc}");
    println!("cargo:rustc-env=BUILD_UNIX_TIME={now}");
    println!("cargo:rustc-env=BUILD_TARGET={}", std::env::var("TARGET").unwrap_or_default());
    println!("cargo:rustc-env=BUILD_PROFILE={}", std::env::var("PROFILE").unwrap_or_default());
    // The Common Controls v6 manifest goes in through the linker, for the app and the test binaries alike
    // (tauri-build would put it in the app only; a test binary without it does not start: the dialog
    // plug-in imports TaskDialogIndirect, a comctl32 v6 function — STATUS_ENTRYPOINT_NOT_FOUND).
    let msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if msvc {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
        let attributes = tauri_build::Attributes::new().windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        tauri_build::try_build(attributes).expect("tauri-build");
        return;
    }
    tauri_build::build()
}
