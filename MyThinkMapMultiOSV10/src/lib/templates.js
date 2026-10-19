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

// The feature tour (start page › 기능 둘러보기): a map about the app, using every kind of content.
function tour(lang, today) {
  const { T } = build(lang);
  const keys = T(['토픽 만들기', 'Making topics'], [
    T(['Enter: 형제 토픽', 'Enter: sibling topic'], [], { icons: ['check'] }),
    T(['Tab / Insert: 하위 토픽', 'Tab / Insert: subtopic'], [], { icons: ['check'] }),
    T(['F2 또는 바로 입력: 편집', 'F2 or just type: edit'], [], { icons: ['check'] }),
    T(['끌어서 옮기기', 'Drag to move'], [], { notes: ['다른 토픽 위에 놓으면 하위 토픽, 위·아래 가장자리에 놓으면 형제 토픽, 빈 곳에 놓으면 플로팅 토픽이 됩니다.', 'Drop on a topic: subtopic. On its upper / lower edge: sibling. On empty space: floating topic.'] }),
  ], { icons: ['idea'], side: 'right' });
  const layouts = T(['레이아웃', 'Layouts'], [
    T(['맵 · 오른쪽 · 왼쪽', 'Map, right, left']),
    T(['조직도 · 트리', 'Org chart, tree']),
    T(['타임라인 · 피시본', 'Timeline, fishbone']),
  ], { icons: ['star'], side: 'right' });
  const content = T(['토픽에 담는 것', 'What a topic holds'], [
    T(['메모', 'Notes'], [], { notes: ['**Markdown** 으로 쓰는 메모입니다.\n- 목록\n- [링크](https://example.com)', 'Notes are **Markdown**.\n- lists\n- [links](https://example.com)'] }),
    T(['아이콘과 태그', 'Icons and tags'], [], { icons: ['flag-green', 'smiley-happy'], tags: [['중요', 'key'], ['검토', 'review']] }),
    T(['작업 정보', 'Task info'], [], { task: { start: day(today, 0), due: day(today, 6), progress: 50, priority: 2, resources: lang === 'ko' ? '나' : 'Me' } }),
    T(['하이퍼링크', 'Hyperlink'], [], { link: { url: 'https://github.com/knix008/TestSimulator' } }),
  ], { icons: ['bookmark'], side: 'left' });
  const views = T(['보기', 'Views'], [
    T(['개요 보기', 'Outline view']),
    T(['간트 차트', 'Gantt chart']),
    T(['프레젠테이션 (F5)', 'Presentation (F5)']),
  ], { icons: ['chart'], side: 'left', boundary: { shape: 'rounded', label: ['보기 전환', 'Switch views'] } });
  const files = T(['가져오기 · 내보내기', 'Import · export'], [
    T(['FreeMind · XMind · MindManager · OPML · Markdown', 'FreeMind, XMind, MindManager, OPML, Markdown']),
    T(['PNG · SVG · PDF · Word · HTML', 'PNG, SVG, PDF, Word, HTML']),
  ], { icons: ['rocket'], side: 'left', callouts: [makeTopic(lang === 'ko' ? '파일 › 내보내기' : 'File › Export')] });
  const root = T(['My ThinkMap 둘러보기', 'My ThinkMap tour'], [keys, layouts, content, views, files], {
    notes: ['이 맵은 기능을 보여 주는 예제입니다. 마음대로 고쳐 보세요 — 실행 취소는 Ctrl+Z 입니다.', 'This map shows the features. Change anything — Ctrl+Z undoes.'],
  });
  const floating = { ...T(['플로팅 토픽', 'Floating topic'], [], { notes: ['빈 곳을 두 번 누르면 만들어집니다.', 'Double-click empty space to make one.'] }), x: 520, y: 280 };
  return {
    layout: 'map', style: 'auto', root, floating: [floating],
    relationships: [{ from: keys.children[3].id, to: floating.id, label: lang === 'ko' ? '빈 곳에 놓기' : 'drop on empty space' }, { from: content.children[2].id, to: views.children[1].id, label: lang === 'ko' ? '날짜 → 막대' : 'dates → bars' }],
  };
}

export const TEMPLATES = [
  {
    id: 'tour', icon: 'sample', label: ['기능 둘러보기', 'Feature tour'], desc: ['모든 기능이 들어 있는 예제 맵', 'A sample map using every feature'], hidden: true,
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
