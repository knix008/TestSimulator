'use strict';

// 프로그램이 쓰는 모든 그림의 생김새. 0~1 좌표로 적어 두어 크기와 무관하다.

const d = require('./lib/draw');

const BLUE = [59, 130, 246];
const DEEP = [30, 64, 175];
const LIGHT = [147, 197, 253];
const RED = [225, 66, 66];
const WHITE = [255, 255, 255];

// 메뉴 그림은 위가 밝고 아래가 진하다. 납작해 보이지 않게 한다.
const BLUE_G = d.linear(0, 0.12, 0, 0.88, [96, 165, 250], [29, 78, 216]);
const RED_G = d.linear(0, 0.12, 0, 0.88, [248, 113, 113], [190, 30, 45]);
// 테두리 안쪽을 옅게 채워 도형이 비어 보이지 않게 한다.
const WASH = d.linear(0, 0.1, 0, 0.9, [147, 197, 253, 0.45], [96, 165, 250, 0.22]);
const WASH_RED = d.linear(0, 0.1, 0, 0.9, [252, 165, 165, 0.42], [248, 113, 113, 0.2]);

const STROKE = 0.05;

function arrowHead(tipX, tipY, dirX, dirY, size) {
  const backX = tipX - dirX * size;
  const backY = tipY - dirY * size;
  const sideX = -dirY * size * 0.8;
  const sideY = dirX * size * 0.8;
  return d.convex([
    [tipX, tipY],
    [backX + sideX, backY + sideY],
    [backX - sideX, backY - sideY],
  ]);
}

// 앱 아이콘.
// 요즘 아이콘처럼 둥근 사각형(스쿼클)에 선명한 대각선 그라데이션을 깔고, 그 위에 반투명 유리판 두 장을 겹친다.
// 앞 판은 박스 하나다: 위에 잡는 줄(알약)이 있고 안에 색색의 아이콘 타일이 놓여 있다. 글자는 넣지 않는다.

const APP_BG = (x, y) => {
  // 왼쪽 위 남보라 → 가운데 보라빛 파랑 → 오른쪽 아래 하늘색.
  const t = Math.max(0, Math.min(1, ((x - 0.08) + (y - 0.08)) / 1.68));
  return t < 0.5
    ? d.mix([124, 58, 237], [79, 70, 229], t / 0.5)
    : d.mix([79, 70, 229], [14, 165, 233], (t - 0.5) / 0.5);
};

const TILE_COLORS = [
  [[253, 164, 175], [244, 63, 94]],
  [[253, 224, 71], [245, 158, 11]],
  [[110, 231, 183], [16, 185, 129]],
  [[125, 211, 252], [14, 165, 233]],
  [[196, 181, 253], [139, 92, 246]],
  [[251, 146, 60], [234, 88, 12]],
];

function tile(canvas, x, y, h, colors) {
  const shape = d.roundRect(x, y, h, h, h * 0.42);
  canvas.fill(d.roundRect(x, y + h * 0.18, h, h, h * 0.42), [30, 27, 75], 0.16);
  canvas.fill(shape, d.linear(0, y - h, 0, y + h, colors[0], colors[1]));
}

