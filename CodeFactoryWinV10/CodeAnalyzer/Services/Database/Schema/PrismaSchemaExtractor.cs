using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Database.Schema;

/// <summary>Prisma <c>schema.prisma</c>의 <c>model</c> 정의에서 ERD 테이블을 추출합니다.</summary>
internal static class PrismaSchemaExtractor
{
    private static readonly Regex ModelStartRegex = new(@"model\s+(\w+)\s*\{", RegexOptions.Compiled);
    private static readonly Regex FieldLineRegex = new(@"^\s*(\w+)\s+(\w+)", RegexOptions.Compiled | RegexOptions.Multiline);
    private static readonly Regex RelationRegex = new(
        @"@relation\s*\(\s*fields\s*:\s*\[\s*(\w+)\s*\]\s*,\s*references\s*:\s*\[\s*(\w+)\s*\]",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex MapTableRegex = new(
        @"@@map\s*\(\s*[""'](\w+)[""']\s*\)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static void Extract(
        IReadOnlyList<string> prismaFiles,
        Dictionary<string, SqlSchemaParser.ParsedTable> tables,
        CancellationToken cancellationToken = default)
    {
        foreach (var file in prismaFiles)
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
            foreach (Match modelMatch in ModelStartRegex.Matches(content))
            {
                if (!TryReadModelBody(content, modelMatch.Index + modelMatch.Length - 1, out var body))
                {
                    continue;
                }

                var modelName = modelMatch.Groups[1].Value;
                var tableName = MapTableRegex.Match(body).Groups[1].Success
                    ? MapTableRegex.Match(body).Groups[1].Value
                    : ToSnakeCase(modelName);
                var key = SqlSchemaParser.BuildTableKey(null, tableName);
                var parsed = new SqlSchemaParser.ParsedTable
                {
                    Key = key,
                    Name = tableName,
                    EntityTypeName = modelName,
                    Dialect = dialect,
                    FilePath = file,
                    LineNumber = content[..modelMatch.Index].Count(ch => ch == '\n') + 1,
                    Columns = ParseColumns(body),
                    ForeignKeys = ParseForeignKeys(body),
                    DbSetPropertyNames = [modelName, modelName.ToLowerInvariant()]
                };

                tables[key] = tables.TryGetValue(key, out var existing) && existing.Columns.Count >= parsed.Columns.Count
                    ? existing
                    : parsed;
            }
        }
    }

    private static List<SqlSchemaParser.ParsedColumn> ParseColumns(string body)
    {
        var columns = new List<SqlSchemaParser.ParsedColumn>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var line in body.Split('\n'))
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0 || trimmed.StartsWith("//", StringComparison.Ordinal) || trimmed.StartsWith("@@", StringComparison.Ordinal))
            {
                continue;
            }

            var match = FieldLineRegex.Match(line);
            if (!match.Success)
            {
                continue;
            }

            var fieldName = match.Groups[1].Value;
            var fieldType = match.Groups[2].Value;
            if (fieldType is "model" or "enum" || !seen.Add(fieldName))
            {
                continue;
            }

            columns.Add(new SqlSchemaParser.ParsedColumn
            {
                Name = fieldName,
                DataType = fieldType.TrimEnd('?'),
                IsPrimaryKey = trimmed.Contains("@id", StringComparison.OrdinalIgnoreCase),
                IsNullable = fieldType.EndsWith("?", StringComparison.Ordinal)
            });
        }

        return columns;
    }

    private static List<SqlSchemaParser.ParsedForeignKey> ParseForeignKeys(string body) =>
        RelationRegex.Matches(body).Select(m => new SqlSchemaParser.ParsedForeignKey
        {
            Column = m.Groups[1].Value,
            ReferencedTable = string.Empty,
            ReferencedColumn = m.Groups[2].Value
        }).ToList();

    private static bool TryReadModelBody(string content, int openBraceIndex, out string body)
    {
        body = string.Empty;
        if (openBraceIndex < 0 || openBraceIndex >= content.Length || content[openBraceIndex] != '{')
        {
            return false;
        }

        var depth = 0;
        for (var i = openBraceIndex; i < content.Length; i++)
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
                    body = content[(openBraceIndex + 1)..i];
                    return true;
                }
            }
        }

        return false;
    }

    private static string ToSnakeCase(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        var chars = new List<char>(value.Length + 4);
        for (var i = 0; i < value.Length; i++)
        {
            if (char.IsUpper(value[i]) && i > 0)
            {
                chars.Add('_');
            }

            chars.Add(char.ToLowerInvariant(value[i]));
        }

        return new string(chars.ToArray());
    }
}
