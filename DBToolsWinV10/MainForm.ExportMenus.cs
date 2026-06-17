using System;
using System.Windows.Forms;
using DBToolsWinV10.App;
using DBToolsWinV10.Models;

namespace DBToolsWinV10;

public partial class MainForm
{
	private void ConfigureExportMenus()
	{
		menuExport.DropDownItems.Clear();
		AddExportMenuItems(menuExport.DropDownItems);
		menuExport.Text = "보내기(&E)";
		menuExport.ToolTipText = "스키마를 Markdown, Excel, Word, PDF, JSON, SQL, DB 파일로보냅니다";

		tsSepExport = new ToolStripSeparator { Name = "tsSepExport" };
		tsExport = new ToolStripDropDownButton
		{
			Name = "tsExport",
			Text = "보내기",
			DisplayStyle = ToolStripItemDisplayStyle.Image,
			ToolTipText = "스키마를 문서, 데이터, DB 형식으로보냅니다"
		};
		AddExportMenuItems(tsExport.DropDownItems);

		int idx = toolStrip.Items.IndexOf(btnTsSaveAs);
		toolStrip.Items.Insert(idx + 1, tsSepExport);
		toolStrip.Items.Insert(idx + 2, tsExport);
	}

	private void AddExportMenuItems(ToolStripItemCollection items)
	{
		items.Add(CreateExportMenuItem("Markdown...", "Report", "Markdown 보고서로보냅니다", ExportMarkdown));
		items.Add(CreateExportMenuItem("Excel...", "Export", "Excel 통합 문서(.xlsx)로보냅니다", ExportExcel));
		items.Add(CreateExportMenuItem("Word...", "Report", "Word 문서(.docx)로보냅니다", ExportWord));
		items.Add(CreateExportMenuItem("PDF...", "Report", "PDF 문서로보냅니다", ExportPdf));
		items.Add(new ToolStripSeparator());
		items.Add(CreateExportMenuItem("JSON...", "Export", "JSON 파일로보냅니다", ExportJson));
		items.Add(new ToolStripSeparator());
		items.Add(CreateExportMenuItem("SQL DDL (현재 DB)...", "ExportSql", "현재 대상 DB용 SQL DDL을보냅니다", ExportSql));
		items.Add(new ToolStripSeparator());
		items.Add(CreateExportMenuItem("SQLite DB (.db)...", "SQLite", "SQLite 데이터베이스 파일로 변환합니다", ExportSqliteDatabase));
		items.Add(CreateExportMenuItem("PostgreSQL SQL...", "PostgreSQL", "PostgreSQL용 SQL 스크립트로 변환합니다", () => ExportSqlForTarget(DbTargetType.PostgreSQL)));
		items.Add(CreateExportMenuItem("MySQL SQL...", "MySQL", "MySQL용 SQL 스크립트로 변환합니다", () => ExportSqlForTarget(DbTargetType.MySQL)));
		items.Add(CreateExportMenuItem("MariaDB SQL...", "MariaDB", "MariaDB용 SQL 스크립트로 변환합니다", () => ExportSqlForTarget(DbTargetType.MariaDB)));
		items.Add(CreateExportMenuItem("SQL Server SQL...", "SqlServer", "SQL Server용 SQL 스크립트로 변환합니다", () => ExportSqlForTarget(DbTargetType.SqlServer)));
	}

	private ToolStripMenuItem CreateExportMenuItem(string text, string iconName, string tooltip, Action handler)
	{
		ToolStripMenuItem item = new ToolStripMenuItem(text)
		{
			Image = IconProvider.Get(iconName),
			ToolTipText = tooltip
		};
		item.Click += (_, _) => handler();
		return item;
	}

	private static void ApplyExportDropdownIcons(ToolStripItemCollection items)
	{
		string[] icons =
		{
			"Report", "Export", "Report", "Report", null, "Export", null, "ExportSql", null,
			"SQLite", "PostgreSQL", "MySQL", "MariaDB", "SqlServer"
		};
		int iconIdx = 0;
		foreach (ToolStripItem item in items)
		{
			if (item is ToolStripSeparator)
			{
				iconIdx++;
				continue;
			}
			if (iconIdx < icons.Length && icons[iconIdx] != null)
			{
				item.Image = IconProvider.Get(icons[iconIdx], 22);
			}
			iconIdx++;
		}
	}
}
