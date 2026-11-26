//! Small pieces every module uses: errors, job progress, cancel flags, child processes,
//! finding programs, times.

use serde_json::{json, Value};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub type Res<T> = Result<T, String>;

/// Text for a failed call (what the page shows).
pub fn err<T>(msg: impl Into<String>) -> Res<T> {
    Err(msg.into())
}

pub trait IoText<T> {
    /// An io::Error with the path it was about.
    fn at(self, path: &Path) -> Res<T>;
}
impl<T> IoText<T> for std::io::Result<T> {
    fn at(self, path: &Path) -> Res<T> {
        self.map_err(|e| format!("{}: {e}", path.display()))
    }
}

pub const CANCELED: &str = "JOB_CANCELED";

/// A job's stop flag (iso:cancel sets it).
#[derive(Clone, Default)]
pub struct Cancel(pub Arc<AtomicBool>);
impl Cancel {
    pub fn new() -> Self {
        Cancel(Arc::new(AtomicBool::new(false)))
    }
    pub fn none() -> Self {
        Self::new()
    }
    pub fn set(&self) {
        self.0.store(true, Ordering::SeqCst)
    }
    pub fn is_set(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
    pub fn check(&self) -> Res<()> {
        if self.is_set() {
            err(CANCELED)
        } else {
            Ok(())
        }
    }
}

/// `job:progress` payload: { phase, percent | null, message }.
pub type Progress<'a> = &'a (dyn Fn(&str, Option<f64>, &str) + Sync);

pub fn progress_value(phase: &str, percent: Option<f64>, message: &str) -> Value {
    json!({ "phase": phase, "percent": percent, "message": message })
}

pub fn platform() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

pub fn home_dir() -> PathBuf {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(var).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

pub fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

pub fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

pub fn mtime_ms(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// Seconds since 1970 (UTC) → (year, month, day, hour, minute, second).
pub fn civil(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Howard Hinnant's days → civil
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m, d, (rem / 3600) as u32, ((rem % 3600) / 60) as u32, (rem % 60) as u32)
}

pub fn iso_now() -> String {
    let (y, mo, d, h, mi, s) = civil(now_secs());
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}.000Z")
}

/// A short random-ish tag for temp names.
pub fn tag() -> String {
    let n = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{}-{:x}", std::process::id(), (n ^ (n >> 17)) & 0xff_ffff)
}

/// A fresh folder under the system temp folder.
pub fn temp_dir(prefix: &str) -> Res<PathBuf> {
    for i in 0..100 {
        let p = std::env::temp_dir().join(format!("{prefix}{}-{i}", tag()));
        if std::fs::create_dir(&p).is_ok() {
            return Ok(p);
        }
    }
    err(format!("Could not make a temp folder ({prefix})"))
}

/// Lower-case key of a name inside a folder (ISO trees are case-insensitive here).
pub fn key(name: &str) -> String {
    name.to_lowercase()
}

/// Folders first by the caller; this is the name order: case-insensitive, numbers by value.
pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, _) => return std::cmp::Ordering::Less,
            (_, None) => return std::cmp::Ordering::Greater,
            (Some(c), Some(d)) if c.is_ascii_digit() && d.is_ascii_digit() => {
                let mut n1 = String::new();
                while let Some(c) = x.peek().copied().filter(char::is_ascii_digit) {
                    n1.push(c);
                    x.next();
                }
                let mut n2 = String::new();
                while let Some(c) = y.peek().copied().filter(char::is_ascii_digit) {
                    n2.push(c);
                    y.next();
                }
                let (t1, t2) = (n1.trim_start_matches('0'), n2.trim_start_matches('0'));
                let o = t1.len().cmp(&t2.len()).then_with(|| t1.cmp(t2));
                if o != std::cmp::Ordering::Equal {
                    return o;
                }
            }
            (Some(c), Some(d)) => {
                if c != d {
                    return c.cmp(&d);
                }
                x.next();
                y.next();
            }
        }
    }
}

// ── Programs ─────────────────────────────────────────────────

/// PATH with Homebrew's and the system's folders added (macOS / Linux programs started
/// from a desktop menu get a short PATH).
pub fn search_path() -> std::ffi::OsString {
    let current = std::env::var_os("PATH").unwrap_or_default();
    if cfg!(windows) {
        return current;
    }
    let mut parts: Vec<PathBuf> = std::env::split_paths(&current).collect();
    for extra in ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/usr/sbin", "/bin", "/sbin"] {
        let p = PathBuf::from(extra);
        if !parts.contains(&p) {
            parts.push(p);
        }
    }
    std::env::join_paths(parts).unwrap_or(current)
}

