//! Remote control (Tools › WebSocket server): a WebSocket server on a port (the protocol's usual 4455 by
//! default). It only carries text frames: each one goes to the page as the `remote-message` event and the
//! page answers with `remote_send` (src/studio/wsproto.js speaks the remote-control protocol 5). A frame
//! `{"op":-1,"close":<code>}` from the page closes that connection with the code.
use serde::Serialize;
use std::collections::HashMap;
use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tungstenite::protocol::frame::coding::CloseCode;
use tungstenite::protocol::CloseFrame;
use tungstenite::{accept, Message};

struct Server {
    stop: Arc<AtomicBool>,
    port: u16,
}

fn server() -> &'static Mutex<Option<Server>> {
    static S: OnceLock<Mutex<Option<Server>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}
fn clients() -> &'static Mutex<HashMap<u32, Sender<String>>> {
    static C: OnceLock<Mutex<HashMap<u32, Sender<String>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}
static NEXT: AtomicU32 = AtomicU32::new(1);

#[derive(Clone, Serialize)]
struct Incoming {
    id: u32,
    text: String,
}

/// What the page is told: a client came (`open`), sent text (`message`) or left (`close`).
fn tell(app: &Option<AppHandle>, event: &str, id: u32, text: String) {
    if let Some(app) = app {
        let _ = app.emit(event, Incoming { id, text });
    }
}

/// Starts listening (stopping an earlier server first). `all` listens on every interface, else 127.0.0.1.
pub fn start(app: Option<AppHandle>, port: u16, all: bool) -> Result<u16, String> {
    stop();
    let listener = TcpListener::bind((if all { "0.0.0.0" } else { "127.0.0.1" }, port)).map_err(|e| format!("port {port}: {e}"))?;
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(port);
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let flag = Arc::new(AtomicBool::new(false));
    *server().lock().unwrap() = Some(Server { stop: flag.clone(), port });
    std::thread::spawn(move || {
        while !flag.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let app = app.clone();
                    let flag = flag.clone();
                    std::thread::spawn(move || serve(app, stream, flag));
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(30)),
                Err(_) => std::thread::sleep(Duration::from_millis(100)),
            }
        }
    });
    Ok(port)
}

fn serve(app: Option<AppHandle>, stream: TcpStream, stop: Arc<AtomicBool>) {
    let _ = stream.set_nonblocking(false);
    let Ok(mut ws) = accept(stream) else { return };
    let _ = ws.get_mut().set_read_timeout(Some(Duration::from_millis(20)));
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = channel::<String>();
    clients().lock().unwrap().insert(id, tx);
    tell(&app, "remote-open", id, String::new());
    'outer: loop {
        if stop.load(Ordering::Relaxed) {
            let _ = ws.close(None);
            break;
        }
        while let Ok(text) = rx.try_recv() {
            if let Some(code) = close_code(&text) {
                let _ = ws.close(Some(CloseFrame { code: CloseCode::from(code), reason: "".into() }));
                let _ = ws.flush();
                break 'outer;
            }
            if ws.send(Message::text(text)).is_err() {
                break 'outer;
            }
        }
        match ws.read() {
            Ok(Message::Text(text)) => tell(&app, "remote-message", id, text.to_string()),
            Ok(Message::Binary(_)) | Ok(Message::Ping(_)) | Ok(Message::Pong(_)) | Ok(Message::Frame(_)) => {}
            Ok(Message::Close(_)) => break,
            Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock || e.kind() == ErrorKind::TimedOut => {}
            Err(_) => break,
        }
    }
    clients().lock().unwrap().remove(&id);
    tell(&app, "remote-close", id, String::new());
}

/// `{"op":-1,"close":4009}` → 4009.
pub(crate) fn close_code(text: &str) -> Option<u16> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    if v.get("op")?.as_i64()? != -1 {
        return None;
    }
    v.get("close")?.as_u64().map(|c| c as u16)
}

pub fn send(id: u32, text: String) -> bool {
    clients().lock().unwrap().get(&id).is_some_and(|tx| tx.send(text).is_ok())
}

pub fn stop() {
    if let Some(s) = server().lock().unwrap().take() {
        s.stop.store(true, Ordering::Relaxed);
    }
}

pub fn port() -> Option<u16> {
    server().lock().unwrap().as_ref().map(|s| s.port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_frames_are_recognised() {
        assert_eq!(close_code(r#"{"op":-1,"close":4009}"#), Some(4009));
        assert_eq!(close_code(r#"{"op":7,"d":{}}"#), None);
        assert_eq!(close_code("not json"), None);
    }

    #[test]
    fn a_client_talks_through_the_server() {
        let port = start(None, 0, false).unwrap();
        assert_eq!(super::port(), Some(port));
        let (mut client, _) = tungstenite::connect(format!("ws://127.0.0.1:{port}")).unwrap();
        // The server registers the client; send it a frame from "the page".
        let mut id = None;
        for _ in 0..100 {
            id = clients().lock().unwrap().keys().copied().max();
            if id.is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(send(id.unwrap(), r#"{"op":0,"d":{}}"#.into()));
        let got = client.read().unwrap();
        assert_eq!(got.into_text().unwrap().as_str(), r#"{"op":0,"d":{}}"#);
        assert!(send(id.unwrap(), r#"{"op":-1,"close":4009}"#.into()));
        let mut closed = false;
        for _ in 0..50 {
            match client.read() {
                Ok(Message::Close(frame)) => {
                    assert_eq!(frame.map(|f| u16::from(f.code)), Some(4009));
                    closed = true;
                    break;
                }
                Ok(_) => {}
                Err(_) => {
                    closed = true;
                    break;
                }
            }
        }
        assert!(closed);
        stop();
        assert_eq!(super::port(), None);
    }
}
