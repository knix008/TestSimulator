use std::path::{Path, MAIN_SEPARATOR};

/// Inclusion scope for indexing. Legacy excluded directories are still honored.
#[derive(Clone, Debug)]
pub struct InclusionPolicy {
    included_drives: Vec<String>,
    included_directories: Vec<String>,
    excluded_directories: Vec<String>,
    scan_roots: Vec<String>,
    case_insensitive: bool,
}

impl InclusionPolicy {
    pub fn new(
        included_drives: impl IntoIterator<Item = impl AsRef<str>>,
        included_directories: impl IntoIterator<Item = impl AsRef<str>>,
        legacy_excluded: impl IntoIterator<Item = impl AsRef<str>>,
        case_insensitive: bool,
    ) -> Self {
        let mut drives: Vec<String> = included_drives
            .into_iter()
            .filter_map(|drive| normalize_drive_root(drive.as_ref()))
            .collect();
        drives.sort();
        drives.dedup();

        let mut directories: Vec<String> = included_directories
            .into_iter()
            .filter_map(|path| normalize_directory_prefix(path.as_ref()))
            .collect();
        directories.sort_by_key(|prefix| std::cmp::Reverse(prefix.len()));
        directories.dedup();

        let mut excluded: Vec<String> = legacy_excluded
            .into_iter()
            .filter_map(|path| normalize_directory_prefix(path.as_ref()))
            .collect();
        excluded.sort_by_key(|prefix| std::cmp::Reverse(prefix.len()));
        excluded.dedup();

        let mut scan_roots = Vec::new();
        for drive in &drives {
            scan_roots.push(trim_trailing_sep(drive));
        }
        for directory in &directories {
            scan_roots.push(trim_trailing_sep(directory));
        }
        sort_paths(&mut scan_roots, case_insensitive);
        scan_roots.dedup();

        Self {
            included_drives: drives,
            included_directories: directories,
            excluded_directories: excluded,
            scan_roots,
            case_insensitive,
        }
    }

    pub fn from_settings(settings: &crate::model::AppSettings) -> Self {
        Self::new(
            &settings.included_drives,
            &settings.included_directories,
            &settings.excluded_directories,
            cfg!(windows),
        )
    }

    pub fn scan_roots(&self) -> &[String] {
        &self.scan_roots
    }

    pub fn case_insensitive(&self) -> bool {
        self.case_insensitive
    }

    pub fn excluded_prefixes(&self) -> &[String] {
        &self.excluded_directories
    }

    pub fn is_path_in_scope(&self, full_path: &str) -> bool {
        let Some(normalized) = normalize_comparable(full_path) else {
            return false;
        };
        if self.scan_roots.is_empty() {
            return false;
        }
        let included = self
            .scan_roots
            .iter()
            .any(|root| path_is_under(&normalized, root, self.case_insensitive));
        if !included {
            return false;
        }
        !self.excluded_directories.iter().any(|excluded| {
            path_is_under(
                &normalized,
                &trim_trailing_sep(excluded),
                self.case_insensitive,
            )
        })
    }

    pub fn allows_path(&self, path: &Path) -> bool {
        self.is_path_in_scope(&path.to_string_lossy())
    }
}

impl PartialEq for InclusionPolicy {
    fn eq(&self, other: &Self) -> bool {
        same_set(
            &self.included_drives,
            &other.included_drives,
            self.case_insensitive,
        ) && same_set(
            &self.included_directories,
            &other.included_directories,
            self.case_insensitive,
        ) && same_set(
            &self.excluded_directories,
            &other.excluded_directories,
            self.case_insensitive,
        )
    }
}

pub fn normalize_drive_root(drive: &str) -> Option<String> {
    let raw = drive.trim();
    if raw == "/" {
        return Some("/".to_string());
    }
    let trimmed = raw.trim_end_matches(['\\', '/']);
    if trimmed.is_empty() {
        return None;
    }
    let mut chars = trimmed.chars();
    let first = chars.next()?;
    let second = chars.next();
    if first.is_ascii_alphabetic() && second == Some(':') && chars.next().is_none() {
        return Some(format!("{}:\\", first.to_ascii_uppercase()));
    }
    if looks_unix_absolute(trimmed) {
        let mut unix = trimmed.replace('\\', "/");
        if !unix.ends_with('/') {
            unix.push('/');
        }
        return Some(unix);
    }
    None
}

pub fn normalize_directory_prefix(path: &str) -> Option<String> {
    let comparable = normalize_comparable(path)?;
    if comparable.is_empty() {
        return None;
    }
    Some(ensure_trailing_sep(&comparable))
}

pub fn normalize_directory_display(path: &str) -> Option<String> {
    normalize_directory_prefix(path).map(|prefix| trim_trailing_sep(&prefix))
}

pub fn normalize_stored_path(path: &str) -> String {
    normalize_comparable(path).unwrap_or_else(|| path.trim().to_string())
}

fn normalize_comparable(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    if looks_windows_path(trimmed) {
        return Some(normalize_windows(trimmed));
    }
    if looks_unix_absolute(trimmed) {
        return Some(clean_unix(trimmed));
    }
    let joined = std::env::current_dir().ok()?.join(trimmed);
    normalize_comparable(&joined.to_string_lossy())
}

fn looks_windows_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return true;
    }
    path.starts_with("\\\\") || path.starts_with("//")
}

