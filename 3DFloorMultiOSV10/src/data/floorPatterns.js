/**
 * Procedural floor pattern catalog (Canvas → Three.js textures).
 * Patterns are drawn in neutral tones; material.color tints them.
 */

/** @typedef {{ id: string, labelKey: string, tileMeters: number, solid?: boolean }} FloorPatternDef */

/** @type {FloorPatternDef[]} */
export const FLOOR_PATTERNS = [
  { id: 'wood', labelKey: 'floorPattern.wood', tileMeters: 0.6 },
  { id: 'herringbone', labelKey: 'floorPattern.herringbone', tileMeters: 0.75 },
  { id: 'tile', labelKey: 'floorPattern.tile', tileMeters: 0.45 },
  { id: 'checker', labelKey: 'floorPattern.checker', tileMeters: 0.5 },
  { id: 'concrete', labelKey: 'floorPattern.concrete', tileMeters: 1.2 },
  { id: 'carpet', labelKey: 'floorPattern.carpet', tileMeters: 0.9 },
  { id: 'solid', labelKey: 'floorPattern.solid', tileMeters: 1, solid: true },
];

export function getFloorPattern(id) {
  return FLOOR_PATTERNS.find((p) => p.id === id) || FLOOR_PATTERNS[0];
}

export function normalizeFloorPatternId(id) {
  return getFloorPattern(id).id;
}

/**
 * Draw a seamless pattern tile onto a canvas.
 * @param {string} id
 * @param {number} [size]
 * @returns {HTMLCanvasElement | null} null when solid (no map)
 */
export function createFloorPatternCanvas(id, size = 256) {
  const def = getFloorPattern(id);
  if (def.solid) return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  switch (def.id) {
    case 'herringbone':
      drawHerringbone(ctx, size);
      break;
    case 'tile':
      drawTile(ctx, size);
      break;
    case 'checker':
      drawChecker(ctx, size);
      break;
    case 'concrete':
      drawConcrete(ctx, size);
      break;
    case 'carpet':
      drawCarpet(ctx, size);
      break;
    case 'wood':
    default:
      drawWood(ctx, size);
      break;
  }
  return canvas;
}

function drawWood(ctx, size) {
  ctx.fillStyle = '#c4a574';
  ctx.fillRect(0, 0, size, size);
  const plankH = size / 4;
  for (let row = 0; row < 4; row += 1) {
    const y = row * plankH;
    const offset = (row % 2) * (size / 3);
    const plankW = size / 3;
    for (let col = -1; col <= 3; col += 1) {
      const x = col * plankW + offset;
      const shade = 0.78 + ((row * 3 + col + 5) % 7) * 0.03;
      ctx.fillStyle = `rgb(${Math.round(196 * shade)},${Math.round(165 * shade)},${Math.round(116 * shade)})`;
      ctx.fillRect(x, y, plankW - 1.5, plankH - 1.5);
      ctx.strokeStyle = `rgba(90, 60, 30, ${0.08 + ((col + row) % 3) * 0.04})`;
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g += 1) {
        const gy = y + 4 + g * ((plankH - 8) / 4);
        ctx.beginPath();
        ctx.moveTo(x + 2, gy);
        ctx.lineTo(x + plankW - 4, gy + ((g % 2) * 2 - 1));
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(70, 45, 25, 0.35)';
    ctx.fillRect(0, y + plankH - 1.5, size, 1.5);
  }
}

function drawHerringbone(ctx, size) {
  ctx.fillStyle = '#b8956a';
  ctx.fillRect(0, 0, size, size);
  const cell = size / 4;
  for (let row = -1; row < 5; row += 1) {
    for (let col = -1; col < 5; col += 1) {
      const x = col * cell;
      const y = row * cell;
      const flip = (row + col) % 2 === 0;
      const shade = 0.82 + ((row * 5 + col) % 5) * 0.035;
      ctx.fillStyle = `rgb(${Math.round(185 * shade)},${Math.round(150 * shade)},${Math.round(105 * shade)})`;
      ctx.save();
      ctx.translate(x + cell / 2, y + cell / 2);
      ctx.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
      ctx.fillRect(-cell * 0.7, -cell * 0.18, cell * 1.4, cell * 0.32);
      ctx.strokeStyle = 'rgba(80, 50, 25, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-cell * 0.7, -cell * 0.18, cell * 1.4, cell * 0.32);
      ctx.restore();
    }
  }
}

function drawTile(ctx, size) {
  ctx.fillStyle = '#d8d4cc';
  ctx.fillRect(0, 0, size, size);
  const n = 4;
  const cell = size / n;
  const grout = 3;
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const shade = 0.9 + ((row + col * 3) % 4) * 0.025;
      ctx.fillStyle = `rgb(${Math.round(220 * shade)},${Math.round(215 * shade)},${Math.round(205 * shade)})`;
      ctx.fillRect(col * cell + grout, row * cell + grout, cell - grout * 2, cell - grout * 2);
      // subtle speckles
      ctx.fillStyle = 'rgba(120, 110, 100, 0.08)';
      for (let i = 0; i < 8; i += 1) {
        const px = col * cell + grout + ((i * 37 + row * 11) % (cell - grout * 2));
        const py = row * cell + grout + ((i * 19 + col * 13) % (cell - grout * 2));
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    }
  }
  ctx.fillStyle = '#9a948a';
  for (let i = 0; i <= n; i += 1) {
    ctx.fillRect(0, i * cell - 1, size, 2);
    ctx.fillRect(i * cell - 1, 0, 2, size);
  }
}

function drawChecker(ctx, size) {
  const n = 4;
  const cell = size / n;
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const dark = (row + col) % 2 === 0;
      ctx.fillStyle = dark ? '#a89880' : '#ddd4c4';
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
}

function drawConcrete(ctx, size) {
  ctx.fillStyle = '#b0b0a8';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i += 1) {
    const x = (i * 73) % size;
    const y = (i * 191) % size;
    const v = 140 + ((i * 17) % 70);
    const a = 0.08 + ((i * 13) % 10) / 100;
    ctx.fillStyle = `rgba(${v},${v},${Math.max(120, v - 8)},${a})`;
    ctx.fillRect(x, y, 1 + (i % 2), 1 + ((i >> 1) % 2));
  }
  // faint formwork lines
  ctx.strokeStyle = 'rgba(90, 90, 85, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const p = (size * i) / 4;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
}

function drawCarpet(ctx, size) {
  ctx.fillStyle = '#8a7a6a';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = ((x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const shade = 0.75 + Math.abs(n) * 0.35;
      ctx.fillStyle = `rgb(${Math.round(140 * shade)},${Math.round(122 * shade)},${Math.round(105 * shade)})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  // soft loop highlights
  ctx.fillStyle = 'rgba(255, 245, 230, 0.04)';
  for (let i = 0; i < 80; i += 1) {
    const x = (i * 41) % size;
    const y = (i * 97) % size;
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
