using System.IO;
using MyPDFEditorWinV10.Models;
using MyPDFEditorWinV10.Services;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Writer;

namespace MyPDFEditorWinV10.Export;

public static class LayoutPreservingPdfExporter
{
	public static void Export(EditableDocument document, string filePath)
	{
		if (!document.CanUseLayoutPreservingExport())
		{
			throw new InvalidOperationException("레이아웃 유지 PDF 저장을 위해 원본 PDF와 텍스트 블록이 필요합니다.");
		}

		ParsingOptions options = new ParsingOptions();
		if (!string.IsNullOrEmpty(document.PdfPassword))
		{
			options.Password = document.PdfPassword;
		}

		using PdfDocument source = PdfDocument.Open(document.SourcePdfPath, options);
		using PdfDocumentBuilder builder = new PdfDocumentBuilder();

		List<PdfTextBlock> allModifiedBlocks = document.TextBlocks
			.Where(block => block.IsModified)
			.ToList();

		for (int pageNumber = 1; pageNumber <= source.NumberOfPages; pageNumber++)
		{
			int pageIndex = pageNumber - 1;
			List<PdfTextBlock> modifiedBlocks = allModifiedBlocks
				.Where(block => block.PageIndex == pageIndex)
				.ToList();

			PdfPageBuilder pageBuilder = builder.AddPage(source, pageNumber);
			if (modifiedBlocks.Count == 0)
			{
				continue;
			}

			Page sourcePage = source.GetPage(pageNumber);
			HashSet<PdfTextBlock> replacedBlocks = PdfContentStreamTextReplacer.ApplyToSourcePage(
				pageBuilder,
				builder,
				sourcePage,
				modifiedBlocks);

			List<PdfTextBlock> unreplaced = modifiedBlocks
				.Where(block => !replacedBlocks.Contains(block))
				.ToList();
			if (unreplaced.Count > 0)
			{
				string preview = string.Join(", ", unreplaced.Take(3).Select(block => $"'{Truncate(block.OriginalText, 24)}'"));
				throw new InvalidOperationException(
					$"페이지 {pageNumber}에서 {unreplaced.Count}개 텍스트 블록을 PDF 콘텐츠 스트림에서 교체하지 못했습니다. ({preview})");
			}
		}

		byte[] pdfBytes = builder.Build();
		File.WriteAllBytes(filePath, pdfBytes);
	}

	private static string Truncate(string value, int maxLength)
	{
		if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
		{
			return value ?? string.Empty;
		}

		return value.Substring(0, maxLength) + "…";
	}
}
