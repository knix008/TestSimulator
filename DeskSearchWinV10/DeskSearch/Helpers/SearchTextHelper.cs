using System.Text;
using System.Text.RegularExpressions;

namespace DeskSearch.Helpers;

internal static class SearchTextHelper
{
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);

    /// <summary>
    /// Normalizes text for cross-language file name matching (NFC).
    /// UI language is limited to ko/en; search itself is language-agnostic.
    /// </summary>
    public static string Normalize(string value)
    {
        if (string.IsNullOrEmpty(value))
            return value;

        return value.Normalize(NormalizationForm.FormC);
    }

    public static StringComparison GetComparison(bool caseSensitive) =>
        caseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;

    public static bool TryCreateRegex(string pattern, bool caseSensitive, out Regex? regex)
    {
        regex = null;
        if (string.IsNullOrWhiteSpace(pattern))
            return false;

        try
        {
            var options = RegexOptions.CultureInvariant | RegexOptions.Compiled;
            if (!caseSensitive)
                options |= RegexOptions.IgnoreCase;

            regex = new Regex(pattern, options, RegexTimeout);
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (RegexMatchTimeoutException)
        {
            return false;
        }
    }
}
