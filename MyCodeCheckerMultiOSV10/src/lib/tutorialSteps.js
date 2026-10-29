// The tutorial: chapters and steps, with their texts in Korean and English.
//
// The in-app tour (src/components/Tutorial.jsx) runs a step's `action` ops to
// put the window in the state the step talks about, outlines its `target` and
// shows the text on a card at the bottom right. scripts/tutorial-capture.mjs
// screenshots every step and writes Tutorial.md / Tutorial.en.md from the same
// texts; scripts/tutorial-video.mjs records them with narration. Pure data (no
// imports), so Node can read it too.
//
// target: a CSS selector or a list of them, tried in order — the first one on
//   screen is outlined. Each list starts with a [data-tour="…"] hook and falls
//   back to the class the element has today, so the tour keeps working while
//   the screens change.
// action: ops run in order before the step is shown (all optional):
//   'start'            show the start page
//   'project'          leave the start page with an analysed project (the
//                      active one, or the sample project analysed once)
//   'view:<id>'        open a view (overview, issues, defects, …)
//   'act:<id>'         run an app action (window.__mcc.action), e.g.
//                      'act:settings:theme', 'act:adminTab:webhooks', 'act:newProject'
//   'menu:<id>'        open a menu-bar menu (file, analyze, …, help, theme, lang)
//   'panel:<side>'     make the left / right / bottom panel visible and unfolded
//   'bottom:<tab>'     pick a bottom-panel tab (problems, log, jobs, output)
//   'click:<sel>'      click the first element matching (ignored when missing)
//   'scroll:<sel>'     scroll the element into view
//   'wait:<ms>'        wait
//   'guide' / 'close-guide'  open / close the user's guide window
// Before every step the engine closes menus and dialogs left by the previous one.
// dwell: auto-play time in ms (default: from the text length).

export const CHAPTERS = [
  { id: 'start', ko: '시작 화면', en: 'Start page' },
  { id: 'project', ko: '프로젝트와 분석', en: 'Projects and analysis' },
  { id: 'layout', ko: '화면 구성', en: 'Finding your way' },
  { id: 'overview', ko: '개요와 품질 게이트', en: 'Overview and quality gate' },
  { id: 'issues', ko: '이슈 처리', en: 'Working with issues' },
  { id: 'aifix', ko: 'AI 코드 수정', en: 'AI code fix' },
  { id: 'explore', ko: '코드 살펴보기', en: 'Exploring the code' },
  { id: 'defectAnalysis', ko: '정밀 결함 분석', en: 'Defect Analysis' },
  { id: 'compliance', ko: '보안·규정 준수', en: 'Security and compliance' },
  { id: 'supply', ko: '의존성·웹 스캔·풀 리퀘스트', en: 'Dependencies, web scan and pull requests' },
  { id: 'reports', ko: '보고서', en: 'Reports' },
  { id: 'quality', ko: '규칙·프로파일·게이트', en: 'Rules, profiles and gates' },
  { id: 'admin', ko: '관리', en: 'Administration' },
  { id: 'settings', ko: '설정', en: 'Settings' },
  { id: 'help', ko: '도움말과 CI', en: 'Help and CI' },
];

const T = (name, ...fallbacks) => [`[data-tour="${name}"]`, ...fallbacks];
const MAIN = ['main.main', '.center-col'];
const VIEW = (id) => T(`view-${id}`, ...MAIN);
const DIALOG = (name) => T(name, '.dialog', '[role="dialog"]');
const MENU = T('menu-popup', '.menu-pop', '.menu-popup', '[role="menu"]');
const SETTINGS = (tab) => T('settings-window', '.settings-dialog', '.dialog');

