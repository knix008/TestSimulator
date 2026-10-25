//! Reading data files: CSV/TSV/TXT, JSON, STL meshes (text and binary), WAV
//! sound, Excel workbooks (.xlsx), MATLAB files (.mat, level 5, compressed
//! or not) and PNG images. Carries its own DEFLATE decoder (zip, zlib) and
//! base64 so it works the same in the desktop engine and in WebAssembly.

use crate::data::{parse_csv, Column, Dataset, Grid, Table};

/// Decodes a file by its extension.
pub fn decode(name: &str, bytes: &[u8], sheet: &str) -> Result<Dataset, String> {
    let lower = name.to_ascii_lowercase();
    let stem = std::path::Path::new(name).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
    let ext = lower.rsplit('.').next().unwrap_or("");
    let text = || String::from_utf8_lossy(bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(bytes)).to_string();
    match ext {
        "stl" => stl(bytes),
        "wav" | "wave" => wav(bytes),
        "xlsx" | "xlsm" => xlsx(bytes, sheet, &stem),
        "mat" => mat(bytes),
        "png" => png(bytes),
        "json" => crate::nodes::io::json_table(&text(), &stem),
        "csv" | "tsv" | "txt" | "dat" | "prn" | "" => {
            let t = parse_csv(&text(), &stem)?;
            let rows = t.rows();
            let mut d = Dataset::table(t);
            d.scalar("rows", rows as f64, "");
            Ok(d)
        }
        other => Err(format!("files of type .{other} cannot be read (CSV, TSV, TXT, JSON, STL, WAV, XLSX, MAT, PNG)")),
    }
}

// ───────────────────────── base64

pub fn base64_decode(text: &str) -> Result<Vec<u8>, String> {
    let body = match text.find("base64,") {
        Some(i) => &text[i + 7..],
        None => text,
    };
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a' + 26) as u32,
            b'0'..=b'9' => (c - b'0' + 52) as u32,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        })
    };
    let mut out = Vec::with_capacity(body.len() * 3 / 4);
    let mut acc = 0u32;
    let mut bits = 0;
    for &c in body.as_bytes() {
        if c == b'=' {
            break;
        }
        if c.is_ascii_whitespace() {
            continue;
        }
        let v = val(c).ok_or("the embedded file is not valid base64")?;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

// ───────────────────────── DEFLATE (RFC 1951)

struct Bits<'a> {
    data: &'a [u8],
    pos: usize,
    bit: u32,
    nbits: u32,
}

impl Bits<'_> {
    fn need(&mut self, n: u32) -> Result<(), String> {
        while self.nbits < n {
            let b = *self.data.get(self.pos).ok_or("the compressed data ends too early")?;
            self.pos += 1;
            self.bit |= (b as u32) << self.nbits;
            self.nbits += 8;
        }
        Ok(())
    }

    fn get(&mut self, n: u32) -> Result<u32, String> {
        if n == 0 {
            return Ok(0);
        }
        self.need(n)?;
        let v = self.bit & ((1u32 << n) - 1);
        self.bit >>= n;
        self.nbits -= n;
        Ok(v)
    }

    fn align(&mut self) {
        self.bit = 0;
        self.nbits = 0;
    }
}

/// Canonical Huffman decoding table: counts per length and symbols in order.
struct Huff {
    counts: [u16; 16],
    symbols: Vec<u16>,
}

impl Huff {
    fn new(lengths: &[u8]) -> Huff {
        let mut counts = [0u16; 16];
        for &l in lengths {
            counts[l as usize] += 1;
        }
        counts[0] = 0;
        let mut offs = [0u16; 16];
        for i in 1..16 {
            offs[i] = offs[i - 1] + counts[i - 1];
        }
        let mut symbols = vec![0u16; lengths.len()];
        for (s, &l) in lengths.iter().enumerate() {
            if l != 0 {
                symbols[offs[l as usize] as usize] = s as u16;
                offs[l as usize] += 1;
            }
        }
        Huff { counts, symbols }
    }

    fn decode(&self, b: &mut Bits) -> Result<u16, String> {
        let (mut code, mut first, mut index) = (0i32, 0i32, 0i32);
        for len in 1..16 {
            code |= b.get(1)? as i32;
            let count = self.counts[len] as i32;
            if code - count < first {
                return Ok(self.symbols[(index + (code - first)) as usize]);
            }
            index += count;
            first += count;
            first <<= 1;
            code <<= 1;
        }
        Err("bad compressed data (Huffman code)".into())
    }
}

