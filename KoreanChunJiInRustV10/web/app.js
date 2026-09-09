/*
 * app.js - 웹 판 화면.
 *
 * 조합은 하나도 여기서 하지 않는다. 키를 누르면 chunjiin_wasm 으로 넘기고,
 * 돌아온 상태 객체로 화면을 다시 그린다. 데스크톱 판과 같은 Rust 엔진이므로
 * 조합 결과가 어긋날 수 없다.
 *
 *   누름 -> engine.key(i) -> 상태 객체 -> render(상태)
 *
 * 엔진은 wasm-bindgen 이 만들어 준 조각(chunjiin_wasm.js)으로 들여온다.
 * 그래서 이 파일은 모듈이다(index.html 의 type="module").
 */
'use strict';

import init, * as engine from './chunjiin_wasm.js';

// ─────────────────────────────────────────────────────────────
// 글자표 (데스크톱 판 internal/ui/lang.go 와 같은 내용)
// ─────────────────────────────────────────────────────────────
const TEXTS = {
  ko: {
    appTitle: '천지인 한글 입력기',
    helpTitle: '사용법',
    aboutTitle: '프로그램 정보',
    setTitle: '설정',
    setTheme: '테마', setLanguage: '언어', setFontSize: '글꼴 크기',
    setTapTime: '연타 유지 시간', setStartMode: '시작 입력 모드',
    setDefault: '기본값', setOK: '확인', close: '닫기',
    showToolbar: '툴바 보이기', showStatus: '상태줄 보이기',
    unitPx: 'px', unitSec: '초', markDefault: '(기본)',
    composing: '조합', chars: '자', none: '–',
    themes: ['라이트', '다크', '세피아', '고대비'],
    modes: ['한글', '영문 abc', '영문 ABC', '숫자 123', '기호 !@#'],
    fn: ['모드', '←', '스페이스', '→', '', ''],
    tipNew: '새로 만들기 (Ctrl+N)', tipOpen: '열기 (Ctrl+O)',
    tipSave: '저장 (Ctrl+S)', tipCopy: '복사 (Ctrl+C)',
    tipPaste: '붙여넣기 (Ctrl+V)', tipClear: '전체 지우기',
    tipMode: '입력 모드 전환 (F2)', tipTheme: '테마 전환 (F3)',
    tipLang: '언어 전환 (한국어 / English)',
    tipSettings: '설정 (F4)', tipHelp: '사용법 (F1)', tipAbout: '프로그램 정보',
    copied: '복사했습니다', pasteFail: '붙여넣기 권한이 없습니다',
  },
  en: {
    appTitle: 'Chunjiin Hangul Keyboard',
    helpTitle: 'Guide',
    aboutTitle: 'About',
    setTitle: 'Settings',
    setTheme: 'Theme', setLanguage: 'Language', setFontSize: 'Font size',
    setTapTime: 'Multi-tap window', setStartMode: 'Start mode',
    setDefault: 'Defaults', setOK: 'OK', close: 'Close',
    showToolbar: 'Show toolbar', showStatus: 'Show status bar',
    unitPx: 'px', unitSec: 's', markDefault: '(default)',
    composing: 'Composing', chars: ' chars', none: '–',
    themes: ['Light', 'Dark', 'Sepia', 'High contrast'],
    modes: ['Hangul', 'Latin abc', 'Latin ABC', 'Digits 123', 'Symbols !@#'],
    fn: ['Mode', '←', 'Space', '→', '', ''],
    tipNew: 'New (Ctrl+N)', tipOpen: 'Open (Ctrl+O)',
    tipSave: 'Save (Ctrl+S)', tipCopy: 'Copy (Ctrl+C)',
    tipPaste: 'Paste (Ctrl+V)', tipClear: 'Clear all',
    tipMode: 'Switch input mode (F2)', tipTheme: 'Switch theme (F3)',
    tipLang: 'Switch language (한국어 / English)',
    tipSettings: 'Settings (F4)', tipHelp: 'Guide (F1)', tipAbout: 'About',
    copied: 'Copied', pasteFail: 'Clipboard permission denied',
  },
};

