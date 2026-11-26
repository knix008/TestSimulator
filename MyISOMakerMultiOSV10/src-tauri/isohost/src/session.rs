//! The open image the user edits: ISO / IMG (read in place), AppImage and Docker tar (unpacked
//! to a temp folder). Changes stay in the tree until saved as ISO, IMG, tar(.gz) or AppImage.

use crate::archive;
use crate::iso_read;
use crate::iso_write;
use crate::tree::*;
use crate::util::*;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Default)]
pub struct Session {
    open: Option<Open>,
    /// entry path → (temp file, name, made by us)
    drag_cache: HashMap<String, (PathBuf, String, bool)>,
}

struct Open {
    root: DirNode,
    volume_label: String,
    dirty: bool,
    source_path: PathBuf,
    /// "iso" | "img" | "appimage" | "docker"
    source_kind: &'static str,
    /// The opened AppImage and where its SquashFS starts (its runtime is reused on save).
    runtime: Option<(PathBuf, u64)>,
    /// Temp folder of an unpacked AppImage / tar.
    extract_root: Option<PathBuf>,
}

impl Drop for Open {
    fn drop(&mut self) {
        if let Some(d) = self.extract_root.take() {
            let _ = std::fs::remove_dir_all(d);
        }
    }
}

fn absolute(p: &str) -> PathBuf {
    let path = Path::new(p);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().map(|d| d.join(path)).unwrap_or_else(|_| path.to_path_buf())
    }
}

fn join(dir: &str, name: &str) -> String {
    if dir.is_empty() {
        name.to_string()
    } else {
        format!("{dir}/{name}")
    }
}

impl Session {
    pub fn is_dirty(&self) -> bool {
        self.open.as_ref().is_some_and(|o| o.dirty)
    }

    pub fn source_path(&self) -> Value {
        self.open.as_ref().map(|o| Value::String(o.source_path.to_string_lossy().to_string())).unwrap_or(Value::Null)
    }

    fn need(&mut self) -> Res<&mut Open> {
        self.open.as_mut().ok_or_else(|| "열린 ISO가 없습니다.".to_string())
    }

    pub fn snapshot(&self) -> Value {
        let Some(o) = &self.open else { return Value::Null };
        let mut all = Vec::new();
        o.root.walk("", &mut all);
        let total: u64 = all.iter().filter(|e| !e.1).map(|e| e.2).sum();
        json!({
            "sourcePath": o.source_path.to_string_lossy(),
            "sourceKind": o.source_kind,
            "dirty": o.dirty,
            "canSaveAppImage": o.runtime.is_some(),
            "volumeLabel": o.volume_label,
            "totalBytes": total,
            "entryCount": all.len(),
            "root": o.root.serialize(""),
        })
    }

    pub fn close(&mut self) {
        self.clear_drag();
        self.open = None;
    }

    pub fn open(&mut self, path: &str) -> Res<Value> {
        let resolved = absolute(path);
        if !resolved.is_file() {
            return err(format!("파일을 찾을 수 없습니다: {}", resolved.display()));
        }
        self.close();
        let hinted = archive::guess_kind_by_name(&resolved.to_string_lossy());
        let kind = archive::detect_open_kind(&resolved, hinted);
        if kind == "appimage" || kind == "docker" {
            return self.open_archive(&resolved, kind);
        }
        match iso_read::open_iso(&resolved) {
            Ok(opened) => {
                self.open = Some(Open {
                    root: opened.root,
                    volume_label: opened.volume_label,
                    dirty: false,
                    source_path: resolved,
                    source_kind: if kind == "img" { "img" } else { "iso" },
                    runtime: None,
                    extract_root: None,
                });
                Ok(self.snapshot())
            }
            Err(iso_err) => {
                // Misnamed files: try AppImage, then tar.
                if archive::is_appimage_file(&resolved) {
                    return self.open_archive(&resolved, "appimage");
                }
                if archive::looks_like_tar(&resolved) {
                    return self.open_archive(&resolved, "docker");
                }
                Err(iso_err)
            }
        }
    }

