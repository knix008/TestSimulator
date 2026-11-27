//! A document: a piece table over a read-only `Source`. Edits never touch the source; they add pieces
//! that point into an append-only buffer. So a file of any size opens at once, inserting into a 10 GB
//! file costs nothing, every edit can be undone, and "modified" bytes (shown in colour) are exactly the
//! bytes that come from the buffer.
use crate::source::{MemSource, Source};
use std::sync::Arc;

/// Read access shared by documents and anything the algorithms run over.
pub trait Bytes {
    fn len(&self) -> u64;
    /// Fills `buf` from `offset` (the caller keeps within `len`).
    fn read(&self, offset: u64, buf: &mut [u8]) -> Result<(), String>;
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl Bytes for [u8] {
    fn len(&self) -> u64 {
        <[u8]>::len(self) as u64
    }
    fn read(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        let start = (offset as usize).min(<[u8]>::len(self));
        let end = (start + buf.len()).min(<[u8]>::len(self));
        buf[..end - start].copy_from_slice(&self[start..end]);
        Ok(())
    }
}

impl Bytes for Vec<u8> {
    fn len(&self) -> u64 {
        self.as_slice().len() as u64
    }
    fn read(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        Bytes::read(self.as_slice(), offset, buf)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Piece {
    /// Bytes `[start, start + len)` of the source.
    Orig { start: u64, len: u64 },
    /// Bytes `[start, start + len)` of the add buffer.
    Add { start: u64, len: u64 },
}

impl Piece {
    fn len(&self) -> u64 {
        match *self {
            Piece::Orig { len, .. } | Piece::Add { len, .. } => len,
        }
    }
    /// The part `[from, to)` (relative to the piece).
    fn slice(&self, from: u64, to: u64) -> Piece {
        match *self {
            Piece::Orig { start, .. } => Piece::Orig { start: start + from, len: to - from },
            Piece::Add { start, .. } => Piece::Add { start: start + from, len: to - from },
        }
    }
}

/// One replacement of pieces `[at, at + inserted.len())` (after) for `removed` (before).
#[derive(Clone, Debug)]
struct Change {
    at: usize,
    removed: Vec<Piece>,
    inserted: Vec<Piece>,
}

/// One undo step (several changes for "replace all", a fill of many ranges…).
#[derive(Clone, Debug)]
pub struct Step {
    changes: Vec<Change>,
    /// What the step did, for the history panel: "write", "insert", "delete", "replace", "fill", …
    pub kind: String,
    /// The first byte it touched and how many bytes it covers now.
    pub offset: u64,
    pub length: u64,
    /// The document length before and after.
    pub before_len: u64,
    pub after_len: u64,
    /// Typing: the next keystroke right after it may join it.
    pub mergeable: bool,
}

#[derive(Clone)]
pub struct Document {
    pub source: Arc<dyn Source>,
    pieces: Vec<Piece>,
    /// Start offset of each piece (prefix sums of the lengths), kept in step with `pieces`.
    starts: Vec<u64>,
    len: u64,
    add: Arc<Vec<u8>>,
    undo: Vec<Step>,
    redo: Vec<Step>,
    /// Changes on every edit, undo and redo: the page's caches compare it.
    pub version: u64,
    /// The `version` at the last save (or open): equal means unmodified.
    pub saved_version: u64,
    /// The undo depth at the last save: "modified" is undo depth != saved depth unless history was cut.
    saved_depth: Option<usize>,
    pub name: String,
    pub readonly: bool,
    /// Most undo steps kept (0: no limit).
    pub undo_limit: usize,
}

impl std::fmt::Debug for Document {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Document").field("name", &self.name).field("len", &self.len).field("pieces", &self.pieces.len()).finish()
    }
}

impl Bytes for Document {
    fn len(&self) -> u64 {
        self.len
    }
    fn read(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        self.read_into(offset, buf)
    }
}

impl Document {
    pub fn new(source: Arc<dyn Source>, name: impl Into<String>) -> Self {
        let len = source.len();
        let pieces = if len > 0 { vec![Piece::Orig { start: 0, len }] } else { Vec::new() };
        let mut doc = Document {
            source,
            pieces,
            starts: Vec::new(),
            len,
            add: Arc::new(Vec::new()),
            undo: Vec::new(),
            redo: Vec::new(),
            version: 1,
            saved_version: 1,
            saved_depth: Some(0),
            name: name.into(),
            readonly: false,
            undo_limit: 0,
        };
        doc.reindex(0);
        doc
    }

    pub fn from_bytes(bytes: Vec<u8>, name: impl Into<String>) -> Self {
        Self::new(Arc::new(MemSource(bytes)), name)
    }

