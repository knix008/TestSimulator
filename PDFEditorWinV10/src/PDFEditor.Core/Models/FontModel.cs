namespace PDFEditor.Core.Models;

public sealed class FontModel
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public bool Embedded { get; init; }
    public string? Encoding { get; init; }
}
