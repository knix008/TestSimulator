#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

static HOST: Mutex<Option<Child>> = Mutex::new(None);

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn port_open() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:17810".parse().unwrap(),
        Duration::from_millis(250),
    )
    .is_ok()
}

fn spawn_host(exe: &std::path::Path) {
    if port_open() {
        return;
    }
    let root = project_root();
    let script = root.join("host").join("server.js");
    if !script.exists() {
        eprintln!("[myimageviewer] host script missing: {}", script.display());
        return;
    }
    let mut cmd = Command::new("node");
    cmd.arg(&script)
        .current_dir(&root)
        .env("MYIMAGEVIEWER_RUNTIME", "tauri")
        .env("MYIMAGEVIEWER_EXE", exe)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if !cfg!(debug_assertions) {
        cmd.env("MYIMAGEVIEWER_PACKAGED", "1");
    }
    match cmd.spawn() {
        Ok(child) => {
            if let Ok(mut slot) = HOST.lock() {
                *slot = Some(child);
            }
        }
        Err(err) => eprintln!("[myimageviewer] could not start node host: {err}"),
    }
}

fn post_ipc(body: &str) {
    let Ok(mut stream) = TcpStream::connect_timeout(
        &"127.0.0.1:17810".parse().unwrap(),
        Duration::from_millis(800),
    ) else {
        return;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let req = format!(
        "POST /ipc HTTP/1.1\r\nHost: 127.0.0.1:17810\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return;
    }
    let mut buf = [0u8; 64];
    let _ = stream.read(&mut buf);
}

fn tell_host(exe: &std::path::Path) {
    if let Ok(body) = serde_json::to_string(&serde_json::json!({
        "channel": "set-host-exe",
        "args": [exe]
    })) {
        post_ipc(&body);
    }
    for arg in std::env::args().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        if let Ok(body) = serde_json::to_string(&serde_json::json!({
            "channel": "queue-open-file",
            "args": [arg]
        })) {
            post_ipc(&body);
        }
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let exe = std::env::current_exe().unwrap_or_else(|_| project_root().join("myimageviewer"));
            spawn_host(&exe);
            let exe2 = exe.clone();
            std::thread::spawn(move || {
                for _ in 0..40 {
                    if port_open() {
                        tell_host(&exe2);
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            });
            let _ = app;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MyImageViewer")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut slot) = HOST.lock() {
                    if let Some(child) = slot.as_mut() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
