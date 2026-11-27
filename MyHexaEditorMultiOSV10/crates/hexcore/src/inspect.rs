//! The data inspector.
//!
//! CONTRACT
//! `inspect(src, {offset, endian: "le"|"be"})` → `{ offset, endian, fields: [{ id, value, size, editable }] }`
//!   ids: int8 uint8 int16 uint16 int24 uint24 int32 uint32 int64 uint64 float16 float32 float64 bin8 oct8
//!   char (ASCII/Latin-1) utf8 (the character starting here) utf16 (char) uleb128 sleb128 dosdate dostime
//!   dosdatetime filetime unix32 unix64 oletime guid ipv4 ipv6 rgb565 rgb888 rgba bool
//!   `value` is display text ("—" when there are not enough bytes); `size` how many bytes it covers.
//!   Dates are UTC, "YYYY-MM-DD HH:MM:SS"; GUIDs in the Windows mixed-endian form {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}
//!   (always, whatever `endian`); ipv4 / ipv6 / rgb888 / rgba / utf8 read the bytes in order.
//! `encode({type: <id>, text, endian})` → `{ data: base64 }` — the bytes of a value typed by the user
//!   (for writing it back at the caret); errors name what is wrong. Every id is editable.
//!   Integers accept decimal, "-12", "0x7F"; char takes one character (Latin-1), utf8/utf16 one character;
//!   bin8 "01000001"; oct8 "101"; dates "YYYY-MM-DD[ HH:MM[:SS]]"; rgb "#RRGGBB" ("#RRGGBBAA" for rgba); bool true/false/1/0.
use crate::doc::Bytes;
use crate::util::{b64, Args};
use serde_json::{json, Value};

pub const FIELDS: &[&str] = &[
    "int8", "uint8", "int16", "uint16", "int24", "uint24", "int32", "uint32", "int64", "uint64", "float16", "float32", "float64", "bin8", "oct8",
    "char", "utf8", "utf16", "uleb128", "sleb128", "dosdate", "dostime", "dosdatetime", "filetime", "unix32", "unix64", "oletime", "guid", "ipv4",
    "ipv6", "rgb565", "rgb888", "rgba", "bool",
];

const NONE: &str = "—";

// ───────────── dates (days since 1970-01-01 ↔ civil date, Howard Hinnant's algorithms)

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Seconds since the Unix epoch as "YYYY-MM-DD HH:MM:SS" (UTC).
pub fn format_unix(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (y, m, d) = civil_from_days(days);
    if !(-9999..=99999).contains(&y) {
        return "(out of range)".into();
    }
    format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}", rem / 3600, rem / 60 % 60, rem % 60)
}

/// "YYYY-MM-DD[ HH:MM[:SS]]" (or a "T" between) → seconds since the Unix epoch.
pub fn parse_datetime(text: &str) -> Result<i64, String> {
    let t = text.trim().replace('T', " ");
    let mut parts = t.split_whitespace();
    let date = parts.next().ok_or("empty date")?;
    let d: Vec<i64> = date.split(['-', '/', '.']).map(|x| x.parse::<i64>().map_err(|_| format!("bad date: {date}"))).collect::<Result<_, _>>()?;
    if d.len() != 3 || !(1..=12).contains(&d[1]) || !(1..=31).contains(&d[2]) {
        return Err(format!("bad date: {date} (YYYY-MM-DD)"));
    }
    let mut secs = days_from_civil(d[0], d[1], d[2]) * 86400;
    if let Some(time) = parts.next() {
        let tm: Vec<i64> = time.split(':').map(|x| x.parse::<i64>().map_err(|_| format!("bad time: {time}"))).collect::<Result<_, _>>()?;
        if tm.is_empty() || tm.len() > 3 || tm[0] > 23 || tm.get(1).copied().unwrap_or(0) > 59 || tm.get(2).copied().unwrap_or(0) > 59 {
            return Err(format!("bad time: {time} (HH:MM:SS)"));
        }
        secs += tm[0] * 3600 + tm.get(1).copied().unwrap_or(0) * 60 + tm.get(2).copied().unwrap_or(0);
    }
    Ok(secs)
}

