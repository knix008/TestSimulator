using EasyOcrSharp.Models;
using EasyOcrSharp.Services;
using System.Drawing.Imaging;

namespace OCRWinV10.Ocr.Providers;

public sealed class EasyOcrProvider : IOcrProvider, IAsyncDisposable
{
    private static readonly string[] Languages = OcrLanguageProfile.EasyOcrCodes;

    private static string ModelCachePath =>
        Path.Combine(EngineDownloadHelper.EnginesRoot, "easyocr", "models");

    private readonly SemaphoreSlim _lock = new(1, 1);
    private EasyOcrService? _service;

    public string Id => OcrProviderIds.EasyOcr;
    public string DisplayName => "EasyOCR (한·영)";
    public string Description => "한국어(ko)+영어(en) · 문서용 그레이 전처리·2패스 인식 (모델 ~100MB 자동 다운로드)";

    public bool IsInstalled => HasRequiredModels();

    public async Task<bool> EnsureInstalledAsync(
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken)
    {
        if (IsInstalled && _service != null)
        {
            progress?.Report(InstallProgressReport.Determinate("EasyOCR 준비 완료", 100));
            return true;
        }

        progress?.Report(InstallProgressReport.Indeterminate(
            "EasyOCR 모델 다운로드 중 (CRAFT 탐지 + 한국어 인식, 약 100MB)..."));

        try
        {
            progress?.Report(InstallProgressReport.Determinate("모델 다운로드 및 초기화...", 30));
            var service = await GetOrCreateServiceAsync(cancellationToken);

            progress?.Report(InstallProgressReport.Determinate("모델 워밍업...", 70));
            await WarmUpAsync(service, cancellationToken);

            progress?.Report(InstallProgressReport.Determinate("EasyOCR 준비 완료", 100));
            return HasRequiredModels();
        }
        catch (Exception ex)
        {
            progress?.Report(InstallProgressReport.Indeterminate($"EasyOCR 준비 실패: {ex.Message}"));
            return false;
        }
    }

    public async Task<OcrResult> RecognizeAsync(Bitmap bitmap, CancellationToken cancellationToken = default)
    {
        var service = await GetOrCreateServiceAsync(cancellationToken);

        using var ms = new MemoryStream();
        bitmap.Save(ms, ImageFormat.Png);

        // 앱에서 그레이·대비 전처리를 수행하므로 이중 기울기 보정은 끕니다.
        var options = new RecognitionOptions
        {
            Grouping = TextGrouping.Line,
            MinConfidence = 0.3,
            AdjustContrast = true,
            Preprocessing = new PreprocessingOptions
            {
                Deskew = false,
                Binarize = false,
                Denoise = true,
                DetectOrientation = false
            }
        };

        var result = await service.ExtractTextFromImage(
            ms.ToArray(), Languages, options, cancellationToken);

        return MapResult(result);
    }

    private static OcrResult MapResult(EasyOcrSharp.Models.OcrResult result)
    {
        var lines = result.Lines
            .Where(l => !string.IsNullOrWhiteSpace(l.Text))
            .Select(l =>
            {
                var box = l.BoundingBox;
                var word = new OcrWord(
                    l.Text,
                    new RectangleF(
                        (float)box.MinX,
                        (float)box.MinY,
                        (float)box.Width,
                        (float)box.Height));
                return new OcrLine(l.Text, [word]);
            })
            .ToList();

        var text = string.IsNullOrWhiteSpace(result.FullText)
            ? string.Join(Environment.NewLine, lines.Select(l => l.Text))
            : result.FullText;

        return new OcrResult(text, lines);
    }

    private async Task<EasyOcrService> GetOrCreateServiceAsync(CancellationToken cancellationToken)
    {
        if (_service != null)
            return _service;

        await _lock.WaitAsync(cancellationToken);
        try
        {
            if (_service != null)
                return _service;

            Directory.CreateDirectory(ModelCachePath);
            _service = new EasyOcrService(ModelCachePath, useGpu: false);
            return _service;
        }
        finally
        {
            _lock.Release();
        }
    }

    private static async Task WarmUpAsync(EasyOcrService service, CancellationToken cancellationToken)
    {
        using var bmp = new Bitmap(64, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.Clear(Color.White);
            g.DrawString("가", new Font("맑은 고딕", 14), Brushes.Black, 4, 4);
        }

        using var ms = new MemoryStream();
        bmp.Save(ms, ImageFormat.Png);
        await service.ExtractTextFromImage(
            ms.ToArray(), Languages, RecognitionOptions.Default, cancellationToken);
    }

    private static bool HasRequiredModels()
    {
        if (!Directory.Exists(ModelCachePath))
            return false;

        var files = Directory.GetFiles(ModelCachePath, "*", SearchOption.AllDirectories);
        var names = files.Select(Path.GetFileName).ToHashSet(StringComparer.OrdinalIgnoreCase);

        bool hasCraft = names.Any(n =>
            n != null && n.Contains("craft", StringComparison.OrdinalIgnoreCase)
            && n.EndsWith(".onnx", StringComparison.OrdinalIgnoreCase));

        bool hasKorean = names.Any(n =>
            n != null && (n.Contains("korean", StringComparison.OrdinalIgnoreCase)
                          || n.Contains("ko", StringComparison.OrdinalIgnoreCase))
            && n.EndsWith(".onnx", StringComparison.OrdinalIgnoreCase));

        return hasCraft && hasKorean;
    }

    public async ValueTask DisposeAsync()
    {
        if (_service != null)
        {
            await _service.DisposeAsync();
            _service = null;
        }
        _lock.Dispose();
    }
}