const HELP = {
  ko: `[ 키패드 ]

    ㅣ      ·      ㅡ
    ㄱㅋ   ㄴㄹ   ㄷㅌ
    ㅂㅍ   ㅅㅎ   ㅈㅊ
    . ,    ㅇㅁ   ? !

[ 모음 ]

  ㅣ 와 · 와 ㅡ 를 이어서 모든 모음을 만듭니다.

  ㅏ = ㅣ+·        ㅑ = ㅣ+·+·        ㅐ = ㅏ+ㅣ
  ㅓ = ·+ㅣ        ㅕ = ·+·+ㅣ        ㅔ = ㅓ+ㅣ
  ㅗ = ·+ㅡ        ㅛ = ·+·+ㅡ        ㅚ = ㅗ+ㅣ
  ㅜ = ㅡ+·        ㅠ = ㅡ+·+·        ㅟ = ㅜ+ㅣ
  ㅡ = ㅡ          ㅣ = ㅣ            ㅢ = ㅡ+ㅣ
  ㅘ = ㅚ+·        ㅙ = ㅘ+ㅣ         ㅝ = ㅠ+ㅣ

[ 자음 ]

  같은 키를 연달아 누르면 순환합니다.

  ㄱ → ㅋ → ㄲ      ㄷ → ㅌ → ㄸ      ㅂ → ㅍ → ㅃ
  ㅅ → ㅎ → ㅆ      ㅈ → ㅊ → ㅉ      ㄴ → ㄹ      ㅇ → ㅁ

  받침 뒤에 모음을 누르면 자동으로 연음됩니다.   간 + ㅏ → 가나
  겹받침은 자음을 이어 누르면 합쳐집니다.        값 = ㄱ ㅏ ㅂ ㅅ
  첫 타에 안 붙는 겹받침은 한 번 더 누르면 합쳐집니다.   만 → 만ㅅ → 많

[ 같은 키를 연달아 써야 할 때 ]

  "안녕" 처럼 ㄴ 을 두 번 눌러야 하면 사이에 → 를 누르거나
  잠시 기다리세요. 순환이 끊기고 새 글자가 시작됩니다.

[ 물리 키보드 ]

  한글 모드에서 숫자열이 키패드에 대응합니다.

    1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
    4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !

    Space  띄어쓰기          Backspace  한 단계 지우기
    Enter  줄바꿈            Esc        조합 확정
    ← →    커서 이동         Home End   줄 처음 · 끝

    F1  도움말      F2  입력 모드      F3  테마      F4  설정

    Ctrl+N 새로   Ctrl+O 열기   Ctrl+S 저장
    Ctrl+C 복사   Ctrl+V 붙여넣기

[ 영문 · 숫자 · 기호 ]

  모드 버튼(F2)으로 한글, 영문 abc, 영문 ABC, 숫자, 기호 순으로 바뀝니다.
  영문·숫자·기호 모드에서는 물리 키보드로 그냥 타이핑해도 됩니다.

    abc  def  ghi        알파벳 26자가 위 3x3 아홉 키에 들어갑니다.
    jkl  mno  pqr        마지막 줄 세 키는 자주 쓰는 기호입니다.
    stu  vwx  yz         나머지 기호는 기호 모드에 36개가 있습니다.`,

  en: `[ Keypad ]

    ㅣ      ·      ㅡ
    ㄱㅋ   ㄴㄹ   ㄷㅌ
    ㅂㅍ   ㅅㅎ   ㅈㅊ
    . ,    ㅇㅁ   ? !

[ Vowels ]

  Every vowel is built from ㅣ, · and ㅡ.

  ㅏ = ㅣ+·        ㅑ = ㅣ+·+·        ㅐ = ㅏ+ㅣ
  ㅓ = ·+ㅣ        ㅕ = ·+·+ㅣ        ㅔ = ㅓ+ㅣ
  ㅗ = ·+ㅡ        ㅛ = ·+·+ㅡ        ㅚ = ㅗ+ㅣ
  ㅜ = ㅡ+·        ㅠ = ㅡ+·+·        ㅟ = ㅜ+ㅣ
  ㅡ = ㅡ          ㅣ = ㅣ            ㅢ = ㅡ+ㅣ
  ㅘ = ㅚ+·        ㅙ = ㅘ+ㅣ         ㅝ = ㅠ+ㅣ

[ Consonants ]

  Tapping the same key again cycles through its letters.

  ㄱ → ㅋ → ㄲ      ㄷ → ㅌ → ㄸ      ㅂ → ㅍ → ㅃ
  ㅅ → ㅎ → ㅆ      ㅈ → ㅊ → ㅉ      ㄴ → ㄹ      ㅇ → ㅁ

  A vowel after a final consonant moves it to the next syllable.  간 + ㅏ → 가나
  Two consonants in a row form a cluster where one exists.        값 = ㄱ ㅏ ㅂ ㅅ
  If the first tap does not join, tap once more.                  만 → 만ㅅ → 많

[ Typing the same key twice in a row ]

  For a word like "안녕" you need ㄴ twice. Press → in between,
  or simply wait a moment. The cycle ends and a new letter starts.

[ Physical keyboard ]

  In Hangul mode the number row maps onto the keypad.

    1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
    4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !

    Space  space              Backspace  step back
    Enter  new line           Esc        commit
    ← →    move cursor        Home End   start / end

    F1  guide      F2  input mode      F3  theme      F4  settings

    Ctrl+N new   Ctrl+O open   Ctrl+S save
    Ctrl+C copy  Ctrl+V paste

[ Latin · digits · symbols ]

  The mode button (F2) cycles Hangul, Latin abc, Latin ABC, digits, symbols.
  In those modes you can also type straight from the physical keyboard.

    abc  def  ghi        The 26 letters sit on the upper 3x3 keys.
    jkl  mno  pqr        The bottom row holds the common symbols.
    stu  vwx  yz         The other 36 symbols are in symbol mode.`,
};

