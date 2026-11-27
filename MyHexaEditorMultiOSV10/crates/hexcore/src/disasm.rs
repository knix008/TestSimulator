//! Disassembler.
//!
//! CONTRACT
//! `disasm(src, {offset, length: 4096, arch: <id from archs()>, syntax: "intel"|"nasm"|"gas"|"masm",
//!   base: <address of offset, default = offset>, max: 2000})` →
//!   `{ items: [{ offset, address, length, bytes: "hex", mnemonic, operands, text }], next: <offset after the last>, arch, syntax }`
//!   Undecodable bytes become one-byte items with mnemonic "db" (operands "0xNN"). `syntax` only applies to x86
//!   (the other architectures always print their own assembler syntax).
//! `archs()` → `[{ id, name, syntaxes: [..] }]`.
//!
//! Decoders: x86 iced-x86; ARM yaxpeax-arm (ARMv7 A32, Thumb/Thumb-2, AArch64); PowerPC yaxpeax-power;
//! 6502 yaxpeax-6502; AVR yaxpeax-avr; MSP430 yaxpeax-msp430 (own operand printer); SuperH yaxpeax-superh.
//! MIPS (MIPS32/MIPS64 incl. COP0/COP1/COP1X, both byte orders), RISC-V (RV32/RV64 I M A F D C + Zicsr/Zifencei),
//! Z80 (incl. CB/ED/DD/FD/DDCB prefixes and undocumented IXH/IXL) and Intel 8080 are decoded here.
//! Branch and jump targets are printed as absolute addresses (relative to `base`).
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
        { "id": "mips32be", "name": "MIPS32 (big endian)", "syntaxes": ["mips"] },
        { "id": "mips32le", "name": "MIPS32 (little endian)", "syntaxes": ["mips"] },
        { "id": "mips64be", "name": "MIPS64 (big endian)", "syntaxes": ["mips"] },
        { "id": "mips64le", "name": "MIPS64 (little endian)", "syntaxes": ["mips"] },
        { "id": "riscv32", "name": "RISC-V RV32GC (IMAFDC)", "syntaxes": ["riscv"] },
        { "id": "riscv64", "name": "RISC-V RV64GC (IMAFDC)", "syntaxes": ["riscv"] },
        { "id": "ppc32", "name": "PowerPC 32-bit (big endian)", "syntaxes": ["ppc"] },
        { "id": "ppc64", "name": "PowerPC 64-bit (big endian)", "syntaxes": ["ppc"] },
        { "id": "ppc64le", "name": "PowerPC 64-bit (little endian)", "syntaxes": ["ppc"] },
        { "id": "sh4", "name": "SuperH SH-4 (little endian)", "syntaxes": ["sh"] },
        { "id": "sh4be", "name": "SuperH SH-4 (big endian)", "syntaxes": ["sh"] },
        { "id": "6502", "name": "MOS 6502", "syntaxes": ["6502"] },
        { "id": "avr", "name": "Atmel AVR", "syntaxes": ["avr"] },
        { "id": "msp430", "name": "TI MSP430", "syntaxes": ["msp430"] },
        { "id": "z80", "name": "Zilog Z80", "syntaxes": ["zilog"] },
        { "id": "8080", "name": "Intel 8080", "syntaxes": ["intel"] },
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

/// One decoded instruction: (length in bytes, mnemonic, operands).
type Decoded = Option<(usize, String, String)>;

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

/// Generic driver for the non-x86 decoders: `dec(rest, address)` decodes one instruction at the start of `rest`;
/// on failure `unit` bytes (or what is left) become `db` lines.
fn run(bytes: &[u8], offset: u64, base: u64, max: usize, unit: usize, mut dec: impl FnMut(&[u8], u64) -> Decoded) -> Vec<Item> {
    let mut out = Vec::new();
    let mut pos = 0usize;
    while pos < bytes.len() && out.len() < max {
        let rest = &bytes[pos..];
        let address = base.wrapping_add(pos as u64);
        match dec(rest, address) {
            Some((len, mnemonic, operands)) if len > 0 && len <= rest.len() => {
                out.push(Item { offset: offset + pos as u64, address, length: len, mnemonic, operands });
                pos += len;
            }
            _ => {
                let n = unit.min(rest.len());
                for (i, &byte) in rest.iter().take(n).enumerate() {
                    if out.len() >= max {
                        break;
                    }
                    out.push(db(offset + (pos + i) as u64, base.wrapping_add((pos + i) as u64), byte));
                }
                pos += n;
            }
        }
    }
    out
}

fn text_item(len: usize, text: &str) -> Decoded {
    let (m, o) = split_text(text);
    Some((len, m, o))
}

fn arm(rest: &[u8], arch: &str) -> Decoded {
    use yaxpeax_arch::{Decoder, Reader, U8Reader};
    let mut reader = U8Reader::new(rest);
    if arch == "arm64" {
        let decoder = yaxpeax_arm::armv8::a64::InstDecoder::default();
        let inst = decoder.decode(&mut reader).ok()?;
        text_item(<U8Reader as Reader<u64, u8>>::total_offset(&mut reader) as usize, &inst.to_string())
    } else {
        let decoder = if arch == "thumb" { yaxpeax_arm::armv7::InstDecoder::default_thumb() } else { yaxpeax_arm::armv7::InstDecoder::default() };
        let inst = decoder.decode(&mut reader).ok()?;
        text_item(<U8Reader as Reader<u32, u8>>::total_offset(&mut reader) as usize, &inst.to_string())
    }
}

// ---------------------------------------------------------------------------------------------------------------
// PowerPC (yaxpeax-power)

fn ppc(rest: &[u8], address: u64, arch: &str) -> Decoded {
    use yaxpeax_arch::{Decoder, U8Reader};
    use yaxpeax_power::{AbsoluteAddressFormatter, InstDecoder};
    if rest.len() < 4 {
        return None;
    }
    // A current Power ISA rather than `All`, which mixes in Xenon VMX128 and POWER2 reinterpretations.
    let decoder = match arch {
        "ppc64le" => InstDecoder::ppc64le(),
        _ => InstDecoder::for_cpu(yaxpeax_power::IsaVersion::V3_1),
    };
    let inst = decoder.decode(&mut U8Reader::new(&rest[..4])).ok()?;
    let mut text = AbsoluteAddressFormatter::new(address).display(&inst).to_string();
    if arch == "ppc32" {
        // Branch targets wrap at 32 bits.
        if let Some(i) = text.find("0xffffffff") {
            let digits = text[i + 2..].chars().take_while(|c| c.is_ascii_hexdigit()).count();
            if digits == 16 {
                text.replace_range(i + 2..i + 10, "");
            }
        }
    }
    text_item(4, &text)
}

// ---------------------------------------------------------------------------------------------------------------
// SuperH (yaxpeax-superh, yaxpeax-arch 0.2)

fn superh(rest: &[u8], address: u64, big_endian: bool) -> Decoded {
    use arch02::{Decoder, U8Reader};
    if rest.len() < 2 {
        return None;
    }
    let mut decoder = yaxpeax_superh::SuperHDecoder::SH4;
    decoder.little_endian = !big_endian;
    let inst = decoder.decode(&mut U8Reader::new(&rest[..2])).ok()?;
    let (mnemonic, operands) = split_text(&inst.to_string().to_lowercase());
    // The crate prints raw displacement fields; show branch / PC-relative targets, scaled displacements and
    // sign-extended immediates the way GNU objdump does.
    let w = if big_endian { u16::from_be_bytes([rest[0], rest[1]]) } else { u16::from_le_bytes([rest[0], rest[1]]) } as u32;
    let (n, m, d4, d8) = ((w >> 8) & 15, (w >> 4) & 15, w & 15, w & 0xFF);
    let pc4 = address.wrapping_add(4) & 0xFFFF_FFFF;
    let fixed = match w >> 12 {
        0xA | 0xB => Some(format!("0x{:x}", pc4.wrapping_add((sext(w & 0xFFF, 12) * 2) as u64) & 0xFFFF_FFFF)),
        0x8 if matches!(n, 9 | 0xB | 0xD | 0xF) => Some(format!("0x{:x}", pc4.wrapping_add((sext(d8, 8) * 2) as u64) & 0xFFFF_FFFF)),
        0x8 if n == 0 => Some(format!("r0,@({d4},r{m})")),
        0x8 if n == 1 => Some(format!("r0,@({},r{m})", d4 * 2)),
        0x8 if n == 4 => Some(format!("@({d4},r{m}),r0")),
        0x8 if n == 5 => Some(format!("@({},r{m}),r0", d4 * 2)),
        0x9 => Some(format!("0x{:x},r{n}", pc4 + d8 as u64 * 2)),
        0xD => Some(format!("0x{:x},r{n}", (pc4 & !3) + d8 as u64 * 4)),
        0xC if n == 7 => Some(format!("0x{:x},r0", (pc4 & !3) + d8 as u64 * 4)),
        0xC if matches!(n, 0..=2) => Some(format!("r0,@({},gbr)", d8 << n)),
        0xC if matches!(n, 4..=6) => Some(format!("@({},gbr),r0", d8 << (n - 4))),
        0x1 => Some(format!("r{m},@({},r{n})", d4 * 4)),
        0x5 => Some(format!("@({},r{m}),r{n}", d4 * 4)),
        0x7 | 0xE => Some(format!("#{},r{n}", d8 as u8 as i8)),
        0x8 if n == 8 => Some(format!("#{},r0", d8 as u8 as i8)),
        _ => None,
    };
    Some((2, mnemonic, fixed.unwrap_or(operands)))
}

// ---------------------------------------------------------------------------------------------------------------
// 6502 (yaxpeax-6502, yaxpeax-arch 0.2)

fn m6502(rest: &[u8], address: u64) -> Decoded {
    use arch02::{Decoder, Reader, U8Reader};
    let mut reader = U8Reader::new(rest);
    let inst = yaxpeax_6502::InstDecoder.decode(&mut reader).ok()?;
    let len = <U8Reader as Reader<u16, u8>>::total_offset(&mut reader) as usize;
    let (mnemonic, mut operands) = split_text(&inst.to_string().to_lowercase());
    // Relative branches (BPL, BMI, BVC, BVS, BCC, BCS, BNE, BEQ): show the target, not the raw displacement.
    if rest[0] & 0x1F == 0x10 && len == 2 {
        let target = (address as u16).wrapping_add(2).wrapping_add(rest[1] as i8 as u16);
        operands = format!("${target:04x}");
    }
    Some((len, mnemonic, operands))
}

// ---------------------------------------------------------------------------------------------------------------
// AVR (yaxpeax-avr, yaxpeax-arch 0.2)

