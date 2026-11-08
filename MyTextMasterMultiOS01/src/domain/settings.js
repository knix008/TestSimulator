// Preferences: one object in localStorage ("mytextmaster.settings"), always read through
// normalizeSettings so a missing, old or broken value falls back to its default.
import { THEME_IDS, normalizeCustom } from '../themes.js';

export const STORAGE_KEY = 'mytextmaster.settings';

export const ANIMATION_INTERVALS = [0, 15, 30, 60, 120, 300];
export const ANIMATIONS = [
  'aurora', 'waves', 'particles', 'constellation', 'bubbles', 'gridflow', 'flowchart', 'starfield', 'rain', 'snow',
  'fireflies', 'ripples', 'coderain', 'hexagons', 'orbits', 'lava', 'spiral', 'confetti', 'nodes', 'ribbons',
];
export const VIEW_MODES = ['editor', 'split', 'preview', 'wysiwyg'];
export const LEFT_TABS = ['explorer', 'outline', 'documents'];
export const RIGHT_TABS = ['info', 'bookmarks', 'search'];
export const BOTTOM_TABS = ['problems', 'log'];
export const SPELL_LANGUAGES = ['both', 'en', 'ko'];
export const GUIDE_SIZES = [70, 80, 90, 100, 110, 125, 140, 160, 180, 200];
export const TAB_SIZES = [2, 4, 8];
export const EDITOR_FONTS = ['Consolas', 'D2Coding', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Menlo', 'Courier New', 'monospace'];
export const PREVIEW_STYLES = ['github', 'document', 'academic', 'plain'];

export const DEFAULTS = Object.freeze({
  language: 'ko',
  theme: 'light',
  customTheme: null,
  // UI font
  fontFamily: '',
  fontSize: 13,
  fontWeight: 400,
  fontStyle: 'normal',
  // editor
  editorFont: 'Consolas',
  editorFontSize: 14,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: true,
  lineNumbers: true,
  highlightActiveLine: true,
  showWhitespace: false,
  autoCloseBrackets: true,
  // preview
  viewMode: 'split',
  syncScroll: true,
  previewStyle: 'github',
  previewScripts: false,
  // panels (left: explorer / outline / documents; right: info / bookmarks / find in files; bottom: problems / log)
  leftOpen: true,
  leftTab: 'outline',
  rightOpen: false,
  rightTab: 'info',
  bottomOpen: false,
  bottomTab: 'problems',
  outlineWidth: 260,
  rightWidth: 300,
  bottomHeight: 190,
  showStatusBar: true,
  splitRatio: 0.5,
  // spelling (Hunspell English + Korean, the user's dictionary), pictures in the source
  spellCheck: true,
  spellLanguages: 'both',
  inlineImages: true,
  // window and guide
  alwaysOnTop: false,
  guideSize: 100,
  guideLanguage: '',
  explorerRoot: '',
  showHidden: false,
  // files
  autoSave: false,
  autoSaveSeconds: 30,
  restoreSession: true,
  defaultKind: 'markdown',
  // start page
  showStartPage: true,
  startLayout: null,
  startCardOpacity: 80,
  startRecentCount: 8,
  startShowRecent: true,
  startShowSamples: true,
  startShowBackground: true,
  backgroundKind: 'animated',
  animation: 'aurora',
  animationSpeed: 100,
  animationRandom: false,
  animationInterval: 0,
});

const clamp = (value, low, high, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(high, Math.max(low, Math.round(n))) : fallback;
};
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);

