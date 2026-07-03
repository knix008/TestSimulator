using MyPDFEditorWinV10.Models;

namespace MyPDFEditorWinV10.Services;

internal static class Type3TextReplacementEncoder
{
	public static byte[] GetReplacementBytes(PdfTextBlock block, int sequence, string replacementPart)
	{
		if (block == null)
		{
			return Array.Empty<byte>();
		}

		PdfTextSequencePart sequencePart = FindSequencePart(block, sequence);

		if (string.IsNullOrEmpty(replacementPart))
		{
			return GetClearBytes(block, sequencePart);
		}

		char character = replacementPart[0];
		if (sequencePart != null &&
			sequencePart.Text.Length == 1 &&
			sequencePart.Text[0] == character &&
			sequencePart.SourceBytes != null &&
			sequencePart.SourceBytes.Length > 0)
		{
			return sequencePart.SourceBytes;
		}

		if (Type3GlyphCatalog.TryGetGlyphBytes(block.Type3GlyphMap, character, out byte[] mappedBytes))
		{
			return mappedBytes;
		}

		foreach (PdfTextSequencePart part in block.SourceSequenceParts)
		{
			if (part.SourceBytes == null || part.SourceBytes.Length == 0 || string.IsNullOrEmpty(part.Text))
			{
				continue;
			}

			if (part.Text.Length == 1 && part.Text[0] == character)
			{
				return part.SourceBytes;
			}
		}

		string available = Type3GlyphCatalog.FormatAvailableCharacters(block.Type3GlyphMap);
		throw new InvalidOperationException(
			$"'{character}' 문자는 이 PDF 폰트(Type3)에 글리프가 없습니다. " +
			$"이 PDF에 이미 사용된 글자로만 바꿀 수 있습니다.\n" +
			$"사용 가능한 글자 예: {available}");
	}

	private static byte[] GetClearBytes(PdfTextBlock block, PdfTextSequencePart sequencePart)
	{
		if (sequencePart?.SourceBytes != null &&
			sequencePart.SourceBytes.Length > 0 &&
			sequencePart.Text?.Length == 1 &&
			char.IsWhiteSpace(sequencePart.Text[0]))
		{
			return sequencePart.SourceBytes;
		}

		if (Type3GlyphCatalog.TryGetGlyphBytes(block.Type3GlyphMap, ' ', out byte[] spaceBytes))
		{
			return spaceBytes;
		}

		foreach (PdfTextSequencePart part in block.SourceSequenceParts)
		{
			if (part.SourceBytes == null || part.SourceBytes.Length == 0 || string.IsNullOrEmpty(part.Text))
			{
				continue;
			}

			if (part.Text.Length == 1 && char.IsWhiteSpace(part.Text[0]))
			{
				return part.SourceBytes;
			}
		}

		return Array.Empty<byte>();
	}

	private static PdfTextSequencePart FindSequencePart(PdfTextBlock block, int sequence)
	{
		foreach (PdfTextSequencePart part in block.SourceSequenceParts)
		{
			if (part.Sequence == sequence)
			{
				return part;
			}
		}

		return null;
	}
}
