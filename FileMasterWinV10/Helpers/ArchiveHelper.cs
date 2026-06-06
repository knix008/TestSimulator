using System.IO.Compression;

namespace FileMasterWinV10.Helpers;

public static class ArchiveHelper
{
    // 분할 파일 명명: archive.zip.001, archive.zip.002, ...
    public static async Task CompressAsync(
        string[] sourcePaths,
        string destZipPath,
        CompressionLevel level,
        long splitSizeBytes,
        IProgress<string>? progress,
        CancellationToken ct)
    {
        string workPath = splitSizeBytes > 0
            ? Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".zip")
            : destZipPath;

        // 기존 파일 삭제
        if (File.Exists(workPath)) File.Delete(workPath);

        await Task.Run(() =>
        {
            using var archive = ZipFile.Open(workPath, ZipArchiveMode.Create);
            foreach (var src in sourcePaths)
            {
                ct.ThrowIfCancellationRequested();
                if (Directory.Exists(src))
                    AddDirectory(archive, src, Path.GetFileName(src), level, progress, ct);
                else if (File.Exists(src))
                    AddFile(archive, src, Path.GetFileName(src), level, progress);
            }
        }, ct);

        if (splitSizeBytes > 0)
        {
            await Task.Run(() => SplitFile(workPath, destZipPath, splitSizeBytes, progress, ct), ct);
            try { File.Delete(workPath); } catch { }
        }
    }

    private static void AddDirectory(
        ZipArchive archive, string dirPath, string entryRoot,
        CompressionLevel level, IProgress<string>? progress, CancellationToken ct)
    {
        foreach (var file in Directory.GetFiles(dirPath, "*", SearchOption.AllDirectories))
        {
            ct.ThrowIfCancellationRequested();
            string relative = Path.Combine(entryRoot, Path.GetRelativePath(dirPath, file))
                              .Replace('\\', '/');
            progress?.Report(Path.GetFileName(file));
            archive.CreateEntryFromFile(file, relative, level);
        }
    }

    private static void AddFile(
        ZipArchive archive, string filePath, string entryName,
        CompressionLevel level, IProgress<string>? progress)
    {
        progress?.Report(Path.GetFileName(filePath));
        archive.CreateEntryFromFile(filePath, entryName, level);
    }

    // 완성된 ZIP을 지정 크기로 분할
    private static void SplitFile(
        string sourcePath, string destBasePath,
        long chunkSize, IProgress<string>? progress, CancellationToken ct)
    {
        using var fs = File.OpenRead(sourcePath);
        long total = fs.Length;
        int part = 1;
        var buffer = new byte[81920];

        while (fs.Position < total)
        {
            ct.ThrowIfCancellationRequested();
            string partPath = $"{destBasePath}.{part:D3}";
            progress?.Report($"파트 {part} 생성 중 ({FormatSize(fs.Position)}/{FormatSize(total)})");

            using var outFs = File.Create(partPath);
            long written = 0;
            int read;
            while (written < chunkSize
                && (read = fs.Read(buffer, 0, (int)Math.Min(buffer.Length, chunkSize - written))) > 0)
            {
                outFs.Write(buffer, 0, read);
                written += read;
            }
            part++;
        }
    }

    // 분할 파일 여부 감지: archive.zip → archive.zip.001 존재 확인
    public static bool IsSplitArchive(string zipPath) =>
        File.Exists(zipPath + ".001");

    // 분할 파트 파일인지 확인: archive.zip.001 / .002 / ... / .999
    public static bool IsSplitPart(string path)
    {
        string ext = Path.GetExtension(path); // e.g. ".001"
        if (ext.Length != 4) return false;
        for (int i = 1; i < 4; i++)
            if (!char.IsDigit(ext[i])) return false;
        // 숫자 확장자를 제거하면 .zip 으로 끝나야 한다
        string basePath = Path.ChangeExtension(path, null); // "archive.zip"
        return basePath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase);
    }

    // 분할 파트 경로 → 베이스 .zip 경로: "archive.zip.001" → "archive.zip"
    public static string GetSplitBasePath(string partPath) =>
        Path.ChangeExtension(partPath, null)!;

    // 분할 파트를 임시 파일로 합쳐서 추출
    public static async Task ExtractAsync(
        string archivePath,
        string destDir,
        IProgress<string>? progress,
        CancellationToken ct)
    {
        // 분할 파트(.zip.001 등)를 직접 선택한 경우 베이스 경로로 정규화
        if (IsSplitPart(archivePath))
            archivePath = GetSplitBasePath(archivePath);

        string extractSource = archivePath;
        string? tempFile = null;

        // 분할 아카이브이면 먼저 합친다
        if (IsSplitArchive(archivePath))
        {
            tempFile = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".zip");
            await Task.Run(() => ReassembleParts(archivePath, tempFile, progress, ct), ct);
            extractSource = tempFile;
        }

        try
        {
            await Task.Run(() => ExtractZip(extractSource, destDir, progress, ct), ct);
        }
        finally
        {
            if (tempFile != null)
                try { File.Delete(tempFile); } catch { }
        }
    }

    private static void ReassembleParts(
        string basePath, string outPath,
        IProgress<string>? progress, CancellationToken ct)
    {
        using var outFs = File.Create(outPath);
        int part = 1;
        while (true)
        {
            string partPath = $"{basePath}.{part:D3}";
            if (!File.Exists(partPath)) break;
            ct.ThrowIfCancellationRequested();
            progress?.Report($"파트 {part} 병합 중...");
            using var inFs = File.OpenRead(partPath);
            inFs.CopyTo(outFs);
            part++;
        }
    }

    private static void ExtractZip(
        string zipPath, string destDir,
        IProgress<string>? progress, CancellationToken ct)
    {
        Directory.CreateDirectory(destDir);
        string fullDest = Path.GetFullPath(destDir);
        using var archive = ZipFile.OpenRead(zipPath);
        foreach (var entry in archive.Entries)
        {
            ct.ThrowIfCancellationRequested();
            string fullTarget = Path.GetFullPath(Path.Combine(destDir, entry.FullName));
            // 경로 이탈 방지
            if (!fullTarget.StartsWith(fullDest + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                && !fullTarget.Equals(fullDest, StringComparison.OrdinalIgnoreCase))
                continue;

            if (string.IsNullOrEmpty(entry.Name))
            {
                Directory.CreateDirectory(fullTarget);
            }
            else
            {
                Directory.CreateDirectory(Path.GetDirectoryName(fullTarget)!);
                progress?.Report(entry.Name);
                entry.ExtractToFile(fullTarget, overwrite: true);
            }
        }
    }

    private static string FormatSize(long bytes)
    {
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
        return $"{bytes / (1024.0 * 1024):F1} MB";
    }
}
