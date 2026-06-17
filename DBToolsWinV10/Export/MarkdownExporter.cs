using System.Text;
using DBToolsWinV10.Analysis;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Export;

public static class MarkdownExporter
{
	public static void Export(DbSchema schema, string filePath, string projectPath = null, Bitmap diagramImage = null)
	{
		string erdImageRelativePath = null;
		if (diagramImage != null)
		{
			erdImageRelativePath = ReportDiagramHelper.SaveCompanionImage(diagramImage, filePath);
		}

		string contents = SchemaReportWriter.Write(schema, projectPath, erdImageRelativePath);
		File.WriteAllText(filePath, contents, Encoding.UTF8);
	}
}
