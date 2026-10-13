const express = require('express');
const knex = require('knex');
const { getCurrentConfig, updateDbConfig, buildKnexConfig } = require('../db/connection');
const { ensureDatabaseReady } = require('../db/ensure-database');

const router = express.Router();

const CLIENT_LABELS = {
  json: 'JSON',
  sqlite3: 'SQLite',
  'better-sqlite3': 'SQLite',
  mysql2: 'MySQL/MariaDB',
  pg: 'PostgreSQL',
  mssql: 'MSSQL',
};

function dbConfigSummary(config) {
  const client = config?.client || 'sqlite3';
  const type = client === 'json' ? 'json'
    : client === 'sqlite3' || client === 'better-sqlite3' ? 'sqlite'
    : client === 'mysql2' ? 'mysql'
    : client === 'pg' ? 'postgresql'
    : client === 'mssql' ? 'mssql'
    : client;
  const host = config?.connection?.host || config?.connection?.server || '';
  return { type, label: CLIENT_LABELS[client] || client, host };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  next();
}

// DB 요약 (상태 표시줄용, 인증된 사용자)
router.get('/db-config', requireAuth, (req, res) => {
  try {
    res.json(dbConfigSummary(getCurrentConfig()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DB 설정 조회
router.get('/db', requireAdmin, (req, res) => {
  try {
    const config = getCurrentConfig();
    const safe = JSON.parse(JSON.stringify(config));
    if (safe.connection && safe.connection.password) safe.connection.password = '';
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function validateDbInput(body) {
  if (body.dbType === 'sqlite' || body.dbType === 'json') return null;
  const missing = [];
  if (!body.host?.trim()) missing.push('host');
  if (!body.database?.trim()) missing.push('database');
  if (!body.username?.trim()) missing.push('username');
  if (missing.length) {
    const labels = { host: '호스트', database: '데이터베이스명', username: '사용자' };
    return `필수 항목을 입력해 주세요: ${missing.map(k => labels[k] || k).join(', ')}`;
  }
  return null;
}

function applySavedPassword(body, config) {
  if (body.dbType !== 'sqlite' && !body.password) {
    const current = getCurrentConfig();
    if (current.connection?.password) config.connection.password = current.connection.password;
  }
  return config;
}

async function prepareDbConnection(body) {
  const config = buildKnexConfig(body);
  applySavedPassword(body, config);
  const ensureResult = await ensureDatabaseReady(body.dbType, config);
  return { config, ensureResult };
}

function connectionSuccessMessage(ensureResult) {
  if (ensureResult?.created) {
    return '연결 성공! 데이터베이스가 없어 새로 생성했습니다.';
  }
  return '연결 성공!';
}

// DB 연결 테스트
router.post('/db/test', requireAdmin, async (req, res) => {
  let testDb;
  const validationError = validateDbInput(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  if (req.body.dbType === 'json') {
    return res.json({
      ok: true,
      message: 'JSON 파일로 저장합니다. 데이터베이스는 사용하지 않습니다.',
      dbCreated: false,
    });
  }
  try {
    const { config, ensureResult } = await prepareDbConnection(req.body);
    testDb = knex(config);
    await testDb.raw('SELECT 1 as result');
    res.json({ ok: true, message: connectionSuccessMessage(ensureResult), dbCreated: !!ensureResult.created });
  } catch (err) {
    res.status(400).json({ error: `연결 실패: ${err.message}` });
  } finally {
    if (testDb) try { await testDb.destroy(); } catch {}
  }
});

// DB 설정 저장 및 적용
router.post('/db', requireAdmin, async (req, res) => {
  let testDb;
  const validationError = validateDbInput(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const { config, ensureResult } = await prepareDbConnection(req.body);

    if (config.client !== 'json') {
      testDb = knex(config);
      await testDb.raw('SELECT 1 as result');
      await testDb.destroy();
      testDb = null;
    }

    const migration = await updateDbConfig(config);
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });

    const createdMsg = ensureResult.created ? ' 데이터베이스를 새로 생성했습니다.' : '';
    const message = config.client === 'json'
      ? (migration.migrated
        ? '데이터베이스 없이 JSON 파일로 저장합니다. 프로젝트 데이터를 옮겼습니다.'
        : '데이터베이스 없이 JSON 파일로 저장합니다.')
      : (migration.migrated
        ? `DB 설정이 적용되었습니다. 사용자 ${migration.users}명 및 프로젝트 데이터가 새 DB로 이전되었습니다.${createdMsg}`
        : `DB 설정이 변경되었습니다.${createdMsg}`);

    res.json({ ok: true, requireRelogin: false, migrated: !!migration.migrated, message });
  } catch (err) {
    if (testDb) try { await testDb.destroy(); } catch {}
    res.status(400).json({ error: `저장 실패: ${err.message}` });
  }
});

router.post('/workspace/save', requireAuth, async (req, res) => {
  try {
    const { persistJsonWorkspace, captureBaseline } = require('../db/json-store');
    const result = await persistJsonWorkspace();
    await captureBaseline();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/workspace/revert', requireAuth, async (req, res) => {
  try {
    const { revertJsonWorkspace } = require('../db/json-store');
    res.json(await revertJsonWorkspace());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/app', requireAuth, (req, res) => {
  const { readAppSettings } = require('../db/app-settings');
  const stored = readAppSettings();
  if (!stored) return res.json({ theme: 'light', lang: 'ko', saved: false });
  res.json({ ...stored, saved: true });
});

router.put('/app', requireAuth, (req, res) => {
  const theme = req.body?.theme;
  const lang = req.body?.lang;
  if (theme != null && theme !== 'light' && theme !== 'dark') {
    return res.status(400).json({ error: '지원하지 않는 테마입니다.' });
  }
  if (lang != null && lang !== 'ko' && lang !== 'en') {
    return res.status(400).json({ error: '지원하지 않는 언어입니다.' });
  }
  const { writeAppSettings } = require('../db/app-settings');
  res.json(writeAppSettings({
    theme,
    lang,
    themeId: req.body?.themeId,
    customThemes: req.body?.customThemes,
  }));
});

// SQLite로 초기화
router.post('/db/reset', requireAdmin, async (req, res) => {
  try {
    const { getDataPath } = require('../db/connection');
    const path = require('path');
    const config = {
      client: 'sqlite3',
      connection: { filename: path.join(getDataPath(), 'kanban.db') },
      useNullAsDefault: true
    };
    await updateDbConfig(config);
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.json({
      ok: true,
      requireRelogin: false,
      message: 'SQLite3 기본 설정으로 초기화되었습니다.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
