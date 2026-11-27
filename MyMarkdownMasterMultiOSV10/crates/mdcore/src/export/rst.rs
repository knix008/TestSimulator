//! reStructuredText (docutils / Sphinx): section adornments by level, inline markup with the boundary
//! escapes rST needs (`\ `), anonymous hyperlinks, `:math:` / `.. math::`, `.. code::`, admonitions
//! (`.. note::` … or `.. admonition::` with a custom title), list-table, numbered footnotes, images via
//! `.. image::` or substitutions, raw HTML as `.. raw:: html`, `.. contents::` for the TOC.
use super::ir::{heading_prefix, plain, sole_image, Block, Doc, Inline};
use super::text::indent;
use super::util::str_width;
use super::ExportInput;

struct Rx {
    subs: Vec<String>,
}

pub fn write(doc: &Doc, input: &ExportInput) -> String {
    let mut rx = Rx { subs: Vec::new() };
    let mut parts: Vec<String> = Vec::new();
    let mut meta = String::new();
    if !doc.meta.author.is_empty() {
        meta.push_str(&format!(".. |author| replace:: {}\n", esc(&doc.meta.author)));
    }
    meta.push_str(&format!(".. meta::\n   :title: {}", doc.meta.title.replace('\n', " ")));
    if !doc.meta.author.is_empty() {
        meta.push_str(&format!("\n   :author: {}", doc.meta.author.replace('\n', " ")));
    }
    parts.push(meta);
    if input.options.toc {
        parts.push(format!(".. contents:: {}\n   :local:", super::html::toc_title(&doc.meta.language)));
    }
    let base = doc.min_heading_level();
    for b in &doc.blocks {
        let s = rx.block(b, base);
        if !s.is_empty() {
            parts.push(s);
        }
    }
    for f in &doc.footnotes {
        let body = f.blocks.iter().map(|b| rx.block(b, base)).collect::<Vec<_>>().join("\n\n");
        parts.push(indent(&body, &format!(".. [{}] ", f.num), "   "));
    }
    let subs = std::mem::take(&mut rx.subs);
    parts.extend(subs);
    let mut s = parts.join("\n\n");
    s.push('\n');
    s
}

/// Escapes rST inline markup characters in plain text.
fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '\\' | '*' | '`' | '|' | '_' | '[' | ']') {
            o.push('\\');
        }
        o.push(c);
    }
    o
}

/// Escapes text inside an inline-literal-free markup span (`*…*`, `**…**`, link text).
fn esc_in(s: &str) -> String {
    let mut o = String::new();
    for c in s.chars() {
        if matches!(c, '\\' | '*' | '`' | '<' | '>') {
            o.push('\\');
        }
        o.push(c);
    }
    o
}

enum Piece {
    Text(String),
    /// inline markup that needs whitespace/punctuation boundaries around it
    Mark(String),
    Raw(String),
}

const BEFORE_OK: &[char] = &['-', ':', '/', '\'', '"', '<', '(', '[', '{', ' ', '\n'];
const AFTER_OK: &[char] = &['-', '.', ',', ':', ';', '!', '?', '\\', '/', '\'', '"', ')', ']', '}', '>', ' ', '\n'];

fn join(ps: Vec<Piece>) -> String {
    let mut o = String::new();
    let mut prev_mark = false;
    for p in ps {
        match p {
            Piece::Text(t) => {
                if prev_mark && t.chars().next().is_some_and(|c| !AFTER_OK.contains(&c)) {
                    o.push_str("\\ ");
                }
                o.push_str(&t);
                prev_mark = false;
            }
            Piece::Raw(t) => {
                o.push_str(&t);
                prev_mark = false;
            }
            Piece::Mark(m) => {
                if (prev_mark || o.chars().last().is_some_and(|c| !BEFORE_OK.contains(&c))) && !o.is_empty() {
                    o.push_str("\\ ");
                }
                o.push_str(&m);
                prev_mark = true;
            }
        }
    }
    o
}

