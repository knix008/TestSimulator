//! The tree an edit session changes: folders and files, each file knowing where its bytes are
//! (inside the opened image, a file on disk, bytes in memory, or nowhere when damaged).

use crate::util::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// An image file and where its ISO 9660 file system starts (hybrid .img files have a partition
/// table first).
#[derive(Debug)]
pub struct Image {
    pub path: PathBuf,
    pub base: u64,
}

#[derive(Clone, Debug)]
pub enum Source {
    Bytes(Arc<Vec<u8>>),
    /// Extents (block number, bytes) inside the image.
    Iso { image: Arc<Image>, extents: Vec<(u64, u64)>, block: u64 },
    Path(PathBuf),
    Unavailable(String),
}

#[derive(Clone, Debug)]
pub struct FileNode {
    pub name: String,
    pub size: u64,
    pub source: Source,
    /// Unix permission bits when known (AppImage contents).
    pub mode: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct DirNode {
    pub name: String,
    /// By lower-case name.
    pub children: BTreeMap<String, Node>,
}

#[derive(Clone, Debug)]
pub enum Node {
    Dir(DirNode),
    File(FileNode),
}

impl Node {
    pub fn name(&self) -> &str {
        match self {
            Node::Dir(d) => &d.name,
            Node::File(f) => &f.name,
        }
    }
    pub fn set_name(&mut self, name: &str) {
        match self {
            Node::Dir(d) => d.name = name.to_string(),
            Node::File(f) => f.name = name.to_string(),
        }
    }
    pub fn is_dir(&self) -> bool {
        matches!(self, Node::Dir(_))
    }
}

pub fn parts(path: &str) -> Vec<&str> {
    path.split('/').filter(|p| !p.is_empty()).collect()
}

impl DirNode {
    pub fn new(name: &str) -> DirNode {
        DirNode { name: name.to_string(), children: BTreeMap::new() }
    }

    pub fn dir_at(&self, path: &str) -> Option<&DirNode> {
        let mut cur = self;
        for p in parts(path) {
            match cur.children.get(&key(p))? {
                Node::Dir(d) => cur = d,
                Node::File(_) => return None,
            }
        }
        Some(cur)
    }

    pub fn dir_at_mut(&mut self, path: &str) -> Option<&mut DirNode> {
        let mut cur = self;
        for p in parts(path) {
            match cur.children.get_mut(&key(p))? {
                Node::Dir(d) => cur = d,
                Node::File(_) => return None,
            }
        }
        Some(cur)
    }

    pub fn file_at(&self, path: &str) -> Option<&FileNode> {
        let ps = parts(path);
        let (last, dirs) = ps.split_last()?;
        match self.dir_at(&dirs.join("/"))?.children.get(&key(last))? {
            Node::File(f) => Some(f),
            Node::Dir(_) => None,
        }
    }

    /// Every entry below (path, is folder, size).
    pub fn walk(&self, prefix: &str, out: &mut Vec<(String, bool, u64)>) {
        for c in self.children.values() {
            let p = if prefix.is_empty() { c.name().to_string() } else { format!("{prefix}/{}", c.name()) };
            match c {
                Node::Dir(d) => {
                    out.push((p.clone(), true, 0));
                    d.walk(&p, out);
                }
                Node::File(f) => out.push((p, false, f.size)),
            }
        }
    }

