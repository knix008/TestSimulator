//! The `macho` module of the YARA engine (src/yara.rs): Mach-O files (32 / 64-bit, either byte order) and universal
//! (fat) binaries. Bounds-checked and capped (4096 load commands, 4096 sections, 32 architectures, names of 512
//! bytes); offsets of a fat binary's files are relative to their slice, as in YARA.
use super::{bv, Val};
use crate::doc::Bytes;

pub struct Section {
    pub sectname: Vec<u8>,
    pub segname: Vec<u8>,
    pub addr: u64,
    pub size: u64,
    pub offset: u32,
    pub align: u32,
    pub reloff: u32,
    pub nreloc: u32,
    pub flags: u32,
}

pub struct Segment {
    pub segname: Vec<u8>,
    pub vmaddr: u64,
    pub vmsize: u64,
    pub fileoff: u64,
    pub fsize: u64,
    pub maxprot: u32,
    pub initprot: u32,
    pub nsects: u32,
    pub flags: u32,
    pub sections: Vec<Section>,
}

pub struct Dylib {
    pub name: Vec<u8>,
    pub timestamp: u32,
    pub current_version: u32,
    pub compatibility_version: u32,
}

pub struct File {
    pub magic: u32,
    pub cputype: u32,
    pub cpusubtype: u32,
    pub filetype: u32,
    pub ncmds: u32,
    pub sizeofcmds: u32,
    pub flags: u32,
    pub reserved: Option<u32>,
    pub segments: Vec<Segment>,
    pub entry_point: Option<u64>,
    pub stack_size: Option<u64>,
    pub dylibs: Vec<Dylib>,
    pub rpaths: Vec<Vec<u8>>,
    pub entitlements: Vec<Vec<u8>>,
}

pub struct FatArch {
    pub cputype: u32,
    pub cpusubtype: u32,
    pub offset: u64,
    pub size: u64,
    pub align: u32,
}

pub struct MachO {
    pub fat_magic: Option<u32>,
    pub fat: Vec<FatArch>,
    pub files: Vec<Option<File>>,
    /// a plain (not fat) Mach-O file
    pub single: Option<File>,
}

/// Reads within [base, base + limit).
struct Reader<'a> {
    src: &'a dyn Bytes,
    base: u64,
    limit: u64,
    le: bool,
}

impl Reader<'_> {
    fn bytes(&self, off: u64, n: u64) -> Option<Vec<u8>> {
        if off.checked_add(n)? > self.limit {
            return None;
        }
        super::read_at(self.src, self.base.checked_add(off)?, n)
    }
    fn num(&self, off: u64, n: usize) -> Option<u64> {
        let b = self.bytes(off, n as u64)?;
        Some((0..n).fold(0u64, |v, k| v | (b[k] as u64) << (8 * if self.le { k } else { n - 1 - k })))
    }
    fn u32(&self, off: u64) -> Option<u32> {
        self.num(off, 4).map(|v| v as u32)
    }
    fn be32(&self, off: u64) -> Option<u32> {
        self.bytes(off, 4).map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    }
    fn cstr(&self, off: u64, max: u64) -> Option<Vec<u8>> {
        let n = max.min(512).min(self.limit.saturating_sub(off));
        let mut b = self.bytes(off, n)?;
        let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
        b.truncate(end);
        Some(b)
    }
}

fn name16(b: &[u8]) -> Vec<u8> {
    let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
    b[..end].to_vec()
}

pub fn parse(src: &dyn Bytes) -> Option<MachO> {
    let head = super::read_at(src, 0, 8)?;
    let be = u32::from_be_bytes([head[0], head[1], head[2], head[3]]);
    if be == 0xCAFE_BABE || be == 0xCAFE_BABF {
        let n = u32::from_be_bytes([head[4], head[5], head[6], head[7]]);
        // Java class files share the magic; their "count" is a class file version (45 and up).
        if n == 0 || n > 32 {
            return None;
        }
        let r = Reader { src, base: 0, limit: src.len(), le: false };
        let is64 = be == 0xCAFE_BABF;
        let mut m = MachO { fat_magic: Some(be), fat: Vec::new(), files: Vec::new(), single: None };
        for i in 0..n as u64 {
            let (at, size) = if is64 { (8 + 32 * i, 32) } else { (8 + 20 * i, 20) };
            let Some(b) = r.bytes(at, size) else { break };
            let g = |o: usize, n: usize| (0..n).fold(0u64, |v, k| v << 8 | b[o + k] as u64);
            let arch = if is64 {
                FatArch { cputype: g(0, 4) as u32, cpusubtype: g(4, 4) as u32, offset: g(8, 8), size: g(16, 8), align: g(24, 4) as u32 }
            } else {
                FatArch { cputype: g(0, 4) as u32, cpusubtype: g(4, 4) as u32, offset: g(8, 4), size: g(12, 4), align: g(16, 4) as u32 }
            };
            m.files.push(arch.offset.checked_add(arch.size).filter(|&e| e <= src.len()).and_then(|_| file(src, arch.offset, arch.size)));
            m.fat.push(arch);
        }
        return Some(m);
    }
    file(src, 0, src.len()).map(|f| MachO { fat_magic: None, fat: Vec::new(), files: Vec::new(), single: Some(f) })
}

