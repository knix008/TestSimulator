namespace ScreenCamWin.Core;

public sealed record MergeProgress(int Percent, string Status, string? Detail = null);

/// <summary>Combines separate video + mic WAV using Windows built-in APIs (no FFmpeg).</summary>
public static class RecordingMerger
{
    const int MinWavBytes = 2048;

    public static Task MergeAsync(
        string videoPath,
        string audioPath,
        string outputPath,
        IProgress<MergeProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(audioPath) || !File.Exists(audioPath))
            throw new InvalidOperationException("마이크 오디오 파일이 없습니다.");

        long wavSize = new FileInfo(audioPath).Length;
        if (wavSize < MinWavBytes)
            throw new InvalidOperationException(
                $"오디오 파일이 비어 있거나 너무 짧습니다 ({wavSize} bytes).\n" +
                "마이크가 제대로 녹음되었는지 확인해 주세요.");

        if (!File.Exists(videoPath))
            throw new FileNotFoundException("영상 파일을 찾을 수 없습니다.", videoPath);

        progress?.Report(new MergeProgress(0, "합치기 준비 중…", "0%"));

        bool outputMp4 = outputPath.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase);

        return Task.Run(() =>
        {
            if (outputMp4)
                MfNativeMerger.Merge(videoPath, audioPath, outputPath, progress, cancellationToken);
            else
                AviNativeMerger.Merge(videoPath, audioPath, outputPath, progress, cancellationToken);
        }, cancellationToken);
    }

    public static void TryDeleteTempDirectory(string? tempDir)
    {
        if (string.IsNullOrEmpty(tempDir) || !Directory.Exists(tempDir))
            return;
        try { Directory.Delete(tempDir, recursive: true); }
        catch { }
    }
}
