using System.Drawing;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Export;

public static class ReportExporter
{
	public const string SaveFileFilter =
		"Markdown 보고서 (*.md)|*.md|Excel 보고서 (*.xlsx)|*.xlsx|Word 보고서 (*.docx)|*.docx|PDF 보고서 (*.pdf)|*.pdf|텍스트 (*.txt)|*.txt";

	public static ReportFormat GetFormatFromPath(string filePath)
	{
		string extension = Path.GetExtension(filePath)?.ToLowerInvariant();
		return extension switch
		{
			".md" => ReportFormat.Markdown,
			".xlsx" => ReportFormat.Excel,
			".docx" => ReportFormat.Word,
			".pdf" => ReportFormat.Pdf,
			".txt" => ReportFormat.PlainText,
			_ => ReportFormat.Markdown
		};
	}

	public static string GetDefaultExtension(ReportFormat format)
	{
		return format switch
		{
			ReportFormat.Markdown => "md",
			ReportFormat.Excel => "xlsx",
			ReportFormat.Word => "docx",
			ReportFormat.Pdf => "pdf",
			ReportFormat.PlainText => "txt",
			_ => "md"
		};
	}

	public static string GetDisplayName(ReportFormat format)
	{
		return format switch
		{
			ReportFormat.Markdown => "Markdown",
			ReportFormat.Excel => "Excel",
			ReportFormat.Word => "Word",
			ReportFormat.Pdf => "PDF",
			ReportFormat.PlainText => "텍스트",
			_ => format.ToString()
		};
	}

	public static void Export(DbSchema schema, string filePath, ReportFormat format, string projectPath = null, Bitmap diagramImage = null)
	{
		switch (format)
		{
		case ReportFormat.Markdown:
		case ReportFormat.PlainText:
			MarkdownExporter.Export(schema, filePath, projectPath, diagramImage);
			return;
		case ReportFormat.Excel:
			ExcelExporter.Export(schema, filePath, projectPath, diagramImage);
			return;
		case ReportFormat.Word:
			WordExporter.Export(schema, filePath, projectPath, diagramImage);
			return;
		case ReportFormat.Pdf:
			PdfExporter.Export(schema, filePath, projectPath, diagramImage);
			return;
		default:
			throw new NotSupportedException($"지원하지 않는 보고서 형식입니다: {format}");
		}
	}

	public static bool OfferOpenInNotepad(ReportFormat format)
	{
		return format is ReportFormat.Markdown or ReportFormat.PlainText;
	}
}
