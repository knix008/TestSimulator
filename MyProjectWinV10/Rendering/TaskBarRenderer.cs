using MyProject.Models;
using MyProject.Theme;
using System.Drawing.Drawing2D;

namespace MyProject.Rendering
{
    public class TaskBarRenderer
    {
        private readonly GanttViewport _viewport;

        public TaskBarRenderer(GanttViewport viewport)
        {
            _viewport = viewport;
        }

        public void DrawTaskBar(Graphics g, ProjectTask task, int rowY, bool isSelected, bool isHovered, string? assigneeText = null)
        {
            switch (task.TaskType)
            {
                case TaskType.Summary:
                    DrawSummaryBar(g, task, rowY, isSelected, assigneeText);
                    break;
                case TaskType.Milestone:
                    DrawMilestone(g, task, rowY, isSelected, isHovered, assigneeText);
                    break;
                default:
                    DrawNormalBar(g, task, rowY, isSelected, isHovered, assigneeText);
                    break;
            }
        }

        private void DrawNormalBar(Graphics g, ProjectTask task, int rowY, bool isSelected, bool isHovered, string? assigneeText)
        {
            int x = _viewport.DateToX(task.StartDate);
            int endX = _viewport.DateToX(task.EndDate.AddDays(1));
            int width = Math.Max(endX - x, 4);
            int barH = AppTheme.TaskBarHeight;
            int barY = rowY + (AppTheme.RowHeight - barH) / 2;

            var barRect = new Rectangle(x, barY, width, barH);
            Color barColor = task.BarColor != Color.Empty ? task.BarColor
                           : task.IsCritical ? AppTheme.TaskBarCritical
                           : AppTheme.TaskBarNormal;
            Color progressColor = task.ProgressColor != Color.Empty ? task.ProgressColor
                                : task.IsCritical ? AppTheme.TaskBarCriticalProgress
                                : AppTheme.TaskBarProgress;

            // Drop shadow
            using var shadowBrush = new SolidBrush(Color.FromArgb(30, 0, 0, 0));
            g.FillRoundedRectangle(shadowBrush, new Rectangle(barRect.X + 1, barRect.Y + 2, barRect.Width, barRect.Height), 3);

            // Bar background
            using var bgBrush = new LinearGradientBrush(barRect,
                LightenColor(barColor, 30), barColor, LinearGradientMode.Vertical);
            g.FillRoundedRectangle(bgBrush, barRect, 3);

            // Progress fill
            if (task.Progress > 0)
            {
                int progressWidth = (int)(width * task.Progress / 100.0);
                if (progressWidth > 0)
                {
                    var progressRect = new Rectangle(barRect.X, barRect.Y, progressWidth, barRect.Height);
                    using var progressBrush = new LinearGradientBrush(progressRect,
                        LightenColor(progressColor, 20), progressColor, LinearGradientMode.Vertical);
                    g.FillRoundedRectangle(progressBrush, progressRect, 3);

                    // Progress stripe
                    using var stripePen = new Pen(Color.FromArgb(40, 255, 255, 255), 1f);
                    for (int sx = progressRect.X; sx < progressRect.Right; sx += 6)
                        g.DrawLine(stripePen, sx, progressRect.Y, sx - 4, progressRect.Bottom);
                }
            }

            // Border
            Color borderColor = isSelected ? AppTheme.AccentDark
                             : isHovered ? LightenColor(barColor, -20)
                             : DarkenColor(barColor, 30);
            using var borderPen = new Pen(borderColor, isSelected ? 2f : 1f);
            g.DrawRoundedRectangle(borderPen, barRect, 3);

            // Selection glow
            if (isSelected)
            {
                using var glowPen = new Pen(Color.FromArgb(80, AppTheme.Accent), 4f);
                g.DrawRoundedRectangle(glowPen, new Rectangle(barRect.X - 1, barRect.Y - 1, barRect.Width + 2, barRect.Height + 2), 4);
            }

            // % label inside bar if wide enough
            if (width > 40 && task.Progress > 0)
            {
                using var textBrush = new SolidBrush(Color.FromArgb(200, 255, 255, 255));
                var label = $"{task.Progress:0}%";
                var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString(label, AppTheme.FontSmall, textBrush, barRect, sf);
            }

            DrawAssigneeLabel(g, barRect.Right, rowY, assigneeText);
        }

        private void DrawSummaryBar(Graphics g, ProjectTask task, int rowY, bool isSelected, string? assigneeText)
        {
            int x = _viewport.DateToX(task.StartDate);
            int endX = _viewport.DateToX(task.EndDate.AddDays(1));
            int width = Math.Max(endX - x, 4);
            int barH = AppTheme.TaskBarHeight - 4;
            int barY = rowY + (AppTheme.RowHeight - barH) / 2;

            var pts = new Point[]
            {
                new(x, barY + barH / 2),
                new(x, barY),
                new(x + width, barY),
                new(x + width, barY + barH / 2),
                new(x + width + 5, barY + barH),
                new(x + width + 5, barY + barH + 2),
                new(x + width, barY + barH),
                new(x, barY + barH),
                new(x - 5, barY + barH + 2),
                new(x - 5, barY + barH),
                new(x, barY + barH / 2)
            };

            using var brush = new SolidBrush(GetSummaryBarColor(task, isSelected));
            g.FillPolygon(brush, pts);

            if (task.Progress > 0)
            {
                int progressWidth = (int)(width * task.Progress / 100.0);
                Color progressColor = task.ProgressColor != Color.Empty ? task.ProgressColor : AppTheme.AccentLight;
                using var progressBrush = new SolidBrush(Color.FromArgb(180, progressColor));
                g.FillRectangle(progressBrush, x, barY + 2, progressWidth, barH - 4);
            }

            DrawAssigneeLabel(g, x + width + 5, rowY, assigneeText);
        }

