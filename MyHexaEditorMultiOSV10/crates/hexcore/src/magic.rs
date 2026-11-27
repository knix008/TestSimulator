//! File types: detection from the content, and carving (finding files inside data, e.g. a disk image).
//!
//! CONTRACT
//! `detect(src, {})` → `{ id, name, mime, ext, template: "<builtin template id>"|null, details: "…" }` (id "unknown" if none,
//!   "text" for plain text). Looks at the first 64 KiB (plus the end for a few formats).
//! `carve(src, {offset?, length?, types?: [id…], limit: 1000}, progress)` →
//!   `{ items: [{ offset, length, id, name, ext }], truncated }` — files found by header; the length comes from the format's
//!   structure (PNG chunks, JPEG segments, GIF blocks, RIFF/BMP sizes, ZIP end of central directory, ELF/PE tables, SQLite
//!   pages, 7z header, MP4 boxes, Ogg pages, MP3 frames) or footer (PDF %%EOF), else it runs to the next header found
//!   (at most 16 MiB). Headers inside a file already carved are skipped (ZIP entries, JPEG thumbnails).
//! `signatures()` → `[{ id, name, ext, mime, carve: bool, template }]`.
use crate::doc::Bytes;
use crate::util::{range_of, Args, Progress, CANCELLED};
use serde_json::{json, Value};

pub struct Sig {
    pub id: &'static str,
    pub name: &'static str,
    pub ext: &'static str,
    pub mime: &'static str,
    pub carve: bool,
    pub template: Option<&'static str>,
}

macro_rules! sig {
    ($id:expr, $name:expr, $ext:expr, $mime:expr, $carve:expr, $tpl:expr) => {
        Sig { id: $id, name: $name, ext: $ext, mime: $mime, carve: $carve, template: $tpl }
    };
}

pub const SIGNATURES: &[Sig] = &[
    sig!("png", "PNG image", "png", "image/png", true, Some("png")),
    sig!("jpeg", "JPEG image", "jpg", "image/jpeg", true, Some("jpeg")),
    sig!("gif", "GIF image", "gif", "image/gif", true, Some("gif")),
    sig!("bmp", "BMP image", "bmp", "image/bmp", true, Some("bmp")),
    sig!("tiff", "TIFF image", "tif", "image/tiff", true, None),
    sig!("webp", "WebP image", "webp", "image/webp", true, None),
    sig!("ico", "Windows icon", "ico", "image/x-icon", false, Some("ico")),
    sig!("cur", "Windows cursor", "cur", "image/x-icon", false, Some("ico")),
    sig!("psd", "Photoshop document", "psd", "image/vnd.adobe.photoshop", true, None),
    sig!("pdf", "PDF document", "pdf", "application/pdf", true, None),
    sig!("docx", "Word document (OOXML)", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", false, Some("zip")),
    sig!("xlsx", "Excel workbook (OOXML)", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", false, Some("zip")),
    sig!("pptx", "PowerPoint presentation (OOXML)", "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", false, Some("zip")),
    sig!("odt", "OpenDocument", "odt", "application/vnd.oasis.opendocument.text", false, Some("zip")),
    sig!("epub", "EPUB book", "epub", "application/epub+zip", false, Some("zip")),
    sig!("jar", "Java archive", "jar", "application/java-archive", false, Some("zip")),
    sig!("apk", "Android package", "apk", "application/vnd.android.package-archive", false, Some("zip")),
    sig!("zip", "ZIP archive", "zip", "application/zip", true, Some("zip")),
    sig!("gzip", "gzip archive", "gz", "application/gzip", true, Some("gzip")),
    sig!("bzip2", "bzip2 archive", "bz2", "application/x-bzip2", true, None),
    sig!("xz", "XZ archive", "xz", "application/x-xz", true, None),
    sig!("7z", "7-Zip archive", "7z", "application/x-7z-compressed", true, None),
    sig!("rar", "RAR archive", "rar", "application/vnd.rar", true, None),
    sig!("zstd", "Zstandard data", "zst", "application/zstd", false, None),
    sig!("lz4", "LZ4 frame", "lz4", "application/x-lz4", false, None),
    sig!("cab", "Microsoft cabinet", "cab", "application/vnd.ms-cab-compressed", true, None),
    sig!("tar", "tar archive", "tar", "application/x-tar", false, Some("tar")),
    sig!("elf", "ELF executable", "elf", "application/x-elf", true, Some("elf")),
    sig!("pe", "Windows executable (PE)", "exe", "application/vnd.microsoft.portable-executable", true, Some("pe")),
    sig!("mz", "DOS executable", "exe", "application/x-dosexec", false, Some("pe")),
    sig!("macho", "Mach-O executable", "macho", "application/x-mach-binary", false, Some("macho")),
    sig!("machofat", "Mach-O universal binary", "macho", "application/x-mach-binary", false, Some("macho")),
    sig!("class", "Java class", "class", "application/java-vm", true, Some("class")),
    sig!("dex", "Android DEX", "dex", "application/vnd.android.dex", false, None),
    sig!("wasm", "WebAssembly module", "wasm", "application/wasm", false, Some("wasm")),
    sig!("sqlite", "SQLite database", "sqlite", "application/vnd.sqlite3", true, Some("sqlite")),
    sig!("mp3", "MP3 audio", "mp3", "audio/mpeg", true, Some("mp3")),
    sig!("wav", "WAVE audio", "wav", "audio/wav", true, Some("wav")),
    sig!("avi", "AVI video", "avi", "video/x-msvideo", true, None),
    sig!("mp4", "MP4 / QuickTime video", "mp4", "video/mp4", true, None),
    sig!("mkv", "Matroska / WebM video", "mkv", "video/x-matroska", true, None),
    sig!("ogg", "Ogg media", "ogg", "audio/ogg", true, None),
    sig!("flac", "FLAC audio", "flac", "audio/flac", true, None),
    sig!("midi", "MIDI", "mid", "audio/midi", false, None),
    sig!("ttf", "TrueType font", "ttf", "font/ttf", false, None),
    sig!("otf", "OpenType font", "otf", "font/otf", false, None),
    sig!("woff", "WOFF font", "woff", "font/woff", false, None),
    sig!("woff2", "WOFF2 font", "woff2", "font/woff2", false, None),
    sig!("iso", "ISO 9660 disc image", "iso", "application/x-iso9660-image", false, None),
    sig!("vmdk", "VMware disk", "vmdk", "application/x-vmdk", false, None),
    sig!("vhd", "Virtual hard disk (VHD)", "vhd", "application/x-vhd", false, None),
    sig!("vhdx", "Virtual hard disk (VHDX)", "vhdx", "application/x-vhdx", false, None),
    sig!("qcow2", "QEMU disk (qcow2)", "qcow2", "application/x-qemu-disk", false, None),
    sig!("dmp", "Windows minidump", "dmp", "application/x-dmp", false, None),
    sig!("lnk", "Windows shortcut", "lnk", "application/x-ms-shortcut", false, None),
    sig!("pcap", "Packet capture (pcap)", "pcap", "application/vnd.tcpdump.pcap", false, None),
    sig!("pcapng", "Packet capture (pcapng)", "pcapng", "application/x-pcapng", false, None),
    sig!("ole", "OLE compound file (DOC, XLS, MSI…)", "doc", "application/x-ole-storage", false, None),
    sig!("rtf", "Rich Text Format", "rtf", "application/rtf", false, None),
    sig!("pem", "PEM text (certificate, key)", "pem", "application/x-pem-file", false, None),
    sig!("der", "DER data (X.509 certificate)", "der", "application/x-x509-ca-cert", false, None),
    sig!("xml", "XML document", "xml", "application/xml", false, None),
    sig!("html", "HTML document", "html", "text/html", false, None),
    sig!("svg", "SVG image", "svg", "image/svg+xml", false, None),
    sig!("utf8bom", "UTF-8 text (BOM)", "txt", "text/plain", false, None),
    sig!("utf16le", "UTF-16 LE text (BOM)", "txt", "text/plain", false, None),
    sig!("utf16be", "UTF-16 BE text (BOM)", "txt", "text/plain", false, None),
    sig!("mbr", "Master boot record (disk)", "img", "application/octet-stream", false, Some("mbr")),
    sig!("text", "Plain text", "txt", "text/plain", false, None),
];

fn sig(id: &str) -> &'static Sig {
    SIGNATURES.iter().find(|s| s.id == id).unwrap_or(&SIGNATURES[0])
}

pub fn signatures() -> Value {
    Value::Array(
        SIGNATURES
            .iter()
            .map(|s| json!({ "id": s.id, "name": s.name, "ext": s.ext, "mime": s.mime, "carve": s.carve, "template": s.template }))
            .collect(),
    )
}

// ───────────── little readers over a buffer

fn u16le(b: &[u8], o: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(o..o + 2)?.try_into().ok()?))
}
fn u16be(b: &[u8], o: usize) -> Option<u16> {
    Some(u16::from_be_bytes(b.get(o..o + 2)?.try_into().ok()?))
}
fn u32le(b: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?))
}
fn u32be(b: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(o..o + 4)?.try_into().ok()?))
}
fn u64le(b: &[u8], o: usize) -> Option<u64> {
    Some(u64::from_le_bytes(b.get(o..o + 8)?.try_into().ok()?))
}
fn at(b: &[u8], o: usize, magic: &[u8]) -> bool {
    b.get(o..o + magic.len()) == Some(magic)
}
fn contains(b: &[u8], needle: &[u8]) -> bool {
    b.windows(needle.len()).any(|w| w == needle)
}

