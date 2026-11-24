// Domain model — 1:1 port of DBToolsWinV10/Models
export type DbTargetType =
  | 'PostgreSQL'
  | 'MySQL'
  | 'MariaDB'
  | 'SQLite'
  | 'SqlServer'
  | 'VectorDb';

export const DB_TARGET_TYPES: DbTargetType[] = [
  'PostgreSQL',
  'MySQL',
  'MariaDB',
  'SQLite',
  'SqlServer',
  'VectorDb',
];

export type RelationshipType = 'OneToOne' | 'OneToMany' | 'ManyToMany';
export type RelationshipLineStyle = 'Straight' | 'Curved' | 'Orthogonal';

export type ToolMode =
  | 'Select'
  | 'AddTable'
  | 'RelationOneToOne'
  | 'RelationOneToMany'
  | 'RelationManyToMany';

export interface DbColumn {
  Id: string;
  Name: string;
  DataType: string;
  Length?: number | null;
  Precision?: number | null;
  Scale?: number | null;
  IsPrimaryKey: boolean;
  IsAutoIncrement: boolean;
  IsNullable: boolean;
  IsUnique: boolean;
  IsForeignKey: boolean;
  DefaultValue?: string | null;
  Comment?: string | null;
}

export interface DbTable {
  Id: string;
  Name: string;
  Comment?: string | null;
  Columns: DbColumn[];
  X: number;
  Y: number;
  Width: number;
}

export interface RelationshipPoint {
  X: number;
  Y: number;
}

export interface DbRelationship {
  Id: string;
  Name: string;
  Type: RelationshipType;
  LineStyle: RelationshipLineStyle;
  RoutePoints: RelationshipPoint[];
  SourceTableId: string;
  SourceColumnId: string;
  TargetTableId: string;
  TargetColumnId: string;
}

export interface DbSchema {
  Name: string;
  TargetDb: DbTargetType;
  Tables: DbTable[];
  Relationships: DbRelationship[];
}

export function getDbDisplayName(db: DbTargetType): string {
  switch (db) {
    case 'PostgreSQL':
      return 'PostgreSQL';
    case 'MySQL':
      return 'MySQL';
    case 'MariaDB':
      return 'MariaDB';
    case 'SQLite':
      return 'SQLite';
    case 'SqlServer':
      return 'SQL Server';
    case 'VectorDb':
      return 'FAISS';
    default:
      return db;
  }
}

export function getRelationshipTypeLabel(type: RelationshipType): string {
  switch (type) {
    case 'OneToOne':
      return '1:1';
    case 'OneToMany':
      return '1:N';
    case 'ManyToMany':
      return 'N:M';
    default:
      return '?';
  }
}
