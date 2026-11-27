//! The JSON API of the core. The page calls `Engine::call(method, args)`: on the desktop through the
//! Tauri command `core_call` (src-tauri/src/core.rs, where long read-only work runs on a snapshot with
//! progress), on the web through crates/hexwasm. Offsets and lengths are JSON numbers; byte data is base64.
//!
//! Documents: new · close · info · read · write · insert · delete · replace · fill · undo · redo · history ·
//! gotoHistory · setReadonly · slice · extract.
//! Read-only analysis (`run_readonly`, also on snapshots): search · findAll · hash · inspect · stats · strings ·
//! detect · carve · template · disasm · export · compare.
//! Editing analysis: replaceAll · operation · transform.
//! Lists and helpers: hashList · operations · signatures · templates · templateSource · archs · exportFormats ·
//! encodings · import · encodeValue · evaluate · encode · decode.
use crate::doc::{Bytes, Document};
use crate::util::{b64, no_progress, Args, Progress};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// Largest selection an in-memory operation (transform, operation, slice) accepts.
pub const MAX_IN_MEMORY: u64 = 512 << 20;

#[derive(Default)]
pub struct Engine {
    docs: HashMap<u32, Document>,
    next: u32,
}

/// Methods that only read one document (and may run on a snapshot, off the lock, with progress).
pub const READONLY: &[&str] = &["search", "findAll", "hash", "inspect", "stats", "strings", "detect", "carve", "template", "disasm", "export", "yara", "fsPartitions", "fsInfo", "fsList", "fsFile", "fsRead"];

fn file_arg(args: &Value) -> Value {
    let mut a = args.clone();
    if let (Some(map), Some(file)) = (a.as_object_mut(), args.get("file")) {
        map.insert("id".into(), file.clone());
    }
    a
}

pub fn is_readonly(method: &str) -> bool {
    READONLY.contains(&method)
}

/// Runs a read-only method on a document (or a snapshot of one).
pub fn run_readonly(doc: &Document, method: &str, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let src: &dyn Bytes = doc;
    match method {
        "search" => crate::search::search(src, args, progress),
        "findAll" => crate::search::find_all(src, args, progress),
        "hash" => crate::hash::hash(src, args, progress),
        "inspect" => crate::inspect::inspect(src, args),
        "stats" => crate::stats::stats(src, args, progress),
        "strings" => crate::strings::strings(src, args, progress),
        "detect" => crate::magic::detect(src, args),
        "carve" => crate::magic::carve(src, args, progress),
        "template" => crate::pattern::run(src, args, progress),
        "disasm" => crate::disasm::disasm(src, args),
        "export" => crate::export::export(src, args, progress),
        "yara" => crate::yara::scan(src, args, progress),
        "fsPartitions" => crate::fsys::partitions(src, args),
        "fsInfo" => crate::fsys::info(src, args),
        "fsList" => crate::fsys::list(src, args),
        // `id` names the document here; the file inside the volume comes as `file`.
        "fsFile" => crate::fsys::file(src, &file_arg(args)),
        "fsRead" => crate::fsys::read(src, &file_arg(args)),
        _ => Err(format!("unknown method {method}")),
    }
}

impl Engine {
    pub fn new() -> Self {
        Engine { docs: HashMap::new(), next: 1 }
    }

    /// Adds a document (the desktop backend opens files, disks, processes this way) and returns its id.
    pub fn add(&mut self, doc: Document) -> u32 {
        let id = self.next;
        self.next += 1;
        self.docs.insert(id, doc);
        id
    }

    pub fn doc(&self, id: u32) -> Result<&Document, String> {
        self.docs.get(&id).ok_or_else(|| format!("no document {id}"))
    }
    pub fn doc_mut(&mut self, id: u32) -> Result<&mut Document, String> {
        self.docs.get_mut(&id).ok_or_else(|| format!("no document {id}"))
    }
    pub fn remove(&mut self, id: u32) -> Option<Document> {
        self.docs.remove(&id)
    }
    /// A copy that shares the source and the add buffer: cheap, for work off the lock.
    pub fn snapshot(&self, id: u32) -> Result<Document, String> {
        self.doc(id).cloned()
    }

