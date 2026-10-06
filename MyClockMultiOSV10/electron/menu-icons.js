'use strict';

/**
 * 트레이 메뉴 아이콘.
 * 글자 앞에 기호를 붙이는 대신, 항목 왼쪽 칸에 들어가는 그림으로 만든다.
 */

const zlib = require('zlib');

const SIZE = 16;
const INK = [91, 140, 250, 255];

const cache = new Map();

function plot(px, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = color[0];
  px[i + 1] = color[1];
  px[i + 2] = color[2];
  px[i + 3] = color[3];
}

function line(px, x0, y0, x1, y1, color) {
  let ix = Math.round(x0);
  let iy = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - ix);
  const dy = Math.abs(ty - iy);
  const sx = ix < tx ? 1 : -1;
  const sy = iy < ty ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    plot(px, ix, iy, color);
    if (ix === tx && iy === ty) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      ix += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy += sy;
    }
  }
}

function circle(px, cx, cy, r, color) {
  let x = Math.round(r);
  let y = 0;
  let err = 1 - x;
  while (x >= y) {
    plot(px, cx + x, cy + y, color);
    plot(px, cx + y, cy + x, color);
    plot(px, cx - y, cy + x, color);
    plot(px, cx - x, cy + y, color);
    plot(px, cx - x, cy - y, color);
    plot(px, cx - y, cy - x, color);
    plot(px, cx + y, cy - x, color);
    plot(px, cx + x, cy - y, color);
    y += 1;
    if (err < 0) err += 2 * y + 1;
    else {
      x -= 1;
      err += 2 * (y - x) + 1;
    }
  }
}

function fillCircle(px, cx, cy, r, color) {
  const rad = Math.round(r);
  for (let y = -rad; y <= rad; y += 1) {
    const span = Math.round(Math.sqrt(rad * rad - y * y));
    for (let x = -span; x <= span; x += 1) plot(px, cx + x, cy + y, color);
  }
}

function fillRect(px, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) plot(px, xx, yy, color);
  }
}

function strokeRect(px, x, y, w, h, color) {
  line(px, x, y, x + w - 1, y, color);
  line(px, x, y + h - 1, x + w - 1, y + h - 1, color);
  line(px, x, y, x, y + h - 1, color);
  line(px, x + w - 1, y, x + w - 1, y + h - 1, color);
}

function blank() {
  return Buffer.alloc(SIZE * SIZE * 4, 0);
}

