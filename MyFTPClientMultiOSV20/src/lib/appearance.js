// The look every window shares — theme, language, font size — as one plain
// object. The main window keeps it current; dialog windows and the user guide
// get it when they open and again whenever it changes (broadcastAppearance).
//
//   { theme, language, fontSize, bg, mode, vars: { '--bg': …, … } }
import { themeById, DEFAULT_THEME } from '../themes.js';

let current = { theme: DEFAULT_THEME, language: 'ko', fontSize: 13 };

export function appearanceOf({ theme, language, fontSize } = {}) {
  const th = themeById(theme || current.theme);
  return {
    theme: th.id,
    language: language || current.language,
    fontSize: Number(fontSize) || current.fontSize,
    bg: th.tokens['--bg'],
    mode: th.mode,
    vars: th.tokens,
  };
}

export function setAppearance(patch = {}) {
  const next = appearanceOf({ ...current, ...patch });
  current = { theme: next.theme, language: next.language, fontSize: next.fontSize };
  return next;
}

export function getAppearance() {
  return appearanceOf(current);
}