    pub fn info(&self, id: u32) -> Result<Value, String> {
        let d = self.doc(id)?;
        Ok(json!({
            "id": id, "name": d.name, "len": d.len(), "modified": d.modified(), "canUndo": d.can_undo(), "canRedo": d.can_redo(),
            "version": d.version, "readonly": d.readonly, "resizable": d.resizable(), "kind": d.source.kind(),
            "undoCount": d.history().len(), "redoCount": d.redo_history().len(),
        }))
    }

    fn id(args: &Value) -> Result<u32, String> {
        Ok(args.u64_req("id")? as u32)
    }

    fn edited(&self, id: u32, range: (u64, u64)) -> Result<Value, String> {
        Ok(json!({ "offset": range.0, "length": range.1, "info": self.info(id)? }))
    }

    pub fn call(&mut self, method: &str, args: &Value) -> Result<Value, String> {
        self.call_with(method, args, &mut no_progress())
    }

    pub fn call_with(&mut self, method: &str, args: &Value, progress: &mut Progress) -> Result<Value, String> {
        if is_readonly(method) {
            let doc = self.doc(Self::id(args)?)?;
            return run_readonly(doc, method, args, progress);
        }
        match method {
            // ── documents
            "new" => {
                let mut bytes = args.data("data")?;
                let size = args.u64_or("size", 0);
                if bytes.is_empty() && size > 0 {
                    if size > MAX_IN_MEMORY {
                        return Err(format!("too large: {size}"));
                    }
                    bytes = vec![0; size as usize];
                }
                let doc = Document::from_bytes(bytes, args.str_or("name", "untitled"));
                let id = self.add(doc);
                self.info(id)
            }
            "close" => {
                self.docs.remove(&Self::id(args)?);
                Ok(Value::Null)
            }
            "info" => self.info(Self::id(args)?),
            "read" => {
                let id = Self::id(args)?;
                let d = self.doc(id)?;
                let offset = args.u64_or("offset", 0).min(d.len());
                let length = args.u64_or("length", 4096).min(1 << 22);
                let data = d.read_vec(offset, length)?;
                let n = data.len() as u64;
                let pairs = |v: Vec<(u64, u64)>| v.into_iter().map(|(s, e)| json!([s, e])).collect::<Vec<_>>();
                Ok(json!({ "offset": offset, "data": b64(&data), "modified": pairs(d.modified_ranges(offset, n)), "holes": pairs(d.holes(offset, n)), "len": d.len(), "version": d.version }))
            }
            "slice" => {
                let d = self.doc(Self::id(args)?)?;
                let (o, l) = crate::util::range_of(d, args);
                Ok(json!({ "data": b64(&crate::util::read_range(d, o, l, MAX_IN_MEMORY)?) }))
            }
            "extract" => {
                let d = self.doc(Self::id(args)?)?;
                let (o, l) = crate::util::range_of(d, args);
                let bytes = crate::util::read_range(d, o, l, MAX_IN_MEMORY)?;
                let name = args.str_or("name", "selection").to_string();
                let id = self.add(Document::from_bytes(bytes, name));
                self.info(id)
            }
            "write" | "insert" | "replace" | "delete" => {
                let id = Self::id(args)?;
                let data = args.data("data")?;
                let offset = args.u64_or("offset", 0);
                let merge = args.bool_or("merge", false);
                let kind = args.str_or("kind", method).to_string();
                let d = self.doc_mut(id)?;
                let range = match method {
                    "write" => d.write(offset, &data, &kind, merge)?,
                    "insert" => d.insert(offset, &data, &kind, merge)?,
                    "replace" => d.replace(offset, args.u64_or("length", 0), &data, &kind)?,
                    _ => d.delete(offset, args.u64_or("length", 0))?,
                };
                self.edited(id, range)
            }
            "fill" => {
                let id = Self::id(args)?;
                let d = self.doc_mut(id)?;
                let offset = args.u64_or("offset", 0);
                let length = args.u64_or("length", 0);
                if length > MAX_IN_MEMORY {
                    return Err(format!("too large: {length}"));
                }
                let bytes = fill_bytes(args, length as usize)?;
                let range = if args.bool_or("insert", false) { d.insert(offset, &bytes, "fill", false)? } else { d.write(offset, &bytes, "fill", false)? };
                self.edited(id, range)
            }
            "undo" | "redo" => {
                let id = Self::id(args)?;
                let d = self.doc_mut(id)?;
                let range = if method == "undo" { d.undo() } else { d.redo() };
                Ok(json!({ "range": range.map(|(o, l)| json!([o, l])), "info": self.info(id)? }))
            }
            "history" => {
                let d = self.doc(Self::id(args)?)?;
                let item = |s: &crate::doc::Step| json!({ "kind": s.kind, "offset": s.offset, "length": s.length, "beforeLen": s.before_len, "afterLen": s.after_len });
                Ok(json!({ "undo": d.history().iter().map(item).collect::<Vec<_>>(), "redo": d.redo_history().iter().rev().map(item).collect::<Vec<_>>() }))
            }
            "gotoHistory" => {
                let id = Self::id(args)?;
                self.doc_mut(id)?.goto_history(args.u64_or("depth", 0) as usize);
                self.info(id)
            }
            "setReadonly" => {
                let id = Self::id(args)?;
                self.doc_mut(id)?.readonly = args.bool_or("readonly", true);
                self.info(id)
            }
            "markSaved" => {
                let id = Self::id(args)?;
                self.doc_mut(id)?.mark_saved();
                self.info(id)
            }
            "rename" => {
                let id = Self::id(args)?;
                self.doc_mut(id)?.name = args.str_or("name", "untitled").to_string();
                self.info(id)
            }
            // ── editing analysis
            "replaceAll" => {
                let id = Self::id(args)?;
                let d = self.doc_mut(id)?;
                let count = crate::search::replace_all(d, args, progress)?;
                Ok(json!({ "count": count, "info": self.info(id)? }))
            }
            "operation" | "transform" => {
                let id = Self::id(args)?;
                let d = self.doc(id)?;
                let (o, l) = crate::util::range_of(d, args);
                let input = crate::util::read_range(d, o, l, MAX_IN_MEMORY)?;
                let output = if method == "operation" { crate::ops::operation(&input, args)? } else { crate::ops::transform(&input, args)? };
                if args.str_or("target", "replace") == "new" {
                    let name = args.str_or("name", "output").to_string();
                    let nid = self.add(Document::from_bytes(output, name));
                    return self.info(nid);
                }
                if args.bool_or("preview", false) {
                    return Ok(json!({ "data": b64(&output[..output.len().min(4096)]), "length": output.len() }));
                }
                let d = self.doc_mut(id)?;
                let range = if output.len() as u64 == l { d.write(o, &output, method, false)? } else { d.replace(o, l, &output, method)? };
                self.edited(id, range)
            }
            "compare" => {
                let a = self.doc(args.u64_req("a")? as u32)?;
                let b = self.doc(args.u64_req("b")? as u32)?;
                crate::compare::compare(a, b, args, progress)
            }
            // ── lists and helpers
            "hashList" => Ok(crate::hash::list()),
            "operations" => Ok(crate::ops::list()),
            "signatures" => Ok(crate::magic::signatures()),
            "templates" => Ok(crate::pattern::builtins()),
            "templateSource" => crate::pattern::builtin_source(args.str_or("template", "")),
            "archs" => Ok(crate::disasm::archs()),
            "exportFormats" => Ok(crate::export::formats()),
            "encodings" => Ok(json!(crate::codec::ENCODINGS)),
            "import" => crate::export::import(args),
            "encodeValue" => crate::inspect::encode(args),
            "evaluate" => crate::calc::evaluate(args),
            "yaraCheck" => crate::yara::check(args),
            "encode" => Ok(json!({ "data": b64(&crate::codec::encode(args.str_or("text", ""), args.str_or("encoding", "utf8"))?) })),
            "decode" => Ok(json!({ "text": crate::codec::decode(&args.data("data")?, args.str_or("encoding", "utf8")) })),
            _ => Err(format!("unknown method {method}")),
        }
    }

