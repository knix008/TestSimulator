//! Where the engine reads and writes. The desktop app uses the real disk; the web build has no
//! disk, so it keeps every file in memory. The formats only ever see this trait, which is what
//! makes one engine serve both - and lets the tests run each operation against both.

use std::collections::BTreeMap;
use std::io::{self, Cursor, Read, Seek, SeekFrom, Write};
use std::sync::{Arc, Mutex};

use crate::error::{Error, Result};

pub trait ReadSeek: Read + Seek + Send {}
impl<T: Read + Seek + Send> ReadSeek for T {}

pub trait WriteSeek: Write + Seek + Send {}
impl<T: Write + Seek + Send> WriteSeek for T {}

#[derive(Debug, Clone, Default)]
pub struct Meta {
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    /// Unix seconds.
    pub mtime: Option<i64>,
    /// Unix permission bits, where the platform has them.
    pub mode: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct DirEntry {
    pub name: String,
    pub meta: Meta,
}

pub trait Vfs: Send + Sync {
    fn open(&self, path: &str) -> Result<Box<dyn ReadSeek>>;
    /// Creates or truncates.
    fn create(&self, path: &str) -> Result<Box<dyn WriteSeek>>;
    /// Opens an existing file for patching.
    fn open_rw(&self, path: &str) -> Result<Box<dyn WriteSeek>>;
    fn meta(&self, path: &str) -> Result<Option<Meta>>;
    fn read_dir(&self, path: &str) -> Result<Vec<DirEntry>>;
    fn mkdirs(&self, path: &str) -> Result<()>;
    fn remove_file(&self, path: &str) -> Result<()>;
    fn remove_dir_all(&self, path: &str) -> Result<()>;
    fn rename(&self, from: &str, to: &str) -> Result<()>;
    fn set_mtime(&self, path: &str, mtime: i64) -> Result<()>;
    fn set_mode(&self, path: &str, mode: u32) -> Result<()>;
    fn join(&self, base: &str, child: &str) -> String;
    fn parent(&self, path: &str) -> Option<String>;
    fn file_name(&self, path: &str) -> String;

    fn exists(&self, path: &str) -> bool {
        matches!(self.meta(path), Ok(Some(_)))
    }
    fn size(&self, path: &str) -> Result<u64> {
        self.meta(path)?
            .map(|m| m.size)
            .ok_or_else(|| Error::Io(format!("{path}: not found")))
    }
}

pub type Fs = Arc<dyn Vfs>;

// ── The real disk ─────────────────────────────────────────────────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
#[derive(Default)]
pub struct OsFs;

#[cfg(not(target_arch = "wasm32"))]
fn io_at(path: &str, e: io::Error) -> Error {
    Error::Io(format!("{path}: {e}"))
}

#[cfg(not(target_arch = "wasm32"))]
impl Vfs for OsFs {
    fn open(&self, path: &str) -> Result<Box<dyn ReadSeek>> {
        Ok(Box::new(std::fs::File::open(path).map_err(|e| io_at(path, e))?))
    }

    fn create(&self, path: &str) -> Result<Box<dyn WriteSeek>> {
        if let Some(parent) = self.parent(path) {
            if !parent.is_empty() {
                std::fs::create_dir_all(&parent).map_err(|e| io_at(&parent, e))?;
            }
        }
        // Readable as well, because a split set reads nothing but the formats may seek.
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)
            .map_err(|e| io_at(path, e))?;
        Ok(Box::new(file))
    }

    fn open_rw(&self, path: &str) -> Result<Box<dyn WriteSeek>> {
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .map_err(|e| io_at(path, e))?;
        Ok(Box::new(file))
    }

    fn meta(&self, path: &str) -> Result<Option<Meta>> {
        match std::fs::symlink_metadata(path) {
            Ok(m) => {
                let is_symlink = m.file_type().is_symlink();
                // A link to a folder reports as neither; follow it for size and kind only.
                let followed = if is_symlink { std::fs::metadata(path).unwrap_or(m) } else { m };
                Ok(Some(os_meta(&followed, is_symlink)))
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(io_at(path, e)),
        }
    }

    fn read_dir(&self, path: &str) -> Result<Vec<DirEntry>> {
        let mut out = Vec::new();
        for item in std::fs::read_dir(path).map_err(|e| io_at(path, e))? {
            let item = item.map_err(|e| io_at(path, e))?;
            let name = item.file_name().to_string_lossy().into_owned();
            let full = item.path();
            let Ok(sym) = std::fs::symlink_metadata(&full) else { continue };
            let is_symlink = sym.file_type().is_symlink();
            let meta = if is_symlink { std::fs::metadata(&full).unwrap_or(sym) } else { sym };
            out.push(DirEntry { name, meta: os_meta(&meta, is_symlink) });
        }
        Ok(out)
    }

    fn mkdirs(&self, path: &str) -> Result<()> {
        std::fs::create_dir_all(path).map_err(|e| io_at(path, e))
    }

    fn remove_file(&self, path: &str) -> Result<()> {
        std::fs::remove_file(path).map_err(|e| io_at(path, e))
    }

    fn remove_dir_all(&self, path: &str) -> Result<()> {
        std::fs::remove_dir_all(path).map_err(|e| io_at(path, e))
    }

    fn rename(&self, from: &str, to: &str) -> Result<()> {
        std::fs::rename(from, to).map_err(|e| io_at(to, e))
    }

    fn set_mtime(&self, path: &str, mtime: i64) -> Result<()> {
        filetime::set_file_mtime(path, filetime::FileTime::from_unix_time(mtime, 0))
            .map_err(|e| io_at(path, e))
    }

    #[allow(unused_variables)]
    fn set_mode(&self, path: &str, mode: u32) -> Result<()> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode & 0o7777))
                .map_err(|e| io_at(path, e))?;
        }
        Ok(())
    }

    fn join(&self, base: &str, child: &str) -> String {
        std::path::Path::new(base).join(child).to_string_lossy().into_owned()
    }

    fn parent(&self, path: &str) -> Option<String> {
        std::path::Path::new(path).parent().map(|p| p.to_string_lossy().into_owned())
    }

    fn file_name(&self, path: &str) -> String {
        std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string())
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn os_meta(m: &std::fs::Metadata, is_symlink: bool) -> Meta {
    let mtime = m
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64);
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        Some(m.permissions().mode())
    };
    #[cfg(not(unix))]
    let mode = None;
    Meta { is_dir: m.is_dir(), is_symlink, size: if m.is_dir() { 0 } else { m.len() }, mtime, mode }
}

