// Every button has a tooltip. A button that does not set its own title shows its name; the
// symbols that have no words of their own are spelled out here.
let translate = (key) => key;

const SYMBOLS = { "-": "tip.decrease", "−": "tip.decrease", "+": "tip.increase", "×": "dialog.close", resize: "tip.resize" };
const SELECTOR = "button, [role=button]";

export function setTipTranslator(t) {
  translate = t;
}

export function tipFor(element) {
  const text = (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim();
  return SYMBOLS[text] ? translate(SYMBOLS[text]) : text;
}

/** The title is set when the pointer arrives, so it always speaks the current language. */
export function refreshTip(element) {
  if (element.hasAttribute("title") && !element.hasAttribute("data-auto-tip")) return;
  element.setAttribute("data-auto-tip", "");
  element.title = tipFor(element);
}

export function installTooltips() {
  document.addEventListener("pointerover", (event) => {
    const element = event.target instanceof Element ? event.target.closest(SELECTOR) : null;
    if (element) refreshTip(element);
  }, true);
}
