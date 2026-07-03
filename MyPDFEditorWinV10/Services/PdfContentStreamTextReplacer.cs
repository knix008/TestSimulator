using System.Reflection;
using MyPDFEditorWinV10.Models;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Filters;
using UglyToad.PdfPig.Graphics;
using UglyToad.PdfPig.Graphics.Operations;
using UglyToad.PdfPig.Graphics.Operations.TextShowing;
using UglyToad.PdfPig.Logging;
using UglyToad.PdfPig.Parser;
using UglyToad.PdfPig.Parser.Parts;
using UglyToad.PdfPig.Tokens;
using UglyToad.PdfPig.Tokenization.Scanner;
using UglyToad.PdfPig.Writer;

namespace MyPDFEditorWinV10.Services;

public static class PdfContentStreamTextReplacer
{
	private static readonly PageContentParser ContentParser = new PageContentParser(
		ReflectionGraphicsStateOperationFactory.Instance,
		StackDepthGuard.Infinite,
		true);

	public static void ApplyTextReplacements(
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		PdfDocument sourceDocument,
		Page sourcePage,
		IReadOnlyList<PdfTextBlock> modifiedBlocks)
	{
		if (pageBuilder == null || modifiedBlocks == null || modifiedBlocks.Count == 0)
		{
			return;
		}

		Dictionary<int, PdfTextBlock> ownerBySequence = BuildSequenceOwnerMap(modifiedBlocks);
		Dictionary<PdfTextBlock, string> replacementTextByBlock = modifiedBlocks.ToDictionary(
			block => block,
			block => block.Text ?? string.Empty);

		int textSequence = 0;
		HashSet<string> updatedForms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

		foreach (PdfPageBuilder.IContentStream contentStream in pageBuilder.ContentStreams)
		{
			IList<IGraphicsStateOperation> operations = TryGetWritableOperations(contentStream);
			if (operations == null || operations.Count == 0)
			{
				continue;
			}

			ProcessOperationList(
				operations,
				pageBuilder,
				documentBuilder,
				ownerBySequence,
				replacementTextByBlock,
				ref textSequence,
				updatedForms);
		}
	}

	private static Dictionary<int, PdfTextBlock> BuildSequenceOwnerMap(IReadOnlyList<PdfTextBlock> modifiedBlocks)
	{
		Dictionary<int, PdfTextBlock> map = new Dictionary<int, PdfTextBlock>();
		foreach (PdfTextBlock block in modifiedBlocks)
		{
			foreach (int sequence in block.SourceTextSequences)
			{
				map.TryAdd(sequence, block);
			}
		}

		return map;
	}

	private static bool ProcessOperationList(
		IList<IGraphicsStateOperation> operations,
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		IReadOnlyDictionary<int, PdfTextBlock> ownerBySequence,
		IReadOnlyDictionary<PdfTextBlock, string> replacementTextByBlock,
		ref int textSequence,
		ISet<string> updatedForms)
	{
		List<IGraphicsStateOperation> filtered = new List<IGraphicsStateOperation>(operations.Count);
		Dictionary<PdfTextBlock, int> insertAtIndex = new Dictionary<PdfTextBlock, int>();
		bool changed = false;

		for (int index = 0; index < operations.Count; index++)
		{
			IGraphicsStateOperation operation = operations[index];
			if (operation is InvokeNamedXObject invokeNamedXObject)
			{
				string formName = invokeNamedXObject.Name.Data;
				if (updatedForms.Contains(formName))
				{
					AdvanceTextSequenceCount(formName, pageBuilder, documentBuilder, ref textSequence);
				}
				else if (TryProcessFormXObject(
					pageBuilder,
					documentBuilder,
					formName,
					ownerBySequence,
					replacementTextByBlock,
					ref textSequence,
					updatedForms))
				{
					changed = true;
				}

				filtered.Add(operation);
				continue;
			}

			int sequenceCount = GetTextSequenceCount(operation);
			if (sequenceCount == 0)
			{
				filtered.Add(operation);
				continue;
			}

			if (OperationMatchesModifiedText(textSequence, sequenceCount, ownerBySequence))
			{
				for (int offset = 0; offset < sequenceCount; offset++)
				{
					if (ownerBySequence.TryGetValue(textSequence + offset, out PdfTextBlock owner) &&
						!insertAtIndex.ContainsKey(owner))
					{
						insertAtIndex[owner] = filtered.Count;
					}
				}

				changed = true;
			}
			else
			{
				filtered.Add(operation);
			}

			textSequence += sequenceCount;
		}

		foreach (KeyValuePair<PdfTextBlock, int> insert in insertAtIndex.OrderByDescending(pair => pair.Value))
		{
			if (!replacementTextByBlock.TryGetValue(insert.Key, out string replacementText) || string.IsNullOrEmpty(replacementText))
			{
				continue;
			}

			filtered.Insert(insert.Value, new ShowText(replacementText));
			changed = true;
		}

		if (!changed)
		{
			return false;
		}

		operations.Clear();
		foreach (IGraphicsStateOperation operation in filtered)
		{
			operations.Add(operation);
		}

		return true;
	}

