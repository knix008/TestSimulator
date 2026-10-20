use std::path::Path;
use std::time::Duration;

use rusqlite::{Connection, OpenFlags};

use crate::error::DeskError;
use crate::inclusion::normalize_stored_path;
use crate::memory::{insert_top, MAX_SEARCH_RESULTS};
use crate::model::FileEntry;
use crate::query::{ResolvedQuery, SearchTerm, TermKind};
use crate::score::{score_query, ScoredEntry};
use crate::sort::{sort_scored, sql_order_by, SearchResultSortOrder};
use crate::text::{escape_like, wildcard_like_patterns};

const PAGE_SIZE: i64 = 20_000;

pub struct IndexStore {
    conn: Connection,
}

impl IndexStore {
    pub fn create(path: &Path) -> Result<Self, DeskError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        let store = Self { conn };
        store.configure()?;
        store.ensure_schema()?;
        Ok(store)
    }

    pub fn open_reader(path: &Path) -> Result<Self, DeskError> {
        let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        Ok(Self { conn })
    }

    fn configure(&self) -> Result<(), DeskError> {
        self.conn.busy_timeout(Duration::from_secs(5))?;
        self.conn.execute_batch(
            "
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            PRAGMA temp_store=MEMORY;
            PRAGMA cache_size=-65536;
            ",
        )?;
        Ok(())
    }

    fn ensure_schema(&self) -> Result<(), DeskError> {
        let path_unique = if cfg!(windows) {
            "TEXT NOT NULL UNIQUE COLLATE NOCASE"
        } else {
            "TEXT NOT NULL UNIQUE"
        };
        self.conn.execute_batch(&format!(
            "
            CREATE TABLE IF NOT EXISTS entries(
                id INTEGER PRIMARY KEY,
                full_path {path_unique},
                file_name TEXT NOT NULL,
                directory TEXT NOT NULL,
                is_directory INTEGER NOT NULL,
                search_file_name TEXT NOT NULL,
                modified_utc INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_entries_search_file_name ON entries(search_file_name);
            CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
                search_file_name,
                content='entries',
                content_rowid='id',
                tokenize='trigram case_sensitive 0'
            );
            CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
                INSERT INTO entries_fts(rowid, search_file_name)
                VALUES (new.id, new.search_file_name);
            END;
            CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
                INSERT INTO entries_fts(entries_fts, rowid, search_file_name)
                VALUES ('delete', old.id, old.search_file_name);
            END;
            CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE ON entries
            WHEN old.search_file_name != new.search_file_name
            BEGIN
                INSERT INTO entries_fts(entries_fts, rowid, search_file_name)
                VALUES ('delete', old.id, old.search_file_name);
                INSERT INTO entries_fts(rowid, search_file_name)
                VALUES (new.id, new.search_file_name);
            END;
            PRAGMA user_version = 1;
            "
        ))?;
        Ok(())
    }

    pub fn upsert(&self, entries: &[FileEntry]) -> Result<u64, DeskError> {
        if entries.is_empty() {
            return Ok(0);
        }
        let tx = self.conn.unchecked_transaction()?;
        let mut changed = 0_u64;
        {
            let mut stmt = tx.prepare(
                "
                INSERT INTO entries(full_path, file_name, directory, is_directory, search_file_name, modified_utc)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(full_path) DO UPDATE SET
                    file_name = excluded.file_name,
                    directory = excluded.directory,
                    is_directory = excluded.is_directory,
                    search_file_name = excluded.search_file_name,
                    modified_utc = excluded.modified_utc
                WHERE entries.file_name != excluded.file_name
                   OR entries.directory != excluded.directory
                   OR entries.is_directory != excluded.is_directory
                   OR entries.search_file_name != excluded.search_file_name
                   OR entries.modified_utc != excluded.modified_utc
                ",
            )?;
            for entry in entries {
                changed += stmt.execute(rusqlite::params![
                    entry.full_path,
                    entry.file_name,
                    entry.directory,
                    entry.is_directory as i64,
                    entry.search_file_name,
                    entry.modified_utc
                ])? as u64;
            }
        }
        tx.commit()?;
        Ok(changed)
    }

    pub fn delete_tree(&self, path: &str) -> Result<u64, DeskError> {
        let stored = normalize_stored_path(path);
        let child_like = child_like_pattern(&stored);
        let changed = self.conn.execute(
            "DELETE FROM entries WHERE full_path = ?1 OR full_path LIKE ?2 ESCAPE '\\'",
            rusqlite::params![stored, child_like],
        )?;
        Ok(changed as u64)
    }

    pub fn paths_under(&self, root: &str) -> Result<Vec<String>, DeskError> {
        let stored = normalize_stored_path(root);
        let child_like = child_like_pattern(&stored);
        let mut stmt = self.conn.prepare(
            "SELECT full_path FROM entries WHERE full_path = ?1 OR full_path LIKE ?2 ESCAPE '\\'",
        )?;
        let rows = stmt.query_map(rusqlite::params![stored, child_like], |row| row.get(0))?;
        let mut paths = Vec::new();
        for row in rows {
            paths.push(row?);
        }
        Ok(paths)
    }

    pub fn count(&self) -> Result<u64, DeskError> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM entries", [], |row| row.get(0))?;
        Ok(count as u64)
    }

    pub fn rebuild_fts(&self) -> Result<(), DeskError> {
        self.conn.execute(
            "INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')",
            [],
        )?;
        Ok(())
    }

    pub fn checkpoint(&self) -> Result<(), DeskError> {
        self.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        Ok(())
    }

    pub fn search(
        &self,
        query: &ResolvedQuery,
        case_sensitive: bool,
        sort: SearchResultSortOrder,
        limit: usize,
    ) -> Result<Vec<FileEntry>, DeskError> {
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let limit = limit.min(MAX_SEARCH_RESULTS);
        if query.is_regex {
            return self.search_regex(query, case_sensitive, sort, limit);
        }
        self.conn.execute_batch(&format!(
            "PRAGMA case_sensitive_like = {};",
            if case_sensitive { "ON" } else { "OFF" }
        ))?;
        match self.search_sql(query, case_sensitive, sort, limit, true) {
            Ok(rows) => Ok(rows),
            Err(DeskError::Sqlite(error)) if is_fts_error(&error) => {
                self.search_sql(query, case_sensitive, sort, limit, false)
            }
            Err(error) => Err(error),
        }
    }

    fn search_sql(
        &self,
        query: &ResolvedQuery,
        case_sensitive: bool,
        sort: SearchResultSortOrder,
        limit: usize,
        allow_fts: bool,
    ) -> Result<Vec<FileEntry>, DeskError> {
        let built = build_search_sql(query, case_sensitive, sort, limit, allow_fts);
        let mut stmt = self.conn.prepare(&built.sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(built.params.iter()), read_entry)?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    fn search_regex(
        &self,
        query: &ResolvedQuery,
        case_sensitive: bool,
        sort: SearchResultSortOrder,
        limit: usize,
    ) -> Result<Vec<FileEntry>, DeskError> {
        let mut last_id = 0_i64;
        let mut matches = Vec::new();
        loop {
            let mut stmt = self.conn.prepare(
                "
                SELECT id, full_path, file_name, directory, is_directory, modified_utc, search_file_name
                FROM entries
                WHERE id > ?1
                ORDER BY id
                LIMIT ?2
                ",
            )?;
            let rows = stmt.query_map(rusqlite::params![last_id, PAGE_SIZE], |row| {
                let id: i64 = row.get(0)?;
                Ok((id, read_entry_at(row, 1)?))
            })?;
            let mut page = 0_i64;
            for row in rows {
                let (id, entry) = row?;
                last_id = id;
                page += 1;
                let score = score_query(&entry, query, case_sensitive);
                if score > 0 {
                    insert_top(&mut matches, ScoredEntry { entry, score }, limit);
                }
            }
            if page < PAGE_SIZE {
                break;
            }
        }
        let mut ordered = sort_scored(matches, sort, case_sensitive);
        ordered.truncate(limit);
        Ok(ordered)
    }
}

