// Schedules for the example workspaces (Korean and English). A row is
//   [level, ko, en, duration (working days, 0 = milestone), predecessors ("3", "4SS+2", "5FF"), kind, person index]
// Predecessors name rows by their number, as in Microsoft Project.
import { applyConversion } from './schedule-apply.js';
import { computeSchedule, DAY, dayOf, ensureSchedule, isoDay, isSummary, parsePreds } from './schedule.js';
import { uid } from './util.js';
import { updateIssue } from './store.js';

const R = (level, ko, en, duration, preds = '', kind = 'task', who = -1) => ({ level, ko, en, duration, preds, kind, who });

/** Construction of a three-storey building: the classic schedule-only project. */
export const SITE_SCHEDULE = [
  R(1, '착공 준비', 'Site preparation', 0),
  R(2, '인허가 확인', 'Confirm the permits', 3, '', 'task', 0),
  R(2, '가설 울타리·사무실', 'Hoarding and site office', 4, '2', 'task', 3),
  R(2, '착공', 'Ground breaking', 0, '3'),
  R(1, '기초 공사', 'Foundations', 0),
  R(2, '터파기', 'Excavation', 6, '4', 'task', 3),
  R(2, '버림 콘크리트', 'Blinding concrete', 2, '6', 'task', 3),
  R(2, '기초 철근 배근', 'Foundation rebar', 5, '7', 'task', 1),
  R(2, '기초 타설·양생', 'Pour and cure the foundation', 7, '8', 'task', 1),
  R(1, '골조 공사', 'Structure', 0),
  R(2, '1층 골조', 'Ground-floor frame', 8, '9', 'task', 1),
  R(2, '2층 골조', 'First-floor frame', 8, '11', 'task', 1),
  R(2, '3층 골조', 'Second-floor frame', 8, '12', 'task', 1),
  R(2, '골조 완료 검측', 'Structure inspection', 0, '13'),
  R(1, '외부·설비', 'Envelope and services', 0),
  R(2, '외벽·창호', 'Walls and windows', 12, '14', 'task', 2),
  R(2, '전기 배관', 'Electrical conduit', 10, '12SS+5', 'task', 4),
  R(2, '급배수 설비', 'Plumbing', 10, '17SS+2', 'task', 4),
  R(2, '지붕 방수', 'Roof waterproofing', 5, '13', 'task', 2),
  R(1, '마감·준공', 'Finishes and handover', 0),
  R(2, '내부 마감', 'Interior finishes', 15, '16;18', 'task', 2),
  R(2, '소방 검사', 'Fire inspection', 2, '21FF', 'task', 0),
  R(2, '준공 청소', 'Final clean', 3, '21', 'task', 3),
  R(2, '준공', 'Handover', 0, '22;23'),
];

/** In-car infotainment release: switched to Scrum (two-week sprints). */
export const CAR_SCHEDULE = [
  R(1, '요구 사항과 설계', 'Requirements and design', 0),
  R(2, '화면 흐름 설계', 'Screen flow design', 5, '', 'story', 2),
  R(2, '음성 명령 목록', 'Voice command list', 3, '', 'task', 0),
  R(2, '설계 검토', 'Design review', 0, '2;3'),
  R(1, '내비게이션', 'Navigation', 0),
  R(2, '지도 렌더링 개선', 'Faster map rendering', 8, '4', 'story', 1),
  R(2, '음성으로 목적지 설정', 'Set the destination by voice', 10, '4', 'story', 1),
  R(2, '경로 재탐색', 'Re-routing', 6, '6', 'story', 3),
  R(1, '연결과 업데이트', 'Connectivity and updates', 0),
  R(2, '휴대폰 미러링', 'Phone mirroring', 10, '4', 'story', 2),
  R(2, '무선 업데이트 서버 연동', 'OTA server connection', 8, '4', 'feature', 3),
  R(2, '업데이트 실패 복구', 'Recover from a failed update', 5, '11', 'story', 3),
  R(1, '시험과 출시', 'Testing and release', 0),
  R(2, '실차 통합 시험', 'In-vehicle integration test', 8, '7;8;10;12', 'task', 4),
  R(2, '후진 카메라 지연 수정', 'Fix the rear-camera lag', 3, '14SS+3', 'bug', 1),
  R(2, '인증 시험', 'Certification test', 5, '14', 'task', 4),
  R(2, '2.0 출시', 'Release 2.0', 0, '15;16'),
];