/// Reads `n` bytes at `o` of the source (fewer at the end).
fn read(src: &dyn Bytes, o: u64, n: usize) -> Vec<u8> {
    let end = o.saturating_add(n as u64).min(src.len());
    if o >= end {
        return Vec::new();
    }
    let mut buf = vec![0u8; (end - o) as usize];
    if src.read(o, &mut buf).is_err() {
        return Vec::new();
    }
    buf
}

// ───────────── header tests (on a buffer that starts at the candidate)

fn pe_offset(h: &[u8]) -> Option<usize> {
    if !at(h, 0, b"MZ") {
        return None;
    }
    let e = u32le(h, 0x3C)? as usize;
    ((0x40..0x10000).contains(&e) && at(h, e, b"PE\0\0")).then_some(e)
}

fn is_mp4(h: &[u8]) -> bool {
    at(h, 4, b"ftyp") && u32be(h, 0).is_some_and(|n| (8..=512).contains(&n)) && h.get(8..12).is_some_and(|b| b.iter().all(|c| c.is_ascii_graphic() || *c == b' '))
}

fn is_tar(h: &[u8]) -> bool {
    at(h, 257, b"ustar")
}

/// The id of the type whose header starts `h` (no subtypes: zip stays zip), or None.
fn header_id(h: &[u8]) -> Option<&'static str> {
    let riff = |kind: &[u8]| at(h, 0, b"RIFF") && at(h, 8, kind);
    Some(match () {
        _ if at(h, 0, b"\x89PNG\r\n\x1a\n") => "png",
        _ if at(h, 0, b"\xFF\xD8\xFF") && h.get(3).is_some_and(|&m| m >= 0xC0) => "jpeg",
        _ if at(h, 0, b"GIF87a") || at(h, 0, b"GIF89a") => "gif",
        _ if at(h, 0, b"BM") && u32le(h, 2).is_some_and(|s| s >= 26) && u32le(h, 6) == Some(0) && u32le(h, 10).is_some_and(|o| (26..0x10000).contains(&o)) => "bmp",
        _ if at(h, 0, b"II*\0") || at(h, 0, b"MM\0*") => "tiff",
        _ if riff(b"WEBP") => "webp",
        _ if riff(b"WAVE") => "wav",
        _ if riff(b"AVI ") => "avi",
        _ if at(h, 0, b"8BPS\0\x01") => "psd",
        _ if at(h, 0, b"%PDF-") => "pdf",
        _ if at(h, 0, b"PK\x03\x04") && u16le(h, 4).is_some_and(|v| v <= 100) => "zip",
        _ if at(h, 0, b"PK\x05\x06") => "zip",
        _ if at(h, 0, b"\x1F\x8B\x08") => "gzip",
        _ if at(h, 0, b"BZh") && h.get(3).is_some_and(|c| (b'1'..=b'9').contains(c)) && at(h, 4, b"1AY&SY") => "bzip2",
        _ if at(h, 0, b"\xFD7zXZ\0") => "xz",
        _ if at(h, 0, b"7z\xBC\xAF\x27\x1C") => "7z",
        _ if at(h, 0, b"Rar!\x1A\x07") => "rar",
        _ if at(h, 0, b"\x28\xB5\x2F\xFD") => "zstd",
        _ if at(h, 0, b"\x04\x22\x4D\x18") => "lz4",
        _ if at(h, 0, b"MSCF\0\0\0\0") => "cab",
        _ if at(h, 0, b"\x7FELF") && matches!(h.get(4), Some(1 | 2)) && matches!(h.get(5), Some(1 | 2)) => "elf",
        _ if pe_offset(h).is_some() => "pe",
        _ if matches!(u32le(h, 0), Some(0xFEEDFACE | 0xFEEDFACF | 0xCEFAEDFE | 0xCFFAEDFE)) => "macho",
        _ if u32be(h, 0) == Some(0xCAFEBABE) && u32be(h, 4).is_some_and(|n| (1..=30).contains(&n)) => "machofat",
        _ if u32be(h, 0) == Some(0xCAFEBABE) && u16be(h, 6).is_some_and(|v| (45..=80).contains(&v)) => "class",
        _ if at(h, 0, b"dex\n") && h.get(7) == Some(&0) => "dex",
        _ if at(h, 0, b"\0asm") => "wasm",
        _ if at(h, 0, b"SQLite format 3\0") => "sqlite",
        _ if at(h, 0, b"ID3") && h.get(3).is_some_and(|v| (2..=4).contains(v)) => "mp3",
        _ if is_mp4(h) => "mp4",
        _ if at(h, 0, b"\x1A\x45\xDF\xA3") => "mkv",
        _ if at(h, 0, b"OggS\0") => "ogg",
        _ if at(h, 0, b"fLaC") => "flac",
        _ if at(h, 0, b"MThd\0\0\0\x06") => "midi",
        _ if at(h, 0, b"\0\x01\0\0") && u16be(h, 4).is_some_and(|n| (1..=64).contains(&n)) && h.len() >= 12 && h[12..].len() >= 4 && h[12..16].iter().all(|c| c.is_ascii_alphanumeric() || *c == b' ' || *c == b'/') => "ttf",
        _ if at(h, 0, b"OTTO") => "otf",
        _ if at(h, 0, b"wOFF") => "woff",
        _ if at(h, 0, b"wOF2") => "woff2",
        _ if at(h, 0x8001, b"CD001") => "iso",
        _ if at(h, 0, b"KDMV") || at(h, 0, b"# Disk DescriptorFile") => "vmdk",
        _ if at(h, 0, b"conectix") => "vhd",
        _ if at(h, 0, b"vhdxfile") => "vhdx",
        _ if at(h, 0, b"QFI\xFB") => "qcow2",
        _ if at(h, 0, b"MDMP\x93\xA7") => "dmp",
        _ if at(h, 0, b"\x4C\0\0\0\x01\x14\x02\0") => "lnk",
        _ if matches!(u32le(h, 0), Some(0xA1B2C3D4 | 0xD4C3B2A1 | 0xA1B23C4D | 0x4D3CB2A1)) => "pcap",
        _ if at(h, 0, b"\x0A\x0D\x0D\x0A") => "pcapng",
        _ if at(h, 0, b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") => "ole",
        _ if at(h, 0, b"{\\rtf") => "rtf",
        _ if at(h, 0, b"-----BEGIN ") => "pem",
        _ if is_tar(h) => "tar",
        _ if at(h, 0, b"MZ") && u16le(h, 2).is_some_and(|v| v < 512) => "mz",
        _ if h.len() >= 4 && (at(h, 0, &[0, 0, 1, 0]) || at(h, 0, &[0, 0, 2, 0])) && u16le(h, 4).is_some_and(|n| (1..=64).contains(&n)) && h.get(9) == Some(&0) && u32le(h, 18).is_some_and(|o| o as usize >= 6 + 16 * u16le(h, 4).unwrap_or(0) as usize) => {
            if h[2] == 1 { "ico" } else { "cur" }
        }
        _ if at(h, 0, b"\xEF\xBB\xBF") => "utf8bom",
        _ if at(h, 0, b"\xFF\xFE") => "utf16le",
        _ if at(h, 0, b"\xFE\xFF") => "utf16be",
        _ if at(h, 0, b"\x30\x82") && at(h, 4, b"\x30\x82") => "der",
        _ => return None,
    })
}

