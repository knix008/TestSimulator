//! Export tests: every format from one rich note, key markers per format, zip package structure and
//! XML well-formedness of DOCX / ODT / EPUB parts (checked with a small parser below).
use std::io::{Cursor, Read};

use mdcore::export::{export, flatten_highlights, ExportFormat, ExportInput, ExportOptions, Resource};

const PNG_1X1: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

const NOTE: &str = r#"---
title: 내보내기 시험 노트
author: 홍길동
tags: [test]
---

# 소개 Introduction

한국어 문장과 English text, **굵게 bold**, *기울임 italic*, ~~취소선~~, ==강조 highlight== and `inline code`.
Special characters: 100% & cost_center #1 $5 {braces} ~tilde^ <tag> "quotes" back\slash.
A [link](https://example.com/a?b=1&c=2) and a [note link](Other%20Note.md) and [section](#세부-사항-details).
Inline math $E = mc^2$ here.<br>After a break.

![로고 logo](images/logo.png)

## 세부 사항 Details

1. 첫째 first
2. 둘째 second
   - 중첩 nested *a*
   - nested b
     1. deep one
3. third

- [x] 완료된 작업 done
- [ ] 남은 작업 todo

| 이름 Name | 수량 Qty | 비고 Note |
|:---------|--------:|:--------:|
| 사과 apple | 3 | 빨강 |
| banana | 12 | yellow & sweet |

```rust
fn main() {
    println!("안녕 {}", 1 < 2);
}
```

> 인용문 quote line
> second line
>
> > nested quote

> [!NOTE] 참고 사항
> 알림 내용 alert body with **bold**.

> [!WARNING]
> Be careful.

Footnote here[^1] and again[^long].

[^1]: 첫 번째 각주 first footnote.
[^long]: A longer footnote with `code`.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

---

<div class="custom">raw <b>html</b> block</div>

# Second Chapter 두 번째

### Deeper heading

Last paragraph.
"#;

fn resource(src: &str) -> Option<Resource> {
    if src == "images/logo.png" {
        Some(Resource { bytes: PNG_1X1.to_vec(), mime: "image/png".into() })
    } else {
        None
    }
}

fn input<'a>(res: &'a dyn Fn(&str) -> Option<Resource>, toc: bool, number: bool) -> ExportInput<'a> {
    ExportInput {
        title: String::new(),
        author: String::new(),
        language: "ko".into(),
        date: "2026-11-27T10:20:30".into(),
        markdown: NOTE.into(),
        html_body: String::new(),
        css: "body { color: #222; } .markdown-body h1 > a { x: y; }".into(),
        resource: res,
        options: ExportOptions { toc, number_headings: number, ..ExportOptions::default() },
    }
}

fn text(f: ExportFormat, inp: &ExportInput) -> String {
    String::from_utf8(export(f, inp).unwrap_or_else(|e| panic!("{f:?}: {e}"))).expect("utf-8")
}

// ---------- a tiny XML well-formedness checker ----------

fn check_xml(name: &str, s: &str) {
    if let Err(e) = xml_ok(s) {
        let ctx: String = s.chars().take(400).collect();
        panic!("{name} is not well-formed XML: {e}\n{ctx}");
    }
}

