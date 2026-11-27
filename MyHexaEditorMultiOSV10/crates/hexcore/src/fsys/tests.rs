//! Small but real volumes built in code: FAT12 (directory, long name, deleted file), FAT32, NTFS (resident,
//! non-resident with a sparse run, deleted record, sub-directory), ext4 / ext2 (block map, extent tree, deleted
//! entry in slack, sub-directory), and MBR / GPT disks around them. Then NTFS attribute lists (resident and non-resident,
//! the $MFT's own), LZNT1 chunks and compressed units, EFS-encrypted data, alternate data streams, ext4 inline directories
//! (i_block + system.data) and htree directories, and noise over all of them.
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

// ───────── NTFS: attribute lists, compression, encryption, alternate data streams

fn utf16le(s: &str) -> Vec<u8> {
    s.encode_utf16().flat_map(|u| u.to_le_bytes()).collect()
}

/// A resident attribute with a name and flags.
fn attr_res(kind: u32, name: &str, flags: u16, content: &[u8]) -> Vec<u8> {
    let n = utf16le(name);
    let at = (24 + n.len()).div_ceil(8) * 8;
    let len = (at + content.len()).div_ceil(8) * 8;
    let mut a = vec![0u8; len];
    put32(&mut a, 0, kind);
    put32(&mut a, 4, len as u32);
    a[9] = (n.len() / 2) as u8;
    put16(&mut a, 10, 24);
    put16(&mut a, 12, flags);
    put32(&mut a, 16, content.len() as u32);
    put16(&mut a, 20, at as u16);
    a[24..24 + n.len()].copy_from_slice(&n);
    a[at..at + content.len()].copy_from_slice(content);
    a
}

/// A non-resident attribute segment: VCNs `vcn.0..=vcn.1`, a name, flags (0x0001 compressed: 72-byte header).
fn attr_nr(kind: u32, name: &str, flags: u16, vcn: (u64, u64), runs: &[u8], alloc: u64, real: u64) -> Vec<u8> {
    let n = utf16le(name);
    let hdr = if flags & 1 != 0 { 72 } else { 64 };
    let at = (hdr + n.len()).div_ceil(8) * 8;
    let len = (at + runs.len()).div_ceil(8) * 8;
    let mut a = vec![0u8; len];
    put32(&mut a, 0, kind);
    put32(&mut a, 4, len as u32);
    a[8] = 1;
    a[9] = (n.len() / 2) as u8;
    put16(&mut a, 10, hdr as u16);
    put16(&mut a, 12, flags);
    put64(&mut a, 16, vcn.0);
    put64(&mut a, 24, vcn.1);
    put16(&mut a, 32, at as u16);
    put16(&mut a, 34, if flags & 1 != 0 { 4 } else { 0 });
    put64(&mut a, 40, alloc);
    put64(&mut a, 48, real);
    put64(&mut a, 56, real);
    a[hdr..hdr + n.len()].copy_from_slice(&n);
    a[at..at + runs.len()].copy_from_slice(runs);
    a
}

/// An $ATTRIBUTE_LIST entry (unnamed attribute).
fn list_entry(kind: u32, vcn: u64, rec: u64) -> Vec<u8> {
    let mut e = vec![0u8; 32];
    put32(&mut e, 0, kind);
    put16(&mut e, 4, 32);
    e[7] = 26;
    put64(&mut e, 8, vcn);
    put64(&mut e, 16, rec | (1 << 48));
    e
}

fn extension(n: u32, base: u64, attrs: &[Vec<u8>]) -> Vec<u8> {
    let mut r = record(n, 1, attrs);
    put64(&mut r, 32, base | (1 << 48));
    r
}

