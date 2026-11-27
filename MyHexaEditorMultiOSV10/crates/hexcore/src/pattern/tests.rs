use super::*;
use crate::util::no_progress;
use serde_json::Value;

fn run_src(data: &[u8], source: &str) -> Value {
    let bytes = data.to_vec();
    run(&bytes, &json!({ "source": source }), &mut no_progress()).unwrap()
}

fn run_builtin(data: &[u8], id: &str) -> Value {
    let bytes = data.to_vec();
    let out = run(&bytes, &json!({ "template": id }), &mut no_progress()).unwrap();
    assert_eq!(out["errors"], json!([]), "{id}: {}", out["errors"]);
    out
}

/// A node by a path of names ("chunks/[0]/type").
fn node<'v>(out: &'v Value, path: &str) -> &'v Value {
    let mut list = &out["nodes"];
    let mut found = &Value::Null;
    for part in path.split('/') {
        found = list.as_array().unwrap_or_else(|| panic!("no children at {part} in {path}")).iter().find(|n| n["name"] == part).unwrap_or_else(|| panic!("no node {part} in {path}: {list}"));
        list = &found["children"];
    }
    found
}

fn value(out: &Value, path: &str) -> String {
    node(out, path)["value"].as_str().unwrap().to_string()
}

fn be32(v: u32) -> [u8; 4] {
    v.to_be_bytes()
}
fn le16(v: u16) -> [u8; 2] {
    v.to_le_bytes()
}
fn le32(v: u32) -> [u8; 4] {
    v.to_le_bytes()
}

// ── the language

#[test]
fn fields_arrays_and_values() {
    let data = [b'A', b'B', b'C', b'D', 0x31, 0x01, 0, 0, 3, 1, 2, 3, 0xFF, 0xFE];
    let out = run_src(&data, "struct H { char magic[4]; u32 n; u8 count; u8 items[count]; s16 last; };\nH header;");
    assert_eq!(value(&out, "header/magic"), "\"ABCD\"");
    assert_eq!(value(&out, "header/n"), "305 (0x131)");
    assert_eq!(value(&out, "header/items"), "01 02 03");
    assert_eq!(value(&out, "header/last"), "-257 (0xFEFF)");
    assert_eq!(node(&out, "header")["type"], "struct H");
    assert_eq!(node(&out, "header")["size"], 14);
    assert_eq!(node(&out, "header/items")["type"], "u8[3]");
}

#[test]
fn endian_enum_bitfield_placement() {
    let data = [0x00, 0x02, 0x12, 0x34, 0b1011_0101, 0xAA, 0xBB];
    let src = "enum Kind : be u16 { A = 1, B, C };\nbitfield F { low : 4; mid : 3; top : 1; };\nKind kind;\nbe u16 word;\nle u16 little @ 2;\nF flags;\nu8 tail[2] [[color(\"red\"), comment(\"end\")]];";
    let out = run_src(&data, src);
    assert_eq!(value(&out, "kind"), "B (2)");
    assert_eq!(value(&out, "word"), "4660 (0x1234)");
    assert_eq!(value(&out, "little"), "13330 (0x3412)");
    assert_eq!(value(&out, "flags/low"), "5 (0x5)");
    assert_eq!(value(&out, "flags/mid"), "3 (0x3)");
    assert_eq!(value(&out, "flags/top"), "1 (0x1)");
    assert_eq!(node(&out, "tail")["color"], "#e5484d");
    assert_eq!(node(&out, "tail")["comment"], "end");
    assert_eq!(node(&out, "tail")["offset"], 5);
}

#[test]
fn loops_locals_structs_arrays() {
    let data = [2, 10, 20, 3, 1, 2, 3, 9, 9];
    let src = "struct Item { u8 len; u8 data[len]; };\nu8 n; u8 a; u8 b;\nItem items[1];\nlet total = 0;\nfor (let i = 0; i < n; i++) { total += 1; }\nwhile ($ < size()) { u8 rest; }\nif (total == 2 && items[0].len == 3) u8 ok @ 0;";
    let out = run_src(&data, src);
    assert_eq!(out["errors"], json!([]));
    assert_eq!(value(&out, "items/[0]/data"), "01 02 03");
    assert_eq!(value(&out, "ok"), "2 (0x2)");
    let rests = out["nodes"].as_array().unwrap().iter().filter(|n| n["name"] == "rest").count();
    assert_eq!(rests, 2);
}

