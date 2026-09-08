/*
 * input.js - 천지인 입력 오토마타
 *
 * KoreanChunJiInC++/src/input.c 를 그대로 옮긴 것이다.
 *
 * 키 배열 (인덱스 0~11, 3열 4행)
 *
 *      ㅣ     ·      ㅡ        0  1  2
 *      ㄱㅋ   ㄴㄹ   ㄷㅌ      3  4  5
 *      ㅂㅍ   ㅅㅎ   ㅈㅊ      6  7  8
 *      . ,    ㅇㅁ   ? !       9  10 11
 *
 * 자음 키는 연타하면 순환한다(ㄱ→ㅋ→ㄲ→ㄱ...).
 * 거센소리·된소리가 모두 순환에 들어 있으므로 획추가/쌍자음 키는 두지 않고,
 * 그 자리에 문장부호 키를 둔다.
 */
import {
  KEY_COUNT,
  MAX_TEXT_LEN,
  MODE,
  SLOT,
  checkDouble,
  chunjiinInit,
  clampCursor,
  copyHangulState,
  deleteChar,
  getUnicode,
  hangulInit,
  initEngnum,
  isDotState,
  newChunjiinState,
} from './chunjiin.js';

export { KEY_COUNT, MAX_TEXT_LEN, MODE, SLOT, newChunjiinState };

/* ------------------------------------------------------------------ */
/* 키 정의                                                             */
/* ------------------------------------------------------------------ */
const KEY_I = 0;       /* ㅣ */
const KEY_DOT = 1;     /* 아래아 */
const KEY_EU = 2;      /* ㅡ */
const KEY_PUNCT1 = 9;  /* . , */
const KEY_PUNCT2 = 11; /* ? ! */

/* 자음 키의 순환 목록. 자음 키가 아니면 빈 배열. */
const CONS_CYCLE = [
  [],                       /* 0  ㅣ */
  [],                       /* 1  아래아 */
  [],                       /* 2  ㅡ */
  ['ㄱ', 'ㅋ', 'ㄲ'],       /* 3  */
  ['ㄴ', 'ㄹ'],             /* 4  */
  ['ㄷ', 'ㅌ', 'ㄸ'],       /* 5  */
  ['ㅂ', 'ㅍ', 'ㅃ'],       /* 6  */
  ['ㅅ', 'ㅎ', 'ㅆ'],       /* 7  */
  ['ㅈ', 'ㅊ', 'ㅉ'],       /* 8  */
  [],                       /* 9  . , */
  ['ㅇ', 'ㅁ'],             /* 10 */
  [],                       /* 11 ? ! */
];

/*
 * 모음 전이표.
 * from 상태에서 ㅣ / 아래아 / ㅡ 키를 눌렀을 때의 다음 상태.
 * null 이면 그 조합은 없으므로 현재 음절을 확정하고 새 음절을 시작한다.
 * prev 는 백스페이스로 한 단계 되돌릴 때의 상태.
 */
const VOWEL_RULES = [
  /* from   ㅣ      아래아  ㅡ      prev  */
  ['',     'ㅣ',   '·',    'ㅡ',   ''],
  ['·',    'ㅓ',   '‥',    'ㅗ',   ''],
  ['‥',    'ㅕ',   '·',    'ㅛ',   '·'],
  ['ㅣ',   null,   'ㅏ',   null,   ''],
  ['ㅡ',   'ㅢ',   'ㅜ',   null,   ''],
  ['ㅏ',   'ㅐ',   'ㅑ',   null,   'ㅣ'],
  ['ㅑ',   'ㅒ',   'ㅏ',   null,   'ㅏ'],
  ['ㅓ',   'ㅔ',   'ㅕ',   null,   '·'],
  ['ㅕ',   'ㅖ',   'ㅓ',   null,   'ㅓ'],
  ['ㅗ',   'ㅚ',   'ㅛ',   null,   '·'],
  ['ㅛ',   null,   'ㅗ',   null,   'ㅗ'],
  ['ㅜ',   'ㅟ',   'ㅠ',   null,   'ㅡ'],
  ['ㅠ',   'ㅝ',   'ㅜ',   null,   'ㅜ'],
  ['ㅚ',   null,   'ㅘ',   null,   'ㅗ'],
  ['ㅘ',   'ㅙ',   null,   null,   'ㅚ'],
  ['ㅝ',   'ㅞ',   null,   null,   'ㅠ'],
  ['ㅐ',   null,   null,   null,   'ㅏ'],
  ['ㅒ',   null,   null,   null,   'ㅑ'],
  ['ㅔ',   null,   null,   null,   'ㅓ'],
  ['ㅖ',   null,   null,   null,   'ㅕ'],
  ['ㅙ',   null,   null,   null,   'ㅘ'],
  ['ㅞ',   null,   null,   null,   'ㅝ'],
  ['ㅟ',   null,   null,   null,   'ㅜ'],
  ['ㅢ',   null,   null,   null,   'ㅡ'],
];

