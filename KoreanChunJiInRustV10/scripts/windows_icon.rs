//! Windows 실행 파일에 탐색기·작업 표시줄이 보는 아이콘을 넣는다.
//!
//! 창 아이콘은 PNG 를 실행 중에 읽는다. 그와 달리 탐색기 아이콘은
//! PE 리소스(RT_GROUP_ICON) 가 있어야 파일에 그림이 뜬다.
//! `crates/app` · `crates/setup` 의 build.rs 가 이 파일을 끌어 쓴다.

pub fn embed(original_filename: &str, product: &str, description: &str) {
    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let ico = manifest.join("../../assets/chunjiin.ico");
    println!("cargo:rerun-if-changed={}", ico.display());

    if std::env::var("CARGO_CFG_TARGET_OS").ok().as_deref() != Some("windows") {
        return;
    }
    if !ico.is_file() {
        println!(
            "cargo:warning=아이콘이 없습니다: {}  (python scripts/make_icon.py 로 만드세요)",
            ico.display()
        );
        return;
    }

    // rc.exe 는 `..` 과 `\\?\` 를 싫어한다. 평범한 절대 경로로 맞춘다.
    let ico = std::fs::canonicalize(&ico).unwrap_or(ico);
    let ico_s = ico.to_string_lossy();
    let ico_s = ico_s.strip_prefix(r"\\?\").unwrap_or(&ico_s);

    let mut res = winresource::WindowsResource::new();
    res.set_icon(ico_s);
    res.set("ProductName", product);
    res.set("FileDescription", description);
    res.set("OriginalFilename", original_filename);
    res.set("LegalCopyright", "MIT");
    // 한국어 (PRIMARYLANGID 0x12).
    res.set_language(0x0412);
    res.compile()
        .unwrap_or_else(|e| panic!("Windows 아이콘을 넣지 못했습니다: {e}"));
}
