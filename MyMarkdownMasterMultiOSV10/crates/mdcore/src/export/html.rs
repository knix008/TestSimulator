//! HTML: the standalone styled document, the plain body fragment, and the shared IR → HTML body writer and
//! post-processor (heading ids/numbers/TOC, image embedding) used by EPUB too.
use comrak::Anchorizer;

use super::htmltok::{balance, serialize, tokenize, Tok};
use super::ir::{alert_title, Align, Block, Doc, Inline};
use super::util::{data_uri, html_escape, lookup};
use super::ExportInput;

pub struct BodyOpts<'a> {
    /// Emit comrak-compatible classes (markdown-alert, task-list-item, footnotes …) and inline alignment styles.
    pub classes: bool,
    pub lang: &'a str,
}

/// IR → HTML body (XHTML-compatible markup; headings are not numbered here — see `PostProcessor`).
pub fn body(doc: &Doc, o: &BodyOpts) -> String {
    let mut w = W { s: String::new(), o, doc, refs: std::collections::HashMap::new() };
    for b in &doc.blocks {
        w.block(b, false);
    }
    if !doc.footnotes.is_empty() {
        if o.classes {
            w.s.push_str("<section class=\"footnotes\" data-footnotes=\"\">\n<ol>\n");
        } else {
            w.s.push_str("<section>\n<hr />\n<ol>\n");
        }
        for f in &doc.footnotes {
            w.s.push_str(&format!("<li id=\"fn-{}\">\n", f.num));
            let n = f.blocks.len();
            for (i, b) in f.blocks.iter().enumerate() {
                if i + 1 == n {
                    if let Block::Para(c) = b {
                        w.s.push_str("<p>");
                        w.inlines(c);
                        w.s.push_str(&format!(" <a href=\"#fnref-{}\">\u{21A9}</a></p>\n", f.num));
                        continue;
                    }
                }
                w.block(b, false);
                if i + 1 == n {
                    w.s.push_str(&format!("<p><a href=\"#fnref-{}\">\u{21A9}</a></p>\n", f.num));
                }
            }
            w.s.push_str("</li>\n");
        }
        w.s.push_str("</ol>\n</section>\n");
    }
    w.s
}

struct W<'a, 'b> {
    s: String,
    o: &'a BodyOpts<'b>,
    doc: &'a Doc,
    refs: std::collections::HashMap<u32, u32>,
}

fn align_attr(a: Align, classes: bool) -> String {
    let v = match a {
        Align::Left => "left",
        Align::Center => "center",
        Align::Right => "right",
        Align::None => return String::new(),
    };
    if classes {
        format!(" style=\"text-align: {v}\"")
    } else {
        format!(" align=\"{v}\"")
    }
}

