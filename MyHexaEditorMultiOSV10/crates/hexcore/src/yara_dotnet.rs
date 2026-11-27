//! The `dotnet` module of the YARA engine (src/yara.rs): the CLI header of a PE file and its metadata (version,
//! streams, #GUID, #US, and the Module / Assembly / AssemblyRef / ModuleRef / ManifestResource / CustomAttribute
//! tables of #~, laid out with the ECMA-335 schema of tables 0x00-0x2C). Bounds-checked; metadata read up to 32 MiB;
//! lists capped at 65536 (streams at 16, GUIDs at 1024).
use super::pe_module::Pe;
use super::Val;
use crate::doc::Bytes;

pub struct Version {
    pub major: u16,
    pub minor: u16,
    pub build: u16,
    pub revision: u16,
}

pub struct Assembly {
    pub name: Vec<u8>,
    pub culture: Vec<u8>,
    pub version: Version,
}

pub struct Resource {
    pub offset: Option<u64>,
    pub length: Option<u32>,
    pub name: Vec<u8>,
}

pub struct Dotnet {
    pub version: Vec<u8>,
    pub module_name: Option<Vec<u8>>,
    /// name, file offset, size
    pub streams: Vec<(Vec<u8>, u64, u32)>,
    pub guids: Vec<Vec<u8>>,
    pub user_strings: Vec<Vec<u8>>,
    pub resources: Vec<Resource>,
    pub assembly: Option<Assembly>,
    pub assembly_refs: Vec<Assembly>,
    pub modulerefs: Vec<Vec<u8>>,
    pub typelib: Option<Vec<u8>>,
}

fn le16(b: &[u8], o: usize) -> Option<u16> {
    Some(u16::from_le_bytes([*b.get(o)?, *b.get(o + 1)?]))
}
fn le32(b: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?))
}

fn cstr(b: &[u8], at: usize, max: usize) -> Vec<u8> {
    let s = b.get(at..).unwrap_or(&[]);
    let s = &s[..s.len().min(max)];
    s[..s.iter().position(|&c| c == 0).unwrap_or(s.len())].to_vec()
}

/// A compressed length (ECMA-335 II.23.2): (value, its size).
fn compressed(b: &[u8], at: usize) -> Option<(usize, usize)> {
    let b0 = *b.get(at)? as usize;
    if b0 & 0x80 == 0 {
        Some((b0, 1))
    } else if b0 & 0xC0 == 0x80 {
        Some(((b0 & 0x3F) << 8 | *b.get(at + 1)? as usize, 2))
    } else if b0 & 0xE0 == 0xC0 {
        Some(((b0 & 0x1F) << 24 | (*b.get(at + 1)? as usize) << 16 | (*b.get(at + 2)? as usize) << 8 | *b.get(at + 3)? as usize, 4))
    } else {
        None
    }
}

fn blob(heap: &[u8], at: usize) -> Option<&[u8]> {
    let (len, h) = compressed(heap, at)?;
    heap.get(at + h..at + h + len)
}

pub fn guid(g: &[u8]) -> Vec<u8> {
    let d1 = u32::from_le_bytes([g[0], g[1], g[2], g[3]]);
    let (d2, d3) = (u16::from_le_bytes([g[4], g[5]]), u16::from_le_bytes([g[6], g[7]]));
    let tail: String = g[10..16].iter().map(|x| format!("{x:02x}")).collect();
    format!("{d1:08x}-{d2:04x}-{d3:04x}-{:02x}{:02x}-{tail}", g[8], g[9]).into_bytes()
}

#[derive(Clone, Copy)]
enum C {
    /// fixed size
    F(u8),
    /// #Strings, #GUID, #Blob index
    S,
    G,
    B,
    /// index into a table
    T(u8),
    /// coded index (CODED)
    X(u8),
}
use C::*;

/// Coded indexes: tag bits and tables.
const CODED: [(u32, &[u8]); 13] = [
    (2, &[0x02, 0x01, 0x1B]),
    (2, &[0x04, 0x08, 0x17]),
    (5, &[0x06, 0x04, 0x01, 0x02, 0x08, 0x09, 0x0A, 0x00, 0x0E, 0x17, 0x14, 0x11, 0x1A, 0x1B, 0x20, 0x23, 0x26, 0x27, 0x28, 0x2A, 0x2C, 0x2B]),
    (1, &[0x04, 0x08]),
    (2, &[0x02, 0x06, 0x20]),
    (3, &[0x02, 0x01, 0x1A, 0x06, 0x1B]),
    (1, &[0x14, 0x17]),
    (1, &[0x06, 0x0A]),
    (1, &[0x04, 0x06]),
    (2, &[0x26, 0x23, 0x27]),
    (3, &[0x06, 0x0A]),
    (2, &[0x00, 0x1A, 0x23, 0x01]),
    (1, &[0x02, 0x06]),
];