function boxArt(canvas) {
  const small = canvas.size < 32;
  const body = d.roundRect(0.5, 0.5, 0.44, 0.44, 0.2);

  // 바탕과 은은한 빛
  canvas.fill(body, APP_BG);
  canvas.fill(body, d.radial(0.22, 0.12, 0.75, [255, 255, 255, 0.26], [255, 255, 255, 0]));
  canvas.fill(body, d.radial(0.85, 0.95, 0.6, [56, 189, 248, 0.35], [56, 189, 248, 0]));
  if (!small) canvas.fill(d.intersect(body, d.outline(body, 0.006)), [255, 255, 255], 0.22);

  // 뒤의 유리판. 박스가 여러 개임을 알린다.
  const back = d.roundRect(0.585, 0.385, 0.235, 0.19, 0.07);
  canvas.fill(back, [255, 255, 255], 0.2);
  if (!small) canvas.fill(d.outline(back, 0.005), [255, 255, 255], 0.38);

  // 앞 유리판의 그림자: 옅은 층을 겹쳐 부드럽게
  const front = { cx: 0.455, cy: 0.565, hw: 0.285, hh: 0.235, r: 0.08 };
  for (let i = 4; i >= 1; i -= 1) {
    const s = 0.011 * i;
    canvas.fill(d.roundRect(front.cx, front.cy + 0.03 + s * 0.4, front.hw + s, front.hh + s, front.r + s), [30, 27, 75], 0.07);
  }
  const face = d.roundRect(front.cx, front.cy, front.hw, front.hh, front.r);
  canvas.fill(face, d.linear(0, front.cy - front.hh, 0, front.cy + front.hh, [255, 255, 255, 0.97], [237, 233, 254, 0.93]));
  if (!small) {
    canvas.fill(
      d.intersect(d.outline(face, 0.004), d.convex([[0, 0], [1, 0], [1, front.cy - front.hh + 0.05], [0, front.cy - front.hh + 0.05]])),
      [255, 255, 255],
      0.9
    );
  }

  const left = front.cx - front.hw;
  const top = front.cy - front.hh;
  if (small) {
    // 작은 크기: 타일 네 개만 크게.
    const h = 0.075;
    const xs = [front.cx - 0.105, front.cx + 0.105];
    const ys = [front.cy - 0.085, front.cy + 0.095];
    let k = 0;
    for (const y of ys) for (const x of xs) tile(canvas, x, y, h, TILE_COLORS[k++]);
    return;
  }

  // 잡는 줄(알약)과 점 하나: 박스의 제목 줄
  const barY = top + 0.075;
  canvas.fill(d.capsule(left + 0.075, barY, left + 0.235, barY, 0.019), d.linear(left, 0, left + 0.3, 0, [124, 58, 237], [79, 70, 229]));
  canvas.fill(d.circle(front.cx + front.hw - 0.075, barY, 0.019), [196, 181, 253]);

  // 담긴 아이콘 타일 3×2
  const h = 0.05;
  const xs = [front.cx - 0.15, front.cx, front.cx + 0.15];
  const ys = [front.cy + 0.01, front.cy + 0.135];
  let k = 0;
  for (const y of ys) for (const x of xs) tile(canvas, x, y, h, TILE_COLORS[k++]);
}

// 트레이는 늘 작게 보이므로 1배·2배 그림이 같은 모양이도록 단순하게 둔다. 앱 아이콘과 같은 색이다.
function trayArt(canvas) {
  const body = d.roundRect(0.5, 0.5, 0.44, 0.44, 0.17);
  canvas.fill(body, APP_BG);
  const face = d.roundRect(0.5, 0.53, 0.30, 0.27, 0.07);
  canvas.fill(face, [255, 255, 255], 0.96);
  const h = 0.07;
  let k = 0;
  for (const y of [0.45, 0.62]) for (const x of [0.39, 0.61]) tile(canvas, x, y, h, TILE_COLORS[k++]);
}

