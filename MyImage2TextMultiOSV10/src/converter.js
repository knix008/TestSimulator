import { BRAILLE_BLANK } from './plainText.js';

// 각 문자열은 왼쪽이 가장 어두운 칸, 맨 끝 공백이 가장 밝은 칸이다.
// 점자는 텍스트 편집기에서 다른 점자와 같은 폭이 되도록 빈 점자(U+2800)를 공백으로 쓴다.
export const STYLE_PRESETS = [
  {
    id: 'Detailed',
    label: '상세',
    labelEn: 'Detailed',
    chars: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
    sample: 'M',
  },
  {
    id: 'Letters',
    label: '문자',
    labelEn: 'Letters',
    chars: 'WMB@#%8&$0OHQDKNURXAGP65Z2S49C3EYVTF7JLmwnqpbdkhaoenzuvxrctjf1Iil!|;:,. ',
    sample: 'M',
  },
  {
    id: 'Fine',
    label: '세밀',
    labelEn: 'Fine',
    chars: 'WM#8Q0H&%@$BNqKA6X4G2S5E3P9ZC7UYVTFJLODmwpbdkhaoenzuvxrctjf1Iil!|;:,. ',
    sample: 'W',
  },
  {
    id: 'Digits',
    label: '숫자',
    labelEn: 'Digits',
    chars: '8%@&#$690OQDBGSZ543271?+;:,. ',
    sample: '8',
  },
  {
    id: 'Symbols',
    label: '기호',
    labelEn: 'Symbols',
    chars: '●◉◎○◆◇■□▲△▼▽★☆♦♣♠♥✱❖✦✧#%@&*+=~:;,. ',
    sample: '●',
  },
  {
    id: 'Shapes',
    label: '도형',
    labelEn: 'Shapes',
    chars: '◼▪●◆▲■□▢▣▤▥▦▧▨▩◦○◌◇△▽☆·. ',
    sample: '■',
  },
  {
    id: 'Blocks',
    label: '블록',
    labelEn: 'Blocks',
    chars: '█▉▊▋▓▒░▌▍▎▏▀▄▐▃▂▁ ',
    sample: '█',
  },
  {
    id: 'Shade',
    label: '음영',
    labelEn: 'Shade',
    chars: '█▉▊▋▓▒░@%#*+=~-:;. ',
    sample: '▓',
  },
  {
    id: 'Braille',
    label: '점자',
    labelEn: 'Braille',
    chars: brailleRamp(),
    sample: '⣿',
  },
  {
    id: 'Marks',
    label: '문장',
    labelEn: 'Marks',
    chars: '#%&@$*+=~^:;!?/\\|()[]{}<>_-.,\'"` ',
    sample: '#',
  },
];

function brailleRamp() {
  const ranked = [];
  for (let bits = 1; bits < 256; bits += 1) {
    let dots = 0;
    for (let value = bits; value; value &= value - 1) dots += 1;
    ranked.push({ bits, dots });
  }
  ranked.sort((a, b) => b.dots - a.dots || a.bits - b.bits);
  const count = 32;
  const step = Math.max(1, Math.floor(ranked.length / count));
  let ramp = '';
  for (let index = 0; index < ranked.length && Array.from(ramp).length < count; index += step) {
    ramp += String.fromCodePoint(0x2800 + ranked[index].bits);
  }
  return `${ramp}${BRAILLE_BLANK}`;
}

