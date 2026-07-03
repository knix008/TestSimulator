using MyPDFEditorWinV10.Models;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace MyPDFEditorWinV10.Services;

internal static class Type3GlyphCatalog
{
	public static void PopulateBlock(PdfTextBlock block, Page page, IReadOnlyDictionary<int, byte[]> bytesBySequence)
	{
		if (block == null || !block.IsType3Font || string.IsNullOrEmpty(block.FontName))
		{
			return;
		}

		MergeParts(block.Type3GlyphMap, block.SourceSequenceParts);
		if (page != null)
		{
			MergePageLetters(block.Type3GlyphMap, page, block.FontName, bytesBySequence);
		}
	}

	public static void PopulateBlockFromDocument(
		PdfTextBlock block,
		PdfDocument document,
		IReadOnlyDictionary<int, byte[]> pageBytesBySequence,
		Page currentPage)
	{
		PopulateBlock(block, currentPage, pageBytesBySequence);
		if (block == null || !block.IsType3Font || string.IsNullOrEmpty(block.FontName) || document == null)
		{
			return;
		}

		foreach (Page page in document.GetPages())
		{
			IReadOnlyDictionary<int, byte[]> bytesBySequence = ReferenceEquals(page, currentPage) && pageBytesBySequence != null
				? pageBytesBySequence
				: PdfTextSequenceByteCollector.Collect(page);
			MergePageLetters(block.Type3GlyphMap, page, block.FontName, bytesBySequence);
		}
	}

	public static bool TryGetGlyphBytes(IReadOnlyDictionary<char, byte[]> glyphMap, char character, out byte[] bytes)
	{
		bytes = null;
		if (glyphMap == null || glyphMap.Count == 0)
		{
			return false;
		}

		if (glyphMap.TryGetValue(character, out bytes) && bytes != null && bytes.Length > 0)
		{
			return true;
		}

		if (character >= 'a' && character <= 'z')
		{
			char upper = char.ToUpperInvariant(character);
			if (glyphMap.TryGetValue(upper, out bytes) && bytes != null && bytes.Length > 0)
			{
				return true;
			}
		}

		if (character >= 'A' && character <= 'Z')
		{
			char lower = char.ToLowerInvariant(character);
			if (glyphMap.TryGetValue(lower, out bytes) && bytes != null && bytes.Length > 0)
			{
				return true;
			}
		}

		return false;
	}

	public static string FormatAvailableCharacters(IReadOnlyDictionary<char, byte[]> glyphMap, int maxLength = 120)
	{
		if (glyphMap == null || glyphMap.Count == 0)
		{
			return "(없음)";
		}

		string text = new string(glyphMap.Keys
			.Where(character => !char.IsWhiteSpace(character) && !char.IsControl(character))
			.OrderBy(character => character)
			.ToArray());

		if (text.Length <= maxLength)
		{
			return text;
		}

		return text.Substring(0, maxLength) + "…";
	}

	private static void MergeParts(Dictionary<char, byte[]> glyphMap, IEnumerable<PdfTextSequencePart> parts)
	{
		foreach (PdfTextSequencePart part in parts)
		{
			if (part.SourceBytes == null || part.SourceBytes.Length == 0 || string.IsNullOrEmpty(part.Text))
			{
				continue;
			}

			foreach (char character in part.Text)
			{
				glyphMap.TryAdd(character, part.SourceBytes);
			}
		}
	}

	private static void MergePageLetters(
		Dictionary<char, byte[]> glyphMap,
		Page page,
		string fontName,
		IReadOnlyDictionary<int, byte[]> bytesBySequence)
	{
		if (page == null || string.IsNullOrEmpty(fontName))
		{
			return;
		}

		foreach (Letter letter in page.Letters)
		{
			if (!FontMatches(letter.FontName, fontName) || string.IsNullOrEmpty(letter.Value))
			{
				continue;
			}

			byte[] sourceBytes = null;
			bytesBySequence?.TryGetValue(letter.TextSequence, out sourceBytes);
			if (sourceBytes == null || sourceBytes.Length == 0)
			{
				continue;
			}

			foreach (char character in letter.Value)
			{
				glyphMap.TryAdd(character, sourceBytes);
			}
		}
	}

	private static bool FontMatches(string letterFontName, string blockFontName)
	{
		return !string.IsNullOrEmpty(letterFontName) &&
			string.Equals(letterFontName, blockFontName, StringComparison.OrdinalIgnoreCase);
	}
}