/* 받침으로 쓸 수 있는 자음 (ㄸ ㅃ ㅉ 은 불가) */
const VALID_JONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/* ------------------------------------------------------------------ */
/* 작은 도우미들                                                       */
/* ------------------------------------------------------------------ */

const isEmpty = (s) => !s;

const isValidJong = (c) => !isEmpty(c) && VALID_JONG.includes(c);

/* jong + c 가 겹받침을 이루는가 */
const canCombineJong = (jong, c) => checkDouble(jong, c) !== '';

const findVowelRule = (jung) => VOWEL_RULES.find((r) => r[0] === jung) || null;

/* 모음 전이. 불가능하면 null. */
function vowelNext(jung, key) {
  const r = findVowelRule(jung);
  if (r === null) return null;
  if (key === KEY_I) return r[1];
  if (key === KEY_DOT) return r[2];
  if (key === KEY_EU) return r[3];
  return null;
}

function vowelPrev(jung) {
  const r = findVowelRule(jung);
  return r === null ? '' : r[4];
}

const cycleLen = (key) => CONS_CYCLE[key].length;

const isConsKey = (key) => key >= 0 && key < KEY_COUNT && CONS_CYCLE[key].length > 0;

const isVowelKey = (key) => key === KEY_I || key === KEY_DOT || key === KEY_EU;

/* 현재 조합에서 "마지막으로 채워진 자음 자리"의 이름. 없으면 null. */
function consSlot(h) {
  switch (h.step) {
    case SLOT.CHOSUNG: return 'chosung';
    case SLOT.JONGSUNG: return 'jongsung';
    case SLOT.JONGSUNG2: return 'jongsung2';
    default: return null;
  }
}

/* ------------------------------------------------------------------ */
/* 텍스트 버퍼 조작                                                    */
/* ------------------------------------------------------------------ */

function textInsert(state, ch) {
  const len = state.text.length;

  if (len >= MAX_TEXT_LEN - 1) return;
  if (state.cursorPos > len) state.cursorPos = len;
  if (state.cursorPos < 0) state.cursorPos = 0;

  state.text = state.text.slice(0, state.cursorPos) + ch + state.text.slice(state.cursorPos);
  state.cursorPos++;
  clampCursor(state);
}

/* ------------------------------------------------------------------ */
/* 화면 출력 - 조합 중인 글자는 cursorPos-1 자리에서 계속 갱신된다     */
/* ------------------------------------------------------------------ */

/*
 * 조합 중인 상태를 화면에 보여줄 문자열로 만든다. 최대 2칸.
 *
 * 아래아만 찍힌 중간 상태(·, ‥)에서는 getUnicode() 가 0 을 돌려주므로
 * 아무것도 보이지 않는다. 그래서 이때는 초성(있으면)과 아래아를 직접 이어
 * "ㄱ·", "·", "‥" 처럼 눈에 보이게 만든다.
 */
function composeDisplay(h) {
  let out = '';

  if (isDotState(h.jungsung)) {
    if (!isEmpty(h.chosung)) {
      /* 초성 홀로일 때의 호환 자모를 얻기 위해 중성을 잠시 비운다 */
      const saved = h.jungsung;
      h.jungsung = '';
      const code = getUnicode(h, '');
      h.jungsung = saved;
      if (code !== 0) out += String.fromCharCode(code);
    }
    out += h.jungsung[0];   /* '·' 또는 '‥' */
    return out;
  }

  let realJong = '';
  if (!isEmpty(h.jongsung2)) {
    realJong = checkDouble(h.jongsung, h.jongsung2);
    if (realJong === '') realJong = h.jongsung;
  } else if (!isEmpty(h.jongsung)) {
    realJong = h.jongsung;
  }

  const code = getUnicode(h, realJong);
  if (code !== 0) out += String.fromCharCode(code);
  return out;
}

