// Builds doc/Tutorial.md (Korean), doc/Tutorial.en.md (English) and their
// HTML pages (doc/Tutorial.html, doc/Tutorial.en.html — Help › Tutorial
// document opens these) from the in-app lessons (src/tutorial/lessons.js) and
// the pictures taken by scripts/docs-shots.mjs. The document and the
// interactive tutorial therefore always have the same lessons, steps and
// coordinates.
//   node scripts/build-docs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_DIALOGS, LESSONS } from '../src/tutorial/lessons.js';
import { FILE_FORMATS } from '../src/domain/format.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docDir = path.join(root, 'doc');
const T = (ko, en) => ({ ko, en });

/** What each lesson is for, tips and common mistakes (the steps come from the lessons). */
const EXTRA = [
  { goal: T('화면 구성(메뉴·툴바·탭·도구 패널·캔버스·속성 패널·상태 표시줄)을 익히고, 시작 페이지에서 샘플을 열어 확대·이동·3D 보기를 해 봅니다.', 'Learn the layout (menus, toolbar, tabs, tool panel, canvas, properties, status bar), open a sample from the start page, zoom, pan and look at it in 3D.'),
    tips: [T('Home 키는 전체 보기, Ctrl+휠은 커서 위치를 중심으로 확대합니다.', 'Home zooms to fit; Ctrl + wheel zooms around the cursor.'), T('가운데 버튼을 누른 채 끌거나 스페이스를 누른 채 끌면 어떤 도구에서도 화면을 옮길 수 있습니다.', 'Drag with the middle button, or hold Space and drag, to pan with any tool.')],
    mistakes: [T('샘플을 고쳐 저장하면 새 이름을 묻습니다 — 샘플 원본은 바뀌지 않습니다.', 'Saving a changed sample asks for a new name — the sample itself never changes.')] },
  { goal: T('2D 그리기 도구 10가지(선·사각형·원·호·타원·정다각형·폴리선·스플라인·점)를 격자에 맞춰 써 봅니다.', 'Use the ten drawing tools (line, rectangle, circle, arc, ellipse, polygon, polyline, spline, point) on the grid.'),
    tips: [T('그리는 중에 오른쪽 클릭은 Enter와 같습니다(끝내기).', 'While drawing, a right click is the same as Enter (finish).'), T('폴리선·스플라인은 첫 점을 다시 클릭하면 닫힙니다.', 'Clicking the first point again closes a polyline or spline.'), T('도구 단축키: L 선, R 사각형, C 원, A 호 등 — 툴팁에 나옵니다.', 'Tool keys: L line, R rectangle, C circle, A arc… — shown in the tooltips.')],
    mistakes: [T('Esc를 한 번 누르면 그리던 것이 취소되고, 한 번 더 누르면 선택 도구로 돌아갑니다.', 'Esc once cancels what you are drawing; Esc again returns to the select tool.')] },
  { goal: T('좌표·상대 좌표·극좌표를 입력해 정확한 크기로 그리고, 객체 스냅·직교·길이 단위와 축척 막대를 다룹니다.', 'Draw to exact sizes with typed, relative and polar coordinates; use object snap, ortho, length units and the scale bar.'),
    tips: [T('좌표에도 단위를 붙일 수 있습니다: 2in,30mm.', 'Coordinates take units too: 2in,30mm.'), T('스냅 종류(끝점·중간점·중심·사분점·교차점·근처점)는 설정 › 스냅에서 고릅니다.', 'Snap kinds (end, mid, centre, quadrant, intersection, nearest) are chosen in Settings › Snaps.')],
    mistakes: [T('명령 칸에 입력한 뒤 Enter를 눌러야 점이 찍힙니다.', 'Press Enter after typing in the command box to place the point.')] },
  { goal: T('객체를 선택하고 이동·복사·회전·대칭·크기 조정·간격 띄우기·배열·분해·삭제를 하고, 실행 취소로 되돌립니다.', 'Select objects; move, copy, rotate, mirror, scale, offset, array, explode and delete them; undo.'),
    tips: [T('Shift(또는 Ctrl)+클릭은 선택에 더하거나 뺍니다.', 'Shift (or Ctrl) + click adds to or removes from the selection.'), T('선택한 객체의 손잡이(작은 사각형)를 끌면 모양을 바로 바꿉니다.', 'Drag the grips (small squares) of a selected object to reshape it.')],
    mistakes: [T('수정 도구는 먼저 선택해야 켜집니다.', 'Modify tools need a selection first.')] },
  { goal: T('선형·정렬·지름·반지름·각도 치수, 문자, 지시선, 해칭, 중심선, 거리 재기를 넣습니다.', 'Add linear, aligned, diameter, radius and angle dimensions, text, leaders, hatches, centre lines; measure.'),
    tips: [T('치수 문자는 속성 패널에서 바꿉니다. <> 는 잰 값을 뜻합니다: "<> H7".', 'Change dimension text in the properties; <> stands for the measured value: "<> H7".'), T('치수 소수 자리와 문자 높이는 설정 › 도면·글꼴에서 정합니다.', 'Dimension decimals and text height are in Settings › Drawing and Font.')],
    mistakes: [T('해칭은 닫힌 영역 안을 클릭해야 합니다 — 열린 선만 있으면 "닫힌 윤곽이 없습니다"라고 나옵니다.', 'Hatch needs a click inside a closed area — open lines give "No closed outline".')] },
  { goal: T('속성 패널에서 크기·위치·스타일을 정확히 고치고(계산식·단위 포함), 레이어로 도면을 정리합니다.', 'Edit sizes, positions and styles precisely in the properties (formulas and units), and organise with layers.'),
    tips: [T('− / + 버튼은 길이 단위에 맞는 간격(mm 1, in 0.125…)으로 바꿉니다.', 'The − / + buttons step by the length unit (1 mm, 0.125 in…).'), T('잠근 레이어의 객체는 선택되지 않습니다.', 'Objects on locked layers cannot be selected.')],
    mistakes: [T('여러 객체를 선택하면 공통 속성(레이어·색·선)만 나옵니다.', 'With several objects selected only the shared properties (layer, colour, line) show.')] },
  { goal: T('부품 라이브러리에서 기어·볼트 등 표준 부품을 넣고 치수를 바꿉니다.', 'Insert standard parts (gears, bolts…) from the library and change their sizes.'),
    tips: [T('부품을 분해하면 일반 선과 호가 되어 자유롭게 고칠 수 있습니다.', 'Exploding a part gives ordinary lines and arcs you can edit freely.')],
    mistakes: [T('부품 창에서 넣기를 누른 뒤 도면을 클릭해야 놓입니다.', 'After Insert in the part window, click in the drawing to place it.')] },
  { goal: T('FreeCAD Part 방식의 3D 솔리드를 넣고 3D 보기에서 돌려 보며 위치를 바꿉니다.', 'Insert FreeCAD-Part style solids, look at them in 3D and move them.'),
    tips: [T('3D 보기에서 솔리드를 클릭하면 선택되고 속성이 나옵니다.', 'Click a solid in the 3D view to select it and see its properties.'), T('솔리드 창의 미리보기는 음영 등각 투상입니다.', 'The solid window previews a shaded isometric view.')],
    mistakes: [T('2D에서는 솔리드가 바닥 윤곽으로만 보입니다 — 3D 보기로 확인하세요.', 'In 2D, solids show only as outlines — check them in 3D.')] },
  { goal: T('2D 윤곽에서 돌출·회전·로프트·스윕으로 3D 솔리드를 만듭니다.', 'Make solids from 2D outlines: pad, revolve, loft and sweep.'),
    tips: [T('돌출은 바깥 윤곽 안의 윤곽을 구멍으로 만듭니다.', 'Pad turns outlines inside the outer one into holes.'), T('로프트는 선택한 순서대로 아래·위가 됩니다.', 'Loft uses the outlines in the order you selected them: bottom, then top.')],
    mistakes: [T('회전 윤곽은 축을 가로지르면 안 됩니다.', 'A revolve profile must not cross the axis.')] },
  { goal: T('불리언(빼기·합치기·교차)으로 솔리드를 결합하고, 분해로 되돌립니다.', 'Combine solids with booleans (cut, fuse, common) and take them apart with explode.'),
    tips: [T('빼기는 처음 선택한 솔리드에서 나머지를 뺍니다.', 'Cut removes the others from the first selected solid.'), T('불리언 결과는 FreeCAD의 Part::Cut/MultiFuse로 저장됩니다.', 'Boolean results are saved as FreeCAD Part::Cut / MultiFuse.')],
    mistakes: [T('솔리드를 두 개 이상 선택해야 불리언이 켜집니다.', 'Booleans need two or more solids selected.')] },
  { goal: T('솔리드에서 3각법 투영 도면(숨은선 포함)과 등각 투상, 단면 윤곽을 만듭니다.', 'Make third-angle projected views (with hidden lines), an isometric view and section outlines from solids.'),
    tips: [T('숨은선은 숨은선 레이어에 들어갑니다 — 레이어로 숨길 수 있습니다.', 'Hidden lines go to the hidden-line layer — hide it with the layer.')],
    mistakes: [] },
  { goal: T('3D 보기의 시점·와이어프레임·좌표축과 광원(해)을 다룹니다.', 'Use the 3D view: views, wireframe, axes and the light (sun).'),
    tips: [T('Ctrl+Shift+G로 광원을 켜고 끕니다.', 'Ctrl+Shift+G switches the light.'), T('3D 바닥 격자도 2D처럼 확대해도 5×5 칸이 유지됩니다.', 'The 3D ground grid keeps 5 × 5 cells while zooming, like the 2D one.')],
    mistakes: [] },
  { goal: T('도면을 저장·열고, 다른 CAD 형식(DXF·SVG·IGES·HP-GL·Gerber·Excellon·FreeCAD·STEP)을 가져오고 내보냅니다.', 'Save and open drawings; import and export other CAD formats (DXF, SVG, IGES, HP-GL, Gerber, Excellon, FreeCAD, STEP).'),
    tips: [T('바이너리 DXF와 옛 ANSI(cp949 등) DXF도 열립니다.', 'Binary DXF and old ANSI (cp949…) DXF files open too.'), T('지원 형식 전체는 도움말 › 프로그램 정보 › 지원 파일 형식에 있습니다.', 'All formats are listed in Help › About › File formats.')],
    mistakes: [T('가져온 도면은 저장할 때 .mcad 이름을 묻습니다(원본 형식은 그대로).', 'Imported drawings ask for a .mcad name when saved (the original file stays as it is).')] },
  { goal: T('인쇄 미리보기로 용지에 맞춰 인쇄·PDF로 저장하고, STL로 3D 프린팅 파일을 만듭니다.', 'Print or save PDF from the print preview, and make STL files for 3D printing.'),
    tips: [T('흑백 인쇄를 켜면 색 선도 검게 나옵니다.', 'Black-and-white printing makes coloured lines black.')],
    mistakes: [] },
  { goal: T('설정 창의 각 탭과 테마·툴바·패널 모양을 바꿉니다.', 'Go through the settings tabs and change the theme, toolbar and panels.'),
    tips: [T('사용자 정의 테마는 모양 탭에서 색을 하나씩 고릅니다.', 'Make your own theme colour by colour in the Appearance tab.')],
    mistakes: [] },
  { goal: T('도움말: 기능표, 프로그램 정보(지원 형식), 튜토리얼과 이 문서.', 'Help: the feature list, About (file formats), the tutorial and this document.'),
    tips: [T('튜토리얼 동영상은 프로젝트 폴더의 MyCAD-Tutorial.mp4입니다.', 'The tutorial video is MyCAD-Tutorial.mp4 in the project folder.')],
    mistakes: [] },
  { goal: T('조인트로 이은 조립품을 움직여 보고, 재생 막대와 구동 값을 다룹니다.', 'Play an assembly joined with joints; use the play bar and drive values.'),
    tips: [T('기어 · 벨트 · 랙 · 나사는 연동 비율로 서로 따라 돕니다.', 'Gears, belts, racks and screws follow each other by a coupling ratio.')],
    mistakes: [T('조인트는 솔리드 두 개를 차례로 골라야 켜집니다(먼저 고른 것이 바탕).', 'A joint needs two solids picked in turn (the first is the base).')] },
  { goal: T('OpenCASCADE 커널로 곡면 그대로의 불리언 · 모깎기 · 구배를 만들고, 3D 에서 모서리를 골라 모깎기합니다.', 'Make booleans, fillets and drafts that keep curved faces with OpenCASCADE, and pick edges to fillet in 3D.'),
    tips: [T('커널이 준비되기 전에는 메시로 계산하고, 준비되면 정확한 형상으로 다시 계산합니다.', 'Until the kernel is ready shapes are meshed; then they are rebuilt exactly.')],
    mistakes: [] },
  { goal: T('솔리드를 3D 황삭 · 정삭하고 시뮬레이션으로 가공 결과를 확인합니다.', 'Rough and finish a solid in 3D and check the result in the simulation.'),
    tips: [T('"가공 결과 솔리드"로 깎인 소재를 도면에 넣어 비교할 수 있습니다.', '"Machined stock solid" puts the cut stock in the drawing for comparison.')],
    mistakes: [] },
  { goal: T('판의 평면 응력과 솔리드의 3D 응력을 FEM 으로 풉니다.', 'Solve plane stress in plates and 3D stress in solids with FEM.'),
    tips: [T('.inp 로 저장하면 CalculiX · FreeCAD FEM 에서 같은 모델을 엽니다.', 'Saving .inp opens the same model in CalculiX and FreeCAD FEM.')],
    mistakes: [] },
  { goal: T('FreeCAD 매크로와 같은 Python 으로 모델을 만들고 애드온 관리자로 매크로를 설치합니다.', 'Model with Python as in FreeCAD macros and install macros with the addon manager.'),
    tips: [T('Python 매크로는 도구 › 매크로 디버거로 한 줄씩 실행해 볼 수 있습니다.', 'Python macros can be stepped line by line with Tools › Macro debugger.')],
    mistakes: [] },
  { goal: T('자르기 · 연장 · 모깎기 · 모따기로 2D 도형을 다듬습니다.', 'Tidy 2D drawings with trim, extend, fillet and chamfer.'),
    tips: [T('모깎기 반지름 · 모따기 거리는 도구를 고른 뒤 명령 칸에 입력합니다.', 'Type the fillet radius or chamfer distance into the command box after picking the tool.')],
    mistakes: [T('모깎기는 남길 쪽을 눌러야 합니다 — 반대쪽을 누르면 그쪽이 남습니다.', 'Click the sides to keep when filleting — the clicked sides are the ones kept.')] },
  { goal: T('보조선과 기하 · 치수 구속으로 스케치를 정확하게 맞춥니다(FreeCAD Sketcher).', 'Fit sketches exactly with construction geometry and geometric and dimensional constraints (FreeCAD Sketcher).'),
    tips: [T('구속 값은 속성 패널의 구속 조건 목록에서 고치거나 지웁니다.', 'Change or delete constraint values in the constraint list of the properties.')],
    mistakes: [T('충돌 · 중복 구속이 나오면 마지막에 건 구속을 지우세요.', 'On conflicting or redundant constraints, delete the last one you added.')] },
  { goal: T('클론 · 작업 평면 · 문제 패널 · 눈금자를 씁니다.', 'Use clones, the working plane, the problems panel and the rulers.'),
    tips: [T('작업 평면의 높이 Z 는 새 솔리드와 돌출이 놓일 높이입니다.', 'The working plane\'s height Z is where new solids and pads are placed.')],
    mistakes: [] },
  { goal: T('제작 도면에 풍선 · 데이텀 · 기하 공차를 넣고 TechDraw 명령을 살펴봅니다.', 'Add balloons, datums and feature control frames to production drawings and look at the TechDraw commands.'),
    tips: [T('지시선의 속성 "종류"로 메모 · 풍선 · 기하 공차 · 데이텀을 서로 바꿉니다.', 'A leader\'s "kind" property switches it between note, balloon, GD&T frame and datum.')],
    mistakes: [] },
  { goal: T('PartDesign 처럼 포켓 · 구멍과 3D 모따기 · 두께 · 오프셋으로 솔리드를 가공합니다.', 'Shape solids PartDesign-style with pockets, holes, 3D chamfers, thickness and offsets.'),
    tips: [T('결과는 트리라서 분해하면 원래 솔리드로 돌아갑니다.', 'Results are trees: explode gives the original solids back.')],
    mistakes: [T('포켓 · 구멍은 2D 윤곽과 솔리드를 함께 골라야 켜집니다.', 'Pocket and hole need a 2D outline and a solid selected together.')] },
  { goal: T('형상 검사로 솔리드의 문제를 찾고, 메시를 단순화 · 수리하며, 메시 · 역설계 명령을 살펴봅니다.', 'Find problems with check geometry, decimate and repair meshes, and look at the mesh and reverse-engineering commands.'),
    tips: [T('BIM 객체는 블록마다 따로 검사합니다.', 'BIM objects are checked block by block.')],
    mistakes: [] },
  { goal: T('벽 · 창 · 문 · 슬래브 · 지붕 · 실로 건물을 만들고 3D 로 봅니다(FreeCAD BIM).', 'Build with walls, windows, doors, slabs, roofs and spaces and look at it in 3D (FreeCAD BIM).'),
    tips: [T('축척 1:100 도면에서는 점선 · 선 굵기가 종이 기준으로 커집니다(도면 › 축척).', 'At 1:100 dashes and line widths scale to the paper (Drawing › Scale).')],
    mistakes: [T('창 · 문은 벽 하나를 골라야 넣을 수 있습니다.', 'Windows and doors need one wall selected.')] },
  { goal: T('기둥 · 계단 · 가구 · 통심선 · 층 · 철근 · 물량표 · IFC 로 BIM 모델을 완성합니다.', 'Finish the BIM model with columns, stairs, furniture, grids, levels, rebar, schedules and IFC.'),
    tips: [T('층 표고를 바꾸면 그 층의 객체가 함께 움직입니다.', 'Changing a level\'s elevation moves its objects with it.')],
    mistakes: [] },
  { goal: T('2D 윤곽에서 윤곽 · 포켓 · 드릴 · 각인 경로를 만들고 G 코드로 저장합니다.', 'Make profile, pocket, drilling and engraving paths from 2D outlines and save G-code.'),
    tips: [T('구멍은 늘 안쪽에서, 섬은 남기고 깎습니다.', 'Holes are always cut from inside, and islands are kept.')],
    mistakes: [] },
  { goal: T('선으로 그린 골조를 FEM 으로 풀어 변형 · 휨 모멘트 · 응력을 봅니다.', 'Solve a frame drawn with lines and see its deformation, bending moments and stress.'),
    tips: [T('"설정 저장"은 지지 · 하중만 도면에 남깁니다.', '"Save settings" keeps only the supports and loads in the drawing.')],
    mistakes: [T('지지가 하나도 없으면 풀 수 없습니다.', 'Without any support the frame cannot be solved.')] },
  { goal: T('스프레드시트로 치수를 묶고, 스크립트 콘솔과 매크로 기록으로 반복 작업을 자동화합니다.', 'Drive sizes from a spreadsheet and automate with the script console and macro recording.'),
    tips: [T('콘솔 기록은 Ctrl+↑ / Ctrl+↓ 로 불러옵니다.', 'Ctrl+↑ / Ctrl+↓ recall the console history.')],
    mistakes: [] },
  { goal: T('로봇 팔을 점과 경로로 움직이고, 보기 · 편집 · 도구 메뉴와 모델 트리를 살펴봅니다.', 'Move a robot arm to points and along paths, and look at the View, Edit and Tools menus and the model tree.'),
    tips: [T('로봇 경로는 KRL 프로그램으로 저장됩니다.', 'Robot trajectories are saved as KRL programs.')],
    mistakes: [] },
];

