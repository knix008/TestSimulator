using DBToolsWinV10.Analysis;
using DBToolsWinV10.Models;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

namespace DBToolsWinV10.Export;

public static class PdfExporter
{
	private const double Margin = 40d;
	private const double LineHeight = 16d;

	public static void Export(DbSchema schema, string filePath, string projectPath = null)
	{
		schema.EnsureInitialized();
		IReadOnlyList<NormalizationIssue> issues = NormalizationAnalyzer.Analyze(schema);
		EnsureFontSettings();
		using PdfDocument document = new PdfDocument();
		document.Info.Title = $"{schema.Name} - DB 설계 보고서";
		PdfPage page = document.AddPage();
		XGraphics gfx = XGraphics.FromPdfPage(page);
		XFont titleFont = new XFont("Malgun Gothic", 16, XFontStyleEx.Bold);
		XFont headingFont = new XFont("Malgun Gothic", 12, XFontStyleEx.Bold);
		XFont bodyFont = new XFont("Malgun Gothic", 10, XFontStyleEx.Regular);
		double y = Margin;
		y = DrawLine(gfx, page, titleFont, "데이터베이스 설계 보고서", Margin, y);
		y += 8d;
		y = DrawLine(gfx, page, bodyFont, $"스키마 이름: {schema.Name}", Margin, y);
		y = DrawLine(gfx, page, bodyFont, $"대상 DB: {DbTargetTypeHelper.GetDisplayName(schema.TargetDb)}", Margin, y);
		y = DrawLine(gfx, page, bodyFont, $"작성 일시: {DateTime.Now:yyyy-MM-dd HH:mm:ss}", Margin, y);
		if (!string.IsNullOrWhiteSpace(projectPath))
		{
			y = DrawLine(gfx, page, bodyFont, $"프로젝트 파일: {projectPath}", Margin, y);
		}
		y = DrawLine(gfx, page, bodyFont, $"테이블 수: {schema.Tables.Count}", Margin, y);
		y = DrawLine(gfx, page, bodyFont, $"관계 수: {schema.Relationships.Count}", Margin, y);
		y += 8d;
		y = DrawLine(gfx, page, headingFont, "테이블 목록", Margin, y);
		foreach (DbTable table in schema.Tables)
		{
			(page, gfx, y) = EnsureSpace(document, page, gfx, y);
			y = DrawLine(gfx, page, headingFont, table.Name, Margin, y);
			if (!string.IsNullOrWhiteSpace(table.Comment))
			{
				(page, gfx, y) = EnsureSpace(document, page, gfx, y);
				y = DrawLine(gfx, page, bodyFont, table.Comment, Margin + 12d, y);
			}
			if (table.Columns == null || table.Columns.Count == 0)
			{
				(page, gfx, y) = EnsureSpace(document, page, gfx, y);
				y = DrawLine(gfx, page, bodyFont, "(컬럼 없음)", Margin + 12d, y);
				continue;
			}
			foreach (DbColumn column in table.Columns)
			{
				if (column == null)
				{
					continue;
				}
				(page, gfx, y) = EnsureSpace(document, page, gfx, y);
				string line = $"{column.Name}  |  {column.GetTypeDisplay()}  |  PK:{Mark(column.IsPrimaryKey)}  |  NULL:{Mark(column.IsNullable)}  |  기본값:{column.DefaultValue ?? "-"}";
				y = DrawLine(gfx, page, bodyFont, line, Margin + 12d, y);
			}
			y += 4d;
		}
		(page, gfx, y) = EnsureSpace(document, page, gfx, y);
		y = DrawLine(gfx, page, headingFont, "관계 목록", Margin, y);
		if (schema.Relationships.Count == 0)
		{
			y = DrawLine(gfx, page, bodyFont, "(관계 없음)", Margin, y);
		}
		else
		{
			foreach (DbRelationship relationship in schema.Relationships)
			{
				DbTable sourceTable = schema.FindTable(relationship.SourceTableId);
				DbTable targetTable = schema.FindTable(relationship.TargetTableId);
				DbColumn sourceColumn = sourceTable == null ? null : schema.FindColumn(relationship.SourceTableId, relationship.SourceColumnId);
				DbColumn targetColumn = targetTable == null ? null : schema.FindColumn(relationship.TargetTableId, relationship.TargetColumnId);
				string name = string.IsNullOrWhiteSpace(relationship.Name) ? "-" : relationship.Name;
				string line = $"{name}  |  {FormatRelationshipType(relationship.Type)}  |  {FormatEndpoint(sourceTable?.Name, sourceColumn?.Name)} -> {FormatEndpoint(targetTable?.Name, targetColumn?.Name)}";
				(page, gfx, y) = EnsureSpace(document, page, gfx, y);
				y = DrawLine(gfx, page, bodyFont, line, Margin + 12d, y);
			}
		}
		(page, gfx, y) = EnsureSpace(document, page, gfx, y);
		y = DrawLine(gfx, page, headingFont, "정규화 검사 결과", Margin, y);
		if (issues.Count == 0)
		{
			DrawLine(gfx, page, bodyFont, "발견된 문제가 없습니다.", Margin, y);
		}
		else
		{
			y = DrawLine(gfx, page, bodyFont, $"총 {issues.Count}건의 항목이 발견되었습니다.", Margin, y);
			foreach (NormalizationIssue issue in issues)
			{
				(page, gfx, y) = EnsureSpace(document, page, gfx, y);
				string line = $"[{issue.Level}/{issue.Severity}] {issue.Table}: {issue.Message}";
				y = DrawLine(gfx, page, bodyFont, line, Margin + 12d, y);
			}
		}
		document.Save(filePath);
	}

	private static void EnsureFontSettings()
	{
		if (GlobalFontSettings.FontResolver == null)
		{
			GlobalFontSettings.UseWindowsFontsUnderWindows = true;
		}
	}

	private static (PdfPage Page, XGraphics Gfx, double Y) EnsureSpace(PdfDocument document, PdfPage page, XGraphics gfx, double y)
	{
		if (y > page.Height.Point - Margin)
		{
			page = document.AddPage();
			gfx = XGraphics.FromPdfPage(page);
			y = Margin;
		}
		return (page, gfx, y);
	}

	private static double DrawLine(XGraphics gfx, PdfPage page, XFont font, string text, double x, double y)
	{
		gfx.DrawString(text, font, XBrushes.Black, new XRect(x, y, page.Width.Point - Margin * 2d, LineHeight), XStringFormats.TopLeft);
		return y + LineHeight;
	}

	private static string Mark(bool value) => value ? "Y" : "N";

	private static string FormatRelationshipType(RelationshipType type) => type switch
	{
		RelationshipType.OneToOne => "1:1",
		RelationshipType.OneToMany => "1:N",
		RelationshipType.ManyToMany => "N:M",
		_ => "?"
	};

	private static string FormatEndpoint(string table, string column)
	{
		if (string.IsNullOrWhiteSpace(table))
		{
			return "?";
		}
		return string.IsNullOrWhiteSpace(column) ? table : $"{table}.{column}";
	}
}
