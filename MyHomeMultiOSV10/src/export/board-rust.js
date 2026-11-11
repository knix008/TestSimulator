// The Rust board server written next to a published site. Cargo.toml depends on the one database
// driver for the kind chosen in Settings › Database. The HTTP API matches server.js.

const RUST_DRIVER = {
  sqlite: { crate: 'rusqlite', line: 'rusqlite = { version = "0.32", features = ["bundled"] }' },
  mysql: { crate: 'mysql', line: 'mysql = "25"' },
  mariadb: { crate: 'mysql', line: 'mysql = "25"' },
  postgres: { crate: 'postgres', line: 'postgres = "0.19"' },
  mssql: { crate: 'tiberius', line: 'tiberius = { version = "0.12", default-features = false, features = ["tds73", "rustls"] }\ntokio = { version = "1", features = ["rt", "net", "macros"] }\ntokio-util = { version = "0.7", features = ["compat"] }' },
};

/** server/Cargo.toml and server/src/main.rs for the chosen database kind. */
export function rustServerFiles(kind) {
  const driver = RUST_DRIVER[kind] ?? RUST_DRIVER.sqlite;
  const cargo = `[package]
name = "myhomemaker-board-server"
version = "1.0.0"
edition = "2021"

[dependencies]
tiny_http = "0.12"
serde_json = "1"
${driver.line}
`;
  return [
    { path: 'server/Cargo.toml', data: cargo },
    { path: 'server/src/main.rs', data: rustMain(kind) },
  ];
}

