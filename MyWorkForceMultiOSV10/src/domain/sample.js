import { makeIssue, newProject } from './store.js';
import { shiftIso, uid } from './util.js';

function moved(when, from, to, actor = 'u2') {
  return [{ id: uid('h'), at: when, actorId: actor, field: 'status', from, to }];
}

/** A workspace with two projects so every screen has something to show on first launch. */
export function sampleWorkspace(now = Date.now()) {
  const at = (days, hours = 12) => shiftIso(now, days, hours);
  const ws = {
    format: 'myworkforce', version: 1, kind: 'workspace', savedAt: null,
    currentUserId: 'u1', activeProjectId: null,
    users: [
      { id: 'u1', name: '김서연', email: 'seoyeon@example.com', active: true },
      { id: 'u2', name: '박민준', email: 'minjun@example.com', active: true },
      { id: 'u3', name: '이하은', email: 'haeun@example.com', active: true },
      { id: 'u4', name: '최도윤', email: 'doyun@example.com', active: true },
      { id: 'u5', name: '정하늘', email: 'haneul@example.com', active: true },
    ],
    groups: [
      { id: 'g-dev', name: '개발', ko: '개발', en: 'Developers', userIds: ['u2', 'u3'] },
      { id: 'g-qa', name: '품질', ko: '품질', en: 'Quality', userIds: ['u4'] },
    ],
    projects: [],
  };
  const shop = newProject(ws, {
    name: '온라인 쇼핑몰', key: 'SHOP', type: 'software', leadId: 'u1',
    description: '결제, 배송, 회원 기능을 스프린트로 나누어 만드는 소프트웨어 프로젝트입니다.',
  });
  shop.id = 'p-shop';
  shop.members = [
    { userId: 'u1', role: 'administrator' },
    { userId: 'u2', role: 'developer' },
    { userId: 'u3', role: 'developer' },
    { userId: 'u4', role: 'tester' },
    { userId: 'u5', role: 'viewer' },
  ];
  shop.sprints = [
    { id: 's1', name: '스프린트 1', goal: '주문의 기본', state: 'closed', start: at(-35), end: at(-21), boardId: 'board-scrum', completedAt: at(-21) },
    { id: 's2', name: '스프린트 2', goal: '반품과 쿠폰', state: 'closed', start: at(-21), end: at(-7), boardId: 'board-scrum', completedAt: at(-7) },
    { id: 's3', name: '스프린트 3', goal: '결제와 배송 조회', state: 'active', start: at(-6), end: at(8), boardId: 'board-scrum', completedAt: '' },
    { id: 's4', name: '스프린트 4', goal: '다음 출시', state: 'future', start: at(8), end: at(22), boardId: 'board-scrum', completedAt: '' },
  ];
  shop.components = [
    { id: 'c-web', name: '웹', description: '상점 화면', leadId: 'u3' },
    { id: 'c-pay', name: '결제', description: '승인·영수증', leadId: 'u2' },
    { id: 'c-ship', name: '배송', description: '출고와 조회', leadId: 'u3' },
    { id: 'c-user', name: '회원', description: '로그인과 계정', leadId: 'u4' },
  ];
  shop.versions = [
    { id: 'v1', name: '1.0', description: '첫 상점', released: true, releaseDate: at(-7), startDate: at(-40) },
    { id: 'v2', name: '1.1', description: '결제 개선', released: false, releaseDate: '', startDate: at(-6) },
  ];
  shop.fields = [{ id: 'cf-impact', ko: '고객 영향', en: 'Customer impact', name: '고객 영향', type: 'select', options: ['높음', '보통', '낮음'] }];
  shop.rules = [{ id: 'r1', ko: '결함은 책임자가 관찰', en: 'Lead watches bugs', enabled: true, when: 'created', typeId: 'bug', statusId: '', then: 'watch', userId: 'u1', priorityId: '', label: '' }];

  const add = (partial) => makeIssue(shop, partial, partial.reporterId || 'u1');
  add({ id: 'i1', key: 'SHOP-1', typeId: 'epic', summary: '결제 경험', description: '손님이 끝까지 결제할 수 있게 합니다.', statusId: 'backlog', priorityId: 'high', assigneeId: 'u1', reporterId: 'u1', rank: 10, created: at(-40) });
  add({ id: 'i2', key: 'SHOP-2', typeId: 'epic', summary: '배송 추적', description: '출고부터 도착까지를 보여 줍니다.', statusId: 'backlog', priorityId: 'medium', assigneeId: 'u1', reporterId: 'u1', rank: 20, created: at(-40) });
  add({ id: 'i3', key: 'SHOP-3', typeId: 'story', summary: '장바구니', statusId: 'done', resolutionId: 'fixed', priorityId: 'medium', assigneeId: 'u2', reporterId: 'u1', sprintId: 's1', storyPoints: 5, componentIds: ['c-web'], fixVersionIds: ['v1'], rank: 30, created: at(-34), updated: at(-30), history: moved(at(-30), 'progress', 'done') });
  add({ id: 'i4', key: 'SHOP-4', typeId: 'story', summary: '주문 내역', statusId: 'done', resolutionId: 'fixed', priorityId: 'medium', assigneeId: 'u3', reporterId: 'u1', sprintId: 's1', storyPoints: 3, componentIds: ['c-web'], fixVersionIds: ['v1'], rank: 40, created: at(-33), updated: at(-28), history: moved(at(-28), 'review', 'done', 'u3') });
  add({ id: 'i5', key: 'SHOP-5', typeId: 'bug', summary: '재고 불일치', statusId: 'done', resolutionId: 'fixed', priorityId: 'high', assigneeId: 'u4', reporterId: 'u4', sprintId: 's1', storyPoints: 2, fixVersionIds: ['v1'], rank: 50, created: at(-32), updated: at(-25), history: moved(at(-25), 'progress', 'done', 'u4'), watchers: ['u4', 'u1'] });
  add({ id: 'i6', key: 'SHOP-6', typeId: 'task', summary: '배송사 조사', statusId: 'done', resolutionId: 'fixed', priorityId: 'low', assigneeId: 'u3', reporterId: 'u1', sprintId: 's2', storyPoints: 2, componentIds: ['c-ship'], fixVersionIds: ['v1'], rank: 60, created: at(-20), updated: at(-16), history: moved(at(-16), 'progress', 'done', 'u3') });
  add({ id: 'i7', key: 'SHOP-7', typeId: 'story', summary: '반품 접수', statusId: 'done', resolutionId: 'fixed', priorityId: 'medium', assigneeId: 'u2', reporterId: 'u1', sprintId: 's2', epicId: 'i2', storyPoints: 8, componentIds: ['c-ship'], fixVersionIds: ['v1'], rank: 70, created: at(-19), updated: at(-10), history: moved(at(-10), 'review', 'done') });
  add({ id: 'i8', key: 'SHOP-8', typeId: 'bug', summary: '쿠폰 중복 적용', statusId: 'done', resolutionId: 'fixed', priorityId: 'high', assigneeId: 'u4', reporterId: 'u4', sprintId: 's2', storyPoints: 3, fixVersionIds: ['v1'], rank: 80, created: at(-18), updated: at(-9), history: moved(at(-9), 'progress', 'done', 'u4'), watchers: ['u4', 'u1'] });
  add({
    id: 'i9', key: 'SHOP-9', typeId: 'story', summary: '카드 결제', statusId: 'progress', priorityId: 'high', assigneeId: 'u2', reporterId: 'u1',
    sprintId: 's3', epicId: 'i1', storyPoints: 5, componentIds: ['c-pay'], fixVersionIds: ['v2'], labels: ['frontend'], rank: 90,
    originalEstimate: 480, remainingEstimate: 300, timeSpent: 90, created: at(-5), updated: at(-1),
    description: '카드 결제 화면을 붙입니다.\n\n- 승인 요청\n- 실패 메시지\n- 영수증\n\n자세한 내용은 [안내](https://example.com) 를 참고합니다.',
    comments: [{ id: 'c1', authorId: 'u4', body: '승인 코드가 비어 있을 때 메시지가 없습니다. @박민준', created: at(-2) }],
    worklogs: [{ id: 'w1', authorId: 'u2', minutes: 90, comment: '결제창 마크업', started: at(-1) }],
    links: [{ id: 'l1', type: 'blocks', direction: 'in', otherId: 'i11' }],
    watchers: ['u1', 'u2', 'u4'],
  });
  add({ id: 'i10', key: 'SHOP-10', typeId: 'story', summary: '간편 결제', statusId: 'todo', priorityId: 'medium', assigneeId: 'u3', reporterId: 'u1', sprintId: 's3', epicId: 'i1', storyPoints: 8, componentIds: ['c-pay'], fixVersionIds: ['v2'], rank: 100, created: at(-5) });
  add({
    id: 'i11', key: 'SHOP-11', typeId: 'bug', summary: '결제 실패 문구', statusId: 'progress', priorityId: 'highest', assigneeId: 'u4', reporterId: 'u4',
    sprintId: 's3', storyPoints: 3, componentIds: ['c-pay'], labels: ['urgent', 'payment'], environment: 'Chrome 130 / Windows', rank: 110,
    created: at(-4), fields: { 'cf-impact': '높음' }, watchers: ['u4', 'u1'],
    links: [{ id: 'l1', type: 'blocks', direction: 'out', otherId: 'i9' }],
  });
  add({ id: 'i12', key: 'SHOP-12', typeId: 'task', summary: '영수증 메일', statusId: 'review', priorityId: 'medium', assigneeId: '', reporterId: 'u1', sprintId: 's3', storyPoints: 2, componentIds: ['c-pay'], rank: 120, created: at(-3) });
  add({ id: 'i13', key: 'SHOP-13', typeId: 'story', summary: '배송 조회 화면', statusId: 'progress', priorityId: 'medium', assigneeId: 'u3', reporterId: 'u1', sprintId: 's3', epicId: 'i2', storyPoints: 5, componentIds: ['c-ship'], fixVersionIds: ['v2'], labels: ['frontend'], rank: 130, created: at(-4) });
  add({ id: 'i14', key: 'SHOP-14', typeId: 'subtask', summary: '결제창 마크업', statusId: 'done', resolutionId: 'fixed', priorityId: 'medium', assigneeId: 'u2', reporterId: 'u2', parentId: 'i9', sprintId: 's3', rank: 140, created: at(-5), updated: at(-2), history: moved(at(-2), 'progress', 'done') });
  add({ id: 'i15', key: 'SHOP-15', typeId: 'subtask', summary: '승인 API', statusId: 'todo', priorityId: 'high', assigneeId: 'u3', reporterId: 'u2', parentId: 'i9', sprintId: 's3', rank: 150, created: at(-5) });
  add({ id: 'i16', key: 'SHOP-16', typeId: 'story', summary: '쿠폰함', statusId: 'backlog', priorityId: 'medium', assigneeId: 'u2', reporterId: 'u1', epicId: 'i1', storyPoints: 5, rank: 160, created: at(-2) });
  add({ id: 'i17', key: 'SHOP-17', typeId: 'story', summary: '상품 리뷰', statusId: 'backlog', priorityId: 'low', assigneeId: '', reporterId: 'u1', storyPoints: 3, componentIds: ['c-web'], rank: 170, created: at(-2) });
  add({ id: 'i18', key: 'SHOP-18', typeId: 'bug', summary: '로그인 잠금', statusId: 'backlog', priorityId: 'highest', assigneeId: 'u4', reporterId: 'u4', storyPoints: 5, componentIds: ['c-user'], due: at(2), rank: 180, created: at(-1), watchers: ['u4', 'u1'] });
  add({ id: 'i19', key: 'SHOP-19', typeId: 'improvement', summary: '검색 정렬', statusId: 'backlog', priorityId: 'low', assigneeId: 'u3', reporterId: 'u3', storyPoints: 3, componentIds: ['c-web'], rank: 190, created: at(-1) });
  add({ id: 'i20', key: 'SHOP-20', typeId: 'feature', summary: '위시리스트', statusId: 'backlog', priorityId: 'medium', assigneeId: '', reporterId: 'u1', epicId: 'i1', storyPoints: 5, rank: 200, created: at(-1) });
  add({ id: 'i21', key: 'SHOP-21', typeId: 'story', summary: '알림 설정', statusId: 'done', resolutionId: 'fixed', priorityId: 'low', assigneeId: 'u2', reporterId: 'u1', sprintId: 's3', storyPoints: 2, rank: 210, created: at(-5), updated: at(-4), history: moved(at(-4), 'progress', 'done') });
  add({ id: 'i22', key: 'SHOP-22', typeId: 'story', summary: '주문 확인 메일', statusId: 'done', resolutionId: 'fixed', priorityId: 'medium', assigneeId: 'u3', reporterId: 'u1', sprintId: 's3', storyPoints: 3, componentIds: ['c-pay'], rank: 220, created: at(-4), updated: at(-1, 9), history: moved(at(-1, 9), 'review', 'done', 'u3') });

  shop.activity = [
    { id: 'a1', at: at(-1), actorId: 'u2', issueId: 'i9', issueKey: 'SHOP-9', kind: 'worklog', minutes: 90 },
    { id: 'a2', at: at(-2), actorId: 'u4', issueId: 'i9', issueKey: 'SHOP-9', kind: 'comment' },
    { id: 'a3', at: at(-1, 9), actorId: 'u3', issueId: 'i22', issueKey: 'SHOP-22', kind: 'transition', from: 'review', to: 'done' },
  ];
  shop.notifications = [
    { id: 'n1', userId: 'u1', at: at(-2), read: false, issueId: 'i9', issueKey: 'SHOP-9', kind: 'comment', actorId: 'u4' },
    { id: 'n2', userId: 'u2', at: at(-1), read: false, issueId: 'i11', issueKey: 'SHOP-11', kind: 'assign', actorId: 'u1' },
  ];

  const sup = newProject(ws, {
    name: '고객 지원', key: 'SUP', type: 'service', leadId: 'u1',
    description: '장애와 서비스 요청을 기한과 함께 다룹니다.',
  });
  sup.id = 'p-sup';
  sup.members = [
    { userId: 'u1', role: 'administrator' },
    { userId: 'u4', role: 'developer' },
    { userId: 'u5', role: 'customer' },
  ];
  const addSup = (partial) => makeIssue(sup, partial, partial.reporterId || 'u5');
  addSup({ id: 'sup1', key: 'SUP-1', typeId: 'incident', summary: '결제 승인 지연', statusId: 'progress', priorityId: 'highest', assigneeId: 'u4', reporterId: 'u5', created: at(-2), updated: at(-1), description: '승인 응답이 1분 이상 걸립니다.' });
  addSup({ id: 'sup2', key: 'SUP-2', typeId: 'request', summary: '비밀번호 초기화', statusId: 'todo', priorityId: 'medium', assigneeId: '', reporterId: 'u5', created: at(-1) });
  addSup({ id: 'sup3', key: 'SUP-3', typeId: 'incident', summary: '배송 조회 오류', statusId: 'done', resolutionId: 'fixed', priorityId: 'high', assigneeId: 'u4', reporterId: 'u5', created: at(-10), updated: at(-10, 14), history: moved(at(-10, 14), 'progress', 'done', 'u4') });

  ws.activeProjectId = shop.id;
  return ws;
}
