//! What one note says about itself and its neighbours: front matter (properties), headings, links and embeds
//! ([[wiki]] and [md](links)), tags (#inline and the `tags` property), aliases, block ids (^id), tasks,
//! sections and counts. Code, math and %% comments are skipped as Obsidian does. Lines are 0-based, columns
//! in UTF-16 code units (what the editor uses).
use crate::scan::{classify, frontmatter_end, utf16_col, LineKind};
use regex::Regex;
use serde::Serialize;
use serde_json::{Map, Value};
use std::sync::OnceLock;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Heading { pub level: u8, pub text: String, pub line: usize }

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub target: String,
    pub subpath: String,
    pub alias: String,
    pub display: String,
    pub embed: bool,
    pub line: usize,
    pub col: usize,
    pub len: usize,
    /// "wiki" | "md"
    pub kind: &'static str,
    pub raw: String,
    /// Set for links written in a front matter property.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub property: Option<String>,
    /// Filled by the index: the vault path the link goes to.
    pub resolved: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task { pub line: usize, pub status: String, pub text: String }

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Section { pub heading: Heading, pub start: usize, pub end: usize }

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TagUse { pub tag: String, pub line: usize, pub col: usize }

#[derive(Clone, Debug, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub frontmatter: Map<String, Value>,
    pub frontmatter_error: Option<String>,
    pub frontmatter_present: bool,
    pub body_line: usize,
    pub tags: Vec<String>,
    pub tag_uses: Vec<TagUse>,
    pub aliases: Vec<String>,
    pub headings: Vec<Heading>,
    pub links: Vec<Link>,
    pub blocks: Vec<(String, usize)>,
    pub tasks: Vec<Task>,
    pub sections: Vec<Section>,
    pub words: usize,
    pub chars: usize,
    pub lines: usize,
}

fn re(cell: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex { cell.get_or_init(|| Regex::new(pattern).unwrap()) }
static HEADING: OnceLock<Regex> = OnceLock::new();
static TASK: OnceLock<Regex> = OnceLock::new();
static BLOCK_ID: OnceLock<Regex> = OnceLock::new();
static WIKI: OnceLock<Regex> = OnceLock::new();
static MDLINK: OnceLock<Regex> = OnceLock::new();
static TAG: OnceLock<Regex> = OnceLock::new();
static MASK: OnceLock<Regex> = OnceLock::new();
pub fn heading_re() -> &'static Regex { re(&HEADING, r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$") }
pub fn task_re() -> &'static Regex { re(&TASK, r"^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$") }
pub fn block_id_re() -> &'static Regex { re(&BLOCK_ID, r"(?:^|\s)\^([A-Za-z0-9-]+)\s*$") }
pub fn wiki_re() -> &'static Regex { re(&WIKI, r"(!?)\[\[([^\]\n]+?)\]\]") }
pub fn mdlink_re() -> &'static Regex { re(&MDLINK, r#"(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)"#) }
/// #tag: letters, digits, _ - /; at least one non-digit; after start or a space / bracket / punctuation.
pub fn tag_re() -> &'static Regex { re(&TAG, r#"(^|[\s(\[{,;:!?"'“‘])#([\p{L}\p{N}_/\-]*[\p{L}_/\-][\p{L}\p{N}_/\-]*)"#) }
fn mask_re() -> &'static Regex { re(&MASK, r"\[\[[^\]]*\]\]|\]\([^)]*\)|[a-zA-Z][a-zA-Z0-9+.-]*://\S+") }

/// `target#sub|alias` → (target, subpath, alias, display).
pub fn parse_link_text(inner: &str) -> (String, String, String, String) {
    let (reference, alias) = match inner.find('|') { Some(i) => (&inner[..i], &inner[i + 1..]), None => (inner, "") };
    let (target, subpath) = match reference.find('#') { Some(i) => (&reference[..i], &reference[i..]), None => (reference, "") };
    let target = target.trim().to_string();
    let subpath = subpath.trim().to_string();
    let display = if !alias.is_empty() {
        alias.to_string()
    } else if !subpath.is_empty() {
        let sub = subpath.trim_start_matches('#').trim_start_matches('^').replace('#', " > ");
        if target.is_empty() { sub } else { format!("{} > {}", target, sub) }
    } else {
        target.clone()
    };
    (target, subpath, alias.to_string(), display)
}

