function hexToRgb(hex) {
  const raw = String(hex).replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

function mixHex(from, to, amount) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex(
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount
  );
}

function luminance(hex) {
  const channels = hexToRgb(hex).map((value) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function inkFor(hex) {
  return luminance(hex) > 0.45 ? "#1c1917" : "#fafaf9";
}

function makeTheme(id, name, group, spec) {
  const line = group === "dark" ? "rgba(255,247,237,0.10)" : "rgba(28,25,23,0.10)";
  return {
    id,
    name,
    group,
    vars: {
      "--bg": spec.bg,
      "--card": spec.card,
      "--screen": spec.screen,
      "--ink": spec.ink,
      "--muted": spec.muted,
      "--key": spec.key,
      "--key-hover": mixHex(spec.key, spec.ink, 0.14),
      "--fn": spec.fn,
      "--fn-hover": mixHex(spec.fn, spec.ink, 0.16),
      "--op": spec.op,
      "--op-hover": mixHex(spec.op, "#ffffff", 0.16),
      "--op-ink": inkFor(spec.op),
      "--eq": spec.eq,
      "--eq-hover": mixHex(spec.eq, "#ffffff", 0.18),
      "--eq-ink": inkFor(spec.eq),
      "--util": mixHex(spec.key, spec.ink, group === "dark" ? 0.2 : 0.08),
      "--util-ink": spec.ink,
      "--danger": group === "dark" ? "#f87171" : "#dc2626",
      "--chip": spec.card,
      "--line": line,
      "--accent": spec.eq,
      "--focus": spec.eq,
      "--logo-ink": inkFor(spec.eq),
    },
  };
}

const DARK_SPECS = [
  ["앰버", "#100e0c", "#1c1917", "#0c0a09", "#fafaf9", "#a8a29e", "#292524", "#172033", "#9a3412", "#ea580c"],
  ["남색", "#0b1220", "#111a2e", "#070d18", "#e7eefc", "#94a3b8", "#1e293b", "#172554", "#1d4ed8", "#38bdf8"],
  ["숲", "#0c1410", "#13201a", "#08110d", "#ecfdf3", "#86efac", "#1a2e24", "#14532d", "#166534", "#4ade80"],
  ["석영", "#12141a", "#1b1f2a", "#0d1016", "#f1f5f9", "#94a3b8", "#262b38", "#1e293b", "#475569", "#94a3b8"],
  ["포도", "#140c18", "#221432", "#0e0814", "#faf5ff", "#d8b4fe", "#3b2354", "#4c1d95", "#7e22ce", "#c084fc"],
  ["심해", "#071316", "#0e2428", "#041014", "#ecfeff", "#67e8f9", "#134e4a", "#164e63", "#0f766e", "#2dd4bf"],
  ["석류", "#160b0d", "#2a1216", "#10070a", "#fff1f2", "#fda4af", "#4c1d24", "#7f1d1d", "#be123c", "#fb7185"],
  ["흑연", "#111111", "#1c1c1c", "#0a0a0a", "#f5f5f5", "#a3a3a3", "#2a2a2a", "#262626", "#525252", "#e5e5e5"],
  ["에메랄드", "#071512", "#0f241e", "#04110e", "#ecfdf5", "#6ee7b7", "#134e43", "#064e3b", "#047857", "#34d399"],
  ["장미", "#180910", "#2a1220", "#12060c", "#fff1f2", "#fda4af", "#4a1d34", "#831843", "#be185d", "#fb7185"],
  ["인디고", "#0d1024", "#161a38", "#090c1c", "#eef2ff", "#a5b4fc", "#23285a", "#312e81", "#4338ca", "#818cf8"],
  ["구리", "#16110c", "#2a2118", "#100c08", "#fff7ed", "#fdba74", "#44362a", "#7c2d12", "#c2410c", "#fb923c"],
  ["북극", "#0c1218", "#15202b", "#080e14", "#f0f9ff", "#7dd3fc", "#1e293b", "#0c4a6e", "#0369a1", "#7dd3fc"],
  ["라벤더", "#14121c", "#221e30", "#0e0c16", "#f5f3ff", "#c4b5fd", "#312e48", "#4c1d95", "#6d28d9", "#a78bfa"],
  ["올리브", "#12140c", "#1e2414", "#0c0e08", "#f7fee7", "#bef264", "#2d3518", "#3f6212", "#4d7c0f", "#a3e635"],
  ["자홍", "#160816", "#2a1230", "#100610", "#fdf4ff", "#f0abfc", "#4a1948", "#86198f", "#c026d3", "#e879f9"],
  ["빙하", "#101418", "#1a222b", "#0b1014", "#f8fafc", "#cbd5e1", "#243140", "#1e3a4c", "#334155", "#cbd5e1"],
  ["모래", "#161310", "#292218", "#100e0b", "#faf6f1", "#d6d3d1", "#3f342c", "#57534e", "#a16207", "#fbbf24"],
  ["네온", "#070b0c", "#10181a", "#040808", "#ecfeff", "#67e8f9", "#164e4a", "#083344", "#0e7490", "#22d3ee"],
  ["플럼", "#120c14", "#241828", "#0c0810", "#fdf2f8", "#f9a8d4", "#3b243f", "#701a75", "#a21caf", "#f472b6"],
];

const LIGHT_SPECS = [
  ["종이", "#f6f1ea", "#fffaf5", "#fffdfb", "#1c1917", "#78716c", "#f0e7dc", "#efe4ff", "#c2410c", "#ea580c"],
  ["눈", "#f4f7fb", "#ffffff", "#f8fbff", "#0f172a", "#64748b", "#e8eef6", "#e0e7ff", "#1d4ed8", "#0284c7"],
  ["민트", "#eef8f4", "#f7fffb", "#fbfffd", "#064e3b", "#3f7d68", "#dff3ea", "#d1fae5", "#047857", "#0f766e"],
  ["하늘", "#eef6ff", "#f8fbff", "#fcfeff", "#0c4a6e", "#0369a1", "#e0f2fe", "#dbeafe", "#0369a1", "#0284c7"],
  ["모래", "#f7f1e6", "#fffaf3", "#fffdf8", "#44403c", "#78716c", "#f3e6d4", "#ffedd5", "#b45309", "#d97706"],
  ["라일락", "#f6f2fb", "#fdfbff", "#fffcff", "#3b0764", "#7e22ce", "#efe6fb", "#f3e8ff", "#7e22ce", "#9333ea"],
  ["복숭아", "#fff1ea", "#fff8f5", "#fffdfb", "#7c2d12", "#c2410c", "#ffe4d6", "#ffedd5", "#ea580c", "#f97316"],
  ["안개", "#eef1f4", "#f8fafc", "#fcfdfe", "#1e293b", "#64748b", "#e2e8f0", "#e0e7ff", "#475569", "#334155"],
  ["아이보리", "#f7f3e8", "#fffdf6", "#fffef9", "#3f3a32", "#78716c", "#efe6d2", "#f5f0e6", "#a16207", "#ca8a04"],
  ["세이지", "#eef3ea", "#f7fbf4", "#fcfefb", "#1a2e16", "#4d7c0f", "#e3edd8", "#ecfccb", "#4d7c0f", "#65a30d"],
  ["장미빛", "#fff0f3", "#fff7f8", "#fffdfd", "#881337", "#be123c", "#ffe4e9", "#ffe4e6", "#e11d48", "#f43f5e"],
  ["구름", "#f3f4f6", "#ffffff", "#fafafa", "#111827", "#6b7280", "#e5e7eb", "#e0e7ff", "#4b5563", "#111827"],
  ["레몬", "#fbf8e8", "#fffdf3", "#fffef8", "#3f3a12", "#a16207", "#f6efc4", "#fef9c3", "#ca8a04", "#eab308"],
  ["아쿠아", "#e7f7f6", "#f4fffe", "#fbfffe", "#134e4a", "#0f766e", "#d5f3f0", "#ccfbf1", "#0f766e", "#14b8a6"],
  ["산호", "#fff0ec", "#fff8f6", "#fffdfc", "#7f1d1d", "#ea580c", "#ffddd4", "#ffedd5", "#ea580c", "#f97316"],
  ["연보라", "#f4f0ff", "#fbfaff", "#fefeff", "#3730a3", "#6d28d9", "#e9e2ff", "#ede9fe", "#6d28d9", "#7c3aed"],
  ["돌", "#f1f0ee", "#fafaf9", "#fdfdfc", "#292524", "#78716c", "#e7e5e4", "#f5f5f4", "#57534e", "#44403c"],
  ["청백", "#eaf2fb", "#f7fbff", "#fcfeff", "#1e3a8a", "#1d4ed8", "#dbeafe", "#e0e7ff", "#1d4ed8", "#2563eb"],
  ["녹차", "#eef6e8", "#f6fbf3", "#fcfefb", "#14532d", "#3f6212", "#dceccf", "#ecfccb", "#3f6212", "#4d7c0f"],
  ["진주", "#f7f2f4", "#fffafb", "#fffdfd", "#4a044e", "#a21caf", "#f3e4ea", "#fae8ff", "#a21caf", "#c026d3"],
];

function specTheme(group, index, row) {
  const [name, bg, card, screen, ink, muted, key, fn, op, eq] = row;
  return makeTheme(`${group}-${index + 1}`, name, group, { bg, card, screen, ink, muted, key, fn, op, eq });
}

const THEMES = [
  ...DARK_SPECS.map((row, index) => specTheme("dark", index, row)),
  ...LIGHT_SPECS.map((row, index) => specTheme("light", index, row)),
];

const CUSTOM_FIELDS = [
  ["bg", "배경"],
  ["card", "카드"],
  ["screen", "화면"],
  ["ink", "글자"],
  ["key", "숫자 키"],
  ["op", "연산 키"],
  ["eq", "결과 키"],
];

const THEME_STORAGE_KEY = "mycalc-theme";

function themeById(id) {
  return THEMES.find((theme) => theme.id === id) || null;
}

function applyVars(vars, scheme) {
  const root = document.documentElement;
  root.dataset.scheme = scheme;
  root.style.colorScheme = scheme;
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
}

function applyTheme(theme) {
  applyVars(theme.vars, theme.group === "light" ? "light" : "dark");
  document.documentElement.dataset.theme = theme.id;
  if (typeof board !== "undefined" && board.canvas?.width) board.draw();
}

function readStoredTheme() {
  try {
    return JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function storeTheme(payload) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload));
}

function themeFromCustom(picks) {
  const muted = mixHex(picks.ink, picks.bg, 0.45);
  const fn = mixHex(picks.card, picks.ink, 0.18);
  return makeTheme("custom", "사용자 정의", luminance(picks.bg) > 0.45 ? "light" : "dark", {
    bg: picks.bg,
    card: picks.card,
    screen: picks.screen,
    ink: picks.ink,
    muted,
    key: picks.key,
    fn,
    op: picks.op,
    eq: picks.eq,
  });
}

function loadTheme() {
  const stored = readStoredTheme();
  if (stored?.id === "custom" && stored.picks) {
    applyTheme(themeFromCustom(stored.picks));
    return stored;
  }
  const preset = themeById(stored?.id) || THEMES[0];
  applyTheme(preset);
  return { id: preset.id };
}
