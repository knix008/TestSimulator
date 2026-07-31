const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');

const router = express.Router();

function toEventDto(row) {
  return {
    id: row.id,
    uid: row.uid,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description,
    location: row.location,
    start: row.start_time,
    end: row.end_time,
    allDay: !!row.all_day,
    color: row.color,
    recurrence: row.recurrence,
    reminderMinutes: row.reminder_minutes,
    googleEventId: row.google_event_id,
    syncStatus: row.sync_status,
  };
}

// GET /api/events?from=ISO&to=ISO  (range optional)
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    let q = db('events').whereNull('deleted_at');
    if (req.query.from) q = q.where('end_time', '>=', req.query.from);
    if (req.query.to) q = q.where('start_time', '<=', req.query.to);
    const rows = await q.orderBy('start_time', 'asc');
    res.json(rows.map(toEventDto));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await getDb()('events').where({ id: req.params.id }).whereNull('deleted_at').first();
    if (!row) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    res.json(toEventDto(row));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const db = getDb();
    const b = req.body || {};
    if (!b.title || !b.start || !b.end) {
      return res.status(400).json({ error: 'title, start, end 는 필수입니다.' });
    }
    const defaultCal = await db('calendars').where({ is_default: true }).first();
    const [id] = await db('events').insert({
      uid: uuidv4(),
      calendar_id: b.calendarId || (defaultCal ? defaultCal.id : null),
      title: b.title,
      description: b.description || null,
      location: b.location || null,
      start_time: b.start,
      end_time: b.end,
      all_day: b.allDay ? 1 : 0,
      color: b.color || null,
      recurrence: b.recurrence || null,
      reminder_minutes: b.reminderMinutes ?? null,
      sync_status: 'dirty',
    });
    const row = await db('events').where({ id }).first();
    res.status(201).json(toEventDto(row));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const b = req.body || {};
    const existing = await db('events').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    const patch = { updated_at: db.fn.now(), sync_status: 'dirty' };
    if (b.calendarId !== undefined) patch.calendar_id = b.calendarId;
    if (b.title !== undefined) patch.title = b.title;
    if (b.description !== undefined) patch.description = b.description;
    if (b.location !== undefined) patch.location = b.location;
    if (b.start !== undefined) patch.start_time = b.start;
    if (b.end !== undefined) patch.end_time = b.end;
    if (b.allDay !== undefined) patch.all_day = b.allDay ? 1 : 0;
    if (b.color !== undefined) patch.color = b.color;
    if (b.recurrence !== undefined) patch.recurrence = b.recurrence;
    if (b.reminderMinutes !== undefined) patch.reminder_minutes = b.reminderMinutes;
    await db('events').where({ id: req.params.id }).update(patch);
    const row = await db('events').where({ id: req.params.id }).first();
    res.json(toEventDto(row));
  } catch (err) { next(err); }
});

// Soft-delete so the deletion can propagate to Google on next sync
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const row = await db('events').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    if (row.google_event_id) {
      await db('events').where({ id: req.params.id })
        .update({ sync_status: 'deleted', deleted_at: db.fn.now(), updated_at: db.fn.now() });
    } else {
      await db('events').where({ id: req.params.id }).del();
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = (req, res, next) => router(req, res, next);
