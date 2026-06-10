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

            foreach (var (lineOffset, sql) in ExtractCombinedSqlLiterals(content))
            {
                var dialect = SqlSchemaParser.DetectDialect(file, sql);
                scripts.Add((file, lineOffset, sql, dialect));
            }
        }

        return scripts;
    }

    // Yields SQL strings by collecting adjacent string literals together.
    // C/C++ (and similar languages) implicitly concatenate adjacent string literals:
    //   "CREATE TABLE t (" "  id INT" ")" → "CREATE TABLE t (  id INT)"
    // Processing each piece in isolation would leave the CREATE TABLE body incomplete.
    private static IEnumerable<(int LineOffset, string Sql)> ExtractCombinedSqlLiterals(string content)
    {
        var matches = SqlPatternHelper.StringLiteralRegex.Matches(content)
            .Cast<Match>()
            .ToArray();

        for (var i = 0; i < matches.Length; i++)
        {
            if (!SqlPatternHelper.TryUnwrapSqlLiteral(matches[i].Value, out var first)
                || !CreateTableHintRegex.IsMatch(first))
            {
                continue;
            }

            // Accumulate any adjacent literals (C-style implicit concatenation).
            // Only combine when the gap between two consecutive match spans is pure whitespace.
            var combined = first;
            var lastEnd = matches[i].Index + matches[i].Length;

            for (var j = i + 1; j < matches.Length; j++)
            {
                var gap = content[lastEnd..matches[j].Index];
                if (!string.IsNullOrWhiteSpace(gap))
                    break;

                if (!SqlPatternHelper.TryUnwrapSqlLiteral(matches[j].Value, out var part))
                    break;

                combined += part;
                lastEnd = matches[j].Index + matches[j].Length;
            }

            var lineOffset = content[..matches[i].Index].Count(ch => ch == '\n');
            yield return (lineOffset, SqlPatternHelper.NormalizeSqlLiteralEscapes(combined));
        }
    }
}
