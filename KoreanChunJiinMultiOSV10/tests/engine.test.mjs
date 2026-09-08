/*
 * engine.test.mjs - 천지인 오토마타 회귀 시험
 *
 * KoreanChunJiInC++/tests/test_engine.c 를 그대로 옮긴 것이다.
 * GUI 없이 엔진만 돌려서 키 시퀀스와 결과 문자열을 비교한다.
 *
 *   node tests/engine.test.mjs         항목마다 PASS/FAIL 을 찍고 마지막에 요약
 *   node tests/engine.test.mjs -q      실패한 항목과 요약만
 *   node tests/engine.test.mjs -h      도움말
 *
 * 키 시퀀스 문법
 *   0~9   키 0~9            a  키 10 (ㅇㅁ)      b  키 11 (? !)
 *   _     스페이스          <  백스페이스        |  연타 순환 끊기
 *   !     조합 확정         ~  전체 지우기       /  줄바꿈
 *   [ ]   커서 왼쪽/오른쪽  {  맨 앞으로         }  맨 뒤로
 *   H E U N S              모드: 한글/영소/영대/숫자/기호
 *   M     모드 순환
 */
import {
  KEY_COUNT,
  MAX_TEXT_LEN,
  MODE,
  chunjiinBackspace,
  chunjiinBreakMultitap,
  chunjiinClear,
  chunjiinCommit,
  chunjiinCompositionText,
  chunjiinCycleMode,
  chunjiinInsertChar,
  chunjiinKeyLabel,
  chunjiinModeName,
  chunjiinMoveCursor,
  chunjiinProcessInput,
  chunjiinReset,
  chunjiinSetCursor,
  chunjiinSetMode,
  chunjiinSpace,
  createState,
} from '../src/engine/input.js';
import {
  checkDouble,
  getUnicode,
  hangulInit,
  newHangulState,
  wcharToUtf8,
} from '../src/engine/chunjiin.js';

/* ------------------------------------------------------------------ */
/* 하네스                                                              */
/* ------------------------------------------------------------------ */

let gPass = 0;
let gFail = 0;
let gQuiet = false;
const gSections = [];
let gCur = null;

/* ------------------------------------------------------------------ */
/* 색                                                                  */
/* ------------------------------------------------------------------ */

const ANSI = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  BGREEN: '\x1b[1;32m',
  BRED: '\x1b[1;31m',
  CYAN: '\x1b[36m',
  DIM: '\x1b[90m',
};

let gColor = false;

const col = (code) => (gColor ? code : '');

/* 콘솔이 색을 받아 줄 때만 켠다. 파일로 리다이렉트하면 저절로 꺼진다. */
function initColor(want) {
  gColor = false;
  if (want === 0) return;
  if (want === 2) { gColor = true; return; }
  if (process.env.NO_COLOR) return;
  gColor = Boolean(process.stdout.isTTY);
}

/* 출력 폭 (한글/기호는 2칸) */
function dispWidth(s) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    w += (c >= 0x1100 && c <= 0x115f)
      || (c >= 0x2e80 && c <= 0xa4cf)
      || (c >= 0xac00 && c <= 0xd7a3)
      || (c >= 0xf900 && c <= 0xfaff)
      || (c >= 0xff00 && c <= 0xff60)
      || (c >= 0xffe0 && c <= 0xffe6) ? 2 : 1;
  }
  return w;
}

const padded = (s, width) => s + ' '.repeat(Math.max(0, width - dispWidth(s)));

function section(name) {
  gCur = { name, pass: 0, fail: 0 };
  gSections.push(gCur);
  if (!gQuiet) console.log(`\n${col(ANSI.CYAN)}[${name}]${col(ANSI.RESET)}`);
}

/* 눈에 보이도록 제어문자를 바꿔 찍는다 */
const show = (s) => s.replace(/\n/g, '\\n');

/* 항목 하나의 결과를 찍는다. ok 면 통과. */
function report(name, seq, got, want, ok) {
  if (ok) {
    gPass++;
    if (gCur) gCur.pass++;
    if (gQuiet) return;
    console.log(`  ${col(ANSI.GREEN)}[PASS]${col(ANSI.RESET)} `
      + `${padded(name, 18)}${padded(show(seq), 24)}-> ${show(got)}`);
    return;
  }

  gFail++;
  if (gCur) gCur.fail++;
  if (gQuiet) console.log(`${col(ANSI.CYAN)}[${gCur ? gCur.name : ''}]${col(ANSI.RESET)}`);
  console.log(`  ${col(ANSI.BRED)}[FAIL]${col(ANSI.RESET)} `
    + `${padded(name, 18)}${padded(show(seq), 24)}-> ${padded(show(got), 16)}`
    + `${col(ANSI.RED)}기대: ${show(want)}${col(ANSI.RESET)}`);
}

function printSummary() {
  const LINE = '========================================================';
  const THIN = '--------------------------------------------------------';
  const total = gPass + gFail;

  console.log(`\n${col(ANSI.CYAN)}${LINE}${col(ANSI.RESET)}`);
  console.log(' 시험 요약');
  console.log(`${col(ANSI.DIM)}${THIN}${col(ANSI.RESET)}`);

  for (const s of gSections) {
    const n = s.pass + s.fail;
    console.log(`  ${padded(s.name, 26)}`
      + `${String(s.pass).padStart(4)}/${String(n).padEnd(4)}  `
      + `${col(s.fail ? ANSI.RED : ANSI.GREEN)}${s.fail ? 'FAIL' : 'PASS'}${col(ANSI.RESET)}`);
  }

  console.log(`${col(ANSI.DIM)}${THIN}${col(ANSI.RESET)}`);
  console.log(`  전체 시험 항목   ${String(total).padStart(4)} 개   (구역 ${gSections.length} 개)`);
  console.log(`  통과             ${col(ANSI.GREEN)}${String(gPass).padStart(4)} 개${col(ANSI.RESET)}`
    + `   (${total ? Math.floor((gPass * 100) / total) : 100}%)`);
  console.log(`  실패             ${col(gFail ? ANSI.RED : ANSI.DIM)}${String(gFail).padStart(4)} 개${col(ANSI.RESET)}`);
  console.log(`${col(ANSI.DIM)}${THIN}${col(ANSI.RESET)}`);

  if (gFail === 0) {
    console.log(`  결과   ${col(ANSI.BGREEN)} PASS ${col(ANSI.RESET)}   ${total}개 항목 모두 통과`);
  } else {
    console.log(`  결과   ${col(ANSI.BRED)} FAIL ${col(ANSI.RESET)}   ${total}개 중 ${gFail}개 실패`);
  }
  console.log(`${col(ANSI.CYAN)}${LINE}${col(ANSI.RESET)}`);
}

