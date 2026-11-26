//! SquashFS 4.0: reading and writing without squashfs-tools (an AppImage is a runtime + SquashFS).
//!
//! Reader: gzip (zlib) and zstd compression (what AppImages use), fragments, basic and extended
//! inodes for directories, files and symlinks. Other compressions (xz, lzo, lz4, lzma) give
//! `SquashError::Unsupported`, and the caller falls back to unsquashfs.
//!
//! Writer: block size 128 KiB, data blocks zlib-compressed (stored when that is not smaller),
//! no fragments, metadata stored uncompressed, one id (0 = root) for uid/gid, extended directory
//! inodes. Layout: superblock · data · inode table · directory table · id table · its index.
//! Table offsets are relative to the start of the SquashFS (it follows the runtime in an AppImage).

use crate::util::*;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

const MAGIC: u32 = 0x7371_7368;
const META: usize = 8192;
const NO_FRAGMENT: u32 = 0xffff_ffff;
const UNCOMPRESSED_BLOCK: u32 = 1 << 24;

#[derive(Debug)]
pub enum SquashError {
    NotSquashfs(String),
    Unsupported(String),
    Corrupt(String),
}
impl std::fmt::Display for SquashError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SquashError::NotSquashfs(m) | SquashError::Unsupported(m) | SquashError::Corrupt(m) => f.write_str(m),
        }
    }
}
impl From<std::io::Error> for SquashError {
    fn from(e: std::io::Error) -> Self {
        SquashError::Corrupt(e.to_string())
    }
}
type SqRes<T> = Result<T, SquashError>;
fn corrupt<T>(m: impl Into<String>) -> SqRes<T> {
    Err(SquashError::Corrupt(m.into()))
}

#[derive(Clone, Debug)]
pub struct Super {
    pub inode_count: u32,
    pub block_size: u32,
    pub frag_count: u32,
    pub compression: u16,
    pub flags: u16,
    pub id_count: u16,
    pub root_inode: u64,
    pub bytes_used: u64,
    pub id_table: u64,
    pub inode_table: u64,
    pub dir_table: u64,
    pub frag_table: u64,
    pub export_table: u64,
}

