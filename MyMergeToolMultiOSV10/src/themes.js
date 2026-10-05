(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyMergeThemes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function parseHex(hex) {
    const h = String(hex || "#000000").replace("#", "");
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }

  function rgb(r, g, b) {
    return "#" + [r, g, b].map((n) => clampByte(n).toString(16).padStart(2, "0")).join("");
  }

  function shift(hex, delta) {
    const parts = parseHex(hex);
    return rgb(parts[0] + delta, parts[1] + delta, parts[2] + delta);
  }

  function theme(id, nameKo, nameEn, mode, bg, panel, text, muted, accent, border, toolbar, status, menu) {
    const dark = mode === "dark";
    return {
      id: id,
      nameKo: nameKo,
      nameEn: nameEn,
      mode: mode,
      vars: {
        "--bg": bg,
        "--panel": panel,
        "--text": text,
        "--muted": muted,
        "--accent": accent,
        "--border": border,
        "--toolbar": toolbar,
        "--status": status,
        "--menu": menu,
        "--conflict": dark ? "#6a3038" : "#f3c7c7",
        "--resolved": dark ? "#1d4a38" : "#cfeedd",
        "--local": dark ? "#1d3d5c" : "#d5e6f7",
        "--remote": dark ? "#3d3158" : "#e4daf6",
        "--base": dark ? "#3c3a30" : "#efe6cc",
        "--danger": "#d64545",
        "--ok": "#2f9e6b",
        "--line": dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      },
    };
  }

  function fromPair(row, mode) {
    const bg = row[3];
    const accent = row[4];
    const dark = mode === "dark";
    const panel = shift(bg, dark ? 16 : 10);
    const toolbar = shift(bg, dark ? -10 : -12);
    const status = shift(bg, dark ? -16 : -18);
    const border = shift(bg, dark ? 38 : -30);
    const menu = dark ? shift(bg, 24) : "#ffffff";
    const text = dark ? "#e8eef6" : "#1c2430";
    const muted = dark ? "#9aabbe" : "#5c6b7c";
    return theme(row[0], row[1], row[2], mode, bg, panel, text, muted, accent, border, toolbar, status, menu);
  }

  const DARK_ROWS = [
    ["dark-ink", "잉크", "Ink", "#14181f", "#4aa3ff"],
    ["dark-midnight", "자정", "Midnight", "#0e1424", "#7aa2ff"],
    ["dark-ocean", "심해", "Ocean", "#0f1c22", "#3ec6d6"],
    ["dark-pine", "소나무", "Pine", "#121a16", "#3dbe86"],
    ["dark-plum", "자두", "Plum", "#1a1420", "#d56bd2"],
    ["dark-ember", "잔불", "Ember", "#1c1412", "#ff8a4a"],
    ["dark-slate", "슬레이트", "Slate", "#1b1f24", "#8ab4d6"],
    ["dark-graphite", "흑연", "Graphite", "#161616", "#d0d0d0"],
    ["dark-cobalt", "코발트", "Cobalt", "#10182e", "#5b8cff"],
    ["dark-wine", "와인", "Wine", "#241018", "#e06a8a"],
    ["dark-forest", "숲", "Forest", "#101c14", "#7dce6a"],
    ["dark-dusk", "황혼", "Dusk", "#241820", "#f0a060"],
    ["dark-copper", "구리", "Copper", "#241810", "#e0924a"],
    ["dark-abyss", "심연", "Abyss", "#0c1018", "#6ec8ff"],
    ["dark-iris", "아이리스", "Iris", "#161228", "#a78bfa"],
    ["dark-moss", "이끼", "Moss", "#141c12", "#9cbf6a"],
    ["dark-rust", "녹", "Rust", "#221410", "#e07050"],
    ["dark-night", "밤", "Night", "#0e1016", "#9aa4ff"],
    ["dark-teal", "청록", "Teal", "#0e1c1c", "#2ec4b6"],
    ["dark-charcoal", "숯", "Charcoal", "#1a1a1a", "#f0c14a"],
  ];

  const LIGHT_ROWS = [
    ["light-paper", "종이", "Paper", "#f7f4ee", "#1d6fbf"],
    ["light-snow", "눈", "Snow", "#f4f7fb", "#186fbf"],
    ["light-sand", "모래", "Sand", "#f8f1e4", "#b86a1a"],
    ["light-mist", "안개", "Mist", "#eef3f4", "#0f7f8a"],
    ["light-sage", "세이지", "Sage", "#f2f6f1", "#2f8a4e"],
    ["light-rose", "장미", "Rose", "#fbf4f6", "#c2456a"],
    ["light-sky", "하늘", "Sky", "#f3f7ff", "#2a6fdb"],
    ["light-cream", "크림", "Cream", "#fff8ec", "#c4872a"],
    ["light-linen", "리넨", "Linen", "#f6f1ea", "#8a5a3b"],
    ["light-ice", "얼음", "Ice", "#eef6fb", "#1a7ca8"],
    ["light-pearl", "진주", "Pearl", "#f5f3f6", "#6b5b95"],
    ["light-blush", "홍조", "Blush", "#fff1f3", "#d4526e"],
    ["light-mint", "민트", "Mint", "#eefaf4", "#1f9d6a"],
    ["light-cloud", "구름", "Cloud", "#f2f5f8", "#4a6785"],
    ["light-wheat", "밀", "Wheat", "#fbf6e8", "#a67c2d"],
    ["light-lilac", "라일락", "Lilac", "#f6f2fb", "#7b5ea7"],
    ["light-foam", "거품", "Foam", "#f3fbfb", "#1a8f93"],
    ["light-stone", "돌", "Stone", "#f3f2ef", "#5e6a62"],
    ["light-apricot", "살구", "Apricot", "#fff4ea", "#d46a2e"],
    ["light-porcelain", "도자기", "Porcelain", "#f7f8fa", "#3d6ea8"],
  ];

  const THEMES = DARK_ROWS.map((row) => fromPair(row, "dark")).concat(LIGHT_ROWS.map((row) => fromPair(row, "light")));

  function defaultCustom() {
    return {
      mode: "dark",
      bg: "#14181f",
      panel: "#1d242e",
      text: "#e7eef8",
      muted: "#9aabbe",
      accent: "#4aa3ff",
      border: "#334155",
      toolbar: "#10151c",
      status: "#0d1117",
      menu: "#243041",
    };
  }

  function fromCustom(custom) {
    const colors = Object.assign(defaultCustom(), custom || {});
    const mode = colors.mode === "light" ? "light" : "dark";
    return theme("custom", "사용자 정의", "Custom", mode, colors.bg, colors.panel, colors.text, colors.muted, colors.accent, colors.border, colors.toolbar, colors.status, colors.menu);
  }

  function byId(id, custom) {
    if (id === "custom") return fromCustom(custom);
    return THEMES.find((item) => item.id === id) || THEMES[0];
  }

  function ids() {
    return THEMES.map((item) => item.id).concat(["custom"]);
  }

  function next(id) {
    const list = ids();
    const index = list.indexOf(id);
    return list[index < 0 ? 0 : (index + 1) % list.length];
  }

  function nameOf(themeItem, lang) {
    return lang === "en" ? themeItem.nameEn : themeItem.nameKo;
  }

  return {
    THEMES: THEMES,
    byId: byId,
    nameOf: nameOf,
    ids: ids,
    next: next,
    defaultCustom: defaultCustom,
    fromCustom: fromCustom,
  };
});
