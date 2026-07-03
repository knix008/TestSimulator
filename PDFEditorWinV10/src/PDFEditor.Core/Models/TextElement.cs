namespace PDFEditor.Core.Models;

public sealed class TextElement
{
    public required string Id { get; init; }
    public required int PageIndex { get; init; }
    public required string Text { get; set; }
    public required string OriginalText { get; set; }
    public required PdfBounds Bounds { get; init; }
    public string? FontName { get; init; }
    public string? FontRefId { get; init; }
    public double FontSize { get; init; }
    public int ContentStreamIndex { get; init; }
}
