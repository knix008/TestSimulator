using MyProject.Theme;

namespace MyProject.Models
{
    public sealed class ProjectViewSettings
    {
        public int[] TaskGridColumnWidths { get; set; } = DefaultTaskGridColumnWidths();
        public DependencyType DefaultDependencyType { get; set; } = DependencyType.FS;
        public DependencyLineEnd DefaultDependencyStartLineEnd { get; set; } = DependencyLineEnd.None;
        public DependencyLineEnd DefaultDependencyEndLineEnd { get; set; } = DependencyLineEnd.Arrow;
        public int DayWidth { get; set; } = AppTheme.DefaultDayWidth;
        public int SplitterDistance { get; set; } = 560;
        public int PropertiesPanelWidth { get; set; } = 300;
        public bool PropertiesPanelVisible { get; set; } = true;
        public bool ShowCriticalPath { get; set; } = false;
        public int NotesPanelHeight { get; set; } = 140;
        public bool NotesPanelVisible { get; set; } = true;

        public static ProjectViewSettings CreateDefault() => new()
        {
            TaskGridColumnWidths = (int[])DefaultTaskGridColumnWidths().Clone(),
            DefaultDependencyType = AppSettings.DefaultDependencyType,
            DayWidth = AppTheme.DefaultDayWidth,
            SplitterDistance = 560,
            PropertiesPanelWidth = 300,
            PropertiesPanelVisible = true,
            ShowCriticalPath = false,
            NotesPanelHeight = 140,
            NotesPanelVisible = true
        };

        public ProjectViewSettings Clone() => new()
        {
            TaskGridColumnWidths = (int[])TaskGridColumnWidths.Clone(),
            DefaultDependencyType = DefaultDependencyType,
            DefaultDependencyStartLineEnd = DefaultDependencyStartLineEnd,
            DefaultDependencyEndLineEnd = DefaultDependencyEndLineEnd,
            DayWidth = DayWidth,
            SplitterDistance = SplitterDistance,
            PropertiesPanelWidth = PropertiesPanelWidth,
            PropertiesPanelVisible = PropertiesPanelVisible,
            ShowCriticalPath = ShowCriticalPath,
            NotesPanelHeight = NotesPanelHeight,
            NotesPanelVisible = NotesPanelVisible
        };

        public static bool Equals(ProjectViewSettings? a, ProjectViewSettings? b)
        {
            if (ReferenceEquals(a, b))
                return true;
            if (a is null || b is null)
                return false;

            return a.DefaultDependencyType == b.DefaultDependencyType
                && a.DefaultDependencyStartLineEnd == b.DefaultDependencyStartLineEnd
                && a.DefaultDependencyEndLineEnd == b.DefaultDependencyEndLineEnd
                && a.DayWidth == b.DayWidth
                && LayoutDistanceEqual(a.SplitterDistance, b.SplitterDistance)
                && LayoutDistanceEqual(a.PropertiesPanelWidth, b.PropertiesPanelWidth)
                && a.PropertiesPanelVisible == b.PropertiesPanelVisible
                && a.ShowCriticalPath == b.ShowCriticalPath
                && a.NotesPanelHeight == b.NotesPanelHeight
                && a.NotesPanelVisible == b.NotesPanelVisible
                && a.TaskGridColumnWidths.AsSpan().SequenceEqual(b.TaskGridColumnWidths);
        }

        private static bool LayoutDistanceEqual(int a, int b) => Math.Abs(a - b) <= 4;

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
