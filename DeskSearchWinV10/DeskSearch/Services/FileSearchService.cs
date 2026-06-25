using System.Text.RegularExpressions;
using DeskSearch.Helpers;
using DeskSearch.Models;

namespace DeskSearch.Services;

public sealed class FileSearchService
{
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

    public IReadOnlyList<FileEntry> FilterRanked(
        IEnumerable<FileEntry> candidates,
        ResolvedSearchQuery searchQuery,
        bool caseSensitive,
        int limit = IndexStoragePolicy.MaxSearchResults)
    {
        if (searchQuery.IsInvalid || searchQuery.Terms.Count == 0)
            return [];

        var comparison = SearchTextHelper.GetComparison(caseSensitive);
        var nameComparer = comparison == StringComparison.Ordinal
            ? StringComparer.Ordinal
            : StringComparer.OrdinalIgnoreCase;

        return candidates
            .Select(entry => (Entry: entry, Score: ScoreEntry(entry, searchQuery.Terms, comparison)))
            .Where(match => match.Score > 0)
            .OrderByDescending(match => match.Score)
            .ThenBy(match => match.Entry.FileName, nameComparer)
            .Take(limit)
            .Select(match => match.Entry)
            .ToList();
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
        var matches = ToMatchMap(existingTop);

        var index = 0;
        var processed = 0;
        foreach (var entry in entries)
        {
            if (index++ < startOffset)
                continue;

            var score = ScoreEntry(entry, searchQuery.Terms, comparison);
            if (score > 0)
                TryAddMatch(matches, entry, score);

            processed++;
            if (processed >= batchSize)
                break;
        }

        var nextOffset = startOffset + processed;
        var topList = ToCandidateList(matches);
        return new SearchBatchResult
        {
            Results = ToSortedResults(topList, comparison),
            NextOffset = nextOffset,
            NextScanId = 0,
            IsComplete = nextOffset >= totalCount,
            TopCandidates = topList
        };
    }

    private static Dictionary<string, (FileEntry Entry, int Score)> ToMatchMap(
        List<(FileEntry Entry, int Score)>? existingTop)
    {
        if (existingTop is null || existingTop.Count == 0)
        {
            return new Dictionary<string, (FileEntry Entry, int Score)>(
                IndexStoragePolicy.MaxSearchResults,
                StringComparer.OrdinalIgnoreCase);
        }

        var map = new Dictionary<string, (FileEntry Entry, int Score)>(
            existingTop.Count,
            StringComparer.OrdinalIgnoreCase);

        foreach (var (entry, score) in existingTop)
            map[entry.FullPath] = (entry, score);

        return map;
    }

    private static List<(FileEntry Entry, int Score)> ToCandidateList(
        Dictionary<string, (FileEntry Entry, int Score)> matches) =>
        matches.Values.ToList();

    private static void TryAddMatch(
        Dictionary<string, (FileEntry Entry, int Score)> matches,
        FileEntry entry,
        int score)
    {
        if (matches.TryGetValue(entry.FullPath, out var existing))
        {
            if (score <= existing.Score)
                return;

            matches[entry.FullPath] = (entry, score);
            return;
        }

        if (matches.Count >= IndexStoragePolicy.MaxSearchResults)
            return;

        matches[entry.FullPath] = (entry, score);
    }

    private static IReadOnlyList<FileEntry> ToSortedResults(
        List<(FileEntry Entry, int Score)> top,
        StringComparison comparison)
    {
        if (top.Count <= 1)
            return top.Count == 1 ? [top[0].Entry] : [];

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
                : SearchTextHelper.ScoreLiteralEntry(
                    entry.SearchFileName,
                    entry.SearchDirectoryName,
                    term.Text,
                    comparison);

            if (score == 0)
                return 0;

            minScore = Math.Min(minScore, score);
        }

        return minScore;
    }

    private static int ScoreLiteral(FileEntry entry, string query, StringComparison comparison) =>
        SearchTextHelper.ScoreLiteralEntry(
            entry.SearchFileName,
            entry.SearchDirectoryName,
            query,
            comparison);

    private static int ScoreRegex(FileEntry entry, Regex regex)
    {
        var fileName = entry.SearchFileName;
        var fileMatch = regex.Match(fileName);
        if (!fileMatch.Success)
            return 0;

        if (fileMatch.Index == 0 && fileMatch.Length == fileName.Length)
            return 100;

        if (fileMatch.Index == 0)
            return 80;

        return 60;
    }
}
