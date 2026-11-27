use super::*;
use crate::util::{no_progress, unb64};

fn script(data: &[u8], source: &str) -> Value {
    script_args(data, json!({ "source": source }))
}

fn script_args(data: &[u8], args: Value) -> Value {
    let bytes = data.to_vec();
    run_script(&bytes, &args, &mut no_progress()).unwrap()
}

fn ok(out: &Value) {
    assert_eq!(out["errors"], json!([]), "{}", out["errors"]);
    assert_eq!(out["completed"], json!(true));
}

/// Applies the edits in order, as the app does.
fn apply(data: &[u8], out: &Value) -> Vec<u8> {
    let mut d = data.to_vec();
    for e in out["edits"].as_array().unwrap() {
        let off = e["offset"].as_u64().unwrap() as usize;
        let bytes = unb64(e["data"].as_str().unwrap()).unwrap();
        let len = e["length"].as_u64().unwrap() as usize;
        match e["op"].as_str().unwrap() {
            "write" => {
                assert_eq!(bytes.len(), len);
                d[off..off + len].copy_from_slice(&bytes);
            }
            "insert" => {
                assert_eq!(bytes.len(), len);
                d.splice(off..off, bytes);
            }
            "delete" => {
                d.drain(off..off + len);
            }
            other => panic!("op {other}"),
        }
    }
    assert_eq!(d.len() as u64, out["size"].as_u64().unwrap());
    d
}

fn error_at(out: &Value) -> (u64, u64, String) {
    let e = out["errors"].as_array().unwrap().iter().find(|e| e.get("warning").is_none()).unwrap_or_else(|| panic!("no error: {out}"));
    (e["line"].as_u64().unwrap(), e["col"].as_u64().unwrap(), e["message"].as_str().unwrap().to_string())
}

#[test]
fn xor_every_byte() {
    let data: Vec<u8> = (0..=255u8).cycle().take(5000).collect();
    let out = script(&data, "for (let i = 0; i < FileSize(); i++) { WriteU8(i, ReadU8(i) ^ 0x5A); }");
    ok(&out);
    // One forward run of writes: one edit.
    assert_eq!(out["edits"].as_array().unwrap().len(), 1);
    let want: Vec<u8> = data.iter().map(|b| b ^ 0x5A).collect();
    assert_eq!(apply(&data, &out), want);
}

#[test]
fn xor_selection_backwards() {
    let data = vec![0x11u8; 64];
    let out = script_args(
        &data,
        json!({ "source": "let s = Selection(); let i = s.end; while (i > s.start) { i -= 1; WriteU8(i, ReadU8(i) ^ 0xFF); }", "selStart": 8, "selLength": 16 }),
    );
    ok(&out);
    let got = apply(&data, &out);
    for (i, b) in got.iter().enumerate() {
        assert_eq!(*b, if (8..24).contains(&i) { 0xEE } else { 0x11 }, "byte {i}");
    }
}

#[test]
fn writes_are_seen_by_later_reads() {
    let data = [0u8; 16];
    let out = script(
        &data,
        r#"
        WriteU32(0, 0x11223344);
        Assert(ReadU32(0) == 0x11223344, "u32");
        Assert(ReadU8(0) == 0x44, "little endian by default");
        WriteBytes(8, "DE AD BE EF");
        Assert(find(0, "BE EF") == 10, "find sees writes");
        Assert(ReadString(8, 2) != "", "text");
        WriteString(12, "Hi");
        Assert(ReadString(12, 2) == "Hi", "string");
        Assert(Hash("crc32", 8, 4) == "7c9ca35a", "hash over the changed bytes");
        Assert(Checksum("crc32", 8, 4) == 0x7C9CA35A, "checksum as a number");
        return ReadU16BE(8);
        "#,
    );
    ok(&out);
    assert_eq!(out["returned"], json!(0xDEAD));
    let got = apply(&data, &out);
    assert_eq!(&got[..4], &[0x44, 0x33, 0x22, 0x11]);
    assert_eq!(&got[8..14], &[0xDE, 0xAD, 0xBE, 0xEF, b'H', b'i']);
    assert_eq!(crate::hash::digest_bytes("crc32", &[0xDE, 0xAD, 0xBE, 0xEF]).unwrap(), "7c9ca35a");
}

#[test]
fn insert_and_delete_offsets() {
    let data: Vec<u8> = (0..10u8).collect();
    let out = script(
        &data,
        r#"
        InsertBytes(2, 3, 0xAA);          // 0 1 AA AA AA 2 3 …
        Assert(FileSize() == 13, "grew");
        Assert(ReadU8(5) == 2, "shifted");
        WriteU8(3, 0xBB);                 // inside the inserted bytes
        DeleteBytes(0, 1);                // 1 AA BB AA 2 3 …
        DeleteBytes(5, 2);                // 1 AA BB AA 2 5 6 7 8 9
        InsertBytes(FileSize(), 2);       // at the end, zeros
        WriteU8(FileSize() - 1, 0x77);
        Assert(ReadU8(4) == 2 && ReadU8(5) == 5, "after deletes");
        "#,
    );
    ok(&out);
    assert_eq!(apply(&data, &out), vec![1, 0xAA, 0xBB, 0xAA, 2, 5, 6, 7, 8, 9, 0, 0x77]);
    assert_eq!(out["size"], json!(12));
    let ops: Vec<&str> = out["edits"].as_array().unwrap().iter().map(|e| e["op"].as_str().unwrap()).collect();
    // Writes into just-inserted bytes join the insert.
    assert_eq!(ops, ["insert", "delete", "delete", "insert"]);
}