fn xml_ok(s: &str) -> Result<(), String> {
    let b = s.as_bytes();
    let mut i = 0;
    let mut stack: Vec<String> = Vec::new();
    let mut roots = 0;
    let check_text = |t: &str, at: usize| -> Result<(), String> {
        let mut rest = t;
        while let Some(p) = rest.find('&') {
            let after = &rest[p + 1..];
            let end = after.find(';').ok_or(format!("bare & at {at}"))?;
            let ent = &after[..end];
            let ok = matches!(ent, "amp" | "lt" | "gt" | "quot" | "apos")
                || (ent.starts_with("#x") && ent.len() > 2 && ent[2..].chars().all(|c| c.is_ascii_hexdigit()))
                || (ent.starts_with('#') && ent.len() > 1 && ent[1..].chars().all(|c| c.is_ascii_digit()));
            if !ok {
                return Err(format!("bad entity &{ent}; at {at}"));
            }
            rest = &after[end + 1..];
        }
        if t.contains('<') {
            return Err(format!("< in text at {at}"));
        }
        Ok(())
    };
    while i < b.len() {
        if b[i] != b'<' {
            let next = s[i..].find('<').map(|p| i + p).unwrap_or(s.len());
            let t = &s[i..next];
            if stack.is_empty() && !t.trim().is_empty() {
                return Err(format!("text outside root at {i}: {:?}", &t[..t.len().min(40)]));
            }
            check_text(t, i)?;
            i = next;
            continue;
        }
        let rest = &s[i..];
        if rest.starts_with("<?") {
            i += rest.find("?>").ok_or("unterminated PI")? + 2;
            continue;
        }
        if rest.starts_with("<!--") {
            let e = rest.find("-->").ok_or("unterminated comment")?;
            if rest[4..e].contains("--") {
                return Err("-- inside comment".into());
            }
            i += e + 3;
            continue;
        }
        if rest.starts_with("<![CDATA[") {
            i += rest.find("]]>").ok_or("unterminated CDATA")? + 3;
            continue;
        }
        if rest.starts_with("<!DOCTYPE") || rest.starts_with("<!doctype") {
            i += rest.find('>').ok_or("unterminated doctype")? + 1;
            continue;
        }
        // tag: find the end respecting quotes
        let mut j = 1;
        let mut q: Option<u8> = None;
        while j < rest.len() {
            let c = rest.as_bytes()[j];
            match q {
                Some(qc) if c == qc => q = None,
                Some(_) => {
                    if c == b'<' {
                        return Err(format!("< in attribute at {}", i + j));
                    }
                }
                None if c == b'"' || c == b'\'' => q = Some(c),
                None if c == b'>' => break,
                None => {}
            }
            j += 1;
        }
        if j >= rest.len() {
            return Err(format!("unterminated tag at {i}"));
        }
        let tag = &rest[1..j];
        i += j + 1;
        if let Some(name) = tag.strip_prefix('/') {
            let name = name.trim();
            let open = stack.pop().ok_or(format!("close </{name}> without open"))?;
            if open != name {
                return Err(format!("</{name}> closes <{open}>"));
            }
            continue;
        }
        let self_close = tag.ends_with('/');
        let tag = tag.trim_end_matches('/');
        let name: String = tag.chars().take_while(|c| !c.is_whitespace()).collect();
        if name.is_empty() || !name.chars().next().unwrap().is_alphabetic() && !name.starts_with('_') {
            return Err(format!("bad tag name {name:?}"));
        }
        // attributes: name="value" pairs, unique names
        let mut attrs = &tag[name.len()..];
        let mut seen: Vec<String> = Vec::new();
        loop {
            attrs = attrs.trim_start();
            if attrs.is_empty() {
                break;
            }
            let eq = attrs.find('=').ok_or(format!("attribute without value in <{name}>: {attrs:?}"))?;
            let an = attrs[..eq].trim().to_string();
            if an.is_empty() || an.contains(char::is_whitespace) {
                return Err(format!("bad attribute name {an:?} in <{name}>"));
            }
            if seen.contains(&an) {
                return Err(format!("duplicate attribute {an} in <{name}>"));
            }
            seen.push(an);
            let v = attrs[eq + 1..].trim_start();
            let qc = v.chars().next().ok_or("missing attr value")?;
            if qc != '"' && qc != '\'' {
                return Err(format!("unquoted attribute in <{name}>"));
            }
            let end = v[1..].find(qc).ok_or("unterminated attribute")? + 1;
            check_text(&v[1..end], i)?;
            attrs = &v[end + 1..];
        }
        if stack.is_empty() {
            roots += 1;
            if roots > 1 {
                return Err("more than one root element".into());
            }
        }
        if !self_close {
            stack.push(name);
        }
    }
    if !stack.is_empty() {
        return Err(format!("unclosed elements: {stack:?}"));
    }
    if roots != 1 {
        return Err("no root element".into());
    }
    Ok(())
}

#[test]
fn xml_checker_works() {
    assert!(xml_ok("<a><b x=\"1\"/>t &amp; u</a>").is_ok());
    assert!(xml_ok("<a><b></a>").is_err());
    assert!(xml_ok("<a>&nbsp;</a>").is_err());
    assert!(xml_ok("<a x=1></a>").is_err());
    assert!(xml_ok("<a>x</a><b/>").is_err());
}

// ---------- zip helpers ----------

struct Pkg {
    names: Vec<String>,
    stored_first: bool,
    files: std::collections::HashMap<String, Vec<u8>>,
}

