//! Search: hex bytes with wildcards, text in any encoding (case-sensitive or not), regular expressions and
//! numbers (integers of any width and either byte order, floats).
//!
//! A pattern (`args.pattern`):
//! `{ kind: "hex"|"text"|"regex"|"int"|"float", value, encoding: "utf8"…, caseSensitive: true, width: 1|2|4|8,
//!    endian: "le"|"be", unicode: false }`
//!   hex: "4D 5A ?? 00", "4?" / "?F" match one nibble, spaces ignored.
//!   regex: on raw bytes (`\xFF`, `[\x00-\x1F]`); `unicode: true` treats the data as UTF-8 text.
//!
//! Methods:
//! `search({pattern, from, backwards, wrap, offset?, length?})` → `{ match: {offset, length}|null, wrapped }`
//!   forward: the first match starting at or after `from`; backwards: the last one starting before `from`.
//! `findAll({pattern, offset?, length?, limit: 10000, countOnly})` → `{ matches: [[offset, length]], count, truncated }`
//! `replaceAll({pattern, replacement: {kind:"hex"|"text", value, encoding} | data: base64, offset?, length?})` → count
//!   (one undo step).
use crate::codec;
use crate::doc::{Bytes, Document};
use crate::util::{parse_hex, Args, Progress, CANCELLED};
use serde_json::{json, Value};

const CHUNK: usize = 4 << 20;
/// How far a regular expression match may reach over a chunk border.
const REGEX_OVERLAP: usize = 64 << 10;

/// One position of a byte pattern: a byte matches when `(b & mask) == value`, or equals `alt`.
#[derive(Clone, Copy, Debug)]
pub struct Cell {
    value: u8,
    mask: u8,
    alt: Option<u8>,
}

impl Cell {
    #[inline]
    fn hit(&self, b: u8) -> bool {
        (b & self.mask) == self.value || self.alt == Some(b)
    }
}

pub enum Matcher {
    Cells(Vec<Cell>),
    Regex(regex::bytes::Regex),
}

impl Matcher {
    /// The longest match that can span a chunk border.
    fn reach(&self) -> usize {
        match self {
            Matcher::Cells(cells) => cells.len(),
            Matcher::Regex(_) => REGEX_OVERLAP,
        }
    }

    /// Matches in `hay` (absolute position `base`) that start in `[base + lo, base + hi)`.
    fn scan(&self, hay: &[u8], lo: usize, hi: usize, mut found: impl FnMut(usize, usize) -> bool) {
        match self {
            Matcher::Cells(cells) => {
                let n = cells.len();
                if n == 0 || hay.len() < n {
                    return;
                }
                let last_start = (hay.len() - n).min(hi.saturating_sub(1));
                // Anchor on the first exact cell (no wildcard, no alternative): find it quickly.
                let anchor = cells.iter().position(|c| c.mask == 0xFF && c.alt.is_none());
                let mut i = lo;
                while i <= last_start {
                    if let Some(a) = anchor {
                        let want = cells[a].value;
                        match hay[i + a..=last_start + a].iter().position(|&b| b == want) {
                            Some(p) => i += p,
                            None => return,
                        }
                    }
                    if cells.iter().enumerate().all(|(k, c)| c.hit(hay[i + k])) {
                        if !found(i, n) {
                            return;
                        }
                        i += n;
                    } else {
                        i += 1;
                    }
                }
            }
            Matcher::Regex(re) => {
                let mut at = lo;
                while at < hi.min(hay.len() + 1) {
                    let Some(m) = re.find_at(hay, at) else { return };
                    if m.start() >= hi {
                        return;
                    }
                    if !found(m.start(), m.len()) {
                        return;
                    }
                    at = if m.end() > m.start() { m.end() } else { m.start() + 1 };
                }
            }
        }
    }
}

fn fold_cell(b: u8, single_byte_latin: bool) -> Cell {
    let alt = if b.is_ascii_lowercase() {
        Some(b.to_ascii_uppercase())
    } else if b.is_ascii_uppercase() {
        Some(b.to_ascii_lowercase())
    } else if single_byte_latin && (0xC0..=0xDE).contains(&b) && b != 0xD7 {
        Some(b + 0x20)
    } else if single_byte_latin && (0xE0..=0xFE).contains(&b) && b != 0xF7 {
        Some(b - 0x20)
    } else {
        None
    };
    Cell { value: b, mask: 0xFF, alt }
}

