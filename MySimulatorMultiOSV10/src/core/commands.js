// Every command the app offers: its icon, its name in both languages and a
// tooltip. Menus, the toolbar, the tool panel and the context menu all list
// command ids from here, so a command reads the same wherever it appears.
// "add:<node type>" adds a node of that type (names come from the catalogue).
import { NODES, CATEGORIES, nodeSpec, nodesIn } from './catalog.js';

/** id → [icon, ko, en, tip ko, tip en] */
const C = {
  // File
  new: ['✚', '새 파이프라인', 'New pipeline', '빈 파이프라인을 새 탭에 만듭니다', 'Create an empty pipeline in a new tab'],
  newFromSample: ['🗂', '예제에서 새로 만들기…', 'New from sample…', '예제 파이프라인 갤러리에서 고릅니다', 'Pick a pipeline from the sample gallery'],
  open: ['📂', '열기…', 'Open…', '.mysim 파이프라인 또는 CSV/JSON 데이터를 엽니다', 'Open a .mysim pipeline or CSV/JSON data'],
  importData: ['📥', '데이터 가져오기 (CSV/JSON)…', 'Import data (CSV/JSON)…', '파일을 데이터 표 노드로 가져옵니다', 'Import a file as a data table node'],
  save: ['💾', '저장', 'Save', '파이프라인을 저장합니다', 'Save the pipeline'],
  saveAs: ['📝', '다른 이름으로 저장…', 'Save as…', '파이프라인을 새 파일로 저장합니다', 'Save the pipeline to a new file'],
  exportCsv: ['⊞', '결과 CSV 내보내기…', 'Export results (CSV)…', '선택한 노드의 결과 표를 CSV 로 저장합니다', 'Save the selected node\'s result table as CSV'],
  exportJson: ['{}', '결과 JSON 내보내기…', 'Export results (JSON)…', '선택한 노드의 결과 전체를 JSON 으로 저장합니다', 'Save all of the selected node\'s results as JSON'],
  exportAllCsv: ['🗃', '모든 결과 CSV 내보내기…', 'Export all results (CSV)…', '모든 노드의 결과 표를 한 폴더에 저장합니다 (데스크톱) 또는 하나씩 내려받습니다', 'Save every node\'s result tables into one folder (desktop) or download them one by one'],
  exportPng: ['🖼', '그림 내보내기 (PNG)…', 'Export image (PNG)…', '그래프·대시보드·차트를 PNG 로 저장합니다', 'Save the graph, dashboard or chart as PNG'],
  exportReport: ['📄', '보고서…', 'Report…', '파이프라인과 결과(차트·값·표)를 담은 보고서를 봅니다 (HTML 저장)', 'Show the report of the pipeline and its results (charts, values, tables); save as HTML'],
  print: ['🖨️', '인쇄…', 'Print…', '현재 보기와 보고서를 인쇄합니다', 'Print the current view and the report'],
  closeTab: ['✕', '탭 닫기', 'Close tab', '현재 파이프라인 탭을 닫습니다', 'Close the current pipeline tab'],
  quit: ['⏻', '끝내기', 'Quit', '프로그램을 끝냅니다', 'Quit the program'],
  // Edit
  undo: ['↩', '실행 취소', 'Undo', '마지막 변경을 되돌립니다', 'Undo the last change'],
  redo: ['↪', '다시 실행', 'Redo', '되돌린 변경을 다시 적용합니다', 'Redo the undone change'],
  copy: ['⧉', '복사', 'Copy', '선택한 노드를 복사합니다', 'Copy the selected nodes'],
  paste: ['📋', '붙여넣기', 'Paste', '복사한 노드를 붙여넣습니다 (사이 연결 포함)', 'Paste the copied nodes (with the links between them)'],
  duplicate: ['↦', '복제', 'Duplicate', '선택한 노드를 옆에 복제합니다', 'Duplicate the selected nodes'],
  delete: ['🗑', '삭제', 'Delete', '선택한 노드나 연결을 삭제합니다', 'Delete the selected nodes or link'],
  selectAll: ['⬚', '모두 선택', 'Select all', '모든 노드를 선택합니다', 'Select every node'],
  toggleDisable: ['⊘', '사용 안 함 / 사용', 'Disable / enable', '선택한 노드를 건너뜁니다 (입력을 그대로 전달)', 'Bypass the selected nodes (their input passes through)'],
  rename: ['✎', '이름 바꾸기', 'Rename', '선택한 노드의 이름을 바꿉니다', 'Rename the selected node'],
  autoLayout: ['⇶', '자동 정렬', 'Auto arrange', '연결 순서에 따라 노드를 열로 정렬합니다', 'Arrange the nodes in columns by their order in the pipeline'],
  pipelineSettings: ['⚙', '파이프라인 설정…', 'Pipeline settings…', '이름, 설명, 난수 시드', 'Name, description, random seed'],
  // View
  fit: ['⤢', '전체 보기', 'Fit all', '모든 노드가 보이게 맞춥니다', 'Fit every node in view'],
  zoomReset: ['◎', '100% 보기', 'Actual size', '확대 배율을 100% 로', 'Zoom to 100 %'],
  zoomIn: ['＋', '확대', 'Zoom in', '확대합니다', 'Zoom in'],
  zoomOut: ['－', '축소', 'Zoom out', '축소합니다', 'Zoom out'],
  viewGraph: ['⛓', '파이프라인', 'Pipeline', '노드 그래프 편집 화면', 'The node graph editor'],
  viewDashboard: ['▦', '대시보드', 'Dashboard', '차트·KPI 노드를 한 화면에 모아 봅니다', 'The chart and KPI nodes on one screen'],
  viewData: ['☷', '데이터', 'Data', '선택한 노드의 결과를 크게 봅니다 (차트·표·값)', 'The selected node\'s results in full (chart, table, values)'],
  view3d: ['◇', '3D 궤적', '3D trajectory', '세 열을 3D 곡선이나 점으로 봅니다 (로렌츠 끌개 등)', 'Three columns as a 3D curve or points (Lorenz attractor …)'],
  showGrid: ['#', '격자', 'Grid', '편집 화면의 격자를 보입니다', 'Show the canvas grid'],
  snap: ['⌗', '격자에 맞추기', 'Snap to grid', '노드를 격자에 맞춰 놓습니다', 'Place nodes on the grid'],
  showRulers: ['📏', '눈금자', 'Rulers', '편집 화면 위·왼쪽에 눈금자를 보입니다 (켜기/끄기)', 'Show rulers along the top and left of the canvas (on/off)'],
  grid3d: ['▦', '3D 격자', '3D grid', '3D 보기 바닥·벽의 5×5 격자 (켜기/끄기)', '5 × 5 grids on the floor and walls of the 3D view (on/off)'],
  axes3d: ['↗', '3D 축·눈금', '3D axes and ticks', '3D 보기의 x·y·z 축과 눈금 값 (켜기/끄기)', 'x, y, z axes and tick values in the 3D view (on/off)'],
  chartGrid: ['⊞', '차트 격자선', 'Chart grid lines', '차트의 격자선을 보입니다 (켜기/끄기)', 'Show grid lines in the charts (on/off)'],
  showPreviews: ['〰', '노드 미리보기', 'Node previews', '노드 안에 결과의 작은 그래프를 그립니다', 'Draw a small chart of the result inside each node'],
  toolPanel: ['◧', '도구 패널', 'Tool panel', '왼쪽 패널 보이기/숨기기', 'Show or hide the left panel'],
  propertyPanel: ['◨', '속성 패널', 'Property panel', '오른쪽 패널 보이기/숨기기', 'Show or hide the right panel'],
  chartPanel: ['▭', '결과 패널', 'Result panel', '아래 결과 패널 보이기/숨기기', 'Show or hide the bottom result panel'],
  fullscreen: ['⛶', '전체 화면', 'Full screen', '전체 화면으로 전환합니다', 'Toggle full screen'],
  // Node / run
  nodeLibrary: ['📚', '노드 라이브러리…', 'Node library…', '모든 노드와 설명을 보고 추가합니다', 'Browse every node with its help and add it'],
  run: ['▶', '실행', 'Run', '파이프라인 전체를 실행합니다', 'Run the whole pipeline'],
  runSelected: ['⏵', '선택까지 실행', 'Run to selection', '선택한 노드와 그 입력만 실행합니다', 'Run the selected nodes and their inputs only'],
  stop: ['■', '중지', 'Stop', '실행을 중지합니다', 'Stop the run'],
  validate: ['✔', '검사', 'Check', '실행 전에 파이프라인을 검사합니다', 'Check the pipeline before running'],
  autoRun: ['⟲', '자동 실행', 'Auto run', '바꿀 때마다 다시 실행합니다', 'Run again after every change'],
  clearResults: ['⌫', '결과 지우기', 'Clear results', '모든 결과를 지웁니다', 'Clear every result'],
  // Tools / help
  expressionHelp: ['ƒ', '수식 도움말', 'Expression help', '수식 문법, 함수, 분포 목록', 'Expression syntax, functions and distributions'],
  pythonInfo: ['🐍', 'Python 연동…', 'Python integration…', '사용할 Python 과 스크립트 규칙을 봅니다', 'Which Python is used and how scripts exchange data'],
  batchHelp: ['⌨', '배치 실행 (CLI)…', 'Batch run (CLI)…', '명령줄로 파이프라인을 자동 실행하는 방법', 'How to run pipelines from the command line'],
  settings: ['⚙', '환경 설정…', 'Settings…', '언어·테마·글꼴·편집·패널', 'Language, theme, font, editor and panels'],
  home: ['🏠', '시작 화면', 'Start page', '시작 화면을 엽니다 (새로 만들기 · 최근 파일 · 예제 · 튜토리얼)', 'Open the start page (new, recent files, samples, tutorial)'],
  tutorial: ['🎓', '튜토리얼', 'Tutorial', '실제 화면을 따라가며 기능을 하나씩 배웁니다', 'Learn the features one by one on the real screen'],
  tutorialDoc: ['📘', '튜토리얼 문서', 'Tutorial document', '튜토리얼 문서를 엽니다', 'Open the tutorial document'],
  usage: ['📖', '사용 설명서', 'User\'s guide', '사용 설명서를 엽니다', 'Open the user\'s guide'],
  shortcuts: ['⌨', '단축키', 'Keyboard shortcuts', '단축키 목록', 'List of keyboard shortcuts'],
  about: ['ℹ️', '정보', 'About', '프로그램 정보', 'About the program'],
  language: ['⚑', '언어', 'Language', '한국어 / English', 'Korean / English'],
  theme: ['◐', '테마', 'Theme', '색 테마', 'Colour theme'],
  recent: ['🕘', '최근 파일', 'Recent files', '', ''],
  clearRecent: ['✖', '최근 목록 지우기', 'Clear recent list', '최근 파일 목록을 비웁니다', 'Empty the recent file list'],
  // Text fields (context menu)
  textCut: ['✂', '잘라내기', 'Cut', '', ''],
  textCopy: ['⧉', '복사', 'Copy', '', ''],
  textPaste: ['📋', '붙여넣기', 'Paste', '', ''],
  textSelectAll: ['⬚', '모두 선택', 'Select all', '', ''],
  closeOthers: ['⊗', '다른 탭 닫기', 'Close other tabs', '이 탭만 남기고 닫습니다', 'Close every tab but this one'],
  exportChart: ['🖼', '차트 그림 저장…', 'Save chart image…', '아래 결과 차트를 PNG 로 저장합니다', 'Save the result chart below as PNG'],
  copyTable: ['⧉', '표 복사', 'Copy table', '결과 표를 클립보드에 복사합니다 (탭 구분)', 'Copy the result table to the clipboard (tab separated)'],
  addToDashboard: ['📈', '대시보드 차트로', 'Chart on dashboard', '선택한 노드 뒤에 차트 노드를 이어 붙입니다', 'Attach a chart node after the selected node'],
  disconnect: ['✂', '연결 끊기', 'Disconnect', '선택한 노드의 연결을 모두 끊습니다', 'Remove every link of the selected nodes'],
  nodeHelp: ['❔', '노드 도움말', 'Node help', '선택한 노드의 설명', 'Help for the selected node'],
};

