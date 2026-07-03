using MyPDFEditorWinV10.Models;

namespace MyPDFEditorWinV10.Services;

public static class TextBlockEditor
{
	private const double SelectionPadding = 1.0d;

	public static List<PdfTextBlock> FindMatchingBlocks(IList<PdfTextBlock> blocks, int pageIndex, IReadOnlyList<PdfBounds> selectionBounds)
	{
		if (blocks == null || selectionBounds == null || selectionBounds.Count == 0)
		{
			return new List<PdfTextBlock>();
		}

		List<PdfBounds> expanded = selectionBounds
			.Where(bounds => bounds.PageIndex == pageIndex)
			.Select(Expand)
			.ToList();
		if (expanded.Count == 0)
		{
			return new List<PdfTextBlock>();
		}

		List<PdfTextBlock> matched = new List<PdfTextBlock>();
		foreach (PdfTextBlock block in blocks.Where(block => block.PageIndex == pageIndex))
		{
			if (expanded.Any(bounds => bounds.Intersects(block)))
			{
				matched.Add(block);
			}
		}

		return matched
			.OrderByDescending(block => block.Top)
			.ThenBy(block => block.Left)
			.ToList();
	}

	private static PdfBounds Expand(PdfBounds bounds)
	{
		return new PdfBounds(
			bounds.PageIndex,
			bounds.Left - SelectionPadding,
			bounds.Bottom - SelectionPadding,
			bounds.Right + SelectionPadding,
			bounds.Top + SelectionPadding);
	}

	public static PdfTextBlock ResolveEditTarget(IList<PdfTextBlock> blocks, int pageIndex, IReadOnlyList<PdfBounds> selectionBounds)
	{
		List<PdfTextBlock> matched = FindMatchingBlocks(blocks, pageIndex, selectionBounds);
		if (matched.Count == 0)
		{
			return null;
		}

		if (matched.Count == 1)
		{
			return matched[0];
		}

		PdfBounds selectionUnion = selectionBounds
			.Where(bounds => bounds.PageIndex == pageIndex)
			.Select(Expand)
			.Aggregate((acc, next) => acc.Union(next));

		return matched
			.OrderByDescending(block => ComputeOverlapArea(block, selectionUnion))
			.ThenBy(block => Math.Abs(GetBlockCenterY(block) - GetBoundsCenterY(selectionUnion)))
			.ThenBy(block => Math.Abs(GetBlockCenterX(block) - GetBoundsCenterX(selectionUnion)))
			.First();
	}

	private static double ComputeOverlapArea(PdfTextBlock block, PdfBounds bounds)
	{
		double overlapWidth = Math.Min(block.Right, bounds.Right) - Math.Max(block.Left, bounds.Left);
		double overlapHeight = Math.Min(block.Top, bounds.Top) - Math.Max(block.Bottom, bounds.Bottom);
		if (overlapWidth <= 0 || overlapHeight <= 0)
		{
			return 0d;
		}

		return overlapWidth * overlapHeight;
	}

	private static double GetBlockCenterX(PdfTextBlock block)
	{
		return (block.Left + block.Right) * 0.5d;
	}

	private static double GetBlockCenterY(PdfTextBlock block)
	{
		return (block.Bottom + block.Top) * 0.5d;
	}

	private static double GetBoundsCenterX(PdfBounds bounds)
	{
		return (bounds.Left + bounds.Right) * 0.5d;
	}

	private static double GetBoundsCenterY(PdfBounds bounds)
	{
		return (bounds.Bottom + bounds.Top) * 0.5d;
	}

	public static bool TryApplySelectionEdit(EditableDocument document, int pageIndex, IReadOnlyList<PdfBounds> selectionBounds, string newText)
	{
		if (document == null || selectionBounds == null || selectionBounds.Count == 0)
		{
			return false;
		}

		PdfTextBlock target = ResolveEditTarget(document.TextBlocks, pageIndex, selectionBounds);
		if (target == null)
		{
			return false;
		}

		target.Text = newText ?? string.Empty;
		document.SyncPageTextsFromBlocks();
		document.IsDirty = true;
		return true;
	}
}
