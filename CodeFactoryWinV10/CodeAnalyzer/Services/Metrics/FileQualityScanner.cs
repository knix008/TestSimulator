using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

internal static class FileQualityScanner
{
    private static readonly Regex TodoRegex = new(
        @"\b(TODO|FIXME|HACK|XXX|UNDONE|BUG)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex PublicApiRegex = new(
        @"^\s*public\s+(?:static\s+|async\s+|virtual\s+|override\s+|partial\s+)*(?:class|interface|struct|enum|record|delegate|event|void|[\w<>,\[\].]+\s+\w+\s*\()",
        RegexOptions.Compiled | RegexOptions.Multiline | RegexOptions.IgnoreCase);

    public static void ApplyFileQualityMetrics(IList<FileLineMetric> files, string? projectRoot = null)
    {
        IReadOnlyDictionary<string, int>? gitChanges = null;
        if (!string.IsNullOrWhiteSpace(projectRoot))
        {
            gitChanges = GitHotspotAnalyzer.TryLoadChangeLinesByFile(projectRoot);
        }

        for (var i = 0; i < files.Count; i++)
        {
            var file = files[i];
            string text;
            try
            {
                text = File.ReadAllText(file.FilePath);
            }
            catch
            {
                text = string.Empty;
            }

            var todoCount = TodoRegex.Matches(text).Count;
            var density = file.CodeLines > 0 ? Math.Round(100.0 * todoCount / file.CodeLines, 2) : 0;
            var gitLines = gitChanges?.GetValueOrDefault(NormalizePath(file.FilePath)) ?? 0;
            var securityHits = LanguageSecuritySmellScanner.Scan(text, file.LanguageId);
            var securitySummary = LanguageSecuritySmellScanner.FormatSummary(securityHits);

            files[i] = new FileLineMetric
            {
                FilePath = file.FilePath,
                LanguageId = file.LanguageId,
                PhysicalLines = file.PhysicalLines,
                CodeLines = file.CodeLines,
                BlankLines = file.BlankLines,
                CommentLines = file.CommentLines,
                CommentPercentPer100Code = file.CommentPercentPer100Code,
                TodoMarkerCount = todoCount,
                TodoDensityPer100Lines = density,
                IsTestFile = IsTestFile(file.FilePath),
                PublicApiCount = PublicApiRegex.Matches(text).Count,
                SecuritySmellCount = securityHits.Count,
                SecuritySmellHits = securityHits,
                SecuritySmellSummary = string.IsNullOrEmpty(securitySummary) ? null : securitySummary,
                GitChangeLineCount = gitLines
            };
        }
    }

    public static void ApplyTodoMetrics(IList<FileLineMetric> files) =>
        ApplyFileQualityMetrics(files);

    public static bool IsTestFile(string filePath)
    {
        var name = Path.GetFileName(filePath);
        var dir = Path.GetDirectoryName(filePath) ?? string.Empty;

        if (name.EndsWith("Tests.cs", StringComparison.OrdinalIgnoreCase)
            || name.EndsWith("Test.cs", StringComparison.OrdinalIgnoreCase)
            || name.Contains(".spec.", StringComparison.OrdinalIgnoreCase)
            || name.Contains(".test.", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return dir.Contains($"{Path.DirectorySeparatorChar}test{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
            || dir.Contains($"{Path.DirectorySeparatorChar}tests{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
            || dir.Contains($"{Path.DirectorySeparatorChar}__tests__{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
            || dir.Contains($"{Path.DirectorySeparatorChar}spec{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizePath(string path) =>
        Path.GetFullPath(path).Replace('\\', '/');
}
