namespace MyMindWin.Models
{
    public static class NodeBorderThicknessPresets
    {
        public const double Thin = 0.5;
        public const double Light = 1.0;
        public const double Medium = 1.5;
        public const double Bold = 2.0;
        public const double Heavy = 2.5;
        public const double ExtraHeavy = 3.0;

        public static readonly double?[] Presets = [null, Thin, Light, Medium, Bold, Heavy, ExtraHeavy];

        public static readonly double[] ExplicitPresets = [Thin, Light, Medium, Bold, Heavy, ExtraHeavy];

        public static string GetDisplayName(double? thickness) => thickness switch
        {
            null => "자동 (선택 시 강조)",
            Thin => "0.5 px",
            Light => "1.0 px",
            Medium => "1.5 px",
            Bold => "2.0 px",
            Heavy => "2.5 px",
            ExtraHeavy => "3.0 px",
            _ => $"{thickness:0.#} px"
        };

        public static double? Normalize(double? thickness)
        {
            if (!thickness.HasValue)
                return null;

            return ExplicitPresets.OrderBy(t => Math.Abs(t - thickness.Value)).First();
        }
    }
}
