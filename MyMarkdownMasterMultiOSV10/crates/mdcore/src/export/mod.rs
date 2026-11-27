//! Export a note to many document formats.
//!
//! Every writer works from the same intermediate tree (`ir.rs`), which is built by walking the comrak AST
//! (parsed with `crate::options::markdown_options()`), so all formats agree on what the note contains:
//! headings (optionally numbered), paragraphs, emphasis/strong/strike, `==highlight==`, code, quotes,
//! GitHub alerts, nested ordered/bullet/task lists, tables with alignment, links, images, footnotes, rules,
//! `$math$` / `$$math$$`, front matter (dropped from the body, title/author into metadata), breaks and raw HTML.
//!
//! The zip-based formats (DOCX, ODT, EPUB) are written with the `zip` crate in memory, so everything here
//! builds for `wasm32-unknown-unknown` as well as the desktop targets (no clock, no file system).

mod asciidoc;
mod djot;
mod docx;
mod epub;
mod html;
mod htmltok;
mod ir;
mod json;
mod latex;
mod markdown;
mod mediawiki;
mod odt;
mod opml;
mod org;
mod rst;
mod rtf;
mod text;
mod textile;
mod util;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// The export formats. Each has a stable string id (used by the UI and by serde).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ExportFormat {
    Html,
    HtmlPlain,
    Markdown,
    Text,
    Docx,
    Odt,
    Epub,
    Rtf,
    Latex,
    Djot,
    Rst,
    AsciiDoc,
    MediaWiki,
    Textile,
    Opml,
    Org,
    Json,
}

const ALL: &[ExportFormat] = &[
    ExportFormat::Html,
    ExportFormat::HtmlPlain,
    ExportFormat::Markdown,
    ExportFormat::Text,
    ExportFormat::Docx,
    ExportFormat::Odt,
    ExportFormat::Epub,
    ExportFormat::Rtf,
    ExportFormat::Latex,
    ExportFormat::Djot,
    ExportFormat::Rst,
    ExportFormat::AsciiDoc,
    ExportFormat::MediaWiki,
    ExportFormat::Textile,
    ExportFormat::Opml,
    ExportFormat::Org,
    ExportFormat::Json,
];

impl ExportFormat {
    /// Parses an id (case-insensitive). Accepts the canonical ids plus a few aliases
    /// (`md`, `txt`, `tex`, `htmlplain`, `html_plain`, `adoc`, `wiki`, `restructuredtext`, `epub3`).
    pub fn from_id(id: &str) -> Option<Self> {
        let id = id.trim().to_ascii_lowercase();
        Some(match id.as_str() {
            "html" | "htm" => Self::Html,
            "html-plain" | "htmlplain" | "html_plain" | "plain-html" => Self::HtmlPlain,
            "markdown" | "md" | "gfm" | "commonmark" => Self::Markdown,
            "text" | "txt" | "plain" | "plaintext" => Self::Text,
            "docx" | "word" => Self::Docx,
            "odt" => Self::Odt,
            "epub" | "epub3" => Self::Epub,
            "rtf" => Self::Rtf,
            "latex" | "tex" => Self::Latex,
            "djot" | "dj" => Self::Djot,
            "rst" | "restructuredtext" => Self::Rst,
            "asciidoc" | "adoc" => Self::AsciiDoc,
            "mediawiki" | "wiki" => Self::MediaWiki,
            "textile" => Self::Textile,
            "opml" => Self::Opml,
            "org" | "orgmode" => Self::Org,
            "json" | "ast" => Self::Json,
            _ => return None,
        })
    }