/// Wraps `inner` in markup `open`/`close`, moving surrounding whitespace outside (rST forbids it inside).
fn mark(ps: &mut Vec<Piece>, open: &str, inner: &str, close: &str) {
    let lead = inner.len() - inner.trim_start().len();
    let t = inner.trim();
    if t.is_empty() {
        ps.push(Piece::Text(inner.to_string()));
        return;
    }
    if lead > 0 {
        ps.push(Piece::Text(" ".into()));
    }
    ps.push(Piece::Mark(format!("{open}{t}{close}")));
    if inner.len() > inner.trim_end().len() {
        ps.push(Piece::Text(" ".into()));
    }
}

fn literal(t: &str) -> String {
    let t = t.replace('\n', " ");
    if t.trim().is_empty() {
        return "\\ ".into();
    }
    if t.contains("``") {
        format!(":literal:`{}`", t.replace('\\', "\\\\").replace('`', "\\`"))
    } else {
        format!("``{}``", t.trim())
    }
}

fn adorn(level_depth: usize) -> char {
    ['=', '-', '~', '^', '"', '\''][level_depth.min(5)]
}

impl Rx {
    fn block(&mut self, b: &Block, base: u8) -> String {
        match b {
            Block::Heading { level, number, content, .. } => {
                let t = format!("{}{}", esc(&heading_prefix(number)), self.inl(content)).replace('\n', " ");
                let ch = adorn((level - base) as usize);
                let line: String = std::iter::repeat_n(ch, str_width(&t).max(3)).collect();
                if *level == base {
                    format!("{line}\n{t}\n{line}")
                } else {
                    format!("{t}\n{line}")
                }
            }
            Block::Para(v) => {
                if let Some((url, _, alt)) = sole_image(v) {
                    let mut s = format!(".. image:: {}", url.replace(' ', "%20"));
                    if !alt.is_empty() {
                        s.push_str(&format!("\n   :alt: {alt}"));
                    }
                    return s;
                }
                let s = self.inl(v);
                escape_starts(&s)
            }
            Block::Code { lang, text } => {
                let head = if lang.is_empty() { "::".to_string() } else { format!(".. code:: {lang}") };
                format!("{head}\n\n{}", indent(text.trim_end_matches('\n'), "   ", "   "))
            }
            Block::Math(t) => format!(".. math::\n\n{}", indent(t, "   ", "   ")),
            Block::Quote(v) => {
                let inner = v.iter().map(|x| self.block(x, base)).collect::<Vec<_>>().join("\n\n");
                // an empty comment keeps the quote from attaching to a preceding list / paragraph
                format!("..\n\n{}", indent(&inner, "    ", "    "))
            }
            Block::Alert { kind, title, blocks } => {
                let inner = blocks.iter().map(|x| self.block(x, base)).collect::<Vec<_>>().join("\n\n");
                let head = if title.is_empty() {
                    format!(".. {}::", kind.id())
                } else {
                    format!(".. admonition:: {}\n   :class: {}", title.replace('\n', " "), kind.id())
                };
                if inner.is_empty() {
                    head
                } else {
                    format!("{head}\n\n{}", indent(&inner, "   ", "   "))
                }
            }
            Block::List { ordered, start, items, .. } => {
                let mut o = String::new();
                for (i, it) in items.iter().enumerate() {
                    if i > 0 {
                        o.push_str("\n\n");
                    }
                    let num = format!("{}. ", start + i);
                    let mark = if *ordered { num.clone() } else { "- ".to_string() };
                    let task = match it.task {
                        Some(true) => "\u{2612} ",
                        Some(false) => "\u{2610} ",
                        None => "",
                    };
                    let pad = " ".repeat(mark.len());
                    let body = it.blocks.iter().map(|x| self.block(x, base)).collect::<Vec<_>>().join("\n\n");
                    let body = format!("{task}{body}");
                    o.push_str(&indent(&body, &mark, &pad));
                }
                o
            }
            Block::Table { aligns, rows } => {
                let n = aligns.len().max(1);
                let mut o = String::from(".. list-table::\n   :header-rows: 1\n");
                for r in rows {
                    o.push('\n');
                    for c in 0..n {
                        let cell = r.get(c).map(|x| self.inl(x).replace('\n', " ")).unwrap_or_default();
                        let lead = if c == 0 { "   * - " } else { "     - " };
                        if cell.trim().is_empty() {
                            o.push_str(lead.trim_end());
                        } else {
                            o.push_str(lead);
                            o.push_str(&cell);
                        }
                        o.push('\n');
                    }
                }
                o.trim_end().to_string()
            }
            Block::Rule => "----------".to_string(),
            Block::Html(h) => format!(".. raw:: html\n\n{}", indent(h.trim_end(), "   ", "   ")),
        }
    }

