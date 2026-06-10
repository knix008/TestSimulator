using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Database;

/// <summary>언어에 무관하게 적용되는 DB 연결·URI·엔티티 별칭 패턴.</summary>
internal static class UniversalDatabasePatterns
{
    /// <summary>C/C++ 네이티브 DB 연결 API만 (다른 언어 패턴과 분리해 오검출 방지).</summary>
    internal static readonly Regex[] CppConnectionApiPatterns =
    [
        new(@"\bsqlite3_open(?:_v2)?\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:mysql_connect|mysql_real_connect|mysql_init)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:mariadb_connect|mariadb_real_connect)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bPQconnect(?:db|dbParams)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bPQsetdb(?:Login)?\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:SQLConnect|SQLDriverConnect)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    ];

    /// <summary>DB 연결/오픈 API — C/C++를 제외한 언어에 적용.</summary>
    internal static readonly Regex[] ConnectionApiPatterns =
    [
        // C# / VB.NET
        new(@"\bnew\s+SqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bNpgsqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMySqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSqliteConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bOracleConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Java / Kotlin
        new(@"\bDriverManager\s*\.\s*getConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bDataSource\s*\.\s*getConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bHikariDataSource\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bJdbcTemplate\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bNamedParameterJdbcTemplate\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bEntityManagerFactory\s*\.", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // JavaScript/TypeScript
        new(@"\bmysql\s*\.\s*createConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmysql2\s*\.\s*createConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bcreatePool\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+Pool\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpg\s*\.\s*(?:Pool|Client)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+Client\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmongoose\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMongoClient\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSequelize\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bPrismaClient\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Python
        new(@"\bpsycopg2\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bsqlite3\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpymysql\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmysql\.connector\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bcreate_engine\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\basyncpg\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Go
        new(@"\bsql\s*\.\s*Open\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bgorm\s*\.\s*Open\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bpgx\s*\.\s*Connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Ruby
        new(@"\bActiveRecord\s*\.\s*Base\s*\.\s*establish_connection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bPG\s*\.\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bMysql2\s*\:\:\s*Client\s*\.\s*new\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // PHP
        new(@"\bnew\s+PDO\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bmysqli_connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Rust
        new(@"\bPgPool\s*\:\:\s*connect\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSqliteConnection\s*\:\:\s*open\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    ];

    /// <summary>API 호출 첫 인자 SQL 문자열 — JDBC/ADO/PDO/Node 등 공통.</summary>
    internal static readonly Regex ApiSqlFirstArgRegex = new(
        @"\b(?:query|execute|executeQuery|executeUpdate|executeBatch|rawQuery|prepareStatement|prepare|exec|Exec|Query|QueryRow|ExecContext|QueryContext|update|batchUpdate|ExecuteSqlRaw|ExecuteSqlInterpolated|FromSqlRaw|FromSqlInterpolated|ExecuteSqlAsync)\s*\(\s*(""(?:\\.|[^""\\])*""|'(?:\\.|[^'\\])*'|`(?:[^`\\]|\\.)*`|(?:\$@|@)?""(?:(?:\\.|[^""\\])*)""|(?:[LuUu8]+)?R""(?:([A-Za-z0-9_]*))\((.*?)\)\1"")",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    internal static readonly Regex[] NoSqlCollectionPatterns =
    [
        new(@"\bcollection\s*\(\s*['""`](\w+)['""`]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bdb\s*\.\s*(\w+)\s*\.\s*(?:find|findOne|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|aggregate)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bgetCollection\s*\(\s*['""`](\w+)['""`]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    ];

    internal static readonly Regex JpaTableAnnotationRegex = new(
        @"@Table\s*\(\s*name\s*=\s*['""`](\w+)['""`]",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex JdbcUrlRegex = new(
        @"jdbc:(?:mysql|mariadb|postgresql|oracle|sqlserver|sqlite)[^'""\s;]*",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex MongoUriRegex = new(
        @"mongodb(?:\+srv)?://[^\s'""]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly string[] EntitySuffixes =
        ["Repository", "Repo", "Dao", "Mapper", "Service", "Model", "Entity"];

    internal static IEnumerable<string> ExtractConnectionCatalogHints(string text)
    {
        foreach (Match match in SqlPatternHelper.ConnectionStringCatalogRegex.Matches(text))
        {
            yield return match.Groups[1].Value.Trim();
        }

        foreach (Match match in SqlPatternHelper.SqliteDataSourceRegex.Matches(text))
        {
            yield return Path.GetFileName(match.Groups[1].Value.Trim().Trim('\"', '\''));
        }

        foreach (Match match in JdbcUrlRegex.Matches(text))
        {
            yield return match.Value;
        }

        foreach (Match match in MongoUriRegex.Matches(text))
        {
            yield return "mongodb";
        }
    }

    internal static IEnumerable<string> ExpandEntityAliases(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            yield break;
        }

        yield return token;

        foreach (var suffix in EntitySuffixes)
        {
            if (token.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) && token.Length > suffix.Length)
            {
                yield return token[..^suffix.Length];
            }
        }

        var stripped = token;
        foreach (var suffix in EntitySuffixes)
        {
            if (stripped.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) && stripped.Length > suffix.Length)
            {
                stripped = stripped[..^suffix.Length];
                break;
            }
        }

        if (stripped.Length > 0)
        {
            yield return char.ToUpperInvariant(stripped[0]) + stripped[1..];
        }
    }
}
