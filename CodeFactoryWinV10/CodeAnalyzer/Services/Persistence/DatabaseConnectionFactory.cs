using System.Data.Common;
using CodeAnalyzer.Models;
using MySqlConnector;
using Npgsql;

namespace CodeAnalyzer.Services.Persistence;

internal static class DatabaseConnectionFactory
{
    public static DbConnection CreateConnection(DatabaseConnectionSettings settings)
    {
        var normalized = DatabaseConnectionSettings.Normalize(settings);
        normalized.ValidateForUse();

        return normalized.Provider switch
        {
            AnalysisDatabaseProvider.PostgreSql => new NpgsqlConnection(BuildPostgreSqlConnectionString(normalized)),
            AnalysisDatabaseProvider.MySql or AnalysisDatabaseProvider.MariaDb =>
                new MySqlConnection(BuildMySqlConnectionString(normalized)),
            _ => throw new NotSupportedException("지원하지 않는 DB 종류입니다.")
        };
    }

    public static string BuildPostgreSqlConnectionString(DatabaseConnectionSettings settings)
    {
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = settings.Host,
            Port = settings.ResolvePort(),
            Database = settings.Database,
            Username = settings.Username,
            Password = settings.Password,
            Timeout = 15,
            CommandTimeout = 120
        };
        return builder.ConnectionString;
    }

    public static string BuildMySqlConnectionString(DatabaseConnectionSettings settings)
    {
        var builder = new MySqlConnectionStringBuilder
        {
            Server = settings.Host,
            Port = (uint)settings.ResolvePort(),
            Database = settings.Database,
            UserID = settings.Username,
            Password = settings.Password,
            ConnectionTimeout = 15,
            DefaultCommandTimeout = 120,
            AllowUserVariables = true
        };
        return builder.ConnectionString;
    }
}
