// Regenerate template/ — the OnlineShop sample files shipped with the app.
// Run with: npm run make:template
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

register('./ts-loader.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../template');
mkdirSync(outDir, { recursive: true });

const { createOnlineShopSchema } = await import('../src/core/sampleSchema.ts');
const { exportSql } = await import('../src/core/export/sqlExporter.ts');
const { cloneForTarget } = await import('../src/core/export/schemaExportHelper.ts');
const { exportSqliteDatabase } = await import('../src/core/export/sqliteDatabase.ts');
const { writeReport } = await import('../src/core/analysis/report.ts');
const { serializeToString } = await import('../src/core/serializer.ts');

const sample = createOnlineShopSchema();

const files = [
  ['OnlineShop.mdprj', serializeToString(sample)],
  ['OnlineShop_report.md', writeReport(sample)],
  ['OnlineShop_postgres.sql', exportSql(cloneForTarget(sample, 'PostgreSQL'))],
  ['OnlineShop_mysql.sql', exportSql(cloneForTarget(sample, 'MySQL'))],
  ['OnlineShop_mariadb.sql', exportSql(cloneForTarget(sample, 'MariaDB'))],
  ['OnlineShop_sqlserver.sql', exportSql(cloneForTarget(sample, 'SqlServer'))],
  ['OnlineShop_sqlite.sql', exportSql(cloneForTarget(sample, 'SQLite'))],
];

for (const [name, contents] of files) {
  writeFileSync(path.join(outDir, name), contents, 'utf8');
  console.log('wrote', name);
}

const db = await exportSqliteDatabase(sample);
writeFileSync(path.join(outDir, 'OnlineShop_sqlite.db'), Buffer.from(db));
writeFileSync(path.join(outDir, 'OnlineShop.db'), Buffer.from(db));
console.log('wrote OnlineShop_sqlite.db and OnlineShop.db');
