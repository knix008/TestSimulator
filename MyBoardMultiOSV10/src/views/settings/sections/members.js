// Members & roles (viewer / member / admin) of the project, and — for global administrators — the user
// accounts (list, create, edit, deactivate, reset password). The single-user desktop app explains instead.
import { tr, esc, icon, btn, ibtn, select, input, checkbox, note, card, renderIconRef, userOptions, ROLE_ICON } from '../util.js';
import { table, bindTables } from './collection.js';

const roleOptions = () => ['viewer', 'member', 'admin'].map((r) => ({ value: r, label: tr(`role.${r}`), icon: ROLE_ICON[r] }));
const avatar = (u) => renderIconRef(u.avatar, { size: 24, fallback: `l:${String(u.displayName ?? u.username ?? '?').slice(0, 2)}#5b6ee1` });
const singleUser = (S) => S.mode === 'desktop' && !S.info?.needsLogin;

export const membersSection = {
  id: 'members', glyph: 'user',
  render(S) {
    const rows = S.members.map((m) => ({ ...m, id: m.userId, name: m.displayName }));
    const memberIds = new Set(rows.map((m) => m.id));
    const others = S.users.filter((u) => u.active !== false && !memberIds.has(u.id));
    const admins = rows.filter((m) => m.role === 'admin').length;
    return `${singleUser(S) ? note(tr('members.desktop')) : ''}
    ${table(S, {
      kind: 'members', rows,
      cols: [
        { head: '', width: '36px', cell: avatar },
        { head: tr('col.user'), width: 'minmax(140px, 1.5fr)', cell: (m) => `<span class="ps-user"><b>${esc(m.displayName)}</b><small>@${esc(m.username)}${m.active === false ? ` · ${esc(tr('users.inactive'))}` : ''}</small></span>` },
        { head: tr('col.role'), width: 'minmax(130px, 1fr)', cell: (m, e) => select('role', m.role, roleOptions(), { disabled: !e, title: tr('col.role'), glyph: 'key' }) },
      ],
    })}
    <div class="ps-add" data-add="members">
      ${select('new-user', others[0]?.id ?? '', others.length ? userOptions(others) : [{ value: '', label: tr('members.noOthers'), icon: 'close' }], { disabled: !S.canEdit || !others.length, title: tr('col.user'), glyph: 'user' })}
      ${select('new-role', 'member', roleOptions(), { disabled: !S.canEdit || !others.length, title: tr('col.role'), glyph: 'key' })}
      ${btn('add-member', tr('members.add'), 'plus', { cls: 'primary', disabled: !S.canEdit || !others.length })}
    </div>
    ${S.isGlobalAdmin ? `<div class="ps-add" data-add="new-person">
      ${input('new-person', '', { placeholder: tr('members.newName'), disabled: !S.canEdit, attrs: 'data-new-person maxlength="80" autocomplete="off"' })}
      ${select('new-person-role', 'member', roleOptions(), { disabled: !S.canEdit, title: tr('col.role'), glyph: 'key' })}
      ${btn('create-member', tr('members.create'), 'user', { cls: 'primary', disabled: !S.canEdit })}
    </div>
    ${note(tr('members.createHint'))}` : ''}
    ${card(tr('members.roles'), 'key', `<ul class="ps-list">${['viewer', 'member', 'admin'].map((r) => `<li>${icon(ROLE_ICON[r])}<b>${esc(tr(`role.${r}`))}</b><span>${esc(tr(`role.${r}Text`))}</span></li>`).join('')}</ul>${admins <= 1 ? note(tr('members.lastAdmin'), 'warning') : ''}`)}`;
  },
  bind(S, el) {
    const findM = (id) => { const m = S.members.find((x) => x.userId === id); return m ? { ...m, id: m.userId, name: m.displayName } : null; };
    bindTables(S, el, {
      members: {
        find: findM,
        onField: (m, name, value) => S.patch(tr('op.role', { name: m.displayName }), `${S.url('members', m.id)}`, m, { role: value }),
        remove: (id) => S.api.del(S.url('members', id)),
      },
    });
    // A new person: a user without a password (assignable at once; no sign-in, so a single-user desktop stays
    // without a login), then a member of this project. The user name comes from the name (made unique).
    const createPerson = async () => {
      const name = el.querySelector('[data-new-person]')?.value.trim();
      const role = el.querySelector('[data-field="new-person-role"]')?.value || 'member';
      if (!name) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
      const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9._-]+/g, '') || 'member';
      await S.run(async () => {
        let user = null;
        for (let n = 0; n < 50 && !user; n++) {
          const username = `${base.slice(0, 40)}${n ? n + 1 : ''}${base === 'member' && !n ? Date.now() % 1000 : ''}`;
          try { user = await S.api.post('/users', { username, displayName: name, role: 'user' }); }
          catch (error) { if (error?.code !== 'USERNAME_TAKEN') throw error; }
        }
        user = user?.user ?? user;
        await S.api.post(S.url('members'), { userId: user.id, role });
      }, { ok: tr('members.created', { name }) });
    };
    el.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches?.('[data-new-person]')) { event.preventDefault(); createPerson(); } });
    el.addEventListener('click', (event) => {
      if (event.target.closest('[data-act="create-member"]:not([disabled])')) { createPerson(); return; }
      const button = event.target.closest('[data-act="add-member"]');
      if (!button || button.disabled) return;
      const userId = el.querySelector('[data-field="new-user"]').value;
      const role = el.querySelector('[data-field="new-role"]').value;
      if (!userId) return;
      S.run(() => S.api.post(S.url('members'), { userId, role }), { ok: tr('members.added') });
    });
  },
};

