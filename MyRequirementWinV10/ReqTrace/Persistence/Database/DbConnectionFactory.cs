using System.Data.Common;
using Microsoft.Data.Sqlite;
using Microsoft.Data.SqlClient;
using MySqlConnector;
using Npgsql;

namespace ReqTrace.Persistence.Database;

public static class DbConnectionFactory
{
    public static DbConnection Create(DbConnectionSettings settings) => Create(settings, settings.BuildConnectionString());

    public static DbConnection CreateAdmin(DbConnectionSettings settings) => Create(settings, settings.BuildAdminConnectionString());

    private static DbConnection Create(DbConnectionSettings settings, string connectionString)
    {
        return settings.Provider switch
        {
            DbProvider.MySql or DbProvider.MariaDb => new MySqlConnection(connectionString),
            DbProvider.PostgreSql => new NpgsqlConnection(connectionString),
            DbProvider.SqlServer => new SqlConnection(connectionString),
            DbProvider.Sqlite => new SqliteConnection(connectionString),
            _ => throw new NotSupportedException($"Unsupported provider: {settings.Provider}")
        };
    }

    public static async Task<DbConnection> OpenAsync(DbConnectionSettings settings, CancellationToken cancellationToken = default)
    {
        var connection = Create(settings);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    public static async Task<DbConnection> OpenAdminAsync(DbConnectionSettings settings, CancellationToken cancellationToken = default)
    {
        var connection = CreateAdmin(settings);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }
}
