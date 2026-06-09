using System.Text;
using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Database;

/// <summary>SQL 식별자·문자열 리터럴 정규식을 한곳에서 관리합니다.</summary>
internal static class SqlPatternHelper
{
    internal const string OpenQuote = @"[\[\""'`]?";
    internal const string CloseQuote = @"[\]\""'`]?";
    internal const string Identifier = @"\w+";

    // C# / Java / JS / Python / C++ raw strings
    internal static readonly Regex StringLiteralRegex = new(
        $@"(?:""""""[\s\S]*?""""""|'''[\s\S]*?'''|(?:[LuUu8]+)?R""(?:([A-Za-z0-9_]*))\((.*?)\)\1""|@?""(?:(?:\\.|[^""\\])*)""|'(?:(?:\\.|[^'\\])*)'|`(?:[^`\\]|\\.)*`)",
        RegexOptions.Compiled | RegexOptions.Singleline);

    private static readonly Regex CommentRegex = new(
        "//.*$|/\\*.*?\\*/|#.*$",
        RegexOptions.Compiled | RegexOptions.Multiline);

    internal static readonly Regex SqlReadTableRegex = new(
        $@"(?i)\b(?:FROM|JOIN|FULL\s+(?:OUTER\s+)?JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|INNER\s+JOIN|CROSS\s+JOIN|MERGE\s+INTO)\s+(?:{OpenQuote}({Identifier}){CloseQuote}\.)?(?:{OpenQuote}({Identifier}){CloseQuote})",
        RegexOptions.Compiled);

    internal static readonly Regex SqlCrudTableRegex = new(
        $@"(?i)\b(?<op>INSERT\s+(?:OR\s+(?:REPLACE|IGNORE|ROLLBACK\s+ABORT|ABORT|FAIL)\s+)?INTO|REPLACE\s+INTO|MERGE\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?)\s+(?:{OpenQuote}(?<schema>{Identifier}){CloseQuote}\.)?(?:{OpenQuote}(?<table>{Identifier}){CloseQuote})",
        RegexOptions.Compiled);

    internal static readonly Regex SqlSelectColumnsRegex = new(
        @"(?i)\bSELECT\s+((?:(?!\bFROM\b).)+)\bFROM\b",
        RegexOptions.Compiled | RegexOptions.Singleline);

    internal static readonly Regex SqlInsertColumnsRegex = new(
        $@"(?i)\bINSERT\s+(?:OR\s+\w+\s+)?(?:INTO\s+)?(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{Identifier}{CloseQuote}\s*\(\s*([^)]+)\)\s*(?:VALUES|SELECT)\b",
        RegexOptions.Compiled);

    internal static readonly Regex SqlUpdateSetColumnsRegex = new(
        $@"(?i)\bUPDATE\s+(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{Identifier}{CloseQuote}\s+SET\s+((?:(?!\bWHERE\b)[^;])+)",
        RegexOptions.Compiled | RegexOptions.Singleline);

    internal static readonly Regex CreateTableStartRegex = new(
        $@"(?i)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:{OpenQuote}({Identifier}){CloseQuote}\.)?{OpenQuote}({Identifier}){CloseQuote}\s*\(",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    internal static readonly Regex SqlCreateDatabaseRegex = new(
        $@"(?i)\bCREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?{OpenQuote}?({Identifier}){CloseQuote}?",
        RegexOptions.Compiled);

    internal static readonly Regex SqlDropDatabaseRegex = new(
        $@"(?i)\bDROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?{OpenQuote}?({Identifier}){CloseQuote}?",
        RegexOptions.Compiled);

    internal static readonly Regex SqlUseDatabaseRegex = new(
        $@"(?i)\bUSE\s+{OpenQuote}?({Identifier}){CloseQuote}?",
        RegexOptions.Compiled);

    internal static readonly Regex SqlAttachDatabaseRegex = new(
        @"(?i)\bATTACH\s+(?:DATABASE\s+)?(?:'([^']+)'|""([^""]+)"")\s+AS\s+(\w+)",
        RegexOptions.Compiled);

    internal static readonly Regex ConnectionStringCatalogRegex = new(
        @"(?i)(?:Initial\s+Catalog|Database|DbName)\s*=\s*([^;'""\s]+)",
        RegexOptions.Compiled);

    internal static readonly Regex SqliteDataSourceRegex = new(
        @"(?i)(?:Data\s+Source|Filename|File\s*Name)\s*=\s*([^;'""]+)",
        RegexOptions.Compiled);

    internal static readonly Regex SqlDeleteFromRegex = new(
        $@"(?i)\bDELETE\s+FROM\s+(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{Identifier}{CloseQuote}(?:\s+WHERE\s+(.+))?",
        RegexOptions.Compiled | RegexOptions.Singleline);

    private static readonly Regex WhereColumnRegex = new(
        @"(?i)\b([A-Za-z_]\w*)\s*(?:=|<>|!=|<=|>=|<|>|IS\s+NOT\s+NULL|IS\s+NULL|IN\s*\(|LIKE\b)",
        RegexOptions.Compiled);

    internal static readonly Regex[] ConnectionApiPatterns =
    [
        new(@"\bsqlite3_open(?:_v2)?\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+SqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bNpgsqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMySqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmysql_connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bPQconnect(?:db|dbParams)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bsqlite3\.connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpsycopg2\.connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bcreate_engine\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmongoose\.connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    ];

    internal readonly record struct SqlLiteralSpan(string Text, int LineNumber);

    internal static IEnumerable<string> ExtractSqlLiteralBodies(string body) =>
        ExtractSqlLiteralSpans(body).Select(span => span.Text);

    internal static IEnumerable<SqlLiteralSpan> ExtractSqlLiteralSpans(string body, int lineOffset = 0)
    {
        foreach (Match match in StringLiteralRegex.Matches(body))
        {
            if (!TryUnwrapSqlLiteral(match.Value, out var literal) || !ContainsSqlVerb(literal))
            {
                continue;
            }

            var line = lineOffset + body.AsSpan(0, match.Index).Count('\n') + 1;
            yield return new SqlLiteralSpan(NormalizeSqlLiteralEscapes(literal), line);
        }
    }

    internal static string MaskStringLiterals(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return text;
        }

        var chars = text.ToCharArray();
        foreach (Match match in StringLiteralRegex.Matches(text))
        {
            for (var i = match.Index; i < match.Index + match.Length; i++)
            {
                if (chars[i] != '\n' && chars[i] != '\r')
                {
                    chars[i] = ' ';
                }
            }
        }

        return new string(chars);
    }

    internal static string StripCommentsPreservingLiterals(string text) =>
        CommentRegex.Replace(MaskStringLiterals(text), match => new string(' ', match.Length));

    internal static bool TryUnwrapSqlLiteral(string raw, out string literal)
    {
        literal = string.Empty;
        if (raw.StartsWith("\"\"\"", StringComparison.Ordinal) && raw.EndsWith("\"\"\"", StringComparison.Ordinal))
        {
            literal = raw[3..^3];
            return true;
        }

        if (raw.StartsWith("'''", StringComparison.Ordinal) && raw.EndsWith("'''", StringComparison.Ordinal))
        {
            literal = raw[3..^3];
            return true;
        }

        if (TryUnwrapCppRawString(raw, out var rawLiteral))
        {
            literal = rawLiteral;
            return true;
        }

        if (raw.StartsWith('`') && raw.EndsWith('`'))
        {
            literal = raw[1..^1];
            return true;
        }

        if (raw.Length >= 2 && (raw[0] == '"' || raw[0] == '\''))
        {
            literal = raw.Trim('@', '"', '\'');
            return true;
        }

        return false;
    }

    internal static bool ContainsSqlVerb(string literal) =>
        literal.Contains("SELECT", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("INSERT", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("UPDATE", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("DELETE", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("FROM", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("CREATE", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("REPLACE", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("MERGE", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("TRUNCATE", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("DROP", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("ALTER", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("USE ", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("ATTACH", StringComparison.OrdinalIgnoreCase)
        || literal.Contains("DATABASE", StringComparison.OrdinalIgnoreCase);

    internal static bool SqlLiteralReferencesTable(string sql, string tableName, string? schema = null)
    {
        var escaped = Regex.Escape(tableName);
        if (Regex.IsMatch(sql, $@"(?i)\b(?:FROM|INTO|JOIN|UPDATE|TABLE)\s+(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{escaped}{CloseQuote}\b"))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(schema))
        {
            var qualified = Regex.Escape($"{schema}.{tableName}");
            return Regex.IsMatch(sql, $@"(?i)\b(?:FROM|INTO|JOIN|UPDATE|TABLE)\s+{OpenQuote}?{qualified}{CloseQuote}?\b");
        }

        return false;
    }

    internal static bool SqlDeleteTargetsTable(Match match, string tableName)
    {
        var escaped = Regex.Escape(tableName);
        return Regex.IsMatch(
            match.Value,
            $@"(?i)DELETE\s+FROM\s+(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{escaped}{CloseQuote}\b");
    }

    internal static IEnumerable<string> ExtractWhereColumns(string? whereClause)
    {
        if (string.IsNullOrWhiteSpace(whereClause))
        {
            yield break;
        }

        foreach (Match match in WhereColumnRegex.Matches(whereClause))
        {
            var name = match.Groups[1].Value;
            if (name.Length >= 2)
            {
                yield return name;
            }
        }
    }

    internal static bool SelectUsesWildcard(string selectList) =>
        Regex.IsMatch(selectList, @"(?i)(?:^|\s|,)\s*\*\s*(?:$|\s|,)|\.\s*\*");

    internal static string NormalizeSqlLiteralEscapes(string literal) =>
        literal.Replace("\\\"", "\"", StringComparison.Ordinal)
            .Replace("\\n", "\n", StringComparison.Ordinal)
            .Replace("\\r", "\r", StringComparison.Ordinal);

    private static bool TryUnwrapCppRawString(string raw, out string literal)
    {
        literal = string.Empty;
        if (!raw.Contains("R\"", StringComparison.Ordinal))
        {
            return false;
        }

        var match = Regex.Match(raw, @"(?:[LuUu8]+)?R""(?:([A-Za-z0-9_]*))\((.*?)\)\1""", RegexOptions.Singleline);
        if (!match.Success)
        {
            return false;
        }

        literal = match.Groups[2].Value;
        return true;
    }

    internal static bool SqlMentionsTable(string sql, int fromIndex, string tableName)
    {
        var tail = sql[fromIndex..];
        var escaped = Regex.Escape(tableName);
        return Regex.IsMatch(
            tail,
            $@"(?i)\bFROM\s+(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{escaped}{CloseQuote}\b");
    }

    internal static bool SqlInsertTargetsTable(Match match, string tableName)
    {
        var escaped = Regex.Escape(tableName);
        return Regex.IsMatch(
            match.Value,
            $@"(?i)INSERT\s+(?:OR\s+\w+\s+)?(?:INTO\s+)?(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{escaped}{CloseQuote}\b")
            || Regex.IsMatch(
                match.Value,
                $@"(?i)REPLACE\s+INTO\s+(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{escaped}{CloseQuote}\b");
    }

    internal static bool SqlUpdateTargetsTable(Match match, string tableName)
    {
        var escaped = Regex.Escape(tableName);
        return Regex.IsMatch(
            match.Value,
            $@"(?i)UPDATE\s+(?:{OpenQuote}{Identifier}{CloseQuote}\.)?{OpenQuote}{escaped}{CloseQuote}\b");
    }
}
