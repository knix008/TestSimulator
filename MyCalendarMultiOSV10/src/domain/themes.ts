export interface Theme {
  id: string;
  mode: "light" | "dark";
  name: { en: string; ko: string };
  bg: string;
  bgTop: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  holiday: string;
  today: string;
  border: string;
  toolbar: string;
  shadow: string;
}

interface ThemeInput {
  id: string;
  mode: "light" | "dark";
  name: { en: string; ko: string };
  bg: string;
  bgTop: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  holiday: string;
}

function defineTheme(input: ThemeInput): Theme {
  return {
    ...input,
    today: input.accent,
    border: input.mode === "dark" ? "#ffffff" : "#1d2a3a",
    toolbar: input.bgTop,
    shadow: "#000000",
  };
}

export const themes: Theme[] = [
  defineTheme({ id: "light-paper", mode: "light", name: { en: "Paper", ko: "종이" }, bg: "#f7f8fb", bgTop: "#ffffff", surface: "#e7edf8", text: "#1c2430", muted: "#5d6b80", accent: "#2f6fed", holiday: "#d14343" }),
  defineTheme({ id: "light-sand", mode: "light", name: { en: "Sand", ko: "모래" }, bg: "#f6f0e6", bgTop: "#fffaf3", surface: "#efe4d4", text: "#3a2e22", muted: "#7a6a58", accent: "#c26a2d", holiday: "#c4473a" }),
  defineTheme({ id: "light-mist", mode: "light", name: { en: "Morning Mist", ko: "아침 안개" }, bg: "#eef3f6", bgTop: "#f8fbfc", surface: "#e1ebf0", text: "#1e2a32", muted: "#60727f", accent: "#3d7f99", holiday: "#c44b63" }),
  defineTheme({ id: "light-seaglass", mode: "light", name: { en: "Sea Glass", ko: "바다 유리" }, bg: "#e7f4f1", bgTop: "#f4fbf9", surface: "#d5ebe6", text: "#14332e", muted: "#4e746c", accent: "#1f8a78", holiday: "#d4534a" }),
  defineTheme({ id: "light-sky", mode: "light", name: { en: "Sky", ko: "하늘" }, bg: "#e7f2ff", bgTop: "#f5faff", surface: "#d5e6fb", text: "#16304f", muted: "#5a7394", accent: "#2d74d6", holiday: "#d24b5a" }),
  defineTheme({ id: "light-lavender", mode: "light", name: { en: "Lavender", ko: "라벤더" }, bg: "#f3efff", bgTop: "#fbf9ff", surface: "#e6e0fb", text: "#2d2448", muted: "#6e6490", accent: "#6d5bd0", holiday: "#d4537a" }),
  defineTheme({ id: "light-blush", mode: "light", name: { en: "Blush", ko: "블러시" }, bg: "#fff1f4", bgTop: "#fff8f9", surface: "#ffdfe7", text: "#4a2430", muted: "#8d5d6b", accent: "#d4537c", holiday: "#c62828" }),
  defineTheme({ id: "light-mint", mode: "light", name: { en: "Mint", ko: "민트" }, bg: "#e9f8ef", bgTop: "#f5fdf8", surface: "#d7f0e2", text: "#143524", muted: "#4f7460", accent: "#1e8f52", holiday: "#d4534a" }),
  defineTheme({ id: "light-peach", mode: "light", name: { en: "Peach", ko: "복숭아" }, bg: "#fff1e8", bgTop: "#fff8f4", surface: "#ffe1d2", text: "#4a2c1a", muted: "#8a6550", accent: "#d86a2f", holiday: "#d14343" }),
  defineTheme({ id: "light-lemon", mode: "light", name: { en: "Lemon", ko: "레몬" }, bg: "#fbf6df", bgTop: "#fffceb", surface: "#f3eab8", text: "#3d3414", muted: "#7a7040", accent: "#8a6a00", holiday: "#d14343" }),
  defineTheme({ id: "light-sage", mode: "light", name: { en: "Sage", ko: "세이지" }, bg: "#eef3ea", bgTop: "#f7faf4", surface: "#e0ead6", text: "#24301c", muted: "#627056", accent: "#5d7a3a", holiday: "#c4473a" }),
  defineTheme({ id: "light-slate", mode: "light", name: { en: "Slate", ko: "슬레이트" }, bg: "#eef1f5", bgTop: "#f8f9fb", surface: "#e1e7ef", text: "#1e2733", muted: "#5e6c7e", accent: "#4a6785", holiday: "#c4474b" }),
  defineTheme({ id: "light-rose", mode: "light", name: { en: "Rose Quartz", ko: "로즈 쿼츠" }, bg: "#fdeff3", bgTop: "#fff7f9", surface: "#f8dbe5", text: "#4a2030", muted: "#8a5a6a", accent: "#c43b6e", holiday: "#b4233c" }),
  defineTheme({ id: "light-glacier", mode: "light", name: { en: "Glacier", ko: "빙하" }, bg: "#e8f4f8", bgTop: "#f4fbfd", surface: "#d4ebf2", text: "#14323c", muted: "#4e6e7a", accent: "#1f7f9a", holiday: "#d14b55" }),
  defineTheme({ id: "light-cream", mode: "light", name: { en: "Cream", ko: "크림" }, bg: "#fbf6ee", bgTop: "#fffdf8", surface: "#f0e6d8", text: "#3a3126", muted: "#7d7264", accent: "#b56b3a", holiday: "#c4473a" }),
  defineTheme({ id: "light-matcha", mode: "light", name: { en: "Matcha", ko: "말차" }, bg: "#eef6e4", bgTop: "#f7fbf2", surface: "#e1efd2", text: "#243318", muted: "#61724a", accent: "#6a8f2e", holiday: "#c4533a" }),
  defineTheme({ id: "light-coral", mode: "light", name: { en: "Coral", ko: "코랄" }, bg: "#fff0ec", bgTop: "#fff8f6", surface: "#ffddd6", text: "#4a261e", muted: "#8a6458", accent: "#e15a45", holiday: "#c62828" }),
  defineTheme({ id: "light-periwinkle", mode: "light", name: { en: "Periwinkle", ko: "페리윙클" }, bg: "#eef0ff", bgTop: "#f7f8ff", surface: "#dfe3ff", text: "#242a55", muted: "#656c96", accent: "#5460d6", holiday: "#d4537a" }),
  defineTheme({ id: "light-warmgray", mode: "light", name: { en: "Warm Gray", ko: "웜 그레이" }, bg: "#f3f1ef", bgTop: "#faf9f8", surface: "#e7e3df", text: "#2c2926", muted: "#6f6a64", accent: "#8a5a44", holiday: "#c4473a" }),
  defineTheme({ id: "light-sakura", mode: "light", name: { en: "Sakura", ko: "벚꽃" }, bg: "#fff0f5", bgTop: "#fff8fb", surface: "#ffd9e8", text: "#4a2740", muted: "#8d6880", accent: "#d45d8c", holiday: "#c62848" }),
  defineTheme({ id: "dark-ink", mode: "dark", name: { en: "Ink", ko: "잉크" }, bg: "#14181f", bgTop: "#1c222c", surface: "#ffffff", text: "#eef2f8", muted: "#a7b1c2", accent: "#8eb6ff", holiday: "#ff9b9b" }),
  defineTheme({ id: "dark-midnight", mode: "dark", name: { en: "Midnight", ko: "자정" }, bg: "#0e1424", bgTop: "#172038", surface: "#ffffff", text: "#e7eeff", muted: "#9aabc8", accent: "#7aa2ff", holiday: "#ff9aa8" }),
  defineTheme({ id: "dark-charcoal", mode: "dark", name: { en: "Charcoal", ko: "차콜" }, bg: "#1a1c1e", bgTop: "#24282c", surface: "#ffffff", text: "#f2f4f6", muted: "#b0b6bd", accent: "#e7c27a", holiday: "#ff9d9d" }),
  defineTheme({ id: "dark-navy", mode: "dark", name: { en: "Deep Navy", ko: "딥 네이비" }, bg: "#0c1c33", bgTop: "#133056", surface: "#ffffff", text: "#e7f0ff", muted: "#9eb4d4", accent: "#79b0ff", holiday: "#ff97a8" }),
  defineTheme({ id: "dark-forest", mode: "dark", name: { en: "Forest", ko: "숲" }, bg: "#101c16", bgTop: "#173226", surface: "#ffffff", text: "#e7f6ee", muted: "#9dbead", accent: "#7dcea0", holiday: "#ff9d8d" }),
  defineTheme({ id: "dark-wine", mode: "dark", name: { en: "Wine", ko: "와인" }, bg: "#241018", bgTop: "#3a1826", surface: "#ffffff", text: "#ffe8ef", muted: "#e0b0c0", accent: "#ff8fb3", holiday: "#ffb4b4" }),
  defineTheme({ id: "dark-obsidian", mode: "dark", name: { en: "Obsidian", ko: "흑요석" }, bg: "#0e0f12", bgTop: "#181a20", surface: "#ffffff", text: "#f4f6fb", muted: "#b4b8c4", accent: "#c9a6ff", holiday: "#ff9b9b" }),
  defineTheme({ id: "dark-graphite", mode: "dark", name: { en: "Graphite", ko: "그래파이트" }, bg: "#22262b", bgTop: "#2d333a", surface: "#ffffff", text: "#f3f5f7", muted: "#c0c6ce", accent: "#8fd0ff", holiday: "#ffaaa0" }),
  defineTheme({ id: "dark-aurora", mode: "dark", name: { en: "Aurora", ko: "오로라" }, bg: "#101820", bgTop: "#152833", surface: "#ffffff", text: "#e7fff8", muted: "#9dccc0", accent: "#5ee0c3", holiday: "#ff9ec8" }),
  defineTheme({ id: "dark-ember", mode: "dark", name: { en: "Ember", ko: "잔불" }, bg: "#1c1210", bgTop: "#2e1c16", surface: "#ffffff", text: "#fff1ea", muted: "#e0b8a8", accent: "#ffb086", holiday: "#ff8d7a" }),
  defineTheme({ id: "dark-abyss", mode: "dark", name: { en: "Abyss", ko: "심해" }, bg: "#071318", bgTop: "#0e242c", surface: "#ffffff", text: "#e5f7fb", muted: "#8fb4c0", accent: "#63d2e8", holiday: "#ff9aa8" }),
  defineTheme({ id: "dark-plum", mode: "dark", name: { en: "Plum", ko: "자두" }, bg: "#1a1020", bgTop: "#2a1840", surface: "#ffffff", text: "#f6e9ff", muted: "#c8b0dc", accent: "#d2a6ff", holiday: "#ff9ec0" }),
  defineTheme({ id: "dark-slate", mode: "dark", name: { en: "Dark Slate", ko: "다크 슬레이트" }, bg: "#1b212b", bgTop: "#273140", surface: "#ffffff", text: "#e8eef8", muted: "#aeb8c8", accent: "#9db4d4", holiday: "#ffb0b0" }),
  defineTheme({ id: "dark-espresso", mode: "dark", name: { en: "Espresso", ko: "에스프레소" }, bg: "#1c1410", bgTop: "#2c2118", surface: "#ffffff", text: "#fff4ea", muted: "#d4c0b0", accent: "#e0b080", holiday: "#ff9d7a" }),
  defineTheme({ id: "dark-nord", mode: "dark", name: { en: "Nord", ko: "노르드" }, bg: "#2e3440", bgTop: "#3b4252", surface: "#ffffff", text: "#eceff4", muted: "#d8dee9", accent: "#88c0d0", holiday: "#ff9aa6" }),
  defineTheme({ id: "dark-dracula", mode: "dark", name: { en: "Dracula", ko: "드라큘라" }, bg: "#282a36", bgTop: "#343746", surface: "#ffffff", text: "#f8f8f2", muted: "#c7c8d4", accent: "#bd93f9", holiday: "#ff79c6" }),
  defineTheme({ id: "dark-tokyonight", mode: "dark", name: { en: "Tokyo Night", ko: "도쿄 나이트" }, bg: "#1a1b26", bgTop: "#24283b", surface: "#ffffff", text: "#c0caf5", muted: "#9aa5ce", accent: "#7aa2f7", holiday: "#ff8ea4" }),
  defineTheme({ id: "dark-catppuccin", mode: "dark", name: { en: "Catppuccin", ko: "카푸치노" }, bg: "#1e1e2e", bgTop: "#313244", surface: "#ffffff", text: "#cdd6f4", muted: "#a6adc8", accent: "#cba6f7", holiday: "#ff9eb8" }),
  defineTheme({ id: "dark-solarized", mode: "dark", name: { en: "Solarized", ko: "솔라라이즈드" }, bg: "#002b36", bgTop: "#073642", surface: "#ffffff", text: "#fdf6e3", muted: "#93a1a1", accent: "#2aa198", holiday: "#ff6b63" }),
  defineTheme({ id: "dark-hangang", mode: "dark", name: { en: "Hangang", ko: "한강" }, bg: "#0e1a1f", bgTop: "#143038", surface: "#ffffff", text: "#e5f6f8", muted: "#9ec4c8", accent: "#7fd3c8", holiday: "#ffb0a0" }),
];

