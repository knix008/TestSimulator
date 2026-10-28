// favorites.db in the user data folder: the folders and files the user starred
// (Explorer › Favorites tab, "Add to favorites" in the context menus). A SQLite table rather
// than a settings key, so the list outlives the page's storage and several windows share it.
// Every call answers the whole list, in the order the entries were added.

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static DB: Mutex<Option<Connection>> = Mutex::new(None);

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS favorites (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    path     TEXT    NOT NULL,
    key      TEXT    NOT NULL UNIQUE,   -- path folded the way the file system compares it
    kind     TEXT    NOT NULL CHECK (kind IN ('dir', 'file')),
    added_at INTEGER NOT NULL           -- ms since the epoch
);";

fn open() -> rusqlite::Result<Connection> {
    let dir = super::user_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let conn = Connection::open(dir.join("favorites.db"))?;
    // Another window (several instances may run) can be writing at the same moment
    conn.busy_timeout(std::time::Duration::from_secs(3))?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

fn with_db<T>(f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let mut guard = DB.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = Some(open().map_err(|e| e.to_string())?);
    }
    f(guard.as_ref().unwrap()).map_err(|e| e.to_string())
}

/// `C:\Photos\` and `c:/photos` are one entry on Windows and macOS; Linux keeps the case.
fn key_of(path: &str) -> String {
    let p = path.replace('\\', "/");
    let p = p.trim_end_matches('/');
    let p = if p.is_empty() { "/" } else { p };
    if cfg!(any(windows, target_os = "macos")) { p.to_lowercase() } else { p.to_string() }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn rows(conn: &Connection) -> rusqlite::Result<Vec<Value>> {
    let mut stmt = conn.prepare("SELECT path, kind, added_at FROM favorites ORDER BY id")?;
    let list = stmt
        .query_map([], |r| {
            Ok(json!({ "path": r.get::<_, String>(0)?, "kind": r.get::<_, String>(1)?, "addedAt": r.get::<_, i64>(2)? }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(list)
}

fn answer(r: Result<Vec<Value>, String>) -> Value {
    match r {
        Ok(list) => Value::Array(list),
        Err(e) => super::error(e),
    }
}

pub fn list() -> Value {
    answer(with_db(rows))
}

/// Star a folder or a file (`kind` "dir" / "file"; anything else is worked out from the disk).
pub fn add(path: &str, kind: &str) -> Value {
    if path.is_empty() {
        return super::error("empty path");
    }
    let kind = match kind {
        "dir" | "file" => kind,
        _ if std::path::Path::new(path).is_dir() => "dir",
        _ => "file",
    };
    answer(with_db(|c| {
        c.execute(
            "INSERT INTO favorites (path, key, kind, added_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO NOTHING",
            params![path, key_of(path), kind, now_ms()],
        )?;
        rows(c)
    }))
}

pub fn remove(path: &str) -> Value {
    answer(with_db(|c| {
        c.execute("DELETE FROM favorites WHERE key = ?1", params![key_of(path)])?;
        rows(c)
    }))
}

pub fn clear() -> Value {
    answer(with_db(|c| {
        c.execute("DELETE FROM favorites", [])?;
        rows(c)
    }))
}

/// A starred item (or a folder above it) was renamed / moved from `from` to `to`.
pub fn remap(from: &str, to: &str) -> Value {
    if from.is_empty() || to.is_empty() {
        return list();
    }
    let from_key = key_of(from);
    let from_trim = from.replace('\\', "/").trim_end_matches('/').len();
    let to_base = to.trim_end_matches(['/', '\\']).to_string();
    answer(with_db(|c| {
        let mut stmt = c.prepare("SELECT id, path, key FROM favorites")?;
        let all = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(stmt);
        for (id, path, key) in all {
            let inside = key == from_key || key.starts_with(&format!("{from_key}/"));
            if !inside {
                continue;
            }
            // Keep the part below the moved folder exactly as it was spelled
            let rest = path.get(from_trim..).unwrap_or("");
            let next = format!("{to_base}{rest}");
            // A favorite already sitting at the new place wins; drop the moved duplicate
            let n = c.execute(
                "UPDATE OR IGNORE favorites SET path = ?1, key = ?2 WHERE id = ?3",
                params![next, key_of(&next), id],
            )?;
            if n == 0 {
                c.execute("DELETE FROM favorites WHERE id = ?1", params![id])?;
            }
        }
        rows(c)
    }))
}