export function convertToText(bitmap, options) {
  const palette = Array.from(options.chars);
  if (palette.length === 0) {
    throw new Error('문자 집합이 비어 있습니다.');
  }

  const { cols, rows } = options;
  const source = readSourcePixels(bitmap);
  const sampled = sampleCells(source.data, source.width, source.height, cols, rows);
  const tone = toneAdjust(options.contrast, options.brightness);
  const count = cols * rows;
  const gray = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * 3;
    sampled[offset] = clampByte(tone.scale * sampled[offset] + tone.brightness);
    sampled[offset + 1] = clampByte(tone.scale * sampled[offset + 1] + tone.brightness);
    sampled[offset + 2] = clampByte(tone.scale * sampled[offset + 2] + tone.brightness);
    gray[i] = 0.2126 * sampled[offset] + 0.7152 * sampled[offset + 1] + 0.0722 * sampled[offset + 2];
  }

  const colors = options.color ? new Uint8ClampedArray(count * 3) : null;
  const lines = new Array(rows);
  const last = palette.length - 1;

  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const index = y * cols + x;
      let tone = gray[index];
      if (options.edge) {
        tone = edgeTone(gray, cols, rows, x, y, tone);
      }
      let normalized = tone / 255;
      if (options.invert) normalized = 1 - normalized;
      let glyphIndex = last === 0 ? 0 : Math.round(normalized * last);
      if (glyphIndex < 0) glyphIndex = 0;
      else if (glyphIndex > last) glyphIndex = last;
      line += palette[glyphIndex];
      if (colors) {
        const colorIndex = index * 3;
        colors[colorIndex] = sampled[colorIndex];
        colors[colorIndex + 1] = sampled[colorIndex + 1];
        colors[colorIndex + 2] = sampled[colorIndex + 2];
      }
    }
    lines[y] = line;
  }

  return { text: lines.join('\n'), colors };
}

const MAX_SAMPLE_EDGE = 4096;

function readSourcePixels(bitmap) {
  let width = bitmap.width;
  let height = bitmap.height;
  const longSide = Math.max(width, height);
  if (longSide > MAX_SAMPLE_EDGE) {
    const scale = MAX_SAMPLE_EDGE / longSide;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (width === bitmap.width && height === bitmap.height) {
    ctx.drawImage(bitmap, 0, 0);
  } else {
    drawDownscaled(ctx, bitmap, width, height);
  }
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

function drawDownscaled(ctx, source, targetW, targetH) {
  let current = source;
  let width = source.width;
  let height = source.height;
  while (width > targetW * 2 || height > targetH * 2) {
    width = Math.max(targetW, Math.round(width / 2));
    height = Math.max(targetH, Math.round(height / 2));
    const step = document.createElement('canvas');
    step.width = width;
    step.height = height;
    const stepCtx = step.getContext('2d');
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(current, 0, 0, width, height);
    current = step;
  }
  ctx.drawImage(current, 0, 0, targetW, targetH);
}

// Each cell is the area-weighted average of the source pixels it covers.
export function sampleCells(data, srcW, srcH, cols, rows) {
  const rgb = new Float64Array(cols * rows * 3);
  for (let y = 0; y < rows; y++) {
    const top = (y * srcH) / rows;
    const bottom = ((y + 1) * srcH) / rows;
    const yStart = Math.floor(top);
    const yEnd = Math.min(srcH, Math.ceil(bottom));
    for (let x = 0; x < cols; x++) {
      const left = (x * srcW) / cols;
      const right = ((x + 1) * srcW) / cols;
      const xStart = Math.floor(left);
      const xEnd = Math.min(srcW, Math.ceil(right));
      let red = 0;
      let green = 0;
      let blue = 0;
      let weight = 0;
      for (let py = yStart; py < yEnd; py++) {
        const yWeight = Math.min(py + 1, bottom) - Math.max(py, top);
        if (yWeight <= 0) continue;
        for (let px = xStart; px < xEnd; px++) {
          const xWeight = Math.min(px + 1, right) - Math.max(px, left);
          if (xWeight <= 0) continue;
          const coverage = xWeight * yWeight;
          const offset = (py * srcW + px) * 4;
          red += data[offset] * coverage;
          green += data[offset + 1] * coverage;
          blue += data[offset + 2] * coverage;
          weight += coverage;
        }
      }
      const slot = (y * cols + x) * 3;
      if (weight > 0) {
        rgb[slot] = red / weight;
        rgb[slot + 1] = green / weight;
        rgb[slot + 2] = blue / weight;
      }
    }
  }
  return rgb;
}

function toneAdjust(contrastSlider, brightnessSlider) {
  const contrast = (contrastSlider - 50) * 2;
  const brightness = (brightnessSlider - 50) * 2;
  return { scale: 1 + contrast / 100, brightness };
}

function edgeTone(gray, cols, rows, x, y, center) {
  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = Math.min(cols - 1, Math.max(0, x + dx));
      const ny = Math.min(rows - 1, Math.max(0, y + dy));
      sum += gray[ny * cols + nx];
      count += 1;
    }
  }
  return Math.min(255, Math.max(0, center + Math.abs(center - sum / count) * 3));
}

function clampByte(value) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}
