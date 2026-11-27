//! Org mode: `#+TITLE`/`#+AUTHOR`/`#+LANGUAGE`/`#+OPTIONS` (toc, num), `*` headings with CUSTOM_ID,
//! `*bold*` `/italic/` `+strike+` `~code~` with zero-width-space boundaries where Org needs them,
//! `\( \)` / `\[ \]` math, `[[url][text]]` links, `#+BEGIN_SRC`, `#+BEGIN_QUOTE`, alerts as special
//! blocks (`#+BEGIN_note`), `- [ ]` tasks, `[@N]` list starts, tables with alignment cookies,
//! `[fn:N]` footnotes, raw HTML as `#+BEGIN_EXPORT html`.
use super::ir::{alert_title, sole_image, Align, Block, Doc, Inline};
use super::text::indent;
use super::util::is_url;
use super::ExportInput;

const ZWSP: char = '\u{200B}';

pub fn write(doc: &Doc, input: &ExportInput) -> String {
    let m = &doc.meta;
    let mut s = format!("#+TITLE: {}\n", one(&m.title));
    if !m.author.is_empty() {
        s.push_str(&format!("#+AUTHOR: {}\n", one(&m.author)));
    }
    if !m.date.is_empty() {
        s.push_str(&format!("#+DATE: {}\n", one(&m.date)));
    }
    s.push_str(&format!("#+LANGUAGE: {}\n", m.language));
    s.push_str(&format!(
        "#+OPTIONS: toc:{} num:{} ^:{{}}\n",
        if input.options.toc { "t" } else { "nil" },
        if input.options.number_headings { "t" } else { "nil" }
    ));
    let ox = Ox { doc, base: doc.min_heading_level() };
    let mut parts = Vec::new();
    for b in &doc.blocks {
        let x = ox.block(b);
        if !x.is_empty() {
            parts.push(x);
        }
    }
    for f in &doc.footnotes {
        let body = f.blocks.iter().map(|b| ox.block(b)).collect::<Vec<_>>().join("\n\n");
        parts.push(format!("[fn:{}] {}", f.num, body));
    }
    s.push('\n');
    s.push_str(&parts.join("\n\n"));
    s.push('\n');
    s
}

fn one(s: &str) -> String {
    s.replace(['\n', '\r'], " ")
}

struct Ox<'a> {
    doc: &'a Doc,
    base: u8,
}

/// Wraps with an Org emphasis marker, adding zero-width spaces where the neighbours would break it.
fn emph(out: &mut String, m: char, inner: &str) {
    let inner_t = inner.trim();
    if inner_t.is_empty() {
        out.push_str(inner);
        return;
    }
    if inner.starts_with(' ') {
        out.push(' ');
    }
    if out.chars().last().is_some_and(|c| c.is_alphanumeric() || c == m) {
        out.push(ZWSP);
    }
    out.push(m);
    out.push_str(inner_t);
    out.push(m);
    out.push(ZWSP);
    if inner.ends_with(' ') {
        out.push(' ');
    }
}

fn link_text(s: &str) -> String {
    s.replace('[', "{").replace(']', "}")
}