const LBASE: [u16; 29] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT: [u8; 29] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE: [u16; 30] = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT: [u8; 30] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

/// Raw DEFLATE → bytes.
pub fn inflate(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut b = Bits { data, pos: 0, bit: 0, nbits: 0 };
    let mut out: Vec<u8> = Vec::with_capacity(data.len() * 4);
    loop {
        let last = b.get(1)?;
        let kind = b.get(2)?;
        match kind {
            0 => {
                b.align();
                if b.pos + 4 > data.len() {
                    return Err("the compressed data ends too early".into());
                }
                let len = u16::from_le_bytes([data[b.pos], data[b.pos + 1]]) as usize;
                b.pos += 4;
                let end = b.pos + len;
                out.extend_from_slice(data.get(b.pos..end).ok_or("the compressed data ends too early")?);
                b.pos = end;
            }
            1 | 2 => {
                let (lit, dist) = if kind == 1 {
                    let mut l = [0u8; 288];
                    for (i, v) in l.iter_mut().enumerate() {
                        *v = if i < 144 { 8 } else if i < 256 { 9 } else if i < 280 { 7 } else { 8 };
                    }
                    (Huff::new(&l), Huff::new(&[5u8; 30]))
                } else {
                    let hlit = b.get(5)? as usize + 257;
                    let hdist = b.get(5)? as usize + 1;
                    let hclen = b.get(4)? as usize + 4;
                    const ORDER: [usize; 19] = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
                    let mut cl = [0u8; 19];
                    for &o in ORDER.iter().take(hclen) {
                        cl[o] = b.get(3)? as u8;
                    }
                    let ch = Huff::new(&cl);
                    let mut lengths = vec![0u8; hlit + hdist];
                    let mut i = 0;
                    while i < hlit + hdist {
                        let sym = ch.decode(&mut b)?;
                        match sym {
                            0..=15 => {
                                lengths[i] = sym as u8;
                                i += 1;
                            }
                            16 => {
                                let prev = *lengths.get(i.wrapping_sub(1)).ok_or("bad compressed data (repeat)")?;
                                for _ in 0..3 + b.get(2)? {
                                    *lengths.get_mut(i).ok_or("bad compressed data (lengths)")? = prev;
                                    i += 1;
                                }
                            }
                            17 => i += 3 + b.get(3)? as usize,
                            _ => i += 11 + b.get(7)? as usize,
                        }
                    }
                    if i > hlit + hdist {
                        return Err("bad compressed data (lengths)".into());
                    }
                    (Huff::new(&lengths[..hlit]), Huff::new(&lengths[hlit..]))
                };
                loop {
                    let sym = lit.decode(&mut b)? as usize;
                    if sym < 256 {
                        out.push(sym as u8);
                    } else if sym == 256 {
                        break;
                    } else {
                        let k = sym - 257;
                        if k >= 29 {
                            return Err("bad compressed data (length)".into());
                        }
                        let len = LBASE[k] as usize + b.get(LEXT[k] as u32)? as usize;
                        let ds = dist.decode(&mut b)? as usize;
                        if ds >= 30 {
                            return Err("bad compressed data (distance)".into());
                        }
                        let d = DBASE[ds] as usize + b.get(DEXT[ds] as u32)? as usize;
                        if d > out.len() {
                            return Err("bad compressed data (distance too far)".into());
                        }
                        let start = out.len() - d;
                        for j in 0..len {
                            let v = out[start + j];
                            out.push(v);
                        }
                    }
                }
            }
            _ => return Err("bad compressed data (block type)".into()),
        }
        if last == 1 {
            break;
        }
        if out.len() > 1 << 30 {
            return Err("the file expands to more than 1 GB".into());
        }
    }
    Ok(out)
}

/// zlib (2-byte header, DEFLATE, Adler-32) → bytes.
pub fn zlib(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 2 || data[0] & 0x0f != 8 || (((data[0] as u16) << 8) | data[1] as u16) % 31 != 0 {
        return Err("not zlib data".into());
    }
    inflate(&data[2..])
}

