using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Database.Schema;

public static class SqlFileSchemaExtractor
{
    private static readonly HashSet<string> SqlExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".sql", ".mysql", ".pgsql", ".psql", ".sqlite", ".ddl"
    };

    public static IReadOnlyList<(string FilePath, int LineOffset, string Sql, DatabaseDialect Dialect)> CollectScripts(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var scripts = new List<(string, int, string, DatabaseDialect)>();

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (!SqlExtensions.Contains(Path.GetExtension(file)))
            {
                continue;
            }

            try
            {
                var sql = File.ReadAllText(file);
                var dialect = SqlSchemaParser.DetectDialect(file, sql);
                scripts.Add((file, 0, sql, dialect));
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip unreadable
            }
        }

        return scripts;
    }
}
