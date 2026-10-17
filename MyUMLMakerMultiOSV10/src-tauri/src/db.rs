//! Project storage in a database: SQLite, MariaDB, MySQL or PostgreSQL.
//!
//! One table holds everything (created on first use):
//!   myumlmaker_projects (id, title, data, updated)
//! `data` is the plan exactly as a .muml file holds it (UTF-8 JSON text), so a
//! plan read back from the database opens like a file. Saving replaces the
//! plan's row in one transaction.
use crate::tr;
use serde::{Deserialize, Serialize};
use sqlx::any::{install_default_drivers, AnyPoolOptions};
use sqlx::AnyPool;
use sqlx::Row;
use std::sync::Once;
use std::time::Duration;

/// The table plans are stored in.
pub const TABLE: &str = "myumlmaker_projects";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbConfig {
    /// "sqlite" | "mariadb" | "mysql" | "postgres"
    pub kind: String,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub database: Option<String>,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    /// SQLite database file (absolute path).
    #[serde(default)]
    pub file: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Sqlite,
    MySql,
    Postgres,
}

/// A stored plan: its id (the project id), title and .muml text.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanRow {
    pub id: String,
    pub title: String,
    pub data: String,
}

/// One line of the "open from database" list (no plan text).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummary {
    pub id: String,
    pub title: String,
    /// Seconds since 1970 (UTC) of the last save.
    pub updated: String,
    /// Size of the plan text in bytes.
    pub size: i64,
}

