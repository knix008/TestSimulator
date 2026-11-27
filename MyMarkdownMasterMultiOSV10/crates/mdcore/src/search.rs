//! Vault search with Obsidian's query language:
//!   words (all must match) · "exact phrase" · OR · -exclude · ( groups ) · /regex/
//!   file: path: content: tag: line:( ) block:( ) section:( ) task: task-todo: task-done:
//!   match-case: ignore-case: · [property] · [property:value]
//! Plain words match the note text or its file name, case-insensitively. Results carry the matching
//! lines for the search panel (line, UTF-16 column, length, line text).
use crate::index::{file_name_of, is_note, VaultIndex};
use regex::{Regex, RegexBuilder};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone)]
enum Node {
    And(Vec<Node>),
    Or(Vec<Node>),
    Not(Box<Node>),
    Text { text: String, case: bool },
    Regex(Regex),
    Op { op: String, arg: Box<Node> },
    Prop { key: String, value: Option<Box<Node>> },
    Empty,
}

#[derive(Debug, Clone, PartialEq)]
enum Tok { Word(String), Phrase(String), Regex(String), Open, Close, Or, Not, Op(String), Prop(String) }

const OPS: &[&str] = &["file", "path", "content", "tag", "line", "block", "section", "task", "task-todo", "task-done", "match-case", "ignore-case"];

fn tokenize(q: &str) -> Vec<Tok> {
    let chars: Vec<char> = q.chars().collect();
    let mut i = 0;
    let mut out = vec![];
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() { i += 1; continue; }
        if c == '(' { out.push(Tok::Open); i += 1; continue; }
        if c == ')' { out.push(Tok::Close); i += 1; continue; }
        if c == '-' && i + 1 < chars.len() && !chars[i + 1].is_whitespace() { out.push(Tok::Not); i += 1; continue; }
        if c == '"' {
            let mut j = i + 1; let mut s = String::new();
            while j < chars.len() && chars[j] != '"' { if chars[j] == '\\' && j + 1 < chars.len() { j += 1; } s.push(chars[j]); j += 1; }
            out.push(Tok::Phrase(s)); i = j + 1; continue;
        }
        if c == '/' {
            let mut j = i + 1; let mut s = String::new();
            while j < chars.len() && chars[j] != '/' { if chars[j] == '\\' && j + 1 < chars.len() && chars[j + 1] == '/' { j += 1; } s.push(chars[j]); j += 1; }
            if j < chars.len() { out.push(Tok::Regex(s)); i = j + 1; continue; }
        }
        if c == '[' {
            let mut j = i + 1; let mut s = String::new();
            while j < chars.len() && chars[j] != ']' { s.push(chars[j]); j += 1; }
            out.push(Tok::Prop(s)); i = j + 1; continue;
        }
        let mut j = i; let mut s = String::new();
        while j < chars.len() && !chars[j].is_whitespace() && chars[j] != '(' && chars[j] != ')' {
            if chars[j] == ':' { let name = s.to_lowercase(); if OPS.contains(&name.as_str()) { j += 1; s.clear(); out.push(Tok::Op(name)); break; } }
            s.push(chars[j]); j += 1;
        }
        if !s.is_empty() { if s == "OR" { out.push(Tok::Or); } else { out.push(Tok::Word(s)); } }
        i = j;
    }
    out
}

