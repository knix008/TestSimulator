using System.Data.Common;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using MySqlConnector;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using Npgsql;

namespace MyWorkspace.Data;

public static class DatabaseProvisioner
{
    private static readonly Regex DatabaseNamePattern = new("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);

    public static bool TestConnection(DatabaseSettings settings, bool createIfNotExists, out string errorMessage, out bool databaseCreated)
    {
        databaseCreated = false;

        if (createIfNotExists && !EnsureDatabaseExists(settings, out errorMessage, out databaseCreated))
            return false;

        return DatabaseContextFactory.TestConnection(settings, out errorMessage);
    }

    public static bool EnsureDatabaseExists(DatabaseSettings settings, out string errorMessage, out bool created)
    {
        created = false;

        try
        {
            if (settings.Provider == DatabaseProviderType.SQLite)
            {
                settings.BuildConnectionString();
                errorMessage = string.Empty;
                return true;
            }

            ValidateDatabaseName(settings.Database);

            if (DatabaseContextFactory.TestConnection(settings, out _))
            {
                errorMessage = string.Empty;
                return true;
            }

            created = CreateDatabase(settings);
            errorMessage = string.Empty;
            return true;
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
            return false;
        }
    }

    private static bool CreateDatabase(DatabaseSettings settings)
    {
        var databaseName = settings.Database.Trim();

        return settings.Provider switch
        {
            DatabaseProviderType.MariaDB or DatabaseProviderType.MySQL =>
                ExecuteNonQuery(
                    new MySqlConnection(settings.BuildAdminConnectionString()),
                    $"CREATE DATABASE IF NOT EXISTS `{databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"),

            DatabaseProviderType.PostgreSQL =>
                CreatePostgreSqlDatabase(settings, databaseName),

            DatabaseProviderType.SqlServer =>
                ExecuteNonQuery(
                    new SqlConnection(settings.BuildAdminConnectionString()),
                    $"""
                     IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'{databaseName}')
                     BEGIN
                         CREATE DATABASE [{databaseName}];
                     END
                     """),

            _ => throw new NotSupportedException($"지원하지 않는 DB 유형입니다: {settings.Provider}")
        };
    }

    private static bool CreatePostgreSqlDatabase(DatabaseSettings settings, string databaseName)
    {
        using var connection = new NpgsqlConnection(settings.BuildAdminConnectionString());
        connection.Open();

        using (var check = connection.CreateCommand())
        {
            check.CommandText = "SELECT 1 FROM pg_database WHERE datname = @name";
            check.Parameters.AddWithValue("name", databaseName);
            if (check.ExecuteScalar() != null)
                return false;
        }

        using var create = connection.CreateCommand();
        create.CommandText = $"CREATE DATABASE \"{databaseName}\" ENCODING 'UTF8';";
        create.ExecuteNonQuery();
        return true;
    }

    private static bool ExecuteNonQuery(DbConnection connection, string sql)
    {
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
        return true;
    }

    private static void ValidateDatabaseName(string databaseName)
    {
        if (string.IsNullOrWhiteSpace(databaseName) || !DatabaseNamePattern.IsMatch(databaseName))
            throw new InvalidOperationException("데이터베이스 이름은 영문, 숫자, 밑줄(_)만 사용할 수 있으며 숫자로 시작할 수 없습니다.");
    }
}
