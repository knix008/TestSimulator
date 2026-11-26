//! The left explorer: drives / quick places and folder listings.

use crate::util::*;
use serde_json::{json, Value};
use std::path::Path;

/// A disc image the app opens (.iso .img .appimage .tar .tgz .tar.gz).
pub fn is_image_name(name: &str) -> bool {
    let n = name.to_lowercase();
    [".iso", ".img", ".appimage", ".tar", ".tgz", ".tar.gz"].iter().any(|e| n.ends_with(e))
}

pub fn places() -> Value {
    let home = home_dir();
    let mut out = Vec::new();
    let mut add = |id: &str, name: String, p: &Path, kind: &str| {
        if p.is_dir() {
            out.push(json!({ "id": id, "name": name, "path": p.to_string_lossy(), "kind": kind }));
        }
    };
    let home_name = home.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| home.to_string_lossy().to_string());
    add("home", home_name, &home, "home");
    add("desktop", "Desktop".into(), &home.join("Desktop"), "desktop");
    add("documents", "Documents".into(), &home.join("Documents"), "documents");
    add("downloads", "Downloads".into(), &home.join("Downloads"), "downloads");
    if cfg!(windows) {
        for c in b'C'..=b'Z' {
            let d = format!("{}:\\", c as char);
            if std::fs::metadata(&d).is_ok() {
                out.push(json!({ "id": format!("drive-{}", c as char), "name": format!("{}:", c as char), "path": d, "kind": "drive" }));
            }
        }
    } else {
        out.push(json!({ "id": "root", "name": "/", "path": "/", "kind": "root" }));
    }
    Value::Array(out)
}

fn entry(name: String, path: &Path, meta: &std::fs::Metadata) -> Value {
    let is_dir = meta.is_dir();
    json!({
        "name": name,
        "path": path.to_string_lossy(),
        "isDir": is_dir,
        "size": if is_dir { 0 } else { meta.len() },
        "mtime": mtime_ms(meta),
        "image": !is_dir && is_image_name(&path.to_string_lossy()),
    })
}

pub fn list(dir: &str) -> Res<Value> {
    let rd = std::fs::read_dir(dir).at(Path::new(dir))?;
    let mut rows: Vec<(bool, String, Value)> = Vec::new();
    for d in rd.flatten() {
        let name = d.file_name().to_string_lossy().to_string();
        if name.starts_with('$') || name == "System Volume Information" {
            continue;
        }
        let p = d.path();
        match std::fs::metadata(&p) {
            Ok(meta) => rows.push((meta.is_dir(), name.clone(), entry(name, &p, &meta))),
            Err(_) => {
                // A broken link is left out; anything else shows as a plain entry.
                if d.file_type().map(|t| t.is_symlink()).unwrap_or(false) {
                    continue;
                }
                let is_dir = d.file_type().map(|t| t.is_dir()).unwrap_or(false);
                rows.push((is_dir, name.clone(), json!({ "name": name, "path": p.to_string_lossy(), "isDir": is_dir, "size": 0, "mtime": 0, "image": !is_dir && is_image_name(&name) })));
            }
        }
    }
    rows.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| natural_cmp(&a.1, &b.1)));
    Ok(Value::Array(rows.into_iter().map(|r| r.2).collect()))
}

pub fn stat(p: &str) -> Value {
    let path = Path::new(p);
    match std::fs::metadata(path) {
        Ok(meta) => {
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| p.to_string());
            entry(name, path, &meta)
        }
        Err(_) => Value::Null,
    }
}
