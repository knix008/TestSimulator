//! NTFS: the boot sector, $MFT (record 0's data runs, through its attribute list when it has one), MFT records (fixups,
//! $STANDARD_INFORMATION, $FILE_NAME, $ATTRIBUTE_LIST, $DATA resident or as runlists). A file's attributes may live in
//! extension records named by its $ATTRIBUTE_LIST: they are gathered, and the segments of a non-resident attribute joined
//! by starting VCN. The unnamed $DATA is the file; named $DATA attributes (alternate data streams) are entries
//! "<name>:<stream>" with ids "<record>:<stream>". Compressed data (LZNT1) is decompressed by `assemble`; encrypted data
//! ($EFS) is kept raw and flagged. A directory is listed by scanning the MFT for records whose $FILE_NAME names it as
//! parent (in the base record or an extension record); records not in use are deleted files. ids: record numbers (root "5").
use super::{filetime_text, push_extent, u16le, u32le, u64le, utf16, Entry, Info, Listing, Vol};
use std::collections::{BTreeMap, BTreeSet};

const MAX_RECORDS: u64 = 200_000;
/// Extension records followed for one file.
const MAX_EXTENSIONS: usize = 512;
/// The largest attribute list read.
const MAX_LIST: u64 = 4 << 20;

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

/// One $DATA attribute (or one segment of a non-resident one).
#[derive(Default, Clone)]
struct Data {
    name: String,
    flags: u16,
    start_vcn: u64,
    /// Data size (meaningful in the segment starting at VCN 0).
    size: u64,
    /// Initialized size (valid data length; non-resident only).
    init: u64,
    /// log2 of the compression unit in clusters.
    cu: u16,
    resident: Option<Vec<u8>>,
    /// (lcn or -1 for sparse, clusters)
    runs: Vec<(i64, u64)>,
}

/// A data stream after joining its segments.
struct Stream {
    name: String,
    flags: u16,
    size: u64,
    init: u64,
    cu: u16,
    resident: Option<Vec<u8>>,
    runs: Vec<(i64, u64)>,
}

/// Where the $ATTRIBUTE_LIST is: resident content, or runs and a size.
enum AttrList {
    Resident(Vec<u8>),
    Runs(Vec<(i64, u64)>, u64),
}

#[derive(Default)]
struct Rec {
    in_use: bool,
    dir: bool,
    base: u64,
    names: Vec<Name>,
    si: Option<(u64, u64)>,
    /// $STANDARD_INFORMATION file attributes.
    si_flags: u32,
    /// An $EFS logged utility stream is present.
    efs: bool,
    data: Vec<Data>,
    list: Option<AttrList>,
    volume_name: Option<String>,
}

impl Rec {
    /// The $DATA streams, segments joined in VCN order; the unnamed one first.
    fn streams(&self) -> Vec<Stream> {
        let mut groups: BTreeMap<&str, Vec<&Data>> = BTreeMap::new();
        for d in &self.data {
            groups.entry(d.name.as_str()).or_default().push(d);
        }
        let mut out = Vec::new();
        for (name, mut segs) in groups {
            segs.sort_by_key(|d| d.start_vcn);
            let first = segs[0];
            let mut s = Stream { name: name.to_string(), flags: first.flags, size: first.size, init: first.init, cu: first.cu, resident: first.resident.clone(), runs: Vec::new() };
            if s.resident.is_none() {
                // Segments in VCN order; a gap between them reads as sparse.
                let mut vcn = 0u64;
                for d in segs.iter().filter(|d| d.resident.is_none()) {
                    if d.start_vcn < vcn {
                        continue;
                    }
                    if d.start_vcn > vcn {
                        s.runs.push((-1, d.start_vcn - vcn));
                        vcn = d.start_vcn;
                    }
                    for &(lcn, len) in &d.runs {
                        s.runs.push((lcn, len));
                        vcn = vcn.saturating_add(len);
                    }
                }
            }
            out.push(s);
        }
        out
    }

