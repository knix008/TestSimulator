using System.IO;
using DBToolsWinV10.Import.VectorIndex;

namespace DBToolsWinV10.Import;

public static class DbFileFormatDetector
{
	public const string OpenFileFilter =
		"지원 DB 파일|*.db;*.sqlite;*.sqlite3;*.db3;*.sql;*.mdf;*.mdb;*.accdb;*.faiss;*.findex;*.hnsw;*.index|" +
		"SQLite (*.db;*.sqlite;*.sqlite3)|*.db;*.sqlite;*.sqlite3;*.db3|" +
		"Vector Index (*.faiss;*.findex;*.hnsw;*.index)|*.faiss;*.findex;*.hnsw;*.index|" +
		"SQL DDL (*.sql)|*.sql|" +
		"SQL Server (*.mdf)|*.mdf|" +
		"Access (*.mdb;*.accdb)|*.mdb;*.accdb|" +
		"모든 파일 (*.*)|*.*";

	public static DbFileFormat Detect(string filePath)
	{
		string extension = Path.GetExtension(filePath).ToLowerInvariant();

		if (SqliteFileDetector.HasSqliteHeader(filePath)
			|| SqliteFileDetector.IsSqliteExtension(extension))
		{
			return DbFileFormat.Sqlite;
		}

		if (VectorIndexFileDetector.TryDetect(filePath, out _))
			return DbFileFormat.VectorIndex;

		if (1 == 0)
		{
		}
		DbFileFormat result;
		switch (extension)
		{
		case ".db":
		case ".sqlite":
		case ".sqlite3":
		case ".db3":
			result = DbFileFormat.Sqlite;
			break;
		case ".sql":
			result = DbFileFormat.SqlDdl;
			break;
		case ".mdb":
		case ".accdb":
			result = DbFileFormat.Access;
			break;
		case ".mdf":
			result = DbFileFormat.SqlServer;
			break;
		default:
			result = DbFileFormat.Unknown;
			break;
		}
		if (1 == 0)
		{
		}
		return result;
	}

	public static string GetDisplayName(DbFileFormat format)
	{
		if (1 == 0)
		{
		}
		string result = format switch
		{
			DbFileFormat.Sqlite => "SQLite",
			DbFileFormat.SqlDdl => "SQL DDL",
			DbFileFormat.Access => "Microsoft Access",
			DbFileFormat.SqlServer => "SQL Server",
			DbFileFormat.VectorIndex => "Vector Index",
			_ => "알 수 없음",
		};
		if (1 == 0)
		{
		}
		return result;
	}
}
