// Query language: lexer, parser, validation, SQL generation, date math, autocomplete, and an integration
// run that executes compiled SQL on real SQLite and PostgreSQL (PGlite) and compares with the in-memory matcher.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { openDatabase } from '../../core/db/index.js';
import { migrate } from '../../core/db/migrate.js';
import { lex } from '../../core/jql/lexer.js';
import {
  parse, validate, compile, createMatcher, createComparator, suggestContext, JqlError, FIELDS, customValueColumns, quoteValue,
} from '../../core/jql/index.js';
import { parseDuration } from '../../core/jql/dates.js';

const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime(); // Wed 2026-11-11 12:00 local
const DAY = 86400000;
const errOf = (fn) => { try { fn(); } catch (e) { return e; } assert.fail('expected an error'); };

describe('jql lexer', () => {
  test('tokens with positions', () => {
    const t = lex('status != "In Progress" AND labels in (a,b)');
    assert.deepEqual(t.map((x) => [x.type, x.value, x.pos, x.end]), [
      ['word', 'status', 0, 6], ['op', '!=', 7, 9], ['string', 'In Progress', 10, 23], ['word', 'AND', 24, 27],
      ['word', 'labels', 28, 34], ['word', 'in', 35, 37], ['lparen', '(', 38, 39], ['word', 'a', 39, 40],
      ['comma', ',', 40, 41], ['word', 'b', 41, 42], ['rparen', ')', 42, 43], ['eof', '', 43, 43],
    ]);
  });
  test('operators, escapes, keys, relative dates, cf[]', () => {
    const t = lex(`a>=1 b<=2 c<3 d>4 e~x f!~y 'it\\'s' "q\\"t" KAN-12 -7d cf[10001]`);
    const vals = t.filter((x) => x.type !== 'eof').map((x) => x.value);
    assert.deepEqual(vals, ['a', '>=', '1', 'b', '<=', '2', 'c', '<', '3', 'd', '>', '4', 'e', '~', 'x', 'f', '!~', 'y', "it's", 'q"t', 'KAN-12', '-7d', 'cf[10001]']);
  });
  test('errors: unterminated string and lone !', () => {
    const e = errOf(() => lex('summary ~ "abc'));
    assert.equal(e.code, 'JQL_SYNTAX');
    assert.deepEqual(e.details, { position: 10, length: 4 });
    const e2 = errOf(() => lex('a ! b'));
    assert.equal(e2.details.position, 2);
  });
  test('tolerant mode never throws', () => {
    const t = lex('a ! "b', { tolerant: true });
    assert.equal(t[1].value, '!');
    assert.equal(t[2].unterminated, true);
  });
  test('quoteValue', () => {
    assert.equal(quoteValue('Done'), 'Done');
    assert.equal(quoteValue('In Progress'), '"In Progress"');
    assert.equal(quoteValue('and'), '"and"');
    assert.equal(quoteValue('a"b'), '"a\\"b"');
  });
});

describe('jql parser', () => {
  test('blank → null', () => { assert.equal(parse(''), null); assert.equal(parse('   '), null); });
  test('precedence: AND binds tighter than OR, NOT, parentheses', () => {
    const a = parse('a = 1 OR b = 2 AND NOT c = 3');
    assert.equal(a.where.type, 'or');
    assert.equal(a.where.items[1].type, 'and');
    assert.equal(a.where.items[1].items[1].type, 'not');
    const b = parse('(a = 1 OR b = 2) AND c = 3');
    assert.equal(b.where.type, 'and');
    assert.equal(b.where.items[0].type, 'or');
  });
  test('operators normalised', () => {
    const ops = (q) => parse(q).where.op;
    assert.equal(ops('a in (1, 2)'), 'in');
    assert.equal(ops('a NOT IN (1)'), 'not in');
    assert.equal(ops('a is empty'), 'is empty');
    assert.equal(ops('a IS NOT NULL'), 'is not empty');
    assert.equal(ops('a = EMPTY'), 'is empty');
    assert.equal(ops('a != empty'), 'is not empty');
    assert.equal(ops('a = (x, y)'), 'in');
  });
  test('functions, lists and ORDER BY', () => {
    const a = parse('assignee in (currentUser(), bob) AND created > startOfWeek("-1") ORDER BY priority DESC, key');
    const [c1, c2] = a.where.items;
    assert.equal(c1.values[0].kind, 'func');
    assert.equal(c1.values[0].name, 'currentUser');
    assert.deepEqual(c2.values[0].args, ['-1']);
    assert.deepEqual(a.orderBy.map((o) => [o.field.name, o.dir]), [['priority', 'desc'], ['key', 'asc']]);
    assert.equal(parse('ORDER BY rank').where, null);
  });
  test('syntax errors with positions and expectations', () => {
    const cases = [
      ['status =', 8, 'a value'],
      ['status = Done AND', 17, 'a field name'],
      ['status in (a', 12, ','],
      ['status in ()', 11, 'a value'],
      ['(status = a', 11, ')'],
      ['status = a b', 11, 'AND'],
      ['status Done', 7, '='],
      ['status is foo', 10, 'EMPTY'],
      ['status = a ORDER created', 17, 'BY'],
      ['status = a)', 10, null],
      ['status not done', 11, 'IN'],
    ];
    for (const [q, pos, exp] of cases) {
      const e = errOf(() => parse(q));
      assert.ok(e instanceof JqlError, q);
      assert.equal(e.code, 'JQL_SYNTAX', q);
      assert.equal(e.details.position, pos, q);
      if (exp) assert.ok(e.details.expected.includes(exp), `${q}: ${e.details.expected}`);
    }
  });
  test('WAS is rejected clearly', () => {
    const e = errOf(() => parse('status WAS Done'));
    assert.equal(e.code, 'JQL_BAD_OPERATOR');
    assert.equal(e.details.position, 7);
  });
});

