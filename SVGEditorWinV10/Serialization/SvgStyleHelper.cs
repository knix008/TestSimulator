using System.Xml.Linq;

namespace SVGEditorWinV10.Serialization;

internal static class SvgStyleHelper
{
    public static string? GetAttribute(XElement node, string name)
    {
        var direct = node.Attribute(name)?.Value;
        if (!string.IsNullOrWhiteSpace(direct))
            return direct.Trim();

        var style = node.Attribute("style")?.Value;
        if (string.IsNullOrWhiteSpace(style))
            return null;

        foreach (var part in style.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var colon = part.IndexOf(':');
            if (colon <= 0)
                continue;

            var key = part[..colon].Trim();
            if (!key.Equals(name, StringComparison.OrdinalIgnoreCase))
                continue;

            return part[(colon + 1)..].Trim();
        }

        return null;
    }
}
