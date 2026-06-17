using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using DBToolsWinV10.Analysis;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Export;

public static class WordExporter
{
	public static void Export(DbSchema schema, string filePath, string projectPath = null)
	{
		schema.EnsureInitialized();
		IReadOnlyList<NormalizationIssue> issues = NormalizationAnalyzer.Analyze(schema);
		if (File.Exists(filePath))
		{
			File.Delete(filePath);
		}

		using WordprocessingDocument document = WordprocessingDocument.Create(filePath, WordprocessingDocumentType.Document);
		MainDocumentPart mainPart = document.AddMainDocumentPart();
		mainPart.Document = new Document(new Body());
		Body body = mainPart.Document.Body;
		AppendTitle(body, "데이터베이스 설계 보고서");
		AppendParagraph(body, $"스키마 이름: {schema.Name}");
		AppendParagraph(body, $"대상 DB: {DbTargetTypeHelper.GetDisplayName(schema.TargetDb)}");
		AppendParagraph(body, $"작성 일시: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
		if (!string.IsNullOrWhiteSpace(projectPath))
		{
			AppendParagraph(body, $"프로젝트 파일: {projectPath}");
		}
		AppendParagraph(body, $"테이블 수: {schema.Tables.Count}");
		AppendParagraph(body, $"관계 수: {schema.Relationships.Count}");
		AppendHeading(body, "테이블 목록");
		foreach (DbTable table in schema.Tables)
		{
			AppendHeading(body, table.Name, 2);
			if (!string.IsNullOrWhiteSpace(table.Comment))
			{
				AppendParagraph(body, table.Comment);
			}
			if (table.Columns == null || table.Columns.Count == 0)
			{
				AppendParagraph(body, "(컬럼 없음)");
				continue;
			}
			AppendTable(body,
				["컬럼", "타입", "PK", "자동증가", "NULL", "UNIQUE", "기본값", "설명"],
				table.Columns.Where(c => c != null).Select(column => new[]
				{
					column.Name,
					column.GetTypeDisplay(),
					Mark(column.IsPrimaryKey),
					Mark(column.IsAutoIncrement),
					Mark(column.IsNullable),
					Mark(column.IsUnique),
					column.DefaultValue ?? string.Empty,
					column.Comment ?? string.Empty
				}));
		}
		AppendHeading(body, "관계 목록");
		if (schema.Relationships.Count == 0)
		{
			AppendParagraph(body, "(관계 없음)");
		}
		else
		{
			AppendTable(body,
				["이름", "유형", "소스", "타겟"],
				schema.Relationships.Select(relationship =>
				{
					DbTable sourceTable = schema.FindTable(relationship.SourceTableId);
					DbTable targetTable = schema.FindTable(relationship.TargetTableId);
					DbColumn sourceColumn = sourceTable == null ? null : schema.FindColumn(relationship.SourceTableId, relationship.SourceColumnId);
					DbColumn targetColumn = targetTable == null ? null : schema.FindColumn(relationship.TargetTableId, relationship.TargetColumnId);
					return new[]
					{
						relationship.Name ?? string.Empty,
						FormatRelationshipType(relationship.Type),
						FormatEndpoint(sourceTable?.Name, sourceColumn?.Name),
						FormatEndpoint(targetTable?.Name, targetColumn?.Name)
					};
				}));
		}
		AppendHeading(body, "정규화 검사 결과");
		if (issues.Count == 0)
		{
			AppendParagraph(body, "발견된 문제가 없습니다.");
		}
		else
		{
			AppendParagraph(body, $"총 {issues.Count}건의 항목이 발견되었습니다.");
			AppendTable(body,
				["수준", "심각도", "테이블", "문제 컬럼", "문제", "권장"],
				issues.Select(issue => new[]
				{
					issue.Level.ToString(),
					issue.Severity.ToString(),
					issue.Table,
					issue.AffectedColumns ?? string.Empty,
					issue.Message,
					issue.Hint ?? string.Empty
				}));
		}
		mainPart.Document.Save();
	}

	private static void AppendTitle(Body body, string text)
	{
		Paragraph paragraph = body.AppendChild(new Paragraph());
		Run run = paragraph.AppendChild(new Run());
		run.AppendChild(new RunProperties(new Bold(), new FontSize { Val = "32" }));
		run.AppendChild(new Text(text));
	}

	private static void AppendHeading(Body body, string text, int level = 1)
	{
		Paragraph paragraph = body.AppendChild(new Paragraph());
		Run run = paragraph.AppendChild(new Run());
		int size = level <= 1 ? 28 : 24;
		run.AppendChild(new RunProperties(new Bold(), new FontSize { Val = size.ToString() }));
		run.AppendChild(new Text(text));
	}

	private static void AppendParagraph(Body body, string text)
	{
		Paragraph paragraph = body.AppendChild(new Paragraph());
		Run run = paragraph.AppendChild(new Run());
		run.AppendChild(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
	}

	private static void AppendTable(Body body, IReadOnlyList<string> headers, IEnumerable<string[]> rows)
	{
		Table table = body.AppendChild(new Table());
		TableProperties props = new TableProperties(new TableBorders(
			new TopBorder { Val = BorderValues.Single, Size = 4 },
			new BottomBorder { Val = BorderValues.Single, Size = 4 },
			new LeftBorder { Val = BorderValues.Single, Size = 4 },
			new RightBorder { Val = BorderValues.Single, Size = 4 },
			new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4 },
			new InsideVerticalBorder { Val = BorderValues.Single, Size = 4 }));
		table.AppendChild(props);
		TableRow headerRow = new TableRow();
		foreach (string header in headers)
		{
			headerRow.Append(CreateCell(header, bold: true));
		}
		table.Append(headerRow);
		foreach (string[] row in rows)
		{
			TableRow tableRow = new TableRow();
			for (int i = 0; i < headers.Count; i++)
			{
				string value = i < row.Length ? row[i] : string.Empty;
				tableRow.Append(CreateCell(value));
			}
			table.Append(tableRow);
		}
		body.AppendChild(new Paragraph());
	}

	private static TableCell CreateCell(string text, bool bold = false)
	{
		Paragraph paragraph = new Paragraph();
		Run run = new Run();
		if (bold)
		{
			run.AppendChild(new RunProperties(new Bold()));
		}
		run.AppendChild(new Text(text ?? string.Empty) { Space = SpaceProcessingModeValues.Preserve });
		paragraph.Append(run);
		return new TableCell(paragraph);
	}

	private static string Mark(bool value) => value ? "Y" : string.Empty;

	private static string FormatRelationshipType(Models.RelationshipType type) => type switch
	{
		Models.RelationshipType.OneToOne => "1:1",
		Models.RelationshipType.OneToMany => "1:N",
		Models.RelationshipType.ManyToMany => "N:M",
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
