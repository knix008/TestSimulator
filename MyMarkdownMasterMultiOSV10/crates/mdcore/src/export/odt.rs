//! ODT (OpenDocument Text): `mimetype` stored first, manifest, content/styles/meta. Paragraph styles for
//! headings (with outline levels), Title, Quotations, Preformatted Text, alerts, table cells, footnotes and
//! TOC entries; text styles for emphasis/strong/highlight/strike/code/links; bullet, number and task list
//! styles; bordered tables; embedded pictures; footnotes as text:note; optional table of contents.
use std::collections::HashMap;

use super::ir::{alert_title, heading_prefix, sole_image, strip_tags, AlertKind, Align, Block, Doc, Inline};
use super::util::{fit_pt, img_kind, img_size, is_korean, lookup, parse_date, w3c_datetime, xml_escape, ImgKind, Zip};
use super::ExportInput;

const NS: &str = "xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" \
xmlns:style=\"urn:oasis:names:tc:opendocument:xmlns:style:1.0\" \
xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" \
xmlns:table=\"urn:oasis:names:tc:opendocument:xmlns:table:1.0\" \
xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\" \
xmlns:fo=\"urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0\" \
xmlns:xlink=\"http://www.w3.org/1999/xlink\" \
xmlns:dc=\"http://purl.org/dc/elements/1.1/\" \
xmlns:meta=\"urn:oasis:names:tc:opendocument:xmlns:meta:1.0\" \
xmlns:number=\"urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0\" \
xmlns:svg=\"urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0\" office:version=\"1.2\"";

#[derive(Clone, Copy, Default)]
struct Cx {
    quote: u32,
    alert: Option<AlertKind>,
    in_list: bool,
    footnote: bool,
}

struct Ox<'a> {
    input: &'a ExportInput<'a>,
    doc: &'a Doc,
    pictures: Vec<(String, Vec<u8>, &'static str)>,
    pic_by_src: HashMap<String, (String, f64, f64)>,
    frame: u32,
    table: u32,
    fn_used: HashMap<u32, bool>,
    max_w_pt: f64,
}

pub fn write(doc: &Doc, input: &ExportInput) -> Result<Vec<u8>, String> {
    let letter = input.options.page_size.eq_ignore_ascii_case("letter");
    let mut ox = Ox {
        input,
        doc,
        pictures: Vec::new(),
        pic_by_src: HashMap::new(),
        frame: 1,
        table: 1,
        fn_used: HashMap::new(),
        max_w_pt: if letter { 468.0 } else { 451.0 },
    };
    let mut body = String::new();
    if input.options.toc {
        body.push_str(&ox.toc());
    }
    for b in &doc.blocks {
        body.push_str(&ox.block(b, Cx::default()));
    }
    if body.is_empty() {
        body.push_str("<text:p text:style-name=\"Text_20_body\"/>");
    }
    let mut auto = String::new();
    for q in 2..=6 {
        auto.push_str(&format!(
            "<style:style style:name=\"Q{q}\" style:family=\"paragraph\" style:parent-style-name=\"Quotations\"><style:paragraph-properties fo:margin-left=\"{}cm\"/></style:style>",
            q
        ));
    }
    for (n, a) in [("left", "start"), ("center", "center"), ("right", "end")] {
        auto.push_str(&format!("<style:style style:name=\"TC_{n}\" style:family=\"paragraph\" style:parent-style-name=\"Table_20_Contents\"><style:paragraph-properties fo:text-align=\"{a}\"/></style:style>"));
        auto.push_str(&format!("<style:style style:name=\"TH_{n}\" style:family=\"paragraph\" style:parent-style-name=\"Table_20_Heading\"><style:paragraph-properties fo:text-align=\"{a}\"/></style:style>"));
    }
    auto.push_str("<style:style style:name=\"Tbl\" style:family=\"table\"><style:table-properties style:width=\"100%\" table:align=\"margins\" fo:margin-top=\"0.1cm\" fo:margin-bottom=\"0.25cm\"/></style:style>\
<style:style style:name=\"TblCol\" style:family=\"table-column\"><style:table-column-properties style:use-optimal-column-width=\"true\"/></style:style>\
<style:style style:name=\"TblCell\" style:family=\"table-cell\"><style:table-cell-properties fo:padding=\"0.1cm\" fo:border=\"0.5pt solid #a0a0a0\"/></style:style>\
<style:style style:name=\"TblHead\" style:family=\"table-cell\"><style:table-cell-properties fo:padding=\"0.1cm\" fo:background-color=\"#f2f2f2\" fo:border=\"0.5pt solid #a0a0a0\"/></style:style>\
<style:style style:name=\"Fr\" style:family=\"graphic\"><style:graphic-properties style:vertical-pos=\"top\" style:vertical-rel=\"baseline\" fo:border=\"none\"/></style:style>");

    let content = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document-content {NS}><office:scripts/><office:automatic-styles>{auto}</office:automatic-styles><office:body><office:text>{body}</office:text></office:body></office:document-content>"
    );

    let mut z = Zip::new();
    z.stored("mimetype", b"application/vnd.oasis.opendocument.text")?;
    let mut manifest = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\" manifest:version=\"1.2\">\
<manifest:file-entry manifest:full-path=\"/\" manifest:version=\"1.2\" manifest:media-type=\"application/vnd.oasis.opendocument.text\"/>\
<manifest:file-entry manifest:full-path=\"content.xml\" manifest:media-type=\"text/xml\"/>\
<manifest:file-entry manifest:full-path=\"styles.xml\" manifest:media-type=\"text/xml\"/>\
<manifest:file-entry manifest:full-path=\"meta.xml\" manifest:media-type=\"text/xml\"/>");
    for (name, _, mime) in &ox.pictures {
        manifest.push_str(&format!("<manifest:file-entry manifest:full-path=\"Pictures/{name}\" manifest:media-type=\"{mime}\"/>"));
    }
    manifest.push_str("</manifest:manifest>");
    z.add("META-INF/manifest.xml", manifest.as_bytes())?;
    z.add("content.xml", content.as_bytes())?;
    z.add("styles.xml", styles(input, letter).as_bytes())?;
    z.add("meta.xml", meta(doc).as_bytes())?;
    for (name, bytes, _) in &ox.pictures {
        z.stored(&format!("Pictures/{name}"), bytes)?;
    }
    z.finish()
}