fn looks_unix_absolute(path: &str) -> bool {
    path.starts_with('/') && !looks_windows_path(path)
}

fn normalize_windows(path: &str) -> String {
    let unified = path.replace('/', "\\");
    let mut out = String::new();
    let mut parts = unified
        .split('\\')
        .filter(|part| !part.is_empty() && *part != ".");
    if let Some(root) = parts.next() {
        if root.len() >= 2 && root.as_bytes()[1] == b':' {
            out.push(root.chars().next().unwrap_or('C').to_ascii_uppercase());
            out.push_str(":\\");
        } else {
            out.push_str("\\\\");
            out.push_str(root);
            out.push('\\');
        }
    }
    let mut stack: Vec<&str> = Vec::new();
    for part in parts {
        if part == ".." {
            stack.pop();
        } else {
            stack.push(part);
        }
    }
    for (index, part) in stack.iter().enumerate() {
        if index > 0 {
            out.push('\\');
        }
        out.push_str(part);
    }
    if out.len() == 2 && out.ends_with(':') {
        out.push('\\');
    }
    out
}

fn clean_unix(path: &str) -> String {
    let mut stack = Vec::new();
    for part in path.split(['/', '\\']) {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            stack.pop();
        } else {
            stack.push(part);
        }
    }
    if stack.is_empty() {
        return "/".to_string();
    }
    format!("/{}", stack.join("/"))
}

fn ensure_trailing_sep(path: &str) -> String {
    if path.ends_with('\\') || path.ends_with('/') {
        return path.to_string();
    }
    let sep = if path.contains('\\') || looks_windows_path(path) {
        '\\'
    } else {
        '/'
    };
    format!("{path}{sep}")
}

fn trim_trailing_sep(path: &str) -> String {
    if path == "/" || (path.len() == 3 && path.as_bytes().get(1) == Some(&b':')) {
        return path.to_string();
    }
    path.trim_end_matches(['\\', '/']).to_string()
}

pub fn path_is_under(path: &str, root: &str, case_insensitive: bool) -> bool {
    let path = if case_insensitive {
        path.to_lowercase()
    } else {
        path.to_string()
    };
    let root = if case_insensitive {
        root.to_lowercase()
    } else {
        root.to_string()
    };
    let root_trim = trim_trailing_sep(&root);
    let path_trim = trim_trailing_sep(&path);
    if path_trim == root_trim {
        return true;
    }
    if root_trim == "/" {
        return path.starts_with('/');
    }
    let sep = if root_trim.contains('\\') || looks_windows_path(&root_trim) {
        '\\'
    } else if root_trim.starts_with('/') {
        '/'
    } else {
        MAIN_SEPARATOR
    };
    let prefix = if root_trim.ends_with(['\\', '/']) {
        root_trim
    } else {
        format!("{root_trim}{sep}")
    };
    path.starts_with(&prefix)
}

fn sort_paths(paths: &mut [String], case_insensitive: bool) {
    paths.sort_by(|left, right| {
        if case_insensitive {
            left.to_lowercase().cmp(&right.to_lowercase())
        } else {
            left.cmp(right)
        }
    });
}

fn same_set(left: &[String], right: &[String], case_insensitive: bool) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let key = |value: &String| {
        if case_insensitive {
            value.to_lowercase()
        } else {
            value.clone()
        }
    };
    let mut a: Vec<_> = left.iter().map(key).collect();
    let mut b: Vec<_> = right.iter().map(key).collect();
    a.sort();
    b.sort();
    a == b
}

pub fn should_skip_directory_name(name: &str) -> bool {
    matches!(
        name,
        "$Recycle.Bin"
            | "System Volume Information"
            | "Recovery"
            | ".Trash"
            | ".Trashes"
            | "lost+found"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_drive_and_directory_scope() {
        let policy = InclusionPolicy::new(["d:/", "c:"], [r"D:\work\extra"], [r"C:\Windows"], true);
        assert!(policy.is_path_in_scope(r"C:\Users\report.pdf"));
        assert!(policy.is_path_in_scope(r"c:\users\report.pdf"));
        assert!(!policy.is_path_in_scope(r"C:\Windows\notepad.exe"));
        assert!(!policy.is_path_in_scope(r"E:\other.txt"));
        assert!(policy.is_path_in_scope(r"D:\work\extra\a.txt"));
        assert!(policy
            .scan_roots()
            .iter()
            .any(|root| root.eq_ignore_ascii_case(r"C:\")));
    }

    #[test]
    fn unix_directory_scope_is_case_sensitive() {
        let policy = InclusionPolicy::new(
            Vec::<&str>::new(),
            ["/home", "/mnt/data"],
            ["/mnt/data/secret"],
            false,
        );
        assert!(policy.is_path_in_scope("/home/me/report.pdf"));
        assert!(!policy.is_path_in_scope("/Home/me/report.pdf"));
        assert!(!policy.is_path_in_scope("/etc/passwd"));
        assert!(policy.is_path_in_scope("/mnt/data/notes.txt"));
        assert!(!policy.is_path_in_scope("/mnt/data/secret/key.pem"));
    }

    #[test]
    fn empty_scope_matches_nothing() {
        let policy = InclusionPolicy::new(
            Vec::<String>::new(),
            Vec::<String>::new(),
            Vec::<String>::new(),
            true,
        );
        assert!(!policy.is_path_in_scope(r"C:\a.txt"));
    }
}
