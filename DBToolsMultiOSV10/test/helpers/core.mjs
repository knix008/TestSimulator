// Single import point for the application modules under test.
//
// `src/**` is TypeScript and uses Vite-only syntax (`?url` assets, directory
// index resolution). scripts/ts-loader.mjs teaches Node about both, so the
// tests exercise the real source with no build step in between.
import { register } from 'node:module';

register('../../scripts/ts-loader.mjs', import.meta.url);

export const types = await import('../../src/types.ts');
export const schema = await import('../../src/core/schema.ts');
export const serializer = await import('../../src/core/serializer.ts');
export const dataTypes = await import('../../src/core/dataTypes.ts');
export const geometry = await import('../../src/core/geometry.ts');
export const relationshipPath = await import('../../src/core/relationshipPath.ts');
export const layout = await import('../../src/core/layout.ts');
export const undoRedo = await import('../../src/core/undoRedo.ts');
export const sampleSchema = await import('../../src/core/sampleSchema.ts');
export const workspace = await import('../../src/core/workspace.ts');
export const normalization = await import('../../src/core/analysis/normalization.ts');
export const indexAdvisor = await import('../../src/core/analysis/indexAdvisor.ts');
export const report = await import('../../src/core/analysis/report.ts');
export const sqlExporter = await import('../../src/core/export/sqlExporter.ts');
export const exportHelper = await import('../../src/core/export/schemaExportHelper.ts');
export const sqliteDatabase = await import('../../src/core/export/sqliteDatabase.ts');
export const coverPage = await import('../../src/core/export/coverPage.ts');
export const htmlReport = await import('../../src/core/export/htmlReport.ts');
export const reportOptions = await import('../../src/core/export/reportOptions.ts');
export const reportStyle = await import('../../src/core/export/reportStyle.ts');
export const analysisReport = await import('../../src/core/export/analysisReport.ts');
export const imageData = await import('../../src/core/export/imageData.ts');
export const reportFonts = await import('../../src/core/export/reportFonts.ts');
export const diagramImage = await import('../../src/core/export/diagramImage.ts');
export const settings = await import('../../src/core/settings.ts');
export const appInfo = await import('../../src/appInfo.ts');
export const word = await import('../../src/core/export/word.ts');
export const excel = await import('../../src/core/export/excel.ts');
export const sqlDdl = await import('../../src/core/import/sqlDdl.ts');
export const sqliteSchema = await import('../../src/core/import/sqliteSchema.ts');
export const databaseFile = await import('../../src/core/import/databaseFile.ts');
export const vectorIndex = await import('../../src/core/import/vectorIndex/index.ts');
export const fourcc = await import('../../src/core/import/vectorIndex/fourcc.ts');
export const binaryReader = await import('../../src/core/import/vectorIndex/reader.ts');
export const theme = await import('../../src/render/theme.ts');
export const i18n = await import('../../src/i18n/index.ts');

/** A throwaway schema with a single table, handy for focused assertions. */
export function tinySchema(name = 'tiny') {
  const s = schema.newSchema(name);
  s.Tables.push(
    schema.newTable({
      Name: 't',
      Columns: [
        schema.newColumn({ Name: 'id', DataType: 'INTEGER', IsPrimaryKey: true, IsNullable: false }),
      ],
    }),
  );
  return s;
}
