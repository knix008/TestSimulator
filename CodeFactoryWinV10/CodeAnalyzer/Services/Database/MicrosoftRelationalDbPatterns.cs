using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Database;

/// <summary>Microsoft SQL Server / LocalDB / Azure SQL / Access(OLE DB) 등 Microsoft DB 접근 패턴.</summary>
internal static class MicrosoftRelationalDbPatterns
{
    internal static readonly Regex[] ConnectionApiPatterns =
    [
        // ADO.NET — SQL Server
        new(@"\b(?:Microsoft\.Data\.SqlClient\.)?SqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+(?:Microsoft\.Data\.SqlClient\.)?SqlConnection\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSqlConnectionStringBuilder\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+SqlConnectionStringBuilder\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // EF Core — SQL Server provider
        new(@"\b(?:options\s*\.\s*)?UseSqlServer\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bUseAzureSql\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSqlServerDbContextOptionsExtensions\s*\.\s*UseSqlServer\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // LINQ to SQL
        new(@"\bnew\s+\w*DataContext\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // ODBC / OLE DB
        new(@"\b(?:OdbcConnection|OleDbConnection)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+(?:OdbcConnection|OleDbConnection)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Java JDBC SQL Server
        new(@"\bDriverManager\s*\.\s*getConnection\s*\(\s*[""']jdbc:sqlserver:", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Node mssql package
        new(@"\b(?:mssql|tedious)\s*\.", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+ConnectionPool\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\brequire\s*\(\s*['""]mssql['""]\s*\)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // PowerShell / .NET generic
        new(@"\bInvoke-Sqlcmd\b", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    ];

    internal static readonly Regex[] ExecutionApiPatterns =
    [
        new(@"\b(?:Microsoft\.Data\.SqlClient\.)?SqlCommand\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bnew\s+(?:Microsoft\.Data\.SqlClient\.)?SqlCommand\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSqlDataAdapter\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bSqlBulkCopy\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:ExecuteReader|ExecuteNonQuery|ExecuteScalar|ExecuteXmlReader)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:FromSqlRaw|FromSqlInterpolated|ExecuteSqlRaw|ExecuteSqlInterpolated|ExecuteSqlAsync)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bDatabase\s*\.\s*(?:ExecuteSqlRaw|ExecuteSqlInterpolated|ExecuteSql)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:OdbcCommand|OleDbCommand)\s*\(", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bCommandText\s*=", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\bsp_executesql\b", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new(@"\b(?:EXEC|EXECUTE)\s+(?:\(\s*)?@?\w+", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    ];

    /// <summary>EF / ADO.NET / sp_executesql 등 SQL 문자열 인자.</summary>
    internal static readonly Regex SqlStringArgumentRegex = new(
        @"\b(?:FromSqlRaw|FromSqlInterpolated|ExecuteSqlRaw|ExecuteSqlInterpolated|ExecuteSqlAsync|SqlCommand)\s*\(\s*(""(?:\\.|[^""\\])*""|'(?:\\.|[^'\\])*'|(?:\$@|@)?""(?:(?:\\.|[^""\\])*)"")",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    internal static readonly Regex SpExecuteSqlLiteralRegex = new(
        @"\b(?:sp_executesql|EXEC(?:UTE)?)\s+(?:N)?(""(?:\\.|[^""\\])*""|'(?:\\.|[^'\\])*')",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    internal static readonly Regex SqlServerConnectionStringRegex = new(
        @"(?i)(?:Server|Data\s+Source)\s*=\s*[^;'""\s]+",
        RegexOptions.Compiled);

    internal static readonly Regex LocalDbConnectionRegex = new(
        @"(?i)\(localdb\)[^;'""\s\\]+",
        RegexOptions.Compiled);

    internal static readonly Regex AzureSqlConnectionRegex = new(
        @"(?i)[\w-]+\.database\.windows\.net",
        RegexOptions.Compiled);

    internal static readonly Regex JdbcSqlServerRegex = new(
        @"jdbc:sqlserver:[^'""\s;]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    internal static readonly Regex OleDbProviderRegex = new(
        @"(?i)Provider\s*=\s*Microsoft\.(?:Jet|ACE)\.OLEDB",
        RegexOptions.Compiled);

    internal static readonly Regex OdbcSqlServerDriverRegex = new(
        @"(?i)Driver\s*=\s*\{?\s*SQL\s+Server",
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

        if (SqlServerConnectionStringRegex.IsMatch(body)
            || LocalDbConnectionRegex.IsMatch(body)
            || AzureSqlConnectionRegex.IsMatch(body)
            || JdbcSqlServerRegex.IsMatch(body)
            || OleDbProviderRegex.IsMatch(body)
            || OdbcSqlServerDriverRegex.IsMatch(body))
        {
            return true;
        }

        if (body.Contains("Trusted_Connection", StringComparison.OrdinalIgnoreCase)
            || body.Contains("Integrated Security", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    internal static void ScanSqlStringArguments(string body, Action<string> scanSql)
    {
        foreach (var regex in new[] { SqlStringArgumentRegex, SpExecuteSqlLiteralRegex })
        {
            foreach (Match match in regex.Matches(body))
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
}
