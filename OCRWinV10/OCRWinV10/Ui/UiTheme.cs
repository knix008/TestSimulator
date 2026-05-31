namespace OCRWinV10.Ui;

public static class UiTheme
{
    public static readonly Color FormBackground = Color.FromArgb(243, 244, 246);
    public static readonly Color Surface = Color.White;
    public static readonly Color HeaderBackground = Color.FromArgb(30, 58, 95);
    public static readonly Color HeaderText = Color.FromArgb(248, 250, 252);
    public static readonly Color Accent = Color.FromArgb(37, 99, 235);
    public static readonly Color AccentHover = Color.FromArgb(29, 78, 216);

    /// <summary>OCR 실행 등 주요 동작 버튼</summary>
    public static readonly Color PrimaryAction = Color.FromArgb(5, 150, 105);
    public static readonly Color PrimaryActionHover = Color.FromArgb(4, 120, 87);
    public static readonly Color PrimaryActionPressed = Color.FromArgb(6, 95, 70);
    public static readonly Color PrimaryActionText = Color.White;
    public static readonly Color PrimaryActionDisabled = Color.FromArgb(203, 213, 225);
    public static readonly Color PrimaryActionTextDisabled = Color.FromArgb(148, 163, 184);
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
