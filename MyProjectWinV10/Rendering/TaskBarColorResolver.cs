using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Rendering
{
    public static class TaskBarColorResolver
    {
        public static void ResolveNormalBarColors(ProjectTask task, bool showCriticalPath, out Color barColor, out Color progressColor)
        {
            bool highlightCritical = showCriticalPath && task.IsCritical;
            barColor = !task.BarColor.IsEmpty ? task.BarColor
                     : highlightCritical ? AppTheme.TaskBarCritical
                     : AppTheme.TaskBarNormal;
            progressColor = !task.ProgressColor.IsEmpty ? task.ProgressColor
                          : highlightCritical ? AppTheme.TaskBarCriticalProgress
                          : AppTheme.TaskBarProgress;
        }

        public static Color GetSummaryBarColor(ProjectTask task, bool isSelected)
        {
            if (isSelected) return Color.FromArgb(40, 40, 40);
            if (!task.BarColor.IsEmpty) return task.BarColor;
            return Color.Black;
        }

        public static Color GetMilestoneColor(ProjectTask task, bool isSelected, bool isHovered = false)
        {
            if (isSelected) return AppTheme.AccentDark;
            Color baseColor = !task.BarColor.IsEmpty ? task.BarColor : AppTheme.TaskBarMilestone;
            return isHovered ? LightenColor(baseColor, 20) : baseColor;
        }

        public static Color GetSummaryProgressColor(ProjectTask task) =>
            !task.ProgressColor.IsEmpty ? task.ProgressColor : Color.FromArgb(90, 90, 90);

        public static void ResolveCalendarBarColors(
            ProjectTask task,
            bool showCriticalPath,
            bool isSelected,
            out Color barColor,
            out Color progressColor)
        {
            switch (task.TaskType)
            {
                case TaskType.Summary:
                    barColor = GetSummaryBarColor(task, isSelected);
                    progressColor = GetSummaryProgressColor(task);
                    break;
                case TaskType.Milestone:
                    barColor = GetMilestoneColor(task, isSelected);
                    progressColor = barColor;
                    break;
                default:
                    ResolveNormalBarColors(task, showCriticalPath, out barColor, out progressColor);
                    break;
            }
        }

        public static Color LightenColor(Color color, int amount) =>
            Color.FromArgb(
                color.A,
                Math.Clamp(color.R + amount, 0, 255),
                Math.Clamp(color.G + amount, 0, 255),
                Math.Clamp(color.B + amount, 0, 255));

        public static Color DarkenColor(Color color, int amount) => LightenColor(color, -amount);

        public static Color GetContrastTextColor(Color background)
        {
            return GetRelativeLuminance(background) > 0.55
                ? AppTheme.TextPrimary
                : Color.FromArgb(245, 255, 255, 255);
        }

        public static Color GetCalendarTaskTextColor(
            Rectangle barRect,
            Color barColor,
            Color progressColor,
            double progress)
        {
            if (progress <= 0 || barRect.Width <= 0)
                return GetContrastTextColor(barColor);

            int progressWidth = Math.Max(2, (int)(barRect.Width * Math.Clamp(progress, 0, 100) / 100.0));
            Color textBackground = progressWidth >= 12 ? progressColor : barColor;
            return GetContrastTextColor(textBackground);
        }

        private static double GetRelativeLuminance(Color color)
        {
            static double Channel(int value)
            {
                double srgb = value / 255.0;
                return srgb <= 0.03928
                    ? srgb / 12.92
                    : Math.Pow((srgb + 0.055) / 1.055, 2.4);
            }

            double r = Channel(color.R);
            double g = Channel(color.G);
            double b = Channel(color.B);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
    }
}