fn as_list(value: Option<&Value>) -> Vec<String> {
    match value {
        None | Some(Value::Null) => vec![],
        Some(Value::Array(items)) => items.iter().filter_map(|v| match v { Value::String(s) => Some(s.trim().to_string()), Value::Null => None, other => Some(other.to_string()) }).filter(|s| !s.is_empty()).collect(),
        Some(Value::String(s)) => s.split([',', ' ']).map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect(),
        Some(other) => vec![other.to_string()],
    }
}

/// Parses the YAML front matter: (map, error, present, body_line).
pub fn parse_frontmatter(text: &str) -> (Map<String, Value>, Option<String>, bool, usize) {
    let lines: Vec<&str> = text.lines().collect();
    let end = frontmatter_end(&lines);
    if end == 0 { return (Map::new(), None, false, 0); }
    let raw = lines[1..end - 1].join("\n");
    if raw.trim().is_empty() { return (Map::new(), None, true, end); }
    match serde_yaml_ng::from_str::<serde_yaml_ng::Value>(&raw) {
        Ok(yaml) => match serde_json::to_value(yaml_to_json(yaml)) {
            Ok(Value::Object(map)) => (map, None, true, end),
            Ok(_) => (Map::new(), Some("front matter is not a key: value list".into()), true, end),
            Err(e) => (Map::new(), Some(e.to_string()), true, end),
        },
        Err(e) => (Map::new(), Some(e.to_string().lines().next().unwrap_or("").to_string()), true, end),
    }
}

/// YAML → JSON (dates and other scalars as strings, keys as strings).
pub fn yaml_to_json(v: serde_yaml_ng::Value) -> Value {
    use serde_yaml_ng::Value as Y;
    match v {
        Y::Null => Value::Null,
        Y::Bool(b) => Value::Bool(b),
        Y::Number(n) => {
            if let Some(i) = n.as_i64() { Value::from(i) } else if let Some(f) = n.as_f64() { serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null) } else { Value::String(n.to_string()) }
        }
        Y::String(s) => Value::String(s),
        Y::Sequence(items) => Value::Array(items.into_iter().map(yaml_to_json).collect()),
        Y::Mapping(m) => {
            let mut out = Map::new();
            for (k, v) in m { let key = match k { Y::String(s) => s, other => serde_yaml_ng::to_string(&other).unwrap_or_default().trim().to_string() }; out.insert(key, yaml_to_json(v)); }
            Value::Object(out)
        }
        Y::Tagged(t) => yaml_to_json(t.value),
    }
}

/// Writes properties back as front matter in front of the body (none when the map is empty).
pub fn write_frontmatter(map: &Map<String, Value>, body: &str) -> String {
    if map.is_empty() { return body.to_string(); }
    let yaml = serde_yaml_ng::to_string(&Value::Object(map.clone())).unwrap_or_default();
    format!("---\n{}---\n{}", if yaml.ends_with('\n') { yaml } else { format!("{yaml}\n") }, body.trim_start_matches(['\r', '\n']))
}

/// The note's body (text after the front matter).
pub fn body_of(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let end = frontmatter_end(&lines);
    if end == 0 { text.to_string() } else { lines[end..].join("\n") }
}

/// Sets (Some) or removes (None) one property.
pub fn set_property(text: &str, key: &str, value: Option<Value>) -> String {
    let (mut map, _, _, _) = parse_frontmatter(text);
    match value { Some(v) => { map.insert(key.to_string(), v); } None => { map.remove(key); } }
    write_frontmatter(&map, &body_of(text))
}

/// Words: Latin words by separators, Hangul runs as words, CJK ideographs/kana one each.
pub fn count_words(text: &str) -> usize {
    let mut words = 0;
    let mut in_word = false;
    for c in text.chars() {
        let cjk = ('\u{3040}'..='\u{30ff}').contains(&c) || ('\u{3400}'..='\u{9fff}').contains(&c);
        if cjk { words += 1; in_word = false; continue; }
        let wordish = c.is_alphanumeric() || c == '\'' || c == '’' || c == '_' || (in_word && c == '-');
        if wordish { if !in_word { words += 1; in_word = true; } } else { in_word = false; }
    }
    words
}

