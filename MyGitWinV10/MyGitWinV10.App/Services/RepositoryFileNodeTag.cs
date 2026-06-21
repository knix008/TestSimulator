namespace MyGitWinV10.App.Services;

public sealed class RepositoryFileNodeTag
{
    public static readonly RepositoryFileNodeTag Placeholder = new()
    {
        IsPlaceholder = true
    };

    public bool IsPlaceholder { get; init; }

    public string RelativePath { get; init; } = string.Empty;

    public string DisplayName { get; init; } = string.Empty;

    public bool IsDirectory { get; init; }

    public bool IsMissingFromWorkTree { get; init; }
}