/** School fair: switched to Kanban. */
export const SCHOOL_SCHEDULE = [
  R(1, '기획', 'Planning', 0),
  R(2, '행사 주제 정하기', 'Choose the theme', 2, '', 'task', 0),
  R(2, '예산 확정', 'Agree the budget', 3, '2', 'task', 0),
  R(2, '부스 신청 받기', 'Take booth sign-ups', 5, '2', 'task', 1),
  R(1, '준비', 'Preparation', 0),
  R(2, '무대 순서 확정', 'Lock the stage order', 4, '4', 'story', 2),
  R(2, '부스 자리 배치', 'Lay out the booths', 3, '4', 'task', 1),
  R(2, '학부모 안내장 발송', 'Send the letter to families', 2, '3', 'story', 3),
  R(2, '안내 방송 원고', 'Write the announcements', 2, '6', 'task', 2),
  R(2, '리허설', 'Rehearsal', 1, '6;9', 'task', 2),
  R(1, '행사', 'The fair', 0),
  R(2, '행사 당일', 'Fair day', 1, '7;10', 'task', 0),
  R(2, '정리와 결산', 'Clean-up and accounts', 2, '12', 'task', 4),
  R(2, '행사 끝', 'Fair closed', 0, '13'),
];

/**
 * Puts a schedule into a project. Tasks finished before today are done, the ones under way part done.
 * `apply` ('kanban' | 'scrum') switches the project to that board and marks the issues to match.
 */
export function addSampleSchedule(project, rows, { lang = 'ko', now = Date.now(), people = [], startDaysAgo = 20, apply = '', sprintDays = 14, calendar = null, actorId = 'u1', ws = null } = {}) {
  const schedule = ensureSchedule(project, now);
  schedule.start = isoDay(dayOf(now) - startDaysAgo * DAY);
  schedule.sprintDays = sprintDays;
  schedule.tasks = rows.map((row) => ({
    id: uid('t'), name: lang === 'en' ? row.en : row.ko, level: row.level, duration: row.duration || 1, milestone: false,
    preds: [], assigneeId: row.who >= 0 ? people[row.who % people.length] || '' : '', kind: row.kind, percent: 0,
  }));
  ensureSchedule(project, now);
  // A level-1 row with children is a summary: give it a duration of 1 (the roll-up replaces it).
  schedule.tasks.forEach((task, i) => {
    if (isSummary(schedule.tasks, i)) { task.milestone = false; task.duration = 1; }
    else if (rows[i].duration === 0) { task.milestone = true; task.duration = 0; }
  });
  rows.forEach((row, i) => { if (row.preds) schedule.tasks[i].preds = parsePreds(schedule.tasks, row.preds.replace(/;/g, ' '), schedule.tasks[i].id); });
  computeSchedule(project, calendar);
  const today = dayOf(now);
  for (const task of schedule.tasks) {
    const s = dayOf(task.start);
    const e = dayOf(task.finish);
    if (e < today) task.percent = 100;
    else if (s <= today) task.percent = Math.max(10, Math.min(90, Math.round(((today - s) / Math.max(DAY, e - s + DAY)) * 100)));
    else task.percent = 0;
  }
  if (apply && ws) {
    applyConversion(ws, project, apply, { now, sprintDays, sprintName: lang === 'en' ? 'Sprint' : '스프린트' }, actorId, calendar);
    for (const task of schedule.tasks) {
      const issue = task.issueId ? project.issues.find((item) => item.id === task.issueId) : null;
      if (!issue || issue.typeId === 'epic') continue;
      if (task.percent >= 100) updateIssue(ws, project.id, issue.id, { statusId: 'done', resolutionId: 'done' }, actorId);
      else if (task.percent > 0) updateIssue(ws, project.id, issue.id, { statusId: 'progress' }, actorId);
    }
    // Sprints that ended before today are closed, as a team would have done.
    for (const sprint of project.sprints || []) if (sprint.end && dayOf(sprint.end) < today && sprint.state !== 'closed') { sprint.state = 'closed'; sprint.completedAt = sprint.end; }
    for (const version of project.versions || []) if (version.releaseDate && dayOf(version.releaseDate) < today) version.released = true;
  }
  return schedule;
}
