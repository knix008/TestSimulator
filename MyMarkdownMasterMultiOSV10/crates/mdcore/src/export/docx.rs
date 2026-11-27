//! DOCX (WordprocessingML): document, styles (Title, Heading1-6, Quote, Code, CodeChar, Hyperlink, footnote
//! and TOC styles, TableGrid), numbering (bullets, decimal lists restarted per list, task lists without
//! bullets), footnotes, hyperlinks with relationships, internal links to heading bookmarks, inline images
//! sized from their PNG/JPEG/GIF/BMP headers, an optional TOC field, core/app properties.
use std::collections::HashMap;

use super::ir::{alert_title, heading_prefix, sole_image, strip_tags, AlertKind, Align, Block, Doc, Inline};
use super::util::{fit_pt, img_kind, img_size, is_korean, lookup, parse_date, w3c_datetime, xml_escape, ImgKind, Zip};
use super::ExportInput;

const NS: &str = "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" \
xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" \
xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" \
xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" \
xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"";

const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

#[derive(Clone, Copy, Default)]
struct RP {
    b: bool,
    i: bool,
    s: bool,
    mark: bool,
    code: bool,
    sup: bool,
    sub: bool,
    u: bool,
    link: bool,
    color: Option<&'static str>,
}

#[derive(Clone, Copy, Default)]
struct Cx {
    quote: u32,
    alert: Option<AlertKind>,
    /// (numId, ilvl) for the next paragraph only
    num: Option<(u32, u32)>,
    /// left indent of list continuation paragraphs, in twips
    list_ind: u32,
    footnote: bool,
    jc: Option<&'static str>,
}

struct Dx<'a> {
    input: &'a ExportInput<'a>,
    doc: &'a Doc,
    rels: Vec<String>,
    next_rel: u32,
    media: Vec<(String, Vec<u8>)>,
    media_by_src: HashMap<String, (String, u32, u32)>, // src → (rId, cx, cy)
    nums: Vec<String>,
    next_num: u32,
    draw_id: u32,
    bookmarks: HashMap<String, String>,
    bm_id: u32,
    fn_used: HashMap<u32, bool>,
    max_emu: u64,
    exts: Vec<&'static str>,
}

pub fn write(doc: &Doc, input: &ExportInput) -> Result<Vec<u8>, String> {
    let letter = input.options.page_size.eq_ignore_ascii_case("letter");
    let (pw, ph) = if letter { (12240u32, 15840u32) } else { (11906, 16838) };
    let text_twips = (pw - 2880) as u64;
    let mut dx = Dx {
        input,
        doc,
        rels: Vec::new(),
        next_rel: 10,
        media: Vec::new(),
        media_by_src: HashMap::new(),
        nums: Vec::new(),
        next_num: 4,
        draw_id: 1,
        bookmarks: HashMap::new(),
        bm_id: 1,
        fn_used: HashMap::new(),
        max_emu: text_twips * 635,
        exts: Vec::new(),
    };
    // heading bookmarks (for internal links and TOC)
    for (i, t) in doc.toc().iter().enumerate() {
        dx.bookmarks.entry(t.id.clone()).or_insert_with(|| format!("_md_h{}", i + 1));
    }
    let mut body = String::new();
    if input.options.toc {
        body.push_str(&dx.toc_field());
    }
    for b in &doc.blocks {
        body.push_str(&dx.block(b, Cx::default()));
    }
    let mut footnotes = String::new();
    for f in &doc.footnotes {
        footnotes.push_str(&dx.footnote(f.num, &f.blocks));
    }

    let document = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:document {NS}><w:body>{body}<w:sectPr><w:footnotePr><w:numFmt w:val=\"decimal\"/></w:footnotePr><w:pgSz w:w=\"{pw}\" w:h=\"{ph}\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/><w:cols w:space=\"708\"/></w:sectPr></w:body></w:document>"
    );
    let footnotes_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:footnotes {NS}>\
<w:footnote w:type=\"separator\" w:id=\"-1\"><w:p><w:pPr><w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>\
<w:footnote w:type=\"continuationSeparator\" w:id=\"0\"><w:p><w:pPr><w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>\
{footnotes}</w:footnotes>"
    );

    let mut z = Zip::new();
    z.add("[Content_Types].xml", dx.content_types().as_bytes())?;
    z.add(
        "_rels/.rels",
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>\
<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties\" Target=\"docProps/app.xml\"/>\
</Relationships>"
            .as_bytes(),
    )?;
    z.add("word/document.xml", document.as_bytes())?;
    z.add("word/_rels/document.xml.rels", dx.document_rels().as_bytes())?;
    z.add("word/styles.xml", styles(input).as_bytes())?;
    z.add("word/numbering.xml", dx.numbering().as_bytes())?;
    z.add("word/settings.xml", settings(input.options.toc).as_bytes())?;
    z.add("word/footnotes.xml", footnotes_xml.as_bytes())?;
    for (name, bytes) in &dx.media {
        z.add(&format!("word/media/{name}"), bytes)?;
    }
    z.add("docProps/core.xml", core(doc).as_bytes())?;
    z.add(
        "docProps/app.xml",
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\"><Application>MyMarkdownMaster</Application><DocSecurity>0</DocSecurity></Properties>"
            .as_bytes(),
    )?;
    z.finish()
}

