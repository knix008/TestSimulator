//! Binary patch files: IPS, IPS32, UPS, BPS (the formats of ROM-hacking tools and Free Hex Editor Neo style
//! "create / apply patch"), and a plain-text difference listing.
//!
//! WIRING (not yet done; for whoever owns lib.rs / engine.rs):
//!   lib.rs:     `pub mod patch;`
//!   engine.rs:  add "patchApply" to `READONLY`, and in `run_readonly`:
//!                   "patchApply" => crate::patch::apply(src, args, progress),
//!               in `call_with` (two documents, like "compare"; NOT read-only of one document):
//!                   "patchCreate" => {
//!                       let a = self.doc(args.u64_req("original")? as u32)?;
//!                       let b = self.doc(args.u64_req("modified")? as u32)?;
//!                       crate::patch::create(a, b, args, progress)
//!                   }
//!
//! CONTRACT
//! `patchCreate({ original: id, modified: id, format: "ips"|"ips32"|"bps"|"ups"|"diff" })`
//!   → `{ data: base64, size, records, format }`
//!   ips:   "PATCH" … "EOF"; 3-byte offsets (an offset above 0xFFFFFF is an error), 2-byte sizes, RLE records for
//!          runs of one byte; a shorter modified file gets the truncation extension (3-byte size after "EOF").
//!   ips32: "IPS32" … "EEOF"; 4-byte offsets; truncation as a 4-byte size after "EEOF".
//!   ups:   "UPS1", sizes as VLQ, XOR hunks, CRC32 of source / target / patch.
//!   bps:   "BPS1", sizes, empty metadata, SourceRead for unchanged runs, TargetRead for changed bytes and
//!          TargetCopy for runs of one byte; CRC32 of source / target / patch.
//!   diff:  UTF-8 text, a line per up to 16 changed bytes: `0000001A: 41 42 -> 43 44` (`(none)` for a side
//!          beyond the end of its file).
//!   records: IPS records / UPS hunks / BPS actions / diff lines.
//! `patchApply({ id, patch: base64, format: "auto"|"ips"|"ips32"|"bps"|"ups", force: false })`
//!   → `{ data: base64, format, size, records, sourceSize, checks: { source_crc_ok, target_crc_ok, patch_crc_ok }, metadata? }`
//!   checks are null for IPS (no checksums). BPS/UPS: a document that is not the patch's source (size or CRC32)
//!   is an error unless `force: true`; so is a corrupted patch (patch CRC32) or a wrong result (target CRC32).
//!   UPS also applies backwards (the document is the patch's target: the result is its source).
//!   Corrupted or truncated patches are errors, never panics.
use crate::doc::Bytes;
use crate::util::{b64, for_each_chunk, Args, Progress, CANCELLED};
use crc::{Crc, CRC_32_ISO_HDLC};
use serde_json::{json, Value};

/// Largest patch result / source held in memory.
const MAX: u64 = 512 << 20;
const CHUNK: usize = 1 << 20;
static CRC32: Crc<u32> = Crc::<u32>::new(&CRC_32_ISO_HDLC);

// ── shared helpers

/// Differing ranges `[start, end)` of positions `[0, total)`. A position beyond a file's end is "absent":
/// with `pad` it counts as a zero byte (UPS), otherwise it differs from any present byte. Ranges separated by
/// at most `merge_gap` equal bytes are joined.
fn diff_runs(a: &dyn Bytes, b: &dyn Bytes, total: u64, pad: bool, merge_gap: u64, progress: &mut Progress) -> Result<Vec<(u64, u64)>, String> {
    let (al, bl) = (a.len(), b.len());
    let mut runs: Vec<(u64, u64)> = Vec::new();
    let (mut ba, mut bb) = (vec![0u8; CHUNK], vec![0u8; CHUNK]);
    let mut run: Option<u64> = None;
    let push = |runs: &mut Vec<(u64, u64)>, s: u64, e: u64| {
        if let Some(last) = runs.last_mut() {
            if s - last.1 <= merge_gap {
                last.1 = e;
                return;
            }
        }
        runs.push((s, e));
    };
    let mut pos = 0u64;
    while pos < total {
        let n = ((total - pos) as usize).min(CHUNK);
        let na = al.saturating_sub(pos).min(n as u64) as usize;
        let nb = bl.saturating_sub(pos).min(n as u64) as usize;
        if na > 0 {
            a.read(pos, &mut ba[..na])?;
        }
        if nb > 0 {
            b.read(pos, &mut bb[..nb])?;
        }
        if na == n && nb == n && ba[..n] == bb[..n] {
            if let Some(s) = run.take() {
                push(&mut runs, s, pos);
            }
        } else {
            for i in 0..n {
                let x = if i < na { Some(ba[i]) } else { None };
                let y = if i < nb { Some(bb[i]) } else { None };
                let same = if pad { x.unwrap_or(0) == y.unwrap_or(0) } else { x == y };
                let at = pos + i as u64;
                match (same, run) {
                    (false, None) => run = Some(at),
                    (true, Some(s)) => {
                        push(&mut runs, s, at);
                        run = None;
                    }
                    _ => {}
                }
            }
        }
        pos += n as u64;
        if runs.len() > (64 << 20) {
            return Err("too many differences for a patch".into());
        }
        if !progress(pos, total) {
            return Err(CANCELLED.into());
        }
    }
    if let Some(s) = run {
        push(&mut runs, s, total);
    }
    Ok(runs)
}

