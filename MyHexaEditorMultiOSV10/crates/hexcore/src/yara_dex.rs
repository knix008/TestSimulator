//! The `dex` module of the YARA engine (src/yara.rs): the header and the id tables of an Android DEX file
//! (little-endian). Bounds-checked; tables capped at 65536 entries, string values at 1024 bytes.
use super::{bv, Val};
use crate::doc::Bytes;

pub struct Dex {
    pub magic: Vec<u8>,
    pub signature: Vec<u8>,
    /// header words from offset 8 (checksum) except the signature: 8, 32, 36, … 108
    header: Vec<(u64, u32)>,
    /// offset, utf16 size, value
    pub strings: Vec<(u32, u32, Vec<u8>)>,
    pub types: Vec<u32>,
    /// class_idx, type_idx / proto_idx, name_idx
    pub fields: Vec<(u16, u16, u32)>,
    pub methods: Vec<(u16, u16, u32)>,
    pub classes: Vec<[u32; 8]>,
}

const MAX: u32 = 65536;

const HEADER: &[(&str, u64)] = &[
    ("checksum", 8), ("file_size", 32), ("header_size", 36), ("endian_tag", 40), ("link_size", 44), ("link_offset", 48), ("map_offset", 52),
    ("string_ids_size", 56), ("string_ids_offset", 60), ("type_ids_size", 64), ("type_ids_offset", 68), ("proto_ids_size", 72),
    ("proto_ids_offset", 76), ("field_ids_size", 80), ("field_ids_offset", 84), ("method_ids_size", 88), ("method_ids_offset", 92),
    ("class_defs_size", 96), ("class_defs_offset", 100), ("data_size", 104), ("data_offset", 108),
];