    /// Adds a document over an existing source (desktop: files, disks, processes).
    pub fn open_source(&mut self, source: Arc<dyn crate::source::Source>, name: &str, readonly: bool) -> u32 {
        let mut doc = Document::new(source, name);
        doc.readonly = readonly;
        self.add(doc)
    }
}

/// The bytes of a fill: `mode` "pattern" (repeat `pattern`), "zero", "random" (seeded by `seed`),
/// "increment" (0, 1, 2 … from `start` by `step`, `width` bytes, `endian`).
pub fn fill_bytes(args: &Value, length: usize) -> Result<Vec<u8>, String> {
    let mut out = vec![0u8; length];
    match args.str_or("mode", "pattern") {
        "zero" => {}
        "random" => {
            let mut x = args.u64_or("seed", 0x9E37_79B9_7F4A_7C15) | 1;
            for b in out.iter_mut() {
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                *b = (x >> 24) as u8;
            }
        }
        "increment" => {
            let width = args.u64_or("width", 1).clamp(1, 8) as usize;
            let big = args.str_or("endian", "le") == "be";
            let mut v = args.u64_or("start", 0);
            let step = args.u64_or("step", 1);
            for chunk in out.chunks_mut(width) {
                let bytes = if big { v.to_be_bytes()[8 - width..].to_vec() } else { v.to_le_bytes()[..width].to_vec() };
                chunk.copy_from_slice(&bytes[..chunk.len()]);
                v = v.wrapping_add(step);
            }
        }
        _ => {
            let pattern = args.data("pattern")?;
            if pattern.is_empty() {
                return Err("empty pattern".into());
            }
            for (i, b) in out.iter_mut().enumerate() {
                *b = pattern[i % pattern.len()];
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn documents_through_json() {
        let mut e = Engine::new();
        let info = e.call("new", &json!({ "name": "a", "data": b64(b"abcdef") })).unwrap();
        let id = info["id"].as_u64().unwrap();
        e.call("write", &json!({ "id": id, "offset": 1, "data": b64(b"XY") })).unwrap();
        let r = e.call("read", &json!({ "id": id, "offset": 0, "length": 10 })).unwrap();
        assert_eq!(crate::util::unb64(r["data"].as_str().unwrap()).unwrap(), b"aXYdef");
        assert_eq!(r["modified"], json!([[1, 3]]));
        e.call("fill", &json!({ "id": id, "offset": 0, "length": 2, "mode": "pattern", "pattern": b64(&[0xFF]) })).unwrap();
        let r = e.call("read", &json!({ "id": id, "offset": 0, "length": 3 })).unwrap();
        assert_eq!(crate::util::unb64(r["data"].as_str().unwrap()).unwrap(), vec![0xFF, 0xFF, b'Y']);
        let h = e.call("history", &json!({ "id": id })).unwrap();
        assert_eq!(h["undo"].as_array().unwrap().len(), 2);
        e.call("undo", &json!({ "id": id })).unwrap();
        e.call("undo", &json!({ "id": id })).unwrap();
        assert_eq!(e.call("info", &json!({ "id": id })).unwrap()["modified"], json!(false));
    }
}
