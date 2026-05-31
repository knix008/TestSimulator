namespace OCRWinV10.Ui;

public static class UiTheme
{
    public static readonly Color FormBackground = Color.FromArgb(243, 244, 246);
    public static readonly Color Surface = Color.White;
    public static readonly Color HeaderBackground = Color.FromArgb(30, 58, 95);
    public static readonly Color HeaderText = Color.FromArgb(248, 250, 252);
    public static readonly Color Accent = Color.FromArgb(37, 99, 235);
    public static readonly Color AccentHover = Color.FromArgb(29, 78, 216);

    /// <summary>OCR 실행 버튼 — 대기(밝은 녹색)</summary>
    public static readonly Color OcrButtonIdle = Color.FromArgb(187, 247, 208);
    public static readonly Color OcrButtonIdleHover = Color.FromArgb(134, 239, 172);
    public static readonly Color OcrButtonIdlePressed = Color.FromArgb(110, 231, 183);
    public static readonly Color OcrButtonIdleText = Color.FromArgb(21, 128, 61);

    /// <summary>OCR 실행 버튼 — 인식 진행 중(붉은색)</summary>
    public static readonly Color OcrButtonRunning = Color.FromArgb(239, 68, 68);
    public static readonly Color OcrButtonRunningHover = Color.FromArgb(220, 38, 38);
    public static readonly Color OcrButtonRunningPressed = Color.FromArgb(185, 28, 28);
    public static readonly Color OcrButtonRunningText = Color.White;

    public static readonly Color OcrButtonDisabled = Color.FromArgb(226, 232, 240);
    public static readonly Color OcrButtonDisabledText = Color.FromArgb(148, 163, 184);

    public const string OcrRunningTag = "ocr-running";
    public static readonly Color ImageCanvas = Color.FromArgb(24, 27, 34);
    public static readonly Color Border = Color.FromArgb(226, 232, 240);
    public static readonly Color TextPrimary = Color.FromArgb(15, 23, 42);
    public static readonly Color TextMuted = Color.FromArgb(100, 116, 139);
    public static readonly Color ToolStripBackground = Color.FromArgb(255, 255, 255);
    public static readonly Color StatusBackground = Color.FromArgb(248, 250, 252);

    public static readonly Font TitleFont = new("Segoe UI Semibold", 9.5F, FontStyle.Bold);
    public static readonly Font BodyFont = new("Segoe UI", 10F);
    public static readonly Font ResultFont = new("맑은 고딕", 11F);

    public static readonly Color BoxFill = Color.FromArgb(60, 37, 99, 235);
    public static readonly Color BoxStroke = Color.FromArgb(37, 99, 235);
    public static readonly Color BoxStrokeAlt = Color.FromArgb(14, 165, 233);
}
