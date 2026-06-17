using System;
using System.Drawing;
using System.IO;
using System.Text;
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
			Title = "SQL DDL 보내기",
			FileName = baseName,
			DefaultExt = "sql"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			string contents = SqlExporter.Export(diagramCanvas.Schema);
			File.WriteAllText(filePath, contents, Encoding.UTF8);
			NotifyExportSucceeded("SQL 보내기 완료", filePath, "SQL DDL 파일을 저장했습니다.", offerOpenInNotepad: true);
		}
		catch (Exception ex)
		{
			NotifyExportFailed("SQL 보내기 실패", filePath, ex);
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
		string displayName = DbTargetTypeHelper.GetDisplayName(targetDb);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "SQL 파일 (*.sql)|*.sql|텍스트 파일 (*.txt)|*.txt",
			Title = $"{displayName} SQL 보내기",
			FileName = $"{baseName}_{suffix}",
			DefaultExt = "sql"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			DbSchema schema = SchemaExportHelper.CloneForTarget(diagramCanvas.Schema, targetDb);
			string contents = SqlExporter.Export(schema);
			File.WriteAllText(filePath, contents, Encoding.UTF8);
			NotifyExportSucceeded($"{displayName} SQL 보내기 완료", filePath, "SQL DDL 파일을 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed($"{displayName} SQL 보내기 실패", filePath, ex);
		}
	}

	private void ExportSqliteDatabase()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "SQLite 데이터베이스 (*.db)|*.db|SQLite (*.sqlite)|*.sqlite",
			Title = "SQLite DB 보내기",
			FileName = baseName,
			DefaultExt = "db"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			SqliteDatabaseExporter.Export(diagramCanvas.Schema, filePath);
			NotifyExportSucceeded("SQLite DB 보내기 완료", filePath, "SQLite 데이터베이스 파일을 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed("SQLite DB 보내기 실패", filePath, ex);
		}
	}

	private void ExportMarkdown()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "Markdown (*.md)|*.md|텍스트 (*.txt)|*.txt",
			Title = "Markdown 보내기",
			FileName = baseName + "_report",
			DefaultExt = "md"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			MarkdownExporter.Export(diagramCanvas.Schema, filePath, _currentFilePath);
			NotifyExportSucceeded("Markdown 보내기 완료", filePath, "Markdown 보고서를 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed("Markdown 보내기 실패", filePath, ex);
		}
	}

	private void ExportExcel()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "Excel 통합 문서 (*.xlsx)|*.xlsx",
			Title = "Excel 보내기",
			FileName = baseName + "_report",
			DefaultExt = "xlsx"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			ExcelExporter.Export(diagramCanvas.Schema, filePath, _currentFilePath);
			NotifyExportSucceeded("Excel 보내기 완료", filePath, "Excel 통합 문서를 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed("Excel 보내기 실패", filePath, ex);
		}
	}

	private void ExportWord()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "Word 문서 (*.docx)|*.docx",
			Title = "Word 보내기",
			FileName = baseName + "_report",
			DefaultExt = "docx"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			WordExporter.Export(diagramCanvas.Schema, filePath, _currentFilePath);
			NotifyExportSucceeded("Word 보내기 완료", filePath, "Word 문서를 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed("Word 보내기 실패", filePath, ex);
		}
	}

	private void ExportPdf()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "PDF 문서 (*.pdf)|*.pdf",
			Title = "PDF 보내기",
			FileName = baseName + "_report",
			DefaultExt = "pdf"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			using Bitmap diagramImage = diagramCanvas.RenderToImage(transparentBackground: false);
			PdfExporter.Export(diagramCanvas.Schema, filePath, _currentFilePath, diagramImage);
			NotifyExportSucceeded("PDF 보내기 완료", filePath, "PDF 문서를 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed("PDF 보내기 실패", filePath, ex);
		}
	}

	private void ExportJson()
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = "JSON 파일 (*.json)|*.json",
			Title = "JSON 보내기",
			FileName = baseName,
			DefaultExt = "json"
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			SchemaSerializer.Save(diagramCanvas.Schema, filePath);
			NotifyExportSucceeded("JSON 보내기 완료", filePath, "JSON 파일을 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed("JSON 보내기 실패", filePath, ex);
		}
	}

	private void ExportDiagramImage(DiagramImageFormat format)
	{
		string baseName = SchemaExportHelper.GetBaseFileName(diagramCanvas.Schema);
		string displayName = DiagramImageExporter.GetDisplayName(format);
		using SaveFileDialog saveFileDialog = new SaveFileDialog
		{
			Filter = DiagramImageExporter.GetFileFilter(format),
			Title = $"{displayName} 이미지 보내기",
			FileName = baseName + "_diagram",
			DefaultExt = DiagramImageExporter.GetDefaultExtension(format)
		};
		if (saveFileDialog.ShowDialog(this) != DialogResult.OK)
		{
			return;
		}

		string filePath = saveFileDialog.FileName;
		try
		{
			bool transparentBackground = format == DiagramImageFormat.Png;
			using Bitmap bitmap = diagramCanvas.RenderToImage(transparentBackground);
			DiagramImageExporter.Export(bitmap, filePath, format);
			NotifyExportSucceeded($"{displayName} 보내기 완료", filePath, "다이어그램 이미지를 저장했습니다.");
		}
		catch (Exception ex)
		{
			NotifyExportFailed($"{displayName} 보내기 실패", filePath, ex);
		}
	}
}