#[test]
fn text_until_zero_union_and_010_attributes() {
    let data = b"hello\0\x01\x02\x03\x04";
    let src = "char s[];\nunion U { u32 whole; u8 first; };\nU u <bgcolor=0x00FF00, comment=\"both\">;";
    let out = run_src(data, src);
    assert_eq!(value(&out, "s"), "\"hello\"");
    assert_eq!(node(&out, "s")["size"], 6);
    assert_eq!(value(&out, "u/first"), "1 (0x1)");
    assert_eq!(node(&out, "u")["size"], 4);
    assert_eq!(node(&out, "u")["color"], "#00ff00");
}

#[test]
fn errors_keep_nodes() {
    let out = run_src(&[1, 2, 3], "u8 a;\nu8 b;\nu32 c;\nu8 d;");
    assert_eq!(out["nodes"].as_array().unwrap().len(), 2);
    let e = &out["errors"][0];
    assert_eq!(e["line"], 3);
    assert!(e["message"].as_str().unwrap().contains("end of data"));
    let out = run_src(&[1], "u8 a;\nstruct {");
    assert_eq!(out["errors"][0]["line"], 2);
    let out = run_src(&[1], "while (1) { let x = 1; }");
    assert!(out["errors"][0]["message"].as_str().unwrap().contains("iterations"));
    let out = run_src(&[1], "u8 a;\nfoo(1);");
    assert!(out["errors"][0]["message"].as_str().unwrap().contains("unknown function"));
}

#[test]
fn cancel_and_node_limit() {
    let data = vec![0u8; 100_000];
    let r = run(&data, &json!({ "source": "u8 x[while(!eof())];\nstruct B { u8 v; };\nB all[1000] @ 0;" }), &mut |_, _| false);
    assert_eq!(r.unwrap_err(), CANCELLED);
    let out = run(&data, &json!({ "source": "struct B { u8 v; };\nB all[5000];", "maxNodes": 100 }), &mut no_progress()).unwrap();
    assert!(out["errors"][0]["message"].as_str().unwrap().contains("too many nodes"));
}

#[test]
fn every_builtin_parses() {
    for (id, _, _, _, source) in BUILTINS {
        if let Err(e) = parser::parse(source) {
            panic!("{id}: line {} col {}: {}", e.line, e.col, e.message);
        }
        assert!(builtin_source(id).is_ok());
    }
    assert_eq!(builtins().as_array().unwrap().len(), BUILTINS.len());
}

// ── built-in templates on real (small) files

fn png() -> Vec<u8> {
    let mut d = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    let chunk = |d: &mut Vec<u8>, ty: &[u8], body: &[u8]| {
        d.extend(be32(body.len() as u32));
        d.extend(ty);
        d.extend(body);
        d.extend(be32(0x1234_5678));
    };
    let mut ihdr = Vec::new();
    ihdr.extend(be32(2));
    ihdr.extend(be32(3));
    ihdr.extend([8, 6, 0, 0, 0]);
    chunk(&mut d, b"IHDR", &ihdr);
    chunk(&mut d, b"IDAT", &[0x78, 0x9C, 1, 2, 3]);
    chunk(&mut d, b"IEND", &[]);
    d
}

#[test]
fn template_png() {
    let out = run_builtin(&png(), "png");
    assert_eq!(value(&out, "signature"), "89 50 4E 47 0D 0A 1A 0A");
    assert_eq!(node(&out, "chunks")["children"].as_array().unwrap().len(), 3);
    assert_eq!(value(&out, "chunks/[0]/type"), "\"IHDR\"");
    assert_eq!(value(&out, "chunks/[0]/width"), "2 (0x2)");
    assert_eq!(value(&out, "chunks/[0]/height"), "3 (0x3)");
    assert_eq!(value(&out, "chunks/[1]/data"), "78 9C 01 02 03");
    assert_eq!(value(&out, "chunks/[2]/type"), "\"IEND\"");
    assert_eq!(node(&out, "chunks/[0]")["color"], "#3b82f6");
}

