// 40 colour themes — 20 dark, 20 light.
//
// A theme only names a few key colours (background, panel, text, accent and
// optional canvas tints); the full set of UI tokens and the schematic / PCB
// canvas palettes are derived from them, so every theme stays consistent and
// readable. Each theme: { id, name: {ko, en}, mode, bg, panel, text, accent,
// sch?, pcb? } where sch/pcb are optional canvas background colours.

const D = (id, ko, en, bg, panel, text, accent, sch, pcb) => ({ id, name: { ko, en }, mode: "dark", bg, panel, text, accent, sch, pcb });
const Lt = (id, ko, en, bg, panel, text, accent, sch, pcb) => ({ id, name: { ko, en }, mode: "light", bg, panel, text, accent, sch, pcb });

export const THEMES = [
  // ---------------------------------------------------------------- dark
  D("midnight", "미드나이트", "Midnight", "#15181e", "#1c2028", "#e3e6ec", "#4f9dff"),
  D("graphite", "그래파이트", "Graphite", "#1a1a1a", "#222222", "#e6e6e6", "#8ab4f8"),
  D("nord", "노르드", "Nord", "#2e3440", "#3b4252", "#eceff4", "#88c0d0", "#2b303b", "#242933"),
  D("dracula", "드라큘라", "Dracula", "#21222c", "#282a36", "#f8f8f2", "#bd93f9"),
  D("monokai", "모노카이", "Monokai", "#1e1f1c", "#272822", "#f8f8f2", "#a6e22e"),
  D("solarized-dark", "솔라라이즈드 다크", "Solarized Dark", "#00212b", "#002b36", "#eee8d5", "#268bd2", "#002b36", "#00212b"),
  D("gruvbox-dark", "그루브박스 다크", "Gruvbox Dark", "#1d2021", "#282828", "#ebdbb2", "#fabd2f"),
  D("one-dark", "원 다크", "One Dark", "#21252b", "#282c34", "#dcdfe4", "#61afef"),
  D("tokyo-night", "도쿄 나이트", "Tokyo Night", "#16161e", "#1a1b26", "#c0caf5", "#7aa2f7"),
  D("mocha", "카푸치노 모카", "Catppuccin Mocha", "#181825", "#1e1e2e", "#cdd6f4", "#cba6f7"),
  D("oceanic", "오셔닉", "Oceanic", "#0f1c24", "#162630", "#d8e6ee", "#4fc3f7"),
  D("forest", "포레스트", "Forest", "#121a14", "#18231b", "#dfeadf", "#5fd38d"),
  D("crimson", "크림슨", "Crimson", "#1a1214", "#23181b", "#f0e2e4", "#ff6b81"),
  D("amethyst", "애미시스트", "Amethyst", "#17121f", "#1f1829", "#ebe2f5", "#b388ff"),
  D("cyberpunk", "사이버펑크", "Cyberpunk", "#0d0b14", "#15111f", "#f2ecff", "#ff2fd6", "#0f0c18", "#0a0812"),
  D("slate", "슬레이트", "Slate", "#1b2230", "#222b3b", "#e2e8f0", "#38bdf8"),
  D("espresso", "에스프레소", "Espresso", "#1b1613", "#241d19", "#efe5dc", "#e0a458"),
  D("deep-sea", "딥 씨", "Deep Sea", "#06141c", "#0b1e29", "#d4ecf5", "#22d3ee"),
  D("aurora", "오로라", "Aurora", "#0f1420", "#151c2c", "#e0f2ec", "#34d399"),
  D("hc-dark", "고대비 다크", "High Contrast Dark", "#000000", "#0b0b0b", "#ffffff", "#ffd400", "#000000", "#000000"),
  // ---------------------------------------------------------------- light
  Lt("daylight", "데이라이트", "Daylight", "#eef0f4", "#ffffff", "#1d2330", "#1a73e8"),
  Lt("paper", "페이퍼", "Paper", "#f4f1ea", "#fbf9f4", "#2a2622", "#b5651d"),
  Lt("solarized-light", "솔라라이즈드 라이트", "Solarized Light", "#eee8d5", "#fdf6e3", "#073642", "#268bd2"),
  Lt("gruvbox-light", "그루브박스 라이트", "Gruvbox Light", "#ebdbb2", "#fbf1c7", "#3c3836", "#af3a03"),
  Lt("nord-light", "노르드 라이트", "Nord Light", "#e5e9f0", "#eceff4", "#2e3440", "#5e81ac"),
  Lt("github-light", "깃허브 라이트", "GitHub Light", "#f6f8fa", "#ffffff", "#1f2328", "#0969da"),
  Lt("sakura", "사쿠라", "Sakura", "#fbeff2", "#fff8fa", "#3a2a30", "#d6336c"),
  Lt("mint", "민트", "Mint", "#e9f6f0", "#f6fcf9", "#1f332b", "#0f9d6e"),
  Lt("sky", "스카이", "Sky", "#e8f2fb", "#f6fafe", "#1c2b3a", "#0284c7"),
  Lt("sand", "샌드", "Sand", "#f1ead9", "#faf6ec", "#3a3326", "#c2410c"),
  Lt("lavender", "라벤더", "Lavender", "#efeaf8", "#f9f6fd", "#2c2440", "#7c3aed"),
  Lt("latte", "카푸치노 라테", "Catppuccin Latte", "#e6e9ef", "#eff1f5", "#4c4f69", "#8839ef"),
  Lt("ivory", "아이보리", "Ivory", "#f7f5ef", "#fffefa", "#26241f", "#4d7c0f"),
  Lt("peach", "피치", "Peach", "#fdeee6", "#fff7f2", "#3d2a22", "#ea580c"),
  Lt("lime", "라임", "Lime", "#eff6e4", "#f9fdf3", "#283219", "#65a30d"),
  Lt("arctic", "아틱", "Arctic", "#eef4f7", "#fbfdfe", "#1e2a31", "#0e7490"),
  Lt("rose", "로즈", "Rose", "#f8ecee", "#fef7f8", "#3b2328", "#be123c"),
  Lt("cobalt-light", "코발트 라이트", "Cobalt Light", "#e9eef8", "#f7f9fe", "#18233c", "#1d4ed8"),
  Lt("stone", "스톤", "Stone", "#eceae6", "#f8f7f5", "#292524", "#57534e"),
  Lt("hc-light", "고대비 라이트", "High Contrast Light", "#ffffff", "#ffffff", "#000000", "#0033cc", "#ffffff", "#ffffff"),
];

