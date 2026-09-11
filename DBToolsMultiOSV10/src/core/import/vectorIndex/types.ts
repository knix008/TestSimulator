// Port of Import/VectorIndex/VectorIndexInfo.cs
export interface VectorIndexComponent {
  Name: string;
  IndexType: string;
  Dimension: number;
  VectorCount: number;
  Metric: string;
}

export interface VectorIndexInfo {
  Engine: string;
  IndexType: string;
  Metric: string;
  Dimension: number;
  VectorCount: number;
  FileSizeBytes: number;
  Components: VectorIndexComponent[];
  Properties: Record<string, string>;
}

export type VectorIndexEngine = 'Unknown' | 'Faiss' | 'HnswLib';
