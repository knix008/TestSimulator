//! xorriso: creating ISOs (plain and bootable) and full extraction. Finding it: the copy the
//! program installed (Settings › Packages), MSYS2 / Cygwin, Homebrew / the system, PATH.

use crate::packages::{app_tool_path, with_tool_path};
use crate::util::*;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Command;

fn exe_name() -> &'static str {
    if cfg!(windows) {
        "xorriso.exe"
    } else {
        "xorriso"
    }
}

pub fn resolve() -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(p) = app_tool_path("xorriso") {
        candidates.push(p);
    }
    if cfg!(windows) {
        let mut roots: Vec<PathBuf> = ["MSYS2_ROOT", "CYGWIN_ROOT"].iter().filter_map(|v| std::env::var_os(v).filter(|v| !v.is_empty()).map(PathBuf::from)).collect();
        roots.extend([r"C:\msys64", r"C:\msys32", r"C:\cygwin64", r"C:\cygwin"].map(PathBuf::from));
        for r in roots {
            candidates.push(r.join("usr").join("bin").join("xorriso.exe"));
            candidates.push(r.join("bin").join("xorriso.exe"));
            candidates.push(r.join("mingw64").join("bin").join("xorriso.exe"));
        }
    }
    if !cfg!(windows) {
        for d in ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/usr/sbin", "/bin", "/sbin"] {
            candidates.push(Path::new(d).join("xorriso"));
        }
    }
    candidates.into_iter().find(|c| c.is_file()).or_else(|| which(exe_name())).unwrap_or_else(|| PathBuf::from(exe_name()))
}

/// MSYS2 / Cygwin builds want POSIX paths (/c/Users/…).
fn uses_posix_paths(binary: &Path) -> bool {
    if !cfg!(windows) || !binary.is_absolute() {
        return false;
    }
    let n = binary.to_string_lossy().replace('\\', "/").to_lowercase();
    if n.contains("/msys") || n.contains("/cygwin") || n.contains("/usr/bin/") {
        return true;
    }
    binary.parent().is_some_and(|d| d.join("msys-2.0.dll").is_file() || d.join("cygwin1.dll").is_file())
}

/// C:\Users\… → /c/Users/…
pub fn to_posix(p: &str) -> String {
    let p = p.strip_prefix(r"\\?\").unwrap_or(p);
    let b = p.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        let rest = p[2..].trim_start_matches(['\\', '/']).replace('\\', "/");
        let drive = (b[0] as char).to_ascii_lowercase();
        return if rest.is_empty() { format!("/{drive}") } else { format!("/{drive}/{rest}") };
    }
    p.replace('\\', "/")
}

fn is_windows_path(a: &str) -> bool {
    let b = a.as_bytes();
    a.starts_with(r"\\?\") || (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/'))
}

fn absolute(p: &str) -> PathBuf {
    let path = Path::new(p);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().map(|d| d.join(path)).unwrap_or_else(|_| path.to_path_buf())
    }
}

fn parse_percent(text: &str) -> Option<f64> {
    crate::packages::percent_in(text)
}

/// Runs xorriso; progress lines go to `progress` ("running", percent, text).
fn run_xorriso(args: &[String], progress: Option<Progress>, cancel: &Cancel) -> Res<Output> {
    let binary = resolve();
    cancel.check()?;
    let posix = uses_posix_paths(&binary);
    let args: Vec<String> = args.iter().map(|a| if posix && is_windows_path(a) { to_posix(a) } else { a.clone() }).collect();
    let mut cmd = Command::new(&binary);
    cmd.args(&args);
    with_tool_path(&mut cmd, &binary);
    let on = |is_err: bool, text: &str| {
        if let Some(p) = progress {
            let t = text.trim();
            if !t.is_empty() {
                p("running", if is_err { parse_percent(t) } else { None }, t);
            }
        }
    };
    run(&mut cmd, Some(cancel), None, &on).map_err(|e| {
        if e == CANCELED {
            e
        } else {
            format!("Failed to start xorriso ({}): {e}. Install xorriso in Settings › Packages.", binary.display())
        }
    })
}

