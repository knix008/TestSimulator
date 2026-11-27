//! EPUB 3 (with an EPUB 2 toc.ncx for older readers): `mimetype` stored first, META-INF/container.xml,
//! OEBPS/content.opf, nav.xhtml (always; also shown in the spine when `toc` is on), chapters split at
//! top-level H1 (or one chapter), images packaged, the reading CSS as style.css. The body is the caller's
//! rendered HTML when given (KaTeX/MathML kept, `properties="mathml"` set) or our own, normalised to XHTML.
use std::collections::{HashMap, HashSet};

use super::html::{nest_list, source_body, toc_title, Heading, PostProcessor, BASE_CSS};
use super::htmltok::{balance, serialize, tokenize, Tok};
use super::ir::Doc;
use super::util::{img_kind, is_url, lookup, parse_date, uuid_from, w3c_datetime, xml_escape, ImgKind, Zip};
use super::ExportInput;

pub fn write(doc: &Doc, input: &ExportInput) -> Result<Vec<u8>, String> {
    let src = source_body(doc, input, true);
    let toks = balance(tokenize(&src));
    let chapters_toks = split_chapters(toks);
    let base = chapters_toks.iter().map(|c| PostProcessor::min_level(c)).min().unwrap_or(1);

    // images: src → (href inside OEBPS, mime)
    let mut images: Vec<(String, Vec<u8>, &'static str)> = Vec::new();
    let mut by_src: HashMap<String, Option<String>> = HashMap::new();
    let embed = input.options.embed_images;
    let mut img = |s: &str| -> Option<String> {
        if let Some(x) = by_src.get(s) {
            return x.clone();
        }
        let found = if embed { lookup(input, s) } else { None };
        let res = found.and_then(|r| {
            let k = img_kind(&r);
            if k == ImgKind::Other || k == ImgKind::Bmp {
                return None;
            }
            let name = format!("images/img{}.{}", images.len() + 1, k.ext());
            images.push((name.clone(), r.bytes, k.mime()));
            Some(name)
        });
        by_src.insert(s.to_string(), res.clone());
        // mark unresolved images so the later pass can turn them into links / text
        Some(res.unwrap_or_else(|| format!("\u{1}{s}")))
    };
    let mut pp = PostProcessor::new(input.options.number_headings, true, base, &mut img);
    let mut chapters: Vec<Vec<Tok>> = Vec::new();
    for (i, c) in chapters_toks.into_iter().enumerate() {
        chapters.push(pp.run(c, i));
    }
    let headings: Vec<Heading> = std::mem::take(&mut pp.headings);
    drop(pp);

    // where each id lives, for cross-chapter links
    let mut id_ch: HashMap<String, usize> = HashMap::new();
    for (i, c) in chapters.iter().enumerate() {
        for t in c {
            if let Some(id) = t.attr("id") {
                id_ch.entry(id.to_string()).or_insert(i);
            }
        }
    }
    let lang = doc.meta.language.clone();
    let mut files: Vec<(String, String, bool, bool)> = Vec::new(); // (name, xhtml, mathml, svg)
    for (i, c) in chapters.into_iter().enumerate() {
        let mut out: Vec<Tok> = Vec::with_capacity(c.len());
        let (mut mathml, mut svg) = (false, false);
        for mut t in c {
            if t.is_start("math") {
                mathml = true;
            }
            if t.is_start("svg") {
                svg = true;
            }
            if t.is_start("a") {
                if let Some(h) = t.attr("href").map(|s| s.to_string()) {
                    if let Some(frag) = h.strip_prefix('#') {
                        if let Some(&ch) = id_ch.get(frag) {
                            if ch != i {
                                t.set_attr("href", &format!("{}#{}", chapter_name(ch), frag));
                            }
                        }
                    }
                }
            }
            if t.is_start("img") {
                let src = t.attr("src").unwrap_or("").to_string();
                if let Some(orig) = src.strip_prefix('\u{1}') {
                    let alt = t.attr("alt").unwrap_or("").to_string();
                    let label = format!("[{}]", if alt.is_empty() { orig } else { &alt });
                    if is_url(orig) {
                        out.push(Tok::Start { name: "a".into(), attrs: vec![("href".into(), Some(orig.to_string()))], self_close: false });
                        out.push(Tok::Text(label));
                        out.push(Tok::End("a".into()));
                    } else {
                        out.push(Tok::Text(label));
                    }
                    continue;
                }
                if t.attr("alt").is_none() {
                    t.set_attr("alt", "");
                }
            }
            out.push(t);
        }
        let title = headings.iter().find(|h| h.chapter == i).map(|h| h.text.clone()).unwrap_or_else(|| doc.meta.title.clone());
        let body = serialize(&out, true);
        files.push((chapter_name(i), xhtml_page(&lang, &title, &body), mathml, svg));
    }

    let id = format!("urn:uuid:{}", uuid_from(&format!("{}\u{0}{}\u{0}{}", doc.meta.title, doc.meta.author, input.markdown)));
    let modified = w3c_datetime(&doc.meta.date);
    let m = &doc.meta;

    // nav.xhtml
    let href = |h: &Heading| format!("{}#{}", chapter_name(h.chapter), h.id);
    let mut nav_list = String::new();
    if headings.is_empty() {
        nav_list.push_str(&format!("<ol>\n<li><a href=\"{}\">{}</a></li>\n</ol>\n", chapter_name(0), xml_escape(&m.title)));
    } else {
        let b = headings.iter().map(|h| h.level).min().unwrap_or(1);
        nest_list(&headings, b, &href, &mut nav_list);
    }
    let nav = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" lang=\"{0}\" xml:lang=\"{0}\">\n<head>\n<meta charset=\"utf-8\" />\n<title>{1}</title>\n<link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\" />\n</head>\n<body>\n<nav epub:type=\"toc\" id=\"toc\">\n<h1>{2}</h1>\n{3}</nav>\n</body>\n</html>\n",
        xml_escape(&lang),
        xml_escape(&m.title),
        xml_escape(toc_title(&lang)),
        nav_list
    );

    // toc.ncx
    let mut ncx_points = String::new();
    let mut order = 1;
    if headings.is_empty() {
        ncx_points.push_str(&format!(
            "<navPoint id=\"np1\" playOrder=\"1\"><navLabel><text>{}</text></navLabel><content src=\"{}\"/></navPoint>\n",
            xml_escape(&m.title),
            chapter_name(0)
        ));
    } else {
        let b = headings.iter().map(|h| h.level).min().unwrap_or(1);
        let mut depth = 0usize;
        for h in &headings {
            let d = ((h.level - b) as usize + 1).min(depth + 1);
            while depth >= d {
                ncx_points.push_str("</navPoint>\n");
                depth -= 1;
            }
            let label = if h.number.is_empty() { h.text.clone() } else { format!("{} {}", h.number, h.text) };
            ncx_points.push_str(&format!(
                "<navPoint id=\"np{order}\" playOrder=\"{order}\"><navLabel><text>{}</text></navLabel><content src=\"{}\"/>\n",
                xml_escape(&label),
                xml_escape(&href(h))
            ));
            order += 1;
            depth = d;
        }
        while depth > 0 {
            ncx_points.push_str("</navPoint>\n");
            depth -= 1;
        }
    }
    let ncx = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\" xml:lang=\"{}\">\n<head>\n<meta name=\"dtb:uid\" content=\"{}\"/>\n<meta name=\"dtb:depth\" content=\"3\"/>\n<meta name=\"dtb:totalPageCount\" content=\"0\"/>\n<meta name=\"dtb:maxPageNumber\" content=\"0\"/>\n</head>\n<docTitle><text>{}</text></docTitle>\n<navMap>\n{}</navMap>\n</ncx>\n",
        xml_escape(&lang),
        xml_escape(&id),
        xml_escape(&m.title),
        ncx_points
    );

    // content.opf
    let mut manifest = String::from(
        "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>\n<item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>\n<item id=\"css\" href=\"style.css\" media-type=\"text/css\"/>\n",
    );
    let mut spine = String::new();
    if input.options.toc {
        spine.push_str("<itemref idref=\"nav\"/>\n");
    }
    for (i, (name, _, mathml, svg)) in files.iter().enumerate() {
        let mut props: Vec<&str> = Vec::new();
        if *mathml {
            props.push("mathml");
        }
        if *svg {
            props.push("svg");
        }
        let p = if props.is_empty() { String::new() } else { format!(" properties=\"{}\"", props.join(" ")) };
        manifest.push_str(&format!("<item id=\"ch{}\" href=\"{name}\" media-type=\"application/xhtml+xml\"{p}/>\n", i + 1));
        spine.push_str(&format!("<itemref idref=\"ch{}\"/>\n", i + 1));
    }
    let mut seen = HashSet::new();
    for (i, (name, _, mime)) in images.iter().enumerate() {
        if seen.insert(name.clone()) {
            manifest.push_str(&format!("<item id=\"img{}\" href=\"{}\" media-type=\"{mime}\"/>\n", i + 1, xml_escape(name)));
        }
    }
    let mut metadata = format!(
        "<dc:identifier id=\"bookid\">{}</dc:identifier>\n<dc:title>{}</dc:title>\n<dc:language>{}</dc:language>\n",
        xml_escape(&id),
        xml_escape(&m.title),
        xml_escape(&lang)
    );
    if !m.author.is_empty() {
        metadata.push_str(&format!("<dc:creator id=\"creator\">{}</dc:creator>\n", xml_escape(&m.author)));
    }
    if let Some((y, mo, d, ..)) = parse_date(&m.date) {
        metadata.push_str(&format!("<dc:date>{y:04}-{mo:02}-{d:02}</dc:date>\n"));
    }
    metadata.push_str(&format!("<meta property=\"dcterms:modified\">{modified}</meta>\n<meta name=\"generator\" content=\"MyMarkdownMaster\"/>\n"));
    let opf = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"bookid\" xml:lang=\"{}\">\n<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n{metadata}</metadata>\n<manifest>\n{manifest}</manifest>\n<spine toc=\"ncx\">\n{spine}</spine>\n</package>\n",
        xml_escape(&lang)
    );

    let mut css = String::from(BASE_CSS);
    css.push_str("body{max-width:none;padding:0 2%}\n");
    if !input.options.font_family.trim().is_empty() {
        css.push_str(&format!("body{{font-family:{}}}\n", super::html::css_font(&input.options.font_family)));
    }
    css.push_str(&input.css);

    let mut z = Zip::new();
    z.stored("mimetype", b"application/epub+zip")?;
    z.add(
        "META-INF/container.xml",
        b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">\n<rootfiles>\n<rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/>\n</rootfiles>\n</container>\n",
    )?;
    z.add("OEBPS/content.opf", opf.as_bytes())?;
    z.add("OEBPS/nav.xhtml", nav.as_bytes())?;
    z.add("OEBPS/toc.ncx", ncx.as_bytes())?;
    z.add("OEBPS/style.css", css.as_bytes())?;
    for (name, x, _, _) in &files {
        z.add(&format!("OEBPS/{name}"), x.as_bytes())?;
    }
    for (name, bytes, _) in &images {
        z.stored(&format!("OEBPS/{name}"), bytes)?;
    }
    z.finish()
}

