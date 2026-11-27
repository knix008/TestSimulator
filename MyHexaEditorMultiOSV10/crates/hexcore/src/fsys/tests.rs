//! Small but real volumes built in code: FAT12 (directory, long name, deleted file), FAT32, NTFS (resident,
//! non-resident with a sparse run, deleted record, sub-directory), ext4 / ext2 (block map, extent tree, deleted
//! entry in slack, sub-directory), and MBR / GPT disks around them.
use super::*;
use crate::util::unb64;
use serde_json::json;

fn put16(b: &mut [u8], o: usize, v: u16) {
    b[o..o + 2].copy_from_slice(&v.to_le_bytes());
}
fn put32(b: &mut [u8], o: usize, v: u32) {
    b[o..o + 4].copy_from_slice(&v.to_le_bytes());
}
fn put64(b: &mut [u8], o: usize, v: u64) {
    b[o..o + 8].copy_from_slice(&v.to_le_bytes());
}
fn names(v: &Value) -> Vec<String> {
    v["entries"].as_array().unwrap().iter().map(|e| e["name"].as_str().unwrap().to_string()).collect()
}
fn find<'a>(v: &'a Value, name: &str) -> &'a Value {
    v["entries"].as_array().unwrap().iter().find(|e| e["name"] == name).unwrap_or_else(|| panic!("no {name} in {:?}", names(v)))
}
fn read_file(img: &[u8], offset: u64, id: &str) -> Vec<u8> {
    let r = read(&img.to_vec(), &json!({ "offset": offset, "id": id })).unwrap();
    unb64(r["data"].as_str().unwrap()).unwrap()
}

// ───────── FAT12

fn fat12_set(fat: &mut [u8], c: usize, v: u16) {
    let off = c + c / 2;
    if c & 1 == 1 {
        fat[off] = (fat[off] & 0x0F) | ((v << 4) as u8 & 0xF0);
        fat[off + 1] = (v >> 4) as u8;
    } else {
        fat[off] = v as u8;
        fat[off + 1] = (fat[off + 1] & 0xF0) | ((v >> 8) as u8 & 0x0F);
    }
}

fn short(b: &mut [u8], o: usize, name: &[u8; 11], attr: u8, cluster: u16, size: u32) {
    b[o..o + 11].copy_from_slice(name);
    b[o + 11] = attr;
    put16(b, o + 22, 0x6000); // 12:00:00
    put16(b, o + 24, ((2024 - 1980) << 9) | (3 << 5) | 15); // 2024-03-15
    put16(b, o + 16, ((2024 - 1980) << 9) | (3 << 5) | 15);
    put16(b, o + 26, cluster);
    put32(b, o + 28, size);
}

fn lfn(b: &mut [u8], o: usize, ord: u8, chars: &[u16], sum: u8) {
    let mut c = [0xFFFFu16; 13];
    for (i, &u) in chars.iter().enumerate() {
        c[i] = u;
    }
    if chars.len() < 13 {
        c[chars.len()] = 0;
    }
    b[o] = ord;
    for i in 0..5 {
        put16(b, o + 1 + i * 2, c[i]);
    }
    b[o + 11] = 0x0F;
    b[o + 13] = sum;
    for i in 0..6 {
        put16(b, o + 14 + i * 2, c[5 + i]);
    }
    for i in 0..2 {
        put16(b, o + 28 + i * 2, c[11 + i]);
    }
}

fn checksum(name: &[u8; 11]) -> u8 {
    name.iter().fold(0u8, |s, &c| ((s & 1) << 7).wrapping_add(s >> 1).wrapping_add(c))
}

