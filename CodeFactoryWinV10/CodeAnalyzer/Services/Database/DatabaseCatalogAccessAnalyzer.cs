using System.Text.RegularExpressions;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Database;

/// <summary>DB 인스턴스(카탈로그·연결·SQLite 파일) 수준 접근 분석.</summary>
internal static class DatabaseCatalogAccessAnalyzer
{
    private static readonly Regex SqliteOpenPathRegex = new(
        @"(?:R""(?:\w*)\((.*?)\)\w*""|'([^']+\.(?:db|sqlite|sqlite3))'|""([^""]+\.(?:db|sqlite|sqlite3))"")",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    public static (IReadOnlyList<DatabaseCatalog> Catalogs, IReadOnlyList<DatabaseCatalogAccess> Accesses) Analyze(
        IReadOnlyList<FunctionMetric> functions,
        CallGraphResult callGraph,
        CancellationToken cancellationToken = default)
    {
        var catalogs = new Dictionary<string, DatabaseCatalog>(StringComparer.OrdinalIgnoreCase);
        var accesses = new List<DatabaseCatalogAccess>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fileCache = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        foreach (var function in functions)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (!DatabaseAccessScanExclusions.ShouldScanFile(function.FilePath))
            {
                continue;
            }

            var endLine = function.EndLine > function.StartLine
                ? function.EndLine
                : function.StartLine + 2000;
            ScanRange(function, function.FilePath, function.StartLine, endLine, callGraph, catalogs, accesses, seen, fileCache, useFunctionId: true);
        }

        return (catalogs.Values.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ToList(), accesses);
    }

    private static void ScanRange(
        FunctionMetric function,
        string filePath,
        int startLine,
        int endLine,
        CallGraphResult callGraph,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen,
        Dictionary<string, string[]> fileCache,
        bool useFunctionId)
    {
        if (!DatabaseTableAccessAnalyzer.TryReadLinesForScan(filePath, fileCache, out var lines))
        {
            return;
        }

        var start = Math.Max(1, startLine);
        var end = Math.Min(lines.Length, Math.Max(endLine, startLine));
        if (start > end)
        {
            return;
        }

        var body = string.Join('\n', lines.AsSpan(start - 1, end - start + 1).ToArray());
        if (body.Length > AnalysisScaleLimits.MaxDbAccessFunctionBodyChars)
        {
            body = body[..AnalysisScaleLimits.MaxDbAccessFunctionBodyChars];
        }

        if (!DbAccessBodyPrefilter.MayContainCatalogAccess(body, function.LanguageId))
        {
            return;
        }

        var functionId = useFunctionId
            ? DatabaseTableAccessAnalyzer.ResolveFunctionIdForScan(function, callGraph)
            : function.Id;

        var cppStrict = IsCppLanguage(function.LanguageId);
        foreach (var searchBody in EnumerateSearchBodies(body, cppStrict))
        {
            RecordSqlCatalogMatches(searchBody, function, functionId, filePath, start, catalogs, accesses, seen);
            RecordConnectionStringMatches(searchBody, function, functionId, filePath, start, catalogs, accesses, seen, cppStrict);
        }

        RecordApiConnectionMatches(body, function, functionId, filePath, start, catalogs, accesses, seen, function.LanguageId);
    }

    private static bool IsCppLanguage(string languageId) =>
        languageId.Equals("cpp", StringComparison.OrdinalIgnoreCase);

    private static IEnumerable<string> EnumerateSearchBodies(string body, bool cppStrict)
    {
        if (!cppStrict)
        {
            yield return body;
        }

        foreach (var literal in SqlPatternHelper.ExtractSqlLiteralBodies(body))
        {
            yield return literal;
        }
    }

