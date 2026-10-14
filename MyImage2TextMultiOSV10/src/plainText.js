export const FILE_EOL = '\r\n';
const UTF8_BOM = '\uFEFF';
export const BRAILLE_BLANK = '\u2800';

export function isBlankGlyph(glyph) {
  return glyph === ' ' || glyph === BRAILLE_BLANK;
}

// ASCII만 쓰거나 점자만 쓰면 한 글꼴 안에서 모든 칸의 폭이 같다.
export function alignsInEveryEditor(text) {
  let ascii = true;
  let braille = true;
  for (const glyph of text) {
    if (glyph === '\n' || glyph === '\r') continue;
    const point = glyph.codePointAt(0);
    if (point < 0x20 || point > 0x7e) ascii = false;
    if (point < 0x2800 || point > 0x28ff) braille = false;
    if (!ascii && !braille) return false;
  }
  return true;
}

export function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

export function toTextFile(text) {
  const lines = normalizeNewlines(text).replace(/\n+$/, '').split('\n');
  return `${UTF8_BOM}${lines.join(FILE_EOL)}${FILE_EOL}`;
}

export function toClipboardText(text) {
  return normalizeNewlines(text).replace(/\n+$/, '');
}