/*
 * 조합 중인 글자를 화면에 반영한다.
 * 직전에 그려 둔 composeLen 칸을 지우고 새로 그린다.
 */
export function writeHangul(state) {
  const shown = composeDisplay(state.hangul);

  while (state.composeLen > 0) {
    deleteChar(state);
    state.composeLen--;
  }
  for (const ch of shown) {
    const before = state.text.length;
    textInsert(state, ch);
    if (state.text.length > before) state.composeLen++;
  }
  state.hangul.flagWriting = state.composeLen > 0;
}

export function writeEngnum(state) {
  if (state.engnum === '') return;

  if (state.flagEngdelete && state.cursorPos > 0) {
    state.text = state.text.slice(0, state.cursorPos - 1)
      + state.engnum[0]
      + state.text.slice(state.cursorPos);
  } else {
    textInsert(state, state.engnum[0]);
  }
  state.flagEngdelete = true;
  state.flagInitengnum = true;
}

/* ------------------------------------------------------------------ */
/* 음절 확정                                                           */
/* ------------------------------------------------------------------ */

/*
 * 현재 조합을 버퍼에 반영하고 새 음절을 시작할 수 있는 상태로 만든다.
 *
 * 아직 모음이 되지 못한 아래아(·, ‥)도 그대로 둔다. 사용자가 그걸 남길
 * 생각이었는지 아닌지 알 수 없으므로 임의로 지우지 않는다.
 */
function commitAndStart(state) {
  writeHangul(state);
  hangulInit(state.hangul);       /* flagWriting = false -> 다음 글자는 새로 삽입 */
  state.hangul.flagAddcursor = true;
  state.composeLen = 0;           /* 이미 찍힌 칸은 확정 글자가 된다 */
  state.prevMergeable = false;
  state.lastKey = -1;
  state.tapCount = 0;
}

export function chunjiinCommit(state) {
  if (state.nowMode === MODE.HANGUL) {
    if (state.hangul.flagWriting) writeHangul(state);
    hangulInit(state.hangul);
    state.composeLen = 0;
  } else {
    initEngnum(state);
  }
  state.prevMergeable = false;
  state.lastKey = -1;
  state.tapCount = 0;
}

/* ------------------------------------------------------------------ */
/* 한글 오토마타                                                       */
/* ------------------------------------------------------------------ */

/*
 * 자음 c 를 새 음절의 초성으로 삼는다.
 * mergeable 이면 방금 확정한 음절을 기억해 둔다. 같은 키를 한 번 더 눌러
 * 겹받침이 되는 자음이 나오면 tryMergeJong() 이 도로 합친다.
 */
function startWithChosung(state, c, key, mergeable) {
  const previous = copyHangulState(state.hangul);

  commitAndStart(state);
  if (mergeable) {
    state.prevSyllable = previous;
    state.prevMergeable = true;
  }
  state.hangul.chosung = c;
  state.hangul.step = SLOT.CHOSUNG;
  state.lastKey = key;
  state.tapCount = 0;
}

/*
 * 떨어져 나온 초성을 앞 음절의 겹받침으로 되돌린다.
 * 성공하면 조합 영역이 앞 칸까지 넓어지고, 이어지는 writeHangul() 이
 * 두 칸을 지우고 합쳐진 한 글자를 그린다.
 */
function tryMergeJong(state, key) {
  const h = state.hangul;
  const prev = state.prevSyllable;
  const n = cycleLen(key);

  if (h.step !== SLOT.CHOSUNG || !isEmpty(h.jungsung)) return false;
  if (isEmpty(prev.jongsung) || !isEmpty(prev.jongsung2)) return false;

  for (let i = 1; i <= n; i++) {
    const idx = (state.tapCount + i) % n;
    const cand = CONS_CYCLE[key][idx];

    if (!canCombineJong(prev.jongsung, cand)) continue;

    state.composeLen++;             /* 앞 칸(확정된 음절)도 다시 그린다 */
    state.hangul = copyHangulState(prev);
    state.hangul.jongsung2 = cand;
    state.hangul.step = SLOT.JONGSUNG2;
    state.hangul.flagWriting = true;
    state.tapCount = idx;
    return true;
  }
  return false;
}

