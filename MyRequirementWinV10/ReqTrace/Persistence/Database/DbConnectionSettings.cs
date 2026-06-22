namespace ReqTrace.Persistence.Database;

public class DbConnectionSettings
{
    public DbProvider Provider { get; set; } = DbProvider.MariaDb;
    public string Server { get; set; } = "localhost";
    public int Port { get; set; } = 3306;
    public string Database { get; set; } = "reqtrace";
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public bool IntegratedSecurity { get; set; }
    public string SqliteFilePath { get; set; } = string.Empty;

    public static int DefaultPortFor(DbProvider provider) => provider switch
    {
        DbProvider.MySql or DbProvider.MariaDb => 3306,
        DbProvider.PostgreSql => 5432,
        DbProvider.SqlServer => 1433,
        DbProvider.Sqlite => 0,
        _ => 0
    };

    public string BuildConnectionString() => BuildConnectionString(Database);

    /// <summary>
    /// Connection string targeting the provider's always-present administrative database
    /// (used to check for / create the target database before it exists).
    /// </summary>
    public string BuildAdminConnectionString() => Provider switch
    {
        DbProvider.MySql or DbProvider.MariaDb => BuildConnectionString(database: null),
        DbProvider.PostgreSql => BuildConnectionString("postgres"),
        DbProvider.SqlServer => BuildConnectionString("master"),
        DbProvider.Sqlite => BuildConnectionString(Database),
        _ => throw new NotSupportedException($"Unsupported provider: {Provider}")
    };

    private string BuildConnectionString(string? database)
    {
        return Provider switch
        {
            DbProvider.MySql or DbProvider.MariaDb =>
                $"Server={Server};Port={Port};{(database is null ? "" : $"Database={database};")}User Id={Username};Password={Password};",
            DbProvider.PostgreSql =>
                $"Host={Server};Port={Port};Database={database};Username={Username};Password={Password};",
            DbProvider.SqlServer => IntegratedSecurity
                ? $"Server={Server},{Port};Database={database};Integrated Security=true;TrustServerCertificate=true;"
                : $"Server={Server},{Port};Database={database};User Id={Username};Password={Password};TrustServerCertificate=true;",
            DbProvider.Sqlite =>
                $"Data Source={SqliteFilePath};",
            _ => throw new NotSupportedException($"Unsupported provider: {Provider}")
        };
    }
}
