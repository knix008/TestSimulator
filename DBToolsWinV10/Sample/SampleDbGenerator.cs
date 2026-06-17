using System.Data.OleDb;
using System.Reflection;
using System.Text;
using DBToolsWinV10.Analysis;
using DBToolsWinV10.Export;
using DBToolsWinV10.Import;
using DBToolsWinV10.Models;
using DBToolsWinV10.Serialization;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;

namespace DBToolsWinV10.Sample;

internal static class SampleDbGenerator
{
	private const string BaseName = "OnlineShop";

	public static void GenerateAll(string outputDir)
	{
		Directory.CreateDirectory(outputDir);
		DbSchema schema = SampleSchemaFactory.CreateOnlineShop();

		string mdprjPath = Path.Combine(outputDir, $"{BaseName}.mdprj");
		SchemaSerializer.Save(schema, mdprjPath);

		string reportPath = Path.Combine(outputDir, $"{BaseName}_report.md");
		File.WriteAllText(reportPath, SchemaReportWriter.Write(schema, mdprjPath));

		WriteSqlDdl(outputDir, schema);
		CreateSqliteFile(Path.Combine(outputDir, $"{BaseName}_sqlite.db"));
		// 기존 경로 호환
		File.Copy(Path.Combine(outputDir, $"{BaseName}_sqlite.db"), Path.Combine(outputDir, $"{BaseName}.db"), overwrite: true);

		TryCreateSqlServerMdf(Path.Combine(outputDir, $"{BaseName}_sqlserver.mdf"));
		TryCreateAccessDatabase(Path.Combine(outputDir, $"{BaseName}_access.accdb"));

		VerifyImports(outputDir);
	}

	private static void WriteSqlDdl(string outputDir, DbSchema schema)
	{
		(DbTargetType db, string suffix, bool useExporter)[] targets =
		[
			(DbTargetType.PostgreSQL, "postgres", true),
			(DbTargetType.MySQL, "mysql", true),
			(DbTargetType.MariaDB, "mariadb", true),
			(DbTargetType.SqlServer, "sqlserver", false),
		];

		foreach ((DbTargetType db, string suffix, bool useExporter) in targets)
		{
			string path = Path.Combine(outputDir, $"{BaseName}_{suffix}.sql");
			string sql = useExporter
				? SqlExporter.Export(CloneFor(schema, db))
				: SqlServerDdl;
			File.WriteAllText(path, sql, Encoding.UTF8);
			Console.WriteLine($"  - {path}");
		}
	}

	private static DbSchema CloneFor(DbSchema schema, DbTargetType db)
	{
		DbSchema clone = schema.Clone();
		clone.TargetDb = db;
		return clone;
	}

	private static void CreateSqliteFile(string dbPath)
	{
		if (File.Exists(dbPath))
			File.Delete(dbPath);

		using var connection = new SqliteConnection($"Data Source={dbPath}");
		connection.Open();
		using var cmd = connection.CreateCommand();
		cmd.CommandText = """
			PRAGMA foreign_keys = ON;

			CREATE TABLE users (
			  id INTEGER PRIMARY KEY AUTOINCREMENT,
			  username TEXT NOT NULL,
			  email TEXT NOT NULL UNIQUE,
			  created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			CREATE TABLE categories (
			  id INTEGER PRIMARY KEY AUTOINCREMENT,
			  name TEXT NOT NULL,
			  description TEXT
			);

			CREATE TABLE products (
			  id INTEGER PRIMARY KEY AUTOINCREMENT,
			  name TEXT NOT NULL,
			  price REAL NOT NULL,
			  category_id INTEGER NOT NULL,
			  is_active INTEGER NOT NULL DEFAULT 1,
			  FOREIGN KEY (category_id) REFERENCES categories(id)
			);

			CREATE TABLE orders (
			  id INTEGER PRIMARY KEY AUTOINCREMENT,
			  user_id INTEGER NOT NULL,
			  order_date TEXT NOT NULL DEFAULT (datetime('now')),
			  status TEXT NOT NULL DEFAULT 'PENDING',
			  FOREIGN KEY (user_id) REFERENCES users(id)
			);

			CREATE TABLE order_items (
			  id INTEGER PRIMARY KEY AUTOINCREMENT,
			  order_id INTEGER NOT NULL,
			  product_id INTEGER NOT NULL,
			  quantity INTEGER NOT NULL DEFAULT 1,
			  unit_price REAL NOT NULL,
			  FOREIGN KEY (order_id) REFERENCES orders(id),
			  FOREIGN KEY (product_id) REFERENCES products(id)
			);
			""";
		cmd.ExecuteNonQuery();
		Console.WriteLine($"  - {dbPath}");
	}

