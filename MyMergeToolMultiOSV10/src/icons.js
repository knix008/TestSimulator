(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyMergeIcons = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PATHS = {
    new: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>',
    open: '<path d="M3 7h6l2 2h10v10H3z"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8"/><path d="M8 21v-6h8v6"/>',
    saveAs: '<path d="M5 3h11l3 3v15H5z"/><path d="M12 13v6M9 16h6"/>',
    undo: '<path d="M8 8H4v4"/><path d="M4 12a8 8 0 1 0 2.5-6"/>',
    redo: '<path d="M16 8h4v4"/><path d="M20 12a8 8 0 1 1-2.5-6"/>',
    cut: '<circle cx="6" cy="7" r="2.2"/><circle cx="6" cy="17" r="2.2"/><path d="M8 8.5 20 18M8 15.5 20 6"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M5 15V5h10"/>',
    paste: '<path d="M8 5h8v3H8z"/><path d="M7 7H6v14h12V7h-1"/>',
    base: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8"/>',
    local: '<path d="M5 12h10"/><path d="M12 7l5 5-5 5"/>',
    remote: '<path d="M19 12H9"/><path d="M12 7 7 12l5 5"/>',
    both: '<path d="M4 8h7M4 16h7"/><path d="M11 8l4 4-4 4"/><path d="M15 12h5"/>',
    prev: '<path d="M15 6 9 12l6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    zoomIn: '<circle cx="11" cy="11" r="6"/><path d="M11 8v6M8 11h6M16 16l4 4"/>',
    zoomOut: '<circle cx="11" cy="11" r="6"/><path d="M8 11h6M16 16l4 4"/>',
    print: '<path d="M7 8V3h10v5"/><rect x="5" y="8" width="14" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
    about: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    language: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>',
    theme: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
    caret: '<path d="M7 10l5 5 5-5"/>',
    panelLeft: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/>',
    panelRight: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M15 4v16"/>',
    git: '<circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="7" r="2.2"/><circle cx="12" cy="17" r="2.2"/><path d="M8.6 8.6 11 15.2M15.4 8.6 13 15.2"/>',
    file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
    trash: '<path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/>',
    conflict: '<path d="M12 4v8"/><path d="M12 16h.01"/><circle cx="12" cy="12" r="8"/>',
    check: '<path d="M5 12l5 5L19 7"/>',
    exit: '<path d="M10 5H6v14h4"/><path d="M10 12h9"/><path d="M16 8l4 4-4 4"/>',
    download: '<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M5 19h14"/>',
    link: '<path d="M10 13a4 4 0 0 0 6 0l2-2a4 4 0 0 0-6-6l-1 1"/><path d="M14 11a4 4 0 0 0-6 0l-2 2a4 4 0 0 0 6 6l1-1"/>',
    font: '<path d="M5 19 12 5l7 14"/><path d="M8 14h8"/>',
    image: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.4"/><path d="M4 16l5-4 4 3 3-2 4 3"/>',
    folder: '<path d="M3 7h6l2 2h10v9H3z"/>',
    help: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14"/><path d="M12 17h.01"/>',
  };

  function icon(name) {
    const body = PATHS[name] || PATHS.file;
    return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' + body + "</svg>";
  }

  function flag(code) {
    if (code === "uk") {
      return '<svg class="flag" data-flag="uk" viewBox="0 0 60 30" width="18" height="12" aria-hidden="true" focusable="false">' +
        '<rect width="60" height="30" fill="#012169"/>' +
        '<path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" stroke-width="8"/>' +
        '<path d="M0 0 L60 30 M60 0 L0 30" stroke="#C8102E" stroke-width="4"/>' +
        '<path d="M30 0 V30 M0 15 H60" stroke="#fff" stroke-width="14"/>' +
        '<path d="M30 0 V30 M0 15 H60" stroke="#C8102E" stroke-width="8"/>' +
        "</svg>";
    }
    return '<svg class="flag" data-flag="kr" viewBox="0 0 72 48" width="18" height="12" aria-hidden="true" focusable="false">' +
      '<rect width="72" height="48" fill="#fff"/>' +
      '<path d="M36 14a10 10 0 0 1 0 20 5 5 0 0 1 0-10 5 5 0 0 0 0-10z" fill="#cd2e3a"/>' +
      '<path d="M36 14a10 10 0 0 0 0 20 5 5 0 0 0 0-10 5 5 0 0 1 0-10z" fill="#0047a0"/>' +
      '<g fill="#111">' +
      '<rect x="10" y="8" width="3" height="10"/><rect x="16" y="8" width="3" height="10"/><rect x="22" y="8" width="3" height="10"/>' +
      '<rect x="47" y="8" width="3" height="10"/><rect x="53" y="8" width="3" height="10"/><rect x="59" y="8" width="3" height="10"/>' +
      '<rect x="10" y="30" width="3" height="10"/><rect x="16" y="30" width="3" height="10"/><rect x="22" y="30" width="3" height="10"/>' +
      '<rect x="47" y="30" width="3" height="10"/><rect x="53" y="30" width="3" height="10"/><rect x="59" y="30" width="3" height="10"/>' +
      "</g></svg>";
  }

  return { icon: icon, flag: flag, names: Object.keys(PATHS) };
});