    /// The page's tree: folders first, then by name; each { name, path, isDir, size, children? }.
    pub fn serialize(&self, parent: &str) -> Value {
        let mut kids: Vec<&Node> = self.children.values().collect();
        kids.sort_by(|a, b| b.is_dir().cmp(&a.is_dir()).then_with(|| natural_cmp(a.name(), b.name())).then_with(|| a.name().cmp(b.name())));
        Value::Array(
            kids.into_iter()
                .map(|n| {
                    let p = if parent.is_empty() { n.name().to_string() } else { format!("{parent}/{}", n.name()) };
                    match n {
                        Node::Dir(d) => json!({ "name": d.name, "path": p, "isDir": true, "size": 0, "children": d.serialize(&p) }),
                        Node::File(f) => json!({ "name": f.name, "path": p, "isDir": false, "size": f.size }),
                    }
                })
                .collect(),
        )
    }
}

/// Opens a reader over a file's bytes.
pub fn open_source(f: &FileNode) -> Res<Box<dyn Read + Send>> {
    match &f.source {
        Source::Bytes(b) => Ok(Box::new(std::io::Cursor::new(b.as_ref().clone()))),
        Source::Path(p) => Ok(Box::new(File::open(p).at(p)?)),
        Source::Unavailable(reason) => err(reason.clone()),
        Source::Iso { image, extents, block } => Ok(Box::new(ExtentReader::new(image.clone(), extents.clone(), *block)?)),
    }
}

/// Reads a file's extents from the image one after another.
pub struct ExtentReader {
    file: File,
    base: u64,
    block: u64,
    extents: Vec<(u64, u64)>,
    index: usize,
    left: u64,
}

impl ExtentReader {
    pub fn new(image: Arc<Image>, extents: Vec<(u64, u64)>, block: u64) -> Res<ExtentReader> {
        let file = File::open(&image.path).at(&image.path)?;
        let mut r = ExtentReader { file, base: image.base, block, extents, index: 0, left: 0 };
        r.seek_extent()?;
        Ok(r)
    }
    fn seek_extent(&mut self) -> Res<()> {
        if let Some(&(lba, size)) = self.extents.get(self.index) {
            self.file.seek(SeekFrom::Start(self.base + lba * self.block)).map_err(|e| e.to_string())?;
            self.left = size;
        } else {
            self.left = 0;
        }
        Ok(())
    }
}

impl Read for ExtentReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        loop {
            if self.index >= self.extents.len() {
                return Ok(0);
            }
            if self.left == 0 {
                self.index += 1;
                self.seek_extent().map_err(std::io::Error::other)?;
                continue;
            }
            let n = (buf.len() as u64).min(self.left) as usize;
            let got = self.file.read(&mut buf[..n])?;
            if got == 0 {
                return Ok(0);
            }
            self.left -= got as u64;
            return Ok(got);
        }
    }
}

/// Writes a file node's bytes to `dest`.
pub fn write_file_to(f: &FileNode, dest: &Path, cancel: &Cancel) -> Res<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).at(parent)?;
    }
    if let Source::Path(p) = &f.source {
        std::fs::copy(p, dest).at(p)?;
        return Ok(());
    }
    let mut r = open_source(f)?;
    let mut out = std::io::BufWriter::new(File::create(dest).at(dest)?);
    copy_n(&mut r, &mut out, f.size, cancel)?;
    out.flush().at(dest)?;
    Ok(())
}

/// A folder on disk as a tree (files stay on disk; links are left out).
pub fn tree_from_directory(dir: &Path, modes: Option<&std::collections::HashMap<String, u32>>) -> DirNode {
    let mut root = DirNode::new("");
    fill(dir, "", &mut root, modes);
    root
}

fn fill(dir: &Path, rel: &str, node: &mut DirNode, modes: Option<&std::collections::HashMap<String, u32>>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for d in rd.flatten() {
        let name = d.file_name().to_string_lossy().to_string();
        let Ok(meta) = std::fs::symlink_metadata(d.path()) else { continue };
        // Links are skipped: Linux images extracted on Windows often have broken ones.
        if meta.file_type().is_symlink() {
            continue;
        }
        let r = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        if meta.is_dir() {
            let mut child = DirNode::new(&name);
            fill(&d.path(), &r, &mut child, modes);
            node.children.insert(key(&name), Node::Dir(child));
        } else if meta.is_file() {
            let mode = modes.and_then(|m| m.get(&r).copied()).or_else(|| unix_mode(&meta));
            node.children.insert(key(&name), Node::File(FileNode { name, size: meta.len(), source: Source::Path(d.path()), mode }));
        }
    }
}

#[cfg(unix)]
pub fn unix_mode(meta: &std::fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    Some(meta.permissions().mode() & 0o7777)
}
#[cfg(not(unix))]
pub fn unix_mode(_meta: &std::fs::Metadata) -> Option<u32> {
    None
}
