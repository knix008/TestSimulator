using System.Text;

namespace ReqTrace.Importing;

internal static class LlmCsvParser
{
    public static IReadOnlyList<string> ParseHeaders(string headerLine) => ParseLine(headerLine);

    public static List<LlmSheetRow> ParseRows(string headerLine, IReadOnlyList<string> dataLines)
    {
        var headers = ParseLine(headerLine);
        var rows = new List<LlmSheetRow>(dataLines.Count);
        var categoryContext = string.Empty;

        foreach (var line in dataLines)
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;

            var values = ParseLine(line);
            if (values.Count > 0 && string.Equals(values[0], "#SECTION", StringComparison.Ordinal))
            {
                var sectionText = values.Count > 1 ? values[1] : string.Empty;
                if (values.Count > 2 && !string.IsNullOrWhiteSpace(values[2]))
                    categoryContext = values[2];
                else if (!string.IsNullOrWhiteSpace(sectionText))
                    categoryContext = sectionText;

                rows.Add(new LlmSheetRow
                {
                    IsSection = true,
                    SectionText = sectionText,
                    CategoryContext = categoryContext,
                    Headers = headers,
                    Values = values,
                    CsvLine = line
                });
                continue;
            }

            var normalizedValues = NormalizeValues(headers, values);
            if (normalizedValues.All(string.IsNullOrWhiteSpace))
                continue;

            var rowCategory = GetField(headers, normalizedValues, "category");
            if (!string.IsNullOrWhiteSpace(rowCategory))
                categoryContext = rowCategory;

            rows.Add(new LlmSheetRow
            {
                CategoryContext = categoryContext,
                Headers = headers,
                Values = normalizedValues,
                CsvLine = line
            });
        }

        return rows;
    }

    public static string FormatRow(string headerLine, LlmSheetRow row) =>
        headerLine + Environment.NewLine + row.CsvLine;

    private static IReadOnlyList<string> NormalizeValues(IReadOnlyList<string> headers, IReadOnlyList<string> values)
    {
        if (values.Count >= headers.Count)
            return values.Take(headers.Count).ToList();

        var padded = new List<string>(headers.Count);
        padded.AddRange(values);
        while (padded.Count < headers.Count)
            padded.Add(string.Empty);

        return padded;
    }

    private static string GetField(IReadOnlyList<string> headers, IReadOnlyList<string> values, string name)
    {
        for (var i = 0; i < headers.Count && i < values.Count; i++)
        {
            if (string.Equals(headers[i], name, StringComparison.OrdinalIgnoreCase))
                return values[i].Trim();
        }

        return string.Empty;
    }

    internal static List<string> ParseLine(string line)
    {
        var fields = new List<string>();
        if (string.IsNullOrEmpty(line))
            return fields;

        var sb = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"')
                    {
                        sb.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    sb.Append(ch);
                }

                continue;
            }

            if (ch == '"')
            {
                inQuotes = true;
                continue;
            }

            if (ch == ',')
            {
                fields.Add(sb.ToString());
                sb.Clear();
                continue;
            }

            sb.Append(ch);
        }

        fields.Add(sb.ToString());
        return fields;
    }
}