/// The files of a zip archive by name (stored or deflated).
fn unzip(bytes: &[u8]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let u16le = |p: usize| -> Result<usize, String> { bytes.get(p..p + 2).map(|s| u16::from_le_bytes([s[0], s[1]]) as usize).ok_or_else(|| "the zip file is cut short".to_string()) };
    let u32le = |p: usize| -> Result<usize, String> { bytes.get(p..p + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]) as usize).ok_or_else(|| "the zip file is cut short".to_string()) };
    // The end-of-central-directory record, searched from the end.
    let mut eocd = None;
    let lo = bytes.len().saturating_sub(65_557);
    for p in (lo..bytes.len().saturating_sub(21)).rev() {
        if bytes[p..p + 4] == [0x50, 0x4b, 0x05, 0x06] {
            eocd = Some(p);
            break;
        }
    }
    let e = eocd.ok_or("not a zip file (an .xlsx is one)")?;
    let count = u16le(e + 10)?;
    let mut p = u32le(e + 16)?;
    let mut files = Vec::new();
    for _ in 0..count {
        if bytes.get(p..p + 4) != Some(&[0x50, 0x4b, 0x01, 0x02]) {
            return Err("the zip directory is damaged".into());
        }
        let method = u16le(p + 10)?;
        let csize = u32le(p + 20)?;
        let nlen = u16le(p + 28)?;
        let xlen = u16le(p + 30)?;
        let clen = u16le(p + 32)?;
        let local = u32le(p + 42)?;
        let name = String::from_utf8_lossy(bytes.get(p + 46..p + 46 + nlen).ok_or("the zip directory is damaged")?).to_string();
        p += 46 + nlen + xlen + clen;
        let lnlen = u16le(local + 26)?;
        let lxlen = u16le(local + 28)?;
        let start = local + 30 + lnlen + lxlen;
        let raw = bytes.get(start..start + csize).ok_or("a zip entry is cut short")?;
        let data = match method {
            0 => raw.to_vec(),
            8 => inflate(raw)?,
            m => return Err(format!("zip compression method {m} is not supported")),
        };
        files.push((name, data));
    }
    Ok(files)
}

// ───────────────────────── STL

fn stl(bytes: &[u8]) -> Result<Dataset, String> {
    let binary = bytes.len() >= 84 && {
        let n = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
        bytes.len() == 84 + 50 * n
    };
    let mut tri: Vec<[f64; 12]> = Vec::new();
    if binary {
        let n = (bytes.len() - 84) / 50;
        for k in 0..n {
            let at = 84 + 50 * k;
            let f = |i: usize| f32::from_le_bytes([bytes[at + 4 * i], bytes[at + 4 * i + 1], bytes[at + 4 * i + 2], bytes[at + 4 * i + 3]]) as f64;
            // normal (3), then three vertices
            tri.push([f(3), f(4), f(5), f(6), f(7), f(8), f(9), f(10), f(11), f(0), f(1), f(2)]);
        }
    } else {
        let text = String::from_utf8_lossy(bytes);
        let mut normal = [0.0; 3];
        let mut verts: Vec<f64> = Vec::new();
        for line in text.lines() {
            let w: Vec<&str> = line.split_whitespace().collect();
            match w.first().map(|s| s.to_ascii_lowercase()).as_deref() {
                Some("facet") if w.len() >= 5 => {
                    for k in 0..3 {
                        normal[k] = w[2 + k].parse().unwrap_or(0.0);
                    }
                    verts.clear();
                }
                Some("vertex") if w.len() >= 4 => {
                    for k in 0..3 {
                        verts.push(w[1 + k].parse().map_err(|_| format!("bad vertex \"{}\"", line.trim()))?);
                    }
                }
                Some("endfacet") => {
                    if verts.len() != 9 {
                        return Err("a facet without three vertices".into());
                    }
                    let mut t = [0.0; 12];
                    t[..9].copy_from_slice(&verts);
                    t[9..].copy_from_slice(&normal);
                    tri.push(t);
                }
                _ => {}
            }
        }
        if tri.is_empty() {
            return Err("no triangles in the STL file".into());
        }
    }
    let mut t = Table::new("triangles");
    for (k, name) in ["x1", "y1", "z1", "x2", "y2", "z2", "x3", "y3", "z3", "nx", "ny", "nz"].iter().enumerate() {
        t.push(Column::new(name, "", tri.iter().map(|r| r[k]).collect()));
    }
    // The vertices as points (for the 3D view).
    let mut pts = Table::new("vertices");
    for (k, name) in ["x", "y", "z"].iter().enumerate() {
        pts.push(Column::new(name, "", tri.iter().flat_map(|r| [r[k], r[3 + k], r[6 + k]]).collect()));
    }
    let mut d = Dataset::default();
    d.scalar("triangles", tri.len() as f64, "");
    d.text = if binary { "binary STL".into() } else { "ASCII STL".into() };
    d.tables.push(t);
    d.tables.push(pts);
    Ok(d)
}

