namespace MyPDFEditorWinV10.Models;

public sealed class PdfTextBlock
{
	public int PageIndex { get; init; }

	public string Text { get; set; } = string.Empty;

	public string OriginalText { get; set; } = string.Empty;

	public double Left { get; set; }

	public double Bottom { get; set; }

	public double Right { get; set; }

	public double Top { get; set; }

	public double FontSize { get; set; }

	public string FontName { get; set; }

	public string FontFamilyName { get; set; }

	public bool IsType3Font { get; set; }

	public bool IsBold { get; set; }

	public bool IsItalic { get; set; }

	public byte FillColorR { get; set; } = 0;

	public byte FillColorG { get; set; } = 0;

	public byte FillColorB { get; set; } = 0;

	public double BaselineX { get; set; } = double.NaN;

	public double BaselineY { get; set; } = double.NaN;

	public double OriginalLeft { get; set; }

	public double OriginalBottom { get; set; }

	public double OriginalRight { get; set; }

	public double OriginalTop { get; set; }

	public HashSet<int> SourceTextSequences { get; } = new();

	public List<PdfTextSequencePart> SourceSequenceParts { get; } = new();

	public List<PdfBounds> AdditionalCoverAreas { get; } = new();

	public bool IsModified => !string.Equals(Text, OriginalText, StringComparison.Ordinal);

	public void EnsureOriginalBounds()
	{
		if (OriginalRight > OriginalLeft && OriginalTop > OriginalBottom)
		{
			return;
		}

		OriginalLeft = Left;
		OriginalBottom = Bottom;
		OriginalRight = Right;
		OriginalTop = Top;
	}

	public void EnsureBaseline()
	{
		if (!double.IsNaN(BaselineX) && !double.IsNaN(BaselineY))
		{
			return;
		}

		EnsureOriginalBounds();
		BaselineX = OriginalLeft;
		BaselineY = OriginalBottom;
	}

	public void UnionOriginalBounds(PdfTextBlock other)
	{
		if (other == null)
		{
			return;
		}

		other.EnsureOriginalBounds();
		EnsureOriginalBounds();
		OriginalLeft = Math.Min(OriginalLeft, other.OriginalLeft);
		OriginalBottom = Math.Min(OriginalBottom, other.OriginalBottom);
		OriginalRight = Math.Max(OriginalRight, other.OriginalRight);
		OriginalTop = Math.Max(OriginalTop, other.OriginalTop);
	}

	public void AbsorbSourceTextSequences(PdfTextBlock other)
	{
		if (other == null)
		{
			return;
		}

		foreach (int sequence in other.SourceTextSequences)
		{
			SourceTextSequences.Add(sequence);
		}

		foreach (PdfTextSequencePart part in other.SourceSequenceParts)
		{
			if (!SourceSequenceParts.Any(existing => existing.Sequence == part.Sequence))
			{
				SourceSequenceParts.Add(new PdfTextSequencePart
				{
					Sequence = part.Sequence,
					Text = part.Text,
					SourceBytes = part.SourceBytes
				});
			}
		}
	}
}
