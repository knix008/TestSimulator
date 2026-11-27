//! The `elf` module of the YARA engine (src/yara.rs): header, sections, segments, dynamic entries and symbol tables of
//! an ELF file (32 / 64-bit, little / big endian). Every read is bounds-checked (malformed data gives missing values,
//! never a panic); tables are capped (4096 sections / segments, 65536 dynamic entries / symbols, names of 512 bytes).
use super::Val;
use crate::doc::Bytes;

pub struct Section {
    pub name: Option<Vec<u8>>,
    pub type_: u32,
    pub flags: u64,
    pub address: u64,
    pub offset: u64,
    pub size: u64,
    pub link: u32,
}

pub struct Segment {
    pub type_: u32,
    pub flags: u32,
    pub offset: u64,
    pub virtual_address: u64,
    pub physical_address: u64,
    pub file_size: u64,
    pub memory_size: u64,
    pub alignment: u64,
}

pub struct Symbol {
    pub name: Option<Vec<u8>>,
    pub value: u64,
    pub size: u64,
    pub info: u8,
    pub other: u8,
    pub shndx: u16,
}

pub struct Elf {
    pub type_: u16,
    pub machine: u16,
    pub entry_point: Option<u64>,
    pub sh_offset: u64,
    pub sh_entry_size: u16,
    pub ph_offset: u64,
    pub ph_entry_size: u16,
    pub number_of_sections: u16,
    pub number_of_segments: u16,
    pub sections: Vec<Section>,
    pub segments: Vec<Segment>,
    pub dynamic: Vec<(u64, u64)>,
    pub symtab: Vec<Symbol>,
    pub dynsym: Vec<Symbol>,
}

const MAX_TABLE: u64 = 4096;
const MAX_ITEMS: u64 = 65536;
const MAX_NAME: u64 = 512;

struct Reader<'a> {
    src: &'a dyn Bytes,
}

impl Reader<'_> {
    fn bytes(&self, off: u64, n: u64) -> Option<Vec<u8>> {
        let end = off.checked_add(n)?;
        if end > self.src.len() {
            return None;
        }
        let mut b = vec![0u8; n as usize];
        self.src.read(off, &mut b).ok()?;
        Some(b)
    }
    fn cstr(&self, off: u64) -> Option<Vec<u8>> {
        let len = self.src.len();
        if off >= len {
            return None;
        }
        let mut b = self.bytes(off, (len - off).min(MAX_NAME))?;
        let end = b.iter().position(|&c| c == 0)?;
        b.truncate(end);
        Some(b)
    }
    /// `count` entries of `size` bytes at `off`, as many as the data holds.
    fn table(&self, off: u64, size: u64, count: u64) -> Vec<u8> {
        let len = self.src.len();
        if off >= len || size == 0 {
            return Vec::new();
        }
        let n = count.min((len - off) / size);
        self.bytes(off, n * size).unwrap_or_default()
    }
}

fn num(b: &[u8], o: usize, n: usize, le: bool) -> u64 {
    (0..n).fold(0u64, |v, k| v | (b[o + k] as u64) << (8 * if le { k } else { n - 1 - k }))
}

