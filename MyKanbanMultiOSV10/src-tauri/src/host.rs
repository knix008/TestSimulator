// Starts the Node process that serves the app (desktop-host.js + server.js) and waits for its port.
// The child's stdin stays open for as long as this program lives: when the program ends, even by
// a crash, stdin closes and the Node process ends too.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const PORT_LINE: &str = "MYKANBAN_PORT=";

fn node_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

fn node_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(node_name()))
        .find(|candidate| candidate.is_file())
}

/// `node` and the script to run: the bundled copies in an installed app, the project's own
/// files and the `node` on PATH while developing.
fn locate(resource_dir: &Path) -> Result<(PathBuf, PathBuf), String> {
    let sidecar = resource_dir.join("sidecar");
    let bundled = sidecar.join("app").join("desktop-host.js");
    if bundled.is_file() {
        return Ok((sidecar.join(node_name()), bundled));
    }
    let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../desktop-host.js");
    let node = node_on_path().ok_or("Node.js was not found on PATH.")?;
    Ok((node, script))
}

fn last_lines(path: &Path) -> String {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(12)..].join("\n")
}

pub fn start(resource_dir: &Path, data_dir: &Path) -> Result<(Child, u16), String> {
    let (node, script) = locate(resource_dir)?;
    let log_path = data_dir.join("server.log");
    let log = File::create(&log_path).map_err(|e| format!("{}: {e}", log_path.display()))?;

    let mut command = Command::new(&node);
    command
        .arg(&script)
        .current_dir(script.parent().unwrap_or(data_dir))
        .env("KANBAN_DATA_PATH", data_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(log));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("{}: {e}", node.display()))?;
    let stdout = child.stdout.take().ok_or("The server has no stdout.")?;

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        // Keeps reading after the port so the server never blocks on a full pipe.
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(port) = line.strip_prefix(PORT_LINE) {
                let _ = tx.send(port.trim().parse::<u16>().ok());
            }
        }
    });

    match rx.recv_timeout(STARTUP_TIMEOUT) {
        Ok(Some(port)) => Ok((child, port)),
        Ok(None) => {
            let _ = child.kill();
            Err("The server reported an invalid port.".into())
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(format!("The server did not start.\n\n{}", last_lines(&log_path)))
        }
    }
}