export const usersSection = {
  id: 'users', glyph: 'key', open: true,
  visible: (S) => S.isGlobalAdmin,
  render(S) {
    if (singleUser(S) && !S.pending.showUsers) {
      return `${card(tr('users.desktopTitle'), 'user', `<p class="ps-p">${esc(tr('users.desktop', { name: S.me?.displayName ?? S.me?.username ?? 'local' }))}</p><p class="ps-p">${esc(tr('users.desktop2'))}</p>
        <div class="ps-actions">${btn('show-users', tr('users.showAnyway'), 'user')}${btn('open-db', tr('details.dbOpen'), 'database')}</div>`)}`;
    }
    const roles = [{ value: 'user', label: tr('users.roleUser'), icon: 'user' }, { value: 'admin', label: tr('users.roleAdmin'), icon: 'key' }];
    const extra = (u) => (S.pending.reset === u.id ? `<div class="ps-inline-form" data-reset="${esc(u.id)}">${icon('lock')}<b>${esc(tr('users.resetFor', { name: u.displayName }))}</b>
      ${input('new-password', '', { type: 'password', placeholder: tr('users.newPassword'), attrs: 'data-reset-pw autocomplete="new-password"' })}<span class="grow"></span>${btn('reset-do', tr('users.reset'), 'check', { cls: 'primary' })}${btn('reset-cancel', tr('common.cancel'), 'close')}</div>` : '');
    const rows = S.users.map((u) => ({ ...u, name: u.displayName }));
    return `${table(S, {
      kind: 'users', rows, deletable: false, editable: true, extra,
      cols: [
        { head: '', width: '36px', cell: avatar },
        { head: tr('users.username'), width: 'minmax(100px, 0.8fr)', cell: (u) => `<code class="ps-code">${esc(u.username)}</code>` },
        { head: tr('users.displayName'), width: 'minmax(120px, 1fr)', cell: (u) => input('displayName', u.displayName, { placeholder: tr('users.displayName') }) },
        { head: tr('users.email'), width: 'minmax(140px, 1.2fr)', cell: (u) => input('email', u.email, { type: 'email', placeholder: tr('users.email') }) },
        { head: tr('col.role'), width: 'minmax(120px, 0.8fr)', cell: (u) => select('role', u.role, roles, { title: tr('col.role'), glyph: 'key' }) },
        { head: tr('users.active'), width: '64px', cell: (u) => checkbox('active', u.active !== false, tr('users.active')) },
        { head: '', width: '34px', cell: () => ibtn('reset', tr('users.reset'), 'lock') },
      ],
    })}
    ${card(tr('users.create'), 'plus', `<div class="ps-grid-form" data-add="users">
      ${input('new-username', '', { placeholder: tr('users.username'), attrs: 'data-new="username" autocomplete="off"' })}
      ${input('new-display', '', { placeholder: tr('users.displayName'), attrs: 'data-new="displayName"' })}
      ${input('new-email', '', { type: 'email', placeholder: tr('users.email'), attrs: 'data-new="email"' })}
      ${input('new-password', '', { type: 'password', placeholder: tr('users.password'), attrs: 'data-new="password" autocomplete="new-password"' })}
      ${select('new-urole', 'user', roles, { title: tr('col.role'), glyph: 'key' })}
      ${btn('create-user', tr('users.createButton'), 'plus', { cls: 'primary' })}
    </div>${note(tr('users.deactivateHint'))}`)}`;
  },
  bind(S, el) {
    const findU = (id) => { const u = S.users.find((x) => x.id === id); return u ? { ...u, name: u.displayName } : null; };
    bindTables(S, el, {
      users: {
        find: findU,
        onField: (u, name, value) => S.patch(tr('op.edit', { name: u.displayName }), `/users/${encodeURIComponent(u.id)}`, u, { [name]: name === 'active' ? Boolean(value) : value }),
      },
    });
    el.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.disabled) return;
      const act = button.dataset.act;
      const id = button.closest('[data-id]')?.dataset.id ?? button.closest('[data-reset]')?.dataset.reset;
      if (act === 'show-users') { S.pending.showUsers = true; S.render(); } else if (act === 'open-db') S.ctx.app?.run?.('database');
      else if (act === 'reset') { S.pending.reset = id; S.render(); el.ownerDocument.querySelector('[data-reset-pw]')?.focus(); } else if (act === 'reset-cancel') { S.pending.reset = null; S.render(); } else if (act === 'reset-do') {
        const pw = button.closest('[data-reset]').querySelector('[data-reset-pw]').value;
        S.pending.reset = null;
        await S.run(() => S.api.post('/auth/password', { userId: id, newPassword: pw }), { ok: tr('users.resetDone') });
      } else if (act === 'create-user') {
        const form = button.closest('[data-add]');
        const value = (k) => form.querySelector(`[data-new="${k}"]`).value.trim();
        const body = { username: value('username'), displayName: value('displayName') || value('username'), email: value('email') || undefined, password: form.querySelector('[data-new="password"]').value || undefined, role: form.querySelector('[data-field="new-urole"]').value };
        if (!body.username) { S.say('danger', tr('err.REQUIRED')); S.render(); return; }
        await S.run(() => S.api.createUser(body), { ok: tr('users.created', { name: body.username }) });
      }
    });
  },
};
