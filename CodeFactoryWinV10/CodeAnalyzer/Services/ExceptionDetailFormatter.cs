using System.Text;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class ExceptionDetailFormatter
{
    public static string Format(Exception exception)
    {
        var lines = new List<string>
        {
            $"발생 시각: {DateTime.Now:yyyy-MM-dd HH:mm:ss}",
            $"예외 형식: {exception.GetType().FullName}",
            $"메시지: {exception.Message}",
            string.Empty,
            "스택 추적:",
            exception.StackTrace ?? "(스택 추적 없음)"
        };

        var inner = exception.InnerException;
        var depth = 1;
        while (inner is not null)
        {
            lines.Add(string.Empty);
            lines.Add($"내부 예외 #{depth}: {inner.GetType().FullName}");
            lines.Add(inner.Message);
            lines.Add(inner.StackTrace ?? "(스택 추적 없음)");
            inner = inner.InnerException;
            depth++;
        }

        return string.Join(Environment.NewLine, lines);
    }

    public static string FormatIssues(IReadOnlyList<AnalysisIssue> issues)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"발생 시각: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        builder.AppendLine($"항목 수: {issues.Count}");
        builder.AppendLine();

        for (var index = 0; index < issues.Count; index++)
        {
            var issue = issues[index];
            builder.AppendLine($"[{index + 1}] {issue.Stage}");
            builder.AppendLine($"    메시지: {issue.Message}");

            if (!string.IsNullOrWhiteSpace(issue.Detail))
            {
                builder.AppendLine("    상세:");
                foreach (var line in issue.Detail.Split(Environment.NewLine))
                {
                    builder.AppendLine($"      {line}");
                }
            }

            builder.AppendLine();
        }

        return builder.ToString().TrimEnd();
    }
}
