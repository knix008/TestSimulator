// Port of Import/VectorIndex/FaissIndexMetadataReader.cs
import { decodeFourCc, encodeFourCc, formatBytes, getFourCcName, metricName } from './fourcc';
import { BinaryCursor } from './reader';
import type { VectorIndexComponent, VectorIndexInfo } from './types';

const SIZE_OF_INT = 4;
const SIZE_OF_LONG = 8;
const SIZE_OF_FLOAT = 4;
const SIZE_OF_CHAR = 1;

const FC = {
  null: encodeFourCc('null'),
  IxFI: encodeFourCc('IxFI'),
  IxF2: encodeFourCc('IxF2'),
  IxFl: encodeFourCc('IxFl'),
  IxMp: encodeFourCc('IxMp'),
  IxM2: encodeFourCc('IxM2'),
  IHNf: encodeFourCc('IHNf'),
  IHNp: encodeFourCc('IHNp'),
  IHNs: encodeFourCc('IHNs'),
  IHN2: encodeFourCc('IHN2'),
  IHNc: encodeFourCc('IHNc'),
  IHc2: encodeFourCc('IHc2'),
  IHfP: encodeFourCc('IHfP'),
  IwFl: encodeFourCc('IwFl'),
  IvFl: encodeFourCc('IvFl'),
  IvFL: encodeFourCc('IvFL'),
  IxPQ: encodeFourCc('IxPQ'),
  IxPo: encodeFourCc('IxPo'),
  IxPq: encodeFourCc('IxPq'),
  IxPT: encodeFourCc('IxPT'),
  IxRF: encodeFourCc('IxRF'),
  IxRP: encodeFourCc('IxRP'),
  IvPQ: encodeFourCc('IvPQ'),
  IvQR: encodeFourCc('IvQR'),
  IwPQ: encodeFourCc('IwPQ'),
  IwQR: encodeFourCc('IwQR'),
  il00: encodeFourCc('il00'),
  ilar: encodeFourCc('ilar'),
  full: encodeFourCc('full'),
  sprs: encodeFourCc('sprs'),
  rrot: encodeFourCc('rrot'),
  PCAm: encodeFourCc('PCAm'),
  PcAm: encodeFourCc('PcAm'),
  Pcam: encodeFourCc('Pcam'),
  LTra: encodeFourCc('LTra'),
};

export interface FaissParsedIndex {
  fourCc: number;
  indexType: string;
  dimension: number;
  vectorCount: number;
  metric: string;
  children: FaissParsedIndex[];
}

function newNode(fourCc: number): FaissParsedIndex {
  return {
    fourCc,
    indexType: getFourCcName(fourCc),
    dimension: 0,
    vectorCount: 0,
    metric: 'Unknown',
    children: [],
  };
}

function readIndexHeader(r: BinaryCursor, node: FaissParsedIndex): void {
  node.dimension = r.readInt32();
  node.vectorCount = r.readInt64();
  r.readInt64();
  r.readInt64();
  r.readBool();
  const metricType = r.readInt32();
  node.metric = metricName(metricType);
  if (metricType > 1) r.readSingle();
}

function skipHnsw(r: BinaryCursor): void {
  r.skipVector(SIZE_OF_FLOAT);
  r.skipVector(SIZE_OF_INT);
  r.skipVector(SIZE_OF_INT);
  r.skipVector(SIZE_OF_LONG);
  r.skipVector(SIZE_OF_LONG);
  r.readInt64(); // entry_point
  r.readInt32(); // max_level
  r.readInt32(); // efConstruction
  r.readInt32(); // efSearch
  r.readInt32(); // deprecated
}

function skipDirectMap(r: BinaryCursor): void {
  const mapType = r.readByte();
  r.skipVector(SIZE_OF_LONG);
  if (mapType === 2) r.skipVector(SIZE_OF_LONG * 2);
}

function skipProductQuantizer(r: BinaryCursor): number {
  const d = r.readInt32();
  const m = r.readInt32();
  const nbits = r.readInt32();
  const centroidCount = d * Math.pow(2, nbits);
  r.skip(centroidCount * SIZE_OF_FLOAT);
  return Math.floor((m * nbits + 7) / 8);
}

function readInvertedListSizes(r: BinaryCursor, nlist: number): number[] {
  const sizes = new Array<number>(nlist).fill(0);
  const listType = r.readUInt32();
  if (listType === FC.full) {
    const count = r.readSize();
    for (let i = 0; i < count; i++) sizes[i] = r.readSize();
  } else if (listType === FC.sprs) {
    const pairCount = r.readSize();
    for (let i = 0; i < pairCount; i++) {
      const index = r.readSize();
      const size = r.readSize();
      sizes[index] = size;
    }
  } else {
    throw new Error(`지원하지 않는 inverted list size 형식입니다: ${decodeFourCc(listType)}`);
  }
  return sizes;
}

function skipInvertedLists(r: BinaryCursor): void {
  const marker = r.readUInt32();
  if (marker === FC.il00) return;
  if (marker === FC.ilar) {
    const nlist = r.readInt32();
    const codeSize = r.readInt32();
    const sizes = readInvertedListSizes(r, nlist);
    for (let i = 0; i < nlist; i++) {
      const n = sizes[i];
      if (n <= 0) continue;
      r.skip(n * codeSize);
      r.skip(n * SIZE_OF_LONG);
    }
    return;
  }
  throw new Error(`지원하지 않는 Faiss inverted list 형식입니다: ${decodeFourCc(marker)}`);
}

