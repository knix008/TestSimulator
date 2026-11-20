//! Account connection (Settings › Stream › "Connect"): the user's own app registration (Client ID) signs in
//! to the streaming service and the stream key is fetched. Two pieces live here:
//! - `request`: HTTPS calls to the services' sign-in and API hosts only (the page cannot: CORS), and
//! - `loopback`: a one-shot listener on 127.0.0.1 that receives the browser's sign-in redirect
//!   (`?code=…&state=…`) and answers with a short "you can close this tab" page.
use serde::Serialize;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Hosts the account calls may reach (nothing else: this is not a general proxy).
pub const HOSTS: &[&str] = &["id.twitch.tv", "api.twitch.tv", "oauth2.googleapis.com", "www.googleapis.com", "accounts.google.com", "youtube.googleapis.com"];

pub fn allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#', ':']).next().unwrap_or("");
    HOSTS.contains(&host)
}

#[derive(Serialize)]
pub struct Answer {
    pub status: u16,
    pub body: String,
}

/// One HTTPS request: `form` is sent as application/x-www-form-urlencoded, `json` as JSON.
pub fn request(method: &str, url: &str, headers: &[(String, String)], form: Option<Vec<(String, String)>>, json: Option<String>) -> Result<Answer, String> {
    if !allowed(url) {
        return Err(format!("not an account address: {url}"));
    }
    let agent: ureq::Agent = ureq::Agent::config_builder().http_status_as_error(false).timeout_global(Some(Duration::from_secs(30))).build().into();
    let mut answer = match method {
        "GET" => {
            let mut req = agent.get(url);
            for (k, v) in headers {
                req = req.header(k, v);
            }
            req.call()
        }
        "POST" => {
            let mut req = agent.post(url);
            for (k, v) in headers {
                req = req.header(k, v);
            }
            if let Some(form) = form {
                req.send_form(form.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            } else {
                req.header("Content-Type", "application/json").send(json.unwrap_or_default())
            }
        }
        _ => return Err(format!("method {method}")),
    }
    .map_err(|e| e.to_string())?;
    let status = answer.status().as_u16();
    let body = answer.body_mut().read_to_string().map_err(|e| e.to_string())?;
    Ok(Answer { status, body })
}

#[derive(Clone, Serialize)]
pub struct Redirect {
    pub port: u16,
    pub query: String,
}

/// The page shown in the browser after signing in.
fn done_page(ok: bool) -> String {
    let (ko, en) = if ok { ("연결되었습니다. 이 탭을 닫고 MyBroadcasting 으로 돌아가세요.", "Connected. Close this tab and return to MyBroadcasting.") } else { ("연결하지 못했습니다. MyBroadcasting 으로 돌아가 다시 시도하세요.", "Not connected. Return to MyBroadcasting and try again.") };
    let body = format!("<!doctype html><meta charset=utf-8><title>MyBroadcasting</title><body style=\"font:16px system-ui;padding:40px;background:#111;color:#eee\"><h2>MyBroadcasting</h2><p>{ko}</p><p>{en}</p></body>");
    format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
}

/// Listens on a free 127.0.0.1 port for one sign-in redirect (up to `seconds`); emits `oauth-redirect`.
pub fn loopback(app: Option<AppHandle>, seconds: u64) -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let end = Instant::now() + Duration::from_secs(seconds);
        while Instant::now() < end {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buf = [0u8; 8192];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let head = String::from_utf8_lossy(&buf[..n]).to_string();
                    let target = head.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("/");
                    // The browser also asks for /favicon.ico: only the redirect (with a query) counts.
                    let Some(query) = target.split_once('?').map(|(_, q)| q.to_string()) else {
                        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                        continue;
                    };
                    let ok = query.contains("code=");
                    let _ = stream.write_all(done_page(ok).as_bytes());
                    let _ = stream.flush();
                    if let Some(app) = &app {
                        let _ = app.emit("oauth-redirect", Redirect { port, query });
                    }
                    return;
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(50)),
                Err(_) => return,
            }
        }
    });
    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_account_hosts() {
        assert!(allowed("https://id.twitch.tv/oauth2/device"));
        assert!(allowed("https://www.googleapis.com/youtube/v3/liveStreams?part=cdn"));
        assert!(!allowed("http://id.twitch.tv/oauth2/device"));
        assert!(!allowed("https://id.twitch.tv.evil.example/x"));
        assert!(!allowed("https://example.com/"));
        assert!(request("GET", "https://example.com/", &[], None, None).is_err());
    }

    #[test]
    fn the_redirect_is_received_once() {
        let port = loopback(None, 5).unwrap();
        let mut favicon = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        favicon.write_all(b"GET /favicon.ico HTTP/1.1\r\n\r\n").unwrap();
        let mut s = String::new();
        favicon.read_to_string(&mut s).unwrap();
        assert!(s.starts_with("HTTP/1.1 404"));
        let mut real = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        real.write_all(b"GET /?code=abc&state=xyz HTTP/1.1\r\n\r\n").unwrap();
        let mut page = String::new();
        real.read_to_string(&mut page).unwrap();
        assert!(page.contains("200 OK") && page.contains("MyBroadcasting"));
    }
}
