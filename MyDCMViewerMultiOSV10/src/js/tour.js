/* Guided tutorial: every feature, one step at a time. A spotlight on one part of the window, a card
 * with what it does, and a short demo that runs by itself when the step opens (the same app commands
 * a click runs). The card has a chapter list to jump to any part and a button to run the demo again.
 *
 *   Tour.STEPS / Tour.CHAPTERS          the steps (tests check every command exists) and their chapters
 *   Tour.start({ run, lang, onEnd, from })   run(action, dataset) = App.runAction; from = step id or chapter id
 *   Tour.stop() · Tour.go(index) · Tour.active · Tour.index · Tour.playing (the step's demo is still running)
 *
 * Step: { id, chapter, target (CSS selector, optional), ko: [title, text], en: [title, text],
 *         play: [ [action, dataset?] | { wait: ms } | { spot: selector } ] }
 * Opens automatically after installation (settings.tutorialDone is false) and from Help › Tutorial.
 * doc/tutorial.md describes the same steps with pictures; the tutorial video records them.
 */
window.Tour = (function () {
  const CHAPTERS = [
    { id: 'start', ko: '시작', en: 'Getting started' },
    { id: 'screen', ko: '화면 구성', en: 'The window' },
    { id: 'view', ko: '보기 · 윈도우', en: 'Viewing · window' },
    { id: 'measure', ko: '측정', en: 'Measuring' },
    { id: 'cine', ko: '시네 · 동영상 · 시리즈', en: 'Cine · video · series' },
    { id: 'advanced', ko: '고급 보기', en: 'Advanced viewing' },
    { id: 'tools', ko: 'DICOM 도구', en: 'DICOM tools' },
    { id: 'docs', ko: '문서', en: 'Documents' },
    { id: 'export', ko: '내보내기', en: 'Export' },
    { id: 'pacs', ko: 'PACS', en: 'PACS' },
    { id: 'settings', ko: '설정 · 도움말', en: 'Settings · help' },
  ];
  const W = (ms) => ({ wait: ms });
  const S = (sample) => ['sample', { sample }];
  const STEPS = [
    // ── 시작 ──
    { id: 'welcome', chapter: 'start', ko: ['MyDCMViewer 에 오신 것을 환영합니다', 'DICOM 의료 영상을 열고, 보고, 재고, 비교하고, 내보내는 모든 기능을 하나씩 보여 드립니다. 단계마다 데모가 저절로 실행됩니다. [다음] 으로 넘어가고, 위의 목록으로 원하는 장(章)으로 건너뛰며, [다시 실행] 으로 데모를 다시 봅니다. Esc 로 언제든 닫습니다.'],
      en: ['Welcome to MyDCMViewer', 'This tour shows every feature for opening, viewing, measuring, comparing and exporting DICOM images, one at a time. Each step runs a demo by itself. Next goes on, the list above jumps to any chapter and Run again replays a demo. Esc closes it at any time.'],
      play: [['start-page']] },
    { id: 'start', chapter: 'start', target: '#startPage .start-group[data-group="begin"]', ko: ['시작 화면', '파일 · 폴더 · DICOMDIR 열기, 일괄 변환, 설정, 단축키를 여기서 시작합니다. 메뉴 막대 왼쪽의 [시작] 단추로 언제든 다시 엽니다.'],
      en: ['Start page', 'Open a file, a folder or a DICOMDIR, run a batch conversion, change settings or see the shortcuts from here. The Start button at the left of the menu bar brings it back at any time.'],
      play: [['start-page']] },
    { id: 'samples', chapter: 'start', target: '#startPage .start-group[data-group="tasks"]', ko: ['예제 영상', 'CT, MR, 초음파 시네, 혈관 조영, X선, RT, 보고서, 심전도, DICOM 동영상, DICOMDIR 예제가 들어 있습니다. 카드를 누르면 바로 열립니다.'],
      en: ['Sample images', 'CT, MR, ultrasound cine, angiography, X-ray, RT, reports, ECG, DICOM video and a DICOMDIR are included. A click opens one.'],
      play: [['start-page']] },
    { id: 'background', chapter: 'start', target: '#startPage .start-scenes', ko: ['시작 화면 배경', 'CT 갠트리, MRI, 내시경, PET, 방사선 치료기 등 움직이는 3D 배경 18종 가운데 하나를 고르고, 투명도와 카메라 · 물체 · 하늘의 속도를 조절합니다.'],
      en: ['Start page background', 'Pick one of 18 moving 3D backgrounds — CT gantry, MRI, endoscope, PET, radiotherapy linac and more — and set the transparency and the camera, object and sky speeds.'],
      play: [['start-page']] },
    // ── 화면 구성 ──
    { id: 'menubar', chapter: 'screen', target: '#menus', ko: ['메뉴', '시작 · 파일 · 보기 · 도구 · 윈도우 · 시네 · 도움말 메뉴에 모든 기능이 아이콘과 함께 있습니다. 지금 CT 를 엽니다.'],
      en: ['Menus', 'Start, File, View, Tools, Window, Cine and Help hold every feature, each with its icon. Opening a CT now.'],
      play: [S('ct'), W(600)] },
    { id: 'titlebar', chapter: 'screen', target: '#menubar', ko: ['제목 줄 · 창 단추', '창에는 따로 제목 표시줄이 없습니다. 메뉴 막대 왼쪽에 아이콘 · 프로그램 이름 · 버전이, 오른쪽 끝에 최소화 · 최대화 · 닫기 단추가 있습니다. 메뉴 막대의 빈 곳(이름 포함)을 끌면 창이 움직이고, 두 번 누르면 최대화 · 복원됩니다. 창 가장자리나 모서리를 끌어 크기를 바꿉니다.'],
      en: ['Title row · window buttons', 'The window has no separate title bar. The icon, program name and version open the menu bar; minimise, maximise and close sit at its right end. Drag an empty part of the menu bar (or the name) to move the window, double-click it to maximise or restore, and drag an edge or corner to resize.'],
      play: [{ spot: '#appBrand' }, W(1600), { spot: '#winControls' }, W(1600), { spot: '#menubar' }] },
    { id: 'toolbar', chapter: 'screen', target: '#toolbar', ko: ['도구 모음', '열기, 실행 취소, 마우스 도구, 확대, 눈금자 · 격자, 회전, 반전, 배치, MPR · 3D, 프리셋 · 컬러맵, 내보내기가 아이콘 단추로 있습니다. 단추에 마우스를 올리면 설명이 나옵니다.'],
      en: ['Toolbar', 'Open, undo, mouse tools, zoom, ruler and grid, rotate, invert, layouts, MPR and 3D, presets and colour maps, export — as icon buttons. Hover one to see what it does.'],
      play: [] },
    { id: 'folders', chapter: 'screen', target: '#treeSection', ko: ['폴더 트리', '폴더를 열면 파일이 나무 모양으로 보입니다. 한 번 누르면 열리고, 오른쪽 단추로 복사 · 이동 · 삭제 · 경로 복사를 합니다.'],
      en: ['Folder tree', 'An opened folder shows here. One click opens a file; the right button copies, moves, deletes or copies its path.'],
      play: [] },
    { id: 'panels', chapter: 'screen', target: '#infoSection', ko: ['정보 · 태그 · 히스토그램 · 시리즈', '환자 · 검사 정보, 모든 DICOM 태그(검색), 히스토그램, 시리즈 목록을 봅니다.'],
      en: ['Info · tags · histogram · series', 'Patient and study information, every DICOM tag (searchable), the histogram and the series list.'],
      play: [['sidebar-tab', { tab: 'tags' }], W(1100), ['sidebar-tab', { tab: 'histogram' }], W(1100), ['sidebar-tab', { tab: 'info' }]] },
    { id: 'fold', chapter: 'screen', target: '#sidebar', ko: ['패널 접기 · 펼치기', '폴더 머리글 끝의 « 단추(또는 도구 모음 맨 앞의 패널 단추, F9)로 왼쪽 패널을 접습니다. 접으면 좁은 띠에 폴더 · 정보 · 태그 · 히스토그램 · 시리즈 아이콘과 세로 제목이 남고, 하나를 누르면 그 부분으로 다시 펼쳐집니다.'],
      en: ['Fold and unfold the panels', 'The « button at the end of the folder header (or the panel button at the start of the toolbar, F9) folds the left panel. A narrow rail keeps the folder, info, tags, histogram and series icons with their titles; clicking one unfolds the panel there.'],
      play: [['toggle', { key: 'sidebar' }], { spot: '#sidebarRail' }, W(1800), ['toggle', { key: 'sidebar' }], { spot: '#sidebar' }] },
    { id: 'props', chapter: 'screen', target: '#rightPanel', ko: ['속성 패널', '오른쪽 패널은 지금 보는 영상의 정보와 속성입니다: 파일 정보, 보기(배율 · 회전 · 반전), 윈도우 / 레벨, 시네, 표시(눈금자 · 축척 막대 · 격자 …), 측정 목록. 바꿀 수 있는 값은 그 자리에서 바꾸고, 숫자 칸은 양옆의 − / + 단추로 한 단계씩 바꿉니다. 이 패널도 접으면 띠에 구역 아이콘과 제목이 남습니다(F8).'],
      en: ['Properties panel', 'The right panel shows what you are looking at: file, view (zoom, rotation, flips), window / level, cine, display (rulers, scale bar, grid …) and the measurements. Values that can change are changed right there; number fields step with the − / + buttons on either side. Folded, it also keeps a rail of section icons and titles (F8).'],
      play: [['props-open', { sec: 'wl' }], W(1200), ['props-open', { sec: 'display' }], W(1200), ['toggle', { key: 'rightPanel' }], { spot: '#rightRail' }, W(1600), ['toggle', { key: 'rightPanel' }], { spot: '#rightPanel' }, ['props-open', { sec: 'file' }]] },
    { id: 'tabs', chapter: 'screen', target: '#tabBar', ko: ['파일 탭', '연 파일마다 탭이 생기고, 탭마다 프레임 · 윈도우 · 확대 · 측정이 따로 기억됩니다. 오른쪽 단추로 닫기 · 다른 탭 닫기 · 경로 복사를 합니다. MR 을 하나 더 엽니다.'],
      en: ['File tabs', 'Every open file gets a tab that keeps its own frame, window, zoom and measurements. The right button closes it, closes the others or copies its path. Opening an MR as well.'],
      play: [S('mrbrain'), W(900), S('ct')] },
    { id: 'statusbar', chapter: 'screen', target: '.statusbar', ko: ['상태 표시줄', '파일 경로, 환자 · 검사 요약, 크기, W/L, 마우스 아래의 값, 배율이 보입니다. 오른쪽 아래 모서리를 끌어 창 크기를 바꿉니다.'],
      en: ['Status bar', 'The file path, a patient / study summary, size, W/L, the value under the mouse and the zoom. Drag the bottom-right corner to resize the window.'],
      play: [] },
    // ── 보기 · 윈도우 ──
    { id: 'zoom', chapter: 'view', target: '#viewport', ko: ['확대 · 이동', '휠로 확대/축소, 왼쪽 끌기로 이동, 더블 클릭으로 화면 맞춤입니다. 모서리에 환자 · 검사 정보와 배율, 가장자리에 방향(R/L/A/P)이 보입니다.'],
      en: ['Zoom and pan', 'Wheel to zoom, drag to pan, double-click to fit. The corners show patient, study and zoom; the edges show the orientation (R/L/A/P).'],
      play: [['zoom-in'], W(500), ['zoom-in'], W(700), ['fit']] },
    { id: 'rotate', chapter: 'view', target: '#transformMenu', ko: ['회전 · 반전', '90° 회전, 좌우 · 상하 반전, 보기 초기화(R). 실행 취소(Ctrl+Z)로 되돌립니다.'],
      en: ['Rotate and flip', 'Rotate by 90°, flip horizontally or vertically, reset the view (R). Ctrl+Z undoes it.'],
      play: [['rotate-right'], W(800), ['flip-h'], W(800), ['reset-view']] },
    { id: 'window', chapter: 'view', target: '#wlBar', ko: ['윈도우 / 레벨', '오른쪽 끌기 또는 W(폭) · L(중심) 입력으로 밝기와 대비를 바꿉니다. 프리셋 목록에 CT 뇌 · 폐 · 뼈 · 복부 등이 있습니다. 폐, 뼈 순서로 적용합니다.'],
      en: ['Window / level', 'Right-drag, or type W (width) and L (centre), to change brightness and contrast. The preset list has CT brain, lung, bone, abdomen and more. Applying lung, then bone.'],
      play: [['preset', { value: 'lung' }], W(1000), ['preset', { value: 'bone' }], W(1000), ['wl-reset']] },
    { id: 'colour', chapter: 'view', target: '#colormapSelect', ko: ['컬러맵 · 반전', '회색 대신 핫 아이언, PET, 제트 등 컬러맵으로 보거나 반전(I)합니다.'],
      en: ['Colour maps and invert', 'View with hot iron, PET, jet and other colour maps instead of grey, or invert it (I).'],
      play: [['colormap', { value: 'hotiron' }], W(1000), ['colormap', { value: 'gray' }], W(300), ['toggle', { key: 'invert' }], W(900), ['toggle', { key: 'invert' }]] },
    { id: 'overlays', chapter: 'view', target: '#viewport', ko: ['모서리 정보 · 눈금자 · 격자', '보기 메뉴에서 모서리 정보, 방향 표시, 오버레이 평면, 눈금자(K), 눈금에 맞춘 5×5 격자(G)를 켜고 끕니다.'],
      en: ['Corner text · ruler · grid', 'The View menu turns the corner text, orientation markers, overlay planes, the ruler (K) and the 5 × 5 grid on its ticks (G) on and off.'],
      play: [['toggle', { key: 'ruler' }], W(700), ['toggle', { key: 'grid' }], W(1100), ['toggle', { key: 'grid' }], ['toggle', { key: 'ruler' }]] },
    { id: 'scalebar', chapter: 'view', target: '#viewport', ko: ['축척 막대', '영상 위의 축척 막대가 실제 길이(예: 5 cm)를 보여 주고, 확대하면 길이가 알맞게 바뀝니다. 막대를 마우스로 끌어 원하는 곳에 두면 다음 실행에도 그 자리에 나옵니다. 도구 모음의 축척 단추 · B 로 켜고 끕니다.'],
      en: ['Scale bar', 'The scale bar on the image shows a real length (e.g. 5 cm) and adapts as you zoom. Drag it wherever you like — it stays there next time. The scale bar button on the toolbar or B turns it on and off.'],
      play: [['scalebar-pos', { fx: '0.18', fy: '0.16' }], W(1100), ['zoom-in'], W(900), ['scalebar-pos', { fx: '0.8', fy: '0.2' }], W(1100), ['fit'], ['scalebar-pos', { reset: '1' }]] },
    // ── 측정 ──
    { id: 'length', chapter: 'measure', target: '#toolButtons', ko: ['길이', '길이 도구(6)로 두 점을 잇습니다. Pixel Spacing 이 있으면 mm · cm 로, 없으면 화소로 표시하고 [이 길이를 실측값으로 보정] 할 수 있습니다.'],
      en: ['Length', 'The length tool (6) joins two points: in mm / cm when the file has a pixel spacing, else in pixels — then calibrate it from a known length.'],
      play: [['clear-measurements'], ['tool', { tool: 'length' }], W(400), ['demo-measure', { kind: 'length' }], W(900), ['tool', { tool: 'pan' }]] },
    { id: 'angles', chapter: 'measure', target: '#toolButtons', ko: ['각도 · Cobb 각', '각도 도구(7)는 세 점, Cobb 각(Shift+7)은 두 선(척추 끝판) 사이의 각도를 잽니다.'],
      en: ['Angle · Cobb angle', 'The angle tool (7) takes three points; the Cobb angle (Shift+7) measures between two lines (vertebral end plates).'],
      play: [['clear-measurements'], ['demo-measure', { kind: 'angle' }], W(900), ['demo-measure', { kind: 'cobb' }], W(900)] },
    { id: 'roi', chapter: 'measure', target: '#viewport', ko: ['ROI 통계', '사각형(8) · 타원(9) · 다각형(Shift+8) · 자유곡선(Shift+9) 영역의 면적, 둘레, 평균, 표준편차, 최소, 최대(CT 는 HU)를 보여 줍니다.'],
      en: ['ROI statistics', 'Rectangle (8), ellipse (9), polygon (Shift+8) and freehand (Shift+9) regions show area, perimeter, mean, SD, minimum and maximum (HU on CT).'],
      play: [['clear-measurements'], ['demo-measure', { kind: 'rect' }], W(800), ['demo-measure', { kind: 'polygon' }], W(1000)] },
    { id: 'annotate', chapter: 'measure', target: '#viewport', ko: ['점 · 화살표 · 텍스트 · 돋보기', '점(Shift+5)은 그 자리의 값, 화살표(Shift+0)와 텍스트(0)는 주석입니다. 돋보기(Q)는 누르고 있는 동안 3배로 봅니다. 마지막 측정 삭제는 Backspace, 모두 지우기는 Del 입니다.'],
      en: ['Point · arrow · text · magnifier', 'A point (Shift+5) shows the value there; arrows (Shift+0) and text (0) annotate. The magnifier (Q) shows three times larger while held. Backspace deletes the last measurement, Del all.'],
      play: [['clear-measurements'], ['demo-measure', { kind: 'point' }], W(700), ['demo-measure', { kind: 'arrow' }], W(700), ['demo-measure', { kind: 'text' }], W(1100), ['clear-measurements']] },
    // ── 시네 · 동영상 · 시리즈 ──
    { id: 'cine', chapter: 'cine', target: '#frameBar', ko: ['시네 재생', '여러 프레임 영상은 아래 막대로 봅니다: ▶ 재생, ⏸ 잠시 멈춤, ⏹ 멈춤(첫 프레임으로), 한 프레임씩, 속도(fps), 반복. Space 는 재생/멈춤, S 는 멈춤입니다. 10프레임 MR 을 재생합니다.'],
      en: ['Cine', 'Multi-frame images play from this bar: ▶ play, ⏸ pause, ⏹ stop (back to the first frame), frame by frame, speed (fps) and loop. Space plays / pauses, S stops. Playing a 10-frame MR.'],
      play: [S('emri'), W(700), ['cine-play'], W(2000), ['cine-pause'], W(900), ['cine-stop']] },
    { id: 'video', chapter: 'cine', target: '#frameBar', ko: ['DICOM 동영상', 'MPEG-4 AVC(H.264) · HEVC 로 저장된 DICOM 동영상은 그대로 재생 · 잠시 멈춤 · 멈춤 하고 한 프레임씩 넘겨 측정할 수 있습니다. MPEG-2 등 브라우저가 못 푸는 형식은 [동영상 추출] 로 저장합니다.'],
      en: ['DICOM video', 'DICOM video stored as MPEG-4 AVC (H.264) or HEVC plays, pauses and stops directly and steps frame by frame for measuring. Formats a browser cannot decode (MPEG-2) are saved with Extract video.'],
      play: [S('video'), W(900), ['cine-play'], W(2200), ['cine-pause'], W(900), ['cine-stop']] },
    { id: 'series', chapter: 'cine', target: '#seriesBar', ko: ['시리즈 넘기기', '폴더에 파일이 여럿이면 시리즈 막대 · ← → · PgUp/PgDn 으로 넘깁니다. 시네 › 폴더를 DICOM 시리즈로 정렬 하면 위치 순서로 쌓입니다. DICOMDIR 를 엽니다.'],
      en: ['Series', 'With several files in the folder, the series bar, ← → and PgUp / PgDn step through them. Cine › Sort folder as DICOM series stacks them by position. Opening a DICOMDIR.'],
      play: [S('dicomdir'), W(1200), ['series-next'], W(900), ['series-next']] },
    { id: 'layout', chapter: 'cine', target: '#viewGrid', ko: ['화면 배치 · 동기 스크롤 · 기준선', '보기 › 화면 배치로 1×2 · 2×2 · 3×3 칸에 여러 영상을 나란히 비교합니다. 동기 스크롤은 같은 위치의 슬라이스로 따라가고, 기준선은 다른 칸의 단면 위치를 보여 줍니다.'],
      en: ['Layouts · synchronised scrolling · reference lines', 'View › Viewport layout compares images side by side in 1×2, 2×2 or 3×3. Synchronised scrolling follows to the same slice position; reference lines show where the other slices cut.'],
      play: [S('ct'), W(500), ['layout', { value: '2x2' }], W(2200), ['layout', { value: '1x1' }]] },
    // ── 고급 보기 ──
    { id: 'mpr', chapter: 'advanced', target: '.toolbar [data-action="mpr"]', ko: ['MPR / MIP · 곡면 MPR', '다중 프레임이나 정렬한 시리즈를 축상 · 관상 · 시상면으로 다시 자르고 MIP / MinIP / 평균 투영으로 봅니다(M). 곡면 MPR 은 축상면에 경로를 찍어 그 곡선을 펼칩니다.'],
      en: ['MPR / MIP · curved MPR', 'Reslice a multi-frame image or a sorted series into axial, coronal and sagittal planes with MIP / MinIP / average (M). Curved MPR unrolls a path you click on the axial view.'],
      play: [S('emri'), W(600), ['mpr'], W(3000), ['close-dialog', { kind: 'mpr' }]] },
    { id: 'volume', chapter: 'advanced', target: '.toolbar [data-action="volume"]', ko: ['3D 볼륨 렌더링', '볼륨 렌더링(뼈 · 연부 조직 · 폐 · 혈관 프리셋), MIP · MinIP · 평균, 등위면, 자르기 상자, 앞 · 뒤 · 좌 · 우 · 위 · 아래 보기. 끌어서 돌리고 휠로 확대합니다(Shift+M).'],
      en: ['3D volume rendering', 'Volume rendering (bone, soft tissue, lung and angio presets), MIP, MinIP, average, isosurface, a clipping box and preset views. Drag to rotate, wheel to zoom (Shift+M).'],
      play: [S('emri'), W(600), ['volume'], W(3500), ['close-dialog', { kind: 'volume' }]] },
    { id: 'filters', chapter: 'advanced', target: '#viewport', ko: ['영상 필터', '도구 › 영상 필터: 부드럽게 · 선명하게 · 잡음 제거 · 중앙값 · 윤곽선 · 엠보스 · 히스토그램 평활화. 여러 필터를 이을 수 있고 내보내기에도 들어갑니다. 선명하게, 윤곽선 순서로 보여 줍니다.'],
      en: ['Image filters', 'Tools › Image filters: smooth, sharpen, denoise, median, edges, emboss, histogram equalisation. Chain several; exports show them too. Showing sharpen, then edges.'],
      play: [S('ct'), W(500), ['filter-quick', { value: 'sharpen' }], W(1300), ['filter-quick', { value: 'edge' }], W(1300), ['filter-quick', { value: '' }]] },
    { id: 'fusion', chapter: 'advanced', target: '#viewport', ko: ['영상 융합 (PET/CT)', '도구 › 영상 융합: 두 번째로 연 영상(PET · SPECT · 선량 · MR)을 컬러맵으로 겹칩니다. 위치 정보가 있으면 환자 좌표로 맞춥니다. RT 선량을 CT 위에 겹칩니다.'],
      en: ['Image fusion (PET/CT)', 'Tools › Image fusion lays a second open image (PET, SPECT, dose, MR) over this one in a colour map, matched through patient coordinates when both have them. Laying an RT dose over the CT.'],
      play: [S('rtdose'), W(600), S('ct'), W(600), ['demo-fusion', { on: true }], W(2200), ['demo-fusion', { on: false }]] },
    // ── DICOM 도구 ──
    { id: 'tageditor', chapter: 'tools', target: '#viewport', ko: ['DICOM 태그 편집', '도구 › DICOM 태그 편집: 시퀀스 안까지 모든 요소를 보고 값을 바꾸거나 추가 · 삭제해 새 파일로 저장합니다. 원본은 그대로입니다.'],
      en: ['Edit DICOM tags', 'Tools › Edit DICOM tags shows every element, inside sequences too; change, add or remove values and save a new file. The original stays untouched.'],
      play: [S('ct'), W(500), ['tag-editor'], W(2500), ['close-dialog', { kind: 'tageditor' }]] },
    { id: 'anonymize', chapter: 'tools', target: '#viewport', ko: ['익명화 사본', '개인 식별 정보를 바꾸거나 비우고(시퀀스 안까지), 비공개 태그를 지우고, 검사 · 시리즈 · 영상 UID 를 새로 만들어 _anon.dcm 으로 저장합니다.'],
      en: ['Anonymised copy', 'Replaces or empties identifying values (inside sequences too), removes private tags and gives fresh study / series / image UIDs, saved as _anon.dcm.'],
      play: [['anonymize'], W(2200), ['close-dialog', { kind: 'anonymize' }]] },
    { id: 'transcode', chapter: 'tools', target: '#menus', ko: ['압축 변환 · Secondary Capture', '도구 메뉴의 [비압축 DICOM 으로 저장] 은 JPEG · JPEG 2000 · JPEG-LS · RLE 를 풀어 저장하고, [영상을 DICOM 으로 저장] 은 보이는 그림을 Secondary Capture 로 만듭니다.'],
      en: ['Transcode · Secondary Capture', 'Tools › Save as uncompressed DICOM decodes JPEG, JPEG 2000, JPEG-LS and RLE files; Save image as DICOM makes a Secondary Capture of what is shown.'],
      play: [] },
    // ── 문서 ──
    { id: 'sr', chapter: 'docs', target: '#viewport', ko: ['구조화 보고서 (SR)', '판독 보고서를 트리로 보고 HTML · 텍스트로 저장합니다.'],
      en: ['Structured report (SR)', 'Reads the report as a tree and saves it as HTML or text.'],
      play: [S('sr'), W(1600)] },
    { id: 'ecg', chapter: 'docs', target: '#viewport', ko: ['심전도 · 파형', '12유도 심전도 같은 DICOM 파형을 그래프로 보고(속도 · 이득 · 열 수) CSV · PNG 로 저장합니다.'],
      en: ['ECG · waveforms', 'DICOM waveforms such as a 12-lead ECG as graphs (speed, gain, columns), saved as CSV or PNG.'],
      play: [S('ecg'), W(1600)] },
    { id: 'rt', chapter: 'docs', target: '#viewport', ko: ['RT 구조 · 계획 · 선량', 'RT 구조는 ROI 목록과 윤곽, RT 계획은 빔 · 분할 · 처방, RT 선량은 컬러맵 영상으로 봅니다.'],
      en: ['RT structures · plans · dose', 'RT structure sets list ROIs and contours, RT plans their beams, fractions and prescriptions; RT dose shows as a colour-mapped image.'],
      play: [S('rtstruct'), W(1400), S('rtplan'), W(1400)] },
    { id: 'dicomdir', chapter: 'docs', target: '#viewport', ko: ['DICOMDIR · ZIP', 'CD · DVD · USB 의 DICOMDIR 는 환자 › 검사 › 시리즈 목록으로, ZIP 파일은 읽기 전용 폴더로 엽니다.'],
      en: ['DICOMDIR · ZIP', 'A DICOMDIR from a CD, DVD or USB stick opens as patient › study › series; a ZIP file opens as a read-only folder.'],
      play: [S('dicomdir'), W(1600)] },
    // ── 내보내기 ──
    { id: 'export', chapter: 'export', target: '#exportMenu', ko: ['내보내기 메뉴', 'PNG · JPEG · WebP · BMP · TIFF · GIF, 16비트 TIFF, 모든 프레임 ZIP, 애니메이션 GIF, 동영상(MP4 · WebM), PDF 보고서, DICOM, DICOMDIR, 측정값 CSV, 태그를 내보냅니다. 저장하는 동안 진행률 창이 뜹니다.'],
      en: ['Export menu', 'PNG, JPEG, WebP, BMP, TIFF, GIF, 16-bit TIFF, all frames as ZIP, animated GIF, video (MP4 / WebM), PDF report, DICOM, DICOMDIR, measurements as CSV and tags. A progress window shows while saving.'],
      play: [S('ct'), W(400)] },
    { id: 'exportas', chapter: 'export', target: '#viewport', ko: ['다른 형식으로 내보내기', '45가지 형식(AVIF · JPEG XL · JPEG 2000 · JPEG-LS · OpenEXR · NIfTI · NRRD · MetaImage · FITS 등)을 고르고 품질 · 비트 깊이 · 압축을 정합니다. 16비트 · 의료 형식은 원래 화소 값을 담습니다.'],
      en: ['Export as any format', 'Pick one of 45 formats (AVIF, JPEG XL, JPEG 2000, JPEG-LS, OpenEXR, NIfTI, NRRD, MetaImage, FITS…) and set quality, bit depth and compression. 16-bit and medical formats keep the raw pixel values.'],
      play: [['export-as-dialog'], W(2500), ['close-dialog', { kind: 'exportas' }]] },
    { id: 'print', chapter: 'export', target: '#viewport', ko: ['인쇄', '인쇄 미리보기에서 용지 · 방향 · 머리글 · 매수를 정하고 프린터로 바로 인쇄합니다(Ctrl+P).'],
      en: ['Print', 'The print preview sets paper, orientation, header and copies, then prints straight to the printer (Ctrl+P).'],
      play: [['print'], W(2200), ['close-dialog', { kind: 'print' }]] },
    { id: 'batch', chapter: 'export', target: '#viewport', ko: ['폴더 일괄 변환', '폴더(하위 폴더 포함)의 DICOM 을 한 번에 그림 파일로 바꿔 converted_<형식> 폴더에 저장합니다.'],
      en: ['Batch conversion', 'Converts every DICOM file of a folder (and its subfolders) to pictures in a converted_<format> folder.'],
      play: [['batch'], W(2000), ['close-dialog', { kind: 'batch' }]] },
    // ── PACS ──
    { id: 'pacs', chapter: 'pacs', target: '#viewport', ko: ['PACS 연결', '도구 › PACS: 병원 PACS 나 장비를 등록하고 연결 확인(C-ECHO), 검사 검색(C-FIND), 가져오기(C-GET / C-MOVE), 보내기(C-STORE)를 합니다. [수신 시작] 을 누르면 다른 장비가 보낸 영상도 받습니다(데스크톱).'],
      en: ['PACS', 'Tools › PACS: register a PACS or modality, verify it (C-ECHO), search studies (C-FIND), retrieve (C-GET / C-MOVE) and send (C-STORE). Start receiving to accept images other devices push (desktop).'],
      play: [['pacs'], W(2600), ['close-dialog', { kind: 'pacs' }]] },
    // ── 설정 · 도움말 ──
    { id: 'look', chapter: 'settings', target: '.menubar-right', ko: ['테마 · 언어 · 설정', '테마 20종, 한국어 / 영어, 프로그램 설정(측정 단위, 휠 동작, 시작 화면 등)이 메뉴 막대 오른쪽에 있습니다. 테마를 하나 바꿔 봅니다.'],
      en: ['Theme · language · settings', 'Twenty themes, Korean / English and the program settings (units, wheel, start page…) sit at the right of the menu bar. Trying another theme.'],
      play: [['theme-toggle'], W(1100), ['theme-toggle'], W(400), ['settings'], W(1800), ['close-dialog', { kind: 'settings' }]] },
    { id: 'help', chapter: 'settings', target: '#menus', ko: ['도움말 · 단축키', '도움말 › 도움말 창에서 모든 기능의 설명을 그림과 함께 봅니다. F1 은 단축키 목록입니다.'],
      en: ['Help · shortcuts', 'Help › Help window explains every feature with pictures. F1 lists the keyboard shortcuts.'],
      play: [['shortcuts'], W(1800), ['close-dialog', { kind: 'shortcuts' }]] },
    { id: 'done', chapter: 'settings', ko: ['준비 완료', '이 안내는 도움말 › 튜토리얼 에서 언제든 다시 볼 수 있고, 위 목록에서 원하는 장부터 시작할 수 있습니다.'],
      en: ['You are set', 'Open this tour again from Help › Tutorial at any time, and start from any chapter in the list above.'],
      play: [['start-page']] },
  ];

  let cur = null;

  function stop(finished) {
    if (!cur) return;
    const c = cur;
    cur = null;
    c.token++;
    clearInterval(c.timer);
    c.root.remove();
    document.removeEventListener('keydown', c.onKey, true);
    window.removeEventListener('resize', c.place);
    if (c.onEnd) c.onEnd(!!finished);
  }

  function indexOf(from) {
    if (from == null) return 0;
    if (Number.isFinite(from)) return Math.max(0, Math.min(STEPS.length - 1, from));
    const i = STEPS.findIndex((s) => s.id === from);
    if (i >= 0) return i;
    const j = STEPS.findIndex((s) => s.chapter === from);
    return j >= 0 ? j : 0;
  }

  function start({ run, lang = 'ko', onEnd, from } = {}) {
    stop(false);
    const root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = `<div class="tour-shade" data-side="top"></div><div class="tour-shade" data-side="bottom"></div><div class="tour-shade" data-side="left"></div><div class="tour-shade" data-side="right"></div><div class="tour-ring"></div>
      <div class="tour-card" role="dialog" aria-live="polite"><div class="tour-top"><select class="tour-chapter"></select><span class="tour-step"></span></div><h3></h3><p></p><div class="tour-say"></div>
      <div class="tour-actions"><button type="button" class="btn tour-skip"></button><button type="button" class="btn tour-replay"></button><span class="spacer"></span><button type="button" class="btn tour-prev"></button><button type="button" class="btn primary tour-next"></button></div></div>`;
    document.body.append(root);
    const L = (ko, en) => (lang === 'ko' ? ko : en);
    root.querySelector('.tour-skip').textContent = L('안내 닫기', 'Close tour');
    root.querySelector('.tour-replay').textContent = L('▶ 다시 실행', '▶ Run again');
    root.querySelector('.tour-prev').textContent = L('이전', 'Back');
    const sel = root.querySelector('.tour-chapter');
    sel.innerHTML = CHAPTERS.map((ch, i) => `<option value="${ch.id}">${i + 1}. ${lang === 'ko' ? ch.ko : ch.en}</option>`).join('');
    cur = { root, index: 0, run, lang, onEnd, token: 0, spot: null };
    const c = cur;
    c.place = () => place(c);
    c.onKey = (e) => {
      if (e.target && e.target.closest && e.target.closest('.tour-chapter')) return;
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); stop(false); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); go(c, c.index + 1); }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); go(c, c.index - 1); }
    };
    document.addEventListener('keydown', c.onKey, true);
    window.addEventListener('resize', c.place);
    root.querySelector('.tour-skip').addEventListener('click', () => stop(false));
    root.querySelector('.tour-replay').addEventListener('click', () => go(c, c.index));
    root.querySelector('.tour-prev').addEventListener('click', () => go(c, c.index - 1));
    root.querySelector('.tour-next').addEventListener('click', () => go(c, c.index + 1));
    sel.addEventListener('change', () => go(c, indexOf(sel.value)));
    // targets can appear late or move (panels, popups): measure again now and then
    c.timer = setInterval(c.place, 250);
    go(c, indexOf(from));
  }

  async function go(c, index) {
    if (cur !== c) return;
    if (index >= STEPS.length) { stop(true); return; }
    if (index < 0) return;
    c.index = index;
    const step = STEPS[index];
    const token = ++c.token;
    const [title, text] = step[c.lang === 'ko' ? 'ko' : 'en'];
    const chapter = CHAPTERS.findIndex((ch) => ch.id === step.chapter);
    c.root.querySelector('.tour-chapter').value = step.chapter;
    c.root.querySelector('.tour-step').textContent = `${index + 1} / ${STEPS.length}`;
    c.root.querySelector('h3').textContent = `${chapter + 1}.${STEPS.filter((s, i) => s.chapter === step.chapter && i <= index).length} ${title}`;
    c.root.querySelector('p').textContent = text;
    c.root.querySelector('.tour-say').textContent = '';
    c.root.querySelector('.tour-prev').disabled = index === 0;
    c.root.querySelector('.tour-replay').disabled = !(step.play || []).some(Array.isArray);
    c.root.querySelector('.tour-next').textContent = index === STEPS.length - 1 ? (c.lang === 'ko' ? '마치기' : 'Finish') : (c.lang === 'ko' ? '다음' : 'Next');
    c.spot = step.target || null;
    c.scrolled = false;
    c.root.querySelector('.tour-card').classList.add('measuring');
    place(c);
    c.playing = true;
    for (const item of step.play || []) {
      if (cur !== c || token !== c.token) return;
      if (Array.isArray(item)) {
        const [action, data] = item;
        try { await c.run(action, data || {}); } catch (err) { console.warn('[tour]', action, err); }
      } else if (item.wait) await new Promise((r) => setTimeout(r, item.wait));
      else if (item.spot) { c.spot = item.spot; c.scrolled = false; }
      place(c);
    }
    if (cur === c && token === c.token) c.playing = false;
  }

  function place(c) {
    if (cur !== c) return;
    const card = c.root.querySelector('.tour-card');
    const el = c.spot ? document.querySelector(c.spot) : null;
    const W = window.innerWidth, H = window.innerHeight;
    let r = el ? el.getBoundingClientRect() : null;
    // a target below / above the visible part of a scrolled area (the start page) is scrolled into view first
    if (r && (r.top < 0 || r.bottom > H || r.left < 0 || r.right > W) && !c.scrolled) {
      c.scrolled = true;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      r = el.getBoundingClientRect();
    }
    if (r && (r.width < 2 || r.height < 2)) r = null;
    // the ring (2 px border + 4 px glow) stays whole inside the window: every side is clamped, not only the
    // top-left corner — a target at the right / bottom edge used to push the ring out of the window
    const pad = 6, inset = 7;
    let box = { x: W / 2, y: H / 2, w: 0, h: 0 };
    if (r) {
      const x0 = Math.max(inset, r.left - pad), y0 = Math.max(inset, r.top - pad);
      const x1 = Math.min(W - inset, r.right + pad), y1 = Math.min(H - inset, r.bottom + pad);
      box = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    }
    const set = (side, x, y, w, h) => Object.assign(c.root.querySelector(`[data-side="${side}"]`).style, { left: `${x}px`, top: `${y}px`, width: `${Math.max(0, w)}px`, height: `${Math.max(0, h)}px` });
    set('top', 0, 0, W, box.y);
    set('bottom', 0, box.y + box.h, W, H - box.y - box.h);
    set('left', 0, box.y, box.x, box.h);
    set('right', box.x + box.w, box.y, W - box.x - box.w, box.h);
    Object.assign(c.root.querySelector('.tour-ring').style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, display: r ? '' : 'none' });
    // card: below → above → right → left of the target, else in a corner over it; always inside the window
    const cw = card.offsetWidth || 400, ch = card.offsetHeight || 200, gap = 12, m = 10;
    let x, y;
    if (!r) { x = (W - cw) / 2; y = (H - ch) / 2; }
    else if (box.y + box.h + gap + ch <= H - m) { x = box.x; y = box.y + box.h + gap; }
    else if (box.y - gap - ch >= m) { x = box.x; y = box.y - gap - ch; }
    else if (box.x + box.w + gap + cw <= W - m) { x = box.x + box.w + gap; y = box.y; }
    else if (box.x - gap - cw >= m) { x = box.x - gap - cw; y = box.y; }
    else { x = W - cw - m - 20; y = H - ch - m - 40; }   // a big target (the image): bottom-right, over it
    card.style.left = `${Math.round(Math.max(m, Math.min(W - cw - m, x)))}px`;
    card.style.top = `${Math.round(Math.max(m, Math.min(H - ch - m, y)))}px`;
    card.classList.remove('measuring');
  }

  return { STEPS, CHAPTERS, start, stop, go: (i) => cur && go(cur, i), get active() { return !!cur; }, get playing() { return !!(cur && cur.playing); }, get index() { return cur ? cur.index : -1; } };
})();