fn is_fts_error(error: &rusqlite::Error) -> bool {
    error.to_string().to_lowercase().contains("fts")
}

struct BuiltSql {
    sql: String,
    params: Vec<String>,
}

fn build_search_sql(
    query: &ResolvedQuery,
    case_sensitive: bool,
    sort: SearchResultSortOrder,
    limit: usize,
    allow_fts: bool,
) -> BuiltSql {
    let mut params = Vec::new();
    let mut group_filters = Vec::new();
    let mut group_scores = Vec::new();
    for group in &query.or_groups {
        let mut filters = Vec::new();
        let mut scores = Vec::new();
        for term in group {
            let (filter, score) = bind_term(&mut params, term, case_sensitive, allow_fts);
            filters.push(filter);
            scores.push(score);
        }
        group_filters.push(join_logic(&filters, "AND"));
        group_scores.push(if scores.len() == 1 {
            scores.remove(0)
        } else {
            format!("MIN({})", scores.join(", "))
        });
    }
    let where_sql = join_logic(&group_filters, "OR");
    let score_sql = if group_scores.len() == 1 {
        group_scores.remove(0)
    } else {
        format!("MAX({})", group_scores.join(", "))
    };
    params.push(limit.to_string());
    let limit_token = format!("?{}", params.len());
    let order = sql_order_by(sort, case_sensitive, &score_sql);
    let sql = format!(
        "
        SELECT e.full_path, e.file_name, e.directory, e.is_directory, e.modified_utc, e.search_file_name
        FROM entries e
        WHERE ({where_sql}) AND ({score_sql}) > 0
        ORDER BY {order}
        LIMIT {limit_token}
        "
    );
    BuiltSql { sql, params }
}