/// The columns of tables 0x00-0x2C.
const SCHEMA: [&[C]; 0x2D] = [
    &[F(2), S, G, G, G],
    &[X(11), S, S],
    &[F(4), S, S, X(0), T(0x04), T(0x06)],
    &[T(0x04)],
    &[F(2), S, B],
    &[T(0x06)],
    &[F(4), F(2), F(2), S, B, T(0x08)],
    &[T(0x08)],
    &[F(2), F(2), S],
    &[T(0x02), X(0)],
    &[X(5), S, B],
    &[F(2), X(1), B],
    &[X(2), X(10), B],
    &[X(3), B],
    &[F(2), X(4), B],
    &[F(2), F(4), T(0x02)],
    &[F(4), T(0x04)],
    &[B],
    &[T(0x02), T(0x14)],
    &[T(0x14)],
    &[F(2), S, X(0)],
    &[T(0x02), T(0x17)],
    &[T(0x17)],
    &[F(2), S, B],
    &[F(2), T(0x06), X(6)],
    &[T(0x02), X(7), X(7)],
    &[S],
    &[B],
    &[F(2), X(8), S, T(0x1A)],
    &[F(4), T(0x04)],
    &[F(4), F(4)],
    &[F(4)],
    &[F(4), F(2), F(2), F(2), F(2), F(4), B, S, S],
    &[F(4)],
    &[F(4), F(4), F(4)],
    &[F(2), F(2), F(2), F(2), F(4), B, S, S, B],
    &[F(4), T(0x23)],
    &[F(4), F(4), F(4), T(0x23)],
    &[F(4), S, B],
    &[F(4), F(4), S, S, X(9)],
    &[F(4), F(4), S, X(9)],
    &[T(0x02), T(0x02)],
    &[F(2), F(2), X(12), S],
    &[X(7), B],
    &[T(0x2A), X(0)],
];

/// The #~ stream laid out: where each table starts, its row size and the column offsets / sizes.
struct Tables<'a> {
    data: &'a [u8],
    rows: [u32; 64],
    start: [usize; 0x2D],
    sizes: [Vec<usize>; 0x2D],
}