impl W<'_, '_> {
    fn block(&mut self, b: &Block, tight: bool) {
        let c = self.o.classes;
        match b {
            Block::Heading { level, id, content, .. } => {
                self.s.push_str(&format!("<h{level} id=\"{}\">", html_escape(id)));
                self.inlines(content);
                self.s.push_str(&format!("</h{level}>\n"));
            }
            Block::Para(v) => {
                if tight {
                    self.inlines(v);
                    self.s.push('\n');
                } else {
                    self.s.push_str("<p>");
                    self.inlines(v);
                    self.s.push_str("</p>\n");
                }
            }
            Block::Code { lang, text } => {
                if c && !lang.is_empty() {
                    self.s.push_str(&format!("<pre lang=\"{0}\"><code class=\"language-{0}\">", html_escape(lang)));
                } else {
                    self.s.push_str("<pre><code>");
                }
                self.s.push_str(&html_escape(text));
                self.s.push_str("</code></pre>\n");
            }
            Block::Math(t) => {
                if c {
                    self.s.push_str(&format!("<div class=\"math math-display\">\\[{}\\]</div>\n", html_escape(t)));
                } else {
                    self.s.push_str(&format!("<p>\\[{}\\]</p>\n", html_escape(t)));
                }
            }
            Block::Quote(v) => {
                self.s.push_str("<blockquote>\n");
                for x in v {
                    self.block(x, false);
                }
                self.s.push_str("</blockquote>\n");
            }
            Block::Alert { kind, title, blocks } => {
                let t = html_escape(&alert_title(*kind, title, self.o.lang));
                if c {
                    self.s.push_str(&format!(
                        "<div class=\"markdown-alert markdown-alert-{}\">\n<p class=\"markdown-alert-title\">{}</p>\n",
                        kind.id(),
                        t
                    ));
                } else {
                    self.s.push_str(&format!("<blockquote>\n<p><strong>{t}</strong></p>\n"));
                }
                for x in blocks {
                    self.block(x, false);
                }
                self.s.push_str(if c { "</div>\n" } else { "</blockquote>\n" });
            }
            Block::List { ordered, start, tight, items } => {
                let task = items.iter().any(|i| i.task.is_some());
                let tag = if *ordered { "ol" } else { "ul" };
                self.s.push('<');
                self.s.push_str(tag);
                if *ordered && *start != 1 {
                    self.s.push_str(&format!(" start=\"{start}\""));
                }
                if task && c {
                    self.s.push_str(" class=\"contains-task-list\"");
                }
                self.s.push_str(">\n");
                for it in items {
                    match it.task {
                        Some(done) => {
                            if c {
                                self.s.push_str("<li class=\"task-list-item\">");
                            } else {
                                self.s.push_str("<li>");
                            }
                            self.s.push_str(&format!(
                                "<input type=\"checkbox\"{} disabled=\"disabled\"{} /> ",
                                if c { " class=\"task-list-item-checkbox\"" } else { "" },
                                if done { " checked=\"checked\"" } else { "" }
                            ));
                        }
                        None => self.s.push_str("<li>"),
                    }
                    for x in &it.blocks {
                        self.block(x, *tight);
                    }
                    self.s.push_str("</li>\n");
                }
                self.s.push_str(&format!("</{tag}>\n"));
            }
            Block::Table { aligns, rows } => {
                self.s.push_str("<table>\n");
                for (ri, r) in rows.iter().enumerate() {
                    if ri == 0 {
                        self.s.push_str("<thead>\n");
                    } else if ri == 1 {
                        self.s.push_str("<tbody>\n");
                    }
                    self.s.push_str("<tr>\n");
                    let tag = if ri == 0 { "th" } else { "td" };
                    for (ci, cell) in r.iter().enumerate() {
                        let a = aligns.get(ci).copied().unwrap_or(Align::None);
                        self.s.push_str(&format!("<{tag}{}>", align_attr(a, c)));
                        self.inlines(cell);
                        self.s.push_str(&format!("</{tag}>\n"));
                    }
                    self.s.push_str("</tr>\n");
                    if ri == 0 {
                        self.s.push_str("</thead>\n");
                    }
                }
                if rows.len() > 1 {
                    self.s.push_str("</tbody>\n");
                }
                self.s.push_str("</table>\n");
            }
            Block::Rule => self.s.push_str("<hr />\n"),
            Block::Html(h) => {
                self.s.push_str(h);
                if !h.ends_with('\n') {
                    self.s.push('\n');
                }
            }
        }
    }

    fn wrap(&mut self, tag: &str, v: &[Inline]) {
        self.s.push_str(&format!("<{tag}>"));
        self.inlines(v);
        self.s.push_str(&format!("</{tag}>"));
    }

    fn inlines(&mut self, v: &[Inline]) {
        for i in v {
            self.inline(i);
        }
    }