/// LZNT1 test chunks. A: "abc" then one back-reference (offset 3, length 4093; 4 offset / 12 length bits) = 4096 bytes.
fn chunk_abc() -> Vec<u8> {
    let mut c = vec![0x05, 0xB0, 0x08, b'a', b'b', b'c'];
    c.extend_from_slice(&(((3u16 - 1) << 12) | (4093 - 3)).to_le_bytes());
    c
}
/// B: an uncompressed chunk (header 0x3FFF) of 4096 bytes.
fn chunk_raw() -> (Vec<u8>, Vec<u8>) {
    let raw: Vec<u8> = (0..4096).map(|i| (i * 7 % 256) as u8).collect();
    let mut c = vec![0xFF, 0x3F];
    c.extend_from_slice(&raw);
    (c, raw)
}
/// C: 20 literals, then a back-reference at position 20 (5 offset / 11 length bits): offset 20, length 10.
fn chunk_split() -> Vec<u8> {
    let lit = b"0123456789abcdefghij";
    let mut body = vec![0x00];
    body.extend_from_slice(&lit[..8]);
    body.push(0x00);
    body.extend_from_slice(&lit[8..16]);
    body.push(0x10);
    body.extend_from_slice(&lit[16..20]);
    body.extend_from_slice(&(((20u16 - 1) << 11) | (10 - 3)).to_le_bytes());
    let mut c = (0xB000u16 | (body.len() as u16 - 1)).to_le_bytes().to_vec();
    c.extend_from_slice(&body);
    c
}

#[test]
fn lznt1_chunks() {
    let (raw_chunk, raw) = chunk_raw();
    let mut input = chunk_abc();
    input.extend_from_slice(&raw_chunk);
    input.extend_from_slice(&chunk_split());
    input.extend_from_slice(&[0, 0]);
    let out = lznt1(&input, 1 << 16);
    assert_eq!(out.len(), 4096 + 4096 + 30);
    assert!(out[..4096].chunks(3).all(|c| c == &b"abc"[..c.len()]));
    assert_eq!(&out[4096..8192], &raw[..]);
    assert_eq!(&out[8192..], b"0123456789abcdefghij0123456789");
    // Just the split chunk, and the cap.
    assert_eq!(lznt1(&chunk_split(), 1 << 16), b"0123456789abcdefghij0123456789");
    assert_eq!(lznt1(&chunk_abc(), 10), b"abcabcabca");
    // A short compressed chunk followed by another stands for 4096 bytes.
    let mut two = chunk_split();
    two.extend_from_slice(&chunk_split());
    let out = lznt1(&two, 1 << 16);
    assert_eq!(out.len(), 4096 + 30);
    assert!(out[30..4096].iter().all(|&b| b == 0));
    assert_eq!(&out[4096..], b"0123456789abcdefghij0123456789");
    // A back-reference before the start of the chunk ends it instead of panicking.
    assert_eq!(lznt1(&[0x02, 0xB0, 0x01, 0x00, 0x10], 4096), b"");
}

const CS: usize = 4096;