    pub fn id(&self) -> &'static str {
        match self {
            Self::Html => "html",
            Self::HtmlPlain => "html-plain",
            Self::Markdown => "markdown",
            Self::Text => "text",
            Self::Docx => "docx",
            Self::Odt => "odt",
            Self::Epub => "epub",
            Self::Rtf => "rtf",
            Self::Latex => "latex",
            Self::Djot => "djot",
            Self::Rst => "rst",
            Self::AsciiDoc => "asciidoc",
            Self::MediaWiki => "mediawiki",
            Self::Textile => "textile",
            Self::Opml => "opml",
            Self::Org => "org",
            Self::Json => "json",
        }
    }

    /// File extension without the dot.
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Html | Self::HtmlPlain => "html",
            Self::Markdown => "md",
            Self::Text => "txt",
            Self::Docx => "docx",
            Self::Odt => "odt",
            Self::Epub => "epub",
            Self::Rtf => "rtf",
            Self::Latex => "tex",
            Self::Djot => "dj",
            Self::Rst => "rst",
            Self::AsciiDoc => "adoc",
            Self::MediaWiki => "wiki",
            Self::Textile => "textile",
            Self::Opml => "opml",
            Self::Org => "org",
            Self::Json => "json",
        }
    }

    pub fn mime(&self) -> &'static str {
        match self {
            Self::Html | Self::HtmlPlain => "text/html",
            Self::Markdown => "text/markdown",
            Self::Text => "text/plain",
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Self::Odt => "application/vnd.oasis.opendocument.text",
            Self::Epub => "application/epub+zip",
            Self::Rtf => "application/rtf",
            Self::Latex => "application/x-tex",
            Self::Djot => "text/x-djot",
            Self::Rst => "text/x-rst",
            Self::AsciiDoc => "text/asciidoc",
            Self::MediaWiki => "text/x-wiki",
            Self::Textile => "text/x-textile",
            Self::Opml => "text/x-opml",
            Self::Org => "text/x-org",
            Self::Json => "application/json",
        }
    }

    /// True when the output is binary (a zip package) rather than UTF-8 text.
    pub fn is_binary(&self) -> bool {
        matches!(self, Self::Docx | Self::Odt | Self::Epub)
    }

    pub fn all() -> &'static [ExportFormat] {
        ALL
    }
}

impl Serialize for ExportFormat {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.id())
    }
}

impl<'de> Deserialize<'de> for ExportFormat {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        ExportFormat::from_id(&s).ok_or_else(|| serde::de::Error::custom(format!("unknown export format: {s}")))
    }
}

/// An image (or other file) the note refers to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resource {
    pub bytes: Vec<u8>,
    pub mime: String,
}

/// Options shown in the export dialog. Deserialises from camelCase JSON; every field has a default.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ExportOptions {
    /// Add a table of contents (DOCX: a TOC field; HTML: a nav list; LaTeX: \tableofcontents; ODT: an index;
    /// AsciiDoc `:toc:`, Org `toc:t`, MediaWiki `__TOC__`, RST `.. contents::`, Markdown/Djot/Text a list).
    /// EPUB always has nav.xhtml; with `toc` it also gets a visible contents page.
    pub toc: bool,
    /// Number headings 1, 1.1, 1.1.1 … (counted from the shallowest heading level in the note).
    pub number_headings: bool,
    /// Embed images found through `ExportInput::resource` (data URIs in HTML, parts in DOCX/ODT/EPUB,
    /// \pict in RTF). Otherwise images are linked.
    pub embed_images: bool,
    /// "A4" or "Letter" (DOCX, ODT, LaTeX, RTF).
    pub page_size: String,
    /// Body font; empty = the format's default (with a Korean-capable fallback when language is "ko").
    pub font_family: String,
    /// Body font size in points.
    pub font_size_pt: f32,
}

impl Default for ExportOptions {
    fn default() -> Self {
        ExportOptions {
            toc: false,
            number_headings: false,
            embed_images: true,
            page_size: "A4".to_string(),
            font_family: String::new(),
            font_size_pt: 11.0,
        }
    }
}

/// Everything a writer needs. See the field comments for what the caller must have done already.
pub struct ExportInput<'a> {
    pub title: String,
    pub author: String,
    /// "ko" | "en" (any BCP-47 tag works; "ko*" turns on Korean fonts / kotex).
    pub language: String,
    /// Free-form date shown in metadata; ISO `YYYY-MM-DD[THH:MM[:SS]]` is recognised for EPUB/DOCX timestamps.
    pub date: String,
    /// The flattened note (embeds transcluded, wiki links converted, comments removed, callouts as GitHub alerts).
    pub markdown: String,
    /// The caller's rendered HTML body (KaTeX math etc.). Used for Html/Epub when non-empty.
    pub html_body: String,
    /// Reading theme CSS for Html/Epub.
    pub css: String,
    /// Image src (as written in the markdown / html) → bytes.
    pub resource: &'a dyn Fn(&str) -> Option<Resource>,
    pub options: ExportOptions,
}

/// A resource callback that never finds anything (handy for tests and text-only exports).
pub fn no_resource(_src: &str) -> Option<Resource> {
    None
}

