/* Theme registry — shared by the renderer (window.Themes) and main.js (require).
 * The colours of each theme live in src/styles/main.css ([data-theme="<id>"]);
 * `swatch` only feeds the little preview icon drawn in menus. */
(function (root) {
  const LIST = [
    /* ── Dark ── */
    { id: 'dark',             kind: 'dark',  name: 'Dark',             nameKey: 'theme.dark',  swatch: ['#1e1e1e', '#3c3c3c', '#0078d4'] },
    { id: 'midnight',         kind: 'dark',  name: 'Midnight',                                 swatch: ['#0d1117', '#21262d', '#1f6feb'] },
    { id: 'dracula',          kind: 'dark',  name: 'Dracula',                                  swatch: ['#282a36', '#343746', '#bd93f9'] },
    { id: 'monokai',          kind: 'dark',  name: 'Monokai',                                  swatch: ['#272822', '#3e3d32', '#a6e22e'] },
    { id: 'nord',             kind: 'dark',  name: 'Nord',                                     swatch: ['#2e3440', '#3b4252', '#88c0d0'] },
    { id: 'solarized-dark',   kind: 'dark',  name: 'Solarized Dark',                           swatch: ['#002b36', '#0f4552', '#268bd2'] },
    { id: 'one-dark',         kind: 'dark',  name: 'One Dark',                                 swatch: ['#282c34', '#353b45', '#61afef'] },
    { id: 'gruvbox-dark',     kind: 'dark',  name: 'Gruvbox Dark',                             swatch: ['#282828', '#3c3836', '#fe8019'] },
    { id: 'tokyo-night',      kind: 'dark',  name: 'Tokyo Night',                              swatch: ['#1a1b26', '#24283b', '#7aa2f7'] },
    { id: 'catppuccin-mocha', kind: 'dark',  name: 'Catppuccin Mocha',                         swatch: ['#1e1e2e', '#313244', '#cba6f7'] },
    { id: 'github-dark',       kind: 'dark',    name: 'GitHub Dark',                  swatch: ['#0d1117', '#161b22', '#2f81f7'] },
    { id: 'ayu-dark',          kind: 'dark',    name: 'Ayu Dark',                     swatch: ['#0f1419', '#1c2128', '#ffb454'] },
    { id: 'everforest-dark',   kind: 'dark',    name: 'Everforest Dark',              swatch: ['#2d353b', '#343f44', '#a7c080'] },
    { id: 'rose-pine',         kind: 'dark',    name: 'Rosé Pine',                    swatch: ['#191724', '#1f1d2e', '#ebbcba'] },
    { id: 'material-ocean',    kind: 'dark',    name: 'Material Ocean',               swatch: ['#0f111a', '#181a25', '#82aaff'] },
    { id: 'night-owl',         kind: 'dark',    name: 'Night Owl',                    swatch: ['#011627', '#0b2942', '#82aaff'] },
    { id: 'synthwave',         kind: 'dark',    name: 'Synthwave \'84',               swatch: ['#262335', '#2a2139', '#ff7edb'] },
    { id: 'cobalt',            kind: 'dark',    name: 'Cobalt',                       swatch: ['#193549', '#1f4662', '#ffc600'] },
    { id: 'oceanic-next',      kind: 'dark',    name: 'Oceanic Next',                 swatch: ['#1b2b34', '#22313a', '#6699cc'] },
    { id: 'carbon',            kind: 'dark',    name: 'Carbon',                       swatch: ['#161616', '#262626', '#4589ff'] },
    /* ── Light ── */
    { id: 'light',            kind: 'light', name: 'Light',            nameKey: 'theme.light', swatch: ['#f5f5f5', '#f3f3f3', '#0078d4'] },
    { id: 'solarized-light',  kind: 'light', name: 'Solarized Light',                          swatch: ['#fdf6e3', '#eee8d5', '#268bd2'] },
    { id: 'github-light',     kind: 'light', name: 'GitHub Light',                             swatch: ['#f6f8fa', '#ffffff', '#0969da'] },
    { id: 'gruvbox-light',    kind: 'light', name: 'Gruvbox Light',                            swatch: ['#fbf1c7', '#f2e5bc', '#d65d0e'] },
    { id: 'nord-light',       kind: 'light', name: 'Nord Snow',                                swatch: ['#eceff4', '#e5e9f0', '#5e81ac'] },
    { id: 'catppuccin-latte', kind: 'light', name: 'Catppuccin Latte',                         swatch: ['#eff1f5', '#e6e9ef', '#8839ef'] },
    { id: 'one-light',        kind: 'light', name: 'One Light',                                swatch: ['#fafafa', '#f0f0f1', '#4078f2'] },
    { id: 'rose-pine-dawn',   kind: 'light', name: 'Rosé Pine Dawn',                           swatch: ['#faf4ed', '#f2e9e1', '#d7827e'] },
    { id: 'paper',            kind: 'light', name: 'Paper',            nameKey: 'theme.paper', swatch: ['#f4ecd8', '#efe6d2', '#8c5a2b'] },
    { id: 'sky',              kind: 'light', name: 'Sky',              nameKey: 'theme.sky',   swatch: ['#eaf4fb', '#e2eff8', '#0288d1'] },
    { id: 'ayu-light',         kind: 'light',   name: 'Ayu Light',                    swatch: ['#fcfcfc', '#f3f4f5', '#ff9940'] },
    { id: 'everforest-light',  kind: 'light',   name: 'Everforest Light',             swatch: ['#fdf6e3', '#f4f0d9', '#8da101'] },
    { id: 'tokyo-day',         kind: 'light',   name: 'Tokyo Day',                    swatch: ['#e1e2e7', '#d4d6df', '#2e7de9'] },
    { id: 'quiet-light',       kind: 'light',   name: 'Quiet Light',                  swatch: ['#f5f5f5', '#ececec', '#7a3e9d'] },
    { id: 'material-lighter',  kind: 'light',   name: 'Material Lighter',             swatch: ['#fafafa', '#f1f3f5', '#39adb5'] },
    { id: 'mint',              kind: 'light',   name: 'Mint',                         swatch: ['#eef7f1', '#e2efe7', '#0f9d76'] },
    { id: 'lavender',          kind: 'light',   name: 'Lavender',                     swatch: ['#f4f1fb', '#eae5f6', '#6b4fd8'] },
    { id: 'sakura',            kind: 'light',   name: 'Sakura',                       swatch: ['#fdf1f3', '#f8e4e8', '#d2547a'] },
    { id: 'sand',              kind: 'light',   name: 'Sand',                         swatch: ['#f7f1e6', '#efe6d6', '#b06f2a'] },
    { id: 'slate-light',       kind: 'light',   name: 'Slate Light',                  swatch: ['#f1f3f6', '#e4e8ee', '#3f5fbf'] },
  ];
  const BY_ID = Object.fromEntries(LIST.map((t) => [t.id, t]));
  const DEFAULT = 'dark';

  const Themes = {
    list: LIST,
    default: DEFAULT,
    get: (id) => BY_ID[id] || null,
    /** Accepts anything (old localStorage values included) and returns a valid theme id. */
    normalize: (id) => (BY_ID[id] ? id : DEFAULT),
    kindOf: (id) => (BY_ID[id] || BY_ID[DEFAULT]).kind,
    ofKind: (kind) => LIST.filter((t) => t.kind === kind),
    /** Id of the theme after `id` in the list (wraps around). */
    next: (id) => {
      const i = LIST.findIndex((t) => t.id === id);
      return LIST[(i + 1) % LIST.length].id;
    },
    /** Display name — translated for the generic ones, literal for named palettes. */
    label: (id, t) => {
      const th = BY_ID[id];
      if (!th) return id;
      if (th.nameKey && typeof t === 'function') {
        const s = t(th.nameKey);
        if (s && s !== th.nameKey) return s;
      }
      return th.name;
    },
    /** Small preview icon (window bg + toolbar + accent dot) for menus. */
    swatchSvg: (id) => {
      const th = BY_ID[id];
      if (!th) return '';
      const [bg, bar, accent] = th.swatch;
      return `<svg viewBox="0 0 16 16" class="theme-swatch"><rect x="1" y="2" width="14" height="12" rx="2" fill="${bg}"/>`
        + `<rect x="1" y="2" width="14" height="4" rx="2" fill="${bar}"/><rect x="1" y="5" width="14" height="1" fill="${bar}"/>`
        + `<circle cx="11.5" cy="10.5" r="2" fill="${accent}"/>`
        + `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="rgba(128,128,128,.6)" stroke-width="1"/></svg>`;
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Themes;
  if (root) root.Themes = Themes;
})(typeof window !== 'undefined' ? window : null);
