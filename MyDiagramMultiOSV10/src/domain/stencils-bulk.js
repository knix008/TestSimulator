// Many more masters, written in a short drawing notation instead of code, so every stencil
// has at least 42 shapes (a multiple of six: the panel shows six to a row, with no gaps).
//
// One master per line:   id | w h | 한국어 | English | drawing | options
// drawing: parts separated by ";", each "<role> <op> numbers…" in fractions of the box:
//   role  M main (fill + line) · L line only · D dark shade · T light shade · S filled with the line colour
//   op    r x y w h [radius px]     rectangle
//         e cx cy rx [ry]           ellipse
//         c cx cy r                 circle (r of the shorter side)
//         p x,y x,y …               closed polygon
//         l x,y x,y …               open polyline
//         q x,y  cx,cy x,y  …       quadratic curve (start, then control + end pairs)
//         b x,y  c1 c2 x,y  …       cubic curve (start, then three points per segment)
// options (space separated): B label below the shape · A keep proportions · in a box the label is inside.
import { addBulkMastersB } from './stencils-bulk-b.js';
import { addBulkMastersC } from './stencils-bulk-c.js';
import { addBulkMastersNew } from './stencils-bulk-new.js';

export function addBulkMasters(m, H) {
  const { main, line, dark, light, solid, poly, rect, ell, f, BELOW } = H;
  const role = { M: main, L: line, D: dark, T: light, S: solid };
  const pair = (token) => token.split(',').map(Number);

  /** The parts of one drawing at the size w × h. */
  function draw(spec, w, h) {
    return spec.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const [r, op, ...args] = part.split(/\s+/);
      const make = role[r];
      if (!make) throw new Error(`Bad role in "${part}"`);
      const X = (v) => v * w; const Y = (v) => v * h;
      const pts = () => args.map(pair).map(([x, y]) => [X(x), Y(y)]);
      switch (op) {
        case 'r': { const [x, y, rw, rh, rad = 0] = args.map(Number); return make(rect(X(x), Y(y), X(rw), Y(rh), rad)); }
        case 'e': { const [cx, cy, rx, ry = rx] = args.map(Number); return make(ell(X(cx - rx), Y(cy - ry), X(2 * rx), Y(2 * ry))); }
        case 'c': { const [cx, cy, rr] = args.map(Number); const s = rr * Math.min(w, h); return make(ell(X(cx) - s, Y(cy) - s, 2 * s, 2 * s)); }
        case 'p': return make(poly(pts()));
        case 'l': return make(poly(pts(), 0, false));
        case 'q': case 'b': {
          const list = pts();
          const step = op === 'q' ? 2 : 3;
          let d = `M${f(list[0][0])} ${f(list[0][1])}`;
          for (let i = 1; i + step - 1 < list.length; i += step) d += `${op === 'q' ? 'Q' : 'C'}${list.slice(i, i + step).map(([x, y]) => `${f(x)} ${f(y)}`).join(' ')}`;
          return make(d);
        }
        default: throw new Error(`Bad op in "${part}"`);
      }
    });
  }

  /** Defines the masters of one stencil from its block of lines. */
  function define(cat, block, defaults = {}) {
    for (const raw of block.split('\n')) {
      const text = raw.trim();
      if (!text || text.startsWith('//')) continue;
      const [id, size, ko, en, spec, opts = ''] = text.split('|').map((s) => s.trim());
      const [w, h] = size.split(/\s+/).map(Number);
      const flags = new Set(opts.split(/\s+/).filter(Boolean));
      const below = flags.has('B') || (defaults.below && !flags.has('I'));
      draw(spec, w, h); // fails early on a typo
      m(id, cat, w, h, ko, en, (W, Hh) => draw(spec, W, Hh), {
        ...(below ? { text: BELOW } : {}), ...(flags.has('A') || defaults.aspect ? { aspect: true } : {}),
        ...(defaults.qs ? { qs: defaults.qs } : {}),
      });
    }
  }

  // ───────────────────────── arrows (to 42)
  define('arrows', `
    arwThinRight | 120 50 | 가는 오른쪽 화살표 | Thin Right Arrow | M p 0,0.4 0.75,0.4 0.75,0.15 1,0.5 0.75,0.85 0.75,0.6 0,0.6
    arwFatRight | 120 70 | 굵은 오른쪽 화살표 | Bold Right Arrow | M p 0,0.2 0.55,0.2 0.55,0 1,0.5 0.55,1 0.55,0.8 0,0.8
    arwHead | 70 80 | 화살촉 | Arrowhead | M p 0,0 1,0.5 0,1 0.25,0.5
    arwDoubleChevron | 110 60 | 이중 갈매기 | Double Chevron | M p 0,0 0.3,0 0.55,0.5 0.3,1 0,1 0.25,0.5; M p 0.45,0 0.75,0 1,0.5 0.75,1 0.45,1 0.7,0.5
    arwCurveUp | 90 90 | 위로 휘는 화살표 | Curved Up Arrow | L q 0.1,0.95 0.1,0.2 0.8,0.2; S p 0.75,0.05 1,0.2 0.75,0.35
    arwCurveDown | 90 90 | 아래로 휘는 화살표 | Curved Down Arrow | L q 0.1,0.05 0.1,0.8 0.8,0.8; S p 0.75,0.65 1,0.8 0.75,0.95
    arwUTurnDown | 90 100 | 아래로 U턴 | U-Turn Down | L b 0.85,1 0.85,-0.1 0.25,-0.1 0.25,0.6; S p 0.08,0.55 0.42,0.55 0.25,0.88
    arwSplit3 | 110 90 | 세 갈래 화살표 | Three-Way Split | L l 0,0.5 0.45,0.5; L l 0.45,0.5 0.86,0.15; L l 0.45,0.5 0.86,0.5; L l 0.45,0.5 0.86,0.85; S p 0.8,0.04 1,0.08 0.9,0.24; S p 0.86,0.38 1,0.5 0.86,0.62; S p 0.9,0.76 1,0.92 0.8,0.96
    arwConverge | 110 90 | 모이는 화살표 | Converging Arrows | L l 0.04,0.1 0.6,0.5; L l 0.04,0.5 0.6,0.5; L l 0.04,0.9 0.6,0.5; L l 0.6,0.5 0.86,0.5; S p 0.84,0.36 1,0.5 0.84,0.64
    arwCycle2 | 90 90 | 두 방향 순환 | Two-Arrow Cycle | L q 0.15,0.5 0.15,0.12 0.5,0.12; L q 0.85,0.5 0.85,0.88 0.5,0.88; S p 0.45,0 0.62,0.12 0.45,0.24; S p 0.55,0.76 0.38,0.88 0.55,1
    arwSwap | 110 70 | 교환 화살표 | Swap Arrows | L l 0.05,0.3 0.88,0.3; S p 0.84,0.14 1,0.3 0.84,0.46; L l 0.95,0.7 0.12,0.7; S p 0.16,0.54 0,0.7 0.16,0.86
    arwExpand | 90 90 | 네 모서리로 펼치기 | Expand Arrows | L l 0.5,0.5 0.08,0.08; L l 0.5,0.5 0.92,0.08; L l 0.5,0.5 0.92,0.92; L l 0.5,0.5 0.08,0.92; S p 0,0 0.24,0.04 0.04,0.24; S p 1,0 0.96,0.24 0.76,0.04; S p 1,1 0.76,0.96 0.96,0.76; S p 0,1 0.04,0.76 0.24,0.96
    arwCollapse | 90 90 | 가운데로 모으기 | Collapse Arrows | L l 0,0 0.36,0.36; L l 1,0 0.64,0.36; L l 1,1 0.64,0.64; L l 0,1 0.36,0.64; S p 0.44,0.44 0.22,0.4 0.4,0.22; S p 0.56,0.44 0.6,0.22 0.78,0.4; S p 0.56,0.56 0.78,0.6 0.6,0.78; S p 0.44,0.56 0.4,0.78 0.22,0.6
    arwStairs | 100 90 | 계단 화살표 | Stairs Arrow | L l 0.05,0.95 0.05,0.72 0.35,0.72 0.35,0.48 0.65,0.48 0.65,0.22 0.84,0.22; S p 0.8,0.06 1,0.22 0.8,0.38
    arwBounce | 110 80 | 튀는 화살표 | Bounce Arrow | L q 0,0.9 0.25,0.05 0.5,0.9; L q 0.5,0.9 0.68,0.3 0.84,0.72; S p 0.74,0.7 0.96,0.96 0.98,0.66
    arwRefresh | 90 90 | 새로 고침 화살표 | Refresh Arrow | L b 0.85,0.5 0.85,0.08 0.15,0.08 0.15,0.5 0.15,0.92 0.72,0.96 0.82,0.7; S p 0.68,0.62 0.96,0.6 0.86,0.86
  `);

  // ───────────────────────── flowchart (to 42)
  define('flowchart', `
    fcTransfer | 120 70 | 이송 | Transfer | M p 0,0.25 0.7,0.25 0.7,0 1,0.5 0.7,1 0.7,0.75 0,0.75
    fcAuxOp | 120 70 | 보조 작업 | Auxiliary Operation | M r 0 0 1 1 0; L l 0,0.5 1,0.5
  `);

  // ───────────────────────── callouts & text (to 42)
  define('callouts', `
    clThought | 120 90 | 생각 풍선 | Thought Bubble | M e 0.55 0.4 0.43 0.36; M c 0.2 0.82 0.08; M c 0.08 0.95 0.04
    clShout | 120 90 | 외침 풍선 | Shout Bubble | M p 0.1,0.1 0.3,0.2 0.5,0 0.6,0.2 0.9,0.05 0.82,0.35 1,0.5 0.82,0.62 0.92,0.95 0.6,0.8 0.45,1 0.35,0.78 0.05,0.9 0.15,0.6 0,0.4 0.15,0.3
    clWhisper | 120 80 | 속삭임 풍선 | Whisper Bubble | L r 0.02 0.02 0.96 0.7 12; L l 0.2,0.72 0.12,0.98 0.38,0.72
    clRightPointer | 130 70 | 오른쪽 말풍선 | Right Speech Bubble | M p 0,0 0.82,0 0.82,0.35 1,0.5 0.82,0.65 0.82,1 0,1
    clTopPointer | 120 90 | 위쪽 말풍선 | Up Speech Bubble | M p 0,0.2 0.4,0.2 0.5,0 0.6,0.2 1,0.2 1,1 0,1
    clDoubleBorder | 130 70 | 이중 테두리 상자 | Double-Border Box | M r 0 0 1 1 4; L r 0.05 0.1 0.9 0.8 3
    clTag | 120 60 | 이름표 | Name Tag | M p 0,0.5 0.2,0 1,0 1,1 0.2,1; L c 0.17 0.5 0.06
    clRibbonDown | 140 70 | 아래 리본 | Down Ribbon | M p 0,0 1,0 1,0.75 0.55,0.75 0.5,1 0.45,0.75 0,0.75
    clLabelLeft | 130 50 | 왼쪽 표지 | Left Label | M p 0.15,0 1,0 1,1 0.15,1 0,0.5
    clStickyYellow | 100 100 | 노란 메모지 | Yellow Sticky Note | T p 0,0 1,0 1,0.8 0.8,1 0,1; D p 0.8,1 0.8,0.8 1,0.8 | A
    clPin | 100 100 | 압정 메모 | Pinned Note | M r 0 0.1 1 0.9 2; S c 0.5 0.1 0.08
    clTape | 110 90 | 테이프 메모 | Taped Note | M r 0 0.12 1 0.88 2; T r 0.3 0 0.4 0.22 0
    clQuoteBox | 130 80 | 인용 상자 | Quote Box | M r 0 0 1 1 6; S q 0.08,0.35 0.08,0.15 0.2,0.12; S q 0.92,0.65 0.92,0.85 0.8,0.88
    clCheckBox | 130 60 | 체크 항목 | Checklist Item | M r 0 0 1 1 6; L r 0.06 0.25 0.14 0.5 2; L l 0.08,0.5 0.12,0.62 0.18,0.36
    clWarnBox | 130 70 | 주의 상자 | Warning Box | M r 0 0 1 1 6; S p 0.12,0.2 0.22,0.75 0.02,0.75
    clInfoBox | 130 70 | 정보 상자 | Info Box | M r 0 0 1 1 6; L c 0.12 0.5 0.12; S c 0.12 0.34 0.03; L l 0.12,0.45 0.12,0.7
    clNumberCircle | 70 70 | 번호 원 | Numbered Circle | M c 0.5 0.5 0.48; L c 0.5 0.5 0.4 | A
    clStepArrow | 140 60 | 단계 상자 | Step Box | M p 0,0 0.85,0 1,0.5 0.85,1 0,1
  `);

  // ───────────────────────── containers (to 42)
  define('containers', `
    ctnTopBand | 300 200 | 위 띠 컨테이너 | Top-Band Container | M r 0 0 1 1 6; D r 0 0 1 0.14 0
    ctnBottomBand | 300 200 | 아래 띠 컨테이너 | Bottom-Band Container | M r 0 0 1 1 6; D r 0 0.86 1 0.14 0
    ctnRightBand | 300 200 | 오른쪽 띠 컨테이너 | Right-Band Container | M r 0 0 1 1 6; D r 0.88 0 0.12 1 0
    ctnFolderTab | 300 200 | 폴더 탭 컨테이너 | Folder-Tab Container | M p 0,0.12 0,1 1,1 1,0.12 0.4,0.12 0.35,0 0.03,0
    ctnCorner | 300 200 | 모서리 표시 컨테이너 | Corner-Mark Container | L r 0 0 1 1 0; S p 0,0 0.12,0 0,0.18
    ctnShadowBox | 300 200 | 그림자 컨테이너 | Shadow Container | D r 0.03 0.04 0.97 0.96 6; M r 0 0 0.97 0.96 6
    ctnRoundDashed | 300 200 | 둥근 점선 컨테이너 | Rounded Dashed Frame | L r 0.01 0.01 0.98 0.98 24; L r 0.04 0.06 0.92 0.88 20
    ctnBracketFrame | 300 200 | 괄호 틀 | Bracket Frame | L l 0.08,0 0,0 0,1 0.08,1; L l 0.92,0 1,0 1,1 0.92,1
    ctnTitled | 300 200 | 제목줄 상자 | Titled Box | M r 0 0 1 1 4; T r 0.02 0.03 0.6 0.12 3
    ctnCard | 300 200 | 카드 컨테이너 | Card Container | M r 0 0 1 1 14; D r 0 0 1 0.05 0
    ctnLaneH3 | 400 240 | 가로 레인 3개 | Three Horizontal Lanes | M r 0 0 1 1 0; L l 0,0.333 1,0.333; L l 0,0.667 1,0.667; D r 0 0 0.08 1 0
    ctnLaneV3 | 400 240 | 세로 레인 3개 | Three Vertical Lanes | M r 0 0 1 1 0; L l 0.333,0 0.333,1; L l 0.667,0 0.667,1; D r 0 0 1 0.1 0
    ctnMatrix2 | 300 300 | 2×2 영역 | 2×2 Regions | M r 0 0 1 1 0; L l 0.5,0 0.5,1; L l 0,0.5 1,0.5 | A
    ctnMatrix3 | 300 300 | 3×3 영역 | 3×3 Regions | M r 0 0 1 1 0; L l 0.333,0 0.333,1; L l 0.667,0 0.667,1; L l 0,0.333 1,0.333; L l 0,0.667 1,0.667 | A
    ctnTwoCol | 320 200 | 두 단 상자 | Two-Column Box | M r 0 0 1 1 4; D r 0 0 1 0.12 0; L l 0.5,0.12 0.5,1
    ctnSidebar | 320 200 | 옆 칸 상자 | Sidebar Box | M r 0 0 1 1 4; T r 0 0 0.25 1 0
    ctnHeaderFooter | 300 220 | 머리·바닥 상자 | Header & Footer Box | M r 0 0 1 1 4; D r 0 0 1 0.12 0; D r 0 0.9 1 0.1 0
    ctnTimelineLane | 400 120 | 일정 레인 | Timeline Lane | M r 0 0 1 1 0; D r 0 0 0.14 1 0; L l 0.4,0 0.4,1; L l 0.7,0 0.7,1
    ctnGroupBrace | 300 200 | 중괄호 묶음 | Brace Group | L q 0.06,0 0,0 0,0.25 0,0.5 0.06,0.5 0,0.5 0,0.75 0,1 0.06,1; L r 0.12 0 0.88 1 6
    ctnPhase | 300 200 | 단계 구역 | Phase Area | T r 0 0 1 1 0; L l 0,0 0,1; L l 1,0 1,1; D p 0,0 0.4,0 0.45,0.08 0.4,0.16 0,0.16
    ctnCloudArea | 300 200 | 구름 영역 | Cloud Area | L q 0.15,0.9 0,0.9 0.03,0.6 0,0.3 0.2,0.25 0.25,0 0.5,0.08 0.75,0 0.82,0.25 1,0.3 0.97,0.6 1,0.9 0.85,0.9 0.5,1.05 0.15,0.9
    ctnRegion | 300 200 | 영역 (모서리 따기) | Snipped Region | M p 0.08,0 0.92,0 1,0.12 1,0.88 0.92,1 0.08,1 0,0.88 0,0.12
    ctnZoneRed | 300 200 | 위험 구역 | Danger Zone | T r 0 0 1 1 8; L r 0.02 0.03 0.96 0.94 6; S p 0.04,0.06 0.14,0.06 0.09,0.16
    ctnTabsTop | 320 200 | 탭 세 개 상자 | Three-Tab Box | M p 0,0.14 0,1 1,1 1,0.14; M r 0 0 0.28 0.14 3; T r 0.3 0.02 0.28 0.12 3; T r 0.6 0.02 0.28 0.12 3
    ctnTray | 300 160 | 쟁반 상자 | Tray | M p 0,0.15 0.08,1 0.92,1 1,0.15; L l 0,0.15 1,0.15
    ctnBoxOpen | 300 200 | 열린 상자 | Open Box | M p 0,0.3 0.5,0.45 1,0.3 1,1 0,1; T p 0,0.3 0.2,0 0.7,0.15 0.5,0.45
  `);

  // ───────────────────────── UML (to 42)
  define('uml', `
    umlCollaboration | 140 80 | 협력 | Collaboration | L e 0.5 0.5 0.49 0.47
    umlSignal | 130 60 | 신호 | Signal | M p 0,0 0.85,0 1,0.5 0.85,1 0,1
    umlAcceptEvent | 130 60 | 이벤트 수락 | Accept Event | M p 0,0 1,0 1,1 0,1 0.15,0.5
    umlJoin | 160 20 | 결합 막대 | Join Bar | S r 0 0 1 1 2
    umlDataType | 160 90 | 데이터형 | Data Type | M r 0 0 1 1 0; L l 0,0.3 1,0.3; T r 0 0 1 0.3 0
    umlPort | 30 30 | 포트 | Port | M r 0 0 1 1 0 | A
    umlInterfaceBall | 60 40 | 제공 인터페이스 | Provided Interface | L l 0,0.5 0.55,0.5; M c 0.78 0.5 0.4 | B
    umlInterfaceSocket | 60 40 | 요구 인터페이스 | Required Interface | L l 0,0.5 0.6,0.5; L q 0.95,0.1 0.6,0.1 0.6,0.5 0.6,0.9 0.95,0.9 | B
    umlTimeConstraint | 90 90 | 시간 제약 | Time Constraint | L l 0.1,0 0.9,0 0.1,1 0.9,1 0.1,0 | A B
    umlDeployNode3d | 160 110 | 3D 노드 | 3D Node | M p 0,0.18 0.12,0 1,0 1,0.82 0.88,1 0,1; L l 0,0.18 0.88,0.18 1,0; L l 0.88,0.18 0.88,1
    umlStereotypeBox | 160 80 | 스테레오타입 상자 | Stereotype Box | M r 0 0 1 1 0; T r 0 0 1 0.25 0
    umlNoteLink | 140 80 | 연결 메모 | Linked Note | M p 0,0 0.82,0 1,0.2 1,1 0,1; L l 0.82,0 0.82,0.2 1,0.2
  `);

  // ───────────────────────── wireframe (to 42)
  define('wireframe', `
    uiAccordion | 200 150 | 아코디언 | Accordion | M r 0 0 1 1 4; L l 0,0.25 1,0.25; L l 0,0.75 1,0.75; L l 0.9,0.1 0.94,0.15 0.98,0.1
    uiStepper | 220 50 | 단계 표시 | Stepper | S c 0.1 0.5 0.18; L l 0.18,0.5 0.42,0.5; M c 0.5 0.5 0.18; L l 0.58,0.5 0.82,0.5; M c 0.9 0.5 0.18
    uiRating | 150 40 | 별점 | Star Rating | S p 0.1,0.05 0.13,0.38 0.2,0.4 0.14,0.6 0.16,0.95 0.1,0.75 0.04,0.95 0.06,0.6 0,0.4 0.07,0.38; S p 0.3,0.05 0.33,0.38 0.4,0.4 0.34,0.6 0.36,0.95 0.3,0.75 0.24,0.95 0.26,0.6 0.2,0.4 0.27,0.38; L p 0.5,0.05 0.53,0.38 0.6,0.4 0.54,0.6 0.56,0.95 0.5,0.75 0.44,0.95 0.46,0.6 0.4,0.4 0.47,0.38
    uiBadge | 60 40 | 배지 | Badge | S r 0 0 1 1 20
    uiToast | 220 60 | 알림 토스트 | Toast | M r 0 0 1 1 8; S c 0.1 0.5 0.18; L l 0.25,0.4 0.85,0.4; L l 0.25,0.62 0.7,0.62
    uiMenuBar | 300 40 | 메뉴 막대 | Menu Bar | M r 0 0 1 1 0; L l 0.04,0.5 0.16,0.5; L l 0.22,0.5 0.34,0.5; L l 0.4,0.5 0.52,0.5
    uiContextMenu | 150 160 | 컨텍스트 메뉴 | Context Menu | M r 0 0 1 1 4; L l 0.1,0.15 0.8,0.15; L l 0.1,0.35 0.8,0.35; L l 0,0.48 1,0.48; L l 0.1,0.62 0.7,0.62; L l 0.1,0.82 0.75,0.82
    uiColorPicker | 150 150 | 색 고르기 | Color Picker | M r 0 0 1 0.8 4; T r 0.05 0.05 0.9 0.5 0; D r 0.05 0.62 0.9 0.1 0; L c 0.7 0.25 0.06
    uiFileUpload | 200 120 | 파일 올리기 | File Upload | L r 0 0 1 1 8; L l 0.5,0.65 0.5,0.25; L l 0.38,0.38 0.5,0.25 0.62,0.38; L l 0.3,0.78 0.7,0.78
    uiMap | 200 150 | 지도 위젯 | Map Widget | M r 0 0 1 1 4; L l 0,0.6 0.4,0.4 1,0.7; L l 0.3,0 0.45,1; S p 0.62,0.2 0.7,0.2 0.66,0.45
    uiChart | 200 140 | 차트 위젯 | Chart Widget | M r 0 0 1 1 4; S r 0.15 0.5 0.12 0.4 0; S r 0.35 0.3 0.12 0.6 0; S r 0.55 0.45 0.12 0.45 0; S r 0.75 0.2 0.12 0.7 0
    uiHamburger | 50 50 | 햄버거 메뉴 | Hamburger Menu | M r 0 0 1 1 6; L l 0.25,0.32 0.75,0.32; L l 0.25,0.5 0.75,0.5; L l 0.25,0.68 0.75,0.68 | A
    uiFooter | 300 60 | 바닥 영역 | Footer | D r 0 0 1 1 0; L l 0.05,0.4 0.25,0.4; L l 0.05,0.62 0.2,0.62; L l 0.4,0.4 0.6,0.4; L l 0.75,0.4 0.95,0.4
  `);

  // ───────────────────────── database / ERD (to 42)
  define('erd', `
    erdPk | 140 36 | 기본 키 열 | Primary Key Column | M r 0 0 1 1 0; S c 0.08 0.5 0.12; L l 0.08,0.5 0.18,0.5; L l 0.25,0.5 0.8,0.5
    erdFk | 140 36 | 외래 키 열 | Foreign Key Column | M r 0 0 1 1 0; L c 0.08 0.5 0.12; L l 0.08,0.5 0.18,0.5; L l 0.25,0.5 0.8,0.5
    erdColumn | 140 36 | 일반 열 | Column | M r 0 0 1 1 0; L l 0.25,0.5 0.8,0.5
    erdUnique | 140 36 | 고유 열 | Unique Column | M r 0 0 1 1 0; L r 0.03 0.25 0.1 0.5 0; L l 0.25,0.5 0.8,0.5
    erdOneToOne | 120 30 | 1:1 관계선 | One-to-One Line | L l 0,0.5 1,0.5; L l 0.1,0.2 0.1,0.8; L l 0.9,0.2 0.9,0.8
    erdOneToMany | 120 30 | 1:N 관계선 | One-to-Many Line | L l 0,0.5 1,0.5; L l 0.1,0.2 0.1,0.8; L l 0.85,0.5 1,0.15; L l 0.85,0.5 1,0.85
    erdManyToMany | 120 30 | N:M 관계선 | Many-to-Many Line | L l 0,0.5 1,0.5; L l 0.15,0.5 0,0.15; L l 0.15,0.5 0,0.85; L l 0.85,0.5 1,0.15; L l 0.85,0.5 1,0.85
    erdZeroOrOne | 120 30 | 0 또는 1 | Zero or One | L l 0,0.5 1,0.5; L c 0.8 0.5 0.25; L l 0.95,0.2 0.95,0.8
    erdView | 160 110 | 뷰 테이블 | View Table | L r 0 0 1 1 4; T r 0 0 1 0.22 0; L l 0.08,0.4 0.7,0.4; L l 0.08,0.6 0.6,0.6
    erdTemp | 160 110 | 임시 테이블 | Temporary Table | M r 0 0 1 1 4; D r 0 0 1 0.22 0; L c 0.85 0.62 0.12; L l 0.85,0.62 0.85,0.52; L l 0.85,0.62 0.92,0.62
    erdPartition | 160 110 | 파티션 테이블 | Partitioned Table | M r 0 0 1 1 4; D r 0 0 1 0.22 0; L l 0.33,0.22 0.33,1; L l 0.66,0.22 0.66,1
    erdSequence | 100 70 | 시퀀스 | Sequence | M r 0 0 1 1 6; L l 0.2,0.65 0.4,0.65 0.4,0.45 0.6,0.45 0.6,0.25 0.8,0.25
    erdFunction | 100 70 | 함수 | Function | M r 0 0 1 1 6; L q 0.6,0.2 0.45,0.15 0.42,0.4 0.38,0.85 0.25,0.8; L l 0.32,0.45 0.58,0.45
    erdSynonym | 100 70 | 동의어 | Synonym | M r 0 0 1 1 6; L l 0.2,0.4 0.8,0.4; L l 0.2,0.6 0.8,0.6
    erdSchemaBox | 220 160 | 스키마 영역 | Schema Area | L r 0 0 1 1 10; T r 0 0 0.4 0.14 4
    erdCluster | 120 90 | DB 클러스터 | DB Cluster | M e 0.3 0.2 0.25 0.1; M r 0.05 0.2 0.5 0.6 0; M e 0.7 0.35 0.25 0.1; M r 0.45 0.35 0.5 0.55 0
    erdBackup | 90 100 | DB 백업 | DB Backup | M r 0 0.15 1 0.7 0; M e 0.5 0.15 0.5 0.15; L e 0.5 0.85 0.5 0.15; L l 0.5,0.4 0.5,0.7; L l 0.4,0.6 0.5,0.7 0.6,0.6
    erdReplica | 120 90 | 복제본 | Replica | M r 0.05 0.25 0.4 0.6 0; M r 0.55 0.25 0.4 0.6 0; L l 0.45,0.55 0.55,0.55; L l 0.5,0.5 0.55,0.55 0.5,0.6
    erdShard | 120 90 | 샤드 | Shard | M p 0,0.2 0.45,0.1 0.45,0.9 0,1; M p 0.55,0.1 1,0 1,0.8 0.55,0.9
    erdDoc | 90 100 | 문서 DB | Document DB | M p 0,0 0.7,0 1,0.25 1,1 0,1; L l 0.15,0.35 0.6,0.35; L l 0.15,0.5 0.75,0.5; L l 0.15,0.65 0.7,0.65
    erdKeyValue | 120 80 | 키-값 저장소 | Key-Value Store | M r 0 0 1 1 4; D r 0 0 0.35 1 0; L l 0,0.33 1,0.33; L l 0,0.66 1,0.66
    erdGraph | 110 90 | 그래프 DB | Graph DB | L l 0.2,0.25 0.75,0.2 0.55,0.75 0.2,0.25; M c 0.2 0.25 0.14; M c 0.75 0.2 0.14; M c 0.55 0.75 0.14
    erdCache | 110 80 | 캐시 | Cache | M r 0 0 1 1 6; S p 0.55,0.1 0.35,0.55 0.5,0.55 0.42,0.9 0.68,0.4 0.52,0.4
    erdQuery | 110 80 | 질의 | Query | M r 0 0 1 1 6; L c 0.45 0.45 0.22; L l 0.6,0.62 0.78,0.82
  `);

  // ───────────────────────── BPMN (to 42)
  define('bpmn', `
    bpmnLinkEvent | 50 50 | 링크 이벤트 | Link Event | L c 0.5 0.5 0.48; L c 0.5 0.5 0.4; S p 0.28,0.4 0.55,0.4 0.55,0.28 0.75,0.5 0.55,0.72 0.55,0.6 0.28,0.6 | A B
    bpmnCompensate | 50 50 | 보상 이벤트 | Compensation Event | L c 0.5 0.5 0.48; L c 0.5 0.5 0.4; S p 0.25,0.5 0.48,0.32 0.48,0.68; S p 0.48,0.5 0.72,0.32 0.72,0.68 | A B
    bpmnCancel | 50 50 | 취소 이벤트 | Cancel Event | L c 0.5 0.5 0.48; L c 0.5 0.5 0.4; S p 0.3,0.36 0.36,0.3 0.5,0.44 0.64,0.3 0.7,0.36 0.56,0.5 0.7,0.64 0.64,0.7 0.5,0.56 0.36,0.7 0.3,0.64 0.44,0.5 | A B
    bpmnMultiple | 50 50 | 다중 이벤트 | Multiple Event | L c 0.5 0.5 0.48; L p 0.5,0.25 0.75,0.43 0.66,0.72 0.34,0.72 0.25,0.43 | A B
    bpmnParallelMulti | 50 50 | 병렬 다중 이벤트 | Parallel Multiple Event | L c 0.5 0.5 0.48; L p 0.42,0.25 0.58,0.25 0.58,0.42 0.75,0.42 0.75,0.58 0.58,0.58 0.58,0.75 0.42,0.75 0.42,0.58 0.25,0.58 0.25,0.42 0.42,0.42 | A B
    bpmnBusinessRule | 120 80 | 비즈니스 규칙 작업 | Business Rule Task | M r 0 0 1 1 10; L r 0.06 0.08 0.18 0.24 0; L l 0.06,0.16 0.24,0.16; L l 0.12,0.08 0.12,0.32
    bpmnMultiInstance | 120 80 | 다중 인스턴스 작업 | Multi-Instance Task | M r 0 0 1 1 10; L l 0.45,0.75 0.45,0.95; L l 0.5,0.75 0.5,0.95; L l 0.55,0.75 0.55,0.95
    bpmnSequentialMulti | 120 80 | 순차 다중 작업 | Sequential Multi Task | M r 0 0 1 1 10; L l 0.42,0.78 0.58,0.78; L l 0.42,0.85 0.58,0.85; L l 0.42,0.92 0.58,0.92
    bpmnAdHoc | 140 90 | 임의 하위 프로세스 | Ad-Hoc Subprocess | M r 0 0 1 1 10; L q 0.42,0.85 0.46,0.78 0.5,0.85 0.54,0.92 0.58,0.85
    bpmnTransaction | 140 90 | 트랜잭션 | Transaction | M r 0 0 1 1 10; L r 0.04 0.06 0.92 0.88 8
    bpmnEventSub | 140 90 | 이벤트 하위 프로세스 | Event Subprocess | L r 0 0 1 1 10; T c 0.12 0.2 0.08
    bpmnMessageFlow | 120 30 | 메시지 흐름 | Message Flow | L c 0.06 0.5 0.12; L l 0.12,0.5 0.86,0.5; L p 0.86,0.25 1,0.5 0.86,0.75
  `);

  // ───────────────────────── network (to 48)
  define('network', `
    netAccessPoint6 | 70 70 | 와이파이 6 AP | Wi-Fi 6 Access Point | M e 0.5 0.75 0.42 0.18; L q 0.25,0.45 0.5,0.25 0.75,0.45; L q 0.12,0.32 0.5,0.02 0.88,0.32 | B
    netIds | 90 70 | 침입 탐지 | Intrusion Detection | M r 0 0.1 1 0.8 6; L c 0.4 0.5 0.18; L l 0.53,0.63 0.7,0.8 | B
    netSdwan | 120 80 | SD-WAN | SD-WAN | M r 0 0.2 1 0.6 8; L l 0.12,0.5 0.4,0.5 0.55,0.35 0.88,0.35; L l 0.55,0.65 0.88,0.65; L l 0.4,0.5 0.55,0.65 | B
  `, { below: true });

  // ───────────────────────── cloud (to 42)
  define('cloud', `
    cldGateway | 70 70 | NAT 게이트웨이 | NAT Gateway | M r 0 0 1 1 10; L l 0.2,0.5 0.8,0.5; L l 0.65,0.35 0.8,0.5 0.65,0.65 | A
    cldLoadBalancer | 70 70 | 부하 분산 | Load Balancing | M c 0.5 0.5 0.48; L l 0.25,0.5 0.5,0.5 0.75,0.28; L l 0.5,0.5 0.75,0.5; L l 0.5,0.5 0.75,0.72 | A
    cldWaf | 70 70 | 웹 방화벽 | Web Firewall | M r 0 0 1 1 10; L l 0,0.33 1,0.33; L l 0,0.66 1,0.66; L l 0.33,0 0.33,0.33; L l 0.66,0.33 0.66,0.66; L l 0.33,0.66 0.33,1 | A
    cldKms | 70 70 | 키 관리 | Key Management | M r 0 0 1 1 10; L c 0.38 0.5 0.15; L l 0.53,0.5 0.85,0.5 0.85,0.62; L l 0.72,0.5 0.72,0.6 | A
    cldWorkflow | 70 70 | 워크플로 | Workflow | M r 0 0 1 1 10; M r 0.12 0.15 0.25 0.2 2; M r 0.62 0.15 0.25 0.2 2; M r 0.37 0.65 0.25 0.2 2; L l 0.37,0.25 0.62,0.25; L l 0.75,0.35 0.5,0.65 | A
    cldSearch | 70 70 | 검색 서비스 | Search Service | M r 0 0 1 1 10; L c 0.45 0.45 0.22; L l 0.6,0.6 0.82,0.82 | A
    cldEmail | 70 70 | 메일 서비스 | Email Service | M r 0 0 1 1 10; L r 0.15 0.28 0.7 0.44 2; L l 0.15,0.28 0.5,0.55 0.85,0.28 | A
    cldIot | 70 70 | IoT 허브 | IoT Hub | M r 0 0 1 1 10; L c 0.5 0.5 0.12; L c 0.2 0.2 0.07; L c 0.8 0.2 0.07; L c 0.2 0.8 0.07; L c 0.8 0.8 0.07; L l 0.26,0.26 0.42,0.42; L l 0.74,0.26 0.58,0.42; L l 0.26,0.74 0.42,0.58; L l 0.74,0.74 0.58,0.58 | A
    cldDataLake | 80 70 | 데이터 레이크 | Data Lake | M e 0.5 0.6 0.48 0.35; L q 0.15,0.55 0.3,0.45 0.45,0.55 0.6,0.65 0.75,0.55 | A
    cldWarehouse | 80 70 | 데이터 웨어하우스 | Data Warehouse | M p 0,0.35 0.5,0 1,0.35 1,1 0,1; L l 0.2,0.55 0.8,0.55; L l 0.2,0.75 0.8,0.75 | A
    cldMl | 70 70 | 머신러닝 | Machine Learning | M r 0 0 1 1 10; L c 0.3 0.3 0.08; L c 0.3 0.7 0.08; L c 0.7 0.5 0.08; L l 0.38,0.3 0.62,0.48; L l 0.38,0.7 0.62,0.52 | A
    cldBilling | 70 70 | 요금 | Billing | M r 0 0 1 1 10; L c 0.5 0.5 0.28; L l 0.5,0.28 0.5,0.72; L q 0.62,0.38 0.5,0.32 0.42,0.42 0.58,0.52 0.45,0.66 | A
    cldVpnGateway | 70 70 | VPN 게이트웨이 | VPN Gateway | M r 0 0 1 1 10; L r 0.32 0.45 0.36 0.3 3; L q 0.38,0.45 0.38,0.25 0.5,0.25 0.62,0.25 0.62,0.45 | A
  `, { below: true, qs: 'subtle' });

  // ───────────────────────── security (to 42)
  define('security', `
    secMfa | 70 80 | 다중 인증 | Multi-Factor Auth | M r 0.15 0 0.7 1 8; L r 0.25 0.15 0.5 0.4 2; S c 0.35 0.75 0.05; S c 0.5 0.75 0.05; S c 0.65 0.75 0.05 | A
    secSso | 80 70 | 통합 로그인 | Single Sign-On | M c 0.3 0.5 0.25; M c 0.7 0.5 0.25; L c 0.5 0.5 0.1 | A
    secVpnTunnel | 100 60 | VPN 터널 | VPN Tunnel | M e 0.5 0.5 0.48 0.4; L e 0.5 0.5 0.3 0.22; L l 0.05,0.5 0.95,0.5 | A
    secBug | 70 80 | 취약점 | Vulnerability | M e 0.5 0.55 0.25 0.35; L l 0.25,0.4 0.05,0.3; L l 0.75,0.4 0.95,0.3; L l 0.25,0.7 0.05,0.8; L l 0.75,0.7 0.95,0.8; L l 0.5,0.2 0.5,0.9 | A
    secPatch | 80 80 | 보안 패치 | Security Patch | M r 0.1 0.3 0.8 0.4 20; L c 0.4 0.45 0.03; L c 0.6 0.45 0.03; L c 0.4 0.58 0.03; L c 0.6 0.58 0.03 | A
    secPolicy | 70 90 | 보안 정책 | Security Policy | M p 0,0 0.7,0 1,0.2 1,1 0,1; L l 0.15,0.3 0.75,0.3; L l 0.15,0.45 0.75,0.45; S p 0.5,0.6 0.75,0.68 0.72,0.88 0.5,0.97 0.28,0.88 0.25,0.68 | A
    secBackup | 80 80 | 백업 | Backup | M r 0.05 0.3 0.9 0.6 4; L l 0.5,0.05 0.5,0.55; L l 0.35,0.4 0.5,0.55 0.65,0.4 | A
    secLog | 70 90 | 감사 로그 | Audit Trail | M r 0 0 1 1 4; L l 0.15,0.2 0.85,0.2; L l 0.15,0.4 0.85,0.4; L l 0.15,0.6 0.6,0.6; S c 0.78 0.78 0.1 | A
    secRole | 70 80 | 역할 | Role | M c 0.5 0.28 0.22; M p 0.12,0.95 0.18,0.6 0.82,0.6 0.88,0.95; S p 0.5,0.65 0.6,0.75 0.5,0.92 0.4,0.75 | A
    secPermission | 80 70 | 권한 | Permission | M r 0 0.3 1 0.7 4; L q 0.3,0.3 0.3,0 0.5,0 0.7,0 0.7,0.3; L l 0.3,0.65 0.45,0.8 0.75,0.48 | A
    secDdos | 90 80 | 디도스 | DDoS Attack | L l 0.05,0.15 0.6,0.5; L l 0.05,0.5 0.6,0.5; L l 0.05,0.85 0.6,0.5; M r 0.6 0.25 0.38 0.5 4; S p 0.75,0.3 0.7,0.5 0.8,0.5 0.75,0.7 0.88,0.45 0.78,0.45 | A
    secPhishing | 80 80 | 피싱 | Phishing | L l 0.6,0.05 0.6,0.55; L q 0.6,0.55 0.6,0.8 0.42,0.8 0.3,0.8 0.3,0.65; M r 0.05 0.05 0.4 0.3 2; L l 0.05,0.05 0.25,0.22 0.45,0.05 | A
    secMalware | 70 70 | 악성코드 | Malware | M c 0.5 0.5 0.3; L l 0.5,0.05 0.5,0.2; L l 0.5,0.8 0.5,0.95; L l 0.05,0.5 0.2,0.5; L l 0.8,0.5 0.95,0.5; L l 0.18,0.18 0.29,0.29; L l 0.82,0.18 0.71,0.29; S c 0.42 0.45 0.05; S c 0.58 0.45 0.05 | A
    secQuarantine | 80 80 | 격리 | Quarantine | L r 0.05 0.05 0.9 0.9 6; L r 0.12 0.12 0.76 0.76 4; M c 0.5 0.5 0.2 | A
    secWebShield | 80 80 | 웹 보호 | Web Shield | M p 0.5,0 0.95,0.15 0.9,0.6 0.5,1 0.1,0.6 0.05,0.15; L c 0.5 0.45 0.2; L l 0.3,0.45 0.7,0.45; L l 0.5,0.25 0.5,0.65 | A
    secCloudLock | 90 70 | 클라우드 보안 | Cloud Security | M q 0.2,0.8 0,0.8 0.05,0.55 0.1,0.3 0.32,0.35 0.4,0.05 0.65,0.2 0.95,0.2 0.9,0.5 1,0.8 0.8,0.8; S r 0.4 0.45 0.2 0.25 2 | A
    secCertificateChain | 100 70 | 인증서 체인 | Certificate Chain | M r 0 0.1 0.45 0.5 3; M r 0.55 0.4 0.45 0.5 3; L l 0.45,0.35 0.55,0.65 | A
    secSandbox | 80 80 | 샌드박스 | Sandbox | M p 0,0.35 0.15,1 0.85,1 1,0.35; L l 0.25,0.35 0.4,0.1 0.55,0.35; L l 0.5,0.35 0.7,0.05 0.85,0.35 | A
    secTokenCard | 90 60 | 보안 카드 | Smart Card | M r 0 0 1 1 6; T r 0.1 0.25 0.22 0.35 2; L l 0.45,0.7 0.85,0.7 | A
    secAlarm | 70 80 | 보안 경보 | Security Alarm | M q 0.15,0.75 0.15,0.1 0.5,0.1 0.85,0.1 0.85,0.75; L l 0.05,0.75 0.95,0.75; S c 0.5 0.88 0.08 | A
    secPassKey | 90 50 | 패스키 | Passkey | M c 0.25 0.5 0.4; L l 0.45,0.5 0.95,0.5 0.95,0.75; L l 0.75,0.5 0.75,0.7; S c 0.25 0.5 0.1 | A
  `, { below: true, qs: 'subtle' });

  addBulkMastersB(define);
  addBulkMastersC(define);
  addBulkMastersNew(define);
}