/// A 1.44 MB FAT12 floppy: label, DOCS/ (INNER.BIN), HELLO.TXT (2 clusters), a long name, a deleted file.
fn fat12() -> Vec<u8> {
    let mut img = vec![0u8; 2880 * 512];
    let b = &mut img[..512];
    b[0..3].copy_from_slice(&[0xEB, 0x3C, 0x90]);
    b[3..11].copy_from_slice(b"MSDOS5.0");
    put16(b, 11, 512);
    b[13] = 1;
    put16(b, 14, 1);
    b[16] = 2;
    put16(b, 17, 224);
    put16(b, 19, 2880);
    b[21] = 0xF0;
    put16(b, 22, 9);
    put32(b, 39, 0x1234_ABCD);
    b[43..54].copy_from_slice(b"TESTVOL    ");
    b[510] = 0x55;
    b[511] = 0xAA;
    // FATs
    let mut fat = vec![0u8; 9 * 512];
    fat12_set(&mut fat, 0, 0xFF0);
    fat12_set(&mut fat, 1, 0xFFF);
    fat12_set(&mut fat, 2, 0xFFF); // DOCS
    fat12_set(&mut fat, 3, 4); // HELLO.TXT
    fat12_set(&mut fat, 4, 0xFFF);
    fat12_set(&mut fat, 5, 0xFFF); // long name
    fat12_set(&mut fat, 7, 0xFFF); // INNER.BIN
    img[512..512 + fat.len()].copy_from_slice(&fat);
    img[512 + fat.len()..512 + 2 * fat.len()].copy_from_slice(&fat);
    let root = 19 * 512;
    let data = 33 * 512;
    let cl = |c: usize| data + (c - 2) * 512;
    short(&mut img, root, b"TESTVOL    ", 0x08, 0, 0);
    short(&mut img, root + 32, b"DOCS       ", 0x10, 2, 0);
    short(&mut img, root + 64, b"HELLO   TXT", 0x20, 3, 600);
    let long: Vec<u16> = "Long File Name.txt".encode_utf16().collect();
    let sname = *b"LONGFI~1TXT";
    let sum = checksum(&sname);
    lfn(&mut img, root + 96, 0x42, &long[13..], sum);
    lfn(&mut img, root + 128, 0x01, &long[..13], sum);
    short(&mut img, root + 160, &sname, 0x20, 5, 10);
    short(&mut img, root + 192, b"\xE5ELETED TXT", 0x20, 6, 20);
    // data
    let hello: Vec<u8> = (0..600).map(|i| b'A' + (i % 26) as u8).collect();
    img[cl(3)..cl(3) + 512].copy_from_slice(&hello[..512]);
    img[cl(4)..cl(4) + 88].copy_from_slice(&hello[512..]);
    img[cl(5)..cl(5) + 10].copy_from_slice(b"0123456789");
    img[cl(6)..cl(6) + 20].copy_from_slice(b"deleted data!!!!....");
    short(&mut img, cl(2), b".          ", 0x10, 2, 0);
    short(&mut img, cl(2) + 32, b"..         ", 0x10, 0, 0);
    short(&mut img, cl(2) + 64, b"INNER   BIN", 0x20, 7, 5);
    img[cl(7)..cl(7) + 5].copy_from_slice(b"inner");
    img
}