const FILETIME_EPOCH: i64 = 11_644_473_600; // seconds from 1601-01-01 to 1970-01-01
const OLE_EPOCH_DAYS: f64 = 25569.0; // days from 1899-12-30 to 1970-01-01

fn dos_date(v: u16) -> String {
    let (d, m, y) = (v & 31, (v >> 5) & 15, 1980 + (v >> 9));
    format!("{y:04}-{m:02}-{d:02}")
}
fn dos_time(v: u16) -> String {
    format!("{:02}:{:02}:{:02}", v >> 11, (v >> 5) & 63, (v & 31) * 2)
}

// ───────────── half floats

pub fn f16_to_f32(h: u16) -> f32 {
    let sign = ((h >> 15) as u32) << 31;
    let exp = ((h >> 10) & 0x1F) as u32;
    let frac = (h & 0x3FF) as u32;
    let bits = if exp == 0 {
        if frac == 0 {
            sign
        } else {
            // subnormal
            let mut e = 127 - 15 + 1;
            let mut f = frac;
            while f & 0x400 == 0 {
                f <<= 1;
                e -= 1;
            }
            sign | ((e as u32) << 23) | ((f & 0x3FF) << 13)
        }
    } else if exp == 31 {
        sign | 0x7F80_0000 | (frac << 13)
    } else {
        sign | ((exp + 127 - 15) << 23) | (frac << 13)
    };
    f32::from_bits(bits)
}

pub fn f32_to_f16(v: f32) -> u16 {
    let bits = v.to_bits();
    let sign = ((bits >> 16) & 0x8000) as u16;
    let exp = ((bits >> 23) & 0xFF) as i32;
    let frac = bits & 0x7F_FFFF;
    if exp == 255 {
        return sign | 0x7C00 | if frac != 0 { 0x200 } else { 0 };
    }
    let e = exp - 127 + 15;
    if e >= 31 {
        return sign | 0x7C00;
    }
    if e <= 0 {
        if e < -10 {
            return sign;
        }
        let m = frac | 0x80_0000;
        let shift = (14 - e) as u32;
        let mut half = (m >> shift) as u16;
        if (m >> (shift - 1)) & 1 == 1 {
            half += 1;
        }
        return sign | half;
    }
    let mut half = sign as u32 | ((e as u32) << 10) | (frac >> 13);
    if frac & 0x1000 != 0 {
        half += 1; // round half up (carries into the exponent correctly)
    }
    half as u16
}

/// A float as short text: plain within 1e-6 … 1e15, else the shortest exact exponent form (e.g. 7.0815616e-36).
fn float_text(v: f64, plain: String, exponent: String) -> String {
    let a = v.abs();
    if v == 0.0 || !v.is_finite() || (1e-6..1e15).contains(&a) { plain } else { exponent }
}

// ───────────── reading

struct Reader<'a> {
    b: &'a [u8],
    big: bool,
}

impl Reader<'_> {
    fn uint(&self, n: usize) -> Option<u64> {
        if self.b.len() < n {
            return None;
        }
        let mut v = 0u64;
        for i in 0..n {
            let byte = if self.big { self.b[i] } else { self.b[n - 1 - i] };
            v = (v << 8) | byte as u64;
        }
        Some(v)
    }
    fn int(&self, n: usize) -> Option<i64> {
        self.uint(n).map(|v| {
            let shift = 64 - 8 * n as u32;
            ((v << shift) as i64) >> shift
        })
    }
}

fn leb(bytes: &[u8], signed: bool) -> Option<(i128, usize)> {
    let mut v: i128 = 0;
    let mut shift = 0u32;
    for (i, &b) in bytes.iter().enumerate().take(10) {
        v |= ((b & 0x7F) as i128) << shift;
        shift += 7;
        if b & 0x80 == 0 {
            if signed && shift < 128 && (b & 0x40) != 0 {
                v |= -1i128 << shift;
            }
            return Some((v, i + 1));
        }
    }
    None
}

fn char_text(c: char) -> String {
    let n = c as u32;
    if n < 0x20 || n == 0x7F || (0x80..0xA0).contains(&n) {
        format!("\\x{n:02X}")
    } else {
        format!("'{c}' (U+{n:04X})")
    }
}

