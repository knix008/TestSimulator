// The Node core: every file, folder, git, terminal and settings operation lives in
// core/ + server/ (TypeScript) and is reached over HTTP. This module starts it on a
// loopback port and waits for its `MCM_READY <port> <node version>` line.
//
// An installed app runs the copy in its resources (runtime/: its own Node, the
// bundled server and the built UI, see scripts/stage-runtime.mjs), so the machine
// needs no Node.js. Debug builds run the source tree through tsx, so a core edit
// shows on the next start without a rebuild.
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

pub struct Core {
    pub child: Mutex<Option<Child>>,
}

pub struct Started {
    pub port: u16,
    pub node_version: String,
    /// The built UI the core serves; the window loads from the core when present.
    pub serves_ui: bool,
}

struct Launch {
    node: PathBuf,
    /// Arguments before our own (`tsx/dist/cli.mjs` in a checkout).
    prefix: Vec<PathBuf>,
    entry: PathBuf,
    static_dir: PathBuf,
    cwd: PathBuf,
}

/// Tauri hands out the resource folder as a verbatim path (\\?\C:\…). Node cannot
/// start a script from one (it fails on lstat 'C:'), so use the plain form.
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
    let is_root = |dir: &Path| dir.join("server").join("desktop.ts").is_file() && dir.join("core").is_dir();
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
        (node.is_file() && entry.is_file()).then(|| Launch {
            node,
            prefix: Vec::new(),
            entry,
            static_dir: runtime.join("dist"),
            cwd: runtime,
        })
    });
    let source = source_root().map(|root| Launch {
        node: PathBuf::from(std::env::var("MCM_NODE").unwrap_or_else(|_| "node".into())),
        prefix: vec![root.join("node_modules").join("tsx").join("dist").join("cli.mjs")],
        entry: root.join("server").join("desktop.ts"),
        static_dir: root.join("dist"),
        cwd: root,
    });
    let found = if cfg!(debug_assertions) { source.or(bundled) } else { bundled.or(source) };
    found.ok_or_else(|| "The program files are incomplete (runtime/ next to the program). Reinstall My Compare Master.".into())
}

impl Core {
    pub fn new() -> Self {
        Core { child: Mutex::new(None) }
    }

    /// Starts the core and blocks until it listens. `port` 0 lets it pick.
    pub fn start(&self, resources: Option<PathBuf>, port: u16, launcher: &Path, app_args: &[String]) -> Result<Started, String> {
        let launch = locate(resources)?;
        let serves_ui = launch.static_dir.join("index.html").is_file();
        let mut cmd = Command::new(&launch.node);
        cmd.args(&launch.prefix)
            .arg(&launch.entry)
            .arg("--port")
            .arg(port.to_string())
            .arg("--static")
            .arg(&launch.static_dir)
            .arg("--launcher")
            .arg(launcher)
            .arg("--parent-pid")
            .arg(std::process::id().to_string())
            .arg("--")
            .args(app_args)
            .current_dir(&launch.cwd)
            .env_remove("ELECTRON_RUN_AS_NODE")
            // A folder comparison reads many files at once; libuv's default of four
            // threads left it waiting on the disk a third of the time.
            .env("UV_THREADPOOL_SIZE", "16")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // No console window for the core.
            cmd.creation_flags(0x08000000);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("cannot start the core with {} ({e})", launch.node.display()))?;
        let stdout = child.stdout.take().ok_or("the core has no output")?;

        // The first READY line answers; everything after it is the core's own log.
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut sent = false;
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if !sent {
                    if let Some(rest) = line.strip_prefix("MCM_READY ") {
                        let _ = tx.send(rest.to_string());
                        sent = true;
                        continue;
                    }
                }
                println!("{line}");
            }
        });
        let ready = rx.recv_timeout(Duration::from_secs(40));
        let line = match ready {
            Ok(line) => line,
            Err(_) => {
                let status = child.try_wait().ok().flatten();
                let _ = child.kill();
                return Err(match status {
                    Some(status) => format!("the core exited before it was ready ({status})"),
                    None => "the core did not start within 40 seconds".into(),
                });
            }
        };
        let mut parts = line.split_whitespace();
        let port = parts.next().and_then(|p| p.parse::<u16>().ok()).ok_or("the core reported no port")?;
        let node_version = parts.next().unwrap_or("").trim_start_matches('v').to_string();
        *self.child.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
        Ok(Started { port, node_version, serves_ui })
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
    fn source_tree_is_found_from_the_manifest() {
        let root = source_root().expect("checkout");
        assert!(root.join("server").join("desktop.ts").is_file());
        assert!(!root.to_string_lossy().starts_with(r"\\?\"));
    }
}
