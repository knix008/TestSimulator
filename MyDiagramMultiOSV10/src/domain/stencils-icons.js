// The Icons stencil: 120 small flat pictures in several colours. Every part carries its own
// colour ({ d, fill: 'color', color }), so an icon looks the same in every design and quick
// style. Drawn on a 100 × 100 grid and scaled to the shape, so it fits any size.
// stencils.js calls addIconMasters with its own `m` and drawing helpers.

const RED = '#e5484d'; const DRED = '#b42329'; const ORANGE = '#f97316'; const AMBER = '#f5a623'; const YELLOW = '#fcd34d';
const GREEN = '#22a66b'; const DGREEN = '#157a4c'; const LIME = '#8bc34a'; const TEAL = '#14b8a6'; const CYAN = '#38bdf8';
const BLUE = '#3b82f6'; const NAVY = '#1e3a8a'; const VIOLET = '#8b5cf6'; const PINK = '#ec4899'; const BROWN = '#92572b';
const TAN = '#d9a066'; const SKIN = '#f6c9a0'; const GREY = '#94a3b8'; const SLATE = '#475569'; const DARK = '#1f2937';
const PAPER = '#f1f5f9'; const WHITE = '#ffffff';

export function addIconMasters(m, H) {
  const { rect, ell, poly } = H;
  const pen = (w, h) => {
    const sx = w / 100; const sy = h / 100;
    const part = (color, d) => ({ d, fill: 'color', color });
    return {
      // A box, an ellipse, a polygon from x, y pairs, a bar between two points.
      R: (color, x, y, bw, bh, r = 0) => part(color, rect(x * sx, y * sy, bw * sx, bh * sy, r * Math.min(sx, sy))),
      O: (color, cx, cy, rx, ry = rx) => part(color, ell((cx - rx) * sx, (cy - ry) * sy, 2 * rx * sx, 2 * ry * sy)),
      P: (color, ...xy) => { const pts = []; for (let i = 0; i < xy.length; i += 2) pts.push([xy[i] * sx, xy[i + 1] * sy]); return part(color, poly(pts)); },
      B: (color, x1, y1, x2, y2, t = 8) => {
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const nx = (-(y2 - y1) / len) * (t / 2); const ny = ((x2 - x1) / len) * (t / 2);
        return part(color, poly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]].map(([x, y]) => [x * sx, y * sy])));
      },
      // A ring: outer and inner ellipse, the even-odd rule leaves the band.
      G: (color, cx, cy, r, t) => part(color, `${ell((cx - r) * sx, (cy - r) * sy, 2 * r * sx, 2 * r * sy)}${ell((cx - r + t) * sx, (cy - r + t) * sy, 2 * (r - t) * sx, 2 * (r - t) * sy)}`),
      // A path of absolute M L C Q Z with x, y pairs on the 100-unit grid.
      S: (color, d) => part(color, d.replace(/-?\d+(\.\d+)?/g, (() => { let isX = true; return (num) => { const out = Number((Number(num) * (isX ? sx : sy)).toFixed(2)); isX = !isX; return String(out); }; })())),
    };
  };
  const SIZE = 64;
  const i = (id, ko, en, draw) => m(`ico${id}`, 'icons', SIZE, SIZE, ko, en, (w, h) => draw(pen(w, h)), {
    aspect: true, qs: 'none', style: { fill: 'none', line: 'none' }, text: [-0.6, 1.06, 1.6, 1.62],
  });

  // ── office and files
  i('Folder', '폴더', 'Folder', (c) => [c.R(AMBER, 6, 18, 40, 24, 5), c.R(YELLOW, 6, 28, 88, 58, 7), c.R(AMBER, 6, 74, 88, 12, 6)]);
  i('Document', '문서', 'Document', (c) => [c.P(PAPER, 18, 6, 62, 6, 84, 28, 84, 94, 18, 94), c.P(GREY, 62, 6, 84, 28, 62, 28), c.R(BLUE, 28, 40, 44, 7), c.R(BLUE, 28, 54, 44, 7), c.R(TEAL, 28, 68, 28, 7)]);
  i('Clipboard', '클립보드', 'Clipboard', (c) => [c.R(BROWN, 16, 12, 68, 84, 7), c.R(PAPER, 24, 22, 52, 66, 3), c.R(SLATE, 36, 5, 28, 15, 4), c.R(GREEN, 32, 38, 36, 6), c.R(GREEN, 32, 52, 36, 6), c.R(GREEN, 32, 66, 22, 6)]);
  i('Calendar', '달력', 'Calendar', (c) => [c.R(PAPER, 10, 16, 80, 76, 8), c.R(RED, 10, 16, 80, 24, 8), c.R(SLATE, 26, 7, 8, 18, 3), c.R(SLATE, 66, 7, 8, 18, 3), c.R(BLUE, 22, 50, 14, 12, 2), c.R(BLUE, 43, 50, 14, 12, 2), c.R(ORANGE, 64, 50, 14, 12, 2), c.R(BLUE, 22, 70, 14, 12, 2), c.R(BLUE, 43, 70, 14, 12, 2)]);
  i('Pin', '압정', 'Push Pin', (c) => [c.P(GREY, 47, 60, 53, 60, 50, 96), c.R(RED, 32, 6, 36, 12, 5), c.P(RED, 38, 18, 62, 18, 66, 44, 34, 44), c.R(DRED, 22, 44, 56, 16, 7)]);
  i('Pencil', '연필', 'Pencil', (c) => [c.P(AMBER, 66, 10, 90, 34, 36, 88, 12, 64), c.P(PINK, 66, 10, 76, 2, 98, 24, 90, 34), c.P(TAN, 12, 64, 36, 88, 4, 96), c.P(DARK, 4, 96, 8, 82, 18, 92)]);
  i('Briefcase', '서류 가방', 'Briefcase', (c) => [c.R(SLATE, 34, 12, 32, 22, 5), c.R(PAPER, 41, 19, 18, 15), c.R(BROWN, 6, 28, 88, 60, 8), c.R(TAN, 6, 52, 88, 7), c.R(YELLOW, 42, 46, 16, 18, 3)]);
  i('Printer', '프린터', 'Printer', (c) => [c.R(PAPER, 26, 6, 48, 34), c.R(SLATE, 8, 34, 84, 40, 7), c.R(PAPER, 26, 58, 48, 36), c.R(BLUE, 34, 68, 32, 6), c.R(BLUE, 34, 80, 22, 6), c.O(LIME, 80, 46, 5)]);
  i('Ruler', '자', 'Ruler', (c) => [c.P(YELLOW, 6, 72, 72, 6, 94, 28, 28, 94), c.B(DARK, 28, 50, 36, 58, 4), c.B(DARK, 42, 36, 50, 44, 4), c.B(DARK, 56, 22, 64, 30, 4), c.B(ORANGE, 35, 43, 48, 56, 4), c.B(ORANGE, 49, 29, 62, 42, 4)]);
  i('BarChart', '막대 차트', 'Bar Chart', (c) => [c.R(BLUE, 14, 52, 18, 36, 2), c.R(GREEN, 41, 28, 18, 60, 2), c.R(ORANGE, 68, 12, 18, 76, 2), c.R(SLATE, 6, 88, 88, 6, 2)]);
  i('PieChart', '원 차트', 'Pie Chart', (c) => [c.O(BLUE, 48, 52, 40), c.S(ORANGE, 'M48 52L48 12C70 12 88 30 88 52Z'), c.S(GREEN, 'M48 52L88 52C88 64 84 74 76 80Z'), c.S(YELLOW, 'M54 46L54 6C76 6 94 24 94 46Z')]);
  i('LineChart', '꺾은선 차트', 'Line Chart', (c) => [c.R(PAPER, 8, 8, 84, 84, 8), c.B(BLUE, 18, 72, 40, 48, 7), c.B(BLUE, 40, 48, 58, 60, 7), c.B(BLUE, 58, 60, 82, 26, 7), c.O(ORANGE, 40, 48, 6), c.O(ORANGE, 58, 60, 6), c.O(RED, 82, 26, 6)]);

  // ── communication
  i('Envelope', '봉투', 'Envelope', (c) => [c.R(CYAN, 6, 22, 88, 60, 7), c.P(BLUE, 6, 82, 40, 50, 60, 50, 94, 82), c.P(WHITE, 8, 24, 92, 24, 50, 60)]);
  i('Chat', '대화', 'Chat', (c) => [c.R(BLUE, 6, 10, 66, 48, 12), c.P(BLUE, 20, 54, 38, 54, 18, 72), c.R(GREEN, 36, 42, 58, 42, 11), c.P(GREEN, 66, 80, 84, 80, 84, 96), c.O(WHITE, 52, 63, 4), c.O(WHITE, 66, 63, 4), c.O(WHITE, 80, 63, 4)]);
  i('Phone', '전화', 'Telephone', (c) => [c.S(GREEN, 'M16 8L34 6L44 30L32 40C38 54 46 62 60 68L70 56L94 66L92 84C90 92 82 96 74 94C40 88 12 60 6 26C4 18 8 10 16 8Z'), c.S(DGREEN, 'M16 8L34 6L44 30L32 40L26 14Z')]);
  i('Megaphone', '확성기', 'Megaphone', (c) => [c.R(SLATE, 26, 58, 16, 32, 4), c.P(ORANGE, 8, 38, 34, 34, 34, 66, 8, 62), c.P(RED, 34, 34, 82, 10, 82, 90, 34, 66), c.R(YELLOW, 82, 34, 10, 32, 4)]);
  i('Bell', '종', 'Bell', (c) => [c.S(YELLOW, 'M50 8C70 8 78 24 78 42L78 62L90 76L10 76L22 62L22 42C22 24 30 8 50 8Z'), c.R(AMBER, 10, 72, 80, 8, 4), c.O(BROWN, 50, 87, 10), c.O(AMBER, 50, 8, 6)]);
  i('Wifi', '와이파이', 'Wi-Fi', (c) => [c.S(BLUE, 'M6 40C30 14 70 14 94 40L84 50C64 30 36 30 16 50Z'), c.S(TEAL, 'M24 58C38 42 62 42 76 58L66 68C56 58 44 58 34 68Z'), c.O(ORANGE, 50, 82, 9)]);
  i('Microphone', '마이크', 'Microphone', (c) => [c.R(GREY, 34, 6, 32, 56, 16), c.R(SLATE, 34, 30, 32, 6), c.S(DARK, 'M20 44L28 44C28 74 72 74 72 44L80 44C80 86 20 86 20 44Z'), c.R(DARK, 46, 76, 8, 14), c.R(RED, 30, 88, 40, 7, 3)]);
  i('Globe', '지구본', 'Globe', (c) => [c.O(CYAN, 50, 50, 42), c.S(GREEN, 'M30 16C42 12 50 18 46 26C42 32 54 36 48 44C42 52 28 48 24 56C20 62 14 56 12 48C12 36 20 22 30 16Z'), c.S(GREEN, 'M64 48C74 44 86 48 90 54C88 68 78 80 66 86C60 74 56 58 64 48Z')]);
  i('Share', '공유', 'Share', (c) => [c.B(GREY, 26, 50, 74, 22, 7), c.B(GREY, 26, 50, 74, 78, 7), c.O(BLUE, 24, 50, 16), c.O(ORANGE, 76, 22, 14), c.O(GREEN, 76, 78, 14)]);

  // ── weather
  i('Sun', '해', 'Sun', (c) => [c.B(ORANGE, 50, 4, 50, 96, 8), c.B(ORANGE, 4, 50, 96, 50, 8), c.B(ORANGE, 17, 17, 83, 83, 8), c.B(ORANGE, 83, 17, 17, 83, 8), c.O(YELLOW, 50, 50, 28), c.O(AMBER, 50, 50, 17)]);
  i('Cloud', '구름', 'Cloud', (c) => [c.O(GREY, 38, 46, 22), c.O(GREY, 62, 40, 26), c.O(CYAN, 26, 58, 20), c.O(CYAN, 72, 58, 20), c.O(CYAN, 48, 50, 24), c.R(CYAN, 26, 58, 46, 20)]);
  i('Rain', '비', 'Rain', (c) => [c.O(GREY, 36, 34, 20), c.O(GREY, 62, 30, 24), c.R(GREY, 20, 34, 62, 20, 10), c.B(BLUE, 30, 62, 22, 84, 7), c.B(BLUE, 52, 62, 44, 84, 7), c.B(BLUE, 74, 62, 66, 84, 7)]);
  i('Snowflake', '눈송이', 'Snowflake', (c) => [c.B(CYAN, 50, 6, 50, 94, 8), c.B(CYAN, 12, 28, 88, 72, 8), c.B(CYAN, 88, 28, 12, 72, 8), c.B(BLUE, 38, 12, 50, 24, 6), c.B(BLUE, 62, 12, 50, 24, 6), c.B(BLUE, 38, 88, 50, 76, 6), c.B(BLUE, 62, 88, 50, 76, 6), c.O(NAVY, 50, 50, 7)]);
  i('Lightning', '번개', 'Lightning', (c) => [c.O(SLATE, 34, 24, 18), c.O(SLATE, 62, 22, 20), c.R(SLATE, 18, 26, 66, 16, 8), c.P(YELLOW, 54, 36, 30, 66, 48, 66, 38, 96, 72, 56, 54, 56, 66, 36)]);
  i('Rainbow', '무지개', 'Rainbow', (c) => [c.S(RED, 'M4 80C4 10 96 10 96 80L84 80C84 26 16 26 16 80Z'), c.S(YELLOW, 'M16 80C16 26 84 26 84 80L72 80C72 42 28 42 28 80Z'), c.S(GREEN, 'M28 80C28 42 72 42 72 80L60 80C60 58 40 58 40 80Z'), c.O(CYAN, 18, 80, 14, 9), c.O(CYAN, 82, 80, 14, 9)]);
  i('Moon', '달', 'Moon', (c) => [c.S(YELLOW, 'M62 6C40 10 22 28 22 52C22 76 42 94 64 94C74 94 84 90 90 84C62 88 42 70 42 46C42 30 50 14 62 6Z'), c.O(AMBER, 72, 28, 5), c.O(AMBER, 84, 48, 4)]);
  i('Umbrella', '우산', 'Umbrella', (c) => [c.S(PINK, 'M6 50C10 4 90 4 94 50Z'), c.S(VIOLET, 'M34 50C36 14 64 14 66 50Z'), c.R(SLATE, 47, 48, 6, 36), c.S(SLATE, 'M47 80L53 80C53 96 34 96 34 84L40 84C40 90 47 90 47 80Z'), c.R(DARK, 47, 4, 6, 8)]);

  // ── nature
  i('Tree', '나무', 'Tree', (c) => [c.R(BROWN, 42, 62, 16, 34, 2), c.O(DGREEN, 50, 38, 34), c.O(GREEN, 32, 48, 20), c.O(GREEN, 68, 48, 20), c.O(LIME, 42, 26, 12)]);
  i('Flower', '꽃', 'Flower', (c) => [c.R(GREEN, 47, 50, 6, 46), c.P(LIME, 50, 80, 76, 62, 76, 74), c.O(PINK, 50, 18, 13), c.O(PINK, 28, 34, 13), c.O(PINK, 72, 34, 13), c.O(PINK, 36, 56, 12), c.O(PINK, 64, 56, 12), c.O(YELLOW, 50, 38, 12)]);
  i('Leaf', '잎', 'Leaf', (c) => [c.S(GREEN, 'M12 88C8 40 40 8 92 8C92 60 60 92 12 88Z'), c.S(LIME, 'M12 88C8 40 40 8 92 8Z'), c.B(DGREEN, 12, 92, 72, 28, 5)]);
  i('Mountain', '산', 'Mountain', (c) => [c.R(CYAN, 4, 8, 92, 84, 8), c.O(YELLOW, 76, 26, 10), c.P(SLATE, 4, 90, 40, 26, 76, 90), c.P(WHITE, 40, 26, 50, 44, 40, 40, 30, 44), c.P(DGREEN, 40, 90, 68, 48, 96, 90)]);
  i('Fish', '물고기', 'Fish', (c) => [c.P(ORANGE, 64, 50, 96, 24, 96, 76), c.O(AMBER, 42, 50, 38, 26), c.P(ORANGE, 34, 28, 54, 12, 56, 32), c.O(WHITE, 22, 44, 7), c.O(DARK, 21, 44, 3.5), c.B(RED, 40, 34, 40, 66, 5)]);

  // ── food
  i('Apple', '사과', 'Apple', (c) => [c.S(RED, 'M50 30C70 16 92 28 90 54C88 78 72 96 60 94C54 92 46 92 40 94C28 96 12 78 10 54C8 28 30 16 50 30Z'), c.R(BROWN, 46, 10, 8, 22, 3), c.S(GREEN, 'M54 22C58 8 74 6 82 10C78 22 66 28 54 22Z'), c.O(WHITE, 30, 44, 6, 10)]);
  i('Coffee', '커피', 'Coffee', (c) => [c.G(TAN, 76, 54, 16, 7), c.P(PAPER, 12, 32, 78, 32, 70, 88, 20, 88), c.P(BROWN, 15, 32, 75, 32, 73, 44, 17, 44), c.R(GREY, 8, 88, 74, 6, 3), c.B(GREY, 32, 8, 28, 24, 5), c.B(GREY, 52, 8, 48, 24, 5)]);
  i('Pizza', '피자', 'Pizza', (c) => [c.P(YELLOW, 50, 96, 8, 20, 92, 20), c.R(TAN, 6, 10, 88, 14, 7), c.O(RED, 42, 38, 8), c.O(RED, 62, 44, 7), c.O(RED, 50, 66, 7), c.O(GREEN, 28, 32, 3), c.O(GREEN, 70, 30, 3)]);
  i('Burger', '햄버거', 'Burger', (c) => [c.S(TAN, 'M8 44C8 6 92 6 92 44Z'), c.R(LIME, 6, 44, 88, 9, 4), c.R(BROWN, 8, 53, 84, 13, 5), c.R(YELLOW, 8, 66, 84, 6), c.R(TAN, 8, 72, 84, 18, 8), c.O(WHITE, 34, 26, 3), c.O(WHITE, 54, 20, 3), c.O(WHITE, 68, 30, 3)]);
  i('Cake', '케이크', 'Cake', (c) => [c.R(TAN, 12, 46, 76, 44, 5), c.R(PINK, 12, 46, 76, 16, 5), c.R(WHITE, 12, 66, 76, 5), c.R(BLUE, 30, 26, 6, 20), c.R(VIOLET, 47, 26, 6, 20), c.R(GREEN, 64, 26, 6, 20), c.O(ORANGE, 33, 18, 4, 7), c.O(ORANGE, 50, 18, 4, 7), c.O(ORANGE, 67, 18, 4, 7)]);

  // ── sports
  i('Soccer', '축구공', 'Soccer Ball', (c) => [c.O(PAPER, 50, 50, 44), c.P(DARK, 50, 32, 66, 44, 60, 62, 40, 62, 34, 44), c.B(SLATE, 50, 32, 50, 12, 4), c.B(SLATE, 66, 44, 86, 36, 4), c.B(SLATE, 60, 62, 72, 80, 4), c.B(SLATE, 40, 62, 28, 80, 4), c.B(SLATE, 34, 44, 14, 36, 4), c.P(DARK, 40, 7, 60, 7, 50, 16), c.P(DARK, 92, 40, 88, 60, 80, 42), c.P(DARK, 8, 40, 12, 60, 20, 42)]);
  i('Basketball', '농구공', 'Basketball', (c) => [c.O(ORANGE, 50, 50, 44), c.B(DARK, 50, 6, 50, 94, 4), c.B(DARK, 6, 50, 94, 50, 4), c.S(DARK, 'M22 16C36 34 36 66 22 84L18 80C30 64 30 36 18 20Z'), c.S(DARK, 'M78 16C64 34 64 66 78 84L82 80C70 64 70 36 82 20Z')]);
  i('Trophy', '트로피', 'Trophy', (c) => [c.G(AMBER, 22, 28, 15, 6), c.G(AMBER, 78, 28, 15, 6), c.S(YELLOW, 'M26 8L74 8L74 34C74 52 62 60 50 60C38 60 26 52 26 34Z'), c.R(AMBER, 44, 58, 12, 20), c.R(BROWN, 28, 78, 44, 14, 3), c.R(YELLOW, 40, 82, 20, 5)]);
  i('Medal', '메달', 'Medal', (c) => [c.P(BLUE, 22, 4, 44, 4, 56, 42, 40, 50), c.P(RED, 78, 4, 56, 4, 44, 42, 60, 50), c.O(AMBER, 50, 66, 28), c.O(YELLOW, 50, 66, 20), c.P(AMBER, 50, 52, 54, 62, 64, 62, 56, 69, 59, 79, 50, 73, 41, 79, 44, 69, 36, 62, 46, 62)]);
  i('Bicycle', '자전거', 'Bicycle', (c) => [c.G(SLATE, 22, 66, 20, 7), c.G(SLATE, 78, 66, 20, 7), c.B(RED, 22, 66, 42, 36, 6), c.B(RED, 42, 36, 68, 36, 6), c.B(RED, 68, 36, 48, 66, 6), c.B(RED, 22, 66, 48, 66, 6), c.B(ORANGE, 68, 36, 78, 66, 6), c.B(ORANGE, 66, 22, 70, 38, 5), c.R(DARK, 58, 16, 22, 7, 3), c.R(DARK, 34, 26, 18, 7, 3)]);
  i('Target', '과녁', 'Target', (c) => [c.O(RED, 46, 54, 40), c.O(WHITE, 46, 54, 28), c.O(RED, 46, 54, 16), c.B(DARK, 46, 54, 84, 16, 5), c.P(GREEN, 80, 6, 94, 6, 94, 20, 84, 20, 80, 16)]);
  i('Flag', '깃발', 'Flag', (c) => [c.R(SLATE, 16, 6, 7, 88, 3), c.P(RED, 23, 10, 86, 10, 72, 30, 86, 50, 23, 50), c.P(ORANGE, 23, 30, 72, 30, 86, 50, 23, 50), c.O(DARK, 19, 94, 12, 4)]);

  // ── tools
  i('Wrench', '렌치', 'Wrench', (c) => [c.B(GREY, 18, 82, 62, 38, 16), c.S(SLATE, 'M58 18C68 4 90 8 94 24L78 26L74 38L88 46C74 56 54 48 52 32C52 26 54 22 58 18Z'), c.O(DARK, 18, 82, 5)]);
  i('Hammer', '망치', 'Hammer', (c) => [c.B(BROWN, 22, 92, 58, 36, 12), c.P(SLATE, 30, 24, 54, 6, 88, 40, 66, 60), c.P(GREY, 54, 6, 66, 6, 92, 34, 88, 40), c.P(ORANGE, 42, 40, 50, 32, 58, 42, 50, 48)]);
  i('Gear', '톱니바퀴', 'Gear', (c) => [c.B(SLATE, 50, 4, 50, 96, 20), c.B(SLATE, 4, 50, 96, 50, 20), c.B(SLATE, 17, 17, 83, 83, 20), c.B(SLATE, 83, 17, 17, 83, 20), c.O(GREY, 50, 50, 32), c.O(CYAN, 50, 50, 14)]);
  i('Key', '열쇠', 'Key', (c) => [c.G(AMBER, 30, 34, 24, 11), c.B(YELLOW, 44, 50, 88, 92, 11), c.B(AMBER, 66, 72, 76, 62, 9), c.B(AMBER, 78, 84, 88, 74, 9)]);
  i('Lock', '자물쇠', 'Lock', (c) => [c.S(GREY, 'M24 46L24 30C24 -4 76 -4 76 30L76 46L64 46L64 30C64 12 36 12 36 30L36 46Z'), c.R(AMBER, 14, 42, 72, 52, 8), c.O(DARK, 50, 62, 8), c.R(DARK, 46, 62, 8, 18, 2)]);
  i('Magnifier', '돋보기', 'Magnifier', (c) => [c.B(BROWN, 62, 62, 92, 92, 13), c.O(CYAN, 40, 40, 30), c.G(SLATE, 40, 40, 34, 8), c.O(WHITE, 30, 30, 6)]);
  i('Bulb', '전구', 'Light Bulb', (c) => [c.S(YELLOW, 'M50 4C74 4 86 24 82 42C78 56 66 60 66 72L34 72C34 60 22 56 18 42C14 24 26 4 50 4Z'), c.R(GREY, 34, 72, 32, 8), c.R(SLATE, 37, 80, 26, 7), c.R(DARK, 42, 87, 16, 8, 3), c.B(ORANGE, 40, 36, 50, 48, 4), c.B(ORANGE, 60, 36, 50, 48, 4), c.B(ORANGE, 50, 48, 50, 70, 4)]);
  i('Battery', '전지', 'Battery', (c) => [c.R(SLATE, 4, 26, 84, 48, 7), c.R(SLATE, 86, 40, 10, 20, 2), c.R(PAPER, 10, 32, 72, 36, 3), c.R(GREEN, 14, 36, 18, 28), c.R(GREEN, 35, 36, 18, 28), c.R(LIME, 56, 36, 18, 28)]);
  i('Plug', '플러그', 'Plug', (c) => [c.R(GREY, 30, 6, 9, 26, 3), c.R(GREY, 61, 6, 9, 26, 3), c.S(SLATE, 'M18 30L82 30L82 48C82 66 66 72 58 72L58 94L42 94L42 72C34 72 18 66 18 48Z'), c.O(LIME, 50, 48, 7)]);

  // ── money and shopping
  i('Coin', '동전', 'Coin', (c) => [c.O(AMBER, 50, 50, 44), c.O(YELLOW, 50, 50, 34), c.R(AMBER, 44, 28, 12, 44, 2), c.R(BROWN, 36, 38, 28, 7, 2), c.R(BROWN, 36, 54, 28, 7, 2)]);
  i('Banknote', '지폐', 'Banknote', (c) => [c.R(DGREEN, 4, 22, 92, 56, 5), c.R(LIME, 10, 28, 80, 44, 3), c.O(GREEN, 50, 50, 16), c.O(YELLOW, 50, 50, 9), c.O(GREEN, 22, 50, 5), c.O(GREEN, 78, 50, 5)]);
  i('Card', '신용 카드', 'Credit Card', (c) => [c.R(BLUE, 4, 20, 92, 60, 8), c.R(DARK, 4, 34, 92, 14), c.R(YELLOW, 14, 58, 18, 12, 2), c.R(PAPER, 56, 60, 30, 7, 2)]);
  i('Cart', '장바구니', 'Shopping Cart', (c) => [c.B(SLATE, 6, 14, 22, 14, 6), c.B(SLATE, 22, 14, 34, 68, 6), c.P(ORANGE, 26, 24, 94, 24, 84, 56, 33, 56), c.R(SLATE, 32, 66, 54, 6), c.O(DARK, 40, 84, 8), c.O(DARK, 78, 84, 8)]);
  i('Gift', '선물', 'Gift', (c) => [c.R(RED, 12, 44, 76, 50, 4), c.R(DRED, 6, 30, 88, 18, 3), c.R(YELLOW, 43, 30, 14, 64), c.S(YELLOW, 'M50 30C36 30 20 22 28 10C36 2 46 18 50 30Z'), c.S(AMBER, 'M50 30C64 30 80 22 72 10C64 2 54 18 50 30Z')]);
  i('Diamond', '다이아몬드', 'Diamond', (c) => [c.P(CYAN, 22, 12, 78, 12, 96, 38, 50, 94, 4, 38), c.P(BLUE, 4, 38, 96, 38, 50, 94), c.P(WHITE, 34, 12, 66, 12, 72, 38, 28, 38), c.P(TEAL, 28, 38, 72, 38, 50, 94)]);
  i('Tag', '가격표', 'Price Tag', (c) => [c.P(ORANGE, 8, 8, 52, 8, 94, 50, 50, 94, 8, 52), c.O(WHITE, 26, 26, 8), c.B(DRED, 44, 50, 60, 66, 6), c.B(DRED, 54, 40, 70, 56, 6)]);

  // ── people
  i('Person', '사람', 'Person', (c) => [c.O(SKIN, 50, 28, 20), c.S(BLUE, 'M14 94C14 54 86 54 86 94Z'), c.S(BROWN, 'M30 26C30 2 70 2 70 26C60 16 40 16 30 26Z')]);
  i('Team', '팀', 'Team', (c) => [c.O(SKIN, 22, 40, 12), c.S(GREEN, 'M2 86C2 54 42 54 42 86Z'), c.O(SKIN, 78, 40, 12), c.S(ORANGE, 'M58 86C58 54 98 54 98 86Z'), c.O(SKIN, 50, 30, 15), c.S(BLUE, 'M22 92C22 48 78 48 78 92Z')]);
  i('Headset', '상담원', 'Support Agent', (c) => [c.O(SKIN, 50, 42, 26), c.S(DARK, 'M16 42C16 -4 84 -4 84 42L76 42C76 8 24 8 24 42Z'), c.R(BLUE, 10, 36, 13, 24, 5), c.R(BLUE, 77, 36, 13, 24, 5), c.S(VIOLET, 'M16 96C18 70 82 70 84 96Z'), c.B(DARK, 82, 58, 60, 68, 4)]);
  i('GradCap', '학사모', 'Graduation Cap', (c) => [c.P(NAVY, 24, 44, 76, 44, 76, 72, 50, 84, 24, 72), c.P(BLUE, 50, 14, 98, 38, 50, 62, 2, 38), c.B(YELLOW, 88, 42, 88, 72, 5), c.O(AMBER, 88, 76, 6)]);
  i('Crown', '왕관', 'Crown', (c) => [c.P(YELLOW, 8, 30, 30, 52, 50, 16, 70, 52, 92, 30, 84, 80, 16, 80), c.R(AMBER, 16, 74, 68, 12, 2), c.O(RED, 50, 58, 7), c.O(CYAN, 30, 64, 5), c.O(GREEN, 70, 64, 5)]);
  i('Smile', '웃는 얼굴', 'Smile', (c) => [c.O(YELLOW, 50, 50, 44), c.O(DARK, 34, 40, 6), c.O(DARK, 66, 40, 6), c.S(DRED, 'M26 58L74 58C72 92 28 92 26 58Z'), c.O(ORANGE, 20, 56, 6), c.O(ORANGE, 80, 56, 6)]);

  // ── devices
  i('Monitor', '모니터', 'Monitor', (c) => [c.R(SLATE, 6, 10, 88, 60, 6), c.R(CYAN, 12, 16, 76, 48, 2), c.P(WHITE, 18, 22, 44, 22, 18, 50), c.R(GREY, 42, 70, 16, 14), c.R(DARK, 26, 84, 48, 7, 3)]);
  i('Laptop', '노트북', 'Laptop', (c) => [c.R(SLATE, 16, 16, 68, 50, 5), c.R(BLUE, 21, 21, 58, 40, 2), c.P(GREY, 16, 66, 84, 66, 96, 84, 4, 84), c.R(DARK, 40, 72, 20, 5, 2), c.R(WHITE, 28, 30, 24, 5), c.R(CYAN, 28, 42, 36, 5)]);
  i('Smartphone', '스마트폰', 'Smartphone', (c) => [c.R(DARK, 26, 4, 48, 92, 8), c.R(CYAN, 31, 12, 38, 68, 2), c.O(GREY, 50, 88, 4), c.R(BLUE, 36, 18, 12, 12, 2), c.R(GREEN, 52, 18, 12, 12, 2), c.R(ORANGE, 36, 34, 12, 12, 2), c.R(PINK, 52, 34, 12, 12, 2)]);
  i('Camera', '카메라', 'Camera', (c) => [c.R(SLATE, 34, 14, 32, 18, 4), c.R(DARK, 6, 26, 88, 58, 8), c.O(GREY, 50, 55, 22), c.O(BLUE, 50, 55, 14), c.O(WHITE, 45, 50, 4), c.R(RED, 78, 34, 9, 7, 2)]);
  i('Gamepad', '게임 패드', 'Game Pad', (c) => [c.S(VIOLET, 'M26 26L74 26C90 26 98 62 92 76C86 86 74 76 68 64L32 64C26 76 14 86 8 76C2 62 10 26 26 26Z'), c.R(WHITE, 22, 40, 20, 6), c.R(WHITE, 29, 33, 6, 20), c.O(YELLOW, 66, 38, 5), c.O(GREEN, 76, 48, 5)]);
  i('Headphones', '헤드폰', 'Headphones', (c) => [c.S(SLATE, 'M8 60C8 0 92 0 92 60L82 60C82 16 18 16 18 60Z'), c.R(RED, 6, 54, 20, 36, 8), c.R(RED, 74, 54, 20, 36, 8), c.R(DRED, 20, 58, 8, 28, 3), c.R(DRED, 72, 58, 8, 28, 3)]);
  i('Clock', '시계', 'Clock', (c) => [c.O(BLUE, 50, 50, 44), c.O(PAPER, 50, 50, 35), c.R(DARK, 47, 22, 6, 30, 2), c.B(RED, 50, 50, 68, 62, 5), c.O(DARK, 50, 50, 5)]);

  // ── travel and places
  i('Car', '자동차', 'Car', (c) => [c.P(CYAN, 26, 22, 72, 22, 86, 50, 14, 50), c.R(RED, 4, 46, 92, 28, 8), c.O(DARK, 26, 76, 13), c.O(GREY, 26, 76, 6), c.O(DARK, 74, 76, 13), c.O(GREY, 74, 76, 6), c.R(YELLOW, 88, 54, 7, 8, 2)]);
  i('Bus', '버스', 'Bus', (c) => [c.R(AMBER, 10, 8, 80, 72, 9), c.R(CYAN, 18, 18, 64, 28, 3), c.B(SLATE, 50, 18, 50, 46, 3), c.R(WHITE, 16, 58, 14, 9, 3), c.R(WHITE, 70, 58, 14, 9, 3), c.R(DARK, 18, 78, 16, 16, 4), c.R(DARK, 66, 78, 16, 16, 4)]);
  i('Plane', '비행기', 'Airplane', (c) => [c.P(BLUE, 46, 44, 12, 26, 6, 32, 34, 58), c.P(BLUE, 56, 54, 74, 88, 68, 94, 42, 66), c.P(NAVY, 20, 70, 8, 62, 4, 66, 18, 82, 34, 96, 38, 92, 30, 80), c.S(GREY, 'M86 6C94 4 96 8 94 14C90 26 50 66 28 78L22 72C34 50 74 10 86 6Z')]);
  i('Ship', '배', 'Ship', (c) => [c.R(RED, 56, 8, 14, 22), c.R(PAPER, 28, 28, 50, 22), c.R(CYAN, 36, 34, 10, 9), c.R(CYAN, 56, 34, 10, 9), c.P(NAVY, 6, 50, 94, 50, 82, 78, 18, 78), c.S(BLUE, 'M4 82C14 74 24 74 34 82C44 90 56 90 66 82C76 74 86 74 96 82L96 94L4 94Z')]);
  i('Rocket', '로켓', 'Rocket', (c) => [c.P(ORANGE, 38, 74, 62, 74, 50, 98), c.P(RED, 26, 52, 40, 42, 40, 74, 18, 80), c.P(RED, 74, 52, 60, 42, 60, 74, 82, 80), c.S(PAPER, 'M50 2C68 16 68 50 62 76L38 76C32 50 32 16 50 2Z'), c.O(CYAN, 50, 36, 9), c.S(RED, 'M50 2C58 8 62 14 64 22L36 22C38 14 42 8 50 2Z')]);
  i('MapPin', '위치 핀', 'Map Pin', (c) => [c.O(GREY, 50, 92, 22, 6), c.S(RED, 'M50 4C78 4 88 28 82 44C76 60 58 76 50 92C42 76 24 60 18 44C12 28 22 4 50 4Z'), c.O(WHITE, 50, 36, 14), c.O(DRED, 50, 36, 6)]);
  i('Compass', '나침반', 'Compass', (c) => [c.O(BROWN, 50, 50, 44), c.O(PAPER, 50, 50, 35), c.P(RED, 50, 50, 70, 30, 56, 56), c.P(BLUE, 50, 50, 30, 70, 44, 44), c.O(DARK, 50, 50, 5), c.R(YELLOW, 45, 2, 10, 8, 2)]);
  i('Suitcase', '여행 가방', 'Suitcase', (c) => [c.S(SLATE, 'M34 28L34 8L66 8L66 28L58 28L58 16L42 16L42 28Z'), c.R(ORANGE, 14, 26, 72, 62, 8), c.R(AMBER, 26, 26, 8, 62), c.R(AMBER, 66, 26, 8, 62), c.O(DARK, 28, 92, 6), c.O(DARK, 72, 92, 6)]);
  i('House', '집', 'House', (c) => [c.R(BROWN, 68, 10, 12, 26), c.P(RED, 50, 6, 96, 48, 4, 48), c.R(YELLOW, 16, 46, 68, 48), c.R(BROWN, 42, 62, 18, 32, 2), c.R(CYAN, 22, 56, 14, 14), c.R(CYAN, 66, 56, 12, 14)]);
  i('Building', '빌딩', 'Office Building', (c) => [c.R(SLATE, 18, 6, 44, 88, 3), c.R(GREY, 62, 38, 22, 56, 3), c.R(CYAN, 26, 16, 10, 12), c.R(CYAN, 44, 16, 10, 12), c.R(CYAN, 26, 36, 10, 12), c.R(CYAN, 44, 36, 10, 12), c.R(YELLOW, 26, 56, 10, 12), c.R(CYAN, 44, 56, 10, 12), c.R(WHITE, 68, 48, 10, 8), c.R(WHITE, 68, 64, 10, 8), c.R(BROWN, 34, 76, 14, 18)]);

  // ── signs and symbols
  i('Check', '확인', 'Check', (c) => [c.O(GREEN, 50, 50, 44), c.P(WHITE, 26, 50, 36, 40, 46, 52, 68, 28, 78, 38, 46, 72)]);
  i('Cross', '취소', 'Cancel', (c) => [c.O(RED, 50, 50, 44), c.B(WHITE, 32, 32, 68, 68, 13), c.B(WHITE, 68, 32, 32, 68, 13)]);
  i('Warning', '경고', 'Warning', (c) => [c.P(DARK, 50, 4, 98, 92, 2, 92), c.P(YELLOW, 50, 16, 86, 86, 14, 86), c.R(DARK, 45, 36, 10, 28, 3), c.O(DARK, 50, 75, 6)]);
  i('Info', '정보', 'Information', (c) => [c.O(BLUE, 50, 50, 44), c.O(WHITE, 50, 28, 8), c.R(WHITE, 43, 42, 14, 36, 3)]);
  i('Question', '질문', 'Question', (c) => [c.O(VIOLET, 50, 50, 44), c.S(WHITE, 'M30 38C30 12 72 10 72 36C72 52 56 52 56 66L44 66C44 44 60 46 60 36C60 24 42 26 42 38Z'), c.O(WHITE, 50, 78, 7)]);
  i('Heart', '하트', 'Heart', (c) => [c.S(RED, 'M50 92C24 72 4 54 6 30C8 10 36 4 50 26C64 4 92 10 94 30C96 54 76 72 50 92Z'), c.O(PINK, 28, 28, 9)]);
  i('Star', '별', 'Star', (c) => [c.P(YELLOW, 50, 4, 63, 36, 98, 38, 71, 60, 80, 94, 50, 75, 20, 94, 29, 60, 2, 38, 37, 36), c.P(AMBER, 50, 4, 50, 75, 20, 94, 29, 60, 2, 38, 37, 36)]);
  i('Plus', '더하기', 'Plus', (c) => [c.O(TEAL, 50, 50, 44), c.R(WHITE, 43, 24, 14, 52, 3), c.R(WHITE, 24, 43, 52, 14, 3)]);
  i('Shield', '방패', 'Shield', (c) => [c.S(BLUE, 'M50 4L90 18C92 52 78 80 50 96C22 80 8 52 10 18Z'), c.S(NAVY, 'M50 4L50 96C22 80 8 52 10 18Z'), c.P(WHITE, 30, 50, 38, 42, 46, 52, 64, 30, 72, 38, 46, 68)]);
  i('NoEntry', '진입 금지', 'No Entry', (c) => [c.O(RED, 50, 50, 44), c.R(WHITE, 18, 41, 64, 18, 3), c.G(DRED, 50, 50, 44, 4)]);
  i('Fire', '불', 'Fire', (c) => [c.S(RED, 'M50 2C56 26 84 38 84 64C84 84 68 96 50 96C32 96 16 84 16 64C16 50 26 42 30 30C36 38 38 42 42 44C46 32 44 16 50 2Z'), c.S(ORANGE, 'M52 34C56 50 72 56 72 72C72 86 62 94 50 94C38 94 28 86 28 72C28 62 36 56 38 50C42 54 44 56 46 56C50 48 50 42 52 34Z'), c.S(YELLOW, 'M50 62C54 70 60 72 60 80C60 88 56 92 50 92C44 92 40 88 40 80C40 74 46 70 50 62Z')]);
  i('Hourglass', '모래시계', 'Hourglass', (c) => [c.P(CYAN, 22, 12, 78, 12, 54, 50, 78, 88, 22, 88, 46, 50), c.P(AMBER, 34, 26, 66, 26, 50, 48), c.P(AMBER, 26, 88, 74, 88, 50, 66), c.R(BROWN, 14, 4, 72, 9, 3), c.R(BROWN, 14, 87, 72, 9, 3)]);
  i('Music', '음표', 'Music Note', (c) => [c.R(VIOLET, 32, 14, 7, 62), c.R(VIOLET, 74, 8, 7, 62), c.P(PINK, 32, 14, 81, 6, 81, 22, 32, 30), c.O(VIOLET, 26, 78, 13, 10), c.O(VIOLET, 68, 72, 13, 10)]);
  i('Bookmark', '책갈피', 'Bookmark', (c) => [c.P(RED, 22, 4, 78, 4, 78, 96, 50, 74, 22, 96), c.P(DRED, 22, 4, 50, 4, 50, 74, 22, 96), c.P(YELLOW, 50, 18, 55, 30, 68, 31, 58, 40, 61, 53, 50, 46, 39, 53, 42, 40, 32, 31, 45, 30)]);
  i('Refresh', '새로 고침', 'Refresh', (c) => [c.S(GREEN, 'M82 40C74 14 36 10 20 32L8 22L8 56L42 56L30 44C38 30 62 30 68 44Z'), c.S(TEAL, 'M18 60C26 86 64 90 80 68L92 78L92 44L58 44L70 56C62 70 38 70 32 56Z')]);
  // 120 in all: the stencil's rows come out full at 2, 3, 4, 5 and 6 columns.
  i('Sailboat', '돛단배', 'Sailboat', (c) => [c.P(WHITE, 48, 10, 48, 62, 16, 62), c.P(CYAN, 54, 18, 84, 62, 54, 62), c.R(BROWN, 48, 8, 5, 62), c.P(RED, 12, 68, 88, 68, 76, 86, 24, 86), c.R(BLUE, 6, 86, 88, 8, 4)]);
  i('Cactus', '선인장', 'Cactus', (c) => [c.R(GREEN, 40, 14, 20, 66, 10), c.R(GREEN, 16, 34, 12, 26, 6), c.R(GREEN, 16, 52, 28, 11, 5), c.R(DGREEN, 72, 26, 12, 26, 6), c.R(DGREEN, 56, 44, 28, 11, 5), c.P(TAN, 28, 78, 72, 78, 66, 96, 34, 96)]);
  i('Mushroom', '버섯', 'Mushroom', (c) => [c.R(PAPER, 38, 52, 24, 42, 8), c.S(RED, 'M8 56C8 22 30 8 50 8C70 8 92 22 92 56Z'), c.O(WHITE, 34, 32, 8), c.O(WHITE, 62, 26, 6), c.O(WHITE, 72, 44, 6)]);
  i('Balloon', '풍선', 'Balloon', (c) => [c.O(PINK, 50, 38, 30, 34), c.O(WHITE, 40, 26, 6, 9), c.P(DRED, 44, 72, 56, 72, 50, 80), c.B(GREY, 50, 80, 44, 96, 3)]);
  i('Candle', '양초', 'Candle', (c) => [c.R(VIOLET, 36, 40, 28, 46, 3), c.R(WHITE, 36, 54, 28, 5), c.R(BROWN, 48, 30, 4, 11), c.S(ORANGE, 'M50 4C60 16 60 26 50 32C40 26 40 16 50 4Z'), c.S(YELLOW, 'M50 14C54 20 54 26 50 30C46 26 46 20 50 14Z'), c.R(TAN, 24, 84, 52, 10, 4)]);
  i('Cookie', '쿠키', 'Cookie', (c) => [c.O(TAN, 50, 50, 44), c.O(BROWN, 34, 34, 7), c.O(BROWN, 62, 28, 6), c.O(BROWN, 70, 58, 8), c.O(BROWN, 40, 66, 7), c.O(BROWN, 52, 46, 4)]);
  i('IceCream', '아이스크림', 'Ice Cream', (c) => [c.P(TAN, 30, 50, 70, 50, 50, 98), c.P(BROWN, 44, 50, 56, 50, 50, 78), c.O(PINK, 50, 32, 26), c.O(CYAN, 36, 42, 15), c.O(YELLOW, 64, 42, 15), c.O(RED, 50, 8, 6)]);
  i('Watermelon', '수박', 'Watermelon', (c) => [c.S(GREEN, 'M4 36L96 36C96 70 74 92 50 92C26 92 4 70 4 36Z'), c.S(RED, 'M14 36L86 36C86 62 68 82 50 82C32 82 14 62 14 36Z'), c.O(DARK, 34, 52, 4, 6), c.O(DARK, 50, 62, 4, 6), c.O(DARK, 66, 52, 4, 6)]);
  i('Dice', '주사위', 'Dice', (c) => [c.R(RED, 10, 10, 80, 80, 14), c.O(WHITE, 30, 30, 8), c.O(WHITE, 70, 30, 8), c.O(WHITE, 50, 50, 8), c.O(WHITE, 30, 70, 8), c.O(WHITE, 70, 70, 8)]);
  i('Puzzle', '퍼즐', 'Puzzle', (c) => [c.R(BLUE, 12, 28, 60, 60, 4), c.O(BLUE, 42, 24, 13), c.O(BLUE, 76, 58, 13), c.O(WHITE, 42, 94, 13), c.O(WHITE, 8, 58, 13), c.R(CYAN, 12, 74, 60, 14, 4)]);
  i('Magnet', '자석', 'Magnet', (c) => [c.S(RED, 'M12 10L36 10L36 50C36 72 64 72 64 50L64 10L88 10L88 52C88 104 12 104 12 52Z'), c.R(GREY, 12, 10, 24, 18), c.R(GREY, 64, 10, 24, 18)]);
  i('Flask', '플라스크', 'Flask', (c) => [c.P(PAPER, 40, 6, 60, 6, 60, 36, 88, 88, 80, 96, 20, 96, 12, 88, 40, 36), c.P(GREEN, 30, 56, 70, 56, 88, 88, 80, 96, 20, 96, 12, 88), c.O(LIME, 42, 74, 6), c.O(LIME, 60, 82, 4), c.R(SLATE, 34, 2, 32, 8, 3)]);
  i('Robot', '로봇', 'Robot', (c) => [c.R(GREY, 18, 26, 64, 52, 10), c.O(CYAN, 36, 48, 9), c.O(CYAN, 64, 48, 9), c.R(SLATE, 36, 64, 28, 6, 2), c.R(SLATE, 47, 10, 6, 16), c.O(RED, 50, 8, 6), c.R(SLATE, 6, 40, 12, 22, 4), c.R(SLATE, 82, 40, 12, 22, 4), c.R(BLUE, 34, 78, 32, 16, 4)]);
  i('Snowman', '눈사람', 'Snowman', (c) => [c.O(CYAN, 50, 68, 30), c.O(PAPER, 50, 68, 27), c.O(CYAN, 50, 30, 21), c.O(WHITE, 50, 30, 18), c.O(DARK, 43, 26, 3), c.O(DARK, 57, 26, 3), c.P(ORANGE, 48, 32, 52, 32, 66, 36, 50, 38), c.R(RED, 30, 46, 40, 7, 3), c.O(DARK, 50, 64, 3), c.O(DARK, 50, 78, 3)]);
  i('Lighthouse', '등대', 'Lighthouse', (c) => [c.P(RED, 38, 34, 62, 34, 70, 86, 30, 86), c.P(WHITE, 36, 48, 64, 48, 66, 62, 34, 62), c.R(DARK, 36, 26, 28, 8), c.R(YELLOW, 40, 12, 20, 14), c.P(DARK, 36, 12, 64, 12, 50, 2), c.P(YELLOW, 40, 16, 4, 6, 4, 30, 40, 22), c.P(YELLOW, 60, 16, 96, 6, 96, 30, 60, 22), c.R(BLUE, 8, 86, 84, 10, 4)]);
  i('Kite', '연', 'Kite', (c) => [c.P(RED, 58, 4, 90, 36, 58, 68, 26, 36), c.P(YELLOW, 58, 4, 58, 68, 26, 36), c.B(WHITE, 58, 4, 58, 68, 3), c.B(WHITE, 26, 36, 90, 36, 3), c.B(SLATE, 58, 68, 30, 92, 3), c.P(CYAN, 38, 76, 48, 72, 46, 86), c.P(PINK, 24, 86, 34, 82, 32, 96)]);
  i('Bee', '꿀벌', 'Bee', (c) => [c.O(CYAN, 38, 28, 16, 20), c.O(CYAN, 64, 28, 16, 20), c.O(AMBER, 50, 60, 32, 24), c.R(DARK, 36, 37, 9, 46), c.R(DARK, 56, 37, 9, 46), c.O(DARK, 22, 58, 11), c.O(WHITE, 19, 55, 3), c.P(DARK, 82, 56, 96, 60, 82, 66)]);
  i('Paintbrush', '붓', 'Paintbrush', (c) => [c.B(BROWN, 88, 10, 42, 56, 12), c.B(GREY, 44, 54, 34, 64, 16), c.S(BLUE, 'M36 56C44 62 46 70 40 78C32 90 16 92 6 90C14 84 14 76 18 68C22 60 30 54 36 56Z')]);
  i('Palette', '팔레트', 'Palette', (c) => [c.S(TAN, 'M50 6C78 6 96 26 96 48C96 66 80 68 70 66C60 64 56 72 60 80C64 90 56 94 48 94C22 94 4 74 4 50C4 26 24 6 50 6Z'), c.O(RED, 30, 32, 8), c.O(YELLOW, 52, 22, 8), c.O(GREEN, 74, 34, 8), c.O(BLUE, 24, 56, 8), c.O(VIOLET, 38, 76, 8)]);
  i('Ladybug', '무당벌레', 'Ladybug', (c) => [c.O(DARK, 50, 22, 16), c.O(RED, 50, 58, 36, 36), c.R(DARK, 48, 24, 4, 70), c.O(DARK, 32, 46, 7), c.O(DARK, 68, 46, 7), c.O(DARK, 30, 72, 7), c.O(DARK, 70, 72, 7), c.O(WHITE, 44, 18, 3), c.O(WHITE, 56, 18, 3)]);
}