#[test]
fn fat12_volume() {
    let img = fat12();
    let src = img.clone();
    assert_eq!(detect(&src, 0), Fs::Fat(12));
    let parts = partitions(&src, &json!({})).unwrap();
    assert_eq!(parts["scheme"], "none");
    assert_eq!(parts["partitions"][0]["fs"], "fat12");
    assert_eq!(parts["partitions"][0]["label"], "TESTVOL");
    let root = list(&src, &json!({})).unwrap();
    assert_eq!(root["path"], "/");
    assert_eq!(names(&root), vec!["DOCS", "HELLO.TXT", "Long File Name.txt", "_ELETED.TXT"]);
    let hello = find(&root, "HELLO.TXT");
    assert_eq!(hello["size"], 600);
    assert_eq!(hello["modified"], "2024-03-15 12:00:00");
    assert_eq!(hello["extents"], json!([[33 * 512 + 512, 1024]]));
    let data = read_file(&img, 0, hello["id"].as_str().unwrap());
    assert_eq!(data.len(), 600);
    assert_eq!(&data[..3], b"ABC");
    assert_eq!(read_file(&img, 0, find(&root, "Long File Name.txt")["id"].as_str().unwrap()), b"0123456789");
    let gone = find(&root, "_ELETED.TXT");
    assert_eq!(gone["deleted"], true);
    assert_eq!(read_file(&img, 0, gone["id"].as_str().unwrap()), b"deleted data!!!!....");
    let docs = find(&root, "DOCS");
    assert_eq!(docs["dir"], true);
    let sub = list(&src, &json!({ "dir": docs["id"] })).unwrap();
    assert_eq!(names(&sub), vec!["INNER.BIN"]);
    assert_eq!(sub["parent"], "root");
    assert_eq!(sub["path"], "/DOCS");
    assert_eq!(read_file(&img, 0, find(&sub, "INNER.BIN")["id"].as_str().unwrap()), b"inner");
    let live = list(&src, &json!({ "deleted": false })).unwrap();
    assert_eq!(live["entries"].as_array().unwrap().len(), 3);
    let i = info(&src, &json!({})).unwrap();
    assert_eq!(i["fs"], "fat12");
    assert_eq!(i["serial"], "1234-ABCD");
    assert_eq!(i["totalSize"], 2880 * 512);
}

/// FAT32 needs at least 65525 clusters: 34 MB with 512-byte clusters.
#[test]
fn fat32_volume() {
    let clusters = 65_600u64;
    let fatsz = ((clusters + 2) * 4).div_ceil(512);
    let reserved = 32u64;
    let total = reserved + 2 * fatsz + clusters;
    let mut img = vec![0u8; (total * 512) as usize];
    {
        let b = &mut img[..512];
        b[3..11].copy_from_slice(b"MSWIN4.1");
        put16(b, 11, 512);
        b[13] = 1;
        put16(b, 14, reserved as u16);
        b[16] = 2;
        b[21] = 0xF8;
        put32(b, 32, total as u32);
        put32(b, 36, fatsz as u32);
        put32(b, 44, 2);
        put32(b, 67, 0xCAFE_F00D);
        b[71..82].copy_from_slice(b"BIGFAT32   ");
        b[510] = 0x55;
        b[511] = 0xAA;
    }
    let fat = (reserved * 512) as usize;
    put32(&mut img, fat, 0x0FFF_FFF8);
    put32(&mut img, fat + 4, 0x0FFF_FFFF);
    put32(&mut img, fat + 8, 0x0FFF_FFFF); // root
    put32(&mut img, fat + 12, 5); // file: 3 → 5 → 6
    put32(&mut img, fat + 20, 6);
    put32(&mut img, fat + 24, 0x0FFF_FFFF);
    let data = ((reserved + 2 * fatsz) * 512) as usize;
    let cl = |c: usize| data + (c - 2) * 512;
    short(&mut img, cl(2), b"FRAG    BIN", 0x20, 3, 1300);
    for (k, c) in [3usize, 5, 6].iter().enumerate() {
        let start = cl(*c);
        img[start..start + 512].fill(b'a' + k as u8);
    }
    let src = img.clone();
    assert_eq!(detect(&src, 0), Fs::Fat(32));
    let root = list(&src, &json!({})).unwrap();
    let f = find(&root, "FRAG.BIN");
    assert_eq!(f["extents"], json!([[cl(3), 512], [cl(5), 1024]]));
    let d = read_file(&img, 0, f["id"].as_str().unwrap());
    assert_eq!(d.len(), 1300);
    assert_eq!((d[0], d[600], d[1299]), (b'a', b'b', b'c'));
    assert_eq!(info(&src, &json!({})).unwrap()["label"], "BIGFAT32");
}

// ───────── NTFS

