// The desktop file-system API (core/CONTRACT.md §6): the same calls as
// server/fs-api.js, served on 127.0.0.1 with a bearer token. The engine's Web
// Worker calls it with synchronous XMLHttpRequest; the GUI with fetch.
//
//   POST /api/fs/<op>        JSON { path, ... } → { ok: true, data } | { ok: false, error: { code, message } }
//   POST /api/host/info      platform, start folder, temp folder, system() available
//   POST /api/settings/get   stored GUI settings ({} when none)
//   POST /api/settings/set   { settings } replaces them
//
// Paths are real absolute paths with "/" separators (no jail on the desktop).
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Map, Value};
use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tiny_http::{Header, Method, Request, Response, Server};

pub struct HostServer {
    pub port: u16,
    pub token: String,
    pub start: String,
}

struct Ctx {
    token: String,
    config_dir: PathBuf,
    start: String,
    version: String,
}

struct ApiError {
    code: String,
    message: String,
}

impl ApiError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        ApiError { code: code.to_string(), message: message.into() }
    }
}

type ApiResult = Result<Value, ApiError>;

pub fn slash(p: &Path) -> String {
    let mut s = p.to_string_lossy().replace('\\', "/");
    // No trailing "/" except for a root ("/", "C:/").
    while s.len() > 1 && s.ends_with('/') && !(s.len() == 3 && s.as_bytes()[1] == b':') {
        s.pop();
    }
    if let Some(rest) = s.strip_prefix("//?/UNC/") {
        return format!("//{rest}");
    }
    s.strip_prefix("//?/").map(|r| r.to_string()).unwrap_or(s)
}

pub fn platform_name() -> &'static str {
    if cfg!(windows) { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" }
}

pub fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

/// Documents/MySimulationMath (created on first use), or the home folder.
pub fn default_start_dir() -> PathBuf {
    let home = home_dir();
    let docs = home.join("Documents");
    let base = if docs.is_dir() { docs } else { home.clone() };
    let dir = base.join("MySimulationMath");
    if fs::create_dir_all(&dir).is_ok() { dir } else { home }
}

fn random_token() -> String {
    let mut out = String::new();
    for salt in 0..2u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(salt);
        h.write_u128(std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        h.write_u32(std::process::id());
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

fn io_err(e: std::io::Error, path: &str) -> ApiError {
    let (code, what) = match e.kind() {
        ErrorKind::NotFound => ("ENOENT", "No such file or folder."),
        ErrorKind::PermissionDenied => ("EACCES", "Permission denied."),
        ErrorKind::AlreadyExists => ("EEXIST", "Already exists."),
        ErrorKind::DirectoryNotEmpty => ("ENOTEMPTY", "Folder is not empty."),
        ErrorKind::IsADirectory => ("EISDIR", "Is a folder."),
        ErrorKind::NotADirectory => ("ENOTDIR", "Not a folder."),
        _ => ("EIO", ""),
    };
    let msg = if what.is_empty() { e.to_string() } else { what.to_string() };
    ApiError::new(code, if path.is_empty() { msg } else { format!("{msg} ({path})") })
}

fn arg_str<'a>(args: &'a Value, key: &str) -> Result<&'a str, ApiError> {
    match args.get(key).and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => Ok(s),
        _ => Err(ApiError::new("EINVAL", format!("Missing \"{key}\"."))),
    }
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn stat_value(meta: &fs::Metadata) -> Value {
    json!({ "isDir": meta.is_dir(), "size": if meta.is_dir() { 0 } else { meta.len() }, "mtimeMs": mtime_ms(meta) })
}

fn ensure_parent(p: &Path) {
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
}

fn copy_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    let meta = fs::metadata(from)?;
    if meta.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        ensure_parent(to);
        fs::copy(from, to).map(|_| ())
    }
}

fn run_system(command: &str, cwd: Option<&str>) -> ApiResult {
    let mut cmd = if cfg!(windows) {
        let shell = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into());
        let mut c = Command::new(shell);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // UTF-8 console output for programs that honour the code page.
            c.raw_arg(format!("/d /s /c \"chcp 65001>nul & {command}\""));
            c.creation_flags(0x08000000);
        }
        c
    } else {
        let mut c = Command::new("/bin/sh");
        c.arg("-c").arg(command);
        c
    };
    if let Some(dir) = cwd {
        if Path::new(dir).is_dir() {
            cmd.current_dir(dir);
        }
    }
    let out = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).output().map_err(|e| io_err(e, ""))?;
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    Ok(json!({ "status": out.status.code().unwrap_or(-1), "output": text }))
}

