using LibGit2Sharp;

namespace MyGitWinV10.App.Services;

public static class CommitExportService
{
    public static void Export(Repository repository, Commit commit, string destinationDirectory)
    {
        ArgumentNullException.ThrowIfNull(repository);
        ArgumentNullException.ThrowIfNull(commit);
        ArgumentException.ThrowIfNullOrWhiteSpace(destinationDirectory);

        Directory.CreateDirectory(destinationDirectory);
        ExportTree(repository, commit.Tree, destinationDirectory);
    }

    private static void ExportTree(Repository repository, Tree tree, string directoryPath)
    {
        foreach (TreeEntry entry in tree)
        {
            string entryPath = Path.Combine(directoryPath, entry.Name);

            switch (entry.TargetType)
            {
                case TreeEntryTargetType.Tree:
                    Directory.CreateDirectory(entryPath);
                    ExportTree(repository, (Tree)entry.Target, entryPath);
                    break;

                case TreeEntryTargetType.Blob:
                    WriteBlob(entry, entryPath);
                    break;

                case TreeEntryTargetType.GitLink:
                    // Submodule reference — not expanded in this export.
                    break;
            }
        }
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
