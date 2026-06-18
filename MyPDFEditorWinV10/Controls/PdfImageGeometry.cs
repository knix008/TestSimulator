using System.Drawing;
using PdfiumViewer;

namespace MyPDFEditorWinV10.Controls;

internal static class PdfImageGeometry
{
	public static RectangleF ToPdfiumRectangle(double left, double bottom, double right, double top)
	{
		return new RectangleF(
			(float)left,
			(float)top,
			(float)(right - left),
			(float)(bottom - top));
	}

	public static PdfRectangle ToPdfRectangle(int pageIndex, double left, double bottom, double right, double top)
	{
		return new PdfRectangle(pageIndex, ToPdfiumRectangle(left, bottom, right, top));
	}

	public static bool ContainsPdfPoint(double left, double bottom, double right, double top, PointF pdfPoint, float tolerance = 3f)
	{
		return pdfPoint.X >= left - tolerance &&
			pdfPoint.X <= right + tolerance &&
			pdfPoint.Y >= bottom - tolerance &&
			pdfPoint.Y <= top + tolerance;
	}
}
