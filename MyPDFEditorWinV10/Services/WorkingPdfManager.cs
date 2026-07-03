using MyPDFEditorWinV10.Export;
using MyPDFEditorWinV10.Models;

namespace MyPDFEditorWinV10.Services;

public static class WorkingPdfManager
{
	private static readonly string WorkingDirectory = Path.Combine(Path.GetTempPath(), "MyPDFEditorWinV10");

	public static void Clear(EditableDocument document)
	{
		if (document == null)
		{
			return;
		}

		TryDeleteFile(document.WorkingPdfPath);
		document.WorkingPdfPath = null;
	}

	public static string RegenerateWorkingCopy(EditableDocument document)
	{
		if (document == null || !document.CanUseLayoutPreservingExport())
		{
			throw new InvalidOperationException("편집 내용을 PDF에 반영할 수 없습니다.");
		}

		Directory.CreateDirectory(WorkingDirectory);
		string newPath = Path.Combine(WorkingDirectory, Guid.NewGuid().ToString("N") + ".pdf");
		LayoutPreservingPdfExporter.Export(document, newPath);
		document.WorkingPdfPath = newPath;
		return newPath;
	}

	internal static void TryDeleteFile(string filePath)
	{
		if (string.IsNullOrWhiteSpace(filePath))
		{
			return;
		}

		try
		{
			if (File.Exists(filePath))
			{
				File.Delete(filePath);
			}
		}
		catch
		{
		}
	}
}