fn u16le(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([b[o], b[o + 1]])
}
fn u32le(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
fn u64le(b: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}

#[derive(Clone, Copy)]
enum Codec {
    Zlib,
    Zstd,
}

impl Codec {
    fn of(id: u16) -> SqRes<Codec> {
        match id {
            1 => Ok(Codec::Zlib),
            6 => Ok(Codec::Zstd),
            _ => {
                let name = match id {
                    2 => "lzma",
                    3 => "lzo",
                    4 => "xz",
                    5 => "lz4",
                    _ => "unknown",
                };
                Err(SquashError::Unsupported(format!("SquashFS compression \"{name}\" is not built in")))
            }
        }
    }
    fn inflate(self, raw: &[u8]) -> SqRes<Vec<u8>> {
        let mut out = Vec::new();
        match self {
            Codec::Zlib => {
                flate2::read::ZlibDecoder::new(raw).read_to_end(&mut out)?;
            }
            Codec::Zstd => out = zstd_decode(raw).map_err(SquashError::Corrupt)?,
        }
        Ok(out)
    }
}

/// zstd data (one or more frames) → bytes.
pub fn zstd_decode(raw: &[u8]) -> Res<Vec<u8>> {
    let mut cur = std::io::Cursor::new(raw);
    let mut out = Vec::new();
    while (cur.position() as usize) < raw.len() {
        let mut d = ruzstd::decoding::StreamingDecoder::new(&mut cur).map_err(|e| format!("zstd: {e}"))?;
        d.read_to_end(&mut out).map_err(|e| format!("zstd: {e}"))?;
    }
    Ok(out)
}

struct Meta {
    data: Vec<u8>,
    /// block offset in the table → position in `data`
    block_pos: HashMap<u64, usize>,
}

#[derive(Clone, Debug)]
enum Inode {
    Dir { mode: u16, block: u32, offset: u16, size: u32 },
    File { mode: u16, start: u64, size: u64, frag: u32, frag_offset: u32, blocks: Vec<u32> },
    Symlink { mode: u16, target: String },
    Other,
}

#[derive(Clone, Debug)]
pub struct SquashEntry {
    pub path: String,
    /// "dir" | "file" | "symlink"
    pub kind: &'static str,
    pub size: u64,
    pub mode: u32,
    pub target: Option<String>,
}

pub struct Squashfs {
    file: File,
    base: u64,
    pub superblock: Super,
    codec: Codec,
    inodes: Meta,
    dirs: Meta,
    fragments: Vec<(u64, u32)>,
}

impl Squashfs {
    fn read_at(&mut self, pos: u64, len: usize) -> SqRes<Vec<u8>> {
        read_at(&mut self.file, self.base + pos, len)
    }

    pub fn open(path: &Path, offset: u64) -> SqRes<Squashfs> {
        let mut file = File::open(path)?;
        let b = read_at(&mut file, offset, 96)?;
        if b.len() < 96 || u32le(&b, 0) != MAGIC {
            return Err(SquashError::NotSquashfs("No SquashFS superblock".into()));
        }
        if u16le(&b, 28) != 4 {
            return corrupt(format!("SquashFS version {} (4 expected)", u16le(&b, 28)));
        }
        let sb = Super {
            inode_count: u32le(&b, 4),
            block_size: u32le(&b, 12),
            frag_count: u32le(&b, 16),
            compression: u16le(&b, 20),
            flags: u16le(&b, 24),
            id_count: u16le(&b, 26),
            root_inode: u64le(&b, 32),
            bytes_used: u64le(&b, 40),
            id_table: u64le(&b, 48),
            inode_table: u64le(&b, 64),
            dir_table: u64le(&b, 72),
            frag_table: u64le(&b, 80),
            export_table: u64le(&b, 88),
        };
        if sb.block_size == 0 || sb.block_size > 1 << 20 {
            return corrupt("Bad SquashFS block size");
        }
        let codec = Codec::of(sb.compression)?;
        let ends: Vec<u64> = [sb.dir_table, sb.frag_table, sb.export_table, sb.id_table, sb.bytes_used]
            .into_iter()
            .filter(|&v| v > 0 && v != u64::MAX)
            .collect();
        let inodes = meta_table(&mut file, offset, sb.inode_table, sb.dir_table, codec)?;
        let dir_end = ends.iter().copied().filter(|&v| v > sb.dir_table).min().unwrap_or(sb.bytes_used);
        let dirs = meta_table(&mut file, offset, sb.dir_table, dir_end, codec)?;
        let mut fragments = Vec::new();
        if sb.frag_count > 0 {
            let blocks = sb.frag_count.div_ceil(512) as usize;
            let index = read_at(&mut file, offset + sb.frag_table, blocks * 8)?;
            for i in 0..blocks {
                if index.len() < i * 8 + 8 {
                    return corrupt("Short fragment index");
                }
                let meta = meta_block(&mut file, offset + u64le(&index, i * 8), codec)?;
                let mut o = 0;
                while o + 16 <= meta.len() && fragments.len() < sb.frag_count as usize {
                    fragments.push((u64le(&meta, o), u32le(&meta, o + 8)));
                    o += 16;
                }
            }
        }
        Ok(Squashfs { file, base: offset, superblock: sb, codec, inodes, dirs, fragments })
    }

    fn inode_at(&self, r: u64) -> SqRes<Inode> {
        let block = r >> 16;
        let off = (r & 0xffff) as usize;
        let Some(&base) = self.inodes.block_pos.get(&block) else { return corrupt(format!("Bad inode reference {r}")) };
        let b = &self.inodes.data;
        let mut p = base + off;
        if p + 16 > b.len() {
            return corrupt("Inode past the table");
        }
        let kind = u16le(b, p);
        let mode = u16le(b, p + 2);
        p += 16;
        let need = |n: usize| if p + n > b.len() { corrupt("Inode past the table") } else { Ok(()) };
        let bs = self.superblock.block_size as u64;
        let block_list = |p: usize, size: u64, frag: u32| -> SqRes<Vec<u32>> {
            let full = if frag == NO_FRAGMENT { size.div_ceil(bs) } else { size / bs } as usize;
            if p + full * 4 > b.len() {
                return corrupt("Block list past the table");
            }
            Ok((0..full).map(|i| u32le(b, p + i * 4)).collect())
        };
        Ok(match kind {
            1 => {
                need(16)?;
                Inode::Dir { mode, block: u32le(b, p), size: u16le(b, p + 8) as u32, offset: u16le(b, p + 10) }
            }
            8 => {
                need(24)?;
                Inode::Dir { mode, size: u32le(b, p + 4), block: u32le(b, p + 8), offset: u16le(b, p + 18) }
            }
            2 => {
                need(16)?;
                let (start, frag, frag_offset, size) = (u32le(b, p) as u64, u32le(b, p + 4), u32le(b, p + 8), u32le(b, p + 12) as u64);
                Inode::File { mode, start, size, frag, frag_offset, blocks: block_list(p + 16, size, frag)? }
            }
            9 => {
                need(40)?;
                let (start, size, frag, frag_offset) = (u64le(b, p), u64le(b, p + 8), u32le(b, p + 28), u32le(b, p + 32));
                Inode::File { mode, start, size, frag, frag_offset, blocks: block_list(p + 40, size, frag)? }
            }
            3 | 10 => {
                need(8)?;
                let len = u32le(b, p + 4) as usize;
                if p + 8 + len > b.len() {
                    return corrupt("Symlink past the table");
                }
                Inode::Symlink { mode, target: String::from_utf8_lossy(&b[p + 8..p + 8 + len]).to_string() }
            }
            _ => Inode::Other,
        })
    }

    fn list_dir(&self, block: u32, offset: u16, size: u32) -> SqRes<Vec<(String, u64)>> {
        let Some(&base) = self.dirs.block_pos.get(&(block as u64)) else { return corrupt("Bad directory reference") };
        let b = &self.dirs.data;
        let mut p = base + offset as usize;
        let end = (p + size as usize).saturating_sub(3).min(b.len());
        let mut out = Vec::new();
        while p + 12 <= end {
            let count = u32le(b, p) as usize + 1;
            let start = u32le(b, p + 4) as u64;
            p += 12;
            for _ in 0..count {
                if p + 8 > end {
                    break;
                }
                let off = u16le(b, p) as u64;
                let name_len = u16le(b, p + 6) as usize + 1;
                if p + 8 + name_len > b.len() {
                    return corrupt("Directory entry past the table");
                }
                let name = String::from_utf8_lossy(&b[p + 8..p + 8 + name_len]).to_string();
                out.push((name, (start << 16) | off));
                p += 8 + name_len;
            }
        }
        Ok(out)
    }

    fn read_file_data(&mut self, ino: &Inode, sink: &mut dyn FnMut(&[u8]) -> SqRes<()>) -> SqRes<()> {
        let Inode::File { start, size, frag, frag_offset, blocks, .. } = ino else { return Ok(()) };
        let bs = self.superblock.block_size as u64;
        let mut pos = *start;
        let mut left = *size;
        for &entry in blocks {
            let stored = entry & UNCOMPRESSED_BLOCK != 0;
            let len = (entry & !UNCOMPRESSED_BLOCK) as usize;
            let want = bs.min(left) as usize;
            if len == 0 {
                sink(&vec![0u8; want])?;
            } else {
                let raw = self.read_at(pos, len)?;
                let data = if stored { raw } else { self.codec.inflate(&raw)? };
                sink(&data[..want.min(data.len())])?;
                pos += len as u64;
            }
            left -= want as u64;
        }
        if left > 0 && *frag != NO_FRAGMENT {
            let Some(&(fstart, fsize)) = self.fragments.get(*frag as usize) else { return corrupt(format!("Missing fragment {frag}")) };
            let stored = fsize & UNCOMPRESSED_BLOCK != 0;
            let raw = self.read_at(fstart, (fsize & !UNCOMPRESSED_BLOCK) as usize)?;
            let data = if stored { raw } else { self.codec.inflate(&raw)? };
            let from = *frag_offset as usize;
            let to = from + left as usize;
            if to > data.len() {
                return corrupt("Fragment too short");
            }
            sink(&data[from..to])?;
        }
        Ok(())
    }

    /// Every entry with its inode, parents before children.
    fn walk(&self) -> SqRes<Vec<(SquashEntry, Inode)>> {
        let mut out = Vec::new();
        let mut stack = vec![(self.superblock.root_inode, String::new(), 0usize)];
        while let Some((r, rel, depth)) = stack.pop() {
            let Inode::Dir { block, offset, size, .. } = self.inode_at(r)? else { continue };
            if depth > 128 {
                return corrupt("SquashFS folders nested too deep");
            }
            let mut subdirs = Vec::new();
            for (name, child) in self.list_dir(block, offset, size)? {
                if name.is_empty() || name == "." || name == ".." || name.contains('/') {
                    continue;
                }
                let p = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
                let c = self.inode_at(child)?;
                match &c {
                    Inode::Dir { mode, .. } => {
                        out.push((SquashEntry { path: p.clone(), kind: "dir", size: 0, mode: *mode as u32, target: None }, c.clone()));
                        subdirs.push((child, p, depth + 1));
                    }
                    Inode::File { mode, size, .. } => out.push((SquashEntry { path: p, kind: "file", size: *size, mode: *mode as u32, target: None }, c.clone())),
                    Inode::Symlink { mode, target } => out.push((SquashEntry { path: p, kind: "symlink", size: 0, mode: *mode as u32, target: Some(target.clone()) }, c.clone())),
                    Inode::Other => {}
                }
            }
            stack.extend(subdirs.into_iter().rev());
        }
        Ok(out)
    }

    pub fn list(&self) -> SqRes<Vec<SquashEntry>> {
        Ok(self.walk()?.into_iter().map(|e| e.0).collect())
    }

    pub fn read_file(&mut self, rel: &str) -> SqRes<Vec<u8>> {
        let Some((_, ino)) = self.walk()?.into_iter().find(|(e, _)| e.path == rel && e.kind == "file") else {
            return corrupt(format!("Not in the image: {rel}"));
        };
        let mut out = Vec::new();
        self.read_file_data(&ino, &mut |c| {
            out.extend_from_slice(c);
            Ok(())
        })?;
        Ok(out)
    }

    /// Writes the tree under `dest`; returns the entries. Symlinks become small text files
    /// on Windows.
    pub fn extract_to(&mut self, dest: &Path, cancel: &Cancel) -> SqRes<Vec<SquashEntry>> {
        std::fs::create_dir_all(dest)?;
        let entries = self.walk()?;
        for (e, ino) in &entries {
            if cancel.is_set() {
                return corrupt(CANCELED);
            }
            let target: PathBuf = e.path.split('/').fold(dest.to_path_buf(), |p, s| p.join(s));
            match e.kind {
                "dir" => std::fs::create_dir_all(&target)?,
                "symlink" => {
                    if let Some(parent) = target.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    let t = e.target.clone().unwrap_or_default();
                    #[cfg(unix)]
                    {
                        if std::os::unix::fs::symlink(&t, &target).is_err() {
                            std::fs::write(&target, format!("symlink → {t}\n"))?;
                        }
                    }
                    #[cfg(not(unix))]
                    std::fs::write(&target, format!("symlink → {t}\n"))?;
                }
                _ => {
                    if let Some(parent) = target.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    let mut out = std::io::BufWriter::new(File::create(&target)?);
                    self.read_file_data(ino, &mut |c| out.write_all(c).map_err(SquashError::from))?;
                    out.flush()?;
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(e.mode & 0o777));
                    }
                }
            }
        }
        Ok(entries.into_iter().map(|e| e.0).collect())
    }
}

