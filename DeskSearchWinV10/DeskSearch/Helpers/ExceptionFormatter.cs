using System.Text;

namespace DeskSearch.Helpers;

internal static class ExceptionFormatter
{
    public static string Format(Exception exception, string? context = null)
    {
        var builder = new StringBuilder();

        if (!string.IsNullOrWhiteSpace(context))
        {
            builder.AppendLine(context);
            builder.AppendLine();
        }

        AppendException(builder, exception, 0);
        return builder.ToString().TrimEnd();
    }

    private static void AppendException(StringBuilder builder, Exception exception, int depth)
    {
        if (depth > 0)
        {
            builder.AppendLine();
            builder.AppendLine($"--- Inner exception #{depth} ---");
        }

        builder.AppendLine($"{exception.GetType().FullName}: {exception.Message}");

        if (!string.IsNullOrWhiteSpace(exception.StackTrace))
        {
            builder.AppendLine();
            builder.AppendLine(exception.StackTrace);
        }

        if (exception.InnerException is not null)
            AppendException(builder, exception.InnerException, depth + 1);
    }
}