/// The ELF structure of `src`, or None when it is not ELF.
pub fn parse(src: &dyn Bytes) -> Option<Elf> {
    let r = Reader { src };
    let id = r.bytes(0, 16)?;
    if &id[..4] != b"\x7FELF" || !matches!(id[4], 1 | 2) || !matches!(id[5], 1 | 2) {
        return None;
    }
    let (is64, le) = (id[4] == 2, id[5] == 1);
    let h = r.bytes(0, if is64 { 64 } else { 52 })?;
    let g = |o: usize, n: usize| num(&h, o, n, le);
    let (entry, phoff, shoff, phentsize, phnum, shentsize, shnum, shstrndx) = if is64 {
        (g(24, 8), g(32, 8), g(40, 8), g(54, 2), g(56, 2), g(58, 2), g(60, 2), g(62, 2))
    } else {
        (g(24, 4), g(28, 4), g(32, 4), g(42, 2), g(44, 2), g(46, 2), g(48, 2), g(50, 2))
    };
    let mut e = Elf {
        type_: g(16, 2) as u16,
        machine: g(18, 2) as u16,
        entry_point: None,
        sh_offset: shoff,
        sh_entry_size: shentsize as u16,
        ph_offset: phoff,
        ph_entry_size: phentsize as u16,
        number_of_sections: shnum as u16,
        number_of_segments: phnum as u16,
        sections: Vec::new(),
        segments: Vec::new(),
        dynamic: Vec::new(),
        symtab: Vec::new(),
        dynsym: Vec::new(),
    };
    // section headers
    let need = if is64 { 64 } else { 40 };
    let mut name_offsets = Vec::new();
    if shoff != 0 && shentsize >= need {
        let t = r.table(shoff, shentsize, shnum.min(MAX_TABLE));
        for s in t.chunks_exact(shentsize as usize) {
            let f = |o: usize, n: usize| num(s, o, n, le);
            name_offsets.push(f(0, 4));
            e.sections.push(if is64 {
                Section { name: None, type_: f(4, 4) as u32, flags: f(8, 8), address: f(16, 8), offset: f(24, 8), size: f(32, 8), link: f(40, 4) as u32 }
            } else {
                Section { name: None, type_: f(4, 4) as u32, flags: f(8, 4), address: f(12, 4), offset: f(16, 4), size: f(20, 4), link: f(24, 4) as u32 }
            });
        }
    }
    if let Some(strtab) = e.sections.get(shstrndx as usize).map(|s| s.offset) {
        for (s, &n) in e.sections.iter_mut().zip(&name_offsets) {
            s.name = strtab.checked_add(n).and_then(|o| r.cstr(o));
        }
    }
    // program headers
    let need = if is64 { 56 } else { 32 };
    if phoff != 0 && phentsize >= need {
        let t = r.table(phoff, phentsize, phnum.min(MAX_TABLE));
        for s in t.chunks_exact(phentsize as usize) {
            let f = |o: usize, n: usize| num(s, o, n, le);
            e.segments.push(if is64 {
                Segment { type_: f(0, 4) as u32, flags: f(4, 4) as u32, offset: f(8, 8), virtual_address: f(16, 8), physical_address: f(24, 8), file_size: f(32, 8), memory_size: f(40, 8), alignment: f(48, 8) }
            } else {
                Segment { type_: f(0, 4) as u32, offset: f(4, 4), virtual_address: f(8, 4), physical_address: f(12, 4), file_size: f(16, 4), memory_size: f(20, 4), flags: f(24, 4) as u32, alignment: f(28, 4) }
            });
        }
    }
    // dynamic entries (up to and including DT_NULL)
    if let Some(d) = e.segments.iter().find(|s| s.type_ == 2) {
        let size = if is64 { 16 } else { 8 };
        let t = r.table(d.offset, size, (d.file_size / size).min(MAX_ITEMS));
        for x in t.chunks_exact(size as usize) {
            let w = size as usize / 2;
            let (tag, val) = (num(x, 0, w, le), num(x, w, w, le));
            e.dynamic.push((tag, val));
            if tag == 0 {
                break;
            }
        }
    }
    let symbols = |kind: u32| -> Vec<Symbol> {
        let Some(sec) = e.sections.iter().find(|s| s.type_ == kind) else { return Vec::new() };
        let size = if is64 { 24 } else { 16 };
        let strtab = e.sections.get(sec.link as usize).map(|s| s.offset);
        let t = r.table(sec.offset, size, (sec.size / size).min(MAX_ITEMS));
        t.chunks_exact(size as usize)
            .map(|x| {
                let f = |o: usize, n: usize| num(x, o, n, le);
                let name = strtab.and_then(|s| s.checked_add(f(0, 4))).and_then(|o| r.cstr(o));
                if is64 {
                    Symbol { name, info: x[4], other: x[5], shndx: f(6, 2) as u16, value: f(8, 8), size: f(16, 8) }
                } else {
                    Symbol { name, value: f(4, 4), size: f(8, 4), info: x[12], other: x[13], shndx: f(14, 2) as u16 }
                }
            })
            .collect()
    };
    let (symtab, dynsym) = (symbols(2), symbols(11));
    e.symtab = symtab;
    e.dynsym = dynsym;
    // the entry point as a file offset: through a loadable segment, else through a section with an address
    let len = src.len();
    let in_range = |v: u64, base: u64, size: u64| v >= base && v - base < size;
    e.entry_point = e
        .segments
        .iter()
        .find(|s| s.type_ == 1 && in_range(entry, s.virtual_address, s.file_size))
        .and_then(|s| s.offset.checked_add(entry - s.virtual_address))
        .or_else(|| {
            e.sections
                .iter()
                .find(|s| s.address != 0 && s.type_ != 8 && in_range(entry, s.address, s.size))
                .and_then(|s| s.offset.checked_add(entry - s.address))
        })
        .filter(|&o| o < len);
    Some(e)
}