/* ------------------------------------------------------------------ */
/* 키 시퀀스 실행                                                      */
/* ------------------------------------------------------------------ */

function runKeys(st, seq) {
  for (const p of seq) {
    switch (p) {
      case 'a': chunjiinProcessInput(st, 10); break;
      case 'b': chunjiinProcessInput(st, 11); break;
      case '_': chunjiinSpace(st); break;
      case '<': chunjiinBackspace(st); break;
      case '|': chunjiinBreakMultitap(st); break;
      case '!': chunjiinCommit(st); break;
      case '~': chunjiinClear(st); break;
      case '/': chunjiinInsertChar(st, '\n'); break;
      case '[': chunjiinMoveCursor(st, -1); break;
      case ']': chunjiinMoveCursor(st, 1); break;
      case '{': chunjiinSetCursor(st, 0); break;
      case '}': chunjiinSetCursor(st, st.text.length); break;
      case 'H': chunjiinSetMode(st, MODE.HANGUL); break;
      case 'E': chunjiinSetMode(st, MODE.ENGLISH); break;
      case 'U': chunjiinSetMode(st, MODE.UPPER_ENGLISH); break;
      case 'N': chunjiinSetMode(st, MODE.NUMBER); break;
      case 'S': chunjiinSetMode(st, MODE.SPECIAL); break;
      case 'M': chunjiinCycleMode(st); break;
      default:
        if (p >= '0' && p <= '9') chunjiinProcessInput(st, p.charCodeAt(0) - 48);
        break;
    }
  }
}

/* 시퀀스를 돌리고 조합을 확정한 뒤 버퍼를 비교한다. */
function expect(name, seq, want) {
  const st = createState();
  runKeys(st, seq);
  chunjiinCommit(st);
  report(name, seq, st.text, want, st.text === want);
}

/* 확정하지 않고, 조합 중인 모습 그대로 비교한다. */
function expectLive(name, seq, want) {
  const st = createState();
  runKeys(st, seq);
  report(name, seq, st.text, want, st.text === want);
}

/* 커서 위치까지 확인한다. */
function expectCursor(name, seq, want, wantCursor) {
  const st = createState();
  runKeys(st, seq);
  const got = `${st.text} @${st.cursorPos}`;
  const exp = `${want} @${wantCursor}`;
  report(name, seq, got, exp, got === exp);
}

/* 상태 표시줄에 나오는 조합 문자열을 확인한다. */
function expectComp(name, seq, want) {
  const st = createState();
  runKeys(st, seq);
  const got = chunjiinCompositionText(st, 64);
  report(name, seq, got, want, got === want);
}

/* 모드 이름을 확인한다. */
function expectMode(name, seq, want) {
  const st = createState();
  runKeys(st, seq);
  const got = chunjiinModeName(st);
  report(name, seq, got, want, got === want);
}

/*
 * 버튼에 적힌 글자와 실제로 들어가는 글자가 맞는지 확인한다.
 * 키를 한 번 눌렀을 때 나오는 문자는 라벨의 첫 글자여야 한다.
 */
function checkLabels(modeSeq, name) {
  for (let key = 0; key < KEY_COUNT; key++) {
    const st = createState();
    runKeys(st, modeSeq);
    const label = chunjiinKeyLabel(st, key);
    chunjiinProcessInput(st, key);
    chunjiinCommit(st);
    const want = label[0];
    report(`${name} 키${key}`, modeSeq, st.text, want, st.text === want);
  }
}

/* ------------------------------------------------------------------ */
/* 표로 도는 시험들                                                    */
/* ------------------------------------------------------------------ */

/*
 * 모음 전이표 전수 확인.
 * 어떤 모음 상태에서 ㅣ / · / ㅡ 를 눌렀을 때 나와야 하는 결과를
 * 오토마타와 따로 적어 두고 비교한다.
 */
