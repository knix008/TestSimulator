//! Text strings in the data.
//!
//! CONTRACT
//! `strings(src, {offset?, length?, minLength: 4, encodings: ["ascii","utf8","utf16le","utf16be"], limit: 10000}, progress)` →
//!   `{ items: [{ offset, length (bytes), encoding, text }], truncated }` in offset order.
//!   ascii: printable 0x20–0x7E and tab. utf8: runs that contain at least one multi-byte character (pure ASCII runs
//!   are the "ascii" ones; with "ascii" off, utf8 reports them too); ASCII runs inside a reported utf8 run are dropped.
//!   utf16le/be: printable code units (ASCII, Latin-1, Hangul, kana, CJK) at either byte alignment; a run with no
//!   ASCII letter, digit or space must be at least twice `minLength` (and 8) long, so random data does not read as text.
//!   `text` holds at most 1024 characters (`length` is always the whole run). The scan is one pass with carried state,
//!   so strings across chunk borders are found once.
use crate::doc::Bytes;
use crate::util::{for_each_chunk, range_of, Args, Progress};
use serde_json::{json, Value};

const TEXT_CAP: usize = 1024;

#[derive(Clone)]
struct Found {
    offset: u64,
    length: u64,
    encoding: &'static str,
    text: String,
}

/// A run being collected.
#[derive(Default)]
struct Run {
    start: u64,
    chars: usize,
    text: String,
    non_ascii: bool,
    plain: bool,
}

impl Run {
    fn push(&mut self, at: u64, c: char) {
        if self.chars == 0 {
            self.start = at;
            self.text.clear();
            self.non_ascii = false;
            self.plain = false;
        }
        self.chars += 1;
        if self.text.len() < TEXT_CAP * 4 && self.text.chars().count() < TEXT_CAP {
            self.text.push(c);
        }
        if !c.is_ascii() {
            self.non_ascii = true;
        }
        if c.is_ascii_alphanumeric() || c == ' ' {
            self.plain = true;
        }
    }
}

struct Sink {
    items: Vec<Found>,
    limit: usize,
}

impl Sink {
    fn full(&self) -> bool {
        self.items.len() >= self.limit
    }
}

fn printable_ascii(b: u8) -> bool {
    (0x20..=0x7E).contains(&b) || b == b'\t'
}

fn printable_wide(u: u16) -> bool {
    matches!(u, 0x09 | 0x20..=0x7E | 0xA0..=0xFF | 0x3040..=0x30FF | 0x3130..=0x318F | 0x4E00..=0x9FFF | 0xAC00..=0xD7A3)
}

struct Scanner {
    min: usize,
    ascii: Option<(Run, Sink)>,
    utf8: Option<(Run, Sink, Vec<u8>, u64)>,
    utf8_all: bool,
    /// [utf16le align 0, align 1, utf16be align 0, align 1]: (run, sink, pending byte, encoding)
    wide: Vec<(Run, Sink, Option<u8>, bool, u64)>,
}

impl Scanner {
    fn end_ascii(&mut self, end: u64) {
        if let Some((run, sink)) = &mut self.ascii {
            if run.chars >= self.min && !sink.full() {
                sink.items.push(Found { offset: run.start, length: end - run.start, encoding: "ascii", text: std::mem::take(&mut run.text) });
            }
            run.chars = 0;
        }
    }

    fn feed(&mut self, pos: u64, b: u8) {
        // ascii
        if self.ascii.is_some() {
            if printable_ascii(b) {
                self.ascii.as_mut().unwrap().0.push(pos, b as char);
            } else {
                self.end_ascii(pos);
            }
        }
        // utf8
        if self.utf8.is_some() {
            self.feed_utf8(pos, b);
        }
        // utf16
        let min = self.min;
        for (run, sink, pending, little, align) in self.wide.iter_mut() {
            if pos % 2 != *align {
                *pending = Some(b);
                continue;
            }
            let Some(first) = pending.take() else { continue };
            let unit = if *little { u16::from_le_bytes([first, b]) } else { u16::from_be_bytes([first, b]) };
            let at = pos - 1;
            if printable_wide(unit) {
                run.push(at, char::from_u32(unit as u32).unwrap_or('?'));
            } else {
                end_wide(run, sink, at, *little, min);
            }
        }
    }

