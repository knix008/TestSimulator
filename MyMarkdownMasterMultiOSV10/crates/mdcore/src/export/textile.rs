//! Textile: `hN.` headings, bracketed phrase modifiers (`[*strong*]`, `[_em_]`, `[-del-]`, `[+ins+]`,
//! `[^sup^]`, `[~sub~]`, highlight as `[%{background:yellow}…%]`), `@code@`, `<pre><code>` blocks,
//! `bq.` quotes, alerts as classed paragraphs, `*`/`#` nested lists with task boxes, `|_.` tables with
//! alignment, `"text":url` links, `!img(alt)!`, `[n]` footnotes with `fnN.` definitions.
use super::ir::{alert_title, heading_prefix, sole_image, Align, Block, Doc, Inline};
use super::util::html_escape;
use super::ExportInput;

pub fn write(doc: &Doc, input: &ExportInput) -> String {
    let lang = doc.meta.language.clone();
    let mut parts: Vec<String> = Vec::new();
    if input.options.toc {
        let toc = doc.toc();
        if !toc.is_empty() {
            let base = toc.iter().map(|t| t.level).min().unwrap_or(1);
            let mut s = format!("p(toc-title). *{}*\n\n", super::html::toc_title(&lang));
            let mut prev = 0usize;
            for t in &toc {
                let d = ((t.level - base) as usize).min(prev + 1);
                s.push_str(&format!("{} \"{}\":#{}\n", "*".repeat(d + 1), esc(&format!("{}{}", heading_prefix(&t.number), t.text)), t.id));
                prev = d;
            }
            parts.push(s.trim_end().to_string());
        }
    }
    for b in &doc.blocks {
        let s = block(b, &lang, "");
        if !s.is_empty() {
            parts.push(s);
        }
    }
    for f in &doc.footnotes {
        let body: Vec<String> = f
            .blocks
            .iter()
            .map(|b| match b {
                Block::Para(v) => inl(v),
                other => block(other, &lang, ""),
            })
            .collect();
        parts.push(format!("fn{}. {}", f.num, body.join(" ").replace("\n\n", " ")));
    }
    let mut s = parts.join("\n\n");
    s.push('\n');
    s
}

/// Escapes text: HTML-escaped, wrapped in `==…==` (notextile) when it contains Textile markup characters.
fn esc(s: &str) -> String {
    let h = html_escape(s);
    let risky = h.contains(['*', '_', '@', '^', '~', '%', '|', '!', '+', '[', ']', '{', '}', '=', '"']) || h.contains(" -") || h.contains("- ");
    if risky && !h.contains("==") && !h.trim().is_empty() {
        // keep the surrounding spaces outside the notextile span
        let lead = &h[..h.len() - h.trim_start().len()];
        let trail = &h[h.trim_end().len()..];
        return format!("{lead}=={}=={trail}", h.trim());
    }
    h
}

fn needs_p(s: &str) -> bool {
    let t = s.trim_start();
    t.starts_with(['*', '#', '|', '-', '!', '(', '<', '_'])
        || t.split_once('.').is_some_and(|(head, _)| {
            head.len() <= 8 && !head.is_empty() && head.chars().all(|c| c.is_ascii_alphanumeric() || "(){}[]<>=".contains(c))
        })
}

fn para(s: &str) -> String {
    let flat = s.trim();
    if needs_p(flat) {
        format!("p. {flat}")
    } else {
        flat.to_string()
    }
}

