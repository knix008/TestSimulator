using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Models;

public sealed class DatabaseSettings
{
    public DatabaseProviderType Provider { get; set; } = DatabaseProviderType.MariaDB;
    public string Server { get; set; } = "localhost";
    public string Port { get; set; } = "3306";
    public string Database { get; set; } = "myworkspace";
    public string User { get; set; } = "root";
    public string Password { get; set; } = string.Empty;
    public string SqliteFilePath { get; set; } = string.Empty;

    public static DatabaseSettings CreateDefault(DatabaseProviderType provider = DatabaseProviderType.MariaDB) =>
        new()
        {
            Provider = provider,
            Server = "localhost",
            Port = GetDefaultPort(provider),
            Database = "myworkspace",
            User = provider == DatabaseProviderType.PostgreSQL ? "postgres" : "root",
            Password = string.Empty,
            SqliteFilePath = GetDefaultSqlitePath()
        };

    public static string GetDefaultPort(DatabaseProviderType provider) => provider switch
    {
        DatabaseProviderType.MariaDB or DatabaseProviderType.MySQL => "3306",
        DatabaseProviderType.PostgreSQL => "5432",
        DatabaseProviderType.SqlServer => "1433",
        DatabaseProviderType.SQLite => string.Empty,
        _ => "3306"
    };

    public static string GetDefaultSqlitePath()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MyWorkspaceWinV10");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, "myworkspace.db");
    }

    public static string GetProviderDisplayName(DatabaseProviderType provider) => provider switch
    {
        DatabaseProviderType.MariaDB => "MariaDB",
        DatabaseProviderType.MySQL => "MySQL",
        DatabaseProviderType.PostgreSQL => "PostgreSQL",
        DatabaseProviderType.SqlServer => "Microsoft SQL Server",
        DatabaseProviderType.SQLite => "SQLite 3",
        _ => provider.ToString()
    };

    public string BuildConnectionString(bool includeDatabase = true)
    {
        if (Provider == DatabaseProviderType.SQLite)
        {
            var path = string.IsNullOrWhiteSpace(SqliteFilePath) ? GetDefaultSqlitePath() : SqliteFilePath.Trim();
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
                Directory.CreateDirectory(directory);

            return $"Data Source={path};";
        }

        var server = Server.Trim();
        var port = Port.Trim();
        var database = Database.Trim();
        var user = User.Trim();
        var password = Password;

        if (string.IsNullOrEmpty(server))
            throw new InvalidOperationException("서버를 입력하세요.");

        if (includeDatabase && string.IsNullOrEmpty(database))
            throw new InvalidOperationException("데이터베이스 이름을 입력하세요.");

        return Provider switch
        {
            DatabaseProviderType.MariaDB or DatabaseProviderType.MySQL =>
                includeDatabase
                    ? $"Server={server};Port={port};Database={database};User={user};Password={password};"
                    : $"Server={server};Port={port};User={user};Password={password};",
            DatabaseProviderType.PostgreSQL =>
                includeDatabase
                    ? $"Host={server};Port={port};Database={database};Username={user};Password={password};"
                    : $"Host={server};Port={port};Database=postgres;Username={user};Password={password};",
            DatabaseProviderType.SqlServer =>
                includeDatabase
                    ? $"Server={server},{port};Database={database};User Id={user};Password={password};TrustServerCertificate=True;Encrypt=True;"
                    : $"Server={server},{port};Database=master;User Id={user};Password={password};TrustServerCertificate=True;Encrypt=True;",
            _ => throw new NotSupportedException($"지원하지 않는 DB 유형입니다: {Provider}")
        };
    }

    public string BuildAdminConnectionString() => BuildConnectionString(includeDatabase: false);

    public DatabaseSettings Clone() => new()
    {
        Provider = Provider,
        Server = Server,
        Port = Port,
        Database = Database,
        User = User,
        Password = Password,
        SqliteFilePath = SqliteFilePath
    };
}