/// Builds the matcher of a pattern.
pub fn compile(pattern: &Value) -> Result<Matcher, String> {
    let kind = pattern.str_or("kind", "hex");
    let value = pattern.str_or("value", "");
    if value.is_empty() {
        return Err("empty search".into());
    }
    let exact = |bytes: Vec<u8>| Matcher::Cells(bytes.into_iter().map(|b| Cell { value: b, mask: 0xFF, alt: None }).collect());
    match kind {
        "hex" => {
            let mut cells = Vec::new();
            let digits: Vec<char> = value.chars().filter(|c| !c.is_whitespace() && *c != ',').collect();
            if digits.len() % 2 != 0 {
                return Err("hex: an even number of digits is needed (use ? for a nibble)".into());
            }
            for pair in digits.chunks(2) {
                let mut v = 0u8;
                let mut m = 0u8;
                for (k, c) in pair.iter().enumerate() {
                    let shift = if k == 0 { 4 } else { 0 };
                    if *c == '?' || *c == '*' || *c == '.' {
                        continue;
                    }
                    let d = c.to_digit(16).ok_or_else(|| format!("not a hex digit: {c}"))? as u8;
                    v |= d << shift;
                    m |= 0xF << shift;
                }
                cells.push(Cell { value: v, mask: m, alt: None });
            }
            if cells.iter().all(|c| c.mask == 0) {
                return Err("only wildcards".into());
            }
            Ok(Matcher::Cells(cells))
        }
        "text" => {
            let encoding = pattern.str_or("encoding", "utf8");
            let case = pattern.bool_or("caseSensitive", true);
            let bytes = codec::encode(value, encoding)?;
            if case {
                return Ok(exact(bytes));
            }
            match encoding {
                "utf8" | "" => {
                    let escaped = regex::escape(value);
                    let re = regex::bytes::RegexBuilder::new(&escaped).case_insensitive(true).unicode(true).build().map_err(|e| e.to_string())?;
                    Ok(Matcher::Regex(re))
                }
                "utf16le" | "utf16be" => {
                    let le = encoding == "utf16le";
                    let mut cells = Vec::new();
                    for unit in value.encode_utf16() {
                        let alt = char::from_u32(unit as u32).and_then(|c| {
                            let other = if c.is_lowercase() { c.to_uppercase().next() } else { c.to_lowercase().next() };
                            other.filter(|o| *o != c && (*o as u32) < 0x10000).map(|o| o as u32 as u16)
                        });
                        let (a, b) = if le { (unit as u8, (unit >> 8) as u8) } else { ((unit >> 8) as u8, unit as u8) };
                        match alt {
                            // Both bytes of the unit change together only for letters; the high byte is the
                            // same for ASCII and Latin-1 letters, which is what case folding meets in practice.
                            Some(o) if (o >> 8) == (unit >> 8) => {
                                let lo_alt = o as u8;
                                if le {
                                    cells.push(Cell { value: a, mask: 0xFF, alt: Some(lo_alt) });
                                    cells.push(Cell { value: b, mask: 0xFF, alt: None });
                                } else {
                                    cells.push(Cell { value: a, mask: 0xFF, alt: None });
                                    cells.push(Cell { value: b, mask: 0xFF, alt: Some(lo_alt) });
                                }
                            }
                            _ => {
                                cells.push(Cell { value: a, mask: 0xFF, alt: None });
                                cells.push(Cell { value: b, mask: 0xFF, alt: None });
                            }
                        }
                    }
                    Ok(Matcher::Cells(cells))
                }
                "latin1" | "cp1252" | "ascii" | "cp437" => Ok(Matcher::Cells(bytes.into_iter().map(|b| fold_cell(b, encoding != "ascii" && encoding != "cp437")).collect())),
                "ebcdic" => Ok(Matcher::Cells(
                    bytes
                        .into_iter()
                        .map(|b| {
                            // EBCDIC letters: a–i 81–89 / A–I C1–C9, j–r 91–99 / D1–D9, s–z A2–A9 / E2–E9.
                            let alt = match b {
                                0x81..=0x89 | 0x91..=0x99 | 0xA2..=0xA9 => Some(b + 0x40),
                                0xC1..=0xC9 | 0xD1..=0xD9 | 0xE2..=0xE9 => Some(b - 0x40),
                                _ => None,
                            };
                            Cell { value: b, mask: 0xFF, alt }
                        })
                        .collect(),
                )),
                _ => Ok(exact(bytes)),
            }
        }
        "regex" => {
            let re = regex::bytes::RegexBuilder::new(value)
                .unicode(pattern.bool_or("unicode", false))
                .case_insensitive(!pattern.bool_or("caseSensitive", true))
                .size_limit(32 << 20)
                .build()
                .map_err(|e| e.to_string())?;
            Ok(Matcher::Regex(re))
        }
        "int" | "float" => Ok(exact(number_bytes(pattern)?)),
        "bytes" => Ok(exact(pattern.data("data")?)),
        other => Err(format!("unknown search kind {other}")),
    }
}

