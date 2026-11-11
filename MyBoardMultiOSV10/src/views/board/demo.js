// The practice board (app.js openDemo: the tutorial, a window without a core): board data in the shape of
// GET /boards/:id/data, made in memory and never saved. Moves on it change only this copy.
const DAY = 86400000;

const TEXT = {
  ko: {
    columns: { kanban: ['백로그', '개발 대상', '진행 중', '완료'], software: ['백로그', '할 일', '진행 중', '검토 중', '완료'], bugs: ['접수', '진행 중', '해결됨', '닫힘'], simple: ['할 일', '하는 중', '완료'] },
    types: ['에픽', '스토리', '작업', '버그'],
    users: ['김민수', '이지은', '박서준'],
    epics: ['결제 개편', '모바일 앱'],
    labels: ['프론트엔드', '백엔드', '디자인', '긴급'],
    summaries: ['로그인 화면에 소셜 로그인 버튼 추가', '장바구니 수량 변경이 저장되지 않음', '주문 내역 페이지 디자인', '결제 실패 시 다시 시도 안내', '상품 검색 자동 완성', '배송지 주소록 관리', '알림 설정 화면', '관리자 대시보드 통계 오류', '쿠폰 적용 규칙 정리', '앱 시작 속도 개선', '리뷰 사진 올리기'],
  },
  en: {
    columns: { kanban: ['Backlog', 'Selected for Development', 'In Progress', 'Done'], software: ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'], bugs: ['Open', 'In Progress', 'Resolved', 'Closed'], simple: ['To Do', 'Doing', 'Done'] },
    types: ['Epic', 'Story', 'Task', 'Bug'],
    users: ['Alex Kim', 'Jamie Lee', 'Sam Park'],
    epics: ['Checkout revamp', 'Mobile app'],
    labels: ['frontend', 'backend', 'design', 'urgent'],
    summaries: ['Add social sign-in buttons to the login page', 'Cart quantity change is not saved', 'Order history page design', 'Explain retry when a payment fails', 'Product search autocomplete', 'Manage saved delivery addresses', 'Notification settings screen', 'Admin dashboard statistics are wrong', 'Write down coupon rules', 'Faster app start', 'Upload photos with reviews'],
  },
};

export function demoBoardData({ lang = 'ko', template = 'kanban', key = 'KAN', now = Date.now() } = {}) {
  const tx = TEXT[lang === 'en' ? 'en' : 'ko'];
  const names = tx.columns[template] ?? tx.columns.kanban;
  const doneFrom = template === 'bugs' ? 2 : names.length - 1;
  const statuses = names.map((name, i) => ({ id: `demo-s${i}`, name, category: i >= doneFrom ? 'done' : i === 0 ? 'todo' : 'inprogress', position: i }));
  const columns = names.map((name, i) => ({ id: `demo-c${i}`, name, position: i, statusIds: [`demo-s${i}`], wipMin: null, wipMax: i === 1 && names.length > 3 ? 3 : null, backlog: false, done: i >= doneFrom }));
  const types = [['b:epic', '#7048e8', -1], ['b:story', '#2f9e44', 0], ['b:task', '#1c7ed6', 0], ['b:bug', '#e03131', 0]].map(([icon, color, level], i) => ({ id: `demo-t${i}`, name: tx.types[i], icon, color, level }));
  const priorities = ['highest', 'high', 'medium', 'low', 'lowest'].map((p, i) => ({ id: `demo-p${i}`, name: p[0].toUpperCase() + p.slice(1), icon: `b:priority-${p}`, position: i }));
  const users = tx.users.map((name, i) => ({ id: `demo-u${i}`, username: `user${i}`, displayName: name, avatar: '', active: true }));
  const epics = tx.epics.map((summary, i) => ({ id: `demo-e${i}`, key: `${key}-${i + 1}`, summary, color: ['#ae3ec9', '#1098ad'][i], statusId: 'demo-s1', projectId: 'demo' }));
  const issues = tx.summaries.map((summary, i) => {
    const col = [0, 0, 1, 1, 2, 2, 2, 3, 3, 0, 1][i] % names.length;
    return {
      id: `demo-i${i}`, key: `${key}-${i + 3}`, projectId: 'demo', summary, typeId: types[[1, 3, 2, 1, 1, 2, 1, 3, 2, 1, 1][i]].id, statusId: `demo-s${col}`,
      priorityId: priorities[[2, 0, 2, 1, 2, 3, 2, 1, 4, 2, 3][i]].id, assigneeId: i % 4 === 3 ? null : users[i % 3].id, epicId: i % 3 === 2 ? null : epics[i % 2].id,
      parentId: null, storyPoints: [3, 2, 5, 1, 8, null, 3, 2, 1, 5, 3][i], originalEstimate: null, remainingEstimate: null, timeSpent: null,
      dueDate: i === 1 ? isoOf(now - DAY) : i === 4 ? isoOf(now + 2 * DAY) : null, rank: `m${String.fromCharCode(97 + i)}`, color: null,
      cover: i === 2 ? { color: '#74c0fc' } : null, icon: null, flagged: i === 1, resolutionId: col >= doneFrom ? 'demo-r' : null, resolvedAt: null,
      statusChangedAt: now - (i % 5) * 2 * DAY, createdAt: now - 20 * DAY, updatedAt: now - (i % 4) * 3600000, rev: 1,
      labels: [tx.labels[i % 4], ...(i % 5 === 0 ? [tx.labels[3]] : [])].filter((v, k, a) => a.indexOf(v) === k), componentIds: [], fixVersionIds: [],
      subtasks: i === 4 ? { total: 3, done: 1 } : null, checklist: i === 0 ? { total: 4, done: 2 } : null, commentCount: i % 3, attachmentCount: i === 2 ? 1 : 0,
      columnId: `demo-c${col}`, lane: 'all', cardColor: null,
    };
  });
  return {
    demo: true,
    board: { id: 'demo-board', name: 'Demo', settings: { backlog: { enabled: false, statusIds: [] }, swimlanes: 'none', cardColors: 'none', cardFields: ['priority', 'storyPoints', 'dueDate'], estimation: 'storyPoints', doneHideDays: 14, subtasks: 'cards', columnConstraint: 'issueCount' } },
    columns, swimlanes: [{ id: 'all', name: null, count: issues.length }], quickFilters: [], cardColors: [], issues, backlog: [], statuses, types, priorities, users, epics,
    versions: [], components: [], projects: [{ id: 'demo', key, name: 'Demo', icon: 'b:layers', color: null }], elapsedMs: 0,
  };
}

function isoOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
