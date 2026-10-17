// DDL generation from ER data models (StarUML's ERD extension): one .sql
// script per ERDDataModel below the chosen element (or the entity itself),
// with CREATE TABLE per ERDEntity (columns with type/length, NOT NULL,
// DEFAULT, UNIQUE, PRIMARY KEY) and FOREIGN KEY … REFERENCES constraints for
// columns whose referenceTo points at a column of another entity. Tables are
// ordered so that referenced tables come first; foreign keys in a cycle are
// added afterwards with ALTER TABLE. Dialects: mysql, postgres, sqlite,
// sqlserver, oracle (identifier quoting and a few type names differ).
import { refId, walk } from '../model.js';

export const DIALECTS = [
  { id: 'mysql', name: 'MySQL / MariaDB' },
  { id: 'postgres', name: 'PostgreSQL' },
  { id: 'sqlite', name: 'SQLite' },
  { id: 'sqlserver', name: 'SQL Server' },
  { id: 'oracle', name: 'Oracle' },
];

const QUOTES = { mysql: ['`', '`'], postgres: ['"', '"'], sqlite: ['"', '"'], sqlserver: ['[', ']'], oracle: ['"', '"'] };
const RESERVED = new Set(('add all alter and any as asc between by case check column constraint create cross current date default delete desc distinct drop else end exists foreign from full grant group having in index inner insert into is join key left like limit not null of on or order outer primary references right row rows select set table then to union unique update user using values view when where with').split(' '));

/** Type name changes per dialect (upper-case type → replacement). */
const TYPE_MAP = {
  mysql: { BOOL: 'BOOLEAN', NVARCHAR: 'VARCHAR', VARCHAR2: 'VARCHAR', NUMBER: 'DECIMAL', CLOB: 'LONGTEXT', BLOB: 'LONGBLOB', BYTEA: 'BLOB', SERIAL: 'INT', TIMESTAMPTZ: 'TIMESTAMP' },
  postgres: { DATETIME: 'TIMESTAMP', TINYINT: 'SMALLINT', BLOB: 'BYTEA', LONGBLOB: 'BYTEA', LONGTEXT: 'TEXT', MEDIUMTEXT: 'TEXT', CLOB: 'TEXT', DOUBLE: 'DOUBLE PRECISION', NVARCHAR: 'VARCHAR', VARCHAR2: 'VARCHAR', NUMBER: 'NUMERIC', BIT: 'BOOLEAN' },
  sqlite: {},
  sqlserver: { BOOLEAN: 'BIT', BOOL: 'BIT', TEXT: 'NVARCHAR(MAX)', LONGTEXT: 'NVARCHAR(MAX)', CLOB: 'NVARCHAR(MAX)', BLOB: 'VARBINARY(MAX)', BYTEA: 'VARBINARY(MAX)', TIMESTAMP: 'DATETIME2', DOUBLE: 'FLOAT', VARCHAR2: 'VARCHAR', NUMBER: 'DECIMAL' },
  oracle: { VARCHAR: 'VARCHAR2', NVARCHAR: 'NVARCHAR2', TEXT: 'CLOB', LONGTEXT: 'CLOB', INT: 'NUMBER(10)', INTEGER: 'NUMBER(10)', BIGINT: 'NUMBER(19)', SMALLINT: 'NUMBER(5)', TINYINT: 'NUMBER(3)', BOOLEAN: 'NUMBER(1)', BOOL: 'NUMBER(1)', DOUBLE: 'BINARY_DOUBLE', DATETIME: 'TIMESTAMP', BYTEA: 'BLOB', DECIMAL: 'NUMBER' },
};

/** Files for the ER models below `root`. */
export function generate(root, ctx) {
  const o = ctx.options;
  const dialect = QUOTES[o.dialect] ? o.dialect : 'mysql';
  const groups = new Map(); // data model (or root) → entities
  const ownerModel = (entity) => {
    for (let owner = ctx.index.parent(entity._id); owner; owner = ctx.index.parent(owner._id)) if (owner._type === 'ERDDataModel') return owner;
    return root;
  };
  walk(root, (element) => {
    if (element._type !== 'ERDEntity') return;
    const model = ownerModel(element);
    if (!groups.has(model)) groups.set(model, []);
    groups.get(model).push(element);
  });
  const files = [];
  const used = new Set();
  for (const [model, entities] of groups) {
    let base = ctx.ident(model.name || (root._type === 'ERDEntity' ? root.name : 'schema'), 'schema');
    for (let n = 2; used.has(base); n += 1) base = `${ctx.ident(model.name, 'schema')}_${n}`;
    used.add(base);
    files.push({ path: `${base}.sql`, content: script(entities, ctx, dialect) });
  }
  return files;
}

