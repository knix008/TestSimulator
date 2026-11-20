// Fast tooltips for every window. The browser's own title tooltip waits about a second and
// cannot be told otherwise, so while the pointer is over an element its title moves to
// data-tip (the browser then shows nothing) and this box appears after a tenth of a second.
export const TOOLTIP_DELAY = 100;
const GAP = 6;
const MARGIN = 4;

/** Where the box goes: centred below the element, above it if there is no room, always inside the window. */
export function tooltipPlace(target, size, viewport) {
  const below = target.bottom + GAP;
  const above = target.top - GAP - size.height;
  const top = below + size.height <= viewport.height - MARGIN || above < MARGIN ? below : above;
  const left = target.left + target.width / 2 - size.width / 2;
  return {
    left: Math.max(MARGIN, Math.min(viewport.width - MARGIN - size.width, left)),
    top: Math.max(MARGIN, Math.min(viewport.height - MARGIN - size.height, top)),
  };
}

/** Starts the tooltips of this document. Returns a function that stops them. */
export function installTooltips(doc = document) {
  let current = null; // the element under the pointer that has a tooltip
  let box = null;
  let timer = 0;
  let pressed = false; // no tooltip again until the pointer has left the element it pressed

  const hide = () => {
    clearTimeout(timer);
    box?.remove();
    box = null;
  };
  /** The element gets its title back. */
  const release = () => {
    hide();
    if (current && current.dataset.tip !== undefined) {
      if (!current.hasAttribute('title')) current.setAttribute('title', current.dataset.tip);
      delete current.dataset.tip;
    }
    current = null;
    pressed = false;
  };
  const show = () => {
    if (!current?.isConnected || pressed) return;
    const text = current.dataset.tip;
    if (!text) return;
    box = doc.createElement('div');
    box.className = 'app-tooltip';
    box.setAttribute('role', 'tooltip');
    box.textContent = text;
    doc.body.appendChild(box);
    const view = doc.defaultView;
    const place = tooltipPlace(current.getBoundingClientRect(), box.getBoundingClientRect(), { width: view.innerWidth, height: view.innerHeight });
    box.style.left = `${Math.round(place.left)}px`;
    box.style.top = `${Math.round(place.top)}px`;
  };
  const onOver = (event) => {
    if (event.pointerType === 'touch') return;
    const element = event.target?.closest?.('[title], [data-tip]') ?? null;
    if (element === current) return;
    release();
    if (!element || event.buttons) return;
    const text = element.getAttribute('title');
    if (text === null && element.dataset.tip === undefined) return;
    if (text !== null) { element.dataset.tip = text; element.removeAttribute('title'); }
    current = element;
    timer = setTimeout(show, TOOLTIP_DELAY);
  };
  const onPress = () => { pressed = true; hide(); };
  const onLeaveWindow = (event) => { if (!event.relatedTarget) release(); };

  doc.addEventListener('pointerover', onOver, true);
  doc.addEventListener('pointerout', onLeaveWindow, true);
  for (const type of ['pointerdown', 'keydown', 'wheel']) doc.addEventListener(type, onPress, true);
  doc.addEventListener('scroll', hide, true);
  doc.defaultView?.addEventListener('blur', release);
  return () => {
    release();
    doc.removeEventListener('pointerover', onOver, true);
    doc.removeEventListener('pointerout', onLeaveWindow, true);
    for (const type of ['pointerdown', 'keydown', 'wheel']) doc.removeEventListener(type, onPress, true);
    doc.removeEventListener('scroll', hide, true);
    doc.defaultView?.removeEventListener('blur', release);
  };
}