fn chapter_name(i: usize) -> String {
    format!("ch{}.xhtml", i + 1)
}

fn xhtml_page(lang: &str, title: &str, body: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" lang=\"{0}\" xml:lang=\"{0}\">\n<head>\n<meta charset=\"utf-8\" />\n<title>{1}</title>\n<link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\" />\n</head>\n<body>\n<div class=\"markdown-body\">\n{2}\n</div>\n</body>\n</html>\n",
        xml_escape(lang),
        xml_escape(title),
        body
    )
}

/// Splits a balanced token stream before every top-level `<h1>` (keeping leading content with the first).
fn split_chapters(toks: Vec<Tok>) -> Vec<Vec<Tok>> {
    let mut out: Vec<Vec<Tok>> = vec![Vec::new()];
    let mut depth = 0usize;
    for t in toks {
        if depth == 0 && t.heading_level() == Some(1) {
            let cur = out.last().unwrap();
            let has_content = cur.iter().any(|x| match x {
                Tok::Text(s) => !s.trim().is_empty(),
                Tok::Start { .. } => true,
                _ => false,
            });
            if has_content {
                out.push(Vec::new());
            }
        }
        match &t {
            Tok::Start { self_close: false, .. } => depth += 1,
            Tok::End(_) => depth = depth.saturating_sub(1),
            _ => {}
        }
        out.last_mut().unwrap().push(t);
    }
    out
}
