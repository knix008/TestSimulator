// Administration › Integrations: base URL, SMTP, LDAP, issue trackers, ALM
// (pull request decoration) and the signed-in user's mail notifications.
// Secrets arrive masked; sending the mask back unchanged keeps the stored one.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Chrome';
import { Btn, BtnGroup, IconSelect, Toggle, Stepper, Empty, errorText } from './common';

export const MASK = '••••••••';

export const NOTIFY_EVENTS = [
  ['gate-changed', 'gate'],
  ['issues-assigned', 'user'],
  ['defect-high-impact', 'alert'],
  ['exception-pending', 'hourglass'],
  ['exception-approved', 'thumbsUp'],
  ['exception-rejected', 'xCircle'],
  ['scan-failed', 'xCircle'],
];

// Field schema: [key, labelKey, type, extra]
const TRACKERS = {
  jira: { label: 'Jira', icon: 'bug', fields: [
    ['baseUrl', 'in_base_url', 'text', 'https://example.atlassian.net'],
    ['apiVersion', 'in_api_version', 'select', [{ value: 3, label: 'REST v3 (Cloud)', icon: 'globe' }, { value: 2, label: 'REST v2 (Server / DC)', icon: 'cpu' }]],
    ['projectKey', 'in_project_key', 'text', 'PROJ'],
    ['issueType', 'in_issue_type', 'text', 'Bug'],
    ['email', 'in_email', 'text', 'me@example.com'],
    ['apiToken', 'in_api_token', 'secret'],
    ['pat', 'in_pat', 'secret'],
  ] },
  redmine: { label: 'Redmine', icon: 'bug', fields: [
    ['baseUrl', 'in_base_url', 'text', 'https://redmine.example.com'],
    ['apiKey', 'in_api_key', 'secret'],
    ['projectId', 'in_project_id', 'text', 'my-project'],
    ['trackerId', 'in_tracker_id', 'text', '1'],
  ] },
  github: { label: 'GitHub Issues', icon: 'branch', fields: [
    ['apiUrl', 'in_api_url', 'text', 'https://api.github.com'],
    ['owner', 'in_owner', 'text', 'my-org'],
    ['repo', 'in_repo', 'text', 'my-repo'],
    ['token', 'in_token', 'secret'],
  ] },
  gitlab: { label: 'GitLab Issues', icon: 'branch', fields: [
    ['baseUrl', 'in_base_url', 'text', 'https://gitlab.com'],
    ['projectId', 'in_project_id', 'text', '12345'],
    ['token', 'in_token', 'secret'],
  ] },
};

const ALM = {
  github: { label: 'GitHub', icon: 'branch', fields: [
    ['apiUrl', 'in_api_url', 'text', 'https://api.github.com'],
    ['owner', 'in_owner', 'text', 'my-org'],
    ['repo', 'in_repo', 'text', 'my-repo'],
    ['token', 'in_token', 'secret'],
  ] },
  gitlab: { label: 'GitLab', icon: 'branch', fields: [
    ['baseUrl', 'in_base_url', 'text', 'https://gitlab.com'],
    ['projectId', 'in_project_id', 'text', '12345'],
    ['token', 'in_token', 'secret'],
  ] },
  azure: { label: 'Azure DevOps', icon: 'branch', fields: [
    ['organization', 'in_organization', 'text', 'my-org'],
    ['project', 'in_project', 'text', 'MyProject'],
    ['repositoryId', 'in_repository_id', 'text', 'my-repo'],
    ['token', 'in_token', 'secret'],
  ] },
  bitbucket: { label: 'Bitbucket', icon: 'branch', fields: [
    ['flavor', 'in_flavor', 'select', [{ value: 'cloud', label: 'Bitbucket Cloud', icon: 'globe' }, { value: 'server', label: 'Bitbucket Server / DC', icon: 'cpu' }]],
    ['apiUrl', 'in_api_url', 'text', 'https://api.bitbucket.org/2.0', (c) => (c.flavor || 'cloud') === 'cloud'],
    ['baseUrl', 'in_base_url', 'text', 'https://bitbucket.example.com', (c) => c.flavor === 'server'],
    ['workspace', 'in_workspace', 'text', 'my-workspace', (c) => (c.flavor || 'cloud') === 'cloud'],
    ['projectKey', 'in_project_key', 'text', 'PROJ', (c) => c.flavor === 'server'],
    ['repo', 'in_repo', 'text', 'my-repo'],
    ['token', 'in_token', 'secret'],
  ] },
};

