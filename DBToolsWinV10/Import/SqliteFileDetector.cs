using System;
using System.IO;
using System.Text;

namespace DBToolsWinV10.Import;

public static class SqliteFileDetector
{
	private const string SqliteHeader = "SQLite format 3";

	public static bool HasSqliteHeader(string filePath)
	{
		try
		{
			using FileStream stream = File.OpenRead(filePath);
			if (stream.Length < SqliteHeader.Length)
				return false;

			Span<byte> buffer = stackalloc byte[SqliteHeader.Length];
			if (stream.Read(buffer) != SqliteHeader.Length)
				return false;

			return Encoding.ASCII.GetString(buffer) == SqliteHeader;
		}
		catch
		{
			return false;
		}
	}

	public static bool IsSqliteExtension(string extension)
	{
		return extension is ".db" or ".sqlite" or ".sqlite3" or ".db3";
	}
}