/// `[start, end)` of `src`, zero-filled beyond its end.
fn read_padded(src: &dyn Bytes, start: u64, end: u64) -> Result<Vec<u8>, String> {
    if end - start > MAX {
        return Err(format!("difference too large: {} bytes", end - start));
    }
    let mut v = vec![0u8; (end - start) as usize];
    let have = src.len().clamp(start, end) - start;
    if have > 0 {
        src.read(start, &mut v[..have as usize])?;
    }
    Ok(v)
}

/// The whole document in memory (read in chunks, with progress).
fn read_all(src: &dyn Bytes, progress: &mut Progress) -> Result<Vec<u8>, String> {
    let len = src.len();
    if len > MAX {
        return Err(format!("too large for patching: {len} bytes (at most {MAX})"));
    }
    let mut out = Vec::with_capacity(len as usize);
    for_each_chunk(src, 0, len, CHUNK, progress, |_, c| {
        out.extend_from_slice(c);
        true
    })?;
    Ok(out)
}

fn crc_of(src: &dyn Bytes, progress: &mut Progress) -> Result<u32, String> {
    let mut d = CRC32.digest();
    for_each_chunk(src, 0, src.len(), CHUNK, progress, |_, c| {
        d.update(c);
        true
    })?;
    Ok(d.finalize())
}

/// byuu's variable-length numbers (UPS, BPS).
fn vlq_put(out: &mut Vec<u8>, mut v: u64) {
    loop {
        let x = (v & 0x7F) as u8;
        v >>= 7;
        if v == 0 {
            out.push(0x80 | x);
            break;
        }
        out.push(x);
        v -= 1;
    }
}

struct Reader<'a> {
    p: &'a [u8],
    pos: usize,
    end: usize,
}

impl<'a> Reader<'a> {
    fn byte(&mut self) -> Result<u8, String> {
        if self.pos >= self.end {
            return Err("corrupted patch: unexpected end of data".into());
        }
        self.pos += 1;
        Ok(self.p[self.pos - 1])
    }
    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        if self.end - self.pos < n {
            return Err("corrupted patch: unexpected end of data".into());
        }
        self.pos += n;
        Ok(&self.p[self.pos - n..self.pos])
    }
    fn be(&mut self, n: usize) -> Result<u64, String> {
        Ok(self.take(n)?.iter().fold(0u64, |v, &b| (v << 8) | b as u64))
    }
    fn vlq(&mut self) -> Result<u64, String> {
        let (mut data, mut shift) = (0u64, 1u64);
        for _ in 0..10 {
            let x = self.byte()?;
            data = ((x & 0x7F) as u64).checked_mul(shift).and_then(|v| v.checked_add(data)).ok_or("corrupted patch: number too large")?;
            if x & 0x80 != 0 {
                return Ok(data);
            }
            shift = shift.checked_shl(7).filter(|&s| s != 0 && s < (1u64 << 63)).ok_or("corrupted patch: number too large")?;
            data = data.checked_add(shift).ok_or("corrupted patch: number too large")?;
        }
        Err("corrupted patch: number too large".into())
    }
    fn left(&self) -> usize {
        self.end - self.pos
    }
}

fn crc_footer(p: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([p[at], p[at + 1], p[at + 2], p[at + 3]])
}

fn crc_footer_put(out: &mut Vec<u8>, source: u32, target: u32) {
    out.extend_from_slice(&source.to_le_bytes());
    out.extend_from_slice(&target.to_le_bytes());
    let patch = CRC32.checksum(out);
    out.extend_from_slice(&patch.to_le_bytes());
}

fn check_size(n: u64) -> Result<(), String> {
    if n > MAX {
        Err(format!("patch result too large: {n} bytes (at most {MAX})"))
    } else {
        Ok(())
    }
}

// ── create

pub fn create(a: &dyn Bytes, b: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let format = args.str_or("format", "ips").to_ascii_lowercase();
    let (data, records) = match format.as_str() {
        "ips" => ips_create(a, b, false, progress)?,
        "ips32" => ips_create(a, b, true, progress)?,
        "ups" => ups_create(a, b, progress)?,
        "bps" => bps_create(a, b, progress)?,
        "diff" | "text" => diff_create(a, b, progress)?,
        f => return Err(format!("unknown patch format: {f}")),
    };
    Ok(json!({ "data": b64(&data), "size": data.len(), "records": records, "format": format }))
}