const SHORTCUTS = [
  ['Ctrl+N', T('새 도면', 'New drawing')], ['Ctrl+O', T('열기', 'Open')], ['Ctrl+S / Ctrl+Shift+S', T('저장 / 다른 이름으로', 'Save / Save as')], ['Ctrl+P', T('인쇄', 'Print')],
  ['Ctrl+Z / Ctrl+Y', T('실행 취소 / 다시 실행', 'Undo / Redo')], ['Ctrl+X / C / V', T('잘라내기 / 복사 / 붙여넣기', 'Cut / Copy / Paste')], ['Ctrl+D', T('복제', 'Duplicate')], ['Delete', T('삭제', 'Delete')],
  ['Ctrl+Shift+E', T('분해', 'Explode')], ['Ctrl+R', T('눈금자', 'Rulers')], ['Ctrl+Shift+B', T('축척 막대', 'Scale bar')], ['Ctrl+Shift+3', T('3D 보기', '3D view')],
  ['Ctrl+Shift+G', T('광원 켜기/끄기', 'Light on/off')], ['Ctrl+I', T('3D 모델 가져오기', 'Import a 3D model')], ['Ctrl+Shift+P', T('3D 프린팅 (STL)', '3D printing (STL)')], ['Ctrl+,', T('설정', 'Settings')],
  ['Ctrl+1 / Ctrl+2', T('도구 패널 / 속성 패널', 'Tool panel / properties panel')], ['Ctrl+Tab', T('다음 탭', 'Next tab')], ['Home', T('전체 보기', 'Zoom to fit')], ['F1', T('프로그램 정보', 'About')],
  ['F3 / F7 / F8 / F9', T('객체 스냅 / 격자 / 직교 / 격자 스냅', 'Object snap / grid / ortho / grid snap')], ['Esc', T('그리기 취소 · 선택 도구로', 'Cancel · back to select')], ['Enter', T('그리기 끝내기', 'Finish drawing')],
  ['L R C A', T('선 · 사각형 · 원 · 호 (그 밖의 도구 키는 툴팁)', 'Line · rectangle · circle · arc (other keys in the tooltips)')],
];

