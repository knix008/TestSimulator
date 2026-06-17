using System.Text;
using DBToolsWinV10.Analysis;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Export;

public static class MarkdownExporter
{
	public static void Export(DbSchema schema, string filePath, string projectPath = null)
	{
		string contents = SchemaReportWriter.Write(schema, projectPath);
		File.WriteAllText(filePath, contents, Encoding.UTF8);
	}
}
