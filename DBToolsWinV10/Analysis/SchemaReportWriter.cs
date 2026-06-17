using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Text;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Analysis;

public static class SchemaReportWriter
{
	public static string Write(DbSchema schema, string projectPath = null)
	{
		StringBuilder stringBuilder = new StringBuilder();
		IReadOnlyList<NormalizationIssue> issues = NormalizationAnalyzer.Analyze(schema);
		stringBuilder.AppendLine("# 데이터베이스 설계 보고서");
		stringBuilder.AppendLine();
		StringBuilder stringBuilder2 = stringBuilder;
		StringBuilder stringBuilder3 = stringBuilder2;
		StringBuilder.AppendInterpolatedStringHandler handler = new StringBuilder.AppendInterpolatedStringHandler(14, 1, stringBuilder2);
		handler.AppendLiteral("- **스키마 이름**: ");
		handler.AppendFormatted(schema.Name);
		stringBuilder3.AppendLine(ref handler);
		stringBuilder2 = stringBuilder;
		StringBuilder stringBuilder4 = stringBuilder2;
		handler = new StringBuilder.AppendInterpolatedStringHandler(13, 1, stringBuilder2);
		handler.AppendLiteral("- **대상 DB**: ");
		handler.AppendFormatted(schema.TargetDb);
		stringBuilder4.AppendLine(ref handler);
		stringBuilder2 = stringBuilder;
		StringBuilder stringBuilder5 = stringBuilder2;
		handler = new StringBuilder.AppendInterpolatedStringHandler(13, 1, stringBuilder2);
		handler.AppendLiteral("- **작성 일시**: ");
		handler.AppendFormatted(DateTime.Now, "yyyy-MM-dd HH:mm:ss");
		stringBuilder5.AppendLine(ref handler);
		if (!string.IsNullOrWhiteSpace(projectPath))
		{
			stringBuilder2 = stringBuilder;
			StringBuilder stringBuilder6 = stringBuilder2;
			handler = new StringBuilder.AppendInterpolatedStringHandler(15, 1, stringBuilder2);
			handler.AppendLiteral("- **프로젝트 파일**: ");
			handler.AppendFormatted(projectPath);
			stringBuilder6.AppendLine(ref handler);
		}
		stringBuilder2 = stringBuilder;
		StringBuilder stringBuilder7 = stringBuilder2;
		handler = new StringBuilder.AppendInterpolatedStringHandler(13, 1, stringBuilder2);
		handler.AppendLiteral("- **테이블 수**: ");
		handler.AppendFormatted(schema.Tables.Count);
		stringBuilder7.AppendLine(ref handler);
		stringBuilder2 = stringBuilder;
		StringBuilder stringBuilder8 = stringBuilder2;
		handler = new StringBuilder.AppendInterpolatedStringHandler(12, 1, stringBuilder2);
		handler.AppendLiteral("- **관계 수**: ");
		handler.AppendFormatted(schema.Relationships.Count);
		stringBuilder8.AppendLine(ref handler);
		stringBuilder.AppendLine();
		AppendTables(stringBuilder, schema);
		AppendRelationships(stringBuilder, schema);
		AppendNormalization(stringBuilder, issues);
		return stringBuilder.ToString();
	}

	private static void AppendTables(StringBuilder sb, DbSchema schema)
	{
		sb.AppendLine("## 테이블 목록");
		sb.AppendLine();
		if (schema.Tables.Count == 0)
		{
			sb.AppendLine("(테이블 없음)");
			sb.AppendLine();
			return;
		}
		foreach (DbTable table in schema.Tables)
		{
			StringBuilder stringBuilder = sb;
			StringBuilder stringBuilder2 = stringBuilder;
			StringBuilder.AppendInterpolatedStringHandler handler = new StringBuilder.AppendInterpolatedStringHandler(4, 1, stringBuilder);
			handler.AppendLiteral("### ");
			handler.AppendFormatted(table.Name);
			stringBuilder2.AppendLine(ref handler);
			if (!string.IsNullOrWhiteSpace(table.Comment))
			{
				stringBuilder = sb;
				StringBuilder stringBuilder3 = stringBuilder;
				handler = new StringBuilder.AppendInterpolatedStringHandler(2, 1, stringBuilder);
				handler.AppendLiteral("_");
				handler.AppendFormatted(table.Comment);
				handler.AppendLiteral("_");
				stringBuilder3.AppendLine(ref handler);
			}
			sb.AppendLine();
			if (table.Columns.Count == 0)
			{
				sb.AppendLine("(컬럼 없음)");
				sb.AppendLine();
				continue;
			}
			sb.AppendLine("| 컬럼 | 타입 | PK | 자동증가 | NULL | UNIQUE | 기본값 | 설명 |");
			sb.AppendLine("| --- | --- | :---: | :---: | :---: | :---: | --- | --- |");
			foreach (DbColumn column in table.Columns)
			{
				InlineArray8<string> buffer = default(InlineArray8<string>);
				buffer[0] = column.Name;
				buffer[1] = column.GetTypeDisplay();
				buffer[2] = Mark(column.IsPrimaryKey);
				buffer[3] = Mark(column.IsAutoIncrement);
				buffer[4] = Mark(column.IsNullable);
				buffer[5] = Mark(column.IsUnique);
				buffer[6] = EscapeCell(column.DefaultValue ?? "");
				buffer[7] = EscapeCell(column.Comment ?? "");
				sb.AppendLine(string.Join(" | ", (ReadOnlySpan<string>)buffer) + " |");
			}
			sb.AppendLine();
		}
	}