const CF = [
  { id: 'cfsize', name: 'Story Size', type: 'number' },
  { id: 'cfteam', name: 'Team', type: 'multiselect', options: [{ id: 'opt-red', value: 'Red' }, { id: 'opt-blue', value: 'Blue' }] },
  { id: 'cfrev', name: 'Reviewed', type: 'checkbox' },
  { id: 'cfowner', name: 'Owner', type: 'user' },
  { id: 'cfgo', name: 'Go Live', type: 'date' },
  { id: 'cfnote', name: 'Note', type: 'text' },
  { id: 'cftier', name: 'Tier', type: 'select', options: [{ id: 'opt-gold', value: 'Gold' }, { id: 'opt-silver', value: 'Silver' }] },
];

describe('jql validate', () => {
  const v = (q, opts = {}) => validate(q, { fields: CF, now: NOW, ...opts });
  test('ok', () => {
    for (const q of ['', 'project = KAN', '"Story Size" > 3', 'cf[cfsize] = 2', 'Team in (Red, opt-blue)', 'flagged = yes', 'due < endOfMonth(+1)', 'text ~ "foo*"', 'ORDER BY priority DESC']) {
      assert.deepEqual(v(q), { ok: true }, q);
    }
  });
  test('errors carry code and position', () => {
    const cases = [
      ['foo = 1', 'JQL_UNKNOWN_FIELD', 0, 3],
      ['status = a AND "No Such" = 1', 'JQL_UNKNOWN_FIELD', 15, 9],
      ['cf[nope] = 1', 'JQL_UNKNOWN_FIELD', 0, 8],
      ['summary > 3', 'JQL_BAD_OPERATOR', 8, 1],
      ['status ~ a', 'JQL_BAD_OPERATOR', 7, 1],
      ['text = a', 'JQL_BAD_OPERATOR', 5, 1],
      ['rank = 1', 'JQL_BAD_OPERATOR', 0, 4],
      ['created > tomorrow', 'JQL_BAD_VALUE', 10, 8],
      ['storyPoints > many', 'JQL_BAD_VALUE', 14, 4],
      ['flagged = maybe', 'JQL_BAD_VALUE', 10, 5],
      ['key > abc', 'JQL_BAD_VALUE', 6, 3],
      ['status = now()', 'JQL_BAD_VALUE', 9, 5],
      ['created > membersOf(x)', 'JQL_UNKNOWN_FUNCTION', 10, 12],
      ['created > startOfDay(x)', 'JQL_BAD_VALUE', 10, 13],
      ['status = a ORDER BY description', 'JQL_BAD_OPERATOR', 20, 11],
      ['status = a ORDER BY nope', 'JQL_UNKNOWN_FIELD', 20, 4],
      ['"Reviewed" > 1', 'JQL_BAD_OPERATOR', 11, 1],
    ];
    for (const [q, code, pos, len] of cases) {
      const r = v(q);
      assert.equal(r.ok, false, q);
      assert.equal(r.error.code, code, q);
      assert.equal(r.error.details.position, pos, q);
      assert.equal(r.error.details.length, len, q);
      assert.equal(typeof r.error.message, 'string');
    }
  });
  test('field catalogue', () => {
    assert.ok(FIELDS.find((f) => f.name === 'statusCategory'));
    for (const f of FIELDS) assert.ok(Array.isArray(f.ops) && f.detail, f.name);
  });
});

