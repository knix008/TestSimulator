namespace PDFEditor.Core.Models;

public sealed class PageModel
{
    public required int Index { get; init; }
    public required double Width { get; init; }
    public required double Height { get; init; }
    public int Rotation { get; init; }
    public bool IsLoaded { get; set; } = true;
    public IList<TextElement> TextElements { get; init; } = new List<TextElement>();
    public IList<ImageElementModel> ImageElements { get; init; } = new List<ImageElementModel>();
    public IList<AnnotationModel> Annotations { get; init; } = new List<AnnotationModel>();
    public IList<ContentStreamModel> ContentStreams { get; init; } = new List<ContentStreamModel>();

    public PageMetadata ToMetadata() => new()
    {
        Index = Index,
        Width = Width,
        Height = Height,
        Rotation = Rotation,
        IsLoaded = IsLoaded
    };
}
