// Regenerates the bundled sample diagrams in /template.
// Diagrams are authored as simple nested trees; this script assigns colours,
// text styles and coordinates (via a port of src/layout/engine.ts) and writes
// each as a .mmap file (the app's serialize() JSON shape).
//
// Run: node scripts/gen-samples.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'template')

const NODE_W = 140
const NODE_H = 44
const H_GAP = 72
const V_GAP = 44

const NODE_COLORS = [
  '#93c5fd', '#a7f3d0', '#fde68a', '#fca5a5', '#c4b5fd', '#f9a8d4',
  '#67e8f9', '#bef264', '#fdba74', '#d8b4fe', '#99f6e4', '#fecdd3',
  '#bfdbfe', '#ddd6fe', '#bbf7d0', '#fed7aa', '#fbcfe8', '#bae6fd',
  '#e9d5ff', '#d9f99d',
]
const colorForLevel = (level) => NODE_COLORS[level % NODE_COLORS.length]

const textStyle = () => ({
  fontFamily: 'notoSansKr',
  fontSize: 13,
  color: 'auto',
  bold: true,
  italic: false,
  underline: false,
  strike: false,
})

let counter = 0
const uid = (prefix) => `${prefix}-${++counter}`

// Build a flat node/edge list from a nested { text, shape?, children:[] } tree.
function build(tree, { mode, defaultShape, defaultLine }) {
  counter = 0
  const nodes = []
  const edges = []
  const walk = (spec, parentId, level) => {
    const id = uid('n')
    const isRoot = parentId === null
    nodes.push({
      id,
      parentId,
      text: spec.text,
      x: 0,
      y: 0,
      width: isRoot ? NODE_W + (mode === 'fishbone' ? 40 : 20) : NODE_W,
      height: isRoot ? NODE_H + 8 : NODE_H,
      shape: spec.shape ?? (isRoot ? 'rounded' : defaultShape),
      color: colorForLevel(level),
      textStyle: textStyle(),
      ...(mode === 'fishbone'
        ? { role: isRoot ? 'effect' : level === 1 ? 'category' : 'cause' }
        : {}),
    })
    for (const child of spec.children ?? []) {
      const childId = walk(child, id, level + 1)
      edges.push({
        id: uid('e'),
        from: id,
        to: childId,
        lineType: defaultLine,
        linePattern: 'solid',
        color: '#94a3b8',
        startCap: 'none',
        endCap: 'none',
      })
    }
    return id
  }
  walk(tree, null, 0)
  return { nodes, edges }
}

const childrenOf = (nodes, id) => nodes.filter((n) => n.parentId === id)

function subtreeHeight(nodes, id) {
  const kids = childrenOf(nodes, id)
  if (!kids.length) return NODE_H
  return kids.reduce((s, k) => s + subtreeHeight(nodes, k.id), 0) + (kids.length - 1) * V_GAP
}
function subtreeWidth(nodes, id) {
  const kids = childrenOf(nodes, id)
  if (!kids.length) return NODE_W
  return kids.reduce((s, k) => s + subtreeWidth(nodes, k.id), 0) + (kids.length - 1) * H_GAP
}

function layoutHorizontal(nodes, id, x, y, dir, depth, out) {
  out.set(id, { x, y })
  const kids = childrenOf(nodes, id)
  if (!kids.length) return
  const totalH = kids.reduce((s, k) => s + subtreeHeight(nodes, k.id), 0) + (kids.length - 1) * V_GAP
  let cursor = y - totalH / 2
  for (const kid of kids) {
    const h = subtreeHeight(nodes, kid.id)
    layoutHorizontal(nodes, kid.id, x + dir * (NODE_W + H_GAP + depth * 8), cursor + h / 2, dir, depth + 1, out)
    cursor += h + V_GAP
  }
}

function layoutVertical(nodes, id, x, y, depth, out) {
  out.set(id, { x, y })
  const kids = childrenOf(nodes, id)
  if (!kids.length) return
  const totalW = kids.reduce((s, k) => s + subtreeWidth(nodes, k.id), 0) + (kids.length - 1) * H_GAP
  let cursor = x + NODE_W / 2 - totalW / 2
  for (const kid of kids) {
    const w = subtreeWidth(nodes, kid.id)
    layoutVertical(nodes, kid.id, cursor + w / 2 - NODE_W / 2, y + NODE_H + V_GAP + depth * 10, depth + 1, out)
    cursor += w + H_GAP
  }
}

