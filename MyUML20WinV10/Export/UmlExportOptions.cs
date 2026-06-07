namespace MyUML20WinV10.Export;

public enum UmlDiagramExportScope
{
    CurrentDiagram,
    AllDiagrams,
}

public enum UmlImageFormat
{
    Png,
    Jpeg,
    Bmp,
}

public sealed class UmlImageExportOptions
{
    public bool TransparentBackground { get; set; }
    public Color BackgroundColor { get; set; } = Color.White;
    public float Padding { get; set; } = 40f;
    public UmlDiagramExportScope Scope { get; set; } = UmlDiagramExportScope.CurrentDiagram;

    public bool SupportsTransparency(UmlImageFormat format) => format == UmlImageFormat.Png;

    public bool SupportsTransparency() => SupportsTransparency(UmlImageFormat.Png);
}

public sealed class UmlVectorExportOptions
{
    public bool TransparentBackground { get; set; }
    public Color BackgroundColor { get; set; } = Color.White;
    public float Padding { get; set; } = 40f;
    public UmlDiagramExportScope Scope { get; set; } = UmlDiagramExportScope.CurrentDiagram;
}

public sealed class UmlDocumentExportOptions
{
    public bool EmbedDiagramImages { get; set; } = true;
    public bool TransparentDiagramBackground { get; set; }
    public Color DiagramBackgroundColor { get; set; } = Color.White;
    public UmlImageFormat DiagramImageFormat { get; set; } = UmlImageFormat.Png;
}