const isAdd = (id) => typeof id === 'string' && id.startsWith('add:');

export const COMMAND_IDS = [...Object.keys(C), ...NODES.map((n) => `add:${n.type}`)];

export function commandIcon(id) {
  if (isAdd(id)) return nodeSpec(id.slice(4))?.icon ?? '•';
  return C[id]?.[0] ?? '•';
}

export function commandName(id, language) {
  if (isAdd(id)) {
    const spec = nodeSpec(id.slice(4));
    return spec ? (language === 'en' ? spec.en : spec.ko) : id;
  }
  const entry = C[id];
  if (!entry) return id;
  return language === 'en' ? entry[2] : entry[1];
}

export function commandTip(id, language) {
  if (isAdd(id)) {
    const spec = nodeSpec(id.slice(4));
    if (!spec) return id;
    const name = language === 'en' ? spec.en : spec.ko;
    return `${name} — ${spec.help[language === 'en' ? 1 : 0]}`;
  }
  const entry = C[id];
  if (!entry) return id;
  const tip = language === 'en' ? entry[4] : entry[3];
  return tip ? `${language === 'en' ? entry[2] : entry[1]} — ${tip}` : (language === 'en' ? entry[2] : entry[1]);
}

const adds = (cat) => nodesIn(cat).map((n) => `add:${n.type}`);

