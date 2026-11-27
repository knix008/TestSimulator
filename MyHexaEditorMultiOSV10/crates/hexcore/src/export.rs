//! Export a range as text (dumps, source code) or as encoded data, and import such text back.
//!
//! CONTRACT
//! `export(src, {offset?, length?, format, bytesPerLine: 16, uppercase: true, name: "data", encoding: "cp1252", base: 0}, progress)` →
//!   `{ text }` for text formats or `{ data: base64 }` for binary ones. formats:
//!   hexdump (offset, hex, text), hex (plain pairs), hexSpaced, c, cpp, csharp, java, javascript, python, rust, go, pascal, vb,
//!   asm (db lines), base64, base32, base85 (ascii85), uuencode, intelhex, srec (Motorola S-record), html (coloured dump), rtf,
//!   markdown (table), json (array), binary (raw bytes, data), escaped ("\x4D\x5A").
//!   `base`: the address of the first byte (dump offsets, Intel HEX / S-record addresses). `name`: the array / file name.
//!   `encoding`: the text column of hexdump / html / rtf / markdown (single-byte encodings; others show ASCII).
//!   Text formats accept at most 64 MiB, binary 512 MiB.
//! `import({format, text})` → `{ data: base64, offset (load address: intelhex/srec, else 0), length }`. formats: hex, hexSpaced,
//!   hexdump, base64, base32, base85, uuencode, intelhex, srec, escaped, and every source-code format plus json (any list of
//!   0x.. / $.. / &H.. / ..h / decimal numbers 0–255, or -128…-1, after the "=" or inside the braces). Checksums are verified;
//!   errors name the line. Intel HEX / S-record gaps are filled with 00.
//! `formats()` → `[{ id, kind: "text"|"binary", ext, import: bool }]`.
use crate::doc::Bytes;
use crate::util::{b64, parse_hex, range_of, read_range, unb64, Args, Progress};
use base64::Engine as _;
use serde_json::{json, Value};

const TEXT_MAX: u64 = 64 << 20;
const BINARY_MAX: u64 = 512 << 20;
const IMPORT_MAX: u64 = 512 << 20;

/// (id, kind, extension, importable)
pub const FORMATS: &[(&str, &str, &str, bool)] = &[
    ("hexdump", "text", "txt", true),
    ("hex", "text", "hex", true),
    ("hexSpaced", "text", "txt", true),
    ("c", "text", "c", true),
    ("cpp", "text", "cpp", true),
    ("csharp", "text", "cs", true),
    ("java", "text", "java", true),
    ("javascript", "text", "js", true),
    ("python", "text", "py", true),
    ("rust", "text", "rs", true),
    ("go", "text", "go", true),
    ("pascal", "text", "pas", true),
    ("vb", "text", "vb", true),
    ("asm", "text", "asm", true),
    ("base64", "text", "b64", true),
    ("base32", "text", "b32", true),
    ("base85", "text", "a85", true),
    ("uuencode", "text", "uue", true),
    ("intelhex", "text", "hex", true),
    ("srec", "text", "s19", true),
    ("html", "text", "html", false),
    ("rtf", "text", "rtf", false),
    ("markdown", "text", "md", false),
    ("json", "text", "json", true),
    ("escaped", "text", "txt", true),
    ("binary", "binary", "bin", false),
];

pub fn formats() -> Value {
    Value::Array(FORMATS.iter().map(|(id, kind, ext, import)| json!({ "id": id, "kind": kind, "ext": ext, "import": import })).collect())
}

struct Opts {
    per_line: usize,
    upper: bool,
    name: String,
    encoding: String,
    base: u64,
}

fn ident(name: &str) -> String {
    let mut s: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' }).collect();
    if s.is_empty() {
        s = "data".into();
    }
    if s.starts_with(|c: char| c.is_ascii_digit()) {
        s.insert(0, '_');
    }
    s
}

fn hx(b: u8, upper: bool) -> String {
    if upper { format!("{b:02X}") } else { format!("{b:02x}") }
}