fn text_kind(h: &[u8]) -> Option<&'static str> {
    if h.is_empty() {
        return None;
    }
    let sample = &h[..h.len().min(8192)];
    let text = std::str::from_utf8(sample).ok().or_else(|| {
        // a multi-byte character cut at the end of the sample
        let cut = sample.len().saturating_sub(4);
        (0..4).rev().find_map(|k| std::str::from_utf8(&sample[..cut + k]).ok())
    })?;
    if text.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t' | '\x0C')) {
        return None;
    }
    let head = text.trim_start().get(..text.trim_start().len().min(512)).unwrap_or("").to_ascii_lowercase();
    Some(if head.starts_with("<?xml") && head.contains("<svg") || head.starts_with("<svg") {
        "svg"
    } else if head.starts_with("<!doctype html") || head.starts_with("<html") {
        "html"
    } else if head.starts_with("<?xml") {
        "xml"
    } else {
        "text"
    })
}

fn is_mbr(h: &[u8]) -> bool {
    if h.len() < 512 || !at(h, 510, b"\x55\xAA") {
        return false;
    }
    let mut used = 0;
    for i in 0..4 {
        let e = 446 + i * 16;
        if !matches!(h[e], 0x00 | 0x80) {
            return false;
        }
        if h[e + 4] != 0 {
            used += 1;
            if u32le(h, e + 12) == Some(0) {
                return false;
            }
        }
    }
    used > 0
}

