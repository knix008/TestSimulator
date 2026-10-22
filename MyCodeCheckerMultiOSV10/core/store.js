'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { LANGS } = require('./languages');
const { listRules } = require('./analyze');
const { SONAR_WAY } = require('./qualitygate');
const { DEFAULT_POLICY, VIEWS } = require('./coverity');

function defaultConfigDir() {
  if (process.env.MCC_USER_DATA) return process.env.MCC_USER_DATA;
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'MyCodeChecker');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'MyCodeChecker');
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'MyCodeChecker');
}

function freshWorkspace() {
  const rules = listRules();
  const profiles = Object.keys(LANGS).map((lang) => ({
    id: `${lang}-checker-way`,
    name: 'Checker way',
    language: lang,
    isDefault: true,
    inactive: [],
    overrides: {},
  }));
  profiles.unshift({
    id: 'all-checker-way',
    name: 'Checker way',
    language: '*',
    isDefault: true,
    inactive: [],
    overrides: {},
  });
  return {
    version: 1,
    settings: {
      theme: 'midnight',
      language: 'ko',
      customThemes: [],
      exclusions: ['**/*.min.js', '**/vendor/**', '**/node_modules/**', '**/dist/**', '**/build/**'],
      newCode: 'previous',
      newCodeDays: 30,
      maxFiles: 8000,
      webhookUrl: '',
      assignee: '',
      limits: {},
      showStartOnLaunch: true,
    },
    gates: [{ ...SONAR_WAY, conditions: SONAR_WAY.conditions.map((c) => ({ ...c })) }],
    profiles,
    customRules: [],
    projects: [],
    portfolios: [],
    tasks: [],
    users: [],
    activeProjectId: null,
    ruleCount: rules.length,
    coverity: {
      policies: [{ ...DEFAULT_POLICY, conditions: DEFAULT_POLICY.conditions.map((c) => ({ ...c })) }],
      components: [],
      models: [],
      views: VIEWS.map((v) => ({ ...v })),
    },
  };
}

function createStore(configDir) {
  const dir = configDir || defaultConfigDir();
  const file = path.join(dir, 'workspace.json');
  function load() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const fresh = freshWorkspace();
      const coverity = data.coverity || {};
      return {
        ...fresh,
        ...data,
        settings: { ...fresh.settings, ...(data.settings || {}) },
        coverity: {
          ...fresh.coverity,
          ...coverity,
          policies: coverity.policies && coverity.policies.length ? coverity.policies : fresh.coverity.policies,
          views: coverity.views && coverity.views.length ? coverity.views : fresh.coverity.views,
          components: coverity.components || [],
          models: coverity.models || [],
        },
      };
    } catch {
      return freshWorkspace();
    }
  }
  function save(data) {
    fs.mkdirSync(dir, { recursive: true });
    const next = data && data.version ? data : { ...load(), ...data };
    fs.writeFileSync(file, JSON.stringify(next, null, 2));
    return next;
  }
  return { dir, file, load, save };
}

function projectIdFor(folder) {
  return crypto.createHash('sha1').update(path.resolve(folder).toLowerCase()).digest('hex').slice(0, 12);
}

module.exports = { defaultConfigDir, freshWorkspace, createStore, projectIdFor };
