using System;
using System.Text;

namespace DBToolsWinV10.App;

public static class ErrorReporter
{
	public static string Format(Exception ex)
	{
		StringBuilder stringBuilder = new StringBuilder();
		AppendException(stringBuilder, ex, isRoot: true);
		return stringBuilder.ToString().TrimEnd();
	}

	private static void AppendException(StringBuilder sb, Exception ex, bool isRoot)
	{
		if (!isRoot)
		{
			sb.AppendLine();
			sb.AppendLine("── 내부 오류 ──");
		}
		sb.AppendLine(ex.GetType().FullName);
		sb.AppendLine(ex.Message);
		if (!string.IsNullOrWhiteSpace(ex.StackTrace))
		{
			sb.AppendLine();
			sb.AppendLine("스택 추적:");
			sb.AppendLine(ex.StackTrace);
		}
		if (ex.InnerException != null)
		{
			AppendException(sb, ex.InnerException, isRoot: false);
		}
	}

	public static string BuildClipboardText(string summary, string details)
	{
		if (string.IsNullOrWhiteSpace(details))
		{
			return summary;
		}
		return summary + "\r\n\r\n" + details;
	}
}
