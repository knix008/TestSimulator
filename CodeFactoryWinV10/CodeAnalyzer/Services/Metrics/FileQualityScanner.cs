using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

internal static class FileQualityScanner
{
    private static readonly Regex TodoRegex = new(
        @"\b(TODO|FIXME|HACK|XXX|UNDONE|BUG)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static void ApplyTodoMetrics(IList<FileLineMetric> files)
    {
        for (var i = 0; i < files.Count; i++)
        {
            var file = files[i];
            var count = CountTodoMarkers(file.FilePath);
            var density = file.CodeLines > 0 ? Math.Round(100.0 * count / file.CodeLines, 2) : 0;

            files[i] = new FileLineMetric
            {
                FilePath = file.FilePath,
                LanguageId = file.LanguageId,
                PhysicalLines = file.PhysicalLines,
                CodeLines = file.CodeLines,
                BlankLines = file.BlankLines,
                CommentLines = file.CommentLines,
                CommentPercentPer100Code = file.CommentPercentPer100Code,
                TodoMarkerCount = count,
                TodoDensityPer100Lines = density
            };
        }
    }

    private static int CountTodoMarkers(string filePath)
    {
        try
        {
            var text = File.ReadAllText(filePath);
            return TodoRegex.Matches(text).Count;
        }
        catch
        {
            return 0;
        }
    }
}