/// One Mach-O file at `base` (`limit` bytes).
fn file(src: &dyn Bytes, base: u64, limit: u64) -> Option<File> {
    let magic = u32::from_le_bytes(super::read_at(src, base, 4)?.try_into().ok()?);
    let (le, is64) = match magic {
        0xFEED_FACE => (true, false),
        0xFEED_FACF => (true, true),
        0xCEFA_EDFE => (false, false),
        0xCFFA_EDFE => (false, true),
        _ => return None,
    };
    let r = Reader { src, base, limit, le };
    let h = |k: u64| r.u32(4 * k);
    let mut f = File {
        magic,
        cputype: h(1)?,
        cpusubtype: h(2)?,
        filetype: h(3)?,
        ncmds: h(4)?,
        sizeofcmds: h(5)?,
        flags: h(6)?,
        reserved: if is64 { h(7) } else { None },
        segments: Vec::new(),
        entry_point: None,
        stack_size: None,
        dylibs: Vec::new(),
        rpaths: Vec::new(),
        entitlements: Vec::new(),
    };
    let mut at = if is64 { 32u64 } else { 28 };
    let mut thread_pc = None;
    let mut total_sections = 0;
    for _ in 0..f.ncmds.min(4096) {
        let (Some(cmd), Some(size)) = (r.u32(at), r.u32(at + 4)) else { break };
        if size < 8 {
            break;
        }
        match cmd {
            0x1 | 0x19 => {
                let w = if cmd == 0x19 { 8 } else { 4 };
                let g = |o: u64| r.num(at + o, w);
                let (o, s) = if cmd == 0x19 { (24, 8) } else { (24, 4) };
                let Some(name) = r.bytes(at + 8, 16) else { break };
                let mut seg = Segment {
                    segname: name16(&name),
                    vmaddr: g(o).unwrap_or(0),
                    vmsize: g(o + s).unwrap_or(0),
                    fileoff: g(o + 2 * s).unwrap_or(0),
                    fsize: g(o + 3 * s).unwrap_or(0),
                    maxprot: r.u32(at + o + 4 * s).unwrap_or(0),
                    initprot: r.u32(at + o + 4 * s + 4).unwrap_or(0),
                    nsects: r.u32(at + o + 4 * s + 8).unwrap_or(0),
                    flags: r.u32(at + o + 4 * s + 12).unwrap_or(0),
                    sections: Vec::new(),
                };
                let (first, sect) = if cmd == 0x19 { (72u64, 80u64) } else { (56, 68) };
                for k in 0..seg.nsects.min(256) as u64 {
                    if total_sections >= 4096 {
                        break;
                    }
                    let sa = at + first + sect * k;
                    let Some(b) = r.bytes(sa, sect) else { break };
                    let g = |o: usize, n: usize| (0..n).fold(0u64, |v, j| v | (b[o + j] as u64) << (8 * if le { j } else { n - 1 - j }));
                    let (addr, size, rest) = if cmd == 0x19 { (g(32, 8), g(40, 8), 48) } else { (g(32, 4), g(36, 4), 40) };
                    seg.sections.push(Section {
                        sectname: name16(&b[..16]),
                        segname: name16(&b[16..32]),
                        addr,
                        size,
                        offset: g(rest, 4) as u32,
                        align: g(rest + 4, 4) as u32,
                        reloff: g(rest + 8, 4) as u32,
                        nreloc: g(rest + 12, 4) as u32,
                        flags: g(rest + 16, 4) as u32,
                    });
                    total_sections += 1;
                }
                f.segments.push(seg);
            }
            0x8000_0028 => {
                f.entry_point = r.num(at + 8, 8);
                f.stack_size = r.num(at + 16, 8);
            }
            0x5 => {
                let state = at + 16;
                thread_pc = match f.cputype {
                    7 => r.num(state + 40, 4),
                    0x0100_0007 => r.num(state + 128, 8),
                    12 => r.num(state + 60, 4),
                    0x0100_000C => r.num(state + 256, 8),
                    18 => r.num(state, 4),
                    0x0100_0012 => r.num(state, 8),
                    _ => None,
                };
            }
            0xC | 0xD | 0x18 | 0x20 | 0x8000_0018 | 0x8000_001F | 0x8000_0023 => {
                if let Some(name) = r.u32(at + 8).and_then(|o| r.cstr(at + o as u64, size as u64 - (o as u64).min(size as u64))) {
                    if f.dylibs.len() < 4096 && cmd != 0xD {
                        f.dylibs.push(Dylib {
                            name,
                            timestamp: r.u32(at + 12).unwrap_or(0),
                            current_version: r.u32(at + 16).unwrap_or(0),
                            compatibility_version: r.u32(at + 20).unwrap_or(0),
                        });
                    }
                }
            }
            0x8000_001C => {
                if let Some(path) = r.u32(at + 8).and_then(|o| r.cstr(at + o as u64, size as u64 - (o as u64).min(size as u64))) {
                    if f.rpaths.len() < 4096 {
                        f.rpaths.push(path);
                    }
                }
            }
            0x1D => {
                if let (Some(off), Some(len)) = (r.u32(at + 8), r.u32(at + 12)) {
                    f.entitlements = entitlements(&r, off as u64, len as u64);
                }
            }
            _ => {}
        }
        at += size as u64;
    }
    if let Some(pc) = thread_pc {
        f.entry_point = f
            .segments
            .iter()
            .find(|s| pc >= s.vmaddr && pc - s.vmaddr < s.vmsize)
            .and_then(|s| s.fileoff.checked_add(pc - s.vmaddr));
    }
    Some(f)
}