fn failed(action: &str, o: &Output) -> String {
    let detail = if o.stderr.trim().is_empty() { &o.stdout } else { &o.stderr };
    let t = detail.trim();
    let tail: String = t.chars().rev().take(2000).collect::<Vec<_>>().into_iter().rev().collect();
    format!("xorriso {action} failed:\n{}", if tail.is_empty() { "Unknown error".into() } else { tail })
}

fn hint() -> &'static str {
    if cfg!(windows) {
        "MSYS2: pacman -S xorriso  (또는 설정 › 패키지에서 설치)"
    } else if cfg!(target_os = "macos") {
        "Install with: brew install xorriso"
    } else {
        "Install with: sudo apt install xorriso"
    }
}

pub fn engine_info() -> Value {
    let binary = resolve();
    match run_xorriso(&["-version".into()], None, &Cancel::none()) {
        Ok(o) => {
            let combined = format!("{}\n{}", o.stdout, o.stderr);
            let available = o.code == 0 || combined.to_lowercase().contains("xorriso");
            let version = {
                let l = combined.to_lowercase();
                l.find("xorriso version")
                    .map(|i| &combined[i + "xorriso version".len()..])
                    .or_else(|| l.find("gnu xorriso").map(|i| &combined[i + "gnu xorriso".len()..]))
                    .map(|rest| rest.trim_start().chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect::<String>())
                    .filter(|v| !v.is_empty())
                    .or_else(|| crate::packages::after_word(&combined, "xorriso", true))
            };
            json!({
                "available": available,
                "binaryPath": binary.to_string_lossy(),
                "version": version.or_else(|| available.then(|| "unknown".to_string())),
                "platform": platform(),
                "hint": if available { "xorriso ready" } else { hint() },
            })
        }
        Err(_) => json!({
            "available": false,
            "binaryPath": if binary.is_absolute() { Value::String(binary.to_string_lossy().to_string()) } else { Value::Null },
            "version": null,
            "platform": platform(),
            "hint": hint(),
        }),
    }
}

fn label_of(v: Option<&str>, fallback: &str) -> String {
    let raw = v.filter(|s| !s.is_empty()).unwrap_or(fallback);
    let s: String = raw.chars().map(|c| if c.is_ascii_alphanumeric() || "_.-".contains(c) { c } else { '_' }).take(32).collect();
    if s.is_empty() {
        "ISOMAKER".into()
    } else {
        s
    }
}

fn str_opt<'a>(o: &'a Value, k: &str) -> Option<&'a str> {
    o.get(k).and_then(Value::as_str).filter(|s| !s.is_empty())
}

fn need_dir(p: &Path, label: &str) -> Res<()> {
    if p.is_dir() {
        Ok(())
    } else {
        err(format!("{label} not found: {}", p.display()))
    }
}
fn need_file(p: &Path, label: &str) -> Res<()> {
    if p.is_file() {
        Ok(())
    } else {
        err(format!("{label} not found: {}", p.display()))
    }
}

/// { isoPath, outputDir }
pub fn extract(opts: &Value, progress: Progress, cancel: &Cancel) -> Res<()> {
    let iso = absolute(str_opt(opts, "isoPath").unwrap_or_default());
    let out = absolute(str_opt(opts, "outputDir").unwrap_or_default());
    need_file(&iso, "ISO file")?;
    std::fs::create_dir_all(&out).at(&out)?;
    progress("extract", Some(0.0), "Extracting ISO…");
    let mut args: Vec<String> = Vec::new();
    if cfg!(windows) {
        // Rock Ridge links (Ubuntu's /ubuntu -> .) often cannot be made on Windows: go on with
        // the rest and fail only on FATAL errors.
        args.extend(["-abort_on", "NEVER", "-return_with", "FATAL", "32", "-error_behavior", "file_extraction", "best_effort", "-hardlinks", "discard_extract"].map(String::from));
    }
    args.extend(["-osirrox".into(), "on".into(), "-indev".into(), iso.to_string_lossy().to_string(), "-extract".into(), "/".into(), out.to_string_lossy().to_string()]);
    let o = run_xorriso(&args, Some(progress), cancel)?;
    if o.code != 0 {
        return err(failed("extract", &o));
    }
    let log = if o.stderr.is_empty() { &o.stdout } else { &o.stderr };
    let skipped = log.to_lowercase().matches("cannot restore symbolic link").count();
    progress(
        "extract",
        Some(100.0),
        &if skipped > 0 { format!("Extraction complete ({skipped} symlink(s) skipped on Windows)") } else { "Extraction complete".into() },
    );
    Ok(())
}