// FN_ICONS 는 기능 버튼에 글자 대신 그릴 그림이다. 빈 칸이면 글자를 쓴다.
// ↵ 와 ⌫ 는 글꼴마다 있고 없고가 달라서 그림으로 그린다.
// 데스크톱 판 internal/ui/icons.go 와 같은 모양이다.
const FN_ICONS = [
  '', '', '', '',
  // 줄바꿈
  '<svg viewBox="0 0 24 24" class="fn-icon"><path d="M19.4 5v8.6H7.4"/><path d="M10.4 10.1 6.5 13.6l3.9 3.5"/></svg>',
  // 지우기
  '<svg viewBox="0 0 24 24" class="fn-icon">' +
    '<path d="M9 5h10.3a1.7 1.7 0 0 1 1.7 1.7v10.6a1.7 1.7 0 0 1-1.7 1.7H9L3 12z"/>' +
    '<path d="m12.4 9.4 5 5.2M17.4 9.4l-5 5.2"/></svg>',
];

// ─────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────
const THEME_IDS = ['light', 'dark', 'sepia', 'contrast'];
const FONT_CHOICES = [16, 18, 21, 24, 28, 32];
const TAP_CHOICES = [400, 600, 800, 1000, 1500, 2000];
const STORE_KEY = 'chunjiin.settings';

const DEFAULTS = {
  theme: 0,
  fontSize: 21,
  multitapMs: 800,
  startMode: 0,
  showToolbar: true,
  showStatus: true,
  language: (navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en',
};

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    Object.assign(s, JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
  } catch { /* 저장된 값이 깨졌으면 기본값을 쓴다 */ }

  s.theme = clamp(s.theme | 0, 0, THEME_IDS.length - 1);
  s.fontSize = FONT_CHOICES.includes(s.fontSize) ? s.fontSize : DEFAULTS.fontSize;
  s.multitapMs = TAP_CHOICES.includes(s.multitapMs) ? s.multitapMs : DEFAULTS.multitapMs;
  s.startMode = clamp(s.startMode | 0, 0, 4);
  s.showToolbar = !!s.showToolbar;
  s.showStatus = !!s.showStatus;
  if (!TEXTS[s.language]) s.language = DEFAULTS.language;
  return s;
}

