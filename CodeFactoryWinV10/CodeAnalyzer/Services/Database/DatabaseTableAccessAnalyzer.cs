using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Database;

public static class DatabaseTableAccessAnalyzer
{
    private static readonly Regex CommentRegex = new(
        "//.*$|/\\*.*?\\*/|#.*$",
        RegexOptions.Compiled | RegexOptions.Multiline);

    private static readonly Regex SqlReadTableRegex = new(
        @"(?i)\b(?:FROM|JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|INNER\s+JOIN|CROSS\s+JOIN|MERGE\s+INTO)\s+(?:\[\""]?(\w+)[\""]?\.)?(?:\[\""]?(\w+)[\""]?)",
        RegexOptions.Compiled);

    private static readonly Regex SqlWriteTableRegex = new(
        @"(?i)\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+TABLE)\s+(?:\[\""]?(\w+)[\""]?\.)?(?:\[\""]?(\w+)[\""]?)",
        RegexOptions.Compiled);

    private static readonly Regex EfSetGenericRegex = new(
        @"\.Set\s*<\s*(\w+)\s*>",
        RegexOptions.Compiled);

    private static readonly Regex EfGenericCrudRegex = new(
        @"\.(?:Add|AddAsync|Update|Remove|RemoveRange|Attach|Entry)\s*<\s*(\w+)\s*>",
        RegexOptions.Compiled);

    private static readonly Regex EfDbSetPropertyRegex = new(
        @"(?<![\w$@#])(?:[\w$@#]*(?:Context|DbContext)\s*\.\s*(\w+)(?![\w$])",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex EfDbSetMemberRegex = new(
        @"\.(\w+)\s*\.\s*(?:Add|AddAsync|Remove|RemoveRange|Update|Attach|Find|FindAsync|Where|FirstOrDefault|FirstOrDefaultAsync|SingleOrDefault|SingleOrDefaultAsync|Any|AnyAsync|Count|CountAsync|ToList|ToListAsync|Include|ExecuteDelete|ExecuteUpdate)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex EfEntryRegex = new(
        @"\.Entry\s*<\s*(\w+)\s*>|\.Entry\s*\(",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex SqlStringLiteralRegex = new(
        @"(?:@?""(?:(?:\\.|[^""\\])*)""|'(?:(?:\\.|[^'\\])*)')",
        RegexOptions.Compiled | RegexOptions.Singleline);

    private static readonly Regex CSharpMethodHeaderRegex = new(
        @"(?m)^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|async|partial|unsafe|new|sealed|override|virtual|abstract|extern|readonly|required)\s+)+[\w<>\[\]?,\s]+\s+(\w+)\s*\(",
        RegexOptions.Compiled);

    private const int MethodScanLineWindow = 2000;

    // SELECT col1, col2 FROM
    private static readonly Regex SqlSelectColumnsRegex = new(
        @"(?i)\bSELECT\s+((?:(?!\bFROM\b).)+)\bFROM\b",
        RegexOptions.Compiled | RegexOptions.Singleline);

    // INSERT INTO table (col1, col2) VALUES
    private static readonly Regex SqlInsertColumnsRegex = new(
        @"(?i)\bINSERT\s+(?:INTO\s+)?(?:[`\[""']?\w+[`\]""']?\.)?[`\[""']?\w+[`\]""']?\s*\(\s*([^)]+)\)\s*(?:VALUES|SELECT)\b",
        RegexOptions.Compiled);

    // UPDATE table SET col1=..., col2=... (before WHERE or ;)
    private static readonly Regex SqlUpdateSetColumnsRegex = new(
        @"(?i)\bUPDATE\s+(?:[`\[""']?\w+[`\]""']?\.)?[`\[""']?\w+[`\]""']?\s+SET\s+((?:(?!\bWHERE\b)[^;])+)",
        RegexOptions.Compiled | RegexOptions.Singleline);

    public static DatabaseSchemaResult EnrichWithAccesses(
        DatabaseSchemaResult schema,
        IReadOnlyList<FunctionMetric> functions,
        CallGraphResult callGraph,
        IReadOnlyList<string>? sourceFiles = null)
    {
        if (schema.Tables.Count == 0)
        {
            return schema;
        }

        var index = BuildReferenceIndex(schema.Tables);
        if (index.Aliases.Count == 0)
        {
            return schema;
        }

        var accesses = new List<DatabaseTableAccess>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fileCache = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        foreach (var function in functions)
        {
            var effectiveEndLine = function.EndLine > function.StartLine
                ? function.EndLine
                : function.StartLine + MethodScanLineWindow;
            ScanFunctionBody(function, function.FilePath, function.StartLine, effectiveEndLine, index, callGraph, accesses, seen, fileCache, useFunctionId: true);
        }

        AppendCallGraphOnlyAccessors(callGraph, index, accesses, seen, fileCache);
        AppendSourceFileScan(sourceFiles, index, accesses, seen, fileCache);

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

        var columnAccesses = new List<DatabaseColumnAccess>();
        var columnSeen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var access in accesses)
        {
            if (!schema.TableMap.TryGetValue(access.TableId, out var table) || table.Columns.Count == 0)
                continue;

            foreach (var (colName, kind) in DetectColumnAccesses(access.FunctionFilePath, access.FunctionLineNumber, table, fileCache))
            {
                var key = $"{access.TableId}\0{access.FunctionId}\0{colName}";
                if (!columnSeen.Add(key))
                    continue;

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
                    Pattern = access.Pattern
                });
            }
        }

        var groupedColumns = columnAccesses
            .GroupBy(ca => ca.TableId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<DatabaseColumnAccess>)g
                    .OrderBy(ca => ca.ColumnName, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(ca => ca.FunctionDisplayName, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                StringComparer.OrdinalIgnoreCase);

        return new DatabaseSchemaResult
        {
            Tables = schema.Tables,
            Relations = schema.Relations,
            Accesses = accesses,
            TableMap = schema.TableMap,
            AccessesByTableId = grouped,
            ColumnAccesses = columnAccesses,
            ColumnAccessesByTableId = groupedColumns
        };
    }

    private sealed class TableReferenceIndex
    {
        public Dictionary<string, string> Aliases { get; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, DatabaseTableAccessPattern> AliasPatterns { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> DbSetPropertyNames { get; } = new(StringComparer.OrdinalIgnoreCase);
        public List<TableReferenceProfile> Profiles { get; } = [];
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

    private static void ScanFunctionBody(
        FunctionMetric function,
        string filePath,
        int startLine,
        int endLine,
        TableReferenceIndex index,
        CallGraphResult callGraph,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
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

        var matches = DetectTableReferences(body, index);
        if (matches.Count == 0)
        {
            return;
        }

        var functionId = useFunctionId
            ? ResolveFunctionId(function, callGraph)
            : function.Id;

        foreach (var (tableId, kind, pattern) in matches)
        {
            var key = tableId + "\0" + functionId;
            if (!seen.Add(key))
            {
                continue;
            }

            accesses.Add(new DatabaseTableAccess
            {
                TableId = tableId,
                FunctionId = functionId,
                FunctionDisplayName = function.DisplayName,
                FunctionFullName = function.FullName,
                FunctionFilePath = function.FilePath,
                FunctionLineNumber = function.StartLine,
                Kind = kind,
                Pattern = pattern
            });
        }
    }

    private static void AppendCallGraphOnlyAccessors(
        CallGraphResult callGraph,
        TableReferenceIndex index,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
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
                fileCache,
                useFunctionId: false);
        }
    }

    private static void AppendSourceFileScan(
        IReadOnlyList<string>? sourceFiles,
        TableReferenceIndex index,
        List<DatabaseTableAccess> accesses,
        HashSet<string> seen,
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

            var methodStarts = FindMethodStartLines(lines);
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
                    fileCache);
                continue;
            }

            for (var i = 0; i < methodStarts.Count; i++)
            {
                var start = methodStarts[i];
                var end = i + 1 < methodStarts.Count ? methodStarts[i + 1] - 1 : lines.Length;
                var displayName = ExtractMethodName(lines[start - 1]) ?? $"line {start}";
                ScanFileRange(
                    filePath,
                    lines,
                    start,
                    end,
                    displayName,
                    index,
                    accesses,
                    seen,
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
            fileCache,
            useFunctionId: false);
    }

    private static List<int> FindMethodStartLines(string[] lines)
    {
        var starts = new List<int>();
        var text = string.Join('\n', lines);
        foreach (Match match in CSharpMethodHeaderRegex.Matches(text))
        {
            if (string.IsNullOrWhiteSpace(match.Groups[1].Value))
            {
                continue;
            }

            var line = text.AsSpan(0, match.Index).Count('\n') + 1;
            if (line > 0 && (starts.Count == 0 || starts[^1] != line))
            {
                starts.Add(line);
            }
        }

        return starts;
    }

    private static string? ExtractMethodName(string headerLine)
    {
        var match = CSharpMethodHeaderRegex.Match(headerLine);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static List<(string TableId, DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern)> DetectTableReferences(
        string body,
        TableReferenceIndex index)
    {
        var results = new Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern)>(StringComparer.OrdinalIgnoreCase);
        var searchBodies = new List<string> { body };
        searchBodies.AddRange(ExtractSqlLiteralBodies(body));

        foreach (var searchBody in searchBodies)
        {
            foreach (Match match in SqlReadTableRegex.Matches(searchBody))
            {
                TryAddMatch(results, index, match.Groups[1].Value, match.Groups[2].Value, DatabaseTableAccessKind.Read, DatabaseTableAccessPattern.Sql);
            }

            foreach (Match match in SqlWriteTableRegex.Matches(searchBody))
            {
                TryAddMatch(results, index, match.Groups[1].Value, match.Groups[2].Value, DatabaseTableAccessKind.Write, DatabaseTableAccessPattern.Sql);
            }
        }

        foreach (Match match in EfSetGenericRegex.Matches(body))
        {
            TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityFramework);
        }

        foreach (Match match in EfGenericCrudRegex.Matches(body))
        {
            TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.Write, DatabaseTableAccessPattern.EntityFramework);
        }

        foreach (Match match in EfDbSetPropertyRegex.Matches(body))
        {
            TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityFramework);
        }

        foreach (Match match in EfDbSetMemberRegex.Matches(body))
        {
            TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityFramework);
        }

        foreach (Match match in EfEntryRegex.Matches(body))
        {
            if (match.Groups[1].Success)
            {
                TryAddAlias(results, index, match.Groups[1].Value, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityFramework);
            }
        }

        foreach (var profile in index.Profiles)
        {
            if (!string.IsNullOrWhiteSpace(profile.EntityTypeName)
                && ReferencesEntityType(body, profile.EntityTypeName))
            {
                MergeAccess(results, profile.TableId, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityType);
            }

            foreach (var columnName in profile.ColumnNames)
            {
                if (ReferencesColumn(body, columnName))
                {
                    MergeAccess(results, profile.TableId, DatabaseTableAccessKind.ReadWrite, DatabaseTableAccessPattern.EntityType);
                }
            }
        }

        return results
            .Select(pair => (pair.Key, pair.Value.Kind, pair.Value.Pattern))
            .ToList();
    }

    private static IEnumerable<string> ExtractSqlLiteralBodies(string body)
    {
        foreach (Match match in SqlStringLiteralRegex.Matches(body))
        {
            var literal = match.Value.Trim('"', '\'');
            if (literal.Contains("SELECT", StringComparison.OrdinalIgnoreCase)
                || literal.Contains("INSERT", StringComparison.OrdinalIgnoreCase)
                || literal.Contains("UPDATE", StringComparison.OrdinalIgnoreCase)
                || literal.Contains("DELETE", StringComparison.OrdinalIgnoreCase)
                || literal.Contains("FROM", StringComparison.OrdinalIgnoreCase))
            {
                yield return literal.Replace("\\\"", "\"", StringComparison.Ordinal)
                    .Replace("\\n", "\n", StringComparison.Ordinal)
                    .Replace("\\r", "\r", StringComparison.Ordinal);
            }
        }
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
        Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern)> results,
        TableReferenceIndex index,
        string schemaToken,
        string tableToken,
        DatabaseTableAccessKind kind,
        DatabaseTableAccessPattern pattern)
    {
        var qualified = string.IsNullOrWhiteSpace(schemaToken)
            ? tableToken
            : $"{schemaToken}.{tableToken}";

        if (TryResolveTable(index, qualified, out var tableId)
            || TryResolveTable(index, tableToken, out tableId))
        {
            MergeAccess(results, tableId, kind, pattern);
        }
    }

    private static void TryAddAlias(
        Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern)> results,
        TableReferenceIndex index,
        string alias,
        DatabaseTableAccessKind kind,
        DatabaseTableAccessPattern pattern)
    {
        if (!TryResolveTable(index, alias, out var tableId))
        {
            return;
        }

        MergeAccess(results, tableId, kind, pattern);
    }

    private static void MergeAccess(
        Dictionary<string, (DatabaseTableAccessKind Kind, DatabaseTableAccessPattern Pattern)> results,
        string tableId,
        DatabaseTableAccessKind kind,
        DatabaseTableAccessPattern pattern)
    {
        if (!results.TryGetValue(tableId, out var existing))
        {
            results[tableId] = (kind, pattern);
            return;
        }

        var mergedKind = MergeKinds(existing.Kind, kind);
        var mergedPattern = existing.Pattern == pattern ? pattern : DatabaseTableAccessPattern.Sql;
        results[tableId] = (mergedKind, mergedPattern);
    }

    private static DatabaseTableAccessKind MergeKinds(DatabaseTableAccessKind left, DatabaseTableAccessKind right) =>
        left == right ? left : DatabaseTableAccessKind.ReadWrite;

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
            var content = CommentRegex.Replace(File.ReadAllText(fullPath), match => new string(' ', match.Length));
            lines = content.Split('\n');
            cache[filePath] = lines;
            return lines.Length > 0;
        }
        catch
        {
            cache[filePath] = [];
            return false;
        }
    }

    private static List<(string ColumnName, DatabaseTableAccessKind Kind)> DetectColumnAccesses(
        string filePath,
        int lineNumber,
        DatabaseTable table,
        Dictionary<string, string[]> fileCache)
    {
        if (!TryReadLines(filePath, fileCache, out var lines))
            return [];

        var start = Math.Max(1, lineNumber);
        var end = Math.Min(lines.Length, start + MethodScanLineWindow);
        if (start > end)
            return [];

        var body = string.Join('\n', lines.AsSpan(start - 1, end - start + 1).ToArray());

        var knownColumns = new HashSet<string>(
            table.Columns.Select(c => c.Name),
            StringComparer.OrdinalIgnoreCase);

        var result = new Dictionary<string, DatabaseTableAccessKind>(StringComparer.OrdinalIgnoreCase);

        void Add(string col, DatabaseTableAccessKind kind)
        {
            if (!knownColumns.Contains(col))
                return;
            if (!result.TryGetValue(col, out var existing))
                result[col] = kind;
            else if (existing != kind)
                result[col] = DatabaseTableAccessKind.ReadWrite;
        }

        foreach (Match m in SqlSelectColumnsRegex.Matches(body))
        {
            foreach (var col in ParseColumnTokens(m.Groups[1].Value))
                Add(col, DatabaseTableAccessKind.Read);
        }

        foreach (Match m in SqlInsertColumnsRegex.Matches(body))
        {
            foreach (var col in ParseColumnTokens(m.Groups[1].Value))
                Add(col, DatabaseTableAccessKind.Write);
        }

        foreach (Match m in SqlUpdateSetColumnsRegex.Matches(body))
        {
            foreach (var col in ParseColumnTokens(m.Groups[1].Value, leftOfEquals: true))
                Add(col, DatabaseTableAccessKind.Write);
        }

        return result.Select(p => (p.Key, p.Value)).ToList();
    }

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
