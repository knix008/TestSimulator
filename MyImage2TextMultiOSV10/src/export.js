export function toHtml(result) {
  const lines = result.text.split('\n');
  const useColor = Boolean(result.colors) && !result.edited && lines.length === result.rows;
  const body = lines
    .map((line, row) => {
      const glyphs = Array.from(line);
      return glyphs
        .map((glyph, col) => {
          const encoded = escapeHtml(glyph);
          if (!useColor || col >= result.cols) return encoded;
          const colorIndex = (row * result.cols + col) * 3;
          const hex = rgbHex(
            result.colors[colorIndex],
            result.colors[colorIndex + 1],
            result.colors[colorIndex + 2],
          );
          return `<span style="color:${hex}">${encoded}</span>`;
        })
        .join('');
    })
    .join('\n');

  const ratio = (result.imageWidth / result.imageHeight).toFixed(4);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(result.sourceName)} — ${escapeHtml(result.styleLabel)}</title>
  <style>
    body { margin: 0; background: #121418; }
    pre {
      margin: 0;
      padding: 12px;
      font-family: ${result.fontFamily};
      font-size: 16px;
      line-height: calc(1ch / ${Number(result.cellRatio || 0.5).toFixed(6)});
      letter-spacing: 0;
      font-kerning: none;
      font-variant-ligatures: none;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
      color: #f3f1ea;
      white-space: pre;
    }
  </style>
</head>
<body>
<!-- source ${result.imageWidth}x${result.imageHeight} ratio ${ratio} text ${result.cols}x${result.rows} -->
<pre>${body}</pre>
</body>
</html>
`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function rgbHex(red, green, blue) {
  return `#${byte(red)}${byte(green)}${byte(blue)}`;
}

function byte(value) {
  return value.toString(16).padStart(2, '0');
}
