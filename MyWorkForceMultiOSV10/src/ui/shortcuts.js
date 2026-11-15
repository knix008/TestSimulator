import { L } from '../i18n.js';

const VIEWS = { 1: 'home', 2: 'board', 3: 'backlog', 4: 'roadmap', 5: 'issues', 6: 'dashboard', 7: 'reports', 8: 'knowledge', 9: 'documents', 0: 'calendar' };

/** The letter after G. */
const CHORD = {
  h: 'home', b: 'board', a: 'backlog', r: 'roadmap', i: 'issues', q: 'queues',
  d: 'dashboard', p: 'reports', k: 'knowledge', o: 'documents', c: 'calendar',
  l: 'plans', v: 'releases', m: 'components', f: 'filters', e: 'health',
  n: 'notifications', t: 'portal', u: 'users', j: 'projects', s: 'settings',
  x: 'extensions', g: 'people',
};

export const ADMIN_VIEWS = new Set(['users', 'settings', 'extensions', 'people']);

const TYPING = 'input, textarea, select, [contenteditable="true"]';

let armedUntil = 0;

export function shortcutGroups() {
  return [
    [L('파일', 'File'), [
      ['Ctrl+Shift+N', L('새 프로젝트', 'New project')],
      ['Ctrl+O', L('열기', 'Open')],
      ['Ctrl+S', L('저장', 'Save')],
      ['Ctrl+Shift+S', L('다른 이름으로 저장', 'Save as')],
      ['Ctrl+P', L('인쇄', 'Print')],
      ['Ctrl+Shift+H', L('시작 화면', 'Start page')],
    ]],
    [L('편집', 'Edit'), [
      ['Ctrl+Z', L('실행 취소', 'Undo')],
      ['Ctrl+Y', L('다시 실행', 'Redo')],
      ['Ctrl+Shift+Z', L('다시 실행', 'Redo')],
      ['Ctrl+F', L('검색', 'Find')],
      ['/', L('검색 칸으로 이동', 'Focus search')],
      ['Enter', L('검색 실행', 'Run the search')],
    ]],
    [L('이동', 'Go'), [
      ['Ctrl+K', L('이슈로 이동', 'Go to an issue')],
      ['Ctrl+1', L('과제 홈', 'Project home')],
      ['Ctrl+2', L('보드', 'Board')],
      ['Ctrl+3', L('백로그', 'Backlog')],
      ['Ctrl+4', L('로드맵', 'Roadmap')],
      ['Ctrl+5', L('이슈', 'Issues')],
      ['Ctrl+6', L('대시보드', 'Dashboard')],
      ['Ctrl+7', L('보고서', 'Reports')],
      ['Ctrl+8', L('지식 자료', 'Knowledge')],
      ['Ctrl+9', L('문서', 'Documents')],
      ['Ctrl+0', L('근무 달력', 'Work calendar')],
      ['G H', L('과제 홈', 'Project home')],
      ['G B', L('보드', 'Board')],
      ['G A', L('백로그', 'Backlog')],
      ['G I', L('이슈', 'Issues')],
      ['G D', L('대시보드', 'Dashboard')],
      ['G P', L('보고서', 'Reports')],
      ['G K', L('지식 자료', 'Knowledge')],
      ['G O', L('문서', 'Documents')],
      ['G C', L('근무 달력', 'Work calendar')],
      ['G N', L('알림', 'Notifications')],
      ['G S', L('설정', 'Settings')],
      ['J', L('다음 이슈', 'Next issue')],
      ['K', L('이전 이슈', 'Previous issue')],
      ['Enter', L('고른 이슈 열기', 'Open the selected issue')],
      ['Esc', L('창을 닫거나 이슈에서 나갑니다', 'Close a dialog or leave the issue')],
    ]],
    [L('이슈', 'Issue'), [
      ['Ctrl+N', L('새 이슈', 'New issue')],
      ['C', L('새 이슈', 'New issue')],
      ['Ctrl+D', L('복제', 'Clone')],
      ['Delete', L('삭제', 'Delete')],
      ['Ctrl+Shift+T', L('하위 작업', 'Sub-task')],
      ['Ctrl+Shift+M', L('의견', 'Comments')],
      ['Ctrl+Enter', L('의견 등록', 'Add the comment')],
      ['Ctrl+Shift+P', L('스프린트 만들기', 'New sprint')],
    ]],
    [L('화면', 'View'), [
      ['Ctrl+Shift+1', L('왼쪽 패널', 'Left panel')],
      ['Ctrl+Shift+2', L('오른쪽 패널', 'Right panel')],
      ['Ctrl+Shift+L', L('언어', 'Language')],
      ['Ctrl+Shift+B', L('테마 바꾸기', 'Change the theme')],
      ['Ctrl+,', L('설정', 'Settings')],
      ['Ctrl+Shift+U', L('사용자', 'Users')],
      ['Ctrl+Shift+J', L('과제', 'Projects')],
      ['F1', L('사용 설명서', 'User guide')],
      ['?', L('단축키', 'Shortcuts')],
      ['Ctrl+Shift+A', L('프로그램 정보', 'About')],
    ]],
  ];
}