	private static void TryCreateSqlServerMdf(string mdfPath)
	{
		string ldfPath = Path.ChangeExtension(mdfPath, ".ldf");
		string dbName = "OnlineShopSample_" + Guid.NewGuid().ToString("N")[..8];
		bool created = false;

		try
		{
			SafeDelete(mdfPath);
			SafeDelete(ldfPath);

			using (var master = new SqlConnection(@"Server=(localdb)\MSSQLLocalDB;Integrated Security=true;Trust Server Certificate=True"))
			{
				master.Open();
				using var create = master.CreateCommand();
				create.CommandText = $"""
					CREATE DATABASE [{dbName}] ON PRIMARY
					( NAME = N'{dbName}', FILENAME = N'{mdfPath.Replace("'", "''")}' )
					LOG ON
					( NAME = N'{dbName}_log', FILENAME = N'{ldfPath.Replace("'", "''")}' );
					""";
				create.ExecuteNonQuery();
			}
			created = true;

			string ddl = SqlServerDdl;

			using (var db = new SqlConnection($@"Server=(localdb)\MSSQLLocalDB;Database={dbName};Integrated Security=True;Trust Server Certificate=True"))
			{
				db.Open();
				ExecuteSqlBatches(db, ddl);
			}

			DetachDatabase(dbName);
			Console.WriteLine($"  - {mdfPath}");
		}
		catch (Exception ex)
		{
			if (created)
				DetachDatabase(dbName);
			Console.WriteLine($"  - {mdfPath}  (생략: {ex.Message})");
		}
	}

	private static void DetachDatabase(string dbName)
	{
		try
		{
			using var master = new SqlConnection(@"Server=(localdb)\MSSQLLocalDB;Integrated Security=true;Trust Server Certificate=True");
			master.Open();
			using var detach = master.CreateCommand();
			detach.CommandText = $"""
				IF DB_ID(N'{dbName}') IS NOT NULL
				BEGIN
					ALTER DATABASE [{dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
					EXEC sp_detach_db N'{dbName}';
				END
				""";
			detach.ExecuteNonQuery();
		}
		catch
		{
			// detach 실패 시 파일이 잠길 수 있음 — 호출자가 메시지로 처리
		}
	}

	private static void TryCreateAccessDatabase(string accdbPath)
	{
		SafeDelete(accdbPath);

		try
		{
			Type catalogType = Type.GetTypeFromProgID("ADOX.Catalog")
				?? throw new InvalidOperationException("ADOX.Catalog을 사용할 수 없습니다.");

			object catalog = Activator.CreateInstance(catalogType)!;
			catalogType.InvokeMember(
				"Create",
				BindingFlags.InvokeMethod,
				null,
				catalog,
				[$"Provider=Microsoft.ACE.OLEDB.12.0;Data Source={accdbPath};"]);

			using var connection = new OleDbConnection($"Provider=Microsoft.ACE.OLEDB.12.0;Data Source={accdbPath};");
			connection.Open();
			ExecuteOleDbBatches(connection, AccessDdl);
			Console.WriteLine($"  - {accdbPath}");
		}
		catch (Exception ex)
		{
			SafeDelete(accdbPath);
			Console.WriteLine($"  - {accdbPath}  (생략: {ex.Message})");
		}
	}

	private static void VerifyImports(string outputDir)
	{
		Console.WriteLine();
		Console.WriteLine("가져오기 검증:");

		TryVerify("SQLite", () => DatabaseFileImporter.Import(Path.Combine(outputDir, $"{BaseName}_sqlite.db")));
		TryVerify("PostgreSQL SQL", () => SqlDdlSchemaImporter.Import(Path.Combine(outputDir, $"{BaseName}_postgres.sql")));
		TryVerify("MySQL SQL", () => SqlDdlSchemaImporter.Import(Path.Combine(outputDir, $"{BaseName}_mysql.sql")));
		TryVerify("MariaDB SQL", () => SqlDdlSchemaImporter.Import(Path.Combine(outputDir, $"{BaseName}_mariadb.sql")));
		TryVerify("SQL Server SQL", () => SqlDdlSchemaImporter.Import(Path.Combine(outputDir, $"{BaseName}_sqlserver.sql")));

		string mdf = Path.Combine(outputDir, $"{BaseName}_sqlserver.mdf");
		if (File.Exists(mdf))
			TryVerify("SQL Server MDF", () => DatabaseFileImporter.Import(mdf));

		string accdb = Path.Combine(outputDir, $"{BaseName}_access.accdb");
		if (File.Exists(accdb))
			TryVerify("Access", () => DatabaseFileImporter.Import(accdb));
	}

	private static void TryVerify(string label, Func<DbSchema> import)
	{
		try
		{
			DbSchema imported = import();
			Console.WriteLine($"  {label}: 테이블 {imported.Tables.Count}개, 관계 {imported.Relationships.Count}개");
		}
		catch (Exception ex)
		{
			Console.WriteLine($"  {label}: 실패 ({ex.Message})");
		}
	}