fn guid_text(b: &[u8]) -> String {
    let d1 = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
    let d2 = u16::from_le_bytes([b[4], b[5]]);
    let d3 = u16::from_le_bytes([b[6], b[7]]);
    format!(
        "{{{d1:08X}-{d2:04X}-{d3:04X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}}}",
        b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    )
}

fn field(id: &str, r: &Reader) -> (String, usize) {
    let b = r.b;
    let opt = |v: Option<String>, n: usize| (v.unwrap_or_else(|| NONE.to_string()), n);
    match id {
        "int8" => opt(r.int(1).map(|v| v.to_string()), 1),
        "uint8" => opt(r.uint(1).map(|v| v.to_string()), 1),
        "int16" => opt(r.int(2).map(|v| v.to_string()), 2),
        "uint16" => opt(r.uint(2).map(|v| v.to_string()), 2),
        "int24" => opt(r.int(3).map(|v| v.to_string()), 3),
        "uint24" => opt(r.uint(3).map(|v| v.to_string()), 3),
        "int32" => opt(r.int(4).map(|v| v.to_string()), 4),
        "uint32" => opt(r.uint(4).map(|v| v.to_string()), 4),
        "int64" => opt(r.int(8).map(|v| v.to_string()), 8),
        "uint64" => opt(r.uint(8).map(|v| v.to_string()), 8),
        "float16" => opt(r.uint(2).map(|v| { let f = f16_to_f32(v as u16); float_text(f as f64, f.to_string(), format!("{f:e}")) }), 2),
        "float32" => opt(r.uint(4).map(|v| { let f = f32::from_bits(v as u32); float_text(f as f64, f.to_string(), format!("{f:e}")) }), 4),
        "float64" => opt(r.uint(8).map(|v| { let f = f64::from_bits(v); float_text(f, f.to_string(), format!("{f:e}")) }), 8),
        "bin8" => opt(b.first().map(|v| format!("{v:08b}")), 1),
        "oct8" => opt(b.first().map(|v| format!("{v:03o}")), 1),
        "char" => opt(b.first().map(|&v| char_text(v as char)), 1),
        "bool" => opt(b.first().map(|&v| (if v != 0 { "true" } else { "false" }).to_string()), 1),
        "utf8" => {
            let Some(&first) = b.first() else { return (NONE.into(), 1) };
            let n = match first {
                0x00..=0x7F => 1,
                0xC2..=0xDF => 2,
                0xE0..=0xEF => 3,
                0xF0..=0xF4 => 4,
                _ => return ("(invalid)".into(), 1),
            };
            match b.get(..n).and_then(|s| std::str::from_utf8(s).ok()).and_then(|s| s.chars().next()) {
                Some(c) => (char_text(c), n),
                None => ("(invalid)".into(), 1),
            }
        }
        "utf16" => {
            let Some(u) = r.uint(2) else { return (NONE.into(), 2) };
            let u = u as u16;
            if (0xD800..0xDC00).contains(&u) {
                let low = Reader { b: b.get(2..).unwrap_or(&[]), big: r.big }.uint(2).map(|x| x as u16);
                match low.and_then(|l| char::decode_utf16([u, l]).next()).and_then(|c| c.ok()) {
                    Some(c) => (char_text(c), 4),
                    None => ("(invalid)".into(), 2),
                }
            } else {
                match char::from_u32(u as u32) {
                    Some(c) => (char_text(c), 2),
                    None => ("(invalid)".into(), 2),
                }
            }
        }
        "uleb128" | "sleb128" => match leb(b, id == "sleb128") {
            Some((v, n)) => (v.to_string(), n),
            None => (NONE.into(), 1),
        },
        "dosdate" => opt(r.uint(2).map(|v| dos_date(v as u16)), 2),
        "dostime" => opt(r.uint(2).map(|v| dos_time(v as u16)), 2),
        "dosdatetime" => opt(r.uint(4).map(|v| format!("{} {}", dos_date((v >> 16) as u16), dos_time(v as u16))), 4),
        "filetime" => opt(r.uint(8).map(|v| format_unix((v / 10_000_000) as i64 - FILETIME_EPOCH)), 8),
        "unix32" => opt(r.int(4).map(format_unix), 4),
        "unix64" => opt(r.int(8).map(|v| if v.unsigned_abs() > 1 << 42 { "(out of range)".into() } else { format_unix(v) }), 8),
        "oletime" => opt(
            r.uint(8).map(|v| {
                let days = f64::from_bits(v);
                if !days.is_finite() || days.abs() > 3e6 {
                    "(out of range)".into()
                } else {
                    format_unix(((days - OLE_EPOCH_DAYS) * 86400.0).round() as i64)
                }
            }),
            8,
        ),
        "guid" => opt(b.get(..16).map(guid_text), 16),
        "ipv4" => opt(b.get(..4).map(|x| format!("{}.{}.{}.{}", x[0], x[1], x[2], x[3])), 4),
        "ipv6" => opt(
            b.get(..16).map(|x| {
                let mut a = [0u8; 16];
                a.copy_from_slice(x);
                std::net::Ipv6Addr::from(a).to_string()
            }),
            16,
        ),
        "rgb565" => opt(
            r.uint(2).map(|v| {
                let v = v as u16;
                let (r5, g6, b5) = ((v >> 11) & 31, (v >> 5) & 63, v & 31);
                format!("#{:02X}{:02X}{:02X}", (r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2))
            }),
            2,
        ),
        "rgb888" => opt(b.get(..3).map(|x| format!("#{:02X}{:02X}{:02X}", x[0], x[1], x[2])), 3),
        "rgba" => opt(b.get(..4).map(|x| format!("#{:02X}{:02X}{:02X}{:02X}", x[0], x[1], x[2], x[3])), 4),
        _ => (NONE.into(), 0),
    }
}

