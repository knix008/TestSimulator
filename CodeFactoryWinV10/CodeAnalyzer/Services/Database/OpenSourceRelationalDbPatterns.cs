using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Database;

/// <summary>MySQL / MariaDB / PostgreSQL 등 오픈소스 관계형 DB 접근 패턴.</summary>
internal static class OpenSourceRelationalDbPatterns
{
    internal static readonly Regex[] ConnectionApiPatterns =
    [
        // MySQL / MariaDB — C/C++
        new(@"\b(?:mysql_connect|mysql_real_connect|mysql_init)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:mariadb_connect|mariadb_real_connect)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // MySQL / MariaDB — PHP
        new(@"\bmysqli_connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+mysqli\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // MySQL / MariaDB — C# / .NET
        new(@"\bMySqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+MySqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMariaDbConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+MariaDbConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMySqlConnector\s*\.", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // MySQL / MariaDB — Java / Node / Python / Ruby / Go
        new(@"\bDriverManager\s*\.\s*getConnection\s*\(\s*[""']jdbc:(?:mysql|mariadb):", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmysql2\s*\.\s*create(?:Connection|Pool)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmysql\s*\.\s*createConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpymysql\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmysql\.connector\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\baiomysql\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmariadb\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMysql2\s*\:\:\s*Client\s*\.\s*new\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bsql\s*\.\s*Open\s*\(\s*[""'](?:mysql|mariadb):", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // PostgreSQL — C/C++
        new(@"\bPQconnect(?:db|dbParams)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bPQsetdb(?:Login)?\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // PostgreSQL — C# / Java / Node / Python / Ruby / Go / PHP
        new(@"\bNpgsqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+NpgsqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bDriverManager\s*\.\s*getConnection\s*\(\s*[""']jdbc:postgresql:", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpg\s*\.\s*(?:Pool|Client)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+Client\s*\(\s*\{[^}]*\b(?:host|connectionString)\b", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline),
        new(@"\bpsycopg2\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpsycopg\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\basyncpg\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bPG\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpgx\s*\.\s*Connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bsql\s*\.\s*Open\s*\(\s*[""']postgres(?:ql)?", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpg_connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    ];

    internal static readonly Regex[] ExecutionApiPatterns =
    [
        // MySQL / MariaDB
        new(@"\b(?:mysql_query|mysql_real_query|mysql_stmt_execute|mysql_store_result)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:mariadb_query|mariadb_real_query|mariadb_stmt_execute)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmysqli(?:_query|_prepare|_execute|_real_query)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMySqlCommand\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+MySqlCommand\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMariaDbCommand\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // PostgreSQL
        new(@"\b(?:PQexec|PQexecParams|PQprepare|PQsendQuery)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bNpgsqlCommand\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+NpgsqlCommand\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpg_(?:query|prepare|execute|send_query|query_params)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    ];

    /// <summary>C API 등에서 SQL이 두 번째 인자로 전달되는 경우.</summary>
    internal static readonly Regex NativeApiSqlSecondArgRegex = new(
        @"\b(?:mysql_query|mysql_real_query|mysql_stmt_prepare|mariadb_query|mariadb_real_query|PQexec|PQexecParams|mysqli_query|mysqli_prepare|pg_query|pg_query_params)\s*\([^,]+,\s*(""(?:\\.|[^""\\])*""|'(?:\\.|[^'\\])*'|`(?:[^`\\]|\\.)*`)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    internal static readonly Regex MySqlMariaDbUriRegex = new(
        @"(?:mysql|mariadb)(?:\+[\w]+)?://[^\s'""]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    internal static readonly Regex PostgresUriRegex = new(
        @"postgres(?:ql)?(?:\+[\w]+)?://[^\s'""]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    internal static readonly Regex JdbcMySqlMariaDbRegex = new(
        @"jdbc:(?:mysql|mariadb):[^'""\s;]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    internal static readonly Regex JdbcPostgresRegex = new(
        @"jdbc:postgresql:[^'""\s;]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    internal static readonly Regex MySqlConnectionOptionRegex = new(
        @"(?i)(?:Server|Host|Uid|User\s+ID|Pwd|Password|Port|Database)\s*=\s*[^;'""\s]+",
        RegexOptions.Compiled);

    internal static readonly Regex PostgresConnectionOptionRegex = new(
        @"(?i)(?:Host|Username|Password|Port|Database|SearchPath|SSL\s+Mode)\s*=\s*[^;'""\s]+",
        RegexOptions.Compiled);

    internal static bool HasSignal(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return false;
        }

        foreach (var pattern in ConnectionApiPatterns)
        {
            if (pattern.IsMatch(body))
            {
                return true;
            }
        }

        foreach (var pattern in ExecutionApiPatterns)
        {
            if (pattern.IsMatch(body))
            {
                return true;
            }
        }

        if (NativeApiSqlSecondArgRegex.IsMatch(body)
            || MySqlMariaDbUriRegex.IsMatch(body)
            || PostgresUriRegex.IsMatch(body)
            || JdbcMySqlMariaDbRegex.IsMatch(body)
            || JdbcPostgresRegex.IsMatch(body))
        {
            return true;
        }

        if (MySqlConnectionOptionRegex.IsMatch(body) && body.Contains("Database=", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (PostgresConnectionOptionRegex.IsMatch(body)
            && (body.Contains("Host=", StringComparison.OrdinalIgnoreCase)
                || body.Contains("Username=", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return false;
    }

    internal static void ScanNativeApiSqlArguments(
        string body,
        Action<string> scanSql)
    {
        foreach (Match match in NativeApiSqlSecondArgRegex.Matches(body))
        {
            if (!SqlPatternHelper.TryUnwrapSqlLiteral(match.Groups[1].Value, out var sql))
            {
                continue;
            }

            var normalized = SqlPatternHelper.NormalizeSqlLiteralEscapes(sql);
            if (SqlPatternHelper.LooksLikeSqlStatement(normalized))
            {
                scanSql(normalized);
            }
        }
    }
}
