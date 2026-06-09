using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

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
        IReadOnlyList<string>? sourceFiles)
    {
        var catalogs = new Dictionary<string, DatabaseCatalog>(StringComparer.OrdinalIgnoreCase);
        var accesses = new List<DatabaseCatalogAccess>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fileCache = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        foreach (var function in functions)
        {
            var endLine = function.EndLine > function.StartLine
                ? function.EndLine
                : function.StartLine + 2000;
            ScanRange(function, function.FilePath, function.StartLine, endLine, callGraph, catalogs, accesses, seen, fileCache, useFunctionId: true);
        }

        if (sourceFiles is not null)
        {
            foreach (var filePath in sourceFiles)
            {
                if (!DatabaseTableAccessAnalyzer.TryReadLinesForScan(filePath, fileCache, out var lines) || lines.Length == 0)
                {
                    continue;
                }

                var pseudo = new FunctionMetric
                {
                    Id = $"file:{filePath}:1",
                    DisplayName = "(파일)",
                    FullName = $"{Path.GetFileName(filePath)}:1",
                    FilePath = filePath,
                    StartLine = 1,
                    EndLine = lines.Length,
                    LanguageId = LanguageRegistry.FindByExtension(Path.GetExtension(filePath))?.Id ?? string.Empty
                };

                ScanRange(pseudo, filePath, 1, lines.Length, callGraph, catalogs, accesses, seen, fileCache, useFunctionId: false);
            }
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
        var functionId = useFunctionId
            ? DatabaseTableAccessAnalyzer.ResolveFunctionIdForScan(function, callGraph)
            : function.Id;

        foreach (var searchBody in EnumerateSearchBodies(body))
        {
            RecordSqlCatalogMatches(searchBody, function, functionId, filePath, start, catalogs, accesses, seen);
            RecordConnectionStringMatches(searchBody, function, functionId, filePath, start, catalogs, accesses, seen);
        }

        RecordApiConnectionMatches(body, function, functionId, filePath, start, catalogs, accesses, seen);
    }

    private static IEnumerable<string> EnumerateSearchBodies(string body)
    {
        yield return body;
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
        HashSet<string> seen)
    {
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
    }

    private static void RecordApiConnectionMatches(
        string body,
        FunctionMetric function,
        string functionId,
        string filePath,
        int lineOffset,
        Dictionary<string, DatabaseCatalog> catalogs,
        List<DatabaseCatalogAccess> accesses,
        HashSet<string> seen)
    {
        foreach (var pattern in SqlPatternHelper.ConnectionApiPatterns)
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
