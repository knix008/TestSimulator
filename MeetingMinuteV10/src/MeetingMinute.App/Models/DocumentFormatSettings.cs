namespace MeetingMinute.App.Models;

public sealed class DocumentFormatSettings
{
    public string FontFamily { get; set; } = "맑은 고딕";
    public double BodyFontSizePt { get; set; } = 11;
    public double LineSpacing { get; set; } = 1.15;
    public double PageMarginMm { get; set; } = 25;

    public DocumentFormatSettings Clone() => new()
    {
        FontFamily = FontFamily,
        BodyFontSizePt = BodyFontSizePt,
        LineSpacing = LineSpacing,
        PageMarginMm = PageMarginMm
    };
}
