// The popup window for dropdown lists (desktop app). The main page sends the items, the
// theme colours and the icon sprite with "menu-show"; this page draws them, reports its size
// (menu_ready) and sends back the pick (menu_pick) or a close (menu_close).

import { icon } from "./iconselect.js";

const { invoke } = window.__TAURI__.core;
const self = window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
const list = document.getElementById("list");

const items = () => [...list.querySelectorAll(".iselect-option")];
const pick = (value) => invoke("menu_pick", { value });

function show({ options, value, vars, scheme, font, sprite }) {
  if (sprite) document.getElementById("sprite").innerHTML = `<svg width="0" height="0" style="position:absolute">${sprite}</svg>`;
  const root = document.documentElement.style;
  for (const [name, v] of Object.entries(vars || {})) if (v) root.setProperty(name, v);
  root.colorScheme = scheme || "light";
  if (font) document.body.style.font = font;

  list.classList.remove("fill");
  list.classList.toggle("wide", options.length > 14);
  list.replaceChildren();
  let group = null;
  for (const option of options) {
    if (option.group && option.group !== group) {
      group = option.group;
      list.append(Object.assign(document.createElement("div"), { className: "iselect-group", textContent: group }));
    }
    const item = Object.assign(document.createElement("button"), { type: "button", className: "iselect-option", tabIndex: -1 });
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option.value === value));
    item.dataset.value = option.value;
    item.append(icon(option.icon), Object.assign(document.createElement("span"), { textContent: option.label }));
    item.addEventListener("click", () => pick(option.value));
    list.append(item);
  }
  requestAnimationFrame(async () => {
    const box = list.getBoundingClientRect();
    await invoke("menu_ready", { width: Math.ceil(box.width), height: Math.ceil(box.height) });
    list.classList.add("fill");
    const selected = items().find((i) => i.dataset.value === value) || items()[0];
    selected?.focus();
    selected?.scrollIntoView({ block: "nearest" });
  });
}

self.listen("menu-show", ({ payload }) => show(payload));

document.addEventListener("keydown", (event) => {
  const all = items();
  const index = all.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    invoke("menu_close");
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    all[(index + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (index >= 0) pick(all[index].dataset.value);
  } else if (event.key.length === 1) {
    all.find((i) => i.textContent.trim().toLowerCase().startsWith(event.key.toLowerCase()))?.focus();
  }
});