const icons = {
  app: boxArt,
  tray: trayArt,

  // 트레이 · 설정
  draw(canvas) {
    const frame = d.roundRect(0.5, 0.5, 0.36, 0.31, 0.09);
    canvas.fill(frame, WASH);
    canvas.fill(d.outline(frame, STROKE / 2), BLUE_G);
    canvas.fill(d.union(
      d.capsule(0.5, 0.36, 0.5, 0.64, 0.045),
      d.capsule(0.36, 0.5, 0.64, 0.5, 0.045)
    ), BLUE_G);
  },

  show(canvas) {
    const lens = d.intersect(d.circle(0.5, 0.86, 0.52), d.circle(0.5, 0.14, 0.52));
    canvas.fill(d.outline(lens, 0.042), BLUE_G);
    canvas.fill(d.circle(0.5, 0.5, 0.115), BLUE_G);
  },

  hide(canvas) {
    const lens = d.intersect(d.circle(0.5, 0.86, 0.52), d.circle(0.5, 0.14, 0.52));
    const eye = d.union(d.outline(lens, 0.042), d.circle(0.5, 0.5, 0.115));
    canvas.fill(d.subtract(eye, d.capsule(0.18, 0.82, 0.82, 0.18, 0.085)), BLUE_G);
    canvas.fill(d.capsule(0.20, 0.80, 0.80, 0.20, 0.045), BLUE_G);
  },

  settings(canvas) {
    const teeth = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4;
      teeth.push(d.capsule(
        0.5 + Math.cos(a) * 0.20,
        0.5 + Math.sin(a) * 0.20,
        0.5 + Math.cos(a) * 0.38,
        0.5 + Math.sin(a) * 0.38,
        0.058
      ));
    }
    canvas.fill(d.union(d.outline(d.circle(0.5, 0.5, 0.235), 0.075), ...teeth), BLUE_G);
  },

  gather(canvas) {
    canvas.fill(d.roundRect(0.5, 0.75, 0.33, 0.10, 0.045), BLUE_G);
    canvas.fill(d.union(
      d.capsule(0.5, 0.16, 0.5, 0.44, 0.048),
      arrowHead(0.5, 0.60, 0, 1, 0.17)
    ), BLUE_G);
  },

  startup(canvas) {
    const ring = d.outline(d.circle(0.5, 0.56, 0.28), 0.05);
    canvas.fill(d.subtract(ring, d.convex([[0.40, 0.06], [0.60, 0.06], [0.60, 0.42], [0.40, 0.42]])), BLUE_G);
    canvas.fill(d.capsule(0.5, 0.16, 0.5, 0.48, 0.05), BLUE_G);
  },

  folder(canvas) {
    canvas.fill(d.union(
      d.roundRect(0.5, 0.60, 0.36, 0.22, 0.06),
      d.convex([[0.14, 0.42], [0.40, 0.42], [0.47, 0.32], [0.14, 0.32]], 0.03)
    ), BLUE_G);
  },

  quit(canvas) {
    canvas.fill(d.outline(d.roundRect(0.33, 0.5, 0.19, 0.34, 0.06), 0.045), RED_G);
    canvas.fill(d.union(
      d.capsule(0.50, 0.5, 0.78, 0.5, 0.048),
      arrowHead(0.88, 0.5, 1, 0, 0.17)
    ), RED_G);
  },

  // 박스 오른쪽 단추 메뉴
  open(canvas) {
    const frame = d.outline(d.roundRect(0.44, 0.58, 0.32, 0.30, 0.08), 0.045);
    canvas.fill(d.subtract(frame, d.roundRect(0.78, 0.28, 0.24, 0.24, 0.02)), BLUE_G);
    canvas.fill(d.union(
      d.capsule(0.56, 0.46, 0.80, 0.22, 0.048),
      arrowHead(0.88, 0.14, 0.707, -0.707, 0.19)
    ), BLUE_G);
  },

  eject(canvas) {
    const lid = d.roundRect(0.5, 0.28, 0.31, 0.17, 0.06);
    canvas.fill(lid, WASH);
    canvas.fill(d.outline(lid, 0.045), BLUE_G);
    canvas.fill(d.union(
      d.capsule(0.5, 0.52, 0.5, 0.72, 0.048),
      arrowHead(0.5, 0.90, 0, 1, 0.19)
    ), BLUE_G);
  },

  rename(canvas) {
    const shaft = d.convex([[0.32, 0.60], [0.60, 0.32], [0.72, 0.44], [0.44, 0.72]], 0.02);
    const tip = d.convex([[0.44, 0.72], [0.32, 0.60], [0.16, 0.88]]);
    canvas.fill(d.union(shaft, tip), BLUE_G);
    canvas.fill(d.capsule(0.62, 0.30, 0.70, 0.22, 0.075), DEEP);
  },

  collapse(canvas) {
    canvas.fill(d.union(
      d.capsule(0.26, 0.60, 0.5, 0.36, 0.058),
      d.capsule(0.5, 0.36, 0.74, 0.60, 0.058)
    ), BLUE_G);
  },

  expand(canvas) {
    canvas.fill(d.union(
      d.capsule(0.26, 0.40, 0.5, 0.64, 0.058),
      d.capsule(0.5, 0.64, 0.74, 0.40, 0.058)
    ), BLUE_G);
  },

  color(canvas) {
    canvas.fill(d.circle(0.36, 0.38, 0.22), DEEP);
    canvas.fill(d.circle(0.64, 0.38, 0.22), BLUE_G);
    canvas.fill(d.circle(0.50, 0.64, 0.22), LIGHT);
  },

  opacity(canvas) {
    const ring = d.circle(0.5, 0.5, 0.33);
    canvas.fill(d.intersect(ring, d.convex([[0, 0], [0.5, 0], [0.5, 1], [0, 1]])), BLUE_G);
    canvas.fill(d.outline(ring, 0.045), BLUE_G);
  },

  info(canvas) {
    const ring = d.circle(0.5, 0.5, 0.36);
    canvas.fill(ring, WASH);
    canvas.fill(d.outline(ring, 0.05), BLUE_G);
    canvas.fill(d.circle(0.5, 0.29, 0.055), BLUE_G);
    canvas.fill(d.capsule(0.5, 0.44, 0.5, 0.70, 0.055), BLUE_G);
  },

  language(canvas) {
    // 지구본 모양. 언어 메뉴의 머리 항목에 쓴다.
    const ball = d.circle(0.5, 0.5, 0.34);
    canvas.fill(d.outline(ball, 0.045), BLUE_G);
    canvas.fill(d.intersect(d.outline(d.roundRect(0.5, 0.5, 0.17, 0.34, 0.17), 0.04), ball), BLUE_G);
    canvas.fill(d.intersect(d.capsule(0.1, 0.5, 0.9, 0.5, 0.022), ball), BLUE_G);
    canvas.fill(d.intersect(d.capsule(0.1, 0.34, 0.9, 0.34, 0.019), ball), BLUE_G);
    canvas.fill(d.intersect(d.capsule(0.1, 0.66, 0.9, 0.66, 0.019), ball), BLUE_G);
  },

  'lang-ko': flagKR,
  'lang-en': flagUK,

  // 두 장을 겹쳐 복사처럼 보이게 한다.
  copy(canvas) {
    const back = d.roundRect(0.40, 0.42, 0.22, 0.26, 0.05);
    const front = d.roundRect(0.58, 0.60, 0.22, 0.26, 0.05);
    canvas.fill(d.outline(back, 0.042), BLUE_G);
    canvas.fill(front, WASH);
    canvas.fill(d.outline(front, 0.042), BLUE_G);
  },

  // 가위. 잘라내기는 복사와 그림이 달라야 메뉴에서 바로 구분된다.
  cut(canvas) {
    canvas.fill(d.outline(d.circle(0.30, 0.28, 0.12), 0.04), BLUE_G);
    canvas.fill(d.outline(d.circle(0.30, 0.72, 0.12), 0.04), BLUE_G);
    canvas.fill(d.capsule(0.40, 0.36, 0.84, 0.78, 0.035), BLUE_G);
    canvas.fill(d.capsule(0.40, 0.64, 0.84, 0.22, 0.035), BLUE_G);
  },

  // 클립보드. 붙여넣기는 판 위에 클립이 달린 모양이다.
  paste(canvas) {
    const board = d.roundRect(0.50, 0.58, 0.26, 0.30, 0.06);
    canvas.fill(board, WASH);
    canvas.fill(d.outline(board, 0.042), BLUE_G);
    canvas.fill(d.roundRect(0.50, 0.30, 0.12, 0.07, 0.03), BLUE_G);
    canvas.fill(d.capsule(0.34, 0.70, 0.66, 0.70, 0.028), BLUE_G);
    canvas.fill(d.capsule(0.34, 0.58, 0.58, 0.58, 0.028), BLUE_G);
  },

  remove(canvas) {
    const can = d.convex([[0.30, 0.36], [0.70, 0.36], [0.64, 0.84], [0.36, 0.84]], 0.03);
    canvas.fill(can, WASH_RED);
    canvas.fill(d.capsule(0.24, 0.28, 0.76, 0.28, 0.048), RED_G);
    canvas.fill(d.capsule(0.41, 0.17, 0.59, 0.17, 0.045), RED_G);
    canvas.fill(d.outline(can, 0.042), RED_G);
  },
};

