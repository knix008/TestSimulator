// The tutorials: a real mind map and a real fishbone, drawn step by step. A step looks at the
// document to see whether it is done, so any way of doing it counts, and `apply` does it for
// someone who would rather watch. Pure, so every step can be tested without a window.
import { addChild, applyLineTheme, relayout, setMode, setNodeShape, updateNodeText } from './store/document'
import { lineThemeById } from './lineThemes'
import type { DiagramDocument, DiagramMode, DiagramNode, Locale } from './types'

type Text = Record<Locale, string>

export type TutorialStep = {
  id: string
  title: Text
  text: Text
  /** What to look at on the screen. */
  highlight?: string
  /** Absent on a step that only explains. */
  done?: (doc: DiagramDocument, language: Locale) => boolean
  apply?: (doc: DiagramDocument, language: Locale) => DiagramDocument
}

export type Tutorial = { id: string; mode: DiagramMode; title: Text; goal: Text; steps: TutorialStep[] }

const rootOf = (doc: DiagramDocument): DiagramNode | undefined => doc.nodes.find((node) => node.parentId === null)
const named = (doc: DiagramDocument, text: string) => doc.nodes.find((node) => node.text.trim() === text)
const childOf = (doc: DiagramDocument, parent: DiagramNode | undefined, text: string) => doc.nodes.find((node) => node.parentId === parent?.id && node.text.trim() === text)

const TEXT_INPUT = '.right-panel .property-stack input'
const LAYOUT = '.toolbar .tb-dropdown-trigger'

/** Selects the new child, with its name. */
function add(doc: DiagramDocument, parent: DiagramNode, text: string): DiagramDocument {
  const next = addChild(doc, parent.id, text)
  return next
}

const words = {
  plan: { ko: '여행 계획', en: 'Trip Plan' },
  transport: { ko: '교통', en: 'Transport' },
  lodging: { ko: '숙소', en: 'Lodging' },
  food: { ko: '먹거리', en: 'Food' },
  train: { ko: '기차', en: 'Train' },
  late: { ko: '지각', en: 'Late for Work' },
  sleep: { ko: '수면', en: 'Sleep' },
  traffic: { ko: '교통', en: 'Traffic' },
  stayedUp: { ko: '늦게 잠듦', en: 'Stayed Up Late' },
  busDelay: { ko: '버스 지연', en: 'Bus Delay' },
}

const renameRoot = (word: Text, title: Text): TutorialStep => ({
  id: 'central',
  title,
  text: {
    ko: `가운데 도형을 누른 뒤 오른쪽 속성의 **텍스트**에 "${word.ko}"를 입력하세요. 도형을 두 번 눌러 바로 고쳐도 됩니다.`,
    en: `Click the shape in the middle and type "${word.en}" under **Text** in the properties on the right. You can also double-click the shape.`,
  },
  highlight: TEXT_INPUT,
  done: (doc, language) => rootOf(doc)?.text.trim() === word[language],
  apply: (doc, language) => updateNodeText(doc, rootOf(doc)!.id, word[language]),
})

/** A new child of the node named `parent` (or of the centre). */
const addStep = (id: string, parent: Text | null, word: Text): TutorialStep => {
  const under = (doc: DiagramDocument, language: Locale) => (parent ? named(doc, parent[language]) : rootOf(doc))
  return {
    id,
    title: { ko: `"${word.ko}" 추가`, en: `Add "${word.en}"` },
    text: {
      ko: `${parent ? `"${parent.ko}"` : '가운데 도형'}을 오른쪽 단추로 누르고 **하위 노드 추가**를 고른 뒤, 새 도형의 이름을 "${word.ko}"로 바꾸세요.`,
      en: `Right-click ${parent ? `"${parent.en}"` : 'the shape in the middle'}, pick **Add Child Node**, then rename the new shape to "${word.en}".`,
    },
    done: (doc, language) => !!childOf(doc, under(doc, language), word[language]),
    apply: (doc, language) => add(doc, under(doc, language)!, word[language]),
  }
}

const layoutStep = (layout: DiagramDocument['layout'], name: Text): TutorialStep => ({
  id: 'layout',
  title: { ko: '레이아웃 바꾸기', en: 'Change the layout' },
  text: {
    ko: `툴바의 **레이아웃**에서 "${name.ko}"를 고르세요. 도형이 그 방향으로 다시 놓입니다.`,
    en: `Pick "${name.en}" from **Layout** in the toolbar. The shapes are placed again in that direction.`,
  },
  highlight: LAYOUT,
  done: (doc) => doc.layout === layout,
  apply: (doc) => ({ ...doc, layout, dirty: true }),
})

const lineThemeStep = (id: string): TutorialStep => {
  const theme = lineThemeById(id)
  return {
    id: 'line-theme',
    title: { ko: '선 테마 고르기', en: 'Pick a line theme' },
    text: {
      ko: `툴바의 **선 테마**에서 "${theme.ko}"를 고르세요. 모든 연결선의 모양과 색이 한 번에 바뀝니다.`,
      en: `Pick "${theme.en}" from **Line Theme** in the toolbar. Every connector changes its shape and colour at once.`,
    },
    highlight: '[data-line-theme] .tb-btn',
    done: (doc) => doc.lineTheme === id,
    apply: (doc) => applyLineTheme(doc, theme),
  }
}

