//! Reading ISO 9660 images (with Joliet names when present), also .img files whose ISO 9660
//! file system starts after a partition table. Damaged extents are kept as "unavailable"
//! files instead of failing the whole image.

use crate::tree::*;
use crate::util::*;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::Arc;

pub const SECTOR: u64 = 2048;

const FLAG_DIRECTORY: u8 = 0x02;
const FLAG_ASSOCIATED: u8 = 0x04;
const FLAG_MULTI_EXTENT: u8 = 0x80;

pub struct Opened {
    pub volume_label: String,
    pub root: DirNode,
    /// Bytes of the readable files.
    pub total_bytes: u64,
    pub entry_count: usize,
}

struct Img {
    file: File,
    /// Where the file system starts in the file.
    base: u64,
    /// Bytes from `base` to the end.
    size: u64,
}

impl Img {
    fn read(&mut self, offset: u64, len: u64) -> Res<Vec<u8>> {
        if len == 0 {
            return Ok(Vec::new());
        }
        if offset >= self.size {
            return err(format!(
                "ISO 읽기 범위 초과 (요청 offset {offset}, ISO 크기 {}). 파일이 잘렸거나 손상되었을 수 있습니다.",
                self.size
            ));
        }
        let len = len.min(self.size - offset);
        let mut buf = vec![0u8; len as usize];
        self.file.seek(SeekFrom::Start(self.base + offset)).map_err(|e| e.to_string())?;
        let mut got = 0;
        while got < buf.len() {
            let n = self.file.read(&mut buf[got..]).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            got += n;
        }
        buf.truncate(got);
        Ok(buf)
    }
}

#[derive(Clone)]
struct Volume {
    label: String,
    root_lba: u64,
    root_size: u64,
    joliet: bool,
    block: u64,
    volume_blocks: u64,
}

fn le32(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}
fn be32(b: &[u8], o: usize) -> u32 {
    u32::from_be_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

/// A both-endian number: when the halves disagree (damaged / hostile images) the valid one.
fn both32(b: &[u8], o: usize, valid: impl Fn(u64) -> bool) -> u64 {
    let (le, be) = (le32(b, o) as u64, be32(b, o + 4) as u64);
    if le == be {
        return le;
    }
    match (valid(le), valid(be)) {
        (false, true) => be,
        _ => le,
    }
}
fn both16(b: &[u8], o: usize, valid: impl Fn(u64) -> bool) -> u64 {
    let le = u16::from_le_bytes([b[o], b[o + 1]]) as u64;
    let be = u16::from_be_bytes([b[o + 2], b[o + 3]]) as u64;
    if le == be {
        return le;
    }
    match (valid(le), valid(be)) {
        (false, true) => be,
        _ => le,
    }
}

pub fn decode_ascii(b: &[u8]) -> String {
    let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
    b[..end].iter().map(|&c| c as char).collect::<String>().trim_end().to_string()
}

pub fn decode_joliet(b: &[u8]) -> String {
    let units: Vec<u16> = b.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).take_while(|&u| u != 0).collect();
    String::from_utf16_lossy(&units)
}

fn strip_version(name: &str) -> &str {
    name.split(';').next().unwrap_or(name)
}

fn is_pvd(b: &[u8]) -> bool {
    b.len() >= 6 && b[0] == 1 && &b[1..6] == b"CD001"
}

/// Where the ISO 9660 file system starts (0 when the descriptor is at the usual sector 16).
fn find_offset(file: &mut File, size: u64) -> Res<u64> {
    let mut probe = vec![0u8; SECTOR as usize];
    if size >= 17 * SECTOR {
        file.seek(SeekFrom::Start(16 * SECTOR)).map_err(|e| e.to_string())?;
        if file.read_exact(&mut probe).is_ok() && is_pvd(&probe) {
            return Ok(0);
        }
    }
    // The first 64 MiB, on sector boundaries.
    let limit = size.min(64 * 1024 * 1024);
    let chunk = 1024 * 1024u64;
    let mut start = 0;
    while start < limit {
        let len = (chunk + SECTOR).min(limit - start);
        if len < SECTOR {
            break;
        }
        let mut buf = vec![0u8; len as usize];
        file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        buf.truncate(n);
        let mut off = 0usize;
        while off + SECTOR as usize <= buf.len() {
            if is_pvd(&buf[off..]) {
                let abs = start + off as u64;
                if abs >= 16 * SECTOR {
                    return Ok(abs - 16 * SECTOR);
                }
            }
            off += SECTOR as usize;
        }
        start += chunk;
    }
    Ok(0)
}

