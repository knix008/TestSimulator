// The Node host (src/host/host.js): started with pipes, one JSON object per
// line each way (protocol in src/host/rpc.js). This side sends renderer calls
// and answers the host's own calls; lib.rs decides what each message means.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

pub type OnMessage = Arc<dyn Fn(Value) + Send + Sync + 'static>;

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
    ready: Mutex<Option<oneshot::Sender<()>>>,
    stopping: AtomicBool,
}

impl Host {
    /// Start Node; `on_message` gets every line that is not an answer to us.
    /// Resolves once the host said it is ready (or failed to start).
    pub fn start(launch: Launch, on_message: OnMessage, on_exit: Box<dyn FnOnce() + Send>) -> Result<(Arc<Host>, oneshot::Receiver<()>), String> {
        let mut cmd = Command::new(&launch.node);
        cmd.arg(&launch.script).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit());
        // Leaked from an Electron-based IDE terminal it would turn every Electron
        // program the user starts from MyTerminal into plain Node.
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
        let (ready_tx, ready_rx) = oneshot::channel();
        let host = Arc::new(Host {
            stdin: Mutex::new(Some(stdin)),
            child: Mutex::new(Some(child)),
            next: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
            ready: Mutex::new(Some(ready_tx)),
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
                    Some("call") if msg.get("m").and_then(Value::as_str) == Some("ready") => {
                        if let Some(tx) = reader_host.ready.lock().unwrap().take() {
                            let _ = tx.send(());
                        }
                    }
                    _ => on_message(msg),
                }
            }
            // Node is gone: nobody will answer what is still waiting.
            for (_, tx) in reader_host.pending.lock().unwrap().drain() {
                let _ = tx.send(Err("The terminal host stopped".into()));
            }
            reader_host.ready.lock().unwrap().take();
            if !reader_host.stopping.load(Ordering::SeqCst) {
                on_exit();
            }
        });
        Ok((host, ready_rx))
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

    pub fn send(&self, msg: &Value) {
        let mut guard = self.stdin.lock().unwrap();
        if let Some(stdin) = guard.as_mut() {
            let mut line = msg.to_string();
            line.push('\n');
            if stdin.write_all(line.as_bytes()).and_then(|_| stdin.flush()).is_err() {
                *guard = None;
            }
        }
    }

    /// A renderer call for the host (`m` is the Electron IPC channel name).
    pub async fn request(&self, win: Option<&str>, method: &str, args: Value) -> Result<Value, String> {
        let id = self.next.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        self.send(&json!({ "t": "req", "id": id, "win": win, "m": method, "a": args }));
        rx.await.unwrap_or_else(|_| Err("The terminal host stopped".into()))
    }

    /// The answer to one of the host's calls.
    pub fn reply(&self, id: u64, result: Result<Value, String>) {
        if id == 0 {
            return;
        }
        let msg = match result {
            Ok(v) => json!({ "t": "ret", "id": id, "ok": true, "v": v }),
            Err(e) => json!({ "t": "ret", "id": id, "ok": false, "e": e }),
        };
        self.send(&msg);
    }

    /// Close Node's stdin (it ends its shells and exits), then make sure it is gone.
    pub fn stop(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        self.stdin.lock().unwrap().take();
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1500);
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
