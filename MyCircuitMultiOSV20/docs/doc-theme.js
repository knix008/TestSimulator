// The manual and the tutorial page follow MyCircuit's theme. The program keeps
// its current colours in localStorage ("mycircuit.docTheme", written by
// App.applyTheme); these pages share its origin (the desktop manual window and
// a browser tab of the web build alike), so they read it before the first
// paint and follow later changes through the storage event. Opened on their
// own, they keep their light palette.
(function () {
  "use strict";
  var KEY = "mycircuit.docTheme";
  var root = document.documentElement;
  // Rules the page's light palette writes as fixed colours.
  var RULES = [
    "html[data-app-theme] { color-scheme: var(--scheme); }",
    "html[data-app-theme] body { background: var(--bg); }",
    "html[data-app-theme] nav.toc input { background: var(--input); color: var(--text); border-color: var(--line2); }",
    "html[data-app-theme] code { border-color: var(--line); }",
    "html[data-app-theme] pre { background: var(--code); }",
    "html[data-app-theme] kbd { background: var(--code); color: var(--text); border-color: var(--line2); box-shadow: none; }",
    "html[data-app-theme] .menu { background: var(--code); color: var(--text); }",
    "html[data-app-theme] table { background: var(--paper); }",
    "html[data-app-theme] th { background: var(--code); }",
    "html[data-app-theme] tbody tr:nth-child(even) td { background: var(--alt); }",
    "html[data-app-theme] tr.group td { background: var(--accent-soft) !important; color: var(--text); }",
    "html[data-app-theme] figure img { border-color: var(--line2); }",
    "html[data-app-theme] .totop { background: var(--accent); color: var(--accent-text); }",
    "html[data-app-theme][data-app-theme=dark] .pill.e { background: rgba(240, 82, 82, 0.18); color: #ff9b9b; }",
    "html[data-app-theme][data-app-theme=dark] .pill.w { background: rgba(240, 170, 40, 0.18); color: #ffcf7a; }",
  ].join("\n");

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }

  function apply(theme) {
    if (!theme || !theme.tokens || !theme.tokens["--bg"]) return;
    var t = theme.tokens;
    var dark = theme.mode === "dark";
    // App token → page variable.
    var vars = {
      "--bg": t["--bg"], "--paper": t["--panel"], "--side": t["--panel2"], "--code": t["--panel3"],
      "--text": t["--text"], "--muted": t["--muted"], "--line": t["--line"], "--line2": t["--line2"],
      "--accent": t["--accent"], "--accent-soft": t["--accent-soft"], "--accent-text": t["--accent-text"] || "#fff",
      "--input": t["--input"] || t["--panel"],
      "--alt": "color-mix(in srgb, " + t["--panel"] + " 94%, " + t["--text"] + ")",
      "--scheme": dark ? "dark" : "light",
    };
    if (dark) {
      vars["--tip"] = "rgba(46, 158, 91, 0.16)";
      vars["--warn"] = "rgba(224, 138, 0, 0.16)";
      vars["--note"] = "rgba(59, 116, 216, 0.18)";
      vars["--bad"] = "rgba(211, 60, 60, 0.18)";
    } else {
      ["--tip", "--warn", "--note", "--bad"].forEach(function (k) { root.style.removeProperty(k); });
    }
    for (var k in vars) if (vars[k]) root.style.setProperty(k, vars[k]);
    root.setAttribute("data-app-theme", dark ? "dark" : "light");
    if (!document.getElementById("app-theme-rules")) {
      var style = document.createElement("style");
      style.id = "app-theme-rules";
      style.textContent = RULES;
      (document.head || root).appendChild(style);
    }
  }

  apply(read());
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(read());
  });
})();
