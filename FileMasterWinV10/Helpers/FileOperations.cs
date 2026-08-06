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
        IProgress<string>? progress, CancellationToken cancellationToken,
        FileSearchOptions? options = null)
    {
        options ??= new FileSearchOptions();
        if (!DesktopSearchHelper.TryCreateQuery(pattern, options, out var query))
            return [];

        List<SearchMatch> matches;
        try
        {
            matches = await Task.Run(
                () => SearchRecursive(rootPath, query, searchContent, contentPattern, progress, cancellationToken, options),
                cancellationToken);
        }
        catch (OperationCanceledException)
        {
            return [];
        }

        return DesktopSearchHelper.SortMatches(matches, options.SortOrder, options.CaseSensitive)
            .Select(match => match.FullPath)
            .ToList();
    }

    private static List<SearchMatch> SearchRecursive(
        string rootPath, DesktopSearchQuery query, bool searchContent, string? contentPattern,
        IProgress<string>? progress, CancellationToken ct, FileSearchOptions options)
    {
        var results = new List<SearchMatch>();
        var pending = new Stack<string>();
        pending.Push(rootPath);

        while (pending.Count > 0)
        {
            ct.ThrowIfCancellationRequested();
            var dir = pending.Pop();

            IEnumerable<string> subDirs;
            try { subDirs = Directory.EnumerateDirectories(dir).ToList(); }
            catch (UnauthorizedAccessException) { continue; }
            catch (IOException) { continue; }

            foreach (var subDir in subDirs)
            {
                ct.ThrowIfCancellationRequested();
                pending.Push(subDir);
                if (options.IncludeFolders && !searchContent)
                    TryAddMatch(subDir, isDirectory: true, query, contentPattern, searchContent, progress, options, results);
            }

            IEnumerable<string> files;
            try { files = Directory.EnumerateFiles(dir).ToList(); }
            catch (UnauthorizedAccessException) { continue; }
            catch (IOException) { continue; }

            foreach (var file in files)
            {
                ct.ThrowIfCancellationRequested();
                TryAddMatch(file, isDirectory: false, query, contentPattern, searchContent, progress, options, results);
            }
        }

        return results;
    }

    private static void TryAddMatch(
        string path, bool isDirectory, DesktopSearchQuery query, string? contentPattern, bool searchContent,
        IProgress<string>? progress, FileSearchOptions options, List<SearchMatch> results)
    {
        var name = Path.GetFileName(path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        var score = DesktopSearchHelper.ScoreName(name, query, options.CaseSensitive);
        if (score <= 0)
            return;

        if (searchContent)
        {
            if (isDirectory || string.IsNullOrEmpty(contentPattern))
                return;

            try
            {
                var comparison = options.CaseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;
                if (!File.ReadAllText(path).Contains(contentPattern, comparison))
                    return;
            }
            catch
            {
                return;
            }
        }

        progress?.Report(path);
        var modifiedUtc = 0L;
        try
        {
            modifiedUtc = isDirectory
                ? new DirectoryInfo(path).LastWriteTimeUtc.Ticks
                : new FileInfo(path).LastWriteTimeUtc.Ticks;
        }
        catch { }

        results.Add(new SearchMatch(path, name, modifiedUtc, score));
    }
}
