/**
 * The tutorial: each step points at one part of the real window. `screen` says what
 * must be on show first, so a step looks the same from whatever state it is reached.
 */
export type TutorialStep = {
  id: string
  /** CSS selector of what the outline goes round; none centres the card. */
  target?: string
  screen: 'start' | 'editor'
  title: { ko: string; en: string }
  body: { ko: string; en: string }
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'startButton', target: '.start-toggle', screen: 'start',
    title: { ko: '시작 화면 단추', en: 'The Start Screen button' },
    body: { ko: '메뉴 막대 맨 왼쪽의 이 단추로 언제든 시작 화면을 열고 닫습니다. 편집 중인 문서는 그대로 남아 있습니다.', en: 'This button at the far left of the menu bar opens and closes the start screen at any time. The document you are editing stays as it is.' },
  },
  {
    id: 'hero', target: '.start-hero', screen: 'start',
    title: { ko: '바로 시작하기', en: 'Getting going' },
    body: { ko: '사진을 열거나 새 문서를 만들고, 사용자 설명서와 튜토리얼을 여는 단추가 여기 있습니다.', en: 'Open a photo, make a new document, or open the User Guide and this tutorial from here.' },
  },
  {
    id: 'presets', target: '.start-create', screen: 'start',
    title: { ko: '새 문서', en: 'New document' },
    body: { ko: '자주 쓰는 크기를 눌러 바로 새 문서를 만듭니다. 다른 크기는 파일 ▸ 새로 만들기에서 정합니다.', en: 'Click a common size to make a document straight away. Any other size is under File ▸ New.' },
  },
  {
    id: 'samples', target: '.start-samples', screen: 'start',
    title: { ko: '샘플 그림', en: 'Sample pictures' },
    body: { ko: '연습용 그림입니다. 눌러서 열면 파일처럼 새 문서로 열립니다.', en: 'Pictures to practise on. Clicking one opens it in a new document, like a file.' },
  },
  {
    id: 'background', target: '.start-side', screen: 'start',
    title: { ko: '움직이는 배경', en: 'The moving background' },
    body: { ko: '배경 18종과 속도, 투명도, 자동으로 바꾸는 간격을 고릅니다. 카드는 ⠿ 손잡이로 옮기고 오른쪽 아래 모서리로 크기를 바꿉니다.', en: 'Choose from 18 backgrounds and set their speed, transparency and automatic change. Move a card by its handle and resize it from its bottom-right corner.' },
  },
  {
    id: 'menus', target: '.menu-bar', screen: 'editor',
    title: { ko: '메뉴 막대', en: 'The menu bar' },
    body: { ko: '모든 명령이 여기 갈래별로 있습니다. 끝에는 테마, 언어, 설정, 정보 단추가 있습니다.', en: 'Every command is here, by category. At the end are the theme, language, settings and about buttons.' },
  },
  {
    id: 'toolbar', target: '.tool-bar', screen: 'editor',
    title: { ko: '툴바', en: 'The toolbar' },
    body: { ko: '늘 쓰는 명령과 확대 비율, 피사체 선택 같은 작업, 전경색과 배경색이 있습니다.', en: 'The commands you use all the time, the zoom level, tasks such as Select Subject, and the foreground and background colours.' },
  },
  {
    id: 'tools', target: '.tool-strip', screen: 'editor',
    title: { ko: '도구', en: 'The tools' },
    body: { ko: '선택, 칠하기, 리터치, 문자 도구입니다. 켜져 있는 그룹을 다시 누르면 그 그룹의 도구를 차례로 돌아갑니다.', en: 'Selection, painting, retouching and type. Clicking the active group again steps through the tools in it.' },
  },
  {
    id: 'options', target: '.options-bar', screen: 'editor',
    title: { ko: '옵션 막대', en: 'The options bar' },
    body: { ko: '지금 도구의 설정과, 그 도구가 무엇을 하는지 한 줄 설명을 보여 줍니다.', en: 'The settings of the current tool, and one line on what it does.' },
  },
  {
    id: 'stage', target: '.stage-column', screen: 'editor',
    title: { ko: '캔버스', en: 'The canvas' },
    body: { ko: '그림을 편집하는 곳입니다. 바탕화면에서 이미지를 끌어다 놓아도 열립니다.', en: 'Where the picture is edited. An image dragged here from the desktop opens too.' },
  },
  {
    id: 'panel', target: '.panel', screen: 'editor',
    title: { ko: '패널', en: 'The panels' },
    body: { ko: '레이어, 색상, 작업 내역 같은 패널을 탭으로 고릅니다. 왼쪽 경계를 끌어 폭을 바꿉니다.', en: 'Pick panels such as Layers, Color and History by tab. Drag the left edge to change the width.' },
  },
  {
    id: 'themes', target: '.theme-menu-group', screen: 'editor',
    title: { ko: '테마', en: 'Themes' },
    body: { ko: 'Dark 20종과 Light 20종에서 고릅니다. 드롭다운 맨 위의 단추로 사용자 정의 테마를 만들고 테마 설정을 엽니다.', en: 'Choose from 20 Dark and 20 Light themes. The buttons at the top of the drop-down make custom themes and open the theme settings.' },
  },
  {
    id: 'help', target: '.menu-bar [data-menu="helpMenu"]', screen: 'editor',
    title: { ko: '도움말', en: 'Help' },
    body: { ko: '사용자 설명서(F1), 이 튜토리얼, 정보는 도움말 메뉴에 있습니다. 튜토리얼은 여기까지입니다.', en: 'The User Guide (F1), this tutorial and About are in the Help menu. That is the end of the tutorial.' },
  },
]

const CARD_WIDTH = 360
const CARD_HEIGHT = 210
const MARGIN = 12

/** Where the card goes for a target box: below it, or above, or inside it; kept in the window. */
export function placeCard(box: { left: number; top: number; right: number; bottom: number } | null, width: number, height: number) {
  if (!box) return { left: Math.round((width - CARD_WIDTH) / 2), top: Math.round((height - CARD_HEIGHT) / 2) }
  const left = Math.max(MARGIN, Math.min(box.left, width - CARD_WIDTH - MARGIN))
  if (box.bottom + MARGIN + CARD_HEIGHT <= height) return { left, top: box.bottom + MARGIN }
  if (box.top - MARGIN - CARD_HEIGHT >= 0) return { left, top: box.top - MARGIN - CARD_HEIGHT }
  return { left: Math.max(MARGIN, Math.min(box.right - CARD_WIDTH - MARGIN, width - CARD_WIDTH - MARGIN)), top: Math.max(MARGIN, height - CARD_HEIGHT - MARGIN) }
}
