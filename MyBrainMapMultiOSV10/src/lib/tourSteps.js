// The guided tour (도움말 › 튜토리얼, and on the very first launch): one step per
// feature. Each step points at a part of the window (`target`: a CSS selector;
// `group: true` widens it to the toolbar group the element is in) and explains it.
// `enter` / `leave` are app actions run when the step opens / closes (open the
// Kanban board, the Notes tab …). `play` shows the feature working, one move at a
// time, as soon as the step opens (the card's "다시 보기" button plays it again):
//   'action'             an app action (runAction id)
//   1200                 wait that many ms
//   { spot, group }      move the spotlight to another part of the window
//   { say: [ko, en] }    the line under the text that says what is happening now
// A step with `edits: true` changes the tutorial map while it plays; leaving the
// step (or playing it again) puts the map back the way it was.
// A step without a target is a centred card. Texts are [ko, en].
//
// `tour:sel:0/3` selects a topic of the tutorial map by its place (main topic 0,
// its subtopic 3; `root` is the central topic; `a,b` selects both).

const say = (ko, en) => ({ say: [ko, en] });
const spot = (target, group = false) => ({ spot: target, group });
const MAP = '.map-canvas';
// a topic dragged across the map: small moves, so the drag can be seen
const drag = (dx, dy, n = 10) => Array.from({ length: n }, () => [`tour:nudge:${Math.round(dx / n)}:${Math.round(dy / n)}`, 70]).flat();

