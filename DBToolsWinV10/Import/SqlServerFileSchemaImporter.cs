using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using DBToolsWinV10.Models;
using Microsoft.Data.SqlClient;

namespace DBToolsWinV10.Import;

public static class SqlServerFileSchemaImporter
{
	public static DbSchema Import(string filePath)
	{
		if (!File.Exists(filePath))
		{
			throw new FileNotFoundException("SQL Server 데이터베이스 파일을 찾을 수 없습니다.", filePath);
		}
		string fullPath = Path.GetFullPath(filePath);
		DbSchema dbSchema = new DbSchema
		{
			Name = Path.GetFileNameWithoutExtension(fullPath),
			TargetDb = DbTargetType.SqlServer
		};
		string connectionString = "Server=(localdb)\\MSSQLLocalDB;\nAttachDbFilename=" + fullPath + ";\nIntegrated Security=True;\nConnect Timeout=30;\nTrust Server Certificate=True";
		using SqlConnection sqlConnection = new SqlConnection(connectionString);
		try
		{
			sqlConnection.Open();
		}
		catch (Exception innerException)
		{
			throw new InvalidOperationException("SQL Server 데이터베이스 파일(.mdf)을 열 수 없습니다. SQL Server LocalDB가 설치되어 있는지 확인하세요.", innerException);
		}
		Dictionary<string, DbTable> tableMap = new Dictionary<string, DbTable>(StringComparer.OrdinalIgnoreCase);
		ReadTables(sqlConnection, dbSchema, tableMap);
		ReadColumns(sqlConnection, tableMap);
		ReadPrimaryKeys(sqlConnection, tableMap);
		ReadForeignKeys(sqlConnection, tableMap, dbSchema);
		SchemaLayout.AutoArrange(dbSchema);
		return dbSchema;
	}

	private static void ReadTables(SqlConnection connection, DbSchema schema, Dictionary<string, DbTable> tableMap)
	{
		using SqlCommand sqlCommand = connection.CreateCommand();
		sqlCommand.CommandText = "SELECT TABLE_NAME\nFROM INFORMATION_SCHEMA.TABLES\nWHERE TABLE_TYPE = 'BASE TABLE'\n  AND TABLE_SCHEMA = 'dbo'\nORDER BY TABLE_NAME;";
		using SqlDataReader sqlDataReader = sqlCommand.ExecuteReader();
		while (sqlDataReader.Read())
		{
			string text = sqlDataReader.GetString(0);
			DbTable dbTable = new DbTable
			{
				Name = text
			};
			schema.Tables.Add(dbTable);
			tableMap[text] = dbTable;
		}
	}

	private static void ReadColumns(SqlConnection connection, Dictionary<string, DbTable> tableMap)
	{
		using SqlCommand sqlCommand = connection.CreateCommand();
		sqlCommand.CommandText = "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE,\n       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,\n       IS_NULLABLE, COLUMN_DEFAULT\nFROM INFORMATION_SCHEMA.COLUMNS\nWHERE TABLE_SCHEMA = 'dbo'\nORDER BY TABLE_NAME, ORDINAL_POSITION;";
		using SqlDataReader sqlDataReader = sqlCommand.ExecuteReader();
		while (sqlDataReader.Read())
		{
			string key = sqlDataReader.GetString(0);
			if (tableMap.TryGetValue(key, out DbTable value))
			{
				string dataType = sqlDataReader.GetString(2).ToUpperInvariant();
				int? length = (sqlDataReader.IsDBNull(3) ? ((int?)null) : new int?(Convert.ToInt32(sqlDataReader.GetValue(3))));
				if (length.HasValue && length.GetValueOrDefault() <= 0)
				{
					length = null;
				}
				int? precision = (sqlDataReader.IsDBNull(4) ? ((int?)null) : new int?(Convert.ToInt32(sqlDataReader.GetValue(4))));
				int? scale = (sqlDataReader.IsDBNull(5) ? ((int?)null) : new int?(Convert.ToInt32(sqlDataReader.GetValue(5))));
				value.Columns.Add(new DbColumn
				{
					Name = sqlDataReader.GetString(1),
					DataType = dataType,
					Length = length,
					Precision = precision,
					Scale = scale,
					IsNullable = sqlDataReader.GetString(6).Equals("YES", StringComparison.OrdinalIgnoreCase),
					DefaultValue = (sqlDataReader.IsDBNull(7) ? null : sqlDataReader.GetString(7))
				});
			}
		}
	}

	private static void ReadPrimaryKeys(SqlConnection connection, Dictionary<string, DbTable> tableMap)
	{
		using SqlCommand sqlCommand = connection.CreateCommand();
		sqlCommand.CommandText = "SELECT tc.TABLE_NAME, kcu.COLUMN_NAME\nFROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc\nJOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu\n  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME\n AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA\nWHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'\n  AND tc.TABLE_SCHEMA = 'dbo';";
		using SqlDataReader sqlDataReader = sqlCommand.ExecuteReader();
		while (sqlDataReader.Read())
		{
			string key = sqlDataReader.GetString(0);
			string columnName = sqlDataReader.GetString(1);
			if (!tableMap.TryGetValue(key, out DbTable value))
			{
				continue;
			}
			DbColumn dbColumn = value.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, columnName, StringComparison.OrdinalIgnoreCase));
			if (dbColumn != null)
			{
				dbColumn.IsPrimaryKey = true;
				dbColumn.IsNullable = false;
				bool flag;
				switch (dbColumn.DataType)
				{
				case "INT":
				case "BIGINT":
				case "SMALLINT":
					flag = true;
					break;
				default:
					flag = false;
					break;
				}
				if (flag)
				{
					dbColumn.IsAutoIncrement = true;
				}
			}
		}
	}

	private static void ReadForeignKeys(SqlConnection connection, Dictionary<string, DbTable> tableMap, DbSchema schema)
	{
		using SqlCommand sqlCommand = connection.CreateCommand();
		sqlCommand.CommandText = "SELECT\n    fk.name AS FK_NAME,\n    tp.name AS PARENT_TABLE,\n    cp.name AS PARENT_COLUMN,\n    tr.name AS CHILD_TABLE,\n    cr.name AS CHILD_COLUMN\nFROM sys.foreign_keys fk\nINNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id\nINNER JOIN sys.tables tp ON fkc.referenced_object_id = tp.object_id\nINNER JOIN sys.columns cp ON fkc.referenced_object_id = cp.object_id AND fkc.referenced_column_id = cp.column_id\nINNER JOIN sys.tables tr ON fkc.parent_object_id = tr.object_id\nINNER JOIN sys.columns cr ON fkc.parent_object_id = cr.object_id AND fkc.parent_column_id = cr.column_id\nORDER BY fk.name, fkc.constraint_column_id;";
		using SqlDataReader sqlDataReader = sqlCommand.ExecuteReader();
		while (sqlDataReader.Read())
		{
			SchemaRelationshipBuilder.AddForeignKey(schema, tableMap, sqlDataReader.GetString(1), sqlDataReader.GetString(2), sqlDataReader.GetString(3), sqlDataReader.GetString(4), sqlDataReader.GetString(0));
		}
	}
}