fn avr(rest: &[u8], address: u64) -> Decoded {
    use arch02::{Decoder, Reader, U8Reader};
    use yaxpeax_avr::Operand;
    let mut reader = U8Reader::new(rest);
    let inst = yaxpeax_avr::InstDecoder::default().decode(&mut reader).ok()?;
    // The crate's own length() says 2 for jmp/call/lds/sts; the reader knows the truth.
    let len = <U8Reader as Reader<u32, u8>>::total_offset(&mut reader) as usize;
    let mut ops = Vec::new();
    for op in inst.operands.iter() {
        ops.push(match op {
            Operand::Nothing => break,
            Operand::ImmediateU8(v) => format!("0x{v:02x}"),
            Operand::AddrAbsolute(v) => format!("0x{v:x}"),
            // Displacement in words, already including the +1 of "PC + k + 1".
            Operand::AddrPCRelative(k) => format!("0x{:x}", address.wrapping_add((*k as i64 * 2) as u64) & 0x7F_FFFF),
            other => other.to_string(),
        });
    }
    Some((len, inst.opcode.to_string().to_lowercase(), ops.join(", ")))
}

// ---------------------------------------------------------------------------------------------------------------
// MSP430 (yaxpeax-msp430 decodes; operands printed here because the crate's printer garbles some modes)

fn msp430(rest: &[u8], address: u64) -> Decoded {
    use yaxpeax_arch::{Decoder, Reader, U16le, U8Reader};
    use yaxpeax_msp430::{Opcode, Operand, Width};
    let mut reader = U8Reader::new(rest);
    let inst = yaxpeax_msp430::InstDecoder::default().decode(&mut reader).ok()?;
    let len = <U8Reader as Reader<u16, U16le>>::total_offset(&mut reader) as usize * 2;
    if let Opcode::Invalid(_) = inst.opcode {
        return None;
    }
    fn reg(r: u8) -> String {
        match r {
            0 => "pc".into(),
            1 => "sp".into(),
            2 => "sr".into(),
            3 => "cg".into(),
            n => format!("r{n}"),
        }
    }
    let has_ext = |op: &Operand| matches!(op, Operand::Indexed(..) | Operand::Symbolic(_) | Operand::Immediate(_) | Operand::Absolute(_));
    let fmt = |op: &Operand, dst: bool, ext_at: u64| -> String {
        match *op {
            Operand::Register(r) => reg(r),
            Operand::Indexed(r, d) => format!("0x{d:x}({})", reg(r)),
            Operand::RegisterIndirect(r) => format!("@{}", reg(r)),
            Operand::IndirectAutoinc(r) => format!("@{}+", reg(r)),
            Operand::Symbolic(d) => format!("0x{:04x}", (ext_at as u16).wrapping_add(d)),
            Operand::Immediate(v) => format!("#0x{v:x}"),
            Operand::Absolute(a) => format!("&0x{a:04x}"),
            Operand::Offset(o) => format!("0x{:04x}", (address as u16).wrapping_add(2).wrapping_add((o as u16).wrapping_mul(2))),
            Operand::Const0 if dst => "cg".into(),
            Operand::Const0 => "#0".into(),
            Operand::Const1 => "#1".into(),
            Operand::Const2 => "#2".into(),
            Operand::Const4 => "#4".into(),
            Operand::Const8 => "#8".into(),
            Operand::ConstNeg1 => "#-1".into(),
            Operand::Nothing => String::new(),
        }
    };
    let src_ext = address.wrapping_add(2);
    let dst_ext = src_ext.wrapping_add(if has_ext(&inst.operands[0]) { 2 } else { 0 });
    let a = fmt(&inst.operands[0], false, src_ext);
    let two = !matches!(inst.operands[1], Operand::Nothing);
    let b = if two { fmt(&inst.operands[1], true, dst_ext) } else { String::new() };
    let mut mnemonic = inst.opcode.to_string().to_lowercase();
    let byte = inst.op_width == Width::B && !matches!(inst.opcode, Opcode::SWPB | Opcode::SXT | Opcode::CALL | Opcode::RETI) && !mnemonic.starts_with('j');
    // Common emulated instructions.
    let emulated: Option<(&str, String)> = match (inst.opcode, &inst.operands[0], &inst.operands[1]) {
        (Opcode::MOV, Operand::IndirectAutoinc(1), Operand::Register(0)) => Some(("ret", String::new())),
        (Opcode::MOV, Operand::Const0, Operand::Const0) => Some(("nop", String::new())),
        (Opcode::MOV, Operand::IndirectAutoinc(1), _) => Some(("pop", b.clone())),
        (Opcode::MOV, _, Operand::Register(0)) => Some(("br", a.clone())),
        (Opcode::MOV, Operand::Const0, _) => Some(("clr", b.clone())),
        _ => None,
    };
    let operands = match emulated {
        Some((m, o)) => {
            mnemonic = m.into();
            o
        }
        None if two => format!("{a}, {b}"),
        None => a,
    };
    if byte {
        mnemonic.push_str(".b");
    }
    Some((len, mnemonic, operands))
}

// ---------------------------------------------------------------------------------------------------------------
// MIPS32 / MIPS64

const MIPS_O32: [&str; 32] = [
    "zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0",
    "k1", "gp", "sp", "fp", "ra",
];
const MIPS_N64: [&str; 32] = [
    "zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "t0", "t1", "t2", "t3", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0",
    "k1", "gp", "sp", "s8", "ra",
];

