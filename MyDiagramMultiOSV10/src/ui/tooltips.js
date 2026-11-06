// Every button has a tooltip. Most are written with their own title; a button without one
// takes its accessible name or its text, whenever it appears, in every window.
const SELECTOR = 'button:not([title]), [role="button"]:not([title]), a.button:not([title])';

export function addMissingTooltips(root = document) {
  for (const element of root.querySelectorAll(SELECTOR)) {
    const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (name) element.title = name;
  }
}

export function watchTooltips(root = document.documentElement) {
  let pending = false;
  const run = () => { pending = false; addMissingTooltips(document); };
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(run);
  }).observe(root, { childList: true, subtree: true });
  addMissingTooltips(document);
}
