// Present only inside the Tauri shell. A browser, and the test page, leave
// window.mycalcDesktop unset so they keep using window.open and window.print.
(function () {
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core || typeof tauri.core.invoke !== "function") return;
  const invoke = tauri.core.invoke.bind(tauri.core);

  window.mycalcDesktop = {
    setContentSize(mode) {
      return invoke("set_content_size", { mode });
    },
    saveFile(payload) {
      const bytes = payload && payload.bytes ? Array.from(payload.bytes) : [];
      return invoke("save_file", { name: payload && payload.name, bytes }).catch((error) => ({
        canceled: true,
        error: error && error.message ? error.message : String(error),
      }));
    },
    windowControl(action) {
      return invoke("window_control", { action });
    },
    setBounds(bounds) {
      return invoke("set_bounds", { bounds });
    },
    openWindow(kind) {
      return invoke("open_window", { kind });
    },
    closeWindow() {
      return invoke("close_window");
    },
    onWindowState(handler) {
      if (!tauri.event || typeof tauri.event.listen !== "function") return;
      tauri.event.listen("window-state", (event) => handler(event.payload));
    },
  };

  // The print window asks for the printers and sends the page setup through.
  // Windows applies those margins itself, so the page padding stays at zero.
  window.mycalcPrint = {
    nativeMargins: /Windows/.test(navigator.userAgent),
    printers() {
      return invoke("list_printers").catch(() => []);
    },
    print(options) {
      return invoke("print_page", { options }).catch((error) => ({
        success: false,
        failureReason: error && error.message ? error.message : String(error),
      }));
    },
  };

  // Every window is built hidden and shown once its page is in, so it never
  // flashes up as an empty outline.
  const reportReady = () => invoke("window_ready").catch(() => {});
  if (document.readyState === "complete") reportReady();
  else window.addEventListener("load", reportReady, { once: true });

  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const editable = textField(event.target);
    const selected = String(window.getSelection ? window.getSelection() : "").trim().length > 0;
    invoke("edit_menu", {
      request: {
        editable,
        selected,
        lang: document.documentElement.lang === "en" ? "en" : "ko",
      },
    });
  });

  function textField(target) {
    if (!target || !target.tagName) return false;
    if (target.isContentEditable) return true;
    if (target.disabled) return false;
    if (target.tagName === "TEXTAREA") return true;
    if (target.tagName !== "INPUT") return false;
    const type = String(target.type || "text").toLowerCase();
    return ["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].indexOf(type) < 0;
  }
})();