const REC: usize = 1024;

fn attr_resident(kind: u32, content: &[u8]) -> Vec<u8> {
    let len = (24 + content.len()).div_ceil(8) * 8;
    let mut a = vec![0u8; len];
    put32(&mut a, 0, kind);
    put32(&mut a, 4, len as u32);
    put32(&mut a, 16, content.len() as u32);
    put16(&mut a, 20, 24);
    a[24..24 + content.len()].copy_from_slice(content);
    a
}

fn attr_nonresident(kind: u32, runs: &[u8], clusters: u64, real: u64) -> Vec<u8> {
    let len = (64 + runs.len()).div_ceil(8) * 8;
    let mut a = vec![0u8; len];
    put32(&mut a, 0, kind);
    put32(&mut a, 4, len as u32);
    a[8] = 1;
    put16(&mut a, 10, 64);
    put64(&mut a, 24, clusters - 1);
    put16(&mut a, 32, 64);
    put64(&mut a, 40, clusters * 4096);
    put64(&mut a, 48, real);
    put64(&mut a, 56, real);
    a[64..64 + runs.len()].copy_from_slice(runs);
    a
}

fn file_name(parent: u64, name: &str, size: u64) -> Vec<u8> {
    let units: Vec<u16> = name.encode_utf16().collect();
    let mut c = vec![0u8; 66 + units.len() * 2];
    put64(&mut c, 0, parent | (1 << 48));
    put64(&mut c, 8, 133_000_000_000_000_000);
    put64(&mut c, 16, 133_000_000_000_000_000);
    put64(&mut c, 48, size);
    c[64] = units.len() as u8;
    c[65] = 1;
    for (i, u) in units.iter().enumerate() {
        put16(&mut c, 66 + i * 2, *u);
    }
    c
}

fn record(n: u32, flags: u16, attrs: &[Vec<u8>]) -> Vec<u8> {
    let mut r = vec![0u8; REC];
    r[0..4].copy_from_slice(b"FILE");
    put16(&mut r, 4, 48);
    put16(&mut r, 6, 3);
    put16(&mut r, 16, 1);
    put16(&mut r, 18, 1);
    put16(&mut r, 20, 56);
    put16(&mut r, 22, flags);
    put32(&mut r, 28, REC as u32);
    put32(&mut r, 44, n);
    let mut pos = 56;
    let mut si = vec![0u8; 48];
    put64(&mut si, 0, 133_500_000_000_000_000);
    put64(&mut si, 8, 133_500_000_000_000_000);
    for a in std::iter::once(&attr_resident(0x10, &si)).chain(attrs.iter()) {
        r[pos..pos + a.len()].copy_from_slice(a);
        pos += a.len();
    }
    put32(&mut r, pos, 0xFFFF_FFFF);
    put32(&mut r, 24, (pos + 8) as u32);
    // fixups: the sector ends hold the update sequence number, their bytes go to the array
    let usn = [0x07u8, 0x00];
    r[48..50].copy_from_slice(&usn);
    for k in 1..3 {
        let end = k * 512 - 2;
        let (a, b) = (r[end], r[end + 1]);
        r[48 + 2 * k] = a;
        r[49 + 2 * k] = b;
        r[end] = usn[0];
        r[end + 1] = usn[1];
    }
    r
}

