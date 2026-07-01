using LibGit2Sharp;
using LibGit2Sharp.Handlers;

namespace MyGitWinV10.App.Services;

public sealed class GitRepositoryService : IDisposable
{
    private readonly object _sync = new();

    public Repository? Repo { get; private set; }
    public string? RepositoryPath { get; private set; }
    public UnpushedPathsCache UnpushedPathsCache { get; } = new();

    public T RunLocked<T>(Func<Repository, T> action)
    {
        lock (_sync)
        {
            if (Repo is null)
            {
                throw new InvalidOperationException("No repository is open.");
            }

            return action(Repo);
        }
    }

    public void RunLocked(Action<Repository> action) =>
        RunLocked(repo =>
        {
            action(repo);
            return true;
        });

    public void OpenLocal(string path)
    {
        var repoPath = Repository.Discover(path)
            ?? throw new InvalidOperationException($"'{path}' is not a Git repository.");

        lock (_sync)
        {
            Repo?.Dispose();
            Repo = new Repository(repoPath);
            UnpushedPathsCache.Invalidate();
            RepositoryPath = !Repo.Info.IsBare && !string.IsNullOrWhiteSpace(Repo.Info.WorkingDirectory)
                ? Repo.Info.WorkingDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                : repoPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
    }

    public static void Clone(
        string url,
        string destinationPath,
        CredentialsHandler? credentialsHandler,
        Action<float>? onProgress = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var options = new CloneOptions();
        if (credentialsHandler is not null)
        {
            options.FetchOptions.CredentialsProvider = credentialsHandler;
        }

        options.FetchOptions.OnTransferProgress = progress =>
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return false;
            }

            if (onProgress is not null && progress.TotalObjects > 0)
            {
                var received = (float)progress.ReceivedObjects / progress.TotalObjects;
                var indexed = (float)progress.IndexedObjects / progress.TotalObjects;
                onProgress(Math.Clamp(Math.Max(received, indexed), 0f, 1f));
            }

            return true;
        };

        try
        {
            Repository.Clone(url, destinationPath, options);
        }
        catch (Exception ex) when (cancellationToken.IsCancellationRequested)
        {
            throw new OperationCanceledException("Clone was cancelled.", ex, cancellationToken);
        }

        cancellationToken.ThrowIfCancellationRequested();
        onProgress?.Invoke(1f);
    }

    public string GetCurrentBranchName()
    {
        lock (_sync)
        {
            return Repo?.Head?.FriendlyName ?? "(no branch)";
        }
    }

    public void Close()
    {
        lock (_sync)
        {
            Repo?.Dispose();
            Repo = null;
            RepositoryPath = null;
        }
    }

    public void Dispose() => Close();
}
