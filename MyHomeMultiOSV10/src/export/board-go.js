// The Go board server written next to a published site. One database driver, the one chosen in
// Settings › Database, so `go mod tidy` only fetches that driver. The HTTP API matches server.js.

const GO_DRIVER = {
  sqlite: { module: 'modernc.org/sqlite', version: 'v1.37.0', name: 'sqlite' },
  mysql: { module: 'github.com/go-sql-driver/mysql', version: 'v1.9.3', name: 'mysql' },
  mariadb: { module: 'github.com/go-sql-driver/mysql', version: 'v1.9.3', name: 'mysql' },
  postgres: { module: 'github.com/lib/pq', version: 'v1.10.9', name: 'postgres' },
  mssql: { module: 'github.com/microsoft/go-mssqldb', version: 'v1.8.2', name: 'sqlserver' },
};

/** server/main.go and server/go.mod for the chosen database kind. */
export function goServerFiles(kind) {
  const driver = GO_DRIVER[kind] ?? GO_DRIVER.sqlite;
  return [
    { path: 'server/main.go', data: goMain(kind, driver) },
    { path: 'server/go.mod', data: `module myhomemaker-board-server\n\ngo 1.22\n\nrequire ${driver.module} ${driver.version}\n` },
  ];
}

function goMain(kind, driver) {
  return `// MyHomeMaker board server (Go): the site in config.siteDir and the board API.
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
${openImport(kind, driver)}
)

const table = "myhomemaker_board_posts"

type boardInfo struct {
	Page string \`json:"page"\`
	Seed []map[string]any \`json:"seed"\`
}

type fileConfig struct {
	Port     int                  \`json:"port"\`
	API      string               \`json:"api"\`
	SiteDir  string               \`json:"siteDir"\`
	Database map[string]any       \`json:"database"\`
	Boards   map[string]boardInfo \`json:"boards"\`
}

var (
	cfg     fileConfig
	db      *sql.DB
	here    string
	siteDir string
	apiPath string
)

func main() {
	var err error
	here, err = os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(here, "config.json"))
	if err != nil {
		log.Fatal(err)
	}
	if err = json.Unmarshal(raw, &cfg); err != nil {
		log.Fatal(err)
	}
	siteDir = filepath.Clean(filepath.Join(here, str(cfg.SiteDir, "..")))
	apiPath = strings.TrimRight(str(cfg.API, "/api/board"), "/")
	db, err = openDB()
	if err != nil {
		log.Fatal(err)
	}
	if _, err = db.Exec(schema()); err != nil {
		log.Fatal(err)
	}
	if err = seed(); err != nil {
		log.Fatal(err)
	}
	port := getenvInt("PORT", cfg.Port)
	if port == 0 && os.Getenv("PORT") == "" {
		port = 8080
	}
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("LISTENING %d\\n", ln.Addr().(*net.TCPAddr).Port)
	os.Stdout.Sync()
	log.Fatal(http.Serve(ln, http.HandlerFunc(route)))
}

func route(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == apiPath || strings.HasPrefix(path, apiPath+"/") {
		api(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		sendText(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	serveFile(w, r)
}

func api(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, apiPath)
	board := r.URL.Query().Get("board")
	if r.Method == http.MethodGet && rest == "/posts" {
		if !known(board) {
			sendJSON(w, http.StatusNotFound, map[string]string{"error": "unknown board"})
			return
		}
		rows, err := listPosts(board)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "server error"})
			return
		}
		sendJSON(w, http.StatusOK, rows)
		return
	}
	if r.Method == http.MethodGet && strings.HasPrefix(rest, "/posts/") {
		id := rest[len("/posts/"):]
		if id == "" || strings.Contains(id, "/") || len([]rune(id)) > 80 {
			sendJSON(w, http.StatusNotFound, map[string]string{"error": "no such post"})
			return
		}
		id, _ = url.PathUnescape(id)
		if !known(board) {
			sendJSON(w, http.StatusNotFound, map[string]string{"error": "unknown board"})
			return
		}
		post, err := readPost(board, id)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "server error"})
			return
		}
		if post == nil {
			sendJSON(w, http.StatusNotFound, map[string]string{"error": "no such post"})
			return
		}
		sendJSON(w, http.StatusOK, post)
		return
	}
	if r.Method == http.MethodPost && rest == "/posts" {
		body, err := io.ReadAll(io.LimitReader(r.Body, 64*1024+1))
		if err != nil || len(body) > 64*1024 {
			sendJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "too large"})
			return
		}
		var data map[string]any
		if json.Unmarshal(body, &data) != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "bad json"})
			return
		}
		target := text(data["board"])
		if !known(target) {
			sendJSON(w, http.StatusNotFound, map[string]string{"error": "unknown board"})
			return
		}
		title := cut(strings.TrimSpace(text(data["title"])), 500)
		message := text(data["message"])
		if message == "" {
			message = text(data["body"])
		}
		message = cut(strings.TrimSpace(message), 20000)
		author := text(data["name"])
		if author == "" {
			author = text(data["author"])
		}
		author = cut(strings.TrimSpace(author), 200)
		if title == "" || message == "" || author == "" {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "title, name and text are needed"})
			return
		}
		now := time.Now().UTC()
		id := "w" + strconv.FormatInt(now.UnixMilli(), 36) + strconv.FormatInt(now.UnixNano()%1296, 36)
		_, err = exec(\`INSERT INTO \`+table+\` (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
			target, cut(id, 80), title, cut(strings.TrimSpace(text(data["category"])), 100), author, now.Format("2006-01-02"), 0, 0, message, now.Format(time.RFC3339Nano))
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "server error"})
			return
		}
		sendJSON(w, http.StatusCreated, map[string]string{"id": id})
		return
	}
	sendJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "not here"})
}

func known(board string) bool { _, ok := cfg.Boards[board]; return ok }

func listPosts(board string) ([]map[string]any, error) {
	rows, err := query(\`SELECT post_id, title, category, author, post_date, views, notice, body FROM \`+table+\` WHERE board_id = ? ORDER BY created, post_id\`, board)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		post, err := scanPost(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, post)
	}
	return out, rows.Err()
}

func readPost(board, id string) (map[string]any, error) {
	if _, err := exec(\`UPDATE \`+table+\` SET views = views + 1 WHERE board_id = ? AND post_id = ?\`, board, id); err != nil {
		return nil, err
	}
	rows, err := query(\`SELECT post_id, title, category, author, post_date, views, notice, body FROM \`+table+\` WHERE board_id = ? AND post_id = ?\`, board, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	return scanPost(rows)
}

func scanPost(rows *sql.Rows) (map[string]any, error) {
	var id, title, category, author, date, body string
	var views, notice int64
	if err := rows.Scan(&id, &title, &category, &author, &date, &views, &notice, &body); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "title": title, "category": category, "author": author, "date": date, "views": views, "notice": notice != 0, "body": body}, nil
}

func seed() error {
	i := 0
	for board, info := range cfg.Boards {
		var n int64
		if err := db.QueryRow(sqlText(\`SELECT COUNT(*) FROM \`+table+\` WHERE board_id = ?\`), board).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		for _, p := range info.Seed {
			i++
			id := cut(text(p["id"]), 80)
			if id == "" {
				id = fmt.Sprintf("p%05d", i)
			}
			if _, err := exec(\`INSERT INTO \`+table+\` (board_id, post_id, title, category, author, post_date, views, notice, body, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
				board, id, cut(text(p["title"]), 500), cut(text(p["category"]), 100), cut(text(p["author"]), 200), cut(text(p["date"]), 40), int64(num(p["views"])), boolNum(p["notice"]), cut(text(p["body"]), 20000), fmt.Sprintf("%06d", i)); err != nil {
				return err
			}
		}
	}
	return nil
}

func serveFile(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Path
	if strings.HasSuffix(name, "/") {
		name += "index.html"
	}
	name = strings.TrimPrefix(name, "/")
	full := filepath.Clean(filepath.Join(siteDir, filepath.FromSlash(name)))
	rel, err := filepath.Rel(siteDir, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		sendText(w, http.StatusForbidden, "forbidden")
		return
	}
	inServer, err := filepath.Rel(here, full)
	if err == nil && inServer != ".." && !strings.HasPrefix(inServer, ".."+string(os.PathSeparator)) {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, full)
}

func sendJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func sendText(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, body)
}

func query(sql string, args ...any) (*sql.Rows, error) { return db.Query(sqlText(sql), args...) }
func exec(sql string, args ...any) (sql.Result, error)  { return db.Exec(sqlText(sql), args...) }

func sqlText(sql string) string {
	kind := str(cfg.Database["kind"], "sqlite")
	if kind != "postgres" && kind != "mssql" {
		return sql
	}
	mark := "$"
	if kind == "mssql" {
		mark = "@p"
	}
	n := 0
	var b strings.Builder
	for _, r := range sql {
		if r == '?' {
			n++
			b.WriteString(mark)
			b.WriteString(strconv.Itoa(n))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

${openDB(kind, driver)}

func schema() string {
	kind := str(cfg.Database["kind"], "sqlite")
	if kind == "mssql" {
		return "IF OBJECT_ID(N'" + table + "', N'U') IS NULL CREATE TABLE " + table + " (board_id NVARCHAR(80) NOT NULL, post_id NVARCHAR(80) NOT NULL, title NVARCHAR(500) NOT NULL, category NVARCHAR(100) NOT NULL, author NVARCHAR(200) NOT NULL, post_date NVARCHAR(40) NOT NULL, views BIGINT NOT NULL, notice BIGINT NOT NULL, body NVARCHAR(MAX) NOT NULL, created NVARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id))"
	}
	text, integer, suffix := "TEXT", "BIGINT", ""
	if kind == "mysql" || kind == "mariadb" {
		text, integer, suffix = "LONGTEXT", "BIGINT", " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
	}
	if kind == "sqlite" {
		integer = "INTEGER"
	}
	return "CREATE TABLE IF NOT EXISTS " + table + " (board_id VARCHAR(80) NOT NULL, post_id VARCHAR(80) NOT NULL, title VARCHAR(500) NOT NULL, category VARCHAR(100) NOT NULL, author VARCHAR(200) NOT NULL, post_date VARCHAR(40) NOT NULL, views " + integer + " NOT NULL, notice " + integer + " NOT NULL, body " + text + " NOT NULL, created VARCHAR(40) NOT NULL, PRIMARY KEY (board_id, post_id))" + suffix
}

func str(value any, fallback string) string {
	switch v := value.(type) {
	case string:
		if v != "" {
			return v
		}
	}
	return fallback
}

func text(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case nil:
		return ""
	default:
		return fmt.Sprint(v)
	}
}

func num(value any) int {
	switch v := value.(type) {
	case float64:
		return int(v)
	case int:
		return v
	case string:
		n, _ := strconv.Atoi(v)
		return n
	default:
		return 0
	}
}

func boolNum(value any) int {
	switch v := value.(type) {
	case bool:
		if v {
			return 1
		}
	case float64:
		if v != 0 {
			return 1
		}
	}
	return 0
}

func cut(value string, max int) string {
	r := []rune(value)
	if len(r) > max {
		return string(r[:max])
	}
	return value
}

func getenvInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}
`;
}

