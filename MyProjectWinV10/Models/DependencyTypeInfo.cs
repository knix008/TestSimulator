namespace MyProject.Models
{
    public static class DependencyTypeInfo
    {
        public static string GetDisplayName(DependencyType type) => type switch
        {
            DependencyType.FS => "Finish-to-Start (FS)",
            DependencyType.FF => "Finish-to-Finish (FF)",
            DependencyType.SS => "Start-to-Start (SS)",
            DependencyType.SF => "Start-to-Finish (SF)",
            _ => type.ToString()
        };

        public static string GetShortName(DependencyType type) => type switch
        {
            DependencyType.FS => "FS",
            DependencyType.FF => "FF",
            DependencyType.SS => "SS",
            DependencyType.SF => "SF",
            _ => type.ToString()
        };

        public static string GetDescription(DependencyType type) => type switch
        {
            DependencyType.FS => "Successor starts after predecessor finishes",
            DependencyType.FF => "Successor finishes when predecessor finishes",
            DependencyType.SS => "Successor starts when predecessor starts",
            DependencyType.SF => "Successor finishes when predecessor starts",
            _ => ""
        };

        public static string GetTooltipText(DependencyType type)
        {
            string description = GetDescription(type);
            return string.IsNullOrEmpty(description)
                ? GetDisplayName(type)
                : $"{GetDisplayName(type)}\n{description}";
        }

        public static IReadOnlyList<DependencyType> AllTypes { get; } =
            Enum.GetValues<DependencyType>().ToArray();
    }
}