fn ips_create(a: &dyn Bytes, b: &dyn Bytes, wide: bool, progress: &mut Progress) -> Result<(Vec<u8>, u64), String> {
    let (al, bl) = (a.len(), b.len());
    let (width, eof, max_off): (usize, u64, u64) = if wide { (4, 0x4545_4F46, 0xFFFF_FFFF) } else { (3, 0x45_4F46, 0xFF_FFFF) };
    let runs = diff_runs(a, b, bl, false, 5, progress)?;
    let mut out: Vec<u8> = if wide { b"IPS32".to_vec() } else { b"PATCH".to_vec() };
    let mut records = 0u64;
    let put_off = |out: &mut Vec<u8>, off: u64| -> Result<(), String> {
        if off > max_off {
            return Err(format!("{} cannot address offset 0x{off:X} (at most 0x{max_off:X}); use ips32, bps or ups", if wide { "IPS32" } else { "IPS" }));
        }
        out.extend_from_slice(&off.to_be_bytes()[8 - width..]);
        Ok(())
    };
    for (s, e) in runs {
        let mut start = s;
        let mut d = read_padded(b, s, e)?;
        // an offset equal to the end marker would read as the end: start one byte earlier instead
        if start == eof {
            start -= 1;
            let mut prev = [0u8];
            b.read(start, &mut prev)?;
            d.insert(0, prev[0]);
        }
        let mut i = 0usize;
        while i < d.len() {
            // a record would start at the end marker (after a split): rewrite the byte before it too
            let mut min_lit = 0usize;
            if start + i as u64 == eof && i > 0 {
                i -= 1;
                min_lit = 1;
            }
            // a run of one byte here?
            let mut j = i + 1;
            while j < d.len() && d[j] == d[i] && j - i < 0xFFFF {
                j += 1;
            }
            let rep = j - i;
            let edge = i == 0 || j == d.len();
            let at = start + i as u64;
            if (rep >= 14 || (edge && rep >= 9)) && min_lit == 0 {
                put_off(&mut out, at)?;
                out.extend_from_slice(&[0, 0, (rep >> 8) as u8, rep as u8, d[i]]);
                records += 1;
                i = j;
                continue;
            }
            // literal bytes up to the next worthwhile run (or 0xFFFF bytes)
            let mut k = i;
            while k < d.len() && k - i < 0xFFFF {
                let mut r = k + 1;
                while r < d.len() && d[r] == d[k] && r - k < 14 {
                    r += 1;
                }
                if k > i + min_lit && (r - k >= 14 || (r == d.len() && r - k >= 9)) {
                    break;
                }
                k += 1;
            }
            put_off(&mut out, at)?;
            let n = k - i;
            out.extend_from_slice(&[(n >> 8) as u8, n as u8]);
            out.extend_from_slice(&d[i..k]);
            records += 1;
            i = k;
        }
    }
    out.extend_from_slice(if wide { b"EEOF" } else { b"EOF" });
    if bl < al {
        if bl > max_off {
            return Err(format!("IPS cannot record a truncation to {bl} bytes"));
        }
        out.extend_from_slice(&bl.to_be_bytes()[8 - width..]);
    }
    Ok((out, records))
}

fn ups_create(a: &dyn Bytes, b: &dyn Bytes, progress: &mut Progress) -> Result<(Vec<u8>, u64), String> {
    let (al, bl) = (a.len(), b.len());
    let total = al.max(bl);
    let runs = diff_runs(a, b, total, true, 0, progress)?;
    let mut out = b"UPS1".to_vec();
    vlq_put(&mut out, al);
    vlq_put(&mut out, bl);
    let mut pos = 0u64;
    for &(s, e) in &runs {
        vlq_put(&mut out, s - pos);
        let (x, y) = (read_padded(a, s, e)?, read_padded(b, s, e)?);
        out.extend(x.iter().zip(&y).map(|(p, q)| p ^ q));
        out.push(0);
        pos = e + 1;
    }
    let sc = crc_of(a, progress)?;
    let tc = crc_of(b, progress)?;
    crc_footer_put(&mut out, sc, tc);
    Ok((out, runs.len() as u64))
}

fn bps_create(a: &dyn Bytes, b: &dyn Bytes, progress: &mut Progress) -> Result<(Vec<u8>, u64), String> {
    let (al, bl) = (a.len(), b.len());
    let runs = diff_runs(a, b, bl, false, 0, progress)?;
    let mut out = b"BPS1".to_vec();
    vlq_put(&mut out, al);
    vlq_put(&mut out, bl);
    vlq_put(&mut out, 0); // metadata
    let mut actions = 0u64;
    let mut action = |out: &mut Vec<u8>, mode: u64, len: u64| {
        vlq_put(out, ((len - 1) << 2) | mode);
        actions += 1;
    };
    let mut pos = 0u64; // output offset
    let mut target_rel = 0u64; // the decoder's TargetCopy pointer
    for (s, e) in runs {
        if s > pos {
            action(&mut out, 0, s - pos); // SourceRead
        }
        let d = read_padded(b, s, e)?;
        let mut i = 0usize;
        let mut lit = 0usize; // start of pending literal bytes
        while i < d.len() {
            let mut j = i + 1;
            while j < d.len() && d[j] == d[i] {
                j += 1;
            }
            if j - i >= 8 {
                // literal up to and including the run's first byte, then TargetCopy of the rest from it
                let n = i + 1 - lit;
                action(&mut out, 1, n as u64);
                out.extend_from_slice(&d[lit..=i]);
                let from = s + i as u64;
                let rel = from as i128 - target_rel as i128;
                action(&mut out, 3, (j - i - 1) as u64);
                vlq_put(&mut out, ((rel.unsigned_abs() as u64) << 1) | (rel < 0) as u64);
                target_rel = from + (j - i - 1) as u64;
                lit = j;
            }
            i = j;
        }
        if lit < d.len() {
            action(&mut out, 1, (d.len() - lit) as u64); // TargetRead
            out.extend_from_slice(&d[lit..]);
        }
        pos = e;
    }
    if bl > pos {
        action(&mut out, 0, bl - pos);
    }
    let sc = crc_of(a, progress)?;
    let tc = crc_of(b, progress)?;
    crc_footer_put(&mut out, sc, tc);
    Ok((out, actions))
}