// 깃발. 세로로 납작한 판 안에 그림을 담는다.
const FLAG = { cx: 0.5, cy: 0.5, hw: 0.45, hh: 0.30, r: 0.05 };
const flagField = d.roundRect(FLAG.cx, FLAG.cy, FLAG.hw, FLAG.hh, FLAG.r);
const FLAG_L = FLAG.cx - FLAG.hw;
const FLAG_R = FLAG.cx + FLAG.hw;
const FLAG_T = FLAG.cy - FLAG.hh;
const FLAG_B = FLAG.cy + FLAG.hh;

function flagEdge(canvas) {
  canvas.fill(d.outline(flagField, 0.016), [71, 85, 105], 0.8);
}

// 영국 국기
function flagUK(canvas) {
  const clip = (shape) => d.intersect(shape, flagField);
  const NAVY = [1, 33, 105];
  const CRIMSON = [200, 16, 46];
  canvas.fill(flagField, NAVY);
  const down = d.capsule(FLAG_L, FLAG_T, FLAG_R, FLAG_B, 0.075);
  const up = d.capsule(FLAG_R, FLAG_T, FLAG_L, FLAG_B, 0.075);
  canvas.fill(clip(d.union(down, up)), WHITE);
  canvas.fill(clip(d.union(
    d.capsule(FLAG_L, FLAG_T, FLAG_R, FLAG_B, 0.032),
    d.capsule(FLAG_R, FLAG_T, FLAG_L, FLAG_B, 0.032)
  )), CRIMSON);
  canvas.fill(clip(d.union(
    d.capsule(FLAG_L, FLAG.cy, FLAG_R, FLAG.cy, 0.082),
    d.capsule(FLAG.cx, FLAG_T, FLAG.cx, FLAG_B, 0.082)
  )), WHITE);
  canvas.fill(clip(d.union(
    d.capsule(FLAG_L, FLAG.cy, FLAG_R, FLAG.cy, 0.048),
    d.capsule(FLAG.cx, FLAG_T, FLAG.cx, FLAG_B, 0.048)
  )), CRIMSON);
  flagEdge(canvas);
}

