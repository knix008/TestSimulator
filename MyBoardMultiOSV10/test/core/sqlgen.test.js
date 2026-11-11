// Unit tests: per-dialect SQL generation (placeholders, quoting, LIMIT, DDL), rank keys, ids, CSV, SVG sanitiser,
// durations, mentions, URL parsing. No database needed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  rewriteSql, quoteIdent, limitClause, columnType, createTableSql, createIndexSql, addColumnSql, listTablesSql, listColumnsSql, likeEscape, DIALECTS,
} from '../../core/db/sqlgen.js';
import { TABLE, TABLES } from '../../core/db/schema.js';
import { parseDbUrl } from '../../core/db/index.js';
import * as rank from '../../core/rank.js';
import { newId, newToken } from '../../core/ids.js';
import { parseCsv, formatCsv, detectDelimiter } from '../../core/services/csv.js';
import { sanitizeSvg, sniffMime } from '../../core/services/icons.js';
import { parseTimeSpent, mentionsIn } from '../../core/services/parts.js';
import { toApi, fromApi, camel, snake } from '../../core/services/common.js';
import { EventBus } from '../../core/events.js';

describe('placeholder and identifier rewrite', () => {
  const sql = 'SELECT "key", \'it\'\'s ? "x"\' AS s FROM "t" WHERE "a" = ? AND "b" IN (?, ?) -- comment ? "c"\nAND "rank" > ?';
  test('sqlite keeps portable SQL as is', () => {
    assert.equal(rewriteSql('sqlite', sql), sql);
  });
  test('postgres numbers placeholders, keeps literals and comments', () => {
    assert.equal(rewriteSql('postgres', sql), 'SELECT "key", \'it\'\'s ? "x"\' AS s FROM "t" WHERE "a" = $1 AND "b" IN ($2, $3) -- comment ? "c"\nAND "rank" > $4');
  });
  test('mysql backticks identifiers', () => {
    assert.equal(rewriteSql('mysql', sql), 'SELECT `key`, \'it\'\'s ? "x"\' AS s FROM `t` WHERE `a` = ? AND `b` IN (?, ?) -- comment ? "c"\nAND `rank` > ?');
  });
  test('mssql brackets identifiers and names @p params', () => {
    assert.equal(rewriteSql('mssql', sql), 'SELECT [key], \'it\'\'s ? "x"\' AS s FROM [t] WHERE [a] = @p1 AND [b] IN (@p2, @p3) -- comment ? "c"\nAND [rank] > @p4');
  });
  test('unterminated identifier is an error', () => {
    assert.throws(() => rewriteSql('mysql', 'SELECT "a FROM t'), /unterminated/);
  });
});

describe('identifier quoting', () => {
  test('per dialect', () => {
    assert.equal(quoteIdent('sqlite', 'order'), '"order"');
    assert.equal(quoteIdent('postgres', 'user'), '"user"');
    assert.equal(quoteIdent('mysql', 'rank'), '`rank`');
    assert.equal(quoteIdent('mssql', 'key'), '[key]');
  });
  test('rejects unsafe names', () => {
    for (const d of DIALECTS) assert.throws(() => quoteIdent(d, 'a"; DROP TABLE x; --'), /bad identifier/);
  });
});

describe('limit clause', () => {
  test('limit + offset', () => {
    assert.equal(limitClause('sqlite', 10, 20), ' LIMIT 10 OFFSET 20');
    assert.equal(limitClause('postgres', 10, 20), ' LIMIT 10 OFFSET 20');
    assert.equal(limitClause('mysql', 10, 20), ' LIMIT 10 OFFSET 20');
    assert.equal(limitClause('mssql', 10, 20), ' OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY');
  });
  test('limit only', () => {
    assert.equal(limitClause('sqlite', 5), ' LIMIT 5');
    assert.equal(limitClause('mssql', 5), ' OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY');
  });
  test('offset only', () => {
    assert.equal(limitClause('sqlite', null, 3), ' LIMIT -1 OFFSET 3');
    assert.equal(limitClause('postgres', null, 3), ' OFFSET 3');
    assert.equal(limitClause('mysql', null, 3), ' LIMIT 3, 18446744073709551615');
    assert.equal(limitClause('mssql', null, 3), ' OFFSET 3 ROWS');
  });
  test('none, and values are sanitised to integers', () => {
    for (const d of DIALECTS) assert.equal(limitClause(d), '');
    assert.equal(limitClause('postgres', '7; DROP', 0), '');
    assert.equal(limitClause('sqlite', 2.9, -4), ' LIMIT 2');
  });
});