    fn feed_utf8(&mut self, pos: u64, b: u8) {
        let min = self.min;
        let all = self.utf8_all;
        let (run, sink, pending, seq_start) = self.utf8.as_mut().unwrap();
        let end_run = |run: &mut Run, sink: &mut Sink, end: u64| {
            if run.chars >= min && (run.non_ascii || all) && !sink.full() {
                sink.items.push(Found { offset: run.start, length: end - run.start, encoding: "utf8", text: std::mem::take(&mut run.text) });
            }
            run.chars = 0;
        };
        if !pending.is_empty() {
            if b & 0xC0 == 0x80 {
                pending.push(b);
                let need = match pending[0] {
                    0xC2..=0xDF => 2,
                    0xE0..=0xEF => 3,
                    _ => 4,
                };
                if pending.len() == need {
                    match std::str::from_utf8(pending).ok().and_then(|s| s.chars().next()) {
                        Some(c) if !c.is_control() && !('\u{E000}'..='\u{F8FF}').contains(&c) => run.push(*seq_start, c),
                        _ => end_run(run, sink, *seq_start),
                    }
                    pending.clear();
                }
                return;
            }
            // Broken sequence: the run ends where it began; this byte starts afresh.
            end_run(run, sink, *seq_start);
            pending.clear();
        }
        match b {
            _ if printable_ascii(b) => run.push(pos, b as char),
            0xC2..=0xF4 => {
                pending.push(b);
                *seq_start = pos;
            }
            _ => end_run(run, sink, pos),
        }
    }

    fn finish(&mut self, end: u64) {
        self.end_ascii(end);
        let min = self.min;
        let all = self.utf8_all;
        if let Some((run, sink, pending, seq_start)) = &mut self.utf8 {
            let stop = if pending.is_empty() { end } else { *seq_start };
            if run.chars >= min && (run.non_ascii || all) && !sink.full() {
                sink.items.push(Found { offset: run.start, length: stop - run.start, encoding: "utf8", text: std::mem::take(&mut run.text) });
            }
            run.chars = 0;
        }
        for (run, sink, _, little, align) in self.wide.iter_mut() {
            // The last complete unit ends at an even distance from the alignment.
            let stop = if end % 2 != *align { end } else { end.saturating_sub(1) };
            end_wide(run, sink, stop.max(run.start), *little, min);
        }
    }

    fn all_full(&self) -> bool {
        self.ascii.as_ref().is_none_or(|(_, s)| s.full())
            && self.utf8.as_ref().is_none_or(|(_, s, _, _)| s.full())
            && self.wide.iter().all(|(_, s, _, _, _)| s.full())
    }
}

fn end_wide(run: &mut Run, sink: &mut Sink, end: u64, little: bool, min: usize) {
    let long_enough = run.chars >= min && (run.plain || run.chars >= (min * 2).max(8));
    if long_enough && !sink.full() {
        sink.items.push(Found { offset: run.start, length: end - run.start, encoding: if little { "utf16le" } else { "utf16be" }, text: std::mem::take(&mut run.text) });
    }
    run.chars = 0;
}