function rustMain(kind) {
  return `// MyHomeMaker board server (Rust): the site in config.siteDir and the board API.
use serde_json::{json, Value};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

const TABLE: &str = "myhomemaker_board_posts";

${dbSection(kind)}

fn main() {
    let cwd = std::env::current_dir().expect("cwd");
    let here = cwd.canonicalize().unwrap_or(cwd);
    let raw = fs::read_to_string(here.join("config.json")).expect("config.json");
    let config: Value = serde_json::from_str(&raw).expect("config.json");
    let site_dir = here.join(config.get("siteDir").and_then(|v| v.as_str()).unwrap_or("..")).canonicalize().unwrap_or_else(|_| here.join(".."));
    let api = config.get("api").and_then(|v| v.as_str()).unwrap_or("/api/board").trim_end_matches('/').to_string();
    let mut db = open_db(&config);
    db_exec(&mut db, &schema(&config));
    seed(&mut db, &config);
    let port = std::env::var("PORT").ok().and_then(|v| v.parse().ok()).unwrap_or_else(|| config.get("port").and_then(|v| v.as_u64()).unwrap_or(8080) as u16);
    let server = Server::http(format!("0.0.0.0:{port}")).expect("listen");
    let port = server.server_addr().to_ip().expect("tcp").port();
    println!("LISTENING {port}");
    let _ = std::io::stdout().flush();
    for mut request in server.incoming_requests() {
        let response = handle(&mut db, &config, &site_dir, &here, &api, &mut request);
        let _ = request.respond(response);
    }
}

fn handle(db: &mut Db, config: &Value, site_dir: &Path, here: &Path, api: &str, request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let url = request.url().to_string();
    let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));
    let path = percent_decode(path);
    if path == api || path.starts_with(&format!("{api}/")) {
        return api_call(db, config, api, request, &path, query);
    }
    if *request.method() != Method::Get && *request.method() != Method::Head {
        return text(405, "method not allowed");
    }
    serve_file(site_dir, here, &path)
}

fn api_call(db: &mut Db, config: &Value, api: &str, request: &mut Request, path: &str, query: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let rest = &path[api.len()..];
    let board = query_one(query, "board");
    if *request.method() == Method::Get && rest == "/posts" {
        if !known(config, &board) { return json_body(404, json!({"error": "unknown board"})); }
        return json_body(200, list_posts(db, &board));
    }
    if *request.method() == Method::Get && rest.starts_with("/posts/") {
        let id = percent_decode(&rest["/posts/".len()..]);
        if id.is_empty() || id.contains('/') || id.chars().count() > 80 { return json_body(404, json!({"error": "no such post"})); }
        if !known(config, &board) { return json_body(404, json!({"error": "unknown board"})); }
        return match read_post(db, &board, &id) {
            Some(post) => json_body(200, post),
            None => json_body(404, json!({"error": "no such post"})),
        };
    }
    if *request.method() == Method::Post && rest == "/posts" {
        if request.body_length().unwrap_or(0) > 64 * 1024 { return json_body(413, json!({"error": "too large"})); }
        let mut body = String::new();
        if request.as_reader().take(64 * 1024).read_to_string(&mut body).is_err() { return json_body(400, json!({"error": "bad json"})); }
        let data: Value = match serde_json::from_str(if body.is_empty() { "{}" } else { &body }) { Ok(v) => v, Err(_) => return json_body(400, json!({"error": "bad json"})) };
        let target = data.get("board").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !known(config, &target) { return json_body(404, json!({"error": "unknown board"})); }
        let title = cut(data.get("title").and_then(|v| v.as_str()).unwrap_or("").trim(), 500);
        let message = {
            let m = data.get("message").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).or_else(|| data.get("body").and_then(|v| v.as_str())).unwrap_or("");
            cut(m.trim(), 20000)
        };
        let author = {
            let n = data.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).or_else(|| data.get("author").and_then(|v| v.as_str())).unwrap_or("");
            cut(n.trim(), 200)
        };
        if title.is_empty() || message.is_empty() || author.is_empty() { return json_body(400, json!({"error": "title, name and text are needed"})); }
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
        let id = format!("w{:x}{:x}", now.as_millis(), now.subsec_nanos() % 0xffff);
        let date = {
            let secs = now.as_secs();
            let days = secs / 86400;
            // Civil date from Unix days (Howard Hinnant), enough for the post date.
            let z = days as i64 + 719468;
            let era = if z >= 0 { z } else { z - 146096 } / 146097;
            let doe = (z - era * 146097) as u64;
            let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
            let y = yoe as i64 + era * 400;
            let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
            let mp = (5 * doy + 2) / 153;
            let d = doy - (153 * mp + 2) / 5 + 1;
            let m = if mp < 10 { mp + 3 } else { mp - 9 };
            let y = if m <= 2 { y + 1 } else { y };
            format!("{y:04}-{m:02}-{d:02}")
        };
        let category = cut(data.get("category").and_then(|v| v.as_str()).unwrap_or("").trim(), 100);
        let stamp = now.as_secs().to_string();
        insert_post(db, &target, &cut(&id, 80), &title, &category, &author, &date, &message, &stamp);
        return json_body(201, json!({"id": id}));
    }
    json_body(405, json!({"error": "not here"}))
}

fn known(config: &Value, board: &str) -> bool {
    config.get("boards").and_then(|v| v.get(board)).is_some()
}

fn serve_file(site_dir: &Path, here: &Path, name: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut rel = name.trim_start_matches('/').to_string();
    if name.ends_with('/') || rel.is_empty() { rel.push_str("index.html"); }
    if rel.split(['/', '\\\\']).any(|part| part == "..") { return text(403, "forbidden"); }
    let full = site_dir.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    if full.starts_with(here) { return text(404, "not found"); }
    match fs::read(&full) {
        Ok(data) => {
            let kind = match full.extension().and_then(|e| e.to_str()).unwrap_or("") {
                "html" => "text/html; charset=utf-8",
                "css" => "text/css; charset=utf-8",
                "js" => "text/javascript; charset=utf-8",
                "json" => "application/json",
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "svg" => "image/svg+xml",
                "ico" => "image/x-icon",
                _ => "application/octet-stream",
            };
            bytes(200, data, kind)
        }
        Err(_) => text(404, "not found"),
    }
}

fn json_body(status: u16, body: Value) -> Response<std::io::Cursor<Vec<u8>>> {
    bytes(status, serde_json::to_vec(&body).unwrap_or_default(), "application/json; charset=utf-8")
}

fn text(status: u16, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    bytes(status, body.as_bytes().to_vec(), "text/plain; charset=utf-8")
}

fn bytes(status: u16, data: Vec<u8>, content_type: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response = Response::from_data(data).with_status_code(StatusCode(status));
    for (name, value) in [("Content-Type", content_type), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff")] {
        if let Ok(header) = Header::from_bytes(name.as_bytes(), value.as_bytes()) { response = response.with_header(header); }
    }
    response
}

fn query_one(query: &str, key: &str) -> String {
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        if percent_decode(k) == key { return percent_decode(v); }
    }
    String::new()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(n) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) { out.push(n); i += 3; continue; }
        }
        if bytes[i] == b'+' { out.push(b' '); } else { out.push(bytes[i]); }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn cut(value: &str, max: usize) -> String { value.chars().take(max).collect() }

fn schema(config: &Value) -> String {
    let kind = config.get("database").and_then(|v| v.get("kind")).and_then(|v| v.as_str()).unwrap_or("sqlite");
    if kind == "mssql" {
        return format!("IF OBJECT_ID(N'{TABLE}', N'U') IS NULL CREATE TABLE {TABLE} (board_id NVARCHAR(80) NOT NULL, post_id NVARCHAR(80) NOT NULL, title NVARCHAR(500) NOT NULL, category NVARCHAR(100) NOT NULL, author NVARCHAR(200) NOT NULL, post_date NVARCHAR(40) NOT NULL, views BIGINT NOT NULL, notice BIGINT NOT NULL, body NVARCHAR(MAX) NOT NULL, created NVARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id))");
    }
    let (text, integer, suffix) = if kind == "mysql" || kind == "mariadb" { ("LONGTEXT", "BIGINT", " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci") } else if kind == "sqlite" { ("TEXT", "INTEGER", "") } else { ("TEXT", "BIGINT", "") };
    format!("CREATE TABLE IF NOT EXISTS {TABLE} (board_id VARCHAR(80) NOT NULL, post_id VARCHAR(80) NOT NULL, title VARCHAR(500) NOT NULL, category VARCHAR(100) NOT NULL, author VARCHAR(200) NOT NULL, post_date VARCHAR(40) NOT NULL, views {integer} NOT NULL, notice {integer} NOT NULL, body {text} NOT NULL, created VARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id)){suffix}")
}

fn seed(db: &mut Db, config: &Value) {
    let mut i = 0_i64;
    let boards = config.get("boards").and_then(|v| v.as_object());
    let Some(boards) = boards else { return; };
    for (board, info) in boards {
        if count_posts(db, board) > 0 { continue; }
        for post in info.get("seed").and_then(|v| v.as_array()).into_iter().flatten() {
            i += 1;
            let id = {
                let raw = post.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if raw.is_empty() { format!("p{i:05}") } else { cut(raw, 80) }
            };
            let notice = match post.get("notice") { Some(Value::Bool(v)) => *v, Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0, _ => false };
            insert_seed(db, board, &id, &cut(post.get("title").and_then(|v| v.as_str()).unwrap_or(""), 500), &cut(post.get("category").and_then(|v| v.as_str()).unwrap_or(""), 100), &cut(post.get("author").and_then(|v| v.as_str()).unwrap_or(""), 200), &cut(post.get("date").and_then(|v| v.as_str()).unwrap_or(""), 40), post.get("views").and_then(|v| v.as_i64()).unwrap_or(0), notice, &cut(post.get("body").and_then(|v| v.as_str()).unwrap_or(""), 20000), &format!("{i:06}"));
        }
    }
}

fn post_json(id: String, title: String, category: String, author: String, date: String, views: i64, notice: i64, body: String) -> Value {
    json!({"id": id, "title": title, "category": category, "author": author, "date": date, "views": views, "notice": notice != 0, "body": body})
}
`;
}