/// The bytes of a number pattern.
pub fn number_bytes(pattern: &Value) -> Result<Vec<u8>, String> {
    let value = pattern.str_or("value", "").trim();
    let big = pattern.str_or("endian", "le") == "be";
    let width = pattern.u64_or("width", 4) as usize;
    let bytes: Vec<u8> = if pattern.str_or("kind", "int") == "float" {
        let f: f64 = value.parse().map_err(|_| format!("not a number: {value}"))?;
        match width {
            4 => if big { (f as f32).to_be_bytes().to_vec() } else { (f as f32).to_le_bytes().to_vec() },
            8 => if big { f.to_be_bytes().to_vec() } else { f.to_le_bytes().to_vec() },
            _ => return Err("float width is 4 or 8".into()),
        }
    } else {
        if !matches!(width, 1 | 2 | 3 | 4 | 8) {
            return Err("width is 1, 2, 3, 4 or 8".into());
        }
        let negative = value.starts_with('-');
        let magnitude = crate::util::parse_u64(value.trim_start_matches('-')).ok_or_else(|| format!("not a number: {value}"))?;
        let bits = width * 8;
        let max = if bits == 64 { u64::MAX } else { (1u64 << bits) - 1 };
        let v = if negative {
            let limit = 1u64 << (bits - 1);
            if magnitude > limit {
                return Err(format!("{value} does not fit in {width} bytes"));
            }
            (magnitude as i64).wrapping_neg() as u64 & max
        } else {
            if magnitude > max {
                return Err(format!("{value} does not fit in {width} bytes"));
            }
            magnitude
        };
        if big { v.to_be_bytes()[8 - width..].to_vec() } else { v.to_le_bytes()[..width].to_vec() }
    };
    Ok(bytes)
}

/// The first match starting in `[from, end)` (forward) or the last one starting in `[start, from)` (backwards).
pub fn find(src: &dyn Bytes, m: &Matcher, start: u64, end: u64, from: u64, backwards: bool, progress: &mut Progress) -> Result<Option<(u64, u64)>, String> {
    let reach = m.reach();
    let mut buf = Vec::new();
    if !backwards {
        let mut pos = from.max(start);
        while pos < end {
            let scan_end = (pos + CHUNK as u64).min(end);
            let read_end = (scan_end + reach as u64).min(src.len());
            buf.resize((read_end - pos) as usize, 0);
            src.read(pos, &mut buf)?;
            // Matches must lie within [start, end).
            let limit = (end - pos) as usize;
            let mut hit = None;
            m.scan(&buf[..limit.min(buf.len())], 0, (scan_end - pos) as usize, |at, len| {
                hit = Some((pos + at as u64, len as u64));
                false
            });
            if hit.is_some() {
                return Ok(hit);
            }
            pos = scan_end;
            if !progress(pos - from.max(start), end - from.max(start)) {
                return Err(CANCELLED.into());
            }
        }
        Ok(None)
    } else {
        let mut hi = from.min(end);
        while hi > start {
            let lo = hi.saturating_sub(CHUNK as u64).max(start);
            let read_end = (hi + reach as u64).min(end);
            buf.resize((read_end - lo) as usize, 0);
            src.read(lo, &mut buf)?;
            let mut last = None;
            m.scan(&buf, 0, (hi - lo) as usize, |at, len| {
                last = Some((lo + at as u64, len as u64));
                true
            });
            if last.is_some() {
                return Ok(last);
            }
            hi = lo;
            if !progress(from - hi, from - start) {
                return Err(CANCELLED.into());
            }
        }
        Ok(None)
    }
}

