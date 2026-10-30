// Every keyboard / mouse shortcut of the app, grouped by where it works.
// Shown by the 단축키 window (views/Shortcuts.jsx) and Settings › 키보드.
// Each entry: [keys, [한국어, English]]; keys use '+' inside a chord and ' / '
// between alternatives. Only shortcuts the code really handles belong here:
// App.jsx (global), lib/editor.js + CodeMirror defaults (editor),
// panes/CommandWindow.jsx, sim/ModelEditor.jsx, flow/FlowEditor.jsx,
// graphics/FigureView.jsx.

export const SHORTCUT_GROUPS = [
  { id: 'app', icon: 'apps', name: ['파일 · 창', 'Files · window'], keys: [
    ['Ctrl+N', ['새 스크립트', 'New script']],
    ['Ctrl+O', ['파일 열기', 'Open a file']],
    ['Ctrl+S', ['저장', 'Save']],
    ['Ctrl+Shift+S', ['다른 이름으로 저장', 'Save as']],
    ['Ctrl+P', ['인쇄 (문서, 없으면 명령 창)', 'Print (the document, else the Command Window)']],
    ['Ctrl+,', ['설정', 'Settings']],
    ['F1', ['사용 설명서', 'User manual']],
    ['Ctrl+0', ['명령 창으로 이동', 'Go to the Command Window']],
    ['Ctrl+Shift+0', ['편집기로 이동', 'Go to the editor']],
    ['Ctrl+Z / Ctrl+Y', ['실행 취소 / 다시 실행', 'Undo / redo']],
  ] },
  { id: 'run', icon: 'play', name: ['실행 · 디버그', 'Run · debug'], keys: [
    ['F5', ['스크립트 실행 (멈춘 동안: 계속)', 'Run the script (while paused: continue)']],
    ['Ctrl+Enter', ['현재 %% 섹션 실행', 'Run the current %% section']],
    ['F9', ['선택 영역 실행', 'Run the selection']],
    ['Ctrl+F10', ['단계 실행 시작 (첫 줄에서 멈춤)', 'Step run (pause at the first line)']],
    ['F10', ['한 단계 (멈춘 동안)', 'Step over (while paused)']],
    ['F11 / Shift+F11', ['안으로 / 밖으로 (멈춘 동안)', 'Step in / out (while paused)']],
    ['F12', ['중단점 켜기 / 끄기', 'Toggle a breakpoint']],
    ['Ctrl+C', ['실행 중단 (명령 창)', 'Interrupt (Command Window)']],
  ] },
  { id: 'editor', icon: 'script', name: ['편집기', 'Editor'], keys: [
    ['Ctrl+F', ['찾기 · 바꾸기', 'Find · replace']],
    ['F3 / Shift+F3', ['다음 / 이전 찾기', 'Find next / previous']],
    ['Ctrl+D', ['같은 단어 하나 더 선택', 'Select the next occurrence']],
    ['Ctrl+Shift+L', ['같은 단어 모두 선택', 'Select all occurrences']],
    ['Ctrl+G', ['줄로 이동', 'Go to line']],
    ['Ctrl+R / Ctrl+T', ['주석 / 주석 해제', 'Comment / uncomment']],
    ['Ctrl+/', ['주석 토글', 'Toggle comment']],
    ['Ctrl+] / Ctrl+[', ['들여쓰기 / 내어쓰기', 'Indent / outdent']],
    ['Tab / Shift+Tab', ['선택 줄 들여쓰기 / 내어쓰기', 'Indent / outdent the selected lines']],
    ['Alt+↑ / Alt+↓', ['줄을 위 / 아래로 옮기기', 'Move the line up / down']],
    ['Shift+Alt+↑ / ↓', ['줄 복사 (위 / 아래)', 'Copy the line up / down']],
    ['Ctrl+Shift+K', ['줄 삭제', 'Delete the line']],
    ['Ctrl+Space', ['자동 완성', 'Completion']],
    ['Ctrl+Shift+[ / ]', ['접기 / 펴기', 'Fold / unfold']],
    ['Alt+끌기', ['사각형 선택', 'Rectangular selection']],
    ['마우스 올리기', ['함수 · 상수 설명 툴팁', 'Function / constant tooltip']],
  ] },
  { id: 'cmd', icon: 'terminal', name: ['명령 창', 'Command Window'], keys: [
    ['Enter', ['명령 실행', 'Run the command']],
    ['Shift+Enter', ['줄 바꿈', 'New line']],
    ['↑ / ↓', ['이전 / 다음 명령', 'Previous / next command']],
    ['Tab', ['자동 완성', 'Completion']],
    ['Esc', ['입력 지우기', 'Clear the input']],
    ['Ctrl+C', ['실행 중단 (선택 영역이 있으면 복사)', 'Interrupt (copies when text is selected)']],
  ] },
  { id: 'model', icon: 'model', name: ['모델 편집기', 'Model editor'], keys: [
    ['Ctrl+T', ['시뮬레이션 실행', 'Run the simulation']],
    ['Ctrl+Shift+D', ['모델 갱신 (컴파일)', 'Update the model (compile)']],
    ['Ctrl+E', ['모델 설정', 'Model settings']],
    ['Ctrl+C / X / V', ['복사 / 잘라내기 / 붙여넣기', 'Copy / cut / paste']],
    ['Ctrl+D', ['블록 복제', 'Duplicate']],
    ['Ctrl+A', ['모두 선택', 'Select all']],
    ['Ctrl+R / Ctrl+I', ['회전 / 뒤집기', 'Rotate / flip']],
    ['Ctrl+G / Ctrl+U', ['서브시스템 만들기 / 열기', 'Make / open a subsystem']],
    ['Ctrl+M', ['마스크 편집', 'Edit the mask']],
    ['Ctrl+0', ['맞춤', 'Fit']],
    ['Ctrl+= / Ctrl+-', ['확대 / 축소', 'Zoom in / out']],
    ['방향키 / Shift+방향키', ['블록 옮기기 (격자 / 1 px)', 'Move blocks (grid / 1 px)']],
    ['Delete', ['선택 삭제', 'Delete the selection']],
    ['Space+끌기', ['화면 이동', 'Pan']],
    ['Esc', ['선택 해제', 'Clear the selection']],
  ] },
  { id: 'flow', icon: 'flow', name: ['그래픽 편집기', 'Graphical editor'], keys: [
    ['출력 점 → 입력 점 끌기', ['블록 연결', 'Connect blocks']],
    ['연결된 입력 점 끌기', ['연결 떼어 옮기기', 'Pick a wire up again']],
    ['Delete', ['선택 삭제', 'Delete the selection']],
    ['Ctrl+Z / Ctrl+Y', ['실행 취소 / 다시 실행', 'Undo / redo']],
    ['Ctrl+A', ['모두 선택', 'Select all']],
    ['Ctrl+클릭', ['선택에 더하기 / 빼기', 'Add to / remove from the selection']],
    ['휠 · 배경 끌기', ['확대 · 축소 · 화면 이동', 'Zoom · pan']],
    ['Esc', ['선택 해제', 'Clear the selection']],
  ] },
  { id: 'figure', icon: 'figure', name: ['그림', 'Figures'], keys: [
    ['휠', ['커서 위치에서 확대 / 축소', 'Zoom at the cursor']],
    ['Ctrl+끌기 / 가운데 버튼 끌기', ['이동', 'Pan']],
    ['끌기 (3D)', ['회전', 'Rotate']],
    ['Esc', ['데이터 팁 지우기', 'Clear data tips']],
  ] },
];

/** Total number of shortcuts (shown in the window title). */
export const SHORTCUT_COUNT = SHORTCUT_GROUPS.reduce((n, g) => n + g.keys.length, 0);
