using System.Data.Common;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Persistence;

internal static class DatabaseSchemaInitializer
{
    public static async Task EnsureSchemaAsync(
        DatabaseConnectionSettings settings,
        CancellationToken cancellationToken = default)
    {
        await using var connection = DatabaseConnectionFactory.CreateConnection(settings);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);

        var sql = settings.Provider switch
        {
            AnalysisDatabaseProvider.PostgreSql => BuildPostgreSql(settings.ResolveRunsTableName()),
            AnalysisDatabaseProvider.MySql or AnalysisDatabaseProvider.MariaDb =>
                BuildMySql(settings.ResolveRunsTableName()),
            _ => throw new NotSupportedException("지원하지 않는 DB 종류입니다.")
        };

        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    private static string BuildPostgreSql(string tableName) =>
        $"""
        CREATE TABLE IF NOT EXISTS {tableName} (
            id BIGSERIAL PRIMARY KEY,
            root_directory TEXT NOT NULL,
            saved_at_utc TIMESTAMPTZ NOT NULL,
            elapsed_ms BIGINT NOT NULL,
            file_count INTEGER NOT NULL,
            directory_count INTEGER NOT NULL,
            function_count INTEGER NOT NULL,
            call_edge_count INTEGER NOT NULL,
            duplicate_group_count INTEGER NOT NULL,
            issue_count INTEGER NOT NULL,
            quality_score REAL NULL,
            summary_json TEXT NOT NULL,
            document_json TEXT NOT NULL,
            document_version VARCHAR(16) NOT NULL,
            app_version VARCHAR(32) NULL
        );
        """;

    private static string BuildMySql(string tableName) =>
        $"""
        CREATE TABLE IF NOT EXISTS {tableName} (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            root_directory TEXT NOT NULL,
            saved_at_utc DATETIME(6) NOT NULL,
            elapsed_ms BIGINT NOT NULL,
            file_count INT NOT NULL,
            directory_count INT NOT NULL,
            function_count INT NOT NULL,
            call_edge_count INT NOT NULL,
            duplicate_group_count INT NOT NULL,
            issue_count INT NOT NULL,
            quality_score DOUBLE NULL,
            summary_json LONGTEXT NOT NULL,
            document_json LONGTEXT NOT NULL,
            document_version VARCHAR(16) NOT NULL,
            app_version VARCHAR(32) NULL
        );
        """;
}
