// A dropdown whose button and options all carry an icon (a native <select> cannot show icons).
// Keyboard: Enter/Space/↓ opens, ↑/↓ move, Enter picks, Esc closes; typing a letter jumps.

const SVG = "http://www.w3.org/2000/svg";
let openSelect = null;

export function icon(id, className = "i") {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

document.addEventListener("pointerdown", (event) => {
  if (openSelect && !openSelect.root.contains(event.target)) openSelect.close();
});
window.addEventListener("blur", () => openSelect?.close());

/**
 * @param root     an empty element to build into (gets class "iselect")
 * @param options  [{ value, label, icon, group? }]
 * @param onChange called with the new value when the user picks one
 */
export class IconSelect {
  /** Desktop: lists open in their own window (see useNativeMenus); null = inside the page. */
  static native = null;
  static registry = new Map();

  constructor(root, { options = [], value, onChange, title = "", compact = false } = {}) {
    this.root = root;
    if (root.id) IconSelect.registry.set(root.id, this);
    this.onChange = onChange;
    root.classList.add("iselect");
    if (root.classList.contains("full")) root.classList.add("full");
    if (compact) root.classList.add("compact-label");
    this.button = Object.assign(document.createElement("button"), { type: "button", className: "iselect-button" });
    this.button.setAttribute("aria-haspopup", "listbox");
    this.button.setAttribute("aria-expanded", "false");
    this.list = Object.assign(document.createElement("div"), { className: "iselect-list", hidden: true });
    this.list.setAttribute("role", "listbox");
    root.replaceChildren(this.button, this.list);
    this.button.addEventListener("click", () => (this.list.hidden ? this.open() : this.close()));
    this.button.addEventListener("keydown", (e) => this.onKey(e));
    this.list.addEventListener("keydown", (e) => this.onKey(e));
    this.setTitle(title);
    this.setOptions(options, value);
  }

  setTitle(title) {
    this.button.title = title;
    this.button.setAttribute("aria-label", title);
  }

  setOptions(options, value = this.value) {
    this.options = options;
    this.list.replaceChildren();
    let group = null;
    for (const option of options) {
      if (option.group && option.group !== group) {
        group = option.group;
        this.list.append(Object.assign(document.createElement("div"), { className: "iselect-group", textContent: group }));
      }
      const item = Object.assign(document.createElement("button"), { type: "button", className: "iselect-option", tabIndex: -1 });
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.append(icon(option.icon), Object.assign(document.createElement("span"), { textContent: option.label }));
      item.addEventListener("click", () => this.pick(option.value));
      this.list.append(item);
    }
    this.setValue(value ?? options[0]?.value);
  }

  setValue(value) {
    const option = this.options.find((o) => o.value === value) || this.options[0];
    if (!option) return;
    this.value = option.value;
    this.button.replaceChildren(icon(option.icon), Object.assign(document.createElement("span"), { className: "iselect-label", textContent: option.label }), icon("i-chevron", "i chevron"));
    for (const item of this.items()) item.setAttribute("aria-selected", String(item.dataset.value === option.value));
  }

  items() {
    return [...this.list.querySelectorAll(".iselect-option")];
  }

  pick(value) {
    const changed = value !== this.value;
    this.setValue(value);
    this.close();
    this.button.focus();
    if (changed) this.onChange?.(value);
  }

  open() {
    if (IconSelect.native) {
      IconSelect.native.open(this);
      return;
    }
    openSelect?.close();
    openSelect = this;
    this.list.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    // Open upwards/leftwards when there is no room below/right.
    const r = this.root.getBoundingClientRect();
    this.list.classList.toggle("align-right", r.left + this.list.offsetWidth > window.innerWidth - 8);
    const current = this.items().find((i) => i.dataset.value === this.value) || this.items()[0];
    current?.focus();
  }

  close() {
    if (this.list.hidden) return;
    this.list.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    if (openSelect === this) openSelect = null;
  }

  onKey(event) {
    const items = this.items();
    const index = items.indexOf(document.activeElement);
    if (this.list.hidden) {
      if (["Enter", " ", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        this.open();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      this.button.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      next?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      if (index >= 0) {
        event.preventDefault();
        this.pick(items[index].dataset.value);
      }
    } else if (event.key === "Tab") {
      this.close();
    } else if (event.key.length === 1) {
      const hit = items.find((i) => i.textContent.trim().toLowerCase().startsWith(event.key.toLowerCase()));
      hit?.focus();
    }
  }
}

const THEME_VARS = ["--bg", "--panel", "--panel-2", "--border", "--text", "--muted", "--accent", "--accent-ink", "--accent-soft", "--hover"];

/**
 * Desktop app: every IconSelect opens its list as a separate borderless window
 * (src-tauri/src/menu.rs + src/menu.html), so the list may extend past the main window.
 */
export function useNativeMenus(tauri) {
  const invoke = tauri.core.invoke;
  const self = tauri.webviewWindow.getCurrentWebviewWindow();
  IconSelect.native = {
    async open(select) {
      const r = select.button.getBoundingClientRect();
      const css = getComputedStyle(document.documentElement);
      const vars = Object.fromEntries(THEME_VARS.map((v) => [v, css.getPropertyValue(v).trim()]));
      const list = {
        options: select.options,
        value: select.value,
        vars,
        scheme: css.colorScheme || "light",
        font: getComputedStyle(document.body).font,
        sprite: document.querySelector("svg defs").outerHTML,
      };
      const anchor = { id: select.root.id, x: r.left, y: r.top, width: r.width, height: r.height };
      if (await invoke("menu_open", { anchor, list })) select.button.setAttribute("aria-expanded", "true");
    },
  };
  self.listen("menu-picked", ({ payload }) => IconSelect.registry.get(payload.id)?.pick(payload.value));
  self.listen("menu-closed", ({ payload }) => IconSelect.registry.get(payload.id)?.button.setAttribute("aria-expanded", "false"));
}