    pub fn modified(&self) -> bool {
        self.saved_depth != Some(self.undo.len())
    }
    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }
    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
    pub fn history(&self) -> &[Step] {
        &self.undo
    }
    pub fn redo_history(&self) -> &[Step] {
        &self.redo
    }
    pub fn piece_count(&self) -> usize {
        self.pieces.len()
    }
    pub fn resizable(&self) -> bool {
        self.source.resizable()
    }

    fn reindex(&mut self, from: usize) {
        self.starts.truncate(from);
        let mut pos = if from == 0 { 0 } else { self.starts[from - 1] + self.pieces[from - 1].len() };
        for piece in &self.pieces[from..] {
            self.starts.push(pos);
            pos += piece.len();
        }
        self.len = pos;
    }

    /// Index of the piece holding `offset` (offset < len).
    fn piece_at(&self, offset: u64) -> usize {
        match self.starts.binary_search(&offset) {
            Ok(i) => i,
            Err(i) => i - 1,
        }
    }

    fn read_into(&self, offset: u64, buf: &mut [u8]) -> Result<(), String> {
        if buf.is_empty() {
            return Ok(());
        }
        let end = (offset + buf.len() as u64).min(self.len);
        if offset >= end {
            buf.fill(0);
            return Ok(());
        }
        let mut pos = offset;
        let mut i = self.piece_at(offset);
        while pos < end {
            let piece = self.pieces[i];
            let start = self.starts[i];
            let from = pos - start;
            let n = (piece.len() - from).min(end - pos);
            let out = &mut buf[(pos - offset) as usize..(pos - offset + n) as usize];
            match piece {
                Piece::Orig { start: s, .. } => self.source.read_at(s + from, out)?,
                Piece::Add { start: s, .. } => out.copy_from_slice(&self.add[(s + from) as usize..(s + from + n) as usize]),
            }
            pos += n;
            i += 1;
        }
        buf[(end - offset) as usize..].fill(0);
        Ok(())
    }

    /// `length` bytes at `offset` (shorter at the end).
    pub fn read_vec(&self, offset: u64, length: u64) -> Result<Vec<u8>, String> {
        let end = offset.saturating_add(length).min(self.len);
        let start = offset.min(end);
        let mut buf = vec![0u8; (end - start) as usize];
        self.read_into(start, &mut buf)?;
        Ok(buf)
    }

    /// Ranges `[start, end)` within `[offset, offset + length)` whose bytes were changed (from the add buffer).
    pub fn modified_ranges(&self, offset: u64, length: u64) -> Vec<(u64, u64)> {
        let end = offset.saturating_add(length).min(self.len);
        let mut out = Vec::new();
        if offset >= end {
            return out;
        }
        let mut i = self.piece_at(offset);
        while i < self.pieces.len() && self.starts[i] < end {
            if let Piece::Add { .. } = self.pieces[i] {
                let s = self.starts[i].max(offset);
                let e = (self.starts[i] + self.pieces[i].len()).min(end);
                match out.last_mut() {
                    Some((_, last)) if *last == s => *last = e,
                    _ => out.push((s, e)),
                }
            }
            i += 1;
        }
        out
    }

    /// Unreadable ranges of the source that show at `[offset, offset + length)` of the document.
    pub fn holes(&self, offset: u64, length: u64) -> Vec<(u64, u64)> {
        let end = offset.saturating_add(length).min(self.len);
        let mut out = Vec::new();
        if offset >= end {
            return out;
        }
        let mut i = self.piece_at(offset);
        while i < self.pieces.len() && self.starts[i] < end {
            if let Piece::Orig { start, len } = self.pieces[i] {
                let ds = self.starts[i];
                let view_s = ds.max(offset);
                let view_e = (ds + len).min(end);
                for (hs, he) in self.source.holes(start + (view_s - ds), view_e - view_s) {
                    out.push((ds + (hs - start), ds + (he - start)));
                }
            }
            i += 1;
        }
        out
    }

    fn append_add(&mut self, data: &[u8]) -> u64 {
        let buffer = Arc::make_mut(&mut self.add);
        let start = buffer.len() as u64;
        buffer.extend_from_slice(data);
        start
    }

