using OCRWinV10.Ocr.Providers;

namespace OCRWinV10.Ocr;

public sealed class OcrService : IDisposable
{
    private readonly IReadOnlyList<IOcrProvider> _providers;
    private IOcrProvider? _active;

    public OcrService()
    {
        // 한국어 특화 엔진을 앞에 배치 (Paddle/EasyOCR: 한·영 혼합 문서에 유리)
        _providers =
        [
            new PaddleOcrProvider(),
            new EasyOcrProvider(),
            new WindowsOcrProvider(),
            new TesseractOcrProvider()
        ];
    }

    public IReadOnlyList<IOcrProvider> Providers => _providers;

    public IOcrProvider? ActiveProvider => _active;

    public void SelectProvider(string providerId)
    {
        _active = _providers.FirstOrDefault(p => p.Id == providerId)
            ?? throw new ArgumentException($"알 수 없는 OCR 엔진: {providerId}", nameof(providerId));
    }

    public void SelectProviderByIndex(int index)
    {
        if (index < 0 || index >= _providers.Count)
            throw new ArgumentOutOfRangeException(nameof(index));
        _active = _providers[index];
    }

    public int GetProviderIndex(string providerId) =>
        _providers.ToList().FindIndex(p => p.Id == providerId);

    public Task<bool> EnsureReadyAsync(
        IWin32Window? owner,
        CancellationToken cancellationToken = default)
    {
        if (_active == null)
            throw new InvalidOperationException("OCR 엔진이 선택되지 않았습니다.");

        return OcrInstallHelper.EnsureProviderReadyAsync(owner, _active, cancellationToken);
    }

    public async Task<OcrResult> RecognizeAsync(Bitmap bitmap, CancellationToken cancellationToken = default)
    {
        if (_active == null)
            throw new InvalidOperationException("OCR 엔진이 선택되지 않았습니다.");

        if (!_active.IsInstalled)
            throw new InvalidOperationException(
                $"{_active.DisplayName}이(가) 설치되지 않았습니다. OCR 실행 전 설치를 완료해 주세요.");

        var result = await _active.RecognizeAsync(bitmap, cancellationToken);
        return OcrTextPostProcessor.Apply(result);
    }

    public static string GetDefaultProviderId() => OcrProviderIds.PaddleKorean;

    public void Dispose()
    {
        foreach (var provider in _providers)
        {
            switch (provider)
            {
                case IAsyncDisposable ad:
                    ad.DisposeAsync().AsTask().GetAwaiter().GetResult();
                    break;
                case IDisposable d:
                    d.Dispose();
                    break;
            }
        }
    }
}
