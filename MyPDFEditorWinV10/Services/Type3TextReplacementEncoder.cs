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
			return Array.Empty<byte>();
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

		throw new InvalidOperationException(
			$"'{character}' 문자는 이 PDF 폰트(Type3)에서 사용할 수 없습니다. " +
			$"같은 텍스트 영역에 이미 있는 글자로만 바꿀 수 있습니다.");
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
