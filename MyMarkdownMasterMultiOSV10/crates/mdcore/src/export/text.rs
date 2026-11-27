//! Plain text: headings underlined (= / -), list markers, quotes as "> ", code indented, tables padded to
//! the display width (Korean counts double), footnotes listed at the end, links as "text <url>".
use super::ir::{alert_title, heading_prefix, Align, Block, Doc, Inline};
use super::util::{pad_to, str_width};
use super::ExportInput;

pub fn write(doc: &Doc, input: &ExportInput) -> String {
    let mut parts: Vec<String> = Vec::new();
    if input.options.toc {
        let toc = doc.toc();
        if !toc.is_empty() {
            let base = toc.iter().map(|t| t.level).min().unwrap_or(1);
            let mut s = String::from(super::html::toc_title(&doc.meta.language));
            s.push('\n');
            for t in &toc {
                s.push_str(&format!("{}{}{}\n", "  ".repeat((t.level - base) as usize), heading_prefix(&t.number), t.text));
            }
            parts.push(s.trim_end().to_string());
        }
    }
    parts.push(blocks(&doc.blocks, &doc.meta.language));
    if !doc.footnotes.is_empty() {
        let mut s = String::from("----------\n");
        for f in &doc.footnotes {
            let body = blocks(&f.blocks, &doc.meta.language);
            s.push_str(&indent(&body, &format!("[{}] ", f.num), "    "));
            s.push('\n');
        }
        parts.push(s.trim_end().to_string());
    }
    let mut out = parts.into_iter().filter(|p| !p.is_empty()).collect::<Vec<_>>().join("\n\n");
    out.push('\n');
    out
}

/// Prefixes the first line with `first` and the rest with `rest`.
pub fn indent(s: &str, first: &str, rest: &str) -> String {
    let mut o = String::new();
    for (i, l) in s.lines().enumerate() {
        if i > 0 {
            o.push('\n');
        }
        let p = if i == 0 { first } else { rest };
        if l.is_empty() {
            o.push_str(p.trim_end());
        } else {
            o.push_str(p);
            o.push_str(l);
        }
    }
    if s.is_empty() {
        o.push_str(first.trim_end());
    }
    o
}

pub fn blocks(v: &[Block], lang: &str) -> String {
    v.iter().map(|b| block(b, lang)).filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n\n")
}

fn block(b: &Block, lang: &str) -> String {
    match b {
        Block::Heading { level, number, content, .. } => {
            let t = format!("{}{}", heading_prefix(number), inl(content));
            match level {
                1 => format!("{t}\n{}", "=".repeat(str_width(&t).max(3))),
                2 => format!("{t}\n{}", "-".repeat(str_width(&t).max(3))),
                _ => t,
            }
        }
        Block::Para(c) => inl(c),
        Block::Code { text, .. } => indent(text.trim_end_matches('\n'), "    ", "    "),
        Block::Math(t) => indent(t, "    ", "    "),
        Block::Quote(c) => indent(&blocks(c, lang), "> ", "> "),
        Block::Alert { kind, title, blocks: c } => {
            let body = format!("{}:\n{}", alert_title(*kind, title, lang), blocks(c, lang));
            indent(&body, "| ", "| ")
        }
        Block::List { ordered, start, tight, items } => {
            let mut o = String::new();
            for (i, it) in items.iter().enumerate() {
                if i > 0 {
                    o.push_str(if *tight { "\n" } else { "\n\n" });
                }
                let mut mark = if *ordered { format!("{}. ", start + i) } else { "- ".to_string() };
                match it.task {
                    Some(true) => mark.push_str("[x] "),
                    Some(false) => mark.push_str("[ ] "),
                    None => {}
                }
                let body = it.blocks.iter().map(|b| block(b, lang)).collect::<Vec<_>>().join(if *tight { "\n" } else { "\n\n" });
                let pad = " ".repeat(if *ordered { format!("{}. ", start + i).len() } else { 2 });
                o.push_str(&indent(&body, &mark, &pad));
            }
            o
        }
        Block::Table { aligns, rows } => table(aligns, rows),
        Block::Rule => "----------".to_string(),
        Block::Html(h) => super::ir::strip_tags(h).trim().to_string(),
    }
}

fn table(aligns: &[Align], rows: &[Vec<Vec<Inline>>]) -> String {
    let cells: Vec<Vec<String>> = rows.iter().map(|r| r.iter().map(|c| inl(c).replace('\n', " ")).collect()).collect();
    let n = aligns.len().max(cells.iter().map(|r| r.len()).max().unwrap_or(0));
    let mut w = vec![1usize; n];
    for r in &cells {
        for (i, c) in r.iter().enumerate() {
            w[i] = w[i].max(str_width(c));
        }
    }
    let mut o = String::new();
    for (ri, r) in cells.iter().enumerate() {
        let line: Vec<String> = (0..n)
            .map(|i| pad_to(r.get(i).map(|s| s.as_str()).unwrap_or(""), w[i], aligns.get(i).copied().unwrap_or(Align::None)))
            .collect();
        o.push_str(line.join(" | ").trim_end());
        o.push('\n');
        if ri == 0 {
            o.push_str(&w.iter().map(|x| "-".repeat(*x)).collect::<Vec<_>>().join("-+-"));
            o.push('\n');
        }
    }
    o.trim_end().to_string()
}

pub fn inl(v: &[Inline]) -> String {
    let mut s = String::new();
    for i in v {
        match i {
            Inline::Text(t) | Inline::Code(t) => s.push_str(t),
            Inline::Math { tex, .. } => s.push_str(tex),
            Inline::Emph(c) | Inline::Strong(c) | Inline::Strike(c) | Inline::Mark(c) | Inline::Underline(c) => s.push_str(&inl(c)),
            Inline::Sup(c) => {
                s.push('^');
                s.push_str(&inl(c));
            }
            Inline::Sub(c) => {
                s.push('_');
                s.push_str(&inl(c));
            }
            Inline::Link { url, content, .. } => {
                let t = inl(content);
                s.push_str(&t);
                if !url.is_empty() && !url.starts_with('#') && t != *url && format!("mailto:{t}") != *url {
                    let shown = if super::util::is_url(url) { url.clone() } else { super::util::percent_decode(url) };
                    s.push_str(&format!(" <{shown}>"));
                }
            }
            Inline::Image { url, alt, .. } => {
                if alt.is_empty() {
                    s.push_str(&format!("[image: {url}]"));
                } else {
                    s.push_str(&format!("[image: {alt}]"));
                }
            }
            Inline::FootRef(n) => s.push_str(&format!("[{n}]")),
            Inline::Soft => s.push(' '),
            Inline::Hard => s.push('\n'),
            Inline::Html(_) => {}
        }
    }
    s
}
