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

		for (int pageNumber = 1; pageNumber <= source.NumberOfPages; pageNumber++)
		{
			int pageIndex = pageNumber - 1;
			List<PdfTextBlock> modifiedBlocks = document.TextBlocks
				.Where(block => block.IsModified && block.PageIndex == pageIndex)
				.ToList();

			if (modifiedBlocks.Count == 0)
			{
				builder.AddPage(source, pageNumber);
				continue;
			}

			Page sourcePage = source.GetPage(pageNumber);
			PdfPageBuilder pageBuilder = builder.AddPage(sourcePage.Width, sourcePage.Height);
			pageBuilder.CopyFrom(sourcePage);
			PdfContentStreamTextReplacer.ApplyTextReplacements(
				pageBuilder,
				builder,
				source,
				sourcePage,
				modifiedBlocks);
		}

		byte[] pdfBytes = builder.Build();
		File.WriteAllBytes(filePath, pdfBytes);
	}
}
