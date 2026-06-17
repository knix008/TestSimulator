using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Import;

public static class SchemaLayout
{
	private const float MinTableWidth = 210f;

	private const float MaxTableWidth = 720f;

	private const float ColumnIconWidth = 26f;

	private const float NameColumnRatio = 0.48f;

	private const float TypeColumnRatio = 0.52f;

	private static readonly Font HeaderFont = new("맑은 고딕", 9.5f, FontStyle.Bold, GraphicsUnit.Point);

	private static readonly Font ColumnFont = new("맑은 고딕", 8.5f, FontStyle.Regular, GraphicsUnit.Point);

	private static readonly Font ColumnBoldFont = new("맑은 고딕", 8.5f, FontStyle.Bold, GraphicsUnit.Point);

	private static readonly Font TypeFont = new("맑은 고딕", 8.5f, FontStyle.Regular, GraphicsUnit.Point);

	private static readonly Font DbTypeFont = new("맑은 고딕", 7f, FontStyle.Regular, GraphicsUnit.Point);

	public static void AutoArrange(DbSchema schema)
	{
		schema?.EnsureInitialized();
		if (schema == null || schema.Tables.Count == 0)
		{
			return;
		}

		FitTableWidths(schema);
		int columns = Math.Max(1, (int)Math.Ceiling(Math.Sqrt(schema.Tables.Count)));
		float columnSpacing = Math.Max(280f, schema.Tables.Max((DbTable t) => t.Width) + 48f);
		float rowSpacing = Math.Max(220f, schema.Tables.Max((DbTable t) => GetTableHeight(t)) + 36f);
		for (int i = 0; i < schema.Tables.Count; i++)
		{
			DbTable table = schema.Tables[i];
			int row = i / columns;
			int col = i % columns;
			table.X = 40f + col * columnSpacing;
			table.Y = 60f + row * rowSpacing;
		}
	}

	public static void FitTableWidths(DbSchema schema)
	{
		schema?.EnsureInitialized();
		if (schema == null)
		{
			return;
		}

		string dbTypeDisplay = DbTargetTypeHelper.GetDisplayName(schema.TargetDb);
		foreach (DbTable table in schema.Tables)
		{
			FitTableWidth(table, dbTypeDisplay);
		}
	}

	public static void FitTableWidth(DbTable table, DbTargetType targetDb)
	{
		FitTableWidth(table, DbTargetTypeHelper.GetDisplayName(targetDb));
	}

	public static void FitTableWidth(DbTable table, string dbTypeDisplayName)
	{
		if (table == null)
		{
			return;
		}

		table.Columns ??= new System.Collections.Generic.List<DbColumn>();
		float maxColumnNameWidth = 0f;
		float maxTypeWidth = 0f;
		foreach (DbColumn column in table.Columns)
		{
			if (column == null)
			{
				continue;
			}

			Font nameFont = column.IsPrimaryKey ? ColumnBoldFont : ColumnFont;
			maxColumnNameWidth = Math.Max(maxColumnNameWidth, MeasureText(column.Name, nameFont));
			maxTypeWidth = Math.Max(maxTypeWidth, MeasureText(column.GetTypeDisplay(), TypeFont));
		}

		float headerNameWidth = MeasureText(table.Name, HeaderFont);
		float headerDbTypeWidth = MeasureText(dbTypeDisplayName, DbTypeFont);
		float headerWidth = headerNameWidth + headerDbTypeWidth + 24f;
		float nameAreaWidth = maxColumnNameWidth + ColumnIconWidth + 12f;
		float typeAreaWidth = maxTypeWidth + 12f;
		float widthForNames = nameAreaWidth / NameColumnRatio;
		float widthForTypes = typeAreaWidth / TypeColumnRatio;
		float width = Math.Max(MinTableWidth, Math.Max(headerWidth, Math.Max(widthForNames, widthForTypes)));
		table.Width = Math.Min(MaxTableWidth, (float)Math.Ceiling(width));
	}

	private static float GetTableHeight(DbTable table)
	{
		int columnCount = table.Columns?.Count ?? 0;
		return 28f + columnCount * 22f + 4f;
	}

	private static float MeasureText(string text, Font font)
	{
		if (string.IsNullOrEmpty(text))
		{
			return 0f;
		}

		return TextRenderer.MeasureText(text, font, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPadding).Width;
	}
}
