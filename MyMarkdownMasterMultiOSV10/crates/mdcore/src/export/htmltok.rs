//! A tolerant HTML tokenizer + tree balancer + (X)HTML serializer. Used to post-process HTML bodies
//! (the caller's rendered note or our own) for the standalone HTML and EPUB writers: image embedding,
//! heading ids / numbers / table of contents, chapter splitting and well-formed XHTML for EPUB.
use super::util::html_escape;

#[derive(Debug, Clone, PartialEq)]
pub enum Tok {
    /// Decoded text.
    Text(String),
    Start { name: String, attrs: Vec<(String, Option<String>)>, self_close: bool },
    End(String),
    Comment(String),
    /// Contents of script / style / title / textarea (not decoded).
    Raw { name: String, text: String },
}

pub const VOID: &[&str] =
    &["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

pub fn is_void(name: &str) -> bool {
    VOID.iter().any(|v| v.eq_ignore_ascii_case(name))
}

impl Tok {
    pub fn attr(&self, key: &str) -> Option<&str> {
        match self {
            Tok::Start { attrs, .. } => {
                attrs.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v.as_deref().unwrap_or(""))
            }
            _ => None,
        }
    }
    pub fn set_attr(&mut self, key: &str, val: &str) {
        if let Tok::Start { attrs, .. } = self {
            if let Some(a) = attrs.iter_mut().find(|(k, _)| k.eq_ignore_ascii_case(key)) {
                a.1 = Some(val.to_string());
            } else {
                attrs.push((key.to_string(), Some(val.to_string())));
            }
        }
    }
    pub fn is_start(&self, n: &str) -> bool {
        matches!(self, Tok::Start { name, .. } if name.eq_ignore_ascii_case(n))
    }
    pub fn is_end(&self, n: &str) -> bool {
        matches!(self, Tok::End(name) if name.eq_ignore_ascii_case(n))
    }
    pub fn heading_level(&self) -> Option<u8> {
        if let Tok::Start { name, .. } = self {
            let b = name.as_bytes();
            if b.len() == 2 && (b[0] == b'h' || b[0] == b'H') && (b'1'..=b'6').contains(&b[1]) {
                return Some(b[1] - b'0');
            }
        }
        None
    }
}

const RAW: &[&str] = &["script", "style", "title", "textarea"];

