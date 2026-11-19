import { clone, uid } from './util.js';
import { QUALITY_LINKS } from './requirements.js';

export const DEFAULT_TYPES = [
  { id: 'epic', ko: '에픽', en: 'Epic', color: '#7c3aed' },
  { id: 'story', ko: '스토리', en: 'Story', color: '#3a6cf0' },
  { id: 'task', ko: '작업', en: 'Task', color: '#0f9f6e' },
  { id: 'bug', ko: '결함', en: 'Bug', color: '#e5484d' },
  { id: 'subtask', ko: '하위 작업', en: 'Sub-task', color: '#64748b' },
  { id: 'improvement', ko: '개선', en: 'Improvement', color: '#0ea5e9' },
  { id: 'feature', ko: '새 기능', en: 'New feature', color: '#16a34a' },
  { id: 'incident', ko: '장애', en: 'Incident', color: '#ea580c' },
  { id: 'request', ko: '서비스 요청', en: 'Service request', color: '#0d9488' },
];

export const DEFAULT_PRIORITIES = [
  { id: 'highest', ko: '최고', en: 'Highest', color: '#e5484d', rank: 5 },
  { id: 'high', ko: '높음', en: 'High', color: '#f97316', rank: 4 },
  { id: 'medium', ko: '보통', en: 'Medium', color: '#f5a524', rank: 3 },
  { id: 'low', ko: '낮음', en: 'Low', color: '#3a6cf0', rank: 2 },
  { id: 'lowest', ko: '최저', en: 'Lowest', color: '#64748b', rank: 1 },
];

export const DEFAULT_STATUSES = [
  { id: 'backlog', ko: '백로그', en: 'Backlog', category: 'new', color: '#64748b' },
  { id: 'todo', ko: '할 일', en: 'To Do', category: 'new', color: '#3a6cf0' },
  { id: 'progress', ko: '진행 중', en: 'In Progress', category: 'indeterminate', color: '#f5a524' },
  { id: 'review', ko: '검토', en: 'In Review', category: 'indeterminate', color: '#7c3aed' },
  { id: 'done', ko: '완료', en: 'Done', category: 'done', color: '#30a46c' },
];

export const DEFAULT_RESOLUTIONS = [
  { id: 'fixed', ko: '해결', en: 'Fixed' },
  { id: 'done', ko: '완료', en: 'Done' },
  { id: 'wont', ko: '하지 않음', en: "Won't do" },
  { id: 'duplicate', ko: '중복', en: 'Duplicate' },
  { id: 'cannot', ko: '재현 불가', en: 'Cannot reproduce' },
];

export const DEFAULT_TRANSITIONS = [
  { id: 't-todo', from: 'backlog', to: 'todo', ko: '할 일로', en: 'To Do' },
  { id: 't-start', from: 'todo', to: 'progress', ko: '시작', en: 'Start' },
  { id: 't-review', from: 'progress', to: 'review', ko: '검토 요청', en: 'Request review' },
  { id: 't-done', from: 'review', to: 'done', ko: '완료', en: 'Done' },
  { id: 't-return', from: 'review', to: 'progress', ko: '되돌리기', en: 'Return' },
  { id: 't-stop', from: 'progress', to: 'todo', ko: '멈추기', en: 'Stop' },
  { id: 't-back', from: 'todo', to: 'backlog', ko: '백로그로', en: 'To backlog' },
  { id: 't-reopen', from: 'done', to: 'todo', ko: '다시 열기', en: 'Reopen' },
  { id: 't-now', from: 'backlog', to: 'progress', ko: '바로 시작', en: 'Start now' },
  { id: 't-finish', from: 'progress', to: 'done', ko: '완료', en: 'Done' },
  { id: 't-skip', from: 'todo', to: 'done', ko: '완료', en: 'Done' },
];

