using System.Text;

namespace DeskSearch.Helpers;

internal static class SearchTextHelper
{
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
}