const UI = {
  ko: {
    title: 'MyCAD 1.0 튜토리얼', intro: (lessons, steps) => `레슨 ${lessons}개, 단계 ${steps}개. 앱의 **도움말 › 따라 하는 튜토리얼**(시작 페이지의 첫 카드)과 같은 순서·같은 좌표입니다. 앱에서는 **보기**(자동으로 보여 줌)와 **직접 하기**(해 보면 다음으로 넘어감)를 고를 수 있고, 같은 내용의 동영상이 프로젝트 폴더의 \`MyCAD-Tutorial.mp4\`에 있습니다.`,
    toc: '목차', lesson: '레슨', steps: '단계', inApp: '앱에서', open: '도움말 › 따라 하는 튜토리얼 › 레슨 {n}',
    howToRead: '이 문서를 읽는 법', conventions: ['**굵은 글씨**는 화면에 보이는 이름(버튼·메뉴·탭)입니다.', '`L`, `Ctrl+Z` 처럼 코드 글꼴은 누르는 키나 입력하는 글자입니다.', '좌표는 mm, (x, y) 입니다. 튜토리얼은 5 mm 격자 스냅을 켜고 시작합니다.', '각 단계의 그림은 그 단계를 마친 화면입니다(앱이 실제로 실행해서 찍었습니다).'],
    lesson0: '레슨 0. 설치와 시작 페이지', install: ['**Windows**: `MyCAD_1.0.0_x64-setup.exe`(또는 `.msi`)를 실행합니다. **macOS**: `.dmg`, **Linux**: `.deb`·`.AppImage`. 웹 버전은 `dist/`를 웹 서버에 올리면 됩니다.', '처음 실행하면 **시작 페이지**가 열립니다. 탭 줄 맨 왼쪽의 **집 탭**으로 언제든 돌아옵니다(**보기 › 시작 페이지**). 설정 › 일반에서 시작할 때 보일지 고릅니다.', '시작 페이지의 **할 수 있는 일** 카드마다 그 일을 배우는 **레슨**과 **샘플**이 있습니다. 아래 **샘플**은 모두 클릭 한 번에 새 탭으로 열립니다(저장하면 새 이름을 묻습니다).'],
    tutorialUi: '튜토리얼 화면', tutorialText: ['튜토리얼 패널은 끌어서 옮길 수 있습니다. 위쪽 목록에서 레슨을 고르고, **보기**는 재생·일시 정지·이전·다음과 속도(0.5×–4×)를, **직접 하기**는 **보여 주기**·**건너뛰기**를 씁니다.', '중간 레슨부터 시작하면 앞 레슨의 결과를 자동으로 준비합니다.'],
    goal: '목표', follow: '따라 하기', practice: '직접 해 보기', tips: '팁', mistakes: '자주 하는 실수', check: '확인', dialog: '창',
    appendix: '부록', shortcuts: 'A. 단축키', key: '키', action: '기능', formats: 'B. 지원 파일 형식', format: '형식', ext: '확장자', read: '읽기', write: '쓰기', index: 'C. 기능 찾아보기', feature: '기능', where: '레슨',
  },
  en: {
    title: 'MyCAD 1.0 Tutorial', intro: (lessons, steps) => `${lessons} lessons, ${steps} steps — the same order and coordinates as **Help › Interactive tutorial** in the app (the first card of the start page). In the app you can **Watch** (it shows you) or **Practice** (it moves on when you have done the step). A video of the same lessons is \`MyCAD-Tutorial.mp4\` in the project folder.`,
    toc: 'Contents', lesson: 'Lesson', steps: 'Steps', inApp: 'In the app', open: 'Help › Interactive tutorial › lesson {n}',
    howToRead: 'How to read this document', conventions: ['**Bold** is a name on the screen (button, menu, tab).', 'Code font like `L` or `Ctrl+Z` is a key to press or text to type.', 'Coordinates are (x, y) in mm. The tutorial starts with 5 mm grid snap on.', 'The picture of a step shows the screen after the step (taken by the app running it).'],
    lesson0: 'Lesson 0. Installing and the start page', install: ['**Windows**: run `MyCAD_1.0.0_x64-setup.exe` (or the `.msi`). **macOS**: `.dmg`; **Linux**: `.deb` or `.AppImage`. The web version is `dist/` on any web server.', 'The **start page** opens at first start. The **house tab** at the left of the tab row brings it back any time (**View › Start page**); Settings › General decides whether it shows at start-up.', 'Each **task** card on the start page has the **lesson** that teaches it and a **sample**. Every **sample** below opens in a new tab with one click (saving asks for a new name).'],
    tutorialUi: 'The tutorial panel', tutorialText: ['Drag the tutorial panel anywhere. Pick a lesson at the top; **Watch** has play/pause, previous/next and a speed (0.5×–4×), **Practice** has **Show me** and **Skip**.', 'Starting in the middle prepares the result of the earlier lessons automatically.'],
    goal: 'Goal', follow: 'Steps', practice: 'Your turn', tips: 'Tips', mistakes: 'Common mistakes', check: 'Check', dialog: 'window',
    appendix: 'Appendix', shortcuts: 'A. Keyboard shortcuts', key: 'Key', action: 'Action', formats: 'B. File formats', format: 'Format', ext: 'Extensions', read: 'Read', write: 'Write', index: 'C. Feature index', feature: 'Feature', where: 'Lesson',
  },
};

