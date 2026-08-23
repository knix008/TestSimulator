const dictionaries = {
  ko: {
    'settings.title': '폰트 및 표시 설정',
    'settings.hint': '범위 선택 후 서식 적용. (마우스로 텍스트 선택 가능)',
    'settings.scope': '적용 범위',
    'settings.scope.selection': '선택 영역',
    'settings.scope.whole': '전체 문서',
    'settings.font': '글꼴·크기·글자 색…',
    'settings.style': '글자 서식',
    'settings.style.bold': '굵게',
    'settings.style.italic': '기울임',
    'settings.style.underline': '밑줄',
    'settings.style.strike': '취소선',
    'settings.back': '배경색',
    'settings.back.custom': '사용자 지정 색…',
    'settings.opacity': '창 투명도',
    'settings.opacity.value': '{n}%',
    'settings.language': '언어 (Language)',
    'settings.general': '일반',
    'settings.autostart': '시스템 시작 시 자동 실행',
    'settings.autostart.web': '자동 실행과 트레이는 데스크톱 앱에서만 사용할 수 있습니다.',
    'settings.about': '프로그램 정보',
    'settings.author': '작성자',
    'settings.default': '기본값',
    'common.ok': '확인',
    'common.cancel': '취소',
    'common.info': '알림',
    'common.error': '오류',
    'common.done': '완료',
    'error.dialog.title': '오류 상세',
    'error.dialog.hint': '예기치 않은 오류가 발생했습니다. 내용을 복사해 보고해 주세요.',
    'error.dialog.hint.terminating': '치명적인 오류가 발생했습니다. 내용을 복사한 뒤 프로그램을 종료해 주세요.',
    'error.dialog.copy': '내용 복사',
    'error.dialog.copied': '복사됨',
    'error.dialog.copyFailed': '클립보드에 복사하지 못했습니다.',
    'memo.empty': '메모 내용을 입력해 주세요.',
    'memo.added': '메모가 추가되었습니다.',
    'memo.updated': '메모가 수정되었습니다.',
    'memo.deleted': '메모가 삭제되었습니다.',
    'memo.confirmDelete': '이 메모를 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.',
    'memo.confirmDelete.title': '메모 삭제 확인',
    'memo.nothingToDelete': '삭제할 저장된 메모가 없습니다. 목록(☰)에서 메모를 선택해 열거나 삭제해 주세요.',
    'memo.saveFailed': '메모 저장에 실패했습니다.',
    'list.title': '메모 목록',
    'list.load': '불러오기',
    'list.load.tip': '텍스트 파일 불러오기',
    'list.new': '새 메모',
    'list.new.tip': '빈 메모 창 열기',
    'list.delete': '삭제',
    'list.settings': '설정',
    'list.empty': '저장된 메모가 없습니다.',
    'list.selectToLoad': '불러올 메모 카드를 선택해 주세요.',
    'list.openFile.missing': '선택한 파일을 찾을 수 없습니다.',
    'list.openFile.failed': '파일을 불러오지 못했습니다.',
    'list.openFile.web': '웹에서는 아래 파일 선택으로 텍스트를 불러올 수 있습니다.',
    'tray.tooltip': '메모 패드',
    'main.add': '새 메모',
    'main.delete': '삭제',
    'main.settings': '설정',
    'main.listBtn': '메모 목록',
    'main.close': '닫기',
    'main.back': '목록으로',
    'about.version': '버전 {n}'
  },
  en: {
    'settings.title': 'Font & Display Settings',
    'settings.hint': 'Pick a scope, then apply formatting. (You can select text with the mouse.)',
    'settings.scope': 'Apply to',
    'settings.scope.selection': 'Selection',
    'settings.scope.whole': 'Whole document',
    'settings.font': 'Font, size, color…',
    'settings.style': 'Text style',
    'settings.style.bold': 'Bold',
    'settings.style.italic': 'Italic',
    'settings.style.underline': 'Underline',
    'settings.style.strike': 'Strikethrough',
    'settings.back': 'Background color',
    'settings.back.custom': 'Custom color…',
    'settings.opacity': 'Window transparency',
    'settings.opacity.value': '{n}%',
    'settings.language': 'Language (언어)',
    'settings.general': 'General',
    'settings.autostart': 'Start automatically when the system starts',
    'settings.autostart.web': 'Auto-start and the system tray are available in the desktop app only.',
    'settings.about': 'About',
    'settings.author': 'Author',
    'settings.default': 'Defaults',
    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.info': 'Notice',
    'common.error': 'Error',
    'common.done': 'Done',
    'error.dialog.title': 'Error Details',
    'error.dialog.hint': 'An unexpected error occurred. Copy the details to report them.',
    'error.dialog.hint.terminating': 'A fatal error occurred. Copy the details, then close the program.',
    'error.dialog.copy': 'Copy details',
    'error.dialog.copied': 'Copied',
    'error.dialog.copyFailed': 'Failed to copy to the clipboard.',
    'memo.empty': 'Please enter memo content.',
    'memo.added': 'Memo added.',
    'memo.updated': 'Memo updated.',
    'memo.deleted': 'Memo deleted.',
    'memo.confirmDelete': 'Delete this memo?\nThis cannot be undone.',
    'memo.confirmDelete.title': 'Confirm Delete',
    'memo.nothingToDelete': 'No saved memo to delete. Open or delete a memo from the list (☰).',
    'memo.saveFailed': 'Failed to save the memo.',
    'list.title': 'Memo List',
    'list.load': 'Open',
    'list.load.tip': 'Open a text file',
    'list.new': 'New',
    'list.new.tip': 'Open a blank memo',
    'list.delete': 'Delete',
    'list.settings': 'Settings',
    'list.empty': 'No saved memos.',
    'list.selectToLoad': 'Select a memo card to open.',
    'list.openFile.missing': 'The selected file could not be found.',
    'list.openFile.failed': 'Failed to open the file.',
    'list.openFile.web': 'In the browser you can import a text file with the file picker.',
    'tray.tooltip': 'Memo Pad',
    'main.add': 'New memo',
    'main.delete': 'Delete',
    'main.settings': 'Settings',
    'main.listBtn': 'Memo list',
    'main.close': 'Close',
    'main.back': 'Back to list',
    'about.version': 'Version {n}'
  }
};

let currentLocale = 'ko';

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = locale === 'en' ? 'en' : 'ko';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLocale;
  }
  return currentLocale;
}

export function t(key, vars = {}) {
  const dict = dictionaries[currentLocale] || dictionaries.ko;
  let text = dict[key] ?? dictionaries.en[key] ?? dictionaries.ko[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-tooltip]').forEach((el) => {
    const key = el.getAttribute('data-i18n-tooltip');
    if (key) el.setAttribute('data-tooltip', t(key));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });
}

export function detectLocale() {
  const lang = (navigator.language || 'ko').toLowerCase();
  return lang.startsWith('en') ? 'en' : 'ko';
}
