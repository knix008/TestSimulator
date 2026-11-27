//! HFS+ / HFSX (macOS): the volume header at byte 1024 ("H+" / "HX", or a classic HFS "BD" wrapper holding an embedded
//! HFS+ volume), the catalog B-tree (index descent by parent CNID, then the leaf chain), data and resource forks with the
//! extents overflow B-tree, the attributes B-tree. ids: the CNID (root "2"); a resource fork is listed as
//! `<name>/..namedfork/rsrc` with id `<cnid>:rsrc`. HFS+ keeps no deleted records in its catalog, so `deleted` is always false.
//! Compressed files (UF_COMPRESSED, `com.apple.decmpfs` attribute): `size` is the uncompressed size, `compressed` is true
//! (`unit` = 64 KiB), `extents` are the resource fork holding the compressed data (none when it is inline in the attribute);
//! `file` / `read` decompress types 1 (stored), 3 / 4 (zlib inline / resource fork), 7 / 8 (LZVN inline / resource fork)
//! and 11 / 12 (LZFSE inline / resource fork, via `lzfse_rust`) into `resident`.
//! Hard links: a file link ('hlnk' / 'hfs+') shows its iNode<n> file's size and data under its own name and id; a directory
//! link ('fdrp' / 'MACS') is a folder whose listing is the dir_<n> folder of ".HFS+ Private Directory Data\r".
//! Not supported: decmpfs types other than those above, the journal, plain HFS volumes (only an HFS wrapper around HFS+).
//!
//! WIRING (src/fsys/mod.rs):
//!   mod hfs;                                   — next to `mod fat;`
//!   enum Fs:  `Hfs(bool),`                      — true = HFSX
//!   Fs::id:   `Fs::Hfs(false) => "hfsplus", Fs::Hfs(true) => "hfsx",`
//!   detect(): before the ext check:  `if let Some(x) = hfs::detect(&vol) { return Fs::Hfs(x); }`
//!   label_of / info:  `Fs::Hfs(_) => hfs::info(&vol)`   (with `?` in info)
//!   list:     `Fs::Hfs(_) => hfs::list(&vol, dir.as_deref(), deleted)?,`
//!   entry_of: `Fs::Hfs(_) => hfs::file(&vol, &id),`
//!   (and add "HFS+" to the "no known file system" message and the header comment's fs list)
use super::{push_extent, u32le, u64le, unix_text, Entry, Info, Listing, Vol};
use std::cell::OnceCell;
use std::collections::HashSet;

fn be16(b: &[u8], o: usize) -> u16 {
    b.get(o..o + 2).map(|s| u16::from_be_bytes([s[0], s[1]])).unwrap_or(0)
}
fn be32(b: &[u8], o: usize) -> u32 {
    b.get(o..o + 4).map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]])).unwrap_or(0)
}
fn be64(b: &[u8], o: usize) -> u64 {
    (be32(b, o) as u64) << 32 | be32(b, o + 4) as u64
}

/// HFS times: seconds since 1904-01-01 (local time on disk, shown as UTC).
fn hfs_time(t: u32) -> String {
    if t == 0 {
        return String::new();
    }
    unix_text(t as i64 - 2_082_844_800)
}

const ROOT: u32 = 2;
const MAX_RECORDS: usize = 1 << 20;
const MAX_EXTENTS: usize = 1 << 16;

/// A fork: its logical size, its block count and its extents (start block, block count) in order.
#[derive(Clone, Default)]
struct Fork {
    size: u64,
    blocks: u64,
    runs: Vec<(u64, u64)>,
}

fn fork_at(b: &[u8], o: usize) -> Fork {
    let mut runs = Vec::new();
    for i in 0..8 {
        let (start, count) = (be32(b, o + 16 + i * 8) as u64, be32(b, o + 20 + i * 8) as u64);
        if count == 0 {
            break;
        }
        runs.push((start, count));
    }
    Fork { size: be64(b, o), blocks: be32(b, o + 12) as u64, runs }
}

struct Geo {
    /// Where the HFS+ volume starts inside the volume (non-zero inside an HFS wrapper).
    off: u64,
    bs: u64,
    hfsx: bool,
    wrapped: bool,
    hdr: Vec<u8>,
}

impl Geo {
    fn new(vol: &Vol) -> Result<Geo, String> {
        let mut h = vol.read(1024, 512)?;
        let mut off = 0u64;
        let mut wrapped = false;
        if be16(&h, 0) == 0x4244 && be16(&h, 124) == 0x482B {
            // Classic HFS master directory block with an embedded HFS+ volume.
            let alloc = be32(&h, 20) as u64;
            if alloc == 0 || !alloc.is_multiple_of(512) {
                return Err("hfs: bad wrapper allocation block size".into());
            }
            off = be16(&h, 28) as u64 * 512 + be16(&h, 126) as u64 * alloc;
            h = vol.read(off + 1024, 512)?;
            wrapped = true;
        }
        let sig = be16(&h, 0);
        if sig != 0x482B && sig != 0x4858 {
            return Err("hfs: no HFS+ volume header".into());
        }
        let bs = be32(&h, 40) as u64;
        if bs < 512 || !bs.is_power_of_two() || bs > 1 << 20 || be32(&h, 44) == 0 {
            return Err("hfs: bad block size".into());
        }
        Ok(Geo { off, bs, hfsx: sig == 0x4858, wrapped, hdr: h })
    }

    fn phys(&self, block: u64) -> u64 {
        self.off.saturating_add(block.saturating_mul(self.bs))
    }

    fn total_blocks(&self) -> u64 {
        be32(&self.hdr, 44) as u64
    }

    /// Reads `len` bytes at logical offset `at` of a fork (pieces from as many extents as needed).
    fn fork_read(&self, vol: &Vol, fork: &Fork, at: u64, len: usize) -> Result<Vec<u8>, String> {
        let mut out = Vec::with_capacity(len);
        if len == 0 {
            return Ok(out);
        }
        let mut logical = 0u64;
        for &(start, count) in &fork.runs {
            let bytes = count.saturating_mul(self.bs);
            let want = at + out.len() as u64;
            if want < logical.saturating_add(bytes) {
                let inside = want - logical;
                let n = (bytes - inside).min((len - out.len()) as u64) as usize;
                out.extend_from_slice(&vol.read(self.phys(start).saturating_add(inside), n)?);
                if out.len() == len {
                    return Ok(out);
                }
            }
            logical = logical.saturating_add(bytes);
        }
        Err("hfs: read past the end of a fork".into())
    }
}

// ───────── B-trees

struct Tree {
    fork: Fork,
    node_size: usize,
    root: u32,
    first_leaf: u32,
    total: u32,
    max_key: usize,
    variable_index_keys: bool,
}

/// What a leaf scan does with a record.
enum Step {
    Next,
    Stop,
}

impl Tree {
    fn open(g: &Geo, vol: &Vol, fork: Fork) -> Result<Tree, String> {
        let head = g.fork_read(vol, &fork, 0, 512)?;
        let node_size = be16(&head, 32) as usize;
        if !(512..=32768).contains(&node_size) || !node_size.is_power_of_two() || head[8] != 1 {
            return Err("hfs: bad B-tree header node".into());
        }
        let fork_bytes: u64 = fork.runs.iter().map(|r| r.1.saturating_mul(g.bs)).sum();
        let total = be32(&head, 36).min((fork_bytes / node_size as u64).min(u32::MAX as u64) as u32);
        Ok(Tree {
            node_size,
            root: be32(&head, 16),
            first_leaf: be32(&head, 24),
            total,
            max_key: be16(&head, 34) as usize,
            variable_index_keys: be32(&head, 52) & 4 != 0,
            fork,
        })
    }

    fn node(&self, g: &Geo, vol: &Vol, n: u32) -> Result<Vec<u8>, String> {
        if n == 0 || n >= self.total {
            return Err(format!("hfs: B-tree node {n} is outside the tree"));
        }
        g.fork_read(vol, &self.fork, n as u64 * self.node_size as u64, self.node_size)
    }