fn diff_create(a: &dyn Bytes, b: &dyn Bytes, progress: &mut Progress) -> Result<(Vec<u8>, u64), String> {
    let total = a.len().max(b.len());
    let runs = diff_runs(a, b, total, false, 0, progress)?;
    let mut text = String::new();
    let mut lines = 0u64;
    let side = |src: &dyn Bytes, s: u64, e: u64| -> Result<String, String> {
        let e = e.min(src.len());
        if s >= e {
            return Ok("(none)".into());
        }
        let v = read_padded(src, s, e)?;
        Ok(v.iter().map(|x| format!("{x:02X}")).collect::<Vec<_>>().join(" "))
    };
    for (s, e) in runs {
        let mut p = s;
        while p < e {
            let q = (p + 16).min(e);
            text.push_str(&format!("{p:08X}: {} -> {}\n", side(a, p, q)?, side(b, p, q)?));
            lines += 1;
            if text.len() as u64 > MAX {
                return Err("difference listing too large".into());
            }
            p = q;
        }
    }
    Ok((text.into_bytes(), lines))
}

// ── apply

pub fn apply(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let patch = args.data("patch")?;
    let force = args.bool_or("force", false);
    let format = match args.str_or("format", "auto").to_ascii_lowercase().as_str() {
        "auto" | "" => detect(&patch).ok_or("unknown patch format (expected IPS, IPS32, BPS or UPS)")?.to_string(),
        f @ ("ips" | "ips32" | "bps" | "ups") => f.to_string(),
        f => return Err(format!("unknown patch format: {f}")),
    };
    let r = match format.as_str() {
        "ips" => ips_apply(src, &patch, false, progress)?,
        "ips32" => ips_apply(src, &patch, true, progress)?,
        "ups" => ups_apply(src, &patch, force, progress)?,
        _ => bps_apply(src, &patch, force, progress)?,
    };
    let mut v = json!({
        "data": b64(&r.out), "format": format, "size": r.out.len(), "records": r.records, "sourceSize": src.len(),
        "checks": { "source_crc_ok": r.source_ok, "target_crc_ok": r.target_ok, "patch_crc_ok": r.patch_ok },
    });
    if let Some(m) = r.metadata {
        v["metadata"] = json!(m);
    }
    Ok(v)
}

/// The format from the patch's magic bytes.
pub fn detect(patch: &[u8]) -> Option<&'static str> {
    if patch.starts_with(b"IPS32") {
        Some("ips32")
    } else if patch.starts_with(b"PATCH") {
        Some("ips")
    } else if patch.starts_with(b"BPS1") {
        Some("bps")
    } else if patch.starts_with(b"UPS1") {
        Some("ups")
    } else {
        None
    }
}

struct Applied {
    out: Vec<u8>,
    records: u64,
    source_ok: Option<bool>,
    target_ok: Option<bool>,
    patch_ok: Option<bool>,
    metadata: Option<String>,
}

fn ips_apply(src: &dyn Bytes, p: &[u8], wide: bool, progress: &mut Progress) -> Result<Applied, String> {
    let (magic, eof, width): (&[u8], &[u8], usize) = if wide { (b"IPS32", b"EEOF", 4) } else { (b"PATCH", b"EOF", 3) };
    if !p.starts_with(magic) {
        return Err(format!("not an {} patch", if wide { "IPS32" } else { "IPS" }));
    }
    let mut out = read_all(src, progress)?;
    let mut r = Reader { p, pos: magic.len(), end: p.len() };
    let mut records = 0u64;
    loop {
        if r.left() >= eof.len() && &p[r.pos..r.pos + eof.len()] == eof {
            r.pos += eof.len();
            break;
        }
        if r.left() == 0 {
            return Err("corrupted patch: missing EOF marker".into());
        }
        let off = r.be(width)?;
        let size = r.be(2)?;
        let (len, fill) = if size == 0 { (r.be(2)?, Some(r.byte()?)) } else { (size, None) };
        let end = off + len;
        check_size(end)?;
        if end as usize > out.len() {
            out.resize(end as usize, 0);
        }
        match fill {
            Some(v) => out[off as usize..end as usize].fill(v),
            None => out[off as usize..end as usize].copy_from_slice(r.take(len as usize)?),
        }
        records += 1;
    }
    // truncation extension
    if r.left() == width {
        let n = r.be(width)? as usize;
        if n < out.len() {
            out.truncate(n);
        }
    }
    Ok(Applied { out, records, source_ok: None, target_ok: None, patch_ok: None, metadata: None })
}

