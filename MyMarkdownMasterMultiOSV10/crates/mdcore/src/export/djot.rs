//! Djot (djot.net): `_emph_`, `*strong*`, `{=mark=}`, `{-del-}`, `{+ins+}`, `^sup^`, `~sub~`, `` $`math` ``,
//! fenced code, `>` quotes, alerts as `::: note` divs, pipe tables with alignment, tasks, footnotes,
//! raw HTML as `=html` raw blocks / inlines.
use super::ir::{alert_title, heading_prefix, Align, Block, Doc, Inline};
use super::text::indent;
use super::ExportInput;

pub fn write(doc: &Doc, input: &ExportInput) -> String {
    let lang = &doc.meta.language;
    let mut parts: Vec<String> = Vec::new();
    if input.options.toc {
        let toc = doc.toc();
        if !toc.is_empty() {
            let base = toc.iter().map(|t| t.level).min().unwrap_or(1);
            let mut s = String::new();
            let mut prev = 0usize;
            for t in &toc {
                let d = ((t.level - base) as usize).min(prev + 1);
                if d > prev && !s.is_empty() {
                    s.push('\n');
                }
                s.push_str(&format!("{}- [{}](#{})\n", "  ".repeat(d), esc(&format!("{}{}", heading_prefix(&t.number), t.text)), djot_id(&t.text)));
                prev = d;
            }
            parts.push(s.trim_end().to_string());
        }
    }
    for b in &doc.blocks {
        let s = block(b, lang, 0);
        if !s.is_empty() {
            parts.push(s);
        }
    }
    for f in &doc.footnotes {
        let body = f.blocks.iter().map(|b| block(b, lang, 0)).collect::<Vec<_>>().join("\n\n");
        parts.push(indent(&body, &format!("[^{}]: ", f.num), "  "));
    }
    let mut s = parts.join("\n\n");
    s.push('\n');
    s
}

/// djot's automatic heading identifier (words joined by '-', punctuation dropped).
fn djot_id(text: &str) -> String {
    text.split(|c: char| c.is_whitespace() || (c.is_ascii_punctuation() && c != '_' && c != '-'))
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '\\' | '*' | '_' | '`' | '[' | ']' | '{' | '}' | '~' | '^' | '$' | '!' | '<' | '>' | '|') {
            o.push('\\');
        }
        o.push(c);
    }
    o
}

fn fence_for(text: &str, ch: char) -> String {
    let mut max = 0;
    let mut cur = 0;
    for c in text.chars() {
        if c == ch {
            cur += 1;
            max = max.max(cur);
        } else {
            cur = 0;
        }
    }
    ch.to_string().repeat((max + 1).max(3))
}

