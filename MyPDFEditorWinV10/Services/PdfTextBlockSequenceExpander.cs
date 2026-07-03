using MyPDFEditorWinV10.Models;
using UglyToad.PdfPig.Content;

namespace MyPDFEditorWinV10.Services;

internal static class PdfTextBlockSequenceExpander
{
	private const double BaselineTolerance = 3d;

	public static void ExpandForReplacement(PdfTextBlock block, Page page, IReadOnlyDictionary<int, byte[]> bytesBySequence)
	{
		if (block == null || page == null || block.SourceTextSequences.Count == 0)
		{
			return;
		}

		block.EnsureBaseline();
		int minSequence = block.SourceTextSequences.Min();
		int maxSequence = block.SourceTextSequences.Max();

		foreach (Letter letter in page.Letters)
		{
			if (letter.TextSequence < minSequence || letter.TextSequence > maxSequence)
			{
				continue;
			}

			if (Math.Abs(letter.StartBaseLine.Y - block.BaselineY) > BaselineTolerance)
			{
				continue;
			}

			if (!FontMatches(letter.FontName, block.FontName))
			{
				continue;
			}

			AddSequencePart(block, letter.TextSequence, letter.Value, bytesBySequence);
		}
	}

	private static bool FontMatches(string letterFontName, string blockFontName)
	{
		if (string.IsNullOrEmpty(letterFontName) || string.IsNullOrEmpty(blockFontName))
		{
			return false;
		}

		return string.Equals(letterFontName, blockFontName, StringComparison.OrdinalIgnoreCase);
	}

	private static void AddSequencePart(
		PdfTextBlock block,
		int sequence,
		string text,
		IReadOnlyDictionary<int, byte[]> bytesBySequence)
	{
		if (block.SourceTextSequences.Contains(sequence))
		{
			return;
		}

		bytesBySequence.TryGetValue(sequence, out byte[] sourceBytes);
		block.SourceTextSequences.Add(sequence);
		block.SourceSequenceParts.Add(new PdfTextSequencePart
		{
			Sequence = sequence,
			Text = text ?? string.Empty,
			SourceBytes = sourceBytes
		});
	}
}
