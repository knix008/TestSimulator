//! Writing an ISO 9660 (ECMA-119, level 1 names) + Joliet image from a tree.
//!
//! Layout: 16 system sectors · PVD (16) · Joliet SVD (17) · terminator (18) · path tables
//! (primary L, primary M, Joliet L, Joliet M) · primary directories · Joliet directories ·
//! file data. Both trees point at the same file data.
//!
//! What other readers check (xorriso/libisofs, Windows' mounter, macOS, Linux):
//!  - descriptor text fields padded with spaces, dates as 16 digits + a time-zone byte,
//!    file structure version (byte 881) = 1, the type-M path table location big-endian;
//!  - path tables list every directory, parents first, children by identifier;
//!  - directory records never cross a sector boundary, sorted by identifier, the first two
//!    are "." and "..";
//!  - identifiers unique inside a directory (8.3 names are made unique with ~N).
//!
//! File data is copied from where it is (the opened image, disk files) while writing. A data
//! image: boot catalogs of the original are not kept. Files must be under 4 GiB each.

use crate::iso_read::SECTOR;
use crate::tree::*;
use crate::util::*;
use std::collections::HashSet;
use std::io::{Seek, SeekFrom, Write};

const S: usize = SECTOR as usize;
const MAX_FILE: u64 = 0xffff_ffff;

struct Entry {
    iso_id: Vec<u8>,
    joliet_id: Vec<u8>,
    /// index into `dirs` or `files`
    dir: Option<usize>,
    file: Option<usize>,
}

struct Dir {
    parent: Option<usize>,
    entries: Vec<Entry>,
    /// identifiers as seen from the parent
    iso_id: Vec<u8>,
    joliet_id: Vec<u8>,
    number: u16,
    iso_lba: u32,
    iso_size: u32,
    joliet_lba: u32,
    joliet_size: u32,
}

struct FileOut<'a> {
    path: String,
    node: &'a FileNode,
    lba: u32,
}

struct Plan<'a> {
    dirs: Vec<Dir>,
    files: Vec<FileOut<'a>>,
}

impl<'a> Plan<'a> {
    fn plan_dir(&mut self, node: &'a DirNode, path: &str, parent: Option<usize>, iso_id: Vec<u8>, joliet_id: Vec<u8>) -> usize {
        let me = self.dirs.len();
        self.dirs.push(Dir { parent, entries: Vec::new(), iso_id, joliet_id, number: 0, iso_lba: 0, iso_size: 0, joliet_lba: 0, joliet_size: 0 });
        let mut children: Vec<&Node> = node.children.values().collect();
        children.sort_by(|a, b| a.name().cmp(b.name()));
        let mut iso_used = HashSet::new();
        let mut joliet_used = HashSet::new();
        for child in children {
            let child_path = if path.is_empty() { child.name().to_string() } else { format!("{path}/{}", child.name()) };
            let iso_id = unique_iso_name(child.name(), child.is_dir(), &mut iso_used).into_bytes();
            let joliet_id = ucs2(&unique_joliet_name(child.name(), &mut joliet_used));
            let entry = match child {
                Node::Dir(d) => {
                    let idx = self.plan_dir(d, &child_path, Some(me), iso_id.clone(), joliet_id.clone());
                    Entry { iso_id, joliet_id, dir: Some(idx), file: None }
                }
                Node::File(f) => {
                    self.files.push(FileOut { path: child_path, node: f, lba: 0 });
                    Entry { iso_id, joliet_id, dir: None, file: Some(self.files.len() - 1) }
                }
            };
            self.dirs[me].entries.push(entry);
        }
        me
    }
}

