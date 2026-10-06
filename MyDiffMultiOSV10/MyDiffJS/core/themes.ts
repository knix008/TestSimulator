/** Theme tokens shared by the browser (CSS variables) and Electron (window background). */

export type ThemeId = "light" | "dark";

export type Theme = { id: ThemeId; background: string; vars: Record<string, string> };

const LIGHT: Theme = {
  id: "light",
  background: "#f1f3f7",
  vars: {
    "--bg": "#f1f3f7",
    "--panel": "#ffffff",
    "--panel-2": "#f8fafc",
    "--border": "#e2e8f0",
    "--border-strong": "#cbd5e1",
    "--text": "#1e293b",
    "--muted": "#64748b",
    "--accent": "#2563eb",
    "--accent-soft": "#dbeafe",
    "--hover": "#eef2f7",
    "--selection": "#deeafc",
    "--row-even": "#ffffff",
    "--row-zebra": "#eef1f6",
    "--row-added": "#dcfce7",
    "--row-removed": "#ffe4e4",
    "--row-modified": "#fff3cd",
    "--row-blank": "#f4f6f9",
    "--word-added": "#86efac",
    "--word-removed": "#fca5a5",
    "--word-modified": "#fcd34d",
    "--gutter-bg": "#f8fafc",
    "--gutter-text": "#64748b",
    "--overview-bg": "#f8fafc",
    "--overview-viewport": "rgba(100, 116, 139, 0.28)",
    "--added-accent": "#22c55e",
    "--removed-accent": "#ef4444",
    "--modified-accent": "#f59e0b",
    "--binary-diff-text": "#b91c1c",
    "--shadow": "0 10px 30px rgba(15, 23, 42, 0.12)",
  },
};

const DARK: Theme = {
  id: "dark",
  background: "#111722",
  vars: {
    "--bg": "#111722",
    "--panel": "#18202e",
    "--panel-2": "#141b27",
    "--border": "#27313f",
    "--border-strong": "#3a4553",
    "--text": "#e2e8f0",
    "--muted": "#94a3b8",
    "--accent": "#60a5fa",
    "--accent-soft": "#1e3a5f",
    "--hover": "#1f2937",
    "--selection": "#24395c",
    "--row-even": "#18202e",
    "--row-zebra": "#1c2533",
    "--row-added": "#15321f",
    "--row-removed": "#3a1d1d",
    "--row-modified": "#3a2f12",
    "--row-blank": "#141a24",
    "--word-added": "#2f6b43",
    "--word-removed": "#7f3535",
    "--word-modified": "#7a5c14",
    "--gutter-bg": "#141b27",
    "--gutter-text": "#8595ab",
    "--overview-bg": "#141b27",
    "--overview-viewport": "rgba(148, 163, 184, 0.3)",
    "--added-accent": "#34d399",
    "--removed-accent": "#f87171",
    "--modified-accent": "#fbbf24",
    "--binary-diff-text": "#fca5a5",
    "--shadow": "0 10px 30px rgba(0, 0, 0, 0.45)",
  },
};

export const THEMES: Theme[] = [LIGHT, DARK];

export function isThemeId(value: unknown): value is ThemeId {
  return value === "light" || value === "dark";
}

export function theme(id: unknown): Theme {
  return isThemeId(id) && id === "dark" ? DARK : LIGHT;
}

export function themeBackground(id: unknown): string {
  return theme(id).background;
}

export function applyTheme(id: unknown): Theme {
  const selected = theme(id);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(selected.vars)) root.style.setProperty(name, value);
  root.dataset.theme = selected.id;
  root.style.colorScheme = selected.id;
  return selected;
}

/** Pastel swatches offered for the pane title bars, ported from the WinForms palette. */
export const HEADER_PALETTE = [
  "#dcf5d2", "#d2ebff", "#ffe4eb", "#fff0d2", "#e8e0ff",
  "#d2f5f0", "#ffe8dc", "#f0e6ff", "#fff8d2", "#d7f0ff",
  "#e1fae1", "#ffe1f0", "#ebf5ff", "#f5ebdc", "#dcfffa",
  "#ffebe1", "#e6ffdc", "#e1e6ff", "#fff5e6", "#c8f0ff",
];

export const DEFAULT_LEFT_HEADER = "#dcf5d2";
export const DEFAULT_RIGHT_HEADER = "#d2ebff";

/** Readable text color for a pastel header background (same ratio as the WinForms build). */
export function headerTextColor(background: string): string {
  const [r, g, b] = rgb(background);
  const scale = (channel: number) => Math.min(255, Math.max(0, Math.round((channel * 2 + 55) / 3)));
  return `rgb(${scale(r) >> 1}, ${scale(g) >> 1}, ${scale(b) >> 1})`;
}

function rgb(hex: string): [number, number, number] {
  const value = /^#([0-9a-fA-F]{6})$/.test(hex) ? hex.slice(1) : "ffffff";
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}
