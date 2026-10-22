// Raw TCP sockets for DICOM networking. The protocol (Upper Layer, DIMSE) lives in the page
// (src/js/dicomNet.js); this module only moves bytes: outgoing connections, a listener for the
// app's Storage SCP, one reader thread per socket that hands incoming chunks to a callback.
// std only.
//
// Wiring in lib.rs (sketch):
//   mod net;
//   // in setup(): events go to every window (each page ignores ids it does not own)
//   let (h1, h2, h3) = (app.handle().clone(), app.handle().clone(), app.handle().clone());
//   app.manage(net::Net::new(
//     move |id, data| { let _ = h1.emit("net-data", json!({ "id": id, "data": net::base64_encode(&data) })); },
//     move |id| { let _ = h2.emit("net-closed", json!({ "id": id })); },
//     move |listener, id, peer| { let _ = h3.emit("net-accept", json!({ "listener": listener, "id": id, "peer": peer })); },
//   ));
//   #[tauri::command]
//   async fn net_connect(net: tauri::State<'_, net::Net>, host: String, port: u16, timeout_ms: Option<u64>) -> Result<u32, String> {
//     let net = net.inner().clone();
//     tauri::async_runtime::spawn_blocking(move || net.connect(&host, port, timeout_ms.unwrap_or(10_000))).await.map_err(err)?
//   }
//   #[tauri::command]
//   async fn net_send(net: tauri::State<'_, net::Net>, request: Request<'_>) -> Result<(), String> {
//     let id: u32 = header(&request, "x-id").and_then(|s| s.parse().ok()).ok_or("missing x-id")?;
//     net.send(id, raw_body(&request)?)
//   }
//   #[tauri::command] fn net_close(net: tauri::State<'_, net::Net>, id: u32) -> bool { net.close(id) }
//   #[tauri::command] fn net_listen(net: tauri::State<'_, net::Net>, port: u16) -> Result<Value, String> {
//     let id = net.listen(port)?;
//     Ok(json!({ "id": id, "port": net.local_port(id).unwrap_or(port) }))
//   }
//   #[tauri::command] fn net_stop_listen(net: tauri::State<'_, net::Net>, id: u32) -> bool { net.stop_listen(id) }
//   // on exit: app.state::<net::Net>().close_all();

use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, Shutdown, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const READ_CHUNK: usize = 64 * 1024;
const WRITE_TIMEOUT: Duration = Duration::from_secs(60);

type DataFn = dyn Fn(u32, Vec<u8>) + Send + Sync;
type ClosedFn = dyn Fn(u32) + Send + Sync;
type AcceptFn = dyn Fn(u32, u32, String) + Send + Sync;

struct Listener {
  stop: Arc<AtomicBool>,
  addr: SocketAddr,
}

struct Inner {
  next_id: AtomicU32,
  sockets: Mutex<HashMap<u32, Arc<TcpStream>>>,
  listeners: Mutex<HashMap<u32, Listener>>,
  on_data: Box<DataFn>,
  on_closed: Box<ClosedFn>,
  on_accept: Box<AcceptFn>,
}

/// Socket table + listeners. Cheap to clone (shared state); keep one in Tauri managed state.
/// Socket and listener ids share one counter and are never reused.
#[derive(Clone)]
pub struct Net {
  inner: Arc<Inner>,
}

fn describe(e: &std::io::Error, what: &str, timeout_ms: u64) -> String {
  match e.kind() {
    ErrorKind::ConnectionRefused => format!("{what}: connection refused (is the DICOM node running and the port right?)"),
    ErrorKind::TimedOut | ErrorKind::WouldBlock => format!("{what}: no answer within {} s", timeout_ms as f64 / 1000.0),
    ErrorKind::AddrInUse => format!("{what}: the port is already in use"),
    ErrorKind::PermissionDenied => format!("{what}: permission denied"),
    ErrorKind::AddrNotAvailable => format!("{what}: address not available"),
    _ => format!("{what}: {e}"),
  }
}

