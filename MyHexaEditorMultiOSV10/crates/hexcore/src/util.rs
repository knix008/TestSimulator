//! Helpers shared by the modules: JSON arguments, base64, progress, reading in chunks.
use crate::doc::Bytes;
use base64::Engine as _;
use serde_json::Value;

/// Progress of a long operation: called with (done, total); returns false to cancel.
pub type Progress<'a> = dyn FnMut(u64, u64) -> bool + 'a;

pub const CANCELLED: &str = "cancelled";

/// A progress callback that never cancels (the web build, tests).
pub fn no_progress() -> impl FnMut(u64, u64) -> bool {
    |_, _| true
}

pub fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn unb64(text: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(text.trim().as_bytes())
        .map_err(|e| format!("base64: {e}"))
}

/// Typed access to the JSON arguments of a call.
pub trait Args {
    fn u64_or(&self, key: &str, fallback: u64) -> u64;
    fn u64_req(&self, key: &str) -> Result<u64, String>;
    fn i64_or(&self, key: &str, fallback: i64) -> i64;
    fn f64_or(&self, key: &str, fallback: f64) -> f64;
    fn str_or<'a>(&'a self, key: &str, fallback: &'a str) -> &'a str;
    fn bool_or(&self, key: &str, fallback: bool) -> bool;
    /// A base64 field as bytes (missing: empty).
    fn data(&self, key: &str) -> Result<Vec<u8>, String>;
}

impl Args for Value {
    fn u64_or(&self, key: &str, fallback: u64) -> u64 {
        match self.get(key) {
            Some(Value::Number(n)) => n.as_u64().or_else(|| n.as_f64().map(|f| if f < 0.0 { 0 } else { f as u64 })).unwrap_or(fallback),
            Some(Value::String(s)) => parse_u64(s).unwrap_or(fallback),
            _ => fallback,
        }
    }
    fn u64_req(&self, key: &str) -> Result<u64, String> {
        match self.get(key) {
            Some(Value::Number(_)) | Some(Value::String(_)) => Ok(self.u64_or(key, 0)),
            _ => Err(format!("missing argument: {key}")),
        }
    }
    fn i64_or(&self, key: &str, fallback: i64) -> i64 {
        match self.get(key) {
            Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).unwrap_or(fallback),
            Some(Value::String(s)) => s.trim().parse().ok().or_else(|| parse_u64(s).map(|v| v as i64)).unwrap_or(fallback),
            _ => fallback,
        }
    }
    fn f64_or(&self, key: &str, fallback: f64) -> f64 {
        match self.get(key) {
            Some(Value::Number(n)) => n.as_f64().unwrap_or(fallback),
            Some(Value::String(s)) => s.trim().parse().unwrap_or(fallback),
            _ => fallback,
        }
    }
    fn str_or<'a>(&'a self, key: &str, fallback: &'a str) -> &'a str {
        self.get(key).and_then(|v| v.as_str()).unwrap_or(fallback)
    }
    fn bool_or(&self, key: &str, fallback: bool) -> bool {
        self.get(key).and_then(|v| v.as_bool()).unwrap_or(fallback)
    }
    fn data(&self, key: &str) -> Result<Vec<u8>, String> {
        match self.get(key).and_then(|v| v.as_str()) {
            Some(text) => unb64(text),
            None => Ok(Vec::new()),
        }
    }
}

/// "123", "0x7B", "7Bh", "0o173", "0b1111011", "$7B".
pub fn parse_u64(text: &str) -> Option<u64> {
    let t = text.trim().replace(['_', ' '], "");
    let lower = t.to_ascii_lowercase();
    if let Some(h) = lower.strip_prefix("0x").or_else(|| lower.strip_prefix('$')) {
        return u64::from_str_radix(h, 16).ok();
    }
    if let Some(h) = lower.strip_suffix('h') {
        return u64::from_str_radix(h, 16).ok();
    }
    if let Some(o) = lower.strip_prefix("0o") {
        return u64::from_str_radix(o, 8).ok();
    }
    if let Some(b) = lower.strip_prefix("0b") {
        return u64::from_str_radix(b, 2).ok();
    }
    lower.parse().ok()
}

/// Calls `f(offset, chunk)` for `[offset, offset + length)` of `src` in pieces of `chunk` bytes, reporting
/// progress. Stops early when `f` returns false.
pub fn for_each_chunk(
    src: &dyn Bytes,
    offset: u64,
    length: u64,
    chunk: usize,
    progress: &mut Progress,
    mut f: impl FnMut(u64, &[u8]) -> bool,
) -> Result<(), String> {
    let end = offset.saturating_add(length).min(src.len());
    let mut pos = offset.min(end);
    let mut buf = vec![0u8; chunk.max(1)];
    while pos < end {
        let n = ((end - pos) as usize).min(buf.len());
        src.read(pos, &mut buf[..n])?;
        if !f(pos, &buf[..n]) {
            break;
        }
        pos += n as u64;
        if !progress(pos - offset, end - offset) {
            return Err(CANCELLED.into());
        }
    }
    Ok(())
}

/// The whole range as one buffer (for operations that need it all at once; refused above `max`).
pub fn read_range(src: &dyn Bytes, offset: u64, length: u64, max: u64) -> Result<Vec<u8>, String> {
    let end = offset.saturating_add(length).min(src.len());
    let start = offset.min(end);
    let n = end - start;
    if n > max {
        return Err(format!("too large for this operation: {n} bytes (at most {max})"));
    }
    let mut buf = vec![0u8; n as usize];
    src.read(start, &mut buf)?;
    Ok(buf)
}

/// `[offset, length)` from the arguments, clamped to the source (no length: to the end).
pub fn range_of(src: &dyn Bytes, args: &Value) -> (u64, u64) {
    let total = src.len();
    let offset = args.u64_or("offset", 0).min(total);
    let length = match args.get("length") {
        Some(Value::Null) | None => total - offset,
        _ => args.u64_or("length", total - offset).min(total - offset),
    };
    (offset, length)
}

pub fn hex_string(bytes: &[u8], upper: bool) -> String {
    let digits: &[u8; 16] = if upper { b"0123456789ABCDEF" } else { b"0123456789abcdef" };
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(digits[(b >> 4) as usize] as char);
        s.push(digits[(b & 15) as usize] as char);
    }
    s
}

/// Hex text ("4D 5A", "4d5a90", "0x4D,0x5A") as bytes; an odd last digit is a low nibble.
pub fn parse_hex(text: &str) -> Result<Vec<u8>, String> {
    let cleaned = text.replace("0x", " ").replace("0X", " ");
    let digits: Vec<u8> = cleaned
        .chars()
        .filter(|c| !c.is_whitespace() && !matches!(c, ',' | ';' | ':' | '-' | '\\' | 'h' | 'H'))
        .map(|c| c.to_digit(16).map(|d| d as u8).ok_or_else(|| format!("not a hex digit: {c}")))
        .collect::<Result<_, _>>()?;
    Ok(digits.chunks(2).map(|p| if p.len() == 2 { (p[0] << 4) | p[1] } else { p[0] }).collect())
}