    private static void RecordSqlCatalogMatches(
        string sql,
        FunctionMetric function,
        string functionId,
        string filePath,
        int lineOffset,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen)
    {
        foreach (Match match in SqlPatternHelper.SqlCreateDatabaseRegex.Matches(sql))
        {
            RecordCatalogAccess(
                match.Groups[1].Value,
                DatabaseDialect.Unknown,
                "sql-create",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Admin,
                DatabaseCatalogAccessPattern.Sql,
                DatabaseCrudOperation.Create,
                catalogs, accesses, seen);
        }

        foreach (Match match in SqlPatternHelper.SqlDropDatabaseRegex.Matches(sql))
        {
            RecordCatalogAccess(
                match.Groups[1].Value,
                DatabaseDialect.Unknown,
                "sql-drop",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Admin,
                DatabaseCatalogAccessPattern.Sql,
                DatabaseCrudOperation.Delete,
                catalogs, accesses, seen);
        }

        foreach (Match match in SqlPatternHelper.SqlUseDatabaseRegex.Matches(sql))
        {
            RecordCatalogAccess(
                match.Groups[1].Value,
                DatabaseDialect.Unknown,
                "sql-use",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Select,
                DatabaseCatalogAccessPattern.Sql,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen);
        }

        foreach (Match match in SqlPatternHelper.SqlAttachDatabaseRegex.Matches(sql))
        {
            var path = match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
            var alias = match.Groups[3].Value;
            var name = string.IsNullOrWhiteSpace(alias) ? Path.GetFileName(path) : alias;
            RecordCatalogAccess(
                name,
                DatabaseDialect.Sqlite,
                "sql-attach",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.Sql,
                DatabaseCrudOperation.Create,
                catalogs, accesses, seen,
                catalogFilePath: path);
        }
    }

    private static void RecordConnectionStringMatches(
        string text,
        FunctionMetric function,
        string functionId,
        string filePath,
        int lineOffset,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen,
        bool cppStrict = false)
    {
        if (cppStrict && !LooksLikeConnectionCatalogText(text))
        {
            return;
        }

        foreach (Match match in SqlPatternHelper.ConnectionStringCatalogRegex.Matches(text))
        {
            RecordCatalogAccess(
                match.Groups[1].Value.Trim(),
                DatabaseDialect.Unknown,
                "connection-string",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.ConnectionString,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen);
        }

        foreach (Match match in SqlPatternHelper.SqliteDataSourceRegex.Matches(text))
        {
            var path = match.Groups[1].Value.Trim();
            RecordCatalogAccess(
                Path.GetFileName(path),
                DatabaseDialect.Sqlite,
                "sqlite-file",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.ConnectionString,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen,
                catalogFilePath: path);
        }

        foreach (Match match in MicrosoftRelationalDbPatterns.JdbcSqlServerRegex.Matches(text))
        {
            RecordCatalogAccess(
                match.Value,
                DatabaseDialect.SqlServer,
                "sqlserver-jdbc",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.ConnectionString,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen);
        }

        foreach (Match match in MicrosoftRelationalDbPatterns.LocalDbConnectionRegex.Matches(text))
        {
            RecordCatalogAccess(
                match.Value.Trim(),
                DatabaseDialect.SqlServer,
                "localdb",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.ConnectionString,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen);
        }

        foreach (Match match in MicrosoftRelationalDbPatterns.AzureSqlConnectionRegex.Matches(text))
        {
            RecordCatalogAccess(
                match.Value.Trim(),
                DatabaseDialect.SqlServer,
                "azure-sql",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.ConnectionString,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen);
        }

        foreach (Match match in OpenSourceRelationalDbPatterns.PostgresUriRegex.Matches(text))
        {
            RecordCatalogAccess(
                match.Value,
                DatabaseDialect.PostgreSql,
                "postgres-uri",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.ConnectionString,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen);
        }

        foreach (Match match in OpenSourceRelationalDbPatterns.MySqlMariaDbUriRegex.Matches(text))
        {
            var dialect = match.Value.Contains("mariadb", StringComparison.OrdinalIgnoreCase)
                ? DatabaseDialect.MariaDb
                : DatabaseDialect.MySql;
            RecordCatalogAccess(
                match.Value,
                dialect,
                "mysql-uri",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.ConnectionString,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen);
        }

        foreach (var hint in UniversalDatabasePatterns.ExtractConnectionCatalogHints(text))
        {
            if (hint.StartsWith("jdbc:", StringComparison.OrdinalIgnoreCase))
            {
                var dialect = hint.Contains("postgresql", StringComparison.OrdinalIgnoreCase)
                    ? DatabaseDialect.PostgreSql
                    : hint.Contains("sqlserver", StringComparison.OrdinalIgnoreCase)
                        ? DatabaseDialect.SqlServer
                        : hint.Contains("mysql", StringComparison.OrdinalIgnoreCase) || hint.Contains("mariadb", StringComparison.OrdinalIgnoreCase)
                            ? hint.Contains("mariadb", StringComparison.OrdinalIgnoreCase) ? DatabaseDialect.MariaDb : DatabaseDialect.MySql
                            : DatabaseDialect.Unknown;
                RecordCatalogAccess(
                    hint,
                    dialect,
                    "jdbc-url",
                    function, functionId, filePath, lineOffset,
                    DatabaseCatalogAccessKind.Connect,
                    DatabaseCatalogAccessPattern.ConnectionString,
                    DatabaseCrudOperation.Read,
                    catalogs, accesses, seen);
            }
            else if (hint.Equals("mongodb", StringComparison.OrdinalIgnoreCase))
            {
                RecordCatalogAccess(
                    hint,
                    DatabaseDialect.Unknown,
                    "mongodb-uri",
                    function, functionId, filePath, lineOffset,
                    DatabaseCatalogAccessKind.Connect,
                    DatabaseCatalogAccessPattern.ConnectionString,
                    DatabaseCrudOperation.Read,
                    catalogs, accesses, seen);
            }
        }
    }

