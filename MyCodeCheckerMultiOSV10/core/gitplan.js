'use strict';

// Per-project git connection and analysis plan.
//
//   git: {
//     url, branch, fetch,
//     scope: 'full' | 'changed',   // configured folders, or only files git reports as changed
//     ref,                         // comparison ref for scope 'changed' (empty: merge-base with the branch)
//     period: 'off' | 'hourly' | 'daily' | 'weekly' | 'custom',
//     cron,                        // used when period is 'custom'
//     content: { issues, duplication, coverage, defects }
//   }
//
// Directory exclusions and exclusion patterns still apply in both scopes.
// A missing git block means the historical behaviour: analyze every configured file.

const scheduler = require('./scheduler');

const PERIODS = {
  off: null,
  hourly: '0 * * * *',
  daily: '0 2 * * *',
  weekly: '0 2 * * 1',
};

const PERIOD_NAMES = ['off', 'hourly', 'daily', 'weekly', 'custom'];

// Line rules and the language engines. Deep standards and path analysis are "defects".
const ISSUE_ENGINES = ['sem-js', 'sem-java', 'sem-cs', 'sem-py', 'sem-go', 'sem-php', 'sem-rb', 'kr-secure', 'iac'];
const DEFECT_ENGINES = ['taint', 'misra-c', 'misra-cpp', 'cert', 'absint', 'his', 'autosar', 'misra-legacy'];

function contentOf(src) {
  const c = src && typeof src === 'object' ? src : {};
  return {
    issues: c.issues !== false,
    duplication: c.duplication !== false,
    coverage: c.coverage !== false,
    defects: c.defects !== false,
  };
}

/** A stored git block, with defaults filled in. Invalid custom cron is kept so the form can show it; it does not schedule. */
function normalize(input) {
  const src = input && typeof input === 'object' ? input : {};
  const period = PERIOD_NAMES.includes(src.period) ? src.period : 'off';
  const cron = period === 'custom' ? String(src.cron || '').trim() : (PERIODS[period] || '');
  return {
    url: String(src.url || '').trim(),
    branch: String(src.branch || '').trim(),
    fetch: src.fetch === true,
    scope: src.scope === 'changed' ? 'changed' : 'full',
    ref: String(src.ref || '').trim(),
    period,
    cron,
    content: contentOf(src.content),
  };
}

function cronOf(plan) {
  if (!plan || plan.period === 'off') return null;
  const cron = plan.period === 'custom' ? plan.cron : PERIODS[plan.period];
  if (!cron) return null;
  try { scheduler.parseCron(cron); } catch { return null; }
  return cron;
}

/** The workspace schedule a project's period becomes, or null when the project is manual or the cron is unusable. */
function scheduleFor(project, plan, now = new Date()) {
  const cron = cronOf(plan);
  if (!cron || !project || !project.id) return null;
  const next = scheduler.nextRun(cron, now);
  return {
    id: `gitplan:${project.id}`,
    name: `${project.name || project.key || 'Project'}`,
    kind: 'scan',
    projectId: project.id,
    path: project.path,
    branch: plan.branch || project.mainBranch || null,
    cron,
    enabled: true,
    fromGitPlan: true,
    history: [],
    nextRun: next ? next.toISOString() : null,
  };
}

/** Manual schedules plus one derived schedule per project that has a period. */
function schedulesOf(ws, now = new Date()) {
  const manual = ((ws && ws.schedules) || []).filter((s) => s && !s.fromGitPlan);
  const derived = [];
  for (const project of (ws && ws.projects) || []) {
    if (!project || !project.git) continue;
    const base = scheduleFor(project, normalize(project.git), now);
    if (!base) continue;
    const run = project.gitRun || {};
    derived.push({
      ...base,
      lastRun: run.lastRun,
      lastStatus: run.lastStatus,
      lastSummary: run.lastSummary,
      history: run.history || [],
      nextRun: run.nextRun || base.nextRun,
    });
  }
  return [...manual, ...derived];
}

