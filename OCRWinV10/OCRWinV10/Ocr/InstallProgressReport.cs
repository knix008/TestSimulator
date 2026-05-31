namespace OCRWinV10.Ocr;

/// <summary>
/// OCR 엔진 설치/준비 진행 상태. Percent가 null이면 막대 애니메이션(불확정) 표시.
/// </summary>
public readonly record struct InstallProgressReport(string Message, int? Percent = null)
{
    public static InstallProgressReport Indeterminate(string message) => new(message, null);

    public static InstallProgressReport Determinate(string message, int percent) =>
        new(message, Math.Clamp(percent, 0, 100));
}