impl Net {
  /// on_data(socket_id, bytes), on_closed(socket_id), on_accept(listener_id, socket_id, "ip:port").
  /// Callbacks run on the socket / listener threads. on_closed fires exactly once per socket,
  /// whether the peer, an error or close() ended it.
  pub fn new(
    on_data: impl Fn(u32, Vec<u8>) + Send + Sync + 'static,
    on_closed: impl Fn(u32) + Send + Sync + 'static,
    on_accept: impl Fn(u32, u32, String) + Send + Sync + 'static,
  ) -> Net {
    Net {
      inner: Arc::new(Inner {
        next_id: AtomicU32::new(1),
        sockets: Mutex::new(HashMap::new()),
        listeners: Mutex::new(HashMap::new()),
        on_data: Box::new(on_data),
        on_closed: Box::new(on_closed),
        on_accept: Box::new(on_accept),
      }),
    }
  }

  fn next_id(&self) -> u32 {
    self.inner.next_id.fetch_add(1, Ordering::Relaxed)
  }

  /// Opens a TCP connection (every resolved address is tried in turn). Blocks up to timeout_ms per address.
  pub fn connect(&self, host: &str, port: u16, timeout_ms: u64) -> Result<u32, String> {
    let host = host.trim();
    if host.is_empty() {
      return Err("No host given".into());
    }
    let timeout_ms = if timeout_ms == 0 { 10_000 } else { timeout_ms };
    let what = format!("Cannot connect to {host}:{port}");
    let addrs: Vec<SocketAddr> = (host, port)
      .to_socket_addrs()
      .map_err(|e| format!("Cannot resolve host \"{host}\": {e}"))?
      .collect();
    if addrs.is_empty() {
      return Err(format!("Cannot resolve host \"{host}\""));
    }
    let mut last = what.clone();
    for addr in addrs {
      match TcpStream::connect_timeout(&addr, Duration::from_millis(timeout_ms)) {
        Ok(stream) => {
          let id = self.register(stream)?;
          self.start_reader(id)?;
          return Ok(id);
        }
        Err(e) => last = describe(&e, &what, timeout_ms),
      }
    }
    Err(last)
  }

  fn register(&self, stream: TcpStream) -> Result<u32, String> {
    let _ = stream.set_nodelay(true);
    let _ = stream.set_write_timeout(Some(WRITE_TIMEOUT));
    let id = self.next_id();
    self.inner.sockets.lock().unwrap().insert(id, Arc::new(stream));
    Ok(id)
  }