/// Every non-overlapping match in `[start, end)`, up to `limit` (`count` keeps counting past it).
pub fn matches(src: &dyn Bytes, m: &Matcher, start: u64, end: u64, limit: usize, progress: &mut Progress) -> Result<(Vec<(u64, u64)>, u64), String> {
    let reach = m.reach();
    let mut out = Vec::new();
    let mut count = 0u64;
    let mut pos = start;
    // The next allowed start (a match may run over a chunk border).
    let mut next = start;
    let mut buf = Vec::new();
    while pos < end {
        let scan_end = (pos + CHUNK as u64).min(end);
        let read_end = (scan_end + reach as u64).min(end);
        buf.resize((read_end - pos) as usize, 0);
        src.read(pos, &mut buf)?;
        let lo = (next.max(pos) - pos) as usize;
        m.scan(&buf, lo, (scan_end - pos) as usize, |at, len| {
            let abs = pos + at as u64;
            count += 1;
            if out.len() < limit {
                out.push((abs, len as u64));
            }
            next = abs + (len as u64).max(1);
            true
        });
        pos = scan_end;
        if !progress(pos - start, end - start) {
            return Err(CANCELLED.into());
        }
    }
    Ok((out, count))
}

fn bounds(src: &dyn Bytes, args: &Value) -> (u64, u64) {
    let (offset, length) = crate::util::range_of(src, args);
    (offset, offset + length)
}

pub fn search(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let m = compile(args.get("pattern").unwrap_or(&Value::Null))?;
    let (start, end) = bounds(src, args);
    let backwards = args.bool_or("backwards", false);
    let from = args.u64_or("from", if backwards { end } else { start }).clamp(start, end);
    let mut found = find(src, &m, start, end, from, backwards, progress)?;
    let mut wrapped = false;
    if found.is_none() && args.bool_or("wrap", true) {
        wrapped = true;
        found = if backwards { find(src, &m, start, end, end, true, progress)? } else { find(src, &m, start, end, start, false, progress)? };
    }
    Ok(json!({ "match": found.map(|(o, l)| json!({ "offset": o, "length": l })), "wrapped": wrapped && found.is_some() }))
}

pub fn find_all(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let m = compile(args.get("pattern").unwrap_or(&Value::Null))?;
    let (start, end) = bounds(src, args);
    let limit = if args.bool_or("countOnly", false) { 0 } else { args.u64_or("limit", 10_000) as usize };
    let (list, count) = matches(src, &m, start, end, limit, progress)?;
    Ok(json!({ "matches": list.iter().map(|(o, l)| json!([o, l])).collect::<Vec<_>>(), "count": count, "truncated": (count as usize) > list.len() }))
}

/// The replacement bytes of a replace.
pub fn replacement(args: &Value) -> Result<Vec<u8>, String> {
    if let Some(r) = args.get("replacement") {
        let value = r.str_or("value", "");
        return match r.str_or("kind", "hex") {
            "hex" => parse_hex(value),
            "text" => codec::encode(value, r.str_or("encoding", "utf8")),
            "int" | "float" => number_bytes(r),
            other => Err(format!("unknown replacement kind {other}")),
        };
    }
    args.data("data")
}

