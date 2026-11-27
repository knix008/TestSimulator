//! MediaWiki: `== headings ==`, `'''bold'''` / `''italic''`, `<s>`, `<mark>`, `<code><nowiki>`,
//! `<syntaxhighlight>`, `<math>`, `[url text]` / `[[Note|text]]` for links to notes, `[[File:…]]` images,
//! `<ref>` footnotes with `<references />`, `{| class="wikitable"` tables with alignment, alert boxes as
//! styled divs, `__TOC__`.
use super::ir::{alert_title, heading_prefix, sole_image, Align, Block, Doc, Inline};
use super::util::{html_escape, is_url, percent_decode};
use super::ExportInput;

pub fn write(doc: &Doc, input: &ExportInput) -> String {
    let mut wx = Wx { doc, base: doc.min_heading_level() };
    let mut parts: Vec<String> = Vec::new();
    if input.options.toc {
        parts.push("__TOC__".into());
    }
    for b in &doc.blocks {
        let s = wx.block(b, "");
        if !s.is_empty() {
            parts.push(s);
        }
    }
    if !doc.footnotes.is_empty() {
        let refs = if super::util::is_korean(&doc.meta.language) { "각주" } else { "Notes" };
        parts.push(format!("== {refs} ==\n<references />"));
    }
    let mut s = parts.join("\n\n");
    s.push('\n');
    s
}

struct Wx<'a> {
    doc: &'a Doc,
    base: u8,
}

/// Escapes wiki and HTML syntax in text.
fn esc(s: &str) -> String {
    html_escape(s)
        .replace('[', "&#91;")
        .replace(']', "&#93;")
        .replace('{', "&#123;")
        .replace('}', "&#125;")
        .replace('|', "&#124;")
        .replace("~~~", "&#126;~~")
        .replace("__", "&#95;_")
}

/// A paragraph that starts with list / indent / heading / table syntax gets a `<nowiki />` guard.
fn guard_start(s: String) -> String {
    if s.starts_with(['*', '#', ':', ';', '=', ' ', '-', '{', '|']) {
        format!("<nowiki />{s}")
    } else {
        s
    }
}

