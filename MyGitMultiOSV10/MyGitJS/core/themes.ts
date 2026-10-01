import { publishAppearance } from "./appearance";

export type ThemeMode = "light" | "dark";

export type Theme = {
  id: string;
  nameKo: string;
  nameEn: string;
  mode: ThemeMode;
  swatch: [string, string, string];
  vars: Record<string, string>;
};

export const DEFAULT_THEME_ID = "light-classic";

function onAccent(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 170 ? "#1a1a1a" : "#ffffff";
}

function theme(
  mode: ThemeMode,
  id: string,
  nameKo: string,
  nameEn: string,
  bg: string,
  panel: string,
  ink: string,
  muted: string,
  line: string,
  accent: string,
  soft: string,
  header: string,
  alt: string,
  danger: string,
): Theme {
  const light = mode === "light";
  return {
    id: `${mode}-${id}`,
    nameKo,
    nameEn,
    mode,
    swatch: [bg, panel, accent],
    vars: {
      "--bg": bg,
      "--panel": panel,
      "--ink": ink,
      "--muted": muted,
      "--line": line,
      "--accent": accent,
      "--accent-soft": soft,
      "--header": header,
      "--danger": danger,
      "--chrome": light ? header : bg,
      "--hover": soft,
      "--button": panel,
      "--button-border": line,
      "--pop": panel,
      "--selected": soft,
      "--row-line": line,
      "--alt-row": alt,
      "--head-ink": ink,
      "--ref-bg": soft,
      "--ref-ink": accent,
      "--add-bg": light ? "#e7f7ee" : "#14352c",
      "--add-ink": light ? "#067647" : "#6ee7b7",
      "--del-bg": light ? "#fdecec" : "#3f1d24",
      "--del-ink": light ? "#b42318" : "#fca5a5",
      "--hunk-bg": soft,
      "--hunk-ink": accent,
      "--input": panel,
      "--banner-bg": light ? "#fff7ed" : "#3b2a14",
      "--banner-ink": light ? "#9a3412" : "#fdba74",
      "--overlay": light ? "rgba(16, 24, 40, 0.35)" : "rgba(0, 0, 0, 0.55)",
      "--on-accent": onAccent(accent),
      "--shadow": light ? "0 8px 24px rgba(16, 24, 40, 0.12)" : "0 8px 24px rgba(0, 0, 0, 0.45)",
    },
  };
}

