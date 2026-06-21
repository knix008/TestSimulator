namespace MyGitWinV10.App.Services;

public sealed class GitStatusEntry
{
    public string FilePath { get; init; } = string.Empty;

    public string Staged { get; init; } = string.Empty;

    public string WorkTree { get; init; } = string.Empty;
}
