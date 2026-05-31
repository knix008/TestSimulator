namespace OCRWinV10.Ocr;

public interface IOcrProvider
{
    string Id { get; }
    string DisplayName { get; }
    string Description { get; }

    bool IsInstalled { get; }

    Task<bool> EnsureInstalledAsync(IProgress<InstallProgressReport>? progress, CancellationToken cancellationToken);

    Task<OcrResult> RecognizeAsync(Bitmap bitmap, CancellationToken cancellationToken = default);
}
