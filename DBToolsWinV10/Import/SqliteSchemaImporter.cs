using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using DBToolsWinV10.Models;
using Microsoft.Data.Sqlite;

namespace DBToolsWinV10.Import;

public static class SqliteSchemaImporter
{
	public static DbSchema Import(string dbFilePath, string password = null)
	{
		if (!File.Exists(dbFilePath))
			throw new FileNotFoundException("SQLite 데이터베이스 파일을 찾을 수 없습니다.", dbFilePath);

		string fullPath = Path.GetFullPath(dbFilePath);
		try
		{
			using SqliteConnection connection = OpenConnection(fullPath, password);
			return ReadSchema(fullPath, connection);
		}
		catch (SqlitePasswordRejectedException)
		{
			throw;
		}
		catch (SqlitePasswordRequiredException)
		{
			throw;
		}
		catch (SqliteException ex) when (!string.IsNullOrEmpty(password) && LooksLikeEncryptedDatabase(ex, fullPath))
		{
			throw new SqlitePasswordRejectedException(ex);
		}
		catch (SqliteException ex) when (string.IsNullOrEmpty(password) && LooksLikeEncryptedDatabase(ex, fullPath))
		{
			throw new SqlitePasswordRequiredException(fullPath, ex);
		}
		catch (SqliteException ex)
		{
			throw new InvalidDataException("SQLite 데이터베이스를 읽을 수 없습니다: " + ex.Message, ex);
		}
	}

	public static bool LooksLikeEncryptedDatabase(SqliteException ex, string filePath = null)
	{
		if (!string.IsNullOrEmpty(filePath) && !SqliteFileDetector.HasSqliteHeader(filePath))
			return false;

		if (ex.SqliteErrorCode == 26)
			return true;

		string message = ex.Message;
		return message.Contains("encrypted", StringComparison.OrdinalIgnoreCase)
			|| message.Contains("not a database", StringComparison.OrdinalIgnoreCase)
			|| message.Contains("file is not a database", StringComparison.OrdinalIgnoreCase);
	}

	private static DbSchema ReadSchema(string fullPath, SqliteConnection connection)
	{
		DbSchema dbSchema = new DbSchema
		{
			Name = Path.GetFileNameWithoutExtension(fullPath),
			TargetDb = DbTargetType.SQLite
		};

		List<string> list = ReadUserTables(connection);
		Dictionary<string, DbTable> dictionary = new Dictionary<string, DbTable>(StringComparer.OrdinalIgnoreCase);
		foreach (string item in list)
		{
			DbTable dbTable = new DbTable
			{
				Name = item
			};
			ReadColumns(connection, dbTable);
			dbSchema.Tables.Add(dbTable);
			dictionary[item] = dbTable;
		}

		ApplyUniqueIndexes(connection, dictionary);
		ReadForeignKeys(connection, dictionary, dbSchema);
		SchemaLayout.AutoArrange(dbSchema);
		return dbSchema;
	}

	private static SqliteConnection OpenConnection(string fullPath, string password)
	{
		SqliteConnectionStringBuilder builder = new SqliteConnectionStringBuilder
		{
			DataSource = fullPath,
			Mode = SqliteOpenMode.ReadOnly
		};
		if (!string.IsNullOrEmpty(password))
			builder.Password = password;

		SqliteConnection connection = new SqliteConnection(builder.ConnectionString);
		connection.Open();
		VerifyReadable(connection);
		return connection;
	}

	private static void VerifyReadable(SqliteConnection connection)
	{
		using SqliteCommand command = connection.CreateCommand();
		command.CommandText = "SELECT COUNT(*) FROM sqlite_master;";
		command.ExecuteScalar();
	}

	private static List<string> ReadUserTables(SqliteConnection connection)
	{
		List<string> list = new List<string>();
		using SqliteCommand sqliteCommand = connection.CreateCommand();
		sqliteCommand.CommandText = "SELECT name\nFROM sqlite_master\nWHERE type = 'table'\n  AND name NOT LIKE 'sqlite_%'\nORDER BY name;";
		using SqliteDataReader sqliteDataReader = sqliteCommand.ExecuteReader();
		while (sqliteDataReader.Read())
		{
			list.Add(sqliteDataReader.GetString(0));
		}
		return list;
	}

