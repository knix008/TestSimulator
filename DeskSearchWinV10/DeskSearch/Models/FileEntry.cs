namespace DeskSearch.Models;

public sealed record FileEntry(
    string FullPath,
    string FileName,
    string Directory,
    bool IsDirectory = false,
    long ModifiedUtc = 0)
{
    public string DirectoryName { get; } = ResolveDirectoryName(Directory);

    public string SearchFileName { get; } = Helpers.SearchTextHelper.Normalize(FileName);

    /// <summary>Parent folder name stored for indexing metadata only; not used in search.</summary>
    public string SearchDirectoryName { get; } =
        Helpers.SearchTextHelper.NormalizeParentDirectoryName(Directory);

    internal static string ResolveDirectoryName(string directory)
    {
        if (string.IsNullOrWhiteSpace(directory))
            return string.Empty;

        var trimmed = directory.TrimEnd('\\', '/');
        var name = Path.GetFileName(trimmed);
        return string.IsNullOrEmpty(name) ? trimmed : name;
    }
}
