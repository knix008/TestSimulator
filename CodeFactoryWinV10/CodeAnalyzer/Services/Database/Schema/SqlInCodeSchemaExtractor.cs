using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Database.Schema;

public static class SqlInCodeSchemaExtractor
{
    private static readonly Regex SqlStringRegex = new(
        @"@?""(?<s>(?:\\.|[^""\\])*)""|@?'(?<s>(?:\\.|[^'\\])*)'",
        RegexOptions.Compiled | RegexOptions.Singleline);

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

            var lineOffset = 0;
            foreach (Match match in SqlStringRegex.Matches(content))
            {
                var literal = Unescape(match.Groups["s"].Value);
                if (!CreateTableHintRegex.IsMatch(literal))
                {
                    continue;
                }

                var dialect = SqlSchemaParser.DetectDialect(file, literal);
                var before = content[..match.Index];
                lineOffset = before.Count(ch => ch == '\n');
                scripts.Add((file, lineOffset, literal, dialect));
            }
        }

        return scripts;
    }

    private static string Unescape(string value) =>
        value.Replace("\\\"", "\"", StringComparison.Ordinal)
            .Replace("\\n", "\n", StringComparison.Ordinal)
            .Replace("\\r", "\r", StringComparison.Ordinal)
            .Replace("\\t", "\t", StringComparison.Ordinal);
}
