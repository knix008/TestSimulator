using MyPDFEditorWinV10.Models;

namespace MyPDFEditorWinV10.Services;

internal static class Type3EditValidator
{
	public static void ValidateBlock(PdfTextBlock block)
	{
		if (block == null || !block.IsType3Font || !block.IsModified)
		{
			return;
		}

		string text = block.Text ?? string.Empty;
		foreach (char character in text)
		{
			if (char.IsWhiteSpace(character))
			{
				continue;
			}

			if (Type3GlyphCatalog.TryGetGlyphBytes(block.Type3GlyphMap, character, out _))
			{
				continue;
			}

			string available = Type3GlyphCatalog.FormatAvailableCharacters(block.Type3GlyphMap);
			throw new InvalidOperationException(
				$"'{character}' 문자는 이 PDF 폰트(Type3)에 글리프가 없습니다. " +
				$"이 PDF 전체에서 같은 폰트로 이미 사용된 글자로만 바꿀 수 있습니다.\n" +
				$"사용 가능한 글자 예: {available}");
		}
	}
}
