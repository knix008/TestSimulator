using MyPDFEditorWinV10.Models;

namespace MyPDFEditorWinV10.Services;

internal static class TextReplacementDistribution
{
	public static string GetReplacementPart(PdfTextBlock block, int sequence)
	{
		if (block == null)
		{
			return string.Empty;
		}

		List<PdfTextSequencePart> parts = block.SourceSequenceParts
			.OrderBy(part => part.Sequence)
			.ToList();
		if (parts.Count == 0 && block.SourceTextSequences.Count > 0)
		{
			List<int> sequences = block.SourceTextSequences.OrderBy(sequence => sequence).ToList();
			int sequenceIndex = sequences.IndexOf(sequence);
			if (sequenceIndex < 0)
			{
				return null;
			}

			string fallbackText = block.Text ?? string.Empty;
			return sequenceIndex < fallbackText.Length ? fallbackText[sequenceIndex].ToString() : string.Empty;
		}

		if (parts.Count == 0)
		{
			return block.Text ?? string.Empty;
		}

		int index = parts.FindIndex(part => part.Sequence == sequence);
		if (index < 0)
		{
			return null;
		}

		string newText = block.Text ?? string.Empty;
		if (parts.All(part => part.Text.Length <= 1))
		{
			return index < newText.Length ? newText[index].ToString() : string.Empty;
		}

		string originalText = block.OriginalText ?? string.Empty;
		if (originalText.Length == 0)
		{
			return index == 0 ? newText : string.Empty;
		}

		int beforeOriginalChars = parts.Take(index).Sum(part => part.Text.Length);
		int partOriginalLength = parts[index].Text.Length;
		int newStart = (int)Math.Round(beforeOriginalChars / (double)originalText.Length * newText.Length);
		int newLength = index == parts.Count - 1
			? newText.Length - newStart
			: (int)Math.Round(partOriginalLength / (double)originalText.Length * newText.Length);
		newLength = Math.Clamp(newLength, 0, newText.Length - newStart);
		return newLength == 0 ? string.Empty : newText.Substring(newStart, newLength);
	}
}