function saveSettings(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* 사생활 보호 모드 */ }
}

// ─────────────────────────────────────────────────────────────
// 상태
// ─────────────────────────────────────────────────────────────
let settings = loadSettings();
let t = TEXTS[settings.language];
let snap = null;      // 엔진이 돌려준 마지막 상태
let tapTimer = 0;     // 연타 순환을 끊는 시계

const $ = (id) => document.getElementById(id);
const editor = $('editor');

// ─────────────────────────────────────────────────────────────
// 엔진 부르기
// ─────────────────────────────────────────────────────────────

// call 은 엔진 함수를 부르고 화면을 다시 그린다.
// 엔진은 어떤 함수든 처리를 마친 뒤의 상태를 JSON 으로 돌려준다.
let ready = false;
function call(name, ...args) {
  if (!ready) return;
  snap = JSON.parse(engine[name](...args));
  render();
}

// pressKey 는 키패드 키를 누른 것으로 처리하고 연타 시계를 다시 잰다.
function pressKey(i) {
  call('key', i);
  restartTapTimer();
}

// restartTapTimer 는 정해 둔 시간이 지나면 연타 순환을 끊는다.
// 그래야 "안녕" 처럼 같은 키를 연달아 써야 하는 낱말을 칠 수 있다.
function restartTapTimer() {
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => call('breakMultitap'), settings.multitapMs);
}

// ─────────────────────────────────────────────────────────────
// 그리기
// ─────────────────────────────────────────────────────────────
const keyButtons = [];
const fnButtons = [];

// buildKeypad 은 12키와 기능 버튼 6개를 한 번 만들어 둔다.
// 그 뒤로는 라벨과 색만 갈아 끼운다.
function buildKeypad() {
  const keys = $('keys');
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('button');
    b.className = 'key';
    b.type = 'button';
    b.addEventListener('click', () => pressKey(i));
    keys.appendChild(b);
    keyButtons.push(b);
  }

  const actions = [
    () => call('cycleMode'),
    () => call('moveCursor', -1),
    () => call('space'),
    () => call('moveCursor', 1),
    () => call('enter'),
    () => call('backspace'),
  ];

  const fnrow = $('fnrow');
  for (let i = 0; i < 6; i++) {
    const b = document.createElement('button');
    b.className = i === 0 ? 'key fn primary' : 'key fn';
    b.type = 'button';
    b.addEventListener('click', actions[i]);
    fnrow.appendChild(b);
    fnButtons.push(b);
  }
}

// render 는 엔진 상태를 화면에 옮긴다.
function render() {
  if (!snap) return;

  if (editor.value !== snap.text) editor.value = snap.text;
  editor.selectionStart = editor.selectionEnd = codeUnitOf(snap.text, snap.cursor);

  const comp = snap.composition || t.none;
  $('status').textContent =
    `${t.modes[snap.mode]}    ${t.composing} ${comp}    ${snap.length}${t.chars}`;

  for (let i = 0; i < 12; i++) {
    const b = keyButtons[i];
    if (b.textContent !== snap.labels[i]) b.textContent = snap.labels[i];
    b.className = 'key ' + snap.roles[i];
  }
}

/*
 * 엔진은 커서를 "몇 번째 글자" 로 세고, textarea 는 UTF-16 코드 단위로 센다.
 * 한글은 둘이 같지만 이모지처럼 두 칸을 쓰는 글자가 붙여넣기로 들어올 수
 * 있으므로 제대로 옮긴다.
 */
