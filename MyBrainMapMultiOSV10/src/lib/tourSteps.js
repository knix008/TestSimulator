// The guided tour (도움말 › 튜토리얼, and on the very first launch): one step per
// feature. Each step points at a part of the window (`target`: a CSS selector;
// `group: true` widens it to the toolbar group the element is in) and explains it.
// `enter` / `leave` are app actions run when the step opens / closes (open the
// Kanban board, the Notes tab …); `demo` is the action of the card's "직접 보기"
// button, which shows the feature working on the tutorial map. A step without a
// target is a centred card.
// Texts are [ko, en].

export const TOUR_STEPS = [
  {
    id: 'welcome',
    title: ['My BrainMap 에 오신 것을 환영합니다', 'Welcome to My BrainMap'],
    text: ['이 안내는 화면의 각 부분을 차례로 짚으며 기능을 설명합니다. 뒤에 열린 **튜토리얼 맵**에는 단원마다 직접 해 볼 일이 적혀 있습니다.\n\n→ 다음 · ← 이전 · Esc 끝내기', 'This guide walks through each part of the window and explains what it does. The **tutorial map** behind it has something to try in every lesson.\n\n→ next · ← back · Esc ends'],
  },
  {
    id: 'menus', target: '.menus', enter: 'view:map',
    title: ['메뉴 막대', 'Menu bar'],
    text: ['파일 · 편집 · 삽입 · 서식 · 보기 · 도구 · 도움말. 모든 명령이 아이콘 · 단축키와 함께 여기에 있습니다. 맨 왼쪽 **시작** 단추는 시작 화면을 엽니다.', 'File, Edit, Insert, Format, View, Tools, Help — every command, with its icon and shortcut. The **Start** button at the far left opens the start page.'],
  },
  {
    id: 'file', target: '[data-cmd="new"]', group: true,
    title: ['파일', 'Files'],
    text: ['새 맵(Ctrl+N), 열기(Ctrl+O), 저장(Ctrl+S), 내보내기(Ctrl+E — PNG · PDF · Word · HTML · XMind …), 인쇄(Ctrl+P). 바꾼 맵을 닫으면 저장할지 묻습니다.', 'New (Ctrl+N), open (Ctrl+O), save (Ctrl+S), export (Ctrl+E — PNG, PDF, Word, HTML, XMind …), print (Ctrl+P). Closing a changed map asks whether to save it.'],
  },
  {
    id: 'topics', target: '[data-cmd="addChild"]', group: true, demo: 'tour:demoTopic',
    title: ['토픽 만들기', 'Adding topics'],
    text: ['하위 토픽(Tab), 형제 토픽(Enter), 상위 토픽, 설명선, 플로팅 토픽, **관계선**(Ctrl+Shift+R), **경계**(Ctrl+Shift+B), **요약**(Ctrl+]). 토픽을 고르고 글자를 치면 바로 편집됩니다.', 'Subtopic (Tab), sibling (Enter), parent, callout, floating topic, **relationship** (Ctrl+Shift+R), **boundary** (Ctrl+Shift+B), **summary** (Ctrl+]). Select a topic and type to edit it.'],
  },
  {
    id: 'canvas', target: '.map-canvas', demo: 'tour:demoDrag',
    title: ['맵 캔버스', 'The map'],
    text: ['토픽을 끌어 다른 토픽 위에 놓으면 하위 토픽, 가장자리에 놓으면 형제 토픽이 됩니다. **빈 곳에 놓으면 연결된 채로 옮겨지고**, Alt 를 누른 채 놓으면 떼어서 플로팅 토픽이 됩니다. 빈 곳을 끌면 화면 이동, Ctrl+휠은 확대 · 축소, 오른쪽 클릭은 아이콘이 붙은 메뉴입니다.', 'Drop a topic on another to make it a subtopic, on its edge for a sibling. **Dropped on empty space it moves and stays connected**; hold Alt to detach it as a floating topic. Drag empty space to pan, Ctrl+wheel zooms, right-click opens a menu with icons.'],
  },
  {
    id: 'undo', target: '[data-cmd="undo"]', group: true, demo: 'undo',
    title: ['실행 취소 · 다시 실행', 'Undo and redo'],
    text: ['Ctrl+Z / Ctrl+Y. 모든 편집을 한 단계씩 되돌립니다. 맵마다 기록이 따로 있습니다.', 'Ctrl+Z / Ctrl+Y. Every edit can be undone step by step; each map has its own history.'],
  },
  {
    id: 'rulers', target: '[data-cmd="toggle:showGrid"]', group: true, demo: 'toggle:showGrid',
    title: ['격자 · 눈금자 · 전체 보기 창', 'Grid, rulers, overview'],
    text: ['세 단추로 맵 뒤의 격자(Ctrl+Alt+G), 위 · 왼쪽 눈금자(Ctrl+Alt+R), 오른쪽 아래의 전체 보기 창(Ctrl+Alt+O)을 켜고 끕니다. 눈금자의 0 은 중심 토픽입니다.', 'These three buttons switch the grid behind the map (Ctrl+Alt+G), the rulers on the top and left (Ctrl+Alt+R) and the overview window at the bottom right (Ctrl+Alt+O). 0 on the rulers is the central topic.'],
  },
  {
    id: 'overview', target: '.overview', demo: 'fit',
    title: ['전체 보기 창', 'Overview window'],
    text: ['맵 전체와 지금 보이는 부분(틀)을 보여 줍니다. 누르거나 끌면 그곳으로 이동합니다. 켜 두면 늘 보입니다.', 'The whole map with a frame around the part on screen. Click or drag in it to go there. While it is on it always shows.'],
  },
  {
    id: 'redraw', target: '[data-cmd="redraw:orgDown"]', group: true, demo: 'tour:demoRedraw', leave: 'redraw:map',
    title: ['방향 바꿔 다시 그리기 · 자동 정리', 'Redraw and auto arrange'],
    text: ['위→아래(Ctrl+Alt+↓), 왼→오(Ctrl+Alt+→), 오→왼(Ctrl+Alt+←), 양쪽(Ctrl+Alt+M)으로 맵을 다시 그립니다. 마지막 단추 **자동 정리**(Ctrl+Shift+L)는 손으로 옮긴 토픽을 제자리로 돌리고 균형을 맞춥니다.', 'Redraw the map top→bottom (Ctrl+Alt+↓), left→right (Ctrl+Alt+→), right→left (Ctrl+Alt+←) or on both sides (Ctrl+Alt+M). The last button, **auto arrange** (Ctrl+Shift+L), puts moved topics back and balances the sides.'],
  },
  {
    id: 'style', target: '[data-cmd="layoutMenu"]', group: true,
    title: ['레이아웃과 맵 스타일', 'Layout and map style'],
    text: ['레이아웃 9가지(맵 · 조직도 · 트리 · 타임라인 · 피쉬본 …)와 맵 스타일(색 구성)을 고릅니다. 가지 하나만 다르게 배치하려면 작업 창 › 서식 › 하위 토픽 배치를 씁니다.', 'Pick one of 9 layouts (map, org chart, tree, timeline, fishbone …) and a map style. To lay out one branch differently use Task pane › Format › Subtopic layout.'],
  },
  {
    id: 'content', target: '[data-cmd="pane:markers"]', group: true, demo: 'tour:demoMarkers',
    title: ['토픽에 담는 것', 'What a topic holds'],
    text: ['아이콘(우선순위 · 진행률 · 깃발 · 기호), 메모, 링크 · 첨부, 작업 정보(날짜 · 담당 · 진행률). 누르면 오른쪽 작업 창의 그 탭이 열립니다.', 'Icons (priority, progress, flags, symbols), notes, links and attachments, task info (dates, resources, progress). Each opens that tab of the task pane on the right.'],
  },
  {
    id: 'sidebar', target: '.sidebar', demo: 'side:find', leave: 'side:outline',
    title: ['왼쪽 패널', 'Left pane'],
    text: ['**개요**(맵 전체의 나무), **찾기**(찾기 · 바꾸기, Ctrl+F), **필터**(우선순위 · 아이콘 · 태그로 거르기). 항목을 누르면 그 토픽으로 가고, 오른쪽 클릭하면 토픽 메뉴가 열립니다.', '**Outline** (the whole map as a tree), **Find** (find and replace, Ctrl+F), **Filter** (by priority, icon, tag). Click an entry to go to that topic; right-click it for the topic menu.'],
  },
  {
    id: 'fold', target: '.pane-splitter-v.left', demo: 'tour:demoFold', leave: 'tour:showPanes',
    title: ['패널 접고 펴기', 'Folding the panes'],
    text: ['패널 경계의 작은 화살표를 누르거나 경계를 두 번 누르면 패널이 접힙니다(Ctrl+Alt+S 왼쪽 · Ctrl+Alt+P 오른쪽). 접힌 패널은 맵 가장자리의 탭으로 다시 폅니다. 경계를 끌면 너비가 바뀝니다.', 'Click the small arrow on a pane border, or double-click the border, to fold the pane (Ctrl+Alt+S left, Ctrl+Alt+P right). The tab at the edge of the map brings it back; drag the border to resize.'],
  },
  {
    id: 'taskpane', target: '.task-pane', enter: 'pane:format',
    title: ['작업 창', 'Task pane'],
    text: ['선택한 토픽의 **서식 · 아이콘 · 메모 · 작업 · 링크**, 그리고 맵 전체의 **맵** 탭. 여러 토픽을 선택하면 한꺼번에 바뀝니다.', 'The **Format, Icons, Notes, Task, Links** of the selected topics, and the **Map** tab for the whole map. With several topics selected they all change together.'],
  },
  {
    id: 'comments', target: '.comments', enter: 'tour:comments', leave: 'pane:format',
    title: ['메모 · 댓글 · 사용자 속성', 'Notes, comments, properties'],
    text: ['메모 탭 아래에서 작성자와 날짜가 남는 **댓글**을 달고, "담당 = 김기획" 같은 **사용자 속성**을 붙입니다. 댓글이 있는 토픽에는 말풍선 표시가 붙습니다.', 'Under the Notes tab add **comments** (with author and date) and **custom properties** such as "Owner = Kim". A topic with comments shows a speech-bubble badge.'],
  },
  {
    id: 'views', target: '[data-cmd="view:map"]', group: true, enter: 'view:map', demo: 'tour:demoViews', leave: 'view:map',
    title: ['보기', 'Views'],
    text: ['같은 맵을 **맵 · 개요 · 간트 차트 · 칸반 보드**로 봅니다. 어느 보기에서 고쳐도 같은 맵이 바뀝니다. 마지막 단추는 **프레젠테이션**(F5)입니다.', 'See the same map as **map, outline, Gantt chart or Kanban board** — a change in any view changes the map. The last button is **presentation** (F5).'],
  },
  {
    id: 'kanban', target: '.kanban-board', enter: 'view:kanban', leave: 'view:map',
    title: ['칸반 보드', 'Kanban board'],
    text: ['주 토픽은 열, 하위 토픽은 카드입니다. 카드를 다른 열로 끌면 맵에서도 그 주 토픽 아래로 옮겨지고, 열 아래 "카드 추가"로 하위 토픽을 만듭니다.', 'Main topics are columns, subtopics are cards. Drag a card to another column and it moves under that main topic on the map too; "Add card" adds a subtopic.'],
  },
  {
    id: 'zoom', target: '[data-cmd="zoomIn"]', group: true, demo: 'tour:demoZoom',
    title: ['확대 · 축소', 'Zoom'],
    text: ['축소 · 비율(누르면 100%) · 확대 · 맵 전체. Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+1, 또는 Ctrl+휠.', 'Zoom out, the ratio (click for 100%), zoom in, fit the map. Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+1, or Ctrl+wheel.'],
  },
  {
    id: 'settings', target: '[data-cmd="settings"]',
    title: ['테마와 설정', 'Themes and settings'],
    text: ['테마 단추는 다음 테마로(▾ 는 40가지 목록), 국기는 한국어 / English, 톱니바퀴는 설정(Ctrl+,)입니다. 설정에서 시작 화면 배경 21가지, 자동 저장, 격자 · 눈금자를 정합니다.', 'The theme button goes to the next theme (▾ for all 40), the flag switches 한국어 / English, the gear opens Settings (Ctrl+,): start-page backgrounds, auto save, grid and rulers.'],
  },
  {
    id: 'help', target: '[data-menu="help"]', demo: 'openHelp',
    title: ['도움말', 'Help'],
    text: ['도움말(F1)은 모든 기능을 그림과 함께 별도 창에서 설명합니다. **도움말 › 튜토리얼**로 이 안내를 언제든 다시 볼 수 있고, 단축키 목록도 여기에 있습니다.', 'Help (F1) explains every feature with pictures in a window of its own. **Help › Tutorial** brings this guide back any time; the shortcut list is here too.'],
  },
  {
    id: 'done',
    title: ['준비 끝!', "You're ready!"],
    text: ['이제 뒤에 열린 **튜토리얼 맵**의 단원을 위에서부터 따라 해 보세요. 토픽을 누르면 오른쪽 메모 탭에 해 볼 일이 보입니다. 마음대로 고쳐도 됩니다 — Ctrl+Z 로 되돌립니다.', 'Now follow the lessons of the **tutorial map** behind this from the top. Click a topic to see what to try in the Notes tab. Change anything — Ctrl+Z undoes it.'],
  },
];
