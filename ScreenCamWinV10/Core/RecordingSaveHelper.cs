namespace ScreenCamWin.Core;

public static class RecordingSaveHelper
{
    public static async Task CopyFileWithProgressAsync(
        string sourcePath,
        string destPath,
        string statusLabel,
        int percentStart,
        int percentEnd,
        IProgress<MergeProgress>? progress,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(sourcePath))
            throw new FileNotFoundException("원본 파일을 찾을 수 없습니다.", sourcePath);

        string? dir = Path.GetDirectoryName(destPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        if (File.Exists(destPath))
            File.Delete(destPath);

        progress?.Report(new MergeProgress(percentStart, statusLabel, "0%"));

        const int bufferSize = 1024 * 256;
        long total = new FileInfo(sourcePath).Length;
        if (total <= 0)
        {
            File.Copy(sourcePath, destPath, overwrite: true);
            progress?.Report(new MergeProgress(percentEnd, statusLabel, "100%"));
            return;
        }

        await using var input  = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, bufferSize, true);
        await using var output = new FileStream(destPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, bufferSize, true);

        var buffer = new byte[bufferSize];
        long copied = 0;
        int span = Math.Max(1, percentEnd - percentStart);

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            int read = await input.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (read <= 0) break;

            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
            copied += read;

            int pct = percentStart + (int)(copied * span / total);
            pct = Math.Clamp(pct, percentStart, percentEnd);
            string filePct = $"{copied * 100 / total}%";
            progress?.Report(new MergeProgress(pct, statusLabel, filePct));
        }

        progress?.Report(new MergeProgress(percentEnd, statusLabel, "100%"));
    }
}
