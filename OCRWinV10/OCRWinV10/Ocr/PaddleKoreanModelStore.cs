using Sdcb.PaddleOCR.Models;

namespace OCRWinV10.Ocr;

/// <summary>
/// PaddleOCR det/cls/rec 모델 — 파일 기반 로드(대용량 Local DLL 미사용), 번들·캐시·다운로드.
/// </summary>
internal static class PaddleKoreanModelStore
{
    public const string DetModelFolderName = "PP-OCRv5_mobile_det";
    public const string ClsModelFolderName = "PP-LCNet_x1_0_textline_ori";
    public const string RecModelFolderName = "korean_PP-OCRv5_mobile_rec";

    private static readonly string[] StandardModelFiles =
    [
        "inference.json",
        "inference.pdiparams",
        "inference.yml"
    ];

    private static readonly PaddleModelDefinition DetModel = new(
        DetModelFolderName,
        ModelVersion.V5,
        [
            (50_000, 900_000),
            (3_000_000, 8_000_000),
            (500, 5_000)
        ],
        [
            "https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det/resolve/main/",
            "https://hf-mirror.com/PaddlePaddle/PP-OCRv5_mobile_det/resolve/main/"
        ]);

    private static readonly PaddleModelDefinition ClsModel = new(
        ClsModelFolderName,
        ModelVersion.V5,
        [
            (50_000, 300_000),
            (4_000_000, 10_000_000),
            (500, 5_000)
        ],
        [
            "https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori/resolve/main/",
            "https://hf-mirror.com/PaddlePaddle/PP-LCNet_x1_0_textline_ori/resolve/main/"
        ]);

    private static readonly PaddleModelDefinition RecModel = new(
        RecModelFolderName,
        ModelVersion.V5,
        [
            (100_000, 500_000),
            (10_000_000, 20_000_000),
            (10_000, 200_000)
        ],
        [
            "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/",
            "https://hf-mirror.com/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/"
        ]);

    private static readonly PaddleModelDefinition[] AllModels = [DetModel, ClsModel, RecModel];

    public static string EffectiveRecModelDirectory => ResolveEffectiveDirectory(RecModel);

    public static bool IsRecModelReady() => RecModel.IsReady();

    public static bool AreAllModelsReady() => AllModels.All(m => m.IsReady());

    public static FullOcrModel CreateKoreanFullModel() =>
        new(
            DetectionModel.FromDirectory(ResolveEffectiveDirectory(DetModel), ModelVersion.V5),
            ClassificationModel.FromDirectory(ResolveEffectiveDirectory(ClsModel), ModelVersion.V5),
            RecognizationModel.FromDirectoryV5(ResolveEffectiveDirectory(RecModel)));

    public static async Task<bool> EnsureAllModelsDownloadedAsync(
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken)
    {
        if (AreAllModelsReady())
        {
            progress?.Report(InstallProgressReport.Determinate("PaddleOCR 모델 준비됨", 100));
            return true;
        }

        progress?.Report(InstallProgressReport.Indeterminate(
            "PaddleOCR 탐지·분류·한국어 인식 모델 확인 중 (인식 모델은 설치본에 포함, 나머지는 최초 1회 다운로드)..."));

        for (var i = 0; i < AllModels.Length; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var model = AllModels[i];
            if (model.IsReady())
                continue;

            var basePct = i * 100 / AllModels.Length;
            var span = 100 / AllModels.Length;
            var ok = await model.EnsureDownloadedAsync(progress, basePct, span, cancellationToken);
            if (!ok)
                return false;
        }

        progress?.Report(InstallProgressReport.Determinate("PaddleOCR 모델 준비됨", 100));
        return AreAllModelsReady();
    }

    private static string ResolveEffectiveDirectory(PaddleModelDefinition model)
    {
        if (model.IsBundledReady())
            return model.BundledDirectory;
        if (model.IsCacheReady())
            return model.CacheDirectory;
        return model.CacheDirectory;
    }

    private sealed class PaddleModelDefinition
    {
        private readonly (long MinBytes, long MaxBytes)[] _expectedSizes;

        public PaddleModelDefinition(
            string folderName,
            ModelVersion version,
            (long MinBytes, long MaxBytes)[] expectedSizes,
            string[] downloadBaseUrls)
        {
            FolderName = folderName;
            Version = version;
            _expectedSizes = expectedSizes;
            DownloadBaseUrls = downloadBaseUrls;
        }

        public string FolderName { get; }
        public ModelVersion Version { get; }
        public string[] DownloadBaseUrls { get; }

        public string BundledDirectory =>
            Path.Combine(AppContext.BaseDirectory, "models", "paddle", FolderName);

        public string CacheDirectory =>
            Path.Combine(EngineDownloadHelper.EnginesRoot, "paddle", FolderName);

        public bool IsBundledReady() => IsDirectoryReady(BundledDirectory);

        public bool IsCacheReady() => IsDirectoryReady(CacheDirectory);

        public bool IsReady() => IsBundledReady() || IsCacheReady();

        public async Task<bool> EnsureDownloadedAsync(
            IProgress<InstallProgressReport>? progress,
            int basePct,
            int spanPct,
            CancellationToken cancellationToken)
        {
            if (IsReady())
                return true;

            Directory.CreateDirectory(CacheDirectory);
            string? lastError = null;

            for (var i = 0; i < StandardModelFiles.Length; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var file = StandardModelFiles[i];
                var dest = Path.Combine(CacheDirectory, file);
                var fileBase = basePct + i * spanPct / StandardModelFiles.Length;

                if (IsFileValid(dest, i))
                {
                    progress?.Report(InstallProgressReport.Determinate(
                        $"{FolderName}/{file} (이미 있음)", fileBase + spanPct / 3));
                    continue;
                }

                var fileProgress = new Progress<InstallProgressReport>(r =>
                {
                    if (r.Percent is int p)
                        progress?.Report(InstallProgressReport.Determinate(
                            r.Message, fileBase + p * spanPct / (3 * 100)));
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
                    progress?.Report(InstallProgressReport.Indeterminate($"{FolderName}/{file} 실패: {ex.Message}"));
                }

                if (!IsFileValid(dest, i))
                {
                    progress?.Report(InstallProgressReport.Indeterminate(
                        $"PaddleOCR 모델({FolderName}) 설치 실패.\n" +
                        $"• 인터넷 연결 확인\n" +
                        $"• 또는 다음 폴더에 모델 파일을 넣어 주세요:\n{CacheDirectory}" +
                        (lastError != null ? $"\n• 오류: {lastError}" : "")));
                    return false;
                }
            }

            return IsCacheReady();
        }

        private async Task DownloadModelFileAsync(
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

        private bool IsDirectoryReady(string directory)
        {
            if (!Directory.Exists(directory))
                return false;

            for (var i = 0; i < StandardModelFiles.Length; i++)
            {
                if (!IsFileValid(Path.Combine(directory, StandardModelFiles[i]), i))
                    return false;
            }

            return true;
        }

        private bool IsFileValid(string path, int index)
        {
            if (!File.Exists(path))
                return false;

            var len = new FileInfo(path).Length;
            var (min, max) = _expectedSizes[index];
            return len >= min && len <= max;
        }
    }
}
