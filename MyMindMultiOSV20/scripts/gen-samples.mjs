// Regenerates the bundled sample diagrams in /template.
// Diagrams are authored as simple nested trees; this script assigns colours,
// text styles and coordinates (via a port of src/layout/engine.ts) and writes
// each as a .mmap file (the app's serialize() JSON shape).
//
// Run: node scripts/gen-samples.mjs
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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

const samples = {
  'sample-mindmap-project.mmap': makeDoc({
    mode: 'mindmap',
    layout: 'radial',
    tree: {
      text: '신제품 출시',
      children: [
        { text: '기획', children: [{ text: '시장 조사' }, { text: '요구사항' }, { text: '일정' }] },
        { text: '개발', children: [{ text: '설계' }, { text: '구현' }, { text: '테스트' }] },
        { text: '마케팅', children: [{ text: 'SNS' }, { text: '광고' }, { text: '이벤트' }] },
        { text: '출시', children: [{ text: '배포' }, { text: '지원' }] },
      ],
    },
  }),
  'sample-mindmap-study.mmap': makeDoc({
    mode: 'mindmap',
    layout: 'ttb',
    tree: {
      text: '웹 개발 학습',
      children: [
        { text: '프론트엔드', children: [{ text: 'HTML/CSS' }, { text: 'JavaScript' }, { text: 'React' }] },
        { text: '백엔드', children: [{ text: 'Node.js' }, { text: 'DB' }, { text: 'API' }] },
        { text: '도구', children: [{ text: 'Git' }, { text: 'Docker' }] },
      ],
    },
  }),
  'sample-mindmap-trip.mmap': makeDoc({
    mode: 'mindmap',
    layout: 'rtl',
    tree: {
      text: '제주도 여행',
      children: [
        { text: '이동', children: [{ text: '항공권' }, { text: '렌터카' }] },
        { text: '숙소', children: [{ text: '호텔' }, { text: '펜션' }] },
        { text: '먹거리', children: [{ text: '흑돼지' }, { text: '해산물' }, { text: '카페' }] },
        { text: '관광', children: [{ text: '한라산' }, { text: '해변' }, { text: '올레길' }] },
      ],
    },
  }),
  'sample-fishbone-quality.mmap': makeDoc({
    mode: 'fishbone',
    layout: 'ltr',
    tree: {
      text: '제품 불량 발생',
      children: [
        { text: '사람(Man)', children: [{ text: '숙련도 부족' }, { text: '교육 미흡' }] },
        { text: '기계(Machine)', children: [{ text: '노후 설비' }, { text: '점검 부족' }] },
        { text: '재료(Material)', children: [{ text: '자재 불량' }, { text: '보관 불량' }] },
        { text: '방법(Method)', children: [{ text: '표준 미준수' }, { text: '공정 오류' }] },
      ],
    },
  }),
  'sample-fishbone-delay.mmap': makeDoc({
    mode: 'fishbone',
    layout: 'ltr',
    tree: {
      text: '배송 지연',
      children: [
        { text: '주문 처리', children: [{ text: '재고 부족' }, { text: '확인 지연' }] },
        { text: '물류', children: [{ text: '경로 혼잡' }, { text: '인력 부족' }] },
        { text: '시스템', children: [{ text: '오류' }, { text: '연동 실패' }] },
        { text: '외부 요인', children: [{ text: '날씨' }, { text: '교통' }] },
      ],
    },
  }),
}

// Wipe and recreate the template directory.
mkdirSync(TEMPLATE_DIR, { recursive: true })
for (const file of readdirSync(TEMPLATE_DIR)) rmSync(join(TEMPLATE_DIR, file), { force: true })
for (const [name, doc] of Object.entries(samples)) {
  writeFileSync(join(TEMPLATE_DIR, name), JSON.stringify(doc, null, 2) + '\n', 'utf8')
  console.log('wrote', name, `(${doc.nodes.length} nodes)`)
}
console.log('done')
