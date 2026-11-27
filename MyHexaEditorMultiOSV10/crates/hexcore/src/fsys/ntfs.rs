//! NTFS: the boot sector, $MFT (record 0's data runs), MFT records (fixups, $STANDARD_INFORMATION, $FILE_NAME,
//! unnamed $DATA resident or as a runlist). A directory is listed by scanning the MFT for records whose $FILE_NAME
//! names it as parent; records not in use are deleted files. ids: record numbers (root "5").
use super::{filetime_text, push_extent, u16le, u32le, u64le, utf16, Entry, Info, Listing, Vol};

const MAX_RECORDS: u64 = 200_000;

struct Geo {
    bps: u64,
    cs: u64,
    total: u64,
    mft_lcn: u64,
    mirr_lcn: u64,
    rec: u64,
    serial: u64,
    /// The $MFT's runs (volume byte offset, length).
    mft: Vec<(u64, u64)>,
    records: u64,
}

#[derive(Default)]
struct Name {
    parent: u64,
    ns: u8,
    name: String,
    created: u64,
    modified: u64,
    size: u64,
}

#[derive(Default)]
struct Rec {
    in_use: bool,
    dir: bool,
    base: u64,
    names: Vec<Name>,
    si: Option<(u64, u64)>,
    data_size: Option<u64>,
    resident: Option<Vec<u8>>,
    /// (lcn or -1 for sparse, clusters)
    runs: Vec<(i64, u64)>,
    volume_name: Option<String>,
}

fn fixups(buf: &mut [u8], bps: usize) -> bool {
    let off = u16le(buf, 4) as usize;
    let count = u16le(buf, 6) as usize;
    if off + count * 2 > buf.len() || count == 0 {
        return false;
    }
    let usn = [buf[off], buf[off + 1]];
    let stride = bps.min(512).max(512);
    let mut ok = true;
    for k in 1..count {
        let pos = k * stride - 2;
        if pos + 2 > buf.len() {
            break;
        }
        if buf[pos..pos + 2] != usn {
            ok = false;
        }
        buf[pos] = buf[off + 2 * k];
        buf[pos + 1] = buf[off + 2 * k + 1];
    }
    ok
}

/// A runlist → (lcn or -1, clusters).
fn runlist(b: &[u8]) -> Vec<(i64, u64)> {
    let mut out = Vec::new();
    let mut pos = 0;
    let mut lcn: i64 = 0;
    while pos < b.len() && out.len() < 100_000 {
        let h = b[pos];
        if h == 0 {
            break;
        }
        let (ln, on) = ((h & 0x0F) as usize, (h >> 4) as usize);
        if ln == 0 || ln > 8 || on > 8 || pos + 1 + ln + on > b.len() {
            break;
        }
        let mut len: u64 = 0;
        for k in 0..ln {
            len |= (b[pos + 1 + k] as u64) << (8 * k);
        }
        if on == 0 {
            out.push((-1, len));
        } else {
            let mut d: i64 = 0;
            for k in 0..on {
                d |= (b[pos + 1 + ln + k] as i64) << (8 * k);
            }
            let shift = 64 - 8 * on as u32;
            d = (d << shift) >> shift;
            lcn += d;
            out.push((lcn, len));
        }
        pos += 1 + ln + on;
    }
    out
}