/// The keys of the entitlements plist in the code signature (a big-endian SuperBlob with a 0xFADE7171 blob).
fn entitlements(r: &Reader, off: u64, len: u64) -> Vec<Vec<u8>> {
    let mut out = Vec::new();
    if r.be32(off) != Some(0xFADE_0CC0) {
        return out;
    }
    let count = r.be32(off + 8).unwrap_or(0).min(64) as u64;
    for i in 0..count {
        let Some(blob) = r.be32(off + 12 + 8 * i + 4).map(|b| off + b as u64) else { break };
        if blob >= off + len || r.be32(blob) != Some(0xFADE_7171) {
            continue;
        }
        let size = r.be32(blob + 4).unwrap_or(0) as u64;
        let Some(xml) = r.bytes(blob + 8, size.saturating_sub(8).min(1 << 20)) else { continue };
        let mut rest = &xml[..];
        while let Some(p) = find(rest, b"<key>") {
            rest = &rest[p + 5..];
            let Some(e) = find(rest, b"</key>") else { break };
            out.push(rest[..e].to_vec());
            rest = &rest[e + 6..];
        }
    }
    out
}

fn find(h: &[u8], n: &[u8]) -> Option<usize> {
    h.windows(n.len()).position(|w| w == n)
}

// ───────────── values for conditions

fn n(v: u64) -> Val {
    Val::Int(v as i64)
}

fn version(v: u32) -> Val {
    Val::Str(format!("{}.{}.{}", v >> 16, (v >> 8) & 0xFF, v & 0xFF).into_bytes())
}

fn file_field(f: &File, name: &str) -> Val {
    match name {
        "magic" => n(f.magic as u64),
        "cputype" => n(f.cputype as u64),
        "cpusubtype" => n(f.cpusubtype as u64),
        "filetype" => n(f.filetype as u64),
        "ncmds" => n(f.ncmds as u64),
        "sizeofcmds" => n(f.sizeofcmds as u64),
        "flags" => n(f.flags as u64),
        "reserved" => f.reserved.map_or(Val::Undef, |v| n(v as u64)),
        "number_of_segments" => n(f.segments.len() as u64),
        "entry_point" => f.entry_point.map_or(Val::Undef, n),
        "stack_size" => f.stack_size.map_or(Val::Undef, n),
        _ => Val::Undef,
    }
}

/// `macho.<name>`; the fields of a single file are undefined for a fat binary (use file[i]).
pub fn field(m: Option<&MachO>, name: &str) -> Val {
    let Some(m) = m else { return Val::Undef };
    match name {
        "fat_magic" => m.fat_magic.map_or(Val::Undef, |v| n(v as u64)),
        "nfat_arch" => m.fat_magic.map_or(Val::Undef, |_| n(m.fat.len() as u64)),
        _ => m.single.as_ref().map_or(Val::Undef, |f| file_field(f, name)),
    }
}

/// The file an array path refers to: (file, path inside it, remaining indexes).
fn target<'m>(m: &'m MachO, array: &'m str, idx: &'m [usize]) -> Option<(&'m File, &'m str, &'m [usize])> {
    match array.strip_prefix("file.") {
        Some(rest) => Some((m.files.get(*idx.first()?)?.as_ref()?, rest, &idx[1..])),
        None => Some((m.single.as_ref()?, array, idx)),
    }
}

