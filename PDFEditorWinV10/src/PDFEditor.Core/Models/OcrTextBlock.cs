namespace PDFEditor.Core.Models;

public sealed class OcrTextBlock
{
    public required string Text { get; init; }
    public required double ImageLeft { get; init; }
    public required double ImageTop { get; init; }
    public required double ImageWidth { get; init; }
    public required double ImageHeight { get; init; }
    public double Confidence { get; init; }
}