pub fn tokenize(h: &str) -> Vec<Tok> {
    let b = h.as_bytes();
    let mut out = Vec::new();
    let mut text = String::new();
    let mut i = 0;
    let flush = |text: &mut String, out: &mut Vec<Tok>| {
        if !text.is_empty() {
            out.push(Tok::Text(decode_entities(text)));
            text.clear();
        }
    };
    while i < b.len() {
        if b[i] != b'<' {
            let next = h[i..].find('<').map(|p| i + p).unwrap_or(h.len());
            text.push_str(&h[i..next]);
            i = next;
            continue;
        }
        let rest = &h[i..];
        if let Some(body) = rest.strip_prefix("<!--") {
            flush(&mut text, &mut out);
            let end = body.find("-->").unwrap_or(body.len());
            out.push(Tok::Comment(body[..end].to_string()));
            i += (4 + end + 3).min(rest.len());
            continue;
        }
        if rest.starts_with("<![CDATA[") {
            flush(&mut text, &mut out);
            let end = rest.find("]]>").unwrap_or(rest.len());
            out.push(Tok::Text(rest[9..end].to_string()));
            i += (end + 3).min(rest.len());
            continue;
        }
        if rest.starts_with("<!") || rest.starts_with("<?") {
            flush(&mut text, &mut out);
            i += rest.find('>').map(|p| p + 1).unwrap_or(rest.len());
            continue;
        }
        let nb = b.get(i + 1).copied().unwrap_or(0);
        if nb == b'/' && b.get(i + 2).is_some_and(|c| c.is_ascii_alphabetic()) {
            flush(&mut text, &mut out);
            let end = rest.find('>').unwrap_or(rest.len());
            let name: String = rest[2..end].chars().take_while(|c| is_name_char(*c)).collect();
            out.push(Tok::End(name));
            i += (end + 1).min(rest.len());
            continue;
        }
        if !nb.is_ascii_alphabetic() {
            text.push('<');
            i += 1;
            continue;
        }
        flush(&mut text, &mut out);
        // start tag
        let mut j = i + 1;
        while j < b.len() && is_name_char(b[j] as char) {
            j += 1;
        }
        let name = h[i + 1..j].to_string();
        let mut attrs: Vec<(String, Option<String>)> = Vec::new();
        let mut self_close = false;
        loop {
            while j < b.len() && (b[j] as char).is_ascii_whitespace() {
                j += 1;
            }
            if j >= b.len() {
                break;
            }
            if b[j] == b'>' {
                j += 1;
                break;
            }
            if b[j] == b'/' {
                self_close = true;
                j += 1;
                continue;
            }
            let ks = j;
            while j < b.len() && !(b[j] as char).is_ascii_whitespace() && b[j] != b'=' && b[j] != b'>' && b[j] != b'/' {
                j += 1;
            }
            let key = h[ks..j].to_string();
            self_close = false;
            while j < b.len() && (b[j] as char).is_ascii_whitespace() {
                j += 1;
            }
            let mut val = None;
            if j < b.len() && b[j] == b'=' {
                j += 1;
                while j < b.len() && (b[j] as char).is_ascii_whitespace() {
                    j += 1;
                }
                if j < b.len() && (b[j] == b'"' || b[j] == b'\'') {
                    let q = b[j];
                    let vs = j + 1;
                    let ve = h[vs..].find(q as char).map(|p| vs + p).unwrap_or(h.len());
                    val = Some(decode_entities(&h[vs..ve]));
                    j = (ve + 1).min(h.len());
                } else {
                    let vs = j;
                    while j < b.len() && !(b[j] as char).is_ascii_whitespace() && b[j] != b'>' {
                        j += 1;
                    }
                    val = Some(decode_entities(&h[vs..j]));
                }
            }
            if !key.is_empty() {
                attrs.push((key, val));
            } else {
                j += 1;
            }
        }
        i = j;
        let lname = name.to_ascii_lowercase();
        if RAW.contains(&lname.as_str()) && !self_close {
            let close = format!("</{lname}");
            let lower_rest = h[i..].to_ascii_lowercase();
            let end = lower_rest.find(&close).map(|p| i + p).unwrap_or(h.len());
            out.push(Tok::Start { name: name.clone(), attrs, self_close: false });
            out.push(Tok::Raw { name: lname.clone(), text: h[i..end].to_string() });
            out.push(Tok::End(name));
            i = h[end..].find('>').map(|p| end + p + 1).unwrap_or(h.len());
            continue;
        }
        out.push(Tok::Start { name, attrs, self_close });
    }
    flush(&mut text, &mut out);
    out
}

fn is_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-' || c == ':' || c == '_' || c == '.'
}

const BLOCKS: &[&str] = &[
    "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figure", "footer", "form", "h1",
    "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul",
];

/// Makes the token stream well-formed: void elements self-close, stray end tags are dropped, missing end
/// tags are inserted (including the implied `</p>` before a block and `</li>` before a sibling `<li>`).
pub fn balance(toks: Vec<Tok>) -> Vec<Tok> {
    let mut out = Vec::with_capacity(toks.len() + 8);
    let mut stack: Vec<String> = Vec::new();
    for t in toks {
        match t {
            Tok::Start { name, attrs, self_close } => {
                let l = name.to_ascii_lowercase();
                if BLOCKS.contains(&l.as_str()) && stack.last().is_some_and(|s| s.eq_ignore_ascii_case("p")) {
                    out.push(Tok::End(stack.pop().unwrap()));
                }
                if l == "li" || l == "dt" || l == "dd" || l == "tr" || l == "td" || l == "th" {
                    // close an open sibling of the same kind before its container
                    let containers: &[&str] = match l.as_str() {
                        "li" => &["ul", "ol"],
                        "dt" | "dd" => &["dl"],
                        "tr" => &["table", "thead", "tbody", "tfoot"],
                        _ => &["tr"],
                    };
                    let siblings: &[&str] = match l.as_str() {
                        "li" => &["li"],
                        "dt" | "dd" => &["dt", "dd"],
                        "tr" => &["tr"],
                        _ => &["td", "th"],
                    };
                    if let Some(pos) = stack.iter().rposition(|s| siblings.iter().any(|x| s.eq_ignore_ascii_case(x))) {
                        let blocked = stack[pos + 1..].iter().any(|s| containers.iter().any(|c| s.eq_ignore_ascii_case(c)));
                        let cont_after = stack[..pos].iter().rposition(|s| containers.iter().any(|c| s.eq_ignore_ascii_case(c)));
                        if !blocked && cont_after.is_some() {
                            while stack.len() > pos {
                                out.push(Tok::End(stack.pop().unwrap()));
                            }
                        }
                    }
                }
                if is_void(&l) || self_close {
                    out.push(Tok::Start { name, attrs, self_close: true });
                } else {
                    stack.push(name.clone());
                    out.push(Tok::Start { name, attrs, self_close: false });
                }
            }
            Tok::End(name) => {
                if is_void(&name) {
                    continue;
                }
                if let Some(pos) = stack.iter().rposition(|s| s.eq_ignore_ascii_case(&name)) {
                    while stack.len() > pos {
                        out.push(Tok::End(stack.pop().unwrap()));
                    }
                }
            }
            other => out.push(other),
        }
    }
    while let Some(s) = stack.pop() {
        out.push(Tok::End(s));
    }
    out
}

