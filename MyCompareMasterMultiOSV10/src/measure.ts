import { MIN_WORKSPACE } from "../core/settings.js";
import { LANGUAGES, retranslate, type Language } from "../core/i18n.js";

/**
 * The toolbar's natural width — the width below which one of its buttons would be
 * clipped.
 *
 * It is computed by adding up the groups rather than read from `scrollWidth`, because
 * the toolbar contains a flexible spacer: its scroll width is simply however wide the
 * window happens to be, and feeding that back in as a minimum width makes the window
 * grow a little every time it is measured.
 *
 * Shared with the GUI test, which asserts that the minimum the main process applied
 * really does cover this.
 */
export function toolbarMinimumWidth(toolbar: Element): number {
  return rowMinimumWidth(toolbar, ["toolbar-spacer"]);
}

/**
 * The natural width of a one-line row of groups (the toolbar, the menu bar): the sum
 * of what each child needs, plus gaps and padding. A child is measured by its content
 * (`scrollWidth`) as well as its box, because a group that is already squeezed
 * reports the squeezed width — which is exactly the case being prevented.
 */
export function rowMinimumWidth(row: Element, stretchy: string[], language?: Language): number {
  const style = getComputedStyle(row);
  const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
  const children = ([...row.children] as HTMLElement[]).filter((child) => getComputedStyle(child).display !== "none");

  let width = (Number.parseFloat(style.paddingLeft) || 0)
    + (Number.parseFloat(style.paddingRight) || 0)
    + gap * Math.max(0, children.length - 1);

  for (const child of children) {
    // A spacer is the one element that stretches; it only needs breathing room.
    if (stretchy.some((name) => child.classList.contains(name))) {
      width += 8;
      continue;
    }
    const childStyle = getComputedStyle(child);
    const margins = (Number.parseFloat(childStyle.marginLeft) || 0) + (Number.parseFloat(childStyle.marginRight) || 0);
    width += Math.max(child.getBoundingClientRect().width, child.scrollWidth) + margins;
  }

  // With `language`, the row is also sized as it would read in every other language
  // and the widest wins, so switching the language never moves the minimum.
  return Math.ceil(width + (language ? otherLanguageExtra(row, language) : 0)) + 8;
}

let measuringContext: CanvasRenderingContext2D | null = null;

/**
 * How much wider the row's labels would be in the widest other language (0 when none
 * is wider). Each label that is a whole entry of the string table is measured again,
 * in its own font, as the other language spells it; the differences add up because
 * the labels sit side by side.
 */
function otherLanguageExtra(row: Element, language: Language): number {
  measuringContext ??= document.createElement("canvas").getContext("2d");
  const context = measuringContext;
  if (!context) return 0;

  const labels = ([...row.querySelectorAll("span, button")] as HTMLElement[]).filter((element) =>
    element.childNodes.length === 1
    && element.firstChild?.nodeType === Node.TEXT_NODE
    && element.getClientRects().length > 0);

  let widest = 0;
  for (const { id: other } of LANGUAGES) {
    if (other === language) continue;
    let extra = 0;
    for (const label of labels) {
      const text = label.textContent?.trim() ?? "";
      const translated = text ? retranslate(text, language, other) : undefined;
      if (translated === undefined || translated === text) continue;
      const style = getComputedStyle(label);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      extra += context.measureText(translated).width - context.measureText(text).width;
    }
    widest = Math.max(widest, extra);
  }
  return widest;
}

/**
 * The window's minimum width: wide enough for the whole toolbar, and wide enough for
 * the side panels plus a usable comparison between them.
 *
 * The panels only appear on a merge tab, but the floor is computed as though they
 * were always there. Otherwise opening a merge would widen the window under the
 * user's hands, and closing it would strand them at a width they never chose.
 */
export function windowMinimumWidth(
  toolbar: Element | null,
  panels: { left: number; right: number },
  menubar: Element | null = null,
  language?: Language,
): number {
  const forToolbar = toolbar ? rowMinimumWidth(toolbar, ["toolbar-spacer"], language) : 0;
  const forMenubar = menubar ? rowMinimumWidth(menubar, ["menubar-drag"], language) : 0;
  const forPanels = panels.left + panels.right + MIN_WORKSPACE;
  return Math.max(forToolbar, forMenubar, forPanels);
}
