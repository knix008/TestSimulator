// Audit: the log of administrator changes and of what people do, searched and shown as a list view.

import { isWorkspaceAdmin } from '../domain/permissions.js';
import { esc, icon, L, pageHead } from './bits.js';
import { renderListView } from './listview.js';

/** Every event in words, with its category. */
export const AUDIT_ACTIONS = [
  ['admin-seed', 'admin', '첫 관리자 계정 만듦', 'First administrator created'],
  ['admin-grant', 'admin', '관리자 권한 줌', 'Administrator granted'],
  ['admin-revoke', 'admin', '관리자 권한 뺌', 'Administrator removed'],
  ['user-create', 'admin', '사용자 만듦', 'User created'],
  ['user-delete', 'admin', '사용자 삭제', 'User deleted'],
  ['login-change', 'admin', '아이디 바꿈', 'ID changed'],
  ['user-activate', 'admin', '계정 사용', 'Account turned on'],
  ['user-deactivate', 'admin', '계정 중지', 'Account turned off'],
  ['password-set', 'admin', '관리자가 암호 정함', 'Password set by an administrator'],
  ['lock-policy', 'admin', '로그인 잠금 시간 바꿈', 'Sign-in lock wait changed'],
  ['lock-release', 'admin', '로그인 잠금 풂', 'Sign-in lock released'],
  ['database-connect', 'admin', '데이터베이스 연결', 'Database connected'],
  ['encryption-key-view', 'admin', '암호화 키 봄', 'Encryption key viewed'],
  ['signin', 'user', '로그인', 'Signed in'],
  ['signin-failed', 'user', '로그인 실패', 'Sign-in failed'],
  ['signin-locked', 'user', '로그인 잠김', 'Sign-in locked'],
  ['signout', 'user', '로그아웃', 'Signed out'],
  ['password-change', 'user', '자기 암호 바꿈', 'Own password changed'],
  ['save', 'user', '저장 (작업 변경)', 'Saved (work changed)'],
];

export const actionLabel = (action) => {
  const item = AUDIT_ACTIONS.find((entry) => entry[0] === action);
  return item ? L(item[2], item[3]) : action;
};

const KIND_WORDS = { projects: ['과제', 'projects'], issues: ['이슈', 'issues'], pages: ['페이지', 'pages'] };
const WHAT_WORDS = { created: ['만듦', 'created'], changed: ['바꿈', 'changed'], deleted: ['삭제', 'deleted'] };
const REASONS = { password: ['암호가 틀림', 'wrong password'], 'not-registered': ['등록되지 않은 아이디', 'unknown ID'] };

/** One line about what an entry says. */
export function auditSummary(entry, people = {}) {
  const d = entry.detail || {};
  const who = (id) => people[id]?.login || people[id]?.name || id || '';
  switch (entry.action) {
    case 'login-change': return `${d.from} → ${d.to}`;
    case 'lock-policy': return L(`${d.from}분 → ${d.to}분`, `${d.from} → ${d.to} minutes`);
    case 'lock-release': return d.account || '';
    case 'signin-failed': return `${d.account || ''} · ${L(...(REASONS[d.reason] || [d.reason || '', d.reason || '']))}${d.remaining != null ? ` · ${L(`남은 시도 ${d.remaining}`, `${d.remaining} tries left`)}` : ''}`;
    case 'signin-locked': return `${d.account || ''} · ${L('잠김', 'locked')}${d.until ? ` ~ ${formatTime(d.until)}` : ''}${d.refused ? ` · ${L('잠긴 동안 시도', 'tried while locked')}` : ''}`;
    case 'password-set': return `${d.login || who(entry.targetId)}${d.mustChange ? ` · ${L('다음 로그인 때 바꿔야 함', 'must change at next sign-in')}` : ''}`;
    case 'password-change': return d.first ? L('처음 암호를 자기 암호로', 'first password replaced') : '';
    case 'database-connect': return `${d.from ? `${d.from} → ` : ''}${d.to || ''}${d.created ? ` · ${L('새로 만듦', 'created')}` : ''}${d.tls === false ? ` · ${L('TLS 꺼짐', 'TLS off')}` : ''}`;
    case 'encryption-key-view': return `${L('키 지문', 'fingerprint')} ${d.fingerprint || ''}`;
    case 'save': {
      const parts = [];
      for (const [kind, words] of Object.entries(KIND_WORDS)) {
        for (const [what, verbs] of Object.entries(WHAT_WORDS)) {
          const item = d[kind]?.[what];
          if (item?.count) parts.push(`${L(words[0], words[1])} ${item.count} ${L(verbs[0], verbs[1])}${item.items?.length ? ` (${item.items.slice(0, 3).join(', ')}${item.count > 3 ? '…' : ''})` : ''}`);
        }
      }
      return parts.join(' · ');
    }
    default: return d.login || '';
  }
}