#[test]
fn template_bmp() {
    let mut d = Vec::new();
    d.extend(b"BM");
    d.extend(le32(54 + 16));
    d.extend([0, 0, 0, 0]);
    d.extend(le32(54));
    d.extend(le32(40));
    d.extend(le32(2));
    d.extend(le32(2));
    d.extend(le16(1));
    d.extend(le16(24));
    d.extend([0u8; 24]);
    d.extend([0xAAu8; 16]);
    let out = run_builtin(&d, "bmp");
    assert_eq!(value(&out, "fileHeader/bfType"), "\"BM\"");
    assert_eq!(value(&out, "infoHeader/biWidth"), "2 (0x2)");
    assert_eq!(value(&out, "infoHeader/biBitCount"), "24 (0x18)");
    assert_eq!(node(&out, "pixels")["size"], 16);
    assert_eq!(node(&out, "pixels")["offset"], 54);
}

#[test]
fn template_zip() {
    let mut d = Vec::new();
    d.extend(le32(0x0403_4B50));
    d.extend(le16(20));
    d.extend(le16(0));
    d.extend(le16(0));
    d.extend([0, 0, 0, 0]);
    d.extend(le32(0xDEAD_BEEF));
    d.extend(le32(2));
    d.extend(le32(2));
    d.extend(le16(5));
    d.extend(le16(0));
    d.extend(b"a.txt");
    d.extend(b"hi");
    let cd = d.len() as u32;
    d.extend(le32(0x0201_4B50));
    d.extend(le16(20));
    d.extend(le16(20));
    d.extend([0u8; 8]);
    d.extend(le32(0xDEAD_BEEF));
    d.extend(le32(2));
    d.extend(le32(2));
    d.extend(le16(5));
    d.extend(le16(0));
    d.extend(le16(0));
    d.extend([0u8; 8]);
    d.extend(le32(0));
    d.extend(b"a.txt");
    let cd_size = d.len() as u32 - cd;
    d.extend(le32(0x0605_4B50));
    d.extend([0u8; 4]);
    d.extend(le16(1));
    d.extend(le16(1));
    d.extend(le32(cd_size));
    d.extend(le32(cd));
    d.extend(le16(0));
    let out = run_builtin(&d, "zip");
    assert_eq!(value(&out, "a.txt/fileName"), "\"a.txt\"");
    assert_eq!(value(&out, "a.txt/data"), "68 69");
    assert_eq!(value(&out, "a.txt/crc32"), "3735928559 (0xDEADBEEF)");
    assert_eq!(value(&out, "endOfCentralDirectory/totalEntries"), "1 (0x1)");
    let names: Vec<&str> = out["nodes"].as_array().unwrap().iter().map(|n| n["name"].as_str().unwrap()).collect();
    assert_eq!(names, vec!["a.txt", "a.txt", "endOfCentralDirectory"]);
}