const saveStep = (result: Text): TutorialStep => ({
  id: 'finish',
  title: { ko: '완성', en: 'Done' },
  text: {
    ko: `${result.ko} **저장**(Ctrl+S)으로 파일에 남기고, **인쇄**나 **내보내기**로 종이와 그림으로 만들 수 있습니다.`,
    en: `${result.en} **Save** (Ctrl+S) keeps it in a file; **Print** and **Export** make paper and pictures of it.`,
  },
})

export const TUTORIALS: Tutorial[] = [
  {
    id: 'mindmap',
    mode: 'mindmap',
    title: { ko: '마인드맵: 여행 계획', en: 'Mind map: a trip plan' },
    goal: { ko: '중심 주제에서 가지를 뻗어 여행 계획을 그립니다.', en: 'Grow a trip plan out of a central topic.' },
    steps: [
      renameRoot(words.plan, { ko: '중심 주제 정하기', en: 'Name the central topic' }),
      addStep('transport', null, words.transport),
      addStep('lodging', null, words.lodging),
      addStep('food', null, words.food),
      addStep('train', words.transport, words.train),
      {
        id: 'shape',
        title: { ko: '도형 바꾸기', en: 'Change a shape' },
        text: {
          ko: `"${words.lodging.ko}"를 고르고 오른쪽 속성의 **도형**에서 "타원"을 고르세요.`,
          en: `Select "${words.lodging.en}" and pick "Ellipse" from **Shape** in the properties on the right.`,
        },
        done: (doc, language) => named(doc, words.lodging[language])?.shape === 'ellipse',
        apply: (doc, language) => setNodeShape(doc, named(doc, words.lodging[language])!.id, 'ellipse'),
      },
      lineThemeStep('rainbow'),
      layoutStep('ltr', { ko: '좌 → 우', en: 'Left → Right' }),
      saveStep({ ko: '여행 계획 마인드맵이 완성되었습니다.', en: 'Your trip plan is finished.' }),
    ],
  },
  {
    id: 'fishbone',
    mode: 'fishbone',
    title: { ko: '피쉬본: 지각의 원인', en: 'Fishbone: why we are late' },
    goal: { ko: '결과에서 원인을 거슬러 찾는 피쉬본을 그립니다.', en: 'Trace a result back to its causes with a fishbone.' },
    steps: [
      renameRoot(words.late, { ko: '결과 정하기', en: 'Name the result' }),
      {
        id: 'category-sleep',
        title: { ko: '첫째 원인 분류', en: 'The first category' },
        text: {
          ko: `뼈 끝의 "원인 분류" 도형 하나를 골라 이름을 "${words.sleep.ko}"로 바꾸세요.`,
          en: `Pick one "category" shape at the end of a bone and rename it to "${words.sleep.en}".`,
        },
        done: (doc, language) => !!childOf(doc, rootOf(doc), words.sleep[language]),
        apply: (doc, language) => updateNodeText(doc, doc.nodes.filter((node) => node.parentId === rootOf(doc)?.id)[0].id, words.sleep[language]),
      },
      {
        id: 'category-traffic',
        title: { ko: '둘째 원인 분류', en: 'The second category' },
        text: {
          ko: `다른 원인 분류의 이름을 "${words.traffic.ko}"으로 바꾸세요.`,
          en: `Rename another category to "${words.traffic.en}".`,
        },
        done: (doc, language) => !!childOf(doc, rootOf(doc), words.traffic[language]),
        apply: (doc, language) => updateNodeText(doc, doc.nodes.filter((node) => node.parentId === rootOf(doc)?.id && node.text.trim() !== words.sleep[language])[0].id, words.traffic[language]),
      },
      addStep('stayed-up', words.sleep, words.stayedUp),
      addStep('bus-delay', words.traffic, words.busDelay),
      layoutStep('rtl', { ko: '우 → 좌', en: 'Right → Left' }),
      lineThemeStep('blueprint'),
      {
        id: 'mode',
        title: { ko: '마인드맵으로 보기', en: 'See it as a mind map' },
        text: {
          ko: '툴바의 **마인드맵**을 누르세요. 같은 내용이 마인드맵으로 그려집니다. **피쉬본**을 누르면 돌아옵니다.',
          en: 'Press **Mind map** in the toolbar. The same content is drawn as a mind map; **Fishbone** brings it back.',
        },
        highlight: '[data-command="mode-mindmap"]',
        done: (doc) => doc.mode === 'mindmap',
        apply: (doc) => setMode(doc, 'mindmap', { central: '', effect: '', category: '' }),
      },
      saveStep({ ko: '지각의 원인을 정리했습니다.', en: 'You have sorted out why people are late.' }),
    ],
  },
]

export const tutorialById = (id: string) => TUTORIALS.find((item) => item.id === id) ?? TUTORIALS[0]

/** A step done for the user, tidied so the result is easy to see. */
export function applyStep(step: TutorialStep, doc: DiagramDocument, language: Locale, width = 1200, height = 700): DiagramDocument {
  return step.apply ? relayout(step.apply(doc, language), width, height) : doc
}
