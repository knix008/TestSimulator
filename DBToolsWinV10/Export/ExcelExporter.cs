using System.Drawing;
using ClosedXML.Excel;
using DBToolsWinV10.Analysis;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Export;

public static class ExcelExporter
{
	public static void Export(DbSchema schema, string filePath, string projectPath = null, Bitmap diagramImage = null)
	{
		schema.EnsureInitialized();
		IReadOnlyList<NormalizationIssue> issues = NormalizationAnalyzer.Analyze(schema);
		using XLWorkbook workbook = new XLWorkbook();
		WriteSummarySheet(workbook.Worksheets.Add("요약"), schema, projectPath);
		if (diagramImage != null)
		{
			WriteDiagramSheet(workbook.Worksheets.Add("ERD"), diagramImage);
		}
		WriteTablesSheet(workbook.Worksheets.Add("테이블"), schema);
		WriteRelationshipsSheet(workbook.Worksheets.Add("관계"), schema);
		WriteNormalizationSheet(workbook.Worksheets.Add("정규화"), issues);
		workbook.SaveAs(filePath);
	}

	private static void WriteSummarySheet(IXLWorksheet sheet, DbSchema schema, string projectPath)
	{
		sheet.Cell(1, 1).Value = "항목";
		sheet.Cell(1, 2).Value = "값";
		sheet.Range(1, 1, 1, 2).Style.Font.Bold = true;
		int row = 2;
		WritePair(sheet, ref row, "스키마 이름", schema.Name);
		WritePair(sheet, ref row, "대상 DB", DbTargetTypeHelper.GetDisplayName(schema.TargetDb));
		WritePair(sheet, ref row, "작성 일시", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
		if (!string.IsNullOrWhiteSpace(projectPath))
		{
			WritePair(sheet, ref row, "프로젝트 파일", projectPath);
		}
		WritePair(sheet, ref row, "테이블 수", schema.Tables.Count.ToString());
		WritePair(sheet, ref row, "관계 수", schema.Relationships.Count.ToString());
		sheet.Columns().AdjustToContents();
	}

	private static void WriteDiagramSheet(IXLWorksheet sheet, Bitmap diagramImage)
	{
		sheet.Cell(1, 1).Value = "ERD 다이어그램";
		sheet.Cell(1, 1).Style.Font.Bold = true;
		using MemoryStream stream = new MemoryStream();
		diagramImage.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
		stream.Position = 0;
		var picture = sheet.AddPicture(stream);
		picture.MoveTo(sheet.Cell(2, 1));
		Size scaled = ReportDiagramHelper.ScaleToMaxWidth(diagramImage, ReportDiagramHelper.DefaultMaxImageWidth);
		if (scaled.Width > 0 && scaled.Height > 0)
		{
			picture.Width = scaled.Width;
			picture.Height = scaled.Height;
		}
	}

	private static void WriteTablesSheet(IXLWorksheet sheet, DbSchema schema)
	{
		string[] headers = ["테이블", "설명", "컬럼", "타입", "PK", "자동증가", "NULL", "UNIQUE", "기본값", "컬럼 설명"];
		for (int i = 0; i < headers.Length; i++)
		{
			sheet.Cell(1, i + 1).Value = headers[i];
		}
		sheet.Row(1).Style.Font.Bold = true;
		int row = 2;
		foreach (DbTable table in schema.Tables)
		{
			if (table.Columns == null || table.Columns.Count == 0)
			{
				sheet.Cell(row, 1).Value = table.Name;
				sheet.Cell(row, 2).Value = table.Comment ?? string.Empty;
				row++;
				continue;
			}
			foreach (DbColumn column in table.Columns)
			{
				if (column == null)
				{
					continue;
				}
				sheet.Cell(row, 1).Value = table.Name;
				sheet.Cell(row, 2).Value = table.Comment ?? string.Empty;
				sheet.Cell(row, 3).Value = column.Name;
				sheet.Cell(row, 4).Value = column.GetTypeDisplay();
				sheet.Cell(row, 5).Value = Mark(column.IsPrimaryKey);
				sheet.Cell(row, 6).Value = Mark(column.IsAutoIncrement);
				sheet.Cell(row, 7).Value = Mark(column.IsNullable);
				sheet.Cell(row, 8).Value = Mark(column.IsUnique);
				sheet.Cell(row, 9).Value = column.DefaultValue ?? string.Empty;
				sheet.Cell(row, 10).Value = column.Comment ?? string.Empty;
				row++;
			}
		}
		sheet.Columns().AdjustToContents();
	}

	private static void WriteRelationshipsSheet(IXLWorksheet sheet, DbSchema schema)
	{
		string[] headers = ["이름", "유형", "소스", "타겟"];
		for (int i = 0; i < headers.Length; i++)
		{
			sheet.Cell(1, i + 1).Value = headers[i];
		}
		sheet.Row(1).Style.Font.Bold = true;
		int row = 2;
		foreach (DbRelationship relationship in schema.Relationships)
		{
			DbTable sourceTable = schema.FindTable(relationship.SourceTableId);
			DbTable targetTable = schema.FindTable(relationship.TargetTableId);
			DbColumn sourceColumn = sourceTable == null ? null : schema.FindColumn(relationship.SourceTableId, relationship.SourceColumnId);
			DbColumn targetColumn = targetTable == null ? null : schema.FindColumn(relationship.TargetTableId, relationship.TargetColumnId);
			sheet.Cell(row, 1).Value = relationship.Name ?? string.Empty;
			sheet.Cell(row, 2).Value = FormatRelationshipType(relationship.Type);
			sheet.Cell(row, 3).Value = FormatEndpoint(sourceTable?.Name, sourceColumn?.Name);
			sheet.Cell(row, 4).Value = FormatEndpoint(targetTable?.Name, targetColumn?.Name);
			row++;
		}
		sheet.Columns().AdjustToContents();
	}

	private static void WriteNormalizationSheet(IXLWorksheet sheet, IReadOnlyList<NormalizationIssue> issues)
	{
		string[] headers = ["수준", "심각도", "테이블", "문제 컬럼", "문제", "권장"];
		for (int i = 0; i < headers.Length; i++)
		{
			sheet.Cell(1, i + 1).Value = headers[i];
		}
		sheet.Row(1).Style.Font.Bold = true;
		int row = 2;
		foreach (NormalizationIssue issue in issues)
		{
			sheet.Cell(row, 1).Value = issue.Level.ToString();
			sheet.Cell(row, 2).Value = issue.Severity.ToString();
			sheet.Cell(row, 3).Value = issue.Table;
			sheet.Cell(row, 4).Value = issue.AffectedColumns ?? string.Empty;
			sheet.Cell(row, 5).Value = issue.Message;
			sheet.Cell(row, 6).Value = issue.Hint ?? string.Empty;
			row++;
		}
		sheet.Columns().AdjustToContents();
	}

	private static void WritePair(IXLWorksheet sheet, ref int row, string key, string value)
	{
		sheet.Cell(row, 1).Value = key;
		sheet.Cell(row, 2).Value = value;
		row++;
	}

	private static string Mark(bool value) => value ? "Y" : string.Empty;

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
