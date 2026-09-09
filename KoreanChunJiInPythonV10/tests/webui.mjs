/*
 * webui.mjs - 웹 판 화면(app.js)을 브라우저 없이 돌려 본다.
 *
 * 브라우저를 내려받지 않고도 배선이 성한지 보려는 것이다. app.js 는 조합을
 * 하나도 하지 않고 서버에 넘기기만 하므로, 필요한 것은 아주 작은 DOM 흉내와
 * 진짜 서버뿐이다. 그 둘을 붙여 놓고 실제로 키를 눌러 본다.
 *
 *   node tests/webui.mjs <서버 주소>
 *
 * 잘 되면 `@@CASE` 줄을 찍고 0 으로 끝난다. 파이썬 쪽 시험(test_web.py)이
 * 이것을 불러 그 줄을 제 보고서에 합친다.
 *
 * 여기서 잡으려는 것은 조합 결과가 아니라 **화면이 멎지 않는가** 다.
 * 조합은 엔진 시험이 이미 전수로 본다.
 */
'use strict';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2];
if (!base) {
  console.error('서버 주소를 알려 주세요.');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─────────────────────────────────────────────────────────────
// 아주 작은 DOM 흉내
//
// app.js 가 실제로 쓰는 것만 만든다. 브라우저를 흉내 내는 것이 목적이
// 아니라, 배선이 끊긴 데가 없는지 보는 것이 목적이다.
// ─────────────────────────────────────────────────────────────
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {} };
    this.handlers = {};
    this._text = '';
    this.value = '';
    this.hidden = false;
    this.checked = false;
    this.className = '';
    this.innerHTML = '';
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.files = [];
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v ?? ''); }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
  removeEventListener() {}
  setAttribute(k, v) { this[k] = v; }
  getAttribute(k) { return this[k]; }
  click() { this.fire('click'); }
  focus() { doc.activeElement = this; }
  fire(name, ev = {}) {
    for (const fn of this.handlers[name] || []) {
      fn({ target: this, preventDefault() {}, stopPropagation() {}, ...ev });
    }
  }
}

const byId = new Map();
const doc = {
  documentElement: new El('html'),
  body: new El('body'),
  activeElement: null,
  handlers: {},
  title: '',
  getElementById(id) {
    if (!byId.has(id)) byId.set(id, new El('div'));
    return byId.get(id);
  },
  createElement(tag) { return new El(tag); },
  querySelectorAll(sel) { return doc._query(sel); },
  addEventListener(name, fn) { (doc.handlers[name] ||= []).push(fn); },
  _query(sel) {
    // app.js 가 쓰는 고르개는 세 가지뿐이다.
    if (sel === '[data-t]') return tagged;
    if (sel === '.tool[data-tip]' || sel === '.tool') return tools;
    return [];
  },
};
doc.body.dataset = {};

// index.html 에 적힌 것들을 그대로 만들어 둔다.
const tagged = ['setTitle','setTheme','setLanguage','setFontSize','setTapTime',
  'setStartMode','showToolbar','showStatus','setDefault','setOK','helpTitle',
  'aboutTitle','close'].map((t) => { const e = new El('span'); e.dataset.t = t; return e; });

const TOOL_ACTS = ['new','open','save','copy','paste','clear','cycleMode',
  'cycleTheme','cycleLang','settings','help','about'];
const tools = TOOL_ACTS.map((act) => {
  const e = new El('button');
  e.dataset.act = act;
  e.dataset.tip = 'tip' + act[0].toUpperCase() + act.slice(1);
  return e;
});

for (const id of ['editor','status','keys','fnrow','toolbar','helpBody','aboutBody',
  'selTheme','selLang','selFont','selTap','selMode','chkToolbar','chkStatus',
  'btnDefaults','btnSettingsClose','btnHelpClose','btnAboutClose',
  'settingsModal','helpModal','aboutModal','loading','filePicker']) {
  byId.set(id, new El(id.startsWith('sel') ? 'select' : 'div'));
}

// index.html 에서 처음부터 숨겨져 있는 것들이다. 이것을 맞추지 않으면
// app.js 가 "대화 상자가 떠 있다" 고 여겨 키를 하나도 받지 않는다.
for (const id of ['settingsModal', 'helpModal', 'aboutModal', 'filePicker']) {
  byId.get(id).hidden = true;
}

const store = new Map();
globalThis.document = doc;
globalThis.window = { clipboardData: null };
// Node 24 의 globalThis.navigator 는 읽기 전용이라 그냥 대입하면 죽는다.
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'ko-KR', clipboard: undefined },
  configurable: true,
  writable: true,
});
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
};
// URL 을 통째로 갈아 끼우면 안 된다. fetch 흉내가 그 생성자를 쓴다.
// 브라우저에만 있는 두 가지만 얹는다.
URL.createObjectURL = () => 'blob:x';
URL.revokeObjectURL = () => {};
globalThis.Blob = class {};

// 시계를 붙들어 둔다. 다 보고 나서 남은 것을 끊으려는 것이다.
// 연타를 끊는 시계가 살아 있으면 시험이 끝난 뒤에 서버를 부른다.
const realSetTimeout = globalThis.setTimeout;
const timers = new Set();
globalThis.setTimeout = (fn, ms) => {
  const id = realSetTimeout(fn, ms);
  timers.add(id);
  return id;
};

// fetch 는 진짜다. 서버가 정말로 돌고 있어야 한다.
//
// 다만 Node 의 fetch 는 쿠키를 물고 다니지 않는다. 서버는 쿠키로 세션을
// 가르므로, 그대로 두면 키를 누를 때마다 새 세션이 되어 글이 하나도 쌓이지
// 않는다(실제로 그래서 한 번 헛돌았다). 브라우저가 하는 일을 여기서 한다.
const realFetch = globalThis.fetch;
let calls = 0;
let cookie = null;