describe('jql compile', () => {
  const c = (q, opts = {}) => compile(q, { fields: CF, now: NOW, userId: 'uid-alice', ...opts });
  test('empty query', () => { assert.deepEqual(c(''), { where: '1 = 1', params: [], orderBy: '' }); });
  test('lookup by id or lower-cased name, nullable guard', () => {
    const r = c('status = "In Progress"');
    assert.equal(r.where, 'i."status_id" IN (SELECT "id" FROM "statuses" WHERE "id" IN (?) OR LOWER("name") IN (?))');
    assert.deepEqual(r.params, ['in progress', 'in progress']);
    const a = c('assignee != Bob');
    assert.match(a.where, /^\(i\."assignee_id" IS NOT NULL AND i\."assignee_id" NOT IN \(SELECT "id" FROM "users" WHERE/);
    assert.deepEqual(a.params, ['bob', 'bob', 'bob']);
  });
  test('alias option', () => {
    assert.match(c('flagged = true', { alias: 'x' }).where, /^x\."flagged" = 1$/);
  });
  test('currentUser() → user id; without a user matches nothing', () => {
    assert.deepEqual(c('assignee = currentUser()').params, ['uid-alice', 'uid-alice', 'uid-alice']);
    assert.equal(c('assignee = currentUser()', { userId: null }).where, '1 = 0');
    assert.equal(c('assignee in (currentUser(), EMPTY)', { userId: null }).where, 'i."assignee_id" IS NULL');
  });
  test('multi-valued EXISTS / NOT EXISTS', () => {
    assert.equal(c('labels = UI').where, 'EXISTS (SELECT 1 FROM "issue_labels" jl1 WHERE jl1."issue_id" = i."id" AND LOWER(jl1."label") IN (?))');
    assert.match(c('labels != ui').where, /^NOT EXISTS/);
    assert.match(c('labels is empty').where, /^NOT EXISTS .* AND 1 = 1\)$/);
    assert.match(c('fixVersion = 1.0').where, /"kind" = 'fix'/);
    assert.match(c('affectedVersion = 1.0').where, /"kind" = 'affects'/);
  });
  test('LIKE escaping', () => {
    const r = c('summary ~ "50%_off!"');
    assert.match(r.where, /LIKE \? ESCAPE '!'/);
    assert.deepEqual(r.params, ['%50!%!_off!!%']);
    assert.deepEqual(c('text ~ "*Abc*"').params, ['%abc%', '%abc%', '%abc%']);
  });
  test('priority comparison by position', () => {
    const r = c('priority > Medium');
    assert.match(r.where, /"position" < \(SELECT MIN\("position"\) FROM "priorities"/);
    assert.match(c('priority <= Low').where, /"position" >= \(SELECT MIN/);
  });
  test('date values', () => {
    const r = c('created = "2026-11-11"');
    assert.equal(r.where, '(i."created_at" >= ? AND i."created_at" < ?)');
    assert.deepEqual(r.params, [new Date(2026, 10, 11).getTime(), new Date(2026, 10, 12).getTime()]);
    assert.deepEqual(c('created <= 2026-11-11').params, [new Date(2026, 10, 12).getTime()]);
    assert.deepEqual(c('created > 2026-11-11').params, [new Date(2026, 10, 12).getTime()]);
    assert.deepEqual(c('created < 2026-11-11').params, [new Date(2026, 10, 11).getTime()]);
    assert.deepEqual(c('created >= "2026-11-11 14:30"').params, [new Date(2026, 10, 11, 14, 30).getTime()]);
    assert.deepEqual(c('updated > -7d').params, [NOW - 7 * DAY]);
    assert.deepEqual(c('updated > "-1w 2d"').params, [NOW - 9 * DAY]);
    assert.deepEqual(c('updated > -2h').params, [NOW - 2 * 3600000]);
    assert.deepEqual(c('due <= "2026/11/3"').params, ['2026-11-03']);
    assert.deepEqual(c('due < now()').params, ['2026-11-11']);
    assert.equal(c('resolved != 2026-11-11').where, '((i."resolved_at" IS NOT NULL AND i."resolved_at" < ?) OR (i."resolved_at" IS NOT NULL AND i."resolved_at" >= ?))');
  });
  test('date functions with a fixed now (weeks start Monday)', () => {
    const p = (fn) => c(`created >= ${fn}`).params[0];
    assert.equal(p('now()'), NOW);
    assert.equal(p('startOfDay()'), new Date(2026, 10, 11).getTime());
    assert.equal(p('endOfDay()'), new Date(2026, 10, 12).getTime() - 1);
    assert.equal(p('startOfDay(-1)'), new Date(2026, 10, 10).getTime());
    assert.equal(p('startOfWeek()'), new Date(2026, 10, 9).getTime());
    assert.equal(p('endOfWeek()'), new Date(2026, 10, 16).getTime() - 1);
    assert.equal(p('startOfWeek(-1)'), new Date(2026, 10, 2).getTime());
    assert.equal(p('startOfMonth()'), new Date(2026, 10, 1).getTime());
    assert.equal(p('startOfMonth(-1)'), new Date(2026, 9, 1).getTime());
    assert.equal(p('endOfMonth()'), new Date(2026, 11, 1).getTime() - 1);
    assert.equal(p('endOfMonth("+1")'), new Date(2027, 0, 1).getTime() - 1);
    assert.equal(p('startOfYear()'), new Date(2026, 0, 1).getTime());
    assert.equal(p('endOfYear(-1)'), new Date(2026, 0, 1).getTime() - 1);
    assert.equal(p('startOfDay("-1w")'), new Date(2026, 10, 4).getTime());
    assert.equal(parseDuration('-1w 2d'), -9 * DAY);
    assert.equal(parseDuration('+3h'), 3 * 3600000);
    assert.equal(parseDuration('30m'), 30 * 60000);
    assert.equal(parseDuration('abc'), null);
  });
  test('key and key ranges', () => {
    const r = c('key in (kan-1, KAN-2)');
    assert.deepEqual(r.params, ['KAN-1', 'KAN-2', 'kan-1', 'kan-2']);
    const g = c('key >= KAN-10');
    assert.equal(g.where, '(i."project_id" IN (SELECT "id" FROM "projects" WHERE "key" = ?) AND i."number" >= ?)');
    assert.deepEqual(g.params, ['KAN', 10]);
  });
  test('custom fields', () => {
    const n = c('"Story Size" >= 3');
    assert.match(n.where, /cv1\."field_id" = \? AND cv1\."num_value" IS NOT NULL AND cv1\."num_value" >= \?/);
    assert.deepEqual(n.params, ['cfsize', 3]);
    const t = c('Team = opt-red');
    assert.deepEqual(t.params, ['cfteam', '%|red|%']);
    assert.match(c('Team != Red').where, /^NOT EXISTS/);
    assert.match(c('Reviewed = false').where, /^NOT EXISTS .*"num_value" = \?/);
    assert.deepEqual(c('Tier = opt-gold').params, ['cftier', 'gold']);
    assert.match(c('Owner = currentUser()').where, /"users"/);
    assert.deepEqual(c('cf[cfgo] > 2026-11-01').params, ['cfgo', '2026-11-01']);
  });
  test('ORDER BY: NULLs last everywhere, id tiebreak, priority inverted, no duplicates', () => {
    const r = c('ORDER BY priority DESC, created, created');
    assert.equal(r.where, '1 = 1');
    const pos = '(SELECT "position" FROM "priorities" WHERE "priorities"."id" = i."priority_id")';
    assert.equal(r.orderBy, `CASE WHEN ${pos} IS NULL THEN 1 ELSE 0 END, ${pos}, CASE WHEN i."created_at" IS NULL THEN 1 ELSE 0 END, i."created_at", i."id"`);
    assert.match(c('ORDER BY rank DESC').orderBy, /i\."rank" DESC, i\."id"$/);
    assert.match(c('ORDER BY key').orderBy, /"projects".*i\."number"/);
  });
  test('placeholders count equals params length', () => {
    for (const q of ['project in (A, B) AND status != x OR labels in (a, b, c)', '"Owner" in (bob, carol) AND Team != Red', 'text !~ abc AND key not in (A-1)']) {
      const r = c(q);
      assert.equal((r.where.match(/\?/g) || []).length, r.params.length, q);
    }
  });
  test('customValueColumns', () => {
    assert.deepEqual(customValueColumns({ type: 'number' }, '5'), { text_value: null, num_value: 5 });
    assert.deepEqual(customValueColumns({ type: 'checkbox' }, true), { text_value: null, num_value: 1 });
    assert.deepEqual(customValueColumns({ type: 'checkbox' }, false), { text_value: null, num_value: 0 });
    assert.deepEqual(customValueColumns({ type: 'multiselect' }, ['Red', 'Blue']), { text_value: '|red|blue|', num_value: null });
    assert.deepEqual(customValueColumns({ type: 'multiselect' }, []), { text_value: null, num_value: null });
    assert.deepEqual(customValueColumns({ type: 'text' }, 'Hello'), { text_value: 'hello', num_value: null });
    assert.deepEqual(customValueColumns({ type: 'text' }, ''), { text_value: null, num_value: null });
    assert.equal(customValueColumns({ type: 'text' }, 'x'.repeat(300)).text_value.length, 191);
  });
});

describe('jql suggest', () => {
  const s = (text, caret = text.length) => suggestContext(text, caret, { fields: CF });
  const labels = (r) => r.items.map((i) => i.label);
  test('fields at the start and after AND / ( / NOT', () => {
    const r = s('');
    assert.equal(r.kind, 'field');
    assert.ok(labels(r).includes('project') && labels(r).includes('Story Size') && labels(r).includes('ORDER BY'));
    assert.equal(r.items.find((i) => i.label === 'Story Size').insert, '"Story Size"');
    assert.equal(s('status = a AND ').kind, 'field');
    assert.equal(s('(').kind, 'field');
    assert.equal(s('NOT ').kind, 'field');
    assert.ok(!labels(s('(')).includes('ORDER BY'));
  });
  test('field prefix and replacement range', () => {
    const r = s('sta');
    assert.deepEqual(labels(r), ['status', 'statusCategory']);
    assert.deepEqual([r.start, r.end, r.prefix], [0, 3, 'sta']);
    const mid = s('status = a AND assig = b', 18);
    assert.equal(mid.kind, 'field');
    assert.deepEqual([mid.start, mid.end, mid.prefix], [15, 20, 'ass']);
    assert.deepEqual(labels(mid), ['assignee']);
    assert.deepEqual(labels(s('issuety')), ['type'], 'aliases match');
    assert.deepEqual(labels(s('"Sto')), ['storyPoints', 'Story Size']);
  });
  test('operators per field', () => {
    assert.equal(s('status ').kind, 'operator');
    assert.deepEqual(labels(s('status ')), ['=', '!=', 'IN', 'NOT IN']);
    assert.ok(labels(s('labels ')).includes('~'));
    assert.ok(labels(s('due ')).includes('IS EMPTY'));
    assert.deepEqual(labels(s('status i')), ['IN']);
    assert.deepEqual(labels(s('labels !')), ['!=', '!~']);
    assert.ok(labels(s('"Story Size" ')).includes('>='));
  });
  test('values with functions', () => {
    const v = s('assignee = ');
    assert.equal(v.kind, 'value');
    assert.equal(v.field, 'assignee');
    assert.deepEqual(labels(v), ['EMPTY', 'currentUser()']);
    assert.deepEqual(labels(s('assignee = cu')), ['currentUser()']);
    assert.ok(labels(s('created > ')).includes('startOfWeek()'));
    assert.deepEqual(labels(s('flagged = ')), ['true', 'false']);
    assert.deepEqual(labels(s('statusCategory = ')), ['To Do', 'In Progress', 'Done']);
    const st = s('status = "In Pr');
    assert.equal(st.kind, 'value');
    assert.equal(st.prefix, 'In Pr');
    assert.equal(st.start, 9);
    assert.equal(s('status in (a, ').kind, 'value');
    assert.equal(s('status in (').kind, 'value');
    assert.equal(s('Tier = ').field, 'Tier');
  });
  test('keywords and ORDER BY', () => {
    assert.deepEqual(labels(s('status = Done ')), ['AND', 'OR', 'ORDER BY']);
    assert.deepEqual(labels(s('(status = Done ')), ['AND', 'OR', ')']);
    assert.deepEqual(labels(s('status = Done o')), ['OR', 'ORDER BY']);
    assert.deepEqual(labels(s('status in ')), ['(']);
    assert.deepEqual(labels(s('status in (a ')), [',', ')']);
    assert.deepEqual(labels(s('status is ')), ['EMPTY', 'NOT EMPTY']);
    assert.deepEqual(labels(s('status not ')), ['IN']);
    assert.deepEqual(labels(s('assignee = currentUser() ')), ['AND', 'OR', 'ORDER BY']);
    assert.deepEqual(labels(s('status = a ORDER ')), ['BY']);
    assert.equal(s('status = a ORDER BY ').kind, 'orderField');
    assert.deepEqual(labels(s('ORDER BY cr')), ['created']);
    assert.deepEqual(labels(s('ORDER BY created ')), ['ASC', 'DESC', ',']);
    assert.equal(s('ORDER BY created DESC, ').kind, 'orderField');
    assert.equal(s('status = = =').kind, 'none');
  });
});

// ---- integration: real SQL vs in-memory matcher ------------------------------------------------------------

const USERS = [
  { id: 'u-alice', username: 'alice', displayName: 'Alice Kim' },
  { id: 'u-bob', username: 'bob', displayName: 'Bob Lee' },
  { id: 'u-carol', username: 'carol', displayName: 'Carol Park' },
];
const PROJECTS = [{ id: 'p-kan', key: 'KAN', name: 'Kanban Team' }, { id: 'p-bug', key: 'BUG', name: 'Bug Tracker' }];
const STATUSES = [
  ['s-kb', 'p-kan', 'Backlog', 'todo', 0], ['s-kp', 'p-kan', 'In Progress', 'inprogress', 1], ['s-kd', 'p-kan', 'Done', 'done', 2],
  ['s-bo', 'p-bug', 'Open', 'todo', 0], ['s-bf', 'p-bug', 'Fixing', 'inprogress', 1], ['s-bc', 'p-bug', 'Closed', 'done', 2],
].map(([id, project_id, name, category, position]) => ({ id, project_id, name, category, position }));
const TYPES = [
  ['t-ks', 'p-kan', 'Story', 0], ['t-kb', 'p-kan', 'Bug', 1], ['t-ke', 'p-kan', 'Epic', 2], ['t-bb', 'p-bug', 'Bug', 0],
].map(([id, project_id, name, position]) => ({ id, project_id, name, position }));
const COMPONENTS = [{ id: 'c-ui', project_id: 'p-kan', name: 'UI' }, { id: 'c-api', project_id: 'p-kan', name: 'API' }];
const VERSIONS = [{ id: 'v-1', project_id: 'p-kan', name: '1.0' }, { id: 'v-2', project_id: 'p-kan', name: '2.0' }];

// key, type, status, priority, assignee, reporter, created(days ago), updated, resolved, resolution, extra
const ISSUES = [
  ['KAN-1', 'Epic', 'In Progress', 'High', 'alice', 'bob', 30, 1, null, null, { summary: 'Login epic', description: 'All login work', labels: ['auth'] }],
  ['KAN-2', 'Story', 'Done', 'Medium', 'alice', 'bob', 20, 3, 3, 'Done', { summary: 'Login page UI', labels: ['auth', 'ui'], components: ['UI'], fix: ['1.0'], epic: 'KAN-1', sp: 3,
    custom: { cfsize: 5, cfteam: ['Red'], cfrev: true, cfowner: 'u-alice', cfgo: '2026-11-01', cftier: 'Gold', cfnote: 'Ship it' } }],
  ['KAN-3', 'Story', 'In Progress', 'High', 'bob', 'alice', 15, 0.5, null, null, { summary: 'Login API', labels: ['auth', 'api'], components: ['API'], fix: ['1.0'], epic: 'KAN-1', sp: 5, flagged: true,
    custom: { cfsize: 8, cfteam: ['Red', 'Blue'], cfowner: 'u-bob', cftier: 'Silver' } }],
  ['KAN-4', 'Bug', 'Backlog', 'Highest', null, 'carol', 2, 2, null, null, { summary: 'Crash on logout', components: ['API'], aff: ['1.0'], due: '2026-11-10' }],
  ['KAN-5', 'Story', 'Backlog', 'Low', 'carol', 'alice', 10, 10, null, null, { summary: 'Profile settings', labels: ['ui'], fix: ['2.0'], sp: 2, due: '2026-11-20',
    custom: { cfsize: 2, cfrev: false, cfnote: 'Needs design' } }],
  ['KAN-6', 'Story', 'Backlog', 'Lowest', null, 'bob', 40, 5, null, null, { summary: 'Dark mode', description: 'Theme support for dark UI', labels: ['ui', 'theme'], fix: ['2.0'], sp: 8, custom: { cfteam: ['Blue'] } }],
  ['KAN-7', 'Story', 'In Progress', 'Medium', 'bob', 'bob', 5, 1, null, null, { summary: 'Write API tests', parent: 'KAN-3', sp: 1 }],
  ['KAN-8', 'Bug', 'Done', 'Low', 'carol', 'carol', 25, 20, 20, 'Done', { summary: 'Typo in footer', labels: ['ui'], components: ['UI'], fix: ['1.0'], due: '2026-10-30' }],
  ['KAN-9', 'Story', 'In Progress', null, 'alice', 'carol', 8, 2, null, null, { summary: 'Search box', labels: ['search'], sp: 3, components: ['UI', 'API'], custom: { cfgo: '2026-12-01' } }],
  ['KAN-10', 'Epic', 'Backlog', 'Medium', null, 'alice', 3, 3, null, null, { summary: 'Payments', description: 'Billing 100% safe' }],
  ['BUG-1', 'Bug', 'Open', 'High', 'bob', 'carol', 1, 1, null, null, { summary: 'Printer jam', labels: ['hardware'] }],
  ['BUG-2', 'Bug', 'Fixing', 'Highest', 'alice', 'bob', 6, 1, null, null, { summary: 'Login fails on Safari', labels: ['auth', 'browser'], sp: 2, flagged: true, custom: { cfowner: 'u-carol' } }],
  ['BUG-3', 'Bug', 'Closed', 'Medium', 'carol', 'alice', 50, 45, 45, "Won't Do", { summary: 'Slow report', labels: ['perf'], due: '2026-11-11' }],
  ['BUG-4', 'Bug', 'Open', 'Low', null, null, 0.1, 0, null, null, { summary: 'Wrong total_amount', description: 'Shows 50% of the value' }],
  ['BUG-5', 'Bug', 'Fixing', 'Highest', 'bob', 'alice', 12, 6, null, null, { summary: 'Data loss', labels: ['critical'], sp: 13, due: '2026-11-12', custom: { cfsize: 13 } }],
];

/** Insert the dataset; returns hydrated issues (matcher shape). */
async function seed(db) {
  await migrate(db);
  const priorities = await db.select('priorities', {}, { order: 'position' });
  const resolutions = await db.select('resolutions');
  for (const u of USERS) await db.insert('users', { id: u.id, username: u.username, display_name: u.displayName });
  for (const p of PROJECTS) await db.insert('projects', p);
  for (const s of STATUSES) await db.insert('statuses', s);
  for (const t of TYPES) await db.insert('issue_types', t);
  for (const c of COMPONENTS) await db.insert('components', c);
  for (const v of VERSIONS) await db.insert('versions', v);
  for (const f of CF) await db.insert('custom_fields', { id: f.id, name: f.name, type: f.type, options: f.options || null });
  const byKey = {};
  const hydrated = [];
  let n = 0;
  for (const [key, type, status, prio, assignee, reporter, cAgo, uAgo, rAgo, resName, x] of ISSUES) {
    n++;
    const project = PROJECTS.find((p) => key.startsWith(p.key + '-'));
    const st = STATUSES.find((s) => s.project_id === project.id && s.name === status);
    const ty = TYPES.find((t) => t.project_id === project.id && t.name === type);
    const pr = prio ? priorities.find((p) => p.name === prio) : null;
    const res = resName ? resolutions.find((r) => r.name === resName) : null;
    const user = (name) => (name ? USERS.find((u) => u.username === name) : null);
    const id = 'i' + String(n).padStart(2, '0');
    const row = {
      id, project_id: project.id, number: Number(key.split('-')[1]), key, type_id: ty.id, status_id: st.id, priority_id: pr?.id ?? null,
      resolution_id: res?.id ?? null, summary: x.summary, description: x.description ?? null, assignee_id: user(assignee)?.id ?? null,
      reporter_id: user(reporter)?.id ?? null, parent_id: x.parent ? byKey[x.parent].id : null, epic_id: x.epic ? byKey[x.epic].id : null,
      story_points: x.sp ?? null, due_date: x.due ?? null, rank: 'r' + String(100 - n).padStart(3, '0'), flagged: x.flagged ? 1 : 0,
      created_at: Math.round(NOW - cAgo * DAY), updated_at: Math.round(NOW - uAgo * DAY), resolved_at: rAgo == null ? null : Math.round(NOW - rAgo * DAY),
    };
    await db.insert('issues', row);
    for (const l of x.labels || []) await db.insert('issue_labels', { issue_id: id, label: l });
    for (const c of x.components || []) await db.insert('issue_components', { issue_id: id, component_id: COMPONENTS.find((k) => k.name === c).id });
    for (const v of x.fix || []) await db.insert('issue_versions', { issue_id: id, version_id: VERSIONS.find((k) => k.name === v).id, kind: 'fix' });
    for (const v of x.aff || []) await db.insert('issue_versions', { issue_id: id, version_id: VERSIONS.find((k) => k.name === v).id, kind: 'affects' });
    for (const [fid, raw] of Object.entries(x.custom || {})) {
      const cf = CF.find((f) => f.id === fid);
      await db.insert('custom_values', { issue_id: id, field_id: fid, value: JSON.stringify(raw), ...customValueColumns(cf, raw) });
    }
    const h = {
      id, key, number: row.number, projectId: project.id, project, type: { id: ty.id, name: ty.name, position: ty.position },
      status: { id: st.id, name: st.name, category: st.category, position: st.position },
      priority: pr ? { id: pr.id, name: pr.name, position: pr.position } : null, resolution: res ? { id: res.id, name: res.name } : null,
      assignee: user(assignee), reporter: user(reporter), labels: x.labels || [],
      components: (x.components || []).map((c) => COMPONENTS.find((k) => k.name === c)),
      fixVersions: (x.fix || []).map((v) => VERSIONS.find((k) => k.name === v)),
      affectedVersions: (x.aff || []).map((v) => VERSIONS.find((k) => k.name === v)),
      created: row.created_at, updated: row.updated_at, resolved: row.resolved_at, due: row.due_date, summary: row.summary,
      description: row.description, epic: x.epic ? { id: byKey[x.epic].id, key: x.epic } : null, parent: x.parent ? { id: byKey[x.parent].id, key: x.parent } : null,
      flagged: !!x.flagged, storyPoints: row.story_points, rank: row.rank, custom: x.custom || {},
    };
    byKey[key] = h;
    hydrated.push(h);
  }
  return { hydrated, priorities };
}

const K = (s) => s.split(/\s+/).filter(Boolean);
const ALL = ISSUES.map((i) => i[0]);
const except = (...keys) => ALL.filter((k) => !keys.includes(k));

/** [query, expected keys (any order)] */
const CASES = [
  ['project = KAN', K('KAN-1 KAN-2 KAN-3 KAN-4 KAN-5 KAN-6 KAN-7 KAN-8 KAN-9 KAN-10')],
  ['project = "bug tracker"', K('BUG-1 BUG-2 BUG-3 BUG-4 BUG-5')],
  ['project in (KAN, BUG) AND type = Epic', K('KAN-1 KAN-10')],
  ['status = "In Progress"', K('KAN-1 KAN-3 KAN-7 KAN-9')],
  ['statusCategory = Done', K('KAN-2 KAN-8 BUG-3')],
  ['statusCategory != "To Do"', K('KAN-1 KAN-2 KAN-3 KAN-7 KAN-8 KAN-9 BUG-2 BUG-3 BUG-5')],
  ['priority > Medium', K('KAN-1 KAN-3 KAN-4 BUG-1 BUG-2 BUG-5')],
  ['priority <= Low', K('KAN-5 KAN-6 KAN-8 BUG-4')],
  ['priority is EMPTY', K('KAN-9')],
  ['priority != High', K('KAN-2 KAN-4 KAN-5 KAN-6 KAN-7 KAN-8 KAN-10 BUG-2 BUG-3 BUG-4 BUG-5')],
  ['assignee = currentUser()', K('KAN-1 KAN-2 KAN-9 BUG-2')],
  ['assignee is EMPTY', K('KAN-4 KAN-6 KAN-10 BUG-4')],
  ['assignee in ("Bob Lee", carol)', K('KAN-3 KAN-7 BUG-1 BUG-5 KAN-5 KAN-8 BUG-3')],
  ['assignee != alice', K('KAN-3 KAN-5 KAN-7 KAN-8 BUG-1 BUG-3 BUG-5')],
  ['assignee in (alice, EMPTY) AND project = BUG', K('BUG-2 BUG-4')],
  ['reporter = bob AND assignee = alice', K('KAN-1 KAN-2 BUG-2')],
  ['labels = auth', K('KAN-1 KAN-2 KAN-3 BUG-2')],
  ['labels in (UI, perf)', K('KAN-2 KAN-5 KAN-6 KAN-8 BUG-3')],
  ['labels != ui', except('KAN-2', 'KAN-5', 'KAN-6', 'KAN-8')],
  ['labels is EMPTY', K('KAN-4 KAN-7 KAN-10 BUG-4')],
  ['labels ~ au', K('KAN-1 KAN-2 KAN-3 BUG-2')],
  ['component = UI', K('KAN-2 KAN-8 KAN-9')],
  ['component is not EMPTY', K('KAN-2 KAN-3 KAN-4 KAN-8 KAN-9')],
  ['fixVersion = "1.0"', K('KAN-2 KAN-3 KAN-8')],
  ['affectedVersion = 1.0', K('KAN-4')],
  ['fixVersion != 2.0 AND project = KAN', K('KAN-1 KAN-2 KAN-3 KAN-4 KAN-7 KAN-8 KAN-9 KAN-10')],
  ['resolution is EMPTY', except('KAN-2', 'KAN-8', 'BUG-3')],
  ['resolution = "Won\'t Do"', K('BUG-3')],
  ['created >= -7d', K('KAN-4 KAN-7 KAN-10 BUG-1 BUG-2 BUG-4')],
  ['created < startOfDay(-30)', K('KAN-6 BUG-3')],
  ['created = "2026-11-11"', K('BUG-4')],
  ['created != 2026-11-11 AND created > -2d', K('BUG-1')],
  ['updated > startOfWeek()', K('KAN-1 KAN-3 KAN-4 KAN-7 KAN-9 BUG-1 BUG-2 BUG-4')],
  ['resolved >= -21d', K('KAN-2 KAN-8')],
  ['due < now()', K('KAN-4 KAN-8')],
  ['due <= endOfWeek()', K('KAN-4 KAN-8 BUG-3 BUG-5')],
  ['due is EMPTY AND project = BUG', K('BUG-1 BUG-2 BUG-4')],
  ['summary ~ login', K('KAN-1 KAN-2 KAN-3 BUG-2')],
  ['summary !~ login AND project = BUG', K('BUG-1 BUG-3 BUG-4 BUG-5')],
  ['summary = "printer JAM"', K('BUG-1')],
  ['text ~ "dark"', K('KAN-6')],
  ['text ~ "kan-1"', K('KAN-1 KAN-10')],
  ['description ~ "100%"', K('KAN-10')],
  ['summary ~ "total_"', K('BUG-4')],
  ['description is EMPTY', except('KAN-1', 'KAN-6', 'KAN-10', 'BUG-4')],
  ['description !~ dark', K('KAN-1 KAN-10 BUG-4')],
  ['epic = KAN-1', K('KAN-2 KAN-3')],
  ['epic != KAN-1', []],
  ['parent = KAN-3', K('KAN-7')],
  ['parent is EMPTY AND epic is EMPTY AND project = KAN', K('KAN-1 KAN-4 KAN-5 KAN-6 KAN-8 KAN-9 KAN-10')],
  ['flagged = true', K('KAN-3 BUG-2')],
  ['NOT flagged = true AND project = BUG', K('BUG-1 BUG-3 BUG-4 BUG-5')],
  ['storyPoints >= 5', K('KAN-3 KAN-6 BUG-5')],
  ['storyPoints in (1, 2)', K('KAN-5 KAN-7 BUG-2')],
  ['storyPoints != 3 AND project = KAN', K('KAN-3 KAN-5 KAN-6 KAN-7')],
  ['storyPoints is EMPTY AND project = KAN', K('KAN-1 KAN-4 KAN-8 KAN-10')],
  ['key in (KAN-1, bug-2)', K('KAN-1 BUG-2')],
  ['key > KAN-7', K('KAN-8 KAN-9 KAN-10')],
  ['key not in (KAN-1) AND key <= KAN-3', K('KAN-2 KAN-3')],
  ['"Story Size" > 4', K('KAN-2 KAN-3 BUG-5')],
  ['"Story Size" != 5', K('KAN-3 KAN-5 BUG-5')],
  ['"Story Size" is EMPTY AND project = BUG', K('BUG-1 BUG-2 BUG-3 BUG-4')],
  ['Team = Red', K('KAN-2 KAN-3')],
  ['Team != Blue', except('KAN-3', 'KAN-6')],
  ['Team in (opt-blue)', K('KAN-3 KAN-6')],
  ['Reviewed = true', K('KAN-2')],
  ['Reviewed = false', except('KAN-2')],
  ['Owner = currentUser()', K('KAN-2')],
  ['Owner = "Bob Lee" OR Owner = carol', K('KAN-3 BUG-2')],
  ['Owner != bob', K('KAN-2 BUG-2')],
  ['"Go Live" >= 2026-11-15', K('KAN-9')],
  ['Tier in (Gold, Silver)', K('KAN-2 KAN-3')],
  ['Tier != Gold', K('KAN-3')],
  ['Note ~ ship', K('KAN-2')],
  ['Note !~ ship', K('KAN-5')],
  ['cf[cfsize] = 2', K('KAN-5')],
  ['(status = Done OR flagged = true) AND NOT project = BUG', K('KAN-2 KAN-3 KAN-8')],
  ['NOT (assignee = alice OR assignee is EMPTY)', K('KAN-3 KAN-5 KAN-7 KAN-8 BUG-1 BUG-3 BUG-5')],
  ['NOT priority = High', K('KAN-2 KAN-4 KAN-5 KAN-6 KAN-7 KAN-8 KAN-9 KAN-10 BUG-2 BUG-3 BUG-4 BUG-5')],
  ['status = Nope', []],
  ['', ALL],
];

/** [query, expected keys IN ORDER] */
const ORDER_CASES = [
  ['project = BUG ORDER BY priority DESC, key', K('BUG-2 BUG-5 BUG-1 BUG-3 BUG-4')],
  ['project = BUG ORDER BY priority ASC', K('BUG-4 BUG-3 BUG-1 BUG-2 BUG-5')],
  ['project = KAN ORDER BY storyPoints DESC', K('KAN-6 KAN-3 KAN-2 KAN-9 KAN-5 KAN-7 KAN-1 KAN-4 KAN-8 KAN-10')],
  ['due is not empty ORDER BY due', K('KAN-8 KAN-4 BUG-3 BUG-5 KAN-5')],
  ['project = KAN AND type = Epic ORDER BY rank', K('KAN-10 KAN-1')],
  ['project = BUG ORDER BY assignee, created DESC', K('BUG-2 BUG-1 BUG-5 BUG-3 BUG-4')],
  ['project = KAN AND status != Done ORDER BY status DESC, key DESC', K('KAN-9 KAN-7 KAN-3 KAN-1 KAN-10 KAN-6 KAN-5 KAN-4')],
  ['statusCategory = done ORDER BY resolved DESC', K('KAN-2 KAN-8 BUG-3')],
  ['labels = auth ORDER BY summary', K('KAN-3 KAN-1 BUG-2 KAN-2')],
];

for (const [name, open] of [
  ['sqlite', () => openDatabase({ type: 'sqlite' })],
  ['postgres (pglite)', () => openDatabase({ type: 'postgres', pglite: new PGlite() })],
]) {
  describe(`jql integration on ${name}`, () => {
    let db;
    let data;
    const opts = () => ({ userId: 'u-alice', now: NOW, fields: CF, priorities: data.priorities, users: USERS });
    const runSql = async (q) => {
      const r = compile(q, opts());
      const rows = await db.all(`SELECT i."id" AS id FROM "issues" i WHERE ${r.where}${r.orderBy ? ' ORDER BY ' + r.orderBy : ''}`, r.params);
      return rows.map((x) => data.hydrated.find((h) => h.id === x.id).key);
    };
    before(async () => { db = await open(); data = await seed(db); });
    after(async () => { await db.close(); });

    test(`${CASES.length} queries: SQL == expected == matcher`, async () => {
      for (const [q, expected] of CASES) {
        const sql = (await runSql(q)).sort();
        const mem = data.hydrated.filter(createMatcher(q, opts())).map((h) => h.key).sort();
        assert.deepEqual(sql, [...expected].sort(), `SQL: ${q}`);
        assert.deepEqual(mem, [...expected].sort(), `match: ${q}`);
      }
    });

    test('currentUser() without a user matches nothing', async () => {
      const r = compile('assignee = currentUser()', { now: NOW });
      assert.equal((await db.all(`SELECT i."id" FROM "issues" i WHERE ${r.where}`, r.params)).length, 0);
      assert.equal(data.hydrated.filter(createMatcher('assignee = currentUser()', { now: NOW })).length, 0);
    });

    test(`${ORDER_CASES.length} ORDER BY queries: SQL order == comparator order`, async () => {
      for (const [q, expected] of ORDER_CASES) {
        assert.deepEqual(await runSql(q), expected, `SQL: ${q}`);
        const cmp = createComparator(q, opts());
        const mem = data.hydrated.filter(createMatcher(q, opts())).sort(cmp).map((h) => h.key);
        assert.deepEqual(mem, expected, `comparator: ${q}`);
      }
      assert.equal(createComparator('status = a', opts()), null);
    });
  });
}
