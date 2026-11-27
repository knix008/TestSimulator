//! One entry point for the UI: `Engine::call(method, args)` with JSON in and out. The desktop backend
//! (src-tauri `core_call`) and the web build (crates/mdwasm `call`) expose exactly this, so the UI talks to
//! the same Rust code on every platform. File access stays with the caller (disk on the desktop, the
//! browser's vault on the web); the engine holds the index and does the thinking.
use crate::index::{is_note, kind_of, normalize_path, VaultIndex};
use crate::note::{parse_link_text, subpath_range, wiki_re};
use crate::render::{render_note, RenderOptions};
use crate::scan::{classify, LineKind};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Default)]
pub struct Engine { pub index: VaultIndex }

fn arg<T: for<'de> Deserialize<'de>>(args: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null)).map_err(|e| format!("argument `{key}`: {e}"))
}
fn opt<T: for<'de> Deserialize<'de> + Default>(args: &Value, key: &str) -> T {
    args.get(key).cloned().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

#[derive(Deserialize)]
struct FileEntry { path: String, #[serde(default)] kind: String, #[serde(default)] size: u64, #[serde(default)] mtime: f64, #[serde(default)] ctime: f64 }

/// Obsidian callout type → GitHub alert type (what the exporters understand).
pub fn alert_type(kind: &str) -> &'static str {
    match kind.to_lowercase().as_str() {
        "tip" | "hint" | "success" | "check" | "done" => "TIP",
        "important" | "question" | "help" | "faq" => "IMPORTANT",
        "warning" | "caution" | "attention" => "WARNING",
        "danger" | "error" | "bug" | "failure" | "fail" | "missing" => "CAUTION",
        _ => "NOTE",
    }
}

impl Engine {
    pub fn new() -> Self { Self::default() }

    /// The note as plain portable Markdown for export / "Copy as Markdown": front matter and %% comments
    /// dropped, ![[embeds]] of notes transcluded (depth 3), ![[images]] as ![](path), [[links]] as
    /// [text](path.md) (or plain text when `keep_links` is false), callouts as GitHub alerts.
    pub fn flatten(&mut self, path: &str, text: &str, keep_links: bool, depth: u32) -> String {
        let lines: Vec<&str> = text.lines().collect();
        let kinds = classify(&lines);
        let callout = regex::Regex::new(r"^(\s{0,3}>\s?)\[!([A-Za-z0-9_-]+)\][+-]?\s*(.*)$").unwrap();
        let mut out: Vec<String> = vec![];
        for (i, line) in lines.iter().enumerate() {
            match kinds[i].0 {
                LineKind::Frontmatter | LineKind::Comment => continue,
                LineKind::Code | LineKind::Math => { out.push(line.to_string()); continue; }
                LineKind::Text => {}
            }
            // %% comments %% go (a line that also has `code` keeps its text: the code must survive).
            let mut l = if line.contains("%%") && !line.contains('`') { crate::scan::blank_inline(line).0.trim_end().to_string() } else { line.to_string() };
            if let Some(c) = callout.captures(&l) { l = format!("{}[!{}]{}", &c[1], alert_type(&c[2]), if c[3].trim().is_empty() { String::new() } else { format!(" {}", c[3].trim()) }); }
            let mut result = String::new();
            let mut last = 0;
            for m in wiki_re().captures_iter(&l) {
                let all = m.get(0).unwrap();
                result.push_str(&l[last..all.start()]);
                let (target, subpath, alias, display) = parse_link_text(&m[2]);
                let resolved = if target.is_empty() { Some(path.to_string()) } else { self.index.resolve(&target, path) };
                if !m[1].is_empty() {
                    match resolved.as_deref().map(|p| (p.to_string(), kind_of(p))) {
                        Some((p, "note")) if depth > 0 => {
                            let t = self.index.texts.get(&p).cloned().unwrap_or_default();
                            let part = match subpath_range(&t, &subpath) { Some((s, e)) => t.lines().skip(s).take(e + 1 - s).collect::<Vec<_>>().join("\n"), None => crate::note::body_of(&t) };
                            result.push_str(&format!("\n{}\n", self.flatten(&p, &part, keep_links, depth - 1)));
                        }
                        Some((p, "image")) => result.push_str(&format!("![{}]({})", if alias.chars().all(|c| c.is_ascii_digit() || c == 'x') { String::new() } else { alias.clone() }, crate::render::encode_path(&p))),
                        Some((p, _)) => result.push_str(&format!("[{}]({})", crate::index::file_name_of(&p), crate::render::encode_path(&p))),
                        None => result.push_str(&display),
                    }
                } else if keep_links {
                    match resolved { Some(p) => result.push_str(&format!("[{}]({}{})", display, crate::render::encode_path(&p), subpath.replace(' ', "-").to_lowercase())), None => result.push_str(&display) }
                } else {
                    result.push_str(&display);
                }
                last = all.end();
            }
            result.push_str(&l[last..]);
            out.push(result);
        }
        out.join("\n")
    }

    pub fn call(&mut self, method: &str, args: &Value) -> Result<Value, String> {
        let idx = &mut self.index;
        Ok(match method {
            "reset" => { *idx = VaultIndex::new(); Value::Null }
            "setFiles" => {
                let files: Vec<FileEntry> = arg(args, "files")?;
                let keep: std::collections::HashSet<String> = files.iter().map(|f| normalize_path(&f.path)).collect();
                let gone: Vec<String> = idx.files.keys().filter(|k| !keep.contains(*k)).cloned().collect();
                for g in gone { idx.remove(&g); }
                for f in files { if f.kind == "folder" { idx.add_folder(&f.path); } else { idx.set_file(&f.path, f.size, f.mtime, f.ctime); } }
                json!(idx.version)
            }
            "setFile" => { let f: FileEntry = serde_json::from_value(args.clone()).map_err(|e| e.to_string())?; if f.kind == "folder" { idx.add_folder(&f.path) } else { idx.set_file(&f.path, f.size, f.mtime, f.ctime) } json!(idx.version) }
            "setText" => { let path: String = arg(args, "path")?; let text: String = arg(args, "text")?; json!(idx.set_text(&path, &text)) }
            "setTexts" => { let items: Vec<(String, String)> = arg(args, "items")?; for (p, t) in items { idx.set_text(&p, &t); } json!(idx.version) }
            "remove" => { let path: String = arg(args, "path")?; idx.remove(&path); json!(idx.version) }
            "rename" => { let from: String = arg(args, "from")?; let to: String = arg(args, "to")?; json!(crate::rename::plan_rename(idx, &from, &to)) }
            "version" => json!(idx.version),
            "snapshot" => serde_json::to_value(idx.snapshot()).map_err(|e| e.to_string())?,
            "meta" => { let path: String = arg(args, "path")?; idx.resolve_all(); json!(idx.notes.get(&normalize_path(&path))) }
            "parse" => { let text: String = arg(args, "text")?; json!(crate::note::parse_note(&text)) }
            "resolve" => { let target: String = arg(args, "target")?; let from: String = opt(args, "from"); json!(idx.resolve(&target, &from)) }
            "linkText" => { let path: String = arg(args, "path")?; let from: String = opt(args, "from"); json!(idx.link_text(&path, &from)) }
            "backlinks" => { let path: String = arg(args, "path")?; json!(idx.backlinks(&path)) }
            "unlinked" => { let path: String = arg(args, "path")?; json!(idx.unlinked_mentions(&path, 200)) }
            "tags" => json!(idx.tags()),
            "properties" => json!(idx.properties()),
            "search" => { let q: String = arg(args, "query")?; let limit: usize = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(500) as usize; json!(crate::search::search(idx, &q, limit, 20)) }
            "quickSwitch" => {
                let q: String = arg(args, "query")?;
                let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
                let mut hits: Vec<(i64, String, Option<String>, Vec<usize>)> = vec![];
                for p in idx.files.keys() {
                    let shown = if is_note(p) { p.trim_end_matches(".md").to_string() } else { p.clone() };
                    if let Some((s, pos)) = crate::search::fuzzy_score(&q, &shown) { hits.push((s + if is_note(p) { 3 } else { 0 }, p.clone(), None, pos)); }
                }
                for (p, m) in &idx.notes { for a in &m.aliases { if let Some((s, pos)) = crate::search::fuzzy_score(&q, a) { hits.push((s, p.clone(), Some(a.clone()), pos)); } } }
                hits.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.len().cmp(&b.1.len())));
                hits.truncate(limit);
                json!(hits.into_iter().map(|(score, path, alias, positions)| json!({ "score": score, "path": path, "alias": alias, "positions": positions })).collect::<Vec<_>>())
            }
            "render" => {
                let path: String = arg(args, "path")?;
                let text: String = match args.get("text").and_then(|v| v.as_str()) { Some(t) => t.to_string(), None => idx.texts.get(&normalize_path(&path)).cloned().unwrap_or_default() };
                let options: RenderOptions = args.get("options").cloned().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
                json!(render_note(idx, &normalize_path(&path), &text, &options))
            }
            "stats" => { let text: String = arg(args, "text")?; json!(crate::writing::stats(&text)) }
            "styleCheck" => { let text: String = arg(args, "text")?; let lang: String = opt(args, "lang"); let long = args.get("longSentence").and_then(|v| v.as_u64()).unwrap_or(35) as usize; json!(crate::writing::check(&text, if lang.is_empty() { "auto" } else { &lang }, long)) }
            "partsOfSpeech" => { let text: String = arg(args, "text")?; json!(crate::writing::parts_of_speech(&text)) }
            "formatDate" => {
                let fmt: String = arg(args, "format")?; let now: f64 = arg(args, "now")?; let offset: i32 = opt(args, "offset"); let lang: String = opt(args, "lang");
                let days: i64 = opt(args, "days");
                let dt = crate::template::local_time(now, offset) + chrono::Duration::days(days);
                json!(crate::template::format_moment(&dt, &fmt, &lang, offset))
            }
            "template" => {
                let template: String = arg(args, "template")?; let title: String = opt(args, "title"); let now: f64 = arg(args, "now")?; let offset: i32 = opt(args, "offset"); let lang: String = opt(args, "lang");
                let date_format: String = args.get("dateFormat").and_then(|v| v.as_str()).unwrap_or("YYYY-MM-DD").to_string();
                let time_format: String = args.get("timeFormat").and_then(|v| v.as_str()).unwrap_or("HH:mm").to_string();
                json!(crate::template::expand(&template, &title, &crate::template::local_time(now, offset), &lang, offset, &date_format, &time_format))
            }
            "setProperty" => { let text: String = arg(args, "text")?; let key: String = arg(args, "key")?; let value = args.get("value").cloned().filter(|v| !v.is_null()); json!(crate::note::set_property(&text, &key, value)) }
            "emoji" => { let prefix: String = opt(args, "prefix"); json!(crate::emoji::EMOJI.iter().filter(|(c, _)| c.starts_with(&prefix)).take(60).map(|(c, e)| json!([c, e])).collect::<Vec<_>>()) }
            "flatten" => { let path: String = arg(args, "path")?; let text: String = match args.get("text").and_then(|v| v.as_str()) { Some(t) => t.to_string(), None => idx.texts.get(&normalize_path(&path)).cloned().unwrap_or_default() }; let keep = args.get("keepLinks").and_then(|v| v.as_bool()).unwrap_or(true); json!(self.flatten(&normalize_path(&path), &text, keep, 3)) }
            // The web build's exports: pictures come in as { path: base64 }, the file goes back as base64.
            "export" => {
                let format: String = arg(args, "format")?;
                let fmt = crate::export::ExportFormat::from_id(&format).ok_or_else(|| format!("unknown format {format}"))?;
                let path: String = arg(args, "path")?;
                let mut fargs = json!({ "path": path, "keepLinks": true });
                if let Some(t) = args.get("text").and_then(|v| v.as_str()) { fargs["text"] = json!(t); }
                let markdown = self.call("flatten", &fargs)?.as_str().unwrap_or_default().to_string();
                let resources: std::collections::HashMap<String, String> = opt(args, "resources");
                let source_dir = crate::index::folder_of(&path).to_string();
                let resource = move |src: &str| -> Option<crate::export::Resource> {
                    let decoded = crate::note::percent_decode(src);
                    let key = [decoded.clone(), crate::index::normalize_path(&format!("{source_dir}/{decoded}"))].into_iter().find(|k| resources.contains_key(k))?;
                    let bytes = crate::base64::decode(&resources[&key]).ok()?;
                    let mime = match crate::index::ext_of(&key).as_str() { "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp", "svg" => "image/svg+xml", "bmp" => "image/bmp", _ => "application/octet-stream" };
                    Some(crate::export::Resource { bytes, mime: mime.to_string() })
                };
                let input = crate::export::ExportInput {
                    title: opt(args, "title"), author: opt(args, "author"), language: opt(args, "language"), date: opt(args, "date"),
                    markdown, html_body: opt(args, "html"), css: opt(args, "css"), resource: &resource,
                    options: args.get("options").cloned().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default(),
                };
                json!(crate::base64::encode(&crate::export::export(fmt, &input)?))
            }
            "exportFormats" => json!(crate::export::ExportFormat::all().iter().map(|f| json!({ "id": f.id(), "extension": f.extension(), "mime": f.mime() })).collect::<Vec<_>>()),
            "orphans" => { idx.resolve_all(); let paths = idx.note_paths(); let mut linked = std::collections::HashSet::new(); for (from, m) in &idx.notes { for l in &m.links { if let Some(r) = &l.resolved { if r != from { linked.insert(r.clone()); linked.insert(from.clone()); } } } } json!(paths.into_iter().filter(|p| !linked.contains(p)).collect::<Vec<_>>()) }
            "unresolved" => { idx.resolve_all(); let mut map: std::collections::BTreeMap<String, Vec<Value>> = std::collections::BTreeMap::new(); for (from, m) in &idx.notes { for l in &m.links { if l.resolved.is_none() && !l.target.is_empty() { map.entry(l.target.clone()).or_default().push(json!({ "from": from, "line": l.line, "col": l.col, "len": l.len })); } } } json!(map) }
            other => return Err(format!("unknown core method: {other}")),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dispatch_and_flatten() {
        let mut e = Engine::new();
        e.call("setTexts", &json!({ "items": [["A.md", "---\nx: 1\n---\nSee [[B|bee]] %%hidden%%\n![[B#Part]]\n> [!tip] Hint\n> body"], ["B.md", "# B\n## Part\nincluded\n## Other\nno"]] })).unwrap();
        let flat = e.call("flatten", &json!({ "path": "A.md" })).unwrap();
        let s = flat.as_str().unwrap();
        assert!(s.contains("[bee](B.md)") && s.contains("included") && !s.contains("no\n") && !s.contains("hidden") && s.contains("> [!TIP] Hint") && !s.contains("x: 1"), "{s}");
        let r = e.call("search", &json!({ "query": "included" })).unwrap();
        assert_eq!(r[0]["path"], "B.md");
        let q = e.call("quickSwitch", &json!({ "query": "b" })).unwrap();
        assert_eq!(q[0]["path"], "B.md");
        assert!(e.call("nope", &json!({})).is_err());
        let d = e.call("formatDate", &json!({ "format": "YYYY", "now": 0.0, "offset": 0 })).unwrap();
        assert_eq!(d, "1970");
    }
}
