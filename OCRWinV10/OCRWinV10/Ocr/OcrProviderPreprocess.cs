namespace OCRWinV10.Ocr;

/// <summary>
/// 엔진별 권장 이미지 전처리 방식.
/// </summary>
public static class OcrProviderPreprocess
{
    /// <summary>
    /// 이진화(Auto)보다 그레이·대비 보정이 인식률에 유리한 엔진.
    /// </summary>
    public static bool UsesDocumentPreprocess(string? providerId) =>
        providerId is OcrProviderIds.EasyOcr
            or OcrProviderIds.Tesseract
            or OcrProviderIds.Windows;
}
