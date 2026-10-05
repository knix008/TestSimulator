(function (root, factory) {
  const info = factory();
  if (typeof module === "object" && module.exports) module.exports = info;
  if (typeof root !== "undefined") root.MYPAINT_BUILD = info;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    name: "MyPaint",
    version: "10.0.0",
    title: "MyPaint 10.0",
    build: "2026.10.05.1",
    builtAt: "2026-10-05T11:30:00.000Z",
    author: "SHKWON(knix008@naver.com)",
    channel: "release",
  };
});
