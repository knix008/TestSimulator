using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

/// <summary>
/// Caches unpushed file paths until HEAD or the upstream tip changes.
/// </summary>
public sealed class UnpushedPathsCache
{
    private string? _headSha;
    private string? _upstreamSha;
    private HashSet<string>? _paths;

    public IReadOnlyCollection<string> Get(Repository repo)
    {
        string? headSha = repo.Head?.Tip?.Sha;
        string? upstreamSha = GitOperationDetails.ResolveUpstreamBranch(repo)?.Tip?.Sha;

        if (_paths is not null
            && string.Equals(_headSha, headSha, StringComparison.OrdinalIgnoreCase)
            && string.Equals(_upstreamSha, upstreamSha, StringComparison.OrdinalIgnoreCase))
        {
            return _paths;
        }

        var paths = new HashSet<string>(
            GitOperationDetails.GetUnpushedFilePaths(repo),
            StringComparer.OrdinalIgnoreCase);
        _headSha = headSha;
        _upstreamSha = upstreamSha;
        _paths = paths;
        return _paths;
    }

    public void Invalidate()
    {
        _headSha = null;
        _upstreamSha = null;
        _paths = null;
    }
}
