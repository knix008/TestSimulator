/* Built-in colour themes. Each theme fills the CSS custom properties main.css uses.
 *
 *   Themes.list()            → [{ id, name, scheme: 'dark' | 'light', vars }]
 *   Themes.apply(id)         → sets the variables on <html>, data-theme / data-scheme on <body>
 *   Themes.get(id)
 *   Themes.custom()          → the user's own theme (id 'custom'), built from a few colours:
 *   Themes.setCustom(spec)     { scheme, bg, panel, text, accent, viewport }; kept in localStorage so the
 *                              dialog windows (same origin) see the same colours. Not part of list().
 */
window.Themes = (function () {
  // t(id, name, scheme, bg, panel, panel2, border, text, dim, accent, accent2, accentText, viewportBg)
  const mk = (id, name, scheme, bg, panel, panel2, border, text, dim, accent, accent2, accentText, viewportBg) => ({
    id, name, scheme,
    vars: {
      '--bg': bg, '--panel-bg': panel, '--panel-bg2': panel2, '--border': border, '--text': text, '--text-dim': dim,
      '--accent': accent, '--accent-2': accent2, '--accent-text': accentText, '--viewport-bg': viewportBg,
      '--menu-bg': panel, '--kbd-bg': panel2,
      '--hover': scheme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
      '--active': scheme === 'dark' ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.11)',
      '--selection': scheme === 'dark' ? mix(accent, 0.28) : mix(accent, 0.18),
      '--shadow': scheme === 'dark' ? '0 8px 24px rgba(0,0,0,0.55)' : '0 8px 24px rgba(0,0,0,0.18)',
    },
  });
  function mix(hex, alpha) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
  }

  const THEMES = [
    // ── dark ──
    mk('midnight',        'Midnight',         'dark',  '#111318', '#191c23', '#20242d', '#2b303b', '#e6e8ee', '#9aa3b2', '#38bdf8', '#0ea5e9', '#06202c', '#000000'),
    mk('graphite',        'Graphite',         'dark',  '#1a1a1a', '#232323', '#2b2b2b', '#3a3a3a', '#e8e8e8', '#9e9e9e', '#4fc3f7', '#29b6f6', '#00232f', '#000000'),
    mk('slate',           'Slate',            'dark',  '#0f172a', '#1e293b', '#273449', '#334155', '#e2e8f0', '#94a3b8', '#818cf8', '#6366f1', '#ffffff', '#020617'),
    mk('ocean',           'Ocean',            'dark',  '#0b1e2d', '#12283a', '#173247', '#234459', '#dbeafe', '#93b4cc', '#22d3ee', '#06b6d4', '#062a30', '#03111b'),
    mk('forest',          'Forest',           'dark',  '#101b14', '#17261c', '#1e3024', '#2b4232', '#e3efe6', '#94ad9c', '#4ade80', '#22c55e', '#052e16', '#050a07'),
    mk('plum',            'Plum',             'dark',  '#1c1022', '#28172f', '#331e3b', '#472a51', '#f1e6f5', '#b596c1', '#e879f9', '#d946ef', '#3b0764', '#0d0611'),
    mk('dracula',         'Dracula',          'dark',  '#282a36', '#21222c', '#343746', '#44475a', '#f8f8f2', '#a5a8bd', '#bd93f9', '#a97cf6', '#1e1a2e', '#191a21'),
    mk('nord',            'Nord',             'dark',  '#2e3440', '#3b4252', '#434c5e', '#4c566a', '#eceff4', '#aab3c3', '#88c0d0', '#81a1c1', '#1f2a33', '#242933'),
    mk('monokai',         'Monokai',          'dark',  '#272822', '#1e1f1c', '#33342d', '#49483e', '#f8f8f2', '#a6a69a', '#a6e22e', '#8fc41f', '#1a2306', '#161613'),
    mk('solarized-dark',  'Solarized Dark',   'dark',  '#002b36', '#073642', '#0b3f4c', '#1c4c58', '#eee8d5', '#93a1a1', '#b58900', '#cb4b16', '#fdf6e3', '#001f27'),
    mk('one-dark',        'One Dark',         'dark',  '#282c34', '#21252b', '#2f343d', '#3e4451', '#abb2bf', '#7f848e', '#61afef', '#528bff', '#0c1a2a', '#1b1e23'),
    mk('gruvbox',         'Gruvbox',          'dark',  '#282828', '#1d2021', '#32302f', '#504945', '#ebdbb2', '#a89984', '#fabd2f', '#d79921', '#1d2021', '#141414'),
    mk('carbon',          'Carbon',           'dark',  '#161616', '#262626', '#303030', '#393939', '#f4f4f4', '#a8a8a8', '#78a9ff', '#4589ff', '#001141', '#000000'),
    mk('radiology',       'Radiology Gray',   'dark',  '#202020', '#2a2a2a', '#323232', '#404040', '#e0e0e0', '#a0a0a0', '#ffb300', '#ffa000', '#1f1400', '#000000'),
    mk('tokyo-night',     'Tokyo Night',      'dark',  '#1a1b26', '#16161e', '#24283b', '#2f3549', '#c0caf5', '#8089b3', '#7aa2f7', '#5d86e8', '#10142a', '#0d0e15'),
    mk('catppuccin',      'Catppuccin Mocha', 'dark',  '#1e1e2e', '#181825', '#28283b', '#3a3a52', '#cdd6f4', '#9399b2', '#cba6f7', '#b48ef0', '#1e1e2e', '#11111b'),
    mk('github-dark',     'GitHub Dark',      'dark',  '#0d1117', '#161b22', '#1c2330', '#30363d', '#e6edf3', '#8b949e', '#2f81f7', '#1f6feb', '#ffffff', '#010409'),
    mk('ayu-dark',        'Ayu Dark',         'dark',  '#0b0e14', '#0f131a', '#161b24', '#232a36', '#bfbdb6', '#7c8391', '#e6b450', '#ffb454', '#1a1405', '#05070a'),
    mk('cobalt',          'Cobalt',           'dark',  '#122738', '#193549', '#1f4260', '#2a5476', '#e1efff', '#8fb3d1', '#ffc600', '#ff9d00', '#1d1500', '#0a1824'),
    mk('crimson',         'Crimson Night',    'dark',  '#1a0f12', '#24151a', '#2e1b21', '#45262f', '#f3e3e7', '#b6929b', '#fb7185', '#f43f5e', '#2a0610', '#0c0608'),
    // ── light ──
    mk('light',           'Light',            'light', '#f3f4f6', '#ffffff', '#f7f8fa', '#d5d9e0', '#1f2937', '#6b7280', '#0284c7', '#0369a1', '#ffffff', '#111111'),
    mk('paper',           'Paper',            'light', '#fbfaf7', '#ffffff', '#f4f2ec', '#e2ded3', '#2b2a27', '#7a766c', '#b45309', '#92400e', '#ffffff', '#1c1917'),
    mk('solarized-light', 'Solarized Light',  'light', '#fdf6e3', '#eee8d5', '#f5efdc', '#d9d2bd', '#586e75', '#93a1a1', '#268bd2', '#2075b4', '#ffffff', '#002b36'),
    mk('sky',             'Sky',              'light', '#eff6ff', '#ffffff', '#f0f7ff', '#c7d7ee', '#0f2a4a', '#5b7290', '#2563eb', '#1d4ed8', '#ffffff', '#0b1220'),
    mk('mint',            'Mint',             'light', '#eefaf3', '#ffffff', '#f0faf4', '#c6e3d2', '#12352a', '#4f7563', '#059669', '#047857', '#ffffff', '#04160f'),
    mk('rose',            'Rose',             'light', '#fff1f2', '#ffffff', '#fff5f6', '#f2cbd1', '#4a1d24', '#8b5a63', '#e11d48', '#be123c', '#ffffff', '#1c0a0d'),
    mk('github-light',    'GitHub Light',     'light', '#f6f8fa', '#ffffff', '#f3f5f7', '#d0d7de', '#1f2328', '#656d76', '#0969da', '#0550ae', '#ffffff', '#0d1117'),
    mk('nord-light',      'Nord Snow',        'light', '#eceff4', '#f8f9fb', '#e5e9f0', '#cdd3de', '#2e3440', '#5e6779', '#5e81ac', '#4c6d96', '#ffffff', '#2e3440'),
    mk('catppuccin-latte','Catppuccin Latte', 'light', '#eff1f5', '#ffffff', '#e6e9ef', '#ccd0da', '#4c4f69', '#7c7f93', '#8839ef', '#7287fd', '#ffffff', '#1e1e2e'),
    mk('gruvbox-light',   'Gruvbox Light',    'light', '#fbf1c7', '#fffaf0', '#f2e5bc', '#d5c4a1', '#3c3836', '#7c6f64', '#af3a03', '#9d0006', '#ffffff', '#1d2021'),
    mk('one-light',       'One Light',        'light', '#fafafa', '#ffffff', '#f0f0f1', '#d4d4d6', '#383a42', '#7c7e85', '#4078f2', '#2f63d8', '#ffffff', '#202227'),
    mk('lavender',        'Lavender',         'light', '#f5f3ff', '#ffffff', '#f8f6ff', '#d8d1f5', '#2e1065', '#6d5f9e', '#7c3aed', '#6d28d9', '#ffffff', '#140a2c'),
    mk('sand',            'Sand',             'light', '#f7f1e6', '#fffcf6', '#f1e9da', '#ddd0b6', '#3d3220', '#7d6e55', '#a16207', '#854d0e', '#ffffff', '#1c160c'),
    mk('peach',           'Peach',            'light', '#fff4ed', '#ffffff', '#fff7f1', '#f6d3bf', '#4a2412', '#8b6250', '#ea580c', '#c2410c', '#ffffff', '#1f0f07'),
    mk('lime',            'Lime',             'light', '#f4fbe8', '#ffffff', '#f6fbec', '#d4e7b5', '#233214', '#5f7449', '#4d7c0f', '#3f6212', '#ffffff', '#0f1708'),
    mk('aqua',            'Aqua',             'light', '#ecfeff', '#ffffff', '#f0fdfe', '#bfe4ea', '#0e3a43', '#4b7680', '#0e7490', '#155e75', '#ffffff', '#05171b'),
    mk('steel',           'Steel',            'light', '#e9edf2', '#f7f9fb', '#eef1f5', '#c7cfda', '#1e293b', '#5b6779', '#475569', '#334155', '#ffffff', '#0f172a'),
    mk('ivory',           'Ivory',            'light', '#fffff7', '#ffffff', '#fbfaef', '#e7e4cc', '#2f2d22', '#76735f', '#0f766e', '#115e59', '#ffffff', '#161510'),
    mk('clinic',          'Clinic White',     'light', '#f4f8fb', '#ffffff', '#f1f6fa', '#cfdde8', '#12324a', '#55728a', '#0077b6', '#005f92', '#ffffff', '#000000'),
    mk('sakura',          'Sakura',           'light', '#fdf2f8', '#ffffff', '#fdf5f9', '#f3cfe2', '#4a1736', '#8d5b78', '#db2777', '#be185d', '#ffffff', '#1d0816'),
  ];
  const byId = new Map(THEMES.map((th) => [th.id, th]));

  /* ── the custom theme ── */
  const CUSTOM_KEY = 'mydcmviewer.customTheme';
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); return m ? `#${m[1].toLowerCase()}` : null; };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (a) => `#${a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  const blend = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const luma = (h) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  function customSpec(spec) {
    const base = THEMES[0].vars;
    const s = spec || {};
    const scheme = s.scheme === 'light' ? 'light' : 'dark';
    const d = scheme === 'light' ? byId.get('light').vars : base;
    return {
      scheme,
      bg: hex(s.bg) || d['--bg'], panel: hex(s.panel) || d['--panel-bg'], text: hex(s.text) || d['--text'],
      accent: hex(s.accent) || d['--accent'], viewport: hex(s.viewport) || d['--viewport-bg'],
    };
  }
  let customCache = null;
  function readStored() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null'); } catch { return null; } }
  function setCustom(spec) {
    const c = customSpec(spec);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(c)); } catch { /* private mode: this page only */ }
    customCache = c;
    return custom();
  }
  function custom() {
    const c = customSpec(readStored() || customCache);
    const toward = c.scheme === 'dark' ? '#ffffff' : '#000000';
    const name = window.I18n && window.I18n.t('view.themeCustom') !== 'view.themeCustom' ? window.I18n.t('view.themeCustom') : 'Custom';
    return mk('custom', name, c.scheme, c.bg, c.panel, blend(c.panel, toward, 0.04), blend(c.panel, c.text, 0.18), c.text, blend(c.text, c.bg, 0.38),
      c.accent, blend(c.accent, '#000000', 0.12), luma(c.accent) > 0.55 ? '#111111' : '#ffffff', c.viewport);
  }
  const customColors = () => customSpec(readStored() || customCache);

  function get(id) { if (id === 'custom') return custom(); return byId.get(id) || (id === 'light' ? byId.get('light') : byId.get('midnight')) || THEMES[0]; }

  function apply(id) {
    const th = get(id);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(th.vars)) root.style.setProperty(k, v);
    document.body.dataset.theme = th.id;
    document.body.dataset.scheme = th.scheme;
    return th;
  }

  return { list: () => THEMES.slice(), get, apply, custom, setCustom, customColors };
})();
