//! The `pe` module of the YARA engine (src/yara.rs): headers, sections, imports, exports, rich signature, resources,
//! version information and certificate entries of a PE file.
//! Every read is bounds-checked; malformed data gives missing values (undefined in conditions), never a panic.
//! Counts are capped (96 sections, 4096 imported DLLs, 65536 functions / exports / resource entries, names of 512
//! bytes, version information of 64 KiB, 1024 certificate entries of at most 1 MiB, 256 certificates, 64 debug entries).
use super::der::{self, Cert};
use super::{bv, Val};
use crate::doc::Bytes;

pub struct Section {
    pub name: Vec<u8>,
    pub virtual_address: u32,
    pub virtual_size: u32,
    pub raw_data_offset: u32,
    pub raw_data_size: u32,
    pub characteristics: u32,
}

pub struct Function {
    pub name: Option<Vec<u8>>,
    pub ordinal: Option<u16>,
    /// the RVA of its import address table slot
    pub rva: u32,
}

pub struct Import {
    pub dll: Vec<u8>,
    pub functions: Vec<Function>,
}

pub struct Export {
    pub name: Option<Vec<u8>>,
    pub ordinal: u32,
}

/// One resource (type / name / language levels of the resource tree). Named levels keep the raw UTF-16LE name.
pub struct Resource {
    pub type_id: Option<u32>,
    pub type_string: Option<Vec<u8>>,
    pub id: Option<u32>,
    pub name_string: Option<Vec<u8>>,
    pub language: Option<u32>,
    pub language_string: Option<Vec<u8>>,
    pub rva: u32,
    pub length: u32,
    pub offset: Option<u64>,
}

pub struct Rich {
    pub offset: u64,
    pub key: u32,
    pub raw: Vec<u8>,
    pub clear: Vec<u8>,
}

pub struct Pe {
    pub machine: u16,
    pub number_of_sections: u16,
    pub timestamp: u32,
    pub characteristics: u16,
    /// 0x10B PE32, 0x20B PE32+
    pub magic: u16,
    pub entry_point_raw: Option<u32>,
    /// the entry point as a file offset
    pub entry_point: Option<u64>,
    pub image_base: Option<u64>,
    pub subsystem: Option<u16>,
    pub size_of_image: Option<u32>,
    pub size_of_headers: Option<u32>,
    pub checksum: Option<u32>,
    pub dll_characteristics: Option<u16>,
    pub file_alignment: Option<u32>,
    pub section_alignment: Option<u32>,
    pub sections: Vec<Section>,
    pub imports: Vec<Import>,
    pub exports: Vec<Export>,
    pub number_of_exports: u32,
    pub dll_name: Option<Vec<u8>>,
    pub rich: Option<Rich>,
    pub resources: Vec<Resource>,
    pub resource_timestamp: Option<u32>,
    pub resource_version: Option<(u16, u16)>,
    pub version_info: Vec<(Vec<u8>, Vec<u8>)>,
    pub delayed: Vec<Import>,
    pub overlay: (u64, u64),
    pub pdb_path: Option<Vec<u8>>,
    /// the certificates of the PKCS#7 SignedData in the certificate table, with the number of certificates of its blob
    pub signatures: Vec<(Cert, usize)>,
    /// the CLI (.NET) header directory (RVA, size)
    pub clr: Option<(u32, u32)>,
    data_size: u64,
}

const MAX_SECTIONS: usize = 96;
const MAX_IMPORT_DLLS: usize = 4096;
const MAX_FUNCTIONS: usize = 65536;
const MAX_NAME: u64 = 512;

struct Reader<'a> {
    src: &'a dyn Bytes,
}

