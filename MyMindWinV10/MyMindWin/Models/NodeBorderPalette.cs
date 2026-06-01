namespace MyMindWin.Models
{
    public static class NodeBorderPalette
    {
        /// <summary>채움색과 동일. 선택 시에는 흰 테두리(두께 자동일 때).</summary>
        public const int InheritColorIndex = -1;

        public const int WhiteColorIndex = -2;

        public static string GetDisplayName(int colorIndex) => colorIndex switch
        {
            InheritColorIndex => "채움색·선택 강조",
            WhiteColorIndex => "흰색",
            _ => NodeColorPalette.GetDisplayName(colorIndex)
        };
    }
}