fn mips(rest: &[u8], address: u64, be: bool, m64: bool) -> Decoded {
    if rest.len() < 4 {
        return None;
    }
    let raw = [rest[0], rest[1], rest[2], rest[3]];
    let w = if be { u32::from_be_bytes(raw) } else { u32::from_le_bytes(raw) };
    let names = if m64 { &MIPS_N64 } else { &MIPS_O32 };
    let r = |i: u32| names[i as usize & 31].to_string();
    let f = |i: u32| format!("$f{}", i & 31);
    let mask = if m64 { u64::MAX } else { 0xFFFF_FFFF };
    let op = w >> 26;
    let rs = (w >> 21) & 31;
    let rt = (w >> 16) & 31;
    let rd = (w >> 11) & 31;
    let sa = (w >> 6) & 31;
    let funct = w & 63;
    let imm = w & 0xFFFF;
    let simm = imm as u16 as i16 as i64;
    let target = format!("0x{:x}", address.wrapping_add(4).wrapping_add((simm << 2) as u64) & mask);
    let mem = |reg: String| format!("{reg}, {simm}({})", r(rs));
    let o = |m: &str, ops: String| -> Decoded { Some((4, m.to_string(), ops)) };
    let o0 = |m: &str| -> Decoded { Some((4, m.to_string(), String::new())) };
    let only64 = |d: Decoded| if m64 { d } else { None };
    match op {
        0 => match funct {
            0 if w == 0 => o0("nop"),
            0 if w == 0x40 => o0("ssnop"),
            0 if w == 0xC0 => o0("ehb"),
            0 if rs == 0 => o("sll", format!("{}, {}, {sa}", r(rd), r(rt))),
            1 if sa == 0 && (w >> 17) & 1 == 0 => {
                o(if (w >> 16) & 1 == 1 { "movt" } else { "movf" }, format!("{}, {}, $fcc{}", r(rd), r(rs), (w >> 18) & 7))
            }
            2 if rs == 0 => o("srl", format!("{}, {}, {sa}", r(rd), r(rt))),
            2 if rs == 1 => o("rotr", format!("{}, {}, {sa}", r(rd), r(rt))),
            3 if rs == 0 => o("sra", format!("{}, {}, {sa}", r(rd), r(rt))),
            4 if sa == 0 => o("sllv", format!("{}, {}, {}", r(rd), r(rt), r(rs))),
            6 if sa == 0 => o("srlv", format!("{}, {}, {}", r(rd), r(rt), r(rs))),
            6 if sa == 1 => o("rotrv", format!("{}, {}, {}", r(rd), r(rt), r(rs))),
            7 if sa == 0 => o("srav", format!("{}, {}, {}", r(rd), r(rt), r(rs))),
            8 if rt == 0 && rd == 0 => o(if sa == 16 { "jr.hb" } else { "jr" }, r(rs)),
            9 if rt == 0 => {
                if rd == 31 {
                    o("jalr", r(rs))
                } else {
                    o("jalr", format!("{}, {}", r(rd), r(rs)))
                }
            }
            10 if sa == 0 => o("movz", format!("{}, {}, {}", r(rd), r(rs), r(rt))),
            11 if sa == 0 => o("movn", format!("{}, {}, {}", r(rd), r(rs), r(rt))),
            12 | 13 => {
                let code = (w >> 6) & 0xFFFFF;
                let m = if funct == 12 { "syscall" } else { "break" };
                if code == 0 {
                    o0(m)
                } else {
                    o(m, format!("0x{code:x}"))
                }
            }
            15 if w >> 11 == 0 => {
                if sa == 0 {
                    o0("sync")
                } else {
                    o("sync", format!("0x{sa:x}"))
                }
            }
            16 | 18 if rs == 0 && rt == 0 && sa == 0 => o(if funct == 16 { "mfhi" } else { "mflo" }, r(rd)),
            17 | 19 if rt == 0 && rd == 0 && sa == 0 => o(if funct == 17 { "mthi" } else { "mtlo" }, r(rs)),
            20 | 22 | 23 if sa == 0 => only64(o(["dsllv", "", "dsrlv", "dsrav"][funct as usize - 20], format!("{}, {}, {}", r(rd), r(rt), r(rs)))),
            24..=27 if rd == 0 && sa == 0 => o(["mult", "multu", "div", "divu"][funct as usize - 24], format!("{}, {}", r(rs), r(rt))),
            28..=31 if rd == 0 && sa == 0 => only64(o(["dmult", "dmultu", "ddiv", "ddivu"][funct as usize - 28], format!("{}, {}", r(rs), r(rt)))),
            32..=39 | 42 | 43 | 44..=47 if sa == 0 => {
                let wide = (44..=47).contains(&funct);
                if wide && !m64 {
                    return None;
                }
                if (funct == 33 || funct == 37 || funct == 45) && rt == 0 {
                    return o("move", format!("{}, {}", r(rd), r(rs)));
                }
                if funct == 35 && rs == 0 {
                    return o("negu", format!("{}, {}", r(rd), r(rt)));
                }
                if funct == 39 && rt == 0 {
                    return o("not", format!("{}, {}", r(rd), r(rs)));
                }
                let m = match funct {
                    32 => "add",
                    33 => "addu",
                    34 => "sub",
                    35 => "subu",
                    36 => "and",
                    37 => "or",
                    38 => "xor",
                    39 => "nor",
                    42 => "slt",
                    43 => "sltu",
                    44 => "dadd",
                    45 => "daddu",
                    46 => "dsub",
                    _ => "dsubu",
                };
                o(m, format!("{}, {}, {}", r(rd), r(rs), r(rt)))
            }
            48..=52 | 54 => {
                let m = ["tge", "tgeu", "tlt", "tltu", "teq", "", "tne"][funct as usize - 48];
                o(m, format!("{}, {}", r(rs), r(rt)))
            }
            56 | 58 | 59 | 60 | 62 | 63 if rs == 0 => {
                let m = match funct {
                    56 => "dsll",
                    58 => "dsrl",
                    59 => "dsra",
                    60 => "dsll32",
                    62 => "dsrl32",
                    _ => "dsra32",
                };
                only64(o(m, format!("{}, {}, {sa}", r(rd), r(rt))))
            }
            _ => None,
        },
        1 => {
            let m = match rt {
                0 => "bltz",
                1 if rs == 0 => return o("b", target),
                1 => "bgez",
                2 => "bltzl",
                3 => "bgezl",
                16 => "bltzal",
                17 if rs == 0 => return o("bal", target),
                17 => "bgezal",
                18 => "bltzall",
                19 => "bgezall",
                8..=12 | 14 => {
                    let m = ["tgei", "tgeiu", "tlti", "tltiu", "teqi", "", "tnei"][rt as usize - 8];
                    return o(m, format!("{}, {simm}", r(rs)));
                }
                31 => return o("synci", format!("{simm}({})", r(rs))),
                _ => return None,
            };
            o(m, format!("{}, {target}", r(rs)))
        }
        2 | 3 => {
            let t = (address.wrapping_add(4) & !0x0FFF_FFFF) | ((w as u64 & 0x03FF_FFFF) << 2);
            o(if op == 2 { "j" } else { "jal" }, format!("0x{:x}", t & mask))
        }
        4 | 5 | 20 | 21 => {
            let likely = op >= 20;
            let eq = op == 4 || op == 20;
            if eq && rs == 0 && rt == 0 && !likely {
                return o("b", target);
            }
            let l = if likely { "l" } else { "" };
            if rt == 0 {
                o(&format!("{}{l}", if eq { "beqz" } else { "bnez" }), format!("{}, {target}", r(rs)))
            } else {
                o(&format!("{}{l}", if eq { "beq" } else { "bne" }), format!("{}, {}, {target}", r(rs), r(rt)))
            }
        }
        6 | 7 | 22 | 23 if rt == 0 => {
            let m = ["blez", "bgtz", "blezl", "bgtzl"][if op >= 22 { op as usize - 20 } else { op as usize - 6 }];
            o(m, format!("{}, {target}", r(rs)))
        }
        8..=11 | 24 | 25 => {
            if (op == 9 || op == 25) && rs == 0 && (op == 9 || m64) {
                return o("li", format!("{}, {simm}", r(rt)));
            }
            let m = match op {
                8 => "addi",
                9 => "addiu",
                10 => "slti",
                11 => "sltiu",
                24 => "daddi",
                _ => "daddiu",
            };
            if op >= 24 && !m64 {
                return None;
            }
            o(m, format!("{}, {}, {simm}", r(rt), r(rs)))
        }
        12..=14 => {
            if op == 13 && rs == 0 {
                return o("li", format!("{}, 0x{imm:x}", r(rt)));
            }
            o(["andi", "ori", "xori"][op as usize - 12], format!("{}, {}, 0x{imm:x}", r(rt), r(rs)))
        }
        15 if rs == 0 => o("lui", format!("{}, 0x{imm:x}", r(rt))),
        16 => {
            // COP0
            let sel = w & 7;
            let cop_reg = |m: &str| {
                if sel == 0 {
                    o(m, format!("{}, ${rd}", r(rt)))
                } else {
                    o(m, format!("{}, ${rd}, {sel}", r(rt)))
                }
            };
            match rs {
                0 if (w >> 3) & 0xFF == 0 => cop_reg("mfc0"),
                1 if (w >> 3) & 0xFF == 0 => only64(cop_reg("dmfc0")),
                4 if (w >> 3) & 0xFF == 0 => cop_reg("mtc0"),
                5 if (w >> 3) & 0xFF == 0 => only64(cop_reg("dmtc0")),
                11 if rd == 12 && w & 0x7DF == 0 => {
                    let m = if (w >> 5) & 1 == 1 { "ei" } else { "di" };
                    if rt == 0 {
                        o0(m)
                    } else {
                        o(m, r(rt))
                    }
                }
                16..=31 => match funct {
                    1 => o0("tlbr"),
                    2 => o0("tlbwi"),
                    6 => o0("tlbwr"),
                    8 => o0("tlbp"),
                    24 => o0("eret"),
                    31 => o0("deret"),
                    32 => o0("wait"),
                    _ => None,
                },
                _ => None,
            }
        }
        17 => {
            // COP1 (FPU)
            let fs = rd;
            let fd = sa;
            let ft = rt;
            match rs {
                0..=7 if w & 0x7FF == 0 => {
                    let m = ["mfc1", "dmfc1", "cfc1", "mfhc1", "mtc1", "dmtc1", "ctc1", "mthc1"][rs as usize];
                    if (rs == 1 || rs == 5) && !m64 {
                        return None;
                    }
                    if rs == 2 || rs == 6 {
                        o(m, format!("{}, ${fs}", r(rt)))
                    } else {
                        o(m, format!("{}, {}", r(rt), f(fs)))
                    }
                }
                8 => {
                    let cc = (w >> 18) & 7;
                    let m = ["bc1f", "bc1t", "bc1fl", "bc1tl"][((w >> 16) & 3) as usize];
                    if cc == 0 {
                        o(m, target)
                    } else {
                        o(m, format!("$fcc{cc}, {target}"))
                    }
                }
                16 | 17 | 20 | 21 | 22 => {
                    let fmt = match rs {
                        16 => "s",
                        17 => "d",
                        20 => "w",
                        21 => "l",
                        _ => "ps",
                    };
                    let float = rs == 16 || rs == 17 || rs == 22;
                    let three = |m: &str| o(&format!("{m}.{fmt}"), format!("{}, {}, {}", f(fd), f(fs), f(ft)));
                    let two = |m: &str| if ft == 0 { o(&format!("{m}.{fmt}"), format!("{}, {}", f(fd), f(fs))) } else { None };
                    match funct {
                        0..=3 if float => three(["add", "sub", "mul", "div"][funct as usize]),
                        4..=7 if float => two(["sqrt", "abs", "mov", "neg"][funct as usize - 4]),
                        8..=15 if rs == 16 || rs == 17 => two(["round.l", "trunc.l", "ceil.l", "floor.l", "round.w", "trunc.w", "ceil.w", "floor.w"][funct as usize - 8]),
                        17 if float && (w >> 17) & 1 == 0 => o(
                            &format!("{}.{fmt}", if (w >> 16) & 1 == 1 { "movt" } else { "movf" }),
                            format!("{}, {}, $fcc{}", f(fd), f(fs), (w >> 18) & 7),
                        ),
                        18 | 19 if float => o(&format!("{}.{fmt}", if funct == 18 { "movz" } else { "movn" }), format!("{}, {}, {}", f(fd), f(fs), r(rt))),
                        21 | 22 if rs == 16 || rs == 17 => two(if funct == 21 { "recip" } else { "rsqrt" }),
                        32 if rs != 16 => two("cvt.s"),
                        33 if rs != 17 && rs != 22 => two("cvt.d"),
                        36 if rs == 16 || rs == 17 => two("cvt.w"),
                        37 if rs == 16 || rs == 17 => two("cvt.l"),
                        48..=63 if float && fd & 3 == 0 => {
                            const CONDS: [&str; 16] = ["f", "un", "eq", "ueq", "olt", "ult", "ole", "ule", "sf", "ngle", "seq", "ngl", "lt", "nge", "le", "ngt"];
                            let cc = fd >> 2;
                            let m = format!("c.{}.{fmt}", CONDS[funct as usize - 48]);
                            if cc == 0 {
                                o(&m, format!("{}, {}", f(fs), f(ft)))
                            } else {
                                o(&m, format!("$fcc{cc}, {}, {}", f(fs), f(ft)))
                            }
                        }
                        _ => None,
                    }
                }
                _ => None,
            }
        }
        19 => {
            // COP1X
            let idx = format!("{}({})", r(rt), r(rs));
            match funct {
                0 | 1 | 5 if rd == 0 => o(["lwxc1", "ldxc1", "", "", "", "luxc1"][funct as usize], format!("{}, {idx}", f(sa))),
                8 | 9 | 13 if sa == 0 => o(["swxc1", "sdxc1", "", "", "", "suxc1"][funct as usize - 8], format!("{}, {idx}", f(rd))),
                15 if sa == 0 => o("prefx", format!("{rd}, {idx}")),
                32..=63 => {
                    let fmt = match funct & 7 {
                        0 => "s",
                        1 => "d",
                        6 => "ps",
                        _ => return None,
                    };
                    let m = match funct >> 3 {
                        4 => "madd",
                        5 => "msub",
                        6 => "nmadd",
                        7 => "nmsub",
                        _ => return None,
                    };
                    o(&format!("{m}.{fmt}"), format!("{}, {}, {}, {}", f(sa), f(rs), f(rd), f(rt)))
                }
                _ => None,
            }
        }
        26 | 27 | 39 | 44 | 45 | 52 | 55 | 60 | 63 => {
            let m = match op {
                26 => "ldl",
                27 => "ldr",
                39 => "lwu",
                44 => "sdl",
                45 => "sdr",
                52 => "lld",
                55 => "ld",
                60 => "scd",
                _ => "sd",
            };
            only64(o(m, mem(r(rt))))
        }
        28 => match funct {
            0 | 1 | 4 | 5 if rd == 0 && sa == 0 => o(["madd", "maddu", "", "", "msub", "msubu"][funct as usize], format!("{}, {}", r(rs), r(rt))),
            2 if sa == 0 => o("mul", format!("{}, {}, {}", r(rd), r(rs), r(rt))),
            32 | 33 | 36 | 37 if sa == 0 => {
                if funct >= 36 && !m64 {
                    return None;
                }
                o(["clz", "clo", "", "", "dclz", "dclo"][funct as usize - 32], format!("{}, {}", r(rd), r(rs)))
            }
            63 => {
                let code = (w >> 6) & 0xFFFFF;
                if code == 0 {
                    o0("sdbbp")
                } else {
                    o("sdbbp", format!("0x{code:x}"))
                }
            }
            _ => None,
        },
        31 => match funct {
            0 => o("ext", format!("{}, {}, {sa}, {}", r(rt), r(rs), rd + 1)),
            4 if rd >= sa => o("ins", format!("{}, {}, {sa}, {}", r(rt), r(rs), rd + 1 - sa)),
            3 => only64(o("dext", format!("{}, {}, {sa}, {}", r(rt), r(rs), rd + 1))),
            7 if rd >= sa => only64(o("dins", format!("{}, {}, {sa}, {}", r(rt), r(rs), rd + 1 - sa))),
            32 if rs == 0 => match sa {
                2 => o("wsbh", format!("{}, {}", r(rd), r(rt))),
                16 => o("seb", format!("{}, {}", r(rd), r(rt))),
                24 => o("seh", format!("{}, {}", r(rd), r(rt))),
                _ => None,
            },
            36 if rs == 0 && (sa == 2 || sa == 5) => only64(o(if sa == 2 { "dsbh" } else { "dshd" }, format!("{}, {}", r(rd), r(rt)))),
            59 if rs == 0 && sa == 0 => o("rdhwr", format!("{}, ${rd}", r(rt))),
            _ => None,
        },
        32..=38 | 40..=43 | 46 | 48 | 56 => {
            let m = match op {
                32 => "lb",
                33 => "lh",
                34 => "lwl",
                35 => "lw",
                36 => "lbu",
                37 => "lhu",
                38 => "lwr",
                40 => "sb",
                41 => "sh",
                42 => "swl",
                43 => "sw",
                46 => "swr",
                48 => "ll",
                _ => "sc",
            };
            o(m, mem(r(rt)))
        }
        47 => o("cache", format!("0x{rt:x}, {simm}({})", r(rs))),
        51 => o("pref", format!("0x{rt:x}, {simm}({})", r(rs))),
        49 | 53 | 57 | 61 => o(["lwc1", "ldc1", "swc1", "sdc1"][(op as usize - 49) / 4], mem(f(rt))),
        50 | 54 | 58 | 62 => o(["lwc2", "ldc2", "swc2", "sdc2"][(op as usize - 50) / 4], mem(format!("${rt}"))),
        18 => o("cop2", format!("0x{:x}", w & 0x01FF_FFFF)),
        _ => None,
    }
}

