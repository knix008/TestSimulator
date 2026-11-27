//! Partition tables: MBR (primary entries, the EBR chain of an extended partition) and GPT; a volume without a
//! table is one partition at 0.
use super::{detect, label_of, u32le, u64le, utf16, Fs};
use crate::doc::Bytes;
use serde_json::{json, Value};

struct Part {
    offset: u64,
    length: u64,
    kind: String,
    name: String,
    label: String,
    bootable: bool,
}

fn mbr_type_name(t: u8) -> &'static str {
    match t {
        0x01 => "FAT12",
        0x04 | 0x06 | 0x0E => "FAT16",
        0x0B | 0x0C => "FAT32",
        0x07 => "NTFS / exFAT / HPFS",
        0x05 | 0x0F | 0x85 => "Extended",
        0x11 | 0x14 | 0x16 | 0x1B | 0x1C | 0x1E => "Hidden FAT",
        0x17 => "Hidden NTFS",
        0x27 => "Windows recovery",
        0x82 => "Linux swap",
        0x83 => "Linux",
        0x8E => "Linux LVM",
        0xA5 => "FreeBSD",
        0xA6 => "OpenBSD",
        0xA8 => "Apple UFS",
        0xAB => "Apple boot",
        0xAF => "Apple HFS / HFS+",
        0xEE => "GPT protective",
        0xEF => "EFI system",
        0xFD => "Linux RAID",
        _ => "Unknown",
    }
}

/// The GUID in its usual text form (the first three fields little-endian).
pub(crate) fn guid(b: &[u8]) -> String {
    if b.len() < 16 {
        return String::new();
    }
    format!(
        "{:08X}-{:04X}-{:04X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}",
        u32le(b, 0), u16::from_le_bytes([b[4], b[5]]), u16::from_le_bytes([b[6], b[7]]), b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    )
}

fn gpt_type_name(g: &str) -> &'static str {
    match g {
        "C12A7328-F81F-11D2-BA4B-00A0C93EC93B" => "EFI system",
        "EBD0A0A2-B9E5-4433-87C0-68B6B72699C7" => "Microsoft basic data",
        "E3C9E316-0B5C-4DB8-817D-F92DF00215AE" => "Microsoft reserved",
        "DE94BBA4-06D1-4D40-A16A-BFD50179D6AC" => "Windows recovery",
        "5808C8AA-7E8F-42E0-85D2-E1E90434CFB3" => "Windows LDM metadata",
        "AF9B60A0-1431-4F62-BC68-3311714A69AD" => "Windows LDM data",
        "0FC63DAF-8483-4772-8E79-3D69D8477DE4" => "Linux filesystem",
        "0657FD6D-A4AB-43C4-84E5-0933C84B4F4F" => "Linux swap",
        "E6D6D379-F507-44C2-A23C-238F2A3DF928" => "Linux LVM",
        "A19D880F-05FC-4D3B-A006-743F0F84911E" => "Linux RAID",
        "933AC7E1-2EB4-4F13-B844-0E14E2AEF915" => "Linux /home",
        "4F68BCE3-E8CD-4DB1-96E7-FBCAF984B709" => "Linux root (x86-64)",
        "7C3457EF-0000-11AA-AA11-00306543ECAC" => "Apple APFS",
        "48465300-0000-11AA-AA11-00306543ECAC" => "Apple HFS+",
        "426F6F74-0000-11AA-AA11-00306543ECAC" => "Apple boot (recovery)",
        "21686148-6449-6E6F-744E-656564454649" => "BIOS boot",
        "516E7CB4-6ECF-11D6-8FF8-00022D09712B" => "FreeBSD",
        _ => "Unknown",
    }
}

fn read(src: &dyn Bytes, off: u64, len: usize) -> Option<Vec<u8>> {
    if off.checked_add(len as u64)? > src.len() {
        return None;
    }
    let mut b = vec![0u8; len];
    src.read(off, &mut b).ok()?;
    Some(b)
}

