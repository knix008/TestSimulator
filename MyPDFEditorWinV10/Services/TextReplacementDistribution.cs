using MyPDFEditorWinV10.Models;

namespace MyPDFEditorWinV10.Services;

internal static class TextReplacementDistribution
{
	public static string GetReplacementPart(PdfTextBlock block, int sequence)
	{
		if (block == null || !block.SourceTextSequences.Contains(sequence))
		{
			return null;
		}

		List<int> orderedSequences = block.SourceTextSequences.OrderBy(value => value).ToList();
		int slotIndex = orderedSequences.IndexOf(sequence);
		if (slotIndex < 0)
		{
			return null;
		}

		string replacementGlyphs = StripWhitespace(block.Text ?? string.Empty);
		if (orderedSequences.Count <= 1)
		{
			return replacementGlyphs;
		}

		return slotIndex < replacementGlyphs.Length
			? replacementGlyphs[slotIndex].ToString()
			: string.Empty;
	}

	private static string StripWhitespace(string text)
	{
		if (string.IsNullOrEmpty(text))
		{
			return string.Empty;
		}

		return string.Concat(text.Where(character => !char.IsWhiteSpace(character)));
	}
}