pub fn len(m: &MachO, array: &str, prefix: &[usize]) -> usize {
    match array {
        "fat_arch" => return m.fat.len(),
        "file" => return m.files.len(),
        _ => {}
    }
    let Some((f, a, idx)) = target(m, array, prefix) else { return 0 };
    match a {
        "segments" => f.segments.len(),
        "segments.sections" => idx.first().and_then(|&i| f.segments.get(i)).map_or(0, |s| s.sections.len()),
        "dylibs" => f.dylibs.len(),
        "rpaths" => f.rpaths.len(),
        "entitlements" => f.entitlements.len(),
        _ => 0,
    }
}

pub fn elem(m: &MachO, array: &str, idx: &[usize], name: &str) -> Val {
    use Val::*;
    match array {
        "fat_arch" => {
            return m.fat.get(idx[0]).map_or(Undef, |a| match name {
                "cputype" => n(a.cputype as u64),
                "cpusubtype" => n(a.cpusubtype as u64),
                "offset" => n(a.offset),
                "size" => n(a.size),
                "align" => n(a.align as u64),
                _ => Undef,
            })
        }
        "file" => return m.files.get(idx[0]).and_then(|f| f.as_ref()).map_or(Undef, |f| file_field(f, name)),
        _ => {}
    }
    let Some((f, a, idx)) = target(m, array, idx) else { return Undef };
    let at = |k: usize| idx.get(k).copied().unwrap_or(usize::MAX);
    match a {
        "segments" => f.segments.get(at(0)).map_or(Undef, |s| match name {
            "segname" => Str(s.segname.clone()),
            "vmaddr" => n(s.vmaddr),
            "vmsize" => n(s.vmsize),
            "fileoff" => n(s.fileoff),
            "fsize" | "filesize" => n(s.fsize),
            "maxprot" => n(s.maxprot as u64),
            "initprot" => n(s.initprot as u64),
            "nsects" => n(s.nsects as u64),
            "flags" => n(s.flags as u64),
            _ => Undef,
        }),
        "segments.sections" => f.segments.get(at(0)).and_then(|s| s.sections.get(at(1))).map_or(Undef, |s| match name {
            "sectname" => Str(s.sectname.clone()),
            "segname" => Str(s.segname.clone()),
            "addr" => n(s.addr),
            "size" => n(s.size),
            "offset" => n(s.offset as u64),
            "align" => n(s.align as u64),
            "reloff" => n(s.reloff as u64),
            "nreloc" => n(s.nreloc as u64),
            "flags" => n(s.flags as u64),
            _ => Undef,
        }),
        "dylibs" => f.dylibs.get(at(0)).map_or(Undef, |d| match name {
            "name" => Str(d.name.clone()),
            "timestamp" => n(d.timestamp as u64),
            "current_version" => version(d.current_version),
            "compatibility_version" => version(d.compatibility_version),
            _ => Undef,
        }),
        "rpaths" => f.rpaths.get(at(0)).map_or(Undef, |p| Str(p.clone())),
        "entitlements" => f.entitlements.get(at(0)).map_or(Undef, |e| Str(e.clone())),
        _ => Undef,
    }
}

/// The files to look at: the single file, or every file of a fat binary.
fn files(m: &MachO) -> Vec<&File> {
    m.single.iter().chain(m.files.iter().flatten()).collect()
}

pub fn call(m: &MachO, f: &str, a: &[Val]) -> Val {
    use Val::*;
    match (f, a) {
        ("has_dylib", [Str(s)]) => bv(files(m).iter().any(|x| x.dylibs.iter().any(|d| d.name == *s))),
        ("has_rpath", [Str(s)]) => bv(files(m).iter().any(|x| x.rpaths.contains(s))),
        ("has_entitlement", [Str(s)]) => bv(files(m).iter().any(|x| x.entitlements.contains(s))),
        ("file_index_for_arch", [Int(t), rest @ ..]) => {
            let sub = match rest {
                [Int(s)] => Some(*s),
                _ => None,
            };
            m.fat
                .iter()
                .position(|x| x.cputype as i64 == *t && sub.is_none_or(|s| x.cpusubtype as i64 == s))
                .map_or(Undef, |i| Int(i as i64))
        }
        ("entry_point_for_arch", [Int(t), rest @ ..]) => {
            let sub = match rest {
                [Int(s)] => Some(*s),
                _ => None,
            };
            // an absolute file offset: the slice offset plus the file's entry point
            let i = m.fat.iter().position(|x| x.cputype as i64 == *t && sub.is_none_or(|s| x.cpusubtype as i64 == s));
            match i.and_then(|i| Some((m.fat[i].offset, m.files.get(i)?.as_ref()?.entry_point?))) {
                Some((base, e)) => Int(base.wrapping_add(e) as i64),
                None => Undef,
            }
        }
        _ => Undef,
    }
}
