const express = require('express');
const knex = require('knex');
const { getCurrentConfig, updateDbConfig, buildKnexConfig } = require('../db/connection');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  next();
}

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

// DB 연결 테스트
router.post('/db/test', requireAdmin, async (req, res) => {
  let testDb;
  try {
    const config = buildKnexConfig(req.body);
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
  try {
    const config = buildKnexConfig(req.body);

    // Test before saving
    testDb = knex(config);
    await testDb.raw('SELECT 1 as result');
    await testDb.destroy();
    testDb = null;

    await updateDbConfig(config);
    res.json({ ok: true, message: 'DB 설정이 변경되었습니다. 새로운 DB로 마이그레이션이 완료되었습니다.' });
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
      client: 'better-sqlite3',
      connection: { filename: path.join(getDataPath(), 'kanban.db') },
      useNullAsDefault: true
    };
    await updateDbConfig(config);
    res.json({ ok: true, message: 'SQLite3 기본 설정으로 초기화되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
