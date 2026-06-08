using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Security;

internal static class SecurityRemediationTexts
{
    public static SecuritySeverity GetSeverity(string ruleId) =>
        ruleId.ToLowerInvariant() switch
        {
            "hardcoded-secret" or "sql-concat" or "jdbc-concat" or "go-sql-fmt"
                or "eval-exec" or "js-eval" or "php-eval" or "ruby-eval"
                or "php-shell" or "os-system" or "subprocess-shell" or "runtime-exec"
                or "go-exec" or "cpp-system" or "inner-html" or "dangerous-html"
                or "document-write" or "pickle-loads" or "yaml-unsafe-load" or "cpp-unsafe-func"
                => SecuritySeverity.Critical,
            _ => SecuritySeverity.Warning
        };

    public static string GetRemediation(string ruleId) =>
        DetectionGuidanceTexts.ForSecurityRule(ruleId).Action;
}
