/* Inline SVG icon set (24 × 24, stroked) for menus, context menus and toolbar.
 *
 *   Icons.svg('open')              → '<svg …>…</svg>'
 *   Icons.decorate(root)           → prepends the icon to every element with data-icon inside root
 */
window.Icons = (function () {
  const P = {
    'open': '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7"/>',
    'folder': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'folder-open': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H6l-3 8z"/><path d="M3 18l3-8h16l-3 8z"/>',
    'export': '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    'image': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
    'tags': '<path d="M4 6h16M4 12h10M4 18h13"/><circle cx="19" cy="17" r="2"/>',
    'copy': '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    'batch': '<rect x="3" y="5" width="12" height="12" rx="2"/><path d="M8 19h9a2 2 0 0 0 2-2V9"/><path d="M6 11l2 2 4-4"/>',
    'print': '<path d="M6 9V4h12v5M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="6"/>',
    'close': '<path d="M6 6l12 12M18 6L6 18"/>',
    'exit': '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
    'fit': '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    'actual': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 15V9l-1 1M14 9h2v6"/>',
    'zoom-in': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M11 8v6M8 11h6"/>',
    'zoom-out': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6"/>',
    'rotate-left': '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    'rotate-right': '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
    'flip-h': '<path d="M12 3v18M4 8l5 4-5 4zM20 8l-5 4 5 4z"/>',
    'flip-v': '<path d="M3 12h18M8 4l4 5 4-5zM8 20l4-5 4 5z"/>',
    'reset': '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/><circle cx="12" cy="12" r="1.5"/>',
    'invert': '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    'smooth': '<path d="M3 17c4 0 4-10 8-10s4 10 8 10"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    'compass': '<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-4 2 2-6z"/>',
    'layers': '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
    'ruler': '<path d="M3 21L21 3M6 18l2 2M10 14l2 2M14 10l2 2M18 6l2 2"/>',
    'burn': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15l3-4 3 3 4-5"/><path d="M15 17h4"/>',
    'sidebar': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    'fullscreen': '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
    'palette': '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s.5-2 2-2H17a4 4 0 0 0 4-4 10 10 0 0 0-9-10z"/><circle cx="7.5" cy="12" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    'settings': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    'devtools': '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    'pan': '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
    'wl': '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/><path d="M5 12h14" stroke-opacity="0.4"/>',
    'zoom': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
    'stack': '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M20 3l2 3-2 3M20 15l2 3-2 3"/>',
    'probe': '<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    'length': '<path d="M3 21L21 3M6 18l2 2M10 14l2 2M14 10l2 2M18 6l2 2"/>',
    'angle': '<path d="M4 20L20 4M4 20h16"/><path d="M12 20a8 8 0 0 0-2.3-5.7"/>',
    'rect': '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    'ellipse': '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    'text': '<path d="M5 5h14M12 5v14M9 19h6"/>',
    'undo': '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    'trash': '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    'auto': '<path d="M3 18L9 6l6 12M5.5 14h7"/><path d="M17 8h4M19 6v4"/>',
    'file-window': '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7M8 15h8M8 12h4"/>',
    'presets': '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
    'lut': '<path d="M3 20c4 0 6-16 18-16"/><path d="M3 20h18M3 20V4"/>',
    'function': '<path d="M4 18c2 0 3-12 5-12s2 12 4 12 2-12 4-12 3 12 3 12"/>',
    'colormap': '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M8 8v8M13 8v8M18 8v8" stroke-opacity="0.5"/>',
    'play': '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
    'first': '<path d="M6 5v14M19 5l-11 7 11 7z" fill="currentColor"/>',
    'prev': '<path d="M17 5l-11 7 11 7z" fill="currentColor"/>',
    'next': '<path d="M7 5l11 7-11 7z" fill="currentColor"/>',
    'last': '<path d="M18 5v14M5 5l11 7-11 7z" fill="currentColor"/>',
    'loop': '<path d="M17 3l4 4-4 4"/><path d="M3 11V9a2 2 0 0 1 2-2h16M7 21l-4-4 4-4"/><path d="M21 13v2a2 2 0 0 1-2 2H3"/>',
    'sort': '<path d="M4 6h10M4 12h7M4 18h4M18 6v12M15 15l3 3 3-3"/>',
    'keyboard': '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
    'about': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    'show-folder': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 14l3-3 3 3M12 11v6"/>',
    'cut': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5M8.5 8.5L20 20"/>',
    'paste': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    'path': '<path d="M4 6h6l2 2h8v10H4z"/><path d="M8 13h8"/>',
    'refresh': '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
    'up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'anonymize': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/><path d="M3 3l18 18" stroke-opacity="0.6"/>',
    'video': '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
    'mpr': '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><path d="M13 17h8M17 13v8"/>',
    'file': '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7"/>',
    'view': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'tools': '<path d="M14 6l4 4-9 9H5v-4z"/><path d="M13 7l4 4"/>',
    'window': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
    'cine': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M7 5v14M17 5v14"/>',
    'help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17v.5"/>',
    'zip': '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7M10 11h2M10 14h2M10 17h2"/>',
    'gif': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10v4M12 10v4M16 10v4M6 12h4"/>',
    'tiff': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6M7 17h8"/>',
    'histogram': '<path d="M4 20V10M9 20V4M14 20v-8M19 20v-5M3 20h18"/>',
    'history': '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
    'grid': '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    'series': '<rect x="4" y="8" width="12" height="12" rx="1"/><path d="M8 4h12v12"/>',
  };
  function svg(name) {
    const body = P[name];
    if (!body) return '';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }
  /* Flags for the language toggle (filled, 3:2). */
  const FLAGS = {
    kr: '<svg viewBox="0 0 30 20" class="flag-svg"><rect width="30" height="20" fill="#fff"/>'
      + '<g transform="translate(15 10)"><circle r="5" fill="#cd2e3a"/><path d="M-5 0a5 5 0 0 0 10 0a2.5 2.5 0 0 0-5 0a2.5 2.5 0 0 1-5 0z" fill="#0047a0"/>'
      + '<g stroke="#000" stroke-width="1"><g transform="rotate(-56)"><path d="M-8 -1.5h4M-8 0h4M-8 1.5h4"/></g><g transform="rotate(56)"><path d="M-8 -1.5h4M-8 0h4M-8 1.5h4"/></g>'
      + '<g transform="rotate(-124)"><path d="M-8 -1.5h4M-8 0h4M-8 1.5h4"/></g><g transform="rotate(124)"><path d="M-8 -1.5h4M-8 0h4M-8 1.5h4"/></g></g></g></svg>',
    us: '<svg viewBox="0 0 30 20" class="flag-svg"><rect width="30" height="20" fill="#fff"/>'
      + '<g fill="#b22234">' + [0, 2, 4, 6, 8, 10, 12].map((y) => `<rect y="${y * 20 / 13}" width="30" height="${20 / 13}"/>`).join('') + '</g>'
      + '<rect width="12" height="10.77" fill="#3c3b6e"/>'
      + '<g fill="#fff">' + Array.from({ length: 5 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<circle cx="${1 + c * 2}" cy="${1 + r * 2.15}" r="0.5"/>`).join('')).join('') + '</g></svg>',
  };
  function flag(code) { return FLAGS[code] || ''; }
  function decorate(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      if (el.querySelector(':scope > .mi')) return;
      const s = svg(el.dataset.icon);
      if (!s) return;
      const span = document.createElement('span');
      span.className = 'mi';
      span.innerHTML = s;
      el.prepend(span);
    });
  }
  return { svg, flag, decorate, names: () => Object.keys(P) };
})();
