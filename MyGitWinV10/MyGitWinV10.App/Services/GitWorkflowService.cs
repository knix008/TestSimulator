using LibGit2Sharp;
using LibGit2Sharp.Handlers;

namespace MyGitWinV10.App.Services;

public static class GitWorkflowService
{
    public static bool CanUseWorkflow(Repository repo, bool isRemoteBrowse) =>
        !isRemoteBrowse
        && !repo.Info.IsBare
        && !string.IsNullOrWhiteSpace(repo.Info.WorkingDirectory);

    public static bool HasOriginRemote(Repository repo) =>
        repo.Network.Remotes["origin"] is not null;

    public static bool HasStagedChanges(Repository repo) =>
        repo.RetrieveStatus(new StatusOptions()).Any(entry => IsStaged(entry.State));

    public static IReadOnlyList<string> GetStagedPaths(Repository repo) =>
        repo.RetrieveStatus(new StatusOptions())
            .Where(entry => IsStaged(entry.State))
            .Select(entry => entry.FilePath)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static void Stage(Repository repo, string relativePath, bool isDirectory)
    {
        if (string.IsNullOrEmpty(relativePath))
        {
            Commands.Stage(repo, "*");
            return;
        }

        string gitPath = PathCommitHistoryService.NormalizeGitPath(relativePath);
        if (isDirectory && !gitPath.EndsWith('/'))
        {
            gitPath += "/";
        }

        Commands.Stage(repo, gitPath);
    }

    public static Commit CreateCommit(Repository repo, string message)
    {
        var (name, email) = GetSignatureIdentity(repo);
        var signature = new Signature(name, email, DateTimeOffset.Now);
        return repo.Commit(message, signature, signature);
    }

    public static void Push(Repository repo, CredentialsHandler? credentialsHandler = null)
    {
        if (repo.Head is null)
        {
            throw new InvalidOperationException("The repository has no current branch.");
        }

        if (repo.Network.Remotes["origin"] is not Remote remote)
        {
            throw new InvalidOperationException("No 'origin' remote is configured for this repository.");
        }

        var pushOptions = new PushOptions();
        if (credentialsHandler is not null)
        {
            pushOptions.CredentialsProvider = credentialsHandler;
        }

        try
        {
            repo.Network.Push(remote, repo.Head.CanonicalName, pushOptions);
        }
        catch (Exception ex) when (IsNothingToPush(ex))
        {
            throw new InvalidOperationException("There are no commits to push.", ex);
        }
    }

    private static (string Name, string Email) GetSignatureIdentity(Repository repo)
    {
        string? name = repo.Config.Get<string>("user.name")?.Value?.Trim();
        string? email = repo.Config.Get<string>("user.email")?.Value?.Trim();

        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(email))
        {
            throw new InvalidOperationException(
                "Git user.name and user.email must be configured before committing.\n" +
                "Set them with: git config user.name \"Your Name\" and git config user.email \"you@example.com\"");
        }

        return (name, email);
    }

    private static bool IsStaged(FileStatus state) =>
        state.HasFlag(FileStatus.NewInIndex)
        || state.HasFlag(FileStatus.ModifiedInIndex)
        || state.HasFlag(FileStatus.DeletedFromIndex)
        || state.HasFlag(FileStatus.RenamedInIndex)
        || state.HasFlag(FileStatus.TypeChangeInIndex);

    private static bool IsNothingToPush(Exception ex)
    {
        string message = ex.Message;
        return message.Contains("Everything up-to-date", StringComparison.OrdinalIgnoreCase)
            || message.Contains("up to date", StringComparison.OrdinalIgnoreCase);
    }
}
