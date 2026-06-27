using System.Text;
using ImageRembgWinV10.Localization;

namespace ImageRembgWinV10.Services;

public static class ErrorDialogService
{
    public static void ShowError(
        IWin32Window? owner,
        string title,
        string summary,
        IDictionary<string, string?>? context)
    {
        ShowError(owner, title, summary, null, context);
    }

    public static void ShowError(
        IWin32Window? owner,
        string title,
        string summary,
        Exception? exception = null,
        IDictionary<string, string?>? context = null)
    {
        var primaryMessage = exception == null ? null : GetPrimaryMessage(exception);
        var details = BuildDetails(summary, primaryMessage, exception, context);
        using var dialog = new ErrorDialogForm(title, summary, primaryMessage, details);
        dialog.ShowDialog(owner);
    }

    public static void ShowError(
        IWin32Window? owner,
        string title,
        string summary,
        string details)
    {
        using var dialog = new ErrorDialogForm(title, summary, null, details);
        dialog.ShowDialog(owner);
    }

    public static string GetPrimaryMessage(Exception exception)
    {
        ArgumentNullException.ThrowIfNull(exception);

        Exception? preferred = null;
        var current = exception;
        while (current != null)
        {
            if (current is InvalidOperationException or ArgumentException or IOException or
                UnauthorizedAccessException or HttpRequestException or NotSupportedException)
            {
                preferred = current;
            }

            current = current.InnerException;
        }

        var message = preferred?.Message ?? exception.Message;
        return string.IsNullOrWhiteSpace(message) ? exception.GetType().Name : message.Trim();
    }

    public static string FormatStatusMessage(string prefix, Exception exception, int maxLength = 160)
    {
        var message = $"{prefix}: {GetPrimaryMessage(exception)}";
        return Truncate(message, maxLength);
    }

    public static string BuildDetails(
        string summary,
        string? primaryMessage,
        Exception? exception,
        IDictionary<string, string?>? context = null)
    {
        var builder = new StringBuilder();
        builder.AppendLine(L.Get("ErrorDialog.Summary"));
        builder.AppendLine(summary);
        builder.AppendLine();

        if (!string.IsNullOrWhiteSpace(primaryMessage))
        {
            builder.AppendLine(L.Get("ErrorDialog.Content"));
            builder.AppendLine(primaryMessage);
            builder.AppendLine();
        }

        var hint = exception == null ? null : GetHint(exception);
        if (!string.IsNullOrWhiteSpace(hint))
        {
            builder.AppendLine(L.Get("ErrorDialog.Action"));
            builder.AppendLine(hint);
            builder.AppendLine();
        }

        if (context is { Count: > 0 })
        {
            builder.AppendLine(L.Get("ErrorDialog.Details"));
            foreach (var pair in context)
            {
                if (string.IsNullOrWhiteSpace(pair.Value))
                {
                    continue;
                }

                builder.AppendLine($"{pair.Key}: {pair.Value}");
            }

            builder.AppendLine();
        }

        if (exception != null)
        {
            builder.AppendLine(L.Get("ErrorDialog.Exception"));
            builder.AppendLine($"{L.Get("ErrorDialog.Type")}: {exception.GetType().FullName}");
            AppendException(builder, exception, 0);
        }

        return builder.ToString().TrimEnd();
    }

    private static string? GetHint(Exception exception)
    {
        var message = GetPrimaryMessage(exception);

        if (ContainsAny(message,
                L.Get("Exception.DrawSelection"),
                L.Get("Exception.SelectionTooSmall"),
                L.Get("Exception.ObjectNotFound"),
                L.Get("Exception.ContourNotFound"),
                L.Get("Exception.NoSelection"),
                "선택 영역", "영역을", "객체를 찾지", "윤곽선을 찾지",
                "selection", "contour", "object not found"))
        {
            return L.Get("ErrorHint.Selection");
        }

        if (ContainsAny(message,
                "rembg", "모델", "ONNX", "model"))
        {
            return L.Get("ErrorHint.Rembg");
        }

        if (ContainsAny(message,
                L.Get("Exception.BackgroundColorUnknown"),
                "배경 색상", "background color"))
        {
            return L.Get("ErrorHint.BackgroundColor");
        }

        if (exception is IOException or UnauthorizedAccessException)
        {
            return L.Get("ErrorHint.IO");
        }

        if (exception is HttpRequestException)
        {
            return L.Get("ErrorHint.Network");
        }

        return null;
    }

    private static bool ContainsAny(string message, params string[] needles)
    {
        foreach (var needle in needles)
        {
            if (message.Contains(needle, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static void AppendException(StringBuilder builder, Exception exception, int depth)
    {
        if (depth > 0)
        {
            var indent = new string(' ', depth * 2);
            builder.AppendLine($"{indent}{L.Get("ErrorDialog.InnerException")}");
        }

        var lineIndent = new string(' ', depth * 2);
        builder.AppendLine($"{lineIndent}[{exception.GetType().FullName}]");
        builder.AppendLine($"{lineIndent}{L.Get("ErrorDialog.Message")}: {exception.Message}");

        if (!string.IsNullOrWhiteSpace(exception.Source))
        {
            builder.AppendLine($"{lineIndent}{L.Get("ErrorDialog.Source")}: {exception.Source}");
        }

        if (exception.HResult != 0)
        {
            builder.AppendLine($"{lineIndent}{L.Get("ErrorDialog.Hresult")}: 0x{exception.HResult:X8}");
        }

        if (!string.IsNullOrWhiteSpace(exception.StackTrace))
        {
            builder.AppendLine($"{lineIndent}{L.Get("ErrorDialog.StackTrace")}:");
            foreach (var line in exception.StackTrace.Split('\n', '\r', StringSplitOptions.RemoveEmptyEntries))
            {
                builder.AppendLine($"{lineIndent}  {line.Trim()}");
            }
        }

        if (exception.InnerException != null)
        {
            builder.AppendLine();
            AppendException(builder, exception.InnerException, depth + 1);
        }
    }

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        return value[..(maxLength - 1)] + "…";
    }
}