	private static void AppendRelationships(StringBuilder sb, DbSchema schema)
	{
		sb.AppendLine("## 관계 목록");
		sb.AppendLine();
		if (schema.Relationships.Count == 0)
		{
			sb.AppendLine("(관계 없음)");
			sb.AppendLine();
			return;
		}
		sb.AppendLine("| 이름 | 유형 | 소스 | 타겟 |");
		sb.AppendLine("| --- | --- | --- | --- |");
		foreach (DbRelationship relationship in schema.Relationships)
		{
			DbTable dbTable = schema.FindTable(relationship.SourceTableId);
			DbTable dbTable2 = schema.FindTable(relationship.TargetTableId);
			DbColumn dbColumn = ((dbTable == null) ? null : schema.FindColumn(relationship.SourceTableId, relationship.SourceColumnId));
			DbColumn dbColumn2 = ((dbTable2 == null) ? null : schema.FindColumn(relationship.TargetTableId, relationship.TargetColumnId));
			RelationshipType type = relationship.Type;
			if (1 == 0)
			{
			}
			string text = type switch
			{
				RelationshipType.OneToOne => "1:1", 
				RelationshipType.OneToMany => "1:N", 
				RelationshipType.ManyToMany => "N:M", 
				_ => "?", 
			};
			if (1 == 0)
			{
			}
			string value = text;
			string value2 = FormatEndpoint(dbTable.Name, dbColumn.Name);
			string value3 = FormatEndpoint(dbTable2.Name, dbColumn2.Name);
			string value4 = (string.IsNullOrWhiteSpace(relationship.Name) ? "-" : relationship.Name);
			StringBuilder.AppendInterpolatedStringHandler handler = new StringBuilder.AppendInterpolatedStringHandler(11, 4, sb);
			handler.AppendFormatted(EscapeCell(value4));
			handler.AppendLiteral(" | ");
			handler.AppendFormatted(value);
			handler.AppendLiteral(" | ");
			handler.AppendFormatted(EscapeCell(value2));
			handler.AppendLiteral(" | ");
			handler.AppendFormatted(EscapeCell(value3));
			handler.AppendLiteral(" |");
			sb.AppendLine(ref handler);
		}
		sb.AppendLine();
	}

	private static void AppendNormalization(StringBuilder sb, IReadOnlyList<NormalizationIssue> issues)
	{
		sb.AppendLine("## 정규화 검사 결과");
		sb.AppendLine();
		if (issues.Count == 0)
		{
			sb.AppendLine("발견된 문제가 없습니다.");
			return;
		}
		StringBuilder stringBuilder = sb;
		StringBuilder stringBuilder2 = stringBuilder;
		StringBuilder.AppendInterpolatedStringHandler handler = new StringBuilder.AppendInterpolatedStringHandler(21, 1, stringBuilder);
		handler.AppendLiteral("총 **");
		handler.AppendFormatted(issues.Count);
		handler.AppendLiteral("**건의 항목이 발견되었습니다.");
		stringBuilder2.AppendLine(ref handler);
		sb.AppendLine();
		foreach (NormalizationIssue issue in issues)
		{
			stringBuilder = sb;
			StringBuilder stringBuilder3 = stringBuilder;
			handler = new StringBuilder.AppendInterpolatedStringHandler(10, 3, stringBuilder);
			handler.AppendLiteral("### [");
			handler.AppendFormatted(issue.Level);
			handler.AppendLiteral("] ");
			handler.AppendFormatted(issue.Table);
			handler.AppendLiteral(" — ");
			handler.AppendFormatted(issue.Severity);
			stringBuilder3.AppendLine(ref handler);
			stringBuilder = sb;
			StringBuilder stringBuilder4 = stringBuilder;
			handler = new StringBuilder.AppendInterpolatedStringHandler(10, 1, stringBuilder);
			handler.AppendLiteral("- **내용**: ");
			handler.AppendFormatted(issue.Message);
			stringBuilder4.AppendLine(ref handler);
			if (!string.IsNullOrWhiteSpace(issue.Hint))
			{
				stringBuilder = sb;
				StringBuilder stringBuilder5 = stringBuilder;
				handler = new StringBuilder.AppendInterpolatedStringHandler(10, 1, stringBuilder);
				handler.AppendLiteral("- **권장**: ");
				handler.AppendFormatted(issue.Hint);
				stringBuilder5.AppendLine(ref handler);
			}
			sb.AppendLine();
		}
	}

	private static string Mark(bool value)
	{
		return value ? "✓" : "";
	}

	private static string EscapeCell(string value)
	{
		return value.Replace("|", "\\|", StringComparison.Ordinal);
	}

	private static string FormatEndpoint(string table, string column)
	{
		if (string.IsNullOrWhiteSpace(table))
		{
			return "?";
		}
		return string.IsNullOrWhiteSpace(column) ? table : (table + "." + column);
	}
}