	private static void AdvanceTextSequenceCount(
		string formName,
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		ref int textSequence)
	{
		if (!TryLoadOutputFormOperations(pageBuilder, documentBuilder, formName, out List<IGraphicsStateOperation> formOperations))
		{
			return;
		}

		foreach (IGraphicsStateOperation operation in formOperations)
		{
			if (operation is InvokeNamedXObject nestedForm)
			{
				AdvanceTextSequenceCount(nestedForm.Name.Data, pageBuilder, documentBuilder, ref textSequence);
				continue;
			}

			textSequence += GetTextSequenceCount(operation);
		}
	}

	private static bool TryProcessFormXObject(
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		string formName,
		IReadOnlyDictionary<int, PdfTextBlock> ownerBySequence,
		IReadOnlyDictionary<PdfTextBlock, string> replacementTextByBlock,
		ref int textSequence,
		ISet<string> updatedForms)
	{
		if (!TryLoadOutputFormOperations(pageBuilder, documentBuilder, formName, out List<IGraphicsStateOperation> formOperations))
		{
			return false;
		}

		int sequenceBefore = textSequence;
		bool changed = ProcessOperationList(
			formOperations,
			pageBuilder,
			documentBuilder,
			ownerBySequence,
			replacementTextByBlock,
			ref textSequence,
			updatedForms);

		if (!changed)
		{
			return false;
		}

		byte[] encoded = PdfOperationStreamEncoder.Encode(formOperations);
		if (encoded.Length == 0)
		{
			textSequence = sequenceBefore;
			return false;
		}

		if (!PdfPigBuilderAccess.TryReplaceXObjectStream(documentBuilder, pageBuilder, formName, encoded))
		{
			textSequence = sequenceBefore;
			return false;
		}

		updatedForms.Add(formName);
		return true;
	}

	private static bool TryLoadOutputFormOperations(
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		string formName,
		out List<IGraphicsStateOperation> operations)
	{
		operations = null;
		if (!TryGetPageResources(pageBuilder, out DictionaryToken resources) ||
			!resources.TryGet(NameToken.Xobject, out IToken xObjectToken) ||
			xObjectToken is not DictionaryToken xObjects ||
			!xObjects.TryGet(NameToken.Create(formName), out IToken formToken))
		{
			return false;
		}

		IPdfTokenScanner scanner = TryGetBuilderScanner(documentBuilder);
		if (scanner == null || !DirectObjectFinder.TryGet(formToken, scanner, out StreamToken streamToken))
		{
			return false;
		}

		byte[] decoded = streamToken.Decode(DefaultFilterProvider.Instance).ToArray();
		operations = ContentParser.Parse(0, new MemoryInputBytes(decoded), SilentLog.Instance).ToList();
		return operations.Count > 0;
	}

	private static IPdfTokenScanner TryGetBuilderScanner(PdfDocumentBuilder documentBuilder)
	{
		FieldInfo contextField = typeof(PdfDocumentBuilder).GetField("context", BindingFlags.Instance | BindingFlags.NonPublic);
		return contextField?.GetValue(documentBuilder) as IPdfTokenScanner;
	}

	private static bool TryGetPageResources(PdfPageBuilder pageBuilder, out DictionaryToken resources)
	{
		resources = null;
		FieldInfo pageDictionaryField = typeof(PdfPageBuilder).GetField("pageDictionary", BindingFlags.Instance | BindingFlags.NonPublic);
		if (pageDictionaryField?.GetValue(pageBuilder) is not Dictionary<NameToken, IToken> pageDictionary ||
			!pageDictionary.TryGetValue(NameToken.Resources, out IToken resourcesToken) ||
			resourcesToken is not DictionaryToken resourcesDictionary)
		{
			return false;
		}

		resources = resourcesDictionary;
		return true;
	}

	private static IList<IGraphicsStateOperation> TryGetWritableOperations(PdfPageBuilder.IContentStream contentStream)
	{
		try
		{
			return contentStream.Operations;
		}
		catch (NotSupportedException)
		{
			return null;
		}
	}

	private static bool OperationMatchesModifiedText(
		int startSequence,
		int sequenceCount,
		IReadOnlyDictionary<int, PdfTextBlock> ownerBySequence)
	{
		for (int offset = 0; offset < sequenceCount; offset++)
		{
			if (ownerBySequence.ContainsKey(startSequence + offset))
			{
				return true;
			}
		}

		return false;
	}

	private static int GetTextSequenceCount(IGraphicsStateOperation operation)
	{
		switch (operation)
		{
			case ShowText:
			case MoveToNextLineShowText:
			case MoveToNextLineShowTextWithSpacing:
				return 1;
			case ShowTextsWithPositioning showTextsWithPositioning:
				return 1 + showTextsWithPositioning.Array.Count(token => token is StringToken or HexToken);
			default:
				return 0;
		}
	}

	private sealed class SilentLog : ILog
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