fn le32(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

/// `count` entries of `size` bytes at `off`, as many as the data holds.
fn table(src: &dyn Bytes, off: u32, size: u64, count: u32) -> Vec<u8> {
    let (off, len) = (off as u64, src.len());
    if off == 0 || off >= len {
        return Vec::new();
    }
    let n = (count.min(MAX) as u64).min((len - off) / size);
    super::read_at(src, off, n * size).unwrap_or_default()
}

pub fn parse(src: &dyn Bytes) -> Option<Dex> {
    let h = super::read_at(src, 0, 112)?;
    if &h[..4] != b"dex\n" || h[7] != 0 || le32(&h, 40) != 0x1234_5678 {
        return None;
    }
    let word = |name: &str| HEADER.iter().find(|x| x.0 == name).map_or(0, |x| le32(&h, x.1 as usize));
    let mut d = Dex {
        magic: h[..8].to_vec(),
        signature: h[12..32].to_vec(),
        header: HEADER.iter().map(|&(_, o)| (o, le32(&h, o as usize))).collect(),
        strings: Vec::new(),
        types: Vec::new(),
        fields: Vec::new(),
        methods: Vec::new(),
        classes: Vec::new(),
    };
    let len = src.len();
    for c in table(src, word("string_ids_offset"), 4, word("string_ids_size")).chunks_exact(4) {
        let off = le32(c, 0);
        let data = if (off as u64) < len { super::read_at(src, off as u64, (len - off as u64).min(1029)).unwrap_or_default() } else { Vec::new() };
        // uleb128 utf16 size, then MUTF-8 up to NUL
        let (mut size, mut k) = (0u32, 0usize);
        while k < data.len().min(5) {
            size |= ((data[k] & 0x7F) as u32) << (7 * k);
            k += 1;
            if data[k - 1] & 0x80 == 0 {
                break;
            }
        }
        let rest = &data[k.min(data.len())..];
        let value = rest[..rest.iter().position(|&b| b == 0).unwrap_or(rest.len()).min(1024)].to_vec();
        d.strings.push((off, size, value));
    }
    d.types = table(src, word("type_ids_offset"), 4, word("type_ids_size")).chunks_exact(4).map(|c| le32(c, 0)).collect();
    let ids = |off: &str, count: &str| -> Vec<(u16, u16, u32)> {
        table(src, word(off), 8, word(count)).chunks_exact(8).map(|c| (u16::from_le_bytes([c[0], c[1]]), u16::from_le_bytes([c[2], c[3]]), le32(c, 4))).collect()
    };
    d.fields = ids("field_ids_offset", "field_ids_size");
    d.methods = ids("method_ids_offset", "method_ids_size");
    d.classes = table(src, word("class_defs_offset"), 32, word("class_defs_size"))
        .chunks_exact(32)
        .map(|c| std::array::from_fn(|k| le32(c, 4 * k)))
        .collect();
    Some(d)
}

impl Dex {
    fn string(&self, i: u32) -> Option<&[u8]> {
        self.strings.get(i as usize).map(|s| s.2.as_slice())
    }
    fn type_name(&self, i: u32) -> Option<&[u8]> {
        self.types.get(i as usize).and_then(|&s| self.string(s))
    }
}

// ───────────── values for conditions

fn n(v: u64) -> Val {
    Val::Int(v as i64)
}

/// `dex.<name>` (header.* and the counts); undefined when the data is not DEX.
pub fn field(d: Option<&Dex>, name: &str) -> Val {
    use Val::*;
    let Some(d) = d else { return Undef };
    match name {
        "header.magic" => Str(d.magic.clone()),
        "header.signature" => Str(d.signature.clone()),
        "number_of_strings" => n(d.strings.len() as u64),
        "number_of_types" => n(d.types.len() as u64),
        "number_of_fields" => n(d.fields.len() as u64),
        "number_of_methods" => n(d.methods.len() as u64),
        "number_of_classes" => n(d.classes.len() as u64),
        _ => match name.strip_prefix("header.").and_then(|f| HEADER.iter().position(|x| x.0 == f)) {
            Some(i) => n(d.header[i].1 as u64),
            None => Undef,
        },
    }
}

pub fn len(d: &Dex, array: &str) -> usize {
    match array {
        "string_ids" => d.strings.len(),
        "type_ids" => d.types.len(),
        "field_ids" => d.fields.len(),
        "method_ids" | "methods" => d.methods.len(),
        "class_defs" => d.classes.len(),
        _ => 0,
    }
}

pub fn elem(d: &Dex, array: &str, i: usize, f: &str) -> Val {
    use Val::*;
    let s = |v: Option<&[u8]>| v.map_or(Undef, |v| Str(v.to_vec()));
    match array {
        "string_ids" => d.strings.get(i).map_or(Undef, |(off, size, value)| match f {
            "offset" => n(*off as u64),
            "size" => n(*size as u64),
            "value" => Str(value.clone()),
            _ => Undef,
        }),
        "type_ids" => d.types.get(i).map_or(Undef, |&t| if f == "descriptor_idx" { n(t as u64) } else { Undef }),
        "field_ids" | "method_ids" => {
            let list = if array == "field_ids" { &d.fields } else { &d.methods };
            list.get(i).map_or(Undef, |&(c, t, name)| match f {
                "class_idx" => n(c as u64),
                "type_idx" | "proto_idx" => n(t as u64),
                "name_idx" => n(name as u64),
                _ => Undef,
            })
        }
        "methods" => d.methods.get(i).map_or(Undef, |&(c, _, name)| match f {
            "name" => s(d.string(name)),
            "class_name" => s(d.type_name(c as u32)),
            _ => Undef,
        }),
        "class_defs" => {
            const NAMES: [&str; 8] = ["class_idx", "access_flags", "super_class_idx", "interfaces_offset", "source_file_idx", "annotations_offset", "class_data_offset", "static_values_offset"];
            match (d.classes.get(i), NAMES.iter().position(|x| *x == f)) {
                (Some(c), Some(k)) => n(c[k] as u64),
                _ => Undef,
            }
        }
        _ => Undef,
    }
}

/// has_method(name) / has_method(class, name), has_class(descriptor).
pub fn call(d: &Dex, f: &str, a: &[Val]) -> Val {
    use Val::*;
    match (f, a) {
        ("has_method", [Str(name)]) => bv(d.methods.iter().any(|m| d.string(m.2) == Some(name.as_slice()))),
        ("has_method", [Str(class), Str(name)]) => {
            bv(d.methods.iter().any(|m| d.string(m.2) == Some(name.as_slice()) && d.type_name(m.0 as u32) == Some(class.as_slice())))
        }
        ("has_class", [Str(class)]) => bv(d.classes.iter().any(|c| d.type_name(c[0]) == Some(class.as_slice()))),
        _ => Undef,
    }
}
