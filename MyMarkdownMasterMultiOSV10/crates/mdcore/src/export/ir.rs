//! The shared walker: turns the comrak AST into a small, owned document tree that every writer renders.
//! Doing it once here keeps the formats consistent (heading numbers, footnote numbers, `==highlight==`
//! pairing, alert titles, front-matter metadata) and keeps comrak's arena lifetimes out of the writers.
use std::collections::HashMap;

use comrak::nodes::{AlertType, AstNode, ListType, NodeValue, TableAlignment};
use comrak::{parse_document, Anchorizer, Arena};

use super::util::{is_korean, lang_or_default};
use super::ExportInput;
use crate::options::markdown_options;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Align {
    None,
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlertKind {
    Note,
    Tip,
    Important,
    Warning,
    Caution,
}

impl AlertKind {
    /// Lower-case id: note, tip, important, warning, caution (also the RST / AsciiDoc admonition name).
    pub fn id(&self) -> &'static str {
        match self {
            AlertKind::Note => "note",
            AlertKind::Tip => "tip",
            AlertKind::Important => "important",
            AlertKind::Warning => "warning",
            AlertKind::Caution => "caution",
        }
    }
    pub fn default_title(&self, lang: &str) -> &'static str {
        let ko = is_korean(lang);
        match (self, ko) {
            (AlertKind::Note, false) => "Note",
            (AlertKind::Tip, false) => "Tip",
            (AlertKind::Important, false) => "Important",
            (AlertKind::Warning, false) => "Warning",
            (AlertKind::Caution, false) => "Caution",
            (AlertKind::Note, true) => "참고",
            (AlertKind::Tip, true) => "팁",
            (AlertKind::Important, true) => "중요",
            (AlertKind::Warning, true) => "경고",
            (AlertKind::Caution, true) => "주의",
        }
    }
    /// An RGB accent colour (hex without #) used by the office formats.
    pub fn color(&self) -> &'static str {
        match self {
            AlertKind::Note => "0969DA",
            AlertKind::Tip => "1A7F37",
            AlertKind::Important => "8250DF",
            AlertKind::Warning => "9A6700",
            AlertKind::Caution => "CF222E",
        }
    }
    /// A light background colour (hex without #).
    pub fn fill(&self) -> &'static str {
        match self {
            AlertKind::Note => "DDF4FF",
            AlertKind::Tip => "DAFBE1",
            AlertKind::Important => "FBEFFF",
            AlertKind::Warning => "FFF8C5",
            AlertKind::Caution => "FFEBE9",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Inline {
    Text(String),
    Emph(Vec<Inline>),
    Strong(Vec<Inline>),
    Strike(Vec<Inline>),
    Mark(Vec<Inline>),
    Sup(Vec<Inline>),
    Sub(Vec<Inline>),
    Underline(Vec<Inline>),
    Code(String),
    Math { display: bool, tex: String },
    Link { url: String, title: String, content: Vec<Inline> },
    Image { url: String, title: String, alt: String },
    FootRef(u32),
    Soft,
    Hard,
    Html(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    /// `Some(checked)` for task items.
    pub task: Option<bool>,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Heading { level: u8, id: String, number: String, content: Vec<Inline> },
    Para(Vec<Inline>),
    Code { lang: String, text: String },
    Math(String),
    Quote(Vec<Block>),
    Alert { kind: AlertKind, title: String, blocks: Vec<Block> },
    List { ordered: bool, start: usize, tight: bool, items: Vec<Item> },
    /// `rows[0]` is the header row; every row has `aligns.len()` cells.
    Table { aligns: Vec<Align>, rows: Vec<Vec<Vec<Inline>>> },
    Rule,
    Html(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Footnote {
    pub num: u32,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Meta {
    pub title: String,
    pub author: String,
    pub language: String,
    pub date: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Doc {
    pub meta: Meta,
    pub blocks: Vec<Block>,
    pub footnotes: Vec<Footnote>,
}

pub struct TocEntry {
    pub level: u8,
    pub number: String,
    pub text: String,
    pub id: String,
}

impl Doc {
    pub fn footnote(&self, num: u32) -> Option<&Footnote> {
        self.footnotes.iter().find(|f| f.num == num)
    }
    /// Top-level headings in order.
    pub fn toc(&self) -> Vec<TocEntry> {
        self.blocks
            .iter()
            .filter_map(|b| match b {
                Block::Heading { level, id, number, content } => Some(TocEntry {
                    level: *level,
                    number: number.clone(),
                    text: plain(content),
                    id: id.clone(),
                }),
                _ => None,
            })
            .collect()
    }
    pub fn min_heading_level(&self) -> u8 {
        self.blocks
            .iter()
            .filter_map(|b| if let Block::Heading { level, .. } = b { Some(*level) } else { None })
            .min()
            .unwrap_or(1)
    }
}

/// Heading text with its number ("1.2 Title") when numbering is on.
pub fn heading_prefix(number: &str) -> String {
    if number.is_empty() {
        String::new()
    } else {
        format!("{number} ")
    }
}

/// Plain text of inlines (soft break → space, hard break → newline, images → alt, math → TeX).
pub fn plain(v: &[Inline]) -> String {
    let mut s = String::new();
    plain_into(v, &mut s);
    s
}

fn plain_into(v: &[Inline], s: &mut String) {
    for i in v {
        match i {
            Inline::Text(t) | Inline::Code(t) => s.push_str(t),
            Inline::Math { tex, .. } => s.push_str(tex),
            Inline::Emph(c)
            | Inline::Strong(c)
            | Inline::Strike(c)
            | Inline::Mark(c)
            | Inline::Sup(c)
            | Inline::Sub(c)
            | Inline::Underline(c) => plain_into(c, s),
            Inline::Link { content, .. } => plain_into(content, s),
            Inline::Image { alt, .. } => s.push_str(alt),
            Inline::FootRef(n) => s.push_str(&format!("[{n}]")),
            Inline::Soft => s.push(' '),
            Inline::Hard => s.push('\n'),
            Inline::Html(_) => {}
        }
    }
}

/// Plain text of a block list (paragraphs separated by blank lines, list items by newlines).
pub fn plain_blocks(v: &[Block]) -> String {
    let mut parts: Vec<String> = Vec::new();
    for b in v {
        match b {
            Block::Heading { number, content, .. } => parts.push(format!("{}{}", heading_prefix(number), plain(content))),
            Block::Para(c) => parts.push(plain(c)),
            Block::Code { text, .. } => parts.push(text.trim_end_matches('\n').to_string()),
            Block::Math(t) => parts.push(t.clone()),
            Block::Quote(c) => parts.push(plain_blocks(c)),
            Block::Alert { title, blocks, .. } => parts.push(format!("{title}: {}", plain_blocks(blocks))),
            Block::List { ordered, start, items, .. } => {
                let mut s = String::new();
                for (i, it) in items.iter().enumerate() {
                    if i > 0 {
                        s.push('\n');
                    }
                    let mark = match it.task {
                        Some(true) => "[x] ".to_string(),
                        Some(false) => "[ ] ".to_string(),
                        None if *ordered => format!("{}. ", start + i),
                        None => "- ".to_string(),
                    };
                    s.push_str(&mark);
                    s.push_str(&plain_blocks(&it.blocks).replace("\n\n", "\n"));
                }
                parts.push(s);
            }
            Block::Table { rows, .. } => parts.push(
                rows.iter().map(|r| r.iter().map(|c| plain(c)).collect::<Vec<_>>().join("\t")).collect::<Vec<_>>().join("\n"),
            ),
            Block::Rule => {}
            Block::Html(h) => {
                let t = strip_tags(h);
                if !t.trim().is_empty() {
                    parts.push(t.trim().to_string())
                }
            }
        }
    }
    parts.join("\n\n")
}

/// If the inlines are exactly one image (ignoring surrounding whitespace), returns it.
pub fn sole_image(v: &[Inline]) -> Option<(&str, &str, &str)> {
    let mut found = None;
    for i in v {
        match i {
            Inline::Image { url, title, alt } if found.is_none() => found = Some((url.as_str(), title.as_str(), alt.as_str())),
            Inline::Text(t) if t.trim().is_empty() => {}
            Inline::Soft | Inline::Hard => {}
            _ => return None,
        }
    }
    found
}

/// Removes tags and decodes the common entities (for raw HTML in non-HTML formats).
pub fn strip_tags(h: &str) -> String {
    let mut o = String::new();
    let mut in_tag = false;
    let mut in_comment = false;
    let b = h.as_bytes();
    let mut i = 0;
    while i < h.len() {
        if in_comment {
            if h[i..].starts_with("-->") {
                in_comment = false;
                i += 3;
            } else {
                i += 1;
            }
            continue;
        }
        if !in_tag && h[i..].starts_with("<!--") {
            in_comment = true;
            i += 4;
            continue;
        }
        let c = b[i];
        if c == b'<' && i + 1 < b.len() && (b[i + 1].is_ascii_alphabetic() || b[i + 1] == b'/' || b[i + 1] == b'!') {
            in_tag = true;
        } else if c == b'>' && in_tag {
            in_tag = false;
        } else if !in_tag {
            let ch = h[i..].chars().next().unwrap();
            o.push(ch);
            i += ch.len_utf8();
            continue;
        }
        i += 1;
    }
    super::htmltok::decode_entities(&o)
}

struct Ctx {
    anchors: Anchorizer,
    fn_defs: HashMap<String, Vec<Block>>,
    fn_nums: HashMap<String, u32>,
}

/// Parses `input.markdown` and builds the document tree.
pub fn build(input: &ExportInput) -> Doc {
    let arena = Arena::new();
    let opts = markdown_options();
    let root = parse_document(&arena, &input.markdown, &opts);
    build_from(root, input)
}

pub fn build_from<'a>(root: &'a AstNode<'a>, input: &ExportInput) -> Doc {
    let mut cx = Ctx { anchors: Anchorizer::new(), fn_defs: HashMap::new(), fn_nums: HashMap::new() };
    // footnote numbers come from the references (comrak numbers them in reading order)
    for n in root.descendants() {
        if let NodeValue::FootnoteReference(r) = &n.data.borrow().value {
            cx.fn_nums.entry(r.name.to_lowercase()).or_insert(r.ix.max(1));
        }
    }
    let mut fm = String::new();
    let mut blocks = Vec::new();
    for c in root.children() {
        let is_fm = matches!(&c.data.borrow().value, NodeValue::FrontMatter(_));
        if is_fm {
            if let NodeValue::FrontMatter(s) = &c.data.borrow().value {
                fm = s.clone();
            }
            continue;
        }
        if let Some(b) = block(c, &mut cx) {
            blocks.push(b);
        }
    }
    let mut footnotes: Vec<Footnote> = Vec::new();
    let mut nums: Vec<(String, u32)> = cx.fn_nums.iter().map(|(k, v)| (k.clone(), *v)).collect();
    nums.sort_by_key(|x| x.1);
    for (name, num) in nums {
        if let Some(b) = cx.fn_defs.remove(&name) {
            footnotes.push(Footnote { num, blocks: b });
        } else {
            footnotes.push(Footnote { num, blocks: vec![Block::Para(vec![Inline::Text(format!("[^{name}]"))])] });
        }
    }

    let fm_map = parse_front_matter(&fm);
    let first_h1 = blocks.iter().find_map(|b| match b {
        Block::Heading { level: 1, content, .. } => Some(plain(content)),
        _ => None,
    });
    let pick = |a: &str, k: &str| -> String {
        if !a.trim().is_empty() {
            a.trim().to_string()
        } else {
            fm_map.get(k).cloned().unwrap_or_default()
        }
    };
    let mut title = pick(&input.title, "title");
    if title.is_empty() {
        title = first_h1.unwrap_or_else(|| if is_korean(&input.language) { "제목 없음".into() } else { "Untitled".into() });
    }
    let meta = Meta {
        title,
        author: pick(&input.author, "author"),
        language: lang_or_default(&if input.language.trim().is_empty() {
            fm_map.get("lang").or(fm_map.get("language")).cloned().unwrap_or_default()
        } else {
            input.language.clone()
        }),
        date: pick(&input.date, "date"),
    };
    let mut doc = Doc { meta, blocks, footnotes };
    if input.options.number_headings {
        number_headings(&mut doc);
    }
    doc
}

/// `key: value` pairs from YAML front matter (scalars only; quotes stripped; lists ignored).
fn parse_front_matter(fm: &str) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for line in fm.lines() {
        let l = line.trim_end();
        if l.starts_with(' ') || l.starts_with('-') || l.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = l.split_once(':') {
            let v = v.trim().trim_matches('"').trim_matches('\'').trim();
            if !v.is_empty() {
                m.insert(k.trim().to_ascii_lowercase(), v.to_string());
            }
        }
    }
    m
}

fn number_headings(doc: &mut Doc) {
    let base = doc.min_heading_level();
    let mut c = [0u32; 7];
    for b in doc.blocks.iter_mut() {
        if let Block::Heading { level, number, .. } = b {
            let d = (*level - base) as usize; // 0-based depth
            c[d] += 1;
            for x in c.iter_mut().skip(d + 1) {
                *x = 0;
            }
            let parts: Vec<String> = (0..=d).map(|i| c[i].to_string()).collect();
            *number = parts.join(".");
        }
    }
}

fn children_blocks<'a>(n: &'a AstNode<'a>, cx: &mut Ctx) -> Vec<Block> {
    n.children().filter_map(|c| block(c, cx)).collect()
}

fn block<'a>(n: &'a AstNode<'a>, cx: &mut Ctx) -> Option<Block> {
    let v = n.data.borrow().value.clone();
    Some(match v {
        NodeValue::Heading(h) => {
            let content = inlines(n);
            let text = collect_text(n);
            let id = cx.anchors.anchorize(text);
            Block::Heading { level: h.level.clamp(1, 6), id, number: String::new(), content }
        }
        NodeValue::Paragraph => {
            let content = inlines(n);
            if content.is_empty() {
                return None;
            }
            let non_ws: Vec<&Inline> =
                content.iter().filter(|i| !matches!(i, Inline::Soft | Inline::Hard) && !matches!(i, Inline::Text(t) if t.trim().is_empty())).collect();
            if non_ws.len() == 1 {
                if let Inline::Math { display: true, tex } = non_ws[0] {
                    return Some(Block::Math(tex.trim().to_string()));
                }
            }
            Block::Para(content)
        }
        NodeValue::CodeBlock(cb) => {
            let lang = cb.info.split_whitespace().next().unwrap_or("").to_string();
            if lang.eq_ignore_ascii_case("math") {
                Block::Math(cb.literal.trim().to_string())
            } else {
                Block::Code { lang, text: cb.literal }
            }
        }
        NodeValue::BlockQuote | NodeValue::MultilineBlockQuote(_) => Block::Quote(children_blocks(n, cx)),
        NodeValue::Alert(a) => {
            let kind = match a.alert_type {
                AlertType::Note => AlertKind::Note,
                AlertType::Tip => AlertKind::Tip,
                AlertType::Important => AlertKind::Important,
                AlertType::Warning => AlertKind::Warning,
                AlertType::Caution => AlertKind::Caution,
            };
            let title = a.title.clone().filter(|t| !t.trim().is_empty()).map(|t| t.trim().to_string());
            Block::Alert { kind, title: title.unwrap_or_default(), blocks: children_blocks(n, cx) }
        }
        NodeValue::List(l) => {
            let mut items = Vec::new();
            for c in n.children() {
                let task = match &c.data.borrow().value {
                    NodeValue::TaskItem(ch) => Some(ch.map(|x| x != ' ').unwrap_or(false)),
                    _ => None,
                };
                items.push(Item { task, blocks: children_blocks(c, cx) });
            }
            Block::List { ordered: l.list_type == ListType::Ordered, start: l.start, tight: l.tight, items }
        }
        NodeValue::Table(t) => {
            let aligns: Vec<Align> = t
                .alignments
                .iter()
                .map(|a| match a {
                    TableAlignment::Left => Align::Left,
                    TableAlignment::Center => Align::Center,
                    TableAlignment::Right => Align::Right,
                    TableAlignment::None => Align::None,
                })
                .collect();
            let ncol = aligns.len();
            let mut rows = Vec::new();
            for r in n.children() {
                let mut cells: Vec<Vec<Inline>> = r.children().map(inlines).collect();
                cells.resize(ncol.max(cells.len()), Vec::new());
                cells.truncate(ncol.max(1));
                rows.push(cells);
            }
            Block::Table { aligns, rows }
        }
        NodeValue::ThematicBreak => Block::Rule,
        NodeValue::HtmlBlock(h) => Block::Html(h.literal),
        NodeValue::FootnoteDefinition(d) => {
            let b = children_blocks(n, cx);
            cx.fn_defs.insert(d.name.to_lowercase(), b);
            return None;
        }
        NodeValue::FrontMatter(_) => return None,
        NodeValue::DescriptionList => {
            // rendered as a bullet list of "term: details"
            let mut items = Vec::new();
            for it in n.children() {
                let mut blocks = Vec::new();
                for part in it.children() {
                    blocks.extend(children_blocks(part, cx));
                }
                items.push(Item { task: None, blocks });
            }
            Block::List { ordered: false, start: 1, tight: true, items }
        }
        NodeValue::Document => Block::Quote(children_blocks(n, cx)),
        _ => {
            // an unknown block container: keep its children
            let b = children_blocks(n, cx);
            if b.is_empty() {
                return None;
            }
            Block::Quote(b)
        }
    })
}

fn collect_text<'a>(n: &'a AstNode<'a>) -> String {
    let mut s = String::new();
    for d in n.descendants() {
        match &d.data.borrow().value {
            NodeValue::Text(t) => s.push_str(t),
            NodeValue::Code(c) => s.push_str(&c.literal),
            NodeValue::Math(m) => s.push_str(&m.literal),
            _ => {}
        }
    }
    s
}

fn inlines<'a>(n: &'a AstNode<'a>) -> Vec<Inline> {
    let v: Vec<Inline> = n.children().filter_map(inline).collect();
    pair_highlights(v)
}