// ───────────── values for conditions

fn n(v: u64) -> Val {
    Val::Int(v as i64)
}

/// `elf.<name>`; everything is undefined for data that is not ELF.
pub fn field(e: Option<&Elf>, name: &str) -> Val {
    let Some(e) = e else { return Val::Undef };
    match name {
        "type" => n(e.type_ as u64),
        "machine" => n(e.machine as u64),
        "entry_point" => e.entry_point.map_or(Val::Undef, n),
        "number_of_sections" => n(e.number_of_sections as u64),
        "number_of_segments" => n(e.number_of_segments as u64),
        "sh_offset" => n(e.sh_offset),
        "sh_entry_size" => n(e.sh_entry_size as u64),
        "ph_offset" => n(e.ph_offset),
        "ph_entry_size" => n(e.ph_entry_size as u64),
        "dynamic_section_entries" => n(e.dynamic.len() as u64),
        "symtab_entries" => n(e.symtab.len() as u64),
        "dynsym_entries" => n(e.dynsym.len() as u64),
        _ => Val::Undef,
    }
}

pub fn len(e: &Elf, array: &str) -> usize {
    match array {
        "sections" => e.sections.len(),
        "segments" => e.segments.len(),
        "dynamic" => e.dynamic.len(),
        "symtab" => e.symtab.len(),
        "dynsym" => e.dynsym.len(),
        _ => 0,
    }
}

fn symbol(s: &Symbol, f: &str) -> Val {
    match f {
        "name" => s.name.clone().map_or(Val::Undef, Val::Str),
        "value" => n(s.value),
        "size" => n(s.size),
        "type" => n((s.info & 15) as u64),
        "bind" => n((s.info >> 4) as u64),
        "shndx" => n(s.shndx as u64),
        "other" => n(s.other as u64),
        _ => Val::Undef,
    }
}

/// `elf.<array>[i].<f>`
pub fn elem(e: &Elf, array: &str, i: usize, f: &str) -> Val {
    use Val::Undef;
    match array {
        "sections" => e.sections.get(i).map_or(Undef, |s| match f {
            "name" => s.name.clone().map_or(Undef, Val::Str),
            "type" => n(s.type_ as u64),
            "flags" => n(s.flags),
            "address" => n(s.address),
            "size" => n(s.size),
            "offset" => n(s.offset),
            _ => Undef,
        }),
        "segments" => e.segments.get(i).map_or(Undef, |s| match f {
            "type" => n(s.type_ as u64),
            "flags" => n(s.flags as u64),
            "offset" => n(s.offset),
            "virtual_address" => n(s.virtual_address),
            "physical_address" => n(s.physical_address),
            "file_size" => n(s.file_size),
            "memory_size" => n(s.memory_size),
            "alignment" => n(s.alignment),
            _ => Undef,
        }),
        "dynamic" => e.dynamic.get(i).map_or(Undef, |&(t, v)| match f {
            "type" => n(t),
            "val" => n(v),
            _ => Undef,
        }),
        "symtab" => e.symtab.get(i).map_or(Undef, |s| symbol(s, f)),
        "dynsym" => e.dynsym.get(i).map_or(Undef, |s| symbol(s, f)),
        _ => Undef,
    }
}