    fn inline(&mut self, i: &Inline) {
        let c = self.o.classes;
        match i {
            Inline::Text(t) => self.s.push_str(&html_escape(t)),
            Inline::Emph(v) => self.wrap("em", v),
            Inline::Strong(v) => self.wrap("strong", v),
            Inline::Strike(v) => self.wrap("del", v),
            Inline::Mark(v) => self.wrap("mark", v),
            Inline::Sup(v) => self.wrap("sup", v),
            Inline::Sub(v) => self.wrap("sub", v),
            Inline::Underline(v) => self.wrap("u", v),
            Inline::Code(t) => self.s.push_str(&format!("<code>{}</code>", html_escape(t))),
            Inline::Math { display, tex } => {
                let (o, cl) = if *display { ("\\[", "\\]") } else { ("\\(", "\\)") };
                if c {
                    self.s.push_str(&format!(
                        "<span class=\"math {}\">{}{}{}</span>",
                        if *display { "math-display" } else { "math-inline" },
                        o,
                        html_escape(tex),
                        cl
                    ));
                } else {
                    self.s.push_str(&format!("{}{}{}", o, html_escape(tex), cl));
                }
            }
            Inline::Link { url, title, content } => {
                self.s.push_str(&format!("<a href=\"{}\"", html_escape(url)));
                if !title.is_empty() {
                    self.s.push_str(&format!(" title=\"{}\"", html_escape(title)));
                }
                self.s.push('>');
                self.inlines(content);
                self.s.push_str("</a>");
            }
            Inline::Image { url, title, alt } => {
                self.s.push_str(&format!("<img src=\"{}\" alt=\"{}\"", html_escape(url), html_escape(alt)));
                if !title.is_empty() {
                    self.s.push_str(&format!(" title=\"{}\"", html_escape(title)));
                }
                self.s.push_str(" />");
            }
            Inline::FootRef(n) => {
                let k = self.refs.entry(*n).or_insert(0);
                *k += 1;
                let id = if *k == 1 { format!("fnref-{n}") } else { format!("fnref-{n}-{k}") };
                let exists = self.doc.footnote(*n).is_some();
                if c {
                    self.s.push_str(&format!("<sup class=\"footnote-ref\"><a href=\"#fn-{n}\" id=\"{id}\" data-footnote-ref=\"\">{n}</a></sup>"));
                } else if exists {
                    self.s.push_str(&format!("<sup><a href=\"#fn-{n}\" id=\"{id}\">{n}</a></sup>"));
                } else {
                    self.s.push_str(&format!("<sup>{n}</sup>"));
                }
            }
            Inline::Soft => self.s.push('\n'),
            Inline::Hard => self.s.push_str("<br />\n"),
            Inline::Html(h) => self.s.push_str(h),
        }
    }
}

pub struct Heading {
    pub level: u8,
    pub id: String,
    pub number: String,
    pub text: String,
    pub chapter: usize,
}

/// Rewrites a (balanced) token stream: ensures heading ids, numbers headings, records them for a TOC and
/// rewrites `<img src>` through `img`. Keeps state across calls so EPUB chapters number continuously.
pub struct PostProcessor<'f> {
    pub number: bool,
    pub number_class: bool,
    pub headings: Vec<Heading>,
    anchors: Anchorizer,
    base: u8,
    counters: [u32; 7],
    pub img: &'f mut dyn FnMut(&str) -> Option<String>,
}

const NO_NUMBER_IN: &[&str] = &["blockquote", "aside", "li", "details", "td", "th", "nav", "figure"];

impl<'f> PostProcessor<'f> {
    pub fn new(number: bool, number_class: bool, base: u8, img: &'f mut dyn FnMut(&str) -> Option<String>) -> Self {
        PostProcessor { number, number_class, headings: Vec::new(), anchors: Anchorizer::new(), base, counters: [0; 7], img }
    }

    /// The smallest heading level present (for numbering) in a token stream.
    pub fn min_level(toks: &[Tok]) -> u8 {
        toks.iter().filter_map(|t| t.heading_level()).min().unwrap_or(1)
    }