function isBlank(obj) {
  return !obj || Object.values(obj).every((v) => v === '' || v == null || (Array.isArray(v) && !v.length));
}

function Field({ field, value, onChange }) {
  const [key, labelKey, type, extra] = field;
  if (type === 'select') {
    return <label>{t(labelKey)}<IconSelect value={value ?? extra[0].value} options={extra} ariaLabel={t(labelKey)} onChange={(v) => onChange(key, v)} /></label>;
  }
  if (type === 'secret') {
    return (
      <label>{t(labelKey)}
        <input type="password" autoComplete="new-password" value={value || ''} placeholder={t('in_secret_ph')} title={value === MASK ? t('in_secret_kept') : undefined} onChange={(e) => onChange(key, e.target.value)} />
      </label>
    );
  }
  return <label>{t(labelKey)}<input value={value ?? ''} placeholder={extra || ''} onChange={(e) => onChange(key, e.target.value)} /></label>;
}

function ConnectionBox({ title, icon, conf, schema, onChange }) {
  useLanguage();
  const configured = !isBlank(conf);
  const shown = schema.fields.filter((f) => !f[4] || f[4](conf || {}));
  return (
    <div className={`conn-box ${configured ? 'on' : ''}`}>
      <div className="conn-head">
        <Icon name={icon} size={15} /><strong>{title}</strong>
        <span className={`status-pill tone-${configured ? 'ok' : 'muted'}`}><Icon name={configured ? 'checkCircle' : 'circleDot'} size={12} />{configured ? t('in_configured') : t('in_not_configured')}</span>
        <span className="spacer" />
        {configured && <Btn icon="trash" label={t('in_clear')} onClick={() => onChange(null)} />}
      </div>
      <div className="form-grid">
        {shown.map((f) => <Field key={f[0]} field={f} value={(conf || {})[f[0]]} onChange={(k, v) => onChange({ ...(conf || {}), [k]: v })} />)}
      </div>
    </div>
  );
}

