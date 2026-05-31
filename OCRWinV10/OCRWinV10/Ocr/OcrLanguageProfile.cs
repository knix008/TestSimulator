namespace OCRWinV10.Ocr;

/// <summary>
/// 한국어 우선, 영어 병행 인식에 공통으로 쓰는 언어 설정입니다.
/// </summary>
public static class OcrLanguageProfile
{
    public const string DisplayName = "한국어 + 영어";

    /// <summary>EasyOCR 언어 코드 (한국어 팩 + 라틴/영어 팩)</summary>
    public static readonly string[] EasyOcrCodes = ["ko", "en"];

    /// <summary>Tesseract traineddata 조합</summary>
    public const string TesseractLanguages = "kor+eng";

    /// <summary>Windows OCR 초기화 우선순위</summary>
    public static readonly string[] WindowsLanguageTags = ["ko", "ko-KR", "en"];
}
