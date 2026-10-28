// The tutorial: chapters and steps with their texts in Korean and English.
// Pure data (no imports) so Node tests and the tutorial document use it too.
//
// The in-app tour (src/components/Tutorial.jsx) runs a step's `action` ops to
// put the window in the state the step talks about, outlines its `target`
// (the first selector with an element on screen) and shows the text on a card.
//
// action ops (run in order before the step is shown):
//   'start'          show the start page        'desk'        leave it (the desktop)
//   'act:<id>'       an app action (window.__msm.action): tab:<ribbon>,
//                    newScript:<code key>, cmd:<code key>, runDoc, figures,
//                    newModel, pane:<folder|workspace|history>, closeDocs
//   'fig:<op>'       the figure controller: 2d, 3d, grid, rulers, mode:<m>, reset
//   'click:<sel>'    click the first match       'scroll:<sel>'  scroll it into view
//   'idle'           wait until the engine is no longer busy
//   'wait:<ms>'      wait
// dwell: auto-play time in ms (default: from the text length).

export const CHAPTERS = [
  { id: 'start', ko: '시작 화면', en: 'Start screen' },
  { id: 'desktop', ko: '화면 구성', en: 'The desktop' },
  { id: 'script', ko: '새 스크립트', en: 'New script' },
  { id: 'command', ko: '명령 창과 작업 공간', en: 'Command Window and Workspace' },
  { id: 'editor', ko: '편집기에서 실행', en: 'Running from the editor' },
  { id: 'figures', ko: '그림 창', en: 'Figure window' },
  { id: 'model', ko: '블록 다이어그램', en: 'Block diagrams' },
  { id: 'finish', ko: '설정과 도움말', en: 'Settings and help' },
];

/** M code the tour types or runs (keys used by 'act:cmd:<key>' and 'act:newScript:<key>'). */
export const TOUR_CODE = {
  first: 'x = linspace(0, 2*pi, 100);\ny = sin(x) .* exp(-x/4);\nA = magic(4)',
  'script.ko': null, // filled below: the script with Korean section titles
  script: [
    '%% Damped oscillation',
    't = linspace(0, 10, 400);',
    'y = exp(-0.3*t) .* cos(2*pi*0.8*t);',
    'plot(t, y, \'LineWidth\', 1.5)',
    'grid on',
    'title(\'Damped oscillation\')',
    'xlabel(\'t [s]\'); ylabel(\'y\')',
    '',
    '%% Peak',
    '[ymax, k] = max(y);',
    'fprintf(\'max %.3f at t = %.2f\\n\', ymax, t(k))',
  ].join('\n'),
  plot: 't = linspace(0, 10, 400);\nplot(t, exp(-0.3*t) .* cos(2*pi*0.8*t))\ngrid on',
  surf: '[X, Y] = meshgrid(-3:0.15:3);\nZ = peaks(X, Y);\nfigure; surf(X, Y, Z); colorbar',
};

TOUR_CODE['script.ko'] = TOUR_CODE.script.replace('%% Damped oscillation', '%% 감쇠 진동').replace('%% Peak', '%% 최댓값');
/** The code for a key in a language ('script' → 'script.ko' when there is one). */
export const tourCode = (key, lang) => TOUR_CODE[`${key}.${lang}`] || TOUR_CODE[key];

const T = (name, ...fallbacks) => [`[data-tour="${name}"]`, ...fallbacks];
const RIBBON = (act) => T(`rb-${act}`, `.ribbon [data-act="${act}"]`);
const FIG_TB = (n) => [`.fig-toolbar > :nth-child(${n})`, '.fig-toolbar'];

