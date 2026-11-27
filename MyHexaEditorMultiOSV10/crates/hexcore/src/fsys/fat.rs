//! FAT12 / FAT16 / FAT32: the BPB, FAT chains, directories with long names, deleted entries (0xE5).
//! ids: directories "root" / "c:<start cluster>", files "e:<directory cluster or r>:<slot>".
use super::{dos_text, push_extent, u16le, u32le, Entry, Info, Listing, Vol};
use std::cell::RefCell;
use std::collections::HashMap;

/// The FAT type (12, 16, 32) when `boot` is a FAT boot sector.
pub(crate) fn kind(boot: &[u8]) -> Option<u8> {
    let bps = u16le(boot, 11) as u64;
    let spc = boot[13] as u64;
    let reserved = u16le(boot, 14) as u64;
    let fats = boot[16] as u64;
    let root = u16le(boot, 17) as u64;
    let total = if u16le(boot, 19) != 0 { u16le(boot, 19) as u64 } else { u32le(boot, 32) as u64 };
    let fatsz = if u16le(boot, 22) != 0 { u16le(boot, 22) as u64 } else { u32le(boot, 36) as u64 };
    if !matches!(bps, 512 | 1024 | 2048 | 4096) || spc == 0 || !spc.is_power_of_two() || reserved == 0 || !(1..=4).contains(&fats) || fatsz == 0 || total == 0 {
        return None;
    }
    if boot[21] < 0xF0 && boot[21] != 0 {
        return None;
    }
    let root_sectors = (root * 32).div_ceil(bps);
    let data = total.checked_sub(reserved + fats * fatsz + root_sectors)?;
    let clusters = data / spc;
    Some(if clusters < 4085 { 12 } else if clusters < 65525 { 16 } else { 32 })
}

pub(crate) struct Geo {
    pub kind: u8,
    pub bps: u64,
    pub spc: u64,
    pub reserved: u64,
    pub fats: u64,
    pub fatsz: u64,
    pub root_entries: u64,
    pub total: u64,
    pub first_data: u64,
    pub clusters: u64,
    pub root_cluster: u32,
    pub cs: u64,
    pub boot: Vec<u8>,
    cache: RefCell<HashMap<u64, Vec<u8>>>,
}

impl Geo {
    fn new(vol: &Vol, kind: u8) -> Result<Geo, String> {
        let boot = vol.read(0, 512)?;
        let bps = u16le(&boot, 11) as u64;
        let spc = boot[13] as u64;
        let reserved = u16le(&boot, 14) as u64;
        let fats = boot[16] as u64;
        let root_entries = u16le(&boot, 17) as u64;
        let total = if u16le(&boot, 19) != 0 { u16le(&boot, 19) as u64 } else { u32le(&boot, 32) as u64 };
        let fatsz = if u16le(&boot, 22) != 0 { u16le(&boot, 22) as u64 } else { u32le(&boot, 36) as u64 };
        let root_sectors = (root_entries * 32).div_ceil(bps);
        let first_data = reserved + fats * fatsz + root_sectors;
        let clusters = total.saturating_sub(first_data) / spc;
        let root_cluster = if kind == 32 { u32le(&boot, 44) } else { 0 };
        Ok(Geo { kind, bps, spc, reserved, fats, fatsz, root_entries, total, first_data, clusters, root_cluster, cs: bps * spc, boot, cache: RefCell::new(HashMap::new()) })
    }

    pub fn cluster_off(&self, c: u32) -> u64 {
        (self.first_data + (c as u64).saturating_sub(2) * self.spc) * self.bps
    }

    fn valid(&self, c: u32) -> bool {
        c >= 2 && (c as u64) < self.clusters + 2
    }