/// 64 clusters of 4 KiB; $MFT of 16 records at cluster 4.
fn ntfs() -> Vec<u8> {
    let cs = 4096usize;
    let mut img = vec![0u8; 64 * cs];
    {
        let b = &mut img[..512];
        b[3..11].copy_from_slice(b"NTFS    ");
        put16(b, 11, 512);
        b[13] = 8;
        put64(b, 40, 64 * 8);
        put64(b, 48, 4);
        put64(b, 56, 8);
        b[64] = 0xF6;
        b[68] = 1;
        put64(b, 72, 0x1122_3344_5566_7788);
        b[510] = 0x55;
        b[511] = 0xAA;
    }
    let mft = 4 * cs;
    let mut put = |n: usize, rec: Vec<u8>| img[mft + n * REC..mft + (n + 1) * REC].copy_from_slice(&rec);
    put(0, record(0, 1, &[attr_resident(0x30, &file_name(5, "$MFT", 16 * 1024)), attr_nonresident(0x80, &[0x11, 4, 4, 0], 4, 16 * 1024)]));
    put(3, record(3, 1, &[attr_resident(0x30, &file_name(5, "$Volume", 0)), attr_resident(0x60, &"NTFSVOL".encode_utf16().flat_map(|u| u.to_le_bytes()).collect::<Vec<_>>())]));
    put(5, record(5, 3, &[attr_resident(0x30, &file_name(5, ".", 0))]));
    put(11, record(11, 1, &[attr_resident(0x30, &file_name(15, "inside.txt", 1)), attr_resident(0x80, b"x")]));
    put(12, record(12, 1, &[attr_resident(0x30, &file_name(5, "small.txt", 10)), attr_resident(0x80, b"hello ntfs")]));
    // big.bin: clusters 20–21, one sparse cluster, cluster 30; 3.5 clusters long
    put(13, record(13, 1, &[attr_resident(0x30, &file_name(5, "big.bin", 14336)), attr_nonresident(0x80, &[0x11, 2, 20, 0x01, 1, 0x11, 1, 10, 0], 4, 14336)]));
    put(14, record(14, 0, &[attr_resident(0x30, &file_name(5, "gone.txt", 3)), attr_resident(0x80, b"bye")]));
    put(15, record(15, 3, &[attr_resident(0x30, &file_name(5, "sub", 0))]));
    img[20 * cs..22 * cs].fill(0xAB);
    img[30 * cs..31 * cs].fill(0xCD);
    img
}

#[test]
fn ntfs_volume() {
    let img = ntfs();
    let src = img.clone();
    assert_eq!(detect(&src, 0), Fs::Ntfs);
    let root = list(&src, &json!({})).unwrap();
    assert_eq!(root["fs"], "ntfs");
    let n = names(&root);
    for want in ["$MFT", "$Volume", "small.txt", "big.bin", "gone.txt", "sub"] {
        assert!(n.contains(&want.to_string()), "{want} in {n:?}");
    }
    assert_eq!(find(&root, "sub")["dir"], true);
    assert_eq!(find(&root, "gone.txt")["deleted"], true);
    assert_eq!(find(&root, "small.txt")["resident"], true);
    assert_eq!(read_file(&img, 0, "12"), b"hello ntfs");
    assert_eq!(read_file(&img, 0, "14"), b"bye");
    let big = find(&root, "big.bin");
    assert_eq!(big["extents"], json!([[20 * 4096, 8192], [-1, 4096], [30 * 4096, 4096]]));
    let d = read_file(&img, 0, "13");
    assert_eq!(d.len(), 14336);
    assert!(d[..8192].iter().all(|&b| b == 0xAB));
    assert!(d[8192..12288].iter().all(|&b| b == 0));
    assert!(d[12288..].iter().all(|&b| b == 0xCD));
    let sub = list(&src, &json!({ "dir": "15" })).unwrap();
    assert_eq!(names(&sub), vec!["inside.txt"]);
    assert_eq!((sub["parent"].as_str(), sub["path"].as_str()), (Some("5"), Some("/sub")));
    let live = list(&src, &json!({ "deleted": false })).unwrap();
    assert!(!names(&live).contains(&"gone.txt".to_string()));
    let i = info(&src, &json!({})).unwrap();
    assert_eq!(i["label"], "NTFSVOL");
    assert_eq!(i["clusterSize"], 4096);
    let f = file(&src, &json!({ "id": "13" })).unwrap();
    assert_eq!(f["size"], 14336);
}

// ───────── ext

