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

            using var shadowBrush = new SolidBrush(Color.FromArgb(18, 0, 0, 0));
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

            Color borderColor = TaskBarColorResolver.GetBarBorderColor(barColor, isSelected, isHovered);
            using var borderPen = new Pen(borderColor, TaskBarColorResolver.BarBorderWidth(isSelected));
            g.DrawRoundedRectangle(borderPen, barRect, radius);

            if (isSelected)
            {
                using var glowPen = new Pen(Color.FromArgb(80, AppTheme.Accent), 4f);
                g.DrawRoundedRectangle(glowPen, new Rectangle(barRect.X - 1, barRect.Y - 1, barRect.Width + 2, barRect.Height + 2), radius + 1);
            }

            DrawProgressPercentLabel(g, barRect, progress, isSummaryBar: false);

            DrawAssigneeLabel(g, barRect.Right, rowY, assigneeText);
        }

        private void DrawSummaryBar(Graphics g, ProjectTask task, int rowY, bool isSelected, string? assigneeText)
        {
            var barRect = GetBarBounds(task, rowY);
            if (barRect.Width <= 0)
                return;

            Color summaryColor = GetSummaryBarColor(task, isSelected);
            double progress = Math.Clamp(task.Progress, 0, 100);

            switch (task.SummaryBarStyle)
            {
                case SummaryBarStyle.Rounded:
                    DrawSummaryBarRounded(g, task, barRect, summaryColor, progress, isSelected);
                    break;
                case SummaryBarStyle.Bracket:
                    DrawSummaryBarBracket(g, task, barRect, summaryColor, progress, isSelected);
                    break;
                case SummaryBarStyle.Arrow:
                    DrawSummaryBarArrow(g, task, barRect, summaryColor, progress, isSelected);
                    break;
                default:
                    DrawSummaryBarStandard(g, task, barRect, summaryColor, progress, isSelected);
                    break;
            }

            DrawProgressPercentLabel(g, barRect, progress, isSummaryBar: true);
            DrawAssigneeLabel(g, barRect.Right, rowY, assigneeText);
        }

        // Standard: classic rectangle with downward triangular end caps.
        private static void DrawSummaryBarStandard(Graphics g, ProjectTask task, Rectangle barRect,
            Color summaryColor, double progress, bool isSelected)
        {
            using (var brush = new SolidBrush(summaryColor))
                g.FillRectangle(brush, barRect);

            DrawSummaryProgressStrip(g, task, barRect, progress);

            using (var borderPen = new Pen(TaskBarColorResolver.GetStrongBarOutlineColor(), TaskBarColorResolver.BarBorderWidth(isSelected)))
                g.DrawRectangle(borderPen, barRect.X, barRect.Y, barRect.Width - 1, barRect.Height - 1);

            DrawSummaryEndCaps(g, barRect, summaryColor);

            if (isSelected)
            {
                var sel = new Rectangle(barRect.X - 1, barRect.Y - 1, barRect.Width + 2, barRect.Height + 2);
                using var glowPen = new Pen(AppTheme.Accent, 2f);
                g.DrawRectangle(glowPen, sel);
            }
        }

        // Rounded: rounded rectangle with gradient, same visual language as normal task bars.
        private void DrawSummaryBarRounded(Graphics g, ProjectTask task, Rectangle barRect,
            Color summaryColor, double progress, bool isSelected)
        {
            int radius = GetTaskBarCornerRadius(barRect.Height);

            using var shadowBrush = new SolidBrush(Color.FromArgb(18, 0, 0, 0));
            g.FillRoundedRectangle(shadowBrush, new Rectangle(barRect.X + 1, barRect.Y + 2, barRect.Width, barRect.Height), radius);

            using (var bgBrush = new LinearGradientBrush(barRect,
                LightenColor(summaryColor, 25), summaryColor, LinearGradientMode.Vertical))
                g.FillRoundedRectangle(bgBrush, barRect, radius);

            DrawSummaryProgressStrip(g, task, barRect, progress);

            Color borderColor = TaskBarColorResolver.GetSummaryBarBorderColor(summaryColor, isSelected);
            using var borderPen = new Pen(borderColor, TaskBarColorResolver.BarBorderWidth(isSelected));
            g.DrawRoundedRectangle(borderPen, barRect, radius);

            if (isSelected)
            {
                using var glowPen = new Pen(Color.FromArgb(80, AppTheme.Accent), 4f);
                g.DrawRoundedRectangle(glowPen, new Rectangle(barRect.X - 1, barRect.Y - 1, barRect.Width + 2, barRect.Height + 2), radius + 1);
            }
        }

        // Bracket: flat rectangle with square L-shaped bracket end caps at both ends.
        private static void DrawSummaryBarBracket(Graphics g, ProjectTask task, Rectangle barRect,
            Color summaryColor, double progress, bool isSelected)
        {
            using (var brush = new SolidBrush(summaryColor))
                g.FillRectangle(brush, barRect);

            DrawSummaryProgressStrip(g, task, barRect, progress);

            using (var borderPen = new Pen(TaskBarColorResolver.GetStrongBarOutlineColor(), TaskBarColorResolver.BarBorderWidth(isSelected)))
                g.DrawRectangle(borderPen, barRect.X, barRect.Y, barRect.Width - 1, barRect.Height - 1);

            // Bracket caps: vertical bars extending below bar at each end
            int capH = Math.Clamp(barRect.Height / 2, 3, 6);
            int capW = Math.Clamp(barRect.Height / 3, 2, 4);
            using var capBrush = new SolidBrush(DarkenColor(summaryColor, 40));
            using var capPen = new Pen(TaskBarColorResolver.GetStrongBarOutlineColor(), TaskBarColorResolver.BarBorderWidth(false));

            // Left bracket
            var leftCap = new Rectangle(barRect.Left, barRect.Bottom - 1, capW, capH);
            g.FillRectangle(capBrush, leftCap);
            g.DrawRectangle(capPen, leftCap);

            // Right bracket
            var rightCap = new Rectangle(barRect.Right - capW - 1, barRect.Bottom - 1, capW, capH);
            g.FillRectangle(capBrush, rightCap);
            g.DrawRectangle(capPen, rightCap);

            if (isSelected)
            {
                var sel = new Rectangle(barRect.X - 1, barRect.Y - 1, barRect.Width + 2, barRect.Height + 2);
                using var glowPen = new Pen(AppTheme.Accent, 2f);
                g.DrawRectangle(glowPen, sel);
            }
        }

        // Arrow: flat rectangle with a right-pointing chevron at the right end.
        private static void DrawSummaryBarArrow(Graphics g, ProjectTask task, Rectangle barRect,
            Color summaryColor, double progress, bool isSelected)
        {
            int arrowW = Math.Clamp(barRect.Height / 2, 4, 10);
            arrowW = Math.Min(arrowW, barRect.Width / 3);

            // Body (rectangle minus the arrow tip area)
            var bodyRect = new Rectangle(barRect.X, barRect.Y, barRect.Width - arrowW, barRect.Height);

            // Arrow polygon: body right edge + tip point
            int midY = barRect.Y + barRect.Height / 2;
            var arrowShape = new[]
            {
                new Point(barRect.X,               barRect.Y),
                new Point(barRect.Right - arrowW,  barRect.Y),
                new Point(barRect.Right,            midY),
                new Point(barRect.Right - arrowW,  barRect.Bottom),
                new Point(barRect.X,               barRect.Bottom),
            };

            using (var brush = new SolidBrush(summaryColor))
                g.FillPolygon(brush, arrowShape);

            DrawSummaryProgressStrip(g, task, barRect, progress);

            using (var borderPen = new Pen(TaskBarColorResolver.GetStrongBarOutlineColor(), TaskBarColorResolver.BarBorderWidth(isSelected)))
                g.DrawPolygon(borderPen, arrowShape);

            if (isSelected)
            {
                using var glowPen = new Pen(AppTheme.Accent, 2f);
                g.DrawPolygon(glowPen, arrowShape.Select(p => new Point(p.X, p.Y)).ToArray());
            }
        }

        private static void DrawSummaryProgressStrip(Graphics g, ProjectTask task, Rectangle barRect, double progress)
        {
            if (progress <= 0) return;
            int progressWidth = Math.Max(2, (int)(barRect.Width * progress / 100.0));
            var progressRect = new Rectangle(barRect.X, barRect.Y, progressWidth, barRect.Height);
            Color progressColor = TaskBarColorResolver.GetSummaryProgressColor(task);
            using var progressBrush = new SolidBrush(progressColor);
            g.FillRectangle(progressBrush, progressRect);
        }

        /// <summary>Inverted triangles hanging below the bar ends (Standard style only).</summary>
        private static void DrawSummaryEndCaps(Graphics g, Rectangle barRect, Color fillColor)
        {
            if (barRect.Width < 8 || barRect.Height < 6)
                return;

            int capWidth = Math.Clamp(barRect.Height / 2, 4, 7);
            int capHeight = Math.Clamp(barRect.Height / 3, 3, 5);
            capWidth = Math.Min(capWidth, barRect.Width / 2);

            int left = barRect.Left;
            int right = barRect.Right - 1;
            int bottom = barRect.Bottom - 1;

            using var brush = new SolidBrush(fillColor);

            g.FillPolygon(brush, new[]
            {
                new Point(left, bottom),
                new Point(left + capWidth, bottom),
                new Point(left, bottom + capHeight)
            });

            g.FillPolygon(brush, new[]
            {
                new Point(right - capWidth, bottom),
                new Point(right, bottom),
                new Point(right, bottom + capHeight)
            });
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

            using var shadowBrush = new SolidBrush(Color.FromArgb(24, 0, 0, 0));
            var shadowDiamond = diamond.Select(p => new Point(p.X + 1, p.Y + 2)).ToArray();
            g.FillPolygon(shadowBrush, shadowDiamond);

            using var brush = new SolidBrush(GetMilestoneColor(task, isSelected, isHovered));
            g.FillPolygon(brush, diamond);

            Color milestoneFill = GetMilestoneColor(task, isSelected, isHovered);
            using var pen = new Pen(
                TaskBarColorResolver.GetBarBorderColor(milestoneFill, isSelected, isHovered),
                TaskBarColorResolver.BarBorderWidth(isSelected));
            g.DrawPolygon(pen, diamond);

            if (isSelected)
            {
                using var glowPen = new Pen(Color.FromArgb(80, AppTheme.Accent), 3f);
                g.DrawPolygon(glowPen, diamond.Select(p => new Point(p.X, p.Y)).ToArray());
            }

            DrawAssigneeLabel(g, cx + half + 4, rowY, assigneeText);
        }

        private void ResolveNormalBarColors(ProjectTask task, out Color barColor, out Color progressColor) =>
            TaskBarColorResolver.ResolveNormalBarColors(task, ShowCriticalPath, out barColor, out progressColor);

        private static void DrawProgressPercentLabel(Graphics g, Rectangle barRect, double progress, bool isSummaryBar)
        {
            string label = $"{progress:0}%";
            Font font = AppTheme.FontSmall;

            // Use GDI+ measurement to avoid GetHdc() which corrupts alpha on ARGB export bitmaps
            SizeF measured = g.MeasureString(label, font, int.MaxValue, StringFormat.GenericTypographic);
            int textWidth = (int)Math.Ceiling(measured.Width) + 2;
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

            Color textColor  = useLightText ? Color.FromArgb(245, 255, 255, 255) : AppTheme.TextPrimary;
            Color shadowColor = useLightText ? Color.FromArgb(120, 0, 0, 0) : Color.FromArgb(140, 255, 255, 255);

            var drawSf = new StringFormat
            {
                Alignment     = alignNear ? StringAlignment.Near : StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                Trimming      = StringTrimming.EllipsisCharacter,
                FormatFlags   = StringFormatFlags.NoWrap
            };
            var shadowRect = new RectangleF(textRect.X, textRect.Y + 1, textRect.Width, textRect.Height);
            if (!alignNear)
            {
                using var shadowBrushLabel = new SolidBrush(shadowColor);
                g.DrawString(label, font, shadowBrushLabel, shadowRect, drawSf);
            }
            using (var textBrushLabel = new SolidBrush(textColor))
                g.DrawString(label, font, textBrushLabel, new RectangleF(textRect.X, textRect.Y, textRect.Width, textRect.Height), drawSf);
        }

        private static void DrawAssigneeLabel(Graphics g, int textX, int rowY, string? assigneeText)
        {
            if (string.IsNullOrWhiteSpace(assigneeText)) return;

            var textRect = new Rectangle(textX, rowY, 140, AppTheme.RowHeight);
            using var brush = new SolidBrush(AppTheme.TextSecondary);
            var sf = new StringFormat { LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter };
            g.DrawString(assigneeText, AppTheme.FontSmall, brush, textRect, sf);
        }

        private static Color GetSummaryBarColor(ProjectTask task, bool isSelected) =>
            TaskBarColorResolver.GetSummaryBarColor(task, isSelected);

        private static Color GetMilestoneColor(ProjectTask task, bool isSelected, bool isHovered) =>
            TaskBarColorResolver.GetMilestoneColor(task, isSelected, isHovered);

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

        private static Color LightenColor(Color color, int amount) =>
            TaskBarColorResolver.LightenColor(color, amount);

        private static Color DarkenColor(Color color, int amount) =>
            TaskBarColorResolver.DarkenColor(color, amount);
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
