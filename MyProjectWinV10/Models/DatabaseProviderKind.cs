namespace MyProject.Models
{
    public enum DatabaseProviderKind
    {
        MariaDb,
        MySql,
        Sqlite,
        PostgreSql,
        SqlServer
    }

    public static class DatabaseProviderInfo
    {
        public static string GetDisplayName(DatabaseProviderKind provider) => provider switch
        {
            DatabaseProviderKind.MariaDb => "MariaDB",
            DatabaseProviderKind.MySql => "MySQL",
            DatabaseProviderKind.Sqlite => "SQLite",
            DatabaseProviderKind.PostgreSql => "PostgreSQL",
            DatabaseProviderKind.SqlServer => "SQL Server",
            _ => provider.ToString()
        };

        public static int GetDefaultPort(DatabaseProviderKind provider) => provider switch
        {
            DatabaseProviderKind.MariaDb => 3306,
            DatabaseProviderKind.MySql => 3306,
            DatabaseProviderKind.PostgreSql => 5432,
            DatabaseProviderKind.SqlServer => 1433,
            _ => 0
        };

        public static DatabaseProviderKind[] SupportedProviders { get; } =
        {
            DatabaseProviderKind.MariaDb,
            DatabaseProviderKind.MySql,
            DatabaseProviderKind.Sqlite,
            DatabaseProviderKind.PostgreSql,
            DatabaseProviderKind.SqlServer
        };
    }
}
