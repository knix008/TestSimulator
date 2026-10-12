// Colour themes. Each sets CSS custom properties on <html>; `dark` also picks
// the native title bar colour. "system" follows the OS light/dark setting.

const base = {
  danger: '#e5484d', success: '#30a46c', warning: '#f5a524',
};

export const THEMES = [
  { id: 'light', dark: false, swatch: ['#f6f8fc', '#ffffff', '#3a6cf0'], colors: {
    bg: '#eef2f8', surface: '#ffffff', surface2: '#f4f6fb', panel: '#f8fafd', text: '#1d2433', muted: '#667085', border: '#d9dfea',
    accent: '#3a6cf0', accentText: '#ffffff', hover: '#e8eefc', column: '#e6ebf4', card: '#ffffff', toolbar: '#ffffff', status: '#f1f4fa', shadow: 'rgba(16,24,40,0.12)' } },
  { id: 'dark', dark: true, swatch: ['#1b1f27', '#262b36', '#6e9bff'], colors: {
    bg: '#15181e', surface: '#1f232c', surface2: '#272c37', panel: '#1b1f27', text: '#e6e9ef', muted: '#98a1b3', border: '#343b49',
    accent: '#6e9bff', accentText: '#0b1020', hover: '#2c3342', column: '#232834', card: '#2b3140', toolbar: '#1f232c', status: '#1b1f27', shadow: 'rgba(0,0,0,0.45)' } },
  { id: 'midnight', dark: true, swatch: ['#0d1326', '#18213d', '#8b7bff'], colors: {
    bg: '#0b1020', surface: '#141b33', surface2: '#1b2443', panel: '#10172c', text: '#e3e7ff', muted: '#8f98c7', border: '#273259',
    accent: '#8b7bff', accentText: '#0b1020', hover: '#202a50', column: '#151d38', card: '#1d2747', toolbar: '#141b33', status: '#10172c', shadow: 'rgba(0,0,0,0.5)' } },
  { id: 'ocean', dark: false, swatch: ['#e8f6fb', '#ffffff', '#0e8fb8'], colors: {
    bg: '#e3f2f8', surface: '#ffffff', surface2: '#eef8fb', panel: '#f2fafd', text: '#0f2c3a', muted: '#4f7383', border: '#c4e0ea',
    accent: '#0e8fb8', accentText: '#ffffff', hover: '#dcf0f7', column: '#d4ebf3', card: '#ffffff', toolbar: '#ffffff', status: '#e9f5f9', shadow: 'rgba(14,60,80,0.14)' } },
  { id: 'forest', dark: false, swatch: ['#eef5ec', '#ffffff', '#2f8a4c'], colors: {
    bg: '#e9f1e6', surface: '#ffffff', surface2: '#f1f7ef', panel: '#f5faf3', text: '#1c2e20', muted: '#5b7461', border: '#cfe0c9',
    accent: '#2f8a4c', accentText: '#ffffff', hover: '#e1eedc', column: '#dbe8d5', card: '#ffffff', toolbar: '#ffffff', status: '#edf4ea', shadow: 'rgba(30,60,30,0.14)' } },
  { id: 'sunset', dark: false, swatch: ['#fdf1ea', '#ffffff', '#e2602b'], colors: {
    bg: '#fbeee6', surface: '#ffffff', surface2: '#fdf4ef', panel: '#fef8f4', text: '#3a1f12', muted: '#8a6151', border: '#f0d5c6',
    accent: '#e2602b', accentText: '#ffffff', hover: '#fbe5d9', column: '#f6e1d4', card: '#ffffff', toolbar: '#ffffff', status: '#fcf0e9', shadow: 'rgba(90,40,20,0.14)' } },
  { id: 'nord', dark: true, swatch: ['#2e3440', '#3b4252', '#88c0d0'], colors: {
    bg: '#2a303b', surface: '#323946', surface2: '#3b4252', panel: '#2e3440', text: '#eceff4', muted: '#a7b1c4', border: '#4c566a',
    accent: '#88c0d0', accentText: '#1d222b', hover: '#434c5e', column: '#353c4a', card: '#3e4657', toolbar: '#323946', status: '#2e3440', shadow: 'rgba(0,0,0,0.4)' } },
  { id: 'dracula', dark: true, swatch: ['#282a36', '#343746', '#ff79c6'], colors: {
    bg: '#21222c', surface: '#2b2d3a', surface2: '#343746', panel: '#262833', text: '#f8f8f2', muted: '#a4a8c8', border: '#44475a',
    accent: '#ff79c6', accentText: '#21222c', hover: '#3b3e51', column: '#2e3040', card: '#383a4c', toolbar: '#2b2d3a', status: '#262833', shadow: 'rgba(0,0,0,0.45)' } },
  { id: 'solarized', dark: false, swatch: ['#fdf6e3', '#eee8d5', '#268bd2'], colors: {
    bg: '#f5efdc', surface: '#fdf6e3', surface2: '#f3ecd6', panel: '#faf3df', text: '#3c4a50', muted: '#6f7f82', border: '#e0d8bf',
    accent: '#268bd2', accentText: '#ffffff', hover: '#ece4cb', column: '#eee8d5', card: '#fdf6e3', toolbar: '#fdf6e3', status: '#f3ecd6', shadow: 'rgba(80,70,40,0.14)' } },
  { id: 'sepia', dark: false, swatch: ['#f4ecdf', '#fbf6ee', '#9c6b3c'], colors: {
    bg: '#efe5d4', surface: '#fbf6ee', surface2: '#f4ecdf', panel: '#f8f1e6', text: '#3d2e1e', muted: '#7d6a55', border: '#e0d2bb',
    accent: '#9c6b3c', accentText: '#ffffff', hover: '#eee2cd', column: '#e9dcc6', card: '#fdf9f2', toolbar: '#fbf6ee', status: '#f4ecdf', shadow: 'rgba(80,60,30,0.15)' } },
  { id: 'contrast', dark: true, swatch: ['#000000', '#111111', '#ffd400'], colors: {
    bg: '#000000', surface: '#0a0a0a', surface2: '#141414', panel: '#050505', text: '#ffffff', muted: '#d0d0d0', border: '#ffffff',
    accent: '#ffd400', accentText: '#000000', hover: '#262626', column: '#0f0f0f', card: '#161616', toolbar: '#0a0a0a', status: '#050505', shadow: 'rgba(255,255,255,0.15)' } },
];

export const SYSTEM = 'system';
export const THEME_IDS = [SYSTEM, ...THEMES.map((theme) => theme.id)];

export function resolveTheme(id, prefersDark = false) {
  if (id === SYSTEM) return THEMES.find((theme) => theme.id === (prefersDark ? 'dark' : 'light'));
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function themeVariables(theme) {
  return Object.fromEntries(Object.entries({ ...base, ...theme.colors }).map(([key, value]) => [`--${kebab(key)}`, value]));
}

export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  for (const [name, value] of Object.entries(themeVariables(theme))) root.style.setProperty(name, value);
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
}

export function applyFont(settings, root = globalThis.document?.documentElement) {
  if (!root) return;
  const family = settings.fontFamily ? `"${settings.fontFamily.replace(/"/g, '')}", ` : '';
  root.style.setProperty('--font-family', `${family}"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`);
  root.style.setProperty('--font-size', `${settings.fontSize}px`);
  root.style.setProperty('--font-weight', String(settings.fontWeight));
  root.style.setProperty('--font-style', settings.fontStyle);
}
