// The Node core (ARCHITECTURE.md §7): the database, the services and the HTTP API live in core/ +
// server/ (plain ESM JavaScript). This module starts `server/desktop.js` on a loopback port and waits
// for its `MYBOARD_READY <port> <token>` line; the windows then reach it over HTTP with the token.
//
// An installed app runs the copy in its resources (runtime/: its own Node and the esbuild bundle
// desktop.cjs, see scripts/stage-runtime.mjs), so the machine needs no Node.js. Debug builds run the
// checkout's server/desktop.js with the `node` on PATH (MYBOARD_NODE overrides), so a core edit shows on
// the next start without a rebuild.
//
// The core starts on a background thread as the app starts (the window does not wait for it); the
// `core_info` command waits until it is ready. The core gets `--parent-pid` and ends by itself when
// the app is gone; the app also kills it on exit.
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Condvar, Mutex};
use std::time::Duration;

/// How long the core may take to answer READY (the first start creates the database).
const READY_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreInfo {
    /// http://127.0.0.1:<port>
    pub url: String,
    pub token: String,
    pub port: u16,
}

#[derive(Clone, Debug)]
enum Status {
    Starting,
    Ready(CoreInfo),
    Failed(String),
}

pub struct Core {
    child: Mutex<Option<Child>>,
    status: Mutex<Status>,
    changed: Condvar,
}

struct Launch {
    node: PathBuf,
    entry: PathBuf,
    cwd: PathBuf,
    /// The installed copy (runtime/): started with --packaged (no CORS for the Vite dev origins).
    packaged: bool,
}

/// Tauri hands out the resource folder as a verbatim path (\\?\C:\…). Node cannot start a script
/// from one (it fails on lstat 'C:'), so use the plain form.
pub fn plain_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    match text.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => PathBuf::from(rest),
        _ => path,
    }
}

/// The project folder, when this exe runs from a checkout (tauri dev, target/…).
pub fn source_root() -> Option<PathBuf> {
    let is_root = |dir: &Path| dir.join("server").join("desktop.js").is_file() && dir.join("core").is_dir();
    let built = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    if is_root(&built) {
        return Some(built.canonicalize().map(plain_path).unwrap_or(built));
    }
    None
}

fn locate(resources: Option<PathBuf>) -> Result<Launch, String> {
    let bundled = resources.map(|dir| plain_path(dir).join("runtime")).and_then(|runtime| {
        let node = runtime.join(if cfg!(windows) { "node.exe" } else { "node" });
        let entry = runtime.join("desktop.cjs");
        (node.is_file() && entry.is_file()).then(|| Launch { node, entry, cwd: runtime, packaged: true })
    });
    let source = source_root().map(|root| Launch {
        node: PathBuf::from(std::env::var("MYBOARD_NODE").unwrap_or_else(|_| "node".into())),
        entry: root.join("server").join("desktop.js"),
        cwd: root,
        packaged: false,
    });
    let found = if cfg!(debug_assertions) { source.or(bundled) } else { bundled.or(source) };
    found.ok_or_else(|| crate::tr!(
        "프로그램 파일이 빠졌습니다 (프로그램 옆 runtime/). MyBoard 를 다시 설치하세요.",
        "The program files are incomplete (runtime/ next to the program). Reinstall MyBoard."
    ))
}

/// `MYBOARD_FAILED <code> <message>` (the core's start-up failure on stderr) → "<message> (<code>)".
pub fn parse_failed(line: &str) -> Option<String> {
    let rest = line.trim().strip_prefix("MYBOARD_FAILED ")?;
    let (code, message) = rest.split_once(' ').unwrap_or((rest, ""));
    Some(if message.is_empty() { code.to_string() } else { format!("{message} ({code})") })
}

/// `MYBOARD_READY <port> <token>` → (port, token).
pub fn parse_ready(line: &str) -> Option<(u16, String)> {
    let rest = line.trim().strip_prefix("MYBOARD_READY ")?;
    let mut parts = rest.split_whitespace();
    let port = parts.next()?.parse::<u16>().ok().filter(|port| *port > 0)?;
    let token = parts.next()?.to_string();
    Some((port, token))
}

impl Default for Core {
    fn default() -> Self {
        Self::new()
    }
}

impl Core {
    pub fn new() -> Self {
        Core { child: Mutex::new(None), status: Mutex::new(Status::Starting), changed: Condvar::new() }
    }

    fn set(&self, status: Status) {
        *self.status.lock().unwrap_or_else(|e| e.into_inner()) = status;
        self.changed.notify_all();
    }

    /// Starts the core and blocks until it is ready (call it on a background thread).
    pub fn start(&self, resources: Option<PathBuf>, data_dir: &Path) -> Result<CoreInfo, String> {
        let result = self.spawn(resources, data_dir);
        match &result {
            Ok(info) => self.set(Status::Ready(info.clone())),
            Err(error) => self.set(Status::Failed(error.clone())),
        }
        result
    }

