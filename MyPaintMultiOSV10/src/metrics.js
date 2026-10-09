(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintMetrics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    MIN_WIDTH: 1180,
    MIN_HEIGHT: 720,
    TITLE: "MyPaint 10.0",
    APP_ID: "com.shkwon.mypaint",
    POPUPS: {
      settings: { width: 380, height: 298 },
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
      convert: { width: 400, height: 226 },
      link: { width: 520, height: 194 },
      dicom: { width: 600, height: 554 },
      formats: { width: 480, height: 298 },
      theme: { width: 380, height: 410 },
      guide: { width: 440, height: 362 },
      palette: { width: 380, height: 258 },
    },
    PANEL_MIN: 200,
    TOOL_PANEL: 200,
    PROP_PANEL: 200,
    MENU_ROW: 28,
    MENU_PAD: 8,
    PROGRESS_BYTES: 65536,
    MAX_UNDO: 100,
    TAG_ROWS: 11,
    CINE_FPS: 10,
  };
});
