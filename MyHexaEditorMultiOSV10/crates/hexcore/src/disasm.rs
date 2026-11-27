//! Disassembler.
//!
//! CONTRACT
//! `disasm(src, {offset, length: 4096, arch: "x86-16"|"x86-32"|"x86-64"|"arm32"|"thumb"|"arm64", syntax: "intel"|"nasm"|"gas"|"masm",
//!   base: <address of offset, default = offset>, max: 2000})` →
//!   `{ items: [{ offset, address, length, bytes: "hex", mnemonic, operands, text }], next: <offset after the last>, arch, syntax }`
//!   Undecodable bytes become one-byte items with mnemonic "db" (operands "0xNN"). `syntax` only applies to x86
//!   (ARM always prints its own assembler syntax). x86 uses iced-x86, ARM yaxpeax-arm (ARMv7 A32, Thumb/Thumb-2, AArch64).
//! `archs()` → `[{ id, name, syntaxes: [..] }]`.
use crate::doc::Bytes;
use crate::util::{hex_string, Args};
use serde_json::{json, Value};

const X86_SYNTAXES: &[&str] = &["intel", "nasm", "gas", "masm"];

pub fn archs() -> Value {
    json!([
        { "id": "x86-16", "name": "x86 16-bit (8086, real mode)", "syntaxes": X86_SYNTAXES },
        { "id": "x86-32", "name": "x86 32-bit (IA-32)", "syntaxes": X86_SYNTAXES },
        { "id": "x86-64", "name": "x86-64 (AMD64)", "syntaxes": X86_SYNTAXES },
        { "id": "arm32", "name": "ARM 32-bit (ARMv7 A32)", "syntaxes": ["arm"] },
        { "id": "thumb", "name": "ARM Thumb / Thumb-2", "syntaxes": ["arm"] },
        { "id": "arm64", "name": "ARM 64-bit (AArch64)", "syntaxes": ["arm"] },
    ])
}

struct Item {
    offset: u64,
    address: u64,
    length: usize,
    mnemonic: String,
    operands: String,
}

fn db(offset: u64, address: u64, byte: u8) -> Item {
    Item { offset, address, length: 1, mnemonic: "db".into(), operands: format!("0x{byte:02X}") }
}

fn x86(bytes: &[u8], offset: u64, base: u64, bitness: u32, syntax: &str, max: usize) -> Vec<Item> {
    use iced_x86::{Decoder, DecoderOptions, Formatter, GasFormatter, Instruction, IntelFormatter, MasmFormatter, NasmFormatter};
    let mut formatter: Box<dyn Formatter> = match syntax {
        "nasm" => Box::new(NasmFormatter::new()),
        "gas" => Box::new(GasFormatter::new()),
        "masm" => Box::new(MasmFormatter::new()),
        _ => Box::new(IntelFormatter::new()),
    };
    formatter.options_mut().set_space_after_operand_separator(true);
    if syntax == "intel" {
        formatter.options_mut().set_hex_prefix("0x");
        formatter.options_mut().set_hex_suffix("");
    }
    let mut decoder = Decoder::with_ip(bitness, bytes, base, DecoderOptions::NONE);
    let mut out = Vec::new();
    let mut inst = Instruction::default();
    while decoder.can_decode() && out.len() < max {
        let pos = decoder.position();
        decoder.decode_out(&mut inst);
        if inst.is_invalid() {
            // Incomplete at the end of the input, or an invalid encoding: one byte as data, then go on.
            out.push(db(offset + pos as u64, base + pos as u64, bytes[pos]));
            let _ = decoder.set_position(pos + 1);
            decoder.set_ip(base + pos as u64 + 1);
            continue;
        }
        let mut mnemonic = String::new();
        let mut operands = String::new();
        formatter.format_mnemonic(&inst, &mut mnemonic);
        formatter.format_all_operands(&inst, &mut operands);
        out.push(Item { offset: offset + pos as u64, address: inst.ip(), length: inst.len(), mnemonic, operands });
    }
    out
}

fn split_text(text: &str) -> (String, String) {
    let text = text.trim();
    match text.find(' ') {
        Some(i) => (text[..i].to_string(), text[i + 1..].trim().to_string()),
        None => (text.to_string(), String::new()),
    }
}

