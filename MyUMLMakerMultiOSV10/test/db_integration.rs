//! Plan storage against real database servers.
//!
//! The servers come from environment variables (set by `npm test` from the
//! git-ignored test/db.local.json, or by hand):
//!   MYUMLMAKER_TEST_MYSQL_URL     mysql://user:password@host:port      (MariaDB or MySQL)
//!   MYUMLMAKER_TEST_POSTGRES_URL  postgres://user:password@host:port
//!   MYUMLMAKER_TEST_MSSQL_URL     mssql://user:password@host:port      (Microsoft SQL Server)
//! Each test creates a database of its own (myumlmaker_test_<pid>), uses it
//! through the app's storage code, and drops it again. Without a MySQL/MariaDB
//! URL (or a SQL Server URL) that test is skipped (reported as SKIP). Without a PostgreSQL URL the
//! test starts a temporary PostgreSQL server of its own (postgresql_embedded:
//! the binaries are downloaded on first use and cached), so it always runs.
use myumlmaker_lib::db::{self, DbConfig, PlanRow};
use sqlx::any::{install_default_drivers, AnyPoolOptions};

#[derive(Clone)]
struct Server {
    kind: &'static str,
    user: String,
    password: String,
    host: String,
    port: u16,
    url: String,
}

fn server(variable: &str, kind: &'static str) -> Option<Server> {
    let url = std::env::var(variable).ok().filter(|url| !url.trim().is_empty())?;
    // scheme://user:password@host:port[/...]
    let rest = url.split_once("://")?.1;
    let (credentials, address) = rest.rsplit_once('@')?;
    let (user, password) = credentials.split_once(':').unwrap_or((credentials, ""));
    let address = address.split('/').next()?;
    let (host, port) = address.rsplit_once(':').map(|(h, p)| (h, p.parse().unwrap_or(0))).unwrap_or((address, 0));
    let decode = |text: &str| {
        let bytes = text.as_bytes();
        let mut out = Vec::new();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' && i + 2 < bytes.len() {
                out.push(u8::from_str_radix(&text[i + 1..i + 3], 16).unwrap_or(b'?'));
                i += 3;
            } else {
                out.push(bytes[i]);
                i += 1;
            }
        }
        String::from_utf8_lossy(&out).to_string()
    };
    let url = url.trim_end_matches('/');
    let url = if url.matches('/').count() > 2 { url[..url.rfind('/').unwrap()].to_string() } else { url.to_string() };
    Some(Server { kind, user: decode(user), password: decode(password), host: host.to_string(), port, url })
}

async fn admin(server: &Server, statement: &str) {
    if server.kind == "mssql" {
        return admin_mssql(server, statement).await;
    }
    install_default_drivers();
    let base = if server.kind == "postgres" { format!("{}/postgres", server.url) } else { format!("{}/", server.url) };
    let pool = AnyPoolOptions::new().max_connections(1).connect(&base).await.expect("admin connection");
    sqlx::query(statement).execute(&pool).await.expect(statement);
    pool.close().await;
}

/// SQL Server has no sqlx driver: the admin statements go through tiberius like the app does.
async fn admin_mssql(server: &Server, statement: &str) {
    use tokio_util::compat::TokioAsyncWriteCompatExt;
    let mut config = tiberius::Config::new();
    config.host(&server.host);
    config.port(if server.port == 0 { 1433 } else { server.port });
    config.authentication(tiberius::AuthMethod::sql_server(&server.user, &server.password));
    config.trust_cert();
    let tcp = tokio::net::TcpStream::connect(config.get_addr()).await.expect("admin connection");
    let mut client = tiberius::Client::connect(config, tcp.compat_write()).await.expect("admin login");
    client.simple_query(statement).await.expect(statement).into_results().await.expect(statement);
}