const VOWEL_STEPS = [
  /* name    seq        +ㅣ      +·       +ㅡ   */
  ['빈칸',   '',        'ㅣ',    '·',     'ㅡ'],
  ['·',      '1',       'ㅓ',    '‥',     'ㅗ'],
  ['‥',      '11',      'ㅕ',    '·',     'ㅛ'],
  ['ㅣ',     '0',       'ㅣㅣ',  'ㅏ',    'ㅣㅡ'],
  ['ㅡ',     '2',       'ㅢ',    'ㅜ',    'ㅡㅡ'],
  ['ㅏ',     '01',      'ㅐ',    'ㅑ',    'ㅏㅡ'],
  ['ㅑ',     '011',     'ㅒ',    'ㅏ',    'ㅑㅡ'],
  ['ㅓ',     '10',      'ㅔ',    'ㅕ',    'ㅓㅡ'],
  ['ㅕ',     '110',     'ㅖ',    'ㅓ',    'ㅕㅡ'],
  ['ㅗ',     '12',      'ㅚ',    'ㅛ',    'ㅗㅡ'],
  ['ㅛ',     '112',     'ㅛㅣ',  'ㅗ',    'ㅛㅡ'],
  ['ㅜ',     '21',      'ㅟ',    'ㅠ',    'ㅜㅡ'],
  ['ㅠ',     '211',     'ㅝ',    'ㅜ',    'ㅠㅡ'],
  ['ㅚ',     '120',     'ㅚㅣ',  'ㅘ',    'ㅚㅡ'],
  ['ㅘ',     '1201',    'ㅙ',    'ㅘ·',   'ㅘㅡ'],
  ['ㅝ',     '2110',    'ㅞ',    'ㅝ·',   'ㅝㅡ'],
  ['ㅐ',     '010',     'ㅐㅣ',  'ㅐ·',   'ㅐㅡ'],
  ['ㅒ',     '0110',    'ㅒㅣ',  'ㅒ·',   'ㅒㅡ'],
  ['ㅔ',     '100',     'ㅔㅣ',  'ㅔ·',   'ㅔㅡ'],
  ['ㅖ',     '1100',    'ㅖㅣ',  'ㅖ·',   'ㅖㅡ'],
  ['ㅙ',     '12010',   'ㅙㅣ',  'ㅙ·',   'ㅙㅡ'],
  ['ㅞ',     '21100',   'ㅞㅣ',  'ㅞ·',   'ㅞㅡ'],
  ['ㅟ',     '210',     'ㅟㅣ',  'ㅟ·',   'ㅟㅡ'],
  ['ㅢ',     '20',      'ㅢㅣ',  'ㅢ·',   'ㅢㅡ'],
];

function testVowelTable() {
  const KEYS = ['0', '1', '2'];
  const MARKS = ['+ㅣ', '+·', '+ㅡ'];

  section('모음 전이표 전수');
  for (const [name, seq, byI, byDot, byEu] of VOWEL_STEPS) {
    const want = [byI, byDot, byEu];
    for (let k = 0; k < 3; k++) expect(`${name}${MARKS[k]}`, seq + KEYS[k], want[k]);
  }
}

/* 모음마다 백스페이스 한 번이 어디로 돌아가는지 */
function testVowelBackspace() {
  const BACK = [
    ['ㅣ<', '0<', ''], ['ㅡ<', '2<', ''],
    ['·<', '1<', ''], ['‥<', '11<', '·'],
    ['ㅏ<', '01<', 'ㅣ'], ['ㅑ<', '011<', 'ㅏ'],
    ['ㅐ<', '010<', 'ㅏ'], ['ㅒ<', '0110<', 'ㅑ'],
    ['ㅓ<', '10<', '·'], ['ㅕ<', '110<', 'ㅓ'],
    ['ㅔ<', '100<', 'ㅓ'], ['ㅖ<', '1100<', 'ㅕ'],
    ['ㅗ<', '12<', '·'], ['ㅛ<', '112<', 'ㅗ'],
    ['ㅚ<', '120<', 'ㅗ'], ['ㅘ<', '1201<', 'ㅚ'],
    ['ㅙ<', '12010<', 'ㅘ'], ['ㅜ<', '21<', 'ㅡ'],
    ['ㅠ<', '211<', 'ㅜ'], ['ㅟ<', '210<', 'ㅜ'],
    ['ㅝ<', '2110<', 'ㅠ'], ['ㅞ<', '21100<', 'ㅝ'],
    ['ㅢ<', '20<', 'ㅡ'],
  ];

  section('모음 백스페이스');
  for (const [name, seq, want] of BACK) expect(name, seq, want);
}

/* 초성 ㄱ 에 모음 21개를 붙여 본다. getUnicode 의 중성 자리 계산 확인. */
function testSyllableMatrix() {
  const CELLS = [
    ['가', '301', '가'], ['개', '3010', '개'],
    ['갸', '3011', '갸'], ['걔', '30110', '걔'],
    ['거', '310', '거'], ['게', '3100', '게'],
    ['겨', '3110', '겨'], ['계', '31100', '계'],
    ['고', '312', '고'], ['과', '31201', '과'],
    ['괘', '312010', '괘'], ['괴', '3120', '괴'],
    ['교', '3112', '교'], ['구', '321', '구'],
    ['궈', '32110', '궈'], ['궤', '321100', '궤'],
    ['귀', '3210', '귀'], ['규', '3211', '규'],
    ['그', '32', '그'], ['긔', '320', '긔'],
    ['기', '30', '기'],
  ];

  section('ㄱ + 모음 21자');
  for (const [name, seq, want] of CELLS) expect(name, seq, want);
}

/* 받침 16개가 모두 다음 글자로 넘어가는지 */
function testLinkingAll() {
  const LINK = [
    ['각+ㅏ', '301301', '가가'], ['갂+ㅏ', '30133301', '가까'],
    ['간+ㅏ', '301401', '가나'], ['갇+ㅏ', '301501', '가다'],
    ['갈+ㅏ', '3014401', '가라'], ['감+ㅏ', '301aa01', '가마'],
    ['갑+ㅏ', '301601', '가바'], ['갓+ㅏ', '301701', '가사'],
    ['갔+ㅏ', '30177701', '가싸'], ['강+ㅏ', '301a01', '가아'],
    ['갖+ㅏ', '301801', '가자'], ['갗+ㅏ', '3018801', '가차'],
    ['갘+ㅏ', '3013301', '가카'], ['같+ㅏ', '3015501', '가타'],
    ['갚+ㅏ', '3016601', '가파'], ['갛+ㅏ', '3017701', '가하'],
  ];

  section('홑받침 연음 전수');
  for (const [name, seq, want] of LINK) expect(name, seq, want);
}

