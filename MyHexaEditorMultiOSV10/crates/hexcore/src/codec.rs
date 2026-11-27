//! Text encodings: the text column's character sets (src/hex/charsets.js has the same single-byte tables)
//! and the encodings text search and string extraction understand.

/// Encoding ids the page uses.
pub const ENCODINGS: &[&str] = &[
    "ascii", "latin1", "cp1252", "cp437", "ebcdic", "utf8", "utf16le", "utf16be", "utf32le", "utf32be", "euc-kr", "shift_jis", "gb18030", "big5",
];

/// CP437 (IBM PC, DOS) 0x80–0xFF.
pub const CP437_HIGH: &str = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u{a0}";

/// EBCDIC code page 037 → Unicode.
pub const EBCDIC_037: [u16; 256] = [
    0x00, 0x01, 0x02, 0x03, 0x9C, 0x09, 0x86, 0x7F, 0x97, 0x8D, 0x8E, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
    0x10, 0x11, 0x12, 0x13, 0x9D, 0x85, 0x08, 0x87, 0x18, 0x19, 0x92, 0x8F, 0x1C, 0x1D, 0x1E, 0x1F,
    0x80, 0x81, 0x82, 0x83, 0x84, 0x0A, 0x17, 0x1B, 0x88, 0x89, 0x8A, 0x8B, 0x8C, 0x05, 0x06, 0x07,
    0x90, 0x91, 0x16, 0x93, 0x94, 0x95, 0x96, 0x04, 0x98, 0x99, 0x9A, 0x9B, 0x14, 0x15, 0x9E, 0x1A,
    0x20, 0xA0, 0xE2, 0xE4, 0xE0, 0xE1, 0xE3, 0xE5, 0xE7, 0xF1, 0xA2, 0x2E, 0x3C, 0x28, 0x2B, 0x7C,
    0x26, 0xE9, 0xEA, 0xEB, 0xE8, 0xED, 0xEE, 0xEF, 0xEC, 0xDF, 0x21, 0x24, 0x2A, 0x29, 0x3B, 0xAC,
    0x2D, 0x2F, 0xC2, 0xC4, 0xC0, 0xC1, 0xC3, 0xC5, 0xC7, 0xD1, 0xA6, 0x2C, 0x25, 0x5F, 0x3E, 0x3F,
    0xF8, 0xC9, 0xCA, 0xCB, 0xC8, 0xCD, 0xCE, 0xCF, 0xCC, 0x60, 0x3A, 0x23, 0x40, 0x27, 0x3D, 0x22,
    0xD8, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0xAB, 0xBB, 0xF0, 0xFD, 0xFE, 0xB1,
    0xB0, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x6F, 0x70, 0x71, 0x72, 0xAA, 0xBA, 0xE6, 0xB8, 0xC6, 0xA4,
    0xB5, 0x7E, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0xA1, 0xBF, 0xD0, 0xDD, 0xDE, 0xAE,
    0x5E, 0xA3, 0xA5, 0xB7, 0xA9, 0xA7, 0xB6, 0xBC, 0xBD, 0xBE, 0x5B, 0x5D, 0xAF, 0xA8, 0xB4, 0xD7,
    0x7B, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0xAD, 0xF4, 0xF6, 0xF2, 0xF3, 0xF5,
    0x7D, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x50, 0x51, 0x52, 0xB9, 0xFB, 0xFC, 0xF9, 0xFA, 0xFF,
    0x5C, 0xF7, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0xB2, 0xD4, 0xD6, 0xD2, 0xD3, 0xD5,
    0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0xB3, 0xDB, 0xDC, 0xD9, 0xDA, 0x9F,
];

fn rs_encoding(name: &str) -> Option<&'static encoding_rs::Encoding> {
    match name {
        "cp1252" => Some(encoding_rs::WINDOWS_1252),
        "euc-kr" => Some(encoding_rs::EUC_KR),
        "shift_jis" => Some(encoding_rs::SHIFT_JIS),
        "gb18030" => Some(encoding_rs::GB18030),
        "big5" => Some(encoding_rs::BIG5),
        _ => None,
    }
}

/// Bytes per code unit (for aligned text search and string extraction).
pub fn unit(name: &str) -> usize {
    match name {
        "utf16le" | "utf16be" => 2,
        "utf32le" | "utf32be" => 4,
        _ => 1,
    }
}