/// ODF resolves relative links against the package (a folder), so a file next to the document is `../name`.
fn odf_href(url: &str) -> String {
    let has_scheme = url.split_once(':').is_some_and(|(s, _)| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c)) && s.len() > 1);
    if url.starts_with('#') || has_scheme || url.starts_with('/') {
        url.to_string()
    } else {
        format!("../{}", url.replace(' ', "%20"))
    }
}

/// Escapes text for ODF paragraphs: runs of spaces as `<text:s/>`, tabs, line breaks.
fn otext(s: &str, keep_leading: bool) -> String {
    let mut o = String::new();
    let mut spaces = 0usize;
    let mut at_line_start = true;
    let flush = |o: &mut String, spaces: &mut usize, at_start: bool| {
        if *spaces == 0 {
            return;
        }
        let lead = if at_start && keep_leading { 0 } else { 1 };
        if lead == 1 {
            o.push(' ');
        }
        let rest = *spaces - lead;
        if rest == 1 {
            o.push_str("<text:s/>");
        } else if rest > 1 {
            o.push_str(&format!("<text:s text:c=\"{rest}\"/>"));
        }
        *spaces = 0;
    };
    for c in s.chars() {
        match c {
            ' ' => spaces += 1,
            '\t' => {
                flush(&mut o, &mut spaces, at_line_start);
                o.push_str("<text:tab/>");
                at_line_start = false;
            }
            '\n' => {
                flush(&mut o, &mut spaces, at_line_start);
                o.push_str("<text:line-break/>");
                at_line_start = true;
            }
            '\r' => {}
            c => {
                flush(&mut o, &mut spaces, at_line_start);
                at_line_start = false;
                o.push_str(&xml_escape(&c.to_string()));
            }
        }
    }
    flush(&mut o, &mut spaces, at_line_start);
    o
}

fn span(style: &str, inner: &str) -> String {
    if inner.is_empty() {
        String::new()
    } else {
        format!("<text:span text:style-name=\"{style}\">{inner}</text:span>")
    }
}

