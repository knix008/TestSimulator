const LIGHT = [
  ["light-paper", "종이", "Paper", "#f7f8fb", "#ffffff", "#e7edf8", "#1c2430", "#5d6b80", "#2f6fed"],
  ["light-sand", "모래", "Sand", "#f6f0e6", "#fffaf3", "#efe4d4", "#3a2e22", "#7a6a58", "#c26a2d"],
  ["light-mist", "아침 안개", "Morning Mist", "#eef3f6", "#f8fbfc", "#e1ebf0", "#1e2a32", "#60727f", "#3d7f99"],
  ["light-seaglass", "바다 유리", "Sea Glass", "#e7f4f1", "#f4fbf9", "#d5ebe6", "#14332e", "#4e746c", "#1f8a78"],
  ["light-sky", "하늘", "Sky", "#e7f2ff", "#f5faff", "#d5e6fb", "#16304f", "#5a7394", "#2d74d6"],
  ["light-lavender", "라벤더", "Lavender", "#f3efff", "#fbf9ff", "#e6e0fb", "#2d2448", "#6e6490", "#6d5bd0"],
  ["light-blush", "블러시", "Blush", "#fff1f4", "#fff8f9", "#ffdfe7", "#4a2430", "#8d5d6b", "#d4537c"],
  ["light-mint", "민트", "Mint", "#e9f8ef", "#f5fdf8", "#d7f0e2", "#143524", "#4f7460", "#1e8f52"],
  ["light-peach", "복숭아", "Peach", "#fff1e8", "#fff8f4", "#ffe1d2", "#4a2c1a", "#8a6550", "#d86a2f"],
  ["light-lemon", "레몬", "Lemon", "#fbf6df", "#fffceb", "#f3eab8", "#3d3414", "#7a7040", "#8a6a00"],
  ["light-sage", "세이지", "Sage", "#eef3ea", "#f7faf4", "#e0ead6", "#24301c", "#627056", "#5d7a3a"],
  ["light-slate", "슬레이트", "Slate", "#eef1f5", "#f8f9fb", "#e1e7ef", "#1e2733", "#5e6c7e", "#4a6785"],
  ["light-rose", "로즈 쿼츠", "Rose Quartz", "#fdeff3", "#fff7f9", "#f8dbe5", "#4a2030", "#8a5a6a", "#c43b6e"],
  ["light-glacier", "빙하", "Glacier", "#e8f4f8", "#f4fbfd", "#d4ebf2", "#14323c", "#4e6e7a", "#1f7f9a"],
  ["light-cream", "크림", "Cream", "#fbf6ee", "#fffdf8", "#f0e6d8", "#3a3126", "#7d7264", "#b56b3a"],
  ["light-matcha", "말차", "Matcha", "#eef6e4", "#f7fbf2", "#e1efd2", "#243318", "#61724a", "#6a8f2e"],
  ["light-coral", "코랄", "Coral", "#fff0ec", "#fff8f6", "#ffddd6", "#4a261e", "#8a6458", "#e15a45"],
  ["light-periwinkle", "페리윙클", "Periwinkle", "#eef0ff", "#f7f8ff", "#dfe3ff", "#242a55", "#656c96", "#5460d6"],
  ["light-warmgray", "웜 그레이", "Warm Gray", "#f3f1ef", "#faf9f8", "#e7e3df", "#2c2926", "#6f6a64", "#8a5a44"],
  ["light-sakura", "벚꽃", "Sakura", "#fff0f5", "#fff8fb", "#ffd9e8", "#4a2740", "#8d6880", "#d45d8c"],
];

const DARK = [
  ["dark-ink", "잉크", "Ink", "#14181f", "#1c222c", "#eef2f8", "#a7b1c2", "#8eb6ff"],
  ["dark-midnight", "자정", "Midnight", "#0e1424", "#172038", "#e7eeff", "#9aabc8", "#7aa2ff"],
  ["dark-charcoal", "차콜", "Charcoal", "#1a1c1e", "#24282c", "#f2f4f6", "#b0b6bd", "#e7c27a"],
  ["dark-navy", "딥 네이비", "Deep Navy", "#0c1c33", "#133056", "#e7f0ff", "#9eb4d4", "#79b0ff"],
  ["dark-forest", "숲", "Forest", "#101c16", "#173226", "#e7f6ee", "#9dbead", "#7dcea0"],
  ["dark-wine", "와인", "Wine", "#241018", "#3a1826", "#ffe8ef", "#e0b0c0", "#ff8fb3"],
  ["dark-obsidian", "흑요석", "Obsidian", "#0e0f12", "#181a20", "#f4f6fb", "#b4b8c4", "#c9a6ff"],
  ["dark-graphite", "그래파이트", "Graphite", "#22262b", "#2d333a", "#f3f5f7", "#c0c6ce", "#8fd0ff"],
  ["dark-aurora", "오로라", "Aurora", "#101820", "#152833", "#e7fff8", "#9dccc0", "#5ee0c3"],
  ["dark-ember", "잔불", "Ember", "#1c1210", "#2e1c16", "#fff1ea", "#e0b8a8", "#ffb086"],
  ["dark-abyss", "심해", "Abyss", "#071318", "#0e242c", "#e5f7fb", "#8fb4c0", "#63d2e8"],
  ["dark-plum", "자두", "Plum", "#1a1020", "#2a1840", "#f6e9ff", "#c8b0dc", "#d2a6ff"],
  ["dark-slate", "다크 슬레이트", "Dark Slate", "#1b212b", "#273140", "#e8eef8", "#aeb8c8", "#9db4d4"],
  ["dark-espresso", "에스프레소", "Espresso", "#1c1410", "#2c2118", "#fff4ea", "#d4c0b0", "#e0b080"],
  ["dark-nord", "노르드", "Nord", "#2e3440", "#3b4252", "#eceff4", "#d8dee9", "#88c0d0"],
  ["dark-dracula", "드라큘라", "Dracula", "#282a36", "#343746", "#f8f8f2", "#c7c8d4", "#bd93f9"],
  ["dark-tokyonight", "도쿄 나이트", "Tokyo Night", "#1a1b26", "#24283b", "#c0caf5", "#9aa5ce", "#7aa2f7"],
  ["dark-catppuccin", "카푸치노", "Catppuccin", "#1e1e2e", "#313244", "#cdd6f4", "#a6adc8", "#cba6f7"],
  ["dark-solarized", "솔라라이즈드", "Solarized", "#002b36", "#073642", "#fdf6e3", "#93a1a1", "#2aa198"],
  ["dark-hangang", "한강", "Hangang", "#0e1a1f", "#143038", "#e5f6f8", "#9ec4c8", "#7fd3c8"],
];

