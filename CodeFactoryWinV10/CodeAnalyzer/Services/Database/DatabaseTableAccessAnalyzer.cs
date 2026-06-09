using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Database;

public static class DatabaseTableAccessAnalyzer
{
    private static readonly Regex EfSetGenericRegex = new(
        @"\.Set\s*<\s*(\w+)\s*>",
        RegexOptions.Compiled);

    // group 1 = 메서드명(Add/Update/Remove/Entry 등), group 2 = 엔티티 타입명
    private static readonly Regex EfGenericCrudRegex = new(
        @"\.(Add|AddAsync|AddRange|AddRangeAsync|Update|UpdateRange|Remove|RemoveRange|Attach|Entry)\s*<\s*(\w+)\s*>",
        RegexOptions.Compiled);

    private static readonly Regex EfDbSetPropertyRegex = new(
        @"(?<![\w$@#])(?:[\w$@#]*(?:Context|DbContext)\s*\.\s*(\w+)(?![\w$]))",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // group 1 = DbSet 속성명, group 2 = 호출된 CRUD/조회 메서드명
    private static readonly Regex EfDbSetMemberRegex = new(
        @"\.(\w+)\s*\.\s*(Add|AddAsync|AddRange|AddRangeAsync|Remove|RemoveRange|Update|UpdateRange|Attach|Find|FindAsync|Where|FirstOrDefault|FirstOrDefaultAsync|First|FirstAsync|SingleOrDefault|SingleOrDefaultAsync|Single|SingleAsync|Any|AnyAsync|Count|CountAsync|ToList|ToListAsync|Include|ExecuteDelete|ExecuteDeleteAsync|ExecuteUpdate|ExecuteUpdateAsync)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex EfEntryRegex = new(
        @"\.Entry\s*<\s*(\w+)\s*>|\.Entry\s*\(",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex CSharpMethodHeaderRegex = new(
        @"(?m)^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|async|partial|unsafe|new|sealed|override|virtual|abstract|extern|readonly|required)\s+)*[\w<>\[\]?,\s]+\s+(\w+)\s*\(",
        RegexOptions.Compiled);

    private const int MethodScanLineWindow = 2000;

    // SQL에서 테이블명으로 오해될 수 있는 예약어 목록 (자동 발견 시 제외)
    private static readonly HashSet<string> SqlKeywords = new(StringComparer.OrdinalIgnoreCase)
    {
        "SET", "WHERE", "CASE", "WHEN", "THEN", "ELSE", "END", "IS", "NULL", "TRUE", "FALSE",
        "AND", "OR", "NOT", "BETWEEN", "LIKE", "IN", "EXISTS", "ANY", "ALL", "SOME",
        "HAVING", "ORDER", "GROUP", "LIMIT", "OFFSET", "UNION", "EXCEPT", "INTERSECT",
        "DISTINCT", "AS", "ON", "BY", "ASC", "DESC", "VALUES", "RETURNING",
        "SELECT", "FROM", "WHERE", "JOIN", "INNER", "OUTER", "LEFT", "RIGHT", "FULL", "CROSS",
        "TABLE", "INDEX", "KEY", "PRIMARY", "FOREIGN", "CONSTRAINT", "UNIQUE", "DEFAULT",
        "IDENTITY", "AUTO_INCREMENT", "SCHEMA", "DATABASE", "VIEW", "PROCEDURE",
        "FUNCTION", "TRIGGER", "SEQUENCE", "TEMPORARY", "TEMP", "IF", "ROW", "ROWS",
        "COLUMN", "COLUMNS", "ROLE", "USER", "GRANT", "REVOKE", "COMMIT", "ROLLBACK",
        "TRANSACTION", "SAVEPOINT", "TOP", "FIRST", "SKIP", "FETCH", "NEXT", "ONLY",
        "WITH", "RECURSIVE", "NOLOCK", "READPAST", "UPDLOCK", "ROWLOCK", "TABLOCK",
        "INTO", "MERGE", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "TRUNCATE",
    };

    public static DatabaseSchemaResult EnrichWithAccesses(
        DatabaseSchemaResult schema,
        IReadOnlyList<FunctionMetric> functions,
        CallGraphResult callGraph,
        IReadOnlyList<string>? sourceFiles = null)
    {
        // 사전 정의 스키마가 없어도 진행 — SQL 자동 발견으로 테이블을 찾아낼 수 있음
        var index = BuildReferenceIndex(schema.Tables);

        var accesses = new List<DatabaseTableAccess>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var entryAccesses = new List<DatabaseEntryAccess>();
        var entrySeen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fileCache = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        foreach (var function in functions)
        {
            var effectiveEndLine = function.EndLine > function.StartLine
                ? function.EndLine
                : function.StartLine + MethodScanLineWindow;
            ScanFunctionBody(function, function.FilePath, function.StartLine, effectiveEndLine, index, callGraph, accesses, seen, entryAccesses, entrySeen, fileCache, useFunctionId: true);
        }

        AppendCallGraphOnlyAccessors(callGraph, index, accesses, seen, entryAccesses, entrySeen, fileCache);
        AppendSourceFileScan(sourceFiles, index, accesses, seen, entryAccesses, entrySeen, fileCache);
        AppendFileLevelSqlLiteralScan(sourceFiles, index, callGraph, accesses, seen, entryAccesses, entrySeen, fileCache);

        accesses = DeduplicateAccesses(accesses);
        entryAccesses = DeduplicateEntryAccesses(entryAccesses);

        var (catalogs, catalogAccesses) = DatabaseCatalogAccessAnalyzer.Analyze(functions, callGraph, sourceFiles);

        var groupedEntries = entryAccesses
            .GroupBy(entry => entry.TableId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<DatabaseEntryAccess>)group
                    .OrderBy(entry => entry.FunctionFilePath, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(entry => entry.FunctionLineNumber)
                    .ThenBy(entry => entry.Operation)
                    .ToList(),
                StringComparer.OrdinalIgnoreCase);

        var grouped = accesses
            .GroupBy(access => access.TableId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<DatabaseTableAccess>)group
                    .OrderBy(access => access.FunctionFilePath, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(access => access.FunctionLineNumber)
                    .ThenBy(access => access.FunctionDisplayName, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                StringComparer.OrdinalIgnoreCase);

        IReadOnlyList<DatabaseTable> allTables = index.AutoDiscoveredTables.Count > 0
            ? [.. schema.Tables, .. index.AutoDiscoveredTables]
            : schema.Tables;

        var tableMap = allTables
            .GroupBy(t => t.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var columnAccesses = AppendColumnAccesses(
            sourceFiles,
            allTables,
            accesses,
            callGraph,
            fileCache);

        var groupedColumns = columnAccesses
            .GroupBy(ca => ca.TableId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<DatabaseColumnAccess>)g
                    .OrderBy(ca => ca.ColumnName, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(ca => ca.FunctionDisplayName, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                StringComparer.OrdinalIgnoreCase);

        var groupedCatalogAccesses = catalogAccesses
            .GroupBy(access => access.CatalogId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<DatabaseCatalogAccess>)group
                    .OrderBy(access => access.FunctionFilePath, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(access => access.FunctionLineNumber)
                    .ToList(),
                StringComparer.OrdinalIgnoreCase);

        return new DatabaseSchemaResult
        {
            Catalogs = catalogs,
            CatalogMap = catalogs.ToDictionary(c => c.Id, StringComparer.OrdinalIgnoreCase),
            CatalogAccesses = catalogAccesses,
            CatalogAccessesByCatalogId = groupedCatalogAccesses,
            Tables = allTables,
            Relations = schema.Relations,
            Accesses = accesses,
            TableMap = tableMap,
            AccessesByTableId = grouped,
            ColumnAccesses = columnAccesses,
            ColumnAccessesByTableId = groupedColumns,
            EntryAccesses = entryAccesses,
            EntryAccessesByTableId = groupedEntries
        };
    }

    internal static bool TryReadLinesForScan(
        string filePath,
        Dictionary<string, string[]> cache,
        out string[] lines) => TryReadLines(filePath, cache, out lines);

    internal static string ResolveFunctionIdForScan(FunctionMetric function, CallGraphResult callGraph) =>
        ResolveFunctionId(function, callGraph);

    private sealed class TableReferenceIndex
    {
        public Dictionary<string, string> Aliases { get; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, DatabaseTableAccessPattern> AliasPatterns { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> DbSetPropertyNames { get; } = new(StringComparer.OrdinalIgnoreCase);
        public List<TableReferenceProfile> Profiles { get; } = [];
        /// <summary>SQL 코드 스캔 중 자동으로 발견된 테이블 목록.</summary>
        public List<DatabaseTable> AutoDiscoveredTables { get; } = [];
    }

    private sealed class TableReferenceProfile
    {
        public required string TableId { get; init; }
        public required string EntityTypeName { get; init; }
        public required IReadOnlyList<string> ColumnNames { get; init; }
    }

    private static TableReferenceIndex BuildReferenceIndex(IReadOnlyList<DatabaseTable> tables)
    {
        var index = new TableReferenceIndex();

        foreach (var table in tables)
        {
            RegisterAlias(index, table.Name, table.Id, DatabaseTableAccessPattern.Sql);

            if (!string.IsNullOrWhiteSpace(table.Schema))
            {
                RegisterAlias(index, $"{table.Schema}.{table.Name}", table.Id, DatabaseTableAccessPattern.Sql);
            }

            if (!string.IsNullOrWhiteSpace(table.EntityTypeName))
            {
                RegisterAlias(index, table.EntityTypeName, table.Id, DatabaseTableAccessPattern.EntityType);
            }

            foreach (var alias in table.AccessAliases)
            {
                RegisterAlias(index, alias, table.Id, DatabaseTableAccessPattern.EntityFramework);
                index.DbSetPropertyNames.Add(alias);
            }

            index.Profiles.Add(new TableReferenceProfile
            {
                TableId = table.Id,
                EntityTypeName = table.EntityTypeName,
                ColumnNames = table.Columns.Select(column => column.Name).Where(name => name.Length >= 2).ToList()
            });
        }

        return index;
    }

    private static void RegisterAlias(
        TableReferenceIndex index,
        string alias,
        string tableId,
        DatabaseTableAccessPattern pattern)
    {
        if (string.IsNullOrWhiteSpace(alias))
        {
            return;
        }

        index.Aliases.TryAdd(alias, tableId);
        index.AliasPatterns.TryAdd(alias, pattern);
    }

    /// <summary>SQL에서 언급된 새 테이블을 자동으로 인덱스에 등록. 키워드·단자(1글자)는 무시.</summary>
    private static string AutoDiscoverSqlTable(
        TableReferenceIndex index,
        string schemaToken,
        string tableToken)
    {
        if (string.IsNullOrWhiteSpace(tableToken) || tableToken.Length < 2)
            return string.Empty;

        if (SqlKeywords.Contains(tableToken))
            return string.Empty;

        // 이미 인덱스에 있으면 그 ID를 반환
        if (index.Aliases.TryGetValue(tableToken, out var existing))
            return existing;

        var tableId = string.IsNullOrWhiteSpace(schemaToken)
            ? tableToken.ToLowerInvariant()
            : $"{schemaToken.ToLowerInvariant()}.{tableToken.ToLowerInvariant()}";

        if (index.Aliases.TryGetValue(tableId, out existing))
            return existing;

        var newTable = new DatabaseTable
        {
            Id = tableId,
            Name = tableToken,
            Schema = string.IsNullOrWhiteSpace(schemaToken) ? null : schemaToken,
            SourceKind = "sql-detected",
        };

        index.AutoDiscoveredTables.Add(newTable);
        RegisterAlias(index, tableToken, tableId, DatabaseTableAccessPattern.Sql);
        if (!string.IsNullOrWhiteSpace(schemaToken))
            RegisterAlias(index, $"{schemaToken}.{tableToken}", tableId, DatabaseTableAccessPattern.Sql);

        index.Profiles.Add(new TableReferenceProfile
        {
            TableId = tableId,
            EntityTypeName = string.Empty,
            ColumnNames = []
        });

        return tableId;
    }

    private static void ScanFunctionBody(
        FunctionMetric function,
        string filePath,
        int startLine,
        int endLine,
        TableReferenceIndex index,
        CallGraphResult callGraph,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
        List<DatabaseEntryAccess> entryAccesses,
        HashSet<string> entrySeen,
        Dictionary<string, string[]> fileCache,
        bool useFunctionId)
    {
        if (!TryReadLines(filePath, fileCache, out var lines))
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
        if (string.IsNullOrWhiteSpace(body))
        {
            return;
        }

        var matches = DetectTableReferences(body, function.LanguageId, index);
        if (matches.Count == 0)
        {
            return;
        }

        var functionId = useFunctionId
            ? ResolveFunctionId(function, callGraph)
            : function.Id;

        RecordTableMatches(function, functionId, matches, accesses, seen, entryAccesses, entrySeen);
    }

    private static void RecordTableMatches(
        FunctionMetric function,
        string functionId,
        List<(string TableId, DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern, DatabaseCrudOperation Operations)> matches,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
        List<DatabaseEntryAccess> entryAccesses,
        HashSet<string> entrySeen)
    {
        foreach (var (tableId, kind, pattern, operations) in matches)
        {
            var key = tableId + "\0" + functionId;
            if (seen.Add(key))
            {
                accesses.Add(new DatabaseTableAccess
                {
                    TableId = tableId,
                    FunctionId = functionId,
                    FunctionDisplayName = function.DisplayName,
                    FunctionFullName = function.FullName,
                    FunctionFilePath = function.FilePath,
                    FunctionLineNumber = function.StartLine,
                    Kind = kind,
                    Pattern = pattern,
                    Operations = operations
                });
            }

            foreach (var operation in SplitOperations(operations))
            {
                var entryKey = tableId + "\0" + functionId + "\0" + operation;
                if (!entrySeen.Add(entryKey))
                {
                    continue;
                }

                entryAccesses.Add(new DatabaseEntryAccess
                {
                    TableId = tableId,
                    FunctionId = functionId,
                    FunctionDisplayName = function.DisplayName,
                    FunctionFullName = function.FullName,
                    FunctionFilePath = function.FilePath,
                    FunctionLineNumber = function.StartLine,
                    Operation = operation,
                    Pattern = pattern
                });
            }
        }
    }

    private static void AppendCallGraphOnlyAccessors(
        CallGraphResult callGraph,
        TableReferenceIndex index,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
        List<DatabaseEntryAccess> entryAccesses,
        HashSet<string> entrySeen,
        Dictionary<string, string[]> fileCache)
    {
        foreach (var node in callGraph.Nodes)
        {
            var pseudoFunction = new FunctionMetric
            {
                Id = node.Id,
                DisplayName = node.DisplayName,
                FullName = node.FullName,
                FilePath = node.FilePath,
                StartLine = node.LineNumber,
                EndLine = node.LineNumber + MethodScanLineWindow,
                LanguageId = ResolveLanguageId(node.Id) ?? string.Empty
            };

            ScanFunctionBody(
                pseudoFunction,
                node.FilePath,
                node.LineNumber,
                node.LineNumber + MethodScanLineWindow,
                index,
                callGraph,
                accesses,
                seen,
                entryAccesses,
                entrySeen,
                fileCache,
                useFunctionId: false);
        }
    }

    private static void AppendSourceFileScan(
        IReadOnlyList<string>? sourceFiles,
        TableReferenceIndex index,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
        List<DatabaseEntryAccess> entryAccesses,
        HashSet<string> entrySeen,
        Dictionary<string, string[]> fileCache)
    {
        if (sourceFiles is null || sourceFiles.Count == 0)
        {
            return;
        }

        foreach (var filePath in sourceFiles)
        {
            if (!TryReadLines(filePath, fileCache, out var lines) || lines.Length == 0)
            {
                continue;
            }

            var language = LanguageRegistry.FindByExtension(Path.GetExtension(filePath));
            var languageId = language?.Id ?? string.Empty;

            var methodStarts = FindMethodStartLines(lines, languageId);
            if (methodStarts.Count == 0)
            {
                ScanFileRange(
                    filePath,
                    lines,
                    1,
                    lines.Length,
                    "(파일)",
                    index,
                    accesses,
                    seen,
                    entryAccesses,
                    entrySeen,
                    fileCache);
                continue;
            }

            if (methodStarts[0] > 1)
            {
                ScanFileRange(
                    filePath,
                    lines,
                    1,
                    methodStarts[0] - 1,
                    "(전역)",
                    index,
                    accesses,
                    seen,
                    entryAccesses,
                    entrySeen,
                    fileCache);
            }

            for (var i = 0; i < methodStarts.Count; i++)
            {
                var start = methodStarts[i];
                var end = i + 1 < methodStarts.Count ? methodStarts[i + 1] - 1 : lines.Length;
                var displayName = ExtractMethodName(lines[start - 1], languageId) ?? $"line {start}";
                ScanFileRange(
                    filePath,
                    lines,
                    start,
                    end,
                    displayName,
                    index,
                    accesses,
                    seen,
                    entryAccesses,
                    entrySeen,
                    fileCache);
            }
        }
    }

    private static void ScanFileRange(
        string filePath,
        string[] lines,
        int startLine,
        int endLine,
        string displayName,
        TableReferenceIndex index,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
        List<DatabaseEntryAccess> entryAccesses,
        HashSet<string> entrySeen,
        Dictionary<string, string[]> fileCache)
    {
        var language = LanguageRegistry.FindByExtension(Path.GetExtension(filePath));
        var pseudoFunction = new FunctionMetric
        {
            Id = $"file:{filePath}:{startLine}",
            DisplayName = displayName,
            FullName = $"{Path.GetFileName(filePath)}:{startLine}",
            FilePath = filePath,
            StartLine = startLine,
            EndLine = endLine,
            LanguageId = language?.Id ?? string.Empty
        };

        ScanFunctionBody(
            pseudoFunction,
            filePath,
            startLine,
            endLine,
            index,
            new CallGraphResult(),
            accesses,
            seen,
            entryAccesses,
            entrySeen,
            fileCache,
            useFunctionId: false);
    }

    /// <summary>함수 경계와 무관하게 파일 전체 SQL 문자열 리터럴을 스캔 (C++ R"(...)"·연결 리터럴·전역 SQL 포함).</summary>
    private static void AppendFileLevelSqlLiteralScan(
        IReadOnlyList<string>? sourceFiles,
        TableReferenceIndex index,
        CallGraphResult callGraph,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
        List<DatabaseEntryAccess> entryAccesses,
        HashSet<string> entrySeen,
        Dictionary<string, string[]> fileCache)
    {
        if (sourceFiles is null || sourceFiles.Count == 0)
        {
            return;
        }

        foreach (var filePath in sourceFiles)
        {
            if (!TryReadLines(filePath, fileCache, out var lines) || lines.Length == 0)
            {
                continue;
            }

            var languageId = LanguageRegistry.FindByExtension(Path.GetExtension(filePath))?.Id ?? string.Empty;
            var fullText = string.Join('\n', lines);
            var methodStarts = FindMethodStartLines(lines, languageId);

            foreach (var span in SqlPatternHelper.ExtractSqlLiteralSpans(fullText))
            {
                var matches = DetectTableReferences(span.Text, languageId, index);
                if (matches.Count == 0)
                {
                    continue;
                }

                var owner = ResolveSqlLiteralOwner(filePath, lines, methodStarts, languageId, span.LineNumber);
                var functionId = ResolveCallGraphFunctionId(callGraph, filePath, owner.MethodStartLine) ?? owner.FunctionId;
                var pseudoFunction = new FunctionMetric
                {
                    Id = functionId,
                    DisplayName = owner.DisplayName,
                    FullName = $"{Path.GetFileName(filePath)}:{span.LineNumber}",
                    FilePath = filePath,
                    StartLine = span.LineNumber,
                    EndLine = span.LineNumber,
                    LanguageId = languageId
                };

                RecordTableMatches(pseudoFunction, functionId, matches, accesses, seen, entryAccesses, entrySeen);
            }
        }
    }

    private static (string DisplayName, string FunctionId, int MethodStartLine) ResolveSqlLiteralOwner(
        string filePath,
        string[] lines,
        List<int> methodStarts,
        string languageId,
        int sqlLine)
    {
        var enclosingStart = -1;
        for (var i = methodStarts.Count - 1; i >= 0; i--)
        {
            if (methodStarts[i] <= sqlLine)
            {
                enclosingStart = methodStarts[i];
                break;
            }
        }

        if (enclosingStart < 0)
        {
            return ("(전역)", $"file:{filePath}:{sqlLine}", sqlLine);
        }

        var displayName = ExtractMethodName(lines[enclosingStart - 1], languageId) ?? $"line {enclosingStart}";
        return (displayName, $"file:{filePath}:{enclosingStart}", enclosingStart);
    }

    private static string? ResolveCallGraphFunctionId(CallGraphResult callGraph, string filePath, int methodStartLine)
    {
        if (methodStartLine <= 0)
        {
            return null;
        }

        return callGraph.Nodes.FirstOrDefault(node =>
            string.Equals(node.FilePath, filePath, StringComparison.OrdinalIgnoreCase)
            && Math.Abs(node.LineNumber - methodStartLine) <= 3)?.Id;
    }

    private static List<int> FindMethodStartLines(string[] lines, string languageId = "")
    {
        var starts = new List<int>();
        var text = SqlPatternHelper.StripCommentsPreservingLiterals(string.Join('\n', lines));

        Regex headerRegex;
        if (string.IsNullOrEmpty(languageId) || languageId.Equals("csharp", StringComparison.OrdinalIgnoreCase))
        {
            headerRegex = CSharpMethodHeaderRegex;
        }
        else
        {
            headerRegex = LanguageDbAccessPatterns.GetFunctionHeaderRegex(languageId)
                ?? CSharpMethodHeaderRegex;
        }

        foreach (Match match in headerRegex.Matches(text))
        {
            // 언어마다 캡처 그룹 수가 다르므로 첫 번째 비어있지 않은 그룹을 함수명으로 사용
            var hasName = false;
            for (var g = 1; g < match.Groups.Count; g++)
            {
                if (match.Groups[g].Success && !string.IsNullOrWhiteSpace(match.Groups[g].Value))
                {
                    hasName = true;
                    break;
                }
            }

            if (!hasName)
                continue;

            var line = text.AsSpan(0, match.Index).Count('\n') + 1;
            if (line > 0 && (starts.Count == 0 || starts[^1] != line))
            {
                starts.Add(line);
            }
        }

        return starts;
    }

    private static string? ExtractMethodName(string headerLine, string languageId = "")
    {
        Regex headerRegex;
        if (string.IsNullOrEmpty(languageId) || languageId.Equals("csharp", StringComparison.OrdinalIgnoreCase))
        {
            headerRegex = CSharpMethodHeaderRegex;
        }
        else
        {
            headerRegex = LanguageDbAccessPatterns.GetFunctionHeaderRegex(languageId)
                ?? CSharpMethodHeaderRegex;
        }

        var match = headerRegex.Match(headerLine);
        if (!match.Success)
            return null;

        for (var g = 1; g < match.Groups.Count; g++)
        {
            if (match.Groups[g].Success && !string.IsNullOrWhiteSpace(match.Groups[g].Value))
                return match.Groups[g].Value;
        }

        return null;
    }

    private static List<(string TableId, DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern, DatabaseCrudOperation Operations)> DetectTableReferences(
        string body,
        string languageId,
        TableReferenceIndex index)
    {
        var results = new Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern, DatabaseCrudOperation Operations)>(StringComparer.OrdinalIgnoreCase);
        var searchBodies = new List<string> { body };
        searchBodies.AddRange(SqlPatternHelper.ExtractSqlLiteralBodies(body));

        foreach (var searchBody in searchBodies)
        {
            foreach (Match match in SqlPatternHelper.SqlReadTableRegex.Matches(searchBody))
            {
                TryAddMatch(results, index, match.Groups[1].Value, match.Groups[2].Value, DatabaseTableAccessKind.Read, DatabaseTableAccessPattern.Sql, DatabaseCrudOperation.Read);
            }

            foreach (Match match in SqlPatternHelper.SqlCrudTableRegex.Matches(searchBody))
            {
                var operation = MapSqlVerbToOperation(match.Groups["op"].Value);
                TryAddMatch(results, index, match.Groups["schema"].Value, match.Groups["table"].Value, DatabaseTableAccessKind.Write, DatabaseTableAccessPattern.Sql, operation);
            }
        }

        // C# / VB.NET EF Core 패턴
        if (string.IsNullOrEmpty(languageId)
            || languageId.Equals("csharp", StringComparison.OrdinalIgnoreCase)
            || languageId.Equals("vbnet", StringComparison.OrdinalIgnoreCase))
        {
            foreach (Match match in EfSetGenericRegex.Matches(body))
            {
                TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityFramework, DatabaseCrudOperation.None);
            }

            foreach (Match match in EfGenericCrudRegex.Matches(body))
            {
                var operation = MapEfMethodToOperation(match.Groups[1].Value);
                var kind = operation == DatabaseCrudOperation.None ? DatabaseTableAccessKind.ReadWrite : DatabaseTableAccessKind.Write;
                TryAddAlias(results, index, match.Groups[2].Value, kind, DatabaseTableAccessPattern.EntityFramework, operation);
            }

            foreach (Match match in EfDbSetPropertyRegex.Matches(body))
            {
                TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityFramework, DatabaseCrudOperation.None);
            }

            foreach (Match match in EfDbSetMemberRegex.Matches(body))
            {
                var operation = MapEfMethodToOperation(match.Groups[2].Value);
                TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityFramework, operation);
            }

            foreach (Match match in EfEntryRegex.Matches(body))
            {
                if (match.Groups[1].Success)
                {
                    TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityFramework, DatabaseCrudOperation.None);
                }
            }
        }

        // 언어별 ORM 패턴 적용
        if (!string.IsNullOrEmpty(languageId))
        {
            foreach (var ormPattern in LanguageDbAccessPatterns.GetOrmPatterns(languageId))
            {
                foreach (Match match in ormPattern.PatternRegex.Matches(body))
                {
                    var entityName = ormPattern.EntityNameGroup > 0 && match.Groups[ormPattern.EntityNameGroup].Success
                        ? match.Groups[ormPattern.EntityNameGroup].Value
                        : string.Empty;

                    var kind = ormPattern.Operation == DatabaseCrudOperation.Read
                        ? DatabaseTableAccessKind.Read
                        : ormPattern.Operation == DatabaseCrudOperation.None
                            ? DatabaseTableAccessKind.ReadWrite
                            : DatabaseTableAccessKind.Write;

                    if (!string.IsNullOrEmpty(entityName))
                    {
                        TryAddAlias(results, index, entityName, kind, ormPattern.AccessPattern, ormPattern.Operation);
                    }
                }
            }
        }

        foreach (var profile in index.Profiles)
        {
            if (!string.IsNullOrWhiteSpace(profile.EntityTypeName)
                && ReferencesEntityType(body, profile.EntityTypeName))
            {
                MergeAccess(results, profile.TableId, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityType, DatabaseCrudOperation.None);
            }

            foreach (var columnName in profile.ColumnNames)
            {
                if (ReferencesColumn(body, columnName))
                {
                    MergeAccess(results, profile.TableId, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityType, DatabaseCrudOperation.None);
                }
            }
        }

        return results
            .Select(pair => (pair.Key, pair.Value.Kind, pair.Value.Pattern, pair.Value.Operations))
            .ToList();
    }

    private static bool ReferencesEntityType(string body, string entityTypeName)
    {
        var escaped = Regex.Escape(entityTypeName);
        return Regex.IsMatch(
            body,
            $@"(?<![\w$@#])(?:new\s+{escaped}\b|<\s*{escaped}\s*[>,\)]|:\s*{escaped}\b|\(\s*{escaped}\s+\w+\b|\b{escaped}\s+\w+\s*[=;,)])",
            RegexOptions.CultureInvariant);
    }

    private static bool ReferencesColumn(string body, string columnName)
    {
        var escaped = Regex.Escape(columnName);
        return Regex.IsMatch(body, $@"(?<![\w$@#])\.{escaped}\b", RegexOptions.CultureInvariant)
            || Regex.IsMatch(body, $@"(?<![\w$@#])\b{escaped}\s*=", RegexOptions.CultureInvariant);
    }

    private static void TryAddMatch(
        Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern, DatabaseCrudOperation Operations)> results,
        TableReferenceIndex index,
        string schemaToken,
        string tableToken,
        DatabaseTableAccessKind kind,
        DatabaseTableAccessPattern pattern,
        DatabaseCrudOperation operations)
    {
        var qualified = string.IsNullOrWhiteSpace(schemaToken)
            ? tableToken
            : $"{schemaToken}.{tableToken}";

        if (!TryResolveTable(index, qualified, out var tableId)
            && !TryResolveTable(index, tableToken, out tableId))
        {
            // SQL에서 참조된 테이블을 자동 발견하여 인덱스에 등록
            tableId = AutoDiscoverSqlTable(index, schemaToken, tableToken);
            if (string.IsNullOrEmpty(tableId))
                return;
        }

        MergeAccess(results, tableId, kind, pattern, operations);
    }

    private static void TryAddAlias(
        Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern, DatabaseCrudOperation Operations)> results,
        TableReferenceIndex index,
        string alias,
        DatabaseTableAccessKind kind,
        DatabaseTableAccessPattern pattern,
        DatabaseCrudOperation operations)
    {
        if (!TryResolveTable(index, alias, out var tableId))
        {
            return;
        }

        MergeAccess(results, tableId, kind, pattern, operations);
    }