fn plan(id: &str, title: &str, tasks: usize) -> PlanRow {
    let body = (0..tasks).map(|i| format!(r#"{{"id":"t{i}","name":"작업 {i} 😀 {}"}}"#, "한".repeat(500))).collect::<Vec<_>>().join(",");
    PlanRow { id: id.into(), title: title.into(), data: format!(r#"{{"format":"myumlmaker","project":{{"id":"{id}","title":"{title}","tasks":[{body}]}}}}"#) }
}

async fn exercise(server: Server, kind: &str) {
    let database = format!("myumlmaker_test_{}", std::process::id());
    admin(&server, &format!("DROP DATABASE IF EXISTS {database}")).await;
    admin(&server, &format!("CREATE DATABASE {database}")).await;
    let config = DbConfig {
        kind: kind.into(),
        host: Some(server.host.clone()),
        port: Some(server.port),
        database: Some(database.clone()),
        user: Some(server.user.clone()),
        password: Some(server.password.clone()),
        file: None,
    };
    let result = async {
        let version = db::test(&config).await?;
        println!("{kind} server {version}");
        assert!(db::list(&config).await?.is_empty(), "a new database has no plans");
        // ~1 MB of Korean text and emoji: LONGTEXT on MySQL/MariaDB, TEXT on PostgreSQL, NVARCHAR(MAX) on SQL Server.
        let big = plan("prj-db", "DB 계획 😀", 600);
        assert!(big.data.len() > 900_000, "{}", big.data.len());
        db::save(&config, &big).await?;
        assert_eq!(db::load(&config, "prj-db").await?.as_ref(), Some(&big), "plan text (UTF-8, emoji, 1 MB)");
        let changed = plan("prj-db", "DB 계획 v2", 3);
        db::save(&config, &changed).await?;
        assert_eq!(db::load(&config, "prj-db").await?, Some(changed.clone()), "saving again replaces the plan");
        db::save(&config, &plan("prj-other", "Other plan", 1)).await?;
        let list = db::list(&config).await?;
        assert_eq!(list.len(), 2);
        let entry = list.iter().find(|item| item.id == "prj-db").expect("listed");
        assert_eq!(entry.title, "DB 계획 v2");
        assert_eq!(entry.size, changed.data.len() as i64);
        db::delete(&config, "prj-db").await?;
        assert!(db::load(&config, "prj-db").await?.is_none());
        assert_eq!(db::list(&config).await?.len(), 1);
        Ok::<(), String>(())
    }
    .await;
    admin(&server, &format!("DROP DATABASE IF EXISTS {database}")).await;
    result.expect("storage round trip");
}

#[test]
fn mariadb_or_mysql_round_trip() {
    match server("MYUMLMAKER_TEST_MYSQL_URL", "mysql") {
        Some(server) => tauri::async_runtime::block_on(async {
            // Both names the Settings tab offers go through the same driver.
            exercise(server.clone(), "mariadb").await;
            exercise(server, "mysql").await;
        }),
        None => println!("SKIP: MYUMLMAKER_TEST_MYSQL_URL is not set (test/db.local.json \"mysql\")"),
    }
}

#[test]
fn postgres_round_trip() {
    tauri::async_runtime::block_on(async {
        if let Some(server) = server("MYUMLMAKER_TEST_POSTGRES_URL", "postgres") {
            return exercise(server, "postgres").await;
        }
        // The first initdb on Windows can take far longer than the 5 s default.
        let settings = postgresql_embedded::Settings { timeout: Some(std::time::Duration::from_secs(180)), ..Default::default() };
        let mut postgres = postgresql_embedded::PostgreSQL::new(settings);
        postgres.setup().await.expect("PostgreSQL setup (download on first use)");
        postgres.start().await.expect("PostgreSQL start");
        let settings = postgres.settings();
        println!("temporary PostgreSQL on port {}", settings.port);
        let server = Server {
            kind: "postgres",
            user: settings.username.clone(),
            password: settings.password.clone(),
            host: settings.host.clone(),
            port: settings.port,
            url: format!("postgres://{}:{}@{}:{}", settings.username, settings.password, settings.host, settings.port),
        };
        exercise(server, "postgres").await;
        postgres.stop().await.expect("PostgreSQL stop");
    });
}

#[test]
fn sql_server_round_trip() {
    match server("MYUMLMAKER_TEST_MSSQL_URL", "mssql") {
        Some(server) => tauri::async_runtime::block_on(exercise(server, "mssql")),
        None => println!("SKIP: MYUMLMAKER_TEST_MSSQL_URL is not set (test/db.local.json \"mssql\")"),
    }
}
