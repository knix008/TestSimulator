using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Metrics;

internal sealed record LanguageSecurityRule(
    string Id,
    string Label,
    Regex Pattern,
    IReadOnlyList<string> LanguageIds);

/// <summary>언어별·공통 보안 smell 정규식 규칙 카탈로그.</summary>
internal static class LanguageSecuritySmellCatalog
{
    private static readonly RegexOptions Default = RegexOptions.Compiled | RegexOptions.IgnoreCase;

    private static readonly LanguageSecurityRule[] Rules =
    [
        // 공통
        Rule("hardcoded-secret", "하드코딩 비밀",
            @"(password|api[_-]?key|secret|token|auth)\s*=\s*[""'][^""']{3,}[""']",
            AllLanguages()),
        Rule("sql-concat", "SQL 문자열 연결",
            @"SELECT\s+.+\s+FROM\s+.+\s*\+|(?:execute|query)\s*\(\s*[""'][^""']*[""']\s*\+",
            AllLanguages()),

        // C# / VB.NET
        Rule("sync-over-async", "동기 대기(.Result/.Wait)", @"\.Result\b|\.Wait\s*\(\s*\)", Lang("csharp", "vbnet")),
        Rule("weak-crypto", "취약 암호화(MD5/DES 등)",
            @"\b(?:MD5|SHA1|DES|RC2)\.(?:Create|ComputeHash)\b", Lang("csharp", "vbnet")),
        Rule("cert-validation-off", "인증서 검증 비활성화",
            @"ServerCertificateValidationCallback|CheckCertificateRevocationList\s*=\s*false", Lang("csharp", "vbnet")),

        // Java / Kotlin 스타일
        Rule("runtime-exec", "Runtime.exec", @"Runtime\.getRuntime\s*\(\s*\)\.exec\s*\(", Lang("java")),
        Rule("jdbc-concat", "JDBC 문자열 연결",
            @"(?:Statement|PreparedStatement).*\.execute(?:Query|Update)?\s*\(\s*[""'][^""']*[""']\s*\+", Lang("java")),
        Rule("insecure-hostname", "호스트명 검증 우회", @"setHostnameVerifier\s*\(", Lang("java")),

        // Python
        Rule("eval-exec", "eval/exec", @"\b(?:eval|exec)\s*\(", Lang("python")),
        Rule("pickle-loads", "pickle 역직렬화", @"pickle\.loads\s*\(", Lang("python")),
        Rule("subprocess-shell", "subprocess shell=True",
            @"subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True", Lang("python")),
        Rule("os-system", "os.system", @"os\.system\s*\(", Lang("python")),

        // JavaScript / TypeScript
        Rule("inner-html", "innerHTML 할당", @"\.innerHTML\s*=", Lang("javascript")),
        Rule("dangerous-html", "dangerouslySetInnerHTML", @"dangerouslySetInnerHTML", Lang("javascript")),
        Rule("js-eval", "eval()", @"\beval\s*\(", Lang("javascript")),
        Rule("document-write", "document.write", @"document\.write\s*\(", Lang("javascript")),

        // PHP
        Rule("php-shell", "명령 실행 함수", @"\b(?:shell_exec|system|passthru|proc_open)\s*\(", Lang("php")),
        Rule("php-eval", "eval()", @"\beval\s*\(", Lang("php")),
        Rule("php-mysql", "mysql_query(폐기 API)", @"mysql_query\s*\(", Lang("php")),

        // Go
        Rule("go-sql-fmt", "SQL fmt 연결", @"(?:Query|Exec)\s*\(\s*fmt\.S(?:printf|print)", Lang("go")),
        Rule("go-exec", "exec.Command 동적 인자", @"exec\.Command\s*\([^)]*\+", Lang("go")),

        // Ruby
        Rule("ruby-eval", "eval/system", @"\b(?:eval|system)\s*\(|`[^`\n]+`", Lang("ruby")),

        // Rust
        Rule("rust-unwrap", "unwrap/expect", @"\.(?:unwrap|expect)\s*\(\s*\)", Lang("rust")),
        Rule("rust-unsafe", "unsafe 블록", @"\bunsafe\s*\{", Lang("rust")),

        // C / C++
        Rule("cpp-unsafe-func", "취약 C 함수", @"\b(?:strcpy|gets|sprintf|strcat)\s*\(", Lang("cpp")),
        Rule("cpp-system", "system() 호출", @"\bsystem\s*\(\s*", Lang("cpp")),

        // Swift
        Rule("swift-http", "평문 HTTP URL", @"URL\s*\(\s*string:\s*[""']http://", Lang("swift")),

        // Ruby / PHP / Python 공통 — 역직렬화
        Rule("yaml-unsafe-load", "YAML unsafe load", @"yaml\.load\s*\(", Lang("python"))
    ];

    public static IEnumerable<LanguageSecurityRule> GetRulesForLanguage(string? languageId)
    {
        var lang = NormalizeLanguageId(languageId);
        foreach (var rule in Rules)
        {
            if (rule.LanguageIds.Count == 0 || rule.LanguageIds.Contains(lang, StringComparer.OrdinalIgnoreCase))
            {
                yield return rule;
            }
        }
    }

    private static LanguageSecurityRule Rule(
        string id,
        string label,
        string pattern,
        IReadOnlyList<string> languageIds) =>
        new(id, label, new Regex(pattern, Default), languageIds);

    private static IReadOnlyList<string> Lang(params string[] ids) => ids;

    private static IReadOnlyList<string> AllLanguages() => [];

    private static string NormalizeLanguageId(string? languageId)
    {
        if (string.IsNullOrWhiteSpace(languageId))
        {
            return string.Empty;
        }

        return languageId.Trim().ToLowerInvariant() switch
        {
            "vb" => "vbnet",
            "typescript" or "ts" => "javascript",
            "kotlin" or "kt" => "java",
            _ => languageId.Trim().ToLowerInvariant()
        };
    }
}
