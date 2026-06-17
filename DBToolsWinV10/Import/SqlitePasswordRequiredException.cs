namespace DBToolsWinV10.Import;

public sealed class SqlitePasswordRequiredException : Exception
{
	public SqlitePasswordRequiredException(string filePath, Exception innerException)
		: base("SQLCipher로 암호화된 데이터베이스입니다. 암호가 필요합니다.", innerException)
	{
		FilePath = filePath;
	}

	public string FilePath { get; }
}

public sealed class SqlitePasswordRejectedException : Exception
{
	public SqlitePasswordRejectedException(Exception innerException)
		: base("데이터베이스 암호가 올바르지 않습니다.", innerException)
	{
	}
}