/// `<w:t>` runs content: text with tabs / newlines as `<w:tab/>` / `<w:br/>`.
fn t(s: &str) -> String {
    let mut o = String::new();
    for (li, line) in s.split('\n').enumerate() {
        if li > 0 {
            o.push_str("<w:br/>");
        }
        for (ti, part) in line.split('\t').enumerate() {
            if ti > 0 {
                o.push_str("<w:tab/>");
            }
            if !part.is_empty() {
                o.push_str(&format!("<w:t xml:space=\"preserve\">{}</w:t>", xml_escape(part)));
            }
        }
    }
    o
}

fn rpr(rp: &RP) -> String {
    let mut o = String::new();
    if rp.code {
        o.push_str("<w:rStyle w:val=\"CodeChar\"/>");
    } else if rp.link {
        o.push_str("<w:rStyle w:val=\"Hyperlink\"/>");
    }
    if rp.b {
        o.push_str("<w:b/><w:bCs/>");
    }
    if rp.i {
        o.push_str("<w:i/><w:iCs/>");
    }
    if rp.s {
        o.push_str("<w:strike/>");
    }
    if let Some(c) = rp.color {
        o.push_str(&format!("<w:color w:val=\"{c}\"/>"));
    } else if rp.link && rp.code {
        o.push_str("<w:color w:val=\"0563C1\"/>");
    }
    if rp.mark {
        o.push_str("<w:highlight w:val=\"yellow\"/>");
    }
    if rp.u || (rp.link && rp.code) {
        o.push_str("<w:u w:val=\"single\"/>");
    }
    if rp.sup {
        o.push_str("<w:vertAlign w:val=\"superscript\"/>");
    } else if rp.sub {
        o.push_str("<w:vertAlign w:val=\"subscript\"/>");
    }
    if o.is_empty() {
        o
    } else {
        format!("<w:rPr>{o}</w:rPr>")
    }
}

fn run(s: &str, rp: &RP) -> String {
    if s.is_empty() {
        return String::new();
    }
    format!("<w:r>{}{}</w:r>", rpr(rp), t(s))
}

fn url_target(u: &str) -> String {
    u.replace(' ', "%20")
}

