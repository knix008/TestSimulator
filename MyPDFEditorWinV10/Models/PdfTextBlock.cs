namespace MyPDFEditorWinV10.Models;

public sealed class PdfTextBlock
{
	public int PageIndex { get; init; }

	public string Text { get; set; } = string.Empty;

	public double Left { get; init; }

	public double Bottom { get; init; }

	public double Right { get; init; }

	public double Top { get; init; }
}