    fn encrypted(&self) -> bool {
        self.efs || self.si_flags & 0x4000 != 0
    }
}

fn fixups(buf: &mut [u8], bps: usize) -> bool {
    let off = u16le(buf, 4) as usize;
    let count = u16le(buf, 6) as usize;
    if off + count * 2 > buf.len() || count == 0 {
        return false;
    }
    let usn = [buf[off], buf[off + 1]];
    // The update sequence covers every 512 bytes of the record, whatever the sector size.
    let _ = bps;
    let stride = 512usize;
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
            lcn = lcn.wrapping_add(d);
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
        if len < 16 || len > used - pos {
            break;
        }
        let a = &buf[pos..pos + len];
        let nonresident = a[8] != 0;
        let name = {
            let (n, off) = (a[9] as usize, u16le(a, 10) as usize);
            if n == 0 { String::new() } else { utf16(a.get(off..off + n * 2).unwrap_or(&[])) }
        };
        let aflags = u16le(a, 12);
        let content = if nonresident {
            None
        } else {
            let (size, off) = (u32le(a, 16) as usize, u16le(a, 20) as usize);
            off.checked_add(size).and_then(|end| a.get(off..end))
        };
        let runs = || runlist(a.get(u16le(a, 32) as usize..).unwrap_or(&[]));
        match kind {
            0x10 => {
                if let Some(c) = content {
                    r.si = Some((u64le(c, 0), u64le(c, 8)));
                    r.si_flags = u32le(c, 32);
                }
            }
            0x20 => {
                if nonresident {
                    r.list = Some(AttrList::Runs(runs(), u64le(a, 48)));
                } else if let Some(c) = content {
                    r.list = Some(AttrList::Resident(c.to_vec()));
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
            0x80 => {
                if nonresident {
                    r.data.push(Data { name, flags: aflags, start_vcn: u64le(a, 16), size: u64le(a, 48), init: u64le(a, 56), cu: u16le(a, 34), resident: None, runs: runs() });
                } else if let Some(c) = content {
                    r.data.push(Data { name, flags: aflags, size: c.len() as u64, resident: Some(c.to_vec()), ..Default::default() });
                }
            }
            0x100 if name == "$EFS" => r.efs = true,
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
        g.set_mft(&r0);
        // A fragmented $MFT keeps the rest of its runs in extension records (found through the first runs).
        let r0 = if r0.list.is_some() { g.load(vol, 0, r0) } else { r0 };
        g.set_mft(&r0);
        Ok(g)
    }

    fn set_mft(&mut self, r0: &Rec) {
        let cs = self.cs;
        let main = r0.streams().into_iter().find(|s| s.name.is_empty());
        self.mft.clear();
        if let Some(s) = &main {
            for &(lcn, len) in &s.runs {
                if lcn >= 0 {
                    if let (Some(o), Some(l)) = ((lcn as u64).checked_mul(cs), len.checked_mul(cs)) {
                        self.mft.push((o, l));
                    }
                }
            }
        }
        if self.mft.is_empty() {
            self.mft.push((self.mft_lcn.saturating_mul(cs), self.rec * 16));
        }
        let mft_bytes: u64 = self.mft.iter().fold(0u64, |a, r| a.saturating_add(r.1));
        self.records = main.map(|s| s.size).unwrap_or(mft_bytes).min(mft_bytes) / self.rec;
    }

    fn record_offset(&self, n: u64) -> Option<u64> {
        let mut at = n.checked_mul(self.rec)?;
        for &(o, l) in &self.mft {
            if at < l {
                return o.checked_add(at);
            }
            at -= l;
        }
        None
    }

    /// Record `n` as stored (base or extension record alone).
    fn raw_record(&self, vol: &Vol, n: u64) -> Result<Rec, String> {
        let off = self.record_offset(n).ok_or_else(|| format!("record {n} is outside the MFT"))?;
        let mut buf = vol.read(off, self.rec as usize)?;
        fixups(&mut buf, self.bps as usize);
        parse_record(&buf).ok_or_else(|| format!("record {n} is not an MFT record"))
    }

    /// Record `n` with the attributes of its extension records.
    fn record(&self, vol: &Vol, n: u64) -> Result<Rec, String> {
        let r = self.raw_record(vol, n)?;
        Ok(if r.list.is_some() { self.load(vol, n, r) } else { r })
    }

    /// Reads clusters of runs, up to `size` bytes (sparse as zeros).
    fn read_runs(&self, vol: &Vol, runs: &[(i64, u64)], size: u64) -> Option<Vec<u8>> {
        let mut out = Vec::new();
        for &(lcn, len) in runs {
            let left = size.saturating_sub(out.len() as u64);
            let want = len.saturating_mul(self.cs).min(left) as usize;
            if want == 0 {
                break;
            }
            if lcn < 0 {
                out.resize(out.len() + want, 0);
            } else {
                out.extend_from_slice(&vol.read((lcn as u64).checked_mul(self.cs)?, want).ok()?);
            }
        }
        Some(out)
    }

    /// Follows the $ATTRIBUTE_LIST of base record `n` into its extension records: their $DATA segments and $FILE_NAMEs.
    fn load(&self, vol: &Vol, n: u64, mut r: Rec) -> Rec {
        let list = match r.list.take() {
            Some(AttrList::Resident(c)) => c,
            Some(AttrList::Runs(runs, size)) => match self.read_runs(vol, &runs, size.min(MAX_LIST)) {
                Some(b) => b,
                None => return r,
            },
            None => return r,
        };
        let mut refs = BTreeSet::new();
        let mut pos = 0usize;
        for _ in 0..65536 {
            if pos + 26 > list.len() {
                break;
            }
            let len = u16le(&list, pos + 4) as usize;
            if len < 26 || pos + len > list.len() {
                break;
            }
            let rec = u64le(&list, pos + 16) & 0xFFFF_FFFF_FFFF;
            if rec != n && refs.len() < MAX_EXTENSIONS {
                refs.insert(rec);
            }
            pos += len;
        }
        for x in refs {
            let Ok(e) = self.raw_record(vol, x) else { continue };
            if e.base != n {
                continue;
            }
            r.names.extend(e.names);
            r.data.extend(e.data);
            r.efs |= e.efs;
        }
        r
    }

    fn stream_entry(&self, vol: &Vol, n: u64, r: &Rec, best: Option<&Name>, s: &Stream) -> Entry {
        let mut extents = Vec::new();
        for &(lcn, len) in &s.runs {
            let bytes = len.saturating_mul(self.cs);
            if lcn < 0 {
                push_extent(&mut extents, -1, bytes);
            } else {
                push_extent(&mut extents, vol.abs((lcn as u64).saturating_mul(self.cs)) as i64, bytes);
            }
        }
        let compressed = s.resident.is_none() && s.flags & 0x00FF != 0;
        let cu = if s.cu == 0 || s.cu > 16 { 4 } else { s.cu };
        let base = best.map(|b| b.name.clone()).unwrap_or_else(|| format!("[record {n}]"));
        let (c, m) = r.si.or_else(|| best.map(|b| (b.created, b.modified))).unwrap_or((0, 0));
        Entry {
            name: format!("{base}:{}", s.name),
            id: format!("{n}:{}", s.name),
            dir: false,
            size: s.size,
            created: filetime_text(c),
            modified: filetime_text(m),
            deleted: !r.in_use,
            resident: s.resident.clone(),
            extents,
            unit: if compressed { self.cs << cu } else { 0 },
            encrypted: s.flags & 0x4000 != 0 || r.encrypted(),
            valid: if s.resident.is_none() && s.init < s.size { Some(s.init) } else { None },
        }
    }

    /// The file (its unnamed $DATA) and an entry per named stream.
    fn entries(&self, vol: &Vol, n: u64, r: &Rec) -> Vec<Entry> {
        let best = best_name(r);
        let streams = r.streams();
        let main = streams.iter().find(|s| s.name.is_empty());
        let mut e = match main {
            Some(s) if !r.dir => self.stream_entry(vol, n, r, best, s),
            _ => {
                let (c, m) = r.si.or_else(|| best.map(|b| (b.created, b.modified))).unwrap_or((0, 0));
                Entry {
                    dir: r.dir,
                    size: if r.dir { 0 } else { best.map(|b| b.size).unwrap_or(0) },
                    created: filetime_text(c),
                    modified: filetime_text(m),
                    deleted: !r.in_use,
                    encrypted: !r.dir && r.encrypted(),
                    ..Default::default()
                }
            }
        };
        e.name = best.map(|b| b.name.clone()).unwrap_or_else(|| format!("[record {n}]"));
        e.id = n.to_string();
        let mut out = vec![e];
        for s in streams.iter().filter(|s| !s.name.is_empty()) {
            out.push(self.stream_entry(vol, n, r, best, s));
        }
        out
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
    // Base records whose names (for this directory) are in an extension record, and the ones already listed.
    let (mut via_ext, mut seen) = (BTreeSet::new(), BTreeSet::new());
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
            while k + run < count && g.record_offset(n + k + run) == off.checked_add(run * g.rec) {
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
                if num == d || (!r.in_use && !deleted) {
                    continue;
                }
                if r.base != 0 {
                    if r.names.iter().any(|x| x.parent == d) && via_ext.len() < 100_000 {
                        via_ext.insert(r.base);
                    }
                    continue;
                }
                if r.names.iter().any(|x| x.parent == d) {
                    let r = if r.list.is_some() { g.load(vol, num, r) } else { r };
                    seen.insert(num);
                    entries.extend(g.entries(vol, num, &r));
                }
            }
            k += run;
        }
        n += count;
    }
    for b in via_ext {
        if b == d || seen.contains(&b) {
            continue;
        }
        let Ok(r) = g.record(vol, b) else { continue };
        if r.base != 0 || (!r.in_use && !deleted) || !r.names.iter().any(|x| x.parent == d) {
            continue;
        }
        entries.extend(g.entries(vol, b, &r));
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

/// `id`: "<record>" or "<record>:<stream>".
pub(crate) fn file(vol: &Vol, id: &str) -> Result<Entry, String> {
    let g = Geo::new(vol)?;
    let (num, stream) = match id.split_once(':') {
        Some((a, b)) => (a, Some(b)),
        None => (id, None),
    };
    let n: u64 = num.parse().map_err(|_| format!("not a record number: {id}"))?;
    let r = g.record(vol, n)?;
    let all = g.entries(vol, n, &r);
    match stream {
        None | Some("") => all.into_iter().next().ok_or_else(|| format!("record {n} has no entry")),
        Some(s) => all.into_iter().find(|e| e.id == id).ok_or_else(|| format!("record {n} has no data stream named {s}")),
    }
}

pub(crate) fn info(vol: &Vol) -> Result<Info, String> {
    let g = Geo::new(vol)?;
    let label = g.record(vol, 3).ok().and_then(|r| r.volume_name).unwrap_or_default();
    Ok(Info {
        label,
        serial: format!("{:016X}", g.serial),
        cluster: g.cs,
        total: g.total.saturating_mul(g.bps),
        sector: g.bps,
        details: vec![
            ("Type".into(), "NTFS".into()),
            ("MFT record size".into(), g.rec.to_string()),
            ("MFT".into(), format!("{:#x}", g.mft_lcn.saturating_mul(g.cs))),
            ("MFT mirror".into(), format!("{:#x}", g.mirr_lcn.saturating_mul(g.cs))),
            ("MFT records".into(), g.records.to_string()),
            ("MFT runs".into(), g.mft.len().to_string()),
        ],
    })
}