pub fn replace_all(doc: &mut Document, args: &Value, progress: &mut Progress) -> Result<u64, String> {
    let m = compile(args.get("pattern").unwrap_or(&Value::Null))?;
    let with = replacement(args)?;
    let (start, end) = bounds(doc, args);
    let (list, count) = matches(doc, &m, start, end, usize::MAX, progress)?;
    if count == 0 {
        return Ok(0);
    }
    // From the last match to the first: earlier offsets stay valid.
    let edits: Vec<(u64, u64, Vec<u8>)> = list.iter().rev().map(|&(o, l)| (o, l, with.clone())).collect();
    doc.edit("replaceAll", &edits, false)?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::no_progress;

    fn find_one(data: &[u8], pattern: Value, from: u64, back: bool) -> Option<(u64, u64)> {
        let m = compile(&pattern).unwrap();
        let owned = data.to_vec();
        find(&owned, &m, 0, data.len() as u64, from, back, &mut no_progress()).unwrap()
    }

    #[test]
    fn hex_with_wildcards() {
        let data = b"\x00\x4D\x5A\x90\x00\x4D\x5B\x90";
        assert_eq!(find_one(data, json!({"kind":"hex","value":"4D 5A"}), 0, false), Some((1, 2)));
        assert_eq!(find_one(data, json!({"kind":"hex","value":"4D ?? 90"}), 2, false), Some((5, 3)));
        assert_eq!(find_one(data, json!({"kind":"hex","value":"5?"}), 0, false), Some((2, 1)));
        assert_eq!(find_one(data, json!({"kind":"hex","value":"4D"}), 8, true), Some((5, 1)));
        assert_eq!(find_one(data, json!({"kind":"hex","value":"4D"}), 5, true), Some((1, 1)));
    }

    #[test]
    fn text_in_encodings() {
        let mut data = b"xx Hello yy ".to_vec();
        data.extend(codec::encode("WORLD", "utf16le").unwrap());
        data.extend(codec::encode("한글", "euc-kr").unwrap());
        assert_eq!(find_one(&data, json!({"kind":"text","value":"hello","caseSensitive":false}), 0, false), Some((3, 5)));
        assert_eq!(find_one(&data, json!({"kind":"text","value":"hello","caseSensitive":true}), 0, false), None);
        assert_eq!(find_one(&data, json!({"kind":"text","value":"world","encoding":"utf16le","caseSensitive":false}), 0, false), Some((12, 10)));
        assert_eq!(find_one(&data, json!({"kind":"text","value":"한글","encoding":"euc-kr"}), 0, false), Some((22, 4)));
    }

    #[test]
    fn numbers_and_regex() {
        let data = [0u8, 0x39, 0x30, 0, 0, 0, 0, 0x30, 0x39, 0xFF, 0xFF];
        assert_eq!(find_one(&data, json!({"kind":"int","value":"12345","width":4}), 0, false), Some((1, 4)));
        assert_eq!(find_one(&data, json!({"kind":"int","value":"12345","width":2,"endian":"be"}), 0, false), Some((7, 2)));
        assert_eq!(find_one(&data, json!({"kind":"int","value":"-1","width":2}), 0, false), Some((9, 2)));
        assert_eq!(find_one(&data, json!({"kind":"regex","value":"\\x30\\x39"}), 0, false), Some((7, 2)));
    }

    #[test]
    fn across_chunks_and_replace_all() {
        let mut data = vec![0u8; CHUNK * 2 + 10];
        data[CHUNK - 1] = 0xAB;
        data[CHUNK] = 0xCD;
        data[CHUNK * 2 + 5] = 0xAB;
        data[CHUNK * 2 + 6] = 0xCD;
        let m = compile(&json!({"kind":"hex","value":"AB CD"})).unwrap();
        let (list, count) = matches(&data, &m, 0, data.len() as u64, 100, &mut no_progress()).unwrap();
        assert_eq!(count, 2);
        assert_eq!(list, vec![((CHUNK - 1) as u64, 2), ((CHUNK * 2 + 5) as u64, 2)]);
        let mut doc = Document::from_bytes(b"a-b-c".to_vec(), "t");
        let n = replace_all(&mut doc, &json!({"pattern":{"kind":"text","value":"-"},"replacement":{"kind":"text","value":"::"}}), &mut no_progress()).unwrap();
        assert_eq!(n, 2);
        assert_eq!(doc.flatten().unwrap(), b"a::b::c");
        doc.undo();
        assert_eq!(doc.flatten().unwrap(), b"a-b-c");
    }
}
