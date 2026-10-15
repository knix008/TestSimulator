// Writes example drawings to samples/ (npm run build:samples):
//   01-gear-pair.mcad          meshing spur gears with centre distance and pitch circles
//   02-flange.mcad             a flange with bolt holes on its pitch circle (prints as an STL plate)
//   03-shaft.mcad              a stepped shaft with diameters and lengths dimensioned
//   04-bracket.mcad            a mounting plate: rounded rectangle, slots, holes (try 3D view / STL)
//   05-bolt-and-nut.mcad       an M10 bolt (side view), its nut and washer, a socket screw and a hole
//   06-cover-plate.mcad        hole arrays, a bolt circle of counterbores, slots
//   07-shaft-assembly.mcad     shaft, two bearings, gear, key and circlip
//   08-parts-catalog.mcad      all 36 library parts by category
//   09-solids-showcase.mcad    every 3D solid (FreeCAD Part primitives, pad, revolve, loft, sweep, boolean)
//   10-mounting-block.mcad     3D: a block made with booleans (fuse, cut)
//   11-springs-pipes.mcad      3D: helical spring, bent pipe (sweep), hopper (loft)
//   12-gearbox.mcad            3D: housing, shafts and gears padded from the gear outlines
//   13-drawing-views.mcad      3D bracket with front/top/right (hidden lines) and isometric views
//   14-sections.mcad           3D pulley and sleeve with section outlines
//   15-annotations.mcad        hatch patterns, leaders, splines, elliptical arcs, points, centre lines
//   16-imperial-plate.mcad     a plate designed in inches (try Settings › General › Length unit = in)
//   17-house-plan.mcad         architecture: a house floor plan at 1:100 (walls, doors, windows, stairs, grid, dimensions)
//   18-house-3d.mcad           architecture: the same house in 3D (walls with openings, roof, stairs, porch) and its elevations
//   19-office-plan.mcad        architecture: an office floor at 1:200 (columns, core, curtain wall, furniture)
//   20-gear-reducer.mcad       3D: a two-stage gear reducer (housing, lid, shafts, four gears, bearings)
//   21-shaft-detail.mcad       a production drawing of a shaft: sections, keyways, tolerances, title block notes
//   22-machine-vise.mcad       3D: a machine vise (body, jaws, screw, handle, workpiece)
//   23-steel-frame.mcad        3D: a steel portal frame (H columns and beams, bracing, base plates)
//   25–30 *.mcad               moving assemblies (joints, drives, couplings; play them in the 3D view):
//                              engine, four-bar linkage, gear train and rack, screw vise, robot arm, room doors
//   index.json                 the start page's sample list (titles, descriptions, tags, task)
//   04-bracket.dxf             the bracket as DXF R12
//   exports/                   the 3D samples in FreeCAD's formats: .FCStd .step .stl .3mf (the showcase also .obj .ply .off .amf),
//                              and 01/02/04 as DXF 2000, SVG, IGES and HP-GL/2
// samples/drawings/ holds 2D files from other programs and the format specifications
// (FreeCAD IGES/SVG/DXF, Inkscape-style SVG, HP-GL/2, Gerber, Excellon).
// samples/freecad/ holds files made by FreeCAD itself (npm run build:samples:freecad).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntity, createDrawing } from '../src/domain/drawing.js';
import { exportDxf } from '../src/domain/dxf.js';
import { exportDxf2000 } from '../src/domain/dxf2000.js';
import { exportHpgl } from '../src/domain/formats2d.js';
import { exportIges } from '../src/domain/iges.js';
import { exportSvg } from '../src/domain/svg.js';
import { serialize } from '../src/domain/format.js';
import { exportMesh } from '../src/domain/exchange3d.js';
import { solidMesh } from '../src/domain/solids.js';
import { toBinaryStl } from '../src/domain/stl.js';
import { gearReducer, house3d, housePlan, machineVise, officePlan, shaftDetail, steelFrame, twoStoreyHouse } from './models-complex.mjs';
import { crankEngine, fourBar, gearTrain, houseDoors, robotArm, screwVise } from './models-motion.mjs';
import { arraysPlate, drawingViewsSample, gearbox3d, mountingBlock, partsCatalog, sectionSample, shaftAssembly, solidsShowcase, springsAndPipes } from './models3d.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');
fs.mkdirSync(out, { recursive: true });

