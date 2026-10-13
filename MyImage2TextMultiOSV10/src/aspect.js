// The text block's on-screen ratio is (cols * charWidth) / (rows * lineHeight).
// Rows are chosen so that ratio matches imageWidth / imageHeight.

export function computeRows(cols, imageWidth, imageHeight, charWidth, lineHeight) {
  const exact = cols * (imageHeight / imageWidth) * (charWidth / lineHeight);
  const rounded = Math.round(exact);
  const want = imageWidth / imageHeight;
  let best = Math.max(1, rounded);
  let bestError = Infinity;

  for (const rows of [rounded - 1, rounded, rounded + 1]) {
    if (rows < 1) continue;
    const got = (cols * charWidth) / (rows * lineHeight);
    const error = Math.abs(got - want) / want;
    if (error < bestError) {
      bestError = error;
      best = rows;
    }
  }

  return best;
}

export function aspectError(cols, rows, imageWidth, imageHeight, charWidth, lineHeight) {
  const got = (cols * charWidth) / (rows * lineHeight);
  const want = imageWidth / imageHeight;
  return Math.abs(got - want) / want;
}

export function planGrid(
  requestedCols,
  imageWidth,
  imageHeight,
  charWidth,
  lineHeight,
  maxCells = 180000,
) {
  if (
    !(imageWidth > 0) ||
    !(imageHeight > 0) ||
    !(charWidth > 0) ||
    !(lineHeight > 0)
  ) {
    throw new Error('이미지 또는 글자 크기가 올바르지 않습니다.');
  }

  const requested = Math.max(8, Math.round(requestedCols));
  let minCols = requested;
  let probeRows = computeRows(minCols, imageWidth, imageHeight, charWidth, lineHeight);
  while (minCols > 8 && minCols * probeRows > maxCells) {
    minCols -= 1;
    probeRows = computeRows(minCols, imageWidth, imageHeight, charWidth, lineHeight);
  }

  const upper = Math.min(4000, Math.max(minCols, requested * 2));
  let best = null;

  for (let cols = minCols; cols <= upper; cols++) {
    const rows = computeRows(cols, imageWidth, imageHeight, charWidth, lineHeight);
    if (cols * rows > maxCells) break;
    const error = aspectError(cols, rows, imageWidth, imageHeight, charWidth, lineHeight);
    if (!best || error < best.error) {
      best = { cols, rows, error, requested };
    }
    if (error <= 0.005) break;
  }

  if (!best) {
    throw new Error('이 이미지는 글자 수를 맞춰도 원본 비율에 가깝게 만들 수 없습니다.');
  }

  return best;
}
