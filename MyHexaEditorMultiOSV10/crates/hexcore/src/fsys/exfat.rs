//! exFAT: boot region, FAT chains or contiguous data (NoFatChain), directory entry sets (file / stream / name),
//! deleted entry sets (in-use bit clear). ids: directories "root" / "d:<cluster>:<nofatchain>:<length>",
//! files "e:<directory id with | for :>:<slot>".
use super::{dos_text, push_extent, u16le, u32le, u64le, utf16, Entry, Info, Listing, Vol};
use std::cell::RefCell;
use std::collections::HashMap;

struct Geo {
    bps: u64,
    cs: u64,
    fat_off: u64,
    heap_off: u64,
    count: u64,
    root: u32,
    boot: Vec<u8>,
    cache: RefCell<HashMap<u64, Vec<u8>>>,
}

impl Geo {
    fn new(vol: &Vol) -> Result<Geo, String> {
        let boot = vol.read(0, 512)?;
        let (bs, cs) = (boot[108] as u32, boot[109] as u32);
        if !(9..=12).contains(&bs) || bs + cs > 25 {
            return Err("exFAT: bad sector / cluster size".into());
        }
        let bps = 1u64 << bs;
        Ok(Geo {
            bps,
            cs: bps << cs,
            fat_off: u32le(&boot, 80) as u64 * bps,
            heap_off: u32le(&boot, 88) as u64 * bps,
            count: u32le(&boot, 92) as u64,
            root: u32le(&boot, 96),
            boot,
            cache: RefCell::new(HashMap::new()),
        })
    }
    fn off(&self, c: u32) -> u64 {
        self.heap_off + (c as u64).saturating_sub(2) * self.cs
    }
    fn valid(&self, c: u32) -> bool {
        c >= 2 && (c as u64) < self.count + 2
    }
    fn next(&self, vol: &Vol, c: u32) -> u32 {
        let off = self.fat_off + c as u64 * 4;
        let sector = off / self.bps;
        let mut cache = self.cache.borrow_mut();
        if !cache.contains_key(&sector) {
            let data = vol.read(sector * self.bps, self.bps as usize).unwrap_or_default();
            if cache.len() > 4096 {
                cache.clear();
            }
            cache.insert(sector, data);
        }
        u32le(&cache[&sector], (off % self.bps) as usize)
    }
    /// The byte ranges (relative to the volume) of data starting at `c`.
    fn runs(&self, vol: &Vol, c: u32, nofat: bool, len: u64) -> Vec<(u64, u64)> {
        if !self.valid(c) {
            return Vec::new();
        }
        let clusters = len.div_ceil(self.cs).max(1);
        if nofat {
            let n = clusters.min(self.count + 2 - c as u64);
            return vec![(self.off(c), n * self.cs)];
        }
        let mut out: Vec<(u64, u64)> = Vec::new();
        let mut cur = c;
        for _ in 0..clusters.min(self.count + 1) {
            let o = self.off(cur);
            match out.last_mut() {
                Some(l) if l.0 + l.1 == o => l.1 += self.cs,
                _ => out.push((o, self.cs)),
            }
            let n = self.next(vol, cur);
            if !self.valid(n) || n == cur {
                break;
            }
            cur = n;
        }
        out
    }
}

struct DirKey {
    cluster: u32,
    nofat: bool,
    len: u64,
    text: String,
}

fn key_of(g: &Geo, dir: Option<&str>) -> Result<DirKey, String> {
    match dir {
        None | Some("") | Some("root") => Ok(DirKey { cluster: g.root, nofat: false, len: 16 << 20, text: "root".into() }),
        Some(d) => {
            let parts: Vec<&str> = d.strip_prefix("d:").ok_or_else(|| format!("not a directory id: {d}"))?.split(':').collect();
            if parts.len() != 3 {
                return Err(format!("not a directory id: {d}"));
            }
            let bad = || format!("not a directory id: {d}");
            Ok(DirKey { cluster: parts[0].parse().map_err(|_| bad())?, nofat: parts[1] == "1", len: parts[2].parse().map_err(|_| bad())?, text: d.to_string() })
        }
    }
}

fn dir_bytes(vol: &Vol, g: &Geo, k: &DirKey) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    for (o, l) in g.runs(vol, k.cluster, k.nofat, k.len.min(8 << 20)) {
        out.extend(vol.read(o, l as usize)?);
        if out.len() > 8 << 20 {
            break;
        }
    }
    Ok(out)
}

fn ts(v: u32) -> String {
    dos_text((v >> 16) as u16, v as u16)
}

