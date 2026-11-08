// 한국어 (기본 언어). en.js 와 키가 같아야 한다 (test/i18n.test.js).
import extra from './ko-extra.js';

const base = {
  // menus
  'menu.home': '홈', 'menu.file': '파일', 'menu.edit': '편집', 'menu.format': '서식', 'menu.insert': '삽입', 'menu.tools': '도구', 'menu.view': '보기', 'menu.help': '도움말',
  'submenu.case': '대소문자', 'submenu.lines': '줄', 'submenu.whitespace': '탭과 공백', 'submenu.kind': '문서 종류', 'submenu.encoding': '인코딩', 'submenu.eol': '줄 끝', 'submenu.previewStyle': '미리 보기 스타일',
  // file
  'action.new': '새 문서', 'action.newMarkdown': '새 Markdown', 'action.newHtml': '새 HTML', 'action.newText': '새 텍스트', 'action.newFromTemplate': '서식 파일로 새로 만들기',
  'action.pasteNew': '붙여 넣어 새 문서', 'action.open': '열기…', 'action.openRecent': '최근 파일', 'action.reload': '디스크에서 다시 읽기',
  'action.save': '저장', 'action.saveAs': '다른 이름으로 저장…', 'action.saveAll': '모두 저장', 'action.exportHtml': 'HTML 로 내보내기…', 'action.copyHtml': 'HTML 로 복사',
  'action.print': '인쇄…', 'action.closeTab': '탭 닫기', 'action.closeAll': '모두 닫기', 'action.exit': '끝내기',
  // edit
  'action.undo': '실행 취소', 'action.redo': '다시 실행', 'action.cut': '잘라내기', 'action.copy': '복사', 'action.paste': '붙여넣기', 'action.selectAll': '모두 선택',
  'action.find': '찾기', 'action.replace': '바꾸기', 'action.gotoLine': '줄로 이동…', 'action.duplicateLine': '줄 복제', 'action.toggleComment': '주석 전환',
  'action.indentMore': '들여쓰기', 'action.indentLess': '내어쓰기', 'action.readOnly': '읽기 전용',
  // format
  'action.bold': '굵게', 'action.italic': '기울임', 'action.strike': '취소선', 'action.inlineCode': '인라인 코드', 'action.heading': '제목 수준',
  'action.heading1': '제목 1', 'action.heading2': '제목 2', 'action.heading3': '제목 3', 'action.heading4': '제목 4', 'action.paragraph': '본문 (제목 해제)',
  'action.bulletList': '글머리 기호 목록', 'action.orderedList': '번호 목록', 'action.taskList': '할 일 목록', 'action.quote': '인용',
  // insert
  'action.link': '링크…', 'action.image': '그림…', 'action.table': '표…', 'action.codeBlock': '코드 블록…', 'action.hr': '구분선', 'action.footnote': '각주', 'action.dateTime': '날짜와 시간',
  // tools
  'action.upper': '대문자로', 'action.lower': '소문자로', 'action.titleCase': '단어 첫 글자 대문자', 'action.sortAsc': '줄 오름차순 정렬', 'action.sortDesc': '줄 내림차순 정렬',
  'action.reverseLines': '줄 순서 뒤집기', 'action.dedupe': '중복 줄 지우기', 'action.trimTrailing': '줄 끝 공백 지우기', 'action.removeEmpty': '빈 줄 지우기', 'action.joinLines': '줄 합치기',
  'action.tabsToSpaces': '탭 → 공백', 'action.spacesToTabs': '공백 → 탭', 'action.formatHtml': 'HTML 정리 (들여쓰기)', 'action.escapeHtml': 'HTML 특수 문자로 바꾸기', 'action.stats': '문서 통계',
  // view
  'action.viewEditor': '편집기만', 'action.viewSplit': '나란히 보기', 'action.viewPreview': '미리 보기만', 'action.cycleView': '보기 전환', 'action.syncScroll': '스크롤 맞추기',
  'action.outline': '개요 패널', 'action.statusBar': '상태 표시줄', 'action.wordWrap': '자동 줄 바꿈', 'action.lineNumbers': '줄 번호', 'action.activeLine': '현재 줄 강조', 'action.whitespace': '공백 문자 표시',
  'action.zoomIn': '글자 크게', 'action.zoomOut': '글자 작게', 'action.zoomReset': '글자 크기 원래대로', 'action.focusMode': '집중 모드 (전체 화면)',
  'action.themeRandom': '테마 바꾸기 (무작위)', 'action.themeChoose': '테마 고르기', 'action.language': 'English 로 전환', 'action.settings': '설정…',
  // help
  'action.userGuide': '사용 설명서', 'action.tutorialDoc': '튜토리얼 문서', 'action.tutorial': '튜토리얼 시작', 'action.shortcuts': '바로 가기 키', 'action.about': 'MyTextMaster 정보',
  // dialog buttons
  'action.ok': '확인', 'action.cancel': '취소', 'action.close': '닫기', 'action.insert': '삽입', 'action.go': '이동', 'action.dontSave': '저장 안 함', 'action.overwrite': '덮어쓰기', 'action.keepMine': '내 내용 유지',
  'action.shuffleBackground': '배경 바꾸기',
  // toolbar
  'toolbar.export': '내보내기',
  // window
  'window.minimize': '최소화', 'window.maximize': '최대화', 'window.restore': '이전 크기로', 'window.close': '닫기',
  // tips
  'tip.home': '시작 화면 (다시 누르면 문서로 돌아갑니다)', 'tip.panelSplitter': '끌어서 개요 패널 폭 조절', 'tip.previewSplitter': '끌어서 편집기와 미리 보기 폭 조절',
  'tip.resize': '끌어서 창 크기 조절', 'tip.newTab': '새 문서 (Ctrl+N)', 'tip.hideOutline': '개요 패널 숨기기', 'tip.fontSize': '편집기 글자 크기',
  'tip.kind': '문서 종류 바꾸기 (강조와 미리 보기)', 'tip.tabSize': '들여쓰기: 공백/탭과 너비', 'tip.eol': '줄 끝 문자 (LF / CRLF)', 'tip.encoding': '저장할 때 쓰는 인코딩',
  'tip.userGuide': '사용 설명서를 읽기 전용 탭으로 엽니다', 'tip.tutorialDoc': '따라 하는 튜토리얼 문서를 엽니다', 'tip.startHelp': '도움말 메뉴',
  // tabs
  'tabs.documents': '열린 문서', 'tabs.left': '왼쪽 탭', 'tabs.right': '오른쪽 탭', 'tabs.closeOthers': '다른 탭 닫기', 'tabs.closeRight': '오른쪽 탭 닫기',
  'tabs.rename': '이름 바꾸기…', 'tabs.copyPath': '경로 복사', 'tabs.openFolder': '들어 있는 폴더 열기',
  // panels
  'panel.outline': '개요', 'panel.preview': '미리 보기', 'outline.empty': '제목(#, <h1>…)이 없습니다. 제목을 쓰면 여기에 목차가 나타납니다.', 'outline.text': '텍스트 문서에는 개요가 없습니다. 문서 종류를 Markdown 이나 HTML 로 바꾸면 제목이 나타납니다.',
  'preview.scriptsOn': '스크립트 실행', 'preview.scriptsOff': '스크립트 꺼짐',
  'previewStyle.github': 'GitHub', 'previewStyle.document': '문서', 'previewStyle.academic': '논문', 'previewStyle.plain': '단순',
  'drop.hint': '여기에 놓으면 파일을 엽니다',
  // kinds and files
  'kind.markdown': 'Markdown', 'kind.html': 'HTML', 'kind.text': '텍스트',
  'filter.all': '지원하는 문서', 'filter.markdown': 'Markdown 문서', 'filter.html': 'HTML 문서', 'filter.text': '텍스트 파일', 'filter.any': '모든 파일',
  'doc.untitled': '제목없음',
  // status bar
  'status.cursor': '줄 {line}, 열 {col}', 'status.line': '{n}번째 줄', 'status.selected': '{n}자 선택', 'status.words': '{words}단어 · {chars}자 · {lines}줄',
  'status.modified': '수정됨', 'status.saved': '저장됨', 'status.new': '새 문서', 'status.readOnly': '읽기 전용', 'status.spaces': '공백 {n}', 'status.tabs': '탭 {n}',
  'status.start': '시작 화면', 'status.openDocs': '열린 문서 {n}개', 'status.desktop': '데스크톱', 'status.web': '웹',
  // notices
  'notice.theme': '테마: {name}', 'notice.opened': '열었습니다: {name}', 'notice.saved': '저장했습니다: {name}', 'notice.reloaded': '디스크에서 다시 읽었습니다: {name}',
  'notice.exported': '내보냈습니다: {name}', 'notice.htmlCopied': 'HTML 을 클립보드에 복사했습니다', 'notice.copied': '복사했습니다', 'notice.formatted': 'HTML 을 정리했습니다',
  'notice.newFrom': '새 문서: {name}', 'notice.sample': '예제를 열었습니다: {name} (저장하면 내 파일이 됩니다)', 'notice.clipboardEmpty': '클립보드에 글이 없습니다',
  'notice.kind': '문서 종류: {kind}', 'notice.encoding': '인코딩: {name} (저장할 때 적용)', 'notice.recentCleared': '최근 파일 목록을 지웠습니다',
  'notice.webRecent': '웹 버전은 최근 파일을 바로 다시 열 수 없습니다. 파일을 골라 주세요.', 'notice.downloaded': '다운로드로 저장했습니다: {name}',
  'notice.linkWeb': '이 링크는 데스크톱 버전에서 저장된 문서일 때 열 수 있습니다', 'notice.linkMissing': '링크한 파일이 없습니다: {name}',
  'notice.missing': '파일이 디스크에서 사라졌습니다: {name}', 'notice.restored': '지난번에 열려 있던 문서 {n}개를 다시 열었습니다', 'notice.animation': '배경: {name}',
  'notice.view.editor': '편집기만 보기', 'notice.view.split': '편집기와 미리 보기 나란히', 'notice.view.preview': '미리 보기만 보기',
  // confirm & errors
  'confirm.unsavedTitle': '저장하지 않은 변경', 'confirm.unsaved': '"{name}" 의 변경 내용을 저장할까요?', 'confirm.unsavedDetail': '저장하지 않으면 바뀐 내용이 사라집니다.',
  'confirm.reload': '"{name}" 의 저장하지 않은 변경을 버리고 디스크에서 다시 읽을까요?',
  'confirm.overwriteChanged': '"{name}" 이(가) 다른 프로그램에서 바뀌었습니다. 그래도 덮어쓸까요?',
  'confirm.changedTitle': '파일이 바뀌었습니다', 'confirm.changed': '"{name}" 이(가) 다른 프로그램에서 바뀌었습니다.', 'confirm.changedDetail': '디스크의 내용을 다시 읽을까요? 이 창에서 고친 내용은 사라집니다.',
  'error.title': '오류', 'error.open': '"{name}" 을(를) 열 수 없습니다', 'error.save': '"{name}" 을(를) 저장할 수 없습니다',
  // fields
  'field.name': '이름', 'field.linkText': '표시할 글', 'field.url': '주소 (URL)', 'field.imageUrl': '그림 주소 또는 경로', 'field.alt': '대체 글 (설명)',
  'field.imageNote': '문서와 같은 폴더 기준의 상대 경로(images/a.png)나 웹 주소를 쓸 수 있습니다.',
  'field.columns': '열 수', 'field.rows': '행 수 (머리글 제외)', 'field.column': '열', 'field.language': '언어', 'field.noLanguage': '(없음)', 'field.line': '줄 번호 (1–{n})',
  'placeholder.bold': '굵은 글', 'placeholder.italic': '기울인 글', 'placeholder.strike': '지운 글', 'placeholder.heading': '제목',
  // recent
  'recent.empty': '최근에 연 파일이 없습니다', 'recent.noFolders': '최근 폴더가 없습니다', 'recent.clear': '목록 지우기', 'recent.clearFolders': '폴더 목록 지우기',
  'recent.remove': '목록에서 빼기', 'recent.removeFolder': '목록에서 빼기', 'recent.webFile': '브라우저에서 연 파일',
  // start page
  'start.tagline': 'Markdown · HTML · 텍스트 문서를 쓰고, 바로 미리 보는 편집기',
  'start.actions': '바로 가기', 'start.recentCard': '최근 항목', 'start.recent': '최근 파일', 'start.recentFolders': '최근 폴더', 'start.new': '새로 만들기', 'start.samples': '예제 문서',
  'start.theme': '테마', 'start.themeDark': '어두운 테마', 'start.themeLight': '밝은 테마', 'start.themeSettings': '테마 설정', 'start.background': '움직이는 배경',
  'start.settings': '시작 화면 설정', 'start.arrange': '자동 정렬', 'start.arrangeTip': '카드를 처음 배치로 되돌립니다', 'start.moveCard': '끌어서 카드 옮기기', 'start.resizeCard': '끌어서 크기 조절 (두 번 누르면 내용에 맞춤)',
  'start.tutorialStart': '튜토리얼 시작', 'start.openDocs': '열린 문서가 {n}개 있습니다', 'start.back': '문서로 돌아가기', 'start.backTip': '편집하던 문서로 돌아갑니다',
  'start.tipOpen': 'Markdown·HTML·텍스트 파일 열기 (Ctrl+O)', 'start.tipNewMarkdown': '빈 .md 문서', 'start.tipNewHtml': 'HTML5 기본 뼈대', 'start.tipNewText': '빈 .txt 문서',
  'start.tipPasteNew': '클립보드의 글로 새 문서', 'start.tipTutorial': '창의 각 부분을 차례로 안내', 'start.tipTheme': '테마·글꼴 설정', 'start.tipLanguage': '화면 언어 전환',
  'start.tipSettings': '편집기·미리 보기·파일 설정', 'start.tipStartSettings': '시작 화면에 보일 카드와 배경', 'start.tipAbout': '버전과 빌드 정보', 'start.tipExit': '프로그램 끝내기',
  'start.never': '안 함', 'start.everySeconds': '{n}초마다', 'start.everyMinutes': '{n}분마다', 'start.bgInterval': '자동 변경', 'start.bgIntervalTip': '배경을 정해진 시간마다 바꿉니다',
  'start.bgRandom': '무작위', 'start.bgRandomTip': '다음 배경을 무작위로 고릅니다', 'start.cardOpacity': '카드 불투명도', 'start.still': '멈추기', 'start.move': '움직이기', 'start.stillTip': '배경을 멈추거나 다시 움직입니다',
  'animation.aurora': '오로라', 'animation.waves': '물결', 'animation.particles': '입자', 'animation.constellation': '별자리', 'animation.bubbles': '거품', 'animation.gridflow': '흐르는 격자',
  'animation.flowchart': '순서도', 'animation.starfield': '별빛 여행', 'animation.rain': '비', 'animation.snow': '눈', 'animation.fireflies': '반딧불이', 'animation.ripples': '파문',
  'animation.coderain': '코드 비', 'animation.hexagons': '육각형', 'animation.orbits': '궤도', 'animation.lava': '라바 램프', 'animation.spiral': '나선 은하', 'animation.confetti': '색종이',
  'animation.nodes': '노드 네트워크', 'animation.ribbons': '리본',
  // settings
  'settings.tab.general': '일반', 'settings.tab.appearance': '모양', 'settings.tab.editor': '편집기', 'settings.tab.preview': '미리 보기', 'settings.tab.files': '파일', 'settings.tab.start': '시작 화면',
  'settings.language': '언어', 'settings.defaultKind': '새 문서 종류', 'settings.defaultKindTip': 'Ctrl+N 과 + 탭이 만드는 문서', 'settings.theme': '테마',
  'settings.uiFont': '화면 글꼴', 'settings.uiFontSize': '화면 글자 크기', 'settings.editorFont': '편집기 글꼴', 'settings.editorFontSize': '편집기 글자 크기',
  'settings.tabSize': '탭 너비', 'settings.insertSpaces': 'Tab 키로 공백 넣기', 'settings.autoCloseBrackets': '괄호·따옴표 자동 닫기',
  'settings.viewMode': '보기', 'settings.previewScripts': 'HTML 미리 보기에서 스크립트 실행', 'settings.previewScriptsTip': '켜면 HTML 문서의 <script> 가 미리 보기에서 실행됩니다. 이때 미리 보기는 프로그램과 분리되어 스크롤 맞추기가 비율로만 동작합니다. 믿을 수 있는 문서에서만 켜세요.',
  'settings.autoSave': '자동 저장', 'settings.autoSaveTip': '이미 파일로 저장된 문서를 정해진 간격으로 저장합니다 (데스크톱)', 'settings.autoSaveSeconds': '자동 저장 간격', 'settings.seconds': '초',
  'settings.restoreSession': '시작할 때 지난 문서 다시 열기', 'settings.restoreSessionTip': '끝낼 때 열려 있던 문서(저장하지 않은 내용 포함)를 다음에 다시 엽니다',
  'settings.showStartPage': '시작할 때 시작 화면 보이기', 'settings.startShowRecent': '최근 항목 카드', 'settings.startRecentCount': '최근 항목 개수', 'settings.startShowSamples': '예제 문서 카드',
  'settings.startShowBackground': '움직이는 배경 카드', 'settings.backgroundMoves': '배경', 'settings.bgAnimated': '움직임', 'settings.bgStatic': '멈춤', 'settings.animation': '배경 종류', 'settings.animationSpeed': '배경 속도',
  'settings.reset': '기본값으로', 'settings.resetConfirm': '모든 설정을 기본값으로 되돌릴까요? 최근 파일 목록과 열린 문서는 그대로입니다.', 'settings.resetDone': '설정을 기본값으로 되돌렸습니다',
  'color.bg': '배경', 'color.surface': '표면', 'color.panel': '패널', 'color.text': '글자', 'color.muted': '흐린 글자', 'color.border': '테두리', 'color.accent': '강조', 'color.accentText': '강조 위 글자',
  'color.gridAlt': '교차 줄', 'color.chart': '편집 영역', 'color.toolbar': '도구 모음', 'color.status': '상태 표시줄', 'color.dark': '어두운 테마',
  // about & stats
  'about.description': 'Markdown, HTML, 텍스트 파일을 편집합니다. 탭, 문법 강조, 나란히 미리 보기와 스크롤 맞추기, 개요, 찾기·바꾸기, 서식 도구, 줄 도구, 인코딩(UTF-8·UTF-16·EUC-KR)과 줄 끝, HTML 내보내기와 인쇄를 지원합니다. Windows·macOS·Linux·웹에서 실행됩니다.',
  'about.build': '빌드 정보', 'about.version': '버전', 'about.built': '빌드 날짜', 'about.commit': '커밋', 'about.platform': '플랫폼', 'about.runtime': '실행 환경', 'about.author': '만든 사람', 'about.libraries': '사용한 라이브러리',
  'stats.words': '단어', 'stats.chars': '글자 (공백 포함)', 'stats.noSpaces': '글자 (공백 제외)', 'stats.lines': '줄', 'stats.paragraphs': '문단', 'stats.reading': '읽는 시간', 'stats.minutes': '약 {n}분',
  'stats.encoding': '인코딩', 'stats.kind': '문서 종류', 'stats.selection': '선택한 글: {n}자',
  'shortcut.editor': '편집기', 'shortcut.nextTab': '다음 탭', 'shortcut.prevTab': '이전 탭', 'shortcut.moveLine': '줄 위/아래로 옮기기', 'shortcut.selectNext': '같은 단어 하나 더 선택',
  'shortcut.click': '클릭', 'shortcut.multiCursor': '커서 여러 개 / 사각 선택', 'shortcut.menu': '파일 메뉴 열기',
  // template names (file names of new documents)
  'templateName.readme': 'README', 'templateName.meeting': '회의록', 'templateName.blog': '블로그 글', 'templateName.todo': '할 일', 'templateName.changelog': 'CHANGELOG', 'templateName.webpage': 'index', 'templateName.letter': '편지',
  // tutorial
  'tour.title': '튜토리얼', 'tour.close': '튜토리얼 닫기', 'tour.prev': '이전', 'tour.next': '다음', 'tour.finish': '끝내기', 'tour.keys': '← → 키로 이동',
  'tour.welcome.title': 'MyTextMaster 에 오신 것을 환영합니다',
  'tour.welcome.text': '이 안내는 창의 각 부분을 차례로 보여 줍니다. 예제 문서 "기능 둘러보기" 를 열어 두었으니 안내를 따라 직접 눌러 보세요.',
  'tour.menubar.title': '메뉴 막대와 창 단추', 'tour.menubar.text': '맨 위 줄은 제목 표시줄을 겸합니다. 왼쪽에 프로그램 이름·버전·열린 문서 이름이, 오른쪽에 최소화·최대화·닫기 단추가 있습니다. 빈 곳을 끌면 창이 움직이고, 두 번 누르면 최대화됩니다. Alt 키만 누르면 파일 메뉴가 열립니다.',
  'tour.home.title': '홈 (시작 화면)', 'tour.home.text': '홈을 누르면 시작 화면이 나오고, 한 번 더 누르면 편집하던 문서로 돌아갑니다. 시작 화면에서는 새 문서·예제·최근 파일·테마·배경을 고를 수 있고, 카드를 끌어 원하는 자리에 놓을 수 있습니다.',
  'tour.file.title': '파일', 'tour.file.text': '새 문서(Ctrl+N), 열기(Ctrl+O), 저장(Ctrl+S), 모두 저장, 인쇄(Ctrl+P). 파일을 창에 끌어다 놓아도 열립니다.',
  'tour.format.title': '서식', 'tour.format.text': '굵게(Ctrl+B)·기울임(Ctrl+I)·취소선·코드·제목·목록·인용. Markdown 문서에는 Markdown 기호를, HTML 문서에는 HTML 태그를 넣습니다. 다시 누르면 서식이 풀립니다.',
  'tour.insert.title': '삽입', 'tour.insert.text': '링크(Ctrl+K), 그림, 표, 코드 블록, 구분선을 넣습니다. 표는 열과 행 수를 물어본 뒤 빈 표를 만듭니다.',
  'tour.view.title': '보기', 'tour.view.text': '편집기만 · 나란히 · 미리 보기만 (Ctrl+\\ 로 전환), 그리고 스크롤 맞추기. 나란히 볼 때 한쪽을 스크롤하면 다른 쪽이 같은 곳을 보여 줍니다.',
  'tour.tabs.title': '문서 탭', 'tour.tabs.text': '여러 문서를 탭으로 엽니다. ● 는 저장하지 않은 문서입니다. 가운데 단추로 누르면 닫히고, 오른쪽 단추를 누르면 다른 탭 닫기·경로 복사 같은 메뉴가 나옵니다. Ctrl+Tab 으로 탭을 옮겨 다닙니다.',
  'tour.editor.title': '편집기', 'tour.editor.text': '문법 강조, 줄 번호, 접기, 괄호 짝, 자동 완성, 여러 커서(Alt+클릭, Ctrl+D)를 지원합니다. 찾기는 Ctrl+F, 바꾸기는 Ctrl+H, 줄 이동은 Ctrl+G 입니다.',
  'tour.preview.title': '미리 보기', 'tour.preview.text': 'Markdown 은 바로 HTML 로 바뀌어 보이고, HTML 문서는 페이지 그대로 보입니다. 커서가 있는 문단에는 왼쪽에 주황색 표시가 붙습니다. 링크를 누르면 브라우저나 다른 문서가 열립니다.',
  'tour.outline.title': '개요', 'tour.outline.text': '문서의 제목을 목차로 보여 줍니다. 제목을 누르면 그 줄로 갑니다. 지금 커서가 있는 장이 강조됩니다. 경계선을 끌어 폭을 바꿀 수 있습니다.',
  'tour.status.title': '상태 표시줄', 'tour.status.text': '문서 종류, 커서 위치, 단어·글자·줄 수, 저장 상태, 들여쓰기, 줄 끝(LF/CRLF), 인코딩을 보여 줍니다. 항목을 누르면 바로 바꿀 수 있습니다.',
  'tour.right.title': '튜토리얼·테마·언어·설정', 'tour.right.text': '테마 단추는 무작위 테마를, ▾ 는 테마 목록(밝은 20개, 어두운 20개)을 엽니다. 국기 단추로 한국어와 영어를 바꾸고, 톱니바퀴로 설정을 엽니다.',
  'tour.done.title': '끝났습니다', 'tour.done.text': '이제 직접 써 보세요. 더 자세한 내용은 도움말 › 사용 설명서(F1)와 튜토리얼 문서에 있습니다. 바로 가기 키 목록은 도움말 › 바로 가기 키에서 볼 수 있습니다.',
};

export default { ...base, ...extra };
