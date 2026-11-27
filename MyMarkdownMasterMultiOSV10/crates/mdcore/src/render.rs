//! Markdown → HTML for the reading view and the split preview, with Obsidian's syntax on top of comrak:
//! [[wiki links]] (resolved through the index; unresolved ones marked), ![[embeds]] (notes and their
//! #headings / #^blocks transcluded recursively, images with |width, audio, video, PDF, canvas), callouts
//! (> [!type]± title, foldable), ==highlights==, #tags, ^block ids, %% comments %%, [TOC], :emoji:.
//! Math ($ / $$), Mermaid and chart blocks are left as markers for the UI (KaTeX / Mermaid / charts).
//! Every block element carries data-line (the source line) so the preview can follow the editor.
use crate::index::{file_name_of, is_note, kind_of, name_of, VaultIndex};
use crate::note::{block_id_re, parse_link_text, subpath_range, wiki_re};
use crate::options::markdown_options;
use crate::scan::{blank_inline, classify, LineKind};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct RenderOptions {
    /// Prefix that turns a vault path into a URL (desktop: the asset protocol URL of the vault folder).
    /// Empty: images carry only data-src-path and the UI fills their src.
    pub resource_prefix: String,
    /// How deep embedded notes may embed further notes.
    pub embed_depth: u32,
    pub emoji: bool,
    /// Keep the front matter out of the body (the UI shows it as a properties table).
    pub hide_frontmatter: bool,
    /// Soft line breaks render as <br> (Obsidian's "strict line breaks" off).
    pub line_breaks: bool,
}
impl Default for RenderOptions {
    fn default() -> Self { Self { resource_prefix: String::new(), embed_depth: 3, emoji: true, hide_frontmatter: true, line_breaks: true } }
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Rendered {
    pub html: String,
    pub frontmatter: serde_json::Map<String, serde_json::Value>,
    /// Vault paths this rendering depends on (embedded notes and files): the preview refreshes when one changes.
    pub depends: Vec<String>,
    pub headings: Vec<RenderedHeading>,
}
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderedHeading { pub level: u8, pub text: String, pub id: String }

pub fn escape_html(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() { match c { '&' => o.push_str("&amp;"), '<' => o.push_str("&lt;"), '>' => o.push_str("&gt;"), '"' => o.push_str("&quot;"), '\'' => o.push_str("&#39;"), _ => o.push(c) } }
    o
}
pub fn encode_path(path: &str) -> String {
    let mut o = String::new();
    for b in path.bytes() { if b.is_ascii_alphanumeric() || b"/-_.~".contains(&b) { o.push(b as char) } else { o.push_str(&format!("%{b:02X}")) } }
    o
}

fn re(cell: &'static OnceLock<Regex>, p: &str) -> &'static Regex { cell.get_or_init(|| Regex::new(p).unwrap()) }
static PROTECT: OnceLock<Regex> = OnceLock::new();
static HIGHLIGHT: OnceLock<Regex> = OnceLock::new();
static EMOJI_RE: OnceLock<Regex> = OnceLock::new();
static CALLOUT: OnceLock<Regex> = OnceLock::new();
static SOURCEPOS: OnceLock<Regex> = OnceLock::new();
static HEADING_HTML: OnceLock<Regex> = OnceLock::new();
static TAGS_HTML: OnceLock<Regex> = OnceLock::new();
static SIZE: OnceLock<Regex> = OnceLock::new();
static MD_IMG: OnceLock<Regex> = OnceLock::new();

/// An image's options from its alias (`![[img.png|…]]`) or alt text (`![…](url)`), split at `|` in any
/// order: a size `300` / `300x200`, an alignment `left` / `center` / `right`; the rest is the caption.
/// → (width, height, align, caption)
pub(crate) fn image_options(alias: &str) -> (Option<String>, Option<String>, Option<&'static str>, String) {
    let size_re = re(&SIZE, r"^(\d+)(?:\s*[xX×]\s*(\d+))?$");
    let (mut w, mut h, mut align) = (None, None, None);
    let mut text: Vec<&str> = vec![];
    for raw in alias.split('|') {
        let part = raw.trim();
        if w.is_none() {
            if let Some(c) = size_re.captures(part) {
                if c[1].parse::<u64>().map(|n| n > 0).unwrap_or(false) { w = Some(c[1].to_string()); h = c.get(2).map(|m| m.as_str().to_string()); continue; }
            }
        }
        if align.is_none() {
            let a = match part.to_ascii_lowercase().as_str() { "left" => Some("left"), "center" => Some("center"), "right" => Some("right"), _ => None };
            if a.is_some() { align = a; continue; }
        }
        text.push(raw);
    }
    (w, h, align, text.join("|").trim().to_string())
}

/// ` width="…" height="…"` and the alignment class (`md-img-center` …) of an image's options.
fn image_attrs(w: &Option<String>, h: &Option<String>, align: Option<&str>) -> (String, String) {
    let size = format!("{}{}", w.as_ref().map(|w| format!(" width=\"{w}\"")).unwrap_or_default(), h.as_ref().map(|h| format!(" height=\"{h}\"")).unwrap_or_default());
    (size, align.map(|a| format!("md-img-{a}")).unwrap_or_default())
}

/// comrak's `<img src alt="caption|center|300">` (Markdown images): the options become attributes.
fn markdown_image_options(html: &str) -> String {
    if !html.contains("<img ") { return html.to_string(); }
    re(&MD_IMG, r#"<img((?: data-sourcepos="[^"]*")?) src="([^"]*)" alt="([^"]*)""#).replace_all(html, |c: &regex::Captures| {
        let (w, h, align, text) = image_options(&c[3]);
        if w.is_none() && align.is_none() { return c[0].to_string(); }
        let (size, class) = image_attrs(&w, &h, align);
        let class = if class.is_empty() { String::new() } else { format!(" class=\"{class}\"") };
        format!("<img{}{class} src=\"{}\" alt=\"{}\"{size}", &c[1], &c[2], text)
    }).into_owned()
}

struct Ctx<'a> {
    index: &'a mut VaultIndex,
    opts: &'a RenderOptions,
    depends: Vec<String>,
    slots: Vec<String>,
    stack: Vec<String>,
}