fn inline<'a>(n: &'a AstNode<'a>) -> Option<Inline> {
    let v = n.data.borrow().value.clone();
    Some(match v {
        NodeValue::Text(t) => Inline::Text(t),
        NodeValue::SoftBreak => Inline::Soft,
        NodeValue::LineBreak => Inline::Hard,
        NodeValue::Code(c) => Inline::Code(c.literal),
        NodeValue::HtmlInline(h) => {
            let l = h.trim().to_ascii_lowercase().replace(' ', "");
            if l == "<br>" || l == "<br/>" {
                Inline::Hard
            } else {
                Inline::Html(h)
            }
        }
        NodeValue::Emph => Inline::Emph(inlines(n)),
        NodeValue::Strong => Inline::Strong(inlines(n)),
        NodeValue::Strikethrough => Inline::Strike(inlines(n)),
        NodeValue::Superscript => Inline::Sup(inlines(n)),
        NodeValue::Subscript => Inline::Sub(inlines(n)),
        NodeValue::Underline => Inline::Underline(inlines(n)),
        NodeValue::Link(l) => Inline::Link { url: l.url, title: l.title, content: inlines(n) },
        NodeValue::WikiLink(l) => Inline::Link { url: l.url, title: String::new(), content: inlines(n) },
        NodeValue::Image(l) => Inline::Image { url: l.url, title: l.title, alt: plain(&inlines(n)) },
        NodeValue::FootnoteReference(r) => Inline::FootRef(r.ix.max(1)),
        NodeValue::Math(m) => Inline::Math { display: m.display_math, tex: m.literal },
        NodeValue::EscapedTag(t) => Inline::Text(t),
        NodeValue::Raw(r) => Inline::Html(r),
        _ => {
            let c = inlines(n);
            if c.is_empty() {
                return None;
            }
            if c.len() == 1 {
                return c.into_iter().next();
            }
            Inline::Emph(c) // spoiler etc. — keep the text, lightly emphasised
        }
    })
}

