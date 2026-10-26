// Tools › Administration: webhooks, users / groups / permissions / tokens,
// external issue and test report import, and analysis settings.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon, Dialog } from '../components/Chrome';
import { useApi, ApiState, Btn, BtnGroup, IconSelect, Toggle, Tabs, Stepper, ViewHeader, Empty, FilePickButton, copyText, fmtDate, linesToList, NoProject } from './common';
import { ToolsManager } from './Tools';

const EVENTS = ['analysis-done', 'gate-changed'];
const GLOBAL_PERMS = ['admin', 'gateadmin', 'profileadmin', 'scan', 'provisioning'];
const PROJECT_PERMS = ['user', 'codeviewer', 'issueadmin', 'securityhotspotadmin', 'admin', 'scan'];
const TOKEN_TYPES = ['USER', 'PROJECT_ANALYSIS', 'GLOBAL_ANALYSIS'];
const EXTERNAL_FORMATS = ['sarif', 'sonar', 'coverity', 'cppcheck', 'clang-tidy', 'eslint', 'pylint', 'checkstyle', 'spotbugs', 'pmd', 'gosec', 'bandit', 'semgrep'];

export function AdminView({ ws, project, branch, onSaveWorkspace, onWorkspaceChanged, initialTab }) {
  useLanguage();
  const [tab, setTab] = useState(initialTab || 'webhooks');
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  return (
    <div className="view">
      <ViewHeader icon="users" title={t('nav_admin')} hint={t('ad_hint')}>
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'webhooks', label: t('ad_webhooks'), icon: 'webhook' },
          { id: 'security', label: t('ad_security'), icon: 'users' },
          { id: 'external', label: t('ad_external'), icon: 'upload' },
          { id: 'tests', label: t('ad_tests'), icon: 'check' },
          { id: 'settings', label: t('ad_settings'), icon: 'settings' },
          { id: 'tools', label: t('tl_tab'), icon: 'installBox' },
        ]} />
      </ViewHeader>
      {tab === 'tools' && <><p className="small view-hint">{t('tl_hint')}</p><ToolsManager onChanged={onWorkspaceChanged} /></>}
      {tab === 'webhooks' && <Webhooks projects={ws.projects || []} />}
      {tab === 'security' && <Security projects={ws.projects || []} />}
      {tab === 'external' && <ExternalImport project={project} branch={branch} kind="external" onDone={onWorkspaceChanged} />}
      {tab === 'tests' && <ExternalImport project={project} branch={branch} kind="tests" onDone={onWorkspaceChanged} />}
      {tab === 'settings' && <AnalysisSettings ws={ws} project={project} onSave={onSaveWorkspace} />}
    </div>
  );
}

// ── Webhooks ──────────────────────────────────────────────
const EMPTY_HOOK = { id: '', name: '', url: '', secret: '', events: ['analysis-done'], projectId: null, enabled: true, hasSecret: false };