// ───────────────────────── WAV

fn wav(bytes: &[u8]) -> Result<Dataset, String> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("not a WAV file".into());
    }
    let (mut fmt, mut channels, mut rate, mut bits) = (0u16, 0usize, 0u32, 0u16);
    let mut data: Option<&[u8]> = None;
    let mut p = 12;
    while p + 8 <= bytes.len() {
        let id = &bytes[p..p + 4];
        let size = u32::from_le_bytes([bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]]) as usize;
        let body = &bytes[p + 8..(p + 8 + size).min(bytes.len())];
        if id == b"fmt " && body.len() >= 16 {
            fmt = u16::from_le_bytes([body[0], body[1]]);
            channels = u16::from_le_bytes([body[2], body[3]]) as usize;
            rate = u32::from_le_bytes([body[4], body[5], body[6], body[7]]);
            bits = u16::from_le_bytes([body[14], body[15]]);
            if fmt == 0xFFFE && body.len() >= 26 {
                fmt = u16::from_le_bytes([body[24], body[25]]);
            }
        } else if id == b"data" {
            data = Some(body);
        }
        p += 8 + size + (size & 1);
    }
    let data = data.ok_or("the WAV file has no data")?;
    if channels == 0 || rate == 0 {
        return Err("the WAV file has no format chunk".into());
    }
    let width = (bits as usize).div_ceil(8);
    let frames = data.len() / (width * channels);
    let sample = |at: usize| -> f64 {
        let s = &data[at..at + width];
        match (fmt, bits) {
            (3, 32) => f32::from_le_bytes([s[0], s[1], s[2], s[3]]) as f64,
            (3, 64) => f64::from_le_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]),
            (_, 8) => (s[0] as f64 - 128.0) / 128.0,
            (_, 16) => i16::from_le_bytes([s[0], s[1]]) as f64 / 32768.0,
            (_, 24) => (((s[2] as i32) << 24 | (s[1] as i32) << 16 | (s[0] as i32) << 8) >> 8) as f64 / 8_388_608.0,
            (_, 32) => i32::from_le_bytes([s[0], s[1], s[2], s[3]]) as f64 / 2_147_483_648.0,
            _ => f64::NAN,
        }
    };
    if !(fmt == 1 || fmt == 3) || ![8, 16, 24, 32, 64].contains(&bits) {
        return Err(format!("WAV format {fmt} with {bits} bits is not supported (PCM 8/16/24/32 or float)"));
    }
    let mut t = Table::new("audio").with_x(Column::new("t", "s", (0..frames).map(|i| i as f64 / rate as f64).collect()));
    let names: Vec<String> = match channels {
        1 => vec!["y".into()],
        2 => vec!["left".into(), "right".into()],
        n => (1..=n).map(|k| format!("ch{k}")).collect(),
    };
    for (c, name) in names.iter().enumerate() {
        t.push(Column::new(name, "", (0..frames).map(|i| sample((i * channels + c) * width)).collect()));
    }
    let mut d = Dataset::table(t);
    d.scalar("sample rate", rate as f64, "Hz");
    d.scalar("channels", channels as f64, "");
    d.scalar("duration", frames as f64 / rate as f64, "s");
    d.scalar("bits", bits as f64, "");
    Ok(d)
}

// ───────────────────────── XLSX

fn xml_unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

/// The value of attribute `name` in a tag's text.
fn attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let key = format!(" {name}=\"");
    let i = tag.find(&key)? + key.len();
    let j = tag[i..].find('"')? + i;
    Some(&tag[i..j])
}