pub fn strings(src: &dyn Bytes, args: &Value, progress: &mut Progress) -> Result<Value, String> {
    let (offset, length) = range_of(src, args);
    let min = args.u64_or("minLength", 4).clamp(1, 1 << 16) as usize;
    let limit = args.u64_or("limit", 10_000).clamp(1, 1_000_000) as usize;
    let encodings: Vec<String> = match args.get("encodings").and_then(|v| v.as_array()) {
        Some(list) => list.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        None => vec!["ascii".into(), "utf8".into(), "utf16le".into(), "utf16be".into()],
    };
    let has = |e: &str| encodings.iter().any(|x| x == e);
    let sink = || Sink { items: Vec::new(), limit };
    let mut scanner = Scanner {
        min,
        ascii: has("ascii").then(|| (Run::default(), sink())),
        utf8: has("utf8").then(|| (Run::default(), sink(), Vec::new(), 0)),
        utf8_all: !has("ascii"),
        wide: Vec::new(),
    };
    for (name, little) in [("utf16le", true), ("utf16be", false)] {
        if has(name) {
            for align in 0..2u64 {
                scanner.wide.push((Run::default(), sink(), None, little, align));
            }
        }
    }
    let mut stopped = false;
    for_each_chunk(src, offset, length, 1 << 20, progress, |at, chunk| {
        for (i, &b) in chunk.iter().enumerate() {
            scanner.feed(at + i as u64, b);
        }
        if scanner.all_full() {
            stopped = true;
            return false;
        }
        true
    })?;
    scanner.finish(offset + length);
    let mut any_full = stopped;
    let mut items: Vec<Found> = Vec::new();
    if let Some((_, s)) = scanner.ascii.take() {
        any_full |= s.full();
        items.extend(s.items);
    }
    let mut utf8_runs: Vec<(u64, u64)> = Vec::new();
    if let Some((_, s, _, _)) = scanner.utf8.take() {
        any_full |= s.full();
        utf8_runs = s.items.iter().map(|f| (f.offset, f.offset + f.length)).collect();
        items.extend(s.items);
    }
    for (_, s, _, _, _) in scanner.wide.drain(..) {
        any_full |= s.full();
        items.extend(s.items);
    }
    if !utf8_runs.is_empty() {
        items.retain(|f| f.encoding != "ascii" || !utf8_runs.iter().any(|&(s, e)| s <= f.offset && f.offset + f.length <= e));
    }
    items.sort_by(|a, b| a.offset.cmp(&b.offset).then(b.length.cmp(&a.length)));
    let truncated = any_full || items.len() > limit;
    items.truncate(limit);
    Ok(json!({
        "items": items.iter().map(|f| json!({ "offset": f.offset, "length": f.length, "encoding": f.encoding, "text": f.text })).collect::<Vec<_>>(),
        "truncated": truncated,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::no_progress;

    fn run(data: &[u8], args: Value) -> Vec<(u64, u64, String, String)> {
        let r = strings(&data.to_vec(), &args, &mut no_progress()).unwrap();
        r["items"].as_array().unwrap().iter().map(|i| (i["offset"].as_u64().unwrap(), i["length"].as_u64().unwrap(), i["encoding"].as_str().unwrap().to_string(), i["text"].as_str().unwrap().to_string())).collect()
    }

    #[test]
    fn ascii_utf8_utf16() {
        let mut data = vec![0u8; 3];
        data.extend_from_slice(b"Hello world");
        data.push(0);
        data.extend_from_slice("한글 텍스트".as_bytes());
        data.extend_from_slice(&[0xFF, 0x01]);
        for u in "Wide text".encode_utf16() {
            data.extend_from_slice(&u.to_le_bytes());
        }
        data.extend_from_slice(&[0, 0, 0xFF]);
        let items = run(&data, json!({}));
        assert!(items.iter().any(|i| i.0 == 3 && i.2 == "ascii" && i.3 == "Hello world"), "{items:?}");
        assert!(items.iter().any(|i| i.2 == "utf8" && i.3 == "한글 텍스트"), "{items:?}");
        assert!(items.iter().any(|i| i.2 == "utf16le" && i.3 == "Wide text" && i.1 == 18), "{items:?}");
        // the ASCII " " pieces inside the Korean run are not reported separately; no duplicate of Hello world
        assert_eq!(items.iter().filter(|i| i.3 == "Hello world").count(), 1);
    }

    #[test]
    fn across_chunk_border() {
        let mut data = vec![0u8; (1 << 20) - 3];
        data.extend_from_slice(b"BORDERLINE");
        data.extend_from_slice(&[0; 10]);
        let items = run(&data, json!({ "encodings": ["ascii"] }));
        assert_eq!(items, vec![(((1 << 20) - 3) as u64, 10, "ascii".to_string(), "BORDERLINE".to_string())]);
    }

    #[test]
    fn limit_truncates() {
        let data = b"aaaa\0bbbb\0cccc\0dddd\0".to_vec();
        let r = strings(&data, &json!({ "limit": 2, "encodings": ["ascii"] }), &mut no_progress()).unwrap();
        assert_eq!(r["items"].as_array().unwrap().len(), 2);
        assert_eq!(r["truncated"], json!(true));
    }
}