/// 128 clusters; the $MFT is 32 records (clusters 4–11). Records 16–23 hold the new cases.
fn ntfs_more() -> Vec<u8> {
    let mut img = ntfs();
    img.resize(128 * CS, 0);
    put64(&mut img, 40, 128 * 8);
    let mft = 4 * CS;
    let put = |img: &mut Vec<u8>, n: usize, rec: Vec<u8>| img[mft + n * REC..mft + (n + 1) * REC].copy_from_slice(&rec);
    put(&mut img, 0, record(0, 1, &[attr_resident(0x30, &file_name(5, "$MFT", 32 * 1024)), attr_nonresident(0x80, &[0x11, 8, 4, 0], 8, 32 * 1024)]));
    // frag.bin: base 16 has only a resident attribute list; its name and both $DATA segments are in 17 and 18.
    let size = 3 * 4096 + 100;
    let mut alist = list_entry(0x10, 0, 16);
    alist.extend(list_entry(0x30, 0, 17));
    alist.extend(list_entry(0x80, 0, 17));
    alist.extend(list_entry(0x80, 2, 18));
    put(&mut img, 16, record(16, 1, &[attr_resident(0x20, &alist)]));
    put(&mut img, 18, extension(18, 16, &[attr_nr(0x80, "", 0, (2, 3), &[0x11, 2, 50, 0], 0, 0)]));
    put(&mut img, 17, extension(17, 16, &[attr_resident(0x30, &file_name(5, "frag.bin", size)), attr_nr(0x80, "", 0, (0, 1), &[0x11, 2, 40, 0], 4 * 4096, size)]));
    img[40 * CS..42 * CS].fill(0x11);
    img[50 * CS..52 * CS].fill(0x22);
    // nrlist.txt: base 19 with its name and a non-resident attribute list (cluster 45); the $DATA is in 20.
    let alist = [list_entry(0x30, 0, 19), list_entry(0x80, 0, 20)].concat();
    put(&mut img, 19, record(19, 1, &[attr_resident(0x30, &file_name(5, "nrlist.txt", 20)), attr_nonresident(0x20, &[0x11, 1, 45, 0], 1, alist.len() as u64)]));
    img[45 * CS..45 * CS + alist.len()].copy_from_slice(&alist);
    put(&mut img, 20, extension(20, 19, &[attr_resident(0x80, b"via a list in a run!")]));
    // packed.txt: LZNT1, 4 units of 16 clusters: compressed (clusters 56–57 + 14 sparse), raw (64–79), sparse,
    // compressed (58 + 15 sparse); 3 units + 5000 bytes long.
    let size = 3 * 65536 + 5000;
    let runs = [0x11, 2, 56, 0x01, 14, 0x11, 16, 8, 0x01, 16, 0x11, 1, 0xFA, 0x01, 15, 0];
    put(&mut img, 21, record(21, 1, &[attr_resident(0x30, &file_name(5, "packed.txt", size)), attr_nr(0x80, "", 1, (0, 63), &runs, 64 * 4096, size)]));
    let (raw_chunk, _) = chunk_raw();
    let u0 = [chunk_abc(), raw_chunk, vec![0, 0]].concat();
    img[56 * CS..56 * CS + u0.len()].copy_from_slice(&u0);
    for (i, b) in img[64 * CS..80 * CS].iter_mut().enumerate() {
        *b = (i % 253) as u8;
    }
    let u3 = [chunk_split(), vec![0, 0]].concat();
    img[58 * CS..58 * CS + u3.len()].copy_from_slice(&u3);
    // secret.bin: EFS-encrypted $DATA (cluster 60) and the $EFS stream.
    put(&mut img, 22, record(22, 1, &[attr_resident(0x30, &file_name(5, "secret.bin", 100)), attr_nr(0x80, "", 0x4000, (0, 0), &[0x11, 1, 60, 0], 4096, 100), attr_res(0x100, "$EFS", 0, &[1, 2, 3, 4])]));
    img[60 * CS..61 * CS].fill(0xEE);
    // notes.txt: an unnamed $DATA and two alternate data streams (resident, non-resident at cluster 61).
    put(&mut img, 23, record(23, 1, &[attr_resident(0x30, &file_name(5, "notes.txt", 4)), attr_resident(0x80, b"main"), attr_res(0x80, "Zone.Identifier", 0, b"[ZoneTransfer]"), attr_nr(0x80, "big", 0, (0, 0), &[0x11, 1, 61, 0], 4096, 10)]));
    img[61 * CS..61 * CS + 10].copy_from_slice(b"0123456789");
    img
}

#[test]
fn ntfs_attribute_list() {
    let img = ntfs_more();
    let src = img.clone();
    let root = list(&src, &json!({})).unwrap();
    // The name lives only in extension record 17: the base record is listed.
    let f = find(&root, "frag.bin");
    assert_eq!(f["id"], "16");
    assert_eq!(f["size"], 3 * 4096 + 100);
    assert_eq!(f["extents"], json!([[40 * 4096, 8192], [50 * 4096, 8192]]));
    let d = read_file(&img, 0, "16");
    assert_eq!(d.len(), 3 * 4096 + 100);
    assert!(d[..8192].iter().all(|&b| b == 0x11) && d[8192..].iter().all(|&b| b == 0x22));
    assert_eq!(file(&src, &json!({ "id": "16" })).unwrap()["name"], "frag.bin");
    // Extension records are not entries of their own.
    assert!(!root["entries"].as_array().unwrap().iter().any(|e| e["id"] == "17" || e["id"] == "18" || e["id"] == "20"));
    // A non-resident attribute list.
    assert_eq!(find(&root, "nrlist.txt")["resident"], true);
    assert_eq!(read_file(&img, 0, "19"), b"via a list in a run!");
    // The old cases still hold on the bigger MFT.
    assert_eq!(read_file(&img, 0, "12"), b"hello ntfs");
    assert_eq!(info(&src, &json!({})).unwrap()["details"][4], json!(["MFT records", "32"]));
}

