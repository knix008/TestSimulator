//! AppImages (ELF runtime + SquashFS) and Docker save / tar archives: telling them apart,
//! unpacking them into a temp folder to edit, and writing a tree back as tar or AppImage.

use crate::squashfs::{self, Content, SquashError, SquashSource, Squashfs};
use crate::tree::*;
use crate::util::*;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// "iso" | "img" | "appimage" | "docker" | "unknown", from the file name.
pub fn guess_kind_by_name(path: &str) -> &'static str {
    let base = path.rsplit(['/', '\\']).next().unwrap_or(path).to_lowercase();
    if base.ends_with(".appimage") {
        "appimage"
    } else if base.ends_with(".iso") {
        "iso"
    } else if base.ends_with(".img") {
        "img"
    } else if base.ends_with(".tar.gz") || base.ends_with(".tgz") || base.ends_with(".tar") || base.ends_with(".docker") {
        "docker"
    } else {
        "unknown"
    }
}

pub fn is_gzip_tar_name(path: &str) -> bool {
    let l = path.to_lowercase();
    l.ends_with(".tgz") || l.ends_with(".tar.gz")
}

fn head(path: &Path, n: usize) -> Vec<u8> {
    let mut buf = vec![0u8; n];
    let got = File::open(path).and_then(|mut f| f.read(&mut buf)).unwrap_or(0);
    buf.truncate(got);
    buf
}

pub fn is_elf(b: &[u8]) -> bool {
    b.len() >= 4 && b[..4] == [0x7f, b'E', b'L', b'F']
}

/// Where the SquashFS of an AppImage starts: right after the ELF runtime (end of its section
/// headers, what the runtime itself computes), else the first "hsqs".
pub fn find_squashfs_offset(path: &Path) -> Option<u64> {
    let h = head(path, 64);
    if is_elf(&h) && h.len() >= 64 {
        let le = h[5] == 1;
        let (end, ok) = if h[4] == 2 {
            let rd64 = |o: usize| if le { u64::from_le_bytes(h[o..o + 8].try_into().unwrap()) } else { u64::from_be_bytes(h[o..o + 8].try_into().unwrap()) };
            let rd16 = |o: usize| if le { u16::from_le_bytes([h[o], h[o + 1]]) } else { u16::from_be_bytes([h[o], h[o + 1]]) } as u64;
            (rd64(0x28) + rd16(0x3a) * rd16(0x3c), true)
        } else if h[4] == 1 {
            let rd32 = |o: usize| if le { u32::from_le_bytes(h[o..o + 4].try_into().unwrap()) } else { u32::from_be_bytes(h[o..o + 4].try_into().unwrap()) } as u64;
            let rd16 = |o: usize| if le { u16::from_le_bytes([h[o], h[o + 1]]) } else { u16::from_be_bytes([h[o], h[o + 1]]) } as u64;
            (rd32(0x20) + rd16(0x2e) * rd16(0x30), true)
        } else {
            (0, false)
        };
        if ok && end > 0 {
            let mut f = File::open(path).ok()?;
            let mut magic = [0u8; 4];
            if f.seek(SeekFrom::Start(end)).is_ok() && f.read_exact(&mut magic).is_ok() && &magic == b"hsqs" {
                return Some(end);
            }
        }
    }
    scan_for(path, b"hsqs")
}

fn scan_for(path: &Path, needle: &[u8]) -> Option<u64> {
    let mut f = File::open(path).ok()?;
    let mut buf = vec![0u8; 1024 * 1024];
    let mut offset = 0u64;
    loop {
        f.seek(SeekFrom::Start(offset)).ok()?;
        let n = f.read(&mut buf).ok()?;
        if n < needle.len() {
            return None;
        }
        if let Some(i) = buf[..n].windows(needle.len()).position(|w| w == needle) {
            return Some(offset + i as u64);
        }
        offset += (n - (needle.len() - 1)) as u64;
    }
}

pub fn is_appimage_file(path: &Path) -> bool {
    is_elf(&head(path, 4)) && find_squashfs_offset(path).is_some()
}

pub fn looks_like_tar(path: &Path) -> bool {
    let h = head(path, 512);
    if h.len() < 265 {
        return false;
    }
    (h[0] == 0x1f && h[1] == 0x8b) || &h[257..262] == b"ustar"
}