impl Ox<'_> {
    fn pstyle(&self, cx: &Cx) -> String {
        if let Some(k) = cx.alert {
            return format!("Alert_{}", k.id());
        }
        if cx.footnote {
            return "Footnote".into();
        }
        match cx.quote {
            0 => "Text_20_body".into(),
            1 => "Quotations".into(),
            n => format!("Q{}", n.min(6)),
        }
    }

    fn p(&self, style: &str, inner: &str) -> String {
        format!("<text:p text:style-name=\"{style}\">{inner}</text:p>")
    }

    fn block(&mut self, b: &Block, cx: Cx) -> String {
        match b {
            Block::Heading { level, id, number, content } => {
                let inner = format!("{}{}", otext(&heading_prefix(number), false), self.inlines(content, &cx));
                if cx.footnote || cx.alert.is_some() || cx.quote > 0 {
                    return self.p(&self.pstyle(&cx), &span("Strong_20_Emphasis", &inner));
                }
                format!(
                    "<text:h text:style-name=\"Heading_20_{level}\" text:outline-level=\"{level}\"><text:bookmark text:name=\"{}\"/>{inner}</text:h>",
                    xml_escape(id)
                )
            }
            Block::Para(v) => {
                if let Some((url, _, alt)) = sole_image(v) {
                    if let Some(img) = self.image(url, alt) {
                        let st = if cx.quote == 0 && cx.alert.is_none() { "Figure".to_string() } else { self.pstyle(&cx) };
                        return self.p(&st, &img);
                    }
                }
                let inner = self.inlines(v, &cx);
                self.p(&self.pstyle(&cx), &inner)
            }
            Block::Code { text, .. } => self.p("Preformatted_20_Text", &otext(text.trim_end_matches('\n'), true)),
            Block::Math(t) => self.p("Math_20_Block", &span("Source_20_Text", &otext(t, true))),
            Block::Quote(v) => {
                let inner = Cx { quote: cx.quote + 1, ..cx };
                let s: String = v.iter().map(|x| self.block(x, inner)).collect();
                if s.is_empty() {
                    self.p(&self.pstyle(&inner), "")
                } else {
                    s
                }
            }
            Block::Alert { kind, title, blocks } => {
                let ac = Cx { alert: Some(*kind), ..cx };
                let t = alert_title(*kind, title, &self.doc.meta.language);
                let mut s = self.p(&self.pstyle(&ac), &span(&format!("Alert_20_Title_{}", kind.id()), &otext(&t, false)));
                for x in blocks {
                    s.push_str(&self.block(x, ac));
                }
                s
            }
            Block::List { ordered, start, items, .. } => {
                let task = !items.is_empty() && items.iter().all(|i| i.task.is_some());
                let style = if *ordered {
                    "L_Number"
                } else if task {
                    "L_Task"
                } else {
                    "L_Bullet"
                };
                let mut s = if cx.in_list {
                    "<text:list>".to_string()
                } else {
                    format!("<text:list text:style-name=\"{style}\">")
                };
                let icx = Cx { in_list: true, ..cx };
                for (i, it) in items.iter().enumerate() {
                    if i == 0 && *ordered && *start != 1 {
                        s.push_str(&format!("<text:list-item text:start-value=\"{start}\">"));
                    } else {
                        s.push_str("<text:list-item>");
                    }
                    let prefix = match it.task {
                        Some(true) => "\u{2612} ",
                        Some(false) => "\u{2610} ",
                        None => "",
                    };
                    let mut first = true;
                    if it.blocks.is_empty() {
                        s.push_str(&self.p(&self.pstyle(&icx), &otext(prefix, false)));
                    }
                    for x in &it.blocks {
                        if first && !prefix.is_empty() {
                            if let Block::Para(v) = x {
                                let inner = format!("{}{}", otext(prefix, false), self.inlines(v, &icx));
                                s.push_str(&self.p(&self.pstyle(&icx), &inner));
                                first = false;
                                continue;
                            }
                        }
                        if first && !matches!(x, Block::Para(_) | Block::Code { .. } | Block::Math(_) | Block::Heading { .. }) {
                            s.push_str(&self.p(&self.pstyle(&icx), &otext(prefix, false)));
                        }
                        match x {
                            // tables are not allowed inside list items in ODF: flatten to paragraphs
                            Block::Table { rows, .. } => {
                                for r in rows {
                                    let line: Vec<String> = r.iter().map(|c| self.inlines(c, &icx)).collect();
                                    s.push_str(&self.p(&self.pstyle(&icx), &line.join(" | ")));
                                }
                            }
                            _ => s.push_str(&self.block(x, icx)),
                        }
                        first = false;
                    }
                    s.push_str("</text:list-item>");
                }
                s.push_str("</text:list>");
                s
            }
            Block::Table { aligns, rows } => {
                if cx.footnote || cx.in_list {
                    let mut s = String::new();
                    for r in rows {
                        let line: Vec<String> = r.iter().map(|c| self.inlines(c, &cx)).collect();
                        s.push_str(&self.p(&self.pstyle(&cx), &line.join(" | ")));
                    }
                    return s;
                }
                let n = aligns.len().max(1);
                let mut s = format!(
                    "<table:table table:name=\"Table{}\" table:style-name=\"Tbl\"><table:table-column table:style-name=\"TblCol\" table:number-columns-repeated=\"{n}\"/>",
                    self.table
                );
                self.table += 1;
                for (ri, r) in rows.iter().enumerate() {
                    if ri == 0 {
                        s.push_str("<table:table-header-rows>");
                    }
                    s.push_str("<table:table-row>");
                    for ci in 0..n {
                        let a = match aligns.get(ci).copied().unwrap_or(Align::None) {
                            Align::Center => "center",
                            Align::Right => "right",
                            _ => "left",
                        };
                        let cell = r.get(ci).map(|c| c.as_slice()).unwrap_or(&[]);
                        let inner = self.inlines(cell, &Cx::default());
                        s.push_str(&format!(
                            "<table:table-cell table:style-name=\"{}\" office:value-type=\"string\"><text:p text:style-name=\"{}_{a}\">{inner}</text:p></table:table-cell>",
                            if ri == 0 { "TblHead" } else { "TblCell" },
                            if ri == 0 { "TH" } else { "TC" }
                        ));
                    }
                    s.push_str("</table:table-row>");
                    if ri == 0 {
                        s.push_str("</table:table-header-rows>");
                    }
                }
                s.push_str("</table:table>");
                s
            }
            Block::Rule => self.p("Horizontal_20_Line", ""),
            Block::Html(h) => {
                let t = strip_tags(h);
                if t.trim().is_empty() {
                    String::new()
                } else {
                    self.p(&self.pstyle(&cx), &otext(t.trim(), false))
                }
            }
        }
    }

    fn inlines(&mut self, v: &[Inline], cx: &Cx) -> String {
        v.iter().map(|i| self.inline(i, cx)).collect()
    }

    fn inline(&mut self, i: &Inline, cx: &Cx) -> String {
        match i {
            Inline::Text(t) => otext(t, false),
            Inline::Emph(v) => span("Emphasis", &self.inlines(v, cx)),
            Inline::Strong(v) => span("Strong_20_Emphasis", &self.inlines(v, cx)),
            Inline::Strike(v) => span("Strike", &self.inlines(v, cx)),
            Inline::Mark(v) => span("Highlight", &self.inlines(v, cx)),
            Inline::Sup(v) => span("Sup", &self.inlines(v, cx)),
            Inline::Sub(v) => span("Sub", &self.inlines(v, cx)),
            Inline::Underline(v) => span("Underline", &self.inlines(v, cx)),
            Inline::Code(t) => span("Source_20_Text", &otext(t, true)),
            Inline::Math { tex, .. } => span("Source_20_Text", &otext(tex, true)),
            Inline::Link { url, content, .. } => {
                let inner = self.inlines(content, cx);
                if url.is_empty() {
                    return inner;
                }
                format!(
                    "<text:a xlink:type=\"simple\" xlink:href=\"{}\" text:style-name=\"Internet_20_link\" text:visited-style-name=\"Visited_20_Internet_20_Link\">{inner}</text:a>",
                    xml_escape(&odf_href(url))
                )
            }
            Inline::Image { url, alt, .. } => {
                if let Some(x) = self.image(url, alt) {
                    return x;
                }
                let label = otext(&format!("[{}]", if alt.is_empty() { url } else { alt }), false);
                if url.is_empty() {
                    return label;
                }
                format!(
                    "<text:a xlink:type=\"simple\" xlink:href=\"{}\" text:style-name=\"Internet_20_link\" text:visited-style-name=\"Visited_20_Internet_20_Link\">{label}</text:a>",
                    xml_escape(&odf_href(url))
                )
            }
            Inline::FootRef(n) => {
                let exists = self.doc.footnote(*n).is_some();
                let used = self.fn_used.insert(*n, true).is_some();
                if !exists || used || cx.footnote {
                    return span("Sup", &n.to_string());
                }
                let blocks = self.doc.footnote(*n).map(|f| f.blocks.clone()).unwrap_or_default();
                let fcx = Cx { footnote: true, ..Cx::default() };
                let mut body: String = blocks.iter().map(|b| self.block(b, fcx)).collect();
                if body.is_empty() {
                    body = self.p("Footnote", "");
                }
                format!(
                    "<text:note text:id=\"ftn{n}\" text:note-class=\"footnote\"><text:note-citation>{n}</text:note-citation><text:note-body>{body}</text:note-body></text:note>"
                )
            }
            Inline::Soft => " ".to_string(),
            Inline::Hard => "<text:line-break/>".to_string(),
            Inline::Html(_) => String::new(),
        }
    }

    fn image(&mut self, url: &str, alt: &str) -> Option<String> {
        if !self.input.options.embed_images {
            return None;
        }
        let (path, w, h) = if let Some(x) = self.pic_by_src.get(url) {
            x.clone()
        } else {
            let r = lookup(self.input, url)?;
            let kind = img_kind(&r);
            if !matches!(kind, ImgKind::Png | ImgKind::Jpeg | ImgKind::Gif | ImgKind::Svg | ImgKind::Bmp) {
                return None;
            }
            let (w, h) = fit_pt(img_size(&r.bytes), self.max_w_pt);
            let name = format!("image{}.{}", self.pictures.len() + 1, kind.ext());
            self.pictures.push((name.clone(), r.bytes, kind.mime()));
            let path = format!("Pictures/{name}");
            self.pic_by_src.insert(url.to_string(), (path.clone(), w, h));
            (path, w, h)
        };
        let id = self.frame;
        self.frame += 1;
        let title = if alt.is_empty() { String::new() } else { format!("<svg:title>{}</svg:title>", xml_escape(alt)) };
        Some(format!(
            "<draw:frame draw:style-name=\"Fr\" draw:name=\"Image{id}\" text:anchor-type=\"as-char\" svg:width=\"{w:.2}pt\" svg:height=\"{h:.2}pt\" draw:z-index=\"0\"><draw:image xlink:href=\"{path}\" xlink:type=\"simple\" xlink:show=\"embed\" xlink:actuate=\"onLoad\"/>{title}</draw:frame>"
        ))
    }

    fn toc(&mut self) -> String {
        let title = super::html::toc_title(&self.doc.meta.language);
        let mut s = String::from("<text:table-of-content text:protected=\"true\" text:name=\"Table of Contents1\"><text:table-of-content-source text:outline-level=\"3\">");
        s.push_str(&format!("<text:index-title-template text:style-name=\"Contents_20_Heading\">{}</text:index-title-template>", xml_escape(title)));
        for l in 1..=3 {
            s.push_str(&format!("<text:table-of-content-entry-template text:outline-level=\"{l}\" text:style-name=\"Contents_20_{l}\"><text:index-entry-link-start text:style-name=\"Index_20_Link\"/><text:index-entry-chapter/><text:index-entry-text/><text:index-entry-tab-stop style:type=\"right\" style:leader-char=\".\"/><text:index-entry-page-number/><text:index-entry-link-end/></text:table-of-content-entry-template>"));
        }
        s.push_str("</text:table-of-content-source><text:index-body>");
        s.push_str(&format!(
            "<text:index-title text:name=\"Table of Contents1_Head\"><text:p text:style-name=\"Contents_20_Heading\">{}</text:p></text:index-title>",
            xml_escape(title)
        ));
        let toc = self.doc.toc();
        if toc.is_empty() {
            s.push_str("<text:p text:style-name=\"Contents_20_1\"/>");
        }
        for e in toc.iter() {
            let l = (e.level as u32).clamp(1, 3);
            s.push_str(&format!(
                "<text:p text:style-name=\"Contents_20_{l}\"><text:a xlink:type=\"simple\" xlink:href=\"#{}\">{}</text:a></text:p>",
                xml_escape(&e.id),
                otext(&format!("{}{}", heading_prefix(&e.number), e.text), false)
            ));
        }
        s.push_str("</text:index-body></text:table-of-content>");
        s
    }
}