fn call(ctx: &Ctx, name: &str, args: &Value) -> ApiResult {
    match name {
        "host/info" => Ok(json!({
            "platform": platform_name(), "jail": false, "start": ctx.start, "home": slash(&home_dir()),
            "temp": slash(&std::env::temp_dir()), "system": true, "version": ctx.version, "root": ctx.start,
        })),
        "settings/get" => {
            let file = ctx.config_dir.join("settings.json");
            Ok(fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).filter(|v| v.is_object()).unwrap_or_else(|| Value::Object(Map::new())))
        }
        "settings/set" => {
            let settings = args.get("settings").filter(|v| v.is_object()).ok_or_else(|| ApiError::new("EINVAL", "settings must be an object."))?;
            fs::create_dir_all(&ctx.config_dir).map_err(|e| io_err(e, ""))?;
            let file = ctx.config_dir.join("settings.json");
            let tmp = ctx.config_dir.join("settings.json.tmp");
            fs::write(&tmp, serde_json::to_string_pretty(settings).unwrap_or_else(|_| "{}".into())).map_err(|e| io_err(e, ""))?;
            fs::rename(&tmp, &file).map_err(|e| io_err(e, ""))?;
            Ok(Value::Bool(true))
        }
        "fs/readText" => {
            let p = arg_str(args, "path")?;
            let bytes = fs::read(p).map_err(|e| io_err(e, p))?;
            Ok(Value::String(String::from_utf8_lossy(&bytes).into_owned()))
        }
        "fs/writeText" | "fs/appendText" => {
            let p = arg_str(args, "path")?;
            let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("");
            ensure_parent(Path::new(p));
            if name == "fs/writeText" {
                fs::write(p, text).map_err(|e| io_err(e, p))?;
            } else {
                let mut f = fs::OpenOptions::new().create(true).append(true).open(p).map_err(|e| io_err(e, p))?;
                f.write_all(text.as_bytes()).map_err(|e| io_err(e, p))?;
            }
            Ok(Value::Bool(true))
        }
        "fs/readBytes" => {
            let p = arg_str(args, "path")?;
            let bytes = fs::read(p).map_err(|e| io_err(e, p))?;
            Ok(json!({ "base64": STANDARD.encode(bytes) }))
        }
        "fs/writeBytes" => {
            let p = arg_str(args, "path")?;
            let data = STANDARD.decode(args.get("base64").and_then(|v| v.as_str()).unwrap_or("")).map_err(|e| ApiError::new("EINVAL", e.to_string()))?;
            ensure_parent(Path::new(p));
            fs::write(p, data).map_err(|e| io_err(e, p))?;
            Ok(Value::Bool(true))
        }
        "fs/exists" => Ok(Value::Bool(args.get("path").and_then(|v| v.as_str()).map(|p| !p.is_empty() && Path::new(p).exists()).unwrap_or(false))),
        "fs/stat" => {
            let p = arg_str(args, "path")?;
            let meta = fs::metadata(p).map_err(|e| io_err(e, p))?;
            Ok(stat_value(&meta))
        }
        "fs/list" => {
            let p = arg_str(args, "path")?;
            let mut items: Vec<(String, Value)> = Vec::new();
            for entry in fs::read_dir(p).map_err(|e| io_err(e, p))?.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if let Ok(meta) = fs::metadata(entry.path()) {
                    let mut v = stat_value(&meta);
                    v["name"] = Value::String(name.clone());
                    items.push((name, v));
                }
            }
            items.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()).then(a.0.cmp(&b.0)));
            Ok(Value::Array(items.into_iter().map(|(_, v)| v).collect()))
        }
        "fs/mkdir" => {
            let p = arg_str(args, "path")?;
            fs::create_dir_all(p).map_err(|e| io_err(e, p))?;
            Ok(Value::Bool(true))
        }
        "fs/remove" => {
            let p = arg_str(args, "path")?;
            let recursive = args.get("recursive").and_then(|v| v.as_bool()).unwrap_or(false);
            let meta = fs::metadata(p).map_err(|e| io_err(e, p))?;
            if meta.is_dir() {
                if recursive { fs::remove_dir_all(p) } else { fs::remove_dir(p) }.map_err(|e| io_err(e, p))?;
            } else {
                fs::remove_file(p).map_err(|e| io_err(e, p))?;
            }
            Ok(Value::Bool(true))
        }
        "fs/rename" => {
            let from = arg_str(args, "from")?;
            let to = arg_str(args, "to")?;
            ensure_parent(Path::new(to));
            fs::rename(from, to).map_err(|e| io_err(e, from))?;
            Ok(Value::Bool(true))
        }
        "fs/copy" => {
            let from = arg_str(args, "from")?;
            let to = arg_str(args, "to")?;
            copy_recursive(Path::new(from), Path::new(to)).map_err(|e| io_err(e, from))?;
            Ok(Value::Bool(true))
        }
        "fs/tempDir" => Ok(Value::String(slash(&std::env::temp_dir()))),
        "fs/homeDir" => Ok(Value::String(slash(&home_dir()))),
        "fs/system" => {
            let command = arg_str(args, "command")?;
            run_system(command, args.get("cwd").and_then(|v| v.as_str()))
        }
        _ => Err(ApiError::new("ENOENT", format!("Unknown call {name}."))),
    }
}

fn header(name: &str, value: &str) -> Option<Header> {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).ok()
}

