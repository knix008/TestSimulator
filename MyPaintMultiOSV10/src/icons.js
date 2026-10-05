(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintIcons = api;
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
    select: '<path d="M5 3l14 8-6 1.6L9.6 18z"/>',
    pencil: '<path d="M4 20l1-4 11-11 3 3-11 11z"/><path d="M14 7l3 3"/>',
    brush: '<path d="M6 21c3 0 4-2 4-4l-3-3c-2 0-4 1-4 4z"/><path d="M10 14 20 4"/><path d="M17 3l4 4"/>',
    eraser: '<path d="M8 20h11"/><path d="M5.5 16.5 13 9l5 5-4.5 4.5H9z"/><path d="M13 9l3-3 5 5-3 3"/>',
    line: '<path d="M4 20 20 4"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    text: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M8 20h8"/>',
    fill: '<path d="M4 13 11 6l7 7-7 7z"/><path d="M19 14c1.4 2 2 3 2 4a2 2 0 1 1-4 0c0-1 .6-2 2-4z"/>',
    picker: '<path d="M18 3l3 3-9 9H9v-3z"/><path d="M8 15 4 19v2h2l4-4"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18 2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5h4a5 5 0 0 0 5-5 3 3 0 0 0-3-3z"/><circle cx="7.5" cy="10.5" r="1.1"/><circle cx="11" cy="7" r="1.1"/><circle cx="15.5" cy="8.5" r="1.1"/>',
    canvas: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 16l5-4 4 3 3-2 6 4"/>',
    layerUp: '<path d="M12 4l5 5h-10z"/><path d="M4 13h16"/><path d="M4 18h16"/>',
    layerDown: '<path d="M12 20l5-5h-10z"/><path d="M4 11h16"/><path d="M4 6h16"/>',
    clear: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/>',
    stroke: '<path d="M3 17c4-6 8-6 12 0"/><path d="M3 7h18"/>',
    prev: '<path d="M15 6 9 12l6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    zoomIn: '<circle cx="11" cy="11" r="6"/><path d="M11 8v6M8 11h6M16 16l4 4"/>',
    zoomOut: '<circle cx="11" cy="11" r="6"/><path d="M8 11h6M16 16l4 4"/>',
    print: '<path d="M7 8V3h10v5"/><rect x="5" y="8" width="14" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>',
    settings: '<g transform="translate(12 12) scale(0.84) translate(-12 -12)">' +
      '<circle cx="12" cy="12" r="3.2"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></g>',
    about: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    language: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>',
    theme: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="7.3" r="1.9"/><circle cx="16.7" cy="12" r="1.9"/><circle cx="12" cy="16.7" r="1.9"/><circle cx="7.3" cy="12" r="1.9"/>',
    caret: '<path d="M7 10l5 5 5-5"/>',
    panelLeft: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/>',
    panelRight: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M15 4v16"/>',
    file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 7h6l2 2h10v9H3z"/>',
    trash: '<path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/>',
    check: '<path d="M5 12l5 5L19 7"/>',
    exit: '<path d="M10 5H6v14h4"/><path d="M10 12h9"/><path d="M16 8l4 4-4 4"/>',
    download: '<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M5 19h14"/>',
    link: '<path d="M10 13a4 4 0 0 0 6 0l2-2a4 4 0 0 0-6-6l-1 1"/><path d="M14 11a4 4 0 0 0-6 0l-2 2a4 4 0 0 0 6 6l1-1"/>',
    font: '<path d="M5 19 12 5l7 14"/><path d="M8 14h8"/>',
    image: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.4"/><path d="M4 16l5-4 4 3 3-2 4 3"/>',
    opacity: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
    help: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14"/><path d="M12 17h.01"/>',
    marquee: '<path d="M4 7V5h3M20 7V5h-3M4 17v2h3M20 17v2h-3M10 5h4M10 19h4M4 10v4M20 10v4"/>',
    marqueeEllipse: '<path d="M12 5a8 7 0 0 1 5.5 2.2M19.8 10.5a8 7 0 0 1 0 3M17.5 16.8A8 7 0 0 1 12 19M9 18.7A8 7 0 0 1 5 15.6M4.2 12.8a8 7 0 0 1 .6-3.6M6.6 6.7A8 7 0 0 1 10.5 5.1"/>',
    lasso: '<path d="M12 4c4.4 0 8 2.4 8 5.5S16.4 15 12 15 4 12.6 4 9.5 7.6 4 12 4z"/><path d="M8 14.3c-.6 1.4-.4 2.6.6 3.3"/><circle cx="9.3" cy="19" r="1.8"/>',
    crop: '<path d="M6 2v16h16"/><path d="M2 6h16v16"/>',
    scan: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/><path d="M8 8h3M8 16h3"/>',
    frames: '<rect x="3" y="6" width="14" height="12" rx="1.5"/><path d="M7 3h14v12"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    warning: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
  };

  function icon(name) {
    const body = PATHS[name] || PATHS.file;
    return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' + body + "</svg>";
  }

  function flag(code) {
    if (code === "uk") {
      return '<svg class="flag" data-flag="uk" viewBox="0 0 60 30" width="18" height="12" aria-hidden="true" focusable="false">' +
        '<clipPath id="ukQuarters"><path d="M30 15h30v15zM30 15v15H0zM30 15H0V0zM30 15V0h30z"/></clipPath>' +
        '<rect width="60" height="30" fill="#012169"/>' +
        '<path d="M0 0 60 30M60 0 0 30" stroke="#fff" stroke-width="6"/>' +
        '<path d="M0 0 60 30M60 0 0 30" clip-path="url(#ukQuarters)" stroke="#C8102E" stroke-width="4"/>' +
        '<path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/>' +
        '<path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/>' +
        "</svg>";
    }
    const bar = (x, width) => '<rect x="' + x + '" y="-1" width="' + width + '" height="2" rx="0.3"/>';
    const solid = bar(-7, 14);
    const split = bar(-7, 5.6) + bar(1.4, 5.6);
    const trigram = (x, y, angle, rows) => (
      '<g transform="translate(' + x + " " + y + ") rotate(" + angle + ')">' +
      '<g transform="translate(0 -3.4)">' + rows[0] + "</g>" +
      rows[1] +
      '<g transform="translate(0 3.4)">' + rows[2] + "</g></g>"
    );
    return '<svg class="flag" data-flag="kr" viewBox="0 0 72 48" width="18" height="12" aria-hidden="true" focusable="false">' +
      '<rect width="72" height="48" fill="#fff"/>' +
      '<g transform="rotate(-123.7 36 24)">' +
      '<path d="M36 12a12 12 0 0 1 0 24 6 6 0 0 1 0-12 6 6 0 0 0 0-12z" fill="#cd2e3a"/>' +
      '<path d="M36 12a12 12 0 0 0 0 24 6 6 0 0 1 0-12 6 6 0 0 0 0-12z" fill="#0047a0"/>' +
      "</g>" +
      '<g fill="#111">' +
      trigram(14, 10, -57.7, [solid, solid, solid]) +
      trigram(58, 10, 57.7, [split, solid, split]) +
      trigram(14, 38, -122.3, [solid, split, solid]) +
      trigram(58, 38, 122.3, [split, split, split]) +
      "</g></svg>";
  }

  return { icon: icon, flag: flag, names: Object.keys(PATHS) };
});
