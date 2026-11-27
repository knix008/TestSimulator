//! Differences between two documents.
//!
//! CONTRACT
//! `compare(a, b, {mode: "bytes"|"sync", limit: 100000}, progress)` →
//!   `{ equal, aLen, bLen, diffs: [{ kind: "change"|"insert"|"delete", aOffset, aLength, bOffset, bLength }], truncated,
//!      differentBytes, mode, fallback }`
//!   "bytes": position by position (runs of different bytes are one diff; the longer file's tail is insert/delete).
//!   "sync": finds inserted / deleted bytes too: the common start and end are skipped, then a Myers diff on the bytes
//!   between when both are at most 4 MiB and they differ by at most 2500 edits; otherwise it falls back to "bytes"
//!   (`fallback: true`).
//!   "insert": bytes only in b (aLength 0, at aOffset in a); "delete": bytes only in a; "change": a's bytes replaced by b's.
//!   differentBytes: the bytes of a in diffs (for a pure insertion: the bytes inserted in b).
use crate::doc::Bytes;
use crate::util::{Args, Progress, CANCELLED};
use serde_json::{json, Value};

const SYNC_MAX: u64 = 4 << 20;
const MAX_EDITS: usize = 2500;

#[derive(Clone, Copy, Debug, PartialEq)]
struct Diff {
    a_off: u64,
    a_len: u64,
    b_off: u64,
    b_len: u64,
}

impl Diff {
    fn kind(&self) -> &'static str {
        match (self.a_len, self.b_len) {
            (0, _) => "insert",
            (_, 0) => "delete",
            _ => "change",
        }
    }
}

fn bytes_mode(a: &dyn Bytes, b: &dyn Bytes, limit: usize, progress: &mut Progress) -> Result<(Vec<Diff>, bool), String> {
    const CHUNK: usize = 1 << 20;
    let (al, bl) = (a.len(), b.len());
    let common = al.min(bl);
    let mut diffs: Vec<Diff> = Vec::new();
    let mut truncated = false;
    let (mut ba, mut bb) = (vec![0u8; CHUNK], vec![0u8; CHUNK]);
    let mut pos = 0u64;
    let mut run: Option<u64> = None;
    let push = |diffs: &mut Vec<Diff>, s: u64, e: u64| diffs.push(Diff { a_off: s, a_len: e - s, b_off: s, b_len: e - s });
    'outer: while pos < common {
        let n = ((common - pos) as usize).min(CHUNK);
        a.read(pos, &mut ba[..n])?;
        b.read(pos, &mut bb[..n])?;
        if ba[..n] == bb[..n] {
            if let Some(s) = run.take() {
                push(&mut diffs, s, pos);
            }
        } else {
            for i in 0..n {
                let same = ba[i] == bb[i];
                let at = pos + i as u64;
                match (same, run) {
                    (false, None) => run = Some(at),
                    (true, Some(s)) => {
                        push(&mut diffs, s, at);
                        run = None;
                        if diffs.len() >= limit {
                            truncated = true;
                            break 'outer;
                        }
                    }
                    _ => {}
                }
            }
        }
        pos += n as u64;
        if !progress(pos, common) {
            return Err(CANCELLED.into());
        }
    }
    if !truncated {
        if let Some(s) = run {
            push(&mut diffs, s, common);
        }
        if al > bl {
            diffs.push(Diff { a_off: bl, a_len: al - bl, b_off: bl, b_len: 0 });
        } else if bl > al {
            diffs.push(Diff { a_off: al, a_len: 0, b_off: al, b_len: bl - al });
        }
        // a run reaching the end joins the tail into one change
        if diffs.len() >= 2 {
            let n = diffs.len();
            let (p, q) = (diffs[n - 2], diffs[n - 1]);
            if p.a_off + p.a_len == q.a_off && p.b_off + p.b_len == q.b_off && p.a_len > 0 && p.b_len > 0 {
                diffs[n - 2] = Diff { a_off: p.a_off, a_len: p.a_len + q.a_len, b_off: p.b_off, b_len: p.b_len + q.b_len };
                diffs.pop();
            }
        }
        if diffs.len() > limit {
            diffs.truncate(limit);
            truncated = true;
        }
    }
    Ok((diffs, truncated))
}

