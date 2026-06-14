namespace MyProject.Models
{
    public static class DependencyLineEndInfo
    {
        public static string GetDisplayName(DependencyLineEnd style) => style switch
        {
            DependencyLineEnd.None => "None",
            DependencyLineEnd.Arrow => "Arrow (filled)",
            DependencyLineEnd.OpenArrow => "Open arrow",
            DependencyLineEnd.Dot => "Dot",
            DependencyLineEnd.Square => "Square",
            _ => style.ToString()
        };

        public static IReadOnlyList<DependencyLineEnd> AllStyles { get; } =
            Enum.GetValues<DependencyLineEnd>().ToArray();

        public static DependencyLineEnd Parse(string? value, DependencyLineEnd fallback = DependencyLineEnd.Arrow)
        {
            if (string.IsNullOrWhiteSpace(value))
                return fallback;
            return Enum.TryParse<DependencyLineEnd>(value, ignoreCase: true, out var parsed)
                ? parsed
                : fallback;
        }
    }
}