function Webhooks({ projects }) {
  useLanguage();
  const hooks = useApi('webhook.list', {}, [], true);
  const deliveries = useApi('webhook.deliveries', {}, [], true);
  const [draft, setDraft] = useState(EMPTY_HOOK);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const projectOptions = [{ value: null, label: t('ad_all_projects'), icon: 'layers' }, ...projects.map((p) => ({ value: p.id, label: p.name, icon: 'folder' }))];
  const save = async () => {
    setError('');
    const webhook = { ...draft };
    delete webhook.hasSecret;
    if (!webhook.id) delete webhook.id;
    if (!webhook.secret) delete webhook.secret;
    try {
      await call('webhook.save', { webhook });
      setDraft(EMPTY_HOOK);
      hooks.reload();
    } catch (err) { setError(err.message); }
  };
  const remove = async (id) => {
    await call('webhook.delete', { id });
    setConfirmDel(null);
    if (draft.id === id) setDraft(EMPTY_HOOK);
    hooks.reload();
  };
  const list = hooks.data || [];
  return (
    <>
      <ApiState state={hooks} />
      <div className="panel tpanel">
        <div className="table-wrap short">
          <table>
            <thead><tr><th>{t('name')}</th><th>URL</th><th>{t('ad_events')}</th><th>{t('ad_scope')}</th><th>{t('ad_secret')}</th><th>{t('ad_enabled')}</th><th className="act" /></tr></thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className={draft.id === h.id ? 'sel' : ''}>
                  <td><strong>{h.name}</strong></td>
                  <td className="small wrap">{h.url}</td>
                  <td className="small">{(h.events || []).map((e) => t(`ad_ev_${e.replace(/-/g, '_')}`)).join(', ')}</td>
                  <td className="small">{h.projectId ? ((projects.find((p) => p.id === h.projectId) || {}).name || h.projectId) : t('ad_all_projects')}</td>
                  <td>{h.hasSecret ? <Icon name="lock" size={14} /> : <span className="muted">—</span>}</td>
                  <td className={h.enabled ? 'ok' : 'muted'}>{h.enabled ? t('ad_on') : t('ad_off')}</td>
                  <td className="act">
                    <BtnGroup>
                      <Btn icon="edit" label={t('ms_edit')} onClick={() => setDraft({ ...EMPTY_HOOK, ...h, secret: '' })} />
                      <Btn icon="trash" label={t('remove')} onClick={() => setConfirmDel(h)} />
                    </BtnGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <Empty text={t('ad_no_webhooks')} />}
        </div>
      </div>
      <h3 className="sub-title">{draft.id ? t('ad_edit_webhook') : t('ad_add_webhook')}</h3>
      <div className="form-grid four">
        <label>{t('name')}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="span2">URL<input value={draft.url} placeholder="https://ci.example.com/hook" onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
        <label>{t('ad_secret')}<input type="password" value={draft.secret} placeholder={draft.hasSecret ? t('ad_secret_keep') : ''} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} /></label>
        <label>{t('ad_scope')}<IconSelect value={draft.projectId || null} options={projectOptions} onChange={(v) => setDraft({ ...draft, projectId: v })} /></label>
        <div className="form-field span2"><span>{t('ad_events')}</span>
          <div className="toggle-row">
            {EVENTS.map((e) => (
              <Toggle key={e} checked={draft.events.includes(e)} label={t(`ad_ev_${e.replace(/-/g, '_')}`)}
                onChange={(on) => setDraft({ ...draft, events: on ? [...new Set([...draft.events, e])] : draft.events.filter((x) => x !== e) })} />
            ))}
          </div>
        </div>
        <div className="form-field"><span>{t('ad_enabled')}</span><Toggle checked={draft.enabled} label={draft.enabled ? t('ad_on') : t('ad_off')} onChange={(on) => setDraft({ ...draft, enabled: on })} /></div>
        <div className="form-end">
          <BtnGroup>
            <Btn icon="save" label={t('save')} primary disabled={!draft.url.trim() || !draft.events.length} onClick={save} />
            <Btn icon="close" label={t('cancel')} onClick={() => { setDraft(EMPTY_HOOK); setError(''); }} />
          </BtnGroup>
        </div>
      </div>
      {error && <p className="small bad">{error}</p>}
      <div className="section-head">
        <h3 className="sub-title">{t('ad_deliveries')}</h3>
        <Btn icon="refresh" label={t('pf_refresh')} onClick={deliveries.reload} />
      </div>
      <div className="panel tpanel">
        <div className="table-wrap short">
          <table>
            <thead><tr><th>{t('when')}</th><th>{t('name')}</th><th>{t('ad_event')}</th><th>{t('status')}</th><th className="num">{t('duration')}</th><th>{t('ad_response')}</th></tr></thead>
            <tbody>
              {[...(deliveries.data || [])].reverse().map((d) => (
                <tr key={d.id}>
                  <td className="small nowrap">{fmtDate(d.at)}</td>
                  <td className="small">{(list.find((h) => h.id === d.webhookId) || {}).name || d.url}</td>
                  <td className="small">{d.event}</td>
                  <td className={d.success ? 'ok' : 'bad'}>{d.httpStatus || ''} {d.success ? t('passed') : (d.error || t('failed'))}</td>
                  <td className="num small">{d.durationMs} ms</td>
                  <td className="small wrap">{String(d.response || '').slice(0, 160)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(deliveries.data || []).length === 0 && <Empty text={t('ad_no_deliveries')} />}
        </div>
      </div>
      {confirmDel && (
        <ConfirmBox title={t('remove')} body={t('ad_confirm_delete', { name: confirmDel.name })} onOk={() => remove(confirmDel.id)} onCancel={() => setConfirmDel(null)} />
      )}
    </>
  );
}

function ConfirmBox({ title, body, onOk, onCancel }) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p style={{ margin: '4px 0 8px' }}>{body}</p>
      <div className="dialog-actions"><BtnGroup><Btn icon="trash" label={t('remove')} primary onClick={onOk} /><Btn icon="close" label={t('cancel')} onClick={onCancel} /></BtnGroup></div>
    </Dialog>
  );
}

