using FileMasterWinV10.Models;
using Microsoft.VisualBasic.FileIO;

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
            MoveOne(src, dest, cancellationToken);
        }
    }

    // 원본 삭제 권한 부족·볼륨 경계(예: C: → D:, 네트워크 드라이브)에서는
    // Directory.Move / File.Move 가 접근 거부/예외를 낸다.
    // 그럴 때는 '복사 후 원본 삭제'로 폴백한다.
    private static void MoveOne(string src, string dest, CancellationToken cancellationToken)
    {
        bool isDir = Directory.Exists(src);
        try
        {
            if (isDir)
                Directory.Move(src, dest);
            else
            {
                ClearReadOnly(src);
                File.Move(src, dest, true);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // 폴백: 복사 → 원본 삭제. 삭제까지 실패하면 예외를 그대로 전파한다.
            if (isDir)
            {
                CopyDirectory(src, dest, _ => { }, cancellationToken);
                DeleteDirectoryForce(src);
            }
            else
            {
                File.Copy(src, dest, true);
                ClearReadOnly(src);
                File.Delete(src);
            }
        }
    }

    private static void ClearReadOnly(string path)
    {
        var attrs = File.GetAttributes(path);
        if ((attrs & FileAttributes.ReadOnly) != 0)
            File.SetAttributes(path, attrs & ~FileAttributes.ReadOnly);
    }

    private static void DeleteDirectoryForce(string dir)
    {
        foreach (var file in Directory.GetFiles(dir))
        {
            ClearReadOnly(file);
            File.Delete(file);
        }
        foreach (var sub in Directory.GetDirectories(dir))
            DeleteDirectoryForce(sub);
        Directory.Delete(dir);
    }

    public static void DeleteFiles(
        IEnumerable<string> paths,
        IProgress<FileOperationProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        // 삭제 기본 동작은 '휴지통으로 이동'이다(영구 삭제가 아님).
        // 휴지통 이동은 폴더를 통째로 처리하므로 최상위 경로 단위로 진행한다.
        var list = paths.ToList();
        int total = Math.Max(list.Count, 1);
        int completed = 0;

        progress?.Report(new FileOperationProgress { CurrentPath = "휴지통으로 이동 시작...", Completed = 0, Total = total });

        foreach (var path in list)
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
                FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
            else if (Directory.Exists(path))
                FileSystem.DeleteDirectory(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
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
