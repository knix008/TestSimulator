// The tutorial: chapters and steps, in Korean and English (components/Tutorial.jsx
// shows them; MyCodeChecker's tour is the model).
//
// target: where the outline goes — a CSS selector, a list of them (the first
//   one on screen wins), or { label: '<i18n key>' } for a toolbar button found
//   by its translated aria-label. null = no outline (a general step).
// action: what to do before the step is shown, in order:
//   'start' / 'work'          show / leave the start screen
//   'image:<file>'            open a sample picture (samples/<file>)
//   'model:<file>'            open a sample 3D file and wait for it in the view
//   'tab:<id>'                show the right panel on that tab
//   'panels'                  make sure the side panels and the log are open
//   'menu:<selector>'         open the toolbar menu whose button matches
//   'menu:label:<i18n key>'   the same, by the button's translated label
//   'settings:<tab>'          open Settings on that tab
//   'print'                   open the print dialog
//   'light:<id>'              select a light (its move handle shows)
// Menus, dialogs and the selected light from the previous step are closed first.

export const CHAPTERS = [
  { id: 'start', ko: '시작 화면', en: 'Start screen' },
  { id: 'layout', ko: '화면 구성', en: 'The window' },
  { id: 'convert', ko: '이미지를 3D로', en: 'Image to 3D' },
  { id: 'view', ko: '3D 화면', en: 'The 3D view' },
  { id: 'lights', ko: '광원', en: 'Lights' },
  { id: 'look', ko: '재질과 모델', en: 'Material and model' },
  { id: 'save', ko: '저장 · 내보내기 · 인쇄', en: 'Save · export · print' },
  { id: 'settings', ko: '설정과 엔진', en: 'Settings and engine' },
];