pub fn parse_note(text: &str) -> NoteMeta {
    let lines: Vec<&str> = text.lines().collect();
    let kinds = classify(&lines);
    let (frontmatter, frontmatter_error, frontmatter_present, body_line) = parse_frontmatter(text);
    let mut meta = NoteMeta { frontmatter_error, frontmatter_present, body_line, lines: lines.len(), ..Default::default() };
    let mut tags: Vec<String> = vec![];
    for (i, (kind, clean)) in kinds.iter().enumerate() {
        if *kind != LineKind::Text { continue; }
        let clean = clean.as_str();
        if let Some(h) = heading_re().captures(clean) {
            let text = block_id_re().replace(h.get(2).unwrap().as_str(), "").trim().to_string();
            meta.headings.push(Heading { level: h.get(1).unwrap().as_str().len() as u8, text, line: i });
        }
        if let Some(t) = task_re().captures(clean) {
            meta.tasks.push(Task { line: i, status: t.get(1).unwrap().as_str().to_string(), text: t.get(2).unwrap().as_str().trim().to_string() });
        }
        if let Some(b) = block_id_re().captures(clean) { meta.blocks.push((b.get(1).unwrap().as_str().to_string(), i)); }
        for m in wiki_re().captures_iter(clean) {
            let all = m.get(0).unwrap();
            let (target, subpath, alias, display) = parse_link_text(m.get(2).unwrap().as_str());
            meta.links.push(Link { target, subpath, alias, display, embed: !m.get(1).unwrap().as_str().is_empty(), line: i, col: utf16_col(clean, all.start()), len: all.as_str().encode_utf16().count(), kind: "wiki", raw: lines[i].get(all.start()..all.end()).unwrap_or(all.as_str()).to_string(), property: None, resolved: None });
        }
        for m in mdlink_re().captures_iter(clean) {
            let href = m.get(3).unwrap().as_str();
            if href.starts_with('#') || href.find(':').map(|c| c > 1 && href[..c].chars().all(|x| x.is_ascii_alphanumeric() || "+.-".contains(x))).unwrap_or(false) { continue; }
            let decoded = percent_decode(href);
            let (target, subpath) = match decoded.find('#') { Some(h) => (decoded[..h].to_string(), decoded[h..].to_string()), None => (decoded.clone(), String::new()) };
            let all = m.get(0).unwrap();
            let text = m.get(2).unwrap().as_str().to_string();
            meta.links.push(Link { target, subpath, alias: text.clone(), display: text, embed: !m.get(1).unwrap().as_str().is_empty(), line: i, col: utf16_col(clean, all.start()), len: all.as_str().encode_utf16().count(), kind: "md", raw: all.as_str().to_string(), property: None, resolved: None });
        }
        let masked = mask_re().replace_all(clean, |c: &regex::Captures| " ".repeat(c.get(0).unwrap().as_str().len()));
        for m in tag_re().captures_iter(&masked) {
            let g = m.get(2).unwrap();
            let tag = format!("#{}", g.as_str());
            meta.tag_uses.push(TagUse { tag: tag.clone(), line: i, col: utf16_col(&masked, g.start() - 1) });
            tags.push(tag);
        }
    }
    for tag in as_list(frontmatter.get("tags").or_else(|| frontmatter.get("tag"))) { tags.push(if tag.starts_with('#') { tag } else { format!("#{tag}") }); }
    meta.aliases = as_list(frontmatter.get("aliases").or_else(|| frontmatter.get("alias")));
    for (key, value) in &frontmatter {
        let items: Vec<&Value> = match value { Value::Array(a) => a.iter().collect(), v => vec![v] };
        for item in items {
            if let Value::String(s) = item {
                for m in wiki_re().captures_iter(s) {
                    let (target, subpath, alias, display) = parse_link_text(m.get(2).unwrap().as_str());
                    meta.links.push(Link { target, subpath, alias, display, embed: false, line: 0, col: 0, len: 0, kind: "wiki", raw: m.get(0).unwrap().as_str().to_string(), property: Some(key.clone()), resolved: None });
                }
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    meta.tags = tags.into_iter().filter(|t| seen.insert(t.to_lowercase())).collect();
    let n = lines.len();
    meta.sections = meta.headings.iter().enumerate().map(|(idx, h)| {
        let end = meta.headings[idx + 1..].iter().find(|x| x.level <= h.level).map(|x| x.line).unwrap_or(n);
        Section { heading: h.clone(), start: h.line, end: end.saturating_sub(1) }
    }).collect();
    let body: String = lines.iter().enumerate().filter(|(i, _)| *i >= body_line).map(|(_, l)| *l).collect::<Vec<_>>().join("\n");
    meta.words = count_words(&body);
    meta.chars = body.chars().count();
    meta.frontmatter = frontmatter;
    meta
}

pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(a), Some(b)) = (hex(bytes.get(i + 1)), hex(bytes.get(i + 2))) { out.push(a * 16 + b); i += 3; continue; }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}
fn hex(b: Option<&u8>) -> Option<u8> { match b? { c @ b'0'..=b'9' => Some(c - b'0'), c @ b'a'..=b'f' => Some(c - b'a' + 10), c @ b'A'..=b'F' => Some(c - b'A' + 10), _ => None } }

/// Obsidian's heading key for #subpath matching.
pub fn heading_key(text: &str) -> String {
    let cleaned: String = text.chars().filter(|c| !"#^[]|*_`~=".contains(*c)).collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Lines [start, end] (inclusive) of #Heading (nested #A#B) or #^block; None when missing.
pub fn subpath_range(text: &str, subpath: &str) -> Option<(usize, usize)> {
    if subpath.is_empty() { return None; }
    let meta = parse_note(text);
    let lines: Vec<&str> = text.lines().collect();
    if let Some(id) = subpath.strip_prefix("#^") {
        let line = meta.blocks.iter().find(|(b, _)| b == id)?.1;
        if lines[line].trim_start().starts_with('^') {
            let mut start = line.saturating_sub(1);
            while start > 0 && !lines[start - 1].trim().is_empty() { start -= 1; }
            return Some((start, line.saturating_sub(1)));
        }
        return Some((line, line));
    }
    let mut from = 0;
    let mut found: Option<&Section> = None;
    for part in subpath.split('#').filter(|p| !p.is_empty()) {
        let key = heading_key(part);
        found = meta.sections.iter().find(|s| s.start >= from && heading_key(&s.heading.text) == key);
        from = found?.start + 1;
    }
    found.map(|s| (s.start, s.end.min(lines.len().saturating_sub(1))))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_everything() {
        let text = "---\ntags: [a, b/c]\naliases: Foo\nup: \"[[Home]]\"\n---\n# Title ^h1\nSee [[Other#Sec|that]] and ![[pic.png]] and [x](Folder/Note%20A.md#H) #tag #2024 #한글/태그\n- [ ] todo ^blk\n- [x] done\n```\n[[NotALink]] #nope\n```\n## Sub\ntext";
        let m = parse_note(text);
        assert_eq!(m.headings.len(), 2);
        assert_eq!(m.headings[0].text, "Title");
        assert!(m.tags.contains(&"#tag".to_string()));
        assert!(!m.tags.contains(&"#2024".to_string()));
        assert!(m.tags.contains(&"#한글/태그".to_string()));
        assert!(m.tags.contains(&"#b/c".to_string()));
        assert!(!m.tags.contains(&"#nope".to_string()));
        assert_eq!(m.aliases, vec!["Foo".to_string()]);
        let targets: Vec<_> = m.links.iter().map(|l| l.target.as_str()).collect();
        assert!(targets.contains(&"Other") && targets.contains(&"pic.png") && targets.contains(&"Folder/Note A.md") && targets.contains(&"Home"));
        assert!(!targets.contains(&"NotALink"));
        assert_eq!(m.tasks.len(), 2);
        assert!(m.blocks.iter().any(|(b, _)| b == "blk"));
        assert_eq!(subpath_range(text, "#Sub"), Some((12, 13)));
        assert_eq!(subpath_range(text, "#^blk"), Some((7, 7)));
    }
    #[test]
    fn words() {
        assert_eq!(count_words("hello world 안녕 하세요 漢字"), 6);
    }
    #[test]
    fn property_roundtrip() {
        let t = set_property("body", "tags", Some(serde_json::json!(["x"])));
        assert!(t.starts_with("---\ntags:\n- x\n---\nbody"), "{t}");
        assert_eq!(set_property(&t, "tags", None), "body");
    }
}
