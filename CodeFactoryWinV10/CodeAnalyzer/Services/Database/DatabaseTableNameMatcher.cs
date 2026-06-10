namespace CodeAnalyzer.Services.Database;

/// <summary>ERD 테이블명과 코드/SQL 참조 간 대소문자·표기 차이를 연결합니다.</summary>
internal static class DatabaseTableNameMatcher
{
    internal static string NormalizeTableKey(string? schema, string tableName)
    {
        var name = tableName.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return string.Empty;
        }

        return string.IsNullOrWhiteSpace(schema)
            ? name.ToLowerInvariant()
            : $"{schema.Trim().ToLowerInvariant()}.{name.ToLowerInvariant()}";
    }

    internal static IEnumerable<string> ExpandAliases(string? schema, string tableName)
    {
        if (string.IsNullOrWhiteSpace(tableName))
        {
            yield break;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var token in ExpandSimpleName(tableName))
        {
            if (seen.Add(token))
            {
                yield return token;
            }
        }

        if (string.IsNullOrWhiteSpace(schema))
        {
            yield break;
        }

        foreach (var token in ExpandSimpleName(tableName))
        {
            var qualified = $"{schema}.{token}";
            if (seen.Add(qualified))
            {
                yield return qualified;
            }
        }
    }

    private static IEnumerable<string> ExpandSimpleName(string tableName)
    {
        var simple = tableName.Contains('.')
            ? tableName[(tableName.LastIndexOf('.') + 1)..]
            : tableName;

        yield return simple;
        yield return simple.ToLowerInvariant();

        if (simple.Length > 0)
        {
            yield return char.ToUpperInvariant(simple[0]) + simple[1..];
        }

        if (simple.Contains('_'))
        {
            yield return ToPascalCaseFromSnake(simple);
        }

        var snake = ToSnakeCase(simple);
        if (!string.IsNullOrEmpty(snake))
        {
            yield return snake;
        }

        if (simple.EndsWith("s", StringComparison.OrdinalIgnoreCase) && simple.Length > 1)
        {
            yield return simple[..^1];
        }
        else if (simple.Length > 0)
        {
            yield return simple + "s";
        }
    }

    private static string ToPascalCaseFromSnake(string value)
    {
        var parts = value.Split('_', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            return value;
        }

        return string.Concat(parts.Select(part =>
            part.Length == 0
                ? string.Empty
                : char.ToUpperInvariant(part[0]) + part[1..].ToLowerInvariant()));
    }

    private static string ToSnakeCase(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var chars = new List<char>(value.Length + 8);
        for (var i = 0; i < value.Length; i++)
        {
            var ch = value[i];
            if (char.IsUpper(ch))
            {
                if (i > 0 && value[i - 1] != '_')
                {
                    chars.Add('_');
                }

                chars.Add(char.ToLowerInvariant(ch));
            }
            else
            {
                chars.Add(ch);
            }
        }

        return new string(chars.ToArray());
    }

    internal static bool CanDiscoverFromOpenSourceSql(string token) =>
        !IsAmbiguousTableToken(token) && token.Length >= 3 && token.All(ch => char.IsLetterOrDigit(ch) || ch == '_');

    internal static bool IsAmbiguousTableToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length < 3)
        {
            return true;
        }

        return AmbiguousTableTokens.Contains(token);
    }

    private static readonly HashSet<string> AmbiguousTableTokens = new(StringComparer.OrdinalIgnoreCase)
    {
        "LOG", "LOGS", "USER", "USERS", "ORDER", "ORDERS", "DATA", "FILE", "FILES", "ITEM", "ITEMS",
        "TYPE", "TYPES", "GROUP", "GROUPS", "ROLE", "ROLES", "TABLE", "TABLES", "VIEW", "VIEWS",
        "KEY", "KEYS", "INDEX", "INDEXES", "ROW", "ROWS", "COLUMN", "COLUMNS", "VALUE", "VALUES",
        "NAME", "NAMES", "CODE", "CODES", "STATE", "STATUS", "EVENT", "EVENTS", "TASK", "TASKS",
        "NODE", "NODES", "LIST", "LISTS", "MAP", "MAPS", "SET", "SETS", "TEMP", "TMP", "TEST",
        "HISTORY", "DETAIL", "DETAILS", "MASTER", "CONFIG", "SETTING", "SETTINGS", "INFO", "META",
    };
}