fn parse(vol: &Vol, g: &Geo, bytes: &[u8], key: &str, deleted_too: bool) -> (Vec<(usize, Entry)>, String) {
    let slots: Vec<&[u8]> = bytes.chunks_exact(32).collect();
    let mut out = Vec::new();
    let mut label = String::new();
    let mut i = 0;
    while i < slots.len() {
        let e = slots[i];
        let t = e[0];
        if t == 0 {
            break;
        }
        if t == 0x83 {
            label = utf16(&e[2..2 + (e[1] as usize).min(11) * 2]);
        }
        if t & 0x7F != 0x05 {
            i += 1;
            continue;
        }
        let deleted = t & 0x80 == 0;
        let n = e[1] as usize;
        let set: Vec<&[u8]> = slots.iter().skip(i + 1).take(n).copied().collect();
        let slot = i;
        i += 1 + n;
        if deleted && !deleted_too {
            continue;
        }
        let Some(stream) = set.iter().find(|s| s[0] & 0x7F == 0x40) else { continue };
        let name_len = stream[3] as usize;
        let mut units = Vec::new();
        for s in set.iter().filter(|s| s[0] & 0x7F == 0x41) {
            units.extend_from_slice(&s[2..32]);
        }
        units.truncate(name_len * 2);
        let name = utf16(&units);
        let attrs = u16le(e, 4);
        let dir = attrs & 0x10 != 0;
        let nofat = stream[1] & 0x02 != 0;
        let first = u32le(stream, 20);
        let len = u64le(stream, 24);
        let mut extents = Vec::new();
        if len > 0 {
            for (o, l) in g.runs(vol, first, nofat || deleted, len) {
                push_extent(&mut extents, vol.abs(o) as i64, l);
            }
        }
        let id = if dir { format!("d:{first}:{}:{len}", u8::from(nofat || deleted)) } else { format!("e:{}:{slot}", key.replace(':', "|")) };
        out.push((slot, Entry { name, id, dir, size: if dir { 0 } else { len }, created: ts(u32le(e, 8)), modified: ts(u32le(e, 12)), deleted, resident: None, extents }));
    }
    (out, label)
}

pub(crate) fn list(vol: &Vol, dir: Option<&str>, deleted: bool) -> Result<Listing, String> {
    let g = Geo::new(vol)?;
    let k = key_of(&g, dir)?;
    let bytes = dir_bytes(vol, &g, &k)?;
    let (entries, _) = parse(vol, &g, &bytes, &k.text, deleted);
    let root = k.text == "root";
    Ok(Listing { dir: k.text, parent: None, path: if root { "/".into() } else { String::new() }, entries: entries.into_iter().map(|(_, e)| e).collect() })
}

pub(crate) fn file(vol: &Vol, id: &str) -> Result<Entry, String> {
    let g = Geo::new(vol)?;
    let rest = id.strip_prefix("e:").ok_or_else(|| format!("not a file id: {id}"))?;
    let (k, slot) = rest.rsplit_once(':').ok_or_else(|| format!("not a file id: {id}"))?;
    let k = k.replace('|', ":");
    let slot: usize = slot.parse().map_err(|_| format!("not a file id: {id}"))?;
    let key = key_of(&g, Some(&k))?;
    let bytes = dir_bytes(vol, &g, &key)?;
    let (entries, _) = parse(vol, &g, &bytes, &key.text, true);
    entries.into_iter().find(|(s, _)| *s == slot).map(|(_, e)| e).ok_or_else(|| format!("no entry {id}"))
}

pub(crate) fn info(vol: &Vol) -> Result<Info, String> {
    let g = Geo::new(vol)?;
    let k = key_of(&g, None)?;
    let label = dir_bytes(vol, &g, &k).map(|b| parse(vol, &g, &b, "root", false).1).unwrap_or_default();
    let serial = u32le(&g.boot, 100);
    Ok(Info {
        label,
        serial: format!("{:04X}-{:04X}", serial >> 16, serial & 0xFFFF),
        cluster: g.cs,
        total: u64le(&g.boot, 72) * g.bps,
        sector: g.bps,
        details: vec![
            ("Type".into(), "exFAT".into()),
            ("Revision".into(), format!("{}.{:02}", g.boot[105], g.boot[104])),
            ("FAT offset".into(), format!("{:#x}", g.fat_off)),
            ("Cluster heap".into(), format!("{:#x}", g.heap_off)),
            ("Clusters".into(), g.count.to_string()),
            ("Root cluster".into(), g.root.to_string()),
        ],
    })
}
