using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Security;

internal static class SecurityFindingsBuilder
{
    public static SecurityAnalysisResult Build(CodeMetricsResult? metrics)
    {
        if (metrics is null || metrics.Files.Count == 0)
        {
            return SecurityAnalysisResult.Empty;
        }

        var findings = new List<SecurityFinding>();
        foreach (var file in metrics.Files)
        {
            if (file.SecuritySmellHits.Count == 0)
            {
                continue;
            }

            string[]? lines = null;
            foreach (var hit in file.SecuritySmellHits)
            {
                var guidance = DetectionGuidanceTexts.ForSecurityRule(hit.RuleId);
                findings.Add(new SecurityFinding
                {
                    RuleId = hit.RuleId,
                    Label = hit.Label,
                    Severity = SecurityRemediationTexts.GetSeverity(hit.RuleId),
                    FilePath = file.FilePath,
                    LanguageId = file.LanguageId,
                    LineNumber = hit.LineNumber,
                    Snippet = TryReadSnippet(file.FilePath, hit.LineNumber, ref lines),
                    Explanation = guidance.Meaning,
                    Remediation = guidance.Action
                });
            }
        }

        return SecurityAnalysisResult.FromFindings(findings);
    }

    private static string? TryReadSnippet(string filePath, int lineNumber, ref string[]? lines)
    {
        if (lineNumber <= 0)
        {
            return null;
        }

        try
        {
            lines ??= File.ReadAllLines(filePath);
            if (lineNumber > lines.Length)
            {
                return null;
            }

            var text = lines[lineNumber - 1].Trim();
            return text.Length > 120 ? text[..120] + "…" : text;
        }
        catch
        {
            return null;
        }
    }
}
