using System;
using System.Collections.Generic;
using System.Data;
using System.Data.OleDb;
using System.IO;
using System.Linq;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Import;

public static class AccessSchemaImporter
{
	public static DbSchema Import(string filePath)
	{
		if (!File.Exists(filePath))
		{
			throw new FileNotFoundException("Access 데이터베이스 파일을 찾을 수 없습니다.", filePath);
		}
		string fullPath = Path.GetFullPath(filePath);
		DbSchema dbSchema = new DbSchema
		{
			Name = Path.GetFileNameWithoutExtension(fullPath),
			TargetDb = DbTargetType.SqlServer
		};
		using OleDbConnection oleDbConnection = new OleDbConnection(BuildConnectionString(fullPath));
		try
		{
			oleDbConnection.Open();
		}
		catch (Exception innerException)
		{
			throw new InvalidOperationException("Microsoft Access 데이터베이스를 열 수 없습니다. Microsoft Access Database Engine(ACE OLEDB)이 설치되어 있는지 확인하세요.", innerException);
		}
		Dictionary<string, DbTable> tableMap = new Dictionary<string, DbTable>(StringComparer.OrdinalIgnoreCase);
		ReadTables(oleDbConnection, dbSchema, tableMap);
		ReadPrimaryKeys(oleDbConnection, tableMap);
		ReadForeignKeys(oleDbConnection, tableMap, dbSchema);
		SchemaLayout.AutoArrange(dbSchema);
		return dbSchema;
	}

	private static string BuildConnectionString(string fullPath)
	{
		string text = Path.GetExtension(fullPath).ToLowerInvariant();
		if (text == ".accdb")
		{
			return "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" + fullPath + ";Persist Security Info=False;";
		}
		return "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=" + fullPath + ";Persist Security Info=False;";
	}

	private static void ReadTables(OleDbConnection connection, DbSchema schema, Dictionary<string, DbTable> tableMap)
	{
		string[] restrictionValues = new string[4] { null, null, null, "TABLE" };
		DataTable schema2 = connection.GetSchema("Tables", restrictionValues);
		foreach (DataRow row in schema2.Rows)
		{
			string a = row["TABLE_TYPE"]?.ToString();
			if (string.Equals(a, "TABLE", StringComparison.OrdinalIgnoreCase))
			{
				string text = row["TABLE_NAME"]?.ToString() ?? string.Empty;
				if (!string.IsNullOrWhiteSpace(text) && !text.StartsWith("MSys", StringComparison.OrdinalIgnoreCase))
				{
					DbTable dbTable = new DbTable
					{
						Name = text
					};
					ReadColumns(connection, dbTable);
					schema.Tables.Add(dbTable);
					tableMap[text] = dbTable;
				}
			}
		}
	}

	private static void ReadColumns(OleDbConnection connection, DbTable table)
	{
		string[] restrictionValues = new string[4] { null, null, table.Name, null };
		DataTable schema = connection.GetSchema("Columns", restrictionValues);
		foreach (DataRow row in schema.Rows)
		{
			string text = row["COLUMN_NAME"]?.ToString() ?? string.Empty;
			if (!string.IsNullOrWhiteSpace(text))
			{
				string providerType = row["DATA_TYPE"]?.ToString() ?? "TEXT";
				bool isNullable = row["IS_NULLABLE"]?.ToString()?.Equals("YES", StringComparison.OrdinalIgnoreCase) ?? true;
				string text2 = row["COLUMN_DEFAULT"]?.ToString();
				int? length = ((row["CHARACTER_MAXIMUM_LENGTH"] is DBNull) ? ((int?)null) : new int?(Convert.ToInt32(row["CHARACTER_MAXIMUM_LENGTH"])));
				if (length.HasValue && length.GetValueOrDefault() <= 0)
				{
					length = null;
				}
				table.Columns.Add(new DbColumn
				{
					Name = text,
					DataType = MapAccessType(providerType, row["DATA_TYPE"]),
					Length = length,
					IsNullable = isNullable,
					DefaultValue = (string.IsNullOrWhiteSpace(text2) ? null : text2)
				});
			}
		}
	}

	private static string MapAccessType(string providerType, object dataTypeCode)
	{
		if (int.TryParse(dataTypeCode.ToString(), out var result))
		{
			if (1 == 0)
			{
			}
			string result2;
			switch (result)
			{
			case 2:
			case 16:
			case 18:
				result2 = "SMALLINT";
				break;
			case 3:
			case 19:
				result2 = "INTEGER";
				break;
			case 20:
				result2 = "BIGINT";
				break;
			case 4:
				result2 = "REAL";
				break;
			case 5:
			case 6:
				result2 = "DOUBLE";
				break;
			case 7:
				result2 = "DATE";
				break;
			case 11:
				result2 = "BOOLEAN";
				break;
			case 130:
			case 202:
			case 203:
				result2 = "VARCHAR";
				break;
			default:
				result2 = "TEXT";
				break;
			}
			if (1 == 0)
			{
			}
			return result2;
		}
		return providerType.ToUpperInvariant();
	}

	private static void ReadPrimaryKeys(OleDbConnection connection, Dictionary<string, DbTable> tableMap)
	{
		DataTable schema = connection.GetSchema("Indexes");
		foreach (DataRow row in schema.Rows)
		{
			object obj = row["PRIMARY_KEY"];
			if (obj is bool)
			{
				if ((bool)obj)
				{
					goto IL_008d;
				}
			}
			else if (obj is int num)
			{
				if (num == 1)
				{
					goto IL_008d;
				}
			}
			else if (obj is string text && text == "True")
			{
				goto IL_008d;
			}
			bool flag = false;
			goto IL_0095;
			IL_0095:
			if (!flag)
			{
				continue;
			}
			string text2 = row["TABLE_NAME"]?.ToString();
			string columnName = row["COLUMN_NAME"]?.ToString();
			if (text2 == null || columnName == null || !tableMap.TryGetValue(text2, out DbTable value))
			{
				continue;
			}
			DbColumn dbColumn = value.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, columnName, StringComparison.OrdinalIgnoreCase));
			if (dbColumn != null)
			{
				dbColumn.IsPrimaryKey = true;
				dbColumn.IsNullable = false;
				if (string.Equals(dbColumn.DataType, "INTEGER", StringComparison.OrdinalIgnoreCase))
				{
					dbColumn.IsAutoIncrement = true;
				}
			}
			continue;
			IL_008d:
			flag = true;
			goto IL_0095;
		}
	}

	private static void ReadForeignKeys(OleDbConnection connection, Dictionary<string, DbTable> tableMap, DbSchema schema)
	{
		DataTable schema2;
		try
		{
			schema2 = connection.GetSchema("Foreign_Keys");
		}
		catch
		{
			return;
		}
		foreach (DataRow row in schema2.Rows)
		{
			string text = row["PK_TABLE_NAME"]?.ToString();
			string text2 = row["PK_COLUMN_NAME"]?.ToString();
			string text3 = row["FK_TABLE_NAME"]?.ToString();
			string text4 = row["FK_COLUMN_NAME"]?.ToString();
			string constraintName = row["FK_NAME"]?.ToString();
			if (text != null && text2 != null && text3 != null && text4 != null)
			{
				SchemaRelationshipBuilder.AddForeignKey(schema, tableMap, text, text2, text3, text4, constraintName);
			}
		}
	}
}
