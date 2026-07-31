/**
 * Bidirectional sync between local SQLite events and a Google Calendar.
 *
 * Strategy:
 *   1) PUSH local changes (dirty create/update, deleted) to Google.
 *   2) PULL Google changes into local, using an incremental syncToken when available.
 *
 * All synced events use the Google "primary" calendar and map to the local
 * default calendar. google_event_id is the join key.
 */
const { getDb } = require('../db/connection');
const { getSetting, setSetting, deleteSetting } = require('../db/settings-store');
const { getAuthedCalendar } = require('./google-client');

const GCAL_ID = 'primary';

function localTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

function toGoogleEvent(row) {
  const ev = {
    summary: row.title || '(제목 없음)',
    description: row.description || undefined,
    location: row.location || undefined,
  };
  if (row.all_day) {
    ev.start = { date: String(row.start_time).slice(0, 10) };
    ev.end = { date: String(row.end_time).slice(0, 10) };
  } else {
    const tz = localTimeZone();
    ev.start = { dateTime: new Date(row.start_time).toISOString(), timeZone: tz };
    ev.end = { dateTime: new Date(row.end_time).toISOString(), timeZone: tz };
  }
  if (row.reminder_minutes != null) {
    ev.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: row.reminder_minutes }] };
  }
  return ev;
}

function fromGoogleEvent(g, defaultCalId) {
  const allDay = !!(g.start && g.start.date);
  const start = allDay ? `${g.start.date}T00:00:00` : g.start.dateTime;
  const end = allDay ? `${g.end.date}T00:00:00` : g.end.dateTime;
  return {
    calendar_id: defaultCalId,
    title: g.summary || '(제목 없음)',
    description: g.description || null,
    location: g.location || null,
    start_time: start,
    end_time: end,
    all_day: allDay ? 1 : 0,
    google_event_id: g.id,
    etag: g.etag || null,
    sync_status: 'synced',
    deleted_at: null,
  };
}

async function pushChanges(calendar, summary) {
  const db = getDb();

  // Deletions
  const deleted = await db('events').where({ sync_status: 'deleted' }).whereNotNull('google_event_id');
  for (const row of deleted) {
    try {
      await calendar.events.delete({ calendarId: GCAL_ID, eventId: row.google_event_id });
    } catch (err) {
      if (err.code !== 404 && err.code !== 410) throw err; // already gone → fine
    }
    await db('events').where({ id: row.id }).del();
    summary.pushedDeleted++;
  }

  // Creates + updates
  const dirty = await db('events').where({ sync_status: 'dirty' }).whereNull('deleted_at');
  for (const row of dirty) {
    const body = toGoogleEvent(row);
    if (row.google_event_id) {
      const resp = await calendar.events.update({
        calendarId: GCAL_ID, eventId: row.google_event_id, requestBody: body,
      });
      await db('events').where({ id: row.id }).update({
        etag: resp.data.etag || null, sync_status: 'synced',
      });
      summary.pushedUpdated++;
    } else {
      const resp = await calendar.events.insert({ calendarId: GCAL_ID, requestBody: body });
      await db('events').where({ id: row.id }).update({
        google_event_id: resp.data.id, etag: resp.data.etag || null, sync_status: 'synced',
      });
      summary.pushedCreated++;
    }
  }
}

async function pullChanges(calendar, summary) {
  const db = getDb();
  const defaultCal = await db('calendars').where({ is_default: true }).first();
  const defaultCalId = defaultCal ? defaultCal.id : null;

  let syncToken = await getSetting('googleSyncToken', null);
  let pageToken = undefined;

  do {
    const params = { calendarId: GCAL_ID, singleEvents: true, showDeleted: true, maxResults: 250 };
    if (syncToken) params.syncToken = syncToken;
    else params.timeMin = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(); // 1y back on full sync
    if (pageToken) params.pageToken = pageToken;

    let resp;
    try {
      resp = await calendar.events.list(params);
    } catch (err) {
      if (err.code === 410) { // sync token expired → full resync
        await deleteSetting('googleSyncToken');
        syncToken = null; pageToken = undefined;
        continue;
      }
      throw err;
    }

    for (const g of resp.data.items || []) {
      const existing = await db('events').where({ google_event_id: g.id }).first();
      if (g.status === 'cancelled') {
        if (existing) { await db('events').where({ id: existing.id }).del(); summary.pulledDeleted++; }
        continue;
      }
      const mapped = fromGoogleEvent(g, existing ? existing.calendar_id : defaultCalId);
      if (existing) {
        await db('events').where({ id: existing.id }).update({ ...mapped, updated_at: db.fn.now() });
        summary.pulledUpdated++;
      } else {
        const { v4: uuidv4 } = require('uuid');
        await db('events').insert({ ...mapped, uid: uuidv4() });
        summary.pulledCreated++;
      }
    }

    pageToken = resp.data.nextPageToken;
    if (resp.data.nextSyncToken) await setSetting('googleSyncToken', resp.data.nextSyncToken);
  } while (pageToken);
}

async function runSync() {
  const calendar = await getAuthedCalendar();
  const summary = {
    pushedCreated: 0, pushedUpdated: 0, pushedDeleted: 0,
    pulledCreated: 0, pulledUpdated: 0, pulledDeleted: 0,
  };
  await pushChanges(calendar, summary);
  await pullChanges(calendar, summary);
  await setSetting('googleLastSync', new Date().toISOString());
  return summary;
}

module.exports = { runSync };