/* 겹받침은 둘째 자음만 넘어간다 */
function testLinkingDouble() {
  const LINK = [
    ['갃+ㅏ', '3013701', '각사'], ['갅+ㅏ', '3014801', '간자'],
    ['갆+ㅏ', '30147701', '간하'], ['갉+ㅏ', '30144301', '갈가'],
    ['갊+ㅏ', '30144aa01', '갈마'], ['갋+ㅏ', '30144601', '갈바'],
    ['갌+ㅏ', '30144701', '갈사'], ['갍+ㅏ', '301445501', '갈타'],
    ['갎+ㅏ', '301446601', '갈파'], ['갏+ㅏ', '301447701', '갈하'],
    ['값+ㅏ', '3016701', '갑사'],
  ];

  section('겹받침 연음 전수');
  for (const [name, seq, want] of LINK) expect(name, seq, want);
}

/* 겹받침에서 백스페이스 한 번이면 홑받침으로 돌아온다 */
function testDoubleBackspace() {
  const BACK = [
    ['갃<', '30137<', '각'], ['갅<', '30148<', '간'],
    ['갆<', '301477<', '간'], ['갉<', '301443<', '갈'],
    ['갊<', '30144aa<', '갈'], ['갋<', '301446<', '갈'],
    ['갌<', '301447<', '갈'], ['갍<', '3014455<', '갈'],
    ['갎<', '3014466<', '갈'], ['갏<', '3014477<', '갈'],
    ['값<', '30167<', '갑'],
  ];

  section('겹받침 백스페이스');
  for (const [name, seq, want] of BACK) expect(name, seq, want);
}

/* ------------------------------------------------------------------ */
/* 엔진 핵심 함수 직접 확인                                            */
/* ------------------------------------------------------------------ */

function testCheckDouble() {
  const PAIRS = [
    ['ㄱ', 'ㅅ', 'ㄳ'], ['ㄴ', 'ㅈ', 'ㄵ'], ['ㄴ', 'ㅎ', 'ㄶ'],
    ['ㄹ', 'ㄱ', 'ㄺ'], ['ㄹ', 'ㅁ', 'ㄻ'], ['ㄹ', 'ㅂ', 'ㄼ'],
    ['ㄹ', 'ㅅ', 'ㄽ'], ['ㄹ', 'ㅌ', 'ㄾ'], ['ㄹ', 'ㅍ', 'ㄿ'],
    ['ㄹ', 'ㅎ', 'ㅀ'], ['ㅂ', 'ㅅ', 'ㅄ'],
    ['ㄱ', 'ㄱ', ''], ['ㄴ', 'ㅅ', ''], ['ㄹ', 'ㄴ', ''],
    ['ㅁ', 'ㅅ', ''], ['ㅅ', 'ㅅ', ''], ['ㅇ', 'ㄱ', ''],
  ];

  section('checkDouble');
  for (const [a, b, want] of PAIRS) {
    const got = checkDouble(a, b);
    report(`${a} + ${b}`, want ? '겹받침' : '안 붙음',
      got || '(없음)', want || '(없음)', got === want);
  }
}

function testWcharToUtf8() {
  const CASES = [
    ['빈 문자열', '', 0, ''],
    ['ASCII', 'A', 8, 'A'],
    ['한 글자', '가', 8, '가'],
    ['여러 글자', '가나다', 8, '가나다'],
    ['길이 제한', '가나다', 2, '가나'],
    ['섞임', 'a가1!', 8, 'a가1!'],
    ['낱자', 'ㄱㅏ', 8, 'ㄱㅏ'],
  ];

  section('wcharToUtf8');
  for (const [name, src, maxLen, want] of CASES) {
    const got = wcharToUtf8(src, maxLen);
    report(name, '직접 호출', got || '(빈칸)', want || '(빈칸)', got === want);
  }
}

function testGetUnicode() {
  const CASES = [
    ['빈 상태', '', '', '', 0],
    ['초성만 ㄱ', 'ㄱ', '', '', 0x3131],
    ['초성만 ㅎ', 'ㅎ', '', '', 0x314e],
    ['중성만 ㅏ', '', 'ㅏ', '', 0x314f],
    ['중성만 ㅣ', '', 'ㅣ', '', 0x3163],
    ['아래아 중간', 'ㄱ', '·', '', 0x3131],
    ['가', 'ㄱ', 'ㅏ', '', 0xac00],
    ['간', 'ㄱ', 'ㅏ', 'ㄴ', 0xac04],
    ['힣', 'ㅎ', 'ㅣ', 'ㅎ', 0xd7a3],
  ];

  section('getUnicode');
  for (const [name, cho, jung, jong, want] of CASES) {
    const h = newHangulState();
    hangulInit(h);
    h.chosung = cho;
    h.jungsung = jung;
    h.jongsung = jong;
    const code = getUnicode(h, jong);
    const hex = (v) => `U+${v.toString(16).toUpperCase().padStart(4, '0')}`;
    report(name, '직접 호출', hex(code), hex(want), code === want);
  }
}

/* ------------------------------------------------------------------ */
/* 시험 항목                                                           */
/* ------------------------------------------------------------------ */

function testVowels() {
  section('모음 21자');
  expect('ㅏ', '01', 'ㅏ');
  expect('ㅐ', '010', 'ㅐ');
  expect('ㅑ', '011', 'ㅑ');
  expect('ㅒ', '0110', 'ㅒ');
  expect('ㅓ', '10', 'ㅓ');
  expect('ㅔ', '100', 'ㅔ');
  expect('ㅕ', '110', 'ㅕ');
  expect('ㅖ', '1100', 'ㅖ');
  expect('ㅗ', '12', 'ㅗ');
  expect('ㅘ', '1201', 'ㅘ');
  expect('ㅙ', '12010', 'ㅙ');
  expect('ㅚ', '120', 'ㅚ');
  expect('ㅛ', '112', 'ㅛ');
  expect('ㅜ', '21', 'ㅜ');
  expect('ㅝ', '2110', 'ㅝ');
  expect('ㅞ', '21100', 'ㅞ');
  expect('ㅟ', '210', 'ㅟ');
  expect('ㅠ', '211', 'ㅠ');
  expect('ㅡ', '2', 'ㅡ');
  expect('ㅢ', '20', 'ㅢ');
  expect('ㅣ', '0', 'ㅣ');
}

