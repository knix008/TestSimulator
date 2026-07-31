const express = require('express');
const { getDb } = require('../db/connection');
const { getSetting, setSetting } = require('../db/settings-store');

const router = express.Router();

// Public app preferences (never expose Google tokens here)
const PUBLIC_KEYS = ['weekStartsOn', 'defaultView', 'theme', 'language', 'bgOpacity', 'defaultReminderMinutes'];

router.get('/', async (req, res, next) => {
  try {
    const out = {};
    for (const key of PUBLIC_KEYS) out[key] = await getSetting(key, null);
    res.json(out);
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    for (const key of PUBLIC_KEYS) {
      if (body[key] !== undefined) await setSetting(key, body[key]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Calendars (local groups)
router.get('/calendars', async (req, res, next) => {
  try {
    const rows = await getDb()('calendars').orderBy('id', 'asc');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/calendars', async (req, res, next) => {
  try {
    const db = getDb();
    const { name, color } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name 은 필수입니다.' });
    const [id] = await db('calendars').insert({ name, color: color || '#3b82f6', visible: true });
    res.status(201).json(await db('calendars').where({ id }).first());
  } catch (err) { next(err); }
});

router.put('/calendars/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const patch = {};
    ['name', 'color'].forEach(k => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    if (req.body.visible !== undefined) patch.visible = req.body.visible ? 1 : 0;
    await db('calendars').where({ id: req.params.id }).update(patch);
    res.json(await db('calendars').where({ id: req.params.id }).first());
  } catch (err) { next(err); }
});

router.delete('/calendars/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const cal = await db('calendars').where({ id: req.params.id }).first();
    if (cal && cal.is_default) return res.status(400).json({ error: '기본 캘린더는 삭제할 수 없습니다.' });
    await db('calendars').where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = (req, res, next) => router(req, res, next);
