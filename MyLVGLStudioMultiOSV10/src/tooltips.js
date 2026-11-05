// Every button has a tooltip. A button that does not set its own title shows its name; the
// symbols that have no words of their own are spelled out here.
let translate = (key) => key;

const SYMBOLS = { "-": "tip.decrease", "−": "tip.decrease", "+": "tip.increase", "×": "dialog.close", resize: "tip.resize" };
const SELECTOR = "button, [role=button]";

export function setTipTranslator(t) {
  translate = t;
}

export function tipFor(element) {
  // A switch has no words of its own: it is named by the label beside it.
  const beside = element.closest(".field")?.querySelector(".field-label") ?? element.previousElementSibling ?? element.parentElement?.previousElementSibling;
  const own = element.getAttribute("aria-label") || element.textContent || "";
  const text = (own.trim() ? own : beside?.textContent ?? "").replace(/\s+/g, " ").trim();
  return SYMBOLS[text] ? translate(SYMBOLS[text]) : text;
}

/** The title is set when the pointer arrives, so it always speaks the current language. */
export function refreshTip(element) {
  if (element.hasAttribute("title") && !element.hasAttribute("data-auto-tip")) return;
  element.setAttribute("data-auto-tip", "");
  element.title = tipFor(element);
}

export function installTooltips(doc = document) {
  doc.addEventListener("pointerover", (event) => {
    // Not instanceof: an element of a dialog's window belongs to that window's Element.
    const element = event.target?.closest?.(SELECTOR);
    if (element) refreshTip(element);
  }, true);
}