function testVowelCycles() {
  section('모음 순환·경계');
  expect('ㅏㅑㅏ', '0111', 'ㅏ');      /* ㅣ·· 다음 · 는 되돌아온다 */
  expect('ㅓㅕㅓ', '1101', 'ㅓ');
  expect('ㅗㅛㅗ', '1211', 'ㅗ');
  expect('ㅜㅠㅜ', '2111', 'ㅜ');
  expect('ㅛ뒤ㅡ', '1122', 'ㅛㅡ');    /* ㅛ 뒤 ㅡ 는 새 글자 */
  expect('ㅣㅣ', '00', 'ㅣㅣ');
  expect('ㅡㅡ', '22', 'ㅡㅡ');
  expect('ㅐ뒤ㅣ', '0100', 'ㅐㅣ');
  expect('ㅢ뒤ㅣ', '200', 'ㅢㅣ');
  expectLive('아래아만', '1', '·');
  expectLive('아래아둘', '11', '‥');
  expectLive('아래아셋', '111', '·');  /* · ‥ 다음은 다시 · */
  expect('매달린점', '1', '·');        /* 확정해도 그대로 둔다 */
  expect('매달린점2', '31', 'ㄱ·');
}

function testChosung() {
  section('초성 19자');
  expect('가', '301', '가');
  expect('까', '33301', '까');
  expect('나', '401', '나');
  expect('다', '501', '다');
  expect('따', '55501', '따');
  expect('라', '4401', '라');
  expect('마', 'aa01', '마');
  expect('바', '601', '바');
  expect('빠', '66601', '빠');
  expect('사', '701', '사');
  expect('싸', '77701', '싸');
  expect('아', 'a01', '아');
  expect('자', '801', '자');
  expect('짜', '88801', '짜');
  expect('차', '8801', '차');
  expect('카', '3301', '카');
  expect('타', '5501', '타');
  expect('파', '6601', '파');
  expect('하', '7701', '하');
}

function testJongsung() {
  section('홑받침 16자');
  expect('각', '3013', '각');
  expect('갂', '301333', '갂');
  expect('간', '3014', '간');
  expect('갇', '3015', '갇');
  expect('갈', '30144', '갈');
  expect('감', '301aa', '감');
  expect('갑', '3016', '갑');
  expect('갓', '3017', '갓');
  expect('갔', '301777', '갔');
  expect('강', '301a', '강');
  expect('갖', '3018', '갖');
  expect('갗', '30188', '갗');
  expect('갘', '30133', '갘');
  expect('같', '30155', '같');
  expect('갚', '30166', '갚');
  expect('갛', '30177', '갛');
}

function testDoubleJongsung() {
  section('겹받침 11자');
  expect('ㄳ 갃', '30137', '갃');
  expect('ㄵ 갅', '30148', '갅');
  expect('ㄶ 갆', '301477', '갆');
  expect('ㄺ 갉', '301443', '갉');
  expect('ㄻ 갊', '30144aa', '갊');
  expect('ㄼ 갋', '301446', '갋');
  expect('ㄽ 갌', '301447', '갌');
  expect('ㄾ 갍', '3014455', '갍');
  expect('ㄿ 갎', '3014466', '갎');
  expect('ㅀ 갏', '3014477', '갏');
  expect('ㅄ 값', '30167', '값');
}

function testConsonantCycle() {
  section('자음 순환');
  expect('ㄱㅋㄲ', '3|33|333', 'ㄱㅋㄲ');
  expect('ㄴㄹ', '4|44', 'ㄴㄹ');
  expect('ㄷㅌㄸ', '5|55|555', 'ㄷㅌㄸ');
  expect('ㅂㅍㅃ', '6|66|666', 'ㅂㅍㅃ');
  expect('ㅅㅎㅆ', '7|77|777', 'ㅅㅎㅆ');
  expect('ㅈㅊㅉ', '8|88|888', 'ㅈㅊㅉ');
  expect('ㅇㅁ', 'a|aa', 'ㅇㅁ');
  expect('한바퀴', '3333', 'ㄱ');
  expect('두바퀴', '444', 'ㄴ');
  expect('끊긴순환', '3|3', 'ㄱㄱ');
}

function testJongsungLimits() {
  section('받침 제한');
  expect('ㄸ받침불가', '301555', '갇');   /* ㄸ 는 건너뛴다 */
  expect('ㅃ받침불가', '301666', '갑');
  expect('ㅉ받침불가', '301888', '갖');
  expect('받침순환', '30177', '갛');
  expect('초성없이', '013', 'ㅏㄱ');      /* 모음만 뒤 자음은 새 글자 */
  expect('초성없이2', '13', '·ㄱ');       /* 매달린 아래아도 그대로 남는다 */
  expect('자음셋', '3|4|5', 'ㄱㄴㄷ');
}

function testLinking() {
  section('연음');
  expect('가나', '301401', '가나');
  expect('악아', 'a013a01', '악아');
  expect('갑사', '3016701', '갑사');      /* 겹받침에서 둘째만 넘어간다 */
  expect('없다', 'a1067|501', '없다');
  expect('발음', '60144a2aa', '발음');
  expect('연음뒤받침', '3014014', '가난');
}

