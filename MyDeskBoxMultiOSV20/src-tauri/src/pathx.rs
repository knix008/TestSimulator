// Node 의 path 모듈과 같은 셈. 경로는 layout.json 에 글로 적히므로 String 으로 다룬다.

use std::path::{Component, Path, PathBuf};

pub const WINDOWS: bool = cfg!(windows);

pub fn s(p: impl AsRef<Path>) -> String {
    p.as_ref().to_string_lossy().into_owned()
}

pub fn join(dir: &str, name: &str) -> String {
    s(Path::new(dir).join(name))
}

pub fn dirname(p: &str) -> String {
    match Path::new(p).parent() {
        Some(parent) if !parent.as_os_str().is_empty() => s(parent),
        Some(_) => ".".into(),
        None => p.to_string(),
    }
}

pub fn basename(p: &str) -> String {
    Path::new(p).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

// path.extname: '.txt'. 점으로 시작하는 이름('.env')은 확장자가 없다.
pub fn extname(p: &str) -> String {
    let base = basename(p);
    match base.rfind('.') {
        Some(0) | None => String::new(),
        Some(at) => base[at..].to_string(),
    }
}

pub fn stem(p: &str) -> String {
    let base = basename(p);
    let ext = extname(&base);
    base[..base.len() - ext.len()].to_string()
}

// path.resolve: 절대 경로로 만들고 . 과 .. 을 걷어 낸다.
pub fn resolve(p: &str) -> String {
    let path = Path::new(p);
    let abs: PathBuf = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    };
    let mut out = PathBuf::new();
    for part in abs.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    let mut text = s(out);
    if WINDOWS {
        text = text.replace('/', "\\");
    }
    text
}

// 같은 파일을 가리키는 두 경로인가. Windows 는 대소문자를 가리지 않는다.
pub fn same(a: &str, b: &str) -> bool {
    let one = resolve(a);
    let two = resolve(b);
    if WINDOWS {
        one.to_lowercase() == two.to_lowercase()
    } else {
        one == two
    }
}

// path.resolve 로 견준 같은 자리. hold.js 는 대소문자를 보는 비교를 쓴다.
pub fn same_exact(a: &str, b: &str) -> bool {
    resolve(a) == resolve(b)
}

// child 가 parent 아래(그 자신은 빼고)에 있는가. path.relative 로 재던 것과 같다.
pub fn inside(parent: &str, child: &str) -> bool {
    let from = resolve(parent);
    let to = resolve(child);
    let (from, to) = if WINDOWS { (from.to_lowercase(), to.to_lowercase()) } else { (from, to) };
    if from == to {
        return false;
    }
    let sep = std::path::MAIN_SEPARATOR;
    let prefix = if from.ends_with(sep) { from } else { format!("{from}{sep}") };
    to.starts_with(&prefix)
}

// child 가 parent 이거나 그 아래인가.
pub fn within(parent: &str, child: &str) -> bool {
    inside(parent, child) || same(parent, child)
}

pub fn exists(p: &str) -> bool {
    !p.is_empty() && Path::new(p).exists()
}

pub fn is_dir(p: &str) -> bool {
    !p.is_empty() && Path::new(p).is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn behaves_like_node_path() {
        assert_eq!(extname("a/b.txt"), ".txt");
        assert_eq!(extname("a/.env"), "");
        assert_eq!(extname("a/noext"), "");
        assert_eq!(stem("a/보고서.docx"), "보고서");
        assert_eq!(basename(&join("a", "b.txt")), "b.txt");
        let base = std::env::temp_dir();
        let root = s(&base);
        assert!(inside(&root, &join(&root, "x")));
        assert!(!inside(&root, &root));
        assert!(within(&root, &root));
        assert!(!inside(&join(&root, "x"), &join(&root, "xy")));
        assert!(same(&join(&root, "a/../b"), &join(&root, "b")));
    }
}