function leafCount(nodes, id) {
  const kids = childrenOf(nodes, id)
  if (!kids.length) return 1
  return kids.reduce((s, k) => s + leafCount(nodes, k.id), 0)
}
function treeDepth(nodes, id) {
  const kids = childrenOf(nodes, id)
  if (!kids.length) return 0
  return 1 + Math.max(...kids.map((k) => treeDepth(nodes, k.id)))
}
function layoutRadial(nodes, rootId, cx, cy) {
  const out = new Map()
  out.set(rootId, { x: cx - NODE_W / 2, y: cy - NODE_H / 2 })
  const totalLeaves = leafCount(nodes, rootId)
  const depth = Math.max(1, treeDepth(nodes, rootId))
  const ringGap = Math.max(200, (totalLeaves * (NODE_W + 40)) / (Math.PI * 2 * depth))
  const place = (id, a0, a1, level) => {
    const kids = childrenOf(nodes, id)
    if (!kids.length) return
    const total = kids.reduce((s, k) => s + leafCount(nodes, k.id), 0)
    const radius = level * ringGap
    let a = a0
    for (const kid of kids) {
      const span = (a1 - a0) * (leafCount(nodes, kid.id) / total)
      const mid = a + span / 2
      out.set(kid.id, { x: cx + Math.cos(mid) * radius - NODE_W / 2, y: cy + Math.sin(mid) * radius - NODE_H / 2 })
      place(kid.id, a, a + span, level + 1)
      a += span
    }
  }
  place(rootId, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 1)
  return out
}

// Fishbone (Ishikawa) — ported from src/layout/engine.ts
const FISH_ANGLE_DEG = 58
const FISH_TAN = Math.tan((FISH_ANGLE_DEG * Math.PI) / 180)
const FISH_RISE = 165
const FISH_RUN = FISH_RISE / FISH_TAN
const FISH_BONE_GAP = 300
const FISH_FIRST_OFFSET = 90
const FISH_MARGIN = 90
const FISH_SUB_RISE = 120
const FISH_SUB_RUN = FISH_SUB_RISE / FISH_TAN
const FISH_SUB_FIRST = 85
const FISH_SUB_GAP = NODE_W + 60
function layoutFishbone(nodes, width, height) {
  const out = new Map()
  const effect = nodes.find((n) => n.role === 'effect') ?? nodes.find((n) => !n.parentId)
  if (!effect) return out
  const dir = 1
  const spineY = height / 2
  const effectW = effect.width || NODE_W + 40
  const effectH = effect.height || NODE_H
  const headCenterX = width - FISH_MARGIN - effectW / 2
  out.set(effect.id, { x: headCenterX - effectW / 2, y: spineY - effectH / 2 })
  const headEdgeX = headCenterX - dir * (effectW / 2)
  const place = (node, cx, cy) => {
    const w = node.width || NODE_W
    const h = node.height || NODE_H
    out.set(node.id, { x: cx - w / 2, y: cy - h / 2 })
  }
  const branch = (parentId, axisX, axisY, side) => {
    childrenOf(nodes, parentId).forEach((kid, k) => {
      const attachX = axisX - dir * (FISH_SUB_FIRST + k * FISH_SUB_GAP)
      const cx = attachX - dir * FISH_SUB_RUN
      const cy = axisY + side * FISH_SUB_RISE
      place(kid, cx, cy)
      branch(kid.id, cx, cy, side)
    })
  }
  childrenOf(nodes, effect.id).forEach((cat, i) => {
    const side = i % 2 === 0 ? -1 : 1
    const pair = Math.floor(i / 2)
    const attachX = headEdgeX - dir * (FISH_FIRST_OFFSET + pair * FISH_BONE_GAP)
    const cx = attachX - dir * FISH_RUN
    const cy = spineY + side * FISH_RISE
    place(cat, cx, cy)
    branch(cat.id, cx, cy, side)
  })
  return out
}

