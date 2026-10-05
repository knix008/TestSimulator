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

let bound = false;
popupHost.onHtml((html) => {
  const root = document.getElementById("root");
  root.innerHTML = html;
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
    popupHost.action(button.dataset.popupAction, detail);
  });
  root.addEventListener("change", (event) => {
    const popup = root.querySelector(".popup");
    if (!popup || !event.target.closest("[data-field]")) return;
    if (popup.dataset.kind === "settings") {
      popupHost.action("settings-sync", collect(root));
      return;
    }
    if (popup.dataset.kind !== "print") return;
    popupHost.action("print-sync", collect(root));
  });
});