// ── Memory ────────────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Default)]
struct MemFile {
    data: Arc<Mutex<Vec<u8>>>,
    mtime: Option<i64>,
}

#[derive(Default)]
struct MemTree {
    files: BTreeMap<String, MemFile>,
    dirs: BTreeMap<String, Option<i64>>,
}

/// Paths are `/`-separated and absolute (`/in/a.txt`).
#[derive(Default, Clone)]
pub struct MemFs {
    tree: Arc<Mutex<MemTree>>,
}

fn mem_norm(path: &str) -> String {
    let mut out = String::from("/");
    let mut first = true;
    for part in path.split(['/', '\\']).filter(|p| !p.is_empty() && *p != ".") {
        if !first {
            out.push('/');
        }
        out.push_str(part);
        first = false;
    }
    out
}

impl MemFs {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn put(&self, path: &str, data: Vec<u8>, mtime: Option<i64>) {
        let path = mem_norm(path);
        let mut tree = self.tree.lock().unwrap();
        add_parents(&mut tree, &path);
        tree.files.insert(path, MemFile { data: Arc::new(Mutex::new(data)), mtime });
    }

    /// The bytes of a file, without removing it.
    pub fn read(&self, path: &str) -> Option<Vec<u8>> {
        let tree = self.tree.lock().unwrap();
        tree.files.get(&mem_norm(path)).map(|f| f.data.lock().unwrap().clone())
    }

    /// Removes a file and hands over its bytes without copying them.
    pub fn take(&self, path: &str) -> Option<Vec<u8>> {
        let file = self.tree.lock().unwrap().files.remove(&mem_norm(path))?;
        let mut data = file.data.lock().unwrap();
        Some(std::mem::take(&mut *data))
    }

    /// Every file under a folder: (path, size, mtime).
    pub fn walk(&self, dir: &str) -> Vec<(String, u64, Option<i64>)> {
        let dir = mem_norm(dir);
        let prefix = if dir == "/" { dir } else { format!("{dir}/") };
        let tree = self.tree.lock().unwrap();
        tree.files
            .iter()
            .filter(|(p, _)| p.starts_with(&prefix))
            .map(|(p, f)| (p.clone(), f.data.lock().unwrap().len() as u64, f.mtime))
            .collect()
    }

    pub fn clear(&self) {
        let mut tree = self.tree.lock().unwrap();
        tree.files.clear();
        tree.dirs.clear();
    }
}

fn add_parents(tree: &mut MemTree, path: &str) {
    let mut at = path;
    while let Some(i) = at.rfind('/') {
        if i == 0 {
            break;
        }
        at = &at[..i];
        tree.dirs.entry(at.to_string()).or_insert(None);
    }
}

struct MemCursor {
    data: Arc<Mutex<Vec<u8>>>,
    pos: u64,
}

impl Read for MemCursor {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let data = self.data.lock().unwrap();
        let mut c = Cursor::new(&*data);
        c.set_position(self.pos);
        let n = c.read(buf)?;
        self.pos += n as u64;
        Ok(n)
    }
}

impl Write for MemCursor {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut data = self.data.lock().unwrap();
        let mut c = Cursor::new(&mut *data);
        c.set_position(self.pos);
        let n = c.write(buf)?;
        self.pos += n as u64;
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Seek for MemCursor {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let len = self.data.lock().unwrap().len() as i128;
        let next = match to {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::End(n) => len + n as i128,
            SeekFrom::Current(n) => self.pos as i128 + n as i128,
        };
        if next < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek before start"));
        }
        self.pos = next as u64;
        Ok(self.pos)
    }
}

