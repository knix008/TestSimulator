// Port of Import/DbFileFormatDetector.cs + DatabaseFileImporter.cs
import type { DbSchema } from '../../types';
import { deserialize } from '../serializer';
import { importSqlDdl } from './sqlDdl';
import { hasSqliteHeader, importSqliteSchema, isSqliteExtension } from './sqliteSchema';
import { detectVectorIndex, importVectorIndex } from './vectorIndex';

export type DbFileFormat =
  | 'Unknown'
  | 'Sqlite'
  | 'SqlDdl'
  | 'Access'
  | 'SqlServer'
  | 'VectorIndex'
  | 'Project';

export const DB_FILE_EXTENSIONS = [
  '.db',
  '.sqlite',
  '.sqlite3',
  '.db3',
  '.sql',
  '.mdf',
  '.mdb',
  '.accdb',
  '.faiss',
  '.findex',
  '.hnsw',
  '.index',
  '.mdprj',
  '.json',
];

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.substring(dot).toLowerCase();
}

export function detectFormat(fileName: string, bytes: Uint8Array): DbFileFormat {
  const ext = extensionOf(fileName);
  if (ext === '.mdprj') return 'Project';
  if (hasSqliteHeader(bytes) || isSqliteExtension(ext)) return 'Sqlite';
  if (detectVectorIndex(fileName, bytes) !== 'Unknown') return 'VectorIndex';

  switch (ext) {
    case '.sql':
      return 'SqlDdl';
    case '.json':
      return 'Project';
    case '.mdb':
    case '.accdb':
      return 'Access';
    case '.mdf':
      return 'SqlServer';
    default:
      return 'Unknown';
  }
}

export function getFormatDisplayName(format: DbFileFormat): string {
  switch (format) {
    case 'Sqlite':
      return 'SQLite';
    case 'SqlDdl':
      return 'SQL DDL';
    case 'Access':
      return 'Microsoft Access';
    case 'SqlServer':
      return 'SQL Server';
    case 'VectorIndex':
      return 'Vector Index';
    case 'Project':
      return 'DBTools Project';
    default:
      return '알 수 없음';
  }
}

function baseNameOf(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
  const name = slash < 0 ? fileName : fileName.substring(slash + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? name : name.substring(0, dot);
}

export interface ImportResult {
  schema: DbSchema;
  format: DbFileFormat;
}

/**
 * Import any supported database file. `.mdf` (SQL Server) and `.mdb`/`.accdb`
 * (Access) require Windows-only native drivers and are reported as unsupported;
 * export the schema to `.sql` from those tools and import the DDL instead.
 */
export async function importDatabaseFile(fileName: string, bytes: Uint8Array): Promise<ImportResult> {
  const format = detectFormat(fileName, bytes);
  const baseName = baseNameOf(fileName);
  const decode = () => new TextDecoder('utf-8').decode(bytes);

  switch (format) {
    case 'Project':
      return { schema: deserialize(decode()), format };
    case 'Sqlite':
      return { schema: await importSqliteSchema(bytes, baseName), format };
    case 'SqlDdl':
      return { schema: importSqlDdl(decode(), baseName), format };
    case 'VectorIndex':
      return { schema: importVectorIndex(fileName, bytes, baseName), format };
    case 'Access':
      throw new Error(
        'Access(.mdb/.accdb) 파일은 Windows 전용 ACE OLEDB 드라이버가 필요하여 지원하지 않습니다. Access에서 SQL로 내보낸 뒤 .sql 파일을 가져오세요.',
      );
    case 'SqlServer':
      throw new Error(
        'SQL Server(.mdf) 파일은 LocalDB 엔진이 필요하여 지원하지 않습니다. SSMS에서 스크립트를 생성한 뒤 .sql 파일을 가져오세요.',
      );
    default:
      throw new Error('지원하지 않는 파일 형식입니다.');
  }
}
