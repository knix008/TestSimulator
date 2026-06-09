using System.Text.RegularExpressions;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Database;

namespace CodeAnalyzer.Services.Database.Schema;

public static class SqlInCodeSchemaExtractor
{
    private static readonly Regex CreateTableHintRegex = new(
        @"CREATE\s+TABLE",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static IReadOnlyList<(string FilePath, int LineOffset, string Sql, DatabaseDialect Dialect)> ExtractFromSourceFiles(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var scripts = new List<(string, int, string, DatabaseDialect)>();

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (Path.GetExtension(file).Equals(".sql", StringComparison.OrdinalIgnoreCase)
                || Path.GetExtension(file).Equals(".ddl", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            string content;
            try
            {
                content = File.ReadAllText(file);
            }
            catch (Exception)
            {
                continue;
            }

            if (!CreateTableHintRegex.IsMatch(content))
            {
                continue;
            }

            foreach (Match match in SqlPatternHelper.StringLiteralRegex.Matches(content))
            {
                if (!SqlPatternHelper.TryUnwrapSqlLiteral(match.Value, out var literal)
                    || !CreateTableHintRegex.IsMatch(literal))
                {
                    continue;
                }

                var dialect = SqlSchemaParser.DetectDialect(file, SqlPatternHelper.NormalizeSqlLiteralEscapes(literal));
                var lineOffset = content[..match.Index].Count(ch => ch == '\n');
                scripts.Add((file, lineOffset, SqlPatternHelper.NormalizeSqlLiteralEscapes(literal), dialect));
            }
        }

        return scripts;
    }
}
