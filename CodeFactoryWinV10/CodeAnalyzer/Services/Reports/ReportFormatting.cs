using System.Drawing;

using System.Net;

using System.Text;



namespace CodeAnalyzer.Services.Reports;



internal static class ReportFormatting

{

    public static string EscapeMarkdownCell(string value)

    {

        if (string.IsNullOrEmpty(value))

        {

            return string.Empty;

        }



        return value

            .Replace("|", "¦", StringComparison.Ordinal)

            .Replace("\r", " ", StringComparison.Ordinal)

            .Replace("\n", " ", StringComparison.Ordinal);

    }



    public static string EscapeHtml(string value)

        => WebUtility.HtmlEncode(value ?? string.Empty);



    public static string RiskBackgroundHex(double? score)

    {

        if (score is null)

        {

            return "#ffffff";

        }



        return ColorToHex(RiskToBackColor(score.Value));

    }



    public static string RiskForegroundHex(double? score)

    {

        if (score is null)

        {

            return "#1e293b";

        }



        return ColorToHex(RiskToForeColor(score.Value));

    }



    public static Color RiskToBackColor(double score)

    {

        score = Math.Clamp(score, 0, 100);

        return score switch

        {

            < 20 => Color.FromArgb(220, 252, 231),

            < 40 => Color.FromArgb(236, 252, 203),

            < 60 => Color.FromArgb(254, 243, 199),

            < 80 => Color.FromArgb(254, 215, 170),

            _ => Color.FromArgb(254, 202, 202)

        };

    }



    public static Color RiskToForeColor(double score)

        => score >= 75 ? Color.FromArgb(127, 29, 29) : Color.FromArgb(30, 41, 59);



    public static string ColorToHex(Color color) => $"#{color.R:X2}{color.G:X2}{color.B:X2}";



    public static int FindRiskColumnIndex(IReadOnlyList<string> headers)
    {
        for (var index = 0; index < headers.Count; index++)
        {
            var header = headers[index];
            if (header.Contains("위험", StringComparison.Ordinal)
                || header.Contains("상태", StringComparison.Ordinal))
            {
                return index;
            }
        }

        return -1;
    }

    public static string FormatFileName(string path, string rootDirectory)

    {

        if (string.IsNullOrWhiteSpace(path))

        {

            return string.Empty;

        }



        if (!string.IsNullOrWhiteSpace(rootDirectory)

            && path.StartsWith(rootDirectory, StringComparison.OrdinalIgnoreCase))

        {

            var relative = path[rootDirectory.Length..].TrimStart('\\', '/');

            return string.IsNullOrEmpty(relative) ? path : relative;

        }



        return path;

    }

}


