namespace MyPDFEditorWinV10.Models;

public readonly struct PdfBounds
{
	public PdfBounds(int pageIndex, double left, double bottom, double right, double top)
	{
		PageIndex = pageIndex;
		Left = left;
		Bottom = bottom;
		Right = right;
		Top = top;
	}

	public int PageIndex { get; }

	public double Left { get; }

	public double Bottom { get; }

	public double Right { get; }

	public double Top { get; }

	public bool Intersects(PdfTextBlock block)
	{
		return block.PageIndex == PageIndex &&
			block.Left < Right &&
			block.Right > Left &&
			block.Bottom < Top &&
			block.Top > Bottom;
	}

	public PdfBounds Union(PdfBounds other)
	{
		return new PdfBounds(
			PageIndex,
			Math.Min(Left, other.Left),
			Math.Min(Bottom, other.Bottom),
			Math.Max(Right, other.Right),
			Math.Max(Top, other.Top));
	}
}
