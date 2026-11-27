//! ext2 / ext3 / ext4: superblock, group descriptors (32 / 64-bit), inodes, extent trees and classic block maps,
//! inline data, linear directories (htree directories read linearly), deleted entries found in record slack.
//! ids: inode numbers (root "2").
use super::{assemble, push_extent, u16le, u32le, unix_text, Entry, Info, Listing, Vol};

struct Geo {
    bs: u64,
    ipg: u64,
    inode_size: u64,
    first_block: u64,
    desc_size: u64,
    inodes: u64,
    blocks: u64,
    incompat: u32,
    sb: Vec<u8>,
}

struct Inode {
    mode: u16,
    size: u64,
    links: u16,
    dtime: u32,
    flags: u32,
    block: Vec<u8>,
    ctime: u32,
    mtime: u32,
    crtime: Option<u32>,
}

impl Geo {
    fn new(vol: &Vol) -> Result<Geo, String> {
        let sb = vol.read(1024, 1024)?;
        if u16le(&sb, 56) != 0xEF53 {
            return Err("ext: no superblock".into());
        }
        let log = u32le(&sb, 24);
        if log > 6 {
            return Err("ext: bad block size".into());
        }
        let bs = 1024u64 << log;
        let incompat = u32le(&sb, 96);
        let is64 = incompat & 0x80 != 0;
        let inode_size = if u32le(&sb, 76) >= 1 { u16le(&sb, 88) as u64 } else { 128 };
        let desc_size = if is64 { (u16le(&sb, 0xFE) as u64).max(32) } else { 32 };
        let blocks = u32le(&sb, 4) as u64 | if is64 { (u32le(&sb, 0x150) as u64) << 32 } else { 0 };
        let ipg = u32le(&sb, 40) as u64;
        if ipg == 0 || !(128..=4096).contains(&inode_size) {
            return Err("ext: bad inode geometry".into());
        }
        Ok(Geo { bs, ipg, inode_size, first_block: u32le(&sb, 20) as u64, desc_size, inodes: u32le(&sb, 0) as u64, blocks, incompat, sb })
    }

    fn inode(&self, vol: &Vol, n: u64) -> Result<Inode, String> {
        if n == 0 || n > self.inodes {
            return Err(format!("inode {n} is outside the volume"));
        }
        let group = (n - 1) / self.ipg;
        let index = (n - 1) % self.ipg;
        let gdt = (self.first_block + 1) * self.bs;
        let desc = vol.read(gdt + group * self.desc_size, self.desc_size as usize)?;
        let table = u32le(&desc, 8) as u64 | if self.desc_size >= 64 { (u32le(&desc, 0x28) as u64) << 32 } else { 0 };
        let b = vol.read(table * self.bs + index * self.inode_size, self.inode_size as usize)?;
        let extra = if self.inode_size > 128 { u16le(&b, 128) as usize } else { 0 };
        Ok(Inode {
            mode: u16le(&b, 0),
            size: u32le(&b, 4) as u64 | (u32le(&b, 108) as u64) << 32,
            links: u16le(&b, 26),
            dtime: u32le(&b, 20),
            flags: u32le(&b, 32),
            block: b[40..100].to_vec(),
            ctime: u32le(&b, 12),
            mtime: u32le(&b, 16),
            crtime: if extra >= 24 { Some(u32le(&b, 144)) } else { None },
        })
    }

    fn block_ok(&self, b: u64) -> bool {
        b > 0 && b < self.blocks.max(1)
    }

    /// The data of an inode: (physical block or -1, count) in file order.
    fn runs(&self, vol: &Vol, ino: &Inode) -> Vec<(i64, u64)> {
        let need = ino.size.div_ceil(self.bs).min(1 << 24);
        let mut out: Vec<(i64, u64)> = Vec::new();
        if ino.flags & 0x80000 != 0 {
            let mut leaves: Vec<(u64, u64, u64)> = Vec::new();
            self.extent_node(vol, &ino.block, 0, &mut leaves);
            leaves.sort_by_key(|l| l.0);
            let mut at = 0u64;
            for (lb, start, len) in leaves {
                if lb >= need {
                    break;
                }
                if lb > at {
                    out.push((-1, lb - at));
                }
                let len = len.min(need - lb);
                out.push((start as i64, len));
                at = lb + len;
            }
            if at < need {
                out.push((-1, need - at));
            }
            return out;
        }
        let ptrs: Vec<u64> = (0..15).map(|i| u32le(&ino.block, i * 4) as u64).collect();
        let mut list: Vec<u64> = Vec::new();
        for &p in &ptrs[0..12] {
            if list.len() as u64 >= need {
                break;
            }
            list.push(p);
        }
        for (level, &p) in ptrs[12..15].iter().enumerate() {
            if list.len() as u64 >= need {
                break;
            }
            self.indirect(vol, p, level as u32, need, &mut list);
        }
        list.truncate(need as usize);
        for b in list {
            let v = if self.block_ok(b) { b as i64 } else { -1 };
            match out.last_mut() {
                Some(last) if (v < 0 && last.0 < 0) || (v >= 0 && last.0 >= 0 && last.0 + last.1 as i64 == v) => last.1 += 1,
                _ => out.push((v, 1)),
            }
        }
        out
    }

