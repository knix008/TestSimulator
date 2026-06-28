namespace DeskSearch.Models;

public sealed record FileEntry(
    string FullPath,
    string FileName,
    string Directory,
    bool IsDirectory = false,
    long ModifiedUtc = 0)
{
    /// <summary>
    /// Sentinel returned by a scan transform when an entry couldn't be read (e.g. a
    /// malformed/too-long path). Callers check for this by reference, not by value, and
    /// skip it instead of indexing it.
    /// </summary>
    public static readonly FileEntry Failed = new(string.Empty, string.Empty, string.Empty);

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
