const { getDb } = require('./connection');

async function getSetting(key, fallback = null) {
  const row = await getDb()('settings').where({ key }).first();
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

async function setSetting(key, value) {
  const db = getDb();
  const payload = JSON.stringify(value);
  const exists = await db('settings').where({ key }).first();
  if (exists) {
    await db('settings').where({ key }).update({ value: payload, updated_at: db.fn.now() });
  } else {
    await db('settings').insert({ key, value: payload });
  }
}

async function deleteSetting(key) {
  await getDb()('settings').where({ key }).del();
}

module.exports = { getSetting, setSetting, deleteSetting };
