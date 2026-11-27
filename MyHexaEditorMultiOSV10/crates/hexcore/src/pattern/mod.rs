//! Binary templates: a C-like language describing structures (010 Editor templates, ImHex patterns).
//!
//! CONTRACT
//! `run(src, {source?: "template text", template?: "<builtin id>", offset: 0, maxNodes: 50000}, progress)` →
//!   `{ nodes: [Node], errors: [{ line, col, message }], count }` where
//!   Node = `{ name, type, offset, size, value: "display text", color: "#rrggbb"|null, comment: ""|null, children: [Node]|null }`.
//! `builtins()` → `[{ id, name, ext: [".png"…], description }]`.
//! `builtin_source(id)` → `{ id, source }`.
//!
//! THE LANGUAGE
//! ```text
//! // comments, /* comments */
//! #pragma endian big            // or: endian big;  endian little;   (default little)
//! struct Header {               // union U { … } puts every field at the same offset
//!     char  magic[4];           // char / wchar arrays are text; char name[]; reads up to a 0
//!     be u32 length;            // be / le: byte order of this field
//!     u16   count;
//!     Entry entries[count];     // arrays sized by earlier fields; Entry e[while(!eof())];
//!     u8    data[length - 8];   // byte arrays are one node
//!     if (count > 2) { u32 extra; } else { u16 small; }
//!     u32   crc [[color("#888888"), comment("checksum")]];
//! } [[color("blue")]];
//! enum Kind : u8 { A = 1, B, C = 0x10 };   bitfield Flags { ready : 1; mode : 3; };
//! using Word = u16;  typedef u32 DWORD;
//! Header header;                // top level: from the start offset
//! u32 table @ 0x100;            // @: at an offset (the cursor does not move)
//! let i = 0; while (i < header.count) { i += 1; }   for (let j = 0; j < 4; j++) { … }   break; continue; return;
//! fn pad(n, a) { let r = n % a; if (r == 0) return n; return n + a - r; }   // user functions: own locals,
//!                               // `return expr;`, recursion up to 64 deep; fields declared inside join the caller
//! u8 grid[3][4];                // multi-dimensional: grid/[0] … grid/[2], each row one u8[4] node; grid[1][2]
//! Cell cells[2][count];         // structs too: cells[i][j].field
//! struct Inner { u8 data[parent.size]; };   // parent.field: a field of the enclosing struct (read so far);
//!                               // parent.parent.x, `this`; inside a top-level struct, parent is the top level
//! let n = sizeof(Header);       // a struct's size without reading, when all its fields have fixed sizes
//!                               // (no arrays sized by fields, no if/while); otherwise an error says why
//! ```
//! Types: u8 u16 u24 u32 u48 u64, s8 … s64 (i8 … i64), float/f32, double/f64, f16, bool, char, wchar, uleb128, sleb128;
//! 010 / C names too (uchar byte ushort short uint int ulong long uint64 int64 DWORD WORD BYTE, unsigned char …).
//! Expressions: numbers (12, 0x1F, 0b101, 0o17, 1.5, 'A'), "text", + - * / % & | ^ ~ << >> && || ! == != < <= > >= ?:,
//! a.b, a[i], $ (current offset), Enum::Member.
//! Functions: sizeof(x) addressof(x) endof(x) size()/FileSize() eof()/FEof() pos()/FTell() seek(o)/FSeek(o) skip(n)
//! ReadU8/U16/U24/U32/U64/S8/S16/S32/S64/Float/Double(o) (ReadU32BE/LE …) ReadString(o, n) find(o, "FF D9")
//! ParseInt(text, base) strlen min max abs str hex Warning(text) Error(text).
//! Attributes: [[color("#rrggbb" | "red" | 0xRRGGBB)]] [[comment("…")]] [[name(expr)]] [[hidden]],
//! or 010 style <bgcolor=0xRRGGBB, comment="…">.
//!
//! SCRIPTS (010 Editor "Scripts")
//! `run_script(src, {source, selStart?, selLength?, cursor?, offset?}, progress)` →
//!   `{ edits: [{ op: "write"|"insert"|"delete", offset, data: base64, length }], output: "text", returned: value|null,
//!      errors: [{ line, col, message, warning? }], size: final size, completed: false when an error stopped it }`.
//! The same language (fields are allowed but not needed); `src` is not changed. Edits are in the order made, each
//! offset as the data was at that moment (apply them in order); consecutive writes / inserts are joined.
//! Reads (Read*, find, ReadString, fields, Hash…) see the script's own earlier edits. `return v;` at the top level
//! (or `Exit(v)`) gives `returned`.
//! Script functions: WriteU8/U16/U24/U32/U64/S8…S64/Float/Double(o, v) (byte order from `#pragma endian` /
//! BigEndian() / LittleEndian(); WriteU32BE, WriteU16LE … fixed) WriteBytes(o, "DE AD") WriteString(o, "text"[, zero])
//! InsertBytes(o, count[, fill]) DeleteBytes(o, count) Printf("%d %5x %08X %-4s %.2f %e %g %c %%", …)
//! Print(a, b, …) (joined by spaces, plus a newline) Selection() (.start .length .end) SelectionStart()
//! SelectionLength() Cursor() FileSize() Exit([value]) Assert(cond[, "message"]) Hash("sha256"[, o, length]) → hex
//! Checksum("crc32"[, o, length]) → number FindAll("hex" | "text"[, asText]) → count, FindAt(i) → offset or -1.
//! Limits: 1,000,000 loop iterations, 64 MiB of edit data, 16 MiB of output.
mod eval;
mod lexer;
mod parser;
#[cfg(test)]
mod script_tests;
#[cfg(test)]
mod tests;