fn meta(doc: &Doc) -> String {
    let m = &doc.meta;
    let mut s = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document-meta {NS}><office:meta><meta:generator>MyMarkdownMaster</meta:generator><dc:title>{}</dc:title><dc:language>{}</dc:language>",
        xml_escape(&m.title),
        xml_escape(&m.language)
    );
    if !m.author.is_empty() {
        s.push_str(&format!("<meta:initial-creator>{0}</meta:initial-creator><dc:creator>{0}</dc:creator>", xml_escape(&m.author)));
    }
    if parse_date(&m.date).is_some() {
        let d = w3c_datetime(&m.date);
        let d = d.trim_end_matches('Z');
        s.push_str(&format!("<meta:creation-date>{d}</meta:creation-date><dc:date>{d}</dc:date>"));
    }
    s.push_str("</office:meta></office:document-meta>");
    s
}

fn styles(input: &ExportInput, letter: bool) -> String {
    let ko = is_korean(&input.language);
    let font = if input.options.font_family.trim().is_empty() {
        if ko { "Malgun Gothic".to_string() } else { "Liberation Sans".to_string() }
    } else {
        input.options.font_family.split(',').next().unwrap_or("").trim().trim_matches('"').to_string()
    };
    let f = xml_escape(&font);
    let asian = if ko { f.clone() } else { "Malgun Gothic".to_string() };
    let sz = input.options.font_size_pt.clamp(5.0, 72.0);
    let (lang, country) = if ko { ("ko", "KR") } else { ("en", "US") };
    let (pw, ph) = if letter { ("8.5in", "11in") } else { ("21cm", "29.7cm") };
    let mono = "fo:font-family=\"'Liberation Mono', Consolas, monospace\" style:font-family-generic=\"modern\" style:font-pitch=\"fixed\"";
    let mut s = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<office:document-styles {NS}><office:styles>\
<style:default-style style:family=\"paragraph\"><style:paragraph-properties style:writing-mode=\"lr-tb\"/><style:text-properties fo:font-family=\"'{f}'\" style:font-family-asian=\"'{asian}'\" fo:font-size=\"{sz}pt\" style:font-size-asian=\"{sz}pt\" fo:language=\"{lang}\" fo:country=\"{country}\" style:language-asian=\"ko\" style:country-asian=\"KR\"/></style:default-style>\
<style:style style:name=\"Standard\" style:family=\"paragraph\" style:class=\"text\"/>\
<style:style style:name=\"Text_20_body\" style:display-name=\"Text body\" style:family=\"paragraph\" style:parent-style-name=\"Standard\" style:class=\"text\"><style:paragraph-properties fo:margin-top=\"0cm\" fo:margin-bottom=\"0.25cm\" fo:line-height=\"115%\"/></style:style>\
<style:style style:name=\"Figure\" style:family=\"paragraph\" style:parent-style-name=\"Text_20_body\"><style:paragraph-properties fo:text-align=\"center\"/></style:style>\
<style:style style:name=\"Heading\" style:family=\"paragraph\" style:parent-style-name=\"Standard\" style:next-style-name=\"Text_20_body\" style:class=\"text\"><style:paragraph-properties fo:margin-top=\"0.42cm\" fo:margin-bottom=\"0.21cm\" fo:keep-with-next=\"always\"/><style:text-properties fo:font-weight=\"bold\" style:font-weight-asian=\"bold\" fo:color=\"#1f3864\"/></style:style>\
<style:style style:name=\"Title\" style:family=\"paragraph\" style:parent-style-name=\"Heading\" style:class=\"chapter\"><style:paragraph-properties fo:text-align=\"center\"/><style:text-properties fo:font-size=\"{}pt\" style:font-size-asian=\"{}pt\"/></style:style>",
        (sz * 2.4).round(),
        (sz * 2.4).round()
    );
    let scale = [2.0f32, 1.6, 1.35, 1.15, 1.0, 0.95];
    for l in 1..=6usize {
        let hs = (sz * scale[l - 1] * 10.0).round() / 10.0;
        s.push_str(&format!(
            "<style:style style:name=\"Heading_20_{l}\" style:display-name=\"Heading {l}\" style:family=\"paragraph\" style:parent-style-name=\"Heading\" style:next-style-name=\"Text_20_body\" style:default-outline-level=\"{l}\" style:class=\"text\"><style:text-properties fo:font-size=\"{hs}pt\" style:font-size-asian=\"{hs}pt\"{}/></style:style>",
            if l == 6 { " fo:font-style=\"italic\"" } else { "" }
        ));
    }
    s.push_str(&format!("<style:style style:name=\"Quotations\" style:family=\"paragraph\" style:parent-style-name=\"Text_20_body\" style:class=\"html\"><style:paragraph-properties fo:margin-left=\"1cm\" fo:margin-right=\"0cm\" fo:padding-left=\"0.25cm\" fo:border-left=\"2.25pt solid #bfbfbf\" fo:border-right=\"none\" fo:border-top=\"none\" fo:border-bottom=\"none\"/><style:text-properties fo:color=\"#404040\" fo:font-style=\"italic\" style:font-style-asian=\"italic\"/></style:style>\
<style:style style:name=\"Preformatted_20_Text\" style:display-name=\"Preformatted Text\" style:family=\"paragraph\" style:parent-style-name=\"Standard\" style:class=\"html\"><style:paragraph-properties fo:margin-top=\"0.1cm\" fo:margin-bottom=\"0.3cm\" fo:background-color=\"#f6f8fa\" fo:padding=\"0.15cm\" fo:border=\"0.5pt solid #d0d7de\"/><style:text-properties {mono} fo:font-size=\"{0}pt\" style:font-size-asian=\"{0}pt\"/></style:style>\
<style:style style:name=\"Math_20_Block\" style:display-name=\"Math Block\" style:family=\"paragraph\" style:parent-style-name=\"Text_20_body\"><style:paragraph-properties fo:text-align=\"center\"/></style:style>\
<style:style style:name=\"Table_20_Contents\" style:display-name=\"Table Contents\" style:family=\"paragraph\" style:parent-style-name=\"Standard\" style:class=\"extra\"/>\
<style:style style:name=\"Table_20_Heading\" style:display-name=\"Table Heading\" style:family=\"paragraph\" style:parent-style-name=\"Table_20_Contents\" style:class=\"extra\"><style:text-properties fo:font-weight=\"bold\" style:font-weight-asian=\"bold\"/></style:style>\
<style:style style:name=\"Footnote\" style:family=\"paragraph\" style:parent-style-name=\"Standard\" style:class=\"extra\"><style:paragraph-properties fo:margin-left=\"0.6cm\" fo:text-indent=\"-0.6cm\"/><style:text-properties fo:font-size=\"{1}pt\" style:font-size-asian=\"{1}pt\"/></style:style>\
<style:style style:name=\"Horizontal_20_Line\" style:display-name=\"Horizontal Line\" style:family=\"paragraph\" style:parent-style-name=\"Standard\" style:class=\"html\"><style:paragraph-properties fo:margin-top=\"0cm\" fo:margin-bottom=\"0.5cm\" fo:padding=\"0cm\" fo:border-top=\"none\" fo:border-left=\"none\" fo:border-right=\"none\" fo:border-bottom=\"0.5pt solid #808080\"/><style:text-properties fo:font-size=\"6pt\"/></style:style>\
<style:style style:name=\"Contents_20_Heading\" style:display-name=\"Contents Heading\" style:family=\"paragraph\" style:parent-style-name=\"Heading\" style:class=\"index\"><style:text-properties fo:font-size=\"{2}pt\"/></style:style>",
        (sz * 0.85 * 10.0).round() / 10.0,
        (sz * 0.85 * 10.0).round() / 10.0,
        (sz * 1.6).round()
    ));
    for l in 1..=3 {
        s.push_str(&format!(
            "<style:style style:name=\"Contents_20_{l}\" style:display-name=\"Contents {l}\" style:family=\"paragraph\" style:parent-style-name=\"Standard\" style:class=\"index\"><style:paragraph-properties fo:margin-left=\"{}cm\" fo:margin-bottom=\"0.1cm\"><style:tab-stops><style:tab-stop style:position=\"16cm\" style:type=\"right\" style:leader-style=\"dotted\" style:leader-text=\".\"/></style:tab-stops></style:paragraph-properties></style:style>",
            (l - 1) as f32 * 0.5
        ));
    }
    for k in [AlertKind::Note, AlertKind::Tip, AlertKind::Important, AlertKind::Warning, AlertKind::Caution] {
        s.push_str(&format!(
            "<style:style style:name=\"Alert_{0}\" style:family=\"paragraph\" style:parent-style-name=\"Text_20_body\"><style:paragraph-properties fo:margin-left=\"0.5cm\" fo:margin-right=\"0.5cm\" fo:margin-bottom=\"0cm\" fo:padding=\"0.15cm\" fo:background-color=\"#{1}\" fo:border-left=\"3pt solid #{2}\" fo:border-right=\"none\" fo:border-top=\"none\" fo:border-bottom=\"none\" style:join-border=\"true\"/></style:style>\
<style:style style:name=\"Alert_20_Title_{0}\" style:family=\"text\"><style:text-properties fo:font-weight=\"bold\" style:font-weight-asian=\"bold\" fo:color=\"#{2}\"/></style:style>",
            k.id(),
            k.fill(),
            k.color()
        ));
    }
    s.push_str(&format!("<style:style style:name=\"Emphasis\" style:family=\"text\"><style:text-properties fo:font-style=\"italic\" style:font-style-asian=\"italic\"/></style:style>\
<style:style style:name=\"Strong_20_Emphasis\" style:display-name=\"Strong Emphasis\" style:family=\"text\"><style:text-properties fo:font-weight=\"bold\" style:font-weight-asian=\"bold\"/></style:style>\
<style:style style:name=\"Source_20_Text\" style:display-name=\"Source Text\" style:family=\"text\"><style:text-properties {mono} fo:background-color=\"#f2f2f2\" fo:color=\"#953735\"/></style:style>\
<style:style style:name=\"Highlight\" style:family=\"text\"><style:text-properties fo:background-color=\"#ffff00\"/></style:style>\
<style:style style:name=\"Strike\" style:family=\"text\"><style:text-properties style:text-line-through-style=\"solid\" style:text-line-through-type=\"single\"/></style:style>\
<style:style style:name=\"Underline\" style:family=\"text\"><style:text-properties style:text-underline-style=\"solid\" style:text-underline-width=\"auto\" style:text-underline-color=\"font-color\"/></style:style>\
<style:style style:name=\"Sup\" style:family=\"text\"><style:text-properties style:text-position=\"super 58%\"/></style:style>\
<style:style style:name=\"Sub\" style:family=\"text\"><style:text-properties style:text-position=\"sub 58%\"/></style:style>\
<style:style style:name=\"Internet_20_link\" style:display-name=\"Internet link\" style:family=\"text\"><style:text-properties fo:color=\"#0563c1\" style:text-underline-style=\"solid\" style:text-underline-width=\"auto\" style:text-underline-color=\"font-color\"/></style:style>\
<style:style style:name=\"Visited_20_Internet_20_Link\" style:display-name=\"Visited Internet Link\" style:family=\"text\"><style:text-properties fo:color=\"#954f72\" style:text-underline-style=\"solid\" style:text-underline-width=\"auto\" style:text-underline-color=\"font-color\"/></style:style>\
<style:style style:name=\"Index_20_Link\" style:display-name=\"Index Link\" style:family=\"text\"/>"));
    // list styles
    let bullets = ["\u{2022}", "\u{25E6}", "\u{25AA}"];
    for (name, kind) in [("L_Bullet", 0), ("L_Number", 1), ("L_Task", 2)] {
        s.push_str(&format!("<text:list-style style:name=\"{name}\">"));
        for l in 1..=10u32 {
            let ml = 0.635 * (l as f32 + 1.0) - 0.635;
            let props = format!(
                "<style:list-level-properties text:list-level-position-and-space-mode=\"label-alignment\"><style:list-level-label-alignment text:label-followed-by=\"listtab\" text:list-tab-stop-position=\"{0:.3}cm\" fo:text-indent=\"-0.635cm\" fo:margin-left=\"{0:.3}cm\"/></style:list-level-properties>",
                ml + 0.635
            );
            match kind {
                0 => s.push_str(&format!(
                    "<text:list-level-style-bullet text:level=\"{l}\" text:bullet-char=\"{}\">{props}</text:list-level-style-bullet>",
                    bullets[((l - 1) % 3) as usize]
                )),
                1 => s.push_str(&format!(
                    "<text:list-level-style-number text:level=\"{l}\" style:num-suffix=\".\" style:num-format=\"{}\">{props}</text:list-level-style-number>",
                    match (l - 1) % 3 {
                        0 => "1",
                        1 => "a",
                        _ => "i",
                    }
                )),
                _ => s.push_str(&format!("<text:list-level-style-number text:level=\"{l}\" style:num-format=\"\">{props}</text:list-level-style-number>")),
            }
        }
        s.push_str("</text:list-style>");
    }
    s.push_str("<text:notes-configuration text:note-class=\"footnote\" style:num-format=\"1\" text:start-value=\"0\" text:footnotes-position=\"page\" text:start-numbering-at=\"document\"/>");
    s.push_str("</office:styles><office:automatic-styles>");
    s.push_str(&format!(
        "<style:page-layout style:name=\"pm1\"><style:page-layout-properties fo:page-width=\"{pw}\" fo:page-height=\"{ph}\" style:print-orientation=\"portrait\" fo:margin-top=\"2.54cm\" fo:margin-bottom=\"2.54cm\" fo:margin-left=\"2.54cm\" fo:margin-right=\"2.54cm\"/></style:page-layout>"
    ));
    s.push_str("</office:automatic-styles><office:master-styles><style:master-page style:name=\"Standard\" style:page-layout-name=\"pm1\"/></office:master-styles></office:document-styles>");
    s
}

