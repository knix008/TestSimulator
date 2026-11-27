//! Byte operations, encryption, compression and encodings applied to a selection.
//!
//! CONTRACT
//! `operation(bytes, {op, operand: "text number or hex", width: 1|2|4|8, endian: "le"|"be"})` → new bytes (same length).
//!   ops: xor and or not add sub mul div mod neg shl shr rol ror swap (byte order inside each width-unit)
//!   reverse (whole selection) bitrev (bit order in each byte) nibble (swap nibbles) set (fill with operand).
//!   Unit operations work on each complete width-unit; a shorter tail is left as it is. Arithmetic wraps at the width.
//!   operand: decimal ("-1" is all ones), "0x…" hex; for xor/and/or/set a hex byte string ("DE AD", or a number wider
//!   than the width) repeats over the selection byte by byte. Shifts and rotations take a bit count.
//! `transform(bytes, {kind, key, iv, mode, padding, level, keyText})` → output bytes (any length). kinds:
//!   xorKey (repeating key), rot13, base64Encode, base64Decode, hexEncode, hexDecode, urlEncode, urlDecode,
//!   zlibCompress, zlibDecompress, deflateCompress, deflateDecompress, gzipCompress, gzipDecompress,
//!   aesEncrypt, aesDecrypt (key 16/24/32 bytes, mode ecb|cbc|ctr, iv 16 bytes, padding pkcs7|none),
//!   desEncrypt, desDecrypt, tdesEncrypt, tdesDecrypt (key 8 / 16 or 24 bytes, mode ecb|cbc, iv 8 bytes), rc4,
//!   blowfishEncrypt/Decrypt (key 4–56), twofishEncrypt/Decrypt (16/24/32), cast5Encrypt/Decrypt (5–16),
//!   camelliaEncrypt/Decrypt (16/24/32) — modes ecb|cbc|ctr, iv = the block size (8 Blowfish/CAST5, 16 the others);
//!   teaEncrypt/Decrypt, xteaEncrypt/Decrypt (key 16, ecb|cbc, iv 8, big-endian words);
//!   chacha20 (key 32, iv = 12-byte nonce, RFC 8439, counter 0), salsa20 (key 32, iv = 8-byte nonce) — stream ciphers.
//!   `key`/`iv` are hex text unless `keyText: true` (then UTF-8 text). `level` 0–10 for compression (default 6).
//! `list()` → `{ operations: [{ id, operand: bool, width: bool }], transforms: [{ id, group, key: bool, iv: bool, modes: [..] }] }`
use crate::util::{parse_hex, Args};
use base64::Engine as _;
use serde_json::{json, Value};

/// (id, takes an operand, works per width-unit)
pub const OPERATIONS: &[(&str, bool, bool)] = &[
    ("xor", true, true),
    ("and", true, true),
    ("or", true, true),
    ("not", false, true),
    ("add", true, true),
    ("sub", true, true),
    ("mul", true, true),
    ("div", true, true),
    ("mod", true, true),
    ("neg", false, true),
    ("shl", true, true),
    ("shr", true, true),
    ("rol", true, true),
    ("ror", true, true),
    ("swap", false, true),
    ("reverse", false, false),
    ("bitrev", false, false),
    ("nibble", false, false),
    ("set", true, true),
];