function dbSection(kind) {
  if (kind === 'mysql' || kind === 'mariadb') return MYSQL_DB;
  if (kind === 'postgres') return POSTGRES_DB;
  if (kind === 'mssql') return MSSQL_DB;
  return SQLITE_DB;
}

const SQLITE_DB = `use rusqlite::{params, Connection, OptionalExtension};

struct Db { conn: Connection }

fn open_db(config: &Value) -> Db {
    let file = config.get("database").and_then(|v| v.get("file")).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).unwrap_or("board.db");
    let path = std::env::current_dir().unwrap_or_default().join(file);
    let conn = Connection::open(path).expect("sqlite");
    Db { conn }
}

fn db_exec(db: &mut Db, sql: &str) { db.conn.execute_batch(sql).expect("schema"); }

fn count_posts(db: &Db, board: &str) -> i64 {
    db.conn.query_row(&format!("SELECT COUNT(*) FROM {TABLE} WHERE board_id = ?1"), [board], |row| row.get(0)).unwrap_or(0)
}

fn list_posts(db: &Db, board: &str) -> Value {
    let mut stmt = db.conn.prepare(&format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = ?1 ORDER BY created, post_id")).expect("list");
    let rows = stmt.query_map([board], |row| Ok(post_json(row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?))).expect("rows");
    Value::Array(rows.filter_map(|row| row.ok()).collect())
}

fn read_post(db: &mut Db, board: &str, id: &str) -> Option<Value> {
    db.conn.execute(&format!("UPDATE {TABLE} SET views = views + 1 WHERE board_id = ?1 AND post_id = ?2"), params![board, id]).ok();
    db.conn.query_row(&format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = ?1 AND post_id = ?2"), params![board, id], |row| Ok(post_json(row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?))).optional().ok().flatten()
}

fn insert_post(db: &mut Db, board: &str, id: &str, title: &str, category: &str, author: &str, date: &str, body: &str, created: &str) {
    let _ = db.conn.execute(&format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7, ?8)"), params![board, id, title, category, author, date, body, created]);
}

fn insert_seed(db: &mut Db, board: &str, id: &str, title: &str, category: &str, author: &str, date: &str, views: i64, notice: bool, body: &str, created: &str) {
    let _ = db.conn.execute(&format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"), params![board, id, title, category, author, date, views, if notice { 1 } else { 0 }, body, created]);
}
`;