impl Reader<'_> {
    fn bytes(&self, off: u64, n: usize) -> Option<Vec<u8>> {
        let end = off.checked_add(n as u64)?;
        if end > self.src.len() {
            return None;
        }
        let mut b = vec![0u8; n];
        self.src.read(off, &mut b).ok()?;
        Some(b)
    }
    fn u16(&self, off: u64) -> Option<u16> {
        self.bytes(off, 2).map(|b| u16::from_le_bytes([b[0], b[1]]))
    }
    fn u32(&self, off: u64) -> Option<u32> {
        self.bytes(off, 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
    fn u64(&self, off: u64) -> Option<u64> {
        self.bytes(off, 8).map(|b| u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
    }
    /// A NUL-terminated name (None without a terminator within 512 bytes).
    fn cstr(&self, off: u64) -> Option<Vec<u8>> {
        let len = self.src.len();
        if off >= len {
            return None;
        }
        let mut b = self.bytes(off, (len - off).min(MAX_NAME) as usize)?;
        let end = b.iter().position(|&c| c == 0)?;
        b.truncate(end);
        Some(b)
    }
}

fn le16(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([b[o], b[o + 1]])
}
fn le32(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

impl Pe {
    /// A relative virtual address as a file offset, the way YARA computes it: the section with the highest address
    /// not above the RVA, its raw offset rounded down to min(FileAlignment, 0x200), only inside its raw data; RVAs
    /// below every section map to themselves.
    pub fn rva_to_offset(&self, rva: u32) -> Option<u64> {
        let rva = rva as u64;
        let align = self.file_alignment.unwrap_or(0).min(0x200) as u64;
        let (mut lowest, mut srva, mut soff, mut sraw) = (u64::MAX, 0u64, 0u64, 0u64);
        for s in &self.sections {
            let va = s.virtual_address as u64;
            lowest = lowest.min(va);
            if rva >= va && srva <= va {
                srva = va;
                soff = s.raw_data_offset as u64;
                sraw = s.raw_data_size as u64;
                if align != 0 {
                    soff -= soff % align;
                }
            }
        }
        if rva < lowest {
            (srva, soff, sraw) = (0, 0, self.data_size);
        }
        if rva - srva >= sraw {
            return None;
        }
        let off = soff + (rva - srva);
        (off < self.data_size).then_some(off)
    }
}

/// The PE structure of `src`, or None when it is not a PE file (MZ … PE\0\0).
pub fn parse(src: &dyn Bytes) -> Option<Pe> {
    let r = Reader { src };
    if r.bytes(0, 2)? != b"MZ" {
        return None;
    }
    let pe = r.u32(0x3C)? as u64;
    if r.bytes(pe, 4)? != b"PE\0\0" {
        return None;
    }
    let head = r.bytes(pe + 4, 20)?;
    let opt_size = le16(&head, 16) as u64;
    let opt = pe + 24;
    // Optional-header fields only inside its declared size.
    let o16 = |off: u64| if off + 2 <= opt_size { r.u16(opt + off) } else { None };
    let o32 = |off: u64| if off + 4 <= opt_size { r.u32(opt + off) } else { None };
    let o64 = |off: u64| if off + 8 <= opt_size { r.u64(opt + off) } else { None };
    let magic = o16(0).unwrap_or(0);
    let is64 = magic == 0x20B;
    let (nrva_at, dirs_at) = if is64 { (108, 112) } else { (92, 96) };
    let nrva = o32(nrva_at).unwrap_or(0).min(16) as u64;
    let dir = |i: u64| -> Option<(u32, u32)> {
        if i < nrva {
            Some((o32(dirs_at + 8 * i)?, o32(dirs_at + 8 * i + 4)?)).filter(|d| d.0 != 0)
        } else {
            None
        }
    };
    let number_of_sections = le16(&head, 2);
    let mut sections = Vec::new();
    for s in 0..(number_of_sections as usize).min(MAX_SECTIONS) {
        let Some(b) = r.bytes(opt + opt_size + 40 * s as u64, 40) else { break };
        let end = b[..8].iter().position(|&c| c == 0).unwrap_or(8);
        sections.push(Section {
            name: b[..end].to_vec(),
            virtual_size: le32(&b, 8),
            virtual_address: le32(&b, 12),
            raw_data_size: le32(&b, 16),
            raw_data_offset: le32(&b, 20),
            characteristics: le32(&b, 36),
        });
    }
    let mut p = Pe {
        machine: le16(&head, 0),
        number_of_sections,
        timestamp: le32(&head, 4),
        characteristics: le16(&head, 18),
        magic,
        entry_point_raw: o32(16),
        entry_point: None,
        image_base: if is64 { o64(24) } else { o32(28).map(u64::from) },
        subsystem: o16(68),
        size_of_image: o32(56),
        size_of_headers: o32(60),
        checksum: o32(64),
        dll_characteristics: o16(70),
        file_alignment: o32(36),
        section_alignment: o32(32),
        sections,
        imports: Vec::new(),
        exports: Vec::new(),
        number_of_exports: 0,
        dll_name: None,
        rich: rich(&r, pe),
        resources: Vec::new(),
        resource_timestamp: None,
        resource_version: None,
        version_info: Vec::new(),
        delayed: Vec::new(),
        overlay: (0, 0),
        pdb_path: None,
        signatures: Vec::new(),
        clr: dir(14),
        data_size: src.len(),
    };
    p.entry_point = p.entry_point_raw.and_then(|rva| p.rva_to_offset(rva));
    if let Some((rva, _)) = dir(1) {
        p.imports = imports(&r, &p, rva, is64);
    }
    if let Some((rva, _)) = dir(0) {
        exports(&r, &mut p, rva);
    }
    if let Some((rva, _)) = dir(2) {
        resources(&r, &mut p, rva);
        p.version_info = version_info(&r, &p.resources);
    }
    if let Some((rva, _)) = dir(13) {
        p.delayed = delayed_imports(&r, &p, rva, is64);
    }
    // The security directory holds a file offset, not an RVA: WIN_CERTIFICATE entries, PKCS#7 in type 2.
    if let Some((off, size)) = dir(4) {
        let end = (off as u64 + size as u64).min(src.len());
        let mut pos = off as u64;
        for _ in 0..1024 {
            if pos + 8 > end {
                break;
            }
            let (Some(length), Some(kind)) = (r.u32(pos).filter(|&l| l >= 8), r.u16(pos + 6)) else { break };
            if kind == 2 && length <= 1 << 20 {
                if let Some(blob) = r.bytes(pos + 8, (length as u64 - 8).min(end - pos - 8) as usize) {
                    let certs = der::certificates(&blob);
                    let n = certs.len();
                    p.signatures.extend(certs.into_iter().map(|c| (c, n)));
                    p.signatures.truncate(256);
                }
            }
            pos += (length as u64 + 7) & !7;
        }
    }
    // CodeView debug information: RSDS (PDB 7) or NB10 (PDB 2.0)
    if let Some((rva, size)) = dir(6) {
        if let Some(at) = p.rva_to_offset(rva) {
            for k in 0..(size as u64 / 28).min(64) {
                let Some(e) = r.bytes(at + 28 * k, 28) else { break };
                if le32(&e, 12) != 2 {
                    continue;
                }
                let data = match le32(&e, 24) {
                    0 => p.rva_to_offset(le32(&e, 20)),
                    off => Some(off as u64),
                };
                let path = data.and_then(|d| match r.bytes(d, 4).as_deref() {
                    Some(b"RSDS") => r.cstr(d + 24),
                    Some(b"NB10") => r.cstr(d + 16),
                    _ => None,
                });
                if path.is_some() {
                    p.pdb_path = path;
                    break;
                }
            }
        }
    }
    // the overlay: data after the end of the last section's raw data
    let end = p.sections.iter().filter(|s| s.raw_data_size > 0).map(|s| s.raw_data_offset as u64 + s.raw_data_size as u64).max();
    if let Some(end) = end.filter(|&e| e < src.len()) {
        p.overlay = (end, src.len() - end);
    }
    Some(p)
}

/// The functions of one import thunk table (names or ordinals), with their import address table slots.
fn thunks(r: &Reader, p: &Pe, thunk: u32, iat: u32, is64: bool, total: &mut usize) -> Vec<Function> {
    let mut functions = Vec::new();
    let Some(mut t) = p.rva_to_offset(thunk) else { return functions };
    let (width, flag) = if is64 { (8, 1u64 << 63) } else { (4, 1u64 << 31) };
    let mut slot = iat;
    while *total < MAX_FUNCTIONS {
        let v = if is64 { r.u64(t) } else { r.u32(t).map(u64::from) };
        let Some(v) = v.filter(|&v| v != 0) else { break };
        t += width;
        *total += 1;
        if v & flag != 0 {
            functions.push(Function { name: None, ordinal: Some(v as u16), rva: slot });
        } else if let Some(name) = p.rva_to_offset((v & 0x7FFF_FFFF) as u32).and_then(|o| r.cstr(o + 2)).filter(|n| !n.is_empty()) {
            functions.push(Function { name: Some(name), ordinal: None, rva: slot });
        }
        slot = slot.wrapping_add(width as u32);
    }
    functions
}

/// The delay-load descriptors (32 bytes each; without attribute bit 0 the addresses are VAs).
fn delayed_imports(r: &Reader, p: &Pe, rva: u32, is64: bool) -> Vec<Import> {
    let mut out = Vec::new();
    let Some(mut at) = p.rva_to_offset(rva) else { return out };
    let base = p.image_base.unwrap_or(0) as u32;
    let mut total = 0usize;
    for _ in 0..MAX_IMPORT_DLLS {
        let Some(d) = r.bytes(at, 32) else { break };
        if d.iter().all(|&b| b == 0) {
            break;
        }
        at += 32;
        let fix = |v: u32| if le32(&d, 0) & 1 == 0 { v.wrapping_sub(base) } else { v };
        let (name, iat, int) = (fix(le32(&d, 4)), fix(le32(&d, 12)), fix(le32(&d, 16)));
        let Some(dll) = p.rva_to_offset(name).and_then(|o| r.cstr(o)).filter(|n| !n.is_empty()) else { continue };
        out.push(Import { dll, functions: thunks(r, p, int, iat, is64, &mut total) });
    }
    out
}

/// The rich signature in the DOS stub: "DanS" … "Rich" key, every dword xor key.
fn rich(r: &Reader, pe: u64) -> Option<Rich> {
    let b = r.bytes(0, pe.min(0x10000) as usize)?;
    let mut at = 0x40;
    let rich = loop {
        if at + 8 > b.len() {
            return None;
        }
        if &b[at..at + 4] == b"Rich" {
            break at;
        }
        at += 4;
    };
    let key = le32(&b, rich + 4);
    let mut p = rich;
    while p >= 4 {
        p -= 4;
        if le32(&b, p) ^ key == 0x536E_6144 {
            let raw = b[p..rich].to_vec();
            let clear = raw.chunks(4).flat_map(|c| (le32(c, 0) ^ key).to_le_bytes()).collect();
            return Some(Rich { offset: p as u64, key, raw, clear });
        }
    }
    None
}

fn imports(r: &Reader, p: &Pe, rva: u32, is64: bool) -> Vec<Import> {
    let mut out = Vec::new();
    let Some(mut at) = p.rva_to_offset(rva) else { return out };
    let mut total = 0usize;
    for _ in 0..MAX_IMPORT_DLLS {
        let Some(d) = r.bytes(at, 20) else { break };
        if d.iter().all(|&b| b == 0) {
            break;
        }
        at += 20;
        let (oft, name_rva, ft) = (le32(&d, 0), le32(&d, 12), le32(&d, 16));
        let Some(dll) = p.rva_to_offset(name_rva).and_then(|o| r.cstr(o)).filter(|n| !n.is_empty()) else { continue };
        let functions = thunks(r, p, if oft != 0 { oft } else { ft }, ft, is64, &mut total);
        out.push(Import { dll, functions });
    }
    out
}

fn exports(r: &Reader, p: &mut Pe, rva: u32) {
    let Some(d) = p.rva_to_offset(rva).and_then(|at| r.bytes(at, 40)) else { return };
    let (name_rva, base, count, names_count, names, ordinals) = (le32(&d, 12), le32(&d, 16), le32(&d, 20), le32(&d, 24), le32(&d, 32), le32(&d, 36));
    p.dll_name = p.rva_to_offset(name_rva).and_then(|o| r.cstr(o));
    p.number_of_exports = count;
    let mut list: Vec<Export> = (0..(count as usize).min(MAX_FUNCTIONS)).map(|i| Export { name: None, ordinal: base.wrapping_add(i as u32) }).collect();
    if let (Some(names_at), Some(ords_at)) = (p.rva_to_offset(names), p.rva_to_offset(ordinals)) {
        for j in 0..(names_count as u64).min(MAX_FUNCTIONS as u64) {
            let (Some(name), Some(index)) = (r.u32(names_at + 4 * j), r.u16(ords_at + 2 * j)) else { break };
            if let Some(e) = list.get_mut(index as usize) {
                e.name = p.rva_to_offset(name).and_then(|o| r.cstr(o));
            }
        }
    }
    p.exports = list;
}

type Level = (Option<u32>, Option<Vec<u8>>);

fn resources(r: &Reader, p: &mut Pe, rva: u32) {
    let Some(base) = p.rva_to_offset(rva) else { return };
    p.resource_timestamp = r.u32(base + 4);
    p.resource_version = r.u16(base + 8).zip(r.u16(base + 10));
    let mut out = Vec::new();
    let mut budget = MAX_FUNCTIONS;
    walk(r, p, base, base, 0, &mut Vec::new(), &mut budget, &mut out);
    p.resources = out;
}

/// One directory of the resource tree (levels 0 type, 1 name, 2 language; data entries only at level 2).
#[allow(clippy::too_many_arguments)]
fn walk(r: &Reader, p: &Pe, base: u64, dir: u64, level: usize, path: &mut Vec<Level>, budget: &mut usize, out: &mut Vec<Resource>) {
    let Some(h) = r.bytes(dir, 16) else { return };
    let n = le16(&h, 12) as u64 + le16(&h, 14) as u64;
    for i in 0..n {
        if *budget == 0 {
            return;
        }
        *budget -= 1;
        let Some(e) = r.bytes(dir + 16 + 8 * i, 8) else { return };
        let (name, data) = (le32(&e, 0), le32(&e, 4));
        let key = if name & 0x8000_0000 != 0 {
            let at = base + (name & 0x7FFF_FFFF) as u64;
            (None, r.u16(at).and_then(|chars| r.bytes(at + 2, chars as usize * 2)))
        } else {
            (Some(name), None)
        };
        path.push(key);
        if data & 0x8000_0000 != 0 {
            if level < 2 {
                walk(r, p, base, base + (data & 0x7FFF_FFFF) as u64, level + 1, path, budget, out);
            }
        } else if level == 2 {
            if let Some(d) = r.bytes(base + data as u64, 8) {
                let (drva, length) = (le32(&d, 0), le32(&d, 4));
                out.push(Resource {
                    type_id: path[0].0,
                    type_string: path[0].1.clone(),
                    id: path[1].0,
                    name_string: path[1].1.clone(),
                    language: path[2].0,
                    language_string: path[2].1.clone(),
                    rva: drva,
                    length,
                    offset: p.rva_to_offset(drva),
                });
            }
        }
        path.pop();
    }
}

struct VBlock {
    key: String,
    value: std::ops::Range<usize>,
    children: usize,
    end: usize,
}

fn align4(x: usize) -> usize {
    (x + 3) & !3
}

/// A VS_VERSIONINFO-style block at `at` (within `limit`).
fn vblock(b: &[u8], at: usize, limit: usize) -> Option<VBlock> {
    if at + 6 > limit {
        return None;
    }
    let len = le16(b, at) as usize;
    if len < 6 {
        return None;
    }
    let end = (at + len).min(limit);
    let (vlen, typ) = (le16(b, at + 2) as usize, le16(b, at + 4));
    let mut k = at + 6;
    let mut key = Vec::new();
    while k + 2 <= end {
        let c = le16(b, k);
        k += 2;
        if c == 0 {
            break;
        }
        key.push(c);
    }
    let start = align4(k).min(end);
    let value = start..(start + if typ == 1 { vlen * 2 } else { vlen }).min(end);
    Some(VBlock { key: String::from_utf16_lossy(&key), children: align4(value.end).min(end), value, end })
}

fn children(b: &[u8], parent: &VBlock) -> Vec<VBlock> {
    let mut out = Vec::new();
    let mut at = parent.children;
    while out.len() < 1024 {
        let Some(c) = vblock(b, at, parent.end) else { break };
        let next = align4(at + le16(b, at) as usize);
        out.push(c);
        at = next;
    }
    out
}

/// The strings of the first version resource (StringFileInfo → string tables → key / value), as UTF-8.
fn version_info(r: &Reader, res: &[Resource]) -> Vec<(Vec<u8>, Vec<u8>)> {
    let mut out = Vec::new();
    let Some((off, length)) = res.iter().find(|x| x.type_id == Some(16)).and_then(|x| Some((x.offset?, x.length))) else { return out };
    let n = (length as u64).min(0x10000).min(r.src.len() - off) as usize;
    let Some(b) = r.bytes(off, n) else { return out };
    let Some(root) = vblock(&b, 0, b.len()).filter(|v| v.key == "VS_VERSION_INFO") else { return out };
    for info in children(&b, &root).iter().filter(|c| c.key == "StringFileInfo") {
        for table in children(&b, info) {
            for s in children(&b, &table) {
                let words: Vec<u16> = b[s.value.clone()].chunks_exact(2).map(|w| le16(w, 0)).take_while(|&w| w != 0).collect();
                out.push((s.key.into_bytes(), String::from_utf16_lossy(&words).into_bytes()));
            }
        }
    }
    out
}

// ───────────── values for conditions

fn opt(v: Option<u64>) -> Val {
    v.map_or(Val::Undef, |v| Val::Int(v as i64))
}

/// `pe.<name>` (the path after "pe.").
pub fn field(p: Option<&Pe>, name: &str) -> Val {
    use Val::*;
    let Some(p) = p else { return if name == "is_pe" { Int(0) } else { Undef } };
    let n = |v: u64| Int(v as i64);
    let rich = |f: fn(&Rich) -> Val| p.rich.as_ref().map_or(Undef, f);
    match name {
        "is_pe" => Int(1),
        "machine" => n(p.machine as u64),
        "number_of_sections" => n(p.number_of_sections as u64),
        "timestamp" => n(p.timestamp as u64),
        "entry_point" => opt(p.entry_point),
        "entry_point_raw" => opt(p.entry_point_raw.map(u64::from)),
        "characteristics" => n(p.characteristics as u64),
        "subsystem" => opt(p.subsystem.map(u64::from)),
        "image_base" => opt(p.image_base),
        "size_of_image" => opt(p.size_of_image.map(u64::from)),
        "size_of_headers" => opt(p.size_of_headers.map(u64::from)),
        "checksum" => opt(p.checksum.map(u64::from)),
        "dll_characteristics" => opt(p.dll_characteristics.map(u64::from)),
        "file_alignment" => opt(p.file_alignment.map(u64::from)),
        "section_alignment" => opt(p.section_alignment.map(u64::from)),
        "dll_name" => p.dll_name.clone().map_or(Undef, Str),
        "number_of_imports" => n(p.imports.len() as u64),
        "number_of_imported_functions" => n(p.imports.iter().map(|d| d.functions.len() as u64).sum()),
        "number_of_exports" => n(p.number_of_exports as u64),
        "number_of_resources" => n(p.resources.len() as u64),
        "resource_timestamp" => opt(p.resource_timestamp.map(u64::from)),
        "resource_version.major" => opt(p.resource_version.map(|v| v.0 as u64)),
        "resource_version.minor" => opt(p.resource_version.map(|v| v.1 as u64)),
        "number_of_version_infos" => n(p.version_info.len() as u64),
        "number_of_signatures" => n(p.signatures.len() as u64),
        "number_of_delayed_imports" => n(p.delayed.len() as u64),
        "number_of_delayed_imported_functions" => n(p.delayed.iter().map(|d| d.functions.len() as u64).sum()),
        "overlay.offset" => n(p.overlay.0),
        "overlay.size" => n(p.overlay.1),
        "pdb_path" => p.pdb_path.clone().map_or(Undef, Str),
        "rich_signature.offset" => rich(|r| Int(r.offset as i64)),
        "rich_signature.length" => rich(|r| Int(r.raw.len() as i64)),
        "rich_signature.key" => rich(|r| Int(r.key as i64)),
        "rich_signature.raw_data" => rich(|r| Str(r.raw.clone())),
        "rich_signature.clear_data" => rich(|r| Str(r.clear.clone())),
        _ => Undef,
    }
}

fn import_list<'p>(p: &'p Pe, array: &str) -> &'p [Import] {
    if array.starts_with("delayed") { &p.delayed } else { &p.imports }
}

/// The number of elements of `pe.<array>` (`prefix`: the indexes of the parent elements of a nested array).
pub fn len(p: &Pe, array: &str, prefix: &[usize]) -> usize {
    match array {
        "sections" => p.sections.len(),
        "resources" => p.resources.len(),
        "version_info_list" => p.version_info.len(),
        "import_details" | "delayed_import_details" => import_list(p, array).len(),
        "import_details.functions" | "delayed_import_details.functions" => {
            prefix.first().and_then(|&i| import_list(p, array).get(i)).map_or(0, |d| d.functions.len())
        }
        "signatures" => p.signatures.len(),
        _ => 0,
    }
}

/// `pe.<array>[i]….<f>`
pub fn elem(p: &Pe, array: &str, idx: &[usize], f: &str) -> Val {
    use Val::*;
    let n = |v: u32| Int(v as i64);
    let s = |v: &Option<Vec<u8>>| v.clone().map_or(Undef, Str);
    let i = idx[0];
    match array {
        "import_details" | "delayed_import_details" => import_list(p, array).get(i).map_or(Undef, |d| match f {
            "library_name" => Str(d.dll.clone()),
            "number_of_functions" => Int(d.functions.len() as i64),
            _ => Undef,
        }),
        "import_details.functions" | "delayed_import_details.functions" => {
            let func = import_list(p, array).get(i).and_then(|d| d.functions.get(*idx.get(1)?));
            func.map_or(Undef, |x| match f {
                "name" => s(&x.name),
                "ordinal" => x.ordinal.map_or(Undef, |o| Int(o as i64)),
                "rva" => n(x.rva),
                _ => Undef,
            })
        }
        "signatures" => p.signatures.get(i).map_or(Undef, |(c, count)| match f {
            "issuer" => Str(c.issuer.clone().into_bytes()),
            "subject" => Str(c.subject.clone().into_bytes()),
            "serial" => Str(c.serial.clone().into_bytes()),
            "version" => Int(c.version),
            "algorithm" => Str(c.algorithm.clone().into_bytes()),
            "algorithm_oid" => Str(c.algorithm_oid.clone().into_bytes()),
            "not_before" => c.not_before.map_or(Undef, Int),
            "not_after" => c.not_after.map_or(Undef, Int),
            "thumbprint" => crate::hash::digest_bytes("sha1", &c.der).map_or(Undef, |h| Str(h.into_bytes())),
            "number_of_certificates" => Int(*count as i64),
            _ => Undef,
        }),
        "sections" => p.sections.get(i).map_or(Undef, |x| match f {
            "name" => Str(x.name.clone()),
            "virtual_address" => n(x.virtual_address),
            "virtual_size" => n(x.virtual_size),
            "raw_data_offset" => n(x.raw_data_offset),
            "raw_data_size" => n(x.raw_data_size),
            "characteristics" => n(x.characteristics),
            _ => Undef,
        }),
        "resources" => p.resources.get(i).map_or(Undef, |x| match f {
            "type" => x.type_id.map_or(Undef, n),
            "id" => x.id.map_or(Undef, n),
            "language" => x.language.map_or(Undef, n),
            "type_string" => s(&x.type_string),
            "name_string" => s(&x.name_string),
            "language_string" => s(&x.language_string),
            "rva" => n(x.rva),
            "length" => n(x.length),
            "offset" => opt(x.offset),
            _ => Undef,
        }),
        "version_info_list" => p.version_info.get(i).map_or(Undef, |(k, v)| match f {
            "key" => Str(k.clone()),
            "value" => Str(v.clone()),
            _ => Undef,
        }),
        _ => Undef,
    }
}

/// `pe.version_info[key]`
pub fn dict(p: &Pe, key: &[u8]) -> Val {
    p.version_info.iter().find(|(k, _)| k == key).map_or(Val::Undef, |(_, v)| Val::Str(v.clone()))
}

pub fn dict_entries(p: &Pe) -> &[(Vec<u8>, Vec<u8>)] {
    &p.version_info
}

/// A text (without case) or a regular expression against a name.
fn name_matches(pattern: &Val, name: &[u8]) -> bool {
    match pattern {
        Val::Str(s) => name.eq_ignore_ascii_case(s),
        Val::Re(re) => re.is_match(name),
        _ => false,
    }
}

/// imports(dll[, function | ordinal]) over some import lists.
fn imports_in(lists: &[&[Import]], a: &[Val]) -> Val {
    use Val::*;
    let [dll, rest @ ..] = a else { return Undef };
    let mut funcs = lists.iter().flat_map(|l| l.iter()).filter(|d| name_matches(dll, &d.dll)).flat_map(|d| d.functions.iter());
    let regex = matches!(dll, Re(_)) || matches!(rest, [Re(_)]);
    match rest {
        [] => Int(funcs.count() as i64),
        [Int(ord)] => bv(funcs.any(|f| f.ordinal.is_some_and(|o| o as i64 == *ord))),
        [name] => {
            let n = funcs.filter(|f| f.name.as_deref().is_some_and(|x| name_matches(name, x))).count();
            if regex { Int(n as i64) } else { bv(n > 0) }
        }
        _ => Undef,
    }
}

/// Names of functions imported by ordinal, for the imphash (the classic WinSock 1.1 ordinals of ws2_32 / wsock32 and
/// the first oleaut32 ones; others become "ordN").
pub(super) fn ordinal_name(lib: &str, ord: u16) -> Option<&'static str> {
    const WS2: &[(u16, &str)] = &[
        (1, "accept"), (2, "bind"), (3, "closesocket"), (4, "connect"), (5, "getpeername"), (6, "getsockname"), (7, "getsockopt"),
        (8, "htonl"), (9, "htons"), (10, "ioctlsocket"), (11, "inet_addr"), (12, "inet_ntoa"), (13, "listen"), (14, "ntohl"),
        (15, "ntohs"), (16, "recv"), (17, "recvfrom"), (18, "select"), (19, "send"), (20, "sendto"), (21, "setsockopt"),
        (22, "shutdown"), (23, "socket"), (51, "gethostbyaddr"), (52, "gethostbyname"), (53, "getprotobyname"),
        (54, "getprotobynumber"), (55, "getservbyname"), (56, "getservbyport"), (57, "gethostname"), (101, "WSAAsyncSelect"),
        (102, "WSAAsyncGetHostByAddr"), (103, "WSAAsyncGetHostByName"), (104, "WSAAsyncGetProtoByNumber"),
        (105, "WSAAsyncGetProtoByName"), (106, "WSAAsyncGetServByPort"), (107, "WSAAsyncGetServByName"),
        (108, "WSACancelAsyncRequest"), (109, "WSASetBlockingHook"), (110, "WSAUnhookBlockingHook"), (111, "WSAGetLastError"),
        (112, "WSASetLastError"), (113, "WSACancelBlockingCall"), (114, "WSAIsBlocking"), (115, "WSAStartup"), (116, "WSACleanup"),
        (151, "__WSAFDIsSet"), (500, "WEP"),
    ];
    const OLEAUT: &[(u16, &str)] = &[
        (2, "SysAllocString"), (3, "SysReAllocString"), (4, "SysAllocStringLen"), (5, "SysReAllocStringLen"), (6, "SysFreeString"),
        (7, "SysStringLen"), (8, "VariantInit"), (9, "VariantClear"), (10, "VariantCopy"), (11, "VariantCopyInd"), (12, "VariantChangeType"),
    ];
    let table = match lib {
        "ws2_32" | "wsock32" => WS2,
        "oleaut32" => OLEAUT,
        _ => return None,
    };
    table.iter().find(|e| e.0 == ord).map(|e| e.1)
}

