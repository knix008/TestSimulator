using System.Text;

namespace MyGitWinV10.App.Services;

public static class ExceptionDetailFormatter
{
    public static string GetSummary(Exception ex)
    {
        var root = GetRootException(ex);
        return string.IsNullOrWhiteSpace(root.Message) ? root.GetType().Name : root.Message;
    }

    public static string Format(Exception ex)
    {
        var sb = new StringBuilder();
        AppendException(sb, ex);
        return sb.ToString().TrimEnd();
    }

    private static Exception GetRootException(Exception ex)
    {
        while (ex.InnerException is { } inner)
        {
            ex = inner;
        }

        return ex;
    }

    private static void AppendException(StringBuilder sb, Exception ex)
    {
        sb.Append('[').Append(ex.GetType().FullName).AppendLine("]");
        sb.AppendLine(ex.Message);

        if (!string.IsNullOrWhiteSpace(ex.StackTrace))
        {
            sb.AppendLine();
            sb.AppendLine(ex.StackTrace);
        }

        if (ex.InnerException is { } inner)
        {
            sb.AppendLine();
            sb.AppendLine("--- Inner exception ---");
            AppendException(sb, inner);
        }
    }
}