impl Dx<'_> {
    fn rel(&mut self, ty: &str, target: &str, external: bool) -> String {
        let id = format!("rId{}", self.next_rel);
        self.next_rel += 1;
        self.rels.push(format!(
            "<Relationship Id=\"{id}\" Type=\"{REL}/{ty}\" Target=\"{}\"{}/>",
            xml_escape(target),
            if external { " TargetMode=\"External\"" } else { "" }
        ));
        id
    }

    fn para(&self, style: Option<&str>, cx: &Cx, runs: &str) -> String {
        let mut p = String::new();
        let style = if cx.footnote && (style.is_none() || style == Some("Quote")) { Some("FootnoteText") } else { style };
        if let Some(s) = style {
            p.push_str(&format!("<w:pStyle w:val=\"{s}\"/>"));
        }
        if let Some((n, l)) = cx.num {
            p.push_str(&format!("<w:numPr><w:ilvl w:val=\"{l}\"/><w:numId w:val=\"{n}\"/></w:numPr>"));
        }
        if let Some(k) = cx.alert {
            p.push_str(&format!(
                "<w:pBdr><w:left w:val=\"single\" w:sz=\"24\" w:space=\"8\" w:color=\"{}\"/></w:pBdr><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{}\"/>",
                k.color(),
                k.fill()
            ));
        } else if cx.quote > 0 && style != Some("Quote") {
            p.push_str("<w:pBdr><w:left w:val=\"single\" w:sz=\"18\" w:space=\"8\" w:color=\"BFBFBF\"/></w:pBdr>");
        }
        let ind = cx.quote * 567 + if cx.num.is_none() { cx.list_ind } else { 0 } + if cx.alert.is_some() { 284 } else { 0 };
        if ind > 0 && cx.num.is_none() {
            p.push_str(&format!("<w:ind w:left=\"{ind}\" w:right=\"{}\"/>", if cx.alert.is_some() { 284 } else { 0 }));
        }
        if let Some(j) = cx.jc {
            p.push_str(&format!("<w:jc w:val=\"{j}\"/>"));
        }
        if p.is_empty() {
            format!("<w:p>{runs}</w:p>")
        } else {
            format!("<w:p><w:pPr>{p}</w:pPr>{runs}</w:p>")
        }
    }

    fn block(&mut self, b: &Block, cx: Cx) -> String {
        match b {
            Block::Heading { level, id, number, content } => {
                let mut runs = String::new();
                let bm = if cx.quote == 0 && cx.alert.is_none() && !cx.footnote { self.bookmarks.get(id).cloned() } else { None };
                if let Some(name) = &bm {
                    runs.push_str(&format!("<w:bookmarkStart w:id=\"{}\" w:name=\"{}\"/>", self.bm_id, xml_escape(name)));
                }
                runs.push_str(&run(&heading_prefix(number), &RP::default()));
                runs.push_str(&self.inlines(content, RP::default(), &cx));
                if bm.is_some() {
                    runs.push_str(&format!("<w:bookmarkEnd w:id=\"{}\"/>", self.bm_id));
                    self.bm_id += 1;
                }
                let style = format!("Heading{}", level.clamp(&1, &6));
                self.para(Some(&style), &Cx { num: None, ..cx }, &runs)
            }
            Block::Para(v) => {
                if let Some((url, _title, alt)) = sole_image(v) {
                    if let Some(img) = self.image(url, alt) {
                        return self.para(None, &Cx { jc: Some("center"), ..cx }, &img);
                    }
                }
                let runs = self.inlines(v, RP::default(), &cx);
                let style = if cx.quote > 0 && cx.alert.is_none() { Some("Quote") } else { None };
                self.para(style, &cx, &runs)
            }
            Block::Code { text, .. } => {
                let r = run(text.trim_end_matches('\n'), &RP::default());
                let r = if r.is_empty() { "<w:r><w:t></w:t></w:r>".to_string() } else { r };
                self.para(Some("Code"), &cx, &r)
            }
            Block::Math(tex) => {
                let r = run(tex, &RP { code: true, ..Default::default() });
                self.para(Some("MathBlock"), &cx, &r)
            }
            Block::Quote(v) => {
                let mut o = String::new();
                let mut inner = Cx { quote: cx.quote + 1, ..cx };
                for x in v {
                    o.push_str(&self.block(x, inner));
                    inner.num = None;
                }
                if v.is_empty() {
                    o.push_str(&self.para(Some("Quote"), &inner, ""));
                }
                o
            }
            Block::Alert { kind, title, blocks } => {
                let mut o = String::new();
                let ac = Cx { alert: Some(*kind), ..cx };
                let t = alert_title(*kind, title, &self.doc.meta.language);
                o.push_str(&self.para(None, &ac, &run(&t, &RP { b: true, color: Some(kind.color()), ..Default::default() })));
                let mut inner = Cx { num: None, ..ac };
                for x in blocks {
                    o.push_str(&self.block(x, inner));
                    inner.num = None;
                }
                o
            }
            Block::List { ordered, start, items, .. } => {
                let lvl = cx.num.map(|n| n.1 + 1).unwrap_or_else(|| cx.list_ind / 720);
                let lvl = lvl.min(8);
                let task = items.iter().all(|i| i.task.is_some()) && !items.is_empty();
                let num_id = if *ordered {
                    let id = self.next_num;
                    self.next_num += 1;
                    self.nums.push(format!(
                        "<w:num w:numId=\"{id}\"><w:abstractNumId w:val=\"1\"/><w:lvlOverride w:ilvl=\"{lvl}\"><w:startOverride w:val=\"{}\"/></w:lvlOverride></w:num>",
                        start
                    ));
                    id
                } else if task {
                    3
                } else {
                    1
                };
                let mut o = String::new();
                for it in items {
                    let mut first = true;
                    let item_cx = Cx { num: None, list_ind: (lvl + 1) * 720, ..cx };
                    let prefix = match it.task {
                        Some(true) => "\u{2612} ",
                        Some(false) => "\u{2610} ",
                        None => "",
                    };
                    if it.blocks.is_empty() {
                        o.push_str(&self.para(None, &Cx { num: Some((num_id, lvl)), ..item_cx }, &run(prefix, &RP::default())));
                        continue;
                    }
                    for x in &it.blocks {
                        let bcx = if first { Cx { num: Some((num_id, lvl)), ..item_cx } } else { item_cx };
                        if first && !prefix.is_empty() {
                            if let Block::Para(v) = x {
                                let runs = format!("{}{}", run(prefix, &RP::default()), self.inlines(v, RP::default(), &bcx));
                                o.push_str(&self.para(None, &bcx, &runs));
                                first = false;
                                continue;
                            }
                        }
                        if first && !matches!(x, Block::Para(_) | Block::Heading { .. } | Block::Code { .. } | Block::Math(_)) {
                            // the item starts with a container: give the marker its own (empty) paragraph
                            o.push_str(&self.para(None, &bcx, &run(prefix, &RP::default())));
                            o.push_str(&self.block(x, Cx { num: None, ..item_cx }));
                        } else {
                            o.push_str(&self.block(x, bcx));
                        }
                        first = false;
                    }
                }
                o
            }
            Block::Table { aligns, rows } => self.table(aligns, rows, cx),
            Block::Rule => "<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"auto\"/></w:pBdr></w:pPr></w:p>".to_string(),
            Block::Html(h) => {
                let text = strip_tags(h);
                let text = text.trim();
                if text.is_empty() {
                    String::new()
                } else {
                    self.para(None, &cx, &run(text, &RP::default()))
                }
            }
        }
    }

    fn table(&mut self, aligns: &[Align], rows: &[Vec<Vec<Inline>>], cx: Cx) -> String {
        let n = aligns.len().max(1);
        let total = (self.max_emu / 635) as u32 - cx.quote * 567 - cx.list_ind;
        let col = (total / n as u32).max(400);
        let mut o = String::from("<w:tbl><w:tblPr><w:tblStyle w:val=\"TableGrid\"/><w:tblW w:w=\"0\" w:type=\"auto\"/>");
        let ind = cx.quote * 567 + cx.list_ind;
        if ind > 0 {
            o.push_str(&format!("<w:tblInd w:w=\"{ind}\" w:type=\"dxa\"/>"));
        }
        o.push_str("<w:tblBorders>");
        for side in ["top", "left", "bottom", "right", "insideH", "insideV"] {
            o.push_str(&format!("<w:{side} w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"A0A0A0\"/>"));
        }
        o.push_str("</w:tblBorders><w:tblLook w:val=\"04A0\" w:firstRow=\"1\" w:lastRow=\"0\" w:firstColumn=\"0\" w:lastColumn=\"0\" w:noHBand=\"0\" w:noVBand=\"1\"/></w:tblPr><w:tblGrid>");
        for _ in 0..n {
            o.push_str(&format!("<w:gridCol w:w=\"{col}\"/>"));
        }
        o.push_str("</w:tblGrid>");
        for (ri, r) in rows.iter().enumerate() {
            o.push_str("<w:tr>");
            if ri == 0 {
                o.push_str("<w:trPr><w:tblHeader/></w:trPr>");
            }
            for ci in 0..n {
                let cell = r.get(ci).map(|c| c.as_slice()).unwrap_or(&[]);
                let jc = match aligns.get(ci).copied().unwrap_or(Align::None) {
                    Align::Center => Some("center"),
                    Align::Right => Some("right"),
                    Align::Left => Some("left"),
                    Align::None => None,
                };
                o.push_str(&format!("<w:tc><w:tcPr><w:tcW w:w=\"{col}\" w:type=\"dxa\"/>"));
                if ri == 0 {
                    o.push_str("<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F2F2F2\"/>");
                }
                o.push_str("</w:tcPr>");
                let ccx = Cx { jc, ..Cx::default() };
                let runs = self.inlines(cell, RP { b: ri == 0, ..Default::default() }, &ccx);
                o.push_str(&self.para(Some("TableText"), &ccx, &runs));
                o.push_str("</w:tc>");
            }
            o.push_str("</w:tr>");
        }
        o.push_str("</w:tbl>");
        // Word needs a paragraph between consecutive tables and before the section end
        o.push_str("<w:p><w:pPr><w:spacing w:after=\"0\"/></w:pPr></w:p>");
        o
    }

    fn inlines(&mut self, v: &[Inline], rp: RP, cx: &Cx) -> String {
        let mut o = String::new();
        for i in v {
            o.push_str(&self.inline(i, rp, cx));
        }
        o
    }

    fn inline(&mut self, i: &Inline, rp: RP, cx: &Cx) -> String {
        match i {
            Inline::Text(s) => run(s, &rp),
            Inline::Emph(v) => self.inlines(v, RP { i: true, ..rp }, cx),
            Inline::Strong(v) => self.inlines(v, RP { b: true, ..rp }, cx),
            Inline::Strike(v) => self.inlines(v, RP { s: true, ..rp }, cx),
            Inline::Mark(v) => self.inlines(v, RP { mark: true, ..rp }, cx),
            Inline::Sup(v) => self.inlines(v, RP { sup: true, ..rp }, cx),
            Inline::Sub(v) => self.inlines(v, RP { sub: true, ..rp }, cx),
            Inline::Underline(v) => self.inlines(v, RP { u: true, ..rp }, cx),
            Inline::Code(s) => run(s, &RP { code: true, ..rp }),
            Inline::Math { tex, .. } => run(tex, &RP { code: true, ..rp }),
            Inline::Link { url, content, .. } => {
                let inner = self.inlines(content, RP { link: true, ..rp }, cx);
                if cx.footnote || url.is_empty() {
                    return inner;
                }
                if let Some(anchor) = url.strip_prefix('#') {
                    let a = super::util::percent_decode(anchor);
                    return match self.bookmarks.get(&a).cloned() {
                        Some(name) => format!("<w:hyperlink w:anchor=\"{}\" w:history=\"1\">{inner}</w:hyperlink>", xml_escape(&name)),
                        None => inner,
                    };
                }
                let id = self.rel("hyperlink", &url_target(url), true);
                format!("<w:hyperlink r:id=\"{id}\" w:history=\"1\">{inner}</w:hyperlink>")
            }
            Inline::Image { url, alt, .. } => {
                if !cx.footnote {
                    if let Some(x) = self.image(url, alt) {
                        return x;
                    }
                }
                let label = if alt.is_empty() { url.clone() } else { alt.clone() };
                if cx.footnote || url.is_empty() {
                    return run(&format!("[{label}]"), &rp);
                }
                let id = self.rel("hyperlink", &url_target(url), true);
                format!("<w:hyperlink r:id=\"{id}\" w:history=\"1\">{}</w:hyperlink>", run(&format!("[{label}]"), &RP { link: true, ..rp }))
            }
            Inline::FootRef(n) => {
                let exists = self.doc.footnote(*n).is_some();
                let used = self.fn_used.insert(*n, true).is_some();
                if !exists || used || cx.footnote {
                    run(&n.to_string(), &RP { sup: true, ..rp })
                } else {
                    format!("<w:r><w:rPr><w:rStyle w:val=\"FootnoteReference\"/></w:rPr><w:footnoteReference w:id=\"{n}\"/></w:r>")
                }
            }
            Inline::Soft => run(" ", &rp),
            Inline::Hard => "<w:r><w:br/></w:r>".to_string(),
            Inline::Html(_) => String::new(),
        }
    }

    /// An inline drawing for an embeddable image, registering the media part once per src.
    fn image(&mut self, url: &str, alt: &str) -> Option<String> {
        if !self.input.options.embed_images {
            return None;
        }
        let (rid, cx, cy) = if let Some(x) = self.media_by_src.get(url) {
            x.clone()
        } else {
            let r = lookup(self.input, url)?;
            let kind = img_kind(&r);
            if !matches!(kind, ImgKind::Png | ImgKind::Jpeg | ImgKind::Gif | ImgKind::Bmp) {
                return None;
            }
            let (wpt, hpt) = fit_pt(img_size(&r.bytes), self.max_emu as f64 / 12700.0);
            let (cx, cy) = ((wpt * 12700.0).round() as u32, (hpt * 12700.0).round() as u32);
            let name = format!("image{}.{}", self.media.len() + 1, kind.ext());
            if !self.exts.contains(&kind.ext()) {
                self.exts.push(kind.ext());
            }
            self.media.push((name.clone(), r.bytes));
            let rid = self.rel("image", &format!("media/{name}"), false);
            self.media_by_src.insert(url.to_string(), (rid.clone(), cx, cy));
            (rid, cx, cy)
        };
        let id = self.draw_id;
        self.draw_id += 1;
        Some(format!(
            "<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"{cx}\" cy=\"{cy}\"/><wp:effectExtent l=\"0\" t=\"0\" r=\"0\" b=\"0\"/><wp:docPr id=\"{id}\" name=\"Picture {id}\" descr=\"{}\"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect=\"1\"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic><pic:nvPicPr><pic:cNvPr id=\"{id}\" name=\"Picture {id}\"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed=\"{rid}\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"{cx}\" cy=\"{cy}\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>",
            xml_escape(alt)
        ))
    }

    fn footnote(&mut self, num: u32, blocks: &[Block]) -> String {
        let cx = Cx { footnote: true, ..Cx::default() };
        let mut body = String::new();
        for b in blocks {
            body.push_str(&self.block(b, cx));
        }
        let mark = "<w:r><w:rPr><w:rStyle w:val=\"FootnoteReference\"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space=\"preserve\"> </w:t></w:r>";
        if body.starts_with("<w:p><w:pPr>") {
            let e = body.find("</w:pPr>").unwrap() + 8;
            body.insert_str(e, mark);
        } else if body.starts_with("<w:p>") {
            body.insert_str(5, mark);
        } else {
            body = format!("<w:p><w:pPr><w:pStyle w:val=\"FootnoteText\"/></w:pPr>{mark}</w:p>{body}");
        }
        format!("<w:footnote w:id=\"{num}\">{body}</w:footnote>")
    }

    fn toc_field(&mut self) -> String {
        let title = super::html::toc_title(&self.doc.meta.language);
        let mut o = format!("<w:p><w:pPr><w:pStyle w:val=\"TOCHeading\"/></w:pPr>{}</w:p>", run(title, &RP::default()));
        let begin = "<w:r><w:fldChar w:fldCharType=\"begin\" w:dirty=\"true\"/></w:r><w:r><w:instrText xml:space=\"preserve\"> TOC \\o \"1-3\" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>";
        let end = "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>";
        let toc = self.doc.toc();
        let base = self.doc.min_heading_level();
        let entries: Vec<_> = toc.iter().filter(|e| e.level < base + 3).collect();
        if entries.is_empty() {
            let hint = if is_korean(&self.doc.meta.language) { "목차를 보려면 필드를 업데이트하세요." } else { "Update the field to show the table of contents." };
            o.push_str(&format!("<w:p>{begin}{}{end}</w:p>", run(hint, &RP::default())));
            return o;
        }
        let n = entries.len();
        for (i, e) in entries.iter().enumerate() {
            let style = format!("TOC{}", (e.level - base + 1).min(3));
            let label = format!("{}{}", heading_prefix(&e.number), e.text);
            let mut runs = String::new();
            if i == 0 {
                runs.push_str(begin);
            }
            let link = match self.bookmarks.get(&e.id) {
                Some(bm) => format!("<w:hyperlink w:anchor=\"{}\" w:history=\"1\">{}</w:hyperlink>", xml_escape(bm), run(&label, &RP::default())),
                None => run(&label, &RP::default()),
            };
            runs.push_str(&link);
            if i + 1 == n {
                runs.push_str(end);
            }
            o.push_str(&format!("<w:p><w:pPr><w:pStyle w:val=\"{style}\"/><w:tabs><w:tab w:val=\"right\" w:leader=\"dot\" w:pos=\"9016\"/></w:tabs></w:pPr>{runs}</w:p>"));
        }
        o
    }

    fn content_types(&self) -> String {
        let mut s = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\
<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\
<Default Extension=\"xml\" ContentType=\"application/xml\"/>");
        for e in &self.exts {
            let mime = match *e {
                "png" => "image/png",
                "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                _ => "image/bmp",
            };
            s.push_str(&format!("<Default Extension=\"{e}\" ContentType=\"{mime}\"/>"));
        }
        s.push_str("<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>\
<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>\
<Override PartName=\"/word/numbering.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml\"/>\
<Override PartName=\"/word/settings.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml\"/>\
<Override PartName=\"/word/footnotes.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml\"/>\
<Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>\
<Override PartName=\"/docProps/app.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\"/>\
</Types>");
        s
    }

    fn document_rels(&self) -> String {
        let mut s = format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\
<Relationship Id=\"rId1\" Type=\"{REL}/styles\" Target=\"styles.xml\"/>\
<Relationship Id=\"rId2\" Type=\"{REL}/numbering\" Target=\"numbering.xml\"/>\
<Relationship Id=\"rId3\" Type=\"{REL}/settings\" Target=\"settings.xml\"/>\
<Relationship Id=\"rId4\" Type=\"{REL}/footnotes\" Target=\"footnotes.xml\"/>"
        );
        for r in &self.rels {
            s.push_str(r);
        }
        s.push_str("</Relationships>");
        s
    }

    fn numbering(&self) -> String {
        let mut s = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:numbering {NS}>");
        let bullets = ["\u{2022}", "\u{25E6}", "\u{25AA}"];
        for (aid, kind) in [(0, "bullet"), (1, "decimal"), (2, "none")] {
            s.push_str(&format!("<w:abstractNum w:abstractNumId=\"{aid}\"><w:multiLevelType w:val=\"hybridMultilevel\"/>"));
            for l in 0..9u32 {
                let (fmt, text) = match kind {
                    "bullet" => ("bullet", bullets[(l % 3) as usize].to_string()),
                    "decimal" => (
                        match l % 3 {
                            0 => "decimal",
                            1 => "lowerLetter",
                            _ => "lowerRoman",
                        },
                        format!("%{}.", l + 1),
                    ),
                    _ => ("none", String::new()),
                };
                let left = 720 * (l + 1);
                s.push_str(&format!(
                    "<w:lvl w:ilvl=\"{l}\"><w:start w:val=\"1\"/><w:numFmt w:val=\"{fmt}\"/><w:lvlText w:val=\"{}\"/><w:lvlJc w:val=\"left\"/><w:pPr><w:ind w:left=\"{left}\" w:hanging=\"360\"/></w:pPr></w:lvl>",
                    xml_escape(&text)
                ));
            }
            s.push_str("</w:abstractNum>");
        }
        s.push_str("<w:num w:numId=\"1\"><w:abstractNumId w:val=\"0\"/></w:num>");
        s.push_str("<w:num w:numId=\"2\"><w:abstractNumId w:val=\"1\"/></w:num>");
        s.push_str("<w:num w:numId=\"3\"><w:abstractNumId w:val=\"2\"/></w:num>");
        for n in &self.nums {
            s.push_str(n);
        }
        s.push_str("</w:numbering>");
        s
    }
}

