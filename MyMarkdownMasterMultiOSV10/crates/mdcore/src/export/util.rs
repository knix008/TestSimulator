//! Small helpers shared by the writers: escaping, base64, image headers, zip packaging, widths, dates.
use std::io::{Cursor, Write};

use super::{ExportInput, Resource};

/// Escapes text for XML / XHTML element content and attribute values. Characters that XML 1.0 forbids
/// (C0 controls other than tab/newline/CR) are dropped.
pub fn xml_escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&apos;"),
            '\t' | '\n' | '\r' => o.push(c),
            c if (c as u32) < 0x20 || c == '\u{FFFE}' || c == '\u{FFFF}' => {}
            c => o.push(c),
        }
    }
    o
}

/// HTML escaping (same as XML but `'` as a numeric reference, which HTML4 readers also understand).
pub fn html_escape(s: &str) -> String {
    xml_escape(s).replace("&apos;", "&#39;")
}

pub fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut o = String::with_capacity(data.len().div_ceil(3) * 4);
    for ch in data.chunks(3) {
        let b = [ch[0], *ch.get(1).unwrap_or(&0), *ch.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        o.push(T[(n >> 18) as usize & 63] as char);
        o.push(T[(n >> 12) as usize & 63] as char);
        o.push(if ch.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        o.push(if ch.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    o
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImgKind {
    Png,
    Jpeg,
    Gif,
    Svg,
    Webp,
    Bmp,
    Other,
}

impl ImgKind {
    pub fn ext(&self) -> &'static str {
        match self {
            ImgKind::Png => "png",
            ImgKind::Jpeg => "jpeg",
            ImgKind::Gif => "gif",
            ImgKind::Svg => "svg",
            ImgKind::Webp => "webp",
            ImgKind::Bmp => "bmp",
            ImgKind::Other => "bin",
        }
    }
    pub fn mime(&self) -> &'static str {
        match self {
            ImgKind::Png => "image/png",
            ImgKind::Jpeg => "image/jpeg",
            ImgKind::Gif => "image/gif",
            ImgKind::Svg => "image/svg+xml",
            ImgKind::Webp => "image/webp",
            ImgKind::Bmp => "image/bmp",
            ImgKind::Other => "application/octet-stream",
        }
    }
}

/// Image kind sniffed from the bytes (falling back to the declared mime).
pub fn img_kind(r: &Resource) -> ImgKind {
    let b = &r.bytes;
    if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        ImgKind::Png
    } else if b.starts_with(&[0xFF, 0xD8]) {
        ImgKind::Jpeg
    } else if b.starts_with(b"GIF8") {
        ImgKind::Gif
    } else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        ImgKind::Webp
    } else if b.starts_with(b"BM") {
        ImgKind::Bmp
    } else {
        let m = r.mime.to_ascii_lowercase();
        let head = String::from_utf8_lossy(&b[..b.len().min(512)]).to_ascii_lowercase();
        if m.contains("svg") || head.contains("<svg") {
            ImgKind::Svg
        } else if m.contains("png") {
            ImgKind::Png
        } else if m.contains("jpeg") || m.contains("jpg") {
            ImgKind::Jpeg
        } else if m.contains("gif") {
            ImgKind::Gif
        } else {
            ImgKind::Other
        }
    }
}

