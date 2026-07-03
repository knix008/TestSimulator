namespace PDFEditor.Core.Models;

public sealed class PageMetadata
{
    public required int Index { get; init; }
    public required double Width { get; init; }
    public required double Height { get; init; }
    public int Rotation { get; init; }
    public bool IsLoaded { get; set; }
}
