//! Project storage against real database servers.
//!
//! The servers come from environment variables (set by `npm test` from the
//! git-ignored test/db.local.json, or by hand):
//!   MYKANBAN_TEST_MYSQL_URL     mysql://user:password@host:port      (MariaDB or MySQL)
//!   MYKANBAN_TEST_POSTGRES_URL  postgres://user:password@host:port
//! Each test creates a database of its own (mykanban_test_<random>), uses it
//! through the app's storage code, and drops it again. Without a PostgreSQL URL
//! the test starts a temporary PostgreSQL server of its own (postgresql_embedded:
//! the binaries are downloaded on first use and cached), so it always runs.
use mykanbanboard_lib::db::{self, BoardRow, DbConfig, ProjectRow};
use sqlx::any::{install_default_drivers, AnyPoolOptions};

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
    Some(Server { kind, user: decode(user), password: decode(password), host: host.to_string(), port, url: url.trim_end_matches('/').to_string() })
}

async fn admin(server: &Server, statement: &str) {
    install_default_drivers();
    let base = if server.kind == "postgres" { format!("{}/postgres", server.url) } else { format!("{}/", server.url) };
    let pool = AnyPoolOptions::new().max_connections(1).connect(&base).await.expect("admin connection");
    sqlx::query(statement).execute(&pool).await.expect(statement);
    pool.close().await;
}

async fn exercise(server: Server) {
    let database = format!("mykanban_test_{}", std::process::id());
    admin(&server, &format!("DROP DATABASE IF EXISTS {database}")).await;
    admin(&server, &format!("CREATE DATABASE {database}")).await;
    let config = DbConfig {
        kind: if server.kind == "postgres" { "postgres".into() } else { "mariadb".into() },
        host: Some(server.host.clone()),
        port: Some(server.port),
        database: Some(database.clone()),
        user: Some(server.user.clone()),
        password: Some(server.password.clone()),
        file: None,
    };
    let result = async {
        let version = db::test(&config).await?;
        println!("{} server {version}", server.kind);
        let project = ProjectRow { id: "proj-db".into(), name: "DB 프로젝트 😀".into(), data: r#"{"name":"DB 프로젝트 😀"}"#.into() };
        let boards: Vec<BoardRow> = (0..4)
            .map(|i| BoardRow { id: format!("b{i}"), title: format!("보드 {i}"), data: format!(r#"{{"title":"보드 {i}","big":"{}"}}"#, "한".repeat(100_000)) })
            .collect();
        db::save(&config, &project, &boards).await?;
        let loaded = db::load(&config, "proj-db").await?;
        assert_eq!(loaded.project.as_ref(), Some(&project), "project row (UTF-8, emoji)");
        assert_eq!(loaded.boards, boards, "boards (300 KB each, order)");
        let fewer = vec![boards[3].clone(), boards[1].clone()];
        db::save(&config, &project, &fewer).await?;
        assert_eq!(db::load(&config, "proj-db").await?.boards, fewer);
        let list = db::list(&config).await?;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].boards, 2);
        db::delete(&config, "proj-db").await?;
        assert!(db::load(&config, "proj-db").await?.project.is_none());
        Ok::<(), String>(())
    }
    .await;
    admin(&server, &format!("DROP DATABASE IF EXISTS {database}")).await;
    result.expect("storage round trip");
}

#[test]
fn mariadb_or_mysql_round_trip() {
    match server("MYKANBAN_TEST_MYSQL_URL", "mysql") {
        Some(server) => tauri::async_runtime::block_on(exercise(server)),
        None => println!("SKIP: MYKANBAN_TEST_MYSQL_URL is not set"),
    }
}

#[test]
fn postgres_round_trip() {
    tauri::async_runtime::block_on(async {
        if let Some(server) = server("MYKANBAN_TEST_POSTGRES_URL", "postgres") {
            return exercise(server).await;
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
        exercise(server).await;
        postgres.stop().await.expect("PostgreSQL stop");
    });
}