use crate::doc::Bytes;
use crate::util::{Args, Progress, CANCELLED};
use serde_json::{json, Value};

/// (id, name, extensions, description, source)
pub const BUILTINS: &[(&str, &str, &[&str], &str, &str)] = &[
    ("png", "PNG image", &[".png"], "Signature and chunks (IHDR, PLTE, IDAT, tEXt, IEND …)", include_str!("builtin/png.hexpat")),
    ("bmp", "BMP image", &[".bmp", ".dib"], "File header, info header, palette and pixels", include_str!("builtin/bmp.hexpat")),
    ("gif", "GIF image", &[".gif"], "Screen descriptor, colour tables, extensions and image blocks", include_str!("builtin/gif.hexpat")),
    ("jpeg", "JPEG image", &[".jpg", ".jpeg", ".jfif"], "Markers and segments (APPn, DQT, SOF, DHT, SOS) and scan data", include_str!("builtin/jpeg.hexpat")),
    ("zip", "ZIP archive", &[".zip", ".jar", ".docx", ".xlsx", ".pptx", ".apk", ".odt"], "Local file headers, central directory and end record", include_str!("builtin/zip.hexpat")),
    ("gzip", "GZIP", &[".gz", ".tgz"], "Header, optional name and comment, compressed data, CRC-32 and size", include_str!("builtin/gzip.hexpat")),
    ("wav", "WAVE audio", &[".wav"], "RIFF header, fmt chunk and data chunks", include_str!("builtin/wav.hexpat")),
    ("elf", "ELF executable", &[".elf", ".so", ".o", ".ko"], "ELF header (32/64-bit, either byte order), program and section headers", include_str!("builtin/elf.hexpat")),
    ("pe", "Windows PE executable", &[".exe", ".dll", ".sys", ".ocx", ".efi"], "DOS header, PE signature, COFF and optional headers, sections", include_str!("builtin/pe.hexpat")),
    ("mbr", "Master boot record", &[".mbr", ".img", ".dd"], "Boot code, four partition entries, signature; GPT header when protective", include_str!("builtin/mbr.hexpat")),
    ("ico", "Windows icon", &[".ico", ".cur"], "Icon directory and images", include_str!("builtin/ico.hexpat")),
    ("tar", "TAR archive", &[".tar"], "512-byte headers (ustar) and file contents", include_str!("builtin/tar.hexpat")),
    ("class", "Java class file", &[".class"], "Magic, versions, constant pool, fields, methods and attributes", include_str!("builtin/class.hexpat")),
    ("sqlite", "SQLite database", &[".sqlite", ".db", ".sqlite3"], "100-byte database header and the first B-tree page header", include_str!("builtin/sqlite.hexpat")),
    ("macho", "Mach-O executable", &[".dylib", ".macho", ".bundle"], "Mach-O header and load commands (segments and sections)", include_str!("builtin/macho.hexpat")),
    ("mp3", "MP3 audio (ID3)", &[".mp3"], "ID3v2 tag and frames, audio data, ID3v1 tag", include_str!("builtin/mp3.hexpat")),
    ("wasm", "WebAssembly module", &[".wasm"], "Magic, version and sections", include_str!("builtin/wasm.hexpat")),
    ("bin", "Raw data", &[".bin"], "The whole data as one node", include_str!("builtin/bin.hexpat")),
];

