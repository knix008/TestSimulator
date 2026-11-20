//! Direct viewing (Settings › Stream › "Direct viewing"): people open `http://<this computer>:<port>/` and
//! watch the program without a streaming service. On one port this server answers plain HTTP requests with
//! the viewer page (`server/viewer.html`, built in) and WebSocket requests on `/ws` as signalling links:
//! each text frame goes to the page as the `viewer-message` event, and the page answers with `viewer_send`
//! (`src/bc/engine/viewers.js` makes one WebRTC connection per viewer). Picture and sound never pass
//! through here. `{"op":-1,"close":<code>}` from the page closes that viewer's link.
use serde::Serialize;
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tungstenite::protocol::frame::coding::CloseCode;
use tungstenite::protocol::CloseFrame;
use tungstenite::{accept, Message};

const PAGE: &str = include_str!("../../server/viewer.html");
const MAX_TEXT: usize = 64 * 1024;

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

#[derive(Serialize)]
pub struct Started {
    pub port: u16,
    pub addresses: Vec<String>,
}

fn tell(app: &Option<AppHandle>, event: &str, id: u32, text: String) {
    if let Some(app) = app {
        let _ = app.emit(event, Incoming { id, text });
    }
}

/// This computer's address on its network (the route to the internet; no packet is sent), then 127.0.0.1.
pub fn local_addresses() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip();
                if !ip.is_loopback() && !ip.is_unspecified() {
                    out.push(ip.to_string());
                }
            }
        }
    }
    out.push("127.0.0.1".to_string());
    out
}

/// Starts listening on every interface (stopping an earlier server first). Port 0: any free one.
pub fn start(app: Option<AppHandle>, port: u16) -> Result<Started, String> {
    stop();
    // "port-in-use:<port>" lets the page tell a taken port (another program, or "npm run viewers") from
    // other failures, whatever the system's wording.
    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|e| if e.kind() == ErrorKind::AddrInUse { format!("port-in-use:{port}") } else { format!("port {port}: {e}") })?;
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
    Ok(Started { port, addresses: local_addresses() })
}

/// The request head, looked at without taking it off the socket (the WebSocket handshake reads it again).
fn peek_head(stream: &TcpStream) -> Option<String> {
    let mut buf = [0u8; 4096];
    for _ in 0..100 {
        let n = stream.peek(&mut buf).ok()?;
        if n == 0 {
            return None;
        }
        let text = String::from_utf8_lossy(&buf[..n]).to_string();
        if text.contains("\r\n\r\n") || n == buf.len() {
            return Some(text);
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    None
}

/// The path of "GET /path?query HTTP/1.1" (without the query).
fn path_of(head: &str) -> String {
    let target = head.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("/");
    target.split('?').next().unwrap_or("/").to_string()
}

fn is_upgrade(head: &str) -> bool {
    head.to_ascii_lowercase().lines().any(|l| l.starts_with("upgrade:") && l.contains("websocket"))
}

/// Status line, headers and body of a plain HTTP answer.
fn http_answer(path: &str) -> Vec<u8> {
    let (status, kind, body): (&str, &str, &[u8]) = match path {
        "/" | "/index.html" => ("200 OK", "text/html; charset=utf-8", PAGE.as_bytes()),
        "/favicon.ico" => ("204 No Content", "text/plain", b""),
        _ => ("404 Not Found", "text/plain", b"not found"),
    };
    let mut out = format!("HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n", body.len()).into_bytes();
    out.extend_from_slice(body);
    out
}

fn serve(app: Option<AppHandle>, mut stream: TcpStream, stop: Arc<AtomicBool>) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let Some(head) = peek_head(&stream) else { return };
    let path = path_of(&head);
    if !is_upgrade(&head) {
        let mut sink = vec![0u8; head.len()];
        let _ = stream.read_exact(&mut sink);
        let _ = stream.write_all(&http_answer(&path));
        let _ = stream.flush();
        return;
    }
    if path != "/ws" {
        return;
    }
    let addr = stream.peer_addr().map(|a| a.ip().to_string()).unwrap_or_default();
    let Ok(mut ws) = accept(stream) else { return };
    let _ = ws.get_mut().set_read_timeout(Some(Duration::from_millis(20)));
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = channel::<String>();
    clients().lock().unwrap().insert(id, tx);
    tell(&app, "viewer-open", id, addr);
    'outer: loop {
        if stop.load(Ordering::Relaxed) {
            let _ = ws.close(None);
            let _ = ws.flush();
            break;
        }
        while let Ok(text) = rx.try_recv() {
            if let Some(code) = crate::remote::close_code(&text) {
                let _ = ws.close(Some(CloseFrame { code: CloseCode::from(code), reason: "".into() }));
                let _ = ws.flush();
                break 'outer;
            }
            if ws.send(Message::text(text)).is_err() {
                break 'outer;
            }
        }
        match ws.read() {
            Ok(Message::Text(text)) if text.len() <= MAX_TEXT => tell(&app, "viewer-message", id, text.to_string()),
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e)) if e.kind() == ErrorKind::WouldBlock || e.kind() == ErrorKind::TimedOut => {}
            Err(_) => break,
        }
    }
    clients().lock().unwrap().remove(&id);
    tell(&app, "viewer-close", id, String::new());
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
    fn request_heads_are_read() {
        assert_eq!(path_of("GET /?code=1 HTTP/1.1\r\nHost: x\r\n\r\n"), "/");
        assert_eq!(path_of("GET /ws HTTP/1.1\r\n"), "/ws");
        assert!(is_upgrade("GET /ws HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n"));
        assert!(!is_upgrade("GET / HTTP/1.1\r\nHost: x\r\n\r\n"));
        assert!(String::from_utf8_lossy(&http_answer("/")).starts_with("HTTP/1.1 200 OK"));
        assert!(String::from_utf8_lossy(&http_answer("/nope")).starts_with("HTTP/1.1 404"));
        assert!(local_addresses().last().is_some_and(|a| a == "127.0.0.1"));
    }

    #[test]
    fn the_page_and_a_viewer_link_share_one_port() {
        let started = start(None, 0).unwrap();
        let port = started.port;
        assert_eq!(super::port(), Some(port));
        // Plain HTTP: the viewer page.
        let mut http = TcpStream::connect(("127.0.0.1", port)).unwrap();
        http.write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
        let mut page = String::new();
        http.read_to_string(&mut page).unwrap();
        assert!(page.starts_with("HTTP/1.1 200 OK"), "{page}");
        assert!(page.contains("RTCPeerConnection"));
        // WebSocket on /ws: a signalling link the page can write to.
        let (mut client, _) = tungstenite::connect(format!("ws://127.0.0.1:{port}/ws")).unwrap();
        let mut id = None;
        for _ in 0..200 {
            id = clients().lock().unwrap().keys().copied().max();
            if id.is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(send(id.unwrap(), r#"{"type":"welcome"}"#.into()));
        assert_eq!(client.read().unwrap().into_text().unwrap().as_str(), r#"{"type":"welcome"}"#);
        stop();
        assert_eq!(super::port(), None);
    }
}