fn parse_record(buf: &[u8]) -> Option<Rec> {
    if buf.len() < 48 || &buf[0..4] != b"FILE" {
        return None;
    }
    let flags = u16le(buf, 22);
    let used = (u32le(buf, 24) as usize).min(buf.len());
    let mut r = Rec { in_use: flags & 1 != 0, dir: flags & 2 != 0, base: u64le(buf, 32) & 0xFFFF_FFFF_FFFF, ..Default::default() };
    let mut pos = u16le(buf, 20) as usize;
    for _ in 0..256 {
        if pos + 16 > used {
            break;
        }
        let kind = u32le(buf, pos);
        if kind == 0xFFFF_FFFF {
            break;
        }
        let len = u32le(buf, pos + 4) as usize;
        if len < 16 || pos + len > used {
            break;
        }
        let a = &buf[pos..pos + len];
        let nonresident = a[8] != 0;
        let named = a[9] != 0;
        let content = if nonresident {
            None
        } else {
            let (size, off) = (u32le(a, 16) as usize, u16le(a, 20) as usize);
            a.get(off..off + size)
        };
        match kind {
            0x10 => {
                if let Some(c) = content {
                    r.si = Some((u64le(c, 0), u64le(c, 8)));
                }
            }
            0x30 => {
                if let Some(c) = content {
                    let n = *c.get(64).unwrap_or(&0) as usize;
                    r.names.push(Name { parent: u64le(c, 0) & 0xFFFF_FFFF_FFFF, ns: *c.get(65).unwrap_or(&0), name: utf16(c.get(66..66 + n * 2).unwrap_or(&[])), created: u64le(c, 8), modified: u64le(c, 16), size: u64le(c, 48) });
                }
            }
            0x60 => {
                if let Some(c) = content {
                    r.volume_name = Some(utf16(c));
                }
            }
            0x80 if !named && r.data_size.is_none() => {
                if nonresident {
                    r.data_size = Some(u64le(a, 48));
                    let off = u16le(a, 32) as usize;
                    r.runs = runlist(a.get(off..).unwrap_or(&[]));
                } else if let Some(c) = content {
                    r.data_size = Some(c.len() as u64);
                    r.resident = Some(c.to_vec());
                }
            }
            _ => {}
        }
        pos += len;
    }
    Some(r)
}

impl Geo {
    fn new(vol: &Vol) -> Result<Geo, String> {
        let boot = vol.read(0, 512)?;
        let bps = u16le(&boot, 11) as u64;
        if !matches!(bps, 512 | 1024 | 2048 | 4096) {
            return Err("NTFS: bad sector size".into());
        }
        let spcb = boot[13];
        let spc = if spcb > 0x80 { 1u64 << (256 - spcb as u32).min(31) } else { spcb as u64 };
        if spc == 0 {
            return Err("NTFS: bad cluster size".into());
        }
        let cs = bps * spc;
        let cpr = boot[64] as i8;
        let rec = if cpr < 0 { 1u64 << (-(cpr as i32)).min(20) } else { cpr as u64 * cs };
        if !(256..=65536).contains(&rec) {
            return Err("NTFS: bad MFT record size".into());
        }
        let mut g = Geo { bps, cs, total: u64le(&boot, 40), mft_lcn: u64le(&boot, 48), mirr_lcn: u64le(&boot, 56), rec, serial: u64le(&boot, 72), mft: Vec::new(), records: 0 };
        let mut first = vol.read(g.mft_lcn.checked_mul(cs).ok_or("NTFS: bad MFT location")?, rec as usize)?;
        fixups(&mut first, bps as usize);
        let r0 = parse_record(&first).ok_or("NTFS: record 0 of the MFT is not readable")?;
        for (lcn, len) in &r0.runs {
            if *lcn >= 0 {
                g.mft.push((*lcn as u64 * cs, len * cs));
            }
        }
        if g.mft.is_empty() {
            g.mft.push((g.mft_lcn * cs, rec * 16));
        }
        let mft_bytes: u64 = g.mft.iter().map(|r| r.1).sum();
        g.records = (r0.data_size.unwrap_or(mft_bytes).min(mft_bytes)) / rec;
        Ok(g)
    }

    fn record_offset(&self, n: u64) -> Option<u64> {
        let mut at = n.checked_mul(self.rec)?;
        for &(o, l) in &self.mft {
            if at < l {
                return Some(o + at);
            }
            at -= l;
        }
        None
    }

    fn record(&self, vol: &Vol, n: u64) -> Result<Rec, String> {
        let off = self.record_offset(n).ok_or_else(|| format!("record {n} is outside the MFT"))?;
        let mut buf = vol.read(off, self.rec as usize)?;
        fixups(&mut buf, self.bps as usize);
        parse_record(&buf).ok_or_else(|| format!("record {n} is not an MFT record"))
    }

    fn entry(&self, vol: &Vol, n: u64, r: &Rec) -> Entry {
        let best = best_name(r);
        let mut extents = Vec::new();
        for &(lcn, len) in &r.runs {
            if lcn < 0 {
                push_extent(&mut extents, -1, len * self.cs);
            } else {
                push_extent(&mut extents, vol.abs(lcn as u64 * self.cs) as i64, len * self.cs);
            }
        }
        let (c, m) = r.si.or_else(|| best.map(|b| (b.created, b.modified))).unwrap_or((0, 0));
        Entry {
            name: best.map(|b| b.name.clone()).unwrap_or_else(|| format!("[record {n}]")),
            id: n.to_string(),
            dir: r.dir,
            size: if r.dir { 0 } else { r.data_size.or_else(|| best.map(|b| b.size)).unwrap_or(0) },
            created: filetime_text(c),
            modified: filetime_text(m),
            deleted: !r.in_use,
            resident: if r.dir { None } else { r.resident.clone() },
            extents: if r.dir { Vec::new() } else { extents },
        }
    }
}