    fn indirect(&self, vol: &Vol, block: u64, level: u32, need: u64, list: &mut Vec<u64>) {
        let per = self.bs / 4;
        if !self.block_ok(block) {
            // A hole of all the blocks this pointer covers.
            let n = per.pow(level + 1).min(need.saturating_sub(list.len() as u64));
            list.extend(std::iter::repeat_n(0, n as usize));
            return;
        }
        let Ok(b) = vol.read(block * self.bs, self.bs as usize) else { return };
        for i in 0..per as usize {
            if list.len() as u64 >= need {
                return;
            }
            let p = u32le(&b, i * 4) as u64;
            if level == 0 { list.push(p) } else { self.indirect(vol, p, level - 1, need, list) }
        }
    }

    fn extent_node(&self, vol: &Vol, node: &[u8], depth: u32, out: &mut Vec<(u64, u64, u64)>) {
        if depth > 6 || u16le(node, 0) != 0xF30A || out.len() > 100_000 {
            return;
        }
        let entries = u16le(node, 2) as usize;
        let level = u16le(node, 6);
        for i in 0..entries {
            let e = 12 + i * 12;
            if e + 12 > node.len() {
                break;
            }
            if level == 0 {
                let mut len = u16le(node, e + 4) as u64;
                if len > 32768 {
                    len -= 32768;
                }
                let start = (u16le(node, e + 6) as u64) << 32 | u32le(node, e + 8) as u64;
                out.push((u32le(node, e) as u64, start, len));
            } else {
                let child = (u16le(node, e + 8) as u64) << 32 | u32le(node, e + 4) as u64;
                if !self.block_ok(child) {
                    continue;
                }
                if let Ok(b) = vol.read(child * self.bs, self.bs as usize) {
                    self.extent_node(vol, &b, depth + 1, out);
                }
            }
        }
    }

    fn entry(&self, vol: &Vol, n: u64, name: String, deleted: bool) -> Entry {
        let Ok(ino) = self.inode(vol, n) else {
            return Entry { name, id: n.to_string(), deleted, ..Default::default() };
        };
        let dir = ino.mode & 0xF000 == 0x4000;
        let resident = if ino.flags & 0x1000_0000 != 0 || (ino.mode & 0xF000 == 0xA000 && ino.size < 60 && ino.flags & 0x80000 == 0) {
            Some(ino.block[..(ino.size as usize).min(60)].to_vec())
        } else {
            None
        };
        let mut extents = Vec::new();
        if resident.is_none() && ino.size > 0 && !dir {
            for (b, c) in self.runs(vol, &ino) {
                push_extent(&mut extents, if b < 0 { -1 } else { vol.abs(b as u64 * self.bs) as i64 }, c * self.bs);
            }
        }
        Entry {
            name,
            id: n.to_string(),
            dir,
            size: if dir { 0 } else { ino.size },
            created: unix_text(ino.crtime.unwrap_or(ino.ctime) as i64),
            modified: unix_text(ino.mtime as i64),
            deleted: deleted || ino.dtime != 0 || ino.links == 0,
            resident,
            extents,
        }
    }

