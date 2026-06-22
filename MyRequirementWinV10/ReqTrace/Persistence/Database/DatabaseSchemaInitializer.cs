using System.Data.Common;
using System.Text.RegularExpressions;

namespace ReqTrace.Persistence.Database;

public static class DatabaseSchemaInitializer
{
    private static readonly Regex ValidDatabaseName = new("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);

    /// <summary>
    /// Creates the target database on the server if it does not already exist yet.
    /// No-op for SQLite, where the database file is created automatically on connect.
    /// </summary>
    public static async Task EnsureDatabaseExistsAsync(DbConnectionSettings settings)
    {
        if (settings.Provider == DbProvider.Sqlite)
            return;

        if (!ValidDatabaseName.IsMatch(settings.Database))
            throw new InvalidOperationException($"Invalid database name: '{settings.Database}'. Use letters, digits, and underscores only.");

        using var connection = await DbConnectionFactory.OpenAdminAsync(settings);
        using var command = connection.CreateCommand();
        command.CommandText = settings.Provider switch
        {
            DbProvider.MySql or DbProvider.MariaDb =>
                $"CREATE DATABASE IF NOT EXISTS `{settings.Database}`",
            DbProvider.PostgreSql =>
                $"SELECT 1 FROM pg_database WHERE datname = '{settings.Database}'",
            DbProvider.SqlServer =>
                $"IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'{settings.Database}') CREATE DATABASE [{settings.Database}]",
            _ => throw new NotSupportedException($"Unsupported provider: {settings.Provider}")
        };

        if (settings.Provider == DbProvider.PostgreSql)
        {
            var exists = await command.ExecuteScalarAsync() is not null;
            if (!exists)
            {
                using var createCommand = connection.CreateCommand();
                createCommand.CommandText = $"CREATE DATABASE \"{settings.Database}\"";
                await createCommand.ExecuteNonQueryAsync();
            }
            return;
        }

        await command.ExecuteNonQueryAsync();
    }

    public static async Task EnsureSchemaAsync(DbConnection connection, DbProvider provider)
    {
        foreach (var statement in BuildStatements(provider))
        {
            using var command = connection.CreateCommand();
            command.CommandText = statement;
            await command.ExecuteNonQueryAsync();
        }

        // Tables created against an older schema may still have these columns as a
        // narrow VARCHAR(N) (their original definition below). Free-text fields like
        // composed hierarchical categories, long titles, or build/source labels can
        // exceed that and fail to save, so widen them to the unbounded text type.
        // Failures are ignored: the column may already be the wide type, or the
        // provider may not need this.
        foreach (var (table, column) in WidenedFreeTextColumns)
        {
            var statement = WidenColumnStatement(provider, table, column);
            if (statement is null)
                continue;

            try
            {
                using var command = connection.CreateCommand();
                command.CommandText = statement;
                await command.ExecuteNonQueryAsync();
            }
            catch
            {
            }
        }
    }

    private static readonly (string Table, string Column)[] WidenedFreeTextColumns =
    [
        ("Requirements", "Category"),
        ("Requirements", "Title"),
        ("Requirements", "Source"),
        ("TestCases", "Title"),
        ("TestRuns", "ExecutedBy"),
        ("TestRuns", "BuildOrVersion"),
    ];

    private static string? WidenColumnStatement(DbProvider provider, string table, string column) => provider switch
    {
        DbProvider.MySql or DbProvider.MariaDb => $"ALTER TABLE {table} MODIFY {column} {TextType(provider)} NOT NULL",
        DbProvider.SqlServer => $"ALTER TABLE {table} ALTER COLUMN {column} {TextType(provider)} NOT NULL",
        DbProvider.PostgreSql => $"ALTER TABLE {table} ALTER COLUMN {column} TYPE {TextType(provider)}",
        DbProvider.Sqlite => null,
        _ => null
    };

    private static IEnumerable<string> BuildStatements(DbProvider provider)
    {
        var guid = GuidType(provider);
        var text = TextType(provider);
        var dateTime = DateTimeType(provider);

        yield return CreateTable(provider, "Requirements", $@"
    Id {guid} NOT NULL PRIMARY KEY,
    Code VARCHAR(64) NOT NULL,
    Title {text} NOT NULL,
    Description {text} NOT NULL,
    Category {text} NOT NULL,
    Priority INT NOT NULL,
    Status INT NOT NULL,
    Source {text} NOT NULL,
    ParentId {guid} NULL,
    CreatedUtc {dateTime} NOT NULL,
    ModifiedUtc {dateTime} NOT NULL");

        yield return CreateTable(provider, "TestCases", $@"
    Id {guid} NOT NULL PRIMARY KEY,
    RequirementId {guid} NOT NULL,
    Code VARCHAR(64) NOT NULL,
    Title {text} NOT NULL,
    Preconditions {text} NOT NULL,
    ExpectedResult {text} NOT NULL");

        yield return CreateTable(provider, "TestSteps", $@"
    TestCaseId {guid} NOT NULL,
    StepOrder INT NOT NULL,
    Action {text} NOT NULL,
    ExpectedOutcome {text} NOT NULL");

        yield return CreateTable(provider, "TestRuns", $@"
    Id {guid} NOT NULL PRIMARY KEY,
    TestCaseId {guid} NOT NULL,
    Status INT NOT NULL,
    ExecutedUtc {dateTime} NOT NULL,
    ExecutedBy {text} NOT NULL,
    Notes {text} NOT NULL,
    BuildOrVersion {text} NOT NULL");
    }

    private static string CreateTable(DbProvider provider, string tableName, string columns)
    {
        if (provider == DbProvider.SqlServer)
        {
            return $@"
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '{tableName}')
CREATE TABLE {tableName} ({columns}
)".Trim();
        }

        return $@"CREATE TABLE IF NOT EXISTS {tableName} ({columns}
)".Trim();
    }

    private static string GuidType(DbProvider provider) => provider switch
    {
        DbProvider.PostgreSql => "UUID",
        _ => "VARCHAR(36)"
    };

    private static string TextType(DbProvider provider) => provider switch
    {
        DbProvider.SqlServer => "NVARCHAR(MAX)",
        _ => "TEXT"
    };

    private static string DateTimeType(DbProvider provider) => provider switch
    {
        DbProvider.SqlServer => "DATETIME2",
        DbProvider.PostgreSql => "TIMESTAMP",
        _ => "DATETIME"
    };
}
