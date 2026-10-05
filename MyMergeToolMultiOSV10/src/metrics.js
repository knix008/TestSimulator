(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyMergeMetrics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    MIN_WIDTH: 1200,
    MIN_HEIGHT: 700,
    TITLE: "MyMerge 10.0",
    APP_ID: "com.shkwon.mymerge",
    POPUPS: {
      settings: { width: 520, height: 300 },
      about: { width: 460, height: 256 },
      error: { width: 560, height: 168 },
      progress: { width: 480, height: 192 },
      print: { width: 700, height: 560 },
      unsaved: { width: 480, height: 136 },
      recent: { width: 560, height: 424 },
      save: { width: 520, height: 168 },
      git: { width: 640, height: 200 },
      assign: { width: 480, height: 232 },
      theme: { width: 420, height: 420 },
      guide: { width: 720, height: 376 },
    },
    MENU_ROW: 32,
    MENU_PAD: 8,
    PROGRESS_BYTES: 65536,
  };
});