	private static void ExecuteSqlBatches(SqlConnection connection, string script)
	{
		foreach (string batch in SplitSqlBatches(script))
		{
			if (string.IsNullOrWhiteSpace(batch))
				continue;

			using var cmd = connection.CreateCommand();
			cmd.CommandText = batch;
			cmd.ExecuteNonQuery();
		}
	}

	private static void ExecuteOleDbBatches(OleDbConnection connection, string script)
	{
		foreach (string batch in SplitSqlBatches(script))
		{
			if (string.IsNullOrWhiteSpace(batch))
				continue;

			using var cmd = connection.CreateCommand();
			cmd.CommandText = batch;
			cmd.ExecuteNonQuery();
		}
	}

	private static IEnumerable<string> SplitSqlBatches(string script)
	{
		var batch = new StringBuilder();
		foreach (string rawLine in script.Split('\n'))
		{
			string line = rawLine.TrimEnd('\r');
			if (line.StartsWith("--", StringComparison.Ordinal))
				continue;

			batch.AppendLine(line);
			if (line.EndsWith(";", StringComparison.Ordinal))
			{
				yield return batch.ToString();
				batch.Clear();
			}
		}

		if (batch.Length > 0)
			yield return batch.ToString();
	}

	private static void SafeDelete(string path)
	{
		try
		{
			if (File.Exists(path))
				File.Delete(path);
		}
		catch (IOException)
		{
		}
	}

	private const string SqlServerDdl = """
		-- OnlineShop sample (SQL Server)
		CREATE TABLE [users] (
		    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
		    [username] NVARCHAR(50) NOT NULL,
		    [email] NVARCHAR(255) NOT NULL UNIQUE,
		    [created_at] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
		);

		CREATE TABLE [categories] (
		    [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
		    [name] NVARCHAR(100) NOT NULL,
		    [description] NVARCHAR(MAX) NULL
		);

		CREATE TABLE [products] (
		    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
		    [name] NVARCHAR(200) NOT NULL,
		    [price] DECIMAL(12,2) NOT NULL,
		    [category_id] INT NOT NULL,
		    [is_active] BIT NOT NULL DEFAULT 1
		);

		CREATE TABLE [orders] (
		    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
		    [user_id] BIGINT NOT NULL,
		    [order_date] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
		    [status] NVARCHAR(20) NOT NULL DEFAULT N'PENDING'
		);

		CREATE TABLE [order_items] (
		    [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
		    [order_id] BIGINT NOT NULL,
		    [product_id] BIGINT NOT NULL,
		    [quantity] INT NOT NULL DEFAULT 1,
		    [unit_price] DECIMAL(12,2) NOT NULL
		);

		ALTER TABLE [products] ADD CONSTRAINT [fk_products_category]
		    FOREIGN KEY ([category_id]) REFERENCES [categories]([id]);

		ALTER TABLE [orders] ADD CONSTRAINT [fk_orders_user]
		    FOREIGN KEY ([user_id]) REFERENCES [users]([id]);

		ALTER TABLE [order_items] ADD CONSTRAINT [fk_order_items_order]
		    FOREIGN KEY ([order_id]) REFERENCES [orders]([id]);

		ALTER TABLE [order_items] ADD CONSTRAINT [fk_order_items_product]
		    FOREIGN KEY ([product_id]) REFERENCES [products]([id]);
		""";

	private const string AccessDdl = """
		CREATE TABLE users (
		  id AUTOINCREMENT PRIMARY KEY,
		  username TEXT(50) NOT NULL,
		  email TEXT(255) NOT NULL,
		  created_at DATETIME NOT NULL
		);

		CREATE TABLE categories (
		  id AUTOINCREMENT PRIMARY KEY,
		  name TEXT(100) NOT NULL,
		  description MEMO
		);

		CREATE TABLE products (
		  id AUTOINCREMENT PRIMARY KEY,
		  name TEXT(200) NOT NULL,
		  price CURRENCY NOT NULL,
		  category_id LONG NOT NULL,
		  is_active YESNO NOT NULL
		);

		CREATE TABLE orders (
		  id AUTOINCREMENT PRIMARY KEY,
		  user_id LONG NOT NULL,
		  order_date DATETIME NOT NULL,
		  status TEXT(20) NOT NULL
		);

		CREATE TABLE order_items (
		  id AUTOINCREMENT PRIMARY KEY,
		  order_id LONG NOT NULL,
		  product_id LONG NOT NULL,
		  quantity LONG NOT NULL,
		  unit_price CURRENCY NOT NULL
		);

		ALTER TABLE products ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id);
		ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id);
		ALTER TABLE order_items ADD CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id);
		ALTER TABLE order_items ADD CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id);
		""";
}