/** Heading anchors the way GitHub makes them (punctuation dropped, spaces → "-"), so the links work there too. */
const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');

function markdown(language) {
  const u = UI[language];
  const L = (o) => o?.[language] ?? o?.en ?? '';
  const manifestFile = path.join(docDir, 'images', language, 'shots.json');
  const shots = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const picture = (name) => (shots[name] ? `![${shots[name].caption}](${shots[name].file})\n\n*${shots[name].caption}*\n` : '');
  const steps = LESSONS.reduce((n, lesson) => n + lesson.steps.length, 0);
  const out = [];
  out.push(`# ${u.title}`, '', `> ${u.intro(LESSONS.length, steps)}`, '');
  out.push(`## ${u.toc}`, '', `| ${u.lesson} | | ${u.steps} | ${u.inApp} |`, '|---:|---|---:|---|');
  out.push(`| 0 | [${u.lesson0.replace(/^[^.]+\.\s*/, '')}](#${slug(u.lesson0)}) | | |`);
  LESSONS.forEach((lesson, i) => {
    const heading = `${u.lesson} ${i + 1}. ${L(lesson.title)}`;
    out.push(`| ${i + 1} | [${L(lesson.title)}](#${slug(heading)}) | ${lesson.steps.length} | ${u.open.replace('{n}', i + 1)} |`);
  });
  out.push(`| | [${u.appendix} ${u.shortcuts}](#${slug(`${u.appendix} ${u.shortcuts}`)}) · [${u.formats}](#${slug(`${u.appendix} ${u.formats}`)}) · [${u.index}](#${slug(`${u.appendix} ${u.index}`)}) | | |`, '');
  out.push(`### ${u.howToRead}`, '', ...u.conventions.map((c) => `- ${c}`), '', '---', '');
  out.push(`## ${u.lesson0}`, '', ...u.install.map((line, i) => `${i + 1}. ${line}`), '', picture('start-page'));
  out.push(`### ${u.tutorialUi}`, '', ...u.tutorialText.map((line) => `- ${line}`), '', picture('tutorial-watch'), picture('tutorial-practice'), '---', '');
  LESSONS.forEach((lesson, i) => {
    const extra = EXTRA[i] ?? {};
    out.push(`## ${u.lesson} ${i + 1}. ${L(lesson.title)}`, '');
    out.push(`### ${u.goal}`, '', L(extra.goal), '');
    out.push(`### ${u.follow}`, '');
    lesson.steps.forEach((step, s) => {
      out.push(`${s + 1}. **${L(step.title)}** — ${L(step.text)}`, '');
      const shot = picture(`l${i + 1}-s${s + 1}`);
      if (shot) out.push(shot.split('\n').map((line) => (line ? `   ${line}` : line)).join('\n'));
      if (DOC_DIALOGS[`${i + 1}-${s + 1}`]) {
        const dialog = picture(`l${i + 1}-s${s + 1}-dialog`);
        if (dialog) out.push(dialog.split('\n').map((line) => (line ? `   ${line}` : line)).join('\n'));
      }
    });
    const todos = lesson.steps.filter((step) => step.practice?.check).map((step) => `- ${L(step.practice.todo)}`);
    if (todos.length) out.push(`### ${u.practice}`, '', ...todos, '');
    if (extra.tips?.length) out.push(`### ${u.tips}`, '', ...extra.tips.map((tip) => `- ${L(tip)}`), '');
    if (extra.mistakes?.length) out.push(`### ${u.mistakes}`, '', ...extra.mistakes.map((m) => `- ${L(m)}`), '');
    out.push(`### ${u.check}`, '', ...lesson.steps.map((step) => `- [ ] ${L(step.title)}`), '', '---', '');
  });
  out.push(`## ${u.appendix} ${u.shortcuts}`, '', `| ${u.key} | ${u.action} |`, '|---|---|', ...SHORTCUTS.map(([key, action]) => `| \`${key}\` | ${L(action)} |`), '');
  out.push(`## ${u.appendix} ${u.formats}`, '', `| ${u.format} | ${u.ext} | ${u.read} | ${u.write} |`, '|---|---|:---:|:---:|',
    ...FILE_FORMATS.map((f) => `| ${f.name} | ${f.extensions.map((e) => `\`.${e}\``).join(' ')} | ${f.read ? '✓' : ''} | ${f.write ? '✓' : ''} |`), '');
  out.push(`## ${u.appendix} ${u.index}`, '', `| ${u.feature} | ${u.where} |`, '|---|---|');
  LESSONS.forEach((lesson, i) => lesson.steps.forEach((step) => out.push(`| ${L(step.title)} | [${u.lesson} ${i + 1}](#${slug(`${u.lesson} ${i + 1}. ${L(lesson.title)}`)}) |`)));
  out.push('');
  return out.join('\n');
}