/** [id, chapter, target, action, [ko title, ko body], [en title, en body], extra] */
const ROWS = [
  // ── 1. 시작 화면 ──────────────────────────────────────
  ['welcome', 'start', T('start-hero', '.start-hero'), ['start'],
    ['MyCodeChecker에 오신 것을 환영합니다', 'MyCodeChecker는 소스 코드에서 버그·취약점·코드 스멜·보안 핫스팟을 찾고, 정밀 결함 분석의 결함 분류와 MISRA·CERT·한국 행안부 규정 점검, 품질 게이트까지 이 컴퓨터 안에서 처리하는 코드 검사 도구입니다. 이 튜토리얼은 실제 화면을 움직이며 기능을 하나씩 보여 줍니다. 오른쪽 아래 카드의 [다음 ▶] 으로 넘어가고, ◀ 로 돌아가며, ▶ 단추로 자동 재생합니다. 장 목록에서 원하는 장으로 바로 건너뛸 수 있고, Esc 를 누르면 언제든 끝납니다.'],
    ['Welcome to MyCodeChecker', 'MyCodeChecker finds bugs, vulnerabilities, code smells and security hotspots in source code, and also does defect-analysis defect triage, MISRA / CERT / Korean MOIS compliance checks and quality gates — all on this computer. This tutorial moves the real screen to show the features one at a time. Press [Next ▶] on the card at the bottom right to go on, ◀ to go back and ▶ to play it by itself. Jump to any chapter from the chapter list, and press Esc at any time to leave.']],
  ['heroDocs', 'start', T('start-hero-docs', '.start-hero-actions', '.start-hero'), ['start'],
    ['문서와 튜토리얼 단추', '맨 위 카드의 오른쪽에는 [사용 설명서], [튜토리얼 문서], [튜토리얼 시작] 단추가 있습니다. 사용 설명서는 모든 기능을 자세히 설명한 문서를 별도 창으로 엽니다. 튜토리얼 문서는 지금 보는 단계를 그림과 함께 정리한 문서이고, 튜토리얼 시작은 이 안내를 처음부터 다시 실행합니다.'],
    ['Documents and the tutorial', 'On the right of the top card are [User\'s guide], [Tutorial document] and [Start tutorial]. The user\'s guide opens the full manual in its own window. The tutorial document is these same steps with a picture of each, and Start tutorial runs this tour again from the beginning.']],
  ['startNew', 'start', T('start-new', '.start-card.templates', '.template-groups'), ['start'],
    ['새로 분석', '[새로 분석] 카드는 하고 싶은 일별로 시작점을 묶어 보여 줍니다. 기본(새 프로젝트, 폴더 열기, 샘플 프로젝트), 품질(Java·JavaScript·Python·C# 규칙), 보안·규정(한국 행안부 49, MISRA, CERT, AUTOSAR), 정밀 결함 분석(빌드 캡처, 데스크톱 분석), 웹·공급망(DAST, SCA), 서버·CI(서버 업로드, 예약 분석) 묶음이 있습니다. 타일을 누르면 그 작업에 맞는 화면이 바로 열립니다.'],
    ['New analysis', 'The [New analysis] card groups starting points by what you want to do: basic (new project, open folder, sample project), quality (Java, JavaScript, Python and C# rules), security and compliance (Korea MOIS 49, MISRA, CERT, AUTOSAR), Defect Analysis (build capture, desktop analysis), web and supply chain (DAST, SCA) and server / CI (server upload, scheduled analysis). Pressing a tile opens the screen for that job.']],
  ['startRecent', 'start', T('start-recent', '.start-card.recent'), ['start'],
    ['최근 프로젝트', '최근에 연 프로젝트 파일(.mccp)과 폴더가 최대 10개까지 보입니다. 항목을 누르면 그 프로젝트를 다시 열고, 분석 결과가 있으면 개요로, 없으면 바로 분석합니다. 항목 오른쪽의 ✕ 는 목록에서만 지우고 프로젝트와 결과는 그대로 둡니다. [모두 지우기] 로 목록을 비울 수 있으며, 찾을 수 없는 경로는 흐리게 표시됩니다.'],
    ['Recent projects', 'Up to ten recently opened project files (.mccp) and folders are listed. Click one to open it again: it goes to the overview when it has a result and analyses it otherwise. The ✕ on a row only removes it from the list; the project and its results stay. [Clear all] empties the list, and paths that no longer exist are dimmed.']],
  ['startHelp', 'start', T('start-help', '.start-card.help'), ['start'],
    ['도움말 카드', '[도움말] 카드에는 사용 설명서, 튜토리얼, 단축키, README 같은 안내가 모여 있습니다. 처음 쓰는 기능이 있으면 여기서 해당 문서를 바로 열 수 있습니다.'],
    ['Help card', 'The [Help] card gathers the user\'s guide, the tutorial, shortcuts and the README. When a feature is new to you, open its document right from here.']],
  ['startBackground', 'start', T('start-background', '.start-card.side'), ['start'],
    ['움직이는 배경', '[배경] 카드에서 시작 화면 뒤에 흐르는 애니메이션을 고릅니다. 종류 단추로 배경을 바꾸고, [섞기] 를 켜면 정한 간격마다 다른 배경으로 바뀝니다. [속도] 와 [투명도] 는 − / + 단추로 조절하며, [시작할 때마다 다른 배경] 을 켜면 실행할 때마다 무작위로 고릅니다. 같은 설정은 설정 › 시작 화면에도 있습니다.'],
    ['Animated background', 'The [Background] card picks the animation behind the start page. The kind buttons switch it, [Shuffle] changes it every few seconds, [Speed] and [Transparency] are set with the − / + buttons, and [A different background each start] picks one at random at every launch. The same options are in Settings › Start page.']],
  ['startSamples', 'start', T('start-samples', '.start-card.start-samples', '.start-sample-grid'), ['start', 'scroll:[data-tour="start-samples"], .start-samples'],
    ['샘플·예제', '[샘플·예제] 카드에는 Java 웹 핸들러, JavaScript 앱, Python 스크립트, C 네이티브 코드, Dockerfile, Terraform, npm 의존성 같은 작은 예제가 언어별로 있습니다. 예제를 누르면 그 예제를 바로 분석해서 어떤 이슈가 나오는지 볼 수 있습니다. [Demo 전체] 는 19개 파일, 14개 언어의 이슈·결함·핫스팟을 한 번에 보여 줍니다.'],
    ['Samples', 'The [Samples] card has small examples per language — a Java web handler, a JavaScript app, a Python script, native C code, a Dockerfile, Terraform, npm dependencies and more. Click one to analyse it at once and see what it finds. [Demo (all)] shows the issues, defects and hotspots of 19 files in 14 languages together.']],
  ['startCards', 'start', T('start-board', '.start-board', '.start-grid'), ['start'],
    ['카드 옮기기와 크기 바꾸기', '시작 화면의 카드는 제목 왼쪽의 손잡이(⠿)를 끌어 옮깁니다. 놓으면 그 열에서 위로 붙고, 비는 자리는 다른 카드가 올라와 자동으로 메웁니다. 카드 오른쪽 아래 모서리를 끌면 너비(1~3칸)와 높이가 바뀌고, 모서리를 두 번 누르면 높이가 자동으로 돌아갑니다. 오른쪽 위 [자동 정렬] 은 카드를 세 열에 고르게 다시 배치합니다. 배치는 저장되고 편집 › 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.'],
    ['Moving and resizing cards', 'Drag the handle (⠿) left of a card title to move it. A dropped card moves up in its column, and other cards move up to fill any gap. Drag the bottom-right corner to change its width (1–3 columns) and height; double-click the corner to go back to automatic height. [Auto arrange] at the top right spreads the cards evenly over the three columns again. The layout is saved, and Edit › Undo (Ctrl+Z) takes a change back.']],
  ['startShow', 'start', T('start-show', '.start-foot', '.start-check'), ['start', 'scroll:[data-tour="start-show"], .start-foot'],
    ['시작할 때 이 화면 보기', '시작 화면 아래의 [시작할 때 이 화면 보기] 를 끄면 다음 실행부터 마지막으로 연 프로젝트의 개요가 바로 열립니다. 시작 화면은 언제든 툴바의 홈 단추나 보기 메뉴로 다시 볼 수 있습니다.'],
    ['Show this page at start', 'Turn off [Show this page at start] at the bottom of the start page and the next launch goes straight to the overview of the last project. You can come back to the start page any time with the Home button on the toolbar or from the View menu.']],

  // ── 2. 프로젝트와 분석 ───────────────────────────────
  ['newProject', 'project', DIALOG('dialog-new-project'), ['start', 'act:newProject', 'wait:300'],
    ['새 프로젝트 만들기', '파일 › 새 프로젝트(Ctrl+N)는 소스 폴더와 설정을 프로젝트 파일(.mccp)에 담습니다. [이름] 과 [소스 폴더] 를 적으면 [프로젝트 파일] 경로가 채워집니다. [더 많은 설정] 을 켜면 프로젝트 키, 제외할 경로, 품질 프로파일과 게이트 같은 항목이 나오고, [만든 뒤 바로 분석] 이 켜져 있으면 저장하자마자 분석합니다. 프로젝트 파일에는 설정만 들어 있어 동료와 공유하거나 저장소에 함께 넣어 두기 좋습니다.'],
    ['Creating a project', 'File › New project (Ctrl+N) puts a source folder and its settings in a project file (.mccp). Enter the [Name] and the [Source folder] and the [Project file] path fills in. [More settings] shows the project key, paths to exclude, the quality profile and gate and more, and with [Analyse after creating] on, the project is analysed as soon as it is saved. A project file holds only settings, so it is easy to share or to keep in the repository.']],
  ['openProject', 'project', T('menu-popup', '.menu-pop', '[role="menu"]'), ['project', 'menu:file'],
    ['프로젝트 열기와 저장', '파일 메뉴에서 [프로젝트 열기](Ctrl+Shift+O)로 .mccp 파일을, [폴더 열기](Ctrl+O)로 소스 폴더를 바로 엽니다. .mccp 파일을 탐색기에서 두 번 눌러도 MyCodeChecker 가 열립니다. [저장](Ctrl+S)과 [다른 이름으로 저장](Ctrl+Shift+S)은 지금 프로젝트의 설정을 파일로 남기고, 아래쪽에는 최근 프로젝트 목록이 있습니다.'],
    ['Opening and saving projects', 'In the File menu, [Open project] (Ctrl+Shift+O) opens a .mccp file and [Open folder] (Ctrl+O) opens a source folder directly. Double-clicking a .mccp file in the file manager also opens MyCodeChecker. [Save] (Ctrl+S) and [Save as] (Ctrl+Shift+S) write the current project\'s settings to a file, and the recent projects are listed below.']],
  ['analyze', 'project', T('tb-analyze', '.icon-toolbar .tool-primary', '.icon-toolbar'), ['project'],
    ['분석 실행', '툴바의 [분석] 단추(Ctrl+Enter)는 지금 프로젝트를 다시 분석합니다. 분석은 이 컴퓨터에서 실행되고 코드는 밖으로 나가지 않습니다. 끝나면 결과가 커밋되어 스냅샷이 쌓이고, 상태 표시줄에 품질 게이트 통과 여부가 나옵니다. [데스크톱] 단추는 커밋하지 않고 결함만 확인하는 데스크톱 방식 정밀 결함 분석입니다. 분석이 1초 넘게 걸리면 진행 창이 떠서 진척률(%)과 단계(파일 수집·규칙·엔진·마무리), 지금 파일, 지난 시간과 남은 시간을 보여 주고, [취소] 로 멈출 수 있습니다.'],
    ['Running an analysis', 'The [Analyze] button on the toolbar (Ctrl+Enter) analyses the current project again. Analysis runs on this computer and your code never leaves it. When it finishes the result is committed as a new snapshot and the status bar tells whether the quality gate passed. [Desktop] runs a Defect Analysis-Desktop-style analysis that shows defects without committing. When an analysis takes more than a second a progress window shows the percentage, the phase (collecting files, rules, engines, finishing), the current file, the elapsed and remaining time, and [Cancel] stops it.']],
  ['branch', 'project', T('tb-branch', '.tb-branch', '.tb-select'), ['project'],
    ['브랜치', '툴바의 [브랜치] 칸에서 분석 결과를 볼 브랜치를 고르거나 새 이름을 적습니다. 브랜치마다 분석 기록과 새 코드 기준이 따로 쌓이므로, 기능 브랜치의 결과를 메인 브랜치와 섞지 않고 볼 수 있습니다.'],
    ['Branches', 'Use the [Branch] box on the toolbar to choose the branch whose results you see, or type a new name. Each branch keeps its own history and new-code baseline, so feature-branch results never mix with the main branch.']],
  ['analysisLog', 'project', T('bottom-panel', '.bottom-panel', '.bp-tabs'), ['project', 'panel:bottom', 'bottom:log'],
    ['분석 로그', '분석이 어떻게 진행됐는지는 아래 패널의 [분석 로그] 탭에서 봅니다. 읽은 파일 수, 언어별 줄 수, 엔진별 소요 시간, 건너뛴 파일과 경고가 기록됩니다. 분석 결과가 예상과 다르면 먼저 여기서 제외된 파일이 없는지 확인하세요.'],
    ['Analysis log', 'The [Analysis log] tab of the bottom panel shows how the analysis went: files read, lines per language, time per engine, skipped files and warnings. When a result looks wrong, check here first that no files were excluded.']],

  // ── 3. 화면 구성 ─────────────────────────────────────
  ['menubar', 'layout', T('menubar', '.menubar', '.menu-bar'), ['project'],
    ['메뉴 표시줄', '맨 위 메뉴 표시줄에는 파일·편집·이슈·품질·보기·도구·도움말 메뉴가 있습니다. 편집 메뉴에는 실행 취소(Ctrl+Z)와 다시 실행(Ctrl+Y)이 있고, 파일 메뉴에는 프로젝트 저장과 프로젝트 삭제가 있습니다. 저장하지 않은 변경이 있으면 제목에 ● 가 붙고, 끌 때 저장할지 묻습니다. 메뉴를 누르면 아이콘과 단축키가 함께 보이는 목록이 열리고, 한 메뉴가 열린 상태에서 옆 메뉴로 마우스를 옮기면 그 메뉴가 열립니다. 오른쪽 끝에는 테마와 언어 단추가 있습니다.'],
    ['Menu bar', 'The menu bar at the top holds File, Edit, Issues, Quality, View, Tools and Help. Edit has Undo (Ctrl+Z) and Redo (Ctrl+Y); File has Save project and Delete project. With unsaved changes the title shows ●, and closing the app asks whether to save them. A menu shows its items with icons and shortcuts; while one is open, moving the mouse to the next one opens it. The theme and language buttons are at the right end.']],
  ['toolbar', 'layout', T('toolbar', '.icon-toolbar'), ['project'],
    ['툴바', '툴바에는 자주 쓰는 일이 아이콘과 이름으로 모여 있습니다. 시작 화면, 열기, 저장(프로젝트 변경을 프로젝트 파일에, 저장하지 않은 변경이 있으면 점 표시), 분석, 실행 취소·다시 실행(되돌릴 작업 이름이 도움말로 보입니다), 개요·이슈·핫스팟·게이트 같은 화면 바로 가기, 브랜치 칸이 있고, 오른쪽에는 왼쪽·오른쪽·아래 패널을 켜고 끄는 단추가 있습니다. 지금 보고 있는 화면의 단추는 눌린 상태로 표시됩니다.'],
    ['Toolbar', 'The toolbar gathers frequent jobs with an icon and a label: the start page, open, save (this project’s changes to its project file, with a dot while some are unsaved), analyze, undo and redo (the tooltip names the action), shortcuts to views such as overview, issues, hotspots and gates, and the branch box. On the right are the buttons that show or hide the left, right and bottom panels. The button of the current view is shown pressed.']],
  ['navigation', 'layout', T('nav', '.dock.dock-left', '.sidenav'), ['project', 'panel:left'],
    ['왼쪽 탐색 패널', '왼쪽 [탐색] 패널은 모든 화면을 프로젝트·이슈·정밀 결함 분석·보안·규정·관리 묶음으로 보여 줍니다. 묶음 제목을 누르면 접히고 펼쳐지며, 위의 [모두 펼치기] / [모두 접기] 로 한꺼번에 바꿉니다. 이름 옆 숫자는 열린 이슈, 검토할 핫스팟, 남은 결함, 승인 대기 중인 예외 신청 수입니다.'],
    ['Left navigation panel', 'The left [Navigation] panel lists every view in groups: project, issues, Defect Analysis, security & compliance and administration. Click a group title to fold or unfold it, or use [Expand all] / [Collapse all] above. The numbers next to names are open issues, hotspots to review, outstanding defects and exception requests waiting for approval.']],
  ['navFold', 'layout', T('nav-group', '.nav-group', '.sidenav'), ['project', 'panel:left'],
    ['묶음 접기', '접힌 묶음에 지금 보는 화면이 있으면 제목 옆에 점이 표시되고, 묶음 안의 숫자는 합계로 보입니다. 쓰지 않는 묶음을 접어 두면 필요한 화면만 남겨 둘 수 있으며, 접은 상태는 다음 실행에도 유지됩니다.'],
    ['Folding groups', 'When the view you are on is inside a folded group, a dot appears next to the group title, and the group shows the sum of its counts. Fold the groups you do not use to keep only the views you need; the folding is kept for the next launch.']],
  ['centreTabs', 'layout', T('doc-tabs', '.doc-tabs', ...MAIN), ['project', 'view:overview', 'view:issues', 'view:measures'],
    ['가운데 탭', '연 화면은 가운데 영역 위쪽에 탭으로 쌓입니다. 탭을 누르면 그 화면으로 돌아가고, 탭의 ✕ 로 닫으며, 끌어서 순서를 바꿉니다. 탭이 많아 다 보이지 않으면 탭 줄 오른쪽 끝의 < > 단추로 넘겨 보고, 목록 단추로 열린 탭 전체를 골라 갈 수 있습니다. 시작 화면 탭은 맨 앞에 고정됩니다.'],
    ['Centre tabs', 'Each view you open becomes a tab above the centre area. Click a tab to go back to it, close it with its ✕ and drag it to reorder. When the tabs do not fit, the < > buttons at the right end of the tab row scroll them and the list button picks any open tab. The start page tab stays pinned first.']],
  ['tabNav', 'layout', T('doc-tab-nav', '.doc-tab-nav', '.doc-tabs'), ['project'],
    ['탭 넘기기 단추', '탭 줄 오른쪽 끝의 < 와 > 단추는 탭이 넘칠 때 나타나며, 누르면 한 칸씩, 누르고 있으면 계속 탭 줄을 넘깁니다. 마우스 휠로도 탭 줄을 옆으로 넘길 수 있습니다.'],
    ['Tab scroll buttons', 'The < and > buttons at the right end of the tab row appear when the tabs overflow: click to move one tab, hold to keep scrolling. The mouse wheel scrolls the tab row sideways too.']],
  ['rightPanel', 'layout', T('right-panel', '.dock.dock-right', '.inspector'), ['project', 'panel:right'],
    ['오른쪽 세부 정보 패널', '오른쪽 [세부 정보] 패널은 목록에서 고른 이슈·결함·핫스팟·규칙·파일의 자세한 내용을 보여 줍니다. 아무것도 고르지 않았을 때는 안내 문구가 보입니다. 패널 사이의 경계선을 끌면 너비가 바뀝니다.'],
    ['Right details panel', 'The right [Details] panel shows the full information of the issue, defect, hotspot, rule or file picked in a list. With nothing picked it shows a hint. Drag the border between panels to change its width.']],
  ['bottomPanel', 'layout', T('bottom-panel', '.bottom-panel', '.bp-tabs'), ['project', 'panel:bottom', 'bottom:problems'],
    ['아래 패널', '아래 패널에는 네 개의 탭이 있습니다. [문제] 는 지금 화면에 해당하는 이슈를 모아 보여 주고 누르면 그 위치로 이동합니다. [분석 로그] 는 마지막 분석의 기록, [작업] 은 진행 중인 분석·설치·예약 작업, [출력] 은 상태 표시줄에 나왔던 메시지 전체를 시간과 함께 보여 줍니다.'],
    ['Bottom panel', 'The bottom panel has four tabs. [Problems] gathers the issues for the current view and jumps to one when you click it. [Analysis log] is the record of the last analysis, [Jobs] lists running analyses, installs and scheduled jobs, and [Output] keeps every status-bar message with its time.']],
  ['bottomJobs', 'layout', T('bottom-panel', '.bottom-panel'), ['project', 'panel:bottom', 'bottom:jobs'],
    ['작업과 출력 탭', '[작업] 탭에서 오래 걸리는 일(분석, 도구 설치, 예약 실행)의 진행 상황과 다음 예약 시각을 확인합니다. [출력] 탭은 지나간 메시지를 다시 읽을 때 쓰며, [지우기] 로 비웁니다.'],
    ['Jobs and Output', 'The [Jobs] tab shows the progress of long tasks (analyses, tool installs, scheduled runs) and when the next scheduled run is. The [Output] tab lets you read past messages again; [Clear] empties it.']],
  ['panelToggle', 'layout', T('tb-panels', '.tb-panels', '.icon-toolbar'), ['project'],
    ['패널 켜기·끄기와 접기', '툴바 오른쪽의 세 단추로 왼쪽·오른쪽·아래 패널을 켜고 끕니다. 패널 머리의 접기 단추를 누르면 패널이 아이콘 띠로 접혀 화면을 넓게 쓸 수 있고, 띠의 아이콘을 누르면 다시 펼쳐집니다. 패널의 크기와 상태는 저장되어 다음 실행에도 그대로입니다.'],
    ['Showing, hiding and folding panels', 'The three buttons at the right of the toolbar show or hide the left, right and bottom panels. The fold button in a panel header folds it into a strip of icons to give the centre more room; click an icon on the strip to unfold it. Panel sizes and states are saved for the next launch.']],
  ['statusbar', 'layout', T('statusbar', '.statusbar'), ['project'],
    ['상태 표시줄', '맨 아래 상태 표시줄에는 프로젝트 이름과 경로, 마지막 메시지, 파일 수와 코드 줄 수, 품질 게이트 통과 여부가 보입니다. 오른쪽 아래 모서리를 끌면 창 크기가 바뀝니다.'],
    ['Status bar', 'The status bar at the bottom shows the project name and path, the last message, the number of files and lines of code, and whether the quality gate passed. Drag the bottom-right corner to resize the window.']],

  // ── 4. 개요와 품질 게이트 ────────────────────────────
  ['overview', 'overview', VIEW('overview'), ['project', 'view:overview'],
    ['개요 화면', '[개요] 는 분석 결과를 한눈에 보는 첫 화면입니다. 품질 게이트 결과, 신뢰성·보안·유지보수성 등급, 버그·취약점·코드 스멜·핫스팟 수, 커버리지와 중복률이 카드로 나옵니다. 카드를 누르면 해당 이슈 목록이나 측정값 화면으로 바로 이동합니다.'],
    ['Overview', 'The [Overview] is the first screen of a result: the quality gate, the reliability, security and maintainability ratings, the numbers of bugs, vulnerabilities, code smells and hotspots, coverage and duplication appear as cards. Click a card to go straight to that issue list or measure.']],
  ['qualityGate', 'overview', T('quality-gate', '.gate-card', ...VIEW('overview')), ['project', 'view:overview'],
    ['품질 게이트', '품질 게이트는 "새 코드의 신뢰성 등급이 A", "새 코드 커버리지 80% 이상" 같은 조건의 묶음입니다. 하나라도 어기면 [실패] 로 표시되고 어긴 조건과 실제 값이 함께 나옵니다. CI 에서는 게이트가 실패하면 빌드를 멈추게 할 수 있습니다. 게이트 조건은 품질 게이트 화면에서 바꿉니다.'],
    ['Quality gate', 'A quality gate is a set of conditions such as "reliability rating on new code is A" or "coverage on new code at least 80%". If any fails the gate shows [Failed] with the condition and the actual value. In CI a failed gate can stop the build. Conditions are edited in the Quality gates view.']],
  ['ratings', 'overview', T('ratings', '.rating-grid', ...VIEW('overview')), ['project', 'view:overview'],
    ['등급', '신뢰성(버그), 보안(취약점), 보안 검토(핫스팟), 유지보수성(기술 부채 비율) 등급은 A 부터 E 까지 공개된 코드 품질 척도로 매깁니다. 예를 들어 유지보수성은 코드 한 줄을 30분으로 보았을 때 고치는 데 드는 시간의 비율로 정해집니다.'],
    ['Ratings', 'The reliability (bugs), security (vulnerabilities), security review (hotspots) and maintainability (technical debt ratio) ratings run from A to E on the published code quality scale. Maintainability, for instance, is the remediation time as a ratio of 30 minutes per line of code.']],
  ['newCode', 'overview', T('new-code', '.new-code', ...VIEW('overview')), ['project', 'view:overview'],
    ['새 코드와 전체 코드', '각 카드의 윗줄은 전체 코드, 아랫줄은 새 코드의 값입니다. 새 코드는 기준(이전 분석, 지정한 날짜·버전, 기준 브랜치)보다 뒤에 생긴 이슈입니다. "새 코드를 깨끗하게" 원칙에 따라 품질 게이트는 주로 새 코드에 조건을 겁니다. 기준은 설정 › 새 코드에서 정합니다.'],
    ['New code and overall code', 'On each card the top line is overall code and the bottom line new code. New code means issues that appeared after the baseline (the previous analysis, a date or version, or a reference branch). Following "clean as you code", gates usually set their conditions on new code. The baseline is set in Settings › New code.']],

  // ── 5. 이슈 처리 ─────────────────────────────────────
  ['issues', 'issues', VIEW('issues'), ['project', 'view:issues'],
    ['이슈 목록', '[이슈] 화면은 버그·취약점·코드 스멜을 모두 모아 보여 줍니다. 위쪽 유형 탭으로 종류를 고르고, 목록의 줄마다 심각도, 유형, 규칙, 파일과 줄, 상태, 담당자가 나옵니다. 줄을 누르면 오른쪽 세부 정보 패널에 설명과 코드가 나타납니다.'],
    ['Issue list', 'The [Issues] view gathers every bug, vulnerability and code smell. Pick a kind with the type tabs at the top; each row shows severity, type, rule, file and line, status and assignee. Click a row to see its explanation and code in the right details panel.']],
  ['issueFilters', 'issues', T('issue-filters', '.view-toolbar', ...VIEW('issues')), ['project', 'view:issues'],
    ['검색과 필터', '목록 위의 검색 칸에 규칙 이름·파일·메시지를 적어 찾습니다. 심각도(차단·심각·주요·경미·정보), 상태, 엔진, 표준(OWASP·CWE·MISRA 등) 필터를 고를 수 있고, [새 코드만] 을 켜면 새로 생긴 이슈만 남습니다. 필터는 서로 겹쳐서 적용되며 [초기화] 로 한 번에 지웁니다.'],
    ['Search and filters', 'Type a rule name, file or message in the search box above the list. Filter by severity (blocker, critical, major, minor, info), status, engine and standard (OWASP, CWE, MISRA…), and switch on [New code only] to keep just new issues. Filters combine, and [Reset] clears them all.']],
  ['issueDetails', 'issues', T('right-panel', '.dock.dock-right', '.inspector'), ['project', 'view:issues', 'panel:right', 'click:[data-tour="issue-row"], .issue-row, main.main table tbody tr'],
    ['이슈 세부 정보', '이슈를 고르면 오른쪽 패널에 규칙 설명(왜 문제인지, 어떻게 고치는지), 문제가 된 코드 조각, 데이터 흐름 경로, 관련 표준(CWE·OWASP·CERT), 변경 기록과 댓글이 나옵니다. [코드 보기] 를 누르면 파일 전체에서 그 줄로 이동합니다.'],
    ['Issue details', 'When you pick an issue, the right panel shows the rule description (why it matters and how to fix it), the offending code, the data-flow path, related standards (CWE, OWASP, CERT), the change log and comments. [Show code] opens the whole file at that line.']],
  ['issueStatus', 'issues', T('issue-actions', '.issue-actions', '.dock.dock-right', '.inspector'), ['project', 'view:issues', 'panel:right', 'click:[data-tour="issue-row"], .issue-row, main.main table tbody tr'],
    ['확인·수락·오탐 처리', '이슈의 상태를 바꿔 처리합니다. [확인] 은 실제 문제임을 인정하는 것이고, [수락] 은 알고도 그대로 두기로 한 것, [오탐] 은 규칙이 잘못 짚은 것입니다. 고친 이슈는 다음 분석에서 자동으로 [해결됨] 이 됩니다. 목록에서 여러 줄을 체크하면 한꺼번에 처리할 수 있습니다.'],
    ['Confirm, accept, false positive', 'Change an issue\'s status to handle it. [Confirm] says it is a real problem, [Accept] means you knowingly leave it, and [False positive] means the rule was wrong. Fixed issues become [Resolved] by themselves at the next analysis. Tick several rows to change them all at once.']],
  ['issueAssign', 'issues', T('issue-actions', '.issue-actions', '.dock.dock-right', '.inspector'), ['project', 'view:issues', 'panel:right', 'click:[data-tour="issue-row"], .issue-row, main.main table tbody tr'],
    ['담당자·태그·댓글', '세부 정보 패널에서 담당자를 지정하고, 태그(예: security, perf)를 붙이며, 댓글로 팀원과 이야기합니다. 태그는 검색과 필터에 쓰이고, 담당자를 정하면 알림 설정에 따라 메일이 갑니다. 모든 변경은 이슈의 변경 기록에 남습니다.'],
    ['Assignee, tags and comments', 'In the details panel, assign the issue, add tags (such as security or perf) and discuss it in comments. Tags work in search and filters, and an assignee gets an e-mail when notifications are set up. Every change is kept in the issue\'s change log.']],
  ['issueException', 'issues', T('issue-review', '.issue-actions', '.dock.dock-right', '.inspector'), ['project', 'view:issues', 'panel:right', 'click:[data-tour="issue-row"], .issue-row, main.main table tbody tr'],
    ['예외 신청', '승인 절차를 켜 두면(설정 › 분석) 오탐이나 수락은 바로 바뀌지 않고 [예외 신청] 이 됩니다. 이유를 적어 신청하면 승인자에게 알림이 가고, 승인될 때까지 이슈는 열린 상태로 남습니다. 탐색 패널의 [예외 승인] 옆 숫자가 대기 중인 신청 수입니다.'],
    ['Exception requests', 'When approval is on (Settings › Analysis), false positive and accept do not apply at once — they become an [Exception request]. Write the reason and submit; the approvers are notified and the issue stays open until the request is approved. The number next to [Exception approval] in the navigation shows waiting requests.']],
  ['approvals', 'issues', VIEW('approvals'), ['project', 'view:approvals'],
    ['예외 승인', '[예외 승인] 화면에는 들어온 예외 신청이 모입니다. 신청 이유와 코드를 보고 [승인] 하거나 [반려] 합니다. 반려할 때는 이유를 반드시 적어야 하며, 신청자에게 결과가 알려집니다. 처리 내역은 감사 로그에도 남습니다.'],
    ['Exception approval', 'The [Exception approval] view gathers incoming requests. Read the reason and the code, then [Approve] or [Reject]. A rejection needs a reason, and the requester is told the result. Decisions are also kept in the audit log.']],
  ['issueTicket', 'issues', T('issue-ticket', '.issue-actions', '.dock.dock-right', '.inspector'), ['project', 'view:issues', 'panel:right', 'click:[data-tour="issue-row"], .issue-row, main.main table tbody tr'],
    ['티켓 만들기', '[티켓 만들기] 는 고른 이슈로 Jira·Redmine·GitHub·GitLab·Azure DevOps·Bitbucket 이슈를 만듭니다. 만든 티켓 번호는 이슈의 외부 참조로 붙어 목록에서 바로 열 수 있습니다. 트래커 주소와 토큰은 관리 › 연동에서 한 번 넣어 둡니다.'],
    ['Creating tickets', '[Create ticket] files the selected issues in Jira, Redmine, GitHub, GitLab, Azure DevOps or Bitbucket. The ticket number is attached to the issue as an external reference and opens from the list. Tracker addresses and tokens are entered once in Administration › Integrations.']],
  ['problemsTab', 'issues', T('bottom-panel', '.bottom-panel'), ['project', 'view:issues', 'panel:bottom', 'bottom:problems'],
    ['문제 탭으로 이동', '아래 패널의 [문제] 탭은 지금 화면과 관련된 이슈를 짧게 보여 줍니다. 코드 화면에서는 열린 파일의 이슈만, 개요에서는 심각한 이슈부터 나옵니다. 줄을 누르면 해당 이슈나 코드 위치로 이동합니다.'],
    ['Jumping from the Problems tab', 'The [Problems] tab of the bottom panel lists the issues that belong to the current view: only the open file\'s issues in the code view, the most severe first in the overview. Click a row to jump to the issue or the code line.']],

  // ── 6. AI 코드 수정 ──────────────────────────────────
  ['aiFix', 'aifix', T('ai-fix', '.ai-box', '.dock.dock-right', '.inspector'), ['project', 'view:issues', 'panel:right', 'click:[data-tour="issue-row"], .issue-row, main.main table tbody tr', 'scroll:[data-tour="ai-fix"], .ai-box'],
    ['AI로 수정 제안', '이슈 세부 정보의 [AI로 수정 제안] 을 누르면, 규칙 설명과 이슈 주변 코드를 AI 모델에 보내 수정안을 받습니다. 수정안에는 무엇을 왜 바꾸는지에 대한 설명과 확신 정도(높음·보통·낮음), 사용한 토큰 수가 함께 나옵니다. 자동으로 고치기 어려운 이슈는 설명만 돌아옵니다.'],
    ['Asking AI for a fix', 'Press [Suggest a fix with AI] in the issue details: the rule description and the code around the issue go to the AI model, which returns a proposed change with an explanation, a confidence (high, medium, low) and the tokens used. When an issue cannot be fixed automatically you get the explanation only.']],
  ['aiDiff', 'aifix', T('ai-diff', '.ai-proposal', '.ai-box', '.inspector'), ['project', 'view:issues', 'panel:right', 'click:[data-tour="issue-row"], .issue-row, main.main table tbody tr', 'scroll:[data-tour="ai-fix"], .ai-box'],
    ['변경 내용 확인과 적용', '수정안은 지울 줄(−)과 넣을 줄(+)로 나눈 변경 내용(diff)으로 보입니다. 내용을 확인한 뒤 [적용] 을 누르면 소스 파일에 씁니다. 그사이 파일이 바뀌었으면 적용을 멈추고 다시 요청하라고 알려 줍니다. 적용한 뒤 [다시 분석] 으로 이슈가 사라졌는지 확인하세요.'],
    ['Reviewing and applying the diff', 'The proposal is shown as a diff of lines to remove (−) and add (+). After checking it, [Apply] writes it to the source file. If the file changed in the meantime, applying stops and asks you to request again. Afterwards use [Analyze again] to confirm the issue is gone.']],
  ['aiSettings', 'aifix', SETTINGS('ai'), ['project', 'act:settings:ai', 'wait:400'],
    ['AI 제공자와 모델', 'AI 코드 수정은 설정 › AI 코드 수정에서 켭니다. 제공자는 Anthropic Claude, OpenAI 호환 서버, Ollama(로컬) 중에서 고르고, 모델, 추론 노력, 최대 토큰, 주변 코드 줄 수, 제한 시간, 설명 언어를 정합니다. [연결 시험] 으로 설정이 맞는지 바로 확인할 수 있습니다.'],
    ['AI provider and model', 'AI code fix is switched on in Settings › AI code fix. Choose the provider — Anthropic Claude, an OpenAI-compatible server or Ollama (local) — then the model, reasoning effort, maximum tokens, lines of surrounding code, time limit and explanation language. [Test connection] checks the setup at once.']],
  ['aiPrivacy', 'aifix', SETTINGS('ai'), ['project', 'act:settings:ai', 'wait:400'],
    ['개인 정보', '원격 제공자를 쓰면 이슈 주변 코드와 규칙 설명이 그 제공자에게 전송됩니다. 코드가 회사 밖으로 나가면 안 되는 경우 Ollama 를 고르면 이 컴퓨터(또는 지정한 사내 서버)에서만 실행됩니다. API 키를 비워 두면 ANTHROPIC_API_KEY 환경 변수나 로그인 프로필을 씁니다.'],
    ['Privacy', 'With a remote provider, the code around the issue and the rule description are sent to that provider. When code must not leave the company, choose Ollama: it runs on this computer (or a server you name). Leave the API key empty to use the ANTHROPIC_API_KEY environment variable or your login profile.']],

  // ── 7. 코드 살펴보기 ─────────────────────────────────
  ['hotspots', 'explore', VIEW('hotspots'), ['project', 'view:hotspots'],
    ['보안 핫스팟', '[보안 핫스팟] 은 반드시 취약점은 아니지만 사람이 검토해야 하는 보안 민감 코드입니다(예: 약한 해시, 쿠키 설정, 명령 실행). 핫스팟마다 위험도와 검토 방법이 나오며, 검토한 뒤 [안전함], [수정됨], [확인 필요] 로 표시합니다. 검토율은 보안 검토 등급에 반영됩니다.'],
    ['Security hotspots', '[Security hotspots] are security-sensitive code that is not necessarily vulnerable but needs a human review (weak hashing, cookie settings, command execution…). Each shows its risk and how to review it; after reviewing, mark it [Safe], [Fixed] or [To review]. The share reviewed sets the security review rating.']],
  ['measures', 'explore', VIEW('measures'), ['project', 'view:measures'],
    ['측정값', '[측정값] 화면은 크기(파일·줄·함수), 복잡도(순환·인지), 중복, 커버리지, 이슈 수, 기술 부채를 영역별로 보여 줍니다. 파일이나 폴더 단위로 내려가 어디에 문제가 몰려 있는지 찾을 수 있습니다.'],
    ['Measures', 'The [Measures] view shows size (files, lines, functions), complexity (cyclomatic and cognitive), duplication, coverage, issue counts and technical debt by domain. Drill down by folder and file to see where problems gather.']],
  ['code', 'explore', VIEW('code'), ['project', 'view:code'],
    ['코드 보기', '[코드] 화면은 프로젝트 파일 트리와 소스를 보여 줍니다. 이슈가 있는 줄에는 표시가 붙고, 표시를 누르면 이슈 설명이 열립니다. 커버리지 정보가 있으면 줄마다 덮인 줄과 덮이지 않은 줄이 색으로 구분됩니다.'],
    ['Code view', 'The [Code] view shows the project file tree and the source. Lines with issues are marked; click a mark to open the issue. With coverage data, covered and uncovered lines are coloured.']],
  ['duplications', 'explore', VIEW('duplications'), ['project', 'view:duplications'],
    ['중복', '[중복] 화면은 같은 코드 블록이 여러 곳에 있는 경우를 찾아 블록과 위치를 짝지어 보여 줍니다. 중복률이 높은 파일부터 정렬되며, 블록을 누르면 두 위치를 나란히 비교합니다.'],
    ['Duplications', 'The [Duplications] view finds blocks of code repeated in several places and pairs each block with its locations. Files with the highest duplication come first; click a block to compare its places side by side.']],
  ['activity', 'explore', VIEW('activity'), ['project', 'view:activity'],
    ['활동', '[활동] 화면은 분석할 때마다 바뀐 이슈 수, 등급, 커버리지, 품질 게이트 결과를 시간 순서의 그래프와 이벤트로 보여 줍니다. 버전이나 게이트 상태가 바뀐 때가 표시되어 품질이 언제 나빠졌는지 찾기 쉽습니다.'],
    ['Activity', 'The [Activity] view charts issue counts, ratings, coverage and gate results over the analyses, with events marking new versions and gate changes — handy for finding when quality dropped.']],
  ['snapshots', 'explore', VIEW('snapshots'), ['project', 'view:snapshots'],
    ['스냅샷', '커밋한 분석마다 스냅샷이 남습니다(최근 12개). [스냅샷] 화면에서 두 스냅샷을 골라 결함(CID)과 이슈를 비교하면 새로 생긴 것, 고쳐진 것, 그대로인 것이 나뉘어 보입니다. 결함이 처음 생긴 시점과 수명도 확인할 수 있습니다.'],
    ['Snapshots', 'Each committed analysis leaves a snapshot (the last 12 are kept). In [Snapshots], pick two and compare their defects (CIDs) and issues: new, fixed and unchanged ones are split. You also see when a defect first appeared and how long it lived.']],

  // ── 8. Defect Analysis ──────────────────────────────────────
  ['defects', 'defectAnalysis', VIEW('defects'), ['project', 'view:defects'],
    ['결함 목록', '[결함] 화면은 정밀 결함 분석의 결함 목록입니다. 결함마다 CID, 검사기, 영향도, 범주, 파일과 함수, 분류와 조치가 나옵니다. 결함을 누르면 문제가 생기는 실행 경로(이벤트 경로)가 단계별로 나오고, 각 이벤트를 누르면 코드의 그 줄로 이동합니다.'],
    ['Defect list', 'The [Defects] view is a defect-analysis list. Each defect has a CID, checker, impact, category, file and function, classification and action. Click one to see the event path that leads to the problem step by step; click an event to jump to that line.']],
  ['triage', 'defectAnalysis', T('defect-triage', '.triage', '.dock.dock-right', ...VIEW('defects')), ['project', 'view:defects', 'click:[data-tour="defect-row"], main.main table tbody tr'],
    ['분류(triage)', '결함을 고르면 분류(triage) 입력이 나옵니다. 분류(미분류·보류·버그·오탐·의도됨), 심각도, 조치(수정 필요·무시 등), 담당자, 외부 참조, 댓글을 정해 [저장] 합니다. 같은 CID 는 다음 분석에서도 분류가 유지되며, 여러 결함을 골라 한꺼번에 분류할 수도 있습니다.'],
    ['Triage', 'Picking a defect shows the triage fields: classification (unclassified, pending, bug, false positive, intentional), severity, action (fix required, ignore…), owner, external reference and comment; then [Save]. Triage stays with the CID in later analyses, and several defects can be triaged at once.']],
  ['streams', 'defectAnalysis', VIEW('streams'), ['project', 'view:streams'],
    ['스트림', '[스트림] 화면은 브랜치나 제품 라인별로 커밋된 스냅샷을 보여 줍니다. 커밋할 때마다 스냅샷이 쌓이고, 두 스냅샷의 CID 를 비교해 새 결함과 사라진 결함을 확인합니다. [데스크톱] 분석은 스트림을 바꾸지 않습니다.'],
    ['Streams', 'The [Streams] view shows the committed snapshots per branch or product line. Every commit adds a snapshot, and comparing two snapshots\' CIDs shows new and eliminated defects. A [Desktop] analysis leaves the stream unchanged.']],
  ['components', 'defectAnalysis', VIEW('components'), ['project', 'view:components'],
    ['컴포넌트', '[컴포넌트] 화면에서 경로 패턴으로 코드를 컴포넌트(예: UI, 네트워크, 서드파티)로 나눕니다. 결함은 컴포넌트별로 묶여 보이고, 서드파티 코드처럼 관심 없는 컴포넌트는 결과에서 뺄 수 있습니다.'],
    ['Components', 'In [Components], split the code into components (UI, network, third party…) by path patterns. Defects are grouped per component, and components you do not care about, such as third-party code, can be left out of the results.']],
  ['policies', 'defectAnalysis', VIEW('policies'), ['project', 'view:policies'],
    ['정책', '[정책] 은 정밀 결함 분석의 품질 게이트입니다. "영향도 높음 결함 0개", "미분류 결함 10개 이하" 같은 조건을 정하고 프로젝트에 지정하면, 분석할 때마다 정책 통과 여부가 상태 표시줄과 보고서에 나옵니다.'],
    ['Policies', '[Policies] are the quality gates of defect analysis. Set conditions such as "no high-impact defects" or "at most 10 unclassified defects", assign the policy to the project, and every analysis reports whether it passes in the status bar and reports.']],
  ['models', 'defectAnalysis', VIEW('models'), ['project', 'view:models'],
    ['함수 모델', '[함수 모델] 은 분석기가 소스를 볼 수 없는 라이브러리 함수의 동작을 알려 줍니다. 예를 들어 "이 함수는 메모리를 해제한다", "이 함수는 null 을 돌려줄 수 있다", "이 값은 오염된 입력이다" 를 등록하면 누수·null 역참조·주입 결함을 더 정확히 찾습니다.'],
    ['Function models', '[Function models] tell the analyser how library functions it cannot see behave: "this frees memory", "this can return null", "this value is tainted input". With models, leaks, null dereferences and injections are found more precisely.']],
  ['covCli', 'defectAnalysis', VIEW('defects'), ['project', 'view:defects'],
    ['cov 명령줄', 'C/C++ 프로젝트는 node scripts/defect-cli.mjs 로 빌드를 캡처합니다. cov build -- make 로 컴파일 명령을 가로채 분석 대상을 모으고, cov analyze 로 분석, cov commit 으로 스트림에 커밋합니다. 결과는 이 결함 화면에서 그대로 봅니다.'],
    ['The cov command line', 'For C/C++ projects, node scripts/defect-cli.mjs captures the build for defect analysis: cov build -- make intercepts the compile commands, cov analyze runs the analysis and cov commit commits to a stream. The results show up in this defects view.']],

  // ── 9. 보안·규정 준수 ────────────────────────────────
  ['compliance', 'compliance', VIEW('compliance'), ['project', 'view:compliance'],
    ['보안 보고서', '[보안 보고서] 화면은 이슈를 보안 표준의 항목별로 다시 묶어 보여 줍니다. OWASP Top 10(2017·2021), CWE Top 25, PCI DSS, 한국 행정안전부 소프트웨어 보안 약점 49개 항목, 주요정보통신기반시설 기술적 취약점 점검 항목을 고를 수 있습니다. 항목마다 이슈 수와 등급이 나오고, 누르면 해당 이슈 목록으로 내려갑니다.'],
    ['Security reports', 'The [Security reports] view regroups issues by the items of a security standard: OWASP Top 10 (2017 and 2021), CWE Top 25, PCI DSS, the Korean MOIS 49 software security weaknesses and the Korean critical information infrastructure checklist. Each item shows its count and rating; click it to drill into the issues.']],
  ['mois', 'compliance', T('compliance-standard', '.view-toolbar', ...VIEW('compliance')), ['project', 'view:compliance'],
    ['한국 행안부 49 와 주요정보통신기반시설', '한국 행안부 49 점검은 입력 데이터 검증, 보안 기능, 시간 및 상태, 에러 처리, 코드 오류, 캡슐화, API 오용의 일곱 분류로 나뉩니다. 공공 사업의 보안 약점 진단에서 이 화면의 결과를 그대로 증적으로 쓸 수 있고, 보고서 화면에서 문서로 내보낼 수 있습니다.'],
    ['Korea MOIS 49 and critical infrastructure', 'The Korea MOIS 49 checklist is split into seven groups: input validation, security features, time and state, error handling, code errors, encapsulation and API misuse. Results here serve as evidence in Korean public-sector security weakness assessments and can be exported as documents from the Reports view.']],
  ['misra', 'compliance', VIEW('misra'), ['project', 'view:misra'],
    ['MISRA·CERT·AUTOSAR 준수', '[MISRA 준수] 화면은 MISRA C:2012/2023, MISRA C++:2023, AUTOSAR C++14, SEI CERT C/C++/Java 지침별 준수 매트릭스를 보여 줍니다. MISRA Compliance:2020 방식으로 지침 준수 요약(GCS), 재분류 계획(GRP), 편차(deviation) 기록을 관리하고, 준수·위반·편차·미적용을 지침마다 확인합니다.'],
    ['MISRA, CERT and AUTOSAR compliance', 'The [MISRA compliance] view shows a compliance matrix per guideline for MISRA C:2012/2023, MISRA C++:2023, AUTOSAR C++14 and SEI CERT C/C++/Java. Following MISRA Compliance:2020 it manages the guideline compliance summary (GCS), the re-categorisation plan (GRP) and deviation records, and shows compliant, violated, deviated and not applicable per guideline.']],
  ['deviations', 'compliance', T('misra-deviations', '.view-toolbar', ...VIEW('misra')), ['project', 'view:misra'],
    ['편차와 재분류', '지키기 어려운 지침은 편차를 등록합니다. 근거, 위험 평가, 승인자를 적으면 해당 위반은 [편차] 로 집계됩니다. 재분류 계획에서는 지침의 범주를 더 엄격하게만(권고 → 요구 → 필수) 바꿀 수 있습니다. 결과는 준수 보고서로 내보냅니다.'],
    ['Deviations and re-categorisation', 'Register a deviation for a guideline you cannot follow: with its rationale, risk assessment and approver, the violations count as [Deviated]. The re-categorisation plan can only make a category stricter (advisory → required → mandatory). Export the result as a compliance report.']],
  ['his', 'compliance', VIEW('his'), ['project', 'view:his'],
    ['HIS 메트릭', '[HIS 메트릭] 화면은 자동차 업계의 HIS 소스 코드 메트릭(주석 비율, 경로 수, goto 수, 순환 복잡도, 호출 수, 매개변수 수, 반환 지점 수, 중첩 깊이 등)을 함수마다 계산하고, 권장 한계를 넘는 함수를 빨갛게 표시합니다. 함수를 누르면 코드로 이동합니다.'],
    ['HIS metrics', 'The [HIS metrics] view computes the automotive HIS source code metrics per function — comment ratio, paths, gotos, cyclomatic complexity, calls, parameters, return points, nesting depth and more — and marks functions over the recommended limits in red. Click a function to open its code.']],
  ['arch', 'compliance', VIEW('arch'), ['project', 'view:arch'],
    ['아키텍처', '[아키텍처] 화면은 모듈과 파일 사이의 의존 관계를 그래프로 그립니다. 순환 의존, 계층 규칙 위반(예: UI → DB 직접 호출)을 찾아 표시하고, 허용할 의존 방향을 규칙으로 정해 두면 분석할 때마다 위반을 이슈로 올립니다.'],
    ['Architecture', 'The [Architecture] view draws the dependencies between modules and files as a graph. It flags dependency cycles and layer violations (such as UI calling the database directly); define the allowed directions as rules and each analysis raises violations as issues.']],

  // ── 10. 의존성·웹 스캔·풀 리퀘스트 ────────────────────
  ['dependencies', 'supply', VIEW('dependencies'), ['project', 'view:dependencies'],
    ['의존성(SCA)', '[의존성] 화면은 package.json, pom.xml, requirements.txt, go.mod 같은 매니페스트와 잠금 파일에서 라이브러리를 읽어 알려진 취약점(오프라인 OSV 권고)과 라이선스를 맞춰 봅니다. 취약한 버전, 고친 버전, 실제로 호출되는지(도달성)가 함께 나옵니다.'],
    ['Dependencies (SCA)', 'The [Dependencies] view reads libraries from manifests and lock files (package.json, pom.xml, requirements.txt, go.mod…) and matches them with known vulnerabilities (offline OSV advisories) and licences. It shows the vulnerable version, the fixed version and whether the code actually reaches it.']],
  ['sbom', 'supply', T('sbom-export', '.view-toolbar', ...VIEW('dependencies')), ['project', 'view:dependencies'],
    ['SBOM 내보내기', '[SBOM 내보내기] 는 소프트웨어 구성 명세(SBOM)를 CycloneDX 또는 SPDX 형식으로 저장합니다. 고객이나 감사에 납품물의 구성 요소 목록을 제출할 때 씁니다. 라이선스 정책을 정해 두면 금지 라이선스도 이슈로 표시됩니다.'],
    ['Exporting an SBOM', '[Export SBOM] saves a software bill of materials in CycloneDX or SPDX format, for handing the component list of a delivery to customers or auditors. With a licence policy, forbidden licences are flagged as issues too.']],
  ['dast', 'supply', VIEW('dast'), ['project', 'view:dast'],
    ['웹 스캔(DAST)', '[웹 스캔] 은 실행 중인 웹 애플리케이션을 바깥에서 점검합니다. 대상 주소와 범위, 로그인 방법(폼·토큰·쿠키)을 정하고 스캔하면 페이지를 돌아다니며 XSS, SQL 주입, 보안 헤더 누락, 쿠키 설정 같은 문제를 찾습니다. 허락받은 대상에만 사용하세요.'],
    ['Web scan (DAST)', '[Web scan] tests a running web application from outside. Set the target address, scope and login method (form, token or cookie) and start: it crawls the pages and finds XSS, SQL injection, missing security headers, cookie settings and more. Only scan targets you are allowed to test.']],
  ['pullRequest', 'supply', VIEW('pullrequest'), ['project', 'view:pullrequest'],
    ['풀 리퀘스트 분석', '[풀 리퀘스트] 화면은 기준 브랜치와 비교해 PR 에서 바뀐 코드의 이슈만 보여 줍니다. PR 전용 품질 게이트 결과가 나오고, 연동을 설정해 두면 GitHub·GitLab·Azure DevOps·Bitbucket 의 PR 에 요약 댓글과 줄별 댓글(데코레이션)을 게시합니다.'],
    ['Pull request analysis', 'The [Pull request] view compares with the target branch and shows only the issues in the code the PR changed, with a PR quality gate. With an integration set up, it posts a summary and line comments (decoration) on the PR in GitHub, GitLab, Azure DevOps or Bitbucket.']],

  // ── 11. 보고서 ───────────────────────────────────────
  ['reports', 'reports', VIEW('reports'), ['project', 'view:reports'],
    ['보고서', '[보고서] 화면에서 경영 요약, 보안, 무결성, 규칙 세트, SBOM, 준수 보고서 등을 고르고 미리 봅니다. 대상 브랜치와 표준(예: OWASP Top 10 2021)을 정할 수 있으며, 미리 보기는 저장될 문서와 같은 모양입니다.'],
    ['Reports', 'In the [Reports] view choose an executive summary, security, integrity, rule set, SBOM or compliance report and preview it. Pick the branch and the standard (OWASP Top 10 2021, for example); the preview looks just like the saved document.']],
  ['reportFormats', 'reports', T('report-formats', '.view-toolbar', ...VIEW('reports')), ['project', 'view:reports'],
    ['형식과 규제 보고서', '보고서는 HTML·CSV·Word(.docx)·Excel(.xlsx)·PDF 로 저장하거나 바로 인쇄합니다. [규제 보고서 (ZIP)] 는 경영·보안·무결성·규칙 세트·SBOM 보고서 PDF 와 이슈 목록 Excel 을 ZIP 하나로 묶어 감사 제출용 묶음을 한 번에 만듭니다. 파일 › 내보내기에는 SARIF 와 품질 게이트 배지도 있습니다.'],
    ['Formats and regulatory report', 'Save reports as HTML, CSV, Word (.docx), Excel (.xlsx) or PDF, or print them. [Regulatory report (ZIP)] bundles the executive, security, integrity, rule-set and SBOM PDFs with the issue list in Excel into one ZIP for audits. File › Export also offers SARIF and a quality gate badge.']],

  // ── 12. 규칙·프로파일·게이트 ─────────────────────────
  ['rules', 'quality', VIEW('rules'), ['project', 'view:rules'],
    ['규칙', '[규칙] 화면에는 4,000개가 넘는 규칙이 언어·유형·심각도·태그·표준별로 정리되어 있습니다. 규칙을 누르면 설명, 잘못된 예와 고친 예, 관련 CWE·OWASP·CERT·MISRA 항목이 나옵니다. 정규식으로 나만의 규칙을 만들 수도 있습니다(도구 › 사용자 규칙).'],
    ['Rules', 'The [Rules] view lists more than 4,000 rules by language, type, severity, tag and standard. Click a rule for its description, a non-compliant and a compliant example, and the related CWE, OWASP, CERT and MISRA items. You can also write your own regex rule (Tools › Custom rule).']],
  ['profiles', 'quality', VIEW('profiles'), ['project', 'view:profiles'],
    ['품질 프로파일', '[품질 프로파일] 은 언어별로 어떤 규칙을 켤지 정한 묶음입니다. 기본 프로파일을 상속해 필요한 규칙만 켜고 끄면 기본이 바뀔 때 자동으로 따라갑니다. 프로젝트마다 언어별 프로파일을 지정하며, 변경 기록이 남습니다.'],
    ['Quality profiles', 'A [Quality profile] is the set of rules switched on for a language. Inherit from the built-in profile and only switch rules on or off, so later changes to the parent follow automatically. Assign a profile per language to each project; changes are logged.']],
  ['profileCompare', 'quality', T('profile-tools', '.view-toolbar', ...VIEW('profiles')), ['project', 'view:profiles'],
    ['프로파일 비교와 백업', '[비교] 는 두 프로파일에서 한쪽에만 켜진 규칙과 심각도가 다른 규칙을 보여 줍니다. [백업] 은 프로파일을 XML 로 저장하고 [복원] 은 다시 불러옵니다. 다른 컴퓨터나 코드 품질 서버의 프로파일을 옮길 때 씁니다.'],
    ['Comparing and backing up profiles', '[Compare] shows the rules active in only one of two profiles and those with different severities. [Back up] saves a profile as XML and [Restore] loads it again — useful to move profiles between computers or from a code quality server.']],
  ['gates', 'quality', VIEW('gates'), ['project', 'view:gates'],
    ['품질 게이트 편집', '[품질 게이트] 화면에서 게이트를 만들고 조건(측정값, 비교, 기준값, 새 코드 여부)을 더하거나 뺍니다. 하나를 기본 게이트로 정하고 프로젝트마다 다른 게이트를 지정할 수 있습니다. 바꾼 조건은 다음 분석부터 적용됩니다.'],
    ['Editing quality gates', 'In [Quality gates], create gates and add or remove conditions (metric, operator, threshold, new code or overall). Make one the default and assign other gates to individual projects. Changed conditions apply from the next analysis.']],
  ['portfolios', 'quality', VIEW('portfolios'), ['project', 'view:portfolios'],
    ['포트폴리오', '[포트폴리오] 는 여러 프로젝트를 묶어 품질 게이트 상태와 등급을 함께 봅니다. 제품군이나 팀 단위로 묶어 두면 어느 프로젝트가 기준을 못 넘었는지 한 화면에서 확인할 수 있습니다.'],
    ['Portfolios', 'A [Portfolio] groups projects to see their gate status and ratings together. Group them by product line or team and see at a glance which project fails.']],
  ['tasks', 'quality', VIEW('tasks'), ['project', 'view:tasks'],
    ['백그라운드 작업', '[백그라운드 작업] 화면에는 지금까지의 스캔이 작업으로 기록됩니다. 시작·끝 시각, 걸린 시간, 품질 게이트 결과, 실패한 경우 오류 메시지가 남아 CI 에서 올라온 분석까지 추적할 수 있습니다.'],
    ['Background tasks', 'The [Background tasks] view records every scan as a task with its start and end time, duration, gate result and, on failure, the error — including analyses uploaded from CI.']],

  // ── 13. 관리 ─────────────────────────────────────────
  ['adminUsers', 'admin', VIEW('admin'), ['project', 'act:adminTab:security'],
    ['사용자와 권한', '관리 › [사용자 · 권한] 탭에서 사용자와 그룹을 만들고 권한을 줍니다. 전역 권한(관리, 게이트 관리, 프로파일 관리, 스캔)과 프로젝트 권한(보기, 코드 보기, 이슈 관리, 핫스팟 관리)을 나눠 정합니다. 권한을 켜면 시작할 때 로그인 화면이 나오고, CI 업로드용 토큰도 여기서 발급합니다.'],
    ['Users and permissions', 'In the Administration › [Users & permissions] tab, create users and groups and grant permissions: global ones (administer, gate admin, profile admin, scan) and per-project ones (browse, see code, administer issues, administer hotspots). With permissions on, a login screen appears at start; tokens for CI uploads are issued here too.']],
  ['adminWebhooks', 'admin', VIEW('admin'), ['project', 'act:adminTab:webhooks'],
    ['웹훅', '[웹훅] 은 분석이 끝날 때마다 결과(품질 게이트 상태, 이슈 수)를 지정한 주소로 JSON 으로 보냅니다. 비밀 값으로 서명을 붙일 수 있고, 최근 전송 내역과 응답 코드를 확인하며 [시험 전송] 으로 연결을 점검합니다.'],
    ['Webhooks', '[Webhooks] send the result (gate status, issue counts) as JSON to an address after every analysis. A secret signs the payload; check recent deliveries and response codes, and use [Test] to try the connection.']],
  ['adminExternal', 'admin', VIEW('admin'), ['project', 'act:adminTab:external'],
    ['외부 이슈 가져오기', '[외부 이슈] 탭은 SARIF, 호환 일반 이슈 JSON, 결함 JSON, cppcheck, clang-tidy, ESLint, Pylint, Checkstyle, SpotBugs, PMD, gosec, Bandit, Semgrep 결과 파일을 읽어 이슈로 합칩니다. 다른 도구의 결과도 같은 목록과 품질 게이트에서 함께 관리할 수 있습니다.'],
    ['Importing external issues', 'The [External issues] tab reads result files from SARIF, generic issue JSON, defect JSON, cppcheck, clang-tidy, ESLint, Pylint, Checkstyle, SpotBugs, PMD, gosec, Bandit and Semgrep and merges them as issues, so other tools\' findings share the same list and quality gate.']],
  ['adminTests', 'admin', VIEW('admin'), ['project', 'act:adminTab:tests'],
    ['테스트 보고서와 커버리지', '[테스트 보고서] 탭은 JUnit XML 이나 호환 일반 테스트 실행 XML 을 가져와 다음 분석부터 테스트 지표를 측정값에 넣습니다. 커버리지는 [분석 설정] 탭에서 LCOV·Cobertura·JaCoCo·Clover·OpenCover·Go cover 파일 경로를 적어 둡니다. 커버리지는 개요의 커버리지 카드, 코드 화면의 줄 색, 품질 게이트의 커버리지 조건에 쓰입니다.'],
    ['Test reports and coverage', 'The [Test reports] tab imports JUnit XML or generic test execution XML, so test metrics join the measures from the next analysis. For coverage, list the LCOV, Cobertura, JaCoCo, Clover, OpenCover or Go cover files in the [Analysis settings] tab. Coverage feeds the overview coverage card, the line colours in the code view and the gate\'s coverage conditions.']],
  ['adminSchedules', 'admin', VIEW('admin'), ['project', 'act:adminTab:schedules'],
    ['예약 분석', '[예약 분석] 은 정해진 시각(매일·매주·간격)에 코드 분석이나 웹 스캔을 자동으로 실행합니다. 대상 프로젝트와 브랜치, 시각을 정해 [새 예약] 으로 만들고, 다음 실행 시각은 아래 패널의 작업 탭에서도 볼 수 있습니다.'],
    ['Scheduled analysis', '[Schedules] run a code analysis or web scan automatically at set times (daily, weekly or every few hours). Create one with [New schedule] by choosing the project, branch and time; the next run also shows in the Jobs tab of the bottom panel.']],
  ['adminAudit', 'admin', VIEW('admin'), ['project', 'act:adminTab:audit'],
    ['감사 로그', '[감사 로그] 는 누가 언제 무엇을 바꿨는지(로그인, 권한 변경, 이슈 상태, 예외 승인, 설정 변경)를 기록합니다. 기간과 사용자로 걸러 보고 CSV 로 내보낼 수 있으며, 보관 기간은 설정 › 고급에서 정합니다.'],
    ['Audit log', 'The [Audit log] records who changed what and when — logins, permission changes, issue statuses, exception approvals, settings. Filter by period and user, export as CSV, and set the retention in Settings › Advanced.']],
  ['adminIntegrations', 'admin', VIEW('admin'), ['project', 'act:adminTab:integrations'],
    ['연동', '[연동] 에서 메일(SMTP), LDAP 로그인과 그룹 대응, 이슈 트래커(Jira·Redmine), 코드 호스팅(GitHub·GitLab·Azure DevOps·Bitbucket)의 주소와 토큰을 넣습니다. 각 항목의 [연결 시험] 으로 바로 확인하며, 비워 둔 항목은 쓰이지 않습니다.'],
    ['Integrations', 'In [Integrations], enter the addresses and tokens for e-mail (SMTP), LDAP login and group mapping, issue trackers (Jira, Redmine) and code hosting (GitHub, GitLab, Azure DevOps, Bitbucket). [Test connection] checks each one, and empty entries are simply not used.']],
  ['adminTools', 'admin', VIEW('admin'), ['project', 'act:adminTab:tools'],
    ['필요한 소프트웨어', '[도구] 탭은 분석에 도움이 되는 외부 소프트웨어(컴파일러, 언어 런타임, 정적 분석기)가 설치되어 있는지 보여 주고, 없는 것은 설치를 제안합니다. 설치는 항상 사용자에게 묻고 진행하며, 진행 상황은 작업 탭에 나옵니다.'],
    ['Required software', 'The [Tools] tab shows whether helpful external software (compilers, language runtimes, static analysers) is installed and offers to install what is missing. Nothing is installed without asking, and progress shows in the Jobs tab.']],

  // ── 14. 설정 ─────────────────────────────────────────
  ['settingsGeneral', 'settings', SETTINGS('general'), ['project', 'act:settings:general', 'wait:400'],
    ['설정 창 — 일반', '도구 › 설정(Ctrl+,)은 탭으로 나뉜 설정 창을 엽니다. [일반] 탭에서 언어, 기본 담당자, 시작할 때 시작 화면 보기, 시작할 때마다 시작 안내 창 보기 같은 기본 동작을 정합니다. 바꾼 내용은 [저장] 을 눌러야 적용되고, [취소] 하면 원래대로 돌아갑니다.'],
    ['Settings — General', 'Tools › Settings (Ctrl+,) opens the settings window with tabs. The [General] tab sets the language, default assignee, whether the start page and the getting-started guide appear at launch, and similar basics. Changes apply when you press [Save]; [Cancel] restores the previous values.']],
  ['settingsTheme', 'settings', SETTINGS('theme'), ['project', 'act:settings:theme', 'wait:400'],
    ['테마', '[테마] 탭에는 어두운 테마 20개와 밝은 테마 20개가 견본과 함께 있습니다. 견본을 누르면 저장하기 전에 메인 창에 바로 미리 보입니다. 메뉴 표시줄의 테마 단추로도 언제든 바꿀 수 있고, 사용 설명서 창도 같은 테마를 따릅니다.'],
    ['Themes', 'The [Theme] tab has 20 dark and 20 light themes with swatches. Clicking a swatch previews it in the main window before you save. The theme button on the menu bar switches it any time, and the user\'s guide window follows the same theme.']],
  ['settingsCustom', 'settings', SETTINGS('custom'), ['project', 'act:settings:custom', 'wait:400'],
    ['사용자 정의 테마', '[사용자 정의 테마] 탭에서 기존 테마를 바탕으로 배경, 패널, 글자, 강조색, 테두리 같은 기본 색을 골라 나만의 테마를 만듭니다. 만든 테마는 테마 목록 끝에 추가되고 내보내기·가져오기로 다른 컴퓨터에 옮길 수 있습니다.'],
    ['Custom themes', 'In [Custom themes], start from an existing theme and pick the base colours — background, panel, text, accent, border — to make your own. New themes join the end of the theme list and can be exported and imported to other computers.']],
  ['settingsStart', 'settings', SETTINGS('start'), ['project', 'act:settings:start', 'wait:400'],
    ['시작 화면 설정', '[시작 화면] 탭에서 배경 애니메이션의 종류, 섞기 간격, 속도, 투명도, 시작할 때마다 무작위로 고르기를 정하고 카드 배치를 초기화합니다. 시작 화면의 배경 카드와 같은 설정입니다.'],
    ['Start page settings', 'The [Start page] tab sets the background animation kind, shuffle interval, speed, transparency and random choice at each start, and resets the card layout — the same options as the background card on the start page.']],
  ['settingsAnalysis', 'settings', SETTINGS('analysis'), ['project', 'act:settings:analysis', 'wait:400'],
    ['분석 설정', '[분석] 탭에서 제외할 경로(예: **/node_modules/**, **/*.min.js), 파일 크기 한도, 사용할 엔진, 예외 승인 절차 사용 여부와 승인자를 정합니다. 프로젝트별 설정은 관리 › 분석 설정에서 따로 덮어쓸 수 있습니다.'],
    ['Analysis settings', 'The [Analysis] tab sets the paths to exclude (such as **/node_modules/** and **/*.min.js), the file size limit, the engines to use, and whether exception approval is required and by whom. Per-project values can override these in Administration › Analysis settings.']],
  ['settingsNewCode', 'settings', SETTINGS('newcode'), ['project', 'act:settings:newcode', 'wait:400'],
    ['새 코드 기준', '[새 코드] 탭에서 무엇을 새 코드로 볼지 정합니다. 이전 분석, 지정한 날짜 이후, 특정 버전 이후, 최근 N일, 기준 브랜치와의 차이 중에서 고릅니다. 이 기준은 품질 게이트의 새 코드 조건과 이슈 목록의 [새 코드만] 필터에 쓰입니다.'],
    ['New code baseline', 'The [New code] tab defines new code: since the previous analysis, since a date, since a version, the last N days, or the difference with a reference branch. It drives the gate\'s new-code conditions and the [New code only] issue filter.']],
  ['settingsAi', 'settings', SETTINGS('ai'), ['project', 'act:settings:ai', 'wait:400'],
    ['AI 코드 수정 설정', '[AI 코드 수정] 탭은 앞에서 본 것처럼 제공자(Anthropic·OpenAI 호환·Ollama), 모델, 서버 주소, API 키, 추론 노력, 최대 토큰, 주변 코드 줄, 제한 시간, 설명 언어를 정하고 개인 정보 안내를 보여 줍니다.'],
    ['AI code fix settings', 'As seen earlier, the [AI code fix] tab sets the provider (Anthropic, OpenAI-compatible, Ollama), model, server address, API key, reasoning effort, maximum tokens, surrounding lines, time limit and explanation language, and shows the privacy notes.']],
  ['settingsDb', 'settings', SETTINGS('db'), ['project', 'act:settings:db', 'wait:400'],
    ['데이터베이스', '[데이터베이스] 탭에서 분석 결과를 SQLite, PostgreSQL, MySQL, SQL Server 로 내보내도록 설정합니다. 주소, 데이터베이스, 사용자, 스키마를 넣고 [연결 시험] 을 한 뒤, 분석할 때마다 자동으로 내보낼지와 이슈까지 넣을지를 정합니다. BI 도구로 대시보드를 만들 때 유용합니다.'],
    ['Database', 'The [Database] tab exports results to SQLite, PostgreSQL, MySQL or SQL Server. Enter the host, database, user and schema, [Test connection], then choose whether to export after every analysis and whether to include issues — handy for BI dashboards.']],
  ['settingsIntegrations', 'settings', SETTINGS('integrations'), ['project', 'act:settings:integrations', 'wait:400'],
    ['알림·연동', '[알림·연동] 탭에서 어떤 일(품질 게이트 상태 변경, 새 이슈 배정, 예외 신청·승인·반려)이 생길 때 메일이나 웹훅으로 알릴지 고릅니다. SMTP·LDAP·트래커·PR 게시의 자세한 연결 정보는 관리 › 연동에 있습니다.'],
    ['Notifications and integrations', 'The [Notifications & integrations] tab chooses which events — gate status changes, newly assigned issues, exception requests, approvals and rejections — send an e-mail or webhook. Connection details for SMTP, LDAP, trackers and PR decoration are in Administration › Integrations.']],
  ['settingsAdvanced', 'settings', SETTINGS('advanced'), ['project', 'act:settings:advanced', 'wait:400'],
    ['고급', '[고급] 탭에는 데이터 폴더 위치, 스냅샷과 감사 로그 보관 기간, 분석 동시 실행 수, 로그 수준, 설정 초기화 같은 항목이 있습니다. 잘 모르는 항목은 기본값으로 두는 것이 안전합니다.'],
    ['Advanced', 'The [Advanced] tab holds the data folder, how long snapshots and the audit log are kept, parallel analyses, log level and resetting settings. Leave unfamiliar items at their defaults.']],
  ['themeMenu', 'settings', T('theme-picker', ...MENU), ['project', 'menu:theme', 'wait:300'],
    ['테마 단추', '메뉴 표시줄 오른쪽의 테마 단추를 누르면 어두운 테마와 밝은 테마가 견본으로 나뉘어 나옵니다. 하나를 고르면 곧바로 바뀌고 저장됩니다.'],
    ['Theme button', 'The theme button at the right of the menu bar lists dark and light themes as swatches. Pick one and it applies and is saved at once.']],
  ['language', 'settings', T('lang-toggle', '.tb-lang'), ['project', 'wait:300'],
    ['언어', '언어 단추는 지금 언어의 국기와 코드(KO / EN)를 보여 줍니다. 누를 때마다 한국어와 English가 번갈아 바뀌고 곧바로 저장됩니다. 언어를 바꾸면 메뉴, 화면, 규칙 설명, 보고서, 사용 설명서와 이 튜토리얼까지 모두 그 언어로 바뀝니다.'],
    ['Language', 'The language button shows the current language\'s flag and code (KO / EN). Each click switches between 한국어 and English and saves the choice. Switching changes the menus, views, rule descriptions, reports, the user\'s guide and this tutorial.']],

  // ── 15. 도움말과 CI ──────────────────────────────────
  ['helpMenu', 'help', MENU, ['project', 'menu:help', 'wait:300'],
    ['도움말 메뉴', '도움말 메뉴는 한 줄로 [튜토리얼 시작], [튜토리얼 처음부터 시작], [사용 설명서], [튜토리얼 문서], README, 아키텍처 문서, 바로 가기 키, 정보를 보여 줍니다. 튜토리얼은 언제든 이 메뉴에서 다시 시작할 수 있고, 마지막으로 본 단계를 기억해 이어서 볼 수도 있습니다.'],
    ['Help menu', 'The Help menu lists, in one column, [Start the tutorial], [Restart the tutorial from the beginning], [User\'s guide], [Tutorial document], the README, the architecture document, keyboard shortcuts and About. Start the tutorial again from here at any time; it remembers the last step so you can continue.']],
  // Desktop: the guide is a window of its own, so the outline falls back to the menu bar.
  ['guideWindow', 'help', T('guide-window', '.mcc-guide', '.menubar'), ['project', 'guide'],
    ['사용 설명서 창', '[사용 설명서] 창은 설명서를 읽는 창입니다. 데스크톱 앱에서는 메인 창과 따로 떨어진 창으로 열려, 어디로든 옮겨 두고 보면서 작업할 수 있습니다. 위쪽에서 문서(사용 설명서·튜토리얼 문서·README)와 언어(한국어·English)를 고르고, ◀ ▶ 로 앞뒤로 이동하며, [새 창에서 열기] 로 브라우저에서 엽니다. 설명서는 메인 창과 같은 테마로 보입니다.'],
    ['User\'s guide window', 'The [User\'s guide] window reads the manual. In the desktop app it opens as a window of its own, apart from the main window, so you can move it anywhere and keep it open while you work. At the top choose the document (user\'s guide, tutorial document, README) and the language (한국어 / English), go back and forward with ◀ ▶, and [Open in new window] shows it in the browser. The guide uses the same theme as the main window.']],
  ['ciScan', 'help', T('menubar', '.menubar', '.menu-bar'), ['project', 'close-guide'],
    ['CI 에서 분석하기', 'CI 에서는 node scripts/scan.mjs 로 같은 엔진을 실행합니다. 저장소 루트의 mcc-project.properties(프로젝트 키, 소스 경로, 제외 경로)를 그대로 읽고, --server 주소와 토큰을 주면 결과를 이 서버로 올려 개요·활동·작업 화면에 나타나게 합니다. 품질 게이트가 실패하면 종료 코드 1 로 빌드를 멈춥니다.'],
    ['Analysing in CI', 'In CI, node scripts/scan.mjs runs the same engines. It reads mcc-project.properties at the repository root (project key, sources, exclusions) as is; with --server and a token it uploads the result to this server so it shows in the overview, activity and tasks views. A failed quality gate exits with code 1 to stop the build.']],
  ['finish', 'help', T('menu-help', '.menubar', '.menu-bar'), ['project', 'close-guide'],
    ['튜토리얼을 마쳤습니다', '수고하셨습니다. 이제 [폴더 열기] 로 여러분의 소스 폴더를 분석해 보세요. 튜토리얼은 도움말 › 튜토리얼 시작에서 언제든 다시 볼 수 있고, 더 자세한 내용은 사용 설명서에 있습니다. [완료] 를 누르면 튜토리얼이 닫히고 원래 화면으로 돌아갑니다.'],
    ['You have finished the tutorial', 'Well done. Now analyse your own source with [Open folder]. Run the tutorial again any time from Help › Start tutorial, and find the details in the user\'s guide. Press [Done] to close the tutorial and go back to where you were.']],
];

export const STEPS = ROWS.map(([id, chapter, target, action, ko, en, extra]) => ({
  id,
  chapter,
  target: Array.isArray(target) ? target : [target],
  action: action || [],
  text: { ko: { title: ko[0], body: ko[1] }, en: { title: en[0], body: en[1] } },
  ...(extra || {}),
}));

export function chapterName(id, lang) {
  const c = CHAPTERS.find((x) => x.id === id);
  return c ? (lang === 'en' ? c.en : c.ko) : id;
}

export function stepText(step, lang) {
  return step.text[lang === 'en' ? 'en' : 'ko'];
}

/** Auto-play time for a step: long enough to read it (Korean ~9, English ~16 characters a second). */
export function dwellOf(step, lang) {
  if (step.dwell) return step.dwell;
  const { title, body } = stepText(step, lang);
  const perChar = lang === 'en' ? 62 : 105;
  return Math.max(4500, Math.min(20000, 1500 + (title.length + body.length) * perChar));
}
