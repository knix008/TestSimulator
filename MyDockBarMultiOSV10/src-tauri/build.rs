//! Build script.
//!
//! Besides Tauri's own step, this embeds the menu glyphs. They are generated
//! artwork (`scripts/make-icons.js` → `build/menu/*.png`), and the native menus
//! and the settings window's tab strip both draw from them, so the binary
//! carries every one of them rather than looking for files at run time.

use std::{env, fs, path::PathBuf, process::Command};

fn main() {
  let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
  let root = manifest.parent().unwrap().to_path_buf();
  let menu = root.join("build").join("menu");

  // A bare `cargo build` / `cargo test` has no beforeBuildCommand to make the
  // artwork first, so ask for it here. ensure-icons only redraws what is stale.
  let _ = Command::new("node").arg(root.join("scripts").join("ensure-icons.js")).current_dir(&root).status();

  let mut names: Vec<String> = fs::read_dir(&menu)
    .map(|entries| {
      entries
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".png") && !n.ends_with("@2x.png"))
        .map(|n| n.trim_end_matches(".png").to_string())
        .collect()
    })
    .unwrap_or_default();
  names.sort();

  let mut out = String::from("/// Every menu glyph: (name, 16px png, 32px png).\npub static GLYPHS: &[(&str, &[u8], &[u8])] = &[\n");
  for name in &names {
    let one = menu.join(format!("{name}.png"));
    let two = menu.join(format!("{name}@2x.png"));
    let two = if two.exists() { two } else { one.clone() };
    out.push_str(&format!(
      "  ({name:?}, include_bytes!({one:?}), include_bytes!({two:?})),\n",
      one = one.to_string_lossy(),
      two = two.to_string_lossy()
    ));
  }
  out.push_str("];\n");
  fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("glyphs.rs"), out).unwrap();

  println!("cargo:rerun-if-changed={}", menu.display());
  println!("cargo:rerun-if-changed={}", root.join("scripts").join("menu-glyphs.js").display());
  println!("cargo:rerun-if-changed={}", root.join("scripts").join("make-icons.js").display());

  tauri_build::build()
}
