using OpenCvSharp;
using OpenCvSharp.Extensions;
using Sdcb.PaddleInference;
using Sdcb.PaddleOCR;
using Sdcb.PaddleOCR.Models;

namespace OCRWinV10.Ocr.Providers;

public sealed class PaddleOcrProvider : IOcrProvider, IDisposable
{
    private readonly object _lock = new();
    private PaddleOcrAll? _ocr;

    public string Id => OcrProviderIds.PaddleKorean;
    public string DisplayName => "PaddleOCR (한·영, 권장)";
    public string Description => "한국어 V5 · 한글·영문 혼합 문서 (앱에 모델 포함, 추가 다운로드 불필요)";

    public bool IsInstalled => PaddleKoreanModelStore.IsRecModelReady();

    public async Task<bool> EnsureInstalledAsync(
        IProgress<InstallProgressReport>? progress,
        CancellationToken cancellationToken)
    {
        if (!PaddleKoreanModelStore.IsRecModelReady())
        {
            if (!await PaddleKoreanModelStore.EnsureRecModelDownloadedAsync(progress, cancellationToken))
                return false;
        }

        return await Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                progress?.Report(InstallProgressReport.Determinate("추론 엔진 초기화 중...", 85));

                lock (_lock)
                {
                    _ocr?.Dispose();
                    _ocr = CreateOcrInstance();

                    progress?.Report(InstallProgressReport.Determinate("모델 워밍업 중...", 92));
                    using var tiny = new Mat(32, 128, MatType.CV_8UC3, Scalar.White);
                    _ocr.Run(tiny);
                }

                progress?.Report(InstallProgressReport.Determinate("PaddleOCR 준비 완료", 100));
                return true;
            }
            catch (Exception ex)
            {
                progress?.Report(InstallProgressReport.Indeterminate(
                    $"PaddleOCR 준비 실패: {ex.Message}\n" +
                    $"모델 경로: {PaddleKoreanModelStore.EffectiveRecModelDirectory}"));
                return false;
            }
        }, cancellationToken);
    }

    public Task<OcrResult> RecognizeAsync(Bitmap bitmap, CancellationToken cancellationToken = default)
    {
        if (!IsInstalled)
            throw new InvalidOperationException(
                "PaddleOCR 한국어 모델이 설치되지 않았습니다. OCR 실행 전 설치를 완료해 주세요.");

        return Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();

            lock (_lock)
            {
                _ocr ??= CreateOcrInstance();
                using var mat = ToBgrMat(bitmap);
                var paddleResult = _ocr.Run(mat);
                return OcrResultMapper.FromPaddle(paddleResult);
            }
        }, cancellationToken);
    }

    private static Mat ToBgrMat(Bitmap bitmap)
    {
        using var src = BitmapConverter.ToMat(bitmap);
        if (src.Channels() == 3)
            return src.Clone();

        var bgr = new Mat();
        if (src.Channels() == 4)
            Cv2.CvtColor(src, bgr, ColorConversionCodes.BGRA2BGR);
        else if (src.Channels() == 1)
            Cv2.CvtColor(src, bgr, ColorConversionCodes.GRAY2BGR);
        else
            throw new NotSupportedException($"지원하지 않는 이미지 채널 수: {src.Channels()}");

        return bgr;
    }

    private static PaddleOcrAll CreateOcrInstance() =>
        new(PaddleKoreanModelStore.CreateKoreanFullModel(), PaddleDevice.Mkldnn())
        {
            AllowRotateDetection = true,
            Enable180Classification = false
        };

    public void Dispose()
    {
        lock (_lock)
        {
            _ocr?.Dispose();
            _ocr = null;
        }
    }
}