export const lightThemes = themes.filter((theme) => theme.mode === "light");
export const darkThemes = themes.filter((theme) => theme.mode === "dark");

export function getTheme(id: string): Theme {
  return themes.find((theme) => theme.id === id) ?? themes.find((theme) => theme.id === "dark-ink")!;
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function accentInk(hex: string): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.64 ? "#17202a" : "#ffffff";
}

export function applyTheme(theme: Theme, opacity: number): void {
  const alpha = Math.min(1, Math.max(0.15, opacity));
  const style = document.documentElement.style;
  style.setProperty("--bg", hexToRgba(theme.bg, alpha));
  style.setProperty("--bg-top", hexToRgba(theme.bgTop, Math.min(1, alpha + 0.08)));
  style.setProperty("--bg-solid", theme.bg);
  style.setProperty("--bg-top-solid", theme.bgTop);
  const surfaceAlpha = theme.mode === "dark" ? Math.max(0.1, alpha * 0.24) : Math.max(0.42, alpha * 0.8);
  style.setProperty("--surface", hexToRgba(theme.surface, surfaceAlpha));
  style.setProperty("--text", theme.text);
  style.setProperty("--muted", theme.muted);
  style.setProperty("--accent", theme.accent);
  style.setProperty("--accent-text", accentInk(theme.accent));
  style.setProperty("--holiday", theme.holiday);
  style.setProperty("--today", theme.today);
  style.setProperty("--border", hexToRgba(theme.border, theme.mode === "dark" ? 0.42 : 0.22));
  style.setProperty("--toolbar", hexToRgba(theme.toolbar, Math.min(1, alpha + 0.06)));
  style.setProperty("--shadow", hexToRgba(theme.shadow, 0.28));
  document.documentElement.dataset.mode = theme.mode;
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = theme.mode;
}
