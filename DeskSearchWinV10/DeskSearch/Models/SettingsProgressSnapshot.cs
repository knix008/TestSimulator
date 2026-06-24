namespace DeskSearch.Models;

public sealed class SettingsProgressSnapshot
{
    public int Percent { get; init; }

    public string StatusText { get; init; } = string.Empty;

    public bool IsIndexing { get; init; }

    public bool IsSearching { get; init; }
}