#[test]
fn ntfs_mft_through_attribute_list() {
    // $MFT record 0 keeps its second run (records 16–31, clusters 8–11) in extension record 1.
    let mut img = ntfs_more();
    let mft = 4 * CS;
    let alist = [list_entry(0x30, 0, 0), list_entry(0x80, 0, 0), list_entry(0x80, 4, 1)].concat();
    let r0 = record(0, 1, &[attr_resident(0x30, &file_name(5, "$MFT", 32 * 1024)), attr_resident(0x20, &alist), attr_nr(0x80, "", 0, (0, 3), &[0x11, 4, 4, 0], 8 * 4096, 32 * 1024)]);
    img[mft..mft + REC].copy_from_slice(&r0);
    let r1 = extension(1, 0, &[attr_nr(0x80, "", 0, (4, 7), &[0x11, 4, 8, 0], 0, 0)]);
    img[mft + REC..mft + 2 * REC].copy_from_slice(&r1);
    let src = img.clone();
    let root = list(&src, &json!({})).unwrap();
    assert_eq!(find(&root, "notes.txt")["id"], "23");
    assert_eq!(read_file(&img, 0, "16").len(), 3 * 4096 + 100);
}

#[test]
fn ntfs_compressed() {
    let img = ntfs_more();
    let src = img.clone();
    let root = list(&src, &json!({})).unwrap();
    let p = find(&root, "packed.txt");
    assert_eq!(p["compressed"], true);
    assert_eq!(p["encrypted"], false);
    assert_eq!(find(&root, "small.txt")["compressed"], false);
    assert_eq!(p["extents"], json!([[56 * 4096, 8192], [-1, 14 * 4096], [64 * 4096, 65536], [-1, 16 * 4096], [58 * 4096, 4096], [-1, 15 * 4096]]));
    assert_eq!(file(&src, &json!({ "id": "21" })).unwrap()["compressed"], true);
    let d = read_file(&img, 0, "21");
    assert_eq!(d.len(), 3 * 65536 + 5000);
    // Unit 0: the "abc" chunk, the uncompressed chunk, zeros.
    assert!(d[..4096].chunks(3).all(|c| c == &b"abc"[..c.len()]));
    assert_eq!(&d[4096..8192], &chunk_raw().1[..]);
    assert!(d[8192..65536].iter().all(|&b| b == 0));
    // Unit 1 is stored raw (its runs fill it), unit 2 is sparse.
    assert!(d[65536..131072].iter().enumerate().all(|(i, &b)| b == (i % 253) as u8));
    assert!(d[131072..196608].iter().all(|&b| b == 0));
    // Unit 3: compressed, cut at the file size.
    assert_eq!(&d[196608..196608 + 30], b"0123456789abcdefghij0123456789");
    assert!(d[196608 + 30..].iter().all(|&b| b == 0));
}

#[test]
fn ntfs_encrypted() {
    let img = ntfs_more();
    let src = img.clone();
    let root = list(&src, &json!({})).unwrap();
    let s = find(&root, "secret.bin");
    assert_eq!((s["encrypted"].as_bool(), s["compressed"].as_bool()), (Some(true), Some(false)));
    assert_eq!(find(&root, "small.txt")["encrypted"], false);
    assert_eq!(file(&src, &json!({ "id": "22" })).unwrap()["encrypted"], true);
    // Raw (encrypted) bytes.
    assert_eq!(read_file(&img, 0, "22"), vec![0xEE; 100]);
}