globalThis.fetch = async (path, init) => {
  calls += 1;
  const headers = { ...(init && init.headers) };
  if (cookie) headers.Cookie = cookie;

  const res = await realFetch(new URL(path, base), { ...init, headers });
  const got = res.headers.get('set-cookie');
  if (got) cookie = got.split(';')[0];
  return res;
};

// ─────────────────────────────────────────────────────────────
// app.js 를 들여온다
//
// app.js 는 모듈이 아니라 평범한 스크립트다(브라우저에서 그렇게 읽힌다).
// 그래서 글을 읽어 함수로 감싸 돌리고, 안에 있는 것을 돌려받는다.
// ─────────────────────────────────────────────────────────────
let source = readFileSync(join(root, 'web', 'app.js'), 'utf8');

// app.js 는 맨 끝에서 스스로 boot() 한다. 그것을 그대로 두면 우리가 부르는
// 것과 두 번 돌아 키패드가 스물넷이 된다. 떼어 내고 우리가 기다렸다 부른다.
const selfStart = /\nboot\(\);\s*$/;
if (!selfStart.test(source)) {
  console.error('app.js 끝의 boot() 을 찾지 못했다. 시험을 고쳐야 한다.');
  process.exit(2);
}
source = source.replace(selfStart, '\n');

const load = new Function(
  source + '\nreturn { boot, pressKey, call, render, snapGet: () => snap, settings };'
);
const app = load();

// ─────────────────────────────────────────────────────────────
// 눌러 본다
// ─────────────────────────────────────────────────────────────
const GROUP = '웹 판';
const SECTION = '브라우저 없이 화면 돌리기';
let failed = 0;

function check(ok, name, detail) {
  const tag = ok ? 'ok' : 'FAIL';
  if (!ok) failed += 1;
  console.log(`@@CASE\t${tag}\t${GROUP}\t${SECTION}\t${name}\t${detail}`);
}

const editor = doc.getElementById('editor');
const status = doc.getElementById('status');

try {
  await app.boot();
} catch (err) {
  check(false, '시작', `boot() 이 죽었다: ${err.message}`);
  process.exit(1);
}

check(doc.getElementById('loading').hidden === true, '시작', '엔진에 닿아 로딩을 걷었다');
check(doc.getElementById('keys').children.length === 12, '키패드 만들기',
  `${doc.getElementById('keys').children.length}개`);
check(doc.getElementById('fnrow').children.length === 6, '기능 버튼 만들기',
  `${doc.getElementById('fnrow').children.length}개`);
check(doc.title.length > 0, '제목', doc.title);

// 사람이 키패드를 누르는 것과 같은 자리를 부른다.
const keys = doc.getElementById('keys').children;
for (const i of [3, 0, 1, 4]) keys[i].fire('click');
await app.call('commit');

check(app.snapGet().text === '간', '키패드로 치기',
  `엔진 ${JSON.stringify(app.snapGet().text)} · 화면 ${JSON.stringify(editor.value)}`);
check(editor.value === app.snapGet().text, '편집칸이 따라온다', JSON.stringify(editor.value));
check(status.textContent.includes('4자') || status.textContent.includes('1자'),
  '상태줄', status.textContent);
check(keys[0].textContent === 'ㅣ', '키 라벨',
  [...keys].slice(0, 3).map((k) => k.textContent).join(' '));

// 물리 키보드.
editor.fire('keydown', { key: '3', ctrlKey: false, metaKey: false });
await app.call('state');
check(app.snapGet().length > 1, '물리 키보드', JSON.stringify(app.snapGet().text));

// 모드를 돌리면 라벨이 바뀐다.
await app.call('cycleMode');
check(keys[0].textContent === 'abc', '모드 순환', keys[0].textContent);
await app.call('setMode', { mode: 0 });

// 툴바 단추가 모두 이어져 있어야 한다. 하나라도 빠지면 눌러도 조용하다.
const wired = tools.filter((t) => (t.handlers.click || []).length > 0).length;
check(wired === tools.length, '툴바 배선', `${wired}/${tools.length}`);

// 전체 지우기.
tools.find((t) => t.dataset.act === 'clear').fire('click');
await app.call('state');
check(app.snapGet().text === '', '전체 지우기', JSON.stringify(app.snapGet().text));

// 테마와 언어를 바꿔 본다.
tools.find((t) => t.dataset.act === 'cycleTheme').fire('click');
check(doc.body.dataset.theme === 'dark', '테마 바꾸기', String(doc.body.dataset.theme));
tools.find((t) => t.dataset.act === 'cycleLang').fire('click');
check(doc.title.startsWith('Chunjiin'), '언어 바꾸기', doc.title);

// 대화 상자.
tools.find((t) => t.dataset.act === 'help').fire('click');
check(doc.getElementById('helpModal').hidden === false, '사용법 창 열기', '열림');
check(doc.getElementById('helpBody').textContent.includes('['), '사용법 본문',
  `${doc.getElementById('helpBody').textContent.length}자`);
doc.getElementById('btnHelpClose').fire('click');
check(doc.getElementById('helpModal').hidden === true, '사용법 창 닫기', '닫힘');

check(calls > 5, '서버를 실제로 불렀다', `${calls}번`);

// 남은 시계를 끊는다. 그러지 않으면 시험이 끝난 뒤에 서버를 불러
// 연결이 끊겼다는 소리가 난다.
for (const id of timers) clearTimeout(id);
process.exitCode = failed ? 1 : 0;
