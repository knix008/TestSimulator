using System.Text.RegularExpressions;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Database;

namespace CodeAnalyzer.Services.Database.Schema;

internal static class SqlSchemaParser
{
    private static readonly Regex ForeignKeyRegex = new(
        @"FOREIGN\s+KEY\s*\(\s*[`""]?(\w+)[`""]?\s*\)\s*REFERENCES\s+[`""]?(\w+)[`""]?\s*(?:\(\s*[`""]?(\w+)[`""]?\s*\))?",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex InlineRefRegex = new(
        @"REFERENCES\s+[`""]?(\w+)[`""]?\s*(?:\(\s*[`""]?(\w+)[`""]?\s*\))?",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static IReadOnlyList<ParsedTable> ParseScripts(
        IEnumerable<(string FilePath, int LineOffset, string Sql, DatabaseDialect Dialect)> scripts)
    {
        var tables = new Dictionary<string, ParsedTable>(StringComparer.OrdinalIgnoreCase);

        foreach (var (filePath, lineOffset, sql, dialect) in scripts)
        {
            foreach (var parsed in ParseCreateTables(sql, dialect, filePath, lineOffset))
            {
                tables.TryAdd(parsed.Key, parsed.Value);
            }
        }

        return tables.Values.ToList();
    }

    public static Dictionary<string, ParsedTable> ParseCreateTables(
        string sql,
        DatabaseDialect dialect,
        string filePath,
        int lineOffset = 0)
    {
        var result = new Dictionary<string, ParsedTable>(StringComparer.OrdinalIgnoreCase);
        var index = 0;

        while (index < sql.Length)
        {
            var match = SqlPatternHelper.CreateTableStartRegex.Match(sql, index);
            if (!match.Success)
            {
                break;
            }

            var schema = match.Groups[1].Success ? match.Groups[1].Value : null;
            var tableName = match.Groups[2].Value;
            var openParenIndex = match.Index + match.Length - 1;
            if (!TryReadBalancedParenthesis(sql, openParenIndex, out var closeParenIndex))
            {
                index = match.Index + match.Length;
                continue;
            }

            var body = sql[(openParenIndex + 1)..closeParenIndex];
            var lineNumber = lineOffset + CountLines(sql[..match.Index]) + 1;
            var columns = ParseTableBody(body, out var foreignKeys);
            var tableKey = BuildTableKey(schema, tableName);

            result[tableKey] = new ParsedTable
            {
                Key = tableKey,
                Schema = schema,
                Name = tableName,
                Dialect = dialect,
                FilePath = filePath,
                LineNumber = lineNumber,
                Columns = columns,
                ForeignKeys = foreignKeys
            };

            index = closeParenIndex + 1;
        }

        return result;
    }

    private static List<ParsedColumn> ParseTableBody(string body, out List<ParsedForeignKey> foreignKeys)
    {
        var columns = new List<ParsedColumn>();
        foreignKeys = new List<ParsedForeignKey>();
        var parts = SplitTopLevelComma(body);

        foreach (var part in parts)
        {
            var trimmed = part.Trim();
            if (trimmed.Length == 0)
            {
                continue;
            }

            if (IsConstraintClause(trimmed))
            {
                var fkMatch = ForeignKeyRegex.Match(trimmed);
                if (fkMatch.Success)
                {
                    foreignKeys.Add(new ParsedForeignKey
                    {
                        Column = fkMatch.Groups[1].Value,
                        ReferencedTable = fkMatch.Groups[2].Value,
                        ReferencedColumn = fkMatch.Groups[3].Success ? fkMatch.Groups[3].Value : "id"
                    });
                }

                continue;
            }

            var column = ParseColumnDefinition(trimmed);
            if (column is not null)
            {
                columns.Add(column);
            }
        }

        return columns;
    }

    private static ParsedColumn? ParseColumnDefinition(string definition)
    {
        var match = Regex.Match(
            definition,
            @"^[`""]?(\w+)[`""]?\s+(\w+)",
            RegexOptions.CultureInvariant);
        if (!match.Success)
        {
            return null;
        }

        var name = match.Groups[1].Value;
        var upper = definition.ToUpperInvariant();
        var isPk = upper.Contains("PRIMARY KEY", StringComparison.Ordinal)
            || Regex.IsMatch(upper, @"\bPK\b");
        var inlineRef = InlineRefRegex.Match(definition);

        return new ParsedColumn
        {
            Name = name,
            DataType = match.Groups[2].Value,
            IsPrimaryKey = isPk,
            IsNullable = !upper.Contains("NOT NULL", StringComparison.Ordinal),
            ReferencedTable = inlineRef.Success ? inlineRef.Groups[1].Value : null,
            ReferencedColumn = inlineRef.Success && inlineRef.Groups[2].Success
                ? inlineRef.Groups[2].Value
                : inlineRef.Success ? "id" : null
        };
    }

    private static bool IsConstraintClause(string text) =>
        text.StartsWith("CONSTRAINT", StringComparison.OrdinalIgnoreCase)
        || text.StartsWith("PRIMARY KEY", StringComparison.OrdinalIgnoreCase)
        || text.StartsWith("UNIQUE", StringComparison.OrdinalIgnoreCase)
        || text.StartsWith("FOREIGN KEY", StringComparison.OrdinalIgnoreCase)
        || text.StartsWith("CHECK", StringComparison.OrdinalIgnoreCase);

    private static List<string> SplitTopLevelComma(string body)
    {
        var parts = new List<string>();
        var depth = 0;
        var start = 0;

        for (var i = 0; i < body.Length; i++)
        {
            var ch = body[i];
            if (ch == '(')
            {
                depth++;
            }
            else if (ch == ')')
            {
                depth--;
            }
            else if (ch == ',' && depth == 0)
            {
                parts.Add(body[start..i]);
                start = i + 1;
            }
        }

        parts.Add(body[start..]);
        return parts;
    }

    private static bool TryReadBalancedParenthesis(string text, int openIndex, out int closeIndex)
    {
        closeIndex = -1;
        if (openIndex < 0 || openIndex >= text.Length || text[openIndex] != '(')
        {
            return false;
        }

        var depth = 0;
        for (var i = openIndex; i < text.Length; i++)
        {
            if (text[i] == '(')
            {
                depth++;
            }
            else if (text[i] == ')')
            {
                depth--;
                if (depth == 0)
                {
                    closeIndex = i;
                    return true;
                }
            }
        }

        return false;
    }

    private static int CountLines(string text)
    {
        if (text.Length == 0)
        {
            return 0;
        }

        return text.Count(ch => ch == '\n');
    }

    public static string BuildTableKey(string? schema, string tableName) =>
        string.IsNullOrWhiteSpace(schema) ? tableName : $"{schema}.{tableName}";

    public static DatabaseDialect DetectDialect(string filePath, string content)
    {
        var upper = content.ToUpperInvariant();
        if (upper.Contains("AUTOINCREMENT", StringComparison.Ordinal)
            || upper.Contains("WITHOUT ROWID", StringComparison.Ordinal))
        {
            return DatabaseDialect.Sqlite;
        }

        if (upper.Contains("SERIAL", StringComparison.Ordinal)
            || upper.Contains("UUID", StringComparison.Ordinal) && upper.Contains("::", StringComparison.Ordinal))
        {
            return DatabaseDialect.PostgreSql;
        }

        if (upper.Contains("ENGINE=INNODB", StringComparison.Ordinal)
            || upper.Contains("ENGINE=MYISAM", StringComparison.Ordinal)
            || upper.Contains("AUTO_INCREMENT", StringComparison.Ordinal))
        {
            return filePath.Contains("maria", StringComparison.OrdinalIgnoreCase)
                ? DatabaseDialect.MariaDb
                : DatabaseDialect.MySql;
        }

        var ext = Path.GetExtension(filePath).ToLowerInvariant();
        return ext switch
        {
            ".sqlite" or ".sqlite3" or ".db" => DatabaseDialect.Sqlite,
            ".pgsql" or ".postgres" => DatabaseDialect.PostgreSql,
            _ => DatabaseDialect.Unknown
        };
    }

    internal sealed class ParsedTable
    {
        public required string Key { get; init; }
        public string? Schema { get; init; }
        public required string Name { get; init; }
        public DatabaseDialect Dialect { get; init; }
        public string FilePath { get; init; } = string.Empty;
        public int LineNumber { get; init; }
        public string EntityTypeName { get; init; } = string.Empty;
        public List<string> DbSetPropertyNames { get; init; } = [];
        public List<ParsedColumn> Columns { get; init; } = [];
        public List<ParsedForeignKey> ForeignKeys { get; init; } = [];
    }

    internal sealed class ParsedColumn
    {
        public required string Name { get; init; }
        public string DataType { get; init; } = string.Empty;
        public bool IsPrimaryKey { get; init; }
        public bool IsNullable { get; init; } = true;
        public string? ReferencedTable { get; init; }
        public string? ReferencedColumn { get; init; }
    }

    internal sealed class ParsedForeignKey
    {
        public required string Column { get; init; }
        public required string ReferencedTable { get; init; }
        public string ReferencedColumn { get; init; } = "id";
    }
}