fn unzip(bytes: &[u8]) -> Pkg {
    let mut z = zip::ZipArchive::new(Cursor::new(bytes)).expect("valid zip");
    let mut names = Vec::new();
    let mut files = std::collections::HashMap::new();
    let mut stored_first = false;
    for i in 0..z.len() {
        let mut f = z.by_index(i).unwrap();
        if i == 0 {
            stored_first = f.compression() == zip::CompressionMethod::Stored;
        }
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).unwrap();
        names.push(f.name().to_string());
        files.insert(f.name().to_string(), buf);
    }
    Pkg { names, stored_first, files }
}

impl Pkg {
    fn s(&self, n: &str) -> String {
        String::from_utf8(self.files.get(n).unwrap_or_else(|| panic!("missing {n} in {:?}", self.names)).clone()).unwrap()
    }
    fn check_all_xml(&self) {
        for n in &self.names {
            if n.ends_with(".xml") || n.ends_with(".rels") || n.ends_with(".xhtml") || n.ends_with(".opf") || n.ends_with(".ncx") {
                check_xml(n, &self.s(n));
            }
        }
    }
}

// ---------- tests ----------

#[test]
fn every_format_exports() {
    let res = resource;
    for toc in [false, true] {
        for num in [false, true] {
            let inp = input(&res, toc, num);
            for &f in ExportFormat::all() {
                let out = export(f, &inp).unwrap_or_else(|e| panic!("{f:?} failed: {e}"));
                assert!(!out.is_empty(), "{f:?} empty");
                if !f.is_binary() {
                    let s = String::from_utf8(out).unwrap_or_else(|_| panic!("{f:?} not utf-8"));
                    if f != ExportFormat::Rtf {
                        assert!(s.contains("Introduction") || s.contains("소개"), "{f:?} lost the heading");
                    }
                }
            }
        }
    }
    assert!(ExportFormat::all().len() >= 17);
}

#[test]
fn empty_note_exports() {
    let res = resource;
    let mut inp = input(&res, true, true);
    inp.markdown = String::new();
    for &f in ExportFormat::all() {
        let out = export(f, &inp).unwrap_or_else(|e| panic!("{f:?} failed on empty: {e}"));
        if f == ExportFormat::Docx || f == ExportFormat::Odt || f == ExportFormat::Epub {
            unzip(&out).check_all_xml();
        }
    }
}

#[test]
fn format_ids_round_trip() {
    for &f in ExportFormat::all() {
        assert_eq!(ExportFormat::from_id(f.id()), Some(f));
        assert!(!f.extension().is_empty() && f.mime().contains('/'));
        let j = serde_json::to_string(&f).unwrap();
        assert_eq!(j, format!("\"{}\"", f.id()));
        let back: ExportFormat = serde_json::from_str(&j).unwrap();
        assert_eq!(back, f);
    }
    assert_eq!(ExportFormat::from_id("MD"), Some(ExportFormat::Markdown));
    assert_eq!(ExportFormat::from_id("tex"), Some(ExportFormat::Latex));
    assert!(ExportFormat::from_id("pdf").is_none());
    assert!(serde_json::from_str::<ExportFormat>("\"nope\"").is_err());
}

