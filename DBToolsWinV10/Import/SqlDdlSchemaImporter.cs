using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using DBToolsWinV10.Models;

namespace DBToolsWinV10.Import;

public static class SqlDdlSchemaImporter
{
	private static readonly Regex AlterFkRegex = new Regex("ALTER\\s+TABLE\\s+(?<child>[\\[`\"]?\\w+[\\]`\"]?)\\s+ADD\\s+(?:CONSTRAINT\\s+(?<name>[\\[`\"]?\\w+[\\]`\"]?)\\s+)?FOREIGN\\s+KEY\\s*\\((?<fkcols>[^)]+)\\)\\s+REFERENCES\\s+(?<parent>[\\[`\"]?\\w+[\\]`\"]?)\\s*\\((?<pkcols>[^)]+)\\)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

	private static readonly Regex InlineFkRegex = new Regex("(?:CONSTRAINT\\s+(?<name>[\\[`\"]?\\w+[\\]`\"]?)\\s+)?FOREIGN\\s+KEY\\s*\\((?<fkcols>[^)]+)\\)\\s+REFERENCES\\s+(?<parent>[\\[`\"]?\\w+[\\]`\"]?)\\s*\\((?<pkcols>[^)]+)\\)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

	public static DbSchema Import(string sqlFilePath)
	{
		if (!File.Exists(sqlFilePath))
		{
			throw new FileNotFoundException("SQL 파일을 찾을 수 없습니다.", sqlFilePath);
		}
		string sql = File.ReadAllText(sqlFilePath, Encoding.UTF8);
		sql = StripComments(sql);
		DbTargetType targetDb = DetectTargetDb(sql);
		DbSchema dbSchema = new DbSchema
		{
			Name = Path.GetFileNameWithoutExtension(sqlFilePath),
			TargetDb = targetDb
		};
		Dictionary<string, DbTable> tableMap = new Dictionary<string, DbTable>(StringComparer.OrdinalIgnoreCase);
		ParseCreateTables(sql, dbSchema, tableMap, targetDb);
		ParseAlterForeignKeys(sql, tableMap, dbSchema);
		SchemaLayout.AutoArrange(dbSchema);
		return dbSchema;
	}

	private static DbTargetType DetectTargetDb(string sql)
	{
		if (Regex.IsMatch(sql, "\\bBIGSERIAL\\b|\\bSERIAL\\b|COMMENT\\s+ON\\s+(TABLE|COLUMN)", RegexOptions.IgnoreCase))
		{
			return DbTargetType.PostgreSQL;
		}
		if (Regex.IsMatch(sql, "\\bIDENTITY\\s*\\(|\\[dbo\\]\\.", RegexOptions.IgnoreCase))
		{
			return DbTargetType.SqlServer;
		}
		if (Regex.IsMatch(sql, "\\bAUTO_INCREMENT\\b|ENGINE\\s*=\\s*InnoDB", RegexOptions.IgnoreCase))
		{
			if (Regex.IsMatch(sql, "\\bMariaDB\\b", RegexOptions.IgnoreCase))
			{
				return DbTargetType.MariaDB;
			}
			return DbTargetType.MySQL;
		}
		if (Regex.IsMatch(sql, "\\bAUTOINCREMENT\\b", RegexOptions.IgnoreCase))
		{
			return DbTargetType.SQLite;
		}
		return DbTargetType.MySQL;
	}

	private static void ParseCreateTables(string sql, DbSchema schema, Dictionary<string, DbTable> tableMap, DbTargetType targetDb)
	{
		int index = 0;
		string tableName;
		string body;
		while (TryReadCreateTable(sql, ref index, out tableName, out body))
		{
			if (!tableMap.ContainsKey(tableName))
			{
				DbTable dbTable = new DbTable
				{
					Name = tableName
				};
				ParseTableBody(dbTable, body, targetDb, tableMap, schema);
				schema.Tables.Add(dbTable);
				tableMap[tableName] = dbTable;
			}
		}
	}

	private static bool TryReadCreateTable(string sql, ref int index, out string tableName, out string body)
	{
		tableName = string.Empty;
		body = string.Empty;
		int num = IndexOfIgnoreCase(sql, "CREATE TABLE", index);
		if (num < 0)
		{
			return false;
		}
		int index2 = num + "CREATE TABLE".Length;
		index2 = SkipWhitespace(sql, index2);
		if (StartsWithIgnoreCase(sql, index2, "IF NOT EXISTS"))
		{
			index2 += "IF NOT EXISTS".Length;
			index2 = SkipWhitespace(sql, index2);
		}
		if (!TryReadIdentifier(sql, ref index2, out tableName))
		{
			return false;
		}
		index2 = SkipWhitespace(sql, index2);
		if (index2 >= sql.Length || sql[index2] != '(')
		{
			return false;
		}
		index2++;
		if (!TryReadBalancedBody(sql, ref index2, out body))
		{
			return false;
		}
		index = index2;
		return true;
	}

	private static void ParseTableBody(DbTable table, string body, DbTargetType targetDb, Dictionary<string, DbTable> tableMap, DbSchema schema)
	{
		foreach (string item in SplitDefinitions(body))
		{
			if (!string.IsNullOrWhiteSpace(item))
			{
				string text = item.Trim();
				string text2 = text.ToUpperInvariant();
				DbColumn column;
				if (text2.StartsWith("CONSTRAINT ", StringComparison.Ordinal) || text2.StartsWith("PRIMARY KEY", StringComparison.Ordinal) || text2.StartsWith("UNIQUE ", StringComparison.Ordinal) || text2.StartsWith("KEY ", StringComparison.Ordinal) || text2.StartsWith("INDEX ", StringComparison.Ordinal) || text2.StartsWith("FOREIGN KEY", StringComparison.Ordinal))
				{
					ApplyTableConstraint(table, text, tableMap, schema);
				}
				else if (InlineFkRegex.IsMatch(text))
				{
					ApplyForeignKeyMatch(InlineFkRegex.Match(text), table.Name, tableMap, schema);
				}
				else if (TryParseColumn(text, targetDb, out column))
				{
					table.Columns.Add(column);
				}
			}
		}
	}

	private static void ApplyTableConstraint(DbTable table, string definition, Dictionary<string, DbTable> tableMap, DbSchema schema)
	{
		string text = definition.ToUpperInvariant();
		if (text.Contains("FOREIGN KEY", StringComparison.Ordinal))
		{
			ApplyForeignKeyMatch(InlineFkRegex.Match(definition), table.Name, tableMap, schema);
			return;
		}
		Match match = Regex.Match(definition, "PRIMARY\\s+KEY\\s*\\((?<cols>[^)]+)\\)", RegexOptions.IgnoreCase);
		if (!match.Success)
		{
			return;
		}
		foreach (string colName in SplitColumnList(match.Groups["cols"].Value))
		{
			DbColumn dbColumn = table.Columns.FirstOrDefault((DbColumn c) => string.Equals(c.Name, colName, StringComparison.OrdinalIgnoreCase));
			if (dbColumn != null)
			{
				dbColumn.IsPrimaryKey = true;
				dbColumn.IsNullable = false;
			}
		}
	}

	private static void ParseAlterForeignKeys(string sql, Dictionary<string, DbTable> tableMap, DbSchema schema)
	{
		foreach (Match item in AlterFkRegex.Matches(sql))
		{
			string childTableName = UnquoteIdentifier(item.Groups["child"].Value);
			string parentTableName = UnquoteIdentifier(item.Groups["parent"].Value);
			string constraintName = (item.Groups["name"].Success ? UnquoteIdentifier(item.Groups["name"].Value) : null);
			List<string> list = SplitColumnList(item.Groups["fkcols"].Value);
			List<string> list2 = SplitColumnList(item.Groups["pkcols"].Value);
			int num = Math.Min(list.Count, list2.Count);
			for (int i = 0; i < num; i++)
			{
				SchemaRelationshipBuilder.AddForeignKey(schema, tableMap, parentTableName, list2[i], childTableName, list[i], constraintName);
			}
		}
	}

	private static void ApplyForeignKeyMatch(Match match, string childTable, Dictionary<string, DbTable> tableMap, DbSchema schema)
	{
		if (match.Success)
		{
			string parentTableName = UnquoteIdentifier(match.Groups["parent"].Value);
			string constraintName = (match.Groups["name"].Success ? UnquoteIdentifier(match.Groups["name"].Value) : null);
			List<string> list = SplitColumnList(match.Groups["fkcols"].Value);
			List<string> list2 = SplitColumnList(match.Groups["pkcols"].Value);
			int num = Math.Min(list.Count, list2.Count);
			for (int i = 0; i < num; i++)
			{
				SchemaRelationshipBuilder.AddForeignKey(schema, tableMap, parentTableName, list2[i], childTable, list[i], constraintName);
			}
		}
	}

	private static bool TryParseColumn(string definition, DbTargetType targetDb, out DbColumn column)
	{
		column = new DbColumn();
		int cursor = 0;
		if (!TryReadIdentifier(definition, ref cursor, out string identifier))
		{
			return false;
		}
		column.Name = identifier;
		cursor = SkipWhitespace(definition, cursor);
		string text = definition.Substring(cursor).Trim();
		if (string.IsNullOrWhiteSpace(text))
		{
			column.DataType = "TEXT";
			column.IsNullable = true;
			return true;
		}
		string[] array = text.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
		if (array.Length == 0)
		{
			return false;
		}
		int tokenIndex = 0;
		column.DataType = array[tokenIndex++].ToUpperInvariant();
		if (tokenIndex < array.Length && array[tokenIndex].StartsWith('('))
		{
			string text2 = ReadTypeSuffix(array, ref tokenIndex);
			column.DataType += text2;
			ParseTypeDimensions(text2, column);
		}
		string text3 = string.Join(' ', array[tokenIndex..]).ToUpperInvariant();
		if (text3.Contains("PRIMARY KEY", StringComparison.Ordinal))
		{
			column.IsPrimaryKey = true;
			column.IsNullable = false;
		}
		bool flag = text3.Contains("AUTO_INCREMENT", StringComparison.Ordinal) || text3.Contains("AUTOINCREMENT", StringComparison.Ordinal) || Regex.IsMatch(text3, "\\bIDENTITY\\s*\\(", RegexOptions.IgnoreCase);
		bool flag2 = flag;
		if (!flag2)
		{
			bool flag3 = targetDb == DbTargetType.PostgreSQL && column.IsPrimaryKey;
			bool flag4 = flag3;
			if (flag4)
			{
				bool flag5;
				switch (column.DataType)
				{
				case "SERIAL":
				case "BIGSERIAL":
				case "SMALLSERIAL":
					flag5 = true;
					break;
				default:
					flag5 = false;
					break;
				}
				flag4 = flag5;
			}
			flag2 = flag4;
		}
		if (flag2)
		{
			column.IsAutoIncrement = true;
		}
		if (text3.Contains("NOT NULL", StringComparison.Ordinal))
		{
			column.IsNullable = false;
		}
		else if (text3.Contains(" NULL", StringComparison.Ordinal) && !column.IsPrimaryKey)
		{
			column.IsNullable = true;
		}
		else
		{
			column.IsNullable = !column.IsPrimaryKey;
		}
		if (text3.Contains(" UNIQUE", StringComparison.Ordinal))
		{
			column.IsUnique = true;
		}
		Match match = Regex.Match(text, "DEFAULT\\s+((?:'[^']*'|\\S+))", RegexOptions.IgnoreCase);
		if (match.Success)
		{
			column.DefaultValue = match.Groups[1].Value.Trim('\'');
		}
		return true;
	}

	private static string ReadTypeSuffix(string[] tokens, ref int tokenIndex)
	{
		StringBuilder stringBuilder = new StringBuilder();
		while (tokenIndex < tokens.Length)
		{
			stringBuilder.Append(tokens[tokenIndex]);
			if (tokens[tokenIndex].Contains(')'))
			{
				tokenIndex++;
				break;
			}
			tokenIndex++;
		}
		return stringBuilder.ToString();
	}

	private static void ParseTypeDimensions(string typeSuffix, DbColumn column)
	{
		Match match = Regex.Match(typeSuffix, "\\(([^)]+)\\)");
		if (!match.Success)
		{
			return;
		}
		string value = match.Groups[1].Value;
		int result3;
		if (value.Contains(','))
		{
			string[] array = value.Split(',', 2);
			if (int.TryParse(array[0].Trim(), out var result))
			{
				column.Precision = result;
			}
			if (int.TryParse(array[1].Trim(), out var result2))
			{
				column.Scale = result2;
			}
		}
		else if (int.TryParse(value.Trim(), out result3))
		{
			column.Length = result3;
		}
	}

	private static List<string> SplitColumnList(string value)
	{
		return (from c in value.Split(',')
			select UnquoteIdentifier(c.Trim()) into c
			where !string.IsNullOrWhiteSpace(c)
			select c).ToList();
	}

	private static List<string> SplitDefinitions(string body)
	{
		List<string> list = new List<string>();
		StringBuilder stringBuilder = new StringBuilder();
		int num = 0;
		foreach (char c in body)
		{
			switch (c)
			{
			case '(':
				num++;
				break;
			case ')':
				if (num > 0)
				{
					num--;
				}
				break;
			}
			if (c == ',' && num == 0)
			{
				list.Add(stringBuilder.ToString());
				stringBuilder.Clear();
			}
			else
			{
				stringBuilder.Append(c);
			}
		}
		if (stringBuilder.Length > 0)
		{
			list.Add(stringBuilder.ToString());
		}
		return list;
	}

	private static string StripComments(string sql)
	{
		StringBuilder stringBuilder = new StringBuilder(sql.Length);
		bool flag = false;
		bool flag2 = false;
		bool flag3 = false;
		int i = 0;
		while (i < sql.Length)
		{
			char c = sql[i];
			char c2 = ((i + 1 < sql.Length) ? sql[i + 1] : '\0');
			if (!flag && !flag2 && !flag3 && c == '-' && c2 == '-')
			{
				for (i += 2; i < sql.Length && sql[i] != '\n'; i++)
				{
				}
			}
			else if (!flag && !flag2 && !flag3 && c == '/' && c2 == '*')
			{
				for (i += 2; i + 1 < sql.Length && (sql[i] != '*' || sql[i + 1] != '/'); i++)
				{
				}
				i += 2;
			}
			else if (!flag2 && !flag3 && c == '\'')
			{
				flag = !flag;
				stringBuilder.Append(c);
				i++;
			}
			else if (!flag && !flag3 && c == '"')
			{
				flag2 = !flag2;
				stringBuilder.Append(c);
				i++;
			}
			else if (!flag && !flag2 && c == '`')
			{
				flag3 = !flag3;
				stringBuilder.Append(c);
				i++;
			}
			else
			{
				stringBuilder.Append(c);
				i++;
			}
		}
		return stringBuilder.ToString();
	}

	private static bool TryReadBalancedBody(string sql, ref int cursor, out string body)
	{
		body = string.Empty;
		int num = 1;
		int num2 = cursor;
		while (cursor < sql.Length && num > 0)
		{
			switch (sql[cursor++])
			{
			case '(':
				num++;
				break;
			case ')':
				num--;
				break;
			}
		}
		if (num != 0)
		{
			return false;
		}
		int num3 = num2;
		body = sql.Substring(num3, cursor - 1 - num3);
		return true;
	}

	private static bool TryReadIdentifier(string sql, ref int cursor, out string identifier)
	{
		identifier = string.Empty;
		cursor = SkipWhitespace(sql, cursor);
		if (cursor >= sql.Length)
		{
			return false;
		}
		char c = sql[cursor];
		int num2;
		if ((c == '"' || c == '[' || c == '`') ? true : false)
		{
			if (1 == 0)
			{
			}
			char c2 = c switch
			{
				'"' => '"', 
				'`' => '`', 
				'[' => ']', 
				_ => '"', 
			};
			if (1 == 0)
			{
			}
			char value = c2;
			int num = sql.IndexOf(value, cursor + 1);
			if (num < 0)
			{
				return false;
			}
			num2 = cursor + 1;
			identifier = sql.Substring(num2, num - num2);
			cursor = num + 1;
			return true;
		}
		int num3 = cursor;
		while (true)
		{
			bool flag = cursor < sql.Length;
			bool flag2 = flag;
			if (flag2)
			{
				bool flag3 = char.IsLetterOrDigit(sql[cursor]);
				bool flag4 = flag3;
				if (!flag4)
				{
					char c2 = sql[cursor];
					bool flag5 = ((c2 == '$' || c2 == '.' || c2 == '_') ? true : false);
					flag4 = flag5;
				}
				flag2 = flag4;
			}
			if (!flag2)
			{
				break;
			}
			cursor++;
		}
		if (num3 == cursor)
		{
			return false;
		}
		num2 = num3;
		identifier = UnquoteIdentifier(sql.Substring(num2, cursor - num2));
		return true;
	}

	private static string UnquoteIdentifier(string value)
	{
		return value.Trim().Trim(new char[4] { '`', '"', '[', ']' });
	}

	private static int SkipWhitespace(string sql, int index)
	{
		while (index < sql.Length && char.IsWhiteSpace(sql[index]))
		{
			index++;
		}
		return index;
	}

	private static int IndexOfIgnoreCase(string text, string value, int startIndex)
	{
		return text.IndexOf(value, startIndex, StringComparison.OrdinalIgnoreCase);
	}

	private static bool StartsWithIgnoreCase(string text, int index, string value)
	{
		return text.AsSpan(index).StartsWith(value.AsSpan(), StringComparison.OrdinalIgnoreCase);
	}
}
