using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

/// <summary>
/// Page-joined find/replace inspired by Stirling-PDF EditTextController.
/// Joins text spans before matching to handle kerning-split words.
/// </summary>
public sealed class PdfTextReplaceService
{
    public int ReplaceOnPage(PageModel page, string searchText, string replacement, bool matchCase = false)
    {
        if (string.IsNullOrEmpty(searchText))
        {
            return 0;
        }

        var elements = page.TextElements
            .OrderBy(e => e.Bounds.Left)
            .ThenByDescending(e => e.Bounds.Top)
            .ToList();

        if (elements.Count == 0)
        {
            return 0;
        }

        var joined = string.Concat(elements.Select(e => e.Text));
        var comparison = matchCase ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;
        var index = joined.IndexOf(searchText, comparison);

        if (index < 0)
        {
            return 0;
        }

        var endIndex = index + searchText.Length;
        var charOffset = 0;
        var startElementIndex = -1;
        var endElementIndex = -1;

        for (var i = 0; i < elements.Count; i++)
        {
            var length = elements[i].Text.Length;
            if (startElementIndex < 0 && charOffset + length > index)
            {
                startElementIndex = i;
            }

            if (startElementIndex >= 0 && charOffset + length >= endIndex)
            {
                endElementIndex = i;
                break;
            }

            charOffset += length;
        }

        if (startElementIndex < 0 || endElementIndex < 0)
        {
            return 0;
        }

        var localStart = index - elements.Take(startElementIndex).Sum(e => e.Text.Length);
        var replacementApplied = ApplyCrossElementReplacement(
            elements,
            startElementIndex,
            endElementIndex,
            index,
            searchText.Length,
            replacement);

        return replacementApplied ? 1 : 0;
    }

    public int ReplaceAll(EditorDocument document, string searchText, string replacement, bool matchCase = false)
    {
        var count = 0;

        foreach (var page in document.Pages.Where(p => p.IsLoaded))
        {
            while (ReplaceOnPage(page, searchText, replacement, matchCase) > 0)
            {
                count++;
            }
        }

        return count;
    }

    private static bool ApplyCrossElementReplacement(
        IList<TextElement> elements,
        int startIndex,
        int endIndex,
        int joinedMatchStart,
        int matchLength,
        string replacement)
    {
        var localStart = joinedMatchStart - elements.Take(startIndex).Sum(e => e.Text.Length);

        if (startIndex == endIndex)
        {
            var element = elements[startIndex];
            var text = element.Text;
            element.Text = text[..localStart] + replacement + text[(localStart + matchLength)..];
            return true;
        }

        var first = elements[startIndex];
        var last = elements[endIndex];
        var matchEnd = joinedMatchStart + matchLength;
        var endOffsetInLast = matchEnd - elements.Take(endIndex).Sum(e => e.Text.Length);
        var suffix = last.Text[endOffsetInLast..];

        first.Text = first.Text[..localStart] + replacement + suffix;

        for (var i = startIndex + 1; i <= endIndex; i++)
        {
            elements[i].Text = string.Empty;
        }

        return true;
    }
}
