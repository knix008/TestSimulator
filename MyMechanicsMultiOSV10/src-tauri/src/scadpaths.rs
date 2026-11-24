// Where OpenSCAD looks for libraries named in include <…> / use <…> (after the folder of the file itself):
// the OPENSCADPATH variable, the user's library folder, then the libraries installed with OpenSCAD (MCAD …).
use std::path::{Path, PathBuf};

/// The candidate library folders, in OpenSCAD's order (existing or not).
pub fn candidates(openscadpath: Option<String>, home: Option<PathBuf>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(list) = openscadpath {
        let sep = if cfg!(windows) { ';' } else { ':' };
        out.extend(list.split(sep).filter(|s| !s.trim().is_empty()).map(|s| PathBuf::from(s.trim())));
    }
    if let Some(home) = home {
        if cfg!(windows) || cfg!(target_os = "macos") {
            out.push(home.join("Documents").join("OpenSCAD").join("libraries"));
        } else {
            out.push(home.join(".local").join("share").join("OpenSCAD").join("libraries"));
        }
    }
    if cfg!(windows) {
        for base in ["C:\\Program Files", "C:\\Program Files (x86)"] {
            for name in ["OpenSCAD", "OpenSCAD (Nightly)"] {
                out.push(Path::new(base).join(name).join("libraries"));
            }
        }
    } else if cfg!(target_os = "macos") {
        out.push(PathBuf::from("/Applications/OpenSCAD.app/Contents/Resources/libraries"));
    } else {
        out.push(PathBuf::from("/usr/share/openscad/libraries"));
        out.push(PathBuf::from("/usr/local/share/openscad/libraries"));
    }
    out
}

/// The library folders that exist on this computer.
pub fn library_dirs() -> Vec<String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    candidates(std::env::var("OPENSCADPATH").ok(), home)
        .into_iter()
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openscadpath_comes_first_then_the_user_folder() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let list = candidates(Some(format!("/a{sep} {sep}/b")), Some(PathBuf::from("/home/u")));
        assert_eq!(list[0], PathBuf::from("/a"));
        assert_eq!(list[1], PathBuf::from("/b"));
        assert!(list[2].ends_with("libraries"));
        assert!(list[2].starts_with("/home/u"));
        assert!(list.len() > 3, "the installed libraries follow");
    }

    #[test]
    fn only_existing_folders_are_returned() {
        for d in library_dirs() {
            assert!(Path::new(&d).is_dir(), "{d}");
        }
    }
}
