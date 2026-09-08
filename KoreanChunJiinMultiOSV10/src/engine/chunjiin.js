/*
 * chunjiin.js - 천지인(千地人) 한글 입력 엔진 핵심
 *
 * KoreanChunJiInC++/src/chunjiin.c 와 include/chunjiin.h 를 그대로 옮긴 것이다.
 * 유니코드 음절 조합, 겹받침 판정, 상태 자료구조가 여기에 있다.
 *
 * C 의 wchar_t 버퍼는 자바스크립트 문자열(UTF-16 코드 단위)로 바꿨다.
 * 한글 음절·호환 자모는 모두 BMP 안에 있으므로 한 글자가 코드 단위 하나다.
 * 따라서 커서 위치 계산이 원본과 똑같이 맞아떨어진다.
 */

/* 편집 버퍼에 담을 수 있는 최대 문자 수(널 자리 포함) */
export const MAX_TEXT_LEN = 4096;
/* 키패드 키 개수 (0 ~ 11) */
export const KEY_COUNT = 12;

/* 입력 모드 */
export const MODE = {
  HANGUL: 0,          /* 한글 (천지인) */
  ENGLISH: 1,         /* 영문 소문자 */
  UPPER_ENGLISH: 2,   /* 영문 대문자 */
  NUMBER: 3,          /* 숫자 */
  SPECIAL: 4,         /* 기호 */
  COUNT: 5,
};

/* 조합 중인 낱자가 마지막으로 들어간 자리 */
export const SLOT = {
  NONE: 0,
  CHOSUNG: 1,
  JUNGSUNG: 2,
  JONGSUNG: 3,
  JONGSUNG2: 4,
};

/* ------------------------------------------------------------------ */
/* 상태 자료구조                                                       */
/* ------------------------------------------------------------------ */

/*
 * 조합 중인 한 음절의 상태.
 * jungsung 에는 완성 모음뿐 아니라 중간 상태인 '·'(아래아 1개),
 * '‥'(아래아 2개) 도 들어간다. getUnicode() 가 이 두 값을
 * "아직 모음이 아님"으로 취급한다.
 */
export function newHangulState() {
  return {
    chosung: '',
    jungsung: '',
    jongsung: '',
    jongsung2: '',      /* 겹받침의 두 번째 자음 */

    step: SLOT.NONE,    /* 마지막으로 채워진 자리 */
    flagWriting: false, /* true 면 text[cursorPos-1] 이 조합 중인 글자 */
    flagDotused: false, /* 아래아(·)로 시작한 모음인지 */
    flagDoubled: false, /* 현재 자음이 쌍자음으로 바뀐 상태인지 */
    flagAddcursor: false, /* 직전 입력에서 음절이 확정되었는지 */
    flagSpace: false,   /* 직전 입력이 공백이었는지 */
  };
}

/* C 의 구조체 대입(값 복사)에 해당한다. */
export function copyHangulState(src) {
  return { ...src };
}

/* hangul_init() */
export function hangulInit(hangul) {
  hangul.chosung = '';
  hangul.jungsung = '';
  hangul.jongsung = '';
  hangul.jongsung2 = '';
  hangul.step = SLOT.NONE;
  hangul.flagWriting = false;
  hangul.flagDotused = false;
  hangul.flagDoubled = false;
  hangul.flagAddcursor = false;
  hangul.flagSpace = false;
}

/* init_engnum() */
export function initEngnum(state) {
  state.engnum = '';
  state.flagInitengnum = false;
  state.flagEngdelete = false;
}

/* 입력기 전체 상태 */
export function newChunjiinState() {
  const state = {
    hangul: newHangulState(),
    nowMode: MODE.HANGUL,

    engnum: '',             /* 영문/숫자/기호 모드에서 조합 중인 문자 */
    flagInitengnum: false,
    flagEngdelete: false,

    text: '',               /* 편집 버퍼 */
    cursorPos: 0,           /* 삽입 위치. 조합 중이면 조합 글자는 cursorPos-1 */

    /* 아래는 원본 chunjiin.c 가 쓰지 않는 확장 필드 */
    lastKey: -1,            /* 직전에 눌린 키 인덱스, 없으면 -1 */
    tapCount: 0,            /* 같은 키 연타 위치 */
    composeLen: 0,          /* 조합 중인 글자가 차지하는 칸 수 (0~2) */

    /*
     * 겹받침 되돌려 붙이기용.
     * 받침 뒤에 온 자음이 겹받침을 이루지 못해 새 음절로 떨어져 나갔을 때,
     * 바로 앞 음절을 기억해 둔다. 그 자음을 연타해서 겹받침이 되는 자음으로
     * 바뀌면 앞 음절로 도로 합친다. (만 + ㅅ -> 만ㅅ -> 많)
     */
    prevSyllable: newHangulState(),
    prevMergeable: false,
  };
  return state;
}

/* 커서를 유효 범위로 보정 (CLAMP_CURSOR 매크로) */
export function clampCursor(state) {
  if (state.cursorPos < 0) state.cursorPos = 0;
  if (state.cursorPos > MAX_TEXT_LEN - 1) state.cursorPos = MAX_TEXT_LEN - 1;
}

/* chunjiin_init() */
export function chunjiinInit(state) {
  hangulInit(state.hangul);
  state.nowMode = MODE.HANGUL;
  initEngnum(state);
  state.text = '';
  state.cursorPos = 0;
  clampCursor(state);
}

