using Sdcb.PaddleOCR.Models;
using Sdcb.PaddleOCR.Models.Local;

namespace OCRWinV10.Ocr;

/// <summary>
/// 한국어 인식 모델: 앱에 포함된 번들 우선, 없으면 %LocalAppData%에 다운로드.
/// </summary>
internal static class PaddleKoreanModelStore
{
    public const string RecModelFolderName = "korean_PP-OCRv5_mobile_rec";

    private static readonly string[] RecModelFiles =
    [
        "inference.json",
        "inference.pdiparams",
        "inference.yml"
    ];

    private static readonly (long MinBytes, long MaxBytes)[] ExpectedSizes =
    [
        (100_000, 500_000),
        (10_000_000, 20_000_000),
        (10_000, 200_000)
    ];

    private static readonly string[] DownloadBaseUrls =
    [
        "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/",
        "https://hf-mirror.com/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/"
    ];

    public static string BundledRecModelDirectory =>
        Path.Combine(AppContext.BaseDirectory, "models", "paddle", RecModelFolderName);

    public static string CachedRecModelDirectory =>
        Path.Combine(EngineDownloadHelper.EnginesRoot, "paddle", RecModelFolderName);

    public static string EffectiveRecModelDirectory
    {
        get
        {
            if (IsDirectoryReady(BundledRecModelDirectory))
                return BundledRecModelDirectory;
            if (IsDirectoryReady(CachedRecModelDirectory))
                return CachedRecModelDirectory;
            return CachedRecModelDirectory;
        }
    }

    public static bool IsRecModelReady() =>
        IsDirectoryReady(BundledRecModelDirectory) || IsDirectoryReady(CachedRecModelDirectory);

    public static FullOcrModel CreateKoreanFullModel() =>
        new(
            LocalDetectionModel.ChineseV5,
            LocalClassificationModel.ChineseMobileV2,
            LocalRecognizationModel.FromDirectoryV5(EffectiveRecModelDirectory));

    public static async Task<bool> EnsureRecModelDownloadedAsync(
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken)
    {
        if (IsRecModelReady())
        {
            progress?.Report(InstallProgressReport.Determinate("PaddleOCR 한국어 모델 준비됨", 100));
            return true;
        }

        progress?.Report(InstallProgressReport.Indeterminate(
            "PaddleOCR 한국어 인식 모델 다운로드 중 (~13MB)..."));

        Directory.CreateDirectory(CachedRecModelDirectory);

        string? lastError = null;

        for (var i = 0; i < RecModelFiles.Length; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var file = RecModelFiles[i];
            var dest = Path.Combine(CachedRecModelDirectory, file);
            var basePct = i * 100 / RecModelFiles.Length;

            if (IsFileValid(dest, i))
            {
                progress?.Report(InstallProgressReport.Determinate($"{file} (이미 있음)", basePct + 30));
                continue;
            }

            var fileProgress = new Progress<InstallProgressReport>(r =>
            {
                if (r.Percent is int p)
                    progress?.Report(InstallProgressReport.Determinate(r.Message, basePct + (p * 30 / 100)));
                else
                    progress?.Report(InstallProgressReport.Indeterminate(r.Message));
            });

            try
            {
                await DownloadModelFileAsync(file, dest, fileProgress, cancellationToken);
            }
            catch (Exception ex)
            {
                lastError = ex.Message;
                progress?.Report(InstallProgressReport.Indeterminate($"{file} 실패: {ex.Message}"));
            }

            if (!IsFileValid(dest, i))
            {
                progress?.Report(InstallProgressReport.Indeterminate(
                    $"PaddleOCR 모델 설치 실패.\n" +
                    $"• 인터넷/방화벽 확인\n" +
                    $"• 또는 다음 폴더에 inference.json, inference.pdiparams, inference.yml 을 넣어 주세요:\n{CachedRecModelDirectory}" +
                    (lastError != null ? $"\n• 오류: {lastError}" : "")));
                return false;
            }
        }

        return IsDirectoryReady(CachedRecModelDirectory);
    }

    private static async Task DownloadModelFileAsync(
        string fileName,
        string destinationPath,
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken)
    {
        Exception? last = null;

        foreach (var baseUrl in DownloadBaseUrls)
        {
            var root = baseUrl.EndsWith('/') ? baseUrl : baseUrl + "/";
            foreach (var suffix in new[] { "", "?download=true" })
            {
                var url = root + fileName + suffix;
                try
                {
                    if (File.Exists(destinationPath))
                        File.Delete(destinationPath);

                    await EngineDownloadHelper.DownloadFileAsync(
                        url, destinationPath, progress, cancellationToken, maxAttempts: 2);
                    return;
                }
                catch (Exception ex)
                {
                    last = ex;
                    try { if (File.Exists(destinationPath)) File.Delete(destinationPath); } catch { }
                }
            }
        }

        throw last ?? new IOException($"{fileName} 다운로드 실패");
    }

    private static bool IsDirectoryReady(string directory)
    {
        if (!Directory.Exists(directory))
            return false;

        for (var i = 0; i < RecModelFiles.Length; i++)
        {
            if (!IsFileValid(Path.Combine(directory, RecModelFiles[i]), i))
                return false;
        }

        return true;
    }

    private static bool IsFileValid(string path, int index)
    {
        if (!File.Exists(path))
            return false;

        var len = new FileInfo(path).Length;
        var (min, max) = ExpectedSizes[index];
        return len >= min && len <= max;
    }
}