function testBackspace() {
  section('백스페이스');
  expect('가->기', '301<', '기');
  expect('기->ㄱ', '301<<', 'ㄱ');
  expect('ㄱ->없음', '301<<<', '');
  expect('값->갑', '30167<', '갑');
  expect('갑->가', '30167<<', '가');
  expect('간->가', '3014<', '가');
  expectLive('아래아', '311<', 'ㄱ·');    /* ‥ -> · */
  expect('아래아0', '1<', '');
  expect('확정뒤', '301_<', '가');
  expect('두글자', '301401<', '가니');    /* 조합 중인 ㅏ 만 되돌린다 */
  expect('빈버퍼', '<<<', '');
  expect('ㅘ되돌림', '1201<', 'ㅚ');
  expect('ㅙ되돌림', '12010<', 'ㅘ');
}

function testDotDisplay() {
  section('아래아 표시');
  expectLive('점1', '1', '·');
  expectLive('점2', '11', '‥');
  expectLive('ㄱ점1', '31', 'ㄱ·');
  expectLive('ㄱ점2', '311', 'ㄱ‥');
  expectLive('ㅇ점1', 'a1', 'ㅇ·');
  expectLive('점뒤모음', '311<0', '거');
  expectLive('점에서완성', '312', '고');
  expect('점뒤자음', '314', 'ㄱ·ㄴ');
}

function testPunctuation() {
  section('문장부호 키');
  expect('마침표', '9', '.');
  expect('쉼표', '99', ',');
  expect('순환복귀', '999', '.');
  expect('두마침표', '9|9', '..');
  expect('물음표', 'b', '?');
  expect('느낌표', 'bb', '!');
  expect('두물음표', 'b|b', '??');
  expect('가.', '3019', '가.');
  expect('가?', '301b', '가?');
  expect('섞기', '9|b', '.?');
  expect('부호뒤한글', '9|301', '.가');
}

function testEditing() {
  section('편집·커서');
  expect('띄어쓰기', '301_401', '가 나');
  expect('줄바꿈', '301/401', '가\n나');
  expect('전체지우기', '301401~', '');
  expect('지운뒤입력', '301~401', '나');
  expectCursor('커서끝', '301401', '가나', 2);
  expectCursor('커서왼쪽', '301401[', '가나', 1);
  expectCursor('커서맨앞', '301401{', '가나', 0);
  expectCursor('커서맨뒤', '301401{}', '가나', 2);
  expectCursor('커서한계', '301[[[[', '가', 0);
  expect('중간삽입', '301401[701', '가사나');
  expect('맨앞삽입', '301401{701', '사가나');
  expect('확정반복', '301!!!', '가');
}

function testModes() {
  section('모드 전환');
  expectMode('기본', '', '한글');
  expectMode('영소', 'E', '영문 abc');
  expectMode('영대', 'U', '영문 ABC');
  expectMode('숫자', 'N', '숫자 123');
  expectMode('기호', 'S', '기호 !@#');
  expectMode('순환1', 'M', '영문 abc');
  expectMode('순환5', 'MMMMM', '한글');
  expect('모드전환확정', '301M', '가');
}

/* 알파벳 26자를 소문자 · 대문자로 모두 눌러 본다 */
function testEnglishAlphabet() {
  const SETS = ['abc', 'def', 'ghi', 'jkl', 'mno', 'pqr', 'stu', 'vwx', 'yz'];

  section('영문 26자 전수');
  for (let upper = 0; upper < 2; upper++) {
    for (let key = 0; key < 9; key++) {
      const n = SETS[key].length;
      for (let i = 0; i < n; i++) {
        const seq = (upper ? 'U' : 'E') + String(key).repeat(i + 1);
        const want = upper ? SETS[key][i].toUpperCase() : SETS[key][i];
        expect(want, seq, want);
      }
    }
  }
}

function testEnglish() {
  section('영문 입력');
  expect('a', 'E0', 'a');
  expect('b', 'E00', 'b');
  expect('c', 'E000', 'c');
  expect('순환복귀', 'E0000', 'a');
  expect('adg', 'E012', 'adg');
  expect('ab', 'E0|00', 'ab');
  expect('pqr', 'E5|55|555', 'pqr');
  expect('stu', 'E6|66|666', 'stu');
  expect('vwx', 'E7|77|777', 'vwx');
  expect('yz', 'E8|88', 'yz');
  expect('두글자키', 'E888', 'y');        /* yz 는 두 개라 세 번이면 되돌아온다 */
  expect('hello', 'E22|11|333|333|444', 'hello');
  expect('world', 'E77|444|555|333|1', 'world');
  expect('대문자A', 'U0', 'A');
  expect('대문자ABC', 'U0|00|000', 'ABC');
  expect('대문자Z', 'U88', 'Z');
  expect('한영섞기', '301E0', '가a');
}

function testEnglishSymbols() {
  section('영문 기호 3키');
  expect('마침표', 'E9', '.');
  expect('쉼표', 'E99', ',');
  expect('물음표', 'E999', '?');
  expect('순환복귀', 'E9999', '.');
  expect('느낌표', 'Ea', '!');
  expect('작은따옴표', 'Eaa', "'");
  expect('큰따옴표', 'Eaaa', '"');
  expect('하이픈', 'Eb', '-');
  expect('콜론', 'Ebb', ':');
  expect('앳', 'Ebbb', '@');
  expect('기호 첫자', 'E9|a|b', '.!-');
  expect('대문자기호', 'Ua|Ub', '!-');    /* 기호는 대문자 모드에서도 같다 */
  expect('문장', 'E6|66 E9', 'st.');
}

