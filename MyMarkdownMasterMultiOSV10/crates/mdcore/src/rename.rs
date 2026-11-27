//! Renaming or moving a note, attachment or folder: every link that pointed at it is rewritten (Obsidian's
//! "Automatically update internal links"), keeping each link's style (wiki / Markdown), subpath, alias and
//! embed mark; Markdown links inside moved notes keep pointing where they did.
use crate::index::{folder_of, is_note, normalize_path, VaultIndex};
use crate::render::encode_path;
use crate::scan::byte_at;
use serde::Serialize;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Edit { pub path: String, pub text: String }

struct Rewrite { source: String, line: usize, col16: usize, raw: String, kind: &'static str, embed: bool, alias: String, subpath: String, target: String }

fn under(path: &str, root: &str) -> bool { path == root || path.starts_with(&format!("{root}/")) }
fn moved(path: &str, from: &str, to: &str) -> String { if path == from { to.to_string() } else if under(path, from) { format!("{to}{}", &path[from.len()..]) } else { path.to_string() } }

/// A relative path from folder `base` to `target` ("../x/y.md").
pub fn relative_path(base: &str, target: &str) -> String {
    let b: Vec<&str> = if base.is_empty() { vec![] } else { base.split('/').collect() };
    let t: Vec<&str> = target.split('/').collect();
    let mut i = 0;
    while i < b.len() && i + 1 < t.len() && b[i] == t[i] { i += 1; }
    let mut parts: Vec<&str> = vec![".."; b.len() - i];
    parts.extend_from_slice(&t[i..]);
    parts.join("/")
}

/// Renames `from` to `to` in the index and returns the notes whose text changed (new texts).
pub fn plan_rename(index: &mut VaultIndex, from: &str, to: &str) -> Vec<Edit> {
    let from = normalize_path(from);
    let to = normalize_path(to);
    index.resolve_all();
    let mut rewrites: Vec<Rewrite> = vec![];
    for (source, meta) in &index.notes {
        let source_moves = under(source, &from);
        for l in &meta.links {
            if l.property.is_some() { continue; }
            let Some(target) = &l.resolved else { continue };
            if l.target.is_empty() { continue; }
            // Links to what moves, and Markdown (relative) links from notes that move.
            if under(target, &from) || (source_moves && l.kind == "md") {
                rewrites.push(Rewrite { source: source.clone(), line: l.line, col16: l.col, raw: l.raw.clone(), kind: l.kind, embed: l.embed, alias: l.alias.clone(), subpath: l.subpath.clone(), target: target.clone() });
            }
        }
    }
    index.rename(&from, &to);
    let mut by_file: std::collections::BTreeMap<String, Vec<Rewrite>> = std::collections::BTreeMap::new();
    for r in rewrites { by_file.entry(moved(&r.source, &from, &to)).or_default().push(r); }
    let mut edits = vec![];
    for (path, mut list) in by_file {
        let Some(text) = index.texts.get(&path).cloned() else { continue };
        let mut lines: Vec<String> = text.split('\n').map(|s| s.to_string()).collect();
        // Right to left inside a line so earlier columns stay valid.
        list.sort_by(|a, b| b.line.cmp(&a.line).then(b.col16.cmp(&a.col16)));
        let mut changed = false;
        for r in list {
            let new_target = moved(&r.target, &from, &to);
            let bang = if r.embed { "!" } else { "" };
            let replacement = if r.kind == "wiki" {
                let text = index.link_text(&new_target, &path);
                let text = if is_note(&new_target) { text } else { text };
                format!("{bang}[[{}{}{}]]", text, r.subpath, if r.alias.is_empty() { String::new() } else { format!("|{}", r.alias) })
            } else {
                format!("{bang}[{}]({}{})", r.alias, encode_path(&relative_path(folder_of(&path), &new_target)).replace("%2F", "/"), r.subpath)
            };
            if replacement == r.raw { continue; }
            let Some(line) = lines.get_mut(r.line) else { continue };
            let chars16: Vec<u16> = line.encode_utf16().collect();
            let at = String::from_utf16_lossy(&chars16[..r.col16.min(chars16.len())]).chars().count();
            let start = byte_at(line, at);
            if line[start..].starts_with(&r.raw) {
                line.replace_range(start..start + r.raw.len(), &replacement);
                changed = true;
            } else if let Some(pos) = line.find(&r.raw) {
                line.replace_range(pos..pos + r.raw.len(), &replacement);
                changed = true;
            }
        }
        if changed {
            let new_text = lines.join("\n");
            index.set_text(&path, &new_text);
            edits.push(Edit { path, text: new_text });
        }
    }
    edits
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rewrites_links() {
        let mut v = VaultIndex::new();
        v.set_text("Home.md", "[[Plan]] and [[Plan#Goals|goals]] and ![[pic.png|100]] and [md](Work/Plan.md) `[[Plan]]`");
        v.set_text("Work/Plan.md", "# Goals\nsee [home](../Home.md)");
        v.set_text("Other/Plan.md", "dup name");
        v.set_file("pic.png", 1, 0.0, 0.0);
        let edits = plan_rename(&mut v, "Work/Plan.md", "Archive/Roadmap.md");
        let home = edits.iter().find(|e| e.path == "Home.md").unwrap();
        assert!(home.text.contains("[[Roadmap]] and [[Roadmap#Goals|goals]]"), "{}", home.text);
        assert!(home.text.contains("[md](Archive/Roadmap.md)"));
        assert!(home.text.contains("`[[Plan]]`"));
        let edits = plan_rename(&mut v, "pic.png", "media/pic 1.png");
        assert!(edits[0].text.contains("![[pic 1.png|100]]"), "{}", edits[0].text);
        let edits = plan_rename(&mut v, "Archive", "Old/Archive");
        let moved_note = edits.iter().find(|e| e.path == "Old/Archive/Roadmap.md").unwrap();
        assert!(moved_note.text.contains("[home](../../Home.md)"), "{}", moved_note.text);
        assert_eq!(relative_path("a/b", "a/c/d.md"), "../c/d.md");
    }
}
