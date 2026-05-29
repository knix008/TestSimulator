namespace MyMindWin.Models
{
    public enum NodeShapeKind
    {
        RoundedRectangle,
        Rectangle,
        Pill,
        Ellipse,
        Diamond
    }

    public static class NodeShapeKindExtensions
    {
        public static string ToJsonValue(this NodeShapeKind kind) => kind switch
        {
            NodeShapeKind.Rectangle => "rectangle",
            NodeShapeKind.Pill => "pill",
            NodeShapeKind.Ellipse => "ellipse",
            NodeShapeKind.Diamond => "diamond",
            _ => "rounded"
        };

        public static NodeShapeKind FromJsonValue(string? value) => value?.ToLowerInvariant() switch
        {
            "rectangle" => NodeShapeKind.Rectangle,
            "pill" => NodeShapeKind.Pill,
            "ellipse" => NodeShapeKind.Ellipse,
            "diamond" => NodeShapeKind.Diamond,
            _ => NodeShapeKind.RoundedRectangle
        };

        public static string GetDisplayName(this NodeShapeKind kind) => kind switch
        {
            NodeShapeKind.Rectangle => "사각형",
            NodeShapeKind.Pill => "알약형",
            NodeShapeKind.Ellipse => "타원",
            NodeShapeKind.Diamond => "마름모",
            _ => "둥근 사각형"
        };
    }
}
