// Dialect-specific SQL text generation. Pure functions — unit tested per dialect.
//
// Portable SQL convention used everywhere in the core:
//   - `?` placeholders
//   - identifiers in "double quotes" when they need quoting (reserved words: key, rank, read, trigger, order, user …)
//   - string literals in 'single quotes'
// rewriteSql() turns that into the dialect's native form.

/** @typedef {'sqlite'|'mysql'|'postgres'|'mssql'} Dialect */

export const DIALECTS = ['sqlite', 'mysql', 'postgres', 'mssql'];

/** Quote an identifier for `dialect`. */
export function quoteIdent(dialect, name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`bad identifier: ${name}`);
  switch (dialect) {
    case 'mysql': return '`' + name + '`';
    case 'mssql': return '[' + name + ']';
    default: return '"' + name + '"';
  }
}

/**
 * Rewrite portable SQL: `?` → $n (postgres) / @pn (mssql); "ident" → `ident` (mysql) / [ident] (mssql).
 * Text inside '…' literals and -- comments is left alone.
 * @param {Dialect} dialect
 * @param {string} sql
 */
export function rewriteSql(dialect, sql) {
  if (dialect === 'sqlite') return sql;
  let out = '';
  let n = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") { // string literal ('' escapes)
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; } j++; }
      out += sql.slice(i, j + 1);
      i = j;
    } else if (ch === '"') {
      const j = sql.indexOf('"', i + 1);
      if (j < 0) throw new Error('unterminated quoted identifier');
      const name = sql.slice(i + 1, j);
      out += dialect === 'mysql' ? '`' + name + '`' : dialect === 'mssql' ? '[' + name + ']' : '"' + name + '"';
      i = j;
    } else if (ch === '-' && sql[i + 1] === '-') {
      const j = sql.indexOf('\n', i);
      const end = j < 0 ? sql.length : j;
      out += sql.slice(i, end);
      i = end - 1;
    } else if (ch === '?') {
      n++;
      out += dialect === 'postgres' ? '$' + n : dialect === 'mssql' ? '@p' + n : '?';
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * LIMIT/OFFSET clause. MSSQL needs an ORDER BY before it (callers add one; see select()).
 * @returns {string} '' when neither is set
 */
export function limitClause(dialect, limit, offset) {
  const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.floor(Number(v))));
  const lim = num(limit);
  const off = num(offset) || 0;
  if (lim == null && !off) return '';
  if (dialect === 'mssql') {
    return ` OFFSET ${off} ROWS` + (lim == null ? '' : ` FETCH NEXT ${lim} ROWS ONLY`);
  }
  if (dialect === 'mysql') return lim == null ? ` LIMIT ${off}, 18446744073709551615` : ` LIMIT ${lim}` + (off ? ` OFFSET ${off}` : '');
  if (lim == null) return dialect === 'sqlite' ? ` LIMIT -1 OFFSET ${off}` : ` OFFSET ${off}`;
  return ` LIMIT ${lim}` + (off ? ` OFFSET ${off}` : '');
}

/**
 * String concatenation of SQL expressions: `a || b` (SQLite, PostgreSQL — text || integer works in both) or
 * `CONCAT(a, b)` (MySQL/MariaDB, where || is OR; SQL Server, where + would add numbers). Pass literals or
 * columns; a `?` parameter has no type in PostgreSQL's `||`, so callers inline validated literals instead.
 */
export function concatSql(dialect, ...exprs) {
  if (dialect === 'mysql' || dialect === 'mssql') return `CONCAT(${exprs.join(', ')})`;
  return `(${exprs.join(' || ')})`;
}

const MSSQL_BIN = ' COLLATE Latin1_General_100_BIN2';