    /// The FAT entry of cluster `c` (0 when unreadable).
    fn next(&self, vol: &Vol, c: u32) -> u32 {
        let off = match self.kind {
            12 => c as u64 + c as u64 / 2,
            16 => c as u64 * 2,
            _ => c as u64 * 4,
        };
        let sector = off / self.bps;
        let within = (off % self.bps) as usize;
        let byte = |s: u64, i: usize| -> u8 {
            let mut cache = self.cache.borrow_mut();
            if !cache.contains_key(&s) {
                let data = vol.read((self.reserved + s) * self.bps, self.bps as usize).unwrap_or_default();
                if cache.len() > 4096 {
                    cache.clear();
                }
                cache.insert(s, data);
            }
            cache[&s].get(i).copied().unwrap_or(0)
        };
        let at = |k: u64| -> u8 { let o = within as u64 + k; byte(sector + o / self.bps, (o % self.bps) as usize) };
        match self.kind {
            12 => {
                let v = at(0) as u32 | (at(1) as u32) << 8;
                if c & 1 == 1 { v >> 4 } else { v & 0xFFF }
            }
            16 => at(0) as u32 | (at(1) as u32) << 8,
            _ => (at(0) as u32 | (at(1) as u32) << 8 | (at(2) as u32) << 16 | (at(3) as u32) << 24) & 0x0FFF_FFFF,
        }
    }

    fn eoc(&self, v: u32) -> bool {
        match self.kind {
            12 => v >= 0xFF7,
            16 => v >= 0xFFF7,
            _ => v >= 0x0FFF_FFF7,
        }
    }

    /// The clusters of a chain (at most `limit`).
    pub fn chain(&self, vol: &Vol, start: u32, limit: u64) -> Vec<u32> {
        let mut out = Vec::new();
        let mut c = start;
        while self.valid(c) && (out.len() as u64) < limit.min(self.clusters + 1) {
            out.push(c);
            let n = self.next(vol, c);
            if self.eoc(n) || n == 0 || n == c {
                break;
            }
            c = n;
        }
        out
    }

    fn extents(&self, vol: &Vol, clusters: &[u32]) -> Vec<(i64, u64)> {
        let mut list = Vec::new();
        for &c in clusters {
            push_extent(&mut list, vol.abs(self.cluster_off(c)) as i64, self.cs);
        }
        list
    }
}

enum Key {
    Root,
    Cluster(u32),
}

fn key_of(dir: Option<&str>) -> Result<Key, String> {
    match dir {
        None | Some("root") | Some("") | Some("r") => Ok(Key::Root),
        Some(d) => d.strip_prefix("c:").and_then(|c| c.parse().ok()).map(Key::Cluster).ok_or_else(|| format!("not a directory id: {d}")),
    }
}

/// The raw bytes of a directory (at most 2 MiB).
fn dir_bytes(vol: &Vol, g: &Geo, key: &Key) -> Result<Vec<u8>, String> {
    const MAX: u64 = 2 << 20;
    let start = match key {
        Key::Root if g.kind != 32 => return vol.read((g.reserved + g.fats * g.fatsz) * g.bps, (g.root_entries * 32) as usize),
        Key::Root => g.root_cluster,
        Key::Cluster(c) => *c,
    };
    if !g.valid(start) {
        return Err(format!("cluster {start} is outside the volume"));
    }
    // A deleted directory's chain is cleared: its first cluster only.
    let chain = if g.next(vol, start) == 0 { vec![start] } else { g.chain(vol, start, MAX / g.cs + 1) };
    let mut out = Vec::new();
    for c in chain {
        out.extend(vol.read(g.cluster_off(c), g.cs as usize)?);
    }
    Ok(out)
}

struct Raw {
    slot: usize,
    entry: Entry,
    cluster: u32,
}

fn short_name(e: &[u8]) -> String {
    let lower = e[12];
    let mut base: Vec<u8> = e[0..8].to_vec();
    if base[0] == 0x05 {
        base[0] = 0xE5;
    }
    let conv = |b: &[u8], low: bool| -> String {
        let s: String = b.iter().map(|&c| if c < 0x80 { c as char } else { char::from_u32(c as u32).unwrap_or('?') }).collect::<String>().trim_end().to_string();
        if low { s.to_lowercase() } else { s }
    };
    let b = conv(&base, lower & 0x08 != 0);
    let x = conv(&e[8..11], lower & 0x10 != 0);
    if x.is_empty() { b } else { format!("{b}.{x}") }
}