fn best_volume(img: &mut Img) -> Res<Volume> {
    let mut primary: Option<Volume> = None;
    let mut joliet: Option<Volume> = None;
    for lba in 16..32u64 {
        let Ok(s) = img.read(lba * SECTOR, SECTOR) else { break };
        if s.len() < SECTOR as usize || &s[1..6] != b"CD001" {
            continue;
        }
        let kind = s[0];
        if kind == 255 {
            break;
        }
        let max_by_file = (img.size / SECTOR).max(1);
        let volume_blocks = both32(&s, 80, |n| n > 16 && n <= max_by_file * 4);
        let block = match both16(&s, 128, |n| n == 512 || n == 1024 || n == 2048) {
            0 => SECTOR,
            b => b,
        };
        let label = decode_ascii(&s[40..72]);
        let max_data = (img.size / block).max(1);
        let root_lba = both32(&s, 158, |n| n > 0 && n < volume_blocks.max(max_data));
        let max_root = block.max(img.size.saturating_sub(root_lba * block));
        let root_size = both32(&s, 166, |n| n > 0 && n <= max_root);
        let v = Volume { label, root_lba, root_size, joliet: false, block, volume_blocks: volume_blocks.max(max_data) };
        if kind == 1 {
            primary = Some(v);
        } else if kind == 2 && s[88] == 0x25 && s[89] == 0x2f && matches!(s[90], 0x40 | 0x43 | 0x45) {
            let jl = decode_joliet(&s[40..72]).trim().to_string();
            joliet = Some(Volume { label: if jl.is_empty() { v.label.clone() } else { jl }, joliet: true, ..v });
        }
    }
    joliet.or(primary).ok_or_else(|| "ISO9660 볼륨 디스크립터를 찾지 못했습니다. (ISO/IMG 형식이 아니거나 손상되었을 수 있습니다.)".to_string())
}

fn extent_fits(lba: u64, size: u64, img_size: u64, block: u64, volume_blocks: u64) -> bool {
    if size == 0 {
        return true;
    }
    if lba == 0 || lba >= volume_blocks {
        return false;
    }
    let start = lba * block;
    start < img_size && start + size <= img_size
}

struct Record {
    lba: u64,
    size: u64,
    name: String,
    flags: u8,
}

fn parse_record(b: &[u8], joliet: bool, img_size: u64, vol: &Volume) -> Option<Record> {
    if b.len() < 34 || (b[0] as usize) < 34 {
        return None;
    }
    let max_lba = vol.volume_blocks.min(img_size / vol.block + 1).max(1);
    let lba = both32(b, 2, |n| n < max_lba);
    let size = both32(b, 10, |n| n <= img_size);
    let flags = b[25];
    let name_len = b[32] as usize;
    if 33 + name_len > b.len() {
        return None;
    }
    let nb = &b[33..33 + name_len];
    let name = if name_len == 1 && nb[0] == 0 {
        ".".to_string()
    } else if name_len == 1 && nb[0] == 1 {
        "..".to_string()
    } else if joliet {
        strip_version(&decode_joliet(nb)).to_string()
    } else {
        strip_version(&decode_ascii(nb)).to_string()
    };
    if name.is_empty() {
        return None;
    }
    Some(Record { lba, size, name, flags })
}

struct Walk<'a> {
    img: &'a mut Img,
    image: Arc<Image>,
    vol: Volume,
    total: u64,
    count: usize,
    depth: usize,
}

