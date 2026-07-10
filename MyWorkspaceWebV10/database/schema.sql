-- MyWorkspace SQLite schema reference
-- Runtime schema is applied by src/main/db/schema.js (DbInitializer equivalent)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'User',
    display_name TEXT,
    email TEXT,
    notify_on_page_update INTEGER NOT NULL DEFAULT 0,
    notify_on_workspace_change INTEGER NOT NULL DEFAULT 0,
    notify_on_comment INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    locked_by_user_id INTEGER,
    locked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    locked_by_user_id INTEGER,
    locked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'Viewer',
    PRIMARY KEY (workspace_id, user_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_favorites (
    user_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, workspace_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    saved_by_user_id INTEGER NOT NULL,
    saved_at TEXT NOT NULL,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    FOREIGN KEY (saved_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_page_versions_page_saved ON page_versions (page_id, saved_at);

CREATE TABLE IF NOT EXISTS page_change_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS page_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    quoted_text TEXT,
    parent_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES page_comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comment_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (comment_id) REFERENCES page_comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    actor_user_id INTEGER NOT NULL,
    actor_username TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    page_id INTEGER,
    created_at TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE SET NULL
);