struct Parser { toks: Vec<Tok>, pos: usize, case: bool }
impl Parser {
    fn peek(&self) -> Option<&Tok> { self.toks.get(self.pos) }
    fn or(&mut self) -> Node {
        let mut parts = vec![self.and()];
        while self.peek() == Some(&Tok::Or) { self.pos += 1; parts.push(self.and()); }
        if parts.len() == 1 { parts.pop().unwrap() } else { Node::Or(parts) }
    }
    fn and(&mut self) -> Node {
        let mut parts = vec![];
        while let Some(t) = self.peek() { if *t == Tok::Or || *t == Tok::Close { break; } parts.push(self.unary()); }
        match parts.len() { 0 => Node::Empty, 1 => parts.pop().unwrap(), _ => Node::And(parts) }
    }
    fn unary(&mut self) -> Node {
        match self.peek().cloned() {
            Some(Tok::Not) => { self.pos += 1; Node::Not(Box::new(self.unary())) }
            Some(Tok::Op(op)) => {
                self.pos += 1;
                if op == "match-case" || op == "ignore-case" { let saved = self.case; self.case = op == "match-case"; let n = self.unary(); self.case = saved; return n; }
                Node::Op { op, arg: Box::new(self.unary()) }
            }
            _ => self.atom(),
        }
    }
    fn atom(&mut self) -> Node {
        let t = self.toks.get(self.pos).cloned();
        self.pos += 1;
        match t {
            Some(Tok::Open) => { let n = self.or(); if self.peek() == Some(&Tok::Close) { self.pos += 1; } n }
            Some(Tok::Word(w)) | Some(Tok::Phrase(w)) => Node::Text { text: w, case: self.case },
            Some(Tok::Regex(r)) => RegexBuilder::new(&r).case_insensitive(!self.case).build().map(Node::Regex).unwrap_or(Node::Text { text: r, case: self.case }),
            Some(Tok::Prop(p)) => match p.find(':') {
                Some(i) => {
                    let key = p[..i].trim().to_string();
                    let rest = p[i + 1..].trim().to_string();
                    let mut sub = Parser { toks: tokenize(&rest), pos: 0, case: self.case };
                    Node::Prop { key, value: Some(Box::new(sub.or())) }
                }
                None => Node::Prop { key: p.trim().to_string(), value: None },
            },
            _ => Node::Empty,
        }
    }
}

/// A parsed query; `None` for an empty one.
pub struct Query { root: Node }

impl Query {
    pub fn parse(q: &str) -> Option<Query> {
        let mut p = Parser { toks: tokenize(q), pos: 0, case: false };
        let root = p.or();
        if matches!(root, Node::Empty) { None } else { Some(Query { root }) }
    }
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch { pub line: usize, pub col: usize, pub len: usize, pub text: String }

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult { pub path: String, pub matches: Vec<LineMatch>, pub name_match: bool, pub score: f64 }

struct Doc<'a> { path: &'a str, lines: Vec<&'a str>, tags: Vec<String>, props: Option<&'a serde_json::Map<String, Value>> }

fn find_all(hay: &str, node: &Node) -> Vec<(usize, usize)> {
    match node {
        Node::Text { text, case } => {
            if text.is_empty() { return vec![]; }
            let (h, n) = if *case { (hay.to_string(), text.clone()) } else { (hay.to_lowercase(), text.to_lowercase()) };
            // lowercase can change byte lengths for a few scripts: fall back to the found count only.
            if h.len() != hay.len() { return if h.contains(&n) { vec![(0, 0)] } else { vec![] }; }
            h.match_indices(&n).map(|(i, m)| (i, m.len())).collect()
        }
        Node::Regex(r) => r.find_iter(hay).map(|m| (m.start(), m.len())).collect(),
        _ => vec![],
    }
}