/// The text column character of a byte ('.' when not printable).
fn shown(b: u8, encoding: &str) -> char {
    let c = match encoding {
        "latin1" | "cp1252" | "cp437" | "ebcdic" => crate::codec::decode(&[b], encoding).chars().next().unwrap_or('.'),
        _ => b as char,
    };
    let n = c as u32;
    if n < 0x20 || n == 0x7F || (0x80..0xA0).contains(&n) || c == '\u{fffd}' || (encoding != "latin1" && encoding != "cp1252" && encoding != "cp437" && encoding != "ebcdic" && n > 0x7E) {
        '.'
    } else {
        c
    }
}

fn hexdump(data: &[u8], o: &Opts) -> String {
    let per = o.per_line;
    let end = o.base + data.len() as u64;
    let width = if end > 0xFFFF_FFFF { 16 } else { 8 };
    let mut out = String::with_capacity(data.len() * 4 + 16);
    for (i, line) in data.chunks(per).enumerate() {
        let addr = o.base + (i * per) as u64;
        out.push_str(&if o.upper { format!("{addr:0width$X}") } else { format!("{addr:0width$x}") });
        out.push_str("  ");
        for k in 0..per {
            match line.get(k) {
                Some(&b) => out.push_str(&hx(b, o.upper)),
                None => out.push_str("  "),
            }
            out.push(' ');
            if per >= 16 && k % 8 == 7 && k + 1 < per {
                out.push(' ');
            }
        }
        out.push_str(" |");
        out.extend(line.iter().map(|&b| shown(b, &o.encoding)));
        out.push_str("|\n");
    }
    out
}

fn code_array(data: &[u8], o: &Opts, fmt: &str) -> String {
    let name = ident(&o.name);
    let n = data.len();
    let item = |b: u8| -> String {
        let h = hx(b, o.upper);
        match fmt {
            "pascal" => format!("${h}"),
            "vb" => format!("&H{h}"),
            "java" if b >= 0x80 => format!("(byte) 0x{h}"),
            "csharp" | "c" | "cpp" | "javascript" | "python" | "rust" | "go" | "java" | "asm" => format!("0x{h}"),
            "json" => b.to_string(),
            _ => format!("0x{h}"),
        }
    };
    let body = |indent: &str, sep_end: bool| -> String {
        let lines: Vec<String> = data.chunks(o.per_line).map(|l| format!("{indent}{}", l.iter().map(|&b| item(b)).collect::<Vec<_>>().join(", "))).collect();
        let mut s = lines.join(",\n");
        if sep_end && !s.is_empty() {
            s.push(',');
        }
        s
    };
    match fmt {
        "c" => format!("/* {n} bytes */\nconst unsigned char {name}[{n}] = {{\n{}\n}};\n", body("    ", false)),
        "cpp" => format!("// {n} bytes\n#include <array>\n#include <cstdint>\n\nconstexpr std::array<std::uint8_t, {n}> {name} = {{\n{}\n}};\n", body("    ", false)),
        "csharp" => format!("// {n} bytes\nbyte[] {name} = new byte[] {{\n{}\n}};\n", body("    ", false)),
        "java" => format!("// {n} bytes\nbyte[] {name} = {{\n{}\n}};\n", body("    ", false)),
        "javascript" => format!("// {n} bytes\nconst {name} = new Uint8Array([\n{}\n]);\n", body("  ", false)),
        "python" => format!("# {n} bytes\n{name} = bytes([\n{}\n])\n", body("    ", true)),
        "rust" => format!("// {n} bytes\npub const {}: [u8; {n}] = [\n{}\n];\n", name.to_uppercase(), body("    ", true)),
        "go" => format!("// {n} bytes\nvar {name} = []byte{{\n{}\n}}\n", body("\t", true)),
        "pascal" => format!("(* {n} bytes *)\nconst\n  {name}: array[0..{}] of Byte = (\n{}\n  );\n", n.saturating_sub(1), body("    ", false)),
        "vb" => format!("' {n} bytes\nDim {name} As Byte() = {{\n{}\n}}\n", body("    ", false).replace(",\n", ", _\n")),
        "json" => format!("[{}]\n", data.iter().map(|b| b.to_string()).collect::<Vec<_>>().join(", ")),
        "asm" => {
            let mut s = format!("; {n} bytes\n{name}:\n");
            for line in data.chunks(o.per_line) {
                s.push_str(&format!("    db {}\n", line.iter().map(|&b| item(b)).collect::<Vec<_>>().join(", ")));
            }
            s
        }
        _ => String::new(),
    }
}