/// Size and CRC checks shared by UPS and BPS. Returns (source ok, patch ok).
fn verify_source(src: &dyn Bytes, p: &[u8], source_size: u64, force: bool, progress: &mut Progress) -> Result<(bool, bool, u32), String> {
    let n = p.len();
    let patch_ok = CRC32.checksum(&p[..n - 4]) == crc_footer(p, n - 4);
    if !patch_ok && !force {
        return Err("corrupted patch: its CRC32 does not match (use force to apply anyway)".into());
    }
    let actual = crc_of(src, progress)?;
    let source_ok = src.len() == source_size && actual == crc_footer(p, n - 12);
    Ok((source_ok, patch_ok, actual))
}

fn ups_apply(src: &dyn Bytes, p: &[u8], force: bool, progress: &mut Progress) -> Result<Applied, String> {
    if !p.starts_with(b"UPS1") || p.len() < 4 + 2 + 12 {
        return Err("not a UPS patch".into());
    }
    let n = p.len();
    let mut r = Reader { p, pos: 4, end: n - 12 };
    let a_size = r.vlq()?;
    let b_size = r.vlq()?;
    let (a_crc, b_crc) = (crc_footer(p, n - 12), crc_footer(p, n - 8));
    let (mut source_ok, patch_ok, actual) = verify_source(src, p, a_size, force, progress)?;
    // UPS is symmetric: a document that is the patch's target turns back into its source
    let backward = !source_ok && src.len() == b_size && actual == b_crc;
    if backward {
        source_ok = true;
    }
    if !source_ok && !force {
        return Err(format!(
            "this document is not the patch's source (size {} / CRC32 {actual:08X}; the patch expects size {a_size} / CRC32 {a_crc:08X}); use force to apply anyway",
            src.len()
        ));
    }
    let (out_size, out_crc) = if backward { (a_size, a_crc) } else { (b_size, b_crc) };
    check_size(out_size)?;
    let mut out = vec![0u8; out_size as usize];
    let have = src.len().min(out_size);
    for_each_chunk(src, 0, have, CHUNK, progress, |o, c| {
        out[o as usize..o as usize + c.len()].copy_from_slice(c);
        true
    })?;
    let mut pos = 0u64;
    let mut hunks = 0u64;
    while r.left() > 0 {
        pos = pos.checked_add(r.vlq()?).ok_or("corrupted patch: offset overflow")?;
        loop {
            let x = r.byte()?;
            if pos < out_size {
                out[pos as usize] ^= x;
            }
            pos = pos.checked_add(1).ok_or("corrupted patch: offset overflow")?;
            if x == 0 {
                break;
            }
        }
        hunks += 1;
    }
    let target_ok = CRC32.checksum(&out) == out_crc;
    if !target_ok && !force {
        return Err("the result does not match the patch's target CRC32 (corrupted patch?); use force to apply anyway".into());
    }
    Ok(Applied { out, records: hunks, source_ok: Some(source_ok), target_ok: Some(target_ok), patch_ok: Some(patch_ok), metadata: None })
}