fn clean_iso(s: &str) -> String {
    s.encode_utf16()
        .map(|u| {
            let c = char::from_u32(u as u32).unwrap_or('_').to_ascii_uppercase();
            if c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// ISO 9660 level 1: d-characters, 8.3 for files (with ";1"), 8 for directories; unique.
fn unique_iso_name(name: &str, is_dir: bool, used: &mut HashSet<String>) -> String {
    let take = |s: String, n: usize| s.chars().take(n).collect::<String>();
    let (mut base, ext) = if is_dir {
        (take(clean_iso(name), 8), String::new())
    } else {
        match name.rfind('.').filter(|&d| d > 0) {
            Some(d) => (take(clean_iso(&name[..d]), 8), take(clean_iso(&name[d + 1..]), 3)),
            None => (take(clean_iso(name), 8), String::new()),
        }
    };
    if base.is_empty() {
        base = "_".into();
    }
    let make = |b: &str| if is_dir { b.to_string() } else { format!("{b}.{ext}") };
    let mut candidate = make(&base);
    let mut n = 1;
    while used.contains(&candidate) {
        let suffix = format!("~{n}");
        candidate = make(&format!("{}{suffix}", take(base.clone(), 8 - suffix.len())));
        n += 1;
    }
    used.insert(candidate.clone());
    if is_dir {
        candidate
    } else {
        format!("{candidate};1")
    }
}

/// Joliet: up to 64 UCS-2 characters, without * / : ; ? \ ; unique.
fn unique_joliet_name(name: &str, used: &mut HashSet<String>) -> String {
    let mut clean: Vec<u16> = name.encode_utf16().map(|u| if "*/:;?\\".encode_utf16().any(|c| c == u) { b'_' as u16 } else { u }).collect();
    let dot_of = |v: &[u16]| v.iter().rposition(|&u| u == b'.' as u16).filter(|&d| d > 0);
    if clean.len() > 64 {
        let ext: Vec<u16> = match dot_of(&clean) {
            Some(d) if clean.len() - d <= 10 => clean[d..].to_vec(),
            _ => Vec::new(),
        };
        clean.truncate(64 - ext.len());
        clean.extend(ext);
    }
    let text = |v: &[u16]| String::from_utf16_lossy(v);
    let mut candidate = clean.clone();
    let mut n = 1;
    while used.contains(&text(&candidate).to_lowercase()) {
        let suffix: Vec<u16> = format!(" ({n})").encode_utf16().collect();
        let (stem, ext) = match dot_of(&clean) {
            Some(d) => (clean[..d].to_vec(), clean[d..].to_vec()),
            None => (clean.clone(), Vec::new()),
        };
        let keep = 64usize.saturating_sub(ext.len() + suffix.len()).min(stem.len());
        candidate = [&stem[..keep], &suffix[..], &ext[..]].concat();
        n += 1;
    }
    used.insert(text(&candidate).to_lowercase());
    text(&candidate)
}

fn ucs2(text: &str) -> Vec<u8> {
    text.encode_utf16().flat_map(|u| u.to_be_bytes()).collect()
}

fn record_length(id_len: usize) -> usize {
    let len = 33 + id_len;
    len + (len % 2)
}

fn sectors_for(bytes: u64) -> u64 {
    bytes.div_ceil(SECTOR).max(1)
}

fn sorted_entries(d: &Dir, joliet: bool) -> Vec<&Entry> {
    let mut v: Vec<&Entry> = d.entries.iter().collect();
    v.sort_by(|a, b| if joliet { a.joliet_id.cmp(&b.joliet_id) } else { a.iso_id.cmp(&b.iso_id) });
    v
}

/// A directory's bytes: records never cross a sector boundary.
fn dir_bytes(d: &Dir, joliet: bool) -> u32 {
    let mut off = 34 * 2;
    for e in sorted_entries(d, joliet) {
        let len = record_length(if joliet { e.joliet_id.len() } else { e.iso_id.len() });
        if off % S + len > S {
            off = off.div_ceil(S) * S;
        }
        off += len;
    }
    (off.div_ceil(S).max(1) * S) as u32
}

fn id_of(d: &Dir, joliet: bool) -> Vec<u8> {
    if d.parent.is_none() {
        vec![0]
    } else if joliet {
        d.joliet_id.clone()
    } else {
        d.iso_id.clone()
    }
}

fn path_table_size(dirs: &[Dir], order: &[usize], joliet: bool) -> usize {
    order.iter().map(|&i| {
        let n = id_of(&dirs[i], joliet).len();
        8 + n + n % 2
    }).sum()
}

fn path_table(dirs: &[Dir], order: &[usize], joliet: bool, msb: bool, size: usize) -> Vec<u8> {
    let mut out = vec![0u8; sectors_for(size as u64) as usize * S];
    let mut o = 0;
    for &i in order {
        let d = &dirs[i];
        let id = id_of(d, joliet);
        out[o] = id.len() as u8;
        let lba = if joliet { d.joliet_lba } else { d.iso_lba };
        let parent = d.parent.map(|p| dirs[p].number).unwrap_or(1);
        if msb {
            out[o + 2..o + 6].copy_from_slice(&lba.to_be_bytes());
            out[o + 6..o + 8].copy_from_slice(&parent.to_be_bytes());
        } else {
            out[o + 2..o + 6].copy_from_slice(&lba.to_le_bytes());
            out[o + 6..o + 8].copy_from_slice(&parent.to_le_bytes());
        }
        out[o + 8..o + 8 + id.len()].copy_from_slice(&id);
        o += 8 + id.len() + id.len() % 2;
    }
    out
}

fn both16(b: &mut [u8], o: usize, v: u16) {
    b[o..o + 2].copy_from_slice(&v.to_le_bytes());
    b[o + 2..o + 4].copy_from_slice(&v.to_be_bytes());
}
fn both32(b: &mut [u8], o: usize, v: u32) {
    b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    b[o + 4..o + 8].copy_from_slice(&v.to_be_bytes());
}

type Date = (i64, u32, u32, u32, u32, u32);

fn dir_record(b: &mut [u8], o: usize, lba: u32, size: u32, flags: u8, id: &[u8], date: Date) -> usize {
    let len = record_length(id.len());
    b[o] = len as u8;
    b[o + 1] = 0;
    both32(b, o + 2, lba);
    both32(b, o + 10, size);
    b[o + 18] = (date.0 - 1900).clamp(0, 255) as u8;
    b[o + 19] = date.1 as u8;
    b[o + 20] = date.2 as u8;
    b[o + 21] = date.3 as u8;
    b[o + 22] = date.4 as u8;
    b[o + 23] = date.5 as u8;
    b[o + 24] = 0;
    b[o + 25] = flags;
    b[o + 26] = 0;
    b[o + 27] = 0;
    both16(b, o + 28, 1);
    b[o + 32] = id.len() as u8;
    b[o + 33..o + 33 + id.len()].copy_from_slice(id);
    len
}

fn ascii(b: &mut [u8], o: usize, text: &str) {
    for (i, c) in text.bytes().enumerate() {
        b[o + i] = c & 0x7f;
    }
}

/// A Joliet text field: UCS-2 BE, padded with spaces (00 20).
fn ucs2_field(b: &mut [u8], o: usize, len: usize, text: &str) {
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut i = 0;
    while i + 1 < len {
        let c = units.get(i / 2).copied().unwrap_or(0x20);
        b[o + i..o + i + 2].copy_from_slice(&c.to_be_bytes());
        i += 2;
    }
    if len % 2 == 1 {
        b[o + len - 1] = 0;
    }
}

/// 17-byte descriptor date: "YYYYMMDDHHMMSScc" + time-zone byte; unset = sixteen '0' and 0.
fn descriptor_date(b: &mut [u8], o: usize, d: Option<Date>) {
    let text = match d {
        Some((y, mo, da, h, mi, s)) => format!("{y:04}{mo:02}{da:02}{h:02}{mi:02}{s:02}00"),
        None => "0000000000000000".into(),
    };
    ascii(b, o, &text);
    b[o + 16] = 0;
}

#[allow(clippy::too_many_arguments)]
fn descriptor(s: &mut [u8], joliet: bool, label: &str, now: Date, volume: u32, pt_size: u32, pt_l: u32, pt_m: u32, root: &Dir) {
    s[0] = if joliet { 2 } else { 1 };
    ascii(s, 1, "CD001");
    s[6] = 1;
    let text = |s: &mut [u8], o: usize, len: usize, v: &str| {
        if joliet {
            ucs2_field(s, o, len, v)
        } else {
            let mut t: String = v.chars().take(len).collect();
            while t.len() < len {
                t.push(' ');
            }
            ascii(s, o, &t);
        }
    };
    text(s, 8, 32, "");
    let l: String = if joliet { label.chars().take(16).collect() } else { label.to_uppercase() };
    text(s, 40, 32, &l);
    both32(s, 80, volume);
    if joliet {
        // UCS-2 level 3
        s[88] = 0x25;
        s[89] = 0x2f;
        s[90] = 0x45;
    }
    both16(s, 120, 1);
    both16(s, 124, 1);
    both16(s, 128, SECTOR as u16);
    both32(s, 132, pt_size);
    s[140..144].copy_from_slice(&pt_l.to_le_bytes());
    s[144..148].copy_from_slice(&0u32.to_le_bytes());
    s[148..152].copy_from_slice(&pt_m.to_be_bytes());
    s[152..156].copy_from_slice(&0u32.to_be_bytes());
    let (lba, size) = if joliet { (root.joliet_lba, root.joliet_size) } else { (root.iso_lba, root.iso_size) };
    dir_record(s, 156, lba, size, 0x02, &[0], now);
    text(s, 190, 128, "");
    text(s, 318, 128, "");
    text(s, 446, 128, "");
    text(s, 574, 128, "MYISOMAKER");
    text(s, 702, 37, "");
    text(s, 739, 37, "");
    text(s, 776, 37, "");
    descriptor_date(s, 813, Some(now));
    descriptor_date(s, 830, Some(now));
    descriptor_date(s, 847, None);
    descriptor_date(s, 864, None);
    s[881] = 1;
}

pub fn sanitize_label(label: &str) -> String {
    let mut out = String::new();
    let mut last_us = false;
    for c in label.to_uppercase().chars() {
        if c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_' {
            out.push(c);
            last_us = false;
        } else if !last_us {
            out.push('_');
            last_us = true;
        }
    }
    let out: String = out.chars().take(32).collect();
    if out.is_empty() {
        "ISOMAKER".into()
    } else {
        out
    }
}

/// Writes the image to `out`. `progress(percent, message)`.
pub fn write_iso<W: Write + Seek>(root: &DirNode, volume_label: &str, out: &mut W, progress: &dyn Fn(f64, &str), cancel: &Cancel) -> Res<u64> {
    cancel.check()?;
    let label = sanitize_label(if volume_label.is_empty() { "ISOMAKER" } else { volume_label });
    let now = civil(now_secs());

    // ── Plan the trees ──
    let mut plan = Plan { dirs: Vec::new(), files: Vec::new() };
    plan.plan_dir(root, "", None, Vec::new(), Vec::new());
    // Path table order: by depth, then by parent number, then by identifier.
    let mut order = vec![0usize];
    let mut i = 0;
    while i < order.len() {
        let d = &plan.dirs[order[i]];
        let mut subs: Vec<&Entry> = d.entries.iter().filter(|e| e.dir.is_some()).collect();
        subs.sort_by(|a, b| a.iso_id.cmp(&b.iso_id));
        let next: Vec<usize> = subs.iter().map(|e| e.dir.unwrap()).collect();
        order.extend(next);
        i += 1;
    }
    for (n, &d) in order.iter().enumerate() {
        if n >= 65535 {
            return err("Too many folders for an ISO 9660 path table (65535)");
        }
        plan.dirs[d].number = (n + 1) as u16;
    }
    for f in &plan.files {
        if f.node.size > MAX_FILE {
            return err(format!("File too large for a single ISO9660 extent (4 GiB): {}", f.path));
        }
    }

    let iso_pt = path_table_size(&plan.dirs, &order, false);
    let joliet_pt = path_table_size(&plan.dirs, &order, true);
    let (iso_sectors, joliet_sectors) = (sectors_for(iso_pt as u64) as u32, sectors_for(joliet_pt as u64) as u32);
    let mut lba: u64 = 19;
    let iso_l = lba as u32;
    lba += iso_sectors as u64;
    let iso_m = lba as u32;
    lba += iso_sectors as u64;
    let joliet_l = lba as u32;
    lba += joliet_sectors as u64;
    let joliet_m = lba as u32;
    lba += joliet_sectors as u64;
    for &d in &order {
        let size = dir_bytes(&plan.dirs[d], false);
        let dir = &mut plan.dirs[d];
        dir.iso_size = size;
        dir.iso_lba = lba as u32;
        lba += (size as u64) / SECTOR;
    }
    for &d in &order {
        let size = dir_bytes(&plan.dirs[d], true);
        let dir = &mut plan.dirs[d];
        dir.joliet_size = size;
        dir.joliet_lba = lba as u32;
        lba += (size as u64) / SECTOR;
    }
    let meta_end = lba;
    for f in plan.files.iter_mut() {
        if f.node.size == 0 {
            f.lba = 0;
            continue;
        }
        f.lba = lba as u32;
        lba += sectors_for(f.node.size);
    }
    if lba > u32::MAX as u64 {
        return err("The image would be larger than ISO 9660 allows (8 TiB)");
    }
    let volume = lba as u32;

    progress(5.0, "볼륨 헤더 작성…");
    cancel.check()?;

    // ── Descriptors and metadata (sectors 0 … meta_end-1) ──
    let mut meta = vec![0u8; meta_end as usize * S];
    let root_dir = &plan.dirs[0];
    descriptor(&mut meta[16 * S..17 * S], false, &label, now, volume, iso_pt as u32, iso_l, iso_m, root_dir);
    descriptor(&mut meta[17 * S..18 * S], true, &label, now, volume, joliet_pt as u32, joliet_l, joliet_m, root_dir);
    meta[18 * S] = 255;
    ascii(&mut meta, 18 * S + 1, "CD001");
    meta[18 * S + 6] = 1;
    for (joliet, msb, at, size) in [(false, false, iso_l, iso_pt), (false, true, iso_m, iso_pt), (true, false, joliet_l, joliet_pt), (true, true, joliet_m, joliet_pt)] {
        let t = path_table(&plan.dirs, &order, joliet, msb, size);
        let o = at as usize * S;
        meta[o..o + t.len()].copy_from_slice(&t);
    }
    for &d in &order {
        for joliet in [false, true] {
            let dir = &plan.dirs[d];
            let (lba, size) = if joliet { (dir.joliet_lba, dir.joliet_size) } else { (dir.iso_lba, dir.iso_size) };
            let parent = &plan.dirs[dir.parent.unwrap_or(d)];
            let (plba, psize) = if joliet { (parent.joliet_lba, parent.joliet_size) } else { (parent.iso_lba, parent.iso_size) };
            let start = lba as usize * S;
            let buf = &mut meta[start..start + size as usize];
            let mut o = 0;
            o += dir_record(buf, o, lba, size, 0x02, &[0], now);
            o += dir_record(buf, o, plba, psize, 0x02, &[1], now);
            for e in sorted_entries(dir, joliet) {
                let id = if joliet { &e.joliet_id } else { &e.iso_id };
                let len = record_length(id.len());
                if o % S + len > S {
                    o = o.div_ceil(S) * S;
                }
                if let Some(sd) = e.dir {
                    let sub = &plan.dirs[sd];
                    let (l, s) = if joliet { (sub.joliet_lba, sub.joliet_size) } else { (sub.iso_lba, sub.iso_size) };
                    o += dir_record(buf, o, l, s, 0x02, id, now);
                } else {
                    let f = &plan.files[e.file.unwrap()];
                    o += dir_record(buf, o, f.lba, f.node.size as u32, 0x00, id, now);
                }
            }
        }
    }
    out.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    out.write_all(&meta).map_err(|e| e.to_string())?;

    progress(20.0, "파일 데이터 연결…");
    let mut data: Vec<&FileOut> = plan.files.iter().filter(|f| f.node.size > 0).collect();
    data.sort_by_key(|f| f.lba);
    let total = data.len().max(1) as f64;
    let zeros = [0u8; S];
    for (i, f) in data.iter().enumerate() {
        cancel.check()?;
        progress(20.0 + ((i as f64 / total) * 75.0).round(), &format!("파일 포함: {}", f.path));
        let mut r = open_source(f.node)?;
        let got = copy_n(&mut r, out, f.node.size, cancel)?;
        if got != f.node.size {
            return err(format!("Size changed while saving: {} ({got} ≠ {})", f.path, f.node.size));
        }
        let pad = (sectors_for(f.node.size) * SECTOR - f.node.size) as usize;
        if pad > 0 {
            out.write_all(&zeros[..pad]).map_err(|e| e.to_string())?;
        }
    }
    progress(100.0, "ISO 작성 완료");
    Ok(volume as u64 * SECTOR)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn iso_names_unique_8_3() {
        let mut used = HashSet::new();
        assert_eq!(unique_iso_name("longfilename-one.txt", false, &mut used), "LONGFILE.TXT;1");
        assert_eq!(unique_iso_name("longfilename-two.txt", false, &mut used), "LONGFI~1.TXT;1");
        assert_eq!(unique_iso_name("한글.txt", false, &mut used), "__.TXT;1");
        assert_eq!(unique_iso_name("docs", true, &mut used), "DOCS");
    }
    #[test]
    fn joliet_names_short_and_unique() {
        let mut used = HashSet::new();
        let long = "a very long file name that goes past sixty four characters for sure — really.txt";
        let n = unique_joliet_name(long, &mut used);
        assert_eq!(n.encode_utf16().count(), 64);
        assert!(n.ends_with(".txt"));
        assert_eq!(unique_joliet_name("A.txt", &mut used), "A.txt");
        assert_eq!(unique_joliet_name("a.txt", &mut used), "a (1).txt");
        assert_eq!(unique_joliet_name("x:y", &mut used), "x_y");
    }
    #[test]
    fn labels() {
        assert_eq!(sanitize_label("My Disc 2024"), "MY_DISC_2024");
        assert_eq!(sanitize_label(""), "ISOMAKER");
    }
}