/** A complete, valid settings object from whatever was stored. */
export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULTS;
  return {
    language: oneOf(r.language, ['ko', 'en'], d.language),
    theme: oneOf(r.theme, THEME_IDS, d.theme),
    customTheme: r.customTheme ? normalizeCustom(r.customTheme) : null,
    fontFamily: typeof r.fontFamily === 'string' ? r.fontFamily.slice(0, 80) : d.fontFamily,
    fontSize: clamp(r.fontSize, 11, 18, d.fontSize),
    fontWeight: oneOf(Number(r.fontWeight), [300, 400, 500, 600], d.fontWeight),
    fontStyle: oneOf(r.fontStyle, ['normal', 'italic'], d.fontStyle),
    editorFont: typeof r.editorFont === 'string' && r.editorFont.trim() ? r.editorFont.trim().slice(0, 80) : d.editorFont,
    editorFontSize: clamp(r.editorFontSize, 9, 32, d.editorFontSize),
    tabSize: oneOf(Number(r.tabSize), TAB_SIZES, d.tabSize),
    insertSpaces: bool(r.insertSpaces, d.insertSpaces),
    wordWrap: bool(r.wordWrap, d.wordWrap),
    lineNumbers: bool(r.lineNumbers, d.lineNumbers),
    highlightActiveLine: bool(r.highlightActiveLine, d.highlightActiveLine),
    showWhitespace: bool(r.showWhitespace, d.showWhitespace),
    autoCloseBrackets: bool(r.autoCloseBrackets, d.autoCloseBrackets),
    viewMode: oneOf(r.viewMode, VIEW_MODES, d.viewMode),
    syncScroll: bool(r.syncScroll, d.syncScroll),
    previewStyle: oneOf(r.previewStyle, PREVIEW_STYLES, d.previewStyle),
    previewScripts: bool(r.previewScripts, d.previewScripts),
    leftOpen: bool(r.leftOpen, typeof r.showOutline === 'boolean' ? r.showOutline : d.leftOpen),
    leftTab: oneOf(r.leftTab, LEFT_TABS, d.leftTab),
    rightOpen: bool(r.rightOpen, d.rightOpen),
    rightTab: oneOf(r.rightTab, RIGHT_TABS, d.rightTab),
    bottomOpen: bool(r.bottomOpen, d.bottomOpen),
    bottomTab: oneOf(r.bottomTab, BOTTOM_TABS, d.bottomTab),
    showStatusBar: bool(r.showStatusBar, d.showStatusBar),
    outlineWidth: clamp(r.outlineWidth, 180, 560, d.outlineWidth),
    rightWidth: clamp(r.rightWidth, 200, 560, d.rightWidth),
    bottomHeight: clamp(r.bottomHeight, 90, 600, d.bottomHeight),
    spellCheck: bool(r.spellCheck, d.spellCheck),
    spellLanguages: oneOf(r.spellLanguages, SPELL_LANGUAGES, d.spellLanguages),
    inlineImages: bool(r.inlineImages, d.inlineImages),
    alwaysOnTop: bool(r.alwaysOnTop, d.alwaysOnTop),
    guideSize: oneOf(Number(r.guideSize), GUIDE_SIZES, d.guideSize),
    guideLanguage: oneOf(r.guideLanguage, ['', 'ko', 'en'], d.guideLanguage),
    explorerRoot: typeof r.explorerRoot === 'string' ? r.explorerRoot.slice(0, 1000) : d.explorerRoot,
    showHidden: bool(r.showHidden, d.showHidden),
    splitRatio: Number.isFinite(Number(r.splitRatio)) ? Math.min(0.85, Math.max(0.15, Number(r.splitRatio))) : d.splitRatio,
    autoSave: bool(r.autoSave, d.autoSave),
    autoSaveSeconds: clamp(r.autoSaveSeconds, 5, 600, d.autoSaveSeconds),
    restoreSession: bool(r.restoreSession, d.restoreSession),
    defaultKind: oneOf(r.defaultKind, ['markdown', 'html', 'text'], d.defaultKind),
    showStartPage: bool(r.showStartPage, d.showStartPage),
    startLayout: r.startLayout && typeof r.startLayout === 'object' ? r.startLayout : null,
    startCardOpacity: clamp(r.startCardOpacity, 20, 100, d.startCardOpacity),
    startRecentCount: clamp(r.startRecentCount, 3, 20, d.startRecentCount),
    startShowRecent: bool(r.startShowRecent, d.startShowRecent),
    startShowSamples: bool(r.startShowSamples, d.startShowSamples),
    startShowBackground: bool(r.startShowBackground, d.startShowBackground),
    backgroundKind: oneOf(r.backgroundKind, ['animated', 'static'], d.backgroundKind),
    animation: oneOf(r.animation, ANIMATIONS, d.animation),
    animationSpeed: clamp(r.animationSpeed, 0, 300, d.animationSpeed),
    animationRandom: bool(r.animationRandom, d.animationRandom),
    animationInterval: oneOf(Number(r.animationInterval), ANIMATION_INTERVALS, d.animationInterval),
  };
}

export function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeSettings(null);
  }
}

export function storeSettings(storage, settings) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode, quota */ }
}