function openImport(kind, driver) {
  if (kind === 'mysql' || kind === 'mariadb') return `\t"github.com/go-sql-driver/mysql"\n`;
  return `\t_ "${driver.module}"\n`;
}

function openDB(kind, driver) {
  if (kind === 'mysql' || kind === 'mariadb') {
    return `func openDB() (*sql.DB, error) {
	c := mysql.NewConfig()
	c.User = str(cfg.Database["user"], "")
	c.Passwd = os.Getenv("DB_PASSWORD")
	c.Net = "tcp"
	port := intNum(cfg.Database["port"], 3306)
	c.Addr = net.JoinHostPort(str(cfg.Database["host"], "localhost"), strconv.Itoa(port))
	c.DBName = str(cfg.Database["database"], "myhomemaker")
	c.ParseTime = true
	c.Params = map[string]string{"charset": "utf8mb4"}
	conn, err := sql.Open("mysql", c.FormatDSN())
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(5)
	return conn, nil
}

func intNum(value any, fallback int) int {
	switch v := value.(type) {
	case float64:
		if v > 0 {
			return int(v)
		}
	}
	return fallback
}`;
  }
  if (kind === 'postgres') {
    return `func openDB() (*sql.DB, error) {
	port := intNum(cfg.Database["port"], 5432)
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		quote(str(cfg.Database["host"], "localhost")), port, quote(str(cfg.Database["user"], "")), quote(os.Getenv("DB_PASSWORD")), quote(str(cfg.Database["database"], "myhomemaker")))
	conn, err := sql.Open("${driver.name}", dsn)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(5)
	return conn, nil
}

func quote(value string) string { return "'" + strings.ReplaceAll(value, "'", "''") + "'" }

func intNum(value any, fallback int) int {
	switch v := value.(type) {
	case float64:
		if v > 0 {
			return int(v)
		}
	}
	return fallback
}`;
  }
  if (kind === 'mssql') {
    return `func openDB() (*sql.DB, error) {
	port := intNum(cfg.Database["port"], 1433)
	u := &url.URL{Scheme: "sqlserver", User: url.UserPassword(str(cfg.Database["user"], ""), os.Getenv("DB_PASSWORD")), Host: net.JoinHostPort(str(cfg.Database["host"], "localhost"), strconv.Itoa(port))}
	q := u.Query()
	q.Set("database", str(cfg.Database["database"], "myhomemaker"))
	q.Set("encrypt", "true")
	q.Set("TrustServerCertificate", "true")
	u.RawQuery = q.Encode()
	conn, err := sql.Open("${driver.name}", u.String())
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(5)
	return conn, nil
}

func intNum(value any, fallback int) int {
	switch v := value.(type) {
	case float64:
		if v > 0 {
			return int(v)
		}
	}
	return fallback
}`;
  }
  return `func openDB() (*sql.DB, error) {
	file := str(cfg.Database["file"], "board.db")
	if !filepath.IsAbs(file) {
		file = filepath.Join(here, file)
	}
	conn, err := sql.Open("${driver.name}", file)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1)
	return conn, nil
}`;
}
