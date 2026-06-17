using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace DBToolsWinV10.App;

public static class ErrorReporter
{
	private static readonly Regex StackFrameRegex = new(
		@"at\s+(?<method>.+?)\s+in\s+(?<file>.+?):line\s+(?<line>\d+)",
		RegexOptions.Compiled | RegexOptions.CultureInvariant);

	public static string BuildSummary(Exception ex, string context = null)
	{
		Exception root = GetRootException(ex);
		StringBuilder sb = new StringBuilder();
		if (!string.IsNullOrWhiteSpace(context))
		{
			sb.AppendLine(context.Trim());
			sb.AppendLine();
		}

		sb.AppendLine($"오류 유형: {GetFriendlyTypeName(root)}");
		if (!string.IsNullOrWhiteSpace(root.Message))
		{
			sb.AppendLine($"메시지: {root.Message.Trim()}");
		}

		string location = GetSourceLocation(ex);
		if (!string.IsNullOrWhiteSpace(location))
		{
			sb.AppendLine($"발생 위치: {location}");
		}

		if (root.InnerException != null && !ReferenceEquals(root, ex))
		{
			sb.AppendLine();
			sb.AppendLine($"직접 원인: {ex.GetType().Name}: {ex.Message?.Trim()}");
		}

		return sb.ToString().TrimEnd();
	}

	public static string Format(Exception ex)
	{
		StringBuilder stringBuilder = new StringBuilder();
		AppendException(stringBuilder, ex, isRoot: true);
		return stringBuilder.ToString().TrimEnd();
	}

	public static string BuildClipboardText(string summary, string details)
	{
		if (string.IsNullOrWhiteSpace(details))
		{
			return summary;
		}

		return summary + "\r\n\r\n" + details;
	}

	private static Exception GetRootException(Exception ex)
	{
		Exception current = ex;
		while (current.InnerException != null)
		{
			current = current.InnerException;
		}

		return current;
	}

	private static string GetFriendlyTypeName(Exception ex)
	{
		return ex.GetType().Name switch
		{
			"NullReferenceException" => "널 참조 오류 (NullReferenceException)",
			"InvalidOperationException" => "잘못된 작업 (InvalidOperationException)",
			"ArgumentException" => "잘못된 인수 (ArgumentException)",
			"FileNotFoundException" => "파일을 찾을 수 없음 (FileNotFoundException)",
			"DirectoryNotFoundException" => "폴더를 찾을 수 없음 (DirectoryNotFoundException)",
			"UnauthorizedAccessException" => "접근 권한 없음 (UnauthorizedAccessException)",
			"IOException" => "입출력 오류 (IOException)",
			"SqliteException" => "SQLite 오류 (SqliteException)",
			"JsonException" => "JSON 형식 오류 (JsonException)",
			"InvalidDataException" => "데이터 형식 오류 (InvalidDataException)",
			"OperationCanceledException" => "작업 취소 (OperationCanceledException)",
			_ => ex.GetType().Name
		};
	}

	private static string GetSourceLocation(Exception ex)
	{
		for (Exception current = ex; current != null; current = current.InnerException)
		{
			string location = ParseStackTrace(current.StackTrace);
			if (!string.IsNullOrWhiteSpace(location))
			{
				return location;
			}
		}

		return null;
	}

	private static string ParseStackTrace(string stackTrace)
	{
		if (string.IsNullOrWhiteSpace(stackTrace))
		{
			return null;
		}

		foreach (string raw in stackTrace.Split('\n'))
		{
			string line = raw.Trim();
			if (!line.Contains("DBToolsWinV10", StringComparison.Ordinal))
			{
				continue;
			}

			Match match = StackFrameRegex.Match(line);
			if (!match.Success)
			{
				continue;
			}

			string method = SimplifyMethodName(match.Groups["method"].Value);
			string file = Path.GetFileName(match.Groups["file"].Value);
			string lineNo = match.Groups["line"].Value;
			return $"{method} ({file}:{lineNo})";
		}

		return null;
	}

	private static string SimplifyMethodName(string method)
	{
		const string prefix = "DBToolsWinV10.";
		int index = method.IndexOf(prefix, StringComparison.Ordinal);
		if (index >= 0)
		{
			method = method[(index + prefix.Length)..];
		}

		int paren = method.IndexOf('(');
		if (paren > 0)
		{
			method = method[..paren];
		}

		return method;
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
}