fn valid_xml_name(n: &str) -> bool {
    let mut cs = n.chars();
    match cs.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    n.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == ':') && n.matches(':').count() <= 1
}

/// Serializes tokens. `xhtml`: XML rules (lower-case HTML names, quoted attribute values, CDATA-safe
/// style, scripts dropped, invalid attribute names dropped, comments sanitised).
pub fn serialize(toks: &[Tok], xhtml: bool) -> String {
    let mut o = String::new();
    let mut skip_script = 0usize;
    for t in toks {
        match t {
            Tok::Start { name, attrs, self_close } => {
                if xhtml && name.eq_ignore_ascii_case("script") {
                    skip_script += 1;
                    continue;
                }
                if skip_script > 0 {
                    continue;
                }
                let name = norm_name(name, xhtml);
                o.push('<');
                o.push_str(&name);
                let mut seen: Vec<String> = Vec::new();
                for (k, v) in attrs {
                    if xhtml && (!valid_xml_name(k) || seen.iter().any(|s| s.eq_ignore_ascii_case(k))) {
                        continue;
                    }
                    seen.push(k.clone());
                    let key = if xhtml && !k.contains(':') && !is_foreign_attr(k) { k.to_ascii_lowercase() } else { k.clone() };
                    match v {
                        Some(v) => o.push_str(&format!(" {}=\"{}\"", key, html_escape(v))),
                        None if xhtml => o.push_str(&format!(" {key}=\"{key}\"")),
                        None => o.push_str(&format!(" {key}")),
                    }
                }
                if *self_close {
                    o.push_str(" />");
                } else {
                    o.push('>');
                }
            }
            Tok::End(name) => {
                if xhtml && name.eq_ignore_ascii_case("script") {
                    skip_script = skip_script.saturating_sub(1);
                    continue;
                }
                if skip_script > 0 {
                    continue;
                }
                o.push_str("</");
                o.push_str(&norm_name(name, xhtml));
                o.push('>');
            }
            _ if skip_script > 0 => {}
            Tok::Text(s) => o.push_str(&html_escape(s)),
            Tok::Comment(c) => {
                let c = c.replace("--", "- -");
                let c = c.trim_end_matches('-');
                o.push_str(&format!("<!--{c}-->"));
            }
            Tok::Raw { name, text } => {
                if xhtml {
                    if name == "style" {
                        o.push_str(&format!("/*<![CDATA[*/{}/*]]>*/", text.replace("]]>", "]] >")));
                    } else {
                        o.push_str(&html_escape(&decode_entities(text)));
                    }
                } else {
                    o.push_str(text);
                }
            }
        }
    }
    o
}

fn is_foreign_attr(k: &str) -> bool {
    // SVG / MathML attributes are case-sensitive (viewBox, preserveAspectRatio …)
    k.chars().any(|c| c.is_ascii_uppercase()) && !k.eq_ignore_ascii_case("class") && !k.eq_ignore_ascii_case("id")
        && !k.eq_ignore_ascii_case("src") && !k.eq_ignore_ascii_case("href") && !k.eq_ignore_ascii_case("alt")
        && !k.eq_ignore_ascii_case("style")
}

