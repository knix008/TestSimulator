//! The result container shared by the desktop backend and the WebAssembly build:
//!
//!   "SIM1" · u32 JSON length (little endian) · JSON (padded with spaces to 4 bytes) · binary blobs
//!
//! Large arrays travel as blobs; the JSON refers to them as {"$f32": offset, "n": count} (or "$u32"),
//! offsets counted from the start of the blob area and always multiples of 4.

use serde_json::{json, Map, Value};

#[derive(Default)]
pub struct Out {
    pub json: Map<String, Value>,
    blobs: Vec<u8>,
}

impl Out {
    pub fn new() -> Out { Out::default() }

    pub fn set(&mut self, key: &str, v: Value) { self.json.insert(key.to_string(), v); }

    pub fn f32s(&mut self, data: &[f64]) -> Value {
        let offset = self.blobs.len();
        self.blobs.reserve(data.len() * 4);
        for v in data { self.blobs.extend_from_slice(&(*v as f32).to_le_bytes()); }
        json!({ "$f32": offset, "n": data.len() })
    }

    pub fn u32s(&mut self, data: &[u32]) -> Value {
        let offset = self.blobs.len();
        self.blobs.reserve(data.len() * 4);
        for v in data { self.blobs.extend_from_slice(&v.to_le_bytes()); }
        json!({ "$u32": offset, "n": data.len() })
    }

    pub fn finish(self) -> Vec<u8> {
        let mut text = serde_json::to_vec(&Value::Object(self.json)).unwrap_or_else(|_| b"{}".to_vec());
        while text.len() % 4 != 0 { text.push(b' '); }
        let mut out = Vec::with_capacity(8 + text.len() + self.blobs.len());
        out.extend_from_slice(b"SIM1");
        out.extend_from_slice(&(text.len() as u32).to_le_bytes());
        out.extend_from_slice(&text);
        out.extend_from_slice(&self.blobs);
        out
    }
}

/// Reads a container back (tests).
pub fn decode(bytes: &[u8]) -> Option<(Value, Vec<u8>)> {
    if bytes.len() < 8 || &bytes[..4] != b"SIM1" { return None; }
    let n = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    let v: Value = serde_json::from_slice(&bytes[8..8 + n]).ok()?;
    Some((v, bytes[8 + n..].to_vec()))
}

pub fn read_f32(blobs: &[u8], r: &Value) -> Vec<f32> {
    let off = r["$f32"].as_u64().unwrap_or(0) as usize;
    let n = r["n"].as_u64().unwrap_or(0) as usize;
    (0..n).map(|i| f32::from_le_bytes([blobs[off + 4 * i], blobs[off + 4 * i + 1], blobs[off + 4 * i + 2], blobs[off + 4 * i + 3]])).collect()
}