/** Menu bar: id, icon, ko, en, items (`|` = separator). */
export const MENUS = [
  { id: 'file', icon: '📁', ko: '파일', en: 'File', items: ['new', 'newFromSample', 'open', 'importData', '|', 'save', 'saveAs', '|', 'exportCsv', 'exportJson', 'exportAllCsv', 'exportPng', 'exportReport', 'print', '|', 'closeTab', 'quit'] },
  { id: 'edit', icon: '✎', ko: '편집', en: 'Edit', items: ['undo', 'redo', '|', 'copy', 'paste', 'duplicate', 'delete', 'selectAll', '|', 'rename', 'toggleDisable', 'disconnect', 'autoLayout', '|', 'pipelineSettings'] },
  { id: 'view', icon: '👁', ko: '보기', en: 'View', items: ['viewGraph', 'viewDashboard', 'viewData', 'view3d', '|', 'fit', 'zoomReset', 'zoomIn', 'zoomOut', '|', 'showGrid', 'showRulers', 'snap', 'chartGrid', 'grid3d', 'axes3d', 'showPreviews', '|', 'toolPanel', 'propertyPanel', 'chartPanel', 'fullscreen'] },
  { id: 'node', icon: '⬡', ko: '노드', en: 'Node', items: ['nodeLibrary', '|', ...adds('source'), '|', ...adds('data'), '|', ...adds('output')] },
  { id: 'analysis', icon: '∿', ko: '해석', en: 'Analysis', items: [...adds('signal'), '|', ...adds('dynamics'), '|', ...adds('physics'), '|', ...adds('robotics'), '|', ...adds('cad'), '|', ...adds('analysis'), '|', ...adds('montecarlo'), '|', ...adds('integration')] },
  { id: 'run', icon: '▶', ko: '실행', en: 'Run', items: ['run', 'runSelected', 'stop', '|', 'validate', 'autoRun', 'clearResults', '|', 'pipelineSettings'] },
  { id: 'tools', icon: '🛠', ko: '도구', en: 'Tools', items: ['nodeLibrary', 'expressionHelp', 'pythonInfo', 'batchHelp', '|', 'settings'] },
  { id: 'help', icon: '❓', ko: '도움말', en: 'Help', items: ['home', 'tutorial', 'tutorialDoc', '|', 'usage', 'expressionHelp', 'shortcuts', '|', 'about'] },
];

