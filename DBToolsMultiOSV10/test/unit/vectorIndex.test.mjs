// Faiss / hnswlib binary readers and the file-format detector.
import { suite, test, expect } from '../helpers/runner.mjs';
import { binaryReader, databaseFile, fourcc, vectorIndex } from '../helpers/core.mjs';

/** Little-endian byte builder, mirroring how Faiss and hnswlib write. */
function bytes() {
  const parts = [];
  return {
    u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); parts.push(b); return this; },
    i32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); parts.push(b); return this; },
    u64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); parts.push(b); return this; },
    i64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v), true); parts.push(b); return this; },
    f32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); parts.push(b); return this; },
    u8(v) { parts.push(new Uint8Array([v])); return this; },
    raw(n) { parts.push(new Uint8Array(n)); return this; },
    build() {
      const total = parts.reduce((n, p) => n + p.length, 0);
      const out = new Uint8Array(total);
      let at = 0;
      for (const p of parts) { out.set(p, at); at += p.length; }
      return out;
    },
  };
}

suite('fourcc', () => {
  test('encode and decode round trip', () => {
    for (const code of ['IxFl', 'IHNf', 'null', 'ilar']) {
      expect(fourcc.decodeFourCc(fourcc.encodeFourCc(code))).toBe(code);
    }
  });

  test('known Faiss magics are recognised', () => {
    expect(fourcc.isFaissMagic(fourcc.encodeFourCc('IxFl'))).toBeTruthy();
    expect(fourcc.isFaissMagic(fourcc.encodeFourCc('IvFl'))).toBeTruthy();
    expect(fourcc.isFaissMagic(fourcc.encodeFourCc('ZZZZ'))).toBeFalsy();
  });

  test('index names map from the magic', () => {
    expect(fourcc.getFourCcName(fourcc.encodeFourCc('IxFl'))).toBe('IndexFlatL2');
    expect(fourcc.getFourCcName(fourcc.encodeFourCc('IHNf'))).toBe('IndexHNSWFlat');
    expect(fourcc.getFourCcName(fourcc.encodeFourCc('ZZZZ'))).toBe('Faiss:ZZZZ');
  });

  test('a four-character code is required', async () => {
    await expect(() => fourcc.encodeFourCc('abc')).toThrow('fourcc');
  });

  test('metric names', () => {
    expect(fourcc.metricName(0)).toBe('L2');
    expect(fourcc.metricName(1)).toBe('InnerProduct');
    expect(fourcc.metricName(99)).toBe('Metric(99)');
  });

  test('byte sizes are human readable', () => {
    expect(fourcc.formatBytes(512)).toBe('512 B');
    expect(fourcc.formatBytes(2048)).toBe('2 KB');
    expect(fourcc.formatBytes(1024 * 1024 * 3)).toBe('3 MB');
  });
});

suite('binary cursor', () => {
  test('reads little-endian integers and floats', () => {
    const data = bytes().u32(0xdeadbeef).i32(-5).u64(1234567).f32(1.5).u8(1).build();
    const r = new binaryReader.BinaryCursor(data);
    expect(r.readUInt32()).toBe(0xdeadbeef);
    expect(r.readInt32()).toBe(-5);
    expect(r.readUInt64()).toBe(1234567);
    expect(r.readSingle()).toBe(1.5);
    expect(r.readBool()).toBeTruthy();
  });

  test('reading past the end throws instead of returning junk', async () => {
    const r = new binaryReader.BinaryCursor(new Uint8Array(2));
    await expect(() => r.readUInt32()).toThrow();
  });

  test('skipping past the end throws', async () => {
    const r = new binaryReader.BinaryCursor(new Uint8Array(4));
    await expect(() => r.skip(99)).toThrow();
  });

  test('skipVector consumes a length-prefixed array', () => {
    const data = bytes().u64(3).i32(1).i32(2).i32(3).u32(7).build();
    const r = new binaryReader.BinaryCursor(data);
    r.skipVector(4);
    expect(r.readUInt32()).toBe(7);
  });
});

suite('hnswlib reader', () => {
  /** A minimal HierarchicalNSW header: 13 fields then padding. */
  function hnswFile({ maxElements = 1000, count = 10, sizePerElement = 528, labelOffset = 16 } = {}) {
    return bytes()
      .u64(0)               // offsetLevel0
      .u64(maxElements)
      .u64(count)
      .u64(sizePerElement)
      .u64(labelOffset)
      .u64(0)               // offsetData
      .i32(3)               // maxLevel
      .u64(0)               // enterpoint
      .u64(16).u64(32).u64(16).u64(0).u64(200)
      .raw(64)
      .build();
  }

  test('reads dimension, count and parameters', () => {
    const info = vectorIndex.readHnswIndex(hnswFile());
    expect(info.Engine).toBe('hnswlib');
    expect(info.IndexType).toBe('HierarchicalNSW');
    expect(info.VectorCount).toBe(10);
    expect(info.Dimension).toBe((528 - 16) / 4);
    expect(info.Properties.ef_construction).toBe('200');
  });

  test('a file that is too small is rejected', async () => {
    await expect(() => vectorIndex.readHnswIndex(new Uint8Array(10))).toThrow('너무 작습니다');
  });

  test('an impossible header is rejected', async () => {
    await expect(() => vectorIndex.readHnswIndex(hnswFile({ maxElements: 5, count: 99 })))
      .toThrow('유효하지 않습니다');
  });

  test('a non-multiple-of-four vector block yields an unknown dimension', () => {
    const info = vectorIndex.readHnswIndex(hnswFile({ sizePerElement: 19, labelOffset: 0 }));
    expect(info.Dimension).toBe(0);
    expect(info.Metric).toBe('Unknown');
  });
});

