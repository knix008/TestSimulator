// Database analysis: schema (ERD), per-table/column access from code, and the
// database instances ("catalogs") the project connects to.
//
// Two halves:
//  1. Schema discovery — SQL DDL files, EF Core, JPA, Prisma, TypeORM/Sequelize,
//     Django and SQLAlchemy models.
//  2. Access discovery — for each analyzed function, which tables and columns
//     it touches and with which CRUD operations.
//
// Access scanning deliberately reads the *original* text: the SQL lives inside
// string literals, which the mask blanks out.

import { baseName } from './languages.js';
import { lineFromStarts, escapeRegExp } from './text.js';

export const DIALECTS = ['unknown', 'mysql', 'mariadb', 'postgresql', 'sqlite', 'sqlserver'];

export const CRUD = { create: 1, read: 2, update: 4, delete: 8 };

export function crudLabel(mask) {
  const parts = [];
  if (mask & CRUD.create) parts.push('C');
  if (mask & CRUD.read) parts.push('R');
  if (mask & CRUD.update) parts.push('U');
  if (mask & CRUD.delete) parts.push('D');
  return parts.length ? parts.join('') : '-';
}

// ---------------------------------------------------------------- catalogs --

const CONNECTION_PATTERNS = [
  { dialect: 'sqlserver', re: /(?:Server|Data\s*Source)\s*=\s*([^;"'\n]+)[^"'\n]*?(?:Initial\s*Catalog|Database)\s*=\s*([^;"'\n]+)/gi, nameIndex: 2 },
  { dialect: 'mysql', re: /(?:mysql|mariadb):\/\/[^/\s"']+\/([\w-]+)/gi, nameIndex: 1 },
  { dialect: 'postgresql', re: /(?:postgres(?:ql)?):\/\/[^/\s"']+\/([\w-]+)/gi, nameIndex: 1 },
  { dialect: 'postgresql', re: /host\s*=\s*[^;\s"']+[^"'\n]*?dbname\s*=\s*([\w-]+)/gi, nameIndex: 1 },
  { dialect: 'mysql', re: /(?:Server|Host)\s*=\s*[^;"'\n]+[^"'\n]*?Database\s*=\s*([\w-]+)/gi, nameIndex: 1 },
  { dialect: 'sqlite', re: /["'`]([\w./\\-]+\.(?:sqlite3?|db))["'`]/gi, nameIndex: 1 },
  { dialect: 'sqlite', re: /Data\s*Source\s*=\s*([\w./\\-]+\.(?:sqlite3?|db))/gi, nameIndex: 1 },
  { dialect: 'unknown', re: /\bUSE\s+[`"[]?(\w+)[`"\]]?\s*;/gi, nameIndex: 1 },
];

const DB_API_HINT =
  /\b(?:SqlConnection|NpgsqlConnection|MySqlConnection|SqliteConnection|OdbcConnection|OleDbConnection|createConnection|createPool|getConnection|DriverManager|psycopg2?|sqlite3|mysql2?|pg\.Pool|DataSource|UseSqlServer|UseNpgsql|UseMySql|UseSqlite|PrismaClient|Sequelize|createClient|knex)\b/;

/** Finds the database instances the project talks to. */
export function extractCatalogs(files) {
  const catalogs = new Map();

  for (const file of files) {
    if (!file.text) continue;
    // Cheap prefilter: only files that mention a DB API or a connection scheme.
    if (!DB_API_HINT.test(file.text) && !/(?:jdbc:|mysql:\/\/|postgres|Data\s*Source|\.sqlite|\.db["'])/i.test(file.text)) {
      continue;
    }

    for (const pattern of CONNECTION_PATTERNS) {
      pattern.re.lastIndex = 0;
      let m;
      while ((m = pattern.re.exec(file.text)) !== null) {
        const raw = (m[pattern.nameIndex] || '').trim();
        if (!raw || raw.length > 120) continue;
        const name = raw.replace(/^.*[/\\]/, '');
        if (!/^[\w.-]+$/.test(name)) continue;

        const id = pattern.dialect + ':' + name.toLowerCase();
        if (catalogs.has(id)) continue;
        catalogs.set(id, {
          id,
          name,
          dialect: pattern.dialect,
          sourceKind: pattern.dialect === 'sqlite' ? 'sqlite-file' : 'connection-string',
          filePath: file.path,
          lineNumber: lineFromStarts(file.lineStarts, m.index),
        });
      }
    }
  }

  return [...catalogs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ schema --

// A column type is one word (plus the two-word forms SQL actually has) and an
// optional precision — deliberately NOT greedy over the following words, or
// `id INTEGER PRIMARY KEY` would report the type as "INTEGER PRIMARY KEY".
const SQL_TYPE = '[A-Za-z_]\\w*(?:\\s+(?:PRECISION|VARYING))?(?:\\s*\\([^)\\n]*\\))?(?:\\s+UNSIGNED)?';

/** `CREATE TABLE` in .sql files and in SQL string literals. */
function extractSqlTables(file, out) {
  const re = /CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?(?:(\w+)[`"\]]?\s*\.\s*[`"[]?)?(\w+)[`"\]]?\s*\(/gi;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(file.text)) !== null) {
    const schema = m[1] || null;
    const name = m[2];
    const body = balancedParens(file.text, re.lastIndex - 1);
    if (body === null) continue;

    const columns = parseSqlColumns(body);
    out.push({
      id: tableId(name),
      name,
      schema,
      entityTypeName: '',
      dialect: guessDialect(file.text),
      sourceKind: 'sql-ddl',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [],
      columns,
    });
  }
}

function parseSqlColumns(body) {
  const columns = [];
  const parts = splitTopLevel(body);
  const pkNames = new Set();
  const fks = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const pk = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(trimmed);
    if (pk) {
      for (const name of pk[1].split(',')) pkNames.add(cleanIdent(name));
      continue;
    }

    const fk = /^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+[`"[]?(\w+)[`"\]]?\s*(?:\(([^)]*)\))?/i.exec(trimmed);
    if (fk) {
      fks.push({
        column: cleanIdent(fk[1]),
        referencedTable: fk[2],
        referencedColumn: fk[3] ? cleanIdent(fk[3]) : 'id',
      });
      continue;
    }

    if (/^(?:UNIQUE|KEY|INDEX|CHECK|CONSTRAINT)\b/i.test(trimmed)) continue;

    const col = new RegExp('^[`"\\[]?(\\w+)[`"\\]]?\\s+(' + SQL_TYPE + ')', 'i').exec(trimmed);
    if (!col) continue;

    const inlineRef = /REFERENCES\s+[`"[]?(\w+)[`"\]]?\s*(?:\(\s*[`"[]?(\w+)[`"\]]?\s*\))?/i.exec(trimmed);
    columns.push({
      name: col[1],
      dataType: col[2].trim(),
      isPrimaryKey: /PRIMARY\s+KEY/i.test(trimmed),
      isForeignKey: !!inlineRef,
      isNullable: !/NOT\s+NULL/i.test(trimmed),
      referencedTable: inlineRef ? inlineRef[1] : null,
      referencedColumn: inlineRef ? inlineRef[2] || 'id' : null,
    });
  }

  for (const column of columns) {
    if (pkNames.has(column.name)) column.isPrimaryKey = true;
    const fk = fks.find((f) => f.column === column.name);
    if (fk) {
      column.isForeignKey = true;
      column.referencedTable = fk.referencedTable;
      column.referencedColumn = fk.referencedColumn;
    }
  }

  return columns;
}

/** Prisma `model X { … }`. */
function extractPrisma(file, out) {
  if (!/\bmodel\s+\w+\s*\{/.test(file.text)) return;
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(file.text)) !== null) {
    const name = m[1];
    const columns = [];
    for (const line of m[2].split('\n')) {
      const field = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!field || /^(@@|\/\/)/.test(line.trim())) continue;
      const attrs = field[5] || '';
      const relation = /@relation\([^)]*references:\s*\[(\w+)\]/.exec(attrs);
      columns.push({
        name: field[1],
        dataType: field[2] + (field[3] || ''),
        isPrimaryKey: /@id\b/.test(attrs),
        isForeignKey: !!relation,
        isNullable: !!field[4],
        referencedTable: relation ? field[2] : null,
        referencedColumn: relation ? relation[1] : null,
      });
    }
    out.push({
      id: tableId(name),
      name,
      schema: null,
      entityTypeName: name,
      dialect: guessDialect(file.text),
      sourceKind: 'prisma',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [name, name.toLowerCase(), name + 's'],
      columns,
    });
  }
}

/** JPA `@Entity` / `@Table(name=…)` classes. */
function extractJpa(file, out) {
  if (!/@Entity\b/.test(file.text)) return;
  const re = /@Entity[\s\S]{0,200}?(?:@Table\s*\(\s*name\s*=\s*"([^"]+)"[^)]*\)[\s\S]{0,200}?)?\bclass\s+(\w+)/g;
  let m;
  while ((m = re.exec(file.text)) !== null) {
    const entity = m[2];
    const name = m[1] || entity;
    const bodyStart = file.text.indexOf('{', m.index + m[0].length - entity.length);
    const body = bodyStart >= 0 ? balancedBraces(file.text, bodyStart) : '';
    out.push({
      id: tableId(name),
      name,
      schema: null,
      entityTypeName: entity,
      dialect: 'unknown',
      sourceKind: 'jpa',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [entity],
      columns: parseAnnotatedFields(body, {
        columnRe: /@Column\s*\(\s*name\s*=\s*"([^"]+)"/,
        idRe: /@Id\b/,
        joinRe: /@JoinColumn\s*\(\s*name\s*=\s*"([^"]+)"/,
        relationRe: /@(?:ManyToOne|OneToOne|OneToMany|ManyToMany)\b/,
        fieldRe: /(?:private|protected|public)\s+([\w<>,. ]+?)\s+(\w+)\s*[;=]/,
      }),
    });
  }
}

/** TypeORM `@Entity()` classes. */
function extractTypeOrm(file, out) {
  if (!/@Entity\s*\(/.test(file.text)) return;
  const re = /@Entity\s*\(\s*(?:['"]([^'"]+)['"])?[^)]*\)\s*(?:export\s+)?class\s+(\w+)/g;
  let m;
  while ((m = re.exec(file.text)) !== null) {
    const entity = m[2];
    const name = m[1] || entity;
    const bodyStart = file.text.indexOf('{', m.index + m[0].length);
    const body = bodyStart >= 0 ? balancedBraces(file.text, bodyStart) : '';
    out.push({
      id: tableId(name),
      name,
      schema: null,
      entityTypeName: entity,
      dialect: 'unknown',
      sourceKind: 'typeorm',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [entity],
      columns: parseAnnotatedFields(body, {
        columnRe: /@Column\s*\(\s*\{[^}]*name:\s*['"]([^'"]+)['"]/,
        idRe: /@PrimaryGeneratedColumn|@PrimaryColumn/,
        joinRe: /@JoinColumn\s*\(\s*\{[^}]*name:\s*['"]([^'"]+)['"]/,
        relationRe: /@(?:ManyToOne|OneToOne|OneToMany|ManyToMany)\b/,
        fieldRe: /(\w+)\s*[!?]?\s*:\s*([\w<>[\], |]+)\s*[;=]/,
        nameFirst: true,
      }),
    });
  }
}

/** EF Core: `DbSet<Entity> Name` plus `[Table("…")]` on the entity class. */
function extractEfCore(file, out) {
  const dbSetRe = /DbSet\s*<\s*([\w.]+)\s*>\s+(\w+)\s*\{/g;
  let m;
  while ((m = dbSetRe.exec(file.text)) !== null) {
    const entity = m[1].split('.').pop();
    out.push({
      id: tableId(m[2]),
      name: m[2],
      schema: null,
      entityTypeName: entity,
      dialect: guessDialect(file.text),
      sourceKind: 'efcore',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [m[2], entity],
      columns: [],
    });
  }

  const tableAttrRe = /\[Table\s*\(\s*"([^"]+)"[^\]]*\]\s*(?:public\s+)?(?:partial\s+)?class\s+(\w+)/g;
  while ((m = tableAttrRe.exec(file.text)) !== null) {
    const bodyStart = file.text.indexOf('{', m.index + m[0].length);
    const body = bodyStart >= 0 ? balancedBraces(file.text, bodyStart) : '';
    out.push({
      id: tableId(m[1]),
      name: m[1],
      schema: null,
      entityTypeName: m[2],
      dialect: 'unknown',
      sourceKind: 'efcore-entity',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [m[2]],
      columns: parseAnnotatedFields(body, {
        columnRe: /\[Column\s*\(\s*"([^"]+)"/,
        idRe: /\[Key\]/,
        joinRe: /\[ForeignKey\s*\(\s*"([^"]+)"/,
        relationRe: /\[ForeignKey/,
        fieldRe: /public\s+([\w<>?[\], .]+?)\s+(\w+)\s*\{\s*get/,
      }),
    });
  }
}

/** Django `class X(models.Model)` and SQLAlchemy `__tablename__`. */
function extractPythonOrm(file, out) {
  const djangoRe = /class\s+(\w+)\s*\(\s*(?:models\.)?Model\s*\)\s*:/g;
  let m;
  while ((m = djangoRe.exec(file.text)) !== null) {
    const body = pythonBlock(file.text, m.index + m[0].length);
    out.push({
      id: tableId(m[1]),
      name: m[1],
      schema: null,
      entityTypeName: m[1],
      dialect: 'unknown',
      sourceKind: 'django',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [m[1], m[1].toLowerCase()],
      columns: [...body.matchAll(/^\s{2,}(\w+)\s*=\s*models\.(\w+)\(([^)]*)\)/gm)].map((f) => ({
        name: f[1],
        dataType: f[2],
        isPrimaryKey: /primary_key\s*=\s*True/.test(f[3]),
        isForeignKey: /^(?:ForeignKey|OneToOneField|ManyToManyField)$/.test(f[2]),
        isNullable: /null\s*=\s*True/.test(f[3]),
        referencedTable: /^(?:ForeignKey|OneToOneField|ManyToManyField)$/.test(f[2])
          ? (/["'](\w+)["']|^\s*(\w+)/.exec(f[3]) || [])[1] || null
          : null,
        referencedColumn: 'id',
      })),
    });
  }

  const alchemyRe = /class\s+(\w+)\s*\([^)]*\)\s*:\s*([\s\S]{0,4000}?)(?=\nclass\s|\n\S|$)/g;
  while ((m = alchemyRe.exec(file.text)) !== null) {
    const tableName = /__tablename__\s*=\s*["'](\w+)["']/.exec(m[2]);
    if (!tableName) continue;
    out.push({
      id: tableId(tableName[1]),
      name: tableName[1],
      schema: null,
      entityTypeName: m[1],
      dialect: 'unknown',
      sourceKind: 'sqlalchemy',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [m[1]],
      columns: [...m[2].matchAll(/^\s+(\w+)\s*=\s*(?:db\.)?Column\(\s*([\w.()]+)([^)]*)\)/gm)].map((f) => ({
        name: f[1],
        dataType: f[2],
        isPrimaryKey: /primary_key\s*=\s*True/.test(f[3]),
        isForeignKey: /ForeignKey/.test(f[3]),
        isNullable: !/nullable\s*=\s*False/.test(f[3]),
        referencedTable: (/ForeignKey\(\s*["'](\w+)\./.exec(f[3]) || [])[1] || null,
        referencedColumn: (/ForeignKey\(\s*["']\w+\.(\w+)/.exec(f[3]) || [])[1] || 'id',
      })),
    });
  }
}

/** Sequelize `sequelize.define('name', { … })`. */
function extractSequelize(file, out) {
  const re = /\.define\s*\(\s*['"](\w+)['"]\s*,\s*\{/g;
  let m;
  while ((m = re.exec(file.text)) !== null) {
    const body = balancedBraces(file.text, re.lastIndex - 1);
    out.push({
      id: tableId(m[1]),
      name: m[1],
      schema: null,
      entityTypeName: m[1],
      dialect: 'unknown',
      sourceKind: 'sequelize',
      filePath: file.path,
      lineNumber: lineFromStarts(file.lineStarts, m.index),
      accessAliases: [m[1]],
      columns: [...body.matchAll(/(\w+)\s*:\s*\{([^}]*)\}|(\w+)\s*:\s*DataTypes\.(\w+)/g)].map((f) => ({
        name: f[1] || f[3],
        dataType: (f[2] ? (/type\s*:\s*DataTypes\.(\w+)/.exec(f[2]) || [])[1] : f[4]) || '',
        isPrimaryKey: !!(f[2] && /primaryKey\s*:\s*true/.test(f[2])),
        isForeignKey: !!(f[2] && /references/.test(f[2])),
        isNullable: !(f[2] && /allowNull\s*:\s*false/.test(f[2])),
        referencedTable: f[2] ? (/model\s*:\s*['"](\w+)['"]/.exec(f[2]) || [])[1] || null : null,
        referencedColumn: 'id',
      })),
    });
  }
}

function parseAnnotatedFields(body, spec) {
  const columns = [];
  if (!body) return columns;

  // One chunk per field, split at the statement terminator so each field keeps
  // the annotations written above it. The `;` is put back on every chunk: the
  // field patterns match on it, and `{ get; set; }` properties rely on it too.
  const chunks = body.split(';').map((chunk) => chunk + ';');
  for (const chunk of chunks) {
    const field = spec.fieldRe.exec(chunk);
    if (!field) continue;

    const name = spec.nameFirst ? field[1] : field[2];
    const dataType = spec.nameFirst ? field[2] : field[1];
    if (!name) continue;

    const explicit = spec.columnRe.exec(chunk);
    const join = spec.joinRe.exec(chunk);

    columns.push({
      name: (explicit && explicit[1]) || (join && join[1]) || name,
      dataType: String(dataType || '').trim(),
      isPrimaryKey: spec.idRe.test(chunk),
      isForeignKey: spec.relationRe.test(chunk) || !!join,
      isNullable: !/nullable\s*=\s*false/i.test(chunk),
      referencedTable: spec.relationRe.test(chunk) ? String(dataType || '').replace(/[<>[\]]/g, '').split(/[,\s]/).pop() : null,
      referencedColumn: 'id',
    });
    if (columns.length > 80) break;
  }
  return columns;
}

/**
 * Runs every schema extractor over the analyzed files and links relations.
 */
export function extractSchema(files) {
  const tables = [];

  for (const file of files) {
    if (!file.text) continue;
    const ext = (file.path.match(/\.[^./\\]+$/) || [''])[0].toLowerCase();

    if (ext === '.sql' || /CREATE\s+TABLE/i.test(file.text)) extractSqlTables(file, tables);
    if (ext === '.prisma' || /\bdatasource\s+\w+\s*\{/.test(file.text)) extractPrisma(file, tables);
    if (file.languageId === 'java' || file.languageId === 'kotlin') extractJpa(file, tables);
    if (file.languageId === 'javascript') {
      extractTypeOrm(file, tables);
      extractSequelize(file, tables);
    }
    if (file.languageId === 'csharp') extractEfCore(file, tables);
    if (file.languageId === 'python') extractPythonOrm(file, tables);
  }

  // The same table is often described twice — a DDL file *and* an ORM entity,
  // or a DbSet *and* a [Table] class. Merge them column by column rather than
  // letting whichever was scanned first win: the DDL usually knows the real
  // types and foreign keys, while the entity knows the code-facing alias.
  const merged = new Map();
  for (const table of tables) {
    const existing = merged.get(table.id);
    if (!existing) {
      merged.set(table.id, { ...table, columns: [...table.columns] });
      continue;
    }

    // A hand-written DDL wins on types and foreign keys: an ORM entity names
    // its *class* (`customer_id -> Customer`), while the schema names the real
    // table (`customer_id -> users`).
    const ddlWins = table.sourceKind === 'sql-ddl' && existing.sourceKind !== 'sql-ddl';
    existing.columns = mergeColumns(existing.columns, table.columns, ddlWins);
    existing.entityTypeName = existing.entityTypeName || table.entityTypeName;
    existing.accessAliases = [...new Set([...existing.accessAliases, ...table.accessAliases])];
    if (existing.dialect === 'unknown') existing.dialect = table.dialect;
    // A hand-written schema is the authoritative description; say so.
    if (table.sourceKind === 'sql-ddl' && existing.sourceKind !== 'sql-ddl') {
      existing.sourceKind = table.sourceKind;
      existing.filePath = table.filePath;
      existing.lineNumber = table.lineNumber;
    }
  }

  const list = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { tables: list, relations: buildRelations(list) };
}

/**
 * Unions two column lists by name, taking the more specific value for each
 * field — a resolved foreign-key target beats an unresolved one, a declared
 * type beats a blank, and a primary key flag is never lost.
 */
function mergeColumns(left, right, rightWins = false) {
  const byName = new Map();
  const order = [...left, ...right];

  for (const column of order) {
    const key = column.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...column });
      continue;
    }

    const authoritative = rightWins && right.includes(column);
    if (authoritative) {
      if (column.dataType) existing.dataType = column.dataType;
      if (column.referencedTable) {
        existing.referencedTable = column.referencedTable;
        existing.referencedColumn = column.referencedColumn;
      }
    } else {
      existing.dataType = existing.dataType || column.dataType;
      if (!existing.referencedTable && column.referencedTable) {
        existing.referencedTable = column.referencedTable;
        existing.referencedColumn = column.referencedColumn;
      }
    }

    existing.isPrimaryKey = existing.isPrimaryKey || column.isPrimaryKey;
    existing.isForeignKey = existing.isForeignKey || column.isForeignKey;
    existing.isNullable = existing.isNullable && column.isNullable;
  }

  return [...byName.values()];
}

function buildRelations(tables) {
  const byName = new Map();
  for (const table of tables) {
    byName.set(table.name.toLowerCase(), table);
    if (table.entityTypeName) byName.set(table.entityTypeName.toLowerCase(), table);
  }

  const relations = [];
  const seen = new Set();

  for (const table of tables) {
    for (const column of table.columns) {
      let target = null;
      let kind = 'foreignKey';

      if (column.referencedTable) {
        target = byName.get(String(column.referencedTable).toLowerCase());
      }
      // Inferred: a `*_id` column whose stem names a known table.
      if (!target && /_?id$/i.test(column.name) && column.name.length > 2) {
        const stem = column.name.replace(/_?id$/i, '').toLowerCase();
        target = byName.get(stem) || byName.get(stem + 's') || byName.get(stem.replace(/s$/, ''));
        kind = 'inferredReference';
      }
      if (!target || target.id === table.id) continue;

      const key = table.id + '->' + target.id + ':' + column.name;
      if (seen.has(key)) continue;
      seen.add(key);

      relations.push({
        fromTableId: table.id,
        toTableId: target.id,
        fromColumn: column.name,
        toColumn: column.referencedColumn || 'id',
        kind,
        label: column.name + ' → ' + target.name + '.' + (column.referencedColumn || 'id'),
        cardinality: column.isPrimaryKey ? '1..1' : 'N..1',
      });
    }
  }

  return relations;
}

// ------------------------------------------------------------------ access --

const SQL_STATEMENT_RE =
  /\b(SELECT)\b[\s\S]{0,600}?\bFROM\s+([`"[]?[\w.]+[`"\]]?)|(\bINSERT\s+INTO)\s+([`"[]?[\w.]+[`"\]]?)|(\bUPDATE)\s+([`"[]?[\w.]+[`"\]]?)\s+SET\b|(\bDELETE)\s+FROM\s+([`"[]?[\w.]+[`"\]]?)|\b(JOIN)\s+([`"[]?[\w.]+[`"\]]?)|(\b(?:CREATE|DROP|TRUNCATE|ALTER)\s+TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([`"[]?[\w.]+[`"\]]?)/gi;

/** ORM/API calls that read or write an entity, per language family. */
const ORM_PATTERNS = [
  { re: /\b(\w+)\.(?:Add|AddAsync|AddRange|AddRangeAsync)\s*\(/g, ops: CRUD.create, pattern: 'entityFramework' },
  { re: /\b(\w+)\.(?:Remove|RemoveRange|ExecuteDelete(?:Async)?)\s*\(/g, ops: CRUD.delete, pattern: 'entityFramework' },
  { re: /\b(\w+)\.(?:Update|UpdateRange|ExecuteUpdate(?:Async)?)\s*\(/g, ops: CRUD.update, pattern: 'entityFramework' },
  {
    re: /\b(\w+)\.(?:Find|FindAsync|FirstOrDefault(?:Async)?|SingleOrDefault(?:Async)?|Where|ToList(?:Async)?|Any(?:Async)?|Count(?:Async)?|Include)\s*\(/g,
    ops: CRUD.read,
    pattern: 'entityFramework',
  },
  { re: /\b(\w+)\.(?:create|bulkCreate|insert|insertMany|save)\s*\(/g, ops: CRUD.create, pattern: 'entityType' },
  { re: /\b(\w+)\.(?:findAll|findOne|findByPk|findMany|findUnique|findFirst|get|all|filter|query)\s*\(/g, ops: CRUD.read, pattern: 'entityType' },
  { re: /\b(\w+)\.(?:update|updateMany|updateOne|upsert)\s*\(/g, ops: CRUD.update, pattern: 'entityType' },
  { re: /\b(\w+)\.(?:destroy|delete|deleteMany|deleteOne|remove)\s*\(/g, ops: CRUD.delete, pattern: 'entityType' },
  { re: /\bobjects\.(?:filter|all|get|first|last|count|exists)\s*\(/g, ops: CRUD.read, pattern: 'entityType', selfNamed: true },
];

const SQL_KEYWORD_HINT = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|TRUNCATE|ALTER\s+TABLE|JOIN)\b/i;

/**
 * Per-function table/column access.
 *
 * @param {object[]} functions functions with `bodyText` still attached
 * @param {object[]} tables    tables from {@link extractSchema}
 */
export function analyzeTableAccess(functions, tables) {
  const accesses = [];
  const columnAccesses = [];
  if (tables.length === 0) return { accesses, columnAccesses };

  const byName = new Map();
  for (const table of tables) {
    byName.set(table.name.toLowerCase(), table);
    for (const alias of table.accessAliases) byName.set(String(alias).toLowerCase(), table);
    if (table.entityTypeName) byName.set(table.entityTypeName.toLowerCase(), table);
  }

  const columnIndex = new Map(); // tableId -> Set(columnName)
  for (const table of tables) columnIndex.set(table.id, new Set(table.columns.map((c) => c.name.toLowerCase())));

  for (const fn of functions) {
    const body = fn.bodyText;
    if (!body) continue;

    /** @type {Map<string, number>} tableId -> crud mask */
    const hits = new Map();
    /** @type {Map<string, string>} tableId -> access pattern */
    const patterns = new Map();

    if (SQL_KEYWORD_HINT.test(body)) {
      SQL_STATEMENT_RE.lastIndex = 0;
      let m;
      while ((m = SQL_STATEMENT_RE.exec(body)) !== null) {
        const [, select, selectTable, insert, insertTable, update, updateTable, del, deleteTable, join, joinTable, ddl, ddlTable] = m;
        let name = null;
        let ops = 0;

        if (select) {
          name = selectTable;
          ops = CRUD.read;
        } else if (insert) {
          name = insertTable;
          ops = CRUD.create;
        } else if (update) {
          name = updateTable;
          ops = CRUD.update;
        } else if (del) {
          name = deleteTable;
          ops = CRUD.delete;
        } else if (join) {
          name = joinTable;
          ops = CRUD.read;
        } else if (ddl) {
          name = ddlTable;
          ops = /CREATE/i.test(ddl) ? CRUD.create : /ALTER/i.test(ddl) ? CRUD.update : CRUD.delete;
        }

        const table = resolveTable(byName, name);
        if (!table) continue;
        hits.set(table.id, (hits.get(table.id) || 0) | ops);
        patterns.set(table.id, 'sql');
      }
    }

    for (const orm of ORM_PATTERNS) {
      orm.re.lastIndex = 0;
      let m;
      while ((m = orm.re.exec(body)) !== null) {
        const receiver = orm.selfNamed ? guessDjangoModel(body, m.index) : m[1];
        const table = resolveTable(byName, receiver);
        if (!table) continue;
        hits.set(table.id, (hits.get(table.id) || 0) | orm.ops);
        if (!patterns.has(table.id)) patterns.set(table.id, orm.pattern);
      }
    }

    for (const [tableId, ops] of hits) {
      accesses.push({
        tableId,
        functionId: fn.id,
        functionDisplayName: fn.displayName,
        functionFullName: fn.fullName,
        functionFilePath: fn.filePath,
        functionLineNumber: fn.startLine,
        kind: accessKind(ops),
        pattern: patterns.get(tableId) || 'sql',
        operations: ops,
      });

      // Column-level: which of the table's columns the body actually names.
      const columns = columnIndex.get(tableId);
      if (!columns || columns.size === 0) continue;
      const lower = body.toLowerCase();
      for (const column of columns) {
        if (column.length < 3) continue;
        const re = new RegExp('(?:^|[^\\w.])' + escapeRegExp(column) + '(?![\\w])', 'm');
        if (!re.test(lower)) continue;
        columnAccesses.push({
          tableId,
          columnName: column,
          functionId: fn.id,
          functionDisplayName: fn.displayName,
          functionFullName: fn.fullName,
          functionFilePath: fn.filePath,
          functionLineNumber: fn.startLine,
          kind: accessKind(ops),
          pattern: patterns.get(tableId) || 'sql',
          operations: ops,
        });
      }
    }
  }

  return { accesses, columnAccesses };
}

function resolveTable(byName, rawName) {
  if (!rawName) return null;
  const cleaned = String(rawName).replace(/[`"[\]]/g, '').split('.').pop().toLowerCase();
  if (!cleaned || cleaned.length < 2) return null;
  return byName.get(cleaned) || byName.get(cleaned.replace(/s$/, '')) || byName.get(cleaned + 's') || null;
}

function guessDjangoModel(body, index) {
  const before = body.slice(Math.max(0, index - 80), index);
  const m = /(\w+)\s*\.\s*$/.exec(before);
  return m ? m[1] : null;
}

function accessKind(ops) {
  const writes = ops & (CRUD.create | CRUD.update | CRUD.delete);
  const reads = ops & CRUD.read;
  if (writes && reads) return 'readWrite';
  if (writes) return 'write';
  return 'read';
}

/** Which functions connect to which database instance. */
export function analyzeCatalogAccess(functions, catalogs) {
  const out = [];
  if (catalogs.length === 0) return out;

  for (const fn of functions) {
    const body = fn.bodyText;
    if (!body || !DB_API_HINT.test(body)) continue;
    for (const catalog of catalogs) {
      if (!body.toLowerCase().includes(catalog.name.toLowerCase())) continue;
      out.push({
        catalogId: catalog.id,
        functionId: fn.id,
        functionDisplayName: fn.displayName,
        functionFullName: fn.fullName,
        functionFilePath: fn.filePath,
        functionLineNumber: fn.startLine,
        kind: 'connect',
        pattern: 'connectionString',
      });
    }
  }
  return out;
}

// ----------------------------------------------------------------- helpers --

function tableId(name) {
  return 'table:' + String(name).toLowerCase();
}

function cleanIdent(text) {
  return String(text).replace(/[`"[\]]/g, '').trim();
}

function guessDialect(text) {
  if (/npgsql|postgres|psycopg/i.test(text)) return 'postgresql';
  if (/mariadb/i.test(text)) return 'mariadb';
  if (/mysql/i.test(text)) return 'mysql';
  if (/sqlite/i.test(text)) return 'sqlite';
  if (/sqlserver|SqlConnection|UseSqlServer|mssql/i.test(text)) return 'sqlserver';
  return 'unknown';
}

/** Text between the parenthesis at `open` and its match (exclusive). */
function balancedParens(text, open) {
  if (text[open] !== '(') return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

function balancedBraces(text, open) {
  if (text[open] !== '{') return '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return text.slice(open + 1);
}

function pythonBlock(text, from) {
  const end = text.indexOf('\nclass ', from);
  return text.slice(from, end < 0 ? Math.min(text.length, from + 8000) : end);
}

/** Splits a `CREATE TABLE` body on top-level commas. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}
