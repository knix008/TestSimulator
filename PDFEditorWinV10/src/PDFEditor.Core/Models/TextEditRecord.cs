namespace PDFEditor.Core.Models;

public sealed class TextEditRecord
{
    public required string ElementId { get; init; }
    public required int PageIndex { get; init; }
    public required string OriginalText { get; init; }
    public required string NewText { get; init; }
}