fn dirent(b: &mut [u8], o: usize, inode: u32, rec: u16, name: &str, kind: u8) {
    put32(b, o, inode);
    put16(b, o + 4, rec);
    b[o + 6] = name.len() as u8;
    b[o + 7] = kind;
    b[o + 8..o + 8 + name.len()].copy_from_slice(name.as_bytes());
}

fn inode(img: &mut [u8], n: usize, mode: u16, size: u32, links: u16, flags: u32, block: &[u8]) {
    let o = 5 * 1024 + (n - 1) * 128;
    put16(img, o, mode);
    put32(img, o + 4, size);
    put32(img, o + 12, 1_700_000_000);
    put32(img, o + 16, 1_700_000_000);
    put16(img, o + 26, links);
    put32(img, o + 32, flags);
    img[o + 40..o + 40 + block.len()].copy_from_slice(block);
}

fn blocks(list: &[u32]) -> Vec<u8> {
    list.iter().flat_map(|b| b.to_le_bytes()).collect()
}

/// 64 blocks of 1 KiB, 32 inodes; incompat = filetype (+ extents when `ext4`).
fn ext(ext4: bool) -> Vec<u8> {
    let bs = 1024usize;
    let mut img = vec![0u8; 64 * bs];
    {
        let sb = &mut img[1024..2048];
        put32(sb, 0, 32);
        put32(sb, 4, 64);
        put32(sb, 20, 1);
        put32(sb, 32, 8192);
        put32(sb, 40, 32);
        put16(sb, 56, 0xEF53);
        put32(sb, 76, 1);
        put16(sb, 88, 128);
        put32(sb, 96, if ext4 { 0x42 } else { 0x2 });
        sb[104..120].copy_from_slice(&[0x11; 16]);
        sb[120..126].copy_from_slice(b"EXTVOL");
    }
    put32(&mut img, 2 * bs + 8, 5); // inode table at block 5
    inode(&mut img, 2, 0x41ED, 1024, 3, 0, &blocks(&[9]));
    inode(&mut img, 12, 0x81A4, 1500, 1, 0, &blocks(&[10, 11]));
    // ext.bin: an extent header and one extent (blocks 12–13)
    let mut ex = vec![0u8; 24];
    put16(&mut ex, 0, 0xF30A);
    put16(&mut ex, 2, 1);
    put16(&mut ex, 4, 4);
    put32(&mut ex, 12, 0);
    put16(&mut ex, 16, 2);
    put32(&mut ex, 20, 12);
    inode(&mut img, 13, 0x81A4, 2000, 1, 0x80000, &ex);
    inode(&mut img, 14, 0x81A4, 3, 0, 0, &blocks(&[14]));
    put32(&mut img, 5 * 1024 + 13 * 128 + 20, 1_700_000_100); // dtime of 14
    inode(&mut img, 15, 0x41ED, 1024, 2, 0, &blocks(&[15]));
    inode(&mut img, 16, 0x81A4, 4, 1, 0, &blocks(&[16]));
    let d = 9 * bs;
    dirent(&mut img, d, 2, 12, ".", 2);
    dirent(&mut img, d + 12, 2, 12, "..", 2);
    dirent(&mut img, d + 24, 12, 20, "plain.txt", 1);
    dirent(&mut img, d + 44, 13, 32, "ext.bin", 1);
    dirent(&mut img, d + 60, 14, 16, "old.txt", 1); // in the slack of ext.bin
    dirent(&mut img, d + 76, 15, (bs - 76) as u16, "subdir", 2);
    let s = 15 * bs;
    dirent(&mut img, s, 15, 12, ".", 2);
    dirent(&mut img, s + 12, 2, 12, "..", 2);
    dirent(&mut img, s + 24, 16, (bs - 24) as u16, "deep.txt", 1);
    for (i, b) in img[10 * bs..12 * bs].iter_mut().enumerate() {
        *b = (i % 251) as u8;
    }
    img[12 * bs..14 * bs].fill(0x5A);
    img[14 * bs..14 * bs + 3].copy_from_slice(b"old");
    img[16 * bs..16 * bs + 4].copy_from_slice(b"deep");
    img
}