/// { sourceDir, outputIso, volumeLabel? }
pub fn create(opts: &Value, progress: Progress, cancel: &Cancel) -> Res<()> {
    let src = absolute(str_opt(opts, "sourceDir").unwrap_or_default());
    let out = absolute(str_opt(opts, "outputIso").unwrap_or_default());
    need_dir(&src, "Source directory")?;
    if let Some(p) = out.parent() {
        std::fs::create_dir_all(p).at(p)?;
    }
    let label = label_of(str_opt(opts, "volumeLabel"), "ISOMAKER");
    progress("create", Some(0.0), "Creating ISO…");
    let args: Vec<String> = ["-as", "mkisofs", "-r", "-J", "-joliet-long", "-V", &label, "-o", &out.to_string_lossy(), &src.to_string_lossy()].map(String::from).to_vec();
    let o = run_xorriso(&args, Some(progress), cancel)?;
    if o.code != 0 {
        return err(failed("create", &o));
    }
    progress("create", Some(100.0), "ISO created");
    Ok(())
}

/// { sourceDir, outputIso, volumeLabel?, biosBootImage?, efiBootImage?, isohybridMbr? }
pub fn create_bootable(opts: &Value, progress: Progress, cancel: &Cancel) -> Res<()> {
    let src = absolute(str_opt(opts, "sourceDir").unwrap_or_default());
    let out = absolute(str_opt(opts, "outputIso").unwrap_or_default());
    need_dir(&src, "Source directory")?;
    if let Some(p) = out.parent() {
        std::fs::create_dir_all(p).at(p)?;
    }
    let bios = str_opt(opts, "biosBootImage");
    let efi = str_opt(opts, "efiBootImage");
    let mbr = str_opt(opts, "isohybridMbr");
    if bios.is_none() && efi.is_none() {
        return err("At least one of biosBootImage or efiBootImage is required for a bootable ISO");
    }
    let label = label_of(str_opt(opts, "volumeLabel"), "BOOTISO");
    let mut args: Vec<String> = ["-as", "mkisofs", "-r", "-J", "-joliet-long", "-V", &label].map(String::from).to_vec();
    if let Some(m) = mbr {
        let p = src.join(m);
        need_file(&p, "isohybrid MBR")?;
        args.extend(["-isohybrid-mbr".into(), p.to_string_lossy().to_string()]);
    }
    if let Some(b) = bios {
        need_file(&src.join(b), "BIOS boot image")?;
        args.extend(["-b", b, "-c", "boot.catalog", "-no-emul-boot", "-boot-load-size", "4", "-boot-info-table"].map(String::from));
    }
    if let Some(e) = efi {
        need_file(&src.join(e), "EFI boot image")?;
        args.extend(["-eltorito-alt-boot", "-e", e, "-no-emul-boot"].map(String::from));
        if mbr.is_none() {
            args.push("-isohybrid-gpt-basdat".into());
        }
    }
    args.extend(["-o".into(), out.to_string_lossy().to_string(), src.to_string_lossy().to_string()]);
    progress("bootable", Some(0.0), "Creating bootable ISO…");
    let o = run_xorriso(&args, Some(progress), cancel)?;
    if o.code != 0 {
        return err(failed("bootable create", &o));
    }
    progress("bootable", Some(100.0), "Bootable ISO created");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn posix_paths() {
        assert_eq!(to_posix(r"C:\Users\me\a b.iso"), "/c/Users/me/a b.iso");
        assert_eq!(to_posix(r"\\?\D:\x"), "/d/x");
        assert_eq!(to_posix("D:\\"), "/d");
        assert!(is_windows_path(r"C:\x") && !is_windows_path("-V"));
    }
}