/** 아이콘 이름 → 16×16 그림. */
const painters = {
  open(px) {
    strokeRect(px, 2, 3, 12, 10, INK);
    line(px, 2, 6, 13, 6, INK);
    line(px, 8, 8, 8, 11, INK);
    line(px, 6, 9, 8, 11, INK);
    line(px, 10, 9, 8, 11, INK);
  },
  settings(px) {
    circle(px, 8, 8, 2, INK);
    circle(px, 8, 8, 4, INK);
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * i) / 4;
      line(px, 8 + Math.cos(a) * 4, 8 + Math.sin(a) * 4, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, INK);
    }
  },
  add(px) {
    line(px, 8, 3, 8, 13, INK);
    line(px, 3, 8, 13, 8, INK);
    line(px, 7, 3, 7, 13, INK);
    line(px, 3, 7, 13, 7, INK);
  },
  clock(px) {
    circle(px, 8, 8, 6, INK);
    line(px, 8, 8, 8, 4, INK);
    line(px, 8, 8, 11, 10, INK);
    plot(px, 8, 8, INK);
  },
  world(px) {
    circle(px, 8, 8, 6, INK);
    line(px, 2, 8, 14, 8, INK);
    ellipse(px, 8, 8, 3, 6);
  },
  close(px) {
    line(px, 4, 4, 12, 12, INK);
    line(px, 12, 4, 4, 12, INK);
    line(px, 4, 5, 11, 12, INK);
    line(px, 5, 4, 12, 11, INK);
  },
  system(px) {
    line(px, 3, 4, 13, 4, INK);
    line(px, 3, 8, 13, 8, INK);
    line(px, 3, 12, 13, 12, INK);
    fillRect(px, 5, 3, 3, 3, INK);
    fillRect(px, 9, 7, 3, 3, INK);
    fillRect(px, 6, 11, 3, 3, INK);
  },
  pin(px) {
    line(px, 8, 7, 8, 14, INK);
    fillCircle(px, 8, 5, 3, INK);
  },
  startup(px) {
    for (let a = 0.9; a < Math.PI * 2 - 0.2; a += 0.22) {
      const t = a - Math.PI / 2;
      plot(px, 8 + Math.cos(t) * 5, 8 + Math.sin(t) * 5, INK);
      plot(px, 8 + Math.cos(t) * 6, 8 + Math.sin(t) * 6, INK);
    }
    line(px, 8, 2, 8, 8, INK);
    line(px, 7, 2, 7, 8, INK);
  },
  reset(px) {
    // 되돌리는 화살표
    for (let a = 0.4; a < Math.PI * 1.7; a += 0.15) {
      plot(px, 8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, INK);
    }
    line(px, 3, 6, 3, 10, INK);
    line(px, 3, 10, 6, 10, INK);
  },
  alarm(px) {
    circle(px, 8, 9, 4, INK);
    line(px, 4, 13, 12, 13, INK);
    line(px, 8, 3, 8, 5, INK);
    line(px, 5, 4, 3, 2, INK);
    line(px, 11, 4, 13, 2, INK);
  },
  timer(px) {
    circle(px, 8, 9, 5, INK);
    line(px, 8, 9, 8, 6, INK);
    line(px, 8, 9, 11, 9, INK);
    line(px, 6, 2, 10, 2, INK);
  },
  stopwatch(px) {
    fillRect(px, 7, 1, 2, 2, INK);
    circle(px, 8, 9, 5, INK);
    line(px, 8, 9, 8, 6, INK);
    line(px, 5, 1, 4, 3, INK);
    line(px, 11, 1, 12, 3, INK);
  },
  calendar(px) {
    strokeRect(px, 2, 3, 12, 11, INK);
    line(px, 2, 6, 13, 6, INK);
    line(px, 5, 2, 5, 4, INK);
    line(px, 10, 2, 10, 4, INK);
    plot(px, 5, 9, INK);
    plot(px, 8, 9, INK);
    plot(px, 11, 9, INK);
    plot(px, 5, 11, INK);
    plot(px, 8, 11, INK);
  },
  info(px) {
    circle(px, 8, 8, 6, INK);
    fillRect(px, 7, 4, 2, 2, INK);
    fillRect(px, 7, 7, 2, 5, INK);
  },
  quit(px) {
    circle(px, 8, 8, 6, INK);
    line(px, 8, 3, 8, 8, INK);
    line(px, 7, 3, 7, 8, INK);
  },
  restore(px) {
    strokeRect(px, 5, 5, 8, 8, INK);
    line(px, 3, 3, 10, 3, INK);
    line(px, 3, 3, 3, 10, INK);
    line(px, 3, 10, 5, 10, INK);
    line(px, 10, 3, 10, 5, INK);
  }
};

function ellipse(px, cx, cy, rx, ry) {
  for (let a = 0; a < Math.PI * 2; a += 0.18) {
    plot(px, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, INK);
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function scale(rgba, size, factor) {
  const next = size * factor;
  const out = Buffer.alloc(next * next * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          const dst = ((y * factor + dy) * next + (x * factor + dx)) * 4;
          rgba.copy(out, dst, src, src + 4);
        }
      }
    }
  }
  return out;
}

const ICON_NAMES = Object.keys(painters);

function renderIconRgba(name) {
  const paint = painters[name];
  if (!paint) throw new Error(`없는 메뉴 아이콘: ${name}`);
  const px = blank();
  paint(px);
  return px;
}

function renderIconPng(name) {
  return encodePng(renderIconRgba(name), SIZE);
}

function menuIcon(name) {
  if (!cache.has(name)) {
    const { nativeImage } = require('electron');
    const image = nativeImage.createEmpty();
    image.addRepresentation({ scaleFactor: 1, width: SIZE, height: SIZE, buffer: renderIconPng(name) });
    image.addRepresentation({
      scaleFactor: 2,
      width: SIZE * 2,
      height: SIZE * 2,
      buffer: encodePng(scale(renderIconRgba(name), SIZE, 2), SIZE * 2)
    });
    cache.set(name, image);
  }
  return cache.get(name);
}

module.exports = { menuIcon, renderIconPng, renderIconRgba, ICON_NAMES, SIZE };