/// The name to show: Win32 (or Win32 & DOS) before POSIX before the DOS 8.3 one.
fn best_name(r: &Rec) -> Option<&Name> {
    let rank = |ns: u8| match ns {
        1 | 3 => 0,
        0 => 1,
        _ => 2,
    };
    r.names.iter().min_by_key(|n| rank(n.ns))
}

fn dir_id(dir: Option<&str>) -> Result<u64, String> {
    match dir {
        None | Some("") | Some("root") => Ok(5),
        Some(d) => d.parse().map_err(|_| format!("not a record number: {d}")),
    }
}

pub(crate) fn list(vol: &Vol, dir: Option<&str>, deleted: bool) -> Result<Listing, String> {
    let g = Geo::new(vol)?;
    let d = dir_id(dir)?;
    let me = g.record(vol, d)?;
    let mut entries = Vec::new();
    let total = g.records.min(MAX_RECORDS);
    const BATCH: u64 = 256;
    let mut n = 0;
    while n < total {
        let count = BATCH.min(total - n);
        // Records of a batch may span MFT runs: read them one run piece at a time.
        let mut k = 0;
        while k < count {
            let Some(off) = g.record_offset(n + k) else { break };
            // How many records are contiguous from here.
            let mut run = 1;
            while k + run < count && g.record_offset(n + k + run) == Some(off + run * g.rec) {
                run += 1;
            }
            let Ok(chunk) = vol.read(off, (run * g.rec) as usize) else { k += run; continue };
            for j in 0..run {
                let num = n + k + j;
                let mut buf = chunk[(j * g.rec) as usize..((j + 1) * g.rec) as usize].to_vec();
                if &buf[0..4] != b"FILE" {
                    continue;
                }
                fixups(&mut buf, g.bps as usize);
                let Some(r) = parse_record(&buf) else { continue };
                if r.base != 0 || num == d || (!r.in_use && !deleted) {
                    continue;
                }
                if r.names.iter().any(|x| x.parent == d) {
                    entries.push(g.entry(vol, num, &r));
                }
            }
            k += run;
        }
        n += count;
    }
    entries.sort_by(|a, b| b.dir.cmp(&a.dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    // Parent and path: up the $FILE_NAME parents.
    let parent = if d == 5 { None } else { best_name(&me).map(|b| b.parent.to_string()) };
    let mut path = String::new();
    if d == 5 {
        path.push('/');
    } else {
        let mut names = Vec::new();
        let mut cur = d;
        for _ in 0..64 {
            if cur == 5 {
                break;
            }
            let Ok(r) = g.record(vol, cur) else { break };
            let Some(b) = best_name(&r) else { break };
            names.push(b.name.clone());
            if b.parent == cur {
                break;
            }
            cur = b.parent;
        }
        names.reverse();
        path = format!("/{}", names.join("/"));
    }
    Ok(Listing { dir: d.to_string(), parent, path, entries })
}

pub(crate) fn file(vol: &Vol, id: &str) -> Result<Entry, String> {
    let g = Geo::new(vol)?;
    let n: u64 = id.parse().map_err(|_| format!("not a record number: {id}"))?;
    let r = g.record(vol, n)?;
    Ok(g.entry(vol, n, &r))
}

pub(crate) fn info(vol: &Vol) -> Result<Info, String> {
    let g = Geo::new(vol)?;
    let label = g.record(vol, 3).ok().and_then(|r| r.volume_name).unwrap_or_default();
    Ok(Info {
        label,
        serial: format!("{:016X}", g.serial),
        cluster: g.cs,
        total: g.total * g.bps,
        sector: g.bps,
        details: vec![
            ("Type".into(), "NTFS".into()),
            ("MFT record size".into(), g.rec.to_string()),
            ("MFT".into(), format!("{:#x}", g.mft_lcn * g.cs)),
            ("MFT mirror".into(), format!("{:#x}", g.mirr_lcn * g.cs)),
            ("MFT records".into(), g.records.to_string()),
            ("MFT runs".into(), g.mft.len().to_string()),
        ],
    })
}