/// The ZIP subtype from the first entries' names.
fn zip_subtype(h: &[u8]) -> &'static str {
    if at(h, 30, b"mimetypeapplication/epub+zip") {
        "epub"
    } else if at(h, 30, b"mimetypeapplication/vnd.oasis.opendocument") {
        "odt"
    } else if contains(h, b"[Content_Types].xml") || contains(h, b"_rels/.rels") {
        if contains(h, b"word/") {
            "docx"
        } else if contains(h, b"xl/") {
            "xlsx"
        } else if contains(h, b"ppt/") {
            "pptx"
        } else {
            "zip"
        }
    } else if contains(h, b"AndroidManifest.xml") || contains(h, b"classes.dex") {
        "apk"
    } else if contains(h, b"META-INF/MANIFEST.MF") || contains(h, b"META-INF/") && contains(h, b".class") {
        "jar"
    } else {
        "zip"
    }
}

// ───────────── details

fn elf_machine(m: u16) -> &'static str {
    match m {
        2 => "SPARC",
        3 => "x86",
        8 => "MIPS",
        0x14 => "PowerPC",
        0x15 => "PowerPC64",
        0x16 => "S390",
        0x28 => "ARM",
        0x2B => "SPARC V9",
        0x32 => "IA-64",
        0x3E => "x86-64",
        0xB7 => "AArch64",
        0xF3 => "RISC-V",
        0xF7 => "BPF",
        0x102 => "LoongArch",
        _ => "unknown machine",
    }
}

fn pe_machine(m: u16) -> &'static str {
    match m {
        0x14C => "x86",
        0x8664 => "x86-64",
        0x1C0 => "ARM",
        0x1C4 => "ARM Thumb-2",
        0xAA64 => "ARM64",
        0x200 => "IA-64",
        0x5064 => "RISC-V 64",
        0xEBC => "EFI byte code",
        _ => "unknown machine",
    }
}

fn details(id: &str, h: &[u8], total: u64) -> String {
    match id {
        "png" if at(h, 12, b"IHDR") => {
            let color = match h.get(25) {
                Some(0) => "gray",
                Some(2) => "RGB",
                Some(3) => "palette",
                Some(4) => "gray+alpha",
                Some(6) => "RGBA",
                _ => "?",
            };
            format!("PNG image {}×{}, {}-bit {color}", u32be(h, 16).unwrap_or(0), u32be(h, 20).unwrap_or(0), h.get(24).copied().unwrap_or(0))
        }
        "gif" => format!("GIF image {}×{} ({})", u16le(h, 6).unwrap_or(0), u16le(h, 8).unwrap_or(0), String::from_utf8_lossy(&h[3..6])),
        "bmp" => {
            let (w, hh) = (u32le(h, 18).unwrap_or(0) as i32, u32le(h, 22).unwrap_or(0) as i32);
            format!("BMP image {}×{}, {} bits per pixel", w, hh.abs(), u16le(h, 28).unwrap_or(0))
        }
        "jpeg" => {
            let mut i = 2;
            while i + 9 < h.len() && h[i] == 0xFF {
                let m = h[i + 1];
                let len = u16be(h, i + 2).unwrap_or(0) as usize;
                if matches!(m, 0xC0..=0xCF) && !matches!(m, 0xC4 | 0xC8 | 0xCC) {
                    let kind = if m == 0xC2 { "progressive" } else { "baseline" };
                    return format!("JPEG image {}×{}, {} components, {kind}", u16be(h, i + 7).unwrap_or(0), u16be(h, i + 5).unwrap_or(0), h[i + 9]);
                }
                if len < 2 {
                    break;
                }
                i += 2 + len;
            }
            "JPEG image".into()
        }
        "elf" => {
            let bits = if h[4] == 2 { 64 } else { 32 };
            let big = h[5] == 2;
            let rd = |o: usize| if big { u16be(h, o) } else { u16le(h, o) };
            let kind = match rd(16) {
                Some(1) => "relocatable",
                Some(2) => "executable",
                Some(3) => "shared object",
                Some(4) => "core dump",
                _ => "file",
            };
            format!("ELF {bits}-bit {} {} {kind}", if big { "MSB" } else { "LSB" }, elf_machine(rd(18).unwrap_or(0)))
        }
        "pe" => {
            let e = pe_offset(h).unwrap_or(0);
            let machine = pe_machine(u16le(h, e + 4).unwrap_or(0));
            let chars = u16le(h, e + 22).unwrap_or(0);
            let opt = e + 24;
            let plus = u16le(h, opt) == Some(0x20B);
            let sub = match u16le(h, opt + 68) {
                Some(1) => "native",
                Some(2) => "GUI",
                Some(3) => "console",
                Some(10) => "EFI application",
                Some(11 | 12) => "EFI driver",
                _ => "",
            };
            let dll = if chars & 0x2000 != 0 { " DLL" } else { "" };
            format!("PE32{} {machine} {sub}{dll}, {} sections", if plus { "+" } else { "" }, u16le(h, e + 6).unwrap_or(0)).replace("  ", " ")
        }
        "macho" => {
            let magic = u32le(h, 0).unwrap_or(0);
            let swap = matches!(magic, 0xCEFAEDFE | 0xCFFAEDFE);
            let cpu = if swap { u32be(h, 4) } else { u32le(h, 4) }.unwrap_or(0);
            let name = match cpu {
                7 => "x86",
                0x0100_0007 => "x86-64",
                12 => "ARM",
                0x0100_000C => "ARM64",
                18 => "PowerPC",
                _ => "unknown cpu",
            };
            format!("Mach-O {}-bit {name}", if matches!(magic, 0xFEEDFACF | 0xCFFAEDFE) { 64 } else { 32 })
        }
        "machofat" => format!("Mach-O universal binary, {} architectures", u32be(h, 4).unwrap_or(0)),
        "class" => {
            let major = u16be(h, 6).unwrap_or(0);
            format!("Java class, version {major}.{} (Java {})", u16be(h, 4).unwrap_or(0), if major >= 49 { (major - 44).to_string() } else { "1.x".into() })
        }
        "wav" => format!("WAVE audio, {} channels, {} Hz, {} bits", u16le(h, 22).unwrap_or(0), u32le(h, 24).unwrap_or(0), u16le(h, 34).unwrap_or(0)),
        "sqlite" => {
            let page = match u16be(h, 16).unwrap_or(0) {
                1 => 65536,
                n => n as u32,
            };
            format!("SQLite 3 database, page size {page}, {} pages", u32be(h, 28).unwrap_or(0))
        }
        "pdf" => format!("PDF document, version {}", String::from_utf8_lossy(h.get(5..8).unwrap_or(b"?")).trim()),
        "wasm" => format!("WebAssembly module, version {}", u32le(h, 4).unwrap_or(0)),
        "mp3" => format!("MP3 audio, ID3v2.{}", h.get(3).copied().unwrap_or(0)),
        "gzip" => {
            let name = if h.get(3).is_some_and(|f| f & 8 != 0) {
                let start = 10 + if h[3] & 4 != 0 { 2 + u16le(h, 10).unwrap_or(0) as usize } else { 0 };
                h.get(start..).and_then(|s| s.split(|&c| c == 0).next()).map(|s| String::from_utf8_lossy(s).into_owned()).unwrap_or_default()
            } else {
                String::new()
            };
            if name.is_empty() { "gzip compressed data".into() } else { format!("gzip compressed data, was \"{name}\"") }
        }
        "mbr" => {
            let parts: Vec<String> = (0..4)
                .filter_map(|i| {
                    let e = 446 + i * 16;
                    let kind = h[e + 4];
                    (kind != 0).then(|| format!("{}: type 0x{kind:02X}, {} sectors", i + 1, u32le(h, e + 12).unwrap_or(0)))
                })
                .collect();
            let gpt = (0..4).any(|i| h[446 + i * 16 + 4] == 0xEE);
            format!("{}partitions {}", if gpt { "Protective MBR (GPT disk); " } else { "MBR; " }, parts.join("; "))
        }
        "iso" => format!("ISO 9660 volume \"{}\"", String::from_utf8_lossy(h.get(0x8028..0x8048).unwrap_or(b"")).trim()),
        "text" | "xml" | "html" | "svg" => format!("{} bytes of text", total),
        _ => String::new(),
    }
}

