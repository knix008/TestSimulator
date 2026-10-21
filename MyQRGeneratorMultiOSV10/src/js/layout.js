// Card arrangement: three columns of cards (groups) that the user can rearrange by dragging a
// card's heading. The arrangement is a list of card ids per column.

export const CARD_IDS = ["card-content", "card-logo", "card-design", "card-encoding", "card-export", "card-preview"];

/** Default: the groups on the left, the QR code on the right. */
export const DEFAULT_LAYOUT = [
  ["card-content", "card-logo", "card-design"],
  ["card-encoding", "card-export"],
  ["card-preview"],
];

/** A saved arrangement if it is three columns holding every card exactly once; else the default. */
export function normalizeLayout(saved) {
  if (!Array.isArray(saved) || saved.length !== 3 || !saved.every(Array.isArray)) return structuredClone(DEFAULT_LAYOUT);
  const seen = saved.flat();
  const valid = seen.length === CARD_IDS.length && CARD_IDS.every((id) => seen.includes(id));
  return valid ? saved.map((column) => [...column]) : structuredClone(DEFAULT_LAYOUT);
}

export function columns() {
  return [...document.querySelectorAll(".layout > .column")];
}

/** Puts the cards into their columns in order. */
export function applyLayout(layout) {
  const cols = columns();
  layout.forEach((ids, i) => {
    for (const id of ids) {
      const card = document.getElementById(id);
      if (card) cols[i].append(card);
    }
  });
}

export function readLayout() {
  return columns().map((col) => [...col.querySelectorAll(":scope > .card")].map((card) => card.id));
}

/**
 * Lets the user drag cards by their heading handle. While dragging, the card follows the
 * pointer and a dashed placeholder shows where it will land. `onChange(layout)` runs after a drop.
 */
export function enableCardDragging(onChange) {
  for (const handle of document.querySelectorAll(".card .drag-handle")) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const card = handle.closest(".card");
      const rect = card.getBoundingClientRect();
      const placeholder = Object.assign(document.createElement("div"), { className: "drop-placeholder" });
      placeholder.style.height = `${rect.height}px`;
      card.after(placeholder);
      card.classList.add("dragging");
      Object.assign(card.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
      const dx = event.clientX - rect.left;
      const dy = event.clientY - rect.top;
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events (tests) have no capturable pointer.
      }

      const move = (ev) => {
        card.style.left = `${ev.clientX - dx}px`;
        card.style.top = `${ev.clientY - dy}px`;
        const cols = columns();
        const col =
          cols.find((c) => {
            const r = c.getBoundingClientRect();
            return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
          }) ||
          cols.reduce((best, c) => {
            const r = c.getBoundingClientRect();
            const d = Math.abs(ev.clientX - (r.left + r.right) / 2) + Math.abs(ev.clientY - (r.top + r.bottom) / 2);
            return !best || d < best.d ? { c, d } : best;
          }, null).c;
        const siblings = [...col.querySelectorAll(":scope > .card:not(.dragging)")];
        const before = siblings.find((s) => {
          const r = s.getBoundingClientRect();
          return ev.clientY < r.top + r.height / 2;
        });
        if (before) col.insertBefore(placeholder, before);
        else col.append(placeholder);
        // Scroll the column when the pointer nears its top or bottom edge.
        const r = col.getBoundingClientRect();
        if (ev.clientY < r.top + 30) col.scrollTop -= 12;
        else if (ev.clientY > r.bottom - 30) col.scrollTop += 12;
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        card.classList.remove("dragging");
        card.style.left = card.style.top = card.style.width = "";
        placeholder.replaceWith(card);
        onChange(readLayout());
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }
}
