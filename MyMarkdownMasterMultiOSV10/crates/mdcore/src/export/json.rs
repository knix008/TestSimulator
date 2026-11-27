//! JSON: the comrak AST as `{type, attrs?, text?, children?}` objects. The root is `type: "document"` with
//! the note's metadata in `attrs` (title/author/language/date).
use comrak::nodes::{AstNode, ListType, NodeValue, TableAlignment};
use comrak::{parse_document, Arena};
use serde_json::{json, Map, Value};

use super::ExportInput;
use crate::options::markdown_options;

pub fn write(input: &ExportInput) -> Result<String, String> {
    let arena = Arena::new();
    let opts = markdown_options();
    let root = parse_document(&arena, &input.markdown, &opts);
    let doc = super::ir::build_from(root, input);
    let mut v = node(root);
    if let Value::Object(o) = &mut v {
        o.insert(
            "attrs".into(),
            json!({
                "title": doc.meta.title,
                "author": doc.meta.author,
                "language": doc.meta.language,
                "date": doc.meta.date,
            }),
        );
    }
    serde_json::to_string_pretty(&v).map_err(|e| e.to_string())
}

fn node<'a>(n: &'a AstNode<'a>) -> Value {
    let data = n.data.borrow();
    let mut attrs = Map::new();
    let mut text: Option<String> = None;
    let ty: &str = match &data.value {
        NodeValue::Document => "document",
        NodeValue::FrontMatter(s) => {
            text = Some(s.clone());
            "front_matter"
        }
        NodeValue::BlockQuote => "block_quote",
        NodeValue::MultilineBlockQuote(_) => "block_quote",
        NodeValue::List(l) | NodeValue::Item(l) => {
            attrs.insert("ordered".into(), json!(l.list_type == ListType::Ordered));
            if l.list_type == ListType::Ordered {
                attrs.insert("start".into(), json!(l.start));
            } else {
                attrs.insert("bullet".into(), json!((l.bullet_char as char).to_string()));
            }
            attrs.insert("tight".into(), json!(l.tight));
            if matches!(data.value, NodeValue::List(_)) {
                "list"
            } else {
                "item"
            }
        }
        NodeValue::TaskItem(c) => {
            attrs.insert("checked".into(), json!(c.map(|x| x != ' ').unwrap_or(false)));
            "task_item"
        }
        NodeValue::DescriptionList => "description_list",
        NodeValue::DescriptionItem(_) => "description_item",
        NodeValue::DescriptionTerm => "description_term",
        NodeValue::DescriptionDetails => "description_details",
        NodeValue::CodeBlock(c) => {
            attrs.insert("info".into(), json!(c.info));
            attrs.insert("fenced".into(), json!(c.fenced));
            text = Some(c.literal.clone());
            "code_block"
        }
        NodeValue::HtmlBlock(h) => {
            text = Some(h.literal.clone());
            "html_block"
        }
        NodeValue::Paragraph => "paragraph",
        NodeValue::Heading(h) => {
            attrs.insert("level".into(), json!(h.level));
            "heading"
        }
        NodeValue::ThematicBreak => "thematic_break",
        NodeValue::FootnoteDefinition(f) => {
            attrs.insert("name".into(), json!(f.name));
            "footnote_definition"
        }
        NodeValue::Table(t) => {
            let a: Vec<Value> = t
                .alignments
                .iter()
                .map(|a| match a {
                    TableAlignment::Left => json!("left"),
                    TableAlignment::Center => json!("center"),
                    TableAlignment::Right => json!("right"),
                    TableAlignment::None => Value::Null,
                })
                .collect();
            attrs.insert("alignments".into(), Value::Array(a));
            "table"
        }
        NodeValue::TableRow(h) => {
            attrs.insert("header".into(), json!(h));
            "table_row"
        }
        NodeValue::TableCell => "table_cell",
        NodeValue::Text(t) => {
            text = Some(t.clone());
            "text"
        }
        NodeValue::SoftBreak => "softbreak",
        NodeValue::LineBreak => "linebreak",
        NodeValue::Code(c) => {
            text = Some(c.literal.clone());
            "code"
        }
        NodeValue::HtmlInline(h) => {
            text = Some(h.clone());
            "html_inline"
        }
        NodeValue::Raw(h) => {
            text = Some(h.clone());
            "raw"
        }
        NodeValue::Emph => "emph",
        NodeValue::Strong => "strong",
        NodeValue::Strikethrough => "strikethrough",
        NodeValue::Superscript => "superscript",
        NodeValue::Subscript => "subscript",
        NodeValue::Underline => "underline",
        NodeValue::SpoileredText => "spoiler",
        NodeValue::Escaped => "escaped",
        NodeValue::EscapedTag(t) => {
            text = Some(t.clone());
            "escaped_tag"
        }
        NodeValue::Link(l) | NodeValue::Image(l) => {
            attrs.insert("url".into(), json!(l.url));
            if !l.title.is_empty() {
                attrs.insert("title".into(), json!(l.title));
            }
            if matches!(data.value, NodeValue::Link(_)) {
                "link"
            } else {
                "image"
            }
        }
        NodeValue::WikiLink(l) => {
            attrs.insert("url".into(), json!(l.url));
            "wikilink"
        }
        NodeValue::FootnoteReference(r) => {
            attrs.insert("name".into(), json!(r.name));
            attrs.insert("number".into(), json!(r.ix));
            "footnote_reference"
        }
        NodeValue::Math(m) => {
            attrs.insert("display".into(), json!(m.display_math));
            text = Some(m.literal.clone());
            "math"
        }
        NodeValue::Alert(a) => {
            attrs.insert("kind".into(), json!(format!("{:?}", a.alert_type).to_lowercase()));
            if let Some(t) = &a.title {
                attrs.insert("title".into(), json!(t));
            }
            "alert"
        }
        #[allow(unreachable_patterns)]
        _ => "other",
    };
    let mut o = Map::new();
    o.insert("type".into(), json!(ty));
    if !attrs.is_empty() {
        o.insert("attrs".into(), Value::Object(attrs));
    }
    if let Some(t) = text {
        o.insert("text".into(), json!(t));
    }
    drop(data);
    let kids: Vec<Value> = n.children().map(node).collect();
    if !kids.is_empty() {
        o.insert("children".into(), Value::Array(kids));
    }
    Value::Object(o)
}
