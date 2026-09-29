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

// 글자 모양. 선을 이어 붙여 만든다. (x, y) 는 왼쪽 위, (w, h) 는 글자 한 칸의 크기.
function rightOf(x) {
  return d.convex([[x, -1], [2, -1], [2, 2], [x, 2]]);
}

function glyphB(x, y, w, h, t) {
  const stem = x + t / 2;
  const bowl = (cy, hh) => d.intersect(
    d.outline(d.roundRect(x + w * 0.52, cy, w * 0.48, hh, Math.min(w * 0.42, hh * 0.9)), t / 2),
    rightOf(stem)
  );
  return d.union(
    d.capsule(stem, y + t / 2, stem, y + h - t / 2, t / 2),
    bowl(y + h * 0.26, h * 0.26),
    bowl(y + h * 0.74, h * 0.26)
  );
}

function glyphO(x, y, w, h, t) {
  return d.outline(
    d.roundRect(x + w / 2, y + h / 2, w / 2, h / 2, Math.min(w, h) / 2),
    t / 2
  );
}

function glyphX(x, y, w, h, t) {
  const inset = t / 2;
  return d.union(
    d.capsule(x + inset, y + inset, x + w - inset, y + h - inset, t / 2),
    d.capsule(x + w - inset, y + inset, x + inset, y + h - inset, t / 2)
  );
}

// 'BOX' 를 한 덩어리로 만든다.
// 낱자마다 너비를 달리 주어야 눈에는 같은 크기로 보인다.
// 둥근 O 는 위아래로 조금 넘겨야 B, X 와 키가 같아 보인다.
function wordBox(x, y, h) {
  const t = h * 0.21;
  const gap = h * 0.15;
  const wB = h * 0.62;
  const wO = h * 0.70;
  const wX = h * 0.66;
  const over = h * 0.025;
  let at = x;
  const parts = [glyphB(at, y, wB, h, t)];
  at += wB + gap;
  parts.push(glyphO(at, y - over, wO, h + over * 2, t));
  at += wO + gap;
  parts.push(glyphX(at, y, wX, h, t));
  return d.union(...parts);
}

// 'Box' 를 낱말 모양으로 짠다. B 는 키가 크고, o 와 x 는 낮다.
// 세 낱자를 같은 밑줄에 맞춰야 낱말로 읽힌다.
const SMALL_CAP = 0.72;

function wordBoxWord(x, y, h) {
  const t = h * 0.2;
  const gap = h * 0.13;
  const low = h * SMALL_CAP;
  const base = y + h;
  const wB = h * 0.62;
  const wO = low * 0.92;
  const wX = low * 0.88;
  let at = x;
  const parts = [glyphB(at, y, wB, h, t)];
  at += wB + gap;
  parts.push(glyphO(at, base - low, wO, low, t * 0.95));
  at += wO + gap;
  parts.push(glyphX(at, base - low, wX, low, t * 0.95));
  return d.union(...parts);
}

function wordBoxWordWidth(h) {
  const low = h * SMALL_CAP;
  return h * 0.62 + low * 0.92 + low * 0.88 + h * 0.13 * 2;
}

function wordBoxWidth(h) {
  return h * (0.62 + 0.70 + 0.66) + h * 0.15 * 2;
}

// 뒤로 밀린 그림자를 겹겹이 쌓아 글자를 도톰하게 만든다.
function emboss(canvas, shape, depth, steps) {
  for (let i = steps; i >= 1; i -= 1) {
    const k = i / steps;
    canvas.fill(
      (px, py) => shape(px - depth * k, py - depth * k),
      d.mix([13, 42, 110], [37, 99, 235], 1 - k)
    );
  }
}

// 앱 아이콘.
// 아이콘을 담아 두는 판 하나를 정면에서 보되, 아래에 두께와 그림자를 두어 입체로 보이게 한다.
// 판 아래에는 'Box' 를 도톰하게 새긴다. 작은 크기에서는 뭉개지므로 글자를 빼고 판만 둔다.

// 아래에 'Box' 글자를 둘 자리를 비우느라 판을 조금 위로 올린다.
const PLATE = { cx: 0.5, cy: 0.425, hw: 0.275, hh: 0.235, r: 0.072 };
const THICK = 0.036;

function plateShape(dy = 0, inset = 0) {
  return d.roundRect(PLATE.cx, PLATE.cy + dy, PLATE.hw - inset, PLATE.hh, PLATE.r - inset * 0.6);
}