/// Pixel size from PNG / GIF / JPEG / BMP / WebP headers.
pub fn img_size(b: &[u8]) -> Option<(u32, u32)> {
    let be32 = |i: usize| -> Option<u32> { b.get(i..i + 4).map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]])) };
    let be16 = |i: usize| -> Option<u32> { b.get(i..i + 2).map(|s| u16::from_be_bytes([s[0], s[1]]) as u32) };
    let le16 = |i: usize| -> Option<u32> { b.get(i..i + 2).map(|s| u16::from_le_bytes([s[0], s[1]]) as u32) };
    let le32 = |i: usize| -> Option<u32> { b.get(i..i + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]])) };
    if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some((be32(16)?, be32(20)?)).filter(|&(w, h)| w > 0 && h > 0);
    }
    if b.starts_with(b"GIF8") {
        return Some((le16(6)?, le16(8)?)).filter(|&(w, h)| w > 0 && h > 0);
    }
    if b.starts_with(b"BM") {
        let w = le32(18)? as i32;
        let h = le32(22)? as i32;
        return Some((w.unsigned_abs(), h.unsigned_abs())).filter(|&(w, h)| w > 0 && h > 0);
    }
    if b.len() > 30 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        match &b[12..16] {
            b"VP8 " => return Some((le16(26)? & 0x3FFF, le16(28)? & 0x3FFF)),
            b"VP8L" => {
                let n = le32(21)?;
                return Some(((n & 0x3FFF) + 1, ((n >> 14) & 0x3FFF) + 1));
            }
            b"VP8X" => {
                let w = 1 + (b[24] as u32 | (b[25] as u32) << 8 | (b[26] as u32) << 16);
                let h = 1 + (b[27] as u32 | (b[28] as u32) << 8 | (b[29] as u32) << 16);
                return Some((w, h));
            }
            _ => return None,
        }
    }
    if b.starts_with(&[0xFF, 0xD8]) {
        let mut i = 2;
        while i + 9 < b.len() {
            if b[i] != 0xFF {
                i += 1;
                continue;
            }
            let m = b[i + 1];
            if m == 0xFF {
                i += 1;
                continue;
            }
            if m == 0xD8 || m == 0x01 || (0xD0..=0xD7).contains(&m) {
                i += 2;
                continue;
            }
            let len = be16(i + 2)? as usize;
            if (0xC0..=0xCF).contains(&m) && m != 0xC4 && m != 0xC8 && m != 0xCC {
                let h = be16(i + 5)?;
                let w = be16(i + 7)?;
                return Some((w, h)).filter(|&(w, h)| w > 0 && h > 0);
            }
            i += 2 + len;
        }
        return None;
    }
    None
}

/// Display size in points (96 dpi pixels → pt), scaled down to fit `max_w_pt`.
pub fn fit_pt(px: Option<(u32, u32)>, max_w_pt: f64) -> (f64, f64) {
    let (w, h) = px.unwrap_or((400, 300));
    let (mut w, mut h) = (w as f64 * 0.75, h as f64 * 0.75);
    if w > max_w_pt {
        h = h * max_w_pt / w;
        w = max_w_pt;
    }
    (w.max(0.75), h.max(0.75))
}

/// Looks a src up through the caller's callback, trying the raw value, a percent-decoded one and one
/// without a `#fragment` / `?query` / leading `./`.
pub fn lookup(input: &ExportInput, src: &str) -> Option<Resource> {
    if src.is_empty() || src.starts_with("data:") {
        return None;
    }
    let f = input.resource;
    if let Some(r) = f(src) {
        return Some(r);
    }
    let dec = percent_decode(src);
    if dec != src {
        if let Some(r) = f(&dec) {
            return Some(r);
        }
    }
    let base = dec.split(['#', '?']).next().unwrap_or("").trim_start_matches("./").to_string();
    if base != dec && !base.is_empty() {
        return f(&base);
    }
    None
}

pub fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut o = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() && b[i + 1].is_ascii_hexdigit() && b[i + 2].is_ascii_hexdigit() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("zz"), 16) {
                o.push(v);
                i += 3;
                continue;
            }
        }
        o.push(b[i]);
        i += 1;
    }
    String::from_utf8(o).unwrap_or_else(|_| s.to_string())
}

/// Data URI of a resource.
pub fn data_uri(r: &Resource) -> String {
    let k = img_kind(r);
    let mime = if k == ImgKind::Other && !r.mime.is_empty() { r.mime.clone() } else { k.mime().to_string() };
    format!("data:{};base64,{}", mime, base64(&r.bytes))
}

/// Terminal display width (East Asian wide characters count 2, combining marks 0).
pub fn str_width(s: &str) -> usize {
    s.chars().map(char_width).sum()
}

pub fn char_width(c: char) -> usize {
    let u = c as u32;
    if u == 0 || (0x300..=0x36F).contains(&u) || (0x200B..=0x200F).contains(&u) || (0x1160..=0x11FF).contains(&u) {
        return 0;
    }
    let wide = (0x1100..=0x115F).contains(&u)
        || (0x2E80..=0x303E).contains(&u)
        || (0x3041..=0x33FF).contains(&u)
        || (0x3400..=0x4DBF).contains(&u)
        || (0x4E00..=0x9FFF).contains(&u)
        || (0xA000..=0xA4CF).contains(&u)
        || (0xAC00..=0xD7A3).contains(&u)
        || (0xF900..=0xFAFF).contains(&u)
        || (0xFE30..=0xFE4F).contains(&u)
        || (0xFF00..=0xFF60).contains(&u)
        || (0xFFE0..=0xFFE6).contains(&u)
        || (0x1F300..=0x1F64F).contains(&u)
        || (0x1F900..=0x1F9FF).contains(&u)
        || (0x20000..=0x3FFFD).contains(&u);
    if wide {
        2
    } else {
        1
    }
}