pub fn detect(src: &dyn Bytes, _args: &Value) -> Result<Value, String> {
    let h = read(src, 0, 64 << 10);
    let total = src.len();
    let mut id = header_id(&h).unwrap_or("");
    if id == "zip" {
        id = zip_subtype(&h);
    }
    if id.is_empty() && is_mbr(&h) {
        id = "mbr";
    }
    if id.is_empty() {
        id = text_kind(&h).unwrap_or("");
    }
    if id.is_empty() {
        return Ok(json!({ "id": "unknown", "name": "Unknown data", "mime": "application/octet-stream", "ext": "bin", "template": null, "details": if total == 0 { "empty" } else { "" } }));
    }
    let s = sig(id);
    Ok(json!({ "id": s.id, "name": s.name, "mime": s.mime, "ext": s.ext, "template": s.template, "details": details(id, &h, total) }))
}

// ───────────── carving

const MAX_GUESS: u64 = 16 << 20;
const MAX_FOOTER: u64 = 64 << 20;

/// Finds `needle` in the source from `from`, before `limit`.
fn find(src: &dyn Bytes, needle: &[u8], from: u64, limit: u64) -> Option<u64> {
    const CHUNK: usize = 1 << 20;
    let end = limit.min(src.len());
    let mut pos = from;
    while pos < end {
        let buf = read(src, pos, CHUNK + needle.len() - 1);
        let n = buf.len().min((end - pos) as usize + needle.len() - 1);
        if let Some(i) = buf[..n].windows(needle.len()).position(|w| w == needle) {
            return Some(pos + i as u64);
        }
        pos += CHUNK as u64;
    }
    None
}

fn jpeg_len(src: &dyn Bytes, o: u64, limit: u64) -> Option<u64> {
    let mut p = o + 2;
    loop {
        let m = read(src, p, 4);
        if m.len() < 2 || m[0] != 0xFF {
            return None;
        }
        match m[1] {
            0xD9 => return Some(p + 2 - o),
            0xFF => p += 1,
            0x01 | 0xD0..=0xD7 => p += 2,
            0xDA => {
                // header, then entropy-coded data up to the next marker that is not a stuffed 00 or a restart
                p += 2 + u16be(&m, 2)? as u64;
                loop {
                    let ff = find(src, b"\xFF", p, limit.min(o + MAX_FOOTER))?;
                    let next = read(src, ff + 1, 1);
                    match next.first() {
                        Some(0x00) | Some(0xD0..=0xD7) | Some(0xFF) => p = ff + 1,
                        Some(_) => {
                            p = ff;
                            break;
                        }
                        None => return None,
                    }
                }
            }
            _ => {
                let len = u16be(&m, 2)? as u64;
                if len < 2 {
                    return None;
                }
                p += 2 + len;
            }
        }
        if p - o > MAX_FOOTER || p >= limit {
            return None;
        }
    }
}

fn png_len(src: &dyn Bytes, o: u64, limit: u64) -> Option<u64> {
    let mut p = o + 8;
    loop {
        let c = read(src, p, 8);
        let len = u32be(&c, 0)? as u64;
        if !c.get(4..8)?.iter().all(|b| b.is_ascii_alphabetic()) || len > 0x7FFF_FFFF {
            return None;
        }
        p += 12 + len;
        if &c[4..8] == b"IEND" {
            return Some(p - o);
        }
        if p > limit {
            return None;
        }
    }
}

