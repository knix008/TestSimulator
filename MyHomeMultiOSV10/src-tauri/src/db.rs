//! Bulletin-board posts in a database: SQLite (the default), MariaDB, MySQL, PostgreSQL (sqlx) or
//! Microsoft SQL Server (tiberius, see `mssql` below). The board block's Content tab reads its posts
//! from here and writes them back; the board server written with a published site (publish.js
//! boardServerFiles) uses the same table, so posts written on the website show in the editor.
//!
//! One table (created on first use):
//!   myhomemaker_board_posts (board_id, post_id, title, category, author, post_date, views, notice, body, created)
use crate::tr;
use serde::{Deserialize, Serialize};
use sqlx::any::{install_default_drivers, AnyPoolOptions};
use sqlx::AnyPool;
use sqlx::Row;
use std::sync::Once;
use std::time::Duration;

pub const TABLE: &str = "myhomemaker_board_posts";
/// At most this many posts go to or come from one board in one operation.
pub const MAX_POSTS: usize = 5000;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DbConfig {
    /// "sqlite" | "mariadb" | "mysql" | "postgres" | "mssql"
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
    /// SQLite database file (absolute path; empty: the app's own file, filled in by lib.rs).
    #[serde(default)]
    pub file: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Sqlite,
    MySql,
    Postgres,
    MsSql,
}

impl Dialect {
    pub fn default_port(self) -> u16 {
        match self {
            Dialect::Postgres => 5432,
            Dialect::MsSql => 1433,
            _ => 3306,
        }
    }
}

