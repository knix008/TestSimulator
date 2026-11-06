// The tutorials: real minutes, written step by step with the real controls. A step looks at the
// meeting (and at what is open) to see whether it is done, so any way of doing it counts; "Do it
// for me" runs `run` for someone who would rather watch. Each step can show a screenshot.
import { emptyMeeting, isEmpty, newAction, newAttendee, newEntry, todayText, type Meeting } from './meeting'
import type { PageSetup } from './print/pageSetup'
import type { Locale } from './settings'

type Text = Record<Locale, string>

/** What a step can see besides the meeting. */
export type TutorialView = { printOpen: boolean; exportOpen: boolean; pageSetup: PageSetup; saved: boolean }

/** What a step can do. */
export type TutorialApi = {
  meeting: Meeting
  language: Locale
  setMeeting: (meeting: Meeting) => void
  openPrint: () => void
  closePrint: () => void
  setPageSetup: (patch: Partial<PageSetup>) => void
  openExport: () => void
  loadSample: () => void
}

export type TutorialStep = {
  id: string
  title: Text
  text: Text
  /** A screenshot from doc/images, without the language prefix and extension. */
  image?: string
  /** What to look at on the screen. */
  highlight?: string
  /** Absent on a step that only explains. */
  done?: (meeting: Meeting, view: TutorialView) => boolean
  run?: (api: TutorialApi) => void
}

export type Tutorial = { id: string; icon: string; title: Text; goal: Text; steps: TutorialStep[] }

const words = {
  title: { ko: '주간 팀 회의', en: 'Weekly Team Meeting' },
  people: { ko: [['김수호', '기획'], ['이영희', '개발'], ['박민준', '디자인']], en: [['Suho Kim', 'Planning'], ['Younghee Lee', 'Development'], ['Minjun Park', 'Design']] },
  agenda: { ko: ['지난주 진행 상황 공유', '이번 주 우선순위 결정'], en: ['Last week\'s progress', 'This week\'s priorities'] },
  body: {
    ko: '지난주 출시한 기능의 사용자 반응을 공유했습니다.\n\n- 로그인 속도 개선에 대한 긍정적인 의견이 많았습니다.\n- 모바일 화면의 글자 크기 조정 요청이 있었습니다.',
    en: 'We shared how users received last week\'s release.\n\n- Most feedback praised the faster sign-in.\n- Several users asked for larger text on mobile.',
  },
  heading: { ko: '## 사용자 반응', en: '## User feedback' },
  decision: { ko: '모바일 글자 크기 옵션을 다음 배포에 포함한다.', en: 'Ship a mobile text-size option in the next release.' },
  action: { ko: ['모바일 글자 크기 옵션 구현', '이영희', '다음 주 금요일'], en: ['Build the mobile text-size option', 'Younghee Lee', 'Next Friday'] },
}

const named = (list: { name?: string; text?: string; task?: string }[]) => list.filter((item) => (item.name ?? item.text ?? item.task ?? '').trim())

