using System.Text;

namespace MyGitWinV10.App.Services;

public static class RepositorySummaryMarkdownExporter
{
    public static void Export(RepositorySummary summary, string filePath)
    {
        string? directory = Path.GetDirectoryName(filePath);
        if (string.IsNullOrEmpty(directory))
        {
            throw new InvalidOperationException("Could not determine the export directory.");
        }

        string chartsFolderName = $"{Path.GetFileNameWithoutExtension(filePath)}_charts";
        string chartsFolderPath = Path.Combine(directory, chartsFolderName);

        if (summary.Charts.Count > 0)
        {
            Directory.CreateDirectory(chartsFolderPath);
            foreach (var chart in summary.Charts)
            {
                File.WriteAllBytes(Path.Combine(chartsFolderPath, chart.FileName), chart.PngData);
            }
        }

        string markdown = RepositorySummaryContent.ToMarkdown(summary, chartsFolderName);
        File.WriteAllText(filePath, markdown, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
    }
}