const dim = (drawing, data) => addEntity(drawing, 'dim', { size: 3.5, precision: 1, layer: 'dim', ...data });
const text = (drawing, x, y, value, size = 3.5) => addEntity(drawing, 'text', { x, y, text: value, size, layer: 'text' });
const sheet = (drawing, number, material) => Object.assign(drawing.sheet, { number, material, company: 'MyCAD samples' });

function gearPair() {
  const d = createDrawing({ title: '기어 쌍 (m2, z24/z16)', author: 'SHKWON' });
  sheet(d, 'MC-001', 'SM45C');
  addEntity(d, 'part', { kind: 'gear', x: 0, y: 0, params: { module: 2, teeth: 24, bore: 14 } });
  addEntity(d, 'part', { kind: 'gear', x: 40, y: 0, angle: 360 / 32, params: { module: 2, teeth: 16, bore: 10 } });
  dim(d, { kind: 'horizontal', x1: 0, y1: 0, x2: 40, y2: 0, ox: 20, oy: 40 });
  dim(d, { kind: 'diameter', cx: 0, cy: 0, r: 26, angle: 225 });
  dim(d, { kind: 'diameter', cx: 40, cy: 0, r: 18, angle: -40 });
  text(d, -26, -45, '모듈 2 · 압력각 20° · 중심 거리 40 mm');
  return d;
}

function flange() {
  const d = createDrawing({ title: '플랜지 Ø120', author: 'SHKWON' });
  sheet(d, 'MC-002', 'SS400');
  addEntity(d, 'part', { kind: 'flange', x: 0, y: 0, params: { outer: 120, bore: 40, pcd: 90, holes: 6, holeDia: 11 } });
  dim(d, { kind: 'diameter', cx: 0, cy: 0, r: 60, angle: 30 });
  dim(d, { kind: 'diameter', cx: 0, cy: 0, r: 20, angle: 200 });
  dim(d, { kind: 'diameter', cx: 0, cy: 0, r: 45, angle: 120, text: 'PCD <>' });
  text(d, -40, -80, '6-Ø11 등간격 관통');
  return d;
}

function shaft() {
  const d = createDrawing({ title: '단붙이 축', author: 'SHKWON' });
  sheet(d, 'MC-003', 'SCM440');
  addEntity(d, 'part', { kind: 'shaft', x: 0, y: 0, params: { segments: '20x30, 30x50, 25x20, 20x30', chamfer: 1 } });
  let x = 0;
  for (const [diameter, length] of [[20, 30], [30, 50], [25, 20], [20, 30]]) {
    dim(d, { kind: 'horizontal', x1: x, y1: diameter / 2, x2: x + length, y2: diameter / 2, ox: x + length / 2, oy: 26 });
    dim(d, { kind: 'vertical', x1: x + length / 2, y1: -diameter / 2, x2: x + length / 2, y2: diameter / 2, ox: x + length / 2, oy: 0, text: 'Ø<>' });
    x += length;
  }
  dim(d, { kind: 'horizontal', x1: 0, y1: 10, x2: x, y2: 10, ox: x / 2, oy: 36 });
  return d;
}

function bracket() {
  const d = createDrawing({ title: '고정 브래킷', author: 'SHKWON' });
  sheet(d, 'MC-004', 'AL6061');
  addEntity(d, 'rect', { x: 0, y: 0, width: 120, height: 70, radius: 8 });
  addEntity(d, 'part', { kind: 'slot', x: 30, y: 50, params: { length: 20, width: 8 } });
  addEntity(d, 'part', { kind: 'slot', x: 90, y: 50, params: { length: 20, width: 8 } });
  for (const [cx, cy] of [[15, 15], [105, 15]]) addEntity(d, 'circle', { cx, cy, r: 4.5, centerMark: true });
  addEntity(d, 'circle', { cx: 60, cy: 25, r: 12, centerMark: true });
  dim(d, { kind: 'horizontal', x1: 0, y1: 0, x2: 120, y2: 0, ox: 60, oy: -14 });
  dim(d, { kind: 'vertical', x1: 120, y1: 0, x2: 120, y2: 70, ox: 134, oy: 35 });
  dim(d, { kind: 'diameter', cx: 60, cy: 25, r: 12, angle: 35 });
  dim(d, { kind: 'horizontal', x1: 15, y1: 15, x2: 105, y2: 15, ox: 60, oy: 6 });
  text(d, 0, 84, '두께 6 mm — 3D 보기와 STL 내보내기로 확인하세요');
  return d;
}

