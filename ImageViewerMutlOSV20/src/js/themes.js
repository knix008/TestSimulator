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