/// Myers' greedy diff of `x` and `y`: the edit script as runs relative to the slices, or None when more than
/// `max` edits are needed. Before step d it keeps v[k] for k in [-d-1, d+1] (what step d reads) to walk back.
fn myers(x: &[u8], y: &[u8], max: usize) -> Option<Vec<Diff>> {
    let (n, m) = (x.len() as isize, y.len() as isize);
    let max = (max as isize).min(n + m);
    let off = max + 2;
    let mut v = vec![0isize; (2 * off + 1) as usize];
    let mut trace: Vec<Vec<isize>> = Vec::new();
    let mut found = None;
    'search: for d in 0..=max {
        trace.push(v[(off - d - 1) as usize..=(off + d + 1) as usize].to_vec());
        let mut k = -d;
        while k <= d {
            let i = (k + off) as usize;
            let mut px = if k == -d || (k != d && v[i - 1] < v[i + 1]) { v[i + 1] } else { v[i - 1] + 1 };
            let mut py = px - k;
            while px < n && py < m && x[px as usize] == y[py as usize] {
                px += 1;
                py += 1;
            }
            v[i] = px;
            if px >= n && py >= m {
                found = Some(d);
                break 'search;
            }
            k += 2;
        }
    }
    let d_end = found?;
    let mut edits: Vec<(bool, isize, isize)> = Vec::new(); // (insert?, x, y) of each one-byte edit
    let (mut cx, mut cy) = (n, m);
    for d in (1..=d_end).rev() {
        let s = &trace[d as usize];
        let get = |k: isize| s[(k + d + 1) as usize];
        let k = cx - cy;
        let insert = k == -d || (k != d && get(k - 1) < get(k + 1));
        let pk = if insert { k + 1 } else { k - 1 };
        let px = get(pk);
        let py = px - pk;
        edits.push((insert, px, py));
        cx = px;
        cy = py;
    }
    edits.reverse();
    let mut runs: Vec<Diff> = Vec::new();
    for (insert, ex, ey) in edits {
        let (ao, bo) = (ex as u64, ey as u64);
        let (al, bl) = if insert { (0, 1) } else { (1, 0) };
        match runs.last_mut() {
            Some(r) if r.a_off + r.a_len == ao && r.b_off + r.b_len == bo => {
                r.a_len += al;
                r.b_len += bl;
            }
            _ => runs.push(Diff { a_off: ao, a_len: al, b_off: bo, b_len: bl }),
        }
    }
    Some(runs)
}

fn sync_mode(a: &dyn Bytes, b: &dyn Bytes, limit: usize, progress: &mut Progress) -> Result<Option<(Vec<Diff>, bool)>, String> {
    let (al, bl) = (a.len(), b.len());
    if al > SYNC_MAX || bl > SYNC_MAX {
        return Ok(None);
    }
    let mut x = vec![0u8; al as usize];
    let mut y = vec![0u8; bl as usize];
    a.read(0, &mut x)?;
    b.read(0, &mut y)?;
    if !progress(1, 3) {
        return Err(CANCELLED.into());
    }
    let prefix = x.iter().zip(&y).take_while(|(p, q)| p == q).count();
    let suffix = x[prefix..].iter().rev().zip(y[prefix..].iter().rev()).take_while(|(p, q)| p == q).count();
    let xs = &x[prefix..x.len() - suffix];
    let ys = &y[prefix..y.len() - suffix];
    let Some(mut runs) = myers(xs, ys, MAX_EDITS) else { return Ok(None) };
    if !progress(3, 3) {
        return Err(CANCELLED.into());
    }
    for r in &mut runs {
        r.a_off += prefix as u64;
        r.b_off += prefix as u64;
    }
    let truncated = runs.len() > limit;
    runs.truncate(limit);
    Ok(Some((runs, truncated)))
}