// ── Users, groups, permissions, tokens ────────────────────
function Security({ projects }) {
  useLanguage();
  const [sec, setSec] = useState(null);
  const [error, setError] = useState('');
  const [sub, setSub] = useState('users');
  const [dialog, setDialog] = useState(null);
  const load = async () => { try { setSec(await call('security.get')); } catch (err) { setError(err.message); } };
  useEffect(() => { load(); }, []);
  const act = async (fn, args) => {
    setError('');
    try {
      const res = await call('security.call', { fn, args });
      setSec(res.security);
      return res.result;
    } catch (err) { setError(err.message); return undefined; }
  };
  if (!sec) return error ? <Empty text={error} icon="alert" /> : <Empty text={t('loading')} icon="clock" />;
  return (
    <>
      <div className={`banner ${sec.enabled ? 'OK' : ''}`}>
        <div>
          <strong><Icon name={sec.enabled ? 'lock' : 'info'} size={16} /> {sec.enabled ? t('ad_sec_on') : t('ad_sec_off')}</strong>
          <div className="small">{t('ad_sec_hint')}</div>
        </div>
        <Toggle checked={sec.enabled} label={t('ad_enable_security')} icon="lock" onChange={(on) => act('setEnabled', [on])} />
      </div>
      {error && <p className="small bad">{error}</p>}
      <Tabs value={sub} onChange={setSub} tabs={[
        { id: 'users', label: t('ad_users'), icon: 'user', count: sec.users.length },
        { id: 'groups', label: t('ad_groups'), icon: 'group', count: sec.groups.length },
        { id: 'global', label: t('ad_global_perms'), icon: 'key' },
        { id: 'project', label: t('ad_project_perms'), icon: 'folder' },
        { id: 'tokens', label: t('ad_tokens'), icon: 'key', count: sec.tokens.length },
      ]} />
      {sub === 'users' && <Users sec={sec} act={act} setDialog={setDialog} />}
      {sub === 'groups' && <Groups sec={sec} act={act} />}
      {sub === 'global' && <PermMatrix sec={sec} perms={GLOBAL_PERMS} entries={sec.global} onGrant={(perm, who) => act('grantGlobal', [perm, who])} onRevoke={(perm, who) => act('revokeGlobal', [perm, who])} />}
      {sub === 'project' && <ProjectPerms sec={sec} projects={projects} act={act} />}
      {sub === 'tokens' && <Tokens sec={sec} projects={projects} act={act} setDialog={setDialog} />}
      {dialog && dialog.kind === 'password' && <PasswordDialog login={dialog.login} onClose={() => setDialog(null)} onSave={async (pw) => { await act('setPassword', [dialog.login, pw]); setDialog(null); }} />}
      {dialog && dialog.kind === 'token' && <TokenDialog token={dialog.token} onClose={() => setDialog(null)} />}
    </>
  );
}