fn escape_line_starts(s: &str) -> String {
    s.lines()
        .map(|l| {
            let t = l.trim_start();
            let starts_special = t.starts_with('#')
                || t.starts_with("- ")
                || t.starts_with("+ ")
                || t.starts_with(": ")
                || t.starts_with("* ")
                || t.chars().take_while(|c| c.is_ascii_digit()).count() > 0 && t.trim_start_matches(|c: char| c.is_ascii_digit()).starts_with(['.', ')']);
            if starts_special && !t.starts_with('\\') {
                let p = l.len() - t.len();
                format!("{}\\{}", &l[..p], t)
            } else {
                l.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn block(b: &Block, lang: &str, div: usize) -> String {
    match b {
        Block::Heading { level, number, content, .. } => {
            format!("{} {}{}", "#".repeat(*level as usize), esc(&heading_prefix(number)), inl(content).replace('\n', " "))
        }
        Block::Para(v) => escape_line_starts(&inl(v)),
        Block::Code { lang: l, text } => {
            let f = fence_for(text, '`');
            format!("{f}{}\n{}\n{f}", if l.is_empty() { String::new() } else { format!(" {l}") }, text.trim_end_matches('\n'))
        }
        Block::Math(t) => format!("$${}", code_span(t)),
        Block::Quote(v) => {
            let inner = v.iter().map(|x| block(x, lang, div)).collect::<Vec<_>>().join("\n\n");
            indent(&inner, "> ", "> ")
        }
        Block::Alert { kind, title, blocks } => {
            let colons = ":".repeat(3 + div);
            let inner = blocks.iter().map(|x| block(x, lang, div + 1)).collect::<Vec<_>>().join("\n\n");
            format!("{colons} {}\n*{}*\n\n{inner}\n{colons}", kind.id(), esc(&alert_title(*kind, title, lang)))
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
                let pad = " ".repeat(if *ordered { format!("{}. ", start + i).len() } else { 2 });
                let mut body = String::new();
                for (bi, x) in it.blocks.iter().enumerate() {
                    if bi > 0 {
                        body.push_str(if *tight && !matches!(x, Block::List { .. }) && !matches!(it.blocks[bi - 1], Block::List { .. }) { "\n" } else { "\n\n" });
                    }
                    body.push_str(&block(x, lang, div));
                }
                o.push_str(&indent(&body, &mark, &pad));
            }
            o
        }
        Block::Table { aligns, rows } => {
            let mut o = String::new();
            for (ri, r) in rows.iter().enumerate() {
                let cells: Vec<String> = r.iter().map(|c| inl(c).replace('\n', " ")).collect();
                o.push_str(&format!("| {} |\n", cells.join(" | ")));
                if ri == 0 {
                    let seps: Vec<&str> = aligns
                        .iter()
                        .map(|a| match a {
                            Align::Left => ":---",
                            Align::Center => ":---:",
                            Align::Right => "---:",
                            Align::None => "---",
                        })
                        .collect();
                    o.push_str(&format!("|{}|\n", seps.join("|")));
                }
            }
            o.trim_end().to_string()
        }
        Block::Rule => "* * *".to_string(),
        Block::Html(h) => {
            let f = fence_for(h, '`');
            format!("{f} =html\n{}\n{f}", h.trim_end())
        }
    }
}

fn code_span(t: &str) -> String {
    let n = {
        let mut max = 0;
        let mut cur = 0;
        for c in t.chars() {
            if c == '`' {
                cur += 1;
                max = max.max(cur);
            } else {
                cur = 0;
            }
        }
        max
    };
    let ticks = "`".repeat(n + 1);
    let pad = if t.starts_with('`') || t.ends_with('`') { " " } else { "" };
    format!("{ticks}{pad}{t}{pad}{ticks}")
}

fn inl(v: &[Inline]) -> String {
    let mut s = String::new();
    for i in v {
        match i {
            Inline::Text(t) => s.push_str(&esc(t)),
            Inline::Emph(c) => s.push_str(&format!("{{_{}_}}", inl(c))),
            Inline::Strong(c) => s.push_str(&format!("{{*{}*}}", inl(c))),
            Inline::Strike(c) => s.push_str(&format!("{{-{}-}}", inl(c))),
            Inline::Mark(c) => s.push_str(&format!("{{={}=}}", inl(c))),
            Inline::Sup(c) => s.push_str(&format!("{{^{}^}}", inl(c))),
            Inline::Sub(c) => s.push_str(&format!("{{~{}~}}", inl(c))),
            Inline::Underline(c) => s.push_str(&format!("{{+{}+}}", inl(c))),
            Inline::Code(t) => s.push_str(&code_span(t)),
            Inline::Math { display, tex } => s.push_str(&format!("{}{}", if *display { "$$" } else { "$" }, code_span(tex))),
            Inline::Link { url, title, content } => {
                s.push_str(&format!("[{}]({})", inl(content), url.replace(')', "%29").replace(' ', "%20")));
                if !title.is_empty() {
                    s.push_str(&format!("{{title=\"{}\"}}", title.replace('"', "\\\"")));
                }
            }
            Inline::Image { url, alt, .. } => s.push_str(&format!("![{}]({})", esc(alt), url.replace(')', "%29").replace(' ', "%20"))),
            Inline::FootRef(n) => s.push_str(&format!("[^{n}]")),
            Inline::Soft => s.push('\n'),
            Inline::Hard => s.push_str("\\\n"),
            Inline::Html(h) => s.push_str(&format!("{}{{=html}}", code_span(h))),
        }
    }
    s
}