/// YARA's (pefile's) imphash: MD5 of "lib.function" pairs, lower case, the .dll / .ocx / .sys extension dropped.
fn imphash(p: &Pe) -> Val {
    let mut parts = Vec::new();
    for d in &p.imports {
        let lib = String::from_utf8_lossy(&d.dll).to_ascii_lowercase();
        let lib = match lib.rsplit_once('.') {
            Some((stem, "dll" | "ocx" | "sys")) => stem.to_string(),
            _ => lib,
        };
        for f in &d.functions {
            let name = match (&f.name, f.ordinal) {
                (Some(n), _) => String::from_utf8_lossy(n).to_ascii_lowercase(),
                (None, Some(o)) => ordinal_name(&lib, o).map_or_else(|| format!("ord{o}"), str::to_ascii_lowercase),
                _ => continue,
            };
            parts.push(format!("{lib}.{name}"));
        }
    }
    crate::hash::digest_bytes("md5", parts.join(",").as_bytes()).map_or(Val::Undef, |h| Val::Str(h.into_bytes()))
}

/// `pe.<f>(args)` (arguments already checked by the compiler).
pub fn call(p: &Pe, f: &str, a: &[Val]) -> Val {
    use Val::*;
    match (f, a) {
        ("imphash", _) => imphash(p),
        ("delayed_imports", _) => imports_in(&[&p.delayed], a),
        ("imports", [Int(flag), rest @ ..]) if !rest.is_empty() => {
            let mut lists: Vec<&[Import]> = Vec::new();
            if flag & 1 != 0 {
                lists.push(&p.imports);
            }
            if flag & 2 != 0 {
                lists.push(&p.delayed);
            }
            imports_in(&lists, rest)
        }
        ("imports", _) => imports_in(&[&p.imports], a),
        ("is_dll", _) => bv(p.characteristics & 0x2000 != 0),
        ("is_32bit", _) => bv(p.magic == 0x10B),
        ("is_64bit", _) => bv(p.magic == 0x20B),
        ("rva_to_offset", [Int(rva)]) => u32::try_from(*rva).ok().and_then(|rva| p.rva_to_offset(rva)).map_or(Undef, |o| Int(o as i64)),
        ("exports", [Int(ord)]) => bv(p.exports.iter().any(|e| e.ordinal as i64 == *ord)),
        ("exports", [name]) => bv(p.exports.iter().any(|e| e.name.as_deref().is_some_and(|x| name_matches(name, x)))),
        ("section_index", [Str(name)]) => p.sections.iter().position(|s| s.name == *name).map_or(Undef, |i| Int(i as i64)),
        ("section_index", [Int(rva)]) => p
            .sections
            .iter()
            .position(|s| (s.virtual_address as i64..s.virtual_address as i64 + s.virtual_size as i64).contains(rva))
            .map_or(Undef, |i| Int(i as i64)),
        ("rich_signature.version", [Int(v), rest @ ..]) | ("rich_signature.toolid", [Int(v), rest @ ..]) => {
            let Some(rich) = &p.rich else { return Undef };
            let other = match rest {
                [Int(x)] => Some(*x),
                _ => None,
            };
            let (version, tool) = if f.ends_with("version") { (Some(*v), other) } else { (other, Some(*v)) };
            let entries = rich.clear.get(16..).unwrap_or(&[]).chunks_exact(8);
            Int(entries
                .filter(|e| {
                    let id = le32(e, 0);
                    version.is_none_or(|v| (id & 0xFFFF) as i64 == v) && tool.is_none_or(|t| (id >> 16) as i64 == t)
                })
                .map(|e| le32(e, 4) as i64)
                .sum())
        }
        _ => Undef,
    }
}
