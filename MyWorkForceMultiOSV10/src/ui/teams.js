// Teams: the list of the company's teams, and one team's page (its projects, pages and members).
import { isWorkspaceAdmin, participatesIn } from '../domain/permissions.js';
import { ACCESS, accessOf, canManageTeam, canSeeSpace, isTeamLead, isTeamMember, METHODS, projectMethods, projectsOfTeam, teamSpace } from '../domain/teams.js';
import { avatar, esc, icon, L, pageHead } from './bits.js';

const person = (ws, id) => (ws.users || []).find((user) => user.id === id) || null;

function methodChips(project) {
  return projectMethods(project).map((id) => {
    const method = METHODS.find((item) => item.id === id);
    return method ? `<span class="chip">${icon(method.glyph)}${esc(L(method.ko, method.en))}</span>` : '';
  }).join('');
}

function accessChip(access) {
  const level = ACCESS.find((item) => item.id === access);
  return level ? `<span class="chip access-${level.id}">${icon(level.glyph)}${esc(L(level.ko, level.en))}</span>` : '';
}

/** The company's teams as cards. Everyone sees that a team exists; its pages are for its members. */
export function teamsView(ctx) {
  const ws = ctx.ws;
  const me = ctx.user?.id;
  const admin = isWorkspaceAdmin(ctx.user);
  const cards = (ws.teams || []).map((team) => {
    const lead = person(ws, team.leadId);
    const mine = isTeamMember(team, me);
    const projects = projectsOfTeam(ws, team.id);
    return `<article class="panel-card team-card${mine ? ' mine' : ''}">
      <header><b>${icon('team')}<span>${esc(team.name)}</span></b><span class="chip">${esc(team.key)}</span>${mine ? `<span class="chip access-edit">${icon('check')}${L('내 팀', 'My team')}</span>` : ''}</header>
      ${team.description ? `<p class="muted">${esc(team.description)}</p>` : ''}
      <dl class="team-facts">
        <dt>${icon('shield')}${L('팀장', 'Lead')}</dt><dd>${lead ? `${avatar(lead)} ${esc(lead.name)}` : '—'}</dd>
        <dt>${icon('people')}${L('구성원', 'Members')}</dt><dd>${(team.members || []).length}</dd>
        <dt>${icon('folder')}${L('과제', 'Projects')}</dt><dd>${projects.length}</dd>
      </dl>
      <div class="page-actions">
        <button type="button" class="button primary" data-action="open-team" data-id="${esc(team.id)}">${icon('team')}<span>${L('열기', 'Open')}</span></button>
        ${mine || admin ? `<button type="button" class="button" data-action="open-team-pages" data-id="${esc(team.id)}">${icon('book')}<span>${L('팀 페이지', 'Team pages')}</span></button>` : ''}
      </div>
    </article>`;
  }).join('');
  const actions = admin ? `<button type="button" class="button primary" data-action="new-team">${icon('plus')}<span>${L('새 팀', 'New team')}</span></button>` : '';
  return `<div class="page teams-page">${pageHead(L('팀', 'Teams'), actions, 'teams')}
    <p class="muted">${L('회사는 여러 팀으로 일합니다. 과제는 팀 안에서 만들고, 팀 페이지는 팀원끼리 정보를 나눕니다. 회사 공용 페이지는 모두가 봅니다.', 'The company works in teams. Projects are made inside a team; team pages are shared among its members. Company pages are for everyone.')}</p>
    <div class="card-grid team-grid">${cards || `<p class="muted">${L('팀이 없습니다.', 'There are no teams.')}</p>`}</div>
  </div>`;
}

