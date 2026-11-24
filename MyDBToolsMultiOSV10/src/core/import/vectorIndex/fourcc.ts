// Port of Import/VectorIndex/FaissFourCc.cs + FaissMetricNames.cs
export function encodeFourCc(text: string): number {
  if (text.length !== 4) throw new Error('fourcc must be 4 characters.');
  return (
    (text.charCodeAt(0) |
      (text.charCodeAt(1) << 8) |
      (text.charCodeAt(2) << 16) |
      (text.charCodeAt(3) << 24)) >>>
    0
  );
}

export function decodeFourCc(value: number): string {
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

const KNOWN_NAMES = new Map<number, string>(
  (
    [
      ['IxFI', 'IndexFlat'],
      ['IxF2', 'IndexFlat'],
      ['IxFl', 'IndexFlatL2'],
      ['IxPQ', 'IndexPQ'],
      ['IxPo', 'IndexPQ'],
      ['IxPq', 'IndexPQ'],
      ['IxHE', 'IndexLSH'],
      ['IxHe', 'IndexLSH'],
      ['IxMp', 'IndexIDMap'],
      ['IxM2', 'IndexIDMap2'],
      ['IxPT', 'IndexPreTransform'],
      ['IxRF', 'IndexRefine'],
      ['IxRP', 'IndexRefine'],
      ['IHNf', 'IndexHNSWFlat'],
      ['IHNp', 'IndexHNSWPQ'],
      ['IHNs', 'IndexHNSWSQ'],
      ['IHN2', 'IndexHNSW2Level'],
      ['IHNc', 'IndexHNSWCagra'],
      ['IHc2', 'IndexHNSWCagra2'],
      ['IHfP', 'IndexHNSWFlatPanorama'],
      ['IvFl', 'IndexIVFFlat'],
      ['IvFL', 'IndexIVFFlat'],
      ['IwFl', 'IndexIVFFlat'],
      ['IvPQ', 'IndexIVFPQ'],
      ['IvQR', 'IndexIVFPQR'],
      ['IwPQ', 'IndexIVFPQ'],
      ['IwQR', 'IndexIVFPQR'],
      ['IxSQ', 'IndexScalarQuantizer'],
      ['IxLa', 'IndexLattice'],
      ['IxLS', 'IndexLocalSearchQuantizer'],
      ['IxRQ', 'IndexResidualQuantizer'],
      ['IxRq', 'IndexResidualQuantizer'],
      ['IxPR', 'IndexProductResidualQuantizer'],
      ['IxPL', 'IndexProductLocalSearchQuantizer'],
      ['Ix2L', 'Index2Layer'],
      ['INSf', 'IndexNSGFlat'],
      ['INSp', 'IndexNSGPQ'],
      ['INSs', 'IndexNSGSQ'],
      ['null', 'NullIndex'],
    ] as [string, string][]
  ).map(([code, name]) => [encodeFourCc(code), name]),
);

export function isFaissMagic(value: number): boolean {
  return KNOWN_NAMES.has(value >>> 0);
}

export function getFourCcName(value: number): string {
  return KNOWN_NAMES.get(value >>> 0) ?? 'Faiss:' + decodeFourCc(value);
}

export function metricName(metricType: number): string {
  switch (metricType) {
    case 0:
      return 'L2';
    case 1:
      return 'InnerProduct';
    case 20:
      return 'L1';
    case 21:
      return 'Linf';
    case 22:
      return 'Lp';
    case 23:
      return 'Canberra';
    case 24:
      return 'BrayCurtis';
    case 25:
      return 'JensenShannon';
    case 26:
      return 'Jaccard';
    case 27:
      return 'Mahalanobis';
    case 28:
      return 'Hamming';
    default:
      return `Metric(${metricType})`;
  }
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  if (unit === 0) return `${bytes} ${units[unit]}`;
  return `${Math.round(size * 100) / 100} ${units[unit]}`;
}