fn bps_apply(src: &dyn Bytes, p: &[u8], force: bool, progress: &mut Progress) -> Result<Applied, String> {
    if !p.starts_with(b"BPS1") || p.len() < 4 + 3 + 12 {
        return Err("not a BPS patch".into());
    }
    let n = p.len();
    let mut r = Reader { p, pos: 4, end: n - 12 };
    let a_size = r.vlq()?;
    let b_size = r.vlq()?;
    let meta_len = r.vlq()?;
    if meta_len > r.left() as u64 {
        return Err("corrupted patch: metadata beyond the end".into());
    }
    let meta = String::from_utf8_lossy(r.take(meta_len as usize)?).into_owned();
    let (source_ok, patch_ok, actual) = verify_source(src, p, a_size, force, progress)?;
    if !source_ok && !force {
        return Err(format!(
            "this document is not the patch's source (size {} / CRC32 {actual:08X}; the patch expects size {a_size} / CRC32 {:08X}); use force to apply anyway",
            src.len(),
            crc_footer(p, n - 12)
        ));
    }
    check_size(b_size)?;
    let src_len = src.len();
    let mut out: Vec<u8> = Vec::with_capacity(b_size.min(64 << 20) as usize);
    let (mut source_rel, mut target_rel) = (0u64, 0u64);
    let mut actions = 0u64;
    let mut buf = vec![0u8; CHUNK];
    let read_src = |out: &mut Vec<u8>, buf: &mut Vec<u8>, from: u64, len: u64| -> Result<(), String> {
        if from.checked_add(len).is_none_or(|e| e > src_len) {
            return Err("corrupted patch (or wrong source): a read beyond the end of the source".into());
        }
        let mut done = 0u64;
        while done < len {
            let k = (len - done).min(CHUNK as u64) as usize;
            src.read(from + done, &mut buf[..k])?;
            out.extend_from_slice(&buf[..k]);
            done += k as u64;
        }
        Ok(())
    };
    let signed = |v: u64| -> i128 { if v & 1 != 0 { -((v >> 1) as i128) } else { (v >> 1) as i128 } };
    while r.left() > 0 {
        let data = r.vlq()?;
        let len = (data >> 2) + 1;
        if out.len() as u64 + len > b_size {
            return Err("corrupted patch: writes beyond the target size".into());
        }
        match data & 3 {
            0 => {
                let at = out.len() as u64;
                read_src(&mut out, &mut buf, at, len)?
            }
            1 => out.extend_from_slice(r.take(len as usize)?),
            2 => {
                let at = source_rel as i128 + signed(r.vlq()?);
                if at < 0 {
                    return Err("corrupted patch: SourceCopy before the start".into());
                }
                read_src(&mut out, &mut buf, at as u64, len)?;
                source_rel = at as u64 + len;
            }
            _ => {
                let at = target_rel as i128 + signed(r.vlq()?);
                if at < 0 || at as u64 >= out.len() as u64 {
                    return Err("corrupted patch: TargetCopy outside the written output".into());
                }
                let mut from = at as usize;
                for _ in 0..len {
                    let v = out[from];
                    out.push(v);
                    from += 1;
                }
                target_rel = from as u64;
            }
        }
        actions += 1;
        if actions.is_multiple_of(4096) && !progress(out.len() as u64, b_size) {
            return Err(CANCELLED.into());
        }
    }
    if (out.len() as u64) != b_size && !force {
        return Err(format!("corrupted patch: produced {} bytes, the target is {b_size}", out.len()));
    }
    out.resize(b_size as usize, 0);
    let target_ok = CRC32.checksum(&out) == crc_footer(p, n - 8);
    if !target_ok && !force {
        return Err("the result does not match the patch's target CRC32 (corrupted patch?); use force to apply anyway".into());
    }
    Ok(Applied { out, records: actions, source_ok: Some(source_ok), target_ok: Some(target_ok), patch_ok: Some(patch_ok), metadata: Some(meta) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::{no_progress, unb64};

    fn mk(a: &[u8], b: &[u8], fmt: &str) -> Vec<u8> {
        let r = create(&a.to_vec(), &b.to_vec(), &json!({ "format": fmt }), &mut no_progress()).unwrap();
        let d = unb64(r["data"].as_str().unwrap()).unwrap();
        assert_eq!(r["size"].as_u64().unwrap() as usize, d.len());
        d
    }

    fn ap(src: &[u8], patch: &[u8], fmt: &str, force: bool) -> Result<(Vec<u8>, Value), String> {
        let r = apply(&src.to_vec(), &json!({ "patch": b64(patch), "format": fmt, "force": force }), &mut no_progress())?;
        Ok((unb64(r["data"].as_str().unwrap()).unwrap(), r))
    }

    fn pairs() -> Vec<(Vec<u8>, Vec<u8>)> {
        let base: Vec<u8> = (0..3000u32).map(|i| (i * 7 + i / 13) as u8).collect();
        let mut small = base.clone();
        small[100] ^= 0xFF;
        small[101] = 0;
        let mut first = base.clone();
        first[0] = !first[0];
        let mut last = base.clone();
        *last.last_mut().unwrap() ^= 1;
        let mut longer = base.clone();
        longer.extend_from_slice(&[0u8; 40]);
        longer.extend_from_slice(b"tail");
        let shorter = base[..1234].to_vec();
        let mut runs = base.clone();
        runs[500..900].fill(0xAA); // RLE / TargetCopy
        runs[1000..1010].fill(0);
        let mut scattered = base.clone();
        for i in (0..3000).step_by(37) {
            scattered[i] = scattered[i].wrapping_add(1);
        }
        let mut shorter_changed = base[..2000].to_vec();
        shorter_changed[0] = 1;
        shorter_changed[1999] = 2;
        vec![
            (base.clone(), base.clone()),
            (base.clone(), small),
            (base.clone(), first),
            (base.clone(), last),
            (base.clone(), longer),
            (base.clone(), shorter),
            (base.clone(), runs),
            (base.clone(), scattered),
            (base.clone(), shorter_changed),
            (Vec::new(), b"from nothing".to_vec()),
            (b"to nothing".to_vec(), Vec::new()),
            (Vec::new(), Vec::new()),
        ]
    }

    #[test]
    fn round_trip_every_format() {
        for fmt in ["ips", "ips32", "ups", "bps"] {
            for (i, (a, b)) in pairs().iter().enumerate() {
                let p = mk(a, b, fmt);
                let (out, r) = ap(a, &p, "auto", false).unwrap_or_else(|e| panic!("{fmt} pair {i}: {e}"));
                assert_eq!(&out, b, "{fmt} pair {i}");
                assert_eq!(r["format"], fmt);
                if fmt == "ups" || fmt == "bps" {
                    assert_eq!(r["checks"]["source_crc_ok"], true);
                    assert_eq!(r["checks"]["target_crc_ok"], true);
                    assert_eq!(r["checks"]["patch_crc_ok"], true);
                } else {
                    assert!(r["checks"]["source_crc_ok"].is_null());
                }
            }
        }
    }

    #[test]
    fn ups_applies_backwards() {
        for (a, b) in pairs() {
            if a == b {
                continue;
            }
            let p = mk(&a, &b, "ups");
            assert_eq!(ap(&b, &p, "ups", false).unwrap().0, a);
        }
    }

    #[test]
    fn equal_files_give_empty_patches() {
        let a = b"same bytes".to_vec();
        assert_eq!(mk(&a, &a, "ips"), b"PATCHEOF");
        assert_eq!(mk(&a, &a, "ips32"), b"IPS32EEOF");
        assert!(mk(&a, &a, "diff").is_empty());
    }

    #[test]
    fn ips_uses_rle_and_truncation() {
        let a = vec![1u8; 100];
        let mut b = a.clone();
        b[10..60].fill(7);
        let p = mk(&a, &b, "ips");
        // PATCH, one RLE record at 10: 00 00 0A | 00 00 | 00 32 | 07, EOF
        assert_eq!(p, [b"PATCH".as_slice(), &[0, 0, 10, 0, 0, 0, 50, 7], b"EOF"].concat());
        let p = mk(&a, &a[..40].to_vec(), "ips");
        assert_eq!(p, [b"PATCH".as_slice(), b"EOF", &[0, 0, 40]].concat());
    }

    #[test]
    fn ips_record_at_the_eof_offset() {
        let a = vec![0u8; 0x45_4F50];
        let mut b = a.clone();
        b[0x45_4F46] = 9;
        let p = mk(&a, &b, "ips");
        assert_eq!(&p[5..8], &[0x45, 0x4F, 0x45]); // moved one byte earlier
        assert_eq!(ap(&a, &p, "ips", false).unwrap().0, b);
        // an RLE record ending right at the marker: the literal after it starts one byte earlier
        let mut b = a.clone();
        b[0x45_4F36..0x45_4F46].fill(0xAA);
        b[0x45_4F46] = 1;
        b[0x45_4F47] = 2;
        let p = mk(&a, &b, "ips");
        assert_eq!(ap(&a, &p, "ips", false).unwrap().0, b);
        assert_eq!(p, [b"PATCH".as_slice(), &[0x45, 0x4F, 0x36, 0, 0, 0, 16, 0xAA], &[0x45, 0x4F, 0x45, 0, 3, 0xAA, 1, 2], b"EOF"].concat());
    }

    #[test]
    fn ips_refuses_offsets_beyond_16_mib() {
        let a = vec![0u8; 0x100_0010];
        let mut b = a.clone();
        b[0x100_0005] = 1;
        let e = create(&a, &b, &json!({ "format": "ips" }), &mut no_progress()).unwrap_err();
        assert!(e.contains("cannot address"), "{e}");
        let p = mk(&a, &b, "ips32");
        assert_eq!(ap(&a, &p, "auto", false).unwrap().0, b);
    }

    #[test]
    fn hand_made_ips() {
        // write "HI" at 2, RLE 3 × 'z' at 6, extend to 10 with "!" at 9, then truncate to 9
        let p = [b"PATCH".as_slice(), &[0, 0, 2, 0, 2], b"HI", &[0, 0, 6, 0, 0, 0, 3, b'z'], &[0, 0, 9, 0, 1, b'!'], b"EOF"].concat();
        let (out, r) = ap(b"abcdefgh", &p, "auto", false).unwrap();
        assert_eq!(out, b"abHIefzzz!");
        assert_eq!(r["records"], 3);
        let with_trunc = [p.as_slice(), &[0, 0, 4]].concat();
        assert_eq!(ap(b"abcdefgh", &with_trunc, "ips", false).unwrap().0, b"abHI");
    }

    fn bps_raw(a: &[u8], target: &[u8], body: &[u8]) -> Vec<u8> {
        let mut p = b"BPS1".to_vec();
        vlq_put(&mut p, a.len() as u64);
        vlq_put(&mut p, target.len() as u64);
        vlq_put(&mut p, 4);
        p.extend_from_slice(b"meta");
        p.extend_from_slice(body);
        crc_footer_put(&mut p, CRC32.checksum(a), CRC32.checksum(target));
        p
    }

    #[test]
    fn hand_made_bps_with_copies() {
        let a = b"Hello, World".to_vec();
        let target = b"World, Hello!!!!!!".to_vec();
        let mut body = Vec::new();
        let act = |body: &mut Vec<u8>, mode: u64, len: u64| vlq_put(body, ((len - 1) << 2) | mode);
        // SourceCopy "World" from source offset 7 (+7)
        act(&mut body, 2, 5);
        vlq_put(&mut body, 7 << 1);
        // SourceCopy ", " from 5: source_rel is 12 → -7
        act(&mut body, 2, 2);
        vlq_put(&mut body, (7 << 1) | 1);
        // SourceCopy "Hello" from 0: source_rel is 7 → -7
        act(&mut body, 2, 5);
        vlq_put(&mut body, (7 << 1) | 1);
        // TargetRead "!"
        act(&mut body, 1, 1);
        body.push(b'!');
        // TargetCopy 5 × from output offset 12 (overlapping copy)
        act(&mut body, 3, 5);
        vlq_put(&mut body, 12 << 1);
        let p = bps_raw(&a, &target, &body);
        let (out, r) = ap(&a, &p, "auto", false).unwrap();
        assert_eq!(out, target);
        assert_eq!(r["records"], 5);
        assert_eq!(r["metadata"], "meta");
        assert_eq!(r["checks"]["target_crc_ok"], true);
        // SourceRead on a fresh pair
        let mut body = Vec::new();
        act(&mut body, 0, 5);
        act(&mut body, 1, 1);
        body.push(b'?');
        assert_eq!(ap(&a, &bps_raw(&a, b"Hello?", &body), "bps", false).unwrap().0, b"Hello?");
    }

    #[test]
    fn wrong_source_is_an_error_unless_forced() {
        let a = b"original data here".to_vec();
        let b = b"modified data here".to_vec();
        let other = b"something else entirely".to_vec();
        for fmt in ["bps", "ups"] {
            let p = mk(&a, &b, fmt);
            let e = ap(&other, &p, fmt, false).unwrap_err();
            assert!(e.contains("not the patch's source"), "{fmt}: {e}");
            let (_, r) = ap(&b"original data herE".to_vec(), &p, fmt, true).unwrap();
            assert_eq!(r["checks"]["source_crc_ok"], false);
        }
    }

    #[test]
    fn corrupted_patches_are_errors() {
        let a: Vec<u8> = (0..200u8).collect();
        let mut b = a.clone();
        b[50..70].fill(3);
        b.extend_from_slice(b"more");
        for fmt in ["ips", "ips32", "ups", "bps"] {
            let p = mk(&a, &b, fmt);
            // every truncation and many single-byte corruptions: an error or a result, never a panic
            for cut in 0..p.len() {
                let _ = ap(&a, &p[..cut], fmt, false);
                let _ = ap(&a, &p[..cut], fmt, true);
            }
            for i in 0..p.len() {
                for v in [0u8, 0xFF, p[i] ^ 0x80] {
                    let mut q = p.clone();
                    q[i] = v;
                    let _ = ap(&a, &q, fmt, false);
                    let _ = ap(&a, &q, fmt, true);
                }
            }
            if fmt == "ups" || fmt == "bps" {
                let mut q = p.clone();
                let mid = q.len() / 2;
                q[mid] ^= 0x55;
                assert!(ap(&a, &q, fmt, false).unwrap_err().contains("corrupted"), "{fmt}");
            }
        }
        assert!(ap(&a, b"PATCH\x00\x00", "ips", false).is_err());
        assert!(ap(&a, b"PATCH", "ips", false).unwrap_err().contains("EOF"));
        assert!(ap(&a, b"garbage", "auto", false).unwrap_err().contains("unknown patch format"));
        assert!(ap(&a, b"BPS1", "bps", false).is_err());
        assert!(ap(&a, b"UPS1\xff", "ups", false).is_err());
        // huge declared sizes do not allocate
        let mut huge = b"BPS1".to_vec();
        vlq_put(&mut huge, a.len() as u64);
        vlq_put(&mut huge, 1 << 60);
        vlq_put(&mut huge, 0);
        crc_footer_put(&mut huge, CRC32.checksum(&a), 0);
        assert!(ap(&a, &huge, "bps", false).unwrap_err().contains("too large"));
    }

    #[test]
    fn diff_listing() {
        let t = String::from_utf8(mk(b"abcdef", b"abXYefgh", "diff")).unwrap();
        assert_eq!(t, "00000002: 63 64 -> 58 59\n00000006: (none) -> 67 68\n");
        let t = String::from_utf8(mk(b"abcdef", b"abc", "diff")).unwrap();
        assert_eq!(t, "00000003: 64 65 66 -> (none)\n");
        let a = vec![0u8; 40];
        let b = vec![1u8; 40];
        let r = create(&a, &b, &json!({ "format": "diff" }), &mut no_progress()).unwrap();
        assert_eq!(r["records"], 3);
    }

    #[test]
    fn multi_chunk_inputs() {
        let a: Vec<u8> = (0..(3 * CHUNK + 77) as u32).map(|i| (i % 251) as u8).collect();
        let mut b = a.clone();
        b[CHUNK - 1] = 0xEE; // across a chunk boundary
        b[CHUNK] = 0xEE;
        b[2 * CHUNK + 5] ^= 3;
        b.truncate(3 * CHUNK + 10);
        for fmt in ["ips32", "ups", "bps"] {
            let p = mk(&a, &b, fmt);
            assert!(p.len() < 200, "{fmt}: {}", p.len()); // UPS also carries the 67 dropped bytes (XOR)
            assert_eq!(ap(&a, &p, "auto", false).unwrap().0, b, "{fmt}");
        }
    }
}