/** One team: projects, pages and members, each in its own card. */
export function teamView(ctx) {
  const ws = ctx.ws;
  const team = (ws.teams || []).find((item) => item.id === ctx.ui.teamId);
  if (!team) return teamsView(ctx);
  const me = ctx.user?.id;
  const admin = isWorkspaceAdmin(ctx.user);
  const manage = canManageTeam(ws, team, me);
  const member = isTeamMember(team, me) || admin;
  const back = `<button type="button" class="button" data-action="go" data-view="teams">${icon('chevronLeft')}<span>${L('팀 목록', 'All teams')}</span></button>`;
  const create = member ? `<button type="button" class="button primary" data-action="new-project" data-team="${esc(team.id)}">${icon('plus')}<span>${L('새 과제', 'New project')}</span></button>` : '';
  const remove = admin ? `<button type="button" class="button danger" data-action="delete-team" data-id="${esc(team.id)}">${icon('trash')}<span>${L('팀 삭제', 'Delete team')}</span></button>` : '';

  const projects = projectsOfTeam(ws, team.id).filter((project) => admin || participatesIn(ws, project, me) || isTeamLead(team, me));
  const hidden = projectsOfTeam(ws, team.id).length - projects.length;
  const projectRows = projects.map((project) => {
    const access = admin ? 'lead' : accessOf(ws, project, me);
    const lead = person(ws, project.leadId);
    const manageProject = admin || access === 'lead' || isTeamLead(team, me);
    return `<div class="team-project${project.archived ? ' archived' : ''}">
      <div class="team-project-head">${icon('folder')}<b>${esc(project.name)}</b><span class="chip">${esc(project.key)}</span>${accessChip(access)}${project.archived ? `<span class="chip">${icon('box')}${L('보관', 'Archived')}</span>` : ''}</div>
      <div class="team-project-meta">${lead ? `${avatar(lead)}<span>${esc(lead.name)}</span>` : ''}<span class="muted">${L(`이슈 ${(project.issues || []).length}개`, `${(project.issues || []).length} issues`)}</span></div>
      <div class="chips">${methodChips(project)}</div>
      <div class="page-actions">
        <button type="button" class="small-button" data-action="activate" data-id="${esc(project.id)}">${icon('play')}<span>${L('열기', 'Open')}</span></button>
        ${manageProject ? `<button type="button" class="small-button" data-action="project-participants" data-id="${esc(project.id)}">${icon('people')}<span>${L('사람과 권한', 'People & access')}</span></button>` : ''}
        ${manageProject ? `<button type="button" class="small-button" data-action="open-project-settings" data-id="${esc(project.id)}">${icon('settings')}<span>${L('설정', 'Settings')}</span></button>` : ''}
        ${admin ? `<button type="button" class="small-button danger" data-action="delete-project" data-id="${esc(project.id)}">${icon('trash')}<span>${L('삭제', 'Delete')}</span></button>` : ''}
      </div>
    </div>`;
  }).join('');
  const projectCard = `<section class="panel-card team-section">
    <header><b>${icon('folder')}<span>${L('과제', 'Projects')}</span></b><span class="chip">${projects.length}</span>${create}</header>
    ${projectRows || `<p class="muted">${L('볼 수 있는 과제가 없습니다.', 'There are no projects you can see.')}</p>`}
    ${hidden > 0 ? `<p class="muted">${icon('lock')}${L(`참여하지 않은 과제 ${hidden}개는 보이지 않습니다.`, `${hidden} projects you are not in are hidden.`)}</p>` : ''}
  </section>`;

  const space = teamSpace(ws, team);
  const canPages = canSeeSpace(ws, space, me);
  const pages = canPages ? (ws.articles || []).filter((page) => page.spaceId === space.id && !page.trashed).slice(0, 8) : [];
  const pageRows = pages.map((page) => `<button type="button" class="link-row" data-action="open-article" data-id="${esc(page.id)}" data-space="${esc(space.id)}">${icon(page.kind === 'blog' ? 'spark' : page.kind === 'table' ? 'table' : 'book')}<b>${esc(page.title)}</b></button>`).join('');
  const pagesCard = `<section class="panel-card team-section">
    <header><b>${icon('book')}<span>${L('팀 페이지', 'Team pages')}</span></b><span class="chip">${esc(space.key)}</span>${canPages ? `<button type="button" class="small-button" data-action="open-team-pages" data-id="${esc(team.id)}">${icon('book')}<span>${L('모두 보기', 'Open all')}</span></button>` : ''}</header>
    ${canPages ? (pageRows || `<p class="muted">${L('아직 페이지가 없습니다.', 'There are no pages yet.')}</p>`) : `<p class="muted">${icon('lock')}${L('팀원만 볼 수 있습니다.', 'Only team members can see these.')}</p>`}
    ${canPages ? `<div class="inline"><input id="team-page-title" placeholder="${esc(L('새 페이지 제목', 'New page title'))}"><button type="button" class="small-button" data-action="add-team-page" data-id="${esc(team.id)}">${icon('plus')}<span>${L('페이지', 'Page')}</span></button></div>` : ''}
  </section>`;

  const memberRows = (team.members || []).map((item) => {
    const user = person(ws, item.userId);
    if (!user) return '';
    const role = item.role === 'lead' || team.leadId === user.id ? 'lead' : 'member';
    const control = manage
      ? `<select data-team-member="${esc(user.id)}" data-team="${esc(team.id)}" aria-label="${esc(L('역할', 'Role'))}"><option value="member"${role === 'member' ? ' selected' : ''}>${esc(L('팀원', 'Member'))}</option><option value="lead"${role === 'lead' ? ' selected' : ''}>${esc(L('팀장', 'Lead'))}</option></select>
         <button type="button" class="icon-button" data-action="remove-team-member" data-team="${esc(team.id)}" data-id="${esc(user.id)}" title="${esc(L('빼기', 'Remove'))}" aria-label="${esc(L('빼기', 'Remove'))}">${icon('trash')}</button>`
      : `<span class="chip">${icon(role === 'lead' ? 'shield' : 'user')}${esc(role === 'lead' ? L('팀장', 'Lead') : L('팀원', 'Member'))}</span>`;
    return `<div class="participant-row">${avatar(user)}<span class="grow">${esc(user.name)} <small>${esc(user.jobTitle || user.login || '')}</small></span>${control}</div>`;
  }).join('');
  const outsiders = (ws.users || []).filter((user) => user.active !== false && !isTeamMember(team, user.id));
  const addMember = manage && outsiders.length
    ? `<div class="inline"><select id="team-add-user">${outsiders.map((user) => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('')}</select><button type="button" class="small-button" data-action="add-team-member" data-team="${esc(team.id)}">${icon('plus')}<span>${L('팀원 추가', 'Add member')}</span></button></div>`
    : '';
  const membersCard = `<section class="panel-card team-section">
    <header><b>${icon('people')}<span>${L('구성원', 'Members')}</span></b><span class="chip">${(team.members || []).length}</span></header>
    ${memberRows}${addMember}
  </section>`;

  const infoCard = `<section class="panel-card team-section">
    <header><b>${icon('info')}<span>${L('팀 정보', 'About the team')}</span></b></header>
    <label class="form-row"><span>${icon('team')}${L('이름', 'Name')}</span><input data-team-field="name" data-team="${esc(team.id)}" value="${esc(team.name)}" ${manage ? '' : 'disabled'}></label>
    <label class="form-row"><span>${icon('pencil')}${L('설명', 'Description')}</span><textarea data-team-field="description" data-team="${esc(team.id)}" rows="3" ${manage ? '' : 'disabled'}>${esc(team.description || '')}</textarea></label>
    <p class="muted">${icon('lock')}${L('팀 이름과 구성원은 관리자와 팀장이 바꿉니다. 과제는 팀원이 만들 수 있습니다.', 'The administrator and team leads change the team and its members. Any member may start a project.')}</p>
  </section>`;

  return `<div class="page team-page">${pageHead(`${esc(team.name)} <small class="muted">${esc(team.key)}</small>`, `${back}${remove}`, 'teams')}
    ${team.description ? `<p class="muted">${esc(team.description)}</p>` : ''}
    <div class="settings-grid">${projectCard}${pagesCard}${membersCard}${infoCard}</div>
  </div>`;
}

/** Method checkboxes for a project (new-project dialog and project settings). */
export function methodChecks(selected, attr = 'name="methods"') {
  const on = new Set(selected);
  return `<div class="method-grid">${METHODS.map((method) => `<label class="method-option${on.has(method.id) ? ' on' : ''}"><input type="checkbox" ${attr} value="${method.id}" ${on.has(method.id) ? 'checked' : ''}>${icon(method.glyph)}<span><b>${esc(L(method.ko, method.en))}</b><small>${esc(L(method.aboutKo, method.aboutEn))}</small></span></label>`).join('')}</div>`;
}
