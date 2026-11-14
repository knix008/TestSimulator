import { slaState, isDoneStatus } from './reports.js';

const FIELD_NAMES = {
  key: 'key', 키: 'key',
  summary: 'summary', title: 'summary', 요약: 'summary', 제목: 'summary',
  description: 'description', 설명: 'description',
  text: 'text', 텍스트: 'text',
  comment: 'comment', 의견: 'comment',
  type: 'type', 유형: 'type',
  status: 'status', 상태: 'status',
  priority: 'priority', 우선순위: 'priority',
  resolution: 'resolution', 해결: 'resolution',
  assignee: 'assignee', 담당: 'assignee', 담당자: 'assignee',
  reporter: 'reporter', 보고자: 'reporter',
  label: 'label', labels: 'label', 라벨: 'label',
  component: 'component', 구성요소: 'component',
  fixversion: 'fixversion', version: 'fixversion', 버전: 'fixversion',
  affectsversion: 'affectsversion',
  sprint: 'sprint', 스프린트: 'sprint',
  epic: 'epic', 에픽: 'epic',
  parent: 'parent', 상위: 'parent',
  points: 'points', 포인트: 'points',
  created: 'created', 생성: 'created',
  updated: 'updated', 수정: 'updated',
  due: 'due', 기한: 'due',
  watcher: 'watcher', 관찰: 'watcher',
  sla: 'sla',
  project: 'project', 프로젝트: 'project',
  rank: 'rank', 순위: 'rank',
};

const PRIORITY_RANK = { highest: 5, high: 4, medium: 3, low: 2, lowest: 1, 최고: 5, 높음: 4, 보통: 3, 낮음: 2, 최저: 1 };

function normalizeField(field) {
  const raw = String(field ?? '').trim();
  return FIELD_NAMES[raw.toLowerCase()] || FIELD_NAMES[raw] || raw;
}

function tokenize(input) {
  const source = String(input ?? '');
  const tokens = [];
  let index = 0;
  const word = /[\p{L}\p{N}_.*+\-]/u;
  while (index < source.length) {
    const char = source[index];
    if (/\s/u.test(char)) { index += 1; continue; }
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      let value = '';
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') { index += 1; value += source[index] ?? ''; index += 1; continue; }
        value += source[index];
        index += 1;
      }
      if (source[index] === quote) index += 1;
      tokens.push({ t: 'str', v: value });
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (pair === '!=' || pair === '!~' || pair === '>=' || pair === '<=') {
      tokens.push({ t: 'op', v: pair });
      index += 2;
      continue;
    }
    if ('=<>~()'.includes(char)) {
      tokens.push({ t: '=<>~'.includes(char) ? 'op' : 'punct', v: char });
      index += 1;
      continue;
    }
    if (char === ',') { tokens.push({ t: 'comma', v: ',' }); index += 1; continue; }
    if (word.test(char)) {
      let end = index + 1;
      while (end < source.length && word.test(source[end])) end += 1;
      tokens.push({ t: 'word', v: source.slice(index, end) });
      index = end;
      continue;
    }
    throw new Error('query');
  }
  return tokens;
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.i = 0; }
  peek() { return this.tokens[this.i]; }
  done() { return this.i >= this.tokens.length; }
  isWord(value) {
    const token = this.peek();
    return Boolean(token && token.t === 'word' && token.v.toLowerCase() === value);
  }
  kw(value) {
    if (!this.isWord(value)) return false;
    this.i += 1;
    return true;
  }
  field() {
    const token = this.peek();
    if (!token || (token.t !== 'word' && token.t !== 'str')) throw new Error('query');
    this.i += 1;
    return token.v;
  }
  value() {
    const token = this.peek();
    if (!token || (token.t !== 'word' && token.t !== 'str')) throw new Error('query');
    if (token.t === 'word' && this.tokens[this.i + 1]?.v === '(') {
      const name = token.v;
      this.i += 2;
      if (this.peek()?.v !== ')') throw new Error('query');
      this.i += 1;
      return { type: 'fn', name };
    }
    this.i += 1;
    return { type: 'lit', text: token.v };
  }
  list() {
    if (this.peek()?.v !== '(') throw new Error('query');
    this.i += 1;
    const values = [];
    if (this.peek()?.v === ')') throw new Error('query');
    while (!this.done()) {
      values.push(this.value());
      if (this.peek()?.t === 'comma') { this.i += 1; continue; }
      break;
    }
    if (this.peek()?.v !== ')') throw new Error('query');
    this.i += 1;
    return values;
  }
  parseUnary() {
    if (this.kw('not')) return { type: 'not', item: this.parseUnary() };
    return this.parsePrimary();
  }
  parsePrimary() {
    if (this.peek()?.v === '(') {
      this.i += 1;
      const node = this.parseOr();
      if (this.peek()?.v !== ')') throw new Error('query');
      this.i += 1;
      return node;
    }
    return this.parsePredicate();
  }
  parsePredicate() {
    const field = this.field();
    if (this.kw('is')) {
      const not = this.kw('not');
      if (!this.kw('empty') && !this.kw('null') && !this.kw('none')) throw new Error('query');
      return { type: 'empty', field, not };
    }
    if (this.kw('not')) {
      if (!this.kw('in')) throw new Error('query');
      return { type: 'in', field, values: this.list(), not: true };
    }
    if (this.kw('in')) return { type: 'in', field, values: this.list(), not: false };
    const op = this.peek();
    if (!op || op.t !== 'op') throw new Error('query');
    this.i += 1;
    return { type: 'cmp', field, op: op.v, value: this.value() };
  }
  parseAnd() {
    let left = this.parseUnary();
    while (!this.done()) {
      if (this.kw('and')) { left = { type: 'and', left, right: this.parseUnary() }; continue; }
      if (this.isWord('or') || this.peek()?.v === ')') break;
      const token = this.peek();
      if (token && (token.t === 'word' || token.t === 'str')) { left = { type: 'and', left, right: this.parseUnary() }; continue; }
      break;
    }
    return left;
  }
  parseOr() {
    let left = this.parseAnd();
    while (this.kw('or')) left = { type: 'or', left, right: this.parseAnd() };
    return left;
  }
}

