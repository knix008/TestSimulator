import { initSqliteDatabase, getSqliteDatabase } from '../server/db/sqlite.js';

await initSqliteDatabase('./data');
const db = getSqliteDatabase();

const sample = await db.prepare(
  'SELECT id, code, classification, title, category FROM requirements ORDER BY id LIMIT 20',
).all();
console.log('Sample rows:');
for (const row of sample) {
  console.log(row);
}

const stats = await db.prepare(`
  SELECT
    SUM(CASE WHEN code LIKE 'REQ-%' THEN 1 ELSE 0 END) AS req_codes,
    SUM(CASE WHEN code NOT LIKE 'REQ-%' AND code NOT LIKE '__tmp%' AND code NOT LIKE '__import%' THEN 1 ELSE 0 END) AS bad_codes,
    SUM(CASE WHEN TRIM(COALESCE(classification, '')) != '' THEN 1 ELSE 0 END) AS with_classification
  FROM requirements
`).get();
console.log('Stats:', stats);
