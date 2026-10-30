// The Node core. The FTP / FTPS / SFTP client lives in core/ (basic-ftp, ssh2)
// and is reached over HTTP: this module spawns `node server/server.js` (the
// same host the browser version uses) on a free loopback port with a random
// token, and the page asks for that origin through `host_config`.
//
// An installed app runs the copy in its resources (runtime/: its own Node and
// the bundled server, see scripts/stage-runtime.mjs), so the machine needs no
// Node.js. Debug builds run the source tree, so edits show on the next start.
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, serde::Serialize)]
pub struct HostConfig {
    pub origin: String,
    pub token: String,
    pub error: String,
}

// The core starts on its own thread while the window and its webview are
// created. `config` stays None until the core answered (or failed);
// host_config waits until then.
pub struct CoreState {
    pub child: Mutex<Option<Child>>,
    pub config: Mutex<Option<HostConfig>>,
    pub ready: Condvar,
}

impl CoreState {
    pub fn new() -> Self {
        CoreState { child: Mutex::new(None), config: Mutex::new(None), ready: Condvar::new() }
    }

    pub fn wait_config(&self) -> HostConfig {
        let mut slot = self.config.lock().unwrap_or_else(|e| e.into_inner());
        while slot.is_none() {
            slot = self.ready.wait(slot).unwrap_or_else(|e| e.into_inner());
        }
        slot.clone().unwrap()
    }

    /// The config if the core is already up; never blocks.
    pub fn config_now(&self) -> Option<HostConfig> {
        self.config.lock().ok().and_then(|slot| slot.clone()).filter(|c| c.error.is_empty())
    }

    pub fn start(&self, resources: Option<PathBuf>, config_dir: &Path) {
        let (child, config) = match start_inner(resources, config_dir) {
            Ok((child, cfg)) => (Some(child), cfg),
            Err(error) => (None, HostConfig { origin: String::new(), token: String::new(), error }),
        };
        *self.child.lock().unwrap_or_else(|e| e.into_inner()) = child;
        *self.config.lock().unwrap_or_else(|e| e.into_inner()) = Some(config);
        self.ready.notify_all();
    }

    /// Asks the core to close its connections, then makes sure it is gone.
    pub fn stop(&self) {
        let config = self.wait_config();
        if config.error.is_empty() {
            let _ = post(&config, "app.shutdown", "{}");
        }
        if let Ok(mut slot) = self.child.lock() {
            if let Some(mut child) = slot.take() {
                let deadline = Instant::now() + Duration::from_millis(1500);
                while Instant::now() < deadline {
                    if let Ok(Some(_)) = child.try_wait() {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(30));
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

struct Launch {
    node: PathBuf,
    server: PathBuf,
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
fn source_root() -> Option<PathBuf> {
    let has_server = |dir: &PathBuf| dir.join("server").join("server.js").is_file() && dir.join("core").is_dir();
    let built = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    if has_server(&built) {
        return Some(built);
    }
    let mut dir = std::env::current_dir().ok()?;
    for _ in 0..8 {
        if has_server(&dir) {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn locate(resources: Option<PathBuf>) -> Result<Launch, String> {
    let bundled = resources.map(|dir| plain_path(dir).join("runtime")).and_then(|runtime| {
        let node = runtime.join(if cfg!(windows) { "node.exe" } else { "node" });
        let server = runtime.join("server").join("server.js");
        (node.is_file() && server.is_file()).then_some(Launch { node, server, cwd: runtime })
    });
    let source = source_root().map(|root| Launch {
        node: PathBuf::from(std::env::var("MFC_NODE").unwrap_or_else(|_| "node".into())),
        server: root.join("server").join("server.js"),
        cwd: root,
    });
    let found = if cfg!(debug_assertions) { source.or(bundled) } else { bundled.or(source) };
    found.ok_or_else(|| "The core files are missing (runtime/ next to the program). Reinstall My FTP Client.".into())
}

fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok(port)
}

fn token() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}-{:x}", std::process::id())
}

fn start_inner(resources: Option<PathBuf>, config_dir: &Path) -> Result<(Child, HostConfig), String> {
    let core = locate(resources)?;
    let port = free_port()?;
    let token = token();
    let origin = format!("http://127.0.0.1:{port}");
    let mut cmd = Command::new(&core.node);
    cmd.arg(&core.server)
        .args(["--port", &port.to_string(), "--host", "127.0.0.1", "--token", &token, "--no-open"])
        .arg("--parent-pid")
        .arg(std::process::id().to_string())
        .arg("--config")
        .arg(config_dir)
        .current_dir(&core.cwd)
        .env("MFC_HOST_NAME", "tauri")
        .env("MFC_NO_OPEN", "1")
        .env_remove("ELECTRON_RUN_AS_NODE")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window for the core. Its output still reaches this process when one exists.
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn().map_err(|e| format!("cannot start the core with {} ({e})", core.node.display()))?;
    let config = HostConfig { origin, token, error: String::new() };
    let start = Instant::now();
    let mut last = String::from("the core did not start");
    while start.elapsed() < Duration::from_secs(30) {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!("the core exited before it was ready ({status})"));
        }
        match post(&config, "app.info", "{}") {
            Ok(_) => {
                eprintln!("[tauri] core {}", config.origin);
                return Ok((child, config));
            }
            Err(err) => last = err,
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let _ = child.kill();
    Err(last)
}

/// POST /api/<method> with a JSON body. Ok(body) for HTTP 200.
pub fn post(config: &HostConfig, method: &str, body: &str) -> Result<String, String> {
    let hostport = config.origin.trim_start_matches("http://").trim_end_matches('/');
    let addr = hostport.parse::<std::net::SocketAddr>().map_err(|e| e.to_string())?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(500)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
    let req = format!(
        "POST /api/{method} HTTP/1.1\r\nHost: {hostport}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        config.token,
        body.len()
    );
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    let _ = stream.read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf).to_string();
    if text.starts_with("HTTP/1.1 200") || text.starts_with("HTTP/1.0 200") {
        Ok(text.split_once("\r\n\r\n").map(|(_, b)| b.to_string()).unwrap_or_default())
    } else {
        Err(format!("the core replied {}", text.lines().next().unwrap_or("nothing")))
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
        assert!(root.join("server").join("server.js").is_file());
    }
}
