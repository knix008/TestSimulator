using LibGit2Sharp;
using LibGit2Sharp.Handlers;

namespace MyGitWinV10.App.Services;

public static class GitWorkflowService
{
    private static readonly StatusOptions DefaultStatusOptions = new();

    public static bool CanUseWorkflow(Repository repo, bool isRemoteBrowse) =>
        !isRemoteBrowse
        && !repo.Info.IsBare
        && !string.IsNullOrWhiteSpace(repo.Info.WorkingDirectory);

    public static bool HasOriginRemote(Repository repo) =>
        repo.Network.Remotes["origin"] is not null;

    public static bool HasStagedChanges(Repository repo) =>
        GetStatusEntries(repo).Any(entry => !string.IsNullOrEmpty(entry.Staged));

    public static bool HasWorkingTreeChanges(Repository repo) =>
        GetStatusEntries(repo).Any(entry => !string.IsNullOrEmpty(entry.WorkTree));

    public static bool HasStashEntries(Repository repo) => repo.Stashes.Any();

    public static bool HasStagedChangesAtPath(Repository repo, string relativePath, bool isDirectory) =>
        GetStatusEntries(repo, relativePath, isDirectory).Any(entry => !string.IsNullOrEmpty(entry.Staged));

    public static bool HasWorkingTreeChangesAtPath(Repository repo, string relativePath, bool isDirectory) =>
        GetStatusEntries(repo, relativePath, isDirectory).Any(entry => !string.IsNullOrEmpty(entry.WorkTree));