pub fn detect_open_kind(path: &Path, hinted: &'static str) -> &'static str {
    if hinted != "unknown" {
        return hinted;
    }
    if is_appimage_file(path) {
        "appimage"
    } else if looks_like_tar(path) {
        "docker"
    } else {
        "unknown"
    }
}

/// The image's name as a volume label (upper case, at most 32).
pub fn volume_label_from_path(path: &str) -> String {
    let base = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let lower = base.to_lowercase();
    let mut stem = base.to_string();
    if lower.ends_with(".tar.gz") {
        stem.truncate(base.len() - 7);
    } else {
        for e in [".appimage", ".tar", ".tgz", ".docker", ".iso", ".img"] {
            if lower.ends_with(e) {
                stem.truncate(base.len() - e.len());
                break;
            }
        }
    }
    let mut cleaned = String::new();
    for c in stem.chars() {
        if c.is_ascii_alphanumeric() || "_.-".contains(c) {
            cleaned.push(c);
        } else if !cleaned.ends_with('_') {
            cleaned.push('_');
        }
    }
    let cleaned = cleaned.trim_matches('_');
    let out: String = if cleaned.is_empty() { "IMAGE".into() } else { cleaned.chars().take(32).collect() };
    out.to_uppercase()
}

pub struct Extracted {
    /// The temp folder (deleted when the session closes).
    pub root: PathBuf,
    pub tree: DirNode,
    pub squashfs_offset: Option<u64>,
}

/// Unpacks an AppImage or tar into a fresh temp folder.
pub fn extract_to_temp(path: &Path, kind: &str, cancel: &Cancel) -> Res<Extracted> {
    let root = temp_dir("isomaker-extract-")?;
    let r = if kind == "appimage" { extract_appimage(path, &root, cancel) } else { extract_tar(path, &root).map(|_| (tree_from_directory(&root, None), None)) };
    match r {
        Ok((tree, offset)) => Ok(Extracted { root, tree, squashfs_offset: offset }),
        Err(e) => {
            let _ = std::fs::remove_dir_all(&root);
            Err(e)
        }
    }
}

fn extract_appimage(path: &Path, dest: &Path, cancel: &Cancel) -> Res<(DirNode, Option<u64>)> {
    let Some(offset) = find_squashfs_offset(path) else { return err("AppImage에서 squashfs(hsqs) 시그니처를 찾지 못했습니다.") };
    let out = dest.join("root");
    // Built in first (gzip / zstd need no tools); other compressions fall through.
    match Squashfs::open(path, offset).and_then(|mut sq| sq.extract_to(&out, cancel)) {
        Ok(entries) => {
            let modes: HashMap<String, u32> = entries.iter().filter(|e| e.kind == "file").map(|e| (e.path.clone(), e.mode & 0o7777)).collect();
            return Ok((tree_from_directory(&out, Some(&modes)), Some(offset)));
        }
        Err(SquashError::Unsupported(_)) => {}
        Err(e) => return err(e.to_string()),
    }
    if let Some(unsquashfs) = crate::packages::find_tool("unsquashfs") {
        std::fs::create_dir_all(&out).at(&out)?;
        let mut cmd = std::process::Command::new(&unsquashfs);
        cmd.args(["-f", "-o", &offset.to_string(), "-d"]).arg(&out).arg(path);
        crate::packages::with_tool_path(&mut cmd, &unsquashfs);
        run_ok(&mut cmd)?;
        return Ok((tree_from_directory(&out, None), Some(offset)));
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755));
        let mut cmd = std::process::Command::new(path);
        cmd.arg("--appimage-extract").current_dir(dest);
        if run_ok(&mut cmd).is_ok() && dest.join("squashfs-root").is_dir() {
            return Ok((tree_from_directory(&dest.join("squashfs-root"), None), Some(offset)));
        }
    }
    err("AppImage를 풀 수 없습니다. squashfs-tools(unsquashfs)를 설치한 뒤 다시 시도하세요.\n\
         Windows: 설정 › 패키지에서 squashfs-tools 설치\n\
         macOS: `brew install squashfs`\n\
         Linux: `sudo apt install squashfs-tools` (또는 AppImage 실행 권한)")
}

/// Unpacks a tar (.tar, .tgz, .tar.gz, Docker save). Links are left out (Windows cannot
/// make most of them; nothing in the editor shows them).
fn extract_tar(path: &Path, dest: &Path) -> Res<()> {
    let f = File::open(path).at(path)?;
    let h = head(path, 2);
    let reader: Box<dyn Read> = if h.len() == 2 && h[0] == 0x1f && h[1] == 0x8b { Box::new(flate2::read::GzDecoder::new(f)) } else { Box::new(f) };
    let mut ar = tar::Archive::new(reader);
    ar.set_preserve_permissions(cfg!(unix));
    ar.set_overwrite(true);
    for entry in ar.entries().map_err(|e| format!("tar: {e}"))? {
        let mut entry = entry.map_err(|e| format!("tar: {e}"))?;
        let t = entry.header().entry_type();
        if !(t.is_file() || t.is_dir() || t == tar::EntryType::Continuous || t == tar::EntryType::GNUSparse) {
            continue;
        }
        entry.unpack_in(dest).map_err(|e| format!("tar: {e}"))?;
    }
    Ok(())
}

// ── Saving ───────────────────────────────────────────────────

fn each_entry<'a>(dir: &'a DirNode, prefix: &str, out: &mut Vec<(String, &'a Node)>) {
    for c in dir.children.values() {
        let p = if prefix.is_empty() { c.name().to_string() } else { format!("{prefix}/{}", c.name()) };
        out.push((p.clone(), c));
        if let Node::Dir(d) = c {
            each_entry(d, &p, out);
        }
    }
}

