using System.Diagnostics;
using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class ExternalDiffToolService
{
    public static bool IsConfigured(AppSettingsStore settings) =>
        !string.IsNullOrWhiteSpace(settings.ExternalDiffToolPath) && File.Exists(settings.ExternalDiffToolPath);

    public static string GetDisplayName(AppSettingsStore settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ExternalDiffToolPath))
        {
            return string.Empty;
        }

        return Path.GetFileName(settings.ExternalDiffToolPath.Trim());
    }

    public static void Launch(AppSettingsStore settings, Repository repo, Commit commit, string path)
    {
        Tree? oldTree = commit.Parents.FirstOrDefault()?.Tree;
        Patch patch = repo.Diff.Compare<Patch>(oldTree, commit.Tree, [path]);
        PatchEntryChanges? entry = patch.FirstOrDefault(p =>
            string.Equals(p.Path, path, StringComparison.OrdinalIgnoreCase)
            || string.Equals(p.OldPath, path, StringComparison.OrdinalIgnoreCase));
        if (entry is null)
        {
            return;
        }

        string tempDir = Path.Combine(Path.GetTempPath(), "MyGitWinV10", "extdiff", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        string leftPath = Path.Combine(tempDir, "left_" + Path.GetFileName(entry.OldPath ?? path));
        string rightPath = Path.Combine(tempDir, "right_" + Path.GetFileName(entry.Path ?? path));

        WriteBlobOrEmpty(oldTree, entry.OldPath ?? path, leftPath);
        WriteBlobOrEmpty(commit.Tree, entry.Path ?? path, rightPath);

        string arguments = settings.ExternalDiffToolArguments
            .Replace("{left}", leftPath)
            .Replace("{right}", rightPath);

        Process.Start(new ProcessStartInfo(settings.ExternalDiffToolPath!, arguments)
        {
            UseShellExecute = false
        });
    }

    private static void WriteBlobOrEmpty(Tree? tree, string path, string destinationPath)
    {
        TreeEntry? entry = tree?[path];
        if (entry?.TargetType == TreeEntryTargetType.Blob)
        {
            var blob = (Blob)entry.Target;
            using Stream source = blob.GetContentStream();
            using FileStream destination = File.Create(destinationPath);
            source.CopyTo(destination);
        }
        else
        {
            File.WriteAllText(destinationPath, string.Empty);
        }
    }
}
