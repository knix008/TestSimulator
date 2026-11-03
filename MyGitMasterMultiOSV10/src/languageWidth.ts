import { retranslate, type Lang } from "./i18n";

const LANGS: Lang[] = ["ko", "en"];
let context: CanvasRenderingContext2D | null = null;

/**
 * How much wider a row's labels would be in the widest other language (0 when none is
 * wider). Each visible label that is a whole entry of the string table is measured again,
 * in its own font, as the other language spells it; the differences add up because the
 * labels sit side by side. Added to the row's measured width, it keeps the window's
 * minimum the same whichever language is showing.
 */
export function otherLanguageExtra(row: Element, lang: Lang): number {
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) return 0;
  const labels = (Array.from(row.querySelectorAll("span, strong, button")) as HTMLElement[]).filter((element) =>
    element.childNodes.length === 1
    && element.firstChild?.nodeType === Node.TEXT_NODE
    && element.getClientRects().length > 0);

  let widest = 0;
  for (const other of LANGS) {
    if (other === lang) continue;
    let extra = 0;
    for (const label of labels) {
      const text = label.textContent?.trim() ?? "";
      const translated = text ? retranslate(text, lang, other) : undefined;
      if (translated === undefined || translated === text) continue;
      const style = getComputedStyle(label);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      extra += context.measureText(translated).width - context.measureText(text).width;
    }
    widest = Math.max(widest, extra);
  }
  return Math.ceil(widest);
}