pub fn inspect(src: &dyn Bytes, args: &Value) -> Result<Value, String> {
    let offset = args.u64_or("offset", 0).min(src.len());
    let endian = if args.str_or("endian", "le") == "be" { "be" } else { "le" };
    let n = (src.len() - offset).min(16) as usize;
    let mut buf = vec![0u8; n];
    src.read(offset, &mut buf)?;
    let r = Reader { b: &buf, big: endian == "be" };
    let fields: Vec<Value> = FIELDS
        .iter()
        .map(|id| {
            let (value, size) = field(id, &r);
            json!({ "id": id, "value": value, "size": size, "editable": true })
        })
        .collect();
    Ok(json!({ "offset": offset, "endian": endian, "fields": fields }))
}

// ───────────── writing a value back

fn parse_int(text: &str) -> Result<i128, String> {
    let t = text.trim().replace(['_', ' '], "");
    let (neg, body) = match t.strip_prefix('-') {
        Some(rest) => (true, rest.to_string()),
        None => (false, t.trim_start_matches('+').to_string()),
    };
    let lower = body.to_ascii_lowercase();
    let v = if let Some(h) = lower.strip_prefix("0x") {
        i128::from_str_radix(h, 16)
    } else if let Some(b) = lower.strip_prefix("0b") {
        i128::from_str_radix(b, 2)
    } else if let Some(o) = lower.strip_prefix("0o") {
        i128::from_str_radix(o, 8)
    } else {
        lower.parse::<i128>()
    }
    .map_err(|_| format!("not a number: {text}"))?;
    Ok(if neg { -v } else { v })
}

fn int_bytes(v: i128, n: usize, signed: bool, big: bool, id: &str) -> Result<Vec<u8>, String> {
    let bits = 8 * n as u32;
    let (lo, hi) = if signed { (-(1i128 << (bits - 1)), (1i128 << (bits - 1)) - 1) } else { (0, (1i128 << bits) - 1) };
    if v < lo || v > hi {
        return Err(format!("{id}: {v} is out of range ({lo} … {hi})"));
    }
    let u = (v as u128) & ((1u128 << bits) - 1);
    let le: Vec<u8> = (0..n).map(|i| (u >> (8 * i)) as u8).collect();
    Ok(if big { le.into_iter().rev().collect() } else { le })
}