    public static IReadOnlyList<string> GetStagedPaths(Repository repo) =>
        RetrieveStatusEntries(repo)
            .Where(entry => IsStaged(entry.State))
            .Select(entry => entry.FilePath)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static IReadOnlyList<GitStatusEntry> GetStatusEntries(Repository repo) =>
        RetrieveStatusEntries(repo)
            .Select(ToStatusEntry)
            .Where(entry => !string.IsNullOrEmpty(entry.Staged) || !string.IsNullOrEmpty(entry.WorkTree))
            .OrderBy(entry => entry.FilePath, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static IReadOnlyList<GitStatusEntry> GetStatusEntries(
        Repository repo,
        string relativePath,
        bool isDirectory)
    {
        if (string.IsNullOrEmpty(relativePath))
        {
            return GetStatusEntries(repo);
        }

        return RetrieveStatusEntries(repo, relativePath, isDirectory)
            .Select(ToStatusEntry)
            .Where(entry => !string.IsNullOrEmpty(entry.Staged) || !string.IsNullOrEmpty(entry.WorkTree))
            .OrderBy(entry => entry.FilePath, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static Dictionary<string, GitStatusEntry> CreateStatusSnapshot(
        Repository repo,
        string relativePath,
        bool isDirectory) =>
        GetStatusEntries(repo, relativePath, isDirectory)
            .ToDictionary(entry => entry.FilePath, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyList<GitStatusEntry> GetNewlyStagedEntries(
        IReadOnlyDictionary<string, GitStatusEntry> before,
        Repository repo,
        string relativePath,
        bool isDirectory) =>
        GetNewlyStagedEntries(before, GetStatusEntries(repo, relativePath, isDirectory));

    public static IReadOnlyList<GitStatusEntry> GetNewlyStagedEntries(
        IReadOnlyDictionary<string, GitStatusEntry> before,
        IEnumerable<GitStatusEntry> afterEntries) =>
        afterEntries
            .Where(entry => IsNewlyStaged(before, entry))
            .ToList();

    public static IReadOnlyList<GitStatusEntry> GetStageCandidates(
        Repository repo,
        string relativePath,
        bool isDirectory) =>
        GetStatusEntries(repo, relativePath, isDirectory)
            .Where(entry => !string.IsNullOrEmpty(entry.WorkTree))
            .ToList();

    public static void StagePaths(Repository repo, IEnumerable<string> paths)
    {
        var list = paths as IList<string> ?? paths.ToList();
        if (list.Count == 0)
        {
            return;
        }

        Commands.Stage(repo, list);
    }

    public static void UnstagePaths(Repository repo, IEnumerable<string> paths)
    {
        var list = paths as IList<string> ?? paths.ToList();
        if (list.Count == 0)
        {
            return;
        }

        Commands.Unstage(repo, list);
    }

    public static void Stage(Repository repo, string relativePath, bool isDirectory)
    {
        if (string.IsNullOrEmpty(relativePath))
        {
            Commands.Stage(repo, "*");
            return;
        }

        Commands.Stage(repo, ToGitPath(relativePath, isDirectory));
    }

    public static void Unstage(Repository repo, string relativePath, bool isDirectory)
    {
        UnstagePaths(repo, GetPathsForUnstage(repo, relativePath, isDirectory));
    }

    public static void DiscardChanges(Repository repo, string relativePath, bool isDirectory)
    {
        if (repo.Head?.Tip?.Tree is not Tree headTree)
        {
            throw new InvalidOperationException("The repository has no commits to restore from.");
        }

        string? workingDirectory = repo.Info.WorkingDirectory
            ?? throw new InvalidOperationException("The repository has no working directory.");

        var checkoutOptions = new CheckoutOptions
        {
            CheckoutModifiers = CheckoutModifiers.Force
        };

        foreach (StatusEntry entry in GetStatusEntriesForPath(repo, relativePath, isDirectory))
        {
            if (entry.State.HasFlag(FileStatus.NewInWorkdir))
            {
                string fullPath = Path.Combine(workingDirectory, entry.FilePath.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(fullPath))
                {
                    File.Delete(fullPath);
                }

                continue;
            }

            if (HasWorkTreeChange(entry.State))
            {
                Commands.Checkout(repo, headTree, checkoutOptions, entry.FilePath);
            }
        }
    }

    public static Commit CreateCommit(Repository repo, string message)
    {
        var (name, email) = GetSignatureIdentity(repo);
        var signature = new Signature(name, email, DateTimeOffset.Now);
        return repo.Commit(message, signature, signature);
    }

    public static void Fetch(Repository repo, CredentialsHandler? credentialsHandler = null, CancellationToken cancellationToken = default)
    {
        Remote remote = GetOriginRemote(repo);
        Commands.Fetch(repo, remote.Name, Array.Empty<string>(), CreateFetchOptions(credentialsHandler, cancellationToken), logMessage: null);
    }

    /// <summary>
    /// Updates local remote-tracking refs from origin. Failures (network, auth) are ignored so
    /// callers can still build status from the last known remote state.
    /// </summary>
    public static bool TryFetchOrigin(
        Repository repo,
        CredentialsHandler? credentialsHandler = null,
        CancellationToken cancellationToken = default)
    {
        if (!HasOriginRemote(repo))
        {
            return false;
        }

        try
        {
            Fetch(repo, credentialsHandler, cancellationToken);
            return true;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            return false;
        }
    }

    public static MergeResult Pull(Repository repo, CredentialsHandler? credentialsHandler = null, CancellationToken cancellationToken = default)
    {
        var (name, email) = GetSignatureIdentity(repo);
        var signature = new Signature(name, email, DateTimeOffset.Now);
        var pullOptions = new PullOptions
        {
            FetchOptions = CreateFetchOptions(credentialsHandler, cancellationToken)
        };

        return Commands.Pull(repo, signature, pullOptions);
    }

    public static void Push(Repository repo, CredentialsHandler? credentialsHandler = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (repo.Head is null)
        {
            throw new InvalidOperationException("The repository has no current branch.");
        }

        Remote remote = GetOriginRemote(repo);
        var pushOptions = new PushOptions();
        if (credentialsHandler is not null)
        {
            pushOptions.CredentialsProvider = credentialsHandler;
        }

        pushOptions.OnPushTransferProgress = (_, _, _) =>
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return false;
            }

            return true;
        };

        // The remote can reject a ref update server-side (file-size limit, branch protection,
        // pre-receive hook) after the objects have already uploaded successfully. libgit2 only
        // reports that through this callback — without it, Network.Push() returns normally and
        // the rejection is silently lost, which is exactly what made large-file push failures
        // look like nothing happened.
        var rejections = new List<string>();
        pushOptions.OnPushStatusError = error => rejections.Add(
            string.IsNullOrWhiteSpace(error.Message)
                ? Localization.Tf("GitOp.PushRejectedRefBare", error.Reference)
                : Localization.Tf("GitOp.PushRejectedRef", error.Reference, error.Message));

        try
        {
            repo.Network.Push(remote, repo.Head.CanonicalName, pushOptions);
        }
        catch (NonFastForwardException ex)
        {
            throw new InvalidOperationException(FormatPushRejectedMessage(repo), ex);
        }
        catch (Exception ex) when (IsNothingToPush(ex))
        {
            throw new InvalidOperationException(Localization.T("Msg.GitPush.NothingToPush"), ex);
        }

        if (rejections.Count > 0)
        {
            throw new InvalidOperationException(Localization.Tf("GitOp.PushRejectedByRemote", string.Join("\n", rejections)));
        }
    }

    public static string FormatPushRejectedMessage(Repository repo)
    {
        string branch = repo.Head?.FriendlyName ?? Localization.T("Detail.Value.Unknown");
        (int ahead, int behind) = GitOperationDetails.GetTrackingAheadBehind(repo);
        return Localization.Tf("GitOp.PushRejectedNonFf", branch, behind, ahead);
    }

    public static void Stash(Repository repo, string? message = null)
    {
        var (name, email) = GetSignatureIdentity(repo);
        var signature = new Signature(name, email, DateTimeOffset.Now);
        string stashMessage = string.IsNullOrWhiteSpace(message)
            ? $"WIP on {repo.Head?.FriendlyName ?? "detached"}"
            : message.Trim();
        repo.Stashes.Add(signature, stashMessage);
    }

    public static void StashPop(Repository repo)
    {
        if (!HasStashEntries(repo))
        {
            throw new InvalidOperationException("There are no stashed changes.");
        }

        repo.Stashes.Pop(0);
    }

    private static IEnumerable<string> GetPathsForUnstage(Repository repo, string relativePath, bool isDirectory)
    {
        if (string.IsNullOrEmpty(relativePath))
        {
            return GetStagedPaths(repo);
        }

        return GetStatusEntriesForPath(repo, relativePath, isDirectory)
            .Where(entry => IsStaged(entry.State))
            .Select(entry => entry.FilePath)
            .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static IEnumerable<StatusEntry> GetStatusEntriesForPath(
        Repository repo,
        string relativePath,
        bool isDirectory)
    {
        if (string.IsNullOrEmpty(relativePath))
        {
            return RetrieveStatusEntries(repo);
        }

        return RetrieveStatusEntries(repo, relativePath, isDirectory);
    }

    private static IEnumerable<StatusEntry> RetrieveStatusEntries(Repository repo) =>
        repo.RetrieveStatus(DefaultStatusOptions);

    private static IEnumerable<StatusEntry> RetrieveStatusEntries(
        Repository repo,
        string relativePath,
        bool isDirectory) =>
        repo.RetrieveStatus(CreateScopedStatusOptions(relativePath, isDirectory));

    private static StatusOptions CreateScopedStatusOptions(string relativePath, bool isDirectory) =>
        new()
        {
            PathSpec = [ToGitPath(relativePath, isDirectory)],
        };

    private static Remote GetOriginRemote(Repository repo) =>
        repo.Network.Remotes["origin"]
        ?? throw new InvalidOperationException("No 'origin' remote is configured for this repository.");

    private static FetchOptions CreateFetchOptions(CredentialsHandler? credentialsHandler, CancellationToken cancellationToken = default)
    {
        var fetchOptions = new FetchOptions();
        if (credentialsHandler is not null)
        {
            fetchOptions.CredentialsProvider = credentialsHandler;
        }

        fetchOptions.OnTransferProgress = _ =>
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return false;
            }

            return true;
        };

        return fetchOptions;
    }

    public static bool WasUntrackedBeforeStage(
        IReadOnlyDictionary<string, GitStatusEntry> before,
        GitStatusEntry after)
    {
        if (before.TryGetValue(after.FilePath, out GitStatusEntry? previous))
        {
            return string.Equals(previous.WorkTree, "Untracked", StringComparison.OrdinalIgnoreCase);
        }

        return string.Equals(after.Staged, "Added", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsNewlyStaged(IReadOnlyDictionary<string, GitStatusEntry> before, GitStatusEntry after)
    {
        if (string.IsNullOrEmpty(after.Staged))
        {
            return false;
        }

        if (!before.TryGetValue(after.FilePath, out GitStatusEntry? previous))
        {
            return true;
        }

        if (string.IsNullOrEmpty(previous.Staged))
        {
            return true;
        }

        if (!string.Equals(previous.Staged, after.Staged, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return !string.IsNullOrEmpty(previous.WorkTree);
    }

    private static GitStatusEntry ToStatusEntry(StatusEntry entry) =>
        new()
        {
            FilePath = entry.FilePath,
            Staged = FormatIndexStatus(entry.State),
            WorkTree = FormatWorkTreeStatus(entry.State)
        };

    private static string FormatIndexStatus(FileStatus state)
    {
        if (state.HasFlag(FileStatus.NewInIndex))
        {
            return "Added";
        }

        if (state.HasFlag(FileStatus.ModifiedInIndex))
        {
            return "Modified";
        }

        if (state.HasFlag(FileStatus.DeletedFromIndex))
        {
            return "Deleted";
        }

        if (state.HasFlag(FileStatus.RenamedInIndex))
        {
            return "Renamed";
        }

        if (state.HasFlag(FileStatus.TypeChangeInIndex))
        {
            return "Type Changed";
        }

        return string.Empty;
    }

    private static string FormatWorkTreeStatus(FileStatus state)
    {
        if (state.HasFlag(FileStatus.NewInWorkdir))
        {
            return "Untracked";
        }

        if (state.HasFlag(FileStatus.ModifiedInWorkdir))
        {
            return "Modified";
        }

        if (state.HasFlag(FileStatus.DeletedFromWorkdir))
        {
            return "Deleted";
        }

        if (state.HasFlag(FileStatus.RenamedInWorkdir))
        {
            return "Renamed";
        }

        if (state.HasFlag(FileStatus.TypeChangeInWorkdir))
        {
            return "Type Changed";
        }

        return string.Empty;
    }


    private static string ToGitPath(string relativePath, bool isDirectory)
    {
        string gitPath = PathCommitHistoryService.NormalizeGitPath(relativePath);
        if (isDirectory && !gitPath.EndsWith('/'))
        {
            gitPath += "/";
        }

        return gitPath;
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

    private static bool HasWorkTreeChange(FileStatus state) =>
        state.HasFlag(FileStatus.ModifiedInWorkdir)
        || state.HasFlag(FileStatus.DeletedFromWorkdir)
        || state.HasFlag(FileStatus.RenamedInWorkdir)
        || state.HasFlag(FileStatus.TypeChangeInWorkdir);

    private static bool IsNothingToPush(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            string message = current.Message;
            if (message.Contains("Everything up-to-date", StringComparison.OrdinalIgnoreCase)
                || message.Contains("up to date", StringComparison.OrdinalIgnoreCase)
                || message.Contains("no commits to push", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
