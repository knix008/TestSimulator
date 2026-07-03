using MyPDFEditorWinV10.Models;

namespace MyPDFEditorWinV10.Services;

internal static class TextReplacementDistribution
{
	public static Dictionary<int, string> BuildReplacementMap(PdfTextBlock block)
	{
		Dictionary<int, string> map = new Dictionary<int, string>();
		if (block == null || block.SourceTextSequences.Count == 0)
		{
			return map;
		}

		List<int> orderedSequences = block.SourceTextSequences.OrderBy(value => value).ToList();
		List<int> glyphSequences = new List<int>();
		List<int> spaceSequences = new List<int>();

		foreach (int sequence in orderedSequences)
		{
			string originalText = GetOriginalPartText(block, sequence);
			if (originalText.Length == 1 && char.IsWhiteSpace(originalText[0]))
			{
				spaceSequences.Add(sequence);
			}
			else
			{
				glyphSequences.Add(sequence);
			}
		}

		string newText = block.Text ?? string.Empty;
		if (orderedSequences.Count <= 1)
		{
			map[orderedSequences[0]] = newText;
			return map;
		}

		string replacementGlyphs = StripWhitespace(newText);
		List<char> replacementSpaces = newText.Where(char.IsWhiteSpace).ToList();

		for (int index = 0; index < glyphSequences.Count; index++)
		{
			map[glyphSequences[index]] = index < replacementGlyphs.Length
				? replacementGlyphs[index].ToString()
				: string.Empty;
		}

		for (int index = 0; index < spaceSequences.Count; index++)
		{
			map[spaceSequences[index]] = index < replacementSpaces.Count
				? replacementSpaces[index].ToString()
				: string.Empty;
		}

		return map;
	}

	public static string GetReplacementPart(PdfTextBlock block, int sequence, IReadOnlyDictionary<int, string> replacementMap = null)
	{
		if (block == null || !block.SourceTextSequences.Contains(sequence))
		{
			return null;
		}

		replacementMap ??= BuildReplacementMap(block);
		return replacementMap.TryGetValue(sequence, out string replacementPart)
			? replacementPart
			: string.Empty;
	}

	private static string GetOriginalPartText(PdfTextBlock block, int sequence)
	{
		foreach (PdfTextSequencePart part in block.SourceSequenceParts)
		{
			if (part.Sequence == sequence)
			{
				return part.Text ?? string.Empty;
			}
		}

		return string.Empty;
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