    private static void RecordApiConnectionMatches(
        string body,
        FunctionMetric function,
        string functionId,
        string filePath,
        int lineOffset,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen,
        string languageId)
    {
        if (IsCppLanguage(languageId))
        {
            foreach (var pattern in UniversalDatabasePatterns.CppConnectionApiPatterns)
            {
                foreach (Match match in pattern.Matches(body))
                {
                    RecordCppApiConnectionAccess(body, match.Index, function, functionId, filePath, lineOffset, catalogs, accesses, seen);
                }
            }

            return;
        }

        foreach (var pattern in MicrosoftRelationalDbPatterns.ConnectionApiPatterns)
        {
            foreach (Match match in pattern.Matches(body))
            {
                RecordMicrosoftConnectionAccess(body, match.Index, function, functionId, filePath, lineOffset, catalogs, accesses, seen);
            }
        }

        foreach (var pattern in OpenSourceRelationalDbPatterns.ConnectionApiPatterns)
        {
            foreach (Match match in pattern.Matches(body))
            {
                RecordOpenSourceConnectionAccess(body, match.Index, function, functionId, filePath, lineOffset, catalogs, accesses, seen);
            }
        }

        foreach (var pattern in UniversalDatabasePatterns.ConnectionApiPatterns)
        {
            foreach (Match match in pattern.Matches(body))
            {
                var rawPath = TryExtractSqlitePath(body, match.Index);
                var catalogName = rawPath is null
                    ? "(연결)"
                    : Path.GetFileName(rawPath.Trim().Trim('\"', '\''));
                var dialect = rawPath is not null
                    && (rawPath.Contains(".db", StringComparison.OrdinalIgnoreCase)
                        || rawPath.Contains(".sqlite", StringComparison.OrdinalIgnoreCase))
                    ? DatabaseDialect.Sqlite
                    : DatabaseDialect.Unknown;

                RecordCatalogAccess(
                    string.IsNullOrWhiteSpace(catalogName) ? "(연결)" : catalogName,
                    dialect,
                    "api",
                    function, functionId, filePath, lineOffset,
                    DatabaseCatalogAccessKind.Connect,
                    DatabaseCatalogAccessPattern.Api,
                    DatabaseCrudOperation.Read,
                    catalogs, accesses, seen,
                    catalogFilePath: dialect == DatabaseDialect.Sqlite ? rawPath : null);
            }
        }
    }

