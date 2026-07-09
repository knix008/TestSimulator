const express = require('express');
const knex = require('knex');
const { getCurrentConfig, updateDbConfig, buildKnexConfig } = require('../db/connection');

const router = express.Router();

const CLIENT_LABELS = {
  sqlite3: 'SQLite',
  'better-sqlite3': 'SQLite',
  mysql2: 'MySQL/MariaDB',
  pg: 'PostgreSQL',
  mssql: 'MSSQL',
};

function dbConfigSummary(config) {
  const client = config?.client || 'sqlite3';
  const type = client === 'sqlite3' || client === 'better-sqlite3' ? 'sqlite'
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
  if (body.dbType === 'sqlite') return null;
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

// DB 연결 테스트
router.post('/db/test', requireAdmin, async (req, res) => {
  let testDb;
  const validationError = validateDbInput(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const config = buildKnexConfig(req.body);
    if (req.body.dbType !== 'sqlite' && !req.body.password) {
      const current = getCurrentConfig();
      if (current.connection?.password) config.connection.password = current.connection.password;
    }
    testDb = knex(config);
    await testDb.raw('SELECT 1 as result');
    res.json({ ok: true, message: '연결 성공!' });
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
    const config = buildKnexConfig(req.body);

    // 비밀번호 미입력 시 기존 비밀번호 유지
    if (req.body.dbType !== 'sqlite' && !req.body.password) {
      const current = getCurrentConfig();
      if (current.connection?.password) config.connection.password = current.connection.password;
    }

    // Test before saving
    testDb = knex(config);
    await testDb.raw('SELECT 1 as result');
    await testDb.destroy();
    testDb = null;

    const migration = await updateDbConfig(config);
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });

    const message = migration.migrated
      ? `DB 설정이 적용되었습니다. 사용자 ${migration.users}명 및 프로젝트 데이터가 새 DB로 이전되었습니다. 다시 로그인해 주세요.`
      : 'DB 설정이 변경되었습니다. 다시 로그인해 주세요.';

    res.json({ ok: true, requireRelogin: true, migrated: !!migration.migrated, message });
  } catch (err) {
    if (testDb) try { await testDb.destroy(); } catch {}
    res.status(400).json({ error: `저장 실패: ${err.message}` });
  }
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
      requireRelogin: true,
      message: 'SQLite3 기본 설정으로 초기화되었습니다. 다시 로그인해 주세요.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
