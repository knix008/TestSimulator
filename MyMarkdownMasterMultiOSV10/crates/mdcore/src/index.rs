//! The vault index: every file, every note's metadata (note.rs) and what follows from all of them — where each
//! link goes (Obsidian's resolution), backlinks, unresolved links, tags, properties, orphans. The desktop
//! backend keeps one per open vault (fed from disk and the file watcher); the web build keeps one inside
//! WebAssembly (fed by the browser's vault). The UI receives a snapshot (`Snapshot`) after changes.
use crate::note::{parse_note, Link, NoteMeta};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};

pub const NOTE_EXTS: &[&str] = &["md", "markdown"];
pub const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];
pub const AUDIO_EXTS: &[&str] = &["mp3", "wav", "m4a", "ogg", "flac", "3gp"];
pub const VIDEO_EXTS: &[&str] = &["mp4", "webm", "ogv", "mov", "mkv"];

pub fn ext_of(path: &str) -> String { let name = path.rsplit('/').next().unwrap_or(path); match name.rfind('.') { Some(i) if i > 0 => name[i + 1..].to_lowercase(), _ => String::new() } }
pub fn name_of(path: &str) -> String { let name = path.rsplit('/').next().unwrap_or(path); match name.rfind('.') { Some(i) if i > 0 => name[..i].to_string(), _ => name.to_string() } }
pub fn file_name_of(path: &str) -> &str { path.rsplit('/').next().unwrap_or(path) }
pub fn folder_of(path: &str) -> &str { match path.rfind('/') { Some(i) => &path[..i], None => "" } }
pub fn is_note(path: &str) -> bool { NOTE_EXTS.contains(&ext_of(path).as_str()) }
pub fn kind_of(path: &str) -> &'static str {
    let e = ext_of(path);
    let e = e.as_str();
    if NOTE_EXTS.contains(&e) { "note" } else if e == "canvas" { "canvas" } else if e == "base" { "base" } else if IMAGE_EXTS.contains(&e) { "image" } else if AUDIO_EXTS.contains(&e) { "audio" } else if VIDEO_EXTS.contains(&e) { "video" } else if e == "pdf" { "pdf" } else { "other" }
}