fn arm(bytes: &[u8], offset: u64, base: u64, arch: &str, max: usize) -> Vec<Item> {
    use yaxpeax_arch::{Decoder, Reader, U8Reader};
    let mut out = Vec::new();
    let mut pos = 0usize;
    let unit = if arch == "thumb" { 2 } else { 4 };
    while pos < bytes.len() && out.len() < max {
        let rest = &bytes[pos..];
        let decoded: Option<(String, usize)> = if arch == "arm64" {
            let decoder = yaxpeax_arm::armv8::a64::InstDecoder::default();
            let mut reader = U8Reader::new(rest);
            match decoder.decode(&mut reader) {
                Ok(inst) => Some((inst.to_string(), <U8Reader as Reader<u64, u8>>::total_offset(&mut reader) as usize)),
                Err(_) => None,
            }
        } else {
            let decoder = if arch == "thumb" { yaxpeax_arm::armv7::InstDecoder::default_thumb() } else { yaxpeax_arm::armv7::InstDecoder::default() };
            let mut reader = U8Reader::new(rest);
            match decoder.decode(&mut reader) {
                Ok(inst) => Some((inst.to_string(), <U8Reader as Reader<u32, u8>>::total_offset(&mut reader) as usize)),
                Err(_) => None,
            }
        };
        match decoded {
            Some((text, len)) if len > 0 && len <= rest.len() => {
                let (mnemonic, operands) = split_text(&text);
                out.push(Item { offset: offset + pos as u64, address: base + pos as u64, length: len, mnemonic, operands });
                pos += len;
            }
            _ => {
                // Undecodable: the whole unit as data bytes (or what is left).
                let n = unit.min(rest.len());
                for (i, &byte) in rest.iter().take(n).enumerate() {
                    if out.len() >= max {
                        break;
                    }
                    out.push(db(offset + (pos + i) as u64, base + (pos + i) as u64, byte));
                }
                pos += n;
            }
        }
    }
    out
}

pub fn disasm(src: &dyn Bytes, args: &Value) -> Result<Value, String> {
    let total = src.len();
    let offset = args.u64_or("offset", 0).min(total);
    let length = args.u64_or("length", 4096).min(1 << 20).min(total - offset);
    let arch = args.str_or("arch", "x86-64");
    let syntax = args.str_or("syntax", "intel");
    let base = args.u64_or("base", offset);
    let max = args.u64_or("max", 2000).clamp(1, 100_000) as usize;
    let mut bytes = vec![0u8; length as usize];
    src.read(offset, &mut bytes)?;
    let items = match arch {
        "x86-16" => x86(&bytes, offset, base, 16, syntax, max),
        "x86-32" => x86(&bytes, offset, base, 32, syntax, max),
        "x86-64" => x86(&bytes, offset, base, 64, syntax, max),
        "arm32" | "thumb" | "arm64" => arm(&bytes, offset, base, arch, max),
        other => return Err(format!("unknown architecture {other}")),
    };
    let next = items.last().map(|i| i.offset + i.length as u64).unwrap_or(offset);
    let list: Vec<Value> = items
        .iter()
        .map(|i| {
            let rel = (i.offset - offset) as usize;
            let text = if i.operands.is_empty() { i.mnemonic.clone() } else { format!("{} {}", i.mnemonic, i.operands) };
            json!({
                "offset": i.offset, "address": i.address, "length": i.length,
                "bytes": hex_string(&bytes[rel..rel + i.length], true), "mnemonic": i.mnemonic, "operands": i.operands, "text": text,
            })
        })
        .collect();
    Ok(json!({ "items": list, "next": next, "arch": arch, "syntax": syntax }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(bytes: &[u8], arch: &str, syntax: &str) -> Vec<String> {
        let r = disasm(&bytes.to_vec(), &json!({ "offset": 0, "arch": arch, "syntax": syntax })).unwrap();
        r["items"].as_array().unwrap().iter().map(|i| i["text"].as_str().unwrap().to_string()).collect()
    }

    #[test]
    fn x86_64_prologue() {
        let t = texts(&[0x55, 0x48, 0x89, 0xE5, 0xC3], "x86-64", "intel");
        assert_eq!(t, vec!["push rbp", "mov rbp, rsp", "ret"]);
        let g = texts(&[0x55, 0x48, 0x89, 0xE5, 0xC3], "x86-64", "gas");
        assert_eq!(g[1], "mov %rsp, %rbp");
    }

    #[test]
    fn x86_invalid_and_truncated() {
        // 0F 0B = ud2 (valid); a lone 0F at the end is incomplete → db.
        let t = texts(&[0x0F, 0x0B, 0x0F], "x86-32", "intel");
        assert_eq!(t, vec!["ud2", "db 0x0F"]);
        let r = disasm(&vec![0x90u8; 10], &json!({ "offset": 2, "length": 4, "arch": "x86-16", "base": 0x7C00, "max": 3 })).unwrap();
        assert_eq!(r["items"].as_array().unwrap().len(), 3);
        assert_eq!(r["items"][0]["address"], json!(0x7C00));
        assert_eq!(r["next"], json!(5));
    }

    #[test]
    fn arm64_ret() {
        let t = texts(&[0xC0, 0x03, 0x5F, 0xD6], "arm64", "arm");
        assert_eq!(t, vec!["ret"]);
    }

    #[test]
    fn arm32_and_thumb() {
        // e12fff1e = bx lr (little-endian bytes)
        let t = texts(&[0x1E, 0xFF, 0x2F, 0xE1], "arm32", "arm");
        assert!(t[0].starts_with("bx"), "{t:?}");
        // 0x4770 = bx lr in Thumb
        let t = texts(&[0x70, 0x47], "thumb", "arm");
        assert!(t[0].starts_with("bx"), "{t:?}");
    }
}