#[test]
fn ext4_volume() {
    let img = ext(true);
    let src = img.clone();
    assert_eq!(detect(&src, 0), Fs::Ext(4));
    let root = list(&src, &json!({})).unwrap();
    assert_eq!(root["fs"], "ext4");
    assert_eq!(names(&root), vec!["plain.txt", "ext.bin", "subdir", "old.txt"]);
    let plain = find(&root, "plain.txt");
    assert_eq!(plain["size"], 1500);
    assert_eq!(plain["extents"], json!([[10 * 1024, 2048]]));
    assert_eq!(plain["modified"], "2023-11-14 22:13:20");
    let d = read_file(&img, 0, "12");
    assert_eq!(d.len(), 1500);
    assert_eq!((d[0], d[251], d[1499]), (0, 0, (1499 % 251) as u8));
    assert_eq!(find(&root, "ext.bin")["extents"], json!([[12 * 1024, 2048]]));
    assert!(read_file(&img, 0, "13").iter().all(|&b| b == 0x5A));
    let old = find(&root, "old.txt");
    assert_eq!(old["deleted"], true);
    assert_eq!(read_file(&img, 0, "14"), b"old");
    let sub = list(&src, &json!({ "dir": "15" })).unwrap();
    assert_eq!(names(&sub), vec!["deep.txt"]);
    assert_eq!((sub["parent"].as_str(), sub["path"].as_str()), (Some("2"), Some("/subdir")));
    assert_eq!(read_file(&img, 0, "16"), b"deep");
    let i = info(&src, &json!({})).unwrap();
    assert_eq!(i["label"], "EXTVOL");
    assert_eq!(i["totalSize"], 64 * 1024);
}

#[test]
fn ext2_volume() {
    let img = ext(false);
    let src = img.clone();
    assert_eq!(detect(&src, 0), Fs::Ext(2));
    let root = list(&src, &json!({ "deleted": false })).unwrap();
    assert_eq!(names(&root), vec!["plain.txt", "ext.bin", "subdir"]);
    assert_eq!(read_file(&img, 0, "12").len(), 1500);
}

// ───────── partition tables

#[test]
fn mbr_disk_with_extended() {
    let fat = fat12();
    let extfs = ext(true);
    let p2 = 64 + 2880;
    let ext_start = 3200u32;
    let mut disk = vec![0u8; ((ext_start + 100) * 512) as usize];
    disk[64 * 512..64 * 512 + fat.len()].copy_from_slice(&fat);
    disk[p2 * 512..p2 * 512 + extfs.len()].copy_from_slice(&extfs);
    let mut entry = |i: usize, boot: u8, kind: u8, start: u32, count: u32| {
        let o = 446 + i * 16;
        disk[o] = boot;
        disk[o + 4] = kind;
        put32(&mut disk, o + 8, start);
        put32(&mut disk, o + 12, count);
    };
    entry(0, 0x80, 0x01, 64, 2880);
    entry(1, 0, 0x83, p2 as u32, 128);
    entry(2, 0, 0x05, ext_start, 100);
    disk[510] = 0x55;
    disk[511] = 0xAA;
    let ebr = (ext_start * 512) as usize;
    disk[ebr + 446 + 4] = 0x83;
    put32(&mut disk, ebr + 446 + 8, 1);
    put32(&mut disk, ebr + 446 + 12, 10);
    disk[ebr + 510] = 0x55;
    disk[ebr + 511] = 0xAA;
    let src = disk.clone();
    let r = partitions(&src, &json!({})).unwrap();
    assert_eq!(r["scheme"], "mbr");
    let parts = r["partitions"].as_array().unwrap();
    assert_eq!(parts.len(), 3);
    assert_eq!((parts[0]["fs"].as_str(), parts[0]["label"].as_str(), parts[0]["bootable"].as_bool()), (Some("fat12"), Some("TESTVOL"), Some(true)));
    assert_eq!((parts[1]["fs"].as_str(), parts[1]["offset"].as_u64()), (Some("ext4"), Some((p2 * 512) as u64)));
    assert_eq!(parts[2]["offset"], (ext_start as u64 + 1) * 512);
    assert_eq!(parts[2]["typeName"], "Linux");
    // The files of a partition: extents absolute in the disk.
    let root = list(&src, &json!({ "offset": 64 * 512 })).unwrap();
    assert_eq!(find(&root, "HELLO.TXT")["extents"], json!([[64 * 512 + 33 * 512 + 512, 1024]]));
    let id = find(&root, "HELLO.TXT")["id"].as_str().unwrap().to_string();
    assert_eq!(read_file(&disk, 64 * 512, &id).len(), 600);
    assert_eq!(read_file(&disk, (p2 * 512) as u64, "16"), b"deep");
}

