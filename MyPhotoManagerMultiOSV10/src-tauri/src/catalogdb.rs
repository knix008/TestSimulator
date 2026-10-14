//! The catalog in SQLite (catalog.sqlite in the app data folder): one row per
//! photo record and one per catalog-wide list (categories, keywords, saved
//! searches, basket, people, presets, collections). The page sends only the
//! records that changed since its last save, in one transaction, so a large
//! catalog is not rewritten on every rating.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;

const SCHEMA: &str = "
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, record TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
";

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let db = Connection::open(path).map_err(|e| e.to_string())?;
    db.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    Ok(db)
}

/// The whole catalog as the JSON the page's Catalog understands, or None when
/// there is no database yet (first start: the page migrates catalog.json).
pub fn load(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let db = open(path)?;
    let format: Option<String> = db.query_row("SELECT value FROM meta WHERE key = 'format'", [], |row| row.get(0)).optional().map_err(|e| e.to_string())?;
    if format.is_none() {
        return Ok(None);
    }
    let mut out = String::from("{\"files\":{");
    let mut statement = db.prepare("SELECT path, record FROM files").map_err(|e| e.to_string())?;
    let mut rows = statement.query([]).map_err(|e| e.to_string())?;
    let mut first = true;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let path: String = row.get(0).map_err(|e| e.to_string())?;
        let record: String = row.get(1).map_err(|e| e.to_string())?;
        if !first {
            out.push(',');
        }
        first = false;
        out.push_str(&serde_json::to_string(&path).map_err(|e| e.to_string())?);
        out.push(':');
        out.push_str(&record);
    }
    out.push('}');
    let mut statement = db.prepare("SELECT key, value FROM meta").map_err(|e| e.to_string())?;
    let mut rows = statement.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let key: String = row.get(0).map_err(|e| e.to_string())?;
        let value: String = row.get(1).map_err(|e| e.to_string())?;
        out.push(',');
        out.push_str(&serde_json::to_string(&key).map_err(|e| e.to_string())?);
        out.push(':');
        out.push_str(&value);
    }
    out.push('}');
    Ok(Some(out))
}

/// Writes the changes in one transaction: records to add or replace, records
/// to remove, and the catalog-wide lists (each a JSON text).
pub fn save(path: &Path, upserts: &[(String, String)], removes: &[String], meta: &[(String, String)]) -> Result<(), String> {
    let mut db = open(path)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    {
        let mut put = tx.prepare_cached("INSERT INTO files (path, record) VALUES (?1, ?2) ON CONFLICT(path) DO UPDATE SET record = excluded.record").map_err(|e| e.to_string())?;
        for (p, record) in upserts {
            put.execute(params![p, record]).map_err(|e| e.to_string())?;
        }
        let mut drop = tx.prepare_cached("DELETE FROM files WHERE path = ?1").map_err(|e| e.to_string())?;
        for p in removes {
            drop.execute(params![p]).map_err(|e| e.to_string())?;
        }
        let mut set = tx.prepare_cached("INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value").map_err(|e| e.to_string())?;
        for (key, value) in meta {
            set.execute(params![key, value]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct Info {
    pub path: String,
    pub files: i64,
    pub bytes: u64,
}

pub fn info(path: &Path) -> Result<Info, String> {
    let files = if path.exists() { open(path)?.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0)).map_err(|e| e.to_string())? } else { 0 };
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    Ok(Info { path: path.to_string_lossy().into_owned(), files, bytes })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_changes_and_loads_the_catalog_json() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("catalog.sqlite");
        assert_eq!(load(&db).unwrap(), None, "no database yet");
        save(&db, &[("C:\\a.jpg".into(), r#"{"rating":4}"#.into()), ("/b \"q\".png".into(), r#"{"keywords":["x"]}"#.into())], &[], &[("format".into(), "1".into()), ("categories".into(), r#"["People"]"#.into())]).unwrap();
        let text = load(&db).unwrap().unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["files"]["C:\\a.jpg"]["rating"], 4);
        assert_eq!(value["files"]["/b \"q\".png"]["keywords"][0], "x");
        assert_eq!(value["categories"][0], "People");
        assert_eq!(value["format"], 1);
        // Update one, remove the other.
        save(&db, &[("C:\\a.jpg".into(), r#"{"rating":2}"#.into())], &["/b \"q\".png".into()], &[]).unwrap();
        let value: serde_json::Value = serde_json::from_str(&load(&db).unwrap().unwrap()).unwrap();
        assert_eq!(value["files"]["C:\\a.jpg"]["rating"], 2);
        assert!(value["files"].get("/b \"q\".png").is_none());
        assert_eq!(info(&db).unwrap().files, 1);
    }

    #[test]
    fn many_records_in_one_transaction() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("catalog.sqlite");
        let rows: Vec<(String, String)> = (0..5000).map(|i| (format!("D:\\photos\\{i:05}.jpg"), format!("{{\"rating\":{}}}", i % 6))).collect();
        save(&db, &rows, &[], &[("format".into(), "1".into())]).unwrap();
        assert_eq!(info(&db).unwrap().files, 5000);
        let value: serde_json::Value = serde_json::from_str(&load(&db).unwrap().unwrap()).unwrap();
        assert_eq!(value["files"]["D:\\photos\\04999.jpg"]["rating"], 4999 % 6);
    }
}
