import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, setLanguage, getLanguage } from './lib/i18n';
import { applyTheme, setCustomThemes, nextThemeId, themeById } from './themes';
import { call, pickFolder, setUserToken, hasUserToken, isDesktop, withIssuesFrom, withProjectIssues, missingIssues, loadProjectIssues } from './lib/backend';
import { MenuBar, Toolbar, StatusBar, Dialog, SideNav } from './components/Chrome';
import {
  Overview, IssueBrowser, Hotspots, Measures, CodeView, Duplications,
  Activity, RulesView, ProfilesView, GatesView, Portfolios, Tasks,
  SEV, TYPE_ICON, SEV_ICON,
} from './views/Panels';
import { DefectsView, StreamsView, ComponentsEditor, PoliciesEditor, ModelsEditor } from './views/DefectAnalysis';
import { ComplianceView, MisraView } from './views/Compliance';
import { ReportsView } from './views/Reports';
import { ScaView } from './views/Sca';
import { HistoryView } from './views/History';
import { PullRequestView } from './views/PullRequest';
import { AdminView } from './views/Admin';
import { DastView } from './views/Dast';
import { IconSelect, Stepper, Btn, BtnGroup, Toggle, sevLabel, typeLabel, statusLabel, saveText, ProjectCtx } from './views/common';
import { ToolOfferDialog, ToolsDialog } from './views/Tools';
import { HisView, ArchView, ApprovalsView } from './views/Insights';
import { Icon, NAV_GROUPS } from './components/Chrome';
import { StartPage } from './views/StartPage';
import { SettingsDialog } from './views/Settings';
import { PanelCtx, DockPanel, Splitter, panelsOf, PANEL_LIMITS } from './components/Layout';
import { BottomPanel } from './views/BottomPanel';
import { DocTabs, TabActiveCtx } from './components/DocTabs';
import { NewProjectDialog, OpenProjectDialog, pickProjectFile, projectErrorText, PROJECT_FILTER } from './views/ProjectFiles';
import { ExcludeDirsDialog } from './components/ExcludeDirs';
import { TermTip } from './components/TermTip';
import { ProgressHost } from './components/ProgressHost';
import { pickSavePath } from './lib/backend';
import { openDoc, docExists } from './lib/docs';
import { Tutorial } from './components/Tutorial';
import { AboutDialog, aboutSummary } from './views/About';
import { ScanProgress } from './views/ScanProgress';
import { UserGuide } from './components/UserGuide';
import { TutorialWelcome } from './components/TutorialWelcome';
import { progressPatch, shouldShowWelcome } from './lib/tutorialSettings';
import { usePopupWindows, openPopupWindow, onBroadcast, warmPopups, popupRoute } from './lib/popups';
import { ask, toast, attempt, showError, errorText as errorTextOf } from './lib/ui';
import { record, clearHistory, undo as historyUndo, redo as historyRedo, subscribeHistory, onHistoryApplied, typingTarget, historyState } from './lib/history';
import { projectSignature, subscribeDirty, dirtyEditors, listenChildEditors, saveEditors, useEditorDirty } from './lib/dirty';
import { UiHost } from './components/UiHost';
import { getCustomThemesRaw } from './themes';

const EMPTY_FILTER = { q: '', severity: '', type: '', status: '', newOnly: false, engine: '', standard: '', lang: '', rules: null, keys: null, drillLabel: '' };