function parseOrder(tokens) {
  const parser = new Parser(tokens);
  const order = [];
  if (parser.done()) return order;
  while (!parser.done()) {
    const field = parser.field();
    let dir = 'asc';
    if (parser.kw('desc')) dir = 'desc';
    else parser.kw('asc');
    order.push({ field, dir });
    if (parser.peek()?.t === 'comma') { parser.i += 1; continue; }
    break;
  }
  if (!parser.done()) throw new Error('query');
  return order;
}

export function parse(text) {
  const tokens = tokenize(String(text ?? '').trim());
  if (!tokens.length) return { ast: { type: 'all' }, order: [] };
  let orderAt = -1;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].t === 'word' && tokens[index].v.toLowerCase() === 'order' && tokens[index + 1].t === 'word' && tokens[index + 1].v.toLowerCase() === 'by') {
      orderAt = index;
      break;
    }
  }
  const expr = orderAt === -1 ? tokens : tokens.slice(0, orderAt);
  const order = parseOrder(orderAt === -1 ? [] : tokens.slice(orderAt + 2));
  if (!expr.length) return { ast: { type: 'all' }, order };
  const parser = new Parser(expr);
  const ast = parser.parseOr();
  if (!parser.done()) throw new Error('query');
  return { ast, order };
}

function userOf(ws, id) {
  return (ws.users || []).find((user) => user.id === id) || null;
}

function named(list, id) {
  return (list || []).find((item) => item.id === id) || null;
}