const B32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

fn base32(data: &[u8]) -> String {
    let mut out = String::new();
    for chunk in data.chunks(5) {
        let mut buf = [0u8; 5];
        buf[..chunk.len()].copy_from_slice(chunk);
        let v = buf.iter().fold(0u64, |acc, &b| (acc << 8) | b as u64);
        let chars = [2, 4, 5, 7, 8][chunk.len() - 1];
        for i in 0..8 {
            if i < chars {
                out.push(B32[((v >> (35 - 5 * i)) & 31) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

fn unbase32(text: &str) -> Result<Vec<u8>, String> {
    let mut bits = 0u64;
    let mut n = 0u32;
    let mut out = Vec::new();
    for c in text.chars().filter(|c| !c.is_whitespace() && *c != '=') {
        let v = B32.iter().position(|&x| x as char == c.to_ascii_uppercase()).ok_or_else(|| format!("not Base32: {c}"))?;
        bits = (bits << 5) | v as u64;
        n += 5;
        if n >= 8 {
            n -= 8;
            out.push((bits >> n) as u8);
            bits &= (1 << n) - 1;
        }
    }
    Ok(out)
}

fn base85(data: &[u8]) -> String {
    let mut out = String::from("<~");
    for chunk in data.chunks(4) {
        let mut buf = [0u8; 4];
        buf[..chunk.len()].copy_from_slice(chunk);
        let v = u32::from_be_bytes(buf);
        if v == 0 && chunk.len() == 4 {
            out.push('z');
            continue;
        }
        let mut digits = [0u8; 5];
        let mut x = v;
        for d in digits.iter_mut().rev() {
            *d = (x % 85) as u8 + b'!';
            x /= 85;
        }
        out.extend(digits[..chunk.len() + 1].iter().map(|&d| d as char));
    }
    out.push_str("~>");
    // wrap at 76 columns
    let chars: Vec<char> = out.chars().collect();
    chars.chunks(76).map(|c| c.iter().collect::<String>()).collect::<Vec<_>>().join("\n")
}

fn unbase85(text: &str) -> Result<Vec<u8>, String> {
    let mut t: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    if let Some(s) = t.strip_prefix("<~") {
        t = s.to_string();
    }
    if let Some(s) = t.strip_suffix("~>") {
        t = s.to_string();
    }
    let mut out = Vec::new();
    let mut group: Vec<u8> = Vec::new();
    let flush = |group: &[u8], out: &mut Vec<u8>, n: usize| -> Result<(), String> {
        let mut digits = [b'u'; 5];
        digits[..group.len()].copy_from_slice(group);
        let mut v: u64 = 0;
        for &d in &digits {
            v = v * 85 + (d - b'!') as u64;
        }
        if v > u32::MAX as u64 {
            return Err("Ascii85 group out of range".into());
        }
        out.extend_from_slice(&(v as u32).to_be_bytes()[..n]);
        Ok(())
    };
    for c in t.bytes() {
        match c {
            b'z' if group.is_empty() => out.extend_from_slice(&[0; 4]),
            b'!'..=b'u' => {
                group.push(c);
                if group.len() == 5 {
                    flush(&group, &mut out, 4)?;
                    group.clear();
                }
            }
            _ => return Err(format!("not Ascii85: {}", c as char)),
        }
    }
    if group.len() == 1 {
        return Err("Ascii85: a lone last character".into());
    }
    if !group.is_empty() {
        let n = group.len() - 1;
        flush(&group, &mut out, n)?;
    }
    Ok(out)
}

fn uu_char(v: u8) -> char {
    if v == 0 { '`' } else { (v + 32) as char }
}

fn uuencode(data: &[u8], name: &str) -> String {
    let mut out = format!("begin 644 {}\n", if name.is_empty() { "data" } else { name });
    for line in data.chunks(45) {
        out.push(uu_char(line.len() as u8));
        for g in line.chunks(3) {
            let mut b = [0u8; 3];
            b[..g.len()].copy_from_slice(g);
            for v in [b[0] >> 2, ((b[0] & 3) << 4) | (b[1] >> 4), ((b[1] & 15) << 2) | (b[2] >> 6), b[2] & 63] {
                out.push(uu_char(v));
            }
        }
        out.push('\n');
    }
    out.push_str("`\nend\n");
    out
}

fn unuuencode(text: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut started = false;
    for (i, raw) in text.lines().enumerate() {
        let line = raw.trim_end_matches('\r');
        if !started {
            if line.starts_with("begin") {
                started = true;
            }
            continue;
        }
        if line == "end" {
            return Ok(out);
        }
        let bytes = line.as_bytes();
        let Some(&first) = bytes.first() else { continue };
        let n = ((first.wrapping_sub(32)) & 63) as usize;
        if n == 0 {
            continue;
        }
        let vals: Vec<u8> = bytes[1..].iter().map(|&c| c.wrapping_sub(32) & 63).collect();
        let mut decoded = Vec::new();
        for g in vals.chunks(4) {
            if g.len() < 4 {
                break;
            }
            decoded.extend_from_slice(&[(g[0] << 2) | (g[1] >> 4), (g[1] << 4) | (g[2] >> 2), (g[2] << 6) | g[3]]);
        }
        if decoded.len() < n {
            return Err(format!("uuencode: line {} is cut short", i + 1));
        }
        out.extend_from_slice(&decoded[..n]);
    }
    if started { Ok(out) } else { Err("uuencode: no \"begin\" line".into()) }
}

fn record_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02X}")).collect()
}

fn intel_hex(data: &[u8], o: &Opts) -> Result<String, String> {
    if o.base + data.len() as u64 > 1 << 32 {
        return Err("Intel HEX addresses end at 4 GiB".into());
    }
    let per = o.per_line.clamp(1, 255);
    let mut out = String::new();
    let mut upper = u64::MAX;
    let mut pos = 0usize;
    let rec = |out: &mut String, addr: u16, kind: u8, payload: &[u8]| {
        let mut r = vec![payload.len() as u8, (addr >> 8) as u8, addr as u8, kind];
        r.extend_from_slice(payload);
        let sum = r.iter().fold(0u8, |s, &b| s.wrapping_add(b));
        r.push(sum.wrapping_neg());
        out.push(':');
        out.push_str(&record_hex(&r));
        out.push('\n');
    };
    while pos < data.len() {
        let addr = o.base + pos as u64;
        if addr >> 16 != upper {
            upper = addr >> 16;
            if upper != 0 || pos != 0 {
                rec(&mut out, 0, 4, &[(upper >> 8) as u8, upper as u8]);
            }
        }
        let room = 0x10000 - (addr & 0xFFFF) as usize;
        let n = per.min(room).min(data.len() - pos);
        rec(&mut out, addr as u16, 0, &data[pos..pos + n]);
        pos += n;
    }
    rec(&mut out, 0, 1, &[]);
    Ok(out)
}

fn srec(data: &[u8], o: &Opts) -> Result<String, String> {
    let last = o.base + data.len().saturating_sub(1) as u64;
    if last > 0xFFFF_FFFF {
        return Err("S-record addresses end at 4 GiB".into());
    }
    let (data_t, end_t, asize) = if last <= 0xFFFF { (1, 9, 2) } else if last <= 0xFF_FFFF { (2, 8, 3) } else { (3, 7, 4) };
    let per = o.per_line.clamp(1, 250);
    let mut out = String::new();
    let rec = |out: &mut String, t: u8, addr: u64, asize: usize, payload: &[u8]| {
        let mut r = vec![(asize + payload.len() + 1) as u8];
        r.extend_from_slice(&addr.to_be_bytes()[8 - asize..]);
        r.extend_from_slice(payload);
        let sum = r.iter().fold(0u8, |s, &b| s.wrapping_add(b));
        r.push(!sum);
        out.push_str(&format!("S{t}{}\n", record_hex(&r)));
    };
    let header: Vec<u8> = o.name.bytes().take(64).collect();
    rec(&mut out, 0, 0, 2, &header);
    let mut count = 0u64;
    for (i, line) in data.chunks(per).enumerate() {
        rec(&mut out, data_t, o.base + (i * per) as u64, asize, line);
        count += 1;
    }
    if count <= 0xFFFF {
        rec(&mut out, 5, count, 2, &[]);
    } else if count <= 0xFF_FFFF {
        rec(&mut out, 6, count, 3, &[]);
    }
    rec(&mut out, end_t, o.base, asize, &[]);
    Ok(out)
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn html(data: &[u8], o: &Opts) -> String {
    let mut body = String::new();
    let per = o.per_line;
    for (i, line) in data.chunks(per).enumerate() {
        let addr = o.base + (i * per) as u64;
        body.push_str(&format!("<span class=\"o\">{}</span>  ", if o.upper { format!("{addr:08X}") } else { format!("{addr:08x}") }));
        for k in 0..per {
            match line.get(k) {
                Some(&b) => body.push_str(&format!("<span class=\"{}\">{}</span> ", if b == 0 { "z" } else { "h" }, hx(b, o.upper))),
                None => body.push_str("   "),
            }
        }
        let text: String = line.iter().map(|&b| shown(b, &o.encoding)).collect();
        body.push_str(&format!(" <span class=\"t\">{}</span>\n", escape_html(&text)));
    }
    let title = escape_html(if o.name.is_empty() { "data" } else { &o.name });
    format!(
        "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>{title}</title>\n<style>body{{background:#fff;color:#222;font:13px/1.45 Consolas,'Courier New',monospace}}h1{{font:600 15px system-ui,sans-serif}}.o{{color:#888}}.h{{color:#1a4fb5}}.z{{color:#bbb}}.t{{color:#2b7a3d}}</style></head>\n<body><h1>{title} — {} bytes</h1>\n<pre>\n{body}</pre></body></html>\n",
        data.len()
    )
}

fn rtf(data: &[u8], o: &Opts) -> String {
    let dump = hexdump(data, o);
    let mut body = String::new();
    for line in dump.lines() {
        for c in line.chars() {
            match c {
                '\\' | '{' | '}' => {
                    body.push('\\');
                    body.push(c);
                }
                c if (c as u32) < 128 => body.push(c),
                c => body.push_str(&format!("\\u{}?", c as u32 as i16)),
            }
        }
        body.push_str("\\par\n");
    }
    format!("{{\\rtf1\\ansi\\deff0{{\\fonttbl{{\\f0\\fmodern Courier New;}}}}\\f0\\fs18\n{body}}}\n")
}

fn markdown(data: &[u8], o: &Opts) -> String {
    let per = o.per_line;
    let mut s = String::from("| Offset |");
    for k in 0..per {
        s.push_str(&format!(" {} |", hx(k as u8, o.upper)));
    }
    s.push_str(" Text |\n|---|");
    for _ in 0..per {
        s.push_str("---|");
    }
    s.push_str("---|\n");
    for (i, line) in data.chunks(per).enumerate() {
        let addr = o.base + (i * per) as u64;
        s.push_str(&format!("| {} |", if o.upper { format!("{addr:08X}") } else { format!("{addr:08x}") }));
        for k in 0..per {
            match line.get(k) {
                Some(&b) => s.push_str(&format!(" {} |", hx(b, o.upper))),
                None => s.push_str("  |"),
            }
        }
        let text: String = line.iter().map(|&b| shown(b, &o.encoding)).collect();
        s.push_str(&format!(" `{}` |\n", text.replace('`', "'").replace('|', "\\|")));
    }
    s
}

pub fn export(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let (offset, length) = range_of(src, args);
    let format = args.str_or("format", "hexdump");
    let info = FORMATS.iter().find(|f| f.0 == format).ok_or_else(|| format!("unknown format {format}"))?;
    let max = if info.1 == "binary" { BINARY_MAX } else { TEXT_MAX };
    if length > max {
        return Err(format!("{format}: at most {} MiB can be exported this way ({} MiB selected)", max >> 20, length >> 20));
    }
    let data = read_range(src, offset, length, max)?;
    progress(length / 2, length.max(1));
    let o = Opts {
        per_line: args.u64_or("bytesPerLine", 16).clamp(1, 256) as usize,
        upper: args.bool_or("uppercase", true),
        name: args.str_or("name", "data").to_string(),
        encoding: args.str_or("encoding", "cp1252").to_string(),
        base: args.u64_or("base", 0),
    };
    let text = match format {
        "binary" => return Ok(json!({ "data": b64(&data), "length": data.len() })),
        "hexdump" => hexdump(&data, &o),
        "hex" => {
            let all = data.iter().map(|&b| hx(b, o.upper)).collect::<String>();
            let chars: Vec<char> = all.chars().collect();
            chars.chunks(o.per_line * 2).map(|c| c.iter().collect::<String>()).collect::<Vec<_>>().join("\n")
        }
        "hexSpaced" => data.chunks(o.per_line).map(|l| l.iter().map(|&b| hx(b, o.upper)).collect::<Vec<_>>().join(" ")).collect::<Vec<_>>().join("\n"),
        "c" | "cpp" | "csharp" | "java" | "javascript" | "python" | "rust" | "go" | "pascal" | "vb" | "asm" | "json" => code_array(&data, &o, format),
        "base64" => {
            let all = base64::engine::general_purpose::STANDARD.encode(&data);
            all.as_bytes().chunks(76).map(|c| String::from_utf8_lossy(c).into_owned()).collect::<Vec<_>>().join("\n")
        }
        "base32" => base32(&data),
        "base85" => base85(&data),
        "uuencode" => uuencode(&data, &o.name),
        "intelhex" => intel_hex(&data, &o)?,
        "srec" => srec(&data, &o)?,
        "html" => html(&data, &o),
        "rtf" => rtf(&data, &o),
        "markdown" => markdown(&data, &o),
        "escaped" => data.iter().map(|&b| format!("\\x{}", hx(b, o.upper))).collect(),
        _ => unreachable!(),
    };
    progress(length, length.max(1));
    Ok(json!({ "text": text, "length": data.len() }))
}

// ───────────── import

fn parse_numbers(text: &str) -> Result<Vec<u8>, String> {
    // The list: inside the braces, else after the "=", else everything.
    let body = match (text.find('{'), text.rfind('}')) {
        (Some(a), Some(b)) if b > a => &text[a + 1..b],
        _ => match text.find('=') {
            Some(i) => &text[i + 1..],
            None => text,
        },
    };
    // Comments out.
    let mut clean = String::new();
    for line in body.lines() {
        let line = line.split("//").next().unwrap_or("");
        let line = if line.trim_start().starts_with('#') || line.trim_start().starts_with(';') || line.trim_start().starts_with('\'') { "" } else { line };
        clean.push_str(line);
        clean.push('\n');
    }
    let mut out = Vec::new();
    let chars: Vec<char> = clean.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let token_char = |c: char| c.is_ascii_alphanumeric() || c == '$' || c == '&' || c == '_';
        if token_char(c) {
            let start = i;
            while i < chars.len() && token_char(chars[i]) {
                i += 1;
            }
            let tok: String = chars[start..i].iter().collect();
            let neg = start > 0 && chars[start - 1] == '-';
            let lower = tok.to_ascii_lowercase().replace('_', "");
            let value = if let Some(h) = lower.strip_prefix("0x").or_else(|| lower.strip_prefix('$')).or_else(|| lower.strip_prefix("&h")) {
                Some(i64::from_str_radix(h, 16))
            } else if lower.starts_with(|c: char| c.is_ascii_digit()) {
                Some(match lower.strip_suffix('h') {
                    Some(h) => i64::from_str_radix(h, 16),
                    None => lower.trim_end_matches("u8").parse::<i64>(),
                })
            } else {
                None
            };
            if let Some(v) = value {
                let v = v.map_err(|_| format!("not a number: {tok}"))?;
                let v = if neg { -v } else { v };
                let b = match v {
                    0..=255 => v as u8,
                    -128..=-1 => (v + 256) as u8,
                    _ => return Err(format!("not a byte: {v}")),
                };
                out.push(b);
            }
        } else {
            i += 1;
        }
    }
    Ok(out)
}

fn parse_hexdump(text: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    for line in text.lines() {
        let part = line.split('|').next().unwrap_or("");
        let mut tokens = part.split_whitespace();
        let Some(first) = tokens.next() else { continue };
        let offset_like = first.trim_end_matches(':');
        if offset_like.len() <= 2 || !offset_like.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(format!("not a hex dump line: {line}"));
        }
        for t in tokens {
            if t.len() == 2 && t.chars().all(|c| c.is_ascii_hexdigit()) {
                out.push(u8::from_str_radix(t, 16).unwrap());
            } else {
                break;
            }
        }
    }
    Ok(out)
}

fn parse_escaped(text: &str) -> Result<Vec<u8>, String> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 1 < bytes.len() {
            match bytes[i + 1] {
                b'x' | b'X' => {
                    let h = text.get(i + 2..i + 4).ok_or("cut-short \\x escape")?;
                    out.push(u8::from_str_radix(h, 16).map_err(|_| format!("bad escape \\x{h}"))?);
                    i += 4;
                }
                b'n' => { out.push(b'\n'); i += 2; }
                b'r' => { out.push(b'\r'); i += 2; }
                b't' => { out.push(b'\t'); i += 2; }
                b'0' => { out.push(0); i += 2; }
                b'\\' => { out.push(b'\\'); i += 2; }
                other => { out.push(other); i += 2; }
            }
        } else if bytes[i] == b'"' || bytes[i] == b'\'' || bytes[i] == b'\n' || bytes[i] == b'\r' {
            i += 1;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    Ok(out)
}

/// Pieces at addresses → one buffer from the lowest address (gaps 00).
fn assemble(pieces: Vec<(u64, Vec<u8>)>) -> Result<(u64, Vec<u8>), String> {
    let lo = pieces.iter().map(|p| p.0).min().unwrap_or(0);
    let hi = pieces.iter().map(|p| p.0 + p.1.len() as u64).max().unwrap_or(0);
    if hi - lo > IMPORT_MAX {
        return Err(format!("the data spans {} MiB (at most {} MiB)", (hi - lo) >> 20, IMPORT_MAX >> 20));
    }
    let mut out = vec![0u8; (hi - lo) as usize];
    for (addr, bytes) in pieces {
        let s = (addr - lo) as usize;
        out[s..s + bytes.len()].copy_from_slice(&bytes);
    }
    Ok((lo, out))
}

fn record_bytes(hex: &str, line: usize) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("line {line}: not hex"));
    }
    parse_hex(hex)
}