fn escape_line_starts(s: &str) -> String {
    s.lines()
        .map(|l| {
            if l.starts_with('*') || l.starts_with("#+") || l.starts_with("- ") || l.starts_with("+ ") || l.starts_with('|') || l.starts_with("-----") {
                format!("{ZWSP}{l}")
            } else {
                l.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

impl Ox<'_> {
    fn block(&self, b: &Block) -> String {
        match b {
            Block::Heading { level, id, content, .. } => {
                let stars = "*".repeat((level - self.base) as usize + 1);
                format!("{stars} {}\n:PROPERTIES:\n:CUSTOM_ID: {}\n:END:", self.inl(content).replace('\n', " "), id.replace(' ', "-"))
            }
            Block::Para(v) => {
                if let Some((url, _, _)) = sole_image(v) {
                    return image(url);
                }
                escape_line_starts(&self.inl(v))
            }
            Block::Code { lang, text } => {
                let body: Vec<String> = text
                    .trim_end_matches('\n')
                    .lines()
                    .map(|l| if l.starts_with('*') || l.starts_with("#+") || l.starts_with(",*") || l.starts_with(",#+") { format!(",{l}") } else { l.to_string() })
                    .collect();
                if lang.is_empty() {
                    format!("#+BEGIN_EXAMPLE\n{}\n#+END_EXAMPLE", body.join("\n"))
                } else {
                    format!("#+BEGIN_SRC {lang}\n{}\n#+END_SRC", body.join("\n"))
                }
            }
            Block::Math(t) => format!("\\[\n{t}\n\\]"),
            Block::Quote(v) => {
                let inner = v.iter().map(|x| self.block(x)).collect::<Vec<_>>().join("\n\n");
                format!("#+BEGIN_QUOTE\n{inner}\n#+END_QUOTE")
            }
            Block::Alert { kind, title, blocks } => {
                let inner = blocks.iter().map(|x| self.block(x)).collect::<Vec<_>>().join("\n\n");
                let mut t = String::new();
                emph(&mut t, '*', &alert_title(*kind, title, &self.doc.meta.language));
                format!("#+BEGIN_{0}\n{t}\n\n{inner}\n#+END_{0}", kind.id())
            }
            Block::List { ordered, start, tight, items } => {
                let mut o = String::new();
                for (i, it) in items.iter().enumerate() {
                    if i > 0 {
                        o.push_str(if *tight { "\n" } else { "\n\n" });
                    }
                    let num = format!("{}. ", start + i);
                    let mut mark = if *ordered { num.clone() } else { "- ".to_string() };
                    let pad = " ".repeat(mark.len());
                    if *ordered && i == 0 && *start != 1 {
                        mark.push_str(&format!("[@{start}] "));
                    }
                    match it.task {
                        Some(true) => mark.push_str("[X] "),
                        Some(false) => mark.push_str("[ ] "),
                        None => {}
                    }
                    let body = it.blocks.iter().map(|x| self.block(x)).collect::<Vec<_>>().join(if *tight { "\n" } else { "\n\n" });
                    o.push_str(&indent(&body, &mark, &pad));
                }
                o
            }
            Block::Table { aligns, rows } => {
                let mut o = Vec::new();
                for (ri, r) in rows.iter().enumerate() {
                    let cells: Vec<String> = r.iter().map(|c| self.inl(c).replace('\n', " ").replace('|', "\\vert{}")).collect();
                    o.push(format!("| {} |", cells.join(" | ")));
                    if ri == 0 {
                        o.push(format!("|{}|", vec!["---"; r.len().max(1)].join("+")));
                        if aligns.iter().any(|a| *a != Align::None) {
                            let ck: Vec<&str> = aligns
                                .iter()
                                .map(|a| match a {
                                    Align::Center => "<c>",
                                    Align::Right => "<r>",
                                    Align::Left => "<l>",
                                    Align::None => "",
                                })
                                .collect();
                            o.push(format!("| {} |", ck.join(" | ")));
                        }
                    }
                }
                o.join("\n")
            }
            Block::Rule => "-----".to_string(),
            Block::Html(h) => format!("#+BEGIN_EXPORT html\n{}\n#+END_EXPORT", h.trim_end()),
        }
    }

    fn inl(&self, v: &[Inline]) -> String {
        let s = self.inl_raw(v);
        // keep a zero-width space only where an emphasis marker touches a word character
        let cs: Vec<char> = s.chars().collect();
        let mut o = String::with_capacity(s.len());
        for (i, &c) in cs.iter().enumerate() {
            if c == ZWSP {
                let next = cs.get(i + 1).copied();
                let prev = if i > 0 { Some(cs[i - 1]) } else { None };
                let marker = |x: Option<char>| x.is_some_and(|x| "*/+_~=".contains(x));
                let word = |x: Option<char>| x.is_some_and(|x| x.is_alphanumeric());
                if !(word(next) || (word(prev) && marker(next))) {
                    continue;
                }
            }
            o.push(c);
        }
        o
    }

    fn inl_raw(&self, v: &[Inline]) -> String {
        let mut s = String::new();
        for i in v {
            match i {
                Inline::Text(t) => s.push_str(t),
                Inline::Emph(c) => emph(&mut s, '/', &self.inl(c)),
                Inline::Strong(c) | Inline::Mark(c) => emph(&mut s, '*', &self.inl(c)),
                Inline::Strike(c) => emph(&mut s, '+', &self.inl(c)),
                Inline::Underline(c) => emph(&mut s, '_', &self.inl(c)),
                Inline::Sup(c) => s.push_str(&format!("^{{{}}}", self.inl(c))),
                Inline::Sub(c) => s.push_str(&format!("_{{{}}}", self.inl(c))),
                Inline::Code(t) => {
                    let m = if t.contains('~') { '=' } else { '~' };
                    emph(&mut s, m, t);
                }
                Inline::Math { display, tex } => {
                    if *display {
                        s.push_str(&format!("\\[{}\\]", tex.trim()));
                    } else {
                        s.push_str(&format!("\\({}\\)", tex.trim()));
                    }
                }
                Inline::Link { url, content, .. } => {
                    let text = link_text(&self.inl(content));
                    if url.is_empty() {
                        s.push_str(&text);
                    } else {
                        let target = if url.starts_with('#') || is_url(url) || url.contains(':') {
                            url.clone()
                        } else {
                            format!("file:{}", super::util::percent_decode(url))
                        };
                        s.push_str(&format!("[[{}][{}]]", target.replace(['[', ']'], ""), text));
                    }
                }
                Inline::Image { url, .. } => s.push_str(&image(url)),
                Inline::FootRef(n) => s.push_str(&format!("[fn:{n}]")),
                Inline::Soft => s.push('\n'),
                Inline::Hard => s.push_str("\\\\\n"),
                Inline::Html(h) => s.push_str(&format!("@@html:{h}@@")),
            }
        }
        s
    }
}

fn image(url: &str) -> String {
    if is_url(url) {
        format!("[[{}]]", url.replace(['[', ']'], ""))
    } else {
        format!("[[file:{}]]", super::util::percent_decode(url).replace(['[', ']'], ""))
    }
}
