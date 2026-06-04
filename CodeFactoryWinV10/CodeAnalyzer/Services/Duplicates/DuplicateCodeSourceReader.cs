using System.Text;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Duplicates;

public static class DuplicateCodeSourceReader
{
    public const int MaxPreviewLines = 400;

    public static string FormatSourceBlock(DuplicateCodeFragment fragment, string? projectRoot = null)
    {
        if (!File.Exists(fragment.FilePath))
        {
            return $"파일을 찾을 수 없습니다:{Environment.NewLine}{fragment.FilePath}";
        }

        try
        {
            var lines = File.ReadAllLines(fragment.FilePath);
            var startIndex = Math.Max(0, fragment.StartLine - 1);
            var lineCount = Math.Min(fragment.EndLine - fragment.StartLine + 1, MaxPreviewLines);
            if (startIndex >= lines.Length)
            {
                return $"유효하지 않은 줄 범위: {fragment.StartLine}-{fragment.EndLine}";
            }

            lineCount = Math.Min(lineCount, lines.Length - startIndex);
            var builder = new StringBuilder();
            var displayPath = FormatDisplayPath(fragment.FilePath, projectRoot);
            builder.AppendLine($"// {displayPath} · {fragment.StartLine}-{fragment.StartLine + lineCount - 1} ({lineCount}줄)");
            builder.AppendLine();

            for (var offset = 0; offset < lineCount; offset++)
            {
                var lineNumber = startIndex + offset + 1;
                builder.AppendLine($"{lineNumber,5} | {lines[startIndex + offset]}");
            }

            if (fragment.EndLine - fragment.StartLine + 1 > MaxPreviewLines)
            {
                builder.AppendLine($"... (상위 {MaxPreviewLines}줄만 표시)");
            }

            return builder.ToString().TrimEnd();
        }
        catch (Exception ex)
        {
            return $"파일 읽기 오류: {ex.Message}{Environment.NewLine}{fragment.FilePath}";
        }
    }

    public static string FormatDuplicateLines(IReadOnlyList<string> duplicateLines)
    {
        if (duplicateLines.Count == 0)
        {
            return "(중복 텍스트 없음)";
        }

        var builder = new StringBuilder();
        builder.AppendLine($"// 동일한 연속 {duplicateLines.Count}줄 (공백·주석 정규화 후 비교)");
        builder.AppendLine();

        for (var index = 0; index < duplicateLines.Count; index++)
        {
            builder.AppendLine($"{index + 1,5} | {duplicateLines[index]}");
        }

        return builder.ToString().TrimEnd();
    }

    public static string FormatLocationSummary(DuplicateCodeGroup group, string? projectRoot = null)
    {
        if (group.Fragments.Count == 0)
        {
            return "(위치 없음)";
        }

        var builder = new StringBuilder();
        builder.AppendLine($"중복 그룹 {group.Id} · {group.LineCount}줄 · {group.Fragments.Count}곳");
        builder.AppendLine(new string('─', 56));

        var index = 1;
        foreach (var fragment in group.Fragments)
        {
            builder.AppendLine(
                $"{index,2}. {FormatDisplayPath(fragment.FilePath, projectRoot)} " +
                $": {fragment.StartLine}-{fragment.EndLine} ({fragment.LanguageId})");
            index++;
        }

        return builder.ToString().TrimEnd();
    }

    public static string FormatDisplayPath(string filePath, string? projectRoot)
    {
        if (string.IsNullOrWhiteSpace(projectRoot))
        {
            return filePath;
        }

        try
        {
            var fullRoot = Path.GetFullPath(projectRoot);
            var fullPath = Path.GetFullPath(filePath);
            if (fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            {
                var relative = Path.GetRelativePath(fullRoot, fullPath);
                return string.IsNullOrWhiteSpace(relative) ? filePath : relative;
            }
        }
        catch
        {
            // fall back to full path
        }

        return filePath;
    }
}
