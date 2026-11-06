//! Compressing with the user's own WinRAR, when they have it and ask for it. RAR's own compressor
//! cannot ship inside this program, but a copy the user owns can be run. Everything is made in a
//! temporary folder beside the output and moved into place only when it succeeded.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use zipmaster_core::Progress;

pub fn find() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("MYZIPMASTER_RAR") {
        if !path.is_empty() {
            return Some(path.into()).filter(|p: &PathBuf| p.exists());
        }
    }
    // A test sees only the tool it names.
    if std::env::var("MYZIPMASTER_TEST").is_ok() {
        return None;
    }
    let mut places: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        for base in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
            if let Ok(dir) = std::env::var(base) {
                places.push(Path::new(&dir).join("WinRAR").join("Rar.exe"));
            }
        }
    } else {
        for p in ["/usr/bin/rar", "/usr/local/bin/rar", "/opt/homebrew/bin/rar"] {
            places.push(p.into());
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        let name = if cfg!(windows) { "Rar.exe" } else { "rar" };
        places.extend(std::env::split_paths(&path).map(|d| d.join(name)));
    }
    places.into_iter().find(|p| p.is_file())
}

#[tauri::command]
pub fn find_rar_tool() -> Option<String> {
    find().map(|p| p.to_string_lossy().into_owned())
}

/// The switches for an option set. The password travels on the command line, which the dialog says.
fn switches(o: &Value) -> Vec<String> {
    let level = match o["level"].as_u64().unwrap_or(5) {
        0 => 0,
        1 => 1,
        2 | 3 => 2,
        4 | 5 => 3,
        6 | 7 => 4,
        _ => 5,
    };
    let mut args = vec!["a".to_string(), "-y".into(), "-ep1".into(), format!("-m{level}")];
    args.push(if o["rarVersion"].as_str() == Some("rar4") { "-ma4".into() } else { "-ma5".into() });
    if let Some(size) = o["volumeSize"].as_u64() {
        args.push(format!("-v{size}b"));
    }
    if o["solid"].as_bool() == Some(true) {
        args.push("-s".into());
    }
    if let Some(percent) = o["recoveryPercent"].as_u64() {
        args.push(format!("-rr{percent}p"));
    }
    if let Some(password) = o["password"].as_str() {
        let switch = if o["encryptNames"].as_bool() == Some(true) { "-hp" } else { "-p" };
        args.push(format!("{switch}{password}"));
    }
    if let Some(root) = o["rootFolder"].as_str() {
        args.push(format!("-ap{root}"));
    }
    for pattern in o["exclude"].as_array().into_iter().flatten().filter_map(Value::as_str) {
        args.push(format!("-x{pattern}"));
    }
    args
}

/// `name.rar` and `name.part3.rar`, in that folder.
fn parts_of(output: &Path) -> Vec<PathBuf> {
    let (Some(dir), Some(name)) = (output.parent(), output.file_name()) else { return Vec::new() };
    let name = name.to_string_lossy().to_lowercase();
    let stem = name.strip_suffix(".rar").unwrap_or(&name).to_string();
    let prefix = format!("{stem}.part");
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| {
                    let n = e.file_name().to_string_lossy().to_lowercase();
                    n == name || n.strip_prefix(&prefix).and_then(|r| r.strip_suffix(".rar")).is_some_and(|d| !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()))
                })
                .map(|e| e.path())
                .collect()
        })
        .unwrap_or_default()
}

fn part_number(path: &Path) -> u64 {
    let name = path.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    name.rsplit(".part").next().and_then(|r| r.strip_suffix(".rar")).and_then(|d| d.parse().ok()).unwrap_or(0)
}

fn tally(path: &Path, files: &mut u64, folders: &mut u64, bytes: &mut u64) {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return };
    if meta.is_dir() {
        *folders += 1;
        for entry in std::fs::read_dir(path).into_iter().flatten().flatten() {
            tally(&entry.path(), files, folders, bytes);
        }
    } else {
        *files += 1;
        *bytes += meta.len();
    }
}