impl<'a> Tables<'a> {
    fn new(t: &'a [u8]) -> Option<Tables<'a>> {
        let heap = *t.get(6)?;
        let valid = u64::from_le_bytes(t.get(8..16)?.try_into().ok()?);
        let mut rows = [0u32; 64];
        let mut at = 24;
        for (i, r) in rows.iter_mut().enumerate() {
            if valid >> i & 1 == 1 {
                *r = le32(t, at)?;
                at += 4;
            }
        }
        let index = |n: u32| if n < 0x10000 { 2 } else { 4 };
        let heap_size = |bit: u8| if heap >> bit & 1 == 1 { 4 } else { 2 };
        let col = |c: C| -> usize {
            match c {
                F(n) => n as usize,
                S => heap_size(0),
                G => heap_size(1),
                B => heap_size(2),
                T(t) => index(rows[t as usize]),
                X(k) => {
                    let (bits, tables) = CODED[k as usize];
                    let max = tables.iter().map(|&t| rows[t as usize]).max().unwrap_or(0);
                    if max < 1 << (16 - bits) { 2 } else { 4 }
                }
            }
        };
        let mut start = [usize::MAX; 0x2D];
        let sizes: [Vec<usize>; 0x2D] = std::array::from_fn(|i| SCHEMA[i].iter().map(|&c| col(c)).collect());
        for i in 0..0x2D {
            start[i] = at;
            let row: usize = sizes[i].iter().sum();
            at = at.checked_add(row.checked_mul(rows[i] as usize)?)?;
        }
        Some(Tables { data: t, rows, start, sizes })
    }
    /// Column `col` of row `row` (0-based) of table `t`.
    fn cell(&self, t: usize, row: usize, col: usize) -> Option<u32> {
        if row >= self.rows[t] as usize {
            return None;
        }
        let row_size: usize = self.sizes[t].iter().sum();
        let at = self.start[t].checked_add(row.checked_mul(row_size)?)? + self.sizes[t][..col].iter().sum::<usize>();
        match self.sizes[t][col] {
            1 => self.data.get(at).map(|&b| b as u32),
            2 => le16(self.data, at).map(u32::from),
            _ => le32(self.data, at),
        }
    }
    fn count(&self, t: usize) -> usize {
        (self.rows[t] as usize).min(65536)
    }
}

pub fn parse(src: &dyn Bytes, pe: &Pe) -> Option<Dotnet> {
    let (rva, _) = pe.clr?;
    let cli = super::read_at(src, pe.rva_to_offset(rva)?, 72)?;
    let (md_rva, md_size, res_rva) = (le32(&cli, 8)?, le32(&cli, 12)?, le32(&cli, 24)?);
    let md_off = pe.rva_to_offset(md_rva)?;
    let md = super::read_at(src, md_off, (md_size as u64).min(32 << 20).min(src.len() - md_off))?;
    if le32(&md, 0)? != 0x424A_5342 {
        return None;
    }
    let vlen = le32(&md, 12)? as usize;
    let version = cstr(&md, 16, vlen.min(256));
    let mut pos = 16usize.checked_add(vlen)?;
    let nstreams = le16(&md, pos + 2)?;
    pos += 4;
    let mut d = Dotnet {
        version,
        module_name: None,
        streams: Vec::new(),
        guids: Vec::new(),
        user_strings: Vec::new(),
        resources: Vec::new(),
        assembly: None,
        assembly_refs: Vec::new(),
        modulerefs: Vec::new(),
        typelib: None,
    };
    let mut heaps: Vec<(Vec<u8>, &[u8])> = Vec::new();
    for _ in 0..nstreams.min(16) {
        let (Some(off), Some(size)) = (le32(&md, pos), le32(&md, pos + 4)) else { break };
        let name = cstr(&md, pos + 8, 32);
        pos += 8 + (name.len() + 4) / 4 * 4;
        let data = md.get(off as usize..(off as usize).saturating_add(size as usize).min(md.len())).unwrap_or(&[]);
        heaps.push((name.clone(), data));
        d.streams.push((name, md_off + off as u64, size));
    }
    let heap = |n: &[u8]| heaps.iter().find(|h| h.0 == n).map(|h| h.1).unwrap_or(&[]);
    let (strings, blobs, guids, us) = (heap(b"#Strings"), heap(b"#Blob"), heap(b"#GUID"), heap(b"#US"));
    d.guids = guids.chunks_exact(16).take(1024).map(guid).collect();
    let mut at = 1;
    while at < us.len() && d.user_strings.len() < 65536 {
        let Some((len, h)) = compressed(us, at) else { break };
        if len > 1 {
            if let Some(s) = us.get(at + h..at + h + len - 1) {
                d.user_strings.push(s.to_vec());
            }
        }
        at += h + len.max(1);
    }
    let tables = heap(b"#~");
    let tables = if tables.is_empty() { heap(b"#-") } else { tables };
    let Some(t) = Tables::new(tables) else { return Some(d) };
    let s = |i: Option<u32>| i.map(|i| cstr(strings, i as usize, 1024));
    d.module_name = s(t.cell(0x00, 0, 1));
    let version = |table: usize, row: usize, first: usize| Version {
        major: t.cell(table, row, first).unwrap_or(0) as u16,
        minor: t.cell(table, row, first + 1).unwrap_or(0) as u16,
        build: t.cell(table, row, first + 2).unwrap_or(0) as u16,
        revision: t.cell(table, row, first + 3).unwrap_or(0) as u16,
    };
    if t.rows[0x20] > 0 {
        d.assembly = Some(Assembly { version: version(0x20, 0, 1), name: s(t.cell(0x20, 0, 7)).unwrap_or_default(), culture: s(t.cell(0x20, 0, 8)).unwrap_or_default() });
    }
    for r in 0..t.count(0x23) {
        d.assembly_refs.push(Assembly { version: version(0x23, r, 0), name: s(t.cell(0x23, r, 6)).unwrap_or_default(), culture: s(t.cell(0x23, r, 7)).unwrap_or_default() });
    }
    for r in 0..t.count(0x1A) {
        d.modulerefs.extend(s(t.cell(0x1A, r, 0)));
    }
    let res_base = pe.rva_to_offset(res_rva).filter(|_| res_rva != 0);
    for r in 0..t.count(0x28) {
        if t.cell(0x28, r, 3) != Some(0) {
            continue;
        }
        let at = res_base.and_then(|b| b.checked_add(t.cell(0x28, r, 0)? as u64));
        let length = at.and_then(|a| super::read_at(src, a, 4)).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]));
        d.resources.push(Resource { offset: at.map(|a| a + 4).filter(|_| length.is_some()), length, name: s(t.cell(0x28, r, 2)).unwrap_or_default() });
    }
    // typelib: the GuidAttribute custom attribute (its type a MemberRef whose class is the TypeRef "GuidAttribute")
    for r in 0..t.count(0x0C) {
        let Some(ty) = t.cell(0x0C, r, 1).filter(|v| v & 7 == 3) else { continue };
        let Some(class) = t.cell(0x0A, (ty >> 3).wrapping_sub(1) as usize, 0).filter(|v| v & 7 == 1) else { continue };
        if s(t.cell(0x01, (class >> 3).wrapping_sub(1) as usize, 1)).as_deref() != Some(b"GuidAttribute") {
            continue;
        }
        let Some(value) = t.cell(0x0C, r, 2).and_then(|v| blob(blobs, v as usize)) else { continue };
        if value.starts_with(&[1, 0]) {
            if let Some(text) = blob(value, 2) {
                d.typelib = Some(text.to_vec());
                break;
            }
        }
    }
    Some(d)
}

