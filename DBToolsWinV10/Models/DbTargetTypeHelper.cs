namespace DBToolsWinV10.Models;

public static class DbTargetTypeHelper
{
	public static string GetDisplayName(DbTargetType db)
	{
		return db switch
		{
			DbTargetType.PostgreSQL => "PostgreSQL",
			DbTargetType.MySQL => "MySQL",
			DbTargetType.MariaDB => "MariaDB",
			DbTargetType.SQLite => "SQLite",
			DbTargetType.SqlServer => "SQL Server",
			DbTargetType.VectorDb => "FAISS",
			_ => db.ToString()
		};
	}

	public static string GetIconKey(DbTargetType db)
	{
		return db == DbTargetType.VectorDb ? "FAISS" : db.ToString();
	}
}
