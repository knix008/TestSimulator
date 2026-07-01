using System.Text;

namespace MyGitWinV10.App.Services;

public static class ExceptionDetailFormatter
{
    public static string GetSummary(Exception ex)
    {
        if (GitRemoteExceptionHelper.TryGetFriendlyMessage(ex, out string friendly))
        {
            return friendly;
        }

        for (var current = ex; current is not null; current = current.InnerException)
        {
            if (!string.IsNullOrWhiteSpace(current.Message))
            {
                return current.Message;
            }
        }

        return ex.GetType().Name;
    }

    public static string Format(Exception ex)
    {
        var sb = new StringBuilder();
        AppendException(sb, ex);
        return sb.ToString().TrimEnd();
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