function codeUnitOf(text, charPos) {
  let units = 0, chars = 0;
  for (const ch of text) {
    if (chars >= charPos) break;
    units += ch.length;
    chars++;
  }
  return units;
}

function charPosOf(text, unitPos) {
  let units = 0, chars = 0;
  for (const ch of text) {
    if (units >= unitPos) break;
    units += ch.length;
    chars++;
  }
  return chars;
}

// applyLook 은 테마 · 글꼴 크기 · 툴바와 상태줄 표시를 지금 설정에 맞춘다.
function applyLook() {
  document.body.dataset.theme = THEME_IDS[settings.theme];
  document.documentElement.style.setProperty('--editor-size', settings.fontSize + 'px');
  $('toolbar').hidden = !settings.showToolbar;
  $('status').hidden = !settings.showStatus;
}

// applyLang 은 화면의 모든 글자를 지금 언어로 바꾼다.
function applyLang() {
  t = TEXTS[settings.language];
  document.documentElement.lang = settings.language;
  document.title = t.appTitle;

  for (const el of document.querySelectorAll('[data-t]')) {
    el.textContent = t[el.dataset.t] ?? '';
  }
  for (const el of document.querySelectorAll('.tool[data-tip]')) {
    el.dataset.label = t[el.dataset.tip] ?? '';
    el.title = '';                 // 브라우저 기본 툴팁과 겹치지 않게
    el.setAttribute('aria-label', t[el.dataset.tip] ?? '');
  }
  for (let i = 0; i < 6; i++) {
    if (FN_ICONS[i]) {
      fnButtons[i].innerHTML = FN_ICONS[i];
      fnButtons[i].setAttribute('aria-label', i === 4 ? 'Enter' : 'Backspace');
    } else {
      fnButtons[i].textContent = t.fn[i];
    }
  }

  $('helpBody').textContent = HELP[settings.language];
  fillSettingsSelects();
  render();
}

// ─────────────────────────────────────────────────────────────
// 물리 키보드
// ─────────────────────────────────────────────────────────────

/*
 * 한글 모드에서 숫자열을 키패드에 대응시킨다.
 *
 *   1 2 3  =  ㅣ · ㅡ            7 8 9  =  ㅂㅍ ㅅㅎ ㅈㅊ
 *   4 5 6  =  ㄱㅋ ㄴㄹ ㄷㅌ      - 0 =  =  . ,  ㅇㅁ  ? !
 */
const HANGUL_KEYS = {
  '1': 0, '2': 1, '3': 2,
  '4': 3, '5': 4, '6': 5,
  '7': 6, '8': 7, '9': 8,
  '-': 9, '0': 10, '=': 11,
};

function onKeyDown(e) {
  if (isModalOpen()) {
    if (e.key === 'Escape') closeModals();
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    const acts = { n: doNew, o: doOpen, s: doSave, c: doCopy, v: doPaste };
    if (acts[k]) { e.preventDefault(); acts[k](); }
    return;
  }

  if (snap && snap.mode === 0 && HANGUL_KEYS[e.key] !== undefined) {
    e.preventDefault();
    pressKey(HANGUL_KEYS[e.key]);
    return;
  }

  switch (e.key) {
    case ' ':         e.preventDefault(); call('space'); return;
    case 'Backspace': e.preventDefault(); call('backspace'); return;
    case 'Delete':    e.preventDefault(); call('del'); return;
    case 'Enter':     e.preventDefault(); call('enter'); return;
    case 'ArrowLeft': e.preventDefault(); call('moveCursor', -1); return;
    case 'ArrowRight':e.preventDefault(); call('moveCursor', 1); return;
    case 'Home':      e.preventDefault(); call('setCursor', 0); return;
    case 'End':       e.preventDefault(); call('setCursor', snap ? snap.length : 0); return;
    case 'Escape':    e.preventDefault(); call('commit'); return;
    case 'F1':        e.preventDefault(); openModal('helpModal'); return;
    case 'F2':        e.preventDefault(); call('cycleMode'); return;
    case 'F3':        e.preventDefault(); cycleTheme(); return;
    case 'F4':        e.preventDefault(); openModal('settingsModal'); return;
  }

  // 영문·숫자·기호 모드에서는 물리 키보드로 그냥 친다.
  if (snap && snap.mode !== 0 && e.key.length === 1 && !e.altKey) {
    e.preventDefault();
    call('insertText', e.key);
  }
}

