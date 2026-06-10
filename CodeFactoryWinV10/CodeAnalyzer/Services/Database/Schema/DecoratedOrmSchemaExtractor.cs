using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Database.Schema;

/// <summary>TypeORM·Sequelize 데코레이터에서 ERD 테이블을 추출합니다 (JavaScript/TypeScript).</summary>
internal static class DecoratedOrmSchemaExtractor
{
    private static readonly Regex TypeOrmEntityRegex = new(
        @"@Entity\s*\(\s*(?:['""`](\w+)['""`]|(?:\{[^}]*\bname\s*:\s*['""`](\w+)['""`]))?\s*\)[\s\S]*?(?:export\s+)?class\s+(\w+)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex TypeOrmEntityBareRegex = new(
        @"@Entity\s*\(\s*\)[\s\S]*?(?:export\s+)?class\s+(\w+)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex TypeOrmColumnRegex = new(
        @"@(?:Column|PrimaryColumn)\s*\(\s*(?:\{[^}]*name\s*:\s*['""`](\w+)['""`][^}]*\}|['""`](\w+)['""`])?\s*\)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex SequelizeDefineRegex = new(
        @"\.define\s*\(\s*['""`](\w+)['""`]\s*,\s*\{",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex ObjectKeyRegex = new(
        @"^\s*(\w+)\s*:",
        RegexOptions.Compiled | RegexOptions.Multiline);

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

            var dialect = SqlSchemaParser.DetectDialect(file, content);
            foreach (var table in ExtractTypeOrmEntities(content, file, dialect))
            {
                MergeTable(tables, table);
            }

            foreach (var table in ExtractSequelizeModels(content, file, dialect))
            {
                MergeTable(tables, table);
            }
        }
    }

    private static IEnumerable<SqlSchemaParser.ParsedTable> ExtractTypeOrmEntities(
        string content,
        string filePath,
        DatabaseDialect dialect)
    {
        foreach (Match match in TypeOrmEntityRegex.Matches(content))
        {
            var tableName = match.Groups[1].Success ? match.Groups[1].Value
                : match.Groups[2].Success ? match.Groups[2].Value
                : match.Groups[3].Value;
            var className = match.Groups[3].Value;
            if (!TryReadBalancedBody(content, match.Index + match.Length, '{', '}', out var body))
            {
                continue;
            }

            yield return BuildTable(filePath, dialect, tableName, className, body, content[..match.Index].Count(ch => ch == '\n') + 1);
        }

        foreach (Match match in TypeOrmEntityBareRegex.Matches(content))
        {
            var className = match.Groups[1].Value;
            if (!TryReadBalancedBody(content, match.Index + match.Length, '{', '}', out var body))
            {
                continue;
            }

            yield return BuildTable(filePath, dialect, className, className, body, content[..match.Index].Count(ch => ch == '\n') + 1);
        }
    }

    private static SqlSchemaParser.ParsedTable BuildTable(
        string filePath,
        DatabaseDialect dialect,
        string tableName,
        string className,
        string body,
        int lineNumber)
    {
        var key = SqlSchemaParser.BuildTableKey(null, tableName);
        return new SqlSchemaParser.ParsedTable
        {
            Key = key,
            Name = tableName,
            EntityTypeName = className,
            Dialect = dialect,
            FilePath = filePath,
            LineNumber = lineNumber,
            Columns = ParseTypeOrmColumns(body, className)
        };
    }

    private static IEnumerable<SqlSchemaParser.ParsedTable> ExtractSequelizeModels(
        string content,
        string filePath,
        DatabaseDialect dialect)
    {
        foreach (Match match in SequelizeDefineRegex.Matches(content))
        {
            var tableName = match.Groups[1].Value;
            if (!TryReadBalancedBody(content, match.Index + match.Length - 1, '{', '}', out var body))
            {
                continue;
            }

            var columns = ObjectKeyRegex.Matches(body).Cast<Match>()
                .Select(m => m.Groups[1].Value)
                .Where(name => name is not ("type" or "allowNull" or "primaryKey" or "autoIncrement" or "references" or "onUpdate" or "onDelete"))
                .Select(name => new SqlSchemaParser.ParsedColumn { Name = name })
                .ToList();

            var key = SqlSchemaParser.BuildTableKey(null, tableName);
            yield return new SqlSchemaParser.ParsedTable
            {
                Key = key,
                Name = tableName,
                Dialect = dialect,
                FilePath = filePath,
                LineNumber = content[..match.Index].Count(ch => ch == '\n') + 1,
                Columns = columns
            };
        }
    }

    private static List<SqlSchemaParser.ParsedColumn> ParseTypeOrmColumns(string body, string className)
    {
        var columns = new List<SqlSchemaParser.ParsedColumn>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (Match match in TypeOrmColumnRegex.Matches(body))
        {
            var name = match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
            if (!string.IsNullOrWhiteSpace(name) && seen.Add(name))
            {
                columns.Add(new SqlSchemaParser.ParsedColumn
                {
                    Name = name,
                    IsPrimaryKey = match.Value.Contains("PrimaryColumn", StringComparison.OrdinalIgnoreCase)
                });
            }
        }

        foreach (Match match in Regex.Matches(body, @"^\s*(\w+)\s*(?:!)?\s*:\s*", RegexOptions.Multiline))
        {
            var name = match.Groups[1].Value;
            if (name is not "constructor" && seen.Add(name))
            {
                columns.Add(new SqlSchemaParser.ParsedColumn { Name = name });
            }
        }

        if (columns.Count == 0)
        {
            columns.Add(new SqlSchemaParser.ParsedColumn { Name = "id", IsPrimaryKey = true });
        }

        return columns;
    }

    private static void MergeTable(Dictionary<string, SqlSchemaParser.ParsedTable> tables, SqlSchemaParser.ParsedTable table)
    {
        if (tables.TryGetValue(table.Key, out var existing))
        {
            tables[table.Key] = existing.Columns.Count >= table.Columns.Count ? existing : table;
        }
        else
        {
            tables[table.Key] = table;
        }
    }

    private static bool TryReadBalancedBody(string content, int searchFrom, char openChar, char closeChar, out string body)
    {
        body = string.Empty;
        var openIndex = content.IndexOf(openChar, Math.Max(0, searchFrom));
        if (openIndex < 0)
        {
            return false;
        }

        var depth = 0;
        for (var i = openIndex; i < content.Length; i++)
        {
            if (content[i] == openChar)
            {
                depth++;
            }
            else if (content[i] == closeChar)
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
