const cache = new Map();

export function measureCell(fontFamily, sample) {
  const key = `${fontFamily}\n${sample}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const fontSize = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px ${fontFamily}`;
  const count = 24;
  const charWidth = ctx.measureText(sample.repeat(count)).width / count;
  const metrics = ctx.measureText(sample);
  const ink =
    (metrics.actualBoundingBoxAscent || 0) + Math.max(0, metrics.actualBoundingBoxDescent || 0);
  const fontBox =
    (metrics.fontBoundingBoxAscent || 0) + (metrics.fontBoundingBoxDescent || 0) || fontSize;
  const lineHeight = ink > fontSize * 0.2 ? ink : fontBox;

  if (!(charWidth > 0) || !(lineHeight > 0)) {
    throw new Error('글자 크기를 측정하지 못했습니다.');
  }

  const measured = { charWidth, lineHeight, ratio: charWidth / lineHeight };
  cache.set(key, measured);
  return measured;
}

export function sampleGlyph(chars, fallback = 'M') {
  const glyph = Array.from(chars).find((char) => char !== ' ');
  return glyph || fallback;
}