function applyLayout(nodes, mode, layout, w, h) {
  const root = nodes.find((n) => n.parentId === null) ?? nodes[0]
  let pos
  if (mode === 'fishbone') pos = layoutFishbone(nodes, w, h)
  else if (layout === 'radial') pos = layoutRadial(nodes, root.id, w / 2, h / 2)
  else if (layout === 'ttb') {
    pos = new Map()
    layoutVertical(nodes, root.id, w / 2 - NODE_W / 2, 80, 0, pos)
  } else {
    pos = new Map()
    const dir = layout === 'rtl' ? -1 : 1
    const startX = layout === 'ltr' ? 80 : w - 80 - NODE_W
    layoutHorizontal(nodes, root.id, startX, h / 2 - NODE_H / 2, dir, 0, pos)
  }
  return nodes.map((n) => {
    const p = pos.get(n.id)
    return p ? { ...n, x: Math.round(p.x), y: Math.round(p.y) } : n
  })
}

function makeDoc({ mode, layout, tree }) {
  const defaultShape = mode === 'fishbone' ? 'rect' : 'rounded'
  const defaultLine = mode === 'fishbone' ? 'straight' : 'curve'
  const { nodes, edges } = build(tree, { mode, defaultShape, defaultLine })
  const laid = applyLayout(nodes, mode, layout, 1400, 900)
  return {
    version: 1,
    mode,
    layout,
    defaultShape,
    defaultLine,
    defaultLinePattern: 'solid',
    nodes: laid,
    edges,
  }
}