function boltAndNut() {
  const d = createDrawing({ title: 'M10 볼트·너트·와셔', author: 'SHKWON' });
  sheet(d, 'MC-005', 'SCM435 (8.8)');
  addEntity(d, 'part', { kind: 'bolt', x: 0, y: 0, params: { size: 10, length: 40 } });
  addEntity(d, 'part', { kind: 'nut', x: 80, y: 0, params: { size: 10 } });
  addEntity(d, 'part', { kind: 'washer', x: 120, y: 0, params: { size: 10, type: 'plain' } });
  addEntity(d, 'part', { kind: 'socketScrew', x: 0, y: -50, params: { size: 8, length: 25 } });
  addEntity(d, 'part', { kind: 'hole', x: 80, y: -50, params: { size: 8, type: 'counterbore' } });
  dim(d, { kind: 'horizontal', x1: 0, y1: 5, x2: 40, y2: 5, ox: 20, oy: 18 });
  text(d, -6, -24, 'M10 × 40 · 너트 맞변 16 · 와셔 Ø20');
  return d;
}


/** Notes and annotation: text, leaders, every hatch pattern, splines, elliptical arcs, points, centre lines. */
function annotations() {
  const d = createDrawing({ title: '주석과 해칭', author: 'SHKWON' });
  sheet(d, 'MC-015', 'S45C');
  addEntity(d, 'rect', { x: 0, y: 0, width: 160, height: 90, radius: 6 });
  const patterns = ['solid', 'ansi31', 'ansi32', 'ansi37', 'net', 'line', 'dash', 'dots'];
  patterns.forEach((pattern, i) => {
    const x = 10 + (i % 4) * 37;
    const y = 50 - Math.floor(i / 4) * 35;
    const box = [{ x, y }, { x: x + 30, y }, { x: x + 30, y: y + 25 }, { x, y: y + 25 }];
    addEntity(d, 'polyline', { points: box, closed: true });
    addEntity(d, 'hatch', { loops: [box], pattern, scale: 1, angle: 0, layer: '0' });
    text(d, x, y - 5, pattern.toUpperCase(), 2.5);
  });
  addEntity(d, 'spline', { degree: 3, points: [{ x: 0, y: 110 }, { x: 30, y: 135 }, { x: 60, y: 95 }, { x: 90, y: 130 }, { x: 120, y: 105 }] });
  addEntity(d, 'ellipse', { cx: 145, cy: 115, rx: 18, ry: 9, angle: 15, start: 30, end: 300 });
  addEntity(d, 'point', { x: 145, y: 115, size: 2 });
  addEntity(d, 'line', { x1: 120, y1: 115, x2: 170, y2: 115, lineType: 'center', layer: 'center' });
  addEntity(d, 'leader', { points: [{ x: 25, y: 62 }, { x: 45, y: 100 }, { x: 70, y: 100 }], text: '전면 채우기 (SOLID)', size: 3.5, layer: 'text' });
  dim(d, { kind: 'horizontal', x1: 0, y1: 0, x2: 160, y2: 0, ox: 80, oy: -12 });
  dim(d, { kind: 'vertical', x1: 160, y1: 0, x2: 160, y2: 90, ox: 172, oy: 45 });
  text(d, 0, -28, '해칭 무늬 8종 · 스플라인 · 타원 호 · 점 · 중심선 · 지시선', 3.5);
  return d;
}

