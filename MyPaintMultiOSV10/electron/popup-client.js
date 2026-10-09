/* The desktop build talks through popupHost. A browser window opened from the page
 * talks to window.opener with the same messages. */
function applyTheme(css) {
  const style = document.getElementById("themeVars");
  if (style) style.textContent = css;
}

function collect(root) {
  const detail = {};
  root.querySelectorAll("[data-field]").forEach((el) => {
    const key = el.dataset.field || (el.type === "radio" ? el.name : "");
    if (!key) return;
    if (el.type === "radio") {
      if (el.checked) detail[key] = el.value;
      return;
    }
    detail[key] = el.type === "checkbox" ? el.checked : el.value;
  });
  return detail;
}

function sendAction(name, detail) {
  if (window.popupHost) {
    popupHost.action(name, detail);
    return;
  }
  if (window.opener) window.opener.postMessage({ source: "mypaint", type: "action", name: name, detail: detail || {} }, targetOrigin());
}

function targetOrigin() {
  return /^https?:$/.test(location.protocol) ? location.origin : "*";
}

let bound = false;
function showHtml(html) {
  const root = document.getElementById("root");
  root.innerHTML = html;
  const title = root.querySelector(".popup-title");
  if (title && title.textContent) document.title = title.textContent;
  if (bound) return;
  bound = true;
  root.addEventListener("click", (event) => {
    const spin = event.target.closest("[data-spin]");
    if (spin) {
      const parts = String(spin.dataset.spin).split(":");
      const input = root.querySelector('[data-field="' + parts[0] + '"]');
      if (input) {
        const step = Number(parts[1]) || 1;
        const low = input.min === "" ? -Infinity : Number(input.min);
        const high = input.max === "" ? Infinity : Number(input.max);
        input.value = String(Math.min(high, Math.max(low, (Number(input.value) || 0) + step)));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }
    const tab = event.target.closest("[data-tab]");
    if (tab && root.contains(tab)) {
      root.querySelectorAll("[data-tab]").forEach((node) => node.classList.toggle("on", node === tab));
      root.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
      return;
    }
    const button = event.target.closest("[data-popup-action]");
    if (!button) return;
    const detail = collect(root);
    if (button.dataset.theme) detail.theme = button.dataset.theme;
    if (button.dataset.id) detail.id = button.dataset.id;
    sendAction(button.dataset.popupAction, detail);
  });
  root.addEventListener("change", (event) => {
    const popup = root.querySelector(".popup");
    if (!popup || !event.target.closest("[data-field]")) return;
    const sync = { settings: "settings-sync", print: "print-sync", palette: "palette-sync", canvas: "canvas-sync" };
    const name = sync[popup.dataset.kind];
    if (!name) return;
    sendAction(name, collect(root));
  });
}

if (window.popupHost) {
  popupHost.onTheme(applyTheme);
  popupHost.onHtml(showHtml);
} else if (window.opener) {
  window.addEventListener("message", (event) => {
    if (event.source !== window.opener || !event.data || event.data.source !== "mypaint") return;
    if (event.data.type === "theme") applyTheme(event.data.css || "");
    if (event.data.type === "html") {
      showHtml(event.data.html || "");
      const width = Number(event.data.width) || 0;
      const height = Number(event.data.height) || 0;
      if (width > 0 && height > 0) {
        const extraW = Math.max(0, window.outerWidth - window.innerWidth);
        const extraH = Math.max(0, window.outerHeight - window.innerHeight);
        window.resizeTo(width + extraW, height + extraH);
      }
    }
  });
  window.opener.postMessage({ source: "mypaint", type: "ready" }, targetOrigin());
}
