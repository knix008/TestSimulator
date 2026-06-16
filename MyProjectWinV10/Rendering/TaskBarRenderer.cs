using MyProject.Models;
using MyProject.Theme;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace MyProject.Rendering
{
    public class TaskBarRenderer
    {
        private readonly GanttViewport _viewport;

        public bool ShowCriticalPath { get; set; }

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
            var barRect = GetBarBounds(task, rowY);
            int width = barRect.Width;
            int radius = GetTaskBarCornerRadius(barRect.Height);
            ResolveNormalBarColors(task, out Color barColor, out Color progressColor);

            using var shadowBrush = new SolidBrush(Color.FromArgb(30, 0, 0, 0));
            g.FillRoundedRectangle(shadowBrush, new Rectangle(barRect.X + 1, barRect.Y + 2, barRect.Width, barRect.Height), radius);

            using (var bgBrush = new LinearGradientBrush(barRect,
                LightenColor(barColor, 30), barColor, LinearGradientMode.Vertical))
                g.FillRoundedRectangle(bgBrush, barRect, radius);

            double progress = Math.Clamp(task.Progress, 0, 100);
            if (progress > 0)
            {
                int progressWidth = Math.Max(2, (int)(width * progress / 100.0));
                var progressRect = new Rectangle(barRect.X, barRect.Y, progressWidth, barRect.Height);
                using var barPath = GraphicsExtensions.CreateRoundedPath(barRect, radius);
                var state = g.Save();
                g.SetClip(barPath);
                using (var progressBrush = new LinearGradientBrush(progressRect,
                    LightenColor(progressColor, 20), progressColor, LinearGradientMode.Vertical))
                    g.FillRectangle(progressBrush, progressRect);

                using var stripePen = new Pen(Color.FromArgb(40, 255, 255, 255), 1f);
                for (int sx = progressRect.X; sx < progressRect.Right; sx += 6)
                    g.DrawLine(stripePen, sx, progressRect.Y, sx - 4, progressRect.Bottom);
                g.Restore(state);
            }

            Color borderColor = isSelected ? AppTheme.AccentDark
                             : isHovered ? LightenColor(barColor, -20)
                             : DarkenColor(barColor, 30);
            using var borderPen = new Pen(borderColor, isSelected ? 2f : 1f);
            g.DrawRoundedRectangle(borderPen, barRect, radius);

            if (isSelected)
            {
                using var glowPen = new Pen(Color.FromArgb(80, AppTheme.Accent), 4f);
                g.DrawRoundedRectangle(glowPen, new Rectangle(barRect.X - 1, barRect.Y - 1, barRect.Width + 2, barRect.Height + 2), radius + 1);
            }

            if (progress > 0)
                DrawProgressPercentLabel(g, barRect, progress, isSummaryBar: false);

            DrawAssigneeLabel(g, barRect.Right, rowY, assigneeText);
        }

        private void DrawSummaryBar(Graphics g, ProjectTask task, int rowY, bool isSelected, string? assigneeText)
        {
            var barRect = GetBarBounds(task, rowY);
            if (barRect.Width <= 0)
                return;

            Color summaryColor = GetSummaryBarColor(task, isSelected);

            using (var brush = new SolidBrush(summaryColor))
                g.FillRectangle(brush, barRect);

            double progress = Math.Clamp(task.Progress, 0, 100);
            if (progress > 0)
            {
                const int inset = 2;
                var inner = new Rectangle(
                    barRect.X + inset,
                    barRect.Y + inset,
                    Math.Max(1, barRect.Width - inset * 2),
                    Math.Max(1, barRect.Height - inset * 2));
                int progressWidth = Math.Max(2, (int)(inner.Width * progress / 100.0));
                var progressRect = new Rectangle(inner.X, inner.Y, progressWidth, inner.Height);
                Color progressColor = task.ProgressColor != Color.Empty ? task.ProgressColor : Color.FromArgb(90, 90, 90);
                using var progressBrush = new SolidBrush(progressColor);
                g.FillRectangle(progressBrush, progressRect);
            }

            using (var borderPen = new Pen(Color.Black, 1f))
                g.DrawRectangle(borderPen, barRect.X, barRect.Y, barRect.Width - 1, barRect.Height - 1);

            if (isSelected)
            {
                var selectionRect = new Rectangle(barRect.X - 1, barRect.Y - 1, barRect.Width + 2, barRect.Height + 2);
                using var glowPen = new Pen(AppTheme.Accent, 2f);
                g.DrawRectangle(glowPen, selectionRect);
            }

            if (progress > 0)
                DrawProgressPercentLabel(g, barRect, progress, isSummaryBar: true);

            DrawAssigneeLabel(g, barRect.Right, rowY, assigneeText);
        }

        private void DrawMilestone(Graphics g, ProjectTask task, int rowY, bool isSelected, bool isHovered, string? assigneeText)
        {
            int cx = _viewport.DateToX(task.StartDate) + _viewport.DayWidth / 2;
            int cy = GetBarTopY(rowY) + AppTheme.TaskBarHeight / 2;
            int half = AppTheme.TaskBarHeight / 2;

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

        private void ResolveNormalBarColors(ProjectTask task, out Color barColor, out Color progressColor)
        {
            bool highlightCritical = ShowCriticalPath && task.IsCritical;
            barColor = task.BarColor != Color.Empty ? task.BarColor
                     : highlightCritical ? AppTheme.TaskBarCritical
                     : AppTheme.TaskBarNormal;
            progressColor = task.ProgressColor != Color.Empty ? task.ProgressColor
                          : highlightCritical ? AppTheme.TaskBarCriticalProgress
                          : AppTheme.TaskBarProgress;
        }

        private static void DrawProgressPercentLabel(Graphics g, Rectangle barRect, double progress, bool isSummaryBar)
        {
            string label = $"{progress:0}%";
            Font font = AppTheme.FontSmall;
            const TextFormatFlags measureFlags = TextFormatFlags.SingleLine | TextFormatFlags.NoPadding;
            int textWidth = TextRenderer.MeasureText(g, label, font, new Size(int.MaxValue, barRect.Height), measureFlags).Width;
            const int pad = 6;

            int progressWidth = Math.Max(0, (int)(barRect.Width * progress / 100.0));
            var progressRect = new Rectangle(barRect.X, barRect.Y, progressWidth, barRect.Height);
            var remainderRect = new Rectangle(
                barRect.X + progressWidth,
                barRect.Y,
                Math.Max(0, barRect.Width - progressWidth),
                barRect.Height);

            Rectangle textRect;
            bool useLightText;
            bool alignNear;

            if (progressRect.Width >= textWidth + pad)
            {
                textRect = progressRect;
                useLightText = !isSummaryBar;
                alignNear = false;
            }
            else if (remainderRect.Width >= textWidth + pad)
            {
                textRect = remainderRect;
                useLightText = isSummaryBar;
                alignNear = false;
            }
            else
            {
                textRect = new Rectangle(barRect.Right + 3, barRect.Y, textWidth + 2, barRect.Height);
                useLightText = false;
                alignNear = true;
            }

            TextFormatFlags drawFlags = TextFormatFlags.SingleLine
                | TextFormatFlags.NoPadding
                | TextFormatFlags.VerticalCenter
                | TextFormatFlags.EndEllipsis
                | (alignNear ? TextFormatFlags.Left : TextFormatFlags.HorizontalCenter);

            Color textColor = useLightText ? Color.FromArgb(245, 255, 255, 255) : AppTheme.TextPrimary;
            Color shadowColor = useLightText ? Color.FromArgb(120, 0, 0, 0) : Color.FromArgb(140, 255, 255, 255);

            var shadowRect = new Rectangle(textRect.X, textRect.Y + 1, textRect.Width, textRect.Height);
            TextRenderer.DrawText(g, label, font, shadowRect, shadowColor, drawFlags);
            TextRenderer.DrawText(g, label, font, textRect, textColor, drawFlags);
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
            if (isSelected) return Color.FromArgb(40, 40, 40);
            if (task.BarColor != Color.Empty) return task.BarColor;
            return Color.Black;
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
                int cy = GetBarTopY(rowY) + AppTheme.TaskBarHeight / 2;
                int half = AppTheme.TaskBarHeight / 2 + 2;
                return new Rectangle(cx - half, cy - half, half * 2, half * 2);
            }

            return GetBarBounds(task, rowY);
        }

        private Rectangle GetBarSpan(ProjectTask task)
        {
            int x = _viewport.DateToX(task.StartDate);
            int endX = _viewport.DateToX(task.EndDate.AddDays(1));
            int width = Math.Max(endX - x, 4);
            return new Rectangle(x, 0, width, 0);
        }

        public static int GetTaskBarCornerRadius(int barHeight) =>
            Math.Max(2, Math.Min(barHeight / 2, 8));

        private static int GetBarTopY(int rowY) =>
            rowY + (AppTheme.RowHeight - AppTheme.TaskBarHeight) / 2;

        private Rectangle GetBarBounds(ProjectTask task, int rowY)
        {
            var span = GetBarSpan(task);
            return new Rectangle(span.Left, GetBarTopY(rowY), span.Width, AppTheme.TaskBarHeight);
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

        internal static GraphicsPath CreateRoundedPath(Rectangle rect, int radius)
        {
            radius = Math.Max(0, Math.Min(radius, Math.Min(rect.Width, rect.Height) / 2));
            var path = new GraphicsPath();
            if (radius == 0)
            {
                path.AddRectangle(rect);
                return path;
            }

            int d = radius * 2;
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