/// The text of every <tag …>…</tag> in order (the inner text, tags stripped).
fn elements<'a>(xml: &'a str, tag: &str) -> Vec<(&'a str, &'a str)> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut p = 0;
    while let Some(i) = xml[p..].find(&open).map(|i| i + p) {
        let after = xml.as_bytes().get(i + open.len()).copied().unwrap_or(b'>');
        if !(after == b' ' || after == b'>' || after == b'/') {
            p = i + open.len();
            continue;
        }
        let Some(gt) = xml[i..].find('>').map(|g| g + i) else { break };
        let head = &xml[i..=gt];
        if head.ends_with("/>") {
            out.push((head, ""));
            p = gt + 1;
            continue;
        }
        let Some(end) = xml[gt..].find(&close).map(|e| e + gt) else { break };
        out.push((head, &xml[gt + 1..end]));
        p = end + close.len();
    }
    out
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for c in s.chars() {
        match c {
            '<' => inside = true,
            '>' => inside = false,
            c if !inside => out.push(c),
            _ => {}
        }
    }
    xml_unescape(&out)
}

fn col_index(r: &str) -> usize {
    let mut n = 0usize;
    for c in r.chars().take_while(|c| c.is_ascii_alphabetic()) {
        n = n * 26 + (c.to_ascii_uppercase() as u8 - b'A' + 1) as usize;
    }
    n.saturating_sub(1)
}

fn xlsx(bytes: &[u8], sheet: &str, stem: &str) -> Result<Dataset, String> {
    let files = unzip(bytes)?;
    let get = |name: &str| files.iter().find(|(n, _)| n.eq_ignore_ascii_case(name)).map(|(_, d)| String::from_utf8_lossy(d).to_string());
    let workbook = get("xl/workbook.xml").ok_or("not an Excel workbook (no xl/workbook.xml)")?;
    let rels = get("xl/_rels/workbook.xml.rels").unwrap_or_default();
    let sheets: Vec<(String, String)> = elements(&workbook, "sheet")
        .iter()
        .map(|(h, _)| {
            let name = xml_unescape(attr(h, "name").unwrap_or(""));
            let rid = attr(h, "r:id").unwrap_or("");
            let target = elements(&rels, "Relationship").iter().find(|(r, _)| attr(r, "Id") == Some(rid)).and_then(|(r, _)| attr(r, "Target")).unwrap_or("").to_string();
            let path = if let Some(t) = target.strip_prefix('/') { t.to_string() } else { format!("xl/{target}") };
            (name, path)
        })
        .collect();
    if sheets.is_empty() {
        return Err("the workbook has no sheets".into());
    }
    let (sheet_name, path) = if sheet.trim().is_empty() {
        sheets[0].clone()
    } else {
        sheets.iter().find(|(n, _)| n.eq_ignore_ascii_case(sheet.trim())).cloned().ok_or_else(|| format!("no sheet \"{sheet}\" (sheets: {})", sheets.iter().map(|s| s.0.as_str()).collect::<Vec<_>>().join(", ")))?
    };
    let shared: Vec<String> = get("xl/sharedStrings.xml").map(|x| elements(&x, "si").iter().map(|(_, inner)| strip_tags(inner)).collect()).unwrap_or_default();
    let xml = get(&path).ok_or_else(|| format!("the sheet file {path} is missing"))?;
    let mut grid: Vec<Vec<String>> = Vec::new();
    for (_, row) in elements(&xml, "row") {
        let mut cells: Vec<String> = Vec::new();
        for (head, inner) in elements(row, "c") {
            let col = attr(head, "r").map(col_index).unwrap_or(cells.len());
            let kind = attr(head, "t").unwrap_or("n");
            let v = elements(inner, "v").first().map(|(_, t)| xml_unescape(t)).unwrap_or_default();
            let value = match kind {
                "s" => v.trim().parse::<usize>().ok().and_then(|i| shared.get(i).cloned()).unwrap_or_default(),
                "inlineStr" => strip_tags(inner),
                "b" => if v.trim() == "1" { "1".into() } else { "0".into() },
                _ => v,
            };
            if cells.len() <= col {
                cells.resize(col + 1, String::new());
            }
            cells[col] = value;
        }
        grid.push(cells);
    }
    while grid.last().is_some_and(|r| r.iter().all(|c| c.trim().is_empty())) {
        grid.pop();
    }
    if grid.is_empty() {
        return Err(format!("the sheet \"{sheet_name}\" is empty"));
    }
    let width = grid.iter().map(|r| r.len()).max().unwrap_or(0);
    let quote = |s: &str| if s.contains(',') || s.contains('"') || s.contains('\n') { format!("\"{}\"", s.replace('"', "\"\"")) } else { s.to_string() };
    let csv: String = grid.iter().map(|r| (0..width).map(|k| quote(r.get(k).map(|s| s.as_str()).unwrap_or(""))).collect::<Vec<_>>().join(",")).collect::<Vec<_>>().join("\n");
    let table = parse_csv(&csv, if sheet_name.is_empty() { stem } else { &sheet_name })?;
    let rows = table.rows();
    let mut d = Dataset::table(table);
    d.scalar("rows", rows as f64, "");
    d.scalar("sheets", sheets.len() as f64, "");
    d.text = format!("sheets: {}", sheets.iter().map(|s| s.0.as_str()).collect::<Vec<_>>().join(", "));
    Ok(d)
}

