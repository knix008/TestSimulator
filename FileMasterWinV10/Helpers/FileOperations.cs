using FileMasterWinV10.Models;

namespace FileMasterWinV10.Helpers;

public static class FileOperations
{
    public static void CopyFiles(
        IEnumerable<string> sources,
        string destDir,
        IProgress<FileOperationProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        var sourceList = sources.ToList();
        Directory.CreateDirectory(destDir);

        progress?.Report(new FileOperationProgress { CurrentPath = "작업 준비 중...", Completed = 0, Total = 0 });

        int total = CountCopyWorkItems(sourceList);
        int completed = 0;

        progress?.Report(new FileOperationProgress { CurrentPath = "복사 시작...", Completed = 0, Total = total });

        void Report(string path)
        {
            completed++;
            progress?.Report(new FileOperationProgress
            {
                CurrentPath = path,
                Completed = completed,
                Total = total
            });
        }

        foreach (var src in sourceList)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (Directory.Exists(src))
                CopyDirectory(src, Path.Combine(destDir, Path.GetFileName(src)), Report, cancellationToken);
            else
            {
                Report(src);
                File.Copy(src, Path.Combine(destDir, Path.GetFileName(src)), true);
            }
        }
    }

    public static void MoveFiles(
        IEnumerable<string> sources,
        string destDir,
        IProgress<FileOperationProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        var sourceList = sources.ToList();
        Directory.CreateDirectory(destDir);
        int total = Math.Max(sourceList.Count, 1);
        int completed = 0;

        progress?.Report(new FileOperationProgress { CurrentPath = "이동 시작...", Completed = 0, Total = total });

        foreach (var src in sourceList)
        {
            cancellationToken.ThrowIfCancellationRequested();
            completed++;
            progress?.Report(new FileOperationProgress
            {
                CurrentPath = src,
                Completed = completed,
                Total = total
            });
            string dest = Path.Combine(destDir, Path.GetFileName(src));
            if (Directory.Exists(src))
                Directory.Move(src, dest);
            else
                File.Move(src, dest, true);
        }
    }

    public static void DeleteFiles(
        IEnumerable<string> paths,
        IProgress<FileOperationProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        progress?.Report(new FileOperationProgress { CurrentPath = "삭제 준비 중...", Completed = 0, Total = 0 });

        var workItems = CollectDeleteWorkItems(paths);
        int total = Math.Max(workItems.Count, 1);
        int completed = 0;

        progress?.Report(new FileOperationProgress { CurrentPath = "삭제 시작...", Completed = 0, Total = total });

        foreach (var path in workItems)
        {
            cancellationToken.ThrowIfCancellationRequested();
            completed++;
            progress?.Report(new FileOperationProgress
            {
                CurrentPath = path,
                Completed = completed,
                Total = total
            });
            if (File.Exists(path))
                File.Delete(path);
            else if (Directory.Exists(path))
                Directory.Delete(path, false);
        }
    }

    private static void CopyDirectory(
        string src,
        string dest,
        Action<string> report,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(dest);
        foreach (var file in Directory.GetFiles(src))
        {
            cancellationToken.ThrowIfCancellationRequested();
            report(file);
            File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), true);
        }
        foreach (var dir in Directory.GetDirectories(src))
            CopyDirectory(dir, Path.Combine(dest, Path.GetFileName(dir)), report, cancellationToken);
    }

    private static int CountCopyWorkItems(IEnumerable<string> sources)
    {
        int total = 0;
        foreach (var src in sources)
        {
            if (File.Exists(src))
                total++;
            else if (Directory.Exists(src))
            {
                int files = CountFilesInDirectory(src);
                total += files > 0 ? files : 1;
            }
        }
        return Math.Max(total, 1);
    }

    private static int CountFilesInDirectory(string dir)
    {
        int count = 0;
        foreach (var file in Directory.GetFiles(dir))
            count++;
        foreach (var sub in Directory.GetDirectories(dir))
            count += CountFilesInDirectory(sub);
        return count;
    }

    private static List<string> CollectDeleteWorkItems(IEnumerable<string> paths)
    {
        var files = new List<string>();
        var directories = new List<string>();

        foreach (var path in paths)
        {
            if (File.Exists(path))
                files.Add(path);
            else if (Directory.Exists(path))
                CollectDeletePaths(path, files, directories);
        }

        directories.Sort((a, b) => b.Length.CompareTo(a.Length));
        files.AddRange(directories);
        return files;
    }

    private static void CollectDeletePaths(string dir, List<string> files, List<string> directories)
    {
        foreach (var file in Directory.GetFiles(dir))
            files.Add(file);
        foreach (var sub in Directory.GetDirectories(dir))
            CollectDeletePaths(sub, files, directories);
        directories.Add(dir);
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