    fn inl(&mut self, v: &[Inline]) -> String {
        let mut ps = Vec::new();
        self.pieces(v, &mut ps);
        join(ps)
    }

    fn pieces(&mut self, v: &[Inline], ps: &mut Vec<Piece>) {
        for i in v {
            match i {
                Inline::Text(t) => ps.push(Piece::Text(esc(t))),
                Inline::Emph(c) => mark(ps, "*", &esc_in(&plain(c)), "*"),
                Inline::Strong(c) | Inline::Mark(c) => mark(ps, "**", &esc_in(&plain(c)), "**"),
                Inline::Strike(c) | Inline::Underline(c) => self.pieces(c, ps),
                Inline::Sup(c) => mark(ps, ":sup:`", &esc_in(&plain(c)), "`"),
                Inline::Sub(c) => mark(ps, ":sub:`", &esc_in(&plain(c)), "`"),
                Inline::Code(t) => ps.push(Piece::Mark(literal(t))),
                Inline::Math { tex, .. } => ps.push(Piece::Mark(format!(":math:`{}`", tex.trim().replace('`', "\\`")))),
                Inline::Link { url, content, .. } => {
                    let text = plain(content);
                    if url.is_empty() {
                        ps.push(Piece::Text(esc(&text)));
                    } else if text == *url {
                        ps.push(Piece::Text(esc(url)));
                    } else {
                        let t = esc_in(&text).replace('\n', " ");
                        let t = if t.trim().is_empty() { esc_in(url) } else { t.trim().to_string() };
                        ps.push(Piece::Mark(format!("`{t} <{}>`__", url.replace(' ', "%20").replace('>', "%3E"))));
                    }
                }
                Inline::Image { url, alt, .. } => {
                    let n = self.subs.len() + 1;
                    let mut d = format!(".. |img{n}| image:: {}", url.replace(' ', "%20"));
                    if !alt.is_empty() {
                        d.push_str(&format!("\n   :alt: {}", alt.replace('\n', " ")));
                    }
                    self.subs.push(d);
                    ps.push(Piece::Mark(format!("|img{n}|")));
                }
                Inline::FootRef(n) => ps.push(Piece::Mark(format!("[{n}]_"))),
                Inline::Soft => ps.push(Piece::Raw("\n".into())),
                Inline::Hard => ps.push(Piece::Raw("\n".into())),
                Inline::Html(_) => {}
            }
        }
    }
}

/// Escapes paragraph lines that rST would read as list items, directives or section underlines.
fn escape_starts(s: &str) -> String {
    s.lines()
        .map(|l| {
            let t = l.trim_start();
            let special = t.starts_with("- ")
                || t.starts_with("+ ")
                || t.starts_with("* ")
                || t.starts_with("..")
                || t.starts_with("#.")
                || t.starts_with(':')
                || (t.chars().take_while(|c| c.is_ascii_digit()).count() > 0 && t.trim_start_matches(|c: char| c.is_ascii_digit()).starts_with(['.', ')']))
                || (t.len() >= 3 && t.chars().all(|c| c == t.chars().next().unwrap()) && t.chars().next().unwrap().is_ascii_punctuation());
            if special {
                format!("\\{t}")
            } else {
                t.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}
