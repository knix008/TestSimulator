// FTP sessions for the host API (POST /api/ftp/<op>, see host.rs): the sockets
// behind the engine's ftp class (core/lib/io/ftp.js). Same calls and replies as
// server/ftp-client.js:
//
//   open   { host, port, user, password }      → { session, path }
//   close  { session }                         → { ok: true }
//   pwd    { session }                         → { path }
//   cd     { session, path }                   → { path }
//   list   { session, path }                   → { entries: [{ name, isDir, size, mtimeMs }] }
//   get    { session, path, mode }             → { bodyBase64 }
//   put    { session, path, bodyBase64, mode } → { ok: true }
//   delete / mkdir / rmdir { session, path }   → { ok: true }
//   rename { session, from, to }               → { ok: true }
//
// Passive mode only (PASV first on IPv4, EPSV first on IPv6, the other as the
// fallback); MLSD when FEAT lists MLST, else LIST (Unix and Windows/IIS
// formats). Plain FTP only (no FTPS). Idle sessions close after 10 minutes.
use super::{random_token, ApiError, ApiResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{IpAddr, Shutdown, SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const TIMEOUT: Duration = Duration::from_secs(30);
const DATA_TIMEOUT: Duration = Duration::from_secs(120);
const IDLE: Duration = Duration::from_secs(600);
const MAX_SESSIONS: usize = 32;

struct Reply {
    code: u16,
    text: String,
}

fn ftp_err(code: &str, message: impl Into<String>) -> ApiError {
    ApiError::new(code, message)
}

fn io_err(e: std::io::Error) -> ApiError {
    use std::io::ErrorKind::*;
    let code = match e.kind() {
        ConnectionRefused => "ECONNREFUSED",
        TimedOut | WouldBlock => "ETIMEDOUT",
        ConnectionReset | ConnectionAborted | BrokenPipe | UnexpectedEof => "ECONNRESET",
        _ => "EIO",
    };
    ftp_err(code, e.to_string())
}

fn reply_err(r: &Reply) -> ApiError {
    let code = match r.code {
        450 | 550 => "ENOENT",
        530 => "EACCES",
        553 => "EINVAL",
        _ => "EFTP",
    };
    let last = r.text.lines().last().unwrap_or("");
    ftp_err(code, format!("{} {}", r.code, last).trim().to_string())
}

pub(crate) struct Conn {
    reader: BufReader<TcpStream>,
    writer: TcpStream,
    features: HashSet<String>,
    kind: Option<char>,
    pasv_first: bool,
}

impl Conn {
    fn connect(host: &str, port: u16) -> Result<Conn, ApiError> {
        let addrs: Vec<SocketAddr> = (host, port).to_socket_addrs().map_err(|e| ftp_err("ENOTFOUND", format!("Unknown host {host} ({e}).")))?.collect();
        let mut last = None;
        for a in addrs {
            match TcpStream::connect_timeout(&a, TIMEOUT) {
                Ok(s) => {
                    s.set_read_timeout(Some(TIMEOUT)).ok();
                    s.set_write_timeout(Some(TIMEOUT)).ok();
                    let writer = s.try_clone().map_err(io_err)?;
                    return Ok(Conn { reader: BufReader::new(s), writer, features: HashSet::new(), kind: None, pasv_first: a.is_ipv4() });
                }
                Err(e) => last = Some(e),
            }
        }
        Err(ftp_err("ECONNREFUSED", format!("Could not connect to {host}:{port} ({}).", last.map(|e| e.to_string()).unwrap_or_else(|| "no address".into()))))
    }

    fn read_line(&mut self) -> Result<String, ApiError> {
        let mut buf = Vec::new();
        let n = self.reader.read_until(b'\n', &mut buf).map_err(io_err)?;
        if n == 0 {
            return Err(ftp_err("ECONNRESET", "The connection was closed."));
        }
        let s = String::from_utf8_lossy(&buf).into_owned();
        Ok(s.trim_end_matches(['\r', '\n']).to_string())
    }

    fn read_reply(&mut self) -> Result<Reply, ApiError> {
        loop {
            let first = self.read_line()?;
            let b = first.as_bytes();
            if b.len() < 3 || !b[..3].iter().all(|c| c.is_ascii_digit()) {
                continue; // stray text
            }
            let code: u16 = first[..3].parse().unwrap_or(0);
            let strip = |l: &str| -> String {
                if l.len() >= 3 && l.as_bytes()[..3].iter().all(|c| c.is_ascii_digit()) {
                    l[3..].trim_start_matches(['-', ' ']).to_string()
                } else {
                    l.to_string()
                }
            };
            let mut lines = vec![strip(&first)];
            if b.get(3) == Some(&b'-') {
                let end = format!("{code} ");
                loop {
                    let l = self.read_line()?;
                    let done = l.starts_with(&end) || l == format!("{code}");
                    lines.push(strip(&l));
                    if done {
                        break;
                    }
                }
            }
            return Ok(Reply { code, text: lines.join("\n") });
        }
    }

    fn send(&mut self, line: &str) -> Result<Reply, ApiError> {
        if line.contains('\r') || line.contains('\n') {
            return Err(ftp_err("EINVAL", "Line breaks are not allowed in FTP names."));
        }
        self.writer.write_all(format!("{line}\r\n").as_bytes()).map_err(io_err)?;
        self.read_reply()
    }

    /// A reply of 400 or more is an error.
    fn cmd(&mut self, line: &str) -> Result<Reply, ApiError> {
        let r = self.send(line)?;
        if r.code >= 400 {
            return Err(reply_err(&r));
        }
        Ok(r)
    }

    fn login(&mut self, user: &str, password: &str) -> Result<(), ApiError> {
        let hello = self.read_reply()?;
        if hello.code != 220 {
            return Err(reply_err(&hello));
        }
        let mut r = self.send(&format!("USER {user}"))?;
        if r.code == 331 || r.code == 332 {
            r = self.send(&format!("PASS {password}"))?;
        }
        if r.code != 230 && r.code != 202 {
            return Err(ftp_err("EACCES", format!("Login failed: {} {}", r.code, r.text.lines().last().unwrap_or(""))));
        }
        if let Ok(f) = self.send("FEAT") {
            if f.code == 211 {
                for l in f.text.lines().skip(1) {
                    if let Some(k) = l.split_whitespace().next() {
                        self.features.insert(k.to_uppercase());
                    }
                }
            }
        }
        if self.features.contains("UTF8") {
            let _ = self.send("OPTS UTF8 ON");
        }
        Ok(())
    }

    fn set_type(&mut self, mode: &str) -> Result<(), ApiError> {
        let t = if mode == "ascii" { 'A' } else { 'I' };
        if self.kind != Some(t) {
            self.cmd(&format!("TYPE {t}"))?;
            self.kind = Some(t);
        }
        Ok(())
    }

    fn pwd(&mut self) -> Result<String, ApiError> {
        let r = self.cmd("PWD")?;
        Ok(parse_257(&r.text).unwrap_or_else(|| "/".into()))
    }

    fn passive(&mut self) -> Result<SocketAddr, ApiError> {
        let peer = self.writer.peer_addr().map_err(io_err)?;
        let order = if self.pasv_first { ["PASV", "EPSV"] } else { ["EPSV", "PASV"] };
        let mut last: Option<Reply> = None;
        for how in order {
            let r = self.send(how)?;
            if how == "PASV" && r.code == 227 {
                if let Some((ip, port)) = parse_pasv(&r.text) {
                    let peer_ip = match peer.ip() {
                        IpAddr::V6(v6) => v6.to_ipv4_mapped().map(IpAddr::V4).unwrap_or(peer.ip()),
                        v4 => v4,
                    };
                    // Servers behind NAT announce an address the client cannot reach: use the control peer's.
                    let use_peer = ip.is_unspecified() || (is_private(&ip) && !is_private_ip(&peer_ip) && peer_ip.is_ipv4());
                    self.pasv_first = true;
                    return Ok(SocketAddr::new(if use_peer { peer_ip } else { IpAddr::V4(ip) }, port));
                }
            }
            if how == "EPSV" && r.code == 229 {
                if let Some(port) = parse_epsv(&r.text) {
                    self.pasv_first = false;
                    return Ok(SocketAddr::new(peer.ip(), port));
                }
            }
            last = Some(r);
        }
        Err(last.map(|r| reply_err(&r)).unwrap_or_else(|| ftp_err("EFTP", "Passive mode failed.")))
    }

    fn transfer(&mut self, command: &str, upload: Option<&[u8]>) -> Result<Vec<u8>, ApiError> {
        let addr = self.passive()?;
        let mut data = TcpStream::connect_timeout(&addr, TIMEOUT).map_err(|e| ftp_err("ECONNREFUSED", format!("Data connection failed ({e}).")))?;
        data.set_read_timeout(Some(DATA_TIMEOUT)).ok();
        data.set_write_timeout(Some(DATA_TIMEOUT)).ok();
        let first = self.send(command)?;
        if first.code >= 400 {
            return Err(reply_err(&first));
        }
        let mut body = Vec::new();
        let moved: Result<(), std::io::Error> = (|| {
            if let Some(bytes) = upload {
                data.write_all(bytes)?;
                data.shutdown(Shutdown::Write)?;
                let mut sink = Vec::new();
                let _ = data.read_to_end(&mut sink);
            } else {
                data.read_to_end(&mut body)?;
            }
            Ok(())
        })();
        drop(data);
        let fin = if first.code < 200 { self.read_reply()? } else { first };
        if fin.code >= 400 {
            return Err(reply_err(&fin));
        }
        moved.map_err(|e| ftp_err("EIO", format!("Transfer failed: {e}")))?;
        Ok(body)
    }

    fn list(&mut self, path: &str) -> Result<Vec<Value>, ApiError> {
        self.set_type("ascii")?;
        let arg = if path.is_empty() { String::new() } else { format!(" {path}") };
        let mlsd = self.features.contains("MLST");
        let body = self.transfer(&format!("{}{arg}", if mlsd { "MLSD" } else { "LIST" }), None)?;
        let text = String::from_utf8_lossy(&body);
        let now = now_ms();
        Ok(text
            .lines()
            .filter_map(|l| if mlsd { parse_mlsd_line(l) } else { parse_list_line(l, now) })
            .map(|e| json!({ "name": e.name, "isDir": e.is_dir, "size": e.size, "mtimeMs": e.mtime_ms }))
            .collect())
    }

    fn quit(&mut self) {
        self.writer.set_read_timeout(Some(Duration::from_secs(2))).ok();
        let _ = self.send("QUIT");
        let _ = self.writer.shutdown(Shutdown::Both);
    }
}

// ── Parsers ─────────────────────────────────────────────────

#[derive(Debug, PartialEq)]
pub(crate) struct Entry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime_ms: Option<i64>,
}

fn is_private(ip: &std::net::Ipv4Addr) -> bool {
    ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.octets()[0] == 0
}

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private(v4),
        IpAddr::V6(v6) => v6.is_loopback(),
    }
}