const MYSQL_DB = `use mysql::prelude::Queryable;
use mysql::{Pool, Value as SqlValue};

struct Db { conn: mysql::PooledConn }

fn open_db(config: &Value) -> Db {
    let db = config.get("database").cloned().unwrap_or(Value::Null);
    let host = db.get("host").and_then(|v| v.as_str()).unwrap_or("localhost");
    let port = db.get("port").and_then(|v| v.as_u64()).unwrap_or(3306);
    let name = db.get("database").and_then(|v| v.as_str()).unwrap_or("myhomemaker");
    let user = db.get("user").and_then(|v| v.as_str()).unwrap_or("");
    let password = std::env::var("DB_PASSWORD").unwrap_or_default();
    let url = format!("mysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4");
    let pool = Pool::new(url.as_str()).expect("mysql");
    Db { conn: pool.get_conn().expect("mysql connection") }
}

fn db_exec(db: &mut Db, sql: &str) { db.conn.query_drop(sql).expect("schema"); }

fn count_posts(db: &mut Db, board: &str) -> i64 {
    db.conn.exec_first(&format!("SELECT COUNT(*) FROM {TABLE} WHERE board_id = ?"), (board,)).ok().flatten().unwrap_or(0)
}

fn row_post(row: mysql::Row) -> Value {
    let get = |name: &str| row.get::<String, _>(name).unwrap_or_default();
    post_json(get("post_id"), get("title"), get("category"), get("author"), get("post_date"), row.get("views").unwrap_or(0), row.get("notice").unwrap_or(0), get("body"))
}

fn list_posts(db: &mut Db, board: &str) -> Value {
    let rows: Vec<mysql::Row> = db.conn.exec(&format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = ? ORDER BY created, post_id"), (board,)).unwrap_or_default();
    Value::Array(rows.into_iter().map(row_post).collect())
}

fn read_post(db: &mut Db, board: &str, id: &str) -> Option<Value> {
    db.conn.exec_drop(&format!("UPDATE {TABLE} SET views = views + 1 WHERE board_id = ? AND post_id = ?"), (board, id)).ok();
    let row: Option<mysql::Row> = db.conn.exec_first(&format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = ? AND post_id = ?"), (board, id)).ok().flatten();
    row.map(row_post)
}

fn insert_post(db: &mut Db, board: &str, id: &str, title: &str, category: &str, author: &str, date: &str, body: &str, created: &str) {
    let _ = db.conn.exec_drop(&format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)"), (board, id, title, category, author, date, body, created));
}

fn insert_seed(db: &mut Db, board: &str, id: &str, title: &str, category: &str, author: &str, date: &str, views: i64, notice: bool, body: &str, created: &str) {
    let _ = db.conn.exec_drop(&format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"), (board, id, title, category, author, date, views, if notice { 1 } else { 0 }, body, created));
}

#[allow(dead_code)]
fn _value(v: SqlValue) -> SqlValue { v }
`;

