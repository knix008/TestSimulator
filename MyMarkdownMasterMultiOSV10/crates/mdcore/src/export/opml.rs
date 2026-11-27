//! OPML 2.0: headings become nested outlines; the text under each heading (rendered as plain text, lists
//! and tables included) goes into its `_note`. Content before the first heading hangs off an outline
//! named after the note title.
use super::ir::{heading_prefix, plain, Block, Doc};
use super::text::blocks as text_blocks;
use super::util::{parse_date, xml_escape};
use super::ExportInput;

struct Node {
    level: u8,
    text: String,
    note: Vec<Block>,
    kids: Vec<Node>,
}

pub fn write(doc: &Doc, _input: &ExportInput) -> String {
    let lang = &doc.meta.language;
    let mut root = Node { level: 0, text: String::new(), note: Vec::new(), kids: Vec::new() };
    let mut pre: Vec<Block> = Vec::new();
    // build the tree with a path of indices into nested kids
    let mut path: Vec<usize> = Vec::new();
    for b in &doc.blocks {
        if let Block::Heading { level, number, content, .. } = b {
            // pop to the parent level
            loop {
                let cur_level = node_at(&root, &path).level;
                if path.is_empty() || cur_level < *level {
                    break;
                }
                path.pop();
            }
            let parent = node_at_mut(&mut root, &path);
            parent.kids.push(Node { level: *level, text: format!("{}{}", heading_prefix(number), plain(content)), note: Vec::new(), kids: Vec::new() });
            let idx = parent.kids.len() - 1;
            path.push(idx);
        } else if path.is_empty() {
            pre.push(b.clone());
        } else {
            node_at_mut(&mut root, &path).note.push(b.clone());
        }
    }
    if !pre.is_empty() {
        let intro = Node { level: 1, text: doc.meta.title.clone(), note: pre, kids: Vec::new() };
        root.kids.insert(0, intro);
    }
    if !doc.footnotes.is_empty() {
        let mut fnode = Node { level: 1, text: if super::util::is_korean(lang) { "각주".into() } else { "Notes".into() }, note: Vec::new(), kids: Vec::new() };
        for f in &doc.footnotes {
            fnode.kids.push(Node { level: 2, text: format!("[{}] {}", f.num, super::ir::plain_blocks(&f.blocks).replace('\n', " ")), note: Vec::new(), kids: Vec::new() });
        }
        root.kids.push(fnode);
    }
    let m = &doc.meta;
    let mut s = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\">\n<head>\n");
    s.push_str(&format!("<title>{}</title>\n", xml_escape(&m.title)));
    if !m.author.is_empty() {
        s.push_str(&format!("<ownerName>{}</ownerName>\n", xml_escape(&m.author)));
    }
    if let Some((y, mo, d, hh, mm, ss)) = parse_date(&m.date) {
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        s.push_str(&format!("<dateCreated>{d:02} {} {y} {hh:02}:{mm:02}:{ss:02} GMT</dateCreated>\n", months[(mo - 1) as usize]));
    }
    s.push_str("</head>\n<body>\n");
    for k in &root.kids {
        outline(k, lang, 1, &mut s);
    }
    if root.kids.is_empty() {
        s.push_str(&format!("<outline text=\"{}\"/>\n", attr(&m.title)));
    }
    s.push_str("</body>\n</opml>\n");
    s
}

fn node_at<'a>(root: &'a Node, path: &[usize]) -> &'a Node {
    let mut n = root;
    for &i in path {
        n = &n.kids[i];
    }
    n
}

fn node_at_mut<'a>(root: &'a mut Node, path: &[usize]) -> &'a mut Node {
    let mut n = root;
    for &i in path {
        n = &mut n.kids[i];
    }
    n
}

/// Attribute escaping that keeps line breaks (`&#10;`) instead of letting XML normalise them to spaces.
fn attr(s: &str) -> String {
    xml_escape(s).replace('\n', "&#10;").replace('\t', "&#9;").replace('\r', "")
}

fn outline(n: &Node, lang: &str, depth: usize, s: &mut String) {
    let pad = "  ".repeat(depth);
    s.push_str(&format!("{pad}<outline text=\"{}\"", attr(&n.text)));
    let note = text_blocks(&n.note, lang);
    if !note.trim().is_empty() {
        s.push_str(&format!(" _note=\"{}\"", attr(note.trim())));
    }
    if n.kids.is_empty() {
        s.push_str("/>\n");
    } else {
        s.push_str(">\n");
        for k in &n.kids {
            outline(k, lang, depth + 1, s);
        }
        s.push_str(&format!("{pad}</outline>\n"));
    }
}