// 그림자는 흐리게 할 수 없으니 옅은 층을 여러 겹 쌓아 부드럽게 만든다.
function softShadow(canvas) {
  for (let i = 4; i >= 1; i -= 1) {
    const spread = 0.012 * i;
    const shape = d.roundRect(
      PLATE.cx,
      PLATE.cy + THICK + 0.026 + spread * 0.5,
      PLATE.hw + spread,
      PLATE.hh + spread * 0.5,
      PLATE.r + spread
    );
    canvas.fill(shape, [8, 20, 56], 0.10);
  }
}

function boxArt(canvas) {
  const small = canvas.size < 32;
  const body = d.roundRect(0.5, 0.5, 0.435, 0.435, 0.145);

  // 바탕. 위에서 빛이 들고 아래로 갈수록 어두워진다.
  canvas.fill(body, d.linear(0, 0.065, 0, 0.935, [124, 186, 255], [21, 60, 168]));
  canvas.fill(body, d.radial(0.5, 0.08, 0.92, [255, 255, 255, 0.34], [255, 255, 255, 0]));
  canvas.fill(body, d.linear(0, 0.54, 0, 0.96, [0, 0, 0, 0], [0, 0, 0, 0.24]));
  canvas.fill(
    d.outline(body, 0.011),
    d.linear(0, 0.065, 0, 0.935, [255, 255, 255, 0.62], [0, 0, 0, 0.32])
  );

  softShadow(canvas);

  // 판의 두께. 아래로 조금 내린 같은 모양을 먼저 깔아 옆면으로 삼는다.
  // 좌우로 조금 좁혀야 둥근 모서리에서 옆구리가 비어져 나오지 않는다.
  canvas.fill(
    plateShape(THICK, 0.018),
    d.linear(0, PLATE.cy, 0, PLATE.cy + PLATE.hh + THICK, [70, 124, 220], [28, 62, 158])
  );

  // 판의 앞면
  const face = plateShape(0);
  canvas.fill(face, d.linear(0, PLATE.cy - PLATE.hh, 0, PLATE.cy + PLATE.hh, [255, 255, 255], [219, 232, 250]));

  // 제목 줄
  const barBottom = PLATE.cy - PLATE.hh + (small ? 0.13 : 0.105);
  canvas.fill(
    d.intersect(face, d.convex([[0, 0], [1, 0], [1, barBottom], [0, barBottom]])),
    d.linear(0, PLATE.cy - PLATE.hh, 0, barBottom, [86, 150, 250], [37, 99, 235])
  );

  // 담겨 있는 아이콘
  const dots = small
    ? [[0.415, 0.515], [0.585, 0.515]]
    : [[0.405, 0.455], [0.595, 0.455], [0.405, 0.585], [0.595, 0.585]];
  const radius = small ? 0.062 : 0.047;
  for (const [x, y] of dots) {
    canvas.fill(d.circle(x, y + 0.010, radius), [30, 64, 160], 0.22);
    canvas.fill(d.circle(x, y, radius), d.linear(0, y - radius, 0, y + radius, [96, 165, 250], [29, 78, 216]));
  }

  // 판 아래의 'Box'. 뒤로 밀린 층을 쌓아 도톰하게 만들고, 앞면은 밝게 칠한다.
  if (!small) {
    const h = 0.155;
    const x = 0.5 - wordBoxWordWidth(h) / 2;
    const y = 0.765;
    const word = wordBoxWord(x, y, h);
    canvas.fill((px, py) => word(px, py - 0.012), [8, 20, 56], 0.22);
    emboss(canvas, word, 0.018, 5);
    canvas.fill(word, d.linear(0, y, 0, y + h, [255, 255, 255], [198, 222, 252]));
    canvas.fill(
      d.intersect(d.outline(word, 0.006), d.convex([[0, 0], [1, 0], [1, y + h * 0.4], [0, y + h * 0.4]])),
      [255, 255, 255],
      0.55
    );
  }

  // 제목 줄 맨 위의 가는 빛. 판이 도톰해 보이게 한다.
  canvas.fill(
    d.intersect(
      d.outline(face, 0.007),
      d.convex([[0, 0], [1, 0], [1, PLATE.cy - PLATE.hh + 0.06], [0, PLATE.cy - PLATE.hh + 0.06]])
    ),
    [255, 255, 255],
    0.5
  );
}

// 트레이는 늘 작게 보이므로 1배·2배 그림이 같은 모양이도록 글자를 넣지 않는다.
function trayArt(canvas) {
  const body = d.roundRect(0.5, 0.5, 0.40, 0.34, 0.11);
  canvas.fill(body, BLUE);
  canvas.fill(d.intersect(body, d.convex([[0, 0], [1, 0], [1, 0.31], [0, 0.31]])), DEEP);
  for (const [x, y] of [[0.38, 0.50], [0.62, 0.50], [0.38, 0.69], [0.62, 0.69]]) {
    canvas.fill(d.circle(x, y, 0.062), WHITE);
  }
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