fn parse_intel_hex(text: &str) -> Result<(u64, Vec<u8>), String> {
    let mut pieces = Vec::new();
    let mut upper = 0u64;
    for (i, raw) in text.lines().enumerate() {
        let line_no = i + 1;
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let hex = line.strip_prefix(':').ok_or_else(|| format!("line {line_no}: a record starts with ':'"))?;
        let r = record_bytes(hex, line_no)?;
        if r.len() < 5 || r.len() != r[0] as usize + 5 {
            return Err(format!("line {line_no}: wrong record length"));
        }
        if r.iter().fold(0u8, |s, &b| s.wrapping_add(b)) != 0 {
            return Err(format!("line {line_no}: checksum does not match"));
        }
        let addr = ((r[1] as u64) << 8) | r[2] as u64;
        let payload = &r[4..r.len() - 1];
        match r[3] {
            0 => pieces.push((upper + addr, payload.to_vec())),
            1 => break,
            2 if payload.len() == 2 => upper = (((payload[0] as u64) << 8) | payload[1] as u64) << 4,
            4 if payload.len() == 2 => upper = (((payload[0] as u64) << 8) | payload[1] as u64) << 16,
            3 | 5 => {}
            t => return Err(format!("line {line_no}: unknown record type {t:02X}")),
        }
    }
    assemble(pieces)
}