#[test]
fn many_random_edits_match_a_model() {
    // An overlay stress: pseudo-random writes, inserts and deletes, compared with a plain Vec.
    let data: Vec<u8> = (0..300u32).map(|i| (i * 7) as u8).collect();
    let out = script(
        &data,
        r#"
        let x = 12345; let n = 0;
        while (n < 400) {
            x = (x * 1103515245 + 12345) % 2147483648;
            let op = x % 3; let at = (x >> 8) % (FileSize() + 1);
            if (op == 0 && at < FileSize()) { WriteU8(at, (x >> 3) & 0xFF); }
            if (op == 1) { InsertBytes(at, (x >> 4) % 5 + 1, n & 0xFF); }
            if (op == 2 && at + 3 <= FileSize()) { DeleteBytes(at, 3); }
            n++;
        }
        let sum = 0;
        for (let i = 0; i < FileSize(); i++) { sum += ReadU8(i); }
        return sum;
        "#,
    );
    ok(&out);
    let got = apply(&data, &out);
    let sum: u64 = got.iter().map(|b| *b as u64).sum();
    assert_eq!(out["returned"], json!(sum), "reads through the overlay agree with the applied edits");
}

#[test]
fn printf_formatting() {
    let out = script(
        b"",
        r#"
        Printf("%d|%5d|%-5d|%05d|%+d|%x|%X|%08X|%#x|%o|%u\n", 42, 42, 42, -42, 7, 255, 255, 0xBEEF, 255, 8, -1);
        Printf("%s|%10s|%-6s|%.3s|%c|%%|%.2f|%8.3f|%e|%g|%g\n", "abc", "right", "left", "truncate", 'Z', 3.14159, -2.5, 1234.5, 0.0001, 1e20);
        Print("a", 1, 2.5);
        "#,
    );
    ok(&out);
    assert_eq!(
        out["output"],
        json!("42|   42|42   |-0042|+7|ff|FF|0000BEEF|0xff|10|18446744073709551615\nabc|     right|left  |tru|Z|%|3.14|  -2.500|1.234500e+03|0.0001|1e+20\na 1 2.5\n")
    );
    let bad = script(b"", "Printf(\"%d %d\", 1);");
    assert!(error_at(&bad).2.contains("no value for %d"), "{bad}");
}

#[test]
fn endianness() {
    let data = [0u8; 16];
    let out = script(
        &data,
        r#"
        WriteU16(0, 0x1234);
        BigEndian();
        WriteU16(2, 0x1234);
        WriteU32(4, 0xA1B2C3D4);
        Assert(ReadU32(4) == 0xA1B2C3D4, "big read");
        LittleEndian();
        WriteU16BE(8, 0xCAFE);
        WriteFloat(12, 1.0);
        "#,
    );
    ok(&out);
    let got = apply(&data, &out);
    assert_eq!(&got[..10], &[0x34, 0x12, 0x12, 0x34, 0xA1, 0xB2, 0xC3, 0xD4, 0xCA, 0xFE]);
    assert_eq!(&got[12..16], &1.0f32.to_le_bytes());
    let pragma = script(&data, "#pragma endian big\nWriteU32(0, 1); WriteDouble(8, 2.0);");
    ok(&pragma);
    let got = apply(&data, &pragma);
    assert_eq!(&got[..4], &[0, 0, 0, 1]);
    assert_eq!(&got[8..16], &2.0f64.to_be_bytes());
}

#[test]
fn errors_have_line_and_col() {
    let data = [0u8; 4];
    let out = script(&data, "let a = 1;\nWriteU8(1, 9);\n  WriteU32(2, 5);\n");
    let (line, col, msg) = error_at(&out);
    assert_eq!((line, col), (3, 3), "{msg}");
    assert!(msg.contains("past the end"), "{msg}");
    assert_eq!(out["completed"], json!(false));
    // The edit before the error is still listed.
    assert_eq!(out["edits"].as_array().unwrap().len(), 1);
    let parse = script(&data, "let a = ;");
    assert_eq!(error_at(&parse).0, 1);
    let assert = script(&data, "\n\nAssert(ReadU8(0) == 1, \"first byte\");");
    let (line, _, msg) = error_at(&assert);
    assert_eq!(line, 3);
    assert_eq!(msg, "Assert failed: first byte");
    let unknown = script(&data, "Nope(1);");
    assert!(error_at(&unknown).2.contains("unknown function 'Nope'"));
}

#[test]
fn limits() {
    let out = script(b"", "while (1) { }");
    assert!(error_at(&out).2.contains("1000000 loop iterations"), "{out}");
    let big = script(b"", "InsertBytes(0, 0x4000000, 1); InsertBytes(0, 1, 1);");
    assert!(error_at(&big).2.contains("64 MiB"), "{big}");
    // Cancelling.
    let bytes = vec![0u8; 8];
    let mut calls = 0;
    let mut cancel = |_: u64, _: u64| {
        calls += 1;
        calls < 3
    };
    let r = run_script(&bytes, &json!({ "source": "let i = 0; while (i < 900000) { i++; }" }), &mut cancel);
    assert_eq!(r.unwrap_err(), "cancelled");
}

#[test]
fn exit_find_all_and_cursor() {
    let data = b"abcXYabcXYabc";
    let out = script_args(
        data,
        json!({ "source": r#"
            let n = FindAll("abc");
            for (let i = 0; i < n; i++) { WriteString(FindAt(i), "ABC"); }
            Assert(FindAll("41 42 43") == 3, "hex");
            Assert(FindAt(9) == -1, "past the hits");
            Printf("%d at %d\n", n, Cursor());
            Exit(n * 10);
            WriteU8(0, 0);
        "#, "cursor": 5 }),
    );
    ok(&out);
    assert_eq!(out["returned"], json!(30));
    assert_eq!(out["output"], json!("3 at 5\n"));
    assert_eq!(apply(data, &out), b"ABCXYABCXYABC".to_vec());
}
