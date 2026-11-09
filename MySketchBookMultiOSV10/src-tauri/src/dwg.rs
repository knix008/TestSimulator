//! DWG → DXF with a converter installed on the computer (the app has no DWG reader of its own; the DXF
//! is read by src/io/plan-dxf.js). Tried in order: the program named by MYSKETCHBOOK_DWG_CONVERTER,
//! ODA File Converter (free, opendesign.com), LibreDWG's dwg2dxf. No converter → the error "no-converter",
//! which the UI turns into advice (src/io/plan-dwg.js, src/ui/plan-import.js).

use base64::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize)]
pub struct Converted {
    /// The DXF file, base64.
    pub dxf: String,
    /// Which converter made it.
    pub converter: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Kind {
    Oda,
    Dwg2dxf,
}

/// The converters found on this computer, best first.
pub fn find_converters() -> Vec<(Kind, PathBuf)> {
    let mut out = Vec::new();
    if let Some(path) = std::env::var_os("MYSKETCHBOOK_DWG_CONVERTER").map(PathBuf::from) {
        if path.is_file() {
            out.push((kind_of(&path), path));
        }
    }
    let exe = |name: &str| if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    // ODA File Converter: one folder per version under ODA/ ("ODAFileConverter 25.12.0"); newest first.
    let mut oda_dirs: Vec<PathBuf> = Vec::new();
    for root in ["C:\\Program Files\\ODA", "C:\\Program Files (x86)\\ODA"] {
        if let Ok(entries) = std::fs::read_dir(root) {
            oda_dirs.extend(entries.flatten().map(|e| e.path()).filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("ODAFileConverter")).unwrap_or(false)));
        }
    }
    oda_dirs.sort();
    oda_dirs.reverse();
    let mut candidates: Vec<(Kind, PathBuf)> = oda_dirs.into_iter().map(|d| (Kind::Oda, d.join(exe("ODAFileConverter")))).collect();
    candidates.push((Kind::Oda, PathBuf::from("/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter")));
    candidates.push((Kind::Oda, PathBuf::from("/usr/bin/ODAFileConverter")));
    for dir in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        candidates.push((Kind::Oda, dir.join(exe("ODAFileConverter"))));
        candidates.push((Kind::Dwg2dxf, dir.join(exe("dwg2dxf"))));
    }
    candidates.push((Kind::Dwg2dxf, PathBuf::from("C:\\Program Files\\LibreDWG\\dwg2dxf.exe")));
    candidates.push((Kind::Dwg2dxf, PathBuf::from("/usr/local/bin/dwg2dxf")));
    for (kind, path) in candidates {
        if path.is_file() && !out.iter().any(|(_, p)| p == &path) {
            out.push((kind, path));
        }
    }
    out
}

fn kind_of(path: &Path) -> Kind {
    let name = path.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if name.contains("dwg2dxf") { Kind::Dwg2dxf } else { Kind::Oda }
}

/// Command-line arguments: ODA converts every *.dwg of a folder into another folder; dwg2dxf one file.
pub fn arguments(kind: &Kind, input: &Path, out_dir: &Path) -> Vec<String> {
    match kind {
        Kind::Oda => vec![
            input.parent().unwrap_or(Path::new(".")).to_string_lossy().into_owned(),
            out_dir.to_string_lossy().into_owned(),
            "ACAD2018".into(),
            "DXF".into(),
            "0".into(),
            "1".into(),
            input.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        ],
        Kind::Dwg2dxf => vec!["-y".into(), "-o".into(), out_dir.join("plan.dxf").to_string_lossy().into_owned(), input.to_string_lossy().into_owned()],
    }
}

fn run(kind: &Kind, program: &Path, input: &Path, out_dir: &Path) -> Result<Vec<u8>, String> {
    let mut command = Command::new(program);
    command.args(arguments(kind, input, out_dir));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = command.output().map_err(|e| format!("{}: {e}", program.display()))?;
    let dxf = out_dir.join("plan.dxf");
    if dxf.is_file() {
        return std::fs::read(&dxf).map_err(|e| e.to_string());
    }
    Err(format!("{} made no DXF ({}) {}", program.display(), output.status, String::from_utf8_lossy(&output.stderr).trim()))
}

/// DWG bytes → DXF bytes with the first converter that works.
pub fn convert(dwg: &[u8]) -> Result<Converted, String> {
    let converters = find_converters();
    if converters.is_empty() {
        return Err("no-converter".into());
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let work = std::env::temp_dir().join(format!("mysketchbook-dwg-{}-{stamp}", std::process::id()));
    let (in_dir, out_dir) = (work.join("in"), work.join("out"));
    std::fs::create_dir_all(&in_dir).and_then(|_| std::fs::create_dir_all(&out_dir)).map_err(|e| e.to_string())?;
    let input = in_dir.join("plan.dwg");
    let result = std::fs::write(&input, dwg).map_err(|e| e.to_string()).and_then(|_| {
        let mut errors = Vec::new();
        for (kind, program) in &converters {
            match run(kind, program, &input, &out_dir) {
                Ok(bytes) => {
                    let name = match kind { Kind::Oda => "ODA File Converter", Kind::Dwg2dxf => "LibreDWG dwg2dxf" };
                    return Ok(Converted { dxf: base64::engine::general_purpose::STANDARD.encode(bytes), converter: name.into() });
                }
                Err(error) => errors.push(error),
            }
        }
        Err(errors.join("; "))
    });
    let _ = std::fs::remove_dir_all(&work);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oda_converts_the_folder_and_dwg2dxf_the_file() {
        let input = Path::new("/tmp/w/in/plan.dwg");
        let out = Path::new("/tmp/w/out");
        let oda = arguments(&Kind::Oda, input, out);
        assert_eq!(oda[2..6], ["ACAD2018", "DXF", "0", "1"]);
        assert_eq!(oda[6], "plan.dwg");
        let lib = arguments(&Kind::Dwg2dxf, input, out);
        assert_eq!(lib[0..2], ["-y", "-o"]);
        assert!(lib[2].ends_with("plan.dxf"));
        assert_eq!(kind_of(Path::new("C:/x/dwg2dxf.exe")), Kind::Dwg2dxf);
        assert_eq!(kind_of(Path::new("C:/x/ODAFileConverter.exe")), Kind::Oda);
    }
}