fn parse_srec(text: &str) -> Result<(u64, Vec<u8>), String> {
    let mut pieces = Vec::new();
    for (i, raw) in text.lines().enumerate() {
        let line_no = i + 1;
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let mut chars = line.chars();
        if chars.next().map(|c| c.to_ascii_uppercase()) != Some('S') {
            return Err(format!("line {line_no}: a record starts with 'S'"));
        }
        let t = chars.next().and_then(|c| c.to_digit(10)).ok_or_else(|| format!("line {line_no}: no record type"))?;
        let r = record_bytes(&line[2..], line_no)?;
        if r.is_empty() || r.len() != r[0] as usize + 1 {
            return Err(format!("line {line_no}: wrong record length"));
        }
        if r.iter().fold(0u8, |s, &b| s.wrapping_add(b)) != 0xFF {
            return Err(format!("line {line_no}: checksum does not match"));
        }
        let asize = match t {
            1 | 9 | 0 | 5 => 2,
            2 | 8 | 6 => 3,
            3 | 7 => 4,
            _ => return Err(format!("line {line_no}: unknown record type S{t}")),
        };
        if r.len() < 2 + asize {
            return Err(format!("line {line_no}: record is cut short"));
        }
        if matches!(t, 1..=3) {
            let addr = r[1..1 + asize].iter().fold(0u64, |a, &b| (a << 8) | b as u64);
            pieces.push((addr, r[1 + asize..r.len() - 1].to_vec()));
        }
    }
    assemble(pieces)
}