// ───────────────────────── MATLAB level 5

fn mat(bytes: &[u8]) -> Result<Dataset, String> {
    if bytes.len() < 128 {
        return Err("not a MATLAB file".into());
    }
    if bytes[126..128] != *b"IM" {
        if bytes.starts_with(b"\x89HDF") || bytes[..128].windows(3).any(|w| w == b"7.3") {
            return Err("MATLAB v7.3 files (HDF5) are not supported; save with -v7".into());
        }
        return Err("not a little-endian MATLAB level 5 file".into());
    }
    let mut vars: Vec<(String, Vec<usize>, Vec<f64>)> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    elements_mat(&bytes[128..], &mut vars, &mut skipped)?;
    let mut d = Dataset::default();
    let mut vectors = Table::new("variables");
    let mut longest = 0;
    for (name, dims, data) in &vars {
        let (m, n) = (dims.first().copied().unwrap_or(0), dims.get(1).copied().unwrap_or(1));
        if dims.len() > 2 {
            skipped.push(format!("{name} ({} dimensions)", dims.len()));
            continue;
        }
        if m * n == 1 {
            d.scalar(name, data[0], "");
        } else if m == 1 || n == 1 {
            longest = longest.max(data.len());
            vectors.push(Column::new(name, "", data.clone()));
        } else {
            // A matrix (column-major): a table of its columns and a grid.
            let mut t = Table::new(name);
            for c in 0..n.min(200) {
                t.push(Column::new(&format!("{name}_{}", c + 1), "", data[c * m..(c + 1) * m].to_vec()));
            }
            d.tables.push(t);
            let z: Vec<f64> = (0..m).flat_map(|r| (0..n).map(move |c| (r, c))).map(|(r, c)| data[c * m + r]).collect();
            d.grids.push(Grid { name: name.clone(), x: (1..=n).map(|v| v as f64).collect(), y: (1..=m).map(|v| v as f64).collect(), z, x_label: "column".into(), y_label: "row".into(), z_label: name.clone(), x_names: None, y_names: None });
        }
    }
    if !vectors.columns.is_empty() {
        // Shorter vectors are padded so they share one table.
        for c in vectors.columns.iter_mut() {
            c.values.resize(longest, f64::NAN);
        }
        d.tables.insert(0, vectors);
    }
    if !skipped.is_empty() {
        d.text = format!("not read: {}", skipped.join(", "));
    }
    d.scalar("variables", vars.len() as f64, "");
    Ok(d)
}

fn elements_mat(mut b: &[u8], vars: &mut Vec<(String, Vec<usize>, Vec<f64>)>, skipped: &mut Vec<String>) -> Result<(), String> {
    while b.len() >= 8 {
        let (ty, size, body, rest) = tag(b)?;
        match ty {
            15 => elements_mat(&zlib(body)?, vars, skipped)?,
            14 => match matrix(body) {
                Ok(Some(v)) => vars.push(v),
                Ok(None) => skipped.push("a cell, struct or text variable".into()),
                Err(e) => return Err(e),
            },
            _ => {}
        }
        let _ = size;
        b = rest;
    }
    Ok(())
}

/// A data element: (type, size, body, rest after padding to 8 bytes).
fn tag(b: &[u8]) -> Result<(u32, usize, &[u8], &[u8]), String> {
    if b.len() < 8 {
        return Err("the MATLAB file is cut short".into());
    }
    let first = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
    if first >> 16 != 0 {
        // Small element: type and size in one word, data in the next four bytes.
        let ty = first & 0xffff;
        let size = (first >> 16) as usize;
        return Ok((ty, size, &b[4..4 + size.min(4)], &b[8..]));
    }
    let size = u32::from_le_bytes([b[4], b[5], b[6], b[7]]) as usize;
    let body = b.get(8..8 + size).ok_or("the MATLAB file is cut short")?;
    let padded = if first == 15 { size } else { size.div_ceil(8) * 8 };
    Ok((first, size, body, b.get(8 + padded..).unwrap_or(&[])))
}

