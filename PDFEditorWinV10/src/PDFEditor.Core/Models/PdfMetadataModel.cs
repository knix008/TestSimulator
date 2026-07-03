namespace PDFEditor.Core.Models;

public sealed class PdfMetadataModel
{
    public string? Title { get; init; }
    public string? Author { get; init; }
    public string? Subject { get; init; }
    public string? Creator { get; init; }
    public string? Producer { get; init; }
}