function skipVectorTransform(r: BinaryCursor): void {
  const marker = r.readUInt32();
  if (marker === FC.rrot || marker === FC.LTra) {
    r.readInt32();
    r.readInt32();
    r.skipVector(SIZE_OF_FLOAT);
    r.skipVector(SIZE_OF_FLOAT);
    return;
  }
  if (marker === FC.PCAm || marker === FC.PcAm || marker === FC.Pcam) {
    r.readInt32(); // eigen_power
    if (marker === FC.Pcam) r.readSingle(); // epsilon
    r.readBool();
    r.skipVector(SIZE_OF_FLOAT);
    r.skipVector(SIZE_OF_FLOAT);
    r.skipVector(SIZE_OF_FLOAT);
    return;
  }
  throw new Error(`지원하지 않는 VectorTransform 형식입니다: ${decodeFourCc(marker)}`);
}

function readIvfHeader(
  r: BinaryCursor,
  node: FaissParsedIndex,
  readLegacyIds: boolean,
): number {
  readIndexHeader(r, node);
  const nlist = r.readInt32();
  r.readInt32(); // nprobe
  node.children.push(parseIndex(r));
  if (readLegacyIds) {
    for (let i = 0; i < nlist; i++) r.skipVector(SIZE_OF_LONG);
  }
  skipDirectMap(r);
  return nlist;
}

function parseIndex(r: BinaryCursor): FaissParsedIndex {
  const fourCc = r.readUInt32();
  if (fourCc === FC.null) throw new Error('Faiss 인덱스가 비어 있습니다.');
  const node = newNode(fourCc);

  if (fourCc === FC.IxFI || fourCc === FC.IxF2 || fourCc === FC.IxFl) {
    readIndexHeader(r, node);
    r.skipXbVector();
  } else if (fourCc === FC.IxMp || fourCc === FC.IxM2) {
    readIndexHeader(r, node);
    node.children.push(parseIndex(r));
    r.skipVector(SIZE_OF_LONG);
  } else if (
    fourCc === FC.IHNf ||
    fourCc === FC.IHNp ||
    fourCc === FC.IHNs ||
    fourCc === FC.IHN2 ||
    fourCc === FC.IHNc ||
    fourCc === FC.IHc2 ||
    fourCc === FC.IHfP
  ) {
    readIndexHeader(r, node);
    if (fourCc === FC.IHfP) {
      r.readUInt64(); // nlevels
      r.skipVector(SIZE_OF_FLOAT); // cum_sums
    }
    if (fourCc === FC.IHNc || fourCc === FC.IHc2) {
      r.readBool(); // keep_max_size_level0
      r.readBool(); // base_level_only
      r.readInt32(); // num_base_level_search_entrypoints
      if (fourCc === FC.IHc2) r.readInt32(); // numeric_type
    }
    skipHnsw(r);
    try {
      node.children.push(parseIndex(r));
    } catch {
      // Storage sub-index is optional in some builds.
    }
  } else if (fourCc === FC.IwFl || fourCc === FC.IvFl || fourCc === FC.IvFL) {
    const legacy = fourCc === FC.IvFl || fourCc === FC.IvFL;
    const nlist = readIvfHeader(r, node, legacy);
    if (legacy) {
      for (let i = 0; i < nlist; i++) {
        if (fourCc === FC.IvFL) r.skipVector(SIZE_OF_CHAR);
        else r.skipVector(SIZE_OF_FLOAT);
      }
    } else {
      skipInvertedLists(r);
    }
  } else if (fourCc === FC.IxPQ || fourCc === FC.IxPo || fourCc === FC.IxPq) {
    readIndexHeader(r, node);
    skipProductQuantizer(r);
    r.skipVector(SIZE_OF_CHAR);
    if (fourCc === FC.IxPo || fourCc === FC.IxPq) {
      r.readInt32(); // search_type
      r.readBool(); // encode_signs
      r.readInt32(); // polysemous_ht
    }
  } else if (fourCc === FC.IxPT) {
    readIndexHeader(r, node);
    const transformCount = r.readInt32();
    for (let i = 0; i < transformCount; i++) skipVectorTransform(r);
    node.children.push(parseIndex(r));
  } else if (fourCc === FC.IxRF || fourCc === FC.IxRP) {
    readIndexHeader(r, node);
    node.children.push(parseIndex(r));
    node.children.push(parseIndex(r));
    r.readSingle(); // k_factor
  } else if (fourCc === FC.IvPQ || fourCc === FC.IvQR || fourCc === FC.IwPQ || fourCc === FC.IwQR) {
    const legacy = fourCc === FC.IvPQ || fourCc === FC.IvQR;
    readIvfHeader(r, node, legacy);
    r.readBool(); // by_residual
    r.readInt32(); // code_size
    skipProductQuantizer(r);
    skipInvertedLists(r);
  } else {
    throw new Error(
      `아직 지원하지 않는 Faiss 인덱스 형식입니다: ${node.indexType} (${decodeFourCc(fourCc)})`,
    );
  }

  return node;
}

function collectComponents(node: FaissParsedIndex, components: VectorIndexComponent[]): void {
  components.push({
    Name: node.indexType,
    IndexType: node.indexType,
    Dimension: node.dimension,
    VectorCount: node.vectorCount,
    Metric: node.metric,
  });
  for (const child of node.children) collectComponents(child, components);
}

export function readFaissIndex(bytes: Uint8Array): VectorIndexInfo {
  const root = parseIndex(new BinaryCursor(bytes));
  const components: VectorIndexComponent[] = [];
  for (const child of root.children) collectComponents(child, components);

  return {
    Engine: 'Faiss',
    IndexType: root.indexType,
    Metric: root.metric ?? 'Unknown',
    Dimension: root.dimension,
    VectorCount: root.vectorCount,
    FileSizeBytes: bytes.byteLength,
    Components: components,
    Properties: {
      fourcc: decodeFourCc(root.fourCc),
      file_size: formatBytes(bytes.byteLength),
    },
  };
}