#[test]
fn ntfs_alternate_data_streams() {
    let img = ntfs_more();
    let src = img.clone();
    let root = list(&src, &json!({})).unwrap();
    let n = names(&root);
    let at = n.iter().position(|x| x == "notes.txt").unwrap();
    assert_eq!(&n[at..at + 3], &["notes.txt", "notes.txt:big", "notes.txt:Zone.Identifier"]);
    assert_eq!(find(&root, "notes.txt")["id"], "23");
    let zone = find(&root, "notes.txt:Zone.Identifier");
    assert_eq!((zone["id"].as_str(), zone["size"].as_u64(), zone["resident"].as_bool(), zone["dir"].as_bool()), (Some("23:Zone.Identifier"), Some(14), Some(true), Some(false)));
    let big = find(&root, "notes.txt:big");
    assert_eq!(big["extents"], json!([[61 * 4096, 4096]]));
    assert_eq!(read_file(&img, 0, "23"), b"main");
    assert_eq!(read_file(&img, 0, "23:Zone.Identifier"), b"[ZoneTransfer]");
    assert_eq!(read_file(&img, 0, "23:big"), b"0123456789");
    let f = file(&src, &json!({ "id": "23:big" })).unwrap();
    assert_eq!((f["name"].as_str(), f["size"].as_u64()), (Some("notes.txt:big"), Some(10)));
    assert!(file(&src, &json!({ "id": "23:nope" })).is_err());
    assert!(file(&src, &json!({ "id": "x:big" })).is_err());
}

// ───────── ext: inline directories, htree directories

/// 64 blocks of 1 KiB, 32 inodes of 256 bytes (table at blocks 5–12); inline data.
fn ext_inline() -> Vec<u8> {
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
        put16(sb, 88, 256);
        put32(sb, 96, 0x8042);
    }
    put32(&mut img, 2 * bs + 8, 5);
    let ino = |img: &mut [u8], n: usize, mode: u16, size: u32, flags: u32, block: &[u8]| -> usize {
        let o = 5 * 1024 + (n - 1) * 256;
        put16(img, o, mode);
        put32(img, o + 4, size);
        put32(img, o + 16, 1_700_000_000);
        put16(img, o + 26, 1);
        put32(img, o + 32, flags);
        img[o + 40..o + 40 + block.len()].copy_from_slice(block);
        put16(img, o + 128, 32);
        o
    };
    // system.data in the inode body: magic at 160, the entry at 164, its value at 164 + 40.
    let xattr = |img: &mut [u8], o: usize, value: &[u8]| {
        put32(img, o + 160, 0xEA02_0000);
        let e = o + 164;
        img[e] = 4;
        img[e + 1] = 7;
        put16(img, e + 2, 40);
        put32(img, e + 8, value.len() as u32);
        img[e + 16..e + 20].copy_from_slice(b"data");
        img[e + 40..e + 40 + value.len()].copy_from_slice(value);
    };
    ino(&mut img, 2, 0x41ED, 1024, 0, &blocks(&[20]));
    let r = 20 * bs;
    dirent(&mut img, r, 2, 12, ".", 2);
    dirent(&mut img, r + 12, 2, 12, "..", 2);
    dirent(&mut img, r + 24, 12, (bs - 24) as u16, "inl", 2);
    // inl/: parent 2, then a.txt and b.txt in i_block, c-in-xattr.txt and d.txt in system.data.
    let mut ib = vec![0u8; 60];
    put32(&mut ib, 0, 2);
    dirent(&mut ib, 4, 13, 16, "a.txt", 1);
    dirent(&mut ib, 20, 14, 40, "b.txt", 1);
    let mut xv = vec![0u8; 40];
    dirent(&mut xv, 0, 15, 24, "c-in-xattr.txt", 1);
    dirent(&mut xv, 24, 16, 16, "d.txt", 1);
    let o = ino(&mut img, 12, 0x41ED, 60, 0x1000_0000, &ib);
    xattr(&mut img, o, &xv);
    // a.txt: 80 bytes inline, 60 in i_block and 20 in system.data.
    let text: Vec<u8> = (0..80).map(|i| b'a' + (i % 26) as u8).collect();
    let o = ino(&mut img, 13, 0x81A4, 80, 0x1000_0000, &text[..60]);
    xattr(&mut img, o, &text[60..]);
    ino(&mut img, 14, 0x81A4, 4, 0, &blocks(&[21]));
    img[21 * bs..21 * bs + 4].copy_from_slice(b"bbbb");
    ino(&mut img, 15, 0x81A4, 1, 0x1000_0000, b"c");
    ino(&mut img, 16, 0x81A4, 1, 0x1000_0000, b"d");
    img
}