pub fn pad_to(s: &str, width: usize, align: super::ir::Align) -> String {
    let w = str_width(s);
    if w >= width {
        return s.to_string();
    }
    let gap = width - w;
    match align {
        super::ir::Align::Right => format!("{}{}", " ".repeat(gap), s),
        super::ir::Align::Center => format!("{}{}{}", " ".repeat(gap / 2), s, " ".repeat(gap - gap / 2)),
        _ => format!("{}{}", s, " ".repeat(gap)),
    }
}

/// 64-bit FNV-1a.
pub fn fnv64(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// A deterministic RFC-4122-shaped (version 4 layout) UUID derived from `seed`.
pub fn uuid_from(seed: &str) -> String {
    let a = fnv64(seed.as_bytes());
    let b = fnv64(format!("{seed}\u{1}{a}").as_bytes());
    let x = ((a as u128) << 64) | b as u128;
    let h = format!("{:032x}", x);
    format!(
        "{}-{}-4{}-{}{}-{}",
        &h[0..8],
        &h[8..12],
        &h[13..16],
        ["8", "9", "a", "b"][(b as usize) & 3],
        &h[17..20],
        &h[20..32]
    )
}

/// `(y, m, d, hh, mm, ss)` from an ISO-like date (`2026-11-27`, `2026-11-27T10:20`, `2026/11/27 10:20:30`).
pub fn parse_date(s: &str) -> Option<(i32, u32, u32, u32, u32, u32)> {
    let digits: Vec<u32> = s
        .split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty())
        .take(6)
        .filter_map(|p| p.parse().ok())
        .collect();
    if digits.len() < 3 || digits[0] < 1000 || !(1..=12).contains(&digits[1]) || !(1..=31).contains(&digits[2]) {
        return None;
    }
    let g = |i: usize, max: u32| digits.get(i).copied().filter(|&v| v <= max).unwrap_or(0);
    Some((digits[0] as i32, digits[1], digits[2], g(3, 23), g(4, 59), g(5, 59)))
}

/// `YYYY-MM-DDThh:mm:ssZ` from the input date (or a fixed epoch when it cannot be read; no clock on wasm).
pub fn w3c_datetime(s: &str) -> String {
    let (y, m, d, hh, mm, ss) = parse_date(s).unwrap_or((2000, 1, 1, 0, 0, 0));
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
}

/// In-memory zip writer.
pub struct Zip {
    w: zip::ZipWriter<Cursor<Vec<u8>>>,
}

impl Zip {
    pub fn new() -> Self {
        Zip { w: zip::ZipWriter::new(Cursor::new(Vec::new())) }
    }
    fn opts(stored: bool) -> zip::write::SimpleFileOptions {
        let o = zip::write::SimpleFileOptions::default();
        if stored {
            o.compression_method(zip::CompressionMethod::Stored)
        } else {
            o.compression_method(zip::CompressionMethod::Deflated)
        }
    }
    pub fn stored(&mut self, name: &str, data: &[u8]) -> Result<(), String> {
        self.w.start_file(name, Self::opts(true)).map_err(|e| e.to_string())?;
        self.w.write_all(data).map_err(|e| e.to_string())
    }
    pub fn add(&mut self, name: &str, data: &[u8]) -> Result<(), String> {
        self.w.start_file(name, Self::opts(false)).map_err(|e| e.to_string())?;
        self.w.write_all(data).map_err(|e| e.to_string())
    }
    pub fn finish(self) -> Result<Vec<u8>, String> {
        self.w.finish().map(|c| c.into_inner()).map_err(|e| e.to_string())
    }
}

pub fn is_korean(lang: &str) -> bool {
    lang.to_ascii_lowercase().starts_with("ko")
}

/// A language tag that is never empty.
pub fn lang_or_default(lang: &str) -> String {
    let l = lang.trim();
    if l.is_empty() {
        "en".to_string()
    } else {
        l.to_string()
    }
}

/// Is this a URL (as opposed to a vault-relative path)?
pub fn is_url(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    l.starts_with("http://") || l.starts_with("https://") || l.starts_with("mailto:") || l.starts_with("ftp://")
}