// ───────────── values for conditions

fn n(v: u64) -> Val {
    Val::Int(v as i64)
}

fn assembly(a: &Assembly, f: &str) -> Val {
    match f {
        "name" => Val::Str(a.name.clone()),
        "culture" => Val::Str(a.culture.clone()),
        "version.major" => n(a.version.major as u64),
        "version.minor" => n(a.version.minor as u64),
        "version.build_number" => n(a.version.build as u64),
        "version.revision_number" => n(a.version.revision as u64),
        _ => Val::Undef,
    }
}

/// `dotnet.<name>`; is_dotnet is 0 and everything else undefined when the data is not .NET.
pub fn field(d: Option<&Dotnet>, name: &str) -> Val {
    use Val::*;
    let Some(d) = d else { return if name == "is_dotnet" { Int(0) } else { Undef } };
    match name {
        "is_dotnet" => Int(1),
        "version" => Str(d.version.clone()),
        "module_name" => d.module_name.clone().map_or(Undef, Str),
        "number_of_streams" => n(d.streams.len() as u64),
        "number_of_guids" => n(d.guids.len() as u64),
        "number_of_user_strings" => n(d.user_strings.len() as u64),
        "number_of_resources" => n(d.resources.len() as u64),
        "number_of_assembly_refs" => n(d.assembly_refs.len() as u64),
        "number_of_modulerefs" => n(d.modulerefs.len() as u64),
        "typelib" => d.typelib.clone().map_or(Undef, Str),
        _ => match name.strip_prefix("assembly.") {
            Some(f) => d.assembly.as_ref().map_or(Undef, |a| assembly(a, f)),
            None => Undef,
        },
    }
}

pub fn len(d: &Dotnet, array: &str) -> usize {
    match array {
        "streams" => d.streams.len(),
        "guids" => d.guids.len(),
        "user_strings" => d.user_strings.len(),
        "resources" => d.resources.len(),
        "assembly_refs" => d.assembly_refs.len(),
        "modulerefs" => d.modulerefs.len(),
        _ => 0,
    }
}

pub fn elem(d: &Dotnet, array: &str, i: usize, f: &str) -> Val {
    use Val::*;
    match array {
        "streams" => d.streams.get(i).map_or(Undef, |(name, off, size)| match f {
            "name" => Str(name.clone()),
            "offset" => n(*off),
            "size" => n(*size as u64),
            _ => Undef,
        }),
        "guids" => d.guids.get(i).map_or(Undef, |g| Str(g.clone())),
        "user_strings" => d.user_strings.get(i).map_or(Undef, |s| Str(s.clone())),
        "modulerefs" => d.modulerefs.get(i).map_or(Undef, |s| Str(s.clone())),
        "resources" => d.resources.get(i).map_or(Undef, |r| match f {
            "offset" => r.offset.map_or(Undef, n),
            "length" => r.length.map_or(Undef, |l| n(l as u64)),
            "name" => Str(r.name.clone()),
            _ => Undef,
        }),
        "assembly_refs" => d.assembly_refs.get(i).map_or(Undef, |a| assembly(a, f)),
        _ => Undef,
    }
}

pub fn call(_d: &Dotnet, _f: &str, _a: &[Val]) -> Val {
    Val::Undef
}
