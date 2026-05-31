using System.Diagnostics;

namespace OCRWinV10.Ocr.Providers;

public sealed class WindowsOcrProvider : IOcrProvider, IDisposable
{
    private readonly WindowsOcrEngine _engine = new();
    private bool _initialized;

    public string Id => OcrProviderIds.Windows;
    public string DisplayName => "Windows OCR (한국어)";
    public string Description => "Windows 내장 OCR · 한국어 우선 (영문은 언어팩 설치 시, 혼합 문서는 Paddle/EasyOCR 권장)";

    public bool IsInstalled =>
        WindowsOcrEngine.IsLanguageAvailable("ko")
        || WindowsOcrEngine.IsLanguageAvailable("ko-KR");

    public Task<bool> EnsureInstalledAsync(IProgress<InstallProgressReport>? progress, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (IsInstalled)
        {
            progress?.Report(InstallProgressReport.Determinate("Windows OCR 준비 완료", 100));
            EnsureEngineInitialized();
            return Task.FromResult(_initialized);
        }

        progress?.Report(InstallProgressReport.Indeterminate(
            "Windows 한국어 언어팩이 필요합니다.\n설정 > 시간 및 언어 > 언어에서 한국어를 추가한 뒤 다시 시도하세요."));
        try
        {
            Process.Start(new ProcessStartInfo("ms-settings:language") { UseShellExecute = true });
        }
        catch { }

        return Task.FromResult(false);
    }

    public async Task<OcrResult> RecognizeAsync(Bitmap bitmap, CancellationToken cancellationToken = default)
    {
        if (!_initialized && !EnsureEngineInitialized())
            throw new InvalidOperationException("Windows OCR을 사용할 수 없습니다. 한국어 언어팩을 설치하세요.");

        return await _engine.RecognizeAsync(bitmap, cancellationToken);
    }

    private bool EnsureEngineInitialized()
    {
        if (_initialized) return true;

        foreach (var tag in OcrLanguageProfile.WindowsLanguageTags)
        {
            if (_engine.Initialize(tag))
            {
                _initialized = true;
                return true;
            }
        }

        return false;
    }

    public void Dispose() { }
}