/** A plate drawn in inches (stored in mm): open it with Settings › General › Length unit = in. */
function imperialPlate() {
  const d = createDrawing({ title: '인치 판 (4 × 2.5 in)', author: 'SHKWON' });
  sheet(d, 'MC-016', 'AISI 1018');
  const inch = 25.4;
  addEntity(d, 'rect', { x: 0, y: 0, width: 4 * inch, height: 2.5 * inch, radius: 0.25 * inch });
  for (const [x, y] of [[0.5, 0.5], [3.5, 0.5], [3.5, 2], [0.5, 2]]) addEntity(d, 'circle', { cx: x * inch, cy: y * inch, r: 0.125 * inch, centerMark: true });
  addEntity(d, 'circle', { cx: 2 * inch, cy: 1.25 * inch, r: 0.5 * inch, centerMark: true });
  dim(d, { kind: 'horizontal', x1: 0, y1: 0, x2: 4 * inch, y2: 0, ox: 2 * inch, oy: -0.5 * inch, precision: 2 });
  dim(d, { kind: 'vertical', x1: 4 * inch, y1: 0, x2: 4 * inch, y2: 2.5 * inch, ox: 4.5 * inch, oy: 1.25 * inch, precision: 2 });
  dim(d, { kind: 'diameter', cx: 2 * inch, cy: 1.25 * inch, r: 0.5 * inch, angle: 45, precision: 2 });
  text(d, 0, -1 * inch, '설정 › 일반 › 길이 단위를 in로 바꾸면 치수가 인치로 나옵니다 (4.00", 2.50", Ø1.00")', 3);
  return d;
}