#[test]
fn options_deserialize_camel_case_with_defaults() {
    let o: ExportOptions = serde_json::from_str(r#"{"toc":true,"numberHeadings":true,"pageSize":"Letter","fontSizePt":12}"#).unwrap();
    assert!(o.toc && o.number_headings && o.embed_images);
    assert_eq!(o.page_size, "Letter");
    assert_eq!(o.font_size_pt, 12.0);
    let d: ExportOptions = serde_json::from_str("{}").unwrap();
    assert_eq!(d, ExportOptions::default());
    assert_eq!(d.page_size, "A4");
}

#[test]
fn docx_package() {
    let res = resource;
    let inp = input(&res, true, true);
    let p = unzip(&export(ExportFormat::Docx, &inp).unwrap());
    for n in [
        "[Content_Types].xml",
        "_rels/.rels",
        "word/document.xml",
        "word/_rels/document.xml.rels",
        "word/styles.xml",
        "word/numbering.xml",
        "word/footnotes.xml",
        "word/settings.xml",
        "docProps/core.xml",
        "word/media/image1.png",
    ] {
        assert!(p.files.contains_key(n), "missing {n}");
    }
    p.check_all_xml();
    let doc = p.s("word/document.xml");
    assert!(doc.contains("한국어 문장과"), "Korean text");
    assert!(doc.contains("w:val=\"Heading1\"") && doc.contains("w:val=\"Heading2\""));
    assert!(doc.contains("<w:highlight w:val=\"yellow\"/>"));
    assert!(doc.contains("<w:strike/>"));
    assert!(doc.contains("<w:footnoteReference w:id=\"1\"/>"));
    assert!(doc.contains("<w:tbl>") && doc.contains("<w:jc w:val=\"right\"/>"));
    assert!(doc.contains("TOC \\o"), "TOC field");
    assert!(doc.contains("<w:numPr>"));
    assert!(doc.contains("w:fill=\"DDF4FF\""), "shaded NOTE alert");
    assert!(doc.contains("<w:drawing>") && doc.contains("cx=\"9525\" cy=\"9525\""), "1x1 px image = 9525 EMU");
    assert!(doc.contains(">1.1 <") || doc.contains(">1.1 </w:t>") || doc.contains("1.1 "), "numbered headings");
    assert!(doc.contains("\\int_0^1"), "math TeX source");
    assert!(doc.contains("w:anchor=\"_md_h2\""), "internal link to a heading bookmark");
    let rels = p.s("word/_rels/document.xml.rels");
    assert!(rels.contains("https://example.com/a?b=1&amp;c=2") && rels.contains("TargetMode=\"External\""));
    assert!(rels.contains("media/image1.png"));
    let ct = p.s("[Content_Types].xml");
    assert!(ct.contains("Extension=\"png\""));
    let styles = p.s("word/styles.xml");
    for s in ["\"Title\"", "\"Heading1\"", "\"Heading6\"", "\"Quote\"", "\"Code\"", "\"Hyperlink\"", "\"TableGrid\""] {
        assert!(styles.contains(&format!("w:styleId={s}")), "style {s}");
    }
    assert!(styles.contains("Malgun Gothic"));
    let fnx = p.s("word/footnotes.xml");
    assert!(fnx.contains("첫 번째 각주") && fnx.contains("w:id=\"2\""));
    assert!(p.s("docProps/core.xml").contains("내보내기 시험 노트"));
    assert!(p.s("docProps/core.xml").contains("홍길동"));
}

#[test]
fn docx_letter_and_no_images() {
    let res = resource;
    let mut inp = input(&res, false, false);
    inp.options.page_size = "Letter".into();
    inp.options.embed_images = false;
    let p = unzip(&export(ExportFormat::Docx, &inp).unwrap());
    p.check_all_xml();
    let doc = p.s("word/document.xml");
    assert!(doc.contains("w:w=\"12240\""));
    assert!(!doc.contains("<w:drawing>"));
    assert!(!p.names.iter().any(|n| n.starts_with("word/media/")));
}

#[test]
fn odt_package() {
    let res = resource;
    let inp = input(&res, true, true);
    let p = unzip(&export(ExportFormat::Odt, &inp).unwrap());
    assert_eq!(p.names[0], "mimetype");
    assert!(p.stored_first, "mimetype stored");
    assert_eq!(p.s("mimetype"), "application/vnd.oasis.opendocument.text");
    p.check_all_xml();
    let c = p.s("content.xml");
    assert!(c.contains("한국어 문장과"));
    assert!(c.contains("text:outline-level=\"2\""));
    assert!(c.contains("<text:note "));
    assert!(c.contains("<table:table "));
    assert!(c.contains("text:style-name=\"Highlight\""));
    assert!(c.contains("xlink:href=\"Pictures/image1.png\""));
    assert!(c.contains("<text:table-of-content "));
    assert!(c.contains("text:style-name=\"L_Number\""));
    assert!(c.contains("Alert_note"));
    let man = p.s("META-INF/manifest.xml");
    assert!(man.contains("Pictures/image1.png") && man.contains("content.xml"));
    assert!(p.files.contains_key("Pictures/image1.png"));
    let st = p.s("styles.xml");
    assert!(st.contains("Heading_20_1") && st.contains("fo:page-width=\"21cm\""));
    assert!(p.s("meta.xml").contains("홍길동"));
}

#[test]
fn epub_package() {
    let res = resource;
    let inp = input(&res, true, true);
    let p = unzip(&export(ExportFormat::Epub, &inp).unwrap());
    assert_eq!(p.names[0], "mimetype");
    assert!(p.stored_first);
    assert_eq!(p.s("mimetype"), "application/epub+zip");
    for n in ["META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/toc.ncx", "OEBPS/style.css", "OEBPS/ch1.xhtml", "OEBPS/ch2.xhtml"] {
        assert!(p.files.contains_key(n), "missing {n}: {:?}", p.names);
    }
    p.check_all_xml();
    let opf = p.s("OEBPS/content.opf");
    assert!(opf.contains("properties=\"nav\"") && opf.contains("dcterms:modified") && opf.contains("2026-11-27T10:20:30Z"));
    assert!(opf.contains("<dc:language>ko</dc:language>") && opf.contains("홍길동"));
    assert!(opf.contains("image/png"));
    let ch1 = p.s("OEBPS/ch1.xhtml");
    assert!(ch1.contains("한국어 문장과"));
    assert!(ch1.contains("src=\"images/img1.png\""));
    assert!(ch1.contains("<mark>"));
    let ch2 = p.s("OEBPS/ch2.xhtml");
    assert!(ch2.contains("Second Chapter"));
    assert!(ch2.contains("ch1.xhtml#fnref-1") || ch1.contains("#fn-1"), "footnote links resolve");
    let nav = p.s("OEBPS/nav.xhtml");
    assert!(nav.contains("epub:type=\"toc\"") && nav.contains("ch2.xhtml#"));
    assert!(nav.contains("1.1 "), "numbered nav");
    assert!(p.s("OEBPS/style.css").contains("color: #222"));
    assert!(p.files.contains_key("OEBPS/images/img1.png"));
}

#[test]
fn epub_from_caller_html_is_xhtml() {
    let res = resource;
    let mut inp = input(&res, false, false);
    inp.html_body = r##"<h1><a href="#intro" aria-hidden="true" class="anchor" id="intro"></a>Intro &amp; 소개</h1>
<p>Text&nbsp;with <br> breaks<br/> and <img src="images/logo.png" alt=logo> image and <input type=checkbox checked disabled></p>
<p>Math: <span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x</span></span>
<ul><li>one<li>two</ul>
<script>alert(1)</script>
<h1 id="second">Second</h1><p>more &copy; text & stray</p>"##
        .into();
    let p = unzip(&export(ExportFormat::Epub, &inp).unwrap());
    p.check_all_xml();
    let opf = p.s("OEBPS/content.opf");
    assert!(opf.contains("properties=\"mathml\""));
    let ch1 = p.s("OEBPS/ch1.xhtml");
    assert!(!ch1.contains("<script"));
    assert!(ch1.contains("images/img1.png"));
    assert!(ch1.contains("\u{a0}") || ch1.contains("&#160;"));
    let nav = p.s("OEBPS/nav.xhtml");
    assert!(nav.contains("ch1.xhtml#intro") && nav.contains("ch2.xhtml#second"));
    assert!(nav.contains("Intro &amp; 소개"));
}

#[test]
fn rtf_escapes_korean() {
    let res = resource;
    let inp = input(&res, true, false);
    let s = text(ExportFormat::Rtf, &inp);
    assert!(s.starts_with("{\\rtf1"));
    assert!(s.is_ascii(), "RTF must be 7-bit");
    // 한 = U+D55C → 54620 → as signed 16-bit -10916
    assert!(s.contains("\\u-10916?"), "Korean as \\u escapes");
    assert!(s.contains("\\fonttbl"));
    assert!(s.contains("\\b ") && s.contains("\\i "));
    assert!(s.contains("\\trowd") && s.contains("\\cell") && s.contains("\\row"));
    assert!(s.contains("\\footnote"));
    assert!(s.contains("HYPERLINK"));
    assert!(s.contains("\\pngblip"));
    assert!(s.contains("\\highlight3"));
    let open = s.matches('{').count() - s.matches("\\{").count();
    let close = s.matches('}').count() - s.matches("\\}").count();
    assert_eq!(open, close, "balanced groups");
}

#[test]
fn latex_escapes_and_packages() {
    let res = resource;
    let inp = input(&res, true, true);
    let s = text(ExportFormat::Latex, &inp);
    assert!(s.contains("\\documentclass"));
    assert!(s.contains("\\usepackage{kotex}"));
    assert!(s.contains("\\usepackage{hyperref}") && s.contains("\\usepackage{graphicx}") && s.contains("longtable"));
    assert!(s.contains("100\\%") && s.contains("\\&") && s.contains("cost\\_center") && s.contains("\\#1") && s.contains("\\$5"));
    assert!(s.contains("\\{braces\\}") && s.contains("\\textasciitilde{}") && s.contains("\\textbackslash{}"));
    assert!(s.contains("\\tableofcontents"));
    assert!(s.contains("\\section{") && s.contains("\\subsection{"));
    assert!(s.contains("\\(E = mc^2\\)"));
    assert!(s.contains("\\int_0^1 x^2"));
    assert!(s.contains("\\begin{mdalert}{참고 사항}"));
    assert!(s.contains("\\begin{longtable}{@{}lrc@{}}"));
    assert!(s.contains("\\footnote{"));
    assert!(s.contains("\\mdhighlight{"));
    assert!(s.contains("\\begin{lstlisting}") || s.contains("\\begin{verbatim}"));
    assert!(s.contains("\\item[$\\boxtimes$]"));
    assert!(s.contains("\\includegraphics"));
    assert!(s.contains("\\href{https://example.com/a?b=1&c=2}"));
    assert!(s.trim_end().ends_with("\\end{document}"));
    let mut en = input(&res, false, false);
    en.language = "en".into();
    let s = text(ExportFormat::Latex, &en);
    assert!(!s.contains("kotex") && s.contains("secnumdepth"));
}

#[test]
fn html_standalone() {
    let res = resource;
    let inp = input(&res, true, true);
    let s = text(ExportFormat::Html, &inp);
    assert!(s.starts_with("<!DOCTYPE html>"));
    assert!(s.contains("<html lang=\"ko\">") && s.contains("<meta charset=\"utf-8\" />"));
    assert!(s.contains("<title>내보내기 시험 노트</title>"));
    assert!(s.contains("color: #222"), "css inlined");
    assert!(s.contains("data:image/png;base64,"));
    assert!(s.contains("<nav class=\"toc\""));
    assert!(s.contains("heading-number\">1.1 "));
    assert!(s.contains("<mark>강조 highlight</mark>"));
    assert!(s.contains("markdown-alert-note") && s.contains("참고 사항"));
    assert!(s.contains("<table>") && s.contains("text-align: right"));
    assert!(s.contains("class=\"footnotes\""));
    assert!(s.contains("<del>취소선</del>"));
    // without embedding: the original src stays
    let mut no = input(&res, false, false);
    no.options.embed_images = false;
    let s = text(ExportFormat::Html, &no);
    assert!(!s.contains("data:image") && s.contains("src=\"images/logo.png\""));
    // caller HTML is used as the body
    let mut c = input(&res, true, false);
    c.html_body = "<h1 id=\"x\">Caller <span class=\"katex\">K</span></h1><p><img src=\"images/logo.png\"></p>".into();
    let s = text(ExportFormat::Html, &c);
    assert!(s.contains("class=\"katex\"") && s.contains("data:image/png") && s.contains("href=\"#x\""));
}

#[test]
fn html_plain_has_no_classes_or_styles() {
    let res = resource;
    let inp = input(&res, true, true);
    let s = text(ExportFormat::HtmlPlain, &inp);
    assert!(!s.contains("class=") && !s.contains("style=") && !s.contains("<style"));
    assert!(s.contains("<h1 id=") && s.contains("<mark>") && s.contains("<table>"));
    assert!(s.contains("1.1 "));
    assert!(!s.contains("<!DOCTYPE"));
}

#[test]
fn markdown_round_trip() {
    let res = resource;
    let inp = input(&res, false, false);
    let s = text(ExportFormat::Markdown, &inp);
    assert!(s.starts_with("---\ntitle: 내보내기 시험 노트"));
    assert!(s.contains("==강조 highlight=="));
    assert!(s.contains("[!NOTE]"));
    assert!(s.contains("- [x] 완료된 작업"));
    assert!(s.contains("$E = mc^2$"));
    assert!(s.contains("[^1]"));
    let t = text(ExportFormat::Markdown, &input(&res, true, true));
    assert!(t.contains("- [1 소개 Introduction](#소개-introduction)"));
    assert!(t.contains("## 1.1 세부 사항 Details"));
}

#[test]
fn plain_text_pads_tables() {
    let res = resource;
    let s = text(ExportFormat::Text, &input(&res, false, false));
    assert!(s.contains("소개 Introduction\n================"));
    assert!(s.contains("[x] 완료된 작업 done") && s.contains("[ ] 남은 작업 todo"));
    let lines: Vec<&str> = s.lines().filter(|l| l.contains(" | ")).collect();
    assert!(lines.len() >= 3, "{s}");
    // all table rows have the separator at the same display column
    let col = |l: &str| unicode_col(&l[..l.find(" | ").unwrap()]);
    let c0 = col(lines[0]);
    for l in &lines {
        assert_eq!(col(l), c0, "padded: {l:?}");
    }
    assert!(s.contains("[1] 첫 번째 각주"));
    assert!(s.contains("1. 첫째 first") && s.contains("   - 중첩 nested a"));
}

fn unicode_col(s: &str) -> usize {
    s.chars().map(|c| if ('\u{AC00}'..='\u{D7A3}').contains(&c) { 2 } else { 1 }).sum()
}

#[test]
fn json_ast() {
    let res = resource;
    let s = text(ExportFormat::Json, &input(&res, false, false));
    let v: serde_json::Value = serde_json::from_str(&s).unwrap();
    assert_eq!(v["type"], "document");
    assert_eq!(v["attrs"]["title"], "내보내기 시험 노트");
    let kids = v["children"].as_array().unwrap();
    assert!(kids.iter().any(|k| k["type"] == "heading" && k["attrs"]["level"] == 1));
    assert!(kids.iter().any(|k| k["type"] == "table"));
    assert!(s.contains("\"type\": \"alert\"") && s.contains("\"type\": \"math\""));
}

#[test]
fn opml_outline() {
    let res = resource;
    let s = text(ExportFormat::Opml, &input(&res, false, false));
    check_xml("opml", &s);
    assert!(s.contains("<opml version=\"2.0\">"));
    assert!(s.contains("<outline text=\"소개 Introduction\" _note=\""));
    assert!(s.contains("<outline text=\"세부 사항 Details\""));
    assert!(s.contains("&#10;"), "multi-line notes keep their line breaks");
    assert!(s.contains("<ownerName>홍길동</ownerName>"));
}

#[test]
fn lightweight_markup_formats() {
    let res = resource;
    let inp = input(&res, true, false);
    let rst = text(ExportFormat::Rst, &inp);
    assert!(rst.contains(".. admonition:: 참고 사항\n   :class: note") && rst.contains(".. warning::"));
    assert!(rst.contains(".. code:: rust") && rst.contains(".. math::") && rst.contains(".. list-table::"));
    assert!(rst.contains("[1]_") && rst.contains(".. [1] ") && rst.contains("`link <https://example.com/a?b=1&c=2>`__"));
    assert!(rst.contains(".. contents::") && rst.contains(":math:`E = mc^2`"));
    assert!(rst.contains("cost\\_center"));

    let ad = text(ExportFormat::AsciiDoc, &inp);
    assert!(ad.starts_with("= 내보내기 시험 노트\n홍길동\n"));
    assert!(ad.contains("[NOTE]\n====") && ad.contains(".참고 사항") && ad.contains("[WARNING]"));
    assert!(ad.contains("[source,rust]") && ad.contains("|===") && ad.contains("[cols=\"<,>,^\",options=\"header\"]"));
    assert!(ad.contains("footnote:[") && ad.contains("stem:[E = mc^2]") && ad.contains(":toc:"));
    assert!(ad.contains("##강조 highlight##") && ad.contains("* [x] "));

    let mw = text(ExportFormat::MediaWiki, &inp);
    assert!(mw.contains("== 소개 Introduction ==") && mw.contains("{| class=\"wikitable\"") && mw.contains("<references />"));
    assert!(mw.contains("<ref name=\"fn1\">") && mw.contains("<math>E = mc^2</math>") && mw.contains("__TOC__"));
    assert!(mw.contains("[[Other Note|note link]]") && mw.contains("<syntaxhighlight lang=\"rust\">"));
    assert!(mw.contains("'''굵게 bold'''") && mw.contains("# 첫째 first") && mw.contains("#* 중첩 nested"));

    let tx = text(ExportFormat::Textile, &inp);
    assert!(tx.contains("h1(#") && tx.contains("|_<. ") && tx.contains("fn1. ") && tx.contains("[*굵게 bold*]"));
    assert!(tx.contains("[\"link\":https://example.com/a?b=1&c=2]") && tx.contains("p(markdown-alert markdown-alert-note)."));

    let org = text(ExportFormat::Org, &inp);
    assert!(org.starts_with("#+TITLE: 내보내기 시험 노트"));
    assert!(org.contains("#+OPTIONS: toc:t") && org.contains("#+BEGIN_SRC rust") && org.contains("#+BEGIN_note"));
    assert!(org.contains("[fn:1]") && org.contains("- [X] ") && org.contains("[[https://example.com/a?b=1&c=2][link]]"));
    assert!(org.contains("* 소개 Introduction") && org.contains("** 세부 사항") && org.contains(":CUSTOM_ID:"));

    let dj = text(ExportFormat::Djot, &inp);
    assert!(dj.contains("{=강조 highlight=}") && dj.contains("::: note") && dj.contains("[^1]: "));
    assert!(dj.contains("$`E = mc^2`") && dj.contains("``` rust") && dj.contains("|:---|---:|:---:|"));
    assert!(dj.contains("- [x] "));
}

#[test]
fn highlight_pairing_and_flatten() {
    assert_eq!(flatten_highlights("a ==b== c `==d==` e"), "a b c `==d==` e");
    assert_eq!(flatten_highlights("x == y"), "x == y");
    assert_eq!(flatten_highlights("```\n==keep==\n```\n==go=="), "```\n==keep==\n```\ngo");
    let res = resource;
    let mut inp = input(&res, false, false);
    inp.markdown = "a == b and ==**strong mark**== end".into();
    let s = text(ExportFormat::HtmlPlain, &inp);
    assert!(s.contains("a == b and <mark><strong>strong mark</strong></mark> end"), "{s}");
}

#[test]
fn title_falls_back_to_front_matter_then_h1() {
    let res = resource;
    let mut inp = input(&res, false, false);
    inp.markdown = "# 첫 제목\n\nbody".into();
    let s = text(ExportFormat::Html, &inp);
    assert!(s.contains("<title>첫 제목</title>"));
    inp.title = "Given".into();
    assert!(text(ExportFormat::Html, &inp).contains("<title>Given</title>"));
}

/// Writes every format of the sample note to `$MDCORE_EXPORT_DUMP/` for manual inspection
/// (open the .docx / .odt / .epub in Word, LibreOffice or an e-book reader). No-op when unset.
#[test]
fn dump_samples_when_requested() {
    let Ok(dir) = std::env::var("MDCORE_EXPORT_DUMP") else { return };
    std::fs::create_dir_all(&dir).unwrap();
    let res = resource;
    let inp = input(&res, true, true);
    for &f in ExportFormat::all() {
        let out = export(f, &inp).unwrap();
        std::fs::write(format!("{dir}/sample-{}.{}", f.id(), f.extension()), out).unwrap();
    }
}

/// With `$MDCORE_EXPORT_BISECT` set, writes one small DOCX/ODT per feature (for checking in Word/LibreOffice).
#[test]
fn dump_feature_packages_when_requested() {
    let Ok(dir) = std::env::var("MDCORE_EXPORT_BISECT") else { return };
    std::fs::create_dir_all(&dir).unwrap();
    let snippets = [
        "Special characters: 100% & cost_center #1 $5 {braces} ~tilde^ <tag> back.",
        "A [link](https://example.com/a?b=1&c=2) x",
        "a [note link](Other%20Note.md) x",
        "[section](#details)

## Details",
        "## 세부 사항 Details",
        "Inline math $E = mc^2$ here.<br>After a break.",
        "1. first
2. second
   - nested *a*
   - nested b
     1. deep one
3. third",
        "> line
>
> > nested quote",
        "> [!NOTE] 참고 사항
> 알림 내용 alert body with **bold**.",
        "Footnote here[^1] and again[^long].

[^1]: first.
[^long]: A longer footnote with `code`.",
        "<div class=\"custom\">raw <b>html</b> block</div>",
        "# A

### Deeper heading

Last paragraph.",
        "Hello 안녕",
        "# Heading\n\ntext",
        "- a\n- b\n  1. c",
        "- [x] done\n- [ ] todo",
        "| a | b |\n|:-|-:|\n| 1 | 2 |",
        "```rust\nfn  main() {}\n```",
        "> quote",
        "> [!NOTE]\n> alert",
        "x[^1]\n\n[^1]: note",
        "$x$ and\n\n$$\ny\n$$",
        "![logo](images/logo.png)",
        "**b** *i* ~~s~~ ==m== `c` [l](https://x.y)",
        "---",
    ];
    let res = resource;
    for (i, md) in snippets.iter().enumerate() {
        for toc in [false, true] {
            let mut inp = input(&res, toc, false);
            inp.markdown = md.to_string();
            for f in [ExportFormat::Odt, ExportFormat::Docx] {
                let out = export(f, &inp).unwrap();
                std::fs::write(format!("{dir}/f{i:02}-{}.{}", if toc { "toc" } else { "plain" }, f.extension()), out).unwrap();
            }
        }
    }
}