/// Exports `input` in `format`. Text formats are UTF-8 bytes (no BOM); DOCX/ODT/EPUB are zip packages.
pub fn export(format: ExportFormat, input: &ExportInput) -> Result<Vec<u8>, String> {
    if format == ExportFormat::Markdown {
        return Ok(markdown::write(input).into_bytes());
    }
    if format == ExportFormat::Json {
        return json::write(input).map(String::into_bytes);
    }
    let doc = ir::build(input);
    Ok(match format {
        ExportFormat::Html => html::write_standalone(&doc, input).into_bytes(),
        ExportFormat::HtmlPlain => html::write_plain(&doc, input).into_bytes(),
        ExportFormat::Text => text::write(&doc, input).into_bytes(),
        ExportFormat::Docx => docx::write(&doc, input)?,
        ExportFormat::Odt => odt::write(&doc, input)?,
        ExportFormat::Epub => epub::write(&doc, input)?,
        ExportFormat::Rtf => rtf::write(&doc, input).into_bytes(),
        ExportFormat::Latex => latex::write(&doc, input).into_bytes(),
        ExportFormat::Djot => djot::write(&doc, input).into_bytes(),
        ExportFormat::Rst => rst::write(&doc, input).into_bytes(),
        ExportFormat::AsciiDoc => asciidoc::write(&doc, input).into_bytes(),
        ExportFormat::MediaWiki => mediawiki::write(&doc, input).into_bytes(),
        ExportFormat::Textile => textile::write(&doc, input).into_bytes(),
        ExportFormat::Opml => opml::write(&doc, input).into_bytes(),
        ExportFormat::Org => org::write(&doc, input).into_bytes(),
        ExportFormat::Markdown | ExportFormat::Json => unreachable!(),
    })
}

/// Removes `==highlight==` markers (keeping the text) outside code spans and fenced/indented code,
/// for consumers that have no highlight syntax.
pub fn flatten_highlights(md: &str) -> String {
    let mut out = String::with_capacity(md.len());
    let mut fence: Option<(char, usize)> = None;
    for line in md.split_inclusive('\n') {
        let t = line.trim_start();
        let indent = line.len() - t.len();
        let fc = t.chars().next().unwrap_or(' ');
        if (fc == '`' || fc == '~') && indent < 4 {
            let n = t.chars().take_while(|&c| c == fc).count();
            if n >= 3 {
                match fence {
                    None => {
                        fence = Some((fc, n));
                        out.push_str(line);
                        continue;
                    }
                    Some((c, m)) if c == fc && n >= m && t[n * fc.len_utf8()..].trim().is_empty() => {
                        fence = None;
                        out.push_str(line);
                        continue;
                    }
                    _ => {}
                }
            }
        }
        if fence.is_some() || (indent >= 4 && !t.is_empty() && out.ends_with("\n\n")) {
            out.push_str(line);
            continue;
        }
        out.push_str(&flatten_line(line));
    }
    out
}

fn flatten_line(line: &str) -> String {
    // markers outside backtick code spans, with Obsidian's flanking rules
    let b = line.as_bytes();
    let mut i = 0;
    let mut marks: Vec<(usize, bool, bool)> = Vec::new(); // (pos, can_open, can_close)
    while i < b.len() {
        if b[i] == b'`' {
            let n = b[i..].iter().take_while(|&&c| c == b'`').count();
            let close = "`".repeat(n);
            if let Some(p) = line[i + n..].find(&close) {
                i = i + n + p + n;
                continue;
            }
            i += n;
            continue;
        }
        if b[i] == b'\\' {
            i += 2;
            continue;
        }
        if b[i] == b'=' && i + 1 < b.len() && b[i + 1] == b'=' {
            let before = line[..i].chars().last();
            let after = line[i + 2..].chars().next();
            let can_open = after.is_some_and(|c| !c.is_whitespace() && c != '=');
            let can_close = before.is_some_and(|c| !c.is_whitespace());
            marks.push((i, can_open, can_close));
            i += 2;
            continue;
        }
        i += 1;
    }
    let mut drop: std::collections::HashSet<usize> = std::collections::HashSet::new();
    let mut open: Option<usize> = None;
    for (pos, can_open, can_close) in marks {
        match open {
            Some(o) if can_close && pos > o + 2 => {
                drop.insert(o);
                drop.insert(pos);
                open = None;
            }
            _ if can_open => open = Some(pos),
            _ => {}
        }
    }
    let mut out = String::with_capacity(line.len());
    let mut j = 0;
    while j < line.len() {
        if drop.contains(&j) {
            j += 2;
            continue;
        }
        let ch = line[j..].chars().next().unwrap();
        out.push(ch);
        j += ch.len_utf8();
    }
    out
}