fn join_logic(parts: &[String], op: &str) -> String {
    if parts.len() == 1 {
        parts[0].clone()
    } else {
        format!("({})", parts.join(&format!(" {op} ")))
    }
}

fn bind_term(
    params: &mut Vec<String>,
    term: &SearchTerm,
    case_sensitive: bool,
    allow_fts: bool,
) -> (String, String) {
    let (exact, prefix_like, contains_like, use_fts) = match &term.kind {
        TermKind::Literal => {
            let exact = term.normalized.clone();
            let escaped = escape_like(&exact);
            let use_fts = allow_fts && !case_sensitive && exact.chars().count() >= 3;
            (
                exact,
                format!("{escaped}%"),
                format!("%{escaped}%"),
                use_fts,
            )
        }
        TermKind::Wildcard => {
            let (exact, prefix_like, contains_like) = wildcard_like_patterns(&term.text);
            (exact.unwrap_or_default(), prefix_like, contains_like, false)
        }
        TermKind::Regex(_) => (String::new(), "%".to_string(), "%".to_string(), false),
    };
    let exact_token = bind(params, exact);
    let prefix_token = bind(params, prefix_like);
    let contains_token = bind(params, contains_like);
    let equals = if case_sensitive {
        format!("e.search_file_name = {exact_token}")
    } else {
        format!("lower(e.search_file_name) = lower({exact_token})")
    };
    let score = format!(
        "CASE WHEN length({exact_token}) > 0 AND {equals} THEN 100 WHEN e.search_file_name LIKE {prefix_token} ESCAPE '\\' THEN 80 WHEN e.search_file_name LIKE {contains_token} ESCAPE '\\' THEN 60 ELSE 0 END"
    );
    let filter = if use_fts {
        format!(
            "e.id IN (SELECT rowid FROM entries_fts WHERE search_file_name LIKE {contains_token} ESCAPE '\\')"
        )
    } else {
        format!("e.search_file_name LIKE {contains_token} ESCAPE '\\'")
    };
    (filter, score)
}

fn bind(params: &mut Vec<String>, value: String) -> String {
    params.push(value);
    format!("?{}", params.len())
}

fn read_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileEntry> {
    read_entry_at(row, 0)
}

fn read_entry_at(row: &rusqlite::Row<'_>, start: usize) -> rusqlite::Result<FileEntry> {
    let full_path: String = row.get(start)?;
    let file_name: String = row.get(start + 1)?;
    let directory: String = row.get(start + 2)?;
    let is_directory: i64 = row.get(start + 3)?;
    let modified_utc: i64 = row.get(start + 4)?;
    Ok(FileEntry::new(
        full_path,
        file_name,
        directory,
        is_directory != 0,
        modified_utc,
    ))
}

fn child_like_pattern(stored: &str) -> String {
    let prefix = if stored.ends_with(['\\', '/']) || stored == "/" {
        stored.to_string()
    } else if crate::inclusion::normalize_stored_path(stored).contains('\\')
        || (stored.len() >= 2 && stored.as_bytes()[1] == b':')
    {
        format!("{stored}\\")
    } else {
        format!("{stored}/")
    };
    format!("{}%", escape_like(&prefix))
}
