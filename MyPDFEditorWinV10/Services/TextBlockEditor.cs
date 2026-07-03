using MyPDFEditorWinV10.Models;

namespace MyPDFEditorWinV10.Services;

public static class TextBlockEditor
{
	private const double LineGroupingThreshold = 3d;

	public static List<PdfTextBlock> FindMatchingBlocks(IList<PdfTextBlock> blocks, int pageIndex, IReadOnlyList<PdfBounds> selectionBounds)
	{
		List<PdfTextBlock> matched = new List<PdfTextBlock>();
		foreach (PdfTextBlock block in blocks.Where(block => block.PageIndex == pageIndex))
		{
			if (selectionBounds.Any(bounds => bounds.Intersects(block)))
			{
				matched.Add(block);
			}
		}

		return matched
			.OrderByDescending(block => block.Top)
			.ThenBy(block => block.Left)
			.ToList();
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

		List<PdfTextBlock> ordered = matched
			.OrderByDescending(block => block.Top)
			.ThenBy(block => block.Left)
			.ToList();
		PdfTextBlock primary = ordered[0];
		bool singleLine = ordered.All(block => Math.Abs(block.Top - primary.Top) <= LineGroupingThreshold);
		primary.Text = singleLine
			? string.Join(" ", ordered.Select(block => block.Text))
			: string.Join(Environment.NewLine, ordered.Select(block => block.Text));
		primary.OriginalText = singleLine
			? string.Join(" ", ordered.Select(block => block.OriginalText))
			: string.Join(Environment.NewLine, ordered.Select(block => block.OriginalText));

		primary.Left = ordered.Min(block => block.Left);
		primary.Bottom = ordered.Min(block => block.Bottom);
		primary.Right = ordered.Max(block => block.Right);
		primary.Top = ordered.Max(block => block.Top);
		primary.FontSize = ordered.Max(block => block.FontSize);
		PdfTextBlock baselineSource = ordered
			.OrderBy(block => block.BaselineX)
			.ThenByDescending(block => block.Top)
			.First();
		baselineSource.EnsureBaseline();
		primary.BaselineX = baselineSource.BaselineX;
		primary.BaselineY = baselineSource.BaselineY;

		foreach (PdfTextBlock extra in ordered)
		{
			primary.UnionOriginalBounds(extra);
		}

		foreach (PdfTextBlock extra in ordered.Skip(1))
		{
			extra.EnsureOriginalBounds();
			primary.AbsorbSourceTextSequences(extra);
			primary.AdditionalCoverAreas.Add(new PdfBounds(
				pageIndex,
				extra.OriginalLeft,
				extra.OriginalBottom,
				extra.OriginalRight,
				extra.OriginalTop));
			blocks.Remove(extra);
		}

		return primary;
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
