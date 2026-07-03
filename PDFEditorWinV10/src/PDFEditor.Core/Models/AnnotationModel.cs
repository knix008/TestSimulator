namespace PDFEditor.Core.Models;

public sealed class AnnotationModel
{
    public required string Id { get; init; }
    public required int PageIndex { get; init; }
    public required string Subtype { get; init; }
    public required string PdfRefId { get; init; }
    public required PdfBounds Bounds { get; set; }
    public string? Contents { get; set; }
    public string? OriginalContents { get; set; }
    public string? Subject { get; set; }
    public string? OriginalSubject { get; set; }

    public bool IsModified =>
        !string.Equals(Contents, OriginalContents, StringComparison.Ordinal) ||
        !string.Equals(Subject, OriginalSubject, StringComparison.Ordinal);
}