    /// Replaces `[offset, offset + delete)` with `data`: the one edit everything else is made of.
    /// Returns the change (not yet recorded for undo).
    fn splice_raw(&mut self, offset: u64, delete: u64, data: &[u8]) -> Result<Change, String> {
        if offset > self.len {
            return Err(format!("offset {offset} is past the end ({})", self.len));
        }
        let delete = delete.min(self.len - offset);
        let new_piece = if data.is_empty() {
            None
        } else {
            let start = self.append_add(data);
            Some(Piece::Add { start, len: data.len() as u64 })
        };
        // The pieces touched: [i0, i1) — those overlapping [offset, offset + delete), or the one the
        // insertion point splits.
        let (mut i0, i1) = if offset == self.len {
            (self.pieces.len(), self.pieces.len())
        } else {
            let i0 = self.piece_at(offset);
            let i1 = if delete == 0 { i0 + 1 } else { self.piece_at(offset + delete - 1) + 1 };
            (i0, i1)
        };
        let mut inserted = Vec::new();
        if i0 < self.pieces.len() {
            let first = self.pieces[i0];
            let rel = offset - self.starts[i0];
            if rel > 0 {
                inserted.push(first.slice(0, rel));
            }
        }
        if let Some(p) = new_piece {
            inserted.push(p);
        }
        if i1 > i0 {
            let last = self.pieces[i1 - 1];
            let last_start = self.starts[i1 - 1];
            let rel_end = offset + delete - last_start;
            if rel_end < last.len() {
                inserted.push(last.slice(rel_end, last.len()));
            }
        }
        // Typing appends to the add buffer: join a new Add piece to the Add piece just before it when
        // they are contiguous in the buffer (keeps the table small).
        let mut removed_from = i0;
        if let (Some(Piece::Add { start: ns, len: nl }), true) = (new_piece, i0 > 0) {
            let at_boundary = i0 == self.pieces.len() || offset == self.starts[i0];
            if at_boundary {
                if let Piece::Add { start: ps, len: pl } = self.pieces[i0 - 1] {
                    if ps + pl == ns {
                        removed_from = i0 - 1;
                        inserted[0] = Piece::Add { start: ps, len: pl + nl };
                    }
                }
            }
        }
        // Same for a fresh piece right after an Add piece inside the first piece's split.
        if inserted.len() >= 2 {
            if let (Piece::Add { start: a, len: al }, Piece::Add { start: b, len: bl }) = (inserted[0], inserted[1]) {
                if a + al == b {
                    inserted.splice(0..2, [Piece::Add { start: a, len: al + bl }]);
                }
            }
        }
        i0 = removed_from;
        let removed: Vec<Piece> = self.pieces.splice(i0..i1, inserted.iter().copied()).collect();
        self.reindex(i0);
        Ok(Change { at: i0, removed, inserted })
    }

    fn apply_undo(&mut self, change: &Change) {
        let end = change.at + change.inserted.len();
        self.pieces.splice(change.at..end, change.removed.iter().copied());
        self.reindex(change.at);
    }

    fn apply_redo(&mut self, change: &Change) {
        let end = change.at + change.removed.len();
        self.pieces.splice(change.at..end, change.inserted.iter().copied());
        self.reindex(change.at);
    }

    fn record(&mut self, mut step: Step, merge: bool) {
        self.redo.clear();
        self.version += 1;
        if merge && step.mergeable {
            // A saved state inside the step would be lost by merging.
            let saved_here = self.saved_depth == Some(self.undo.len());
            if let Some(last) = self.undo.last_mut() {
                // Right after the step, or inside it (the second nibble of a typed byte).
                let after = step.offset == last.offset + last.length;
                let inside = step.offset >= last.offset && step.offset + step.length <= last.offset + last.length;
                if last.mergeable && last.kind == step.kind && (after || inside) && !saved_here {
                    last.changes.append(&mut step.changes);
                    if after {
                        last.length += step.length;
                    }
                    last.after_len = step.after_len;
                    return;
                }
            }
        }
        self.undo.push(step);
        if self.undo_limit > 0 && self.undo.len() > self.undo_limit {
            let cut = self.undo.len() - self.undo_limit;
            self.undo.drain(..cut);
            self.saved_depth = self.saved_depth.and_then(|d| d.checked_sub(cut));
        }
    }

    fn check_writable(&self, resizes: bool) -> Result<(), String> {
        if self.readonly {
            return Err("read-only".into());
        }
        if resizes && !self.source.resizable() {
            return Err("fixed-size".into());
        }
        Ok(())
    }