function ctrlCommand(lower, shift, code) {
  const digit = /^Digit(\d)$/.exec(code)?.[1];
  if (digit) {
    if (shift && digit === '1') return { id: 'panel', panel: 'left' };
    if (shift && digit === '2') return { id: 'panel', panel: 'right' };
    if (!shift && VIEWS[digit]) return { id: 'go', view: VIEWS[digit] };
    return null;
  }
  if (lower === 'n') return { id: shift ? 'new-project' : 'new-issue' };
  if (lower === 's') return { id: shift ? 'save-as' : 'save-file' };
  if (lower === 'z') return { id: shift ? 'redo' : 'undo' };
  if (!shift && lower === 'o') return { id: 'open-file' };
  if (!shift && lower === 'p') return { id: 'print' };
  if (!shift && lower === 'y') return { id: 'redo' };
  if (!shift && lower === 'k') return { id: 'command-palette' };
  if (!shift && lower === 'd') return { id: 'clone-issue' };
  if (!shift && lower === 'f') return { id: 'focus-search' };
  if (!shift && lower === ',') return { id: 'go', view: 'settings' };
  if (shift && lower === 'h') return { id: 'menubar-home' };
  if (shift && lower === 'l') return { id: 'language' };
  if (shift && lower === 'b') return { id: 'theme-random' };
  if (shift && lower === 't') return { id: 'create-subtask' };
  if (shift && lower === 'm') return { id: 'comments' };
  if (shift && lower === 'p') return { id: 'new-sprint' };
  if (shift && lower === 'u') return { id: 'go', view: 'users' };
  if (shift && lower === 'j') return { id: 'go', view: 'projects' };
  if (shift && lower === 'a') return { id: 'about' };
  return null;
}

/** The command for this key, or null when the key should reach the page. */
export function takeShortcut(event, now = Date.now()) {
  const key = event.key || '';
  const code = event.code || '';
  const ctrl = Boolean(event.ctrlKey || event.metaKey);
  const alt = Boolean(event.altKey);
  const shift = Boolean(event.shiftKey);
  const typing = Boolean(event.target?.matches?.(TYPING));
  const lower = key.toLowerCase();

  if (key === 'Escape' && !ctrl && !alt) {
    armedUntil = 0;
    return { id: 'escape' };
  }
  if (key === 'F1' && !ctrl && !alt) {
    armedUntil = 0;
    return { id: 'open-guide' };
  }
  if (ctrl && !alt && key === 'Enter' && event.target?.id === 'comment-body') return { id: 'add-comment' };
  if (!ctrl && !alt && key === 'Enter' && (event.target?.id === 'quick-search' || event.target?.id === 'issue-query')) return { id: 'run-search' };
  if (ctrl && !alt) {
    armedUntil = 0;
    return ctrlCommand(lower, shift, code);
  }
  if (typing || alt) {
    armedUntil = 0;
    return null;
  }
  if (now < armedUntil) {
    armedUntil = 0;
    const view = CHORD[lower];
    return view ? { id: 'go', view } : null;
  }
  if (lower === 'g' && !shift) {
    armedUntil = now + 1200;
    return { id: 'wait' };
  }
  if (key === '?') return { id: 'shortcuts' };
  if (key === '/') return { id: 'focus-search' };
  if (lower === 'c' && !shift) return { id: 'new-issue' };
  if (lower === 'j' || key === 'ArrowDown') return { id: 'next-issue' };
  if (lower === 'k' || key === 'ArrowUp') return { id: 'prev-issue' };
  if (key === 'Enter') return { id: 'open-selected' };
  if (key === 'Delete') return { id: 'delete-issue' };
  return null;
}
