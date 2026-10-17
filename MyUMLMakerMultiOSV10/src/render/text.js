// Text for the SVG renderer: escaping, width estimates (Node has no canvas),
// wrapping and lines of text placed in a box. Pure.

export const DEFAULT_FONT = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", Arial, sans-serif';

const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const esc = (value) => String(value ?? '').replace(XML_INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const n = (value) => Number(Number(value).toFixed(2));

const isWide = (code) => code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60));
/** Text width estimate (no DOM): CJK about one em, Latin about 0.56 em, bold a little wider. */
export function estimateWidth(textValue, size, bold = false) {
  let width = 0;
  for (const ch of String(textValue)) {
    const code = ch.codePointAt(0);
    width += isWide(code) ? size : ' .,:;il|!\'"`'.includes(ch) ? size * 0.3 : /[A-Z]/.test(ch) ? size * 0.66 : size * 0.55;
  }
  return width * (bold ? 1.06 : 1);
}
export const estimateMeasure = (textValue, style) => estimateWidth(textValue, style.fontSize ?? 13, style.bold);

/** Wraps text into lines no wider than `width` (words; CJK may break anywhere). */
export function wrapText(textValue, width, style, measure = estimateMeasure) {
  const out = [];
  for (const paragraph of String(textValue ?? '').split(/\r?\n/)) {
    if (!paragraph) { out.push(''); continue; }
    if (width <= 0 || measure(paragraph, style) <= width) { out.push(paragraph); continue; }
    const tokens = paragraph.match(/[ᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-｠]|[^\sᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-｠]+\s*|\s+/g) ?? [paragraph];
    let current = '';
    for (const token of tokens) {
      const next = current + token;
      if (current && measure(next.trimEnd(), style) > width) {
        out.push(current.trimEnd());
        current = token.trimStart();
        while (current && measure(current, style) > width && current.length > 1) {
          let cut = current.length - 1;
          while (cut > 1 && measure(current.slice(0, cut), style) > width) cut -= 1;
          out.push(current.slice(0, cut));
          current = current.slice(cut);
        }
      } else current = next;
    }
    out.push(current.trimEnd());
  }
  return out;
}

export const fontFamily = (face) => (face ? `"${String(face).replace(/"/g, '')}", ${DEFAULT_FONT}` : DEFAULT_FONT);

/**
 * One line of SVG text. opts: { anchor: start|middle|end, bold, italic,
 * underline, size, color, face, cls }. (x, y) is the baseline start/middle/end.
 */
export function textLine(value, x, y, opts = {}) {
  if (value === '' || value === null || value === undefined) return '';
  const deco = [opts.underline ? 'underline' : '', opts.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  return `<text x="${n(x)}" y="${n(y)}" font-family="${esc(fontFamily(opts.face))}" font-size="${n(opts.size ?? 13)}" fill="${esc(opts.color ?? '#000')}" text-anchor="${opts.anchor ?? 'start'}"${opts.bold ? ' font-weight="700"' : ''}${opts.italic ? ' font-style="italic"' : ''}${deco ? ` text-decoration="${deco}"` : ''}${opts.cls ? ` class="${opts.cls}"` : ''} xml:space="preserve">${esc(value)}</text>`;
}

/**
 * Lines stacked from `top` in a box of width w at x: each line { text, bold,
 * italic, underline, align, size, color }. Returns { svg, height }.
 */
export function textStack(lines, x, top, w, base, measure = estimateMeasure, { padX = 6, gap = 2 } = {}) {
  let y = top;
  let svg = '';
  for (const line of lines) {
    const size = line.size ?? base.size ?? 13;
    const lineH = size * 1.25;
    const align = line.align ?? 'center';
    const tx = align === 'left' ? x + padX : align === 'right' ? x + w - padX : x + w / 2;
    const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
    const style = { fontSize: size, bold: line.bold, italic: line.italic, font: base.face };
    const wrapped = line.wrap ? wrapText(line.text, w - padX * 2, style, measure) : [line.text];
    for (const part of wrapped) {
      svg += textLine(part, tx, y + size * 0.95, { ...base, ...line, size, anchor, color: line.color ?? base.color });
      y += lineH;
    }
    y += gap;
  }
  return { svg, height: y - top };
}

/** Height of stacked lines (the same arithmetic as textStack). */
export function stackHeight(lines, w, base, measure = estimateMeasure, { padX = 6, gap = 2 } = {}) {
  let h = 0;
  for (const line of lines) {
    const size = line.size ?? base.size ?? 13;
    const count = line.wrap ? wrapText(line.text, w - padX * 2, { fontSize: size, bold: line.bold, italic: line.italic, font: base.face }, measure).length : 1;
    h += count * size * 1.25 + gap;
  }
  return h;
}

/** Width of the widest line (for auto sizing). */
export function stackWidth(lines, base, measure = estimateMeasure) {
  let w = 0;
  for (const line of lines) {
    const size = line.size ?? base.size ?? 13;
    for (const part of String(line.text ?? '').split('\n')) w = Math.max(w, measure(part, { fontSize: size, bold: line.bold, italic: line.italic, font: base.face }));
  }
  return w;
}