function testNumberSpecial() {
  section('숫자·기호 입력');
  expect('1', 'N0', '1');
  expect('123', 'N012', '123');
  expect('숫자전체', 'N0123456789ab', '123456789*0#');
  expect('숫자연타', 'N00', '11');
  expect('기호 첫자', 'S0123456789ab', ".?'-+/([{<@※");
  expect('기호 연타', 'S00', ',');
  expect('기호 세번', 'S000', ':');
  expect('기호 순환', 'S0000', '.');
  expect('기호 둘', 'S0|0', '..');
  expect('괄호', 'S6|66', '()');
  expect('역슬래시', 'S55', '\\');
  expect('원화', 'Sa|aa|aaa', '@$₩');
  expect('특수기호', 'Sb|bb|bbb', '※…・');
  expect('한글뒤숫자', '301N0', '가1');
}

function testLabels() {
  section('라벨-입력 일치');
  checkLabels('H', '한글');
  checkLabels('E', '영소');
  checkLabels('U', '영대');
  checkLabels('N', '숫자');
  checkLabels('S', '기호');
}

function testCompositionText() {
  section('조합 상태 표시');
  expectComp('빈상태', '', '');
  expectComp('초성만', '3', 'ㄱ + - + -');
  expectComp('초중성', '301', 'ㄱ + ㅏ + -');
  expectComp('받침', '3014', 'ㄱ + ㅏ + ㄴ');
  expectComp('겹받침', '30167', 'ㄱ + ㅏ + ㅂㅅ');
  expectComp('아래아', '31', 'ㄱ + · + -');
  expectComp('중성만', '01', '- + ㅏ + -');
  expectComp('확정후', '301!', '');
  expectComp('영문', 'E0', 'a');
}

function testEdgeCases() {
  section('경계·예외');

  /* 범위 밖 키는 무시된다 */
  let st = createState();
  chunjiinProcessInput(st, -1);
  chunjiinProcessInput(st, 12);
  chunjiinProcessInput(st, 99);
  report('범위밖 키', '-1,12,99', st.text, '', st.text === '');

  /* 버퍼가 가득 차도 넘치지 않는다 */
  st = createState();
  for (let i = 0; i < MAX_TEXT_LEN + 100; i++) chunjiinInsertChar(st, 'x');
  const okLen = st.text.length === MAX_TEXT_LEN - 1 && st.cursorPos <= MAX_TEXT_LEN - 1;
  report('버퍼 한계', 'x * 4195',
    `len=${st.text.length} cur=${st.cursorPos}`, 'len=4095 cur<=4095', okLen);

  /* 빈 상태에서 확정/백스페이스/커서이동을 해도 멀쩡하다 */
  st = createState();
  chunjiinCommit(st);
  chunjiinBackspace(st);
  chunjiinMoveCursor(st, -5);
  chunjiinMoveCursor(st, 5);
  chunjiinCommit(st);
  report('빈 상태 조작', 'commit/bs/move', st.text, '',
    st.text === '' && st.cursorPos === 0);

  /* reset 은 확장 필드까지 지운다 */
  st = createState();
  runKeys(st, '301477');
  chunjiinReset(st);
  const clean = st.text === '' && st.cursorPos === 0 && st.composeLen === 0
    && st.lastKey === -1 && st.prevMergeable === false;
  report('chunjiinReset', '301477 + reset', clean ? 'clean' : 'dirty', 'clean', clean);
}

/* 겹받침 되돌려 붙이기가 언제 살아 있고 언제 꺼지는지 */
function testMergeRules() {
  section('겹받침 병합 규칙');
  expect('만+ㅅ+ㅅ=많', 'aa01477', '많');
  expect('병합뒤 백스', 'aa01477<', '만');
  expect('병합뒤 연음', 'aa0147701', '만하');
  expect('연타끊기면 안됨', 'aa0147|7', '만ㅅㅅ');
  expect('모음오면 해제', 'aa014701', '만사');
  expect('부호오면 해제', 'aa01479', '만ㅅ.');
  expect('백스뒤 해제', 'aa0147<7', '만ㅅ');
  expect('커서옮기면 해제', 'aa0147{7', 'ㅅ만ㅅ');
  expect('겹받침엔 안붙음', '30167|7', '값ㅅ');    /* 이미 겹받침이면 새 글자 */
  expect('겹받침뒤 순환', '3016777', '값ㅎ');      /* 새로 난 ㅅ 이 순환한다 */
  expect('삶', '70144aa', '삶');
  expect('옳', 'a124477', '옳');
  expect('핥', '77014455', '핥');                  /* ㄷ 이 ㅌ 으로 바뀌며 병합 */
  expect('핥+한번더', '770144555', '핥ㄷ');
}

/* 편집 중 커서를 옮겨 가며 쓰는 경우 */
function testEditingMore() {
  section('편집 심화');
  expect('중간 백스', '301401[<', '나');
  expect('맨앞 백스', '301401{<', '가나');
  expect('조합중 커서이동', '301[01', 'ㅏ가');
  expect('줄바꿈 둘', '301//401', '가\n\n나');
  expect('공백 둘', '301__401', '가  나');
  expect('맨뒤로 복귀', '301401{701}301', '사가나가');
  expect('커서앞뒤', '301401[]301', '가나가');
  expect('지운뒤 커서', '301401~701', '사');
  expectCursor('조합중 커서', '301', '가', 1);
  expectCursor('겹받침 커서', '30167', '값', 1);
  expectCursor('아래아 커서', '31', 'ㄱ·', 2);
  expectCursor('공백 커서', '301_', '가 ', 2);
  expectCursor('줄바꿈 커서', '301/', '가\n', 2);
}

