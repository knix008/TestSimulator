// The Node host (host/host.ts, bundled to dist-sidecar/host.mjs): started with
// pipes, one JSON object per line each way (protocol in host/rpc.ts).

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

pub type OnEvent = Arc<dyn Fn(String, Value) + Send + Sync + 'static>;

pub struct Launch {
    pub node: PathBuf,
    pub script: PathBuf,
    pub env: Vec<(String, String)>,
}

pub struct Host {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    next: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    stopping: AtomicBool,
}

impl Host {
    /// Starts Node. `on_event` gets the host's events (job progress …);
    /// `on_exit` runs if Node ends while the program still needs it.
    pub fn start(launch: Launch, on_event: OnEvent, on_exit: Box<dyn FnOnce() + Send>) -> Result<Arc<Host>, String> {
        let mut cmd = Command::new(&launch.node);
        cmd.arg(&launch.script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit());
        // Leaked from an Electron-based editor terminal it would change how Node
        // tools started by the host behave.
        cmd.env_remove("ELECTRON_RUN_AS_NODE");
        for (k, v) in &launch.env {
            cmd.env(k, v);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Could not start Node.js ({}): {e}", launch.node.display()))?;
        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let host = Arc::new(Host {
            stdin: Mutex::new(Some(stdin)),
            child: Mutex::new(Some(child)),
            next: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
            stopping: AtomicBool::new(false),
        });
        let reader_host = host.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                    eprintln!("[host] {line}");
                    continue;
                };
                match msg.get("t").and_then(Value::as_str) {
                    Some("res") => reader_host.settle(&msg),
                    Some("emit") => {
                        let ch = msg.get("ch").and_then(Value::as_str).unwrap_or_default().to_string();
                        on_event(ch, msg.get("p").cloned().unwrap_or(Value::Null));
                    }
                    _ => {}
                }
            }
            for (_, tx) in reader_host.pending.lock().unwrap().drain() {
                let _ = tx.send(Err("The ISO host stopped".into()));
            }
            if !reader_host.stopping.load(Ordering::SeqCst) {
                on_exit();
            }
        });
        Ok(host)
    }

    fn settle(&self, msg: &Value) {
        let Some(id) = msg.get("id").and_then(Value::as_u64) else { return };
        let Some(tx) = self.pending.lock().unwrap().remove(&id) else { return };
        let result = if msg.get("ok").and_then(Value::as_bool) == Some(true) {
            Ok(msg.get("v").cloned().unwrap_or(Value::Null))
        } else {
            Err(msg.get("e").and_then(Value::as_str).unwrap_or("host call failed").to_string())
        };
        let _ = tx.send(result);
    }

    fn send(&self, msg: &Value) -> bool {
        let mut guard = self.stdin.lock().unwrap();
        let Some(stdin) = guard.as_mut() else { return false };
        let mut line = msg.to_string();
        line.push('\n');
        if stdin.write_all(line.as_bytes()).and_then(|_| stdin.flush()).is_err() {
            *guard = None;
            return false;
        }
        true
    }

    /// One page call: `method` is the old Electron IPC channel, `args` its argument list.
    pub async fn request(&self, method: &str, args: Value) -> Result<Value, String> {
        let id = self.next.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        if !self.send(&json!({ "t": "req", "id": id, "m": method, "a": args })) {
            self.pending.lock().unwrap().remove(&id);
            return Err("The ISO host is not running".into());
        }
        rx.await.unwrap_or_else(|_| Err("The ISO host stopped".into()))
    }

    /// Closes Node's stdin (it drops the session's temp files and exits), then makes sure it is gone.
    pub fn stop(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        self.stdin.lock().unwrap().take();
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(2000);
            while std::time::Instant::now() < deadline {
                if let Ok(Some(_)) = child.try_wait() {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            let _ = child.kill();
        }
    }
}