impl Wx<'_> {
    fn block(&mut self, b: &Block, list: &str) -> String {
        match b {
            Block::Heading { level, number, content, .. } => {
                let eq = "=".repeat(((level - self.base) as usize + 2).min(6));
                format!("{eq} {}{} {eq}", esc(&heading_prefix(number)), self.inl(content).replace('\n', " "))
            }
            Block::Para(v) => {
                if let Some((url, _, alt)) = sole_image(v) {
                    return self.image(url, alt, true);
                }
                let s = self.inl(v);
                if list.is_empty() {
                    guard_start(s)
                } else {
                    s.replace('\n', " ")
                }
            }
            Block::Code { lang, text } => {
                let body = text.trim_end_matches('\n');
                if lang.is_empty() {
                    format!("<pre>{}</pre>", html_escape(body))
                } else {
                    format!("<syntaxhighlight lang=\"{}\">\n{}\n</syntaxhighlight>", html_escape(lang), body.replace("</syntaxhighlight", "&lt;/syntaxhighlight"))
                }
            }
            Block::Math(t) => format!(":<math display=\"block\">{}</math>", t.replace("</math", "&lt;/math")),
            Block::Quote(v) => {
                let inner = v.iter().map(|x| self.block(x, "")).collect::<Vec<_>>().join("\n\n");
                format!("<blockquote>\n{inner}\n</blockquote>")
            }
            Block::Alert { kind, title, blocks } => {
                let inner = blocks.iter().map(|x| self.block(x, "")).collect::<Vec<_>>().join("\n\n");
                format!(
                    "<div class=\"markdown-alert markdown-alert-{}\" style=\"border-left:4px solid #{};background:#{};padding:0.5em 1em;margin:1em 0\">\n'''{}'''\n\n{inner}\n</div>",
                    kind.id(),
                    kind.color(),
                    kind.fill(),
                    esc(&alert_title(*kind, title, &self.doc.meta.language))
                )
            }
            Block::List { ordered, items, .. } => {
                let prefix = format!("{list}{}", if *ordered { "#" } else { "*" });
                let mut o = Vec::new();
                for it in items {
                    let mut line = format!("{prefix} ");
                    match it.task {
                        Some(true) => line.push_str("\u{2612} "),
                        Some(false) => line.push_str("\u{2610} "),
                        None => {}
                    }
                    let mut extra = Vec::new();
                    let mut first = true;
                    for x in &it.blocks {
                        match x {
                            Block::List { .. } => extra.push(self.block(x, &prefix)),
                            Block::Para(v) if first => line.push_str(&self.inl(v).replace('\n', " ")),
                            Block::Para(v) => line.push_str(&format!("<br />{}", self.inl(v).replace('\n', " "))),
                            Block::Code { text, .. } => line.push_str(&format!("<code><nowiki>{}</nowiki></code>", text.trim_end().replace('\n', " "))),
                            other => line.push_str(&format!("<br />{}", self.block(other, &prefix).replace('\n', " "))),
                        }
                        first = false;
                    }
                    o.push(line);
                    o.extend(extra);
                }
                o.join("\n")
            }
            Block::Table { aligns, rows } => {
                let mut o = String::from("{| class=\"wikitable\"\n");
                for (ri, r) in rows.iter().enumerate() {
                    if ri > 0 {
                        o.push_str("|-\n");
                    }
                    for (ci, c) in r.iter().enumerate() {
                        let a = match aligns.get(ci).copied().unwrap_or(Align::None) {
                            Align::Left => " style=\"text-align:left\" |",
                            Align::Center => " style=\"text-align:center\" |",
                            Align::Right => " style=\"text-align:right\" |",
                            Align::None => "",
                        };
                        o.push_str(&format!("{}{a} {}\n", if ri == 0 { "!" } else { "|" }, self.inl(c).replace('\n', " ")));
                    }
                }
                o.push_str("|}");
                o
            }
            Block::Rule => "----".into(),
            Block::Html(h) => h.trim_end().to_string(),
        }
    }

    fn image(&self, url: &str, alt: &str, block: bool) -> String {
        if is_url(url) {
            return format!("[{} {}]", url.replace(' ', "%20"), esc(if alt.is_empty() { url } else { alt }));
        }
        let name = percent_decode(url);
        let name = name.rsplit(['/', '\\']).next().unwrap_or(&name).to_string();
        if block {
            format!("[[File:{}|frameless|{}]]", name, esc(alt))
        } else {
            format!("[[File:{}|{}]]", name, esc(alt))
        }
    }

    fn inl(&mut self, v: &[Inline]) -> String {
        let mut s = String::new();
        for i in v {
            match i {
                Inline::Text(t) => s.push_str(&esc(t)),
                Inline::Emph(c) => s.push_str(&format!("''{}''", self.inl(c))),
                Inline::Strong(c) => s.push_str(&format!("'''{}'''", self.inl(c))),
                Inline::Strike(c) => s.push_str(&format!("<s>{}</s>", self.inl(c))),
                Inline::Mark(c) => s.push_str(&format!("<mark>{}</mark>", self.inl(c))),
                Inline::Sup(c) => s.push_str(&format!("<sup>{}</sup>", self.inl(c))),
                Inline::Sub(c) => s.push_str(&format!("<sub>{}</sub>", self.inl(c))),
                Inline::Underline(c) => s.push_str(&format!("<u>{}</u>", self.inl(c))),
                Inline::Code(t) => s.push_str(&format!("<code><nowiki>{}</nowiki></code>", t.replace("</nowiki", "&lt;/nowiki"))),
                Inline::Math { tex, .. } => s.push_str(&format!("<math>{}</math>", tex.replace("</math", "&lt;/math"))),
                Inline::Link { url, content, .. } => {
                    let text = self.inl(content);
                    if url.is_empty() {
                        s.push_str(&text);
                    } else if let Some(a) = url.strip_prefix('#') {
                        s.push_str(&format!("[[#{}|{}]]", percent_decode(a), text));
                    } else if is_url(url) {
                        s.push_str(&format!("[{} {}]", url.replace(' ', "%20"), text));
                    } else {
                        // a link to another note: [[Note name|text]]
                        let target = percent_decode(url);
                        let (path, frag) = match target.split_once('#') {
                            Some((p, f)) => (p.to_string(), Some(f.to_string())),
                            None => (target.clone(), None),
                        };
                        let page = path.strip_suffix(".md").unwrap_or(&path);
                        let page = page.rsplit('/').next().unwrap_or(page);
                        let full = match frag {
                            Some(f) => format!("{page}#{f}"),
                            None => page.to_string(),
                        };
                        s.push_str(&format!("[[{}|{}]]", full.replace(['[', ']', '|'], ""), text));
                    }
                }
                Inline::Image { url, alt, .. } => s.push_str(&self.image(url, alt, false)),
                Inline::FootRef(n) => match self.doc.footnote(*n) {
                    Some(f) => {
                        let blocks = f.blocks.clone();
                        let body = blocks.iter().map(|b| self.block(b, "")).collect::<Vec<_>>().join(" ");
                        s.push_str(&format!("<ref name=\"fn{n}\">{}</ref>", body.replace('\n', " ")));
                    }
                    None => s.push_str(&format!("<sup>{n}</sup>")),
                },
                Inline::Soft => s.push(' '),
                Inline::Hard => s.push_str("<br />\n"),
                Inline::Html(h) => s.push_str(h),
            }
        }
        s
    }
}