    /// Several replacements as one undo step. `edits`: (offset, delete, data), applied in order (each
    /// offset in the document as it is after the previous edits).
    pub fn edit(&mut self, kind: &str, edits: &[(u64, u64, Vec<u8>)], merge: bool) -> Result<(u64, u64), String> {
        if edits.is_empty() {
            return Ok((0, 0));
        }
        let resizes = edits.iter().any(|(o, d, data)| (*d).min(self.len.saturating_sub(*o)) != data.len() as u64);
        self.check_writable(resizes)?;
        let before_len = self.len;
        let mut changes = Vec::with_capacity(edits.len());
        let mut lo = u64::MAX;
        let mut hi = 0u64;
        for (offset, delete, data) in edits {
            match self.splice_raw(*offset, *delete, data) {
                Ok(change) => changes.push(change),
                Err(error) => {
                    for change in changes.iter().rev() {
                        self.apply_undo(change);
                    }
                    return Err(error);
                }
            }
            lo = lo.min(*offset);
            hi = hi.max(offset + data.len() as u64);
        }
        let (offset, length) = (lo, hi.saturating_sub(lo));
        let mergeable = kind == "type" && edits.len() == 1;
        self.record(Step { changes, kind: kind.into(), offset, length, before_len, after_len: self.len, mergeable }, merge);
        Ok((offset, length))
    }

    /// Overwrites from `offset` (past the end it grows).
    pub fn write(&mut self, offset: u64, data: &[u8], kind: &str, merge: bool) -> Result<(u64, u64), String> {
        let delete = (data.len() as u64).min(self.len.saturating_sub(offset));
        self.edit(kind, &[(offset, delete, data.to_vec())], merge)
    }
    pub fn insert(&mut self, offset: u64, data: &[u8], kind: &str, merge: bool) -> Result<(u64, u64), String> {
        self.edit(kind, &[(offset, 0, data.to_vec())], merge)
    }
    pub fn delete(&mut self, offset: u64, length: u64) -> Result<(u64, u64), String> {
        self.edit("delete", &[(offset, length, Vec::new())], false)
    }
    pub fn replace(&mut self, offset: u64, length: u64, data: &[u8], kind: &str) -> Result<(u64, u64), String> {
        self.edit(kind, &[(offset, length, data.to_vec())], false)
    }

    /// Undoes the last step; returns the range it affected.
    pub fn undo(&mut self) -> Option<(u64, u64)> {
        let step = self.undo.pop()?;
        for change in step.changes.iter().rev() {
            self.apply_undo(change);
        }
        self.version += 1;
        let range = (step.offset, step.length.max(1));
        self.redo.push(step);
        Some(range)
    }

    pub fn redo(&mut self) -> Option<(u64, u64)> {
        let step = self.redo.pop()?;
        for change in &step.changes {
            self.apply_redo(change);
        }
        self.version += 1;
        let range = (step.offset, step.length.max(1));
        self.undo.push(step);
        Some(range)
    }

    /// Undoes or redoes until the undo stack holds `depth` steps (the history panel).
    pub fn goto_history(&mut self, depth: usize) {
        while self.undo.len() > depth && self.undo().is_some() {}
        while self.undo.len() < depth && self.redo().is_some() {}
    }

    /// When nothing moved (same length, every source piece at its own place), the changed runs as
    /// (offset, bytes): the file can be patched in place instead of rewritten.
    pub fn patches(&self) -> Option<Vec<(u64, Vec<u8>)>> {
        if self.len != self.source.len() {
            return None;
        }
        let mut out: Vec<(u64, Vec<u8>)> = Vec::new();
        for (i, piece) in self.pieces.iter().enumerate() {
            match *piece {
                Piece::Orig { start, .. } => {
                    if start != self.starts[i] {
                        return None;
                    }
                }
                Piece::Add { start, len } => {
                    let bytes = &self.add[start as usize..(start + len) as usize];
                    match out.last_mut() {
                        Some((o, b)) if *o + b.len() as u64 == self.starts[i] => b.extend_from_slice(bytes),
                        _ => out.push((self.starts[i], bytes.to_vec())),
                    }
                }
            }
        }
        Some(out)
    }

    /// Writes the whole document to `out` (saving), in chunks, with progress.
    pub fn write_to(&self, out: &mut dyn std::io::Write, progress: &mut crate::util::Progress) -> Result<(), String> {
        const CHUNK: u64 = 1 << 20;
        let mut done = 0u64;
        let mut buf = vec![0u8; CHUNK as usize];
        for piece in &self.pieces {
            match *piece {
                Piece::Orig { start, len } => {
                    let mut pos = 0;
                    while pos < len {
                        let n = (len - pos).min(CHUNK) as usize;
                        self.source.read_at(start + pos, &mut buf[..n])?;
                        out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                        pos += n as u64;
                        done += n as u64;
                        if !progress(done, self.len) {
                            return Err(crate::util::CANCELLED.into());
                        }
                    }
                }
                Piece::Add { start, len } => {
                    out.write_all(&self.add[start as usize..(start + len) as usize]).map_err(|e| e.to_string())?;
                    done += len;
                }
            }
        }
        progress(self.len, self.len);
        Ok(())
    }