/// Pairs `==` markers inside text runs of one inline list into `Inline::Mark`. Like Obsidian, an opening
/// marker must be followed by a non-space and a closing one preceded by a non-space ("a == b" stays text).
fn pair_highlights(v: Vec<Inline>) -> Vec<Inline> {
    if !v.iter().any(|i| matches!(i, Inline::Text(t) if t.contains("=="))) {
        return merge_text(v);
    }
    enum P {
        I(Inline),
        /// (can_open, can_close)
        M(bool, bool),
    }
    let n = v.len();
    let mut ps: Vec<P> = Vec::new();
    for (idx, i) in v.into_iter().enumerate() {
        match i {
            Inline::Text(t) if t.contains("==") => {
                let has_prev = idx > 0;
                let has_next = idx + 1 < n;
                let mut start = 0;
                while let Some(p) = t[start..].find("==") {
                    let p = start + p;
                    if p > start {
                        ps.push(P::I(Inline::Text(t[start..p].to_string())));
                    }
                    let before = t[..p].chars().last();
                    let after = t[p + 2..].chars().next();
                    let prev_ok = match before {
                        Some(c) => !c.is_whitespace(),
                        None => has_prev,
                    };
                    let next_ok = match after {
                        Some(c) => !c.is_whitespace() && c != '=',
                        None => has_next,
                    };
                    ps.push(P::M(next_ok, prev_ok));
                    start = p + 2;
                }
                if start < t.len() {
                    ps.push(P::I(Inline::Text(t[start..].to_string())));
                }
            }
            other => ps.push(P::I(other)),
        }
    }
    let mut out: Vec<Inline> = Vec::new();
    let mut open: Option<Vec<Inline>> = None;
    for p in ps {
        match p {
            P::M(_, true) if open.as_ref().is_some_and(|o| !o.is_empty()) => {
                let inner = open.take().unwrap();
                out.push(Inline::Mark(merge_text(inner)));
            }
            P::M(true, _) => {
                if let Some(prev) = open.take() {
                    out.push(Inline::Text("==".into()));
                    out.extend(prev);
                }
                open = Some(Vec::new());
            }
            P::M(..) => match open.as_mut() {
                Some(o) => o.push(Inline::Text("==".into())),
                None => out.push(Inline::Text("==".into())),
            },
            P::I(i) => match open.as_mut() {
                Some(o) => o.push(i),
                None => out.push(i),
            },
        }
    }
    if let Some(inner) = open {
        out.push(Inline::Text("==".into()));
        out.extend(inner);
    }
    merge_text(out)
}

fn merge_text(v: Vec<Inline>) -> Vec<Inline> {
    let mut out: Vec<Inline> = Vec::with_capacity(v.len());
    for i in v {
        if let Inline::Text(t) = &i {
            if let Some(Inline::Text(prev)) = out.last_mut() {
                prev.push_str(t);
                continue;
            }
        }
        out.push(i);
    }
    out
}

/// Shortcut for writers that need the alert's displayed title.
pub fn alert_title(kind: AlertKind, title: &str, lang: &str) -> String {
    if title.is_empty() {
        kind.default_title(lang).to_string()
    } else {
        title.to_string()
    }
}