export const STEPS = [
  // ── Start screen ──
  { id: 'welcome', chapter: 'start', action: ['start'], target: null,
    ko: ['My3DObjects에 오신 것을 환영합니다', '사진 한 장을 3D 모델로 바꾸고, 3D 파일을 살펴보고, 다른 형식으로 저장하거나 인쇄하는 방법을 단계별로 따라가 봅니다. → 키나 [다음]으로 넘어가고, Esc로 언제든 멈춥니다.'],
    en: ['Welcome to My3DObjects', 'Step by step: turning a picture into a 3D model, looking at 3D files, and saving, exporting or printing them. Press → or Next to go on, Esc to stop at any time.'] },
  { id: 'start-hero', chapter: 'start', action: ['start'], target: '[data-card="hero"]',
    ko: ['시작 화면', '프로그램을 열면 이 화면이 나옵니다. 이미지 열기 · 3D 파일 열기 · 튜토리얼 · 사용 설명서 버튼이 있습니다. 툴바의 홈 버튼으로 언제든 다시 엽니다.'],
    en: ['The start screen', 'The program opens here: open an image or a 3D file, the tutorial and the user’s guide. The Home button in the toolbar brings it back at any time.'] },
  { id: 'start-cards', chapter: 'start', action: ['start'], target: '[data-start-arrange]',
    ko: ['패널 옮기기 · 크기 바꾸기', '시작 화면의 패널은 제목 앞의 ⠿ 를 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꿉니다. [자동 정렬]은 처음 배치로 되돌립니다.'],
    en: ['Move and resize the panels', 'Drag a panel by the ⠿ before its title, resize it by its bottom-right corner. Auto arrange puts them back.'] },
  { id: 'start-samples', chapter: 'start', action: ['start'], target: ['[data-card="samples"]', '.start-samples'],
    ko: ['예제', '최근 파일 아래에 예제가 있습니다. 변환해 볼 이미지, 형식마다 하나씩인 3D 파일, 변환 결과를 바로 열 수 있습니다 (파일 메뉴에도 있습니다).'],
    en: ['Examples', 'Below the recent files: pictures to convert, one 3D file per format, and conversion results, ready to open (also in the File menu).'] },
  { id: 'start-engine', chapter: 'start', action: ['start'], target: '[data-card="engine"]',
    ko: ['엔진과 모델', '변환은 이 컴퓨터의 엔진이 합니다. 처음 실행하면 Python, PyTorch, 모델을 스스로 설치하고 진행 상황을 보여 줍니다. GPU가 있으면 GPU, 없으면 CPU를 씁니다.'],
    en: ['Engine and models', 'Conversions run in the engine on this computer. On first run it installs Python, PyTorch and the models itself and shows its progress. It uses the GPU when there is one, the CPU otherwise.'] },
  { id: 'start-bg', chapter: 'start', action: ['start'], target: '[data-card="bg"]',
    ko: ['시작 화면 배경', '움직이는 배경 21가지 가운데 고르고, 투명도와 속도, 자동 변경 간격을 정합니다. 설정 → 화면에도 같은 항목이 있습니다.'],
    en: ['Start-screen background', 'Pick one of 21 moving backgrounds, its opacity and speed, and whether it changes by itself. The same is in Settings → Screen.'] },

  // ── The window ──
  { id: 'toolbar', chapter: 'layout', action: ['image:images/robot.png'], target: '.toolbar',
    ko: ['툴바', '창의 맨 위 줄입니다. 파일 · 저장 · 인쇄, 열기, 모델 선택과 [3D로 변환], 내보내기, 보기 단추가 있습니다. 빈 곳을 끌면 창이 움직이고, 두 번 누르면 최대화됩니다.'],
    en: ['The toolbar', 'The top row: file, save and print, open, the model picker and Convert, export, the view buttons. Drag an empty spot to move the window; double-click to maximise.'] },
  { id: 'window-buttons', chapter: 'layout', action: ['work'], target: ['.window-controls', '.toolbar-right'],
    ko: ['오른쪽 끝', '테마, 언어(한국어 / English), 사용 설명서, 설정, 정보 단추가 있고, 데스크톱 앱에서는 그 옆에 최소화 · 최대화 · 닫기가 있습니다.'],
    en: ['The right end', 'Theme, language (한국어 / English), user’s guide, settings and about; in the desktop app, minimise, maximise and close next to them.'] },
  { id: 'left-panel', chapter: 'layout', action: ['work', 'panels'], target: '.info-panel.side-left',
    ko: ['입력 패널 (왼쪽)', '변환할 이미지, 모델이 본 이미지(배경을 지운 것), 이번 실행의 기록이 있습니다. 기록을 누르면 그 결과가 다시 3D 화면에 나옵니다.'],
    en: ['The input panel (left)', 'The image to convert, what the model saw (background removed), and this session’s history; click an entry to show it again.'] },
  { id: 'right-panel', chapter: 'layout', action: ['panels', 'tab:convert'], target: '.info-panel.side-right',
    ko: ['설정 패널 (오른쪽)', '변환 · 장면 · 광원 · 재질 · 모델 · 카메라 탭에서 거의 모든 것을 바꿉니다. 패널은 안쪽 경계를 끌어 폭을 바꾸고 머리글 단추로 접습니다.'],
    en: ['The settings panel (right)', 'Convert, Scene, Lights, Material, Model and Camera tabs. Drag its inner edge to resize it; its header button folds it.'] },
  { id: 'log', chapter: 'layout', action: ['panels'], target: '.log-panel',
    ko: ['로그 패널 (아래)', '설치, 모델 불러오기, 변환의 모든 단계가 여기에 쌓입니다. 거르기, 찾기, 복사, 파일로 저장을 할 수 있습니다 (Ctrl+L).'],
    en: ['The log panel (bottom)', 'Installation, model loading and every conversion step collect here; filter, find, copy or save them (Ctrl+L).'] },
  { id: 'status', chapter: 'layout', action: [], target: '.statusbar',
    ko: ['상태 표시줄', '지금 하는 일과 진행률, 정점 · 삼각형 수, 쓰는 모델, 엔진 상태와 장치가 보입니다. 엔진 상태를 누르면 로그가 열립니다.'],
    en: ['The status bar', 'What is happening and its progress, vertex and triangle counts, the model in use, the engine and its device. Click the engine state to open the log.'] },

  // ── Image to 3D ──
  { id: 'open-image', chapter: 'convert', action: ['image:images/robot.png'], target: '.input-figure',
    ko: ['1. 이미지 열기', '[이미지 열기](Ctrl+O)로 사진을 열거나 창에 끌어다 놓습니다. 물체 하나가 가운데에 크게, 배경과 잘 구분되면 결과가 좋습니다. 여기서는 예제 로봇을 열었습니다.'],
    en: ['1. Open an image', 'Open a picture (Ctrl+O) or drop it on the window. One large, centred object that stands out from the background works best. Here the sample robot is open.'] },
  { id: 'pick-model', chapter: 'convert', action: ['menu:.model-picker > .tbtn'], target: '.dropdown',
    ko: ['2. 모델 고르기', 'Stable Fast 3D · SPAR3D는 UV와 PBR 텍스처가 있는 메시를, TripoSR · TRELLIS는 정점 색 메시를, Hunyuan3D는 색 없는 형상을 만듭니다. 처음 쓰는 모델은 자동으로 내려받아 설치합니다.'],
    en: ['2. Pick a model', 'Stable Fast 3D and SPAR3D make a mesh with UVs and PBR textures, TripoSR and TRELLIS a vertex-coloured mesh, Hunyuan3D a shape without colour. A model used for the first time is installed automatically.'] },
  { id: 'options', chapter: 'convert', action: ['tab:convert'], target: '.info-panel.side-right .panel-scroll',
    ko: ['변환 옵션', '배경 자동 제거, 물체 크기 비율, 텍스처 해상도, 리메시, 계산 장치(자동 · GPU · CPU)를 정합니다. GPU에서 실패하면 CPU로 다시 변환합니다.'],
    en: ['Options', 'Background removal, object size, texture resolution, remeshing and the device (auto · GPU · CPU). A conversion that fails on the GPU is redone on the CPU.'] },
  { id: 'convert-button', chapter: 'convert', action: [], target: '.convert-group .tbtn.primary',
    ko: ['3. 3D로 변환', '[3D로 변환](F5)을 누르면 단계와 진행률이 3D 화면 위에 보이고, Esc로 취소합니다. 끝나면 결과가 화면에 나오고 왼쪽 기록에 쌓입니다.'],
    en: ['3. Convert to 3D', 'Convert (F5) shows each step and its progress over the 3D view; Esc cancels. The result appears in the view and in the history on the left.'] },

  // ── The 3D view ──
  { id: 'view', chapter: 'view', action: ['model:results/mug-sf3d.glb'], target: '.viewer3d-host',
    ko: ['3D 화면 다루기', '왼쪽 끌기로 돌리고, 오른쪽 끌기로 옮기고, 휠로 확대합니다. F는 화면 맞춤. 오른쪽 아래 방향 큐브를 누르면 그 방향에서 봅니다. 예제 변환 결과(머그컵)를 열었습니다.'],
    en: ['Moving around', 'Left-drag to orbit, right-drag to pan, the wheel to zoom; F fits the view. Click the view cube (bottom right) to look along an axis. A sample result (the mug) is open.'] },
  { id: 'grid', chapter: 'view', action: ['tab:scene'], target: { label: 'toolbar.grid' },
    ko: ['무한 격자', '바닥에 끝없이 이어지는 격자입니다. 큰 칸 하나가 5×5로 나뉘고, 멀어질수록 흐려집니다. 칸 크기는 모델에 맞춰 자동으로 정해지며 장면 탭에서 바꿉니다.'],
    en: ['The endless grid', 'The ground grid goes on for ever; each major cell is split 5 × 5 and the lines fade with distance. The cell size follows the model, or set it in the Scene tab.'] },
  { id: 'axes-rulers', chapter: 'view', action: ['tab:scene'], target: [{ label: 'toolbar.axes' }],
    ko: ['좌표축과 눈금자', 'X(빨강) · Y(초록) · Z(파랑) 좌표축과, 축을 따라 길이가 쓰인 눈금자, 높이 눈금자가 있습니다. 단위(m · cm · mm · in)는 장면 탭에서 고릅니다.'],
    en: ['Axes and rulers', 'X (red), Y (green), Z (blue) axes, rulers with lengths along them and a height ruler. Pick the units (m · cm · mm · in) in the Scene tab.'] },
  { id: 'bbox', chapter: 'view', action: [], target: { label: 'toolbar.bbox' },
    ko: ['경계 상자와 치수', '모델을 감싸는 상자와 가로 · 세로 · 높이를 보입니다. 오른쪽 단추들로 자동 회전, 와이어프레임, 광원 손잡이도 켜고 끕니다.'],
    en: ['Bounding box and size', 'The box around the model with its width, height and depth. The buttons nearby switch auto-rotate, wireframe and the light handles.'] },
  { id: 'scene-tab', chapter: 'view', action: ['tab:scene'], target: '.info-panel.side-right .panel-scroll',
    ko: ['장면 탭', '격자 크기 · 나누기 · 진하기, 좌표축 · 눈금자, 배경(테마 · 단색 · 그라데이션 · 환경), 환경광, 톤 매핑, 노출, 그림자를 정합니다.'],
    en: ['The Scene tab', 'Grid size, divisions and strength, axes and rulers, the background (theme · colour · gradient · environment), reflections, tone mapping, exposure and shadows.'] },

  // ── Lights ──
  { id: 'lights-tab', chapter: 'lights', action: ['tab:lights'], target: '.info-panel.side-right .panel-scroll',
    ko: ['광원 탭', '태양광 · 점광원 · 스포트라이트 · 하늘광 · 주변광을 더하고 지웁니다. 켜기 · 끄기, 색, 세기, 위치, 그림자를 바꿉니다.'],
    en: ['The Lights tab', 'Add or remove sun, point, spot, sky and ambient lights; switch them, change colour, intensity, position and shadows.'] },
  { id: 'light-drag', chapter: 'lights', action: ['tab:lights', 'light:key'], target: '.viewer3d-host',
    ko: ['광원을 마우스로 옮기기', '3D 화면의 광원 공을 눌러 그대로 끌면 옮겨집니다. 붙어 있는 화살표를 끌면 한 축으로만, 사각형을 끌면 한 평면 위로만 움직입니다. 위치는 저장됩니다.'],
    en: ['Moving a light with the mouse', 'Press a light ball in the 3D view and drag it. Drag an arrow of its handle to move along one axis, a square to stay in one plane. The position is kept.'] },

  // ── Material and model ──
  { id: 'material', chapter: 'look', action: ['tab:material'], target: '.info-panel.side-right .panel-scroll',
    ko: ['재질', '원래 재질, 점토(모양만), 법선, 정점 색으로 바꿔 보고, 와이어프레임 · 플랫 셰이딩 · 양면을 켭니다. 저장할 때는 원래 재질로 저장됩니다.'],
    en: ['Material', 'Show the original material, clay (shape only), normals or vertex colours; switch wireframe, flat shading and back faces. Saving keeps the original material.'] },
  { id: 'model-tab', chapter: 'look', action: ['tab:model'], target: '.info-panel.side-right .panel-scroll',
    ko: ['모델 탭', '정점 · 삼각형 · 재질 · 텍스처 수와 크기를 보고, 회전과 배율을 바꿉니다. 모델은 늘 바닥 위에 놓이고, 회전 · 배율은 저장할 때 함께 적용됩니다.'],
    en: ['The Model tab', 'Vertex, triangle, material and texture counts and the size; rotate and scale. The model stands on the ground; rotation and scale are saved with it.'] },
  { id: 'camera-tab', chapter: 'look', action: ['tab:camera'], target: '.info-panel.side-right .panel-scroll',
    ko: ['카메라 탭', '정면 · 뒷면 · 왼쪽 · 오른쪽 · 윗면 · 아랫면 · 등각 방향, 시야각, 자동 회전 속도를 정합니다.'],
    en: ['The Camera tab', 'Front, back, left, right, top, bottom and isometric views, the field of view and the auto-rotate speed.'] },

  // ── Save · export · print ──
  { id: 'save', chapter: 'save', action: [], target: { label: 'toolbar.save' },
    ko: ['저장', '파일 단추 오른쪽의 [저장](Ctrl+S)은 보이는 모델을 GLB로 저장합니다. 회전 · 배율을 바꾸지 않았으면 원래 파일 그대로 저장합니다.'],
    en: ['Save', 'Save (Ctrl+S, right of File) writes the model in the view as GLB — byte for byte when it was not rotated or scaled.'] },
  { id: 'export', chapter: 'save', action: ['menu:label:toolbar.export'], target: '.dropdown',
    ko: ['내보내기', '다른 형식으로 바꿔 저장합니다: GLB, glTF, OBJ, STL, PLY, USDZ, 3MF, AMF, DAE, VRML, VTK, 점 구름(PCD · XYZ), 그리고 화면 그림(PNG). 어떤 형식으로 연 파일이든 바꿀 수 있습니다.'],
    en: ['Export', 'Save in another format: GLB, glTF, OBJ, STL, PLY, USDZ, 3MF, AMF, DAE, VRML, VTK, point clouds (PCD · XYZ), or the view as a PNG picture — whatever the model came in.'] },
  { id: 'print', chapter: 'save', action: ['print'], target: '.print-modal',
    ko: ['인쇄', '[인쇄](Ctrl+P)는 지금 화면, 4방향 · 6방향 한 장, 방향마다 한 장 가운데 고르고, 모델 정보 · 흰 배경 · 격자를 넣을지, 프린터 · 매수 · 용지 방향을 정해 미리 보며 인쇄합니다.'],
    en: ['Print', 'Print (Ctrl+P): the view, 4 or 6 views on a sheet, or a sheet per view, with model details, a white background or the grid; choose printer, copies and orientation, with a preview.'] },
  { id: 'context', chapter: 'save', action: [], target: '.viewer3d-host',
    ko: ['오른쪽 클릭 메뉴', '3D 화면, 입력 이미지, 기록, 로그에서 오른쪽 단추를 누르면 그 자리에서 쓸 수 있는 명령이 아이콘과 함께 나옵니다.'],
    en: ['Right-click menus', 'Right-click the 3D view, the input image, the history or the log for the commands that apply there, each with its icon.'] },

  // ── Settings and engine ──
  { id: 'settings-engine', chapter: 'settings', action: ['settings:engine'], target: '.settings-modal',
    ko: ['설정 → 엔진', '변환 방법(이 컴퓨터 · 다른 컴퓨터의 엔진 · 유료 Stability AI API — 기본 꺼짐), 계산 장치, Hugging Face 토큰, 엔진 다시 시작 · 다시 설치가 있습니다.'],
    en: ['Settings → Engine', 'How to convert (this computer · another computer’s engine · the paid Stability AI API, off by default), the device, the Hugging Face token, restarting and reinstalling the engine.'] },
  { id: 'settings-screen', chapter: 'settings', action: ['settings:view'], target: '.settings-modal',
    ko: ['설정 → 화면', '시작 화면, 툴바 글자, 상태 표시줄, 로그 패널, 시작 화면 배경, 그리고 시작할 때 튜토리얼을 물을지 정합니다. 테마와 언어는 [모양] 탭에 있습니다.'],
    en: ['Settings → Screen', 'The start screen, toolbar labels, status bar, log panel, the start-screen background, and whether to offer the tutorial at start-up. Theme and language are under Appearance.'] },
  { id: 'done', chapter: 'settings', action: [], target: null,
    ko: ['다 되었습니다', '이제 직접 이미지를 열어 3D로 바꿔 보세요. 튜토리얼은 시작 화면, 도움말 단추, 설정 → 화면에서 언제든 다시 열 수 있고, 자세한 내용은 사용 설명서에 있습니다.'],
    en: ['That’s it', 'Now open a picture of your own and convert it. Reopen the tutorial from the start screen, the Help button or Settings → Screen; the user’s guide has the details.'] },
];

export function chapterName(id, lang) {
  const c = CHAPTERS.find((x) => x.id === id);
  return c ? (lang === 'en' ? c.en : c.ko) : id;
}

export function stepText(step, lang) {
  const [title, body] = (lang === 'en' ? step.en : step.ko) || ['', ''];
  return { title, body };
}

// Auto-play time: long enough to read the text.
export function dwellOf(step, lang) {
  const { body } = stepText(step, lang);
  return Math.min(16000, Math.max(4500, 1800 + body.length * (lang === 'en' ? 45 : 70)));
}
