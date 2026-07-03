namespace PDFEditor.Core.Models;

public sealed class ImageElementModel
{
    public required string Id { get; init; }
    public required int PageIndex { get; init; }
    public required string XObjectName { get; init; }
    public required PdfBounds Bounds { get; set; }
    public required PdfBounds OriginalBounds { get; set; }
    public double[] Transform { get; set; } = [1, 0, 0, 1, 0, 0];
    public double[] OriginalTransform { get; set; } = [1, 0, 0, 1, 0, 0];
    public string? ReplacementImagePath { get; set; }
    public int ContentStreamIndex { get; init; }

    public bool IsModified =>
        !string.IsNullOrWhiteSpace(ReplacementImagePath) ||
        !BoundsEqual(Bounds, OriginalBounds);

    private static bool BoundsEqual(PdfBounds a, PdfBounds b) =>
        Math.Abs(a.Left - b.Left) < 0.01 &&
        Math.Abs(a.Bottom - b.Bottom) < 0.01 &&
        Math.Abs(a.Width - b.Width) < 0.01 &&
        Math.Abs(a.Height - b.Height) < 0.01;
}
