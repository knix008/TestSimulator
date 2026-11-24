// Port of Models/DataTypeProvider.cs
import type { DbTargetType } from '../types';

const PostgreSQLTypes = [
  'SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'SERIAL', 'BIGSERIAL', 'SMALLSERIAL',
  'CHAR', 'VARCHAR', 'TEXT', 'BYTEA', 'BOOLEAN', 'DATE', 'TIME', 'TIMETZ', 'TIMESTAMP', 'TIMESTAMPTZ',
  'INTERVAL', 'UUID', 'JSON', 'JSONB', 'INET', 'CIDR', 'MACADDR', 'POINT', 'LINE', 'LSEG',
  'BOX', 'PATH', 'POLYGON', 'CIRCLE', 'MONEY', 'BIT', 'VARBIT', 'XML',
];

const MySQLTypes = [
  'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'CHAR', 'VARCHAR',
  'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB',
  'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR', 'ENUM', 'SET', 'JSON', 'GEOMETRY', 'POINT',
  'LINESTRING', 'POLYGON',
];

const MariaDBTypes = [
  'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'CHAR', 'VARCHAR',
  'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB',
  'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR', 'ENUM', 'SET', 'JSON', 'UUID', 'GEOMETRY',
  'POINT', 'LINESTRING', 'POLYGON',
];

const SQLiteTypes = [
  'INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC', 'BOOLEAN', 'DATE', 'DATETIME', 'VARCHAR', 'CHAR',
  'DECIMAL', 'FLOAT', 'DOUBLE',
];

const SqlServerTypes = [
  'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'MONEY', 'SMALLMONEY',
  'BIT', 'CHAR', 'VARCHAR', 'NCHAR', 'NVARCHAR', 'TEXT', 'NTEXT', 'BINARY', 'VARBINARY', 'IMAGE',
  'DATE', 'TIME', 'DATETIME', 'DATETIME2', 'SMALLDATETIME', 'DATETIMEOFFSET', 'UNIQUEIDENTIFIER', 'XML', 'JSON',
];

const VectorDbTypes = ['BIGINT', 'INT', 'FLOAT', 'DOUBLE', 'TEXT', 'VECTOR'];

export function getTypes(db: DbTargetType): string[] {
  switch (db) {
    case 'PostgreSQL':
      return PostgreSQLTypes;
    case 'MySQL':
      return MySQLTypes;
    case 'MariaDB':
      return MariaDBTypes;
    case 'SQLite':
      return SQLiteTypes;
    case 'SqlServer':
      return SqlServerTypes;
    case 'VectorDb':
      return VectorDbTypes;
    default:
      return SQLiteTypes;
  }
}

export function typeHasLength(type: string): boolean {
  switch ((type || '').toUpperCase()) {
    case 'VARCHAR':
    case 'CHAR':
    case 'NVARCHAR':
    case 'NCHAR':
    case 'BINARY':
    case 'VARBINARY':
    case 'BIT':
    case 'VARBIT':
    case 'VECTOR':
    case 'TEXT':
    case 'NTEXT':
    case 'IMAGE':
      return true;
    default:
      return false;
  }
}

export function typeHasPrecisionScale(type: string): boolean {
  switch ((type || '').toUpperCase()) {
    case 'DECIMAL':
    case 'NUMERIC':
    case 'FLOAT':
    case 'DOUBLE':
    case 'DOUBLE PRECISION':
    case 'MONEY':
    case 'REAL':
      return true;
    default:
      return false;
  }
}

export function getAutoIncrementKeyword(db: DbTargetType, type: string): string {
  switch (db) {
    case 'PostgreSQL': {
      const t = (type || '').toUpperCase();
      const isSerial = t === 'SERIAL' || t === 'BIGSERIAL' || t === 'SMALLSERIAL';
      return isSerial ? '' : 'GENERATED ALWAYS AS IDENTITY';
    }
    case 'MySQL':
    case 'MariaDB':
      return 'AUTO_INCREMENT';
    case 'SqlServer':
      return 'IDENTITY(1,1)';
    default:
      return '';
  }
}