    pub fn run(&mut self, toks: Vec<Tok>, chapter: usize) -> Vec<Tok> {
        let mut out = Vec::with_capacity(toks.len());
        let mut stack: Vec<String> = Vec::new();
        let mut i = 0;
        while i < toks.len() {
            let t = &toks[i];
            if let Some(level) = t.heading_level() {
                // gather the heading's inner tokens
                let name = if let Tok::Start { name, .. } = t { name.clone() } else { unreachable!() };
                let mut depth = 0;
                let mut j = i + 1;
                while j < toks.len() {
                    match &toks[j] {
                        Tok::Start { name: n, self_close: false, .. } if n.eq_ignore_ascii_case(&name) => depth += 1,
                        Tok::End(n) if n.eq_ignore_ascii_case(&name) => {
                            if depth == 0 {
                                break;
                            }
                            depth -= 1;
                        }
                        _ => {}
                    }
                    j += 1;
                }
                let mut inner: Vec<Tok> = toks[i + 1..j.min(toks.len())].to_vec();
                let text = heading_text(&inner);
                let mut start = t.clone();
                let inner_id = inner.iter().find_map(|x| x.attr("id").map(|s| s.to_string())).filter(|s| !s.is_empty());
                let id = if let Some(id) = start.attr("id").filter(|s| !s.is_empty()) {
                    id.to_string()
                } else if let Some(id) = inner_id {
                    id
                } else {
                    let id = self.anchors.anchorize(text.clone());
                    let id = if id.is_empty() { format!("section-{}", self.headings.len() + 1) } else { id };
                    start.set_attr("id", &id);
                    id
                };
                let numbered = self.number && !stack.iter().any(|s| NO_NUMBER_IN.iter().any(|x| s.eq_ignore_ascii_case(x)));
                let mut number = String::new();
                if numbered && level >= self.base {
                    let d = (level - self.base) as usize;
                    self.counters[d] += 1;
                    for x in self.counters.iter_mut().skip(d + 1) {
                        *x = 0;
                    }
                    number = (0..=d).map(|k| self.counters[k].to_string()).collect::<Vec<_>>().join(".");
                    let mut num_toks = Vec::new();
                    if self.number_class {
                        num_toks.push(Tok::Start {
                            name: "span".into(),
                            attrs: vec![("class".into(), Some("heading-number".into()))],
                            self_close: false,
                        });
                        num_toks.push(Tok::Text(format!("{number} ")));
                        num_toks.push(Tok::End("span".into()));
                    } else {
                        num_toks.push(Tok::Text(format!("{number} ")));
                    }
                    // after a leading empty anchor (comrak's header-id anchor) if present
                    let pos = leading_anchor_end(&inner);
                    for (k, nt) in num_toks.into_iter().enumerate() {
                        inner.insert(pos + k, nt);
                    }
                }
                self.headings.push(Heading { level, id, number, text, chapter });
                out.push(start);
                for mut x in inner {
                    self.fix_img(&mut x);
                    out.push(x);
                }
                if j < toks.len() {
                    out.push(toks[j].clone());
                }
                i = j + 1;
                continue;
            }
            let mut t = t.clone();
            match &t {
                Tok::Start { name, self_close: false, .. } => stack.push(name.clone()),
                Tok::End(_) => {
                    stack.pop();
                }
                _ => {}
            }
            self.fix_img(&mut t);
            out.push(t);
            i += 1;
        }
        out
    }

    fn fix_img(&mut self, t: &mut Tok) {
        if t.is_start("img") {
            if let Some(src) = t.attr("src").map(|s| s.to_string()) {
                if let Some(n) = (self.img)(&src) {
                    t.set_attr("src", &n);
                }
            }
        }
    }
}

fn leading_anchor_end(inner: &[Tok]) -> usize {
    if inner.len() >= 2 && inner[0].is_start("a") && inner[1].is_end("a") {
        2
    } else {
        0
    }
}

