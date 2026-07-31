const express = require('express');
const { getDb } = require('../db/connection');
const { syncSubscription } = require('../services/ics-subscription');

const router = express.Router();
const SUB_COLORS = ['#0ea5e9', '#8b5cf6', '#f97316', '#10b981', '#e11d48'];

router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const subs = await db('subscriptions').orderBy('id', 'asc');
    // attach event counts
    for (const s of subs) {
      const row = await db('events').where({ subscription_id: s.id }).count({ c: '*' }).first();
      s.eventCount = row ? row.c : 0;
    }
    res.json(subs);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { name, url, color } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url 은 필수입니다.' });
    const subName = (name && name.trim()) || 'Outlook';
    const count = await db('subscriptions').count({ c: '*' }).first();
    const calColor = color || SUB_COLORS[(count.c || 0) % SUB_COLORS.length];

    // dedicated calendar for this feed
    const [calId] = await db('calendars').insert({ name: subName, color: calColor, visible: true });
    const [id] = await db('subscriptions').insert({ name: subName, url: url.trim(), calendar_id: calId });

    let summary = null, error = null;
    try { summary = await syncSubscription(id); }
    catch (e) { error = e.message; }

    const sub = await db('subscriptions').where({ id }).first();
    res.status(201).json({ subscription: sub, summary, error });
  } catch (err) { next(err); }
});

router.post('/:id/refresh', async (req, res, next) => {
  try {
    const summary = await syncSubscription(req.params.id);
    const sub = await getDb()('subscriptions').where({ id: req.params.id }).first();
    res.json({ ok: true, summary, subscription: sub });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const sub = await db('subscriptions').where({ id: req.params.id }).first();
    if (!sub) return res.status(404).json({ error: '구독을 찾을 수 없습니다.' });
    await db('events').where({ subscription_id: sub.id }).del();
    if (sub.calendar_id) await db('calendars').where({ id: sub.calendar_id }).del();
    await db('subscriptions').where({ id: sub.id }).del();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = (req, res, next) => router(req, res, next);