describe('DDL per dialect', () => {
  const issues = TABLE.issues;
  test('column types', () => {
    const col = (type, size) => ({ name: 'c', type, size, notNull: false });
    assert.equal(columnType('sqlite', col('bigint')), 'INTEGER');
    assert.equal(columnType('mysql', col('string', 100)), 'VARCHAR(100)');
    assert.equal(columnType('postgres', col('string', 100)), 'VARCHAR(100) COLLATE "C"');
    assert.equal(columnType('mssql', col('string', 100)), 'NVARCHAR(100) COLLATE Latin1_General_100_BIN2');
    assert.equal(columnType('mysql', col('text')), 'LONGTEXT');
    assert.equal(columnType('mssql', col('json')), 'NVARCHAR(MAX)');
    assert.equal(columnType('postgres', col('blob')), 'BYTEA');
    assert.equal(columnType('mysql', col('blob')), 'LONGBLOB');
    assert.equal(columnType('mssql', col('blob')), 'VARBINARY(MAX)');
    assert.equal(columnType('postgres', col('float')), 'DOUBLE PRECISION');
    assert.equal(columnType('mssql', col('bool')), 'SMALLINT');
  });
  test('CREATE TABLE sqlite', () => {
    const s = createTableSql('sqlite', TABLE.meta);
    assert.equal(s, 'CREATE TABLE "meta" (\n  "key" TEXT NOT NULL,\n  "value" TEXT,\n  PRIMARY KEY ("key")\n)');
  });
  test('CREATE TABLE mysql has utf8mb4_bin', () => {
    const s = createTableSql('mysql', TABLE.issue_labels);
    assert.match(s, /^CREATE TABLE `issue_labels` \(/);
    assert.match(s, /`label` VARCHAR\(100\) NOT NULL/);
    assert.match(s, /PRIMARY KEY \(`issue_id`, `label`\)/);
    assert.match(s, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin$/);
  });
  test('CREATE TABLE mssql names the primary key', () => {
    const s = createTableSql('mssql', issues);
    assert.match(s, /CONSTRAINT \[pk_issues\] PRIMARY KEY \(\[id\]\)/);
    assert.match(s, /\[description\] NVARCHAR\(MAX\)/);
    assert.match(s, /\[rank\] NVARCHAR\(80\) COLLATE Latin1_General_100_BIN2 NOT NULL/);
  });
  test('CREATE TABLE postgres', () => {
    const s = createTableSql('postgres', TABLE.attachments);
    assert.match(s, /"data" BYTEA/);
    assert.match(s, /"size" BIGINT NOT NULL/);
  });
  test('indexes', () => {
    const ix = createIndexSql('postgres', issues);
    assert.equal(ix[0], 'CREATE UNIQUE INDEX "ux_issues_key" ON "issues" ("key")');
    assert.ok(ix.includes('CREATE INDEX "ix_issues_project_id_rank" ON "issues" ("project_id", "rank")'));
    assert.equal(createIndexSql('mysql', TABLE.sessions)[0], 'CREATE INDEX `ix_sessions_user_id` ON `sessions` (`user_id`)');
  });
  test('ADD COLUMN is nullable', () => {
    const c = { name: 'extra', type: 'int', notNull: true };
    assert.equal(addColumnSql('mssql', 'issues', c), 'ALTER TABLE [issues] ADD [extra] INT');
    assert.equal(addColumnSql('postgres', 'issues', c), 'ALTER TABLE "issues" ADD COLUMN "extra" INTEGER');
  });
  test('catalog queries exist for every dialect', () => {
    for (const d of DIALECTS) { assert.ok(listTablesSql(d)); assert.ok(listColumnsSql(d).includes('?')); }
  });
  test('schema rules: indexed text columns fit MySQL index limits, every table has a primary key', () => {
    for (const t of TABLES) {
      assert.ok(t.pk.length, t.name);
      for (const cols of [...t.unique, ...t.indexes, t.pk]) {
        for (const name of cols) {
          const c = t.columns.find((x) => x.name === name);
          assert.ok(c, `${t.name}.${name}`);
          assert.ok(!['text', 'json', 'blob'].includes(c.type), `${t.name}.${name} is indexed`);
          if (c.type === 'string') assert.ok(c.size <= 191, `${t.name}.${name} size`);
        }
      }
    }
  });
  test('LIKE escaping', () => {
    assert.equal(likeEscape('50%_off [x]!'), '50!%!_off ![x!]!!');
  });
});

describe('connection URLs', () => {
  test('parse', () => {
    assert.deepEqual(parseDbUrl('mysql://u:p%40ss@db.local:3307/board'), { type: 'mysql', host: 'db.local', port: 3307, database: 'board', user: 'u', password: 'p@ss' });
    assert.equal(parseDbUrl('postgresql://a:b@h/x').type, 'postgres');
    assert.equal(parseDbUrl('sqlserver://a:b@h/x?encrypt=true').ssl, true);
    assert.deepEqual(parseDbUrl('sqlite:C:/data/x.sqlite3'), { type: 'sqlite', file: 'C:/data/x.sqlite3' });
  });
});

describe('rank keys', () => {
  test('between is strictly between and valid', () => {
    const pairs = [[null, null], ['a', null], [null, 'a'], ['a', 'b'], ['a', 'a1'], ['az', 'b'], ['1', '2'], ['z', null], [null, '01']];
    for (const [a, b] of pairs) {
      const k = rank.between(a, b);
      assert.ok(rank.isValid(k), `${a}..${b} → ${k}`);
      if (a) assert.ok(k > a, `${k} > ${a}`);
      if (b) assert.ok(k < b, `${k} < ${b}`);
    }
  });
  test('repeated inserts keep order; long keys trigger rebalance', () => {
    let lo = 'a'; const hi = 'b';
    const keys = [];
    for (let i = 0; i < 200; i++) { lo = rank.between(lo, hi); keys.push(lo); }
    assert.deepEqual([...keys].sort(), keys);
    let a = null; let b = 'a';
    for (let i = 0; i < 400; i++) b = rank.between(a, b);
    assert.ok(rank.needsRebalance(b) || b.length > 10);
  });
  test('initial keys are sorted, distinct and valid', () => {
    for (const n of [1, 2, 10, 1000, 5000]) {
      const k = rank.initial(n);
      assert.equal(k.length, n);
      assert.equal(new Set(k).size, n);
      assert.deepEqual([...k].sort(), k);
      assert.ok(k.every(rank.isValid));
    }
  });
  test('order rejects a >= b', () => {
    assert.throws(() => rank.between('b', 'a'));
  });
});

describe('ids', () => {
  test('20 chars, base36, ordered by time', () => {
    const ids = Array.from({ length: 2000 }, () => newId());
    assert.ok(ids.every((id) => /^[0-9a-z]{20}$/.test(id)));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual([...ids].sort(), ids);
    assert.match(newToken(), /^[A-Za-z0-9_-]{43}$/);
  });
});

describe('csv', () => {
  test('parse quotes, newlines, delimiters, BOM', () => {
    const text = '\uFEFFSummary;Labels;Desc\r\n"A; b";x y;"line1\nline2"\r\nC;;"say ""hi"""\n';
    assert.equal(detectDelimiter(text), ';');
    assert.deepEqual(parseCsv(text), [['Summary', 'Labels', 'Desc'], ['A; b', 'x y', 'line1\nline2'], ['C', '', 'say "hi"']]);
  });
  test('format round trip', () => {
    const rows = [['a', 'b,c', 'd"e'], ['1', '', 'x\ny']];
    assert.deepEqual(parseCsv(formatCsv(rows)), rows);
  });
});

describe('svg sanitiser', () => {
  test('removes scripts, handlers, external refs, foreignObject, doctype entities', () => {
    const dirty = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">
        <script>alert(2)</script><style>*{background:url(http://evil)}</style>
        <foreignObject><iframe src="javascript:alert(3)"></iframe></foreignObject>
        <a href="javascript:alert(4)"><rect width="1" height="1"/></a>
        <use href="http://evil/x.svg#a"/><use xlink:href="#ok"/>
        <image href="data:image/png;base64,AAAA"/><image href="https://evil/x.png"/>
        <path d="M0 0L10 10" fill="url(#g)" style="fill:red" onclick="x()"/>
        <circle cx="5" cy="5" r="2" style="fill:url(http://evil)"/>
      </svg>`;
    const out = sanitizeSvg(dirty);
    for (const bad of ['script', 'alert', 'onload', 'onclick', 'foreignObject', 'iframe', 'javascript', 'http://evil', 'ENTITY', 'passwd', '<style', 'https://evil']) {
      assert.ok(!out.includes(bad), `${bad} removed: ${out}`);
    }
    assert.match(out, /<path d="M0 0L10 10" fill="url\(#g\)" style="fill:red"\/>/);
    assert.match(out, /<use xlink:href="#ok"\/>/);
    assert.match(out, /<image href="data:image\/png;base64,AAAA"\/>/);
    assert.match(out, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 10 10">/);
    assert.match(out, /<\/svg>$/);
  });
  test('entity-encoded javascript in attributes is caught', () => {
    const out = sanitizeSvg('<svg><use href="jav&#x61;script:alert(1)"/><g fill="&#106;avascript:x"/></svg>');
    assert.ok(!/javascript|jav&#x61;/i.test(out), out);
  });
  test('not an svg', () => {
    assert.throws(() => sanitizeSvg('<html><body/></html>'), { code: 'INVALID_SVG' });
  });
  test('mime sniffing', () => {
    assert.equal(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
    assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    assert.equal(sniffMime(Buffer.from('GIF89a......')), 'image/gif');
    assert.equal(sniffMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
    assert.equal(sniffMime(Buffer.from('<svg xmlns="x"/>')), 'image/svg+xml');
    assert.equal(sniffMime(Buffer.from('hello')), null);
  });
});

describe('small helpers', () => {
  test('durations', () => {
    assert.equal(parseTimeSpent('1h 30m'), 5400);
    assert.equal(parseTimeSpent('1w 2d'), (5 + 2) * 8 * 3600);
    assert.equal(parseTimeSpent('90'), 90);
    assert.equal(parseTimeSpent(''), null);
    assert.throws(() => parseTimeSpent('soon'), { code: 'INVALID_DURATION' });
  });
  test('mentions', () => {
    assert.deepEqual(mentionsIn('hi @Kim and @lee.s, mail a@b.c'), ['kim', 'lee.s']);
  });
  test('camel/snake and row conversion', () => {
    assert.equal(camel('status_changed_at'), 'statusChangedAt');
    assert.equal(snake('statusChangedAt'), 'status_changed_at');
    const api = toApi('issues', { id: 'x', flagged: 1, cover: '{"color":"#fff"}', password_hash: 'no', story_points: 3 });
    assert.deepEqual(api, { id: 'x', flagged: true, cover: { color: '#fff' }, storyPoints: 3 });
    assert.deepEqual(fromApi('issues', { storyPoints: '5', flagged: true, nope: 1 }, ['story_points', 'flagged']), { story_points: 5, flagged: 1 });
    assert.throws(() => fromApi('issues', { storyPoints: 'x' }, ['story_points']), { code: 'INVALID_NUMBER' });
  });
  test('event bus patterns and idle()', async () => {
    const bus = new EventBus();
    const seen = [];
    bus.on('issue.*', (e) => seen.push('issue:' + e.type));
    bus.on('*', async (e) => { await new Promise((r) => setTimeout(r, 5)); seen.push('all:' + e.type); });
    bus.on('comment.created', () => seen.push('exact'));
    bus.emit({ type: 'issue.updated' });
    bus.emit({ type: 'comment.created' });
    await bus.idle();
    assert.deepEqual(seen.sort(), ['all:comment.created', 'all:issue.updated', 'exact', 'issue:issue.updated']);
  });
});
