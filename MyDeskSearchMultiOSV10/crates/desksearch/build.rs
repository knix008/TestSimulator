use std::path::{Path, PathBuf};
use std::process::Command;

#[path = "src/app_icon.rs"]
mod app_icon;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/app_icon.rs");
    println!("cargo:rerun-if-env-changed=CARGO_PKG_VERSION");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "windows" {
        return;
    }
    let version = std::env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "1.0.1".to_string());
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let icon_path = out_dir.join("mydesksearch.ico");
    write_ico(
        &icon_path,
        &[16, 24, 32, 48, 64, 256]
            .into_iter()
            .map(|size| (size, app_icon::render(size)))
            .collect::<Vec<_>>(),
    );
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let shared_icon = manifest_dir.join("../../packaging/windows/mydesksearch.ico");
    if let Some(parent) = shared_icon.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::copy(&icon_path, &shared_icon).expect("copy program icon");
    let rc_path = out_dir.join("mydesksearch.rc");
    let res_path = out_dir.join("mydesksearch.res");
    let icon_rc = icon_path.display().to_string().replace('\\', "\\\\");
    let rc = format!(
        "1 ICON \"{icon_rc}\"\n{}",
        version_resource(&version, "mydesksearch.exe", "MyDeskSearch")
    );
    std::fs::write(&rc_path, rc).expect("write version resource");
    let rc = find_rc();
    let status = Command::new(&rc)
        .args([
            "/nologo",
            "/fo",
            &res_path.display().to_string(),
            &rc_path.display().to_string(),
        ])
        .status()
        .unwrap_or_else(|error| panic!("failed to run {}: {error}", rc.display()));
    if !status.success() {
        panic!("rc.exe failed to compile the version resource");
    }
    println!("cargo:rustc-link-arg-bins={}", res_path.display());
}

fn version_resource(version: &str, original: &str, description: &str) -> String {
    let mut parts = version.split('.');
    let major = parts.next().unwrap_or("1");
    let minor = parts.next().unwrap_or("0");
    let patch = parts.next().unwrap_or("0");
    format!(
        r#"
1 VERSIONINFO
FILEVERSION {major},{minor},{patch},0
PRODUCTVERSION {major},{minor},{patch},0
FILEFLAGSMASK 0x3fL
FILEFLAGS 0x0L
FILEOS 0x40004L
FILETYPE 0x1L
FILESUBTYPE 0x0L
BEGIN
    BLOCK "StringFileInfo"
    BEGIN
        BLOCK "040904B0"
        BEGIN
            VALUE "CompanyName", "MyDeskSearch"
            VALUE "FileDescription", "{description}"
            VALUE "FileVersion", "{version}"
            VALUE "InternalName", "mydesksearch"
            VALUE "OriginalFilename", "{original}"
            VALUE "ProductName", "MyDeskSearch"
            VALUE "ProductVersion", "{version}"
        END
    END
    BLOCK "VarFileInfo"
    BEGIN
        VALUE "Translation", 0x409, 1200
    END
END
"#
    )
}

fn write_ico(path: &Path, images: &[(u32, Vec<u8>)]) {
    let mut file = Vec::new();
    file.extend_from_slice(&0_u16.to_le_bytes());
    file.extend_from_slice(&1_u16.to_le_bytes());
    file.extend_from_slice(&(images.len() as u16).to_le_bytes());
    let mut offset = 6 + 16 * images.len() as u32;
    let mut blobs = Vec::new();
    for (size, rgba) in images {
        let dib = dib_image(*size, rgba);
        let byte = if *size >= 256 { 0 } else { *size as u8 };
        file.push(byte);
        file.push(byte);
        file.push(0);
        file.push(0);
        file.extend_from_slice(&1_u16.to_le_bytes());
        file.extend_from_slice(&32_u16.to_le_bytes());
        file.extend_from_slice(&(dib.len() as u32).to_le_bytes());
        file.extend_from_slice(&offset.to_le_bytes());
        offset += dib.len() as u32;
        blobs.push(dib);
    }
    for blob in blobs {
        file.extend_from_slice(&blob);
    }
    std::fs::write(path, file).expect("write icon");
}

fn dib_image(size: u32, rgba: &[u8]) -> Vec<u8> {
    let mut dib = Vec::new();
    dib.extend_from_slice(&40_u32.to_le_bytes());
    dib.extend_from_slice(&(size as i32).to_le_bytes());
    dib.extend_from_slice(&(size as i32 * 2).to_le_bytes());
    dib.extend_from_slice(&1_u16.to_le_bytes());
    dib.extend_from_slice(&32_u16.to_le_bytes());
    dib.extend_from_slice(&[0_u8; 24]);
    for y in (0..size).rev() {
        for x in 0..size {
            let index = ((y * size + x) * 4) as usize;
            dib.push(rgba[index + 2]);
            dib.push(rgba[index + 1]);
            dib.push(rgba[index]);
            dib.push(rgba[index + 3]);
        }
    }
    let stride = ((size + 31) / 32) * 4;
    for y in (0..size).rev() {
        let mut row = vec![0_u8; stride as usize];
        for x in 0..size {
            let alpha = rgba[((y * size + x) * 4 + 3) as usize];
            if alpha < 128 {
                row[(x / 8) as usize] |= 1 << (7 - (x % 8));
            }
        }
        dib.extend_from_slice(&row);
    }
    dib
}

fn find_rc() -> PathBuf {
    let kits = PathBuf::from(r"C:\Program Files (x86)\Windows Kits\10\bin");
    let mut found = Vec::new();
    if let Ok(versions) = std::fs::read_dir(&kits) {
        for version in versions.flatten() {
            let candidate = version.path().join("x64").join("rc.exe");
            if candidate.is_file() {
                found.push(candidate);
            }
        }
    }
    found.sort();
    found.pop().expect("Windows rc.exe was not found")
}
