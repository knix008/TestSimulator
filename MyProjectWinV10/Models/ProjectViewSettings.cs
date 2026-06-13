using MyProject.Theme;

namespace MyProject.Models
{
    public sealed class ProjectViewSettings
    {
        public int[] TaskGridColumnWidths { get; set; } = DefaultTaskGridColumnWidths();
        public DependencyType DefaultDependencyType { get; set; } = DependencyType.FS;
        public int DayWidth { get; set; } = AppTheme.DefaultDayWidth;
        public int SplitterDistance { get; set; } = 560;

        public static ProjectViewSettings CreateDefault() => new()
        {
            TaskGridColumnWidths = (int[])DefaultTaskGridColumnWidths().Clone(),
            DefaultDependencyType = AppSettings.DefaultDependencyType,
            DayWidth = AppTheme.DefaultDayWidth,
            SplitterDistance = 560
        };

        public ProjectViewSettings Clone() => new()
        {
            TaskGridColumnWidths = (int[])TaskGridColumnWidths.Clone(),
            DefaultDependencyType = DefaultDependencyType,
            DayWidth = DayWidth,
            SplitterDistance = SplitterDistance
        };

        public static int[] DefaultTaskGridColumnWidths() =>
            new[] { 32, 200, 58, 34, 30, 88, 120 };

        public static int[] SanitizeColumnWidths(int[] widths)
        {
            var defaults = DefaultTaskGridColumnWidths();
            var result = new int[defaults.Length];
            for (int i = 0; i < result.Length; i++)
            {
                int value = i < widths.Length ? widths[i] : defaults[i];
                result[i] = Math.Clamp(value, GetMinColumnWidth(i), 800);
            }
            return result;
        }

        private static int GetMinColumnWidth(int columnIndex) => columnIndex switch
        {
            0 => 28,
            1 => 80,
            2 => 52,
            3 => 30,
            4 => 28,
            5 => 48,
            6 => 48,
            _ => 24
        };
    }
}
