function normalizeTimestamp(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{10,13}$/.test(trimmed)) {
      const ms = trimmed.length === 10 ? Number(trimmed) * 1000 : Number(trimmed);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

const TABLE_TIMESTAMP_FIELDS = {
  users: ['created_at', 'updated_at'],
  boards: ['created_at', 'updated_at'],
  cards: ['created_at', 'updated_at'],
  columns: ['created_at'],
  attachments: ['created_at'],
};

function sanitizeRowTimestamps(table, row) {
  const fields = TABLE_TIMESTAMP_FIELDS[table];
  if (!fields || !row) return row;
  const out = { ...row };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(out, field) && out[field] != null) {
      out[field] = normalizeTimestamp(out[field]);
    }
  }
  return out;
}

module.exports = { normalizeTimestamp, sanitizeRowTimestamps };