    /// (live entries (inode, name), deleted entries, parent inode)
    fn dir_entries(&self, vol: &Vol, n: u64) -> Result<(Vec<(u64, String)>, Vec<(u64, String)>, Option<u64>), String> {
        let ino = self.inode(vol, n)?;
        if ino.mode & 0xF000 != 0x4000 {
            return Err(format!("inode {n} is not a directory"));
        }
        let mut e = Entry { size: ino.size.min(8 << 20), ..Default::default() };
        for (b, c) in self.runs(vol, &ino) {
            push_extent(&mut e.extents, if b < 0 { -1 } else { vol.abs(b as u64 * self.bs) as i64 }, c * self.bs);
        }
        let data = assemble(vol.src, &e)?;
        let filetype = self.incompat & 0x2 != 0;
        let name_at = |pos: usize, len: usize| -> String { String::from_utf8_lossy(&data[pos + 8..pos + 8 + len]).into_owned() };
        let (mut live, mut gone, mut parent) = (Vec::new(), Vec::new(), None);
        let mut pos = 0usize;
        while pos + 8 <= data.len() {
            let inode = u32le(&data, pos) as u64;
            let rec = u16le(&data, pos + 4) as usize;
            let name_len = if filetype { data[pos + 6] as usize } else { u16le(&data, pos + 6) as usize };
            if rec < 8 || pos + rec > data.len() || rec % 4 != 0 {
                pos = (pos / self.bs as usize + 1) * self.bs as usize;
                continue;
            }
            if name_len > 0 && pos + 8 + name_len <= pos + rec {
                let name = name_at(pos, name_len);
                if name == ".." {
                    parent = Some(inode);
                } else if name != "." {
                    if inode != 0 { live.push((inode, name)) } else { gone.push((0, name)) }
                }
            }
            // Slack after this entry: entries removed from the directory often stay there.
            let ideal = (8 + name_len + 3) & !3;
            let mut s = pos + ideal;
            while s + 12 <= pos + rec {
                let ino2 = u32le(&data, s) as u64;
                let nl = if filetype { data[s + 6] as usize } else { u16le(&data, s + 6) as usize };
                if ino2 != 0 && ino2 <= self.inodes && nl > 0 && s + 8 + nl <= pos + rec {
                    let name = name_at(s, nl);
                    if name.chars().all(|c| !c.is_control()) && name != "." && name != ".." {
                        gone.push((ino2, name));
                        s += (8 + nl + 3) & !3;
                        continue;
                    }
                }
                s += 4;
            }
            pos += rec;
        }
        Ok((live, gone, parent))
    }
}

fn inode_of(dir: Option<&str>) -> Result<u64, String> {
    match dir {
        None | Some("") | Some("root") => Ok(2),
        Some(d) => d.parse().map_err(|_| format!("not an inode number: {d}")),
    }
}

pub(crate) fn list(vol: &Vol, _kind: u8, dir: Option<&str>, deleted: bool) -> Result<Listing, String> {
    let g = Geo::new(vol)?;
    let n = inode_of(dir)?;
    let (live, gone, parent) = g.dir_entries(vol, n)?;
    let mut entries: Vec<Entry> = live.into_iter().map(|(i, name)| g.entry(vol, i, name, false)).collect();
    if deleted {
        for (i, name) in gone {
            let mut e = if i == 0 { Entry { name, id: String::new(), deleted: true, ..Default::default() } } else { g.entry(vol, i, name, true) };
            e.deleted = true;
            entries.push(e);
        }
    }
    let mut path = String::new();
    if n == 2 {
        path.push('/');
    } else {
        let mut names = Vec::new();
        let (mut cur, mut up) = (n, parent);
        for _ in 0..32 {
            let Some(p) = up else { break };
            let Ok((pl, _, pp)) = g.dir_entries(vol, p) else { break };
            names.push(pl.iter().find(|(i, _)| *i == cur).map(|(_, s)| s.clone()).unwrap_or_else(|| format!("[{cur}]")));
            if p == 2 || p == cur {
                break;
            }
            cur = p;
            up = pp;
        }
        names.reverse();
        path = format!("/{}", names.join("/"));
    }
    Ok(Listing { dir: n.to_string(), parent: if n == 2 { None } else { parent.map(|p| p.to_string()) }, path, entries })
}

pub(crate) fn file(vol: &Vol, _kind: u8, id: &str) -> Result<Entry, String> {
    let g = Geo::new(vol)?;
    let n: u64 = id.parse().map_err(|_| format!("not an inode number: {id}"))?;
    g.inode(vol, n)?;
    Ok(g.entry(vol, n, format!("inode {n}"), false))
}

pub(crate) fn info(vol: &Vol, kind: u8) -> Result<Info, String> {
    let g = Geo::new(vol)?;
    let label = String::from_utf8_lossy(&g.sb[120..136]).trim_end_matches('\0').trim().to_string();
    let u = &g.sb[104..120];
    let uuid = format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10], u[11], u[12], u[13], u[14], u[15]
    );
    Ok(Info {
        label,
        serial: uuid,
        cluster: g.bs,
        total: g.blocks * g.bs,
        sector: 512,
        details: vec![
            ("Type".into(), format!("ext{kind}")),
            ("Revision".into(), u32le(&g.sb, 76).to_string()),
            ("Inodes".into(), g.inodes.to_string()),
            ("Blocks".into(), g.blocks.to_string()),
            ("Inodes per group".into(), g.ipg.to_string()),
            ("Inode size".into(), g.inode_size.to_string()),
            ("Features (compat / incompat / ro)".into(), format!("{:#x} / {:#x} / {:#x}", u32le(&g.sb, 92), g.incompat, u32le(&g.sb, 100))),
            ("Last mounted on".into(), String::from_utf8_lossy(&g.sb[136..200]).trim_end_matches('\0').to_string()),
        ],
    })
}
