using DBToolsWinV10.Models;
using Microsoft.Data.Sqlite;

namespace DBToolsWinV10.Export;

public static class SqliteDatabaseExporter
{
	public static void Export(DbSchema schema, string filePath)
	{
		if (schema == null)
		{
			throw new ArgumentNullException(nameof(schema));
		}
		if (string.IsNullOrWhiteSpace(filePath))
		{
			throw new ArgumentException("파일 경로가 필요합니다.", nameof(filePath));
		}

		DbSchema sqliteSchema = SchemaExportHelper.CloneForTarget(schema, DbTargetType.SQLite);
		string sql = SqlExporter.Export(sqliteSchema);
		if (File.Exists(filePath))
		{
			File.Delete(filePath);
		}

		using SqliteConnection connection = new SqliteConnection($"Data Source={filePath}");
		connection.Open();
		using SqliteCommand pragma = connection.CreateCommand();
		pragma.CommandText = "PRAGMA foreign_keys = ON;";
		pragma.ExecuteNonQuery();
		foreach (string statement in SqlStatementSplitter.Split(sql))
		{
			if (string.IsNullOrWhiteSpace(statement))
			{
				continue;
			}
			using SqliteCommand command = connection.CreateCommand();
			command.CommandText = statement;
			command.ExecuteNonQuery();
		}
	}
}