// ─────────────────────────────────────────────────────────────
// 명령
// ─────────────────────────────────────────────────────────────
function doNew() { call('clear'); }

function doCopy() {
  call('commit');
  navigator.clipboard?.writeText(snap.text).then(() => flash(t.copied), () => {});
}

function doPaste() {
  navigator.clipboard?.readText()
    .then((text) => call('insertText', text))
    .catch(() => flash(t.pasteFail));
}

function doOpen() { $('filePicker').click(); }

function doSave() {
  call('commit');

  // 메모장이 UTF-8 로 알아보도록 데스크톱 판과 똑같이 BOM 을 붙인다.
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, snap.text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'chunjiin.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function cycleLang() {
  const codes = Object.keys(TEXTS);
  const at = codes.indexOf(settings.language);
  settings.language = codes[(at + 1) % codes.length];
  saveSettings(settings);
  applyLang();
  $('selLang').value = String(codes.indexOf(settings.language));
}

function cycleTheme() {
  settings.theme = (settings.theme + 1) % THEME_IDS.length;
  saveSettings(settings);
  applyLook();
  $('selTheme').value = String(settings.theme);
}

// flash 는 상태줄에 잠깐 알림을 띄웠다가 되돌린다.
function flash(msg) {
  $('status').textContent = msg;
  setTimeout(render, 1400);
}

// ─────────────────────────────────────────────────────────────
// 대화 상자
// ─────────────────────────────────────────────────────────────
const MODALS = ['settingsModal', 'helpModal', 'aboutModal'];

function isModalOpen() { return MODALS.some((id) => !$(id).hidden); }
function closeModals() { MODALS.forEach((id) => { $(id).hidden = true; }); editor.focus(); }

function openModal(id) {
  closeModals();
  if (id === 'aboutModal') fillAbout();
  $(id).hidden = false;
}

function fillAbout() {
  const lines = [
    `${t.appTitle}   1.0`, '',
    '12키 천지인 자판으로 한글을 조합합니다.', '',
    '────────────────────────────', '',
    '만든이      SHKWON  (knix008@naver.com)',
    '조합 엔진   KoreanChunJiInC++ : chunjiin.c / input.c',
    '빌드        Rust + WebAssembly',
    `테마        ${t.themes[settings.theme]}`,
    '저장 위치   브라우저 localStorage',
  ];
  $('aboutBody').textContent = lines.join('\n');
}

// fillSettingsSelects 는 설정 창의 목록을 지금 언어로 채운다.
function fillSettingsSelects() {
  const fill = (el, items, value) => {
    el.innerHTML = '';
    items.forEach((label, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = label;
      el.appendChild(o);
    });
    el.value = String(value);
  };

  fill($('selTheme'), t.themes, settings.theme);
  fill($('selMode'), t.modes, settings.startMode);
  fill($('selLang'), Object.keys(TEXTS).map((k) => (k === 'ko' ? '한국어' : 'English')),
       Object.keys(TEXTS).indexOf(settings.language));

  fill($('selFont'),
       FONT_CHOICES.map((v) => `${v} ${t.unitPx}` + (v === DEFAULTS.fontSize ? `  ${t.markDefault}` : '')),
       FONT_CHOICES.indexOf(settings.fontSize));

  fill($('selTap'),
       TAP_CHOICES.map((v) => `${(v / 1000).toFixed(1)} ${t.unitSec}` +
         (v === DEFAULTS.multitapMs ? `  ${t.markDefault}` : '')),
       TAP_CHOICES.indexOf(settings.multitapMs));

  $('chkToolbar').checked = settings.showToolbar;
  $('chkStatus').checked = settings.showStatus;
}