fn uint_bytes(v: u64, n: usize, big: bool) -> Vec<u8> {
    let le: Vec<u8> = (0..n).map(|i| (v >> (8 * i)) as u8).collect();
    if big { le.into_iter().rev().collect() } else { le }
}

fn one_char(text: &str) -> Result<char, String> {
    let mut chars = text.chars();
    // A quoted character ('A') or an escape (\x41) as the inspector shows them.
    let t = text.trim();
    if let Some(h) = t.strip_prefix("\\x") {
        return u32::from_str_radix(h, 16).ok().and_then(char::from_u32).ok_or_else(|| format!("bad escape: {t}"));
    }
    if t.len() >= 3 && t.starts_with('\'') {
        if let Some(c) = t[1..].chars().next() {
            return Ok(c);
        }
    }
    match (chars.next(), chars.next()) {
        (Some(c), None) => Ok(c),
        _ => Err("type exactly one character".into()),
    }
}

fn leb_bytes(mut v: i128, signed: bool) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let byte = (v & 0x7F) as u8;
        v >>= 7;
        let done = if signed { (v == 0 && byte & 0x40 == 0) || (v == -1 && byte & 0x40 != 0) } else { v == 0 };
        if done {
            out.push(byte);
            return out;
        }
        out.push(byte | 0x80);
    }
}

fn parse_color(text: &str, n: usize) -> Result<Vec<u8>, String> {
    let t = text.trim().trim_start_matches('#');
    if t.len() != n * 2 {
        return Err(format!("colour: #{} expected", "RRGGBBAA".get(..n * 2).unwrap_or("RRGGBB")));
    }
    crate::util::parse_hex(t)
}

fn parse_dos_date(t: &str) -> Result<u16, String> {
    let secs = parse_datetime(t)?;
    let (y, m, d) = civil_from_days(secs.div_euclid(86400));
    if !(1980..=2107).contains(&y) {
        return Err("DOS dates run from 1980 to 2107".into());
    }
    Ok((((y - 1980) as u16) << 9) | ((m as u16) << 5) | d as u16)
}

fn parse_dos_time(t: &str) -> Result<u16, String> {
    let p: Vec<u16> = t.trim().split(':').map(|x| x.trim().parse::<u16>().map_err(|_| format!("bad time: {t}"))).collect::<Result<_, _>>()?;
    if p.is_empty() || p.len() > 3 || p[0] > 23 || p.get(1).copied().unwrap_or(0) > 59 || p.get(2).copied().unwrap_or(0) > 59 {
        return Err(format!("bad time: {t} (HH:MM:SS)"));
    }
    Ok((p[0] << 11) | (p.get(1).copied().unwrap_or(0) << 5) | (p.get(2).copied().unwrap_or(0) / 2))
}

