//! build.rs - 설치할 실행 파일을 설치 프로그램 안에 품는다.
//!
//! Go 판은 `go:embed payload` 한 줄로 했다. Rust 에는 그런 것이 없으므로
//! 빌드할 때 `payload/` 를 보고 `include_bytes!` 한 줄을 만들어 둔다.
//!
//! `scripts/package.*` 가 앱을 먼저 빌드해 그 폴더에 넣고, 설치 프로그램을
//! 빌드한 뒤 그 폴더를 비운다. 그래서 저장소에 실행 파일이 남지 않는다.
//! 폴더가 비어 있으면 빈 목록을 만든다. 그때는 설치 단추가 눌리지 않고,
//! 설치 프로그램이 무엇을 해야 하는지 알려 준다.

use std::path::PathBuf;

fn main() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("payload");
    println!("cargo:rerun-if-changed={}", dir.display());

    let name = if cfg!(windows) {
        "chunjiin.exe"
    } else {
        "chunjiin"
    };
    let exe = dir.join(name);

    let body = if exe.is_file() {
        println!("cargo:rerun-if-changed={}", exe.display());
        format!(
            "include_bytes!({:?})",
            exe.display().to_string().replace('\\', "/")
        )
    } else {
        println!(
            "cargo:warning=payload/{name} 이 없습니다.              scripts/package 로 만들면 설치 프로그램이 앱을 품습니다."
        );
        "&[]".to_string()
    };

    let out = format!(
        "// build.rs 가 만든 파일이다. 손으로 고치지 않는다.
         /// 품고 있는 실행 파일. 비어 있으면 설치할 것이 없다는 뜻이다.
         pub static EXE: &[u8] = {body};
"
    );

    let dest = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("payload.rs");
    std::fs::write(dest, out).expect("품을 목록을 쓰지 못했습니다");
}