    /// Everything as one buffer (the web build's save).
    pub fn flatten(&self) -> Result<Vec<u8>, String> {
        self.read_vec(0, self.len)
    }

    /// After saving: the saved bytes are the new source; history is kept only when the source still
    /// holds the same original bytes (`keep_history`, e.g. the web build keeps its memory copy).
    pub fn rebase(&mut self, source: Arc<dyn Source>) {
        let len = source.len();
        self.source = source;
        self.pieces = if len > 0 { vec![Piece::Orig { start: 0, len }] } else { Vec::new() };
        self.add = Arc::new(Vec::new());
        self.undo.clear();
        self.redo.clear();
        self.reindex(0);
        self.version += 1;
        self.mark_saved();
    }

    pub fn mark_saved(&mut self) {
        self.saved_version = self.version;
        self.saved_depth = Some(self.undo.len());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(doc: &Document) -> String {
        String::from_utf8(doc.flatten().unwrap()).unwrap()
    }

    #[test]
    fn edits_and_undo() {
        let mut doc = Document::from_bytes(b"Hello, world".to_vec(), "t");
        doc.write(0, b"J", "write", false).unwrap();
        assert_eq!(text(&doc), "Jello, world");
        doc.insert(5, b"!!", "insert", false).unwrap();
        assert_eq!(text(&doc), "Jello!!, world");
        doc.delete(0, 1).unwrap();
        assert_eq!(text(&doc), "ello!!, world");
        doc.write(13, b"XYZ", "write", false).unwrap();
        assert_eq!(text(&doc), "ello!!, worldXYZ");
        assert!(doc.modified());
        doc.undo();
        doc.undo();
        assert_eq!(text(&doc), "Jello!!, world");
        doc.redo();
        assert_eq!(text(&doc), "ello!!, world");
        while doc.undo().is_some() {}
        assert_eq!(text(&doc), "Hello, world");
        assert!(!doc.modified());
    }

    #[test]
    fn typing_merges() {
        let mut doc = Document::from_bytes(vec![0; 16], "t");
        for i in 0..8u64 {
            doc.write(i, &[0xAA], "type", true).unwrap();
        }
        assert_eq!(doc.history().len(), 1);
        assert!(doc.piece_count() <= 3, "{}", doc.piece_count());
        assert_eq!(doc.modified_ranges(0, 16), vec![(0, 8)]);
        doc.undo();
        assert_eq!(doc.flatten().unwrap(), vec![0; 16]);
    }

    #[test]
    fn patches_when_nothing_moved() {
        let mut doc = Document::from_bytes((0..32).collect(), "t");
        doc.write(4, &[1, 2, 3], "write", false).unwrap();
        doc.write(20, &[9], "write", false).unwrap();
        let patches = doc.patches().unwrap();
        assert_eq!(patches, vec![(4, vec![1, 2, 3]), (20, vec![9])]);
        doc.insert(0, &[7], "insert", false).unwrap();
        assert!(doc.patches().is_none());
    }

    #[test]
    fn random_edits_match_vec() {
        let mut model: Vec<u8> = (0..200).map(|i| i as u8).collect();
        let mut doc = Document::from_bytes(model.clone(), "t");
        let mut seed = 12345u64;
        let mut rnd = |n: u64| { seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); (seed >> 33) % n.max(1) };
        for _ in 0..500 {
            let len = model.len() as u64;
            let off = rnd(len + 1);
            match rnd(3) {
                0 => { let n = rnd(5) + 1; let data: Vec<u8> = (0..n).map(|_| rnd(256) as u8).collect(); doc.insert(off, &data, "insert", false).unwrap(); model.splice(off as usize..off as usize, data); }
                1 => { let n = rnd(6).min(len - off); doc.delete(off, n).unwrap(); model.drain(off as usize..(off + n) as usize); }
                _ => { let n = rnd(5) + 1; let data: Vec<u8> = (0..n).map(|_| rnd(256) as u8).collect(); doc.write(off, &data, "type", true).unwrap(); let end = (off as usize + data.len()).min(model.len()); model.splice(off as usize..end, data); }
            }
            assert_eq!(doc.flatten().unwrap(), model);
        }
        let mut probe = vec![0u8; 7];
        doc.read(3, &mut probe).unwrap();
        assert_eq!(&probe[..], &model[3..10]);
    }
}