pub(crate) fn parse_257(text: &str) -> Option<String> {
    let start = text.find('"')? + 1;
    let b = text.as_bytes();
    let mut out = String::new();
    let mut i = start;
    while i < b.len() {
        if b[i] == b'"' {
            if b.get(i + 1) == Some(&b'"') {
                out.push('"');
                i += 2;
                continue;
            }
            return Some(out);
        }
        let ch = text[i..].chars().next()?;
        out.push(ch);
        i += ch.len_utf8();
    }
    None
}

fn parse_pasv(text: &str) -> Option<(std::net::Ipv4Addr, u16)> {
    // the six numbers h1,h2,h3,h4,p1,p2 anywhere in the text
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() && (i == 0 || !bytes[i - 1].is_ascii_digit()) {
            let rest = &text[i..];
            let end = rest.find(|c: char| !(c.is_ascii_digit() || c == ',')).unwrap_or(rest.len());
            let nums: Vec<u32> = rest[..end].split(',').filter_map(|s| s.parse().ok()).collect();
            if nums.len() >= 6 && nums[..6].iter().all(|&n| n < 256) {
                let ip = std::net::Ipv4Addr::new(nums[0] as u8, nums[1] as u8, nums[2] as u8, nums[3] as u8);
                return Some((ip, (nums[4] * 256 + nums[5]) as u16));
            }
            i += end.max(1);
        } else {
            i += 1;
        }
    }
    None
}

