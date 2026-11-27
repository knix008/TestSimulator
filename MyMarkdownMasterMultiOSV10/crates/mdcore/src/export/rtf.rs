//! RTF 1.9: font table (body, monospace, a Korean-capable font), colour table, `\uN?` escapes for every
//! non-ASCII character (UTF-16, surrogate pairs above the BMP), headings by size, bold/italic/strike/
//! highlight, lists as indented paragraphs with markers, tables as `\trowd` rows, footnotes as `\footnote`,
//! hyperlinks as HYPERLINK fields and PNG/JPEG images as `\pict` when embedding is on.
use super::ir::{alert_title, heading_prefix, sole_image, strip_tags, Align, Block, Doc, Inline};
use super::util::{fit_pt, img_kind, img_size, is_korean, lookup, ImgKind};
use super::ExportInput;

/// RTF-escapes text (`\`, `{`, `}`, non-ASCII as `\uN?`, tab → `\tab`, newline → `\line`).
pub fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => o.push_str("\\\\"),
            '{' => o.push_str("\\{"),
            '}' => o.push_str("\\}"),
            '\t' => o.push_str("\\tab "),
            '\n' => o.push_str("\\line "),
            '\r' => {}
            c if (c as u32) < 0x20 => {}
            c if (c as u32) < 0x80 => o.push(c),
            c => {
                let mut buf = [0u16; 2];
                for u in c.encode_utf16(&mut buf).iter() {
                    o.push_str(&format!("\\u{}?", *u as i16));
                }
            }
        }
    }
    o
}

#[derive(Clone, Copy, Default)]
struct Cx {
    indent: u32, // twips
    footnote: bool,
    quote: bool,
}

struct Rx<'a> {
    input: &'a ExportInput<'a>,
    doc: &'a Doc,
    fn_used: std::collections::HashSet<u32>,
    max_w_pt: f64,
    base_size: u32, // half-points
}

pub fn write(doc: &Doc, input: &ExportInput) -> String {
    let ko = is_korean(&doc.meta.language);
    let font = if input.options.font_family.trim().is_empty() {
        if ko { "Malgun Gothic".to_string() } else { "Calibri".to_string() }
    } else {
        input.options.font_family.split(',').next().unwrap_or("Calibri").trim().trim_matches('"').to_string()
    };
    let letter = input.options.page_size.eq_ignore_ascii_case("letter");
    let (pw, ph) = if letter { (12240, 15840) } else { (11906, 16838) };
    let base_size = ((input.options.font_size_pt.clamp(5.0, 72.0)) * 2.0).round() as u32;
    let mut rx = Rx { input, doc, fn_used: Default::default(), max_w_pt: (pw - 2880) as f64 / 20.0, base_size };
    let mut s = String::new();
    s.push_str(&format!(
        "{{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\\deflang{}\\deflangfe1042\n{{\\fonttbl{{\\f0\\fswiss\\fcharset{} {};}}{{\\f1\\fmodern\\fcharset0 Consolas;}}{{\\f2\\fnil\\fcharset129 Malgun Gothic;}}}}\n",
        if ko { 1042 } else { 1033 },
        if ko { 129 } else { 0 },
        esc(&font)
    ));
    s.push_str("{\\colortbl;\\red0\\green0\\blue0;\\red5\\green99\\blue193;\\red255\\green255\\blue0;\\red246\\green248\\blue250;\\red128\\green128\\blue128;\\red149\\green55\\blue53;\\red31\\green56\\blue100;}\n");
    s.push_str(&format!("{{\\info{{\\title {}}}", esc(&doc.meta.title)));
    if !doc.meta.author.is_empty() {
        s.push_str(&format!("{{\\author {}}}", esc(&doc.meta.author)));
    }
    s.push_str("}\n");
    s.push_str(&format!("\\paperw{pw}\\paperh{ph}\\margl1440\\margr1440\\margt1440\\margb1440\\ftnbj\\ftnrstcont\\viewkind4\n"));
    s.push_str(&format!("\\pard\\plain\\f0\\fs{base_size}\n"));
    if input.options.toc {
        let toc = doc.toc();
        if !toc.is_empty() {
            let base = toc.iter().map(|t| t.level).min().unwrap_or(1);
            s.push_str(&format!("\\pard\\sb240\\sa120\\b\\fs{} {}\\b0\\fs{base_size}\\par\n", base_size + 8, esc(super::html::toc_title(&doc.meta.language))));
            for t in &toc {
                s.push_str(&format!("\\pard\\li{}\\sa40 {}{}\\par\n", (t.level - base) as u32 * 360, esc(&heading_prefix(&t.number)), esc(&t.text)));
            }
        }
    }
    for b in &doc.blocks {
        s.push_str(&rx.block(b, Cx::default()));
    }
    s.push_str("}\n");
    s
}