/// Percent-encodes everything except unreserved characters (and `keep`).
pub fn encode(text: &str, keep: &str) -> String {
    let mut out = String::new();
    for byte in text.bytes() {
        let c = byte as char;
        if c.is_ascii_alphanumeric() || "-._~".contains(c) || keep.contains(c) {
            out.push(c);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

impl DbConfig {
    pub fn dialect(&self) -> Result<Dialect, String> {
        match self.kind.as_str() {
            "sqlite" => Ok(Dialect::Sqlite),
            "mariadb" | "mysql" => Ok(Dialect::MySql),
            "postgres" | "postgresql" => Ok(Dialect::Postgres),
            "" | "none" => Err(tr!("데이터베이스가 설정되지 않았습니다. 설정 › 데이터베이스에서 고르세요.", "No database is set up. Choose one in Settings › Database.")),
            other => Err(tr!("지원하지 않는 DB 종류입니다: {other}", "Unsupported database type: {other}")),
        }
    }

    /// Connection URL (never shown to the user: it may hold the password).
    pub fn url(&self) -> Result<String, String> {
        let dialect = self.dialect()?;
        if dialect == Dialect::Sqlite {
            let file = self.file.as_deref().map(str::trim).filter(|f| !f.is_empty())
                .ok_or_else(|| tr!("SQLite 파일 경로가 없습니다.", "The SQLite file path is missing."))?;
            // "sqlite:" + path (not "sqlite://", which would make a drive letter the URL host).
            return Ok(format!("sqlite:{}?mode=rwc", encode(&file.replace('\\', "/"), "/:")));
        }
        let host = self.host.as_deref().map(str::trim).filter(|h| !h.is_empty()).unwrap_or("localhost");
        let port = self.port.unwrap_or(if dialect == Dialect::Postgres { 5432 } else { 3306 });
        let user = self.user.as_deref().unwrap_or("");
        let credentials = match self.password.as_deref() {
            Some(password) if !password.is_empty() => format!("{}:{}@", encode(user, ""), encode(password, "")),
            _ if !user.is_empty() => format!("{}@", encode(user, "")),
            _ => String::new(),
        };
        let scheme = if dialect == Dialect::Postgres { "postgres" } else { "mysql" };
        let database = self.database.as_deref().map(str::trim).unwrap_or("");
        Ok(format!("{scheme}://{credentials}{host}:{port}/{}", encode(database, "")))
    }

    /// Where the data goes, for messages (no password).
    pub fn describe(&self) -> String {
        match self.dialect() {
            Ok(Dialect::Sqlite) => format!("SQLite {}", self.file.as_deref().unwrap_or("")),
            _ => format!(
                "{} {}@{}:{}/{}",
                self.kind,
                self.user.as_deref().unwrap_or(""),
                self.host.as_deref().unwrap_or("localhost"),
                self.port.map(|p| p.to_string()).unwrap_or_default(),
                self.database.as_deref().unwrap_or("")
            ),
        }
    }
}

/// `?` placeholders → `$1, $2, …` for PostgreSQL.
pub fn placeholders(sql: &str, dialect: Dialect) -> String {
    if dialect != Dialect::Postgres {
        return sql.to_string();
    }
    let mut out = String::new();
    let mut n = 0;
    for c in sql.chars() {
        if c == '?' {
            n += 1;
            out.push_str(&format!("${n}"));
        } else {
            out.push(c);
        }
    }
    out
}

pub fn schema(dialect: Dialect) -> String {
    let (text, suffix) = match dialect {
        Dialect::MySql => ("LONGTEXT", " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"),
        _ => ("TEXT", ""),
    };
    format!("CREATE TABLE IF NOT EXISTS {TABLE} (id VARCHAR(80) NOT NULL PRIMARY KEY, title VARCHAR(500) NOT NULL, data {text} NOT NULL, updated VARCHAR(40) NOT NULL){suffix}")
}

/// A text column. Through the Any driver MySQL/MariaDB report LONGTEXT as BLOB,
/// so bytes are accepted too (stored as UTF-8).
fn text(row: &sqlx::any::AnyRow, column: &str) -> Result<String, sqlx::Error> {
    match row.try_get::<String, _>(column) {
        Ok(value) => Ok(value),
        Err(_) => {
            let bytes: Vec<u8> = row.try_get(column)?;
            String::from_utf8(bytes).map_err(|error| sqlx::Error::Decode(Box::new(error)))
        }
    }
}

fn now() -> String {
    let seconds = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    seconds.to_string()
}

static DRIVERS: Once = Once::new();

pub async fn connect(config: &DbConfig) -> Result<(AnyPool, Dialect), String> {
    DRIVERS.call_once(install_default_drivers);
    let dialect = config.dialect()?;
    let url = config.url()?;
    let pool = AnyPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&url)
        .await
        .map_err(|error| tr!("DB에 연결할 수 없습니다 ({}): {error}", "Could not connect to the database ({}): {error}", config.describe()))?;
    Ok((pool, dialect))
}

fn failed(config: &DbConfig, error: sqlx::Error) -> String {
    tr!("DB 작업 실패 ({}): {error}", "Database operation failed ({}): {error}", config.describe())
}

async fn ensure_schema(pool: &AnyPool, dialect: Dialect, config: &DbConfig) -> Result<(), String> {
    sqlx::query(&schema(dialect)).execute(pool).await.map_err(|error| failed(config, error))?;
    Ok(())
}

/// Connects, creates the table if it is missing and reports the server version.
pub async fn test(config: &DbConfig) -> Result<String, String> {
    let (pool, dialect) = connect(config).await?;
    let sql = match dialect {
        Dialect::Sqlite => "SELECT sqlite_version()",
        Dialect::MySql => "SELECT VERSION()",
        Dialect::Postgres => "SELECT version()",
    };
    let version: String = sqlx::query(sql)
        .fetch_one(&pool)
        .await
        .and_then(|row| row.try_get(0))
        .map_err(|error| failed(config, error))?;
    ensure_schema(&pool, dialect, config).await?;
    pool.close().await;
    Ok(version)
}

/// Stores the plan (replacing an earlier copy with the same id).
pub async fn save(config: &DbConfig, plan: &PlanRow) -> Result<(), String> {
    if plan.id.trim().is_empty() {
        return Err(tr!("프로젝트 ID가 없습니다.", "The project has no id."));
    }
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let q = |sql: &str| placeholders(sql, dialect);
    let mut tx = pool.begin().await.map_err(|error| failed(config, error))?;
    sqlx::query(&q(&format!("DELETE FROM {TABLE} WHERE id = ?"))).bind(&plan.id).execute(&mut *tx).await.map_err(|error| failed(config, error))?;
    let title: String = plan.title.chars().take(500).collect();
    sqlx::query(&q(&format!("INSERT INTO {TABLE} (id, title, data, updated) VALUES (?, ?, ?, ?)")))
        .bind(&plan.id)
        .bind(&title)
        .bind(&plan.data)
        .bind(now())
        .execute(&mut *tx)
        .await
        .map_err(|error| failed(config, error))?;
    tx.commit().await.map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(())
}

/// The stored plan, or None when there is no plan with that id.
pub async fn load(config: &DbConfig, id: &str) -> Result<Option<PlanRow>, String> {
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let plan = sqlx::query(&placeholders(&format!("SELECT id, title, data FROM {TABLE} WHERE id = ?"), dialect))
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|error| failed(config, error))?
        .map(|row| -> Result<PlanRow, sqlx::Error> { Ok(PlanRow { id: text(&row, "id")?, title: text(&row, "title")?, data: text(&row, "data")? }) })
        .transpose()
        .map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(plan)
}

/// Every stored plan, most recently saved first.
pub async fn list(config: &DbConfig) -> Result<Vec<PlanSummary>, String> {
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let rows = sqlx::query(&format!("SELECT id, title, updated, data FROM {TABLE}"))
        .fetch_all(&pool)
        .await
        .map_err(|error| failed(config, error))?;
    let mut list = rows
        .into_iter()
        .map(|row| -> Result<PlanSummary, sqlx::Error> {
            let size = text(&row, "data")?.len() as i64;
            Ok(PlanSummary { id: text(&row, "id")?, title: text(&row, "title")?, updated: text(&row, "updated")?, size })
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| failed(config, error))?;
    pool.close().await;
    // Stamps are whole seconds as text: compare as numbers, then by title.
    list.sort_by(|a, b| {
        let stamp = |s: &PlanSummary| s.updated.parse::<u64>().unwrap_or(0);
        stamp(b).cmp(&stamp(a)).then_with(|| a.title.cmp(&b.title))
    });
    Ok(list)
}

pub async fn delete(config: &DbConfig, id: &str) -> Result<(), String> {
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    sqlx::query(&placeholders(&format!("DELETE FROM {TABLE} WHERE id = ?"), dialect))
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sqlite(path: &std::path::Path) -> DbConfig {
        DbConfig { kind: "sqlite".into(), host: None, port: None, database: None, user: None, password: None, file: Some(path.to_string_lossy().to_string()) }
    }

    fn plan(id: &str, title: &str, tasks: usize) -> PlanRow {
        let body = (0..tasks).map(|i| format!(r#"{{"id":"t{i}","name":"작업 {i} {}"}}"#, "가".repeat(200))).collect::<Vec<_>>().join(",");
        PlanRow { id: id.into(), title: title.into(), data: format!(r#"{{"format":"myumlmaker","project":{{"id":"{id}","title":"{title}","tasks":[{body}]}}}}"#) }
    }

    #[test]
    fn urls_for_each_database() {
        let mut config = DbConfig { kind: "mariadb".into(), host: Some("db.local".into()), port: None, database: Some("plans".into()), user: Some("me".into()), password: Some("p@ss:w/rd#1".into()), file: None };
        assert_eq!(config.url().unwrap(), "mysql://me:p%40ss%3Aw%2Frd%231@db.local:3306/plans");
        config.kind = "mysql".into();
        assert_eq!(config.url().unwrap(), "mysql://me:p%40ss%3Aw%2Frd%231@db.local:3306/plans");
        config.kind = "postgres".into();
        assert_eq!(config.url().unwrap(), "postgres://me:p%40ss%3Aw%2Frd%231@db.local:5432/plans");
        config.port = Some(6543);
        config.password = None;
        assert_eq!(config.url().unwrap(), "postgres://me@db.local:6543/plans");
        assert!(!config.describe().contains("p@ss"), "descriptions never contain the password");
        let lite = DbConfig { kind: "sqlite".into(), host: None, port: None, database: None, user: None, password: None, file: Some(r"C:\내 폴더\a#b.db".into()) };
        assert_eq!(lite.url().unwrap(), "sqlite:C:/%EB%82%B4%20%ED%8F%B4%EB%8D%94/a%23b.db?mode=rwc");
        assert!(DbConfig { kind: "oracle".into(), ..lite.clone() }.url().is_err());
        assert!(DbConfig { kind: "none".into(), ..lite.clone() }.url().is_err(), "no database configured");
        assert!(DbConfig { file: None, ..lite }.url().is_err());
    }

    #[test]
    fn postgres_placeholders_are_numbered() {
        assert_eq!(placeholders("a = ? AND b = ?", Dialect::Postgres), "a = $1 AND b = $2");
        assert_eq!(placeholders("a = ?", Dialect::MySql), "a = ?");
        assert!(schema(Dialect::MySql).contains("utf8mb4") && schema(Dialect::MySql).contains("LONGTEXT"));
        assert!(schema(Dialect::Postgres).contains(TABLE) && !schema(Dialect::Postgres).contains("LONGTEXT"));
    }

    #[test]
    fn sqlite_save_load_list_delete() {
        let dir = tempfile::tempdir().unwrap();
        // A folder name with spaces and Korean exercises the URL encoding.
        let path = dir.path().join("데이터 폴더").join("plans test.db");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let config = sqlite(&path);
        tauri::async_runtime::block_on(async {
            assert!(test(&config).await.unwrap().starts_with('3'), "SQLite 3.x");
            assert_eq!(list(&config).await.unwrap(), vec![], "a new database has no plans");
            let first = plan("prj-1", "웹사이트 개편 😀", 300);
            save(&config, &first).await.unwrap();
            assert_eq!(load(&config, "prj-1").await.unwrap().as_ref(), Some(&first));
            // Saving again replaces the plan (no second row).
            let changed = plan("prj-1", "웹사이트 개편 v2", 5);
            save(&config, &changed).await.unwrap();
            assert_eq!(load(&config, "prj-1").await.unwrap(), Some(changed.clone()));
            std::thread::sleep(std::time::Duration::from_millis(1100));
            save(&config, &plan("prj-2", "Office move", 2)).await.unwrap();
            let summary = list(&config).await.unwrap();
            assert_eq!(summary.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["prj-2", "prj-1"], "newest first");
            assert_eq!(summary[1].title, "웹사이트 개편 v2");
            assert_eq!(summary[1].size, changed.data.len() as i64);
            delete(&config, "prj-1").await.unwrap();
            assert_eq!(load(&config, "prj-1").await.unwrap(), None);
            assert_eq!(list(&config).await.unwrap().len(), 1);
            assert!(save(&config, &PlanRow { id: " ".into(), title: "x".into(), data: "{}".into() }).await.is_err(), "a plan needs an id");
        });
        assert!(path.is_file());
    }

    #[test]
    fn connection_errors_are_reported_without_the_password() {
        let config = DbConfig { kind: "mysql".into(), host: Some("127.0.0.1".into()), port: Some(1), database: Some("x".into()), user: Some("u".into()), password: Some("secret-pw".into()), file: None };
        let error = tauri::async_runtime::block_on(test(&config)).unwrap_err();
        assert!(!error.contains("secret-pw"), "{error}");
        assert!(error.contains("127.0.0.1"), "{error}");
    }
}