pub fn encode_value(id: &str, text: &str, big: bool) -> Result<Vec<u8>, String> {
    let t = text.trim();
    let int = |n: usize, signed: bool| -> Result<Vec<u8>, String> {
        let v = parse_int(t)?;
        // Unsigned-looking hex for a signed type (0xFF for int8) is taken as the bit pattern.
        let v = if signed && v >= (1i128 << (8 * n - 1)) && v < (1i128 << (8 * n)) && t.to_ascii_lowercase().starts_with("0x") { v - (1i128 << (8 * n)) } else { v };
        int_bytes(v, n, signed, big, id)
    };
    match id {
        "int8" => int(1, true),
        "uint8" => int(1, false),
        "int16" => int(2, true),
        "uint16" => int(2, false),
        "int24" => int(3, true),
        "uint24" => int(3, false),
        "int32" => int(4, true),
        "uint32" => int(4, false),
        "int64" => int(8, true),
        "uint64" => int(8, false),
        "float16" | "float32" | "float64" => {
            let v: f64 = t.parse().map_err(|_| format!("not a number: {t}"))?;
            Ok(match id {
                "float16" => uint_bytes(f32_to_f16(v as f32) as u64, 2, big),
                "float32" => uint_bytes((v as f32).to_bits() as u64, 4, big),
                _ => uint_bytes(v.to_bits(), 8, big),
            })
        }
        "bin8" => u8::from_str_radix(&t.replace([' ', '_'], ""), 2).map(|v| vec![v]).map_err(|_| format!("not 8 binary digits: {t}")),
        "oct8" => u8::from_str_radix(t, 8).map(|v| vec![v]).map_err(|_| format!("not an octal byte: {t}")),
        "char" => {
            let c = one_char(text)?;
            if (c as u32) < 256 { Ok(vec![c as u32 as u8]) } else { Err(format!("'{c}' is not a one-byte character")) }
        }
        "utf8" => Ok(one_char(text)?.to_string().into_bytes()),
        "utf16" => {
            let mut units = [0u16; 2];
            Ok(one_char(text)?.encode_utf16(&mut units).iter().flat_map(|&u| uint_bytes(u as u64, 2, big)).collect())
        }
        "uleb128" => {
            let v = parse_int(t)?;
            if v < 0 { Err("uleb128 cannot be negative".into()) } else { Ok(leb_bytes(v, false)) }
        }
        "sleb128" => Ok(leb_bytes(parse_int(t)?, true)),
        "bool" => match t.to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => Ok(vec![1]),
            "false" | "0" | "no" => Ok(vec![0]),
            _ => Err("true or false".into()),
        },
        "dosdate" => Ok(uint_bytes(parse_dos_date(t)? as u64, 2, big)),
        "dostime" => Ok(uint_bytes(parse_dos_time(t)? as u64, 2, big)),
        "dosdatetime" => {
            let mut parts = t.split_whitespace();
            let date = parse_dos_date(parts.next().unwrap_or(""))?;
            let time = parse_dos_time(parts.next().unwrap_or("0:0:0"))?;
            Ok(uint_bytes(((date as u64) << 16) | time as u64, 4, big))
        }
        "filetime" => {
            let secs = parse_datetime(t)? + FILETIME_EPOCH;
            if secs < 0 {
                return Err("FILETIME starts in 1601".into());
            }
            Ok(uint_bytes(secs as u64 * 10_000_000, 8, big))
        }
        "unix32" => {
            let secs = parse_datetime(t)?;
            int_bytes(secs as i128, 4, true, big, id)
        }
        "unix64" => int_bytes(parse_datetime(t)? as i128, 8, true, big, id),
        "oletime" => {
            let days = parse_datetime(t)? as f64 / 86400.0 + OLE_EPOCH_DAYS;
            Ok(uint_bytes(days.to_bits(), 8, big))
        }
        "guid" => {
            let hex: String = t.chars().filter(|c| c.is_ascii_hexdigit()).collect();
            if hex.len() != 32 {
                return Err("GUID: 32 hex digits {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}".into());
            }
            let b = crate::util::parse_hex(&hex)?;
            let mut out = vec![b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6]];
            out.extend_from_slice(&b[8..16]);
            Ok(out)
        }
        "ipv4" => t.parse::<std::net::Ipv4Addr>().map(|a| a.octets().to_vec()).map_err(|_| format!("not an IPv4 address: {t}")),
        "ipv6" => t.parse::<std::net::Ipv6Addr>().map(|a| a.octets().to_vec()).map_err(|_| format!("not an IPv6 address: {t}")),
        "rgb565" => {
            let c = parse_color(t, 3)?;
            let v = ((c[0] as u16 >> 3) << 11) | ((c[1] as u16 >> 2) << 5) | (c[2] as u16 >> 3);
            Ok(uint_bytes(v as u64, 2, big))
        }
        "rgb888" => parse_color(t, 3),
        "rgba" => parse_color(t, 4),
        other => Err(format!("unknown type {other}")),
    }
}