/** SQL type of a logical column type. */
export function columnType(dialect, col) {
  const { type, size } = col;
  switch (dialect) {
    case 'sqlite':
      return { id: 'TEXT', string: 'TEXT', text: 'TEXT', json: 'TEXT', int: 'INTEGER', bigint: 'INTEGER', bool: 'INTEGER', float: 'REAL', blob: 'BLOB' }[type];
    case 'mysql':
      return { id: 'VARCHAR(32)', string: `VARCHAR(${size})`, text: 'LONGTEXT', json: 'LONGTEXT', int: 'INT', bigint: 'BIGINT', bool: 'SMALLINT', float: 'DOUBLE', blob: 'LONGBLOB' }[type];
    case 'postgres':
      // COLLATE "C": byte order like the other dialects (rank keys, ORDER BY name) regardless of the DB locale
      return { id: 'VARCHAR(32)', string: `VARCHAR(${size}) COLLATE "C"`, text: 'TEXT', json: 'TEXT', int: 'INTEGER', bigint: 'BIGINT', bool: 'SMALLINT', float: 'DOUBLE PRECISION', blob: 'BYTEA' }[type];
    case 'mssql':
      return { id: 'NVARCHAR(32)' + MSSQL_BIN, string: `NVARCHAR(${size})` + MSSQL_BIN, text: 'NVARCHAR(MAX)', json: 'NVARCHAR(MAX)', int: 'INT', bigint: 'BIGINT', bool: 'SMALLINT', float: 'FLOAT', blob: 'VARBINARY(MAX)' }[type];
    default:
      throw new Error(`unknown dialect ${dialect}`);
  }
}

/** Column definition for CREATE TABLE / ADD COLUMN. */
export function columnDef(dialect, col, forceNullable = false) {
  const t = columnType(dialect, col);
  if (!t) throw new Error(`unknown column type ${col.type}`);
  return `${quoteIdent(dialect, col.name)} ${t}${col.notNull && !forceNullable ? ' NOT NULL' : ''}`;
}

/** CREATE TABLE statement for a schema table. */
export function createTableSql(dialect, table) {
  const q = (n) => quoteIdent(dialect, n);
  const cols = table.columns.map((c) => '  ' + columnDef(dialect, c));
  const pkName = dialect === 'mssql' ? `CONSTRAINT ${q('pk_' + table.name)} ` : '';
  cols.push(`  ${pkName}PRIMARY KEY (${table.pk.map(q).join(', ')})`);
  let sql = `CREATE TABLE ${q(table.name)} (\n${cols.join(',\n')}\n)`;
  if (dialect === 'mysql') sql += ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
  return sql;
}

/** CREATE [UNIQUE] INDEX statements for a schema table. */
export function createIndexSql(dialect, table) {
  const q = (n) => quoteIdent(dialect, n);
  const out = [];
  const add = (cols, unique) => {
    const name = `${unique ? 'ux' : 'ix'}_${table.name}_${cols.join('_')}`.slice(0, 60);
    out.push(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${q(name)} ON ${q(table.name)} (${cols.map(q).join(', ')})`);
  };
  for (const u of table.unique) add(u, true);
  for (const ix of table.indexes) add(ix, false);
  return out;
}

/** ALTER TABLE … ADD column (added columns are nullable so existing rows stay valid). */
export function addColumnSql(dialect, tableName, col) {
  const kw = dialect === 'mssql' ? 'ADD' : 'ADD COLUMN';
  return `ALTER TABLE ${quoteIdent(dialect, tableName)} ${kw} ${columnDef(dialect, col, true)}`;
}

/** SQL listing the user tables of the current database/schema → rows { name }. */
export function listTablesSql(dialect) {
  switch (dialect) {
    case 'sqlite': return "SELECT name AS name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite!_%' ESCAPE '!'";
    case 'mysql': return 'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()';
    case 'postgres': return 'SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()';
    case 'mssql': return 'SELECT name AS name FROM sys.tables';
  }
  throw new Error(`unknown dialect ${dialect}`);
}

/** SQL listing the columns of table ? → rows { name }. */
export function listColumnsSql(dialect) {
  switch (dialect) {
    case 'sqlite': return 'SELECT name AS name FROM pragma_table_info(?)';
    case 'mysql': return 'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?';
    case 'postgres': return 'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?';
    case 'mssql': return 'SELECT c.name AS name FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id WHERE t.name = ?';
  }
  throw new Error(`unknown dialect ${dialect}`);
}

/** Escape a user string for LIKE … ESCAPE '!' (the escape char is the same in every dialect). */
export function likeEscape(s) {
  return String(s).replace(/[!%_[\]]/g, (c) => '!' + c);
}