// 태극기
function flagKR(canvas) {
  const RED = [205, 46, 58];
  const BLUE = [0, 71, 160];
  const INK = [16, 20, 28];
  canvas.fill(flagField, WHITE);

  // 태극. 가운데 원을 큰 반원과 작은 원 둘로 나눈다.
  const R = 0.155;
  const big = d.circle(FLAG.cx, FLAG.cy, R);
  const upper = d.convex([[0, 0], [1, 0], [1, FLAG.cy], [0, FLAG.cy]]);
  const rightBall = d.circle(FLAG.cx + R / 2, FLAG.cy, R / 2);
  const leftBall = d.circle(FLAG.cx - R / 2, FLAG.cy, R / 2);
  const redPart = d.subtract(d.union(d.intersect(big, upper), rightBall), leftBall);
  canvas.fill(d.rotate(big, FLAG.cx, FLAG.cy, -33), BLUE);
  canvas.fill(d.rotate(d.intersect(redPart, big), FLAG.cx, FLAG.cy, -33), RED);

  // 네 모서리의 괘. 대각선에 직각으로 막대 셋을 놓는다.
  const bars = (cx, cy, deg) => {
    const parts = [];
    for (let i = -1; i <= 1; i += 1) {
      const off = i * 0.052;
      parts.push(d.rotate(
        d.roundRect(cx, cy + off, 0.075, 0.017, 0.006),
        cx,
        cy,
        deg
      ));
    }
    return d.union(...parts);
  };
  const dx = 0.255;
  const dy = 0.17;
  canvas.fill(bars(FLAG.cx - dx, FLAG.cy - dy, -33), INK);
  canvas.fill(bars(FLAG.cx + dx, FLAG.cy + dy, -33), INK);
  canvas.fill(bars(FLAG.cx + dx, FLAG.cy - dy, 33), INK);
  canvas.fill(bars(FLAG.cx - dx, FLAG.cy + dy, 33), INK);
  flagEdge(canvas);
}

// 모서리 고르기 메뉴에 쓸 그림. 네모의 둥근 정도를 그대로 보여 준다.
function cornerChip(radius) {
  return (canvas) => {
    const box = d.roundRect(0.5, 0.5, 0.34, 0.30, radius);
    canvas.fill(box, WASH);
    canvas.fill(d.outline(box, 0.042), BLUE_G);
  };
}

// 색 고르기 메뉴에 쓸 동그란 색 조각
function swatch(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return (canvas) => {
    canvas.fill(d.circle(0.5, 0.5, 0.34), rgb);
    canvas.fill(d.outline(d.circle(0.5, 0.5, 0.34), 0.035), [255, 255, 255], 0.55);
  };
}

// 투명도 메뉴에 쓸 동그라미. 아래에서부터 차올라 단계가 눈에 띈다.
function level(ratio) {
  return (canvas) => {
    const ring = d.circle(0.5, 0.5, 0.33);
    const top = 0.83 - 0.66 * ratio;
    canvas.fill(d.intersect(ring, d.convex([[0, top], [1, top], [1, 1], [0, 1]])), BLUE);
    canvas.fill(d.outline(ring, 0.045), BLUE);
  };
}

// 테마 고르기 메뉴에 쓸, 박스를 그대로 줄인 미리보기
function themeChip(theme) {
  const hex = (value) => {
    const n = Number.parseInt(String(value).replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  return (canvas) => {
    const body = d.roundRect(0.5, 0.5, 0.40, 0.34, 0.10);
    canvas.fill(body, hex(theme.bg));
    canvas.fill(d.intersect(body, d.convex([[0, 0], [1, 0], [1, 0.32], [0, 0.32]])), hex(theme.bar));
    canvas.fill(d.outline(body, 0.03), hex(theme.bar), 0.9);
  };
}

module.exports = { icons, swatch, level, themeChip, cornerChip, BLUE, DEEP, LIGHT, RED, WHITE };