function fieldValue(ws, project, issue, field, ctx) {
  const key = normalizeField(field);
  const texts = [];
  let number = null;
  let date = null;
  const add = (...values) => {
    for (const value of values) if (value != null && value !== '') texts.push(String(value));
  };
  switch (key) {
    case 'key': add(issue.key); break;
    case 'summary': add(issue.summary); break;
    case 'description': add(issue.description); break;
    case 'comment': add(...(issue.comments || []).map((comment) => comment.body)); break;
    case 'text':
      add(issue.key, issue.summary, issue.description, issue.environment, ...(issue.comments || []).map((comment) => comment.body));
      break;
    case 'type': {
      const type = named(project.issueTypes, issue.typeId);
      add(issue.typeId, type?.ko, type?.en);
      break;
    }
    case 'status': {
      const status = named(project.statuses, issue.statusId);
      add(issue.statusId, status?.ko, status?.en, status?.category);
      break;
    }
    case 'priority': {
      const priority = named(project.priorities, issue.priorityId);
      add(issue.priorityId, priority?.ko, priority?.en);
      number = PRIORITY_RANK[issue.priorityId] ?? null;
      break;
    }
    case 'resolution': {
      const resolution = named(project.resolutions, issue.resolutionId);
      add(issue.resolutionId, resolution?.ko, resolution?.en);
      break;
    }
    case 'assignee': {
      const user = userOf(ws, issue.assigneeId);
      add(issue.assigneeId, user?.name, user?.email);
      break;
    }
    case 'reporter': {
      const user = userOf(ws, issue.reporterId);
      add(issue.reporterId, user?.name, user?.email);
      break;
    }
    case 'label': add(...(issue.labels || [])); break;
    case 'component':
      for (const id of issue.componentIds || []) add(id, named(project.components, id)?.name);
      break;
    case 'fixversion':
      for (const id of issue.fixVersionIds || []) add(id, named(project.versions, id)?.name);
      break;
    case 'affectsversion':
      for (const id of issue.affectsVersionIds || []) add(id, named(project.versions, id)?.name);
      break;
    case 'sprint': {
      const sprint = named(project.sprints, issue.sprintId);
      add(issue.sprintId, sprint?.name, sprint?.state);
      break;
    }
    case 'epic': {
      const epic = named(project.issues, issue.epicId);
      add(issue.epicId, epic?.key, epic?.summary);
      break;
    }
    case 'parent': {
      const parent = named(project.issues, issue.parentId);
      add(issue.parentId, parent?.key, parent?.summary);
      break;
    }
    case 'points':
      number = issue.storyPoints == null || issue.storyPoints === '' ? null : Number(issue.storyPoints);
      if (number != null) add(String(number));
      break;
    case 'created': date = Date.parse(issue.created); break;
    case 'updated': date = Date.parse(issue.updated); break;
    case 'due': date = issue.due ? Date.parse(issue.due) : null; break;
    case 'watcher':
      for (const id of issue.watchers || []) add(id, userOf(ws, id)?.name, userOf(ws, id)?.email);
      break;
    case 'sla': {
      const sla = slaState(project, issue, ctx.now);
      if (!sla) break;
      add('any');
      if (!isDoneStatus(project, issue.statusId)) add(sla.breached ? 'breached' : 'ok');
      else add(sla.met ? 'met' : 'missed');
      break;
    }
    case 'project': add(project.key, project.name, project.id); break;
    case 'rank': number = Number(issue.rank) || 0; add(String(number)); break;
    default: {
      const defined = (project.fields || []).find((item) => item.id === field || item.name === field || item.ko === field || item.en === field);
      if (defined) {
        const value = issue.fields?.[defined.id];
        if (typeof value === 'number') number = value;
        if (value != null && value !== '') add(value);
      }
    }
  }
  return { texts, number, date };
}

function parseLiteral(text, ctx) {
  const raw = String(text ?? '').trim();
  const relative = /^([+-]?\d+)([dwmy])$/i.exec(raw);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const scale = unit === 'd' ? 86400000 : unit === 'w' ? 7 * 86400000 : unit === 'm' ? 30 * 86400000 : 365 * 86400000;
    return { texts: [raw], number: null, date: ctx.now + amount * scale };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return { texts: [raw], number: null, date: new Date(year, month - 1, day).getTime(), day: true };
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { texts: [raw], number: Number(raw), date: null };
  const rank = PRIORITY_RANK[raw.toLowerCase()] ?? PRIORITY_RANK[raw];
  return { texts: [raw], number: rank ?? null, date: null };
}

function evalFn(name, ctx, project) {
  const key = name.toLowerCase();
  if (key === 'currentuser') {
    const user = ctx.user;
    return { texts: [user?.id, user?.name, user?.email].filter(Boolean), number: null, date: null };
  }
  if (key === 'opensprints') {
    const sprints = (project.sprints || []).filter((sprint) => sprint.state === 'active');
    return { texts: sprints.flatMap((sprint) => [sprint.id, sprint.name].filter(Boolean)), number: null, date: null };
  }
  if (key === 'now') return { texts: ['now'], number: null, date: ctx.now };
  throw new Error('query');
}

function resolveValue(node, ctx, project) {
  if (node.type === 'fn') return evalFn(node.name, ctx, project);
  return parseLiteral(node.text, ctx);
}

