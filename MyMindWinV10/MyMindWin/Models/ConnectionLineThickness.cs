namespace MyMindWin.Models
{
    public static class ConnectionLineThicknessPresets
    {
        public const double Thin = 1.0;
        public const double Normal = 1.8;
        public const double Medium = 2.5;
        public const double Thick = 3.5;
        public const double ExtraThick = 5.0;

        public static readonly double[] Presets = [Thin, Normal, Medium, Thick, ExtraThick];

        public static string GetDisplayName(double thickness) => thickness switch
        {
            Thin => "얇게",
            Normal => "보통",
            Medium => "중간",
            Thick => "굵게",
            ExtraThick => "매우 굵게",
            _ => $"{thickness:0.#} px"
        };

        public static double Normalize(double thickness)
            => Presets.OrderBy(t => Math.Abs(t - thickness)).First();
    }
}
