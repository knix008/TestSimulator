// The Node host (host/host.js): the FTP / FTPS / SFTP servers and the rest of
// core/. Started with pipes; its first stdout line says where its HTTP API
// listens ({"ready":true,"port":…,"token":…}). Closing its stdin asks it to
// stop the servers and exit.

use serde::Deserialize;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct Launch {
    pub node: PathBuf,
    pub script: PathBuf,
    pub env: Vec<(String, String)>,
}

pub struct Host {
    pub port: u16,
    pub token: String,
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
}

#[derive(Deserialize)]
struct Ready {
    ready: bool,
    port: Option<u16>,
    token: Option<String>,
    error: Option<String>,
}

/// Parses the host's first line.
fn parse_ready(line: &str) -> Result<(u16, String), String> {
    let r: Ready = serde_json::from_str(line.trim()).map_err(|_| format!("Unexpected output from the server host: {line}"))?;
    if !r.ready {
        return Err(r.error.unwrap_or_else(|| "The server host could not start.".into()));
    }
    match (r.port, r.token) {
        (Some(port), Some(token)) if port > 0 && !token.is_empty() => Ok((port, token)),
        _ => Err("The server host did not say where it listens.".into()),
    }
}

impl Host {
    pub fn start(launch: Launch, timeout: Duration) -> Result<Host, String> {
        let mut cmd = Command::new(&launch.node);
        cmd.arg(&launch.script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit());
        // Leaked from an Electron-based editor's terminal it would make every
        // Electron program started later behave like plain Node.
        cmd.env_remove("ELECTRON_RUN_AS_NODE");
        for (k, v) in &launch.env {
            cmd.env(k, v);
        }
        if let Some(dir) = launch.script.parent() {
            cmd.current_dir(dir);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = cmd.spawn().map_err(|e| format!("Could not start Node.js ({}): {e}", launch.node.display()))?;
        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut first = String::new();
            let _ = tx.send(reader.read_line(&mut first).map(|_| first));
            // Nothing else is expected; keep the pipe drained so the host never blocks on it.
            let mut sink = [0u8; 4096];
            while matches!(reader.read(&mut sink), Ok(n) if n > 0) {}
        });
        let line = match rx.recv_timeout(timeout) {
            Ok(Ok(line)) if !line.trim().is_empty() => line,
            Ok(_) => {
                let _ = child.kill();
                return Err("The server host stopped before it was ready.".into());
            }
            Err(_) => {
                let _ = child.kill();
                return Err("The server host did not start in time.".into());
            }
        };
        let (port, token) = match parse_ready(&line) {
            Ok(v) => v,
            Err(e) => {
                let _ = child.kill();
                return Err(e);
            }
        };
        Ok(Host { port, token, stdin: Mutex::new(Some(stdin)), child: Mutex::new(Some(child)) })
    }

    /// Close Node's stdin (it stops the FTP / FTPS / SFTP servers and exits),
    /// then make sure it is gone.
    pub fn stop(&self) {
        self.stdin.lock().unwrap().take();
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let deadline = Instant::now() + Duration::from_millis(3000);
            while Instant::now() < deadline {
                if let Ok(Some(_)) = child.try_wait() {
                    return;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_line() {
        assert_eq!(parse_ready("{\"ready\":true,\"port\":4567,\"token\":\"ab\"}\n").unwrap(), (4567, "ab".to_string()));
        assert_eq!(parse_ready("{\"ready\":false,\"error\":\"EADDRINUSE\"}").unwrap_err(), "EADDRINUSE");
        assert!(parse_ready("{\"ready\":true}").is_err());
        assert!(parse_ready("hello").is_err());
    }
}