	private static void ReadColumns(SqliteConnection connection, DbTable table)
	{
		using SqliteCommand sqliteCommand = connection.CreateCommand();
		sqliteCommand.CommandText = "PRAGMA table_info(" + QuoteIdent(table.Name) + ");";
		using SqliteDataReader sqliteDataReader = sqliteCommand.ExecuteReader();
		while (sqliteDataReader.Read())
		{
			string name = sqliteDataReader.GetString(1);
			string rawType = (sqliteDataReader.IsDBNull(2) ? "TEXT" : sqliteDataReader.GetString(2));
			bool flag = sqliteDataReader.GetInt64(3) == 1;
			string defaultValue = (sqliteDataReader.IsDBNull(4) ? null : sqliteDataReader.GetString(4));
			int num = (int)sqliteDataReader.GetInt64(5);
			ParseType(rawType, out string dataType, out int? length, out int? precision, out int? scale);
			table.Columns.Add(new DbColumn
			{
				Name = name,
				DataType = dataType,
				Length = length,
				Precision = precision,
				Scale = scale,
				IsPrimaryKey = (num > 0),
				IsNullable = !flag,
				DefaultValue = defaultValue
			});
		}
		List<DbColumn> list = table.Columns.Where((DbColumn c) => c.IsPrimaryKey).ToList();
		if (list.Count == 1)
		{
			DbColumn dbColumn = list[0];
			if (IsIntegerType(dbColumn.DataType))
			{
				dbColumn.IsAutoIncrement = true;
			}
		}
	}

	private static void ApplyUniqueIndexes(SqliteConnection connection, IReadOnlyDictionary<string, DbTable> tableMap)
	{
		foreach (DbTable value in tableMap.Values)
		{
			using SqliteCommand sqliteCommand = connection.CreateCommand();
			sqliteCommand.CommandText = "PRAGMA index_list(" + QuoteIdent(value.Name) + ");";
			using SqliteDataReader sqliteDataReader = sqliteCommand.ExecuteReader();
			while (sqliteDataReader.Read())
			{
				string text = sqliteDataReader.GetString(1);
				if (sqliteDataReader.GetInt64(2) != 1 || text.StartsWith("sqlite_autoindex_", StringComparison.OrdinalIgnoreCase))
				{
					continue;
				}
				List<string> indexedColumns = ReadIndexColumns(connection, text);
				if (indexedColumns.Count == 1)
				{
					DbColumn dbColumn = value.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, indexedColumns[0], StringComparison.OrdinalIgnoreCase));
					if (dbColumn != null && !dbColumn.IsPrimaryKey)
					{
						dbColumn.IsUnique = true;
					}
				}
			}
		}
	}

	private static List<string> ReadIndexColumns(SqliteConnection connection, string indexName)
	{
		List<string> list = new List<string>();
		using SqliteCommand sqliteCommand = connection.CreateCommand();
		sqliteCommand.CommandText = "PRAGMA index_info(" + QuoteIdent(indexName) + ");";
		using SqliteDataReader sqliteDataReader = sqliteCommand.ExecuteReader();
		while (sqliteDataReader.Read())
		{
			list.Add(sqliteDataReader.GetString(2));
		}
		return list;
	}

	private static void ReadForeignKeys(SqliteConnection connection, IReadOnlyDictionary<string, DbTable> tableMap, DbSchema schema)
	{
		foreach (DbTable value2 in tableMap.Values)
		{
			using SqliteCommand sqliteCommand = connection.CreateCommand();
			sqliteCommand.CommandText = "PRAGMA foreign_key_list(" + QuoteIdent(value2.Name) + ");";
			using SqliteDataReader sqliteDataReader = sqliteCommand.ExecuteReader();
			while (sqliteDataReader.Read())
			{
				string text = sqliteDataReader.GetString(2);
				string fromColumn = sqliteDataReader.GetString(3);
				string toColumn = sqliteDataReader.GetString(4);
				if (tableMap.TryGetValue(text, out DbTable value))
				{
					DbColumn dbColumn = value.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, toColumn, StringComparison.OrdinalIgnoreCase));
					DbColumn dbColumn2 = value2.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, fromColumn, StringComparison.OrdinalIgnoreCase));
					if (dbColumn != null && dbColumn2 != null)
					{
						SchemaRelationshipBuilder.AddForeignKey(schema, tableMap, text, toColumn, value2.Name, fromColumn);
					}
				}
			}
		}
	}

	private static void ParseType(string rawType, out string dataType, out int? length, out int? precision, out int? scale)
	{
		length = null;
		precision = null;
		scale = null;
		string text = rawType.Trim();
		if (string.IsNullOrWhiteSpace(text))
		{
			dataType = "TEXT";
			return;
		}
		int num = text.IndexOf('(');
		if (num < 0)
		{
			dataType = text.ToUpperInvariant();
			return;
		}
		dataType = text.Substring(0, num).Trim().ToUpperInvariant();
		string text2 = text.Substring(num + 1).TrimEnd().TrimEnd(')')
			.Trim();
		int result3;
		if (text2.Contains(','))
		{
			string[] array = text2.Split(',', 2);
			if (int.TryParse(array[0].Trim(), out var result))
			{
				precision = result;
			}
			if (int.TryParse(array[1].Trim(), out var result2))
			{
				scale = result2;
			}
		}
		else if (int.TryParse(text2, out result3))
		{
			length = result3;
		}
	}

	private static bool IsIntegerType(string dataType)
	{
		return dataType.Equals("INTEGER", StringComparison.OrdinalIgnoreCase) || dataType.Equals("INT", StringComparison.OrdinalIgnoreCase);
	}

	private static string QuoteIdent(string identifier)
	{
		return "\"" + identifier.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
	}
}