/* 같은 자음 키 연타: 현재 자리에서 다음 후보로 순환한다. 성공하면 true. */
function cycleConsonant(state, key) {
  const h = state.hangul;
  const slot = consSlot(h);
  const n = cycleLen(key);

  if (slot === null || isEmpty(h[slot]) || n === 0) return false;

  /* 다음 후보부터 한 바퀴 돌면서 이 자리에 넣을 수 있는 것을 찾는다 */
  for (let i = 1; i <= n; i++) {
    const idx = (state.tapCount + i) % n;
    const cand = CONS_CYCLE[key][idx];

    if (n > 1 && cand === h[slot]) continue;
    if (h.step === SLOT.JONGSUNG && !isValidJong(cand)) continue;
    if (h.step === SLOT.JONGSUNG2 && !canCombineJong(h.jongsung, cand)) continue;

    h[slot] = cand;
    state.tapCount = idx;
    h.flagDoubled = idx === 2;      /* 순환 3번째 자리는 항상 된소리 */
    return true;
  }
  return false;
}

function hangulConsonant(state, key) {
  const h = state.hangul;
  const c = CONS_CYCLE[key][0];
  const mergeable = state.prevMergeable;

  state.prevMergeable = false;

  if (state.lastKey === key) {
    if (mergeable && tryMergeJong(state, key)) return;
    if (cycleConsonant(state, key)) return;
  }

  if (isEmpty(h.chosung) && isEmpty(h.jungsung)) {
    /* 빈 음절 -> 초성 */
    h.chosung = c;
    h.step = SLOT.CHOSUNG;
    state.lastKey = key;
    state.tapCount = 0;
    return;
  }

  if (isEmpty(h.jungsung) || isDotState(h.jungsung)) {
    /* 초성만 있거나 아래아만 찍힌 상태 -> 앞을 확정하고 새 음절 */
    startWithChosung(state, c, key, false);
    return;
  }

  if (isEmpty(h.chosung)) {
    /* 모음만 있던 상태 -> 앞을 확정하고 새 음절 */
    startWithChosung(state, c, key, false);
    return;
  }

  if (isEmpty(h.jongsung)) {
    if (isValidJong(c)) {
      h.jongsung = c;
      h.step = SLOT.JONGSUNG;
      state.lastKey = key;
      state.tapCount = 0;
    } else {
      startWithChosung(state, c, key, false);
    }
    return;
  }

  if (isEmpty(h.jongsung2) && canCombineJong(h.jongsung, c)) {
    h.jongsung2 = c;
    h.step = SLOT.JONGSUNG2;
    state.lastKey = key;
    state.tapCount = 0;
    return;
  }

  /* 받침 뒤에 붙지 못한 자음 -> 새 음절. 겹받침으로 되돌아올 수 있게 기억해 둔다. */
  startWithChosung(state, c, key, isEmpty(h.jongsung2));
}

function hangulVowel(state, key) {
  let h = state.hangul;

  state.prevMergeable = false;

  /* 받침이 있으면 연음: 마지막 자음을 새 음절의 초성으로 넘긴다 */
  if (!isEmpty(h.jongsung)) {
    let moved;

    if (!isEmpty(h.jongsung2)) {
      moved = h.jongsung2;
      h.jongsung2 = '';
    } else {
      moved = h.jongsung;
      h.jongsung = '';
    }

    commitAndStart(state);          /* 받침을 뺀 모습으로 앞 글자 확정 */
    h = state.hangul;
    h.chosung = moved;
    h.step = SLOT.CHOSUNG;
  }

  let next = vowelNext(h.jungsung, key);
  if (next === null) {
    /* 이어질 수 없는 모음 조합 -> 앞을 확정하고 새 음절의 중성으로 */
    commitAndStart(state);
    h = state.hangul;
    next = vowelNext('', key);
    if (next === null) return;
  }

  h.jungsung = next;
  h.step = SLOT.JUNGSUNG;
  h.flagDotused = isDotState(next);
  state.lastKey = key;
  state.tapCount = 0;
}