fn read_at(f: &mut File, pos: u64, len: usize) -> SqRes<Vec<u8>> {
    f.seek(SeekFrom::Start(pos))?;
    let mut buf = vec![0u8; len];
    let mut got = 0;
    while got < len {
        let n = f.read(&mut buf[got..])?;
        if n == 0 {
            break;
        }
        got += n;
    }
    buf.truncate(got);
    Ok(buf)
}

/// A metadata table (inodes / directories) read whole.
fn meta_table(f: &mut File, base: u64, start: u64, end: u64, codec: Codec) -> SqRes<Meta> {
    let mut data = Vec::new();
    let mut block_pos = HashMap::new();
    let mut pos = start;
    if end < start || end - start > 1 << 32 {
        return corrupt("Bad SquashFS table bounds");
    }
    while pos < end {
        let h = read_at(f, base + pos, 2)?;
        if h.len() < 2 {
            break;
        }
        let header = u16le(&h, 0);
        let size = (header & 0x7fff) as usize;
        let raw = read_at(f, base + pos + 2, size)?;
        let block = if header & 0x8000 != 0 { raw } else { codec.inflate(&raw)? };
        block_pos.insert(pos - start, data.len());
        data.extend_from_slice(&block);
        pos += 2 + size as u64;
    }
    Ok(Meta { data, block_pos })
}