fn handle(ctx: &Ctx, mut req: Request) {
    let origin = req.headers().iter().find(|h| h.field.equiv("Origin")).map(|h| h.value.as_str().to_string());
    let auth = req.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().to_string());
    let mut headers: Vec<Header> = Vec::new();
    headers.extend(header("Content-Type", "application/json; charset=utf-8"));
    headers.extend(header("Cache-Control", "no-store"));
    headers.extend(header("Cross-Origin-Resource-Policy", "cross-origin"));
    // The token is the protection; any page origin of this app (tauri://localhost,
    // http://tauri.localhost, the dev server) may call.
    headers.extend(header("Access-Control-Allow-Origin", origin.as_deref().unwrap_or("*")));
    headers.extend(header("Vary", "Origin"));
    let respond = |req: Request, status: u16, body: String, headers: Vec<Header>| {
        let mut res = Response::from_string(body).with_status_code(status);
        for h in headers {
            res.add_header(h);
        }
        let _ = req.respond(res);
    };
    if *req.method() == Method::Options {
        headers.extend(header("Access-Control-Allow-Headers", "content-type, authorization"));
        headers.extend(header("Access-Control-Allow-Methods", "POST, OPTIONS"));
        headers.extend(header("Access-Control-Allow-Private-Network", "true"));
        headers.extend(header("Access-Control-Max-Age", "600"));
        respond(req, 204, String::new(), headers);
        return;
    }
    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("").to_string();
    let Some(name) = path.strip_prefix("/api/") else {
        respond(req, 404, json!({ "ok": false, "error": { "code": "ENOENT", "message": "Not found." } }).to_string(), headers);
        return;
    };
    let name = name.to_string();
    if auth.as_deref() != Some(&format!("Bearer {}", ctx.token)) {
        respond(req, 401, json!({ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "Missing or wrong token." } }).to_string(), headers);
        return;
    }
    if *req.method() != Method::Post {
        respond(req, 405, json!({ "ok": false, "error": { "code": "EINVAL", "message": "Use POST." } }).to_string(), headers);
        return;
    }
    let mut body = String::new();
    if let Err(e) = req.as_reader().read_to_string(&mut body) {
        respond(req, 200, json!({ "ok": false, "error": { "code": "EIO", "message": e.to_string() } }).to_string(), headers);
        return;
    }
    let args: Value = if body.trim().is_empty() { json!({}) } else { serde_json::from_str(&body).unwrap_or_else(|_| json!({})) };
    let out = match call(ctx, &name, &args) {
        Ok(data) => json!({ "ok": true, "data": data }),
        Err(e) => json!({ "ok": false, "error": { "code": e.code, "message": e.message } }),
    };
    respond(req, 200, out.to_string(), headers);
}

/// Starts the API on a free 127.0.0.1 port; requests are served on threads.
pub fn start(config_dir: PathBuf, version: &str) -> Result<HostServer, String> {
    let server = Server::http("127.0.0.1:0").map_err(|e| format!("Could not start the file service: {e}"))?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("The file service has no port")?;
    let token = random_token();
    let start = slash(&default_start_dir());
    let ctx = Arc::new(Ctx { token: token.clone(), config_dir, start: start.clone(), version: version.to_string() });
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            let ctx = Arc::clone(&ctx);
            std::thread::spawn(move || handle(&ctx, req));
        }
    });
    Ok(HostServer { port, token, start })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> Ctx {
        let dir = std::env::temp_dir().join(format!("msm-host-test-{}", std::process::id()));
        Ctx { token: "t".into(), config_dir: dir.clone(), start: slash(&dir), version: "1.0.0".into() }
    }

    #[test]
    fn round_trip() {
        let c = ctx();
        let dir = c.config_dir.join("files");
        let f = slash(&dir.join("a.txt"));
        call(&c, "fs/writeText", &json!({ "path": f, "text": "hello" })).ok().unwrap();
        assert_eq!(call(&c, "fs/readText", &json!({ "path": f })).ok().unwrap(), json!("hello"));
        call(&c, "fs/appendText", &json!({ "path": f, "text": "!" })).ok().unwrap();
        let b = call(&c, "fs/readBytes", &json!({ "path": f })).ok().unwrap();
        assert_eq!(b["base64"], json!(STANDARD.encode("hello!")));
        let list = call(&c, "fs/list", &json!({ "path": slash(&dir) })).ok().unwrap();
        assert_eq!(list[0]["name"], json!("a.txt"));
        assert_eq!(list[0]["size"], json!(6));
        let g = slash(&dir.join("sub/b.txt"));
        call(&c, "fs/rename", &json!({ "from": f, "to": g })).ok().unwrap();
        assert_eq!(call(&c, "fs/exists", &json!({ "path": f })).ok().unwrap(), json!(false));
        let missing = call(&c, "fs/readText", &json!({ "path": f })).err().unwrap();
        assert_eq!(missing.code, "ENOENT");
        call(&c, "settings/set", &json!({ "settings": { "theme": "midnight" } })).ok().unwrap();
        assert_eq!(call(&c, "settings/get", &json!({})).ok().unwrap()["theme"], json!("midnight"));
        call(&c, "fs/remove", &json!({ "path": slash(&c.config_dir), "recursive": true })).ok().unwrap();
    }
}