fn settings(update_fields: bool) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:settings {NS}>{}<w:defaultTabStop w:val=\"720\"/><w:characterSpacingControl w:val=\"doNotCompress\"/><w:footnotePr><w:footnote w:id=\"-1\"/><w:footnote w:id=\"0\"/></w:footnotePr><w:compat><w:compatSetting w:name=\"compatibilityMode\" w:uri=\"http://schemas.microsoft.com/office/word\" w:val=\"15\"/></w:compat></w:settings>",
        if update_fields { "<w:updateFields w:val=\"true\"/>" } else { "" }
    )
}

fn core(doc: &Doc) -> String {
    let m = &doc.meta;
    let mut s = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">");
    s.push_str(&format!("<dc:title>{}</dc:title>", xml_escape(&m.title)));
    if !m.author.is_empty() {
        s.push_str(&format!("<dc:creator>{}</dc:creator>", xml_escape(&m.author)));
    }
    s.push_str(&format!("<dc:language>{}</dc:language>", xml_escape(&m.language)));
    if parse_date(&m.date).is_some() {
        let d = w3c_datetime(&m.date);
        s.push_str(&format!("<dcterms:created xsi:type=\"dcterms:W3CDTF\">{d}</dcterms:created><dcterms:modified xsi:type=\"dcterms:W3CDTF\">{d}</dcterms:modified>"));
    }
    s.push_str("</cp:coreProperties>");
    s
}