// ───────────────────────── a small Markdown → HTML (the subset used above)

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function inline(text) {
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}
function html(md, language) {
  const lines = md.split('\n');
  const out = [];
  const toc = [];
  let list = null;
  let table = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeTable = () => { if (table) { out.push('</tbody></table>'); table = null; } };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/^ {3}/, '');
    if (/^\|/.test(raw)) {
      const cells = raw.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!table) { closeList(); table = true; out.push(`<table><thead><tr>${cells.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>`); i++; continue; }
      out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
      continue;
    }
    closeTable();
    let m;
    if ((m = /^(#{1,3}) (.*)$/.exec(raw))) {
      closeList();
      const level = m[1].length;
      const id = slug(m[2]);
      if (level === 2) toc.push(`<a href="#${id}">${inline(m[2])}</a>`);
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
    } else if (/^---$/.test(raw)) { closeList(); out.push('<hr />'); }
    else if ((m = /^> (.*)$/.exec(raw))) { closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if ((m = /^(\d+)\. (.*)$/.exec(raw))) { if (list !== 'ol') { closeList(); list = 'ol'; out.push('<ol>'); } out.push(`<li value="${m[1]}">${inline(m[2])}`); }
    else if ((m = /^- \[ \] (.*)$/.exec(raw))) { if (list !== 'ul') { closeList(); list = 'ul'; out.push('<ul class="check">'); } out.push(`<li><label><input type="checkbox" /> ${inline(m[1])}</label></li>`); }
    else if ((m = /^- (.*)$/.exec(raw))) { if (list !== 'ul') { closeList(); list = 'ul'; out.push('<ul>'); } out.push(`<li>${inline(m[1])}</li>`); }
    else if (/^\s*$/.test(raw)) { /* paragraph break */ }
    else if (/^!\[/.test(line)) out.push(`<figure>${inline(line)}</figure>`);
    else if ((m = /^\*(.*)\*$/.exec(line))) out.push(`<figcaption>${inline(m[1])}</figcaption>`);
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  closeTable();
  const title = /^# (.*)$/m.exec(md)?.[1] ?? 'MyCAD';
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title>
<style>
:root { --text: #1d2433; --muted: #5c667a; --accent: #3a6cf0; --bg: #ffffff; --panel: #f4f6fb; --border: #dde2ec; }
@media (prefers-color-scheme: dark) { :root { --text: #e3e8f2; --muted: #9aa6bd; --accent: #7aa2ff; --bg: #171b23; --panel: #1f2530; --border: #323a48; } }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.65 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; color: var(--text); background: var(--bg); }
nav { position: fixed; top: 0; bottom: 0; left: 0; width: 280px; overflow: auto; padding: 18px 14px; border-right: 1px solid var(--border); background: var(--panel); font-size: 13.5px; }
nav a { display: block; padding: 4px 8px; border-radius: 6px; color: var(--text); text-decoration: none; }
nav a:hover { background: var(--border); }
nav b { display: block; margin: 0 8px 10px; font-size: 15px; }
main { max-width: 980px; margin: 0 0 0 280px; padding: 24px 40px 80px; }
h1 { font-size: 2em; margin-top: 0; } h2 { margin-top: 2.2em; padding-bottom: 6px; border-bottom: 2px solid var(--accent); } h3 { margin-top: 1.6em; color: var(--accent); }
img { max-width: 100%; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08); cursor: zoom-in; }
figure { margin: 10px 0 2px; } figcaption { color: var(--muted); font-size: 0.88em; margin-bottom: 14px; }
code { padding: 1px 5px; border-radius: 5px; background: var(--panel); border: 1px solid var(--border); font-size: 0.92em; }
blockquote { margin: 0; padding: 10px 16px; border-left: 4px solid var(--accent); background: var(--panel); border-radius: 0 8px 8px 0; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 0.94em; } th, td { padding: 6px 10px; border: 1px solid var(--border); text-align: left; } th { background: var(--panel); }
ul.check { list-style: none; padding-left: 4px; } a { color: var(--accent); }
.zoom { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: rgba(0, 0, 0, 0.75); cursor: zoom-out; } .zoom img { max-width: 96vw; max-height: 94vh; }
@media (max-width: 900px) { nav { display: none; } main { margin: 0; padding: 16px; } }
@media print { nav { display: none; } main { margin: 0; } img { break-inside: avoid; } }
</style></head>
<body><nav><b>${escapeHtml(title)}</b>${toc.join('')}</nav><main>${out.join('\n')}</main>
<script>document.addEventListener('click', (e) => { const img = e.target.closest('main img'); const zoom = document.querySelector('.zoom'); if (zoom) { zoom.remove(); return; } if (img) { const z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = '<img src="' + img.src + '" alt="" />'; document.body.append(z); } });</script>
</body></html>
`;
}

fs.mkdirSync(docDir, { recursive: true });
for (const [language, base] of [['ko', 'Tutorial'], ['en', 'Tutorial.en']]) {
  const md = markdown(language);
  fs.writeFileSync(path.join(docDir, `${base}.md`), md);
  fs.writeFileSync(path.join(docDir, `${base}.html`), html(md, language));
  console.log(`doc/${base}.md, doc/${base}.html`);
}