function sameDay(a, b) {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function equals(actual, expected) {
  const wanted = expected.texts.map((text) => text.toLowerCase());
  const emptyWord = wanted.some((text) => text === 'unassigned' || text === '없음' || text === '비어 있음');
  const actualEmpty = actual.texts.length === 0 && actual.number == null && (actual.date == null || Number.isNaN(actual.date));
  if (emptyWord && actualEmpty) return true;
  if (expected.day && actual.date != null && expected.date != null) return sameDay(actual.date, expected.date);
  if (expected.number != null && actual.number != null && wanted.length === 1 && /^-?\d+(\.\d+)?$/.test(wanted[0])) return actual.number === expected.number;
  const have = actual.texts.map((text) => text.toLowerCase());
  return wanted.some((text) => have.includes(text));
}

function compare(op, actual, expected) {
  if (op === '=' || op === '!=') {
    const ok = equals(actual, expected);
    return op === '=' ? ok : !ok;
  }
  if (op === '~' || op === '!~') {
    const wanted = expected.texts.map((text) => text.toLowerCase());
    const have = actual.texts.map((text) => text.toLowerCase());
    const ok = wanted.some((text) => have.some((item) => item.includes(text)));
    return op === '~' ? ok : !ok;
  }
  const left = actual.date ?? actual.number;
  const right = expected.date ?? expected.number;
  if (left == null || right == null || Number.isNaN(left) || Number.isNaN(right)) return false;
  if (op === '>') return left > right;
  if (op === '>=') return left >= right;
  if (op === '<') return left < right;
  if (op === '<=') return left <= right;
  return false;
}

function isEmpty(actual) {
  return actual.texts.length === 0 && actual.number == null && (actual.date == null || Number.isNaN(actual.date));
}

function evalNode(node, issue, ws, project, ctx) {
  if (!node || node.type === 'all') return true;
  if (node.type === 'not') return !evalNode(node.item, issue, ws, project, ctx);
  if (node.type === 'and') return evalNode(node.left, issue, ws, project, ctx) && evalNode(node.right, issue, ws, project, ctx);
  if (node.type === 'or') return evalNode(node.left, issue, ws, project, ctx) || evalNode(node.right, issue, ws, project, ctx);
  const actual = fieldValue(ws, project, issue, node.field, ctx);
  if (node.type === 'empty') {
    const empty = isEmpty(actual);
    return node.not ? !empty : empty;
  }
  if (node.type === 'in') {
    const ok = node.values.some((value) => equals(actual, resolveValue(value, ctx, project)));
    return node.not ? !ok : ok;
  }
  return compare(node.op, actual, resolveValue(node.value, ctx, project));
}

function sortValue(issue, field, ws, project) {
  const key = normalizeField(field);
  if (key === 'priority') return PRIORITY_RANK[issue.priorityId] || 0;
  if (key === 'rank') return Number(issue.rank) || 0;
  if (key === 'points') return issue.storyPoints == null ? -1 : Number(issue.storyPoints);
  if (key === 'created') return Date.parse(issue.created) || 0;
  if (key === 'updated') return Date.parse(issue.updated) || 0;
  if (key === 'due') return Date.parse(issue.due) || 0;
  if (key === 'key') return issue.key || '';
  if (key === 'summary') return issue.summary || '';
  if (key === 'status') return project.statuses.findIndex((status) => status.id === issue.statusId);
  if (key === 'type') return issue.typeId || '';
  if (key === 'assignee') return userOf(ws, issue.assigneeId)?.name || '';
  return issue.rank || 0;
}

function compareIssues(a, b, order, ws, project) {
  for (const item of order) {
    const left = sortValue(a, item.field, ws, project);
    const right = sortValue(b, item.field, ws, project);
    let delta = 0;
    if (typeof left === 'number' && typeof right === 'number') delta = left - right;
    else delta = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
    if (delta) return item.dir === 'desc' ? -delta : delta;
  }
  return String(a.key).localeCompare(String(b.key), undefined, { numeric: true });
}

/** Runs a WQL query inside one project. An empty query returns every issue, ordered by rank. */
export function runQuery(ws, project, text, ctx = {}) {
  const context = {
    now: ctx.now ?? Date.now(),
    user: ctx.user ?? (ws.users || []).find((user) => user.id === ws.currentUserId) ?? null,
  };
  try {
    const parsed = parse(text);
    const ordered = parsed.order.length > 0;
    const order = ordered ? parsed.order : [{ field: 'rank', dir: 'asc' }];
    const issues = project.issues
      .filter((issue) => evalNode(parsed.ast, issue, ws, project, context))
      .slice()
      .sort((a, b) => compareIssues(a, b, order, ws, project));
    return { issues, error: null, ordered };
  } catch {
    return { issues: [], error: 'query', ordered: false };
  }
}