#[test]
fn ext4_inline_directory() {
    let img = ext_inline();
    let src = img.clone();
    let root = list(&src, &json!({})).unwrap();
    assert_eq!(names(&root), vec!["inl"]);
    assert_eq!(find(&root, "inl")["dir"], true);
    let d = list(&src, &json!({ "dir": "12" })).unwrap();
    assert_eq!(names(&d), vec!["a.txt", "b.txt", "c-in-xattr.txt", "d.txt"]);
    assert_eq!((d["parent"].as_str(), d["path"].as_str()), (Some("2"), Some("/inl")));
    assert!(d["entries"].as_array().unwrap().iter().all(|e| e["deleted"] == false));
    let a = read_file(&img, 0, "13");
    assert_eq!(a.len(), 80);
    assert_eq!(&a[58..62], b"ghij");
    assert_eq!(read_file(&img, 0, "14"), b"bbbb");
    assert_eq!(read_file(&img, 0, "16"), b"d");
}

/// An htree directory (inode 17, blocks 20–23 of `ext(false)`): dx_root, a dx_node whose entries look like a dirent
/// (hash 12, then a block whose third byte is 3, then the hash "abc"), and two leaf blocks.
#[test]
fn ext_htree_directory() {
    let bs = 1024usize;
    let mut img = ext(false);
    inode(&mut img, 17, 0x41ED, 4096, 2, 0x1000, &blocks(&[20, 21, 22, 23]));
    let b0 = 20 * bs;
    dirent(&mut img, b0, 17, 12, ".", 2);
    dirent(&mut img, b0 + 12, 2, (bs - 12) as u16, "..", 2);
    img[b0 + 28] = 1; // hash version
    img[b0 + 29] = 8; // info length
    img[b0 + 30] = 1; // one level of index nodes
    put16(&mut img, b0 + 32, 124);
    put16(&mut img, b0 + 34, 1);
    put32(&mut img, b0 + 36, 1);
    let b1 = 21 * bs;
    put16(&mut img, b1 + 4, bs as u16); // fake empty entry over the node
    put16(&mut img, b1 + 8, 127);
    put16(&mut img, b1 + 10, 3);
    put32(&mut img, b1 + 12, 2);
    put32(&mut img, b1 + 16, 12);
    put32(&mut img, b1 + 20, 0x0003_0002);
    img[b1 + 24..b1 + 28].copy_from_slice(b"abc\0");
    put32(&mut img, b1 + 28, 3);
    let b2 = 22 * bs;
    dirent(&mut img, b2, 12, 16, "alpha", 1);
    dirent(&mut img, b2 + 16, 13, (bs - 16) as u16, "beta", 1);
    dirent(&mut img, 23 * bs, 16, bs as u16, "gamma", 1);
    let src = img.clone();
    let d = list(&src, &json!({ "dir": "17", "deleted": true })).unwrap();
    assert_eq!(names(&d), vec!["alpha", "beta", "gamma"]);
    assert_eq!(d["parent"], "2");
    assert_eq!(read_file(&img, 0, "16"), b"deep");
}

