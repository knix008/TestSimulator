// Open / save / import / export, on top of the platform host.
import { useCallback } from 'react';
import type { DbSchema, DbTargetType } from '../types';
import { writeReport } from '../core/analysis/report';
import { exportDiagramImage, renderDiagramDataUrl, type DiagramImageFormat } from '../core/export/diagramImage';
import { exportExcel } from '../core/export/excel';
import { buildHtmlReport } from '../core/export/htmlReport';
import { cloneForTarget } from '../core/export/schemaExportHelper';
import { exportSql } from '../core/export/sqlExporter';
import { exportSqliteDatabase } from '../core/export/sqliteDatabase';
import { exportWord } from '../core/export/word';
import { importDatabaseFile } from '../core/import/databaseFile';
import { createOnlineShopSchema } from '../core/sampleSchema';
import { deserialize, serializeToString } from '../core/serializer';
import { pushRecentFile } from '../core/settings';
import { baseName, getHost, stripExtension } from '../platform';
import { t } from '../i18n';
import type { ThemeId } from '../render/theme';

export const PROJECT_FILTER = [
  { name: 'DBTools Project', extensions: ['mdprj'] },
  { name: 'JSON', extensions: ['json'] },
];

export const DATABASE_FILTER = [
  {
    name: '지원 DB 파일',
    extensions: ['db', 'sqlite', 'sqlite3', 'db3', 'sql', 'faiss', 'findex', 'hnsw', 'index', 'mdprj'],
  },
  { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
  { name: 'Vector Index', extensions: ['faiss', 'findex', 'hnsw', 'index'] },
  { name: 'SQL DDL', extensions: ['sql'] },
  { name: '모든 파일', extensions: ['*'] },
];

export interface FileActionCallbacks {
  onLoaded: (schema: DbSchema, path: string | null, message: string) => void;
  onSaved: (path: string, message: string) => void;
  onStatus: (message: string) => void;
  onError: (message: string, details?: string | null) => void;
  onRecentFilesChanged: (files: string[]) => void;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorDetails(err: unknown): string | null {
  return err instanceof Error ? (err.stack ?? null) : null;
}

export function useFileActions(
  getSchema: () => DbSchema,
  getCurrentPath: () => string | null,
  getRecentMax: () => number,
  getTheme: () => ThemeId,
  callbacks: FileActionCallbacks,
) {
  const host = getHost();

  const remember = useCallback(
    async (path: string) => {
      if (host.kind !== 'electron') return;
      callbacks.onRecentFilesChanged(await pushRecentFile(path, getRecentMax()));
    },
    [host, callbacks, getRecentMax],
  );

  /** Read a project or database file already resolved to bytes. */
  const loadFromBytes = useCallback(
    async (fileName: string, path: string, bytes: Uint8Array) => {
      const { schema, format } = await importDatabaseFile(fileName, bytes);
      if (format === 'Project') {
        callbacks.onLoaded(schema, path, t('StatusLoaded', path));
        await remember(path);
      } else {
        // Imported schemas are not yet bound to a project file.
        callbacks.onLoaded(
          schema,
          null,
          t('StatusImported', format, path, schema.Tables.length, schema.Relationships.length),
        );
      }
    },
    [callbacks, remember],
  );

  const openProject = useCallback(async () => {
    try {
      const file = await host.openFile({ filters: PROJECT_FILTER });
      if (!file) return;
      const schema = deserialize(new TextDecoder('utf-8').decode(file.bytes));
      callbacks.onLoaded(schema, file.path, t('StatusLoaded', file.path));
      await remember(file.path);
    } catch (err) {
      callbacks.onError(t('OpenFailed', errorText(err)), errorDetails(err));
    }
  }, [host, callbacks, remember]);

  const openDatabase = useCallback(async () => {
    try {
      const file = await host.openFile({ filters: DATABASE_FILTER });
      if (!file) return;
      await loadFromBytes(file.name, file.path, file.bytes);
    } catch (err) {
      callbacks.onError(t('ImportFailed', errorText(err)), errorDetails(err));
    }
  }, [host, callbacks, loadFromBytes]);

  const openPath = useCallback(
    async (path: string) => {
      try {
        const file = await host.readFileByPath(path);
        if (!file) throw new Error(path);
        await loadFromBytes(file.name, file.path, file.bytes);
      } catch (err) {
        callbacks.onError(t('OpenFailed', errorText(err)), errorDetails(err));
      }
    },
    [host, callbacks, loadFromBytes],
  );

  const saveAs = useCallback(async (): Promise<boolean> => {
    try {
      const schema = getSchema();
      const suggested = `${schema.Name || 'schema'}.mdprj`;
      const path = await host.saveFile({
        suggestedName: suggested,
        filters: PROJECT_FILTER,
        data: serializeToString(schema),
      });
      if (!path) return false;
      callbacks.onSaved(path, t('SaveDone', path));
      await remember(path);
      return true;
    } catch (err) {
      callbacks.onError(t('SaveFailed', errorText(err)), errorDetails(err));
      return false;
    }
  }, [host, getSchema, callbacks, remember]);

  const save = useCallback(async (): Promise<boolean> => {
    const path = getCurrentPath();
    if (!path) return saveAs();
    try {
      const written = await host.writeFile(path, serializeToString(getSchema()));
      if (!written) return false;
      callbacks.onSaved(written, t('SaveDone', written));
      return true;
    } catch (err) {
      callbacks.onError(t('SaveFailed', errorText(err)), errorDetails(err));
      return false;
    }
  }, [host, getSchema, getCurrentPath, callbacks, saveAs]);

  /** Common tail for every export: write the bytes and report the result. */
  const writeExport = useCallback(
    async (suggestedName: string, filters: { name: string; extensions: string[] }[], data: Uint8Array | string) => {
      const path = await host.saveFile({ suggestedName, filters, data });
      if (path) callbacks.onStatus(t('ExportDone', path));
      return path;
    },
    [host, callbacks],
  );

  const exportName = useCallback(
    (extension: string) => {
      const schema = getSchema();
      const current = getCurrentPath();
      const stem = current ? stripExtension(baseName(current)) : schema.Name || 'schema';
      return `${stem}.${extension}`;
    },
    [getSchema, getCurrentPath],
  );

  const runExport = useCallback(
    async (task: () => Promise<unknown>) => {
      try {
        await task();
      } catch (err) {
        callbacks.onError(t('ExportFailed', errorText(err)), errorDetails(err));
      }
    },
    [callbacks],
  );

  const exportJson = useCallback(
    () =>
      runExport(() =>
        writeExport(exportName('json'), [{ name: 'JSON', extensions: ['json'] }], serializeToString(getSchema())),
      ),
    [runExport, writeExport, exportName, getSchema],
  );

  const exportMarkdown = useCallback(
    () =>
      runExport(() =>
        writeExport(
          exportName('md'),
          [{ name: 'Markdown', extensions: ['md'] }],
          writeReport(getSchema(), { projectPath: getCurrentPath() }),
        ),
      ),
    [runExport, writeExport, exportName, getSchema, getCurrentPath],
  );

  const exportSqlCurrent = useCallback(
    () =>
      runExport(() =>
        writeExport(exportName('sql'), [{ name: 'SQL', extensions: ['sql'] }], exportSql(getSchema())),
      ),
    [runExport, writeExport, exportName, getSchema],
  );

  const exportSqlFor = useCallback(
    (target: DbTargetType) =>
      runExport(() => {
        const converted = cloneForTarget(getSchema(), target);
        const stem = stripExtension(exportName('sql'));
        return writeExport(
          `${stem}_${target.toLowerCase()}.sql`,
          [{ name: 'SQL', extensions: ['sql'] }],
          exportSql(converted),
        );
      }),
    [runExport, writeExport, exportName, getSchema],
  );

  const exportSqliteDb = useCallback(
    () =>
      runExport(async () => {
        const bytes = await exportSqliteDatabase(getSchema());
        return writeExport(exportName('db'), [{ name: 'SQLite DB', extensions: ['db'] }], bytes);
      }),
    [runExport, writeExport, exportName, getSchema],
  );

  const exportImage = useCallback(
    (format: DiagramImageFormat) =>
      runExport(async () => {
        const bytes = await exportDiagramImage(getSchema(), format, {
          theme: getTheme(),
          transparent: format === 'png',
        });
        return writeExport(
          exportName(format === 'jpeg' ? 'jpg' : format),
          [{ name: format.toUpperCase(), extensions: [format === 'jpeg' ? 'jpg' : format] }],
          bytes,
        );
      }),
    [runExport, writeExport, exportName, getSchema, getTheme],
  );

  /** Rendered ERD to embed in the Excel / Word / PDF reports (skipped if empty). */
  const diagramDataUrl = useCallback((): string | null => {
    try {
      return renderDiagramDataUrl(getSchema(), { theme: 'light', scale: 2 });
    } catch {
      return null;
    }
  }, [getSchema]);

  const exportExcelFile = useCallback(
    () =>
      runExport(async () => {
        const bytes = await exportExcel(getSchema(), {
          projectPath: getCurrentPath(),
          erdImageDataUrl: diagramDataUrl(),
        });
        return writeExport(exportName('xlsx'), [{ name: 'Excel', extensions: ['xlsx'] }], bytes);
      }),
    [runExport, writeExport, exportName, getSchema, getCurrentPath, diagramDataUrl],
  );

  const exportWordFile = useCallback(
    () =>
      runExport(async () => {
        const bytes = await exportWord(getSchema(), {
          projectPath: getCurrentPath(),
          erdImageDataUrl: diagramDataUrl(),
        });
        return writeExport(exportName('docx'), [{ name: 'Word', extensions: ['docx'] }], bytes);
      }),
    [runExport, writeExport, exportName, getSchema, getCurrentPath, diagramDataUrl],
  );

  const exportPdf = useCallback(
    () =>
      runExport(async () => {
        const html = buildHtmlReport(getSchema(), {
          projectPath: getCurrentPath(),
          erdImageDataUrl: diagramDataUrl(),
        });
        const path = await host.printToPdf(html, exportName('pdf'));
        callbacks.onStatus(path ? t('ExportDone', path) : t('PdfPrintTitle'));
      }),
    [runExport, host, exportName, getSchema, getCurrentPath, diagramDataUrl, callbacks],
  );

  /** Regenerate every OnlineShop sample file into a chosen folder. */
  const generateSamples = useCallback(
    () =>
      runExport(async () => {
        const sample = createOnlineShopSchema();
        const files: { name: string; data: Uint8Array | string }[] = [
          { name: 'OnlineShop.mdprj', data: serializeToString(sample) },
          { name: 'OnlineShop_report.md', data: writeReport(sample) },
          { name: 'OnlineShop_postgres.sql', data: exportSql(cloneForTarget(sample, 'PostgreSQL')) },
          { name: 'OnlineShop_mysql.sql', data: exportSql(cloneForTarget(sample, 'MySQL')) },
          { name: 'OnlineShop_mariadb.sql', data: exportSql(cloneForTarget(sample, 'MariaDB')) },
          { name: 'OnlineShop_sqlserver.sql', data: exportSql(cloneForTarget(sample, 'SqlServer')) },
          { name: 'OnlineShop_sqlite.sql', data: exportSql(cloneForTarget(sample, 'SQLite')) },
          { name: 'OnlineShop_sqlite.db', data: await exportSqliteDatabase(sample) },
        ];

        const directory = await host.chooseDirectory();
        if (host.kind === 'electron' && !directory) return;
        const count = await host.writeFilesToDirectory(directory ?? '', files);
        callbacks.onStatus(t('SampleDone', count));
      }),
    [runExport, host, callbacks],
  );

  /** Load the OnlineShop sample straight into the editor. */
  const loadSample = useCallback(() => {
    const sample = createOnlineShopSchema();
    callbacks.onLoaded(sample, null, t('StatusLoaded', 'OnlineShop'));
  }, [callbacks]);

  return {
    openProject,
    openDatabase,
    openPath,
    save,
    saveAs,
    exportJson,
    exportMarkdown,
    exportSqlCurrent,
    exportSqlFor,
    exportSqliteDb,
    exportImage,
    exportExcelFile,
    exportWordFile,
    exportPdf,
    generateSamples,
    loadSample,
  };
}