export const DEFAULT_THEME = { dark: "midnight", light: "daylight" };

// User-defined themes (Settings → Themes → New custom theme) live in the
// settings and are registered here next to the built-in ones.
let CUSTOM = [];

export function setCustomThemes(list) {
  CUSTOM = (list || []).filter((t) => t && t.id && t.bg && t.panel && t.text && t.accent).map((t) => ({ ...t, custom: true, mode: t.mode === "light" ? "light" : "dark", name: typeof t.name === "string" ? { ko: t.name, en: t.name } : t.name }));
}

export function customThemes() {
  return CUSTOM.slice();
}

export function allThemes() {
  return [...THEMES, ...CUSTOM];
}

export function themeById(id) {
  if (id === "dark") return THEMES.find((t) => t.id === DEFAULT_THEME.dark);
  if (id === "light") return THEMES.find((t) => t.id === DEFAULT_THEME.light);
  return THEMES.find((t) => t.id === id) || CUSTOM.find((t) => t.id === id) || null;
}

// A different theme at random (the palette button).
export function randomTheme(currentId, rnd = Math.random) {
  const pool = allThemes().filter((t) => t.id !== currentId);
  return pool[Math.floor(rnd() * pool.length)] || THEMES[0];
}

// ---------------------------------------------------------------- colour maths
function rgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}
export function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return hex(A.map((v, i) => v + (B[i] - v) * t));
}
function luminance(c) {
  const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const alpha = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };

// Full set of CSS custom properties for a theme.
export function uiTokens(th) {
  const dark = th.mode === "dark";
  const p = th.panel;
  const tx = th.text;
  const accentText = contrast(th.accent, "#ffffff") >= 3 ? "#ffffff" : "#111111";
  return {
    "--bg": th.bg,
    "--panel": p,
    "--panel2": dark ? mix(p, tx, 0.04) : mix(th.bg, p, 0.5),
    "--panel3": dark ? mix(p, tx, 0.09) : mix(th.bg, tx, 0.06),
    "--line": dark ? mix(p, tx, 0.12) : mix(th.bg, tx, 0.1),
    "--line2": dark ? mix(p, tx, 0.19) : mix(th.bg, tx, 0.18),
    "--text": tx,
    "--muted": mix(tx, th.bg, dark ? 0.38 : 0.35),
    "--faint": mix(tx, th.bg, dark ? 0.55 : 0.5),
    "--accent": th.accent,
    "--accent-text": accentText,
    "--accent-soft": alpha(th.accent, dark ? 0.16 : 0.12),
    "--hover": dark ? alpha(tx, 0.06) : alpha(tx, 0.05),
    "--press": dark ? alpha(tx, 0.1) : alpha(tx, 0.09),
    "--input": dark ? mix(th.bg, "#000000", 0.2) : "#ffffff",
    "--shadow": dark ? "0 12px 32px rgba(0, 0, 0, 0.45)" : "0 12px 32px rgba(20, 30, 50, 0.18)",
  };
}

// Canvas overrides merged over the base schematic / PCB palettes.
export function canvasColors(th) {
  const dark = th.mode === "dark";
  const schBg = th.sch || (dark ? mix(th.bg, th.panel, 0.4) : mix(th.bg, "#ffffff", 0.6));
  const pcbBg = th.pcb || (dark ? mix(th.bg, "#000000", 0.3) : mix(th.bg, "#ffffff", 0.4));
  return {
    sch: { bg: schBg, grid: mix(schBg, th.text, dark ? 0.16 : 0.18), gridMajor: mix(schBg, th.text, dark ? 0.26 : 0.32), select: th.accent },
    pcb: { bg: pcbBg, board: dark ? mix(pcbBg, th.text, 0.04) : mix(pcbBg, th.text, 0.05), grid: mix(pcbBg, th.text, dark ? 0.14 : 0.16), gridMajor: mix(pcbBg, th.text, dark ? 0.24 : 0.28), select: dark ? "#ffffff" : "#000000" },
  };
}