export const THEMES: Theme[] = [
  theme("light", "classic", "클래식", "Classic", "#f3f4f6", "#ffffff", "#1f2328", "#667085", "#d8dbe2", "#2563eb", "#e8efff", "#eef2f6", "#fcfcfd", "#dc2626"),
  theme("light", "paper", "종이", "Paper", "#f6f1e7", "#fffaf3", "#3f3428", "#8a7564", "#e4d8c8", "#9a3412", "#f8ebe3", "#f3eadf", "#fffdf8", "#b45309"),
  theme("light", "snow", "눈", "Snow", "#f4f7fb", "#ffffff", "#1e293b", "#64748b", "#dbe3ee", "#0284c7", "#e0f2fe", "#eef4fa", "#f8fbff", "#e11d48"),
  theme("light", "mint", "민트", "Mint", "#f3faf6", "#ffffff", "#14352b", "#5f7d72", "#d5e7de", "#059669", "#e7f7ee", "#eef8f3", "#f7fdf9", "#dc2626"),
  theme("light", "sand", "모래", "Sand", "#f7f3ea", "#fffdf8", "#3d3426", "#8d7b64", "#e6dccb", "#b45309", "#fef3c7", "#f4efe4", "#fffaf2", "#c2410c"),
  theme("light", "rose", "장미", "Rose", "#fdf2f4", "#ffffff", "#3f1d2a", "#9d6b7b", "#f3d5dc", "#e11d48", "#ffe4e6", "#fbecef", "#fff7f8", "#be123c"),
  theme("light", "lavender", "라벤더", "Lavender", "#f6f4fb", "#ffffff", "#2e1065", "#7c6a9a", "#e4dff0", "#7c3aed", "#f3e8ff", "#f3f0fa", "#fbfaff", "#db2777"),
  theme("light", "sky", "하늘", "Sky", "#f0f9ff", "#ffffff", "#0c4a6e", "#5b7c90", "#d5e8f2", "#0284c7", "#e0f2fe", "#e8f4fb", "#f7fcff", "#e11d48"),
  theme("light", "lemon", "레몬", "Lemon", "#fbf8ef", "#fffef8", "#3f3a1e", "#8a8158", "#ebe4c4", "#ca8a04", "#fef9c3", "#f7f3e2", "#fffdf5", "#dc2626"),
  theme("light", "ocean", "바다", "Ocean", "#eef3f7", "#f8fbfc", "#163042", "#5d7384", "#d3dee6", "#0f766e", "#ccfbf1", "#e7eef3", "#f4f8fa", "#dc2626"),
  theme("light", "forest", "숲", "Forest", "#f2f6f1", "#fbfdfb", "#1c3324", "#5e7564", "#d4e0d6", "#15803d", "#dcfce7", "#eaf2ea", "#f7fbf7", "#b91c1c"),
  theme("light", "cherry", "체리", "Cherry", "#fff5f5", "#ffffff", "#451a1a", "#9a6a6a", "#f3d6d6", "#dc2626", "#fee2e2", "#fbeeee", "#fffafa", "#9f1239"),
  theme("light", "graphite", "흑연", "Graphite", "#f2f2f2", "#fafafa", "#1a1a1a", "#6b6b6b", "#d9d9d9", "#404040", "#ececec", "#eaeaea", "#f7f7f7", "#dc2626"),
  theme("light", "pearl", "진주", "Pearl", "#f7f5f2", "#fffcf9", "#2c2825", "#7d746c", "#e5dfd8", "#57534e", "#f5f0eb", "#f1ece7", "#fbf9f7", "#c2410c"),
  theme("light", "aqua", "아쿠아", "Aqua", "#f0fdfa", "#ffffff", "#134e4a", "#5f8a86", "#d1efeb", "#0d9488", "#ccfbf1", "#e6f7f5", "#f7fffe", "#e11d48"),
  theme("light", "blossom", "꽃", "Blossom", "#fff7fb", "#ffffff", "#4a1942", "#946888", "#f3d7ea", "#db2777", "#fce7f3", "#fbeff6", "#fff9fc", "#be123c"),
  theme("light", "amber", "호박", "Amber", "#fff8ef", "#ffffff", "#431407", "#9a6b45", "#f3e0c8", "#d97706", "#ffedd5", "#fbf1e4", "#fffbf5", "#dc2626"),
  theme("light", "indigo", "남색", "Indigo", "#f4f6fb", "#ffffff", "#1e1b4b", "#6d6a8d", "#dfe3f1", "#4338ca", "#e0e7ff", "#eceff8", "#f8f9fd", "#e11d48"),
  theme("light", "sage", "세이지", "Sage", "#f4f6f2", "#fbfcf8", "#2a3324", "#6d7864", "#dde3d6", "#4d7c0f", "#ecfccb", "#eef2ea", "#f8faf5", "#b91c1c"),
  theme("light", "porcelain", "자기", "Porcelain", "#f8fafc", "#ffffff", "#0f172a", "#64748b", "#e2e8f0", "#0369a1", "#e0f2fe", "#f1f5f9", "#f8fafc", "#e11d48"),

  theme("dark", "midnight", "자정", "Midnight", "#0f1419", "#161b22", "#e6edf3", "#8b949e", "#30363d", "#58a6ff", "#1c2d41", "#1c2128", "#1a2028", "#f85149"),
  theme("dark", "ink", "잉크", "Ink", "#121212", "#1c1c1c", "#f2f2f2", "#a3a3a3", "#2e2e2e", "#d4d4d4", "#2a2a2a", "#181818", "#202020", "#f87171"),
  theme("dark", "navy", "네이비", "Navy", "#0b1220", "#111a2e", "#e2e8f0", "#94a3b8", "#243049", "#60a5fa", "#1e293b", "#0f172a", "#152036", "#fb7185"),
  theme("dark", "grove", "밤숲", "Grove", "#0e1612", "#15201a", "#e7f5ec", "#8eaa98", "#2a3b32", "#34d399", "#16352b", "#121c17", "#18241e", "#f87171"),
  theme("dark", "wine", "와인", "Wine", "#1a1014", "#24161c", "#f8e8ee", "#c4a3b0", "#3d2832", "#fb7185", "#3f1d2e", "#201318", "#2a1a22", "#fda4af"),
  theme("dark", "slate", "슬레이트", "Slate", "#0f172a", "#1e293b", "#e2e8f0", "#94a3b8", "#334155", "#38bdf8", "#1e3a4c", "#172033", "#243044", "#f87171"),
  theme("dark", "ember", "잔화", "Ember", "#1a120b", "#24180f", "#f8efe6", "#c4b3a3", "#3d2e22", "#fb923c", "#3b2414", "#20160f", "#2a1d14", "#f87171"),
  theme("dark", "violet", "보라", "Violet", "#140f1f", "#1c152b", "#f3e8ff", "#c4b5d6", "#342848", "#c084fc", "#2a2040", "#191326", "#221a33", "#fb7185"),
  theme("dark", "graphite", "흑연", "Graphite", "#18181b", "#232326", "#f4f4f5", "#a1a1aa", "#3f3f46", "#a1a1aa", "#2a2a2e", "#1f1f23", "#27272a", "#f87171"),
  theme("dark", "trench", "심해", "Trench", "#071316", "#0e1c20", "#e6f4f6", "#8fb4b8", "#1e3338", "#2dd4bf", "#12343a", "#0b171a", "#122226", "#fb7185"),
  theme("dark", "coffee", "커피", "Coffee", "#1c1410", "#271c16", "#f6efe8", "#cbb8a8", "#3e3028", "#e2b07a", "#3a2a20", "#211812", "#2c211b", "#f87171"),
  theme("dark", "aurora", "오로라", "Aurora", "#0b1218", "#121a22", "#e8f7ff", "#9bb4c4", "#243240", "#67e8f9", "#12323a", "#101820", "#162028", "#fb7185"),
  theme("dark", "carbon", "카본", "Carbon", "#0c0c0c", "#141414", "#ededed", "#9a9a9a", "#2a2a2a", "#f5f5f5", "#262626", "#101010", "#1a1a1a", "#f87171"),
  theme("dark", "plum", "자두", "Plum", "#160f18", "#211621", "#f8eef8", "#c7aec7", "#3a2a3a", "#e879f9", "#3b2040", "#1c121e", "#271a28", "#fb7185"),
  theme("dark", "storm", "폭풍", "Storm", "#12161c", "#1a212b", "#e8eef6", "#9aabbd", "#2c3644", "#93c5fd", "#1e2a3a", "#161c24", "#1f2732", "#f87171"),
  theme("dark", "copper", "구리", "Copper", "#18120e", "#221812", "#f8efe8", "#cbb5a6", "#3c2e26", "#f0a06a", "#3d291c", "#1e1612", "#2a1e18", "#f87171"),
  theme("dark", "arctic", "북극", "Arctic", "#2e3440", "#3b4252", "#eceff4", "#d8dee9", "#4c566a", "#88c0d0", "#3b4a5a", "#343b49", "#434c5e", "#bf616a"),
  theme("dark", "orchid", "난초", "Orchid", "#1b1520", "#261c2c", "#f6e9f8", "#cbb6d0", "#3d3144", "#f0abfc", "#3a2744", "#211828", "#2d2234", "#fb7185"),
  theme("dark", "olive", "올리브", "Olive", "#14160f", "#1c1f14", "#f1f5e6", "#b7c2a4", "#323828", "#bef264", "#2a3318", "#181b12", "#222618", "#f87171"),
  theme("dark", "ice", "얼음", "Ice", "#0d141c", "#141c27", "#e8f1fb", "#9eb0c4", "#2a3848", "#7dd3fc", "#163044", "#111923", "#1a2432", "#fb7185"),
];

