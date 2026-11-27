//! Markdown: normalised CommonMark/GFM ("Copy as Markdown") via comrak's formatter. Front matter is kept,
//! `==highlight==`, `$math$` and alerts round-trip; numbering prefixes the heading text; the TOC is a
//! nested link list inserted after the front matter.
use std::cell::RefCell;

use comrak::arena_tree::Node;
use comrak::nodes::{Ast, AstNode, LineColumn, NodeValue};
use comrak::{format_commonmark, parse_document, Anchorizer, Arena};

use super::ExportInput;
use crate::options::markdown_options;

pub fn write(input: &ExportInput) -> String {
    let arena = Arena::new();
    let opts = markdown_options();
    let root = parse_document(&arena, &input.markdown, &opts);
    let mut fm = String::new();
    // headings: (level, text, id)
    let mut heads: Vec<(u8, String, String, String)> = Vec::new();
    let mut anchors = Anchorizer::new();
    let tops: Vec<&AstNode> = root.children().collect();
    let base = tops
        .iter()
        .filter_map(|n| if let NodeValue::Heading(h) = &n.data.borrow().value { Some(h.level) } else { None })
        .min()
        .unwrap_or(1);
    let mut counters = [0u32; 7];
    for n in tops {
        let lvl = match &n.data.borrow().value {
            NodeValue::FrontMatter(s) => {
                fm = s.clone();
                None
            }
            NodeValue::Heading(h) => Some(h.level),
            _ => None,
        };
        let Some(level) = lvl else { continue };
        let text = text_of(n).replace("==", "");
        let id = anchors.anchorize(text.clone());
        let mut number = String::new();
        if input.options.number_headings {
            let d = (level - base) as usize;
            counters[d] += 1;
            for x in counters.iter_mut().skip(d + 1) {
                *x = 0;
            }
            number = (0..=d).map(|k| counters[k].to_string()).collect::<Vec<_>>().join(".");
            let t = arena.alloc(Node::new(RefCell::new(Ast::new(
                NodeValue::Text(format!("{number} ")),
                LineColumn { line: 1, column: 1 },
            ))));
            n.prepend(t);
        }
        heads.push((level, text, id, number));
    }
    let mut out = Vec::new();
    if format_commonmark(root, &opts, &mut out).is_err() {
        return input.markdown.clone();
    }
    let mut s = String::from_utf8(out).unwrap_or_else(|_| input.markdown.clone());
    if input.options.toc && !heads.is_empty() {
        let mut toc = String::new();
        let tb = heads.iter().map(|h| h.0).min().unwrap_or(1);
        for (level, text, id, number) in &heads {
            let label = if number.is_empty() { text.clone() } else { format!("{number} {text}") };
            let label = label.replace('[', "\\[").replace(']', "\\]");
            toc.push_str(&format!("{}- [{}](#{})\n", "  ".repeat((level - tb) as usize), label, id));
        }
        toc.push('\n');
        let at = if !fm.is_empty() && s.starts_with(fm.as_str()) { fm.len() } else { 0 };
        s.insert_str(at, &toc);
    }
    s
}

fn text_of<'a>(n: &'a AstNode<'a>) -> String {
    let mut s = String::new();
    for d in n.descendants() {
        match &d.data.borrow().value {
            NodeValue::Text(t) => s.push_str(t),
            NodeValue::Code(c) => s.push_str(&c.literal),
            NodeValue::Math(m) => s.push_str(&m.literal),
            _ => {}
        }
    }
    s
}
