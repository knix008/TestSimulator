using System.Globalization;
using System.Text;
using System.Drawing.Drawing2D;
using SVGEditorWinV10.Models;

namespace SVGEditorWinV10.Rendering;

public static class SvgFillRenderer
{
    public static Brush CreateBrush(SvgElement element)
    {
        var fillColor = SvgColorHelper.WithOpacity(element.FillColorArgb, element.FillOpacity);
        if (element.FillPattern == FillPattern.Solid)
            return new SolidBrush(fillColor);

        return new HatchBrush(ToHatchStyle(element.FillPattern), fillColor, GetPatternBackground(fillColor));
    }

    public static Brush CreatePreviewBrush(Color fillColor, FillPattern pattern, float fillOpacity)
    {
        var previewColor = SvgColorHelper.WithOpacity(fillColor.ToArgb(), fillOpacity * 0.35f);
        if (pattern == FillPattern.Solid)
            return new SolidBrush(previewColor);

        return new HatchBrush(ToHatchStyle(pattern), previewColor, Color.FromArgb(40, GetPatternBackground(fillColor)));
    }

    public static string GetFillAttribute(SvgElement element)
    {
        if (element.Kind == SvgElementKind.Line)
            return string.Empty;

        if (element.FillPattern == FillPattern.Solid)
        {
            var fill = ColorToHex(SvgColorHelper.GetRgbColor(element.FillColorArgb));
            var opacity = SvgColorHelper.GetOpacityAttribute("fill-opacity", element.FillOpacity);
            var dataOpacity = element.FillOpacity < 0.999f
                ? $""" data-fill-opacity="{element.FillOpacity.ToString("0.##", CultureInfo.InvariantCulture)}" """
                : string.Empty;
            return $"""fill="{fill}"{opacity}{dataOpacity} """;
        }

        var patternOpacity = SvgColorHelper.GetOpacityAttribute("fill-opacity", element.FillOpacity);
        var patternDataOpacity = element.FillOpacity < 0.999f
            ? $""" data-fill-opacity="{element.FillOpacity.ToString("0.##", CultureInfo.InvariantCulture)}" """
            : string.Empty;
        return $"""fill="url(#{GetPatternId(element.FillPattern, element.FillColorArgb)})" data-fill-color="{ColorToHex(SvgColorHelper.GetRgbColor(element.FillColorArgb))}" data-fill-pattern="{element.FillPattern}"{patternOpacity}{patternDataOpacity} """;
    }

    public static void AppendPatternDefinitions(StringBuilder sb, IEnumerable<SvgElement> elements)
    {
        var needed = elements
            .Where(e => e.Kind != SvgElementKind.Line && e.FillPattern != FillPattern.Solid)
            .Select(e => (e.FillPattern, e.FillColorArgb))
            .Distinct()
            .OrderBy(x => x.FillPattern)
            .ThenBy(x => x.FillColorArgb);

        foreach (var (pattern, colorArgb) in needed)
            AppendPatternDefinition(sb, pattern, colorArgb);
    }

    public static string GetPatternId(FillPattern pattern, int colorArgb) =>
        $"pattern-{pattern.ToString().ToLowerInvariant()}-{colorArgb:X8}";

    private static void AppendPatternDefinition(StringBuilder sb, FillPattern pattern, int colorArgb)
    {
        var id = GetPatternId(pattern, colorArgb);
        var foreground = ColorToHex(Color.FromArgb(colorArgb));
        var background = ColorToHex(GetPatternBackground(Color.FromArgb(colorArgb)));

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <pattern id="{id}" width="8" height="8" patternUnits="userSpaceOnUse">""");
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""    <rect width="8" height="8" fill="{background}" />""");

        switch (pattern)
        {
            case FillPattern.Horizontal:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <line x1="0" y1="0" x2="8" y2="0" stroke="{foreground}" stroke-width="1" />""");
                break;
            case FillPattern.Vertical:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <line x1="0" y1="0" x2="0" y2="8" stroke="{foreground}" stroke-width="1" />""");
                break;
            case FillPattern.ForwardDiagonal:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <line x1="0" y1="8" x2="8" y2="0" stroke="{foreground}" stroke-width="1" />""");
                break;
            case FillPattern.BackwardDiagonal:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <line x1="0" y1="0" x2="8" y2="8" stroke="{foreground}" stroke-width="1" />""");
                break;
            case FillPattern.Cross:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <line x1="0" y1="0" x2="8" y2="0" stroke="{foreground}" stroke-width="1" />""");
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <line x1="0" y1="0" x2="0" y2="8" stroke="{foreground}" stroke-width="1" />""");
                break;
            case FillPattern.DiagonalCross:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <line x1="0" y1="8" x2="8" y2="0" stroke="{foreground}" stroke-width="1" />""");
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <line x1="0" y1="0" x2="8" y2="8" stroke="{foreground}" stroke-width="1" />""");
                break;
            case FillPattern.Dots:
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""    <circle cx="2" cy="2" r="1" fill="{foreground}" />""");
                break;
        }

        sb.AppendLine("  </pattern>");
    }

    private static HatchStyle ToHatchStyle(FillPattern pattern) => pattern switch
    {
        FillPattern.Horizontal => HatchStyle.Horizontal,
        FillPattern.Vertical => HatchStyle.Vertical,
        FillPattern.ForwardDiagonal => HatchStyle.ForwardDiagonal,
        FillPattern.BackwardDiagonal => HatchStyle.BackwardDiagonal,
        FillPattern.Cross => HatchStyle.Cross,
        FillPattern.DiagonalCross => HatchStyle.DiagonalCross,
        FillPattern.Dots => HatchStyle.Percent50,
        _ => HatchStyle.Horizontal
    };

    private static Color GetPatternBackground(Color fillColor)
    {
        return Color.FromArgb(
            255,
            Blend(fillColor.R, 255, 0.72f),
            Blend(fillColor.G, 255, 0.72f),
            Blend(fillColor.B, 255, 0.72f));
    }

    private static int Blend(int from, int to, float amount) =>
        (int)Math.Clamp(from + (to - from) * amount, 0, 255);

    private static string ColorToHex(Color color) =>
        color.A < 255
            ? $"#{color.A:X2}{color.R:X2}{color.G:X2}{color.B:X2}"
            : $"#{color.R:X2}{color.G:X2}{color.B:X2}";
}