// Undo / Redo of workspace edits made through persist(): the slices that
// changed (gates, profiles, portfolios, Defect Analysis, custom rules, settings
// such as panels or the start-page layout, and project settings) are kept
// before and after; undo / redo write them back onto the current workspace.
const HIST_TOP = ['gates', 'profiles', 'portfolios', 'defectAnalysis', 'customRules'];
const HIST_SETTINGS_SKIP = new Set(['tabs', 'theme', 'language', 'customThemes', 'tutorial', 'tutorialDone', 'showStartOnLaunch']);
const HIST_PROJECT = ['name', 'key', 'mainBranch', 'exclusions', 'excludeDirs', 'includeDirs', 'defines', 'coverageReports', 'arch', 'newCode', 'profiles', 'gateId', 'policyId', 'his', 'tags', 'description'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const panelsOn = (p) => ['left', 'right', 'bottom'].map((k) => !!(p && p[k] && p[k].on)).join();
function sliceDiff(prev, next) {
  if (!prev || !next) return null;
  const before = {};
  const after = {};
  for (const k of HIST_TOP) if (!same(prev[k], next[k])) { before[k] = prev[k]; after[k] = next[k]; }
  const ps = prev.settings || {};
  const ns = next.settings || {};
  for (const k of new Set([...Object.keys(ps), ...Object.keys(ns)])) {
    if (HIST_SETTINGS_SKIP.has(k) || same(ps[k], ns[k])) continue;
    // Panels: only showing / hiding counts (sizes, folding and tabs do not).
    if (k === 'panels' && panelsOn(ps.panels) === panelsOn(ns.panels)) continue;
    (before.settings = before.settings || {})[k] = ps[k];
    (after.settings = after.settings || {})[k] = ns[k];
  }
  const prevById = new Map((prev.projects || []).map((p) => [p.id, p]));
  for (const p of next.projects || []) {
    const q = prevById.get(p.id);
    if (!q) continue;
    for (const k of HIST_PROJECT) {
      if (same(q[k], p[k])) continue;
      ((before.projects = before.projects || {})[p.id] = before.projects[p.id] || {})[k] = q[k];
      ((after.projects = after.projects || {})[p.id] = after.projects[p.id] || {})[k] = p[k];
    }
  }
  return Object.keys(before).length ? { before, after } : null;
}
function applySlices(ws, slices) {
  const out = { ...ws };
  for (const k of HIST_TOP) if (k in slices) out[k] = slices[k];
  if (slices.settings) out.settings = { ...(ws.settings || {}), ...slices.settings };
  if (slices.projects) out.projects = (ws.projects || []).map((p) => (slices.projects[p.id] ? { ...p, ...slices.projects[p.id] } : p));
  return out;
}
function sliceLabel(d) {
  const b = d.before;
  if (b.gates) return t('hist_gates');
  if (b.profiles) return t('hist_profiles');
  if (b.portfolios) return t('hist_portfolios');
  if (b.defectAnalysis) return t('hist_defects');
  if (b.customRules) return t('hist_custom_rules');
  if (b.projects) {
    const fields = Object.values(b.projects).flatMap((x) => Object.keys(x));
    if (fields.includes('name')) return t('hist_project_name');
    if (fields.includes('exclusions') || fields.includes('excludeDirs')) return t('hist_exclusions');
    return t('hist_project_settings');
  }
  if (b.settings) {
    if ('panels' in b.settings) return t('hist_panels');
    if ('startBackground' in b.settings) return t('hist_start_layout');
    return t('hist_settings');
  }
  return t('hist_change');
}
// Fields of issue.update that can be put back.
const ISSUE_UNDO = ['status', 'resolution', 'assignee', 'owner', 'classification', 'action', 'triageSeverity', 'externalReference', 'tags'];
const NULLABLE = new Set(['resolution', 'assignee', 'owner', 'triageSeverity', 'externalReference']);
const normPath = (p) => String(p || '').split('\\').join('/').replace(/\/+$/, '').toLowerCase();
const osLanguage = () => (typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en');

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
  const [message, setMessageRaw] = useState('');
  // 출력 tab: every message shown in the status bar, with its time.
  const [messages, setMessages] = useState([]);
  const setMessage = (text, kind) => {
    setMessageRaw(text || '');
    if (text) setMessages((m) => [...m.slice(-299), { at: new Date().toISOString(), text: String(text), kind: kind || '' }]);
  };
  const [dialog, setDialog] = useState(null);
  const [pathDraft, setPathDraft] = useState('');
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [codeFile, setCodeFile] = useState('');
  const [codeText, setCodeText] = useState('');
  const [codeLine, setCodeLine] = useState(0);
  const [codeError, setCodeError] = useState('');
  // Start-page tiles: the standard a compliance / MISRA view opens on, and a language to filter by after the next analysis.
  const [stdPick, setStdPick] = useState(null);
  const langAfterScan = useRef('');
  const [error, setError] = useState('');
  const [desktop, setDesktop] = useState(null);
  // Permissions on and nobody signed in: show the login screen.
  const [needLogin, setNeedLogin] = useState(false);
  const [bootCount, setBootCount] = useState(0);
  // Required software offered once after the workspace loads (tools.offers).
  const [toolOffers, setToolOffers] = useState(null);
  // The tutorial welcome comes first on a first start; the required-software
  // offer waits until it has been closed.
  const [welcomeOpen, setWelcomeOpen] = useState(null);
  const cancelScanJobRef = useRef(null);
  // Desktop: the hidden popup windows are made once the main window is idle,
  // so menus and dialogs open without creating a window.
  const wsReady = !!ws;
  useEffect(() => {
    if (!wsReady || !usePopupWindows()) return undefined;
    const go = () => { warmPopups().catch(() => {}); };
    const h = window.requestIdleCallback ? window.requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200);
    return () => { if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(h); else clearTimeout(h); };
  }, [wsReady]);
  const offersAsked = useRef(false);
  const [adminTab, setAdminTab] = useState(null);
  const [settingsTab, setSettingsTab] = useState(null);
  // Centre tabs: Home pinned first, one tab per opened view (kept in settings.tabs).
  const [tabs, setTabs] = useState([{ id: 'start', view: 'start' }]);
  const shownTabs = useRef(new Set()); // the tabs whose view was built (see renderView)
  const mainRef = useRef(null);
  const scrollOf = useRef({});
  const prevView = useRef('start');
  // Docked panels (left navigation, right 세부 정보, bottom tabs), saved in settings.panels.
  const [panels, setPanelsState] = useState(() => panelsOf({}));
  const [rightEl, setRightEl] = useState(null);
  // Background work for the 작업 tab (tool installs report through 'mcc-job').
  const [jobs, setJobs] = useState({});
  const [recentFiles, setRecentFiles] = useState([]);
  // Recent projects (files and folders, 10): recent.list, or built from the
  // workspace when the server has no recent.* yet (removals then stay local).
  const [recent, setRecent] = useState([]);
  const hiddenRecent = () => { try { return JSON.parse(localStorage.getItem('mcc-recent-hidden') || '[]'); } catch { return []; } };
  const fallbackRecent = (data, files) => {
    const hidden = new Set(hiddenRecent());
    const folders = ((data && data.projects) || []).map((p) => {
      const b = p.branches && p.branches[p.mainBranch || 'main'];
      return { kind: 'folder', path: p.path, name: p.name, at: (b && b.latest && b.latest.finishedAt) || '', exists: true, projectId: p.id };
    });
    const fl = (files || []).map((f) => ({ kind: 'file', path: f.file, name: f.file.split(/[\\/]/).pop(), at: '', exists: f.exists }));
    return [...fl, ...folders.sort((a, b) => String(b.at).localeCompare(String(a.at)))].filter((r) => !hidden.has(r.path)).slice(0, 10);
  };
  const loadRecent = async (data, files) => {
    try { setRecent(await call('recent.list')); }
    catch { setRecent(fallbackRecent(data || wsRefRecent.current, files || recentFilesRef.current)); }
  };
  const wsRefRecent = useRef(null);
  const recentFilesRef = useRef([]);
  recentFilesRef.current = recentFiles;
  const removeRecent = async (path) => {
    try { setRecent(await call('recent.remove', { path })); }
    catch { try { localStorage.setItem('mcc-recent-hidden', JSON.stringify([...new Set([...hiddenRecent(), path])])); } catch { /* storage blocked */ } loadRecent(); }
  };
  const clearRecent = async () => {
    try { setRecent(await call('recent.clear')); }
    catch { try { localStorage.setItem('mcc-recent-hidden', JSON.stringify([...new Set([...hiddenRecent(), ...recent.map((r) => r.path)])])); } catch { /* storage blocked */ } setRecent([]); }
  };
  const openRecent = async (r) => {
    if (!r) return;
    if (r.kind === 'file') { openProjectFile(r.path).catch(() => {}); return; }
    const p = r.projectId && (ws.projects || []).find((x) => x.id === r.projectId);
    if (p && p.branches && Object.keys(p.branches).length) { if (await save({ ...ws, activeProjectId: p.id })) setView('overview'); }
    else scan(r.path);
  };
  const [docAvail, setDocAvail] = useState({ tutorial: false });
  useEffect(() => { docExists('tutorial').then((ok) => setDocAvail({ tutorial: ok })); }, []);

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

  // Only the open project's issues are in this window; switching projects
  // fetches the new one's (project.issues) and lets the others go.
  const [issuesLoading, setIssuesLoading] = useState(false);
  useEffect(() => {
    if (!project || !missingIssues(project)) return undefined;
    let stop = false;
    const id = project.id;
    setIssuesLoading({ done: 0, total: 0 });
    loadProjectIssues(project, { onProgress: (done, total) => { if (!stop) setIssuesLoading({ done, total }); } })
      .then((got) => {
        if (stop) return;
        setWs((cur) => (cur && cur.activeProjectId === id ? withProjectIssues(cur, id, got) : cur));
        for (const l of Object.values(got.limited || {})) toast(t('issues_limited', { shown: l.shown.toLocaleString(), total: l.total.toLocaleString() }), 'warn', 10000);
      })
      .catch((err) => { if (!stop) showError(err); })
      .finally(() => { if (!stop) setIssuesLoading(false); });
    return () => { stop = true; };
  }, [project]);

  const storedAnalysis = useMemo(() => {
    if (!project || !project.branches) return null;
    const b = project.branches[branch] || project.branches[project.mainBranch || 'main'];
    return b && b.latest ? b.latest : null;
  }, [project, branch]);
  const analysis = desktop || storedAnalysis;

  // ── Unsaved changes (lib/dirty) and the save-on-exit prompt ──
  const [hist, setHist] = useState(historyState);
  useEffect(() => subscribeHistory(setHist), []);
  const [, setDirtyTick] = useState(0);
  useEffect(() => subscribeDirty(() => setDirtyTick((n) => n + 1)), []);
  useEffect(() => {
    let off = null;
    let gone = false;
    listenChildEditors().then((u) => { if (gone && u) u(); else off = u; }).catch(() => {});
    return () => { gone = true; if (off) off(); };
  }, []);
  const baseline = useRef({}); // projectId -> signature at open / save / create
  const [touched, setTouched] = useState({}); // projectId -> changed by undo / redo
  const takeSnapshot = (p) => {
    if (!p) return;
    baseline.current[p.id] = projectSignature(p);
    setTouched((m) => { if (!m[p.id]) return m; const n = { ...m }; delete n[p.id]; return n; });
  };
  if (project && baseline.current[project.id] === undefined) baseline.current[project.id] = projectSignature(project);
  const projectDirty = !!project && (baseline.current[project.id] !== projectSignature(project) || !!touched[project.id]);
  const openEditors = dirtyEditors();
  const dirty = projectDirty || openEditors.length > 0;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const projectDirtyRef = useRef(false);
  projectDirtyRef.current = projectDirty;
  const projectRef = useRef(null);
  projectRef.current = project;
  // Undo / Redo mark the project dirty; opening another project clears the history.
  useEffect(() => { onHistoryApplied(() => { const p = projectRef.current; if (p) setTouched((m) => ({ ...m, [p.id]: true })); }); return () => onHistoryApplied(null); }, []);
  const activeId = ws ? ws.activeProjectId || '' : null;
  const prevActive = useRef(null);
  useEffect(() => {
    if (activeId === null) return;
    if (prevActive.current !== null && prevActive.current !== activeId) {
      clearHistory();
      const p = ((wsRef.current && wsRef.current.projects) || []).find((x) => x.id === activeId);
      if (p) setBranch(p.mainBranch || 'main');
      setDesktop(null);
    }
    prevActive.current = activeId;
  }, [activeId]);
  // "●" in the title while dirty (the custom title bar, the document and the OS window).
  const titleText = `${dirty ? '● ' : ''}${project ? `${project.name} — ` : ''}MyCodeChecker`;
  useEffect(() => {
    document.title = titleText;
    if (isDesktop && !popupRoute()) import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(titleText)).catch(() => {});
  }, [titleText]);
  const closingRef = useRef(false);
  const unlistenCloseRef = useRef(null);
  const closeRun = useRef(null);
  const reallyClose = async () => {
    closingRef.current = true;
    window.__mcc = { ...(window.__mcc || {}), closed: true };
    if (!isDesktop) { window.close(); return; }
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      try { await w.destroy(); } catch {
        // No destroy permission: let the close go through without our handler.
        if (unlistenCloseRef.current) { unlistenCloseRef.current(); unlistenCloseRef.current = null; }
        await w.close();
      }
    } catch { window.close(); }
  };
  const requestClose = () => {
    if (closeRun.current) return closeRun.current;
    closeRun.current = (async () => {
      if (!dirtyRef.current) { await reallyClose(); return 'closed'; }
      const p = projectRef.current;
      const lines = [];
      if (projectDirtyRef.current && p) lines.push(t('cl_project_changed', { name: p.name || p.path }));
      for (const e of dirtyEditors()) lines.push(t('cl_editor_changed', { name: e.label }));
      const choice = await ask({
        title: t('cl_title'), icon: 'save', kind: 'close',
        body: `${t('cl_body')}\n${lines.map((l) => `• ${l}`).join('\n')}`,
        buttons: [
          { id: 'save', label: t('cl_save'), icon: 'save', primary: true },
          { id: 'discard', label: t('cl_discard'), icon: 'trash', danger: true },
          { id: 'cancel', label: t('cancel'), icon: 'close' },
        ],
      });
      if (choice === 'cancel') return 'cancel';
      if (choice === 'save') {
        try { await saveEditors(); } catch (err) { showError(err.code === 'NOT_SAVED' ? new Error(t('cl_not_saved', { name: err.message })) : err); return 'cancel'; }
        if (projectDirtyRef.current && !(await saveProjectFileRef.current(false))) return 'cancel';
      }
      await reallyClose();
      return choice;
    })();
    return closeRun.current.finally(() => { closeRun.current = null; });
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  const saveProjectFileRef = useRef(null);
  useEffect(() => {
    if (!isDesktop || popupRoute()) return undefined;
    let gone = false;
    import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const u = await getCurrentWindow().onCloseRequested((event) => {
        if (closingRef.current) return;
        event.preventDefault();
        requestCloseRef.current();
      });
      if (gone) u(); else unlistenCloseRef.current = u;
    }).catch(() => {});
    return () => { gone = true; if (unlistenCloseRef.current) { unlistenCloseRef.current(); unlistenCloseRef.current = null; } };
  }, []);
  useEffect(() => {
    if (isDesktop) return undefined;
    const h = (e) => { if (dirtyRef.current && !closingRef.current) { e.preventDefault(); e.returnValue = ''; return ''; } return undefined; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);
  const runHistory = async (kind) => {
    const r = kind === 'undo' ? await historyUndo() : await historyRedo();
    if (r.ok) toast(t(kind === 'undo' ? 'hist_undone' : 'hist_redone', { action: r.label }), 'ok');
    else if (r.error) showError(r.error, t('hist_failed', { action: r.label }));
  };
  // File › Delete results and analyze again: the stored analyses go (optionally
  // the issue states too) and a fresh analysis treats all code as new.
  const resetAnalysis = async () => {
    const p = projectRef.current;
    if (!p) return;
    const choice = await ask({
      title: t('ra_title'), icon: 'refresh', body: t('ra_body', { name: p.name || p.path }),
      buttons: [
        { id: 'keep', label: t('ra_keep_triage'), icon: 'refresh', primary: true },
        { id: 'all', label: t('ra_clear_all'), icon: 'trash', danger: true },
        { id: 'cancel', label: t('cancel'), icon: 'close' },
      ],
    });
    if (choice !== 'keep' && choice !== 'all') return;
    const r = await attempt(() => call('project.resetAnalysis', { projectId: p.id, clearTriage: choice === 'all' }));
    if (!r.ok) return;
    setDesktop(null);
    setSelected(null);
    setChecked([]);
    setWs(r.value);
    toast(t('ra_done'), 'ok');
    await scan(p.path);
  };
  const deleteProject = async (target) => {
    const p = target && target.id ? target : projectRef.current;
    if (!p) return false;
    if (!(await ask({ title: t('pj_delete_title'), body: t('pj_delete_body', { name: p.name || p.path }), okLabel: t('pj_delete_ok'), danger: true }))) return false;
    const r = await attempt(() => call('project.remove', { projectId: p.id }), { ok: t('pj_deleted', { name: p.name || p.path }) });
    if (!r.ok) return false;
    delete baseline.current[p.id];
    setDesktop(null);
    setSelected(null);
    setChecked([]);
    setWs(r.value);
    if (!r.value.activeProjectId) setView('start');
    return true;
  };
  useEffect(() => {
    window.__mcc = {
      ...(window.__mcc || {}),
      dirty: () => ({ dirty: dirtyRef.current, project: projectDirtyRef.current, editors: dirtyEditors() }),
      closePrompt: () => requestCloseRef.current(),
      history: { state: historyState, undo: () => runHistoryRef.current('undo'), redo: () => runHistoryRef.current('redo'), clear: clearHistory },
    };
  }, []);
  const runHistoryRef = useRef(runHistory);
  runHistoryRef.current = runHistory;

  const history = useMemo(() => {
    if (!project || !project.branches) return [];
    const b = project.branches[branch] || project.branches[project.mainBranch || 'main'];
    return (b && b.history) || [];
  }, [project, branch]);

  const applyWorkspace = useCallback((data) => {
    const settings = data.settings || {};
    setCustomThemes(settings.customThemes || []);
    applyTheme(settings.theme || 'midnight');
    setLanguage(settings.language || osLanguage());
    setPanelsState(panelsOf(settings));
    const saved = Array.isArray(settings.tabs) ? settings.tabs.filter((v) => typeof v === 'string' && v !== 'start') : [];
    setTabs((cur) => (cur.length > 1 ? cur : [{ id: 'start', view: 'start' }, ...saved.map((v) => ({ id: v, view: v }))]));
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
        let [data, catalog] = await Promise.all([call('workspace.load'), call('rules.list')]);
        if (cancel) return;
        setRules(catalog);
        setNeedLogin(false);
        // A language picked on the login screen stays after signing in.
        const picked = loginPick.lang;
        loginPick.lang = null;
        if (picked && picked !== ((data.settings || {}).language || osLanguage())) {
          data = { ...data, settings: { ...(data.settings || {}), language: picked } };
          call('workspace.save', { workspace: { settings: data.settings } }).catch(() => {});
        }
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

  // Project file given at start (double-clicked .mccp) or opened while running.
  const openedAtStart = useRef(false);
  useEffect(() => {
    if (!ready || !ws || needLogin) return undefined;
    if (!openedAtStart.current) {
      openedAtStart.current = true;
      call('project.recentFiles').then((files) => { setRecentFiles(files); loadRecent(ws, files); }).catch(() => loadRecent(ws, []));
      if (typeof window.__MCC_OPEN__ === 'string' && window.__MCC_OPEN__) {
        const file = window.__MCC_OPEN__;
        window.__MCC_OPEN__ = null;
        if (actionRef.current) actionRef.current(`recentFile:${file}`);
      }
    }
    const onOpen = (e) => { if (e.detail && actionRef.current) actionRef.current(`recentFile:${e.detail}`); };
    const onJob = (e) => { const j = e.detail; if (j && j.id) setJobs((all) => ({ ...all, [j.id]: j })); };
    window.addEventListener('mcc-open-project', onOpen);
    window.addEventListener('mcc-job', onJob);
    return () => { window.removeEventListener('mcc-open-project', onOpen); window.removeEventListener('mcc-job', onJob); };
  }, [ready, ws, needLogin]);

  // A settings child window previews theme / language / background here and
  // tells us when it saved (desktop); the smoke hook opens menus.
  const wsRef = useRef(null);
  wsRef.current = ws;
  useEffect(() => {
    window.__mcc = { ...(window.__mcc || {}), scanJob: { state: () => scanJobRef.current, cancel: () => cancelScanJobRef.current && cancelScanJobRef.current(), show: (job) => setScanJob({ id: 'test', job, shown: true }), hide: () => setScanJob(null) }, openMenu: (id) => window.dispatchEvent(new CustomEvent('mcc-open-menu', { detail: id })), action: (id) => actionRef.current && actionRef.current(id) };
    const offs = [];
    onBroadcast('mcc-settings-preview', (p) => {
      const s = (wsRef.current && wsRef.current.settings) || {};
      if (!p) return;
      if (p.revert) {
        setCustomThemes(s.customThemes || []);
        applyTheme(s.theme || 'midnight');
        setLanguage(s.language || 'ko');
        window.dispatchEvent(new CustomEvent('mcc-start-bg-preview', { detail: null }));
        return;
      }
      if (p.customThemes) setCustomThemes(p.customThemes);
      if (p.theme) applyTheme(p.theme);
      if (p.language) setLanguage(p.language);
      if (p.startBackground) window.dispatchEvent(new CustomEvent('mcc-start-bg-preview', { detail: p.startBackground }));
    }).then((off) => offs.push(off));
    onBroadcast('mcc-settings-saved', async () => {
      window.dispatchEvent(new CustomEvent('mcc-start-bg-preview', { detail: null }));
      try { applyWorkspace(withIssuesFrom(await call('workspace.load', { slim: true }), wsRef.current)); } catch { /* keep the current one */ }
    }).then((off) => offs.push(off));
    return () => offs.forEach((off) => off && off());
  }, [applyWorkspace]);

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
      if (e.key === 'Escape' && !(dialog && dialog.kind === 'settings')) setDialog(null);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && ['z', 'Z', 'y', 'Y'].includes(e.key)) {
        if (typingTarget(document.activeElement) || typingTarget(e.target)) return;
        e.preventDefault();
        runHistory(e.key === 'y' || e.key === 'Y' || e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); return; }
      if (mod && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); closeTabs([view]); return; }
      if (mod && e.shiftKey && (e.key === 'O' || e.key === 'o')) { e.preventDefault(); onAction('openProject'); return; }
      if (mod && !e.shiftKey && e.key === 'o') { e.preventDefault(); onAction('openFolder'); }
      if (mod && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); onAction('newProject'); }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); onAction(e.shiftKey ? 'saveProjectAs' : 'saveProject'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onAction('analyze'); }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); onAction('settings'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const persist = async (next, opts = {}) => {
    const prev = wsRef.current;
    // The answer comes without issue lists (slim); this window keeps its own.
    const saved = withIssuesFrom(await call('workspace.save', { workspace: next, slim: true }), prev);
    setWs(saved);
    if (opts.history !== false) {
      const d = sliceDiff(prev, next);
      if (d) {
        const put = async (slices) => {
          const done = await persist(applySlices(wsRef.current, slices), { history: false });
          setPanelsState(panelsOf(done.settings || {}));
          if (opts.reanalyze) reanalyzeNote();
        };
        record({ label: opts.label || sliceLabel(d), undo: () => put(d.before), redo: () => put(d.after) });
      }
    }
    return saved;
  };
  // persist() for the views: failures get the error popup; ok / reanalyze notes.
  const save = async (next, opts = {}) => {
    const r = await attempt(() => persist(next, opts), { ok: opts.ok });
    if (r.ok && opts.reanalyze) reanalyzeNote();
    return r.ok;
  };
  const reanalyzeNote = () => toast(t('reanalyze_note'), 'warn', 9000, { label: t('reanalyze_now'), icon: 'play', run: () => actionRef.current && actionRef.current('analyze') });
  wsRefRecent.current = ws;
  // Keep the recent list current after every workspace change.
  useEffect(() => { if (ready && ws && !needLogin) loadRecent(ws); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ws && ws.activeProjectId, ws && (ws.projects || []).length, recentFiles]);

  const reload = async () => {
    const data = await call('workspace.load');
    setWs(data);
    return data;
  };

  // ── Analyses as background jobs (scan.start / scan.job / scan.cancel) ──
  // The job is polled every 250 ms; when it still runs after about 1 s the
  // progress popup appears. Resolves with the same result as project.scan.
  const [scanJob, setScanJob] = useState(null); // { id, job, shown }
  const scanJobRef = useRef(null);
  scanJobRef.current = scanJob;
  const runScanJob = async (args) => {
    const { jobId, joined } = await call('scan.start', args);
    if (joined) toast(t('sj_joined'), 'ok');
    const started = performance.now();
    setScanJob({ id: jobId, job: { id: jobId, status: 'running', path: args.path, progress: { phase: 'collect', percent: 0, elapsedMs: 0, etaMs: null } }, shown: false });
    try {
      for (;;) {
        await new Promise((r) => setTimeout(r, 250));
        const job = await call('scan.job', { jobId, slim: true });
        if (job.status === 'running') {
          setScanJob((s) => (s && s.id === jobId ? { ...s, job: s.job && s.job.status === 'cancelling' ? { ...job, status: 'cancelling' } : job, shown: s.shown || performance.now() - started > 1000 } : s));
          continue;
        }
        if (job.status === 'done') return job.result;
        if (['cancelled', 'canceled', 'CANCELED'].includes(job.status)) throw Object.assign(new Error(t('sj_cancelled')), { code: 'CANCELLED' });
        throw Object.assign(new Error((job.error && job.error.message) || t('sj_failed')), { code: (job.error && job.error.code) || 'FAILED', ...(job.error && job.error.text ? { text: job.error.text } : {}) });
      }
    } finally {
      setScanJob((s) => (s && s.id === jobId ? null : s));
    }
  };
  const cancelScanJob = async () => {
    const cur = scanJobRef.current;
    if (!cur) return;
    setScanJob((s) => (s && s.id === cur.id ? { ...s, job: { ...s.job, status: 'cancelling' } } : s));
    try { await call('scan.cancel', { jobId: cur.id }); } catch { /* already finished */ }
  };
  const samplePath = async (id) => {
    try { const list = await call('samples.list'); return (Array.isArray(list) ? list : []).find((s) => s.id === id) || null; } catch { return null; }
  };

  const scan = async (path, extra = {}) => {
    const commit = extra.commit !== false;
    setBusy(true);
    setMessage(t('analyzing'));
    try {
      let res;
      if (path) {
        // Another folder: its own main branch (known project) or the server's default, not the toolbar's.
        const cur = wsRef.current && (wsRef.current.projects || []).find((p) => p.id === wsRef.current.activeProjectId);
        const known = wsRef.current && (wsRef.current.projects || []).find((p) => normPath(p.path) === normPath(path));
        const useBranch = extra.branch || (cur && normPath(cur.path) === normPath(path) ? branch : (known && known.mainBranch) || undefined);
        res = await runScanJob({ path, ...extra, branch: useBranch, commit });
      }
      else {
        // The bundled demo sample (project.sample) as a job when its folder is known.
        const demo = await samplePath('demo');
        res = demo ? await runScanJob({ path: demo.path, name: 'Demo', branch, commit }) : await call('project.sample', { branch, commit });
      }
      const data = await reload();
      setWs(data);
      setSelected(null);
      const active = (data.projects || []).find((p) => p.id === data.activeProjectId);
      if (active && !extra.branch && (!path || !(project && normPath(project.path) === normPath(path)))) setBranch(active.mainBranch || 'main');
      if (!commit) {
        const id = (res.project && res.project.id) || data.activeProjectId;
        const current = (data.projects || []).find((p) => p.id === id);
        setDesktop((current && current.desktop) || res.analysis);
        setView('defects');
        setMessage(t('desktop_ready'));
      } else {
        setDesktop(null);
        if (langAfterScan.current) { setFilter({ ...EMPTY_FILTER, lang: langAfterScan.current }); setView('issues'); }
        else setView('overview');
        if (res.task && res.task.reports && res.task.reports.files.length) toast(t('rs_written', { n: res.task.reports.files.length, folder: res.task.reports.folder }), 'ok', 9000);
        if (res.task && res.task.dbError) {
          const e = res.task.dbError;
          showError(Object.assign(new Error(e.message), { code: e.code, text: e.text }), t('dbj_auto_failed'));
        }
        const policy = res.analysis.defectAnalysis && res.analysis.defectAnalysis.policy;
        const gateBad = res.analysis.qualityGate.status !== 'OK';
        const policyBad = policy && policy.status === 'ERROR';
        setMessage(gateBad ? t('gate_bad') : policyBad ? t('cov_policy_bad') : t('gate_ok'), gateBad || policyBad ? 'bad' : 'ok');
      }
    } catch (err) {
      if (err && err.code === 'CANCELLED') setMessage(t('sj_cancelled'), 'warn');
      else {
        langAfterScan.current = '';
        setMessage(err.message || t('folder_missing'), 'bad');
        showError(err);
      }
    } finally {
      langAfterScan.current = '';
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
    const r = await attempt(() => call('report.build', { projectId: project.id, branch, format, language: getLanguage() }));
    if (!r.ok) return;
    const res = r.value;
    const ext = format === 'sarif' ? 'sarif.json' : format === 'badge' ? 'svg' : format;
    await saveText(`${project.key || 'report'}.${ext}`, res.body, res.type || 'text/plain');
  };

  const onReview = async (keys, action, extra = {}) => {
    if (!project) return;
    try {
      await call('issue.review', { projectId: project.id, keys, action, ...extra });
    } catch (err) { setMessage(err.message, 'bad'); showError(err); return false; }
    const data = await reload();
    const current = (data.projects || []).find((p) => p.id === project.id);
    const b = current && current.branches && (current.branches[branch] || current.branches[current.mainBranch || 'main']);
    const fresh = b && b.latest && (b.latest.issues || []).find((i) => i.key === keys[0]);
    if (fresh) setSelected(fresh);
    if (keys.length > 1) setChecked([]);
    toast(t('rv_done'), 'ok');
    return true;
  };

  // Tracker tickets (issue.ticket); the issue gets the ticket as its external reference.
  const onTicket = async (keys, kind) => {
    if (!project) return [];
    const made = await call('issue.ticket', { projectId: project.id, branch, keys, kind, lang: getLanguage() });
    const data = await reload();
    const current = (data.projects || []).find((p) => p.id === project.id);
    const b = current && current.branches && (current.branches[branch] || current.branches[current.mainBranch || 'main']);
    const fresh = selected && b && b.latest && (b.latest.issues || []).find((i) => i.key === selected.key);
    if (fresh) setSelected(fresh);
    return made;
  };

  const onUpdate = async (keys, patch, cids) => {
    if (!project) return false;
    const pid = project.id;
    const fields = ISSUE_UNDO.filter((k) => patch[k] !== undefined);
    // The values before the change, grouped so each group is one issue.update.
    const byKey = new Map(((analysis && analysis.issues) || []).map((i) => [i.key, i]));
    const groups = new Map();
    for (const key of keys) {
      const i = byKey.get(key) || {};
      const prev = {};
      for (const k of fields) {
        const v = i[k];
        if (k === 'tags') prev.tags = Array.isArray(v) ? v : [];
        else if (v !== undefined && v !== null) prev[k] = v;
        else if (NULLABLE.has(k)) prev[k] = null;
      }
      if (patch.cid) prev.cid = patch.cid;
      const id = JSON.stringify(prev);
      if (!groups.has(id)) groups.set(id, { patch: prev, keys: [] });
      groups.get(id).keys.push(key);
    }
    const r = await attempt(() => call('issue.update', { projectId: pid, keys, patch, cids }));
    if (!r.ok) return false;
    await refreshIssues(pid);
    if (keys.length > 1) { setChecked([]); toast(t('ib_bulk_done', { n: keys.length }), 'ok'); }
    if (fields.length) {
      const what = fields.map((k) => (k === 'status' ? statusLabel(patch.status) : t(`hist_f_${k}`))).join(', ');
      record({
        label: `${t('hist_issue')} · ${what}${keys.length > 1 ? ` (${keys.length})` : ''}`,
        undo: async () => { for (const g of groups.values()) await call('issue.update', { projectId: pid, keys: g.keys, patch: g.patch, cids }); await refreshIssues(pid); },
        redo: async () => { await call('issue.update', { projectId: pid, keys, patch, cids }); await refreshIssues(pid); },
      });
    }
    return true;
  };
  const refreshIssues = async (pid) => {
    const data = await reload();
    if (desktop) {
      const current = (data.projects || []).find((p) => p.id === project.id);
      setDesktop(current && current.desktop ? current.desktop : null);
    }
    const current = (data.projects || []).find((p) => p.id === project.id);
    const b = current && current.branches && current.branches[branch];
    const next = b && b.latest && (b.latest.issues || []).find((i) => i.key === (selectedRef.current && selectedRef.current.key));
    if (next) setSelected(next);
    void pid;
  };
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  const openCode = async (file, line) => {
    if (!project) return;
    setView('code');
    setCodeFile(file);
    setCodeLine(Number(line) || 0);
    setCodeError('');
    try {
      const res = await call('project.file', { projectId: project.id, file });
      setCodeText(res.text);
    } catch (err) {
      setCodeText(null);
      setCodeError(errorTextOf(err));
    }
  };

  const onAction = async (id) => {
    if (id === 'showStart') {
      if (view === 'start') setView(viewBeforeStart.current);
      else { viewBeforeStart.current = view; setView('start'); }
    }
    else if (id === 'openFolder') openFolder();
    else if (id === 'openSample') scan('');
    else if (id === 'excludeDirs') { if (project) setDialog({ kind: 'excludeDirs' }); }
    else if (id === 'resetAnalysis') resetAnalysis();
    else if (id === 'analyze') { if (project) scan(project.path); else openFolder(); }
    else if (id === 'desktop') { if (project) scan(project.path, { commit: false }); else openFolder(); }
    else if (id === 'settings' || id.startsWith('settings:')) {
      const tab = id.startsWith('settings:') ? id.slice(9) : null;
      // The settings window's shortcut buttons come back as { action } and run here.
      if (usePopupWindows()) openPopupWindow({ kind: 'settings', center: true, width: 920, height: 720, onResult: (r) => { if (r && r.action) setTimeout(() => actionRef.current && actionRef.current(r.action), 0); }, payload: { tab, ws: { settings: ws.settings, gates: ws.gates }, theme: ws.settings.theme, language: getLanguage(), customThemes: getCustomThemesRaw() } });
      else { setSettingsTab(tab); setDialog({ kind: 'settings' }); }
    }
    else if (id.startsWith('adminTab:')) { setAdminTab(id.slice(9)); setView('admin'); }
    else if (id === 'newProject') setDialog({ kind: 'newProject' });
    else if (id === 'openProject') {
      const file = await pickProjectFile();
      if (file) openProjectFile(file); else if (!window.__TAURI_INTERNALS__) setDialog({ kind: 'openProject' });
    }
    else if (id === 'saveProject' || id === 'saveProjectAs') saveProjectFile(id === 'saveProjectAs');
    else if (id.startsWith('recentFile:')) openProjectFile(id.slice(11)).catch(() => {});
    else if (id.startsWith('recent:')) openRecent(recent[Number(id.slice(7))]);
    else if (id === 'recentClear') { if (await ask({ title: t('sp_recent_clear_menu'), body: t('cf_recent_clear'), okLabel: t('cf_clear'), danger: true })) clearRecent(); }
    else if (id === 'undo' || id === 'redo') runHistory(id);
    else if (id === 'deleteProject') deleteProject();
    else if (id.startsWith('sampleFile:')) openSampleFile(id.slice(11));
    else if (id.startsWith('sampleOpen:')) {
      setBusy(true);
      setMessage(t('analyzing'));
      try {
        const sid = id.slice(11);
        const s = await samplePath(sid);
        if (s && s.projectFile) {
          const opened = await call('samples.open', { id: sid, scan: false });
          if (!opened.analyzed && opened.project) await runScanJob({ path: opened.project.path || s.path, projectId: opened.project.id, name: opened.project.name });
        } else if (s) await runScanJob({ path: s.path, name: s.title });
        else await call('samples.open', { id: sid, scan: true });
        await reload();
        setView('overview');
        setMessage(t('pj_opened', { file: sid }), 'ok');
      } catch (err) {
        if (err && err.code === 'CANCELLED') setMessage(t('sj_cancelled'), 'warn');
        else { setMessage(err.message, 'bad'); showError(err); }
      } finally { setBusy(false); }
    }
    else if (id.startsWith('panel:')) togglePanel(id.slice(6));
    else if (id.startsWith('lang:')) patchSettings({ language: id.slice(5) });
    else if (id === 'tutorial' || id === 'tutorialRestart') {
      const tour = window.__mcc && window.__mcc.tutorial;
      if (tour && tour.start) tour.start(id === 'tutorialRestart' ? { index: 0 } : {});
    }
    else if (id.startsWith('doc:')) {
      const doc = id.slice(4);
      const guide = window.__mcc && window.__mcc.openGuide;
      if ((doc === 'guide' || doc === 'tutorial' || doc === 'readme') && typeof guide === 'function') guide(doc);
      else openDoc(doc);
    }
    else if (id === 'about' && usePopupWindows()) {
      openPopupWindow({ kind: 'about', center: true, width: 660, height: 640, payload: { summary: aboutSummary(rules), theme: ws.settings.theme, language: getLanguage(), customThemes: getCustomThemesRaw() } });
    }
    else if ((id === 'about' || id === 'help' || id === 'shortcuts') && usePopupWindows()) {
      const info = { about: ['MyCodeChecker', 'info', t('about_body'), `SHKWON · ${rules.length} rules · ${themeById(ws.settings.theme).label}`], help: [t('help'), 'lightbulb', t('help_body'), ''], shortcuts: [t('shortcuts'), 'key', t('shortcut_body'), ''] }[id];
      openPopupWindow({ kind: 'info', center: true, width: id === 'help' ? 720 : 520, height: id === 'help' ? 600 : 320, payload: { title: info[0], icon: info[1], body: info[2], small: info[3], theme: ws.settings.theme, language: getLanguage(), customThemes: getCustomThemesRaw() } });
    }
    else if (id === 'about') setDialog({ kind: 'about' });
    else if (id === 'help') setDialog({ kind: 'help' });
    else if (id === 'shortcuts') setDialog({ kind: 'shortcuts' });
    else if (id === 'customRule') setDialog({ kind: 'custom' });
    else if (id === 'tools') setDialog({ kind: 'tools' });
    else if (id === 'adminTools') { setAdminTab('tools'); setView('admin'); }
    else if (id === 'adminSettings') { setAdminTab('settings'); setView('admin'); }
    else if (id === 'quit') requestClose();
    else if (id === 'signOut') signOut();
    else if (id === 'nextTheme') patchSettings({ theme: nextThemeId(ws.settings.theme) });
    else if (id === 'toggleLanguage') patchSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' });
    else if (id.startsWith('theme:')) patchSettings({ theme: id.slice(6) });
    else if (/^view:(compliance|misra):/.test(id)) { const [, v, std] = id.split(':'); setStdPick({ view: v, std, at: Date.now() }); setView(v); }
    else if (id.startsWith('openFolderLang:')) { langAfterScan.current = id.slice(15); openFolder(); }
    else if (id.startsWith('view:')) setView(id.slice(5));
    else if (id.startsWith('export:')) exportReport(id.slice(7));
    else if (id.startsWith('issues:')) { setFilter({ ...EMPTY_FILTER, type: id.slice(7) }); setView('issues'); }
  };
  actionRef.current = onAction;
  saveProjectFileRef.current = (as) => saveProjectFile(as);
  cancelScanJobRef.current = cancelScanJob;

  // ── Project files (*.mccp) ─────────────────────────────
  const openProjectFile = async (file) => {
    try {
      const res = await call('project.open', { file });
      const data = await reload();
      takeSnapshot((data.projects || []).find((p) => p.id === res.project.id));
      setWs({ ...data, activeProjectId: res.project.id });
      await call('workspace.save', { workspace: { ...data, activeProjectId: res.project.id } }).then(setWs).catch(() => {});
      call('project.recentFiles').then(setRecentFiles).catch(() => {});
      setDialog(null);
      setMessage(t('pj_opened', { file: res.file }), 'ok');
      if (res.analyzed) setView('overview');
      else scan(res.project.path);
    } catch (err) {
      setMessage(projectErrorText(err), 'bad');
      setDialog({ kind: 'error', message: projectErrorText(err) });
      throw err;
    }
  };
  const saveProjectFile = async (as) => {
    if (!project) { setMessage(t('no_project'), 'bad'); return false; }
    try {
      let file;
      let picked = false;
      if (as || !project.projectFile) {
        file = await pickSavePath({ defaultPath: project.projectFile || `${project.name || 'project'}.mccp`, filters: [PROJECT_FILTER] });
        if (!file && window.__TAURI_INTERNALS__) return false;
        picked = !!file;
      }
      // A path picked in the native save dialog was already confirmed there;
      // otherwise an existing .mccp this project was not opened from is only
      // replaced after asking (CONFLICT with `file`).
      let res;
      for (;;) {
        try {
          res = await call('project.saveFile', { projectId: project.id, file: file || undefined, overwrite: picked || undefined });
          break;
        } catch (err) {
          if (!(err && err.code === 'CONFLICT' && err.file)) throw err;
          const choice = await ask({
            title: t('pj_replace_title'), icon: 'save', body: t('pj_replace_body', { file: err.file }),
            buttons: [
              { id: 'replace', label: t('pj_conflict_replace'), icon: 'refresh', danger: true },
              ...(isDesktop ? [{ id: 'other', label: t('pj_replace_other'), icon: 'folder' }] : []),
              { id: 'cancel', label: t('cancel'), icon: 'close' },
            ],
          });
          if (choice === 'replace') { file = err.file; picked = true; continue; }
          if (choice === 'other') {
            const p = await pickSavePath({ defaultPath: err.file, filters: [PROJECT_FILTER] });
            if (!p) return false;
            file = p; picked = true; continue;
          }
          return false;
        }
      }
      const data = await reload();
      takeSnapshot((data.projects || []).find((p) => p.id === project.id));
      call('project.recentFiles').then(setRecentFiles).catch(() => {});
      setMessage(t('pj_saved', { file: res.file }), 'ok');
      toast(t('pj_saved', { file: res.file }), 'ok');
      return true;
    } catch (err) { setMessage(projectErrorText(err), 'bad'); setDialog({ kind: 'error', message: projectErrorText(err) }); return false; }
  };
  // The start page's sample gallery: open the sample (analyzing it once) at a file.
  const openSampleFile = async (file) => {
    const sample = (ws.projects || []).find((p) => /[\\/]samples[\\/]demo$/i.test(String(p.path || '')));
    if (sample && sample.branches && Object.keys(sample.branches).length) {
      if (ws.activeProjectId !== sample.id) await persist({ ...ws, activeProjectId: sample.id });
      setTimeout(() => openCodeIn(sample.id, file), 0);
    } else {
      await scan('');
      const data = await reload();
      setTimeout(() => openCodeIn(data.activeProjectId, file), 0);
    }
  };
  // A fix applied / undone (AI CodeFix) reloads that file when it is open.
  useEffect(() => {
    const on = (e) => { const f = e.detail && e.detail.file; if (f && f === codeFileRef.current && projectRef.current) openCodeRef.current(f, codeLineRef.current); };
    window.addEventListener('mcc-code-refresh', on);
    return () => window.removeEventListener('mcc-code-refresh', on);
  }, []);
  const codeFileRef = useRef('');
  codeFileRef.current = codeFile;
  const codeLineRef = useRef(0);
  codeLineRef.current = codeLine;
  const openCodeRef = useRef(null);
  openCodeRef.current = async (f) => { try { setCodeText((await call('project.file', { projectId: projectRef.current.id, file: f })).text); setCodeError(''); } catch (err) { setCodeError(errorTextOf(err)); } };
  const openCodeIn = async (projectId, file) => {
    setView('code');
    setCodeFile(file);
    setCodeLine(0);
    setCodeError('');
    try { setCodeText((await call('project.file', { projectId, file })).text); } catch (err) { setCodeText(null); setCodeError(errorTextOf(err)); }
  };

  // ── Tabs ───────────────────────────────────────────────
  // Every view change opens (or focuses) its tab; scroll is kept per tab.
  useEffect(() => {
    if (!view) return;
    setTabs((cur) => (cur.some((x) => x.id === view) ? cur : [...cur, { id: view, view }]));
  }, [view]);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    scrollOf.current[prevView.current] = scrollOf.current.__last || 0;
    el.scrollTop = scrollOf.current[view] || 0;
    prevView.current = view;
  }, [view]);
  const tabsKey = tabs.map((x) => x.id).join(',');
  useEffect(() => {
    if (!ws || !ready) return undefined;
    const list = tabs.filter((x) => x.id !== 'start').map((x) => x.view);
    if (JSON.stringify(list) === JSON.stringify((ws.settings && ws.settings.tabs) || [])) return undefined;
    const timer = setTimeout(() => { persist({ ...ws, settings: { ...ws.settings, tabs: list } }).catch(() => {}); }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsKey]);
  const closeTabs = (ids) => {
    const drop = new Set(ids.filter((id) => id !== 'start'));
    if (!drop.size) return;
    const idx = tabs.findIndex((x) => x.id === view);
    const next = tabs.filter((x) => !drop.has(x.id));
    setTabs(next);
    if (drop.has(view)) {
      const after = tabs.slice(idx + 1).find((x) => !drop.has(x.id)) || [...tabs.slice(0, idx)].reverse().find((x) => !drop.has(x.id)) || next[0];
      setView(after ? after.view : 'start');
    }
  };
  const reorderTabs = (from, to) => setTabs((cur) => {
    const list = cur.filter((x) => x.id !== from);
    const at = list.findIndex((x) => x.id === to);
    const moving = cur.find((x) => x.id === from);
    if (!moving || at < 0) return cur;
    list.splice(cur.findIndex((x) => x.id === from) < cur.findIndex((x) => x.id === to) ? at + 1 : at, 0, moving);
    return list;
  });
  const moveTabTo = (from, at) => setTabs((cur) => {
    const moving = cur.find((x) => x.id === from);
    if (!moving) return cur;
    const list = cur.filter((x) => x.id !== from);
    list.splice(Math.max(1, Math.min(list.length, at)), 0, moving);
    return list;
  });
  const cycleTab = (dir) => {
    const i = tabs.findIndex((x) => x.id === view);
    const n = tabs[(i + dir + tabs.length) % tabs.length];
    if (n) setView(n.view);
  };

  // ── Panels ─────────────────────────────────────────────
  const savePanels = (next) => {
    setPanelsState(next);
    if (ws) persist({ ...ws, settings: { ...ws.settings, panels: next } }).catch(() => {});
  };
  const setPanel = (side, patch) => savePanels({ ...panels, [side]: { ...panels[side], ...patch } });
  const togglePanel = (side) => setPanel(side, panels[side].on ? { on: false } : { on: true, folded: false });
  // Selecting an item opens the right panel (on and unfolded) to show its details.
  const revealRight = () => {
    if (!panels.right.on || panels.right.folded) setPanel('right', { on: true, folded: false });
  };

  const patchSettings = async (patch, extra) => {
    if (!ws) return;
    const next = { ...ws, ...(extra || {}), settings: { ...ws.settings, ...patch } };
    if (patch.theme) applyTheme(patch.theme);
    if (patch.language) { setLanguage(patch.language); setMessage(''); }
    if (patch.customThemes) { setCustomThemes(patch.customThemes); applyTheme(next.settings.theme || 'midnight'); }
    if (patch.panels) setPanelsState(panelsOf(next.settings));
    await persist(next);
  };

  const menus = [
    { id: 'file', labelKey: 'menu_file', icon: 'folder', items: () => [
      { id: 'newProject', label: t('pj_menu_new'), icon: 'plus', keys: 'Ctrl+N' },
      { id: 'openProject', label: t('pj_menu_open'), icon: 'folder', keys: 'Ctrl+Shift+O' },
      { id: 'saveProject', label: t('pj_menu_save'), icon: 'save', keys: 'Ctrl+S' },
      { id: 'saveProjectAs', label: t('pj_menu_save_as'), icon: 'save', keys: 'Ctrl+Shift+S' },
      { id: 'deleteProject', label: t('pj_menu_delete'), icon: 'trash', disabled: !project },
      { id: 'recentMenu', label: t('sp_recent'), icon: 'history', children: () => [
        ...recent.slice(0, 10).map((r, i) => ({ id: `recent:${i}`, label: `${i + 1}. ${r.name || r.path.split(/[\\/]/).pop()}`, icon: r.kind === 'file' ? 'file' : 'folder', keys: r.exists === false ? t('sp_not_found') : '', disabled: r.exists === false })),
        ...(recent.length ? [{ sep: true }] : []),
        { id: 'recentClear', label: t('sp_recent_clear_menu'), icon: 'trash', disabled: !recent.length },
      ] },
      { sep: true },
      { id: 'openFolder', label: t('open_folder'), icon: 'folder', keys: 'Ctrl+O' },
      { id: 'openSample', label: t('open_sample'), icon: 'play' },
      { id: 'excludeDirs', label: t('xd_menu'), icon: 'filter', disabled: !project },
      { id: 'resetAnalysis', label: t('ra_menu'), icon: 'refresh', disabled: !project || busy },
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
    { id: 'edit', labelKey: 'menu_edit', icon: 'edit', items: () => [
      { id: 'undo', label: hist.canUndo ? t('hist_undo_named', { action: hist.undoLabel }) : t('tb_undo'), icon: 'undo', keys: 'Ctrl+Z', disabled: !hist.canUndo },
      { id: 'redo', label: hist.canRedo ? t('hist_redo_named', { action: hist.redoLabel }) : t('tb_redo'), icon: 'redo', keys: 'Ctrl+Y / Ctrl+Shift+Z', disabled: !hist.canRedo },
    ] },
    { id: 'issues', labelKey: 'menu_issues', icon: 'bug', items: () => [
      { id: 'view:issues', label: t('all'), icon: 'list' },
      { id: 'issues:BUG', label: t('bugs'), icon: 'bug' },
      { id: 'issues:VULNERABILITY', label: t('vulns'), icon: 'unlock' },
      { id: 'issues:CODE_SMELL', label: t('smells'), icon: 'smell' },
      { id: 'view:hotspots', label: t('nav_hotspots'), icon: 'shield' },
      { id: 'view:approvals', label: t('nav_approvals'), icon: 'userCheck' },
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
      { id: 'view:arch', label: t('nav_arch'), icon: 'flow' },
      { id: 'view:his', label: t('nav_his'), icon: 'cpu' },
      { id: 'view:activity', label: t('nav_activity'), icon: 'clock' },
      { id: 'view:defects', label: t('nav_defects'), icon: 'alert' },
      { id: 'view:streams', label: t('nav_streams'), icon: 'layers' },
      { id: 'view:tasks', label: t('nav_tasks'), icon: 'hourglass' },
      { sep: true },
      { id: 'view:dependencies', label: t('menu_dependencies'), icon: 'package' },
      { id: 'view:snapshots', label: t('menu_snapshots'), icon: 'history' },
      { id: 'view:pullrequest', label: t('menu_pullrequest'), icon: 'branch' },
      { id: 'view:dast', label: t('menu_dast'), icon: 'globe' },
      { sep: true },
      { id: 'panel:left', label: t('pn_left'), icon: 'panelLeft', keys: panels.left.on ? '✓' : '' },
      { id: 'panel:right', label: t('pn_right'), icon: 'panelRight', keys: panels.right.on ? '✓' : '' },
      { id: 'panel:bottom', label: t('pn_bottom'), icon: 'panelBottom', keys: panels.bottom.on ? '✓' : '' },
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
      { id: 'tutorial', label: t('sp_tutorial_start'), icon: 'graduation' },
      { id: 'tutorialRestart', label: t('tut_restart'), icon: 'refresh' },
      { sep: true },
      { id: 'doc:guide', label: t('sp_users_guide'), icon: 'book' },
      { id: 'doc:tutorial', label: t('sp_tutorial_doc'), icon: 'report', keys: docAvail.tutorial ? '' : t('doc_not_built_short') },
      { id: 'doc:readme', label: 'README', icon: 'file' },
      { id: 'doc:architecture', label: t('doc_architecture'), icon: 'flow' },
      { sep: true },
      { id: 'help', label: t('help'), icon: 'lightbulb' },
      { id: 'shortcuts', label: t('shortcuts'), icon: 'key' },
      { id: 'about', label: t('about'), icon: 'info' },
    ] },
  ];

  if (!ready) return <div className="boot">{t('loading')}</div>;
  if (needLogin) return <><LoginScreen onDone={() => { setReady(false); setBootCount((n) => n + 1); }} /><UiHost /></>;
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
  // defects from defect analysis and exception requests waiting for approval.
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
    approvals: { n: pendingReviews, tone: 'warn', tip: t('nav_tip_pending') },
  };

  const onStart = view === 'start';
  const showLeft = !onStart && panels.left.on;
  const showRight = !onStart && panels.right.on;
  const showBottom = !onStart && panels.bottom.on;
  const jumpTo = (issue) => {
    if (issue.type === 'SECURITY_HOTSPOT' || view === 'code' || view === 'defects') { openCode(issue.file, issue.line); return; }
    setSelected(issue);
    setView('issues');
    revealRight();
  };
  const lastTask = (ws.tasks || []).filter((x) => !project || x.projectId === project.id).slice(-1)[0] || null;
  // Tabs whose view has been shown. A restored tab is built the first time it
  // is shown: twenty restored tabs would otherwise all load their data (reports,
  // graphs …) at once when the window opens. Once built, a tab stays mounted.
  shownTabs.current.add(view);
  // One open tab's view (inactive tabs stay mounted, hidden, with their own state).
  const renderView = (view) => (
    <>
          {view === 'start' && <StartPage settings={ws.settings} showOnLaunch={ws.settings.showStartOnLaunch !== false} onShowOnLaunch={(v) => patchSettings({ showStartOnLaunch: v })}
            projects={ws.projects || []} recent={recent} onRecentOpen={openRecent} onRecentRemove={removeRecent} onRecentClear={clearRecent} onOpen={openFolder} onSample={() => scan('')}
            onBackground={(startBackground) => patchSettings({ startBackground })}
            onRecent={async (p) => { if (await save({ ...ws, activeProjectId: p.id })) setView('overview'); }} />}
          {view === 'overview' && <Overview analysis={analysis} project={project} onGo={onAction} />}
          {view === 'issues' && <IssueBrowser issues={(analysis && analysis.issues) || []} hasAnalysis={!!analysis} rules={allRules} filter={filter} setFilter={setFilter} selected={selected} onSelect={(i) => { setSelected(i); if (i) revealRight(); }} checked={checked} setChecked={setChecked} onUpdate={onUpdate} onReview={onReview} approval={ws.settings.approval} onTicket={onTicket} project={project} branch={branch} />}
          {view === 'hotspots' && <Hotspots issues={(analysis && analysis.issues) || []} hasAnalysis={!!analysis} rules={allRules} onUpdate={onUpdate} />}
          {view === 'measures' && <Measures analysis={analysis} />}
          {view === 'code' && <CodeView analysis={analysis} file={codeFile} text={codeText} error={codeError} line={codeLine} onOpen={openCode} onPickIssue={jumpTo} />}
          {view === 'his' && <HisView project={project} stamp={stamp} onOpenAt={openCode} />}
          {view === 'arch' && <ArchView project={project} stamp={stamp} issues={(analysis && analysis.issues) || []} onOpenAt={openCode} />}
          {view === 'approvals' && <ApprovalsView project={project} stamp={stamp} onChanged={reload} />}
          {view === 'duplications' && <Duplications analysis={analysis} onOpen={openCode} />}
          {view === 'activity' && <Activity history={history} />}
          {view === 'rules' && <RulesView rules={allRules} onDeactivate={async (key) => {
            if (!(await ask({ title: t('cf_rule_off_title'), body: t('cf_rule_off', { rule: key }), okLabel: t('cf_rule_off_ok'), danger: true }))) return;
            const profiles = (ws.profiles || []).map((p) => p.language === '*' ? { ...p, inactive: [...new Set([...(p.inactive || []), key])] } : p);
            save({ ...ws, profiles }, { label: t('hist_rule_off', { rule: key }), reanalyze: true });
          }} />}
          {view === 'profiles' && <ProfilesView profiles={ws.profiles || []} rules={allRules} project={project} onReload={reload} onChange={(profiles) => save({ ...ws, profiles }, { reanalyze: true })}
            onAssign={(language, profileId) => {
              const projects = (ws.projects || []).map((p) => {
                if (p.id !== project.id) return p;
                const chosen = { ...(p.profiles || {}) };
                if (profileId) chosen[language] = profileId; else delete chosen[language];
                return { ...p, profiles: chosen };
              });
              save({ ...ws, projects }, { reanalyze: true });
            }} />}
          {view === 'gates' && <GatesView gates={ws.gates || []} project={project} onChange={(gates) => save({ ...ws, gates }, { reanalyze: true })} onAssign={(gateId) => {
            const projects = ws.projects.map((p) => p.id === project.id ? { ...p, gateId } : p);
            save({ ...ws, projects }, { reanalyze: true });
          }} />}
          {view === 'portfolios' && <Portfolios portfolios={ws.portfolios || []} projects={ws.projects || []} onChange={(portfolios) => save({ ...ws, portfolios })} />}
          {view === 'tasks' && <Tasks tasks={ws.tasks || []} />}
          {view === 'defects' && <DefectsView analysis={analysis} onUpdate={onUpdate} />}
          {view === 'streams' && <StreamsView history={history} analysis={storedAnalysis} project={project} branch={branch} />}
          {view === 'components' && <ComponentsEditor components={(ws.defectAnalysis && ws.defectAnalysis.components) || []} onChange={(components) => save({ ...ws, defectAnalysis: { ...ws.defectAnalysis, components } })} />}
          {view === 'policies' && <PoliciesEditor policies={(ws.defectAnalysis && ws.defectAnalysis.policies) || []} project={project} onChange={(policies) => save({ ...ws, defectAnalysis: { ...ws.defectAnalysis, policies } }, { reanalyze: true })} onAssign={(policyId) => {
            if (!project) return;
            const projects = ws.projects.map((p) => p.id === project.id ? { ...p, policyId } : p);
            save({ ...ws, projects }, { reanalyze: true });
          }} />}
          {view === 'compliance' && <ComplianceView project={project} branch={branch} stamp={stamp} onDrill={drill} pick={stdPick && stdPick.view === 'compliance' ? stdPick : null} />}
          {view === 'misra' && <MisraView project={project} branch={branch} stamp={stamp} onDrill={drill} pick={stdPick && stdPick.view === 'misra' ? stdPick : null} />}
          {view === 'reports' && <ReportsView project={project} branch={branch} stamp={stamp} />}
          {view === 'dependencies' && <ScaView project={project} stamp={stamp} />}
          {view === 'snapshots' && <HistoryView project={project} branch={branch} stamp={stamp} />}
          {view === 'pullrequest' && <PullRequestView project={project} branch={branch} stamp={stamp} />}
          {view === 'dast' && <DastView />}
          {view === 'admin' && <AdminView ws={ws} project={project} branch={branch} onSaveWorkspace={persist} onWorkspaceChanged={reload} initialTab={adminTab} onDeleteProject={deleteProject} />}
          {view === 'models' && <ModelsEditor models={(ws.defectAnalysis && ws.defectAnalysis.models) || []} onChange={(models) => save({ ...ws, defectAnalysis: { ...ws.defectAnalysis, models } })} />}
    </>
  );
  const navStrip = (
    <div className="strip-groups">
      {NAV_GROUPS.map(([gid, labelKey, icon, items]) => (
        <button key={gid} type="button" className={`strip-btn ${items.some(([k]) => k === view) ? 'on' : ''}`} title={t(labelKey)} aria-label={t(labelKey)}
          onClick={() => { setPanel('left', { folded: false }); setTimeout(() => window.dispatchEvent(new CustomEvent('mcc-nav-expand', { detail: gid })), 0); }}>
          <Icon name={icon} size={16} />
        </button>
      ))}
    </div>
  );

  return (
    <PanelCtx.Provider value={{ rightEl, rightOn: showRight, rightActive: showRight && !panels.right.folded, reveal: revealRight }}>
    <ProjectCtx.Provider value={project && !analysis ? project : null}>
    <div className="app" onClick={() => {}}>
      <MenuBar menus={menus} onAction={onAction} theme={(ws.settings && ws.settings.theme) || 'midnight'} startActive={onStart} dirty={dirty} />
      <Toolbar onAction={onAction} busy={busy} view={view} branch={branch} branches={branches} panels={panels} history={hist} onBranch={(name) => { setDesktop(null); setBranch(name); }} />
      <div className="body-row">
        {showLeft && (
          <>
            <DockPanel side="left" title={t('pn_nav')} icon="list" folded={panels.left.folded} width={panels.left.w}
              onFold={(v) => setPanel('left', { folded: v })} onClose={() => setPanel('left', { on: false })} strip={navStrip}>
              <SideNav view={view} counts={navCounts} onView={(v) => { setAdminTab(null); setView(v); }} />
            </DockPanel>
            {!panels.left.folded && <Splitter axis="x" dir={1} value={panels.left.w} min={PANEL_LIMITS.left[0]} max={PANEL_LIMITS.left[1]} label={t('pn_resize')}
              onChange={(w) => setPanelsState((p) => ({ ...p, left: { ...p.left, w } }))} onCommit={(w) => setPanel('left', { w })} />}
          </>
        )}
        <div className="center-col">
          {/* The start page shows no tabs; the Start menu goes back to the last view. */}
          {!onStart && (
            <DocTabs tabs={tabs} active={view} onActivate={(id) => { const tb = tabs.find((x) => x.id === id); if (tb) setView(tb.view); }} onClose={closeTabs} onReorder={reorderTabs} onMoveTo={moveTabTo}
              suffix={(ws.projects || []).length > 1 && project ? project.name : ''} />
          )}
          <main ref={mainRef} className={`main ${onStart ? 'start-mode' : ''}`} onScroll={(e) => { scrollOf.current.__last = e.currentTarget.scrollTop; }}>
          {tabs.map((tb) => (
            <div key={tb.id} className="tab-pane" hidden={tb.id !== view} data-pane={tb.id} data-tour={`view-${tb.view}`}>
              <TabActiveCtx.Provider value={tb.id === view}>{shownTabs.current.has(tb.id) ? renderView(tb.view) : null}</TabActiveCtx.Provider>
            </div>
          ))}
          </main>
          {showBottom && (
            <>
              {!panels.bottom.folded && <Splitter axis="y" dir={-1} value={panels.bottom.h} min={PANEL_LIMITS.bottom[0]} max={PANEL_LIMITS.bottom[1]} label={t('pn_resize')}
                onChange={(h) => setPanelsState((p) => ({ ...p, bottom: { ...p.bottom, h } }))} onCommit={(h) => setPanel('bottom', { h })} />}
              <BottomPanel tab={panels.bottom.tab} onTab={(tab) => setPanel('bottom', { tab })} folded={panels.bottom.folded} onFold={(v) => setPanel('bottom', { folded: v })}
                onClose={() => setPanel('bottom', { on: false })} height={panels.bottom.h} analysis={analysis} task={lastTask} view={view} codeFile={codeFile}
                busy={busy} message={message} jobs={jobs} messages={messages} onClearMessages={() => setMessages([])} onJump={jumpTo} />
            </>
          )}
        </div>
        {showRight && (
          <>
            {!panels.right.folded && <Splitter axis="x" dir={-1} value={panels.right.w} min={PANEL_LIMITS.right[0]} max={PANEL_LIMITS.right[1]} label={t('pn_resize')}
              onChange={(w) => setPanelsState((p) => ({ ...p, right: { ...p.right, w } }))} onCommit={(w) => setPanel('right', { w })} />}
            <DockPanel side="right" title={t('pn_inspector')} icon="eye" folded={panels.right.folded} width={panels.right.w}
              onFold={(v) => setPanel('right', { folded: v })} onClose={() => setPanel('right', { on: false })} bodyRef={setRightEl}>
              <div className="rp-empty"><Icon name="eye" size={26} /><strong>{t('pn_inspector_empty')}</strong><span className="small">{t('pn_inspector_hint')}</span></div>
            </DockPanel>
          </>
        )}
      </div>
      <StatusBar project={project} analysis={analysis} message={message} />
      <Tutorial onProgress={(p) => patchSettings(progressPatch(ws.settings, p))} />
      <UserGuide />
      {scanJob && scanJob.shown && <ScanProgress job={scanJob.job} onCancel={cancelScanJob} />}
      <TutorialWelcome settings={ws.settings} onPatch={patchSettings} onClose={() => setWelcomeOpen(false)} />
      {dialog && dialog.kind === 'excludeDirs' && project && (
        <ExcludeDirsDialog root={project.path} value={project.excludeDirs} onClose={() => setDialog(null)}
          onSave={async (dirs) => {
            setDialog(null);
            try {
              await persist({ ...ws, projects: (ws.projects || []).map((p) => (p.id === project.id ? { ...p, excludeDirs: dirs } : p)) });
              toast(t('xd_saved'), 'ok', 9000, { label: t('reanalyze_now'), icon: 'play', run: () => actionRef.current && actionRef.current('analyze') });
            } catch (err) { showError(err); }
          }} />
      )}
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
      {dialog && dialog.kind === 'about' && <AboutDialog summary={aboutSummary(rules)} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'help' && (
        <Dialog title={t('help')} icon="lightbulb" onClose={() => setDialog(null)} wide>
          {t('help_body').split('\n').map((line, i) => <p key={i}>{line}</p>)}
        </Dialog>
      )}
      {dialog && dialog.kind === 'shortcuts' && (
        <Dialog title={t('shortcuts')} icon="key" onClose={() => setDialog(null)}>
          {t('shortcut_body').split('\n').map((line, i) => <p key={i}>{line}</p>)}
        </Dialog>
      )}
      {dialog && dialog.kind === 'tools' && <ToolsDialog onClose={() => setDialog(null)} onChanged={reload} />}
      {toolOffers && !dialog && !(welcomeOpen === null ? shouldShowWelcome(ws.settings) : welcomeOpen) && <ToolOfferDialog offers={toolOffers} onClose={() => setToolOffers(null)} onChanged={reload} />}
      {dialog && dialog.kind === 'settings' && (
        <SettingsDialog ws={ws} initialTab={settingsTab} onClose={() => setDialog(null)} onSave={patchSettings} />
      )}
      {dialog && dialog.kind === 'newProject' && (
        <NewProjectDialog onClose={() => setDialog(null)} onOpenExisting={async (pid) => {
          setDialog(null);
          const data = await reload();
          const p = (data.projects || []).find((x) => x.id === pid);
          if (!p) return;
          if (await save({ ...data, activeProjectId: p.id }, { history: false })) { if (p.branches && Object.keys(p.branches).length) setView('overview'); else scan(p.path); }
        }} onDone={async (res, { analyze } = {}) => {
          setDialog(null);
          let data = await reload();
          if (data.activeProjectId !== res.project.id) data = await persist({ ...data, activeProjectId: res.project.id }, { history: false });
          takeSnapshot((data.projects || []).find((p) => p.id === res.project.id));
          call('project.recentFiles').then(setRecentFiles).catch(() => {});
          setMessage(t('pj_created', { file: res.file }), 'ok');
          const made = (data.projects || []).find((p) => p.id === res.project.id) || res.project;
          setBranch(made.mainBranch || 'main');
          if (analyze) scan(made.path, { projectId: made.id, name: made.name, branch: made.mainBranch || 'main' });
          else setView('overview');
        }} />
      )}
      {dialog && dialog.kind === 'openProject' && <OpenProjectDialog onClose={() => setDialog(null)} onOpen={openProjectFile} />}
      {dialog && dialog.kind === 'custom' && (
        <CustomRuleDialog onClose={() => setDialog(null)} onSave={async (rule) => {
          if (!(await save({ ...ws, customRules: [...(ws.customRules || []), rule] }, { label: t('hist_custom_rules'), ok: t('custom_saved'), reanalyze: true }))) return false;
          setDialog(null);
          setMessage(t('custom_saved'));
          return true;
        }} />
      )}
      <UiHost />
      <TermTip />
      <ProgressHost />
    </div>
    </ProjectCtx.Provider>
    </PanelCtx.Provider>
  );
}

function CustomRuleDialog({ onClose, onSave }) {
  useLanguage();
  const [draft, setDraft] = useState({ pattern: '', langs: ['*'], type: 'CODE_SMELL', severity: 'MAJOR', name: { ko: '', en: '' } });
  const [tried, setTried] = useState(false);
  let patternError = '';
  if (!draft.pattern.trim()) patternError = t('cr_pattern_empty');
  else {
    try {
      const re = new RegExp(draft.pattern);
      if (re.test('')) patternError = t('cr_pattern_matches_empty');
    } catch (err) { patternError = t('cr_pattern_invalid', { error: err.message }); }
  }
  const nameError = draft.name.ko.trim() ? '' : t('cr_name_empty');
  useEditorDirty('custom-rule', !!(draft.pattern || draft.name.ko), { label: t('custom_rule') });
  const submit = () => {
    setTried(true);
    if (patternError || nameError) return;
    onSave({ ...draft, key: `custom:${Date.now().toString(36)}` });
  };
  return (
    <Dialog title={t('custom_rule')} icon="plus" onClose={onClose}>
      <label className="form-row">{t('pattern')}<input className="mono" value={draft.pattern} aria-invalid={!!(patternError && (tried || draft.pattern))} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} /></label>
      {patternError && (tried || draft.pattern) && <p className="small bad" data-error="pattern">{patternError}</p>}
      <label className="form-row">{t('name')}<input value={draft.name.ko} onChange={(e) => setDraft({ ...draft, name: { ko: e.target.value, en: e.target.value } })} /></label>
      {nameError && tried && <p className="small bad" data-error="name">{nameError}</p>}
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
          <Btn icon="save" label={t('save')} primary onClick={submit} />
          <Btn icon="close" label={t('cancel')} onClick={onClose} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

// The language chosen on the login screen, applied (and saved) after signing in.
const loginPick = { lang: null };

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
      setFailed(err.code === 'UNAUTHORIZED' ? t('login_failed') : errorTextOf(err));
    }
  };
  return (
    <div className="boot">
      <form className="panel login-panel" onSubmit={submit}>
        <div className="login-lang" role="group" aria-label={t('tip_language')}>
          <Btn icon="globe" label="한국어" active={getLanguage() === 'ko'} onClick={() => { loginPick.lang = 'ko'; setLanguage('ko'); }} />
          <Btn icon="globe" label="English" active={getLanguage() === 'en'} onClick={() => { loginPick.lang = 'en'; setLanguage('en'); }} />
        </div>
        <h2 className="sub-title"><Icon name="lock" size={18} />{t('login_title')}</h2>
        <label className="form-row">{t('ad_login')}<input autoFocus value={login} onChange={(e) => setLogin(e.target.value)} /></label>
        <label className="form-row">{t('ad_password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {failed && <p className="small bad">{failed}</p>}
        <Btn icon="check" label={t('sign_in')} primary onClick={submit} />
      </form>
    </div>
  );
}
