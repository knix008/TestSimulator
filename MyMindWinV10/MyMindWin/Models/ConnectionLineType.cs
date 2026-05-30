namespace MyMindWin.Models
{
    public enum ConnectionLineType
    {
        Bezier,
        Straight,
        Orthogonal,
        Arc
    }

    public static class ConnectionLineTypeExtensions
    {
        public static string ToJsonValue(this ConnectionLineType type) => type switch
        {
            ConnectionLineType.Straight => "straight",
            ConnectionLineType.Orthogonal => "orthogonal",
            ConnectionLineType.Arc => "arc",
            _ => "bezier"
        };

        public static ConnectionLineType FromJsonValue(string? value) => value?.ToLowerInvariant() switch
        {
            "straight" => ConnectionLineType.Straight,
            "orthogonal" => ConnectionLineType.Orthogonal,
            "arc" => ConnectionLineType.Arc,
            _ => ConnectionLineType.Bezier
        };

        public static string GetDisplayName(this ConnectionLineType type) => type switch
        {
            ConnectionLineType.Straight => "직선",
            ConnectionLineType.Orthogonal => "직각",
            ConnectionLineType.Arc => "원호",
            _ => "곡선"
        };

        public static string GetDescription(this ConnectionLineType type) => type switch
        {
            ConnectionLineType.Straight => "노드 가장자리를 직선으로 연결",
            ConnectionLineType.Orthogonal => "꺾인 직각 연결선",
            ConnectionLineType.Arc => "원형 호 또는 완만한 곡선",
            _ => "부드러운 베지어 곡선"
        };
    }
}