    fn open_archive(&mut self, path: &Path, kind: &'static str) -> Res<Value> {
        let ex = archive::extract_to_temp(path, kind, &Cancel::none())?;
        let runtime = if kind == "appimage" { ex.squashfs_offset.filter(|&o| o > 0).map(|o| (path.to_path_buf(), o)) } else { None };
        self.open = Some(Open {
            root: ex.tree,
            volume_label: archive::volume_label_from_path(&path.to_string_lossy()),
            dirty: false,
            source_path: path.to_path_buf(),
            source_kind: kind,
            runtime,
            extract_root: Some(ex.root),
        });
        Ok(self.snapshot())
    }

    pub fn add_paths(&mut self, dest: &str, paths: &[String]) -> Res<Value> {
        let o = self.need()?;
        if o.root.dir_at(dest).is_none() {
            return err(format!("폴더가 없습니다: {}", if dest.is_empty() { "/" } else { dest }));
        }
        for p in paths {
            let src = absolute(p);
            if !src.exists() {
                continue;
            }
            let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| p.clone());
            add_recursive(&mut o.root, dest, &src, &name)?;
            o.dirty = true;
        }
        self.invalidate(dest);
        Ok(self.snapshot())
    }

    pub fn remove(&mut self, entry: &str) -> Res<Value> {
        remove_entry(&mut self.need()?.root, entry)?;
        self.need()?.dirty = true;
        self.invalidate(entry);
        Ok(self.snapshot())
    }

    pub fn remove_many(&mut self, entries: &[String]) -> Res<Value> {
        let o = self.need()?;
        let mut list: Vec<&String> = entries.iter().collect();
        list.sort_by_key(|p| std::cmp::Reverse(parts(p).len()));
        list.dedup();
        let mut removed = Vec::new();
        for e in list {
            if remove_entry(&mut o.root, e).is_ok() {
                o.dirty = true;
                removed.push(e.clone());
            }
        }
        for e in removed {
            self.invalidate(&e);
        }
        Ok(self.snapshot())
    }

    pub fn mkdir(&mut self, dir: &str, name: &str) -> Res<Value> {
        check_name(name)?;
        let o = self.need()?;
        let parent = o.root.dir_at_mut(dir).ok_or_else(|| format!("폴더가 없습니다: {}", if dir.is_empty() { "/" } else { dir }))?;
        if parent.children.contains_key(&key(name)) {
            return err(format!("이미 존재합니다: {name}"));
        }
        parent.children.insert(key(name), Node::Dir(DirNode::new(name)));
        o.dirty = true;
        Ok(self.snapshot())
    }

    pub fn rename(&mut self, entry: &str, new_name: &str) -> Res<Value> {
        check_name(new_name)?;
        let o = self.need()?;
        let ps = parts(entry);
        let Some((old, dirs)) = ps.split_last() else { return err("루트 이름은 변경할 수 없습니다.") };
        let parent = o.root.dir_at_mut(&dirs.join("/")).ok_or_else(|| format!("경로가 없습니다: {entry}"))?;
        if !parent.children.contains_key(&key(old)) {
            return err(format!("항목이 없습니다: {entry}"));
        }
        if key(old) != key(new_name) && parent.children.contains_key(&key(new_name)) {
            return err(format!("이미 존재합니다: {new_name}"));
        }
        let mut node = parent.children.remove(&key(old)).unwrap();
        node.set_name(new_name);
        parent.children.insert(key(new_name), node);
        o.dirty = true;
        self.invalidate(entry);
        Ok(self.snapshot())
    }

    fn file(&mut self, entry: &str) -> Res<FileNode> {
        self.need()?.root.file_at(entry).cloned().ok_or_else(|| format!("파일이 없습니다: {entry}"))
    }

    pub fn export_file(&mut self, entry: &str, output: &str) -> Res<Value> {
        let f = self.file(entry)?;
        let out = absolute(output);
        write_file_to(&f, &out, &Cancel::none())?;
        Ok(json!({ "ok": true, "outputPath": out.to_string_lossy() }))
    }

    pub fn export_files_to_dir(&mut self, entries: &[String], dir: &str) -> Res<Value> {
        let dir = absolute(dir);
        std::fs::create_dir_all(&dir).at(&dir)?;
        let mut count = 0;
        for e in entries {
            let Ok(f) = self.file(e) else { continue };
            let dest = unique_dest(&dir, &safe_name(&f.name));
            write_file_to(&f, &dest, &Cancel::none())?;
            count += 1;
        }
        Ok(json!({ "ok": true, "count": count, "outputDir": dir.to_string_lossy() }))
    }

    /// A file of the session as a real file, for dragging it out of the window.
    pub fn prepare_drag_out(&mut self, entry: &str) -> Res<Value> {
        if self.open.is_none() {
            // A hover can ask after closing: not an error.
            return Ok(json!({ "tempPath": "", "name": "" }));
        }
        if let Some((p, name, _)) = self.drag_cache.get(entry) {
            if p.exists() {
                return Ok(json!({ "tempPath": p.to_string_lossy(), "name": name }));
            }
        }
        let f = self.file(entry)?;
        // Files of an unpacked image or added from disk are used where they are.
        if let Source::Path(p) = &f.source {
            if p.exists() {
                self.drag_cache.insert(entry.to_string(), (p.clone(), f.name.clone(), false));
                return Ok(json!({ "tempPath": p.to_string_lossy(), "name": f.name }));
            }
        }
        let dir = std::env::temp_dir().join(format!("isomaker-drag-{}", tag()));
        std::fs::create_dir_all(&dir).at(&dir)?;
        // Keep the real name (that is what the drop target gets).
        let temp = dir.join(safe_name(&f.name));
        write_file_to(&f, &temp, &Cancel::none())?;
        self.drag_cache.insert(entry.to_string(), (temp.clone(), f.name.clone(), true));
        Ok(json!({ "tempPath": temp.to_string_lossy(), "name": f.name }))
    }

    pub fn prepare_drag_out_many(&mut self, entries: &[String]) -> Res<Value> {
        let mut temps = Vec::new();
        let mut names = Vec::new();
        for e in entries {
            let v = self.prepare_drag_out(e)?;
            temps.push(v["tempPath"].clone());
            names.push(v["name"].clone());
        }
        Ok(json!({ "tempPaths": temps, "names": names }))
    }

    fn drop_temp(p: &Path) {
        let _ = std::fs::remove_file(p);
        if let Some(dir) = p.parent().filter(|d| d.file_name().is_some_and(|n| n.to_string_lossy().starts_with("isomaker-drag-"))) {
            let _ = std::fs::remove_dir(dir);
        }
    }

    fn invalidate(&mut self, prefix: &str) {
        let keys: Vec<String> = self.drag_cache.keys().filter(|k| prefix.is_empty() || *k == prefix || k.starts_with(&format!("{prefix}/"))).cloned().collect();
        for k in keys {
            if let Some((p, _, owned)) = self.drag_cache.remove(&k) {
                if owned {
                    Self::drop_temp(&p);
                }
            }
        }
    }

    fn clear_drag(&mut self) {
        for (_, (p, _, owned)) in self.drag_cache.drain() {
            if owned {
                Self::drop_temp(&p);
            }
        }
    }

    /// Saves as the output's kind (by its extension; none = ISO).
    pub fn save(&mut self, output: &str, progress: Progress, cancel: &Cancel) -> Res<Value> {
        let out = absolute(output);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).at(parent)?;
        }
        cancel.check()?;
        let kind = match archive::guess_kind_by_name(&out.to_string_lossy()) {
            "unknown" => "iso",
            k => k,
        };
        let o = self.need()?;
        let same_as_source = same_file(&out, &o.source_path);
        let say = |p: f64, m: &str| progress("save", Some(p), m);
        match kind {
            "iso" | "img" => {
                progress("save", Some(0.0), "ISO/IMG 작성 중…");
                let part = PathBuf::from(format!("{}.part", out.display()));
                let r = (|| {
                    let mut f = std::io::BufWriter::new(std::fs::File::create(&part).at(&part)?);
                    iso_write::write_iso(&o.root, &o.volume_label, &mut f, &say, cancel)?;
                    use std::io::Write;
                    f.flush().at(&part)?;
                    Ok::<(), String>(())
                })();
                if let Err(e) = r {
                    let _ = std::fs::remove_file(&part);
                    return Err(e);
                }
                archive::replace_file(&part, &out)?;
            }
            "docker" => archive::write_tar(&o.root, &out, archive::is_gzip_tar_name(&out.to_string_lossy()), &say, cancel)?,
            "appimage" => {
                let Some((rt_path, offset)) = o.runtime.clone() else {
                    return err(
                        "AppImage로 저장하려면 원본 AppImage를 연 상태에서 저장해야 합니다.\n\
                         (런타임 ELF가 필요합니다. 폴더에서 AppImage를 만들려면 'AppImage 만들기'를 쓰세요.)\n\
                         대신 .iso / .img / .tar 로 저장할 수 있습니다.",
                    );
                };
                let runtime = archive::read_runtime(&rt_path, offset)
                    .map_err(|e| format!("AppImage 런타임을 찾을 수 없습니다: {e}\nAppImage로 저장하려면 원본 AppImage를 연 뒤 저장하세요."))?;
                progress("save", Some(10.0), "squashfs 작성 중… (내장)");
                let source = archive::squash_source(&o.root, "");
                let count = std::sync::atomic::AtomicUsize::new(0);
                archive::write_appimage(&runtime, &source, &out, &|_| {
                    let n = count.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                    if n % 20 == 0 {
                        progress("save", None, &format!("squashfs 작성 중… ({n})"));
                    }
                }, cancel)?;
            }
            _ => return err(format!("지원하지 않는 저장 형식: {}", out.display())),
        }
        cancel.check()?;
        progress("save", Some(100.0), "저장 완료");
        // Saved over the opened image: its old bytes are gone, so read the new one.
        if same_as_source {
            let label = self.need()?.volume_label.clone();
            self.open(&out.to_string_lossy())?;
            if let Some(o) = self.open.as_mut() {
                o.volume_label = label;
            }
        } else {
            self.need()?.dirty = false;
        }
        Ok(self.snapshot())
    }
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