// ─────────────────────────────────────────────────────────────
// 이어 붙이기
// ─────────────────────────────────────────────────────────────
function wireUp() {
  buildKeypad();

  const acts = {
    new: doNew, open: doOpen, save: doSave,
    copy: doCopy, paste: doPaste, clear: doNew,
    cycleMode: () => call('cycleMode'),
    cycleTheme,
    cycleLang,
    settings: () => openModal('settingsModal'),
    help: () => openModal('helpModal'),
    about: () => openModal('aboutModal'),
  };
  for (const b of document.querySelectorAll('.tool')) {
    b.addEventListener('click', acts[b.dataset.act]);
  }

  // 편집칸은 직접 고치지 못하게 막고, 모든 입력을 엔진으로 돌린다.
  editor.addEventListener('keydown', onKeyDown);
  editor.addEventListener('beforeinput', (e) => e.preventDefault());
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    call('insertText', (e.clipboardData || window.clipboardData).getData('text'));
  });
  editor.addEventListener('click', () => {
    if (snap) call('setCursor', charPosOf(editor.value, editor.selectionStart));
  });
  document.addEventListener('keydown', (e) => {
    if (document.activeElement !== editor) onKeyDown(e);
  });

  // 키패드를 눌러도 커서가 계속 보이도록 초점을 되돌린다.
  for (const b of [...keyButtons, ...fnButtons]) {
    b.addEventListener('mouseup', () => editor.focus());
    b.addEventListener('touchend', () => editor.focus(), { passive: true });
  }

  $('selTheme').addEventListener('change', (e) => {
    settings.theme = +e.target.value; saveSettings(settings); applyLook();
  });
  $('selLang').addEventListener('change', (e) => {
    settings.language = Object.keys(TEXTS)[+e.target.value];
    saveSettings(settings); applyLang();
  });
  $('selFont').addEventListener('change', (e) => {
    settings.fontSize = FONT_CHOICES[+e.target.value]; saveSettings(settings); applyLook();
  });
  $('selTap').addEventListener('change', (e) => {
    settings.multitapMs = TAP_CHOICES[+e.target.value]; saveSettings(settings);
  });
  $('selMode').addEventListener('change', (e) => {
    settings.startMode = +e.target.value; saveSettings(settings);
  });
  $('chkToolbar').addEventListener('change', (e) => {
    settings.showToolbar = e.target.checked; saveSettings(settings); applyLook();
  });
  $('chkStatus').addEventListener('change', (e) => {
    settings.showStatus = e.target.checked; saveSettings(settings); applyLook();
  });

  $('btnDefaults').addEventListener('click', () => {
    const lang = settings.language;      // 언어는 되돌리지 않는다
    settings = { ...DEFAULTS, language: lang };
    saveSettings(settings);
    applyLook();
    fillSettingsSelects();
  });

  $('btnSettingsClose').addEventListener('click', closeModals);
  $('btnHelpClose').addEventListener('click', closeModals);
  $('btnAboutClose').addEventListener('click', closeModals);

  for (const id of MODALS) {
    $(id).addEventListener('click', (e) => { if (e.target.id === id) closeModals(); });
  }

  $('filePicker').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // BOM 을 뗀다
    call('setText', text);
    e.target.value = '';
  });
}

async function boot() {
  wireUp();
  applyLook();
  applyLang();

  try {
    // wasm-bindgen 이 만든 조각이 .wasm 을 받아 이어 준다.
    // 서버가 MIME 형식을 몰라 스트리밍이 안 되면 스스로 통째로 받는다.
    await init();
  } catch (err) {
    $('loading').innerHTML =
      '<p>엔진을 불러오지 못했습니다.<br>' +
      'chunjiin_wasm_bg.wasm 이 같은 폴더에 있는지 보세요.</p>';
    console.error(err);
    return;
  }

  ready = true;
  $('loading').hidden = true;
  call('setMode', settings.startMode);
  editor.focus();
}

boot();