impl Ctx<'_> {
    fn slot(&mut self, html: String) -> String { self.slots.push(html); format!("\u{1}SLOT{}\u{1}", self.slots.len() - 1) }
    fn url(&self, path: &str) -> String { if self.opts.resource_prefix.is_empty() { String::new() } else { format!("{}{}", self.opts.resource_prefix, encode_path(path)) } }
}

/// Renders `text` (the note at vault path `source`).
pub fn render_note(index: &mut VaultIndex, source: &str, text: &str, opts: &RenderOptions) -> Rendered {
    let (frontmatter, _, _, _) = crate::note::parse_frontmatter(text);
    let mut ctx = Ctx { index, opts, depends: vec![], slots: vec![], stack: vec![source.to_string()] };
    let html = render_fragment(&mut ctx, source, text, None, opts.embed_depth, true);
    // The note's own headings (not those of embedded notes) make the contents list.
    let own = Regex::new(r#"<div class="internal-embed[\s\S]*?<!--/embed-->"#).unwrap().replace_all(&html, "");
    let headings = collect_headings(&own);
    let html = fill_toc(&html, &headings);
    let mut depends = ctx.depends;
    depends.sort();
    depends.dedup();
    Rendered { html, frontmatter, depends, headings }
}

/// Renders a part of a note (lines `range`, inclusive) or all of it.
fn render_fragment(ctx: &mut Ctx, source: &str, text: &str, range: Option<(usize, usize)>, depth: u32, top: bool) -> String {
    let all: Vec<&str> = text.lines().collect();
    let kinds = classify(&all);
    let (from, to) = range.unwrap_or((0, all.len().saturating_sub(1)));
    let mut out: Vec<String> = vec![];
    let mut origin: Vec<usize> = vec![];
    let lines: Vec<(usize, &str, &(LineKind, String))> = (from..=to.min(all.len().saturating_sub(1))).filter(|i| *i < all.len()).map(|i| (i, all[i], &kinds[i])).collect();
    preprocess(ctx, source, &lines, depth, &mut out, &mut origin, 0);
    let markdown = out.join("\n");
    let mut options = markdown_options();
    options.extension.front_matter_delimiter = None;
    options.render.sourcepos = true;
    options.render.hardbreaks = ctx.opts.line_breaks;
    // ![alt](relative/path.png): vault paths become resource URLs; links to notes become mdvault: links.
    let source_owned = source.to_string();
    let mut images: HashMap<String, String> = HashMap::new();
    let mut notes: HashMap<String, String> = HashMap::new();
    if let Some(meta) = ctx.index.notes.get(source).cloned() {
        for l in meta.links.iter().filter(|l| l.kind == "md") {
            if let Some(p) = ctx.index.resolve(&l.target, &source_owned) {
                let raw_target = l.raw.rsplit_once("](").map(|(_, t)| t.trim_end_matches(')').trim().trim_start_matches('<').split(['>', ' ']).next().unwrap_or("").to_string()).unwrap_or_default();
                if is_note(&p) && !l.embed { notes.insert(raw_target, format!("mdvault:{}{}", encode_path(&p), l.subpath)); } else { let u = ctx.url(&p); images.insert(raw_target, if u.is_empty() { format!("mdvault:{}", encode_path(&p)) } else { u }); ctx.depends.push(p); }
            }
        }
    }
    options.extension.image_url_rewriter = Some(Arc::new(move |url: &str| images.get(url).cloned().unwrap_or_else(|| url.to_string())));
    options.extension.link_url_rewriter = Some(Arc::new(move |url: &str| notes.get(url).cloned().unwrap_or_else(|| url.to_string())));
    let html = markdown_image_options(&comrak::markdown_to_html(&markdown, &options));
    // data-sourcepos="12:1-14:3" → data-line="<source line>"
    let html = re(&SOURCEPOS, r#" data-sourcepos="(\d+):\d+-\d+:\d+""#).replace_all(&html, |c: &regex::Captures| {
        let n: usize = c[1].parse().unwrap_or(1);
        match origin.get(n.saturating_sub(1)) { Some(o) => format!(" data-line=\"{o}\""), None => String::new() }
    }).into_owned();
    let mut html = html;
    if top || !ctx.slots.is_empty() {
        // Fill the slots (embeds rendered separately); slots may contain slots.
        for _ in 0..8 {
            if !html.contains('\u{1}') { break; }
            let slots = ctx.slots.clone();
            html = Regex::new("\u{1}SLOT(\\d+)\u{1}").unwrap().replace_all(&html, |c: &regex::Captures| slots.get(c[1].parse::<usize>().unwrap_or(usize::MAX)).cloned().unwrap_or_default()).into_owned();
        }
        // A block embed alone in a paragraph: drop the paragraph around it.
        html = Regex::new(r#"<p data-line="\d+">(<div class="internal-embed[\s\S]*?</div><!--/embed-->)</p>"#).unwrap().replace_all(&html, "$1").into_owned();
    }
    html
}

/// Line-by-line preprocessing; pushes the Markdown handed to comrak (`out`) and where each line came from.
fn preprocess(ctx: &mut Ctx, source: &str, lines: &[(usize, &str, &(LineKind, String))], depth: u32, out: &mut Vec<String>, origin: &mut Vec<usize>, quote: usize) {
    let callout = re(&CALLOUT, r"^\s{0,3}>\s?\[!([A-Za-z0-9_-]+)\]([+-]?)\s*(.*)$");
    let mut i = 0;
    while i < lines.len() {
        let (n, raw, (kind, clean)) = (lines[i].0, lines[i].1, lines[i].2);
        match kind {
            LineKind::Frontmatter => { if !ctx.opts.hide_frontmatter { out.push(raw.to_string()); origin.push(n); } i += 1; continue; }
            LineKind::Comment => { i += 1; continue; }
            LineKind::Code | LineKind::Math => { out.push(raw.to_string()); origin.push(n); i += 1; continue; }
            LineKind::Text => {}
        }
        if let Some(c) = callout.captures(raw) {
            // The callout's lines: this one and the following quoted lines.
            let kind_name = c[1].to_lowercase();
            let fold = c[2].to_string();
            let title_src = c[3].trim().to_string();
            let mut j = i + 1;
            let mut inner: Vec<(usize, String)> = vec![];
            while j < lines.len() && lines[j].1.trim_start().starts_with('>') {
                let l = lines[j].1.trim_start();
                let stripped = l.strip_prefix("> ").or_else(|| l.strip_prefix('>')).unwrap_or(l);
                inner.push((lines[j].0, stripped.to_string()));
                j += 1;
            }
            let title = if title_src.is_empty() { let mut t = kind_name.clone(); if let Some(f) = t.get_mut(0..1) { f.make_ascii_uppercase(); } escape_html(&t) } else { inline_html(ctx, source, &title_src, depth) };
            let fold_attr = if fold.is_empty() { String::new() } else { format!(" data-callout-fold=\"{fold}\"") };
            let collapsed = if fold == "-" { " is-collapsed" } else { "" };
            out.push(format!("<div class=\"callout{collapsed}\" data-callout=\"{}\"{fold_attr} data-line=\"{n}\"><div class=\"callout-title\"><div class=\"callout-icon\"></div><div class=\"callout-title-inner\">{title}</div>{}</div><div class=\"callout-content\">", escape_html(&kind_name), if fold.is_empty() { "" } else { "<div class=\"callout-fold\"></div>" }));
            origin.push(n);
            out.push(String::new()); origin.push(n);
            let texts: Vec<&str> = inner.iter().map(|(_, s)| s.as_str()).collect();
            let inner_kinds = classify(&texts);
            let inner_lines: Vec<(usize, &str, &(LineKind, String))> = inner.iter().zip(inner_kinds.iter()).map(|((no, s), k)| (*no, s.as_str(), k)).collect();
            preprocess(ctx, source, &inner_lines, depth, out, origin, quote + 1);
            out.push(String::new()); origin.push(n);
            out.push("</div></div>".to_string()); origin.push(n);
            out.push(String::new()); origin.push(n);
            i = j;
            continue;
        }
        if raw.trim().eq_ignore_ascii_case("[toc]") {
            out.push("<div class=\"md-toc\" data-toc></div>".to_string()); origin.push(n);
            out.push(String::new()); origin.push(n);
            i += 1;
            continue;
        }
        // A block id on a line of its own (after a list / table / quote) belongs to the block above.
        if let Some(b) = block_id_re().captures(clean) {
            if raw.trim_start().starts_with('^') {
                out.push(format!("<span class=\"block-anchor\" id=\"^{0}\" data-block=\"{0}\"></span>", escape_html(&b[1]))); origin.push(n);
                i += 1;
                continue;
            }
        }
        out.push(transform_line(ctx, source, raw, clean, depth));
        origin.push(n);
        i += 1;
    }
}

/// Inline Markdown of a short text (callout titles): rendered without a paragraph.
fn inline_html(ctx: &mut Ctx, source: &str, text: &str, depth: u32) -> String {
    let (blanked, _) = blank_inline(text);
    let md = transform_line(ctx, source, text, &blanked, depth);
    let mut o = markdown_options();
    o.extension.front_matter_delimiter = None;
    let html = comrak::markdown_to_html(&md, &o);
    html.trim().trim_start_matches("<p>").trim_end_matches("</p>").to_string()
}

/// One text line: wiki links and embeds, highlights, tags, block ids and emoji — never inside `code`.
fn transform_line(ctx: &mut Ctx, source: &str, raw: &str, clean: &str, depth: u32) -> String {
    // Segments outside code spans: where `clean` (code blanked) equals `raw`. Comments are blank in `clean`
    // and must disappear: rebuild from `clean` except inside code spans, which come from `raw`.
    let rc: Vec<char> = raw.chars().collect();
    let cc: Vec<char> = clean.chars().collect();
    let mut segments: Vec<(bool, String)> = vec![]; // (is_code, text)
    let mut i = 0;
    while i < rc.len() {
        let code = rc[i] == '`' && cc.get(i) == Some(&' ');
        let start = i;
        if code {
            // a code span: from here while clean is blank and raw is not a comment
            let mut n = 0; while i + n < rc.len() && rc[i + n] == '`' { n += 1; }
            let mut j = i + n;
            loop {
                if j >= rc.len() { break; }
                if rc[j] == '`' { let mut m = 0; while j + m < rc.len() && rc[j + m] == '`' { m += 1; } if m == n { j += m; break; } j += m; } else { j += 1; }
            }
            segments.push((true, rc[start..j].iter().collect()));
            i = j;
        } else {
            while i < rc.len() && !(rc[i] == '`' && cc.get(i) == Some(&' ')) { i += 1; }
            segments.push((false, cc[start..i.min(cc.len())].iter().collect()));
        }
    }
    let mut out = String::new();
    for (code, seg) in segments { if code { out.push_str(&seg); } else { out.push_str(&transform_text(ctx, source, &seg, depth)); } }
    // Trailing block id: an anchor, not text.
    if let Some(b) = block_id_re().captures(&out.clone()) {
        let m = b.get(0).unwrap();
        out = format!("{}<span class=\"block-anchor\" id=\"^{1}\" data-block=\"{1}\"></span>", &out[..m.start()], escape_html(&b[1]));
    }
    out
}

fn transform_text(ctx: &mut Ctx, source: &str, text: &str, depth: u32) -> String {
    // Wiki links / embeds first; the text between them gets the smaller marks.
    let mut out = String::new();
    let mut last = 0;
    for m in wiki_re().captures_iter(text) {
        let all = m.get(0).unwrap();
        out.push_str(&marks(ctx, &text[last..all.start()]));
        let embed = !m[1].is_empty();
        let (target, subpath, alias, display) = parse_link_text(&m[2]);
        out.push_str(&if embed { embed_html(ctx, source, &target, &subpath, &alias, depth) } else { link_html(ctx, source, &target, &subpath, &display) });
        last = all.end();
    }
    out.push_str(&marks(ctx, &text[last..]));
    out
}

/// ==highlight==, #tags, :emoji: — not inside Markdown link targets, URLs or raw HTML.
fn marks(ctx: &mut Ctx, text: &str) -> String {
    if text.is_empty() { return String::new(); }
    let protect = re(&PROTECT, r#"\]\([^)]*\)|<[^>\n]+>|[a-zA-Z][a-zA-Z0-9+.-]*://[^\s<>()]+|\\."#);
    let mut out = String::new();
    let mut last = 0;
    for m in protect.find_iter(text) {
        out.push_str(&plain_marks(ctx, &text[last..m.start()]));
        out.push_str(m.as_str());
        last = m.end();
    }
    out.push_str(&plain_marks(ctx, &text[last..]));
    out
}

fn plain_marks(ctx: &mut Ctx, text: &str) -> String {
    let s = re(&HIGHLIGHT, r"==([^=\n](?:[^\n]*?[^=\n])?)==").replace_all(text, "<mark>$1</mark>").into_owned();
    let s = crate::note::tag_re().replace_all(&s, |c: &regex::Captures| format!("{}<a class=\"tag\" href=\"#{1}\" data-tag=\"#{1}\">#{1}</a>", &c[1], escape_html(&c[2]))).into_owned();
    if !ctx.opts.emoji { return s; }
    re(&EMOJI_RE, r":([a-z0-9_+\-]{1,32}):").replace_all(&s, |c: &regex::Captures| crate::emoji::lookup(&c[1]).map(|e| e.to_string()).unwrap_or_else(|| c[0].to_string())).into_owned()
}

fn link_html(ctx: &mut Ctx, source: &str, target: &str, subpath: &str, display: &str) -> String {
    let resolved = if target.is_empty() { Some(source.to_string()) } else { ctx.index.resolve(target, source) };
    let href_ref = format!("{target}{subpath}");
    match resolved {
        Some(p) => format!("<a class=\"internal-link\" data-href=\"{}\" data-path=\"{}\" href=\"mdvault:{}{}\">{}</a>", escape_html(&href_ref), escape_html(&p), encode_path(&p), escape_html(subpath), escape_html(display)),
        None => format!("<a class=\"internal-link is-unresolved\" data-href=\"{}\" href=\"mdvault-new:{}\">{}</a>", escape_html(&href_ref), encode_path(target), escape_html(display)),
    }
}

fn embed_html(ctx: &mut Ctx, source: &str, target: &str, subpath: &str, alias: &str, depth: u32) -> String {
    let Some(path) = (if target.is_empty() { Some(source.to_string()) } else { ctx.index.resolve(target, source) }) else {
        return format!("<span class=\"internal-embed is-unresolved\" data-href=\"{0}\">{0}</span>", escape_html(&format!("{target}{subpath}")));
    };
    ctx.depends.push(path.clone());
    let url = ctx.url(&path);
    let attrs = format!("data-src-path=\"{}\"", escape_html(&path));
    match kind_of(&path) {
        "image" => {
            // |300 or |300x200 sizes, |left |center |right (any order); the rest of the alias is the alt text.
            let (w, h, align, alt) = image_options(alias);
            let (size, class) = image_attrs(&w, &h, align);
            let class = if class.is_empty() { String::new() } else { format!(" {class}") };
            format!("<img class=\"internal-embed image-embed{class}\" src=\"{}\" alt=\"{}\" {attrs}{size} loading=\"lazy\">", escape_html(&url), escape_html(if alt.is_empty() { file_name_of(&path) } else { &alt }))
        }
        "audio" => format!("<audio class=\"internal-embed media-embed\" controls src=\"{}\" {attrs}></audio>", escape_html(&url)),
        "video" => format!("<video class=\"internal-embed media-embed\" controls src=\"{}\" {attrs}></video>", escape_html(&url)),
        "pdf" => {
            let page = subpath.strip_prefix("#page=").map(|p| format!("#page={p}")).unwrap_or_default();
            ctx.slot(format!("<div class=\"internal-embed pdf-embed\" {attrs}><iframe src=\"{}{}\" title=\"{}\"></iframe></div><!--/embed-->", escape_html(&url), page, escape_html(file_name_of(&path))))
        }
        "note" => {
            if depth == 0 || ctx.stack.contains(&format!("{path}{subpath}")) {
                return format!("<a class=\"internal-link\" data-path=\"{}\" href=\"mdvault:{}\">{}</a>", escape_html(&path), encode_path(&path), escape_html(&name_of(&path)));
            }
            let text = ctx.index.texts.get(&path).cloned().unwrap_or_default();
            let range = if subpath.is_empty() { None } else { subpath_range(&text, subpath) };
            if !subpath.is_empty() && range.is_none() {
                return format!("<span class=\"internal-embed is-unresolved\" data-href=\"{0}\">{0}</span>", escape_html(&format!("{target}{subpath}")));
            }
            ctx.stack.push(format!("{path}{subpath}"));
            // The embedded part renders on its own (its slots live in the same context).
            let saved_hide = ctx.opts.hide_frontmatter;
            let inner = render_fragment(ctx, &path, &text, range.map(|(s, e)| if subpath.starts_with("#^") { (s, e) } else { (s, e) }), depth - 1, false);
            let _ = saved_hide;
            ctx.stack.pop();
            let title = if subpath.is_empty() { name_of(&path) } else { format!("{} › {}", name_of(&path), subpath.trim_start_matches('#').trim_start_matches('^').replace('#', " › ")) };
            ctx.slot(format!("<div class=\"internal-embed markdown-embed\" data-path=\"{}\" data-subpath=\"{}\"><div class=\"markdown-embed-title\"><a class=\"internal-link\" data-path=\"{0}\" href=\"mdvault:{}{1}\">{}</a></div><div class=\"markdown-embed-content\">{}</div></div><!--/embed-->", escape_html(&path), escape_html(subpath), encode_path(&path), escape_html(&title), inner))
        }
        "canvas" => ctx.slot(format!("<div class=\"internal-embed canvas-embed\" {attrs}><a class=\"internal-link\" data-path=\"{}\" href=\"mdvault:{}\">{}</a></div><!--/embed-->", escape_html(&path), encode_path(&path), escape_html(file_name_of(&path)))),
        _ => format!("<a class=\"internal-link file-embed\" data-path=\"{}\" href=\"mdvault:{}\">{}</a>", escape_html(&path), encode_path(&path), escape_html(file_name_of(&path))),
    }
}

/// Headings of the rendered HTML with their ids (comrak puts the id on an anchor inside the heading).
fn collect_headings(html: &str) -> Vec<RenderedHeading> {
    let h = re(&HEADING_HTML, r#"(?s)<h([1-6])[^>]*>(.*?)</h[1-6]>"#);
    let tags = re(&TAGS_HTML, r"<[^>]+>");
    let id = Regex::new(r#"id="([^"]*)""#).unwrap();
    h.captures_iter(html).map(|c| RenderedHeading {
        level: c[1].parse().unwrap_or(1),
        id: id.captures(&c[2]).map(|x| x[1].to_string()).unwrap_or_default(),
        text: html_unescape(&tags.replace_all(&c[2], "")).trim().to_string(),
    }).collect()
}

fn html_unescape(s: &str) -> String { s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&") }

fn fill_toc(html: &str, headings: &[RenderedHeading]) -> String {
    if !html.contains("data-toc") { return html.to_string(); }
    let min = headings.iter().map(|h| h.level).min().unwrap_or(1);
    let mut list = String::from("<ul class=\"md-toc-list\">");
    for h in headings { list.push_str(&format!("<li class=\"toc-level-{}\" style=\"--toc-indent:{}\"><a href=\"#{}\" data-heading-link>{}</a></li>", h.level, h.level - min, escape_html(&h.id), escape_html(&h.text))); }
    list.push_str("</ul>");
    html.replace("<div class=\"md-toc\" data-toc></div>", &format!("<nav class=\"md-toc\">{list}</nav>"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn obsidian_syntax() {
        let mut v = VaultIndex::new();
        v.set_text("Other.md", "# Other\n## Part\nembedded part text ^b1\n\nmore");
        v.set_file("img.png", 1, 0.0, 0.0);
        let src = "---\ntitle: X\n---\n[TOC]\n# Head\nSee [[Other|the other]] and [[Nowhere]] ==hi== #tag `#code [[no]]` %%secret%% :smile:\n\n![[Other#Part]]\n\n![[img.png|120]]\n\n> [!warning]- Careful\n> inside **bold**\n\nline ^abc\n\n- [ ] task\n\n$x^2$\n\n```mermaid\ngraph TD\n```\n";
        v.set_text("Note.md", src);
        let r = render_note(&mut v, "Note.md", src, &RenderOptions { resource_prefix: "asset://v/".into(), ..Default::default() });
        let h = &r.html;
        assert!(h.contains("class=\"internal-link\" data-href=\"Other\" data-path=\"Other.md\""), "{h}");
        assert!(h.contains("is-unresolved"));
        assert!(h.contains("<mark>hi</mark>"));
        assert!(h.contains("data-tag=\"#tag\""));
        assert!(h.contains(">#code [[no]]</code>"), "{h}");
        assert!(!h.contains("data-heading-link>Part"), "embedded headings stay out of the contents");
        assert!(!h.contains("secret"));
        assert!(h.contains("😄"));
        assert!(h.contains("markdown-embed") && h.contains("embedded part text"));
        assert!(h.contains("src=\"asset://v/img.png\"") && h.contains("width=\"120\""));
        assert!(h.contains("data-callout=\"warning\"") && h.contains("is-collapsed") && h.contains(">bold</strong>"), "{h}");
        assert!(h.contains("id=\"^abc\""));
        assert!(h.contains("md-toc-list") && h.contains(">Head<"));
        assert!(h.contains("data-math-style"));
        assert!(h.contains("mermaid"));
        assert!(h.contains("data-line=\"4\""), "heading line map: {h}");
        assert!(!h.contains("title: X"));
        assert_eq!(r.frontmatter.get("title").and_then(|v| v.as_str()), Some("X"));
        assert!(r.depends.contains(&"Other.md".to_string()));
    }
    #[test]
    fn image_size_and_alignment() {
        assert_eq!(image_options("center|300"), (Some("300".into()), None, Some("center"), String::new()));
        assert_eq!(image_options("300x200|Right"), (Some("300".into()), Some("200".into()), Some("right"), String::new()));
        assert_eq!(image_options("a caption|left"), (None, None, Some("left"), "a caption".into()));
        assert_eq!(image_options("just text"), (None, None, None, "just text".into()));
        let mut v = VaultIndex::new();
        v.set_file("img.png", 1, 0.0, 0.0);
        let src = "![[img.png|center|300]]\n\n![[img.png|240|right]]\n\n![[img.png|Cat|left]] text flows\n\n![Logo|center|120](https://example.com/a.png)\n\n![plain](https://example.com/b.png)\n";
        v.set_text("Note.md", src);
        let r = render_note(&mut v, "Note.md", src, &RenderOptions { resource_prefix: "asset://v/".into(), ..Default::default() });
        let h = &r.html;
        assert!(h.contains("class=\"internal-embed image-embed md-img-center\"") && h.contains("width=\"300\""), "{h}");
        assert!(h.contains("image-embed md-img-right\"") && h.contains("width=\"240\""), "{h}");
        assert!(h.contains("image-embed md-img-left\"") && h.contains("alt=\"Cat\""), "{h}");
        assert!(h.contains("class=\"md-img-center\" src=\"https://example.com/a.png\" alt=\"Logo\" width=\"120\""), "{h}");
        assert!(h.contains("src=\"https://example.com/b.png\" alt=\"plain\""), "{h}");
        assert!(!h.contains("|center"), "{h}");
    }
    #[test]
    fn self_embed_stops() {
        let mut v = VaultIndex::new();
        v.set_text("A.md", "![[A]] text");
        let r = render_note(&mut v, "A.md", "![[A]] text", &RenderOptions::default());
        assert!(r.html.contains("internal-link"));
    }
}