export function IntegrationsPanel({ projects }) {
  useLanguage();
  const [cfg, setCfg] = useState(null);
  const [groupMap, setGroupMap] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [testTo, setTestTo] = useState('');
  const [test, setTest] = useState({});
  const [section, setSection] = useState('base');
  const load = async () => {
    setError('');
    try {
      const c = await call('integrations.get');
      setCfg(c || {});
      setGroupMap(c && c.ldap && c.ldap.groupMap ? JSON.stringify(c.ldap.groupMap, null, 2) : '');
    } catch (err) { setError(errorText(err)); setCfg({}); }
  };
  useEffect(() => { load(); }, []);
  if (!cfg) return <Empty icon="hourglass" text={t('loading')} />;
  const smtp = cfg.smtp || {};
  const ldap = cfg.ldap || {};
  const setPart = (name, patch) => setCfg({ ...cfg, [name]: { ...(cfg[name] || {}), ...patch } });
  const setSub = (group, kind, value) => {
    const next = { ...(cfg[group] || {}) };
    if (value == null) delete next[kind]; else next[kind] = value;
    setCfg({ ...cfg, [group]: next });
  };
  const save = async () => {
    setError('');
    setNote('');
    let map;
    try { map = groupMap.trim() ? JSON.parse(groupMap) : {}; } catch (err) { setError(`${t('in_group_map')}: ${err.message}`); return; }
    const clean = (group) => Object.fromEntries(Object.entries(cfg[group] || {}).filter(([, v]) => !isBlank(v)));
    const out = { ...cfg, ldap: { ...ldap, groupMap: map }, trackers: clean('trackers'), alm: clean('alm') };
    try {
      const saved = await call('integrations.save', { integrations: out });
      setCfg(saved);
      setNote(t('in_saved'));
    } catch (err) { setError(errorText(err)); }
  };
  const runTest = async (id, method, args) => {
    setTest({ ...test, [id]: { busy: true } });
    try {
      const r = await call(method, args || {});
      setTest((x) => ({ ...x, [id]: { ok: r && r.ok !== false, text: JSON.stringify(r) } }));
    } catch (err) { setTest((x) => ({ ...x, [id]: { ok: false, text: errorText(err) } })); }
  };
  const TestResult = ({ id }) => {
    const r = test[id];
    if (!r) return null;
    if (r.busy) return <span className="small"><Icon name="spinner" size={13} className="spin" /> {t('in_testing')}</span>;
    return <span className={`status-pill tone-${r.ok ? 'ok' : 'bad'}`} title={r.text}><Icon name={r.ok ? 'checkCircle' : 'xCircle'} size={12} />{r.ok ? t('in_test_ok') : t('in_test_failed')}</span>;
  };
  const sections = [
    { id: 'base', label: t('in_sec_base'), icon: 'link' },
    { id: 'smtp', label: 'SMTP', icon: 'webhook' },
    { id: 'ldap', label: 'LDAP', icon: 'users' },
    { id: 'trackers', label: t('in_sec_trackers'), icon: 'bug' },
    { id: 'alm', label: t('in_sec_alm'), icon: 'branch' },
    { id: 'notify', label: t('in_sec_notify'), icon: 'inbox' },
  ];
  return (
    <div className="view integrations">
      <div className="type-tabs">
        {sections.map((s) => (
          <button key={s.id} type="button" className={`type-tab ${section === s.id ? 'on' : ''}`} aria-pressed={section === s.id} onClick={() => setSection(s.id)}>
            <Icon name={s.icon} size={15} /><span>{s.label}</span>
            {s.id === 'smtp' && smtp.enabled && <Icon name="checkCircle" size={12} className="ok" />}
            {s.id === 'ldap' && ldap.enabled && <Icon name="checkCircle" size={12} className="ok" />}
          </button>
        ))}
      </div>
      {error && <p className="small bad">{error}</p>}
      {section === 'base' && (
        <section className="panel">
          <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name="link" size={15} />{t('in_sec_base')}</h3>
          <p className="small">{t('in_base_hint')}</p>
          <div className="form-grid">
            <label className="span2">{t('in_base_url')}<input value={cfg.baseUrl || ''} placeholder="https://checker.example.com" onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} /></label>
          </div>
        </section>
      )}
      {section === 'smtp' && (
        <section className="panel">
          <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name="webhook" size={15} />SMTP</h3>
          <p className="small">{t('in_smtp_hint')}</p>
          <Toggle checked={!!smtp.enabled} label={t('in_enabled')} icon="check" onChange={(v) => setPart('smtp', { enabled: v })} />
          <div className="form-grid">
            <label>{t('in_host')}<input value={smtp.host || ''} placeholder="smtp.example.com" onChange={(e) => setPart('smtp', { host: e.target.value })} /></label>
            <div className="form-field"><span>{t('in_port')}</span><Stepper value={Number(smtp.port) || 587} min={1} max={65535} ariaLabel={t('in_port')} onChange={(v) => setPart('smtp', { port: v })} /></div>
            <label>{t('in_secure')}<IconSelect value={smtp.secure || 'starttls'} ariaLabel={t('in_secure')} onChange={(v) => setPart('smtp', { secure: v })}
              options={[{ value: 'starttls', label: 'STARTTLS', icon: 'lock' }, { value: 'tls', label: 'TLS (SMTPS)', icon: 'lock' }, { value: 'none', label: t('in_secure_none'), icon: 'unlock' }]} /></label>
            <label>{t('in_user')}<input value={smtp.user || ''} autoComplete="off" onChange={(e) => setPart('smtp', { user: e.target.value })} /></label>
            <Field field={['pass', 'in_password', 'secret']} value={smtp.pass} onChange={(k, v) => setPart('smtp', { [k]: v })} />
            <label>{t('in_from')}<input value={smtp.from || ''} placeholder="checker@example.com" onChange={(e) => setPart('smtp', { from: e.target.value })} /></label>
          </div>
          <div className="test-row">
            <Btn icon="refresh" label={t('in_test_connection')} onClick={() => runTest('smtp', 'integrations.testSmtp')} title={t('in_test_save_first')} />
            <TestResult id="smtp" />
            <span className="spacer" />
            <input value={testTo} placeholder={t('in_test_to')} aria-label={t('in_test_to')} onChange={(e) => setTestTo(e.target.value)} />
            <Btn icon="upload" label={t('in_send_test')} disabled={!testTo.trim()} onClick={() => runTest('mail', 'integrations.testSmtp', { to: testTo.trim() })} />
            <TestResult id="mail" />
          </div>
        </section>
      )}
      {section === 'ldap' && (
        <section className="panel">
          <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name="users" size={15} />LDAP</h3>
          <p className="small">{t('in_ldap_hint')}</p>
          <div className="toggle-row">
            <Toggle checked={!!ldap.enabled} label={t('in_enabled')} icon="check" onChange={(v) => setPart('ldap', { enabled: v })} />
            <Toggle checked={!!ldap.startTls} label="StartTLS" icon="lock" onChange={(v) => setPart('ldap', { startTls: v })} />
          </div>
          <div className="form-grid">
            <label className="span2">{t('in_ldap_url')}<input value={ldap.url || ''} placeholder="ldaps://ldap.example.com:636" onChange={(e) => setPart('ldap', { url: e.target.value })} /></label>
            <label className="span2">{t('in_bind_dn')}<input value={ldap.bindDn || ''} placeholder="cn=reader,dc=example,dc=com" onChange={(e) => setPart('ldap', { bindDn: e.target.value })} /></label>
            <Field field={['bindPassword', 'in_password', 'secret']} value={ldap.bindPassword} onChange={(k, v) => setPart('ldap', { [k]: v })} />
            <label className="span2">{t('in_base_dn')}<input value={ldap.baseDn || ''} placeholder="ou=people,dc=example,dc=com" onChange={(e) => setPart('ldap', { baseDn: e.target.value })} /></label>
            <label className="span2">{t('in_user_filter')}<input className="mono" value={ldap.userFilter || ''} placeholder="(uid={login})" onChange={(e) => setPart('ldap', { userFilter: e.target.value })} /></label>
            <label className="span2">{t('in_default_groups')}<input value={(ldap.defaultGroups || []).join(', ')} placeholder="users" onChange={(e) => setPart('ldap', { defaultGroups: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
            <label className="span4">{t('in_group_map')}<textarea className="mono" value={groupMap} placeholder={'{\n  "cn=devs,ou=groups,dc=example,dc=com": "developers"\n}'} onChange={(e) => setGroupMap(e.target.value)} /></label>
          </div>
          <div className="test-row">
            <Btn icon="refresh" label={t('in_test_connection')} onClick={() => runTest('ldap', 'integrations.testLdap')} title={t('in_test_save_first')} />
            <TestResult id="ldap" />
          </div>
        </section>
      )}
      {section === 'trackers' && (
        <section className="panel">
          <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name="bug" size={15} />{t('in_sec_trackers')}</h3>
          <p className="small">{t('in_trackers_hint')}</p>
          {Object.entries(TRACKERS).map(([kind, schema]) => (
            <ConnectionBox key={kind} title={schema.label} icon={schema.icon} schema={schema} conf={(cfg.trackers || {})[kind]} onChange={(v) => setSub('trackers', kind, v)} />
          ))}
        </section>
      )}
      {section === 'alm' && (
        <section className="panel">
          <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name="branch" size={15} />{t('in_sec_alm')}</h3>
          <p className="small">{t('in_alm_hint')}</p>
          {Object.entries(ALM).map(([kind, schema]) => (
            <ConnectionBox key={kind} title={schema.label} icon={schema.icon} schema={schema} conf={(cfg.alm || {})[kind]} onChange={(v) => setSub('alm', kind, v)} />
          ))}
        </section>
      )}
      {section === 'notify' && <NotifyBox subscriptions={cfg.subscriptions || []} projects={projects} />}
      {section !== 'notify' && (
        <div className="settings-actions" style={{ marginTop: 12 }}>
          {note && <span className="small ok"><Icon name="checkCircle" size={13} /> {note}</span>}
          <BtnGroup>
            <Btn icon="save" label={t('save')} primary onClick={save} />
            <Btn icon="refresh" label={t('ad_reset')} onClick={load} />
          </BtnGroup>
        </div>
      )}
    </div>
  );
}

// The signed-in user's own mail subscription.
export function NotifyBox({ subscriptions, projects }) {
  useLanguage();
  const [login, setLogin] = useState(null);
  const [email, setEmail] = useState('');
  const [events, setEvents] = useState(['gate-changed', 'issues-assigned']);
  const [chosen, setChosen] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    call('security.me').then((me) => {
      const who = (me && me.login) || 'admin';
      setLogin(who);
      const mine = (subscriptions || []).find((s) => s.login === who);
      if (mine) { setEmail(mine.email || ''); setEvents(mine.events || []); setChosen(mine.projects || []); }
    }).catch(() => setLogin('admin'));
  }, [subscriptions]);
  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const save = async (remove) => {
    setError('');
    try {
      await call('notify.subscribe', remove ? { remove: true } : { email: email.trim(), events, projects: chosen, lang: getLanguage() });
      setNote(remove ? t('nt_removed') : t('nt_saved'));
      if (remove) { setEvents([]); setChosen([]); }
    } catch (err) { setError(errorText(err)); }
  };
  return (
    <section className="panel">
      <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name="inbox" size={15} />{t('in_sec_notify')}{login ? <span className="small"> · {login}</span> : null}</h3>
      <p className="small">{t('nt_hint')}</p>
      <div className="form-grid">
        <label className="span2">{t('in_email')}<input value={email} placeholder="me@example.com" onChange={(e) => setEmail(e.target.value)} /></label>
      </div>
      <h4 className="sub-title"><Icon name="list" size={14} />{t('nt_events')}</h4>
      <div className="toggle-grid">
        {NOTIFY_EVENTS.map(([id, icon]) => <Toggle key={id} checked={events.includes(id)} icon={icon} label={t(`nt_ev_${id.replace(/-/g, '_')}`)} onChange={() => toggle(events, setEvents, id)} />)}
      </div>
      <h4 className="sub-title"><Icon name="folder" size={14} />{t('nt_projects')}</h4>
      <p className="small">{t('nt_projects_hint')}</p>
      <div className="toggle-grid">
        {projects.map((p) => <Toggle key={p.id} checked={chosen.includes(p.id)} icon="folder" label={p.name} onChange={() => toggle(chosen, setChosen, p.id)} />)}
        {!projects.length && <span className="small">—</span>}
      </div>
      {error && <p className="small bad">{error}</p>}
      <div className="settings-actions" style={{ marginTop: 12 }}>
        {note && <span className="small ok"><Icon name="checkCircle" size={13} /> {note}</span>}
        <BtnGroup>
          <Btn icon="save" label={t('nt_subscribe')} primary disabled={!email.trim() || !events.length} onClick={() => save(false)} />
          <Btn icon="trash" label={t('nt_unsubscribe')} onClick={() => save(true)} />
        </BtnGroup>
      </div>
    </section>
  );
}
