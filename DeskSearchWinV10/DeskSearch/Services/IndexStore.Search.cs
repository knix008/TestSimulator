using DeskSearch.Helpers;
using DeskSearch.Models;

namespace DeskSearch.Services;

public sealed partial class IndexStore
{
    public IReadOnlyList<FileEntry> SearchSqlScored(
        ResolvedSearchQuery query,
        bool caseSensitive,
        SearchResultSortOrder sortOrder,
        int limit = IndexStoragePolicy.MaxSearchResults)
    {
        if (query.IsInvalid || query.Terms.Count == 0)
            return [];

        lock (_lock)
        {
            var whereClause = BuildLiteralWhereClause(query, caseSensitive);

            SetCaseSensitiveLike(caseSensitive);
            try
            {
                return ExecuteScoredSearch(
                    $"""
                    SELECT e.full_path, e.file_name, e.directory, e.is_directory, e.modified_utc
                    FROM entries e
                    WHERE {whereClause}
                    """,
                    query,
                    caseSensitive,
                    sortOrder,
                    limit);
            }
            finally
            {
                SetCaseSensitiveLike(false);
            }
        }
    }

    private void SetCaseSensitiveLike(bool enabled) =>
        ExecuteNonQuery(enabled ? "PRAGMA case_sensitive_like=ON" : "PRAGMA case_sensitive_like=OFF");

    private IReadOnlyList<FileEntry> ExecuteScoredSearch(
        string selectFromWhere,
        ResolvedSearchQuery query,
        bool caseSensitive,
        SearchResultSortOrder sortOrder,
        int limit,
        Action<Microsoft.Data.Sqlite.SqliteCommand>? configure = null)
    {
        var scoreExpression = BuildCombinedScoreExpression(query, caseSensitive);
        var orderBy = SearchResultSortPolicy.BuildSqlOrderBy(sortOrder, caseSensitive, scoreExpression);

        using var command = CreateCommand(
            $"""
            {selectFromWhere}
            AND ({scoreExpression}) > 0
            ORDER BY {orderBy}
            LIMIT $limit
            """);

        configure?.Invoke(command);
        AddTermScoreParameters(command, query);
        command.Parameters.AddWithValue("$limit", limit);

        using var reader = command.ExecuteReader();
        return ReadEntries(reader, limit);
    }

    private static string BuildLiteralWhereClause(ResolvedSearchQuery query, bool caseSensitive)
    {
        var groupClauses = new List<string>(query.OrGroups.Count);
        var termIndex = 0;

        foreach (var group in query.OrGroups)
        {
            var andClauses = new List<string>(group.Terms.Count);
            foreach (var term in group.Terms)
            {
                andClauses.Add(BuildContainsWhereClause(termIndex, term, caseSensitive));
                termIndex++;
            }

            groupClauses.Add(andClauses.Count == 1
                ? andClauses[0]
                : $"({string.Join(" AND ", andClauses)})");
        }

        return groupClauses.Count == 1
            ? groupClauses[0]
            : string.Join(" OR ", groupClauses);
    }

    private static string BuildContainsWhereClause(int index, SearchTerm term, bool caseSensitive)
    {
        var likeCollate = caseSensitive ? string.Empty : " COLLATE NOCASE";

        if (term.Pattern is not null)
        {
            return $"e.search_file_name LIKE $q{index}c ESCAPE '\\'{likeCollate}";
        }

        if (term.NormalizedText.Length >= 3)
        {
            return $"""
                e.id IN (SELECT rowid FROM entries_fts WHERE search_file_name LIKE $q{index}c ESCAPE '\')
                """;
        }

        return $"e.search_file_name LIKE $q{index}c ESCAPE '\\'{likeCollate}";
    }

    private static string BuildCombinedScoreExpression(ResolvedSearchQuery query, bool caseSensitive)
    {
        var groupScores = new List<string>(query.OrGroups.Count);
        var termIndex = 0;

        foreach (var group in query.OrGroups)
        {
            if (group.Terms.Count == 1)
            {
                groupScores.Add(BuildTermScoreExpression(termIndex++, caseSensitive));
                continue;
            }

            var termScores = new string[group.Terms.Count];
            for (var i = 0; i < group.Terms.Count; i++)
                termScores[i] = BuildTermScoreExpression(termIndex++, caseSensitive);

            groupScores.Add(group.Terms.Count switch
            {
                2 => $"MIN({termScores[0]}, {termScores[1]})",
                3 => $"MIN({termScores[0]}, {termScores[1]}, {termScores[2]})",
                _ => $"MIN({string.Join(", ", termScores)})"
            });
        }

        if (groupScores.Count == 1)
            return groupScores[0];

        return groupScores.Count switch
        {
            2 => $"MAX({groupScores[0]}, {groupScores[1]})",
            3 => $"MAX({groupScores[0]}, {groupScores[1]}, {groupScores[2]})",
            _ => $"MAX({string.Join(", ", groupScores)})"
        };
    }

    private static string BuildTermScoreExpression(int index, bool caseSensitive)
    {
        var eqCollate = caseSensitive ? string.Empty : " COLLATE NOCASE";
        var likeCollate = caseSensitive ? string.Empty : " COLLATE NOCASE";

        return $"""
            CASE
                WHEN e.search_file_name = $q{index}{eqCollate} THEN 100
                WHEN e.search_file_name LIKE $q{index}p ESCAPE '\'{likeCollate} THEN 80
                WHEN e.search_file_name LIKE $q{index}c ESCAPE '\'{likeCollate} THEN 60
                ELSE 0
            END
            """;
    }

    private static void AddTermScoreParameters(
        Microsoft.Data.Sqlite.SqliteCommand command,
        ResolvedSearchQuery query)
    {
        var termIndex = 0;
        foreach (var group in query.OrGroups)
        {
            foreach (var term in group.Terms)
            {
                if (term.Pattern is not null)
                {
                    var (exact, prefixLike, containsLike) =
                        SearchTextHelper.GetWildcardLikePatterns(term.Text);

                    command.Parameters.AddWithValue($"$q{termIndex}", exact ?? string.Empty);
                    command.Parameters.AddWithValue($"$q{termIndex}p", prefixLike);
                    command.Parameters.AddWithValue($"$q{termIndex}c", containsLike);
                }
                else
                {
                    var normalized = term.NormalizedText;
                    var escaped = EscapeLike(normalized);
                    command.Parameters.AddWithValue($"$q{termIndex}", normalized);
                    command.Parameters.AddWithValue($"$q{termIndex}p", escaped + "%");
                    command.Parameters.AddWithValue($"$q{termIndex}c", "%" + escaped + "%");
                }

                termIndex++;
            }
        }
    }

    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}