fn numbers(ty: u32, body: &[u8]) -> Vec<f64> {
    let chunk = |w: usize| body.chunks_exact(w);
    match ty {
        1 => body.iter().map(|&v| v as i8 as f64).collect(),
        2 => body.iter().map(|&v| v as f64).collect(),
        3 => chunk(2).map(|c| i16::from_le_bytes([c[0], c[1]]) as f64).collect(),
        4 => chunk(2).map(|c| u16::from_le_bytes([c[0], c[1]]) as f64).collect(),
        5 => chunk(4).map(|c| i32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f64).collect(),
        6 => chunk(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f64).collect(),
        7 => chunk(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f64).collect(),
        9 => chunk(8).map(|c| f64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]])).collect(),
        12 => chunk(8).map(|c| i64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]) as f64).collect(),
        13 => chunk(8).map(|c| u64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]) as f64).collect(),
        _ => Vec::new(),
    }
}

fn matrix(b: &[u8]) -> Result<Option<(String, Vec<usize>, Vec<f64>)>, String> {
    let (_, _, flags, rest) = tag(b)?;
    let class = flags.first().copied().unwrap_or(0);
    let (_, _, dims_b, rest) = tag(rest)?;
    let dims: Vec<usize> = numbers(5, dims_b).iter().map(|v| *v as usize).collect();
    let (_, _, name_b, rest) = tag(rest)?;
    let name = String::from_utf8_lossy(name_b).to_string();
    // Numeric classes: double 6, single 7, int8 … uint64 8–15; logical arrays are uint8 with a flag.
    if !(6..=15).contains(&class) {
        return Ok(None);
    }
    let (ty, _, real, _) = tag(rest)?;
    let data = numbers(ty, real);
    let count: usize = dims.iter().product();
    if data.len() < count {
        return Err(format!("variable {name}: the data is shorter than its size"));
    }
    Ok(Some((name, dims, data[..count].to_vec())))
}

// ───────────────────────── PNG

