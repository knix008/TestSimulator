//! build.rs - `web/` 안의 파일을 실행 파일에 품는다.
//!
//! Go 판은 `go:embed` 한 줄로 했다. Rust 에는 그런 것이 없으므로 빌드할 때
//! 폴더를 훑어 `include_bytes!` 목록을 만들어 둔다. 꾸러미를 더 들이지 않고
//! 같은 일을 한다.
//!
//! 웹 판을 아직 만들지 않았으면 있는 것만 품는다. 그때는 `-dir web` 으로
//! 폴더에서 띄우면 된다.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};

fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../web");
    println!("cargo:rerun-if-changed={}", root.display());

    let mut files = Vec::new();
    collect(&root, &root, &mut files);
    files.sort();

    let mut out = String::new();
    out.push_str("// build.rs 가 만든 파일이다. 손으로 고치지 않는다.\n");
    out.push_str("/// 품고 있는 웹 판 파일들. `(경로, 내용)` 이다.\n");
    out.push_str("pub static FILES: &[(&str, &[u8])] = &[\n");
    for (rel, abs) in &files {
        // 경로를 문자열 리터럴에 넣을 수 있게 역슬래시를 바꿔 준다.
        let abs = abs.display().to_string().replace('\\', "/");
        let _ = writeln!(out, "    ({rel:?}, include_bytes!({abs:?})),");
    }
    out.push_str("];\n");

    let dest = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("site.rs");
    std::fs::write(dest, out).expect("품을 목록을 쓰지 못했습니다");

    if files.is_empty() {
        println!(
            "cargo:warning=web/ 가 비어 있습니다. \
             scripts/build-web 을 먼저 돌리거나 -dir web 으로 띄우세요."
        );
    }
}

/// 폴더를 훑어 `(웹에서 쓰는 경로, 실제 파일 경로)` 를 모은다.
fn collect(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let path = e.path();
        if path.is_dir() {
            collect(root, &path, out);
            continue;
        }
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        // URL 은 늘 슬래시를 쓴다.
        let rel = rel.to_string_lossy().replace('\\', "/");
        println!("cargo:rerun-if-changed={}", path.display());
        out.push((rel, path));
    }
}
