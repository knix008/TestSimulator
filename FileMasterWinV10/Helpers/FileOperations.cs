namespace FileMasterWinV10.Helpers;

public static class FileOperations
{
    public static void CopyFiles(IEnumerable<string> sources, string destDir, Action<string>? progress = null)
    {
        Directory.CreateDirectory(destDir);
        foreach (var src in sources)
        {
            progress?.Invoke(Path.GetFileName(src));
            if (Directory.Exists(src))
                CopyDirectory(src, Path.Combine(destDir, Path.GetFileName(src)), progress);
            else
                File.Copy(src, Path.Combine(destDir, Path.GetFileName(src)), true);
        }
    }

    public static void MoveFiles(IEnumerable<string> sources, string destDir, Action<string>? progress = null)
    {
        Directory.CreateDirectory(destDir);
        foreach (var src in sources)
        {
            progress?.Invoke(Path.GetFileName(src));
            string dest = Path.Combine(destDir, Path.GetFileName(src));
            if (Directory.Exists(src))
                Directory.Move(src, dest);
            else
                File.Move(src, dest, true);
        }
    }

    public static void DeleteFiles(IEnumerable<string> paths)
    {
        foreach (var path in paths)
        {
            if (Directory.Exists(path))
                Directory.Delete(path, true);
            else if (File.Exists(path))
                File.Delete(path);
        }
    }

    private static void CopyDirectory(string src, string dest, Action<string>? progress)
    {
        Directory.CreateDirectory(dest);
        foreach (var file in Directory.GetFiles(src))
        {
            progress?.Invoke(Path.GetFileName(file));
            File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), true);
        }
        foreach (var dir in Directory.GetDirectories(src))
            CopyDirectory(dir, Path.Combine(dest, Path.GetFileName(dir)), progress);
    }

    public static async Task<List<string>> SearchFilesAsync(
        string rootPath, string pattern, bool searchContent, string? contentPattern,
        IProgress<string>? progress, CancellationToken cancellationToken)
    {
        var results = new List<string>();
        await Task.Run(() =>
        {
            try { SearchRecursive(rootPath, pattern, searchContent, contentPattern, results, progress, cancellationToken); }
            catch (OperationCanceledException) { }
        }, cancellationToken);
        return results;
    }

    private static void SearchRecursive(
        string dir, string pattern, bool searchContent, string? contentPattern,
        List<string> results, IProgress<string>? progress, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        try
        {
            foreach (var file in Directory.GetFiles(dir, pattern))
            {
                ct.ThrowIfCancellationRequested();
                progress?.Report(file);
                if (!searchContent || string.IsNullOrEmpty(contentPattern))
                {
                    results.Add(file);
                }
                else
                {
                    try
                    {
                        if (File.ReadAllText(file).Contains(contentPattern, StringComparison.OrdinalIgnoreCase))
                            results.Add(file);
                    }
                    catch { }
                }
            }
            foreach (var subDir in Directory.GetDirectories(dir))
                SearchRecursive(subDir, pattern, searchContent, contentPattern, results, progress, ct);
        }
        catch (UnauthorizedAccessException) { }
    }
}