fn gif_len(src: &dyn Bytes, o: u64, limit: u64) -> Option<u64> {
    let h = read(src, o, 13);
    let mut p = o + 13;
    if h.get(10)? & 0x80 != 0 {
        p += 3 << ((h[10] & 7) + 1);
    }
    let skip_blocks = |mut p: u64| -> Option<u64> {
        loop {
            let n = *read(src, p, 1).first()? as u64;
            p += 1 + n;
            if n == 0 {
                return Some(p);
            }
            if p > limit {
                return None;
            }
        }
    };
    loop {
        let b = *read(src, p, 1).first()?;
        match b {
            0x3B => return Some(p + 1 - o),
            0x21 => p = skip_blocks(p + 2)?,
            0x2C => {
                let d = read(src, p, 10);
                let mut q = p + 10;
                if d.get(9)? & 0x80 != 0 {
                    q += 3 << ((d[9] & 7) + 1);
                }
                p = skip_blocks(q + 1)?;
            }
            _ => return None,
        }
        if p > limit {
            return None;
        }
    }
}

fn pdf_len(src: &dyn Bytes, o: u64, limit: u64) -> Option<u64> {
    let stop = limit.min(o + MAX_FOOTER);
    let mut last = None;
    let mut p = o;
    while let Some(e) = find(src, b"%%EOF", p, stop) {
        last = Some(e);
        p = e + 5;
    }
    let e = last? + 5;
    let tail = read(src, e, 2);
    let eol = tail.iter().take_while(|&&c| c == b'\r' || c == b'\n').count() as u64;
    Some(e + eol - o)
}

fn zip_len(src: &dyn Bytes, o: u64, limit: u64) -> Option<u64> {
    let e = find(src, b"PK\x05\x06", o, limit.min(o + (1 << 30)))?;
    let rec = read(src, e, 22);
    Some(e + 22 + u16le(&rec, 20)? as u64 - o)
}

fn elf_len(src: &dyn Bytes, o: u64) -> Option<u64> {
    let h = read(src, o, 64);
    let wide = h.get(4) == Some(&2);
    let big = h.get(5) == Some(&2);
    let r16 = |b: &[u8], i: usize| if big { u16be(b, i) } else { u16le(b, i) };
    let r32 = |b: &[u8], i: usize| if big { u32be(b, i) } else { u32le(b, i) };
    let r64 = |b: &[u8], i: usize| if big { Some(u64::from_be_bytes(b.get(i..i + 8)?.try_into().ok()?)) } else { u64le(b, i) };
    let (phoff, shoff, phent, phnum, shent, shnum) = if wide {
        (r64(&h, 32)?, r64(&h, 40)?, r16(&h, 54)?, r16(&h, 56)?, r16(&h, 58)?, r16(&h, 60)?)
    } else {
        (r32(&h, 28)? as u64, r32(&h, 32)? as u64, r16(&h, 42)?, r16(&h, 44)?, r16(&h, 46)?, r16(&h, 48)?)
    };
    let mut end = (shoff + shent as u64 * shnum as u64).max(phoff + phent as u64 * phnum as u64);
    let ph = read(src, o + phoff, (phent as usize) * (phnum as usize).min(256));
    for i in 0..(phnum as usize).min(256) {
        let b = &ph.get(i * phent as usize..)?;
        let (off, size) = if wide { (r64(b, 8)?, r64(b, 32)?) } else { (r32(b, 4)? as u64, r32(b, 16)? as u64) };
        end = end.max(off + size);
    }
    let sh = read(src, o + shoff, (shent as usize) * (shnum as usize).min(1024));
    for i in 0..(shnum as usize).min(1024) {
        let Some(b) = sh.get(i * shent as usize..) else { break };
        let kind = r32(b, 4).unwrap_or(0);
        if kind == 8 {
            continue; // NOBITS (.bss) takes no room in the file
        }
        let (off, size) = if wide { (r64(b, 24).unwrap_or(0), r64(b, 32).unwrap_or(0)) } else { (r32(b, 16).unwrap_or(0) as u64, r32(b, 20).unwrap_or(0) as u64) };
        end = end.max(off + size);
    }
    (end > 52 && end < (4u64 << 30)).then_some(end)
}

fn pe_len(src: &dyn Bytes, o: u64) -> Option<u64> {
    let h = read(src, o, 4096);
    let e = pe_offset(&h)?;
    let sections = u16le(&h, e + 6)? as usize;
    let opt_size = u16le(&h, e + 20)? as usize;
    let opt = e + 24;
    let plus = u16le(&h, opt) == Some(0x20B);
    let mut end = u32le(&h, opt + 60).unwrap_or(0) as u64; // SizeOfHeaders
    let table = read(src, o + (opt + opt_size) as u64, sections.min(96) * 40);
    for i in 0..sections.min(96) {
        let raw_size = u32le(&table, i * 40 + 16)? as u64;
        let raw_ptr = u32le(&table, i * 40 + 20)? as u64;
        end = end.max(raw_ptr + raw_size);
    }
    // the certificate table (data directory 4) lies after the sections, given as a file offset
    let dirs = opt + if plus { 112 } else { 96 };
    if let (Some(cert_off), Some(cert_size)) = (u32le(&h, dirs + 32), u32le(&h, dirs + 36)) {
        if cert_size > 0 {
            end = end.max(cert_off as u64 + cert_size as u64);
        }
    }
    (end > 0x40).then_some(end)
}

fn mp4_len(src: &dyn Bytes, o: u64, limit: u64) -> Option<u64> {
    let mut p = o;
    while p + 8 <= limit {
        let b = read(src, p, 16);
        let kind = b.get(4..8)?;
        if !kind.iter().all(|c| c.is_ascii_alphanumeric() || *c == b' ' || *c == 0xA9) {
            break;
        }
        let size = match u32be(&b, 0)? {
            0 => limit - p,
            1 => u64::from_be_bytes(b.get(8..16)?.try_into().ok()?),
            n => n as u64,
        };
        if size < 8 {
            break;
        }
        p += size;
    }
    (p > o + 8).then_some(p.min(limit) - o)
}

fn ogg_len(src: &dyn Bytes, o: u64, limit: u64) -> Option<u64> {
    let mut p = o;
    while p < limit {
        let h = read(src, p, 27);
        if !at(&h, 0, b"OggS") || h.len() < 27 {
            break;
        }
        let segs = h[26] as usize;
        let table = read(src, p + 27, segs);
        let body: u64 = table.iter().map(|&s| s as u64).sum();
        p += 27 + segs as u64 + body;
        if h[5] & 4 != 0 {
            break; // end of stream
        }
    }
    (p > o).then_some(p - o)
}

