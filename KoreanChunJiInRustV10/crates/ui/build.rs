//! build.rs - 프로그램 정보 창에 보여 줄 빌드 정보를 담는다.
//!
//! Go 판은 `runtime.Version()` 으로 알아냈다. Rust 에는 그런 것이 없어서
//! 빌드할 때 `rustc --version` 을 한 번 물어 두고 `env!` 로 꺼내 쓴다.

use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let version = Command::new(std::env::var("RUSTC").unwrap_or_else(|_| "rustc".into()))
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "rustc".to_string());

    println!("cargo:rustc-env=CHUNJIIN_RUSTC={version}");
}