/* ------------------------------------------------------------------ */
/* 도우미                                                              */
/* ------------------------------------------------------------------ */

/*
 * wchar_to_utf8() 의 대응물.
 * 자바스크립트 문자열은 이미 유니코드이므로 길이 제한만 그대로 흉내 낸다.
 */
export function wcharToUtf8(str, maxLen) {
  if (str === null || str === undefined) return '';
  return str.slice(0, maxLen);
}

/* delete_char() - 커서 앞 한 칸을 지운다. */
export function deleteChar(state) {
  if (state.cursorPos <= 0) return;
  state.text = state.text.slice(0, state.cursorPos - 1) + state.text.slice(state.cursorPos);
  state.cursorPos--;
  clampCursor(state);
}

/* ------------------------------------------------------------------ */
/* 유니코드 조합                                                       */
/* ------------------------------------------------------------------ */

/* 낱자 홀로 보일 때 쓰는 호환 자모 */
const COMPAT_CHO = [
  0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142,
  0x3143, 0x3145, 0x3146, 0x3147, 0x3148, 0x3149, 0x314a, 0x314b,
  0x314c, 0x314d, 0x314e,
];
const COMPAT_JUNG = [
  0x314f, 0x3150, 0x3151, 0x3152, 0x3153, 0x3154, 0x3155, 0x3156,
  0x3157, 0x3158, 0x3159, 0x315a, 0x315b, 0x315c, 0x315d, 0x315e,
  0x315f, 0x3160, 0x3161, 0x3162, 0x3163,
];
const COMPAT_JONG = [
  0, 0x3131, 0x3132, 0x3133, 0x3134, 0x3135, 0x3136, 0x3137, 0x3139,
  0x313a, 0x313b, 0x313c, 0x313d, 0x313e, 0x313f, 0x3140, 0x3141, 0x3142,
  0x3144, 0x3145, 0x3146, 0x3147, 0x3148, 0x314a, 0x314b, 0x314c, 0x314d, 0x314e,
];

/*
 * 조합용 자모 순서표.
 * 원본은 if-else 사슬이라 목록에 없는 값이 마지막 항목으로 떨어진다.
 * indexOf 가 -1 이면 그 마지막 번호를 돌려주어 동작을 똑같이 맞춘다.
 */
const CHO_ORDER = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ'];              /* 없으면 18 = ㅎ */
const JUNG_ORDER = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ'];   /* 없으면 20 = ㅣ */
const JONG_ORDER = ['ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ',
  'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ',
  'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ'];                          /* 없으면 27 = ㅎ */

/* 아직 모음이 되지 못한 아래아 중간 상태인가 */
export function isDotState(jung) {
  return jung === '·' || jung === '‥';
}

/*
 * get_unicode() - 조합 상태를 화면에 그릴 코드 포인트 하나로 만든다.
 * 아직 글자가 되지 못했으면 0 을 돌려준다.
 */
export function getUnicode(hangul, realJong) {
  const jong0 = realJong === undefined || realJong === null ? '' : realJong;

  /* 초성이 없고 중성도 없거나 점만 있으면 */
  if (hangul.chosung.length === 0) {
    if (hangul.jungsung.length === 0 || isDotState(hangul.jungsung)) return 0;
  }

  /* 초성 처리 */
  let cho = CHO_ORDER.indexOf(hangul.chosung);
  if (cho < 0) cho = 18;   /* ㅎ */

  if (hangul.jungsung.length === 0 && hangul.jongsung.length === 0) {
    return COMPAT_CHO[cho];
  }
  if (isDotState(hangul.jungsung)) {
    return COMPAT_CHO[cho];
  }

  /* 중성 처리 */
  let jung = JUNG_ORDER.indexOf(hangul.jungsung);
  if (jung < 0) jung = 20;  /* ㅣ */

  if (hangul.chosung.length === 0 && hangul.jongsung.length === 0) {
    return COMPAT_JUNG[jung];
  }

  /* 종성 처리 */
  let jong;
  if (jong0.length === 0) {
    jong = 0;
  } else {
    const i = JONG_ORDER.indexOf(jong0);
    jong = i < 0 ? 27 : i + 1;   /* 0 번은 "받침 없음" 자리 */
  }

  if (hangul.chosung.length === 0 && hangul.jungsung.length === 0) {
    return COMPAT_JONG[jong];
  }

  return 44032 + cho * 588 + jung * 28 + jong;
}

/*
 * check_double() - 두 자음이 겹받침을 이루면 그 겹받침을, 아니면 '' 을 돌려준다.
 */
export function checkDouble(jong, jong2) {
  if (jong === 'ㄱ') {
    if (jong2 === 'ㅅ') return 'ㄳ';
  } else if (jong === 'ㄴ') {
    if (jong2 === 'ㅈ') return 'ㄵ';
    if (jong2 === 'ㅎ') return 'ㄶ';
  } else if (jong === 'ㄹ') {
    if (jong2 === 'ㄱ') return 'ㄺ';
    if (jong2 === 'ㅁ') return 'ㄻ';
    if (jong2 === 'ㅂ') return 'ㄼ';
    if (jong2 === 'ㅅ') return 'ㄽ';
    if (jong2 === 'ㅌ') return 'ㄾ';
    if (jong2 === 'ㅍ') return 'ㄿ';
    if (jong2 === 'ㅎ') return 'ㅀ';
  } else if (jong === 'ㅂ') {
    if (jong2 === 'ㅅ') return 'ㅄ';
  }
  return '';
}
