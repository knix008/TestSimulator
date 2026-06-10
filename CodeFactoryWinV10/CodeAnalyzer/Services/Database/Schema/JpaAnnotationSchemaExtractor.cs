using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Database.Schema;

/// <summary>Java/Kotlin JPA <c>@Entity</c>/<c>@Table</c>에서 ERD 테이블을 추출합니다.</summary>
internal static class JpaAnnotationSchemaExtractor
{
    private static readonly Regex EntityMarkerRegex = new(
        @"@(?:Entity|Table)\b|@jakarta\.persistence\.(?:Entity|Table)|@javax\.persistence\.(?:Entity|Table)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex ClassStartRegex = new(
        @"(?:(?:public|protected|private|internal)\s+)?(?:abstract\s+)?(?:data\s+)?class\s+(\w+)\b",
        RegexOptions.Compiled);

    private static readonly Regex TableNameRegex = new(
        @"@Table\s*\(\s*(?:name\s*=\s*)?[""'](\w+)[""']",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex ColumnNameRegex = new(
        @"@Column\s*\(\s*(?:name\s*=\s*)?[""'](\w+)[""']",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex JoinColumnRegex = new(
        @"@JoinColumn\s*\(\s*name\s*=\s*[""'](\w+)[""'](?:[^)]*referencedColumnName\s*=\s*[""'](\w+)[""'])?",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex FieldRegex = new(
        @"(?:private|protected)\s+[\w<>\[\].,?]+\s+(\w+)\s*(?:=|;)",
        RegexOptions.Compiled);

    public static void Extract(
        IReadOnlyList<string> sourceFiles,
        Dictionary<string, SqlSchemaParser.ParsedTable> tables,
        CancellationToken cancellationToken = default)
    {
        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            string content;
            try
            {
                content = File.ReadAllText(file);
            }
            catch (Exception)
            {
                continue;
            }

            if (!EntityMarkerRegex.IsMatch(content))
            {
                continue;
            }

            var dialect = SqlSchemaParser.DetectDialect(file, content);
            foreach (var entity in ExtractEntities(content, file, dialect))
            {
                tables[entity.Key] = tables.TryGetValue(entity.Key, out var existing)
                    && existing.Columns.Count >= entity.Columns.Count
                    ? existing
                    : entity;
            }
        }
    }

    private static IEnumerable<SqlSchemaParser.ParsedTable> ExtractEntities(
        string content,
        string filePath,
        DatabaseDialect dialect)
    {
        foreach (Match classMatch in ClassStartRegex.Matches(content))
        {
            var className = classMatch.Groups[1].Value;
            var headerStart = Math.Max(0, classMatch.Index - 600);
            var header = content[headerStart..classMatch.Index];
            if (!EntityMarkerRegex.IsMatch(header) && !header.Contains("@MappedSuperclass", StringComparison.Ordinal))
            {
                continue;
            }

            if (!TryReadClassBody(content, classMatch.Index + classMatch.Length, out var body))
            {
                continue;
            }

            var tableName = TableNameRegex.Match(header).Groups[1].Success
                ? TableNameRegex.Match(header).Groups[1].Value
                : className;
            var key = SqlSchemaParser.BuildTableKey(null, tableName);
            yield return new SqlSchemaParser.ParsedTable
            {
                Key = key,
                Name = tableName,
                EntityTypeName = className,
                Dialect = dialect,
                FilePath = filePath,
                LineNumber = content[..classMatch.Index].Count(ch => ch == '\n') + 1,
                Columns = ParseColumns(body),
                ForeignKeys = ParseForeignKeys(body)
            };
        }
    }

    private static List<SqlSchemaParser.ParsedColumn> ParseColumns(string body)
    {
        var columns = new List<SqlSchemaParser.ParsedColumn>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (Match columnMatch in ColumnNameRegex.Matches(body))
        {
            AddColumn(columns, seen, columnMatch.Groups[1].Value, false);
        }

        foreach (var segment in body.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            if (!segment.Contains("@Id", StringComparison.Ordinal))
            {
                continue;
            }

            var fieldMatch = FieldRegex.Match(segment);
            if (!fieldMatch.Success)
            {
                continue;
            }

            var columnMatch = ColumnNameRegex.Match(segment);
            var name = columnMatch.Success ? columnMatch.Groups[1].Value : fieldMatch.Groups[1].Value;
            AddColumn(columns, seen, name, true);
        }

        foreach (Match fieldMatch in FieldRegex.Matches(body))
        {
            var name = fieldMatch.Groups[1].Value;
            if (name is not "serialVersionUID")
            {
                AddColumn(columns, seen, name, false);
            }
        }

        return columns;
    }

    private static void AddColumn(List<SqlSchemaParser.ParsedColumn> columns, HashSet<string> seen, string name, bool isPrimaryKey)
    {
        if (string.IsNullOrWhiteSpace(name) || !seen.Add(name))
        {
            return;
        }

        columns.Add(new SqlSchemaParser.ParsedColumn { Name = name, IsPrimaryKey = isPrimaryKey });
    }

    private static List<SqlSchemaParser.ParsedForeignKey> ParseForeignKeys(string body) =>
        JoinColumnRegex.Matches(body).Select(m => new SqlSchemaParser.ParsedForeignKey
        {
            Column = m.Groups[1].Value,
            ReferencedTable = string.Empty,
            ReferencedColumn = m.Groups[2].Success ? m.Groups[2].Value : "id"
        }).ToList();

    private static bool TryReadClassBody(string content, int searchFrom, out string body)
    {
        body = string.Empty;
        var openIndex = content.IndexOf('{', searchFrom);
        if (openIndex < 0)
        {
            return false;
        }

        var depth = 0;
        for (var i = openIndex; i < content.Length; i++)
        {
            if (content[i] == '{')
            {
                depth++;
            }
            else if (content[i] == '}')
            {
                depth--;
                if (depth == 0)
                {
                    body = content[(openIndex + 1)..i];
                    return true;
                }
            }
        }

        return false;
    }
}
