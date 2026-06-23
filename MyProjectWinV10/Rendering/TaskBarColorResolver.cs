using MyProject.Models;
using MyProject.Theme;

namespace MyProject.Rendering
{
    public static class TaskBarColorResolver
    {
        private const double CustomColorPastelMix = 0.38;

        public static void ResolveNormalBarColors(ProjectTask task, bool showCriticalPath, out Color barColor, out Color progressColor)
        {
            bool highlightCritical = showCriticalPath && task.IsCritical;
            barColor = !task.BarColor.IsEmpty ? ToPastel(task.BarColor)
                     : highlightCritical ? AppTheme.TaskBarCritical
                     : AppTheme.TaskBarNormal;
            progressColor = !task.ProgressColor.IsEmpty ? ToPastel(task.ProgressColor)
                          : highlightCritical ? AppTheme.TaskBarCriticalProgress
                          : AppTheme.TaskBarProgress;
        }

        public static Color GetSummaryBarColor(ProjectTask task, bool isSelected)
        {
            Color baseColor = !task.BarColor.IsEmpty ? ToPastel(task.BarColor) : AppTheme.TaskBarSummary;
            return isSelected ? DarkenColor(baseColor, 16) : baseColor;
        }

        public static Color GetMilestoneColor(ProjectTask task, bool isSelected, bool isHovered = false)
        {
            if (isSelected) return AppTheme.AccentDark;
            Color baseColor = !task.BarColor.IsEmpty ? ToPastel(task.BarColor) : AppTheme.TaskBarMilestone;
            return isHovered ? LightenColor(baseColor, 14) : baseColor;
        }

        public static Color GetSummaryProgressColor(ProjectTask task) =>
            !task.ProgressColor.IsEmpty ? ToPastel(task.ProgressColor) : Color.FromArgb(158, 164, 178);

        public static Color GetBarBorderColor(Color fillColor, bool isSelected, bool isHovered = false)
        {
            if (isSelected)
                return AppTheme.AccentDark;

            int darken = isHovered ? 38 : 52;
            Color darkened = DarkenColor(fillColor, darken);
            return EnsureVisibleBorder(darkened);
        }

        public static Color GetSummaryBarBorderColor(Color summaryColor, bool isSelected) =>
            isSelected ? AppTheme.AccentDark : EnsureVisibleBorder(DarkenColor(summaryColor, 56));

        public static Color GetStrongBarOutlineColor() => Color.FromArgb(48, 52, 60);

        public static float BarBorderWidth(bool isSelected) => isSelected ? 2f : 1.35f;

        private static Color EnsureVisibleBorder(Color color)
        {
            int luminance = (color.R * 299 + color.G * 587 + color.B * 114) / 1000;
            if (luminance > 150)
                return Color.FromArgb(color.A, 98, 104, 116);

            return color;
        }

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

        public static Color ToPastel(Color color, double mix = CustomColorPastelMix)
        {
            mix = Math.Clamp(mix, 0, 1);
            return Color.FromArgb(
                color.A,
                (int)Math.Round(color.R + (255 - color.R) * mix),
                (int)Math.Round(color.G + (255 - color.G) * mix),
                (int)Math.Round(color.B + (255 - color.B) * mix));
        }

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
