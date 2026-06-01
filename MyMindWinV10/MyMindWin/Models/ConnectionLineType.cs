namespace MyMindWin.Models
{
    /// <summary>FreeMind Edge Style과 동일한 4종 연결선.</summary>
    public enum ConnectionLineType
    {
        /// <summary>FreeMind: linear — 직선</summary>
        Linear,
        /// <summary>FreeMind: bezier — 부드러운 베지어</summary>
        Bezier,
        /// <summary>FreeMind: sharp_linear — 꺾인 직선(직각)</summary>
        SharpLinear,
        /// <summary>FreeMind: sharp_bezier — 꺾임 근처가 곡선인 베지어</summary>
        SharpBezier
    }

    public static class ConnectionLineTypeExtensions
    {
        public static string ToJsonValue(this ConnectionLineType type) => type switch
        {
            ConnectionLineType.Linear => "linear",
            ConnectionLineType.SharpLinear => "sharp_linear",
            ConnectionLineType.SharpBezier => "sharp_bezier",
            _ => "bezier"
        };

        public static ConnectionLineType FromJsonValue(string? value)
        {
            switch (value?.ToLowerInvariant().Replace("-", "_"))
            {
                case "linear":
                case "straight":
                    return ConnectionLineType.Linear;
                case "sharp_linear":
                case "orthogonal":
                case "horizontal":
                    return ConnectionLineType.SharpLinear;
                case "sharp_bezier":
                case "sharpbezier":
                case "arc":
                    return ConnectionLineType.SharpBezier;
                case "bezier":
                    return ConnectionLineType.Bezier;
                default:
                    return ConnectionLineType.Bezier;
            }
        }

        public static string GetDisplayName(this ConnectionLineType type) => type switch
        {
            ConnectionLineType.Linear => "Linear",
            ConnectionLineType.SharpLinear => "Sharp Linear",
            ConnectionLineType.SharpBezier => "Sharp Bezier",
            _ => "Bezier"
        };

        public static string GetDescription(this ConnectionLineType type) => type switch
        {
            ConnectionLineType.Linear => "FreeMind Linear — 두 노드를 직선으로 연결",
            ConnectionLineType.SharpLinear => "FreeMind Sharp Linear — 직각으로 꺾인 연결",
            ConnectionLineType.SharpBezier => "FreeMind Sharp Bezier — 꺾임이 있는 곡선 연결",
            _ => "FreeMind Bezier — 부드러운 S자 곡선"
        };
    }
}
