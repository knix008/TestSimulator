import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, setLanguage, getLanguage } from './lib/i18n';
import { applyTheme, setCustomThemes, nextThemeId, themeById } from './themes';
import { call, pickFolder, quitApp, setUserToken, hasUserToken } from './lib/backend';
import { MenuBar, Toolbar, StatusBar, Dialog, SideNav } from './components/Chrome';
import {
  StartPage, Overview, IssueBrowser, Hotspots, Measures, CodeView, Duplications,
  Activity, RulesView, ProfilesView, GatesView, Portfolios, Tasks,
  SEV, TYPE_ICON, SEV_ICON,
} from './views/Panels';
import { DefectsView, StreamsView, ComponentsEditor, PoliciesEditor, ModelsEditor } from './views/Coverity';
import { ComplianceView, MisraView } from './views/Compliance';
import { ReportsView } from './views/Reports';
import { ScaView } from './views/Sca';
import { HistoryView } from './views/History';
import { PullRequestView } from './views/PullRequest';
import { AdminView } from './views/Admin';
import { DastView } from './views/Dast';
import { IconSelect, Stepper, Btn, BtnGroup, Toggle, sevLabel, typeLabel } from './views/common';
import { ToolOfferDialog, ToolsDialog } from './views/Tools';
import { Icon } from './components/Chrome';

const EMPTY_FILTER = { q: '', severity: '', type: '', status: '', newOnly: false, engine: '', standard: '', rules: null, keys: null, drillLabel: '' };