  fn start_reader(&self, id: u32) -> Result<(), String> {
    let stream = self.inner.sockets.lock().unwrap().get(&id).cloned().ok_or("Socket vanished")?;
    let mut reader = match stream.try_clone() {
      Ok(r) => r,
      Err(e) => {
        self.inner.sockets.lock().unwrap().remove(&id);
        return Err(format!("Cannot read from the socket: {e}"));
      }
    };
    let inner = self.inner.clone();
    thread::Builder::new()
      .name(format!("net-read-{id}"))
      .spawn(move || {
        let mut buf = vec![0u8; READ_CHUNK];
        loop {
          match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => (inner.on_data)(id, buf[..n].to_vec()),
            Err(e) if e.kind() == ErrorKind::Interrupted => continue,
            Err(_) => break,
          }
        }
        if let Some(s) = inner.sockets.lock().unwrap().remove(&id) {
          let _ = s.shutdown(Shutdown::Both);
        }
        (inner.on_closed)(id);
      })
      .map_err(|e| format!("Cannot start the socket reader: {e}"))?;
    Ok(())
  }

  /// Writes all bytes (blocking; the lock is not held while writing).
  pub fn send(&self, id: u32, bytes: &[u8]) -> Result<(), String> {
    let stream = self.inner.sockets.lock().unwrap().get(&id).cloned().ok_or_else(|| format!("Socket {id} is not open"))?;
    (&*stream).write_all(bytes).map_err(|e| format!("Send failed: {e}"))?;
    (&*stream).flush().map_err(|e| format!("Send failed: {e}"))
  }

  /// Shuts the socket down; its reader thread then reports on_closed. False if the id is unknown.
  pub fn close(&self, id: u32) -> bool {
    let stream = self.inner.sockets.lock().unwrap().get(&id).cloned();
    match stream {
      Some(s) => {
        let _ = s.shutdown(Shutdown::Both);
        true
      }
      None => false,
    }
  }

  #[allow(dead_code)] // used by the tests
  pub fn is_open(&self, id: u32) -> bool {
    self.inner.sockets.lock().unwrap().contains_key(&id)
  }

  #[allow(dead_code)]
  pub fn peer_addr(&self, id: u32) -> Option<String> {
    self.inner.sockets.lock().unwrap().get(&id).and_then(|s| s.peer_addr().ok()).map(|a| a.to_string())
  }

  /// Listens on every interface (0.0.0.0); port 0 picks a free port (see local_port).
  pub fn listen(&self, port: u16) -> Result<u32, String> {
    self.listen_on("0.0.0.0", port)
  }

  /// Listens on one address, e.g. "127.0.0.1". Each connection gets a socket id reported through on_accept
  /// before its reader starts, so on_accept always precedes that socket's on_data.
  pub fn listen_on(&self, host: &str, port: u16) -> Result<u32, String> {
    let listener = TcpListener::bind((host, port)).map_err(|e| describe(&e, &format!("Cannot listen on {host}:{port}"), 0))?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    let lid = self.next_id();
    self.inner.listeners.lock().unwrap().insert(lid, Listener { stop: stop.clone(), addr });
    let net = self.clone();
    thread::Builder::new()
      .name(format!("net-listen-{lid}"))
      .spawn(move || {
        for conn in listener.incoming() {
          if stop.load(Ordering::SeqCst) {
            break;
          }
          match conn {
            Ok(stream) => {
              let peer = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();
              if let Ok(id) = net.register(stream) {
                (net.inner.on_accept)(lid, id, peer);
                if net.start_reader(id).is_err() {
                  (net.inner.on_closed)(id);
                }
              }
            }
            Err(_) => {
              if stop.load(Ordering::SeqCst) {
                break;
              }
              thread::sleep(Duration::from_millis(20));
            }
          }
        }
      })
      .map_err(|e| format!("Cannot start the listener: {e}"))?;
    Ok(lid)
  }

  pub fn local_port(&self, listener_id: u32) -> Option<u16> {
    self.inner.listeners.lock().unwrap().get(&listener_id).map(|l| l.addr.port())
  }

  /// Stops accepting (open connections stay open). False if the id is unknown.
  pub fn stop_listen(&self, id: u32) -> bool {
    let l = self.inner.listeners.lock().unwrap().remove(&id);
    match l {
      Some(l) => {
        l.stop.store(true, Ordering::SeqCst);
        // wake the blocking accept()
        let ip = match l.addr.ip() {
          IpAddr::V4(a) if a.is_unspecified() => IpAddr::V4(Ipv4Addr::LOCALHOST),
          IpAddr::V6(a) if a.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
          ip => ip,
        };
        let _ = TcpStream::connect_timeout(&SocketAddr::new(ip, l.addr.port()), Duration::from_millis(500));
        true
      }
      None => false,
    }
  }

  /// Stops every listener and closes every socket (app exit).
  pub fn close_all(&self) {
    let ids: Vec<u32> = self.inner.listeners.lock().unwrap().keys().copied().collect();
    for id in ids {
      self.stop_listen(id);
    }
    let ids: Vec<u32> = self.inner.sockets.lock().unwrap().keys().copied().collect();
    for id in ids {
      self.close(id);
    }
  }
}