// The five first samples were finished by hand and are left as they are; only these are generated.
const LINE = {
  rainbow: { lineTheme: 'rainbow', lineType: 'curve', linePattern: 'solid', palette: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'] },
  roots: { lineTheme: 'roots', lineType: 'root', linePattern: 'solid', palette: ['#92602f', '#6b8e23', '#a16207'] },
  circuit: { lineTheme: 'circuit', lineType: 'elbow', linePattern: 'solid', palette: ['#0ea5e9'] },
  blueprint: { lineTheme: 'blueprint', lineType: 'elbow', linePattern: 'dashed', palette: ['#3b82f6'] },
  flow: { lineTheme: 'flow', lineType: 'straight', linePattern: 'solid', endCap: 'arrow', palette: ['#6366f1'] },
  curveArrow: { lineTheme: 'curveArrow', lineType: 'curve', linePattern: 'solid', endCap: 'arrow', palette: ['#14b8a6'] },
  pencil: { lineTheme: 'pencil', lineType: 'curve', linePattern: 'dotted', palette: ['#78716c'] },
  mono: { lineTheme: 'mono', lineType: 'straight', linePattern: 'solid', palette: ['#64748b'] },
  technical: { lineTheme: 'technical', lineType: 'straight', linePattern: 'dashdot', endCap: 'diamond', palette: ['#0f766e'] },
  neon: { lineTheme: 'neon', lineType: 'curve', linePattern: 'solid', palette: ['#d946ef', '#06b6d4', '#84cc16'] },
  pastel: { lineTheme: 'pastel', lineType: 'curve', linePattern: 'dashed', palette: ['#f472b6', '#60a5fa', '#4ade80', '#fbbf24'] },
}

/** Text → tree: [topic, [child, ...]] or a plain string. */
const tree = (spec) => (typeof spec === 'string' ? { text: spec } : { text: spec[0], children: spec[1].map(tree) })

function styled(doc, line, shape) {
  if (shape) for (const node of doc.nodes) if (node.parentId) node.shape = shape
  if (shape) doc.defaultShape = shape
  if (!line) return doc
  const byId = new Map(doc.nodes.map((node) => [node.id, node]))
  const branch = (id) => {
    let current = byId.get(id)
    for (;;) {
      const parent = byId.get(current.parentId)
      if (!parent.parentId) return doc.nodes.filter((node) => node.parentId === parent.id).indexOf(current)
      current = parent
    }
  }
  doc.lineTheme = line.lineTheme
  doc.defaultLine = line.lineType
  doc.defaultLinePattern = line.linePattern
  doc.edges = doc.edges.map((edge) => ({
    ...edge,
    lineType: line.lineType,
    linePattern: line.linePattern,
    startCap: 'none',
    endCap: line.endCap ?? 'none',
    color: line.palette[branch(edge.to) % line.palette.length],
  }))
  return doc
}

const KEPT = [
  { id: 'mindmap-project', file: 'sample-mindmap-project.mmap', mode: 'mindmap', ko: ['신제품 출시', '방사형 마인드맵으로 세운 프로젝트 계획'], en: ['Product launch', 'A project plan as a radial mind map'] },
  { id: 'mindmap-trip', file: 'sample-mindmap-trip.mmap', mode: 'mindmap', ko: ['제주도 여행', '오른쪽에서 왼쪽으로 펼친 여행 계획'], en: ['Trip to Jeju', 'A travel plan laid out right to left'] },
  { id: 'fishbone-study', file: 'sample-mindmap-study.mmap', mode: 'fishbone', ko: ['웹 개발 학습', '학습 주제를 피쉬본으로 정리'], en: ['Learning web development', 'Study topics as a fishbone'] },
  { id: 'fishbone-quality', file: 'sample-fishbone-quality.mmap', mode: 'fishbone', ko: ['제품 불량 발생', '품질 문제의 원인 분석'], en: ['Product defects', 'Finding the causes of a quality problem'] },
  { id: 'fishbone-delay', file: 'sample-fishbone-delay.mmap', mode: 'fishbone', ko: ['배송 지연', '배송 지연의 원인 분석'], en: ['Delivery delays', 'Finding the causes of late deliveries'] },
]

const NEW = [
  ['mindmap-meeting', 'mindmap', 'radial', 'rainbow', null, ['주간 회의', 'Weekly meeting', '안건과 담당자를 한눈에', 'Agenda and owners at a glance'], ['주간 회의', [['지난주 결과', ['매출', '고객 문의', '배포']], ['이번 주 계획', ['신규 기능', '버그 수정']], ['위험 요소', ['일정 지연', '인력 부족']], ['결정 사항', ['예산 승인', '채용']]]]],
  ['mindmap-book', 'mindmap', 'ltr', 'curveArrow', 'stadium', ['독서 노트', 'Reading notes', '책 한 권의 구조와 생각', 'A book\'s structure and your thoughts'], ['습관의 힘', [['핵심 개념', ['신호', '반복 행동', '보상']], ['인상 깊은 사례', ['운동선수', '기업 문화']], ['내게 적용', ['아침 운동', '기록하기', '작은 목표']]]]],
  ['mindmap-startup', 'mindmap', 'radial', 'neon', 'hexagon', ['창업 아이디어', 'Startup idea', '사업 모델의 아홉 요소', 'The parts of a business model'], ['창업 아이디어', [['고객', ['직장인', '학생']], ['가치', ['시간 절약', '저렴한 가격']], ['채널', ['앱', '제휴']], ['수익', ['구독', '광고']], ['비용', ['서버', '인건비']], ['파트너', ['결제사', '물류사']]]]],
  ['mindmap-health', 'mindmap', 'ttb', 'pastel', 'ellipse', ['건강 관리', 'Staying healthy', '위에서 아래로 펼친 생활 계획', 'A lifestyle plan, top to bottom'], ['건강 관리', [['운동', ['걷기', '근력']], ['식사', ['채소', '물']], ['수면', ['7시간', '일찍 눕기']]]]],
  ['mindmap-org', 'mindmap', 'ttb', 'circuit', 'rect', ['조직도', 'Organization chart', '꺾은 선으로 그린 회사 조직', 'A company drawn with elbow lines'], ['대표이사', [['개발본부', ['플랫폼팀', '앱팀']], ['사업본부', ['영업팀', '마케팅팀']], ['경영지원', ['인사팀', '재무팀']]]]],
  ['mindmap-language', 'mindmap', 'rtl', 'pencil', 'note', ['외국어 공부', 'Learning a language', '점선과 노트 도형의 학습 계획', 'A study plan with notes and dotted lines'], ['영어 공부', [['듣기', ['팟캐스트', '드라마']], ['말하기', ['회화 모임', '따라 말하기']], ['읽기', ['뉴스', '소설']], ['쓰기', ['일기', '이메일']]]]],
  ['mindmap-garden', 'mindmap', 'btt', 'roots', 'rounded', ['텃밭 가꾸기', 'A vegetable garden', '아래에서 위로 자라는 나무 뿌리 선', 'Tree-root lines growing upward'], ['텃밭 가꾸기', [['봄', ['상추', '감자']], ['여름', ['토마토', '오이']], ['가을', ['배추', '무']]]]],
  ['mindmap-software', 'mindmap', 'ltr', 'technical', 'parallelogram', ['소프트웨어 구조', 'Software structure', '기술 도면 선으로 그린 계층', 'Layers in a technical line style'], ['웹 서비스', [['프런트엔드', ['화면', '상태 관리']], ['백엔드', ['API', '인증']], ['데이터', ['데이터베이스', '캐시']], ['운영', ['배포', '모니터링']]]]],
  ['fishbone-sales', 'fishbone', 'ltr', 'flow', null, ['매출 감소', 'Falling sales', '화살표 선으로 그린 매출 원인', 'Causes of falling sales, with arrows'], ['매출 감소', [['제품', ['기능 부족', '품질 불만']], ['가격', ['경쟁사 할인', '높은 원가']], ['홍보', ['광고 부족', '낮은 인지도']], ['유통', ['입점 감소', '재고 부족']]]]],
  ['fishbone-server', 'fishbone', 'rtl', 'blueprint', null, ['서버 장애', 'Server outage', '오른쪽 머리의 장애 원인 분석', 'An outage analysis with the head on the right'], ['서버 장애', [['하드웨어', ['디스크 고장', '전원 문제']], ['소프트웨어', ['메모리 누수', '배포 오류']], ['네트워크', ['회선 장애', 'DNS 오류']], ['사람', ['설정 실수', '절차 미준수']]]]],
  ['fishbone-customers', 'fishbone', 'ltr', 'rainbow', null, ['고객 이탈', 'Customers leaving', '가지마다 색이 다른 피쉬본', 'A fishbone with a colour per branch'], ['고객 이탈', [['서비스', ['응답 지연', '불친절']], ['제품', ['잦은 오류', '복잡한 사용법']], ['가격', ['요금 인상', '혜택 축소']], ['경쟁', ['신규 업체', '이벤트']]]]],
  ['fishbone-project', 'fishbone', 'ltr', 'mono', null, ['프로젝트 지연', 'A late project', '일정이 늦어진 원인', 'Why a schedule slipped'], ['프로젝트 지연', [['계획', ['낙관적 일정', '범위 변경']], ['인력', ['담당자 이직', '역량 부족']], ['소통', ['보고 지연', '요구 불명확']], ['기술', ['신기술 도입', '기술 부채']]]]],
  ['fishbone-grades', 'fishbone', 'rtl', 'pastel', null, ['성적 하락', 'Falling grades', '공부가 잘 안 되는 원인', 'Why studying is not working'], ['성적 하락', [['습관', ['벼락치기', '복습 부족']], ['환경', ['스마트폰', '소음']], ['건강', ['수면 부족', '피로']]]]],
  ['fishbone-cafe', 'fishbone', 'ltr', 'neon', null, ['카페 손님 감소', 'Fewer café guests', '작은 가게의 문제 분석', 'A small shop\'s problem'], ['손님 감소', [['맛', ['원두 변경', '메뉴 부족']], ['위치', ['주차 불편', '간판 안 보임']], ['가격', ['인상', '쿠폰 없음']], ['분위기', ['좁은 좌석', '시끄러운 음악']]]]],
  ['fishbone-safety', 'fishbone', 'ltr', 'technical', null, ['작업장 사고', 'Workplace accidents', '안전 관리의 네 가지 요인', 'Four factors of safety'], ['작업장 사고', [['작업자', ['보호구 미착용', '피로']], ['설비', ['방호 장치 없음', '노후화']], ['환경', ['조명 부족', '미끄러운 바닥']], ['관리', ['교육 부족', '점검 누락']]]]],
  ['fishbone-energy', 'fishbone', 'rtl', 'curveArrow', null, ['전기 요금 증가', 'Higher power bill', '집에서 찾는 원인', 'Causes to look for at home'], ['전기 요금 증가', [['냉난방', ['낮은 설정 온도', '단열 불량']], ['가전', ['오래된 냉장고', '대기 전력']], ['습관', ['불 켜 두기', '장시간 건조기']]]]],
  // mind maps
  ['mindmap-wedding', 'mindmap', 'radial', 'pastel', 'ellipse', ['결혼 준비', 'Wedding plans', '예식부터 신혼여행까지', 'From the ceremony to the honeymoon'], ['결혼 준비', [['예식', ['예식장', '사회자', '축가']], ['예산', ['예물', '식대']], ['신혼여행', ['항공권', '숙소']], ['신혼집', ['가구', '가전']]]]],
  ['mindmap-moving', 'mindmap', 'ltr', 'circuit', 'rect', ['이사 계획', 'Moving house', '이사 전후에 할 일', 'What to do before and after'], ['이사 계획', [['이사 전', ['업체 예약', '짐 정리', '폐기물 신고']], ['이사 당일', ['열쇠 인수', '청소']], ['이사 후', ['전입 신고', '주소 변경', '인터넷 이전']]]]],
  ['mindmap-blog', 'mindmap', 'radial', 'curveArrow', 'rounded', ['블로그 운영', 'Running a blog', '주제, 글쓰기, 홍보', 'Topics, writing and promotion'], ['블로그 운영', [['주제', ['여행', '요리', '기술']], ['글쓰기', ['초안', '교정', '사진']], ['홍보', ['SNS', '뉴스레터']], ['분석', ['방문자', '인기 글']]]]],
  ['mindmap-exam', 'mindmap', 'ttb', 'blueprint', 'rect', ['시험 준비', 'Preparing for an exam', '과목별 공부 계획', 'A study plan by subject'], ['기말 시험', [['국어', ['문학', '문법']], ['수학', ['미적분', '확률']], ['영어', ['독해', '단어']], ['과학', ['물리', '화학']]]]],
  ['mindmap-budget', 'mindmap', 'radial', 'rainbow', 'stadium', ['가계부', 'Household budget', '수입과 지출 한눈에', 'Income and spending at a glance'], ['가계부', [['수입', ['월급', '부수입']], ['고정 지출', ['월세', '보험', '통신비']], ['생활비', ['식비', '교통비']], ['저축', ['적금', '투자']]]]],
  ['mindmap-camping', 'mindmap', 'rtl', 'roots', 'rounded', ['캠핑 준비물', 'Camping checklist', '잊지 말아야 할 것들', 'What not to forget'], ['캠핑 준비물', [['잠자리', ['텐트', '침낭', '매트']], ['요리', ['버너', '코펠', '아이스박스']], ['안전', ['구급약', '랜턴']]]]],
  ['mindmap-marketing', 'mindmap', 'ltr', 'neon', 'hexagon', ['마케팅 전략', 'Marketing strategy', '제품, 가격, 유통, 홍보', 'Product, price, place and promotion'], ['마케팅 전략', [['제품', ['품질', '디자인']], ['가격', ['할인', '구독']], ['유통', ['온라인', '매장']], ['홍보', ['광고', '이벤트', '인플루언서']]]]],
  ['mindmap-cooking', 'mindmap', 'radial', 'pencil', 'note', ['일주일 식단', 'A week of meals', '장보기까지 이어지는 식단', 'A menu that leads to the shopping list'], ['일주일 식단', [['아침', ['토스트', '오트밀']], ['점심', ['비빔밥', '샐러드']], ['저녁', ['찌개', '파스타', '구이']], ['장보기', ['채소', '고기', '과일']]]]],
  ['mindmap-event', 'mindmap', 'btt', 'flow', 'rounded', ['행사 기획', 'Planning an event', '아래에서 위로 쌓는 행사 준비', 'Building an event from the bottom up'], ['회사 창립 행사', [['장소', ['대관', '음향']], ['프로그램', ['시상', '공연']], ['초청', ['명단', '초대장']], ['예산', ['식사', '기념품']]]]],
  ['mindmap-career', 'mindmap', 'radial', 'technical', 'parallelogram', ['경력 개발', 'Career development', '5년 뒤를 위한 계획', 'A plan for five years from now'], ['경력 개발', [['기술', ['자격증', '온라인 강의']], ['경험', ['사이드 프로젝트', '발표']], ['인맥', ['커뮤니티', '멘토']], ['목표', ['승진', '이직']]]]],
  // fishbones
  ['fishbone-traffic', 'fishbone', 'ltr', 'flow', null, ['교통 체증', 'Traffic jams', '출근길이 막히는 원인', 'Why the morning commute stalls'], ['교통 체증', [['도로', ['차로 부족', '공사']], ['신호', ['주기 불일치', '고장']], ['차량', ['차량 증가', '불법 주차']], ['대중교통', ['배차 간격', '환승 불편']]]]],
  ['fishbone-website', 'fishbone', 'rtl', 'circuit', null, ['웹사이트 느림', 'A slow website', '페이지 로딩이 느린 원인', 'Why pages load slowly'], ['웹사이트 느림', [['서버', ['CPU 부족', '느린 쿼리']], ['네트워크', ['CDN 없음', '먼 지역']], ['프런트엔드', ['큰 이미지', '많은 스크립트']], ['데이터', ['캐시 없음', '인덱스 누락']]]]],
  ['fishbone-turnover', 'fishbone', 'ltr', 'rainbow', null, ['직원 퇴사', 'Staff leaving', '직원이 떠나는 원인', 'Why people quit'], ['직원 퇴사', [['보상', ['낮은 급여', '성과급 불만']], ['문화', ['잦은 야근', '소통 부족']], ['성장', ['교육 부족', '승진 정체']], ['관리자', ['불공정한 평가', '미흡한 지원']]]]],
  ['fishbone-food', 'fishbone', 'ltr', 'pastel', null, ['음식 맛 저하', 'Food tastes worse', '식당 음식의 품질 문제', 'A restaurant\'s quality problem'], ['음식 맛 저하', [['재료', ['신선도', '납품 변경']], ['조리', ['레시피 미준수', '온도 관리']], ['사람', ['주방장 교체', '교육 부족']], ['설비', ['오븐 고장', '위생']]]]],
  ['fishbone-battery', 'fishbone', 'rtl', 'technical', null, ['배터리 수명 단축', 'Short battery life', '제품 배터리 문제 분석', 'A product battery problem'], ['배터리 수명 단축', [['셀', ['용량 편차', '노화']], ['회로', ['누설 전류', '충전 제어']], ['소프트웨어', ['백그라운드 작업', '절전 미작동']], ['사용 환경', ['고온', '잦은 충전']]]]],
  ['fishbone-complaints', 'fishbone', 'ltr', 'blueprint', null, ['고객 불만 증가', 'More complaints', '콜센터 문의가 늘어난 원인', 'Why the call centre is busier'], ['고객 불만 증가', [['제품', ['설명서 부족', '초기 불량']], ['배송', ['파손', '오배송']], ['상담', ['대기 시간', '답변 불일치']], ['정책', ['환불 지연', '복잡한 절차']]]]],
  ['fishbone-diet', 'fishbone', 'ltr', 'curveArrow', null, ['다이어트 실패', 'A failed diet', '체중이 줄지 않는 원인', 'Why the weight stays'], ['다이어트 실패', [['식사', ['야식', '단 음료']], ['운동', ['시간 부족', '꾸준하지 않음']], ['습관', ['수면 부족', '스트레스']], ['목표', ['무리한 계획', '기록 없음']]]]],
  ['fishbone-print', 'fishbone', 'rtl', 'mono', null, ['인쇄 품질 불량', 'Poor print quality', '인쇄물의 얼룩과 번짐', 'Stains and smears on prints'], ['인쇄 품질 불량', [['잉크', ['품질 저하', '건조 불량']], ['용지', ['습기', '규격 불일치']], ['장비', ['헤드 막힘', '롤러 마모']], ['작업', ['설정 오류', '점검 누락']]]]],
  ['fishbone-meeting', 'fishbone', 'ltr', 'neon', null, ['회의 비효율', 'Inefficient meetings', '회의가 길어지는 원인', 'Why meetings run long'], ['회의 비효율', [['준비', ['안건 없음', '자료 미공유']], ['진행', ['주제 이탈', '시간 관리 부재']], ['참석자', ['불필요한 참석', '발언 편중']], ['후속', ['결정 불명확', '담당자 없음']]]]],
]

const index = [...KEPT]
mkdirSync(TEMPLATE_DIR, { recursive: true })
for (const [id, mode, layout, line, shape, [ko, en, koText, enText], spec] of NEW) {
  const file = `sample-${id}.mmap`
  const doc = styled(makeDoc({ mode, layout, tree: tree(spec) }), LINE[line], shape)
  writeFileSync(join(TEMPLATE_DIR, file), JSON.stringify(doc, null, 2) + '\n', 'utf8')
  index.push({ id, file, mode, ko: [ko, koText], en: [en, enText] })
  console.log('wrote', file, `(${doc.nodes.length} nodes)`)
}
writeFileSync(join(TEMPLATE_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')
console.log('samples:', index.length)