const OUTPUT_GROUP = { id: 'output', icon: CATEGORIES.output.icon, ko: CATEGORIES.output.ko, en: CATEGORIES.output.en, tools: adds('output') };
const RUN_GROUP = { id: 'runTools', icon: '▶', ko: '실행', en: 'Run', tools: ['run', 'runSelected', 'stop', 'validate', 'autoRun', 'nodeLibrary'] };
const group = (cat, tools = adds(cat)) => ({ id: cat, icon: CATEGORIES[cat].icon, ko: CATEGORIES[cat].ko, en: CATEGORIES[cat].en, tools });

/** Workbenches (the selector at the right of the menu bar): the tool panel groups each one shows. */
export const WORKBENCHES = [
  { id: 'pipeline', icon: '⛓', ko: '파이프라인', en: 'Pipeline', groups: [group('source'), group('data'), OUTPUT_GROUP, RUN_GROUP] },
  { id: 'signal', icon: '∿', ko: '신호 처리', en: 'Signal processing', groups: [group('source', ['add:source.signal', 'add:source.table', 'add:source.function']), group('signal'), OUTPUT_GROUP, RUN_GROUP] },
  { id: 'dynamics', icon: '⟳', ko: '동역학·제어', en: 'Dynamics & control', groups: [group('dynamics'), group('signal', ['add:signal.fft', 'add:signal.peaks', 'add:signal.psd']), OUTPUT_GROUP, RUN_GROUP] },
  { id: 'physics', icon: '⚡', ko: '회로·물리', en: 'Circuits & physics', groups: [group('physics'), group('source', ['add:source.signal', 'add:source.table', 'add:source.function']), group('signal', ['add:signal.fft', 'add:signal.psd', 'add:signal.peaks']), OUTPUT_GROUP, RUN_GROUP] },
  { id: 'robotics', icon: '🤖', ko: '로봇·다물체', en: 'Robots & multibody', groups: [group('robotics'), group('dynamics', ['add:dyn.ode', 'add:dyn.blocks', 'add:ctrl.pid']), OUTPUT_GROUP, RUN_GROUP] },
  { id: 'cad', icon: '📐', ko: 'CAD·구조', en: 'CAD & structures', groups: [group('cad'), group('physics', ['add:fem.field']), group('integration', ['add:io.readFile']), OUTPUT_GROUP, RUN_GROUP] },
  { id: 'analysis', icon: '∑', ko: '통계·ML', en: 'Statistics & ML', groups: [group('source', ['add:source.table', 'add:source.random', 'add:source.function']), group('analysis'), group('data', ['add:data.expression', 'add:data.filter', 'add:data.select', 'add:data.merge']), OUTPUT_GROUP, RUN_GROUP] },
  { id: 'montecarlo', icon: '🎲', ko: '몬테카를로·최적화', en: 'Monte Carlo & optimisation', groups: [group('montecarlo'), group('analysis', ['add:stat.histogram', 'add:stat.describe', 'add:stat.regression']), OUTPUT_GROUP, RUN_GROUP] },
  { id: 'integration', icon: '⇄', ko: '연동·자동화', en: 'Integration & automation', groups: [group('integration'), group('data'), { id: 'automation', icon: '⌨', ko: '자동화', en: 'Automation', tools: ['pythonInfo', 'batchHelp', 'exportAllCsv', 'exportReport'] }, OUTPUT_GROUP] },
  { id: 'all', icon: '⬡', ko: '모든 노드', en: 'All nodes', groups: Object.keys(CATEGORIES).map((cat) => group(cat)) },
];