/// (id, group, key, iv, modes)
pub const TRANSFORMS: &[(&str, &str, bool, bool, &[&str])] = &[
    ("xorKey", "crypto", true, false, &[]),
    ("rot13", "encoding", false, false, &[]),
    ("base64Encode", "encoding", false, false, &[]),
    ("base64Decode", "encoding", false, false, &[]),
    ("hexEncode", "encoding", false, false, &[]),
    ("hexDecode", "encoding", false, false, &[]),
    ("urlEncode", "encoding", false, false, &[]),
    ("urlDecode", "encoding", false, false, &[]),
    ("zlibCompress", "compression", false, false, &[]),
    ("zlibDecompress", "compression", false, false, &[]),
    ("deflateCompress", "compression", false, false, &[]),
    ("deflateDecompress", "compression", false, false, &[]),
    ("gzipCompress", "compression", false, false, &[]),
    ("gzipDecompress", "compression", false, false, &[]),
    ("aesEncrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("aesDecrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("desEncrypt", "crypto", true, true, &["ecb", "cbc"]),
    ("desDecrypt", "crypto", true, true, &["ecb", "cbc"]),
    ("tdesEncrypt", "crypto", true, true, &["ecb", "cbc"]),
    ("tdesDecrypt", "crypto", true, true, &["ecb", "cbc"]),
    ("rc4", "crypto", true, false, &[]),
    ("blowfishEncrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("blowfishDecrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("twofishEncrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("twofishDecrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("cast5Encrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("cast5Decrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("camelliaEncrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("camelliaDecrypt", "crypto", true, true, &["ecb", "cbc", "ctr"]),
    ("teaEncrypt", "crypto", true, true, &["ecb", "cbc"]),
    ("teaDecrypt", "crypto", true, true, &["ecb", "cbc"]),
    ("xteaEncrypt", "crypto", true, true, &["ecb", "cbc"]),
    ("xteaDecrypt", "crypto", true, true, &["ecb", "cbc"]),
    ("chacha20", "crypto", true, true, &[]),
    ("salsa20", "crypto", true, true, &[]),
];

pub fn list() -> Value {
    json!({
        "operations": OPERATIONS.iter().map(|(id, operand, width)| json!({ "id": id, "operand": operand, "width": width })).collect::<Vec<_>>(),
        "transforms": TRANSFORMS.iter().map(|(id, group, key, iv, modes)| json!({ "id": id, "group": group, "key": key, "iv": iv, "modes": modes })).collect::<Vec<_>>(),
    })
}

// ───────────── operations

fn parse_number(text: &str) -> Result<u64, String> {
    let t = text.trim().replace(['_', ' '], "");
    if t.is_empty() {
        return Err("an operand is needed".into());
    }
    if let Some(rest) = t.strip_prefix('-') {
        return crate::util::parse_u64(rest).map(|v| v.wrapping_neg()).ok_or_else(|| format!("not a number: {text}"));
    }
    // Bare hex digits with a letter ("FF", "1A") are hex; plain digits are decimal.
    crate::util::parse_u64(&t)
        .or_else(|| if t.chars().all(|c| c.is_ascii_hexdigit()) { u64::from_str_radix(&t, 16).ok() } else { None })
        .ok_or_else(|| format!("not a number: {text}"))
}

/// A byte pattern for xor/and/or/set: "DE AD" (spaces / commas) or a number wider than the width.
fn byte_pattern(text: &str, width: usize) -> Result<Option<Vec<u8>>, String> {
    let t = text.trim();
    if t.contains([' ', ',']) {
        return parse_hex(t).map(Some);
    }
    let v = parse_number(t)?;
    if width < 8 && !t.starts_with('-') && v >> (8 * width) != 0 {
        let mut bytes: Vec<u8> = v.to_be_bytes().into_iter().skip_while(|&b| b == 0).collect();
        if bytes.is_empty() {
            bytes.push(0);
        }
        return Ok(Some(bytes));
    }
    Ok(None)
}

pub fn operation(bytes: &[u8], args: &Value) -> Result<Vec<u8>, String> {
    let op = args.str_or("op", "xor");
    let width = args.u64_or("width", 1) as usize;
    if ![1, 2, 4, 8].contains(&width) {
        return Err(format!("width must be 1, 2, 4 or 8 bytes, not {width}"));
    }
    let big = args.str_or("endian", "le") == "be";
    let operand_text = args.get("operand").map(|v| match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    });
    let mut out = bytes.to_vec();
    match op {
        "reverse" => {
            out.reverse();
            return Ok(out);
        }
        "bitrev" => return Ok(out.iter().map(|b| b.reverse_bits()).collect()),
        "nibble" => return Ok(out.iter().map(|b| b.rotate_left(4)).collect()),
        _ => {}
    }
    let info = OPERATIONS.iter().find(|o| o.0 == op).ok_or_else(|| format!("unknown operation {op}"))?;
    let text = operand_text.unwrap_or_default();
    if info.1 && text.trim().is_empty() {
        return Err(format!("{op}: an operand is needed"));
    }
    // Byte patterns repeating over the whole selection.
    if matches!(op, "xor" | "and" | "or" | "set") {
        if let Some(pattern) = byte_pattern(&text, width)? {
            if pattern.is_empty() {
                return Err("empty pattern".into());
            }
            for (i, b) in out.iter_mut().enumerate() {
                let p = pattern[i % pattern.len()];
                *b = match op {
                    "xor" => *b ^ p,
                    "and" => *b & p,
                    "or" => *b | p,
                    _ => p,
                };
            }
            return Ok(out);
        }
    }
    let operand = if info.1 { parse_number(&text)? } else { 0 };
    let bits = 8 * width as u32;
    let mask = if bits == 64 { u64::MAX } else { (1u64 << bits) - 1 };
    let operand_w = operand & mask;
    if matches!(op, "div" | "mod") && operand_w == 0 {
        return Err("division by zero".into());
    }
    let n = (operand % bits as u64) as u32;
    for unit in out.chunks_exact_mut(width) {
        let mut v = 0u64;
        for i in 0..width {
            let b = if big { unit[i] } else { unit[width - 1 - i] };
            v = (v << 8) | b as u64;
        }
        let r = match op {
            "xor" => v ^ operand_w,
            "and" => v & operand_w,
            "or" => v | operand_w,
            "not" => !v,
            "add" => v.wrapping_add(operand),
            "sub" => v.wrapping_sub(operand),
            "mul" => v.wrapping_mul(operand),
            "div" => v / operand_w,
            "mod" => v % operand_w,
            "neg" => v.wrapping_neg(),
            "shl" => if operand >= bits as u64 { 0 } else { v << operand },
            "shr" => if operand >= bits as u64 { 0 } else { v >> operand },
            "rol" => if n == 0 { v } else { (v << n) | (v >> (bits - n)) },
            "ror" => if n == 0 { v } else { (v >> n) | (v << (bits - n)) },
            "swap" => {
                unit.reverse();
                continue;
            }
            "set" => operand_w,
            _ => v,
        } & mask;
        for i in 0..width {
            let b = (r >> (8 * (width - 1 - i))) as u8;
            if big {
                unit[i] = b;
            } else {
                unit[width - 1 - i] = b;
            }
        }
    }
    Ok(out)
}

// ───────────── transforms

fn key_bytes(args: &Value, key: &str) -> Result<Vec<u8>, String> {
    let text = args.str_or(key, "");
    if args.bool_or("keyText", false) {
        Ok(text.as_bytes().to_vec())
    } else {
        parse_hex(text).map_err(|e| format!("{key}: {e}"))
    }
}

fn rc4(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut s: Vec<u8> = (0..=255).collect();
    let mut j = 0u8;
    for i in 0..256 {
        j = j.wrapping_add(s[i]).wrapping_add(key[i % key.len()]);
        s.swap(i, j as usize);
    }
    let (mut i, mut j) = (0u8, 0u8);
    data.iter()
        .map(|&b| {
            i = i.wrapping_add(1);
            j = j.wrapping_add(s[i as usize]);
            s.swap(i as usize, j as usize);
            b ^ s[s[i as usize].wrapping_add(s[j as usize]) as usize]
        })
        .collect()
}

fn gzip_crc(data: &[u8]) -> u32 {
    static CRC: crc::Crc<u32> = crc::Crc::<u32>::new(&crc::CRC_32_ISO_HDLC);
    CRC.checksum(data)
}

fn gzip_compress(data: &[u8], level: u8) -> Vec<u8> {
    let mut out = vec![0x1F, 0x8B, 8, 0, 0, 0, 0, 0, if level >= 9 { 2 } else if level <= 1 { 4 } else { 0 }, 255];
    out.extend(miniz_oxide::deflate::compress_to_vec(data, level));
    out.extend(gzip_crc(data).to_le_bytes());
    out.extend((data.len() as u32).to_le_bytes());
    out
}

fn gzip_decompress(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 18 || data[0] != 0x1F || data[1] != 0x8B {
        return Err("not gzip data (1F 8B expected)".into());
    }
    if data[2] != 8 {
        return Err(format!("unsupported gzip method {}", data[2]));
    }
    let flags = data[3];
    let mut pos = 10usize;
    let need = |pos: usize| if pos > data.len() { Err("gzip header is cut short".to_string()) } else { Ok(()) };
    if flags & 4 != 0 {
        need(pos + 2)?;
        let xlen = u16::from_le_bytes([data[pos], data[pos + 1]]) as usize;
        pos += 2 + xlen;
    }
    for flag in [8u8, 16] {
        if flags & flag != 0 {
            need(pos)?;
            let end = data[pos..].iter().position(|&b| b == 0).ok_or("gzip header is cut short")?;
            pos += end + 1;
        }
    }
    if flags & 2 != 0 {
        pos += 2;
    }
    need(pos)?;
    let out = miniz_oxide::inflate::decompress_to_vec(&data[pos..]).map_err(|e| format!("gzip: damaged data ({:?})", e.status))?;
    let tail = &data[data.len() - 8..];
    let crc = u32::from_le_bytes([tail[0], tail[1], tail[2], tail[3]]);
    let size = u32::from_le_bytes([tail[4], tail[5], tail[6], tail[7]]);
    if size == out.len() as u32 && crc != gzip_crc(&out) {
        return Err("gzip: CRC-32 does not match".into());
    }
    Ok(out)
}

fn url_encode(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    for &b in data {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b);
        } else {
            out.extend(format!("%{b:02X}").into_bytes());
        }
    }
    out
}

fn url_decode(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(data.len());
    let mut i = 0;
    while i < data.len() {
        match data[i] {
            b'%' => {
                let h = data.get(i + 1..i + 3).and_then(|p| std::str::from_utf8(p).ok()).and_then(|s| u8::from_str_radix(s, 16).ok());
                out.push(h.ok_or_else(|| format!("bad escape at {i}"))?);
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    Ok(out)
}

macro_rules! block_cipher {
    ($cipher:ty, $data:expr, $key:expr, $iv:expr, $mode:expr, $pad:expr, $enc:expr) => {{
        use cipher::block_padding::{NoPadding, Pkcs7};
        use cipher::{BlockDecryptMut, BlockEncryptMut, KeyInit, KeyIvInit};
        let data: &[u8] = $data;
        let bs = <$cipher as cipher::BlockSizeUser>::block_size();
        if !$pad && data.len() % bs != 0 {
            return Err(format!("without padding the data must be a multiple of {bs} bytes"));
        }
        let bad_key = |_| format!("wrong key length: {} bytes", $key.len());
        match $mode {
            "ecb" => {
                if $enc {
                    let c = ecb::Encryptor::<$cipher>::new_from_slice($key).map_err(bad_key)?;
                    Ok(if $pad { c.encrypt_padded_vec_mut::<Pkcs7>(data) } else { c.encrypt_padded_vec_mut::<NoPadding>(data) })
                } else {
                    let c = ecb::Decryptor::<$cipher>::new_from_slice($key).map_err(bad_key)?;
                    if $pad { c.decrypt_padded_vec_mut::<Pkcs7>(data) } else { c.decrypt_padded_vec_mut::<NoPadding>(data) }.map_err(|_| "wrong key or padding".to_string())
                }
            }
            "cbc" => {
                if $iv.len() != bs {
                    return Err(format!("the IV must be {bs} bytes"));
                }
                if $enc {
                    let c = cbc::Encryptor::<$cipher>::new_from_slices($key, $iv).map_err(bad_key)?;
                    Ok(if $pad { c.encrypt_padded_vec_mut::<Pkcs7>(data) } else { c.encrypt_padded_vec_mut::<NoPadding>(data) })
                } else {
                    let c = cbc::Decryptor::<$cipher>::new_from_slices($key, $iv).map_err(bad_key)?;
                    if $pad { c.decrypt_padded_vec_mut::<Pkcs7>(data) } else { c.decrypt_padded_vec_mut::<NoPadding>(data) }.map_err(|_| "wrong key or padding".to_string())
                }
            }
            other => Err(format!("unknown mode {other}")),
        }
    }};
}

/// ecb / cbc / ctr for block ciphers with variable key lengths: the cipher is made from the key first (its own
/// length check), then wrapped in the mode. `$flavor`: the CTR counter (Ctr64BE for 8-byte blocks, Ctr128BE for 16).
macro_rules! any_mode {
    ($flavor:ident, $cipher:ty, $data:expr, $key:expr, $iv:expr, $mode:expr, $pad:expr, $enc:expr) => {{
        use cipher::block_padding::{NoPadding, Pkcs7};
        use cipher::crypto_common::InnerInit;
        use cipher::{BlockDecryptMut, BlockEncryptMut, InnerIvInit, KeyInit, StreamCipher};
        let data: &[u8] = $data;
        let bs = <$cipher as cipher::BlockSizeUser>::block_size();
        let inner = <$cipher as KeyInit>::new_from_slice($key).map_err(|_| format!("wrong key length: {} bytes", $key.len()))?;
        let need_iv = || if $iv.len() != bs { Err(format!("the IV must be {bs} bytes")) } else { Ok(()) };
        if $mode != "ctr" && !$pad && data.len() % bs != 0 {
            return Err(format!("without padding the data must be a multiple of {bs} bytes"));
        }
        let bad = |_| "wrong key or padding".to_string();
        match $mode {
            "ecb" => {
                if $enc {
                    let c = ecb::Encryptor::<$cipher>::inner_init(inner);
                    Ok(if $pad { c.encrypt_padded_vec_mut::<Pkcs7>(data) } else { c.encrypt_padded_vec_mut::<NoPadding>(data) })
                } else {
                    let c = ecb::Decryptor::<$cipher>::inner_init(inner);
                    if $pad { c.decrypt_padded_vec_mut::<Pkcs7>(data) } else { c.decrypt_padded_vec_mut::<NoPadding>(data) }.map_err(bad)
                }
            }
            "cbc" => {
                need_iv()?;
                if $enc {
                    let c = cbc::Encryptor::<$cipher>::inner_iv_slice_init(inner, $iv).map_err(|_| "bad IV".to_string())?;
                    Ok(if $pad { c.encrypt_padded_vec_mut::<Pkcs7>(data) } else { c.encrypt_padded_vec_mut::<NoPadding>(data) })
                } else {
                    let c = cbc::Decryptor::<$cipher>::inner_iv_slice_init(inner, $iv).map_err(|_| "bad IV".to_string())?;
                    if $pad { c.decrypt_padded_vec_mut::<Pkcs7>(data) } else { c.decrypt_padded_vec_mut::<NoPadding>(data) }.map_err(bad)
                }
            }
            "ctr" => {
                need_iv()?;
                let core = ctr::CtrCore::<$cipher, ctr::flavors::$flavor>::inner_iv_slice_init(inner, $iv).map_err(|_| "bad IV".to_string())?;
                let mut c = cipher::StreamCipherCoreWrapper::from_core(core);
                let mut out = data.to_vec();
                c.apply_keystream(&mut out);
                Ok(out)
            }
            other => Err(format!("unknown mode {other}")),
        }
    }};
}

// ───────────── TEA and XTEA (64-bit blocks, 128-bit keys, big-endian words)

const DELTA: u32 = 0x9E37_79B9;

fn tea_key(key: &[u8]) -> [u32; 4] {
    let mut k = [0u32; 4];
    for (i, w) in k.iter_mut().enumerate() {
        *w = u32::from_be_bytes([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
    }
    k
}

fn tea_block(b: &mut [u8], k: &[u32; 4], xtea: bool, enc: bool) {
    let mut v0 = u32::from_be_bytes([b[0], b[1], b[2], b[3]]);
    let mut v1 = u32::from_be_bytes([b[4], b[5], b[6], b[7]]);
    if xtea {
        if enc {
            let mut sum = 0u32;
            for _ in 0..32 {
                v0 = v0.wrapping_add((((v1 << 4) ^ (v1 >> 5)).wrapping_add(v1)) ^ sum.wrapping_add(k[(sum & 3) as usize]));
                sum = sum.wrapping_add(DELTA);
                v1 = v1.wrapping_add((((v0 << 4) ^ (v0 >> 5)).wrapping_add(v0)) ^ sum.wrapping_add(k[((sum >> 11) & 3) as usize]));
            }
        } else {
            let mut sum = DELTA.wrapping_mul(32);
            for _ in 0..32 {
                v1 = v1.wrapping_sub((((v0 << 4) ^ (v0 >> 5)).wrapping_add(v0)) ^ sum.wrapping_add(k[((sum >> 11) & 3) as usize]));
                sum = sum.wrapping_sub(DELTA);
                v0 = v0.wrapping_sub((((v1 << 4) ^ (v1 >> 5)).wrapping_add(v1)) ^ sum.wrapping_add(k[(sum & 3) as usize]));
            }
        }
    } else if enc {
        let mut sum = 0u32;
        for _ in 0..32 {
            sum = sum.wrapping_add(DELTA);
            v0 = v0.wrapping_add(((v1 << 4).wrapping_add(k[0])) ^ v1.wrapping_add(sum) ^ ((v1 >> 5).wrapping_add(k[1])));
            v1 = v1.wrapping_add(((v0 << 4).wrapping_add(k[2])) ^ v0.wrapping_add(sum) ^ ((v0 >> 5).wrapping_add(k[3])));
        }
    } else {
        let mut sum = DELTA.wrapping_mul(32);
        for _ in 0..32 {
            v1 = v1.wrapping_sub(((v0 << 4).wrapping_add(k[2])) ^ v0.wrapping_add(sum) ^ ((v0 >> 5).wrapping_add(k[3])));
            v0 = v0.wrapping_sub(((v1 << 4).wrapping_add(k[0])) ^ v1.wrapping_add(sum) ^ ((v1 >> 5).wrapping_add(k[1])));
            sum = sum.wrapping_sub(DELTA);
        }
    }
    b[..4].copy_from_slice(&v0.to_be_bytes());
    b[4..8].copy_from_slice(&v1.to_be_bytes());
}

fn tea(data: &[u8], key: &[u8], iv: &[u8], mode: &str, pad: bool, xtea: bool, enc: bool) -> Result<Vec<u8>, String> {
    if key.len() != 16 {
        return Err(format!("TEA / XTEA keys are 16 bytes, not {}", key.len()));
    }
    if mode != "ecb" && mode != "cbc" {
        return Err(format!("unknown mode {mode}"));
    }
    if mode == "cbc" && iv.len() != 8 {
        return Err("the IV must be 8 bytes".into());
    }
    let k = tea_key(key);
    let mut chain = [0u8; 8];
    if mode == "cbc" {
        chain.copy_from_slice(iv);
    }
    if enc {
        let mut buf = data.to_vec();
        if pad {
            let n = 8 - buf.len() % 8;
            buf.extend(std::iter::repeat(n as u8).take(n));
        } else if buf.len() % 8 != 0 {
            return Err("without padding the data must be a multiple of 8 bytes".into());
        }
        for block in buf.chunks_exact_mut(8) {
            if mode == "cbc" {
                for i in 0..8 {
                    block[i] ^= chain[i];
                }
            }
            tea_block(block, &k, xtea, true);
            chain.copy_from_slice(block);
        }
        Ok(buf)
    } else {
        if data.len() % 8 != 0 {
            return Err("the data must be a multiple of 8 bytes".into());
        }
        let mut buf = data.to_vec();
        for block in buf.chunks_exact_mut(8) {
            let cipher_block: [u8; 8] = block.try_into().unwrap();
            tea_block(block, &k, xtea, false);
            if mode == "cbc" {
                for i in 0..8 {
                    block[i] ^= chain[i];
                }
            }
            chain = cipher_block;
        }
        if pad {
            let n = *buf.last().unwrap_or(&0) as usize;
            if n == 0 || n > 8 || n > buf.len() || !buf[buf.len() - n..].iter().all(|&b| b as usize == n) {
                return Err("wrong key or padding".into());
            }
            buf.truncate(buf.len() - n);
        }
        Ok(buf)
    }
}

fn aes_ctr<C>(key: &[u8], iv: &[u8], data: &[u8]) -> Result<Vec<u8>, String>
where
    C: cipher::BlockEncrypt + cipher::BlockCipher + cipher::KeyInit + cipher::BlockSizeUser<BlockSize = cipher::consts::U16>,
{
    use cipher::{KeyIvInit, StreamCipher};
    if iv.len() != 16 {
        return Err("the IV (counter) must be 16 bytes".into());
    }
    let mut c = ctr::Ctr128BE::<C>::new_from_slices(key, iv).map_err(|_| format!("wrong key length: {} bytes", key.len()))?;
    let mut out = data.to_vec();
    c.apply_keystream(&mut out);
    Ok(out)
}

fn aes(data: &[u8], key: &[u8], iv: &[u8], mode: &str, pad: bool, enc: bool) -> Result<Vec<u8>, String> {
    if mode == "ctr" {
        return match key.len() {
            16 => aes_ctr::<aes::Aes128>(key, iv, data),
            24 => aes_ctr::<aes::Aes192>(key, iv, data),
            32 => aes_ctr::<aes::Aes256>(key, iv, data),
            n => Err(format!("AES keys are 16, 24 or 32 bytes, not {n}")),
        };
    }
    match key.len() {
        16 => block_cipher!(aes::Aes128, data, key, iv, mode, pad, enc),
        24 => block_cipher!(aes::Aes192, data, key, iv, mode, pad, enc),
        32 => block_cipher!(aes::Aes256, data, key, iv, mode, pad, enc),
        n => Err(format!("AES keys are 16, 24 or 32 bytes, not {n}")),
    }
}

pub fn transform(bytes: &[u8], args: &Value) -> Result<Vec<u8>, String> {
    let kind = args.str_or("kind", "");
    let level = args.u64_or("level", 6).min(10) as u8;
    let mode = args.str_or("mode", "cbc");
    let pad = args.str_or("padding", "pkcs7") != "none";
    match kind {
        "xorKey" => {
            let key = key_bytes(args, "key")?;
            if key.is_empty() {
                return Err("a key is needed".into());
            }
            Ok(bytes.iter().enumerate().map(|(i, b)| b ^ key[i % key.len()]).collect())
        }
        "rot13" => Ok(bytes
            .iter()
            .map(|&b| match b {
                b'a'..=b'z' => (b - b'a' + 13) % 26 + b'a',
                b'A'..=b'Z' => (b - b'A' + 13) % 26 + b'A',
                _ => b,
            })
            .collect()),
        "base64Encode" => Ok(base64::engine::general_purpose::STANDARD.encode(bytes).into_bytes()),
        "base64Decode" => {
            let text: Vec<u8> = bytes.iter().copied().filter(|b| !b.is_ascii_whitespace()).collect();
            base64::engine::general_purpose::STANDARD
                .decode(&text)
                .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(&text))
                .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(&text))
                .or_else(|_| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(&text))
                .map_err(|e| format!("not Base64: {e}"))
        }
        "hexEncode" => Ok(crate::util::hex_string(bytes, true).into_bytes()),
        "hexDecode" => parse_hex(&String::from_utf8_lossy(bytes)),
        "urlEncode" => Ok(url_encode(bytes)),
        "urlDecode" => url_decode(bytes),
        "zlibCompress" => Ok(miniz_oxide::deflate::compress_to_vec_zlib(bytes, level)),
        "zlibDecompress" => miniz_oxide::inflate::decompress_to_vec_zlib(bytes).map_err(|e| format!("not zlib data ({:?})", e.status)),
        "deflateCompress" => Ok(miniz_oxide::deflate::compress_to_vec(bytes, level)),
        "deflateDecompress" => miniz_oxide::inflate::decompress_to_vec(bytes).map_err(|e| format!("not deflate data ({:?})", e.status)),
        "gzipCompress" => Ok(gzip_compress(bytes, level)),
        "gzipDecompress" => gzip_decompress(bytes),
        "aesEncrypt" | "aesDecrypt" => aes(bytes, &key_bytes(args, "key")?, &key_bytes(args, "iv")?, mode, pad, kind == "aesEncrypt"),
        "desEncrypt" | "desDecrypt" => {
            let key = key_bytes(args, "key")?;
            if key.len() != 8 {
                return Err(format!("DES keys are 8 bytes, not {}", key.len()));
            }
            let iv = key_bytes(args, "iv")?;
            block_cipher!(des::Des, bytes, &key, &iv, mode, pad, kind == "desEncrypt")
        }
        "tdesEncrypt" | "tdesDecrypt" => {
            let key = key_bytes(args, "key")?;
            let iv = key_bytes(args, "iv")?;
            let enc = kind == "tdesEncrypt";
            match key.len() {
                16 => block_cipher!(des::TdesEde2, bytes, &key, &iv, mode, pad, enc),
                24 => block_cipher!(des::TdesEde3, bytes, &key, &iv, mode, pad, enc),
                n => Err(format!("3DES keys are 16 or 24 bytes, not {n}")),
            }
        }
        "rc4" => {
            let key = key_bytes(args, "key")?;
            if key.is_empty() || key.len() > 256 {
                return Err("RC4 keys are 1–256 bytes".into());
            }
            Ok(rc4(&key, bytes))
        }
        "blowfishEncrypt" | "blowfishDecrypt" => {
            let (key, iv) = (key_bytes(args, "key")?, key_bytes(args, "iv")?);
            if !(4..=56).contains(&key.len()) {
                return Err(format!("Blowfish keys are 4–56 bytes, not {}", key.len()));
            }
            any_mode!(Ctr64BE, blowfish::Blowfish, bytes, &key, &iv, mode, pad, kind == "blowfishEncrypt")
        }
        "twofishEncrypt" | "twofishDecrypt" => {
            let (key, iv) = (key_bytes(args, "key")?, key_bytes(args, "iv")?);
            if ![16, 24, 32].contains(&key.len()) {
                return Err(format!("Twofish keys are 16, 24 or 32 bytes, not {}", key.len()));
            }
            any_mode!(Ctr128BE, twofish::Twofish, bytes, &key, &iv, mode, pad, kind == "twofishEncrypt")
        }
        "cast5Encrypt" | "cast5Decrypt" => {
            let (key, iv) = (key_bytes(args, "key")?, key_bytes(args, "iv")?);
            if !(5..=16).contains(&key.len()) {
                return Err(format!("CAST5 keys are 5–16 bytes, not {}", key.len()));
            }
            any_mode!(Ctr64BE, cast5::Cast5, bytes, &key, &iv, mode, pad, kind == "cast5Encrypt")
        }
        "camelliaEncrypt" | "camelliaDecrypt" => {
            let (key, iv) = (key_bytes(args, "key")?, key_bytes(args, "iv")?);
            let enc = kind == "camelliaEncrypt";
            match key.len() {
                16 => any_mode!(Ctr128BE, camellia::Camellia128, bytes, &key, &iv, mode, pad, enc),
                24 => any_mode!(Ctr128BE, camellia::Camellia192, bytes, &key, &iv, mode, pad, enc),
                32 => any_mode!(Ctr128BE, camellia::Camellia256, bytes, &key, &iv, mode, pad, enc),
                n => Err(format!("Camellia keys are 16, 24 or 32 bytes, not {n}")),
            }
        }
        "teaEncrypt" | "teaDecrypt" => tea(bytes, &key_bytes(args, "key")?, &key_bytes(args, "iv")?, mode, pad, false, kind == "teaEncrypt"),
        "xteaEncrypt" | "xteaDecrypt" => tea(bytes, &key_bytes(args, "key")?, &key_bytes(args, "iv")?, mode, pad, true, kind == "xteaEncrypt"),
        "chacha20" => {
            use cipher::{KeyIvInit, StreamCipher};
            let (key, iv) = (key_bytes(args, "key")?, key_bytes(args, "iv")?);
            if key.len() != 32 || iv.len() != 12 {
                return Err("ChaCha20 needs a 32-byte key and a 12-byte nonce (IV)".into());
            }
            let mut c = chacha20::ChaCha20::new_from_slices(&key, &iv).map_err(|e| e.to_string())?;
            let mut out = bytes.to_vec();
            c.apply_keystream(&mut out);
            Ok(out)
        }
        "salsa20" => {
            use cipher::{KeyIvInit, StreamCipher};
            let (key, iv) = (key_bytes(args, "key")?, key_bytes(args, "iv")?);
            if key.len() != 32 || iv.len() != 8 {
                return Err("Salsa20 needs a 32-byte key and an 8-byte nonce (IV)".into());
            }
            let mut c = salsa20::Salsa20::new_from_slices(&key, &iv).map_err(|e| e.to_string())?;
            let mut out = bytes.to_vec();
            c.apply_keystream(&mut out);
            Ok(out)
        }
        other => Err(format!("unknown transform {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::hex_string;

    fn op(bytes: &[u8], a: Value) -> Vec<u8> {
        operation(bytes, &a).unwrap()
    }

    #[test]
    fn operations() {
        assert_eq!(op(&[0x0F, 0xF0], json!({ "op": "xor", "operand": "0xFF" })), vec![0xF0, 0x0F]);
        assert_eq!(op(&[0, 0, 0], json!({ "op": "xor", "operand": "DE AD" })), vec![0xDE, 0xAD, 0xDE]);
        assert_eq!(op(&[0xFF, 0x00, 0x01], json!({ "op": "add", "operand": "1", "width": 2, "endian": "le" })), vec![0x00, 0x01, 0x01]);
        assert_eq!(op(&[0x00, 0xFF], json!({ "op": "add", "operand": 1, "width": 2, "endian": "be" })), vec![0x01, 0x00]);
        assert_eq!(op(&[1, 2, 3, 4, 5], json!({ "op": "swap", "width": 4 })), vec![4, 3, 2, 1, 5]);
        assert_eq!(op(&[0x81], json!({ "op": "rol", "operand": "1" })), vec![0x03]);
        assert_eq!(op(&[0x81], json!({ "op": "ror", "operand": "1" })), vec![0xC0]);
        assert_eq!(op(&[0x01], json!({ "op": "neg" })), vec![0xFF]);
        assert_eq!(op(&[1, 2, 3], json!({ "op": "reverse" })), vec![3, 2, 1]);
        assert_eq!(op(&[0x12], json!({ "op": "nibble" })), vec![0x21]);
        assert_eq!(op(&[0x01], json!({ "op": "bitrev" })), vec![0x80]);
        assert_eq!(op(&[0, 0], json!({ "op": "set", "operand": "0x1234", "width": 2, "endian": "be" })), vec![0x12, 0x34]);
        assert_eq!(op(&[7], json!({ "op": "sub", "operand": "-1" })), vec![8]);
        assert!(operation(&[1], &json!({ "op": "div", "operand": "0" })).is_err());
        assert_eq!(op(&[9], json!({ "op": "mod", "operand": "4" })), vec![1]);
    }

    #[test]
    fn transforms_round_trip() {
        let data: Vec<u8> = (0..1000u32).map(|i| (i * 31 % 251) as u8).collect();
        let pairs = [
            ("base64Encode", "base64Decode", json!({})),
            ("hexEncode", "hexDecode", json!({})),
            ("urlEncode", "urlDecode", json!({})),
            ("zlibCompress", "zlibDecompress", json!({})),
            ("deflateCompress", "deflateDecompress", json!({})),
            ("gzipCompress", "gzipDecompress", json!({})),
            ("aesEncrypt", "aesDecrypt", json!({ "key": "000102030405060708090a0b0c0d0e0f", "iv": "00000000000000000000000000000000", "mode": "cbc" })),
            ("aesEncrypt", "aesDecrypt", json!({ "key": "000102030405060708090a0b0c0d0e0f1011121314151617", "mode": "ecb" })),
            ("aesEncrypt", "aesDecrypt", json!({ "key": "00".repeat(32), "iv": "11".repeat(16), "mode": "ctr" })),
            ("desEncrypt", "desDecrypt", json!({ "key": "0123456789abcdef", "iv": "0000000000000000", "mode": "cbc" })),
            ("tdesEncrypt", "tdesDecrypt", json!({ "key": "0123456789abcdef".repeat(3), "mode": "ecb" })),
            ("rc4", "rc4", json!({ "key": "secret", "keyText": true })),
            ("xorKey", "xorKey", json!({ "key": "A5 5A" })),
            ("rot13", "rot13", json!({})),
            ("blowfishEncrypt", "blowfishDecrypt", json!({ "key": "7365637265746b6579", "iv": "0001020304050607", "mode": "cbc" })),
            ("blowfishEncrypt", "blowfishDecrypt", json!({ "key": "0011223344556677", "iv": "0001020304050607", "mode": "ctr" })),
            ("twofishEncrypt", "twofishDecrypt", json!({ "key": "00".repeat(32), "iv": "22".repeat(16), "mode": "cbc" })),
            ("twofishEncrypt", "twofishDecrypt", json!({ "key": "00".repeat(16), "mode": "ecb" })),
            ("cast5Encrypt", "cast5Decrypt", json!({ "key": "0123456712345678234567893456789A", "iv": "0000000000000000", "mode": "cbc" })),
            ("camelliaEncrypt", "camelliaDecrypt", json!({ "key": "00".repeat(24), "iv": "33".repeat(16), "mode": "ctr" })),
            ("camelliaEncrypt", "camelliaDecrypt", json!({ "key": "00".repeat(16), "iv": "33".repeat(16), "mode": "cbc" })),
            ("teaEncrypt", "teaDecrypt", json!({ "key": "00112233445566778899aabbccddeeff", "iv": "0102030405060708", "mode": "cbc" })),
            ("xteaEncrypt", "xteaDecrypt", json!({ "key": "00112233445566778899aabbccddeeff", "mode": "ecb" })),
            ("chacha20", "chacha20", json!({ "key": "01".repeat(32), "iv": "02".repeat(12) })),
            ("salsa20", "salsa20", json!({ "key": "01".repeat(32), "iv": "02".repeat(8) })),
        ];
        for (enc, dec, extra) in pairs {
            let mut a = extra.clone();
            a["kind"] = json!(enc);
            let mid = transform(&data, &a).unwrap_or_else(|e| panic!("{enc}: {e}"));
            let mut b = extra.clone();
            b["kind"] = json!(dec);
            assert_eq!(transform(&mid, &b).unwrap_or_else(|e| panic!("{dec}: {e}")), data, "{enc}/{dec}");
        }
    }

    #[test]
    fn known_vectors() {
        // FIPS-197 AES-128 single block.
        let a = json!({ "kind": "aesEncrypt", "key": "000102030405060708090a0b0c0d0e0f", "mode": "ecb", "padding": "none" });
        let out = transform(&parse_hex("00112233445566778899aabbccddeeff").unwrap(), &a).unwrap();
        assert_eq!(hex_string(&out, false), "69c4e0d86a7b0430d8cdb78070b4c55a");
        // RC4 "Key" / "Plaintext"
        let out = transform(b"Plaintext", &json!({ "kind": "rc4", "key": "Key", "keyText": true })).unwrap();
        assert_eq!(hex_string(&out, false), "bbf316e8d940af0ad3");
        assert_eq!(transform(b"Hello", &json!({ "kind": "rot13" })).unwrap(), b"Uryyb");
        assert_eq!(transform(b"a b", &json!({ "kind": "urlEncode" })).unwrap(), b"a%20b");
        assert!(transform(b"xx", &json!({ "kind": "aesEncrypt", "key": "00", "mode": "ecb" })).is_err());
        // Blowfish (Schneier's vectors): key 0000000000000000, plaintext 0000000000000000.
        let out = transform(&[0u8; 8], &json!({ "kind": "blowfishEncrypt", "key": "0000000000000000", "mode": "ecb", "padding": "none" })).unwrap();
        assert_eq!(hex_string(&out, false), "4ef997456198dd78");
        // CAST5 (RFC 2144 B.1, 128-bit key).
        let out = transform(&parse_hex("0123456789ABCDEF").unwrap(), &json!({ "kind": "cast5Encrypt", "key": "0123456712345678234567893456789A", "mode": "ecb", "padding": "none" })).unwrap();
        assert_eq!(hex_string(&out, false), "238b4fe5847e44b2");
        // ChaCha20 (RFC 8439 2.4.2): the first keystream bytes, counter 0 here, so check the block-1 test with a zero key instead:
        // key 0, nonce 0, counter 0 → keystream starts 76b8e0ada0f13d90.
        let out = transform(&[0u8; 8], &json!({ "kind": "chacha20", "key": "00".repeat(32), "iv": "00".repeat(12) })).unwrap();
        assert_eq!(hex_string(&out, false), "76b8e0ada0f13d90");
        // XTEA: key 000102030405060708090a0b0c0d0e0f, plaintext 4142434445464748 → 497df3d072612cb5.
        let out = transform(&parse_hex("4142434445464748").unwrap(), &json!({ "kind": "xteaEncrypt", "key": "000102030405060708090a0b0c0d0e0f", "mode": "ecb", "padding": "none" })).unwrap();
        assert_eq!(hex_string(&out, false), "497df3d072612cb5");
        assert!(transform(b"x", &json!({ "kind": "twofishEncrypt", "key": "00", "mode": "ecb" })).is_err());
    }
}