const POSTGRES_DB = `use postgres::{Client, NoTls};

struct Db { client: Client }

fn open_db(config: &Value) -> Db {
    let db = config.get("database").cloned().unwrap_or(Value::Null);
    let host = db.get("host").and_then(|v| v.as_str()).unwrap_or("localhost");
    let port = db.get("port").and_then(|v| v.as_u64()).unwrap_or(5432);
    let name = db.get("database").and_then(|v| v.as_str()).unwrap_or("myhomemaker");
    let user = db.get("user").and_then(|v| v.as_str()).unwrap_or("");
    let password = std::env::var("DB_PASSWORD").unwrap_or_default();
    let url = format!("host={host} port={port} user={user} password={password} dbname={name} sslmode=disable");
    Db { client: Client::connect(&url, NoTls).expect("postgres") }
}

fn db_exec(db: &mut Db, sql: &str) { db.client.batch_execute(sql).expect("schema"); }

fn count_posts(db: &mut Db, board: &str) -> i64 {
    db.client.query_one(&format!("SELECT COUNT(*) FROM {TABLE} WHERE board_id = $1"), &[&board]).map(|row| row.get(0)).unwrap_or(0)
}

fn row_post(row: &postgres::Row) -> Value {
    post_json(row.get(0), row.get(1), row.get(2), row.get(3), row.get(4), row.get(5), row.get(6), row.get(7))
}

fn list_posts(db: &mut Db, board: &str) -> Value {
    let rows = db.client.query(&format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = $1 ORDER BY created, post_id"), &[&board]).unwrap_or_default();
    Value::Array(rows.iter().map(row_post).collect())
}

fn read_post(db: &mut Db, board: &str, id: &str) -> Option<Value> {
    let _ = db.client.execute(&format!("UPDATE {TABLE} SET views = views + 1 WHERE board_id = $1 AND post_id = $2"), &[&board, &id]);
    db.client.query_opt(&format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = $1 AND post_id = $2"), &[&board, &id]).ok().flatten().map(|row| row_post(&row))
}

fn insert_post(db: &mut Db, board: &str, id: &str, title: &str, category: &str, author: &str, date: &str, body: &str, created: &str) {
    let _ = db.client.execute(&format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8)"), &[&board, &id, &title, &category, &author, &date, &body, &created]);
}

fn insert_seed(db: &mut Db, board: &str, id: &str, title: &str, category: &str, author: &str, date: &str, views: i64, notice: bool, body: &str, created: &str) {
    let notice_n: i64 = if notice { 1 } else { 0 };
    let _ = db.client.execute(&format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"), &[&board, &id, &title, &category, &author, &date, &views, &notice_n, &body, &created]);
}
`;