pub fn encode(args: &Value) -> Result<Value, String> {
    let id = args.str_or("type", "");
    let big = args.str_or("endian", "le") == "be";
    Ok(json!({ "data": b64(&encode_value(id, args.str_or("text", ""), big)?) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields(bytes: &[u8], endian: &str) -> std::collections::HashMap<String, String> {
        let r = inspect(&bytes.to_vec(), &json!({ "offset": 0, "endian": endian })).unwrap();
        r["fields"].as_array().unwrap().iter().map(|f| (f["id"].as_str().unwrap().to_string(), f["value"].as_str().unwrap().to_string())).collect()
    }

    #[test]
    fn reads_values() {
        let f = fields(&[0xFE, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0], "le");
        assert_eq!(f["int8"], "-2");
        assert_eq!(f["uint16"], "65534");
        assert_eq!(f["int32"], "-2");
        assert_eq!(f["uint32"], "4294967294");
        let f = fields(&[0x00, 0x01], "be");
        assert_eq!(f["uint16"], "1");
        assert_eq!(fields(&[0x00, 0x3C], "le")["float16"], "1");
        assert_eq!(fields(&1.5f32.to_le_bytes(), "le")["float32"], "1.5");
        assert_eq!(fields(&[0xE5, 0x8E, 0x26], "le")["uleb128"], "624485");
        assert_eq!(fields(&[0xC0, 0xBB, 0x78], "le")["sleb128"], "-123456");
        assert_eq!(fields(&0i32.to_le_bytes(), "le")["unix32"], "1970-01-01 00:00:00");
        assert_eq!(fields(&1_700_000_000i32.to_le_bytes(), "le")["unix32"], "2023-11-14 22:13:20");
        // 2000-01-01 00:00:00 as FILETIME
        let ft = (946_684_800u64 + 11_644_473_600) * 10_000_000;
        assert_eq!(fields(&ft.to_le_bytes(), "le")["filetime"], "2000-01-01 00:00:00");
        assert_eq!(fields(&36526.0f64.to_le_bytes(), "le")["oletime"], "2000-01-01 00:00:00");
        // DOS: 2020-05-17 13:45:30 → date 0x50B1, time 0x6DAF
        let dt = (0x50B1u32 << 16) | 0x6DAF;
        assert_eq!(fields(&dt.to_le_bytes(), "le")["dosdatetime"], "2020-05-17 13:45:30");
        let g = [0x33, 0x22, 0x11, 0x00, 0x55, 0x44, 0x77, 0x66, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF];
        assert_eq!(fields(&g, "le")["guid"], "{00112233-4455-6677-8899-AABBCCDDEEFF}");
        assert_eq!(fields(&[192, 168, 0, 1], "le")["ipv4"], "192.168.0.1");
        assert_eq!(fields(&[0xC3, 0xA9], "le")["utf8"], "'é' (U+00E9)");
        assert_eq!(fields(&[0x3D, 0xD8, 0x00, 0xDE], "le")["utf16"], "'😀' (U+1F600)");
        assert_eq!(fields(&[0xFF], "le")["uint16"], "—");
    }

    #[test]
    fn encode_round_trips() {
        let probe = |id: &str, bytes: Vec<u8>, endian: &str| {
            let f = fields(&bytes, endian);
            let back = encode_value(id, &f[id], endian == "be").unwrap_or_else(|e| panic!("{id}: {e}"));
            assert_eq!(back, bytes[..back.len()].to_vec(), "{id} = {}", f[id]);
        };
        let sample = vec![0xC3, 0xA9, 0x12, 0x34, 0x56, 0x78, 0x9A, 0x3C, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x08];
        for id in ["int8", "uint8", "int16", "uint16", "int24", "uint24", "int32", "uint32", "int64", "uint64", "float32", "float64", "bin8", "oct8", "utf8", "guid", "ipv4", "ipv6", "rgb888", "rgba"] {
            probe(id, sample.clone(), "le");
            probe(id, sample.clone(), "be");
        }
        probe("float16", vec![0x00, 0x3C], "le");
        probe("unix32", 1_700_000_000i32.to_le_bytes().to_vec(), "le");
        probe("dosdatetime", ((0x50B1u32 << 16) | 0x6DAF).to_le_bytes().to_vec(), "le");
        probe("sleb128", vec![0xC0, 0xBB, 0x78], "le");
        probe("char", vec![b'A'], "le");
        assert_eq!(encode_value("uint8", "256", false).unwrap_err(), "uint8: 256 is out of range (0 … 255)");
        assert_eq!(encode_value("int8", "0xFF", false).unwrap(), vec![0xFF]);
        assert_eq!(encode_value("uint16", "0x1234", true).unwrap(), vec![0x12, 0x34]);
    }
}
