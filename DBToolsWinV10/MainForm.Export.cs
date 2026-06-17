using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using DBToolsWinV10.Dialogs;
using DBToolsWinV10.Export;
using DBToolsWinV10.Models;
using DBToolsWinV10.Serialization;

namespace DBToolsWinV10;

public partial class MainForm
{
	private void ExportSql()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "SQL 파일 (*.sql)|*.sql|텍스트 파일 (*.txt)|*.txt",
			Title = "SQL DDL보내기",
			FileName = baseName,
			DefaultExt = "sql"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			string contents = SqlExporter.Export(diagramCanvas.Schema);
			File.WriteAllText(saveFileDialog.FileName, contents, Encoding.UTF8);
			statusLabel.Text = "SQL보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
			if (MessageBox.Show("SQL 파일을 메모장으로 열까요?", "보내기 완료", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
			{
				Process.Start("notepad.exe", saveFileDialog.FileName);
			}
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "SQL보내기 오류", ex, "SQL 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void ExportSqlForTarget(DbTargetType targetDb)
	{
		string suffix = targetDb switch
		{
			DbTargetType.PostgreSQL => "postgres",
			DbTargetType.MySQL => "mysql",
			DbTargetType.MariaDB => "mariadb",
			DbTargetType.SqlServer => "sqlserver",
			_ => targetDb.ToString().ToLowerInvariant()
		};
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "SQL 파일 (*.sql)|*.sql|텍스트 파일 (*.txt)|*.txt",
			Title = $"{DbTargetTypeHelper.GetDisplayName(targetDb)} SQL보내기",
			FileName = $"{baseName}_{suffix}",
			DefaultExt = "sql"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			DbSchema schema = SchemaExportHelper.CloneForTarget(diagramCanvas.Schema, targetDb);
			string contents = SqlExporter.Export(schema);
			File.WriteAllText(saveFileDialog.FileName, contents, Encoding.UTF8);
			statusLabel.Text = $"{DbTargetTypeHelper.GetDisplayName(targetDb)} SQL보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "SQL보내기 오류", ex, "SQL 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void ExportSqliteDatabase()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "SQLite 데이터베이스 (*.db)|*.db|SQLite (*.sqlite)|*.sqlite",
			Title = "SQLite DB보내기",
			FileName = baseName,
			DefaultExt = "db"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			SqliteDatabaseExporter.Export(diagramCanvas.Schema, saveFileDialog.FileName);
			statusLabel.Text = "SQLite DB보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "SQLite DB보내기 오류", ex, "SQLite DB 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void ExportMarkdown()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "Markdown (*.md)|*.md|텍스트 (*.txt)|*.txt",
			Title = "Markdown보내기",
			FileName = baseName + "_report",
			DefaultExt = "md"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			MarkdownExporter.Export(diagramCanvas.Schema, saveFileDialog.FileName, _currentFilePath);
			statusLabel.Text = "Markdown보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "Markdown보내기 오류", ex, "Markdown 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void ExportExcel()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "Excel 통합 문서 (*.xlsx)|*.xlsx",
			Title = "Excel보내기",
			FileName = baseName + "_report",
			DefaultExt = "xlsx"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			ExcelExporter.Export(diagramCanvas.Schema, saveFileDialog.FileName, _currentFilePath);
			statusLabel.Text = "Excel보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "Excel보내기 오류", ex, "Excel 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void ExportWord()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "Word 문서 (*.docx)|*.docx",
			Title = "Word보내기",
			FileName = baseName + "_report",
			DefaultExt = "docx"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			WordExporter.Export(diagramCanvas.Schema, saveFileDialog.FileName, _currentFilePath);
			statusLabel.Text = "Word보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "Word보내기 오류", ex, "Word 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void ExportPdf()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "PDF 문서 (*.pdf)|*.pdf",
			Title = "PDF보내기",
			FileName = baseName + "_report",
			DefaultExt = "pdf"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			PdfExporter.Export(diagramCanvas.Schema, saveFileDialog.FileName, _currentFilePath);
			statusLabel.Text = "PDF보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "PDF보내기 오류", ex, "PDF 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}

	private void ExportJson()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "JSON 파일 (*.json)|*.json",
			Title = "JSON보내기",
			FileName = baseName,
			DefaultExt = "json"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}
		try
		{
			SchemaSerializer.Save(diagramCanvas.Schema, saveFileDialog.FileName);
			statusLabel.Text = "JSON보내기 완료: " + Path.GetFileName(saveFileDialog.FileName);
		}
		catch (Exception ex)
		{
			ErrorDialog.Show(this, "JSON보내기 오류", ex, "JSON 파일을보낼 수 없습니다.\n" + saveFileDialog.FileName);
		}
	}
}
