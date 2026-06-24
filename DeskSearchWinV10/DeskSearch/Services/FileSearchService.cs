using System.Text.RegularExpressions;
using DeskSearch.Models;
using DeskSearch.Helpers;

namespace DeskSearch.Services;

public sealed class FileSearchService
{
    private const int MaxResults = 12;
    public const int DefaultBatchSize = 20_000;

    public IReadOnlyList<FileEntry> Search(
        IEnumerable<FileEntry> entries,
        string query,
        bool caseSensitive,
        bool useRegex,
        Regex? regex)
    {
        var list = entries as IReadOnlyList<FileEntry> ?? entries.ToList();
        var batch = SearchBatch(list, query, caseSensitive, useRegex, regex, startOffset: 0, batchSize: int.MaxValue);
        return batch.Results;
    }

    public SearchBatchResult SearchBatch(
        IReadOnlyList<FileEntry> entries,
        string query,
        bool caseSensitive,
        bool useRegex,
        Regex? regex,
        int startOffset,
        int batchSize,
        List<(FileEntry Entry, int Score)>? existingTop = null)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return new SearchBatchResult
            {
                Results = [],
                NextOffset = 0,
                IsComplete = true,
                TopCandidates = []
            };
        }

        if (useRegex && regex is null)
        {
            return new SearchBatchResult
            {
                Results = [],
                NextOffset = entries.Count,
                IsComplete = true,
                TopCandidates = []
            };
        }

        var trimmed = SearchTextHelper.Normalize(query.Trim());
        var comparison = SearchTextHelper.GetComparison(caseSensitive);
        var top = existingTop is null ? [] : existingTop.ToList();

        var end = Math.Min(startOffset + batchSize, entries.Count);
        for (var i = startOffset; i < end; i++)
        {
            var score = useRegex
                ? ScoreRegex(entries[i], regex!)
                : ScoreLiteral(entries[i], trimmed, comparison);

            if (score > 0)
                TryAddToTop(top, entries[i], score, comparison);
        }

        return new SearchBatchResult
        {
            Results = ToSortedResults(top, comparison),
            NextOffset = end,
            IsComplete = end >= entries.Count,
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