fn meta_block(f: &mut File, pos: u64, codec: Codec) -> SqRes<Vec<u8>> {
    let h = read_at(f, pos, 2)?;
    if h.len() < 2 {
        return corrupt("Short metadata block");
    }
    let header = u16le(&h, 0);
    let raw = read_at(f, pos + 2, (header & 0x7fff) as usize)?;
    if header & 0x8000 != 0 {
        Ok(raw)
    } else {
        codec.inflate(&raw)
    }
}

// ── Writing ───────────────────────────────────────────────────

pub enum Content {
    Path(PathBuf),
    Bytes(Vec<u8>),
    /// Any reader (a file inside an opened image).
    Reader(Box<dyn Fn() -> Res<Box<dyn Read + Send>> + Send + Sync>),
}

pub enum SquashSource {
    Dir { name: String, children: Vec<SquashSource>, mode: u32 },
    File { name: String, content: Content, size: u64, mode: u32 },
    Symlink { name: String, target: String },
}

impl SquashSource {
    pub fn name(&self) -> &str {
        match self {
            SquashSource::Dir { name, .. } | SquashSource::File { name, .. } | SquashSource::Symlink { name, .. } => name,
        }
    }
}

/// Windows has no exec bits: AppRun, *.sh, *.AppImage and files in bin/ get 0755.
pub fn guess_mode(name: &str, dir_name: &str) -> u32 {
    let lower = name.to_lowercase();
    let exec = name == "AppRun" || lower.ends_with(".sh") || lower.ends_with(".appimage") || dir_name == "bin" || dir_name == "sbin";
    if exec {
        0o755
    } else {
        0o644
    }
}

