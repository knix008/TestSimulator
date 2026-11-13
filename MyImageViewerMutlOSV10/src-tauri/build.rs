use std::path::{Path, PathBuf};

fn main() {
    // The page asks for ./assets/icon.png. The files live at the project root, not under src/.
    // A link named frontend-extra/assets is walked with src/ and embedded at that same URL.
    link_root_assets();
    tauri_build::build()
}

fn link_root_assets() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let assets = manifest
        .parent()
        .expect("src-tauri parent")
        .join("assets");
    if !assets.is_dir() {
        panic!(
            "app icons are missing at {} — they belong at the project root, not under src/",
            assets.display()
        );
    }

    let extra = manifest.join("frontend-extra");
    let link = extra.join("assets");
    std::fs::create_dir_all(&extra).expect("create frontend-extra");
    remove_link_only(&link);

    // Node creates a Windows junction (no admin) or a directory symlink elsewhere.
    // cmd mklink quoting breaks when the path is handed over as one argument.
    let status = std::process::Command::new("node")
        .arg("-e")
        .arg("require('fs').symlinkSync(process.argv[1], process.argv[2], process.platform === 'win32' ? 'junction' : 'dir')")
        .arg(&assets)
        .arg(&link)
        .status()
        .expect("run node to link assets");
    if !status.success() {
        panic!("could not link {} to {}", link.display(), assets.display());
    }

    println!("cargo:rerun-if-changed={}", assets.display());
}

/// Remove a previous junction or symlink. Never walk into it: that would delete the real assets/.
fn remove_link_only(path: &Path) {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(_) => return,
    };
    if meta.file_type().is_symlink() {
        // A Windows junction is a directory link: remove the link, not the folder it points at.
        #[cfg(windows)]
        let result = std::fs::remove_dir(path);
        #[cfg(unix)]
        let result = std::fs::remove_file(path);
        result.unwrap_or_else(|e| {
            panic!(
                "could not remove the old assets link at {} ({e}). It was left in place so the real assets folder is not deleted.",
                path.display()
            )
        });
        return;
    }
    if meta.is_dir() {
        std::fs::remove_dir(path).unwrap_or_else(|e| {
            panic!(
                "could not remove {} ({e}). Refusing to delete its contents.",
                path.display()
            )
        });
        return;
    }
    std::fs::remove_file(path).unwrap_or_else(|e| panic!("could not remove {} ({e})", path.display()));
}