#[test]
fn new_paths_survive_garbage() {
    let mut x = 0x9E37_79B9u32;
    let junk: Vec<u8> = (0..300_000).map(|_| { x ^= x << 13; x ^= x >> 17; x ^= x << 5; x as u8 }).collect();
    // LZNT1 on noise, in pieces of every alignment.
    for k in 0..64 {
        let _ = lznt1(&junk[k * 997..k * 997 + 9000], 65536);
    }
    // Noise over the new NTFS records (attribute lists, compressed and named streams) and over their data clusters.
    for (off, len) in [(4 * CS + 16 * REC, 8 * REC), (45 * CS, 4096), (56 * CS, 3 * CS), (4 * CS, REC)] {
        let mut img = ntfs_more();
        img[off..off + len].copy_from_slice(&junk[..len]);
        let src = img.clone();
        let _ = list(&src, &json!({}));
        for id in ["16", "19", "21", "22", "23", "23:big", "23:Zone.Identifier"] {
            let _ = read(&src, &json!({ "id": id }));
        }
    }
    // Noise over the inline inode bodies and the htree blocks.
    let mut img = ext_inline();
    img[5 * 1024 + 11 * 256..5 * 1024 + 13 * 256].copy_from_slice(&junk[..512]);
    let src = img.clone();
    let _ = list(&src, &json!({ "dir": "12" }));
    let _ = read(&src, &json!({ "id": "13" }));
    let mut img = ext(false);
    inode(&mut img, 17, 0x41ED, 4096, 2, 0x1000, &blocks(&[20, 21, 22, 23]));
    img[20 * 1024..24 * 1024].copy_from_slice(&junk[..4096]);
    let src = img.clone();
    let _ = list(&src, &json!({ "dir": "17" }));
}

/// `attr_nr` with an initialized size below the data size.
fn with_init(mut a: Vec<u8>, init: u64) -> Vec<u8> {
    put64(&mut a, 56, init);
    a
}

#[test]
fn ntfs_initialized_size() {
    let mut img = ntfs_more();
    let mft = 4 * CS;
    // partial.bin: one cluster of 0x77, 4096 bytes long, 1000 of them initialized.
    let r = record(24, 1, &[attr_resident(0x30, &file_name(5, "partial.bin", 4096)), with_init(attr_nr(0x80, "", 0, (0, 0), &[0x11, 1, 62, 0], 4096, 4096), 1000)]);
    img[mft + 24 * REC..mft + 25 * REC].copy_from_slice(&r);
    img[62 * CS..63 * CS].fill(0x77);
    // packed2.txt: the runs of packed.txt, initialized up to 5000 bytes.
    let size = 3 * 65536 + 5000;
    let runs = [0x11, 2, 56, 0x01, 14, 0x11, 16, 8, 0x01, 16, 0x11, 1, 0xFA, 0x01, 15, 0];
    let r = record(25, 1, &[attr_resident(0x30, &file_name(5, "packed2.txt", size)), with_init(attr_nr(0x80, "", 1, (0, 63), &runs, 64 * 4096, size), 5000)]);
    img[mft + 25 * REC..mft + 26 * REC].copy_from_slice(&r);
    let d = read_file(&img, 0, "24");
    assert_eq!(d.len(), 4096);
    assert!(d[..1000].iter().all(|&b| b == 0x77) && d[1000..].iter().all(|&b| b == 0));
    let d = read_file(&img, 0, "25");
    assert_eq!(d.len(), size as usize);
    assert!(d[..4096].chunks(3).all(|c| c == &b"abc"[..c.len()]));
    assert_eq!(&d[4096..5000], &chunk_raw().1[..904]);
    assert!(d[5000..].iter().all(|&b| b == 0));
    // Fully initialized streams are unchanged.
    assert_eq!(read_file(&img, 0, "21")[65536 + 1], 1);
}

#[test]
fn assemble_huge_sizes_are_errors() {
    let src = vec![0u8; 4096];
    for size in [u64::MAX, 1 << 40, (1 << 30) + 1] {
        let plain = Entry { size, extents: vec![(-1, size)], ..Default::default() };
        assert!(assemble(&src, &plain).is_err(), "{size}");
        let packed = Entry { size, extents: vec![(0, 4096), (-1, size)], unit: 65536, ..Default::default() };
        assert!(assemble(&src, &packed).is_err(), "{size}");
        let resident = Entry { size, resident: Some(b"abc".to_vec()), ..Default::default() };
        assert_eq!(assemble(&src, &resident).unwrap(), b"abc");
    }
    // A data run past the end of the source is an error too.
    assert!(assemble(&src, &Entry { size: 8192, extents: vec![(0, 8192)], ..Default::default() }).is_err());
    assert_eq!(assemble(&src, &Entry { size: 10, extents: vec![(-1, 4)], valid: Some(2), ..Default::default() }).unwrap(), vec![0; 10]);
}