fn norm_name(n: &str, xhtml: bool) -> String {
    if xhtml && (BLOCKS.iter().any(|b| b.eq_ignore_ascii_case(n)) || HTML_INLINE.iter().any(|b| b.eq_ignore_ascii_case(n))) {
        n.to_ascii_lowercase()
    } else {
        n.to_string()
    }
}

const HTML_INLINE: &[&str] = &[
    "a", "abbr", "b", "br", "cite", "code", "del", "em", "i", "img", "input", "ins", "kbd", "li", "mark", "q", "s", "samp",
    "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "var", "summary",
    "caption", "colgroup", "col", "figcaption", "dt", "dd", "label", "video", "audio", "source", "picture",
];

/// Decodes `&name;`, `&#n;` and `&#xh;` references (a common subset of HTML named entities; unknown names
/// are left as written).
pub fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut o = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(p) = rest.find('&') {
        o.push_str(&rest[..p]);
        rest = &rest[p..];
        let end = rest[1..].find(|c: char| !(c.is_ascii_alphanumeric() || c == '#')).map(|e| e + 1);
        if let Some(e) = end {
            if rest.as_bytes().get(e) == Some(&b';') && e > 1 {
                let name = &rest[1..e];
                let ch = if let Some(num) = name.strip_prefix('#') {
                    let v = if let Some(h) = num.strip_prefix('x').or_else(|| num.strip_prefix('X')) {
                        u32::from_str_radix(h, 16).ok()
                    } else {
                        num.parse::<u32>().ok()
                    };
                    v.and_then(char::from_u32).map(|c| c.to_string())
                } else {
                    named_entity(name).map(|c| c.to_string())
                };
                if let Some(c) = ch {
                    o.push_str(&c);
                    rest = &rest[e + 1..];
                    continue;
                }
            }
        }
        o.push('&');
        rest = &rest[1..];
    }
    o.push_str(rest);
    o
}

fn named_entity(n: &str) -> Option<&'static str> {
    Some(match n {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "nbsp" => "\u{A0}",
        "ensp" => "\u{2002}",
        "emsp" => "\u{2003}",
        "thinsp" => "\u{2009}",
        "zwnj" => "\u{200C}",
        "zwj" => "\u{200D}",
        "shy" => "\u{AD}",
        "copy" => "©",
        "reg" => "®",
        "trade" => "™",
        "hellip" => "…",
        "mdash" => "—",
        "ndash" => "–",
        "lsquo" => "‘",
        "rsquo" => "’",
        "ldquo" => "“",
        "rdquo" => "”",
        "laquo" => "«",
        "raquo" => "»",
        "middot" => "·",
        "bull" => "•",
        "deg" => "°",
        "times" => "×",
        "divide" => "÷",
        "plusmn" => "±",
        "minus" => "−",
        "larr" => "←",
        "rarr" => "→",
        "uarr" => "↑",
        "darr" => "↓",
        "harr" => "↔",
        "lArr" => "⇐",
        "rArr" => "⇒",
        "le" => "≤",
        "ge" => "≥",
        "ne" => "≠",
        "asymp" => "≈",
        "infin" => "∞",
        "sum" => "∑",
        "prod" => "∏",
        "radic" => "√",
        "int" => "∫",
        "part" => "∂",
        "nabla" => "∇",
        "isin" => "∈",
        "forall" => "∀",
        "exist" => "∃",
        "empty" => "∅",
        "cap" => "∩",
        "cup" => "∪",
        "sub" => "⊂",
        "sup" => "⊃",
        "and" => "∧",
        "or" => "∨",
        "euro" => "€",
        "pound" => "£",
        "yen" => "¥",
        "cent" => "¢",
        "sect" => "§",
        "para" => "¶",
        "micro" => "µ",
        "dagger" => "†",
        "Dagger" => "‡",
        "prime" => "′",
        "alpha" => "α",
        "beta" => "β",
        "gamma" => "γ",
        "delta" => "δ",
        "epsilon" => "ε",
        "theta" => "θ",
        "lambda" => "λ",
        "mu" => "μ",
        "pi" => "π",
        "sigma" => "σ",
        "tau" => "τ",
        "phi" => "φ",
        "omega" => "ω",
        "Delta" => "Δ",
        "Sigma" => "Σ",
        "Omega" => "Ω",
        "check" => "✓",
        "hookleftarrow" | "larrhk" => "↩",
        _ => return None,
    })
}