/// A folder on disk as a source tree.
pub fn source_from_disk(dir: &Path, name: &str) -> Res<SquashSource> {
    let mut children = Vec::new();
    let dir_name = dir.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    for d in std::fs::read_dir(dir).at(dir)?.flatten() {
        let n = d.file_name().to_string_lossy().to_string();
        let p = d.path();
        let Ok(meta) = std::fs::symlink_metadata(&p) else { continue };
        if meta.file_type().is_symlink() {
            if let Ok(t) = std::fs::read_link(&p) {
                children.push(SquashSource::Symlink { name: n, target: t.to_string_lossy().replace('\\', "/") });
            }
            continue;
        }
        if meta.is_dir() {
            children.push(source_from_disk(&p, &n)?);
        } else if meta.is_file() {
            let mode = crate::tree::unix_mode(&meta).map(|m| m & 0o777).unwrap_or_else(|| guess_mode(&n, &dir_name));
            children.push(SquashSource::File { name: n, content: Content::Path(p), size: meta.len(), mode });
        }
    }
    Ok(SquashSource::Dir { name: name.to_string(), children, mode: 0o755 })
}

struct WNode<'a> {
    src: &'a SquashSource,
    number: u32,
    r: u64,
    children: Vec<usize>,
    parent: Option<usize>,
    blocks_start: u64,
    blocks: Vec<u32>,
    listing: Vec<u8>,
    dir_pos: usize,
}

