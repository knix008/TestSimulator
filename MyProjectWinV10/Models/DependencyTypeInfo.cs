using MyProject.Theme;

namespace MyProject.Models
{
    public static class DependencyTypeInfo
    {
        public static string GetDisplayName(DependencyType type) => type switch
        {
            DependencyType.FS => AppLocalizer.Get("Dep.FS.Name"),
            DependencyType.FF => AppLocalizer.Get("Dep.FF.Name"),
            DependencyType.SS => AppLocalizer.Get("Dep.SS.Name"),
            DependencyType.SF => AppLocalizer.Get("Dep.SF.Name"),
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
            DependencyType.FS => AppLocalizer.Get("Dep.FS.Desc"),
            DependencyType.FF => AppLocalizer.Get("Dep.FF.Desc"),
            DependencyType.SS => AppLocalizer.Get("Dep.SS.Desc"),
            DependencyType.SF => AppLocalizer.Get("Dep.SF.Desc"),
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
