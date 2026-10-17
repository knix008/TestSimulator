// DDL reverse engineering: CREATE TABLE statements (MySQL, PostgreSQL,
// SQLite, SQL Server, Oracle flavours) → one ERDDataModel holding an
// ERDEntity per table with its ERDColumns (type, length, primary key, not
// null, unique, default) and an ERDRelationship per foreign key (column- or
// table-level, or added later with ALTER TABLE … ADD FOREIGN KEY). The
// foreign key column gets foreignKey = true and referenceTo = the referenced
// column. Relationship ends: end1 = the referenced (parent) table with
// cardinality '1' ('0..1' when the key is nullable), end2 = the table holding
// the key with '0..*' ('0..1' when the key is unique). COMMENT ON … IS and
// MySQL COMMENT '…' become documentation. Other statements are skipped.
import { createElement, insertElement, ref } from '../model.js';

const COLUMN_STOPS = new Set(['NOT', 'NULL', 'PRIMARY', 'UNIQUE', 'DEFAULT', 'REFERENCES', 'CHECK', 'CONSTRAINT', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'IDENTITY', 'COLLATE', 'COMMENT', 'GENERATED', 'AS', 'ON', 'KEY', 'CHARACTER', 'CHARSET', 'ENCODE', 'SERIAL']);
const TABLE_CONSTRAINTS = new Set(['CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'KEY', 'INDEX', 'CHECK', 'FULLTEXT', 'SPATIAL', 'EXCLUDE', 'PERIOD', 'LIKE']);

/** Tokens: { t: 'word'|'id'|'str'|'num'|'op', v, u (upper-case word) }. Quoted identifiers are 'id' with the quotes removed. */
export function tokenizeSql(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if ((c === '-' && src[i + 1] === '-') || c === '#') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
    if (c === "'" || ((c === 'N' || c === 'n' || c === 'E' || c === 'e') && src[i + 1] === "'")) {
      let j = c === "'" ? i + 1 : i + 2;
      let value = '';
      while (j < n) {
        if (src[j] === "'" && src[j + 1] === "'") { value += "'"; j += 2; continue; }
        if (src[j] === "'") { j += 1; break; }
        value += src[j];
        j += 1;
      }
      out.push({ t: 'str', v: src.slice(i, j), text: value });
      i = j;
      continue;
    }
    if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      let value = '';
      while (j < n) {
        if (src[j] === close && src[j + 1] === close && close !== ']') { value += close; j += 2; continue; }
        if (src[j] === close) { j += 1; break; }
        value += src[j];
        j += 1;
      }
      out.push({ t: 'id', v: value, u: value.toUpperCase() });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && /[0-9.eE]/.test(src[j])) j += 1;
      out.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[\p{L}_@$#]/u.test(c)) {
      let j = i + 1;
      while (j < n && /[\p{L}\p{N}_$#@]/u.test(src[j])) j += 1;
      const v = src.slice(i, j);
      out.push({ t: 'word', v, u: v.toUpperCase() });
      i = j;
      continue;
    }
    out.push({ t: 'op', v: c });
    i += 1;
  }
  return out;
}

/** Statements split at ';' (and SQL Server's GO). */
function statements(tokens) {
  const out = [];
  let current = [];
  let depth = 0;
  for (const t of tokens) {
    if (t.t === 'op' && t.v === '(') depth += 1;
    if (t.t === 'op' && t.v === ')') depth -= 1;
    if ((t.t === 'op' && t.v === ';' && depth <= 0) || (t.t === 'word' && t.u === 'GO' && depth <= 0)) {
      if (current.length) out.push(current);
      current = [];
      depth = 0;
      continue;
    }
    current.push(t);
  }
  if (current.length) out.push(current);
  return out;
}

/** Splits tokens at depth-0 commas. */
function splitCommas(tokens) {
  const out = [];
  let current = [];
  let depth = 0;
  for (const t of tokens) {
    if (t.t === 'op' && t.v === '(') depth += 1;
    if (t.t === 'op' && t.v === ')') depth -= 1;
    if (t.t === 'op' && t.v === ',' && depth === 0) { out.push(current); current = []; continue; }
    current.push(t);
  }
  if (current.length) out.push(current);
  return out;
}

const isWord = (t, ...words) => Boolean(t) && t.t === 'word' && words.includes(t.u);
const isName = (t) => Boolean(t) && (t.t === 'id' || t.t === 'word');
const text = (tokens) => tokens.map((t, i) => {
  const prev = tokens[i - 1];
  const glue = !prev || t.v === ')' || t.v === ',' || t.v === '.' || prev.v === '(' || prev.v === '.' || (t.v === '(' && prev.t === 'word') ? '' : ' ';
  return glue + (t.t === 'id' ? t.v : t.v);
}).join('').trim();

/** Reads "schema.table" at index i → [name, next index]. */
function qualified(tokens, i) {
  let name = '';
  while (isName(tokens[i])) {
    name = tokens[i].v;
    if (tokens[i + 1]?.v === '.' && isName(tokens[i + 2])) { i += 2; continue; }
    i += 1;
    break;
  }
  return [name, i];
}

/** "(a, b)" at index i → [['a', 'b'], next index]. */
function nameList(tokens, i) {
  if (tokens[i]?.v !== '(') return [[], i];
  const out = [];
  let j = i + 1;
  let depth = 1;
  for (; j < tokens.length; j += 1) {
    const t = tokens[j];
    if (t.v === '(') depth += 1;
    else if (t.v === ')') { depth -= 1; if (depth === 0) { j += 1; break; } } else if (depth === 1 && isName(t) && !isWord(t, 'ASC', 'DESC')) out.push(t.v);
  }
  return [out, j];
}

/** Index after the parenthesised group starting at i. */
function skipParens(tokens, i) {
  let depth = 0;
  for (let j = i; j < tokens.length; j += 1) {
    if (tokens[j].v === '(') depth += 1;
    else if (tokens[j].v === ')') { depth -= 1; if (depth === 0) return j + 1; }
  }
  return tokens.length;
}

/** "REFERENCES t (c) [ON DELETE …]" at index i (after REFERENCES) → [{ table, columns }, next]. */
function references(tokens, i) {
  const [table, next] = qualified(tokens, i);
  const [columns, after] = nameList(tokens, next);
  return [{ table, columns }, after];
}

function parseColumn(item, table) {
  const [first, ...rest] = item;
  const column = { name: first.v, type: '', length: '', primaryKey: false, nullable: true, unique: false, defaultValue: '', doc: '', ref: null };
  let i = 0;
  const typeWords = [];
  while (i < rest.length && rest[i].t === 'word' && (!COLUMN_STOPS.has(rest[i].u) || typeWords.length === 0 && !['NOT', 'NULL', 'PRIMARY', 'REFERENCES', 'DEFAULT', 'CONSTRAINT'].includes(rest[i].u))) {
    typeWords.push(rest[i].v);
    i += 1;
    if (rest[i]?.v === '(') {
      const end = skipParens(rest, i);
      column.length = text(rest.slice(i + 1, end - 1)).replace(/\s*,\s*/g, ',');
      i = end;
    }
    if (rest[i]?.v === '[' ) i += 2; // int[]
  }
  column.type = typeWords.join(' ').toUpperCase();
  if (column.type === 'SERIAL' || column.type === 'BIGSERIAL') column.nullable = false;
  while (i < rest.length) {
    const t = rest[i];
    if (isWord(t, 'NOT') && isWord(rest[i + 1], 'NULL')) { column.nullable = false; i += 2; continue; }
    if (isWord(t, 'NULL')) { column.nullable = true; i += 1; continue; }
    if (isWord(t, 'PRIMARY') && isWord(rest[i + 1], 'KEY')) { column.primaryKey = true; column.nullable = false; i += 2; continue; }
    if (isWord(t, 'UNIQUE')) { column.unique = true; i += isWord(rest[i + 1], 'KEY') ? 2 : 1; continue; }
    if (isWord(t, 'DEFAULT')) {
      let j = i + 1;
      const start = j;
      if (rest[j]?.v === '(') j = skipParens(rest, j);
      else {
        if (rest[j]?.v === '-' || rest[j]?.v === '+') j += 1;
        j += 1;
        if (rest[j]?.v === '(') j = skipParens(rest, j); // now()
        while (rest[j]?.v === ':' && rest[j + 1]?.v === ':') j += 3; // 'x'::text
      }
      column.defaultValue = text(rest.slice(start, j));
      i = j;
      continue;
    }
    if (isWord(t, 'REFERENCES')) { const [r, next] = references(rest, i + 1); column.ref = r; i = next; continue; }
    if (isWord(t, 'COMMENT') && rest[i + 1]?.t === 'str') { column.doc = rest[i + 1].text; i += 2; continue; }
    if (isWord(t, 'CONSTRAINT', 'COLLATE')) { i += 2; continue; }
    if (rest[i + 1]?.v === '(' && isWord(t, 'CHECK', 'IDENTITY', 'AS', 'GENERATED')) { i = skipParens(rest, i + 1); continue; }
    if (t.v === '(') { i = skipParens(rest, i); continue; }
    i += 1;
  }
  return column;
}

const SQL_TYPE = /^(N?VARCHAR2?|N?CHAR|CHARACTER|TEXT|\w*INT\w*|DECIMAL|NUMERIC|NUMBER|FLOAT|DOUBLE|REAL|BOOL\w*|DATE\w*|TIME\w*|\w*BLOB|\w*CLOB|\w*TEXT|BINARY|VARBINARY|BIT|\w*SERIAL|UUID|JSONB?|MONEY|XML|ENUM)$/i;

/** Is a CREATE TABLE item a table constraint / index (not a column that happens to be named "key")? */
function isConstraintItem(item) {
  const [first, second] = item;
  if (first.t !== 'word' || !TABLE_CONSTRAINTS.has(first.u)) return false;
  if (first.u === 'KEY' || first.u === 'INDEX' || first.u === 'CHECK' || first.u === 'PERIOD') return !(second && second.t === 'word' && SQL_TYPE.test(second.v));
  if (first.u === 'UNIQUE' || first.u === 'PRIMARY' || first.u === 'FOREIGN') return !(second && second.t === 'word' && SQL_TYPE.test(second.v));
  return true;
}

/** Table-level constraint: fills table.primary / unique / foreign; false when not one. */
function parseConstraint(item, table) {
  let i = 0;
  let name = '';
  if (isWord(item[0], 'CONSTRAINT')) { name = item[1]?.v ?? ''; i = 2; }
  const t = item[i];
  if (isWord(t, 'PRIMARY')) { const [cols] = nameList(item, i + 2); table.primary.push(...cols); return true; }
  if (isWord(t, 'UNIQUE')) {
    let j = i + 1;
    while (j < item.length && item[j].v !== '(') j += 1;
    const [cols] = nameList(item, j);
    if (cols.length === 1) table.unique.push(cols[0]);
    return true;
  }
  if (isWord(t, 'FOREIGN')) {
    const [cols, next] = nameList(item, i + 2);
    const at = item.findIndex((x, k) => k >= next && isWord(x, 'REFERENCES'));
    if (at >= 0) { const [r] = references(item, at + 1); table.foreign.push({ name, columns: cols, table: r.table, refColumns: r.columns }); }
    return true;
  }
  return TABLE_CONSTRAINTS.has(t?.u) || isWord(item[0], 'CONSTRAINT');
}

/** Parses DDL text → { tables, comments }. */
export function parseDdl(src) {
  const tables = [];
  const byName = new Map();
  const tableNamed = (name) => byName.get(name.toLowerCase()) ?? null;
  for (const st of statements(tokenizeSql(src))) {
    let i = 0;
    if (isWord(st[0], 'CREATE')) {
      i = 1;
      while (isWord(st[i], 'OR', 'REPLACE', 'GLOBAL', 'LOCAL', 'TEMPORARY', 'TEMP', 'UNLOGGED', 'VIRTUAL')) i += 1;
      if (!isWord(st[i], 'TABLE')) continue;
      i += 1;
      if (isWord(st[i], 'IF') && isWord(st[i + 1], 'NOT') && isWord(st[i + 2], 'EXISTS')) i += 3;
      const [name, next] = qualified(st, i);
      if (!name || st[next]?.v !== '(') continue;
      const end = skipParens(st, next);
      const table = { name, columns: [], primary: [], unique: [], foreign: [], doc: '' };
      for (const item of splitCommas(st.slice(next + 1, end - 1))) {
        if (!item.length) continue;
        if (isConstraintItem(item) && parseConstraint(item, table)) continue;
        if (!isName(item[0])) continue;
        table.columns.push(parseColumn(item, table));
      }
      const comment = st.slice(end).findIndex((t, k, arr) => isWord(t, 'COMMENT') && (arr[k + 1]?.t === 'str' || (arr[k + 1]?.v === '=' && arr[k + 2]?.t === 'str')));
      if (comment >= 0) { const rest = st.slice(end + comment + 1); table.doc = (rest[0].t === 'str' ? rest[0] : rest[1]).text; }
      tables.push(table);
      byName.set(name.toLowerCase(), table);
      continue;
    }
    if (isWord(st[0], 'ALTER') && isWord(st[1], 'TABLE')) {
      i = 2;
      while (isWord(st[i], 'ONLY', 'IF', 'EXISTS')) i += 1;
      const [name, next] = qualified(st, i);
      const table = tableNamed(name);
      if (!table) continue;
      for (const part of splitCommas(st.slice(next))) {
        let j = 0;
        if (isWord(part[j], 'ADD')) j += 1; else continue;
        parseConstraint(part.slice(j), table);
      }
      continue;
    }
    if (isWord(st[0], 'COMMENT') && isWord(st[1], 'ON')) {
      const kind = st[2]?.u;
      const isAt = st.findIndex((t) => isWord(t, 'IS'));
      const value = st[isAt + 1]?.t === 'str' ? st[isAt + 1].text : '';
      const path = st.slice(3, isAt).filter(isName).map((t) => t.v);
      if (kind === 'TABLE') { const table = tableNamed(path[path.length - 1] ?? ''); if (table) table.doc = value; } else if (kind === 'COLUMN') {
        const table = tableNamed(path[path.length - 2] ?? '');
        const column = table?.columns.find((c) => c.name.toLowerCase() === (path[path.length - 1] ?? '').toLowerCase());
        if (column) column.doc = value;
      }
    }
  }
  return tables;
}

/** reverseEngineer() for 'sql'. */
export function reverse(files, opts) {
  const warnings = [];
  const tables = [];
  for (const file of files ?? []) {
    try { tables.push(...parseDdl(String(file.content ?? ''))); } catch (error) {
      warnings.push({ code: 'reverse.parseError', file: file.name ?? '', detail: error?.message ?? String(error) });
    }
  }
  const model = createElement('ERDDataModel', { name: opts.modelName || 'DataModel' });
  const entities = new Map(); // lower-case name → { table, entity, columns: Map }
  for (const table of tables) {
    const key = table.name.toLowerCase();
    if (entities.has(key)) { warnings.push({ code: 'reverse.duplicateTable', file: '', detail: table.name }); continue; }
    const entity = insertElement(model, createElement('ERDEntity', { name: table.name, documentation: table.doc }));
    const columns = new Map();
    const primary = new Set(table.primary.map((c) => c.toLowerCase()));
    const unique = new Set(table.unique.map((c) => c.toLowerCase()));
    for (const col of table.columns) {
      const isPk = col.primaryKey || primary.has(col.name.toLowerCase());
      const element = insertElement(entity, createElement('ERDColumn', {
        name: col.name, type: col.type || 'VARCHAR', length: col.length, primaryKey: isPk, foreignKey: false,
        nullable: isPk ? false : col.nullable, unique: col.unique || unique.has(col.name.toLowerCase()), defaultValue: col.defaultValue, documentation: col.doc,
      }));
      columns.set(col.name.toLowerCase(), element);
      if (col.ref) table.foreign.push({ name: '', columns: [col.name], table: col.ref.table, refColumns: col.ref.columns });
    }
    entities.set(key, { table, entity, columns });
  }
  for (const { table, entity, columns } of entities.values()) {
    for (const fk of table.foreign) {
      const parent = entities.get(String(fk.table).toLowerCase());
      const own = fk.columns.map((c) => columns.get(c.toLowerCase())).filter(Boolean);
      own.forEach((c) => { c.foreignKey = true; });
      if (!parent) { warnings.push({ code: 'reverse.unresolvedTable', file: '', detail: `${table.name} → ${fk.table}` }); continue; }
      const parentPk = [...parent.columns.values()].filter((c) => c.primaryKey);
      own.forEach((c, k) => {
        const target = fk.refColumns[k] ? parent.columns.get(fk.refColumns[k].toLowerCase()) : parentPk[k];
        if (target) c.referenceTo = ref(target);
      });
      const nullable = own.some((c) => c.nullable);
      const single = own.length === 1 && (own[0].unique || (own[0].primaryKey && [...columns.values()].filter((c) => c.primaryKey).length === 1));
      insertElement(model, createElement('ERDRelationship', {
        name: fk.name || '', identifying: own.length > 0 && own.every((c) => c.primaryKey),
        end1: { reference: ref(parent.entity), cardinality: nullable ? '0..1' : '1' },
        end2: { reference: ref(entity), cardinality: single ? '0..1' : '0..*' },
      }));
    }
  }
  return { elements: tables.length ? [model] : [], warnings };
}