fn mp3_len(src: &dyn Bytes, o: u64, limit: u64) -> Option<u64> {
    let h = read(src, o, 10);
    let tag = ((h[6] as u64 & 0x7F) << 21) | ((h[7] as u64 & 0x7F) << 14) | ((h[8] as u64 & 0x7F) << 7) | (h[9] as u64 & 0x7F);
    let mut p = o + 10 + tag;
    const BITRATES_V1: [u32; 16] = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    const BITRATES_V2: [u32; 16] = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
    let mut frames = 0;
    while p + 4 <= limit {
        let f = read(src, p, 4);
        if f.len() < 4 || f[0] != 0xFF || f[1] & 0xE0 != 0xE0 {
            break;
        }
        let version = (f[1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
        let layer = (f[1] >> 1) & 3; // 1 = layer III
        let bi = (f[2] >> 4) as usize;
        let si = ((f[2] >> 2) & 3) as usize;
        if version == 1 || layer != 1 || bi == 0 || bi == 15 || si == 3 {
            break;
        }
        let rates = [44100u32, 48000, 32000];
        let rate = rates[si] >> if version == 3 { 0 } else if version == 2 { 1 } else { 2 };
        let bitrate = if version == 3 { BITRATES_V1[bi] } else { BITRATES_V2[bi] } * 1000;
        let pad = ((f[2] >> 1) & 1) as u32;
        let len = if version == 3 { 144 * bitrate / rate + pad } else { 72 * bitrate / rate + pad };
        if len < 4 {
            break;
        }
        p += len as u64;
        frames += 1;
    }
    if read(src, p, 3) == b"TAG" {
        p += 128;
    }
    (frames > 0 || tag > 0).then_some(p.min(limit) - o)
}

/// The length of the file of type `id` at `o` from its structure, if the format tells.
fn structural_len(src: &dyn Bytes, id: &str, o: u64, limit: u64) -> Option<u64> {
    let h = read(src, o, 64);
    let len = match id {
        "jpeg" => jpeg_len(src, o, limit),
        "png" => png_len(src, o, limit),
        "gif" => gif_len(src, o, limit),
        "pdf" => pdf_len(src, o, limit),
        "zip" => zip_len(src, o, limit),
        "bmp" => u32le(&h, 2).map(|n| n as u64),
        "wav" | "avi" | "webp" => u32le(&h, 4).map(|n| n as u64 + 8),
        "elf" => elf_len(src, o),
        "pe" => pe_len(src, o),
        "sqlite" => {
            let page = match u16be(&h, 16)? {
                1 => 65536,
                n => n as u64,
            };
            let pages = u32be(&h, 28)? as u64;
            (pages > 0).then_some(page * pages)
        }
        "7z" => Some(32 + u64le(&h, 12)? + u64le(&h, 20)?),
        "mp4" => mp4_len(src, o, limit),
        "ogg" => ogg_len(src, o, limit),
        "mp3" => mp3_len(src, o, limit),
        "cab" => u32le(&h, 8).map(|n| n as u64),
        "class" => None,
        _ => None,
    }?;
    (len > 0 && o + len <= limit).then_some(len)
}

pub fn carve(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let (offset, length) = range_of(src, args);
    let end = offset + length;
    let limit = args.u64_or("limit", 1000).clamp(1, 100_000) as usize;
    let wanted: Option<Vec<String>> = args.get("types").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect());
    let allowed = |id: &str| sig(id).carve && sig(id).id == id && wanted.as_ref().is_none_or(|w| w.iter().any(|x| x == id));
    // First bytes that can start a header (mp4's "ftyp" box starts 4 bytes before the magic: any byte).
    let mut first = [false; 256];
    for b in [0x89u8, 0xFF, b'G', b'B', b'I', b'M', b'R', b'8', b'%', b'P', 0x1F, 0xFD, b'7', 0x7F, 0xCA, b'S', b'O', b'f', 0x1A, b'I'] {
        first[b as usize] = true;
    }
    let mp4 = allowed("mp4");
    // 1. headers
    let mut hits: Vec<(u64, &'static str)> = Vec::new();
    const CHUNK: usize = 4 << 20;
    let mut pos = offset;
    let mut truncated = false;
    'scan: while pos < end {
        let n = ((end - pos) as usize).min(CHUNK);
        let buf = read(src, pos, n + 0x9000);
        for i in 0..n {
            let b = buf[i];
            let candidate = first[b as usize] || (mp4 && buf.get(i + 4..i + 8) == Some(b"ftyp"));
            if !candidate {
                continue;
            }
            let h = &buf[i..];
            let id = if h.len() >= 520 {
                header_id(h)
            } else {
                let more = read(src, pos + i as u64, 0x9000);
                header_id(&more)
            };
            if let Some(id) = id {
                // A TIFF header matches "II*\0" often in random data: require a sane first IFD offset.
                if id == "tiff" && !u32le(h, 4).is_some_and(|v| (8..=0x100_0000).contains(&v)) && !u32be(h, 4).is_some_and(|v| (8..=0x100_0000).contains(&v)) {
                    continue;
                }
                if allowed(id) {
                    hits.push((pos + i as u64, id));
                    if hits.len() > limit * 8 {
                        truncated = true;
                        break 'scan;
                    }
                }
            }
        }
        pos += n as u64;
        if !progress(pos - offset, length * 2) {
            return Err(CANCELLED.into());
        }
    }
    // 2. lengths
    let mut items: Vec<Value> = Vec::new();
    let mut covered_to = 0u64;
    for (k, &(o, id)) in hits.iter().enumerate() {
        if o < covered_to {
            continue;
        }
        let next = hits[k + 1..].iter().map(|h| h.0).find(|&p| p > o).unwrap_or(end);
        let structural = structural_len(src, id, o, end);
        let len = match structural {
            Some(l) => l,
            None => (next - o).min(MAX_GUESS).min(end - o),
        };
        if structural.is_some() {
            covered_to = o + len;
        }
        let s = sig(id);
        items.push(json!({ "offset": o, "length": len, "id": id, "name": s.name, "ext": s.ext, "exact": structural.is_some() }));
        if items.len() >= limit {
            truncated = truncated || k + 1 < hits.len();
            break;
        }
        if k % 64 == 0 && !progress(length + (o - offset), length * 2) {
            return Err(CANCELLED.into());
        }
    }
    Ok(json!({ "items": items, "truncated": truncated }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::no_progress;

    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut v = b"\x89PNG\r\n\x1a\n".to_vec();
        let mut chunk = |kind: &[u8], data: &[u8]| {
            v.extend_from_slice(&(data.len() as u32).to_be_bytes());
            v.extend_from_slice(kind);
            v.extend_from_slice(data);
            v.extend_from_slice(&[0, 0, 0, 0]);
        };
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&w.to_be_bytes());
        ihdr.extend_from_slice(&h.to_be_bytes());
        ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
        chunk(b"IHDR", &ihdr);
        chunk(b"IDAT", &[1, 2, 3, 4, 5]);
        chunk(b"IEND", &[]);
        v
    }

    fn jpeg(size: usize) -> Vec<u8> {
        let mut v = vec![0xFF, 0xD8, 0xFF, 0xE0, 0, 16];
        v.extend_from_slice(b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
        v.extend_from_slice(&[0xFF, 0xC0, 0, 11, 8, 0, 20, 0, 30, 1, 1, 0x11, 0]);
        v.extend_from_slice(&[0xFF, 0xDA, 0, 8, 1, 1, 0, 0, 0x3F, 0]);
        for i in 0..size {
            v.push((i % 200) as u8 + 1);
            if i % 50 == 0 {
                v.extend_from_slice(&[0xFF, 0x00]);
            }
        }
        v.extend_from_slice(&[0xFF, 0xD9]);
        v
    }

    fn det(data: &[u8]) -> Value {
        detect(&data.to_vec(), &json!({})).unwrap()
    }

    #[test]
    fn detects_formats() {
        let p = det(&png(640, 480));
        assert_eq!(p["id"], "png");
        assert_eq!(p["template"], "png");
        assert_eq!(p["details"], "PNG image 640×480, 8-bit RGBA");
        let mut elf = vec![0u8; 64];
        elf[..6].copy_from_slice(b"\x7FELF\x02\x01");
        elf[16] = 2;
        elf[18] = 0x3E;
        let e = det(&elf);
        assert_eq!(e["id"], "elf");
        assert_eq!(e["details"], "ELF 64-bit LSB x86-64 executable");
        let mut pe = vec![0u8; 512];
        pe[..2].copy_from_slice(b"MZ");
        pe[0x3C] = 0x80;
        pe[0x80..0x84].copy_from_slice(b"PE\0\0");
        pe[0x84..0x86].copy_from_slice(&0x8664u16.to_le_bytes());
        pe[0x86] = 3;
        pe[0x98..0x9A].copy_from_slice(&0x20Bu16.to_le_bytes());
        pe[0x98 + 68] = 2;
        let d = det(&pe);
        assert_eq!(d["id"], "pe");
        assert_eq!(d["details"], "PE32+ x86-64 GUI, 3 sections");
        let mut zip = b"PK\x03\x04\x14\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x13\0\0\0".to_vec();
        zip.extend_from_slice(b"[Content_Types].xmlword/document.xml");
        assert_eq!(det(&zip)["id"], "docx");
        assert_eq!(det(b"PK\x03\x04\x14\0\0\0")["id"], "zip");
        assert_eq!(det(b"hello world\n")["id"], "text");
        assert_eq!(det(b"<!DOCTYPE html><html>")["id"], "html");
        assert_eq!(det(&[0x00, 0x13, 0xFE, 0x02, 0x99])["id"], "unknown");
        let mut mbr = vec![0u8; 512];
        mbr[510] = 0x55;
        mbr[511] = 0xAA;
        mbr[446] = 0x80;
        mbr[446 + 4] = 0x07;
        mbr[446 + 12] = 0x10;
        assert_eq!(det(&mbr)["id"], "mbr");
        assert!(SIGNATURES.len() >= 40);
    }

    #[test]
    fn carves_jpegs_and_png() {
        let mut data = vec![0x11u8; 1000];
        let j1 = jpeg(3000);
        let p = png(10, 10);
        let j2 = jpeg(500);
        let o1 = data.len();
        data.extend_from_slice(&j1);
        data.extend(std::iter::repeat_n(0xAB, 777));
        let o2 = data.len();
        data.extend_from_slice(&p);
        data.extend(std::iter::repeat_n(0x00, 333));
        let o3 = data.len();
        data.extend_from_slice(&j2);
        data.extend(std::iter::repeat_n(0x42, 100));
        let r = carve(&data, &json!({}), &mut no_progress()).unwrap();
        let items: Vec<(u64, u64, String)> = r["items"].as_array().unwrap().iter().map(|i| (i["offset"].as_u64().unwrap(), i["length"].as_u64().unwrap(), i["id"].as_str().unwrap().to_string())).collect();
        assert_eq!(items, vec![(o1 as u64, j1.len() as u64, "jpeg".into()), (o2 as u64, p.len() as u64, "png".into()), (o3 as u64, j2.len() as u64, "jpeg".into())]);
        let only = carve(&data, &json!({ "types": ["png"] }), &mut no_progress()).unwrap();
        assert_eq!(only["items"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn carve_zip_skips_entries() {
        let mut data = vec![0u8; 100];
        let start = data.len();
        data.extend_from_slice(b"PK\x03\x04\x14\0\0\0aaaaaaaaaaaaPK\x03\x04\x14\0\0\0bbbb");
        data.extend_from_slice(b"PK\x05\x06\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x02\0xy");
        let total = data.len() - start;
        data.extend_from_slice(&[0; 50]);
        let r = carve(&data, &json!({}), &mut no_progress()).unwrap();
        let items = r["items"].as_array().unwrap();
        assert_eq!(items.len(), 1, "{items:?}");
        assert_eq!(items[0]["length"], json!(total));
    }
}