    private static void RecordCppApiConnectionAccess(
        string body,
        int apiIndex,
        FunctionMetric function,
        string functionId,
        string filePath,
        int lineOffset,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen)
    {
        var window = body[apiIndex..Math.Min(body.Length, apiIndex + 512)];

        if (TryExtractSqlitePath(body, apiIndex) is { } sqlitePath && IsLikelySqlitePath(sqlitePath))
        {
            RecordCatalogAccess(
                Path.GetFileName(sqlitePath.Trim().Trim('\"', '\'')),
                DatabaseDialect.Sqlite,
                "api",
                function, functionId, filePath, lineOffset,
                DatabaseCatalogAccessKind.Connect,
                DatabaseCatalogAccessPattern.Api,
                DatabaseCrudOperation.Read,
                catalogs, accesses, seen,
                catalogFilePath: sqlitePath.Trim().Trim('\"', '\''));
            return;
        }

        var catalogName = ExtractCatalogNameFromWindow(window);
        if (string.IsNullOrWhiteSpace(catalogName))
        {
            return;
        }

        DatabaseDialect dialect;
        string sourceKind;
        if (OpenSourceRelationalDbPatterns.PostgresUriRegex.IsMatch(window)
            || OpenSourceRelationalDbPatterns.JdbcPostgresRegex.IsMatch(window)
            || window.Contains("PQconnect", StringComparison.OrdinalIgnoreCase)
            || window.Contains("PQsetdb", StringComparison.OrdinalIgnoreCase))
        {
            dialect = DatabaseDialect.PostgreSql;
            sourceKind = "postgres-api";
        }
        else if (OpenSourceRelationalDbPatterns.MySqlMariaDbUriRegex.IsMatch(window)
            || OpenSourceRelationalDbPatterns.JdbcMySqlMariaDbRegex.IsMatch(window)
            || window.Contains("mariadb_", StringComparison.OrdinalIgnoreCase))
        {
            dialect = DatabaseDialect.MariaDb;
            sourceKind = "mariadb-api";
        }
        else if (window.Contains("mysql_", StringComparison.OrdinalIgnoreCase))
        {
            dialect = DatabaseDialect.MySql;
            sourceKind = "mysql-api";
        }
        else if (window.Contains("SQLConnect", StringComparison.OrdinalIgnoreCase)
            || window.Contains("SQLDriverConnect", StringComparison.OrdinalIgnoreCase))
        {
            dialect = DatabaseDialect.Unknown;
            sourceKind = "odbc-api";
        }
        else
        {
            return;
        }

        RecordCatalogAccess(
            catalogName,
            dialect,
            sourceKind,
            function, functionId, filePath, lineOffset,
            DatabaseCatalogAccessKind.Connect,
            DatabaseCatalogAccessPattern.Api,
            DatabaseCrudOperation.Read,
            catalogs, accesses, seen);
    }

    private static bool LooksLikeConnectionCatalogText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        if (OpenSourceRelationalDbPatterns.PostgresUriRegex.IsMatch(text)
            || OpenSourceRelationalDbPatterns.MySqlMariaDbUriRegex.IsMatch(text)
            || MicrosoftRelationalDbPatterns.JdbcSqlServerRegex.IsMatch(text)
            || MicrosoftRelationalDbPatterns.LocalDbConnectionRegex.IsMatch(text)
            || MicrosoftRelationalDbPatterns.AzureSqlConnectionRegex.IsMatch(text)
            || SqlPatternHelper.SqliteDataSourceRegex.IsMatch(text))
        {
            return true;
        }

        if (!SqlPatternHelper.ConnectionStringCatalogRegex.IsMatch(text))
        {
            return false;
        }

