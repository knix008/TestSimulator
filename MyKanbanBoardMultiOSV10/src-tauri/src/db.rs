//! Project storage in a database: SQLite, MariaDB, MySQL or PostgreSQL.
//!
//! Two tables hold everything (created on first use):
//!   mykanban_projects (id, name, data, updated)              — project metadata (JSON)
//!   mykanban_boards   (project_id, id, title, position, data, updated) — one row per board (JSON)
//!
//! Saving replaces the project's rows in one transaction, so the database
//! always holds a complete, consistent copy of the project.
use crate::tr;
use serde::{Deserialize, Serialize};
use sqlx::any::{install_default_drivers, AnyPoolOptions};
use sqlx::AnyPool;
use sqlx::Row;
use std::sync::Once;
use std::time::Duration;

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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub data: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BoardRow {
    pub id: String,
    pub title: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Loaded {
    pub project: Option<ProjectRow>,
    pub boards: Vec<BoardRow>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub updated: String,
    pub boards: i64,
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

pub fn schema(dialect: Dialect) -> [String; 2] {
    let (text, suffix) = match dialect {
        Dialect::MySql => ("LONGTEXT", " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"),
        _ => ("TEXT", ""),
    };
    [
        format!("CREATE TABLE IF NOT EXISTS mykanban_projects (id VARCHAR(80) NOT NULL PRIMARY KEY, name VARCHAR(500) NOT NULL, data {text} NOT NULL, updated VARCHAR(40) NOT NULL){suffix}"),
        format!("CREATE TABLE IF NOT EXISTS mykanban_boards (project_id VARCHAR(80) NOT NULL, id VARCHAR(80) NOT NULL, title VARCHAR(500) NOT NULL, position BIGINT NOT NULL, data {text} NOT NULL, updated VARCHAR(40) NOT NULL, PRIMARY KEY (project_id, id)){suffix}"),
    ]
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
    for statement in schema(dialect) {
        sqlx::query(&statement).execute(pool).await.map_err(|error| failed(config, error))?;
    }
    Ok(())
}

/// Connects and reports the server version.
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

/// Replaces the project and all its boards.
pub async fn save(config: &DbConfig, project: &ProjectRow, boards: &[BoardRow]) -> Result<(), String> {
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let q = |sql: &str| placeholders(sql, dialect);
    let stamp = now();
    let mut tx = pool.begin().await.map_err(|error| failed(config, error))?;
    sqlx::query(&q("DELETE FROM mykanban_boards WHERE project_id = ?")).bind(&project.id).execute(&mut *tx).await.map_err(|error| failed(config, error))?;
    sqlx::query(&q("DELETE FROM mykanban_projects WHERE id = ?")).bind(&project.id).execute(&mut *tx).await.map_err(|error| failed(config, error))?;
    sqlx::query(&q("INSERT INTO mykanban_projects (id, name, data, updated) VALUES (?, ?, ?, ?)"))
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.data)
        .bind(&stamp)
        .execute(&mut *tx)
        .await
        .map_err(|error| failed(config, error))?;
    for (position, board) in boards.iter().enumerate() {
        sqlx::query(&q("INSERT INTO mykanban_boards (project_id, id, title, position, data, updated) VALUES (?, ?, ?, ?, ?, ?)"))
            .bind(&project.id)
            .bind(&board.id)
            .bind(&board.title)
            .bind(position as i64)
            .bind(&board.data)
            .bind(&stamp)
            .execute(&mut *tx)
            .await
            .map_err(|error| failed(config, error))?;
    }
    tx.commit().await.map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(())
}

pub async fn load(config: &DbConfig, project_id: &str) -> Result<Loaded, String> {
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let q = |sql: &str| placeholders(sql, dialect);
    let project = sqlx::query(&q("SELECT id, name, data FROM mykanban_projects WHERE id = ?"))
        .bind(project_id)
        .fetch_optional(&pool)
        .await
        .map_err(|error| failed(config, error))?
        .map(|row| -> Result<ProjectRow, sqlx::Error> { Ok(ProjectRow { id: text(&row, "id")?, name: text(&row, "name")?, data: text(&row, "data")? }) })
        .transpose()
        .map_err(|error| failed(config, error))?;
    let boards = sqlx::query(&q("SELECT id, title, data FROM mykanban_boards WHERE project_id = ? ORDER BY position"))
        .bind(project_id)
        .fetch_all(&pool)
        .await
        .map_err(|error| failed(config, error))?
        .into_iter()
        .map(|row| -> Result<BoardRow, sqlx::Error> { Ok(BoardRow { id: text(&row, "id")?, title: text(&row, "title")?, data: text(&row, "data")? }) })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(Loaded { project, boards })
}

pub async fn list(config: &DbConfig) -> Result<Vec<ProjectSummary>, String> {
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let rows = sqlx::query("SELECT p.id, p.name, p.updated, (SELECT COUNT(*) FROM mykanban_boards b WHERE b.project_id = p.id) AS boards FROM mykanban_projects p ORDER BY p.name")
        .fetch_all(&pool)
        .await
        .map_err(|error| failed(config, error))?;
    let list = rows
        .into_iter()
        .map(|row| -> Result<ProjectSummary, sqlx::Error> {
            Ok(ProjectSummary { id: text(&row, "id")?, name: text(&row, "name")?, updated: text(&row, "updated")?, boards: row.try_get("boards")? })
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(list)
}

pub async fn delete(config: &DbConfig, project_id: &str) -> Result<(), String> {
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let q = |sql: &str| placeholders(sql, dialect);
    let mut tx = pool.begin().await.map_err(|error| failed(config, error))?;
    sqlx::query(&q("DELETE FROM mykanban_boards WHERE project_id = ?")).bind(project_id).execute(&mut *tx).await.map_err(|error| failed(config, error))?;
    sqlx::query(&q("DELETE FROM mykanban_projects WHERE id = ?")).bind(project_id).execute(&mut *tx).await.map_err(|error| failed(config, error))?;
    tx.commit().await.map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sqlite(path: &std::path::Path) -> DbConfig {
        DbConfig { kind: "sqlite".into(), host: None, port: None, database: None, user: None, password: None, file: Some(path.to_string_lossy().to_string()) }
    }

    fn sample(n: usize) -> (ProjectRow, Vec<BoardRow>) {
        let project = ProjectRow { id: "proj-1".into(), name: "프로젝트 한글".into(), data: r#"{"name":"프로젝트 한글"}"#.into() };
        let boards = (0..n)
            .map(|i| BoardRow { id: format!("board-{i}"), title: format!("보드 {i}"), data: format!(r#"{{"title":"보드 {i}","text":"{}"}}"#, "가".repeat(20_000)) })
            .collect();
        (project, boards)
    }

    #[test]
    fn urls_for_each_database() {
        let mut config = DbConfig { kind: "mariadb".into(), host: Some("db.local".into()), port: None, database: Some("kanban".into()), user: Some("me".into()), password: Some("p@ss:w/rd#1".into()), file: None };
        assert_eq!(config.url().unwrap(), "mysql://me:p%40ss%3Aw%2Frd%231@db.local:3306/kanban");
        config.kind = "postgres".into();
        config.port = Some(6543);
        assert_eq!(config.url().unwrap(), "postgres://me:p%40ss%3Aw%2Frd%231@db.local:6543/kanban");
        config.password = None;
        assert_eq!(config.url().unwrap(), "postgres://me@db.local:6543/kanban");
        assert!(!config.describe().contains("p@ss"), "descriptions never contain the password");
        let lite = DbConfig { kind: "sqlite".into(), host: None, port: None, database: None, user: None, password: None, file: Some(r"C:\내 폴더\a#b.db".into()) };
        assert_eq!(lite.url().unwrap(), "sqlite:C:/%EB%82%B4%20%ED%8F%B4%EB%8D%94/a%23b.db?mode=rwc");
        assert!(DbConfig { kind: "oracle".into(), ..lite.clone() }.url().is_err());
        assert!(DbConfig { file: None, ..lite }.url().is_err());
    }

    #[test]
    fn postgres_placeholders_are_numbered() {
        assert_eq!(placeholders("a = ? AND b = ?", Dialect::Postgres), "a = $1 AND b = $2");
        assert_eq!(placeholders("a = ?", Dialect::MySql), "a = ?");
        assert!(schema(Dialect::MySql)[0].contains("utf8mb4"));
        assert!(schema(Dialect::Postgres)[1].contains("PRIMARY KEY (project_id, id)"));
    }

    #[test]
    fn sqlite_save_load_list_delete() {
        let dir = tempfile::tempdir().unwrap();
        // A folder name with spaces and Korean exercises the URL encoding.
        let path = dir.path().join("데이터 폴더").join("kanban test.db");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let config = sqlite(&path);
        tauri::async_runtime::block_on(async {
            assert!(test(&config).await.unwrap().starts_with('3'), "SQLite 3.x");
            let (project, boards) = sample(3);
            save(&config, &project, &boards).await.unwrap();
            let loaded = load(&config, "proj-1").await.unwrap();
            assert_eq!(loaded.project.as_ref(), Some(&project));
            assert_eq!(loaded.boards, boards);
            // Saving again replaces: a removed board disappears, order follows the list.
            let fewer = vec![boards[2].clone(), boards[0].clone()];
            save(&config, &project, &fewer).await.unwrap();
            assert_eq!(load(&config, "proj-1").await.unwrap().boards, fewer);
            let summary = list(&config).await.unwrap();
            assert_eq!(summary.len(), 1);
            assert_eq!(summary[0].boards, 2);
            assert_eq!(summary[0].name, "프로젝트 한글");
            delete(&config, "proj-1").await.unwrap();
            assert_eq!(load(&config, "proj-1").await.unwrap(), Loaded { project: None, boards: vec![] });
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
