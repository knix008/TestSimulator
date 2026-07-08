import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { requireRole } from '../auth/middleware.js';
import { OllamaClient } from '../lib/ollama.js';
import { listEmptyFields } from '../lib/ollamaPrompts.js';

const router = Router();

async function getSetting(db, key, fallback = '') {
  const row = await db.prepare('SELECT value FROM app_settings WHERE setting_key = ?').get(key);
  return row?.value || fallback;
}

async function setSetting(db, key, value) {
  const existing = await db.prepare('SELECT setting_key FROM app_settings WHERE setting_key = ?').get(key);
  if (existing) {
    await db.prepare('UPDATE app_settings SET value = ? WHERE setting_key = ?').run(value, key);
  } else {
    await db.prepare('INSERT INTO app_settings (setting_key, value) VALUES (?, ?)').run(key, value);
  }
}

router.get('/status', requireRole('VIEWER'), async (req, res) => {
  const db = getDatabase();
  const baseUrl = await getSetting(db, 'ollama_base_url', 'http://127.0.0.1:11434');
  const model = await getSetting(db, 'ollama_model', '');
  const client = new OllamaClient(baseUrl);

  try {
    const available = await client.isAvailable();
    const models = available ? await client.listModels() : [];
    res.json({ available, baseUrl, model, models });
  } catch (err) {
    res.json({ available: false, baseUrl, model, models: [], error: err.message });
  }
});

router.get('/settings', requireRole('EDITOR'), async (req, res) => {
  const db = getDatabase();
  res.json({
    baseUrl: await getSetting(db, 'ollama_base_url', 'http://127.0.0.1:11434'),
    model: await getSetting(db, 'ollama_model', ''),
  });
});

router.put('/settings', requireRole('EDITOR'), async (req, res) => {
  const { baseUrl, model } = req.body || {};
  const db = getDatabase();
  if (baseUrl) await setSetting(db, 'ollama_base_url', baseUrl);
  if (model !== undefined) await setSetting(db, 'ollama_model', model);
  res.json({
    baseUrl: await getSetting(db, 'ollama_base_url', 'http://127.0.0.1:11434'),
    model: await getSetting(db, 'ollama_model', ''),
  });
});

async function resolveOllamaClient(db) {
  const baseUrl = await getSetting(db, 'ollama_base_url', 'http://127.0.0.1:11434');
  const preferredModel = await getSetting(db, 'ollama_model', '');
  const client = new OllamaClient(baseUrl);
  const available = await client.isAvailable();
  if (!available) {
    const error = new Error('Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.');
    error.status = 503;
    throw error;
  }
  const model = await client.resolveModel(preferredModel);
  return { client, model };
}

router.post('/refine', requireRole('EDITOR'), async (req, res) => {
  const { title, description, category, classification, priority, status, locale, fillGaps } = req.body || {};
  if (!title && !description) {
    return res.status(400).json({ error: '정제할 title 또는 description이 필요합니다.' });
  }

  const db = getDatabase();
  const requirement = {
    title, description, category, classification, priority, status,
  };

  try {
    const { client, model } = await resolveOllamaClient(db);
    const refined = await client.refineRequirement(model, requirement, locale || 'ko', {
      fillGaps: Boolean(fillGaps),
      emptyFields: listEmptyFields(requirement, ['title', 'description', 'category', 'classification']),
    });

    res.json({ model, refined });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/refine-testcase', requireRole('EDITOR'), async (req, res) => {
  const {
    title,
    description,
    steps,
    expectedResult,
    status,
    requirementTitle,
    requirementDescription,
    locale,
    fillGaps,
  } = req.body || {};

  if (!title && !description && !steps && !expectedResult) {
    return res.status(400).json({ error: '정제할 테스트 케이스 내용이 필요합니다.' });
  }

  const db = getDatabase();
  const testCase = {
    title,
    description,
    steps,
    expectedResult,
    status,
  };

  try {
    const { client, model } = await resolveOllamaClient(db);
    const refined = await client.refineTestCase(model, testCase, locale || 'ko', {
      fillGaps: Boolean(fillGaps),
      requirementTitle: requirementTitle || '',
      requirementDescription: requirementDescription || '',
      emptyFields: listEmptyFields(testCase, ['title', 'description', 'steps', 'expectedResult']),
    });

    res.json({ model, refined });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