/// Evaluates `node` against `text` (a whole note, a line, a block or a section starting at line `first`);
/// collects hits as (line, byte col, byte len).
fn eval(node: &Node, doc: &Doc, text: &str, first: usize, scope: &str, hits: &mut Vec<(usize, usize, usize)>) -> bool {
    match node {
        Node::Empty => true,
        Node::And(parts) => { let mut all = true; for p in parts { if !eval(p, doc, text, first, scope, hits) { all = false; } } all }
        Node::Or(parts) => { let mut any = false; for p in parts { if eval(p, doc, text, first, scope, hits) { any = true; } } any }
        Node::Not(inner) => { let mut ignore = vec![]; !eval(inner, doc, text, first, scope, &mut ignore) }
        Node::Text { .. } | Node::Regex(_) => {
            let mut found = false;
            for (i, line) in text.split('\n').enumerate() {
                for (col, len) in find_all(line, node) { found = true; hits.push((first + i, col, len)); }
            }
            if !found && scope == "all" { found = !find_all(file_name_of(doc.path), node).is_empty(); }
            found
        }
        Node::Op { op, arg } => match op.as_str() {
            "file" => { let mut ig = vec![]; eval(arg, doc, file_name_of(doc.path), 0, "name", &mut ig) }
            "path" => { let mut ig = vec![]; eval(arg, doc, doc.path, 0, "name", &mut ig) }
            "content" => eval(arg, doc, text, first, "content", hits),
            "tag" => {
                let want = match arg.as_ref() { Node::Text { text, .. } => text.trim_start_matches('#').to_lowercase(), _ => return false };
                doc.tags.iter().any(|t| { let t = t.trim_start_matches('#').to_lowercase(); t == want || t.starts_with(&format!("{want}/")) })
            }
            "line" => { let mut any = false; for (i, line) in doc.lines.iter().enumerate() { let mut h = vec![]; if eval(arg, doc, line, i, "content", &mut h) { any = true; hits.extend(h); } } any }
            "block" | "section" => {
                let mut any = false;
                let mut start = 0;
                let n = doc.lines.len();
                let mut i = 0;
                while i <= n {
                    let boundary = i == n || if op == "block" { doc.lines[i].trim().is_empty() } else { i > start && doc.lines[i].starts_with('#') };
                    if boundary {
                        if i > start {
                            let chunk = doc.lines[start..i].join("\n");
                            let mut h = vec![];
                            if eval(arg, doc, &chunk, start, "content", &mut h) { any = true; hits.extend(h); }
                        }
                        start = if op == "block" { i + 1 } else { i };
                    }
                    i += 1;
                }
                any
            }
            "task" | "task-todo" | "task-done" => {
                let mut any = false;
                for (i, line) in doc.lines.iter().enumerate() {
                    if let Some(c) = crate::note::task_re().captures(line) {
                        let status = c.get(1).unwrap().as_str();
                        let ok = match op.as_str() { "task-todo" => status == " ", "task-done" => status != " ", _ => true };
                        if !ok { continue; }
                        let mut h = vec![];
                        if matches!(arg.as_ref(), Node::Empty) || eval(arg, doc, line, i, "content", &mut h) { any = true; hits.extend(h); }
                    }
                }
                any
            }
            _ => false,
        },
        Node::Prop { key, value } => {
            let Some(props) = doc.props else { return false };
            let Some((_, v)) = props.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)) else { return false };
            match value {
                None => true,
                Some(want) => {
                    if let Node::Text { text, .. } = want.as_ref() { if text == "null" { return v.is_null() || v == &Value::String(String::new()); } }
                    let values: Vec<String> = match v { Value::Array(a) => a.iter().map(value_text).collect(), other => vec![value_text(other)] };
                    values.iter().any(|s| { let mut ig = vec![]; eval(want, doc, s, 0, "name", &mut ig) })
                }
            }
        }
    }
}

fn value_text(v: &Value) -> String { match v { Value::String(s) => s.clone(), Value::Null => String::new(), other => other.to_string() } }

/// Runs `query` over the vault's notes (all files for name-only queries); results sorted by score then path.
pub fn search(index: &mut VaultIndex, query: &str, limit: usize, max_matches: usize) -> Vec<SearchResult> {
    let Some(q) = Query::parse(query) else { return vec![] };
    let mut out = vec![];
    let paths: Vec<String> = index.files.keys().cloned().collect();
    for path in paths {
        let note = is_note(&path);
        let text: &str = if note { index.texts.get(&path).map(|s| s.as_str()).unwrap_or("") } else { "" };
        let meta = index.notes.get(&path);
        let doc = Doc { path: &path, lines: text.split('\n').collect(), tags: meta.map(|m| m.tags.clone()).unwrap_or_default(), props: meta.map(|m| &m.frontmatter) };
        let mut hits = vec![];
        if !eval(&q.root, &doc, text, 0, "all", &mut hits) { continue; }
        if !note && hits.is_empty() && text.is_empty() {
            // attachments match by name only
        }
        hits.sort();
        hits.dedup();
        let name_match = { let mut ig = vec![]; eval(&q.root, &doc, file_name_of(&path), 0, "name", &mut ig) };
        let count = hits.len();
        let matches = hits.into_iter().take(max_matches).map(|(line, col, len)| {
            let l = doc.lines.get(line).copied().unwrap_or("");
            LineMatch { line, col: crate::scan::utf16_col(l, col), len: l.get(col..col + len).map(|s| s.encode_utf16().count()).unwrap_or(0), text: l.to_string() }
        }).collect();
        let score = (if name_match { 100.0 } else { 0.0 }) + count as f64;
        out.push(SearchResult { path, matches, name_match, score });
    }
    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal).then(a.path.cmp(&b.path)));
    out.truncate(limit);
    out
}