    /// The records of a node as (key, data) slices.
    fn records<'b>(&self, node: &'b [u8]) -> Vec<(&'b [u8], &'b [u8])> {
        let ns = node.len();
        let kind = node[8] as i8;
        let count = (be16(node, 10) as usize).min((ns - 14) / 2);
        let table = ns - 2 * (count + 1);
        let at = |i: usize| be16(node, ns - 2 * (i + 1)) as usize;
        let mut out = Vec::with_capacity(count);
        for i in 0..count {
            let (a, end) = (at(i), at(i + 1));
            if a < 14 || a + 2 > end || end > table {
                continue;
            }
            let rec = &node[a..end];
            let mut klen = be16(rec, 0) as usize;
            if kind == 0 && !self.variable_index_keys && self.max_key > 0 {
                klen = self.max_key;
            }
            let data_at = 2 + klen + (klen & 1);
            if data_at > rec.len() {
                continue;
            }
            out.push((&rec[2..2 + klen], &rec[data_at..]));
        }
        out
    }

    /// The leaf where records ≥ the target start: index descent with `le(key)` = "key ≤ target".
    fn find_leaf(&self, g: &Geo, vol: &Vol, le: &dyn Fn(&[u8]) -> bool) -> u32 {
        let mut n = self.root;
        let mut seen = HashSet::new();
        for _ in 0..16 {
            if !seen.insert(n) {
                break;
            }
            let Ok(node) = self.node(g, vol, n) else { break };
            match node[8] as i8 {
                -1 => return n,
                0 => {}
                _ => break,
            }
            let recs = self.records(&node);
            let pick = recs.iter().rposition(|(k, _)| le(k)).unwrap_or(0);
            let Some((_, d)) = recs.get(pick) else { break };
            n = be32(d, 0);
        }
        self.first_leaf
    }

    /// Walks the leaf chain from `start`, handing each record to `f` until it says stop.
    fn scan(&self, g: &Geo, vol: &Vol, start: u32, f: &mut dyn FnMut(&[u8], &[u8]) -> Step) {
        let mut n = start;
        let mut seen = HashSet::new();
        while n != 0 && seen.len() <= self.total as usize && seen.insert(n) {
            let Ok(node) = self.node(g, vol, n) else { return };
            if node[8] as i8 != -1 {
                return;
            }
            for (k, d) in self.records(&node) {
                if let Step::Stop = f(k, d) {
                    return;
                }
            }
            n = be32(&node, 0);
        }
    }
}

// ───────── catalog

struct Rec {
    name: Vec<u16>,
    data: Vec<u8>,
}

fn uni(b: &[u8], o: usize) -> Vec<u16> {
    let n = (be16(b, o) as usize).min(255).min(b.len().saturating_sub(o + 2) / 2);
    (0..n).map(|i| be16(b, o + 2 + i * 2)).collect()
}

