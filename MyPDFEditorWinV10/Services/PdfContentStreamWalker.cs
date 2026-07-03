using System.Reflection;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Filters;
using UglyToad.PdfPig.Graphics;
using UglyToad.PdfPig.Graphics.Operations;
using UglyToad.PdfPig.Graphics.Operations.TextShowing;
using UglyToad.PdfPig.Parser;
using UglyToad.PdfPig.Parser.Parts;
using UglyToad.PdfPig.Tokens;
using UglyToad.PdfPig.Tokenization.Scanner;

namespace MyPDFEditorWinV10.Services;

internal static class PdfContentStreamWalker
{
	private static readonly PageContentParser ContentParser = new PageContentParser(
		ReflectionGraphicsStateOperationFactory.Instance,
		StackDepthGuard.Infinite,
		true);

	public static int CountTextSequences(Page sourcePage)
	{
		int count = 0;
		WalkOperations(sourcePage, sourcePage.Operations, ref count, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
		return count;
	}

	public static void WalkOperations(
		Page sourcePage,
		IReadOnlyList<IGraphicsStateOperation> operations,
		ref int textSequence,
		ISet<string> visitedForms)
	{
		foreach (IGraphicsStateOperation operation in operations)
		{
			if (operation is InvokeNamedXObject invokeNamedXObject)
			{
				string formName = invokeNamedXObject.Name.Data;
				if (visitedForms.Add(formName) &&
					TryLoadSourceFormOperations(sourcePage, formName, out List<IGraphicsStateOperation> formOperations))
				{
					WalkOperations(sourcePage, formOperations, ref textSequence, visitedForms);
				}

				continue;
			}

			textSequence += GetTextSequenceCount(operation);
		}
	}

	public static bool TryLoadSourceFormOperations(Page sourcePage, string formName, out List<IGraphicsStateOperation> operations)
	{
		operations = null;
		IPdfTokenScanner scanner = GetPageScanner(sourcePage);
		if (scanner == null ||
			sourcePage?.Dictionary == null ||
			!sourcePage.Dictionary.TryGet(NameToken.Resources, scanner, out DictionaryToken resources) ||
			!resources.TryGet(NameToken.Xobject, scanner, out DictionaryToken xObjects) ||
			!xObjects.TryGet(NameToken.Create(formName), scanner, out IToken formToken))
		{
			return false;
		}

		if (!DirectObjectFinder.TryGet(formToken, scanner, out StreamToken streamToken))
		{
			return false;
		}

		byte[] decoded = streamToken.Decode(DefaultFilterProvider.Instance).ToArray();
		operations = ContentParser.Parse(0, new MemoryInputBytes(decoded), SilentLog.Instance).ToList();
		return operations.Count > 0;
	}

	public static int GetTextSequenceCount(IGraphicsStateOperation operation)
	{
		return operation switch
		{
			ShowText => 1,
			MoveToNextLineShowText => 1,
			MoveToNextLineShowTextWithSpacing => 1,
			ShowTextsWithPositioning => 1,
			_ => 0
		};
	}

	private static IPdfTokenScanner GetPageScanner(Page sourcePage)
	{
		FieldInfo scannerField = typeof(Page).GetField("pdfScanner", BindingFlags.Instance | BindingFlags.NonPublic);
		return scannerField?.GetValue(sourcePage) as IPdfTokenScanner;
	}

	private sealed class SilentLog : UglyToad.PdfPig.Logging.ILog
	{
		public static readonly SilentLog Instance = new SilentLog();

		public void Debug(string message)
		{
		}

		public void Debug(string message, Exception exception)
		{
		}

		public void Warn(string message)
		{
		}

		public void Error(string message)
		{
		}

		public void Error(string message, Exception exception)
		{
		}
	}
}
