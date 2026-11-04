(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintMetrics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    MIN_WIDTH: 1210,
    MIN_HEIGHT: 720,
    TITLE: "MyPaint 10.0",
    APP_ID: "com.shkwon.mypaint",
    POPUPS: {
      // wide enough for the five tabs with their icons in English, and tall enough for the Start
      // screen tab: its twenty backgrounds show without a scroll bar
      settings: { width: 520, height: 520 },
      about: { width: 500, height: 460 },
      error: { width: 420, height: 168 },
      progress: { width: 380, height: 162 },
      print: { width: 620, height: 740 },
      unsaved: { width: 400, height: 130 },
      recent: { width: 420, height: 422 },
      save: { width: 440, height: 194 },
      canvas: { width: 380, height: 194 },
      newdoc: { width: 380, height: 164 },
      drop: { width: 420, height: 258 },
      // the picture's format and quality, then its border and shadow
      convert: { width: 520, height: 600 },
      link: { width: 520, height: 194 },
      dicom: { width: 600, height: 554 },
      formats: { width: 480, height: 298 },
      theme: { width: 380, height: 410 },
      guide: { width: 440, height: 362 },
      palette: { width: 380, height: 258 },
    },
    // a grid cell on the screen stays this size; outside it the cell is split or joined by five
    GRID_MIN_CELL: 6,
    GRID_MAX_CELL: 30,
    PANEL_MIN: 200,
    // the smallest each panel goes; the separators widen them up to PANEL_MAX
    TOOL_PANEL: 200,
    PROP_PANEL: 240,
    PANEL_MAX: 480,
    MENU_ROW: 28,
    MENU_PAD: 8,
    PROGRESS_BYTES: 65536,
    MAX_UNDO: 100,
    TAG_ROWS: 11,
    CINE_FPS: 10,
  };
});
