//! Reading and writing text files in their encoding: UTF-8 (with or without BOM), UTF-16
//! (with a BOM) and the Korean code page (EUC-KR / CP949) for files that are not valid UTF-8.
//! Writes go to a temporary file next to the target first, so a failed save never leaves a
//! half-written document behind.
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub text: String,
    pub encoding: String,
    pub mtime: u64,
    pub size: u64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stat {
    pub mtime: u64,
    pub size: u64,
}

/// Files above this size are refused: the editor is for documents, not for gigabyte logs.
pub const MAX_SIZE: u64 = 64 * 1024 * 1024;

pub fn stat(path: &Path) -> Result<Stat, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    Ok(Stat { mtime, size: meta.len() })
}

/// The text of bytes and the encoding they were in.
pub fn decode(bytes: &[u8]) -> (String, &'static str) {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return (String::from_utf8_lossy(rest).into_owned(), "utf-8-bom");
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (text, _, _) = encoding_rs::UTF_16LE.decode(bytes);
        return (text.into_owned(), "utf-16le");
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (text, _, _) = encoding_rs::UTF_16BE.decode(bytes);
        return (text.into_owned(), "utf-16be");
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => (text.to_string(), "utf-8"),
        Err(_) => {
            let (text, _, _) = encoding_rs::EUC_KR.decode(bytes);
            (text.into_owned(), "euc-kr")
        }
    }
}

/// Text to bytes in an encoding (unknown names write UTF-8).
pub fn encode(text: &str, encoding: &str) -> Result<Vec<u8>, String> {
    Ok(match encoding {
        "utf-8-bom" => [&[0xEF, 0xBB, 0xBF][..], text.as_bytes()].concat(),
        "utf-16le" => {
            let mut out = vec![0xFF, 0xFE];
            for unit in text.encode_utf16() {
                out.extend_from_slice(&unit.to_le_bytes());
            }
            out
        }
        "utf-16be" => {
            let mut out = vec![0xFE, 0xFF];
            for unit in text.encode_utf16() {
                out.extend_from_slice(&unit.to_be_bytes());
            }
            out
        }
        "euc-kr" => {
            let (bytes, _, unmappable) = encoding_rs::EUC_KR.encode(text);
            if unmappable {
                return Err("이 문서에는 EUC-KR 로 저장할 수 없는 문자가 있습니다. UTF-8 로 저장하세요. / The document has characters EUC-KR cannot store: save it as UTF-8.".into());
            }
            bytes.into_owned()
        }
        _ => text.as_bytes().to_vec(),
    })
}

pub fn read_text(path: &Path) -> Result<TextFile, String> {
    let info = stat(path)?;
    if info.size > MAX_SIZE {
        return Err(format!("파일이 너무 큽니다 ({} MB). / The file is too large ({} MB).", info.size / 1024 / 1024, info.size / 1024 / 1024));
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.iter().take(8192).filter(|&&b| b == 0).count() > 8 && !bytes.starts_with(&[0xFF, 0xFE]) && !bytes.starts_with(&[0xFE, 0xFF]) {
        return Err("텍스트 파일이 아닌 것 같습니다 (이진 파일). / This does not look like a text file (binary).".into());
    }
    let (text, encoding) = decode(&bytes);
    Ok(TextFile { text, encoding: encoding.into(), mtime: info.mtime, size: info.size })
}

pub fn write_text(path: &Path, text: &str, encoding: &str) -> Result<Stat, String> {
    let bytes = encode(text, encoding)?;
    write_raw(path, &bytes)
}

/// Writes bytes through a temporary file next to the target (a failed save leaves the old file).
pub fn write_raw(path: &Path, bytes: &[u8]) -> Result<Stat, String> {
    let dir = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or_else(|| Path::new("."));
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "document".into());
    let temp = dir.join(format!(".{name}.mytextmaster-save"));
    {
        let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(&temp, path) {
        // Some file systems (network shares) refuse to replace: write in place then.
        let _ = fs::remove_file(&temp);
        fs::write(path, bytes).map_err(|e| format!("{error}; {e}"))?;
    }
    stat(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf8_bom_utf16_and_euc_kr() {
        assert_eq!(decode("안녕 hello".as_bytes()), ("안녕 hello".to_string(), "utf-8"));
        assert_eq!(decode(&[0xEF, 0xBB, 0xBF, b'a']), ("a".to_string(), "utf-8-bom"));
        assert_eq!(decode(&[0xFF, 0xFE, b'h', 0, b'i', 0]), ("hi".to_string(), "utf-16le"));
        let (euc, _, _) = encoding_rs::EUC_KR.encode("한글 문서");
        assert_eq!(decode(&euc), ("한글 문서".to_string(), "euc-kr"));
    }

    #[test]
    fn every_encoding_round_trips() {
        for encoding in ["utf-8", "utf-8-bom", "utf-16le", "utf-16be", "euc-kr"] {
            // (No em dash: U+2014 is not in EUC-KR, which is what the next test is about.)
            let text = "제목\r\nline 2 - 끝 · 한글";
            let bytes = encode(text, encoding).unwrap();
            assert_eq!(decode(&bytes), (text.to_string(), encoding), "{encoding}");
        }
    }

    #[test]
    fn euc_kr_refuses_characters_it_cannot_store() {
        assert!(encode("emoji 😀", "euc-kr").is_err());
    }

    #[test]
    fn writes_through_a_temporary_file_and_reads_back() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "old").unwrap();
        let info = write_text(&path, "# 새 내용\n", "utf-8").unwrap();
        assert_eq!(info.size, "# 새 내용\n".len() as u64);
        let read = read_text(&path).unwrap();
        assert_eq!(read.text, "# 새 내용\n");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "no temporary file is left");
    }

    #[test]
    fn refuses_binary_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("image.bin");
        fs::write(&path, [0u8; 64]).unwrap();
        assert!(read_text(&path).is_err());
    }
}
