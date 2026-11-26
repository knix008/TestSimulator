//! Making AppImages without external tools: the AppImage type-2 runtime (an ELF program, the
//! same one appimagetool uses) followed by a SquashFS image of the AppDir.
//!
//! The runtime comes from, in order: ISOMAKER_APPIMAGE_RUNTIME (a file), the first bytes of an
//! AppImage the user opened (`runtimeFrom`), the tools folder (downloaded once from
//! github.com/AppImage/type2-runtime). It is only copied into the output — never run here.
//!
//! An AppDir needs AppRun, a .desktop file and an icon at its root. What the source folder
//! lacks is added inside the image (the folder itself is not changed).

use crate::archive;
use crate::squashfs::{self, Content, SquashSource};
use crate::util::*;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const ICON: &[u8] = include_bytes!("../../../assets/icon-256.png");

fn runtime_url(arch: &str) -> String {
    std::env::var("ISOMAKER_APPIMAGE_RUNTIME_URL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| format!("https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-{arch}"))
}

fn elf(b: &[u8]) -> bool {
    b.len() > 64 && archive::is_elf(b)
}

/// The runtime bytes, downloading once into the tools folder when needed.
pub fn runtime(arch: &str, from: Option<(PathBuf, u64)>) -> Res<Vec<u8>> {
    if let Some(p) = std::env::var_os("ISOMAKER_APPIMAGE_RUNTIME").filter(|v| !v.is_empty()) {
        return std::fs::read(&p).at(Path::new(&p));
    }
    if let Some((p, off)) = from.filter(|f| f.1 > 0) {
        if let Ok(b) = archive::read_runtime(&p, off) {
            if elf(&b) {
                return Ok(b);
            }
        }
    }
    let cached = crate::paths::tools_dir().join("appimage").join(format!("runtime-{arch}"));
    if let Ok(b) = std::fs::read(&cached) {
        if elf(&b) {
            return Ok(b);
        }
    }
    let b = crate::packages::download(&runtime_url(arch), &Cancel::none(), &mut |_| {})
        .map_err(|e| format!("Could not download the AppImage runtime ({e}). Check the internet connection."))?;
    if !elf(&b) {
        return err("The downloaded AppImage runtime is not an ELF program.");
    }
    std::fs::create_dir_all(cached.parent().unwrap()).at(&cached)?;
    std::fs::write(&cached, &b).at(&cached)?;
    Ok(b)
}

fn slug(name: &str) -> String {
    let mut s = String::new();
    for c in name.trim().chars() {
        if c.is_ascii_alphanumeric() || "._-".contains(c) {
            s.push(c);
        } else if !s.ends_with('-') {
            s.push('-');
        }
    }
    let s = s.trim_matches('-').to_string();
    if s.is_empty() {
        "app".into()
    } else {
        s
    }
}

/// The AppDir tree with AppRun, a .desktop entry and an icon added where missing.
pub fn app_dir_tree(source_dir: &Path, name: &str) -> Res<SquashSource> {
    let mut tree = squashfs::source_from_disk(source_dir, "")?;
    let SquashSource::Dir { children, .. } = &mut tree else { unreachable!() };
    let id = slug(name);
    let has = |children: &Vec<SquashSource>, f: &dyn Fn(&str) -> bool| children.iter().any(|c| f(c.name()));
    let file = |name: String, data: Vec<u8>, mode: u32| SquashSource::File { name, size: data.len() as u64, content: Content::Bytes(data), mode };
    if !has(children, &|n| n == "AppRun") {
        // Runs the program in usr/bin with the app's name, or the first one there.
        let script = [
            "#!/bin/sh".to_string(),
            r#"HERE="$(dirname "$(readlink -f "$0")")""#.into(),
            r#"export PATH="$HERE/usr/bin:$PATH""#.into(),
            r#"export LD_LIBRARY_PATH="$HERE/usr/lib:$LD_LIBRARY_PATH""#.into(),
            format!(r#"for exe in "$HERE/usr/bin/{id}" "$HERE/{id}" "$HERE"/usr/bin/*; do"#),
            r#"  [ -f "$exe" ] && [ -x "$exe" ] && exec "$exe" "$@""#.into(),
            "done".into(),
            r#"echo "No program found in this AppImage (put one in usr/bin)." >&2"#.into(),
            "exit 1".into(),
            String::new(),
        ]
        .join("\n");
        children.push(file("AppRun".into(), script.into_bytes(), 0o755));
    }
    let mut icon = children
        .iter()
        .filter(|c| matches!(c, SquashSource::File { .. }))
        .map(|c| c.name().to_string())
        .find(|n| n.to_lowercase().ends_with(".png") || n.to_lowercase().ends_with(".svg"))
        .map(|n| n[..n.len() - 4].to_string());
    if icon.is_none() {
        children.push(file(format!("{id}.png"), ICON.to_vec(), 0o644));
        if !has(children, &|n| n == ".DirIcon") {
            children.push(file(".DirIcon".into(), ICON.to_vec(), 0o644));
        }
        icon = Some(id.clone());
    }
    if !has(children, &|n| n.ends_with(".desktop")) {
        let shown = if name.is_empty() { id.clone() } else { name.to_string() };
        let desktop = format!(
            "[Desktop Entry]\nType=Application\nName={shown}\nExec=AppRun\nIcon={}\nCategories=Utility;\nTerminal=false\n",
            icon.unwrap_or_else(|| id.clone())
        );
        children.push(file(format!("{id}.desktop"), desktop.into_bytes(), 0o644));
    }
    Ok(tree)
}

/// Folder → AppImage. Options: { sourceDir, output, name?, arch?, runtimeFrom?: { path, offset } }.
pub fn create(opts: &Value, on_file: &dyn Fn(&str), cancel: &Cancel) -> Res<Value> {
    let source = opts.get("sourceDir").and_then(Value::as_str).unwrap_or_default();
    let output = opts.get("output").and_then(Value::as_str).unwrap_or_default();
    let src = Path::new(source);
    if !src.is_dir() {
        return err(format!("Not a folder: {source}"));
    }
    if output.is_empty() {
        return err("No output file");
    }
    let name = opts
        .get("name")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "app".into()));
    let arch = opts.get("arch").and_then(Value::as_str).unwrap_or("x86_64");
    let from = opts.get("runtimeFrom").and_then(|r| Some((PathBuf::from(r.get("path")?.as_str()?), r.get("offset")?.as_u64()?)));
    let rt = runtime(arch, from)?;
    let tree = app_dir_tree(src, &name)?;
    let size = archive::write_appimage(&rt, &tree, Path::new(output), on_file, cancel)?;
    Ok(json!({ "size": size, "offset": rt.len() }))
}