impl Rx<'_> {
    fn pard(&self, cx: &Cx) -> String {
        let mut p = format!("\\pard\\plain\\f0\\fs{}\\sa120", self.base_size);
        if cx.indent > 0 {
            p.push_str(&format!("\\li{}", cx.indent));
        }
        p.push(' ');
        p
    }

    fn block(&mut self, b: &Block, cx: Cx) -> String {
        let fs = self.base_size;
        match b {
            Block::Heading { level, number, content, .. } => {
                let sizes = [2.0f32, 1.6, 1.35, 1.15, 1.0, 0.95];
                let hs = (fs as f32 * sizes[(*level as usize - 1).min(5)]).round() as u32;
                format!(
                    "\\pard\\plain\\f0\\keepn\\sb{}\\sa120{}\\outlinelevel{}\\b\\cf7\\fs{hs} {}{}\\par\n",
                    if *level <= 2 { 360 } else { 240 },
                    if cx.indent > 0 { format!("\\li{}", cx.indent) } else { String::new() },
                    level - 1,
                    esc(&heading_prefix(number)),
                    self.inlines(content, &cx)
                )
            }
            Block::Para(v) => {
                if let Some((url, _, alt)) = sole_image(v) {
                    if let Some(p) = self.pict(url, alt) {
                        return format!("{}\\qc {p}\\par\n", self.pard(&cx));
                    }
                }
                let style = if cx.quote { "\\i\\cf5 " } else { "" };
                format!("{}{}{}\\par\n", self.pard(&cx), style, self.inlines(v, &cx))
            }
            Block::Code { text, .. } => {
                let mut o = String::new();
                let lines: Vec<&str> = text.trim_end_matches('\n').split('\n').collect();
                let n = lines.len();
                for (i, l) in lines.iter().enumerate() {
                    o.push_str(&format!(
                        "\\pard\\plain\\li{}\\ri113\\sa{}\\cbpat4\\f1\\fs{} {}\\par\n",
                        cx.indent + 113,
                        if i + 1 == n { 160 } else { 0 },
                        fs.saturating_sub(2),
                        esc(l)
                    ));
                }
                o
            }
            Block::Math(t) => format!("{}\\qc\\f1 {}\\par\n", self.pard(&cx), esc(t)),
            Block::Quote(v) => {
                let inner = Cx { indent: cx.indent + 567, quote: true, ..cx };
                v.iter().map(|x| self.block(x, inner)).collect()
            }
            Block::Alert { kind, title, blocks } => {
                let inner = Cx { indent: cx.indent + 567, ..cx };
                let mut o = format!(
                    "{}\\brdrl\\brdrs\\brdrw30\\brsp80 \\b {}\\b0\\par\n",
                    self.pard(&inner),
                    esc(&alert_title(*kind, title, &self.doc.meta.language))
                );
                for x in blocks {
                    o.push_str(&self.block(x, inner));
                }
                o
            }
            Block::List { ordered, start, items, .. } => {
                let mut o = String::new();
                for (i, it) in items.iter().enumerate() {
                    let marker = match it.task {
                        Some(true) => "\u{2612}".to_string(),
                        Some(false) => "\u{2610}".to_string(),
                        None if *ordered => format!("{}.", start + i),
                        None => "\u{2022}".to_string(),
                    };
                    let icx = Cx { indent: cx.indent + 720, ..cx };
                    let mut first = true;
                    if it.blocks.is_empty() {
                        o.push_str(&format!("\\pard\\plain\\f0\\fs{fs}\\sa60\\li{}\\fi-360 {}\\tab\\par\n", icx.indent, esc(&marker)));
                    }
                    for x in &it.blocks {
                        if first {
                            if let Block::Para(v) = x {
                                o.push_str(&format!(
                                    "\\pard\\plain\\f0\\fs{fs}\\sa60\\li{}\\fi-360\\tx{} {}\\tab {}\\par\n",
                                    icx.indent,
                                    icx.indent,
                                    esc(&marker),
                                    self.inlines(v, &icx)
                                ));
                                first = false;
                                continue;
                            }
                            o.push_str(&format!("\\pard\\plain\\f0\\fs{fs}\\sa60\\li{}\\fi-360 {}\\par\n", icx.indent, esc(&marker)));
                        }
                        o.push_str(&self.block(x, icx));
                        first = false;
                    }
                }
                o
            }
            Block::Table { aligns, rows } => {
                let n = aligns.len().max(1) as u32;
                let total = (self.max_w_pt * 20.0) as u32 - cx.indent;
                let w = total / n;
                let mut o = String::new();
                for (ri, r) in rows.iter().enumerate() {
                    o.push_str(&format!("\\trowd\\trgaph108\\trleft{}", cx.indent));
                    if ri == 0 {
                        o.push_str("\\trhdr");
                    }
                    for c in 0..n {
                        o.push_str("\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10");
                        if ri == 0 {
                            o.push_str("\\clcbpat4");
                        }
                        o.push_str(&format!("\\cellx{}", cx.indent + w * (c + 1)));
                    }
                    o.push('\n');
                    for c in 0..n as usize {
                        let q = match aligns.get(c).copied().unwrap_or(Align::None) {
                            Align::Center => "\\qc",
                            Align::Right => "\\qr",
                            _ => "\\ql",
                        };
                        let cell = r.get(c).map(|x| x.as_slice()).unwrap_or(&[]);
                        o.push_str(&format!(
                            "\\pard\\intbl\\plain\\f0\\fs{fs}{q}{} {}{}\\cell\n",
                            if ri == 0 { "\\b" } else { "" },
                            self.inlines(cell, &cx),
                            if ri == 0 { "\\b0" } else { "" }
                        ));
                    }
                    o.push_str("\\row\n");
                }
                o.push_str("\\pard\\plain\\sa120\\par\n");
                o
            }
            Block::Rule => format!("\\pard\\plain\\brdrb\\brdrs\\brdrw10\\brsp20\\sa120{} \\par\n", if cx.indent > 0 { format!("\\li{}", cx.indent) } else { String::new() }),
            Block::Html(h) => {
                let t = strip_tags(h);
                if t.trim().is_empty() {
                    String::new()
                } else {
                    format!("{}{}\\par\n", self.pard(&cx), esc(t.trim()))
                }
            }
        }
    }

    fn group(&mut self, ctrl: &str, v: &[Inline], cx: &Cx) -> String {
        format!("{{{ctrl} {}}}", self.inlines(v, cx))
    }

    fn inlines(&mut self, v: &[Inline], cx: &Cx) -> String {
        v.iter().map(|i| self.inline(i, cx)).collect()
    }

    fn inline(&mut self, i: &Inline, cx: &Cx) -> String {
        match i {
            Inline::Text(t) => esc(t),
            Inline::Emph(v) => self.group("\\i", v, cx),
            Inline::Strong(v) => self.group("\\b", v, cx),
            Inline::Strike(v) => self.group("\\strike", v, cx),
            Inline::Mark(v) => self.group("\\highlight3", v, cx),
            Inline::Sup(v) => self.group("\\super", v, cx),
            Inline::Sub(v) => self.group("\\sub", v, cx),
            Inline::Underline(v) => self.group("\\ul", v, cx),
            Inline::Code(t) | Inline::Math { tex: t, .. } => format!("{{\\f1\\cf6 {}}}", esc(t)),
            Inline::Link { url, content, .. } => {
                let inner = self.inlines(content, cx);
                if url.is_empty() || cx.footnote {
                    return inner;
                }
                format!(
                    "{{\\field{{\\*\\fldinst{{HYPERLINK \"{}\"}}}}{{\\fldrslt{{\\ul\\cf2 {inner}}}}}}}",
                    esc(&url.replace('"', "%22"))
                )
            }
            Inline::Image { url, alt, .. } => {
                if let Some(p) = self.pict(url, alt) {
                    return p;
                }
                let label = format!("[{}]", if alt.is_empty() { url } else { alt });
                if url.is_empty() {
                    return esc(&label);
                }
                format!("{{\\field{{\\*\\fldinst{{HYPERLINK \"{}\"}}}}{{\\fldrslt{{\\ul\\cf2 {}}}}}}}", esc(&url.replace('"', "%22")), esc(&label))
            }
            Inline::FootRef(n) => {
                let first = self.fn_used.insert(*n);
                match self.doc.footnote(*n) {
                    Some(f) if first && !cx.footnote => {
                        let blocks = f.blocks.clone();
                        let fcx = Cx { footnote: true, ..Cx::default() };
                        let mut body = String::new();
                        for (bi, b) in blocks.iter().enumerate() {
                            let mut x = self.block(b, fcx);
                            if bi == 0 {
                                x = x.replacen("\\sa120 ", "\\sa0 {\\super\\chftn} ", 1);
                            }
                            body.push_str(&x);
                        }
                        // (Word only reads \footnote when the document declares \ftnbj, see the header)
                        let fs = self.base_size.saturating_sub(4);
                        let body = body.replace(&format!("\\fs{}", self.base_size), &format!("\\fs{fs}"));
                        format!("{{\\super\\chftn}}{{\\footnote{}}}", body.trim_end_matches('\n').trim_end_matches("\\par"))
                    }
                    _ => format!("{{\\super {n}}}"),
                }
            }
            Inline::Soft => " ".to_string(),
            Inline::Hard => "\\line ".to_string(),
            Inline::Html(_) => String::new(),
        }
    }

    fn pict(&mut self, url: &str, _alt: &str) -> Option<String> {
        if !self.input.options.embed_images {
            return None;
        }
        let r = lookup(self.input, url)?;
        let kind = img_kind(&r);
        let blip = match kind {
            ImgKind::Png => "\\pngblip",
            ImgKind::Jpeg => "\\jpegblip",
            _ => return None,
        };
        let px = img_size(&r.bytes);
        let (w, h) = fit_pt(px, self.max_w_pt);
        let (pw, ph) = px.unwrap_or((400, 300));
        let mut hex = String::with_capacity(r.bytes.len() * 2 + r.bytes.len() / 64);
        for (i, b) in r.bytes.iter().enumerate() {
            if i > 0 && i % 64 == 0 {
                hex.push('\n');
            }
            hex.push_str(&format!("{b:02x}"));
        }
        Some(format!(
            "{{\\pict{blip}\\picw{pw}\\pich{ph}\\picwgoal{}\\pichgoal{}\n{hex}}}",
            (w * 20.0).round() as u32,
            (h * 20.0).round() as u32
        ))
    }
}