fn parse_epsv(text: &str) -> Option<u16> {
    let open = text.find('(')?;
    let inner = &text[open + 1..];
    let close = inner.find(')')?;
    let inner = &inner[..close];
    let d = inner.chars().next()?;
    let parts: Vec<&str> = inner.split(d).collect();
    // "|||port|" → ["", "", "", "port", ""]
    parts.get(3)?.parse().ok()
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn year_of_ms(ms: i64) -> i64 {
    // civil_from_days, year only
    let z = ms.div_euclid(86_400_000) + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    yoe + era * 400 + if m <= 2 { 1 } else { 0 }
}

fn utc_ms(y: i64, mo: i64, d: i64, h: i64, mi: i64, s: i64) -> i64 {
    ((days_from_civil(y, mo, d) * 24 + h) * 60 + mi) * 60_000 + s * 1000
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn month(s: &str) -> Option<i64> {
    const M: [&str; 12] = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    M.iter().position(|m| m.eq_ignore_ascii_case(s)).map(|i| i as i64 + 1)
}

/// "type=file;size=7;modify=20240102030405; name" (cdir / pdir are skipped).
pub(crate) fn parse_mlsd_line(line: &str) -> Option<Entry> {
    let line = line.trim_end_matches('\r');
    let sp = line.find(' ')?;
    let mut facts: HashMap<String, String> = HashMap::new();
    for f in line[..sp].split(';') {
        if let Some(eq) = f.find('=') {
            facts.insert(f[..eq].to_lowercase(), f[eq + 1..].to_string());
        }
    }
    let name = &line[sp + 1..];
    let kind = facts.get("type").map(|s| s.to_lowercase()).unwrap_or_default();
    if name.is_empty() || kind == "cdir" || kind == "pdir" {
        return None;
    }
    let is_dir = kind == "dir";
    let mtime_ms = facts.get("modify").and_then(|m| {
        let d = m.as_bytes();
        if d.len() < 14 || !d[..14].iter().all(|c| c.is_ascii_digit()) {
            return None;
        }
        let n = |a: usize, b: usize| m[a..b].parse::<i64>().unwrap_or(0);
        let frac = m.get(15..).map(|f| format!("0.{f}").parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0);
        Some(utc_ms(n(0, 4), n(4, 6), n(6, 8), n(8, 10), n(10, 12), n(12, 14)) + (frac * 1000.0).round() as i64)
    });
    let size = if is_dir { 0 } else { facts.get("size").and_then(|s| s.parse().ok()).unwrap_or(0) };
    Some(Entry { name: name.to_string(), is_dir, size, mtime_ms })
}

/// One LIST line: Unix "ls -l" or Windows/IIS ("01-15-24  01:30PM  <DIR>  name").
/// The times are taken as UTC (the listing does not say the server's zone).
pub(crate) fn parse_list_line(line: &str, now_ms: i64) -> Option<Entry> {
    let line = line.trim_end_matches('\r');
    if line.trim().is_empty() || line.to_lowercase().starts_with("total ") {
        return None;
    }
    let toks: Vec<(usize, &str)> = {
        let mut v = Vec::new();
        let mut start = None;
        for (i, c) in line.char_indices() {
            if c.is_whitespace() {
                if let Some(s) = start.take() {
                    v.push((s, &line[s..i]));
                }
            } else if start.is_none() {
                start = Some(i);
            }
        }
        if let Some(s) = start {
            v.push((s, &line[s..]));
        }
        v
    };
    let first = toks.first()?.1;
    // Unix: a permission string, then … size month day time|year name
    if first.len() >= 10 && b"-dlbcps".contains(&first.as_bytes()[0]) {
        for k in 2..toks.len().saturating_sub(2) {
            let Some(mo) = month(toks[k].1) else { continue };
            let Ok(size) = toks[k - 1].1.parse::<u64>() else { continue };
            let Ok(day) = toks[k + 1].1.parse::<i64>() else { continue };
            let tm = toks[k + 2].1;
            let mtime = if let Some((h, m)) = tm.split_once(':') {
                let (h, m) = (h.parse::<i64>().ok()?, m.parse::<i64>().ok()?);
                let mut y = year_of_ms(now_ms);
                if utc_ms(y, mo, day, h, m, 0) > now_ms + 86_400_000 {
                    y -= 1;
                }
                utc_ms(y, mo, day, h, m, 0)
            } else {
                utc_ms(tm.parse::<i64>().ok()?, mo, day, 0, 0, 0)
            };
            let name_start = toks[k + 2].0 + tm.len() + 1;
            let mut name = line.get(name_start..).unwrap_or("").to_string();
            if first.starts_with('l') {
                if let Some(i) = name.find(" -> ") {
                    name.truncate(i);
                }
            }
            if name.is_empty() || name == "." || name == ".." {
                return None;
            }
            let is_dir = first.starts_with('d');
            return Some(Entry { name, is_dir, size: if is_dir { 0 } else { size }, mtime_ms: Some(mtime) });
        }
        return None;
    }
    // Windows / IIS
    if toks.len() >= 4 {
        let date: Vec<&str> = toks[0].1.split('-').collect();
        if date.len() == 3 && date.iter().all(|p| p.chars().all(|c| c.is_ascii_digit())) {
            let (mo, d) = (date[0].parse::<i64>().ok()?, date[1].parse::<i64>().ok()?);
            let mut y = date[2].parse::<i64>().ok()?;
            if date[2].len() == 2 {
                y += if y < 70 { 2000 } else { 1900 };
            }
            let mut idx = 1;
            let mut t = toks[1].1.to_uppercase();
            if toks.get(2).map(|x| x.1.eq_ignore_ascii_case("AM") || x.1.eq_ignore_ascii_case("PM")).unwrap_or(false) {
                t.push_str(&toks[2].1.to_uppercase());
                idx = 2;
            }
            let pm = t.ends_with("PM");
            let am = t.ends_with("AM");
            let hm = t.trim_end_matches("AM").trim_end_matches("PM");
            let (h, m) = hm.split_once(':')?;
            let (mut h, m) = (h.parse::<i64>().ok()?, m.parse::<i64>().ok()?);
            if pm && h != 12 {
                h += 12;
            } else if am && h == 12 {
                h = 0;
            }
            let size_tok = toks.get(idx + 1)?;
            let is_dir = size_tok.1.eq_ignore_ascii_case("<DIR>");
            let size = if is_dir { 0 } else { size_tok.1.parse::<u64>().ok()? };
            let name_at = toks.get(idx + 2)?.0;
            let name = line[name_at..].to_string();
            if name == "." || name == ".." {
                return None;
            }
            return Some(Entry { name, is_dir, size, mtime_ms: Some(utc_ms(y, mo, d, h, m, 0)) });
        }
    }
    None
}

// ── Sessions ────────────────────────────────────────────────

struct Session {
    conn: Mutex<Conn>,
    last: Mutex<Instant>,
}

fn sessions() -> &'static Mutex<HashMap<String, Arc<Session>>> {
    static S: OnceLock<Mutex<HashMap<String, Arc<Session>>>> = OnceLock::new();
    S.get_or_init(|| {
        // the idle reaper
        std::thread::spawn(|| loop {
            std::thread::sleep(Duration::from_secs(30));
            let idle: Vec<(String, Arc<Session>)> = {
                let map = sessions().lock().unwrap_or_else(|e| e.into_inner());
                map.iter().filter(|(_, s)| s.last.lock().map(|t| t.elapsed() > IDLE).unwrap_or(false)).map(|(k, s)| (k.clone(), s.clone())).collect()
            };
            for (id, s) in idle {
                if let Ok(mut c) = s.conn.try_lock() {
                    sessions().lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
                    c.quit();
                }
            }
        });
        Mutex::new(HashMap::new())
    })
}

fn session(args: &Value) -> Result<Arc<Session>, ApiError> {
    let id = args.get("session").map(|v| v.as_str().map(|s| s.to_string()).unwrap_or_else(|| v.to_string())).unwrap_or_default();
    let s = sessions().lock().unwrap_or_else(|e| e.into_inner()).get(&id).cloned().ok_or_else(|| ftp_err("ENOENT", "The FTP session is closed or timed out."))?;
    *s.last.lock().unwrap_or_else(|e| e.into_inner()) = Instant::now();
    Ok(s)
}

fn arg<'a>(args: &'a Value, key: &str) -> Result<&'a str, ApiError> {
    match args.get(key).and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => Ok(s),
        _ => Err(ftp_err("EINVAL", format!("Missing \"{key}\"."))),
    }
}