/// `which` / `where`: the first match of `name` on PATH.
pub fn which(name: &str) -> Option<PathBuf> {
    let exts: Vec<String> = if cfg!(windows) && Path::new(name).extension().is_none() {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".into())
            .split(';')
            .filter(|e| !e.is_empty())
            .map(|e| e.to_lowercase())
            .collect()
    } else {
        vec![String::new()]
    };
    for dir in std::env::split_paths(&search_path()) {
        for ext in &exts {
            let c = dir.join(format!("{name}{ext}"));
            if c.is_file() {
                return Some(c);
            }
        }
    }
    None
}

/// Hides the console window of a program started from the GUI (Windows).
pub fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.env_remove("ELECTRON_RUN_AS_NODE");
    cmd
}

pub struct Output {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs a program to its end. `on_text(is_stderr, chunk)` sees the output as it comes;
/// `cancel` kills it; `timeout` gives up (exit code -1).
pub fn run(cmd: &mut Command, cancel: Option<&Cancel>, timeout: Option<Duration>, on_text: &(dyn Fn(bool, &str) + Sync)) -> Res<Output> {
    quiet(cmd);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let program = cmd.get_program().to_string_lossy().to_string();
    let mut child = cmd.spawn().map_err(|e| format!("Could not start {program}: {e}"))?;
    let mut out = child.stdout.take().unwrap();
    let mut errp = child.stderr.take().unwrap();
    let started = Instant::now();
    std::thread::scope(|s| {
        let t_out = s.spawn(|| pump(&mut out, |t| on_text(false, t)));
        let t_err = s.spawn(|| pump(&mut errp, |t| on_text(true, t)));
        let code = loop {
            match child.try_wait() {
                Ok(Some(st)) => break st.code().unwrap_or(1),
                Ok(None) => {}
                Err(e) => return err(e.to_string()),
            }
            if cancel.is_some_and(Cancel::is_set) {
                let _ = child.kill();
                let _ = child.wait();
                let _ = t_out.join();
                let _ = t_err.join();
                return err(CANCELED);
            }
            if timeout.is_some_and(|t| started.elapsed() > t) {
                let _ = child.kill();
                let _ = child.wait();
                break -1;
            }
            std::thread::sleep(Duration::from_millis(25));
        };
        let stdout = t_out.join().unwrap_or_default();
        let stderr = t_err.join().unwrap_or_default();
        Ok(Output { code, stdout, stderr })
    })
}

fn pump(r: &mut dyn Read, on: impl Fn(&str)) -> String {
    let mut all = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        match r.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                on(&String::from_utf8_lossy(&buf[..n]));
                all.extend_from_slice(&buf[..n]);
            }
        }
    }
    String::from_utf8_lossy(&all).to_string()
}

/// Runs and collects the output, failing with the program's own message.
pub fn run_ok(cmd: &mut Command) -> Res<Output> {
    let program = Path::new(cmd.get_program()).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let o = run(cmd, None, None, &|_, _| {})?;
    if o.code != 0 {
        let detail = if o.stderr.trim().is_empty() { format!("exit {}", o.code) } else { o.stderr.trim().to_string() };
        return err(format!("{program} 실패: {detail}"));
    }
    Ok(o)
}

/// Copies `len` bytes from `src` to `dst` in 8 MiB pieces, checking `cancel` between them.
pub fn copy_n(src: &mut dyn Read, dst: &mut dyn std::io::Write, len: u64, cancel: &Cancel) -> Res<u64> {
    let mut buf = vec![0u8; (8 * 1024 * 1024).min(len.max(1) as usize)];
    let mut left = len;
    while left > 0 {
        cancel.check()?;
        let n = (buf.len() as u64).min(left) as usize;
        let got = src.read(&mut buf[..n]).map_err(|e| e.to_string())?;
        if got == 0 {
            break;
        }
        dst.write_all(&buf[..got]).map_err(|e| e.to_string())?;
        left -= got as u64;
    }
    Ok(len - left)
}

/// `name (2).ext`, `name (3).ext` … until the path is free.
pub fn unique_dest(dir: &Path, file_name: &str) -> PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(file_name);
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| file_name.to_string());
    (2..)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|c| !c.exists())
        .unwrap()
}

/// A name safe for a file on any system.
pub fn safe_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if "<>:\"/\\|?*".contains(c) || (c as u32) < 0x20 { '_' } else { c }).collect();
    let cleaned = cleaned.trim_end_matches('.').to_string();
    if cleaned.is_empty() {
        "file.bin".into()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn civil_dates() {
        assert_eq!(civil(0), (1970, 1, 1, 0, 0, 0));
        assert_eq!(civil(951_782_400), (2000, 2, 29, 0, 0, 0));
        assert_eq!(civil(1_764_201_600 + 3661), (2025, 11, 27, 1, 1, 1));
    }
    #[test]
    fn natural_order() {
        let mut v = vec!["file10", "File2", "file1", "a"];
        v.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(v, ["a", "file1", "File2", "file10"]);
    }
}
