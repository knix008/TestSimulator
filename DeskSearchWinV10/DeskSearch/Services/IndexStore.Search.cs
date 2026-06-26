using DeskSearch.Helpers;

using DeskSearch.Models;



namespace DeskSearch.Services;



public sealed partial class IndexStore

{

    public IReadOnlyList<FileEntry> SearchFtsScored(

        IReadOnlyList<string> normalizedTerms,

        bool caseSensitive,

        int limit = IndexStoragePolicy.MaxSearchResults) =>

        SearchSqlScored(

            normalizedTerms,

            normalizedTerms.Count > 1,

            caseSensitive,

            limit);



    public IReadOnlyList<FileEntry> SearchSqlScored(

        IReadOnlyList<string> normalizedTerms,

        bool requireAllTerms,

        bool caseSensitive,

        int limit = IndexStoragePolicy.MaxSearchResults)

    {

        if (normalizedTerms.Count == 0)

            return [];



        lock (_lock)

        {

            var whereClause = BuildLiteralWhereClause(normalizedTerms, requireAllTerms, caseSensitive);



            SetCaseSensitiveLike(caseSensitive);

            try

            {

                return ExecuteScoredSearch(

                    $"""

                    SELECT e.full_path, e.file_name, e.directory, e.is_directory

                    FROM entries e

                    WHERE {whereClause}

                    """,

                    normalizedTerms,

                    caseSensitive,

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

        IReadOnlyList<string> normalizedTerms,

        bool caseSensitive,

        int limit,

        Action<Microsoft.Data.Sqlite.SqliteCommand>? configure = null)

    {

        var scoreExpression = BuildCombinedScoreExpression(normalizedTerms.Count, caseSensitive);

        var nameOrder = caseSensitive ? "e.search_file_name" : "e.search_file_name COLLATE NOCASE";



        using var command = CreateCommand(

            $"""

            {selectFromWhere}

            AND ({scoreExpression}) > 0

            ORDER BY {scoreExpression} DESC, {nameOrder}

            LIMIT $limit

            """);



        configure?.Invoke(command);

        AddTermScoreParameters(command, normalizedTerms);

        command.Parameters.AddWithValue("$limit", limit);



        using var reader = command.ExecuteReader();

        return ReadEntries(reader, limit);

    }



    private static string BuildLiteralWhereClause(

        IReadOnlyList<string> normalizedTerms,

        bool requireAllTerms,

        bool caseSensitive)

    {

        var joiner = requireAllTerms ? " AND " : " OR ";

        var groups = new List<string>(normalizedTerms.Count);



        for (var i = 0; i < normalizedTerms.Count; i++)

            groups.Add(BuildContainsWhereClause(i, caseSensitive, normalizedTerms[i].Length));



        return string.Join(joiner, groups);

    }



    // Trigram FTS (>=3 chars) narrows candidates; the score expression re-checks

    // entries.search_file_name so only the full contiguous term matches.

    private static string BuildContainsWhereClause(int index, bool caseSensitive, int termLength)

    {

        var likeCollate = caseSensitive ? string.Empty : " COLLATE NOCASE";



        if (termLength >= 3)

        {

            return $"""

                e.id IN (SELECT rowid FROM entries_fts WHERE search_file_name LIKE $q{index}c ESCAPE '\')

                """;

        }



        return $"e.search_file_name LIKE $q{index}c ESCAPE '\\'{likeCollate}";

    }



    private static string BuildCombinedScoreExpression(int termCount, bool caseSensitive)

    {

        if (termCount == 1)

            return BuildTermScoreExpression(0, caseSensitive);



        var termScores = new string[termCount];

        for (var i = 0; i < termCount; i++)

            termScores[i] = BuildTermScoreExpression(i, caseSensitive);



        return termCount switch

        {

            2 => $"MIN({termScores[0]}, {termScores[1]})",

            3 => $"MIN({termScores[0]}, {termScores[1]}, {termScores[2]})",

            _ => $"MIN({string.Join(", ", termScores)})"

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

        IReadOnlyList<string> normalizedTerms)

    {

        for (var i = 0; i < normalizedTerms.Count; i++)

        {

            var term = normalizedTerms[i];

            var escaped = EscapeLike(term);

            command.Parameters.AddWithValue($"$q{i}", term);

            command.Parameters.AddWithValue($"$q{i}p", escaped + "%");

            command.Parameters.AddWithValue($"$q{i}c", "%" + escaped + "%");

        }

    }



    private static string EscapeLike(string value) =>

        value.Replace("\\", "\\\\", StringComparison.Ordinal)

            .Replace("%", "\\%", StringComparison.Ordinal)

            .Replace("_", "\\_", StringComparison.Ordinal);

}