    fn spawn(&self, resources: Option<PathBuf>, data_dir: &Path) -> Result<CoreInfo, String> {
        let launch = locate(resources)?;
        let _ = std::fs::create_dir_all(data_dir);
        let mut cmd = Command::new(&launch.node);
        cmd.arg(&launch.entry)
            .arg("--port")
            .arg("0")
            .arg("--data")
            .arg(plain_path(data_dir.to_path_buf()))
            .arg("--parent-pid")
            .arg(std::process::id().to_string())
            .args(if launch.packaged { vec!["--packaged"] } else { Vec::new() })
            .current_dir(&launch.cwd)
            .env_remove("ELECTRON_RUN_AS_NODE")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // No console window for the core.
            cmd.creation_flags(0x08000000);
        }
        let mut child = cmd.spawn().map_err(|e| crate::tr!(
            "코어를 시작할 수 없습니다 ({}): {e}",
            "Cannot start the core with {} ({e})",
            launch.node.display()
        ))?;
        let stdout = child.stdout.take().ok_or("the core has no output")?;
        // stderr is passed on; a MYBOARD_FAILED line is kept as the reason the core did not start.
        let failure: std::sync::Arc<Mutex<Option<String>>> = std::sync::Arc::default();
        if let Some(stderr) = child.stderr.take() {
            let failure = std::sync::Arc::clone(&failure);
            std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    if let Some(reason) = parse_failed(&line) {
                        *failure.lock().unwrap_or_else(|e| e.into_inner()) = Some(reason);
                    }
                    eprintln!("[core] {line}");
                }
            });
        }

        // The first READY line answers; everything after it is the core's own log.
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut sent = false;
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if !sent {
                    if let Some(ready) = parse_ready(&line) {
                        let _ = tx.send(ready);
                        sent = true;
                        continue;
                    }
                }
                println!("[core] {line}");
            }
        });
        let (port, token) = match rx.recv_timeout(READY_TIMEOUT) {
            Ok(ready) => ready,
            Err(_) => {
                let status = child.try_wait().ok().flatten();
                let _ = child.kill();
                let _ = child.wait();
                // The stderr reader may still be on its last line.
                std::thread::sleep(Duration::from_millis(200));
                if let Some(reason) = failure.lock().unwrap_or_else(|e| e.into_inner()).take() {
                    return Err(crate::tr!("코어를 시작하지 못했습니다: {reason}", "The core could not start: {reason}"));
                }
                return Err(match status {
                    Some(status) => crate::tr!("코어가 준비되기 전에 끝났습니다 ({status})", "The core exited before it was ready ({status})"),
                    None => crate::tr!("코어가 {}초 안에 시작하지 않았습니다", "The core did not start within {} seconds", READY_TIMEOUT.as_secs()),
                });
            }
        };
        *self.child.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
        Ok(CoreInfo { url: format!("http://127.0.0.1:{port}"), token, port })
    }

    /// Waits (up to `timeout`) until the core is ready or has failed.
    pub fn wait(&self, timeout: Duration) -> Result<CoreInfo, String> {
        let guard = self.status.lock().unwrap_or_else(|e| e.into_inner());
        let (guard, _) = self
            .changed
            .wait_timeout_while(guard, timeout, |status| matches!(status, Status::Starting))
            .unwrap_or_else(|e| e.into_inner());
        match &*guard {
            Status::Ready(info) => Ok(info.clone()),
            Status::Failed(error) => Err(error.clone()),
            Status::Starting => Err(crate::tr!("코어가 아직 시작 중입니다", "The core is still starting")),
        }
    }

    /// Whether the core process has ended after being ready (then the UI shows "core not reachable").
    pub fn exited(&self) -> Option<String> {
        let mut guard = self.child.lock().unwrap_or_else(|e| e.into_inner());
        let child = guard.as_mut()?;
        match child.try_wait() {
            Ok(Some(status)) => {
                guard.take();
                Some(status.to_string())
            }
            _ => None,
        }
    }

    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_path_strips_the_verbatim_prefix() {
        assert_eq!(plain_path(PathBuf::from(r"\\?\C:\Program Files\x")), PathBuf::from(r"C:\Program Files\x"));
        assert_eq!(plain_path(PathBuf::from(r"\\?\UNC\server\share")), PathBuf::from(r"\\server\share"));
        assert_eq!(plain_path(PathBuf::from("/usr/lib/x")), PathBuf::from("/usr/lib/x"));
    }

    #[test]
    fn ready_line_gives_port_and_token() {
        assert_eq!(parse_ready("MYBOARD_READY 51234 abcDEF123"), Some((51234, "abcDEF123".to_string())));
        assert_eq!(parse_ready("  MYBOARD_READY 80 t \r"), Some((80, "t".to_string())));
        assert_eq!(parse_ready("MYBOARD_READY 0 t"), None);
        assert_eq!(parse_ready("MYBOARD_READY 80"), None);
        assert_eq!(parse_ready("listening on 80"), None);
    }

    #[test]
    fn failed_line_gives_the_reason() {
        assert_eq!(parse_failed("MYBOARD_FAILED DB_OPEN cannot open the file"), Some("cannot open the file (DB_OPEN)".to_string()));
        assert_eq!(parse_failed("MYBOARD_FAILED ERROR"), Some("ERROR".to_string()));
        assert_eq!(parse_failed("something else"), None);
    }

    #[test]
    fn waiting_returns_the_failure() {
        let core = Core::new();
        core.set(Status::Failed("boom".into()));
        assert_eq!(core.wait(Duration::from_millis(10)).unwrap_err(), "boom");
    }

    #[test]
    fn the_checkout_is_found_without_a_verbatim_prefix() {
        let root = source_root().expect("checkout with server/desktop.js");
        assert!(root.join("server").join("desktop.js").is_file());
        assert!(!root.to_string_lossy().starts_with(r"\\?\"));
    }

    #[test]
    fn waiting_times_out_while_starting() {
        let core = Core::new();
        assert!(core.wait(Duration::from_millis(10)).is_err());
    }
}
