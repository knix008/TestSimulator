using System.Text.RegularExpressions;

namespace CodeAnalyzer.Services.Metrics;

internal static class MetricsDecisionPatterns
{
    public static readonly Regex KeywordDecisionRegex = new(
        @"\b(if|else\s+if|elseif|select\s+case|case|for|foreach|while|do|loop|catch|&&|\|\|)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
}
