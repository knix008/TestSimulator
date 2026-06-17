namespace DBToolsWinV10.Models;

public static class DataTypeProvider
{
	private static readonly string[] PostgreSQLTypes = new string[38]
	{
		"SMALLINT", "INTEGER", "BIGINT", "DECIMAL", "NUMERIC", "REAL", "DOUBLE PRECISION", "SERIAL", "BIGSERIAL", "SMALLSERIAL",
		"CHAR", "VARCHAR", "TEXT", "BYTEA", "BOOLEAN", "DATE", "TIME", "TIMETZ", "TIMESTAMP", "TIMESTAMPTZ",
		"INTERVAL", "UUID", "JSON", "JSONB", "INET", "CIDR", "MACADDR", "POINT", "LINE", "LSEG",
		"BOX", "PATH", "POLYGON", "CIRCLE", "MONEY", "BIT", "VARBIT", "XML"
	};

	private static readonly string[] MySQLTypes = new string[32]
	{
		"TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "DECIMAL", "FLOAT", "DOUBLE", "CHAR", "VARCHAR",
		"TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
		"DATE", "TIME", "DATETIME", "TIMESTAMP", "YEAR", "ENUM", "SET", "JSON", "GEOMETRY", "POINT",
		"LINESTRING", "POLYGON"
	};

	private static readonly string[] MariaDBTypes = new string[33]
	{
		"TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "DECIMAL", "FLOAT", "DOUBLE", "CHAR", "VARCHAR",
		"TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT", "BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB",
		"DATE", "TIME", "DATETIME", "TIMESTAMP", "YEAR", "ENUM", "SET", "JSON", "UUID", "GEOMETRY",
		"POINT", "LINESTRING", "POLYGON"
	};

	private static readonly string[] SQLiteTypes = new string[13]
	{
		"INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC", "BOOLEAN", "DATE", "DATETIME", "VARCHAR", "CHAR",
		"DECIMAL", "FLOAT", "DOUBLE"
	};

	private static readonly string[] SqlServerTypes = new string[29]
	{
		"TINYINT", "SMALLINT", "INT", "BIGINT", "DECIMAL", "NUMERIC", "FLOAT", "REAL", "MONEY", "SMALLMONEY",
		"BIT", "CHAR", "VARCHAR", "NCHAR", "NVARCHAR", "TEXT", "NTEXT", "BINARY", "VARBINARY", "IMAGE",
		"DATE", "TIME", "DATETIME", "DATETIME2", "SMALLDATETIME", "DATETIMEOFFSET", "UNIQUEIDENTIFIER", "XML", "JSON"
	};

	private static readonly string[] VectorDbTypes = new string[6]
	{
		"BIGINT", "INT", "FLOAT", "DOUBLE", "TEXT", "VECTOR"
	};

	public static string[] GetTypes(DbTargetType db)
	{
		if (1 == 0)
		{
		}
		string[] result = db switch
		{
			DbTargetType.PostgreSQL => PostgreSQLTypes, 
			DbTargetType.MySQL => MySQLTypes, 
			DbTargetType.MariaDB => MariaDBTypes, 
			DbTargetType.SQLite => SQLiteTypes, 
			DbTargetType.SqlServer => SqlServerTypes, 
			DbTargetType.VectorDb => VectorDbTypes, 
			_ => SQLiteTypes, 
		};
		if (1 == 0)
		{
		}
		return result;
	}

	public static bool TypeHasLength(string type)
	{
		switch (type.ToUpperInvariant())
		{
		case "VARCHAR":
		case "CHAR":
		case "NVARCHAR":
		case "NCHAR":
		case "BINARY":
		case "VARBINARY":
		case "BIT":
		case "VARBIT":
		case "VECTOR":
		case "TEXT":
		case "NTEXT":
		case "IMAGE":
			return true;
		default:
			return false;
		}
	}

	public static bool TypeHasPrecisionScale(string type)
	{
		switch (type.ToUpperInvariant())
		{
		case "DECIMAL":
		case "NUMERIC":
		case "FLOAT":
		case "DOUBLE":
		case "DOUBLE PRECISION":
		case "MONEY":
		case "REAL":
			return true;
		default:
			return false;
		}
	}

	public static string GetAutoIncrementKeyword(DbTargetType db, string type)
	{
		if (1 == 0)
		{
		}
		string result;
		switch (db)
		{
		case DbTargetType.PostgreSQL:
		{
			bool flag;
			switch (type.ToUpperInvariant())
			{
			case "SERIAL":
			case "BIGSERIAL":
			case "SMALLSERIAL":
				flag = true;
				break;
			default:
				flag = false;
				break;
			}
			result = (flag ? string.Empty : "GENERATED ALWAYS AS IDENTITY");
			break;
		}
		case DbTargetType.MySQL:
		case DbTargetType.MariaDB:
			result = "AUTO_INCREMENT";
			break;
		case DbTargetType.SqlServer:
			result = "IDENTITY(1,1)";
			break;
		case DbTargetType.SQLite:
			result = string.Empty;
			break;
		default:
			result = string.Empty;
			break;
		}
		if (1 == 0)
		{
		}
		return result;
	}
}
