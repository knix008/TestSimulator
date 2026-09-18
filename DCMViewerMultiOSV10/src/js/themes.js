/* Built-in colour themes. Each theme fills the CSS custom properties main.css uses.
 *
 *   Themes.list()            → [{ id, name, scheme: 'dark' | 'light', vars }]
 *   Themes.apply(id)         → sets the variables on <html>, data-theme / data-scheme on <body>
 *   Themes.get(id)
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
    // ── light ──
    mk('light',           'Light',            'light', '#f3f4f6', '#ffffff', '#f7f8fa', '#d5d9e0', '#1f2937', '#6b7280', '#0284c7', '#0369a1', '#ffffff', '#111111'),
    mk('paper',           'Paper',            'light', '#fbfaf7', '#ffffff', '#f4f2ec', '#e2ded3', '#2b2a27', '#7a766c', '#b45309', '#92400e', '#ffffff', '#1c1917'),
    mk('solarized-light', 'Solarized Light',  'light', '#fdf6e3', '#eee8d5', '#f5efdc', '#d9d2bd', '#586e75', '#93a1a1', '#268bd2', '#2075b4', '#ffffff', '#002b36'),
    mk('sky',             'Sky',              'light', '#eff6ff', '#ffffff', '#f0f7ff', '#c7d7ee', '#0f2a4a', '#5b7290', '#2563eb', '#1d4ed8', '#ffffff', '#0b1220'),
    mk('mint',            'Mint',             'light', '#eefaf3', '#ffffff', '#f0faf4', '#c6e3d2', '#12352a', '#4f7563', '#059669', '#047857', '#ffffff', '#04160f'),
    mk('rose',            'Rose',             'light', '#fff1f2', '#ffffff', '#fff5f6', '#f2cbd1', '#4a1d24', '#8b5a63', '#e11d48', '#be123c', '#ffffff', '#1c0a0d'),
  ];
  const byId = new Map(THEMES.map((th) => [th.id, th]));

  function get(id) { return byId.get(id) || (id === 'dark' ? byId.get('midnight') : byId.get('light')) || THEMES[0]; }

  function apply(id) {
    const th = get(id);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(th.vars)) root.style.setProperty(k, v);
    document.body.dataset.theme = th.id;
    document.body.dataset.scheme = th.scheme;
    return th;
  }

  return { list: () => THEMES.slice(), get, apply };
})();