/// Runs f on the session's connection; a dropped connection ends the session.
fn with_conn(args: &Value, f: impl FnOnce(&mut Conn) -> ApiResult) -> ApiResult {
    let s = session(args)?;
    let mut c = s.conn.lock().unwrap_or_else(|e| e.into_inner());
    let r = f(&mut c);
    if let Err(e) = &r {
        if e.code == "ECONNRESET" || e.code == "ETIMEDOUT" {
            let id = args.get("session").and_then(|v| v.as_str()).unwrap_or("").to_string();
            sessions().lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
        }
    }
    r
}

/// POST /api/ftp/<op>
pub(crate) fn call(op: &str, args: &Value) -> ApiResult {
    match op {
        "open" => {
            let host = arg(args, "host")?;
            let port = args.get("port").and_then(|v| v.as_u64()).filter(|p| *p > 0 && *p < 65536).unwrap_or(21) as u16;
            let user = args.get("user").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).unwrap_or("anonymous");
            let password = args.get("password").and_then(|v| v.as_str()).unwrap_or("");
            if sessions().lock().unwrap_or_else(|e| e.into_inner()).len() >= MAX_SESSIONS {
                return Err(ftp_err("EMFILE", "Too many open FTP sessions."));
            }
            let mut conn = Conn::connect(host, port)?;
            let ready = conn.login(user, password).and_then(|_| conn.set_type("binary"));
            if let Err(e) = ready {
                let _ = conn.writer.shutdown(Shutdown::Both);
                return Err(e);
            }
            let path = conn.pwd().unwrap_or_else(|_| "/".into());
            let id = random_token();
            sessions().lock().unwrap_or_else(|e| e.into_inner()).insert(id.clone(), Arc::new(Session { conn: Mutex::new(conn), last: Mutex::new(Instant::now()) }));
            Ok(json!({ "session": id, "path": path }))
        }
        "close" => {
            let id = args.get("session").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let s = sessions().lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
            if let Some(s) = s {
                s.conn.lock().unwrap_or_else(|e| e.into_inner()).quit();
            }
            Ok(json!({ "ok": true }))
        }
        "pwd" => with_conn(args, |c| Ok(json!({ "path": c.pwd()? }))),
        "cd" => {
            let p = arg(args, "path")?;
            with_conn(args, |c| {
                c.cmd(&format!("CWD {p}"))?;
                Ok(json!({ "path": c.pwd()? }))
            })
        }
        "list" => {
            let p = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            with_conn(args, |c| Ok(json!({ "entries": c.list(p)? })))
        }
        "get" => {
            let p = arg(args, "path")?;
            let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("binary");
            with_conn(args, |c| {
                c.set_type(mode)?;
                let body = c.transfer(&format!("RETR {p}"), None)?;
                Ok(json!({ "bodyBase64": STANDARD.encode(body) }))
            })
        }
        "put" => {
            let p = arg(args, "path")?;
            let mode = args.get("mode").and_then(|v| v.as_str()).unwrap_or("binary");
            let body = STANDARD.decode(args.get("bodyBase64").and_then(|v| v.as_str()).unwrap_or("")).map_err(|e| ftp_err("EINVAL", e.to_string()))?;
            with_conn(args, |c| {
                c.set_type(mode)?;
                c.transfer(&format!("STOR {p}"), Some(&body))?;
                Ok(json!({ "ok": true }))
            })
        }
        "delete" | "mkdir" | "rmdir" => {
            let p = arg(args, "path")?;
            let verb = match op { "delete" => "DELE", "mkdir" => "MKD", _ => "RMD" };
            with_conn(args, |c| {
                c.cmd(&format!("{verb} {p}"))?;
                Ok(json!({ "ok": true }))
            })
        }
        "rename" => {
            let from = arg(args, "from")?;
            let to = arg(args, "to")?;
            with_conn(args, |c| {
                let r = c.send(&format!("RNFR {from}"))?;
                if r.code != 350 {
                    return Err(reply_err(&r));
                }
                c.cmd(&format!("RNTO {to}"))?;
                Ok(json!({ "ok": true }))
            })
        }
        _ => Err(ftp_err("ENOENT", format!("Unknown call ftp/{op}."))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn parsers() {
        let now = utc_ms(2024, 6, 15, 12, 0, 0);
        assert_eq!(year_of_ms(now), 2024);
        assert_eq!(year_of_ms(utc_ms(2000, 2, 29, 0, 0, 0)), 2000);
        let u = parse_list_line("-rw-r--r--   1 owner    group      1234 Mar  5 09:07 my file.txt", now).unwrap();
        assert_eq!(u, Entry { name: "my file.txt".into(), is_dir: false, size: 1234, mtime_ms: Some(utc_ms(2024, 3, 5, 9, 7, 0)) });
        assert_eq!(parse_list_line("-rw-r--r-- 1 a b 1 Dec 24 10:00 x", now).unwrap().mtime_ms, Some(utc_ms(2023, 12, 24, 10, 0, 0)));
        let d = parse_list_line("drwxr-xr-x  2 0 0 4096 Jan  2  2020 sub", now).unwrap();
        assert!(d.is_dir && d.size == 0 && d.mtime_ms == Some(utc_ms(2020, 1, 2, 0, 0, 0)));
        assert_eq!(parse_list_line("lrwxrwxrwx 1 a b 7 Jan  2  2020 link -> target", now).unwrap().name, "link");
        assert_eq!(parse_list_line("-rw-r--r-- 1 owner 55 Jan  2  2020 nogroup.txt", now).unwrap().size, 55);
        assert!(parse_list_line("total 12", now).is_none());
        let w = parse_list_line("01-15-24  01:30PM       <DIR>          Program Files", now).unwrap();
        assert_eq!(w, Entry { name: "Program Files".into(), is_dir: true, size: 0, mtime_ms: Some(utc_ms(2024, 1, 15, 13, 30, 0)) });
        let w2 = parse_list_line("12-31-2023  12:05AM             42 a.bin", now).unwrap();
        assert_eq!(w2, Entry { name: "a.bin".into(), is_dir: false, size: 42, mtime_ms: Some(utc_ms(2023, 12, 31, 0, 5, 0)) });
        assert_eq!(
            parse_mlsd_line("type=file;size=7;modify=20240102030405.5; a b.txt").unwrap(),
            Entry { name: "a b.txt".into(), is_dir: false, size: 7, mtime_ms: Some(utc_ms(2024, 1, 2, 3, 4, 5) + 500) }
        );
        assert!(parse_mlsd_line("Type=dir;Modify=20240102030405; sub").unwrap().is_dir);
        assert!(parse_mlsd_line("type=cdir; .").is_none());
        assert_eq!(parse_257("\"/a \"\"q\"\" b\" is current").as_deref(), Some("/a \"q\" b"));
        assert_eq!(parse_pasv("Entering Passive Mode (127,0,0,1,4,1)."), Some((std::net::Ipv4Addr::new(127, 0, 0, 1), 1025)));
        assert_eq!(parse_epsv("Entering Extended Passive Mode (|||6446|)"), Some(6446));
    }

    /// A one-connection mock FTP server (in-memory files, Unix LIST, PASV refused so EPSV is used).
    fn mock_server() -> u16 {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (ctl, _) = l.accept().unwrap();
            let mut w = ctl.try_clone().unwrap();
            let mut r = BufReader::new(ctl);
            let mut files: HashMap<String, Vec<u8>> = HashMap::new();
            let mut dirs: HashSet<String> = ["/".to_string()].into_iter().collect();
            let mut cwd = "/".to_string();
            let mut pasv: Option<TcpListener> = None;
            let mut rnfr: Option<String> = None;
            let abs = |cwd: &str, p: &str| if p.starts_with('/') { p.to_string() } else if cwd == "/" { format!("/{p}") } else { format!("{cwd}/{p}") };
            let say = |w: &mut TcpStream, s: &str| { let _ = w.write_all(format!("{s}\r\n").as_bytes()); };
            say(&mut w, "220 mock");
            loop {
                let mut line = String::new();
                if r.read_line(&mut line).unwrap_or(0) == 0 { return; }
                let line = line.trim_end().to_string();
                let (verb, a) = line.split_once(' ').map(|(v, a)| (v.to_uppercase(), a.to_string())).unwrap_or((line.to_uppercase(), String::new()));
                match verb.as_str() {
                    "USER" => say(&mut w, "331 pw"),
                    "PASS" => if a == "pw" { say(&mut w, "230 ok") } else { say(&mut w, "530 no") },
                    "FEAT" => { say(&mut w, "211-Features:"); say(&mut w, " EPSV"); say(&mut w, "211 End"); }
                    "TYPE" => say(&mut w, "200 ok"),
                    "PWD" => say(&mut w, &format!("257 \"{cwd}\" here")),
                    "CWD" => { let p = abs(&cwd, &a); if dirs.contains(&p) { cwd = p; say(&mut w, "250 ok") } else { say(&mut w, "550 no dir") } }
                    "PASV" => say(&mut w, "502 no"),
                    "EPSV" => { let pl = TcpListener::bind("127.0.0.1:0").unwrap(); say(&mut w, &format!("229 Extended (|||{}|)", pl.local_addr().unwrap().port())); pasv = Some(pl); }
                    "LIST" | "RETR" | "STOR" => {
                        let p = abs(&cwd, &a);
                        if verb == "RETR" && !files.contains_key(&p) { pasv = None; say(&mut w, "550 no file"); continue; }
                        let (mut d, _) = pasv.take().unwrap().accept().unwrap();
                        say(&mut w, "150 here");
                        match verb.as_str() {
                            "LIST" => {
                                let dir = if a.is_empty() { cwd.clone() } else { p };
                                let pre = if dir == "/" { "/".to_string() } else { format!("{dir}/") };
                                let mut out = String::new();
                                for dn in dirs.iter().filter(|x| x.starts_with(&pre) && x.len() > pre.len() && !x[pre.len()..].contains('/')) {
                                    out += &format!("drwxr-xr-x 2 o g 4096 Jan  2  2020 {}\r\n", &dn[pre.len()..]);
                                }
                                for (f, b) in files.iter().filter(|(x, _)| x.starts_with(&pre) && !x[pre.len()..].contains('/')) {
                                    out += &format!("-rw-r--r-- 1 o g {} Jan  2  2020 {}\r\n", b.len(), &f[pre.len()..]);
                                }
                                let _ = d.write_all(out.as_bytes());
                            }
                            "RETR" => { let _ = d.write_all(&files[&p]); }
                            _ => { let mut b = Vec::new(); let _ = d.read_to_end(&mut b); files.insert(p, b); }
                        }
                        drop(d);
                        say(&mut w, "226 done");
                    }
                    "DELE" => { let p = abs(&cwd, &a); if files.remove(&p).is_some() { say(&mut w, "250 ok") } else { say(&mut w, "550 no file") } }
                    "MKD" => { dirs.insert(abs(&cwd, &a)); say(&mut w, "257 made") }
                    "RMD" => { if dirs.remove(&abs(&cwd, &a)) { say(&mut w, "250 ok") } else { say(&mut w, "550 no dir") } }
                    "RNFR" => { let p = abs(&cwd, &a); if files.contains_key(&p) { rnfr = Some(p); say(&mut w, "350 go") } else { say(&mut w, "550 no file") } }
                    "RNTO" => { let from = rnfr.take().unwrap(); let b = files.remove(&from).unwrap(); files.insert(abs(&cwd, &a), b); say(&mut w, "250 ok") }
                    "QUIT" => { say(&mut w, "221 bye"); return; }
                    _ => say(&mut w, "502 ?"),
                }
            }
        });
        port
    }

    #[test]
    fn session_round_trip() {
        let port = mock_server();
        let open = call("open", &json!({ "host": "127.0.0.1", "port": port, "user": "u", "password": "pw" })).ok().unwrap();
        assert_eq!(open["path"], json!("/"));
        let s = open["session"].as_str().unwrap().to_string();
        call("mkdir", &json!({ "session": s, "path": "/up" })).ok().unwrap();
        assert_eq!(call("cd", &json!({ "session": s, "path": "/up" })).ok().unwrap()["path"], json!("/up"));
        let bytes: Vec<u8> = (0..70000u32).map(|i| (i * 7) as u8).collect();
        call("put", &json!({ "session": s, "path": "/up/data.bin", "bodyBase64": STANDARD.encode(&bytes), "mode": "binary" })).ok().unwrap();
        let got = call("get", &json!({ "session": s, "path": "/up/data.bin", "mode": "binary" })).ok().unwrap();
        assert_eq!(STANDARD.decode(got["bodyBase64"].as_str().unwrap()).unwrap(), bytes);
        let list = call("list", &json!({ "session": s, "path": "/up" })).ok().unwrap();
        assert_eq!(list["entries"][0]["name"], json!("data.bin"));
        assert_eq!(list["entries"][0]["size"], json!(70000));
        let root = call("list", &json!({ "session": s, "path": "/" })).ok().unwrap();
        assert_eq!(root["entries"][0]["isDir"], json!(true));
        call("rename", &json!({ "session": s, "from": "/up/data.bin", "to": "/up/b.bin" })).ok().unwrap();
        let missing = call("get", &json!({ "session": s, "path": "/up/data.bin" })).err().unwrap();
        assert_eq!(missing.code, "ENOENT");
        assert!(missing.message.contains("550"));
        call("delete", &json!({ "session": s, "path": "/up/b.bin" })).ok().unwrap();
        call("rmdir", &json!({ "session": s, "path": "/up" })).ok().unwrap();
        assert!(call("cd", &json!({ "session": s, "path": "/up" })).is_err());
        assert_eq!(call("pwd", &json!({ "session": s })).ok().unwrap()["path"], json!("/up"));
        call("close", &json!({ "session": s })).ok().unwrap();
        assert_eq!(call("pwd", &json!({ "session": s })).err().unwrap().code, "ENOENT");
    }

    #[test]
    fn login_failure() {
        let port = mock_server();
        let e = call("open", &json!({ "host": "127.0.0.1", "port": port, "user": "u", "password": "bad" })).err().unwrap();
        assert_eq!(e.code, "EACCES");
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let closed = l.local_addr().unwrap().port();
        drop(l);
        assert_eq!(call("open", &json!({ "host": "127.0.0.1", "port": closed })).err().unwrap().code, "ECONNREFUSED");
    }
}