/// Standard base64 (with padding) for the 'net-data' event payload.
pub fn base64_encode(bytes: &[u8]) -> String {
  const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
  for c in bytes.chunks(3) {
    let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
    out.push(T[(n >> 18) as usize & 63] as char);
    out.push(T[(n >> 12) as usize & 63] as char);
    out.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
    out.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::mpsc::{channel, Receiver};

  enum Ev {
    Data(u32, Vec<u8>),
    Closed(u32),
    Accept(u32, u32, String),
  }

  fn net() -> (Net, Receiver<Ev>) {
    let (tx, rx) = channel();
    let (t1, t2, t3) = (Mutex::new(tx.clone()), Mutex::new(tx.clone()), Mutex::new(tx));
    let n = Net::new(
      move |id, d| {
        let _ = t1.lock().unwrap().send(Ev::Data(id, d));
      },
      move |id| {
        let _ = t2.lock().unwrap().send(Ev::Closed(id));
      },
      move |l, id, p| {
        let _ = t3.lock().unwrap().send(Ev::Accept(l, id, p));
      },
    );
    (n, rx)
  }

  fn next(rx: &Receiver<Ev>) -> Ev {
    rx.recv_timeout(Duration::from_secs(5)).expect("event")
  }

  // collects data for one socket until n bytes arrived
  fn read_n(rx: &Receiver<Ev>, id: u32, n: usize, other: &mut Vec<Ev>) -> Vec<u8> {
    let mut got = Vec::new();
    while got.len() < n {
      match next(rx) {
        Ev::Data(i, d) if i == id => got.extend(d),
        e => other.push(e),
      }
    }
    got
  }

  #[test]
  fn loopback_exchange_and_close() {
    let (n, rx) = net();
    let lid = n.listen_on("127.0.0.1", 0).unwrap();
    let port = n.local_port(lid).unwrap();
    assert!(port > 0);
    let client = n.connect("127.0.0.1", port, 2000).unwrap();
    let server = match next(&rx) {
      Ev::Accept(l, id, peer) => {
        assert_eq!(l, lid);
        assert!(peer.starts_with("127.0.0.1:"));
        id
      }
      _ => panic!("expected accept"),
    };
    assert_ne!(client, server);
    let mut other = Vec::new();
    n.send(client, b"hello").unwrap();
    assert_eq!(read_n(&rx, server, 5, &mut other), b"hello");
    n.send(server, b"world!").unwrap();
    assert_eq!(read_n(&rx, client, 6, &mut other), b"world!");

    // 1 MB each way arrives intact
    let big: Vec<u8> = (0..1_048_576u32).map(|i| (i * 7 + i / 251) as u8).collect();
    let n2 = n.clone();
    let b2 = big.clone();
    let h = thread::spawn(move || n2.send(client, &b2).unwrap());
    assert_eq!(read_n(&rx, server, big.len(), &mut other), big);
    h.join().unwrap();

    assert!(n.close(client));
    let mut closed = Vec::new();
    while closed.len() < 2 {
      if let Ev::Closed(id) = next(&rx) {
        closed.push(id);
      }
    }
    closed.sort();
    let mut want = vec![client, server];
    want.sort();
    assert_eq!(closed, want);
    assert!(!n.is_open(client) && !n.is_open(server));
    assert!(n.send(client, b"x").is_err());
    assert!(!n.close(client));
    assert!(n.stop_listen(lid));
    assert!(!n.stop_listen(lid));
  }

  #[test]
  fn refused_and_stopped_listener() {
    let (n, _rx) = net();
    let lid = n.listen_on("127.0.0.1", 0).unwrap();
    let port = n.local_port(lid).unwrap();
    assert!(n.stop_listen(lid));
    thread::sleep(Duration::from_millis(100));
    let e = n.connect("127.0.0.1", port, 1000).unwrap_err();
    assert!(e.contains("Cannot connect"), "{e}");
    assert!(n.connect("", 1, 100).is_err());
    assert!(n.connect("no-such-host.invalid", 104, 500).is_err());
  }

  #[test]
  fn port_in_use() {
    let (n, _rx) = net();
    let lid = n.listen_on("127.0.0.1", 0).unwrap();
    let port = n.local_port(lid).unwrap();
    let e = n.listen_on("127.0.0.1", port).unwrap_err();
    assert!(e.contains("Cannot listen"), "{e}");
    n.close_all();
  }

  #[test]
  fn base64() {
    assert_eq!(base64_encode(b""), "");
    assert_eq!(base64_encode(b"f"), "Zg==");
    assert_eq!(base64_encode(b"fo"), "Zm8=");
    assert_eq!(base64_encode(b"foo"), "Zm9v");
    assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    assert_eq!(base64_encode(&[0xff, 0xfe, 0x00]), "//4A");
  }
}