fn block(b: &Block, lang: &str, list: &str) -> String {
    match b {
        Block::Heading { level, id, number, content } => {
            format!("h{level}(#{}). {}{}", id.replace(['(', ')', ' '], "-"), esc(&heading_prefix(number)), inl(content).replace('\n', " "))
        }
        Block::Para(v) => {
            if let Some((url, _, alt)) = sole_image(v) {
                return format!("p. !{}({})!", url.replace(' ', "%20"), alt.replace([')', '('], ""));
            }
            para(&inl(v))
        }
        Block::Code { lang: l, text } => {
            let cls = if l.is_empty() { String::new() } else { format!(" class=\"language-{}\"", html_escape(l)) };
            format!("<pre><code{cls}>{}</code></pre>", html_escape(text.trim_end_matches('\n')))
        }
        Block::Math(t) => format!("p(math). @{}@", html_escape(t).replace('@', "&#64;")),
        Block::Quote(v) => v
            .iter()
            .map(|x| match x {
                Block::Para(p) => format!("bq. {}", inl(p)),
                other => block(other, lang, ""),
            })
            .collect::<Vec<_>>()
            .join("\n\n"),
        Block::Alert { kind, title, blocks } => {
            let cls = format!("p(markdown-alert markdown-alert-{})", kind.id());
            let mut out = vec![format!("{cls}. *{}*", esc(&alert_title(*kind, title, lang)))];
            for x in blocks {
                out.push(match x {
                    Block::Para(p) => format!("{cls}. {}", inl(p)),
                    other => block(other, lang, ""),
                });
            }
            out.join("\n\n")
        }
        Block::List { ordered, items, .. } => {
            let prefix = format!("{list}{}", if *ordered { "#" } else { "*" });
            let mut o: Vec<String> = Vec::new();
            for it in items {
                let mut line = format!("{prefix} ");
                match it.task {
                    Some(true) => line.push_str("\u{2612} "),
                    Some(false) => line.push_str("\u{2610} "),
                    None => {}
                }
                let mut nested = Vec::new();
                let mut first = true;
                for x in &it.blocks {
                    match x {
                        Block::List { .. } => nested.push(block(x, lang, &prefix)),
                        Block::Para(v) => {
                            if !first {
                                line.push_str("<br />");
                            }
                            line.push_str(&inl(v).replace('\n', " "));
                        }
                        Block::Code { text, .. } => line.push_str(&format!(" @{}@", html_escape(text.trim_end()).replace('\n', " "))),
                        other => line.push_str(&format!(" {}", block(other, lang, "").replace('\n', " "))),
                    }
                    first = false;
                }
                o.push(line);
                o.extend(nested);
            }
            o.join("\n")
        }
        Block::Table { aligns, rows } => {
            let mut o = Vec::new();
            for (ri, r) in rows.iter().enumerate() {
                let mut line = String::from("|");
                for (ci, c) in r.iter().enumerate() {
                    let a = match aligns.get(ci).copied().unwrap_or(Align::None) {
                        Align::Left => "<",
                        Align::Center => "=",
                        Align::Right => ">",
                        Align::None => "",
                    };
                    let head = if ri == 0 { "_" } else { "" };
                    let sig = format!("{head}{a}");
                    let cell = inl(c).replace('\n', " ").replace('|', "&#124;");
                    if sig.is_empty() {
                        line.push_str(&format!(" {cell} |"));
                    } else {
                        line.push_str(&format!("{sig}. {cell} |"));
                    }
                }
                o.push(line);
            }
            o.join("\n")
        }
        Block::Rule => "<hr />".to_string(),
        Block::Html(h) => format!("<notextile>\n{}\n</notextile>", h.trim_end()),
    }
}

fn inl(v: &[Inline]) -> String {
    let mut s = String::new();
    for i in v {
        match i {
            Inline::Text(t) => s.push_str(&esc(t)),
            Inline::Emph(c) => s.push_str(&format!("[_{}_]", inl(c))),
            Inline::Strong(c) => s.push_str(&format!("[*{}*]", inl(c))),
            Inline::Strike(c) => s.push_str(&format!("[-{}-]", inl(c))),
            Inline::Mark(c) => s.push_str(&format!("[%{{background:yellow}}{}%]", inl(c))),
            Inline::Sup(c) => s.push_str(&format!("[^{}^]", inl(c))),
            Inline::Sub(c) => s.push_str(&format!("[~{}~]", inl(c))),
            Inline::Underline(c) => s.push_str(&format!("[+{}+]", inl(c))),
            Inline::Code(t) => s.push_str(&format!("[@{}@]", html_escape(t).replace('@', "&#64;"))),
            Inline::Math { tex, .. } => s.push_str(&format!("[@{}@]", html_escape(tex).replace('@', "&#64;"))),
            Inline::Link { url, content, .. } => {
                let text = inl(content);
                if url.is_empty() {
                    s.push_str(&text);
                } else {
                    s.push_str(&format!("[\"{}\":{}]", text.replace('"', "&quot;"), url.replace(' ', "%20").replace(']', "%5D")));
                }
            }
            Inline::Image { url, alt, .. } => s.push_str(&format!("!{}({})!", url.replace(' ', "%20"), alt.replace([')', '('], ""))),
            Inline::FootRef(n) => s.push_str(&format!("[{n}]")),
            Inline::Soft => s.push(' '),
            Inline::Hard => s.push('\n'),
            Inline::Html(h) => s.push_str(h),
        }
    }
    s
}
