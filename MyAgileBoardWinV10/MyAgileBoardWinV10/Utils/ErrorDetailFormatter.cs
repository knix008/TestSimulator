using System.Text;

namespace MyAgileBoardWinV10.Utils;

public static class ErrorDetailFormatter
{
    public static string Format(Exception ex, string? context = null)
    {
        var sb = new StringBuilder();

        if (!string.IsNullOrWhiteSpace(context))
        {
            sb.AppendLine($"[컨텍스트] {context}");
            sb.AppendLine();
        }

        sb.AppendLine($"[시각] {DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}");
        AppendException(sb, ex, includeHeader: true);

        return sb.ToString().TrimEnd();
    }

    private static void AppendException(StringBuilder sb, Exception ex, bool includeHeader, int depth = 0)
    {
        var prefix = depth == 0 ? string.Empty : $"  {new string(' ', depth * 2)}";

        if (includeHeader)
        {
            sb.AppendLine($"{prefix}[유형] {ex.GetType().FullName}");
            sb.AppendLine($"{prefix}[메시지] {ex.Message}");
        }
        else
        {
            sb.AppendLine();
            sb.AppendLine($"{prefix}[내부 예외 #{depth}]");
            sb.AppendLine($"{prefix}  [유형] {ex.GetType().FullName}");
            sb.AppendLine($"{prefix}  [메시지] {ex.Message}");
        }

        if (!string.IsNullOrWhiteSpace(ex.Source))
            sb.AppendLine($"{prefix}[소스] {ex.Source}");

        if (ex.TargetSite != null)
            sb.AppendLine($"{prefix}[위치] {ex.TargetSite}");

        if (!string.IsNullOrWhiteSpace(ex.StackTrace))
        {
            sb.AppendLine();
            sb.AppendLine($"{prefix}[스택 추적]");
            foreach (var line in ex.StackTrace.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                sb.AppendLine($"{prefix}  {line.Trim()}");
        }

        if (ex.InnerException != null)
            AppendException(sb, ex.InnerException, includeHeader: false, depth + 1);
    }
}