/// "a/./b/../c" → "a/c", backslashes → slashes, never above the vault root.
pub fn normalize_path(path: &str) -> String {
    let mut out: Vec<&str> = vec![];
    let p = path.replace('\\', "/");
    for part in p.split('/') {
        match part { "" | "." => {} ".." => { out.pop(); } x => out.push(x) }
    }
    out.join("/")
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo { pub path: String, pub kind: &'static str, pub size: u64, pub mtime: f64, pub ctime: f64 }

#[derive(Default)]
pub struct VaultIndex {
    pub files: BTreeMap<String, FileInfo>,
    pub folders: HashSet<String>,
    pub notes: HashMap<String, NoteMeta>,
    pub texts: HashMap<String, String>,
    pub version: u64,
    names: Option<(HashMap<String, Vec<String>>, HashMap<String, Vec<String>>)>,
    resolved: bool,
}

fn distance(a: &str, b: &str) -> usize {
    let x: Vec<&str> = if a.is_empty() { vec![] } else { a.split('/').collect() };
    let y: Vec<&str> = if b.is_empty() { vec![] } else { b.split('/').collect() };
    let mut i = 0;
    while i < x.len() && i < y.len() && x[i] == y[i] { i += 1; }
    (x.len() - i) + (y.len() - i)
}

impl VaultIndex {
    pub fn new() -> Self { Self::default() }

    fn touch(&mut self) { self.version += 1; self.names = None; self.resolved = false; }

    fn add_parents(&mut self, path: &str) {
        let mut f = folder_of(path).to_string();
        while !f.is_empty() { self.folders.insert(f.clone()); f = folder_of(&f).to_string(); }
    }

    pub fn set_file(&mut self, path: &str, size: u64, mtime: f64, ctime: f64) {
        let p = normalize_path(path);
        if p.is_empty() { return; }
        self.add_parents(&p);
        self.files.insert(p.clone(), FileInfo { kind: kind_of(&p), path: p, size, mtime, ctime });
        self.touch();
    }
    pub fn add_folder(&mut self, path: &str) { let p = normalize_path(path); if p.is_empty() { return; } self.add_parents(&p); self.folders.insert(p); self.touch(); }

    /// A note's text was read or changed (also registers the file).
    pub fn set_text(&mut self, path: &str, text: &str) -> bool {
        let p = normalize_path(path);
        if self.texts.get(&p).map(|t| t == text).unwrap_or(false) { return false; }
        if !self.files.contains_key(&p) { self.set_file(&p, text.len() as u64, 0.0, 0.0); }
        if let Some(f) = self.files.get_mut(&p) { f.size = text.len() as u64; }
        self.notes.insert(p.clone(), parse_note(text));
        self.texts.insert(p, text.to_string());
        self.touch();
        true
    }

    pub fn remove(&mut self, path: &str) {
        let p = normalize_path(path);
        let pre = format!("{p}/");
        self.files.retain(|k, _| k != &p && !k.starts_with(&pre));
        self.notes.retain(|k, _| k != &p && !k.starts_with(&pre));
        self.texts.retain(|k, _| k != &p && !k.starts_with(&pre));
        self.folders.retain(|k| k != &p && !k.starts_with(&pre));
        self.touch();
    }

    pub fn rename(&mut self, from: &str, to: &str) {
        let a = normalize_path(from);
        let b = normalize_path(to);
        let pre = format!("{a}/");
        let moved = |k: &str| if k == a { b.clone() } else { format!("{}{}", b, &k[a.len()..]) };
        let keys: Vec<String> = self.files.keys().filter(|k| **k == a || k.starts_with(&pre)).cloned().collect();
        for k in keys { if let Some(mut info) = self.files.remove(&k) { let n = moved(&k); info.kind = kind_of(&n); info.path = n.clone(); self.files.insert(n, info); } }
        let keys: Vec<String> = self.notes.keys().filter(|k| **k == a || k.starts_with(&pre)).cloned().collect();
        for k in keys { let n = moved(&k); if let Some(m) = self.notes.remove(&k) { self.notes.insert(n.clone(), m); } if let Some(t) = self.texts.remove(&k) { self.texts.insert(n, t); } }
        let keys: Vec<String> = self.folders.iter().filter(|k| **k == a || k.starts_with(&pre)).cloned().collect();
        for k in keys { self.folders.remove(&k); self.folders.insert(moved(&k)); }
        self.add_parents(&b);
        self.touch();
    }

    pub fn has(&self, path: &str) -> bool { self.files.contains_key(&normalize_path(path)) }
    pub fn note_paths(&self) -> Vec<String> { self.files.keys().filter(|p| is_note(p)).cloned().collect() }

    fn names(&mut self) -> &(HashMap<String, Vec<String>>, HashMap<String, Vec<String>>) {
        if self.names.is_none() {
            let mut names: HashMap<String, Vec<String>> = HashMap::new();
            let mut aliases: HashMap<String, Vec<String>> = HashMap::new();
            for p in self.files.keys() {
                names.entry(file_name_of(p).to_lowercase()).or_default().push(p.clone());
                if is_note(p) { names.entry(name_of(p).to_lowercase()).or_default().push(p.clone()); }
            }
            for (p, m) in &self.notes { for a in &m.aliases { aliases.entry(a.to_lowercase()).or_default().push(p.clone()); } }
            self.names = Some((names, aliases));
        }
        self.names.as_ref().unwrap()
    }

    fn try_path(&self, p: &str) -> Option<String> {
        let n = normalize_path(p);
        if self.files.contains_key(&n) { return Some(n); }
        for e in NOTE_EXTS { let c = format!("{n}.{e}"); if self.files.contains_key(&c) { return Some(c); } }
        None
    }

    /// Where a link goes, seen from note `from`: relative paths (./ ../), the exact vault path (with or
    /// without .md), relative to the source folder, a path ending (folder/name), the name anywhere (nearest
    /// to `from`, then shortest path), then aliases.
    pub fn resolve(&mut self, target: &str, from: &str) -> Option<String> {
        let t = crate::note::percent_decode(target.trim()).replace('\\', "/");
        if t.is_empty() { return if from.is_empty() { None } else { Some(normalize_path(from)) }; }
        let base = folder_of(from).to_string();
        if t.starts_with("./") || t.starts_with("../") { return self.try_path(&format!("{base}/{t}")); }
        if let Some(rest) = t.strip_prefix('/') { return self.try_path(rest); }
        if let Some(p) = self.try_path(&t) { return Some(p); }
        if !base.is_empty() { if let Some(p) = self.try_path(&format!("{base}/{t}")) { return Some(p); } }
        let lower = t.to_lowercase();
        let mut candidates: Vec<String> = if lower.contains('/') {
            self.files.keys().filter(|p| { let pl = p.to_lowercase(); pl.ends_with(&format!("/{lower}")) || pl.ends_with(&format!("/{lower}.md")) || pl == format!("{lower}.md") }).cloned().collect()
        } else {
            self.names().0.get(&lower).cloned().unwrap_or_default()
        };
        if candidates.is_empty() { candidates = self.names().1.get(&lower).cloned().unwrap_or_default(); }
        if candidates.is_empty() { return None; }
        candidates.sort_by(|x, y| distance(&base, folder_of(x)).cmp(&distance(&base, folder_of(y))).then(x.len().cmp(&y.len())).then(x.cmp(y)));
        candidates.dedup();
        candidates.into_iter().next()
    }

    /// The shortest link text that reaches `path` from `from` ([[name]] when unique, else the path without .md).
    pub fn link_text(&mut self, path: &str, from: &str) -> String {
        let p = normalize_path(path);
        let name = if is_note(&p) { name_of(&p) } else { file_name_of(&p).to_string() };
        if self.resolve(&name, from).as_deref() == Some(p.as_str()) { return name; }
        if is_note(&p) { p.trim_end_matches(".md").trim_end_matches(".markdown").to_string() } else { p }
    }

    /// Fills `resolved` of every link of every note (done lazily after changes).
    pub fn resolve_all(&mut self) {
        if self.resolved { return; }
        let paths: Vec<String> = self.notes.keys().cloned().collect();
        for p in paths {
            let links: Vec<(String, bool)> = self.notes[&p].links.iter().map(|l| (l.target.clone(), l.target.is_empty())).collect();
            let resolved: Vec<Option<String>> = links.iter().map(|(t, empty)| if *empty { Some(p.clone()) } else { self.resolve(t, &p) }).collect();
            if let Some(m) = self.notes.get_mut(&p) { for (l, r) in m.links.iter_mut().zip(resolved) { l.resolved = r; } }
        }
        self.resolved = true;
    }

    pub fn outgoing(&mut self, path: &str) -> Vec<Link> { self.resolve_all(); self.notes.get(&normalize_path(path)).map(|m| m.links.clone()).unwrap_or_default() }

    /// Links into `path` grouped by source note (the note's links to itself excluded).
    pub fn backlinks(&mut self, path: &str) -> Vec<Backlinks> {
        self.resolve_all();
        let p = normalize_path(path);
        let mut groups: BTreeMap<String, Vec<Link>> = BTreeMap::new();
        for (from, m) in &self.notes {
            if *from == p { continue; }
            for l in &m.links { if l.resolved.as_deref() == Some(p.as_str()) { groups.entry(from.clone()).or_default().push(l.clone()); } }
        }
        groups.into_iter().map(|(from, links)| Backlinks { from, links }).collect()
    }

    /// Notes naming `path` (its name or an alias) in plain text without linking to it.
    pub fn unlinked_mentions(&mut self, path: &str, limit: usize) -> Vec<Mentions> {
        let p = normalize_path(path);
        let mut words: Vec<String> = vec![name_of(&p)];
        if let Some(m) = self.notes.get(&p) { words.extend(m.aliases.iter().cloned()); }
        words.retain(|w| w.chars().count() > 1);
        if words.is_empty() { return vec![]; }
        let linked: HashSet<String> = self.backlinks(&p).into_iter().map(|b| b.from).collect();
        let pattern = format!(r"(?i)(?:^|[^\p{{L}}\p{{N}}])({})(?:$|[^\p{{L}}\p{{N}}])", words.iter().map(|w| regex::escape(w)).collect::<Vec<_>>().join("|"));
        let Ok(re) = regex::Regex::new(&pattern) else { return vec![] };
        let link_mask = regex::Regex::new(r"\[\[[^\]]*\]\]|\[[^\]]*\]\([^)]*\)").unwrap();
        let mut out = vec![];
        let mut keys: Vec<&String> = self.texts.keys().collect();
        keys.sort();
        for from in keys {
            if *from == p || linked.contains(from) { continue; }
            let text = &self.texts[from];
            let mut hits = vec![];
            for (i, line) in text.lines().enumerate() {
                let masked = link_mask.replace_all(line, |c: &regex::Captures| " ".repeat(c.get(0).unwrap().as_str().len()));
                if let Some(c) = re.captures(&masked) { let g = c.get(1).unwrap(); hits.push(Hit { line: i, col: crate::scan::utf16_col(line, g.start()), len: g.as_str().encode_utf16().count(), text: line.to_string() }); }
            }
            if !hits.is_empty() { out.push(Mentions { from: from.clone(), hits }); }
            if out.len() >= limit { break; }
        }
        out
    }

    pub fn snapshot(&mut self) -> Snapshot {
        self.resolve_all();
        let mut folders: Vec<String> = self.folders.iter().cloned().collect();
        folders.sort();
        Snapshot { version: self.version, files: self.files.values().cloned().collect(), folders, notes: self.notes.iter().map(|(k, v)| (k.clone(), v.clone())).collect() }
    }

    /// Tags with counts and the notes using them, sorted.
    pub fn tags(&self) -> Vec<TagInfo> {
        let mut map: BTreeMap<String, TagInfo> = BTreeMap::new();
        for (p, m) in &self.notes { for t in &m.tags { let e = map.entry(t.to_lowercase()).or_insert_with(|| TagInfo { tag: t.clone(), count: 0, files: vec![] }); e.count += 1; e.files.push(p.clone()); } }
        map.into_values().collect()
    }

    /// Every property name with its value type and use count.
    pub fn properties(&self) -> Vec<PropertyInfo> {
        let mut map: BTreeMap<String, PropertyInfo> = BTreeMap::new();
        for m in self.notes.values() { for (k, v) in &m.frontmatter { let e = map.entry(k.clone()).or_insert_with(|| PropertyInfo { key: k.clone(), count: 0, kind: property_type(v) }); e.count += 1; } }
        map.into_values().collect()
    }
}

pub fn property_type(v: &Value) -> &'static str {
    match v {
        Value::Array(_) => "list",
        Value::Bool(_) => "checkbox",
        Value::Number(_) => "number",
        Value::String(s) if s.len() >= 16 && s.as_bytes()[4] == b'-' && s.as_bytes()[10] == b'T' => "datetime",
        Value::String(s) if s.len() == 10 && s.as_bytes()[4] == b'-' && s.as_bytes()[7] == b'-' => "date",
        _ => "text",
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { pub version: u64, pub files: Vec<FileInfo>, pub folders: Vec<String>, pub notes: HashMap<String, NoteMeta> }
#[derive(Serialize, Debug, Clone)]
pub struct Backlinks { pub from: String, pub links: Vec<Link> }
#[derive(Serialize, Debug, Clone)]
pub struct Hit { pub line: usize, pub col: usize, pub len: usize, pub text: String }
#[derive(Serialize, Debug, Clone)]
pub struct Mentions { pub from: String, pub hits: Vec<Hit> }
#[derive(Serialize, Debug, Clone)]
pub struct TagInfo { pub tag: String, pub count: usize, pub files: Vec<String> }
#[derive(Serialize, Debug, Clone)]
pub struct PropertyInfo { pub key: String, pub count: usize, #[serde(rename = "type")] pub kind: &'static str }

#[cfg(test)]
mod tests {
    use super::*;
    fn vault() -> VaultIndex {
        let mut v = VaultIndex::new();
        v.set_text("Home.md", "[[Projects/Plan]] [[Plan]] [[Missing]] ![[img.png]] [[Daily]]");
        v.set_text("Projects/Plan.md", "---\naliases: [Roadmap]\n---\nback to [[Home]]. Home again");
        v.set_text("Archive/Plan.md", "old");
        v.set_text("Archive/Notes.md", "mentions Home and [[Roadmap]]");
        v.set_file("Projects/img.png", 10, 0.0, 0.0);
        v.set_text("Journal/Daily.md", "");
        v
    }
    #[test]
    fn resolution() {
        let mut v = vault();
        assert_eq!(v.resolve("Plan", "Projects/X.md").as_deref(), Some("Projects/Plan.md"));
        assert_eq!(v.resolve("Plan", "Archive/X.md").as_deref(), Some("Archive/Plan.md"));
        assert_eq!(v.resolve("Projects/Plan", "").as_deref(), Some("Projects/Plan.md"));
        assert_eq!(v.resolve("img.png", "").as_deref(), Some("Projects/img.png"));
        assert_eq!(v.resolve("Roadmap", "").as_deref(), Some("Projects/Plan.md"));
        assert_eq!(v.resolve("../Home", "Projects/Plan.md").as_deref(), Some("Home.md"));
        assert_eq!(v.resolve("Missing", ""), None);
        assert_eq!(v.link_text("Projects/Plan.md", "Home.md"), "Projects/Plan");
    }
    #[test]
    fn backlinks_and_mentions() {
        let mut v = vault();
        let b = v.backlinks("Projects/Plan.md");
        assert!(b.iter().any(|g| g.from == "Archive/Notes.md"));
        let m = v.unlinked_mentions("Home.md", 10);
        assert!(m.iter().any(|g| g.from == "Archive/Notes.md"));
        assert!(!m.iter().any(|g| g.from == "Projects/Plan.md"));
        let s = v.snapshot();
        assert!(s.notes["Home.md"].links.iter().any(|l| l.target == "Missing" && l.resolved.is_none()));
    }
    #[test]
    fn rename_moves() {
        let mut v = vault();
        v.rename("Projects", "Work");
        assert!(v.has("Work/Plan.md") && v.has("Work/img.png") && !v.has("Projects/Plan.md"));
    }
}
