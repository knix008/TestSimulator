//! AsciiDoc (Asciidoctor): document header with author/lang/toc, sections `==`…, unconstrained inline
//! marks, text with markup characters protected by `+…+` passthroughs, `[source,lang]` blocks,
//! `[stem]` math (latexmath), quotes, admonition blocks (`[NOTE]` / `.Title`), nested lists with `+`
//! continuations and task markers, tables with column alignment, footnote macros, passthrough HTML.
use super::ir::{heading_prefix, plain, sole_image, Align, Block, Doc, Inline};
use super::ExportInput;

pub fn write(doc: &Doc, input: &ExportInput) -> String {
    let m = &doc.meta;
    let mut s = format!("= {}\n", one_line(&m.title));
    if !m.author.is_empty() {
        s.push_str(&format!("{}\n", one_line(&m.author)));
    }
    if !m.date.is_empty() {
        s.push_str(&format!(":revdate: {}\n", one_line(&m.date)));
    }
    s.push_str(&format!(":lang: {}\n:stem: latexmath\n:icons: font\n", m.language));
    if input.options.toc {
        s.push_str(&format!(":toc:\n:toc-title: {}\n", super::html::toc_title(&m.language)));
    }
    let mut ax = Ax { base: doc.min_heading_level(), doc };
    for b in &doc.blocks {
        let x = ax.block(b, 0, 0);
        if !x.is_empty() {
            s.push('\n');
            s.push_str(&x);
            s.push('\n');
        }
    }
    s
}

fn one_line(s: &str) -> String {
    s.replace(['\n', '\r'], " ")
}

struct Ax<'a> {
    base: u8,
    doc: &'a Doc,
}

const SPECIAL: &[char] = &['*', '_', '#', '`', '^', '~', '[', ']', '{', '}', '+', '\\', '|'];

/// Plain text: wrapped in a `+…+` passthrough when it contains characters AsciiDoc might interpret.
fn esc(t: &str) -> String {
    if !t.contains(SPECIAL) && !t.contains("<<") {
        return t.to_string();
    }
    if t.contains("++") || t.ends_with('+') || t.starts_with('+') {
        // fall back to attribute references for the worst characters
        let mut o = String::new();
        for c in t.chars() {
            match c {
                '*' => o.push_str("{asterisk}"),
                '+' => o.push_str("{plus}"),
                '`' => o.push_str("{backtick}"),
                '^' => o.push_str("{caret}"),
                '~' => o.push_str("{tilde}"),
                '[' => o.push_str("{startsb}"),
                ']' => o.push_str("{endsb}"),
                '|' => o.push_str("{vbar}"),
                c => o.push(c),
            }
        }
        return o;
    }
    // an unconstrained passthrough: no formatting, but < > & are still escaped
    format!("++{t}++")
}

fn bracket_esc(s: &str) -> String {
    s.replace(']', "\\]")
}

