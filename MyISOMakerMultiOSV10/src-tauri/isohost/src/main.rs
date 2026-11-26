//! `isomaker-host`: the engine over stdin/stdout, one JSON object per line (what the tests use):
//!
//!   in    { t:'req', id, m, a }       m = channel, a = argument list
//!   out   { t:'res', id, ok, v | e }
//!         { t:'emit', ch, p }         an event (job:progress, pkg:progress)
//!         { t:'ready' }               once, at start
//!
//! Each request runs on its own thread (iso:cancel must get through while a job runs). The
//! host ends when stdin closes. Folders come from ISOMAKER_USER_DATA and ISOMAKER_TOOLS_DIR.

use isomaker_host::{Config, Host};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::sync::{Arc, Mutex};

/// Test-only looks into a SquashFS (the program has no such calls):
///   squashfs:inspect (file, offset) → { compression, inodeCount, entries: [{ path, kind, size, mode, target }] }
///   squashfs:read (file, offset, path) → the file's bytes as hex
fn inspect(m: &str, a: &[Value]) -> Result<Value, String> {
    use isomaker_host::squashfs::Squashfs;
    let file = a.first().and_then(Value::as_str).ok_or("file")?;
    let offset = a.get(1).and_then(Value::as_u64).unwrap_or(0);
    let mut sq = Squashfs::open(std::path::Path::new(file), offset).map_err(|e| e.to_string())?;
    if m == "squashfs:read" {
        let rel = a.get(2).and_then(Value::as_str).ok_or("path")?;
        let data = sq.read_file(rel).map_err(|e| e.to_string())?;
        return Ok(Value::String(data.iter().map(|b| format!("{b:02x}")).collect()));
    }
    let entries: Vec<Value> = sq
        .list()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|e| json!({ "path": e.path, "kind": e.kind, "size": e.size, "mode": e.mode, "target": e.target }))
        .collect();
    Ok(json!({ "compression": sq.superblock.compression, "inodeCount": sq.superblock.inode_count, "entries": entries }))
}

fn main() {
    let out = Arc::new(Mutex::new(std::io::stdout()));
    let write = {
        let out = out.clone();
        move |v: Value| {
            let mut o = out.lock().unwrap();
            let _ = writeln!(o, "{v}");
            let _ = o.flush();
        }
    };
    let w = write.clone();
    let host = Host::new(Config::from_env(), Arc::new(move |ch: &str, p: Value| w(json!({ "t": "emit", "ch": ch, "p": p }))));
    write(json!({ "t": "ready" }));
    let mut threads = Vec::new();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            eprintln!("[host] bad line {line}");
            continue;
        };
        if msg["t"] != "req" {
            continue;
        }
        let (host, write) = (host.clone(), write.clone());
        threads.push(std::thread::spawn(move || {
            let id = msg["id"].clone();
            let m = msg["m"].as_str().unwrap_or_default().to_string();
            let args: Vec<Value> = match &msg["a"] {
                Value::Array(a) => a.clone(),
                Value::Null => Vec::new(),
                other => vec![other.clone()],
            };
            let reply = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match m.as_str() {
                "squashfs:inspect" | "squashfs:read" => inspect(&m, &args),
                _ => host.call(&m, &args),
            })) {
                Ok(Ok(v)) => json!({ "t": "res", "id": id, "ok": true, "v": v }),
                Ok(Err(e)) => json!({ "t": "res", "id": id, "ok": false, "e": e }),
                Err(_) => json!({ "t": "res", "id": id, "ok": false, "e": format!("{m} crashed") }),
            };
            write(reply);
        }));
        threads.retain(|t| !t.is_finished());
    }
    host.shutdown();
    for t in threads {
        let _ = t.join();
    }
    host.shutdown();
}
