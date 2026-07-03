namespace PDFEditor.Core.Models;

public sealed class PdfBounds
{
    public double Left { get; set; }
    public double Bottom { get; set; }
    public double Right { get; set; }
    public double Top { get; set; }

    public double Width => Right - Left;
    public double Height => Top - Bottom;

    public static PdfBounds Clone(PdfBounds source) =>
        new()
        {
            Left = source.Left,
            Bottom = source.Bottom,
            Right = source.Right,
            Top = source.Top
        };

    public void SetSize(double width, double height)
    {
        Right = Left + width;
        Top = Bottom + height;
    }
}