const MSSQL_DB = `use tiberius::{AuthMethod, Client, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

struct Db { client: Client<tokio_util::compat::Compat<TcpStream>>, runtime: tokio::runtime::Runtime }

fn open_db(config: &Value) -> Db {
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("runtime");
    let db = config.get("database").cloned().unwrap_or(Value::Null);
    let mut cfg = Config::new();
    cfg.host(db.get("host").and_then(|v| v.as_str()).unwrap_or("localhost"));
    cfg.port(db.get("port").and_then(|v| v.as_u64()).unwrap_or(1433) as u16);
    cfg.database(db.get("database").and_then(|v| v.as_str()).unwrap_or("myhomemaker"));
    cfg.authentication(AuthMethod::sql_server(db.get("user").and_then(|v| v.as_str()).unwrap_or(""), std::env::var("DB_PASSWORD").unwrap_or_default()));
    cfg.trust_cert();
    let client = runtime.block_on(async {
        let tcp = TcpStream::connect(cfg.get_addr()).await.expect("mssql tcp");
        tcp.set_nodelay(true).ok();
        Client::connect(cfg, tcp.compat_write()).await.expect("mssql")
    });
    Db { client, runtime }
}

fn db_exec(db: &mut Db, sql: &str) {
    let sql = sql.to_string();
    db.runtime.block_on(async { db.client.simple_query(sql).await.expect("schema").into_results().await.ok(); });
}

fn count_posts(db: &mut Db, board: &str) -> i64 {
    let sql = format!("SELECT COUNT(*) FROM {TABLE} WHERE board_id = @P1");
    db.runtime.block_on(async {
        let stream = db.client.query(sql, &[&board]).await.ok()?;
        let row = stream.into_row().await.ok()??;
        row.get::<i64, _>(0).or_else(|| row.get::<i32, _>(0).map(|n| n as i64))
    }).unwrap_or(0)
}

fn cell_string(row: &tiberius::Row, index: usize) -> String { row.get::<&str, _>(index).unwrap_or("").to_string() }

fn row_post(row: &tiberius::Row) -> Value {
    let views = row.get::<i64, _>(5).unwrap_or(0);
    let notice = row.get::<i64, _>(6).unwrap_or(0);
    post_json(cell_string(row, 0), cell_string(row, 1), cell_string(row, 2), cell_string(row, 3), cell_string(row, 4), views, notice, cell_string(row, 7))
}

fn list_posts(db: &mut Db, board: &str) -> Value {
    let sql = format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = @P1 ORDER BY created, post_id");
    let board = board.to_string();
    let rows = db.runtime.block_on(async {
        let stream = db.client.query(sql, &[&board.as_str()]).await.ok()?;
        stream.into_first_result().await.ok()
    }).unwrap_or_default();
    Value::Array(rows.iter().map(row_post).collect())
}

fn read_post(db: &mut Db, board: &str, id: &str) -> Option<Value> {
    let update = format!("UPDATE {TABLE} SET views = views + 1 WHERE board_id = @P1 AND post_id = @P2");
    let select = format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = @P1 AND post_id = @P2");
    let board = board.to_string();
    let id = id.to_string();
    db.runtime.block_on(async {
        db.client.execute(update, &[&board.as_str(), &id.as_str()]).await.ok();
        let stream = db.client.query(select, &[&board.as_str(), &id.as_str()]).await.ok()?;
        let row = stream.into_row().await.ok()??;
        Some(row_post(&row))
    })
}

fn insert_post(db: &mut Db, board: &str, id: &str, title: &str, category: &str, author: &str, date: &str, body: &str, created: &str) {
    let sql = format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (@P1, @P2, @P3, @P4, @P5, @P6, 0, 0, @P7, @P8)");
    let _ = db.runtime.block_on(async { db.client.execute(sql, &[&board, &id, &title, &category, &author, &date, &body, &created]).await });
}

fn insert_seed(db: &mut Db, board: &str, id: &str, title: &str, category: &str, author: &str, date: &str, views: i64, notice: bool, body: &str, created: &str) {
    let sql = format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, @P9, @P10)");
    let notice_n = if notice { 1_i64 } else { 0 };
    let _ = db.runtime.block_on(async { db.client.execute(sql, &[&board, &id, &title, &category, &author, &date, &views, &notice_n, &body, &created]).await });
}
`;