fn styles(input: &ExportInput) -> String {
    let ko = is_korean(&input.language);
    let font = if input.options.font_family.trim().is_empty() {
        if ko { "Malgun Gothic".to_string() } else { "Calibri".to_string() }
    } else {
        input.options.font_family.split(',').next().unwrap_or("Calibri").trim().trim_matches('"').to_string()
    };
    let ea = if ko && input.options.font_family.trim().is_empty() { "Malgun Gothic".to_string() } else if ko { font.clone() } else { "Malgun Gothic".to_string() };
    let f = xml_escape(&font);
    let ea = xml_escape(&ea);
    let sz = ((input.options.font_size_pt.clamp(5.0, 72.0)) * 2.0).round() as u32;
    let lang = if ko { "ko-KR" } else { "en-US" };
    let mono = "<w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\" w:cs=\"Consolas\"/>";
    let mut s = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:styles {NS}>\
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii=\"{f}\" w:hAnsi=\"{f}\" w:eastAsia=\"{ea}\" w:cs=\"{f}\"/><w:sz w:val=\"{sz}\"/><w:szCs w:val=\"{sz}\"/><w:lang w:val=\"{lang}\" w:eastAsia=\"ko-KR\" w:bidi=\"ar-SA\"/></w:rPr></w:rPrDefault>\
<w:pPrDefault><w:pPr><w:spacing w:after=\"120\" w:line=\"276\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault></w:docDefaults>\
<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/></w:style>\
<w:style w:type=\"character\" w:default=\"1\" w:styleId=\"DefaultParagraphFont\"><w:name w:val=\"Default Paragraph Font\"/><w:uiPriority w:val=\"1\"/><w:semiHidden/></w:style>\
<w:style w:type=\"table\" w:default=\"1\" w:styleId=\"TableNormal\"><w:name w:val=\"Normal Table\"/><w:semiHidden/><w:tblPr><w:tblInd w:w=\"0\" w:type=\"dxa\"/><w:tblCellMar><w:top w:w=\"0\" w:type=\"dxa\"/><w:left w:w=\"108\" w:type=\"dxa\"/><w:bottom w:w=\"0\" w:type=\"dxa\"/><w:right w:w=\"108\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr></w:style>\
<w:style w:type=\"numbering\" w:default=\"1\" w:styleId=\"NoList\"><w:name w:val=\"No List\"/><w:semiHidden/></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"Title\"><w:name w:val=\"Title\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:after=\"240\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"{}\"/><w:szCs w:val=\"{}\"/></w:rPr></w:style>",
        sz * 26 / 11,
        sz * 26 / 11
    );
    let hs = [2.0f32, 1.6, 1.35, 1.15, 1.0, 0.95];
    let colors = ["1F3864", "1F3864", "1F3864", "2F5496", "2F5496", "404040"];
    for l in 1..=6usize {
        let hsz = ((sz as f32) * hs[l - 1]).round() as u32;
        s.push_str(&format!(
            "<w:style w:type=\"paragraph\" w:styleId=\"Heading{l}\"><w:name w:val=\"heading {l}\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:uiPriority w:val=\"9\"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before=\"{}\" w:after=\"120\"/><w:outlineLvl w:val=\"{}\"/></w:pPr><w:rPr><w:b/><w:bCs/>{}<w:color w:val=\"{}\"/><w:sz w:val=\"{hsz}\"/><w:szCs w:val=\"{hsz}\"/></w:rPr></w:style>",
            if l <= 2 { 360 } else { 240 },
            l - 1,
            if l == 6 { "<w:i/><w:iCs/>" } else { "" },
            colors[l - 1]
        ));
    }
    s.push_str(&format!("<w:style w:type=\"paragraph\" w:styleId=\"Quote\"><w:name w:val=\"Quote\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val=\"single\" w:sz=\"18\" w:space=\"8\" w:color=\"BFBFBF\"/></w:pBdr><w:ind w:left=\"567\"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val=\"404040\"/></w:rPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"Code\"><w:name w:val=\"Code\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:pBdr><w:top w:val=\"single\" w:sz=\"4\" w:space=\"4\" w:color=\"D0D7DE\"/><w:left w:val=\"single\" w:sz=\"4\" w:space=\"4\" w:color=\"D0D7DE\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"4\" w:color=\"D0D7DE\"/><w:right w:val=\"single\" w:sz=\"4\" w:space=\"4\" w:color=\"D0D7DE\"/></w:pBdr><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F6F8FA\"/><w:spacing w:before=\"60\" w:after=\"180\" w:line=\"240\" w:lineRule=\"auto\"/><w:ind w:left=\"113\" w:right=\"113\"/></w:pPr><w:rPr>{mono}<w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/></w:rPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"MathBlock\"><w:name w:val=\"Math Block\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:before=\"120\" w:after=\"120\"/><w:jc w:val=\"center\"/></w:pPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"TableText\"><w:name w:val=\"Table Text\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:before=\"40\" w:after=\"40\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr></w:style>\
<w:style w:type=\"character\" w:styleId=\"CodeChar\"><w:name w:val=\"Code Char\"/><w:basedOn w:val=\"DefaultParagraphFont\"/><w:rPr>{mono}<w:color w:val=\"953735\"/><w:sz w:val=\"{0}\"/><w:szCs w:val=\"{0}\"/><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F2F2F2\"/></w:rPr></w:style>\
<w:style w:type=\"character\" w:styleId=\"Hyperlink\"><w:name w:val=\"Hyperlink\"/><w:basedOn w:val=\"DefaultParagraphFont\"/><w:uiPriority w:val=\"99\"/><w:unhideWhenUsed/><w:rPr><w:color w:val=\"0563C1\"/><w:u w:val=\"single\"/></w:rPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"FootnoteText\"><w:name w:val=\"footnote text\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr><w:rPr><w:sz w:val=\"{1}\"/><w:szCs w:val=\"{1}\"/></w:rPr></w:style>\
<w:style w:type=\"character\" w:styleId=\"FootnoteReference\"><w:name w:val=\"footnote reference\"/><w:basedOn w:val=\"DefaultParagraphFont\"/><w:rPr><w:vertAlign w:val=\"superscript\"/></w:rPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"TOCHeading\"><w:name w:val=\"TOC Heading\"/><w:basedOn w:val=\"Heading1\"/><w:next w:val=\"Normal\"/><w:pPr><w:outlineLvl w:val=\"9\"/></w:pPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"TOC1\"><w:name w:val=\"toc 1\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:pPr><w:spacing w:after=\"60\"/></w:pPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"TOC2\"><w:name w:val=\"toc 2\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:pPr><w:spacing w:after=\"60\"/><w:ind w:left=\"220\"/></w:pPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"TOC3\"><w:name w:val=\"toc 3\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:pPr><w:spacing w:after=\"60\"/><w:ind w:left=\"440\"/></w:pPr></w:style>\
<w:style w:type=\"paragraph\" w:styleId=\"ListParagraph\"><w:name w:val=\"List Paragraph\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:ind w:left=\"720\"/></w:pPr></w:style>\
<w:style w:type=\"table\" w:styleId=\"TableGrid\"><w:name w:val=\"Table Grid\"/><w:basedOn w:val=\"TableNormal\"/><w:tblPr><w:tblBorders><w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/><w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/></w:tblBorders></w:tblPr></w:style>\
</w:styles>",
        (sz as f32 * 0.85).round() as u32,
        (sz as f32 * 0.85).round() as u32,
    ));
    s
}