/// Fuzzy score for the quick switcher: all query chars in order; consecutive / word-start bonus. None = no match.
pub fn fuzzy_score(query: &str, candidate: &str) -> Option<(i64, Vec<usize>)> {
    let q: Vec<char> = query.to_lowercase().chars().filter(|c| !c.is_whitespace()).collect();
    if q.is_empty() { return Some((0, vec![])); }
    let c: Vec<char> = candidate.chars().collect();
    let lower: Vec<char> = candidate.to_lowercase().chars().collect();
    if lower.len() != c.len() { return if candidate.to_lowercase().contains(&query.to_lowercase()) { Some((1, vec![])) } else { None }; }
    let mut score = 0i64;
    let mut positions = vec![];
    let mut qi = 0;
    let mut last: Option<usize> = None;
    for (i, ch) in lower.iter().enumerate() {
        if qi < q.len() && *ch == q[qi] {
            score += 1;
            if last == Some(i.wrapping_sub(1)) { score += 5; }
            if i == 0 || matches!(c[i - 1], ' ' | '/' | '-' | '_' | '.') { score += 8; }
            positions.push(i);
            last = Some(i);
            qi += 1;
        }
    }
    if qi < q.len() { return None; }
    score -= (c.len() as i64) / 10;
    Some((score, positions))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn vault() -> VaultIndex {
        let mut v = VaultIndex::new();
        v.set_text("Work/Plan.md", "---\nstatus: draft\ntags: [project]\n---\n# Goals\nShip the release.\n- [ ] write docs\n- [x] fix bug\n\n## Risks\nThe release may slip.");
        v.set_text("Home.md", "Welcome home. #personal\nNothing about plans here.");
        v.set_file("pic.png", 1, 0.0, 0.0);
        v
    }
    fn paths(v: &mut VaultIndex, q: &str) -> Vec<String> { search(v, q, 50, 10).into_iter().map(|r| r.path).collect() }
    #[test]
    fn operators() {
        let mut v = vault();
        assert_eq!(paths(&mut v, "release"), vec!["Work/Plan.md"]);
        assert_eq!(paths(&mut v, "\"may slip\""), vec!["Work/Plan.md"]);
        assert_eq!(paths(&mut v, "home -release"), vec!["Home.md"]);
        assert_eq!(paths(&mut v, "tag:#project"), vec!["Work/Plan.md"]);
        assert_eq!(paths(&mut v, "path:Work"), vec!["Work/Plan.md"]);
        assert_eq!(paths(&mut v, "file:pic"), vec!["pic.png"]);
        assert_eq!(paths(&mut v, "[status:draft]"), vec!["Work/Plan.md"]);
        assert_eq!(paths(&mut v, "task-todo:docs"), vec!["Work/Plan.md"]);
        assert!(paths(&mut v, "task-todo:bug").is_empty());
        assert_eq!(paths(&mut v, "line:(ship release)"), vec!["Work/Plan.md"]);
        assert!(paths(&mut v, "line:(ship slip)").is_empty());
        assert_eq!(paths(&mut v, "section:(risks slip)"), vec!["Work/Plan.md"]);
        assert_eq!(paths(&mut v, "/wel+come/"), vec!["Home.md"]);
        let mut both = paths(&mut v, "welcome OR goals"); both.sort();
        assert_eq!(both, vec!["Home.md", "Work/Plan.md"]);
        assert!(paths(&mut v, "match-case:Welcome").len() == 1 && paths(&mut v, "match-case:welcome").is_empty());
    }
    #[test]
    fn fuzzy() {
        assert!(fuzzy_score("wp", "Work/Plan.md").is_some());
        assert!(fuzzy_score("xyz", "Work/Plan.md").is_none());
        assert!(fuzzy_score("plan", "Work/Plan.md").unwrap().0 > fuzzy_score("plan", "Work/ProjectLaunchAndNotes.md").map(|x| x.0).unwrap_or(-99));
    }
}