/* 문장부호 키 (9 = ". ,", 11 = "? !"). 연타하면 순환한다. */
const PUNCT_SET = ['.,', '?!'];

function hangulPunct(state, key) {
  const set = PUNCT_SET[key === KEY_PUNCT2 ? 1 : 0];
  const n = set.length;
  let idx;

  state.prevMergeable = false;

  if (state.lastKey === key && !state.hangul.flagWriting && state.cursorPos > 0) {
    idx = (state.tapCount + 1) % n;
    state.text = state.text.slice(0, state.cursorPos - 1)
      + set[idx]
      + state.text.slice(state.cursorPos);
  } else {
    commitAndStart(state);        /* 조합 중인 글자를 확정하고 */
    idx = 0;
    textInsert(state, set[idx]);  /* 부호를 새로 넣는다 */
  }
  state.lastKey = key;
  state.tapCount = idx;
}

export function hangulMake(state, input) {
  if (input < 0 || input >= KEY_COUNT) return;

  state.hangul.flagSpace = false;
  state.hangul.flagAddcursor = false;

  if (isVowelKey(input)) {
    hangulVowel(state, input);
  } else if (isConsKey(input)) {
    hangulConsonant(state, input);
  } else if (input === KEY_PUNCT1 || input === KEY_PUNCT2) {
    hangulPunct(state, input);
  }
}

/* ------------------------------------------------------------------ */
/* 영문 / 숫자 / 기호                                                  */
/* ------------------------------------------------------------------ */

/*
 * 영문 배열.
 * 한 키에 세 글자까지만 둔다. 그래서 알파벳 26자가 위 3x3 (0~8번) 을 채우고,
 * 마지막 줄 세 키(9~11)가 자주 쓰는 기호를 맡는다.
 * 나머지 기호는 기호 모드에서 넣는다.
 * 띄어쓰기는 스페이스 버튼과 스페이스바가 따로 있으므로 키패드에 두지 않는다.
 *
 *      abc   def   ghi
 *      jkl   mno   pqr
 *      stu   vwx   yz
 *      .,?   !'"   -:@
 */
const ENG_MAP = [
  'abc', 'def', 'ghi',
  'jkl', 'mno', 'pqr',
  'stu', 'vwx', 'yz',
  '.,?', '!\'"', '-:@',
];

/* 숫자는 키마다 하나씩. 순환하지 않는다. */
const NUM_MAP = '123456789*0#';

/*
 * 기호 모드. 한 키에 세 개씩, 12키로 36개를 덮는다.
 * 영문 모드에 넣지 못한 기호는 모두 여기에 있다.
 */
const SPECIAL_MAP = [
  '.,:', '?!;', '\'"`',
  '-_~', '+=*', '/\\|',
  '()&', '[]^', '{}%',
  '<>#', '@$₩', '※…・',
];

/* 휴대전화식 멀티탭. 같은 키를 연달아 누르면 목록을 돈다. */
function multitapMake(state, input, set, toUpper) {
  const n = set.length;

  if (n === 0) return;

  if (state.lastKey === input && state.flagEngdelete) {
    state.tapCount = (state.tapCount + 1) % n;
  } else {
    state.tapCount = 0;
    state.flagEngdelete = false;   /* 새 문자로 삽입 */
  }

  let c = set[state.tapCount];
  if (toUpper && c >= 'a' && c <= 'z') c = c.toUpperCase();
  state.engnum = c;
  state.lastKey = input;
}

export function engMake(state, input) {
  if (input < 0 || input >= KEY_COUNT) return;
  multitapMake(state, input, ENG_MAP[input], state.nowMode === MODE.UPPER_ENGLISH);
}

export function specialMake(state, input) {
  if (input < 0 || input >= KEY_COUNT) return;
  multitapMake(state, input, SPECIAL_MAP[input], false);
}

export function numMake(state, input) {
  if (input < 0 || input >= KEY_COUNT) return;
  state.engnum = NUM_MAP[input];
  state.flagEngdelete = false;
  state.lastKey = -1;
  state.tapCount = 0;
}

