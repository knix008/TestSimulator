using System.Runtime.InteropServices;
using System.Text;

namespace MyWorkspace.Win;

internal static class ClipboardHtmlHelper
{
    private const string StartFragmentMarker = "<!--StartFragment-->";
    private const string EndFragmentMarker = "<!--EndFragment-->";

    public static string? TryGetHtmlFragment()
    {
        try
        {
            if (!Clipboard.ContainsData(DataFormats.Html))
                return null;

            if (!Clipboard.TryGetData(DataFormats.Html, out string? raw) || string.IsNullOrWhiteSpace(raw))
                return null;

            return ExtractFragment(raw);
        }
        catch (ExternalException)
        {
            return null;
        }
    }

    public static void SetHtmlAndPlainText(string htmlFragment, string plainText)
    {
        var data = new DataObject();
        data.SetText(plainText ?? string.Empty);

        if (!string.IsNullOrEmpty(htmlFragment))
            data.SetData(DataFormats.Html, BuildHtmlClipboardData(htmlFragment));

        Clipboard.SetDataObject(data, copy: true);
    }

    public static bool ContainsPageAssetReference(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        (value.Contains("page-asset:", StringComparison.OrdinalIgnoreCase) ||
         value.Contains("page-assets.myworkspace", StringComparison.OrdinalIgnoreCase));

    private static string ExtractFragment(string raw)
    {
        var start = GetClipboardOffset(raw, "StartFragment:");
        var end = GetClipboardOffset(raw, "EndFragment:");
        if (start >= 0 && end > start && end <= raw.Length)
            return raw.Substring(start, end - start);

        start = GetClipboardOffset(raw, "StartHTML:");
        end = GetClipboardOffset(raw, "EndHTML:");
        if (start >= 0 && end > start && end <= raw.Length)
            return raw.Substring(start, end - start);

        return raw;
    }

    private static int GetClipboardOffset(string raw, string marker)
    {
        var markerIndex = raw.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
            return -1;

        var valueStart = markerIndex + marker.Length;
        var valueEnd = valueStart;
        while (valueEnd < raw.Length && char.IsDigit(raw[valueEnd]))
            valueEnd++;

        return int.TryParse(raw.AsSpan(valueStart, valueEnd - valueStart), out var offset) ? offset : -1;
    }

    private static string BuildHtmlClipboardData(string fragment)
    {
        var body = new StringBuilder()
            .Append("<html><body>")
            .Append(StartFragmentMarker)
            .Append(fragment)
            .Append(EndFragmentMarker)
            .Append("</body></html>")
            .ToString();

        var header = BuildHeaderPlaceholder();
        var startHtml = header.Length;
        var endHtml = startHtml + body.Length;
        var startFragment = startHtml + body.IndexOf(StartFragmentMarker, StringComparison.Ordinal);
        var endFragment = startHtml + body.IndexOf(EndFragmentMarker, StringComparison.Ordinal) + EndFragmentMarker.Length;

        header = BuildHeader(startHtml, endHtml, startFragment, endFragment);
        startHtml = header.Length;
        endHtml = startHtml + body.Length;
        startFragment = startHtml + body.IndexOf(StartFragmentMarker, StringComparison.Ordinal);
        endFragment = startHtml + body.IndexOf(EndFragmentMarker, StringComparison.Ordinal) + EndFragmentMarker.Length;
        header = BuildHeader(startHtml, endHtml, startFragment, endFragment);

        return header + body;
    }

    private static string BuildHeaderPlaceholder() =>
        "Version:0.9\r\n" +
        "StartHTML:0000000000\r\n" +
        "EndHTML:0000000000\r\n" +
        "StartFragment:0000000000\r\n" +
        "EndFragment:0000000000\r\n";

    private static string BuildHeader(int startHtml, int endHtml, int startFragment, int endFragment) =>
        "Version:0.9\r\n" +
        $"StartHTML:{startHtml:D10}\r\n" +
        $"EndHTML:{endHtml:D10}\r\n" +
        $"StartFragment:{startFragment:D10}\r\n" +
        $"EndFragment:{endFragment:D10}\r\n";
}