export default function App() {
  useLanguage();
  const [ready, setReady] = useState(false);
  const [ws, setWs] = useState(null);
  const [rules, setRules] = useState([]);
  const [view, setView] = useState('start');
  // view to return to when the Start toggle is released
  const viewBeforeStart = useRef('overview');
  const [branch, setBranch] = useState('main');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(null);
  const [pathDraft, setPathDraft] = useState('');
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [codeFile, setCodeFile] = useState('');
  const [codeText, setCodeText] = useState('');
  const [error, setError] = useState('');
  const [desktop, setDesktop] = useState(null);
  // Permissions on and nobody signed in: show the login screen.
  const [needLogin, setNeedLogin] = useState(false);
  const [bootCount, setBootCount] = useState(0);
  // Required software offered once after the workspace loads (tools.offers).
  const [toolOffers, setToolOffers] = useState(null);
  const offersAsked = useRef(false);
  const [adminTab, setAdminTab] = useState(null);

  const allRules = useMemo(() => {
    const custom = (ws && ws.customRules || []).map((r) => ({
      ...r,
      langs: r.langs || ['*'],
      why: r.why || r.name,
      fix: r.fix || { ko: '', en: '' },
      tags: r.tags || ['custom'],
    }));
    return [...rules, ...custom];
  }, [rules, ws]);

  const project = useMemo(() => {
    if (!ws) return null;
    return (ws.projects || []).find((p) => p.id === ws.activeProjectId) || null;
  }, [ws]);

  const storedAnalysis = useMemo(() => {
    if (!project || !project.branches) return null;
    const b = project.branches[branch] || project.branches[project.mainBranch || 'main'];
    return b && b.latest ? b.latest : null;
  }, [project, branch]);
  const analysis = desktop || storedAnalysis;

  const history = useMemo(() => {
    if (!project || !project.branches) return [];
    const b = project.branches[branch] || project.branches[project.mainBranch || 'main'];
    return (b && b.history) || [];
  }, [project, branch]);

  const applyWorkspace = useCallback((data) => {
    const settings = data.settings || {};
    setCustomThemes(settings.customThemes || []);
    applyTheme(settings.theme || 'midnight');
    setLanguage(settings.language || 'ko');
    setWs(data);
    const current = (data.projects || []).find((p) => p.id === data.activeProjectId);
    if (current) {
      const name = current.mainBranch || 'main';
      setBranch(name);
      if (settings.showStartOnLaunch === false && current.branches && current.branches[name] && current.branches[name].latest) setView('overview');
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [data, catalog] = await Promise.all([call('workspace.load'), call('rules.list')]);
        if (cancel) return;
        setRules(catalog);
        setNeedLogin(false);
        applyWorkspace(data);
      } catch (err) {
        if (cancel) return;
        if (err.code === 'UNAUTHORIZED') { setUserToken(''); setNeedLogin(true); }
        else setError(err.message);
      } finally {
        if (!cancel) setReady(true);
      }
    })();
    return () => { cancel = true; };
  }, [applyWorkspace, bootCount]);

  // After the workspace is in, offer missing recommended software once.
  // Nothing is installed here; the dialog asks for each tool.
  useEffect(() => {
    if (!ready || !ws || needLogin || offersAsked.current) return;
    offersAsked.current = true;
    call('tools.offers').then((list) => { if (Array.isArray(list) && list.length) setToolOffers(list); }).catch(() => {});
  }, [ready, ws, needLogin]);

  // Views ask for menu actions (open folder, sample, analyze…) with an event.
  const actionRef = useRef(null);
  useEffect(() => {
    const onAct = (e) => { if (actionRef.current && e.detail) actionRef.current(e.detail); };
    window.addEventListener('mcc-action', onAct);
    return () => window.removeEventListener('mcc-action', onAct);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => { setUserToken(''); setNeedLogin(true); };
    window.addEventListener('mcc-unauthorized', onUnauthorized);
    return () => window.removeEventListener('mcc-unauthorized', onUnauthorized);
  }, []);

  const signOut = async () => {
    try { await call('security.logout'); } catch { /* token already gone */ }
    setUserToken('');
    setWs(null);
    setNeedLogin(true);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setDialog(null);
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); onAction('openFolder'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onAction('analyze'); }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); setDialog({ kind: 'settings' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const persist = async (next) => {
    const saved = await call('workspace.save', { workspace: next });
    setWs(saved);
    return saved;
  };

  const reload = async () => {
    const data = await call('workspace.load');
    setWs(data);
    return data;
  };

  const scan = async (path, extra = {}) => {
    const commit = extra.commit !== false;
    setBusy(true);
    setMessage(t('analyzing'));
    try {
      const res = await call(path ? 'project.scan' : 'project.sample', path ? { path, branch, ...extra, commit } : { branch, commit });
      const data = await reload();
      setWs(data);
      setSelected(null);
      if (!commit) {
        const id = (res.project && res.project.id) || data.activeProjectId;
        const current = (data.projects || []).find((p) => p.id === id);
        setDesktop((current && current.desktop) || res.analysis);
        setView('defects');
        setMessage(t('desktop_ready'));
      } else {
        setDesktop(null);
        setView('overview');
        const policy = res.analysis.coverity && res.analysis.coverity.policy;
        const gateBad = res.analysis.qualityGate.status !== 'OK';
        const policyBad = policy && policy.status === 'ERROR';
        setMessage(gateBad ? t('gate_bad') : policyBad ? t('cov_policy_bad') : t('gate_ok'));
      }
    } catch (err) {
      setMessage(err.message || t('folder_missing'));
      setDialog({ kind: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const openFolder = async () => {
    const picked = await pickFolder();
    if (picked) { scan(picked); return; }
    setPathDraft(project ? project.path : '');
    setDialog({ kind: 'path' });
  };

  const exportReport = async (format) => {
    if (!project) return;
    const res = await call('report.build', { projectId: project.id, branch, format, language: getLanguage() });
    const blob = new Blob([res.body], { type: res.type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const ext = format === 'sarif' ? 'sarif.json' : format === 'badge' ? 'svg' : format;
    a.download = `${project.key || 'report'}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onReview = async (keys, action, extra = {}) => {
    if (!project) return;
    try {
      await call('issue.review', { projectId: project.id, keys, action, ...extra });
    } catch (err) { setMessage(err.message); return; }
    const data = await reload();
    const current = (data.projects || []).find((p) => p.id === project.id);
    const b = current && current.branches && (current.branches[branch] || current.branches[current.mainBranch || 'main']);
    const fresh = b && b.latest && (b.latest.issues || []).find((i) => i.key === keys[0]);
    if (fresh) setSelected(fresh);
  };

  const onUpdate = async (keys, patch, cids) => {
    if (!project) return;
    await call('issue.update', { projectId: project.id, keys, patch, cids });
    const data = await reload();
    if (desktop) {
      const current = (data.projects || []).find((p) => p.id === project.id);
      setDesktop(current && current.desktop ? current.desktop : null);
    }
    const current = (data.projects || []).find((p) => p.id === project.id);
    const b = current && current.branches && current.branches[branch];
    const next = b && b.latest && b.latest.issues.find((i) => i.key === (selected && selected.key));
    if (next) setSelected(next);
  };

  const openCode = async (file) => {
    if (!project) return;
    setView('code');
    setCodeFile(file);
    try {
      const res = await call('project.file', { projectId: project.id, file });
      setCodeText(res.text);
    } catch (err) {
      setCodeText(err.message);
    }
  };

  const onAction = async (id) => {
    if (id === 'showStart') {
      if (view === 'start') setView(viewBeforeStart.current);
      else { viewBeforeStart.current = view; setView('start'); }
    }
    else if (id === 'openFolder') openFolder();
    else if (id === 'openSample') scan('');
    else if (id === 'analyze') { if (project) scan(project.path); else openFolder(); }
    else if (id === 'desktop') { if (project) scan(project.path, { commit: false }); else openFolder(); }
    else if (id === 'settings') setDialog({ kind: 'settings' });
    else if (id === 'about') setDialog({ kind: 'about' });
    else if (id === 'help') setDialog({ kind: 'help' });
    else if (id === 'shortcuts') setDialog({ kind: 'shortcuts' });
    else if (id === 'customRule') setDialog({ kind: 'custom' });
    else if (id === 'tools') setDialog({ kind: 'tools' });
    else if (id === 'adminTools') { setAdminTab('tools'); setView('admin'); }
    else if (id === 'quit') quitApp();
    else if (id === 'signOut') signOut();
    else if (id === 'nextTheme') patchSettings({ theme: nextThemeId(ws.settings.theme) });
    else if (id === 'toggleLanguage') patchSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' });
    else if (id.startsWith('theme:')) patchSettings({ theme: id.slice(6) });
    else if (id.startsWith('view:')) setView(id.slice(5));
    else if (id.startsWith('export:')) exportReport(id.slice(7));
    else if (id.startsWith('issues:')) { setFilter({ ...EMPTY_FILTER, type: id.slice(7) }); setView('issues'); }
  };
  actionRef.current = onAction;

  const patchSettings = async (patch) => {
    if (!ws) return;
    const next = { ...ws, settings: { ...ws.settings, ...patch } };
    if (patch.theme) applyTheme(patch.theme);
    if (patch.language) { setLanguage(patch.language); setMessage(''); }
    if (patch.customThemes) setCustomThemes(patch.customThemes);
    await persist(next);
  };

  const menus = [
    { id: 'file', labelKey: 'menu_file', icon: 'folder', items: () => [
      { id: 'openFolder', label: t('open_folder'), icon: 'folder', keys: 'Ctrl+O' },
      { id: 'openSample', label: t('open_sample'), icon: 'play' },
      { sep: true },
      { id: 'view:reports', label: t('menu_reports'), icon: 'report' },
      { sep: true },
      { id: 'export:json', label: t('export_json'), icon: 'download' },
      { id: 'export:sarif', label: t('export_sarif'), icon: 'download' },
      { id: 'export:html', label: t('export_html'), icon: 'globe' },
      { id: 'export:csv', label: t('export_csv'), icon: 'list' },
      { id: 'export:badge', label: t('export_badge'), icon: 'star' },
      { id: 'export:defects', label: t('export_defects'), icon: 'alert' },
      { sep: true },
      { id: 'quit', label: t('quit'), icon: 'close' },
    ] },
    { id: 'analyze', labelKey: 'menu_analyze', icon: 'play', items: () => [
      { id: 'desktop', label: t('cov_desktop'), icon: 'eye' },
      { id: 'analyze', label: t('cov_commit'), icon: 'play', keys: 'Ctrl+Enter' },
      { id: 'openSample', label: t('open_sample'), icon: 'package' },
      { sep: true },
      { id: 'view:pullrequest', label: t('menu_pullrequest'), icon: 'branch' },
      { id: 'view:dast', label: t('menu_dast'), icon: 'globe' },
    ] },
    { id: 'issues', labelKey: 'menu_issues', icon: 'bug', items: () => [
      { id: 'view:issues', label: t('all'), icon: 'list' },
      { id: 'issues:BUG', label: t('bugs'), icon: 'bug' },
      { id: 'issues:VULNERABILITY', label: t('vulns'), icon: 'unlock' },
      { id: 'issues:CODE_SMELL', label: t('smells'), icon: 'smell' },
      { id: 'view:hotspots', label: t('nav_hotspots'), icon: 'shield' },
    ] },
    { id: 'quality', labelKey: 'menu_quality', icon: 'gate', items: () => [
      { id: 'view:rules', label: t('nav_rules'), icon: 'search' },
      { id: 'view:profiles', label: t('nav_profiles'), icon: 'layers' },
      { id: 'view:gates', label: t('nav_gates'), icon: 'gate' },
      { id: 'view:portfolios', label: t('nav_portfolios'), icon: 'folder' },
      { sep: true },
      { id: 'view:compliance', label: t('menu_security_reports'), icon: 'lock' },
      { id: 'view:misra', label: t('menu_misra'), icon: 'shieldCheck' },
    ] },
    { id: 'view', labelKey: 'menu_view', icon: 'chart', items: () => [
      { id: 'view:overview', label: t('nav_overview'), icon: 'chart' },
      { id: 'view:measures', label: t('nav_measures'), icon: 'gauge' },
      { id: 'view:code', label: t('nav_code'), icon: 'code' },
      { id: 'view:duplications', label: t('nav_dup'), icon: 'copy' },
      { id: 'view:activity', label: t('nav_activity'), icon: 'clock' },
      { id: 'view:defects', label: t('nav_defects'), icon: 'alert' },
      { id: 'view:streams', label: t('nav_streams'), icon: 'layers' },
      { id: 'view:tasks', label: t('nav_tasks'), icon: 'hourglass' },
      { sep: true },
      { id: 'view:dependencies', label: t('menu_dependencies'), icon: 'package' },
      { id: 'view:snapshots', label: t('menu_snapshots'), icon: 'history' },
    ] },
    { id: 'tools', labelKey: 'menu_tools', icon: 'settings', items: () => [
      { id: 'settings', label: t('settings'), icon: 'settings', keys: 'Ctrl+,' },
      { id: 'customRule', label: t('custom_rule'), icon: 'plus' },
      { id: 'tools', label: t('tl_menu'), icon: 'installBox' },
      { sep: true },
      { id: 'view:admin', label: t('menu_admin'), icon: 'users' },
      ...(hasUserToken() ? [{ sep: true }, { id: 'signOut', label: t('sign_out'), icon: 'user' }] : []),
    ] },
    { id: 'help', labelKey: 'menu_help', icon: 'info', items: () => [
      { id: 'help', label: t('help'), icon: 'lightbulb' },
      { id: 'shortcuts', label: t('shortcuts'), icon: 'key' },
      { id: 'about', label: t('about'), icon: 'info' },
    ] },
  ];

  if (!ready) return <div className="boot">{t('loading')}</div>;
  if (needLogin) return <LoginScreen onDone={() => { setReady(false); setBootCount((n) => n + 1); }} />;
  if (error && !ws) return <div className="boot">{error}</div>;

  const branches = project && project.branches ? Object.keys(project.branches) : ['main'];
  const stamp = (storedAnalysis && storedAnalysis.finishedAt) || '';
  const drill = ({ rules: ruleKeys, keys, label }) => {
    setFilter({ ...EMPTY_FILTER, rules: ruleKeys, keys, drillLabel: label });
    setSelected(null);
    setView('issues');
  };
  if (branch && !branches.includes(branch)) branches.push(branch);

  // Side navigation badges: open issues, hotspots to review, outstanding
  // Coverity defects and exception requests waiting for approval.
  const allIssues = (analysis && analysis.issues) || [];
  const OPENISH = new Set(['OPEN', 'CONFIRMED', 'REOPENED']);
  const pendingReviews = allIssues.filter((i) => i.review && i.review.state === 'REQUESTED').length;
  const navCounts = {
    issues: [
      { n: allIssues.filter((i) => i.type !== 'SECURITY_HOTSPOT' && OPENISH.has(i.status)).length, tip: t('nav_tip_open') },
      { n: pendingReviews, tone: 'warn', tip: t('nav_tip_pending') },
    ],
    hotspots: { n: allIssues.filter((i) => i.type === 'SECURITY_HOTSPOT' && i.status === 'TO_REVIEW').length, tone: 'warn', tip: t('nav_tip_review') },
    defects: { n: allIssues.filter((i) => !(i.classification === 'False Positive' || i.classification === 'Intentional' || i.action === 'Ignore' || i.resolution === 'FALSE-POSITIVE' || i.resolution === 'WONTFIX')).length, tip: t('nav_tip_outstanding') },
    admin: { n: pendingReviews, tone: 'warn', tip: t('nav_tip_pending') },
  };

  return (
    <div className="app" onClick={() => {}}>
      <MenuBar menus={menus} onAction={onAction} theme={(ws.settings && ws.settings.theme) || 'midnight'} startActive={view === 'start'} />
      <Toolbar onAction={onAction} busy={busy} view={view} branch={branch} branches={branches} onBranch={(name) => { setDesktop(null); setBranch(name); }} />
      <div className="body-row">
        {view !== 'start' && <SideNav view={view} counts={navCounts} onView={(v) => { setAdminTab(null); setView(v); }} />}
        <main className="main">
          {view === 'start' && <StartPage showOnLaunch={ws.settings.showStartOnLaunch !== false} onShowOnLaunch={(v) => patchSettings({ showStartOnLaunch: v })} projects={ws.projects || []} onOpen={openFolder} onSample={() => scan('')} onRecent={async (p) => { await persist({ ...ws, activeProjectId: p.id }); setView('overview'); }} />}
          {view === 'overview' && <Overview analysis={analysis} onGo={onAction} />}
          {view === 'issues' && <IssueBrowser issues={(analysis && analysis.issues) || []} hasAnalysis={!!analysis} rules={allRules} filter={filter} setFilter={setFilter} selected={selected} onSelect={setSelected} checked={checked} setChecked={setChecked} onUpdate={onUpdate} onReview={onReview} approval={ws.settings.approval} />}
          {view === 'hotspots' && <Hotspots issues={(analysis && analysis.issues) || []} hasAnalysis={!!analysis} rules={allRules} onUpdate={onUpdate} />}
          {view === 'measures' && <Measures analysis={analysis} />}
          {view === 'code' && <CodeView analysis={analysis} file={codeFile} text={codeText} onOpen={openCode} />}
          {view === 'duplications' && <Duplications analysis={analysis} onOpen={openCode} />}
          {view === 'activity' && <Activity history={history} />}
          {view === 'rules' && <RulesView rules={allRules} onDeactivate={(key) => {
            const profiles = (ws.profiles || []).map((p) => p.language === '*' ? { ...p, inactive: [...new Set([...(p.inactive || []), key])] } : p);
            persist({ ...ws, profiles });
          }} />}
          {view === 'profiles' && <ProfilesView profiles={ws.profiles || []} rules={allRules} project={project} onReload={reload} onChange={(profiles) => persist({ ...ws, profiles })}
            onAssign={(language, profileId) => {
              const projects = (ws.projects || []).map((p) => {
                if (p.id !== project.id) return p;
                const chosen = { ...(p.profiles || {}) };
                if (profileId) chosen[language] = profileId; else delete chosen[language];
                return { ...p, profiles: chosen };
              });
              persist({ ...ws, projects });
            }} />}
          {view === 'gates' && <GatesView gates={ws.gates || []} project={project} onChange={(gates) => persist({ ...ws, gates })} onAssign={(gateId) => {
            const projects = ws.projects.map((p) => p.id === project.id ? { ...p, gateId } : p);
            persist({ ...ws, projects });
          }} />}
          {view === 'portfolios' && <Portfolios portfolios={ws.portfolios || []} projects={ws.projects || []} onChange={(portfolios) => persist({ ...ws, portfolios })} />}
          {view === 'tasks' && <Tasks tasks={ws.tasks || []} />}
          {view === 'defects' && <DefectsView analysis={analysis} onUpdate={onUpdate} />}
          {view === 'streams' && <StreamsView history={history} analysis={storedAnalysis} />}
          {view === 'components' && <ComponentsEditor components={(ws.coverity && ws.coverity.components) || []} onChange={(components) => persist({ ...ws, coverity: { ...ws.coverity, components } })} />}
          {view === 'policies' && <PoliciesEditor policies={(ws.coverity && ws.coverity.policies) || []} project={project} onChange={() => {}} onAssign={(policyId) => {
            if (!project) return;
            const projects = ws.projects.map((p) => p.id === project.id ? { ...p, policyId } : p);
            persist({ ...ws, projects });
          }} />}
          {view === 'compliance' && <ComplianceView project={project} branch={branch} stamp={stamp} onDrill={drill} />}
          {view === 'misra' && <MisraView project={project} branch={branch} stamp={stamp} onDrill={drill} />}
          {view === 'reports' && <ReportsView project={project} branch={branch} stamp={stamp} />}
          {view === 'dependencies' && <ScaView project={project} stamp={stamp} />}
          {view === 'snapshots' && <HistoryView project={project} branch={branch} stamp={stamp} />}
          {view === 'pullrequest' && <PullRequestView project={project} branch={branch} stamp={stamp} />}
          {view === 'dast' && <DastView />}
          {view === 'admin' && <AdminView ws={ws} project={project} branch={branch} onSaveWorkspace={persist} onWorkspaceChanged={reload} initialTab={adminTab} />}
          {view === 'models' && <ModelsEditor models={(ws.coverity && ws.coverity.models) || []} onChange={(models) => persist({ ...ws, coverity: { ...ws.coverity, models } })} />}
        </main>
      </div>
      <StatusBar project={project} analysis={analysis} message={message} />
      {dialog && dialog.kind === 'path' && (
        <Dialog title={t('open_folder')} icon="folder" onClose={() => setDialog(null)}>
          <label className="form-row">{t('path_label')}
            <input value={pathDraft} onChange={(e) => setPathDraft(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && pathDraft.trim()) { setDialog(null); scan(pathDraft); } }} />
          </label>
          <p className="small">{t('path_hint')}</p>
          <div className="dialog-actions">
            <BtnGroup>
              <Btn icon="play" label={t('run_analysis')} primary disabled={!pathDraft.trim()} onClick={() => { setDialog(null); scan(pathDraft); }} />
              <Btn icon="close" label={t('cancel')} onClick={() => setDialog(null)} />
            </BtnGroup>
          </div>
        </Dialog>
      )}
      {dialog && dialog.kind === 'error' && (
        <Dialog title={t('error_title')} icon="alert" onClose={() => setDialog(null)}>
          <p className="error-line"><Icon name="xCircle" size={18} /><span>{dialog.message}</span></p>
          <div className="dialog-actions"><Btn icon="check" label={t('ok')} primary onClick={() => setDialog(null)} /></div>
        </Dialog>
      )}
      {dialog && dialog.kind === 'about' && (
        <Dialog title="MyCodeChecker" icon="info" onClose={() => setDialog(null)}>
          <p>{t('about_body')}</p>
          <p className="small">SHKWON · {rules.length} rules · {themeById(ws.settings.theme).label}</p>
        </Dialog>
      )}
      {dialog && dialog.kind === 'help' && (
        <Dialog title={t('help')} icon="lightbulb" onClose={() => setDialog(null)} wide>
          <p>{t('help_body')}</p>
        </Dialog>
      )}
      {dialog && dialog.kind === 'shortcuts' && (
        <Dialog title={t('shortcuts')} icon="key" onClose={() => setDialog(null)}>
          <p>{t('shortcut_body')}</p>
        </Dialog>
      )}
      {dialog && dialog.kind === 'tools' && <ToolsDialog onClose={() => setDialog(null)} onChanged={reload} />}
      {toolOffers && !dialog && <ToolOfferDialog offers={toolOffers} onClose={() => setToolOffers(null)} onChanged={reload} />}
      {dialog && dialog.kind === 'settings' && (
        <SettingsDialog ws={ws} onClose={() => setDialog(null)} onSave={patchSettings} />
      )}
      {dialog && dialog.kind === 'custom' && (
        <CustomRuleDialog onClose={() => setDialog(null)} onSave={async (rule) => {
          await persist({ ...ws, customRules: [...(ws.customRules || []), rule] });
          setDialog(null);
          setMessage(t('custom_saved'));
        }} />
      )}
    </div>
  );
}

function SettingsDialog({ ws, onClose, onSave }) {
  useLanguage();
  const s = ws.settings;
  const [draft, setDraft] = useState({ ...s, exclusionsText: (s.exclusions || []).join('\n'), limits: { ...(s.limits || {}) } });
  const set = (patch) => setDraft({ ...draft, ...patch });
  return (
    <Dialog title={t('settings')} icon="settings" onClose={onClose} wide>
      <div className="form-row inline">
        <span className="form-label"><Icon name="globe" size={14} />{t('language')}</span>
        <IconSelect value={draft.language} onChange={(v) => set({ language: v })} width={200} ariaLabel={t('language')} options={[
          { value: 'ko', label: '한국어', icon: 'globe' },
          { value: 'en', label: 'English', icon: 'globe' },
        ]} />
      </div>
      <div className="form-row inline">
        <span className="form-label"><Icon name="home" size={14} />{t('start_nav')}</span>
        <Toggle icon="home" label={t('show_start_on_launch')} checked={draft.showStartOnLaunch !== false} onChange={(v) => set({ showStartOnLaunch: v })} />
      </div>
      <div className="form-row inline">
        <span className="form-label"><Icon name="sparkle" size={14} />{t('new_code_mode')}</span>
        <IconSelect value={draft.newCode || 'previous'} onChange={(v) => set({ newCode: v })} width={200} ariaLabel={t('new_code_mode')} options={[
          { value: 'previous', label: t('previous_analysis'), icon: 'history' },
          { value: 'days', label: t('number_of_days'), icon: 'calendar' },
          { value: 'scm', label: t('ad_nc_scm'), icon: 'branch' },
          { value: 'version', label: t('ad_nc_version'), icon: 'package' },
          { value: 'analysis', label: t('ad_nc_analysis'), icon: 'calendar' },
        ]} />
        <Stepper value={draft.newCodeDays ?? 30} min={1} max={3650} ariaLabel={t('number_of_days')} onChange={(v) => set({ newCodeDays: v })} />
        <span>{t('days')}</span>
      </div>
      <label className="form-row"><span className="form-label"><Icon name="filter" size={14} />{t('exclusions')}</span>
        <textarea value={draft.exclusionsText} onChange={(e) => set({ exclusionsText: e.target.value })} />
      </label>
      <label className="form-row"><span className="form-label"><Icon name="webhook" size={14} />{t('webhook')}</span>
        <input value={draft.webhookUrl || ''} onChange={(e) => set({ webhookUrl: e.target.value })} />
      </label>
      <label className="form-row inline"><span className="form-label"><Icon name="user" size={14} />{t('assignee')}</span>
        <input value={draft.assignee || ''} onChange={(e) => set({ assignee: e.target.value })} />
      </label>
      <div className="form-row inline">
        <span className="form-label"><Icon name="flow" size={14} />{t('limit_cognitive')}</span>
        <Stepper value={draft.limits.cognitive || 15} min={1} max={1000} ariaLabel={t('limit_cognitive')} onChange={(v) => set({ limits: { ...draft.limits, cognitive: v } })} />
      </div>
      <div className="form-row inline">
        <span className="form-label"><Icon name="list" size={14} />{t('limit_params')}</span>
        <Stepper value={draft.limits.parameters || 7} min={1} max={100} ariaLabel={t('limit_params')} onChange={(v) => set({ limits: { ...draft.limits, parameters: v } })} />
      </div>
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon="save" label={t('save')} primary onClick={() => onSave({
            language: draft.language,
            showStartOnLaunch: draft.showStartOnLaunch !== false,
            newCode: draft.newCode,
            newCodeDays: draft.newCodeDays,
            exclusions: draft.exclusionsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
            webhookUrl: draft.webhookUrl,
            assignee: draft.assignee,
            limits: draft.limits,
          }).then(onClose)} />
          <Btn icon="close" label={t('cancel')} onClick={onClose} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

function CustomRuleDialog({ onClose, onSave }) {
  useLanguage();
  const [draft, setDraft] = useState({ pattern: '', langs: ['*'], type: 'CODE_SMELL', severity: 'MAJOR', name: { ko: '', en: '' } });
  return (
    <Dialog title={t('custom_rule')} icon="plus" onClose={onClose}>
      <label className="form-row">{t('pattern')}<input value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} /></label>
      <label className="form-row">{t('name')}<input value={draft.name.ko} onChange={(e) => setDraft({ ...draft, name: { ko: e.target.value, en: e.target.value } })} /></label>
      <div className="form-row inline">
        <span className="form-label"><Icon name="layers" size={14} />{t('type')}</span>
        <IconSelect value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} width={220} ariaLabel={t('type')}
          options={['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].map((type) => ({ value: type, label: typeLabel(type), icon: TYPE_ICON[type] }))} />
      </div>
      <div className="form-row inline">
        <span className="form-label"><Icon name="alert" size={14} />{t('severity')}</span>
        <IconSelect value={draft.severity} onChange={(v) => setDraft({ ...draft, severity: v })} width={220} ariaLabel={t('severity')}
          options={SEV.map((s) => ({ value: s, label: sevLabel(s), icon: SEV_ICON[s] }))} />
      </div>
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon="save" label={t('save')} primary onClick={() => onSave({ ...draft, key: `custom:${Date.now().toString(36)}` })} />
          <Btn icon="close" label={t('cancel')} onClick={onClose} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

function LoginScreen({ onDone }) {
  useLanguage();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setFailed('');
    try {
      const res = await call('security.login', { login, password });
      setUserToken(res.token);
      onDone();
    } catch (err) {
      setFailed(err.code === 'UNAUTHORIZED' ? t('login_failed') : err.message);
    }
  };
  return (
    <div className="boot">
      <form className="panel login-panel" onSubmit={submit}>
        <h2 className="sub-title"><Icon name="lock" size={18} />{t('login_title')}</h2>
        <label className="form-row">{t('ad_login')}<input autoFocus value={login} onChange={(e) => setLogin(e.target.value)} /></label>
        <label className="form-row">{t('ad_password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {failed && <p className="small bad">{failed}</p>}
        <Btn icon="check" label={t('sign_in')} primary onClick={submit} />
      </form>
    </div>
  );
}