/// The tree as a tar (gzip when `gzip`), written straight from where each file is.
pub fn write_tar(root: &DirNode, output: &Path, gzip: bool, progress: &dyn Fn(f64, &str), cancel: &Cancel) -> Res<()> {
    let mut entries = Vec::new();
    each_entry(root, "", &mut entries);
    let files = entries.iter().filter(|e| !e.1.is_dir()).count().max(1);
    let part = PathBuf::from(format!("{}.part", output.display()));
    let file = File::create(&part).at(&part)?;
    let writer: Box<dyn Write> = if gzip { Box::new(flate2::write::GzEncoder::new(file, flate2::Compression::default())) } else { Box::new(std::io::BufWriter::new(file)) };
    let mut b = tar::Builder::new(writer);
    let mtime = now_secs().max(0) as u64;
    let mut done = 0;
    let r: Res<()> = (|| {
        for (p, node) in &entries {
            cancel.check()?;
            let mut h = tar::Header::new_gnu();
            h.set_mtime(mtime);
            match node {
                Node::Dir(_) => {
                    h.set_entry_type(tar::EntryType::Directory);
                    h.set_mode(0o755);
                    h.set_size(0);
                    b.append_data(&mut h, format!("{p}/"), std::io::empty()).map_err(|e| format!("tar: {e}"))?;
                }
                Node::File(f) => {
                    h.set_entry_type(tar::EntryType::Regular);
                    h.set_mode(f.mode.unwrap_or(0o644));
                    h.set_size(f.size);
                    let r = open_source(f)?;
                    b.append_data(&mut h, p, r.take(f.size)).map_err(|e| format!("tar {p}: {e}"))?;
                    done += 1;
                    progress(((done as f64 / files as f64) * 95.0).round(), &format!("tar 작성 중… ({done}/{files})"));
                }
            }
        }
        let w = b.into_inner().map_err(|e| format!("tar: {e}"))?;
        drop(w);
        Ok(())
    })();
    if let Err(e) = r {
        let _ = std::fs::remove_file(&part);
        return Err(e);
    }
    replace_file(&part, output)
}

/// Moves a finished `.part` over the output.
pub fn replace_file(part: &Path, output: &Path) -> Res<()> {
    if std::fs::rename(part, output).is_ok() {
        return Ok(());
    }
    let _ = std::fs::remove_file(output);
    std::fs::rename(part, output).map_err(|e| {
        let _ = std::fs::remove_file(part);
        format!("{}: {e}", output.display())
    })
}

/// A session tree as a SquashFS source (files are read from where they are).
pub fn squash_source(dir: &DirNode, parent_name: &str) -> SquashSource {
    let mut children = Vec::new();
    for c in dir.children.values() {
        match c {
            Node::Dir(d) => children.push(squash_source(d, &d.name.to_lowercase())),
            Node::File(f) => {
                let mode = f.mode.map(|m| m & 0o777).unwrap_or_else(|| squashfs::guess_mode(&f.name, parent_name));
                let content = match &f.source {
                    Source::Path(p) => Content::Path(p.clone()),
                    Source::Bytes(b) => Content::Bytes(b.as_ref().clone()),
                    _ => {
                        let node = f.clone();
                        Content::Reader(Box::new(move || open_source(&node)))
                    }
                };
                children.push(SquashSource::File { name: f.name.clone(), content, size: f.size, mode });
            }
        }
    }
    SquashSource::Dir { name: dir.name.clone(), children, mode: 0o755 }
}

/// Runtime bytes (before the SquashFS) of an AppImage.
pub fn read_runtime(path: &Path, offset: u64) -> Res<Vec<u8>> {
    let mut f = File::open(path).at(path)?;
    let mut buf = vec![0u8; offset as usize];
    f.read_exact(&mut buf).at(path)?;
    Ok(buf)
}

/// Runtime + SquashFS of `source` into `output` (through `output.part`).
pub fn write_appimage(runtime: &[u8], source: &SquashSource, output: &Path, on_file: &dyn Fn(&str), cancel: &Cancel) -> Res<u64> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).at(parent)?;
    }
    let part = PathBuf::from(format!("{}.part", output.display()));
    let r = (|| {
        let mut f = File::create(&part).at(&part)?;
        f.write_all(runtime).at(&part)?;
        let size = squashfs::write_squashfs(&mut f, runtime.len() as u64, source, on_file, cancel)?;
        f.flush().at(&part)?;
        Ok::<u64, String>(size)
    })();
    let size = match r {
        Ok(s) => s,
        Err(e) => {
            let _ = std::fs::remove_file(&part);
            return Err(e);
        }
    };
    replace_file(&part, output)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(output, std::fs::Permissions::from_mode(0o755));
    }
    Ok(runtime.len() as u64 + size)
}
