using System.Reflection;
using UglyToad.PdfPig.Graphics.Operations;
using UglyToad.PdfPig.Tokens;
using UglyToad.PdfPig.Writer;

namespace MyPDFEditorWinV10.Services;

internal static class PdfPigBuilderAccess
{
	private static readonly FieldInfo ContextField = typeof(PdfDocumentBuilder).GetField("context", BindingFlags.Instance | BindingFlags.NonPublic);
	private static readonly FieldInfo PageDictionaryField = typeof(PdfPageBuilder).GetField("pageDictionary", BindingFlags.Instance | BindingFlags.NonPublic);
	private static readonly FieldInfo ContentStreamsField = typeof(PdfPageBuilder).GetField("contentStreams", BindingFlags.Instance | BindingFlags.NonPublic);
	private static readonly FieldInfo CurrentStreamField = typeof(PdfPageBuilder).GetField("currentStream", BindingFlags.Instance | BindingFlags.NonPublic);
	private static readonly Type DefaultContentStreamType = typeof(PdfPageBuilder).GetNestedType("DefaultContentStream", BindingFlags.NonPublic);

	public static IList<IGraphicsStateOperation> TryGetWritableOperations(PdfPageBuilder pageBuilder)
	{
		if (pageBuilder == null)
		{
			return null;
		}

		foreach (PdfPageBuilder.IContentStream contentStream in pageBuilder.ContentStreams)
		{
			try
			{
				IList<IGraphicsStateOperation> operations = contentStream.Operations;
				if (operations != null && operations.Count > 0)
				{
					return operations;
				}
			}
			catch (NotSupportedException)
			{
			}
		}

		return null;
	}

	public static bool TryReplacePrimaryContentOperations(PdfPageBuilder pageBuilder, IList<IGraphicsStateOperation> operations)
	{
		if (pageBuilder == null || operations == null || DefaultContentStreamType == null ||
			ContentStreamsField == null || CurrentStreamField == null)
		{
			return false;
		}

		if (Activator.CreateInstance(DefaultContentStreamType, operations) is not object replacementStream)
		{
			return false;
		}

		if (ContentStreamsField.GetValue(pageBuilder) is not System.Collections.IList contentStreams || contentStreams.Count == 0)
		{
			return false;
		}

		contentStreams[0] = replacementStream;
		if (contentStreams.Count > 1)
		{
			contentStreams.RemoveAt(contentStreams.Count - 1);
		}

		CurrentStreamField.SetValue(pageBuilder, replacementStream);
		return true;
	}

	public static bool TryReplaceXObjectStream(PdfDocumentBuilder builder, PdfPageBuilder pageBuilder, string xObjectName, byte[] rawContent)
	{
		if (builder == null || pageBuilder == null || string.IsNullOrWhiteSpace(xObjectName) || rawContent == null || rawContent.Length == 0)
		{
			return false;
		}

		object writer = ContextField?.GetValue(builder);
		if (writer == null)
		{
			return false;
		}

		Dictionary<NameToken, IToken> pageDictionary = PageDictionaryField?.GetValue(pageBuilder) as Dictionary<NameToken, IToken>;
		if (pageDictionary == null || !pageDictionary.TryGetValue(NameToken.Resources, out IToken resourcesToken))
		{
			return false;
		}

		if (resourcesToken is not DictionaryToken resources || !resources.TryGet(NameToken.Xobject, out IToken xObjectToken))
		{
			return false;
		}

		if (xObjectToken is not DictionaryToken xObjects || !xObjects.TryGet(NameToken.Create(xObjectName), out IToken _))
		{
			return false;
		}

		MethodInfo writeTokenMethod = writer.GetType().GetMethod("WriteToken", new[] { typeof(IToken) });
		if (writeTokenMethod == null)
		{
			return false;
		}

		DictionaryToken streamDictionary = new DictionaryToken(new Dictionary<NameToken, IToken>
		{
			[NameToken.Length] = new NumericToken(rawContent.Length)
		});

		StreamToken streamToken = new StreamToken(streamDictionary, rawContent);
		if (writeTokenMethod.Invoke(writer, new object[] { streamToken }) is not IndirectReferenceToken newReference)
		{
			return false;
		}

		DictionaryToken updatedXObjects = xObjects.With(xObjectName, newReference);
		pageDictionary[NameToken.Resources] = resources.With(NameToken.Xobject, updatedXObjects);
		return true;
	}
}
