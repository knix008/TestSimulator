//! Every font family installed on the system (Windows, macOS and Linux).
use std::collections::BTreeSet;

/// Sorted, de-duplicated family names. Localized names (e.g. "맑은 고딕") are
/// included next to the English ones so either can be found in the list.
pub fn system_families() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    let mut families = BTreeSet::new();
    for face in database.faces() {
        for (name, _) in &face.families {
            let name = name.trim();
            if !name.is_empty() && !name.starts_with('.') {
                families.insert(name.to_string());
            }
        }
    }
    let mut list: Vec<String> = families.into_iter().collect();
    list.sort_by_key(|name| name.to_lowercase());
    list
}

#[cfg(test)]
mod tests {
    #[test]
    fn finds_installed_fonts_sorted_without_duplicates() {
        let families = super::system_families();
        assert!(!families.is_empty(), "the system has fonts");
        let lower: Vec<String> = families.iter().map(|name| name.to_lowercase()).collect();
        let mut sorted = lower.clone();
        sorted.sort();
        assert_eq!(lower, sorted);
        let unique: std::collections::BTreeSet<&String> = families.iter().collect();
        assert_eq!(unique.len(), families.len());
    }
}