fn units(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

const HLNK: u32 = 0x686C_6E6B; // 'hlnk'
const HFSP: u32 = 0x6866_732B; // 'hfs+'
const FDRP: u32 = 0x6664_7270; // 'fdrp'
const MACS: u32 = 0x4D41_4353; // 'MACS'
const UF_COMPRESSED: u8 = 0x20;
const CHUNK: usize = 65536;
const MAX_DECODED: u64 = 512 << 20;
const PRIVATE_FILES: &str = "\0\0\0\0HFS+ Private Data";
const PRIVATE_DIRS: &str = ".HFS+ Private Directory Data\r";

/// A file record that is a hard link: Some(false) to a file (iNode<n>), Some(true) to a directory (dir_<n>).
fn link_kind(d: &[u8]) -> Option<bool> {
    if be16(d, 0) != 2 {
        return None;
    }
    match (be32(d, 48), be32(d, 52)) {
        (HLNK, HFSP) => Some(false),
        (FDRP, MACS) => Some(true),
        _ => None,
    }
}

/// The `com.apple.decmpfs` header of a compressed file.
struct Decmpfs {
    kind: u32,
    size: u64,
    attr: Vec<u8>,
}

/// Appends extent records (start block of the record, extents) that continue a fork, in order.
fn extend_runs(fork: &mut Fork, mut found: Vec<(u32, Vec<(u64, u64)>)>) {
    found.sort_by_key(|f| f.0);
    let mut at: u64 = fork.runs.iter().map(|r| r.1).sum();
    for (sb, runs) in found {
        if sb as u64 != at || fork.runs.len() >= MAX_EXTENTS {
            continue;
        }
        for r in runs {
            fork.runs.push(r);
            at += r.1;
        }
        if at >= fork.blocks {
            break;
        }
    }
}

fn runs8(d: &[u8], o: usize) -> Vec<(u64, u64)> {
    (0..8).map(|i| (be32(d, o + i * 8) as u64, be32(d, o + i * 8 + 4) as u64)).take_while(|r| r.1 != 0).collect()
}

/// A chunk decoder: (compressed bytes, most bytes out).
type Codec = fn(&[u8], usize) -> Result<Vec<u8>, String>;

fn zlib(data: &[u8], cap: usize) -> Result<Vec<u8>, String> {
    miniz_oxide::inflate::decompress_to_vec_zlib_with_limit(data, cap.max(1)).map_err(|e| format!("hfs: damaged zlib data ({:?})", e.status))
}

/// LZFSE (decmpfs types 11 / 12) through `lzfse_rust`. The block headers are walked first so that the raw sizes they
/// declare stay within `cap` (a damaged header cannot make the decoder produce more than the file holds).
fn lzfse(data: &[u8], cap: usize) -> Result<Vec<u8>, String> {
    let bad = || "hfs: damaged LZFSE data".to_string();
    let (mut at, mut raw) = (0usize, 0u64);
    for _ in 0..1 << 16 {
        let Some(magic) = data.get(at..at + 4) else { return Err(bad()) };
        let n_raw = u32le(data, at + 4) as u64;
        let len = match magic {
            b"bvx$" => break,
            b"bvx-" => 8 + n_raw,
            b"bvxn" => 12 + u32le(data, at + 8) as u64,
            // v1: a 50-byte header, 720 bytes of frequency tables, then the literal and L/M/D payloads.
            b"bvx1" => 50 + 720 + u32le(data, at + 20) as u64 + u32le(data, at + 24) as u64,
            // v2: packed fields give the header size and the literal / L/M/D payload sizes.
            b"bvx2" => (u64le(data, at + 24) & 0xFFFF_FFFF) + (u64le(data, at + 8) >> 20 & 0xF_FFFF) + (u64le(data, at + 16) >> 40 & 0xF_FFFF),
            _ => return Err(bad()),
        };
        raw += n_raw;
        if raw > cap as u64 || len > (data.len() - at) as u64 {
            return Err(bad());
        }
        at += len as usize;
    }
    let mut out = Vec::new();
    lzfse_rust::decode_bytes(data, &mut out).map_err(|e| format!("hfs: damaged LZFSE data ({e})"))?;
    if out.len() > cap {
        return Err(bad());
    }
    Ok(out)
}

/// LZVN (Apple's small LZ77 codec, decmpfs types 7 / 8): opcodes carry literal and match lengths and a distance
/// (small, medium, large or the previous one); 0x06 ends the stream. At most `cap` bytes come out.
pub(crate) fn lzvn(src: &[u8], cap: usize) -> Result<Vec<u8>, String> {
    let bad = || "hfs: damaged LZVN data".to_string();
    let at = |i: usize| src.get(i).copied().ok_or_else(bad);
    let mut out: Vec<u8> = Vec::new();
    let (mut i, mut dist) = (0usize, 0usize);
    loop {
        let op = at(i)?;
        // (literal length, match length, new distance or None for the previous one, opcode length)
        let (lit, mat, d, len) = match op {
            0x06 => break,
            0x0E | 0x16 => (0, 0, None, 1),
            0x1E | 0x26 | 0x2E | 0x36 | 0x3E | 0x70..=0x7F | 0xD0..=0xDF => return Err(bad()),
            0xE0 => (at(i + 1)? as usize + 16, 0, None, 2),
            0xE1..=0xEF => ((op & 15) as usize, 0, None, 1),
            0xF0 => (0, at(i + 1)? as usize + 16, None, 2),
            0xF1..=0xFF => (0, (op & 15) as usize, None, 1),
            0xA0..=0xBF => {
                let (b1, b2) = (at(i + 1)? as usize, at(i + 2)? as usize);
                (((op >> 3) & 3) as usize, ((((op & 7) as usize) << 2) | (b1 & 3)) + 3, Some((b2 << 6) | (b1 >> 2)), 3)
            }
            _ => {
                let (l, m) = ((op >> 6) as usize, ((op >> 3) & 7) as usize + 3);
                match op & 7 {
                    6 => (l, m, None, 1),
                    7 => (l, m, Some(at(i + 1)? as usize | (at(i + 2)? as usize) << 8), 3),
                    _ => (l, m, Some(((op & 7) as usize) << 8 | at(i + 1)? as usize), 2),
                }
            }
        };
        i += len;
        if out.len() + lit + mat > cap {
            return Err(bad());
        }
        out.extend_from_slice(src.get(i..i + lit).ok_or_else(bad)?);
        i += lit;
        if let Some(d) = d {
            dist = d;
        }
        if mat > 0 {
            if dist == 0 || dist > out.len() {
                return Err(bad());
            }
            for _ in 0..mat {
                out.push(out[out.len() - dist]);
            }
        }
    }
    Ok(out)
}

struct Hfs<'a, 'b> {
    vol: &'a Vol<'b>,
    g: Geo,
    cat: Tree,
    ext: Option<Tree>,
    attr: Option<Tree>,
    /// The CNIDs of the hard-link folders (files, directories), found on first use.
    private: OnceCell<(Option<u32>, Option<u32>)>,
}

impl<'a, 'b> Hfs<'a, 'b> {
    fn open(vol: &'a Vol<'b>) -> Result<Self, String> {
        let g = Geo::new(vol)?;
        let ext = Tree::open(&g, vol, fork_at(&g.hdr, 192)).ok();
        let attr = Tree::open(&g, vol, fork_at(&g.hdr, 352)).ok();
        // An empty catalog until the catalog's own fork (CNID 4) has its overflow extents.
        let empty = Tree { fork: Fork::default(), node_size: 512, root: 0, first_leaf: 0, total: 0, max_key: 0, variable_index_keys: true };
        let mut me = Hfs { vol, cat: empty, ext, attr, g, private: OnceCell::new() };
        let mut cat = fork_at(&me.g.hdr, 272);
        me.overflow(4, 0, &mut cat);
        me.cat = Tree::open(&me.g, vol, cat)?;
        Ok(me)
    }

    /// Adds the extents overflow records of a fork whose 8 in-record extents do not cover it.
    fn overflow(&self, file_id: u32, fork_type: u8, fork: &mut Fork) {
        let have: u64 = fork.runs.iter().map(|r| r.1).sum();
        if have >= fork.blocks || file_id == 3 {
            return;
        }
        let Some(t) = &self.ext else { return };
        let key = |k: &[u8]| (be32(k, 2), k.first().copied().unwrap_or(0), be32(k, 6));
        let start = t.find_leaf(&self.g, self.vol, &|k| key(k) <= (file_id, fork_type, 0));
        let mut found: Vec<(u32, Vec<(u64, u64)>)> = Vec::new();
        t.scan(&self.g, self.vol, start, &mut |k, d| {
            let (fid, ft, sb) = key(k);
            if (fid, ft) < (file_id, fork_type) {
                return Step::Next;
            }
            if (fid, ft) > (file_id, fork_type) || found.len() > MAX_EXTENTS / 8 {
                return Step::Stop;
            }
            found.push((sb, runs8(d, 0)));
            Step::Next
        });
        extend_runs(fork, found);
    }

    fn full(&self, mut fork: Fork, file_id: u32, fork_type: u8) -> Fork {
        self.overflow(file_id, fork_type, &mut fork);
        fork
    }

    /// Calls `f` for every catalog record whose parent is `parent`, in key order (the thread record comes first).
    fn children(&self, parent: u32, f: &mut dyn FnMut(Rec) -> Step) {
        let start = self.cat.find_leaf(&self.g, self.vol, &|k| {
            let pid = be32(k, 0);
            pid < parent || (pid == parent && be16(k, 4) == 0)
        });
        let mut n = 0usize;
        self.cat.scan(&self.g, self.vol, start, &mut |k, d| {
            let pid = be32(k, 0);
            if pid < parent {
                return Step::Next;
            }
            n += 1;
            if pid > parent || n > MAX_RECORDS {
                return Step::Stop;
            }
            f(Rec { name: uni(k, 4), data: d.to_vec() })
        });
    }

    /// Name order for the index descent: HFSX compares binary; HFS+ folds case (ASCII here) and sorts NUL last.
    fn fold(&self, s: &[u16]) -> Vec<u16> {
        if self.g.hfsx {
            return s.to_vec();
        }
        s.iter().map(|&c| if c == 0 { 0xFFFF } else if (0x41..=0x5A).contains(&c) { c + 32 } else { c }).collect()
    }

    /// The catalog record `name` in folder `parent`: an index descent by name, then (if the order did not match) a scan.
    fn lookup(&self, parent: u32, name: &[u16]) -> Option<Rec> {
        let want = self.fold(name);
        let start = self.cat.find_leaf(&self.g, self.vol, &|k| {
            let pid = be32(k, 0);
            pid < parent || (pid == parent && self.fold(&uni(k, 4)) <= want)
        });
        let mut found = None;
        let mut n = 0usize;
        self.cat.scan(&self.g, self.vol, start, &mut |k, d| {
            let pid = be32(k, 0);
            n += 1;
            if pid > parent || n > MAX_RECORDS {
                return Step::Stop;
            }
            if pid == parent && uni(k, 4) == name {
                found = Some(Rec { name: name.to_vec(), data: d.to_vec() });
                return Step::Stop;
            }
            Step::Next
        });
        if found.is_none() {
            self.children(parent, &mut |r| {
                if r.name == name {
                    found = Some(r);
                    return Step::Stop;
                }
                Step::Next
            });
        }
        found
    }

    /// The thread record of a CNID: (is folder, parent CNID, name).
    fn thread(&self, cnid: u32) -> Option<(bool, u32, Vec<u16>)> {
        let mut out = None;
        self.children(cnid, &mut |r| {
            let t = be16(&r.data, 0);
            if t == 3 || t == 4 {
                out = Some((t == 3, be32(&r.data, 4), uni(&r.data, 8)));
            }
            Step::Stop
        });
        out
    }

    fn private(&self) -> (Option<u32>, Option<u32>) {
        *self.private.get_or_init(|| {
            let folder = |name: &str| self.lookup(ROOT, &units(name)).filter(|r| be16(&r.data, 0) == 1).map(|r| be32(&r.data, 8));
            (folder(PRIVATE_FILES), folder(PRIVATE_DIRS))
        })
    }

    /// The iNode file record a file hard link points at.
    fn file_link_target(&self, d: &[u8]) -> Option<Vec<u8>> {
        let dir = self.private().0?;
        self.lookup(dir, &units(&format!("iNode{}", be32(d, 44)))).filter(|r| be16(&r.data, 0) == 2).map(|r| r.data)
    }

    /// The folder a directory hard link points at.
    fn dir_link_target(&self, d: &[u8]) -> Option<u32> {
        let dir = self.private().1?;
        self.lookup(dir, &units(&format!("dir_{}", be32(d, 44)))).filter(|r| be16(&r.data, 0) == 1).map(|r| be32(&r.data, 8))
    }

    /// An extended attribute of a file: inline data (record type 0x10) or fork data (0x20, continued by 0x30 extents).
    fn xattr(&self, file_id: u32, name: &str) -> Option<Vec<u8>> {
        let t = self.attr.as_ref()?;
        let want = units(name);
        let start = t.find_leaf(&self.g, self.vol, &|k| be32(k, 2) < file_id);
        let (mut inline, mut fork, mut more, mut n) = (None, None::<Fork>, Vec::new(), 0usize);
        t.scan(&self.g, self.vol, start, &mut |k, d| {
            let fid = be32(k, 2);
            if fid < file_id {
                return Step::Next;
            }
            n += 1;
            if fid > file_id || n > 4096 {
                return Step::Stop;
            }
            if uni(k, 10) != want {
                return if fork.is_some() { Step::Stop } else { Step::Next };
            }
            match be32(d, 0) {
                0x10 => {
                    let size = be32(d, 12) as usize;
                    inline = d.get(16..16usize.saturating_add(size)).map(<[u8]>::to_vec);
                    Step::Stop
                }
                0x20 => {
                    fork = Some(fork_at(d, 8));
                    Step::Next
                }
                0x30 => {
                    more.push((be32(k, 6), runs8(d, 8)));
                    Step::Next
                }
                _ => Step::Next,
            }
        });
        if inline.is_some() {
            return inline;
        }
        let mut f = fork?;
        extend_runs(&mut f, more);
        if f.size > 64 << 20 {
            return None;
        }
        self.g.fork_read(self.vol, &f, 0, f.size as usize).ok()
    }

    fn decmpfs(&self, d: &[u8]) -> Option<Decmpfs> {
        if d.get(41).copied().unwrap_or(0) & UF_COMPRESSED == 0 {
            return None;
        }
        let a = self.xattr(be32(d, 8), "com.apple.decmpfs")?;
        if a.len() < 16 || &a[0..4] != b"fpmc" {
            return None;
        }
        Some(Decmpfs { kind: u32le(&a, 4), size: u64le(&a, 8), attr: a })
    }

    fn rsrc_read(&self, fork: &Fork, at: u64, len: usize) -> Result<Vec<u8>, String> {
        if at.saturating_add(len as u64) > fork.size {
            return Err("hfs: compressed data runs past the end of the resource fork".into());
        }
        self.g.fork_read(self.vol, fork, at, len)
    }

    /// The bytes of a compressed file (`rsrc`: its resource fork, with overflow extents).
    fn decompress(&self, c: &Decmpfs, rsrc: &Fork) -> Result<Vec<u8>, String> {
        if c.size > MAX_DECODED {
            return Err(format!("hfs: the compressed file is {} bytes uncompressed, too large", c.size));
        }
        let size = c.size as usize;
        let inline = &c.attr[16..];
        let stored = |b: Option<&u8>| b.is_some_and(|b| b & 0x0F == 0x0F);
        let out = match c.kind {
            1 => inline.to_vec(),
            3 if stored(inline.first()) => inline[1..].to_vec(),
            3 => zlib(inline, size)?,
            7 if inline.first() == Some(&0x06) => inline[1..].to_vec(),
            7 => lzvn(inline, size)?,
            11 if inline.first() == Some(&0xFF) => inline[1..].to_vec(),
            11 => lzfse(inline, size)?,
            4 => {
                // Resource fork: a big-endian header (data offset first), the resource's length, then a little-endian block
                // table (count, then offset / size pairs from the start of the resource data) and 64 KiB zlib chunks.
                let base = be32(&self.rsrc_read(rsrc, 0, 16)?, 0) as u64 + 4;
                let n = u32le(&self.rsrc_read(rsrc, base, 4)?, 0) as usize;
                if n > size.div_ceil(CHUNK) + 1 || n > 1 << 14 {
                    return Err("hfs: bad compressed block table".into());
                }
                let table = self.rsrc_read(rsrc, base + 4, n * 8)?;
                let mut out = Vec::new();
                for i in 0..n {
                    let (off, len) = (u32le(&table, i * 8) as u64, u32le(&table, i * 8 + 4) as usize);
                    let want = (size - out.len().min(size)).min(CHUNK);
                    if len > 2 * CHUNK || want == 0 {
                        return Err("hfs: bad compressed block".into());
                    }
                    let chunk = self.rsrc_read(rsrc, base + off, len)?;
                    if stored(chunk.first()) { out.extend_from_slice(&chunk[1..]) } else { out.extend(zlib(&chunk, want)?) }
                }
                out
            }
            8 | 12 => {
                // Resource fork: little-endian chunk offsets (the first is the table's size), each chunk LZVN (type 8) or
                // LZFSE (type 12), or stored: 0x06 (LZVN) / 0xFF (LZFSE) then the raw bytes.
                let (mark, decode): (u8, Codec) = if c.kind == 8 { (0x06, lzvn) } else { (0xFF, lzfse) };
                let first = u32le(&self.rsrc_read(rsrc, 0, 4)?, 0) as usize;
                let n = (first / 4).saturating_sub(1);
                if first < 8 || !first.is_multiple_of(4) || n > size.div_ceil(CHUNK) + 1 {
                    return Err("hfs: bad compressed block table".into());
                }
                let table = self.rsrc_read(rsrc, 0, first)?;
                let mut out = Vec::new();
                for i in 0..n {
                    let (a, b) = (u32le(&table, i * 4) as u64, u32le(&table, i * 4 + 4) as u64);
                    let want = (size - out.len().min(size)).min(CHUNK);
                    if b < a || b - a > 2 * CHUNK as u64 || want == 0 {
                        return Err("hfs: bad compressed block".into());
                    }
                    let chunk = self.rsrc_read(rsrc, a, (b - a) as usize)?;
                    if chunk.first() == Some(&mark) { out.extend_from_slice(&chunk[1..]) } else { out.extend(decode(&chunk, want)?) }
                }
                out
            }
            k => return Err(format!("hfs: unsupported decmpfs compression type {k}")),
        };
        if out.len() != size {
            return Err(format!("hfs: decompressed {} bytes, expected {size}", out.len()));
        }
        Ok(out)
    }

    fn extents(&self, fork: &Fork) -> Vec<(i64, u64)> {
        let mut out = Vec::new();
        let need = fork.size.div_ceil(self.g.bs);
        let mut got = 0u64;
        for &(start, count) in &fork.runs {
            if got >= need || out.len() >= MAX_EXTENTS {
                break;
            }
            let c = count.min(need - got);
            push_extent(&mut out, self.vol.abs(self.g.phys(start)).min(i64::MAX as u64) as i64, c * self.g.bs);
            got += c;
        }
        out
    }

    /// Entries for a folder or file record (a file with a resource fork gives two). `decode`: decompress a compressed
    /// file's data into `resident` (an error if that fails).
    fn entries(&self, r: &Rec, decode: bool, out: &mut Vec<Entry>) -> Result<(), String> {
        let d = &r.data;
        let name = String::from_utf16_lossy(&r.name);
        let (created, modified) = (hfs_time(be32(d, 12)), hfs_time(be32(d, 16)));
        match be16(d, 0) {
            1 => out.push(Entry { name, id: be32(d, 8).to_string(), dir: true, created, modified, ..Default::default() }),
            2 => {
                let id = be32(d, 8);
                match link_kind(d) {
                    Some(true) => out.push(Entry { name, id: id.to_string(), dir: true, created, modified, ..Default::default() }),
                    Some(false) => match self.file_link_target(d) {
                        Some(t) => return self.file_entries(name, id, &t, decode, out),
                        None => return self.file_entries(name, id, d, decode, out),
                    },
                    None => return self.file_entries(name, id, d, decode, out),
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// A file's data entry (and resource fork entry); `d` is the record holding the data (the iNode for a hard link).
    fn file_entries(&self, name: String, id: u32, d: &[u8], decode: bool, out: &mut Vec<Entry>) -> Result<(), String> {
        let fid = be32(d, 8);
        let (created, modified) = (hfs_time(be32(d, 12)), hfs_time(be32(d, 16)));
        let data = self.full(fork_at(d, 88), fid, 0);
        let rsrc = self.full(fork_at(d, 168), fid, 0xFF);
        let mut e = Entry { name: name.clone(), id: id.to_string(), size: data.size, extents: self.extents(&data), created, modified, ..Default::default() };
        if let Some(c) = self.decmpfs(d) {
            // Compressed: the size is the uncompressed one, the data lives in the attribute or in the resource fork.
            e.size = c.size;
            e.unit = CHUNK as u64;
            e.extents = if matches!(c.kind, 4 | 8 | 10 | 12 | 14) { self.extents(&rsrc) } else { Vec::new() };
            if decode {
                e.resident = Some(self.decompress(&c, &rsrc)?);
            }
        }
        let rsrc_entry = (rsrc.size > 0).then(|| Entry {
            name: format!("{name}/..namedfork/rsrc"),
            id: format!("{id}:rsrc"),
            size: rsrc.size,
            extents: self.extents(&rsrc),
            created: e.created.clone(),
            modified: e.modified.clone(),
            ..Default::default()
        });
        out.push(e);
        out.extend(rsrc_entry);
        Ok(())
    }

    fn path(&self, cnid: u32) -> String {
        let mut names = Vec::new();
        let mut cur = cnid;
        for _ in 0..64 {
            if cur == ROOT {
                break;
            }
            let Some((_, parent, name)) = self.thread(cur) else {
                names.push(format!("[{cur}]"));
                break;
            };
            names.push(String::from_utf16_lossy(&name));
            if parent <= 1 || parent == cur {
                break;
            }
            cur = parent;
        }
        names.reverse();
        format!("/{}", names.join("/"))
    }

    /// The catalog record of a CNID (through its thread).
    fn record(&self, cnid: u32) -> Option<Rec> {
        let (_, parent, name) = self.thread(cnid)?;
        self.lookup(parent, &name).filter(|r| matches!(be16(&r.data, 0), 1 | 2) && be32(&r.data, 8) == cnid)
    }
}

fn cnid_of(dir: Option<&str>) -> Result<u32, String> {
    match dir {
        None | Some("") | Some("root") => Ok(ROOT),
        Some(d) => d.parse().map_err(|_| format!("not a catalog node id: {d}")),
    }
}

/// Some(true) for HFSX, Some(false) for HFS+ (bare or inside an HFS wrapper), None otherwise.
pub(crate) fn detect(vol: &Vol) -> Option<bool> {
    Geo::new(vol).ok().map(|g| g.hfsx)
}

pub(crate) fn list(vol: &Vol, dir: Option<&str>, _deleted: bool) -> Result<Listing, String> {
    let h = Hfs::open(vol)?;
    let n = cnid_of(dir)?;
    // A directory hard link lists the folder it points at.
    let (target, parent) = match h.thread(n) {
        Some((true, p, _)) => (n, Some(p)),
        Some((false, p, _)) => {
            let to = h.record(n).filter(|r| link_kind(&r.data) == Some(true)).and_then(|r| h.dir_link_target(&r.data));
            (to.ok_or_else(|| format!("catalog node {n} is a file"))?, Some(p))
        }
        None => (n, None),
    };
    let mut entries = Vec::new();
    h.children(target, &mut |r| {
        let t = be16(&r.data, 0);
        if t != 3 && t != 4 {
            let _ = h.entries(&r, false, &mut entries);
        }
        Step::Next
    });
    if parent.is_none() && entries.is_empty() && n != ROOT {
        return Err(format!("no folder with catalog node id {n}"));
    }
    let parent = if n == ROOT { None } else { parent.map(|p| p.to_string()) };
    Ok(Listing { dir: n.to_string(), parent, path: if n == ROOT { "/".into() } else { h.path(n) }, entries })
}

pub(crate) fn file(vol: &Vol, id: &str) -> Result<Entry, String> {
    let h = Hfs::open(vol)?;
    let (num, rsrc) = match id.strip_suffix(":rsrc") {
        Some(n) => (n, true),
        None => (id, false),
    };
    let cnid: u32 = num.parse().map_err(|_| format!("not a catalog node id: {id}"))?;
    let rec = h.record(cnid).ok_or_else(|| format!("no catalog record for {id}"))?;
    let mut found = Vec::new();
    h.entries(&rec, !rsrc, &mut found)?;
    let want = if rsrc { id.to_string() } else { cnid.to_string() };
    found.into_iter().find(|e| e.id == want).ok_or_else(|| format!("no catalog record for {id}"))
}

pub(crate) fn info(vol: &Vol) -> Result<Info, String> {
    let h = Hfs::open(vol)?;
    let g = &h.g;
    let hd = &g.hdr;
    let label = h.thread(ROOT).map(|t| String::from_utf16_lossy(&t.2)).unwrap_or_default();
    let uuid = &hd[104..112];
    let serial = if uuid.iter().all(|&b| b == 0) { String::new() } else { uuid.iter().map(|b| format!("{b:02X}")).collect() };
    let lmv = &hd[8..12];
    let attrs = be32(hd, 4);
    let mut details = vec![
        ("Type".into(), if g.hfsx { "HFSX".into() } else { "HFS+".to_string() }),
        ("Version".into(), be16(hd, 2).to_string()),
        ("Block size".into(), g.bs.to_string()),
        ("Total blocks".into(), g.total_blocks().to_string()),
        ("Free blocks".into(), be32(hd, 48).to_string()),
        ("Files".into(), be32(hd, 32).to_string()),
        ("Folders".into(), be32(hd, 36).to_string()),
        ("Created".into(), hfs_time(be32(hd, 16))),
        ("Modified".into(), hfs_time(be32(hd, 20))),
        ("Checked".into(), hfs_time(be32(hd, 28))),
        ("Journaled".into(), if attrs & 0x2000 != 0 { "yes" } else { "no" }.into()),
        ("Last mounted by".into(), String::from_utf8_lossy(lmv).trim_end_matches('\0').to_string()),
        ("Next catalog id".into(), be32(hd, 64).to_string()),
        ("Catalog node size".into(), h.cat.node_size.to_string()),
    ];
    if g.wrapped {
        details.push(("Embedded in HFS wrapper at".into(), format!("{:#x}", g.off)));
    }
    Ok(Info { label, serial, cluster: g.bs, total: g.total_blocks() * g.bs, sector: 512, details })
}

#[cfg(test)]
mod tests {
    use super::super::assemble;
    use super::*;

    const BS: usize = 512;
    const NS: usize = 1024;
    const BLOCKS: usize = 256;
    const T: u32 = 3_800_000_000; // 2024-05-31 11:33:20 UTC

    fn p16(b: &mut [u8], o: usize, v: u16) {
        b[o..o + 2].copy_from_slice(&v.to_be_bytes());
    }
    fn p32(b: &mut [u8], o: usize, v: u32) {
        b[o..o + 4].copy_from_slice(&v.to_be_bytes());
    }
    fn p64(b: &mut [u8], o: usize, v: u64) {
        b[o..o + 8].copy_from_slice(&v.to_be_bytes());
    }
    fn uni_bytes(s: &str) -> Vec<u8> {
        let n = units(s);
        let mut b = vec![0u8; 2 + n.len() * 2];
        p16(&mut b, 0, n.len() as u16);
        for (i, u) in n.iter().enumerate() {
            p16(&mut b, 2 + i * 2, *u);
        }
        b
    }
    fn ckey(pid: u32, name: &str) -> Vec<u8> {
        let u = uni_bytes(name);
        let mut k = vec![0u8; 6];
        p16(&mut k, 0, (4 + u.len()) as u16);
        p32(&mut k, 2, pid);
        [k, u].concat()
    }
    fn fork(b: &mut [u8], o: usize, size: u64, runs: &[(u32, u32)]) {
        p64(b, o, size);
        p32(b, o + 12, runs.iter().map(|r| r.1).sum());
        for (i, &(s, c)) in runs.iter().take(8).enumerate() {
            p32(b, o + 16 + i * 8, s);
            p32(b, o + 20 + i * 8, c);
        }
    }
    fn folder(id: u32) -> Vec<u8> {
        let mut d = vec![0u8; 88];
        p16(&mut d, 0, 1);
        p32(&mut d, 8, id);
        p32(&mut d, 12, T);
        p32(&mut d, 16, T + 60);
        d
    }
    fn filerec(id: u32) -> Vec<u8> {
        let mut d = vec![0u8; 248];
        p16(&mut d, 0, 2);
        p32(&mut d, 8, id);
        p32(&mut d, 12, T);
        p32(&mut d, 16, T + 3600);
        d
    }
    fn link(mut d: Vec<u8>, ty: &[u8; 4], cr: &[u8; 4], special: u32) -> Vec<u8> {
        d[48..52].copy_from_slice(ty);
        d[52..56].copy_from_slice(cr);
        p32(&mut d, 44, special);
        d
    }
    fn thread(kind: u16, parent: u32, name: &str) -> Vec<u8> {
        let mut d = vec![0u8; 8];
        p16(&mut d, 0, kind);
        p32(&mut d, 4, parent);
        [d, uni_bytes(name)].concat()
    }
    fn node(ns: usize, kind: i8, height: u8, flink: u32, blink: u32, recs: &[Vec<u8>]) -> Vec<u8> {
        let mut b = vec![0u8; ns];
        p32(&mut b, 0, flink);
        p32(&mut b, 4, blink);
        b[8] = kind as u8;
        b[9] = height;
        p16(&mut b, 10, recs.len() as u16);
        let mut at = 14;
        for (i, r) in recs.iter().enumerate() {
            p16(&mut b, ns - 2 * (i + 1), at as u16);
            b[at..at + r.len()].copy_from_slice(r);
            at += r.len();
        }
        p16(&mut b, ns - 2 * (recs.len() + 1), at as u16);
        assert!(at <= ns - 2 * (recs.len() + 1), "node overflow");
        b
    }
    fn header_node(ns: usize, depth: u16, root: u32, leaves: (u32, u32), max_key: u16, total: u32, attrs: u32) -> Vec<u8> {
        let mut r = vec![0u8; 106];
        p16(&mut r, 0, depth);
        p32(&mut r, 2, root);
        p32(&mut r, 6, 10);
        p32(&mut r, 10, leaves.0);
        p32(&mut r, 14, leaves.1);
        p16(&mut r, 18, ns as u16);
        p16(&mut r, 20, max_key);
        p32(&mut r, 22, total);
        p32(&mut r, 38, attrs);
        node(ns, 1, 0, 0, 0, &[r])
    }
    fn put(img: &mut [u8], block: usize, data: &[u8]) {
        img[block * BS..block * BS + data.len()].copy_from_slice(data);
    }
    fn hfs_fold(s: &str) -> Vec<u16> {
        units(s).iter().map(|&c| if c == 0 { 0xFFFF } else if (0x41..=0x5A).contains(&c) { c + 32 } else { c }).collect()
    }
    /// Catalog node n: nodes 0-3 in blocks 6-13, the rest from block 200 (two extents).
    fn cat_block(n: usize) -> usize {
        if n < 4 { 6 + 2 * n } else { 200 + 2 * (n - 4) }
    }
    fn decmpfs(kind: u32, size: u64, data: &[u8]) -> Vec<u8> {
        let mut h = b"fpmc".to_vec();
        h.extend(kind.to_le_bytes());
        h.extend(size.to_le_bytes());
        h.extend_from_slice(data);
        h
    }
    fn attr_key(fid: u32, start: u32, name: &str) -> Vec<u8> {
        let u = uni_bytes(name);
        let mut k = vec![0u8; 12];
        p16(&mut k, 0, (10 + u.len()) as u16);
        p32(&mut k, 4, fid);
        p32(&mut k, 8, start);
        [k, u].concat()
    }

    // ── contents
    fn frag_data() -> Vec<u8> {
        (0..9 * BS - 100).map(|i| (i * 7 % 251) as u8).collect()
    }
    fn sub_data() -> Vec<u8> {
        (0..600).map(|i| (i % 13) as u8 + b'a').collect()
    }
    fn z3_data() -> Vec<u8> {
        b"zlib inline. ".repeat(20)
    }
    fn z4_data() -> Vec<u8> {
        (0..70_000u32).map(|i| (i % 251) as u8).collect()
    }
    const LZVN_TEXT: &[u8] = b"abcabcabcabcXYZQbcabcabcXYabc!bca01234567890123456789bc!bca0123456789";
    /// A hand-made LZVN stream with every opcode kind (sml_d, sml_m, sml_l, med_d, lrg_d, pre_d, lrg_l, lrg_m, nop, eos).
    fn lzvn_stream() -> Vec<u8> {
        let mut s = vec![0xC8, 0x03, b'a', b'b', b'c', 0xF5, 0x0E, 0xE3, b'X', b'Y', b'Z', 0xA9, 0x33, 0x00, b'Q', 0x07, 26, 0, 0x46, b'!', 0xE0, 4];
        s.extend_from_slice(b"01234567890123456789");
        s.extend([0xF0, 0, 0x06, 0, 0, 0, 0, 0, 0, 0]);
        s
    }
    /// 64 KiB of "abab…" as LZVN.
    fn lzvn_ab() -> Vec<u8> {
        let mut s = vec![0x80, 2, b'a', b'b'];
        let mut left = CHUNK - 5;
        while left >= 271 {
            s.extend([0xF0, 255]);
            left -= 271;
        }
        s.extend([0xF0, (left - 16) as u8, 0x06, 0, 0, 0, 0, 0, 0, 0]);
        s
    }
    fn v8_data() -> Vec<u8> {
        let mut d: Vec<u8> = (0..CHUNK).map(|i| if i % 2 == 0 { b'a' } else { b'b' }).collect();
        d.extend_from_slice(b"tail of the lzvn file");
        d
    }
    /// A type-4 resource fork: header, resource length, block table, a zlib chunk and a stored (0xFF) chunk.
    fn rsrc_zlib(content: &[u8]) -> Vec<u8> {
        let blocks: Vec<Vec<u8>> = content
            .chunks(CHUNK)
            .enumerate()
            .map(|(i, c)| if i == 0 { miniz_oxide::deflate::compress_to_vec_zlib(c, 6) } else { [&[0xFF][..], c].concat() })
            .collect();
        let mut res = (blocks.len() as u32).to_le_bytes().to_vec();
        let mut off = 4 + 8 * blocks.len();
        for b in &blocks {
            res.extend((off as u32).to_le_bytes());
            res.extend((b.len() as u32).to_le_bytes());
            off += b.len();
        }
        blocks.iter().for_each(|b| res.extend(b));
        let mut f = vec![0u8; 0x100];
        p32(&mut f, 0, 0x100);
        p32(&mut f, 4, (0x104 + res.len()) as u32);
        p32(&mut f, 8, (res.len() + 4) as u32);
        f.extend((res.len() as u32).to_be_bytes());
        f.extend(res);
        f
    }
    /// A type-8 resource fork: chunk offsets, an LZVN chunk and a stored (0x06) chunk.
    fn rsrc_lzvn() -> Vec<u8> {
        let chunks = [lzvn_ab(), [&[0x06][..], b"tail of the lzvn file"].concat()];
        let mut off = 4 * (chunks.len() + 1);
        let mut f = (off as u32).to_le_bytes().to_vec();
        for c in &chunks {
            off += c.len();
            f.extend((off as u32).to_le_bytes());
        }
        chunks.iter().for_each(|c| f.extend(c));
        f
    }

    fn lzfse_enc(data: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        lzfse_rust::encode_bytes(data, &mut out).unwrap();
        out
    }
    /// Text from a small vocabulary (compressible, not trivially).
    fn words(n: usize, mut seed: u32) -> Vec<u8> {
        const W: [&str; 8] = ["apple ", "volume ", "catalog ", "fork ", "extent ", "node ", "leaf ", "header "];
        let mut out = Vec::new();
        while out.len() < n {
            seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12345);
            out.extend_from_slice(W[(seed >> 16) as usize % 8].as_bytes());
        }
        out.truncate(n);
        out
    }
    fn f11_data() -> Vec<u8> {
        b"LZFSE inline. ".repeat(400)
    }
    fn lz_data() -> Vec<u8> {
        words(CHUNK + 300, 7)
    }
    /// A type-12 resource fork: chunk offsets, an LZFSE chunk and a stored (0xFF) chunk.
    fn rsrc_lzfse() -> Vec<u8> {
        let d = lz_data();
        let chunks = [lzfse_enc(&d[..CHUNK]), [&[0xFF][..], &d[CHUNK..]].concat()];
        let mut off = 4 * (chunks.len() + 1);
        let mut f = (off as u32).to_le_bytes().to_vec();
        for c in &chunks {
            off += c.len();
            f.extend((off as u32).to_le_bytes());
        }
        chunks.iter().for_each(|c| f.extend(c));
        f
    }

    struct Builder {
        img: Vec<u8>,
        next: usize,
        cat: Vec<(u32, String, Vec<u8>)>,
        attrs: Vec<(u32, Vec<u8>)>,
        ext: Vec<Vec<u8>>,
    }

    impl Builder {
        fn blocks(&mut self, bytes: &[u8]) -> (u32, u32) {
            let n = bytes.len().div_ceil(BS).max(1);
            let s = self.next;
            put(&mut self.img, s, bytes);
            self.next += n;
            assert!(self.next < 200, "out of test blocks");
            (s as u32, n as u32)
        }
        fn with_fork(&mut self, mut rec: Vec<u8>, at: usize, bytes: &[u8]) -> Vec<u8> {
            let (s, n) = self.blocks(bytes);
            fork(&mut rec, at, bytes.len() as u64, &[(s, n)]);
            rec
        }
        fn folder(&mut self, parent: u32, id: u32, name: &str) {
            self.cat.push((parent, name.into(), folder(id)));
            self.cat.push((id, String::new(), thread(3, parent, name)));
        }
        fn file(&mut self, parent: u32, name: &str, rec: Vec<u8>) {
            let id = be32(&rec, 8);
            self.cat.push((parent, name.into(), rec));
            self.cat.push((id, String::new(), thread(4, parent, name)));
        }
        fn inline_attr(&mut self, fid: u32, data: Vec<u8>) {
            let mut d = vec![0u8; 16];
            p32(&mut d, 0, 0x10);
            p32(&mut d, 12, data.len() as u32);
            d.extend(&data);
            if d.len() % 2 == 1 {
                d.push(0);
            }
            self.attrs.push((fid, [attr_key(fid, 0, "com.apple.decmpfs"), d].concat()));
        }
        fn compressed(&mut self, parent: u32, name: &str, id: u32, attr: Vec<u8>, rsrc: Option<&[u8]>) {
            let mut rec = filerec(id);
            rec[41] = UF_COMPRESSED;
            if let Some(r) = rsrc {
                rec = self.with_fork(rec, 168, r);
            }
            self.inline_attr(id, attr);
            self.file(parent, name, rec);
        }

        fn image() -> Vec<u8> {
            let mut b = Builder { img: vec![0u8; BLOCKS * BS], next: 18, cat: Vec::new(), attrs: Vec::new(), ext: Vec::new() };
            b.cat.push((1, "MyVol".into(), folder(2)));
            b.cat.push((2, String::new(), thread(3, 1, "MyVol")));
            let hello = b.with_fork(filerec(16), 88, b"Hello, HFS+!");
            let hello = b.with_fork(hello, 168, b"RSRC!");
            b.file(2, "hello.txt", hello);
            // frag.dat: nine one-block extents with gaps, the ninth in the extents overflow file.
            let mut runs = Vec::new();
            for c in frag_data().chunks(BS) {
                runs.push(b.blocks(c));
                b.next += 1;
            }
            let mut frag = filerec(17);
            fork(&mut frag, 88, frag_data().len() as u64, &runs);
            p32(&mut frag, 88 + 12, 9);
            b.file(2, "frag.dat", frag);
            let mut ek = vec![0u8; 12];
            p16(&mut ek, 0, 10);
            p32(&mut ek, 4, 17);
            p32(&mut ek, 8, 8);
            let mut ed = vec![0u8; 64];
            p32(&mut ed, 0, runs[8].0);
            p32(&mut ed, 4, 1);
            b.ext.push([ek, ed].concat());
            b.folder(2, 18, "sub");
            let sub = b.with_fork(filerec(19), 88, &sub_data());
            b.file(18, "b\u{e9}.bin", sub);

            // Compressed files.
            let z3 = miniz_oxide::deflate::compress_to_vec_zlib(&z3_data(), 6);
            b.compressed(2, "z3.txt", 20, decmpfs(3, z3_data().len() as u64, &z3), None);
            b.compressed(2, "s3.txt", 32, decmpfs(3, 11, b"\x0Fstored text"), None);
            b.compressed(2, "z4.bin", 21, decmpfs(4, z4_data().len() as u64, &[]), Some(&rsrc_zlib(&z4_data())));
            b.compressed(2, "v7.txt", 22, decmpfs(7, LZVN_TEXT.len() as u64, &lzvn_stream()), None);
            b.compressed(2, "v8.bin", 23, decmpfs(8, v8_data().len() as u64, &[]), Some(&rsrc_lzvn()));
            b.compressed(2, "f11.txt", 33, decmpfs(11, f11_data().len() as u64, &lzfse_enc(&f11_data())), None);
            // lz.bin: LZFSE in the resource fork, its decmpfs attribute held as fork data (record type 0x20).
            let mut lz = b.with_fork(filerec(24), 168, &rsrc_lzfse());
            lz[41] = UF_COMPRESSED;
            let hdr = decmpfs(12, lz_data().len() as u64, &[]);
            let (s, n) = b.blocks(&hdr);
            let mut d = vec![0u8; 88];
            p32(&mut d, 0, 0x20);
            fork(&mut d, 8, hdr.len() as u64, &[(s, n)]);
            b.attrs.push((24, [attr_key(24, 0, "com.apple.decmpfs"), d].concat()));
            b.file(2, "lz.bin", lz);

            // Hard links.
            b.folder(2, 27, PRIVATE_FILES);
            let inode = b.with_fork(filerec(26), 88, b"linked data!");
            b.file(27, "iNode26", inode);
            b.file(2, "link.txt", link(filerec(25), b"hlnk", b"hfs+", 26));
            b.folder(2, 30, PRIVATE_DIRS);
            b.folder(30, 29, "dir_29");
            let inner = b.with_fork(filerec(31), 88, b"inner");
            b.file(29, "inner.txt", inner);
            b.file(2, "dlink", link(filerec(28), b"fdrp", b"MACS", 29));
            b.finish()
        }

        fn finish(mut self) -> Vec<u8> {
            let mut im = std::mem::take(&mut self.img);
            let img = &mut im[..];
            let vh = 1024;
            img[vh..vh + 2].copy_from_slice(b"H+");
            p16(img, vh + 2, 4);
            img[vh + 8..vh + 12].copy_from_slice(b"10.0");
            p32(img, vh + 16, T);
            p32(img, vh + 20, T + 100);
            p32(img, vh + 32, 3);
            p32(img, vh + 36, 1);
            p32(img, vh + 40, BS as u32);
            p32(img, vh + 44, BLOCKS as u32);
            p32(img, vh + 48, 10);
            p32(img, vh + 64, 40);
            img[vh + 104..vh + 112].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
            // Extents overflow tree: blocks 4-5.
            put(img, 4, &header_node(512, 1, 1, (1, 1), 10, 2, 2));
            put(img, 5, &node(512, -1, 1, 0, 0, &self.ext));
            fork(img, vh + 192, 1024, &[(4, 2)]);
            // Attributes tree: blocks 14-17.
            self.attrs.sort_by_key(|a| a.0);
            let recs: Vec<Vec<u8>> = self.attrs.iter().map(|a| a.1.clone()).collect();
            put(img, 14, &header_node(NS, 1, 1, (1, 1), 266, 2, 6));
            put(img, 16, &node(NS, -1, 1, 0, 0, &recs));
            fork(img, vh + 352, 2048, &[(14, 4)]);
            // Catalog: header, index, leaves packed in key order.
            self.cat.sort_by_key(|a| (a.0, hfs_fold(&a.1)));
            let mut leaves: Vec<Vec<Vec<u8>>> = vec![Vec::new()];
            let mut used = 14 + 2;
            for (pid, name, data) in &self.cat {
                let r = [ckey(*pid, name), data.clone()].concat();
                if used + r.len() + 2 > NS {
                    leaves.push(Vec::new());
                    used = 16;
                }
                used += r.len() + 2;
                leaves.last_mut().unwrap().push(r);
            }
            let total = 2 + leaves.len();
            assert!(total > 4 && cat_block(total) <= BLOCKS);
            let mut index = Vec::new();
            for (i, l) in leaves.iter().enumerate() {
                let n = 2 + i as u32;
                let key_len = be16(&l[0], 0) as usize;
                index.push([&l[0][..2 + key_len], &n.to_be_bytes()[..]].concat());
                let next = if i + 1 < leaves.len() { n + 1 } else { 0 };
                put(img, cat_block(n as usize), &node(NS, -1, 1, next, if i == 0 { 0 } else { n - 1 }, l));
            }
            put(img, cat_block(0), &header_node(NS, 2, 1, (2, total as u32 - 1), 516, total as u32, 6));
            put(img, cat_block(1), &node(NS, 0, 2, 0, 0, &index));
            fork(img, vh + 272, (total * NS) as u64, &[(6, 8), (200, 2 * (total as u32 - 4))]);
            im
        }
    }

    fn vol(img: &Vec<u8>) -> Vol<'_> {
        Vol { src: img, base: 0 }
    }
    fn read_id(img: &Vec<u8>, id: &str) -> Vec<u8> {
        let v = vol(img);
        assemble(v.src, &file(&v, id).unwrap()).unwrap()
    }
    fn find<'e>(l: &'e Listing, name: &str) -> &'e Entry {
        l.entries.iter().find(|e| e.name == name).unwrap_or_else(|| panic!("no {name:?} in {:?}", l.entries.iter().map(|e| &e.name).collect::<Vec<_>>()))
    }

    #[test]
    fn hfs_info_list_read() {
        let img = Builder::image();
        let v = vol(&img);
        assert_eq!(detect(&v), Some(false));
        let i = info(&v).unwrap();
        assert_eq!(i.label, "MyVol");
        assert_eq!((i.cluster, i.total), (512, (BLOCKS * 512) as u64));
        assert_eq!(i.serial, "0102030405060708");
        assert!(i.details.iter().any(|(k, v)| k == "Files" && v == "3"));

        let root = list(&v, None, true).unwrap();
        assert_eq!((root.path.as_str(), root.parent.clone()), ("/", None));
        let names: Vec<&str> = root.entries.iter().map(|e| e.name.as_str()).take(4).collect();
        assert_eq!(names, [PRIVATE_DIRS, "dlink", "f11.txt", "frag.dat"], "catalog order");
        let sub = find(&root, "sub");
        assert!(sub.dir && sub.id == "18" && !sub.deleted);
        let hello = find(&root, "hello.txt");
        assert_eq!((hello.size, hello.extents.len(), hello.unit), (12, 1, 0));
        assert_eq!((hello.created.as_str(), hello.modified.as_str()), ("2024-05-31 11:33:20", "2024-05-31 12:33:20"));
        assert_eq!(find(&root, "hello.txt/..namedfork/rsrc").id, "16:rsrc");

        let s = list(&v, Some("18"), true).unwrap();
        assert_eq!((s.path.as_str(), s.parent.as_deref()), ("/sub", Some("2")));
        assert_eq!(s.entries.len(), 1);
        assert_eq!((s.entries[0].name.as_str(), s.entries[0].id.as_str()), ("b\u{e9}.bin", "19"));

        assert_eq!(read_id(&img, "16"), b"Hello, HFS+!");
        assert_eq!(read_id(&img, "16:rsrc"), b"RSRC!");
        assert_eq!(read_id(&img, "19"), sub_data());
        let frag = file(&v, "17").unwrap();
        assert_eq!(frag.extents.len(), 9, "8 record extents + 1 from the overflow file");
        assert_eq!(frag.extents[8].1, 512, "whole blocks; read cuts at the size");
        assert_eq!(read_id(&img, "17"), frag_data());
        assert!(file(&v, "18").unwrap().dir);
        assert_eq!(file(&v, "2").unwrap().name, "MyVol");

        assert!(list(&v, Some("16"), true).is_err(), "a file is not a folder");
        assert!(list(&v, Some("999"), true).is_err());
        assert!(file(&v, "999").is_err());
        assert!(file(&v, "17:rsrc").is_err(), "no resource fork");
    }

    #[test]
    fn hfs_compressed() {
        let img = Builder::image();
        let v = vol(&img);
        let root = list(&v, None, true).unwrap();
        for (name, size, rsrc) in [("z3.txt", 260, false), ("s3.txt", 11, false), ("z4.bin", 70_000, true), ("v7.txt", 69, false), ("v8.bin", 65_557, true), ("f11.txt", 5600, false), ("lz.bin", 65_836, true)] {
            let e = find(&root, name);
            assert_eq!(e.size, size, "{name}: the uncompressed size");
            assert!(e.unit > 0, "{name}: marked compressed");
            assert!(e.resident.is_none(), "{name}: not decoded in a listing");
            assert_eq!(!e.extents.is_empty(), rsrc, "{name}: extents = the resource fork");
        }
        assert_eq!(read_id(&img, "20"), z3_data());
        assert_eq!(read_id(&img, "32"), b"stored text");
        assert_eq!(read_id(&img, "21"), z4_data());
        assert_eq!(read_id(&img, "22"), LZVN_TEXT);
        assert_eq!(read_id(&img, "23"), v8_data());
        assert_eq!(read_id(&img, "21:rsrc"), rsrc_zlib(&z4_data()), "the raw resource fork stays readable");
        assert!(lzfse_enc(&f11_data()).starts_with(b"bvx2"), "the inline attribute holds an FSE block");
        assert_eq!(read_id(&img, "33"), f11_data());
        assert_eq!(read_id(&img, "24"), lz_data());
        assert_eq!(read_id(&img, "24:rsrc"), rsrc_lzfse());
    }

    #[test]
    fn hfs_lzfse_codec() {
        let d = words(20_000, 3);
        let enc = lzfse_enc(&d);
        assert_eq!(lzfse(&enc, d.len()).unwrap(), d);
        assert!(lzfse(&enc, d.len() - 1).is_err(), "declared raw size over the cap");
        assert!(lzfse(&enc[..enc.len() - 4], d.len()).is_err(), "no end of stream");
        assert!(lzfse(b"junk", 100).is_err());
        let mut seed = 99u32;
        for _ in 0..300 {
            let mut c = enc.clone();
            for _ in 0..3 {
                seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12345);
                let at = (seed >> 8) as usize % c.len();
                c[at] ^= (seed >> 3) as u8 | 1;
            }
            let _ = lzfse(&c, d.len());
        }
    }

    /// LZVN cross-check: `lzfse_rust` encodes inputs of 21..4096 bytes as one LZVN block ("bvxn": raw size, payload size,
    /// payload); our decoder must give the input back.
    #[test]
    fn hfs_lzvn_matches_reference_encoder() {
        let mut checked = 0;
        for n in (21..4096).step_by(97) {
            for (k, input) in [words(n, n as u32), (0..n).map(|i| (i * i % 7 + i / 300) as u8).collect(), b"abcd".repeat(n / 4 + 1)[..n].to_vec()].into_iter().enumerate() {
                let enc = lzfse_enc(&input);
                if &enc[..4] != b"bvxn" {
                    continue;
                }
                let (raw, payload) = (u32le(&enc, 4) as usize, u32le(&enc, 8) as usize);
                assert_eq!(raw, n);
                assert_eq!(lzvn(&enc[12..12 + payload], n).unwrap(), input, "n = {n}, input {k}");
                checked += 1;
            }
        }
        assert!(checked > 100, "only {checked} LZVN blocks");
    }

    #[test]
    fn hfs_lzvn_codec() {
        assert_eq!(lzvn(&lzvn_stream(), 1000).unwrap(), LZVN_TEXT);
        assert!(lzvn(&lzvn_stream(), 50).is_err(), "over the cap");
        assert!(lzvn(&lzvn_stream()[..30], 1000).is_err(), "truncated");
        assert!(lzvn(&[0xF3, 0x06], 100).is_err(), "a match before any distance");
        assert!(lzvn(&[0x70], 100).is_err(), "undefined opcode");
        assert_eq!(lzvn(&lzvn_ab(), CHUNK).unwrap().len(), CHUNK);
    }

    #[test]
    fn hfs_hard_links() {
        let img = Builder::image();
        let v = vol(&img);
        let root = list(&v, None, true).unwrap();
        let l = find(&root, "link.txt");
        assert_eq!((l.id.as_str(), l.size, l.dir), ("25", 12, false));
        assert_eq!(read_id(&img, "25"), b"linked data!");
        let d = find(&root, "dlink");
        assert!(d.dir && d.id == "28");
        let dl = list(&v, Some("28"), true).unwrap();
        assert_eq!((dl.dir.as_str(), dl.path.as_str(), dl.parent.as_deref()), ("28", "/dlink", Some("2")));
        assert_eq!(dl.entries.len(), 1);
        assert_eq!(dl.entries[0].name, "inner.txt");
        assert_eq!(read_id(&img, &dl.entries[0].id), b"inner");
        assert!(file(&v, "28").unwrap().dir);
    }

    /// Through the mod.rs API (needs the WIRING above).
    #[test]
    fn hfs_api() {
        use serde_json::json;
        let img = Builder::image();
        let i = super::super::info(&img, &json!({})).unwrap();
        assert_eq!((i["fs"].as_str(), i["label"].as_str()), (Some("hfsplus"), Some("MyVol")));
        let l = super::super::list(&img, &json!({ "dir": "18" })).unwrap();
        assert_eq!((l["path"].as_str(), l["parent"].as_str()), (Some("/sub"), Some("2")));
        let r = super::super::read(&img, &json!({ "id": "16:rsrc" })).unwrap();
        assert_eq!(crate::util::unb64(r["data"].as_str().unwrap()).unwrap(), b"RSRC!");
        let r = super::super::read(&img, &json!({ "id": "21" })).unwrap();
        assert_eq!(crate::util::unb64(r["data"].as_str().unwrap()).unwrap(), z4_data());
        let r = super::super::read(&img, &json!({ "id": "24" })).unwrap();
        assert_eq!(crate::util::unb64(r["data"].as_str().unwrap()).unwrap(), lz_data());
        let p = super::super::partitions(&img, &json!({})).unwrap();
        assert_eq!(p["partitions"][0]["fs"], "hfsplus");
        assert_eq!(p["partitions"][0]["label"], "MyVol");
    }

    #[test]
    fn hfs_wrapper_and_hfsx() {
        let inner = Builder::image();
        let mut img = vec![0u8; 4096];
        img[1024..1026].copy_from_slice(b"BD");
        p32(&mut img, 1024 + 20, 512);
        p16(&mut img, 1024 + 28, 8);
        p16(&mut img, 1024 + 124, 0x482B);
        p16(&mut img, 1024 + 126, 0);
        p16(&mut img, 1024 + 128, (inner.len() / 512) as u16);
        img.extend_from_slice(&inner);
        let v = vol(&img);
        assert_eq!(detect(&v), Some(false));
        assert_eq!(info(&v).unwrap().label, "MyVol");
        assert_eq!(read_id(&img, "17"), frag_data());
        assert_eq!(read_id(&img, "23"), v8_data());
        assert_eq!(file(&v, "16").unwrap().extents[0].0, 4096 + 18 * 512);

        let mut x = inner.clone();
        x[1024..1026].copy_from_slice(b"HX");
        assert_eq!(detect(&vol(&x)), Some(true));
        assert_eq!(list(&vol(&x), Some("18"), true).unwrap().entries.len(), 1);
        assert_eq!(read_id(&x, "25"), b"linked data!", "lookups fall back to a scan when the name order differs");
    }

    #[test]
    fn hfs_garbage_does_not_panic() {
        let base = Builder::image();
        let total = be32(&base, cat_block(0) * BS + 14 + 22) as usize;
        let ops = |c: &Vec<u8>| {
            let v = vol(c);
            let _ = info(&v);
            let _ = list(&v, None, true);
            let _ = list(&v, Some("18"), true);
            let _ = list(&v, Some("28"), true);
            for id in ["16", "17", "19", "16:rsrc", "20", "21", "22", "23", "24", "25", "32", "33"] {
                if let Some(e) = file(&v, id).ok().filter(|e| e.size < 1 << 20) {
                    let _ = assemble(v.src, &e);
                }
            }
        };
        // Leaf cycle: every leaf points back to the first one; the index points at itself.
        let mut c = base.clone();
        for n in 2..total {
            p32(&mut c, cat_block(n) * BS, 2);
        }
        ops(&c);
        let mut c = base.clone();
        let first_ptr = cat_block(1) * BS + 14 + 2 + be16(&base, cat_block(1) * BS + 14) as usize;
        p32(&mut c, first_ptr, 1);
        ops(&c);
        let mut seed = 0x1234_5678u32;
        let mut rnd = || {
            seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12345);
            seed >> 8
        };
        for round in 0..1500 {
            let mut c = base.clone();
            for _ in 0..1 + round % 8 {
                let at = (rnd() as usize % c.len()).max(1024);
                c[at] = rnd() as u8;
            }
            ops(&c);
        }
        for n in 0..100u32 {
            let mut c: Vec<u8> = (0..16384u32).map(|i| (i.wrapping_mul(2_654_435_761).wrapping_add(n * 77) >> 13) as u8).collect();
            c[1024..1026].copy_from_slice(b"H+");
            p32(&mut c, 1024 + 40, 512);
            ops(&c);
        }
        for n in 0..300u32 {
            let s: Vec<u8> = (0..64u32).map(|i| (i.wrapping_mul(2_654_435_761).wrapping_add(n * 7919) >> 11) as u8).collect();
            let _ = lzvn(&s, 1 << 16);
        }
        assert_eq!(detect(&vol(&vec![0u8; 100])), None);
    }
}