/** The start page's sample list (titles, descriptions, tags, the task each one shows). */
const SAMPLE_INDEX = [
  ['01-gear-pair.mcad', 'parts', ['기어 한 쌍', 'Gear pair'], ['모듈 2 기어 두 개의 맞물림, 중심 거리 치수', 'Two meshing module-2 gears with their centre distance'], ['기어', '부품', '치수']],
  ['02-flange.mcad', 'print', ['플랜지', 'Flange'], ['볼트 구멍 6개의 플랜지, 인쇄·3D 프린팅용', 'A flange with six bolt holes, for printing and 3D printing'], ['플랜지', '인쇄', 'STL']],
  ['03-shaft.mcad', 'precise', ['단 붙은 축', 'Stepped shaft'], ['지름과 길이를 치수로 넣은 축', 'A shaft with diameters and lengths dimensioned'], ['축', '치수']],
  ['04-bracket.mcad', 'draw', ['브래킷', 'Bracket'], ['둥근 사각형, 장공, 구멍으로 만든 판', 'A plate: rounded rectangle, slots, holes'], ['2D', '판']],
  ['05-bolt-and-nut.mcad', 'parts', ['볼트와 너트', 'Bolt and nut'], ['M10 볼트, 너트, 와셔, 소켓 볼트, 구멍', 'M10 bolt, nut, washer, socket screw and hole'], ['ISO', '체결']],
  ['06-cover-plate.mcad', 'modify', ['커버 플레이트', 'Cover plate'], ['직사각형·원형 배열로 만든 구멍들', 'Holes made with rectangular and polar arrays'], ['배열', '수정']],
  ['07-shaft-assembly.mcad', 'parts', ['축 조립', 'Shaft assembly'], ['축, 베어링, 기어, 키, 멈춤링', 'Shaft, bearings, gear, key and circlip'], ['조립', '베어링']],
  ['08-parts-catalog.mcad', 'parts', ['부품 목록', 'Parts catalog'], ['라이브러리의 부품 36가지', 'All 36 library parts'], ['라이브러리']],
  ['09-solids-showcase.mcad', 'solids', ['3D 솔리드 모음', '3D solids showcase'], ['모든 프리미티브와 돌출·회전·로프트·스윕·불리언', 'Every primitive, pad, revolve, loft, sweep and boolean'], ['3D', 'FreeCAD']],
  ['10-mounting-block.mcad', 'booleans', ['장착 블록', 'Mounting block'], ['합치기·빼기로 만든 블록', 'A block made with fuse and cut'], ['3D', '불리언']],
  ['11-springs-pipes.mcad', 'features', ['스프링과 관', 'Springs and pipes'], ['나선 스프링, 굽은 관(스윕), 호퍼(로프트)', 'Helical spring, bent pipe (sweep), hopper (loft)'], ['3D', '스윕', '로프트']],
  ['12-gearbox.mcad', 'features', ['기어박스', 'Gearbox'], ['기어 윤곽을 돌출한 하우징·축·기어', 'Housing, shafts and gears padded from gear outlines'], ['3D', '돌출']],
  ['13-drawing-views.mcad', 'views', ['도면 뷰', 'Drawing views'], ['정면·평면·우측면(숨은선)·등각 투상', 'Front, top, right (hidden lines) and isometric views'], ['투영', '숨은선']],
  ['14-sections.mcad', 'views', ['단면', 'Sections'], ['풀리와 슬리브의 단면 윤곽', 'Section outlines of a pulley and a sleeve'], ['단면']],
  ['15-annotations.mcad', 'annotate', ['주석과 해칭', 'Notes and hatching'], ['해칭 무늬 8종, 지시선, 스플라인, 타원 호, 점, 중심선', 'Eight hatch patterns, leaders, splines, elliptical arcs, points, centre lines'], ['해칭', '주석']],
  ['17-house-plan.mcad', 'arch', ['단독주택 평면도', 'House floor plan'], ['BIM 모델(벽·창호·계단·실·가구)의 1 m 단면 평면도 1:100 — 3D 보기로 같은 집', 'A 1:100 plan cut from the BIM model (walls, doors, windows, stairs, rooms, furniture) — the same house in 3D'], ['건축', 'BIM', '평면도', '3D']],
  ['18-house-3d.mcad', 'arch', ['단독주택 3D·입면도', 'House 3D and elevations'], ['BIM 벽·창호·박공지붕·계단·현관 — 모델에서 투영한 입면도, IFC', 'BIM walls, windows, gable roof, stairs, porch — elevations from the model, IFC'], ['건축', '3D', 'BIM', 'IFC']],
  ['19-office-plan.mcad', 'arch', ['사무소 기준층', 'Office floor'], ['BIM 기둥·통심선·커튼월·코어·회의실·책상 1:200 — 3D 보기로 입체', 'BIM columns, grid, curtain wall, core, meeting rooms, desks at 1:200 — in 3D too'], ['건축', 'BIM', '사무소']],
  ['20-gear-reducer.mcad', 'features', ['2단 감속기', 'Two-stage gear reducer'], ['하우징·덮개·축 3개·기어 4개·베어링으로 된 감속기', 'Housing, lid, three shafts, four gears and bearings'], ['3D', '기어', '조립']],
  ['21-shaft-detail.mcad', 'precise', ['축 제작 도면', 'Shaft production drawing'], ['단면, 키홈, 공차, 표면 거칠기, 주기', 'Sections, keyways, tolerances, surface finish and notes'], ['치수', '공차', '도면']],
  ['22-machine-vise.mcad', 'booleans', ['기계 바이스', 'Machine vise'], ['몸체·조·나사·핸들·공작물을 불리언으로', 'Body, jaws, screw, handle and workpiece made with booleans'], ['3D', '불리언', '조립']],
  ['23-steel-frame.mcad', 'solids', ['철골 골조', 'Steel frame'], ['H형강 기둥·보, 가새, 베이스 플레이트', 'H-section columns and beams, bracing and base plates'], ['3D', '구조', '철골']],
  ['24-two-storey-house.mcad', 'arch', ['2층 주택 (층·재료·철근)', 'Two-storey house (levels, materials, rebar)'], ['1층·2층, 다층 벽, L자 지붕(변별 경사), 철근, 트러스·골판 카포트, 배관 — IFC', 'Two levels, layered walls, an L roof with per-edge slopes, rebar, a truss carport, a pipe — IFC'], ['건축', 'BIM', '층', '재료', 'IFC']],
  ['25-crank-engine.mcad', 'solids', ['단기통 엔진 (움직임)', 'Single-cylinder engine (moving)'], ['크랭크·플라이휠·커넥팅 로드·피스톤 — 닫힌 고리를 풀며 회전, 3D 에서 ▶', 'Crank, flywheel, connecting rod and piston — a closed loop solved as it turns; press ▶ in 3D'], ['조립', '애니메이션', '크랭크']],
  ['26-four-bar.mcad', 'solids', ['4절 링크 (움직임)', 'Four-bar linkage (moving)'], ['크랭크–로커 4절 링크와 커플러 궤적 점', 'A crank–rocker four-bar linkage with a coupler tracer'], ['조립', '애니메이션', '링크']],
  ['27-gear-train.mcad', 'solids', ['기어열과 랙 (움직임)', 'Gear train and rack (moving)'], ['맞물린 기어 3개와 랙 — 기어 · 랙 연동 조인트', 'Three meshing gears and a rack — gear and rack couplings'], ['조립', '애니메이션', '기어']],
  ['28-screw-vise.mcad', 'solids', ['나사 바이스 (움직임)', 'Screw vise (moving)'], ['핸들이 나사를 돌리고 나사가 전진, 조가 따라옴 — 나사 연동', 'The handle turns the screw, the screw advances, the jaw follows — screw coupling'], ['조립', '애니메이션', '나사']],
  ['29-robot-arm.mcad', 'solids', ['로봇 팔 (움직임)', 'Robot arm (moving)'], ['회전대·어깨·팔꿈치·그리퍼 구동 4개가 함께 왕복', 'Turntable, shoulder, elbow and gripper — four drives together'], ['조립', '애니메이션', '로봇']],
  ['30-room-doors.mcad', 'arch', ['방의 문과 창 (움직임)', 'Room doors and window (moving)'], ['여닫이 문 · 미닫이 문 · 여닫이 창이 열고 닫힘', 'A swinging door, a sliding door and a casement window open and close'], ['건축', '애니메이션', '문']],
  ['16-imperial-plate.mcad', 'precise', ['인치 판', 'Imperial plate'], ['인치로 설계한 판 (길이 단위를 in로 바꿔 보세요)', 'A plate designed in inches (switch the length unit to in)'], ['인치', '단위']],
  ['04-bracket.dxf', 'files', ['브래킷 (DXF R12)', 'Bracket (DXF R12)'], ['MyCAD가 쓴 DXF', 'DXF written by MyCAD'], ['DXF']],
  ['dxf/ezdxf-entities-r2018.dxf', 'files', ['ezdxf DXF 2018', 'ezdxf DXF 2018'], ['다른 프로그램(ezdxf)이 쓴 DXF: 해칭·스플라인·치수·블록', 'DXF from another program (ezdxf): hatches, splines, dimensions, blocks'], ['DXF', 'ezdxf']],
  ['dxf/ezdxf-entities-r2000-binary.dxf', 'files', ['바이너리 DXF', 'Binary DXF'], ['바이너리 형식의 DXF 2000', 'DXF 2000 in the binary format'], ['DXF', '바이너리']],
  ['drawings/freecad-plate.igs', 'files', ['FreeCAD IGES 판', 'FreeCAD IGES plate'], ['FreeCAD가 쓴 IGES: 호·타원·B-스플라인', 'IGES written by FreeCAD: arcs, ellipse, B-spline'], ['IGES', 'FreeCAD']],
  ['drawings/inkscape-bracket.svg', 'files', ['SVG 브래킷', 'SVG bracket'], ['Inkscape 방식의 SVG: 레이어·변환·호·채우기·문자', 'Inkscape-style SVG: layers, transforms, arcs, fills, text'], ['SVG']],
  ['drawings/hpgl-plotter-demo.plt', 'files', ['HP-GL/2 플로터', 'HP-GL/2 plot'], ['펜별 레이어, 원·호·선 종류·문자', 'Pens as layers, circles, arcs, line types, labels'], ['HP-GL']],
  ['drawings/pcb-board-top.gtl', 'files', ['PCB 거버 (윗면 동박)', 'PCB Gerber (top copper)'], ['패드·배선·구리 영역', 'Pads, tracks and a copper pour'], ['Gerber', 'PCB']],
  ['drawings/pcb-board.drl', 'files', ['PCB 드릴 (Excellon)', 'PCB drill (Excellon)'], ['공구 지름별 구멍과 장공', 'Holes by tool diameter and a slot'], ['Excellon', 'PCB']],
  ['freecad/freecad-assembly.FCStd', 'files', ['FreeCAD 문서', 'FreeCAD document'], ['FreeCAD가 만든 조립품 (.FCStd)', 'An assembly made by FreeCAD (.FCStd)'], ['FCStd', '3D']],
  ['freecad/freecad-bracket.step', 'files', ['STEP 브래킷', 'STEP bracket'], ['FreeCAD가 쓴 STEP 솔리드', 'A STEP solid written by FreeCAD'], ['STEP', '3D']],
];