function Users({ sec, act, setDialog }) {
  useLanguage();
  const [draft, setDraft] = useState({ login: '', name: '', email: '', password: '' });
  return (
    <>
      <div className="panel tpanel">
        <div className="table-wrap short">
          <table>
            <thead><tr><th>{t('ad_login')}</th><th>{t('name')}</th><th>{t('ad_email')}</th><th>{t('ad_groups')}</th><th>{t('ad_password')}</th><th>{t('status')}</th><th className="act" /></tr></thead>
            <tbody>
              {sec.users.map((u) => (
                <tr key={u.login}>
                  <td><strong>{u.login}</strong></td>
                  <td>{u.name}</td>
                  <td className="small">{u.email || '—'}</td>
                  <td className="wrap">{(u.groups || []).map((g) => <span key={g} className="pill">{g}</span>)}</td>
                  <td className={u.hasPassword ? 'ok' : 'muted'}>{u.hasPassword ? t('ad_set') : t('ad_not_set')}</td>
                  <td className={u.active ? 'ok' : 'muted'}>{u.active ? t('ad_active') : t('ad_inactive')}</td>
                  <td className="act">
                    <BtnGroup>
                      <Btn icon="key" label={t('ad_password')} onClick={() => setDialog({ kind: 'password', login: u.login })} />
                      {u.active
                        ? <Btn icon="minus" label={t('ad_deactivate')} onClick={() => act('deactivateUser', [u.login])} />
                        : <Btn icon="check" label={t('ad_activate')} onClick={() => act('updateUser', [u.login, { active: true }])} />}
                    </BtnGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <h3 className="sub-title">{t('ad_add_user')}</h3>
      <div className="form-grid">
        <label>{t('ad_login')}<input value={draft.login} onChange={(e) => setDraft({ ...draft, login: e.target.value })} /></label>
        <label>{t('name')}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>{t('ad_email')}<input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
        <label>{t('ad_password')}<input type="password" value={draft.password} placeholder={t('ad_pw_min')} onChange={(e) => setDraft({ ...draft, password: e.target.value })} /></label>
        <div className="form-end"><Btn icon="plus" label={t('add')} primary disabled={!draft.login.trim()} onClick={async () => {
          const r = await act('createUser', { login: draft.login.trim(), name: draft.name.trim(), email: draft.email.trim(), password: draft.password || null });
          if (r !== undefined) setDraft({ login: '', name: '', email: '', password: '' });
        }} /></div>
      </div>
    </>
  );
}

function Groups({ sec, act }) {
  useLanguage();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [user, setUser] = useState((sec.users[0] && sec.users[0].login) || '');
  const [group, setGroup] = useState((sec.groups[0] && sec.groups[0].name) || '');
  const builtIn = ['administrators', 'users'];
  return (
    <>
      <div className="panel tpanel">
        <div className="table-wrap short">
          <table>
            <thead><tr><th>{t('name')}</th><th>{t('hs_description')}</th><th>{t('ad_members')}</th><th className="act" /></tr></thead>
            <tbody>
              {sec.groups.map((g) => {
                const members = sec.users.filter((u) => (u.groups || []).includes(g.name));
                return (
                  <tr key={g.name}>
                    <td><strong>{g.name}</strong>{g.default && <div className="small">{t('ad_default_group')}</div>}</td>
                    <td className="small wrap">{g.description}</td>
                    <td className="wrap">{members.map((u) => (
                      <span key={u.login} className="pill removable">{u.login}
                        <button type="button" aria-label={t('remove')} title={t('remove')} onClick={() => act('removeMember', [g.name, u.login])}><Icon name="close" size={10} /></button>
                      </span>
                    ))}</td>
                    <td className="act"><Btn icon="trash" label={t('remove')} disabled={builtIn.includes(g.name)} onClick={() => act('deleteGroup', [g.name])} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="two-forms">
        <div>
          <h3 className="sub-title">{t('ad_add_group')}</h3>
          <div className="form-grid">
            <label>{t('name')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>{t('hs_description')}<input value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
            <div className="form-end"><Btn icon="plus" label={t('add')} primary disabled={!name.trim()} onClick={async () => { await act('createGroup', { name: name.trim(), description: desc.trim() }); setName(''); setDesc(''); }} /></div>
          </div>
        </div>
        <div>
          <h3 className="sub-title">{t('ad_membership')}</h3>
          <div className="form-grid">
            <label>{t('ad_user')}<IconSelect value={user} options={sec.users.map((u) => ({ value: u.login, label: u.login, icon: 'user' }))} onChange={setUser} /></label>
            <label>{t('ad_group')}<IconSelect value={group} options={sec.groups.map((g) => ({ value: g.name, label: g.name, icon: 'group' }))} onChange={setGroup} /></label>
            <div className="form-end"><Btn icon="plus" label={t('ad_add_member')} primary disabled={!user || !group} onClick={() => act('addMember', [group, user])} /></div>
          </div>
        </div>
      </div>
    </>
  );
}

function PermMatrix({ sec, perms, entries, onGrant, onRevoke }) {
  useLanguage();
  const [perm, setPerm] = useState(perms[0]);
  const [kind, setKind] = useState('group');
  const [who, setWho] = useState('');
  const whoOptions = kind === 'user'
    ? sec.users.map((u) => ({ value: u.login, label: u.login, icon: 'user' }))
    : [{ value: 'Anyone', label: 'Anyone', icon: 'globe' }, ...sec.groups.map((g) => ({ value: g.name, label: g.name, icon: 'group' }))];
  return (
    <>
      <div className="panel tpanel">
        <div className="table-wrap short">
          <table>
            <thead><tr><th>{t('ad_permission')}</th><th>{t('ad_groups')}</th><th>{t('ad_users')}</th></tr></thead>
            <tbody>
              {perms.map((p) => {
                const e = (entries && entries[p]) || { users: [], groups: [] };
                return (
                  <tr key={p}>
                    <td><strong>{t(`ad_perm_${p}`)}</strong><div className="small">{p}</div></td>
                    <td className="wrap">{e.groups.map((g) => <Chip key={g} icon="group" text={g} onRemove={() => onRevoke(p, { group: g })} />)}{!e.groups.length && <span className="muted">—</span>}</td>
                    <td className="wrap">{e.users.map((u) => <Chip key={u} icon="user" text={u} onRemove={() => onRevoke(p, { user: u })} />)}{!e.users.length && <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <h3 className="sub-title">{t('ad_grant')}</h3>
      <div className="form-grid">
        <label>{t('ad_permission')}<IconSelect value={perm} options={perms.map((p) => ({ value: p, label: t(`ad_perm_${p}`), icon: 'key' }))} onChange={setPerm} /></label>
        <label>{t('ad_grantee')}<IconSelect value={kind} options={[{ value: 'group', label: t('ad_group'), icon: 'group' }, { value: 'user', label: t('ad_user'), icon: 'user' }]} onChange={(v) => { setKind(v); setWho(''); }} /></label>
        <label>{t('name')}<IconSelect value={who} options={whoOptions} onChange={setWho} placeholder={t('ad_pick')} /></label>
        <div className="form-end"><Btn icon="plus" label={t('ad_grant')} primary disabled={!who} onClick={() => onGrant(perm, kind === 'user' ? { user: who } : { group: who })} /></div>
      </div>
    </>
  );
}

function Chip({ icon, text, onRemove }) {
  return (
    <span className="pill removable"><Icon name={icon} size={11} />{text}
      <button type="button" aria-label={t('remove')} title={t('remove')} onClick={onRemove}><Icon name="close" size={10} /></button>
    </span>
  );
}

function ProjectPerms({ sec, projects, act }) {
  useLanguage();
  const [pid, setPid] = useState((projects[0] && projects[0].id) || '');
  if (!projects.length) return <NoProject />;
  return (
    <>
      <div className="view-toolbar">
        <span className="tb-label">{t('projects')}</span>
        <IconSelect value={pid} options={projects.map((p) => ({ value: p.id, label: p.name, icon: 'folder' }))} onChange={setPid} width={240} />
      </div>
      <PermMatrix key={pid} sec={sec} perms={PROJECT_PERMS} entries={(sec.projects || {})[pid]}
        onGrant={(perm, who) => act('grantProject', [pid, perm, who])} onRevoke={(perm, who) => act('revokeProject', [pid, perm, who])} />
    </>
  );
}

function Tokens({ sec, projects, act, setDialog }) {
  useLanguage();
  const [draft, setDraft] = useState({ login: (sec.users[0] && sec.users[0].login) || '', name: '', type: 'USER', projectId: (projects[0] && projects[0].id) || null });
  return (
    <>
      <div className="panel tpanel">
        <div className="table-wrap short">
          <table>
            <thead><tr><th>{t('name')}</th><th>{t('ad_login')}</th><th>{t('type')}</th><th>{t('projects')}</th><th>{t('ad_created')}</th><th>{t('ad_last_used')}</th><th className="act" /></tr></thead>
            <tbody>
              {sec.tokens.map((tk) => (
                <tr key={tk.id}>
                  <td><strong>{tk.name}</strong></td>
                  <td>{tk.login}</td>
                  <td className="small">{t(`ad_tok_${tk.type.toLowerCase()}`)}</td>
                  <td className="small">{tk.projectId ? ((projects.find((p) => p.id === tk.projectId) || {}).name || tk.projectId) : '—'}</td>
                  <td className="small nowrap">{fmtDate(tk.createdAt)}</td>
                  <td className="small nowrap">{fmtDate(tk.lastUsedAt)}</td>
                  <td className="act"><Btn icon="trash" label={t('ad_revoke')} onClick={() => act('revokeToken', [tk.login, tk.name])} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {sec.tokens.length === 0 && <Empty text={t('ad_no_tokens')} />}
        </div>
      </div>
      <h3 className="sub-title">{t('ad_generate')}</h3>
      <div className="form-grid">
        <label>{t('ad_login')}<IconSelect value={draft.login} options={sec.users.filter((u) => u.active).map((u) => ({ value: u.login, label: u.login, icon: 'user' }))} onChange={(v) => setDraft({ ...draft, login: v })} /></label>
        <label>{t('name')}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>{t('type')}<IconSelect value={draft.type} options={TOKEN_TYPES.map((x) => ({ value: x, label: t(`ad_tok_${x.toLowerCase()}`), icon: 'key' }))} onChange={(v) => setDraft({ ...draft, type: v })} /></label>
        {draft.type === 'PROJECT_ANALYSIS' && <label>{t('projects')}<IconSelect value={draft.projectId} options={projects.map((p) => ({ value: p.id, label: p.name, icon: 'folder' }))} onChange={(v) => setDraft({ ...draft, projectId: v })} /></label>}
        <div className="form-end"><Btn icon="key" label={t('ad_generate')} primary disabled={!draft.login || !draft.name.trim()} onClick={async () => {
          const r = await act('generateToken', { login: draft.login, name: draft.name.trim(), type: draft.type, projectId: draft.type === 'PROJECT_ANALYSIS' ? draft.projectId : null });
          if (r && r.token) { setDialog({ kind: 'token', token: r.token }); setDraft({ ...draft, name: '' }); }
        }} /></div>
      </div>
    </>
  );
}

function PasswordDialog({ login, onClose, onSave }) {
  useLanguage();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const ok = pw.length >= 8 && pw === pw2;
  return (
    <Dialog title={`${t('ad_password')} · ${login}`} onClose={onClose}>
      <label className="form-row">{t('ad_password')}<input type="password" value={pw} autoFocus onChange={(e) => setPw(e.target.value)} /></label>
      <label className="form-row">{t('ad_password_again')}<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      <p className="small">{t('ad_pw_min')}</p>
      <div className="dialog-actions"><BtnGroup><Btn icon="save" label={t('save')} primary disabled={!ok} onClick={() => onSave(pw)} /><Btn icon="close" label={t('cancel')} onClick={onClose} /></BtnGroup></div>
    </Dialog>
  );
}

function TokenDialog({ token, onClose }) {
  useLanguage();
  const [copied, setCopied] = useState(false);
  return (
    <Dialog title={t('ad_new_token')} onClose={onClose}>
      <p className="small">{t('ad_token_once')}</p>
      <pre className="pre selectable token">{token}</pre>
      <div className="dialog-actions"><BtnGroup>
        <Btn icon="copy" label={copied ? t('pr_copied') : t('pr_copy')} primary onClick={async () => setCopied(await copyText(token))} />
        <Btn icon="close" label={t('win_close')} onClick={onClose} />
      </BtnGroup></div>
    </Dialog>
  );
}

// ── External issues / test reports ────────────────────────
function ExternalImport({ project, branch, kind, onDone }) {
  useLanguage();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [format, setFormat] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isTests = kind === 'tests';
  useEffect(() => { setResult(null); setError(''); }, [kind]);
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const args = { projectId: project.id, branch, text, fileName: fileName || undefined };
      if (!isTests && format) args.format = format;
      const res = await call(isTests ? 'tests.import' : 'external.import', args);
      setResult(res);
      if (onDone) onDone();
    } catch (err) { setResult(null); setError(err.code === 'NOT_FOUND' ? t('pf_no_analysis') : err.message); } finally { setBusy(false); }
  };
  if (!project) return <NoProject />;
  const formatOptions = [{ value: '', label: t('ad_auto_detect'), icon: 'search' }, ...EXTERNAL_FORMATS.map((f) => ({ value: f, label: f, icon: 'file' }))];
  return (
    <>
      <p className="small">{isTests ? t('ad_tests_hint') : t('ad_external_hint')}</p>
      <div className="view-toolbar">
        <FilePickButton label={t('ad_open_file')} icon="folder" accept={isTests ? '.xml' : '.json,.sarif,.xml,.txt,.log'} onText={(body, name) => { setText(body); setFileName(name); }} />
        {!isTests && <IconSelect value={format} options={formatOptions} onChange={setFormat} title={t('ad_format')} width={180} />}
        <span className="small ellipsis">{fileName || t('ad_or_paste')}</span>
        <span className="spacer" />
        <BtnGroup>
          <Btn icon="upload" label={busy ? t('analyzing') : t('ad_import')} primary disabled={!text.trim() || busy} onClick={run} />
          <Btn icon="trash" label={t('ad_clear')} disabled={!text} onClick={() => { setText(''); setFileName(''); setResult(null); }} />
        </BtnGroup>
      </div>
      <textarea className="mono-area" value={text} spellCheck={false} placeholder={isTests ? '<testsuite …>' : '{ "version": "2.1.0", "runs": [ … ] }'} onChange={(e) => setText(e.target.value)} />
      {error && <Empty text={error} icon="alert" />}
      {result && !isTests && (
        <div className="banner OK">
          <div><strong><Icon name="check" size={16} /> {t('ad_imported', { n: result.count })}</strong><div className="small">{t('ad_format')} {result.format} · {t('ad_engine')} {result.engine}</div></div>
          {(result.warnings || []).length > 0 && <div className="small banner-side">{result.warnings.slice(0, 5).join(' · ')}</div>}
        </div>
      )}
      {result && isTests && (
        <div className="card-grid">
          {Object.entries(result).map(([k, v]) => <div key={k} className="card"><div className="k">{t(`ad_tm_${k}`)}</div><div className="v">{v == null ? '—' : v}</div></div>)}
        </div>
      )}
    </>
  );
}

// ── Analysis settings ─────────────────────────────────────
function AnalysisSettings({ ws, project, onSave }) {
  useLanguage();
  const s = ws.settings || {};
  const pol = s.licensePolicy || {};
  const definesText = (d) => Object.entries(d || {}).map(([k, v]) => (v === '' || v == null || v === true ? k : `${k}=${v}`)).join('\n');
  // A project can keep its own new code definition (project.newCode) over the workspace one.
  const own = (project && project.newCode) || null;
  const nc = own || s;
  const init = () => ({
    newCode: nc.newCode || 'previous', newCodeDays: nc.newCodeDays || 30, newCodeRef: nc.newCodeRef || '',
    newCodeVersion: nc.newCodeVersion || '', newCodeAnalysis: nc.newCodeAnalysis || '', projectNewCode: !!own,
    autoAssign: !!s.autoAssign,
    approvalRequired: !!(s.approval && s.approval.required), selfApproval: !(s.approval && s.approval.selfApproval === false),
    allowed: (pol.allowed || []).join('\n'), denied: (pol.denied || []).join('\n'), review: (pol.review || []).join('\n'),
    internal: (s.internalPackages || []).join('\n'),
    cTarget: s.cTarget || '',
    includeDirs: ((project && project.includeDirs) || []).join('\n'),
    defines: definesText(project && project.defines),
  });
  const [d, setD] = useState(init);
  const [note, setNote] = useState('');
  useEffect(() => { setD(init()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ws, project && project.id]);
  const set = (patch) => setD({ ...d, ...patch });
  const save = async () => {
    const defines = {};
    for (const line of linesToList(d.defines.replace(/,/g, '\n'))) {
      const i = line.indexOf('=');
      if (i < 0) defines[line] = '1'; else defines[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const licensePolicy = { ...pol, allowed: linesToList(d.allowed), denied: linesToList(d.denied), review: linesToList(d.review) };
    const newCode = { newCode: d.newCode, newCodeDays: d.newCodeDays, newCodeRef: d.newCodeRef.trim(), newCodeVersion: d.newCodeVersion.trim(), newCodeAnalysis: d.newCodeAnalysis };
    const perProject = !!(project && d.projectNewCode);
    const settings = {
      ...s, ...(perProject ? {} : newCode),
      autoAssign: d.autoAssign, approval: { required: d.approvalRequired, selfApproval: d.selfApproval }, licensePolicy, internalPackages: linesToList(d.internal), cTarget: d.cTarget || undefined,
    };
    const projects = (ws.projects || []).map((p) => (project && p.id === project.id
      ? { ...p, includeDirs: linesToList(d.includeDirs), defines, newCode: perProject ? newCode : undefined }
      : p));
    try {
      await onSave({ ...ws, settings, projects });
      setNote(t('ad_settings_saved'));
    } catch (err) { setNote(err.message); }
  };
  const modeOptions = [
    { value: 'previous', label: t('previous_analysis'), icon: 'history' },
    { value: 'days', label: t('number_of_days'), icon: 'calendar' },
    { value: 'scm', label: t('ad_nc_scm'), icon: 'branch' },
    { value: 'version', label: t('ad_nc_version'), icon: 'package' },
    { value: 'analysis', label: t('ad_nc_analysis'), icon: 'calendar' },
  ];
  const mainHistory = (project && project.branches && (project.branches[project.mainBranch || 'main'] || {}).history) || [];
  const analysisOptions = [{ value: '', label: '—', icon: 'close' }, ...[...mainHistory].reverse().map((h) => ({ value: h.at, label: new Date(h.at).toLocaleString(), icon: 'clock' }))];
  const targetOptions = [
    { value: '', label: t('ad_target_default'), icon: 'cpu' },
    { value: 'ilp32', label: 'ILP32 (32-bit)', icon: 'cpu' },
    { value: 'lp64', label: 'LP64 (Linux / macOS 64-bit)', icon: 'cpu' },
    { value: 'llp64', label: 'LLP64 (Windows 64-bit)', icon: 'cpu' },
  ];
  return (
    <div className="settings-grid">
      <section className="panel">
        <h3 className="sub-title"><Icon name="clock" size={15} /> {t('new_code_mode')}</h3>
        <div className="form-grid single">
          <label>{t('new_code_mode')}<IconSelect value={d.newCode} options={modeOptions} onChange={(v) => set({ newCode: v })} /></label>
          {d.newCode === 'days' && <div className="form-field"><span>{t('number_of_days')}</span><Stepper value={d.newCodeDays} min={1} max={3650} onChange={(v) => set({ newCodeDays: v })} /></div>}
          {d.newCode === 'scm' && <label>{t('ad_nc_ref')}<input value={d.newCodeRef} placeholder="main / v1.2.0 / a1b2c3d" onChange={(e) => set({ newCodeRef: e.target.value })} /></label>}
          {d.newCode === 'scm' && <p className="small">{t('ad_nc_scm_hint')}</p>}
          {d.newCode === 'version' && <label>{t('ad_nc_version_tag')}<input value={d.newCodeVersion} placeholder="v1.2.0" onChange={(e) => set({ newCodeVersion: e.target.value })} /></label>}
          {d.newCode === 'version' && <p className="small">{t('ad_nc_version_hint')}</p>}
          {d.newCode === 'analysis' && <label>{t('ad_nc_analysis')}<IconSelect value={d.newCodeAnalysis} options={analysisOptions} onChange={(v) => set({ newCodeAnalysis: v })} /></label>}
          {project && <div className="form-field"><span>{t('ad_nc_scope')}</span><Toggle checked={d.projectNewCode} label={t('ad_nc_project_only')} icon="folder" onChange={(v) => set({ projectNewCode: v })} /></div>}
          <div className="form-field"><span>{t('ad_approval')}</span><Toggle checked={d.approvalRequired} label={t('ad_approval_required')} icon="check" onChange={(v) => set({ approvalRequired: v })} /></div>
          {d.approvalRequired && <div className="form-field"><span /><Toggle checked={d.selfApproval} label={t('ad_self_approval')} icon="user" onChange={(v) => set({ selfApproval: v })} /></div>}
          <div className="form-field"><span>{t('ad_auto_assign')}</span><Toggle checked={d.autoAssign} label={t('ad_auto_assign_label')} icon="user" onChange={(v) => set({ autoAssign: v })} /></div>
        </div>
      </section>
      <section className="panel">
        <h3 className="sub-title"><Icon name="scale" size={15} /> {t('ad_license_policy')}</h3>
        <p className="small">{t('ad_license_hint')}</p>
        <div className="form-grid three">
          <label>{t('sca_verdict_allowed')}<textarea value={d.allowed} placeholder={'MIT\nApache-2.0'} onChange={(e) => set({ allowed: e.target.value })} /></label>
          <label>{t('sca_verdict_review')}<textarea value={d.review} placeholder={'LGPL-2.1-only'} onChange={(e) => set({ review: e.target.value })} /></label>
          <label>{t('sca_verdict_denied')}<textarea value={d.denied} placeholder={'AGPL-3.0-only'} onChange={(e) => set({ denied: e.target.value })} /></label>
        </div>
        <label className="form-row">{t('ad_internal')}<textarea value={d.internal} placeholder={'@mycorp/*\n/^corp-/'} onChange={(e) => set({ internal: e.target.value })} /></label>
      </section>
      <section className="panel">
        <h3 className="sub-title"><Icon name="cpu" size={15} /> {t('ad_cfamily')}{project ? ` · ${project.name}` : ''}</h3>
        <div className="form-grid single">
          <label>{t('ad_target')}<IconSelect value={d.cTarget} options={targetOptions} onChange={(v) => set({ cTarget: v })} /></label>
          <label>{t('ad_include_dirs')}<textarea value={d.includeDirs} disabled={!project} placeholder={'include\nthird_party/lib/include'} onChange={(e) => set({ includeDirs: e.target.value })} /></label>
          <label>{t('ad_defines')}<textarea value={d.defines} disabled={!project} placeholder={'NDEBUG\nBOARD_REV=3'} onChange={(e) => set({ defines: e.target.value })} /></label>
        </div>
      </section>
      <div className="settings-actions">
        {note && <span className="small">{note}</span>}
        <BtnGroup>
          <Btn icon="save" label={t('save')} primary onClick={save} />
          <Btn icon="refresh" label={t('ad_reset')} onClick={() => { setD(init()); setNote(''); }} />
        </BtnGroup>
      </div>
    </div>
  );
}