/** Write a finished derived run back onto its project. Other schedules stay on the workspace list. */
function applyScheduleSave(ws, list) {
  const manual = [];
  for (const s of list || []) {
    if (s && s.fromGitPlan && s.projectId) {
      const project = (ws.projects || []).find((p) => p.id === s.projectId);
      if (project) {
        project.gitRun = {
          lastRun: s.lastRun,
          lastStatus: s.lastStatus,
          lastSummary: s.lastSummary,
          history: s.history || [],
          nextRun: s.nextRun,
        };
      }
    } else if (s) manual.push(s);
  }
  ws.schedules = manual;
  return ws;
}

/** null: every file the walk would take. An array (possibly empty): only these relative paths, still subject to exclusions. */
function onlyFiles(plan, changed) {
  if (!plan || plan.scope !== 'changed') return null;
  const files = (changed && changed.files) || {};
  return Object.entries(files).filter(([, e]) => e && e.status !== 'D').map(([f]) => f);
}

function analysisOptions(plan) {
  const c = (plan && plan.content) || contentOf(null);
  const skipEngines = [];
  if (!c.issues) skipEngines.push(...ISSUE_ENGINES);
  if (!c.defects) skipEngines.push(...DEFECT_ENGINES);
  return {
    skipRules: !c.issues,
    skipDuplication: !c.duplication,
    skipCoverage: !c.coverage,
    skipDefects: !c.defects,
    ...(skipEngines.length ? { skipEngines } : {}),
  };
}

function warn(en, ko) {
  return { engine: 'git', message: { en, ko } };
}

/**
 * What one analysis of this project should do.
 * @returns {Promise<{options:object, meta:object|null, warnings:object[]}>}
 */
async function resolveScan(dir, project, scm) {
  if (!project || !project.git || typeof project.git !== 'object') return { options: {}, meta: null, warnings: [] };
  const plan = normalize(project.git);
  const warnings = [];
  let fetched = false;
  if (plan.fetch && scm) {
    const repo = await scm.detectRepo(dir);
    if (!repo.ok) {
      warnings.push(warn(
        'Git fetch was skipped because this folder is not a git repository.',
        '이 폴더는 git 저장소가 아니라서 git fetch 를 건너뛰었습니다.',
      ));
    } else {
      const args = ['fetch', '--prune'];
      if (plan.url) args.push(plan.url);
      if (plan.branch) args.push(plan.branch);
      const r = await scm.runGit(dir, args, { timeoutMs: 60000 });
      fetched = !!r.ok;
      if (!r.ok) {
        warnings.push(warn(
          `Git fetch failed (${(r.stderr || 'git fetch').split('\n')[0]}). The analysis uses the files already in the folder.`,
          `git fetch 에 실패했습니다(${(r.stderr || 'git fetch').split('\n')[0]}). 폴더에 있는 파일로 분석합니다.`,
        ));
      }
    }
  }
  let changed = null;
  let files = null;
  if (plan.scope === 'changed' && scm) {
    const target = plan.branch || project.mainBranch || 'main';
    changed = await scm.changedLines(dir, plan.ref || null, { target: plan.ref ? undefined : target });
    if (!changed.ok) {
      files = [];
      warnings.push(warn(
        'Git could not list changed files, so this changed-only analysis looked at no files. Check that the folder is a git repository and the reference exists.',
        'git 이 바뀐 파일을 구하지 못해 변경분 분석을 하지 못했습니다. 폴더가 git 저장소인지, 비교 기준이 있는지 확인하세요.',
      ));
    } else {
      files = onlyFiles(plan, changed);
    }
  }
  return {
    // null means the whole configured tree; an array (even empty) limits the walk to those paths.
    options: { ...analysisOptions(plan), ...(Array.isArray(files) ? { onlyFiles: files } : {}) },
    meta: {
      url: plan.url,
      branch: plan.branch,
      fetch: plan.fetch,
      fetched,
      scope: plan.scope,
      ref: plan.ref,
      period: plan.period,
      cron: cronOf(plan),
      content: plan.content,
      base: changed && changed.base,
      changedFiles: Array.isArray(files) ? files.length : null,
    },
    warnings,
  };
}

module.exports = {
  PERIODS, ISSUE_ENGINES, DEFECT_ENGINES,
  normalize, cronOf, scheduleFor, schedulesOf, applyScheduleSave, onlyFiles, analysisOptions, resolveScan,
};