export function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || '');
  const two = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

export const AUDIT_COLUMNS = (people = {}) => [
  { id: 'at', label: L('시간', 'Time'), width: 170, value: (row) => row.at, html: (row) => `<span class="mono">${esc(formatTime(row.at))}</span>` },
  { id: 'category', label: L('분류', 'Category'), width: 90, value: (row) => row.category, html: (row) => `<span class="chip ${row.category === 'admin' ? 'audit-admin' : 'audit-user'}">${esc(row.category === 'admin' ? L('관리자', 'Admin') : L('사용자', 'User'))}</span>` },
  { id: 'action', label: L('사건', 'Event'), width: 170, value: (row) => actionLabel(row.action), html: (row) => esc(actionLabel(row.action)) },
  { id: 'actor', label: L('한 사람', 'By'), width: 120, value: (row) => row.actorLogin || '', html: (row) => (row.actorLogin ? esc(row.actorLogin) : `<span class="muted">${esc(L('(프로그램 / 로그인 전)', '(program / signed out)'))}</span>`) },
  { id: 'target', label: L('대상', 'Target'), width: 120, value: (row) => people[row.targetId]?.login || row.targetId || '', html: (row) => esc(people[row.targetId]?.login || row.targetId || '') },
  { id: 'summary', label: L('내용', 'Details'), width: 360, value: (row) => auditSummary(row, people), html: (row) => esc(auditSummary(row, people)) },
  { id: 'source', label: L('출처', 'Source'), width: 220, value: (row) => row.source || '', html: (row) => `<span class="muted">${esc(row.source || '')}</span>` },
];