const byId = new Map(THEMES.map((item) => [item.id, item]));

export function themeById(id: string | undefined | null): Theme {
  return byId.get(id ?? "") ?? byId.get(DEFAULT_THEME_ID)!;
}

export function nextThemeId(current: string | undefined | null): string {
  const index = THEMES.findIndex((item) => item.id === themeById(current).id);
  return THEMES[(index + 1) % THEMES.length].id;
}

export function isThemeId(id: unknown): id is string {
  return typeof id === "string" && byId.has(id);
}

const THEME_STYLE_ID = "mygit-themes";
const PANEL_VARS = ["--left", "--right", "--files", "--bottom"];
let themeSheetReady = false;

function themeRule(item: Theme): string {
  let body = `color-scheme:${item.mode}`;
  for (const key in item.vars) body += `;${key}:${item.vars[key]}`;
  return `:root[data-theme="${item.id}"]{${body}}`;
}

function ensureThemeSheet(): void {
  if (themeSheetReady) return;
  themeSheetReady = true;
  const node = document.createElement("style");
  node.id = THEME_STYLE_ID;
  node.textContent = THEMES.map(themeRule).join("");
  document.head.appendChild(node);
}

export function applyTheme(id: string | undefined | null): void {
  if (typeof document === "undefined") return;
  const item = themeById(id);
  const root = document.documentElement;
  ensureThemeSheet();
  if (root.style.getPropertyValue("--bg") || root.style.colorScheme) {
    const kept = PANEL_VARS.flatMap((key) => {
      const value = root.style.getPropertyValue(key);
      return value ? [`${key}:${value}`] : [];
    });
    root.style.cssText = kept.join(";");
  }
  if (root.dataset.theme === item.id) return;
  root.dataset.theme = item.id;
  root.dataset.mode = item.mode;
  root.dispatchEvent(new Event("mygit-theme"));
  publishAppearance({ theme: item.id });
}