/** [id, chapter, target, action, [ko title, ko body], [en title, en body], extra] */
const ROWS = [
  // ── 1. 시작 화면 ──────────────────────────────
  ['welcome', 'start', T('start-hero', '[data-card="hero"]'), ['start'],
    ['MySimulationMath에 오신 것을 환영합니다', 'MySimulationMath는 M 언어로 수치 계산을 하고, 2D·3D 그림을 그리고, 블록 다이어그램 모델을 시뮬레이션하는 프로그램입니다. 이 튜토리얼은 실제 화면을 움직이며 기능을 하나씩 보여 줍니다. 카드의 [다음 ▶] 으로 넘어가고 ◀ 로 돌아가며, ▶ 단추로 자동 재생합니다. → / ← 키도 되고, Esc 를 누르면 언제든 끝납니다.'],
    ['Welcome to MySimulationMath', 'MySimulationMath does numerical computing in the M language, draws 2D and 3D figures and simulates block-diagram models. This tutorial moves the real screen to show the features one at a time. Press [Next ▶] on the card to go on, ◀ to go back and ▶ to play it by itself. The → / ← keys work too, and Esc leaves at any time.']],
  ['heroDocs', 'start', T('start-hero-docs', '.start-hero-actions'), ['start'],
    ['문서와 튜토리얼 단추', '맨 위 카드에는 [튜토리얼 실행], [사용 설명서], [튜토리얼 문서] 단추가 있습니다. 사용 설명서는 모든 기능을 자세히 설명한 문서를 별도 창으로 열고, 튜토리얼 문서는 지금 보는 단계를 그림과 함께 정리한 문서입니다.'],
    ['Documents and the tutorial', 'The top card has [Run tutorial], [User manual] and [Tutorial document]. The manual opens the full documentation in its own window; the tutorial document is these same steps with pictures.']],
  ['startNew', 'start', T('start-new', '[data-card="templates"]'), ['start'],
    ['새로 만들기', '[새로 만들기] 카드는 시작점을 묶어 보여 줍니다. 코드(스크립트, 라이브 스크립트, 함수, 클래스), 시뮬레이션(새 모델, 모델 열기, 블록 라이브러리), 데이터(가져오기, 플롯, 그림, 파일 찾기). 타일을 누르면 바로 그 작업이 시작됩니다.'],
    ['Create new', 'The [New] card groups the starting points: code (script, live script, function, class), simulation (new model, open model, block library) and data (import, plots, figures, find files). A tile starts that job at once.']],
  ['startRecent', 'start', T('start-recent', '[data-card="recent"]'), ['start'],
    ['최근 파일', '최근에 연 스크립트와 모델이 나옵니다. 누르면 다시 열고, ✕ 는 목록에서만 지웁니다(파일은 그대로).'],
    ['Recent files', 'Recently opened scripts and models. Click one to open it again; ✕ only removes it from the list (the file stays).']],
  ['startHelp', 'start', T('start-help', '[data-card="help"]'), ['start'],
    ['도움말 카드', '[도움말] 카드에서 사용 설명서, 튜토리얼, 명령 도움말(help), 함수 찾기, 단축키, 환경 설정, 정보를 엽니다.'],
    ['Help card', 'The [Help] card opens the user manual, the tutorial, command help (help), function search, shortcuts, preferences and About.']],
  ['startSamples', 'start', T('start-samples', '[data-card="samples"]'), ['start', 'scroll:[data-card="samples"]'],
    ['샘플·예제', '분야별 예제가 있습니다. 카드를 누르면 예제 코드가 새 스크립트로 열리고, ▶ 단추는 바로 실행합니다. 위쪽 분류 단추로 거를 수 있습니다.'],
    ['Samples', 'Examples by topic. Click a card to open its code as a new script; the ▶ button runs it at once. The category buttons at the top filter the list.']],
  ['startBackground', 'start', T('start-background', '[data-card="side"]'), ['start', 'scroll:[data-card="hero"]'],
    ['움직이는 배경', '[배경] 카드에서 시작 화면 뒤의 애니메이션 종류, 속도, 투명도를 고릅니다. 카드는 ⠿ 손잡이로 옮기고 오른쪽 아래 모서리로 크기를 바꿀 수 있습니다.'],
    ['Animated background', 'The [Background] card picks the animation behind the start screen, its speed and transparency. Cards move with their ⠿ handle and resize from the bottom-right corner.']],

  // ── 2. 화면 구성 ─────────────────────────────
  ['desk', 'desktop', ['.body-row'], ['desk', 'act:closeDocs', 'act:pane:folder', 'act:pane:workspace', 'act:pane:history'],
    ['데스크톱', '시작 화면을 닫으면 데스크톱이 나옵니다. 왼쪽은 현재 폴더, 가운데는 명령 창, 오른쪽은 작업 공간과 명령 기록입니다. 창 사이의 경계를 끌어 크기를 바꾸고, 배치는 다음 실행 때 그대로 돌아옵니다.'],
    ['The desktop', 'Closing the start screen shows the desktop: Current Folder on the left, the Command Window in the middle, Workspace and Command History on the right. Drag the borders to resize; the layout comes back next time.']],
  ['ribbon', 'desktop', ['.rb-tabs'], ['desk', 'act:tab:home'],
    ['리본 탭', '맨 위 줄은 제목 표시줄이자 도구 모음입니다. 홈·플롯·앱·편집기·시뮬레이션 탭을 고르면 아래 리본의 단추가 바뀝니다.'],
    ['Ribbon tabs', 'The top row is both the title bar and the toolbar. Pick Home, Plots, Apps, Editor or Simulation and the ribbon below changes.']],
  ['ribbonHome', 'desktop', ['.ribbon'], ['desk', 'act:tab:home'],
    ['홈 리본', '홈 리본에는 새 스크립트·새 모델·열기·저장, 파일 찾기, 데이터 가져오기, 작업 공간·명령 창 지우기, 실행 취소, 창 켜기/끄기, 레이아웃, 환경 설정이 있습니다.'],
    ['Home ribbon', 'Home has New Script, New Model, Open and Save, Find Files, Import Data, Clear Workspace / Command Window, Undo, pane toggles, Layout and Preferences.']],
  ['folder', 'desktop', ['[data-pane="folder"]'], ['desk', 'act:pane:folder'],
    ['현재 폴더', '현재 폴더 창은 작업 폴더의 파일을 보여 줍니다. .m 파일을 두 번 클릭하면 편집기로, 모델은 모델 편집기로, 데이터 파일은 작업 공간으로 불러옵니다. 오른쪽 클릭으로 새로 만들기·이름 바꾸기·삭제를 합니다.'],
    ['Current Folder', 'Current Folder lists the work folder. Double-click a .m file to edit it, a model to open the model editor, a data file to load it. Right-click for new, rename and delete.']],

  // ── 3. 새 스크립트 ──────────────────────────────
  ['newScript', 'script', ['.doc-area'], ['desk', 'act:closeDocs', 'act:newScript:script', 'act:tab:editor'],
    ['새 스크립트', '새 스크립트(Ctrl+N)를 열었습니다. %% 로 시작하는 줄이 섹션을 나눕니다. 문법 색, 줄 번호, 자동 완성, 찾기/바꾸기(Ctrl+F), 주석(Ctrl+R) 을 씁니다. 실행은 잠시 뒤에 해 보고, 먼저 아래 명령 창부터 봅니다.'],
    ['New script', 'A new script (Ctrl+N) is open. Lines starting with %% split it into sections. You get syntax colours, line numbers, completion, find / replace (Ctrl+F) and comment (Ctrl+R). We will run it in a moment; first, the Command Window below.']],

  // ── 4. 명령 창과 작업 공간 ───────────────────────
  ['cmd', 'command', ['[data-pane="cmd"]'], ['desk', 'act:pane:cmd', 'act:cmd:first', 'idle'],
    ['명령 창', '명령 창의 >> 뒤에 코드를 쓰고 Enter 를 누르면 바로 실행됩니다. 지금 x, y 를 만들고 4×4 마방진 A 를 출력했습니다. 세미콜론(;)으로 끝내면 결과를 출력하지 않습니다. ↑ / ↓ 는 명령 기록, Tab 은 자동 완성입니다.'],
    ['Command Window', 'Type code after >> and press Enter to run it. The tour just made x and y and printed the 4×4 magic square A. A trailing semicolon (;) hides the result. ↑ / ↓ recall history and Tab completes names.']],
  ['workspace', 'command', ['[data-pane="workspace"]'], ['desk', 'act:pane:workspace'],
    ['작업 공간', '만든 변수가 작업 공간에 이름·값·크기·클래스와 함께 나옵니다. 두 번 클릭하면 변수 편집기에서 표처럼 보고 고칠 수 있고, 오른쪽 클릭으로 그림 그리기·이름 바꾸기·저장을 합니다.'],
    ['Workspace', 'The new variables appear in the Workspace with name, value, size and class. Double-click one to view and edit it as a table in the Variable Editor; right-click to plot, rename or save it.']],
  ['history', 'command', ['[data-pane="history"]'], ['desk', 'act:pane:history'],
    ['명령 기록', '실행한 명령이 세션별로 쌓입니다. 두 번 클릭하면 다시 실행하고, 오른쪽 클릭으로 복사하거나 지웁니다.'],
    ['Command History', 'Commands you ran are kept per session. Double-click to run one again; right-click to copy or delete.']],

  // ── 5. 편집기에서 실행 ─────────────────────────────
  ['editorRibbon', 'editor', RIBBON('run'), ['desk', 'act:ensureScript:script', 'act:tab:editor'],
    ['실행과 디버그', '편집기 리본의 [실행](F5) 은 스크립트 전체를, [섹션 실행](Ctrl+Enter) 은 커서가 있는 %% 구간만 실행합니다. 줄 번호 왼쪽을 누르거나 F12 로 중단점을 걸면 그 줄에서 멈추고 계속(F5)·한 단계(F10)·안으로(F11)로 진행합니다.'],
    ['Run and debug', '[Run] (F5) on the Editor ribbon runs the whole script; [Run Section] (Ctrl+Enter) runs only the %% section at the cursor. Click left of a line number or press F12 for a breakpoint: execution stops there and continues with Continue (F5), Step (F10) and Step In (F11).']],
  ['runScript', 'editor', ['[data-pane="cmd"]'], ['desk', 'act:ensureScript:script', 'act:runDoc', 'idle', 'wait:600'],
    ['스크립트 실행 결과', '스크립트를 실행했습니다. fprintf 의 출력은 명령 창에 나오고, plot 은 그림 탭을 엽니다.'],
    ['Script output', 'The script ran. The fprintf output is in the Command Window and plot opened the Figures tab.']],

  // ── 6. 그림 창 ───────────────────────────────
  ['figure', 'figures', ['.fig-area'], ['desk', 'act:ensurePlot:plot', 'idle', 'act:figures', 'wait:300'],
    ['그림 창', '그림은 문서 탭의 그림 영역에 나옵니다. 여러 그림은 위쪽 탭으로 바꿉니다. 마우스 휠은 커서 위치에서 확대/축소하고 가운데 버튼 끌기는 이동합니다.'],
    ['Figure window', 'Figures appear in the Figures document tab; several figures get their own tabs on top. The mouse wheel zooms at the cursor and a middle-button drag pans.']],
  ['figToolbar', 'figures', ['.fig-toolbar'], ['desk', 'act:ensurePlot:plot', 'idle', 'act:figures'],
    ['그림 도구 모음', '확대·축소(배율 −/+), 맞춤, 상자 확대, 이동, 3D 회전, 데이터 팁, 2D/3D 전환, 격자, 눈금자, 범례, 컬러바, 조명, 내보내기(PNG·JPEG·SVG·PDF), 복사가 있습니다.'],
    ['Figure toolbar', 'Zoom in / out (with a −/+ percentage), Fit, Box zoom, Pan, Rotate 3D, Data tips, the 2D/3D switch, Grid, Rulers, Legend, Colorbar, Lights, Export (PNG, JPEG, SVG, PDF) and Copy.']],
  ['figZoom', 'figures', FIG_TB(1), ['desk', 'act:ensurePlot:plot', 'idle', 'act:figures', 'fig:reset', 'click:.fig-toolbar > :nth-child(1)', 'wait:200', 'click:.fig-toolbar > :nth-child(1)'],
    ['확대', '[확대] 를 두 번 눌러 가운데를 기준으로 확대했습니다. 오른쪽의 % 칸은 −/+ 로 배율을 바꾸고, [맞춤] 은 처음 보기로 되돌립니다.'],
    ['Zoom', '[Zoom in] was pressed twice to zoom about the centre. The % box next to it changes the zoom with −/+, and [Fit] goes back to the full view.']],
  ['fig3d', 'figures', FIG_TB(11), ['desk', 'fig:reset', 'act:cmd:surf', 'idle', 'act:figures', 'wait:500', 'fig:3d'],
    ['3D 그림과 2D/3D 전환', 'surf(peaks) 로 3D 곡면을 그렸습니다. 끌면 카메라가 돌고, [2D/3D] 단추는 위에서 본 2D 보기와 3D 보기를 오갑니다.'],
    ['3D plot and the 2D/3D switch', 'surf(peaks) drew a 3D surface. Drag to orbit the camera; the [2D/3D] button switches between the top-down 2D view and the 3D view.']],
  ['figGrid', 'figures', FIG_TB(13), ['desk', 'act:ensurePlot:surf', 'idle', 'act:figures', 'wait:300', 'fig:3d', 'fig:grid', 'fig:rulers'],
    ['격자와 눈금자', '[격자] 는 보조선 5칸마다 주선이 있는 5×5 격자(3D 에서는 끝없는 바닥 격자)를, [눈금자] 는 위쪽과 왼쪽 가장자리의 데이터 단위 눈금자를 켭니다.'],
    ['Grid and rulers', '[Grid] shows a 5×5 grid (a major line every five minor ones; an infinite ground grid in 3D) and [Rulers] shows data-unit rulers along the top and left edges.']],

  // ── 7. 블록 다이어그램 ─────────────────────────
  ['model', 'model', ['.sim-canvas-wrap', '[data-doc="model"]'], ['desk', 'act:closeDocs', 'act:ensureModel', 'act:tab:simulation', 'wait:800'],
    ['블록 다이어그램 편집기', '새 모델을 열었습니다. 캔버스에 블록을 놓고 출력 포트에서 입력 포트로 끌어 선을 잇습니다. 휠로 확대/축소, Space+끌기나 가운데 버튼으로 이동합니다.'],
    ['Block-diagram editor', 'A new model is open. Put blocks on the canvas and drag from an output port to an input port to connect them. The wheel zooms; Space+drag or the middle button pans.']],
  ['library', 'model', ['.sim-lib'], ['desk', 'act:ensureModel', 'wait:300'],
    ['블록 라이브러리', '왼쪽 라이브러리에는 소스, 싱크, 연속, 이산, 수학, 논리, 라우팅, 룩업 테이블 같은 묶음의 블록이 있습니다. 검색 칸으로 찾고, 캔버스로 끌어 놓거나 두 번 클릭해 추가합니다.'],
    ['Block library', 'The library on the left holds blocks by group: sources, sinks, continuous, discrete, math, logic, routing, lookup tables and more. Search for one and drag it onto the canvas or double-click it.']],
  ['simToolbar', 'model', ['.sim-toolbar'], ['desk', 'act:ensureModel', 'wait:200'],
    ['모델 도구 모음', '실행(Ctrl+T)·일시 정지·한 단계·정지, 갱신(Ctrl+Shift+D), 정지 시간, 솔버, 맞춤·확대, 격자·스냅·눈금자, 모델 설정(Ctrl+E) 이 있습니다. 블록을 두 번 클릭하면 파라미터 대화 상자가, Scope 를 두 번 클릭하면 스코프 창이 열립니다.'],
    ['Model toolbar', 'Run (Ctrl+T), Pause, Step and Stop, Update (Ctrl+Shift+D), stop time, solver, Fit and zoom, Grid, Snap and Rulers, and Model settings (Ctrl+E). Double-click a block for its parameters and a Scope for its scope window.']],
  ['simRibbon', 'model', RIBBON('sim:run'), ['desk', 'act:ensureModel', 'act:tab:simulation'],
    ['시뮬레이션 리본', '시뮬레이션 리본에서도 새 모델·열기·저장·라이브러리·실행·중지를 합니다. 기본 솔버와 정지 시간은 설정 › 시뮬레이션에서 정합니다.'],
    ['Simulation ribbon', 'The Simulation ribbon also has New Model, Open, Save, Library, Run and Stop. The default solver and stop time are in Settings › Simulation.']],

  // ── 8. 설정과 도움말 ───────────────────────────
  ['settings', 'finish', T('tb-settings', '.app-controls .tb-icon-only'), ['desk', 'act:closeDocs', 'act:tab:home'],
    ['설정', '톱니바퀴(Ctrl+,) 는 설정 창을 엽니다. 언어, 40가지 테마와 사용자 정의 테마, 명령 창·편집기 글꼴, 그림 기본값, 시뮬레이션 기본값, 키보드, 그리고 시작할 때 튜토리얼을 물을지 정합니다.'],
    ['Settings', 'The gear (Ctrl+,) opens Settings: language, 40 themes plus your own, Command Window and Editor fonts, figure and simulation defaults, keyboard, and whether to offer the tutorial at start.']],
  ['theme', 'finish', ['.tb-split'], ['desk'],
    ['테마와 언어', '팔레트 단추는 다음 테마로 바꾸고, ⌄ 는 테마 목록을 엽니다. 국기 단추는 한국어와 영어를 바꿉니다.'],
    ['Theme and language', 'The palette button switches to the next theme and ⌄ opens the theme list. The flag button switches between Korean and English.']],
  ['helpTab', 'finish', ['.ribbon[data-ribbon="help"]', '.rb-tabs [data-rtab="help"]'], ['desk', 'act:tab:help'],
    ['도움말 탭', '제목 표시줄 오른쪽 끝의 [도움말] 탭에는 사용 설명서(F1), 튜토리얼 실행, 튜토리얼 문서, 명령 도움말, 함수 찾기, 단축키, 샘플·예제, 환경 설정, 프로그램 정보가 모여 있습니다.'],
    ['The Help tab', 'The [Help] tab at the right end of the title bar gathers the User Manual (F1), Run Tutorial, the Tutorial Document, Command Help, Find Functions, Shortcuts, Samples, Preferences and About.']],
  ['help', 'finish', T('tb-guide', '.tb-guide'), ['desk', 'act:tab:home'],
    ['사용 설명서와 튜토리얼', '책 단추는 사용 설명서를 별도 창으로 엽니다(왼쪽 목차, 오른쪽 내용, 글자 크기 −/+, 언어, 인쇄). 학사모 단추는 이 튜토리얼을 다시 실행합니다. 이것으로 튜토리얼을 마칩니다.'],
    ['User manual and tutorial', 'The book button opens the user manual in its own window (contents on the left, text on the right, font size −/+, language, print). The cap button runs this tutorial again. That is the end of the tour.']],
];

