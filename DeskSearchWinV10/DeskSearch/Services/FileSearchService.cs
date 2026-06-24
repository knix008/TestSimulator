using DeskSearch.Models;

namespace DeskSearch.Services;

public sealed class FileSearchService
{
    private const int MaxResults = 12;

    public IReadOnlyList<FileEntry> Search(IEnumerable<FileEntry> entries, string query)
    {
        if (string.IsNullOrWhiteSpace(query))
            return [];

        var trimmed = query.Trim();

        return entries
            .Select(entry => (entry, score: Score(entry, trimmed)))
            .Where(x => x.score > 0)
            .OrderByDescending(x => x.score)
            .ThenBy(x => x.entry.FileName, StringComparer.OrdinalIgnoreCase)
            .Take(MaxResults)
            .Select(x => x.entry)
            .ToList();
    }

    private static int Score(FileEntry entry, string query)
    {
        var fileName = entry.FileName;
        var comparison = StringComparison.OrdinalIgnoreCase;

        if (fileName.Equals(query, comparison))
            return 100;

        if (fileName.StartsWith(query, comparison))
            return 80;

        if (fileName.Contains(query, comparison))
            return 60;

        if (entry.Directory.Contains(query, comparison))
            return 40;

        return 0;
    }
}