impl Vfs for MemFs {
    fn open(&self, path: &str) -> Result<Box<dyn ReadSeek>> {
        let tree = self.tree.lock().unwrap();
        let file = tree.files.get(&mem_norm(path)).ok_or_else(|| Error::Io(format!("{path}: not found")))?;
        Ok(Box::new(MemCursor { data: file.data.clone(), pos: 0 }))
    }

    fn create(&self, path: &str) -> Result<Box<dyn WriteSeek>> {
        let norm = mem_norm(path);
        let mut tree = self.tree.lock().unwrap();
        add_parents(&mut tree, &norm);
        let file = MemFile::default();
        let data = file.data.clone();
        tree.files.insert(norm, file);
        Ok(Box::new(MemCursor { data, pos: 0 }))
    }

    fn open_rw(&self, path: &str) -> Result<Box<dyn WriteSeek>> {
        let tree = self.tree.lock().unwrap();
        let file = tree.files.get(&mem_norm(path)).ok_or_else(|| Error::Io(format!("{path}: not found")))?;
        Ok(Box::new(MemCursor { data: file.data.clone(), pos: 0 }))
    }

    fn meta(&self, path: &str) -> Result<Option<Meta>> {
        let norm = mem_norm(path);
        if norm == "/" {
            return Ok(Some(Meta { is_dir: true, ..Meta::default() }));
        }
        let tree = self.tree.lock().unwrap();
        if let Some(f) = tree.files.get(&norm) {
            return Ok(Some(Meta {
                size: f.data.lock().unwrap().len() as u64,
                mtime: f.mtime,
                ..Meta::default()
            }));
        }
        Ok(tree.dirs.get(&norm).map(|m| Meta { is_dir: true, mtime: *m, ..Meta::default() }))
    }

    fn read_dir(&self, path: &str) -> Result<Vec<DirEntry>> {
        let norm = mem_norm(path);
        let prefix = if norm == "/" { norm.clone() } else { format!("{norm}/") };
        let tree = self.tree.lock().unwrap();
        let mut out = Vec::new();
        for (p, f) in &tree.files {
            if let Some(rest) = p.strip_prefix(&prefix) {
                if !rest.is_empty() && !rest.contains('/') {
                    out.push(DirEntry {
                        name: rest.to_string(),
                        meta: Meta { size: f.data.lock().unwrap().len() as u64, mtime: f.mtime, ..Meta::default() },
                    });
                }
            }
        }
        for (p, m) in &tree.dirs {
            if let Some(rest) = p.strip_prefix(&prefix) {
                if !rest.is_empty() && !rest.contains('/') {
                    out.push(DirEntry {
                        name: rest.to_string(),
                        meta: Meta { is_dir: true, mtime: *m, ..Meta::default() },
                    });
                }
            }
        }
        Ok(out)
    }

    fn mkdirs(&self, path: &str) -> Result<()> {
        let norm = mem_norm(path);
        if norm == "/" {
            return Ok(());
        }
        let mut tree = self.tree.lock().unwrap();
        add_parents(&mut tree, &norm);
        tree.dirs.entry(norm).or_insert(None);
        Ok(())
    }

    fn remove_file(&self, path: &str) -> Result<()> {
        let mut tree = self.tree.lock().unwrap();
        tree.files.remove(&mem_norm(path));
        Ok(())
    }

    fn remove_dir_all(&self, path: &str) -> Result<()> {
        let norm = mem_norm(path);
        let prefix = format!("{norm}/");
        let mut tree = self.tree.lock().unwrap();
        tree.files.retain(|p, _| !p.starts_with(&prefix));
        tree.dirs.retain(|p, _| p != &norm && !p.starts_with(&prefix));
        Ok(())
    }

    fn rename(&self, from: &str, to: &str) -> Result<()> {
        let (from, to) = (mem_norm(from), mem_norm(to));
        let mut tree = self.tree.lock().unwrap();
        let file = tree.files.remove(&from).ok_or_else(|| Error::Io(format!("{from}: not found")))?;
        add_parents(&mut tree, &to);
        tree.files.insert(to, file);
        Ok(())
    }

    fn set_mtime(&self, path: &str, mtime: i64) -> Result<()> {
        let norm = mem_norm(path);
        let mut tree = self.tree.lock().unwrap();
        if let Some(f) = tree.files.get_mut(&norm) {
            f.mtime = Some(mtime);
        } else if let Some(d) = tree.dirs.get_mut(&norm) {
            *d = Some(mtime);
        }
        Ok(())
    }

    fn set_mode(&self, _path: &str, _mode: u32) -> Result<()> {
        Ok(())
    }

    fn join(&self, base: &str, child: &str) -> String {
        mem_norm(&format!("{base}/{child}"))
    }

    fn parent(&self, path: &str) -> Option<String> {
        let norm = mem_norm(path);
        if norm == "/" {
            return None;
        }
        let i = norm.rfind('/')?;
        Some(if i == 0 { "/".to_string() } else { norm[..i].to_string() })
    }

    fn file_name(&self, path: &str) -> String {
        let norm = mem_norm(path);
        norm.rsplit('/').next().unwrap_or("").to_string()
    }
}