fn parse(vol: &Vol, g: &Geo, bytes: &[u8], key_text: &str, deleted_too: bool) -> (Vec<Raw>, Option<u32>, String) {
    let mut out = Vec::new();
    let mut lfn: Vec<String> = Vec::new();
    let mut parent = None;
    let mut label = String::new();
    for (slot, e) in bytes.chunks_exact(32).enumerate() {
        if e[0] == 0 {
            break;
        }
        let attr = e[11];
        if attr & 0x3F == 0x0F {
            let mut units = Vec::new();
            units.extend_from_slice(&e[1..11]);
            units.extend_from_slice(&e[14..26]);
            units.extend_from_slice(&e[28..32]);
            let text: Vec<u16> = units.chunks_exact(2).map(|p| u16::from_le_bytes([p[0], p[1]])).take_while(|&u| u != 0 && u != 0xFFFF).collect();
            lfn.push(String::from_utf16_lossy(&text));
            continue;
        }
        let deleted = e[0] == 0xE5;
        if attr & 0x08 != 0 {
            if !deleted {
                label = short_name(e).replace('.', "");
            }
            lfn.clear();
            continue;
        }
        let raw_name = short_name(e);
        let hi = if g.kind == 32 { u16le(e, 20) as u32 } else { 0 };
        let cluster = hi << 16 | u16le(e, 26) as u32;
        if raw_name == "." || raw_name == ".." {
            if raw_name == ".." {
                parent = Some(cluster);
            }
            lfn.clear();
            continue;
        }
        if deleted && !deleted_too {
            lfn.clear();
            continue;
        }
        let long = if lfn.is_empty() { None } else { Some(lfn.iter().rev().cloned().collect::<String>()) };
        lfn.clear();
        let name = match long {
            Some(l) if !l.is_empty() => l,
            _ if deleted => format!("_{}", raw_name.chars().skip(1).collect::<String>()),
            _ => raw_name,
        };
        let dir = attr & 0x10 != 0;
        let size = if dir { 0 } else { u32le(e, 28) as u64 };
        let extents = if !g.valid(cluster) {
            Vec::new()
        } else if deleted {
            let n = if dir { 1 } else { size.div_ceil(g.cs).max(1) };
            let n = n.min(g.clusters + 2 - cluster as u64);
            vec![(vol.abs(g.cluster_off(cluster)) as i64, n * g.cs)]
        } else if dir || size > 0 {
            g.extents(vol, &g.chain(vol, cluster, if dir { 1 << 16 } else { size.div_ceil(g.cs).max(1) }))
        } else {
            Vec::new()
        };
        let id = if dir { if cluster == 0 { "root".to_string() } else { format!("c:{cluster}") } } else { format!("e:{key_text}:{slot}") };
        out.push(Raw {
            slot,
            cluster,
            entry: Entry {
                name,
                id,
                dir,
                size,
                created: dos_text(u16le(e, 16), u16le(e, 14)),
                modified: dos_text(u16le(e, 24), u16le(e, 22)),
                deleted,
                resident: None,
                extents,
            },
        });
    }
    (out, parent, label)
}

fn key_text(key: &Key) -> String {
    match key {
        Key::Root => "r".into(),
        Key::Cluster(c) => c.to_string(),
    }
}

