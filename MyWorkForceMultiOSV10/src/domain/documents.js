import { deliver } from './notices.js';
import { ensureServices } from './services.js';
import { nowIso, uid } from './util.js';

const section = (ko, en) => ({ ko, en });

function form(id, ko, en, sections) {
  const body = (lang) => sections.map((item) => `## ${item[lang]}\n\n`).join('');
  return { id, ko, en, bodyKo: body('ko'), bodyEn: body('en') };
}

export const FORMS = [
  form('deliverable', '결과물', 'Deliverable', [
    section('무엇', 'What it is'),
    section('어디에 있는가', 'Where it is'),
    section('누가 쓰는가', 'Who uses it'),
    section('확인', 'Check'),
  ]),
  form('meeting', '회의록', 'Meeting notes', [
    section('일시와 참석', 'When and who'),
    section('논의한 것', 'Discussion'),
    section('결정', 'Decisions'),
    section('다음에 할 일', 'Next actions'),
  ]),
  form('decision', '결정 기록', 'Decision record', [
    section('결정', 'Decision'),
    section('배경', 'Context'),
    section('고른 이유', 'Why this option'),
    section('영향', 'Consequences'),
  ]),
  form('spec', '명세서', 'Specification', [
    section('목적', 'Purpose'),
    section('범위', 'Scope'),
    section('동작', 'Behavior'),
    section('제외', 'Out of scope'),
  ]),
  form('requirements', '요구사항', 'Requirements', [
    section('사용자', 'Who needs this'),
    section('해야 하는 일', 'What must happen'),
    section('완료 기준', 'Done when'),
  ]),
  form('test', '시험 보고서', 'Test report', [
    section('대상', 'What was tested'),
    section('방법', 'How'),
    section('결과', 'Result'),
    section('남은 문제', 'Open problems'),
  ]),
  form('release', '릴리스 노트', 'Release notes', [
    section('버전', 'Version'),
    section('추가', 'Added'),
    section('고친 것', 'Fixed'),
    section('알려진 제한', 'Known limits'),
  ]),
  form('retro', '회고', 'Retrospective', [
    section('잘된 점', 'What went well'),
    section('아쉬운 점', 'What was hard'),
    section('다음에 바꿀 점', 'What to change'),
  ]),
  form('status', '진행 보고', 'Status report', [
    section('이번 기간', 'This period'),
    section('끝난 일', 'Finished'),
    section('막힌 일', 'Blocked'),
    section('다음', 'Next'),
  ]),
  form('design', '설계 요약', 'Design brief', [
    section('문제', 'Problem'),
    section('안', 'Proposal'),
    section('대안', 'Alternatives'),
    section('열린 질문', 'Open questions'),
  ]),
  form('incident', '장애 보고서', 'Incident report', [
    section('무슨 일이 있었나', 'What happened'),
    section('영향', 'Impact'),
    section('원인', 'Cause'),
    section('재발 방지', 'Prevention'),
  ]),
  form('procedure', '절차서', 'Procedure', [
    section('언제 쓰는가', 'When to use this'),
    section('준비', 'Before you start'),
    section('순서', 'Steps'),
    section('확인', 'Check'),
  ]),
  form('handover', '인수인계', 'Handover', [
    section('맡기는 일', 'What is handed over'),
    section('현재 상태', 'Current state'),
    section('주의', 'Watch out for'),
    section('연락', 'Who to ask'),
  ]),
  form('weekly', '주간 보고', 'Weekly report', [
    section('주', 'Week'),
    section('한 일', 'Done'),
    section('할 일', 'Planned'),
    section('도움이 필요한 것', 'Help needed'),
  ]),
  form('proposal', '제안서', 'Proposal', [
    section('제안', 'Proposal'),
    section('이유', 'Why'),
    section('비용과 기간', 'Cost and time'),
    section('요청', 'Ask'),
  ]),
];

export const formById = (id) => FORMS.find((item) => item.id === id) || null;

function mustDocument(ws, documentId) {
  const doc = (ws.documents || []).find((item) => item.id === documentId);
  if (!doc) throw new Error('not-found');
  return doc;
}

export function createDocument(ws, input, actorId) {
  ensureServices(ws);
  const form = formById(input.templateId);
  if (!form) throw new Error('not-found');
  const lang = input.lang === 'en' ? 'en' : 'ko';
  const title = String(input.title || '').trim() || (lang === 'en' ? form.en : form.ko);
  const doc = {
    id: uid('doc'),
    templateId: form.id,
    title,
    body: input.body != null ? String(input.body) : (lang === 'en' ? form.bodyEn : form.bodyKo),
    authorId: actorId || '',
    projectId: input.projectId || '',
    issueKey: String(input.issueKey || '').trim(),
    visibility: 'private',
    created: nowIso(),
    updated: nowIso(),
  };
  ws.documents.unshift(doc);
  return doc;
}

export function updateDocument(ws, documentId, patch, actorId) {
  const doc = mustDocument(ws, documentId);
  if (doc.authorId !== actorId) throw new Error('permission');
  const beforeTitle = doc.title;
  const beforeBody = doc.body;
  if (patch.title != null) {
    const title = String(patch.title).trim();
    if (!title) throw new Error('name-required');
    doc.title = title;
  }
  if (patch.body != null) doc.body = String(patch.body);
  if (doc.title !== beforeTitle || doc.body !== beforeBody) {
    const project = (ws.projects || []).find((item) => item.id === doc.projectId);
    if (project) deliver(ws, project, [], { actorId, issueId: '', issueKey: doc.title, kind: 'document' }, { documentId: doc.id, event: 'edit' });
  }
  if (patch.issueKey != null) doc.issueKey = String(patch.issueKey).trim();
  if (patch.projectId != null) doc.projectId = String(patch.projectId);
  doc.updated = nowIso();
  return doc;
}

export function shareDocument(ws, documentId, visibility, actorId) {
  const doc = mustDocument(ws, documentId);
  if (doc.authorId !== actorId) throw new Error('permission');
  if (!['private', 'project', 'workspace'].includes(visibility)) throw new Error('not-found');
  if (visibility === 'project' && !doc.projectId) throw new Error('project-required');
  doc.visibility = visibility;
  doc.updated = nowIso();
  return doc;
}

export function deleteDocument(ws, documentId, actorId) {
  const doc = mustDocument(ws, documentId);
  if (doc.authorId !== actorId) throw new Error('permission');
  ws.documents = ws.documents.filter((item) => item.id !== documentId);
}

export function visibleDocuments(ws, userId, projectId) {
  return (ws.documents || []).filter((doc) => {
    if (doc.authorId === userId) return true;
    if (doc.visibility === 'workspace') return true;
    return doc.visibility === 'project' && Boolean(doc.projectId) && doc.projectId === projectId;
  });
}