#[test]
fn template_elf() {
    let mut d = vec![0x7F, b'E', b'L', b'F', 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    d.extend(le16(2));
    d.extend(le16(62));
    d.extend(le32(1));
    d.extend(0x401000u64.to_le_bytes());
    d.extend(0u64.to_le_bytes());
    d.extend(0u64.to_le_bytes());
    d.extend(le32(0));
    d.extend(le16(64));
    d.extend(le16(56));
    d.extend(le16(0));
    d.extend(le16(64));
    d.extend(le16(0));
    d.extend(le16(0));
    assert_eq!(d.len(), 64);
    let out = run_builtin(&d, "elf");
    assert_eq!(value(&out, "e_type"), "EXEC (2)");
    assert_eq!(value(&out, "e_machine"), "X86_64 (62)");
    assert_eq!(value(&out, "e_entry"), "4198400 (0x401000)");
    assert_eq!(node(&out, "e_entry")["type"], "u64");
    // A big-endian 32-bit one.
    let mut b = vec![0x7F, b'E', b'L', b'F', 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    b.extend(2u16.to_be_bytes());
    b.extend(8u16.to_be_bytes());
    b.extend(1u32.to_be_bytes());
    b.extend(0x400000u32.to_be_bytes());
    b.extend([0u8; 8]);
    b.extend([0u8; 4]);
    b.extend([0u8; 12]);
    let out = run_builtin(&b, "elf");
    assert_eq!(value(&out, "e_machine"), "MIPS (8)");
    assert_eq!(value(&out, "e_entry"), "4194304 (0x400000)");
}

#[test]
fn template_pe() {
    let mut d = vec![0u8; 64];
    d[0] = b'M';
    d[1] = b'Z';
    d[60..64].copy_from_slice(&le32(64));
    d.extend(b"PE\0\0");
    d.extend(le16(0x8664));
    d.extend(le16(1));
    d.extend(le32(0));
    d.extend(le32(0));
    d.extend(le32(0));
    d.extend(le16(240));
    d.extend(le16(0x22));
    let opt = d.len();
    let mut o = vec![0u8; 240];
    o[0..2].copy_from_slice(&le16(0x20B));
    o[16..20].copy_from_slice(&le32(0x1000));
    o[24..32].copy_from_slice(&0x1_4000_0000u64.to_le_bytes());
    o[68..70].copy_from_slice(&le16(3));
    o[108..112].copy_from_slice(&le32(16));
    d.extend(o);
    assert_eq!(d.len(), opt + 240);
    let raw = (d.len() + 40) as u32;
    let mut s = vec![0u8; 40];
    s[0..5].copy_from_slice(b".text");
    s[8..12].copy_from_slice(&le32(16));
    s[16..20].copy_from_slice(&le32(16));
    s[20..24].copy_from_slice(&le32(raw));
    d.extend(s);
    d.extend([0xC3u8; 16]);
    let out = run_builtin(&d, "pe");
    assert_eq!(value(&out, "dosHeader/e_magic"), "\"MZ\"");
    assert_eq!(value(&out, "signature"), "\"PE\"");
    assert_eq!(value(&out, "coffHeader/machine"), "AMD64 (34404)");
    assert_eq!(value(&out, "optionalHeader/imageBase"), "5368709120 (0x140000000)");
    assert_eq!(value(&out, "optionalHeader/subsystem"), "WINDOWS_CUI (3)");
    assert_eq!(node(&out, "optionalHeader/dataDirectories")["children"].as_array().unwrap().len(), 16);
    assert_eq!(value(&out, "sectionHeaders/[0]/name"), "\".text\"");
    assert_eq!(value(&out, ".text"), "C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3 C3");
    assert_eq!(node(&out, ".text")["offset"], raw);
}

#[test]
fn template_wav() {
    let mut d = Vec::new();
    d.extend(b"RIFF");
    d.extend(le32(36 + 4));
    d.extend(b"WAVE");
    d.extend(b"fmt ");
    d.extend(le32(16));
    d.extend(le16(1));
    d.extend(le16(2));
    d.extend(le32(44100));
    d.extend(le32(44100 * 4));
    d.extend(le16(4));
    d.extend(le16(16));
    d.extend(b"data");
    d.extend(le32(4));
    d.extend([1, 2, 3, 4]);
    let out = run_builtin(&d, "wav");
    assert_eq!(value(&out, "wave"), "\"WAVE\"");
    assert_eq!(value(&out, "chunks/[0]/sampleRate"), "44100 (0xAC44)");
    assert_eq!(value(&out, "chunks/[0]/channels"), "2 (0x2)");
    assert_eq!(value(&out, "chunks/[1]/samples"), "01 02 03 04");
}

#[test]
fn template_gif_jpeg_gzip() {
    let mut g = b"GIF89a".to_vec();
    g.extend(le16(1));
    g.extend(le16(1));
    g.extend([0x80, 0, 0]);
    g.extend([0, 0, 0, 255, 255, 255]);
    g.extend([0x21, 0xF9, 4, 0, 0, 0, 0, 0]);
    g.extend([0x2C]);
    g.extend([0u8; 8]);
    g.extend([0, 2, 2, 0x4C, 0x01, 0, 0x3B]);
    let out = run_builtin(&g, "gif");
    assert_eq!(value(&out, "version"), "\"89a\"");
    assert_eq!(node(&out, "globalColorTable")["size"], 6);
    assert_eq!(value(&out, "image/lzwMinimumCodeSize"), "2 (0x2)");
    assert_eq!(value(&out, "trailer"), "59 (0x3B)");

    let mut j = vec![0xFF, 0xD8, 0xFF, 0xE0, 0, 16];
    j.extend(b"JFIF\0");
    j.extend([1, 1, 0, 0, 1, 0, 1, 0, 0]);
    j.extend([0xFF, 0xDB, 0, 4, 9, 9]);
    j.extend([0xFF, 0xDA, 0, 3, 7]);
    j.extend([1, 2, 3, 0xFF, 0x00, 4]);
    j.extend([0xFF, 0xD9]);
    let out = run_builtin(&j, "jpeg");
    let names: Vec<&str> = out["nodes"].as_array().unwrap().iter().map(|n| n["name"].as_str().unwrap()).collect();
    assert_eq!(names, vec!["SOI", "APP0", "DQT", "SOS", "scanData", "EOI"]);
    assert_eq!(value(&out, "APP0/identifier"), "\"JFIF\"");
    assert_eq!(node(&out, "scanData")["size"], 6);

    let mut z = vec![0x1F, 0x8B, 8, 8, 0, 0, 0, 0, 0, 3];
    z.extend(b"a.txt\0");
    z.extend([0x4B, 0x4C, 0x04, 0x00]);
    z.extend(le32(0x1234));
    z.extend(le32(1));
    let out = run_builtin(&z, "gzip");
    assert_eq!(value(&out, "fileName"), "\"a.txt\"");
    assert_eq!(node(&out, "compressedData")["size"], 4);
    assert_eq!(value(&out, "uncompressedSize"), "1 (0x1)");
}

#[test]
fn template_tar_mbr_wasm_class() {
    let mut t = vec![0u8; 512];
    t[..5].copy_from_slice(b"a.txt");
    t[124..136].copy_from_slice(b"00000000003\0");
    t[156] = b'0';
    t[257..263].copy_from_slice(b"ustar\0");
    t.extend(b"abc");
    t.extend(vec![0u8; 509]);
    t.extend(vec![0u8; 1024]);
    let out = run_builtin(&t, "tar");
    assert_eq!(value(&out, "entries/[0]/header/name"), "\"a.txt\"");
    assert_eq!(value(&out, "entries/[0]/data"), "61 62 63");
    assert_eq!(node(&out, "entries/[0]/padding")["size"], 509);
    assert_eq!(node(&out, "endOfArchive")["size"], 1024);

    let mut m = vec![0u8; 512];
    m[446] = 0x80;
    m[446 + 4] = 0x07;
    m[446 + 8..446 + 12].copy_from_slice(&le32(2048));
    m[510] = 0x55;
    m[511] = 0xAA;
    let out = run_builtin(&m, "mbr");
    assert_eq!(value(&out, "partitions/[0]/type"), "NTFS_EXFAT (7)");
    assert_eq!(value(&out, "partitions/[0]/firstLba"), "2048 (0x800)");
    assert_eq!(value(&out, "bootSignature"), "43605 (0xAA55)");

    let mut w = b"\0asm".to_vec();
    w.extend(le32(1));
    w.extend([1, 4, 1, 0x60, 0, 0]);
    w.extend([0, 6, 4, b'n', b'a', b'm', b'e', 9]);
    let out = run_builtin(&w, "wasm");
    assert_eq!(value(&out, "sections/[0]/id"), "type (1)");
    assert_eq!(value(&out, "sections/[1]/name"), "\"name\"");
    assert_eq!(node(&out, "sections/[1]/content")["size"], 1);

    let mut c = vec![0xCA, 0xFE, 0xBA, 0xBE, 0, 0, 0, 61, 0, 3];
    c.extend([1, 0, 1, b'A']);
    c.extend([7, 0, 1]);
    c.extend([0, 0x21, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    let out = run_builtin(&c, "class");
    assert_eq!(value(&out, "majorVersion"), "61 (0x3D)");
    assert_eq!(value(&out, "constantPool/#1/text"), "\"A\"");
    assert_eq!(value(&out, "constantPool/#2/tag"), "Class (7)");
    assert_eq!(value(&out, "attributesCount"), "0 (0x0)");
}

#[test]
fn template_others_run_clean() {
    // ICO with one image.
    let mut i = Vec::new();
    i.extend(le16(0));
    i.extend(le16(1));
    i.extend(le16(1));
    i.extend([16, 16, 0, 0]);
    i.extend(le16(1));
    i.extend(le16(32));
    i.extend(le32(4));
    i.extend(le32(22));
    i.extend([1, 2, 3, 4]);
    let out = run_builtin(&i, "ico");
    assert_eq!(value(&out, "image"), "01 02 03 04");
    // SQLite header + first page header.
    let mut s = b"SQLite format 3\0".to_vec();
    s.extend(4096u16.to_be_bytes());
    s.extend(vec![0u8; 82]);
    s.extend([13, 0, 0, 0, 1, 0x0F, 0xF0, 0, 0x0F, 0xF0]);
    let out = run_builtin(&s, "sqlite");
    assert_eq!(value(&out, "header/pageSize"), "4096 (0x1000)");
    assert_eq!(value(&out, "firstPage/cellCount"), "1 (0x1)");
    // Mach-O 64 with one segment, no sections.
    let mut m = Vec::new();
    m.extend(le32(0xFEED_FACF));
    m.extend(le32(0x0100_0007));
    m.extend(le32(3));
    m.extend(le32(2));
    m.extend(le32(1));
    m.extend(le32(72));
    m.extend(le32(0));
    m.extend(le32(0));
    m.extend(le32(0x19));
    m.extend(le32(72));
    m.extend(b"__TEXT\0\0\0\0\0\0\0\0\0\0");
    m.extend(vec![0u8; 48]);
    let out = run_builtin(&m, "macho");
    assert_eq!(value(&out, "commands/[0]/cmd"), "SEGMENT_64 (25)");
    assert_eq!(value(&out, "commands/[0]/segname"), "\"__TEXT\"");
    // MP3 with an ID3v2.3 tag of one text frame.
    let mut a = b"ID3".to_vec();
    a.extend([3, 0, 0, 0, 0, 0, 15]);
    a.extend(b"TIT2");
    a.extend(be32(5));
    a.extend([0, 0, 0]);
    a.extend(b"Song");
    a.extend([0xFF, 0xFB, 0x90, 0x00]);
    let out = run_builtin(&a, "mp3");
    assert_eq!(value(&out, "TIT2/text"), "\"Song\"");
    assert_eq!(node(&out, "audioData")["size"], 4);
    // bin
    let out = run_builtin(&[1, 2, 3], "bin");
    assert_eq!(value(&out, "data"), "01 02 03");
    assert!(run(&vec![0u8], &json!({ "template": "nope" }), &mut no_progress()).is_err());
}

#[test]
fn real_windows_executable_if_present() {
    let path = std::path::Path::new("C:/Windows/System32/notepad.exe");
    let Ok(data) = std::fs::read(path) else { return };
    let out = run(&data, &json!({ "template": "pe" }), &mut no_progress()).unwrap();
    assert_eq!(out["errors"], json!([]), "{}", out["errors"]);
    assert_eq!(value(&out, "signature"), "\"PE\"");
    assert!(node(&out, "sectionHeaders")["children"].as_array().unwrap().len() >= 3);
}

// ── functions, multi-dimensional arrays, parent, static sizeof

#[test]
fn user_functions_with_locals_and_recursion() {
    let src = "fn pad(n, a) { let r = n % a; if (r == 0) return n; return n + a - r; }\n\
fn fact(n) { if (n <= 1) { return 1; } return n * fact(n - 1); }\n\
fn deep(n) { return n == 0 ? 0 : 1 + deep(n - 1); }\n\
fn twoBytes() { u8 first; u8 second; }\n\
u8 len;\nu8 body[pad(len, 4)];\ntwoBytes();\n\
let f = fact(5);\nlet d = deep(60);\nu8 tail[f / 120 + d - 60];";
    let out = run_src(&[3, 9, 9, 9, 9, 0xAA, 0xBB, 0xCC], src);
    assert_eq!(out["errors"], json!([]), "{}", out["errors"]);
    assert_eq!(node(&out, "body")["size"], 4);
    assert_eq!(value(&out, "first"), "170 (0xAA)");
    assert_eq!(value(&out, "second"), "187 (0xBB)");
    assert_eq!(node(&out, "tail")["size"], 1);
    // Endless recursion stops with a clear error; a wrong argument count too.
    let out = run_src(&[0], "fn loop(n) { return loop(n + 1); }\nlet x = loop(0);");
    assert!(out["errors"][0]["message"].as_str().unwrap().contains("deeper than 64"), "{}", out["errors"]);
    let out = run_src(&[0], "fn f(a, b) { return a + b; }\nlet x = f(1);");
    assert!(out["errors"][0]["message"].as_str().unwrap().contains("takes 2 argument"), "{}", out["errors"]);
}

#[test]
fn multi_dimensional_arrays() {
    let data: Vec<u8> = (0u8..24).collect();
    let src = "struct Cell { u8 a; u8 b; };\nu8 grid[3][4];\nCell cells[2][3];\nlet x = grid[2][1];\nlet y = cells[1][2].b;\nu8 check[x - 9 + y - 23];";
    let out = run_src(&data, src);
    assert_eq!(out["errors"], json!([]), "{}", out["errors"]);
    assert_eq!(node(&out, "grid")["type"], "u8[3][4]");
    assert_eq!(node(&out, "grid")["children"].as_array().unwrap().len(), 3);
    assert_eq!(node(&out, "grid/[1]")["type"], "u8[4]");
    assert_eq!(value(&out, "grid/[1]"), "04 05 06 07");
    assert_eq!(node(&out, "cells")["type"], "Cell[2][3]");
    assert_eq!(node(&out, "cells/[1]/[2]")["offset"], 22);
    assert_eq!(value(&out, "cells/[1]/[2]/b"), "23 (0x17)");
    assert_eq!(node(&out, "check")["size"], 0);
}

#[test]
fn parent_field_access() {
    let src = "u8 kind;\nstruct Inner { u8 data[parent.size]; u8 k = 0; };\nstruct Outer { u8 size; Inner inner; u8 top[parent.kind]; };\nOuter outer;";
    let src = src.replace("u8 k = 0;", "");
    let out = run_src(&[2, 3, 0xA1, 0xA2, 0xA3, 0xB1, 0xB2], &src);
    assert_eq!(out["errors"], json!([]), "{}", out["errors"]);
    assert_eq!(value(&out, "outer/inner/data"), "A1 A2 A3");
    assert_eq!(value(&out, "outer/top"), "B1 B2");
    let src = "struct A { u8 n; struct_b b; };\nstruct struct_b { struct_c c; };\nstruct struct_c { u8 v[parent.parent.n]; let s = sizeof(parent); };\nA a;";
    let out = run_src(&[2, 7, 8], src);
    assert_eq!(out["errors"], json!([]), "{}", out["errors"]);
    assert_eq!(value(&out, "a/b/c/v"), "07 08");
    let out = run_src(&[1], "u8 x;\nstruct S { u8 y[parent.missing]; };\nS s;");
    assert!(out["errors"][0]["message"].as_str().unwrap().contains("no field 'missing'"), "{}", out["errors"]);
}

#[test]
fn static_sizeof_of_structs() {
    let src = "bitfield F { a : 3; b : 6; };\nenum K : u16 { X };\nstruct P { u8 x; be u16 y; F f; K k; u32 m[2][3]; char tag[4]; };\n\
union U { u8 a; u64 b; P p; };\nstruct V { u8 n; u8 d[n]; };\nstruct W { u8 n; if (n) { u8 more; } };\n\
let p = sizeof(P);\nlet u = sizeof(U);\nu8 out[p + u - 70];";
    let out = run_src(&[0u8; 8], src);
    assert_eq!(out["errors"], json!([]), "{}", out["errors"]);
    // P = 1 + 2 + 2 + 2 + 24 + 4 = 35; U = max(1, 8, 35) = 35.
    assert_eq!(node(&out, "out")["size"], 0);
    let out = run_src(&[0], "struct V { u8 n; u8 d[n]; };\nlet v = sizeof(V);");
    let msg = out["errors"][0]["message"].as_str().unwrap();
    assert!(msg.contains("no fixed size") && msg.contains("'d'"), "{msg}");
    let out = run_src(&[0], "struct W { u8 n; if (n) { u8 more; } };\nlet w = sizeof(W);");
    assert!(out["errors"][0]["message"].as_str().unwrap().contains("conditions"), "{}", out["errors"]);
}
