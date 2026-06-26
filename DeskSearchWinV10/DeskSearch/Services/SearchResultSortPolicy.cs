using DeskSearch.Models;

namespace DeskSearch.Services;

internal static class SearchResultSortPolicy
{
    public static readonly SearchResultSortOrder[] All =
    [
        SearchResultSortOrder.MatchQuality,
        SearchResultSortOrder.NameAsc,
        SearchResultSortOrder.NameDesc,
        SearchResultSortOrder.PathAsc,
        SearchResultSortOrder.PathDesc,
        SearchResultSortOrder.FoldersFirst,
        SearchResultSortOrder.FilesFirst
    ];

    public static SearchResultSortOrder Normalize(SearchResultSortOrder value) =>
        All.Contains(value) ? value : SearchResultSortOrder.MatchQuality;

    public static string BuildSqlOrderBy(
        SearchResultSortOrder sort,
        bool caseSensitive,
        string scoreExpression)
    {
        sort = Normalize(sort);
        var name = caseSensitive ? "e.search_file_name" : "e.search_file_name COLLATE NOCASE";
        var path = caseSensitive ? "e.full_path" : "e.full_path COLLATE NOCASE";

        return sort switch
        {
            SearchResultSortOrder.NameAsc => $"{name}, {path}",
            SearchResultSortOrder.NameDesc => $"{name} DESC, {path} DESC",
            SearchResultSortOrder.PathAsc => $"{path}, {name}",
            SearchResultSortOrder.PathDesc => $"{path} DESC, {name} DESC",
            SearchResultSortOrder.FoldersFirst => $"e.is_directory DESC, {name}, {path}",
            SearchResultSortOrder.FilesFirst => $"e.is_directory ASC, {name}, {path}",
            _ => $"{scoreExpression} DESC, {name}"
        };
    }

    public static IReadOnlyList<FileEntry> SortScored(
        IEnumerable<(FileEntry Entry, int Score)> items,
        SearchResultSortOrder sort,
        StringComparison comparison)
    {
        var list = items as IList<(FileEntry Entry, int Score)> ?? items.ToList();
        if (list.Count <= 1)
            return list.Count == 1 ? [list[0].Entry] : [];

        sort = Normalize(sort);
        var nameComparer = comparison == StringComparison.Ordinal
            ? StringComparer.Ordinal
            : StringComparer.OrdinalIgnoreCase;
        var pathComparer = nameComparer;

        IEnumerable<(FileEntry Entry, int Score)> ordered = sort switch
        {
            SearchResultSortOrder.NameAsc => list
                .OrderBy(x => x.Entry.FileName, nameComparer)
                .ThenBy(x => x.Entry.FullPath, pathComparer),
            SearchResultSortOrder.NameDesc => list
                .OrderByDescending(x => x.Entry.FileName, nameComparer)
                .ThenByDescending(x => x.Entry.FullPath, pathComparer),
            SearchResultSortOrder.PathAsc => list
                .OrderBy(x => x.Entry.FullPath, pathComparer)
                .ThenBy(x => x.Entry.FileName, nameComparer),
            SearchResultSortOrder.PathDesc => list
                .OrderByDescending(x => x.Entry.FullPath, pathComparer)
                .ThenByDescending(x => x.Entry.FileName, nameComparer),
            SearchResultSortOrder.FoldersFirst => list
                .OrderByDescending(x => x.Entry.IsDirectory)
                .ThenBy(x => x.Entry.FileName, nameComparer)
                .ThenBy(x => x.Entry.FullPath, pathComparer),
            SearchResultSortOrder.FilesFirst => list
                .OrderBy(x => x.Entry.IsDirectory)
                .ThenBy(x => x.Entry.FileName, nameComparer)
                .ThenBy(x => x.Entry.FullPath, pathComparer),
            _ => list
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Entry.FileName, nameComparer)
        };

        return ordered.Select(x => x.Entry).ToList();
    }

    public static string GetLabelKey(SearchResultSortOrder sort) =>
        $"Settings_SearchResultSort_{Normalize(sort)}";
}