/// Writes `root` as a SquashFS into `out` at `base`; returns its size (padded to 4 KiB). Data
/// goes out as it is read.
pub fn write_squashfs<W: Write + Seek>(out: &mut W, base: u64, root: &SquashSource, on_file: &dyn Fn(&str), cancel: &Cancel) -> Res<u64> {
    const BLOCK: usize = 128 * 1024;
    let now = now_secs() as u32;
    let io = |e: std::io::Error| e.to_string();
    out.seek(SeekFrom::Start(base + 96)).map_err(io)?;
    let mut pos: u64 = 96;

    // Post-order numbering: children before parents, root last.
    let mut nodes: Vec<WNode> = Vec::new();
    fn build<'a>(src: &'a SquashSource, parent: Option<usize>, nodes: &mut Vec<WNode<'a>>) -> usize {
        let mut kids = Vec::new();
        if let SquashSource::Dir { children, .. } = src {
            let mut sorted: Vec<&SquashSource> = children.iter().collect();
            sorted.sort_by(|a, b| a.name().as_bytes().cmp(b.name().as_bytes()));
            for c in sorted {
                kids.push(build(c, None, nodes));
            }
        }
        nodes.push(WNode { src, number: 0, r: 0, children: kids.clone(), parent, blocks_start: 0, blocks: Vec::new(), listing: Vec::new(), dir_pos: 0 });
        let me = nodes.len() - 1;
        nodes[me].number = nodes.len() as u32;
        for k in kids {
            nodes[k].parent = Some(me);
        }
        me
    }
    let root_idx = build(root, None, &mut nodes);

    // Data blocks
    let mut chunk = vec![0u8; BLOCK];
    for n in nodes.iter_mut() {
        let SquashSource::File { content, size, name, .. } = n.src else { continue };
        cancel.check()?;
        n.blocks_start = pos;
        let mut reader: Box<dyn Read + Send> = match content {
            Content::Path(p) => Box::new(File::open(p).at(p)?),
            Content::Bytes(b) => Box::new(std::io::Cursor::new(b.clone())),
            Content::Reader(f) => f()?,
        };
        let mut left = *size;
        while left > 0 {
            let len = (BLOCK as u64).min(left) as usize;
            reader.read_exact(&mut chunk[..len]).map_err(|e| format!("{name}: {e}"))?;
            let mut z = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::new(6));
            z.write_all(&chunk[..len]).map_err(io)?;
            let packed = z.finish().map_err(io)?;
            if packed.len() < len {
                out.write_all(&packed).map_err(io)?;
                pos += packed.len() as u64;
                n.blocks.push(packed.len() as u32);
            } else {
                out.write_all(&chunk[..len]).map_err(io)?;
                pos += len as u64;
                n.blocks.push(len as u32 | UNCOMPRESSED_BLOCK);
            }
            left -= len as u64;
        }
        on_file(match content {
            Content::Path(p) => p.to_str().unwrap_or(name),
            _ => name,
        });
    }

    let big = |n: &WNode| matches!(n.src, SquashSource::File { size, .. } if *size > 0xffff_ffff) || n.blocks_start > 0xffff_ffff;
    let inode_size = |n: &WNode| -> usize {
        match n.src {
            SquashSource::Dir { .. } => 16 + 24,
            SquashSource::Symlink { target, .. } => 16 + 8 + target.len(),
            SquashSource::File { .. } => 16 + if big(n) { 40 } else { 16 } + 4 * n.blocks.len(),
        }
    };
    // Uncompressed metadata blocks: 2-byte header + 8192 bytes.
    let ref_of = |p: usize| (((p / META) * (META + 2)) as u64) << 16 | (p % META) as u64;
    let mut ip = 0usize;
    for i in 0..nodes.len() {
        nodes[i].r = ref_of(ip);
        ip += inode_size(&nodes[i]);
    }

    // Directory listings (headers group entries of one inode block, at most 256 each)
    let mut dp = 0usize;
    for i in 0..nodes.len() {
        if !matches!(nodes[i].src, SquashSource::Dir { .. }) {
            continue;
        }
        let kids = nodes[i].children.clone();
        let mut listing = Vec::new();
        let mut k = 0;
        while k < kids.len() {
            let start = nodes[kids[k]].r >> 16;
            let base_number = nodes[kids[k]].number;
            let mut group = Vec::new();
            while k < kids.len() && group.len() < 256 && nodes[kids[k]].r >> 16 == start && (nodes[kids[k]].number as i64 - base_number as i64).abs() < 32767 {
                group.push(kids[k]);
                k += 1;
            }
            listing.extend_from_slice(&(group.len() as u32 - 1).to_le_bytes());
            listing.extend_from_slice(&(start as u32).to_le_bytes());
            listing.extend_from_slice(&base_number.to_le_bytes());
            for c in group {
                let c = &nodes[c];
                let name = c.src.name().as_bytes();
                if name.is_empty() || name.len() > 256 {
                    return err(format!("A name SquashFS cannot hold: {:?}", c.src.name()));
                }
                listing.extend_from_slice(&((c.r & 0xffff) as u16).to_le_bytes());
                listing.extend_from_slice(&((c.number as i64 - base_number as i64) as i16).to_le_bytes());
                let t: u16 = match c.src {
                    SquashSource::Dir { .. } => 1,
                    SquashSource::Symlink { .. } => 3,
                    SquashSource::File { .. } => 2,
                };
                listing.extend_from_slice(&t.to_le_bytes());
                listing.extend_from_slice(&(name.len() as u16 - 1).to_le_bytes());
                listing.extend_from_slice(name);
            }
        }
        nodes[i].dir_pos = dp;
        dp += listing.len();
        nodes[i].listing = listing;
    }

    // Inode table
    let total = nodes.len() as u32;
    let mut ib: Vec<u8> = Vec::with_capacity(ip);
    for n in &nodes {
        let (t, mode): (u16, u32) = match n.src {
            SquashSource::Dir { mode, .. } => (8, 0o40000 | mode),
            SquashSource::Symlink { .. } => (3, 0o120000 | 0o777),
            SquashSource::File { mode, .. } => (if big(n) { 9 } else { 2 }, 0o100000 | mode),
        };
        ib.extend_from_slice(&t.to_le_bytes());
        ib.extend_from_slice(&(mode as u16).to_le_bytes());
        ib.extend_from_slice(&0u16.to_le_bytes());
        ib.extend_from_slice(&0u16.to_le_bytes());
        ib.extend_from_slice(&now.to_le_bytes());
        ib.extend_from_slice(&n.number.to_le_bytes());
        match n.src {
            SquashSource::Dir { .. } => {
                let dir_block = ((n.dir_pos / META) * (META + 2)) as u32;
                let subdirs = n.children.iter().filter(|&&c| matches!(nodes[c].src, SquashSource::Dir { .. })).count() as u32;
                ib.extend_from_slice(&(2 + subdirs).to_le_bytes());
                ib.extend_from_slice(&(n.listing.len() as u32 + 3).to_le_bytes());
                ib.extend_from_slice(&dir_block.to_le_bytes());
                let parent = n.parent.map(|p| nodes[p].number).unwrap_or(total + 1);
                ib.extend_from_slice(&parent.to_le_bytes());
                ib.extend_from_slice(&0u16.to_le_bytes());
                ib.extend_from_slice(&((n.dir_pos % META) as u16).to_le_bytes());
                ib.extend_from_slice(&0xffff_ffffu32.to_le_bytes());
            }
            SquashSource::Symlink { target, .. } => {
                ib.extend_from_slice(&1u32.to_le_bytes());
                ib.extend_from_slice(&(target.len() as u32).to_le_bytes());
                ib.extend_from_slice(target.as_bytes());
            }
            SquashSource::File { size, .. } => {
                if big(n) {
                    ib.extend_from_slice(&n.blocks_start.to_le_bytes());
                    ib.extend_from_slice(&size.to_le_bytes());
                    ib.extend_from_slice(&0u64.to_le_bytes());
                    ib.extend_from_slice(&1u32.to_le_bytes());
                    ib.extend_from_slice(&NO_FRAGMENT.to_le_bytes());
                    ib.extend_from_slice(&0u32.to_le_bytes());
                    ib.extend_from_slice(&0xffff_ffffu32.to_le_bytes());
                } else {
                    ib.extend_from_slice(&(n.blocks_start as u32).to_le_bytes());
                    ib.extend_from_slice(&NO_FRAGMENT.to_le_bytes());
                    ib.extend_from_slice(&0u32.to_le_bytes());
                    ib.extend_from_slice(&(*size as u32).to_le_bytes());
                }
                for b in &n.blocks {
                    ib.extend_from_slice(&b.to_le_bytes());
                }
            }
        }
    }

    let meta_blocks = |data: &[u8]| -> Vec<u8> {
        let mut v = Vec::new();
        for c in data.chunks(META) {
            v.extend_from_slice(&(0x8000u16 | c.len() as u16).to_le_bytes());
            v.extend_from_slice(c);
        }
        v
    };
    let mut put = |b: &[u8], pos: &mut u64| -> Res<()> {
        out.write_all(b).map_err(io)?;
        *pos += b.len() as u64;
        Ok(())
    };
    let inode_table = pos;
    put(&meta_blocks(&ib), &mut pos)?;
    let dir_table = pos;
    let all_listings: Vec<u8> = nodes.iter().flat_map(|n| n.listing.iter().copied()).collect();
    put(&meta_blocks(&all_listings), &mut pos)?;
    let frag_table = pos; // no fragments: an empty index
    let id_block = pos;
    put(&meta_blocks(&[0, 0, 0, 0]), &mut pos)?;
    let id_table = pos;
    put(&id_block.to_le_bytes(), &mut pos)?;
    let bytes_used = pos;

    let mut sb = vec![0u8; 96];
    sb[0..4].copy_from_slice(&MAGIC.to_le_bytes());
    sb[4..8].copy_from_slice(&total.to_le_bytes());
    sb[8..12].copy_from_slice(&now.to_le_bytes());
    sb[12..16].copy_from_slice(&(BLOCK as u32).to_le_bytes());
    sb[20..22].copy_from_slice(&1u16.to_le_bytes()); // gzip (zlib)
    sb[22..24].copy_from_slice(&17u16.to_le_bytes()); // log2(128 KiB)
    // UNCOMPRESSED_INODES | NO_FRAGMENTS | NO_XATTRS | UNCOMPRESSED_IDS
    sb[24..26].copy_from_slice(&(0x0001u16 | 0x0010 | 0x0200 | 0x0800).to_le_bytes());
    sb[26..28].copy_from_slice(&1u16.to_le_bytes());
    sb[28..30].copy_from_slice(&4u16.to_le_bytes());
    sb[32..40].copy_from_slice(&nodes[root_idx].r.to_le_bytes());
    sb[40..48].copy_from_slice(&bytes_used.to_le_bytes());
    sb[48..56].copy_from_slice(&id_table.to_le_bytes());
    sb[56..64].copy_from_slice(&u64::MAX.to_le_bytes());
    sb[64..72].copy_from_slice(&inode_table.to_le_bytes());
    sb[72..80].copy_from_slice(&dir_table.to_le_bytes());
    sb[80..88].copy_from_slice(&frag_table.to_le_bytes());
    sb[88..96].copy_from_slice(&u64::MAX.to_le_bytes());
    // Pad to 4 KiB like mksquashfs (the padding is not part of bytes_used).
    let padded = bytes_used.div_ceil(4096) * 4096;
    if padded > bytes_used {
        out.write_all(&vec![0u8; (padded - bytes_used) as usize]).map_err(io)?;
    }
    out.seek(SeekFrom::Start(base)).map_err(io)?;
    out.write_all(&sb).map_err(io)?;
    out.seek(SeekFrom::Start(base + padded)).map_err(io)?;
    Ok(padded)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixtures() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("test").join("fixtures")
    }

    fn walk(dir: &Path, rel: &str, out: &mut Vec<String>) {
        for d in std::fs::read_dir(dir).unwrap().flatten() {
            let n = d.file_name().to_string_lossy().to_string();
            let r = if rel.is_empty() { n.clone() } else { format!("{rel}/{n}") };
            if d.path().is_dir() {
                walk(&d.path(), &r, out);
            } else {
                out.push(r);
            }
        }
    }

    #[test]
    fn reads_real_mksquashfs_images_gzip_and_zstd_with_fragments() {
        let src = fixtures().join("squashfs-src");
        let mut want = Vec::new();
        walk(&src, "", &mut want);
        want.sort();
        for (kind, id) in [("gzip", 1), ("zstd", 6)] {
            let mut img = Squashfs::open(&fixtures().join(format!("fixture-{kind}.sqfs")), 0).unwrap();
            assert_eq!(img.superblock.compression, id);
            let mut files: Vec<String> = img.list().unwrap().into_iter().filter(|e| e.kind == "file").map(|e| e.path).collect();
            files.sort();
            assert_eq!(files, want, "{kind}");
            for f in &files {
                let disk = std::fs::read(f.split('/').fold(src.clone(), |p, s| p.join(s))).unwrap();
                assert_eq!(img.read_file(f).unwrap(), disk, "{kind} {f}");
            }
            let app_run = img.list().unwrap().into_iter().find(|e| e.path == "AppRun").unwrap();
            assert!(app_run.mode & 0o111 != 0, "AppRun executable");
        }
    }

    #[test]
    fn writes_what_it_reads_back() {
        let src = fixtures().join("squashfs-src");
        let tree = source_from_disk(&src, "").unwrap();
        let out = std::env::temp_dir().join(format!("isohost-sq-{}.sqfs", tag()));
        let mut f = File::create(&out).unwrap();
        let size = write_squashfs(&mut f, 0, &tree, &|_| {}, &Cancel::none()).unwrap();
        drop(f);
        assert_eq!(size % 4096, 0);
        let mut img = Squashfs::open(&out, 0).unwrap();
        let mut want = Vec::new();
        walk(&src, "", &mut want);
        for rel in want {
            let disk = std::fs::read(rel.split('/').fold(src.clone(), |p, s| p.join(s))).unwrap();
            assert_eq!(img.read_file(&rel).unwrap(), disk, "{rel}");
        }
        assert_eq!(img.superblock.inode_count as usize, img.list().unwrap().len() + 1);
        let _ = std::fs::remove_file(out);
    }
}
