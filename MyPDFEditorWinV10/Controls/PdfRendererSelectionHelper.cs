using System.Drawing;
using System.Reflection;
using PdfiumViewer;

namespace MyPDFEditorWinV10.Controls;

internal static class PdfRendererSelectionHelper
{
	private static readonly FieldInfo TextSelectionStateField = typeof(PdfRenderer).GetField("_textSelectionState", BindingFlags.Instance | BindingFlags.NonPublic);

	public static IReadOnlyList<Rectangle> GetSelectionRectangles(PdfRenderer renderer)
	{
		if (renderer.Document == null || TextSelectionStateField == null)
		{
			return Array.Empty<Rectangle>();
		}

		object state = TextSelectionStateField.GetValue(renderer);
		if (state == null)
		{
			return Array.Empty<Rectangle>();
		}

		object normalized = state.GetType().GetMethod("GetNormalized")?.Invoke(state, null);
		if (normalized == null)
		{
			return Array.Empty<Rectangle>();
		}

		Type stateType = normalized.GetType();
		int startPage = (int)stateType.GetProperty("StartPage")!.GetValue(normalized)!;
		int startIndex = (int)stateType.GetProperty("StartIndex")!.GetValue(normalized)!;
		int endPage = (int)stateType.GetProperty("EndPage")!.GetValue(normalized)!;
		int endIndex = (int)stateType.GetProperty("EndIndex")!.GetValue(normalized)!;
		if (endPage < 0 || endIndex < 0)
		{
			return Array.Empty<Rectangle>();
		}

		List<Rectangle> rectangles = new List<Rectangle>();
		for (int page = startPage; page <= endPage; page++)
		{
			int start = page == startPage ? startIndex : 0;
			int end = page == endPage ? endIndex + 1 : renderer.Document.CountCharacters(page);
			if (end <= start)
			{
				continue;
			}

			foreach (PdfRectangle pdfRectangle in renderer.Document.GetTextRectangles(page, start, end - start))
			{
				Rectangle bounds = renderer.BoundsFromPdf(pdfRectangle);
				if (!bounds.IsEmpty)
				{
					rectangles.Add(bounds);
				}
			}
		}

		return rectangles;
	}

	public static void ClearTextSelection(PdfRenderer renderer)
	{
		if (TextSelectionStateField == null)
		{
			return;
		}

		TextSelectionStateField.SetValue(renderer, null);
		renderer.Invalidate();
	}

	public static bool IsOverText(PdfRenderer renderer, Point rendererPoint)
	{
		if (renderer.Document == null)
		{
			return false;
		}

		PdfPoint pdfPoint = renderer.PointToPdf(rendererPoint);
		if (!pdfPoint.IsValid)
		{
			return false;
		}

		return renderer.Document.GetCharacterIndexAtPosition(pdfPoint, 4f, 4f) >= 0;
	}
}