export const TOUR_STEPS = [
  {
    id: 'welcome',
    title: ['MyBrainMap 에 오신 것을 환영합니다', 'Welcome to MyBrainMap'],
    text: ['이 안내는 화면의 각 부분을 차례로 짚으며 기능을 설명하고, **단계마다 그 기능을 직접 실행해 보여 줍니다.** 뒤에 열린 **튜토리얼 맵**에서 따라 해 볼 수 있습니다.\n\n→ 다음 · ← 이전 · Esc 끝내기', 'This guide walks through each part of the window and **shows every feature working, step by step.** Try it yourself on the **tutorial map** behind it.\n\n→ next · ← back · Esc ends'],
  },
  {
    id: 'menus', target: '.menus', enter: 'view:map',
    title: ['메뉴 막대', 'Menu bar'],
    text: ['파일 · 편집 · 삽입 · 서식 · 보기 · 도구 · 도움말. 모든 명령이 아이콘 · 단축키와 함께 여기에 있습니다. 맨 왼쪽 **시작** 단추는 시작 화면을 엽니다.', 'File, Edit, Insert, Format, View, Tools, Help — every command, with its icon and shortcut. The **Start** button at the far left opens the start page.'],
  },
  {
    id: 'file', target: '[data-cmd="new"]', group: true,
    title: ['파일', 'Files'],
    text: ['새 맵(Ctrl+N), 열기(Ctrl+O), 저장(Ctrl+S), 내보내기(Ctrl+E), 인쇄(Ctrl+P). 바꾼 맵을 닫으면 저장할지 묻습니다. 맵은 .tmap 파일로 저장되고 FreeMind · XMind · OPML · Markdown 도 엽니다.', 'New (Ctrl+N), open (Ctrl+O), save (Ctrl+S), export (Ctrl+E), print (Ctrl+P). Closing a changed map asks whether to save it. Maps are saved as .tmap files; FreeMind, XMind, OPML and Markdown open too.'],
  },
  {
    id: 'topics', target: '[data-cmd="addChild"]', group: true, edits: true,
    title: ['토픽 만들기', 'Adding topics'],
    text: ['토픽을 고르고 **Tab** 은 하위 토픽, **Enter** 는 형제 토픽입니다. 글자를 치면 바로 편집되고(F2), 도구 모음의 이 단추들로도 만듭니다.', 'Select a topic: **Tab** adds a subtopic, **Enter** a sibling. Typing edits it straight away (F2); these toolbar buttons do the same.'],
    play: [
      say('① 토픽 "기본 조작" 을 고릅니다', '① Select the topic "Basics"'), spot(MAP), 'tour:sel:0', 900,
      say('② Tab — 하위 토픽이 생깁니다', '② Tab — a subtopic appears'), 'tour:add:child:새 하위 토픽|New subtopic', 1300,
      say('③ Enter — 바로 아래에 형제 토픽', '③ Enter — a sibling right below it'), 'tour:add:sibling:형제 토픽|A sibling', 1300,
      say('④ 글자를 치면 이름이 바뀝니다 (F2)', '④ Type to rename it (F2)'), 'tour:rename:이름을 바꾼 토픽|Renamed topic', 1300,
      say('⑤ 상위 토픽 넣기 — 선택한 토픽 위에 끼워 넣습니다', '⑤ Insert a parent above the selected topic'), 'tour:add:parent:상위 토픽|Parent topic', 1500,
    ],
  },
  {
    id: 'canvas', target: MAP, edits: true,
    title: ['끌어서 옮기기', 'Dragging topics'],
    text: ['토픽을 끌어 다른 토픽 위에 놓으면 하위 토픽, 가장자리에 놓으면 형제 토픽이 됩니다. **빈 곳에 놓으면 연결된 채로 옮겨지고**, Alt 를 누른 채 놓으면 떼어서 플로팅 토픽이 됩니다. 빈 곳을 끌면 화면 이동, 오른쪽 클릭은 메뉴입니다.', 'Drop a topic on another to make it a subtopic, on its edge for a sibling. **Dropped on empty space it moves and stays connected**; hold Alt to detach it as a floating topic. Drag empty space to pan; right-click opens a menu.'],
    play: [
      say('① "끌어서 옮기기" 토픽을 고릅니다', '① Select "Drag to move"'), 'tour:sel:0/3', 900,
      say('② 빈 곳으로 끌면 — 연결선이 따라옵니다', '② Drag it to empty space — its line follows'), ...drag(150, -170), 1200,
      say('③ 다시 위로 — 어디에 두어도 연결은 그대로', '③ And up again — wherever it goes it stays connected'), ...drag(-70, 90), 1200,
      say('④ Alt 를 누른 채 놓으면 떼어서 플로팅 토픽', '④ Alt-drop detaches it as a floating topic'), 'detachFloating', 1600,
    ],
  },
  {
    id: 'undo', target: '[data-cmd="undo"]', group: true, edits: true,
    title: ['실행 취소 · 다시 실행', 'Undo and redo'],
    text: ['Ctrl+Z / Ctrl+Y. 모든 편집을 한 단계씩 되돌립니다. 맵마다 기록이 따로 있습니다.', 'Ctrl+Z / Ctrl+Y. Every edit can be undone step by step; each map has its own history.'],
    play: [
      say('① 토픽 하나를 만들고', '① Add a topic'), spot(MAP), 'tour:sel:1', 'tour:add:child:Ctrl+Z 로 사라질 토픽|Ctrl+Z will remove me', 1400,
      say('② Ctrl+Z — 사라집니다', '② Ctrl+Z — it is gone'), 'undo', 1300,
      say('③ Ctrl+Y — 다시 나타납니다', '③ Ctrl+Y — it is back'), 'redo', 1300,
      say('④ Ctrl+Z — 한 번 더 되돌리기', '④ Ctrl+Z — undo once more'), 'undo', 1000,
    ],
  },
  {
    id: 'rulers', target: '[data-cmd="toggle:showGrid"]', group: true,
    title: ['격자 · 눈금자 · 전체 보기 창', 'Grid, rulers, overview'],
    text: ['세 단추로 맵 뒤의 격자(Ctrl+Alt+G), 위 · 왼쪽 눈금자(Ctrl+Alt+R), 오른쪽 아래의 전체 보기 창(Ctrl+Alt+O)을 켜고 끕니다. 눈금자의 0 은 중심 토픽입니다.', 'These three buttons switch the grid behind the map (Ctrl+Alt+G), the rulers on the top and left (Ctrl+Alt+R) and the overview window at the bottom right (Ctrl+Alt+O). 0 on the rulers is the central topic.'],
    play: [
      say('① 격자 끄기 · 켜기', '① Grid off and on'), spot('[data-cmd="toggle:showGrid"]'), 'toggle:showGrid', 900, 'toggle:showGrid', 900,
      say('② 눈금자 끄기 · 켜기', '② Rulers off and on'), spot('[data-cmd="toggle:showRulers"]'), 'toggle:showRulers', 900, 'toggle:showRulers', 900,
      say('③ 전체 보기 창 끄기 · 켜기', '③ Overview off and on'), spot('[data-cmd="toggle:overviewVisible"]'), 'toggle:overviewVisible', 900, 'toggle:overviewVisible', 900,
    ],
  },
  {
    id: 'zoom', target: '[data-cmd="zoomIn"]', group: true,
    title: ['확대 · 축소', 'Zoom'],
    text: ['축소 · 비율(누르면 100%) · 확대 · 맵 전체. Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+1, 또는 Ctrl+휠.', 'Zoom out, the ratio (click for 100%), zoom in, fit the map. Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+1, or Ctrl+wheel.'],
    play: [
      say('① 확대 (Ctrl+=)', '① Zoom in (Ctrl+=)'), spot(MAP), 'zoomIn', 700, 'zoomIn', 700, 'zoomIn', 1000,
      say('② 축소 (Ctrl+-)', '② Zoom out (Ctrl+-)'), 'zoomOut', 700, 'zoomOut', 1000,
      say('③ 맵 전체 보기 (Ctrl+0)', '③ Fit the whole map (Ctrl+0)'), 'fit', 1200,
    ],
  },
  {
    id: 'overview', target: '.overview',
    title: ['전체 보기 창', 'Overview window'],
    text: ['맵 전체와 지금 보이는 부분(틀)을 보여 줍니다. 누르거나 끌면 그곳으로 이동합니다. 켜 두면 늘 보입니다.', 'The whole map with a frame around the part on screen. Click or drag in it to go there. While it is on it always shows.'],
    play: [
      say('① 크게 확대하면 틀이 작아집니다', '① Zoomed in, the frame gets small'), 'zoomIn', 600, 'zoomIn', 600, 'zoomIn', 1400,
      say('② 맵 전체로 돌아가기', '② Back to the whole map'), 'fit', 1200,
    ],
  },
  {
    id: 'redraw', target: '[data-cmd="redraw:orgDown"]', group: true, edits: true,
    title: ['방향 바꿔 다시 그리기 · 자동 정리', 'Redraw and auto arrange'],
    text: ['위→아래(Ctrl+Alt+↓), 왼→오(Ctrl+Alt+→), 오→왼(Ctrl+Alt+←), 양쪽(Ctrl+Alt+M)으로 맵을 다시 그립니다. 마지막 단추 **자동 정리**(Ctrl+Shift+L)는 손으로 옮긴 토픽을 제자리로 돌리고 균형을 맞춥니다.', 'Redraw the map top→bottom (Ctrl+Alt+↓), left→right (Ctrl+Alt+→), right→left (Ctrl+Alt+←) or on both sides (Ctrl+Alt+M). The last button, **auto arrange** (Ctrl+Shift+L), puts moved topics back and balances the sides.'],
    play: [
      say('① 위→아래', '① Top → bottom'), spot('[data-cmd="redraw:orgDown"]'), 'redraw:orgDown', 1800,
      say('② 왼쪽→오른쪽', '② Left → right'), spot('[data-cmd="redraw:right"]'), 'redraw:right', 1800,
      say('③ 오른쪽→왼쪽', '③ Right → left'), spot('[data-cmd="redraw:left"]'), 'redraw:left', 1800,
      say('④ 양쪽', '④ Both sides'), spot('[data-cmd="redraw:map"]'), 'redraw:map', 1500,
      say('⑤ 토픽을 옮겨 놓고…', '⑤ Move a topic away…'), spot(MAP), 'tour:sel:1', ...drag(120, 140, 8), 1000,
      say('⑥ 자동 정리 — 제자리로', '⑥ Auto arrange — back in place'), spot('[data-cmd="arrange"]'), 'arrange', 1600,
    ],
  },
  {
    id: 'layouts', target: '[data-cmd="layoutMenu"]', edits: true,
    title: ['레이아웃 9가지', 'Nine layouts'],
    text: ['레이아웃 단추로 맵 전체의 모양을 바꿉니다: 맵 · 오른쪽 · 왼쪽 · **조직도**(아래 · 위) · **트리**(오른쪽 · 왼쪽) · **타임라인** · **피쉬본**(원인 분석).', 'The layout button changes the shape of the whole map: map, right, left, **org chart** (down, up), **tree** (right, left), **timeline** and **fishbone** (cause analysis).'],
    play: [
      say('① 조직도', '① Org chart'), spot(MAP), 'layout:orgDown', 2000,
      say('② 트리 (개요처럼)', '② Tree (like an outline)'), 'layout:treeRight', 2000,
      say('③ 타임라인', '③ Timeline'), 'layout:timeline', 2000,
      say('④ 피쉬본 — 뼈대는 항상 곧은 직선', '④ Fishbone — the bones are always straight'), 'layout:fishbone', 2400,
      say('⑤ 다시 맵으로', '⑤ Back to the map'), 'layout:map', 1200,
    ],
  },
  {
    id: 'sublayout', target: MAP, edits: true,
    title: ['가지 하나만 다르게', 'One branch laid out differently'],
    text: ['작업 창 › 서식 › **하위 토픽 배치**로 가지 하나만 다른 방향으로 펼칠 수 있습니다. 맵 전체 레이아웃은 그대로입니다.', 'Task pane › Format › **Subtopic layout** lays out one branch in its own way; the rest of the map keeps its layout.'],
    play: [
      say('① "레이아웃 · 정리" 가지를 고르고', '① Select the "Layouts and arranging" branch'), 'tour:sel:2', 900,
      say('② 하위 토픽을 아래로', '② Its subtopics downward'), 'tour:subLayout:down', 1800,
      say('③ 트리로', '③ As a tree'), 'tour:subLayout:treeRight', 1800,
      say('④ 원래대로', '④ Back as it was'), 'tour:subLayout:', 1000,
    ],
  },
  {
    id: 'style', target: '[data-cmd="styleMenu"]', edits: true,
    title: ['맵 스타일', 'Map styles'],
    text: ['맵 스타일은 토픽의 모양 · 색 · 선을 한꺼번에 바꿉니다(클래식, 무지개, 파스텔, 비즈니스, 청사진, 스케치 …). 화면 전체의 색은 **테마**(40가지)로 바꿉니다.', 'A map style changes the shapes, colours and lines of every topic at once (classic, rainbow, pastel, business, blueprint, sketch …). The colours of the whole window come from the **theme** (40 of them).'],
    play: [
      say('① 무지개', '① Rainbow'), spot(MAP), 'style:rainbow', 1500,
      say('② 비즈니스', '② Business'), 'style:business', 1500,
      say('③ 청사진', '③ Blueprint'), 'style:blueprint', 1500,
      say('④ 스케치', '④ Sketch'), 'style:sketch', 1500,
      say('⑤ 테마 바꾸기 — 창 전체의 색', '⑤ Next theme — the colours of the window'), spot('[data-cmd="nextTheme"]'), 'nextTheme', 1400, 'nextTheme', 1400,
    ],
  },
  {
    id: 'format', target: '.task-pane', enter: 'tour:pane:format', edits: true,
    title: ['서식', 'Formatting'],
    text: ['작업 창 › **서식**: 토픽 모양 28가지, 채우기 · 글자 · 테두리 색, 글꼴, 굵게 · 기울임, 선 색과 굵기. 여러 토픽을 고르면 한꺼번에 바뀝니다.', 'Task pane › **Format**: 28 topic shapes, fill, text and border colours, fonts, bold and italic, line colour and width. With several topics selected they all change together.'],
    play: [
      say('① 토픽을 고르고', '① Select a topic'), 'tour:sel:0/0', 900,
      say('② 모양: 타원', '② Shape: ellipse'), spot(MAP), 'shape:ellipse', 1200,
      say('③ 모양: 육각형', '③ Shape: hexagon'), 'shape:hexagon', 1200,
      say('④ 굵게 · 글자 크게', '④ Bold, bigger text'), 'bold', 700, 'growFont', 700, 'growFont', 1200,
    ],
  },
  {
    id: 'content', target: '.task-pane', enter: 'tour:pane:markers', edits: true,
    title: ['아이콘 · 우선순위 · 진행률', 'Icons, priority, progress'],
    text: ['작업 창 › **아이콘**: 우선순위(1~9), 진행률, 깃발, 별, 기호와 **태그**. 필터와 칸반 보드에서 이 표시로 거르고 묶습니다.', 'Task pane › **Icons**: priority (1–9), progress, flags, stars, symbols and **tags**. The filter and the Kanban board use them.'],
    play: [
      say('① 토픽을 고르고', '① Select a topic'), 'tour:sel:0/1', 900,
      say('② 우선순위 1', '② Priority 1'), spot(MAP), 'priority:1', 1200,
      say('③ 진행률 50%', '③ Progress 50%'), 'progress:50', 1200,
      say('④ 아이콘 붙이기', '④ Add icons'), 'tour:icon:star', 900, 'tour:icon:flag-red', 1400,
    ],
  },
  {
    id: 'notes', target: '.task-pane', enter: 'tour:pane:notes',
    title: ['메모 · 댓글 · 사용자 속성', 'Notes, comments, properties'],
    text: ['작업 창 › **메모**: Markdown 메모(**굵게**, 목록, 링크). 그 아래에 작성자와 날짜가 남는 **댓글**, "담당 = 김기획" 같은 **사용자 속성**. 메모나 댓글이 있는 토픽에는 표시가 붙습니다.', 'Task pane › **Notes**: Markdown notes (**bold**, lists, links). Below them **comments** with author and date, and **custom properties** such as "Owner = Kim". Topics with notes or comments show a badge.'],
    play: [
      say('① 메모가 있는 토픽', '① A topic with a note'), 'tour:sel:3/0', 1800,
      say('② 댓글과 속성이 있는 토픽', '② A topic with comments and properties'), 'tour:comments', 2200,
    ],
  },
  {
    id: 'task', target: '.task-pane', enter: 'tour:pane:task',
    title: ['작업 정보', 'Task info'],
    text: ['작업 창 › **작업**: 시작 · 마감일, 진행률, 담당, 작업량, 마일스톤. 날짜가 있는 토픽은 **간트 차트**에 막대로 나옵니다.', 'Task pane › **Task**: start and due dates, progress, resources, effort, milestones. Dated topics show as bars in the **Gantt chart**.'],
    play: [say('작업 정보가 있는 토픽을 고릅니다', 'A topic with task info'), 'tour:sel:3/3', 1800],
  },
  {
    id: 'links', target: '.task-pane', enter: 'tour:pane:links',
    title: ['링크 · 첨부 · 그림', 'Links, attachments, pictures'],
    text: ['작업 창 › **링크**: 웹 주소나 파일 링크(Ctrl+K), 첨부 파일, 토픽 그림. 파일을 토픽에 끌어 놓으면 첨부되고, 그림을 붙여 넣으면 토픽 그림이 됩니다.', 'Task pane › **Links**: a web or file link (Ctrl+K), attachments and a picture on the topic. Drop a file on a topic to attach it; paste a picture to show it on the topic.'],
    play: [say('링크가 있는 토픽을 고릅니다', 'A topic with a link'), 'tour:sel:3/4', 1800],
  },
  {
    id: 'relationship', target: '[data-cmd="relationship"]', edits: true,
    title: ['관계선', 'Relationships'],
    text: ['다른 가지의 토픽끼리 잇는 곡선입니다(Ctrl+Shift+R 후 상대 토픽을 누르기). 손잡이로 곡선을 바꾸고 이름 · 색 · 화살표 · 점선을 고릅니다.', 'A curve between topics on different branches (Ctrl+Shift+R, then click the other topic). Drag the handles to bend it; give it a label, a colour, arrows or a dash.'],
    play: [
      say('① 두 토픽을 고르고', '① Select two topics'), spot(MAP), 'tour:sel:1/0,5/2', 1100,
      say('② 관계선 — 두 토픽이 이어집니다', '② Relationship — the two are joined'), 'relationship', 1800,
    ],
  },
  {
    id: 'boundary', target: '[data-cmd="boundary"]', edits: true,
    title: ['경계', 'Boundaries'],
    text: ['가지 하나를 테두리로 묶습니다(Ctrl+Shift+B). 둥근 사각형이나 구름 모양에 이름을 붙일 수 있습니다.', 'A frame around a branch (Ctrl+Shift+B), rounded or cloud-shaped, with a label.'],
    play: [
      say('① 가지를 고르고', '① Select a branch'), spot(MAP), 'tour:sel:1', 900,
      say('② 경계 — 가지 전체를 묶습니다', '② Boundary — round the whole branch'), 'boundary', 1500,
      say('③ 구름 모양', '③ Cloud-shaped'), 'boundaryCloud', 1500,
    ],
  },
  {
    id: 'summary', target: '[data-cmd="summary"]', edits: true,
    title: ['요약', 'Summaries'],
    text: ['하위 토픽 옆에 괄호를 두르고 요약을 붙입니다(Ctrl+]). 괄호 오른쪽의 글은 눌러서 고칩니다.', 'A brace beside the subtopics with a summary (Ctrl+]). Click the text after the brace to change it.'],
    play: [
      say('① 하위 토픽이 있는 가지를 고르고', '① Select a branch with subtopics'), spot(MAP), 'tour:sel:0', 900,
      say('② 요약 — 괄호와 요약 글', '② Summary — a brace and its text'), 'tour:summary:6가지 기본 조작|Six basics', 1800,
    ],
  },
  {
    id: 'callout', target: '[data-cmd="addCallout"]', edits: true,
    title: ['설명선 · 플로팅 토픽', 'Callouts and floating topics'],
    text: ['**설명선**(Ctrl+Shift+Enter)은 토픽 위에 말풍선처럼 붙는 덧말이고, **플로팅 토픽**은 어디에도 이어지지 않은 토픽입니다(빈 곳을 두 번 누르기).', 'A **callout** (Ctrl+Shift+Enter) is a remark that hangs over a topic like a speech bubble; a **floating topic** is not joined to anything (double-click empty space).'],
    play: [
      say('① 토픽을 고르고 설명선', '① Select a topic, add a callout'), spot(MAP), 'tour:sel:2', 700, 'tour:callout:여기를 먼저 보세요|Look here first', 1800,
      say('② 플로팅 토픽', '② A floating topic'), 'tour:floating:따로 떠 있는 생각|A loose thought', 1800,
    ],
  },
  {
    id: 'fold', target: MAP, edits: true,
    title: ['접기 · 펴기 · 가지만 보기', 'Fold, unfold, focus'],
    text: ['토픽 옆의 원을 누르면 가지가 접힙니다(숫자는 숨은 토픽 수). 보기 › 수준별 펼치기, **가지만 보기(F4)** 는 고른 가지만 남깁니다.', 'Click the circle next to a topic to fold its branch (the number is how many are hidden). View › expand to a level; **focus (F4)** shows only the selected branch.'],
    play: [
      say('① 가지 접기', '① Fold a branch'), 'tour:sel:0', 600, 'toggleFold', 1400,
      say('② 다시 펴기', '② Unfold it'), 'toggleFold', 1200,
      say('③ 주 토픽만 보이게 (수준 1)', '③ Main topics only (level 1)'), 'collapseAll', 1500,
      say('④ 모두 펼치기', '④ Expand everything'), 'expandAll', 1300,
      say('⑤ 가지만 보기 (F4)', '⑤ Focus on a branch (F4)'), 'tour:sel:3', 500, 'focusBranch', 1800,
      say('⑥ 맵 전체로 돌아가기', '⑥ Back to the whole map'), 'focusOff', 1200,
    ],
  },
  {
    id: 'sidebar', target: '.sidebar', leave: 'side:outline',
    title: ['왼쪽 패널', 'Left pane'],
    text: ['**개요**(맵 전체의 나무), **찾기**(찾기 · 바꾸기, Ctrl+F), **필터**(우선순위 · 아이콘 · 태그로 거르기). 항목을 누르면 그 토픽으로 가고, 오른쪽 클릭하면 토픽 메뉴가 열립니다.', '**Outline** (the whole map as a tree), **Find** (find and replace, Ctrl+F), **Filter** (by priority, icon, tag). Click an entry to go to that topic; right-click it for the topic menu.'],
    play: [
      say('① 개요 — 맵 전체가 나무 모양 목록으로', '① Outline — the whole map as a tree'), 'side:outline', 1500,
      say('② 찾기 · 바꾸기 (Ctrl+F)', '② Find and replace (Ctrl+F)'), 'side:find', 1500,
      say('③ 필터 — 표시로 거르기', '③ Filter — narrow by markers'), 'side:filter', 1500,
    ],
  },
  {
    id: 'panes', target: '.pane-splitter-v.left', leave: 'tour:showPanes',
    title: ['패널 접고 펴기', 'Folding the panes'],
    text: ['패널 경계의 작은 화살표를 누르거나 경계를 두 번 누르면 패널이 접힙니다(Ctrl+Alt+S 왼쪽 · Ctrl+Alt+P 오른쪽). 접힌 패널은 맵 가장자리의 탭으로 다시 폅니다. 경계를 끌면 너비가 바뀝니다.', 'Click the small arrow on a pane border, or double-click the border, to fold the pane (Ctrl+Alt+S left, Ctrl+Alt+P right). The tab at the edge of the map brings it back; drag the border to resize.'],
    play: [
      say('① 왼쪽 패널 접기', '① Fold the left pane'), spot('.main-area'), 'tour:demoFold', 1300,
      say('② 오른쪽 패널 접기 — 맵이 넓어집니다', '② Fold the right pane — more room for the map'), 'toggle:panelVisible', 1500,
      say('③ 다시 펴기', '③ Bring them back'), 'tour:showPanes', 1200,
    ],
  },
  {
    id: 'views', target: '[data-cmd="view:map"]', group: true, enter: 'view:map', leave: 'view:map',
    title: ['보기', 'Views'],
    text: ['같은 맵을 **맵 · 개요 · 간트 차트 · 칸반 보드**로 봅니다. 어느 보기에서 고쳐도 같은 맵이 바뀝니다. 마지막 단추는 **프레젠테이션**(F5, 가지마다 한 장)입니다.', 'See the same map as **map, outline, Gantt chart or Kanban board** — a change in any view changes the map. The last button is **presentation** (F5, one slide per branch).'],
    play: [
      say('① 개요 보기 — 들여 쓴 목록으로 편집', '① Outline — edit it as an indented list'), spot('.main-area'), 'view:outline', 2000,
      say('② 간트 차트 — 날짜가 있는 토픽이 막대로', '② Gantt chart — dated topics as bars'), 'view:gantt', 2200,
      say('③ 칸반 보드 — 주 토픽은 열, 하위 토픽은 카드', '③ Kanban — main topics are columns, subtopics cards'), 'view:kanban', 2200,
      say('④ 다시 맵', '④ Back to the map'), 'view:map', 1000,
    ],
  },
  {
    id: 'kanban', target: '.kanban-board', enter: 'view:kanban', leave: 'view:map',
    title: ['칸반 보드', 'Kanban board'],
    text: ['주 토픽은 열, 하위 토픽은 카드입니다. 카드를 다른 열로 끌면 맵에서도 그 주 토픽 아래로 옮겨지고, 열 아래 "카드 추가"로 하위 토픽을 만듭니다.', 'Main topics are columns, subtopics are cards. Drag a card to another column and it moves under that main topic on the map too; "Add card" adds a subtopic.'],
  },
  {
    id: 'export', target: '.dlg', enter: 'export', leave: 'tour:closeDialog',
    title: ['내보내기', 'Export'],
    text: ['PNG · JPEG · SVG · PDF · Word · HTML · Markdown · OPML · 텍스트 · FreeMind · XMind · CSV 로 내보냅니다. 그림은 배경과 배율을 고를 수 있습니다.', 'Export as PNG, JPEG, SVG, PDF, Word, HTML, Markdown, OPML, text, FreeMind, XMind or CSV. Pictures can have a background and a scale.'],
  },
  {
    id: 'print', target: '.dlg', enter: 'print', leave: 'tour:closeDialog',
    title: ['인쇄 미리 보기', 'Print preview'],
    text: ['인쇄(Ctrl+P)는 미리 보기에서 용지 · 방향 · 여백 · 쪽 수를 정하고 인쇄하거나 PDF 로 저장합니다.', 'Print (Ctrl+P) sets the paper, orientation, margins and number of pages in a preview, then prints or saves a PDF.'],
  },
  {
    id: 'settings', target: '[data-cmd="settings"]',
    title: ['테마와 설정', 'Themes and settings'],
    text: ['테마 단추는 다음 테마로(▾ 는 40가지 목록), 국기는 한국어 / English, 톱니바퀴는 설정(Ctrl+,)입니다. 설정에서 시작 화면 배경 21가지, 자동 저장, 격자 · 눈금자를 정합니다.', 'The theme button goes to the next theme (▾ for all 40), the flag switches 한국어 / English, the gear opens Settings (Ctrl+,): start-page backgrounds, auto save, grid and rulers.'],
  },
  {
    id: 'help', target: '[data-menu="help"]',
    title: ['도움말', 'Help'],
    text: ['도움말(F1)은 모든 기능을 그림과 함께 별도 창에서 설명합니다. **도움말 › 튜토리얼**로 이 안내를 언제든 다시 볼 수 있고, 단축키 목록도 여기에 있습니다.', 'Help (F1) explains every feature with pictures in a window of its own. **Help › Tutorial** brings this guide back any time; the shortcut list is here too.'],
  },
  {
    id: 'done',
    title: ['준비 끝!', "You're ready!"],
    text: ['이제 뒤에 열린 **튜토리얼 맵**의 단원을 위에서부터 따라 해 보세요. 토픽을 누르면 오른쪽 메모 탭에 해 볼 일이 보입니다. 마음대로 고쳐도 됩니다 — Ctrl+Z 로 되돌립니다.', 'Now follow the lessons of the **tutorial map** behind this from the top. Click a topic to see what to try in the Notes tab. Change anything — Ctrl+Z undoes it.'],
  },
];