const files = [
  ['01-gear-pair', gearPair()], ['02-flange', flange()], ['03-shaft', shaft()], ['04-bracket', bracket()], ['05-bolt-and-nut', boltAndNut()],
  ['06-cover-plate', arraysPlate()], ['07-shaft-assembly', shaftAssembly()], ['08-parts-catalog', partsCatalog()],
  ['09-solids-showcase', solidsShowcase()], ['10-mounting-block', mountingBlock()], ['11-springs-pipes', springsAndPipes()], ['12-gearbox', gearbox3d()],
  ['13-drawing-views', drawingViewsSample()], ['14-sections', sectionSample()], ['15-annotations', annotations()], ['16-imperial-plate', imperialPlate()],
  ['17-house-plan', housePlan()], ['18-house-3d', house3d()], ['19-office-plan', officePlan()], ['20-gear-reducer', gearReducer()],
  ['21-shaft-detail', shaftDetail()], ['22-machine-vise', machineVise()], ['23-steel-frame', steelFrame()], ['24-two-storey-house', twoStoreyHouse()],
  ['25-crank-engine', crankEngine()], ['26-four-bar', fourBar()], ['27-gear-train', gearTrain()], ['28-screw-vise', screwVise()], ['29-robot-arm', robotArm()], ['30-room-doors', houseDoors()],
];
for (const [name, drawing] of files) fs.writeFileSync(path.join(out, `${name}.mcad`), serialize(drawing));
fs.writeFileSync(path.join(out, '04-bracket.dxf'), exportDxf(files[3][1]));