/// One post of a board, as the board block keeps it.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PostRow {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub views: i64,
    #[serde(default)]
    pub notice: bool,
    #[serde(default)]
    pub body: String,
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
            "sqlite" | "sqlite3" => Ok(Dialect::Sqlite),
            "mariadb" | "mysql" => Ok(Dialect::MySql),
            "postgres" | "postgresql" => Ok(Dialect::Postgres),
            "mssql" | "sqlserver" => Ok(Dialect::MsSql),
            other => Err(tr!("지원하지 않는 DB 종류입니다: {other}", "Unsupported database type: {other}")),
        }
    }

    /// Connection URL (never shown to the user: it may hold the password).
    pub fn url(&self) -> Result<String, String> {
        let dialect = self.dialect()?;
        if dialect == Dialect::Sqlite {
            let file = self.file.as_deref().map(str::trim).filter(|f| !f.is_empty()).ok_or_else(|| tr!("SQLite 파일 경로가 없습니다.", "The SQLite file path is missing."))?;
            // "sqlite:" + path (not "sqlite://", which would make a drive letter the URL host).
            return Ok(format!("sqlite:{}?mode=rwc", encode(&file.replace('\\', "/"), "/:")));
        }
        let host = self.host.as_deref().map(str::trim).filter(|h| !h.is_empty()).unwrap_or("localhost");
        let port = self.port.unwrap_or(dialect.default_port());
        let user = self.user.as_deref().unwrap_or("");
        let credentials = match self.password.as_deref() {
            Some(password) if !password.is_empty() => format!("{}:{}@", encode(user, ""), encode(password, "")),
            _ if !user.is_empty() => format!("{}@", encode(user, "")),
            _ => String::new(),
        };
        let scheme = match dialect {
            Dialect::Postgres => "postgres",
            Dialect::MsSql => "mssql",
            _ => "mysql",
        };
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

/// `?` placeholders → `$1, $2, …` for PostgreSQL, `@P1, @P2, …` for SQL Server.
pub fn placeholders(sql: &str, dialect: Dialect) -> String {
    let prefix = match dialect {
        Dialect::Postgres => "$",
        Dialect::MsSql => "@P",
        _ => return sql.to_string(),
    };
    let mut out = String::new();
    let mut n = 0;
    for c in sql.chars() {
        if c == '?' {
            n += 1;
            out.push_str(&format!("{prefix}{n}"));
        } else {
            out.push(c);
        }
    }
    out
}

/// The table, in each database's words. `views` and `notice` are BIGINT so every driver reads them as i64.
pub fn schema(dialect: Dialect) -> String {
    if dialect == Dialect::MsSql {
        // No CREATE TABLE IF NOT EXISTS in SQL Server; NVARCHAR keeps Korean text as Unicode.
        return format!("IF OBJECT_ID(N'{TABLE}', N'U') IS NULL CREATE TABLE {TABLE} (board_id NVARCHAR(80) NOT NULL, post_id NVARCHAR(80) NOT NULL, title NVARCHAR(500) NOT NULL, category NVARCHAR(100) NOT NULL, author NVARCHAR(200) NOT NULL, post_date NVARCHAR(40) NOT NULL, views BIGINT NOT NULL, notice BIGINT NOT NULL, body NVARCHAR(MAX) NOT NULL, created NVARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id))");
    }
    let (text, int, suffix) = match dialect {
        Dialect::MySql => ("LONGTEXT", "BIGINT", " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"),
        Dialect::Sqlite => ("TEXT", "INTEGER", ""),
        _ => ("TEXT", "BIGINT", ""),
    };
    format!("CREATE TABLE IF NOT EXISTS {TABLE} (board_id VARCHAR(80) NOT NULL, post_id VARCHAR(80) NOT NULL, title VARCHAR(500) NOT NULL, category VARCHAR(100) NOT NULL, author VARCHAR(200) NOT NULL, post_date VARCHAR(40) NOT NULL, views {int} NOT NULL, notice {int} NOT NULL, body {text} NOT NULL, created VARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id)){suffix}")
}

/// A text column. Through the Any driver MySQL/MariaDB report LONGTEXT as BLOB, so bytes are accepted too.
fn text(row: &sqlx::any::AnyRow, column: &str) -> Result<String, sqlx::Error> {
    match row.try_get::<String, _>(column) {
        Ok(value) => Ok(value),
        Err(_) => {
            let bytes: Vec<u8> = row.try_get(column)?;
            String::from_utf8(bytes).map_err(|error| sqlx::Error::Decode(Box::new(error)))
        }
    }
}

fn number(row: &sqlx::any::AnyRow, column: &str) -> Result<i64, sqlx::Error> {
    match row.try_get::<i64, _>(column) {
        Ok(value) => Ok(value),
        Err(_) => row.try_get::<i32, _>(column).map(i64::from),
    }
}

/// Text cut to what the column holds (characters, not bytes).
fn cut(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

/// The posts as they are written: an id for every post (kept when it has one), in the given order.
pub fn prepared(posts: &[PostRow]) -> Vec<PostRow> {
    let mut seen = std::collections::HashSet::new();
    posts
        .iter()
        .take(MAX_POSTS)
        .enumerate()
        .map(|(i, post)| {
            let mut id = cut(post.id.trim(), 80);
            if id.is_empty() || !seen.insert(id.clone()) {
                id = format!("p{:05}", i + 1);
                seen.insert(id.clone());
            }
            PostRow { id, title: cut(&post.title, 500), category: cut(&post.category, 100), author: cut(&post.author, 200), date: cut(&post.date, 40), views: post.views.max(0), notice: post.notice, body: post.body.clone() }
        })
        .collect()
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
    failed_text(config, &error)
}

fn failed_text(config: &DbConfig, error: &dyn std::fmt::Display) -> String {
    tr!("DB 작업 실패 ({}): {error}", "Database operation failed ({}): {error}", config.describe())
}

async fn ensure_schema(pool: &AnyPool, dialect: Dialect, config: &DbConfig) -> Result<(), String> {
    sqlx::query(&schema(dialect)).execute(pool).await.map_err(|error| failed(config, error))?;
    Ok(())
}

/// Connects, creates the table if it is missing and reports the server version.
pub async fn test(config: &DbConfig) -> Result<String, String> {
    if config.dialect()? == Dialect::MsSql {
        return mssql::test(config).await;
    }
    let (pool, dialect) = connect(config).await?;
    let sql = match dialect {
        Dialect::Sqlite => "SELECT sqlite_version()",
        Dialect::MySql => "SELECT VERSION()",
        Dialect::Postgres => "SELECT version()",
        Dialect::MsSql => "SELECT @@VERSION",
    };
    let version: String = sqlx::query(sql).fetch_one(&pool).await.and_then(|row| row.try_get(0)).map_err(|error| failed(config, error))?;
    ensure_schema(&pool, dialect, config).await?;
    pool.close().await;
    Ok(version)
}

/// Every post of a board, in the order they were written (oldest first).
pub async fn load(config: &DbConfig, board: &str) -> Result<Vec<PostRow>, String> {
    if config.dialect()? == Dialect::MsSql {
        return mssql::load(config, board).await;
    }
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let rows = sqlx::query(&placeholders(&format!("SELECT post_id, title, category, author, post_date, views, notice, body, created FROM {TABLE} WHERE board_id = ? ORDER BY created, post_id"), dialect))
        .bind(board)
        .fetch_all(&pool)
        .await
        .map_err(|error| failed(config, error))?;
    let posts = rows
        .iter()
        .take(MAX_POSTS)
        .map(|row| -> Result<PostRow, sqlx::Error> {
            Ok(PostRow { id: text(row, "post_id")?, title: text(row, "title")?, category: text(row, "category")?, author: text(row, "author")?, date: text(row, "post_date")?, views: number(row, "views")?, notice: number(row, "notice")? != 0, body: text(row, "body")? })
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(posts)
}

/// The order of the posts as a sortable stamp: "000001", "000002" … (posts written later by the website get the time).
fn order_stamp(i: usize) -> String {
    format!("{:06}", i + 1)
}

/// Replaces a board's posts with these (one transaction): the editor's list becomes the database's.
pub async fn save(config: &DbConfig, board: &str, posts: &[PostRow]) -> Result<usize, String> {
    if board.trim().is_empty() {
        return Err(tr!("게시판 ID가 없습니다.", "The board has no id."));
    }
    let posts = prepared(posts);
    if config.dialect()? == Dialect::MsSql {
        return mssql::save(config, board, &posts).await;
    }
    let (pool, dialect) = connect(config).await?;
    ensure_schema(&pool, dialect, config).await?;
    let q = |sql: &str| placeholders(sql, dialect);
    let mut tx = pool.begin().await.map_err(|error| failed(config, error))?;
    sqlx::query(&q(&format!("DELETE FROM {TABLE} WHERE board_id = ?"))).bind(board).execute(&mut *tx).await.map_err(|error| failed(config, error))?;
    for (i, post) in posts.iter().enumerate() {
        sqlx::query(&q(&format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")))
            .bind(board)
            .bind(&post.id)
            .bind(&post.title)
            .bind(&post.category)
            .bind(&post.author)
            .bind(&post.date)
            .bind(post.views)
            .bind(i64::from(post.notice))
            .bind(&post.body)
            .bind(order_stamp(i))
            .execute(&mut *tx)
            .await
            .map_err(|error| failed(config, error))?;
    }
    tx.commit().await.map_err(|error| failed(config, error))?;
    pool.close().await;
    Ok(posts.len())
}

/// Microsoft SQL Server over TDS (tiberius): the same table and operations as above.
mod mssql {
    use super::{failed_text, order_stamp, placeholders, schema, DbConfig, Dialect, PostRow, MAX_POSTS, TABLE};
    use crate::tr;
    use tiberius::{AuthMethod, Client, Config, Row};
    use tokio::net::TcpStream;
    use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

    type Conn = Client<Compat<TcpStream>>;

    fn failed(config: &DbConfig, error: tiberius::error::Error) -> String {
        failed_text(config, &error)
    }

    /// One connection per operation. The server certificate is trusted as is (SQL Server installs usually have a self-signed one).
    async fn connect(config: &DbConfig) -> Result<Conn, String> {
        let unreachable = |error: &dyn std::fmt::Display| tr!("DB에 연결할 수 없습니다 ({}): {error}", "Could not connect to the database ({}): {error}", config.describe());
        let mut c = Config::new();
        c.host(config.host.as_deref().map(str::trim).filter(|h| !h.is_empty()).unwrap_or("localhost"));
        c.port(config.port.unwrap_or(Dialect::MsSql.default_port()));
        if let Some(database) = config.database.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
            c.database(database);
        }
        c.authentication(AuthMethod::sql_server(config.user.as_deref().unwrap_or(""), config.password.as_deref().unwrap_or("")));
        c.trust_cert();
        let tcp = tokio::time::timeout(std::time::Duration::from_secs(10), TcpStream::connect(c.get_addr()))
            .await
            .map_err(|error| unreachable(&error))?
            .map_err(|error| unreachable(&error))?;
        tcp.set_nodelay(true).ok();
        let mut client = Client::connect(c, tcp.compat_write()).await.map_err(|error| unreachable(&error))?;
        client.simple_query(schema(Dialect::MsSql)).await.map_err(|error| failed(config, error))?.into_results().await.map_err(|error| failed(config, error))?;
        Ok(client)
    }

    fn q(sql: &str) -> String {
        placeholders(sql, Dialect::MsSql)
    }

    fn text(row: &Row, column: &str) -> String {
        row.get::<&str, _>(column).unwrap_or_default().to_string()
    }

    pub async fn test(config: &DbConfig) -> Result<String, String> {
        let mut client = connect(config).await?;
        let row = client.simple_query("SELECT @@VERSION AS version").await.map_err(|error| failed(config, error))?.into_row().await.map_err(|error| failed(config, error))?;
        let version = row.as_ref().map(|row| text(row, "version")).unwrap_or_default();
        client.close().await.ok();
        Ok(version.lines().next().unwrap_or("").trim().to_string())
    }

    pub async fn load(config: &DbConfig, board: &str) -> Result<Vec<PostRow>, String> {
        let mut client = connect(config).await?;
        let rows = client
            .query(q(&format!("SELECT post_id, title, category, author, post_date, views, notice, body FROM {TABLE} WHERE board_id = ? ORDER BY created, post_id")), &[&board])
            .await
            .map_err(|error| failed(config, error))?
            .into_first_result()
            .await
            .map_err(|error| failed(config, error))?;
        client.close().await.ok();
        Ok(rows
            .iter()
            .take(MAX_POSTS)
            .map(|row| PostRow {
                id: text(row, "post_id"),
                title: text(row, "title"),
                category: text(row, "category"),
                author: text(row, "author"),
                date: text(row, "post_date"),
                views: row.get::<i64, _>("views").unwrap_or(0),
                notice: row.get::<i64, _>("notice").unwrap_or(0) != 0,
                body: text(row, "body"),
            })
            .collect())
    }

    pub async fn save(config: &DbConfig, board: &str, posts: &[PostRow]) -> Result<usize, String> {
        let mut client = connect(config).await?;
        client.simple_query("BEGIN TRANSACTION").await.map_err(|error| failed(config, error))?.into_results().await.map_err(|error| failed(config, error))?;
        let written = async {
            client.execute(q(&format!("DELETE FROM {TABLE} WHERE board_id = ?")), &[&board]).await?;
            for (i, post) in posts.iter().enumerate() {
                let stamp = order_stamp(i);
                let notice = i64::from(post.notice);
                client
                    .execute(
                        q(&format!("INSERT INTO {TABLE} (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")),
                        &[&board, &post.id.as_str(), &post.title.as_str(), &post.category.as_str(), &post.author.as_str(), &post.date.as_str(), &post.views, &notice, &post.body.as_str(), &stamp.as_str()],
                    )
                    .await?;
            }
            Ok::<(), tiberius::error::Error>(())
        }
        .await;
        let end = if written.is_ok() { "COMMIT TRANSACTION" } else { "IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION" };
        let ended = match client.simple_query(end).await {
            Ok(stream) => stream.into_results().await.map(|_| ()),
            Err(error) => Err(error),
        };
        client.close().await.ok();
        written.map_err(|error| failed(config, error))?;
        ended.map_err(|error| failed(config, error))?;
        Ok(posts.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sqlite(path: &std::path::Path) -> DbConfig {
        DbConfig { kind: "sqlite".into(), host: None, port: None, database: None, user: None, password: None, file: Some(path.to_string_lossy().to_string()) }
    }

    fn post(id: &str, title: &str, notice: bool) -> PostRow {
        PostRow { id: id.into(), title: title.into(), category: "공지".into(), author: "관리자".into(), date: "2026-11-09".into(), views: 12, notice, body: format!("{title}\n본문 {}", "가".repeat(300)) }
    }

    #[test]
    fn urls_for_each_database() {
        let mut config = DbConfig { kind: "mariadb".into(), host: Some("db.local".into()), port: None, database: Some("site".into()), user: Some("me".into()), password: Some("p@ss:w/rd#1".into()), file: None };
        assert_eq!(config.url().unwrap(), "mysql://me:p%40ss%3Aw%2Frd%231@db.local:3306/site");
        config.kind = "mysql".into();
        assert_eq!(config.url().unwrap(), "mysql://me:p%40ss%3Aw%2Frd%231@db.local:3306/site");
        config.kind = "postgres".into();
        assert_eq!(config.url().unwrap(), "postgres://me:p%40ss%3Aw%2Frd%231@db.local:5432/site");
        config.kind = "mssql".into();
        assert_eq!(config.url().unwrap(), "mssql://me:p%40ss%3Aw%2Frd%231@db.local:1433/site");
        assert!(!config.describe().contains("p@ss"), "descriptions never contain the password");
        let lite = DbConfig { kind: "sqlite3".into(), host: None, port: None, database: None, user: None, password: None, file: Some(r"C:\내 폴더\a#b.db".into()) };
        assert_eq!(lite.url().unwrap(), "sqlite:C:/%EB%82%B4%20%ED%8F%B4%EB%8D%94/a%23b.db?mode=rwc");
        assert!(DbConfig { kind: "oracle".into(), ..lite.clone() }.url().is_err());
        assert!(DbConfig { file: None, ..lite }.url().is_err());
    }

    #[test]
    fn schemas_and_placeholders() {
        assert_eq!(placeholders("a = ? AND b = ?", Dialect::Postgres), "a = $1 AND b = $2");
        assert_eq!(placeholders("a = ? AND b = ?", Dialect::MsSql), "a = @P1 AND b = @P2");
        assert_eq!(placeholders("a = ?", Dialect::MySql), "a = ?");
        assert!(schema(Dialect::MySql).contains("utf8mb4") && schema(Dialect::MySql).contains("LONGTEXT"));
        assert!(schema(Dialect::Postgres).contains("BIGINT") && schema(Dialect::Postgres).contains("PRIMARY KEY (board_id, post_id)"));
        let ddl = schema(Dialect::MsSql);
        assert!(ddl.starts_with("IF OBJECT_ID(") && ddl.contains("NVARCHAR(MAX)"), "{ddl}");
    }

    #[test]
    fn posts_get_unique_ids_and_fit_their_columns() {
        let list = prepared(&[post("", "a", false), post("x", "b", false), post("x", "c", false), PostRow { views: -5, title: "t".repeat(600), ..post("y", "", false) }]);
        assert_eq!(list.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["p00001", "x", "p00003", "y"]);
        assert_eq!(list[3].views, 0);
        assert_eq!(list[3].title.chars().count(), 500);
    }

    #[test]
    fn sqlite_save_and_load_a_board() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("데이터 폴더").join("board test.db");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let config = sqlite(&path);
        tauri::async_runtime::block_on(async {
            assert!(test(&config).await.unwrap().starts_with('3'), "SQLite 3.x");
            assert_eq!(load(&config, "b1").await.unwrap(), vec![], "a new database has no posts");
            let posts = vec![post("p1", "게시판 안내 😀", true), post("p2", "Second", false)];
            assert_eq!(save(&config, "b1", &posts).await.unwrap(), 2);
            assert_eq!(load(&config, "b1").await.unwrap(), posts);
            // Saving again replaces the board's posts; other boards stay.
            save(&config, "b2", &[post("q", "Other board", false)]).await.unwrap();
            let changed = vec![post("p2", "Second, changed", false)];
            save(&config, "b1", &changed).await.unwrap();
            assert_eq!(load(&config, "b1").await.unwrap(), changed);
            assert_eq!(load(&config, "b2").await.unwrap().len(), 1);
            assert!(save(&config, " ", &changed).await.is_err(), "a board needs an id");
        });
        assert!(path.is_file());
    }

    #[test]
    fn connection_errors_are_reported_without_the_password() {
        let config = DbConfig { kind: "mysql".into(), host: Some("127.0.0.1".into()), port: Some(1), database: Some("x".into()), user: Some("u".into()), password: Some("secret-pw".into()), file: None };
        let error = tauri::async_runtime::block_on(test(&config)).unwrap_err();
        assert!(!error.contains("secret-pw") && error.contains("127.0.0.1"), "{error}");
        let config = DbConfig { kind: "postgres".into(), ..config };
        let error = tauri::async_runtime::block_on(test(&config)).unwrap_err();
        assert!(!error.contains("secret-pw"), "{error}");
        let config = DbConfig { kind: "mssql".into(), ..config };
        let error = tauri::async_runtime::block_on(test(&config)).unwrap_err();
        assert!(!error.contains("secret-pw") && error.contains("127.0.0.1"), "SQL Server too: {error}");
    }
}
