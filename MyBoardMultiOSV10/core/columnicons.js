// Default icons of board columns (ARCHITECTURE §3.6). Every column has an icon: one created without one gets
// the icon its name suggests (English or Korean words), else the one of its statuses' category.
// Pure data + one function, no imports — the UI (add column form) uses the same rules.

/** [pattern, built-in icon] — first match wins, so the specific names come before the general ones. */
export const COLUMN_ICON_RULES = [
  [/backlog|백로그/i, 'backlog'],
  [/ice ?box|someday|언젠가|보관함/i, 'snowflake'],
  [/idea|아이디어|제안함/i, 'idea'],
  [/triage|분류|선별/i, 'triage'],
  [/code ?review|코드 ?리뷰|코드 ?검토/i, 'codeReview'],
  [/\bqa\b|test|testing|검증|테스트|품질/i, 'test'],
  [/review|검토|리뷰|심사/i, 'review'],
  [/block|차단|막힘/i, 'blocked'],
  [/on ?hold|보류/i, 'onHold'],
  [/wait|pending|대기|기다/i, 'waiting'],
  [/escalat|에스컬|상향/i, 'escalated'],
  [/reopen|재오픈|다시 열/i, 'reopened'],
  [/reject|declin|반려|거절|기각/i, 'rejected'],
  [/cancel|취소|won'?t/i, 'cancel'],
  [/approv|승인/i, 'approved'],
  [/staging|스테이징/i, 'staging'],
  [/deploy|배포/i, 'deploy'],
  [/releas|릴리스|출시/i, 'release'],
  [/publish|게시|발행/i, 'published'],
  [/archiv|보관/i, 'archive'],
  [/resolv|해결/i, 'resolved'],
  [/closed|close|종료|닫힘/i, 'lock'],
  [/\bship|배송|발송|출고/i, 'truck'],
  [/deliver|배달|도착|납품/i, 'delivered'],
  [/return|반품|반송/i, 'returned'],
  [/pack|포장/i, 'packed'],
  [/\border|주문|발주/i, 'ordered'],
  [/invoic|청구|송장/i, 'invoice'],
  [/paid|payment|결제|지급|입금/i, 'paid'],
  [/appl(y|ied|icant)|지원자|접수된 지원/i, 'applied'],
  [/screen|서류/i, 'screening'],
  [/interview|면접/i, 'interview'],
  [/offer|오퍼|처우/i, 'offer'],
  [/hired|채용|입사/i, 'userCheck'],
  [/onboard|온보딩/i, 'onboarding'],
  [/\blead|리드|잠재/i, 'userAdd'],
  [/prospect|발굴/i, 'prospect'],
  [/qualif|적격/i, 'qualified'],
  [/proposal|제안서|견적/i, 'proposal'],
  [/negotiat|협상/i, 'negotiation'],
  [/\bwon\b|성사|계약 완료|수주/i, 'trophy'],
  [/\blost\b|실패|무산/i, 'thumbsDown'],
  [/support|지원|고객/i, 'support'],
  [/research|조사|연구|탐색/i, 'research'],
  [/design|디자인|설계/i, 'design'],
  [/writ|작성|집필/i, 'writing'],
  [/\bedit|편집|교정/i, 'editing'],
  [/selected|ready|준비|선택/i, 'ready'],
  [/develop|coding|\bcode\b|\bdev\b|개발|구현|코딩/i, 'code'],
  [/schedul|예약|일정/i, 'scheduled'],
  [/plan|계획|예정/i, 'planned'],
  [/up ?next|next|다음/i, 'upNext'],
  [/in ?progress|doing|working|진행|작업 ?중|하는 ?중/i, 'inProgress'],
  [/to ?do|할 ?일/i, 'todo'],
  [/\bnew\b|신규|새로/i, 'inbox'],
  [/inbox|incoming|intake|접수|받은/i, 'inbox'],
  [/\bopen|열림|열린/i, 'circle'],
  [/done|complete|finish|완료|끝/i, 'done'],
];

/** The icon of a category when the name says nothing. */
export const CATEGORY_COLUMN_ICON = { todo: 'todo', inprogress: 'inProgress', done: 'done' };

/**
 * The default IconRef of a column: by its name, else the backlog icon for the board's backlog column, else by its statuses' category ('todo' | 'inprogress' | 'done'
 * or a list of them — all done → done, any in progress → in progress), else an open circle.
 * @param {string} name
 * @param {string | string[] | null} [category]
 * @param {{ backlog?: boolean }} [opts]
 */
export function defaultColumnIcon(name, category = null, opts = {}) {
  const text = String(name ?? '');
  for (const [re, icon] of COLUMN_ICON_RULES) if (re.test(text)) return `b:${icon}`;
  if (opts.backlog) return 'b:backlog';
  const cats = [].concat(category ?? []).filter(Boolean);
  if (cats.length) {
    if (cats.every((c) => c === 'done')) return 'b:done';
    if (cats.includes('inprogress')) return 'b:inProgress';
    return `b:${CATEGORY_COLUMN_ICON[cats[0]] ?? 'todo'}`;
  }
  return 'b:circle';
}
