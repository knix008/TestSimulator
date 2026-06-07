using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Export;

public static class UmlDiagramLayout
{
    public static void Prepare(UmlProject project, UmlDiagram diagram)
    {
        foreach (var node in diagram.Nodes)
            node.Height = UmlDiagramRenderer.MeasureNodeHeight(project, node);
    }

    public static RectangleF CalculateBounds(UmlProject project, UmlDiagram diagram)
    {
        Prepare(project, diagram);
        if (diagram.Nodes.Count == 0)
            return RectangleF.Empty;

        float left = float.MaxValue;
        float top = float.MaxValue;
        float right = float.MinValue;
        float bottom = float.MinValue;

        foreach (var node in diagram.Nodes)
        {
            var bounds = node.Bounds;
            left = Math.Min(left, bounds.Left);
            top = Math.Min(top, bounds.Top);
            right = Math.Max(right, bounds.Right);
            bottom = Math.Max(bottom, bounds.Bottom);
        }

        return RectangleF.FromLTRB(left, top, right, bottom);
    }

    public static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var chars = name.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray();
        var sanitized = new string(chars).Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "Diagram" : sanitized;
    }
}