export const CUSTOM_THEME_ID = "custom";
export const DEFAULT_THEME_ID = "dark-ink";
export const DEFAULT_CUSTOM_THEME = { mode: "dark", bg: "#16283a", text: "#eef6ff", accent: "#5cc8ff" };
/** Background alpha at 100% transparency. The window stays visible. */
export const MIN_ALPHA = 0.25;

export const LIGHT_THEMES = LIGHT.map(([id, ko, en, bg, bgTop, surface, text, muted, accent]) => ({
  id,
  mode: "light",
  name: { ko, en },
  bg,
  bgTop,
  surface,
  text,
  muted,
  accent,
  danger: "#c4473a",
}));

export const DARK_THEMES = DARK.map(([id, ko, en, bg, bgTop, text, muted, accent]) => ({
  id,
  mode: "dark",
  name: { ko, en },
  bg,
  bgTop,
  surface: "#ffffff",
  text,
  muted,
  accent,
  danger: "#ff9b9b",
}));

export const THEMES = [...LIGHT_THEMES, ...DARK_THEMES];

export function isTheme(id) {
  return id === CUSTOM_THEME_ID || THEMES.some((theme) => theme.id === id);
}

export function themeName(id, language) {
  const theme = THEMES.find((item) => item.id === id);
  if (!theme) return language === "en" ? "Custom" : "사용자 정의";
  return theme.name[language === "en" ? "en" : "ko"];
}

export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function sanitizeCustomTheme(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    mode: source.mode === "light" ? "light" : "dark",
    bg: isHexColor(source.bg) ? source.bg.toLowerCase() : DEFAULT_CUSTOM_THEME.bg,
    text: isHexColor(source.text) ? source.text.toLowerCase() : DEFAULT_CUSTOM_THEME.text,
    accent: isHexColor(source.accent) ? source.accent.toLowerCase() : DEFAULT_CUSTOM_THEME.accent,
  };
}

export function themeColors(id, custom) {
  if (id === CUSTOM_THEME_ID) {
    const own = sanitizeCustomTheme(custom);
    const dark = own.mode === "dark";
    return {
      id,
      mode: own.mode,
      bg: own.bg,
      bgTop: mix(own.bg, dark ? "#ffffff" : "#ffffff", dark ? 0.06 : 0.5),
      surface: mix(own.bg, own.text, 0.1),
      text: own.text,
      muted: mix(own.text, own.bg, 0.35),
      accent: own.accent,
      danger: dark ? "#ff9b9b" : "#c4473a",
    };
  }
  return THEMES.find((theme) => theme.id === id) || THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);
}

export function backgroundAlpha(transparency) {
  const value = Math.min(100, Math.max(0, Number.isFinite(Number(transparency)) ? Number(transparency) : 0));
  return Math.round((1 - (value / 100) * (1 - MIN_ALPHA)) * 1000) / 1000;
}

/** CSS variables for a theme; only the window background follows the transparency, text stays opaque. */
export function themeVars(colors, transparency = 0) {
  const alpha = backgroundAlpha(transparency);
  const dark = colors.mode === "dark";
  return {
    "--bg": rgba(colors.bg, alpha),
    "--bg-top": rgba(colors.bgTop, Math.min(1, alpha + 0.08)),
    "--bg-solid": colors.bg,
    "--bg-top-solid": colors.bgTop,
    "--surface": dark ? "rgba(255, 255, 255, 0.09)" : rgba(colors.surface, 0.72),
    "--surface-strong": dark ? "rgba(255, 255, 255, 0.16)" : colors.surface,
    "--fg": colors.text,
    "--muted": colors.muted,
    "--accent": colors.accent,
    "--accent-text": accentInk(colors.accent),
    "--line": dark ? "rgba(255, 255, 255, 0.22)" : "rgba(29, 42, 58, 0.18)",
    "--danger": colors.danger,
    "--shadow": "rgba(0, 0, 0, 0.28)",
  };
}

export function applyThemeVars(element, vars, mode) {
  if (!element?.style) return;
  for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
  if (mode) {
    element.dataset.mode = mode;
    element.style.colorScheme = mode;
  }
}

export function rgba(hex, alpha) {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function accentInk(hex) {
  const [r, g, b] = channels(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.64 ? "#17202a" : "#ffffff";
}

function channels(hex) {
  const value = String(hex || "#000000").replace("#", "");
  return [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16) || 0);
}

function mix(a, b, amount) {
  const left = channels(a);
  const right = channels(b);
  return `#${left
    .map((value, index) => Math.round(value + (right[index] - value) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}
