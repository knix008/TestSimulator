// Coloured icons for the guide and tutorial windows (plain script: window.DocIcons).
// Every button in those windows carries one; the language buttons carry flags.
(function () {
  'use strict';
  function svg(color, inner) {
    return (
      '<svg class="doc-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color +
      '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'
    );
  }
  window.DocIcons = {
    guide: svg('#b45309', '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>'),
    tutorial: svg('#7c3aed', '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>'),
    print: svg('#0f766e', '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
    pdf: svg('#dc2626', '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 16v-4h1.5a1.3 1.3 0 0 1 0 2.6H8.5M13 12v4M13 12h2.5M13 14h2"/>'),
    minus: svg('#0369a1', '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
    plus: svg('#0369a1', '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
    font: svg('#4f46e5', '<path d="M4 19l5-14 5 14M6 14h6"/><path d="M15 19l3-8 3 8M16 16h4"/>'),
    reset: svg('#0891b2', '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>'),
    close: svg('#e11d48', '<path d="M6 6l12 12M18 6L6 18"/>'),
    winMin: svg('#475569', '<path d="M6 12h12"/>'),
    winMax: svg('#475569', '<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
    portrait: svg('#2563eb', '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
    landscape: svg('#16a34a', '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M7 10h10M7 14h7"/>'),
    contents: svg('#475569', '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
    refresh: svg('#0891b2', '<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.6"/><path d="M20 4v4.6h-4.6"/>'),
    flagKo:
      '<svg class="doc-flag" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="2" y="5" width="20" height="14" rx="1.5" fill="#fff"/>' +
      '<g fill="none" stroke="#111" stroke-width="0.9">' +
      '<g transform="translate(5.8 8.6) rotate(-56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2"/></g>' +
      '<g transform="translate(18.2 8.6) rotate(56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2"/></g>' +
      '<g transform="translate(5.8 15.4) rotate(56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2"/></g>' +
      '<g transform="translate(18.2 15.4) rotate(-56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2"/></g></g>' +
      '<g transform="rotate(-34 12 12)"><circle cx="12" cy="12" r="3.8" fill="#0047a0"/>' +
      '<path d="M8.2 12a3.8 3.8 0 0 1 7.6 0a1.9 1.9 0 0 1-3.8 0a1.9 1.9 0 0 0-3.8 0z" fill="#cd2e3a"/></g>' +
      '<rect x="2" y="5" width="20" height="14" rx="1.5" fill="none" stroke="#888" stroke-opacity="0.5"/></svg>',
    flagEn:
      '<svg class="doc-flag" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">' +
      '<clipPath id="doc-flag-en"><rect x="2" y="5" width="20" height="14" rx="1.5"/></clipPath>' +
      '<g clip-path="url(#doc-flag-en)"><rect x="2" y="5" width="20" height="14" fill="#012169"/>' +
      '<path d="M2 5l20 14M22 5L2 19" stroke="#fff" stroke-width="3.4"/>' +
      '<path d="M2 5l20 14M22 5L2 19" stroke="#c8102e" stroke-width="1.2"/>' +
      '<path d="M12 5v14M2 12h20" stroke="#fff" stroke-width="4.6"/>' +
      '<path d="M12 5v14M2 12h20" stroke="#c8102e" stroke-width="2.6"/></g>' +
      '<rect x="2" y="5" width="20" height="14" rx="1.5" fill="none" stroke="#888" stroke-opacity="0.5"/></svg>',
  };
})();