/** Toolbar groups (left part); the right edge has language, theme, settings and about. */
export const TOOLBAR_GROUPS = [
  ['new', 'open', 'save', 'print'],
  ['undo', 'redo'],
  ['viewGraph', 'viewDashboard', 'viewData', 'view3d'],
  ['fit', 'autoLayout', 'showGrid', 'showRulers', 'snap', 'chartGrid', 'showPreviews'],
  ['run', 'runSelected', 'stop', 'autoRun'],
  ['nodeLibrary', 'toggleDisable', 'delete'],
  ['exportReport'],
];

/** Right-click menus by what was clicked (every item carries its command icon). */
export const CONTEXT_MENUS = {
  canvas: { icon: '⛓', items: ['nodeLibrary', 'add:source.signal', 'add:source.table', 'add:out.plot', '|', 'paste', 'selectAll', 'autoLayout', 'fit', '|', 'showGrid', 'showRulers', 'snap', '|', 'run'] },
  node: { icon: '⬡', items: ['runSelected', 'viewData', 'addToDashboard', '|', 'rename', 'duplicate', 'copy', 'delete', '|', 'toggleDisable', 'disconnect', '|', 'exportCsv', 'exportJson', 'nodeHelp'] },
  link: { icon: '⟶', items: ['delete'] },
  dashboard: { icon: '▦', items: ['run', 'viewGraph', '|', 'exportPng', 'exportReport', 'print'] },
  tab: { icon: '🗂', items: ['save', 'saveAs', '|', 'closeTab', 'closeOthers', '|', 'new', 'newFromSample'] },
  chart: { icon: '📈', items: ['exportChart', 'copyTable', 'exportCsv', 'exportJson', '|', 'viewData', 'chartPanel'] },
  tree: { icon: '☰', items: ['runSelected', 'viewData', '|', 'rename', 'duplicate', 'delete', 'toggleDisable', '|', 'nodeHelp'] },
  view3d: { icon: '◇', items: ['grid3d', 'axes3d', '|', 'fit', 'viewGraph', 'viewData', '|', 'exportPng'] },
  text: { icon: '✎', items: ['textCut', 'textCopy', 'textPaste', '|', 'textSelectAll'] },
  general: { icon: '☰', items: ['home', '|', 'showGrid', 'showRulers', 'chartGrid', '|', 'toolPanel', 'propertyPanel', 'chartPanel', '|', 'settings', 'about'] },
};

export const SHORTCUTS = {
  new: 'Ctrl+N', open: 'Ctrl+O', save: 'Ctrl+S', saveAs: 'Ctrl+Shift+S', print: 'Ctrl+P', closeTab: 'Ctrl+W',
  undo: 'Ctrl+Z', redo: 'Ctrl+Y', copy: 'Ctrl+C', paste: 'Ctrl+V', duplicate: 'Ctrl+D', delete: 'Delete', selectAll: 'Ctrl+A',
  rename: 'F2', toggleDisable: 'Ctrl+E', autoLayout: 'Ctrl+L', nodeLibrary: 'Ctrl+K',
  fit: 'F', zoomReset: 'Ctrl+0', zoomIn: '+', zoomOut: '-', viewGraph: '1', viewDashboard: '2', viewData: '3', view3d: '4', showGrid: 'G', showRulers: 'Ctrl+R',
  run: 'F5', runSelected: 'Ctrl+F5', stop: 'Shift+F5', fullscreen: 'F11', usage: 'F1',
};
