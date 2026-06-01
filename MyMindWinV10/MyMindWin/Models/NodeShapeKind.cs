namespace MyMindWin.Models
{
    public enum NodeShapeKind
    {
        RoundedRectangle,
        Rectangle,
        Pill,
        Ellipse,
        Diamond,
        Cloud,
        Hexagon,
        SpeechBubble,
        Star,
        Parallelogram
    }

    public static class NodeShapeKindExtensions
    {
        public static string ToJsonValue(this NodeShapeKind kind) => kind switch
        {
            NodeShapeKind.Rectangle => "rectangle",
            NodeShapeKind.Pill => "pill",
            NodeShapeKind.Ellipse => "ellipse",
            NodeShapeKind.Diamond => "diamond",
            NodeShapeKind.Cloud => "cloud",
            NodeShapeKind.Hexagon => "hexagon",
            NodeShapeKind.SpeechBubble => "speech_bubble",
            NodeShapeKind.Star => "star",
            NodeShapeKind.Parallelogram => "parallelogram",
            _ => "rounded"
        };

        public static NodeShapeKind FromJsonValue(string? value) => value?.ToLowerInvariant() switch
        {
            "rectangle" => NodeShapeKind.Rectangle,
            "pill" => NodeShapeKind.Pill,
            "ellipse" => NodeShapeKind.Ellipse,
            "diamond" => NodeShapeKind.Diamond,
            "cloud" => NodeShapeKind.Cloud,
            "hexagon" => NodeShapeKind.Hexagon,
            "speech_bubble" or "speechbubble" => NodeShapeKind.SpeechBubble,
            "star" => NodeShapeKind.Star,
            "parallelogram" => NodeShapeKind.Parallelogram,
            _ => NodeShapeKind.RoundedRectangle
        };

        public static string GetDisplayName(this NodeShapeKind kind) => kind switch
        {
            NodeShapeKind.Rectangle => "사각형",
            NodeShapeKind.Pill => "알약형",
            NodeShapeKind.Ellipse => "타원",
            NodeShapeKind.Diamond => "마름모",
            NodeShapeKind.Cloud => "구름",
            NodeShapeKind.Hexagon => "육각형",
            NodeShapeKind.SpeechBubble => "말풍선",
            NodeShapeKind.Star => "별",
            NodeShapeKind.Parallelogram => "평행사변형",
            _ => "둥근 사각형"
        };
    }
}