fn check_name(name: &str) -> Res<()> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        return err(format!("쓸 수 없는 이름입니다: {name}"));
    }
    Ok(())
}

fn remove_entry(root: &mut DirNode, entry: &str) -> Res<()> {
    let ps = parts(entry);
    let Some((name, dirs)) = ps.split_last() else { return err("루트는 삭제할 수 없습니다.") };
    let parent = root.dir_at_mut(&dirs.join("/")).ok_or_else(|| format!("경로가 없습니다: {entry}"))?;
    parent.children.remove(&key(name)).map(|_| ()).ok_or_else(|| format!("항목이 없습니다: {entry}"))
}

fn add_recursive(root: &mut DirNode, dest: &str, src: &Path, name: &str) -> Res<()> {
    let meta = std::fs::metadata(src).at(src)?;
    let parent = root.dir_at_mut(dest).ok_or_else(|| format!("폴더가 없습니다: {}", if dest.is_empty() { "/" } else { dest }))?;
    if meta.is_dir() {
        match parent.children.get(&key(name)) {
            Some(Node::Dir(_)) => {}
            Some(Node::File(_)) => return err(format!("이미 파일이 있습니다: {name}")),
            None => {
                parent.children.insert(key(name), Node::Dir(DirNode::new(name)));
            }
        }
        let next = join(dest, name);
        let mut kids: Vec<_> = std::fs::read_dir(src).at(src)?.flatten().collect();
        kids.sort_by_key(|d| d.file_name());
        for d in kids {
            add_recursive(root, &next, &d.path(), &d.file_name().to_string_lossy())?;
        }
        return Ok(());
    }
    // A path reference: large files go in without being read into memory.
    parent.children.insert(key(name), Node::File(FileNode { name: name.to_string(), size: meta.len(), source: Source::Path(src.to_path_buf()), mode: unix_mode(&meta) }));
    Ok(())
}

/// `iso:listTree`: an image's tree without opening a session.
pub fn list_tree(path: &str) -> Res<Value> {
    let resolved = absolute(path);
    if !resolved.is_file() {
        return err(format!("ISO file not found: {}", resolved.display()));
    }
    let o = iso_read::open_iso(&resolved)?;
    Ok(json!({ "volumeLabel": o.volume_label, "totalBytes": o.total_bytes, "entryCount": o.entry_count, "root": o.root.serialize("") }))
}
