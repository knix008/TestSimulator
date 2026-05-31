namespace OCRWinV10.Ocr;

public static class OcrInstallHelper
{
    /// <summary>
    /// 엔진이 미설치이면 설치 팝업을 표시하고, 설치되어 있으면 바로 준비만 확인합니다.
    /// </summary>
    public static async Task<bool> EnsureProviderReadyAsync(
        IWin32Window? owner,
        IOcrProvider provider,
        CancellationToken cancellationToken = default)
    {
        if (provider.IsInstalled)
        {
            return await provider.EnsureInstalledAsync(null, cancellationToken);
        }

        return await OcrInstallProgressForm.RunInstallAsync(
            owner,
            provider,
            provider.EnsureInstalledAsync,
            cancellationToken);
    }
}
