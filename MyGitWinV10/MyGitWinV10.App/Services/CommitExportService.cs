using LibGit2Sharp;
using MyGitWinV10.App.Dialogs;

namespace MyGitWinV10.App.Services;

public static class CommitExportService
{
    public static void Export(
        Repository repository,
        Commit commit,
        string destinationDirectory,
        IOperationProgressReporter? progress = null)
    {
        ArgumentNullException.ThrowIfNull(repository);
        ArgumentNullException.ThrowIfNull(commit);
        ArgumentException.ThrowIfNullOrWhiteSpace(destinationDirectory);

        progress?.CancellationToken.ThrowIfCancellationRequested();

        Directory.CreateDirectory(destinationDirectory);

        string shortSha = commit.Sha.Length >= 7 ? commit.Sha[..7] : commit.Sha;
        int total = CountExportableItems(commit.Tree);
        int processed = 0;
        int lastReportedPercent = -1;

        progress?.Report($"Exporting commit {shortSha}... 0%", 0, FormatProgressDetail(processed, total, null));

        ExportTree(
            repository,
            commit.Tree,
            destinationDirectory,
            shortSha,
            ref processed,
            total,
            ref lastReportedPercent,
            progress);
    }

    private static int CountExportableItems(Tree tree)
    {
        int count = 0;
        foreach (TreeEntry entry in tree)
        {
            switch (entry.TargetType)
            {
                case TreeEntryTargetType.Tree:
                    count += CountExportableItems((Tree)entry.Target);
                    break;

                case TreeEntryTargetType.Blob:
                    count++;
                    break;
            }
        }

        return count;
    }

    private static void ExportTree(
        Repository repository,
        Tree tree,
        string directoryPath,
        string shortSha,
        ref int processed,
        int total,
        ref int lastReportedPercent,
        IOperationProgressReporter? progress,
        string relativePath = "")
    {
        foreach (TreeEntry entry in tree)
        {
            progress?.CancellationToken.ThrowIfCancellationRequested();

            string entryPath = Path.Combine(directoryPath, entry.Name);
            string entryRelative = string.IsNullOrEmpty(relativePath)
                ? entry.Name
                : Path.Combine(relativePath, entry.Name);

            switch (entry.TargetType)
            {
                case TreeEntryTargetType.Tree:
                    Directory.CreateDirectory(entryPath);
                    ExportTree(
                        repository,
                        (Tree)entry.Target,
                        entryPath,
                        shortSha,
                        ref processed,
                        total,
                        ref lastReportedPercent,
                        progress,
                        entryRelative);
                    break;

                case TreeEntryTargetType.Blob:
                    WriteBlob(entry, entryPath);
                    processed++;
                    ReportProgress(shortSha, processed, total, entryRelative, ref lastReportedPercent, progress);
                    break;

                case TreeEntryTargetType.GitLink:
                    // Submodule reference — not expanded in this export.
                    break;
            }
        }
    }

    private static void ReportProgress(
        string shortSha,
        int processed,
        int total,
        string relativePath,
        ref int lastReportedPercent,
        IOperationProgressReporter? progress)
    {
        if (progress is null)
        {
            return;
        }

        int percent = total > 0 ? (int)(processed * 100L / total) : 100;
        if (processed != total && processed != 1 && percent == lastReportedPercent)
        {
            return;
        }

        lastReportedPercent = percent;
        progress.Report(
            $"Exporting commit {shortSha}... {percent}% ({processed}/{total})",
            percent,
            FormatProgressDetail(processed, total, relativePath));
    }

    private static string FormatProgressDetail(int processed, int total, string? currentPath)
    {
        string summary = total > 0 ? $"{processed} / {total} files" : $"{processed} files";
        return string.IsNullOrEmpty(currentPath) ? summary : $"{summary} — {currentPath}";
    }

    private static void WriteBlob(TreeEntry entry, string entryPath)
    {
        var blob = (Blob)entry.Target;
        string? parentDirectory = Path.GetDirectoryName(entryPath);
        if (!string.IsNullOrEmpty(parentDirectory))
        {
            Directory.CreateDirectory(parentDirectory);
        }

        if (entry.Mode == Mode.SymbolicLink)
        {
            string target = blob.GetContentText();
            if (File.Exists(entryPath) || Directory.Exists(entryPath))
            {
                File.Delete(entryPath);
            }

            try
            {
                File.CreateSymbolicLink(entryPath, target);
            }
            catch (IOException)
            {
                File.WriteAllText(entryPath, target);
            }

            return;
        }

        using Stream input = blob.GetContentStream();
        using FileStream output = File.Create(entryPath);
        input.CopyTo(output);
    }
}