        return text.Contains(';', StringComparison.Ordinal)
            || text.Contains("://", StringComparison.Ordinal);
    }

    private static bool IsLikelySqlitePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        path = path.Trim().Trim('\"', '\'');
        if (path.Equals(":memory:", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return path.EndsWith(".db", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(".sqlite", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(".sqlite3", StringComparison.OrdinalIgnoreCase);
    }

    private static void RecordMicrosoftConnectionAccess(
        string body,
        int apiIndex,
        FunctionMetric function,
        string functionId,
        string filePath,
        int lineOffset,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen)
    {
        var window = body[apiIndex..Math.Min(body.Length, apiIndex + 512)];
        if (!MicrosoftRelationalDbPatterns.HasSignal(window))
        {
            return;
        }

        var catalogName = ExtractCatalogNameFromWindow(window)
            ?? (MicrosoftRelationalDbPatterns.AzureSqlConnectionRegex.IsMatch(window) ? "azure-sql"
                : MicrosoftRelationalDbPatterns.LocalDbConnectionRegex.IsMatch(window) ? "localdb"
                : MicrosoftRelationalDbPatterns.OleDbProviderRegex.IsMatch(window) ? "access-oledb"
                : "sqlserver");

        RecordCatalogAccess(
            catalogName,
            DatabaseDialect.SqlServer,
            "microsoft-db-api",
            function, functionId, filePath, lineOffset,
            DatabaseCatalogAccessKind.Connect,
            DatabaseCatalogAccessPattern.Api,
            DatabaseCrudOperation.Read,
            catalogs, accesses, seen);
    }

    private static void RecordOpenSourceConnectionAccess(
        string body,
        int apiIndex,
        FunctionMetric function,
        string functionId,
        string filePath,
        int lineOffset,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen)
    {
        var window = body[apiIndex..Math.Min(body.Length, apiIndex + 512)];
        DatabaseDialect dialect;
        string catalogName;
        string sourceKind;

        if (OpenSourceRelationalDbPatterns.PostgresUriRegex.IsMatch(window)
            || OpenSourceRelationalDbPatterns.JdbcPostgresRegex.IsMatch(window)
            || window.Contains("Npgsql", StringComparison.OrdinalIgnoreCase)
            || window.Contains("psycopg", StringComparison.OrdinalIgnoreCase)
            || window.Contains("PQconnect", StringComparison.OrdinalIgnoreCase)
            || window.Contains("pg_connect", StringComparison.OrdinalIgnoreCase))
        {
            dialect = DatabaseDialect.PostgreSql;
            catalogName = ExtractCatalogNameFromWindow(window) ?? "postgresql";
            sourceKind = "postgres-api";
        }
        else if (OpenSourceRelationalDbPatterns.MySqlMariaDbUriRegex.IsMatch(window)
            || OpenSourceRelationalDbPatterns.JdbcMySqlMariaDbRegex.IsMatch(window)
            || window.Contains("MySql", StringComparison.OrdinalIgnoreCase)
            || window.Contains("MariaDb", StringComparison.OrdinalIgnoreCase)
            || window.Contains("mysqli", StringComparison.OrdinalIgnoreCase)
            || window.Contains("mysql", StringComparison.OrdinalIgnoreCase)
            || window.Contains("pymysql", StringComparison.OrdinalIgnoreCase))
        {
            dialect = window.Contains("mariadb", StringComparison.OrdinalIgnoreCase)
                || window.Contains("MariaDb", StringComparison.OrdinalIgnoreCase)
                ? DatabaseDialect.MariaDb
                : DatabaseDialect.MySql;
            catalogName = ExtractCatalogNameFromWindow(window) ?? (dialect == DatabaseDialect.MariaDb ? "mariadb" : "mysql");
            sourceKind = dialect == DatabaseDialect.MariaDb ? "mariadb-api" : "mysql-api";
        }
        else
        {
            return;
        }

        RecordCatalogAccess(
            catalogName,
            dialect,
            sourceKind,
            function, functionId, filePath, lineOffset,
            DatabaseCatalogAccessKind.Connect,
            DatabaseCatalogAccessPattern.Api,
            DatabaseCrudOperation.Read,
            catalogs, accesses, seen);
    }

    private static string? ExtractCatalogNameFromWindow(string window)
    {
        foreach (Match match in SqlPatternHelper.ConnectionStringCatalogRegex.Matches(window))
        {
            return match.Groups[1].Value.Trim();
        }

        foreach (Match match in OpenSourceRelationalDbPatterns.PostgresUriRegex.Matches(window))
        {
            return match.Value;
        }

        foreach (Match match in OpenSourceRelationalDbPatterns.MySqlMariaDbUriRegex.Matches(window))
        {
            return match.Value;
        }

        foreach (Match match in OpenSourceRelationalDbPatterns.JdbcPostgresRegex.Matches(window))
        {
            return match.Value;
        }

        foreach (Match match in OpenSourceRelationalDbPatterns.JdbcMySqlMariaDbRegex.Matches(window))
        {
            return match.Value;
        }

        foreach (Match match in MicrosoftRelationalDbPatterns.JdbcSqlServerRegex.Matches(window))
        {
            return match.Value;
        }

        foreach (Match match in MicrosoftRelationalDbPatterns.LocalDbConnectionRegex.Matches(window))
        {
            return match.Value;
        }

        foreach (Match match in MicrosoftRelationalDbPatterns.AzureSqlConnectionRegex.Matches(window))
        {
            return match.Value;
        }

        return null;
    }

    private static string? TryExtractSqlitePath(string body, int apiIndex)
    {
        var window = body[apiIndex..Math.Min(body.Length, apiIndex + 400)];
        var match = SqliteOpenPathRegex.Match(window);
        if (!match.Success)
        {
            return null;
        }

        return match.Groups[1].Success ? match.Groups[1].Value
            : match.Groups[2].Success ? match.Groups[2].Value
            : match.Groups[3].Value;
    }

    private static void RecordCatalogAccess(
        string catalogName,
        DatabaseDialect dialect,
        string sourceKind,
        FunctionMetric function,
        string functionId,
        string filePath,
        int lineOffset,
        DatabaseCatalogAccessKind kind,
        DatabaseCatalogAccessPattern pattern,
        DatabaseCrudOperation operations,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen,
        string? catalogFilePath = null)
    {
        if (string.IsNullOrWhiteSpace(catalogName) || catalogName.Length < 2)
        {
            return;
        }

        catalogName = catalogName.Trim().Trim('[', ']', '"', '\'');
        if (catalogName.Equals("(연결)", StringComparison.OrdinalIgnoreCase)
            || catalogName.Equals("sqlserver", StringComparison.OrdinalIgnoreCase)
            || catalogName.Equals("postgresql", StringComparison.OrdinalIgnoreCase)
            || catalogName.Equals("mysql", StringComparison.OrdinalIgnoreCase)
            || catalogName.Equals("mariadb", StringComparison.OrdinalIgnoreCase)
            || catalogName.Equals("localdb", StringComparison.OrdinalIgnoreCase)
            || catalogName.Equals("azure-sql", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var catalogId = BuildCatalogId(catalogName, dialect);
        if (!catalogs.ContainsKey(catalogId))
        {
            catalogs[catalogId] = new DatabaseCatalog
            {
                Id = catalogId,
                Name = catalogName,
                Dialect = dialect,
                SourceKind = sourceKind,
                FilePath = catalogFilePath ?? string.Empty,
                LineNumber = function.StartLine > 0 ? function.StartLine : lineOffset
            };
        }

        var key = catalogId + "\0" + functionId + "\0" + (int)kind + "\0" + (int)operations;
        if (!seen.Add(key))
        {
            return;
        }

        accesses.Add(new DatabaseCatalogAccess
        {
            CatalogId = catalogId,
            FunctionId = functionId,
            FunctionDisplayName = function.DisplayName,
            FunctionFullName = function.FullName,
            FunctionFilePath = function.FilePath,
            FunctionLineNumber = function.StartLine > 0 ? function.StartLine : lineOffset,
            Kind = kind,
            Pattern = pattern,
            Operations = operations
        });
    }

    private static string BuildCatalogId(string name, DatabaseDialect dialect) =>
        dialect == DatabaseDialect.Sqlite
            ? $"catalog:sqlite:{name.ToLowerInvariant()}"
            : $"catalog:{name.ToLowerInvariant()}";
}
