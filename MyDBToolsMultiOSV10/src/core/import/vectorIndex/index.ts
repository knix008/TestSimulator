// Port of Import/VectorIndex/{HnswIndexReader,VectorIndexFileDetector,VectorIndexSchemaBuilder}.cs
import type { DbSchema, DbTable } from '../../../types';
import { autoArrange } from '../../layout';
import { newColumn, newSchema, newTable } from '../../schema';
import { readFaissIndex } from './faiss';
import { formatBytes, isFaissMagic } from './fourcc';
import { BinaryCursor } from './reader';
import type { VectorIndexEngine, VectorIndexInfo } from './types';

export type { VectorIndexInfo } from './types';

/** Port of HnswIndexReader.Read — hnswlib HierarchicalNSW header. */
export function readHnswIndex(bytes: Uint8Array): VectorIndexInfo {
  if (bytes.byteLength < 96) throw new Error('HNSW 인덱스 파일이 너무 작습니다.');
  const r = new BinaryCursor(bytes);

  const offsetLevel0 = r.readUInt64();
  const maxElements = r.readUInt64();
  const curElementCount = r.readUInt64();
  const sizeDataPerElement = r.readUInt64();
  const labelOffset = r.readUInt64();
  r.readUInt64(); // offsetData
  const maxLevel = r.readInt32();
  const enterpointNode = r.readUInt64();
  const maxM = r.readUInt64();
  const maxM0 = r.readUInt64();
  const m = r.readUInt64();
  r.readUInt64(); // mult
  const efConstruction = r.readUInt64();

  if (curElementCount > maxElements || maxElements > 1_000_000_000) {
    throw new Error('HNSW 인덱스 헤더가 유효하지 않습니다.');
  }

  const vectorBytes = Math.max(0, sizeDataPerElement - labelOffset);
  let dimension = 0;
  let metric = 'Unknown';
  if (vectorBytes > 0 && vectorBytes % 4 === 0) {
    dimension = vectorBytes / 4;
    metric = 'L2 or InnerProduct';
  }

  return {
    Engine: 'hnswlib',
    IndexType: 'HierarchicalNSW',
    Metric: metric,
    Dimension: dimension,
    VectorCount: curElementCount,
    FileSizeBytes: bytes.byteLength,
    Components: [
      {
        Name: 'graph',
        IndexType: 'HierarchicalNSW',
        Dimension: dimension,
        VectorCount: curElementCount,
        Metric: metric,
      },
    ],
    Properties: {
      max_elements: String(maxElements),
      M: String(m),
      max_M: String(maxM),
      max_M0: String(maxM0),
      ef_construction: String(efConstruction),
      max_level: String(maxLevel),
      enterpoint: String(enterpointNode),
      offset_level0: String(offsetLevel0),
      file_size: formatBytes(bytes.byteLength),
    },
  };
}

function readFaissMagic(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 4) return null;
  const magic = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  return isFaissMagic(magic) ? magic : null;
}

/** Port of VectorIndexFileDetector.TryDetect. */
export function detectVectorIndex(fileName: string, bytes: Uint8Array): VectorIndexEngine {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  if (ext === '.hnsw') return 'HnswLib';
  if (ext === '.faiss' || ext === '.findex') return 'Faiss';
  if (readFaissMagic(bytes) !== null) return 'Faiss';
  return 'Unknown';
}

function quoteValue(value: string | null): string | null {
  if (value == null) return null;
  return "'" + value.split("'").join("''") + "'";
}

function addInfoColumn(table: DbTable, name: string, value: string): void {
  table.Columns.push(
    newColumn({
      Name: name,
      DataType: 'TEXT',
      DefaultValue: quoteValue(value),
      IsNullable: true,
      Comment: '인덱스 메타데이터',
    }),
  );
}

function sanitizeTableName(name: string): string {
  if (!name || !name.trim()) return 'component';
  return [...name].map((c) => (/[A-Za-z0-9_]/.test(c) ? c : '_')).join('');
}

/** Port of VectorIndexSchemaBuilder.Build. */
export function buildVectorIndexSchema(baseName: string, info: VectorIndexInfo): DbSchema {
  const schema = newSchema(baseName);
  schema.TargetDb = 'VectorDb';

  const infoTable = newTable({ Name: 'index_info', Comment: `${info.Engine} / ${info.IndexType}` });
  addInfoColumn(infoTable, 'engine', info.Engine);
  addInfoColumn(infoTable, 'index_type', info.IndexType);
  addInfoColumn(infoTable, 'metric', info.Metric);
  addInfoColumn(infoTable, 'dimension', String(info.Dimension));
  addInfoColumn(infoTable, 'vector_count', String(info.VectorCount));
  addInfoColumn(infoTable, 'file_size', formatBytes(info.FileSizeBytes));
  for (const [key, value] of Object.entries(info.Properties)) addInfoColumn(infoTable, key, value);

  const vectorsTable = newTable({
    Name: 'vectors',
    Comment: `벡터 저장소 (${info.VectorCount.toLocaleString()}개)`,
  });
  vectorsTable.Columns.push(
    newColumn({
      Name: 'id',
      DataType: 'BIGINT',
      IsPrimaryKey: true,
      IsNullable: false,
      Comment: '벡터 ID',
    }),
  );
  vectorsTable.Columns.push(
    newColumn({
      Name: 'embedding',
      DataType: 'VECTOR',
      Length: info.Dimension > 0 ? info.Dimension : null,
      IsNullable: false,
      Comment: info.Dimension > 0 ? `${info.Dimension}차원 임베딩` : '임베딩 벡터',
    }),
  );

  schema.Tables.push(infoTable, vectorsTable);

  for (const component of info.Components) {
    const lower = component.Name.toLowerCase();
    if (lower === 'root' || lower === 'graph') continue;
    const componentTable = newTable({
      Name: sanitizeTableName(component.Name),
      Comment: `${component.IndexType} 구성 요소`,
    });
    addInfoColumn(componentTable, 'index_type', component.IndexType);
    addInfoColumn(componentTable, 'metric', component.Metric ?? info.Metric);
    addInfoColumn(componentTable, 'dimension', String(component.Dimension));
    addInfoColumn(componentTable, 'vector_count', String(component.VectorCount));
    schema.Tables.push(componentTable);
  }

  autoArrange(schema);
  return schema;
}

/** Read a vector index file and build the display schema. */
export function importVectorIndex(fileName: string, bytes: Uint8Array, baseName: string): DbSchema {
  const engine = detectVectorIndex(fileName, bytes);
  const info = engine === 'HnswLib' ? readHnswIndex(bytes) : readFaissIndex(bytes);
  return buildVectorIndexSchema(baseName, info);
}