export const TUTORIALS: Tutorial[] = [
  {
    id: 'basics',
    icon: 'pen',
    title: { ko: '첫 회의록 작성하기', en: 'Write your first minutes' },
    goal: { ko: '회의 정보, 참석자, 안건, 회의 내용, 결정 사항, 실행 항목을 차례로 채워 회의록 한 편을 완성합니다.', en: 'Fill in the details, attendees, agenda, discussion, decisions and action items to finish one set of minutes.' },
    steps: [
      {
        id: 'screen',
        title: { ko: '화면 둘러보기', en: 'Look around' },
        text: {
          ko: '왼쪽은 **문서 구조**, 가운데는 회의록 **문서**입니다. 문서의 각 칸을 눌러 바로 입력하고, 목록은 **+** 단추로 한 줄씩 추가합니다. 이 카드는 머리글을 끌어 옮길 수 있습니다.',
          en: 'On the left is the **outline**, in the middle the **document** itself. Click any field to type in it; lists grow one line at a time with the **+** buttons. Drag this card by its header to move it.',
        },
        image: 'main',
      },
      {
        id: 'title',
        title: { ko: '회의 제목 입력', en: 'Name the meeting' },
        text: { ko: `맨 위 **제목** 칸에 "${words.title.ko}"를 입력하세요.`, en: `Type "${words.title.en}" in the **title** field at the top.` },
        highlight: '[data-field="title"]',
        done: (m) => m.title.trim().length > 0,
        run: (api) => api.setMeeting({ ...api.meeting, title: words.title[api.language] }),
      },
      {
        id: 'when',
        title: { ko: '날짜와 시간', en: 'Date and time' },
        text: {
          ko: '**날짜** 옆의 달력 단추로 날짜를 고르고, **시작**과 **종료** 시간을 입력하세요(예: 10:00, 11:00).',
          en: 'Pick the **date** with the calendar button beside it, then enter the **start** and **end** times (e.g. 10:00, 11:00).',
        },
        image: 'info',
        highlight: '[data-section="info"]',
        done: (m) => !!m.date.trim() && !!m.startTime.trim(),
        run: (api) => api.setMeeting({ ...api.meeting, date: api.meeting.date || todayText(), startTime: api.meeting.startTime || '10:00', endTime: api.meeting.endTime || '11:00' }),
      },
      {
        id: 'attendees',
        title: { ko: '참석자 추가', en: 'Add attendees' },
        text: {
          ko: '**참석자** 칸의 **+ 참석자 추가** 단추를 눌러 두 명 이상 입력하세요. 이름, 소속/역할, 참석 여부(참석·원격·불참)를 적을 수 있습니다. 줄 오른쪽 단추로 순서를 바꾸거나 지웁니다.',
          en: 'Press **+ Add attendee** in **Attendees** and enter two or more people: a name, a role or team, and present, remote or absent. The buttons at the end of a row move or delete it.',
        },
        image: 'attendees',
        highlight: '[data-add="attendees"]',
        done: (m) => named(m.attendees).length >= 2,
        run: (api) => api.setMeeting({ ...api.meeting, attendees: [...named(api.meeting.attendees) as Meeting['attendees'], ...words.people[api.language].map(([name, role]) => newAttendee(name, role))] }),
      },
      {
        id: 'agenda',
        title: { ko: '안건 추가', en: 'Add the agenda' },
        text: {
          ko: '**+ 안건 추가**로 안건을 두 개 이상 적으세요. 입력 칸에서 **Enter**를 누르면 바로 다음 줄이 추가됩니다.',
          en: 'Add two or more items with **+ Add item**. Pressing **Enter** in a field adds the next line right away.',
        },
        highlight: '[data-add="agenda"]',
        done: (m) => named(m.agenda).length >= 2,
        run: (api) => api.setMeeting({ ...api.meeting, agenda: [...named(api.meeting.agenda) as Meeting['agenda'], ...words.agenda[api.language].map((text) => newEntry(text))] }),
      },
      {
        id: 'discussion',
        title: { ko: '회의 내용 작성', en: 'Write the discussion' },
        text: {
          ko: '**회의 내용** 편집기에 논의한 내용을 적으세요. 보이는 그대로 저장되는 WYSIWYG 편집기라 Markdown 기호를 몰라도 됩니다.',
          en: 'Write what was discussed in the **Discussion** editor. It is WYSIWYG: what you see is what is saved, no Markdown needed.',
        },
        image: 'editor',
        highlight: '.richeditor',
        done: (m) => m.body.trim().length > 0,
        run: (api) => api.setMeeting({ ...api.meeting, body: `${api.meeting.body.trim() ? `${api.meeting.body.trim()}\n\n` : ''}${words.body[api.language]}` }),
      },
      {
        id: 'format',
        title: { ko: '서식 넣기', en: 'Add formatting' },
        text: {
          ko: '편집기 위 **서식 막대**에서 글자를 **굵게** 하거나 **제목**을 넣어 보세요. 단축키 Ctrl+B, Ctrl+I, Ctrl+U도 됩니다.',
          en: 'Use the **format bar** above the editor to make text **bold** or add a **heading**. Ctrl+B, Ctrl+I and Ctrl+U work too.',
        },
        highlight: '.format-bar',
        done: (m) => /^#{1,6}\s|\*\*[^*]+\*\*|<u>/m.test(m.body),
        run: (api) => api.setMeeting({ ...api.meeting, body: `${words.heading[api.language]}\n\n${api.meeting.body.trim() || words.body[api.language]}` }),
      },
      {
        id: 'decisions',
        title: { ko: '결정 사항', en: 'Record a decision' },
        text: { ko: '**+ 결정 사항 추가**로 회의에서 정한 것을 적으세요.', en: 'Write down what was decided with **+ Add decision**.' },
        highlight: '[data-add="decisions"]',
        done: (m) => named(m.decisions).length >= 1,
        run: (api) => api.setMeeting({ ...api.meeting, decisions: [...named(api.meeting.decisions) as Meeting['decisions'], newEntry(words.decision[api.language])] }),
      },
      {
        id: 'actions',
        title: { ko: '실행 항목', en: 'Assign an action item' },
        text: {
          ko: '**+ 실행 항목 추가**를 누르고 할 일, 담당자, 기한을 입력하세요. 끝난 일은 맨 앞 체크 상자로 완료 표시합니다.',
          en: 'Press **+ Add action item** and enter the task, its owner and due date. Tick the box at the front once it is done.',
        },
        image: 'actions',
        highlight: '[data-add="actionItems"]',
        done: (m) => m.actionItems.some((item) => item.task.trim() && item.owner.trim()),
        run: (api) => {
          const [task, owner, due] = words.action[api.language]
          api.setMeeting({ ...api.meeting, actionItems: [...api.meeting.actionItems.filter((item) => item.task.trim()), newAction(task, owner, due)] })
        },
      },
      {
        id: 'finish',
        title: { ko: '완성', en: 'Done' },
        text: {
          ko: '회의록이 완성되었습니다. **저장**(Ctrl+S)으로 .mtg 파일에 남기고, **인쇄**(Ctrl+P)나 **내보내기**로 종이와 다른 형식으로 만들 수 있습니다. 다음 튜토리얼에서 인쇄를 배워 보세요.',
          en: 'Your minutes are finished. **Save** (Ctrl+S) keeps them in an .mtg file; **Print** (Ctrl+P) and **Export** turn them into paper and other formats. The next tutorial covers printing.',
        },
      },
    ],
  },
  {
    id: 'print',
    icon: 'print',
    title: { ko: '인쇄와 내보내기', en: 'Print and export' },
    goal: { ko: '페이지 설정과 미리보기로 인쇄물을 다듬고, Word·HTML·Markdown으로 내보냅니다.', en: 'Tune the printout with page setup and preview, then export to Word, HTML or Markdown.' },
    steps: [
      {
        id: 'sample',
        title: { ko: '예시 회의록 열기', en: 'Open the sample' },
        text: {
          ko: '인쇄해 볼 회의록이 필요합니다. 지금 쓰던 회의록이 있으면 그대로 써도 되고, **대신 해 주기**를 누르면 예시 회의록이 열립니다.',
          en: 'You need minutes to print. Use the ones you are writing, or press **Do it for me** to open the sample.',
        },
        done: (m) => !isEmpty(m),
        run: (api) => api.loadSample(),
      },
      {
        id: 'open-print',
        title: { ko: '인쇄 창 열기', en: 'Open Print' },
        text: { ko: '툴바의 **인쇄** 단추(또는 Ctrl+P)를 누르세요. 왼쪽은 페이지 설정, 오른쪽은 실제로 나올 페이지의 미리보기입니다.', en: 'Press **Print** in the toolbar (or Ctrl+P). Page setup is on the left; on the right is a preview of the real pages.' },
        image: 'print',
        highlight: '[data-command="print"]',
        done: (_, view) => view.printOpen,
        run: (api) => api.openPrint(),
      },
      {
        id: 'landscape',
        title: { ko: '용지 방향 바꾸기', en: 'Turn the paper' },
        text: { ko: '**방향**을 **가로**로 바꾸세요. 미리보기의 페이지가 즉시 다시 나뉩니다.', en: 'Set **Orientation** to **Landscape**. The preview splits the pages again at once.' },
        highlight: '[data-field="printOrientation"]',
        done: (_, view) => view.pageSetup.orientation === 'landscape',
        run: (api) => {
          api.openPrint()
          api.setPageSetup({ orientation: 'landscape' })
        },
      },
      {
        id: 'margins',
        title: { ko: '여백과 머리글', en: 'Margins and header' },
        text: {
          ko: '**여백**의 왼쪽 값을 25mm 이상으로 늘려 보세요. 머리글·바닥글 칸에는 {title}, {date}, {page}, {pages} 같은 자리 표시를 쓸 수 있습니다.',
          en: 'Raise the **left margin** to 25 mm or more. Header and footer fields understand {title}, {date}, {page} and {pages}.',
        },
        image: 'pagesetup',
        highlight: '[data-field="printMargin-left"]',
        done: (_, view) => view.pageSetup.margins.left >= 25,
        run: (api) => {
          api.openPrint()
          api.setPageSetup({ margins: { top: 20, right: 18, bottom: 20, left: 25 } })
        },
      },
      {
        id: 'export',
        title: { ko: '내보내기', en: 'Export' },
        text: {
          ko: '인쇄 창을 닫고 툴바의 **내보내기**를 누르세요. Word, HTML, Markdown, 텍스트로 저장할 수 있고, PDF는 인쇄 창에서 "PDF로 저장" 프린터를 고르면 됩니다.',
          en: 'Close Print and press **Export** in the toolbar. Save as Word, HTML, Markdown or text; for PDF, pick the "Save as PDF" printer in Print.',
        },
        image: 'export',
        highlight: '[data-command="export"]',
        done: (_, view) => view.exportOpen,
        run: (api) => {
          api.closePrint()
          api.openExport()
        },
      },
      {
        id: 'finish',
        title: { ko: '완성', en: 'Done' },
        text: {
          ko: '인쇄 설정은 저장되어 다음 인쇄와 Word 내보내기에 그대로 쓰입니다. 자세한 내용은 **도움말 → 사용 설명서**(F1)를 보세요.',
          en: 'Page setup is remembered for the next print and for the Word export. See **Help → User Guide** (F1) for more.',
        },
      },
    ],
  },
]

export const tutorialById = (id: string) => TUTORIALS.find((item) => item.id === id) ?? TUTORIALS[0]

/** The meeting a tutorial starts from. */
export const tutorialStart = (id: string, current: Meeting): Meeting => (id === 'basics' ? emptyMeeting() : current)
