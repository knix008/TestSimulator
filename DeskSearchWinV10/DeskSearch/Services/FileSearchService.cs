using System.Text.RegularExpressions;
using DeskSearch.Models;
using DeskSearch.Helpers;

namespace DeskSearch.Services;

public sealed class FileSearchService
{
    private const int MaxResults = 12;
    public const int DefaultBatchSize = IndexStoragePolicy.RegexSearchPageSize;

    public IReadOnlyList<FileEntry> Search(
        IEnumerable<FileEntry> entries,
        int totalCount,
        ResolvedSearchQuery searchQuery,
        bool caseSensitive)
    {
        var batch = SearchBatch(
            entries, totalCount, searchQuery, caseSensitive, startOffset: 0, batchSize: int.MaxValue);
        return batch.Results;
    }

    public SearchBatchResult SearchBatch(
        IEnumerable<FileEntry> entries,
        int totalCount,
        ResolvedSearchQuery searchQuery,
        bool caseSensitive,
        int startOffset,
        int batchSize,
        List<(FileEntry Entry, int Score)>? existingTop = null)
    {
        if (searchQuery.IsInvalid || searchQuery.Terms.Count == 0)
        {
            return new SearchBatchResult
            {
                Results = [],
                NextOffset = 0,
                NextScanId = 0,
                IsComplete = true,
                TopCandidates = []
            };
        }

        var comparison = SearchTextHelper.GetComparison(caseSensitive);
        var top = existingTop is null ? [] : existingTop.ToList();

        var index = 0;
        var processed = 0;
        foreach (var entry in entries)
        {
            if (index++ < startOffset)
                continue;

            var score = ScoreEntry(entry, searchQuery.Terms, comparison);
            if (score > 0)
                TryAddToTop(top, entry, score, comparison);

            processed++;
            if (processed >= batchSize)
                break;
        }

        var nextOffset = startOffset + processed;
        return new SearchBatchResult
        {
            Results = ToSortedResults(top, comparison),
            NextOffset = nextOffset,
            NextScanId = 0,
            IsComplete = nextOffset >= totalCount,
            TopCandidates = top
        };
    }

    private static void TryAddToTop(
        List<(FileEntry Entry, int Score)> top,
        FileEntry entry,
        int score,
        StringComparison comparison)
    {
        var existingIndex = top.FindIndex(x =>
            x.Entry.FullPath.Equals(entry.FullPath, StringComparison.OrdinalIgnoreCase));

        if (existingIndex >= 0)
        {
            if (score <= top[existingIndex].Score)
                return;

            top[existingIndex] = (entry, score);
        }
        else if (top.Count < MaxResults)
        {
            top.Add((entry, score));
            return;
        }
        else
        {
            var minIndex = 0;
            for (var i = 1; i < top.Count; i++)
            {
                if (top[i].Score < top[minIndex].Score)
                    minIndex = i;
            }

            if (score <= top[minIndex].Score)
                return;

            top[minIndex] = (entry, score);
        }
    }

    private static IReadOnlyList<FileEntry> ToSortedResults(
        List<(FileEntry Entry, int Score)> top,
        StringComparison comparison)
    {
        var nameComparer = comparison == StringComparison.Ordinal
            ? StringComparer.Ordinal
            : StringComparer.OrdinalIgnoreCase;

        return top
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Entry.FileName, nameComparer)
            .Select(x => x.Entry)
            .ToList();
    }

    private static int ScoreEntry(
        FileEntry entry,
        IReadOnlyList<SearchTerm> terms,
        StringComparison comparison)
    {
        if (terms.Count == 0)
            return 0;

        var minScore = int.MaxValue;

        foreach (var term in terms)
        {
            var score = term.Pattern is not null
                ? ScoreRegex(entry, term.Pattern)
                : ScoreLiteral(entry, term.Text, comparison);

            if (score == 0)
                return 0;

            minScore = Math.Min(minScore, score);
        }

        return minScore;
    }

    private static int ScoreLiteral(FileEntry entry, string query, StringComparison comparison)
    {
        var fileName = entry.SearchFileName;

        if (fileName.Equals(query, comparison))
            return 100;

        if (fileName.StartsWith(query, comparison))
            return 80;

        if (fileName.Contains(query, comparison))
            return 60;

        if (entry.SearchDirectory.Contains(query, comparison))
            return 40;

        if (entry.SearchFullPath.Contains(query, comparison))
            return 30;

        return 0;
    }

    private static int ScoreRegex(FileEntry entry, Regex regex)
    {
        var fileName = entry.SearchFileName;
        var fileMatch = regex.Match(fileName);
        if (fileMatch.Success)
        {
            if (fileMatch.Index == 0 && fileMatch.Length == fileName.Length)
                return 100;

            if (fileMatch.Index == 0)
                return 80;

            return 60;
        }

        if (regex.IsMatch(entry.SearchDirectory))
            return 40;

        if (regex.IsMatch(entry.SearchFullPath))
            return 30;

        return 0;
    }
}