/* ------------------------------------------------------------------ */
/* 입력 진입점 (chunjiin_process_input)                                */
/* ------------------------------------------------------------------ */

export function chunjiinProcessInput(state, input) {
  if (input < 0 || input > 11) return;

  if (state.nowMode === MODE.HANGUL) {
    hangulMake(state, input);
    writeHangul(state);
  } else if (state.nowMode === MODE.ENGLISH || state.nowMode === MODE.UPPER_ENGLISH) {
    engMake(state, input);
    writeEngnum(state);
  } else if (state.nowMode === MODE.NUMBER) {
    numMake(state, input);
    writeEngnum(state);
  } else {
    specialMake(state, input);
    writeEngnum(state);
  }
}

/* ------------------------------------------------------------------ */
/* 편집 API                                                            */
/* ------------------------------------------------------------------ */

/* 임의의 문자를 커서 위치에 그대로 넣는다(공백, 줄바꿈, 물리 키보드 직접 입력). */
export function chunjiinInsertChar(state, ch) {
  chunjiinCommit(state);
  textInsert(state, ch);
}

/* 공백 입력. 조합을 확정한 뒤 space 를 넣는다. */
export function chunjiinSpace(state) {
  chunjiinInsertChar(state, ' ');
  state.hangul.flagSpace = true;
}

/* 백스페이스. 조합 중이면 낱자 단위로 되돌리고, 아니면 글자를 지운다. */
export function chunjiinBackspace(state) {
  const h = state.hangul;

  if (state.nowMode === MODE.HANGUL && h.flagWriting) {
    if (!isEmpty(h.jongsung2)) {
      h.jongsung2 = '';
      h.step = SLOT.JONGSUNG;
    } else if (!isEmpty(h.jongsung)) {
      h.jongsung = '';
      h.step = isEmpty(h.jungsung) ? SLOT.CHOSUNG : SLOT.JUNGSUNG;
    } else if (!isEmpty(h.jungsung)) {
      h.jungsung = vowelPrev(h.jungsung);
      h.step = isEmpty(h.jungsung)
        ? (isEmpty(h.chosung) ? SLOT.NONE : SLOT.CHOSUNG)
        : SLOT.JUNGSUNG;
    } else if (!isEmpty(h.chosung)) {
      h.chosung = '';
      h.step = SLOT.NONE;
    }

    writeHangul(state);

    if (isEmpty(h.chosung) && isEmpty(h.jungsung) && isEmpty(h.jongsung)) {
      hangulInit(state.hangul);
    }
    state.prevMergeable = false;
    state.lastKey = -1;
    state.tapCount = 0;
    return;
  }

  chunjiinCommit(state);
  deleteChar(state);
}

/* 커서 이동 (delta 만큼). 조합은 확정된다. */
export function chunjiinMoveCursor(state, delta) {
  chunjiinCommit(state);
  const len = state.text.length;
  state.cursorPos += delta;
  if (state.cursorPos < 0) state.cursorPos = 0;
  if (state.cursorPos > len) state.cursorPos = len;
  clampCursor(state);
}

/* 커서를 절대 위치로 옮긴다. 조합은 확정된다. */
export function chunjiinSetCursor(state, pos) {
  chunjiinCommit(state);
  const len = state.text.length;
  state.cursorPos = pos < 0 ? 0 : (pos > len ? len : pos);
  clampCursor(state);
}

/* chunjiinInit() 에 더해 확장 필드까지 초기화한다. 새 상태는 항상 이걸로 시작. */
export function chunjiinReset(state) {
  chunjiinInit(state);
  state.lastKey = -1;
  state.tapCount = 0;
  state.composeLen = 0;
  state.prevMergeable = false;
  hangulInit(state.prevSyllable);
}

/* 전체 지우기 */
export function chunjiinClear(state) {
  const mode = state.nowMode;
  chunjiinReset(state);
  state.nowMode = mode;
}

/* 입력 모드 변경. 조합은 확정된다. */
export function chunjiinSetMode(state, mode) {
  if (mode < 0 || mode >= MODE.COUNT) return;
  chunjiinCommit(state);
  state.nowMode = mode;
  initEngnum(state);
  state.lastKey = -1;
  state.tapCount = 0;
}