impl Ax<'_> {
    fn block(&mut self, b: &Block, list_depth: usize, delim: usize) -> String {
        match b {
            Block::Heading { level, id, number, content } => {
                let d = ((level - self.base) as usize + 2).min(6);
                format!("[[{}]]\n{} {}{}", anchor(id), "=".repeat(d), esc(&heading_prefix(number)), self.inl(content).replace('\n', " "))
            }
            Block::Para(v) => {
                if let Some((url, _, alt)) = sole_image(v) {
                    return format!("image::{}[{}]", url.replace(' ', "%20"), bracket_esc(alt));
                }
                let s = self.inl(v);
                // a paragraph starting with list / block syntax
                if s.starts_with(['.', '*', '-', '=', '[', '|']) || s.starts_with("NOTE:") || s.starts_with("TIP:") {
                    format!("{{empty}}{s}")
                } else {
                    s
                }
            }
            Block::Code { lang, text } => {
                let body = text.trim_end_matches('\n');
                let mut f = "----".to_string();
                while body.lines().any(|l| l.trim_end() == f) {
                    f.push('-');
                }
                if lang.is_empty() {
                    format!("[source]\n{f}\n{body}\n{f}")
                } else {
                    format!("[source,{lang}]\n{f}\n{body}\n{f}")
                }
            }
            Block::Math(t) => format!("[stem]\n++++\n{t}\n++++"),
            Block::Quote(v) => {
                let f = "_".repeat(4 + delim);
                let inner = v.iter().map(|x| self.block(x, 0, delim + 1)).collect::<Vec<_>>().join("\n\n");
                format!("{f}\n{inner}\n{f}")
            }
            Block::Alert { kind, title, blocks } => {
                let f = "=".repeat(4 + delim);
                let inner = blocks.iter().map(|x| self.block(x, 0, delim + 1)).collect::<Vec<_>>().join("\n\n");
                let mut s = String::new();
                if !title.is_empty() {
                    s.push_str(&format!(".{}\n", one_line(title)));
                }
                s.push_str(&format!("[{}]\n{f}\n{inner}\n{f}", kind.id().to_ascii_uppercase()));
                s
            }
            Block::List { ordered, start, items, .. } => {
                let mut o = String::new();
                if *ordered && *start != 1 {
                    o.push_str(&format!("[start={start}]\n"));
                }
                let marker = if *ordered { ".".repeat(list_depth + 1) } else { "*".repeat(list_depth + 1) };
                for (i, it) in items.iter().enumerate() {
                    if i > 0 {
                        o.push('\n');
                    }
                    o.push_str(&marker);
                    o.push(' ');
                    match it.task {
                        Some(true) => o.push_str("[x] "),
                        Some(false) => o.push_str("[ ] "),
                        None => {}
                    }
                    let mut first = true;
                    for x in &it.blocks {
                        match x {
                            Block::List { .. } => {
                                o.push('\n');
                                o.push_str(&self.block(x, list_depth + 1, delim));
                            }
                            Block::Para(v) if first => o.push_str(&self.inl(v)),
                            _ => {
                                if !first {
                                    o.push_str("\n+\n");
                                } else {
                                    o.push_str("{empty}\n+\n");
                                }
                                o.push_str(&self.block(x, 0, delim));
                            }
                        }
                        first = false;
                    }
                    if it.blocks.is_empty() {
                        o.push_str("{empty}");
                    }
                }
                o
            }
            Block::Table { aligns, rows } => {
                let cols: Vec<&str> = aligns
                    .iter()
                    .map(|a| match a {
                        Align::Center => "^",
                        Align::Right => ">",
                        _ => "<",
                    })
                    .collect();
                let mut o = format!("[cols=\"{}\",options=\"header\"]\n|===\n", cols.join(","));
                for (ri, r) in rows.iter().enumerate() {
                    let cells: Vec<String> = r.iter().map(|c| format!("|{}", self.inl(c).replace('\n', " ").replace('|', "{vbar}"))).collect();
                    o.push_str(&cells.join(" "));
                    o.push('\n');
                    if ri == 0 {
                        o.push('\n');
                    }
                }
                o.push_str("|===");
                o
            }
            Block::Rule => "'''".to_string(),
            Block::Html(h) => format!("++++\n{}\n++++", h.trim_end()),
        }
    }

    fn inl(&mut self, v: &[Inline]) -> String {
        let mut s = String::new();
        for i in v {
            match i {
                Inline::Text(t) => s.push_str(&esc(t)),
                Inline::Emph(c) => s.push_str(&format!("__{}__", self.inl(c))),
                Inline::Strong(c) => s.push_str(&format!("**{}**", self.inl(c))),
                Inline::Strike(c) => s.push_str(&format!("[.line-through]##{}##", self.inl(c))),
                Inline::Mark(c) => s.push_str(&format!("##{}##", self.inl(c))),
                Inline::Sup(c) => s.push_str(&format!("^{}^", self.inl(c))),
                Inline::Sub(c) => s.push_str(&format!("~{}~", self.inl(c))),
                Inline::Underline(c) => s.push_str(&format!("[.underline]##{}##", self.inl(c))),
                Inline::Code(t) => {
                    if t.contains('+') || t.contains('`') {
                        s.push_str(&format!("``pass:c[{}]``", bracket_esc(t)));
                    } else {
                        s.push_str(&format!("``+{t}+``"));
                    }
                }
                Inline::Math { tex, .. } => s.push_str(&format!("stem:[{}]", bracket_esc(tex.trim()))),
                Inline::Link { url, content, .. } => {
                    let text = self.inl(content);
                    if url.is_empty() {
                        s.push_str(&text);
                    } else if let Some(a) = url.strip_prefix('#') {
                        s.push_str(&format!("<<{},{}>>", anchor(&super::util::percent_decode(a)), plain(content).replace(">>", "> >")));
                    } else {
                        let u = url.replace(' ', "%20");
                        let macro_ = if super::util::is_url(&u) { u } else { format!("link:{u}") };
                        s.push_str(&format!("{macro_}[{}]", bracket_esc(&text)));
                    }
                }
                Inline::Image { url, alt, .. } => s.push_str(&format!("image:{}[{}]", url.replace(' ', "%20"), bracket_esc(alt))),
                Inline::FootRef(n) => match self.doc.footnote(*n) {
                    Some(f) => {
                        let text = super::ir::plain_blocks(&f.blocks).replace("\n\n", " ").replace('\n', " ");
                        s.push_str(&format!("footnote:[{}]", bracket_esc(&esc(&text))));
                    }
                    None => s.push_str(&format!("^{n}^")),
                },
                Inline::Soft => s.push('\n'),
                Inline::Hard => s.push_str(" +\n"),
                Inline::Html(h) => s.push_str(&format!("pass:[{}]", bracket_esc(h))),
            }
        }
        s
    }
}

fn anchor(id: &str) -> String {
    // AsciiDoc block ids: letters, digits, '_', '-', '.', must start with a letter or '_'
    let mut o = String::from("_");
    for c in id.chars() {
        if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
            o.push(c);
        } else {
            o.push('_');
        }
    }
    o
}