/// Visible text of heading tokens (skips aria-hidden subtrees and MathML except its TeX annotation).
pub fn heading_text(inner: &[Tok]) -> String {
    let mut s = String::new();
    let mut hidden = 0i32;
    // effect each open element had on `hidden` (+1 hides, -1 reveals, 0 none)
    let mut stack: Vec<i32> = Vec::new();
    for t in inner {
        match t {
            Tok::Start { name, self_close, .. } => {
                if *self_close {
                    continue;
                }
                let hide = t.attr("aria-hidden") == Some("true")
                    || name.eq_ignore_ascii_case("math")
                    || t.attr("class").is_some_and(|c| c.split_whitespace().any(|x| x == "heading-number"));
                let eff = if name.eq_ignore_ascii_case("annotation") && hidden > 0 {
                    -1
                } else if hide {
                    1
                } else {
                    0
                };
                hidden += eff;
                stack.push(eff);
            }
            Tok::End(_) => {
                if let Some(eff) = stack.pop() {
                    hidden -= eff;
                }
            }
            Tok::Text(x) if hidden <= 0 => s.push_str(x),
            _ => {}
        }
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The HTML body to post-process: the caller's rendering when given, else ours.
pub fn source_body(doc: &Doc, input: &ExportInput, classes: bool) -> String {
    if input.html_body.trim().is_empty() {
        body(doc, &BodyOpts { classes, lang: &doc.meta.language })
    } else {
        input.html_body.clone()
    }
}

pub fn toc_html(hs: &[Heading], href: &dyn Fn(&Heading) -> String, title: &str, class: bool) -> String {
    if hs.is_empty() {
        return String::new();
    }
    let base = hs.iter().map(|h| h.level).min().unwrap_or(1);
    let mut s = String::new();
    s.push_str(if class { "<nav class=\"toc\" id=\"toc\">\n" } else { "<nav id=\"toc\">\n" });
    s.push_str(&format!("<p><strong>{}</strong></p>\n", html_escape(title)));
    nest_list(hs, base, href, &mut s);
    s.push_str("</nav>\n");
    s
}

/// Nested `<ol>` (well-formed, levels may skip) of heading links.
pub fn nest_list(hs: &[Heading], base: u8, href: &dyn Fn(&Heading) -> String, s: &mut String) {
    let mut depth = 0usize; // number of open <ol>
    let mut open_li = Vec::<bool>::new();
    for h in hs {
        // never skip a level (EPUB nav needs every <li> to start with a link)
        let d = ((h.level.saturating_sub(base)) as usize + 1).min(depth + 1);
        if depth == 0 {
            s.push_str("<ol>\n");
            depth = 1;
            open_li.push(false);
        }
        while depth < d {
            if !open_li[depth - 1] {
                s.push_str("<li>");
                open_li[depth - 1] = true;
            }
            s.push_str("<ol>\n");
            depth += 1;
            open_li.push(false);
        }
        while depth > d {
            if open_li[depth - 1] {
                s.push_str("</li>\n");
            }
            s.push_str("</ol>\n");
            open_li.pop();
            depth -= 1;
            // the parent li stays open
        }
        if open_li[depth - 1] {
            s.push_str("</li>\n");
        }
        let label = if h.number.is_empty() { h.text.clone() } else { format!("{} {}", h.number, h.text) };
        s.push_str(&format!("<li><a href=\"{}\">{}</a>", html_escape(&href(h)), html_escape(&label)));
        open_li[depth - 1] = true;
    }
    while depth > 0 {
        if open_li[depth - 1] {
            s.push_str("</li>\n");
        }
        s.push_str("</ol>\n");
        open_li.pop();
        depth -= 1;
    }
}

pub fn toc_title(lang: &str) -> &'static str {
    if super::util::is_korean(lang) {
        "목차"
    } else {
        "Contents"
    }
}

pub const BASE_CSS: &str = "body{margin:0 auto;max-width:860px;padding:24px;line-height:1.6}\
img{max-width:100%}img.md-img-center{display:block;margin:.4em auto .8em}\
img.md-img-left{float:left;margin:.25em 1.2em .6em 0}img.md-img-right{float:right;margin:.25em 0 .6em 1.2em}\
h1,h2,h3,h4,h5,h6,hr,pre,table{clear:both}table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:4px 10px}\
pre{overflow:auto;padding:10px;background:rgba(127,127,127,.1)}mark{background:#fff3a3;color:inherit}\
blockquote{margin-left:0;padding-left:1em;border-left:4px solid #d0d7de;color:inherit}\
.markdown-alert{padding:.5em 1em;margin:1em 0;border-left:4px solid #0969da}\
.markdown-alert-title{font-weight:600}.markdown-alert-tip{border-color:#1a7f37}\
.markdown-alert-important{border-color:#8250df}.markdown-alert-warning{border-color:#9a6700}\
.markdown-alert-caution{border-color:#cf222e}.task-list-item{list-style:none}\
.task-list-item-checkbox{margin:0 .4em 0 -1.4em}nav.toc{margin:1em 0 2em}nav.toc ol{list-style:none;padding-left:1.2em}\
.heading-number{margin-right:.15em}.footnotes{font-size:.9em}\n";

/// The styled, self-contained document.
pub fn write_standalone(doc: &Doc, input: &ExportInput) -> String {
    let src = source_body(doc, input, true);
    let toks = balance(tokenize(&src));
    let embed = input.options.embed_images;
    let mut img = |s: &str| -> Option<String> { if embed { lookup(input, s).map(|r| data_uri(&r)) } else { None } };
    let base = PostProcessor::min_level(&toks);
    let mut pp = PostProcessor::new(input.options.number_headings, true, base, &mut img);
    let toks = pp.run(toks, 0);
    let body = serialize(&toks, false);
    let headings = std::mem::take(&mut pp.headings);
    let m = &doc.meta;
    let mut s = String::new();
    s.push_str("<!DOCTYPE html>\n");
    s.push_str(&format!("<html lang=\"{}\">\n<head>\n<meta charset=\"utf-8\" />\n", html_escape(&m.language)));
    s.push_str("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n");
    s.push_str(&format!("<title>{}</title>\n", html_escape(&m.title)));
    if !m.author.is_empty() {
        s.push_str(&format!("<meta name=\"author\" content=\"{}\" />\n", html_escape(&m.author)));
    }
    if !m.date.is_empty() {
        s.push_str(&format!("<meta name=\"date\" content=\"{}\" />\n", html_escape(&m.date)));
    }
    s.push_str("<meta name=\"generator\" content=\"MyMarkdownMaster\" />\n<style>\n");
    s.push_str(BASE_CSS);
    let mut font = String::new();
    if !input.options.font_family.trim().is_empty() {
        font.push_str(&format!("font-family:{};", css_font(&input.options.font_family)));
    }
    if input.options.font_size_pt > 0.0 && (input.options.font_size_pt - 11.0).abs() > 0.01 {
        font.push_str(&format!("font-size:{}pt;", input.options.font_size_pt));
    }
    if !font.is_empty() {
        s.push_str(&format!("body{{{font}}}\n"));
    }
    s.push_str(&input.css.replace("</style", "<\\/style"));
    s.push_str("\n</style>\n</head>\n<body>\n<article class=\"markdown-body\">\n");
    if input.options.toc {
        s.push_str(&toc_html(&headings, &|h| format!("#{}", h.id), toc_title(&m.language), true));
    }
    s.push_str(&body);
    s.push_str("</article>\n</body>\n</html>\n");
    s
}

pub fn css_font(f: &str) -> String {
    f.split(',')
        .map(|p| {
            let p = p.trim().trim_matches(|c| c == '"' || c == '\'');
            let generic = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"];
            if generic.contains(&p) {
                p.to_string()
            } else {
                format!("\"{}\"", p.replace('"', ""))
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Body markup only, without classes or styles (always our own rendering, so math stays as `\( \)` TeX).
pub fn write_plain(doc: &Doc, input: &ExportInput) -> String {
    let src = body(doc, &BodyOpts { classes: false, lang: &doc.meta.language });
    let toks = balance(tokenize(&src));
    let embed = input.options.embed_images;
    let mut img = |s: &str| -> Option<String> { if embed { lookup(input, s).map(|r| data_uri(&r)) } else { None } };
    let base = PostProcessor::min_level(&toks);
    let mut pp = PostProcessor::new(input.options.number_headings, false, base, &mut img);
    let mut toks = pp.run(toks, 0);
    // raw HTML in the note may carry presentation: drop it too
    for t in toks.iter_mut() {
        if let Tok::Start { attrs, .. } = t {
            attrs.retain(|(k, _)| !k.eq_ignore_ascii_case("class") && !k.eq_ignore_ascii_case("style"));
        }
        if let Tok::Raw { name, text } = t {
            if name == "style" {
                text.clear();
            }
        }
    }
    let mut s = String::new();
    if input.options.toc {
        s.push_str(&toc_html(&pp.headings, &|h| format!("#{}", h.id), toc_title(&doc.meta.language), false));
    }
    s.push_str(&serialize(&toks, false));
    s
}