// ---------------------------------------------------------------------------------------------------------------
// RISC-V RV32/RV64 IMAFDC + Zicsr + Zifencei

const RV_X: [&str; 32] = [
    "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10",
    "s11", "t3", "t4", "t5", "t6",
];
const RV_F: [&str; 32] = [
    "ft0", "ft1", "ft2", "ft3", "ft4", "ft5", "ft6", "ft7", "fs0", "fs1", "fa0", "fa1", "fa2", "fa3", "fa4", "fa5", "fa6", "fa7", "fs2", "fs3", "fs4", "fs5", "fs6",
    "fs7", "fs8", "fs9", "fs10", "fs11", "ft8", "ft9", "ft10", "ft11",
];

fn sext(v: u32, bits: u32) -> i64 {
    (((v << (32 - bits)) as i32) >> (32 - bits)) as i64
}

fn rv_csr(csr: u32) -> String {
    let name = match csr {
        0x001 => "fflags",
        0x002 => "frm",
        0x003 => "fcsr",
        0xC00 => "cycle",
        0xC01 => "time",
        0xC02 => "instret",
        0xC80 => "cycleh",
        0xC81 => "timeh",
        0xC82 => "instreth",
        0x100 => "sstatus",
        0x104 => "sie",
        0x105 => "stvec",
        0x140 => "sscratch",
        0x141 => "sepc",
        0x142 => "scause",
        0x143 => "stval",
        0x144 => "sip",
        0x180 => "satp",
        0x300 => "mstatus",
        0x301 => "misa",
        0x302 => "medeleg",
        0x303 => "mideleg",
        0x304 => "mie",
        0x305 => "mtvec",
        0x340 => "mscratch",
        0x341 => "mepc",
        0x342 => "mcause",
        0x343 => "mtval",
        0x344 => "mip",
        0xF11 => "mvendorid",
        0xF12 => "marchid",
        0xF13 => "mimpid",
        0xF14 => "mhartid",
        _ => return format!("0x{csr:x}"),
    };
    name.to_string()
}

fn riscv(rest: &[u8], address: u64, rv64: bool) -> Decoded {
    if rest.len() < 2 {
        return None;
    }
    let lo = u16::from_le_bytes([rest[0], rest[1]]);
    let mask = if rv64 { u64::MAX } else { 0xFFFF_FFFF };
    let tgt = |off: i64| format!("0x{:x}", address.wrapping_add(off as u64) & mask);
    if lo & 3 != 3 {
        return riscv_c(lo, rv64, &tgt).map(|(m, o)| (2, m, o));
    }
    if lo & 0x1F == 0x1F || rest.len() < 4 {
        return None; // 48-bit and longer encodings are not supported
    }
    let w = u32::from_le_bytes([rest[0], rest[1], rest[2], rest[3]]);
    let x = |i: u32| RV_X[(i & 31) as usize];
    let fr = |i: u32| RV_F[(i & 31) as usize];
    let opcode = w & 0x7F;
    let rd = (w >> 7) & 31;
    let f3 = (w >> 12) & 7;
    let rs1 = (w >> 15) & 31;
    let rs2 = (w >> 20) & 31;
    let f7 = w >> 25;
    let imm_i = (w as i32 >> 20) as i64;
    let imm_s = (((w as i32 >> 25) << 5) as i64) | rd as i64;
    let o = |m: &str, ops: String| -> Option<(usize, String, String)> { Some((4, m.to_string(), ops)) };
    let o0 = |m: &str| -> Option<(usize, String, String)> { Some((4, m.to_string(), String::new())) };
    match opcode {
        0x37 => o("lui", format!("{}, 0x{:x}", x(rd), w >> 12)),
        0x17 => o("auipc", format!("{}, 0x{:x}", x(rd), w >> 12)),
        0x6F => {
            let off = sext(((w >> 31) & 1) << 20 | ((w >> 12) & 0xFF) << 12 | ((w >> 20) & 1) << 11 | ((w >> 21) & 0x3FF) << 1, 21);
            match rd {
                0 => o("j", tgt(off)),
                1 => o("jal", tgt(off)),
                _ => o("jal", format!("{}, {}", x(rd), tgt(off))),
            }
        }
        0x67 if f3 == 0 => {
            if rd == 0 && rs1 == 1 && imm_i == 0 {
                o0("ret")
            } else if rd == 0 && imm_i == 0 {
                o("jr", x(rs1).into())
            } else if rd == 1 && imm_i == 0 {
                o("jalr", x(rs1).into())
            } else {
                o("jalr", format!("{}, {imm_i}({})", x(rd), x(rs1)))
            }
        }
        0x63 if f3 != 2 && f3 != 3 => {
            let off = sext(((w >> 31) & 1) << 12 | ((w >> 7) & 1) << 11 | ((w >> 25) & 0x3F) << 5 | ((w >> 8) & 0xF) << 1, 13);
            let m = ["beq", "bne", "", "", "blt", "bge", "bltu", "bgeu"][f3 as usize];
            if rs2 == 0 && f3 < 2 {
                o(if f3 == 0 { "beqz" } else { "bnez" }, format!("{}, {}", x(rs1), tgt(off)))
            } else {
                o(m, format!("{}, {}, {}", x(rs1), x(rs2), tgt(off)))
            }
        }
        0x03 if f3 != 7 && (rv64 || (f3 != 3 && f3 != 6)) => {
            o(["lb", "lh", "lw", "ld", "lbu", "lhu", "lwu"][f3 as usize], format!("{}, {imm_i}({})", x(rd), x(rs1)))
        }
        0x23 if f3 < 3 || (rv64 && f3 == 3) => o(["sb", "sh", "sw", "sd"][f3 as usize], format!("{}, {imm_s}({})", x(rs2), x(rs1))),
        0x13 => {
            let shamt_ok = if rv64 { true } else { (w >> 25) & 1 == 0 };
            let shamt = (w >> 20) & if rv64 { 0x3F } else { 0x1F };
            match f3 {
                0 if rd == 0 && rs1 == 0 && imm_i == 0 => o0("nop"),
                0 if rs1 == 0 => o("li", format!("{}, {imm_i}", x(rd))),
                0 if imm_i == 0 => o("mv", format!("{}, {}", x(rd), x(rs1))),
                3 if imm_i == 1 => o("seqz", format!("{}, {}", x(rd), x(rs1))),
                4 if imm_i == -1 => o("not", format!("{}, {}", x(rd), x(rs1))),
                0 | 2 | 3 | 4 | 6 | 7 => o(["addi", "", "slti", "sltiu", "xori", "", "ori", "andi"][f3 as usize], format!("{}, {}, {imm_i}", x(rd), x(rs1))),
                1 if w >> 26 == 0 && shamt_ok => o("slli", format!("{}, {}, {shamt}", x(rd), x(rs1))),
                5 if w >> 26 == 0 && shamt_ok => o("srli", format!("{}, {}, {shamt}", x(rd), x(rs1))),
                5 if w >> 26 == 0x10 && shamt_ok => o("srai", format!("{}, {}, {shamt}", x(rd), x(rs1))),
                _ => None,
            }
        }
        0x1B if rv64 => match f3 {
            0 if imm_i == 0 => o("sext.w", format!("{}, {}", x(rd), x(rs1))),
            0 => o("addiw", format!("{}, {}, {imm_i}", x(rd), x(rs1))),
            1 if f7 == 0 => o("slliw", format!("{}, {}, {rs2}", x(rd), x(rs1))),
            5 if f7 == 0 => o("srliw", format!("{}, {}, {rs2}", x(rd), x(rs1))),
            5 if f7 == 0x20 => o("sraiw", format!("{}, {}, {rs2}", x(rd), x(rs1))),
            _ => None,
        },
        0x33 | 0x3B => {
            let wide = opcode == 0x3B;
            if wide && !rv64 {
                return None;
            }
            let m = match (f7, f3) {
                (0, _) if !wide => ["add", "sll", "slt", "sltu", "xor", "srl", "or", "and"][f3 as usize],
                (0x20, 0) if rs1 == 0 => return o(if wide { "negw" } else { "neg" }, format!("{}, {}", x(rd), x(rs2))),
                (0x20, 0) => "sub",
                (0x20, 5) => "sra",
                (1, _) if !wide => ["mul", "mulh", "mulhsu", "mulhu", "div", "divu", "rem", "remu"][f3 as usize],
                (0, 0) => "add",
                (0, 1) => "sll",
                (0, 5) => "srl",
                (1, 0) => "mul",
                (1, 4..=7) => ["div", "divu", "rem", "remu"][f3 as usize - 4],
                _ => return None,
            };
            let m = if wide { format!("{m}w") } else { m.to_string() };
            o(&m, format!("{}, {}, {}", x(rd), x(rs1), x(rs2)))
        }
        0x0F => match f3 {
            0 if rd == 0 && rs1 == 0 => {
                let bits = |v: u32| {
                    let s: String = ['i', 'o', 'r', 'w'].iter().enumerate().filter(|(i, _)| v & (8 >> i) != 0).map(|(_, c)| *c).collect();
                    if s.is_empty() { "0".to_string() } else { s }
                };
                let (pred, succ) = ((w >> 24) & 15, (w >> 20) & 15);
                if w >> 28 == 8 && pred == 3 && succ == 3 {
                    o0("fence.tso")
                } else if pred == 15 && succ == 15 {
                    o0("fence")
                } else {
                    o("fence", format!("{}, {}", bits(pred), bits(succ)))
                }
            }
            1 => o0("fence.i"),
            _ => None,
        },
        0x73 => match f3 {
            0 => match w {
                0x0000_0073 => o0("ecall"),
                0x0010_0073 => o0("ebreak"),
                0x1020_0073 => o0("sret"),
                0x3020_0073 => o0("mret"),
                0x1050_0073 => o0("wfi"),
                _ if f7 == 0x09 && rd == 0 => o("sfence.vma", format!("{}, {}", x(rs1), x(rs2))),
                _ => None,
            },
            4 => None,
            _ => {
                let csr = rv_csr(w >> 20);
                let imm = f3 >= 5;
                let src = if imm { rs1.to_string() } else { x(rs1).to_string() };
                let m = ["", "csrrw", "csrrs", "csrrc", "", "csrrwi", "csrrsi", "csrrci"][f3 as usize];
                if f3 == 2 && rs1 == 0 {
                    o("csrr", format!("{}, {csr}", x(rd)))
                } else if rd == 0 {
                    o(&format!("csr{}", &m[4..]), format!("{csr}, {src}"))
                } else {
                    o(m, format!("{}, {csr}, {src}", x(rd)))
                }
            }
        },
        0x2F if f3 == 2 || (rv64 && f3 == 3) => {
            let sz = if f3 == 2 { "w" } else { "d" };
            let ord = match (w >> 25) & 3 {
                0 => "",
                1 => ".rl",
                2 => ".aq",
                _ => ".aqrl",
            };
            let f5 = w >> 27;
            match f5 {
                2 if rs2 == 0 => o(&format!("lr.{sz}{ord}"), format!("{}, ({})", x(rd), x(rs1))),
                3 => o(&format!("sc.{sz}{ord}"), format!("{}, {}, ({})", x(rd), x(rs2), x(rs1))),
                0 | 1 | 4 | 8 | 12 | 16 | 20 | 24 | 28 => {
                    let m = match f5 {
                        0 => "amoadd",
                        1 => "amoswap",
                        4 => "amoxor",
                        8 => "amoor",
                        12 => "amoand",
                        16 => "amomin",
                        20 => "amomax",
                        24 => "amominu",
                        _ => "amomaxu",
                    };
                    o(&format!("{m}.{sz}{ord}"), format!("{}, {}, ({})", x(rd), x(rs2), x(rs1)))
                }
                _ => None,
            }
        }
        0x07 if f3 == 2 || f3 == 3 => o(if f3 == 2 { "flw" } else { "fld" }, format!("{}, {imm_i}({})", fr(rd), x(rs1))),
        0x27 if f3 == 2 || f3 == 3 => o(if f3 == 2 { "fsw" } else { "fsd" }, format!("{}, {imm_s}({})", fr(rs2), x(rs1))),
        0x43 | 0x47 | 0x4B | 0x4F if (w >> 25) & 3 < 2 => {
            let m = ["fmadd", "fmsub", "fnmsub", "fnmadd"][((opcode - 0x43) / 4) as usize];
            let fmt = if (w >> 25) & 1 == 0 { "s" } else { "d" };
            o(&format!("{m}.{fmt}"), format!("{}, {}, {}, {}", fr(rd), fr(rs1), fr(rs2), fr(w >> 27)))
        }
        0x53 => {
            let fmt = if f7 & 1 == 0 { "s" } else { "d" };
            if f7 & 2 != 0 {
                return None; // H / Q formats
            }
            match f7 >> 2 {
                0..=3 => o(&format!("{}.{fmt}", ["fadd", "fsub", "fmul", "fdiv"][(f7 >> 2) as usize]), format!("{}, {}, {}", fr(rd), fr(rs1), fr(rs2))),
                0x0B if rs2 == 0 => o(&format!("fsqrt.{fmt}"), format!("{}, {}", fr(rd), fr(rs1))),
                0x04 if f3 < 3 => {
                    if rs1 == rs2 {
                        o(&format!("{}.{fmt}", ["fmv", "fneg", "fabs"][f3 as usize]), format!("{}, {}", fr(rd), fr(rs1)))
                    } else {
                        o(&format!("{}.{fmt}", ["fsgnj", "fsgnjn", "fsgnjx"][f3 as usize]), format!("{}, {}, {}", fr(rd), fr(rs1), fr(rs2)))
                    }
                }
                0x05 if f3 < 2 => o(&format!("{}.{fmt}", if f3 == 0 { "fmin" } else { "fmax" }), format!("{}, {}, {}", fr(rd), fr(rs1), fr(rs2))),
                0x08 if f7 == 0x20 && rs2 == 1 => o("fcvt.s.d", format!("{}, {}", fr(rd), fr(rs1))),
                0x08 if f7 == 0x21 && rs2 == 0 => o("fcvt.d.s", format!("{}, {}", fr(rd), fr(rs1))),
                0x14 if f3 < 3 => o(&format!("{}.{fmt}", ["fle", "flt", "feq"][f3 as usize]), format!("{}, {}, {}", x(rd), fr(rs1), fr(rs2))),
                0x18 if rs2 < 2 || (rv64 && rs2 < 4) => o(&format!("fcvt.{}.{fmt}", ["w", "wu", "l", "lu"][rs2 as usize]), format!("{}, {}", x(rd), fr(rs1))),
                0x1A if rs2 < 2 || (rv64 && rs2 < 4) => o(&format!("fcvt.{fmt}.{}", ["w", "wu", "l", "lu"][rs2 as usize]), format!("{}, {}", fr(rd), x(rs1))),
                0x1C if rs2 == 0 && f3 == 0 && (fmt == "s" || rv64) => o(if fmt == "s" { "fmv.x.w" } else { "fmv.x.d" }, format!("{}, {}", x(rd), fr(rs1))),
                0x1C if rs2 == 0 && f3 == 1 => o(&format!("fclass.{fmt}"), format!("{}, {}", x(rd), fr(rs1))),
                0x1E if rs2 == 0 && f3 == 0 && (fmt == "s" || rv64) => o(if fmt == "s" { "fmv.w.x" } else { "fmv.d.x" }, format!("{}, {}", fr(rd), x(rs1))),
                _ => None,
            }
        }
        _ => None,
    }
}

