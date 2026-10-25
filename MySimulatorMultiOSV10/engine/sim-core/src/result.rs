//! The result of a run and its binary form.
//!
//! Bytes: u32 LE magic "MSIM" (0x4D49534D), u32 LE header length, the header
//! JSON (UTF-8), zero padding to a multiple of 8, then the f64 LE data. Every
//! numeric column and grid axis in the header carries `offset` (in f64 values
//! from the data start) and `length`.

use crate::data::{Dataset, Grid, Table};
use serde_json::{json, Value};

pub const MAGIC: u32 = 0x4D49_534D;

#[derive(Clone, Debug, Default)]
pub struct NodeOutcome {
    pub id: String,
    pub ok: bool,
    pub error: Option<String>,
    pub warnings: Vec<String>,
    pub elapsed_ms: f64,
    pub data: Option<Dataset>,
    /// Not run because an input failed (or disabled with nothing to pass on).
    pub skipped: bool,
}

#[derive(Clone, Debug, Default)]
pub struct RunResult {
    pub ok: bool,
    pub error: Option<String>,
    pub name: String,
    pub elapsed_ms: f64,
    pub nodes: Vec<NodeOutcome>,
}

impl RunResult {
    pub fn node(&self, id: &str) -> Option<&NodeOutcome> {
        self.nodes.iter().find(|n| n.id == id)
    }
}

struct Writer {
    data: Vec<f64>,
}

impl Writer {
    fn put(&mut self, values: &[f64]) -> Value {
        let offset = self.data.len();
        self.data.extend_from_slice(values);
        json!({ "offset": offset, "length": values.len() })
    }

    fn table(&mut self, t: &Table) -> Value {
        let columns: Vec<Value> = t
            .columns
            .iter()
            .map(|c| {
                let mut v = json!({ "name": c.name, "unit": c.unit });
                match &c.labels {
                    Some(labels) => {
                        v["labels"] = json!(labels);
                        v["length"] = json!(labels.len());
                    }
                    None => {
                        let slot = self.put(&c.values);
                        v["offset"] = slot["offset"].clone();
                        v["length"] = slot["length"].clone();
                    }
                }
                v
            })
            .collect();
        json!({ "name": t.name, "x": t.x, "rows": t.rows(), "columns": columns })
    }

    fn grid(&mut self, g: &Grid) -> Value {
        json!({
            "name": g.name, "xLabel": g.x_label, "yLabel": g.y_label, "zLabel": g.z_label,
            "nx": g.x.len(), "ny": g.y.len(),
            "x": self.put(&g.x), "y": self.put(&g.y), "z": self.put(&g.z),
            "xNames": g.x_names, "yNames": g.y_names,
        })
    }
}

fn finite_or_null(v: f64) -> Value {
    if v.is_finite() {
        json!(v)
    } else {
        Value::Null
    }
}

pub fn encode(result: &RunResult) -> Vec<u8> {
    let mut w = Writer { data: Vec::new() };
    let nodes: Vec<Value> = result
        .nodes
        .iter()
        .map(|n| {
            let mut v = json!({
                "id": n.id, "ok": n.ok, "error": n.error, "warnings": n.warnings, "elapsedMs": n.elapsed_ms, "skipped": n.skipped,
            });
            if let Some(d) = &n.data {
                v["tables"] = Value::Array(d.tables.iter().map(|t| w.table(t)).collect());
                v["grids"] = Value::Array(d.grids.iter().map(|g| w.grid(g)).collect());
                v["scalars"] = Value::Array(d.scalars.iter().map(|s| json!({ "name": s.name, "value": finite_or_null(s.value), "unit": s.unit })).collect());
                v["text"] = json!(d.text);
            }
            v
        })
        .collect();
    let header = json!({
        "format": "mysim-result", "version": 1,
        "ok": result.ok, "error": result.error, "name": result.name, "elapsedMs": result.elapsed_ms,
        "nodes": nodes,
    });
    let head = serde_json::to_vec(&header).unwrap_or_else(|_| b"{\"ok\":false,\"error\":\"encoding failed\"}".to_vec());
    let mut out = Vec::with_capacity(8 + head.len() + 8 + w.data.len() * 8);
    out.extend_from_slice(&MAGIC.to_le_bytes());
    out.extend_from_slice(&(head.len() as u32).to_le_bytes());
    out.extend_from_slice(&head);
    while out.len() % 8 != 0 {
        out.push(b' ');
    }
    for v in &w.data {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

/// The header of encoded bytes (tests and tools).
pub fn decode_header(bytes: &[u8]) -> Result<Value, String> {
    if bytes.len() < 8 || u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) != MAGIC {
        return Err("not a MySimulator result".into());
    }
    let len = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as usize;
    serde_json::from_slice(&bytes[8..8 + len]).map_err(|e| e.to_string())
}