fn png(bytes: &[u8]) -> Result<Dataset, String> {
    if bytes.len() < 8 || bytes[..8] != [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a] {
        return Err("not a PNG image".into());
    }
    let (mut w, mut h, mut depth, mut ctype, mut interlace) = (0usize, 0usize, 0u8, 0u8, 0u8);
    let mut idat = Vec::new();
    let mut palette: Vec<[u8; 3]> = Vec::new();
    let mut p = 8;
    while p + 8 <= bytes.len() {
        let len = u32::from_be_bytes([bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]]) as usize;
        let kind = &bytes[p + 4..p + 8];
        let body = bytes.get(p + 8..p + 8 + len).ok_or("the PNG file is cut short")?;
        match kind {
            b"IHDR" => {
                w = u32::from_be_bytes([body[0], body[1], body[2], body[3]]) as usize;
                h = u32::from_be_bytes([body[4], body[5], body[6], body[7]]) as usize;
                depth = body[8];
                ctype = body[9];
                interlace = body[12];
            }
            b"PLTE" => palette = body.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect(),
            b"IDAT" => idat.extend_from_slice(body),
            b"IEND" => break,
            _ => {}
        }
        p += 12 + len;
    }
    if interlace != 0 {
        return Err("interlaced PNG images are not supported".into());
    }
    if w == 0 || h == 0 || w * h > 16_000_000 {
        return Err("the PNG image size is not supported".into());
    }
    let channels = match ctype {
        0 => 1,
        2 => 3,
        3 => 1,
        4 => 2,
        6 => 4,
        _ => return Err(format!("PNG colour type {ctype} is not supported")),
    };
    let bpp_bits = channels * depth as usize;
    let stride = (w * bpp_bits).div_ceil(8);
    let bpp = bpp_bits.div_ceil(8).max(1);
    let raw = zlib(&idat)?;
    if raw.len() < h * (stride + 1) {
        return Err("the PNG image data is cut short".into());
    }
    let mut img = vec![0u8; h * stride];
    for y in 0..h {
        let f = raw[y * (stride + 1)];
        let src = &raw[y * (stride + 1) + 1..(y + 1) * (stride + 1)];
        for x in 0..stride {
            let a = if x >= bpp { img[y * stride + x - bpp] as i32 } else { 0 };
            let b = if y > 0 { img[(y - 1) * stride + x] as i32 } else { 0 };
            let c = if x >= bpp && y > 0 { img[(y - 1) * stride + x - bpp] as i32 } else { 0 };
            let pred = match f {
                0 => 0,
                1 => a,
                2 => b,
                3 => (a + b) / 2,
                4 => {
                    let pp = a + b - c;
                    let (pa, pb, pc) = ((pp - a).abs(), (pp - b).abs(), (pp - c).abs());
                    if pa <= pb && pa <= pc {
                        a
                    } else if pb <= pc {
                        b
                    } else {
                        c
                    }
                }
                _ => return Err("bad PNG filter".into()),
            };
            img[y * stride + x] = (src[x] as i32 + pred) as u8;
        }
    }
    let max = ((1u32 << depth) - 1) as f64;
    let sample = |y: usize, i: usize| -> f64 {
        // Sample i of the row (each `depth` bits wide).
        let bit = i * depth as usize;
        match depth {
            16 => u16::from_be_bytes([img[y * stride + bit / 8], img[y * stride + bit / 8 + 1]]) as f64,
            8 => img[y * stride + bit / 8] as f64,
            _ => ((img[y * stride + bit / 8] >> (8 - depth as usize - bit % 8)) & ((1 << depth) - 1)) as f64,
        }
    };
    let mut lum = vec![0.0; w * h];
    let (mut rs, mut gs, mut bs) = (vec![0.0; w * h], vec![0.0; w * h], vec![0.0; w * h]);
    for y in 0..h {
        for x in 0..w {
            let (r, g, b) = match ctype {
                0 | 4 => {
                    let v = sample(y, x * channels) / max;
                    (v, v, v)
                }
                3 => {
                    let c = palette.get(sample(y, x) as usize).copied().unwrap_or([0, 0, 0]);
                    (c[0] as f64 / 255.0, c[1] as f64 / 255.0, c[2] as f64 / 255.0)
                }
                _ => (sample(y, x * channels) / max, sample(y, x * channels + 1) / max, sample(y, x * channels + 2) / max),
            };
            // Rows from the bottom up, so the picture stands upright on y.
            let k = (h - 1 - y) * w + x;
            lum[k] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            rs[k] = r;
            gs[k] = g;
            bs[k] = b;
        }
    }
    let xs: Vec<f64> = (0..w).map(|v| v as f64).collect();
    let ys: Vec<f64> = (0..h).map(|v| v as f64).collect();
    let grid = |name: &str, z: Vec<f64>| Grid { name: name.into(), x: xs.clone(), y: ys.clone(), z, x_label: "x (px)".into(), y_label: "y (px)".into(), z_label: name.into(), x_names: None, y_names: None };
    let mut d = Dataset::default();
    d.scalar("width", w as f64, "px");
    d.scalar("height", h as f64, "px");
    d.scalar("mean brightness", lum.iter().sum::<f64>() / lum.len() as f64, "");
    // The middle row as a profile table.
    let mid = h / 2;
    let mut t = Table::new("middle row").with_x(Column::new("x", "px", xs.clone()));
    t.push(Column::new("brightness", "", lum[mid * w..(mid + 1) * w].to_vec()));
    t.push(Column::new("red", "", rs[mid * w..(mid + 1) * w].to_vec()));
    t.push(Column::new("green", "", gs[mid * w..(mid + 1) * w].to_vec()));
    t.push(Column::new("blue", "", bs[mid * w..(mid + 1) * w].to_vec()));
    d.tables.push(t);
    d.grids.push(grid("brightness", lum));
    if channels >= 3 || ctype == 3 {
        d.grids.push(grid("red", rs));
        d.grids.push(grid("green", gs));
        d.grids.push(grid("blue", bs));
    }
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_and_deflate() {
        assert_eq!(base64_decode("data:application/octet-stream;base64,SGVsbG8=").unwrap(), b"Hello");
        // zlib.compress(b"hello hello hello hello") (fixed Huffman with a back-reference)
        let z = [0x78, 0x9c, 0xcb, 0x48, 0xcd, 0xc9, 0xc9, 0x57, 0xc8, 0x40, 0x27, 0x01, 0x68, 0x03, 0x08, 0xb1];
        assert_eq!(zlib(&z).unwrap(), b"hello hello hello hello");
    }
}
