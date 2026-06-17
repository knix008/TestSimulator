using System.Text;

namespace DBToolsWinV10.Export;

public static class SqlStatementSplitter
{
	public static IEnumerable<string> Split(string sql)
	{
		if (string.IsNullOrWhiteSpace(sql))
		{
			yield break;
		}

		StringBuilder current = new StringBuilder();
		bool inSingleQuote = false;
		bool inDoubleQuote = false;
		for (int i = 0; i < sql.Length; i++)
		{
			char ch = sql[i];
			if (ch == '\'' && !inDoubleQuote)
			{
				inSingleQuote = !inSingleQuote;
				current.Append(ch);
				continue;
			}
			if (ch == '"' && !inSingleQuote)
			{
				inDoubleQuote = !inDoubleQuote;
				current.Append(ch);
				continue;
			}
			if (ch == ';' && !inSingleQuote && !inDoubleQuote)
			{
				string statement = TrimStatement(current.ToString());
				if (!string.IsNullOrWhiteSpace(statement))
				{
					yield return statement;
				}
				current.Clear();
				continue;
			}
			current.Append(ch);
		}

		string tail = TrimStatement(current.ToString());
		if (!string.IsNullOrWhiteSpace(tail))
		{
			yield return tail;
		}
	}

	private static string TrimStatement(string statement)
	{
		if (string.IsNullOrWhiteSpace(statement))
		{
			return string.Empty;
		}

		StringBuilder cleaned = new StringBuilder();
		using StringReader reader = new StringReader(statement);
		string line;
		while ((line = reader.ReadLine()) != null)
		{
			string trimmed = line.Trim();
			if (trimmed.StartsWith("--", StringComparison.Ordinal))
			{
				continue;
			}
			cleaned.AppendLine(line);
		}
		return cleaned.ToString().Trim();
	}
}