type Failure = (&'static str, String);

fn run(tool: &Path, o: &Value, temp: &Path, progress: &dyn Progress) -> Result<Vec<PathBuf>, Failure> {
    let output = PathBuf::from(o["output"].as_str().unwrap_or_default());
    let name = output.file_name().ok_or(("invalid", "no output name".to_string()))?;
    let mut args = switches(o);
    if let Some(comment) = o["comment"].as_str() {
        let file = temp.join("comment.txt");
        std::fs::write(&file, format!("\u{feff}{comment}")).map_err(|e| ("io", e.to_string()))?;
        args.push(format!("-z{}", file.to_string_lossy()));
    }
    args.push("--".into());
    let work = temp.join("out");
    std::fs::create_dir_all(&work).map_err(|e| ("io", e.to_string()))?;
    args.push(work.join(name).to_string_lossy().into_owned());
    for source in o["sources"].as_array().into_iter().flatten() {
        if let Some(path) = source["path"].as_str() {
            args.push(path.to_string());
        }
    }

    let mut command = Command::new(tool);
    command.args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|e| ("rar_tool", e.to_string()))?;

    // Percentages arrive with backspaces between them, not lines.
    let (tx, rx) = mpsc::channel();
    let mut stdout = child.stdout.take().ok_or(("rar_tool", "no output".to_string()))?;
    std::thread::spawn(move || {
        let mut digits = String::new();
        let mut buffer = [0u8; 512];
        while let Ok(n) = stdout.read(&mut buffer) {
            if n == 0 {
                break;
            }
            for &b in &buffer[..n] {
                if b.is_ascii_digit() {
                    digits.push(b as char);
                } else {
                    if b == b'%' {
                        if let Ok(p) = digits.parse::<u64>() {
                            let _ = tx.send(p.min(100));
                        }
                    }
                    if b != b' ' {
                        digits.clear();
                    }
                }
            }
        }
    });
    let errors = Arc::new(Mutex::new(String::new()));
    if let Some(mut stderr) = child.stderr.take() {
        let errors = errors.clone();
        std::thread::spawn(move || {
            let mut text = Vec::new();
            let _ = stderr.read_to_end(&mut text);
            *errors.lock().unwrap() = String::from_utf8_lossy(&text).into_owned();
        });
    }

    let label = name.to_string_lossy().into_owned();
    let status = loop {
        for percent in rx.try_iter() {
            progress.update(percent, 100, &label);
        }
        if progress.cancelled() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(("cancelled", String::new()));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(("rar_tool", e.to_string())),
        }
    };
    // 1 is RAR's "non fatal": some file was skipped. That is not an archive of everything asked for.
    if !status.success() {
        std::thread::sleep(Duration::from_millis(100));
        let detail = errors.lock().unwrap().trim().to_string();
        return Err(("rar_tool", format!("exit {} {detail}", status.code().unwrap_or(-1))));
    }
    let made: Vec<PathBuf> = std::fs::read_dir(&work).map_err(|e| ("io", e.to_string()))?.flatten().map(|e| e.path()).collect();
    if made.is_empty() {
        return Err(("rar_tool", "no archive was made".to_string()));
    }
    Ok(made)
}

/// The same reply the engine gives.
pub fn create(tool: &Path, o: &Value, id: u64, progress: &dyn Progress) -> Value {
    match create_inner(tool, o, id, progress) {
        Ok(result) => json!({ "ok": true, "result": result }),
        Err((code, detail)) => json!({ "ok": false, "code": code, "detail": detail }),
    }
}

fn create_inner(tool: &Path, o: &Value, id: u64, progress: &dyn Progress) -> Result<Value, Failure> {
    let output = PathBuf::from(o["output"].as_str().unwrap_or_default());
    let dir = output.parent().filter(|d| !d.as_os_str().is_empty()).ok_or(("invalid", "no output folder".to_string()))?.to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| ("io", e.to_string()))?;
    let overwrite = o["overwrite"].as_bool() == Some(true);
    if !overwrite && !parts_of(&output).is_empty() {
        return Err(("exists", output.to_string_lossy().into_owned()));
    }

    let temp = dir.join(format!(".zm-rar-{}-{id}", std::process::id()));
    std::fs::create_dir_all(&temp).map_err(|e| ("io", e.to_string()))?;
    let made = run(tool, o, &temp, progress);
    let outcome = made.and_then(|made| {
        // Now the old set goes: a five-part archive replaced by a three-part one leaves no strays.
        for old in parts_of(&output) {
            std::fs::remove_file(old).map_err(|e| ("io", e.to_string()))?;
        }
        let mut placed = Vec::new();
        for file in made {
            let target = dir.join(file.file_name().unwrap_or_default());
            std::fs::rename(&file, &target).map_err(|e| ("io", e.to_string()))?;
            placed.push(target);
        }
        placed.sort_by_key(|p| part_number(p));
        Ok(placed)
    });
    let _ = std::fs::remove_dir_all(&temp);
    let placed = outcome?;

    let (mut files, mut folders, mut total) = (0, 0, 0);
    for source in o["sources"].as_array().into_iter().flatten() {
        if let Some(path) = source["path"].as_str() {
            tally(Path::new(path), &mut files, &mut folders, &mut total);
        }
    }
    let volumes: Vec<Value> = placed
        .iter()
        .map(|p| json!({ "path": p.to_string_lossy(), "size": std::fs::metadata(p).map(|m| m.len()).unwrap_or(0) }))
        .collect();
    let packed: u64 = volumes.iter().filter_map(|v| v["size"].as_u64()).sum();
    Ok(json!({ "volumes": volumes, "files": files, "folders": folders, "totalSize": total, "packedSize": packed }))
}
