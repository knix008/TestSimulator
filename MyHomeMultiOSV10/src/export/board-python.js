// The Python board server written next to a published site. SQLite3 uses the standard library.
// MySQL, MariaDB, PostgreSQL and MSSQL each add one package in requirements.txt. The HTTP API
// matches server.js. The password is read from DB_PASSWORD and is never written into the files.

const PY_REQUIRE = {
  sqlite: '# SQLite3 is in the Python standard library. Nothing to install.\n',
  mysql: 'pymysql>=1.1.1\n',
  mariadb: 'pymysql>=1.1.1\n',
  postgres: 'psycopg[binary]>=3.2.0\n',
  mssql: 'pymssql>=2.3.0\n',
};

/** server/server.py and server/requirements.txt for the chosen database kind. */
export function pythonServerFiles(kind) {
  return [
    { path: 'server/server.py', data: SERVER_PY },
    { path: 'server/requirements.txt', data: PY_REQUIRE[kind] ?? PY_REQUIRE.sqlite },
  ];
}

const SERVER_PY = `# MyHomeMaker board server (Python): the site in config.siteDir and the board API.
import json
import os
import pathlib
import datetime
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = pathlib.Path.cwd().resolve()
CONFIG = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
SITE = (HERE / str(CONFIG.get("siteDir") or "..")).resolve()
API = str(CONFIG.get("api") or "/api/board").rstrip("/")
TABLE = "myhomemaker_board_posts"
DB = CONFIG.get("database") or {}
KIND = str(DB.get("kind") or "sqlite")
BOARDS = CONFIG.get("boards") or {}
TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
}

def marks(sql):
    return sql if KIND == "sqlite" else sql.replace("?", "%s")

def schema():
    if KIND == "mssql":
        return ("IF OBJECT_ID(N'" + TABLE + "', N'U') IS NULL CREATE TABLE " + TABLE
            + " (board_id NVARCHAR(80) NOT NULL, post_id NVARCHAR(80) NOT NULL, title NVARCHAR(500) NOT NULL,"
            + " category NVARCHAR(100) NOT NULL, author NVARCHAR(200) NOT NULL, post_date NVARCHAR(40) NOT NULL,"
            + " views BIGINT NOT NULL, notice BIGINT NOT NULL, body NVARCHAR(MAX) NOT NULL, created NVARCHAR(40) NOT NULL,"
            + " PRIMARY KEY (board_id, post_id))")
    text, integer, suffix = "TEXT", "BIGINT", ""
    if KIND in ("mysql", "mariadb"):
        text, integer, suffix = "LONGTEXT", "BIGINT", " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    elif KIND == "sqlite":
        integer = "INTEGER"
    return ("CREATE TABLE IF NOT EXISTS " + TABLE + " (board_id VARCHAR(80) NOT NULL, post_id VARCHAR(80) NOT NULL,"
        + " title VARCHAR(500) NOT NULL, category VARCHAR(100) NOT NULL, author VARCHAR(200) NOT NULL,"
        + " post_date VARCHAR(40) NOT NULL, views " + integer + " NOT NULL, notice " + integer + " NOT NULL,"
        + " body " + text + " NOT NULL, created VARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id))" + suffix)

class Store:
    def __init__(self):
        password = os.environ.get("DB_PASSWORD", "")
        if KIND == "sqlite":
            import sqlite3
            file = str(DB.get("file") or "board.db")
            path = pathlib.Path(file)
            if not path.is_absolute():
                path = HERE / file
            self.db = sqlite3.connect(path)
            self.db.row_factory = sqlite3.Row
        elif KIND in ("mysql", "mariadb"):
            import pymysql
            import pymysql.cursors
            self.db = pymysql.connect(host=DB.get("host") or "localhost", port=int(DB.get("port") or 3306), user=DB.get("user") or "", password=password, database=DB.get("database") or "myhomemaker", charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor)
        elif KIND == "postgres":
            import psycopg
            from psycopg.rows import dict_row
            self.db = psycopg.connect(host=DB.get("host") or "localhost", port=int(DB.get("port") or 5432), user=DB.get("user") or "", password=password, dbname=DB.get("database") or "myhomemaker", sslmode="disable", row_factory=dict_row)
        elif KIND == "mssql":
            import pymssql
            self.db = pymssql.connect(server=DB.get("host") or "localhost", port=int(DB.get("port") or 1433), user=DB.get("user") or "", password=password, database=DB.get("database") or "myhomemaker")
        else:
            raise SystemExit("unknown database")
        self.run(schema())
        self.seed()

    def cursor(self):
        if KIND == "mssql":
            return self.db.cursor(as_dict=True)
        return self.db.cursor()

    def run(self, sql, args=()):
        cur = self.cursor()
        cur.execute(marks(sql), args)
        self.db.commit()
        return cur

    def rows(self, sql, args=()):
        cur = self.cursor()
        cur.execute(marks(sql), args)
        out = []
        for row in cur.fetchall():
            if isinstance(row, dict):
                out.append(row)
            elif hasattr(row, "keys"):
                out.append({key: row[key] for key in row.keys()})
            else:
                cols = [d[0] for d in cur.description]
                out.append(dict(zip(cols, row)))
        return out

    def seed(self):
        i = 0
        for board, info in BOARDS.items():
            n = self.rows("SELECT COUNT(*) AS n FROM " + TABLE + " WHERE board_id = ?", (board,))
            if int(list(n[0].values())[0] if n else 0) > 0:
                continue
            for post in (info or {}).get("seed") or []:
                i += 1
                raw = str(post.get("id") or "")
                pid = raw[:80] if raw else f"p{i:05d}"
                self.run("INSERT INTO " + TABLE + " (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                    board, pid, str(post.get("title") or "")[:500], str(post.get("category") or "")[:100], str(post.get("author") or "")[:200],
                    str(post.get("date") or "")[:40], int(post.get("views") or 0), 1 if post.get("notice") else 0, str(post.get("body") or "")[:20000], f"{i:06d}",
                ))

STORE = Store()

def post_of(row):
    return {
        "id": str(row.get("post_id") or ""), "title": str(row.get("title") or ""), "category": str(row.get("category") or ""),
        "author": str(row.get("author") or ""), "date": str(row.get("post_date") or ""), "views": int(row.get("views") or 0),
        "notice": bool(row.get("notice")), "body": str(row.get("body") or ""),
    }

def cut(value, limit):
    return str(value or "").strip()[:limit]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        self.route()

    def do_HEAD(self):
        self.route()

    def do_POST(self):
        self.route()

    def route(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)
        if path == API or path.startswith(API + "/"):
            self.api(path[len(API):], query)
            return
        if self.command not in ("GET", "HEAD"):
            self.send_text(405, "method not allowed")
            return
        self.file(path)

    def api(self, rest, query):
        board = (query.get("board") or [""])[0]
        if self.command == "GET" and rest == "/posts":
            if board not in BOARDS:
                return self.send_json(404, {"error": "unknown board"})
            rows = STORE.rows("SELECT post_id, title, category, author, post_date, views, notice, body FROM " + TABLE + " WHERE board_id = ? ORDER BY created, post_id", (board,))
            return self.send_json(200, [post_of(row) for row in rows])
        if self.command == "GET" and rest.startswith("/posts/"):
            pid = urllib.parse.unquote(rest[len("/posts/"):])
            if not pid or "/" in pid or len(pid) > 80:
                return self.send_json(404, {"error": "no such post"})
            if board not in BOARDS:
                return self.send_json(404, {"error": "unknown board"})
            STORE.run("UPDATE " + TABLE + " SET views = views + 1 WHERE board_id = ? AND post_id = ?", (board, pid))
            rows = STORE.rows("SELECT post_id, title, category, author, post_date, views, notice, body FROM " + TABLE + " WHERE board_id = ? AND post_id = ?", (board, pid))
            if not rows:
                return self.send_json(404, {"error": "no such post"})
            return self.send_json(200, post_of(rows[0]))
        if self.command == "POST" and rest == "/posts":
            length = int(self.headers.get("Content-Length") or 0)
            if length > 64 * 1024:
                return self.send_json(413, {"error": "too large"})
            raw = self.rfile.read(length) if length else b""
            if len(raw) > 64 * 1024:
                return self.send_json(413, {"error": "too large"})
            try:
                data = json.loads(raw.decode("utf-8") or "{}")
            except Exception:
                return self.send_json(400, {"error": "bad json"})
            if not isinstance(data, dict):
                return self.send_json(400, {"error": "bad json"})
            target = str(data.get("board") or "")
            if target not in BOARDS:
                return self.send_json(404, {"error": "unknown board"})
            title = cut(data.get("title"), 500)
            message = data.get("message")
            if not message:
                message = data.get("body")
            message = cut(message, 20000)
            author = data.get("name") or data.get("author")
            author = cut(author, 200)
            if not title or not message or not author:
                return self.send_json(400, {"error": "title, name and text are needed"})
            now = datetime.datetime.now(datetime.timezone.utc)
            pid = "w" + format(int(now.timestamp() * 1000), "x")
            STORE.run("INSERT INTO " + TABLE + " (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                target, pid[:80], title, cut(data.get("category"), 100), author, now.date().isoformat(), 0, 0, message, now.isoformat(),
            ))
            return self.send_json(201, {"id": pid})
        self.send_json(405, {"error": "not here"})

    def file(self, name):
        if name.endswith("/") or name == "":
            name = name + "index.html"
        name = name.lstrip("/")
        if any(part == ".." for part in name.replace("\\\\", "/").split("/")):
            return self.send_text(403, "forbidden")
        full = (SITE / name).resolve()
        try:
            full.relative_to(SITE)
        except ValueError:
            return self.send_text(403, "forbidden")
        try:
            full.relative_to(HERE)
            return self.send_text(404, "not found")
        except ValueError:
            pass
        if not full.is_file():
            return self.send_text(404, "not found")
        data = full.read_bytes()
        kind = TYPES.get(full.suffix.lower(), "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def send_text(self, status, body):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

def main():
    raw = os.environ.get("PORT", "")
    port = int(raw) if raw.isdigit() else int(CONFIG.get("port") or 8080)
    server = HTTPServer(("0.0.0.0", port), Handler)
    print("LISTENING %d" % server.server_address[1], flush=True)
    server.serve_forever()

if __name__ == "__main__":
    main()
`;