/// RISC-V compressed (C extension) instruction → (mnemonic, operands).
fn riscv_c(h: u16, rv64: bool, tgt: &dyn Fn(i64) -> String) -> Option<(String, String)> {
    let h = h as u32;
    let x = |i: u32| RV_X[(i & 31) as usize];
    let fr = |i: u32| RV_F[(i & 31) as usize];
    let xp = |i: u32| RV_X[(8 + (i & 7)) as usize];
    let fp = |i: u32| RV_F[(8 + (i & 7)) as usize];
    let o = |m: &str, ops: String| Some((m.to_string(), ops));
    let f3 = h >> 13;
    let rd = (h >> 7) & 31;
    let rs2 = (h >> 2) & 31;
    let rdp = (h >> 2) & 7; // rd' / rs2'
    let rs1p = (h >> 7) & 7; // rs1' / rd'
    let imm6 = sext(((h >> 12) & 1) << 5 | ((h >> 2) & 0x1F), 6);
    let shamt = ((h >> 12) & 1) << 5 | ((h >> 2) & 0x1F);
    let uimm_w = ((h >> 10) & 7) << 3 | ((h >> 6) & 1) << 2 | ((h >> 5) & 1) << 6;
    let uimm_d = ((h >> 10) & 7) << 3 | ((h >> 5) & 3) << 6;
    match (h & 3, f3) {
        (0, 0) => {
            let nz = ((h >> 7) & 0xF) << 6 | ((h >> 11) & 3) << 4 | ((h >> 5) & 1) << 3 | ((h >> 6) & 1) << 2;
            if nz == 0 {
                return None; // includes the all-zero illegal instruction
            }
            o("c.addi4spn", format!("{}, sp, {nz}", xp(rdp)))
        }
        (0, 1) => o("c.fld", format!("{}, {uimm_d}({})", fp(rdp), xp(rs1p))),
        (0, 2) => o("c.lw", format!("{}, {uimm_w}({})", xp(rdp), xp(rs1p))),
        (0, 3) if rv64 => o("c.ld", format!("{}, {uimm_d}({})", xp(rdp), xp(rs1p))),
        (0, 3) => o("c.flw", format!("{}, {uimm_w}({})", fp(rdp), xp(rs1p))),
        (0, 5) => o("c.fsd", format!("{}, {uimm_d}({})", fp(rdp), xp(rs1p))),
        (0, 6) => o("c.sw", format!("{}, {uimm_w}({})", xp(rdp), xp(rs1p))),
        (0, 7) if rv64 => o("c.sd", format!("{}, {uimm_d}({})", xp(rdp), xp(rs1p))),
        (0, 7) => o("c.fsw", format!("{}, {uimm_w}({})", fp(rdp), xp(rs1p))),
        (1, 0) if rd == 0 => o("c.nop", String::new()),
        (1, 0) => o("c.addi", format!("{}, {imm6}", x(rd))),
        (1, 1) if rv64 => {
            if rd == 0 {
                return None;
            }
            o("c.addiw", format!("{}, {imm6}", x(rd)))
        }
        (1, 1) | (1, 5) => {
            let off = sext(
                ((h >> 12) & 1) << 11 | ((h >> 11) & 1) << 4 | ((h >> 9) & 3) << 8 | ((h >> 8) & 1) << 10 | ((h >> 7) & 1) << 6 | ((h >> 6) & 1) << 7 | ((h >> 3) & 7) << 1 | ((h >> 2) & 1) << 5,
                12,
            );
            o(if f3 == 1 { "c.jal" } else { "c.j" }, tgt(off))
        }
        (1, 2) => o("c.li", format!("{}, {imm6}", x(rd))),
        (1, 3) if rd == 2 => {
            let nz = sext(((h >> 12) & 1) << 9 | ((h >> 6) & 1) << 4 | ((h >> 5) & 1) << 6 | ((h >> 3) & 3) << 7 | ((h >> 2) & 1) << 5, 10);
            if nz == 0 {
                return None;
            }
            o("c.addi16sp", format!("sp, {nz}"))
        }
        (1, 3) => {
            if imm6 == 0 {
                return None;
            }
            o("c.lui", format!("{}, 0x{:x}", x(rd), (imm6 as u32) & 0xFFFFF))
        }
        (1, 4) => {
            let r = xp(rs1p);
            match (h >> 10) & 3 {
                0 | 1 => {
                    if !rv64 && shamt >= 32 {
                        return None;
                    }
                    o(if (h >> 10) & 3 == 0 { "c.srli" } else { "c.srai" }, format!("{r}, {shamt}"))
                }
                2 => o("c.andi", format!("{r}, {imm6}")),
                _ => {
                    let m = match ((h >> 12) & 1, (h >> 5) & 3) {
                        (0, 0) => "c.sub",
                        (0, 1) => "c.xor",
                        (0, 2) => "c.or",
                        (0, 3) => "c.and",
                        (1, 0) if rv64 => "c.subw",
                        (1, 1) if rv64 => "c.addw",
                        _ => return None,
                    };
                    o(m, format!("{r}, {}", xp(rdp)))
                }
            }
        }
        (1, 6) | (1, 7) => {
            let off = sext(((h >> 12) & 1) << 8 | ((h >> 10) & 3) << 3 | ((h >> 5) & 3) << 6 | ((h >> 3) & 3) << 1 | ((h >> 2) & 1) << 5, 9);
            o(if f3 == 6 { "c.beqz" } else { "c.bnez" }, format!("{}, {}", xp(rs1p), tgt(off)))
        }
        (2, 0) => {
            if !rv64 && shamt >= 32 {
                return None;
            }
            o("c.slli", format!("{}, {shamt}", x(rd)))
        }
        (2, 1) => o("c.fldsp", format!("{}, {}(sp)", fr(rd), ((h >> 12) & 1) << 5 | ((h >> 5) & 3) << 3 | ((h >> 2) & 7) << 6)),
        (2, 2) => {
            if rd == 0 {
                return None;
            }
            o("c.lwsp", format!("{}, {}(sp)", x(rd), ((h >> 12) & 1) << 5 | ((h >> 4) & 7) << 2 | ((h >> 2) & 3) << 6))
        }
        (2, 3) if rv64 => {
            if rd == 0 {
                return None;
            }
            o("c.ldsp", format!("{}, {}(sp)", x(rd), ((h >> 12) & 1) << 5 | ((h >> 5) & 3) << 3 | ((h >> 2) & 7) << 6))
        }
        (2, 3) => o("c.flwsp", format!("{}, {}(sp)", fr(rd), ((h >> 12) & 1) << 5 | ((h >> 4) & 7) << 2 | ((h >> 2) & 3) << 6)),
        (2, 4) => match ((h >> 12) & 1, rd, rs2) {
            (0, 0, 0) => None,
            (0, _, 0) => o("c.jr", x(rd).into()),
            (0, _, _) => o("c.mv", format!("{}, {}", x(rd), x(rs2))),
            (1, 0, 0) => o("c.ebreak", String::new()),
            (1, _, 0) => o("c.jalr", x(rd).into()),
            _ => o("c.add", format!("{}, {}", x(rd), x(rs2))),
        },
        (2, 5) => o("c.fsdsp", format!("{}, {}(sp)", fr(rs2), ((h >> 10) & 7) << 3 | ((h >> 7) & 7) << 6)),
        (2, 6) => o("c.swsp", format!("{}, {}(sp)", x(rs2), ((h >> 9) & 0xF) << 2 | ((h >> 7) & 3) << 6)),
        (2, 7) if rv64 => o("c.sdsp", format!("{}, {}(sp)", x(rs2), ((h >> 10) & 7) << 3 | ((h >> 7) & 7) << 6)),
        (2, 7) => o("c.fswsp", format!("{}, {}(sp)", fr(rs2), ((h >> 9) & 0xF) << 2 | ((h >> 7) & 3) << 6)),
        _ => None,
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Zilog Z80 (algorithmic decoding after "Decoding Z80 Opcodes", including the undocumented IXH/IXL forms)

fn z80(b: &[u8], address: u64) -> Decoded {
    const CC: [&str; 8] = ["nz", "z", "nc", "c", "po", "pe", "p", "m"];
    const ALU: [&str; 8] = ["add a,", "adc a,", "sub", "sbc a,", "and", "xor", "or", "cp"];
    const ROT: [&str; 8] = ["rlc", "rrc", "rl", "rr", "sla", "sra", "sll", "srl"];
    let get = |i: usize| b.get(i).copied();
    let mut pos = 0usize;
    let idx: Option<&str> = match get(0)? {
        0xDD => Some("ix"),
        0xFD => Some("iy"),
        _ => None,
    };
    if idx.is_some() {
        pos = 1;
        if matches!(get(1)?, 0xDD | 0xFD | 0xED) {
            return None; // a prefix that does nothing
        }
    }
    let disp = |d: u8, ix: &str| {
        let d = d as i8;
        if d < 0 {
            format!("({ix}-0x{:02x})", -(d as i16))
        } else {
            format!("({ix}+0x{d:02x})")
        }
    };
    let split = |text: String| {
        let (m, o) = split_text(&text);
        (m, o.replace(",", ", ").replace(",  ", ", "))
    };
    let op = get(pos)?;
    pos += 1;
    // CB prefix
    if op == 0xCB {
        let (target, op2) = match idx {
            Some(ix) => {
                let d = get(pos)?;
                let op2 = get(pos + 1)?;
                pos += 2;
                (Some(disp(d, ix)), op2)
            }
            None => {
                let op2 = get(pos)?;
                pos += 1;
                (None, op2)
            }
        };
        const R: [&str; 8] = ["b", "c", "d", "e", "h", "l", "(hl)", "a"];
        let (x, y, z) = (op2 >> 6, (op2 >> 3) & 7, (op2 & 7) as usize);
        let operand = match &target {
            Some(t) if z != 6 => format!("{t}, {}", R[z]), // undocumented copy into a register
            Some(t) => t.clone(),
            None => R[z].to_string(),
        };
        let (m, o) = match x {
            0 => (ROT[y as usize].to_string(), operand),
            _ => (["", "bit", "res", "set"][x as usize].to_string(), match (&target, x) { (Some(t), 1) => format!("{y}, {t}"), _ => format!("{y}, {operand}") }),
        };
        return Some((pos, m, o));
    }
    // ED prefix
    if op == 0xED {
        const R: [&str; 8] = ["b", "c", "d", "e", "h", "l", "", "a"];
        const RP: [&str; 4] = ["bc", "de", "hl", "sp"];
        let op2 = get(pos)?;
        pos += 1;
        let (x, y, z) = (op2 >> 6, ((op2 >> 3) & 7) as usize, op2 & 7);
        let (p, q) = (y >> 1, y & 1);
        let text = match (x, z) {
            (1, 0) => if y == 6 { "in (c)".to_string() } else { format!("in {}, (c)", R[y]) },
            (1, 1) => if y == 6 { "out (c), 0".to_string() } else { format!("out (c), {}", R[y]) },
            (1, 2) => format!("{} hl, {}", if q == 0 { "sbc" } else { "adc" }, RP[p]),
            (1, 3) => {
                let nn = u16::from_le_bytes([get(pos)?, get(pos + 1)?]);
                pos += 2;
                if q == 0 { format!("ld (0x{nn:04x}), {}", RP[p]) } else { format!("ld {}, (0x{nn:04x})", RP[p]) }
            }
            (1, 4) => "neg".to_string(),
            (1, 5) => if y == 1 { "reti".to_string() } else { "retn".to_string() },
            (1, 6) => format!("im {}", ["0", "0", "1", "2", "0", "0", "1", "2"][y]),
            (1, 7) => match y {
                0 => "ld i, a".to_string(),
                1 => "ld r, a".to_string(),
                2 => "ld a, i".to_string(),
                3 => "ld a, r".to_string(),
                4 => "rrd".to_string(),
                5 => "rld".to_string(),
                _ => return None,
            },
            (2, 0..=3) if y >= 4 => {
                const BLI: [[&str; 4]; 4] = [["ldi", "cpi", "ini", "outi"], ["ldd", "cpd", "ind", "outd"], ["ldir", "cpir", "inir", "otir"], ["lddr", "cpdr", "indr", "otdr"]];
                BLI[y - 4][z as usize].to_string()
            }
            _ => return None,
        };
        let (m, o) = split_text(&text);
        return Some((pos, m, o));
    }
    // Unprefixed (or DD/FD) opcode.
    let hl = idx.unwrap_or("hl");
    let (x, y, z) = (op >> 6, ((op >> 3) & 7) as usize, (op & 7) as usize);
    let (p, q) = (y >> 1, y & 1);
    let rp = [String::from("bc"), "de".into(), hl.into(), "sp".into()];
    let rp2 = [String::from("bc"), "de".into(), hl.into(), "af".into()];
    // r[i] with the index register: (hl) → (ix+d) (displacement read from the stream), h/l → ixh/ixl unless the
    // same instruction also uses (ix+d).
    let uses_mem = (x == 1 && (y == 6 || z == 6) && !(y == 6 && z == 6)) || (x == 0 && (4..=6).contains(&z) && y == 6) || (x == 2 && z == 6);
    let mut mem_operand = String::from("(hl)");
    if let (Some(ix), true) = (idx, uses_mem) {
        mem_operand = disp(get(pos)?, ix);
        pos += 1;
    }
    let r = |i: usize| -> String {
        match (i, idx) {
            (6, _) => mem_operand.clone(),
            (4, Some(ix)) if !uses_mem => format!("{ix}h"),
            (5, Some(ix)) if !uses_mem => format!("{ix}l"),
            _ => ["b", "c", "d", "e", "h", "l", "", "a"][i].to_string(),
        }
    };
    let mut n8 = || -> Option<u8> {
        let v = get(pos)?;
        pos += 1;
        Some(v)
    };
    let text: String = match x {
        0 => match z {
            0 => match y {
                0 => "nop".into(),
                1 => "ex af,af'".into(),
                _ => {
                    let e = n8()? as i8 as i64;
                    let t = format!("0x{:04x}", (address as i64 + pos as i64 + e) as u16);
                    match y {
                        2 => format!("djnz {t}"),
                        3 => format!("jr {t}"),
                        _ => format!("jr {},{t}", CC[y - 4]),
                    }
                }
            },
            1 => {
                if q == 0 {
                    let nn = u16::from_le_bytes([n8()?, n8()?]);
                    format!("ld {},0x{nn:04x}", rp[p])
                } else {
                    format!("add {hl},{}", rp[p])
                }
            }
            2 => match (q, p) {
                (0, 0) => "ld (bc),a".into(),
                (0, 1) => "ld (de),a".into(),
                (1, 0) => "ld a,(bc)".into(),
                (1, 1) => "ld a,(de)".into(),
                _ => {
                    let nn = u16::from_le_bytes([n8()?, n8()?]);
                    match (q, p) {
                        (0, 2) => format!("ld (0x{nn:04x}),{hl}"),
                        (0, _) => format!("ld (0x{nn:04x}),a"),
                        (_, 2) => format!("ld {hl},(0x{nn:04x})"),
                        _ => format!("ld a,(0x{nn:04x})"),
                    }
                }
            },
            3 => format!("{} {}", if q == 0 { "inc" } else { "dec" }, rp[p]),
            4 => format!("inc {}", r(y)),
            5 => format!("dec {}", r(y)),
            6 => {
                let n = n8()?;
                format!("ld {},0x{n:02x}", r(y))
            }
            _ => ["rlca", "rrca", "rla", "rra", "daa", "cpl", "scf", "ccf"][y].into(),
        },
        1 => {
            if y == 6 && z == 6 {
                "halt".into()
            } else {
                // ld h,(ix+d) keeps the plain h; r() already handles that through uses_mem.
                format!("ld {},{}", r(y), r(z))
            }
        }
        2 => format!("{} {}", ALU[y], r(z)),
        _ => match z {
            0 => format!("ret {}", CC[y]),
            1 => {
                if q == 0 {
                    format!("pop {}", rp2[p])
                } else {
                    match p {
                        0 => "ret".into(),
                        1 => "exx".into(),
                        2 => format!("jp ({hl})"),
                        _ => format!("ld sp,{hl}"),
                    }
                }
            }
            2 => {
                let nn = u16::from_le_bytes([n8()?, n8()?]);
                format!("jp {},0x{nn:04x}", CC[y])
            }
            3 => match y {
                0 => {
                    let nn = u16::from_le_bytes([n8()?, n8()?]);
                    format!("jp 0x{nn:04x}")
                }
                2 => {
                    let n = n8()?;
                    format!("out (0x{n:02x}),a")
                }
                3 => {
                    let n = n8()?;
                    format!("in a,(0x{n:02x})")
                }
                4 => format!("ex (sp),{hl}"),
                5 => "ex de,hl".into(),
                6 => "di".into(),
                7 => "ei".into(),
                _ => return None,
            },
            4 => {
                let nn = u16::from_le_bytes([n8()?, n8()?]);
                format!("call {},0x{nn:04x}", CC[y])
            }
            5 => {
                if q == 0 {
                    format!("push {}", rp2[p])
                } else if p == 0 {
                    let nn = u16::from_le_bytes([n8()?, n8()?]);
                    format!("call 0x{nn:04x}")
                } else {
                    return None;
                }
            }
            6 => {
                let n = n8()?;
                format!("{} 0x{n:02x}", ALU[y])
            }
            _ => format!("rst 0x{:02x}", y * 8),
        },
    };
    let (m, o) = split(text);
    Some((pos, m, o))
}

// ---------------------------------------------------------------------------------------------------------------
// Intel 8080

fn i8080(b: &[u8]) -> Decoded {
    const R: [&str; 8] = ["b", "c", "d", "e", "h", "l", "m", "a"];
    const RP: [&str; 4] = ["b", "d", "h", "sp"];
    const RP2: [&str; 4] = ["b", "d", "h", "psw"];
    const CC: [&str; 8] = ["nz", "z", "nc", "c", "po", "pe", "p", "m"];
    let op = *b.first()?;
    let d8 = || b.get(1).map(|v| format!("0x{v:02x}"));
    let d16 = || if b.len() >= 3 { Some(format!("0x{:04x}", u16::from_le_bytes([b[1], b[2]]))) } else { None };
    let o = |len: usize, m: &str, ops: String| Some((len, m.to_string(), ops));
    let (x, y, z) = (op >> 6, ((op >> 3) & 7) as usize, op & 7);
    let (p, q) = (y >> 1, y & 1);
    match x {
        0 => match z {
            0 if y == 0 => o(1, "nop", String::new()),
            1 if q == 0 => o(3, "lxi", format!("{}, {}", RP[p], d16()?)),
            1 => o(1, "dad", RP[p].into()),
            2 => match (q, p) {
                (0, 0) | (0, 1) => o(1, "stax", RP[p].into()),
                (1, 0) | (1, 1) => o(1, "ldax", RP[p].into()),
                (0, 2) => o(3, "shld", d16()?),
                (0, _) => o(3, "sta", d16()?),
                (_, 2) => o(3, "lhld", d16()?),
                _ => o(3, "lda", d16()?),
            },
            3 => o(1, if q == 0 { "inx" } else { "dcx" }, RP[p].into()),
            4 => o(1, "inr", R[y].into()),
            5 => o(1, "dcr", R[y].into()),
            6 => o(2, "mvi", format!("{}, {}", R[y], d8()?)),
            7 => o(1, ["rlc", "rrc", "ral", "rar", "daa", "cma", "stc", "cmc"][y], String::new()),
            _ => None,
        },
        1 if op == 0x76 => o(1, "hlt", String::new()),
        1 => o(1, "mov", format!("{}, {}", R[y], R[z as usize])),
        2 => o(1, ["add", "adc", "sub", "sbb", "ana", "xra", "ora", "cmp"][y], R[z as usize].into()),
        _ => match z {
            0 => o(1, &format!("r{}", CC[y]), String::new()),
            1 => match (q, p) {
                (0, _) => o(1, "pop", RP2[p].into()),
                (1, 0) => o(1, "ret", String::new()),
                (1, 2) => o(1, "pchl", String::new()),
                (1, 3) => o(1, "sphl", String::new()),
                _ => None,
            },
            2 => o(3, &format!("j{}", CC[y]), d16()?),
            3 => match y {
                0 => o(3, "jmp", d16()?),
                2 => o(2, "out", d8()?),
                3 => o(2, "in", d8()?),
                4 => o(1, "xthl", String::new()),
                5 => o(1, "xchg", String::new()),
                6 => o(1, "di", String::new()),
                7 => o(1, "ei", String::new()),
                _ => None,
            },
            4 => o(3, &format!("c{}", CC[y]), d16()?),
            5 if q == 0 => o(1, "push", RP2[p].into()),
            5 if p == 0 => o(3, "call", d16()?),
            6 => o(2, ["adi", "aci", "sui", "sbi", "ani", "xri", "ori", "cpi"][y], d8()?),
            7 => o(1, "rst", y.to_string()),
            _ => None,
        },
    }
}

// ---------------------------------------------------------------------------------------------------------------

fn decode_arch(bytes: &[u8], offset: u64, base: u64, arch: &str, syntax: &str, max: usize) -> Result<Vec<Item>, String> {
    Ok(match arch {
        "x86-16" => x86(bytes, offset, base, 16, syntax, max),
        "x86-32" => x86(bytes, offset, base, 32, syntax, max),
        "x86-64" => x86(bytes, offset, base, 64, syntax, max),
        "arm32" | "arm64" => run(bytes, offset, base, max, 4, |b, _| arm(b, arch)),
        "thumb" => run(bytes, offset, base, max, 2, |b, _| arm(b, arch)),
        "mips32be" => run(bytes, offset, base, max, 4, |b, a| mips(b, a, true, false)),
        "mips32le" => run(bytes, offset, base, max, 4, |b, a| mips(b, a, false, false)),
        "mips64be" => run(bytes, offset, base, max, 4, |b, a| mips(b, a, true, true)),
        "mips64le" => run(bytes, offset, base, max, 4, |b, a| mips(b, a, false, true)),
        "riscv32" => run(bytes, offset, base, max, 2, |b, a| riscv(b, a, false)),
        "riscv64" => run(bytes, offset, base, max, 2, |b, a| riscv(b, a, true)),
        "ppc32" | "ppc64" | "ppc64le" => run(bytes, offset, base, max, 4, |b, a| ppc(b, a, arch)),
        "sh4" => run(bytes, offset, base, max, 2, |b, a| superh(b, a, false)),
        "sh4be" => run(bytes, offset, base, max, 2, |b, a| superh(b, a, true)),
        "6502" => run(bytes, offset, base, max, 1, m6502),
        "avr" => run(bytes, offset, base, max, 2, avr),
        "msp430" => run(bytes, offset, base, max, 2, msp430),
        "z80" => run(bytes, offset, base, max, 1, z80),
        "8080" => run(bytes, offset, base, max, 1, |b, _| i8080(b)),
        other => return Err(format!("unknown architecture {other}")),
    })
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
    let items = decode_arch(&bytes, offset, base, arch, syntax, max)?;
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

    fn at(bytes: &[u8], arch: &str, base: u64) -> Vec<String> {
        let r = disasm(&bytes.to_vec(), &json!({ "offset": 0, "arch": arch, "base": base })).unwrap();
        r["items"].as_array().unwrap().iter().map(|i| i["text"].as_str().unwrap().to_string()).collect()
    }

    /// 32-bit words → bytes in the given order.
    fn words(ws: &[u32], be: bool) -> Vec<u8> {
        ws.iter().flat_map(|w| if be { w.to_be_bytes() } else { w.to_le_bytes() }).collect()
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

    #[test]
    fn mips32_both_endians() {
        let prog = [0x27BDFFE8, 0xAFBF0014, 0x8FBF0014, 0x03E00008, 0x00000000, 0x3C1C0042, 0x00851021, 0x00042080, 0x10400003, 0x0C100000, 0x00801025, 0x46220000];
        let want = vec![
            "addiu sp, sp, -24",
            "sw ra, 20(sp)",
            "lw ra, 20(sp)",
            "jr ra",
            "nop",
            "lui gp, 0x42",
            "addu v0, a0, a1",
            "sll a0, a0, 2",
            "beqz v0, 0x400030",
            "jal 0x400000",
            "move v0, a0",
            "add.d $f0, $f0, $f2",
        ];
        assert_eq!(at(&words(&prog, true), "mips32be", 0x400000), want);
        assert_eq!(at(&words(&prog, false), "mips32le", 0x400000), want);
        // MIPS64-only encodings are data on MIPS32 …
        let ld = words(&[0xDFBF0008, 0x0064102D, 0x67BDFFF0, 0x000217F8], true);
        assert_eq!(at(&ld, "mips32be", 0)[0], "db 0xDF");
        // … and real instructions on MIPS64.
        assert_eq!(at(&ld, "mips64be", 0), vec!["ld ra, 8(sp)", "daddu v0, v1, a0", "daddiu sp, sp, -16", "dsll v0, v0, 31"]);
        // bytes from the truncated tail become db
        assert_eq!(texts(&[0x27, 0xBD, 0xFF], "mips32be", "mips"), vec!["db 0x27", "db 0xBD", "db 0xFF"]);
    }

    #[test]
    fn riscv_base_and_compressed() {
        // 32-bit encodings
        let prog = words(&[0x00000513, 0xFE010113, 0x00008067, 0x02B50533, 0x0000006F, 0x00113423, 0x00A12623, 0x02010113, 0x00000073, 0x30200073, 0x00B50463, 0x100022F3], false);
        assert_eq!(
            at(&prog, "riscv64", 0x1000),
            vec![
                "li a0, 0",
                "addi sp, sp, -32",
                "ret",
                "mul a0, a0, a1",
                "j 0x1010",
                "sd ra, 8(sp)",
                "sw a0, 12(sp)",
                "addi sp, sp, 32",
                "ecall",
                "mret",
                "beq a0, a1, 0x1030",
                "csrr t0, sstatus",
            ]
        );
        // compressed encodings
        let c: Vec<u8> = [0x4501u16, 0x8082, 0x1141, 0xE406, 0x852E, 0x0001, 0x0505, 0x60A2].iter().flat_map(|h| h.to_le_bytes()).collect();
        assert_eq!(at(&c, "riscv64", 0), vec!["c.li a0, 0", "c.jr ra", "c.addi sp, -16", "c.sdsp ra, 8(sp)", "c.mv a0, a1", "c.nop", "c.addi a0, 1", "c.ldsp ra, 8(sp)"]);
        // RV32 differs: c.jal / c.flw instead of c.addiw / c.ld, and no 64-bit-only encodings
        assert_eq!(at(&[0x01, 0x20], "riscv32", 0x100), vec!["c.jal 0x100"]);
        assert_eq!(at(&[0x05, 0x25], "riscv64", 0), vec!["c.addiw a0, 1"]);
        assert_eq!(texts(&words(&[0x00113423], false), "riscv32", "riscv"), vec!["db 0x23", "db 0x34", "c.nop"]);
        // 0000 is the defined illegal instruction; float + atomics
        assert_eq!(texts(&[0, 0], "riscv32", "riscv"), vec!["db 0x00", "db 0x00"]);
        let fa = words(&[0x00053507, 0x02B57553, 0x100527AF, 0x00B5202F], false);
        assert_eq!(texts(&fa, "riscv64", "riscv"), vec!["fld fa0, 0(a0)", "fadd.d fa0, fa0, fa1", "lr.w a5, (a0)", "amoadd.w zero, a1, (a0)"]);
    }

    #[test]
    fn powerpc() {
        let prog = [0x7C, 0x08, 0x02, 0xA6, 0x94, 0x21, 0xFF, 0xF0, 0x4E, 0x80, 0x00, 0x20, 0x38, 0x60, 0x00, 0x01, 0x48, 0x00, 0x00, 0x10];
        let t = at(&prog, "ppc32", 0x1000);
        assert_eq!(&t[..4], &["mflr r0", "stwu r1, -0x10(r1)", "blr", "li r3, 1"]);
        assert_eq!(t[4], "b 0x1020");
        // little-endian 64-bit: same mflr word, bytes reversed
        assert_eq!(texts(&[0xA6, 0x02, 0x08, 0x7C], "ppc64le", "ppc"), vec!["mflr r0"]);
        assert_eq!(texts(&prog[..4], "ppc64", "ppc"), vec!["mflr r0"]);
        // backwards branch below zero wraps at 32 bits on ppc32
        assert_eq!(at(&[0x4B, 0xFF, 0xFF, 0xE0], "ppc32", 0x10), vec!["b 0xfffffff0"]);
        assert_eq!(at(&[0xE8, 0x61, 0x00, 0x08], "ppc64", 0), vec!["ld r3, 8(r1)"]);
    }

    #[test]
    fn mos6502_basic() {
        let t = at(&[0xA9, 0x01, 0x8D, 0x00, 0x20, 0xD0, 0xFE, 0x60, 0x02, 0xA9], "6502", 0xC000);
        assert_eq!(t, vec!["lda #$01", "sta $2000", "bne $c005", "rts", "db 0x02", "db 0xA9"]);
    }

    #[test]
    fn avr_basic() {
        let t = at(&[0x00, 0x00, 0x0F, 0xEF, 0x08, 0x95, 0x0C, 0x94, 0x34, 0x00, 0xFF, 0xCF, 0x01, 0xF4], "avr", 0x100);
        assert_eq!(t, vec!["nop", "ldi r16, 0xff", "ret", "jmp 0x68", "rjmp 0x10a", "brne 0x10e"]);
    }

    #[test]
    fn msp430_basic() {
        let t = at(&[0x30, 0x41, 0x3F, 0x40, 0x34, 0x12, 0x03, 0x43, 0xB0, 0x12, 0x00, 0x44, 0x0F, 0x5E, 0xFE, 0x3F, 0xC2, 0x43, 0x00, 0x02], "msp430", 0x4400);
        assert_eq!(t, vec!["ret", "mov #0x1234, r15", "nop", "call #0x4400", "add r14, r15", "jmp 0x440c", "clr.b &0x0200"]);
    }

    #[test]
    fn superh_basic() {
        assert_eq!(texts(&[0x0B, 0x00, 0x09, 0x00], "sh4", "sh"), vec!["rts", "nop"]);
        assert_eq!(texts(&[0x00, 0x0B], "sh4be", "sh"), vec!["rts"]);
        // bra (self), mov.l @(disp,pc), add #-1, mov.l @(disp,rm), bt
        let t = at(&[0xFE, 0xAF, 0x02, 0xD1, 0xFF, 0x7F, 0x21, 0x51, 0x01, 0x89], "sh4", 0x1000);
        assert_eq!(t, vec!["bra 0x1000", "mov.l 0x100c,r1", "add #-1,r15", "mov.l @(4,r2),r1", "bt 0x100e"]);
    }

    #[test]
    fn z80_basic() {
        let prog = [0x3E, 0x01, 0x21, 0x34, 0x12, 0xC3, 0x00, 0x80, 0xDD, 0x7E, 0x05, 0xFD, 0x36, 0xFE, 0x42, 0xCB, 0x7F, 0xDD, 0xCB, 0x02, 0xC6, 0xED, 0xB0, 0x18, 0xFE, 0xC9, 0xDD, 0x24, 0x08, 0xED, 0x43, 0x00, 0x40];
        let t = at(&prog, "z80", 0x100);
        assert_eq!(
            t,
            vec![
                "ld a, 0x01",
                "ld hl, 0x1234",
                "jp 0x8000",
                "ld a, (ix+0x05)",
                "ld (iy-0x02), 0x42",
                "bit 7, a",
                "set 0, (ix+0x02)",
                "ldir",
                "jr 0x0117",
                "ret",
                "inc ixh",
                "ex af, af'",
                "ld (0x4000), bc",
            ]
        );
        assert_eq!(texts(&[0x80, 0xDD, 0x86, 0x01], "z80", "zilog"), vec!["add a, b", "add a, (ix+0x01)"]);
        assert_eq!(texts(&[0xDD, 0xDD, 0x00, 0x3E], "z80", "zilog"), vec!["db 0xDD", "nop", "db 0x3E"]);
    }

    #[test]
    fn i8080_basic() {
        let t = texts(&[0x3E, 0x01, 0x21, 0x34, 0x12, 0x78, 0xC3, 0x00, 0x80, 0x76, 0xCD, 0x00, 0x01, 0xC9, 0xF5, 0xFE, 0x0A, 0x08, 0xCD], "8080", "intel");
        assert_eq!(t, vec!["mvi a, 0x01", "lxi h, 0x1234", "mov a, b", "jmp 0x8000", "hlt", "call 0x0100", "ret", "push psw", "cpi 0x0a", "db 0x08", "db 0xCD"]);
    }

    const ALL: &[&str] = &[
        "x86-16", "x86-32", "x86-64", "arm32", "thumb", "arm64", "mips32be", "mips32le", "mips64be", "mips64le", "riscv32", "riscv64", "ppc32", "ppc64", "ppc64le", "sh4",
        "sh4be", "6502", "avr", "msp430", "z80", "8080",
    ];

    #[test]
    fn archs_lists_every_decoder() {
        let ids: Vec<String> = archs().as_array().unwrap().iter().map(|a| a["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, ALL);
        for id in ALL {
            assert!(disasm(&vec![0u8; 8], &json!({ "arch": id })).is_ok(), "{id}");
        }
    }

    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn bytes(&mut self, n: usize) -> Vec<u8> {
            (0..n).map(|_| self.next() as u8).collect()
        }
    }

    #[test]
    fn random_bytes_never_panic_and_cover_the_input() {
        let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
        for id in ALL {
            for round in 0..8 {
                let data = rng.bytes(4096);
                let r = disasm(&data, &json!({ "arch": id, "max": 100_000, "base": rng.next() >> (round * 8) })).unwrap();
                let items = r["items"].as_array().unwrap();
                let mut at = 0u64;
                for i in items {
                    assert_eq!(i["offset"].as_u64().unwrap(), at, "{id}: items must be contiguous");
                    let len = i["length"].as_u64().unwrap();
                    assert!(len >= 1, "{id}");
                    assert_eq!(i["bytes"].as_str().unwrap().len() as u64, len * 2, "{id}");
                    assert!(!i["mnemonic"].as_str().unwrap().is_empty(), "{id}");
                    at += len;
                }
                assert_eq!(at, 4096, "{id}: decoding must cover the whole input");
                assert_eq!(r["next"], json!(4096));
            }
        }
    }

    #[test]
    fn every_16_bit_word_decodes_without_panic() {
        // Exhaustive over the first 16 bits for the 16-bit-unit and byte-oriented decoders (random tails).
        let mut rng = Rng(12345);
        for h in 0..=0xFFFFu32 {
            let mut buf = rng.bytes(8);
            buf[0] = h as u8;
            buf[1] = (h >> 8) as u8;
            let a = rng.next() & 0xFFFF_FFFF;
            let _ = riscv(&buf, a, false);
            let _ = riscv(&buf, a, true);
            let _ = avr(&buf, a);
            let _ = msp430(&buf, a);
            let _ = superh(&buf, a, false);
            let _ = superh(&buf, a, true);
            let _ = m6502(&buf, a);
            let _ = z80(&buf, a);
            let _ = i8080(&buf);
            let _ = arm(&buf, "thumb");
            for be in [false, true] {
                // every primary/secondary opcode field combination of MIPS (top and bottom 16 bits)
                let w = (h << 16) | (rng.next() as u32 & 0xFFFF);
                let _ = mips(&w.to_be_bytes(), a, be, false);
                let _ = mips(&w.to_be_bytes(), a, be, true);
                let w = (rng.next() as u32 & 0xFFFF_0000) | h;
                let _ = mips(&w.to_be_bytes(), a, be, true);
            }
            for prefix in [0xDDu8, 0xFD, 0xED, 0xCB] {
                let mut p = vec![prefix];
                p.extend_from_slice(&buf);
                let _ = z80(&p, a);
                p.truncate(2);
                let _ = z80(&p, a);
            }
        }
    }
}