export const STEPS = ROWS.map(([id, chapter, target, action, ko, en, extra]) => ({
  id, chapter, target: Array.isArray(target) ? target : [target], action: action || [],
  ko: { title: ko[0], body: ko[1] }, en: { title: en[0], body: en[1] }, ...(extra || {}),
}));

export const chapterName = (id, lang) => { const c = CHAPTERS.find((x) => x.id === id); return c ? (lang === 'en' ? c.en : c.ko) : id; };
export const stepText = (step, lang) => (lang === 'en' ? step.en : step.ko);
/** Auto-play time: 4 s plus the reading time of the text. */
export const dwellOf = (step, lang) => step.dwell || Math.min(16000, 4000 + stepText(step, lang).body.length * (lang === 'en' ? 28 : 55));

/** The tutorial document (Markdown, same texts as the tour, one picture per chapter). */
export function tutorialMarkdown(lang) {
  const en = lang === 'en';
  const out = [en ? '# Tutorial' : '# 튜토리얼', ''];
  out.push(en
    ? `The interactive tutorial walks through the real window in ${CHAPTERS.length} chapters and ${STEPS.length} steps. Start it from the start screen ([Run tutorial]), from the cap button in the title bar, or from the popup shown at launch. This document has the same texts so you can read them at your own pace.`
    : `대화형 튜토리얼은 실제 창을 움직이며 ${CHAPTERS.length}개 장, ${STEPS.length}단계로 기능을 설명합니다. 시작 화면의 [튜토리얼 실행], 제목 표시줄의 학사모 단추, 또는 시작할 때 나오는 안내 창에서 실행합니다. 이 문서는 같은 내용을 천천히 읽을 수 있게 정리한 것입니다.`);
  out.push('');
  out.push(en ? '> Tip: In the tour, → / Space goes to the next step, ← to the previous one, Esc ends it. The chapter list on the card jumps to any chapter.' : '> 팁: 튜토리얼 중에는 → / Space 로 다음 단계, ← 로 이전 단계, Esc 로 끝냅니다. 카드의 장 목록에서 원하는 장으로 바로 건너뜁니다.');
  out.push('');
  CHAPTERS.forEach((c, n) => {
    out.push(`## ${n + 1}. ${en ? c.en : c.ko}`, '');
    out.push(`![${en ? `Tutorial — ${c.en}` : `튜토리얼 — ${c.ko}`}](images/${en ? 'en' : 'ko'}/tour-${c.id}.png)`, '');
    for (const s of STEPS.filter((x) => x.chapter === c.id)) {
      const txt = stepText(s, lang);
      out.push(`### ${txt.title}`, '', txt.body, '');
    }
  });
  return out.join('\n');
}