/* 한글 -> 영소 -> 영대 -> 숫자 -> 기호 -> 한글 순환 */
export function chunjiinCycleMode(state) {
  chunjiinSetMode(state, (state.nowMode + 1) % MODE.COUNT);
}

/*
 * 연타 순환을 끊는다.
 * "안녕"처럼 같은 키(ㄴ)가 연달아 필요한 경우, 이 호출 이후의 같은 키는
 * 순환(ㄴ→ㄹ)이 아니라 새 자음 입력으로 처리된다. 조합 자체는 유지된다.
 */
export function chunjiinBreakMultitap(state) {
  state.lastKey = -1;
  state.tapCount = 0;
  if (state.nowMode !== MODE.HANGUL) state.flagEngdelete = false;
}

/* ------------------------------------------------------------------ */
/* 표시용 문자열                                                       */
/* ------------------------------------------------------------------ */

const LABEL_HANGUL = [
  'ㅣ', '·', 'ㅡ',
  'ㄱㅋ', 'ㄴㄹ', 'ㄷㅌ',
  'ㅂㅍ', 'ㅅㅎ', 'ㅈㅊ',
  '. ,', 'ㅇㅁ', '? !',
];

/* ENG_MAP 과 같은 순서: 알파벳이 0~8번(3x3), 기호가 9~11번 */
const LABEL_LOWER = [
  'abc', 'def', 'ghi',
  'jkl', 'mno', 'pqr',
  'stu', 'vwx', 'yz',
  '. , ?', '! \' "', '- : @',
];

const LABEL_UPPER = [
  'ABC', 'DEF', 'GHI',
  'JKL', 'MNO', 'PQR',
  'STU', 'VWX', 'YZ',
  '. , ?', '! \' "', '- : @',
];

const LABEL_NUMBER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/* SPECIAL_MAP 과 같은 순서 */
const LABEL_SPECIAL = [
  '. , :', '? ! ;', '\' " `',
  '- _ ~', '+ = *', '/ \\ |',
  '( ) &', '[ ] ^', '{ } %',
  '< > #', '@ $ ₩', '※ … ・',
];

/* 현재 모드에서 키 인덱스(0~11)에 표시할 라벨. */
export function chunjiinKeyLabel(state, key) {
  if (key < 0 || key >= KEY_COUNT) return '';
  switch (state.nowMode) {
    case MODE.HANGUL: return LABEL_HANGUL[key];
    case MODE.ENGLISH: return LABEL_LOWER[key];
    case MODE.UPPER_ENGLISH: return LABEL_UPPER[key];
    case MODE.NUMBER: return LABEL_NUMBER[key];
    default: return LABEL_SPECIAL[key];
  }
}

/* 현재 모드 이름 ("한글", "영문 abc" ...) */
export function chunjiinModeName(state) {
  switch (state.nowMode) {
    case MODE.HANGUL: return '한글';
    case MODE.ENGLISH: return '영문 abc';
    case MODE.UPPER_ENGLISH: return '영문 ABC';
    case MODE.NUMBER: return '숫자 123';
    default: return '기호 !@#';
  }
}

/* 조합 중인 낱자 상태를 사람이 읽을 수 있는 문자열로 만든다(상태 표시줄용). */
export function chunjiinCompositionText(state, outLen = Infinity) {
  const h = state.hangul;

  if (outLen === 0) return '';

  if (state.nowMode !== MODE.HANGUL) {
    if (state.engnum !== '' && state.flagEngdelete && outLen >= 2) return state.engnum[0];
    return '';
  }

  if (isEmpty(h.chosung) && isEmpty(h.jungsung) && isEmpty(h.jongsung)) return '';

  const line = `${isEmpty(h.chosung) ? '-' : h.chosung} + `
    + `${isEmpty(h.jungsung) ? '-' : h.jungsung} + `
    + `${isEmpty(h.jongsung) ? '-' : h.jongsung}${isEmpty(h.jongsung2) ? '' : h.jongsung2}`;

  return outLen === Infinity ? line : line.slice(0, outLen - 1);
}

/* 새 상태를 만들어 초기화까지 마친다. */
export function createState() {
  const state = newChunjiinState();
  chunjiinReset(state);
  return state;
}