pub fn import(args: &Value) -> Result<Value, String> {
    let format = args.str_or("format", "hex");
    let text = args.str_or("text", "");
    let (offset, data) = match format {
        "hex" | "hexSpaced" => (0, parse_hex(text)?),
        "hexdump" => (0, parse_hexdump(text)?),
        "base64" => (0, unb64(&text.chars().filter(|c| !c.is_whitespace()).collect::<String>())?),
        "base32" => (0, unbase32(text)?),
        "base85" => (0, unbase85(text)?),
        "uuencode" => (0, unuuencode(text)?),
        "intelhex" => parse_intel_hex(text)?,
        "srec" => parse_srec(text)?,
        "escaped" => (0, parse_escaped(text)?),
        "c" | "cpp" | "csharp" | "java" | "javascript" | "python" | "rust" | "go" | "pascal" | "vb" | "asm" | "json" => (0, parse_numbers(text)?),
        other => return Err(format!("{other} cannot be imported")),
    };
    Ok(json!({ "data": b64(&data), "offset": offset, "length": data.len() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::no_progress;

    fn exp(data: &[u8], a: Value) -> String {
        export(&data.to_vec(), &a, &mut no_progress()).unwrap()["text"].as_str().unwrap().to_string()
    }

    #[test]
    fn round_trips() {
        let data: Vec<u8> = (0..700u32).map(|i| (i * 37 % 256) as u8).collect();
        for (id, kind, _, importable) in FORMATS {
            if *kind != "text" {
                continue;
            }
            let text = exp(&data, json!({ "format": id, "name": "blob", "bytesPerLine": 16 }));
            assert!(!text.is_empty(), "{id}");
            if *importable {
                let r = import(&json!({ "format": id, "text": text })).unwrap_or_else(|e| panic!("{id}: {e}\n{text}"));
                assert_eq!(unb64(r["data"].as_str().unwrap()).unwrap(), data, "{id}");
            }
        }
    }

    #[test]
    fn addressed_formats() {
        let data: Vec<u8> = (0..300u32).map(|i| i as u8).collect();
        for id in ["intelhex", "srec"] {
            for base in [0u64, 0xFFF0, 0x0012_3450] {
                let text = exp(&data, json!({ "format": id, "base": base, "bytesPerLine": 32 }));
                let r = import(&json!({ "format": id, "text": text })).unwrap();
                assert_eq!(r["offset"], json!(base), "{id} {base:x}");
                assert_eq!(unb64(r["data"].as_str().unwrap()).unwrap(), data);
            }
        }
        let text = exp(&[1, 2], json!({ "format": "intelhex" }));
        assert_eq!(text, ":020000000102FB\n:00000001FF\n");
        let bad = text.replace("FB", "FC");
        assert!(import(&json!({ "format": "intelhex", "text": bad })).unwrap_err().contains("line 1"));
        assert_eq!(exp(b"Man ", json!({ "format": "base85" })), "<~9jqo^~>");
        assert_eq!(exp(b"foobar", json!({ "format": "base32" })), "MZXW6YTBOI======");
        assert!(exp(b"MZ", json!({ "format": "hexdump" })).starts_with("00000000  4D 5A"));
        assert_eq!(exp(b"MZ", json!({ "format": "escaped" })), "\\x4D\\x5A");
        let html = exp(b"<a>", json!({ "format": "html" }));
        assert!(html.contains("&lt;a&gt;"));
        let r = export(&b"xyz".to_vec(), &json!({ "format": "binary", "offset": 1 }), &mut no_progress()).unwrap();
        assert_eq!(unb64(r["data"].as_str().unwrap()).unwrap(), b"yz");
    }
}
