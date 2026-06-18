using System.Drawing;

namespace MyPDFEditorWinV10.Models;

public sealed class PdfImageBlock : IDisposable
{
	public int PageIndex { get; init; }

	public double Left { get; init; }

	public double Bottom { get; init; }

	public double Right { get; init; }

	public double Top { get; init; }

	public Bitmap Bitmap { get; set; }

	public void Dispose()
	{
		Bitmap?.Dispose();
		Bitmap = null;
	}
}
