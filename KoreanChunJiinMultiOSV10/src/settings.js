/*
 * settings.js - 설정 읽기/쓰기
 *
 * 원본은 레지스트리 HKCU\Software\Chunjiin 에 저장했다.
 * 여기서는 브라우저·Electron 어디서나 쓸 수 있게 localStorage 를 쓴다.
 */
import { MODE } from './engine/input.js';
import { THEME_COUNT } from './themes.js';

const STORE_KEY = 'chunjiin.settings';

export const FONT_CHOICES = [16, 18, 21, 24, 28, 32];
export const TAP_CHOICES = [400, 600, 800, 1000, 1500, 2000];

export const DEFAULTS = {
  theme: 0,          /* 0 ~ THEME_COUNT-1 */
  fontSize: 21,      /* 편집 영역 글꼴 높이(px) */
  multitapMs: 800,   /* 연타 순환이 유지되는 시간 */
  startMode: MODE.HANGUL,
  showToolbar: true,
  showStatus: true,
};

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

export function loadSettings() {
  const s = { ...DEFAULTS };

  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch {
    /* 저장소를 못 읽으면 기본값 그대로 쓴다 */
  }

  s.theme = clamp(Number(s.theme) || 0, 0, THEME_COUNT - 1);
  s.fontSize = clamp(Number(s.fontSize) || DEFAULTS.fontSize, 14, 36);
  s.multitapMs = clamp(Number(s.multitapMs) || DEFAULTS.multitapMs, 300, 3000);
  s.startMode = clamp(Number(s.startMode) || 0, 0, MODE.COUNT - 1);
  s.showToolbar = Boolean(s.showToolbar);
  s.showStatus = Boolean(s.showStatus);

  return s;
}

export function saveSettings(s) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* 저장 못 해도 동작에는 지장이 없다 */
  }
}
