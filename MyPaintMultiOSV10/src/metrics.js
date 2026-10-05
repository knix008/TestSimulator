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
      settings: { width: 380, height: 340 },
      about: { width: 360, height: 268 },
      error: { width: 420, height: 168 },
      progress: { width: 380, height: 160 },
      print: { width: 620, height: 740 },
      unsaved: { width: 400, height: 136 },
      recent: { width: 420, height: 424 },
      save: { width: 440, height: 196 },
      canvas: { width: 380, height: 232 },
      drop: { width: 420, height: 268 },
      convert: { width: 400, height: 260 },
      link: { width: 520, height: 232 },
      dicom: { width: 600, height: 480 },
      formats: { width: 480, height: 360 },
      theme: { width: 380, height: 420 },
      guide: { width: 440, height: 376 },
      palette: { width: 380, height: 316 },
    },
    PANEL_MIN: 200,
    MENU_ROW: 28,
    MENU_PAD: 8,
    PROGRESS_BYTES: 65536,
    MAX_UNDO: 100,
    TAG_ROWS: 11,
    CINE_FPS: 10,
  };
});
