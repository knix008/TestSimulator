(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintIcons = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PATHS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/>',
    moon: '<path d="M20 14.500A8.500 8.500 0 1 1 9.500 4a7 7 0 0 0 10.500 10.500z"/>',
    effects: '<path d="M12 3.500 13.900 9 19.500 11 13.900 13 12 18.500 10.100 13 4.500 11 10.100 9z"/><path d="M18.500 16v4M16.500 18h4"/><path d="M5.500 3.500v3M4 5h3"/>',
    drag: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    speed: '<path d="M4 17a9 9 0 1 1 16 0"/><path d="M12 14l4.5-5"/><circle cx="12" cy="14.5" r="1.4"/>',
    shuffle: '<path d="M3 7h3.5c5 0 6 10 11 10H21"/><path d="M3 17h3.5c1.8 0 3-1.2 4-2.8M13.5 9.8c1-1.6 2.200-2.800 4-2.800H21"/><path d="M18.500 4.500 21 7l-2.500 2.500M18.500 14.500 21 17l-2.500 2.500"/>',
    new: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>',
    open: '<path d="M3 7h6l2 2h10v10H3z"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8"/><path d="M8 21v-6h8v6"/>',
    saveAs: '<path d="M5 3h11l3 3v15H5z"/><path d="M12 13v6M9 16h6"/>',
    undo: '<path d="M8 8H4v4"/><path d="M4 12a8 8 0 1 0 2.5-6"/>',
    redo: '<path d="M16 8h4v4"/><path d="M20 12a8 8 0 1 1-2.5-6"/>',
    cut: '<circle cx="6" cy="7" r="2.2"/><circle cx="6" cy="17" r="2.2"/><path d="M8 8.5 20 18M8 15.5 20 6"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M5 15V5h10"/>',
    paste: '<path d="M8 5h8v3H8z"/><path d="M7 7H6v14h12V7h-1"/>',
    select: '<path fill="currentColor" stroke="none" d="M5.1 3.1 5.5 16.6 9.3 13.2 12.7 20.1 15.3 18.8 11.9 12 17.6 11.3z"/>',
    pencil: '<path d="M15.6 3.5 20.5 8.4 18.4 10.5 13.5 5.6z"/>' +
      '<path d="M13.5 5.6 18.4 10.5 16.2 12.7 11.3 7.8z"/>' +
      '<path d="M12.6 6.9 17.2 11.5M11.3 7.8 16.2 12.7 7 21.2 2.4 16.6z"/>' +
      '<path fill="currentColor" stroke="none" d="M2.4 16.6 4.6 18.2 3.2 20.2z"/>',
    brush: '<g transform="rotate(-38 12 13)">' +
      '<path d="M10.3 13h3.4v7.6a1.7 1.7 0 0 1-3.4 0z"/>' +
      '<rect x="9.5" y="9.6" width="5" height="3.6"/>' +
      '<path d="M9.5 9.6c.5-2.4 1.4-4.8 2.5-6.5 1.1 1.7 2 4.1 2.5 6.5"/>' +
      '<path d="M12 3.6v5.6"/>' +
      '</g>',
    marker: '<path d="M2.2 17.4h8.2" stroke-width="3.3"/>' +
      '<path d="M16.6 3.2 20.6 7.2 12.8 15 9 11.2z"/>' +
      '<path d="M15 4.8 18.4 8.2"/>' +
      '<path d="M9 11.2 12.8 15 11 17.4 7.2 13.6z"/>',
    spray: '<rect x="13.6" y="8.4" width="6.2" height="11.4" rx="1.3"/>' +
      '<path d="M14.8 8.4V6.5h3.8v1.9M14.8 6.5 12.2 4.6"/>' +
      '<circle cx="4.2" cy="8" r="1.05" fill="currentColor" stroke="none"/>' +
      '<circle cx="7.3" cy="5.8" r="1.05" fill="currentColor" stroke="none"/>' +
      '<circle cx="6.4" cy="10" r="1.2" fill="currentColor" stroke="none"/>' +
      '<circle cx="9.6" cy="8.2" r=".95" fill="currentColor" stroke="none"/>' +
      '<circle cx="4.7" cy="12" r=".8" fill="currentColor" stroke="none"/>' +
      '<circle cx="8.6" cy="12" r=".75" fill="currentColor" stroke="none"/>',
    eraser: '<g transform="rotate(-32 12 12)">' +
      '<rect x="3" y="8.3" width="18" height="7.4" rx="1.2"/>' +
      '<path d="M8.2 8.3v7.4"/>' +
      '</g>',
    line: '<path d="M4.5 19.5 19.5 4.5" stroke-width="1.9"/>',
    arrow: '<path d="M4.2 19.8 13.2 10.8"/>' +
      '<path fill="currentColor" stroke="currentColor" d="M20.6 3.4 12.2 7.4 16.6 11.8z"/>',
    curve: '<path d="M4 16.8C8 5.2 16 5.6 20 15.2" stroke-width="1.9"/>' +
      '<circle cx="4" cy="16.8" r="1.35" fill="currentColor" stroke="none"/>' +
      '<circle cx="20" cy="15.2" r="1.35" fill="currentColor" stroke="none"/>',
    rect: '<rect x="4.2" y="5.2" width="15.6" height="13.6"/>',
    roundRect: '<rect x="4.2" y="5.2" width="15.6" height="13.6" rx="4.4"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    triangle: '<path d="M12 4 21 20H3z"/>',
    diamond: '<path d="M12 3 21 12 12 21 3 12z"/>',
    rightTriangle: '<path d="M4 4v16h16z"/>',
    pentagon: '<path d="M12 3 21 10 17.5 21h-11L3 10z"/>',
    hexagon: '<path d="M7.500 4h9L21 12l-4.500 8h-9L3 12z"/>',
    star: '<path d="M12 3l2.800 5.800 6.200.9-4.500 4.400 1.100 6.300L12 17.500l-5.600 2.900 1.100-6.300L3 9.700l6.200-.9z"/>',
    heart: '<path d="M12 20.500C5 15.500 3 12 3 8.700 3 6 5 4 7.500 4c1.900 0 3.500 1 4.500 2.700C13 5 14.600 4 16.500 4 19 4 21 6 21 8.700c0 3.300-2 6.800-9 11.800z"/>',
    blockArrow: '<path d="M3 9h10V4.500L21 12l-8 7.500V15H3z"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    bubble: '<path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4.500V16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>',
    cloud: '<path d="M7 19a4.500 4.500 0 0 1-.6-8.960A6 6 0 0 1 18 9.500a4.800 4.800 0 0 1-.5 9.500z"/>',
    text: '<path d="M4.2 4.8h15.6" stroke-width="2.4"/><path d="M12 4.8v14.6" stroke-width="2.4"/><path d="M8 19.4h8"/>',
    /* a paint bucket tipped over, pouring a drop */
    fill: '<g transform="rotate(-40 10.5 12.5)">' +
      '<path d="M5.4 9.2h10.2v7.6a2.2 2.2 0 0 1-2.2 2.2H7.6a2.2 2.2 0 0 1-2.2-2.2z"/>' +
      '<path d="M7.6 9.2V6.8a2.9 2.9 0 0 1 5.8 0v2.4"/>' +
      '<path d="M5.4 12h10.2" stroke-opacity="0.55"/>' +
      '</g>' +
      '<path d="M16.6 9.6c1.9.2 3.1 1.3 3.3 3.1"/>' +
      '<path fill="currentColor" stroke="none" d="M20 14.2c.9 1.3 1.4 2.1 1.4 2.8a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.5 1.4-2.8z"/>',
    freeCurve: '<path d="M3.5 17.5c2.2-5.4 4.6-7.2 6.4-4.6s3.3 3.4 5-.6 3.2-6.3 5.6-5.3" stroke-width="1.9"/>' +
      '<circle cx="3.5" cy="17.5" r="1.2" fill="currentColor" stroke="none"/>' +
      '<circle cx="20.5" cy="7" r="1.2" fill="currentColor" stroke="none"/>',
    home: '<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 9.6V20h4.6v-5.4h3.2V20h4.6V9.6"/>',
    ruler: '<rect x="2.8" y="7.4" width="18.4" height="9.2" rx="1.2"/>' +
      '<path d="M6.4 7.4v3.2M9.8 7.4v2M13.2 7.4v3.2M16.6 7.4v2M20 7.4v3.2"/>',
    /* an artist's palette: a wooden board with the thumb notch at the lower right and four
     * dabs of paint around the top */
    themePalette: '<circle cx="12" cy="12" r="6.6" fill="none" stroke="#ef4444" stroke-width="4.8" stroke-linecap="butt" stroke-dasharray="6.962 34.558" transform="rotate(0 12 12)"/>' +
      '<circle cx="12" cy="12" r="6.6" fill="none" stroke="#f59e0b" stroke-width="4.8" stroke-linecap="butt" stroke-dasharray="6.962 34.558" transform="rotate(60 12 12)"/>' +
      '<circle cx="12" cy="12" r="6.6" fill="none" stroke="#22c55e" stroke-width="4.8" stroke-linecap="butt" stroke-dasharray="6.962 34.558" transform="rotate(120 12 12)"/>' +
      '<circle cx="12" cy="12" r="6.6" fill="none" stroke="#06b6d4" stroke-width="4.8" stroke-linecap="butt" stroke-dasharray="6.962 34.558" transform="rotate(180 12 12)"/>' +
      '<circle cx="12" cy="12" r="6.6" fill="none" stroke="#3b82f6" stroke-width="4.8" stroke-linecap="butt" stroke-dasharray="6.962 34.558" transform="rotate(240 12 12)"/>' +
      '<circle cx="12" cy="12" r="6.6" fill="none" stroke="#a855f7" stroke-width="4.8" stroke-linecap="butt" stroke-dasharray="6.962 34.558" transform="rotate(300 12 12)"/>',
    svgCode: '<path d="M8 7 3 12l5 5"/><path d="M16 7l5 5-5 5"/><path d="M13.5 5 10.5 19"/>',
    picker: '<g transform="rotate(-42 12 12)">' +
      '<ellipse cx="12" cy="5" rx="3.3" ry="2.5"/>' +
      '<path d="M9.4 7h5.2l-.7 2H10z"/>' +
      '<path d="M10.2 9h3.6v7.2L12 19.6 10.2 16.2z"/>' +
      '</g>',
    palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1.3"/><circle cx="12.5" cy="7" r="1.3"/><circle cx="16.5" cy="10" r="1.3"/><circle cx="7.5" cy="14.2" r="1.3"/><circle cx="14.6" cy="15.4" r="2.3"/>',
    draw: '<path d="M12 2.8 17.5 12 15 18H9l-2.500-6z"/><path d="M12 2.800V10.300"/><circle cx="12" cy="12.200" r="1.900"/><path d="M8.500 21.200h7"/>',
    canvas: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 16l5-4 4 3 3-2 6 4"/>',
    layerUp: '<path d="M12 4l5 5h-10z"/><path d="M4 13h16"/><path d="M4 18h16"/>',
    layerDown: '<path d="M12 20l5-5h-10z"/><path d="M4 11h16"/><path d="M4 6h16"/>',
    clear: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/>',
    stroke: '<path d="M3 17c4-6 8-6 12 0"/><path d="M3 7h18"/>',
    prev: '<path d="M15 6 9 12l6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    /* a plain magnifier for the View menu, so it is not taken for zoom in or out */
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    zoomIn: '<circle cx="11" cy="11" r="6"/><path d="M11 8v6M8 11h6M16 16l4 4"/>',
    zoomOut: '<circle cx="11" cy="11" r="6"/><path d="M8 11h6M16 16l4 4"/>',
    grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 3.5v17M14.5 3.5v17"/>',
    shapes: '<rect x="3" y="3.5" width="11" height="11" rx="1.5"/><circle cx="15.2" cy="15.2" r="5.2"/>',
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
    properties: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
    help: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14"/><path d="M12 17h.01"/>',
    pixel: '<path d="M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/><rect x="9.3" y="9.3" width="5.4" height="5.4" fill="currentColor" stroke="none"/>',
    marquee: '<rect x="4" y="4.8" width="16" height="14.4" stroke-dasharray="2.7 2"/>',
    marqueeEllipse: '<ellipse cx="12" cy="12" rx="8" ry="6.1" stroke-dasharray="2.5 1.9"/>',
    lasso: '<path stroke-dasharray="2.4 1.7" d="M5.4 9.4 8.6 4.8l6.2-.6 4.4 4.2-1.4 5.6-5 4.6-6.2-2.8z"/>',
    crop: '<path d="M6 2v16h16"/><path d="M2 6h16v16"/>',
    scan: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/><path d="M8 8h3M8 16h3"/>',
    frames: '<rect x="3" y="6" width="14" height="12" rx="1.5"/><path d="M7 3h14v12"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    warning: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
  };

  /* Every icon has a colour of its own, the same wherever it appears (toolbar, menu bar,
   * menus, panels). Mid tones, so they read on the light and the dark themes alike. The
   * colour goes on the <svg> as an inline `color`, which the strokes and fills take through
   * currentColor and which wins over the stylesheet's single accent colour. Icons not listed
   * (the drop-down caret) keep the text colour. */
  const COLORS = {
    // files
    new: "#0ea5e9", open: "#f59e0b", folder: "#f59e0b", file: "#3b82f6", save: "#2563eb", saveAs: "#6366f1",
    download: "#10b981", print: "#6366f1", link: "#0891b2", exit: "#ef4444", image: "#16a34a", canvas: "#0891b2",
    // editing
    undo: "#f97316", redo: "#f97316", cut: "#ef4444", copy: "#8b5cf6", paste: "#d97706", trash: "#dc2626",
    clear: "#dc2626", crop: "#0d9488", check: "#16a34a", layerUp: "#7c3aed", layerDown: "#7c3aed",
    // tools
    pixel: "#0284c7", select: "#2563eb", marquee: "#0284c7", marqueeEllipse: "#0284c7", lasso: "#0284c7",
    pencil: "#ca8a04", brush: "#9333ea", marker: "#db2777", spray: "#0d9488", eraser: "#e11d48",
    line: "#0f766e", arrow: "#ea580c", curve: "#7c3aed", freeCurve: "#c026d3", rect: "#2563eb",
    roundRect: "#0891b2", ellipse: "#16a34a", triangle: "#d97706", text: "#1d4ed8", fill: "#0284c7",
    picker: "#9333ea", stroke: "#ea580c", font: "#1d4ed8", opacity: "#0891b2",
    // view
    search: "#0284c7", home: "#ea580c", ruler: "#b45309", grid: "#0891b2", shapes: "#7c3aed", zoomIn: "#16a34a", zoomOut: "#16a34a",
    panelLeft: "#0284c7", panelRight: "#0284c7", prev: "#2563eb", next: "#2563eb", frames: "#7c3aed",
    play: "#16a34a", stop: "#dc2626", scan: "#0891b2", svgCode: "#c026d3",
    // program
    diamond: "#0d9488", rightTriangle: "#ca8a04", pentagon: "#7c3aed", hexagon: "#0284c7", star: "#f59e0b", heart: "#e11d48", blockArrow: "#ea580c", cross: "#dc2626", bubble: "#2563eb", cloud: "#0ea5e9",
    effects: "#a855f7", draw: "#db2777", sun: "#f59e0b", moon: "#6366f1", drag: "#667085", speed: "#ea580c", shuffle: "#7c3aed",
    settings: "#0d9488", about: "#2563eb", help: "#0ea5e9", language: "#059669", theme: "#db2777",
    themePalette: "#a16207", palette: "#db2777", properties: "#7c3aed", wrench: "#ea580c", warning: "#f59e0b",
  };

  function icon(name) {
    const body = PATHS[name] || PATHS.file;
    const colour = COLORS[PATHS[name] ? name : "file"];
    return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"' +
      (colour ? ' class="ico-color" style="color:' + colour + '"' : "") + ">" + body + "</svg>";
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
