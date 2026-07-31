const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/connection');
const { parseIcs } = require('./ics-parser');

// Stable key for an event within a feed (UID if present, else title+times).
function keyFor(ev) {
  return ev.uid || `nouid:${ev.title}|${ev.start}|${ev.end}`;
}

async function fetchIcsText(url) {
  const target = url.replace(/^webcal:\/\//i, 'https://');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(target, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function syncSubscription(subId) {
  const db = getDb();
  const sub = await db('subscriptions').where({ id: subId }).first();
  if (!sub) throw new Error('구독을 찾을 수 없습니다.');

  let summary = { created: 0, updated: 0, deleted: 0, total: 0 };
  try {
    const text = await fetchIcsText(sub.url);
    const parsed = parseIcs(text);
    summary.total = parsed.length;

    const seen = new Set();
    for (const ev of parsed) {
      const key = keyFor(ev);
      seen.add(key);
      const existing = await db('events')
        .where({ subscription_id: sub.id, source_uid: key }).first();
      const row = {
        calendar_id: sub.calendar_id,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        start_time: ev.start,
        end_time: ev.end,
        all_day: ev.allDay ? 1 : 0,
        sync_status: 'subscription',
      };
      if (existing) {
        await db('events').where({ id: existing.id }).update({ ...row, updated_at: db.fn.now() });
        summary.updated++;
      } else {
        await db('events').insert({
          ...row, uid: uuidv4(), subscription_id: sub.id, source_uid: key,
        });
        summary.created++;
      }
    }

    // prune events that vanished from the feed
    const current = await db('events').where({ subscription_id: sub.id });
    for (const row of current) {
      if (!seen.has(row.source_uid)) {
        await db('events').where({ id: row.id }).del();
        summary.deleted++;
      }
    }

    await db('subscriptions').where({ id: sub.id })
      .update({ last_fetched: db.fn.now(), last_status: 'ok', updated_at: db.fn.now() });
    return summary;
  } catch (err) {
    await db('subscriptions').where({ id: sub.id })
      .update({ last_fetched: db.fn.now(), last_status: 'error', updated_at: db.fn.now() });
    throw err;
  }
}

async function syncAllSubscriptions() {
  const db = getDb();
  const subs = await db('subscriptions');
  for (const s of subs) {
    try { await syncSubscription(s.id); }
    catch (err) { console.warn(`[ICS] 구독 동기화 실패 (${s.name}):`, err.message); }
  }
}

module.exports = { syncSubscription, syncAllSubscriptions };