#[test]
fn gpt_disk() {
    let fat = fat12();
    let mut disk = vec![0u8; (64 + 2880) * 512];
    disk[64 * 512..].copy_from_slice(&fat);
    disk[446 + 4] = 0xEE;
    put32(&mut disk, 446 + 8, 1);
    put32(&mut disk, 446 + 12, (64 + 2880 - 1) as u32);
    disk[510] = 0x55;
    disk[511] = 0xAA;
    let h = 512;
    disk[h..h + 8].copy_from_slice(b"EFI PART");
    put64(&mut disk, h + 72, 2);
    put32(&mut disk, h + 80, 128);
    put32(&mut disk, h + 84, 128);
    let e = 1024;
    disk[e..e + 16].copy_from_slice(&[0xA2, 0xA0, 0xD0, 0xEB, 0xE5, 0xB9, 0x33, 0x44, 0x87, 0xC0, 0x68, 0xB6, 0xB7, 0x26, 0x99, 0xC7]);
    disk[e + 16] = 1;
    put64(&mut disk, e + 32, 64);
    put64(&mut disk, e + 40, 64 + 2880 - 1);
    for (i, u) in "Data".encode_utf16().enumerate() {
        put16(&mut disk, e + 56 + i * 2, u);
    }
    let src = disk.clone();
    let r = partitions(&src, &json!({})).unwrap();
    assert_eq!(r["scheme"], "gpt");
    let p = &r["partitions"][0];
    assert_eq!(p["type"], "EBD0A0A2-B9E5-4433-87C0-68B6B72699C7");
    assert_eq!(p["typeName"], "Microsoft basic data");
    assert_eq!((p["label"].as_str(), p["fs"].as_str(), p["offset"].as_u64()), (Some("Data"), Some("fat12"), Some(64 * 512)));
}

#[test]
fn garbage_is_an_error_not_a_panic() {
    let mut x = 0x1234_5678u32;
    let junk: Vec<u8> = (0..200_000).map(|_| { x ^= x << 13; x ^= x >> 17; x ^= x << 5; x as u8 }).collect();
    assert!(list(&junk, &json!({})).is_err());
    assert_eq!(partitions(&junk, &json!({})).unwrap()["scheme"], "none");
    // Broken volumes: a valid-looking boot sector over random data must not panic.
    for (mut img, off) in [(fat12(), 19 * 512), (ntfs(), 4 * 4096 + 5 * 1024), (ext(true), 9 * 1024)] {
        for (i, b) in img[off..off + 2048].iter_mut().enumerate() {
            *b = junk[i];
        }
        let src = img.clone();
        let _ = list(&src, &json!({}));
        let _ = list(&src, &json!({ "dir": "c:9999" }));
        let _ = read(&src, &json!({ "id": "13" }));
    }
}