pub(crate) fn list(vol: &Vol, kind: u8, dir: Option<&str>, deleted: bool) -> Result<Listing, String> {
    let g = Geo::new(vol, kind)?;
    let key = key_of(dir)?;
    let bytes = dir_bytes(vol, &g, &key)?;
    let (raws, parent, _) = parse(vol, &g, &bytes, &key_text(&key), deleted);
    let is_root = matches!(key, Key::Root) || matches!(key, Key::Cluster(c) if c == g.root_cluster && g.kind == 32);
    let parent_id = if is_root { None } else { Some(match parent { Some(p) if p != 0 && p != g.root_cluster => format!("c:{p}"), _ => "root".to_string() }) };
    // The path: up the ".." entries, finding each directory's name in its parent.
    let mut path = String::new();
    if is_root {
        path.push('/');
    } else if let Key::Cluster(mut c) = key {
        let mut names = Vec::new();
        let mut up = parent;
        for _ in 0..32 {
            let pkey = match up { Some(p) if p != 0 && p != g.root_cluster => Key::Cluster(p), _ => Key::Root };
            let Ok(pb) = dir_bytes(vol, &g, &pkey) else { break };
            let (pr, pp, _) = parse(vol, &g, &pb, &key_text(&pkey), true);
            match pr.iter().find(|r| r.entry.dir && r.cluster == c) {
                Some(r) => names.push(r.entry.name.clone()),
                None => names.push(format!("[{c}]")),
            }
            match pkey {
                Key::Root => break,
                Key::Cluster(p) => {
                    c = p;
                    up = pp;
                }
            }
        }
        names.reverse();
        path = format!("/{}", names.join("/"));
    }
    let id = match key { Key::Root => "root".to_string(), Key::Cluster(c) => format!("c:{c}") };
    Ok(Listing { dir: id, parent: parent_id, path, entries: raws.into_iter().map(|r| r.entry).collect() })
}

pub(crate) fn file(vol: &Vol, kind: u8, id: &str) -> Result<Entry, String> {
    let g = Geo::new(vol, kind)?;
    let rest = id.strip_prefix("e:").ok_or_else(|| format!("not a file id: {id}"))?;
    let (k, slot) = rest.rsplit_once(':').ok_or_else(|| format!("not a file id: {id}"))?;
    let key = if k == "r" { Key::Root } else { Key::Cluster(k.parse().map_err(|_| format!("not a file id: {id}"))?) };
    let slot: usize = slot.parse().map_err(|_| format!("not a file id: {id}"))?;
    let bytes = dir_bytes(vol, &g, &key)?;
    let (raws, _, _) = parse(vol, &g, &bytes, k, true);
    raws.into_iter().find(|r| r.slot == slot).map(|r| r.entry).ok_or_else(|| format!("no entry {id}"))
}

pub(crate) fn info(vol: &Vol, kind: u8) -> Result<Info, String> {
    let g = Geo::new(vol, kind)?;
    let (lo, so) = if kind == 32 { (71, 67) } else { (43, 39) };
    let mut label = String::from_utf8_lossy(&g.boot[lo..lo + 11]).trim().to_string();
    if let Ok(bytes) = dir_bytes(vol, &g, &Key::Root) {
        let (_, _, l) = parse(vol, &g, &bytes, "r", false);
        if !l.is_empty() {
            label = l;
        }
    }
    if label == "NO NAME" {
        label.clear();
    }
    let serial = u32le(&g.boot, so);
    Ok(Info {
        label,
        serial: format!("{:04X}-{:04X}", serial >> 16, serial & 0xFFFF),
        cluster: g.cs,
        total: g.total * g.bps,
        sector: g.bps,
        details: vec![
            ("Type".into(), format!("FAT{kind}")),
            ("OEM name".into(), String::from_utf8_lossy(&g.boot[3..11]).trim().to_string()),
            ("Sectors per cluster".into(), g.spc.to_string()),
            ("Reserved sectors".into(), g.reserved.to_string()),
            ("FATs".into(), g.fats.to_string()),
            ("Sectors per FAT".into(), g.fatsz.to_string()),
            ("Root entries".into(), g.root_entries.to_string()),
            ("Clusters".into(), g.clusters.to_string()),
            ("Root cluster".into(), g.root_cluster.to_string()),
            ("Data area".into(), format!("{:#x}", g.first_data * g.bps)),
        ],
    })
}
