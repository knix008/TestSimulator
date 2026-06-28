using System.Diagnostics;
using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class ExternalMergeToolService
{
    public static bool IsConfigured(AppSettingsStore settings) =>
        !string.IsNullOrWhiteSpace(settings.ExternalMergeToolPath) && File.Exists(settings.ExternalMergeToolPath);

    public static string GetDisplayName(AppSettingsStore settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ExternalMergeToolPath))
        {
            return string.Empty;
        }

        return Path.GetFileName(settings.ExternalMergeToolPath.Trim());
    }

    public static bool HasConflict(Repository repo, string relativePath) =>
        repo.Index.Conflicts[relativePath] is not null;

    /// <summary>
    /// Launches the configured merge tool against the conflicted path's ancestor/ours/theirs
    /// blobs, waits for the tool to exit, then stages the working-tree file — mirroring `git
    /// mergetool` + `git add`. The tool is expected to edit {merged} (the real working-tree
    /// file) in place and remove the conflict markers before it exits.
    /// </summary>
    public static async Task LaunchAsync(AppSettingsStore settings, Repository repo, string relativePath)
    {
        if (!IsConfigured(settings))
        {
            throw new InvalidOperationException(Localization.T("MergeTool.NotConfigured"));
        }

        Conflict? conflict = repo.Index.Conflicts[relativePath]
            ?? throw new InvalidOperationException(Localization.Tf("MergeTool.NoConflict", relativePath));

        string? workingDirectory = repo.Info.WorkingDirectory
            ?? throw new InvalidOperationException("The repository has no working directory.");

        string tempDir = Path.Combine(Path.GetTempPath(), "MyGitWinV10", "mergetool", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        string fileName = Path.GetFileName(relativePath);
        string basePath = Path.Combine(tempDir, "base_" + fileName);
        string localPath = Path.Combine(tempDir, "local_" + fileName);
        string remotePath = Path.Combine(tempDir, "remote_" + fileName);
        string mergedPath = Path.Combine(workingDirectory, relativePath.Replace('/', Path.DirectorySeparatorChar));

        try
        {
            WriteEntryOrEmpty(repo, conflict.Ancestor, basePath);
            WriteEntryOrEmpty(repo, conflict.Ours, localPath);
            WriteEntryOrEmpty(repo, conflict.Theirs, remotePath);

            string arguments = settings.ExternalMergeToolArguments
                .Replace("{base}", basePath)
                .Replace("{local}", localPath)
                .Replace("{remote}", remotePath)
                .Replace("{merged}", mergedPath);

            using var process = Process.Start(new ProcessStartInfo(settings.ExternalMergeToolPath!, arguments)
            {
                UseShellExecute = false
            }) ?? throw new InvalidOperationException(Localization.T("MergeTool.LaunchFailed"));

            await process.WaitForExitAsync().ConfigureAwait(true);
        }
        finally
        {
            TryDeleteDirectory(tempDir);
        }

        Commands.Stage(repo, relativePath);
    }

    private static void WriteEntryOrEmpty(Repository repo, IndexEntry? entry, string destinationPath)
    {
        if (entry is not null && repo.Lookup<Blob>(entry.Id) is { } blob)
        {
            using Stream source = blob.GetContentStream();
            using FileStream destination = File.Create(destinationPath);
            source.CopyTo(destination);
            return;
        }

        File.WriteAllText(destinationPath, string.Empty);
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
