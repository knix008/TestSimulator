using MyProject.Theme;
using System.Windows.Forms;

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
        public int PropertiesPanelWidth { get; set; } = 340;
        public bool PropertiesPanelVisible { get; set; } = true;
        public bool ShowCriticalPath { get; set; } = false;
        public int NotesPanelHeight { get; set; } = 140;
        public bool NotesPanelVisible { get; set; } = true;
        public int? WindowX { get; set; }
        public int? WindowY { get; set; }
        public int WindowWidth { get; set; } = 1280;
        public int WindowHeight { get; set; } = 720;
        public FormWindowState WindowState { get; set; } = FormWindowState.Normal;
        public int SelectedTaskId { get; set; } = -1;
        public int SelectedNoteId { get; set; } = -1;
        public int GanttScrollY { get; set; }
        public DateTime? GanttViewStartDate { get; set; }
        public int TaskGridScrollX { get; set; }
        public int TaskGridScrollY { get; set; }

        public static ProjectViewSettings CreateDefault() => new()
        {
            TaskGridColumnWidths = (int[])DefaultTaskGridColumnWidths().Clone(),
            DefaultDependencyType = AppSettings.DefaultDependencyType,
            DayWidth = AppTheme.DefaultDayWidth,
            SplitterDistance = 560,
            PropertiesPanelWidth = 340,
            PropertiesPanelVisible = true,
            ShowCriticalPath = false,
            NotesPanelHeight = 140,
            NotesPanelVisible = true
        };

        public void CopyWindowSettingsTo(ProjectViewSettings target)
        {
            target.WindowX = WindowX;
            target.WindowY = WindowY;
            target.WindowWidth = WindowWidth;
            target.WindowHeight = WindowHeight;
            target.WindowState = WindowState;
        }

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
            NotesPanelVisible = NotesPanelVisible,
            WindowX = WindowX,
            WindowY = WindowY,
            WindowWidth = WindowWidth,
            WindowHeight = WindowHeight,
            WindowState = WindowState,
            SelectedTaskId = SelectedTaskId,
            SelectedNoteId = SelectedNoteId,
            GanttScrollY = GanttScrollY,
            GanttViewStartDate = GanttViewStartDate,
            TaskGridScrollX = TaskGridScrollX,
            TaskGridScrollY = TaskGridScrollY
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
                && a.WindowX == b.WindowX
                && a.WindowY == b.WindowY
                && LayoutDistanceEqual(a.WindowWidth, b.WindowWidth)
                && LayoutDistanceEqual(a.WindowHeight, b.WindowHeight)
                && a.WindowState == b.WindowState
                && a.TaskGridColumnWidths.AsSpan().SequenceEqual(b.TaskGridColumnWidths);
        }

        private static bool LayoutDistanceEqual(int a, int b) => Math.Abs(a - b) <= 4;

        public static int[] DefaultTaskGridColumnWidths() =>
            new[] { 32, 200, 58, 34, 84, 72, 58, 120 };

        public static int[] SanitizeColumnWidths(int[] widths)
        {
            var defaults = DefaultTaskGridColumnWidths();
            widths = MigrateLegacyColumnWidths(widths, defaults.Length);
            var result = new int[defaults.Length];
            for (int i = 0; i < result.Length; i++)
            {
                int value = i < widths.Length ? widths[i] : defaults[i];
                result[i] = Math.Clamp(value, GetMinColumnWidth(i), 800);
            }
            return result;
        }

        private static int[] MigrateLegacyColumnWidths(int[] widths, int targetLength)
        {
            if (widths.Length >= targetLength)
                return widths;

            if (widths.Length == 7 && targetLength == 8)
            {
                var defaults = DefaultTaskGridColumnWidths();
                return new[] { widths[0], widths[1], widths[2], widths[3], widths[4], widths[5], defaults[6], widths[6] };
            }

            return widths;
        }

        private static int GetMinColumnWidth(int columnIndex) => columnIndex switch
        {
            0 => 28,
            1 => 80,
            2 => 52,
            3 => 30,
            4 => 68,
            5 => 48,
            6 => 52,
            7 => 48,
            _ => 24
        };
    }
}