// The 3D samples in every 3D format FreeCAD reads.
const exportsDir = path.join(out, 'exports');
fs.mkdirSync(exportsDir, { recursive: true });
const FORMATS = ['fcstd', 'step', 'stl', 'obj', 'ply', 'off', 'amf', '3mf'];
const written = [];
for (const [name, drawing] of files) {
  const solids = drawing.entities.filter((entity) => entity.type === 'solid');
  if (!solids.length) continue;
  // Every format for the showcase; FreeCAD's main ones for the rest (keeps samples/ small).
  // BIM samples: IFC (the BIM exchange format) and FreeCAD's own; the plan shares the 3D house's model.
  const arch = { '17-house-plan': ['ifc'], '18-house-3d': ['ifc', 'fcstd', 'step'], '19-office-plan': ['ifc', 'fcstd', 'step'], '24-two-storey-house': ['ifc', 'fcstd', 'step'] }[name];
  for (const format of arch ?? (name === '09-solids-showcase' ? FORMATS : ['fcstd', 'step', 'stl', '3mf'])) {
    const file = `${name}.${format === 'fcstd' ? 'FCStd' : format}`;
    const bytes = format === 'stl' ? toBinaryStl(solids.flatMap((entity) => solidMesh(entity)), drawing.title) : exportMesh(format, drawing, drawing.entities);
    fs.writeFileSync(path.join(exportsDir, file), bytes);
    written.push(file);
  }
}
// The 2D samples in the open 2D formats MyCAD writes (read back by the tests, and by FreeCAD for IGES).
const written2d = [];
for (const [name, drawing] of files.filter(([n]) => ['01-gear-pair', '02-flange', '04-bracket'].includes(n))) {
  const date = new Date('2026-01-01T00:00:00Z');
  for (const [ext, text] of [['r2000.dxf', exportDxf2000(drawing)], ['svg', exportSvg(drawing)], ['igs', exportIges(drawing, { file: `${name}.igs`, date })], ['plt', exportHpgl(drawing)]]) {
    fs.writeFileSync(path.join(exportsDir, `${name}.${ext}`), text);
    written2d.push(`${name}.${ext}`);
  }
}
console.log(`samples/exports/: ${written2d.join(', ')}`);
fs.writeFileSync(path.join(out, 'index.json'), `${JSON.stringify(SAMPLE_INDEX.map(([file, task, [titleKo, title], [descriptionKo, description], tags]) => ({ file, task, title, titleKo, description, descriptionKo, tags })), null, 1)}\n`);
console.log(`samples/index.json: ${SAMPLE_INDEX.length} samples for the start page`);
console.log(`samples/: ${files.map(([name]) => `${name}.mcad`).join(', ')}, 04-bracket.dxf`);
console.log(`samples/exports/: ${written.length} files (${[...FORMATS, 'ifc'].join(', ')})`);