function script(entities, ctx, dialect) {
  const o = ctx.options;
  const I = ctx.indent(1);
  const [qa, qb] = QUOTES[dialect];
  const q = (name) => {
    const text = String(name ?? '').trim() || 'unnamed';
    return o.quoteIdentifiers || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(text) || RESERVED.has(text.toLowerCase()) ? `${qa}${text.replaceAll(qb, qb + qb)}${qb}` : text;
  };
  const entityOfColumn = (column) => ctx.index.parent(column._id);
  const foreignKeys = (entity) => (entity.columns ?? []).filter((c) => o.foreignKeys && refId(c.referenceTo)).map((c) => {
    const target = ctx.index.get(c.referenceTo);
    const table = target && entityOfColumn(target);
    return target && table?._type === 'ERDEntity' ? { column: c, target, table } : null;
  }).filter(Boolean);

  // Order: referenced tables first (depth-first); a reference back to a table
  // still being visited is a cycle → that key goes to ALTER TABLE.
  const order = [];
  const state = new Map();
  const deferred = new Set();
  const visit = (entity) => {
    state.set(entity, 1);
    for (const fk of foreignKeys(entity)) {
      if (!entities.includes(fk.table) || fk.table === entity) continue;
      if (state.get(fk.table) === 1) deferred.add(fk.column);
      else if (!state.has(fk.table)) visit(fk.table);
    }
    state.set(entity, 2);
    order.push(entity);
  };
  entities.forEach((e) => { if (!state.has(e)) visit(e); });

  const lines = [...ctx.header('--')];
  if (o.dropTables) {
    for (const entity of [...order].reverse()) {
      if (dialect === 'oracle') lines.push(`BEGIN EXECUTE IMMEDIATE 'DROP TABLE ${q(entity.name)} CASCADE CONSTRAINTS'; EXCEPTION WHEN OTHERS THEN NULL; END;`, '/');
      else lines.push(`DROP TABLE IF EXISTS ${q(entity.name)}${dialect === 'postgres' ? ' CASCADE' : ''};`);
    }
    lines.push('');
  }
  const alters = [];
  for (const entity of order) {
    for (const doc of ctx.docLines(entity.documentation)) lines.push(`-- ${doc}`);
    const defs = [];
    const columns = entity.columns ?? [];
    const keys = columns.filter((c) => c.primaryKey);
    for (const c of columns) {
      let def = `${I}${q(c.name)} ${columnType(c, dialect)}`;
      if (c.defaultValue !== undefined && String(c.defaultValue).trim() !== '') def += ` DEFAULT ${c.defaultValue}`;
      if (!c.nullable || c.primaryKey) def += ' NOT NULL';
      if (c.unique && !c.primaryKey) def += ' UNIQUE';
      if (ctx.options.documentation && c.documentation && dialect === 'mysql') def += ` COMMENT '${String(c.documentation).replaceAll("'", "''").replace(/\s+/g, ' ')}'`;
      defs.push(def);
    }
    if (keys.length) defs.push(`${I}CONSTRAINT ${q(`pk_${entity.name}`)} PRIMARY KEY (${keys.map((c) => q(c.name)).join(', ')})`);
    for (const fk of foreignKeys(entity)) {
      const text = `CONSTRAINT ${q(`fk_${entity.name}_${fk.column.name}`)} FOREIGN KEY (${q(fk.column.name)}) REFERENCES ${q(fk.table.name)} (${q(fk.target.name)})`;
      if (deferred.has(fk.column)) alters.push(`ALTER TABLE ${q(entity.name)} ADD ${text};`);
      else defs.push(I + text);
    }
    lines.push(`CREATE TABLE ${q(entity.name)} (`, defs.join(',\n'), `);`, '');
  }
  if (alters.length) lines.push(...alters, '');
  return ctx.join(lines);
}

/** "VARCHAR(255)" for a column in a dialect. */
export function columnType(column, dialect) {
  let type = String(column.type ?? '').trim() || 'VARCHAR';
  const upper = type.toUpperCase();
  const mapped = TYPE_MAP[dialect]?.[upper];
  if (mapped) type = mapped;
  const length = String(column.length ?? '').trim();
  if (length && !type.includes('(')) type += `(${length})`;
  else if (!length && /^(N?VARCHAR2?|N?CHAR)$/i.test(type) && dialect !== 'sqlite' && dialect !== 'postgres') type += '(255)';
  return type;
}
