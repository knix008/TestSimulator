using System.Text.Json;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

internal sealed record StructuredHeadingHint(string Title, int Level, string NormalizedKey);

/// <summary>
/// Unhwp JSON IR에서 문서 순서대로 제목(챕터) 힌트를 추출합니다.
/// </summary>
internal static class UnhwpJsonHeadingExtractor
{
    private static readonly Regex OutlineNumberPrefixRegex = new(
        @"^(?<prefix>(?:제\s*)?\d+(?:\.\d+)*)(?:\s*[.)])?\s+",
        RegexOptions.Compiled);

    public static IReadOnlyList<StructuredHeadingHint> Extract(string json)
    {
        var hints = new List<StructuredHeadingHint>();
        using var document = JsonDocument.Parse(json);

        if (!document.RootElement.TryGetProperty("sections", out JsonElement sections))
            return hints;

        foreach (JsonElement section in sections.EnumerateArray())
        {
            if (!section.TryGetProperty("content", out JsonElement content))
                continue;

            foreach (JsonElement block in content.EnumerateArray())
            {
                if (block.TryGetProperty("Paragraph", out JsonElement paragraph))
                    TryAddParagraphHint(hints, paragraph, inTable: false);

                if (block.TryGetProperty("Table", out JsonElement table))
                    ExtractTableHints(hints, table);
            }
        }

        return hints;
    }

    private static void ExtractTableHints(List<StructuredHeadingHint> hints, JsonElement table)
    {
        if (!table.TryGetProperty("rows", out JsonElement rows))
            return;

        foreach (JsonElement row in rows.EnumerateArray())
        {
            if (!row.TryGetProperty("cells", out JsonElement cells))
                continue;

            if (!TryGetSingleNonEmptyCell(cells, out JsonElement cell))
                continue;

            if (!cell.TryGetProperty("content", out JsonElement cellContent))
                continue;

            foreach (JsonElement item in cellContent.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                    continue;

                if (item.TryGetProperty("Paragraph", out JsonElement paragraph))
                    TryAddParagraphHint(hints, paragraph, inTable: true);
                else if (item.TryGetProperty("content", out _))
                    TryAddParagraphHint(hints, item, inTable: true);
            }
        }
    }

    private static void TryAddParagraphHint(
        List<StructuredHeadingHint> hints,
        JsonElement paragraph,
        bool inTable)
    {
        int headingLevel = 0;
        if (paragraph.TryGetProperty("style", out JsonElement style) &&
            style.TryGetProperty("heading_level", out JsonElement levelElement) &&
            levelElement.TryGetInt32(out int parsedLevel))
        {
            headingLevel = parsedLevel;
        }

        string text = ExtractPlainText(paragraph);
        if (string.IsNullOrWhiteSpace(text))
            return;

        text = CollapseWhitespace(text);
        if (headingLevel > 0)
        {
            AddHint(hints, text, Math.Clamp(headingLevel, 1, 6));
            return;
        }

        if (!inTable && !IsEntirelyBold(paragraph))
            return;

        if (TryParseOutlineHeading(text, out int outlineLevel, out string outlineTitle))
        {
            AddHint(hints, outlineTitle, outlineLevel);
            return;
        }

        if (IsEntirelyBold(paragraph) && text.Length is >= 4 and <= 96)
            AddHint(hints, text, inTable ? 2 : 2);
    }

    private static bool TryGetSingleNonEmptyCell(JsonElement cells, out JsonElement cell)
    {
        cell = default;
        int nonEmpty = 0;
        JsonElement candidate = default;

        foreach (JsonElement item in cells.EnumerateArray())
        {
            string text = ExtractCellPlainText(item);
            if (string.IsNullOrWhiteSpace(text))
                continue;

            nonEmpty++;
            candidate = item;
            if (nonEmpty > 1)
                return false;
        }

        if (nonEmpty != 1)
            return false;

        cell = candidate;
        return true;
    }

    private static string ExtractCellPlainText(JsonElement cell)
    {
        if (!cell.TryGetProperty("content", out JsonElement content))
            return string.Empty;

        var builder = new System.Text.StringBuilder();
        foreach (JsonElement item in content.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                continue;

            if (item.TryGetProperty("Paragraph", out JsonElement paragraph))
                builder.Append(ExtractPlainText(paragraph));
            else if (item.TryGetProperty("content", out _))
                builder.Append(ExtractPlainText(item));
        }

        return builder.ToString();
    }

    private static string ExtractPlainText(JsonElement paragraph)
    {
        if (!paragraph.TryGetProperty("content", out JsonElement content))
            return string.Empty;

        var builder = new System.Text.StringBuilder();
        foreach (JsonElement item in content.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                continue;

            if (item.TryGetProperty("Text", out JsonElement textNode) &&
                textNode.TryGetProperty("text", out JsonElement textValue))
            {
                builder.Append(textValue.GetString());
            }
        }

        return builder.ToString();
    }

    private static bool IsEntirelyBold(JsonElement paragraph)
    {
        if (!paragraph.TryGetProperty("content", out JsonElement content))
            return false;

        bool hasText = false;
        foreach (JsonElement item in content.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                continue;

            if (!item.TryGetProperty("Text", out JsonElement textNode))
                continue;

            string? text = textNode.TryGetProperty("text", out JsonElement textValue)
                ? textValue.GetString()
                : null;
            if (string.IsNullOrEmpty(text))
                continue;

            hasText = true;
            if (!textNode.TryGetProperty("style", out JsonElement style) ||
                !style.TryGetProperty("bold", out JsonElement boldElement) ||
                !boldElement.GetBoolean())
            {
                return false;
            }
        }

        return hasText;
    }

    private static bool TryParseOutlineHeading(string text, out int level, out string title)
    {
        level = 0;
        title = string.Empty;
        var match = OutlineNumberPrefixRegex.Match(text.Trim());
        if (!match.Success)
            return false;

        string number = match.Groups["prefix"].Value
            .Replace("제", string.Empty, StringComparison.Ordinal)
            .Trim();
        if (!number.Contains('.'))
            return false;

        title = CollapseWhitespace(text[match.Length..]);
        if (title.Length == 0 || title.Length > 96)
            return false;

        level = Math.Clamp(number.Split('.', StringSplitOptions.RemoveEmptyEntries).Length, 1, 6);
        return true;
    }

    private static void AddHint(List<StructuredHeadingHint> hints, string title, int level)
    {
        string normalized = NormalizeKey(title);
        if (normalized.Length == 0)
            return;

        level = Math.Clamp(level, 1, 6);
        if (hints.Any(h => h.NormalizedKey.Equals(normalized, StringComparison.OrdinalIgnoreCase)))
            return;

        hints.Add(new StructuredHeadingHint(title.Trim(), level, normalized));
    }

    internal static string NormalizeKey(string text)
    {
        string cleaned = CollapseWhitespace(text);
        cleaned = Regex.Replace(cleaned, @"\*\*(.+?)\*\*", "$1");
        cleaned = OutlineNumberPrefixRegex.Replace(cleaned, string.Empty);
        cleaned = Regex.Replace(cleaned, @"[^\p{L}\p{N}\s]", string.Empty);
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned.ToLowerInvariant();
    }

    private static string CollapseWhitespace(string text)
        => Regex.Replace(text.Trim(), @"\s+", " ");
}