suite('faiss reader', () => {
  /** IndexFlatL2: fourcc, header (d, ntotal, 2×i64, bool, metric), then xb. */
  function flatIndex({ d = 128, ntotal = 4, metric = 0 } = {}) {
    return bytes()
      .u32(fourcc.encodeFourCc('IxFl'))
      .i32(d).i64(ntotal).i64(0).i64(0).u8(0).i32(metric)
      .u64(0)   // empty xb vector
      .build();
  }

  test('reads a flat index header', () => {
    const info = vectorIndex.readFaissIndex
      ? vectorIndex.readFaissIndex(flatIndex())
      : null;
    // readFaissIndex is re-exported through importVectorIndex; use the schema path.
    const schemaFromFile = vectorIndex.importVectorIndex('x.faiss', flatIndex(), 'x');
    expect(schemaFromFile.TargetDb).toBe('VectorDb');
    const vectors = schemaFromFile.Tables.find((t) => t.Name === 'vectors');
    expect(vectors.Columns.find((c) => c.Name === 'embedding').Length).toBe(128);
    void info;
  });

  test('an empty (null) index is rejected', async () => {
    const data = bytes().u32(fourcc.encodeFourCc('null')).build();
    await expect(() => vectorIndex.importVectorIndex('x.faiss', data, 'x')).toThrow('비어 있습니다');
  });

  test('an unsupported index type reports its name', async () => {
    const data = bytes().u32(fourcc.encodeFourCc('IxLa')).i32(8).i64(1).i64(0).i64(0).u8(0).i32(0).build();
    await expect(() => vectorIndex.importVectorIndex('x.faiss', data, 'x')).toThrow('지원하지 않는');
  });
});

suite('vector index detection and schema', () => {
  test('the extension decides for hnsw', () => {
    expect(vectorIndex.detectVectorIndex('a.hnsw', new Uint8Array(4))).toBe('HnswLib');
    expect(vectorIndex.detectVectorIndex('a.faiss', new Uint8Array(4))).toBe('Faiss');
    expect(vectorIndex.detectVectorIndex('a.txt', new Uint8Array(4))).toBe('Unknown');
  });

  test('a Faiss magic is detected without a matching extension', () => {
    const data = bytes().u32(fourcc.encodeFourCc('IxFl')).build();
    expect(vectorIndex.detectVectorIndex('mystery.index', data)).toBe('Faiss');
  });

  test('the built schema exposes metadata and a vectors table', () => {
    const info = {
      Engine: 'Faiss', IndexType: 'IndexFlatL2', Metric: 'L2', Dimension: 64,
      VectorCount: 1000, FileSizeBytes: 4096,
      Components: [{ Name: 'sub', IndexType: 'IndexFlat', Dimension: 64, VectorCount: 1000, Metric: 'L2' }],
      Properties: { fourcc: 'IxFl' },
    };
    const s = vectorIndex.buildVectorIndexSchema('idx', info);
    expect(s.Name).toBe('idx');
    expect(s.Tables.some((t) => t.Name === 'index_info')).toBeTruthy();
    const vectors = s.Tables.find((t) => t.Name === 'vectors');
    expect(vectors.Columns.find((c) => c.Name === 'id').IsPrimaryKey).toBeTruthy();
    expect(vectors.Columns.find((c) => c.Name === 'embedding').Length).toBe(64);
    expect(s.Tables.some((t) => t.Name === 'sub')).toBeTruthy();
  });

  test('root and graph components are not turned into tables', () => {
    const info = {
      Engine: 'hnswlib', IndexType: 'HierarchicalNSW', Metric: 'L2', Dimension: 8,
      VectorCount: 1, FileSizeBytes: 10,
      Components: [{ Name: 'graph', IndexType: 'HierarchicalNSW', Dimension: 8, VectorCount: 1, Metric: 'L2' }],
      Properties: {},
    };
    const s = vectorIndex.buildVectorIndexSchema('h', info);
    expect(s.Tables.map((t) => t.Name)).toEqual(['index_info', 'vectors']);
  });
});

suite('database file detection', () => {
  const sqliteHeader = new TextEncoder().encode('SQLite format 3 ');

  test('the SQLite magic wins over the extension', () => {
    const data = new Uint8Array(32);
    data.set(sqliteHeader);
    expect(databaseFile.detectFormat('mystery.dat', data)).toBe('Sqlite');
  });

  test('extensions decide for the rest', () => {
    const empty = new Uint8Array(4);
    expect(databaseFile.detectFormat('a.sql', empty)).toBe('SqlDdl');
    expect(databaseFile.detectFormat('a.mdprj', empty)).toBe('Project');
    expect(databaseFile.detectFormat('a.json', empty)).toBe('Project');
    expect(databaseFile.detectFormat('a.accdb', empty)).toBe('Access');
    expect(databaseFile.detectFormat('a.mdf', empty)).toBe('SqlServer');
    expect(databaseFile.detectFormat('a.db', empty)).toBe('Sqlite');
    expect(databaseFile.detectFormat('a.xyz', empty)).toBe('Unknown');
  });

  test('unsupported native formats explain the alternative', async () => {
    const empty = new Uint8Array(4);
    await expect(() => databaseFile.importDatabaseFile('a.accdb', empty)).toThrow('.sql');
    await expect(() => databaseFile.importDatabaseFile('a.mdf', empty)).toThrow('.sql');
    await expect(() => databaseFile.importDatabaseFile('a.xyz', empty)).toThrow('지원하지 않는');
  });

  test('format display names', () => {
    expect(databaseFile.getFormatDisplayName('Sqlite')).toBe('SQLite');
    expect(databaseFile.getFormatDisplayName('VectorIndex')).toBe('Vector Index');
    expect(databaseFile.getFormatDisplayName('Unknown')).toBe('알 수 없음');
  });
});
