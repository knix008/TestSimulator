// Still more masters: extras for every stencil, and the DFD, Genogram, Maps, Transport,
// Factory, Education, Medical, Interior, Math, Strategy, C4 and Agile stencils.
// stencils.js calls addExtraMasters with its own `m` and drawing helpers. A shape is drawn
// through `g`, whose positions are fractions of the shape's box, so it fits any size.

export function addExtraMasters(m, H) {
  const { main, line, dark, light, solid, poly, rect, ell, circle, M, L, f, BELOW, SIDES_AND_CORNERS, ENDS } = H;
  const context = (w, h) => ({
    w, h,
    box: (x, y, bw, bh, r = 0) => rect(x * w, y * h, bw * w, bh * h, r),
    oval: (cx, cy, rx, ry = rx) => ell((cx - rx) * w, (cy - ry) * h, 2 * rx * w, 2 * ry * h),
    dot: (cx, cy, r) => circle(cx * w, cy * h, r * Math.min(w, h)),
    pol: (...pts) => poly(pts.map(([x, y]) => [x * w, y * h])),
    open: (...pts) => pts.map(([x, y], i) => (i ? L : M)(x * w, y * h)).join(''),
    seg: (...list) => list.map(([a, b, c, d]) => `${M(a * w, b * h)}${L(c * w, d * h)}`).join(''),
    arc: (x1, y1, rx, ry, x2, y2, large = 0, sweep = 1) => `${M(x1 * w, y1 * h)}A${f(rx * w)} ${f(ry * h)} 0 ${large} ${sweep} ${f(x2 * w)} ${f(y2 * h)}`,
  });
  /** A name outside the shape needs room on small shapes, and the page's text colour rather than the fill's. */
  const fitText = (w, h, extra) => {
    const out = { ...extra };
    if (out.text === BELOW && (w < 90 || h < 50)) {
      const side = Math.max(0.6, 45 / w - 0.5);
      out.text = [-side, 1.06, 1 + side, 1.06 + Math.max(0.56, 24 / h)];
    }
    const box = out.text;
    const outside = box && !out.textHeader && (box[1] >= 1 || box[3] <= 0 || box[0] >= 1 || box[2] <= 0);
    if (outside && !out.style?.textColor) out.qs = 'subtle';
    return out;
  };
  const d = (id, cat, w, h, ko, en, draw, extra = {}) => m(id, cat, w, h, ko, en, (W, HH) => draw(context(W, HH)), fitText(w, h, extra));
  const sub = { qs: 'subtle' };
  const below = { text: BELOW, qs: 'subtle' };

  // ───────────────────────── basic
  d('basSemicircle', 'basic', 120, 60, '반원', 'Semicircle', (g) => [main(`${g.arc(0, 1, 0.5, 1, 1, 1)}Z`)], { text: [0.15, 0.3, 0.85, 1] });
  d('basQuarter', 'basic', 90, 90, '사분원', 'Quarter Circle', (g) => [main(`${M(0, g.h)}V0A${f(g.w)} ${f(g.h)} 0 0 1 ${f(g.w)} ${f(g.h)}Z`)], { text: [0.05, 0.4, 0.7, 1] });
  d('basPie', 'basic', 100, 100, '파이', 'Pie', (g) => [main(`${M(g.w / 2, g.h / 2)}L${f(g.w)} ${f(g.h / 2)}A${f(g.w / 2)} ${f(g.h / 2)} 0 1 1 ${f(g.w / 2)} 0Z`)], { aspect: true, text: BELOW });
  d('basArch', 'basic', 100, 110, '아치', 'Arch', (g) => [main(`${M(0, g.h)}V${f(g.h * 0.45)}A${f(g.w / 2)} ${f(g.h * 0.45)} 0 0 1 ${f(g.w)} ${f(g.h * 0.45)}V${f(g.h)}H${f(g.w * 0.72)}V${f(g.h * 0.45)}A${f(g.w * 0.22)} ${f(g.h * 0.2)} 0 0 0 ${f(g.w * 0.28)} ${f(g.h * 0.45)}V${f(g.h)}Z`)], { text: BELOW });
  d('basDrop', 'basic', 80, 110, '물방울', 'Teardrop', (g) => [main(`${M(g.w / 2, 0)}C${f(g.w * 0.6)} ${f(g.h * 0.25)} ${f(g.w)} ${f(g.h * 0.4)} ${f(g.w)} ${f(g.h * 0.65)}A${f(g.w / 2)} ${f(g.h * 0.35)} 0 0 1 0 ${f(g.h * 0.65)}C0 ${f(g.h * 0.4)} ${f(g.w * 0.4)} ${f(g.h * 0.25)} ${f(g.w / 2)} 0Z`)], { text: [0.15, 0.45, 0.85, 0.95] });
  d('basBevel', 'basic', 120, 80, '입체 단추', 'Bevel', (g) => [main(g.box(0, 0, 1, 1)), light(g.pol([0, 0], [1, 0], [0.9, 0.14], [0.1, 0.14])), dark(g.pol([1, 0], [1, 1], [0.9, 0.86], [0.9, 0.14])), dark(g.pol([0, 1], [1, 1], [0.9, 0.86], [0.1, 0.86])), light(g.pol([0, 0], [0, 1], [0.1, 0.86], [0.1, 0.14]))], { text: [0.1, 0.14, 0.9, 0.86] });
  d('basFolded', 'basic', 110, 90, '접힌 모서리', 'Folded Corner', (g) => [main(g.pol([0, 0], [1, 0], [1, 0.72], [0.76, 1], [0, 1])), dark(g.pol([1, 0.72], [0.76, 0.72], [0.76, 1]))]);
  d('basNo', 'basic', 90, 90, '금지', 'No Symbol', (g) => [main(`${g.oval(0.5, 0.5, 0.5)}${g.oval(0.5, 0.5, 0.36)}`), solid(g.pol([0.2, 0.28], [0.28, 0.2], [0.8, 0.72], [0.72, 0.8]))], { aspect: true, text: BELOW });
  d('basX', 'basic', 90, 90, '곱하기', 'Multiply', (g) => [main(g.pol([0.2, 0], [0.5, 0.3], [0.8, 0], [1, 0.2], [0.7, 0.5], [1, 0.8], [0.8, 1], [0.5, 0.7], [0.2, 1], [0, 0.8], [0.3, 0.5], [0, 0.2]))], { aspect: true, text: BELOW });
  d('basPlus', 'basic', 90, 90, '더하기', 'Plus', (g) => [main(g.pol([0.36, 0], [0.64, 0], [0.64, 0.36], [1, 0.36], [1, 0.64], [0.64, 0.64], [0.64, 1], [0.36, 1], [0.36, 0.64], [0, 0.64], [0, 0.36], [0.36, 0.36]))], { aspect: true, text: BELOW });
  d('basSnip', 'basic', 120, 80, '모서리 잘린 사각형', 'Snipped Rectangle', (g) => [main(g.pol([0, 0], [0.82, 0], [1, 0.26], [1, 1], [0, 1]))]);
  d('basRoundTop', 'basic', 120, 80, '위 둥근 사각형', 'Round Top Rectangle', (g) => [main(`${M(0, g.h)}V${f(g.h * 0.3)}Q0 0 ${f(g.w * 0.2)} 0H${f(g.w * 0.8)}Q${f(g.w)} 0 ${f(g.w)} ${f(g.h * 0.3)}V${f(g.h)}Z`)]);
  d('basStar3', 'basic', 100, 100, '별 3', '3-Point Star', (g) => [main(g.pol([0.5, 0], [0.62, 0.55], [1, 0.9], [0.5, 0.72], [0, 0.9], [0.38, 0.55]))], { text: BELOW });

  // ───────────────────────── arrows
  d('arrDouble', 'arrows', 130, 70, '이중 갈매기형', 'Double Chevron', (g) => [main(g.pol([0, 0], [0.3, 0], [0.55, 0.5], [0.3, 1], [0, 1], [0.25, 0.5])), main(g.pol([0.4, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0.4, 1], [0.65, 0.5]))], { points: ENDS, text: BELOW });
  d('arrDiagUp', 'arrows', 100, 100, '오른쪽 위 화살표', 'Up-Right Arrow', (g) => [main(g.pol([0.35, 0], [1, 0], [1, 0.65], [0.76, 0.42], [0.2, 1], [0, 0.8], [0.58, 0.24]))], { points: [[1, 0], [0.1, 0.9]], text: BELOW });
  d('arrDiagDown', 'arrows', 100, 100, '오른쪽 아래 화살표', 'Down-Right Arrow', (g) => [main(g.pol([0.2, 0], [0.76, 0.58], [1, 0.35], [1, 1], [0.35, 1], [0.58, 0.76], [0, 0.2]))], { points: [[1, 1], [0.1, 0.1]], text: BELOW });
  d('arrT', 'arrows', 130, 90, 'T자 화살표', 'T Arrow', (g) => [main(g.pol([0, 0.25], [0.15, 0], [0.15, 0.12], [0.85, 0.12], [0.85, 0], [1, 0.25], [0.85, 0.5], [0.85, 0.38], [0.6, 0.38], [0.6, 0.72], [0.72, 0.72], [0.5, 1], [0.28, 0.72], [0.4, 0.72], [0.4, 0.38], [0.15, 0.38], [0.15, 0.5]))], { points: [[0, 0.25], [1, 0.25], [0.5, 1]], text: BELOW });
  d('arrFork', 'arrows', 120, 100, '갈라지는 화살표', 'Split Arrow', (g) => [main(g.pol([0, 0.4], [0.4, 0.4], [0.4, 0.14], [0.72, 0.14], [0.72, 0], [1, 0.22], [0.72, 0.44], [0.72, 0.3], [0.54, 0.3], [0.54, 0.7], [0.72, 0.7], [0.72, 0.56], [1, 0.78], [0.72, 1], [0.72, 0.86], [0.4, 0.86], [0.4, 0.6], [0, 0.6]))], { points: [[0, 0.5], [1, 0.22], [1, 0.78]], text: BELOW });
  d('arrMerge', 'arrows', 120, 100, '합쳐지는 화살표', 'Merge Arrow', (g) => [main(g.pol([0, 0.14], [0.46, 0.14], [0.46, 0.4], [0.72, 0.4], [0.72, 0.24], [1, 0.5], [0.72, 0.76], [0.72, 0.6], [0.46, 0.6], [0.46, 0.86], [0, 0.86], [0, 0.7], [0.32, 0.7], [0.32, 0.3], [0, 0.3]))], { points: [[0, 0.22], [0, 0.78], [1, 0.5]], text: BELOW });
  d('arrCornerUp', 'arrows', 100, 100, '위로 꺾인 화살표', 'Up Corner Arrow', (g) => [main(g.pol([0, 0.7], [0.62, 0.7], [0.62, 0.28], [0.42, 0.28], [0.76, 0], [1, 0.28], [0.86, 0.28], [0.86, 1], [0, 1]))], { points: [[0, 0.85], [0.75, 0]], text: BELOW });
  d('arrBox', 'arrows', 150, 70, '설명 화살표', 'Arrow Callout', (g) => [main(g.pol([0, 0], [0.68, 0], [0.68, 0.3], [0.82, 0.3], [0.82, 0.08], [1, 0.5], [0.82, 0.92], [0.82, 0.7], [0.68, 0.7], [0.68, 1], [0, 1]))], { points: [[0, 0.5], [1, 0.5], [0.34, 0], [0.34, 1]], text: [0, 0, 0.68, 1] });
  d('arrBothCurve', 'arrows', 130, 80, '순환 양방향', 'Exchange Arrows', (g) => [main(g.pol([0, 0.28], [0.76, 0.28], [0.76, 0.08], [1, 0.34], [0.76, 0.56], [0.76, 0.42], [0, 0.42])), main(g.pol([1, 0.72], [0.24, 0.72], [0.24, 0.92], [0, 0.66], [0.24, 0.44], [0.24, 0.58], [1, 0.58]))], { points: ENDS, text: BELOW });
  d('arrZigzag', 'arrows', 130, 90, '지그재그 화살표', 'Zigzag Arrow', (g) => [main(g.pol([0, 0.1], [0.5, 0.1], [0.5, 0.56], [0.76, 0.56], [0.76, 0.34], [1, 0.68], [0.76, 1], [0.76, 0.8], [0.3, 0.8], [0.3, 0.34], [0, 0.34]))], { points: [[0, 0.22], [1, 0.68]], text: BELOW });
  d('arrThick', 'arrows', 150, 60, '넓은 화살표', 'Wide Arrow', (g) => [main(g.pol([0, 0.12], [0.8, 0.12], [0.8, 0], [1, 0.5], [0.8, 1], [0.8, 0.88], [0, 0.88]))], { points: ENDS, text: [0, 0.12, 0.8, 0.88] });
  d('arrThin', 'arrows', 150, 30, '가는 화살표', 'Thin Arrow', (g) => [main(g.pol([0, 0.4], [0.86, 0.4], [0.86, 0], [1, 0.5], [0.86, 1], [0.86, 0.6], [0, 0.6]))], { points: ENDS, text: BELOW });

  // ───────────────────────── flowchart
  d('fcDatabase', 'flowchart', 90, 90, '데이터베이스', 'Database', (g) => [main(`${M(0, g.h * 0.12)}V${f(g.h * 0.88)}A${f(g.w / 2)} ${f(g.h * 0.12)} 0 0 0 ${f(g.w)} ${f(g.h * 0.88)}V${f(g.h * 0.12)}A${f(g.w / 2)} ${f(g.h * 0.12)} 0 0 0 0 ${f(g.h * 0.12)}Z`), line(g.arc(0, 0.12, 0.5, 0.12, 1, 0.12, 0, 0))], { text: [0, 0.26, 1, 1] });
  d('fcMultiProcess', 'flowchart', 130, 80, '여러 프로세스', 'Multiple Processes', (g) => [main(g.box(0.12, 0, 0.88, 0.8)), main(g.box(0.06, 0.1, 0.88, 0.8)), main(g.box(0, 0.2, 0.88, 0.8))], { text: [0, 0.2, 0.88, 1] });
  d('fcDeck', 'flowchart', 120, 80, '카드 묶음', 'Card Deck', (g) => [main(g.pol([0.2, 0], [1, 0], [1, 0.8], [0.12, 0.8], [0.12, 0.24])), main(g.pol([0.08, 0.14], [0.88, 0.14], [0.88, 1], [0, 1], [0, 0.38]))], { text: [0, 0.3, 0.88, 1] });
  d('fcHourglass', 'flowchart', 70, 90, '대기', 'Wait', (g) => [main(g.pol([0, 0], [1, 0], [0.56, 0.5], [1, 1], [0, 1], [0.44, 0.5]))], { text: BELOW });
  d('fcComment', 'flowchart', 130, 70, '설명 말풍선', 'Comment', (g) => [main(g.pol([0, 0], [1, 0], [1, 0.76], [0.36, 0.76], [0.16, 1], [0.18, 0.76], [0, 0.76]))], { text: [0, 0, 1, 0.76] });
  d('fcKeyboard', 'flowchart', 120, 70, '키보드 입력', 'Keyboard Input', (g) => [main(g.box(0, 0.25, 1, 0.75, 5)), line(g.seg([0.1, 0.45, 0.9, 0.45], [0.1, 0.62, 0.9, 0.62], [0.25, 0.8, 0.75, 0.8])), line(g.open([0.5, 0.25], [0.5, 0.05]))], { text: BELOW, qs: 'subtle' });
  d('fcEvent', 'flowchart', 130, 70, '이벤트', 'Event', (g) => [main(g.box(0, 0, 1, 1, 12)), line(g.box(0.04, 0.08, 0.92, 0.84, 9))], { text: [0.05, 0.08, 0.95, 0.92] });
  d('fcLoopEnd', 'flowchart', 130, 70, '반복 끝', 'Loop End', (g) => [main(g.pol([0, 0], [1, 0], [1, 0.7], [0.85, 1], [0.15, 1], [0, 0.7]))]);
  d('fcSwitch', 'flowchart', 130, 90, '분기 선택', 'Switch', (g) => [main(g.pol([0.14, 0], [0.86, 0], [1, 0.5], [0.86, 1], [0.14, 1], [0, 0.5])), line(g.seg([0.14, 0, 0.14, 1], [0.86, 0, 0.86, 1]))], { text: [0.14, 0, 0.86, 1] });
  d('fcError', 'flowchart', 130, 70, '오류 처리', 'Error Handler', (g) => [main(g.pol([0.12, 0], [1, 0], [0.88, 1], [0, 1])), solid(g.pol([0.42, 0.72], [0.56, 0.42], [0.5, 0.42], [0.6, 0.18], [0.46, 0.5], [0.52, 0.5]))], { text: BELOW, style: { fill: '#fde8e8', line: '#c0392b' } });

  // ───────────────────────── callouts & text
  d('callDown', 'callouts', 150, 90, '아래 화살표 설명선', 'Down Arrow Callout', (g) => [main(g.pol([0, 0], [1, 0], [1, 0.62], [0.62, 0.62], [0.62, 0.76], [0.74, 0.76], [0.5, 1], [0.26, 0.76], [0.38, 0.76], [0.38, 0.62], [0, 0.62]))], { text: [0, 0, 1, 0.62], points: [[0.5, 0], [1, 0.31], [0.5, 1], [0, 0.31]] });
  d('callSide', 'callouts', 150, 80, '오른쪽 말풍선', 'Right Speech Bubble', (g) => [main(`${g.box(0, 0, 0.86, 1, 10)}${g.pol([0.86, 0.3], [1, 0.5], [0.86, 0.66])}`)], { text: [0, 0, 0.86, 1] });
  d('callLeftBubble', 'callouts', 150, 80, '왼쪽 말풍선', 'Left Speech Bubble', (g) => [main(`${g.box(0.14, 0, 0.86, 1, 10)}${g.pol([0.14, 0.3], [0, 0.5], [0.14, 0.66])}`)], { text: [0.14, 0, 1, 1] });
  d('callQuote', 'callouts', 180, 90, '인용', 'Quote', (g) => [main(g.box(0, 0, 1, 1)), solid(g.box(0, 0, 0.03, 1))], { text: [0.05, 0, 1, 1], qs: 'subtle' });
  d('callNumber', 'callouts', 44, 44, '번호 표시', 'Number Badge', (g) => [main(g.oval(0.5, 0.5, 0.5))], { aspect: true });
  d('callRibbon', 'callouts', 180, 60, '리본', 'Ribbon', (g) => [dark(g.pol([0, 0.26], [0.14, 0.26], [0.14, 1], [0, 1], [0.05, 0.63])), dark(g.pol([1, 0.26], [0.86, 0.26], [0.86, 1], [1, 1], [0.95, 0.63])), main(g.box(0.08, 0, 0.84, 0.76))], { text: [0.08, 0, 0.92, 0.76] });
  d('callCheck', 'callouts', 160, 40, '체크 항목', 'Check Item', (g) => [line(g.box(0, 0.15, 0.18, 0.7, 3)), line(g.open([0.04, 0.5], [0.08, 0.68], [0.15, 0.3]))], { text: [0.22, 0, 1, 1], style: { fill: 'none' }, qs: 'subtle' });
  d('callHeading', 'callouts', 220, 40, '소제목', 'Subheading', (g) => [line(g.seg([0, 1, 1, 1]))], { style: { fill: 'none', fontSize: 16, bold: true }, qs: 'subtle' });
  d('callCaption', 'callouts', 180, 28, '그림 설명', 'Caption', (g) => [line(g.box(0, 0, 1, 1))], { kind: 'text', style: { fill: 'none', line: 'none', fontSize: 11, italic: true } });
  d('callNoteBlue', 'callouts', 120, 110, '파란 메모', 'Blue Note', (g) => [main(g.pol([0, 0], [0.8, 0], [1, 0.2], [1, 1], [0, 1])), dark(g.pol([0.8, 0], [0.8, 0.2], [1, 0.2]))], { style: { fill: '#c7ecff', line: '#4a9cc7', textColor: '#0f3a52' }, text: [0.06, 0.06, 0.94, 0.94] });
  d('callNotePink', 'callouts', 120, 110, '분홍 메모', 'Pink Note', (g) => [main(g.pol([0, 0], [0.8, 0], [1, 0.2], [1, 1], [0, 1])), dark(g.pol([0.8, 0], [0.8, 0.2], [1, 0.2]))], { style: { fill: '#ffd1dc', line: '#d4849a', textColor: '#5a1f30' }, text: [0.06, 0.06, 0.94, 0.94] });
  d('callNoteGreen', 'callouts', 120, 110, '초록 메모', 'Green Note', (g) => [main(g.pol([0, 0], [0.8, 0], [1, 0.2], [1, 1], [0, 1])), dark(g.pol([0.8, 0], [0.8, 0.2], [1, 0.2]))], { style: { fill: '#d9f2b4', line: '#86ad4d', textColor: '#2d4410' }, text: [0.06, 0.06, 0.94, 0.94] });

  // ───────────────────────── containers
  const top = { kind: 'container', header: 'top', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true };
  d('ctTab', 'containers', 320, 220, '탭 컨테이너', 'Tabbed Container', (g) => [main(g.box(0, 0.12, 1, 0.88)), dark(g.box(0, 0, 0.36, 0.12, 3))], { ...top, text: [0, 0, 0.36, 0] });
  d('ctRound', 'containers', 320, 220, '둥근 컨테이너', 'Rounded Container', (g) => [main(g.box(0, 0, 1, 1, 18))], top);
  d('ctAccent', 'containers', 320, 220, '강조 컨테이너', 'Accent Container', (g) => [main(g.box(0, 0, 1, 1)), solid(g.box(0, 0, 1, 0.03))], top);
  d('ctSide', 'containers', 320, 220, '왼쪽 머리글 컨테이너', 'Side Header Container', (g) => [main(g.box(0, 0, 1, 1)), dark(rect(0, 0, Math.min(36, g.w), g.h))], { kind: 'container', header: 'left', qs: 'subtle', text: [0, 0, 0, 1], textHeader: true });
  d('ctDouble', 'containers', 320, 220, '이중 테두리', 'Double Border', (g) => [main(g.box(0, 0, 1, 1)), line(g.box(0.02, 0.03, 0.96, 0.94))], top);
  d('ctDashed', 'containers', 320, 220, '점선 영역', 'Dashed Zone', (g) => [main(g.box(0, 0, 1, 1, 8))], { ...top, style: { dash: 'dash', fillOpacity: 40 } });
  d('ctGrid2', 'containers', 320, 220, '2칸 레이아웃', 'Two Columns', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.5, 0, 0.5, 1]))], top);
  d('ctGrid3', 'containers', 420, 220, '3칸 레이아웃', 'Three Columns', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 2 / 3, 1]))], top);
  d('ctGridRows', 'containers', 320, 240, '3줄 레이아웃', 'Three Rows', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 2 / 3]))], top);
  d('ctLaneSet', 'containers', 640, 300, '스윔레인 2개', 'Two Swimlanes', (g) => [main(g.box(0, 0, 1, 1)), dark(rect(0, 0, Math.min(36, g.w), g.h)), line(g.seg([0, 0.5, 1, 0.5]))], { kind: 'container', header: 'left', qs: 'subtle', text: [0, 0, 0, 1], textHeader: true });

  // ───────────────────────── UML
  d('umlEnum', 'uml', 170, 120, '열거형', 'Enumeration', (g) => [main(g.box(0, 0, 1, 1))], { compartments: true, qs: 'subtle', points: SIDES_AND_CORNERS });
  d('umlAbstract', 'uml', 170, 130, '추상 클래스', 'Abstract Class', (g) => [main(g.box(0, 0, 1, 1))], { compartments: true, qs: 'subtle', style: { italic: true }, points: SIDES_AND_CORNERS });
  d('umlArtifact', 'uml', 130, 90, '아티팩트', 'Artifact', (g) => [main(g.box(0, 0, 1, 1)), line(g.pol([0.8, 0.08], [0.88, 0.08], [0.94, 0.18], [0.94, 0.36], [0.8, 0.36]))], { qs: 'subtle', text: [0, 0.3, 1, 1] });
  d('umlSend', 'uml', 140, 60, '신호 보내기', 'Send Signal', (g) => [main(g.pol([0, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0, 1]))], { qs: 'subtle', text: [0, 0, 0.8, 1] });
  d('umlReceive', 'uml', 140, 60, '신호 받기', 'Receive Signal', (g) => [main(g.pol([0, 0], [1, 0], [1, 1], [0, 1], [0.2, 0.5]))], { qs: 'subtle', text: [0.2, 0, 1, 1] });
  d('umlTimeEvent', 'uml', 50, 60, '시간 이벤트', 'Time Event', (g) => [main(g.pol([0, 0], [1, 0], [0, 1], [1, 1]))], below);
  d('umlHistory', 'uml', 40, 40, '기록 상태', 'History State', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.seg([0.34, 0.26, 0.34, 0.74], [0.66, 0.26, 0.66, 0.74], [0.34, 0.5, 0.66, 0.5]))], { aspect: true, ...below });
  d('umlFlowFinal', 'uml', 34, 34, '흐름 종료', 'Flow Final', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.seg([0.15, 0.15, 0.85, 0.85], [0.85, 0.15, 0.15, 0.85]))], { aspect: true, ...below });
  d('umlBoundary', 'uml', 70, 50, '경계', 'Boundary', (g) => [main(g.oval(0.6, 0.5, 0.4, 0.5)), line(g.seg([0, 0.1, 0, 0.9], [0, 0.5, 0.2, 0.5]))], below);
  d('umlControl', 'uml', 54, 54, '제어', 'Control', (g) => [main(g.oval(0.5, 0.55, 0.5, 0.45)), line(g.open([0.62, 0.02], [0.46, 0.1], [0.62, 0.2]))], below);
  d('umlEntityIcon', 'uml', 54, 54, '엔터티 객체', 'Entity Object', (g) => [main(g.oval(0.5, 0.45, 0.45)), line(g.seg([0.08, 0.98, 0.92, 0.98]))], below);
  d('umlFragment', 'uml', 320, 180, '결합 조각', 'Combined Fragment', (g) => [main(g.box(0, 0, 1, 1)), line(g.pol([0, 0], [0.2, 0], [0.2, 0.08], [0.17, 0.14], [0, 0.14]))], { kind: 'container', header: 'top', style: { fill: 'none' }, text: [0, 0, 0.17, 0], textHeader: true, qs: 'subtle' });
  d('umlSwimLabel', 'uml', 120, 40, '스테레오타입', 'Stereotype', (g) => [main(g.box(0, 0, 1, 1, 4))], { qs: 'subtle', style: { italic: true } });
  d('umlMerge', 'uml', 50, 50, '병합 노드', 'Merge Node', (g) => [main(g.pol([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]))], below);

  // ───────────────────────── database (ERD)
  d('erdTable', 'erd', 180, 150, '표', 'Table', (g) => [main(g.box(0, 0, 1, 1))], { compartments: true, qs: 'subtle', points: [[0.5, 0], [1, 0.25], [1, 0.5], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.5], [0, 0.25]] });
  d('erdLookup', 'erd', 150, 110, '코드 표', 'Lookup Table', (g) => [main(g.box(0, 0, 1, 1, 6)), line(g.seg([0, 0.26, 1, 0.26]))], { qs: 'subtle', text: [0, 0.28, 1, 1] });
  d('erdWeakRel', 'erd', 140, 90, '약한 관계', 'Weak Relationship', (g) => [main(g.pol([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5])), line(g.pol([0.5, 0.12], [0.88, 0.5], [0.5, 0.88], [0.12, 0.5]))], { qs: 'subtle', text: [0.22, 0.22, 0.78, 0.78] });
  d('erdMulti', 'erd', 130, 66, '다중값 속성', 'Multivalued Attribute', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.oval(0.5, 0.5, 0.44, 0.38))], { qs: 'outline', text: [0.1, 0.1, 0.9, 0.9] });
  d('erdDerived', 'erd', 130, 60, '유도 속성', 'Derived Attribute', (g) => [main(g.oval(0.5, 0.5, 0.5))], { qs: 'outline', text: [0.1, 0.1, 0.9, 0.9], style: { dash: 'dash' } });
  d('erdAssoc', 'erd', 150, 80, '연관 엔터티', 'Associative Entity', (g) => [main(g.box(0, 0, 1, 1)), line(g.pol([0.5, 0.04], [0.98, 0.5], [0.5, 0.96], [0.02, 0.5]))], { qs: 'subtle', text: [0.2, 0.2, 0.8, 0.8] });
  d('erdIndex', 'erd', 130, 56, '인덱스', 'Index', (g) => [main(g.box(0, 0, 1, 1, 5)), solid(g.pol([0, 0], [0.08, 0], [0.08, 1], [0, 1]))], { qs: 'subtle', text: [0.1, 0, 1, 1] });
  d('erdSchema', 'erd', 160, 110, '스키마', 'Schema', (g) => [main(g.pol([0, 0.16], [0, 1], [1, 1], [1, 0.16])), dark(g.pol([0, 0], [0.42, 0], [0.48, 0.16], [0, 0.16]))], { qs: 'subtle', text: [0, 0.16, 1, 1] });
  d('erdDb', 'erd', 90, 100, '데이터베이스', 'Database', (g) => [main(`${M(0, g.h * 0.14)}V${f(g.h * 0.86)}A${f(g.w / 2)} ${f(g.h * 0.14)} 0 0 0 ${f(g.w)} ${f(g.h * 0.86)}V${f(g.h * 0.14)}A${f(g.w / 2)} ${f(g.h * 0.14)} 0 0 0 0 ${f(g.h * 0.14)}Z`), line(g.arc(0, 0.14, 0.5, 0.14, 1, 0.14, 0, 0))], { qs: 'subtle', text: [0, 0.3, 1, 1] });
  d('erdProc', 'erd', 150, 64, '저장 프로시저', 'Stored Procedure', (g) => [main(g.box(0, 0, 1, 1, 12)), line(g.seg([0.1, 0, 0.1, 1]))], { qs: 'subtle', text: [0.1, 0, 1, 1] });
  d('erdTrigger', 'erd', 60, 80, '트리거', 'Trigger', (g) => [main(g.pol([0.55, 0], [0.1, 0.56], [0.46, 0.56], [0.32, 1], [0.9, 0.36], [0.54, 0.36], [0.82, 0]))], below);
  d('erdSubtype', 'erd', 50, 50, '하위 유형', 'Subtype', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.open([0.28, 0.32], [0.72, 0.32], [0.72, 0.68], [0.28, 0.68]))], { aspect: true, ...below });

  // ───────────────────────── BPMN
  const evStyle = { aspect: true, text: BELOW, style: { fill: '#fff6e0', line: '#c98a00' } };
  const endStyle = { aspect: true, text: BELOW, style: { fill: '#fde8e8', line: '#c0392b', lineWidth: 3.5 } };
  const taskIcon = (draw) => (g) => [main(rect(0, 0, g.w, g.h, 10)), ...draw(g)];
  d('bpmnError', 'bpmn', 40, 40, '오류 종료', 'Error End', (g) => [main(g.oval(0.5, 0.5, 0.5)), solid(g.pol([0.28, 0.72], [0.42, 0.28], [0.56, 0.52], [0.72, 0.28], [0.58, 0.72], [0.44, 0.48]))], endStyle);
  d('bpmnTerminate', 'bpmn', 40, 40, '강제 종료', 'Terminate End', (g) => [main(g.oval(0.5, 0.5, 0.5)), solid(g.oval(0.5, 0.5, 0.28))], endStyle);
  d('bpmnSignal', 'bpmn', 40, 40, '신호 이벤트', 'Signal Event', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.pol([0.5, 0.22], [0.76, 0.7], [0.24, 0.7]))], evStyle);
  d('bpmnCondition', 'bpmn', 40, 40, '조건 이벤트', 'Conditional Event', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(`${g.box(0.3, 0.26, 0.4, 0.48)}${g.seg([0.36, 0.38, 0.64, 0.38], [0.36, 0.5, 0.64, 0.5], [0.36, 0.62, 0.64, 0.62])}`)], evStyle);
  d('bpmnEscalate', 'bpmn', 40, 40, '에스컬레이션', 'Escalation Event', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.pol([0.5, 0.22], [0.72, 0.76], [0.5, 0.56], [0.28, 0.76]))], evStyle);
  d('bpmnComplex', 'bpmn', 56, 56, '복합 게이트웨이', 'Complex Gateway', (g) => [main(g.pol([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5])), line(g.seg([0.5, 0.26, 0.5, 0.74], [0.26, 0.5, 0.74, 0.5], [0.33, 0.33, 0.67, 0.67], [0.67, 0.33, 0.33, 0.67]))], { aspect: true, text: BELOW, style: { fill: '#fffbe6', line: '#b8860b' } });
  d('bpmnUserTask', 'bpmn', 130, 80, '사용자 작업', 'User Task', taskIcon((g) => [line(`${g.oval(0.09, 0.14, 0.03, 0.05)}${g.arc(0.04, 0.3, 0.05, 0.08, 0.14, 0.3)}`)]), { qs: 'subtle', text: [0, 0.1, 1, 1] });
  d('bpmnServiceTask', 'bpmn', 130, 80, '서비스 작업', 'Service Task', taskIcon((g) => [line(`${g.oval(0.09, 0.18, 0.04, 0.07)}${g.seg([0.09, 0.05, 0.09, 0.09], [0.09, 0.27, 0.09, 0.31], [0.02, 0.18, 0.05, 0.18], [0.13, 0.18, 0.16, 0.18])}`)]), { qs: 'subtle', text: [0, 0.1, 1, 1] });
  d('bpmnScriptTask', 'bpmn', 130, 80, '스크립트 작업', 'Script Task', taskIcon((g) => [line(`${g.box(0.05, 0.06, 0.09, 0.22)}${g.seg([0.07, 0.12, 0.12, 0.12], [0.07, 0.18, 0.12, 0.18], [0.07, 0.23, 0.12, 0.23])}`)]), { qs: 'subtle', text: [0, 0.1, 1, 1] });
  d('bpmnManualTask', 'bpmn', 130, 80, '수동 작업', 'Manual Task', taskIcon((g) => [line(`${g.open([0.05, 0.3], [0.05, 0.16], [0.08, 0.08], [0.1, 0.16], [0.13, 0.1], [0.14, 0.3])}`)]), { qs: 'subtle', text: [0, 0.1, 1, 1] });
  d('bpmnSendTask', 'bpmn', 130, 80, '보내기 작업', 'Send Task', taskIcon((g) => [solid(g.box(0.04, 0.08, 0.12, 0.18)), line(g.open([0.04, 0.08], [0.1, 0.18], [0.16, 0.08]))]), { qs: 'subtle', text: [0, 0.1, 1, 1] });
  d('bpmnReceiveTask', 'bpmn', 130, 80, '받기 작업', 'Receive Task', taskIcon((g) => [line(`${g.box(0.04, 0.08, 0.12, 0.18)}${g.open([0.04, 0.08], [0.1, 0.18], [0.16, 0.08])}`)]), { qs: 'subtle', text: [0, 0.1, 1, 1] });
  d('bpmnAnnotation', 'bpmn', 130, 70, '텍스트 주석', 'Text Annotation', (g) => [line(g.open([0.14, 0], [0, 0], [0, 1], [0.14, 1]))], { style: { fill: 'none' }, qs: 'subtle', points: [[0, 0.5]], text: [0.05, 0, 1, 1] });
  d('bpmnLoopTask', 'bpmn', 130, 80, '반복 작업', 'Loop Task', taskIcon((g) => [line(`${g.arc(0.44, 0.92, 0.06, 0.1, 0.56, 0.92, 1, 1)}${g.open([0.56, 0.78], [0.56, 0.92], [0.5, 0.86])}`)]), { qs: 'subtle', text: [0, 0, 1, 0.76] });

  // ───────────────────────── org chart
  d('orgStaff', 'org', 150, 60, '참모', 'Staff', (g) => [main(g.box(0, 0, 1, 1, 4)), line(g.seg([0.04, 0.14, 0.96, 0.14]))], { org: true, qs: 'outline', text: [0, 0.14, 1, 1] });
  d('orgTeam', 'org', 170, 70, '팀', 'Team', (g) => [main(g.box(0.04, 0, 0.96, 0.84, 5)), main(g.box(0, 0.16, 0.96, 0.84, 5))], { org: true, qs: 'subtle', text: [0, 0.16, 0.96, 1] });
  d('orgDepartment', 'org', 180, 66, '부서', 'Department', (g) => [main(g.box(0, 0, 1, 1, 4)), dark(g.box(0, 0.8, 1, 0.2))], { org: true, text: [0.03, 0, 0.97, 0.8] });
  d('orgBoard', 'org', 190, 70, '이사회', 'Board', (g) => [main(g.pol([0.06, 0], [0.94, 0], [1, 0.5], [0.94, 1], [0.06, 1], [0, 0.5]))], { org: true, text: [0.06, 0, 0.94, 1] });
  d('orgPartner', 'org', 150, 60, '협력사', 'Partner', (g) => [main(g.box(0, 0, 1, 1, 30))], { org: true, qs: 'outline', style: { dash: 'dashDot' } });
  d('orgRemote', 'org', 150, 60, '원격 근무', 'Remote Member', (g) => [main(g.box(0, 0, 1, 1, 4)), line(`${g.arc(0.84, 0.32, 0.05, 0.1, 0.94, 0.32)}${g.arc(0.8, 0.32, 0.09, 0.2, 0.98, 0.32)}`), solid(g.dot(0.89, 0.42, 0.04))], { org: true, qs: 'subtle', text: [0, 0, 0.8, 1] });
  d('orgNew', 'org', 150, 60, '신규 직위', 'New Position', (g) => [main(g.box(0, 0, 1, 1, 4)), solid(g.pol([0.82, 0], [1, 0], [1, 0.36]))], { org: true, qs: 'subtle', text: [0, 0, 0.9, 1] });
  d('orgInterim', 'org', 150, 60, '임시 직위', 'Interim', (g) => [main(g.box(0, 0, 1, 1, 4))], { org: true, qs: 'subtle', style: { dash: 'longDash' } });
  d('orgCircle', 'org', 90, 90, '원형 인물', 'Circle Person', (g) => [main(g.oval(0.5, 0.5, 0.5)), light(g.oval(0.5, 0.34, 0.14)), light(`${M(g.w * 0.24, g.h * 0.76)}C${f(g.w * 0.24)} ${f(g.h * 0.46)} ${f(g.w * 0.76)} ${f(g.h * 0.46)} ${f(g.w * 0.76)} ${f(g.h * 0.76)}Z`)], { org: true, aspect: true, text: BELOW, qs: 'subtle' });
  d('orgTitleBar', 'org', 200, 44, '조직 제목', 'Org Heading', (g) => [main(g.box(0, 0, 1, 1, 6))], { org: true });

  // ───────────────────────── mind map
  d('mindPill', 'mind', 130, 44, '알약 주제', 'Pill Topic', (g) => [main(rect(0, 0, g.w, g.h, g.h / 2))], { qs: 'fill' });
  d('mindHex', 'mind', 130, 70, '육각 주제', 'Hexagon Topic', (g) => [main(g.pol([0.18, 0], [0.82, 0], [1, 0.5], [0.82, 1], [0.18, 1], [0, 0.5]))], { qs: 'fill', text: [0.12, 0, 0.88, 1] });
  d('mindDiamond', 'mind', 130, 80, '다이아몬드 주제', 'Diamond Topic', (g) => [main(g.pol([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]))], { qs: 'subtle', text: [0.2, 0.2, 0.8, 0.8] });
  d('mindBubble', 'mind', 90, 90, '거품 주제', 'Bubble Topic', (g) => [main(g.oval(0.5, 0.5, 0.5))], { qs: 'subtle', aspect: true, text: [0.12, 0.12, 0.88, 0.88] });
  d('mindStar', 'mind', 44, 44, '중요 표시', 'Star Marker', (g) => [main(g.pol([0.5, 0], [0.62, 0.35], [1, 0.38], [0.7, 0.6], [0.8, 1], [0.5, 0.78], [0.2, 1], [0.3, 0.6], [0, 0.38], [0.38, 0.35]))], { aspect: true, text: BELOW, style: { fill: '#ffd54f', line: '#c79100', textColor: '#3d3300' } });
  d('mindQuestion', 'mind', 44, 44, '질문 표시', 'Question Marker', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(`${g.arc(0.34, 0.36, 0.16, 0.16, 0.56, 0.5)}${g.seg([0.5, 0.55, 0.5, 0.64], [0.5, 0.74, 0.5, 0.76])}`)], { aspect: true, ...below });
  d('mindCheck', 'mind', 44, 44, '완료 표시', 'Done Marker', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.open([0.26, 0.52], [0.44, 0.7], [0.74, 0.32]))], { aspect: true, text: BELOW, style: { fill: '#c8efd2', line: '#2e8b3a', textColor: '#14401d' } });
  d('mindWarn', 'mind', 48, 44, '주의 표시', 'Warning Marker', (g) => [main(g.pol([0.5, 0], [1, 1], [0, 1])), line(g.seg([0.5, 0.36, 0.5, 0.68], [0.5, 0.8, 0.5, 0.84]))], { text: BELOW, style: { fill: '#ffe0a3', line: '#c98a00', textColor: '#4a3200' } });
  d('mindFlag', 'mind', 40, 50, '깃발 표시', 'Flag Marker', (g) => [line(g.seg([0.12, 0, 0.12, 1])), main(g.pol([0.12, 0], [1, 0.22], [0.12, 0.46]))], { text: BELOW, style: { fill: '#ffb3b3', line: '#c0392b', textColor: '#4a1212' } });
  d('mindPriority', 'mind', 40, 40, '우선순위', 'Priority', (g) => [main(g.oval(0.5, 0.5, 0.5))], { aspect: true });
  d('mindNote', 'mind', 110, 70, '주제 메모', 'Topic Note', (g) => [main(g.pol([0, 0], [0.82, 0], [1, 0.26], [1, 1], [0, 1]))], { style: { fill: '#fff4a8', line: '#d8b830', textColor: '#3d3300' } });
  d('mindSummary', 'mind', 30, 120, '요약 괄호', 'Summary Bracket', (g) => [line(g.open([0, 0], [0.5, 0.08], [0.5, 0.42], [1, 0.5], [0.5, 0.58], [0.5, 0.92], [0, 1]))], { style: { fill: 'none' }, kind: 'lineShape', points: [[1, 0.5], [0, 0], [0, 1]], text: [1.1, 0, 5, 1], qs: 'subtle' });

  // ───────────────────────── floor plan
  const ink = '#1f2937';
  const fix = (fill, stroke, text = BELOW) => ({ style: { fill, line: stroke, textColor: ink }, text });
  d('flrShower', 'floor', 90, 90, '샤워실', 'Shower', (g) => [main(g.box(0, 0, 1, 1, 3)), line(`${g.oval(0.5, 0.5, 0.34)}${g.seg([0.26, 0.26, 0.74, 0.74], [0.74, 0.26, 0.26, 0.74])}`)], fix('#e3f2fd', '#607d8b'));
  d('flrBath', 'floor', 170, 80, '욕조', 'Bathtub', (g) => [main(g.box(0, 0, 1, 1, 6)), line(g.box(0.06, 0.12, 0.88, 0.76, 22)), solid(g.dot(0.86, 0.5, 0.05))], fix('#ffffff', '#607d8b'));
  d('flrWardrobe', 'floor', 170, 60, '옷장', 'Wardrobe', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.5, 0, 0.5, 1], [0.04, 0.5, 0.96, 0.5]))], fix('#d7ccc8', '#5d4037'));
  d('flrFridge', 'floor', 70, 70, '냉장고', 'Refrigerator', (g) => [main(g.box(0, 0, 1, 1, 3)), line(g.seg([0, 0.8, 1, 0.8], [0.5, 0.8, 0.5, 1]))], fix('#eceff1', '#546e7a'));
  d('flrStove', 'floor', 80, 70, '가스레인지', 'Stove', (g) => [main(g.box(0, 0, 1, 1, 3)), line(`${g.oval(0.28, 0.3, 0.14, 0.15)}${g.oval(0.72, 0.3, 0.14, 0.15)}${g.oval(0.28, 0.72, 0.14, 0.15)}${g.oval(0.72, 0.72, 0.14, 0.15)}`)], fix('#eceff1', '#37474f'));
  d('flrCounter', 'floor', 220, 60, '조리대', 'Counter', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0, 0.12, 1, 0.12]))], fix('#f5f0e1', '#8d6e63', [0, 0.12, 1, 1]));
  d('flrTv', 'floor', 130, 26, 'TV', 'TV', (g) => [main(g.box(0, 0, 1, 1, 2)), line(g.box(0.3, 0.5, 0.4, 0.5))], fix('#455a64', '#263238'));
  d('flrRug', 'floor', 200, 130, '러그', 'Rug', (g) => [main(g.box(0, 0, 1, 1, 4)), line(g.box(0.05, 0.08, 0.9, 0.84, 3))], fix('#f8dcc4', '#c58b5f', [0.08, 0.1, 0.92, 0.9]));
  d('flrWasher', 'floor', 70, 70, '세탁기', 'Washer', (g) => [main(g.box(0, 0, 1, 1, 4)), line(g.oval(0.5, 0.55, 0.34))], fix('#ffffff', '#607d8b'));
  d('flrShelf', 'floor', 170, 40, '책장', 'Bookshelf', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.2, 0, 0.2, 1], [0.4, 0, 0.4, 1], [0.6, 0, 0.6, 1], [0.8, 0, 0.8, 1]))], fix('#bcaaa4', '#5d4037'));
  d('flrLamp', 'floor', 50, 50, '스탠드', 'Floor Lamp', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(`${g.oval(0.5, 0.5, 0.26)}${g.seg([0.5, 0, 0.5, 0.24], [0.5, 0.76, 0.5, 1], [0, 0.5, 0.24, 0.5], [0.76, 0.5, 1, 0.5])}`)], fix('#fff4a8', '#c9a227'));
  d('flrColumn', 'floor', 40, 40, '기둥', 'Column', (g) => [main(g.box(0, 0, 1, 1))], fix('#5f6368', '#3c4043'));
  d('flrElevator', 'floor', 110, 110, '엘리베이터', 'Elevator', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0, 0, 1, 1], [1, 0, 0, 1]))], fix('#eeeeee', '#424242'));
  d('flrDining', 'floor', 170, 170, '식탁 세트', 'Dining Set', (g) => [dark(g.box(0.36, 0, 0.28, 0.14, 3)), dark(g.box(0.36, 0.86, 0.28, 0.14, 3)), dark(g.box(0, 0.36, 0.14, 0.28, 3)), dark(g.box(0.86, 0.36, 0.14, 0.28, 3)), main(g.oval(0.5, 0.5, 0.34))], fix('#d7b98e', '#7a5a2f', [0.2, 0.3, 0.8, 0.7]));

  // ───────────────────────── blocks
  d('blkSteps', 'blocks', 170, 110, '계단형', 'Staircase', (g) => [main(g.box(0, 0.66, 0.34, 0.34)), main(g.box(0.33, 0.33, 0.34, 0.67)), main(g.box(0.66, 0, 0.34, 1))], { text: BELOW, qs: 'subtle' });
  d('blkChevrons', 'blocks', 240, 60, '단계 화살표', 'Process Chevrons', (g) => [main(g.pol([0, 0], [0.28, 0], [0.36, 0.5], [0.28, 1], [0, 1], [0.06, 0.5])), main(g.pol([0.32, 0], [0.62, 0], [0.7, 0.5], [0.62, 1], [0.32, 1], [0.4, 0.5])), main(g.pol([0.66, 0], [0.92, 0], [1, 0.5], [0.92, 1], [0.66, 1], [0.74, 0.5]))], { text: BELOW, qs: 'subtle', points: [[0.03, 0.5], [1, 0.5]] });
  d('blkOnion', 'blocks', 140, 140, '겹원', 'Onion Rings', (g) => [main(g.oval(0.5, 0.5, 0.5)), light(g.oval(0.5, 0.56, 0.38)), main(g.oval(0.5, 0.64, 0.26)), light(g.oval(0.5, 0.74, 0.14))], { aspect: true, text: BELOW, qs: 'subtle' });
  d('blkCycle', 'blocks', 130, 130, '순환 고리', 'Cycle Ring', (g) => [line(`${g.arc(0.5, 0.06, 0.44, 0.44, 0.94, 0.5)}${g.pol([0.86, 0.42], [0.94, 0.56], [1, 0.42])}${g.arc(0.94, 0.5, 0.44, 0.44, 0.5, 0.94)}${g.pol([0.58, 0.86], [0.44, 0.94], [0.58, 1])}${g.arc(0.5, 0.94, 0.44, 0.44, 0.06, 0.5)}${g.pol([0, 0.58], [0.06, 0.44], [0.14, 0.58])}${g.arc(0.06, 0.5, 0.44, 0.44, 0.5, 0.06)}${g.pol([0.42, 0.14], [0.56, 0.06], [0.42, 0])}`)], { aspect: true, style: { fill: 'none', lineWidth: 2.5 }, qs: 'subtle', text: [0.2, 0.2, 0.8, 0.8] });
  d('blkStack', 'blocks', 120, 110, '쌓인 블록', 'Block Stack', (g) => [main(g.box(0.2, 0, 0.6, 0.3)), main(g.box(0.1, 0.34, 0.8, 0.3)), main(g.box(0, 0.68, 1, 0.32))], { text: BELOW, qs: 'subtle' });
  d('blkBucket', 'blocks', 110, 100, '양동이', 'Bucket', (g) => [main(g.pol([0, 0.1], [1, 0.1], [0.84, 1], [0.16, 1])), line(g.arc(0.14, 0.1, 0.36, 0.1, 0.86, 0.1))], { qs: 'subtle', text: [0.14, 0.2, 0.86, 1] });
  d('blkPuzzle', 'blocks', 100, 100, '퍼즐 조각', 'Puzzle Piece', (g) => [main(`${M(0, g.h * 0.2)}H${f(g.w * 0.36)}A${f(g.w * 0.14)} ${f(g.h * 0.14)} 0 1 1 ${f(g.w * 0.64)} ${f(g.h * 0.2)}H${f(g.w)}V${f(g.h * 0.46)}A${f(g.w * 0.14)} ${f(g.h * 0.14)} 0 1 0 ${f(g.w)} ${f(g.h * 0.74)}V${f(g.h)}H0Z`)], { text: [0.05, 0.25, 0.85, 1] });
  d('blkCard3d', 'blocks', 150, 90, '그림자 카드', 'Shadow Card', (g) => [dark(g.box(0.04, 0.08, 0.96, 0.92, 6)), main(g.box(0, 0, 0.96, 0.92, 6))], { text: [0, 0, 0.96, 0.92] });
  d('blkInOut', 'blocks', 170, 80, '입출력 블록', 'I/O Block', (g) => [main(g.box(0.14, 0, 0.72, 1)), solid(g.pol([0, 0.4], [0.14, 0.5], [0, 0.6])), solid(g.pol([0.86, 0.4], [1, 0.5], [0.86, 0.6]))], { text: [0.14, 0, 0.86, 1], points: [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]] });
  d('blkDrum', 'blocks', 120, 80, '가로 드럼', 'Drum', (g) => [main(`${M(g.w * 0.12, 0)}H${f(g.w * 0.88)}A${f(g.w * 0.12)} ${f(g.h / 2)} 0 0 1 ${f(g.w * 0.88)} ${f(g.h)}H${f(g.w * 0.12)}A${f(g.w * 0.12)} ${f(g.h / 2)} 0 0 1 ${f(g.w * 0.12)} 0Z`), line(g.arc(0.88, 0, 0.12, 0.5, 0.88, 1, 0, 0))], { text: [0.1, 0, 0.8, 1] });
  d('blkTreeNode', 'blocks', 150, 110, '트리 구조', 'Tree Node', (g) => [main(g.box(0.3, 0, 0.4, 0.3, 3)), line(g.open([0.5, 0.3], [0.5, 0.5])), line(g.open([0.15, 0.68], [0.15, 0.5], [0.85, 0.5], [0.85, 0.68])), main(g.box(0, 0.68, 0.3, 0.32, 3)), main(g.box(0.7, 0.68, 0.3, 0.32, 3))], { text: BELOW, qs: 'subtle' });
  d('blkDonutPart', 'blocks', 110, 110, '부분 고리', 'Blocked Arc', (g) => [main(`${g.arc(0.5, 0, 0.5, 0.5, 1, 0.5)}L${f(g.w * 0.75)} ${f(g.h / 2)}A${f(g.w / 4)} ${f(g.h / 4)} 0 0 0 ${f(g.w / 2)} ${f(g.h / 4)}Z`)], { text: BELOW, qs: 'subtle' });

  // ───────────────────────── charts
  d('chartHistogram', 'charts', 150, 100, '히스토그램', 'Histogram', (g) => [line(g.open([0, 0], [0, 1], [1, 1])), main(g.box(0.06, 0.62, 0.17, 0.38)), main(g.box(0.23, 0.3, 0.17, 0.7)), main(g.box(0.4, 0.1, 0.17, 0.9)), main(g.box(0.57, 0.38, 0.17, 0.62)), main(g.box(0.74, 0.72, 0.17, 0.28))], below);
  d('chartBubble', 'charts', 150, 100, '버블 차트', 'Bubble Chart', (g) => [line(g.open([0, 0], [0, 1], [1, 1])), main(g.oval(0.25, 0.65, 0.12, 0.18)), main(g.oval(0.55, 0.42, 0.2, 0.3)), main(g.oval(0.85, 0.2, 0.09, 0.14))], below);
  d('chartStacked', 'charts', 150, 100, '누적 막대', 'Stacked Bars', (g) => [line(g.open([0, 0], [0, 1], [1, 1])), ...[[0.1, 0.5, 0.3], [0.38, 0.25, 0.42], [0.66, 0.4, 0.2]].flatMap(([x, y, split]) => [main(g.box(x, y + split * (1 - y), 0.2, (1 - y) * (1 - split))), light(g.box(x, y, 0.2, split * (1 - y)))])], below);
  d('chartWaterfall', 'charts', 160, 100, '폭포 차트', 'Waterfall', (g) => [line(g.seg([0, 1, 1, 1])), main(g.box(0.04, 0.5, 0.16, 0.5)), light(g.box(0.24, 0.26, 0.16, 0.24)), dark(g.box(0.44, 0.26, 0.16, 0.34)), main(g.box(0.64, 0.14, 0.16, 0.46)), main(g.box(0.84, 0.14, 0.14, 0.86))], below);
  d('chartFunnel', 'charts', 130, 110, '깔때기 차트', 'Funnel Chart', (g) => [main(g.pol([0, 0], [1, 0], [0.86, 0.3], [0.14, 0.3])), light(g.pol([0.17, 0.34], [0.83, 0.34], [0.7, 0.64], [0.3, 0.64])), main(g.pol([0.33, 0.68], [0.67, 0.68], [0.58, 1], [0.42, 1]))], below);
  d('chartSparkline', 'charts', 120, 40, '스파크라인', 'Sparkline', (g) => [line(g.open([0, 0.7], [0.15, 0.5], [0.3, 0.62], [0.45, 0.2], [0.6, 0.4], [0.75, 0.1], [1, 0.3]))], { text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2 } });
  d('chartBoxPlot', 'charts', 130, 100, '상자 수염 그림', 'Box Plot', (g) => [line(g.open([0, 0], [0, 1], [1, 1])), line(g.seg([0.3, 0.1, 0.3, 0.3], [0.3, 0.7, 0.3, 0.88], [0.2, 0.1, 0.4, 0.1], [0.2, 0.88, 0.4, 0.88], [0.7, 0.2, 0.7, 0.4], [0.7, 0.72, 0.7, 0.92], [0.6, 0.2, 0.8, 0.2], [0.6, 0.92, 0.8, 0.92])), main(g.box(0.18, 0.3, 0.24, 0.4)), main(g.box(0.58, 0.4, 0.24, 0.32))], below);
  d('chartProgress', 'charts', 160, 30, '진행 막대', 'Progress Bar', (g) => [light(g.box(0, 0, 1, 1, g.h / 2)), main(g.box(0, 0, 0.64, 1, g.h / 2))], { text: BELOW, qs: 'subtle' });
  d('chartTable', 'charts', 160, 100, '데이터 표', 'Data Table', (g) => [main(g.box(0, 0, 1, 1)), dark(g.box(0, 0, 1, 0.2)), line(g.seg([0, 0.4, 1, 0.4], [0, 0.6, 1, 0.6], [0, 0.8, 1, 0.8], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 2 / 3, 1]))], below);
  d('chartTreemap', 'charts', 150, 100, '트리맵', 'Treemap', (g) => [main(g.box(0, 0, 0.56, 1)), light(g.box(0.58, 0, 0.42, 0.56)), main(g.box(0.58, 0.58, 0.2, 0.42)), light(g.box(0.8, 0.58, 0.2, 0.42))], below);

  // ───────────────────────── timeline
  d('tlGantt', 'timeline', 240, 30, '간트 막대', 'Gantt Bar', (g) => [light(g.box(0, 0, 1, 1, 4)), main(g.box(0, 0, 0.55, 1, 4))], { qs: 'fill', text: [0, 1.05, 1, 1.9] });
  d('tlDiamond', 'timeline', 30, 30, '마일스톤', 'Milestone', (g) => [main(g.pol([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]))], { aspect: true, text: [-2, 1.02, 3, 1.8], qs: 'intense' });
  d('tlMonth', 'timeline', 120, 34, '월 띠', 'Month Band', (g) => [main(g.box(0, 0, 1, 1))], { qs: 'subtle' });
  d('tlQuarter', 'timeline', 240, 34, '분기 띠', 'Quarter Band', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([1 / 3, 0.6, 1 / 3, 1], [2 / 3, 0.6, 2 / 3, 1]))], { qs: 'subtle', text: [0, 0, 1, 0.65] });
  d('tlArrow', 'timeline', 300, 36, '기간 화살표', 'Span Arrow', (g) => [main(g.pol([0, 0.2], [0.94, 0.2], [0.94, 0], [1, 0.5], [0.94, 1], [0.94, 0.8], [0, 0.8]))], { qs: 'fill', text: [0, 0.2, 0.94, 0.8], points: ENDS });
  d('tlStep', 'timeline', 50, 50, '단계 원', 'Step Circle', (g) => [main(g.oval(0.5, 0.5, 0.5))], { aspect: true, qs: 'fill' });
  d('tlFlag', 'timeline', 36, 70, '시작 깃발', 'Start Flag', (g) => [line(g.seg([0.1, 0, 0.1, 1])), main(g.pol([0.1, 0], [1, 0.16], [0.1, 0.34]))], { text: [-1.5, 1.02, 2.5, 1.5], qs: 'intense' });
  d('tlSprint', 'timeline', 160, 50, '스프린트', 'Sprint', (g) => [main(g.box(0, 0, 1, 1, 6)), solid(g.box(0, 0, 1, 0.14))], { qs: 'subtle', text: [0, 0.14, 1, 1] });
  d('tlDelay', 'timeline', 110, 34, '지연 구간', 'Delay Span', (g) => [main(g.box(0, 0, 1, 1, 4)), line(g.seg([0, 1, 0.3, 0], [0.3, 1, 0.6, 0], [0.6, 1, 0.9, 0]))], { text: BELOW, style: { fill: '#fde8e8', line: '#c0392b', textColor: ink } });
  d('tlBracket', 'timeline', 240, 26, '기간 괄호', 'Span Bracket', (g) => [line(g.open([0, 1], [0, 0.3], [1, 0.3], [1, 1])), line(g.seg([0.5, 0, 0.5, 0.3]))], { text: [0, -1.1, 1, -0.05], style: { fill: 'none' }, qs: 'subtle', points: [[0, 1], [1, 1]] });
  d('tlDot', 'timeline', 20, 20, '이벤트 점', 'Event Dot', (g) => [main(g.oval(0.5, 0.5, 0.5))], { aspect: true, qs: 'intense', text: [-3, 1.1, 4, 2.2] });
  d('tlCard', 'timeline', 150, 80, '일정 카드', 'Event Card', (g) => [main(g.box(0, 0, 1, 1, 6)), dark(g.box(0, 0, 0.05, 1))], { qs: 'subtle', text: [0.05, 0, 1, 1] });

  // ───────────────────────── electrical
  const elec = { style: { fill: 'none', lineWidth: 2 }, points: ENDS, text: [0, 1.05, 1, 1.9], kind: 'lineShape', qs: 'subtle' };
  d('elecVarResistor', 'electrical', 100, 40, '가변 저항', 'Variable Resistor', (g) => [line(g.open([0, 0.5], [0.2, 0.5], [0.25, 0.2], [0.35, 0.8], [0.45, 0.2], [0.55, 0.8], [0.65, 0.2], [0.75, 0.8], [0.8, 0.5], [1, 0.5])), line(g.open([0.28, 1], [0.72, 0])), solid(g.pol([0.72, 0], [0.62, 0.1], [0.7, 0.2]))], elec);
  d('elecCapPolar', 'electrical', 80, 40, '전해 커패시터', 'Polarized Capacitor', (g) => [line(g.open([0, 0.5], [0.44, 0.5])), line(g.seg([0.44, 0, 0.44, 1], [0.56, 0.5, 1, 0.5], [0.24, 0.12, 0.34, 0.12], [0.29, 0, 0.29, 0.24])), line(g.arc(0.6, 0, 0.1, 0.6, 0.6, 1, 0, 0))], elec);
  d('elecRelay', 'electrical', 90, 60, '릴레이', 'Relay', (g) => [line(g.box(0.1, 0.3, 0.3, 0.4)), line(g.seg([0, 0.5, 0.1, 0.5], [0.4, 0.5, 0.56, 0.5], [0.56, 0.5, 0.86, 0.15], [0.84, 0.5, 1, 0.5], [0.1, 0.3, 0.4, 0.7]))], elec);
  d('elecAntenna', 'electrical', 50, 70, '안테나', 'Antenna', (g) => [line(g.pol([0, 0], [1, 0], [0.5, 0.5])), line(g.seg([0.5, 0, 0.5, 1]))], { ...elec, points: [[0.5, 1]] });
  d('elecAmmeter', 'electrical', 60, 60, '전류계', 'Ammeter', (g) => [line(`${g.oval(0.5, 0.5, 0.36)}${g.seg([0, 0.5, 0.14, 0.5], [0.86, 0.5, 1, 0.5], [0.38, 0.68, 0.5, 0.32], [0.5, 0.32, 0.62, 0.68], [0.43, 0.56, 0.57, 0.56])}`)], elec);
  d('elecVoltmeter', 'electrical', 60, 60, '전압계', 'Voltmeter', (g) => [line(`${g.oval(0.5, 0.5, 0.36)}${g.seg([0, 0.5, 0.14, 0.5], [0.86, 0.5, 1, 0.5], [0.38, 0.32, 0.5, 0.68], [0.5, 0.68, 0.62, 0.32])}`)], elec);
  d('elecBuzzer', 'electrical', 70, 50, '부저', 'Buzzer', (g) => [line(`${g.arc(0.14, 0.9, 0.36, 0.8, 0.86, 0.9)}${g.seg([0.14, 0.9, 0.86, 0.9], [0.3, 0.9, 0.3, 1], [0.7, 0.9, 0.7, 1])}`)], { ...elec, points: [[0.3, 1], [0.7, 1]] });
  d('elecSocket', 'electrical', 60, 60, '콘센트', 'Outlet', (g) => [line(`${g.oval(0.5, 0.5, 0.46)}${g.seg([0.36, 0.34, 0.36, 0.56], [0.64, 0.34, 0.64, 0.56])}`), line(g.arc(0.38, 0.72, 0.12, 0.08, 0.62, 0.72, 0, 0))], { ...elec, points: [[0.5, 0], [0.5, 1]] });
  d('elecJunction', 'electrical', 14, 14, '접합점', 'Junction', (g) => [solid(g.oval(0.5, 0.5, 0.5))], { ...elec, points: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], text: BELOW });
  d('elecCrystal', 'electrical', 80, 40, '수정 발진자', 'Crystal', (g) => [line(`${g.box(0.38, 0.1, 0.24, 0.8)}${g.seg([0, 0.5, 0.3, 0.5], [0.3, 0.1, 0.3, 0.9], [0.7, 0.1, 0.7, 0.9], [0.7, 0.5, 1, 0.5])}`)], elec);
  d('elecBreaker', 'electrical', 90, 40, '차단기', 'Circuit Breaker', (g) => [line(g.seg([0, 0.7, 0.3, 0.7], [0.7, 0.7, 1, 0.7])), line(g.arc(0.3, 0.7, 0.2, 0.7, 0.7, 0.7))], elec);
  d('elecZener', 'electrical', 90, 40, '제너 다이오드', 'Zener Diode', (g) => [line(g.seg([0, 0.5, 0.35, 0.5], [0.65, 0.5, 1, 0.5])), line(g.open([0.58, 0], [0.65, 0], [0.65, 1], [0.72, 1])), solid(g.pol([0.35, 0], [0.65, 0.5], [0.35, 1]))], elec);

  // ───────────────────────── logic & electronics
  d('logicJk', 'logic', 90, 90, 'JK 플립플롭', 'JK Flip-Flop', (g) => [main(g.box(0.14, 0, 0.72, 1)), line(g.seg([0, 0.22, 0.14, 0.22], [0, 0.78, 0.14, 0.78], [0.86, 0.22, 1, 0.22], [0.86, 0.78, 1, 0.78], [0, 0.5, 0.14, 0.5])), line(g.open([0.14, 0.42], [0.24, 0.5], [0.14, 0.58]))], { ...below, points: [[0, 0.22], [0, 0.5], [0, 0.78], [1, 0.22], [1, 0.78]] });
  d('logicDecoder', 'logic', 80, 110, '디코더', 'Decoder', (g) => [main(g.pol([0, 0.2], [1, 0], [1, 1], [0, 0.8]))], { qs: 'subtle', points: [[0, 0.5], [1, 0.2], [1, 0.4], [1, 0.6], [1, 0.8]] });
  d('logicCounter', 'logic', 100, 80, '카운터', 'Counter', (g) => [main(g.box(0.1, 0, 0.8, 1)), line(g.seg([0, 0.3, 0.1, 0.3], [0, 0.7, 0.1, 0.7], [0.9, 0.2, 1, 0.2], [0.9, 0.5, 1, 0.5], [0.9, 0.8, 1, 0.8]))], { qs: 'subtle', text: [0.1, 0, 0.9, 1], points: [[0, 0.3], [0, 0.7], [1, 0.2], [1, 0.5], [1, 0.8]] });
  d('logicAdder', 'logic', 80, 90, '가산기', 'Adder', (g) => [main(g.pol([0, 0], [1, 0.25], [1, 0.75], [0, 1], [0, 0.6], [0.2, 0.5], [0, 0.4]))], { qs: 'subtle', text: [0.2, 0.2, 1, 0.8], points: [[0, 0.2], [0, 0.8], [1, 0.5]] });
  d('logicCpu', 'logic', 110, 110, '프로세서', 'CPU', (g) => [line(g.seg([0.25, 0, 0.25, 1], [0.5, 0, 0.5, 1], [0.75, 0, 0.75, 1], [0, 0.25, 1, 0.25], [0, 0.5, 1, 0.5], [0, 0.75, 1, 0.75])), main(g.box(0.12, 0.12, 0.76, 0.76, 4))], { qs: 'subtle', text: [0.12, 0.12, 0.88, 0.88] });
  d('logicMemory', 'logic', 130, 60, '메모리', 'Memory', (g) => [main(g.box(0, 0, 1, 0.8, 3)), line(g.seg([0.1, 0.8, 0.1, 1], [0.25, 0.8, 0.25, 1], [0.4, 0.8, 0.4, 1], [0.55, 0.8, 0.55, 1], [0.7, 0.8, 0.7, 1], [0.85, 0.8, 0.85, 1]))], { qs: 'subtle', text: [0, 0, 1, 0.8] });
  d('logicClock', 'logic', 90, 50, '클럭', 'Clock Source', (g) => [main(g.box(0, 0, 0.8, 1)), line(g.open([0.1, 0.7], [0.25, 0.7], [0.25, 0.3], [0.4, 0.3], [0.4, 0.7], [0.55, 0.7], [0.55, 0.3], [0.7, 0.3])), line(g.seg([0.8, 0.5, 1, 0.5]))], { ...below, points: [[1, 0.5]] });
  d('logicVcc', 'logic', 40, 40, '전원(VCC)', 'VCC', (g) => [line(g.seg([0, 0.2, 1, 0.2], [0.5, 0.2, 0.5, 1]))], { style: { fill: 'none', lineWidth: 2 }, kind: 'lineShape', points: [[0.5, 1]], text: [-0.5, -0.8, 1.5, 0.1], qs: 'subtle' });
  d('logicPnp', 'logic', 70, 80, 'PNP 트랜지스터', 'PNP Transistor', (g) => [line(`${g.seg([0, 0.5, 0.4, 0.5], [0.4, 0.25, 0.4, 0.75], [0.4, 0.38, 1, 0], [0.4, 0.62, 1, 1])}`), solid(g.pol([0.42, 0.38], [0.6, 0.2], [0.62, 0.34]))], { style: { fill: 'none', lineWidth: 2 }, kind: 'lineShape', points: [[0, 0.5], [1, 0], [1, 1]], text: [0, 1.05, 1, 1.5], qs: 'subtle' });
  d('logicMosfet', 'logic', 70, 80, 'MOSFET', 'MOSFET', (g) => [line(g.seg([0, 0.6, 0.34, 0.6], [0.34, 0.3, 0.34, 0.7], [0.44, 0.24, 0.44, 0.76], [0.44, 0.3, 1, 0.3], [0.44, 0.7, 1, 0.7], [1, 0, 1, 0.3], [1, 0.7, 1, 1]))], { style: { fill: 'none', lineWidth: 2 }, kind: 'lineShape', points: [[0, 0.6], [1, 0], [1, 1]], text: [0, 1.05, 1, 1.5], qs: 'subtle' });

  // ───────────────────────── process (P&ID)
  d('pidBall', 'process', 60, 40, '볼 밸브', 'Ball Valve', (g) => [main(g.pol([0, 0], [0.5, 0.5], [0, 1])), main(g.pol([1, 0], [0.5, 0.5], [1, 1])), solid(g.dot(0.5, 0.5, 0.2))], { ...below, points: ENDS });
  d('pidGlobe', 'process', 60, 40, '글로브 밸브', 'Globe Valve', (g) => [main(g.pol([0, 0], [1, 1], [1, 0], [0, 1])), line(g.seg([0.5, 0.5, 0.5, 0]))], { ...below, points: ENDS });
  d('pidButterfly', 'process', 60, 40, '버터플라이 밸브', 'Butterfly Valve', (g) => [line(g.seg([0, 0, 0, 1], [1, 0, 1, 1], [0, 0.5, 0.18, 0.5], [0.82, 0.5, 1, 0.5])), solid(g.dot(0.5, 0.5, 0.12)), line(g.seg([0.28, 0, 0.72, 1]))], { ...below, style: { fill: 'none' }, points: ENDS });
  d('pidBlower', 'process', 70, 70, '송풍기', 'Blower', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(`${g.seg([0.5, 0.5, 0.5, 0.12], [0.5, 0.5, 0.84, 0.68], [0.5, 0.5, 0.16, 0.68])}`)], { aspect: true, ...below });
  d('pidBoiler', 'process', 80, 110, '보일러', 'Boiler', (g) => [main(g.box(0, 0, 1, 1, 20)), line(g.open([0.12, 0.72], [0.28, 0.6], [0.44, 0.72], [0.6, 0.6], [0.76, 0.72], [0.88, 0.62]))], { qs: 'subtle', text: [0, 0.12, 1, 0.56] });
  d('pidCooler', 'process', 90, 70, '냉각탑', 'Cooling Tower', (g) => [main(g.pol([0.14, 0], [0.86, 0], [0.74, 0.46], [1, 1], [0, 1], [0.26, 0.46]))], { qs: 'subtle', text: BELOW });
  d('pidMixer', 'process', 80, 100, '혼합기', 'Mixer', (g) => [main(g.box(0, 0.16, 1, 0.84, 8)), line(g.seg([0.5, 0, 0.5, 0.74], [0.24, 0.74, 0.76, 0.74], [0.3, 0.6, 0.7, 0.88], [0.7, 0.6, 0.3, 0.88]))], below);
  d('pidSilo', 'process', 70, 120, '사일로', 'Silo', (g) => [main(`${M(0, g.h * 0.16)}A${f(g.w / 2)} ${f(g.h * 0.16)} 0 0 1 ${f(g.w)} ${f(g.h * 0.16)}V${f(g.h * 0.68)}L${f(g.w * 0.6)} ${f(g.h)}H${f(g.w * 0.4)}L0 ${f(g.h * 0.68)}Z`)], { qs: 'subtle', text: [0, 0.2, 1, 0.66] });
  d('pidConveyor', 'process', 150, 50, '컨베이어', 'Conveyor', (g) => [main(rect(0, g.h * 0.2, g.w, g.h * 0.6, g.h * 0.3)), line(`${g.oval(0.14, 0.5, 0.08, 0.26)}${g.oval(0.86, 0.5, 0.08, 0.26)}`)], { ...below, points: ENDS });
  d('pidPipeTee', 'process', 70, 60, 'T 배관', 'Tee Fitting', (g) => [main(g.pol([0, 0.26], [1, 0.26], [1, 0.62], [0.68, 0.62], [0.68, 1], [0.32, 1], [0.32, 0.62], [0, 0.62]))], { ...below, points: [[0, 0.44], [1, 0.44], [0.5, 1]] });
  d('pidReducer', 'process', 70, 50, '레듀서', 'Reducer', (g) => [main(g.pol([0, 0], [1, 0.26], [1, 0.74], [0, 1]))], { ...below, points: ENDS });
  d('pidGauge', 'process', 60, 60, '압력계', 'Pressure Gauge', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.seg([0.5, 0.5, 0.74, 0.26])), solid(g.dot(0.5, 0.5, 0.06))], { aspect: true, ...below });

  // ───────────────────────── wireframe
  d('uiAvatar', 'wireframe', 60, 60, '프로필', 'Avatar', (g) => [main(g.oval(0.5, 0.5, 0.5)), light(g.oval(0.5, 0.38, 0.16)), light(`${M(g.w * 0.22, g.h * 0.82)}C${f(g.w * 0.22)} ${f(g.h * 0.5)} ${f(g.w * 0.78)} ${f(g.h * 0.5)} ${f(g.w * 0.78)} ${f(g.h * 0.82)}Z`)], { aspect: true, ...below });
  d('uiSidebar', 'wireframe', 120, 300, '사이드바', 'Sidebar', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.14, 0.1, 0.86, 0.1], [0.14, 0.2, 0.86, 0.2], [0.14, 0.3, 0.86, 0.3], [0.14, 0.4, 0.86, 0.4]))], { qs: 'subtle', text: [0, 0.5, 1, 1] });
  d('uiModal', 'wireframe', 240, 150, '대화 상자', 'Dialog', (g) => [main(g.box(0, 0, 1, 1, 6)), dark(g.box(0, 0, 1, 0.2, 6)), line(g.seg([0.92, 0.06, 0.97, 0.14], [0.97, 0.06, 0.92, 0.14])), light(g.box(0.56, 0.74, 0.18, 0.16, 3)), light(g.box(0.77, 0.74, 0.18, 0.16, 3))], { qs: 'subtle', text: [0.03, 0.22, 0.97, 0.7] });
  d('uiPagination', 'wireframe', 170, 32, '페이지 번호', 'Pagination', (g) => [main(g.box(0, 0, 0.18, 1, 3)), light(g.box(0.21, 0, 0.18, 1, 3)), main(g.box(0.41, 0, 0.18, 1, 3)), main(g.box(0.61, 0, 0.18, 1, 3)), main(g.box(0.82, 0, 0.18, 1, 3))], below);
  d('uiBreadcrumb', 'wireframe', 180, 26, '경로 표시', 'Breadcrumb', (g) => [main(g.pol([0, 0], [0.28, 0], [0.34, 0.5], [0.28, 1], [0, 1])), main(g.pol([0.36, 0], [0.62, 0], [0.68, 0.5], [0.62, 1], [0.36, 1], [0.42, 0.5])), main(g.pol([0.7, 0], [0.94, 0], [1, 0.5], [0.94, 1], [0.7, 1], [0.76, 0.5]))], below);
  d('uiTooltip', 'wireframe', 130, 50, '풍선 도움말', 'Tooltip', (g) => [main(g.pol([0, 0], [1, 0], [1, 0.74], [0.56, 0.74], [0.5, 1], [0.44, 0.74], [0, 0.74]))], { qs: 'subtle', text: [0, 0, 1, 0.74] });
  d('uiProgress', 'wireframe', 170, 18, '진행 표시', 'Progress', (g) => [light(g.box(0, 0, 1, 1, g.h / 2)), main(g.box(0, 0, 0.6, 1, g.h / 2))], below);
  d('uiSpinner', 'wireframe', 40, 40, '불러오는 중', 'Spinner', (g) => [line(g.arc(0.5, 0.06, 0.44, 0.44, 0.94, 0.5, 1, 1))], { aspect: true, text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 3 } });
  d('uiVideo', 'wireframe', 180, 110, '동영상', 'Video', (g) => [main(g.box(0, 0, 1, 1, 3)), light(g.pol([0.42, 0.28], [0.62, 0.45], [0.42, 0.62])), line(g.seg([0.04, 0.88, 0.96, 0.88]))], below);
  d('uiChip', 'wireframe', 80, 28, '태그 칩', 'Chip', (g) => [main(rect(0, 0, g.w, g.h, g.h / 2))], sub);
  d('uiTextarea', 'wireframe', 200, 90, '여러 줄 입력', 'Text Area', (g) => [main(g.box(0, 0, 1, 1, 3)), line(g.seg([0.9, 0.96, 0.98, 0.8], [0.95, 0.96, 0.98, 0.9]))], { qs: 'outline', text: [0.02, 0.02, 0.98, 0.98] });
  d('uiCalendar', 'wireframe', 150, 130, '달력', 'Date Picker', (g) => [main(g.box(0, 0, 1, 1, 3)), dark(g.box(0, 0, 1, 0.2, 3)), line(g.seg([0, 0.4, 1, 0.4], [0, 0.6, 1, 0.6], [0, 0.8, 1, 0.8], [0.25, 0.2, 0.25, 1], [0.5, 0.2, 0.5, 1], [0.75, 0.2, 0.75, 1]))], below);

  // ───────────────────────── cloud
  d('cldServerless', 'cloud', 80, 80, '백엔드 서비스', 'Managed Service', (g) => [main(g.pol([0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.25])), line(g.seg([0.5, 0.5, 0.5, 1], [0.5, 0.5, 0, 0.25], [0.5, 0.5, 1, 0.25]))], below);
  d('cldVpc', 'cloud', 320, 220, '가상 네트워크', 'Virtual Network', (g) => [main(g.box(0, 0, 1, 1, 6))], { kind: 'container', header: 'top', qs: 'outline', style: { dash: 'dash' }, text: [0, 0, 1, 0], textHeader: true });
  d('cldSubnet', 'cloud', 240, 150, '서브넷', 'Subnet', (g) => [main(g.box(0, 0, 1, 1, 4))], { kind: 'container', header: 'top', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true });
  d('cldAutoscale', 'cloud', 90, 70, '자동 확장', 'Auto Scaling', (g) => [main(g.box(0, 0, 1, 1, 5)), line(g.seg([0.5, 0.2, 0.5, 0.8], [0.2, 0.5, 0.8, 0.5])), line(g.open([0.42, 0.3], [0.5, 0.2], [0.58, 0.3])), line(g.open([0.42, 0.7], [0.5, 0.8], [0.58, 0.7])), line(g.open([0.28, 0.4], [0.2, 0.5], [0.28, 0.6])), line(g.open([0.72, 0.4], [0.8, 0.5], [0.72, 0.6]))], below);
  d('cldStream', 'cloud', 100, 60, '데이터 스트림', 'Data Stream', (g) => [main(g.box(0, 0, 1, 1, 4)), line(`${g.open([0.08, 0.3], [0.3, 0.3], [0.4, 0.2], [0.6, 0.4], [0.7, 0.3], [0.92, 0.3])}${g.open([0.08, 0.7], [0.3, 0.7], [0.4, 0.6], [0.6, 0.8], [0.7, 0.7], [0.92, 0.7])}`)], below);
  d('cldBackup', 'cloud', 80, 80, '백업', 'Backup', (g) => [main(g.box(0, 0, 1, 1, 6)), line(g.arc(0.72, 0.36, 0.26, 0.26, 0.3, 0.42, 1, 0)), line(g.open([0.2, 0.34], [0.3, 0.44], [0.42, 0.36])), line(g.seg([0.5, 0.42, 0.5, 0.6], [0.5, 0.6, 0.64, 0.68]))], below);
  d('cldSecret', 'cloud', 70, 80, '비밀 저장소', 'Secrets Vault', (g) => [main(g.box(0, 0, 1, 1, 5)), line(g.oval(0.5, 0.46, 0.22)), line(g.seg([0.5, 0.24, 0.5, 0.68], [0.28, 0.46, 0.72, 0.46], [0.14, 0.9, 0.3, 0.9], [0.7, 0.9, 0.86, 0.9]))], below);
  d('cldLogs', 'cloud', 80, 70, '로그', 'Logs', (g) => [main(g.box(0, 0, 1, 1, 4)), line(g.seg([0.14, 0.25, 0.86, 0.25], [0.14, 0.45, 0.68, 0.45], [0.14, 0.65, 0.86, 0.65], [0.14, 0.82, 0.52, 0.82]))], below);
  d('cldNotify', 'cloud', 70, 70, '알림', 'Notification', (g) => [main(`${M(g.w * 0.12, g.h * 0.78)}C${f(g.w * 0.26)} ${f(g.h * 0.6)} ${f(g.w * 0.16)} ${f(g.h * 0.12)} ${f(g.w / 2)} ${f(g.h * 0.08)}C${f(g.w * 0.84)} ${f(g.h * 0.12)} ${f(g.w * 0.74)} ${f(g.h * 0.6)} ${f(g.w * 0.88)} ${f(g.h * 0.78)}Z`), solid(g.dot(0.5, 0.88, 0.09))], below);
  d('cldAi', 'cloud', 80, 80, 'AI 모델', 'AI Model', (g) => [main(g.box(0, 0, 1, 1, 8)), line(g.seg([0.28, 0.3, 0.72, 0.5], [0.28, 0.7, 0.72, 0.5], [0.28, 0.3, 0.28, 0.7])), solid(`${g.dot(0.28, 0.3, 0.07)}${g.dot(0.28, 0.7, 0.07)}${g.dot(0.72, 0.5, 0.07)}`)], below);
  d('cldUserGroup', 'cloud', 90, 70, '사용자 그룹', 'User Group', (g) => [main(g.oval(0.32, 0.26, 0.14, 0.2)), main(g.oval(0.68, 0.26, 0.14, 0.2)), main(`${M(0, g.h)}C0 ${f(g.h * 0.46)} ${f(g.w * 0.6)} ${f(g.h * 0.46)} ${f(g.w * 0.6)} ${f(g.h)}Z`), main(`${M(g.w * 0.4, g.h)}C${f(g.w * 0.4)} ${f(g.h * 0.46)} ${f(g.w)} ${f(g.h * 0.46)} ${f(g.w)} ${f(g.h)}Z`)], below);
  d('cldEdge', 'cloud', 80, 70, '엣지 장치', 'Edge Device', (g) => [main(g.box(0, 0.3, 1, 0.7, 5)), line(g.seg([0.2, 0.3, 0.2, 0.08], [0.8, 0.3, 0.8, 0.08])), solid(`${g.dot(0.16, 0.6, 0.05)}${g.dot(0.3, 0.6, 0.05)}`)], below);

  // ───────────────────────── security
  d('secFirewallCheck', 'security', 90, 70, '웹 방화벽', 'Web Firewall', (g) => [main(g.box(0, 0, 1, 1, 3)), line(g.seg([0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 2 / 3], [0.5, 0, 0.5, 1 / 3], [0.25, 1 / 3, 0.25, 2 / 3], [0.75, 1 / 3, 0.75, 2 / 3], [0.5, 2 / 3, 0.5, 1]))], below);
  d('secHacker', 'security', 70, 80, '공격자', 'Attacker', (g) => [main(`${M(g.w * 0.5, 0)}C${f(g.w * 0.9)} 0 ${f(g.w * 0.86)} ${f(g.h * 0.6)} ${f(g.w)} ${f(g.h * 0.7)}H0C${f(g.w * 0.14)} ${f(g.h * 0.6)} ${f(g.w * 0.1)} 0 ${f(g.w * 0.5)} 0Z`), solid(g.oval(0.5, 0.36, 0.2, 0.18)), main(g.box(0.1, 0.74, 0.8, 0.26, 4))], { text: BELOW, style: { fill: '#b9c2cc', line: '#3c4043', textColor: ink } });
  d('secPassword', 'security', 130, 44, '비밀번호', 'Password', (g) => [main(g.box(0, 0, 1, 1, 5)), solid(`${g.dot(0.18, 0.5, 0.12)}${g.dot(0.38, 0.5, 0.12)}${g.dot(0.58, 0.5, 0.12)}${g.dot(0.78, 0.5, 0.12)}`)], below);
  d('secEncrypt', 'security', 90, 70, '암호화', 'Encryption', (g) => [main(g.box(0, 0, 1, 1, 5)), line(g.arc(0.38, 0.42, 0.12, 0.2, 0.62, 0.42)), solid(g.box(0.32, 0.42, 0.36, 0.32, 2))], below);
  d('secToken', 'security', 80, 50, '인증 토큰', 'Auth Token', (g) => [main(g.box(0, 0, 1, 1, 8)), solid(g.dot(0.2, 0.5, 0.14)), line(g.seg([0.4, 0.34, 0.86, 0.34], [0.4, 0.66, 0.72, 0.66]))], below);
  d('secScan', 'security', 80, 80, '취약점 점검', 'Vulnerability Scan', (g) => [main(g.oval(0.42, 0.42, 0.42)), line(g.seg([0.72, 0.72, 1, 1], [0.24, 0.42, 0.36, 0.54], [0.36, 0.54, 0.6, 0.3]))], below);
  d('secAudit', 'security', 70, 90, '감사 기록', 'Audit Log', (g) => [main(g.box(0, 0.08, 1, 0.92, 4)), dark(g.box(0.3, 0, 0.4, 0.16, 2)), line(g.seg([0.16, 0.36, 0.84, 0.36], [0.16, 0.54, 0.84, 0.54], [0.16, 0.72, 0.6, 0.72]))], below);
  d('secBlock', 'security', 70, 70, '차단', 'Block', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.seg([0.2, 0.5, 0.8, 0.5]))], { aspect: true, text: BELOW, style: { fill: '#fde8e8', line: '#c0392b', lineWidth: 3, textColor: ink } });
  d('secSafe', 'security', 80, 80, '금고', 'Safe', (g) => [main(g.box(0, 0, 1, 0.92, 4)), line(`${g.oval(0.5, 0.46, 0.22)}${g.seg([0.5, 0.46, 0.64, 0.34], [0.14, 0.92, 0.14, 1], [0.86, 0.92, 0.86, 1])}`)], below);
  d('secZone', 'security', 300, 200, '보안 영역', 'Security Zone', (g) => [main(g.box(0, 0, 1, 1, 8))], { kind: 'container', header: 'top', style: { fill: '#fde8e8', line: '#c0392b', dash: 'dash', fillOpacity: 40, textColor: ink }, text: [0, 0, 1, 0], textHeader: true });

  // ───────────────────────── business
  d('bizHandshake', 'business', 100, 60, '협력', 'Partnership', (g) => [main(g.pol([0, 0.2], [0.3, 0.1], [0.5, 0.3], [0.7, 0.1], [1, 0.2], [1, 0.7], [0.72, 0.8], [0.5, 1], [0.28, 0.8], [0, 0.7])), line(g.seg([0.34, 0.5, 0.5, 0.66], [0.46, 0.42, 0.62, 0.58]))], below);
  d('bizTarget', 'business', 80, 80, '목표', 'Goal', (g) => [main(g.oval(0.5, 0.5, 0.5)), light(g.oval(0.5, 0.5, 0.32)), main(g.oval(0.5, 0.5, 0.14))], { aspect: true, ...below });
  d('bizGrowth', 'business', 100, 80, '성장', 'Growth', (g) => [main(g.box(0.04, 0.66, 0.2, 0.34)), main(g.box(0.3, 0.46, 0.2, 0.54)), main(g.box(0.56, 0.26, 0.2, 0.74)), line(g.open([0.02, 0.5], [0.4, 0.2], [0.88, 0.08])), solid(g.pol([0.82, 0], [1, 0.05], [0.86, 0.17]))], below);
  d('bizInvoice', 'business', 70, 90, '청구서', 'Invoice', (g) => [main(g.pol([0, 0], [1, 0], [1, 1], [0.8, 0.92], [0.6, 1], [0.4, 0.92], [0.2, 1], [0, 0.92])), line(g.seg([0.16, 0.2, 0.84, 0.2], [0.16, 0.38, 0.84, 0.38], [0.16, 0.56, 0.56, 0.56]))], below);
  d('bizCreditCard', 'business', 100, 66, '카드 결제', 'Credit Card', (g) => [main(g.box(0, 0, 1, 1, 6)), dark(g.box(0, 0.2, 1, 0.2)), line(g.seg([0.08, 0.72, 0.42, 0.72]))], below);
  d('bizPresentation', 'business', 100, 90, '발표', 'Presentation', (g) => [main(g.box(0, 0, 1, 0.7, 2)), line(g.seg([0.5, 0.7, 0.5, 0.82], [0.5, 0.82, 0.24, 1], [0.5, 0.82, 0.76, 1])), line(g.open([0.14, 0.52], [0.36, 0.32], [0.54, 0.44], [0.86, 0.16]))], below);
  d('bizMeeting', 'business', 100, 80, '회의', 'Meeting', (g) => [main(g.oval(0.5, 0.56, 0.3, 0.2)), main(g.oval(0.5, 0.14, 0.1, 0.13)), main(g.oval(0.08, 0.56, 0.08, 0.1)), main(g.oval(0.92, 0.56, 0.08, 0.1)), main(g.oval(0.5, 0.9, 0.1, 0.1))], below);
  d('bizWarehouse', 'business', 110, 80, '창고', 'Warehouse', (g) => [main(g.pol([0, 0.3], [0.5, 0], [1, 0.3], [1, 1], [0, 1])), line(`${g.box(0.24, 0.5, 0.52, 0.5)}${g.seg([0.24, 0.66, 0.76, 0.66], [0.24, 0.82, 0.76, 0.82])}`)], below);
  d('bizCustomer', 'business', 70, 80, '고객', 'Customer', (g) => [main(g.oval(0.5, 0.2, 0.2)), main(`${M(0, g.h)}C0 ${f(g.h * 0.42)} ${f(g.w)} ${f(g.h * 0.42)} ${f(g.w)} ${f(g.h)}Z`), solid(g.pol([0.5, 0.56], [0.58, 0.72], [0.5, 0.9], [0.42, 0.72]))], below);
  d('bizStar', 'business', 90, 40, '평점', 'Rating', (g) => [solid([0.1, 0.3, 0.5, 0.7, 0.9].map((x) => g.pol([x, 0.1], [x + 0.03, 0.42], [x + 0.09, 0.42], [x + 0.04, 0.6], [x + 0.06, 0.9], [x, 0.72], [x - 0.06, 0.9], [x - 0.04, 0.6], [x - 0.09, 0.42], [x - 0.03, 0.42])).join(''))], { text: BELOW, style: { line: '#d89b00', fill: '#ffd54f', textColor: ink } });
  d('bizGlobe', 'business', 80, 80, '글로벌', 'Global', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(`${g.oval(0.5, 0.5, 0.22, 0.5)}${g.seg([0, 0.5, 1, 0.5], [0.08, 0.24, 0.92, 0.24], [0.08, 0.76, 0.92, 0.76])}`)], { aspect: true, ...below });
  d('bizPhone', 'business', 70, 70, '전화 상담', 'Call', (g) => [main(`${M(g.w * 0.12, g.h * 0.08)}L${f(g.w * 0.3)} ${f(g.h * 0.02)}L${f(g.w * 0.42)} ${f(g.h * 0.28)}L${f(g.w * 0.3)} ${f(g.h * 0.38)}Q${f(g.w * 0.42)} ${f(g.h * 0.6)} ${f(g.w * 0.62)} ${f(g.h * 0.7)}L${f(g.w * 0.72)} ${f(g.h * 0.58)}L${f(g.w)} ${f(g.h * 0.7)}L${f(g.w * 0.92)} ${f(g.h * 0.88)}Q${f(g.w * 0.3)} ${f(g.h * 1.02)} ${f(g.w * 0.12)} ${f(g.h * 0.08)}Z`)], below);

  // ───────────────────────── data flow diagram
  d('dfdProcess', 'dfd', 110, 110, '처리', 'Process', (g) => [main(g.oval(0.5, 0.5, 0.5))], { aspect: true, qs: 'subtle', text: [0.12, 0.12, 0.88, 0.88] });
  d('dfdProcessRound', 'dfd', 140, 90, '처리(둥근)', 'Process (Gane-Sarson)', (g) => [main(g.box(0, 0, 1, 1, 12)), line(g.seg([0, 0.26, 1, 0.26]))], { qs: 'subtle', text: [0, 0.28, 1, 1] });
  d('dfdExternal', 'dfd', 130, 70, '외부 개체', 'External Entity', (g) => [main(g.box(0, 0, 1, 1))], { qs: 'fill' });
  d('dfdExternal3d', 'dfd', 130, 70, '외부 개체(입체)', 'External Entity (3-D)', (g) => [dark(g.box(0.06, 0.1, 0.94, 0.9)), main(g.box(0, 0, 0.94, 0.9))], { text: [0, 0, 0.94, 0.9] });
  d('dfdStore', 'dfd', 150, 50, '데이터 저장소', 'Data Store', (g) => [line(g.seg([0, 0, 1, 0], [0, 1, 1, 1]))], { style: { fill: 'none' }, qs: 'subtle' });
  d('dfdStoreOpen', 'dfd', 150, 50, '저장소(열린 칸)', 'Data Store (Open)', (g) => [main(g.pol([0, 0], [1, 0], [1, 1], [0, 1])), line(g.seg([0.16, 0, 0.16, 1]))], { qs: 'subtle', text: [0.16, 0, 1, 1] });
  d('dfdFile', 'dfd', 90, 90, '파일', 'File', (g) => [main(g.pol([0, 0], [0.72, 0], [1, 0.28], [1, 1], [0, 1])), line(g.open([0.72, 0], [0.72, 0.28], [1, 0.28]))], { qs: 'subtle', text: [0, 0.3, 1, 1] });
  d('dfdSource', 'dfd', 90, 60, '데이터 출처', 'Data Source', (g) => [main(g.box(0, 0, 0.8, 1)), solid(g.pol([0.8, 0.3], [1, 0.5], [0.8, 0.7]))], { qs: 'subtle', text: [0, 0, 0.8, 1], points: [[1, 0.5], [0.4, 0], [0.4, 1], [0, 0.5]] });
  d('dfdSink', 'dfd', 90, 60, '데이터 목적지', 'Data Sink', (g) => [solid(g.pol([0, 0.3], [0.2, 0.5], [0, 0.7])), main(g.box(0.2, 0, 0.8, 1))], { qs: 'subtle', text: [0.2, 0, 1, 1], points: [[0, 0.5], [0.6, 0], [0.6, 1], [1, 0.5]] });
  d('dfdBoundary', 'dfd', 340, 240, '시스템 경계', 'System Boundary', (g) => [main(g.box(0, 0, 1, 1, 22))], { kind: 'container', header: 'top', qs: 'outline', style: { dash: 'dash' }, text: [0, 0, 1, 0], textHeader: true });
  d('dfdFlowLabel', 'dfd', 100, 26, '흐름 이름', 'Flow Label', (g) => [main(g.box(0, 0, 1, 1, g.h / 2))], { qs: 'outline', style: { fontSize: 11 } });
  d('dfdJunction', 'dfd', 24, 24, '합류점', 'Flow Junction', (g) => [solid(g.oval(0.5, 0.5, 0.5))], { aspect: true, text: BELOW, qs: 'subtle' });
  d('dfdTransform', 'dfd', 130, 70, '변환', 'Transform', (g) => [main(g.pol([0, 0], [0.86, 0], [1, 0.5], [0.86, 1], [0, 1], [0.14, 0.5]))], { qs: 'subtle', text: [0.14, 0, 0.86, 1] });

  // ───────────────────────── genogram & relationships
  const gene = { aspect: true, text: BELOW, qs: 'outline', points: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] };
  d('genMale', 'genogram', 50, 50, '남성', 'Male', (g) => [main(g.box(0, 0, 1, 1))], gene);
  d('genFemale', 'genogram', 50, 50, '여성', 'Female', (g) => [main(g.oval(0.5, 0.5, 0.5))], gene);
  d('genUnknown', 'genogram', 50, 50, '성별 미상', 'Unknown Gender', (g) => [main(g.pol([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]))], gene);
  d('genMaleDead', 'genogram', 50, 50, '남성(사망)', 'Male (Deceased)', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0, 0, 1, 1], [1, 0, 0, 1]))], gene);
  d('genFemaleDead', 'genogram', 50, 50, '여성(사망)', 'Female (Deceased)', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.seg([0.14, 0.14, 0.86, 0.86], [0.86, 0.14, 0.14, 0.86]))], gene);
  d('genMaleSelf', 'genogram', 50, 50, '본인(남)', 'Self (Male)', (g) => [main(g.box(0, 0, 1, 1)), line(g.box(0.12, 0.12, 0.76, 0.76))], gene);
  d('genFemaleSelf', 'genogram', 50, 50, '본인(여)', 'Self (Female)', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.oval(0.5, 0.5, 0.38))], gene);
  d('genPregnancy', 'genogram', 50, 50, '임신', 'Pregnancy', (g) => [main(g.pol([0.5, 0], [1, 1], [0, 1]))], { ...gene, points: [[0.5, 0], [0.5, 1]] });
  d('genMarriage', 'genogram', 120, 30, '혼인', 'Marriage', (g) => [line(g.open([0, 0], [0, 1], [1, 1], [1, 0]))], { style: { fill: 'none' }, qs: 'subtle', kind: 'lineShape', points: [[0, 0], [1, 0], [0.5, 1]], text: [0, 1.05, 1, 1.9] });
  d('genDivorce', 'genogram', 120, 30, '이혼', 'Divorce', (g) => [line(g.open([0, 0], [0, 1], [1, 1], [1, 0])), line(g.seg([0.45, 0.4, 0.51, 1], [0.52, 0.4, 0.58, 1]))], { style: { fill: 'none' }, qs: 'subtle', kind: 'lineShape', points: [[0, 0], [1, 0], [0.5, 1]], text: [0, 1.05, 1, 1.9] });
  d('genCohabit', 'genogram', 120, 30, '동거', 'Cohabiting', (g) => [line(g.open([0, 0], [0, 1], [1, 1], [1, 0]))], { style: { fill: 'none', dash: 'dash' }, qs: 'subtle', kind: 'lineShape', points: [[0, 0], [1, 0], [0.5, 1]], text: [0, 1.05, 1, 1.9] });
  d('genTwins', 'genogram', 80, 50, '쌍둥이', 'Twins', (g) => [line(g.open([0, 1], [0.5, 0], [1, 1]))], { style: { fill: 'none' }, qs: 'subtle', kind: 'lineShape', points: [[0.5, 0], [0, 1], [1, 1]], text: [0, 1.05, 1, 1.9] });
  d('genChildLine', 'genogram', 120, 50, '자녀 연결', 'Children Line', (g) => [line(g.open([0, 1], [0, 0.4], [1, 0.4], [1, 1])), line(g.seg([0.5, 0, 0.5, 1]))], { style: { fill: 'none' }, qs: 'subtle', kind: 'lineShape', points: [[0.5, 0], [0, 1], [0.5, 1], [1, 1]], text: [0, 1.05, 1, 1.9] });

  // ───────────────────────── maps & places
  d('mapPin', 'maps', 40, 56, '위치 표시', 'Map Pin', (g) => [main(`${M(g.w / 2, g.h)}C${f(g.w * 0.1)} ${f(g.h * 0.62)} 0 ${f(g.h * 0.46)} 0 ${f(g.w / 2)}A${f(g.w / 2)} ${f(g.w / 2)} 0 0 1 ${f(g.w)} ${f(g.w / 2)}C${f(g.w)} ${f(g.h * 0.46)} ${f(g.w * 0.9)} ${f(g.h * 0.62)} ${f(g.w / 2)} ${f(g.h)}Z`), light(g.dot(0.5, 0.35, 0.2))], { text: BELOW, style: { fill: '#e5484d', line: '#a32a2e', textColor: ink } });
  d('mapRoadH', 'maps', 240, 44, '도로(가로)', 'Road (Horizontal)', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.02, 0.5, 0.12, 0.5], [0.2, 0.5, 0.3, 0.5], [0.38, 0.5, 0.48, 0.5], [0.56, 0.5, 0.66, 0.5], [0.74, 0.5, 0.84, 0.5], [0.9, 0.5, 0.98, 0.5]))], { text: BELOW, style: { fill: '#9aa0a6', line: '#5f6368', textColor: ink } });
  d('mapRoadV', 'maps', 44, 240, '도로(세로)', 'Road (Vertical)', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.5, 0.02, 0.5, 0.12], [0.5, 0.2, 0.5, 0.3], [0.5, 0.38, 0.5, 0.48], [0.5, 0.56, 0.5, 0.66], [0.5, 0.74, 0.5, 0.84], [0.5, 0.9, 0.5, 0.98]))], { text: [1.1, 0, 4, 1], style: { fill: '#9aa0a6', line: '#5f6368', textColor: ink } });
  d('mapCross', 'maps', 120, 120, '교차로', 'Intersection', (g) => [main(g.pol([0.32, 0], [0.68, 0], [0.68, 0.32], [1, 0.32], [1, 0.68], [0.68, 0.68], [0.68, 1], [0.32, 1], [0.32, 0.68], [0, 0.68], [0, 0.32], [0.32, 0.32]))], { text: BELOW, style: { fill: '#9aa0a6', line: '#5f6368', textColor: ink } });
  d('mapRiver', 'maps', 240, 70, '강', 'River', (g) => [main(`${M(0, g.h * 0.3)}C${f(g.w * 0.25)} 0 ${f(g.w * 0.45)} ${f(g.h * 0.6)} ${f(g.w)} ${f(g.h * 0.2)}V${f(g.h * 0.7)}C${f(g.w * 0.45)} ${f(g.h)} ${f(g.w * 0.25)} ${f(g.h * 0.45)} 0 ${f(g.h * 0.8)}Z`)], { style: { fill: '#b3dcf5', line: '#4a9cc7', textColor: '#0f3a52' }, text: [0.1, 0.2, 0.9, 0.8] });
  d('mapPark', 'maps', 150, 110, '공원', 'Park', (g) => [main(g.box(0, 0, 1, 1, 12)), solid(`${g.dot(0.26, 0.3, 0.08)}${g.dot(0.74, 0.3, 0.08)}${g.dot(0.5, 0.74, 0.08)}`)], { style: { fill: '#c8e6c9', line: '#2e7d32', textColor: '#14401d' }, text: [0.1, 0.36, 0.9, 0.7] });
  d('mapBuilding', 'maps', 70, 90, '건물', 'Building', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.25, 0.14, 0.42, 0.14], [0.58, 0.14, 0.75, 0.14], [0.25, 0.32, 0.42, 0.32], [0.58, 0.32, 0.75, 0.32], [0.25, 0.5, 0.42, 0.5], [0.58, 0.5, 0.75, 0.5])), line(g.box(0.38, 0.72, 0.24, 0.28))], below);
  d('mapHouse', 'maps', 70, 70, '집', 'House', (g) => [main(g.pol([0.5, 0], [1, 0.46], [0.86, 0.46], [0.86, 1], [0.14, 1], [0.14, 0.46], [0, 0.46])), line(g.box(0.4, 0.62, 0.2, 0.38))], below);
  d('mapHospital', 'maps', 60, 60, '병원', 'Hospital', (g) => [main(g.box(0, 0, 1, 1, 6)), solid(g.pol([0.4, 0.2], [0.6, 0.2], [0.6, 0.4], [0.8, 0.4], [0.8, 0.6], [0.6, 0.6], [0.6, 0.8], [0.4, 0.8], [0.4, 0.6], [0.2, 0.6], [0.2, 0.4], [0.4, 0.4]))], { text: BELOW, style: { fill: '#ffffff', line: '#c0392b', textColor: ink } });
  d('mapSchool', 'maps', 80, 70, '학교', 'School', (g) => [main(g.pol([0, 0.5], [0.3, 0.5], [0.5, 0.26], [0.7, 0.5], [1, 0.5], [1, 1], [0, 1])), line(g.seg([0.5, 0.26, 0.5, 0])), solid(g.pol([0.5, 0], [0.7, 0.08], [0.5, 0.16]))], below);
  d('mapParking', 'maps', 50, 50, '주차', 'Parking', (g) => [main(g.box(0, 0, 1, 1, 6)), line(g.open([0.36, 0.82], [0.36, 0.2], [0.58, 0.2], [0.7, 0.34], [0.58, 0.48], [0.36, 0.48]))], { aspect: true, text: BELOW, style: { fill: '#c7dcff', line: '#2f6fde', lineWidth: 2.5, textColor: ink } });
  d('mapCompass', 'maps', 70, 70, '나침반', 'Compass', (g) => [main(g.oval(0.5, 0.5, 0.5)), solid(g.pol([0.5, 0.08], [0.6, 0.5], [0.4, 0.5])), light(g.pol([0.5, 0.92], [0.6, 0.5], [0.4, 0.5]))], { aspect: true, ...below });
  d('mapScale', 'maps', 150, 26, '축척', 'Scale Bar', (g) => [line(g.seg([0, 0.4, 0, 1], [0.5, 0.4, 0.5, 1], [1, 0.4, 1, 1], [0, 1, 1, 1]))], { text: BELOW, qs: 'subtle', style: { fill: 'none' } });
  d('mapRoute', 'maps', 150, 90, '경로', 'Route', (g) => [line(g.open([0.06, 0.86], [0.3, 0.86], [0.42, 0.4], [0.66, 0.4], [0.94, 0.12])), solid(`${g.dot(0.06, 0.86, 0.07)}${g.dot(0.94, 0.12, 0.07)}`)], { text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2.5, dash: 'dash' } });

  // ───────────────────────── transport & logistics
  d('trCar', 'transport', 110, 60, '승용차', 'Car', (g) => [main(g.pol([0, 0.5], [0.18, 0.46], [0.32, 0.1], [0.72, 0.1], [0.88, 0.46], [1, 0.54], [1, 0.82], [0, 0.82])), light(g.pol([0.36, 0.2], [0.68, 0.2], [0.78, 0.46], [0.3, 0.46])), solid(`${g.dot(0.24, 0.82, 0.16)}${g.dot(0.76, 0.82, 0.16)}`)], below);
  d('trBus', 'transport', 130, 66, '버스', 'Bus', (g) => [main(g.box(0, 0, 1, 0.82, 6)), light(`${g.box(0.06, 0.14, 0.2, 0.3)}${g.box(0.3, 0.14, 0.2, 0.3)}${g.box(0.54, 0.14, 0.2, 0.3)}${g.box(0.78, 0.14, 0.16, 0.3)}`), solid(`${g.dot(0.22, 0.84, 0.14)}${g.dot(0.78, 0.84, 0.14)}`)], below);
  d('trTrain', 'transport', 130, 66, '기차', 'Train', (g) => [main(g.pol([0, 0.82], [0, 0.3], [0.1, 0], [1, 0], [1, 0.82])), light(`${g.box(0.14, 0.14, 0.2, 0.3)}${g.box(0.4, 0.14, 0.2, 0.3)}${g.box(0.66, 0.14, 0.2, 0.3)}`), solid(`${g.dot(0.2, 0.86, 0.13)}${g.dot(0.5, 0.86, 0.13)}${g.dot(0.8, 0.86, 0.13)}`)], below);
  d('trPlane', 'transport', 110, 90, '비행기', 'Airplane', (g) => [main(g.pol([0.5, 0], [0.56, 0.1], [0.56, 0.36], [1, 0.6], [1, 0.7], [0.56, 0.56], [0.56, 0.8], [0.68, 0.92], [0.68, 1], [0.5, 0.94], [0.32, 1], [0.32, 0.92], [0.44, 0.8], [0.44, 0.56], [0, 0.7], [0, 0.6], [0.44, 0.36], [0.44, 0.1]))], below);
  d('trShip', 'transport', 120, 80, '배', 'Ship', (g) => [main(g.pol([0, 0.56], [1, 0.56], [0.84, 1], [0.14, 1])), light(g.box(0.26, 0.26, 0.42, 0.3)), main(g.box(0.42, 0, 0.14, 0.26))], below);
  d('trDrone', 'transport', 90, 70, '드론', 'Drone', (g) => [main(g.box(0.36, 0.38, 0.28, 0.24, 3)), line(g.seg([0.36, 0.42, 0.14, 0.2], [0.64, 0.42, 0.86, 0.2], [0.36, 0.58, 0.14, 0.8], [0.64, 0.58, 0.86, 0.8])), line(`${g.oval(0.14, 0.2, 0.12, 0.06)}${g.oval(0.86, 0.2, 0.12, 0.06)}${g.oval(0.14, 0.8, 0.12, 0.06)}${g.oval(0.86, 0.8, 0.12, 0.06)}`)], below);
  d('trBike', 'transport', 90, 60, '자전거', 'Bicycle', (g) => [line(`${g.oval(0.2, 0.7, 0.18, 0.28)}${g.oval(0.8, 0.7, 0.18, 0.28)}${g.open([0.2, 0.7], [0.4, 0.3], [0.68, 0.3], [0.8, 0.7])}${g.open([0.2, 0.7], [0.52, 0.7], [0.68, 0.3])}${g.seg([0.4, 0.3, 0.52, 0.7], [0.34, 0.2, 0.46, 0.2], [0.66, 0.12, 0.76, 0.12], [0.68, 0.3, 0.7, 0.12])}`)], { text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2 } });
  d('trContainer', 'transport', 130, 60, '컨테이너 화물', 'Shipping Container', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.14, 0, 0.14, 1], [0.28, 0, 0.28, 1], [0.42, 0, 0.42, 1], [0.56, 0, 0.56, 1], [0.7, 0, 0.7, 1], [0.84, 0, 0.84, 1]))], below);
  d('trBox', 'transport', 80, 80, '상자', 'Parcel', (g) => [main(g.pol([0, 0.26], [0.5, 0], [1, 0.26], [1, 0.8], [0.5, 1], [0, 0.8])), line(g.open([0, 0.26], [0.5, 0.5], [1, 0.26])), line(g.seg([0.5, 0.5, 0.5, 1]))], below);
  d('trPallet', 'transport', 120, 60, '팔레트', 'Pallet', (g) => [main(g.box(0.08, 0, 0.84, 0.66)), line(g.seg([0.5, 0, 0.5, 0.66], [0.08, 0.33, 0.92, 0.33])), dark(g.box(0, 0.7, 1, 0.1)), dark(`${g.box(0.04, 0.8, 0.14, 0.2)}${g.box(0.43, 0.8, 0.14, 0.2)}${g.box(0.82, 0.8, 0.14, 0.2)}`)], below);
  d('trForklift', 'transport', 100, 80, '지게차', 'Forklift', (g) => [main(g.pol([0.1, 0.46], [0.24, 0.46], [0.32, 0.1], [0.56, 0.1], [0.62, 0.46], [0.74, 0.46], [0.74, 0.84], [0.1, 0.84])), line(g.seg([0.82, 0, 0.82, 0.92], [0.82, 0.92, 1, 0.92])), solid(`${g.dot(0.26, 0.86, 0.13)}${g.dot(0.62, 0.86, 0.13)}`)], below);
  d('trTrafficLight', 'transport', 40, 90, '신호등', 'Traffic Light', (g) => [main(g.box(0, 0, 1, 1, 6)), light(g.dot(0.5, 0.2, 0.3)), light(g.dot(0.5, 0.5, 0.3)), light(g.dot(0.5, 0.8, 0.3))], { text: BELOW, style: { fill: '#37474f', line: '#263238', textColor: ink } });
  d('trStation', 'transport', 44, 44, '정류장', 'Station', (g) => [main(g.oval(0.5, 0.5, 0.5)), light(g.oval(0.5, 0.5, 0.26))], { aspect: true, ...below });

  // ───────────────────────── factory
  d('facPlant', 'factory', 130, 90, '공장 건물', 'Plant', (g) => [main(g.pol([0, 1], [0, 0.46], [0.26, 0.26], [0.26, 0.46], [0.52, 0.26], [0.52, 0.46], [0.78, 0.26], [0.78, 0], [0.94, 0], [0.94, 0.46], [1, 0.46], [1, 1]))], below);
  d('facRobot', 'factory', 90, 100, '로봇 팔', 'Robot Arm', (g) => [main(g.box(0.14, 0.86, 0.5, 0.14, 3)), line(g.open([0.38, 0.86], [0.26, 0.46], [0.66, 0.2], [0.86, 0.34])), solid(`${g.dot(0.26, 0.46, 0.09)}${g.dot(0.66, 0.2, 0.09)}`), line(g.open([0.92, 0.26], [0.86, 0.34], [0.94, 0.44]))], below);
  d('facConveyor', 'factory', 170, 56, '이송 벨트', 'Belt Conveyor', (g) => [main(rect(0, g.h * 0.26, g.w, g.h * 0.54, g.h * 0.27)), light(`${g.oval(0.1, 0.53, 0.05, 0.2)}${g.oval(0.3, 0.53, 0.05, 0.2)}${g.oval(0.5, 0.53, 0.05, 0.2)}${g.oval(0.7, 0.53, 0.05, 0.2)}${g.oval(0.9, 0.53, 0.05, 0.2)}`), solid(g.box(0.36, 0, 0.2, 0.26))], { ...below, points: ENDS });
  d('facCnc', 'factory', 110, 90, 'CNC 기계', 'CNC Machine', (g) => [main(g.box(0, 0, 1, 1, 4)), light(g.box(0.1, 0.12, 0.54, 0.5)), line(`${g.seg([0.74, 0.2, 0.9, 0.2], [0.74, 0.34, 0.9, 0.34], [0.74, 0.48, 0.9, 0.48])}${g.seg([0.37, 0.12, 0.37, 0.36])}`), solid(g.pol([0.33, 0.36], [0.41, 0.36], [0.37, 0.48]))], below);
  d('facPress', 'factory', 90, 110, '프레스', 'Press', (g) => [main(g.box(0, 0, 0.14, 1)), main(g.box(0.86, 0, 0.14, 1)), main(g.box(0, 0, 1, 0.14)), dark(g.box(0.28, 0.14, 0.44, 0.3)), main(g.box(0.14, 0.82, 0.72, 0.18))], below);
  d('facSensor', 'factory', 60, 60, '현장 센서', 'Field Sensor', (g) => [main(g.oval(0.5, 0.5, 0.3)), line(`${g.arc(0.14, 0.2, 0.5, 0.5, 0.14, 0.8, 0, 0)}${g.arc(0.86, 0.2, 0.5, 0.5, 0.86, 0.8)}`)], below);
  d('facPlc', 'factory', 90, 80, 'PLC', 'PLC', (g) => [main(g.box(0, 0, 1, 1, 3)), line(g.seg([0.2, 0, 0.2, 1], [0.4, 0, 0.4, 1])), solid(`${g.dot(0.1, 0.2, 0.05)}${g.dot(0.3, 0.2, 0.05)}`)], { qs: 'subtle', text: [0.4, 0, 1, 1] });
  d('facHmi', 'factory', 90, 70, '조작 패널', 'HMI Panel', (g) => [main(g.box(0, 0, 1, 1, 4)), light(g.box(0.08, 0.1, 0.84, 0.56)), solid(`${g.dot(0.24, 0.82, 0.07)}${g.dot(0.5, 0.82, 0.07)}${g.dot(0.76, 0.82, 0.07)}`)], below);
  d('facInspect', 'factory', 80, 80, '품질 검사', 'Inspection', (g) => [main(g.oval(0.42, 0.42, 0.42)), line(g.seg([0.72, 0.72, 1, 1])), line(g.open([0.24, 0.44], [0.38, 0.58], [0.62, 0.3]))], below);
  d('facStorage', 'factory', 110, 90, '자재 창고', 'Material Rack', (g) => [line(`${g.box(0, 0, 1, 1)}${g.seg([0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 2 / 3])}`), main(g.box(0.08, 0.1, 0.24, 0.22)), main(g.box(0.38, 0.44, 0.24, 0.22)), main(g.box(0.68, 0.78, 0.24, 0.22))], below);
  d('facWorker', 'factory', 60, 80, '작업자', 'Worker', (g) => [main(g.oval(0.5, 0.24, 0.2)), solid(g.pol([0.24, 0.16], [0.5, 0], [0.76, 0.16], [0.84, 0.2], [0.16, 0.2])), main(`${M(0, g.h)}C0 ${f(g.h * 0.44)} ${f(g.w)} ${f(g.h * 0.44)} ${f(g.w)} ${f(g.h)}Z`)], below);
  d('facTool', 'factory', 70, 70, '공구', 'Wrench', (g) => [main(g.pol([0.12, 0.72], [0.56, 0.3], [0.52, 0.12], [0.7, 0], [0.76, 0.16], [0.86, 0.22], [1, 0.16], [0.9, 0.42], [0.7, 0.44], [0.28, 0.88], [0.12, 0.88]))], below);
  d('facStation', 'factory', 130, 70, '작업 공정', 'Work Station', (g) => [main(g.pol([0, 0], [0.86, 0], [1, 0.5], [0.86, 1], [0, 1]))], { qs: 'fill', text: [0, 0, 0.86, 1], points: [[0, 0.5], [1, 0.5], [0.43, 0], [0.43, 1]] });
  d('facBuffer', 'factory', 70, 70, '재고', 'Inventory', (g) => [main(g.pol([0.5, 0], [1, 1], [0, 1])), line(g.seg([0.5, 0.36, 0.5, 0.82]))], below);

  // ───────────────────────── education
  d('eduBook', 'education', 100, 70, '책', 'Open Book', (g) => [main(g.pol([0, 0.1], [0.5, 0.2], [1, 0.1], [1, 0.9], [0.5, 1], [0, 0.9])), line(g.seg([0.5, 0.2, 0.5, 1]))], below);
  d('eduCap', 'education', 100, 70, '학사모', 'Graduation Cap', (g) => [main(g.pol([0.5, 0], [1, 0.32], [0.5, 0.62], [0, 0.32])), main(g.pol([0.22, 0.52], [0.5, 0.7], [0.78, 0.52], [0.78, 0.84], [0.5, 1], [0.22, 0.84])), line(g.seg([0.92, 0.36, 0.92, 0.8]))], below);
  d('eduBoard', 'education', 130, 90, '칠판', 'Blackboard', (g) => [main(g.box(0, 0, 1, 0.86, 3)), line(g.seg([0.2, 0.86, 0.12, 1], [0.8, 0.86, 0.88, 1]))], { style: { fill: '#2e5d4b', line: '#17362b', textColor: '#ffffff' }, text: [0.05, 0, 0.95, 0.86] });
  d('eduPencil', 'education', 110, 30, '연필', 'Pencil', (g) => [main(g.pol([0, 0], [0.76, 0], [1, 0.5], [0.76, 1], [0, 1])), solid(g.pol([0.92, 0.33], [1, 0.5], [0.92, 0.67])), line(g.seg([0.14, 0, 0.14, 1]))], { text: BELOW, style: { fill: '#ffd54f', line: '#8a6d00', textColor: ink } });
  d('eduStudent', 'education', 70, 80, '학생', 'Student', (g) => [main(g.oval(0.5, 0.24, 0.2)), solid(g.pol([0.5, 0], [0.82, 0.12], [0.5, 0.22], [0.18, 0.12])), main(`${M(0, g.h)}C0 ${f(g.h * 0.44)} ${f(g.w)} ${f(g.h * 0.44)} ${f(g.w)} ${f(g.h)}Z`)], below);
  d('eduTeacher', 'education', 90, 80, '교사', 'Teacher', (g) => [main(g.oval(0.3, 0.2, 0.14, 0.2)), main(`${M(0, g.h)}C0 ${f(g.h * 0.44)} ${f(g.w * 0.6)} ${f(g.h * 0.44)} ${f(g.w * 0.6)} ${f(g.h)}Z`), line(g.box(0.54, 0.06, 0.44, 0.44)), line(g.seg([0.42, 0.6, 0.6, 0.4]))], below);
  d('eduQuiz', 'education', 80, 90, '시험지', 'Quiz Paper', (g) => [main(g.box(0, 0, 1, 1, 3)), line(`${g.box(0.12, 0.14, 0.14, 0.12)}${g.seg([0.34, 0.2, 0.86, 0.2])}${g.box(0.12, 0.42, 0.14, 0.12)}${g.seg([0.34, 0.48, 0.86, 0.48])}${g.box(0.12, 0.7, 0.14, 0.12)}${g.seg([0.34, 0.76, 0.86, 0.76])}`)], below);
  d('eduLesson', 'education', 150, 70, '수업 단원', 'Lesson', (g) => [main(g.box(0, 0, 1, 1, 8)), solid(g.box(0, 0, 0.1, 1, 8))], { qs: 'subtle', text: [0.1, 0, 1, 1] });
  d('eduCertificate', 'education', 110, 80, '수료증', 'Diploma', (g) => [main(g.box(0, 0, 1, 1, 3)), line(g.box(0.05, 0.07, 0.9, 0.86)), solid(g.dot(0.78, 0.76, 0.1))], { qs: 'subtle', text: [0.08, 0.08, 0.92, 0.66] });
  d('eduFlask', 'education', 70, 90, '실험', 'Science', (g) => [main(g.pol([0.36, 0], [0.64, 0], [0.64, 0.36], [1, 1], [0, 1], [0.36, 0.36])), line(g.seg([0.2, 0.68, 0.8, 0.68]))], below);
  d('eduAtom', 'education', 80, 80, '과학 원리', 'Atom', (g) => [line(`${g.oval(0.5, 0.5, 0.5, 0.18)}${g.oval(0.5, 0.5, 0.18, 0.5)}`), solid(g.dot(0.5, 0.5, 0.09))], { aspect: true, text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2 } });
  d('eduClock', 'education', 70, 70, '수업 시간', 'Class Time', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.open([0.5, 0.2], [0.5, 0.5], [0.72, 0.62]))], { aspect: true, ...below });
  d('eduAward', 'education', 70, 90, '상', 'Award', (g) => [main(g.pol([0.26, 0.5], [0.74, 0.5], [0.86, 1], [0.5, 0.82], [0.14, 1])), main(g.oval(0.5, 0.32, 0.32, 0.32))], below);

  // ───────────────────────── medical
  const medRed = { text: BELOW, style: { fill: '#fde8e8', line: '#c0392b', textColor: ink } };
  d('medCross', 'medical', 70, 70, '의료 십자', 'Medical Cross', (g) => [main(g.pol([0.34, 0], [0.66, 0], [0.66, 0.34], [1, 0.34], [1, 0.66], [0.66, 0.66], [0.66, 1], [0.34, 1], [0.34, 0.66], [0, 0.66], [0, 0.34], [0.34, 0.34]))], { aspect: true, text: BELOW, style: { fill: '#e5484d', line: '#a32a2e', textColor: ink } });
  d('medHeart', 'medical', 90, 80, '심장', 'Heart', (g) => [main(`${M(g.w / 2, g.h)}C${f(g.w * 0.1)} ${f(g.h * 0.7)} 0 ${f(g.h * 0.45)} 0 ${f(g.h * 0.28)}C0 ${f(g.h * 0.05)} ${f(g.w * 0.4)} 0 ${f(g.w / 2)} ${f(g.h * 0.22)}C${f(g.w * 0.6)} 0 ${f(g.w)} ${f(g.h * 0.05)} ${f(g.w)} ${f(g.h * 0.28)}C${f(g.w)} ${f(g.h * 0.45)} ${f(g.w * 0.9)} ${f(g.h * 0.7)} ${f(g.w / 2)} ${f(g.h)}Z`), line(g.open([0.1, 0.44], [0.34, 0.44], [0.42, 0.26], [0.56, 0.62], [0.64, 0.44], [0.9, 0.44]))], medRed);
  d('medPill', 'medical', 90, 40, '알약', 'Capsule', (g) => [main(rect(0, 0, g.w, g.h, g.h / 2)), light(`${M(g.w / 2, 0)}H${f(g.w - g.h / 2)}A${f(g.h / 2)} ${f(g.h / 2)} 0 0 1 ${f(g.w - g.h / 2)} ${f(g.h)}H${f(g.w / 2)}Z`)], medRed);
  d('medSyringe', 'medical', 120, 36, '주사기', 'Syringe', (g) => [main(g.box(0.14, 0.14, 0.56, 0.72, 2)), line(g.seg([0, 0.5, 0.14, 0.5], [0.7, 0.5, 1, 0.5], [0.96, 0.1, 0.96, 0.9], [0.3, 0.14, 0.3, 0.4], [0.44, 0.14, 0.44, 0.4], [0.58, 0.14, 0.58, 0.4]))], below);
  d('medStethoscope', 'medical', 80, 90, '청진기', 'Stethoscope', (g) => [line(`${g.open([0.2, 0], [0.2, 0.34])}${g.arc(0.2, 0.34, 0.2, 0.2, 0.6, 0.34, 0, 0)}${g.open([0.6, 0.34], [0.6, 0])}${g.open([0.4, 0.54], [0.4, 0.76])}${g.arc(0.4, 0.76, 0.2, 0.16, 0.8, 0.72, 0, 0)}`), main(g.oval(0.8, 0.62, 0.16, 0.14))], { text: BELOW, qs: 'subtle', style: { lineWidth: 2 } });
  d('medBed', 'medical', 140, 70, '병상', 'Hospital Bed', (g) => [main(g.box(0.04, 0.34, 0.92, 0.3, 3)), light(g.box(0.08, 0.2, 0.2, 0.14, 3)), line(g.seg([0.04, 0, 0.04, 0.9], [0.96, 0.2, 0.96, 0.9])), solid(`${g.dot(0.14, 0.9, 0.1)}${g.dot(0.86, 0.9, 0.1)}`)], below);
  d('medDoctor', 'medical', 70, 80, '의사', 'Doctor', (g) => [main(g.oval(0.5, 0.2, 0.2)), main(`${M(0, g.h)}C0 ${f(g.h * 0.42)} ${f(g.w)} ${f(g.h * 0.42)} ${f(g.w)} ${f(g.h)}Z`), solid(g.pol([0.46, 0.6], [0.54, 0.6], [0.54, 0.68], [0.62, 0.68], [0.62, 0.76], [0.54, 0.76], [0.54, 0.84], [0.46, 0.84], [0.46, 0.76], [0.38, 0.76], [0.38, 0.68], [0.46, 0.68]))], below);
  d('medPatient', 'medical', 70, 80, '환자', 'Patient', (g) => [main(g.oval(0.5, 0.22, 0.2)), main(`${M(0.1 * g.w, g.h)}C${f(0.1 * g.w)} ${f(g.h * 0.44)} ${f(0.9 * g.w)} ${f(g.h * 0.44)} ${f(0.9 * g.w)} ${f(g.h)}Z`), line(g.seg([0.24, 0.74, 0.76, 0.74]))], below);
  d('medChart', 'medical', 80, 100, '진료 기록', 'Medical Chart', (g) => [main(g.box(0, 0.08, 1, 0.92, 4)), dark(g.box(0.3, 0, 0.4, 0.16, 2)), line(g.open([0.12, 0.42], [0.36, 0.42], [0.44, 0.28], [0.56, 0.56], [0.64, 0.42], [0.88, 0.42])), line(g.seg([0.14, 0.7, 0.86, 0.7], [0.14, 0.84, 0.6, 0.84]))], below);
  d('medMonitor', 'medical', 110, 80, '심박 모니터', 'Vital Monitor', (g) => [main(g.box(0, 0, 1, 0.86, 5)), line(g.open([0.08, 0.44], [0.3, 0.44], [0.38, 0.2], [0.5, 0.66], [0.58, 0.44], [0.92, 0.44])), line(g.seg([0.5, 0.86, 0.5, 1], [0.3, 1, 0.7, 1]))], below);
  d('medAmbulance', 'medical', 120, 66, '구급차', 'Ambulance', (g) => [main(g.pol([0, 0.84], [0, 0.04], [0.66, 0.04], [0.66, 0.2], [0.86, 0.2], [1, 0.5], [1, 0.84])), solid(g.pol([0.28, 0.16], [0.38, 0.16], [0.38, 0.3], [0.52, 0.3], [0.52, 0.46], [0.38, 0.46], [0.38, 0.6], [0.28, 0.6], [0.28, 0.46], [0.14, 0.46], [0.14, 0.3], [0.28, 0.3])), solid(`${g.dot(0.22, 0.86, 0.14)}${g.dot(0.78, 0.86, 0.14)}`)], { text: BELOW, style: { fill: '#ffffff', line: '#c0392b', textColor: ink } });
  d('medDna', 'medical', 44, 100, 'DNA', 'DNA', (g) => [line(`${M(0, 0)}C${f(g.w * 1.6)} ${f(g.h * 0.2)} ${f(-g.w * 0.6)} ${f(g.h * 0.8)} ${f(g.w)} ${f(g.h)}${M(g.w, 0)}C${f(-g.w * 0.6)} ${f(g.h * 0.2)} ${f(g.w * 1.6)} ${f(g.h * 0.8)} 0 ${f(g.h)}`), line(g.seg([0.2, 0.14, 0.8, 0.14], [0.2, 0.86, 0.8, 0.86], [0.26, 0.36, 0.74, 0.36], [0.26, 0.64, 0.74, 0.64]))], { text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2 } });
  d('medBrain', 'medical', 90, 70, '뇌', 'Brain', (g) => [main(`${M(g.w / 2, g.h * 0.08)}C${f(g.w * 0.2)} ${f(-g.h * 0.06)} ${f(-g.w * 0.05)} ${f(g.h * 0.2)} ${f(g.w * 0.06)} ${f(g.h * 0.5)}C${f(-g.w * 0.02)} ${f(g.h * 0.84)} ${f(g.w * 0.34)} ${f(g.h * 1.04)} ${f(g.w / 2)} ${f(g.h * 0.86)}C${f(g.w * 0.66)} ${f(g.h * 1.04)} ${f(g.w * 1.02)} ${f(g.h * 0.84)} ${f(g.w * 0.94)} ${f(g.h * 0.5)}C${f(g.w * 1.05)} ${f(g.h * 0.2)} ${f(g.w * 0.8)} ${f(-g.h * 0.06)} ${f(g.w / 2)} ${f(g.h * 0.08)}Z`), line(g.seg([0.5, 0.08, 0.5, 0.86]))], below);

  // ───────────────────────── interior
  const wood = fix('#d7ccc8', '#5d4037');
  const fabric = fix('#c5cae9', '#3949ab');
  d('intArmchair', 'interior', 80, 80, '안락의자', 'Armchair', (g) => [main(g.box(0, 0, 1, 1, 10)), dark(g.box(0, 0, 1, 0.26, 8)), dark(g.box(0, 0, 0.18, 1, 8)), dark(g.box(0.82, 0, 0.18, 1, 8))], fabric);
  d('intSofaL', 'interior', 170, 140, 'L자 소파', 'L-Shaped Sofa', (g) => [main(g.pol([0, 0], [1, 0], [1, 0.42], [0.42, 0.42], [0.42, 1], [0, 1])), dark(g.pol([0, 0], [1, 0], [1, 0.14], [0.14, 0.14], [0.14, 1], [0, 1]))], fix('#a5d6a7', '#2e7d32'));
  d('intCoffee', 'interior', 110, 60, '탁자', 'Coffee Table', (g) => [main(g.box(0, 0, 1, 1, 6))], fix('#d7b98e', '#7a5a2f', [0, 0, 1, 1]));
  d('intNight', 'interior', 50, 50, '협탁', 'Nightstand', (g) => [main(g.box(0, 0, 1, 1, 3)), line(g.seg([0, 0.5, 1, 0.5])), solid(g.dot(0.5, 0.26, 0.05))], wood);
  d('intDresser', 'interior', 130, 50, '서랍장', 'Dresser', (g) => [main(g.box(0, 0, 1, 1, 2)), line(g.seg([1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 2 / 3, 1])), solid(`${g.dot(1 / 6, 0.5, 0.05)}${g.dot(0.5, 0.5, 0.05)}${g.dot(5 / 6, 0.5, 0.05)}`)], wood);
  d('intBunk', 'interior', 110, 200, '싱글 침대', 'Single Bed', (g) => [main(g.box(0, 0, 1, 1, 5)), light(g.box(0.14, 0.04, 0.72, 0.14, 6)), dark(g.box(0, 0.26, 1, 0.74, 5))], fix('#ffe0b2', '#8d6e63', [0, 0.3, 1, 1]));
  d('intCrib', 'interior', 100, 150, '아기 침대', 'Crib', (g) => [main(g.box(0, 0, 1, 1, 4)), line(g.box(0.08, 0.06, 0.84, 0.88, 3)), line(g.seg([0.08, 0.26, 0.92, 0.26], [0.08, 0.5, 0.92, 0.5], [0.08, 0.74, 0.92, 0.74]))], fix('#fff4cc', '#a68a3d'));
  d('intPiano', 'interior', 150, 60, '피아노', 'Piano', (g) => [main(g.box(0, 0, 1, 0.64, 3)), light(g.box(0, 0.64, 1, 0.36)), line(g.seg([0.1, 0.64, 0.1, 1], [0.2, 0.64, 0.2, 1], [0.3, 0.64, 0.3, 1], [0.4, 0.64, 0.4, 1], [0.5, 0.64, 0.5, 1], [0.6, 0.64, 0.6, 1], [0.7, 0.64, 0.7, 1], [0.8, 0.64, 0.8, 1], [0.9, 0.64, 0.9, 1]))], fix('#546e7a', '#263238'));
  d('intFireplace', 'interior', 130, 40, '벽난로', 'Fireplace', (g) => [main(g.box(0, 0, 1, 1)), solid(g.pol([0.2, 0.82], [0.5, 0.24], [0.8, 0.82]))], fix('#ffccbc', '#bf360c'));
  d('intPool', 'interior', 220, 120, '수영장', 'Pool', (g) => [main(g.box(0, 0, 1, 1, 12)), line(g.box(0.03, 0.06, 0.94, 0.88, 10))], fix('#b3e5fc', '#0277bd', [0.05, 0.1, 0.95, 0.9]));
  d('intCurtain', 'interior', 170, 20, '커튼', 'Curtain', (g) => [line(g.open([0, 0.5], [0.08, 0], [0.16, 1], [0.24, 0], [0.32, 1], [0.4, 0], [0.48, 1], [0.56, 0], [0.64, 1], [0.72, 0], [0.8, 1], [0.88, 0], [1, 0.5]))], { text: BELOW, style: { fill: 'none', line: '#8e24aa', lineWidth: 2, textColor: ink } });
  d('intPlantBig', 'interior', 90, 90, '큰 화분', 'Large Plant', (g) => [main(`${g.oval(0.5, 0.2, 0.2)}${g.oval(0.8, 0.5, 0.2)}${g.oval(0.5, 0.8, 0.2)}${g.oval(0.2, 0.5, 0.2)}${g.oval(0.72, 0.26, 0.17)}${g.oval(0.72, 0.74, 0.17)}${g.oval(0.28, 0.74, 0.17)}${g.oval(0.28, 0.26, 0.17)}`), dark(g.oval(0.5, 0.5, 0.2))], fix('#81c784', '#2e7d32'));
  d('intDeskL', 'interior', 170, 140, 'L자 책상', 'L-Shaped Desk', (g) => [main(g.pol([0, 0], [1, 0], [1, 1], [0.62, 1], [0.62, 0.42], [0, 0.42]))], fix('#bcaaa4', '#5d4037'));
  d('intWallArc', 'interior', 150, 150, '곡선 벽', 'Curved Wall', (g) => [solid(`${M(0, g.h)}A${f(g.w)} ${f(g.h)} 0 0 1 ${f(g.w)} 0V${f(g.h * 0.08)}A${f(g.w * 0.92)} ${f(g.h * 0.92)} 0 0 0 ${f(g.w * 0.08)} ${f(g.h)}Z`)], { text: BELOW, style: { fill: '#5f6368', line: '#3c4043', textColor: ink } });

  // ───────────────────────── math
  const mathInk = { text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2 } };
  d('mathAxes', 'math', 160, 120, '좌표축', 'Coordinate Axes', (g) => [line(g.seg([0.04, 0.5, 1, 0.5], [0.5, 1, 0.5, 0])), solid(g.pol([1, 0.5], [0.94, 0.45], [0.94, 0.55])), solid(g.pol([0.5, 0], [0.46, 0.08], [0.54, 0.08]))], { ...mathInk, points: [[0.5, 0.5]] });
  d('mathParabola', 'math', 140, 110, '포물선', 'Parabola', (g) => [line(`${M(g.w * 0.1, 0)}Q${f(g.w / 2)} ${f(g.h * 1.8)} ${f(g.w * 0.9)} 0`)], mathInk);
  d('mathSine', 'math', 170, 70, '사인 곡선', 'Sine Wave', (g) => [line(`${M(0, g.h / 2)}C${f(g.w * 0.12)} ${f(-g.h * 0.1)} ${f(g.w * 0.2)} ${f(-g.h * 0.1)} ${f(g.w * 0.3)} ${f(g.h / 2)}S${f(g.w * 0.5)} ${f(g.h * 1.1)} ${f(g.w * 0.6)} ${f(g.h / 2)}S${f(g.w * 0.82)} ${f(-g.h * 0.1)} ${f(g.w)} ${f(g.h / 2)}`)], mathInk);
  d('mathRight', 'math', 110, 100, '직각 삼각형 표시', 'Right Triangle Mark', (g) => [main(g.pol([0, 0], [0, 1], [1, 1])), line(g.open([0, 0.84], [0.14, 0.84], [0.14, 1]))], { ...sub, text: [0, 1.02, 1, 1.5] });
  d('mathCircleRadius', 'math', 100, 100, '원과 반지름', 'Circle & Radius', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.seg([0.5, 0.5, 1, 0.5])), solid(g.dot(0.5, 0.5, 0.03))], { ...below, aspect: true });
  d('mathAngle', 'math', 90, 80, '각', 'Angle', (g) => [line(g.open([1, 0], [0, 1], [1, 1])), line(g.arc(0.36, 0.64, 0.36, 0.4, 0.36, 1))], mathInk);
  d('mathMatrix', 'math', 110, 90, '행렬', 'Matrix', (g) => [line(g.open([0.12, 0], [0, 0], [0, 1], [0.12, 1])), line(g.open([0.88, 0], [1, 0], [1, 1], [0.88, 1]))], { style: { fill: 'none', lineWidth: 2 }, qs: 'subtle', text: [0.06, 0, 0.94, 1] });
  d('mathSum', 'math', 60, 70, '합(시그마)', 'Summation', (g) => [line(g.open([1, 0.14], [1, 0], [0, 0], [0.5, 0.5], [0, 1], [1, 1], [1, 0.86]))], mathInk);
  d('mathIntegral', 'math', 36, 90, '적분', 'Integral', (g) => [line(`${M(g.w, g.h * 0.06)}C${f(g.w * 0.7)} ${f(-g.h * 0.04)} ${f(g.w / 2)} ${f(g.h * 0.06)} ${f(g.w / 2)} ${f(g.h * 0.2)}V${f(g.h * 0.8)}C${f(g.w / 2)} ${f(g.h * 0.94)} ${f(g.w * 0.3)} ${f(g.h * 1.04)} 0 ${f(g.h * 0.94)}`)], mathInk);
  d('mathRoot', 'math', 110, 50, '제곱근', 'Square Root', (g) => [line(g.open([0, 0.6], [0.08, 0.5], [0.18, 1], [0.3, 0], [1, 0]))], { style: { fill: 'none', lineWidth: 2 }, qs: 'subtle', text: [0.3, 0.06, 1, 1] });
  d('mathNumberLine', 'math', 240, 30, '수직선', 'Number Line', (g) => [line(g.seg([0, 0.5, 1, 0.5], [0.1, 0.2, 0.1, 0.8], [0.3, 0.2, 0.3, 0.8], [0.5, 0.2, 0.5, 0.8], [0.7, 0.2, 0.7, 0.8], [0.9, 0.2, 0.9, 0.8]))], mathInk);
  d('mathSet', 'math', 150, 100, '집합', 'Set', (g) => [main(g.oval(0.5, 0.5, 0.5))], { ...sub, text: [0.12, 0.12, 0.88, 0.88] });
  d('mathPrism', 'math', 110, 100, '각기둥', 'Prism', (g) => [main(g.pol([0, 0.24], [0.5, 0], [1, 0.24], [1, 0.76], [0.5, 1], [0, 0.76])), line(g.open([0, 0.24], [0.5, 0.48], [1, 0.24])), line(g.seg([0.5, 0.48, 0.5, 1]))], below);
  d('mathCone', 'math', 90, 110, '원뿔', 'Cone', (g) => [main(`${M(g.w / 2, 0)}L${f(g.w)} ${f(g.h * 0.88)}A${f(g.w / 2)} ${f(g.h * 0.12)} 0 0 1 0 ${f(g.h * 0.88)}Z`), line(g.arc(0, 0.88, 0.5, 0.12, 1, 0.88))], below);
  d('mathSphere', 'math', 90, 90, '구', 'Sphere', (g) => [main(g.oval(0.5, 0.5, 0.5)), line(g.arc(0, 0.5, 0.5, 0.16, 1, 0.5, 0, 0))], { ...below, aspect: true });

  // ───────────────────────── strategy & frameworks
  const framed = (...cells) => (g) => [main(g.box(0, 0, 1, 1)), line(g.seg(...cells))];
  d('stgMatrix2', 'strategy', 240, 200, '2×2 행렬', '2×2 Matrix', framed([0.5, 0, 0.5, 1], [0, 0.5, 1, 0.5]), { kind: 'container', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true, header: 'top' });
  d('stgMatrix3', 'strategy', 270, 220, '3×3 행렬', '3×3 Matrix', framed([1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 2 / 3, 1], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 2 / 3]), { kind: 'container', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true, header: 'top' });
  d('stgSwot', 'strategy', 280, 220, 'SWOT', 'SWOT', (g) => [main(g.box(0, 0, 0.5, 0.5)), light(g.box(0.5, 0, 0.5, 0.5)), light(g.box(0, 0.5, 0.5, 0.5)), main(g.box(0.5, 0.5, 0.5, 0.5))], { kind: 'container', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true, header: 'top' });
  d('stgCanvas', 'strategy', 360, 220, '비즈니스 캔버스', 'Business Canvas', framed([0.2, 0, 0.2, 0.68], [0.4, 0, 0.4, 0.68], [0.6, 0, 0.6, 0.68], [0.8, 0, 0.8, 0.68], [0, 0.68, 1, 0.68], [0.5, 0.68, 0.5, 1], [0.2, 0.34, 0.4, 0.34], [0.6, 0.34, 0.8, 0.34]), { kind: 'container', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true, header: 'top' });
  d('stgVenn2', 'strategy', 180, 120, '벤 다이어그램 2', 'Venn (2 Sets)', (g) => [main(g.oval(0.34, 0.5, 0.34, 0.5)), main(g.oval(0.66, 0.5, 0.34, 0.5))], { qs: 'gradient', text: BELOW, style: { fillOpacity: 55, textColor: ink } });
  d('stgVenn3', 'strategy', 150, 140, '벤 다이어그램 3', 'Venn (3 Sets)', (g) => [main(g.oval(0.5, 0.33, 0.33, 0.33)), main(g.oval(0.33, 0.67, 0.33, 0.33)), main(g.oval(0.67, 0.67, 0.33, 0.33))], { qs: 'gradient', text: BELOW, style: { fillOpacity: 55, textColor: ink } });
  d('stgPyramid', 'strategy', 170, 140, '단계 피라미드', 'Tiered Pyramid', (g) => [main(g.pol([0.5, 0], [0.66, 0.32], [0.34, 0.32])), light(g.pol([0.33, 0.35], [0.67, 0.35], [0.83, 0.66], [0.17, 0.66])), main(g.pol([0.16, 0.69], [0.84, 0.69], [1, 1], [0, 1]))], below);
  d('stgFishbone', 'strategy', 240, 130, '원인 결과도', 'Fishbone', (g) => [line(g.seg([0, 0.5, 0.86, 0.5], [0.72, 0.5, 0.6, 0.06], [0.72, 0.5, 0.6, 0.94], [0.44, 0.5, 0.32, 0.06], [0.44, 0.5, 0.32, 0.94], [0.18, 0.5, 0.06, 0.06], [0.18, 0.5, 0.06, 0.94])), main(g.box(0.86, 0.3, 0.14, 0.4, 3))], { text: BELOW, style: { lineWidth: 2 } });
  d('stgRadar5', 'strategy', 130, 130, '5축 역량', 'Five Forces', (g) => [main(g.box(0.36, 0.36, 0.28, 0.28, 3)), main(g.box(0.36, 0, 0.28, 0.24, 3)), main(g.box(0.36, 0.76, 0.28, 0.24, 3)), main(g.box(0, 0.38, 0.24, 0.24, 3)), main(g.box(0.76, 0.38, 0.24, 0.24, 3)), line(g.seg([0.5, 0.24, 0.5, 0.36], [0.5, 0.64, 0.5, 0.76], [0.24, 0.5, 0.36, 0.5], [0.64, 0.5, 0.76, 0.5]))], below);
  d('stgValueChain', 'strategy', 320, 110, '가치 사슬', 'Value Chain', (g) => [main(g.pol([0, 0], [0.86, 0], [1, 0.5], [0.86, 1], [0, 1])), line(g.seg([0, 0.4, 0.92, 0.4], [0.2, 0.4, 0.2, 1], [0.4, 0.4, 0.4, 1], [0.6, 0.4, 0.6, 1], [0.8, 0.4, 0.8, 1]))], { qs: 'subtle', text: [0, 0, 0.86, 0.4] });
  d('stgOkr', 'strategy', 170, 90, '목표·핵심 결과', 'OKR Card', (g) => [main(g.box(0, 0, 1, 1, 6)), dark(g.box(0, 0, 1, 0.3, 6)), line(g.seg([0.08, 0.5, 0.92, 0.5], [0.08, 0.68, 0.92, 0.68], [0.08, 0.86, 0.6, 0.86]))], { qs: 'subtle', text: [0, 0, 1, 0.3] });
  d('stgPersona', 'strategy', 170, 110, '페르소나', 'Persona', (g) => [main(g.box(0, 0, 1, 1, 6)), light(g.oval(0.18, 0.34, 0.1, 0.16)), light(`${M(g.w * 0.05, g.h * 0.72)}C${f(g.w * 0.05)} ${f(g.h * 0.42)} ${f(g.w * 0.31)} ${f(g.h * 0.42)} ${f(g.w * 0.31)} ${f(g.h * 0.72)}Z`)], { qs: 'subtle', text: [0.34, 0, 1, 1] });
  d('stgJourney', 'strategy', 320, 110, '고객 여정', 'Customer Journey', (g) => [line(g.open([0.02, 0.7], [0.2, 0.4], [0.4, 0.8], [0.6, 0.3], [0.8, 0.5], [0.98, 0.14])), solid(`${g.dot(0.02, 0.7, 0.05)}${g.dot(0.2, 0.4, 0.05)}${g.dot(0.4, 0.8, 0.05)}${g.dot(0.6, 0.3, 0.05)}${g.dot(0.8, 0.5, 0.05)}${g.dot(0.98, 0.14, 0.05)}`)], { text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2 } });
  d('stgBalance', 'strategy', 110, 90, '균형', 'Balance', (g) => [line(g.seg([0.5, 0.06, 0.5, 1], [0.1, 0.2, 0.9, 0.2], [0.3, 1, 0.7, 1])), line(`${g.arc(0, 0.5, 0.1, 0.12, 0.2, 0.5, 0, 0)}${g.seg([0.1, 0.2, 0, 0.5], [0.1, 0.2, 0.2, 0.5])}${g.arc(0.8, 0.5, 0.1, 0.12, 1, 0.5, 0, 0)}${g.seg([0.9, 0.2, 0.8, 0.5], [0.9, 0.2, 1, 0.5])}`)], { text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2 } });

  // ───────────────────────── software architecture (C4)
  d('c4Person', 'c4', 150, 130, '사람', 'Person', (g) => [main(g.oval(0.5, 0.2, 0.15, 0.2)), main(g.box(0, 0.36, 1, 0.64, 18))], { text: [0.06, 0.4, 0.94, 0.96], style: { fill: '#08427b', line: '#052e56', textColor: '#ffffff' } });
  d('c4System', 'c4', 190, 110, '소프트웨어 시스템', 'Software System', (g) => [main(g.box(0, 0, 1, 1, 6))], { style: { fill: '#1168bd', line: '#0b4884', textColor: '#ffffff' } });
  d('c4External', 'c4', 190, 110, '외부 시스템', 'External System', (g) => [main(g.box(0, 0, 1, 1, 6))], { style: { fill: '#999999', line: '#6b6b6b', textColor: '#ffffff' } });
  d('c4Container', 'c4', 190, 110, '컨테이너', 'Container', (g) => [main(g.box(0, 0, 1, 1, 6))], { style: { fill: '#438dd5', line: '#2e6295', textColor: '#ffffff' } });
  d('c4Component', 'c4', 190, 110, '컴포넌트', 'Component', (g) => [main(g.box(0, 0, 1, 1, 6))], { style: { fill: '#85bbf0', line: '#5d82a8', textColor: '#10253a' } });
  d('c4Database', 'c4', 160, 110, '데이터 저장소', 'Database', (g) => [main(`${M(0, g.h * 0.14)}V${f(g.h * 0.86)}A${f(g.w / 2)} ${f(g.h * 0.14)} 0 0 0 ${f(g.w)} ${f(g.h * 0.86)}V${f(g.h * 0.14)}A${f(g.w / 2)} ${f(g.h * 0.14)} 0 0 0 0 ${f(g.h * 0.14)}Z`), line(g.arc(0, 0.14, 0.5, 0.14, 1, 0.14, 0, 0))], { text: [0.04, 0.3, 0.96, 0.96], style: { fill: '#438dd5', line: '#2e6295', textColor: '#ffffff' } });
  d('c4Queue', 'c4', 190, 80, '메시지 대기열', 'Message Queue', (g) => [main(`${M(g.w * 0.08, 0)}H${f(g.w * 0.92)}A${f(g.w * 0.08)} ${f(g.h / 2)} 0 0 1 ${f(g.w * 0.92)} ${f(g.h)}H${f(g.w * 0.08)}A${f(g.w * 0.08)} ${f(g.h / 2)} 0 0 1 ${f(g.w * 0.08)} 0Z`), line(g.arc(0.92, 0, 0.08, 0.5, 0.92, 1, 0, 0))], { text: [0.04, 0, 0.84, 1], style: { fill: '#438dd5', line: '#2e6295', textColor: '#ffffff' } });
  d('c4WebApp', 'c4', 190, 120, '웹 앱', 'Web App', (g) => [main(g.box(0, 0, 1, 1, 6)), line(g.seg([0, 0.18, 1, 0.18])), solid(`${g.dot(0.05, 0.09, 0.03)}${g.dot(0.1, 0.09, 0.03)}${g.dot(0.15, 0.09, 0.03)}`)], { text: [0, 0.18, 1, 1], style: { fill: '#438dd5', line: '#2e6295', textColor: '#ffffff' } });
  d('c4Mobile', 'c4', 100, 160, '모바일 앱', 'Mobile App', (g) => [main(g.box(0, 0, 1, 1, 10)), line(g.seg([0, 0.1, 1, 0.1], [0, 0.88, 1, 0.88]))], { text: [0.03, 0.1, 0.97, 0.88], style: { fill: '#438dd5', line: '#2e6295', textColor: '#ffffff' } });
  d('c4Boundary', 'c4', 380, 260, '시스템 경계', 'System Boundary', (g) => [main(g.box(0, 0, 1, 1, 4))], { kind: 'container', header: 'top', qs: 'outline', style: { dash: 'dash' }, text: [0, 0, 1, 0], textHeader: true });
  d('c4Enterprise', 'c4', 480, 320, '조직 경계', 'Enterprise Boundary', (g) => [main(g.box(0, 0, 1, 1, 4))], { kind: 'container', header: 'top', qs: 'outline', style: { dash: 'dot' }, text: [0, 0, 1, 0], textHeader: true });
  d('c4Node', 'c4', 240, 170, '배포 노드', 'Deployment Node', (g) => [main(g.box(0, 0, 1, 1, 2)), dark(g.box(0, 0, 1, 0.14, 2))], { kind: 'container', header: 'top', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true });
  d('c4Legend', 'c4', 180, 80, '범례', 'Legend', (g) => [main(g.box(0, 0, 1, 1, 3)), solid(g.box(0.05, 0.2, 0.1, 0.2)), line(g.seg([0.05, 0.72, 0.15, 0.72]))], { qs: 'outline', text: [0.2, 0, 1, 1], style: { fontSize: 11 } });

  // ───────────────────────── agile & kanban
  const card = (fill, stroke, text = '#27272a') => ({ style: { fill, line: stroke, textColor: text }, text: [0.05, 0.05, 0.95, 0.95] });
  d('agTodo', 'agile', 130, 80, '할 일 카드', 'To-Do Card', (g) => [main(g.box(0, 0, 1, 1, 4))], card('#fff4a8', '#d8b830'));
  d('agDoing', 'agile', 130, 80, '진행 카드', 'In-Progress Card', (g) => [main(g.box(0, 0, 1, 1, 4))], card('#bcd9ff', '#6c95c9'));
  d('agDone', 'agile', 130, 80, '완료 카드', 'Done Card', (g) => [main(g.box(0, 0, 1, 1, 4)), line(g.open([0.82, 0.14], [0.87, 0.24], [0.95, 0.06]))], card('#c8efd2', '#6cae7f'));
  d('agBug', 'agile', 130, 80, '버그 카드', 'Bug Card', (g) => [main(g.box(0, 0, 1, 1, 4)), solid(g.oval(0.9, 0.16, 0.05, 0.08))], card('#ffd1dc', '#d4849a'));
  d('agStory', 'agile', 150, 90, '사용자 스토리', 'User Story', (g) => [main(g.box(0, 0, 1, 1, 4)), line(g.seg([0, 0.82, 1, 0.82]))], { style: { fill: '#ffffff', line: '#7a7f87', textColor: '#27272a' }, text: [0.04, 0.04, 0.96, 0.8] });
  d('agEpic', 'agile', 170, 80, '에픽', 'Epic', (g) => [main(g.pol([0, 0], [0.9, 0], [1, 0.5], [0.9, 1], [0, 1]))], { style: { fill: '#e0c8ff', line: '#8a63c2', textColor: '#27133f' }, text: [0.03, 0, 0.9, 1] });
  d('agColumn', 'agile', 180, 420, '칸반 열', 'Kanban Column', (g) => [main(g.box(0, 0, 1, 1, 4)), dark(rect(0, 0, g.w, Math.min(32, g.h), 4))], { kind: 'container', header: 'top', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true });
  d('agBoard', 'agile', 540, 340, '칸반 보드', 'Kanban Board', (g) => [main(g.box(0, 0, 1, 1)), dark(g.box(0, 0, 1, 0.1)), line(g.seg([1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 2 / 3, 1]))], { kind: 'container', header: 'top', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true });
  d('agSprint', 'agile', 170, 80, '스프린트 주기', 'Sprint Cycle', (g) => [line(`${g.arc(0.3, 0.14, 0.14, 0.36, 0.3, 0.86, 1, 0)}${g.seg([0.3, 0.14, 0.72, 0.14], [0.3, 0.86, 0.72, 0.86])}${g.arc(0.72, 0.14, 0.14, 0.36, 0.72, 0.86)}`), solid(g.pol([0.54, 0.02], [0.66, 0.14], [0.54, 0.26]))], { qs: 'subtle', style: { fill: 'none', lineWidth: 2.5 }, text: [0.2, 0.2, 0.82, 0.8] });
  d('agBacklog', 'agile', 150, 110, '백로그', 'Backlog', (g) => [main(g.box(0, 0, 1, 0.3, 3)), main(g.box(0, 0.35, 1, 0.3, 3)), main(g.box(0, 0.7, 1, 0.3, 3))], below);
  d('agBurndown', 'agile', 150, 100, '번다운', 'Burndown', (g) => [line(g.open([0, 0], [0, 1], [1, 1])), line(g.seg([0.02, 0.04, 0.98, 0.98])), line(g.open([0.02, 0.04], [0.2, 0.14], [0.4, 0.4], [0.6, 0.46], [0.8, 0.78], [0.98, 0.9]))], { text: BELOW, qs: 'subtle', style: { fill: 'none', lineWidth: 2 } });
  d('agStandup', 'agile', 100, 80, '일일 회의', 'Daily Stand-Up', (g) => [main(g.oval(0.2, 0.3, 0.1, 0.14)), main(g.oval(0.5, 0.3, 0.1, 0.14)), main(g.oval(0.8, 0.3, 0.1, 0.14)), main(`${M(g.w * 0.04, g.h)}C${f(g.w * 0.04)} ${f(g.h * 0.5)} ${f(g.w * 0.36)} ${f(g.h * 0.5)} ${f(g.w * 0.36)} ${f(g.h)}Z`), main(`${M(g.w * 0.34, g.h)}C${f(g.w * 0.34)} ${f(g.h * 0.5)} ${f(g.w * 0.66)} ${f(g.h * 0.5)} ${f(g.w * 0.66)} ${f(g.h)}Z`), main(`${M(g.w * 0.64, g.h)}C${f(g.w * 0.64)} ${f(g.h * 0.5)} ${f(g.w * 0.96)} ${f(g.h * 0.5)} ${f(g.w * 0.96)} ${f(g.h)}Z`)], below);
  d('agRelease', 'agile', 80, 90, '릴리스', 'Release', (g) => [main(`${M(g.w / 2, 0)}C${f(g.w * 0.8)} ${f(g.h * 0.2)} ${f(g.w * 0.74)} ${f(g.h * 0.5)} ${f(g.w * 0.7)} ${f(g.h * 0.72)}H${f(g.w * 0.3)}C${f(g.w * 0.26)} ${f(g.h * 0.5)} ${f(g.w * 0.2)} ${f(g.h * 0.2)} ${f(g.w / 2)} 0Z`), light(g.dot(0.5, 0.34, 0.12)), dark(g.pol([0.3, 0.5], [0.12, 0.76], [0.3, 0.72])), dark(g.pol([0.7, 0.5], [0.88, 0.76], [0.7, 0.72])), solid(g.pol([0.38, 0.76], [0.62, 0.76], [0.5, 1]))], below);
  d('agRetro', 'agile', 240, 160, '회고 칸', 'Retrospective', (g) => [main(g.box(0, 0, 1, 1)), line(g.seg([0.5, 0, 0.5, 1], [0, 0.5, 1, 0.5])), solid(`${g.dot(0.05, 0.08, 0.03)}${g.dot(0.55, 0.08, 0.03)}${g.dot(0.05, 0.58, 0.03)}${g.dot(0.55, 0.58, 0.03)}`)], { kind: 'container', qs: 'subtle', text: [0, 0, 1, 0], textHeader: true, header: 'top' });
  d('agPoints', 'agile', 44, 44, '스토리 포인트', 'Story Points', (g) => [main(g.oval(0.5, 0.5, 0.5))], { aspect: true, qs: 'fill' });
}