/// `text` in the encoding `name`. Characters the encoding cannot hold are an error.
pub fn encode(text: &str, name: &str) -> Result<Vec<u8>, String> {
    let bad = |c: char| format!("'{c}' cannot be written in {name}");
    match name {
        "ascii" => text.chars().map(|c| if (c as u32) < 128 { Ok(c as u8) } else { Err(bad(c)) }).collect(),
        "latin1" => text.chars().map(|c| if (c as u32) < 256 { Ok(c as u32 as u8) } else { Err(bad(c)) }).collect(),
        "utf8" | "" => Ok(text.as_bytes().to_vec()),
        "utf16le" => Ok(text.encode_utf16().flat_map(|u| u.to_le_bytes()).collect()),
        "utf16be" => Ok(text.encode_utf16().flat_map(|u| u.to_be_bytes()).collect()),
        "utf32le" => Ok(text.chars().flat_map(|c| (c as u32).to_le_bytes()).collect()),
        "utf32be" => Ok(text.chars().flat_map(|c| (c as u32).to_be_bytes()).collect()),
        "cp437" => text
            .chars()
            .map(|c| {
                if (c as u32) < 128 {
                    Ok(c as u8)
                } else {
                    CP437_HIGH.chars().position(|x| x == c).map(|i| 0x80 + i as u8).ok_or_else(|| bad(c))
                }
            })
            .collect(),
        "ebcdic" => text
            .chars()
            .map(|c| EBCDIC_037.iter().position(|&u| u as u32 == c as u32).map(|i| i as u8).ok_or_else(|| bad(c)))
            .collect(),
        other => {
            let enc = rs_encoding(other).ok_or_else(|| format!("unknown encoding {other}"))?;
            let (bytes, _, errors) = enc.encode(text);
            if errors {
                return Err(format!("some characters cannot be written in {other}"));
            }
            Ok(bytes.into_owned())
        }
    }
}

/// Decodes `bytes` (lossy: undecodable bytes become U+FFFD).
pub fn decode(bytes: &[u8], name: &str) -> String {
    match name {
        "ascii" => bytes.iter().map(|&b| if b < 128 { b as char } else { '\u{fffd}' }).collect(),
        "latin1" => bytes.iter().map(|&b| b as char).collect(),
        "utf8" | "" => String::from_utf8_lossy(bytes).into_owned(),
        "utf16le" | "utf16be" => {
            let units: Vec<u16> = bytes
                .chunks_exact(2)
                .map(|p| if name == "utf16le" { u16::from_le_bytes([p[0], p[1]]) } else { u16::from_be_bytes([p[0], p[1]]) })
                .collect();
            String::from_utf16_lossy(&units)
        }
        "utf32le" | "utf32be" => bytes
            .chunks_exact(4)
            .map(|p| {
                let v = if name == "utf32le" { u32::from_le_bytes([p[0], p[1], p[2], p[3]]) } else { u32::from_be_bytes([p[0], p[1], p[2], p[3]]) };
                char::from_u32(v).unwrap_or('\u{fffd}')
            })
            .collect(),
        "cp437" => bytes.iter().map(|&b| if b < 128 { b as char } else { CP437_HIGH.chars().nth((b - 128) as usize).unwrap_or('?') }).collect(),
        "ebcdic" => bytes.iter().map(|&b| char::from_u32(EBCDIC_037[b as usize] as u32).unwrap_or('?')).collect(),
        other => match rs_encoding(other) {
            Some(enc) => enc.decode_without_bom_handling(bytes).0.into_owned(),
            None => String::from_utf8_lossy(bytes).into_owned(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trips() {
        for name in ENCODINGS {
            let sample = match *name { "ascii" | "ebcdic" => "Hello 123", "euc-kr" => "한글 Hello", "shift_jis" => "日本語", "gb18030" | "big5" => "中文", "cp437" => "Hé░", _ => "Hé!" };
            let bytes = encode(sample, name).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert_eq!(decode(&bytes, name), sample, "{name}");
        }
        assert_eq!(encode("A", "ebcdic").unwrap(), vec![0xC1]);
        assert_eq!(CP437_HIGH.chars().count(), 128);
    }
}