pub fn compare(a: &dyn Bytes, b: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let limit = args.u64_or("limit", 100_000).clamp(1, 10_000_000) as usize;
    let mode = args.str_or("mode", "bytes");
    let mut fallback = false;
    let (diffs, truncated) = if mode == "sync" {
        match sync_mode(a, b, limit, progress)? {
            Some(result) => result,
            None => {
                fallback = true;
                bytes_mode(a, b, limit, progress)?
            }
        }
    } else {
        bytes_mode(a, b, limit, progress)?
    };
    let different: u64 = diffs.iter().map(|d| if d.a_len > 0 { d.a_len } else { d.b_len }).sum();
    Ok(json!({
        "equal": diffs.is_empty() && a.len() == b.len(), "aLen": a.len(), "bLen": b.len(),
        "diffs": diffs.iter().map(|d| json!({ "kind": d.kind(), "aOffset": d.a_off, "aLength": d.a_len, "bOffset": d.b_off, "bLength": d.b_len })).collect::<Vec<_>>(),
        "truncated": truncated, "differentBytes": different, "mode": if fallback { "bytes" } else { mode }, "fallback": fallback,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::no_progress;

    fn diffs(a: &[u8], b: &[u8], mode: &str) -> Vec<(String, u64, u64, u64, u64)> {
        let r = compare(&a.to_vec(), &b.to_vec(), &json!({ "mode": mode }), &mut no_progress()).unwrap();
        r["diffs"].as_array().unwrap().iter().map(|d| (d["kind"].as_str().unwrap().into(), d["aOffset"].as_u64().unwrap(), d["aLength"].as_u64().unwrap(), d["bOffset"].as_u64().unwrap(), d["bLength"].as_u64().unwrap())).collect()
    }

    #[test]
    fn bytes_mode_runs_and_tail() {
        assert_eq!(diffs(b"abcdef", b"abXYef", "bytes"), vec![("change".into(), 2, 2, 2, 2)]);
        assert_eq!(diffs(b"abc", b"abcde", "bytes"), vec![("insert".into(), 3, 0, 3, 2)]);
        assert_eq!(diffs(b"abcde", b"abc", "bytes"), vec![("delete".into(), 3, 2, 3, 0)]);
        assert!(diffs(b"same", b"same", "bytes").is_empty());
    }

    #[test]
    fn sync_finds_insertion() {
        let a = b"The quick brown fox jumps".to_vec();
        let b = b"The quick red brown fox jumps".to_vec();
        assert_eq!(diffs(&a, &b, "sync"), vec![("insert".into(), 10, 0, 10, 4)]);
        assert_eq!(diffs(b"0123456789", b"01234X56789Y", "sync"), vec![("insert".into(), 5, 0, 5, 1), ("insert".into(), 10, 0, 11, 1)]);
        assert_eq!(diffs(b"0123456789", b"0123789", "sync"), vec![("delete".into(), 4, 3, 4, 0)]);
        let d = diffs(b"aaaXbbb", b"aaaYZbbb", "sync");
        let a_bytes: u64 = d.iter().map(|x| x.2).sum();
        let b_bytes: u64 = d.iter().map(|x| x.4).sum();
        assert_eq!((a_bytes, b_bytes), (1, 2), "{d:?}");
    }

    #[test]
    fn sync_random_edits_rebuild() {
        let mut seed = 7u64;
        let mut rnd = |n: u64| { seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1); (seed >> 33) % n };
        let a: Vec<u8> = (0..3000).map(|_| rnd(4) as u8).collect();
        let mut b = a.clone();
        for _ in 0..40 {
            let p = rnd(b.len() as u64) as usize;
            match rnd(3) { 0 => { b.insert(p, 9); } 1 => { b.remove(p); } _ => b[p] = 8 }
        }
        let r = compare(&a, &b, &json!({ "mode": "sync" }), &mut no_progress()).unwrap();
        assert_eq!(r["fallback"], json!(false));
        // Apply the script to a: must give b.
        let mut out = Vec::new();
        let mut pos = 0usize;
        for d in r["diffs"].as_array().unwrap() {
            let ao = d["aOffset"].as_u64().unwrap() as usize;
            out.extend_from_slice(&a[pos..ao]);
            let bo = d["bOffset"].as_u64().unwrap() as usize;
            out.extend_from_slice(&b[bo..bo + d["bLength"].as_u64().unwrap() as usize]);
            pos = ao + d["aLength"].as_u64().unwrap() as usize;
        }
        out.extend_from_slice(&a[pos..]);
        assert_eq!(out, b);
    }
}
