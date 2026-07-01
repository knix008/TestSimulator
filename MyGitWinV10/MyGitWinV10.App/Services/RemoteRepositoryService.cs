using System.Security.Cryptography;
using System.Text;
using LibGit2Sharp;
using LibGit2Sharp.Handlers;

namespace MyGitWinV10.App.Services;

public static class RemoteRepositoryService
{
    private static readonly string CacheRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MyGitWinV10",
        "remote-cache");

    public static string GetCachePath(string url)
    {
        var normalized = RemoteUrlNormalizer.Normalize(url);
        var parsed = GitHubReleaseService.ParseGitHubRemote(normalized);
        string folderName = parsed is not null
            ? $"{parsed.Value.Owner}_{parsed.Value.Repo}"
            : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalized)))[..12];

        foreach (char invalid in Path.GetInvalidFileNameChars())
        {
            folderName = folderName.Replace(invalid, '_');
        }

        return Path.Combine(CacheRoot, folderName);
    }

    public static string? GetDisplayName(string url)
    {
        var parsed = GitHubReleaseService.ParseGitHubRemote(RemoteUrlNormalizer.Normalize(url));
        return parsed is not null ? $"{parsed.Value.Owner}/{parsed.Value.Repo}" : null;
    }

    public static string EnsureBareRepository(
        string url,
        CredentialsHandler? credentialsHandler,
        Action<float>? onProgress = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        url = RemoteUrlNormalizer.Normalize(url);
        var cachePath = GetCachePath(url);
        if (Repository.IsValid(cachePath))
        {
            FetchLatest(cachePath, credentialsHandler, onProgress, cancellationToken);
            return cachePath;
        }

        Directory.CreateDirectory(CacheRoot);
        try
        {
            CloneBare(url, cachePath, credentialsHandler, onProgress, cancellationToken);
        }
        catch (Exception ex)
        {
            TryDeleteDirectory(cachePath);
            throw GitRemoteExceptionHelper.WrapForClone(ex, url);
        }

        return cachePath;
    }

    private static void CloneBare(
        string url,
        string destinationPath,
        CredentialsHandler? credentialsHandler,
        Action<float>? onProgress,
        CancellationToken cancellationToken)
    {
        var options = new CloneOptions
        {
            IsBare = true
        };

        ConfigureFetchOptions(options.FetchOptions, credentialsHandler, onProgress, cancellationToken);

        try
        {
            Repository.Clone(url, destinationPath, options);
        }
        catch (Exception ex) when (cancellationToken.IsCancellationRequested)
        {
            throw new OperationCanceledException("Remote browse was cancelled.", ex, cancellationToken);
        }

        cancellationToken.ThrowIfCancellationRequested();
        onProgress?.Invoke(1f);
    }

    private static void FetchLatest(
        string repositoryPath,
        CredentialsHandler? credentialsHandler,
        Action<float>? onProgress,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        onProgress?.Invoke(0f);

        using var repo = new Repository(repositoryPath);
        var remote = repo.Network.Remotes.FirstOrDefault();
        if (remote is null)
        {
            onProgress?.Invoke(1f);
            return;
        }

        var fetchOptions = new FetchOptions();
        ConfigureFetchOptions(fetchOptions, credentialsHandler, onProgress, cancellationToken);

        try
        {
            Commands.Fetch(repo, remote.Name, Array.Empty<string>(), fetchOptions, logMessage: null);
        }
        catch (Exception ex) when (cancellationToken.IsCancellationRequested)
        {
            throw new OperationCanceledException("Remote browse was cancelled.", ex, cancellationToken);
        }

        cancellationToken.ThrowIfCancellationRequested();
        onProgress?.Invoke(1f);
    }

    private static void ConfigureFetchOptions(
        FetchOptions fetchOptions,
        CredentialsHandler? credentialsHandler,
        Action<float>? onProgress,
        CancellationToken cancellationToken)
    {
        if (credentialsHandler is not null)
        {
            fetchOptions.CredentialsProvider = credentialsHandler;
        }

        fetchOptions.OnTransferProgress = progress =>
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
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
            // Best-effort cleanup of a partial download.
        }
    }
}
