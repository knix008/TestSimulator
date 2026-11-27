//! The comrak options shared by the renderer (render.rs) and every exporter (export/*): one Markdown dialect
//! everywhere — CommonMark + GFM (tables, task lists, strikethrough, autolinks, footnotes, alerts), $math$,
//! front matter, ~sub~ / ^sup^ off (Obsidian uses ~~ for strikethrough only).
use comrak::Options;

pub fn markdown_options<'a>() -> Options<'a> {
    let mut o = Options::default();
    o.extension.strikethrough = true;
    o.extension.table = true;
    o.extension.autolink = true;
    o.extension.tasklist = true;
    o.extension.footnotes = true;
    o.extension.alerts = true;
    o.extension.math_dollars = true;
    o.extension.math_code = true;
    o.extension.front_matter_delimiter = Some("---".to_string());
    o.extension.header_ids = Some(String::new());
    o.parse.relaxed_tasklist_matching = true;
    o.parse.relaxed_autolinks = true;
    o.render.unsafe_ = true;
    o.render.github_pre_lang = true;
    o.render.full_info_string = true;
    o.render.tasklist_classes = true;
    o
}