export const LINK_TYPES = [
  { id: 'blocks', ko: '막음', en: 'blocks', inverseKo: '다음에 막힘', inverseEn: 'is blocked by' },
  { id: 'relates', ko: '관련', en: 'relates to', inverseKo: '관련', inverseEn: 'relates to' },
  { id: 'duplicates', ko: '중복', en: 'duplicates', inverseKo: '다음에 중복', inverseEn: 'is duplicated by' },
  { id: 'clones', ko: '복제', en: 'clones', inverseKo: '다음에서 복제', inverseEn: 'is cloned by' },
  // Requirements traceability: implements / verifies / refines / found (requirements.js).
  ...QUALITY_LINKS,
];

export const ROLES = [
  { id: 'administrator', ko: '관리자', en: 'Administrator' },
  { id: 'developer', ko: '개발', en: 'Developer' },
  { id: 'tester', ko: '시험', en: 'Tester' },
  { id: 'customer', ko: '고객', en: 'Customer' },
  { id: 'viewer', ko: '보기', en: 'Viewer' },
];

export const PROJECT_TYPES = [
  { id: 'software', ko: '소프트웨어', en: 'Software' },
  { id: 'business', ko: '업무', en: 'Business' },
  { id: 'service', ko: '서비스', en: 'Service' },
];

export const GADGETS = [
  { id: 'mine', ko: '내 미해결', en: 'Assigned to me' },
  { id: 'sprint', ko: '스프린트', en: 'Sprint' },
  { id: 'statusPie', ko: '상태 분포', en: 'Status' },
  { id: 'priorityPie', ko: '우선순위 분포', en: 'Priority' },
  { id: 'activity', ko: '활동', en: 'Activity' },
  { id: 'created', ko: '생성과 해결', en: 'Created and resolved' },
];

export function defaultFilters() {
  return [
    { id: 'f-mine', ko: '내 미해결', en: 'My open issues', query: 'assignee = currentUser() AND status != done' },
    { id: 'f-bugs', ko: '열린 결함', en: 'Open bugs', query: 'type = bug AND status != done' },
    { id: 'f-sprint', ko: '진행 중 스프린트', en: 'Open sprint', query: 'sprint = openSprints()' },
  ];
}

export function defaultGadgets() {
  return ['mine', 'sprint', 'statusPie', 'activity', 'priorityPie'].map((type) => ({ id: `g-${type}`, type }));
}

export function defaultQueues() {
  return [
    { id: 'q-free', ko: '미배정', en: 'Unassigned', query: 'assignee is empty AND status != done' },
    { id: 'q-sla', ko: '기한 초과', en: 'Breached', query: 'sla = breached' },
    { id: 'q-mine', ko: '내 할당', en: 'Assigned to me', query: 'assignee = currentUser() AND status != done' },
    { id: 'q-open', ko: '열린 장애', en: 'Open incidents', query: 'type = incident AND status != done' },
  ];
}

export function boardsFor(type) {
  const kanban = {
    id: 'board-kanban',
    ko: '칸반 보드',
    en: 'Kanban board',
    type: 'kanban',
    columns: [
      { id: 'k-backlog', statusId: 'backlog', wip: null },
      { id: 'k-todo', statusId: 'todo', wip: null },
      { id: 'k-progress', statusId: 'progress', wip: 4 },
      { id: 'k-review', statusId: 'review', wip: null },
      { id: 'k-done', statusId: 'done', wip: null },
    ],
  };
  if (type !== 'software') return [kanban];
  return [
    {
      id: 'board-scrum',
      ko: '스크럼 보드',
      en: 'Scrum board',
      type: 'scrum',
      columns: [
        { id: 'c-todo', statusId: 'todo', wip: null },
        { id: 'c-progress', statusId: 'progress', wip: 5 },
        { id: 'c-review', statusId: 'review', wip: null },
        { id: 'c-done', statusId: 'done', wip: null },
      ],
    },
    kanban,
  ];
}

export function freshCatalog() {
  return {
    issueTypes: clone(DEFAULT_TYPES),
    priorities: clone(DEFAULT_PRIORITIES),
    statuses: clone(DEFAULT_STATUSES),
    resolutions: clone(DEFAULT_RESOLUTIONS),
    transitions: clone(DEFAULT_TRANSITIONS),
  };
}

export function newColumn(statusId) {
  return { id: uid('c'), statusId, wip: null };
}
