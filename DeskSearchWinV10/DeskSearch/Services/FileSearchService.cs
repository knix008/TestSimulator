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
        bool caseSensitive,
        SearchResultSortOrder sortOrder)
    {
        var batch = SearchBatch(
            entries, totalCount, searchQuery, caseSensitive, sortOrder,
            startOffset: 0, batchSize: int.MaxValue);
        return batch.Results;
    }

    public IReadOnlyList<FileEntry> FilterRanked(
        IEnumerable<FileEntry> candidates,
        ResolvedSearchQuery searchQuery,
        bool caseSensitive,
        SearchResultSortOrder sortOrder,
        int limit = IndexStoragePolicy.MaxSearchResults)
    {
        if (searchQuery.IsInvalid || searchQuery.Terms.Count == 0)
            return [];

        var comparison = SearchTextHelper.GetComparison(caseSensitive);

        return SearchResultSortPolicy.SortScored(
            candidates
                .Select(entry => (Entry: entry, Score: ScoreQuery(entry, searchQuery, comparison)))
                .Where(match => match.Score > 0)
                .Take(limit),
            sortOrder,
            comparison);
    }

    public SearchBatchResult SearchBatch(
        IEnumerable<FileEntry> entries,
        int totalCount,
        ResolvedSearchQuery searchQuery,
        bool caseSensitive,
        SearchResultSortOrder sortOrder,
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

            var score = ScoreQuery(entry, searchQuery, comparison);
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
            Results = ToSortedResults(topList, sortOrder, comparison),
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

        if (matches.Count < IndexStoragePolicy.MaxSearchResults)
        {
            matches[entry.FullPath] = (entry, score);
            return;
        }

        var weakestPath = string.Empty;
        var weakestScore = int.MaxValue;
        foreach (var (path, candidate) in matches)
        {
            if (candidate.Score >= weakestScore)
                continue;

            weakestScore = candidate.Score;
            weakestPath = path;
        }

        if (weakestPath.Length > 0 && score > weakestScore)
        {
            matches.Remove(weakestPath);
            matches[entry.FullPath] = (entry, score);
        }
    }

    private static IReadOnlyList<FileEntry> ToSortedResults(
        List<(FileEntry Entry, int Score)> top,
        SearchResultSortOrder sortOrder,
        StringComparison comparison) =>
        SearchResultSortPolicy.SortScored(top, sortOrder, comparison);

    private static int ScoreQuery(
        FileEntry entry,
        ResolvedSearchQuery query,
        StringComparison comparison)
    {
        if (query.OrGroups.Count == 0)
            return 0;

        var best = 0;
        foreach (var group in query.OrGroups)
        {
            var groupScore = ScoreAndGroup(entry, group.Terms, comparison);
            if (groupScore > best)
                best = groupScore;
        }

        return best;
    }

    private static int ScoreAndGroup(
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
                : SearchTextHelper.ScoreLiteralEntry(entry.SearchFileName, term.NormalizedText, comparison);

            if (score == 0)
                return 0;

            minScore = Math.Min(minScore, score);
        }

        return minScore;
    }

    private static int ScoreLiteral(FileEntry entry, string query, StringComparison comparison) =>
        SearchTextHelper.ScoreLiteralEntry(entry.SearchFileName, query, comparison);

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