        private void DrawMilestone(Graphics g, ProjectTask task, int rowY, bool isSelected, bool isHovered, string? assigneeText)
        {
            int cx = _viewport.DateToX(task.StartDate) + _viewport.DayWidth / 2;
            int cy = rowY + AppTheme.RowHeight / 2;
            int half = AppTheme.MilestoneSize / 2;

            var diamond = new Point[]
            {
                new(cx, cy - half),
                new(cx + half, cy),
                new(cx, cy + half),
                new(cx - half, cy)
            };

            using var shadowBrush = new SolidBrush(Color.FromArgb(40, 0, 0, 0));
            var shadowDiamond = diamond.Select(p => new Point(p.X + 1, p.Y + 2)).ToArray();
            g.FillPolygon(shadowBrush, shadowDiamond);

            using var brush = new SolidBrush(GetMilestoneColor(task, isSelected, isHovered));
            g.FillPolygon(brush, diamond);

            Color borderBase = task.BarColor != Color.Empty ? task.BarColor : AppTheme.TaskBarMilestone;
            using var pen = new Pen(DarkenColor(borderBase, 40), isSelected ? 2f : 1f);
            g.DrawPolygon(pen, diamond);

            if (isSelected)
            {
                using var glowPen = new Pen(Color.FromArgb(80, AppTheme.Accent), 3f);
                g.DrawPolygon(glowPen, diamond.Select(p => new Point(p.X, p.Y)).ToArray());
            }

            DrawAssigneeLabel(g, cx + half + 4, rowY, assigneeText);
        }

        private static void DrawAssigneeLabel(Graphics g, int textX, int rowY, string? assigneeText)
        {
            if (string.IsNullOrWhiteSpace(assigneeText)) return;

            var textRect = new Rectangle(textX, rowY, 140, AppTheme.RowHeight);
            using var brush = new SolidBrush(AppTheme.TextSecondary);
            var sf = new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter };
            g.DrawString(assigneeText, AppTheme.FontSmall, brush, textRect, sf);
        }

        private static Color GetSummaryBarColor(ProjectTask task, bool isSelected)
        {
            if (isSelected) return AppTheme.AccentDark;
            if (task.BarColor != Color.Empty) return task.BarColor;
            return AppTheme.TaskBarSummary;
        }

        private static Color GetMilestoneColor(ProjectTask task, bool isSelected, bool isHovered)
        {
            if (isSelected) return AppTheme.AccentDark;
            Color baseColor = task.BarColor != Color.Empty ? task.BarColor : AppTheme.TaskBarMilestone;
            return isHovered ? LightenColor(baseColor, 20) : baseColor;
        }

        public Rectangle GetTaskBarRect(ProjectTask task, int rowY)
        {
            if (task.TaskType == TaskType.Milestone)
            {
                int cx = _viewport.DateToX(task.StartDate) + _viewport.DayWidth / 2;
                int cy = rowY + AppTheme.RowHeight / 2;
                int half = AppTheme.MilestoneSize / 2 + 2;
                return new Rectangle(cx - half, cy - half, half * 2, half * 2);
            }

            int x = _viewport.DateToX(task.StartDate);
            int endX = _viewport.DateToX(task.EndDate.AddDays(1));
            int width = Math.Max(endX - x, 4);
            int barH = AppTheme.TaskBarHeight;
            int barY = rowY + (AppTheme.RowHeight - barH) / 2;
            return new Rectangle(x, barY, width, barH);
        }

        private static Color LightenColor(Color color, int amount)
        {
            return Color.FromArgb(color.A,
                Math.Clamp(color.R + amount, 0, 255),
                Math.Clamp(color.G + amount, 0, 255),
                Math.Clamp(color.B + amount, 0, 255));
        }

        private static Color DarkenColor(Color color, int amount) => LightenColor(color, -amount);
    }

    internal static class GraphicsExtensions
    {
        public static void FillRoundedRectangle(this Graphics g, Brush brush, Rectangle rect, int radius)
        {
            using var path = CreateRoundedPath(rect, radius);
            g.FillPath(brush, path);
        }

        public static void DrawRoundedRectangle(this Graphics g, Pen pen, Rectangle rect, int radius)
        {
            using var path = CreateRoundedPath(rect, radius);
            g.DrawPath(pen, path);
        }

        private static GraphicsPath CreateRoundedPath(Rectangle rect, int radius)
        {
            int d = radius * 2;
            var path = new GraphicsPath();
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
