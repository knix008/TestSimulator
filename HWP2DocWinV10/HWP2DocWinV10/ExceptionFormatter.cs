using System.Text;

namespace HWP2DocWinV10;

internal static class ExceptionFormatter
{
    public static string Format(Exception exception)
    {
        var builder = new StringBuilder();
        AppendException(builder, exception);
        return builder.ToString().TrimEnd();
    }

    private static void AppendException(StringBuilder builder, Exception exception, int depth = 0)
    {
        string indent = depth == 0 ? string.Empty : new string(' ', depth * 2);

        if (depth > 0)
            builder.AppendLine($"{indent}[Inner Exception]");

        builder.AppendLine($"{indent}유형: {exception.GetType().FullName}");
        builder.AppendLine($"{indent}메시지: {exception.Message}");

        if (exception is FileNotFoundException fileNotFound && !string.IsNullOrWhiteSpace(fileNotFound.FileName))
            builder.AppendLine($"{indent}파일: {fileNotFound.FileName}");

        if (!string.IsNullOrWhiteSpace(exception.Source))
            builder.AppendLine($"{indent}소스: {exception.Source}");

        if (exception.HResult != 0)
            builder.AppendLine($"{indent}HRESULT: 0x{exception.HResult:X8}");

        if (!string.IsNullOrWhiteSpace(exception.StackTrace))
        {
            builder.AppendLine($"{indent}스택 추적:");
            foreach (string line in exception.StackTrace.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                builder.AppendLine($"{indent}  {line}");
        }

        if (exception.InnerException != null)
        {
            builder.AppendLine();
            AppendException(builder, exception.InnerException, depth + 1);
        }
    }
}
