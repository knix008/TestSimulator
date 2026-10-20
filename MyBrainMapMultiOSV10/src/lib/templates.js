// Templates for File › New from template and the start page: ready-made maps
// in Korean and English. Pure (no React), so scripts/make-samples.mjs builds
// the sample files from the same definitions.
import { newMap, makeTopic, normalizeMap, uid } from './model.js';

// T(text, children?, extra?) — a topic; text is [ko, en] or a string
export function build(lang) {
  const L = (x) => (Array.isArray(x) ? x[lang === 'ko' ? 0 : 1] : x);
  const T = (text, children = [], extra = {}) => {
    const t = makeTopic(L(text), {});
    t.children = children;
    for (const [k, v] of Object.entries(extra)) {
      if (k === 'notes') t.notes = L(v);
      else if (k === 'tags') t.tags = v.map(L);
      else if (k === 'callouts') t.callouts = v;
      else if (k === 'boundary') t.boundary = { ...v, label: v.label ? L(v.label) : '' };
      else t[k] = v;
    }
    return t;
  };
  return { L, T };
}

// a local calendar date (not UTC: the morning in Korea is still yesterday in UTC)
export const day = (today, n) => { const d = new Date(today); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// The tutorial (start page › 튜토리얼): a map about the app, one main topic per
// lesson and one subtopic per step. Each step's note says what to try; the map
// itself uses every kind of content (icons, tags, tasks, links, comments,
// properties, a boundary, a summary, a callout, relationships, a floating topic).
function tour(lang, today) {
  const { L, T } = build(lang);
  const step = (text, note, extra = {}) => T(text, [], { notes: note, ...extra });
  const basics = T(['기본 조작', 'Basics'], [
    step(['Enter: 형제 토픽 만들기', 'Enter: a sibling topic'], ['**해 보기:** 이 토픽을 누르고 Enter 를 누르세요. 바로 아래에 새 토픽이 생기고 글자를 입력할 수 있습니다.', '**Try it:** click this topic and press Enter. A new topic appears below it, ready to type in.'], { icons: ['check'] }),
    step(['Tab / Insert: 하위 토픽', 'Tab / Insert: a subtopic'], ['**해 보기:** Tab 을 누르면 선택한 토픽 아래에 하위 토픽이 생깁니다. Shift+Tab 은 상위 토픽으로 갑니다.', '**Try it:** Tab adds a subtopic under the selected one. Shift+Tab goes to its parent.'], { icons: ['check'] }),
    step(['F2 또는 바로 입력: 편집', 'F2 or just type: edit'], ['토픽을 고르고 글자를 치면 바로 편집됩니다. Shift+Enter 는 줄바꿈, Esc 는 취소입니다.', 'Select a topic and type to edit it. Shift+Enter breaks the line, Esc cancels.'], { icons: ['check'] }),
    step(['끌어서 옮기기 — 연결은 유지', 'Drag to move — it stays connected'], ['다른 토픽 위에 놓으면 그 하위 토픽, 위·아래 가장자리에 놓으면 형제 토픽이 됩니다. **빈 곳에 놓으면 연결된 채로 그 자리로 옮겨집니다.** Alt 를 누른 채 놓으면 떼어서 자유(플로팅) 토픽이 됩니다.', 'Drop on a topic: its subtopic. On its upper / lower edge: a sibling. **On empty space it moves there and stays connected.** Hold Alt while dropping to detach it as a floating topic.'], { icons: ['star'] }),
    step(['Ctrl+Z / Ctrl+Y: 실행 취소 · 다시 실행', 'Ctrl+Z / Ctrl+Y: undo / redo'], ['모든 편집은 하나씩 되돌릴 수 있습니다. 바꾼 맵을 닫으면 저장할지 묻습니다.', 'Every edit can be undone one by one. Closing a changed map asks whether to save it.']),
    step(['오른쪽 클릭: 컨텍스트 메뉴', 'Right-click: the context menu'], ['토픽, 빈 곳, 관계선, 왼쪽 패널의 항목에서 오른쪽 클릭하면 아이콘이 붙은 메뉴가 나옵니다.', 'Right-click a topic, empty space, a relationship or an item in the left pane for a menu with icons.']),
  ], { icons: ['idea'], side: 'right' });
  const screen = T(['화면', 'The screen'], [
    step(['격자와 눈금자', 'Grid and rulers'], ['도구 모음의 격자·눈금자 단추(Ctrl+Alt+G / Ctrl+Alt+R)로 켜고 끕니다. 눈금자의 0 은 중심 토픽입니다.', 'The grid and ruler buttons on the toolbar (Ctrl+Alt+G / Ctrl+Alt+R) turn them on and off. 0 on the rulers is the central topic.']),
    step(['전체 보기 창', 'The overview window'], ['오른쪽 아래 작은 창이 맵 전체와 지금 보이는 부분을 보여 줍니다. 눌러서 그곳으로 이동합니다. Ctrl+Alt+O 로 켜고 끕니다.', 'The small window at the bottom right shows the whole map and the part on screen; click it to go there. Ctrl+Alt+O turns it on and off.']),
    step(['왼쪽·오른쪽 패널 접기', 'Fold the left / right pane'], ['패널 경계의 작은 화살표(또는 경계를 두 번 누르기, Ctrl+Alt+S / Ctrl+Alt+P)로 접고, 화면 가장자리의 탭으로 다시 펍니다.', 'The small arrow on a pane border (or a double-click on it, Ctrl+Alt+S / Ctrl+Alt+P) folds it; the tab at the edge brings it back.']),
    step(['확대 · 축소 · 맞추기', 'Zoom and fit'], ['Ctrl+휠, Ctrl+= / Ctrl+-, Ctrl+0 (맵 전체), Ctrl+1 (100%).', 'Ctrl+wheel, Ctrl+= / Ctrl+-, Ctrl+0 (whole map), Ctrl+1 (100%).']),
  ], { icons: ['eye'], side: 'right' });
  const layouts = T(['레이아웃 · 정리', 'Layouts and arranging'], [
    step(['위→아래 · 왼→오 · 오→왼 · 양쪽', 'Top→bottom, left→right, right→left, both sides'], ['도구 모음의 다시 그리기 단추 네 개(Ctrl+Alt+↓ → ← M)로 방향을 바꿔 다시 그립니다.', 'The four redraw buttons on the toolbar (Ctrl+Alt+↓ → ← M) redraw the map in that direction.']),
    step(['자동 정리', 'Auto arrange'], ['손으로 옮긴 토픽을 제자리로 돌리고 양쪽 균형을 맞춥니다 (Ctrl+Shift+L).', 'Puts topics moved by hand back in place and balances the sides (Ctrl+Shift+L).']),
    step(['조직도 · 트리 · 타임라인 · 피쉬본', 'Org chart, tree, timeline, fishbone'], ['레이아웃 메뉴에서 맵 전체를, 작업 창 › 서식 › 하위 토픽 배치에서 가지 하나를 바꿉니다.', 'The layout menu changes the whole map; Task pane › Format › Subtopic layout changes one branch.']),
    step(['맵 스타일 · 테마', 'Map styles and themes'], ['맵 스타일 단추로 색 구성을, 설정 › 테마에서 40가지 화면 테마를 고릅니다.', 'The map style button picks the colours; Settings › Theme has 40 screen themes.']),
  ], { icons: ['star'], side: 'right', summary: { text: L(['보기 좋게', 'Make it tidy']) } });
  const content = T(['토픽에 담는 것', 'What a topic holds'], [
    step(['메모 (Markdown)', 'Notes (Markdown)'], ['**굵게**, 목록, [링크](https://example.com) 를 쓸 수 있는 메모입니다. Ctrl+T 로 엽니다.', 'Notes support **bold**, lists and [links](https://example.com). Ctrl+T opens them.']),
    step(['댓글과 사용자 속성', 'Comments and custom properties'], ['작업 창 › 메모 아래에서 작성자와 날짜가 남는 댓글을 달고, "담당 = 김기획" 같은 속성을 붙입니다.', 'Under Task pane › Notes, add comments (with author and date) and properties such as "Owner = Kim".'], {
      comments: [{ id: uid(), author: L(['튜토리얼', 'Tutorial']), text: L(['이 토픽에는 댓글이 있습니다 — 말풍선 표시를 눌러 보세요.', 'This topic has a comment — click the speech-bubble badge.']), date: new Date(today).toISOString() }],
      props: [{ key: L(['담당', 'Owner']), value: L(['나', 'Me']) }, { key: L(['예산', 'Budget']), value: '1,200' }],
    }),
    step(['아이콘과 태그', 'Icons and tags'], ['작업 창 › 아이콘에서 우선순위, 진행률, 깃발, 기호와 태그를 붙입니다.', 'Task pane › Icons adds priorities, progress, flags, symbols and tags.'], { icons: ['flag-green', 'smiley-happy'], tags: [['중요', 'key'], ['검토', 'review']] }),
    step(['작업 정보', 'Task info'], ['시작·마감일, 진행률, 담당, 작업량. 날짜가 있으면 간트 차트에 막대로 나옵니다.', 'Start and due dates, progress, resources, effort. Dated topics show as bars in the Gantt chart.'], { task: { start: day(today, 0), due: day(today, 6), progress: 50, priority: 2, resources: L(['나', 'Me']) } }),
    step(['링크 · 첨부 · 그림', 'Links, attachments, pictures'], ['Ctrl+K 로 하이퍼링크, 파일을 끌어 놓으면 첨부, 그림을 붙여 넣으면 토픽 그림이 됩니다.', 'Ctrl+K adds a hyperlink, dropping a file attaches it, pasting a picture puts it on the topic.'], { link: { url: 'https://github.com/knix008/TestSimulator' } }),
  ], { icons: ['bookmark'], side: 'left' });
  const structure = T(['구조 표현', 'Showing structure'], [
    step(['관계선', 'Relationships'], ['Ctrl+Shift+R 후 다른 토픽을 누릅니다. 손잡이로 곡선을 바꾸고 이름·색·화살표를 고릅니다.', 'Ctrl+Shift+R, then click another topic. Drag the handles to bend it; give it a label, a colour, arrows.']),
    step(['경계', 'Boundaries'], ['가지 하나를 테두리로 묶습니다 (Ctrl+Shift+B). 구름 모양과 이름도 있습니다.', 'A frame around a branch (Ctrl+Shift+B), also cloud-shaped, with a label.']),
    step(['요약', 'Summaries'], ['하위 토픽 옆에 괄호와 요약을 붙입니다 (Ctrl+]). "레이아웃 · 정리" 가지에 예가 있습니다.', 'A brace with a summary beside the subtopics (Ctrl+]). The "Layouts and arranging" branch has one.']),
    step(['설명선 · 플로팅 토픽', 'Callouts and floating topics'], ['Ctrl+Shift+Enter 로 설명선, 빈 곳을 두 번 눌러 플로팅 토픽을 만듭니다.', 'Ctrl+Shift+Enter adds a callout; double-click empty space for a floating topic.']),
  ], { icons: ['chart'], side: 'left', boundary: { shape: 'rounded', label: ['구조', 'Structure'] }, callouts: [makeTopic(lang === 'ko' ? '삽입 메뉴에 모두 있습니다' : 'All in the Insert menu')] });
  const views = T(['보기', 'Views'], [
    step(['개요 보기', 'Outline view'], ['맵을 들여 쓴 목록으로 보고 편집합니다.', 'The map as an indented list you can edit.']),
    step(['간트 차트', 'Gantt chart'], ['날짜가 있는 토픽을 막대로 보고, 끌어서 날짜를 바꿉니다.', 'Dated topics as bars; drag to change the dates.'], { task: { start: day(today, 2), due: day(today, 9), progress: 20 } }),
    step(['칸반 보드', 'Kanban board'], ['주 토픽이 열, 하위 토픽이 카드입니다. 카드를 다른 열로 끌면 맵에서도 옮겨집니다.', 'Main topics are columns, subtopics are cards. Dragging a card to another column moves it on the map too.']),
    step(['프레젠테이션 (F5) · 가지만 보기 (F4)', 'Presentation (F5), focus (F4)'], ['가지마다 한 장씩 보여 주고, F4 는 선택한 가지만 남깁니다.', 'One slide per branch; F4 shows only the selected branch.']),
  ], { icons: ['chart'], side: 'left' });
  const files = T(['찾기 · 파일', 'Find and files'], [
    step(['찾기 · 바꾸기 · 필터', 'Find, replace, filter'], ['Ctrl+F 로 찾고 바꾸며, 왼쪽 패널 › 필터에서 우선순위·아이콘·태그로 거릅니다.', 'Ctrl+F finds and replaces; Left pane › Filter narrows by priority, icon, tag.']),
    step(['저장 · 가져오기 · 내보내기 · 인쇄', 'Save, import, export, print'], ['.tmap 으로 저장하고, FreeMind · XMind · MindManager · OPML · Markdown 을 가져오며, PNG · SVG · PDF · Word · HTML · CSV 로 내보냅니다.', 'Save as .tmap; import FreeMind, XMind, MindManager, OPML, Markdown; export PNG, SVG, PDF, Word, HTML, CSV.']),
    step(['설정 · 시작 화면 배경', 'Settings and the start page'], ['Ctrl+, 로 설정을 엽니다. 시작 화면 배경은 마인드맵을 주제로 한 3D 장면 21가지 중에서 고릅니다.', 'Ctrl+, opens Settings. The start page background is one of 21 mind-map 3D scenes.']),
    step(['F1: 도움말', 'F1: Help'], ['모든 기능의 설명이 그림과 함께 별도 창으로 열립니다.', 'Every feature explained with pictures, in a window of its own.']),
  ], { icons: ['rocket'], side: 'left' });
  const root = T(['My BrainMap 튜토리얼', 'My BrainMap tutorial'], [basics, screen, layouts, content, structure, views, files], {
    notes: ['위에서부터 차례로 따라 해 보세요. 각 토픽의 메모에 해 볼 일이 적혀 있습니다. 마음대로 고쳐도 됩니다 — Ctrl+Z 로 되돌립니다.', 'Follow the lessons from the top. Each topic\'s note says what to try. Change anything — Ctrl+Z undoes it.'],
  });
  const floating = { ...T(['플로팅 토픽', 'Floating topic'], [], { notes: ['빈 곳을 두 번 누르거나, 토픽을 Alt 를 누른 채 빈 곳에 놓으면 만들어집니다.', 'Double-click empty space, or Alt-drop a topic on empty space.'] }), x: 560, y: 330 };
  return {
    layout: 'map', style: 'auto', root, floating: [floating], numbering: { enabled: true, depth: 2 },
    relationships: [
      { from: basics.children[3].id, to: floating.id, label: L(['Alt + 놓기', 'Alt + drop']) },
      { from: content.children[3].id, to: views.children[1].id, label: L(['날짜 → 막대', 'dates → bars']) },
    ],
  };
}

export const TEMPLATES = [
  {
    id: 'tour', icon: 'sample', label: ['튜토리얼', 'Tutorial'], desc: ['모든 기능을 차례로 따라 해 보는 안내 맵', 'A guided map that walks through every feature'], hidden: true,
    make: (lang, today = new Date()) => tour(lang, today),
  },
  {
    id: 'blank', icon: 'filePlus', label: ['빈 맵', 'Blank map'], desc: ['중심 토픽 하나로 시작합니다', 'Start from a central topic'],
    make: (lang) => { const { L } = build(lang); return { root: makeTopic(L(['중심 토픽', 'Central Topic'])), layout: 'map' }; },
  },
  {
    id: 'brainstorm', icon: 'idea', label: ['브레인스토밍', 'Brainstorming'], desc: ['문제·아이디어·평가·다음 단계', 'Problem, ideas, evaluation, next steps'],
    make: (lang) => {
      const { T } = build(lang);
      return {
        layout: 'map', style: 'rainbow',
        root: T(['아이디어 회의', 'Idea session'], [
          T(['문제 정의', 'The problem'], [T(['무엇이 문제인가?', 'What is wrong?']), T(['누가 겪는가?', 'Who has it?']), T(['왜 지금인가?', 'Why now?'])], { icons: ['question'] }),
          T(['아이디어', 'Ideas'], [T(['아이디어 1', 'Idea 1'], [], { icons: ['idea'] }), T(['아이디어 2', 'Idea 2'], [], { icons: ['idea'] }), T(['아이디어 3', 'Idea 3'], [], { icons: ['idea'] })]),
          T(['좋은 점', 'Pros'], [T(['빠르다', 'Fast'], [], { icons: ['thumbsUp'] }), T(['싸다', 'Cheap'], [], { icons: ['thumbsUp'] })]),
          T(['걱정되는 점', 'Concerns'], [T(['위험', 'Risks'], [], { icons: ['warning'] }), T(['비용', 'Cost'], [], { icons: ['money'] })]),
          T(['다음 단계', 'Next steps'], [T(['담당자 정하기', 'Pick owners'], [], { task: { progress: 0 } }), T(['일정 잡기', 'Set dates'], [], { task: { progress: 0 } })], { icons: ['rocket'] }),
        ], { notes: ['떠오르는 생각을 판단하지 말고 모두 적은 뒤, 마지막에 평가합니다.', 'Write every thought down without judging, then evaluate at the end.'] }),
      };
    },
  },
  {
    id: 'project', icon: 'calendar', label: ['프로젝트 계획', 'Project plan'], desc: ['단계·작업·일정·담당 (간트 보기)', 'Phases, tasks, dates, owners (Gantt view)'],
    make: (lang, today = new Date()) => {
      const { T } = build(lang);
      const task = (s, e, p, who, pr) => ({ task: { start: day(today, s), due: day(today, e), progress: p, resources: who, ...(pr ? { priority: pr } : {}) } });
      return {
        layout: 'right', style: 'business',
        root: T(['신제품 출시 프로젝트', 'Product launch project'], [
          T(['1. 기획', '1. Planning'], [
            T(['시장 조사', 'Market research'], [], task(0, 6, 100, lang === 'ko' ? '김지원' : 'Alex', 1)),
            T(['요구사항 정리', 'Requirements'], [], task(5, 12, 75, lang === 'ko' ? '이서준' : 'Sam', 1)),
            T(['예산 승인', 'Budget approval'], [], { task: { due: day(today, 14), milestone: true, priority: 2, progress: 0 } }),
          ]),
          T(['2. 개발', '2. Development'], [
            T(['디자인', 'Design'], [], task(13, 24, 25, lang === 'ko' ? '박하은' : 'Jo')),
            T(['구현', 'Build'], [], task(20, 45, 0, lang === 'ko' ? '개발팀' : 'Dev team', 1)),
            T(['테스트', 'Testing'], [], task(40, 52, 0, lang === 'ko' ? 'QA팀' : 'QA team', 2)),
          ]),
          T(['3. 출시', '3. Launch'], [
            T(['마케팅 자료', 'Marketing kit'], [], task(42, 55, 0, lang === 'ko' ? '최유나' : 'Kim', 3)),
            T(['출시 행사', 'Launch event'], [], { task: { due: day(today, 60), milestone: true, priority: 1, progress: 0 }, icons: ['rocket'] }),
          ]),
          T(['위험 요소', 'Risks'], [T(['일정 지연', 'Schedule slip'], [], { icons: ['warning'] }), T(['인력 부족', 'Not enough people'], [], { icons: ['people'] })], { icons: ['flag-red'], boundary: { shape: 'rounded', label: ['관리 필요', 'Watch'] } }),
        ], { notes: ['보기 › 간트 차트에서 일정을 막대로 보고 끌어서 바꿀 수 있습니다.', 'View › Gantt chart shows the dates as bars you can drag.'] }),
      };
    },
  },
  {
    id: 'meeting', icon: 'people', label: ['회의록', 'Meeting minutes'], desc: ['안건·결정·실행 항목', 'Agenda, decisions, action items'],
    make: (lang, today = new Date()) => {
      const { T } = build(lang);
      return {
        layout: 'map', style: 'auto',
        root: T([`주간 회의 ${day(today, 0)}`, `Weekly meeting ${day(today, 0)}`], [
          T(['참석자', 'Attendees'], [T(['홍길동', 'Pat'], [], { icons: ['person'] }), T(['김영희', 'Lee'], [], { icons: ['person'] })]),
          T(['안건', 'Agenda'], [T(['지난주 진행 상황', 'Last week']), T(['이번 주 우선순위', 'Priorities']), T(['기타', 'Other'])]),
          T(['결정 사항', 'Decisions'], [T(['출시일 확정', 'Launch date fixed'], [], { icons: ['check'] })]),
          T(['실행 항목', 'Action items'], [
            T(['보고서 작성', 'Write the report'], [], { task: { due: day(today, 3), resources: lang === 'ko' ? '홍길동' : 'Pat', progress: 0, priority: 1 } }),
            T(['견적 요청', 'Ask for quotes'], [], { task: { due: day(today, 5), resources: lang === 'ko' ? '김영희' : 'Lee', progress: 0, priority: 2 } }),
          ], { icons: ['flag-orange'] }),
          T(['다음 회의', 'Next meeting'], [T([day(today, 7), day(today, 7)], [], { icons: ['calendar'] })]),
        ]),
      };
    },
  },
  {
    id: 'swot', icon: 'grid', label: ['SWOT 분석', 'SWOT analysis'], desc: ['강점·약점·기회·위협', 'Strengths, weaknesses, opportunities, threats'],
    make: (lang) => {
      const { T } = build(lang);
      const box = (fill) => ({ style: { fill, color: '#ffffff', shape: 'rounded' } });
      return {
        layout: 'map', style: 'classic',
        root: T(['SWOT 분석', 'SWOT analysis'], [
          T(['강점 (S)', 'Strengths'], [T(['기술력', 'Technology']), T(['충성 고객', 'Loyal customers'])], { ...box('#2e7d32'), side: 'right' }),
          T(['약점 (W)', 'Weaknesses'], [T(['좁은 유통망', 'Small reach']), T(['높은 원가', 'High cost'])], { ...box('#c62828'), side: 'right' }),
          T(['기회 (O)', 'Opportunities'], [T(['새 시장', 'New markets']), T(['규제 완화', 'Deregulation'])], { ...box('#1565c0'), side: 'left' }),
          T(['위협 (T)', 'Threats'], [T(['경쟁사', 'Competitors']), T(['환율', 'Exchange rates'])], { ...box('#ef6c00'), side: 'left' }),
        ]),
      };
    },
  },
  {
    id: 'decision', icon: 'target', label: ['의사결정', 'Decision making'], desc: ['선택지별 장단점 비교', 'Pros and cons per option'],
    make: (lang) => {
      const { T } = build(lang);
      const opt = (name, pros, cons) => T(name, [T(['장점', 'Pros'], pros.map((p) => T(p, [], { icons: ['thumbsUp'] }))), T(['단점', 'Cons'], cons.map((c) => T(c, [], { icons: ['thumbsDown'] })))]);
      return {
        layout: 'map', style: 'auto',
        root: T(['어떤 방법을 고를까?', 'Which way to go?'], [
          opt(['선택지 A', 'Option A'], [['빠름', 'Fast']], [['비쌈', 'Expensive']]),
          opt(['선택지 B', 'Option B'], [['저렴함', 'Cheap']], [['느림', 'Slow']]),
          T(['판단 기준', 'Criteria'], [T(['비용', 'Cost'], [], { task: { priority: 1 } }), T(['시간', 'Time'], [], { task: { priority: 2 } }), T(['품질', 'Quality'], [], { task: { priority: 1 } })], { icons: ['target'] }),
          T(['결론', 'Decision'], [T(['...', '...'])], { icons: ['star'] }),
        ]),
      };
    },
  },
  {
    id: 'weekly', icon: 'clock', label: ['주간 계획', 'Weekly plan'], desc: ['요일별 할 일 (타임라인)', 'To-dos per day (timeline)'],
    make: (lang) => {
      const { T } = build(lang);
      const days = lang === 'ko' ? ['월', '화', '수', '목', '금', '토', '일'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return {
        layout: 'timeline', style: 'pastel',
        root: T(['이번 주', 'This week'], days.map((d, i) => T(d, i < 5 ? [T(['할 일', 'To do'], [], { task: { progress: 0 } })] : [T(['휴식', 'Rest'], [], { icons: ['smiley-happy'] })]))),
      };
    },
  },
  {
    id: 'fishbone', icon: 'fishbone', label: ['피시본 (원인 분석)', 'Fishbone (causes)'], desc: ['문제의 원인을 6M으로', 'Causes of a problem by category'],
    make: (lang) => {
      const { T } = build(lang);
      const cat = (n, list) => T(n, list.map((x) => T(x)));
      return {
        layout: 'fishbone', style: 'classic',
        root: T(['불량률 증가', 'Rising defect rate'], [
          cat(['사람', 'People'], [['숙련도 부족', 'Not enough training'], ['교대 인수인계', 'Shift handover']]),
          cat(['설비', 'Machines'], [['노후 장비', 'Old equipment'], ['정비 주기', 'Maintenance gaps']]),
          cat(['재료', 'Materials'], [['공급사 변경', 'New supplier'], ['보관 상태', 'Storage']]),
          cat(['방법', 'Methods'], [['작업 표준 없음', 'No standard work']]),
          cat(['측정', 'Measurement'], [['검사 기준 모호', 'Unclear checks']]),
          cat(['환경', 'Environment'], [['온도·습도', 'Temperature, humidity']]),
        ], { style: { fill: '#c62828', color: '#ffffff' } }),
      };
    },
  },
  {
    id: 'org', icon: 'org', label: ['조직도', 'Org chart'], desc: ['팀과 사람 (아래로 펼침)', 'Teams and people (top-down)'],
    make: (lang) => {
      const { T } = build(lang);
      const p = (n) => T(n, [], { icons: ['person'] });
      return {
        layout: 'orgDown', style: 'business',
        root: T(['대표이사', 'CEO'], [
          T(['경영지원', 'Operations'], [p(['인사', 'HR']), p(['재무', 'Finance'])]),
          T(['개발', 'Engineering'], [p(['프론트엔드', 'Frontend']), p(['백엔드', 'Backend']), p(['품질', 'QA'])]),
          T(['영업', 'Sales'], [p(['국내', 'Domestic']), p(['해외', 'Overseas'])]),
        ]),
      };
    },
  },
  {
    id: 'roadmap', icon: 'timeline', label: ['로드맵', 'Roadmap'], desc: ['분기별 목표 (타임라인)', 'Goals per quarter (timeline)'],
    make: (lang) => {
      const { T } = build(lang);
      return {
        layout: 'timeline', style: 'rainbow',
        root: T(['2027 로드맵', '2027 roadmap'], [
          T(['1분기', 'Q1'], [T(['베타 출시', 'Beta release']), T(['피드백 수집', 'Collect feedback'])]),
          T(['2분기', 'Q2'], [T(['정식 출시', 'GA release'], [], { icons: ['rocket'] }), T(['모바일 앱', 'Mobile app'])]),
          T(['3분기', 'Q3'], [T(['해외 진출', 'Go global'])]),
          T(['4분기', 'Q4'], [T(['연간 회고', 'Year review'])]),
        ]),
      };
    },
  },
  {
    id: 'book', icon: 'book', label: ['독서 노트', 'Book notes'], desc: ['요약·인용·생각·적용', 'Summary, quotes, thoughts, actions'],
    make: (lang) => {
      const { T } = build(lang);
      return {
        layout: 'map', style: 'paper',
        root: T(['책 제목', 'Book title'], [
          T(['한 줄 요약', 'In one line'], [T(['...', '...'])]),
          T(['핵심 내용', 'Key ideas'], [T(['1장', 'Chapter 1']), T(['2장', 'Chapter 2'])]),
          T(['인상 깊은 문장', 'Quotes'], [T(['"..."', '"..."'], [], { icons: ['bookmark'] })]),
          T(['내 생각', 'My thoughts'], [T(['동의', 'Agree'], [], { icons: ['thumbsUp'] }), T(['의문', 'Doubts'], [], { icons: ['question'] })]),
          T(['적용할 점', 'To apply'], [T(['...', '...'], [], { task: { progress: 0 } })], { icons: ['target'] }),
        ]),
      };
    },
  },
  {
    id: 'okr', icon: 'target', label: ['목표 (OKR)', 'Goals (OKR)'], desc: ['목표와 핵심 결과, 진행률', 'Objectives, key results, progress'],
    make: (lang) => {
      const { T } = build(lang);
      const kr = (n, p) => T(n, [], { task: { progress: p } });
      return {
        layout: 'right', style: 'forest',
        root: T(['올해 목표', 'This year'], [
          T(['고객 만족도 높이기', 'Happier customers'], [kr(['응답 시간 4시간 이내', 'Reply within 4 h'], 50), kr(['만족도 4.5점', 'Score 4.5'], 25)], { icons: ['target'] }),
          T(['매출 성장', 'Grow revenue'], [kr(['신규 고객 100명', '100 new customers'], 75), kr(['재구매율 40%', '40% repeat buyers'], 50)], { icons: ['money'] }),
          T(['팀 역량', 'Team skills'], [kr(['교육 12회', '12 trainings'], 100)], { icons: ['people'] }),
        ]),
      };
    },
  },
  {
    id: 'study', icon: 'book', label: ['학습 계획', 'Study plan'], desc: ['과목·자료·일정·점검', 'Subjects, materials, schedule, review'],
    make: (lang, today = new Date()) => {
      const { T } = build(lang);
      return {
        layout: 'treeRight', style: 'candy',
        root: T(['시험 준비', 'Exam prep'], [
          T(['수학', 'Math'], [T(['미적분 복습', 'Calculus review'], [], { task: { due: day(today, 7), progress: 25 } }), T(['기출 문제', 'Past papers'], [], { task: { due: day(today, 14), progress: 0 } })]),
          T(['영어', 'English'], [T(['단어 500개', '500 words'], [], { task: { progress: 50 } })]),
          T(['과학', 'Science'], [T(['실험 정리', 'Lab notes'], [], { task: { progress: 0 } })]),
          T(['점검', 'Review'], [T(['모의고사', 'Mock exam'], [], { task: { due: day(today, 20), milestone: true } })], { icons: ['check'] }),
        ]),
      };
    },
  },
  {
    id: 'travel', icon: 'pin', label: ['여행 계획', 'Trip plan'], desc: ['일정·숙소·준비물·예산', 'Itinerary, stay, packing, budget'],
    make: (lang) => {
      const { T } = build(lang);
      return {
        layout: 'map', style: 'ocean',
        root: T(['제주 여행', 'Trip to the coast'], [
          T(['일정', 'Itinerary'], [T(['1일차', 'Day 1']), T(['2일차', 'Day 2']), T(['3일차', 'Day 3'])], { icons: ['calendar'] }),
          T(['숙소', 'Stay'], [T(['예약 확인', 'Booking'], [], { icons: ['check'] })], { icons: ['home'] }),
          T(['준비물', 'Packing'], [T(['여권/신분증', 'ID']), T(['충전기', 'Charger']), T(['상비약', 'Medicine'])], { icons: ['bookmark'] }),
          T(['예산', 'Budget'], [T(['교통', 'Travel']), T(['식비', 'Food']), T(['숙박', 'Lodging'])], { icons: ['money'] }),
        ]),
      };
    },
  },
];

// A new map from a template (fresh ids, the app's default style when the template leaves it open).
export function mapFromTemplate(id, lang = 'ko', { style, layout, today = new Date() } = {}) {
  const tpl = TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
  const def = tpl.make(lang, today);
  const map = newMap({ title: '', layout: def.layout || layout || 'map', style: def.style || style || 'auto' });
  map.root = def.root;
  map.floating = def.floating || [];
  map.relationships = (def.relationships || []).map((r) => ({ id: uid(), ...r }));
  if (id === 'blank') { map.layout = layout || 'map'; map.style = style || 'auto'; }
  return normalizeMap(map);
}
