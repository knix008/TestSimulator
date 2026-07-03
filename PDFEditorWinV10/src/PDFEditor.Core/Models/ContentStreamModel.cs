namespace PDFEditor.Core.Models;

public sealed class ContentStreamModel
{
    public required int Index { get; init; }
    public required string DataBase64 { get; init; }
    public bool Preserved { get; init; } = true;
}