export function auditView(ctx) {
  if (!isWorkspaceAdmin(ctx.user)) {
    return `<div class="page">${pageHead(L('감사 로그', 'Audit log'), '', 'audit')}<p>${L('관리자만 볼 수 있습니다.', 'Only an administrator can see it.')}</p></div>`;
  }
  const audit = ctx.ui.audit || {};
  const f = audit.filter || {};
  const people = audit.people || {};
  const entries = audit.entries || [];
  const option = (value, label, chosen) => `<option value="${esc(value)}" ${chosen === value ? 'selected' : ''}>${esc(label)}</option>`;
  const actions = ['admin', 'user'].map((category) => `<optgroup label="${esc(category === 'admin' ? L('관리자', 'Administrator') : L('사용자', 'User'))}">${AUDIT_ACTIONS.filter((item) => item[1] === category).map((item) => option(item[0], L(item[2], item[3]), f.action || '')).join('')}</optgroup>`).join('');
  const form = `<form id="audit-form" class="audit-filters">
    <label class="form-row"><span>${icon('layers')}${L('분류', 'Category')}</span><select name="category">${option('', L('모두', 'All'), f.category || '')}${option('admin', L('관리자 변경', 'Administrator changes'), f.category || '')}${option('user', L('사용자 활동', 'User activity'), f.category || '')}</select></label>
    <label class="form-row"><span>${icon('bolt')}${L('사건', 'Event')}</span><select name="action">${option('', L('모두', 'All'), f.action || '')}${actions}</select></label>
    <label class="form-row"><span>${icon('user')}${L('한 사람', 'By')}</span><input name="actor" value="${esc(f.actor || '')}" placeholder="${esc(L('아이디', 'ID'))}" autocomplete="off" spellcheck="false"></label>
    <label class="form-row"><span>${icon('calendar')}${L('부터', 'From')}</span><input name="from" type="date" value="${esc(f.from || '')}"></label>
    <label class="form-row"><span>${icon('calendar')}${L('까지', 'To')}</span><input name="to" type="date" value="${esc(f.to || '')}"></label>
    <label class="form-row audit-words"><span>${icon('search')}${L('찾을 말', 'Words')}</span><input name="q" value="${esc(f.q || '')}" placeholder="${esc(L('아이디, 과제 키, 페이지 제목, 주소…', 'ID, project key, page title, address…'))}"></label>
    <div class="page-actions">
      <button type="submit" class="button primary" ${audit.loading ? 'disabled' : ''}>${icon(audit.loading ? 'clock' : 'search')}<span>${audit.loading ? L('찾는 중…', 'Searching…') : L('검색', 'Search')}</span></button>
      <button type="button" class="button" data-action="audit-reset">${icon('undo')}<span>${L('조건 지우기', 'Clear')}</span></button>
      <button type="button" class="button" data-action="audit-export" ${entries.length ? '' : 'disabled'}>${icon('download')}<span>${L('CSV로 저장', 'Save as CSV')}</span></button>
    </div>
  </form>`;
  const chosen = entries.find((entry) => entry.id === ctx.ui.auditSelected);
  const detail = chosen ? `<section class="audit-detail panel-card"><header><b>${icon('info')}${esc(actionLabel(chosen.action))}</b><span class="muted">${esc(formatTime(chosen.at))}</span></header>
    <dl class="audit-dl">
      <dt>${L('한 사람', 'By')}</dt><dd>${esc(chosen.actorLogin || L('(프로그램 / 로그인 전)', '(program / signed out)'))}${chosen.actorId ? ` <span class="muted">${esc(chosen.actorId)}</span>` : ''}</dd>
      <dt>${L('대상', 'Target')}</dt><dd>${esc(people[chosen.targetId]?.login || '')} <span class="muted">${esc(chosen.targetId || '')}</span></dd>
      <dt>${L('출처', 'Source')}</dt><dd>${esc(chosen.source || '')}</dd>
      <dt>${L('내용', 'Details')}</dt><dd><pre class="audit-json">${esc(JSON.stringify(chosen.detail || {}, null, 2))}</pre></dd>
    </dl></section>` : '';
  const error = audit.error ? `<p class="danger-text">${icon('alert')}<span>${esc(audit.error)}</span></p>` : '';
  const count = audit.loaded ? `<p class="muted audit-count">${esc(L(`${entries.length}건${entries.length >= 500 ? ' (최근 500건까지)' : ''} · 행을 누르면 자세히 봅니다. 머리글을 누르면 정렬, 가장자리를 끌면 폭, 머리글을 끌면 순서를 바꿉니다.`, `${entries.length} entries${entries.length >= 500 ? ' (newest 500)' : ''} · Click a row for details. Click a heading to sort, drag its edge to resize, drag the heading to move the column.`))}</p>` : '';
  const list = renderListView({
    id: 'audit',
    columns: AUDIT_COLUMNS(people),
    rows: entries,
    state: ctx.settings.listViews?.audit || { sort: { col: 'at', dir: 'desc' } },
    empty: audit.loading ? L('찾는 중…', 'Searching…') : L('조건에 맞는 기록이 없습니다.', 'No entry matches.'),
    rowAttrs: (row) => `data-action="audit-select" data-id="${esc(row.id)}"`,
    selected: (row) => row.id === ctx.ui.auditSelected,
  });
  return `<div class="page audit-page">${pageHead(L('감사 로그', 'Audit log'), '', 'audit')}
    <p class="muted">${L('관리자 권한과 계정에 관한 모든 변경, 그리고 사용자의 로그인과 작업이 데이터베이스에 기록됩니다. 기록 내용은 암호화되어 저장됩니다.', 'Every change to administrator rights and accounts, and what people do — sign-ins and work — is written to the database, encrypted.')}</p>
    ${form}${error}${count}${list}${detail}</div>`;
}