    private static void MergeAccess(
        Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern, DatabaseCrudOperation Operations)> results,
        string tableId,
        DatabaseTableAccessKind kind,
        DatabaseTableAccessPattern pattern,
        DatabaseCrudOperation operations)
    {
        if (!results.TryGetValue(tableId, out var existing))
        {
            results[tableId] = (kind, pattern, operations);
            return;
        }

        var mergedKind = MergeKinds(existing.Kind, kind);
        var mergedPattern = existing.Pattern == pattern ? pattern : DatabaseTableAccessPattern.Sql;
        var mergedOperations = existing.Operations | operations;
        results[tableId] = (mergedKind, mergedPattern, mergedOperations);
    }

    private static DatabaseTableAccessKind MergeKinds(DatabaseTableAccessKind left, DatabaseTableAccessKind right) =>
        left == right ? left : DatabaseTableAccessKind.ReadWrite;

    /// <summary>SQL 동사(INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/TRUNCATE/MERGE)를 CRUD 동작으로 매핑.</summary>
    private static DatabaseCrudOperation MapSqlVerbToOperation(string verb)
    {
        var v = verb.TrimStart().ToUpperInvariant();
        if (v.StartsWith("INSERT", StringComparison.Ordinal)) return DatabaseCrudOperation.Create;
        if (v.StartsWith("REPLACE", StringComparison.Ordinal)) return DatabaseCrudOperation.Create;
        if (v.StartsWith("CREATE", StringComparison.Ordinal)) return DatabaseCrudOperation.Create;
        if (v.StartsWith("MERGE", StringComparison.Ordinal)) return DatabaseCrudOperation.Create | DatabaseCrudOperation.Update;
        if (v.StartsWith("UPDATE", StringComparison.Ordinal)) return DatabaseCrudOperation.Update;
        if (v.StartsWith("ALTER", StringComparison.Ordinal)) return DatabaseCrudOperation.Update;
        if (v.StartsWith("DELETE", StringComparison.Ordinal)) return DatabaseCrudOperation.Delete;
        if (v.StartsWith("TRUNCATE", StringComparison.Ordinal)) return DatabaseCrudOperation.Delete;
        if (v.StartsWith("DROP", StringComparison.Ordinal)) return DatabaseCrudOperation.Delete;
        return DatabaseCrudOperation.None;
    }

    /// <summary>EF Core 메서드명(Add/Update/Remove/Find/Where 등)을 CRUD 동작으로 매핑.</summary>
    private static DatabaseCrudOperation MapEfMethodToOperation(string method) => method.ToLowerInvariant() switch
    {
        "add" or "addasync" or "addrange" or "addrangeasync"
            or "insert" or "insertasync" or "insertrange" or "insertrangeasync"
            => DatabaseCrudOperation.Create,
        "update" or "updaterange" or "executeupdate" or "executeupdateasync" or "attach" or "attachrange"
            => DatabaseCrudOperation.Update,
        "remove" or "removerange" or "executedelete" or "executedeleteasync" or "delete" or "deleterange"
            => DatabaseCrudOperation.Delete,
        "find" or "findasync" or "where" or "include"
            or "firstordefault" or "firstordefaultasync" or "first" or "firstasync"
            or "singleordefault" or "singleordefaultasync" or "single" or "singleasync"
            or "any" or "anyasync" or "count" or "countasync" or "tolist" or "tolistasync"
            => DatabaseCrudOperation.Read,
        _ => DatabaseCrudOperation.None
    };

    /// <summary>플래그로 합쳐진 CRUD 동작을 개별 동작 단위로 분리 (엔트리 단위 기록용).</summary>
    private static IEnumerable<DatabaseCrudOperation> SplitOperations(DatabaseCrudOperation operations)
    {
        if (operations.HasFlag(DatabaseCrudOperation.Create)) yield return DatabaseCrudOperation.Create;
        if (operations.HasFlag(DatabaseCrudOperation.Read)) yield return DatabaseCrudOperation.Read;
        if (operations.HasFlag(DatabaseCrudOperation.Update)) yield return DatabaseCrudOperation.Update;
        if (operations.HasFlag(DatabaseCrudOperation.Delete)) yield return DatabaseCrudOperation.Delete;
    }

    private static bool TryResolveTable(TableReferenceIndex index, string token, out string tableId)
    {
        tableId = string.Empty;
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        if (index.Aliases.TryGetValue(token.Trim(), out var resolved))
        {
            tableId = resolved;
            return true;
        }

        return false;
    }

    private static string ResolveFunctionId(FunctionMetric function, CallGraphResult callGraph)
    {
        var match = callGraph.Nodes.FirstOrDefault(node =>
            string.Equals(node.FilePath, function.FilePath, StringComparison.OrdinalIgnoreCase)
            && string.Equals(node.DisplayName, function.DisplayName, StringComparison.Ordinal)
            && Math.Abs(node.LineNumber - function.StartLine) <= 3);

        return match?.Id ?? function.Id;
    }

    private static string? ResolveLanguageId(string nodeId)
    {
        var colon = nodeId.IndexOf(':');
        return colon > 0 ? nodeId[..colon] : null;
    }

    private static bool TryReadLines(
        string filePath,
        Dictionary<string, string[]> cache,
        out string[] lines)
    {
        lines = [];
        if (string.IsNullOrWhiteSpace(filePath))
        {
            return false;
        }

        try
        {
            filePath = Path.GetFullPath(filePath);
        }
        catch
        {
            return false;
        }

        if (cache.TryGetValue(filePath, out var cached))
        {
            lines = cached;
            return lines.Length > 0;
        }

        try
        {
            var fullPath = Path.GetFullPath(filePath);
            lines = File.ReadAllLines(fullPath);
            cache[filePath] = lines;
            return lines.Length > 0;
        }
        catch
        {
            cache[filePath] = [];
            return false;
        }
    }

    private static List<DatabaseColumnAccess> AppendColumnAccesses(
        IReadOnlyList<string>? sourceFiles,
        IReadOnlyList<DatabaseTable> tables,
        List<DatabaseTableAccess> tableAccesses,
        CallGraphResult callGraph,
        Dictionary<string, string[]> fileCache)
    {
        var columnAccesses = new List<DatabaseColumnAccess>();
        var columnSeen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (sourceFiles is not null && sourceFiles.Count > 0)
        {
            foreach (var filePath in sourceFiles)
            {
                if (!TryReadLines(filePath, fileCache, out var lines) || lines.Length == 0)
                {
                    continue;
                }

                var languageId = LanguageRegistry.FindByExtension(Path.GetExtension(filePath))?.Id ?? string.Empty;
                var fullText = string.Join('\n', lines);
                var methodStarts = FindMethodStartLines(lines, languageId);

                foreach (var span in SqlPatternHelper.ExtractSqlLiteralSpans(fullText))
                {
                    foreach (var table in tables)
                    {
                        if (!SqlPatternHelper.SqlLiteralReferencesTable(span.Text, table.Name, table.Schema))
                        {
                            continue;
                        }

                        var owner = ResolveSqlLiteralOwner(filePath, lines, methodStarts, languageId, span.LineNumber);
                        var functionId = ResolveCallGraphFunctionId(callGraph, filePath, owner.MethodStartLine) ?? owner.FunctionId;
                        var displayName = owner.DisplayName;
                        var fullName = $"{Path.GetFileName(filePath)}:{span.LineNumber}";

                        foreach (var (colName, kind, operations) in DetectColumnsInSql(span.Text, table))
                        {
                            var key = $"{table.Id}\0{functionId}\0{span.LineNumber}\0{colName}";
                            if (!columnSeen.Add(key))
                            {
                                continue;
                            }

                            columnAccesses.Add(new DatabaseColumnAccess
                            {
                                TableId = table.Id,
                                ColumnName = colName,
                                FunctionId = functionId,
                                FunctionDisplayName = displayName,
                                FunctionFullName = fullName,
                                FunctionFilePath = filePath,
                                FunctionLineNumber = span.LineNumber,
                                Kind = kind,
                                Pattern = DatabaseTableAccessPattern.Sql,
                                Operations = operations
                            });
                        }
                    }
                }
            }
        }

        foreach (var access in tableAccesses)
        {
            if (!tables.Any(t => string.Equals(t.Id, access.TableId, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            var table = tables.First(t => string.Equals(t.Id, access.TableId, StringComparison.OrdinalIgnoreCase));
            foreach (var (colName, kind, operations) in DetectColumnsInEntityBody(access.FunctionFilePath, access.FunctionLineNumber, table, fileCache))
            {
                var key = $"{access.TableId}\0{access.FunctionId}\0{access.FunctionLineNumber}\0{colName}";
                if (!columnSeen.Add(key))
                {
                    continue;
                }

                columnAccesses.Add(new DatabaseColumnAccess
                {
                    TableId = access.TableId,
                    ColumnName = colName,
                    FunctionId = access.FunctionId,
                    FunctionDisplayName = access.FunctionDisplayName,
                    FunctionFullName = access.FunctionFullName,
                    FunctionFilePath = access.FunctionFilePath,
                    FunctionLineNumber = access.FunctionLineNumber,
                    Kind = kind,
                    Pattern = access.Pattern,
                    Operations = operations
                });
            }
        }

        return columnAccesses
            .OrderBy(ca => ca.TableId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(ca => ca.ColumnName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(ca => ca.FunctionLineNumber)
            .ToList();
    }

    private static List<(string ColumnName, DatabaseTableAccessKind Kind, DatabaseCrudOperation Operations)> DetectColumnsInSql(
        string sql,
        DatabaseTable table)
    {
        var knownColumns = new HashSet<string>(
            table.Columns.Select(c => c.Name),
            StringComparer.OrdinalIgnoreCase);
        var hasSchema = knownColumns.Count > 0;

        var result = new Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseCrudOperation Operations)>(StringComparer.OrdinalIgnoreCase);

        void Add(string col, DatabaseTableAccessKind kind, DatabaseCrudOperation operation)
        {
            if (SqlKeywords.Contains(col))
            {
                return;
            }

            if (hasSchema && !knownColumns.Contains(col))
            {
                return;
            }

            if (col.Length < 2)
            {
                return;
            }

            if (!result.TryGetValue(col, out var existing))
            {
                result[col] = (kind, operation);
            }
            else
            {
                var mergedKind = existing.Kind == kind ? kind : DatabaseTableAccessKind.ReadWrite;
                result[col] = (mergedKind, existing.Operations | operation);
            }
        }

        foreach (Match m in SqlPatternHelper.SqlSelectColumnsRegex.Matches(sql))
        {
            if (!SqlPatternHelper.SqlMentionsTable(sql, m.Index, table.Name))
            {
                continue;
            }

            var selectList = m.Groups[1].Value;
            if (hasSchema && SqlPatternHelper.SelectUsesWildcard(selectList))
            {
                foreach (var col in knownColumns)
                {
                    Add(col, DatabaseTableAccessKind.Read, DatabaseCrudOperation.Read);
                }
            }
            else
            {
                foreach (var col in ParseColumnTokens(selectList))
                {
                    Add(col, DatabaseTableAccessKind.Read, DatabaseCrudOperation.Read);
                }
            }
        }

        foreach (Match m in SqlPatternHelper.SqlInsertColumnsRegex.Matches(sql))
        {
            if (!SqlPatternHelper.SqlInsertTargetsTable(m, table.Name))
            {
                continue;
            }

            foreach (var col in ParseColumnTokens(m.Groups[1].Value))
            {
                Add(col, DatabaseTableAccessKind.Write, DatabaseCrudOperation.Create);
            }
        }

        foreach (Match m in SqlPatternHelper.SqlUpdateSetColumnsRegex.Matches(sql))
        {
            if (!SqlPatternHelper.SqlUpdateTargetsTable(m, table.Name))
            {
                continue;
            }

            foreach (var col in ParseColumnTokens(m.Groups[1].Value, leftOfEquals: true))
            {
                Add(col, DatabaseTableAccessKind.Write, DatabaseCrudOperation.Update);
            }
        }

        foreach (Match m in SqlPatternHelper.SqlDeleteFromRegex.Matches(sql))
        {
            if (!SqlPatternHelper.SqlDeleteTargetsTable(m, table.Name))
            {
                continue;
            }

            foreach (var col in SqlPatternHelper.ExtractWhereColumns(m.Groups[1].Success ? m.Groups[1].Value : null))
            {
                Add(col, DatabaseTableAccessKind.Write, DatabaseCrudOperation.Delete);
            }
        }

        return result.Select(p => (p.Key, p.Value.Kind, p.Value.Operations)).ToList();
    }

    private static List<(string ColumnName, DatabaseTableAccessKind Kind, DatabaseCrudOperation Operations)> DetectColumnsInEntityBody(
        string filePath,
        int lineNumber,
        DatabaseTable table,
        Dictionary<string, string[]> fileCache)
    {
        if (table.Columns.Count == 0 || !TryReadLines(filePath, fileCache, out var lines))
        {
            return [];
        }

        var start = Math.Max(1, lineNumber);
        var end = Math.Min(lines.Length, start + MethodScanLineWindow);
        var body = string.Join('\n', lines.AsSpan(start - 1, end - start + 1).ToArray());
        var result = new Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseCrudOperation Operations)>(StringComparer.OrdinalIgnoreCase);

        foreach (var column in table.Columns)
        {
            if (!ReferencesColumn(body, column.Name))
            {
                continue;
            }

            result[column.Name] = (DatabaseTableAccessKind.ReadWrite, DatabaseCrudOperation.Read | DatabaseCrudOperation.Update);
        }

        return result.Select(p => (p.Key, p.Value.Kind, p.Value.Operations)).ToList();
    }

    private static List<DatabaseTableAccess> DeduplicateAccesses(List<DatabaseTableAccess> accesses) =>
        accesses
            .GroupBy(
                access => $"{access.TableId}\0{access.FunctionFilePath}\0{access.FunctionLineNumber}",
                StringComparer.OrdinalIgnoreCase)
            .Select(MergeDuplicateAccesses)
            .OrderBy(access => access.FunctionFilePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(access => access.FunctionLineNumber)
            .ThenBy(access => access.FunctionDisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static DatabaseTableAccess MergeDuplicateAccesses(IEnumerable<DatabaseTableAccess> group)
    {
        var ordered = group
            .OrderByDescending(access => IsCallGraphFunctionId(access.FunctionId))
            .ThenBy(access => access.FunctionId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var primary = ordered[0];
        var mergedKind = ordered.Aggregate(primary.Kind, (kind, access) => MergeKinds(kind, access.Kind));
        var mergedOps = ordered.Aggregate(DatabaseCrudOperation.None, (ops, access) => ops | access.Operations);

        return new DatabaseTableAccess
        {
            TableId = primary.TableId,
            FunctionId = primary.FunctionId,
            FunctionDisplayName = primary.FunctionDisplayName,
            FunctionFullName = primary.FunctionFullName,
            FunctionFilePath = primary.FunctionFilePath,
            FunctionLineNumber = primary.FunctionLineNumber,
            Kind = mergedKind,
            Pattern = ordered.All(access => access.Pattern == primary.Pattern)
                ? primary.Pattern
                : DatabaseTableAccessPattern.Sql,
            Operations = mergedOps
        };
    }

    private static List<DatabaseEntryAccess> DeduplicateEntryAccesses(List<DatabaseEntryAccess> entries) =>
        entries
            .GroupBy(
                entry => $"{entry.TableId}\0{entry.FunctionFilePath}\0{entry.FunctionLineNumber}\0{entry.Operation}",
                StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(entry => IsCallGraphFunctionId(entry.FunctionId)).First())
            .ToList();

    private static bool IsCallGraphFunctionId(string functionId) =>
        !functionId.StartsWith("file:", StringComparison.OrdinalIgnoreCase);

    private static IEnumerable<string> ParseColumnTokens(string clause, bool leftOfEquals = false)
    {
        foreach (var part in clause.Split(','))
        {
            var token = part.Trim();
            if (string.IsNullOrEmpty(token) || token == "*")
                continue;

            if (leftOfEquals)
            {
                var eq = token.IndexOf('=');
                if (eq > 0)
                    token = token[..eq].Trim();
            }

            var dot = token.LastIndexOf('.');
            if (dot >= 0)
                token = token[(dot + 1)..].Trim();

            token = token.Trim('`', '[', ']', '"', '\'', ' ', '\t', '\n', '\r');

            var m = Regex.Match(token, @"^\w+");
            if (m.Success && m.Value.Length >= 2)
                yield return m.Value;
        }
    }
}
