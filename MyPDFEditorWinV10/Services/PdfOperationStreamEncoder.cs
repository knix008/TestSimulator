using System.IO;
using UglyToad.PdfPig.Graphics.Operations;

namespace MyPDFEditorWinV10.Services;

internal static class PdfOperationStreamEncoder
{
	public static byte[] Encode(IReadOnlyList<IGraphicsStateOperation> operations)
	{
		using MemoryStream stream = new MemoryStream();
		foreach (IGraphicsStateOperation operation in operations)
		{
			operation.Write(stream);
		}

		return stream.ToArray();
	}
}
