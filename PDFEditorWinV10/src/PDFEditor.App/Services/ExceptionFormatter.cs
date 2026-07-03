using System.Text;

namespace PDFEditor.App.Services;

internal static class ExceptionFormatter
{
    public static string Format(Exception exception, string? context = null)
    {
        var builder = new StringBuilder();

        if (!string.IsNullOrWhiteSpace(context))
        {
            builder.AppendLine($"작업: {context}");
            builder.AppendLine();
        }

        AppendException(builder, exception, includeHeader: false);
        return builder.ToString().TrimEnd();
    }

    private static void AppendException(StringBuilder builder, Exception exception, bool includeHeader)
    {
        if (includeHeader)
        {
            builder.AppendLine("--- 내부 예외 ---");
        }

        builder.AppendLine($"예외 유형: {exception.GetType().FullName}");
        builder.AppendLine($"메시지: {exception.Message}");

        if (!string.IsNullOrWhiteSpace(exception.Source))
        {
            builder.AppendLine($"소스: {exception.Source}");
        }

        if (exception.HResult != 0)
        {
            builder.AppendLine($"HRESULT: 0x{exception.HResult:X8}");
        }

        if (!string.IsNullOrWhiteSpace(exception.StackTrace))
        {
            builder.AppendLine();
            builder.AppendLine("스택 추적:");
            builder.AppendLine(exception.StackTrace);
        }

        if (exception.InnerException is not null)
        {
            builder.AppendLine();
            AppendException(builder, exception.InnerException, includeHeader: true);
        }
    }
}
