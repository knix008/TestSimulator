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

	public static HashSet<PdfTextBlock> ApplyToWritablePage(
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		Page sourcePage,
		IReadOnlyList<PdfTextBlock> modifiedBlocks)
	{
		if (pageBuilder == null || sourcePage == null || modifiedBlocks == null || modifiedBlocks.Count == 0)
		{
			return new HashSet<PdfTextBlock>();
		}

		IList<IGraphicsStateOperation> operations = PdfPigBuilderAccess.TryGetWritableOperations(pageBuilder);
		if (operations == null || operations.Count == 0)
		{
			return ApplyToSourcePage(pageBuilder, documentBuilder, sourcePage, modifiedBlocks);
		}

		Dictionary<int, byte[]> bytesBySequence = PdfTextSequenceByteCollector.Collect(sourcePage);
		foreach (PdfTextBlock block in modifiedBlocks.Where(block => block.IsType3Font))
		{
			EnrichType3GlyphsFromPage(sourcePage, block, bytesBySequence);
		}

		return ApplyToOperations(operations, pageBuilder, documentBuilder, sourcePage, modifiedBlocks);
	}

	public static HashSet<PdfTextBlock> ApplyToSourcePage(
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		Page sourcePage,
		IReadOnlyList<PdfTextBlock> modifiedBlocks)
	{
		if (pageBuilder == null || sourcePage == null || modifiedBlocks == null || modifiedBlocks.Count == 0)
		{
			return new HashSet<PdfTextBlock>();
		}

		List<IGraphicsStateOperation> operations = sourcePage.Operations.ToList();
		Dictionary<int, byte[]> bytesBySequence = PdfTextSequenceByteCollector.Collect(sourcePage);
		foreach (PdfTextBlock block in modifiedBlocks.Where(block => block.IsType3Font))
		{
			EnrichType3GlyphsFromPage(sourcePage, block, bytesBySequence);
		}

		HashSet<PdfTextBlock> replacedBlocks = ApplyToOperations(
			operations,
			pageBuilder,
			documentBuilder,
			sourcePage,
			modifiedBlocks);

		if (replacedBlocks.Count > 0)
		{
			PdfPigBuilderAccess.TryReplacePrimaryContentOperations(pageBuilder, operations);
		}

		return replacedBlocks;
	}

	public static HashSet<PdfTextBlock> ApplyToOperations(
		IList<IGraphicsStateOperation> operations,
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		Page sourcePage,
		IReadOnlyList<PdfTextBlock> modifiedBlocks)
	{
		HashSet<PdfTextBlock> replacedBlocks = new HashSet<PdfTextBlock>();
		if (operations == null || operations.Count == 0 || modifiedBlocks == null || modifiedBlocks.Count == 0 || sourcePage == null)
		{
			return replacedBlocks;
		}

		HashSet<int> modifiedSequences = new HashSet<int>();
		HashSet<string> visitedForms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

		Dictionary<int, PdfTextBlock> ownerBySequence = BuildSequenceOwnerMap(modifiedBlocks);
		Dictionary<PdfTextBlock, string> replacementTextByBlock = modifiedBlocks.ToDictionary(
			block => block,
			block => block.Text ?? string.Empty);

		int textSequence = 0;
		HashSet<string> updatedForms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		HashSet<string> processedForms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
		ProcessOperationList(
			operations,
			pageBuilder,
			documentBuilder,
			sourcePage,
			ownerBySequence,
			replacementTextByBlock,
			ref textSequence,
			updatedForms,
			processedForms,
			visitedForms,
			modifiedSequences);

		return BuildReplacedBlocks(modifiedBlocks, modifiedSequences);
	}

	private static HashSet<PdfTextBlock> BuildReplacedBlocks(IReadOnlyList<PdfTextBlock> modifiedBlocks, ISet<int> modifiedSequences)
	{
		HashSet<PdfTextBlock> replacedBlocks = new HashSet<PdfTextBlock>();
		foreach (PdfTextBlock block in modifiedBlocks)
		{
			if (block.SourceTextSequences.Count == 0)
			{
				continue;
			}

			if (block.SourceTextSequences.All(modifiedSequences.Contains))
			{
				replacedBlocks.Add(block);
			}
		}

		return replacedBlocks;
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
		Page sourcePage,
		IReadOnlyDictionary<int, PdfTextBlock> ownerBySequence,
		IReadOnlyDictionary<PdfTextBlock, string> replacementTextByBlock,
		ref int textSequence,
		ISet<string> updatedForms,
		ISet<string> processedForms,
		ISet<string> visitedForms,
		ISet<int> modifiedSequences)
	{
		bool changed = false;

		for (int index = 0; index < operations.Count; index++)
		{
			IGraphicsStateOperation operation = operations[index];
			if (operation is InvokeNamedXObject invokeNamedXObject)
			{
				string formName = invokeNamedXObject.Name.Data;
				if (processedForms.Contains(formName))
				{
					AdvanceTextSequenceCountFromSource(sourcePage, formName, ref textSequence, visitedForms);
				}
				else if (TryProcessFormXObject(
					pageBuilder,
					documentBuilder,
					sourcePage,
					formName,
					ownerBySequence,
					replacementTextByBlock,
					ref textSequence,
					updatedForms,
					processedForms,
					visitedForms,
					modifiedSequences))
				{
					processedForms.Add(formName);
					changed = true;
				}
				else
				{
					AdvanceTextSequenceCountFromSource(sourcePage, formName, ref textSequence, visitedForms);
				}

				continue;
			}

			int sequenceCount = PdfContentStreamWalker.GetTextSequenceCount(operation);
			if (sequenceCount == 0)
			{
				continue;
			}

			if (OperationMatchesModifiedText(textSequence, sequenceCount, ownerBySequence))
			{
				if (ownerBySequence.TryGetValue(textSequence, out PdfTextBlock owner))
				{
					string replacementPart = TextReplacementDistribution.GetReplacementPart(owner, textSequence);
					if (replacementPart != null)
					{
						operations[index] = ModifyOperationText(operation, owner, textSequence, replacementPart);
						modifiedSequences.Add(textSequence);
						changed = true;
					}
				}
			}

			textSequence += sequenceCount;
		}

		return changed;
	}

	private static void AdvanceTextSequenceCountFromSource(
		Page sourcePage,
		string formName,
		ref int textSequence,
		ISet<string> visitedForms)
	{
		if (!visitedForms.Add(formName) ||
			!PdfContentStreamWalker.TryLoadSourceFormOperations(sourcePage, formName, out List<IGraphicsStateOperation> formOperations))
		{
			return;
		}

		foreach (IGraphicsStateOperation operation in formOperations)
		{
			if (operation is InvokeNamedXObject nestedForm)
			{
				AdvanceTextSequenceCountFromSource(sourcePage, nestedForm.Name.Data, ref textSequence, visitedForms);
				continue;
			}

			textSequence += PdfContentStreamWalker.GetTextSequenceCount(operation);
		}
	}

	private static bool TryProcessFormXObject(
		PdfPageBuilder pageBuilder,
		PdfDocumentBuilder documentBuilder,
		Page sourcePage,
		string formName,
		IReadOnlyDictionary<int, PdfTextBlock> ownerBySequence,
		IReadOnlyDictionary<PdfTextBlock, string> replacementTextByBlock,
		ref int textSequence,
		ISet<string> updatedForms,
		ISet<string> processedForms,
		ISet<string> visitedForms,
		ISet<int> modifiedSequences)
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
			sourcePage,
			ownerBySequence,
			replacementTextByBlock,
			ref textSequence,
			updatedForms,
			processedForms,
			visitedForms,
			modifiedSequences);

		if (!changed)
		{
			return true;
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

	private static void EnrichType3GlyphsFromPage(
		Page sourcePage,
		PdfTextBlock block,
		IReadOnlyDictionary<int, byte[]> bytesBySequence)
	{
		HashSet<int> knownSequences = block.SourceSequenceParts.Select(part => part.Sequence).ToHashSet();
		foreach (Letter letter in sourcePage.Letters)
		{
			if (!IsType3Letter(letter, block) || knownSequences.Contains(letter.TextSequence))
			{
				continue;
			}

			bytesBySequence.TryGetValue(letter.TextSequence, out byte[] sourceBytes);
			block.SourceSequenceParts.Add(new PdfTextSequencePart
			{
				Sequence = letter.TextSequence,
				Text = letter.Value.ToString(),
				SourceBytes = sourceBytes
			});
			knownSequences.Add(letter.TextSequence);
		}
	}

	private static bool IsType3Letter(Letter letter, PdfTextBlock block)
	{
		if (letter == null)
		{
			return false;
		}

		if (!string.IsNullOrEmpty(block.FontName) &&
			string.Equals(letter.FontName, block.FontName, StringComparison.OrdinalIgnoreCase))
		{
			return true;
		}

		return !string.IsNullOrEmpty(letter.FontName) &&
			letter.FontName.Contains("Type3", StringComparison.OrdinalIgnoreCase);
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

	private static IGraphicsStateOperation ModifyOperationText(
		IGraphicsStateOperation operation,
		PdfTextBlock owner,
		int sequence,
		string text)
	{
		text ??= string.Empty;
		if (owner.IsType3Font)
		{
			byte[] bytes = Type3TextReplacementEncoder.GetReplacementBytes(owner, sequence, text);
			return new ShowText(new ReadOnlyMemory<byte>(bytes));
		}

		return operation switch
		{
			ShowText => new ShowText(text),
			MoveToNextLineShowText => new MoveToNextLineShowText(text),
			MoveToNextLineShowTextWithSpacing => new MoveToNextLineShowText(text),
			ShowTextsWithPositioning positioning => ReplacePrimaryTextInPositioning(positioning, text),
			_ => operation
		};
	}

	private static ShowTextsWithPositioning ReplacePrimaryTextInPositioning(ShowTextsWithPositioning positioning, string text)
	{
		List<IToken> updated = new List<IToken>(positioning.Array);
		bool replaced = false;
		for (int i = 0; i < updated.Count; i++)
		{
			if (updated[i] is StringToken or HexToken)
			{
				updated[i] = new StringToken(text);
				replaced = true;
				break;
			}
		}

		if (!replaced)
		{
			updated.Insert(0, new StringToken(text));
		}

		return new ShowTextsWithPositioning(updated);
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