impl Walk<'_> {
    fn commit(&mut self, parent: &mut DirNode, path: &str, name: String, extents: Vec<(u64, u64)>) {
        let size: u64 = extents.iter().map(|e| e.1).sum();
        let readable = extents.iter().all(|&(l, s)| extent_fits(l, s, self.img.size, self.vol.block, self.vol.volume_blocks));
        let source = if readable {
            self.total += size;
            Source::Iso { image: self.image.clone(), extents, block: self.vol.block }
        } else {
            let p = if path.is_empty() { name.clone() } else { format!("{path}/{name}") };
            Source::Unavailable(format!("ISO 데이터가 잘렸거나 손상되어 읽을 수 없습니다: {p}"))
        };
        self.count += 1;
        parent.children.insert(key(&name), Node::File(FileNode { name, size, source, mode: None }));
    }

    fn dir(&mut self, parent: &mut DirNode, path: &str, lba: u64, size: u64) -> Res<()> {
        let block = self.vol.block;
        if self.depth > 64 || (size > 0 && !extent_fits(lba, size.min(block), self.img.size, block, self.vol.volume_blocks)) {
            return Ok(());
        }
        let read_size = size.min(self.img.size.saturating_sub(lba * block));
        if read_size == 0 {
            return Ok(());
        }
        let data = self.img.read(lba * block, read_size)?;
        let mut off = 0usize;
        let mut pending: Option<(String, Vec<(u64, u64)>)> = None;
        while off < data.len() {
            let len = data[off] as usize;
            if len == 0 {
                let next = (off / block as usize + 1) * block as usize;
                if next <= off || next >= data.len() {
                    break;
                }
                off = next;
                continue;
            }
            if off + len > data.len() {
                break;
            }
            let rec = parse_record(&data[off..off + len], self.vol.joliet, self.img.size, &self.vol);
            off += len;
            let Some(rec) = rec else { continue };
            if rec.name == "." || rec.name == ".." || rec.flags & FLAG_ASSOCIATED != 0 {
                continue;
            }
            if rec.flags & FLAG_DIRECTORY != 0 {
                if let Some((n, e)) = pending.take() {
                    self.commit(parent, path, n, e);
                }
                if !extent_fits(rec.lba, rec.size.min(block), self.img.size, block, self.vol.volume_blocks) {
                    continue;
                }
                let child_path = if path.is_empty() { rec.name.clone() } else { format!("{path}/{}", rec.name) };
                let mut child = DirNode::new(&rec.name);
                self.count += 1;
                self.depth += 1;
                self.dir(&mut child, &child_path, rec.lba, rec.size)?;
                self.depth -= 1;
                parent.children.insert(key(&rec.name), Node::Dir(child));
                continue;
            }
            let more = rec.flags & FLAG_MULTI_EXTENT != 0;
            // Multi-extent files: records with the same name follow each other; 0x80 = more follow.
            if let Some((n, e)) = pending.as_mut() {
                if *n == rec.name {
                    e.push((rec.lba, rec.size));
                    if !more {
                        let (n, e) = pending.take().unwrap();
                        self.commit(parent, path, n, e);
                    }
                    continue;
                }
            }
            if let Some((n, e)) = pending.take() {
                self.commit(parent, path, n, e);
            }
            if more {
                pending = Some((rec.name, vec![(rec.lba, rec.size)]));
            } else {
                self.commit(parent, path, rec.name, vec![(rec.lba, rec.size)]);
            }
        }
        if let Some((n, e)) = pending.take() {
            self.commit(parent, path, n, e);
        }
        Ok(())
    }
}

pub fn open_iso(path: &Path) -> Res<Opened> {
    let mut file = File::open(path).at(path)?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    if size < SECTOR * 17 {
        return err("파일이 디스크 이미지로 보기에는 너무 작습니다.");
    }
    let base = find_offset(&mut file, size)?;
    let mut img = Img { file, base, size: size - base };
    let vol = best_volume(&mut img)?;
    let image = Arc::new(Image { path: path.to_path_buf(), base });
    let mut root = DirNode::new("");
    let mut w = Walk { img: &mut img, image, vol: vol.clone(), total: 0, count: 0, depth: 0 };
    w.dir(&mut root, "", vol.root_lba, vol.root_size)?;
    let (total_bytes, entry_count) = (w.total, w.count);
    Ok(Opened { volume_label: if vol.label.is_empty() { "ISO".into() } else { vol.label }, root, total_bytes, entry_count })
}
