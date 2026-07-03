using UglyToad.PdfPig.Tokens;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Graphics.Operations;
using UglyToad.PdfPig.Graphics.Operations.TextShowing;

namespace MyPDFEditorWinV10.Services;

internal static class PdfTextSequenceByteCollector
{
	public static Dictionary<int, byte[]> Collect(Page page)
	{
		Dictionary<int, byte[]> bytesBySequence = new Dictionary<int, byte[]>();
		int textSequence = 0;
		HashSet<string> visitedForms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		CollectFromOperations(page, page.Operations, ref textSequence, visitedForms, bytesBySequence);
		return bytesBySequence;
	}

	private static void CollectFromOperations(
		Page page,
		IReadOnlyList<IGraphicsStateOperation> operations,
		ref int textSequence,
		ISet<string> visitedForms,
		Dictionary<int, byte[]> bytesBySequence)
	{
		foreach (IGraphicsStateOperation operation in operations)
		{
			if (operation is InvokeNamedXObject invokeNamedXObject)
			{
				string formName = invokeNamedXObject.Name.Data;
				if (visitedForms.Add(formName) &&
					PdfContentStreamWalker.TryLoadSourceFormOperations(page, formName, out List<IGraphicsStateOperation> formOperations))
				{
					CollectFromOperations(page, formOperations, ref textSequence, visitedForms, bytesBySequence);
				}

				continue;
			}

			int sequenceCount = PdfContentStreamWalker.GetTextSequenceCount(operation);
			if (sequenceCount == 0)
			{
				continue;
			}

			if (operation is ShowTextsWithPositioning positioning && sequenceCount > 1)
			{
				int tokenIndex = 0;
				foreach (object token in positioning.Array)
				{
					byte[] tokenBytes = GetTokenBytes(token);
					if (tokenBytes == null)
					{
						continue;
					}

					bytesBySequence[textSequence + tokenIndex] = tokenBytes;
					tokenIndex++;
				}
			}
			else
			{
				byte[] bytes = GetOperationBytes(operation);
				if (bytes != null)
				{
					bytesBySequence[textSequence] = bytes;
				}
			}

			textSequence += sequenceCount;
		}
	}

	public static byte[] GetOperationBytes(IGraphicsStateOperation operation)
	{
		switch (operation)
		{
			case ShowText showText when !showText.Bytes.IsEmpty:
				return showText.Bytes.ToArray();
			case ShowText showText when !string.IsNullOrEmpty(showText.Text):
				return OtherEncodings.StringAsLatin1Bytes(showText.Text);
			case MoveToNextLineShowText moveText when !string.IsNullOrEmpty(moveText.Text):
				return OtherEncodings.StringAsLatin1Bytes(moveText.Text);
			case MoveToNextLineShowTextWithSpacing spacing when !string.IsNullOrEmpty(spacing.Text):
				return OtherEncodings.StringAsLatin1Bytes(spacing.Text);
			case ShowTextsWithPositioning positioning:
				return ExtractPrimaryBytes(positioning);
			default:
				return null;
		}
	}

	private static byte[] ExtractPrimaryBytes(ShowTextsWithPositioning positioning)
	{
		foreach (object token in positioning.Array)
		{
			byte[] tokenBytes = GetTokenBytes(token);
			if (tokenBytes != null)
			{
				return tokenBytes;
			}
		}

		return null;
	}

	private static byte[] GetTokenBytes(object token)
	{
		return token switch
		{
			StringToken stringToken => OtherEncodings.StringAsLatin1Bytes(stringToken.Data),
			HexToken hexToken => hexToken.Bytes.ToArray(),
			_ => null
		};
	}
}
