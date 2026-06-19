using System.Text;

namespace MyGitWinV10.App.Services;

public static class RepositorySummaryMarkdownExporter
{
    public static void Export(RepositorySummary summary, string filePath)
    {
        string markdown = RepositorySummaryContent.ToMarkdown(summary);
        File.WriteAllText(filePath, markdown, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
    }
}