fn gpt(src: &dyn Bytes) -> Option<Vec<Part>> {
    for sector in [512u64, 4096] {
        let Some(h) = read(src, sector, 92) else { continue };
        if &h[0..8] != b"EFI PART" {
            continue;
        }
        let first = u64le(&h, 72);
        let count = (u32le(&h, 80) as u64).min(1024);
        let size = u32le(&h, 84) as u64;
        if !(128..=4096).contains(&size) {
            continue;
        }
        let table = read(src, first.checked_mul(sector)?, (count * size) as usize)?;
        let mut out = Vec::new();
        for i in 0..count {
            let e = &table[(i * size) as usize..((i + 1) * size) as usize];
            if e[0..16].iter().all(|&b| b == 0) {
                continue;
            }
            let (lo, hi) = (u64le(e, 32), u64le(e, 40));
            if hi < lo {
                continue;
            }
            let g = guid(&e[0..16]);
            out.push(Part {
                offset: lo * sector,
                length: (hi - lo + 1) * sector,
                name: gpt_type_name(&g).into(),
                kind: g,
                label: utf16(&e[56..128.min(e.len())]),
                bootable: u64le(e, 48) & 4 != 0,
            });
        }
        return Some(out);
    }
    None
}

fn mbr(src: &dyn Bytes, sector0: &[u8]) -> Option<(Vec<Part>, bool)> {
    if sector0.len() < 512 || sector0[510] != 0x55 || sector0[511] != 0xAA {
        return None;
    }
    let total = src.len() / 512;
    let mut out = Vec::new();
    let mut protective = false;
    for i in 0..4 {
        let e = &sector0[446 + i * 16..462 + i * 16];
        let (boot, kind, start, count) = (e[0], e[4], u32le(e, 8) as u64, u32le(e, 12) as u64);
        if kind == 0 || count == 0 {
            continue;
        }
        if boot != 0 && boot != 0x80 {
            return None;
        }
        if kind == 0xEE {
            protective = true;
            continue;
        }
        if start == 0 || start > total.max(1) * 4 {
            return None;
        }
        if matches!(kind, 0x05 | 0x0F | 0x85) {
            // The logical partitions: EBR chain, each EBR's first entry relative to it, second to the extended start.
            let mut ebr = start;
            for _ in 0..128 {
                let Some(b) = read(src, ebr * 512, 512) else { break };
                if b[510] != 0x55 || b[511] != 0xAA {
                    break;
                }
                let (k1, s1, c1) = (b[446 + 4], u32le(&b, 446 + 8) as u64, u32le(&b, 446 + 12) as u64);
                if k1 != 0 && c1 != 0 {
                    out.push(Part { offset: (ebr + s1) * 512, length: c1 * 512, kind: format!("0x{k1:02X}"), name: mbr_type_name(k1).into(), label: String::new(), bootable: b[446] == 0x80 });
                }
                let (k2, s2) = (b[462 + 4], u32le(&b, 462 + 8) as u64);
                if k2 == 0 || s2 == 0 {
                    break;
                }
                ebr = start + s2;
            }
            continue;
        }
        out.push(Part { offset: start * 512, length: count * 512, kind: format!("0x{kind:02X}"), name: mbr_type_name(kind).into(), label: String::new(), bootable: boot == 0x80 });
    }
    Some((out, protective))
}

pub(crate) fn partitions(src: &dyn Bytes) -> Result<Value, String> {
    let sector0 = read(src, 0, 512).ok_or("the data is shorter than one sector")?;
    let (scheme, mut parts) = if detect(src, 0) != Fs::Unknown {
        // A volume image: its boot sector also ends in 55 AA, but it is no partition table.
        ("none", vec![Part { offset: 0, length: src.len(), kind: String::new(), name: "Volume".into(), label: String::new(), bootable: false }])
    } else {
        match mbr(src, &sector0) {
            Some((_, true)) => ("gpt", gpt(src).unwrap_or_default()),
            Some((list, false)) => ("mbr", list),
            None => match gpt(src) {
                Some(list) => ("gpt", list),
                None => ("none", Vec::new()),
            },
        }
    };
    let list: Vec<Value> = parts
        .iter_mut()
        .enumerate()
        .map(|(i, p)| {
            let fs = if p.offset < src.len() { detect(src, p.offset) } else { Fs::Unknown };
            let label = if p.label.is_empty() && fs != Fs::Unknown { label_of(src, p.offset) } else { std::mem::take(&mut p.label) };
            json!({ "index": i, "offset": p.offset, "length": p.length, "type": p.kind, "typeName": p.name, "fs": fs.id(), "label": label, "bootable": p.bootable })
        })
        .collect();
    Ok(json!({ "scheme": scheme, "partitions": list }))
}

