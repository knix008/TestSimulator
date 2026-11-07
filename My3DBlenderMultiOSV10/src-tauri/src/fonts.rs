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

/// The file of an installed family, base64, with which face of it to use.
pub fn read_family(family: &str) -> Result<(String, u32), String> {
    use base64::Engine;
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    let query = fontdb::Query { families: &[fontdb::Family::Name(family)], ..Default::default() };
    let id = database.query(&query).ok_or_else(|| format!("no font named {family}"))?;
    database
        .with_face_data(id, |data, index| (base64::engine::general_purpose::STANDARD.encode(data), index))
        .ok_or_else(|| format!("the file of {family} cannot be read"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_the_file_of_an_installed_family() {
        let families = super::system_families();
        let (data, _) = super::read_family(&families[0]).expect("its file");
        assert!(data.len() > 100);
        assert!(super::read_family("no such family at all").is_err());
    }

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