/* 모드를 오가며 이어 쓰는 경우 */
function testModesMore() {
  section('모드 전환 심화');
  expect('영문뒤 한글', 'E00H301', 'b가');
  expect('숫자뒤 한글', 'N012H301', '123가');
  expect('한글뒤 기호', '301S0', '가.');
  expect('영소->영대', 'E0U0', 'aA');
  expect('영대->영소', 'U0E0', 'Aa');
  expect('영문 백스', 'E00<', '');
  expect('기호 백스', 'S00<', '');
  expect('숫자 백스', 'N012<', '12');
  expect('모드순환 입력', 'MMMMM301', '가');
  expect('조합중 모드변경', '3M0', 'ㄱa');   /* ㄱ 이 확정되고 영문 a */
  expect('영문중 공백', 'E0_0', 'a a');
  expect('영문 줄바꿈', 'E0/0', 'a\na');
}

/* 표시용 API 의 경계 */
function testDisplayApi() {
  section('표시 API 경계');

  let st = createState();

  /* 범위 밖 키 라벨은 빈 문자열 */
  let label = chunjiinKeyLabel(st, -1);
  report('라벨 -1', '직접 호출', label ? '값 있음' : '(빈칸)', '(빈칸)', label === '');
  label = chunjiinKeyLabel(st, KEY_COUNT);
  report('라벨 12', '직접 호출', label ? '값 있음' : '(빈칸)', '(빈칸)', label === '');

  /* 모든 모드의 12키 라벨은 비어 있으면 안 된다 */
  let ok = true;
  for (let i = 0; i < MODE.COUNT; i++) {
    st = createState();
    chunjiinSetMode(st, i);
    for (let k = 0; k < KEY_COUNT; k++) {
      if (chunjiinKeyLabel(st, k) === '') ok = false;
    }
  }
  report('라벨 빈칸 없음', '5모드 x 12키', ok ? '모두 있음' : '빈 라벨 있음', '모두 있음', ok);

  /* 조합 문자열이 짧은 길이 제한에서도 잘려 나온다 */
  st = createState();
  runKeys(st, '30167');
  const cut = chunjiinCompositionText(st, 7);
  report('짧은 버퍼', 'outLen=7', cut, '길이 6 이하', cut.length <= 6);

  /* 길이 0 이면 아무것도 만들지 않는다 */
  const none = chunjiinCompositionText(st, 0);
  report('버퍼 0', 'outLen=0', none === '' ? '(빈칸)' : none, '(빈칸)', none === '');
}

function testWords() {
  section('낱말·문장');
  expect('안녕', 'a014|4110a', '안녕');
  expect('한글', '77014|32|44', '한글');
  expect('하세요', '77017100|a112', '하세요');
  expect('닭', '501443', '닭');
  expect('꽃', '3331288', '꽃');
  expect('많다', 'aa01477501', '많다');
  expect('않다', 'a01477501', '않다');
  expect('삶', '70144aa', '삶');
  expect('핥다', '77014455501', '핥다');
  expect('읊다', 'a244 66 66 5 01', '읊다');
  expect('옳다', 'a1244 77 5 01', '옳다');
  expect('좋아요', '81277a01a112', '좋아요');
  expect('사랑해', '7014401a77010', '사랑해');
  expect('컴퓨터', '3310aa662115510', '컴퓨터');
  expect('띄어쓰기', '55520 a10 7772 30', '띄어쓰기');
  expect('맑음', 'aa01443|a2aa', '맑음');
  expect('안녕하세요', 'a014|4110a77017100|a112', '안녕하세요');
  expect('우리나라', 'a21440 _ 4014401', '우리 나라');
  expect('가나다라', '301401 _ 5014401', '가나 다라');
  expect('반갑습니다', '6014301672640501', '반갑습니다');
  expect('감사합니다', '301aa7017701640501', '감사합니다');
  expect('한국어', '770143213a10', '한국어');
  expect('밝다', '601443501', '밝다');
  expect('앉다', 'a0148501', '앉다');
  expect('읽다', 'a0443501', '읽다');
  expect('읅', 'a2443', '읅');                /* 읽 과 중성만 다르다 */
  expect('훑다', '77214455501', '훑다');
  expect('맑음2', 'aa01443|a2aa', '맑음');
}

/* ------------------------------------------------------------------ */

function main() {
  let wantColor = 1;

  for (const arg of process.argv.slice(2)) {
    if (arg === '-q') gQuiet = true;
    else if (arg === '-v') gQuiet = false;
    else if (arg === '--no-color') wantColor = 0;
    else if (arg === '--color') wantColor = 2;
    else if (arg === '-h' || arg === '--help') {
      console.log('사용법: node tests/engine.test.mjs [-v|-q] [--no-color]\n'
        + '  (없음)      항목마다 PASS/FAIL 을 찍고 마지막에 요약한다\n'
        + '  -v          위와 같다 (명시적으로 자세히)\n'
        + '  -q          실패한 항목과 요약만 찍는다\n'
        + '  --no-color  색을 쓰지 않는다 (NO_COLOR 환경 변수도 같은 효과)');
      return 0;
    }
  }
  initColor(wantColor);

  console.log('천지인 오토마타 회귀 시험');

  testVowels();
  testVowelTable();
  testVowelBackspace();
  testSyllableMatrix();
  testVowelCycles();
  testChosung();
  testJongsung();
  testDoubleJongsung();
  testConsonantCycle();
  testJongsungLimits();
  testLinking();
  testLinkingAll();
  testLinkingDouble();
  testBackspace();
  testDoubleBackspace();
  testDotDisplay();
  testPunctuation();
  testMergeRules();
  testEditing();
  testEditingMore();
  testModes();
  testModesMore();
  testEnglishAlphabet();
  testEnglish();
  testEnglishSymbols();
  testNumberSpecial();
  testLabels();
  testCompositionText();
  testDisplayApi();
  testCheckDouble();
  testWcharToUtf8();
  testGetUnicode();
  testEdgeCases();
  testWords();

  printSummary();
  return gFail === 0 ? 0 : 1;
}

process.exit(main());