pub fn builtins() -> Value {
    Value::Array(BUILTINS.iter().map(|(id, name, ext, description, _)| json!({ "id": id, "name": name, "ext": ext, "description": description })).collect())
}

pub fn builtin_source(id: &str) -> Result<Value, String> {
    BUILTINS.iter().find(|b| b.0 == id).map(|b| json!({ "id": id, "source": b.4 })).ok_or_else(|| format!("no template {id}"))
}

pub fn run(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let text: String = match args.get("source").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) {
        Some(s) => s.to_string(),
        None => {
            let id = args.str_or("template", "");
            if id.is_empty() {
                return Err("no template: give `source` or `template`".into());
            }
            BUILTINS.iter().find(|b| b.0 == id).map(|b| b.4.to_string()).ok_or_else(|| format!("no template {id}"))?
        }
    };
    let program = match parser::parse(&text) {
        Ok(p) => p,
        Err(e) => return Ok(json!({ "nodes": [], "errors": [{ "line": e.line, "col": e.col, "message": e.message }], "count": 0 })),
    };
    let offset = args.u64_or("offset", 0).min(src.len());
    let max_nodes = args.u64_or("maxNodes", 50_000).clamp(1, 5_000_000) as usize;
    let mut ctx = eval::Ctx::new(src, &program, offset, max_nodes, progress);
    let failure = ctx.run();
    let mut errors: Vec<Value> = ctx.warnings.iter().map(|((l, c), m)| json!({ "line": l, "col": c, "message": m, "warning": true })).collect();
    match failure {
        Some(eval::Fail::Cancelled) => return Err(CANCELLED.into()),
        Some(eval::Fail::Err((line, col), message)) => errors.push(json!({ "line": line, "col": col, "message": message })),
        Some(eval::Fail::Exit) | None => {}
    }
    Ok(json!({ "nodes": ctx.roots_json(), "errors": errors, "count": ctx.count() }))
}

/// Script mode: runs `args.source` with the script builtins (see the header). Read-only on `src`: the changes
/// come back as `edits`, to apply in order as one undo step.
pub fn run_script(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let text = args.str_or("source", "");
    let program = match parser::parse(text) {
        Ok(p) => p,
        Err(e) => {
            return Ok(json!({
                "edits": [], "output": "", "returned": null, "size": src.len(), "completed": false,
                "errors": [{ "line": e.line, "col": e.col, "message": e.message }],
            }))
        }
    };
    let offset = args.u64_or("offset", 0).min(src.len());
    let max_nodes = args.u64_or("maxNodes", 1_000_000).clamp(1, 5_000_000) as usize;
    let mut ctx = eval::Ctx::new(src, &program, offset, max_nodes, progress);
    ctx.enable_script(args);
    let failure = ctx.run();
    let mut errors: Vec<Value> = ctx.warnings.iter().map(|((l, c), m)| json!({ "line": l, "col": c, "message": m, "warning": true })).collect();
    let mut completed = true;
    match failure {
        Some(eval::Fail::Cancelled) => return Err(CANCELLED.into()),
        Some(eval::Fail::Err((line, col), message)) => {
            completed = false;
            errors.push(json!({ "line": line, "col": col, "message": message }));
        }
        Some(eval::Fail::Exit) | None => {}
    }
    let r = ctx.script_result();
    Ok(json!({ "edits": r.edits, "output": r.output, "returned": r.returned, "errors": errors, "size": r.size, "completed": completed }))
}
