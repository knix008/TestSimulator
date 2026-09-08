/*
 * themes.js - 테마 4종
 *
 * KoreanChunJiInC++/src/main.c 의 THEMES 표를 그대로 옮긴 것이다.
 * COLORREF 값을 그대로 16진수 색으로 바꿨으므로 색감이 원본과 같다.
 *
 * 역할별 색은 [기본, 호버, 눌림, 테두리, 글자] 다섯 개다.
 */

/* 버튼 역할 */
export const ROLE = {
  CONS: 'cons',       /* 자음 · 일반 키 */
  VOWEL: 'vowel',     /* ㅣ · ㅡ */
  MOD: 'mod',         /* 문장부호 */
  FN: 'fn',           /* 기능 버튼 */
  PRIMARY: 'primary', /* 모드 전환 */
  TOOL: 'tool',       /* 툴바 */
};

const ROLE_ORDER = [ROLE.CONS, ROLE.VOWEL, ROLE.MOD, ROLE.FN, ROLE.PRIMARY, ROLE.TOOL];

export const THEMES = [
  {
    id: 'light',
    name: '라이트',
    dark: false,
    wnd: '#F6F7FA', card: '#FFFFFF', border: '#DFE3EA', text: '#1F2328', muted: '#6B7280',
    role: [
      ['#FFFFFF', '#F2F5FF', '#E3EAFD', '#DFE3EA', '#1F2328'],
      ['#EDF2FF', '#E3EBFF', '#D6E1FD', '#D3DEFB', '#2749C9'],
      ['#F1F3F7', '#E9ECF2', '#DFE3EB', '#E0E4EB', '#4A5162'],
      ['#F1F3F7', '#E9ECF2', '#DFE3EB', '#E0E4EB', '#333842'],
      ['#3F62E8', '#3557DD', '#2C4AC9', '#3557DD', '#FFFFFF'],
      ['#F6F7FA', '#E7ECF8', '#D9E1F5', '#F6F7FA', '#3B4250'],
    ],
  },
  {
    id: 'dark',
    name: '다크',
    dark: true,
    wnd: '#1E1F22', card: '#17181B', border: '#33363D', text: '#E6E8EB', muted: '#9AA1AC',
    role: [
      ['#24262B', '#2C2F36', '#363A43', '#383B43', '#E6E8EB'],
      ['#21304F', '#27395E', '#2E446F', '#33456B', '#A9C4FF'],
      ['#1D1F24', '#24262B', '#2B2E35', '#303339', '#B7BDC7'],
      ['#1D1F24', '#24262B', '#2B2E35', '#303339', '#DDE1E7'],
      ['#3F62E8', '#4A6DF0', '#3455CE', '#4A6DF0', '#FFFFFF'],
      ['#1E1F22', '#2A2D34', '#343840', '#1E1F22', '#D5D9E0'],
    ],
  },
  {
    id: 'sepia',
    name: '세피아',
    dark: false,
    wnd: '#F3EADA', card: '#FBF3E6', border: '#DCCDB4', text: '#4A3B28', muted: '#8A755A',
    role: [
      ['#FBF3E6', '#F6EAD6', '#EEDCC0', '#DCCDB4', '#4A3B28'],
      ['#F3E3C6', '#EEDAB6', '#E6CEA2', '#D9C09B', '#8A5A22'],
      ['#EFE4D0', '#E9DAC2', '#E0CDAF', '#D7C6AA', '#5A4A34'],
      ['#EFE4D0', '#E9DAC2', '#E0CDAF', '#D7C6AA', '#4A3B28'],
      ['#A9713C', '#96632F', '#855427', '#96632F', '#FFF8EC'],
      ['#F3EADA', '#EADCC4', '#E0CEB0', '#F3EADA', '#5A4A34'],
    ],
  },
  {
    id: 'contrast',
    name: '고대비',
    dark: true,
    wnd: '#000000', card: '#000000', border: '#FFFFFF', text: '#FFFFFF', muted: '#FFFF00',
    role: [
      ['#000000', '#222222', '#444444', '#FFFFFF', '#FFFFFF'],
      ['#000000', '#222222', '#444444', '#FFFF00', '#FFFF00'],
      ['#000000', '#222222', '#444444', '#00FF00', '#00FF00'],
      ['#000000', '#222222', '#444444', '#FFFFFF', '#FFFFFF'],
      ['#FFFF00', '#FFEA00', '#E6D200', '#FFFF00', '#000000'],
      ['#000000', '#333333', '#555555', '#000000', '#FFFF00'],
    ],
  },
];

export const THEME_COUNT = THEMES.length;

/* 테마 하나를 CSS 사용자 지정 속성 묶음으로 바꾼다. */
export function themeVars(theme) {
  const vars = {
    '--wnd': theme.wnd,
    '--card': theme.card,
    '--border': theme.border,
    '--text': theme.text,
    '--muted': theme.muted,
  };

  ROLE_ORDER.forEach((role, i) => {
    const [bg, hover, active, border, fg] = theme.role[i];
    vars[`--${role}-bg`] = bg;
    vars[`--${role}-hover`] = hover;
    vars[`--${role}-active`] = active;
    vars[`--${role}-border`] = border;
    vars[`--${role}-fg`] = fg;
  });

  return vars;
}

/* 키패드 12키의 역할. 한글 모드가 아니면 모두 일반 키로 그린다. */
export function keyRole(key, isHangul) {
  if (!isHangul) return ROLE.CONS;
  if (key === 0 || key === 1 || key === 2) return ROLE.VOWEL;
  if (key === 9 || key === 11) return ROLE.MOD;
  return ROLE.CONS;
}
