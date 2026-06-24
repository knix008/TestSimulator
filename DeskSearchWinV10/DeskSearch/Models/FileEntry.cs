namespace DeskSearch.Models;

public sealed record FileEntry(string FullPath, string FileName, string Directory, bool IsDirectory = false)
{
    public string SearchFileName { get; } = Helpers.SearchTextHelper.Normalize(FileName);

    public string SearchDirectory { get; } = Helpers.SearchTextHelper.Normalize(Directory);
}
